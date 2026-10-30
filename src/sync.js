// Синк-движок:
//  - push грязных записей каждые ~1 с (POST /api/tasks/sync, /api/items/sync)
//  - сервер принимает правку, только если updated_at новее (last-write-wins по записи)
//  - pull по серверной ревизии rev (GET /api/pull?since=) — при фокусе, возврате в сеть и раз в 30 с
//  - удаления — надгробия, чтобы записи не воскресали
import { api } from './api.js';
import { useStore } from './store.js';

let pushing = false;
let started = false;

function strip(rec) {
  const { _dirty, ...rest } = rec;
  return rest;
}

function applyServerRecords(records, { fromPush }) {
  const st = useStore.getState();
  let tasks = st.tasks;
  let items = st.items;
  let maxRev = st.lastRev;
  let changed = false;

  for (const rec of records) {
    const isItem = rec.kind !== undefined;
    const storeMap = isItem ? items : tasks;
    const local = storeMap[rec.id];

    if (local && local._dirty) {
      // правка локально новее сервера (например, успели отредактировать во время пуша)
      if (Date.parse(local.updated_at || '') > Date.parse(rec.updated_at || '')) continue;
    }
    if (local && !local._dirty && (local.rev || 0) > (rec.rev || 0)) continue;

    const clean = { ...rec, _dirty: false };
    if (isItem) items = { ...items, [rec.id]: clean };
    else tasks = { ...tasks, [rec.id]: clean };
    maxRev = Math.max(maxRev, rec.rev || 0);
    changed = true;
  }

  if (changed || maxRev !== st.lastRev) useStore.setState({ tasks, items, lastRev: maxRev });
}

export async function push() {
  const st = useStore.getState();
  if (!st.key || pushing) return;
  const tasks = Object.values(st.tasks).filter((t) => t._dirty);
  const items = Object.values(st.items).filter((i) => i._dirty);
  if (!tasks.length && !items.length) return;
  pushing = true;
  try {
    const [r1, r2] = await Promise.all([
      tasks.length ? api.post('/api/tasks/sync', { tasks: tasks.map(strip) }) : Promise.resolve(null),
      items.length ? api.post('/api/items/sync', { items: items.map(strip) }) : Promise.resolve(null),
    ]);
    applyServerRecords([...(r1?.records || []), ...(r2?.records || [])], { fromPush: true });
  } catch {
    // офлайн — попробуем в следующий тик
  } finally {
    pushing = false;
  }
}

export async function pull() {
  const st = useStore.getState();
  if (!st.key) return;
  try {
    const resp = await api.get(`/api/pull?since=${st.lastRev || 0}`);
    applyServerRecords([...(resp.tasks || []), ...(resp.items || [])], { fromPush: false });
    if (resp.rev && resp.rev > useStore.getState().lastRev) {
      useStore.setState({ lastRev: resp.rev });
    }
  } catch {
    // офлайн
  }
}

export function startSync() {
  if (started) return;
  started = true;
  setInterval(() => { push(); }, 1000);
  setInterval(() => { pull(); }, 30000);
  window.addEventListener('focus', () => { pull(); });
  window.addEventListener('online', () => { pull(); push(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
  });
}

export async function verifyKey() {
  try {
    const me = await api.get('/api/me');
    useStore.setState({ authState: 'ok', user: me.user });
    pull();
    return true;
  } catch (e) {
    if (e.status === 401) useStore.setState({ authState: 'need-key', key: null });
    return false;
  }
}
