// Выдаёт ключ для браузера от локально запущенного планера (npm run dev:local).
// Подписывает initData тестовым токеном из wrangler.local.toml и просит ключ у API.
// Использование: node scripts/devkey.mjs [порт] [user_id]
import crypto from 'node:crypto';

const port = process.argv[2] || '8787';
const userId = Number(process.argv[3] || 777);
const BOT_TOKEN = '12345:LOCAL-TEST-TOKEN';

const enc = new TextEncoder();
const params = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: 'devkey',
  user: JSON.stringify({ id: userId, first_name: 'Локальный тест' }),
});
const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dcs).digest('hex');
params.set('hash', hash);

const res = await fetch(`http://127.0.0.1:${port}/api/auth/telegram`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ initData: params.toString() }),
});
const data = await res.json();
if (!res.ok) {
  console.error('Ошибка:', data.error || res.status);
  process.exit(1);
}
console.log('\nКлюч для браузера (вставьте на экране входа или в Настройки → Ключ для браузера):\n');
console.log('  ' + data.key + '\n');
