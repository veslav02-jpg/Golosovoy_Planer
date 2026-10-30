// План дня блоками: высота от длительности, свободные окна между ними,
// линия «сейчас», короткие задачи (до 20 мин) — одной строкой без обрезания текста.
import React from 'react';
import { useUI } from '../ui.js';
import { useSettings } from '../store.js';
import { todayStr, parseHHMM, hhmm } from '../lib/dates.js';
import { nowMinutes } from './Today.jsx';

const PX_PER_MIN = 1.15;

export default function DayPlan({ date, tasks }) {
  const settings = useSettings();
  const openTask = useUI((s) => s.openTask);
  const start = parseHHMM(settings.workStart || '09:00') ?? 540;
  const end = parseHHMM(settings.workEnd || '19:00') ?? 1140;
  const isToday = date === todayStr();
  const now = isToday ? nowMinutes() : null;

  const blocks = tasks
    .filter((t) => t.time)
    .map((t) => {
      const s = parseHHMM(t.time);
      return s == null ? null : { t, s, e: s + Math.max(15, t.duration_min || 30) };
    })
    .filter(Boolean)
    .sort((a, b) => a.s - b.s);

  // свободные окна внутри рабочих часов
  const free = [];
  let cursor = start;
  for (const b of blocks) {
    if (b.s > cursor) free.push({ s: cursor, e: Math.min(b.s, end) });
    cursor = Math.max(cursor, b.e);
  }
  if (cursor < end) free.push({ s: cursor, e: end });

  if (!blocks.length) {
    return (
      <div className="section">
        <h3>План дня</h3>
        <div className="plan-empty card muted">
          На время задач нет. Напишите «созвон в 11» в быстрый ввод или нажмите «Спланировать день».
        </div>
      </div>
    );
  }

  const top = (min) => (min - start) * PX_PER_MIN;
  const height = (end - start) * PX_PER_MIN;

  return (
    <div className="section">
      <h3>План дня</h3>
      <div className="plan-grid">
        <div className="plan-hours" style={{ height }}>
          {Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, i) => (
            <span key={i} style={{ top: top(start + i * 60) }}>{hhmm(start + i * 60)}</span>
          ))}
        </div>
        <div className="plan-canvas" style={{ height }}>
          {free.map((f, i) => (
            f.e - f.s >= 20 && (
              <div key={`f${i}`} className="plan-free" style={{ top: top(f.s), height: (f.e - f.s) * PX_PER_MIN }}>
                свободно {f.e - f.s} мин
              </div>
            )
          ))}
          {blocks.map((b) => {
            const short = (b.e - b.s) <= 20;
            const h = Math.max(short ? 26 : 44, (b.e - b.s) * PX_PER_MIN);
            return (
              <div
                key={b.t.id}
                className={`plan-block ${short ? 'short' : ''} ${b.t.done ? 'done' : ''} ${b.t.frog ? 'frog' : ''}`}
                style={{ top: top(b.s), height: h }}
                onClick={() => openTask(b.t.id)}
              >
                <div className="pb-time">{b.t.time}{b.t.done ? ' ✓' : ''}</div>
                <div className="pb-title">{b.t.title}</div>
                {!short && (
                  <div className="pb-meta">
                    {b.t.duration_min > 0 && `${b.t.duration_min} мин`}
                    {b.t.area ? ` · #${b.t.area}` : ''}
                    {b.t.deep ? ' · 🧠' : ''}
                  </div>
                )}
              </div>
            );
          })}
          {now != null && now >= start && now <= end && (
            <div className="now-line" style={{ top: top(now) }}>
              <span>{hhmm(now)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
