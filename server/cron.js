// Cron каждые 5 минут: синк с Notion + напоминания о привычках
import { syncNotion } from './notion.js';
import { moscowNow, tgApi } from './util.js';

export async function runCron(env) {
  try { await syncNotion(env); } catch (e) { console.error('cron notion:', e?.stack || e); }
  try { await habitReminders(env); } catch (e) { console.error('cron habits:', e?.stack || e); }
  try { await taskReminders(env); } catch (e) { console.error('cron tasks:', e?.stack || e); }
}

// Будильник по задачам: в минуту наступления события — сообщение от бота.
// Каждая задача попадает ровно в один 5-минутный прогон cron.
async function taskReminders(env) {
  if (!env.BOT_TOKEN) return;
  const now = moscowNow();
  const rows = await env.DB.prepare(
    'SELECT user_id, time, title FROM tasks WHERE deleted = 0 AND done = 0 AND date = ? AND time IS NOT NULL',
  ).bind(now.date).all();
  const byUser = new Map();
  for (const r of rows.results || []) {
    const [hh, mm] = String(r.time).split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const diff = ((hh * 60 + mm) - now.minutes + 1440) % 1440;
    if (diff >= 5) continue;
    const list = byUser.get(r.user_id) || [];
    list.push(`${r.time} — ${r.title}`);
    byUser.set(r.user_id, list);
  }
  for (const [userId, lines] of byUser) {
    try {
      await tgApi(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: `⏰ Сейчас по плану:\n${lines.map((l) => `• ${l}`).join('\n')}`,
      });
    } catch (e) {
      console.error('task reminder:', e?.message);
    }
  }
}

// Напоминание о привычке — сообщение бота в заданное время (окно 5 минут)
async function habitReminders(env) {
  if (!env.BOT_TOKEN) return;
  const now = moscowNow();
  const rows = await env.DB.prepare("SELECT user_id, data FROM items WHERE kind = 'habit' AND deleted = 0").all();
  for (const row of rows.results || []) {
    let habit;
    try { habit = JSON.parse(row.data || 'null'); } catch { continue; }
    if (!habit || !habit.reminder || !habit.name) continue;
    if (Array.isArray(habit.days) && habit.days.length && !habit.days.includes(now.dow)) continue;
    const [hh, mm] = String(habit.reminder).split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const diff = ((hh * 60 + mm) - now.minutes + 1440) % 1440;
    if (diff < 5) {
      try {
        await tgApi(env.BOT_TOKEN, 'sendMessage', {
          chat_id: row.user_id,
          text: `⏰ Привычка: ${habit.name} — пора отметить!`,
        });
      } catch (e) {
        console.error('habit reminder:', e?.message);
      }
    }
  }
}
