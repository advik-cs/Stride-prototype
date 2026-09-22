import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { chromium } from 'playwright';

async function runPwaSuite() {
  console.log('===============================================================');
  console.log(' STRIDE PWA FOUNDATION & OFFLINE APP SHELL VERIFICATION SUITE');
  console.log('===============================================================');

  const distPath = path.resolve(process.cwd(), 'dist');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // --- SUITE 1: BUILD ARTIFACTS AUDIT ---
  console.log('\n--- SUITE 1: BUILD ARTIFACTS AUDIT ---');
  assert(fs.existsSync(path.join(distPath, 'index.html')), 'dist/index.html exists');
  assert(fs.existsSync(path.join(distPath, 'manifest.webmanifest')), 'dist/manifest.webmanifest exists');
  assert(fs.existsSync(path.join(distPath, 'sw.js')), 'dist/sw.js exists');

  const swContent = fs.readFileSync(path.join(distPath, 'sw.js'), 'utf-8');
  assert(swContent.includes('precacheAndRoute'), 'sw.js configures precacheAndRoute');
  assert(swContent.includes('index.html'), 'sw.js precaches index.html');
  assert(swContent.includes('manifest.webmanifest'), 'sw.js precaches manifest.webmanifest');
  assert(swContent.includes('stride-logo.svg'), 'sw.js precaches stride-logo.svg');

  // --- SUITE 2: API & VOICE EXCLUSION AUDIT ---
  console.log('\n--- SUITE 2: API & DYNAMIC ENDPOINT CACHE EXCLUSION ---');
  assert(swContent.includes('/^\\/api\\/.*/') || swContent.includes('/^\\/api\\//'), 'sw.js denylists /api/* from navigation fallback');
  assert(swContent.includes('/^\\/auth\\/.*/') || swContent.includes('/^\\/auth\\//'), 'sw.js denylists /auth/* from navigation fallback');
  assert(swContent.includes('/^\\/during\\/voice-emergency\\/.*/'), 'sw.js denylists voice emergency endpoints from navigation fallback');
  assert(!swContent.includes('cacheName:"api-cache"'), 'sw.js contains no blind runtime cache for API requests');
  assert(!swContent.includes('cacheName:"voice-cache"'), 'sw.js contains no runtime cache for voice emergency endpoints');

  // --- SUITE 3: WEB MANIFEST VALIDATION ---
  console.log('\n--- SUITE 3: WEB MANIFEST CONTENT AUDIT ---');
  const manifestRaw = fs.readFileSync(path.join(distPath, 'manifest.webmanifest'), 'utf-8');
  const manifest = JSON.parse(manifestRaw);
  assert(manifest.name === 'STRIDE - Disaster Intelligence & Response', 'Manifest name is correct');
  assert(manifest.short_name === 'STRIDE', 'Manifest short_name is correct');
  assert(manifest.display === 'standalone', 'Manifest display is standalone');
  assert(manifest.theme_color === '#2F4156', 'Manifest theme_color matches STRIDE brand');
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Manifest contains valid icon definitions');
  assert(manifest.icons.some((i: any) => i.src === '/stride-logo.svg'), 'Manifest links /stride-logo.svg icon');

  // --- SUITE 4: LIVE BROWSER OFFLINE BOOT TEST ---
  console.log('\n--- SUITE 4: LIVE BROWSER OFFLINE APP SHELL BOOT (EDGE/CHROMIUM) ---');

  const app = express();
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3044, '127.0.0.1', () => resolve()));
  console.log('  [Server] Stride preview static server listening on http://127.0.0.1:3044');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // 1. Online Cold Load & Service Worker Installation
    console.log('  [Test Step 1] Navigating online to http://127.0.0.1:3044/ ...');
    await page.goto('http://127.0.0.1:3044/', { waitUntil: 'networkidle' });

    // Wait for Service Worker registration
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    assert(swRegistered, 'Service Worker registered and active in browser');

    // Visit /before and /during online so shell navigation is initialized
    await page.goto('http://127.0.0.1:3044/before', { waitUntil: 'networkidle' });
    await page.goto('http://127.0.0.1:3044/during', { waitUntil: 'networkidle' });

    // 2. Cut Network Connection (OFFLINE MODE)
    console.log('  [Test Step 2] Disabling network connectivity (Offline Mode)...');
    await context.setOffline(true);

    // 3. Test Offline Reload on /
    console.log('  [Test Step 3] Reloading / while offline...');
    await page.goto('http://127.0.0.1:3044/', { waitUntil: 'domcontentloaded' });
    const rootHome = await page.locator('#root').count();
    const bodyTextHome = await page.locator('body').innerText();
    assert(rootHome > 0, 'React #root container mounted offline on /');
    assert(bodyTextHome.length > 20, 'React application rendered DOM content offline on /');

    // 4. Test Offline Direct Navigation to /before
    console.log('  [Test Step 4] Direct navigation to /before while offline...');
    await page.goto('http://127.0.0.1:3044/before', { waitUntil: 'domcontentloaded' });
    const rootBefore = await page.locator('#root').count();
    const bodyTextBefore = await page.locator('body').innerText();
    assert(rootBefore > 0, 'React #root container mounted offline on /before');
    assert(bodyTextBefore.length > 20, 'React application rendered DOM content offline on /before');

    // 5. Test Offline Direct Navigation to /during
    console.log('  [Test Step 5] Direct navigation to /during while offline...');
    await page.goto('http://127.0.0.1:3044/during', { waitUntil: 'domcontentloaded' });
    const rootDuring = await page.locator('#root').count();
    const bodyTextDuring = await page.locator('body').innerText();
    assert(rootDuring > 0, 'React #root container mounted offline on /during');
    assert(bodyTextDuring.length > 20, 'React application rendered DOM content offline on /during');

    // 6. Test Offline Direct Navigation to /floodx
    console.log('  [Test Step 6] Direct navigation to /floodx while offline...');
    await page.goto('http://127.0.0.1:3044/floodx', { waitUntil: 'domcontentloaded' });
    const rootFloodx = await page.locator('#root').count();
    assert(rootFloodx > 0, 'React #root container mounted offline on /floodx');

    // 7. Test Offline Direct Navigation to /analytics
    console.log('  [Test Step 7] Direct navigation to /analytics while offline...');
    await page.goto('http://127.0.0.1:3044/analytics', { waitUntil: 'domcontentloaded' });
    const rootAnalytics = await page.locator('#root').count();
    assert(rootAnalytics > 0, 'React #root container mounted offline on /analytics');

    // Check that there were no fatal SW registration errors
    const swErrors = consoleErrors.filter((e) => e.toLowerCase().includes('serviceworker') || e.toLowerCase().includes('sw.js'));
    assert(swErrors.length === 0, 'Browser console had zero Service Worker registration errors');
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPwaSuite().catch((err) => {
  console.error('PWA Test Suite Error:', err);
  process.exit(1);
});
