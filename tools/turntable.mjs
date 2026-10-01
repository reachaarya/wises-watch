import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto(process.env.URL || 'http://localhost:5199/');
await page.waitForFunction(() => window.__stage?.ready && !document.body.classList.contains('is-loading'), null, { timeout: 60000 });
await page.waitForTimeout(4500);
await page.evaluate(() => { __gsap.globalTimeline.pause(); document.querySelector('main').style.display = 'none'; });
const views = { side: [0, Math.PI / 2, 0], threeq: [0.3, -0.7, 0.1], front: [0, 0, 0], back: [0.35, Math.PI + 0.6, 0], below: [1.2, -0.4, 0] };
for (const [name, [rx, ry, rz]] of Object.entries(views)) {
  await page.evaluate(([rx, ry, rz, sc]) => { Object.assign(__pose, { rotX: rx, rotY: ry, rotZ: rz, x: 0, y: 0, scale: sc, explode: 0, labels: 0, opacity: 1 }); __stage.render(0); }, [rx, ry, rz, +(process.env.SCALE || 1.25)]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${process.env.TAG || 'wrist'}-${name}.png` });
}
await browser.close();
