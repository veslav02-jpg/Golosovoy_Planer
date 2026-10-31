// Интеграция бота и Notion с подменой внешних API: голос → Whisper → Llama → задача;
// Notion: подключение, cron-синк с лимитом 35 запросов и курсором.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, signInitData, getWorker, jsonReq } from './helpers.mjs';
import { sha256Hex, moscowNow, tgApi } from '../server/util.js';

const USER = { id: 777, first_name: 'Тест' };
let env, worker, key, tgCalls, notionCalls, aiCalls;

function jsonRes(obj) {
  return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
}

function installFetchMock() {
  tgCalls = [];
  notionCalls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) {
      tgCalls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes('/getFile')) return jsonRes({ ok: true, result: { file_path: 'voice/file_1.ogg' } });
      if (u.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3, 4, 5]).buffer);
      return jsonRes({ ok: true, result: { message_id: 1 } });
    }
    if (u.includes('api.notion.com')) {
      notionCalls.push({ url: u, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.endsWith('/databases')) return jsonRes({ object: 'database', id: 'db123abc' });
      // PATCH /pages/{id} — существующая страница; POST /pages — новая
      if (/\/pages\/[0-9a-f]{8,}/.test(u)) return jsonRes({ object: 'page', id: u.split('/').pop() });
      if (u.endsWith('/pages')) return jsonRes({ object: 'page', id: `page-${notionCalls.length}` });
      if (u.includes('/pages/')) return jsonRes({ object: 'page', id: 'page-target' });
    }
    return real(url, opts);
  };
  return () => { globalThis.fetch = real; };
}

const AI = {
  async run(model, params) {
    aiCalls.push({ model, params });
    if (model.includes('whisper')) {
      return { text: 'созвон завтра в 11 с клиентом на час' };
    }
    // первый вызов с json_schema «падает» — проверяем фолбэк без response_format
    if (params.response_format) throw new Error('bad request');
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return {
      response: JSON.stringify({
        tasks: [{ title: 'созвон с клиентом', date: tomorrow.toISOString().slice(0, 10), time: '11:00', duration_min: 60, area: null, important: false }],
        summary: 'Добавил созвон',
      }),
    };
  },
};

beforeEach(async () => {
  env = makeEnv({ ai: AI });
  worker = await getWorker();
  const initData = await signInitData(USER, env.BOT_TOKEN);
  const res = await worker.fetch(jsonReq('http://x/api/auth/telegram', { method: 'POST', body: { initData } }), env, makeCtx());
  key = (await res.json()).key;
  installFetchMock();
  aiCalls = [];
});

const h = () => ({ 'X-Auth-Key': key });

async function sendWebhook(update) {
  const secret = await sha256Hex(`webhook:${env.BOT_TOKEN}`);
  const ctx = makeCtx();
  const res = await worker.fetch(jsonReq('http://x/api/telegram/webhook', {
    method: 'POST',
    body: update,
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
  }), env, ctx);
  assert.equal(res.status, 200);
  await ctx.flushed();
}

test('вебхук с неверным секретом отклоняется', async () => {
  const res = await worker.fetch(jsonReq('http://x/api/telegram/webhook', {
    method: 'POST', body: { message: { chat: { id: 777 }, text: 'привет' } },
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'nope' },
  }), env, makeCtx());
  assert.equal(res.status, 401);
});

test('голосовое → Whisper → Llama → задача в базе и ответ бота', async () => {
  await sendWebhook({ message: { chat: { id: 777 }, voice: { file_id: 'f1', duration: 3 } } });

  // Whisper получил base64 файла, Llama — контекст и текст
  assert.ok(aiCalls.some((c) => c.model.includes('whisper') && typeof c.params.file === 'string'));
  const llama = aiCalls.filter((c) => c.model.includes('llama'));
  assert.equal(llama.length, 2, 'json_schema + фолбэк без response_format');
  assert.ok(!llama[1].params.response_format);
  assert.match(llama[1].params.messages[1].content, /созвон завтра в 11/);

  // задача сохранена с source=voice
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  const task = data.tasks.find((t) => t.source === 'voice');
  assert.ok(task, 'задача от бота есть');
  assert.equal(task.title, 'созвон с клиентом');
  assert.equal(task.time, '11:00');
  assert.equal(task.duration_min, 60);

  // бот ответил: список + кнопка web_app
  const sent = tgCalls.filter((c) => c.url.includes('/sendMessage'));
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /Добавил/);
  assert.match(sent[0].body.text, /созвон с клиентом/);
  const kb = sent[0].body.reply_markup.inline_keyboard[0][0];
  assert.equal(kb.web_app.url, 'http://x');
});

test('текстовое сообщение тоже принимается (тот же Llama-конвейер)', async () => {
  await sendWebhook({ message: { chat: { id: 777 }, text: 'купить молоко завтра в 9' } });
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  const task = data.tasks.find((t) => t.source === 'voice');
  assert.ok(task, 'задача из текста сохранена тем же конвейером');
  assert.equal(task.title, 'созвон с клиентом');
});

test('/start отвечает приветствием с кнопкой', async () => {
  await sendWebhook({ message: { chat: { id: 777 }, text: '/start' } });
  const sent = tgCalls.filter((c) => c.url.includes('/sendMessage'));
  assert.equal(sent.length, 1);
  assert.ok(sent[0].body.reply_markup.inline_keyboard[0][0].web_app);
});

test('Llama вернула готовый объект в response — задача сохраняется', async () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  env.AI = { async run(model, params) {
    if (params.response_format) throw new Error('schema unsupported');
    return { response: { tasks: [{ title: 'объект-тест', date: tomorrow.toISOString().slice(0, 10), time: null, duration_min: 30, area: null, important: false }], summary: 'ок' } };
  } };
  await sendWebhook({ message: { chat: { id: 777 }, text: 'объект-тест завтра' } });
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  assert.ok(data.tasks.some((t) => t.title === 'объект-тест'), 'задача из объектного ответа есть');
});

test('Llama завернула JSON в ```json фенс — задача сохраняется', async () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  env.AI = { async run(model, params) {
    if (params.response_format) throw new Error('schema unsupported');
    const payload = JSON.stringify({ tasks: [{ title: 'фенс-тест', date: tomorrow.toISOString().slice(0, 10), time: '10:00', duration_min: 15, area: null, important: false }], summary: '' });
    return { response: `\`\`\`json\n${payload}\n\`\`\`` };
  } };
  await sendWebhook({ message: { chat: { id: 777 }, text: 'фенс-тест завтра в 10' } });
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  const t = data.tasks.find((x) => x.title === 'фенс-тест');
  assert.ok(t, 'задача из фенса есть');
  assert.equal(t.time, '10:00');
});

// ---------- Notion ----------

async function connectNotion() {
  const res = await worker.fetch(jsonReq('http://x/api/notion/connect', {
    method: 'POST',
    headers: h(),
    body: { secret: 'ntn_testsecret', page: 'https://www.notion.so/My-Page-0123456789abcdef0123456789abcdef' },
  }), env, makeCtx());
  return res;
}

test('notion/connect создаёт базу «Планер» с нужными свойствами', async () => {
  const res = await connectNotion();
  const data = await res.json();
  assert.equal(data.ok, true);
  const dbCall = notionCalls.find((c) => c.url.endsWith('/databases'));
  assert.ok(dbCall);
  assert.deepEqual(Object.keys(dbCall.body.properties).sort(), ['Главное', 'Готово', 'Задача', 'Когда', 'Минут', 'Сфера']);
  const status = await worker.fetch(jsonReq('http://x/api/notion/status', { headers: h() }), env, makeCtx());
  assert.equal((await status.json()).connected, true);
});

test('cron: задача с датой уходит в Notion, курсор двигается, дублей нет', async () => {
  await connectNotion();
  const now = new Date().toISOString();
  await worker.fetch(jsonReq('http://x/api/tasks/sync', {
    method: 'POST',
    headers: h(),
    body: { tasks: [
      { id: 't1', title: 'С датой', date: '2026-11-05', time: '10:00', duration_min: 60, area: 'Работа', frog: true, updated_at: now },
      { id: 't2', title: 'Без даты', updated_at: now },
    ] },
  }), env, makeCtx());

  const ctx = makeCtx();
  await worker.scheduled({}, env, ctx);
  await ctx.flushed();

  const pageCalls = notionCalls.filter((c) => c.url.endsWith('/pages'));
  assert.equal(pageCalls.length, 1, 'только задача с датой');
  const props = pageCalls[0].body.properties;
  assert.equal(props['Задача'].title[0].text.content, 'С датой');
  assert.equal(props['Когда'].date.start, '2026-11-05T10:00:00');
  assert.equal(props['Главное'].checkbox, true);

  // курсор запомнен — второй прогон ничего не шлёт
  const status = await worker.fetch(jsonReq('http://x/api/notion/status', { headers: h() }), env, makeCtx());
  const st = await status.json();
  assert.ok(st.cursor > 0);
  const callsAfterFirst = notionCalls.length;
  const ctx2 = makeCtx();
  await worker.scheduled({}, env, ctx2);
  await ctx2.flushed();
  assert.equal(notionCalls.length, callsAfterFirst);
});

test('cron: удалённая задача архивируется', async () => {
  await connectNotion();
  const now = new Date().toISOString();
  await worker.fetch(jsonReq('http://x/api/tasks/sync', {
    method: 'POST', headers: h(),
    body: { tasks: [{ id: 't1', title: 'X', date: '2026-11-05', updated_at: now }] },
  }), env, makeCtx());
  const ctx = makeCtx();
  await worker.scheduled({}, env, ctx);
  await ctx.flushed();
  await worker.fetch(jsonReq('http://x/api/tasks/sync', {
    method: 'POST', headers: h(),
    body: { tasks: [{ id: 't1', title: 'X', date: '2026-11-05', deleted: true, updated_at: new Date().toISOString() }] },
  }), env, makeCtx());
  const ctx2 = makeCtx();
  await worker.scheduled({}, env, ctx2);
  await ctx2.flushed();
  const archive = notionCalls.filter((c) => c.body && c.body.archived === true);
  assert.equal(archive.length, 1);
});

test('cron: напоминание о привычке приходит в окне 5 минут', async () => {
  const now = moscowNow();
  const remMin = (now.minutes + 2) % 1440;
  const reminder = `${String(Math.floor(remMin / 60)).padStart(2, '0')}:${String(remMin % 60).padStart(2, '0')}`;
  const item = { id: 'h1', kind: 'habit', data: { name: 'Зарядка', days: [now.dow], reminder }, updated_at: new Date().toISOString() };
  await worker.fetch(jsonReq('http://x/api/items/sync', { method: 'POST', headers: h(), body: { items: [item] } }), env, makeCtx());
  const ctx = makeCtx();
  await worker.scheduled({}, env, ctx);
  await ctx.flushed();
  const sent = tgCalls.filter((c) => c.url.includes('/sendMessage'));
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /Зарядка/);
});
