// Таймеры: локальные, не синхронизируются. Фокус 25/50, параллельные побочные.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playBeep } from './lib/audio.js';

export const useTimers = create(persist((set, get) => ({
  timers: [], // {id, label, total (сек), endsAt, paused, remaining, done}
  soundOn: true,

  addTimer(label, minutes) {
    const now = Date.now();
    const t = {
      id: crypto.randomUUID(),
      label: label || 'Таймер',
      total: Math.max(60, minutes * 60),
      endsAt: now + minutes * 60000,
      paused: false,
      remaining: minutes * 60,
      done: false,
    };
    set({ timers: [...get().timers, t] });
    return t;
  },

  left(id) {
    const t = get().timers.find((x) => x.id === id);
    if (!t) return 0;
    if (t.paused || t.done) return t.remaining;
    return Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
  },

  // возвращает список только что закончившихся
  tick() {
    const now = Date.now();
    let finished = [];
    const timers = get().timers.map((t) => {
      if (!t.paused && !t.done && t.endsAt - now <= 0) {
        finished.push(t);
        return { ...t, done: true, remaining: 0 };
      }
      return t;
    });
    if (finished.length) set({ timers });
    return finished;
  },

  toggle(id) {
    const now = Date.now();
    set({
      timers: get().timers.map((t) => {
        if (t.id !== id) return t;
        if (t.done) return t;
        if (t.paused) return { ...t, paused: false, endsAt: now + t.remaining * 1000 };
        return { ...t, paused: true, remaining: Math.max(0, Math.round((t.endsAt - now) / 1000)) };
      }),
    });
  },

  restart(id) {
    const now = Date.now();
    set({
      timers: get().timers.map((t) => (
        t.id === id ? { ...t, done: false, paused: false, endsAt: now + t.total * 1000, remaining: t.total } : t
      )),
    });
  },

  stop(id) {
    set({ timers: get().timers.filter((t) => t.id !== id) });
  },

  setSound(v) { set({ soundOn: v }); },
}), { name: 'planner-timers' }));

export function beep() {
  playBeep(880, 0.8);
}
