// Cron каждые 5 минут: синк с Notion + напоминания о привычках
import { syncNotion } from './notion.js';
import { moscowNow, tgApi } from './util.js';

export async function runCron(env) {
  try { await syncNotion(env); } catch (e) { console.error('cron notion:', e?.stack || e); }
  try { await habitReminders(env); } catch (e) { console.error('cron habits:', e?.stack || e); }
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
