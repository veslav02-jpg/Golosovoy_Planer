// Экран «Рост»: Привычки (серии, % за месяц, сетка 14 дней, напоминание),
// Сферы (недельная цель в часах, «забытая» сфера), цикл 12 недель.
import React, { useMemo, useState } from 'react';
import { useStore, toggleHabit } from '../store.js';
import { useUI } from '../ui.js';
import {
  todayStr, addDays, dow, weekDates, monthDates, WD_SHORT,
} from '../lib/dates.js';

export default function Growth() {
  const [tab, setTab] = useState('habits');
  return (
    <div className="screen">
      <div className="seg">
        {[['habits', 'Привычки'], ['areas', 'Сферы'], ['cycle', 'Цикл 12 недель']].map(([id, label]) => (
          <button key={id} className={`seg-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'habits' && <Habits />}
      {tab === 'areas' && <Areas />}
      {tab === 'cycle' && <Cycle />}
    </div>
  );
}

function Habits() {
  const items = useStore((s) => s.items);
  const openModal = useUI((s) => s.openModal);
  const habits = Object.values(items).filter((i) => i.kind === 'habit' && !i.deleted);
  const today = todayStr();
  const grid = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)), [today]);

  return (
    <div className="section">
      <div className="section-head">
        <h3>Привычки</h3>
        <button className="chip" onClick={() => openModal({ type: 'habit' })}>+ привычка</button>
      </div>
      {habits.length === 0 && <div className="card muted">Добавьте первую привычку — например, «Зарядка».</div>}
      {habits.map((h) => {
        const logs = Object.values(items).filter((i) => i.kind === 'habit_log' && !i.deleted && i.data?.habit_id === h.id);
        const logDates = new Set(logs.map((l) => l.data?.date));
        const days = h.data?.days || [1, 2, 3, 4, 5, 6, 7];
        // серия: подряд идущие запланированные дни, отмеченные
        let serie = 0;
        for (let i = 0; i < 90; i++) {
          const d = addDays(today, -i);
          if (!days.includes(dow(d))) continue;
          if (logDates.has(d)) serie++;
          else if (d !== today) break;
        }
        // % за месяц: отмеченные / запланированные дни месяца до сегодня
        const month = monthDates(today.slice(0, 7));
        const planned = month.filter((d) => d <= today && days.includes(dow(d))).length;
        const doneM = month.filter((d) => d <= today && days.includes(dow(d)) && logDates.has(d)).length;
        const pct = planned ? Math.round((doneM / planned) * 100) : 0;

        return (
          <div key={h.id} className="card habit-card" onClick={() => openModal({ type: 'habit', payload: h.id })}>
            <div className="habit-head">
              <b>{h.data?.name || '—'}</b>
              <span className="muted small">{h.data?.reminder ? `⏰ ${h.data.reminder}` : ''}</span>
            </div>
            <div className="habit-stats muted small">
              <span>Серия: <b>{serie}</b></span>
              <span>Месяц: <b>{pct}%</b></span>
              <span>{days.map((d) => WD_SHORT[d - 1]).join(' ')}</span>
            </div>
            <div className="grid14">
              {grid.map((d) => {
                const plannedDay = days.includes(dow(d));
                const done = logDates.has(d);
                return (
                  <span key={d}
                    className={`g14 ${done ? 'done' : ''} ${plannedDay ? '' : 'off'} ${d === today ? 'today' : ''} ${plannedDay && !done && d < today ? 'missed' : ''}`}
                    title={d}
                    onClick={(e) => { e.stopPropagation(); if (plannedDay || done) toggleHabit(h.id, d); }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="muted small">Напоминание придёт сообщением от бота в указанное время (если бот подключён).</div>
    </div>
  );
}

function Areas() {
  const items = useStore((s) => s.items);
  const tasks = useStore((s) => s.tasks);
  const openModal = useUI((s) => s.openModal);
  const areas = Object.values(items).filter((i) => i.kind === 'area' && !i.deleted);
  const week = weekDates(todayStr());

  const stats = useMemo(() => areas.map((a) => {
    const name = a.data?.name || '—';
    const goal = Number(a.data?.weeklyGoalHours) || 0;
    const inWeek = Object.values(tasks).filter((t) => !t.deleted && t.area === name && t.date && week.includes(t.date));
    const doneMin = inWeek.filter((t) => t.done).reduce((s, t) => s + (t.duration_min || 0), 0);
    // «забытая» сфера: 0 часов за 7 дней
    const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayStr(), -i));
    const done7 = Object.values(tasks).filter((t) => !t.deleted && t.area === name && t.date && last7.includes(t.date) && t.done);
    return { id: a.id, name, goal, doneMin, forgotten: done7.length === 0 };
  }), [items, tasks]);

  return (
    <div className="section">
      <div className="section-head">
        <h3>Сферы</h3>
        <button className="chip" onClick={() => openModal({ type: 'area' })}>+ сфера</button>
      </div>
      {stats.length === 0 && <div className="card muted">Сферы — это крупные области жизни: Работа, Здоровье, Дом…</div>}
      {stats.map((a) => {
        const pct = a.goal ? Math.min(100, Math.round((a.doneMin / 60 / a.goal) * 100)) : 0;
        return (
          <div key={a.id} className="card" onClick={() => openModal({ type: 'area', payload: a.id })}>
            <div className="habit-head">
              <b>#{a.name}</b>
              {a.forgotten && <span className="chip warn">забыта 7 дней</span>}
            </div>
            <div className="muted small">Цель: {a.goal} ч/нед · сделано {Math.round((a.doneMin / 60) * 10) / 10} ч</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Cycle() {
  const items = useStore((s) => s.items);
  const saveItem = useStore((s) => s.saveItem);
  const cycle = items['cycle'];
  const data = cycle?.data || { start: todayStr(), goal: '', steps: [] };
  const today = todayStr();

  const weekNum = data.start ? Math.max(1, Math.min(12, Math.floor((Date.parse(today) - Date.parse(data.start)) / (7 * 86400000)) + 1)) : 1;
  const steps = data.steps || [];
  const weekSteps = steps.filter((s) => (s.week || 1) === weekNum);
  const done = weekSteps.filter((s) => s.done).length;
  const pct = weekSteps.length ? Math.round((done / weekSteps.length) * 100) : 0;

  const update = (patch) => saveItem('cycle', 'cycle', { ...data, ...patch });

  return (
    <div className="section">
      <h3>Цикл 12 недель</h3>
      <div className="card">
        <label className="field-label">Цель цикла</label>
        <input className="input" value={data.goal || ''} placeholder="Чего хотите достичь за 12 недель"
          onChange={(e) => update({ goal: e.target.value, start: data.start || today })} />
        <div className="cycle-weeks">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={`cw ${i + 1 === weekNum ? 'cur' : ''} ${i + 1 < weekNum ? 'past' : ''}`}>{i + 1}</span>
          ))}
        </div>
        <div className="muted small">Неделя {weekNum} из 12</div>
      </div>

      <div className="card">
        <div className="habit-head">
          <b>Шаги недели: {pct}%</b>
          <span className="muted small">линия 85%</span>
        </div>
        <div className="bar with-line">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
          <div className="bar-line" style={{ left: '85%' }} />
        </div>
        {weekSteps.map((s, i) => (
          <div key={i} className="row task-row" onClick={() => {
            const ns = steps.map((x) => (x === s ? { ...x, done: !x.done } : x));
            update({ steps: ns });
          }}>
            <button className="check">{s.done ? '✓' : ''}</button>
            <div className="row-main"><div className={`row-title ${s.done ? 'done' : ''}`}>{s.text}</div></div>
            <button className="chip" onClick={(e) => {
              e.stopPropagation();
              update({ steps: steps.filter((x) => x !== s) });
            }}>×</button>
          </div>
        ))}
        <StepAdd onAdd={(text) => update({ steps: [...steps, { week: weekNum, text, done: false }], start: data.start || today })} />
      </div>
      <div className="muted small">% недели = выполненные шаги / запланированные. Цель — держаться выше линии 85%.</div>
    </div>
  );
}

function StepAdd({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <div className="quick-input">
      <input className="input" placeholder="Новый шаг недели" value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onAdd(text.trim()); setText(''); } }} />
      <button className="btn small" onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(''); } }}>+</button>
    </div>
  );
}
