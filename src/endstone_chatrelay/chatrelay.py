import json
import threading
import socket
import urllib.request
from pathlib import Path
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap
from endstone.plugin import Plugin
from endstone.event import (
    event_handler, EventPriority,
    PlayerChatEvent, PlayerJoinEvent, PlayerQuitEvent,
    PlayerDeathEvent, BroadcastMessageEvent,
)
from endstone.lang import Translatable

DEFAULT = {
    "telegram": {"token": "", "chat_id": ""},
    "discord":  {"webhook": ""},
    "tcp":      {"port": 0},
    "log":      True,
}

COMMENTS = {
    "telegram": "Telegram config — leave token empty to disable",
    "token":    "Bot token from @BotFather",
    "chat_id":  "Chat ID, use id/thread for topic groups e.g. -1001234567890/123",
    "discord":  "Discord config — leave webhook empty to disable",
    "webhook":  "Discord webhook URL",
    "tcp":      "TCP broadcast server — set port to 0 to disable",
    "port":     "Port to listen on, 0 = disabled",
    "log":      "Log relayed messages to server console",
}

SM = lambda s: __import__('re').sub(r'§[0-9a-fk-or]', '', s or '')

def _fmt_tg(d):
    esc = lambda s: (s or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    t = d.get('type','')
    if t == 'chat':      return f"💬 <b>{esc(d.get('player',''))}</b>: {esc(d.get('message',''))}"
    if t == 'join':      return f"🟢 {esc(SM(d.get('message','')))}"
    if t == 'quit':      return f"🔴 {esc(SM(d.get('message','')))}"
    if t == 'death':     return f"💀 {esc(SM(d.get('message','')))}"
    if t == 'broadcast': return f"📢 {esc(SM(d.get('message','')))}"
    return esc(SM(d.get('message','')))

def _fmt_dc(d):
    t = d.get('type','')
    if t == 'chat':      return f"💬 **{SM(d.get('player',''))}**: {SM(d.get('message',''))}"
    if t == 'join':      return f"🟢 {SM(d.get('message',''))}"
    if t == 'quit':      return f"🔴 {SM(d.get('message',''))}"
    if t == 'death':     return f"💀 {SM(d.get('message',''))}"
    if t == 'broadcast': return f"📢 {SM(d.get('message',''))}"
    return SM(d.get('message',''))

def _post(url, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        'Content-Type': 'application/json',
        'User-Agent':   'Mozilla/5.0',
    }, method='POST')
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


class TCPBroadcast:
    def __init__(self, port, logger):
        self._port    = port
        self._logger  = logger
        self._clients = set()
        self._lock    = threading.Lock()
        self._sock    = None

    def start(self):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind(('0.0.0.0', self._port))
        self._sock.listen(16)
        self._logger.info(f"TCP broadcast on :{self._port}")
        threading.Thread(target=self._accept, daemon=True).start()

    def stop(self):
        if self._sock:
            try: self._sock.close()
            except: pass
        with self._lock:
            for c in self._clients:
                try: c.close()
                except: pass
            self._clients.clear()

    def _accept(self):
        while True:
            try:
                conn, addr = self._sock.accept()
                with self._lock:
                    self._clients.add(conn)
                self._logger.info(f"TCP client {addr}")
                threading.Thread(target=self._watch, args=(conn,), daemon=True).start()
            except: break

    def _watch(self, conn):
        try:
            while conn.recv(1024): pass
        except: pass
        with self._lock:
            self._clients.discard(conn)
        try: conn.close()
        except: pass

    def broadcast(self, payload):
        line = (json.dumps(payload, ensure_ascii=False) + '\n').encode()
        with self._lock:
            dead = set()
            for c in self._clients:
                try: c.sendall(line)
                except: dead.add(c)
            self._clients -= dead


class ChatRelay(Plugin):
    api_version = "0.11"

    def on_enable(self):
        self._tg_token  = None
        self._tg_chat   = None
        self._tg_thread = None
        self._dc_hook   = None
        self._tcp       = None
        self._log       = True
        self._load_cfg()
        self.register_events(self)
        self.logger.info("ChatRelay enabled")

    def on_disable(self):
        if self._tcp: self._tcp.stop()
        self.logger.info("ChatRelay disabled")

    def _load_cfg(self):
        folder = Path(self.data_folder)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / "config.yml"
        yml = YAML()
        yml.preserve_quotes = True

        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                cfg = yml.load(f) or CommentedMap()
        else:
            cfg = CommentedMap()

        def _fill(dst, src):
            for k, v in src.items():
                if k not in dst:
                    dst[k] = CommentedMap(v) if isinstance(v, dict) else v
                elif isinstance(v, dict):
                    _fill(dst[k], v)
                if k in COMMENTS:
                    dst.yaml_add_eol_comment(COMMENTS[k], k)

        _fill(cfg, DEFAULT)
        with open(path, 'w', encoding='utf-8') as f:
            yml.dump(cfg, f)

        tok = (cfg.get('telegram') or {}).get('token', '').strip()
        cid = str((cfg.get('telegram') or {}).get('chat_id', '')).strip()
        if tok and cid:
            self._tg_token = tok
            if '/' in cid:
                parts = cid.split('/', 1)
                self._tg_chat   = parts[0]
                self._tg_thread = int(parts[1])
            else:
                self._tg_chat = cid
            self.logger.info(f"Telegram OK chat={self._tg_chat}")
        else:
            self.logger.info("Telegram disabled")

        hook = (cfg.get('discord') or {}).get('webhook', '').strip()
        if hook:
            self._dc_hook = hook
            self.logger.info("Discord OK")
        else:
            self.logger.info("Discord disabled")

        port = int((cfg.get('tcp') or {}).get('port', 0))
        if port:
            self._tcp = TCPBroadcast(port, self.logger)
            self._tcp.start()
        else:
            self.logger.info("TCP disabled")

        self._log = bool(cfg.get('log', True))

    def _send_tg(self, text):
        if not self._tg_token or not self._tg_chat: return
        payload = {'chat_id': self._tg_chat, 'text': text, 'parse_mode': 'HTML'}
        if self._tg_thread: payload['message_thread_id'] = self._tg_thread
        _post(f"https://api.telegram.org/bot{self._tg_token}/sendMessage", payload)

    def _send_dc(self, text):
        if not self._dc_hook: return
        _post(self._dc_hook, {'content': text})

    def _relay(self, payload):
        if self._log:
            self.logger.info(f"relay: {json.dumps(payload, ensure_ascii=False)}")
        def _task():
            if self._tcp: self._tcp.broadcast(payload)
            tg = _fmt_tg(payload)
            dc = _fmt_dc(payload)
            if tg:
                try: self._send_tg(tg)
                except Exception as e: self.logger.error(f"TG error: {e}")
            if dc:
                try: self._send_dc(dc)
                except Exception as e: self.logger.error(f"DC error: {e}")
        threading.Thread(target=_task, daemon=True).start()

    def _resolve(self, msg):
        if not msg: return ''
        if isinstance(msg, Translatable):
            return self.server.language.translate(str(msg.text), locale=self.server.language.locale, params=msg.params)
        return str(msg)

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_chat(self, e: PlayerChatEvent):
        self._relay({'type': 'chat', 'player': e.player.name, 'message': e.message})

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_join(self, e: PlayerJoinEvent):
        self._relay({'type': 'join', 'player': e.player.name, 'message': self._resolve(e.join_message)})

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_quit(self, e: PlayerQuitEvent):
        self._relay({'type': 'quit', 'player': e.player.name, 'message': self._resolve(e.quit_message)})

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_death(self, e: PlayerDeathEvent):
        self._relay({'type': 'death', 'player': e.player.name, 'message': self._resolve(e.death_message)})

    @event_handler(priority=EventPriority.MONITOR)
    def on_broadcast_message(self, e: BroadcastMessageEvent):
        self._relay({'type': 'broadcast', 'player': '', 'message': self._resolve(e.message)})