import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n/LanguageContext.tsx';
import { Analytics } from '@vercel/analytics/react';
import { registerSW } from 'virtual:pwa-register';
import { initStrideDB } from './offline/db';
import { connectivityService } from './offline/connectivityService';
import { sosSyncManager } from './offline/sosSyncManager';
import './index.css';

registerSW({ immediate: true });

// 1. Safe, non-blocking startup initialization of IndexedDB
initStrideDB().catch((err) => {
  console.warn('[STRIDE] IndexedDB non-blocking startup initialization:', err);
});

// 2. Initialize centralized connectivity state service
connectivityService.init();

// 3. Initialize offline SOS outbox reconnect synchronization & recover stale syncing records
sosSyncManager.init();

// 4. If connectivity is available on startup, attempt non-blocking sync of pending mutations
if (typeof navigator !== 'undefined' && navigator.onLine) {
  sosSyncManager.syncPendingOutbox().catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
      <Analytics />
    </LanguageProvider>
  </StrictMode>,
);
