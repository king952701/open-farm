const path = require('path');
const D = path.join(__dirname, '..', '_tools', 'x', 'node-v20.18.0-win-x64', 'node_modules', 'playwright');
const { chromium } = require(D);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + (e.stack || e.message)));
  await page.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForFunction(() => window.FARM && window.FARM.Game, { timeout: 120000 }).catch(() => { });
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => {
    const F = window.FARM;
    return {
      hasInter: !!F.Inter, interScene: !!(F.Inter && F.Inter.scene),
      hasPlayer: !!(F.Player && F.Player.model), hasUI: !!(F.UI && F.UI.update),
      loading: document.getElementById('loading').style.display,
      builds: F.Builds ? F.Builds.list.length : -1,
      nodes: F.Nodes ? F.Nodes.list.length : -1,
    };
  });
  console.log(JSON.stringify(st, null, 1));
  console.log(errs.length ? errs.join('\n---\n') : 'no errors');
  await browser.close();
})();
