// Общие утилиты сервера: JSON-ответы, криптография, время (Europe/Moscow)

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const enc = new TextEncoder();

async function hmacKeyBytes(keyStr) {
  const raw = await crypto.subtle.importKey(
    'raw', enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return raw;
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(keyStr, msgStr) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msgStr));
  return toHex(sig);
}

export async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return toHex(d);
}

// Сравнение без раскрытия времени несовпадения
export function safeEqual(a, b) {
  const A = String(a ?? '');
  const B = String(b ?? '');
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return diff === 0;
}

export function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function fmtDateRu(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return String(dateStr || '');
  return `${Number(m[3])} ${MONTHS_GEN[Number(m[2]) - 1]}`;
}

// Текущие дата/время в Europe/Moscow: {date:'YYYY-MM-DD', time:'HH:MM', minutes, dow:1..7 (Пн=1)}
export function moscowNow() {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  const [date, time] = s.split(' ');
  const [h, m] = time.split(':').map(Number);
  // день недели в Москве
  const noonUtc = Date.parse(`${date}T12:00:00Z`);
  const jsDow = new Date(noonUtc).getUTCDay(); // 0=вс
  const dow = jsDow === 0 ? 7 : jsDow;
  return { date, time, minutes: h * 60 + m, dow };
}

export function nowISO() {
  return new Date().toISOString();
}

// ---------- Telegram Bot API ----------

export async function tgApi(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  }
  return data;
}

// Секрет вебхука выводится из токена бота хешем
export async function webhookSecret(botToken) {
  return sha256Hex(`webhook:${String(botToken).trim()}`);
}
