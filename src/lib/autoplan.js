// Автоплан дня: главное и глубокая работа в пик энергии, мелочи после пика,
// перерыв после блока, обед свободен. Детерминированный алгоритм с предпросмотром.
import { hhmm, parseHHMM } from './dates.js';

const BREAK_MIN = 15;
const LUNCH_DEFAULT = { start: 13 * 60, end: 14 * 60 };

// tasks: открытые задачи дня (done=false, deleted=false)
// settings: {workStart:'09:00', workEnd:'19:00', peakStart:'10:00', peakEnd:'13:00', headLimit:4}
export function autoplan(tasks, settings, { fixed = [] } = {}) {
  const workStart = parseHHMM(settings.workStart || '09:00') ?? 540;
  const workEnd = parseHHMM(settings.workEnd || '19:00') ?? 1140;
  const peakStart = parseHHMM(settings.peakStart || '10:00') ?? 600;
  const peakEnd = parseHHMM(settings.peakEnd || '13:00') ?? 780;
  const lunch = LUNCH_DEFAULT;

  // фиксированные (уже с временем) — не двигаем
  const fixedBlocks = (fixed.length ? fixed : tasks.filter((t) => t.time)).map((t) => ({
    id: t.id,
    title: t.title,
    start: parseHHMM(t.time),
    end: parseHHMM(t.time) + Math.max(15, t.duration_min || 30),
  })).filter((b) => b.start != null);

  const movable = tasks.filter((t) => !t.time && (t.duration_min > 0 || t.frog));
  // главное и глубокая работа — в пик; остальное — после
  const important = movable
    .filter((t) => t.frog || t.deep || t.priority === 1)
    .sort((a, b) => (b.duration_min || 0) - (a.duration_min || 0));
  const rest = movable
    .filter((t) => !important.includes(t))
    .sort((a, b) => (a.priority || 2) - (b.priority || 2) || (b.duration_min || 0) - (a.duration_min || 0));

  const busy = [...fixedBlocks];
  const blocks = [];

  const overlaps = (start, end) => busy.some((b) => start < b.end && end > b.start)
    || blocks.some((b) => start < b.end && end > b.start);

  const inLunch = (start, end) => start < lunch.end && end > lunch.start;

  function findSlot(duration, { preferPeak }) {
    // пробуем от подходящей точки, шаг 15 минут
    const windows = preferPeak
      ? [[Math.max(peakStart, workStart), Math.max(peakEnd, workStart)], [Math.max(peakEnd, workStart), workEnd]]
      : [[Math.max(peakEnd, workStart), workEnd], [Math.max(peakStart, workStart), Math.max(peakEnd, workStart)]];
    for (const [from, to] of windows) {
      for (let start = from; start + duration <= to; start += 15) {
        const end = start + duration;
        if (overlaps(start, end)) continue;
        if (inLunch(start, end)) continue;
        return start;
      }
    }
    return null;
  }

  for (const t of important) {
    const dur = Math.max(30, t.duration_min || 30);
    const start = findSlot(dur, { preferPeak: true });
    if (start == null) { blocks.push({ task: t, start: null, end: null, nofit: true }); continue; }
    blocks.push({ task: t, start, end: start + dur });
    busy.push({ id: t.id, start, end: start + dur }); // перерыв после блока
    busy.push({ id: `${t.id}-break`, start: start + dur, end: start + dur + BREAK_MIN });
  }
  for (const t of rest) {
    const dur = Math.max(15, t.duration_min || 15);
    const start = findSlot(dur, { preferPeak: false });
    if (start == null) { blocks.push({ task: t, start: null, end: null, nofit: true }); continue; }
    blocks.push({ task: t, start, end: start + dur });
    busy.push({ id: t.id, start, end: start + dur });
    busy.push({ id: `${t.id}-break`, start: start + dur, end: start + dur + BREAK_MIN });
  }

  const placed = blocks.filter((b) => b.start != null).sort((a, b) => a.start - b.start);
  const notFit = blocks.filter((b) => b.start == null).map((b) => b.task);

  return {
    blocks: placed.map((b) => ({
      task_id: b.task.id,
      title: b.task.title,
      start: hhmm(b.start),
      end: hhmm(b.end),
    })),
    notFit,
  };
}

// Применить план: проставить время задачам
export function applyPlan(tasks, plan) {
  const byId = new Map(plan.blocks.map((b) => [b.task_id, b]));
  return tasks.map((t) => {
    const b = byId.get(t.id);
    if (!b) return t;
    return { ...t, time: b.start, updated_at: new Date().toISOString() };
  });
}

// Шкалы загрузки: «Время» и «Голова»
export function dayLoad(tasks, settings) {
  const open = tasks.filter((t) => !t.done && !t.deleted);
  const minutes = open.reduce((s, t) => s + (t.duration_min || 0), 0);
  const workStart = parseHHMM(settings.workStart || '09:00') ?? 540;
  const workEnd = parseHHMM(settings.workEnd || '19:00') ?? 1140;
  const workday = Math.max(60, workEnd - workStart);
  const timeUsed = Math.round(minutes * 1.5);
  const timeCap = Math.round(workday * 0.65);
  const deepMin = open.filter((t) => t.deep || t.frog).reduce((s, t) => s + (t.duration_min || 0), 0);
  const headUsed = Math.round((deepMin / 60) * 10) / 10;
  const headCap = Number(settings.headLimit) || 4;
  return {
    timeUsed, timeCap,
    timePct: Math.round((timeUsed / timeCap) * 100),
    headUsed, headCap,
    headPct: Math.round((headUsed / headCap) * 100),
    overloaded: timeUsed > timeCap || headUsed > headCap,
  };
}
