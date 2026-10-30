// Экран «Сегодня»: карточка «Сейчас», лента недели, быстрый ввод, план дня блоками,
// задачи без времени, хвосты, привычки, «Спланировать день», «Завершить день».
import React, { useMemo, useState } from 'react';
import { useStore, useSettings, useHabitDone, toggleHabit } from '../store.js';
import { useUI } from '../ui.js';
import { parseQuickInput, describeParsed } from '../lib/parse.js';
import { todayStr, addDays, dow, fmtDay, WD_SHORT, parseHHMM, hhmm } from '../lib/dates.js';
import DayPlan from './DayPlan.jsx';

export default function Today() {
  const tasks = useStore((s) => s.tasks);
  const items = useStore((s) => s.items);
  const saveTask = useStore((s) => s.saveTask);
  const setDone = useStore((s) => s.setDone);
  const moveToDate = useStore((s) => s.saveTask);
  const showToast = useStore((s) => s.showToast);
  const openModal = useUI((s) => s.openModal);
  const openTask = useUI((s) => s.openTask);
  const settings = useSettings();

  const [date, setDate] = useState(todayStr());
  const [q, setQ] = useState('');
  const today = todayStr();
  const isToday = date === today;

  const all = Object.values(tasks);
  const dayTasks = useMemo(
    () => all.filter((t) => !t.deleted && t.date === date),
    [tasks, date],
  );
  const withTime = dayTasks.filter((t) => t.time).sort((a, b) => (a.time < b.time ? -1 : 1));
  const noTime = dayTasks.filter((t) => !t.time);
  const tails = useMemo(
    () => (isToday ? all.filter((t) => !t.deleted && !t.done && t.date && t.date < today) : []),
    [tasks, isToday],
  );
  const oldTails = tails.filter((t) => t.date < addDays(today, -7));
  const habits = useMemo(
    () => Object.values(items).filter((i) => i.kind === 'habit' && !i.deleted
      && (!Array.isArray(i.data?.days) || !i.data.days.length || i.data.days.includes(dow(date)))),
    [items, date],
  );

  const nowTask = !isToday ? null : withTime.find((t) => {
    const s = parseHHMM(t.time);
    return s != null && s <= nowMinutes() && nowMinutes() < s + Math.max(15, t.duration_min || 30);
  }) || withTime.find((t) => parseHHMM(t.time) != null && parseHHMM(t.time) > nowMinutes());

  const week = useMemo(() => {
    const start = addDays(date, 1 - dow(date));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  const submitQuick = () => {
    const text = q.trim();
    if (!text) return;
    const p = parseQuickInput(text);
    if (!p.title) { showToast('Не понял задачу — напишите текст', 'err'); return; }
    saveTask({ ...p, date: p.date || date, slot: p.slot || (p.time ? null : 'anytime') });
    setQ('');
    showToast(`Добавлено: ${p.title}${describeParsed(p) ? ` · ${describeParsed(p)}` : ''}`);
  };

  return (
    <div className="screen today">
      {/* Лента недели */}
      <div className="week-strip">
        {week.map((d) => {
          const count = all.filter((t) => !t.deleted && t.date === d && !t.done).length;
          return (
            <button key={d} className={`week-day ${d === date ? 'active' : ''} ${d === todayStr() ? 'today' : ''}`}
              onClick={() => setDate(d)}>
              <span className="wd">{WD_SHORT[dow(d) - 1]}</span>
              <span className="wd-num">{Number(d.slice(8))}</span>
              {count > 0 && <span className="wd-dot" />}
            </button>
          );
        })}
      </div>

      <h2 className="screen-title">{fmtDay(date)}</h2>

      {/* Карточка «Сейчас» */}
      {isToday && (
        <div className="card now-card">
          {nowTask ? (
            <>
              <div className="now-label">{nowTask.done ? 'Следующее' : 'Сейчас'}</div>
              <div className={`now-title ${nowTask.done ? 'done' : ''}`}>{nowTask.title}</div>
              <div className="now-meta muted">
                {nowTask.time && `${nowTask.time}${nowTask.duration_min ? ` · ${nowTask.duration_min} мин` : ''}`}
                {nowTask.frog && <span className="chip frog-chip">★ главное</span>}
              </div>
              <div className="now-actions">
                <button className="btn small" onClick={() => openTask(nowTask.id)}>Открыть</button>
                {!nowTask.done && (
                  <>
                    <button className="btn small ghost" onClick={() => openModal({ type: 'quick', payload: { tab: 'timer', label: nowTask.title } })}>Фокус</button>
                    <button className="btn small" onClick={() => setDone(nowTask.id)}>Готово</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="now-label">Сейчас</div>
              <div className="now-title muted">Задач на время нет</div>
              <div className="muted small">Добавьте задачу внизу или нажмите «Спланировать день»</div>
            </>
          )}
        </div>
      )}

      {/* Быстрый ввод */}
      <div className="quick-input">
        <input
          className="input"
          placeholder="созвон 1.5ч в 16:00 завтра #работа !"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitQuick()}
        />
        {q.trim() && <button className="btn small" onClick={submitQuick}>Добавить</button>}
      </div>

      <div className="today-columns">
        <div className="today-main">
          {/* Задачи без времени */}
          {noTime.length > 0 && (
            <div className="section">
              <h3>Без времени</h3>
              {noTime.sort((a, b) => (a.slot || 'anytime').localeCompare(b.slot || 'anytime')).map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)}
                  onDone={() => setDone(t.id)} />
              ))}
            </div>
          )}

          {/* Хвосты с прошлых дней */}
          {tails.length > 0 && (
            <div className="section tails">
              <h3>Хвосты <span className="muted small">{tails.length}</span></h3>
              {tails.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} onDone={() => setDone(t.id)}>
                  <div className="row-actions">
                    <span className="muted small">{fmtDay(t.date)}</span>
                    <button className="chip" onClick={() => moveToDate({ id: t.id, date: today })}>на сегодня</button>
                    {t.date < addDays(today, -7) && (
                      <button className="chip" onClick={() => moveToDate({ id: t.id, date: null })}>во входящие</button>
                    )}
                  </div>
                </TaskRow>
              ))}
            </div>
          )}

          {/* Привычки на день */}
          {habits.length > 0 && (
            <div className="section">
              <h3>Привычки</h3>
              <div className="habits-row">
                {habits.map((h) => <HabitChip key={h.id} habit={h} date={date} />)}
              </div>
            </div>
          )}

          {/* Кнопки дня */}
          <div className="today-actions">
            <button className="btn ghost" onClick={() => openModal({ type: 'planday', payload: date })}>
              ⚡ Спланировать день
            </button>
            {isToday && (
              <button className="btn ghost" onClick={() => openModal({ type: 'finish', payload: date })}>
                🌙 Завершить день
              </button>
            )}
          </div>
        </div>

        {/* План дня блоками (на десктопе — правая колонка) */}
        <div className="today-plan">
          <DayPlan date={date} tasks={withTime} />
        </div>
      </div>
    </div>
  );
}

export function TaskRow({ task: t, onOpen, onDone, children }) {
  return (
    <div className={`row task-row ${t.done ? 'done' : ''} ${t.frog ? 'frog' : ''}`} onClick={onOpen}>
      <button className="check" aria-label="Готово"
        onClick={(e) => { e.stopPropagation(); onDone && onDone(); }}>
        {t.done ? '✓' : ''}
      </button>
      <div className="row-main">
        <div className="row-title">{t.title}</div>
        <div className="row-meta muted small">
          {t.time && <span>{t.time}</span>}
          {t.duration_min > 0 && <span>{t.duration_min} мин</span>}
          {t.area && <span className="area-chip">#{t.area}</span>}
          {t.deep && <span>🧠</span>}
          {t.priority === 1 && <span className="imp">!</span>}
          {t.priority === 3 && <span className="muted">~</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

function HabitChip({ habit, date }) {
  const done = useHabitDone(habit.id, date);
  return (
    <button className={`chip habit-chip ${done ? 'on' : ''}`}
      onClick={() => toggleHabit(habit.id, date)}>
      {done ? '✓ ' : ''}{habit.data?.name || '—'}
    </button>
  );
}

let _nowCache = { t: 0, min: 0 };
export function nowMinutes() {
  const t = Date.now();
  if (t - _nowCache.t > 30000) {
    const d = new Date();
    _nowCache = { t, min: d.getHours() * 60 + d.getMinutes() };
  }
  return _nowCache.min;
}
