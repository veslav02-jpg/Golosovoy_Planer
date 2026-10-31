import React, { useEffect, useState } from 'react';
import { useStore, useSettings } from './store.js';
import { startSync, verifyKey } from './sync.js';
import { authTelegram } from './api.js';
import { useTimers, beep } from './timers.js';
import { useUI } from './ui.js';
import Dock from './components/Dock.jsx';
import Today from './components/Today.jsx';
import Plans from './components/Plans.jsx';
import Growth from './components/Growth.jsx';
import More from './components/More.jsx';
import Onboarding from './components/Onboarding.jsx';
import AuthGate from './components/AuthGate.jsx';
import { QuickAdd, TaskSheet, HabitSheet, AreaSheet, FinishDay, PlanDayModal, SearchModal } from './components/sheets.jsx';

export default function App() {
  const key = useStore((s) => s.key);
  const authState = useStore((s) => s.authState);
  const theme = useStore((s) => s.theme);
  const onboardingDone = useStore((s) => s.onboardingDone);
  const toast = useStore((s) => s.toast);
  const tab = useUI((s) => s.tab);
  const modal = useUI((s) => s.modal);
  const [tgScheme, setTgScheme] = useState('light');

  // Авторизация: в Telegram — initData, в браузере — сохранённый ключ.
  // Скрипт Telegram грузится асинхронно — коротко ждём его появления.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let tg;
      for (let i = 0; i < 25; i++) {
        tg = window.Telegram?.WebApp;
        if (tg && tg.initData) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;
      if (tg && tg.initData) {
        tg.ready();
        tg.expand();
        authTelegram(tg.initData)
          .then(() => startSync())
          .catch((e) => {
            useStore.setState({ authState: 'need-key', authError: `Приложение открыто в Telegram, но сервер не принял вход: ${e.message}` });
          });
        setTgScheme(tg.colorScheme === 'dark' ? 'dark' : 'light');
        tg.onEvent('themeChanged', () => setTgScheme(tg.colorScheme === 'dark' ? 'dark' : 'light'));
        return;
      }
      if (useStore.getState().key) {
        verifyKey().then((ok) => { if (ok) startSync(); });
      } else {
        useStore.setState({ authState: 'need-key' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Тема: Авто/Светлая/Тёмная; в Telegram Авто следует теме Telegram
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      let dark;
      if (theme === 'auto') {
        dark = (window.Telegram?.WebApp?.initData ? tgScheme === 'dark' : mq.matches);
      } else {
        dark = theme === 'dark';
      }
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, tgScheme]);

  // Тик таймеров
  useEffect(() => {
    const iv = setInterval(() => {
      const finished = useTimers.getState().tick();
      if (finished.length) {
        if (useTimers.getState().soundOn) beep();
        useStore.getState().showToast(`⏰ ${finished.map((t) => t.label).join(', ')} — время вышло`);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Поиск по Ctrl+K
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUI.getState().openModal({ type: 'search' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Тост гаснет
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useStore.setState({ toast: null }), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (authState !== 'ok') return <AuthGate />;

  return (
    <div className={`app ${tab === 'today' ? 'today-layout' : ''}`}>
      <header className="topbar">
        <span className="logo">🗓 Планер</span>
        <button className="chip" onClick={() => useUI.getState().openModal({ type: 'search' })}>⌕ Ctrl+K</button>
      </header>

      <div className="body">
        {tab === 'today' && <Today />}
        {tab === 'plans' && <Plans />}
        {tab === 'growth' && <Growth />}
        {tab === 'more' && <More />}
      </div>

      <Dock />

      {modal?.type === 'task' && <TaskSheet payload={modal.payload} />}
      {modal?.type === 'quick' && <QuickAdd payload={modal.payload} />}
      {modal?.type === 'habit' && <HabitSheet payload={modal.payload} />}
      {modal?.type === 'area' && <AreaSheet payload={modal.payload} />}
      {modal?.type === 'planday' && <PlanDayModal payload={modal.payload} />}
      {modal?.type === 'finish' && <FinishDay payload={modal.payload} />}
      {modal?.type === 'search' && <SearchModal />}

      {!onboardingDone && <Onboarding />}

      {toast && (
        <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`}>{toast.text}</div>
      )}
    </div>
  );
}
