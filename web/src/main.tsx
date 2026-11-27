import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

// Reload once when a new service worker takes control (auto-update).
// Guard against repeated reloads when several updates arrive together.
if ('serviceWorker' in navigator) {
  const KEY = 'flowbot_sw_reload_at';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);