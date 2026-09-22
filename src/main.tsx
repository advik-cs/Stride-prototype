import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n/LanguageContext.tsx';
import { Analytics } from '@vercel/analytics/react';
import { registerSW } from 'virtual:pwa-register';
import { initStrideDB } from './offline/db';
import { sosSyncManager } from './offline/sosSyncManager';
import './index.css';

registerSW({ immediate: true });

// Safe, non-blocking startup initialization of IndexedDB
initStrideDB().catch((err) => {
  console.warn('[STRIDE] IndexedDB non-blocking startup initialization:', err);
});

// Initialize offline SOS outbox reconnect synchronization
sosSyncManager.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
      <Analytics />
    </LanguageProvider>
  </StrictMode>,
);
