import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppProvider } from './state/AppContext.jsx';
import App from './App.jsx';
import './styles.css';

// Only register under http(s) — registration throws under Electron's
// file:// origin even where navigator.serviceWorker exists, and this is
// a no-op in dev anyway (no service worker is built there).
if (location.protocol.startsWith('http')){
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
);
