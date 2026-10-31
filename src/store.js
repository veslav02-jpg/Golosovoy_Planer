// Хранилище: локальная копия главная, правки мгновенно и офлайн.
// Синк: push грязных записей ~1 раз в секунду, pull по серверной ревизии (sync.js).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import { spawnNextRepeat } from './lib/repeat.js';

export const DEFAULT_SETTINGS = {
  workStart: '09:00',
  workEnd: '19:00',
  headLimit: 4,
  peakStart: '10:00',
  peakEnd: '13:00',
  soundOn: true,
  remindBefore: 0,
};

export const useStore = create(persist((set, get) => ({
  key: null,
  user: null,
  authState: 'loading', // loading | need-key | ok
  authError: null,
  tasks: {},
  items: {},
  lastRev: 0,
  theme: 'auto',
  onboardingDone: false,
  toast: null,

  setAuth: (key, user) => set({ key, user, authState: 'ok' }),
  setAuthState: (authState) => set({ authState }),
  setTheme: (theme) => set({ theme }),
  setOnboardingDone: (v) => set({ onboardingDone: v }),
  showToast: (text, kind = 'ok') => set({ toast: { text, kind, at: Date.now() } }),

  // ---------- задачи ----------
  saveTask(patch) {
    const state = get();
    const now = new Date().toISOString();
    let tasks = state.tasks;
    const prev = patch.id ? tasks[patch.id] : null;
    const rec = {
      title: '', date: null, time: null, slot: null, duration_min: 0,
      area: null, priority: 2, note: null, deep: false, frog: false,
      repeat: null, checklist: null, done: false, deleted: false,
      source: 'app', created_at: now, updated_at: now, rev: 0,
      ...(prev || {}),
      ...patch,
      id: patch.id || (prev && prev.id) || crypto.randomUUID(),
      updated_at: now,
      _dirty: true,
    };
    // «главное на день» — одно на дату
    if (rec.frog && rec.date) {
      for (const other of Object.values(tasks)) {
        if (other.id !== rec.id && other.frog && other.date === rec.date && !other.deleted && !other.done) {
          tasks = { ...tasks, [other.id]: { ...other, frog: false, updated_at: now, _dirty: true } };
        }
      }
    }
    set({ tasks: { ...tasks, [rec.id]: rec } });
    return rec;
  },

  setDone(id, done = true) {
    const { tasks } = get();
    const t = tasks[id];
    if (!t) return null;
    const now = new Date().toISOString();
    set({ tasks: { ...tasks, [id]: { ...t, done, updated_at: now, _dirty: true } } });
    if (done && t.repeat && t.repeat.type && !t.deleted) {
      const next = spawnNextRepeat({ ...t, done: false });
      if (next) {
        set((s) => ({ tasks: { ...s.tasks, [next.id]: { ...next, _dirty: true } } }));
      }
    }
    return t;
  },

  deleteTask(id) {
    const { tasks } = get();
    const t = tasks[id];
    if (!t || t.deleted) return;
    const now = new Date().toISOString();
    set({ tasks: { ...tasks, [id]: { ...t, deleted: true, updated_at: now, _dirty: true } } });
  },

  // ---------- items (привычки, заметки, сферы, итоги дня…) ----------
  saveItem(kind, id, dataPatch, { del = false } = {}) {
    const { items } = get();
    const now = new Date().toISOString();
    const prev = items[id];
    const rec = {
      id,
      kind,
      data: { ...(prev?.data || {}), ...dataPatch },
      deleted: del ? true : (prev?.deleted || false),
      updated_at: now,
      rev: prev?.rev || 0,
      _dirty: true,
    };
    set({ items: { ...items, [id]: rec } });
    return rec;
  },

  deleteItem(id) {
    const { items } = get();
    const it = items[id];
    if (it && !it.deleted) get().saveItem(it.kind, id, {}, { del: true });
  },

  saveSettings(patch) { get().saveItem('settings', 'settings', patch); },
}), {
  name: 'planner',
  partialize: (s) => ({
    key: s.key, user: s.user, tasks: s.tasks, items: s.items,
    lastRev: s.lastRev, theme: s.theme, onboardingDone: s.onboardingDone,
  }),
}));

// Настройки с дефолтами (реактивно)
export function useSettings() {
  const data = useStore((s) => s.items?.settings?.data);
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data || {}) }), [data]);
}

// ---------- привычки ----------
export function habitLogId(habitId, date) {
  return `hl:${habitId}:${date}`;
}

export function useHabitDone(habitId, date) {
  return useStore((s) => !!s.items[habitLogId(habitId, date)] && !s.items[habitLogId(habitId, date)].deleted);
}

export function toggleHabit(habitId, date) {
  const { items, saveItem } = useStore.getState();
  const id = habitLogId(habitId, date);
  const existing = items[id];
  if (existing && !existing.deleted) {
    saveItem('habit_log', id, {}, { del: true });
  } else {
    saveItem('habit_log', id, { habit_id: habitId, date });
  }
}
