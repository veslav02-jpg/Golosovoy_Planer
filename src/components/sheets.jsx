// Шторки и модалки: «+» (задача/привычка/заметка/таймер), редактор задачи,
// «Спланировать день» (шкалы + автоплан), «Завершить день» (3 шага), поиск Ctrl+K.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useSettings } from '../store.js';
import { useUI } from '../ui.js';
import { useTimers } from '../timers.js';
import { parseQuickInput, describeParsed } from '../lib/parse.js';
import { autoplan, dayLoad, applyPlan } from '../lib/autoplan.js';
import { REPEAT_LABELS } from '../lib/repeat.js';
import { todayStr, addDays, fmtDay, dow, WD_NOM, parseHHMM } from '../lib/dates.js';
import { TaskRow } from './Today.jsx';

export function Sheet({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet glass-strong ${wide ? 'wide' : ''}`}>
        <div className="sheet-head">
          <b>{title}</b>
          <button className="chip" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Единая шторка «+» ----------

export function QuickAdd({ payload }) {
  const saveItem = useStore((s) => s.saveItem);
  const addTimer = useTimers((s) => s.addTimer);
  const closeModal = useUI((s) => s.closeModal);
  const openTaskNew = useUI((s) => s.openTaskNew);
  const [tab, setTab] = useState(payload?.tab || 'task');
  const [habitName, setHabitName] = useState('');
  const [habitDays, setHabitDays] = useState([1, 2, 3, 4, 5, 6, 7]);
  const [habitReminder, setHabitReminder] = useState('');
  const [noteText, setNoteText] = useState('');
  const [timerLabel, setTimerLabel] = useState(payload?.label || '');
  const [timerMin, setTimerMin] = useState(25);

  return (
    <Sheet title="Добавить" onClose={closeModal}>
      <div className="seg wrap">
        {[['task', 'Задача'], ['habit', 'Привычка'], ['note', 'Заметка'], ['timer', 'Таймер']].map(([id, label]) => (
          <button key={id} className={`seg-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'task' && (
        <QuickTask onCreated={() => closeModal()} onCreateLong={() => { closeModal(); openTaskNew({ date: todayStr() }); }} />
      )}

      {tab === 'habit' && (
        <div className="form">
          <input className="input" placeholder="Название привычки" value={habitName}
            onChange={(e) => setHabitName(e.target.value)} autoFocus />
          <label className="field-label">Дни недели</label>
          <div className="wd-picker">
            {WD_NOM.map((n, i) => (
              <button key={n} className={`chip ${habitDays.includes(i + 1) ? 'on' : ''}`}
                onClick={() => setHabitDays(habitDays.includes(i + 1) ? habitDays.filter((d) => d !== i + 1) : [...habitDays, i + 1])}>
                {n.slice(0, 2)}
              </button>
            ))}
          </div>
          <label className="field-label">Напоминание (сообщение от бота)</label>
          <input type="time" className="input" value={habitReminder} onChange={(e) => setHabitReminder(e.target.value)} />
          <button className="btn" disabled={!habitName.trim()}
            onClick={() => { saveItem('habit', crypto.randomUUID(), { name: habitName.trim(), days: habitDays, reminder: habitReminder || null }); closeModal(); }}>
            Добавить привычку
          </button>
        </div>
      )}

      {tab === 'note' && (
        <div className="form">
          <textarea className="input" rows={4} placeholder="Текст заметки" value={noteText}
            onChange={(e) => setNoteText(e.target.value)} autoFocus />
          <button className="btn" disabled={!noteText.trim()}
            onClick={() => { saveItem('note', crypto.randomUUID(), { text: noteText.trim() }); closeModal(); }}>
            Добавить заметку
          </button>
        </div>
      )}

      {tab === 'timer' && (
        <div className="form">
          <input className="input" placeholder="Над чем работаете?" value={timerLabel}
            onChange={(e) => setTimerLabel(e.target.value)} autoFocus />
          <div className="timer-presets">
            <button className="chip" onClick={() => { addTimer(timerLabel || 'Фокус', 25); closeModal(); }}>25</button>
            <button className="chip" onClick={() => { addTimer(timerLabel || 'Фокус', 50); closeModal(); }}>50</button>
            <div className="inline-num">
              <input type="number" min="1" max="180" value={timerMin}
                onChange={(e) => setTimerMin(Number(e.target.value) || 25)} /> мин
            </div>
          </div>
          <button className="btn" onClick={() => { addTimer(timerLabel || 'Фокус', timerMin); closeModal(); }}>
            Запустить таймер
          </button>
          <div className="muted small">Таймеры локальные — не синхронизируются. Можно запустить несколько.</div>
        </div>
      )}
    </Sheet>
  );
}

function QuickTask({ onCreated, onCreateLong }) {
  const saveTask = useStore((s) => s.saveTask);
  const showToast = useStore((s) => s.showToast);
  const [q, setQ] = useState('');
  const p = parseQuickInput(q);

  const submit = () => {
    if (!p.title) return;
    saveTask({ ...p, date: p.date || todayStr() });
    showToast(`Добавлено: ${p.title}${describeParsed(p) ? ` · ${describeParsed(p)}` : ''}`);
    onCreated();
  };

  return (
    <div className="form">
      <input className="input" placeholder="созвон 1.5ч в 16:00 завтра #работа !" value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus />
      {q.trim() && (
        <div className="muted small">
          → {p.title || '…'} {describeParsed(p) && `· ${describeParsed(p)}`}
        </div>
      )}
      <div className="btn-row">
        <button className="btn" disabled={!p.title} onClick={submit}>Добавить</button>
        <button className="btn ghost" onClick={onCreateLong}>Заполнить полностью</button>
      </div>
    </div>
  );
}

// ---------- Редактор задачи ----------

export function TaskSheet({ payload }) {
  const tasks = useStore((s) => s.tasks);
  const items = useStore((s) => s.items);
  const saveTask = useStore((s) => s.saveTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setDone = useStore((s) => s.setDone);
  const closeModal = useUI((s) => s.closeModal);
  const showToast = useStore((s) => s.showToast);
  const isNew = payload?._new;
  const existing = !isNew ? tasks[payload] : null;

  const [d, setD] = useState(() => ({
    title: '', time: null, slot: 'anytime', duration_min: 0,
    area: null, priority: 2, note: null, deep: false, frog: false,
    repeat: null, checklist: [],
    ...(existing || {}),
    date: (existing ? existing.date : payload?.date) ?? null,
  }));
  const [checkText, setCheckText] = useState('');
  const areas = Object.values(items).filter((i) => i.kind === 'area' && !i.deleted);
  const up = (patch) => setD((x) => ({ ...x, ...patch }));

  const save = () => {
    if (!d.title.trim()) { showToast('Напишите название задачи', 'err'); return; }
    saveTask({ ...d, title: d.title.trim(), id: existing ? existing.id : undefined });
    closeModal();
  };

  return (
    <Sheet title={existing ? 'Задача' : 'Новая задача'} onClose={closeModal}>
      <div className="form">
        <input className="input big" placeholder="Что сделать?" value={d.title}
          onChange={(e) => up({ title: e.target.value })} autoFocus />

        <div className="grid2">
          <div>
            <label className="field-label">Дата</label>
            <input type="date" className="input" value={d.date || ''}
              onChange={(e) => up({ date: e.target.value || null })} />
          </div>
          <div>
            <label className="field-label">Время</label>
            <input type="time" className="input" value={d.time || ''}
              onChange={(e) => up({ time: e.target.value || null })} />
          </div>
        </div>

        <label className="field-label">Длительность</label>
        <div className="chips">
          {[0, 15, 30, 45, 60, 90, 120].map((m) => (
            <button key={m} className={`chip ${d.duration_min === m ? 'on' : ''}`} onClick={() => up({ duration_min: m })}>
              {m === 0 ? '—' : `${m} мин`}
            </button>
          ))}
        </div>

        <label className="field-label">Когда (если без времени)</label>
        <div className="chips">
          {[['morning', 'Утром'], ['afternoon', 'Днём'], ['evening', 'Вечером'], ['anytime', 'Когда угодно']].map(([v, l]) => (
            <button key={v} className={`chip ${d.slot === v ? 'on' : ''}`} onClick={() => up({ slot: v })}>{l}</button>
          ))}
        </div>

        <label className="field-label">Приоритет</label>
        <div className="chips">
          <button className={`chip ${d.priority === 1 ? 'on' : ''}`} onClick={() => up({ priority: 1 })}>! важно</button>
          <button className={`chip ${d.priority === 2 ? 'on' : ''}`} onClick={() => up({ priority: 2 })}>обычная</button>
          <button className={`chip ${d.priority === 3 ? 'on' : ''}`} onClick={() => up({ priority: 3 })}>~ не срочно</button>
        </div>

        <label className="field-label">Сфера</label>
        <div className="chips">
          <button className={`chip ${!d.area ? 'on' : ''}`} onClick={() => up({ area: null })}>—</button>
          {areas.map((a) => (
            <button key={a.id} className={`chip ${d.area === a.data.name ? 'on' : ''}`}
              onClick={() => up({ area: a.data.name })}>#{a.data.name}</button>
          ))}
        </div>

        <div className="chips">
          <button className={`chip ${d.deep ? 'on' : ''}`} onClick={() => up({ deep: !d.deep })}>🧠 глубокая работа</button>
          <button className={`chip frog-chip ${d.frog ? 'on' : ''}`} onClick={() => up({ frog: !d.frog })}>★ главное на день</button>
        </div>

        <label className="field-label">Повтор</label>
        <div className="chips wrap">
          <button className={`chip ${!d.repeat ? 'on' : ''}`} onClick={() => up({ repeat: null })}>нет</button>
          {['daily', 'weekdays', 'week', 'monthly'].map((tp) => (
            <button key={tp} className={`chip ${d.repeat?.type === tp ? 'on' : ''}`}
              onClick={() => up({ repeat: tp === 'week' ? { type: tp, days: d.repeat?.days || [1, 2, 3, 4, 5] } : { type: tp } })}>
              {REPEAT_LABELS[tp]}
            </button>
          ))}
        </div>
        {d.repeat?.type === 'week' && (
          <div className="wd-picker">
            {WD_NOM.map((n, i) => (
              <button key={n} className={`chip ${d.repeat.days.includes(i + 1) ? 'on' : ''}`}
                onClick={() => up({ repeat: { ...d.repeat, days: d.repeat.days.includes(i + 1) ? d.repeat.days.filter((x) => x !== i + 1) : [...d.repeat.days, i + 1] } })}>
                {n.slice(0, 2)}
              </button>
            ))}
          </div>
        )}

        <label className="field-label">Подзадачи</label>
        {(d.checklist || []).map((c, i) => (
          <div key={i} className="row task-row slim">
            <button className="check" onClick={() => up({ checklist: d.checklist.map((x, k) => (k === i ? { ...x, done: !x.done } : x)) })}>
              {c.done ? '✓' : ''}
            </button>
            <div className={`row-main row-title ${c.done ? 'done' : ''}`}>{c.text}</div>
            <button className="chip" onClick={() => up({ checklist: d.checklist.filter((_, k) => k !== i) })}>×</button>
          </div>
        ))}
        <div className="quick-input">
          <input className="input" placeholder="Добавить подзадачу…" value={checkText}
            onChange={(e) => setCheckText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && checkText.trim()) { up({ checklist: [...(d.checklist || []), { text: checkText.trim(), done: false }] }); setCheckText(''); } }} />
          <button className="btn small" onClick={() => { if (checkText.trim()) { up({ checklist: [...(d.checklist || []), { text: checkText.trim(), done: false }] }); setCheckText(''); } }}>+</button>
        </div>

        <label className="field-label">Заметка</label>
        <textarea className="input" rows={2} value={d.note || ''} onChange={(e) => up({ note: e.target.value })} />

        <div className="btn-row">
          {existing && <button className="btn ghost" onClick={() => { setDone(existing.id, !existing.done); closeModal(); }}>
            {existing.done ? 'Вернуть' : 'Готово'}
          </button>}
          <button className="btn" onClick={save}>Сохранить</button>
          {existing && <button className="btn danger" onClick={() => { deleteTask(existing.id); closeModal(); }}>Удалить</button>}
        </div>
        {existing && existing.source === 'voice' && <div className="muted small">Добавлено голосом 🎙</div>}
      </div>
    </Sheet>
  );
}

// ---------- Редактор привычки / сферы ----------

export function HabitSheet({ payload }) {
  const items = useStore((s) => s.items);
  const saveItem = useStore((s) => s.saveItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const closeModal = useUI((s) => s.closeModal);
  const existing = payload ? items[payload] : null;
  const [name, setName] = useState(existing?.data?.name || '');
  const [days, setDays] = useState(existing?.data?.days || [1, 2, 3, 4, 5, 6, 7]);
  const [reminder, setReminder] = useState(existing?.data?.reminder || '');

  return (
    <Sheet title={existing ? 'Привычка' : 'Новая привычка'} onClose={closeModal}>
      <div className="form">
        <input className="input big" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="field-label">Дни недели</label>
        <div className="wd-picker">
          {WD_NOM.map((n, i) => (
            <button key={n} className={`chip ${days.includes(i + 1) ? 'on' : ''}`}
              onClick={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])}>
              {n.slice(0, 2)}
            </button>
          ))}
        </div>
        <label className="field-label">Напоминание от бота</label>
        <input type="time" className="input" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        <div className="btn-row">
          <button className="btn" disabled={!name.trim()}
            onClick={() => { saveItem('habit', existing?.id || crypto.randomUUID(), { name: name.trim(), days, reminder: reminder || null }); closeModal(); }}>
            Сохранить
          </button>
          {existing && <button className="btn danger" onClick={() => { deleteItem(existing.id); closeModal(); }}>Удалить</button>}
        </div>
      </div>
    </Sheet>
  );
}

export function AreaSheet({ payload }) {
  const items = useStore((s) => s.items);
  const saveItem = useStore((s) => s.saveItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const closeModal = useUI((s) => s.closeModal);
  const existing = payload ? items[payload] : null;
  const [name, setName] = useState(existing?.data?.name || '');
  const [goal, setGoal] = useState(existing?.data?.weeklyGoalHours || 5);

  return (
    <Sheet title={existing ? 'Сфера' : 'Новая сфера'} onClose={closeModal}>
      <div className="form">
        <input className="input big" placeholder="Название (Работа, Здоровье…)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="field-label">Недельная цель, часов</label>
        <input type="number" min="0" max="80" className="input" value={goal} onChange={(e) => setGoal(Number(e.target.value) || 0)} />
        <div className="btn-row">
          <button className="btn" disabled={!name.trim()}
            onClick={() => { saveItem('area', existing?.id || `area:${name.trim().toLowerCase()}`, { name: name.trim(), weeklyGoalHours: goal }); closeModal(); }}>
            Сохранить
          </button>
          {existing && <button className="btn danger" onClick={() => { deleteItem(existing.id); closeModal(); }}>Удалить</button>}
        </div>
      </div>
    </Sheet>
  );
}

// ---------- Спланировать день ----------

export function PlanDayModal({ payload: date }) {
  const tasks = useStore((s) => s.tasks);
  const saveTask = useStore((s) => s.saveTask);
  const showToast = useStore((s) => s.showToast);
  const closeModal = useUI((s) => s.closeModal);
  const settings = useSettings();
  const [moveIds, setMoveIds] = useState([]);
  const [plan, setPlan] = useState(null);

  const all = Object.values(tasks);
  const dayTasks = all.filter((t) => !t.deleted && t.date === date);
  const openTasks = dayTasks.filter((t) => !t.done);
  const tails = all.filter((t) => !t.deleted && !t.done && t.date && t.date < date);
  const load = dayLoad(dayTasks, settings);
  const loadAfterTails = dayLoad([...dayTasks, ...tails], settings);

  const doAutoplan = () => {
    const result = autoplan(openTasks, settings);
    setPlan(result);
  };

  const apply = () => {
    for (const t of applyPlan(openTasks, plan)) {
      if (t.time !== openTasks.find((x) => x.id === t.id)?.time) {
        saveTask({ id: t.id, time: t.time });
      }
    }
    showToast('План применён');
    closeModal();
  };

  const moveTomorrow = () => {
    for (const id of moveIds) saveTask({ id, date: addDays(date, 1) });
    showToast(`Перенесено на завтра: ${moveIds.length}`);
    closeModal();
  };

  const pullTails = () => {
    for (const t of tails) saveTask({ id: t.id, date });
    showToast(`Хвостов на сегодня: ${tails.length}`);
  };

  return (
    <Sheet title={`Спланировать день · ${fmtDay(date)}`} onClose={closeModal}>
      <div className="scales">
        <Scale label="Время" used={load.timeUsed} cap={load.timeCap} pct={load.timePct}
          hint={`открытые задачи ×1,5 против 65% рабочего дня`} />
        <Scale label="Голова" used={load.headUsed} cap={load.headCap} pct={load.headPct}
          hint="глубокая работа и главное против лимита" />
      </div>

      {tails.length > 0 && (
        <div className="card">
          <b>Хвосты с прошлых дней: {tails.length}</b>
          <div className="muted small">
            {loadAfterTails.overloaded
              ? '⚠ Если всё перенести, день станет перегружен.'
              : 'Можно подтянуть на сегодня.'}
          </div>
          <button className="btn small ghost" onClick={pullTails}>Все хвосты на сегодня</button>
        </div>
      )}

      {openTasks.length > 0 ? (
        <div className="card">
          <b>Перенести на завтра</b>
          <div className="muted small">По умолчанию ничего не отмечено.</div>
          {openTasks.map((t) => (
            <div key={t.id} className="row task-row slim" onClick={() => setMoveIds(moveIds.includes(t.id) ? moveIds.filter((x) => x !== t.id) : [...moveIds, t.id])}>
              <button className="check">{moveIds.includes(t.id) ? '✓' : ''}</button>
              <div className="row-main">
                <div className="row-title">{t.title}</div>
                <div className="muted small">{[t.time, t.duration_min ? `${t.duration_min} мин` : '', t.area ? `#${t.area}` : ''].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
          <button className="btn small ghost" disabled={!moveIds.length} onClick={moveTomorrow}>
            Перенести ({moveIds.length})
          </button>
        </div>
      ) : (
        <div className="card muted">Открытых задач на этот день нет.</div>
      )}

      {plan && (
        <div className="card">
          <b>Автоплан</b>
          {plan.blocks.map((b) => (
            <div key={b.task_id} className="row slim">
              <span className="mono small">{b.start}–{b.end}</span>
              <span className="row-title">{b.title}</span>
            </div>
          ))}
          {plan.notFit.length > 0 && (
            <div className="muted small">⚠ Не влезло: {plan.notFit.map((t) => t.title).join(', ')}</div>
          )}
        </div>
      )}

      <div className="btn-row">
        {!plan
          ? <button className="btn" disabled={!openTasks.length} onClick={doAutoplan}>Автоплан</button>
          : <>
            <button className="btn" onClick={apply}>Применить</button>
            <button className="btn ghost" onClick={() => setPlan(null)}>Отмена</button>
          </>}
      </div>
    </Sheet>
  );
}

function Scale({ label, used, cap, pct, hint }) {
  return (
    <div className="scale">
      <div className="scale-head">
        <b>{label}</b>
        <span className={`muted small ${pct > 100 ? 'over' : ''}`}>{used} / {cap}{label === 'Голова' ? ' ч' : ' мин'} · {pct}%</span>
      </div>
      <div className="bar"><div className={`bar-fill ${pct > 100 ? 'over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <div className="muted small">{hint}</div>
    </div>
  );
}

// ---------- Завершить день (3 шага) ----------

export function FinishDay({ payload: date }) {
  const tasks = useStore((s) => s.tasks);
  const saveTask = useStore((s) => s.saveTask);
  const saveItem = useStore((s) => s.saveItem);
  const closeModal = useUI((s) => s.closeModal);
  const showToast = useStore((s) => s.showToast);
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [good, setGood] = useState('');
  const [note, setNote] = useState('');

  const undone = Object.values(tasks).filter((t) => !t.deleted && !t.done && t.date === date);

  const finish = () => {
    saveItem('day', `day:${date}`, { mood, energy, good, note });
    showToast('День завершён. Хорошая работа!');
    closeModal();
  };

  return (
    <Sheet title={`Завершить день · ${fmtDay(date)}`} onClose={closeModal}>
      {step === 0 && (
        <div className="form">
          <b>Разбор несделанного ({undone.length})</b>
          {undone.length === 0 && <div className="muted">Всё сделано — так держать!</div>}
          {undone.map((t) => (
            <div key={t.id} className="row task-row">
              <div className="row-main">
                <div className="row-title">{t.title}</div>
              </div>
              <div className="row-actions wrap">
                <button className="chip" onClick={() => saveTask({ id: t.id, done: true })}>сделано</button>
                <button className="chip" onClick={() => saveTask({ id: t.id, date: addDays(date, 1) })}>завтра</button>
                <button className="chip" onClick={() => saveTask({ id: t.id, date: null })}>во входящие</button>
                <button className="chip warn" onClick={() => saveTask({ id: t.id, deleted: true })}>удалить</button>
              </div>
            </div>
          ))}
          <button className="btn" onClick={() => setStep(1)}>Дальше</button>
        </div>
      )}
      {step === 1 && (
        <div className="form">
          <b>Как прошёл день?</b>
          <label className="field-label">Настроение: {mood}/5</label>
          <div className="chips">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} className={`chip ${mood === v ? 'on' : ''}`} onClick={() => setMood(v)}>{[' :( ', ' :(', ' :|', ':)', ':D'][v - 1]}</button>
            ))}
          </div>
          <label className="field-label">Энергия: {energy}/5</label>
          <div className="chips">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} className={`chip ${energy === v ? 'on' : ''}`} onClick={() => setEnergy(v)}>{v}</button>
            ))}
          </div>
          <label className="field-label">Что хорошего произошло?</label>
          <input className="input" value={good} onChange={(e) => setGood(e.target.value)}
            placeholder="Даже мелочь считается" />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setStep(0)}>Назад</button>
            <button className="btn" onClick={() => setStep(2)}>Дальше</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="form">
          <b>Заметка о дне</b>
          <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Что вспомнить завтра?" />
          <button className="btn" onClick={finish}>Завершить день</button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Поиск Ctrl+K ----------

export function SearchModal() {
  const tasks = useStore((s) => s.tasks);
  const items = useStore((s) => s.items);
  const openTask = useUI((s) => s.openTask);
  const closeModal = useUI((s) => s.closeModal);
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    const t = Object.values(tasks)
      .filter((x) => !x.deleted && x.title.toLowerCase().includes(ql))
      .slice(0, 8);
    const n = Object.values(items)
      .filter((x) => x.kind === 'note' && !x.deleted && (x.data?.text || '').toLowerCase().includes(ql))
      .slice(0, 5);
    return [
      ...t.map((x) => ({ kind: 'task', id: x.id, title: x.title, sub: [x.date && fmtDay(x.date), x.time].filter(Boolean).join(' ') })),
      ...n.map((x) => ({ kind: 'note', id: x.id, title: (x.data?.text || '').slice(0, 80), sub: 'заметка' })),
    ];
  }, [q, tasks, items]);

  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="sheet glass-strong search-sheet">
        <input className="input big" placeholder="Поиск задач и заметок…" value={q}
          onChange={(e) => setQ(e.target.value)} autoFocus />
        {results.map((r) => (
          <div key={r.kind + r.id} className="row task-row" onClick={() => {
            if (r.kind === 'task') openTask(r.id);
            closeModal();
          }}>
            <div className="row-main">
              <div className="row-title">{r.title}</div>
              {r.sub && <div className="muted small">{r.sub}</div>}
            </div>
          </div>
        ))}
        {q && !results.length && <div className="muted" style={{ padding: 12 }}>Ничего не нашлось</div>}
      </div>
    </div>
  );
}
