// Повторы: {type:'daily'|'weekdays'|'week'|'monthly', days:[1..7] (Пн=1)}
// Следующая задача создаётся при выполнении текущей.
import { addDays, dow } from './dates.js';

export function nextRepeatDate(repeat, fromDate) {
  if (!repeat || !repeat.type) return null;
  const d = dow(fromDate);
  switch (repeat.type) {
    case 'daily':
      return addDays(fromDate, 1);
    case 'weekdays': {
      let n = fromDate;
      for (let i = 0; i < 7; i++) {
        n = addDays(n, 1);
        const w = dow(n);
        if (w >= 1 && w <= 5) return n;
      }
      return null;
    }
    case 'week': {
      const days = (repeat.days || []).filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b);
      if (!days.length) return addDays(fromDate, 1);
      let n = fromDate;
      for (let i = 0; i < 8; i++) {
        n = addDays(n, 1);
        if (days.includes(dow(n))) return n;
      }
      return null;
    }
    case 'monthly': {
      const [y, m, dd] = fromDate.split('-').map(Number);
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
      return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
    }
    default:
      return null;
  }
}

// При выполнении задачи с повтором — создать следующую (checklist сбрасывается)
export function spawnNextRepeat(task) {
  const nextDate = nextRepeatDate(task.repeat, task.date || new Date().toISOString().slice(0, 10));
  if (!nextDate) return null;
  const now = new Date().toISOString();
  return {
    ...task,
    id: crypto.randomUUID(),
    date: nextDate,
    done: false,
    deleted: false,
    frog: false,
    created_at: now,
    updated_at: now,
    rev: 0,
    checklist: Array.isArray(task.checklist)
      ? task.checklist.map((c) => ({ ...c, done: false }))
      : task.checklist,
    repeat: task.repeat,
  };
}

export const REPEAT_LABELS = {
  daily: 'Каждый день',
  weekdays: 'По будням',
  week: 'Дни недели',
  monthly: 'Каждый месяц',
};
