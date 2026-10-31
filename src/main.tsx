import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import './theme-v4.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// While developing, a service worker left over from an earlier build/preview of this app can keep serving the OLD
// interface (changes "do nothing"). In dev we remove any such worker and its caches once, then reload.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    if (!regs.length) return;
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    location.reload();
  }).catch(() => { /* ignore */ });
}
document.documentElement.setAttribute('data-build', 'v52');
