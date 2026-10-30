import React from 'react';
import { useUI } from '../ui.js';

const ITEMS = [
  ['today', 'Сегодня', '☀'],
  ['plans', 'Планы', '🗓'],
  ['+', '+', '+'],
  ['growth', 'Рост', '📈'],
  ['more', 'Ещё', '⋯'],
];

export default function Dock() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const openModal = useUI((s) => s.openModal);

  return (
    <nav className="dock glass" aria-label="Навигация">
      {ITEMS.map(([id, label, icon]) => (
        id === '+' ? (
          <button key={id} className="dock-plus" aria-label="Добавить"
            onClick={() => openModal({ type: 'quick' })}>+</button>
        ) : (
          <button key={id} className={`dock-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}>
            <span className="dock-icon">{icon}</span>
            <span className="dock-label">{label}</span>
          </button>
        )
      ))}
    </nav>
  );
}
