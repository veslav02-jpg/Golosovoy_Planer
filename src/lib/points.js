// Очки Месяца: 10 — задача до 30 мин, 25 — до 90 мин, 30 — дольше, главная задача дня — 40.
// Серия — дни подряд с выполненными задачами; рекорды — лучший день по дням недели.

export function taskPoints(t) {
  if (t.frog) return 40;
  const d = t.duration_min || 0;
  if (d <= 30) return 10;
  if (d <= 90) return 25;
  return 30;
}

export function dayPoints(tasks, dateStr) {
  return tasks
    .filter((t) => t.done && !t.deleted && t.date === dateStr)
    .reduce((s, t) => s + taskPoints(t), 0);
}

export function pointsByMonth(tasks, dates) {
  const map = {};
  for (const d of dates) map[d] = dayPoints(tasks, d);
  return map;
}

// Серия: сколько дней подряд (включая сегодня, если есть очки) с днём > 0
export function streak(tasks, todayStr, addDays) {
  let s = 0;
  let d = todayStr;
  if (dayPoints(tasks, d) === 0) d = addDays(d, -1); // сегодня ещё можно начать
  while (dayPoints(tasks, d) > 0) {
    s++;
    d = addDays(d, -1);
  }
  return s;
}

// Рекорды по дням недели: {1: maxPoints, ...}
export function recordsByWeekday(tasks, dates) {
  const rec = {};
  for (const d of dates) {
    const w = new Date(`${d}T12:00:00Z`).getUTCDay();
    const w1 = w === 0 ? 7 : w;
    rec[w1] = Math.max(rec[w1] || 0, dayPoints(tasks, d));
  }
  return rec;
}
