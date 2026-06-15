import json
import threading
from pathlib import Path

from endstone.event import (
    EventPriority,
    BroadcastMessageEvent,
    PlayerChatEvent,
    PlayerDeathEvent,
    PlayerJoinEvent,
    PlayerQuitEvent,
    event_handler,
)
from endstone.lang import Translatable
from endstone.plugin import Plugin
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap


DEFAULT_CONFIG = {
    "redis": {
        "host": "127.0.0.1",
        "port": 6379,
        "password": "",
        "channel": "endstone:chat",
    },
    "log_messages": True,
}

COMMENTS = {
    "redis":        "Redis/Valkey connection settings",
    "host":         "hostname or IP",
    "port":         "port number",
    "password":     "leave empty if no auth",
    "channel":      "Redis pub/sub channel name",
    "log_messages": "log every published message to the server console",
}


class ChatBridge(Plugin):
    api_version = "0.11"

    def on_enable(self) -> None:
        self._redis = None
        self._cfg = {}
        self._load_config()
        self._connect_redis()
        if self._redis:
            self.register_events(self)

    def on_disable(self) -> None:
        if self._redis:
            try:
                self._redis.close()
            except Exception:
                pass
        self.logger.info("[ChatBridge] disabled.")

    def _load_config(self) -> None:
        folder = Path(self.data_folder)
        folder.mkdir(parents=True, exist_ok=True)
        cfg_path = folder / "config.yml"

        yml = YAML()
        yml.version = (1, 2)
        yml.preserve_quotes = True

        if cfg_path.exists():
            with open(cfg_path, "r", encoding="utf-8") as f:
                existing = yml.load(f) or CommentedMap()
        else:
            existing = CommentedMap()

        # Fill in missing keys from defaults
        def _fill(target, source):
            for k, v in source.items():
                if k not in target:
                    target[k] = CommentedMap(v) if isinstance(v, dict) else v
                elif isinstance(v, dict):
                    _fill(target[k], v)
                if k in COMMENTS:
                    target.yaml_add_eol_comment(COMMENTS[k], k)

        _fill(existing, DEFAULT_CONFIG)

        with open(cfg_path, "w", encoding="utf-8") as f:
            yml.dump(existing, f)

        # Flatten into a plain dict for easy access
        self._cfg = {
            "host":         existing["redis"]["host"],
            "port":         int(existing["redis"]["port"]),
            "password":     existing["redis"]["password"] or None,
            "channel":      existing["redis"]["channel"],
            "log_messages": bool(existing.get("log_messages", True)),
        }

    def _connect_redis(self) -> None:
        try:
            import redis
            client = redis.Redis(
                host=self._cfg["host"],
                port=self._cfg["port"],
                password=self._cfg["password"],
                decode_responses=True,
                socket_connect_timeout=5,
            )
            client.ping()
            self._redis = client
            self.logger.info(
                f"[ChatBridge] Connected to Redis/Valkey at "
                f"{self._cfg['host']}:{self._cfg['port']} — "
                f"channel: {self._cfg['channel']}"
            )
        except ImportError:
            self.logger.error("[ChatBridge] 'redis' package not installed. Run: pip install redis")
        except Exception as e:
            self.logger.error(f"[ChatBridge] Could not connect to Redis/Valkey: {e}")

    def _publish(self, payload: dict) -> None:
        if not self._redis:
            return

        def _task():
            try:
                msg = json.dumps(payload, ensure_ascii=False)
                self._redis.publish(self._cfg["channel"], msg)
                if self._cfg["log_messages"]:
                    self.logger.info(f"[ChatBridge] published: {msg}")
            except Exception as e:
                self.logger.error(f"[ChatBridge] publish error: {e}")

        threading.Thread(target=_task, daemon=True).start()

    def _resolve(self, message) -> str:
        if not message:
            return ""
        if isinstance(message, Translatable):
            return self.server.language.translate(
                str(message.text),
                locale=self.server.language.locale,
                params=message.params,
            )
        return str(message)

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_chat(self, event: PlayerChatEvent) -> None:
        self._publish({
            "type": "chat",
            "player": event.player.name,
            "message": event.message,
        })

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_join(self, event: PlayerJoinEvent) -> None:
        self._publish({
            "type": "join",
            "player": event.player.name,
            "message": self._resolve(event.join_message),
        })

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_quit(self, event: PlayerQuitEvent) -> None:
        self._publish({
            "type": "quit",
            "player": event.player.name,
            "message": self._resolve(event.quit_message),
        })

    @event_handler(priority=EventPriority.MONITOR)
    def on_player_death(self, event: PlayerDeathEvent) -> None:
        self._publish({
            "type": "death",
            "player": event.player.name,
            "message": self._resolve(event.death_message),
        })

    @event_handler(priority=EventPriority.MONITOR)
    def on_broadcast_message(self, event: BroadcastMessageEvent) -> None:
        self._publish({
            "type": "broadcast",
            "player": "",
            "message": self._resolve(event.message),
        })
