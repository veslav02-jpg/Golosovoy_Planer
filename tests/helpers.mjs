// Общие помощники тестов: D1-шим на node:sqlite, окружение Worker'а, подпись initData
import { DatabaseSync } from 'node:sqlite';

function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

class Stmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }
  bind(...p) {
    this.params = p.map(norm);
    return this;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

// Минимальная имитация D1 API над node:sqlite
export class D1Shim {
  constructor(db) {
    this.db = db;
  }
  prepare(sql) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts) {
    const results = [];
    this.db.exec('BEGIN');
    try {
      for (const s of stmts) results.push(await s.run());
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return results;
  }
}

export function makeEnv({ botToken = '12345:TESTTOKEN', serviceKey = 'svc-test-key', ai = null } = {}) {
  const db = new DatabaseSync(':memory:');
  return {
    DB: new D1Shim(db),
    BOT_TOKEN: botToken,
    SERVICE_KEY: serviceKey,
    ...(ai ? { AI: ai } : {}),
  };
}

export function makeCtx() {
  const waits = [];
  return {
    waits,
    waitUntil(p) { waits.push(Promise.resolve(p).catch((e) => { throw e; })); },
    async flushed() {
      await Promise.allSettled(waits.map((p) => p.catch(() => {})));
    },
  };
}

// Валидная подпись initData, как её делает Telegram (opts.signature — поле современных клиентов)
export async function signInitData(user, botToken, opts = {}) {
  const enc = new TextEncoder();
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAtest',
    user: JSON.stringify(user),
  });
  if (opts.signature) params.set('signature', opts.signature);
  const dcs = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken)));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dcs));
  const hash = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  params.set('hash', hash);
  return params.toString();
}

export async function getWorker() {
  return (await import('../server/worker.js')).default;
}

export function jsonReq(url, { method = 'GET', body, headers = {} } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
