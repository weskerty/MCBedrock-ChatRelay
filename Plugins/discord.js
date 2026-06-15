const redis = require('redis');

// ── Config ────────────────────────────────────────────────────────
const DISCORD_WEBHOOK_URL = '';

const REDIS_HOST     = '127.0.0.1';
const REDIS_PORT     = 6379;
const REDIS_PASSWORD = '';
const REDIS_CHANNEL  = 'endstone:chat';
// ─────────────────────────────────────────────────────────────────

const stripMinecraft = (str) =>
  (str || '').replace(/§[0-9a-fk-or]/gi, '');

const format = (data) => {
  switch (data.type) {
    case 'chat':      return `💬 **${stripMinecraft(data.player)}**: ${stripMinecraft(data.message)}`;
    case 'join':      return `🟢 ${stripMinecraft(data.message)}`;
    case 'quit':      return `🔴 ${stripMinecraft(data.message)}`;
    case 'death':     return `💀 ${stripMinecraft(data.message)}`;
    case 'broadcast': return `📢 ${stripMinecraft(data.message)}`;
    default:          return stripMinecraft(data.message);
  }
};

const send = async (content) => {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord: ${res.status} ${await res.text()}`);
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