/* 移动端触控层端到端验证：手机视口 + hasTouch 加载安卓 assets 的移动入口 m.html，
   用真实指针/触摸事件走一遍「摇杆移动 / 滑动转视角 / 交互键采集 / 菜单与面板」，并校验：
   ① 触控层确实装上了且 #corner 到手机上收起来  ② 粗指针设备自动降画质档  ③ 无 JS 错误 */
const path = require('path');
const D = path.join(__dirname, '..', '_tools', 'x', 'node-v20.18.0-win-x64', 'node_modules', 'playwright');
const { chromium, devices } = require(D);
let fails = 0;
function ok(n, v) { console.log((v ? '  ✓ ' : '  ✗ ') + n); if (!v) fails++; }

const ASSETS = path.join(__dirname, '..', 'farm3d-android', 'app', 'src', 'main', 'assets', 'm.html');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  /* 横屏手机（3D 露天田园是横屏玩法）+ 真实触摸 */
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5 landscape'], { hasTouch: true, isMobile: true }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto('file:///' + ASSETS.replace(/\\/g, '/'));
  await page.waitForFunction(() => window.FARM && window.FARM.Game && document.getElementById('loading')
    && document.getElementById('loading').style.display === 'none', { timeout: 180000 });

  /* 0. 触控层装配 */
  await page.waitForFunction(() => document.getElementById('mtouch'), { timeout: 30000 }).catch(() => { });
  const shell = await page.evaluate(() => {
    const F = window.FARM;
    const g = document.getElementById('corner');
    return {
      touchLayer: !!document.getElementById('mtouch'),
      joy: !!document.getElementById('mjoy'),
      actCount: document.querySelectorAll('#mact .mkey').length,
      menu: !!document.getElementById('mmenu'),
      cornerHidden: g ? getComputedStyle(g).display === 'none' : false,
      mobileClass: document.documentElement.classList.contains('mobile'),
      coarse: !!F.coarseDevice,
      grass: F.Game.opt.grass,
      shadow: F.Game.opt.shadow,
      vp: innerWidth + 'x' + innerHeight,
    };
  });
  console.log('   壳层 =', JSON.stringify(shell));
  ok('移动入口装配触控层：摇杆 + 交互/辅助/奔跑/纳球 + 菜单键',
    shell.touchLayer && shell.joy && shell.actCount === 4 && shell.menu);
  ok('手机上那列功能按钮默认收进「菜单」（不再占满整屏）+ 手机 UI 缩放生效',
    shell.cornerHidden && shell.mobileClass);
  ok('粗指针设备自动降档：草密度锁到低档 / 阴影默认关', shell.coarse && shell.grass <= 1 && shell.shadow === false);

  /* 软渲染帧率低，这里压到最低档以保证后续时序稳定（与被测逻辑无关） */
  await page.evaluate(() => { const F = window.FARM; F.Game.opt.grass = 1; F.World.setGrassQuality(1); F.World.setShadows(false); });
  await page.waitForTimeout(400);

  /* 1. 摇杆 → 真的走得动（落到草地上、不是帐篷里） */
  const joy0 = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.auto = null; F.Player.indoor = false; F.Player.dead = false; F.Player.hp = 100;
    F.Player.pos.set(4, F.T.hAt(4, 104), 104);
    const b = document.getElementById('mjoy').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, px: F.Player.pos.x, pz: F.Player.pos.z };
  });
  await page.mouse.move(joy0.x, joy0.y);
  await page.mouse.down();
  await page.mouse.move(joy0.x, joy0.y - 40, { steps: 6 });
  await page.waitForTimeout(1200);
  const joy1 = await page.evaluate(() => ({
    axis: window.FARM.Input.axis,
    px: +window.FARM.Player.pos.x.toFixed(2), pz: +window.FARM.Player.pos.z.toFixed(2),
  }));
  await page.mouse.up();
  await page.waitForTimeout(300);
  const joy2 = await page.evaluate(() => ({ axis: window.FARM.Input.axis }));
  const moved = Math.hypot(joy1.px - joy0.px, joy1.pz - joy0.pz);
  console.log('   摇杆 =', JSON.stringify({ moved: +moved.toFixed(2), joy1, joy2 }));
  ok('摇杆推起来玩家真的移动（连续量输入，松手归零）',
    moved > 0.8 && joy1.axis && joy1.axis.y > 0.5 && joy2.axis === null);

  /* 2. 空白处滑动 → 转视角；pinch → 拉远拉近 */
  const cam0 = await page.evaluate(() => ({ yaw: window.FARM.Player.camYaw, dist: window.FARM.Player.camDist }));
  await page.mouse.move(500, 150);
  await page.mouse.down();
  await page.mouse.move(620, 150, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const cam1 = await page.evaluate(() => ({ yaw: window.FARM.Player.camYaw }));
  console.log('   视角 =', JSON.stringify({ before: +cam0.yaw.toFixed(3), after: +cam1.yaw.toFixed(3) }));
  ok('空白处横向滑动可转视角（走鼠标拖拽同一条相机路径）', Math.abs(cam1.yaw - cam0.yaw) > 0.05);

  /* 3. 交互键：站到浆果丛旁按钮采集 */
  const harvest = await page.evaluate(() => {
    const F = window.FARM;
    const n = (F.Nodes.list || []).filter(x => x.type === 'berrybush' && x.alive)[0];
    if (!n) return { found: false };
    F.Game.auto = null;
    F.Player.pos.set(n.x + 0.5, F.T.hAt(n.x, n.z), n.z + 0.5);
    F.Player.setTool('sickle');
    F.Inter.exitAll();
    return { found: true, before: F.Game.inv.berry || 0, prompt: document.getElementById('prompt').textContent };
  });
  await page.waitForFunction(() => document.getElementById('prompt').textContent.indexOf('采集') >= 0
    || document.getElementById('prompt').textContent.indexOf('浆果') >= 0, { timeout: 20000 }).catch(() => { });
  const promptTxt = await page.evaluate(() => document.getElementById('prompt').textContent);
  await page.evaluate(() => {
    const b = document.querySelector('#mact .mkey.big');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
  /* 采集是一次带进度条的动作（0.55s 游戏时间），软渲染下要折合好几秒真实时间 —— 轮询等结果 */
  await page.waitForFunction(before => (window.FARM.Game.inv.berry || 0) > before,
    harvest.before, { timeout: 30000 }).catch(() => { });
  const after = await page.evaluate(() => ({ berry: window.FARM.Game.inv.berry || 0 }));
  console.log('   交互 =', JSON.stringify({ harvest, promptTxt, after }));
  ok('站到浆果丛旁出现采集提示，点「交互」真的割到浆果',
    harvest.found && /采集/.test(promptTxt) && after.berry > harvest.before);

  /* 4. 菜单展开 + 系统菜单宫格 + 面板可用（功能按钮已收进「系统菜单」） */
  await page.evaluate(() => document.getElementById('mmenu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  await page.waitForTimeout(200);
  const menuOpen = await page.evaluate(() => getComputedStyle(document.getElementById('corner')).display);
  await page.evaluate(() => {
    const s = document.getElementById('btn-sys');
    s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); s.click();
  });
  await page.waitForTimeout(400);
  const sysM = await page.evaluate(() => ({
    head: (document.querySelector('#panel .phead h3') || {}).textContent || '',
    tiles: document.querySelectorAll('#panel .sys-tile').length,
  }));
  await page.evaluate(() => {
    const t = Array.prototype.find.call(document.querySelectorAll('#panel .sys-tile'),
      e => /背包/.test(e.textContent));
    t.click();
  });
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => ({
    shown: document.getElementById('panel').style.display,
    head: (document.querySelector('#panel .phead h3') || {}).textContent || '',
    width: (document.querySelector('#panel .panel') || {}).clientWidth || 0,
    vw: innerWidth,
  }));
  console.log('   菜单/面板 =', JSON.stringify({ menuOpen, sysM, panel }));
  ok('「菜单」展开入口 · 系统菜单宫格 15 项 · 面板在手机宽度内打开（背包）',
    menuOpen === 'flex' && sysM.head === '系统菜单' && sysM.tiles === 15 &&
    /flex/.test(panel.shown) && /背包/.test(panel.head) && panel.width > 0 && panel.width <= panel.vw);

  /* 5. 致谢页在手机上也能打开（点「菜单」→ 系统菜单 → 关于） */
  await page.evaluate(() => {
    const F = window.FARM;
    F.UI.closePanel();
    F.UI.openPanel('sys');
    const t = Array.prototype.find.call(document.querySelectorAll('#panel .sys-tile'),
      e => /关于/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(400);
  const aboutM = await page.evaluate(() => {
    const box = document.querySelector('#panel .panel');
    return {
      shown: document.getElementById('panel').style.display,
      on: (document.querySelector('#panel .ranktabs .rt.on') || {}).textContent || '',
      three: box ? /Three\.js/.test(box.textContent) : false,
      w: box ? box.clientWidth : 0, vw: innerWidth,
      scrollable: box ? box.scrollHeight > box.clientHeight : false,
    };
  });
  console.log('   致谢页 =', JSON.stringify(aboutM));
  ok('手机上「关于 · 致谢」可打开且内容在屏幕内（可滚动）',
    /flex/.test(aboutM.shown) && aboutM.on === '关于 · 致谢' && aboutM.three &&
    aboutM.w > 0 && aboutM.w <= aboutM.vw);
  await page.screenshot({ path: path.join(__dirname, 'production', 'qa', 'evidence', 'mobile-about.png') });
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 6. UI 全机型自适应：小屏收缩、平板放大，摇杆直径跟 --ms 走，测完还原视口 */
  const BASE = { width: 802, height: 293 };
  /* 软渲染下帧率极低，改用「等条件成立」而不是等固定毫秒 */
  await page.setViewportSize({ width: 640, height: 320 });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ms')) < 1,
    { timeout: 15000 }).catch(() => { });
  const small = await page.evaluate(() => ({
    ms: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ms')),
    joy: document.getElementById('mjoy').clientWidth,
  }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ms')) > 1,
    { timeout: 15000 }).catch(() => { });
  const big = await page.evaluate(() => ({
    ms: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ms')),
    joy: document.getElementById('mjoy').clientWidth,
  }));
  await page.setViewportSize(BASE);
  await page.waitForTimeout(350);
  console.log('   自适应 =', JSON.stringify({ small, big }));
  ok('UI 全机型自适应：小屏 ms<1、平板 ms>1，摇杆直径随缩放变化',
    small.ms < 1 && big.ms > 1 && small.joy < big.joy);

  await page.screenshot({ path: path.join(__dirname, 'production', 'qa', 'evidence', 'mobile-touch.png') });
  ok('无 JS 错误', errs.length === 0);
  if (errs.length) console.log('   错误：', errs.slice(0, 5).join(' | '));

  console.log(fails ? `\n移动端：${fails} 项失败` : '\n移动端：全部通过');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
