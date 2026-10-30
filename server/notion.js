// Notion: односторонний синк задач с датой в базу «Планер» (cron каждые 5 минут).
// Не больше 35 запросов к Notion за запуск, курсор по серверной ревизии.
import { json } from './util.js';
import { rowToTask } from './db.js';

const NOTION_VERSION = '2022-06-28';
const MAX_CALLS = 35;

async function notion(secret, method, path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Notion ${res.status}: ${data.message || 'ошибка'}`);
  return data;
}

// ID страницы/базы из любой ссылки Notion — последний блок из 32 hex-символов
export function extractNotionId(url) {
  const m = /([0-9a-f]{32})/i.exec(String(url || '').replace(/-/g, ''));
  return m ? m[1] : null;
}

export async function connectNotion(env, userId, secret, pageUrl) {
  if (!secret.startsWith('ntn_') && secret.length < 10) {
    return json({ error: 'Похоже, это не секрет интеграции (начинается с ntn_…)' }, 400);
  }
  const pageId = extractNotionId(pageUrl);
  if (!pageId) return json({ error: 'Не нашёл ID страницы в ссылке' }, 400);

  try {
    await notion(secret, 'GET', `/pages/${pageId}`);
  } catch (e) {
    return json({ error: `Страница недоступна для интеграции. Проверь Connections страницы. (${e.message})` }, 400);
  }

  let db;
  try {
    db = await notion(secret, 'POST', '/databases', {
      parent: { type: 'page_id', page_id: pageId },
      title: [{ type: 'text', text: { content: 'Планер' } }],
      properties: {
        'Задача': { title: {} },
        'Когда': { date: {} },
        'Готово': { checkbox: {} },
        'Сфера': { select: {} },
        'Минут': { number: { format: 'number' } },
        'Главное': { checkbox: {} },
      },
    });
  } catch (e) {
    return json({ error: `Не удалось создать базу «Планер»: ${e.message}` }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO secrets (user_id, notion_secret, notion_page, notion_db, cursor) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT (user_id) DO UPDATE SET notion_secret = ?, notion_page = ?, notion_db = ?, cursor = 0`,
  ).bind(userId, secret, pageId, db.id, secret, pageId, db.id).run();

  return json({ ok: true, database_id: db.id });
}

export async function disconnectNotion(env, userId) {
  await env.DB.prepare('DELETE FROM secrets WHERE user_id = ?').bind(userId).run();
  return json({ ok: true });
}

export async function notionStatus(env, userId) {
  const row = await env.DB.prepare('SELECT notion_db, cursor FROM secrets WHERE user_id = ?').bind(userId).first();
  return json({ connected: !!row?.notion_db, database_id: row?.notion_db || null, cursor: row?.cursor || 0 });
}

// ---------- cron ----------

export async function syncNotion(env) {
  const rows = await env.DB.prepare('SELECT * FROM secrets WHERE notion_db IS NOT NULL').all();
  for (const s of rows.results || []) {
    try {
      await syncUser(env, s);
    } catch (e) {
      console.error('notion sync:', e?.message);
    }
  }
}

async function syncUser(env, s) {
  let cursor = Number(s.cursor) || 0;
  const rows = await env.DB.prepare(
    'SELECT * FROM tasks WHERE user_id = ? AND date IS NOT NULL AND rev > ? ORDER BY rev LIMIT 35',
  ).bind(s.user_id, cursor).all();
  const list = (rows.results || []).map(rowToTask);
  let calls = 0;
  for (const t of list) {
    if (calls >= MAX_CALLS) break;
    try {
      if (t.deleted) {
        const map = await env.DB.prepare('SELECT page_id FROM notion_map WHERE user_id = ? AND task_id = ?')
          .bind(s.user_id, t.id).first();
        if (map) {
          await notion(s.notion_secret, 'PATCH', `/pages/${map.page_id}`, { archived: true });
          calls++;
        }
      } else {
        await upsertPage(env, s, t);
        calls++;
      }
    } catch (e) {
      console.error('notion task:', e?.message);
      break; // курсор не двигаем — повторим на следующем запуске
    }
    cursor = Math.max(cursor, Number(t.rev) || 0);
  }
  if (cursor > (Number(s.cursor) || 0)) {
    await env.DB.prepare('UPDATE secrets SET cursor = ? WHERE user_id = ?').bind(cursor, s.user_id).run();
  }
}

async function upsertPage(env, s, t) {
  const props = {
    'Задача': { title: [{ text: { content: t.title || 'Без названия' } }] },
    'Когда': { date: { start: t.time ? `${t.date}T${t.time}:00` : t.date } },
    'Готово': { checkbox: !!t.done },
    'Главное': { checkbox: !!t.frog },
  };
  if (t.area) props['Сфера'] = { select: { name: t.area } };
  if (t.duration_min > 0) props['Минут'] = { number: t.duration_min };

  const map = await env.DB.prepare('SELECT page_id FROM notion_map WHERE user_id = ? AND task_id = ?')
    .bind(s.user_id, t.id).first();
  if (map) {
    await notion(s.notion_secret, 'PATCH', `/pages/${map.page_id}`, { properties: props, archived: false });
  } else {
    const page = await notion(s.notion_secret, 'POST', '/pages', {
      parent: { type: 'database_id', database_id: s.notion_db },
      properties: props,
    });
    if (page?.id) {
      await env.DB.prepare('INSERT INTO notion_map (user_id, task_id, page_id) VALUES (?, ?, ?)')
        .bind(s.user_id, t.id, page.id).run();
    }
  }
}
