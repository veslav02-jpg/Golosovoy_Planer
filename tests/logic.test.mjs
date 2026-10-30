// Тесты логики: парсер быстрого ввода, автоплан, повторы, очки, экспорт
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickInput } from '../src/lib/parse.js';
import { autoplan, dayLoad } from '../src/lib/autoplan.js';
import { nextRepeatDate, spawnNextRepeat } from '../src/lib/repeat.js';
import { taskPoints, dayPoints, streak } from '../src/lib/points.js';
import { buildExport, parseImport } from '../src/lib/exportImport.js';
import { addDays, todayStr, dow, parseHHMM } from '../src/lib/dates.js';

const T = todayStr();
const TOMORROW = addDays(T, 1);

// ---------- парсер ----------

test('парсер: полный пример из промпта', () => {
  const p = parseQuickInput('созвон 1.5ч в 16:00 завтра #работа !');
  assert.equal(p.title, 'созвон');
  assert.equal(p.duration_min, 90);
  assert.equal(p.time, '16:00');
  assert.equal(p.date, TOMORROW);
  assert.equal(p.area, 'работа');
  assert.equal(p.priority, 1);
});

test('парсер: !! — главное на день', () => {
  const p = parseQuickInput('прототип !!');
  assert.equal(p.frog, true);
  assert.equal(p.priority, 1);
  assert.equal(p.title, 'прототип');
});

test('парсер: ~ не срочно', () => {
  const p = parseQuickInput('книгу почитать ~');
  assert.equal(p.priority, 3);
});

test('парсер: 20.10 — дата, не время', () => {
  const p = parseQuickInput('отчёт 20.10');
  assert.match(p.date, /-\d{2}-20$/);
  assert.equal(p.time, null);
  assert.equal(p.title, 'отчёт');
});

test('парсер: 16.00 — время', () => {
  const p = parseQuickInput('16.00 встреча');
  assert.equal(p.time, '16:00');
  assert.equal(p.date, T);
});

test('парсер: дни недели и предлоги', () => {
  const p = parseQuickInput('созвон в среду');
  const cur = dow(T);
  const target = 3;
  const diff = (target - cur + 7) % 7;
  assert.equal(p.date, addDays(T, diff));
  assert.equal(p.title, 'созвон');
});

test('парсер: длительности', () => {
  assert.equal(parseQuickInput('а 2 часа').duration_min, 120);
  assert.equal(parseQuickInput('а 45м').duration_min, 45);
  assert.equal(parseQuickInput('а полчаса').duration_min, 30);
  assert.equal(parseQuickInput('а полтора часа').duration_min, 90);
  assert.equal(parseQuickInput('а 1,5 ч').duration_min, 90);
});

test('парсер: слоты и через неделю', () => {
  const p = parseQuickInput('уборка вечером через неделю');
  assert.equal(p.slot, 'evening');
  assert.equal(p.date, addDays(T, 7));
});

test('парсер: «20 октября» словами', () => {
  const p = parseQuickInput('план 20 октября');
  assert.match(p.date, /-10-20$/);
});

// ---------- автоплан ----------

const SETTINGS = { workStart: '09:00', workEnd: '19:00', peakStart: '10:00', peakEnd: '13:00', headLimit: 4 };

test('автоплан: главное в пик энергии, мелочи после, обед свободен', () => {
  const tasks = [
    { id: 'a', title: 'Мелочь 1', duration_min: 30, priority: 2 },
    { id: 'b', title: 'Главное', duration_min: 90, frog: true },
    { id: 'c', title: 'Мелочь 2', duration_min: 30, priority: 3 },
  ];
  const plan = autoplan(tasks, SETTINGS);
  const frog = plan.blocks.find((b) => b.task_id === 'b');
  const start = parseHHMM(frog.start);
  assert.ok(start >= 600, 'главное начинается не раньше пика (10:00)');
  assert.ok(start < 780, 'главное в пике (до 13:00)');
  // обед 13:00–14:00 свободен
  for (const b of plan.blocks) {
    const s = parseHHMM(b.start);
    const e = parseHHMM(b.end);
    assert.ok(!(s < 840 && e > 780), 'блок не пересекает обед');
    assert.ok(e <= 1140, 'блок в рабочих часах');
  }
  // нет пересечений
  const sorted = plan.blocks.map((b) => [parseHHMM(b.start), parseHHMM(b.end)]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i][0] >= sorted[i - 1][1], 'блоки не пересекаются');
});

test('автоплан: не влезающие задачи помечаются', () => {
  const tasks = [{ id: 'big', title: 'Огромная', duration_min: 700, frog: true }];
  const plan = autoplan(tasks, SETTINGS);
  assert.equal(plan.blocks.length, 0);
  assert.equal(plan.notFit.length, 1);
});

test('шкалы: Время = сумма ×1,5 против 65% дня; Голова = глубокое против лимита', () => {
  const tasks = [
    { id: '1', title: 'a', duration_min: 60, done: false, deleted: false },
    { id: '2', title: 'b', duration_min: 60, deep: true, done: false, deleted: false },
  ];
  const l = dayLoad(tasks, SETTINGS);
  assert.equal(l.timeUsed, 180);
  assert.equal(l.timeCap, Math.round(600 * 0.65));
  assert.equal(l.headUsed, 1);
  assert.equal(l.headCap, 4);
});

// ---------- повторы ----------

test('повтор: каждый день, будни, дни недели, месяц', () => {
  assert.equal(nextRepeatDate({ type: 'daily' }, '2026-01-15'), '2026-01-16');
  // пятница → понедельник
  assert.equal(nextRepeatDate({ type: 'weekdays' }, '2026-01-16'), '2026-01-19');
  // среда → следующий понедельник при days:[1]
  assert.equal(nextRepeatDate({ type: 'week', days: [1] }, '2026-01-14'), '2026-01-19');
  // 31 января → 28 февраля (клэмп)
  assert.equal(nextRepeatDate({ type: 'monthly' }, '2026-01-31'), '2026-02-28');
});

test('повтор: при выполнении создаётся следующая с чистым чеклистом', () => {
  const next = spawnNextRepeat({
    id: 'x', title: 'обзор', date: '2026-01-16', done: true,
    repeat: { type: 'weekdays' }, checklist: [{ text: 'а', done: true }],
  });
  assert.equal(next.date, '2026-01-19');
  assert.equal(next.done, false);
  assert.equal(next.checklist[0].done, false);
  assert.notEqual(next.id, 'x');
});

// ---------- очки ----------

test('очки: 10 / 25 / 30 / 40 и серия', () => {
  assert.equal(taskPoints({ duration_min: 20 }), 10);
  assert.equal(taskPoints({ duration_min: 60 }), 25);
  assert.equal(taskPoints({ duration_min: 120 }), 30);
  assert.equal(taskPoints({ duration_min: 10, frog: true }), 40);
  const tasks = [
    { title: 'a', date: T, duration_min: 20, done: true },
    { title: 'b', date: addDays(T, -1), duration_min: 60, done: true },
  ];
  assert.equal(dayPoints(tasks, T), 10);
  assert.equal(streak(tasks, T, addDays), 2);
});

// ---------- экспорт/импорт ----------

test('экспорт: только месяц, точки считаются', () => {
  const tasks = [
    { title: 'в месяце', date: `${T.slice(0, 7)}-02`, duration_min: 20, done: true },
    { title: 'не в месяце', date: '2020-01-01', duration_min: 20, done: true },
  ];
  const items = [
    { kind: 'day', id: `day:${T}`, data: { mood: 4, energy: 3, good: 'ок', note: '' } },
    { kind: 'habit', id: 'h1', data: { name: 'Зарядка', days: [1] } },
    { kind: 'habit_log', id: `hl:h1:${T}`, data: { habit_id: 'h1', date: T } },
  ];
  const ex = buildExport(tasks, items, T.slice(0, 7));
  assert.equal(ex.tasks.length, 1);
  assert.equal(ex.tasks[0].points, 10);
  assert.equal(ex.days.length, 1);
  assert.equal(ex.habits.length, 1);
  assert.equal(ex.habitLogs.length, 1);
});

test('импорт: дубли по названию пропускаются, простой формат поддерживается', () => {
  const existing = { a: { id: 'a', title: 'Созвон', deleted: false } };
  const json = JSON.stringify({
    tasks: [
      { title: 'созвон', date: T, duration_min: 30 },
      { title: 'новая задача', date: T },
    ],
    habits: [{ name: 'Зарядка' }],
  });
  const r = parseImport(json, existing, {});
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].title, 'новая задача');
  assert.equal(r.items.length, 1);
  assert.equal(r.skipped, 1);
});
