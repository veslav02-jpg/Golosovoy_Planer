// Демо-данные: кнопка в Настройках, чтобы сразу увидеть живые экраны
import { useStore } from '../store.js';
import { todayStr, addDays } from './dates.js';

export function seedDemo() {
  const s = useStore.getState();
  const today = todayStr();
  const now = new Date().toISOString();
  let n = 0;
  const ts = () => new Date(Date.now() + (n++)).toISOString();

  s.saveItem('area', 'area:работа', { name: 'Работа', weeklyGoalHours: 20, updated: now });
  s.saveItem('area', 'area:здоровье', { name: 'Здоровье', weeklyGoalHours: 5, updated: now });
  s.saveItem('area', 'area:дом', { name: 'Дом', weeklyGoalHours: 3, updated: now });

  s.saveTask({ id: `demo-${n++}`, title: 'Созвон с командой', date: today, time: '11:00', duration_min: 60, area: 'Работа', slot: 'afternoon', updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Глубокая работа: макет планера', date: today, time: '10:00', duration_min: 90, area: 'Работа', deep: true, updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Главное: доделать прототип', date: today, duration_min: 120, area: 'Работа', frog: true, updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Прогулка', date: today, time: '18:00', duration_min: 30, area: 'Здоровье', slot: 'evening', updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Купить продукты', date: today, duration_min: 40, area: 'Дом', updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Прочитать главу книги', date: today, duration_min: 20, priority: 3, updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Оплатить счета', date: addDays(today, 2), time: '12:00', duration_min: 15, area: 'Дом', updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Записаться к врачу', date: null, duration_min: 10, area: 'Здоровье', updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Хвост: ответить на письма', date: addDays(today, -3), duration_min: 30, area: 'Работа', updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Сделанная вчера задача', date: addDays(today, -1), duration_min: 45, area: 'Работа', done: true, updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Утренняя зарядка (вчера)', date: addDays(today, -1), duration_min: 15, area: 'Здоровье', done: true, updated_at: ts() });
  s.saveTask({ id: `demo-${n++}`, title: 'Еженедельный обзор', date: addDays(today, 5), time: '17:00', duration_min: 60, repeat: { type: 'week', days: [5] }, updated_at: ts() });

  s.saveItem('habit', 'demo-habit-1', { name: 'Зарядка', days: [1, 2, 3, 4, 5, 6, 7], reminder: '08:00' });
  s.saveItem('habit', 'demo-habit-2', { name: 'Чтение 20 минут', days: [1, 2, 3, 4, 5, 6, 7], reminder: '22:00' });
  s.saveItem('habit', 'demo-habit-3', { name: 'Без сахара', days: [1, 2, 3, 4, 5] });
  s.saveItem('habit_log', `hl:demo-habit-1:${addDays(today, -1)}`, { habit_id: 'demo-habit-1', date: addDays(today, -1) });
  s.saveItem('habit_log', `hl:demo-habit-2:${addDays(today, -1)}`, { habit_id: 'demo-habit-2', date: addDays(today, -1) });
  s.saveItem('habit_log', `hl:demo-habit-1:${addDays(today, -2)}`, { habit_id: 'demo-habit-1', date: addDays(today, -2) });

  s.saveItem('note', `demo-note-${n++}`, { text: 'Идея: вести список статей для чтения в пятницу.' });
  s.saveItem('note', `demo-note-${n++}`, { text: 'Рабочие часы 9–19, пик энергии — утро.' });

  s.saveItem('day', `day:${addDays(today, -1)}`, {
    mood: 4, energy: 4, good: 'Закрыл важную задачу и погулял.', note: 'День прошёл ровно.',
  });

  s.showToast('Демо-данные добавлены');
}
