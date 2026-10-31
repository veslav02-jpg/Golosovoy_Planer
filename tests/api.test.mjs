// Smoke-тест API: health, авторизация initData, синк с last-write-wins,
// pull по ревизии, надгробия, items, service-key, настройка бота.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, signInitData, getWorker, jsonReq } from './helpers.mjs';
import { sha256Hex } from '../server/util.js';

const USER = { id: 777, first_name: 'Тест', username: 'tester' };
let env, worker, key;

async function auth() {
  const initData = await signInitData(USER, env.BOT_TOKEN);
  const res = await worker.fetch(jsonReq('http://x/api/auth/telegram', { method: 'POST', body: { initData } }), env, makeCtx());
  const data = await res.json();
  assert.equal(res.status, 200);
  key = data.key;
  assert.ok(key);
}

beforeEach(async () => {
  env = makeEnv();
  worker = await getWorker();
  await auth();
});

const h = () => ({ 'X-Auth-Key': key });

test('health отвечает {"ok":true}', async () => {
  const res = await worker.fetch(jsonReq('http://x/api/health'), env, makeCtx());
  assert.deepEqual(await res.json(), { ok: true });
});

test('без ключа — 401', async () => {
  const res = await worker.fetch(jsonReq('http://x/api/pull'), env, makeCtx());
  assert.equal(res.status, 401);
});

test('поддельная подпись initData отклоняется', async () => {
  const res = await worker.fetch(
    jsonReq('http://x/api/auth/telegram', { method: 'POST', body: { initData: 'user=%7B%22id%22%3A1%7D&hash=deadbeef' } }),
    env, makeCtx(),
  );
  assert.equal(res.status, 401);
});

test('initData с полем signature (современные клиенты) проходит проверку', async () => {
  const initData = await signInitData({ id: 555, first_name: 'Сиг' }, env.BOT_TOKEN, { signature: 'c2lnbmF0dXJl' });
  const res = await worker.fetch(
    jsonReq('http://x/api/auth/telegram', { method: 'POST', body: { initData } }),
    env, makeCtx(),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.id, '555');
});

test('токен с пробелом по краям всё равно проходит проверку', async () => {
  const initData = await signInitData({ id: 556, first_name: 'Ток' }, env.BOT_TOKEN);
  const env2 = makeEnv({ botToken: `  ${env.BOT_TOKEN} \n` });
  const res = await worker.fetch(
    jsonReq('http://x/api/auth/telegram', { method: 'POST', body: { initData } }),
    env2, makeCtx(),
  );
  assert.equal(res.status, 200);
});

test('создание задачи через sync и выдача через pull', async () => {
  const task = { id: 't1', title: 'Первая', date: '2026-11-01', time: '10:00', duration_min: 60, updated_at: new Date().toISOString() };
  const res = await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [task] }, headers: h() }), env, makeCtx());
  const { records } = await res.json();
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'Первая');
  assert.ok(records[0].rev > 0);
  assert.equal(records[0].source, 'app');

  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  assert.equal(data.tasks.length, 1);
  assert.equal(data.rev, records[0].rev);
});

test('last-write-wins: старая правка не затирает новую', async () => {
  const now = new Date().toISOString();
  const newer = { id: 't1', title: 'Версия 2', updated_at: now };
  const older = { id: 't1', title: 'Версия 1', updated_at: new Date(Date.parse(now) - 60000).toISOString() };
  await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [newer] }, headers: h() }), env, makeCtx());
  const res = await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [older] }, headers: h() }), env, makeCtx());
  const { records } = await res.json();
  assert.equal(records[0].title, 'Версия 2');
  // rev не вырос при отклонённой записи
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  assert.equal((await pull.json()).tasks[0].title, 'Версия 2');
});

test('надгробия: удаление доезжает по pull и не воскресает', async () => {
  const t = { id: 't1', title: 'X', updated_at: new Date().toISOString() };
  await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [t] }, headers: h() }), env, makeCtx());
  await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [{ ...t, deleted: true, updated_at: new Date().toISOString() }] }, headers: h() }), env, makeCtx());
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  assert.equal(data.tasks[0].deleted, true);
});

test('повторная отправка той же версии не создаёт дубликатов', async () => {
  const t = { id: 't1', title: 'X', updated_at: '2026-11-01T10:00:00.000Z' };
  await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [t] }, headers: h() }), env, makeCtx());
  const res = await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [t] }, headers: h() }), env, makeCtx());
  const { records } = await res.json();
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  assert.equal(data.tasks.length, 1);
  assert.equal(records[0].rev, data.tasks[0].rev);
});

test('items: настройки синхронизируются', async () => {
  const item = { id: 'settings', kind: 'settings', data: { workStart: '08:00' }, updated_at: new Date().toISOString() };
  const res = await worker.fetch(jsonReq('http://x/api/items/sync', { method: 'POST', body: { items: [item] }, headers: h() }), env, makeCtx());
  const { records } = await res.json();
  assert.equal(records[0].data.workStart, '08:00');
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: h() }), env, makeCtx());
  const data = await pull.json();
  assert.equal(data.items[0].kind, 'settings');
});

test('чужой ключ не видит чужие данные', async () => {
  await worker.fetch(jsonReq('http://x/api/tasks/sync', { method: 'POST', body: { tasks: [{ id: 't1', title: 'Мои', updated_at: new Date().toISOString() }] }, headers: h() }), env, makeCtx());
  // второй пользователь
  const initData2 = await signInitData({ id: 888, first_name: 'Два' }, env.BOT_TOKEN);
  const r2 = await worker.fetch(jsonReq('http://x/api/auth/telegram', { method: 'POST', body: { initData: initData2 } }), env, makeCtx());
  const key2 = (await r2.json()).key;
  const pull = await worker.fetch(jsonReq('http://x/api/pull', { headers: { 'X-Auth-Key': key2 } }), env, makeCtx());
  const data = await pull.json();
  assert.equal(data.tasks.length, 0);
});

test('внешние автоматизации: X-Service-Key + X-Telegram-User-Id', async () => {
  const res = await worker.fetch(jsonReq('http://x/api/pull', {
    headers: { 'X-Service-Key': env.SERVICE_KEY, 'X-Telegram-User-Id': '777' },
  }), env, makeCtx());
  assert.equal(res.status, 200);
  const bad = await worker.fetch(jsonReq('http://x/api/pull', {
    headers: { 'X-Service-Key': 'wrong', 'X-Telegram-User-Id': '777' },
  }), env, makeCtx());
  assert.equal(bad.status, 401);
});

test('/api/telegram/setup ставит вебхук, кнопку меню и команды', async () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/getWebhookInfo')) {
      return new Response(JSON.stringify({ ok: true, result: { url: 'http://x/api/telegram/webhook', pending_update_count: 0 } }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const res = await worker.fetch(jsonReq('http://x/api/telegram/setup', { method: 'POST', headers: h() }), env, makeCtx());
    const data = await res.json();
    assert.equal(data.ok, true);
    const methods = calls.map((c) => c.url.split('/').pop());
    assert.deepEqual(methods, ['setWebhook', 'setChatMenuButton', 'setMyCommands', 'getWebhookInfo']);
    const webhookBody = JSON.parse(calls[0].opts.body);
    assert.equal(webhookBody.url, 'http://x/api/telegram/webhook');
    assert.equal(webhookBody.secret_token, await sha256Hex(`webhook:${env.BOT_TOKEN}`));
    assert.equal(data.webhook.ok, true); // getWebhookInfo вернулся
  } finally {
    globalThis.fetch = real;
  }
});
