/* 一次性探针：视口变化时 fit() 是否重跑 */
const path = require('path');
const D = path.join(__dirname, '..', '_tools', 'x', 'node-v20.18.0-win-x64', 'node_modules', 'playwright');
const { chromium, devices } = require(D);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5 landscape'], { hasTouch: true, isMobile: true }));
  const page = await ctx.newPage();
  await page.goto('file:///' + path.join(__dirname, '..', 'farm3d-android', 'app', 'src', 'main', 'assets', 'm.html').replace(/\\/g, '/'));
  await page.waitForFunction(() => window.FARM && document.getElementById('loading') && document.getElementById('loading').style.display === 'none', { timeout: 120000 });
  await page.evaluate(() => { window.__n = 0; addEventListener('resize', () => window.__n++); });
  const snap = async tag => console.log(tag, JSON.stringify(await page.evaluate(() => ({
    iw: innerWidth, ih: innerHeight, ms: document.documentElement.style.getPropertyValue('--ms'),
    n: window.__n, vv: visualViewport ? [visualViewport.width, visualViewport.height] : null,
  }))));
  await snap('初始');
  await page.setViewportSize({ width: 640, height: 320 });
  await page.waitForTimeout(400); await snap('640x320');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400); await snap('1280x800');
  await browser.close();
})();
