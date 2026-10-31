// Звук: общий AudioContext, встроенные мелодии (синтез) + свой файл (IndexedDB, на устройстве)

let ctx = null;

export function getCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

// Браузеры разрешают звук только после жеста пользователя — разблокируем на первом клике
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(c, start, freq, dur, gain, type = 'square') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.setValueAtTime(gain, Math.max(start + 0.02, start + dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

// ---------- встроенные мелодии ----------

// Классический будильник: 3 × (бип-бип-бип), настойчиво
function synthAlarm() {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + 0.05;
  for (let r = 0; r < 3; r++) {
    const base = t0 + r * 0.9;
    tone(c, base, 920, 0.16, 0.35);
    tone(c, base + 0.25, 920, 0.16, 0.35);
    tone(c, base + 0.5, 920, 0.16, 0.35);
  }
}

// Двойной: мягкие пары «пи-пип»
function synthDouble() {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + 0.05;
  for (let r = 0; r < 6; r++) {
    const base = t0 + r * 0.55;
    tone(c, base, 660, 0.1, 0.28, 'triangle');
    tone(c, base + 0.16, 990, 0.14, 0.28, 'triangle');
  }
}

// Сирена: плавные подъёмы и спады
function synthSiren() {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + 0.05;
  for (let r = 0; r < 3; r++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    const s = t0 + r * 1.0;
    o.frequency.setValueAtTime(500, s);
    o.frequency.linearRampToValueAtTime(1000, s + 0.45);
    o.frequency.linearRampToValueAtTime(500, s + 0.9);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(0.3, s + 0.08);
    g.gain.setValueAtTime(0.3, s + 0.82);
    g.gain.linearRampToValueAtTime(0.0001, s + 0.95);
    o.connect(g);
    g.connect(c.destination);
    o.start(s);
    o.stop(s + 1.0);
  }
}

// Маримба: нисходящая пентатоника, тёплый тон
function synthMarimba() {
  const c = getCtx();
  if (!c) return;
  const notes = [1046.5, 880, 783.99, 659.25, 587.33, 523.25];
  const t0 = c.currentTime + 0.05;
  notes.forEach((f, i) => {
    tone(c, t0 + i * 0.22, f, 0.34, 0.3, 'sine');
    tone(c, t0 + i * 0.22, f * 2, 0.18, 0.08, 'sine');
  });
}

// Перезвон: три удара «колокольчика»
function synthChime() {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + 0.05;
  for (let r = 0; r < 3; r++) {
    const s = t0 + r * 1.0;
    tone(c, s, 1318.5, 1.1, 0.22, 'sine');
    tone(c, s, 1975.5, 0.7, 0.1, 'sine');
    tone(c, s, 2637, 0.45, 0.05, 'sine');
  }
}

const SYNTHS = {
  alarm: synthAlarm,
  double: synthDouble,
  siren: synthSiren,
  marimba: synthMarimba,
  chime: synthChime,
};

export const BUILTIN_SOUNDS = [
  { id: 'alarm', name: 'Будильник' },
  { id: 'double', name: 'Двойной' },
  { id: 'siren', name: 'Сирена' },
  { id: 'marimba', name: 'Маримба' },
  { id: 'chime', name: 'Перезвон' },
];

// Короткий сигнал (таймеры)
export function playBeep(freq = 880, dur = 0.8) {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    tone(c, c.currentTime + 0.02, freq, dur, 0.2);
  } catch { /* без звука */ }
}

// Старое имя сохраняем (совместимость)
export function playAlarm() {
  synthAlarm();
}

// ---------- свой звук (IndexedDB) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('planner-audio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sounds');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function saveCustomAlarm(blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sounds', 'readwrite');
    tx.objectStore('sounds').put(blob, 'custom');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCustomAlarm() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction('sounds', 'readonly');
      const rq = tx.objectStore('sounds').get('custom');
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearCustomAlarm() {
  try {
    const db = await openDb();
    const tx = db.transaction('sounds', 'readwrite');
    tx.objectStore('sounds').delete('custom');
  } catch { /* нет базы — нечего чистить */ }
  customBuffer = null;
}

let customBuffer = null;

async function getCustomBuffer() {
  if (customBuffer) return customBuffer;
  const blob = await loadCustomAlarm();
  if (!blob) return null;
  const c = getCtx();
  if (!c) return null;
  try {
    customBuffer = await c.decodeAudioData(await blob.arrayBuffer());
    return customBuffer;
  } catch {
    return null;
  }
}

// Проиграть выбранную мелодию (settings.soundId)
export async function playSound(id) {
  try {
    if (id === 'custom') {
      const buf = await getCustomBuffer();
      if (buf) {
        const c = getCtx();
        if (c.state === 'suspended') c.resume().catch(() => {});
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.start();
        return;
      }
      return synthAlarm(); // своего файла нет (например, на другом устройстве) — запасной вариант
    }
    (SYNTHS[id] || synthAlarm)();
  } catch { /* без звука */ }
}
