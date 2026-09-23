import path from 'path';
import http from 'http';
import express from 'express';
import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';

async function captureVisualSnapshots() {
  console.log('--- CAPTURING REPRESENTATIVE VISUAL SCREENSHOTS FOR PHASE 1 SHELL ---');

  const distPath = path.resolve(process.cwd(), 'dist');
  const screenshotDir = path.resolve(process.cwd(), 'test-results', 'phase1-visual');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const app = express();
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  const TEST_PORT = 3058;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', () => resolve()));

  const browser: Browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function setupAuthState(page: Page, role: 'CITIZEN' | 'AUTHORITY' | 'RESCUER') {
    const user = {
      id: `user-${role.toLowerCase()}-1`,
      name: role === 'CITIZEN' ? 'Ramesh Iyer' : role === 'AUTHORITY' ? 'Commander Arjun Rao' : 'Inspector Rajesh Kumar',
      role,
      testIdentityNumber: role === 'CITIZEN' ? '5432 8901 2345' : role === 'AUTHORITY' ? 'AUTH-COMMAND-01' : 'RES-NDRF-88210',
    };
    await page.addInitScript((userData) => {
      localStorage.setItem('stride_user', JSON.stringify(userData));
      localStorage.setItem('stride_token', 'demo-valid-token-phase-1');
      localStorage.setItem(`stride_household_handled_${userData.id}`, 'true');
    }, user);
  }

  const configs: { role: 'CITIZEN' | 'AUTHORITY' | 'RESCUER'; mode: 'before' | 'during'; isMobile: boolean; filename: string }[] = [
    { role: 'CITIZEN', mode: 'during', isMobile: true, filename: 'citizen-mobile-390x844.png' },
    { role: 'AUTHORITY', mode: 'during', isMobile: true, filename: 'authority-mobile-390x844.png' },
    { role: 'RESCUER', mode: 'during', isMobile: true, filename: 'rescuer-mobile-390x844.png' },
    { role: 'CITIZEN', mode: 'during', isMobile: false, filename: 'citizen-desktop-1920x1080.png' },
    { role: 'AUTHORITY', mode: 'during', isMobile: false, filename: 'authority-desktop-1920x1080.png' },
    { role: 'RESCUER', mode: 'during', isMobile: false, filename: 'rescuer-desktop-1920x1080.png' },
  ];

  for (const cfg of configs) {
    const viewport = cfg.isMobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await setupAuthState(page, cfg.role);

    await page.goto(`http://127.0.0.1:${TEST_PORT}/${cfg.mode}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const outPath = path.join(screenshotDir, cfg.filename);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`  📸 Captured ${cfg.filename} (${viewport.width}x${viewport.height})`);

    await context.close();
  }

  await browser.close();
  server.close();
  console.log('✅ All 6 representative screenshots captured successfully.\n');
}

captureVisualSnapshots().catch((err) => {
  console.error('Visual capture failed:', err);
  process.exit(1);
});
