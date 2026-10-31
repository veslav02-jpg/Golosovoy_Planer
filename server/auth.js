// Авторизация:
//  - Mini App: initData от Telegram, HMAC-проверка по токену бота → персональный ключ
//  - Браузер/PWA: тот же ключ (вставляется один раз из настроек Mini App)
//  - Внешние автоматизации: X-Service-Key + X-Telegram-User-Id
import { safeEqual, randomKey, nowISO } from './util.js';
import { ensureSchema } from './db.js';

export async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const token = String(botToken).trim(); // защита от пробела/переноса при вставке секрета
  const fields = [];
  let hash = null;
  for (const chunk of String(initData).split('&')) {
    if (!chunk) continue;
    const eq = chunk.indexOf('=');
    const key = eq === -1 ? chunk : chunk.slice(0, eq);
    const rawVal = eq === -1 ? '' : chunk.slice(eq + 1);
    let val;
    try {
      val = decodeURIComponent(rawVal);
    } catch {
      val = rawVal;
    }
    if (key === 'hash') hash = val;
    else fields.push([key, val]);
  }
  if (!hash) return null;

  // data-check-string: все поля, кроме hash, отсортированные по имени.
  // Новые клиенты присылают ещё и signature — принимаем оба соглашения:
  // подпись считается и с signature в строке, и без него.
  fields.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dcsAll = fields.map(([k, v]) => `${k}=${v}`).join('\n');
  const dcsNoSig = fields.filter(([k]) => k !== 'signature').map(([k, v]) => `${k}=${v}`).join('\n');
  const withSig = await hmacWebAppData(dcsAll, token);
  const withoutSig = await hmacWebAppData(dcsNoSig, token);
  if (!safeEqual(withSig, hash) && !safeEqual(withoutSig, hash)) return null;

  try {
    const userField = fields.find(([k]) => k === 'user');
    const user = JSON.parse(userField ? userField[1] : 'null');
    if (!user || !user.id) return null;
    return user;
  } catch {
    return null;
  }
}

async function hmacWebAppData(msg, botToken) {
  const enc = new TextEncoder();
  const secret = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const key = await crypto.subtle.importKey(
    'raw', await crypto.subtle.sign('HMAC', secret, enc.encode(botToken)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Возвращает {userId} или null
export async function authenticate(request, env) {
  await ensureSchema(env);
  let key = request.headers.get('X-Auth-Key');
  const auth = request.headers.get('Authorization');
  if (!key && auth && auth.startsWith('Bearer ')) key = auth.slice(7);
  if (key) {
    const row = await env.DB.prepare('SELECT user_id FROM keys WHERE key = ?').bind(key).first();
    if (row) return { userId: row.user_id };
  }
  const serviceKey = request.headers.get('X-Service-Key');
  const tgUser = request.headers.get('X-Telegram-User-Id');
  if (serviceKey && tgUser && env.SERVICE_KEY && safeEqual(env.SERVICE_KEY, serviceKey)) {
    return { userId: String(tgUser) };
  }
  return null;
}

export async function getOrCreateKey(env, userId, name) {
  const existing = await env.DB.prepare('SELECT key FROM keys WHERE user_id = ?').bind(userId).first();
  if (existing) {
    if (name) {
      await env.DB.prepare('UPDATE keys SET name = ? WHERE user_id = ?').bind(name, userId).run();
    }
    return existing.key;
  }
  const key = randomKey();
  await env.DB.prepare('INSERT INTO keys (user_id, key, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, key, name || null, nowISO()).run();
  return key;
}
