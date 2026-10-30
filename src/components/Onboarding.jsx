import React, { useState } from 'react';
import { useStore } from '../store.js';

const SLIDES = [
  {
    icon: '🗓',
    title: 'Это ваш планер дня',
    text: 'План блоками по времени, привычки, сферы и цикл 12 недель. Всё синхронизируется между телефоном и компьютером, работает офлайн.',
  },
  {
    icon: '🔑',
    title: 'Один ключ для всех устройств',
    text: 'На телефоне планер открывается из Telegram (Mini App). На компьютере вставьте ключ один раз: Настройки → Ключ для браузера.',
  },
  {
    icon: '🎙',
    title: 'Задачи голосом',
    text: 'Наговорите задачи боту в Telegram — он расшифрует и разложит по времени, дню и длительности. Текст тоже понимает.',
  },
  {
    icon: '⚡',
    title: 'Быстрый ввод',
    text: '«созвон 1.5ч в 16:00 завтра #работа !» — время, длительность, дата, #сфера, ! важно, !! главное, ~ не срочно. Поиск — Ctrl+K.',
  },
];

export default function Onboarding() {
  const setOnboardingDone = useStore((s) => s.setOnboardingDone);
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="onb-overlay">
      <div className="onb-card glass">
        <div className="onb-icon">{s.icon}</div>
        <h2>{s.title}</h2>
        <p className="muted">{s.text}</p>
        <div className="onb-dots">
          {SLIDES.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}
        </div>
        <div className="onb-actions">
          <button className="btn-ghost" onClick={() => setOnboardingDone(true)}>Пропустить</button>
          <button className="btn" onClick={() => (last ? setOnboardingDone(true) : setI(i + 1))}>
            {last ? 'Начать' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>
  );
}
