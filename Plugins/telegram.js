const redis = require('redis');

// ── Config ────────────────────────────────────────────────────────
const TELEGRAM_TOKEN     = 'BOT:TOKEN';
const TELEGRAM_CHAT_ID   = '-100 GROUP ID';
const TELEGRAM_THREAD_ID = GROUP THREAD; 
// data in share message or 
// in Telegram > info group > info thread, on link share. 

const REDIS_HOST     = '127.0.0.1';
const REDIS_PORT     = 6379;
const REDIS_PASSWORD = '';
const REDIS_CHANNEL  = 'endstone:chat';
// ─────────────────────────────────────────────────────────────────

const esc = (str) =>
  (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const format = (data) => {
  switch (data.type) {
    case 'chat':      return `💬 <b>${esc(data.player)}</b>: ${esc(data.message)}`;
    case 'join':      return `🟢 ${esc(data.message)}`;
    case 'quit':      return `🔴 ${esc(data.message)}`;
    case 'death':     return `💀 ${esc(data.message)}`;
    case 'broadcast': return `📢 ${esc(data.message)}`;
    default:          return esc(data.message);
  }
};

const send = async (text) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      message_thread_id: TELEGRAM_THREAD_ID,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${data.description}`);
};

const start = async () => {
  const client = redis.createClient({
    socket: { host: REDIS_HOST, port: REDIS_PORT },
    password: REDIS_PASSWORD,
  });

  client.on('error', (e) => console.error('[Redis] error:', e.message));

  await client.connect();
  console.log(`[Redis] conectado a ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`[Redis] suscrito a canal: ${REDIS_CHANNEL}`);

  await client.subscribe(REDIS_CHANNEL, async (raw) => {
    try {
      const data = JSON.parse(raw);
      console.log(`[msg] ${raw}`);
      const text = format(data);
      if (text) await send(text);
    } catch (e) {
      console.error('[error]', e.message);
    }
  });
};

start().catch((e) => {
  console.error('[fatal]', e.message);
  process.exit(1);
});