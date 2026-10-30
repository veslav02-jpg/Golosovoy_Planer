// Экран «Ещё»: Таймеры (фокус 25/50, параллельные), Заметки с поиском,
// Экспорт месяца для Claude, Импорт JSON, Настройки (тема, мои часы, бот, Notion, ключ).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useSettings } from '../store.js';
import { useTimers } from '../timers.js';
import { api } from '../api.js';
import { buildExport, exportPrompt, parseImport } from '../lib/exportImport.js';
import { seedDemo } from '../lib/demo.js';
import { monthKey, MONTHS_NOM } from '../lib/dates.js';

export default function More() {
  const [tab, setTab] = useState('timers');
  return (
    <div className="screen">
      <div className="seg wrap">
        {[['timers', 'Таймеры'], ['notes', 'Заметки'], ['export', 'Экспорт'], ['import', 'Импорт'], ['settings', 'Настройки']].map(([id, label]) => (
          <button key={id} className={`seg-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'timers' && <Timers />}
      {tab === 'notes' && <Notes />}
      {tab === 'export' && <Export />}
      {tab === 'import' && <Import />}
      {tab === 'settings' && <SettingsScreen />}
    </div>
  );
}

function fmtLeft(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Timers() {
  const timers = useTimers((s) => s.timers);
  const addTimer = useTimers((s) => s.addTimer);
  const toggle = useTimers((s) => s.toggle);
  const restart = useTimers((s) => s.restart);
  const stop = useTimers((s) => s.stop);
  const [, force] = useState(0);
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(25);

  useEffect(() => {
    const iv = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const add = (min) => {
    addTimer(label.trim() || 'Фокус', min || minutes);
    setLabel('');
  };

  return (
    <div className="section">
      <h3>Таймеры</h3>
      <div className="card">
        <input className="input" placeholder="Над чем работаете? (необязательно)"
          value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="timer-presets">
          <button className="chip" onClick={() => add(25)}>Фокус 25</button>
          <button className="chip" onClick={() => add(50)}>Фокус 50</button>
          <div className="inline-num">
            <input type="number" min="1" max="180" value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 25)} /> мин
            <button className="chip" onClick={() => add(minutes)}>старт</button>
          </div>
        </div>
      </div>
      {timers.length === 0 && <div className="card muted">Таймеры живут локально и не синхронизируются. Можно запустить несколько параллельно.</div>}
      {timers.map((t) => {
        const st = useTimers.getState();
        const left = st.left(t.id);
        const total = t.total;
        return (
          <div key={t.id} className={`card timer ${t.done ? 'done' : ''}`}>
            <div className="timer-main">
              <b className="timer-left">{t.done ? 'Готово!' : fmtLeft(left)}</b>
              <span className="muted">{t.label}</span>
            </div>
            <div className="bar slim"><div className="bar-fill" style={{ width: `${t.done ? 100 : Math.round(((total - left) / total) * 100)}%` }} /></div>
            <div className="timer-actions">
              {!t.done && <button className="chip" onClick={() => toggle(t.id)}>{t.paused ? '▶' : '⏸'}</button>}
              {t.done && <button className="chip" onClick={() => restart(t.id)}>ещё раз</button>}
              <button className="chip" onClick={() => stop(t.id)}>×</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Notes() {
  const items = useStore((s) => s.items);
  const saveItem = useStore((s) => s.saveItem);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const notes = Object.values(items)
    .filter((i) => i.kind === 'note' && !i.deleted && (!q || (i.data?.text || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  return (
    <div className="section">
      <h3>Заметки</h3>
      <div className="quick-input">
        <input className="input" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="quick-input">
        <input className="input" placeholder="Новая заметка…" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { saveItem('note', crypto.randomUUID(), { text: text.trim() }); setText(''); } }} />
        <button className="btn small" onClick={() => { if (text.trim()) { saveItem('note', crypto.randomUUID(), { text: text.trim() }); setText(''); } }}>+</button>
      </div>
      {notes.length === 0 && <div className="card muted">Заметок нет.</div>}
      {notes.map((n) => (
        <div key={n.id} className="row task-row">
          <div className="row-main"><div className="row-title">{n.data?.text}</div></div>
          <button className="chip" onClick={() => useStore.getState().deleteItem(n.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

function Export() {
  const tasks = useStore((s) => s.tasks);
  const items = useStore((s) => s.items);
  const showToast = useStore((s) => s.showToast);
  const [month, setMonth] = useState(monthKey(new Date().toISOString().slice(0, 10)));
  const data = useMemo(() => buildExport(Object.values(tasks), Object.values(items), month), [tasks, items, month]);
  const json = JSON.stringify(data, null, 2);
  const prompt = exportPrompt(month).replace('__JSON__', json);
  const [view, setView] = useState('prompt');

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} скопирован`);
    } catch {
      showToast('Не удалось скопировать — выделите текст вручную', 'err');
    }
  };
  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planner-${month}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="section">
      <h3>Экспорт месяца для Claude</h3>
      <div className="quick-input">
        <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="seg">
        <button className={`seg-btn ${view === 'prompt' ? 'on' : ''}`} onClick={() => setView('prompt')}>Промпт</button>
        <button className={`seg-btn ${view === 'json' ? 'on' : ''}`} onClick={() => setView('json')}>JSON</button>
      </div>
      <textarea className="input mono export-area" readOnly value={view === 'prompt' ? prompt : json} />
      <div className="btn-row">
        <button className="btn small" onClick={() => copy(view === 'prompt' ? prompt : json, view === 'prompt' ? 'Промпт' : 'JSON')}>Копировать</button>
        <button className="btn small ghost" onClick={download}>Скачать .json</button>
      </div>
      <div className="muted small">Задач: {data.tasks.length} · итогов дня: {data.days.length} · привычек: {data.habits.length}</div>
    </div>
  );
}

function Import() {
  const saveTask = useStore((s) => s.saveTask);
  const saveItem = useStore((s) => s.saveItem);
  const showToast = useStore((s) => s.showToast);
  const tasks = useStore((s) => s.tasks);
  const items = useStore((s) => s.items);
  const [text, setText] = useState('');

  const doImport = () => {
    try {
      const { tasks: t, items: i, skipped } = parseImport(text, tasks, items);
      for (const x of t) saveTask(x);
      for (const x of i) saveItem(x.kind, x.id, x.data);
      showToast(`Импортировано: ${t.length} задач, ${i.length} привычек${skipped ? `, пропущено дублей: ${skipped}` : ''}`);
      setText('');
    } catch (e) {
      showToast(e.message, 'err');
    }
  };

  return (
    <div className="section">
      <h3>Импорт JSON</h3>
      <div className="muted small">Подойдёт экспорт этого планера или простой формат {'{tasks:[…], habits:[…]}'}. Дубли по названию пропускаются.</div>
      <textarea className="input mono import-area" placeholder='{ "tasks": [...] }' value={text}
        onChange={(e) => setText(e.target.value)} />
      <button className="btn" disabled={!text.trim()} onClick={doImport}>Импортировать</button>
    </div>
  );
}

function SettingsScreen() {
  const settings = useSettings();
  const saveSettings = useStore((s) => s.saveSettings);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const key = useStore((s) => s.key);
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const setOnboardingDone = useStore((s) => s.setOnboardingDone);
  const [botState, setBotState] = useState('');
  const [notion, setNotion] = useState({ secret: '', page: '' });
  const [notionState, setNotionState] = useState('');
  const [showKey, setShowKey] = useState(false);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(key || '');
      showToast('Ключ скопирован — вставьте его на компьютере');
    } catch {
      setShowKey(true);
      showToast('Скопируйте ключ вручную', 'err');
    }
  };

  const setupBot = async () => {
    setBotState('Настраиваю…');
    try {
      const r = await api.post('/api/telegram/setup');
      setBotState(r.ok ? 'Готово: вебхук, кнопка меню и команды поставлены.' : 'Не всё получилось: ' + JSON.stringify(r.results));
    } catch (e) {
      setBotState(`Ошибка: ${e.message}`);
    }
  };

  const connectNotion = async () => {
    setNotionState('Подключаю…');
    try {
      const r = await api.post('/api/notion/connect', notion);
      if (r.ok) {
        setNotionState('Готово: база «Планер» создана. Задачи с датой будут уходить в Notion каждые 5 минут.');
      } else setNotionState(r.error || 'Не получилось');
    } catch (e) {
      setNotionState(`Ошибка: ${e.message}`);
    }
  };

  return (
    <div className="section settings">
      <h3>Настройки</h3>
      {user?.name && <div className="muted small">Вы: {user.name}</div>}

      <div className="card">
        <label className="field-label">Тема</label>
        <div className="seg">
          {['auto', 'light', 'dark'].map((t) => (
            <button key={t} className={`seg-btn ${theme === t ? 'on' : ''}`} onClick={() => setTheme(t)}>
              {t === 'auto' ? 'Авто' : t === 'light' ? 'Светлая' : 'Тёмная'}
            </button>
          ))}
        </div>

        <label className="field-label">Мои часы (рабочий день)</label>
        <div className="two-inputs">
          <input type="time" className="input" value={settings.workStart} onChange={(e) => saveSettings({ workStart: e.target.value })} />
          <span>—</span>
          <input type="time" className="input" value={settings.workEnd} onChange={(e) => saveSettings({ workEnd: e.target.value })} />
        </div>

        <label className="field-label">Пик энергии</label>
        <div className="two-inputs">
          <input type="time" className="input" value={settings.peakStart} onChange={(e) => saveSettings({ peakStart: e.target.value })} />
          <span>—</span>
          <input type="time" className="input" value={settings.peakEnd} onChange={(e) => saveSettings({ peakEnd: e.target.value })} />
        </div>

        <label className="field-label">Лимит глубокой работы, ч/день</label>
        <input type="number" min="1" max="12" className="input" value={settings.headLimit}
          onChange={(e) => saveSettings({ headLimit: Number(e.target.value) || 4 })} />
      </div>

      <div className="card">
        <label className="field-label">Telegram-бот</label>
        <div className="muted small">Один раз после деплоя: поставит вебхук, кнопку меню и команды.</div>
        <button className="btn small" onClick={setupBot}>Подключить бота к планеру</button>
        {botState && <div className="muted small">{botState}</div>}
      </div>

      <div className="card">
        <label className="field-label">Notion</label>
        <input className="input" type="password" placeholder="Секрет интеграции ntn_…"
          value={notion.secret} onChange={(e) => setNotion({ ...notion, secret: e.target.value })} />
        <input className="input" placeholder="Ссылка на страницу Notion"
          value={notion.page} onChange={(e) => setNotion({ ...notion, page: e.target.value })} />
        <button className="btn small" disabled={!notion.secret || !notion.page} onClick={connectNotion}>Подключить Notion</button>
        {notionState && <div className="muted small">{notionState}</div>}
        <div className="muted small">Не забудьте добавить интеграцию в страницу: ··· → Connections.</div>
      </div>

      <div className="card">
        <label className="field-label">Ключ для браузера</label>
        <div className="muted small">Вставьте его на компьютере один раз — данные синхронизируются.</div>
        <div className="btn-row">
          <button className="btn small" onClick={copyKey}>Скопировать</button>
          <button className="chip" onClick={() => setShowKey(!showKey)}>{showKey ? 'скрыть' : 'показать'}</button>
        </div>
        {showKey && <div className="mono small break-all">{key}</div>}
      </div>

      <div className="card">
        <label className="field-label">Прочее</label>
        <div className="btn-row">
          <button className="btn small ghost" onClick={seedDemo}>Демо-данные</button>
          <button className="btn small ghost" onClick={() => setOnboardingDone(false)}>Показать онбординг</button>
        </div>
      </div>
    </div>
  );
}
