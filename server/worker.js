// Точка входа Worker'а: только /api/* (остальное отдаёт [assets] из dist/)
import { handleApi } from './api.js';
import { runCron } from './cron.js';
import { json } from './util.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx);
      } catch (e) {
        console.error('api:', e?.stack || e);
        return json({ error: e?.message || 'Ошибка сервера' }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};
