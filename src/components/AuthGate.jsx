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
        {useStore.getState().authError && (
          <div className="auth-error">{useStore.getState().authError}</div>
        )}
        <p className="muted">
          <b>Ключ выдаётся автоматически при первом входе из Telegram.</b>
        </p>
        <ol className="auth-steps muted">
          <li>Откройте чат с вашим ботом в Telegram (удобно: web.telegram.org).</li>
          <li>Нажмите кнопку меню у поля ввода — «Открыть планер» (или /start и кнопку в ответе).</li>
          <li>Планер откроется внутри Telegram и сам вас авторизует.</li>
          <li>Дальше: Настройки → Ключ для браузера → Скопировать — и вставьте его здесь один раз.</li>
        </ol>
        <p className="muted small">
          В обычном браузере без ключа войти нельзя — это доступ к вашим задачам.
          Если вы внутри Telegram и всё равно видите этот экран — перезагрузите страницу:
          возможно, скрипт Telegram не успел загрузиться.
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
