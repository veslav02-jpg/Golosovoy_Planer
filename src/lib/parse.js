// Быстрый ввод: «созвон 1.5ч в 16:00 завтра #работа !»
// Понимает: время, длительность, дату (включая «20.10»), дни недели,
// утром/днём/вечером, #сферу, ! важно, !! главное на день, ~ не срочно.
import { todayStr, addDays, dow } from './dates.js';

const WD_MAP = {
  'понедельник': 1, 'вторник': 2, 'среду': 3, 'среда': 3, 'четверг': 4,
  'пятницу': 5, 'пятница': 5, 'субботу': 6, 'суббота': 6, 'воскресенье': 7,
  'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 7,
};
const MONTH_PREFIX = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function parseQuickInput(input, { today = todayStr() } = {}) {
  const res = {
    title: '', date: null, time: null, slot: null, duration_min: 0,
    area: null, priority: 2, frog: false,
  };
  let rest = String(input || '').trim();
  if (!rest) return res;

  if (/(^|\s)!!(\s|$)/.test(rest)) {
    res.frog = true;
    res.priority = 1;
    rest = rest.replace(/(^|\s)!!(\s|$)/g, ' ');
  }
  if (/(^|\s)!(\s|$)/.test(rest)) {
    res.priority = 1;
    rest = rest.replace(/(^|\s)!(\s|$)/g, ' ');
  }
  if (/(^|\s)~(\s|$)/.test(rest)) {
    res.priority = 3;
    rest = rest.replace(/(^|\s)~(\s|$)/g, ' ');
  }

  const area = /(?:^|\s)#([\wа-яё-]+)/i.exec(rest);
  if (area) {
    res.area = area[1];
    rest = rest.replace(area[0], ' ');
  }

  const words = rest.split(/\s+/);
  const keep = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wl = w.toLowerCase().replace(/[,.;!?:]+$/, '');
    const nextW = (words[i + 1] || '').toLowerCase();

    // предлоги «в/к/во» перед временем или днём недели — пропускаем целиком
    if ((wl === 'в' || wl === 'к' || wl === 'во')) {
      if (WD_MAP[nextW] || parseTimeToken(nextW) != null || /^\d/.test(nextW)) continue;
      keep.push(w);
      continue;
    }

    // длительность: 1.5ч / 1,5 ч / 45м / 90 мин / 2 часа / полчаса / полтора часа
    if (!res.duration_min) {
      const dur = parseDuration(words, i);
      if (dur) {
        res.duration_min = dur.min;
        i = dur.next - 1;
        continue;
      }
    }

    // время: 16:00 / в 9 (предлог обработан выше) / 14-30
    const t = parseTimeToken(wl);
    if (t != null && res.time == null) {
      res.time = t;
      continue;
    }

    // даты
    const d = parseDateToken(words, i, wl, today);
    if (d) {
      res.date = d.date;
      i = d.next - 1;
      continue;
    }

    // слоты
    if (wl === 'утром' || wl === 'утро') { res.slot = res.slot || 'morning'; continue; }
    if (wl === 'днём' || wl === 'днем' || wl === 'день') { res.slot = res.slot || 'afternoon'; continue; }
    if (wl === 'вечером' || wl === 'вечер') { res.slot = res.slot || 'evening'; continue; }

    keep.push(w);
  }

  res.title = keep.join(' ').replace(/\s+/g, ' ').trim();
  if (!res.date && res.time) res.date = today;
  return res;
}

function parseDuration(words, i) {
  const w = words[i].toLowerCase();
  if (w === 'полчаса') return { min: 30, next: i + 1 };
  if (/^полтора/.test(w)) return { min: 90, next: /^полтора\s*ч/.test(w) ? i + 1 : (i + 2) };
  if (w === 'полтора') return { min: 90, next: i + 2 }; // «полтора часа»

  const num = /^(\d+(?:[.,]\d+)?)(.*)$/.exec(w);
  if (!num) return null;
  const value = parseFloat(num[1].replace(',', '.'));
  let unit = num[2].replace(/^[,\s]+/, '');
  let next = i + 1;
  if (!unit) {
    if (i + 1 >= words.length) return null;
    unit = words[i + 1].toLowerCase();
    next = i + 2;
  }
  if (/^(ч|часа?|часов|h)(\s|$|,|;|\.|\?|!|$)/i.test(unit)) return { min: Math.round(value * 60), next };
  if (/^(м|мин|минуты?|минут|m)(\s|$|,|;|\.|\?|!|$)/i.test(unit)) return { min: Math.round(value), next };
  return null;
}

// «20.10» — дата (день.месяц); «16.00» — время
function parseDotNumber(w) {
  const m = /^(\d{1,2})\.(\d{2})$/.exec(w);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const asDate = a >= 1 && a <= 31 && b >= 1 && b <= 12;
  const asTime = a <= 23 && b <= 59;
  if (asDate) return true;
  if (asTime) return false;
  return null;
}

function parseTimeToken(w) {
  const isDate = parseDotNumber(w);
  if (isDate) return null;
  let m = /^(\d{1,2}):(\d{2})$/.exec(w) || /^(\d{1,2})-(\d{2})$/.exec(w);
  if (!m && isDate === false) m = /^(\d{1,2})\.(\d{2})$/.exec(w);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 24 && min < 60) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return null;
  }
  m = /^в?(\d{1,2})00$/.exec(w);
  if (m && Number(m[1]) < 24) return `${String(Number(m[1])).padStart(2, '0')}:00`;
  return null;
}

function parseDateToken(words, i, w, today) {
  if (w === 'сегодня') return { date: today, next: i + 1 };
  if (w === 'завтра') return { date: addDays(today, 1), next: i + 1 };
  if (w === 'послезавтра') return { date: addDays(today, 2), next: i + 1 };

  if (w === 'через') {
    let j = i + 1;
    let n = 1;
    let week = false;
    const numM = /^(\d+)(\s*(дн|нед))?/.exec((words[j] || '').toLowerCase());
    if (numM && /^\d+$/.test(numM[1])) {
      n = Number(numM[1]);
      j++;
    }
    const uw = (words[j] || '').toLowerCase();
    if (/^нед/.test(uw)) { week = true; j++; } else if (/^дн|^день|^дня|^дней/.test(uw)) { j++; } else if (!numM) return null;
    return { date: addDays(today, week ? n * 7 : n), next: j };
  }

  const wd = WD_MAP[w];
  if (wd) {
    const cur = dow(today);
    const diff = (wd - cur + 7) % 7; // если день совпадает — сегодня
    return { date: addDays(today, diff), next: i + 1 };
  }

  // 20.10 — ближайшая такая дата (в этом году или следующем)
  const dm = /^(\d{1,2})\.(\d{2})$/.exec(w);
  if (dm && parseDotNumber(w) === true) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const year = new Date(`${today}T12:00:00Z`).getUTCFullYear();
    let date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date < today) date = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { date, next: i + 1 };
  }

  // 20 октября / 20 окт
  if (/^\d{1,2}(ое|е)?$/.test(w) && words[i + 1]) {
    const day = Number(/^\d{1,2}/.exec(w)[0]);
    const next = words[i + 1].toLowerCase().replace(/[,.;]$/, '');
    const mi = MONTH_PREFIX.findIndex((p) => next.startsWith(p));
    if (mi >= 0 && day >= 1 && day <= 31) {
      const year = new Date(`${today}T12:00:00Z`).getUTCFullYear();
      let date = `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (date < today) date = `${year + 1}${date.slice(4)}`;
      return { date, next: i + 2 };
    }
  }
  return null;
}

export function describeParsed(p) {
  const bits = [];
  if (p.date) bits.push(p.date === todayStr() ? 'сегодня' : (p.date === addDays(todayStr(), 1) ? 'завтра' : p.date));
  if (p.time) bits.push(p.time);
  if (p.duration_min) bits.push(`${p.duration_min} мин`);
  if (p.area) bits.push(`#${p.area}`);
  if (p.frog) bits.push('главное');
  return bits.join(', ');
}
