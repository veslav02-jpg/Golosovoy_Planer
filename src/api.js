// API-клиент: тот же origin, ключ в заголовке X-Auth-Key
import { useStore } from './store.js';

async function req(method, path, body) {
  const { key } = useStore.getState();
  const res = await fetch(path, {
    method,
    headers: {
      ...(key ? { 'X-Auth-Key': key } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  get: (path) => req('GET', path),
  post: (path, body) => req('POST', path, body),
};

export async function authTelegram(initData) {
  const r = await req('POST', '/api/auth/telegram', { initData });
  useStore.setState({ key: r.key, user: r.user, authState: 'ok' });
  return r;
}
