// Напоминания о задачах: когда наступает время события — будильник в приложении
// (+ системное уведомление, если разрешено). Бот дублирует сообщением (server/cron.js).
import { useStore } from './store.js';
import { playSound } from './lib/audio.js';
import { todayStr, parseHHMM } from './lib/dates.js';

const STORE_KEY = 'planner-notified';
let started = false;

function loadNotified() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}

function saveNotified(map) {
  const today = todayStr();
  const clean = {};
  for (const [k, v] of Object.entries(map)) {
    if (v.date === today) clean[k] = v; // старые ключи не копим
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(clean)); } catch { /* приватный режим */ }
}

const notifyKey = (t) => `${t.id}|${t.date}|${t.time || ''}`;

export function startReminders() {
  if (started) return;
  started = true;
  setInterval(check, 5000);
  check();
}

export function check() {
  const st = useStore.getState();
  if (!st.key) return;
  const settings = { soundOn: true, remindBefore: 0, ...(st.items?.settings?.data || {}) };
  const today = todayStr();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const notified = loadNotified();
  let changed = false;

  for (const t of Object.values(st.tasks)) {
    if (t.deleted || t.done || t.date !== today || !t.time) continue;
    const start = parseHHMM(t.time);
    if (start == null) continue;
    const fireAt = start - (Number(settings.remindBefore) || 0);
    if (nowMin < fireAt || nowMin >= fireAt + 3) continue; // окно 3 минуты, чтобы не пищать вечно
    const k = notifyKey(t);
    if (notified[k]) continue;
    notified[k] = { date: today, at: Date.now() };
    changed = true;

    if (settings.soundOn !== false) playSound(settings.soundId);
    st.showToast(`⏰ ${t.time} — ${t.title}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`⏰ ${t.time} — ${t.title}`, { tag: k, body: 'Планер' }); } catch { /* нет разрешения */ }
    }
  }
  if (changed) saveNotified(notified);
}
