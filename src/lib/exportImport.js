// Экспорт месяца для Claude (JSON + готовый промпт) и импорт JSON
import { monthDates, monthKey, todayStr } from './dates.js';
import { taskPoints } from './points.js';

export function buildExport(tasks, items, month) {
  const inMonth = (d) => d && String(d).startsWith(month);
  const t = tasks
    .filter((x) => inMonth(x.date))
    .map((x) => ({
      title: x.title, date: x.date, time: x.time, duration_min: x.duration_min,
      area: x.area, priority: x.priority, deep: !!x.deep, frog: !!x.frog,
      done: !!x.done, points: x.done ? taskPoints(x) : 0,
    }));
  const days = items
    .filter((i) => i.kind === 'day' && !i.deleted && inMonth(i.id.slice(4)))
    .map((i) => ({ date: i.id.slice(4), ...i.data }));
  const habits = items.filter((i) => i.kind === 'habit' && !i.deleted)
    .map((i) => ({ name: i.data?.name, days: i.data?.days, reminder: i.data?.reminder }));
  const habitLogs = items
    .filter((i) => i.kind === 'habit_log' && !i.deleted && inMonth(i.id.split(':')[2]))
    .map((i) => ({ habit: items[i.data?.habit_id]?.data?.name || i.data?.habit_id, date: i.data?.date }));
  const areas = items.filter((i) => i.kind === 'area' && !i.deleted)
    .map((i) => ({ name: i.data?.name, weeklyGoalHours: i.data?.weeklyGoalHours || 0 }));
  return {
    app: 'planner', version: 1, month, exported_at: new Date().toISOString(),
    tasks: t, days, habits, habitLogs, areas,
  };
}

export function exportPrompt(month) {
  return [
    `Вот JSON моего планера за ${month}. Разбери месяц как коуч:`,
    '1) Куда уходило время по сферам и по дням недели;',
    '2) Что мешало: перегруз, откладывание главных задач, заброшенные сферы и привычки;',
    '3) Что сработало хорошо (серии, ритм, глубокая работа);',
    '4) 3–5 конкретных советов на следующий месяц, без общих слов.',
    'Отвечай по-русски, коротко и по делу.',
    '',
    '```json',
    '__JSON__',
    '```',
  ].join('\n');
}

// Импорт: полный формат экспорта или простой {tasks:[…], habits:[…]}.
// Дубли пропускаем по названию.
export function parseImport(json, existingTasks, existingItems) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error('Не похоже на JSON'); }
  if (!data || !Array.isArray(data.tasks)) throw new Error('В JSON нет массива tasks');

  const now = new Date().toISOString();
  const titles = new Set(
    Object.values(existingTasks)
      .filter((t) => !t.deleted)
      .map((t) => (t.title || '').trim().toLowerCase()),
  );
  const tasks = [];
  let skipped = 0;
  for (const t of data.tasks.slice(0, 500)) {
    if (!t || !t.title) continue;
    const title = String(t.title).trim();
    const key = title.toLowerCase();
    if (titles.has(key)) { skipped++; continue; }
    titles.add(key);
    tasks.push({
      id: crypto.randomUUID(),
      title,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(t.date || '')) ? t.date : null,
      time: /^\d{1,2}:\d{2}$/.test(String(t.time || '')) ? String(t.time).padStart(5, '0') : null,
      slot: t.slot || null,
      duration_min: Math.max(0, Math.round(Number(t.duration_min) || 0)),
      area: t.area ? String(t.area).slice(0, 100) : null,
      priority: Math.min(3, Math.max(1, Number(t.priority) || 2)),
      note: t.note ? String(t.note).slice(0, 2000) : null,
      deep: !!t.deep,
      frog: false,
      repeat: t.repeat || null,
      checklist: Array.isArray(t.checklist) ? t.checklist : null,
      done: !!t.done,
      deleted: false,
      source: 'api',
      created_at: now,
      updated_at: now,
      rev: 0,
    });
  }

  const items = [];
  const habitNames = new Set(
    Object.values(existingItems)
      .filter((i) => i.kind === 'habit' && !i.deleted)
      .map((i) => (i.data?.name || '').toLowerCase()),
  );
  for (const h of (data.habits || []).slice(0, 100)) {
    if (!h || !h.name) continue;
    if (habitNames.has(String(h.name).toLowerCase())) { skipped++; continue; }
    habitNames.add(String(h.name).toLowerCase());
    items.push({
      id: crypto.randomUUID(), kind: 'habit',
      data: { name: String(h.name).slice(0, 100), days: h.days || [1, 2, 3, 4, 5, 6, 7], reminder: h.reminder || null },
      deleted: false, updated_at: now, rev: 0,
    });
  }
  return { tasks, items, skipped };
}
