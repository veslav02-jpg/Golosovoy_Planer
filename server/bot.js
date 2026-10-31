// Telegram-бот в том же Worker:
//  - вебхук с секретом, ответ Telegram'у сразу, обработка в ctx.waitUntil
//  - голос: getFile → скачать → base64 → Whisper (language ru)
//  - текст: Llama 3.3 в JSON-режиме по схеме {tasks[], summary}
import { json, bufToB64, fmtDateRu, moscowNow, tgApi, webhookSecret, safeEqual, randomKey, nowISO } from './util.js';
import { nextRev } from './db.js';
import { getOrCreateKey } from './auth.js';

const WHISPER = '@cf/openai/whisper-large-v3-turbo';
const LLAMA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function handleWebhook(request, env, ctx) {
  if (!env.BOT_TOKEN) return json({ error: 'BOT_TOKEN не настроен' }, 500);
  const secret = await webhookSecret(env.BOT_TOKEN);
  const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!got || !safeEqual(got, secret)) return json({ error: 'bad secret' }, 401);
  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: true });
  const origin = new URL(request.url).origin;
  ctx.waitUntil(
    processUpdate(env, update, origin).catch((e) => {
      console.error('bot:', e?.stack || e);
    }),
  );
  return json({ ok: true });
}

async function processUpdate(env, update, origin) {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);

  let text = null;
  if (msg.voice || msg.audio) {
    text = await transcribe(env, msg.voice || msg.audio);
  } else if (typeof msg.text === 'string') {
    text = msg.text;
  }
  if (text == null) return;
  text = text.trim();
  if (!text) return;

  if (text.startsWith('/start')) {
    await sendMessage(env, chatId,
      'Пришли задачи текстом или голосом — я раскидаю их по планеру. Например: «завтра в 11 созвон с клиентом на час».',
      keyboard(origin));
    return;
  }
  if (text.startsWith('/add')) text = text.slice(4).trim();
  if (!text) {
    await sendMessage(env, chatId, 'Напиши задачу после команды: /add созвон завтра в 11');
    return;
  }

  await getOrCreateKey(env, chatId); // пользователь появляется в базе при первом обращении

  let parsed;
  try {
    parsed = await parseWithAI(env, chatId, text);
  } catch (e) {
    console.error('bot parse:', e?.stack || e);
    await sendMessage(env, chatId, 'Не получилось разобрать сообщение. Попробуй ещё раз коротко: «завтра в 11 созвон на час».');
    return;
  }

  if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    await sendMessage(env, chatId, 'Не нашёл задач в сообщении. Попробуй: «завтра в 11 созвон с клиентом на час».');
    return;
  }

  const added = [];
  for (const t of parsed.tasks.slice(0, 10)) {
    const rec = await insertVoiceTask(env, chatId, t);
    if (rec) added.push(rec);
  }
  if (!added.length) {
    await sendMessage(env, chatId, 'Не смог сохранить задачи. Попробуй ещё раз.');
    return;
  }

  const lines = added.map((t) => {
    let s = `• ${t.title}`;
    const bits = [];
    if (t.date) bits.push(fmtDateRu(t.date));
    if (t.time) bits.push(t.time);
    if (t.duration_min) bits.push(`${t.duration_min} мин`);
    if (bits.length) s += ` — ${bits.join(', ')}`;
    return s;
  });
  const summary = parsed.summary ? `\n\n${parsed.summary}` : '';
  await sendMessage(env, chatId, `Добавил:\n${lines.join('\n')}${summary}`, keyboard(origin));
}

function keyboard(origin) {
  return {
    inline_keyboard: [[{ text: '🗓 Открыть планер', web_app: { url: origin } }]],
  };
}

async function sendMessage(env, chatId, text, replyMarkup) {
  await tgApi(env.BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function transcribe(env, voice) {
  if (!env.AI) throw new Error('AI недоступен локально (wrangler.local.toml без биндинга AI)');
  const f = await tgApi(env.BOT_TOKEN, 'getFile', { file_id: voice.file_id });
  const path = f.result?.file_path;
  if (!path) throw new Error('getFile не вернул file_path');
  const res = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`);
  if (!res.ok) throw new Error(`Не удалось скачать голосовое: ${res.status}`);
  const b64 = bufToB64(await res.arrayBuffer());
  let out;
  try {
    out = await env.AI.run(WHISPER, { file: b64, language: 'ru' });
  } catch {
    out = await env.AI.run(WHISPER, { file: b64 });
  }
  return String(out?.text || '').trim();
}

// ---------- Llama-разбор ----------

const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string' },
          time: { type: ['string', 'null'] },
          duration_min: { type: ['number', 'null'] },
          area: { type: ['string', 'null'] },
          important: { type: ['boolean', 'null'] },
        },
        required: ['title', 'date'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['tasks'],
};

async function parseWithAI(env, chatId, text) {
  if (!env.AI) throw new Error('AI недоступен локально (wrangler.local.toml без биндинга AI)');
  const today = moscowNow().date;
  const existing = await recentTasks(env, chatId, today);
  const system = [
    'Ты — ассистент личного планера. Преврати сообщение пользователя в список задач.',
    `Сейчас ${today}, часовой пояс Europe/Moscow.`,
    'Правила: date — YYYY-MM-DD (если дата не указана — сегодня; «завтра» — следующий день; «в понедельник» — ближайший понедельник);',
    "time — 'HH:MM' или null; duration_min — число минут или null («час»=60, «полтора часа»=90, «полчаса»=30);",
    'area — короткое название сферы (работа, дом, здоровье) или null; important — true, если пользователь подчёркивает важность.',
    'title — короткая формулировка задачи.',
    'Ответь строго JSON без пояснений: {"tasks":[{"title","date","time","duration_min","area","important"}],"summary":"краткое подтверждение одной фразой"}',
  ].join(' ');
  const user = [
    'Задачи пользователя на 7 дней вперёд (для контекста, не дублируй их):',
    existing.map((t) => `- ${t.date}${t.time ? ' ' + t.time : ''} ${t.title}`).join('\n') || '(нет)',
    '',
    `Сообщение пользователя: «${text}»`,
  ].join('\n');
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  // Попытка 1 — JSON-режим по схеме; если схема не выдержана (ошибка или мусор) —
  // попытка 2 без response_format, JSON вытаскиваем из текста ответа.
  let raw = '';
  let parsed = null;
  try {
    raw = await callLlama(env, messages, true);
    parsed = normalizeParsed(extractJSON(raw), today);
  } catch (e) {
    console.error('bot: schema attempt failed:', e?.message);
  }
  if (!parsed) {
    try {
      raw = await callLlama(env, messages, false);
      parsed = normalizeParsed(extractJSON(raw), today);
    } catch (e) {
      console.error('bot: plain attempt failed:', e?.message);
    }
  }
  if (!parsed) {
    console.error('bot: unparsable model output:', String(raw).slice(0, 800));
  }
  return parsed;
}

async function callLlama(env, messages, withSchema) {
  const params = { messages };
  if (withSchema) params.response_format = { type: 'json_schema', json_schema: SCHEMA };
  const out = await env.AI.run(LLAMA, params);
  if (out && typeof out === 'object' && out.response !== undefined && out.response !== null) {
    return out.response; // строка или уже готовый объект — разберёт extractJSON
  }
  return out;
}

function extractJSON(s) {
  if (s == null) return null;
  if (typeof s === 'object') return s; // уже разобранный JSON от модели
  const text = String(s);
  // готовый JSON целиком
  try { return JSON.parse(text); } catch { /* дальше — поиск внутри текста */ }
  // блок в ```json … ``` или ``` … ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { /* дальше */ }
  }
  // первый { … последний }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* дальше */ }
  }
  // голый массив задач → {tasks: [...]}
  const as = text.indexOf('[');
  const ae = text.lastIndexOf(']');
  if (as >= 0 && ae > as) {
    try {
      const arr = JSON.parse(text.slice(as, ae + 1));
      if (Array.isArray(arr)) return { tasks: arr };
    } catch { /* не JSON */ }
  }
  return null;
}

function normalizeParsed(parsed, today) {
  if (!parsed || !Array.isArray(parsed.tasks)) return null;
  const tasks = parsed.tasks
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .slice(0, 10)
    .map((t) => ({
      title: t.title.trim().slice(0, 300),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.date || '')) ? t.date : today,
      time: /^\d{1,2}:\d{2}$/.test(String(t.time || '')) ? String(t.time).padStart(5, '0') : null,
      duration_min: Math.max(0, Math.min(1440, Math.round(Number(t.duration_min) || 0))),
      area: t.area ? String(t.area).slice(0, 100) : null,
      important: !!t.important,
    }));
  return { tasks, summary: parsed.summary ? String(parsed.summary).slice(0, 300) : '' };
}

async function recentTasks(env, userId, today) {
  const plus7 = new Date(`${today}T12:00:00Z`);
  plus7.setUTCDate(plus7.getUTCDate() + 7);
  const until = plus7.toISOString().slice(0, 10);
  const rows = await env.DB.prepare(
    "SELECT date, time, title FROM tasks WHERE user_id = ? AND deleted = 0 AND done = 0 AND date IS NOT NULL AND date >= ? AND date <= ? ORDER BY date, time LIMIT 50",
  ).bind(userId, today, until).all();
  return rows.results || [];
}

async function insertVoiceTask(env, userId, t) {
  const rec = {
    id: `v-${randomKey().slice(0, 12)}`,
    user_id: userId,
    title: t.title,
    date: t.date,
    time: t.time,
    slot: null,
    duration_min: t.duration_min || 0,
    area: t.area,
    priority: t.important ? 1 : 2,
    note: null,
    deep: 0,
    frog: 0,
    repeat: null,
    checklist: null,
    done: 0,
    deleted: 0,
    source: 'voice',
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  rec.rev = await nextRev(env, userId);
  const cols = Object.keys(rec);
  await env.DB.prepare(
    `INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  ).bind(...cols.map((c) => rec[c])).run();
  return rec;
}
