// Даты: строки 'YYYY-MM-DD' как единый формат, показ по-русски, 24-часовое время

export const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const WD_NOM = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const WD_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
export const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dow(dateStr) {
  // 1..7, Пн=1
  const js = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

export function fmtDay(dateStr, { relative = true } = {}) {
  if (!dateStr) return '';
  const today = todayStr();
  if (relative && dateStr === today) return 'Сегодня';
  if (relative && dateStr === addDays(today, 1)) return 'Завтра';
  if (relative && dateStr === addDays(today, -1)) return 'Вчера';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const day = Number(m[3]);
  const month = Number(m[2]);
  return `${day} ${MONTHS_GEN[month - 1]}`;
}

export function fmtDayFull(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS_GEN[Number(m[2]) - 1]} ${m[0].slice(0, 4)}, ${WD_NOM[dow(dateStr) - 1]}`;
}

// Начало недели (Пн)
export function weekStart(dateStr) {
  const d = dow(dateStr);
  return addDays(dateStr, 1 - d);
}

export function weekDates(anyDate) {
  const start = weekStart(anyDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthKey(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

export function monthDates(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

export function hhmm(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min < 1440 ? min : null;
}
