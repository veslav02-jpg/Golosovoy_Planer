// Экран «Планы»: Входящие (без даты), Неделя (баланс по сферам, лёгкий день),
// Месяц (загрузка, очки, серия, рекорды).
import React, { useMemo, useState } from 'react';
import { useStore, useSettings } from '../store.js';
import { useUI } from '../ui.js';
import { TaskRow } from './Today.jsx';
import {
  todayStr, addDays, dow, weekDates, monthDates, monthKey, fmtDay, WD_SHORT, MONTHS_NOM,
} from '../lib/dates.js';
import { taskPoints, dayPoints, streak, recordsByWeekday } from '../lib/points.js';
import { parseHHMM } from '../lib/dates.js';

export default function Plans() {
  const [tab, setTab] = useState('inbox');
  return (
    <div className="screen">
      <div className="seg">
        {[['inbox', 'Входящие'], ['week', 'Неделя'], ['month', 'Месяц']].map(([id, label]) => (
          <button key={id} className={`seg-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'inbox' && <Inbox />}
      {tab === 'week' && <Week />}
      {tab === 'month' && <Month />}
    </div>
  );
}

function Inbox() {
  const tasks = useStore((s) => s.tasks);
  const saveTask = useStore((s) => s.saveTask);
  const openTask = useUI((s) => s.openTask);
  const openTaskNew = useUI((s) => s.openTaskNew);
  const list = Object.values(tasks)
    .filter((t) => !t.deleted && !t.date)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  return (
    <div className="section">
      <div className="section-head">
        <h3>Входящие</h3>
        <button className="chip" onClick={() => openTaskNew({ date: null })}>+ задача</button>
      </div>
      {list.length === 0 && <div className="card muted">Пусто. Задачи без даты попадают сюда.</div>}
      {list.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onDone={() => saveTask({ id: t.id, done: true })}>
          <div className="row-actions">
            <button className="chip" onClick={(e) => { e.stopPropagation(); saveTask({ id: t.id, date: todayStr() }); }}>сегодня</button>
            <button className="chip" onClick={(e) => { e.stopPropagation(); saveTask({ id: t.id, date: addDays(todayStr(), 1) }); }}>завтра</button>
          </div>
        </TaskRow>
      ))}
    </div>
  );
}

function dayLoadPct(tasks, date, settings) {
  const day = tasks.filter((t) => !t.deleted && t.date === date);
  const openMin = day.filter((t) => !t.done).reduce((s, t) => s + (t.duration_min || 0), 0);
  const workStart = parseHHMM(settings.workStart || '09:00') ?? 540;
  const workEnd = parseHHMM(settings.workEnd || '19:00') ?? 1140;
  return Math.round((openMin / Math.max(60, workEnd - workStart)) * 100);
}

function Week() {
  const tasks = useStore((s) => s.tasks);
  const items = useStore((s) => s.items);
  const saveItem = useStore((s) => s.saveItem);
  const settings = useSettings();
  const openTask = useUI((s) => s.openTask);
  const days = weekDates(todayStr());

  // баланс по сферам: запланировано и сделано часов за неделю
  const areas = useMemo(() => {
    const map = {};
    for (const t of Object.values(tasks)) {
      if (t.deleted || !t.date || !days.includes(t.date)) continue;
      const key = t.area || 'Без сферы';
      map[key] = map[key] || { planned: 0, done: 0 };
      map[key].planned += t.duration_min || 0;
      if (t.done) map[key].done += t.duration_min || 0;
    }
    return Object.entries(map).sort((a, b) => b[1].planned - a[1].planned);
  }, [tasks]);
  const maxPlanned = Math.max(60, ...areas.map(([, v]) => v.planned));

  return (
    <div className="section">
      <h3>Баланс по сферам</h3>
      {areas.length === 0 && <div className="card muted">На этой неделе задач с датой пока нет.</div>}
      {areas.map(([name, v]) => (
        <div key={name} className="area-balance">
          <div className="ab-head">
            <span>#{name}</span>
            <span className="muted small">{Math.round(v.done / 60)} ч из {Math.round(v.planned / 60)} ч</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(v.planned / maxPlanned) * 100}%` }} />
            <div className="bar-done" style={{ width: `${(v.done / maxPlanned) * 100}%` }} />
          </div>
        </div>
      ))}

      <h3>Дни</h3>
      {days.map((d) => {
        const day = Object.values(tasks).filter((t) => !t.deleted && t.date === d)
          .sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
        const load = dayLoadPct(Object.values(tasks), d, settings);
        const easy = items[`plan:${d}`]?.data?.easy;
        return (
          <div key={d} className={`card day-card ${d === todayStr() ? 'today' : ''}`}>
            <div className="day-head">
              <b>{fmtDay(d)}</b>
              <span className="muted small">{WD_SHORT[dow(d) - 1]}</span>
              <div className="bar slim"><div className={`bar-fill ${load > 100 ? 'over' : ''}`} style={{ width: `${Math.min(100, load)}%` }} /></div>
              <span className={`muted small ${load < 50 ? 'hint' : ''}`}>{load}%</span>
              <button
                className={`chip ${easy ? 'on' : ''}`}
                title="Отметить лёгким днём"
                onClick={() => saveItem('plan', `plan:${d}`, { easy: !easy })}
              >
                лёгкий
              </button>
            </div>
            {load < 50 && !easy && (
              <div className="muted small">Загрузка меньше половины — можно отметить лёгким днём.</div>
            )}
            {day.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onDone={() => useStore.getState().setDone(t.id)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Month() {
  const tasks = useStore((s) => s.tasks);
  const [ym, setYm] = useState(monthKey(todayStr()));
  const dates = monthDates(ym);
  const all = Object.values(tasks);
  const points = useMemo(() => Object.fromEntries(dates.map((d) => [d, dayPoints(all, d)])), [tasks, ym]);
  const total = Object.values(points).reduce((s, v) => s + v, 0);
  const serie = streak(all, todayStr(), addDays);
  const recs = recordsByWeekday(all, dates);
  const [y, m] = ym.split('-').map(Number);
  const firstDow = dow(dates[0]);

  return (
    <div className="section">
      <div className="month-nav">
        <button className="chip" onClick={() => setYm(shiftMonth(ym, -1))}>←</button>
        <b>{MONTHS_NOM[m - 1]} {y}</b>
        <button className="chip" onClick={() => setYm(shiftMonth(ym, 1))}>→</button>
      </div>

      <div className="month-stats">
        <div className="stat"><b>{total}</b><span className="muted small">очков</span></div>
        <div className="stat"><b>{serie}</b><span className="muted small">серия дней</span></div>
      </div>

      <div className="month-grid">
        {WD_SHORT.map((w) => <span key={w} className="mg-wd">{w}</span>)}
        {Array.from({ length: firstDow - 1 }).map((_, i) => <span key={`e${i}`} />)}
        {dates.map((d) => (
          <span key={d} className={`mg-day ${d === todayStr() ? 'today' : ''} ${points[d] > 0 ? 'has' : ''}`} title={`${d}: ${points[d]} очков`}>
            {Number(d.slice(8))}
            {points[d] > 0 && <i>{points[d]}</i>}
          </span>
        ))}
      </div>

      <h3>Рекорды по дням недели</h3>
      <div className="recs">
        {[1, 2, 3, 4, 5, 6, 7].map((w) => (
          <div key={w} className="rec">
            <span className="muted small">{WD_SHORT[w - 1]}</span>
            <div className="bar slim"><div className="bar-fill" style={{ width: `${Math.min(100, (recs[w] || 0) / 1.2)}%` }} /></div>
            <b className="small">{recs[w] || 0}</b>
          </div>
        ))}
      </div>
      <div className="muted small">Очки: 10 — до 30 мин · 25 — до 90 мин · 30 — дольше · 40 — главное дня.</div>
    </div>
  );
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const nm = m - 1 + delta;
  const ny = y + Math.floor(nm / 12);
  const mm = ((nm % 12) + 12) % 12 + 1;
  return `${ny}-${String(mm).padStart(2, '0')}`;
}
