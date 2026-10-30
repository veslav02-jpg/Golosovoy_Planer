import React, { useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { startSync, verifyKey } from '../sync.js';

export default function AuthGate() {
  const authState = useStore((s) => s.authState);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (authState === 'loading') {
    return <div className="auth-wrap"><div className="spinner" /></div>;
  }

  const login = async () => {
    setBusy(true);
    setError('');
    useStore.setState({ key: keyInput.trim() });
    const ok = await verifyKey();
    if (ok) startSync();
    else setError('Ключ не подошёл. Скопируйте его заново: Mini App → Настройки → Ключ для браузера.');
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card glass">
        <div className="auth-logo">🗓</div>
        <h1>Планер</h1>
        <p className="muted">
          В браузере нужен ключ из Mini App:
          откройте планер в Telegram → <b>Настройки → Ключ для браузера → Скопировать</b> и вставьте сюда.
          Ключ вставляется один раз.
        </p>
        <input
          className="input"
          placeholder="Ключ доступа"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && login()}
          autoFocus
        />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn" disabled={busy || !keyInput.trim()} onClick={login}>
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
      </div>
    </div>
  );
}
