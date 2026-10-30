// Схема D1 создаётся кодом при первом запросе.
// Новые колонки добавляются через ALTER TABLE (ошибка «duplicate column» игнорируется).

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    date TEXT,
    time TEXT,
    slot TEXT,
    duration_min INTEGER NOT NULL DEFAULT 0,
    area TEXT,
    priority INTEGER NOT NULL DEFAULT 2,
    note TEXT,
    deep INTEGER NOT NULL DEFAULT 0,
    frog INTEGER NOT NULL DEFAULT 0,
    repeat TEXT,
    checklist TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'app',
    created_at TEXT,
    updated_at TEXT,
    rev INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    rev INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS seq (
    user_id TEXT PRIMARY KEY,
    rev INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS keys (
    user_id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    name TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS secrets (
    user_id TEXT PRIMARY KEY,
    notion_secret TEXT,
    notion_page TEXT,
    notion_db TEXT,
    cursor INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS notion_map (
    user_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    PRIMARY KEY (user_id, task_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_rev ON tasks (user_id, rev)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks (user_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_items_user_kind ON items (user_id, kind)`,
  `CREATE INDEX IF NOT EXISTS idx_items_user_rev ON items (user_id, rev)`,
];

// Сюда добавлять новые колонки при миграциях: [таблица, имя, SQL-тип]
const MIGRATION_COLUMNS = [
  ['tasks', 'subtasks', 'TEXT'],
];

const readyMap = new WeakMap();

export function ensureSchema(env) {
  if (!readyMap.has(env)) {
    readyMap.set(env, init(env).catch((e) => { readyMap.delete(env); throw e; }));
  }
  return readyMap.get(env);
}

async function init(env) {
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  for (const [table, col, type] of MIGRATION_COLUMNS) {
    try {
      await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
    } catch { /* колонка уже есть */ }
  }
}

// Глобальная серверная ревизия пользователя — только вперёд
export async function nextRev(env, userId) {
  const r = await env.DB.prepare(
    'INSERT INTO seq (user_id, rev) VALUES (?, 1) ON CONFLICT (user_id) DO UPDATE SET rev = rev + 1 RETURNING rev',
  ).bind(userId).first();
  return Number(r.rev);
}

export function rowToTask(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    date: r.date,
    time: r.time,
    slot: r.slot,
    duration_min: Number(r.duration_min) || 0,
    area: r.area,
    priority: Number(r.priority) || 2,
    note: r.note,
    deep: !!Number(r.deep),
    frog: !!Number(r.frog),
    repeat: safeJson(r.repeat),
    checklist: safeJson(r.checklist),
    done: !!Number(r.done),
    deleted: !!Number(r.deleted),
    source: r.source,
    created_at: r.created_at,
    updated_at: r.updated_at,
    rev: Number(r.rev) || 0,
  };
}

export function rowToItem(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    kind: r.kind,
    data: safeJson(r.data),
    deleted: !!Number(r.deleted),
    updated_at: r.updated_at,
    rev: Number(r.rev) || 0,
  };
}

function safeJson(s) {
  if (s == null || s === '') return null;
  try { return JSON.parse(s); } catch { return null; }
}
