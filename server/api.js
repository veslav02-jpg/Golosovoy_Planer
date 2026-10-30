// API-роуты Worker'а. Все запросы /api/* попадают сюда (run_worker_first).
import { ensureSchema, nextRev, rowToTask, rowToItem } from './db.js';
import { authenticate, verifyInitData, getOrCreateKey } from './auth.js';
import { json, nowISO, tgApi, webhookSecret } from './util.js';
import { handleWebhook } from './bot.js';
import { connectNotion, disconnectNotion, notionStatus } from './notion.js';

const TASK_KINDS = ['habit', 'habit_log', 'day', 'note', 'area', 'plan', 'goal', 'tactic', 'tactic_log', 'settings'];
const ITEM_KINDS = TASK_KINDS;

export async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health' && method === 'GET') {
    return json({ ok: true });
  }

  await ensureSchema(env);

  if (path === '/api/auth/telegram' && method === 'POST') {
    return authTelegram(request, env);
  }

  if (path === '/api/telegram/webhook' && method === 'POST') {
    return handleWebhook(request, env, ctx);
  }

  const auth = await authenticate(request, env);
  if (!auth) return json({ error: 'unauthorized' }, 401);
  const userId = auth.userId;

  if (path === '/api/me' && method === 'GET') {
    const row = await env.DB.prepare('SELECT user_id, name FROM keys WHERE user_id = ?').bind(userId).first();
    return json({ user: { id: userId, name: row?.name || '' } });
  }

  if (path === '/api/tasks/sync' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return syncTasks(env, userId, Array.isArray(body.tasks) ? body.tasks : []);
  }

  if (path === '/api/items/sync' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return syncItems(env, userId, Array.isArray(body.items) ? body.items : []);
  }

  if (path === '/api/pull' && method === 'GET') {
    return pull(env, userId, url);
  }

  if (path === '/api/telegram/setup' && method === 'POST') {
    return telegramSetup(request, env);
  }

  if (path === '/api/notion/connect' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return connectNotion(env, userId, String(body.secret || ''), String(body.page || ''));
  }

  if (path === '/api/notion/disconnect' && method === 'POST') {
    return disconnectNotion(env, userId);
  }

  if (path === '/api/notion/status' && method === 'GET') {
    return notionStatus(env, userId);
  }

  return json({ error: 'not found' }, 404);
}

// ---------- авторизация через Telegram Mini App ----------

async function authTelegram(request, env) {
  if (!env.BOT_TOKEN) return json({ error: 'BOT_TOKEN не настроен на сервере' }, 500);
  const body = await request.json().catch(() => ({}));
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user) return json({ error: 'Подпись Telegram не прошла проверку' }, 401);
  const userId = String(user.id);
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const key = await getOrCreateKey(env, userId, name);
  return json({ key, user: { id: userId, name, username: user.username || '' } });
}

// ---------- нормализация записей ----------

function strOrNull(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, max);
}

function jsonField(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string') {
    try { JSON.parse(v); return v; } catch { return null; }
  }
  return null;
}

function normTask(t, userId) {
  if (!t || typeof t !== 'object') return null;
  const id = strOrNull(t.id, 64);
  if (!id) return null;
  return {
    id,
    user_id: userId,
    title: String(t.title ?? '').slice(0, 500),
    date: strOrNull(t.date, 10),
    time: strOrNull(t.time, 5),
    slot: ['morning', 'afternoon', 'evening', 'anytime'].includes(t.slot) ? t.slot : (t.slot ? 'anytime' : null),
    duration_min: Math.max(0, Math.min(1440, Number(t.duration_min) || 0)),
    area: strOrNull(t.area, 100),
    priority: Math.min(3, Math.max(1, Number(t.priority) || 2)),
    note: strOrNull(t.note, 2000),
    deep: t.deep ? 1 : 0,
    frog: t.frog ? 1 : 0,
    repeat: jsonField(t.repeat),
    checklist: jsonField(t.checklist),
    done: t.done ? 1 : 0,
    deleted: t.deleted ? 1 : 0,
    source: ['app', 'voice', 'api'].includes(t.source) ? t.source : 'app',
    created_at: strOrNull(t.created_at, 40) || nowISO(),
    updated_at: strOrNull(t.updated_at, 40) || nowISO(),
  };
}

function normItem(i, userId) {
  if (!i || typeof i !== 'object') return null;
  const id = strOrNull(i.id, 120);
  if (!id || !ITEM_KINDS.includes(i.kind)) return null;
  return {
    id,
    user_id: userId,
    kind: i.kind,
    data: jsonField(i.data),
    deleted: i.deleted ? 1 : 0,
    updated_at: strOrNull(i.updated_at, 40) || nowISO(),
  };
}

const TASK_COLS = ['id', 'user_id', 'title', 'date', 'time', 'slot', 'duration_min', 'area', 'priority', 'note', 'deep', 'frog', 'repeat', 'checklist', 'done', 'deleted', 'source', 'created_at', 'updated_at', 'rev'];
const ITEM_COLS = ['id', 'user_id', 'kind', 'data', 'deleted', 'updated_at', 'rev'];

async function insertRecord(env, table, cols, rec) {
  const withRev = { ...rec, rev: await nextRev(env, rec.user_id) };
  const names = cols.filter((c) => withRev[c] !== undefined);
  await env.DB.prepare(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
  ).bind(...names.map((c) => withRev[c])).run();
  return withRev;
}

async function updateRecord(env, table, cols, rec) {
  const withRev = { ...rec, rev: await nextRev(env, rec.user_id) };
  const sets = cols.filter((c) => withRev[c] !== undefined && c !== 'id' && c !== 'user_id');
  await env.DB.prepare(
    `UPDATE ${table} SET ${sets.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ? AND id = ?`,
  ).bind(...sets.map((c) => withRev[c]), rec.user_id, rec.id).run();
  return withRev;
}

// ---------- синк: last-write-wins по updated_at, серверная ревизия ----------

async function syncTasks(env, userId, incoming) {
  const out = [];
  for (const raw of incoming.slice(0, 200)) {
    const rec = normTask(raw, userId);
    if (!rec) continue;
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE user_id = ? AND id = ?')
      .bind(userId, rec.id).first();
    let saved;
    if (!existing) {
      saved = await insertRecord(env, 'tasks', TASK_COLS, rec);
    } else if (Date.parse(existing.updated_at || '') >= Date.parse(rec.updated_at || '')) {
      saved = rowToTask(existing);
    } else {
      saved = await updateRecord(env, 'tasks', TASK_COLS, rec);
    }
    out.push(rowToTask(saved));
  }
  return json({ records: out });
}

async function syncItems(env, userId, incoming) {
  const out = [];
  for (const raw of incoming.slice(0, 200)) {
    const rec = normItem(raw, userId);
    if (!rec) continue;
    const existing = await env.DB.prepare('SELECT * FROM items WHERE user_id = ? AND id = ?')
      .bind(userId, rec.id).first();
    let saved;
    if (!existing) {
      saved = await insertRecord(env, 'items', ITEM_COLS, rec);
    } else if (Date.parse(existing.updated_at || '') >= Date.parse(rec.updated_at || '')) {
      saved = rowToItem(existing);
    } else {
      saved = await updateRecord(env, 'items', ITEM_COLS, rec);
    }
    out.push(rowToItem(saved));
  }
  return json({ records: out });
}

// ---------- pull: по серверной ревизии, а не по часам клиента ----------

async function pull(env, userId, url) {
  const since = Math.max(0, Number.parseInt(url.searchParams.get('since') || '0', 10) || 0);
  const tasks = await env.DB.prepare('SELECT * FROM tasks WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT 500')
    .bind(userId, since).all();
  const items = await env.DB.prepare('SELECT * FROM items WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT 500')
    .bind(userId, since).all();
  let rev = since;
  for (const r of tasks.results) rev = Math.max(rev, Number(r.rev) || 0);
  for (const r of items.results) rev = Math.max(rev, Number(r.rev) || 0);
  return json({
    tasks: tasks.results.map(rowToTask),
    items: items.results.map(rowToItem),
    rev,
  });
}

// ---------- настройка Telegram-бота из приложения ----------

async function telegramSetup(request, env) {
  if (!env.BOT_TOKEN) return json({ error: 'BOT_TOKEN не настроен на сервере' }, 500);
  const origin = new URL(request.url).origin;
  const secret = await webhookSecret(env.BOT_TOKEN);
  const calls = [
    ['setWebhook', { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message'] }],
    ['setChatMenuButton', { menu_button: { type: 'web_app', text: 'Планер', web_app: { url: origin } } }],
    ['setMyCommands', { commands: [
      { command: 'start', description: 'Открыть планер' },
      { command: 'add', description: 'Добавить задачу текстом' },
    ] }],
  ];
  const results = [];
  for (const [method, payload] of calls) {
    try {
      const res = await tgApi(env.BOT_TOKEN, method, payload);
      results.push({ method, ok: !!res.ok });
    } catch (e) {
      results.push({ method, ok: false, error: e?.message });
    }
  }
  return json({ ok: results.every((r) => r.ok), results, origin });
}
