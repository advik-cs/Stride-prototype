import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n/LanguageContext.tsx';
import { Analytics } from '@vercel/analytics/react';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
      <Analytics />
    </LanguageProvider>
  </StrictMode>,
);
