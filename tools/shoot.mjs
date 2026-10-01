import { chromium } from 'playwright-core';
const out = process.argv[2] || 'shots';
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const stops = (process.argv[5] || '0,0.6,1.5,2.4,3.4,4.0,5.2,6.2,7.4,8.4,9.6').split(',').map(Number);
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: [] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto((process.env.URL || 'http://localhost:5199/'), { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.classList.contains('is-loading'), null, { timeout: 60000 });
await page.waitForTimeout(5000);
for (const s of stops) {
  await page.evaluate((y) => window.scrollTo(0, y * innerHeight), s);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/${W}-${String(s).replace('.', '_')}.png` });
}
console.log(logs.filter(l => !l.includes('[vite]')).join('\n') || 'no console output');
await browser.close();
