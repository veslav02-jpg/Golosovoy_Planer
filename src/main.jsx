import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);

// Видимый отчёт о падении — чтобы ошибку можно было прислать текстом
function showFatal(label) {
  return (e) => {
    const el = document.createElement('pre');
    el.textContent = `${label}: ${e.error?.stack || e.reason?.stack || e.message || e.reason}`;
    el.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:9999;background:#fff;color:#900;padding:8px;font:10px/1.3 monospace;max-height:40%;overflow:auto;white-space:pre-wrap;';
    document.body.appendChild(el);
  };
}
window.addEventListener('error', showFatal('Ошибка'));
window.addEventListener('unhandledrejection', showFatal('Promise'));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
