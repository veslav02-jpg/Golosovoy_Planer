// Звук: общий AudioContext, короткий пип и будильник (три тройки бипов, как у будильника)

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

function tone(c, start, freq, dur, gain) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
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

// Короткий сигнал (таймеры)
export function playBeep(freq = 880, dur = 0.8) {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    tone(c, c.currentTime + 0.02, freq, dur, 0.2);
  } catch { /* без звука */ }
}

// Будильник: 3 × (бип-бип-бип) — настойчиво, слышно из другого окна
export function playAlarm() {
  try {
    const c = getCtx();
    if (!c) return Promise.resolve();
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t0 = c.currentTime + 0.05;
    for (let r = 0; r < 3; r++) {
      const base = t0 + r * 0.9;
      tone(c, base, 920, 0.16, 0.35);
      tone(c, base + 0.25, 920, 0.16, 0.35);
      tone(c, base + 0.5, 920, 0.16, 0.35);
    }
    return new Promise((r) => setTimeout(r, 2900));
  } catch {
    return Promise.resolve();
  }
}
