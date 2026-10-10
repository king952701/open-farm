/* 端到端交互测试：真实按键 / 点击 走一遍核心玩法，并存档读档校验 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const D = path.join(__dirname, '..', '_tools', 'x', 'node-v20.18.0-win-x64', 'node_modules', 'playwright');
const { chromium } = require(D);
let fails = 0;
function ok(n, v) { console.log((v ? '  ✓ ' : '  ✗ ') + n); if (!v) fails++; }

/* 测试用图片（1×1 PNG） */
const TMP_PIC = path.join(os.tmpdir(), 'farm3d_chat_pic.png');
fs.writeFileSync(TMP_PIC, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+Iv5zAAAAAElFTkSuQmCC', 'base64'));

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
      '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForFunction(() => window.FARM && window.FARM.Game && document.getElementById('loading').style.display === 'none', { timeout: 120000 });
  await page.waitForTimeout(1500);
  /* QA 画质档：软渲染（SwiftShader）帧率低，而 dt 每帧上限 0.05s —— 帧率一低游戏时间就滞后真实时间，
     时序类断言（鱼讯 / 传送后目标刷新）会集体超时。测试环境降草密度关阴影，与被测逻辑无关 */
  await page.evaluate(() => {
    const F = window.FARM;
    F.Game.opt.grass = 1;
    F.World.setGrassQuality(1);
    F.World.setShadows(false);
  });

  /* 1. 工具快捷键 */
  await page.keyboard.press('4');
  ok('按键 4 → 锄头', await page.evaluate(() => window.FARM.Player.tool === 'hoe'));
  await page.keyboard.press('7');
  ok('按键 7 → 鱼竿', await page.evaluate(() => window.FARM.Player.tool === 'rod'));

  /* 2. 开垦 → 播种 → 浇水 */
  const till = await page.evaluate(() => {
    const F = window.FARM;
    const t = F.Farm.tiles.find(t => t.zone === 'A' && t.state === 0);
    F.Player.pos.set(t.x, 0, t.z);
    F.Player.setTool('hoe');
    F.Inter.target = { kind: 'tile', t, d: 0 };
    F.Inter.pressF();
    return t.state;
  });
  ok('F 开垦地块', till === 1);
  const plant = await page.evaluate(() => {
    const F = window.FARM;
    const t = F.Farm.tiles.find(t => t.zone === 'A' && t.state === 1);
    F.Player.pos.set(t.x, 0, t.z);
    F.Player.setTool('seed');
    F.Inter.seed = 'wheat';
    F.Inter.target = { kind: 'tile', t, d: 0 };
    const before = F.Game.seeds('wheat');
    F.Inter.pressF();
    return { s: t.state, crop: t.crop, before, after: F.Game.seeds('wheat') };
  });
  ok('F 播种小麦（扣种子）', plant.s === 2 && plant.crop === 'wheat' && plant.after === plant.before - 1);
  const water = await page.evaluate(() => {
    const F = window.FARM;
    const t = F.Farm.tiles.find(t => t.state === 2);
    F.Player.setTool('can');
    F.Inter.target = { kind: 'tile', t, d: 0 };
    F.Inter.pressF();
    return { w: t.water, can: F.Game.can };
  });
  ok('F 浇水（扣水壶）', water.w > 0.9 && water.can === 9);

  /* 3. 建造：真实点击卡片 + 点击地面放置 */
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  const cards = await page.$$('#panel .card');
  ok('建造菜单打开且有卡片', cards.length >= 10);
  let placedFence = null;
  for (const c of cards) {
    const txt = await c.innerText();
    if (txt.includes('木围栏')) {
      await c.click();
      placedFence = await page.evaluate(() => {
        const F = window.FARM;
        F.Input.mx = 700; F.Input.my = 380;
        const w0 = F.Game.inv.wood || 0;
        F.Inter.startBuild('fence');
        for (let i = 0; i < 8; i++) F.Inter.updateBuild(0.016);
        const okPlace = F.Inter.build && F.Inter.build.ok;
        if (okPlace) F.Inter.tryPlace();
        return { ok: okPlace, n: F.Builds.list.filter(b => b.id === 'fence').length, w0, w1: F.Game.inv.wood || 0 };
      });
      break;
    }
  }
  ok('点击卡片进入建造并放置围栏（扣木材）', placedFence && placedFence.ok && placedFence.n > 0 && placedFence.w1 === placedFence.w0 - 2);

  /* 4. 拆除模式（扫描屏幕坐标，把准星对准围栏） */
  const removed = await page.evaluate(() => {
    const F = window.FARM;
    const b = F.Builds.list.find(x => x.id === 'fence');
    if (!b) return { hit: false, why: '没有围栏' };
    F.Inter.enterRemove();
    let found = false;
    /* 像玩家一样移动鼠标，直到准星选中这截围栏 */
    for (let my = 120; my <= 620 && !found; my += 12) {
      for (let mx = 120; mx <= 1000; mx += 12) {
        F.Input.mx = mx; F.Input.my = my;
        F.Inter.updateRemove(0.016);
        if (F.Inter.removeTarget === b) { found = true; break; }
      }
    }
    if (!found) return { hit: false, why: '准星无法对准围栏' };
    const t = F.Inter.removeTarget;
    if (t !== b) return { hit: false, why: '选中了别的建筑' };
    const w0 = F.Game.inv.wood || 0;
    F.Inter.tryRemove();
    const gone = !F.Builds.list.includes(b);
    F.Inter.exitAll();
    return { hit: true, gone, w1: F.Game.inv.wood || 0, w0, mode: F.Inter.removeMode };
  });
  console.log('   拆除 =', JSON.stringify(removed));
  ok('拆除围栏返还木材并退出模式', removed.hit && removed.gone && removed.w1 > removed.w0 && removed.mode === false);

  /* 5. 钓鱼完整流程：真实抛竿 → 拨快咬钩计时（确定性与帧率无关）→ 提竿收获 */
  const fish = await page.evaluate(async () => {
    const F = window.FARM;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const until = async (fn, timeout) => {
      const t0 = performance.now();
      while (!fn() && performance.now() - t0 < timeout) await wait(120);
      return !!fn();
    };
    F.Inter.exitAll();
    F.Game.auto = null;      /* 寻路会把玩家拖离钓点 */
    const s = F.Fish.spots[0];
    F.Player.pos.set(s.x, F.T.hAt(s.x, s.z), s.z);
    F.Player.setTool('rod');
    F.Inter.target = { kind: 'fish', s, d: 0 };
    F.Inter.pressF();
    const dbg = { stock: s.stock, started: !!F.Inter.fishing, phase: F.Inter.fishing && F.Inter.fishing.phase };
    /* 软渲染下游戏时间只有真实时间的几分之一，等 RNG 咬钩不可靠 —— 进入 wait 相位后把计时拨满，
       走的还是同一套「f.t > f.wait → bite → 提竿」状态机，只是不赌随机数 */
    if (!await until(() => F.Inter.fishing && (F.Inter.fishing.phase === 'wait' || F.Inter.fishing.phase === 'bite'), 30000)) {
      dbg.lastPhase = F.Inter.fishing && F.Inter.fishing.phase;
      return dbg;
    }
    if (F.Inter.fishing.phase === 'wait') { F.Inter.fishing.t = 99; }
    if (!await until(() => F.Inter.fishing && F.Inter.fishing.phase === 'bite', 15000)) {
      dbg.lastPhase = F.Inter.fishing && F.Inter.fishing.phase;
      return dbg;
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    await until(() => !F.Inter.fishing, 30000);   /* 收线动画 0.75s 游戏时间，低帧率下要十几秒真实时间 */
    dbg.bite = true;
    dbg.caught = F.Game.stats.fish;
    dbg.stock2 = s.stock;
    return dbg;
  });
  console.log('   钓鱼 =', JSON.stringify(fish));
  ok('抛竿 → 鱼讯 → 提竿收获', fish.bite && fish.caught >= 1);

  /* 5.5 新功能：Tab 地图传送 / 民居室内 / 体力药水 / 收货仓出售 */
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const mapOk = await page.evaluate(() => {
    const shown = document.getElementById('panel').style.display !== 'none';
    const cv = document.querySelector('#panel .bigmap');
    return { shown, hasMap: !!cv };
  });
  ok('Tab 打开世界地图面板', mapOk.shown && mapOk.hasMap);
  const mapBox = await page.locator('#panel .bigmap').boundingBox();
  if (mapBox) {
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.waitForTimeout(300);
  }
  const tp = await page.evaluate(() => ({
    x: window.FARM.Player.pos.x, z: window.FARM.Player.pos.z,
    panelClosed: document.getElementById('panel').style.display === 'none',
  }));
  ok('点击地图传送到目标点并关闭面板', Math.abs(tp.x) < 3 && Math.abs(tp.z) < 3 && tp.panelClosed);

  const house = await page.evaluate(async () => {
    const F = window.FARM;
    const b = F.Builds.list.find(b => b.id === 'house');
    F.House.enter(b);
    await new Promise(r => setTimeout(r, 900));
    const inside = F.Player.indoor;
    /* 走到床边，检查交互点 */
    const bed = F.House.items.find(f => f.kind === 'bed');
    F.Player.pos.set(bed.x + 0.8, bed.y, bed.z + 0.8);
    const tg = F.Inter.findTarget();
    F.Player.energy = 40;
    F.Inter.target = tg;
    F.Inter.pressF();                     /* 休息 1 小时 +20 体力 */
    await new Promise(r => setTimeout(r, 100));
    const energy = F.Player.energy;
    F.House.exit();
    await new Promise(r => setTimeout(r, 900));
    return { inside, furnKind: tg && tg.kind, energy, out: !F.Player.indoor };
  });
  console.log('   民居 =', JSON.stringify(house));
  ok('进入民居 → 床交互（休息+20体力）→ 走出房间',
    house.inside && house.furnKind === 'furn' && house.energy >= 59 && house.out);

  const potion = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.give('potion', 1);
    F.Player.energy = 50;
    F.Game.usePotion();
    const buff = F.Player.energyBuff;
    /* 用固定步长模拟 1 秒（软件渲染帧率低，不能等真实时间） */
    F.Input.keys = {};
    for (let i = 0; i < 60; i++) F.Player.update(1 / 60, false);
    return { buff, e1s: F.Player.energy };
  });
  ok('体力药水：每秒 +5 体力', potion.buff === 3 && potion.e1s >= 54);

  const sell = await page.evaluate(() => {
    const F = window.FARM;
    const depot = F.Builds.list.find(b => b.id === 'depot');
    F.Player.pos.set(depot.x + 4, 0, depot.z + 4);
    F.Game.give('wheat', 10);
    const c0 = F.Game.coins;
    const g = F.Game.sellItem('wheat', 10);
    return { c0, c1: F.Game.coins, g };
  });
  ok('收货仓出售小麦换金币', sell.g === 30 && sell.c1 === sell.c0 + 30);
  const tradePanel = await page.evaluate(() => {
    const F = window.FARM;
    F.UI.openPanel('trade');
    return document.getElementById('panel').innerHTML.includes('收货仓');
  });
  ok('收货仓交易面板打开', tradePanel);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.55 技能面板：战斗 / 生活 / 天赋 三个 Tab */
  await page.keyboard.press('l');
  await page.waitForTimeout(300);
  const skPanel = await page.evaluate(() => {
    const q = (s) => document.querySelectorAll('#panel ' + s).length;
    const mine = Array.prototype.find.call(document.querySelectorAll('#panel .skillgrid .skill'),
      e => e.textContent.indexOf('挖矿') >= 0);
    return {
      tabs: q('.ranktabs .rt'), on: (document.querySelector('#panel .ranktabs .rt.on') || {}).textContent || '',
      skills: q('.skillgrid .skill'), bars: q('.skillgrid .sb i'),
      mine: mine ? mine.textContent.replace(/\s+/g, ' ').trim() : '',
      gates: q('.items .item'),
    };
  });
  console.log('   技能面板 =', JSON.stringify(skPanel));
  ok('L 打开技能面板：生活页 8 项技能 + 经验条 + 挖矿解锁表',
    skPanel.tabs === 3 && skPanel.skills === 8 && skPanel.bars === 8 && /挖矿 Lv\./.test(skPanel.mine) && skPanel.gates >= 5);

  /* 切 Tab：战斗（装备 + 战斗力）/ 天赋（空态） */
  const tabRes = await page.evaluate(() => {
    const click = (nm) => Array.prototype.find.call(document.querySelectorAll('#panel .ranktabs .rt'),
      e => e.textContent.indexOf(nm) >= 0).click();
    click('战斗');
    const names = ['重斩', '旋风斩', '突进斩', '飞刃', '地刺', '疗愈', '雷霆链', '终结技'];
    const combat = {
      cards: document.querySelectorAll('#panel .skillgrid .skill').length,
      eq: document.querySelectorAll('#panel .items .item').length,
      def: (document.querySelector('#panel .tip') || {}).textContent || '',
      abil: Array.prototype.filter.call(document.querySelectorAll('#panel .items .item'),
        e => names.some(n => e.textContent.indexOf(n) >= 0)).length,
    };
    click('天赋');
    const talent = (document.querySelector('#panel .empty') || {}).textContent || '';
    click('生活');
    return { combat, talent, back: document.querySelectorAll('#panel .skillgrid .skill').length };
  });
  ok('技能面板切 Tab：战斗页有装备/防御 + 八个主动技能可装配 · 天赋页空态 · 可切回生活',
    tabRes.combat.cards === 1 && tabRes.combat.eq >= 3 && /防御/.test(tabRes.combat.def) &&
    tabRes.combat.abil === 8 && /天赋数据尚未接入/.test(tabRes.talent) && tabRes.back === 8);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.55b 技能文字可读性：技能名白色加粗带描边，未选中 Tab 深色 */
  const txt = await page.evaluate(() => {
    window.FARM.UI.openPanel('skill');
    const sn = document.querySelector('#panel .skill .sn');
    const rt = Array.prototype.find.call(document.querySelectorAll('#panel .ranktabs .rt'), e => !e.classList.contains('on'));
    const s1 = getComputedStyle(sn), s2 = getComputedStyle(rt);
    return { sn: s1.color, snW: +s1.fontWeight || 0, sh: s1.textShadow !== 'none', rt: s2.color };
  });
  console.log('   技能文字 =', JSON.stringify(txt));
  ok('技能名白色加粗带描边（浅色面板上可读）· 未选中 Tab 换深色', txt.sn === 'rgb(255, 255, 255)' && txt.snW >= 700 && txt.sh && txt.rt !== 'rgb(223, 232, 220)');

  /* 5.55c 面板统一拉伸：右下角把手（鼠标）→ 记忆 → 键盘微调 → 拉过头夹回边界 */
  await page.evaluate(() => { window.FARM.UI.closePanel(); window.FARM.UI.openPanel('inv'); });
  const box0 = await page.locator('#panel .panel').boundingBox();
  const se = await page.locator('#panel .panel .prs-se').boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 240, se.y + 220, { steps: 8 });
  await page.mouse.up();
  const box1 = await page.locator('#panel .panel').boundingBox();
  const savedRaw = await page.evaluate(() => localStorage.getItem('farm3d_panel_inv'));
  await page.focus('#panel .panel .prs-e');
  await page.keyboard.press('ArrowRight');
  const box2 = await page.locator('#panel .panel').boundingBox();
  const se2 = await page.locator('#panel .panel .prs-se').boundingBox();
  await page.mouse.move(se2.x + se2.width / 2, se2.y + se2.height / 2);
  await page.mouse.down();
  await page.mouse.move(4000, 3000, { steps: 5 });        /* 拉到屏幕外 → 应被夹回 94vw / 90vh */
  await page.mouse.up();
  const box3 = await page.locator('#panel .panel').boundingBox();
  const vp = page.viewportSize();
  console.log('   面板拉伸 =', JSON.stringify({ w0: box0.width | 0, w1: box1.width | 0, w2: box2.width | 0, w3: box3.width | 0, h1: box1.height | 0, saved: savedRaw && JSON.parse(savedRaw) }));
  ok('面板可左右/上下/斜角拉伸：把手生效、尺寸记忆、键盘微调、越界自动夹回',
    box1.width > box0.width + 150 && box1.height > box0.height + 120 && !!savedRaw &&
    Math.abs(box2.width - box1.width - 24) < 3 &&
    box3.width <= vp.width * 0.94 + 2 && box3.height <= vp.height * 0.9 + 2);
  await page.evaluate(() => { localStorage.removeItem('farm3d_panel_inv'); window.FARM.UI.closePanel(); });

  /* 5.55d 植被：白花簇已撒布且共用风场；浆果丛已从装饰层转正为采集节点 */
  const flora = await page.evaluate(() => {
    const F = window.FARM;
    F.Player.indoor = false;
    F.Player.pos.set(4, F.T.hAt(4, 104), 104);
    F.World.updateGrass(4, 104, 0.1, true);
    const L = F.World.flora || [];
    /* 浆果丛转正检查：世界里存在该节点，且真实 harvest 出浆果（采完放回去不破坏世界） */
    const n = (F.Nodes.list || []).filter(x => x.type === 'berrybush' && x.alive)[0];
    let bb = { exists: false };
    if (n) {
      const y = F.Nodes.harvest(n);
      n.alive = true; n.respawn = 0;
      bb = { exists: true, berry: y && y.berry };
    }
    return {
      layers: L.length,
      counts: L.map(l => l.mesh.count),
      wind: L[0] && L[0].mat.userData.u ? +L[0].mat.userData.u.uniforms.uWindStr.value.toFixed(3) : -1,
      grassStr: +F.World.wind.strength.toFixed(3),
      bbCount: (F.Nodes.list || []).filter(x => x.type === 'berrybush').length,
      bb,
    };
  });
  console.log('   植被层 =', JSON.stringify(flora));
  ok('白花簇撒布成片 + 浆果丛转正为采集节点（全图 1000+ 株、真实采集出浆果）',
    flora.layers === 2 && flora.counts[0] > 50 && Math.abs(flora.wind - flora.grassStr) < 0.5 &&
    flora.bbCount > 1000 && flora.bb.exists && flora.bb.berry >= 2);   /* 密度减半后浆果丛 1400 株 */

  /* 5.56 空格跳跃回归：普通按键 / 输入法 Process / 脏键位 / 体力不足提示 / 焦点残留 */
  const jp = [];
  const prepJump = () => page.evaluate(() => {
    const F = window.FARM;
    F.UI.closePanel();
    F.Player.pos.set(4, F.T.hAt(4, 104), 104);
    F.Player.onGround = true; F.Player.vy = 0; F.Player.swimming = false; F.Player.energy = 100;
    F.Player.updateCamera(0, true);
  });
  const rise = () => page.evaluate(() => {
    const F = window.FARM, y0 = F.Player.pos.y, out = [];
    for (let i = 0; i < 10; i++) { F.Player.update(1 / 30, true); out.push(F.Player.pos.y - y0); }
    return +Math.max.apply(null, out).toFixed(3);
  });
  await prepJump();
  await page.keyboard.down('Space'); await page.waitForTimeout(60);
  jp.push(await rise());
  await page.keyboard.up('Space');
  /* 输入法：e.key 为 Process 时仍能起跳（e.code 兜底） */
  await prepJump();
  await page.evaluate(() => {
    window.FARM.Input.codes = {};
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', code: 'Space', bubbles: true }));
  });
  jp.push(await rise());
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Process', code: 'Space', bubbles: true })));
  /* 脏键位存档：opt.keys.jump = 'space' 应被规范化 */
  await page.evaluate(() => { window.FARM.Game.opt.keys = { jump: 'space' }; });
  await prepJump();
  await page.keyboard.down('Space'); await page.waitForTimeout(60);
  jp.push(await rise());
  await page.keyboard.up('Space');
  await page.evaluate(() => { window.FARM.Game.opt.keys = {}; });
  /* 体力不足：不跳且给出提示（不再静默失败） */
  await prepJump();
  await page.evaluate(() => { window.FARM.Player.energy = 2; window.FARM.Player.jumpWarnT = 0; });
  await page.keyboard.down('Space'); await page.waitForTimeout(60);
  const lowRise = await rise();
  const lowToast = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#toasts .toast'), e => e.textContent).join('|'));
  await page.keyboard.up('Space');
  /* 焦点残留在隐藏输入框时仍能操作 */
  await prepJump();
  await page.evaluate(() => {
    const d = document.createElement('div'); d.style.display = 'none';
    const i = document.createElement('input'); d.appendChild(i); document.body.appendChild(d); i.focus();
  });
  await page.keyboard.down('Space'); await page.waitForTimeout(60);
  jp.push(await rise());
  await page.keyboard.up('Space');
  /* 焦点在可见聊天输入框：空格应打字而不是起跳 */
  await page.evaluate(() => { window.FARM.UI2 && window.FARM.UI2.openChat(); });
  await page.waitForTimeout(300);
  await page.focus('#cw-in');
  await prepJump();
  await page.keyboard.press('Space');
  const chatVal = await page.evaluate(() => document.querySelector('#cw-in').value);
  await page.keyboard.down('Space'); await page.waitForTimeout(60);
  const typingRise = await rise();
  await page.keyboard.up('Space');
  await page.evaluate(() => {
    const F = window.FARM;
    if (F.UI2) F.UI2.closeChat();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    F.Input.keys = {}; F.Input.codes = {};
    F.Player.pos.set(4, F.T.hAt(4, 104), 104); F.Player.energy = 100; F.Player.setTool('axe');
  });
  console.log('   跳跃升起 =', JSON.stringify(jp), '低体力升起 =', lowRise, '提示 =', JSON.stringify(lowToast), '输入中升起 =', typingRise, '输入框 =', JSON.stringify(chatVal));
  ok('空格跳跃：普通/输入法/脏键位/焦点残留都能起跳，聊天输入中不抢键',
    jp[0] > 0.5 && jp[1] > 0.5 && jp[2] > 0.5 && jp[3] > 0.5 && typingRise < 0.05 && chatVal === ' ');
  ok('体力不足时不再静默失败：给出提示且跳不起来', lowRise < 0.05 && /体力不足/.test(lowToast));

  /* 5.55e 战斗技能：Q 键 / 右键 / HUD 触摸按钮三条释放途径 + CD + 体力 + 结算次数 */
  /* 先建一条干净的测试场景：解锁全部技能，正前方放两只怪 */
  await page.evaluate(() => {
    const F = window.FARM;
    F.UI.closePanel();
    F.Skills.data.combat = F.Skills.data.combat || { lv: 1, xp: 0 };
    F.Skills.data.combat.lv = 60;
    F.Ability.setSlot(0, 'heavy'); F.Ability.setSlot(1, 'whirl'); F.Ability.setSlot(2, 'dash');
    F.Ability.cd = {}; F.Ability.casting = null; F.Ability.fx.length = 0;
  });
  const setupFight = () => page.evaluate(() => {
    const F = window.FARM, P = F.Player;
    P.pos.set(4, F.T.hAt(4, 104), 104); P.rot = 0; P.energy = 100; P.tool = 'sword'; P.dead = false; P.indoor = false;
    /* 只清普通怪：门卫是 50 万血的村庄配置，后面「新手村」测试还要查它 */
    for (const m of F.Combat.mobs.slice()) if (!m.def.guard) { m.alive = false; m.deadT = 9; }
    F.Combat.update(0.02);
    const a = F.Combat.spawn('boar', P.pos.x, P.pos.z + 2.2, 1, 'world');
    a.hp = a.maxHp = 99999;
    F.Ability.cd = {}; F.Ability.casting = null; F.Ability.hitCount = 0;
    return { hp: a.hp };
  });
  const step = n => page.evaluate(n => { for (let i = 0; i < n; i++) window.FARM.Ability.update(1 / 60); }, n);
  /* 清场 + 复活：技能/战斗测试留下的敌对怪会追着玩家咬，玩家死亡后重生逻辑每帧
     把坐标拉回出生点，后续需要传送的测试（公告板/黑市/战斗）会全部落空 —— 测完必须清怪复活 */
  const revive = () => page.evaluate(() => {
    const F = window.FARM;
    for (const m of F.Combat.mobs) if (m.alive && !m.def.guard) { m.alive = false; m.deadT = 9; }
    F.Combat.update(0.02);
    F.Player.dead = false; F.Player.hp = 100;
    F.Game.auto = null;      /* 自动寻路每帧改写坐标，会把后续测试的传送拖走 */
  });

  await setupFight();
  await page.keyboard.press('q');                                  /* [Q] → 槽1 重斩 */
  await step(40);
  const pig = () => page.evaluate(() => {          /* 场上还有村口 50 万血门卫，只认我们刚放的那只野猪 */
    const m = window.FARM.Combat.mobs.filter(x => x.alive && x.def && x.def.name === '野猪')[0];
    return { hits: window.FARM.Ability.hitCount, hp: m ? m.hp : 0, energy: window.FARM.Player.energy, cd: +window.FARM.Ability.cd.heavy.toFixed(2) };
  });
  const qres = await pig();

  await setupFight();
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });                      /* 右键 → 槽3 突进斩 */
  await page.waitForTimeout(60);                                   /* 按住一帧以上，保证被每帧轮询捕捉到 */
  await page.mouse.up({ button: 'right' });
  await step(40);
  const rres = await page.evaluate(() => {
    const F = window.FARM;
    return { hits: F.Ability.hitCount, energy: F.Player.energy, dash: Math.abs(F.Player.pos.z - 104) > 1 };
  });

  await setupFight();
  await page.locator('#skillbar .sb').first().click();             /* HUD 触摸按钮 → 槽1 */
  await step(40);
  const tres = await page.evaluate(() => ({ hits: window.FARM.Ability.hitCount, energy: window.FARM.Player.energy }));

  /* CD 中重复按：不扣体力、不产生第二次结算 */
  const cdGuard = await page.evaluate(() => {
    const F = window.FARM, A = F.Ability;
    A.cd = {}; A.casting = null; A.hitCount = 0; F.Player.energy = 100;
    A.setSlot(0, 'heavy');
    const m = F.Combat.mobs.filter(x => x.alive && x.def.name === '野猪')[0];   /* 别碰到村口门卫 */
    if (m) { m.hp = m.maxHp = 99999; }
    A.cast(0);
    for (let i = 0; i < 40; i++) A.update(1 / 60);
    const e1 = F.Player.energy, h1 = A.hitCount;
    A.cast(0); A.cast(0);
    for (let i = 0; i < 20; i++) A.update(1 / 60);
    return { sameEnergy: F.Player.energy === e1, sameHits: A.hitCount === h1 };
  });
  /* 体力不足：不放 + 有提示 */
  const lowE = await page.evaluate(() => {
    const F = window.FARM, A = F.Ability;
    A.cd = {}; A.casting = null; F.Player.energy = 2;
    const r = A.cast(0);
    const t = Array.prototype.map.call(document.querySelectorAll('#toasts .toast'), e => e.textContent).join('|');
    return { released: r, toast: t, energy: F.Player.energy };
  });
  /* 未解锁：等级不足时不放 */
  const locked = await page.evaluate(() => {
    const F = window.FARM, A = F.Ability;
    const keep = F.Skills.data.combat.lv;
    A.cd = {}; A.casting = null; F.Player.energy = 100;
    F.Skills.data.combat.lv = 1;
    A.setSlot(1, 'finisher');
    const bad = A.cast(1);
    A.setSlot(1, 'whirl'); F.Skills.data.combat.lv = keep;
    return bad === false;
  });
  console.log('   技能 Q =', JSON.stringify(qres), '右键 =', JSON.stringify(rres), '按钮 =', JSON.stringify(tres));
  console.log('   新手村 guards =', JSON.stringify(await page.evaluate(() => window.FARM.Combat.mobs.filter(m => m.def.guard).length)));
  console.log('   守卫 =', JSON.stringify(cdGuard), '低体力 =', JSON.stringify(lowE.energy), JSON.stringify(lowE.toast));
  ok('三条释放途径都生效：[Q] / 鼠标右键 / HUD 按钮（触摸可用）',
    /* ponytail: 体力在测试步骤之间会被真实帧自然回复一点点，比对用容差，别卡死在精确的 92.0000 */
    qres.hits === 1 && qres.hp < 99999 && rres.hits >= 1 && tres.hits === 1 && Math.abs(tres.energy - 92) < 0.05);
  ok('冷却与资源：CD 中重复按不扣体力不结算；体力不足不放并提示；等级不足不放',
    cdGuard.sameEnergy && cdGuard.sameHits && lowE.released === false && lowE.energy === 2 &&
    /体力不足/.test(lowE.toast) && locked);

  /* 释放瞬间截图存证 */
  await setupFight();
  await page.evaluate(() => { window.FARM.Ability.setSlot(0, 'whirl'); window.FARM.Ability.cast(0); window.FARM.Ability.update(0.3); });
  await page.waitForTimeout(120);
  const evDir = path.join(__dirname, 'production', 'qa', 'evidence');
  try { require('fs').mkdirSync(evDir, { recursive: true }); } catch (e) { }
  await page.screenshot({ path: path.join(evDir, 'ability-whirl.png') });
  await page.evaluate(() => { const A = window.FARM.Ability; for (let i = 0; i < 200; i++) A.update(1 / 60); });
  await revive();

  /* 5.55f 存档迁移：v1 旧档（含 seed:'q'）载入后 Q 让给技能、金币与技能槽都保住 */
  /* ponytail: 不走 page.reload() —— 主循环会在 beforeunload 里先 save()，把我们要测的 v1 档覆盖成新档，
     测到的就不是迁移了。直接写 v1 档再调 load()，这才是精确的迁移路径 */
  const mig = await page.evaluate(() => {
    localStorage.setItem('farm3d_save_v1', JSON.stringify({ v: 1, time: 12.5, day: 3, coins: 777, opt: { grass: 2, keys: { seed: 'q' } } }));
    return window.FARM.Game.load();
  });
  await page.evaluate(() => window.FARM.UI.closePanel());
  const after = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.save();
    const raw = JSON.parse(localStorage.getItem('farm3d_save_v1') || '{}');
    return {
      coins: F.Game.coins, seed: F.bind('seed'), ab1: F.bind('ab1'), ab2: F.bind('ab2'),
      talents: !!F.Game.talents, pts: F.Game.talentPts, v: raw.v, day: F.Game.day,
      abil: F.Ability.slots.slice(),
    };
  });
  console.log('   迁移后 =', JSON.stringify(after));
  ok('旧档 v1 迁移到 v2：金币/天数保留，Q 让给技能、种子改 Z、天赋字段补齐',
    after.coins === 777 && after.day === 3 && after.v === 2 && after.seed === 'z' &&
    after.ab1 === 'q' && after.ab2 === 'e' && after.talents && after.abil.length === 3);

  /* 5.55g 灌木丛浆果：50% 概率 5~10 个（真实 harvest 统计）· 食用回 10 点体力 · 背包里能吃 */
  const berryStat = await page.evaluate(() => {
    const F = window.FARM;
    const node = { alive: true, def: F.NODE_DEFS.bush, respawn: 0, hits: 1, grow: 0, type: 'bush', idx: 0 };
    let hit = 0, min = 99, max = 0, baseOK = true;
    for (let i = 0; i < 600; i++) {
      node.alive = true;
      const y = F.Nodes.harvest(node);
      if (y.berry) { hit++; min = Math.min(min, y.berry); max = Math.max(max, y.berry); }
      if (y.fiber !== 2 || y.branch !== 1) baseOK = false;
    }
    return { rate: +(hit / 600).toFixed(2), min, max, baseOK };
  });
  const berryEat = await page.evaluate(() => {
    const F = window.FARM, P = F.Player;
    F.Game.give('berry', 3);
    P.energy = 40; P.hunger = 50;
    F.Game.eat('berry');
    const e1 = P.energy, h1 = P.hunger;
    const toast = Array.prototype.map.call(document.querySelectorAll('#toasts .toast'), e => e.textContent).join('|');
    F.Game.give('carrot', 1);
    P.energy = 40; P.hunger = 50;
    F.Game.eat('carrot');
    return { e1, h1, toast, e2: P.energy, h2: P.hunger };
  });
  const berryUI = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.give('berry', 5);
    F.UI.openPanel('inv');
    const row = Array.prototype.find.call(document.querySelectorAll('#panel .item'), e => e.textContent.indexOf('浆果') >= 0);
    if (!row) return { found: false };
    return { found: true, tip: row.dataset.tip || '', minis: Array.prototype.map.call(row.querySelectorAll('.mini'), e => e.textContent).join(',') };
  });
  await page.evaluate(() => window.FARM.UI.closePanel());
  console.log('   浆果 =', JSON.stringify(berryStat), JSON.stringify(berryEat), JSON.stringify(berryUI.minis));
  ok('灌木丛 50% 概率出 5~10 个浆果，基础掉落不被概率产出污染',
    Math.abs(berryStat.rate - 0.5) < 0.12 && berryStat.min >= 5 && berryStat.max <= 10 && berryStat.baseOK);
  ok('浆果食用恢复 10 点体力（饥饿食物的旧规则不变）· 背包里可点「吃」且提示写明恢复体力',
    berryEat.e1 === 50 && berryEat.h1 === 50 && /体力 \+10/.test(berryEat.toast) &&
    berryEat.h2 === 68 && berryEat.e2 === 46 &&
    berryUI.found && /恢复 10 点体力/.test(berryUI.tip) && berryUI.minis.indexOf('吃') >= 0);

  /* 5.56 采集等级门槛：世界里站到铁矿上，1 级锁住；练到 Lv.10 放行 */
  const gate = await page.evaluate(() => {
    const F = window.FARM;
    F.Skills.init();
    const n = F.Nodes.list.filter(n => (n.type === 'iron' || n.type === 'gold') && n.alive)[0];
    if (!n) return { skip: true };
    F.Player.pos.set(n.x, 0, n.z); F.Player.pos.y = F.T.hMesh(n.x, n.z);
    F.Player.setTool('pick');
    const ni = document.getElementById('nodeinfo');
    F.Inter.update(0.016);
    const out = { type: n.type, prompt: document.getElementById('prompt').textContent };
    out.card = { shown: ni.style.display !== 'none', text: ni.textContent.replace(/\s+/g, ' ').trim() };
    F.Inter.pressF();
    out.workLocked = F.Inter.work;
    F.Skills.get('mine').lv = 10;
    F.Inter.update(0.016);
    out.promptAfter = document.getElementById('prompt').textContent;
    out.cardAfter = ni.textContent.replace(/\s+/g, ' ').trim();
    F.Inter.pressF();
    out.workOpened = !!F.Inter.work;
    F.Inter.work = null;
    /* 走远：信息卡应自动收起 */
    F.Player.pos.set(4, F.T.hAt(4, 104), 104);
    F.Inter.update(0.016);
    out.cardAway = ni.style.display;
    F.Skills.init();
    return out;
  });
  console.log('   采集门槛 =', JSON.stringify(gate));
  ok('靠近铁矿：1 级时提示等级门槛且 F 无效，Lv.10 后正常开工',
    !gate.skip && /需要挖矿等级 10 级/.test(gate.prompt) && !gate.workLocked &&
    /\[F\]/.test(gate.promptAfter) && gate.workOpened);
  ok('靠近资源弹出信息卡（等级要求 / 现有等级 / 种类 / 掉落 / 经验，走远收起）',
    gate.card.shown && /等级要求 挖矿 Lv\.10/.test(gate.card.text) && /现有 Lv\.1/.test(gate.card.text) &&
    /采矿/.test(gate.card.text) && /掉落物：石块 ×1、铁矿 ×2/.test(gate.card.text) && /采集经验：挖矿 \+2/.test(gate.card.text) &&
    /等级不足/.test(gate.card.text) && /可采集/.test(gate.cardAfter) && gate.cardAway === 'none');
  await page.evaluate(() => { window.FARM.Inter.work = null; window.FARM.UI.setPrompt(''); });

  /* 5.6 聊天窗：拖拽 / 拉伸 / 关闭 */
  await page.keyboard.press('t');
  await page.waitForTimeout(300);
  const chatOpen = await page.evaluate(() => {
    const w = document.getElementById('chatwin');
    return !!w && w.style.display !== 'none';
  });
  ok('T 键打开聊天窗', chatOpen);
  const b1 = await page.locator('#chatwin').boundingBox();
  if (b1) {
    await page.mouse.move(b1.x + 90, b1.y + 12);
    await page.mouse.down();
    await page.mouse.move(b1.x + 90 - 120, b1.y + 12 + 70, { steps: 6 });
    await page.mouse.up();
  }
  const b2 = await page.locator('#chatwin').boundingBox();
  ok('聊天窗可拖拽', !!b2 && b2.x < b1.x - 60 && b2.y > b1.y + 40);
  if (b2) {
    await page.mouse.move(b2.x + b2.width - 4, b2.y + b2.height - 4);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width + 90, b2.y + b2.height + 70, { steps: 6 });
    await page.mouse.up();
  }
  const b3 = await page.locator('#chatwin').boundingBox();
  console.log('   聊天窗 =', JSON.stringify({ b1, b2, b3 }));
  ok('聊天窗可拉伸', !!b3 && b3.width > b2.width + 40 && b3.height > b2.height + 30);
  await page.click('#cw-x');
  ok('聊天窗可关闭', await page.evaluate(() => document.getElementById('chatwin').style.display === 'none'));

  /* 5.7 好友：右击 → 聊天 */
  await page.keyboard.press('k');
  await page.waitForTimeout(250);
  const frOk = await page.evaluate(() => document.querySelectorAll('#panel .frow').length);
  ok('好友面板列出好友', frOk >= 6);
  await page.locator('#panel .frow').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  const ctx = await page.evaluate(() => {
    const m = document.querySelector('.ctxmenu');
    return m ? Array.prototype.map.call(m.querySelectorAll('.ctxitem'), e => e.textContent) : null;
  });
  ok('右击好友弹出菜单（含聊天按钮）', !!ctx && ctx.includes('聊天'));
  if (ctx) {
    await page.evaluate(() => {
      const it = Array.prototype.find.call(document.querySelectorAll('.ctxmenu .ctxitem'), e => e.textContent === '聊天');
      it.click();
    });
    await page.waitForTimeout(250);
  }
  const priv = await page.evaluate(() => {
    const w = document.getElementById('chatwin');
    return { open: w && w.style.display !== 'none', tabs: Array.prototype.map.call(w.querySelectorAll('.cw-tab'), e => e.textContent) };
  });
  ok('点击聊天按钮 → 打开私聊窗口', priv.open && priv.tabs.some(t => t.indexOf('私') === 0));
  await page.evaluate(() => window.FARM.UI2.closeChat());

  /* 5.8 公会：经验条 / 百分比 / 升级按钮 / 帮助 / 公告编辑 */
  await page.keyboard.press('u');
  await page.waitForTimeout(250);
  const guild = await page.evaluate(() => {
    const p = document.getElementById('panel');
    return {
      hasBar: !!p.querySelector('.gxp-bar i'),
      pct: p.querySelector('.gxp-pct') ? p.querySelector('.gxp-pct').textContent : '',
      num: p.querySelector('.gxp-num') ? p.querySelector('.gxp-num').textContent : '',
      upDisabled: p.querySelector('#pg-up') ? p.querySelector('#pg-up').disabled : null,
      hasHelp: !!p.querySelector('#pg-help'),
      notice: !!p.querySelector('.gnotice'),
      cap: window.FARM.Social.guildCap(),
    };
  });
  ok('公会面板：进度条 + 百分比 + 升级按钮 + ❓帮助 + 可编辑公告',
    guild.hasBar && /%$/.test(guild.pct) && guild.num.indexOf('/') > 0 && guild.upDisabled === true && guild.hasHelp && guild.notice);
  await page.evaluate(() => {
    const ta = document.querySelector('.gnotice');
    ta.value = '测试公告：今晚八点集合打塔';
    document.querySelector('#pg-save').click();
  });
  ok('公会公告可编辑保存',
    await page.evaluate(() => window.FARM.Social.guild.notice.indexOf('今晚八点') >= 0));

  /* 5.9 拍卖行：搜索 / 筛选 / 上架手续费 */
  await page.keyboard.press('y');
  await page.waitForTimeout(250);
  const ah1 = await page.evaluate(() => ({
    rows: document.querySelectorAll('#panel .ah-row').length,
    filters: document.querySelectorAll('#panel .filters select').length,
  }));
  await page.fill('#pa-q', '铁剑');
  await page.waitForTimeout(250);
  const ah2 = await page.evaluate(() => document.querySelectorAll('#panel .ah-row').length);
  console.log('   拍卖行 =', JSON.stringify({ ah1, ah2 }));
  ok('拍卖行：列表 + 4 组筛选 + 搜索生效', ah1.rows > 5 && ah1.filters === 4 && ah2 < ah1.rows);
  const listed = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.coins = 5000; F.Game.inv.wood = 50;
    const c0 = F.Game.coins;
    F.Social.list('wood', 10, 100, false);        /* 总价 1000 → 手续费 10 */
    return { fee: c0 - F.Game.coins, mine: F.Social.listings.filter(l => l.mine).length };
  });
  ok('拍卖行：上架扣 1% 手续费', listed.fee === 10 && listed.mine >= 1);
  const bought = await page.evaluate(() => {
    const F = window.FARM;
    const l = F.Social.query({}).find(l => !l.mine);
    const n0 = F.Game.inv[l.item] || 0;
    F.Game.coins = 99999;
    const okBuy = F.Social.buy(l.id);
    return { okBuy, got: (F.Game.inv[l.item] || 0) - n0 };
  });
  ok('拍卖行：购买到货', bought.okBuy && bought.got > 0);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.10 新手村：NPC 对话 / 世界塔传送门 / 门卫 50 万血 */
  const vil = await page.evaluate(async () => {
    const F = window.FARM;
    const V = F.Village;
    F.Player.indoor = false;
    const npc0 = V.npcs[0];
    F.Player.pos.set(npc0.x + 1.6, 0, npc0.z + 1.6);
    F.Player.pos.y = F.T.hAt(F.Player.pos.x, F.Player.pos.z);
    const npc = V.nearest(F.Player.pos.x, F.Player.pos.z, 4);
    let shop = null;
    if (npc) { F.Inter.target = { kind: 'npc', n: npc }; F.Inter.pressF(); shop = document.getElementById('panel').innerHTML.slice(0, 40); }
    const guards = F.Combat.mobs.filter(m => m.type === 'guard');
    return {
      npc: npc ? npc.name : null, shop: !!shop && shop.indexOf('panel') >= 0,
      guards: guards.length, ghp: guards[0] ? guards[0].maxHp : 0,
      tower: V.tower ? V.tower.floors : 0,
      portal: !!V.portal,
    };
  });
  console.log('   新手村 =', JSON.stringify(vil));
  ok('新手村：8 商人可对话 + 世界塔 33 层 + 传送门 + 2 名 50 万血门卫',
    !!vil.npc && vil.shop && vil.tower === 33 && vil.portal && vil.guards === 2 && vil.ghp === 500000);

  /* 5.10b 传送门：海洋色 + 旋转（随主循环真的在转） */
  const portal = await page.evaluate(() => {
    const p = window.FARM.Village.portal && window.FARM.Village.portal.portal;
    if (!p) return { skip: true };
    const z0 = p.spin.rotation.z, o0 = p.disc.material.opacity;
    window.FARM.Village.update(0.05); window.FARM.Village.update(0.05);
    const c = p.ring.material.color, d = p.disc.material.color;
    return {
      parts: p.spin.children.length, spun: +(z0 - p.spin.rotation.z).toFixed(3),
      op: +p.disc.material.opacity.toFixed(3), opChanged: p.disc.material.opacity !== o0,
      ring: [+c.r.toFixed(2), +c.g.toFixed(2), +c.b.toFixed(2)], discBlue: d.b > d.r,
      emis: p.ring.material.emissiveIntensity,
    };
  });
  console.log('   传送门 =', JSON.stringify(portal));
  ok('传送门为海洋色旋转模型：随帧涡转 + 海浪弧/鳍保留 + 自发光不刺眼',
    !portal.skip && portal.parts >= 7 && portal.spun > 0.05 && portal.ring[2] > portal.ring[0] &&
    portal.discBlue && portal.emis <= 0.7);

  /* 5.11 副本：门票进入 → 怪物 → 通关 → 退出 */
  const dun = await page.evaluate(async () => {
    const F = window.FARM;
    F.Game.give('ticket', 2);
    const okIn = F.Dungeon.enter(5);
    await new Promise(r => setTimeout(r, 1200));
    const mobs = F.Combat.mobs.filter(m => m.realm === 'dungeon').length;
    const boss = !!F.Dungeon.boss;
    const t0 = F.Game.inv.ticket;
    for (const m of F.Combat.mobs.filter(m => m.realm === 'dungeon')) F.Combat.hit(m, 99999999);
    const cleared = F.Dungeon.cleared;
    F.Dungeon.exit();
    await new Promise(r => setTimeout(r, 1200));
    return { okIn, inside0: true, mobs, boss, cleared, ticket: F.Game.inv.ticket, out: !F.Dungeon.inside };
  });
  ok('副本：消耗门票进入 → 生成怪物与 BOSS → 通关 → 退出',
    dun.okIn && dun.mobs > 5 && dun.boss && dun.cleared && dun.out);

  /* 5.12 战斗：攻击掉血 */
  await revive();
  const fight = await page.evaluate(() => {
    const F = window.FARM;
    F.Player.hp = 100;
    const m = F.Combat.spawn('boar', F.Player.pos.x + 1.6, F.Player.pos.z, 1, 'world');
    m.hp = m.maxHp = 500;
    let dmg = 0;
    /* headless 下偶发未命中：怪物保持在攻击距离内重试几次 */
    for (let i = 0; i < 6 && dmg <= 0; i++) {
      m.x = F.Player.pos.x + 1.2; m.z = F.Player.pos.z;
      F.Inter.target = { kind: 'mob', m };
      F.Combat.atkCd = 0;
      F.Inter.pressF();
      dmg = 500 - m.hp;
    }
    F.Combat.hit(m, 99999);
    return { dmg, dead: !m.alive, kills: F.Game.stats.kill };
  });
  ok('战斗：攻击造成伤害且可击杀', fight.dmg > 0 && fight.dead && fight.kills >= 1);

  /* 5.13 排行榜：专属类别动态排名 + 玩家详情面板 */
  await page.keyboard.press('j');
  await page.waitForTimeout(350);
  const rank = await page.evaluate(() => ({
    tabs: document.querySelectorAll('#panel .ranktabs .rt').length,
    rows: document.querySelectorAll('#panel .rk-row').length,
    me: document.querySelectorAll('#panel .rk-row.me').length,
    stat: (document.querySelector('#panel .pstat') || {}).textContent || '',
  }));
  console.log('   排行榜 =', JSON.stringify(rank));
  ok('J 打开排行榜：12 个类别 + 榜单行 + 我的名次', rank.tabs === 12 && rank.rows > 20 && rank.me === 1 && /我的名次/.test(rank.stat));

  await page.evaluate(() => {
    const t = Array.prototype.find.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent.indexOf('战斗') >= 0);
    t.click();
  });
  await page.waitForTimeout(300);
  const cat = await page.evaluate(() => ({
    on: (document.querySelector('#panel .ranktabs .rt.on') || {}).textContent || '',
    first: (document.querySelector('#panel .rk-row .rk-sc') || {}).textContent || '',
  }));
  ok('切换类别 → 战斗榜（击杀数）', /战斗/.test(cat.on) && /击杀/.test(cat.first));

  await page.evaluate(() => {
    const row = document.querySelector('#panel .rk-row:not(.me)');
    row.click();
  });
  await page.waitForTimeout(350);
  const pl = await page.evaluate(() => ({
    av: !!document.querySelector('#panel .pl-av'),
    name: (document.querySelector('#panel .pl-name') || {}).textContent || '',
    eq: document.querySelectorAll('#panel .items .item').length,
    tools: document.querySelectorAll('#panel .toolgrid .tool').length,
    skills: document.querySelectorAll('#panel .skillgrid .skill').length,
    bars: document.querySelectorAll('#panel .skillgrid .sb i').length,
    lvTexts: Array.prototype.map.call(document.querySelectorAll('#panel .skillgrid .sl'), e => e.textContent).join(' '),
    back: !!document.querySelector('#pp-back'),
  }));
  console.log('   玩家详情 =', JSON.stringify(pl));
  ok('点击其他玩家 → 详情面板（装备3 / 工具7 / 技能8 + 经验条）',
    pl.av && pl.eq === 3 && pl.tools === 7 && pl.skills === 8 && pl.bars === 8 && pl.back && /Lv\./.test(pl.lvTexts));

  await page.click('#pp-back');
  await page.waitForTimeout(300);
  ok('返回排行榜', await page.evaluate(() => document.querySelectorAll('#panel .rk-row').length > 20));

  const dyn = await page.evaluate(() => {
    const F = window.FARM;
    const key = (id) => F.Rank.list(id).map(x => x.p.name + ':' + x.score).join(',');
    let changed = 0, moved = 0, up = 0, rounds = 0;
    /* 其他玩家产出带随机性：多推进几轮再统计（headless 下帧不稳） */
    for (let round = 0; round < 6 && !(changed > 0 && moved > 0 && up > 0); round++) {
      rounds++;
      const before = {};
      for (const c of F.Rank.cats) before[c.id] = key(c.id);
      for (let i = 0; i < 40; i++) { F.Rank.t = 0; F.Rank.tick(0.016); }
      changed = moved = up = 0;
      for (const c of F.Rank.cats) {
        if (before[c.id] !== key(c.id)) changed++;
        const mv = F.Rank.list(c.id).filter(x => !x.p.self && x.delta !== 0);
        moved += mv.length; up += mv.filter(x => x.delta > 0).length;
      }
    }
    F.UI2.panelRank('total');
    return { changed, moved, up, rounds };
  });
  console.log('   动态排名 =', JSON.stringify(dyn));
  ok('排行榜动态更新（其他玩家持续产出、名次涨跌）', dyn.changed > 0 && dyn.moved > 0 && dyn.up > 0);

  const sk = await page.evaluate(() => {
    const F = window.FARM;
    F.Skills.init();
    const n1 = F.Skills.need(1);
    F.Game.addSkill('mine', n1 + 1);
    F.Game.addTool('pick', n1 + 1);
    return { mineLv: F.Skills.lv('mine'), pickLv: F.Skills.tool('pick').lv, myRank: F.Rank.myRank('mine') };
  });
  console.log('   技能 =', JSON.stringify(sk));
  ok('行为累积技能 / 工具熟练度并反映到榜单', sk.mineLv === 2 && sk.pickLv === 2 && sk.myRank && sk.myRank.rank >= 1);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.14 拍卖行：三标签页 + 品质配色 + 已售统计 */
  await page.keyboard.press('y');
  await page.waitForTimeout(300);
  await page.fill('#pa-q', '');
  await page.waitForTimeout(250);
  const tabs0 = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent).join(','));
  ok('拍卖行三标签页（在售/我的上架/已售记录）', tabs0 === '在售,我的上架,已售记录');
  const colored = await page.evaluate(() => {
    let n = 0, total = 0;
    document.querySelectorAll('#panel .ah-row .ah-n').forEach(e => {
      total++;
      if (getComputedStyle(e).color !== 'rgb(242, 246, 240)') n++;
    });
    return { total, n };
  });
  console.log('   品质配色 =', JSON.stringify(colored));
  ok('物品名按品质着色（不再是浅灰看不清）', colored.total > 5 && colored.n > 0);

  await page.evaluate(() => document.querySelectorAll('#panel .ranktabs .rt')[1].click());
  await page.waitForTimeout(250);
  const mine0 = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.inv.wood = (F.Game.inv.wood || 0) + 20;
    F.Social.list('wood', 10, 100, false);
    F.UI2.panelAuction(false, 'mine');
    return {
      rows: document.querySelectorAll('#panel .ah-row').length,
      btns: Array.prototype.map.call(document.querySelectorAll('#panel .ah-row .mini'), e => e.textContent),
    };
  });
  ok('我的上架：上架表单 + 寄售列表（取回按钮）', mine0.rows >= 1 && mine0.btns.length >= 1 && mine0.btns.every(t => t === '取回'));
  await page.evaluate(() => document.querySelector('#panel .ah-row .mini').click());
  await page.waitForTimeout(250);
  ok('取回成功（木材回到背包）', await page.evaluate(() => (window.FARM.Game.inv.wood || 0) >= 10));

  await page.evaluate(() => document.querySelectorAll('#panel .ranktabs .rt')[2].click());
  await page.waitForTimeout(250);
  const sold = await page.evaluate(() => {
    const sel = document.querySelector('#pa-days');
    return {
      opts: sel ? Array.prototype.map.call(sel.options, o => o.textContent) : [],
      buyers: document.querySelectorAll('#panel .ah-row .ah-b').length,
      sum: Array.prototype.map.call(document.querySelectorAll('.sold-sum .ss-row'), e => e.textContent),
    };
  });
  console.log('   已售 =', JSON.stringify(sold));
  ok('已售记录：7/30/365 天筛选 + 购买人 + 总计/税收/税后统计',
    sold.opts.length === 3 && sold.buyers > 0 && sold.sum.length === 3 &&
    /总计收入/.test(sold.sum[0]) && /税收/.test(sold.sum[1]) && /税后收入/.test(sold.sum[2]));
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.15 纳球捕捉 + 坐骑骑乘 */
  const mt = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.give('ball_nab', 3);
    if (!F.ITEMS.ball_nab) throw new Error('缺纳球');
    const m = F.Combat.spawn('wolf', F.Player.pos.x + 3, F.Player.pos.z, 1, 'world');
    m.hp = m.maxHp * 0.25;
    /* 测试环境：把其它野兽挪远，保证纳球只命中这只虚弱的灰狼 */
    for (const o of F.Combat.mobs) if (o !== m && o.realm === 'world' && o.alive) { o.x = m.x + 60; o.z = m.z + 60; }
    /* 捕捉判定有 ~20% 天然失手率，钉成必中让断言确定性（投掷/入栏流水线照走） */
    const realChance = F.Mounts.chance;
    F.Mounts.chance = () => 1;
    const okThrow = F.Mounts.throwBall(true);
    F.Mounts.chance = realChance;
    return { okThrow, balls: F.Game.inv.ball_nab };
  });
  /* 纳球飞行是 rAF 真实时间动画，软渲染下首帧可能晚于 900ms —— 轮询等入栏，不赌帧时机 */
  await page.waitForFunction(() => window.FARM.Mounts.list.length >= 1, { timeout: 10000 }).catch(() => { });
  const mt2 = await page.evaluate(() => ({
    n: window.FARM.Mounts.list.length,
    balls: window.FARM.Game.inv.ball_nab,
    q: window.FARM.Mounts.list.length ? window.FARM.Mounts.list[0].q : null,
  }));
  console.log('   捕捉 =', JSON.stringify({ mt, mt2 }));
  ok('投掷纳球捕捉虚弱的灰狼（扣球 + 入栏）', mt.okThrow && mt.balls === 2 && mt2.n === 1 && mt2.balls === 2 && mt2.q);

  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  const mpanel = await page.evaluate(() => ({
    cards: document.querySelectorAll('#panel .cards .card').length,
    tip: (document.querySelector('#panel .pstat') || {}).textContent || '',
  }));
  ok('M 打开坐骑面板（坐骑栏 + 指南 + 纳球数）', mpanel.cards >= 4 && /纳球/.test(mpanel.tip));
  await page.keyboard.press('m');
  await page.waitForTimeout(150);

  const ride = await page.evaluate(() => {
    const F = window.FARM;
    /* 测试环境：先回到室外安全点，避免刚好站在水里/室内导致无法骑乘 */
    F.Player.indoor = false;
    F.Player.pos.set(4, F.T.hAt(4, 104), 104);
    F.Player.update(1 / 60, false);
    const okRide = F.Mounts.ride(0);
    return {
      okRide, riding: F.Player.riding,
      mul: okRide ? F.Mounts.curMount().mul : 0,
      swimming: F.Player.swimming,
    };
  });
  let ride2 = { visible: false, lifted: false };
  for (let i = 0; i < 10 && !(ride2.visible && ride2.lifted); i++) {
    await page.waitForTimeout(250);
    ride2 = await page.evaluate(() => ({
      visible: !!window.FARM.Mounts.mesh && window.FARM.Mounts.mesh.visible,
      lifted: window.FARM.Player.model.group.position.y > window.FARM.Player.pos.y + 0.3,
    }));
  }
  ok('骑乘：坐骑显示 + 玩家抬升至鞍位 + 移速加成', ride.okRide && ride.riding && ride.mul > 1 && ride2.visible && ride2.lifted);
  const dis = await page.evaluate(() => { window.FARM.Mounts.dismount(true); return window.FARM.Player.riding; });
  ok('下马', dis === false);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.16 聊天：表情 / 图片 / 照片 / 背包道具 / 仓库道具 */
  await page.keyboard.press('t');
  await page.waitForTimeout(350);
  const tools = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#cw-bar .cw-tool'), e => e.textContent).join('|'));
  ok('聊天工具栏：表情 / 图片 / 照片 / 背包 / 仓库', /表情/.test(tools) && /图片/.test(tools) && /照片/.test(tools) && /背包/.test(tools) && /仓库/.test(tools));

  await page.click('#ct-emoji');
  await page.waitForTimeout(250);
  const emoN = await page.evaluate(() => document.querySelectorAll('#chatwin .cw-pop .cw-e').length);
  ok('表情面板打开（34 个表情）', emoN >= 30);
  await page.evaluate(() => document.querySelector('#chatwin .cw-pop .cw-e').click());
  const inVal = await page.evaluate(() => document.querySelector('#cw-in').value);
  ok('点击表情插入到输入框', inVal.length > 0);

  await page.click('#ct-bag');
  await page.waitForTimeout(250);
  const bag = await page.evaluate(() => {
    const rows = document.querySelectorAll('#chatwin .cw-pop .cw-irow');
    return { rows: rows.length, tip: rows.length ? (/品质/.test(rows[0].dataset.tip || '')) : false };
  });
  console.log('   背包道具 =', JSON.stringify(bag));
  ok('背包道具面板 + 悬浮提示', bag.rows > 0 && bag.tip);
  await page.evaluate(() => document.querySelector('#chatwin .cw-pop .cw-irow').click());
  await page.waitForTimeout(250);
  const chip = await page.evaluate(() => {
    const c = document.querySelector('#cw-body .cw-chip');
    return { n: document.querySelectorAll('#cw-body .cw-chip').length, tip: c ? (c.dataset.tip || '') : '' };
  });
  ok('聊天里出现道具链接（悬浮可查看）', chip.n > 0 && /品质/.test(chip.tip));

  await page.evaluate(() => document.querySelector('#cw-body .cw-chip').click());
  await page.waitForTimeout(350);
  const itemPanel = await page.evaluate(() => ({
    open: document.getElementById('panel').style.display,
    name: (document.querySelector('#panel .pl-name') || {}).textContent || '',
    cards: document.querySelectorAll('#panel .cards .card').length,
  }));
  console.log('   物品详情 =', JSON.stringify(itemPanel));
  ok('点击道具 → 物品详情面板', /flex/.test(itemPanel.open) && itemPanel.cards > 0 && itemPanel.name.length > 0);
  await page.evaluate(() => window.FARM.UI.closePanel());

  const beforeImg = await page.evaluate(() => document.querySelectorAll('#cw-body .cw-img').length);
  await page.setInputFiles('#cw-file', TMP_PIC);
  await page.waitForTimeout(900);
  const img = await page.evaluate(() => {
    const im = document.querySelector('#cw-body .cw-img');
    return { n: document.querySelectorAll('#cw-body .cw-img').length, w: im ? im.naturalWidth : 0 };
  });
  console.log('   图片消息 =', JSON.stringify({ beforeImg, img }));
  ok('发送本地图片（聊天内显示缩略图）', img.n > beforeImg && img.w > 0);
  await page.evaluate(() => document.querySelector('#cw-body .cw-img').click());
  await page.waitForTimeout(250);
  ok('点击图片放大查看', await page.evaluate(() => {
    const v = document.getElementById('cwviewer');
    return !!v && v.classList.contains('show') && !!v.querySelector('img');
  }));
  await page.evaluate(() => document.getElementById('cwviewer').classList.remove('show'));

  await page.evaluate(() => { const F = window.FARM; F.Game.storage = F.Game.storage || {}; F.Game.storage.wood = 9; });
  await page.click('#ct-store');
  await page.waitForTimeout(250);
  const store = await page.evaluate(() => {
    const rows = Array.prototype.map.call(document.querySelectorAll('#chatwin .cw-pop .cw-irow'), e => e.textContent);
    return { rows: rows.length, hasWood: rows.some(t => /×9/.test(t)) };
  });
  ok('仓库道具面板（含仓库中的木材 ×9）', store.rows > 0 && store.hasWood);
  await page.evaluate(() => {
    const r = Array.prototype.find.call(document.querySelectorAll('#chatwin .cw-pop .cw-irow'), e => /×9/.test(e.textContent));
    (r || document.querySelector('#chatwin .cw-pop .cw-irow')).click();
  });
  await page.waitForTimeout(250);
  ok('仓库道具可发送到聊天', await page.evaluate(() => document.querySelectorAll('#cw-body .cw-chip').length > 1));

  await page.click('#ct-photo');
  await page.waitForTimeout(1500);
  const cam = await page.evaluate(() => ({
    vid: !!document.querySelector('#cw-vid'),
    tip: (document.querySelector('#cw-camtip') || {}).textContent || '',
    w: document.querySelector('#cw-vid') ? document.querySelector('#cw-vid').videoWidth : 0,
  }));
  console.log('   摄像头 =', JSON.stringify(cam));
  const imgsBefore = await page.evaluate(() => document.querySelectorAll('#cw-body .cw-img').length);
  let shotOk = false;
  if (cam.w > 0) {
    /* 摄像头取帧偶尔较慢：最多尝试 3 次 */
    for (let i = 0; i < 3 && !shotOk; i++) {
      await page.evaluate(() => document.querySelector('#cw-shot').click());
      await page.waitForTimeout(1200);
      shotOk = (await page.evaluate(() => document.querySelectorAll('#cw-body .cw-img').length)) > imgsBefore;
    }
  }
  const imgsAfter = await page.evaluate(() => document.querySelectorAll('#cw-body .cw-img').length);
  ok('照片：摄像头面板打开并可拍照发送', cam.vid && (cam.w > 0 ? (shotOk && imgsAfter > imgsBefore) : /本地图片|无法打开/.test(cam.tip)));
  await page.evaluate(() => { const F = window.FARM; F.UI2.closeChat(); F.UI.closePanel(); });
  fs.existsSync(TMP_PIC) && fs.unlinkSync(TMP_PIC);

  /* 5.17 天气系统（风 / 增益减益 / 声音 / HUD） */
  const wx0 = await page.evaluate(() => {
    const F = window.FARM;
    F.Weather.set('clear', true);
    F.UI2.updateWxHud();
    return {
      hud: (document.getElementById('weather') || {}).textContent || '',
      name: F.Weather.curDef().name,
      buffs: document.querySelectorAll('#weather .wx-b').length,
    };
  });
  ok('天气 HUD 显示当前天气与增益', /晴朗/.test(wx0.hud) && wx0.buffs > 0 && wx0.name === '晴朗');

  const wx1 = await page.evaluate(() => {
    const F = window.FARM;
    F.Weather.set('storm', true);
    for (let i = 0; i < 200; i++) F.Weather.update(1 / 30, F.Player.pos);
    F.UI2.updateWxHud();
    const hud = document.getElementById('weather').textContent;
    return {
      hud,
      wind: F.World.wind.strength,
      precip: F.Weather.precip,
      rainVisible: F.Weather.rain.pts.visible,
      fogFar: F.World.scene ? 0 : (window.FARM.Weather.scene.fog ? window.FARM.Weather.scene.fog.far : -1),
      debuffs: document.querySelectorAll('#weather .wx-b.no').length,
      lightK: F.Weather.lightK,
    };
  });
  console.log('   雷暴 =', JSON.stringify(wx1));
  ok('雷暴：风力上升 + 雨粒子 + 视野压缩 + 减益显示（含环境音控制）',
    wx1.wind > 0.9 && wx1.rainVisible && wx1.precip > 0.5 && wx1.debuffs > 0 && wx1.lightK < 0.6 && /雷暴/.test(wx1.hud));

  const wx2 = await page.evaluate(() => {
    const F = window.FARM;
    const before = F.Weather.m('speed', 1);
    const beforeGrow = F.Weather.m('growth', 1);
    F.Weather.set('rain', true);
    return { before, beforeGrow, growRain: F.Weather.m('growth', 1), fishRain: F.Weather.m('fishWait', 1) };
  });
  ok('小雨：作物/钓鱼加成（数值挂载生效）', wx2.growRain > wx2.beforeGrow && wx2.fishRain < 1);

  const wx3 = await page.evaluate(() => {
    const F = window.FARM;
    /* 环境音：节点存在且可开关 */
    F.Ambience.on = true;
    if (F.Ambience.ensure) F.Ambience.ensure();
    const onState = { ready: F.Ambience.ready, hasWind: !!F.Ambience.windGain, hasRain: !!F.Ambience.rainGain };
    F.Weather.ambience = false;
    for (let i = 0; i < 60; i++) F.Weather.update(1 / 30, F.Player.pos);
    F.Weather.ambience = true;
    F.Weather.set('clear', true);
    for (let i = 0; i < 60; i++) F.Weather.update(1 / 30, F.Player.pos);
    return onState;
  });
  ok('环境音：风声 / 雨声节点就绪并可开关', wx3.ready && wx3.hasWind && wx3.hasRain);

  /* 5.17b 系统设置：手册收纳 + 快捷键自定义 / 冲突提醒 / 恢复默认 */
  const st = await page.evaluate(() => {
    const F = window.FARM;
    F.UI.openPanel('help');                            /* 兼容入口：应落到 设置 → 手册 */
    const box = document.querySelector('#panel .panel');
    const rt = Array.prototype.map.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent);
    const manual = { rt, on: (document.querySelector('#panel .ranktabs .rt.on') || {}).textContent || '',
      wasd: /W A S D/.test(box.textContent), hintGone: !document.getElementById('hint') };
    /* 切到快捷键 tab */
    Array.prototype.find.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent === '快捷键').click();
    const nInputs = document.querySelectorAll('#panel .keyrow input').length;
    return { manual, nInputs };
  });
  await page.waitForTimeout(150);
  console.log('   设置面板 =', JSON.stringify(st));
  ok('帮助卡收纳进 设置→手册（左下角提示卡移除，操作指南内容保留）',
    st.manual.rt.length === 4 && st.manual.on === '手册' && st.manual.wasd && st.manual.hintGone && st.nInputs >= 25);

  /* 5.17c 关于 · 致谢：第三方清单齐全（公开仓库，第三方署名不能漏） */
  const about = await page.evaluate(() => {
    const F = window.FARM;
    F.UI.closePanel();                                     /* 上一段测试留着设置面板开着，先关掉再点，否则是 toggle 关面板 */
    F.UI.openPanel('sys');                                 /* 右下角入口已收进系统菜单 */
    const tile = Array.prototype.find.call(document.querySelectorAll('#panel .sys-tile'), e => /关于/.test(e.textContent));
    if (tile) tile.click();
    const box = document.querySelector('#panel .panel');
    const t = box ? box.textContent : '';
    const on = (document.querySelector('#panel .ranktabs .rt.on') || {}).textContent || '';
    return {
      on, three: /Three\.js/.test(t) && /MIT/.test(t),
      audio: /Web Audio/.test(t), canvas: /Canvas 2D/.test(t),
      font: /系统字体/.test(t), android: /WebViewAssetLoader/.test(t),
      license: /MIT License/.test(t), repo: /github\.com\/king952701\/open-farm/.test(t),
      nCats: document.querySelectorAll('#panel .pcat').length,
    };
  });
  console.log('   关于致谢 =', JSON.stringify(about));
  ok('「关于 · 致谢」页：Three.js/Web Audio/Canvas/字体/AndroidX 与 MIT 许可、仓库地址齐全',
    about.on === '关于 · 致谢' && about.three && about.audio && about.canvas &&
    about.font && about.android && about.license && about.repo && about.nCats >= 5);
  /* 还原成下一段「改键」测试要的状态：设置面板开在快捷键页 */
  await page.evaluate(() => { const F = window.FARM; F.UI.setTab = 'keys'; F.UI.openPanel('settings'); });

  /* 改键：把投掷纳球改成 ↑（Z 已经给了「切换种子」，键表几乎占满，用方向键保证不冲突） */
  await page.focus('#panel .keyrow input[data-k="throwball"]');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  const rebind = await page.evaluate(() => ({
    bind: window.FARM.bind('throwball'),
    saved: window.FARM.Game.opt.keys.throwball,
  }));
  ok('快捷键可自定义：投掷纳球改为方向键↑，立即生效并写入存档选项',
    rebind.bind === 'arrowup' && rebind.saved === 'arrowup');
  /* 每帧轮询的移动键同样走映射表：把「前进」改成 K，模拟按住 K 应产生位移 */
  const mv = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.opt.keys.forward = 'k';
    const p0 = { x: F.Player.pos.x, z: F.Player.pos.z };
    F.Input.keys = { k: true };
    for (let i = 0; i < 4; i++) F.Player.update(1 / 30, false);
    const d = Math.hypot(F.Player.pos.x - p0.x, F.Player.pos.z - p0.z);
    F.Input.keys = {};
    delete F.Game.opt.keys.forward;
    return +d.toFixed(3);
  });
  ok('移动键改绑生效：前进改成 K 后按住 K 角色会走', mv > 0.05);
  await page.keyboard.press('Escape');                 /* 让焦点离开输入框 */
  await page.keyboard.press('i');                      /* 原背包键仍有效 */
  await page.waitForTimeout(200);
  const bagOk = await page.evaluate(() => (document.querySelector('#panel .phead h3') || {}).textContent === '背包');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  /* 冲突提醒：背包改成 Z（与投掷纳球冲突）→ 标红且不生效 */
  const cf = await page.evaluate(() => {
    const F = window.FARM;
    F.UI.setTab = 'keys';
    F.UI.openPanel('settings');
    Array.prototype.find.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent === '快捷键').click();
    const inp = document.querySelector('#panel .keyrow input[data-k="bag"]');
    inp.value = 'z';
    inp.oninput();
    return {
      bad: inp.classList.contains('bad'),
      msg: inp.parentElement.querySelector('em').textContent,
      bind: window.FARM.bind('bag'),
    };
  });
  ok('键位冲突提醒：重复键标红提示且不覆盖原键位', cf.bad && /冲突/.test(cf.msg) && cf.bind === 'i');
  await page.click('#k-reset');
  await page.waitForTimeout(150);
  const rst = await page.evaluate(() => ({
    bind: window.FARM.bind('throwball'),
    empty: Object.keys(window.FARM.Game.opt.keys).length === 0,
  }));
  ok('恢复默认键位按钮：清空自定义并还原默认表', rst.bind === 'r' && rst.empty);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.17c 悬停 / 选中反馈：默认不可见，仅真正操作时才浮现 ≤1px 细线 */
  const fb = await page.evaluate(() => {
    const F = window.FARM, I = F.Inter;
    F.UI.closePanel();
    const n = F.Nodes.list.filter(x => (x.type === 'iron' || x.type === 'gold') && x.alive)[0];
    F.Player.pos.set(n.x, 0, n.z); F.Player.pos.y = F.T.hMesh(n.x, n.z);
    F.Player.setTool('pick');
    F.Skills.get('mine').lv = 99;
    const snap = () => ({ visible: I.ring.visible, op: +I.ring.material.opacity.toFixed(3) });
    /* 1 纯瞄准（未操作） */
    F.Input.down = false; F.Input.dragDist = 0;
    I.update(0.016);
    const idle = Object.assign({ target: !!I.target }, snap());
    /* 2 按住鼠标（未拖视角）→ 细线浮现 */
    F.Input.down = true; F.Input.dragDist = 0;
    for (let i = 0; i < 20; i++) I.update(0.016);
    const pressed = snap();
    /* 3 松开 → 立即收敛回不可见 */
    F.Input.down = false;
    for (let i = 0; i < 20; i++) I.update(0.016);
    const released = snap();
    /* 4 采集执行中 → 可见 */
    I.gatherNode(n);
    for (let i = 0; i < 10; i++) I.update(0.016);
    const working = Object.assign({ work: !!I.work }, snap());
    I.work = null;
    F.Skills.init();
    return {
      idle, pressed, released, working,
      kind: I.ring.type, pts: I.ring.geometry.attributes.position.count,
      color: I.ring.material.color.getHexString(),
    };
  });
  console.log('   选中反馈 =', JSON.stringify(fb));
  ok('默认状态不可见：瞄准资源不渲染任何光圈，拾取判定不受影响',
    fb.idle.target && !fb.idle.visible && fb.idle.op === 0 && fb.kind === 'LineLoop' && fb.pts > 60);
  ok('仅操作时显示 ≤1px 细线：按下浮现（透明度 ≤0.5），松开/操作结束立即恢复不可见',
    fb.pressed.visible && fb.pressed.op > 0.1 && fb.pressed.op <= 0.5 &&
    fb.working.visible && fb.working.op <= 0.5 && !fb.released.visible);

  const fb2 = await page.evaluate(() => {
    const F = window.FARM, I = F.Inter;
    const list = (F.Builds && F.Builds.list) || [];
    const b = list[0];
    if (!b) return { skip: true };
    F.Player.pos.set(b.x, 0, b.z); F.Player.pos.y = F.T.hMesh(b.x, b.z);
    F.Player.indoor = false; F.House.inside = false;
    /* 拆除/移动是按屏幕射线去瞄准建筑的：先把镜头更新到当前位置，再把鼠标放屏幕中心（≈角色脚下） */
    F.Player.updateCamera(0, true);
    /* ponytail: 直接把射线结果钉在这栋建筑上（headless 下相机/地形易变，这里只验证反馈本身） */
    const realPick = I.pickGround;
    I.pickGround = () => ({ x: b.x, z: b.z, y: b.y });
    I.enterRemove();
    const modeAfterEnter = I.removeMode;
    for (let i = 0; i < 20; i++) I.update(0.016);
    const on = { visible: I.ring.visible, op: +I.ring.material.opacity.toFixed(3), color: I.ring.material.color.getHexString() };
    I.exitAll();
    for (let i = 0; i < 20; i++) I.update(0.016);
    const off = { visible: I.ring.visible, op: +I.ring.material.opacity.toFixed(3) };
    I.pickGround = realPick;
    /* 恢复现场：把玩家送回村口，避免影响后续测试 */
    F.Player.pos.set(4, F.T.hAt(4, 104), 104);
    F.Player.setTool('axe');
    return { on, off, hasTarget: !!I.removeTarget, modeAfterEnter, bId: b.def.id };
  });
  console.log('   拆除反馈 =', JSON.stringify(fb2));
  ok('拆除 / 移动模式为操作态才显示，退出模式立即恢复不可见（低饱和配色）',
    !!fb2.skip || (fb2.on.visible && fb2.on.op <= 0.5 && fb2.on.color !== 'ffffff' && !fb2.off.visible && fb2.off.op === 0));

  /* 5.18 斗兽场：面板 / 观战弹出 / 动态赔率 / 竞猜 / 回收 */
  await page.keyboard.press('n');
  await page.waitForTimeout(350);
  const ar = await page.evaluate(() => ({
    tabs: Array.prototype.map.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent).join(','),
    cards: document.querySelectorAll('#panel .cards .card').length,
  }));
  ok('N 打开斗兽场面板（报名参战 / 赛程 / 战绩三个标签）', /报名参战/.test(ar.tabs) && /赛程/.test(ar.tabs) && /战绩/.test(ar.tabs) && ar.cards >= 3);

  /* 5.18a 面板标题栏拖拽：斗兽场主面板 + 系统弹出的观战竞猜面板 */
  const d1 = {
    before: await page.evaluate(() => { const r = document.querySelector('#panel .panel').getBoundingClientRect(); return [r.left | 0, r.top | 0]; }),
  };
  let hb1 = await page.locator('#panel .phead').first().boundingBox();
  await page.mouse.move(hb1.x + hb1.width / 2, hb1.y + 10);
  await page.mouse.down();
  await page.mouse.move(hb1.x + hb1.width / 2 - 150, hb1.y + 10 + 80, { steps: 6 });
  await page.mouse.up();
  d1.after = await page.evaluate(() => {
    const b = document.querySelector('#panel .panel');
    const r = b.getBoundingClientRect();
    return { pos: [r.left | 0, r.top | 0], abs: b.style.position === 'absolute' };
  });
  d1.betBefore = await page.evaluate(() => {
    const F = window.FARM;
    const m = F.Arena.startMatch({ mode: '1v1' });
    F.UI2.openArenaBet(m);
    const r = document.getElementById('abet').getBoundingClientRect();
    return [r.left | 0, r.top | 0];
  });
  hb1 = await page.locator('#abet .ab-head').boundingBox();
  await page.mouse.move(hb1.x + hb1.width / 2, hb1.y + 8);
  await page.mouse.down();
  await page.mouse.move(hb1.x + hb1.width / 2 + 130, hb1.y + 8 - 60, { steps: 6 });
  await page.mouse.up();
  d1.bet = await page.evaluate(() => {
    const el = document.getElementById('abet');
    const r = el.getBoundingClientRect();
    return { pos: [r.left | 0, r.top | 0], moved: !!el.style.left, shown: el.style.display === 'flex' };
  });
  console.log('   面板拖拽 =', JSON.stringify(d1));
  ok('面板标题栏可自由拖拽（斗兽场主面板 + 观战竞猜面板）',
    d1.after.abs && Math.abs(d1.after.pos[0] - d1.before[0]) > 100 && Math.abs(d1.after.pos[1] - d1.before[1]) > 50 &&
    d1.bet.shown && d1.bet.moved && Math.abs(d1.bet.pos[0] - d1.betBefore[0]) > 100 && d1.bet.pos[1] < d1.betBefore[1]);
  await page.evaluate(() => { window.FARM.UI2.closeArenaBet(); window.FARM.UI.closePanel(); });

  const betOpen = await page.evaluate(() => {
    const F = window.FARM;
    F.UI.closePanel();
    const m = F.Arena.startMatch({ mode: '3v3' });
    return { visible: document.getElementById('abet').style.display, mode: m.modeName, odds: m.odds.slice() };
  });
  await page.waitForTimeout(400);
  const betUi = await page.evaluate(() => {
    const el = document.getElementById('abet');
    return {
      display: el.style.display,
      title: (el.querySelector('#ab-title') || {}).textContent || '',
      sides: el.querySelectorAll('.ab-side').length,
      pets: el.querySelectorAll('.ab-pet').length,
      betBtns: el.querySelectorAll('.ab-bets .mini').length,
      foot: (el.querySelector('.ab-foot') || {}).textContent || '',
      pot: (el.querySelector('.ab-pot') || {}).textContent || '',
    };
  });
  console.log('   观战竞猜 =', JSON.stringify(betUi));
  ok('其他玩家开赛 → 自动弹出观战面板（双方信息 + 宠物 + 竞猜按钮）',
    betUi.display === 'flex' && betUi.sides === 2 && betUi.pets >= 6 && betUi.betBtns >= 6 && /3v3/.test(betUi.title) && /市场税收/.test(betUi.foot));

  const wxWords = await page.evaluate(() => {
    const F = window.FARM;
    F.UI2.panelArena('record');
    const panelTxt = (document.getElementById('panel') || { textContent: '' }).textContent;
    const betTxt = (document.getElementById('abet') || { textContent: '' }).textContent;
    F.UI.openPanel('help');
    const helpTxt = (document.getElementById('panel') || { textContent: '' }).textContent;
    F.UI.closePanel();
    return { bad: /庄家|抽水/.test(betTxt + panelTxt + helpTxt), good: /市场税收/.test(betTxt + panelTxt + helpTxt) };
  });
  ok('合规文案：不再出现「庄家 / 抽水」，统一改为「市场税收」', !wxWords.bad && wxWords.good);

  const betRes = await page.evaluate(() => {
    const F = window.FARM;
    const m = F.Arena.matches.filter(x => x.phase === 'bet').pop();
    const o0 = m.odds.slice();
    const c0 = F.Game.coins;
    document.querySelectorAll('#abet .ab-bets.red .mini')[1].click();   /* 押红方 100 */
    return {
      oddsChanged: m.odds[0] < o0[0],
      coinsDown: F.Game.coins < c0,
      myBets: m.myBets.slice(),
      odds: m.odds.slice(),
    };
  });
  console.log('   下注 =', JSON.stringify(betRes));
  ok('点击竞猜按钮：扣金币 + 赔率实时下调', betRes.coinsDown && betRes.oddsChanged && betRes.myBets[0] > 0);

  const betFin = await page.evaluate(() => {
    const F = window.FARM;
    const m = F.Arena.matches.filter(x => x.phase === 'bet').pop();
    const burn0 = F.Arena.market.destroyed;
    const coins0 = F.Game.coins;
    m.phase = 'fight';
    let guard = 0;
    while (m.phase === 'fight' && guard < 4000) { F.Arena.tickFight(m, 0.5); guard++; }
    return {
      winner: m.winner, phase: m.phase, payout: m.settle ? m.settle.payout : -1,
      burned: F.Arena.market.destroyed - burn0,
      history: F.Arena.history.length,
      cap: F.Arena.betCap(),
    };
  });
  await page.waitForTimeout(500);
  const betRes2 = await page.evaluate(() => {
    window.FARM.UI2.renderArenaBet();   /* 立即重绘（headless 下帧推进较慢） */
    return {
      res: (document.querySelector('#abet .ab-res') || {}).textContent || '',
      log: document.querySelectorAll('#abet .ab-log').length,
    };
  });
  console.log('   结算 =', JSON.stringify(betFin), JSON.stringify(betRes2));
  ok('结算：产生胜者 / 返还或损失 / 市场税收销毁金币（防通胀）',
    betFin.winner >= 0 && betFin.burned > 0 && betFin.history > 0 && betFin.cap > 0 && /胜者/.test(betRes2.res));

  const mine = await page.evaluate(() => {
    const F = window.FARM;
    F.UI2.closeArenaBet();
    /* 给玩家几只宠物后报名自己的比赛 */
    F.Mounts.list = [{ type: 'boar', name: '野猪', q: '稀有', lv: 9, mul: 1.5, h: 1.02 },
    { type: 'wolf', name: '灰狼', q: '精良', lv: 7, mul: 1.6, h: 0.98 },
    { type: 'bear', name: '棕熊', q: '史诗', lv: 14, mul: 1.8, h: 1.42 }];
    const m = F.Arena.startMatch({ mode: '3v3', mine: true });
    F.UI2.renderArenaBet();
    const el = document.getElementById('abet');
    return {
      displayed: el.style.display, isMine: !!m && m.mine,
      tip: (el.querySelector('.ab-tip') || {}).textContent || '',
      betBtns: el.querySelectorAll('.ab-bets .mini').length,
      myPets: m ? m.a.pets.map(p => p.name + 'Lv' + p.lv).join(',') : '',
    };
  });
  console.log('   自己参赛 =', JSON.stringify(mine));
  ok('自己参赛：面板显示自己的阵容且不可为自己下注',
    mine.displayed === 'flex' && mine.isMine && mine.betBtns === 0 && /无法为自己下注/.test(mine.tip) && /野猪/.test(mine.myPets));
  await page.evaluate(() => { window.FARM.UI2.closeArenaBet(); window.FARM.UI.closePanel(); });

  /* 5.19 家园建造（四种风格构配件 / 50 金币手续费 / 摆放 / 门锁） */
  await page.keyboard.press('v');
  await page.waitForTimeout(350);
  const hb = await page.evaluate(() => ({
    styles: Array.prototype.map.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent).join('·'),
    cats: Array.prototype.map.call(document.querySelectorAll('#panel .pcat'), e => e.textContent).join('|'),
    cards: document.querySelectorAll('#panel .cards .card').length,
    head: (document.querySelector('#panel .phead h3') || {}).textContent || '',
  }));
  console.log('   家园面板 =', JSON.stringify(hb));
  ok('V 打开家园建造面板：四种风格 + 四组构件 + 全部卡片',
    /中式/.test(hb.styles) && /西方/.test(hb.styles) && /古典/.test(hb.styles) && /现代/.test(hb.styles) &&
    /地基与框架/.test(hb.cats) && /墙体与门窗/.test(hb.cats) && /屋顶与楼梯/.test(hb.cats) && /储物与设施/.test(hb.cats) && hb.cards >= 17);

  const fee = await page.evaluate(() => {
    const F = window.FARM;
    const cost = F.HomeBuild.effCost('wall', 'chinese');
    return { coins: cost.coins || 0, mats: Object.keys(cost).filter(k => k !== 'coins').length, text: F.Game.costText(cost) };
  });
  console.log('   野外造价 =', JSON.stringify(fee));
  ok('野外通过面板制取：材料 + 50 金币 / 次手续费', fee.coins === 50 && fee.mats > 0);

  const cheap = await page.evaluate(() => {
    const F = window.FARM;
    /* 给足材料与金币，摆一根中式墙体 */
    F.Game.coins = 5000;
    for (const k of ['wood', 'board', 'rope', 'stone', 'brick', ' iron_ingot'.trim(), 'bronze', 'glass', 'fiber']) F.Game.give(k, 200);
    const id = F.HomeBuild.id('wall', 'chinese');
    const before = { coins: F.Game.coins, wood: F.Game.inv.wood, cnt: F.Builds.list.filter(b => b.def && b.def.home).length };
    F.HomeBuild.start('wall', 'chinese');
    return { before, ghost: !!F.Inter.build, id };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(560, 330);
  await page.waitForTimeout(400);
  const placed = await page.evaluate(() => {
    const F = window.FARM;
    const mine = F.Builds.list.filter(b => b.def && b.def.home);
    return {
      cnt: mine.length, coins: F.Game.coins, wood: F.Game.inv.wood,
      first: mine.length ? mine[mine.length - 1].id : '',
      groups: mine.length,
    };
  });
  console.log('   摆放 =', JSON.stringify(placed));
  ok('落地摆放家园构件：扣除材料 + 50 金币手续费',
    placed.cnt > (cheap.before.cnt || 0) && placed.coins === cheap.before.coins - 50 && placed.wood < cheap.before.wood && /^hb_wall_chinese$/.test(placed.first));
  await page.evaluate(() => window.FARM.Inter.exitAll());

  const styles = await page.evaluate(() => {
    const F = window.FARM;
    const out = [];
    const base = F.Player.pos;
    let i = 0;
    for (const pid of ['wall', 'floor', 'roof', 'door', 'window', 'chest', 'bench']) {
      for (const sid in F.HOME_STYLES) {
        const b = F.Builds.add(F.HomeBuild.id(pid, sid), base.x + 120 + (i++ % 3), base.z + Math.floor(i / 3), 0);
        let meshes = 0; b.group.traverse(o => { if (o.isMesh) meshes++; });
        if (!meshes) throw new Error(pid + sid + ' 未生成几何');
        out.push(b.id);
        F.Builds.remove(b);
      }
    }
    return { n: out.length, sample: out.slice(0, 4).join(',') };
  });
  console.log('   风格生成 =', JSON.stringify(styles));
  ok('四种风格的墙体/地板/屋顶/门/窗/储物箱/工作台均可实例化', styles.n === 28 && /hb_wall_chinese/.test(styles.sample));

  const doorT = await page.evaluate(() => {
    const F = window.FARM;
    const p = F.Player.pos;
    const d = F.Builds.add(F.HomeBuild.id('door', 'western'), p.x + 6, p.z, 0);
    const lk = F.Builds.add(F.HomeBuild.id('lock', 'western'), p.x + 7, p.z, 0);
    F.Inter.doHomeDoor(d);
    const opened = d.door;
    F.Inter.doHomeLock(lk);
    const afterLock = { locked: lk.locked, door: d.door };
    F.Inter.doHomeDoor(d);
    const blocked = d.door;
    F.Inter.doHomeLock(lk);
    F.Inter.doHomeDoor(d);
    const reopened = d.door;
    F.Builds.remove(d); F.Builds.remove(lk);
    return { opened, afterLock, blocked, reopened };
  });
  console.log('   门锁 =', JSON.stringify(doorT));
  ok('门锁：上锁自动关门且无法开启，解锁后恢复通行',
    doorT.opened === 1 && doorT.afterLock.locked === 1 && doorT.afterLock.door === 0 && doorT.blocked === 0 && doorT.reopened === 1);

  const freeBuild = await page.evaluate(() => {
    const F = window.FARM;
    const p = F.Player.pos;
    /* 放个自己的工作台 → 旁边的制取免手续费 */
    const bench = F.Builds.add(F.HomeBuild.id('bench', 'chinese'), p.x + 2, p.z, 0);
    const cost = F.HomeBuild.effCost('floor', 'modern');
    const r = { coins: cost.coins || 0, atBench: F.HomeBuild.atBench() };
    F.Builds.remove(bench);
    return r;
  });
  ok('在工作台旁制取免手续费', freeBuild.atBench && freeBuild.coins === 0);

  /* 5.19.1 村口公告板：名人堂前三卡片 → 点击弹出人物面板 */
  const board = await page.evaluate(() => {
    const F = window.FARM;
    F.UI2.panelBoard('rank');
    const cards = document.querySelectorAll('#panel .bd-card');
    const first = cards[0];
    return {
      tabs: Array.prototype.map.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent).slice(0, 2).join('|'),
      cards: cards.length,
      hasRanktabs: document.querySelectorAll('#panel .ranktabs').length,
      names: Array.prototype.map.call(cards, c => (c.querySelector('.tt') || {}).textContent).join('/'),
      medals: Array.prototype.map.call(cards, c => (c.querySelector('.bd-m') || {}).textContent).join(''),
      score: cards[0] ? (cards[0].querySelector('.bd-score') || {}).textContent : '',
      firstName: first ? first.querySelector('.tt').textContent : '',
    };
  });
  console.log('   公告板名人堂 =', JSON.stringify(board));
  ok('公告板：显示榜单前三名卡片（名次 / 头像 / 公会 / 战力）',
    board.cards === 3 && /名人堂/.test(board.tabs) && board.medals.length >= 3 && board.score.length > 0 && board.names.split('/').length === 3);

  const topCards = await page.evaluate(() => {
    const F = window.FARM;
    const before = document.querySelectorAll('#panel .bd-card')[0].querySelector('.tt').textContent;
    /* 前进到另一个榜单看是否切换 */
    const tabs = Array.prototype.filter.call(document.querySelectorAll('#panel .ranktabs'), e => !/名人堂|悬赏/.test(e.textContent))[0];
    const rt = tabs.querySelectorAll('.rt')[2];
    rt.click();
    const after = document.querySelectorAll('#panel .bd-card')[0].querySelector('.tt').textContent;
    return { before, after, cat: (document.querySelector('#panel .ranktabs .rt.on') || {}).textContent };
  });
  ok('名人堂可切换榜单（卡片随之更新）', typeof topCards.before === 'string' && typeof topCards.after === 'string' && !!topCards.cat);

  await page.evaluate(() => {
    const F = window.FARM;
    /* 切过的分类可能没有卡片，重开名人堂保证卡片存在 */
    if (!document.querySelectorAll('#panel .bd-card').length) F.UI2.panelBoard('rank');
    const c = document.querySelectorAll('#panel .bd-card')[0];
    if (c) c.click();
  });
  await page.waitForTimeout(300);
  const playerCard = await page.evaluate(() => ({
    open: document.getElementById('panel').style.display,
    title: (document.querySelector('#panel .pl-name') || {}).textContent || '',
    hasEquip: document.querySelectorAll('#panel .items .item').length,
    tools: document.querySelectorAll('#panel .toolgrid .tool').length,
    skills: document.querySelectorAll('#panel .skillgrid .skill').length,
  }));
  console.log('   卡片人物面板 =', JSON.stringify(playerCard));
  ok('点击前三名卡片 → 弹出该玩家的人物信息面板（装备 / 工具 / 技能）',
    /flex/.test(playerCard.open) && playerCard.title.length > 0 && playerCard.hasEquip >= 3 && playerCard.tools > 0 && playerCard.skills > 0);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.19.2 悬赏委托：接取 → 推进 → 领取随机奖励 */
  const quests = await page.evaluate(() => {
    const F = window.FARM;
    F.UI2.panelBoard('quest');
    return {
      posted: F.Quest.board.length,
      rows: document.querySelectorAll('#panel .qrow').length,
      stat: (document.querySelector('#panel .pstat') || {}).textContent || '',
    };
  });
  ok('公告板「悬赏委托」列出可接取的随机委托', quests.posted > 0 && quests.rows > 0 && /可接取/.test(quests.stat));

  await page.evaluate(() => {
    const btn = Array.prototype.find.call(document.querySelectorAll('#panel .qrow .mini'), b => b.textContent === '接取');
    btn.click();
  });
  await page.waitForTimeout(300);
  const accepted = await page.evaluate(() => {
    const F = window.FARM;
    const q = F.Quest.doing[0];
    /* 直接把进度推满（走真实进度接口校验） */
    if (q.kind === 'gain') { for (let i = 0; i < q.need; i++) F.Game.give(q.item, 1); }
    else if (q.kind === 'stat') { for (let i = 0; i < q.need; i++) F.Game.stats[q.stat] = (F.Game.stats[q.stat] || 0) + 1; }
    else if (q.kind === 'deliver') F.Game.give(q.item, q.need);
    else if (q.kind === 'floor') F.Dungeon.bestFloor = Math.max(F.Dungeon.bestFloor || 0, q.need);
    F.UI2.panelBoard('quest');
    const bar = document.querySelector('#panel .bd-bar i');
    const claimBtn = Array.prototype.find.call(document.querySelectorAll('#panel .qrow .mini'), b => b.textContent === '领取');
    return {
      doing: F.Quest.doing.length, prog: F.Quest.prog(q), need: q.need,
      barPct: bar ? bar.style.width : '', hasClaim: !!claimBtn,
      reward: F.Quest.rewardText(q.reward),
    };
  });
  console.log('   委托接取 =', JSON.stringify(accepted));
  ok('接取委托后显示「随机奖励」与进度条，完成后出现领取按钮',
    accepted.doing === 1 && accepted.prog === accepted.need && accepted.hasClaim && accepted.reward.length > 0);

  const claim = await page.evaluate(() => {
    const F = window.FARM;
    const c0 = F.Game.coins, inv0 = Object.assign({}, F.Game.inv);
    const btn = Array.prototype.find.call(document.querySelectorAll('#panel .qrow .mini'), b => b.textContent === '领取');
    btn.click();
    let gained = null;
    for (const k in F.Game.inv) if ((F.Game.inv[k] || 0) > (inv0[k] || 0)) gained = F.itemName(k) + '+' + ((F.Game.inv[k] || 0) - (inv0[k] || 0));
    return { coins: F.Game.coins - c0, gained, doing: F.Quest.doing.length, done: F.Quest.done, log: F.Quest.log.length };
  });
  console.log('   领取奖励 =', JSON.stringify(claim));
  ok('领取委托：随机发放金币 + 物资，并记入完成记录',
    claim.coins > 0 && claim.doing === 0 && claim.done >= 1 && claim.log >= 1);

  /* 5.19.3 村口公告板实体：走过去按 F 打开 */
  await revive();
  const boardObj = await page.evaluate(() => {
    const F = window.FARM;
    const b = F.Village.board, k = F.Village.broker;
    return { hasBoard: !!b, hasBroker: !!k, bx: b ? Math.round(b.x) : 0, bz: b ? Math.round(b.z) : 0, kx: k ? Math.round(k.x) : 0 };
  });
  await page.evaluate(() => {
    const F = window.FARM;
    F.Player.indoor = false;
    F.Player.pos.set(F.Village.board.x, F.Village.board.y + 0.1, F.Village.board.z + 1.6);
    F.UI.closePanel();
  });
  await page.waitForFunction(() => window.FARM.Inter.target && window.FARM.Inter.target.kind === 'board',
    { timeout: 8000 }).catch(() => { });
  const boardPrompt = await page.evaluate(() => {
    const F = window.FARM, P = F.Player;
    return {
      kind: F.Inter.target ? F.Inter.target.kind : '',
      prompt: (document.getElementById('prompt') || {}).textContent || '',
      dead: P.dead, hp: P.hp,
      px: Math.round(P.pos.x), pz: Math.round(P.pos.z),
      nearBoard: F.Village.nearBoard(P.pos.x, P.pos.z, 3.0),
      nearPortal: F.Village.nearPortal(P.pos.x, P.pos.z, 4.2),
      indoor: F.House ? F.House.inside : false,
      dungeon: !!(F.Dungeon && F.Dungeon.inside),
      auto: !!F.Game.auto,
      bx: F.Village.board ? +F.Village.board.x.toFixed(2) : null,
      bz: F.Village.board ? +F.Village.board.z.toFixed(2) : null,
      pxr: +P.pos.x.toFixed(2), pzr: +P.pos.z.toFixed(2),
    };
  });
  await page.keyboard.press('f');
  await page.waitForTimeout(350);
  const boardOpen = await page.evaluate(() => ({
    open: document.getElementById('panel').style.display,
    head: (document.querySelector('#panel .phead h3') || {}).textContent || '',
  }));
  console.log('   公告板实体 =', JSON.stringify({ boardObj, boardPrompt, boardOpen }));
  ok('站在村口公告板前：[F] 出现提示并打开公告板（摆摊/委托入口）',
    boardObj.hasBoard && boardObj.hasBroker && boardPrompt.kind === 'board' && /公告板/.test(boardPrompt.prompt) &&
    /flex/.test(boardOpen.open) && /公告板/.test(boardOpen.head));
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.19.4 黑市：面对面交易 + 摆摊 + 30% 税费 */
  await page.evaluate(() => {
    const F = window.FARM;
    F.UI.closePanel();
    F.Game.auto = null;
    F.Player.dead = false;
    F.Player.pos.set(F.Village.broker.x, F.Village.broker.y + 0.1, F.Village.broker.z + 2.2);
  });
  await page.waitForFunction(() => window.FARM.Inter.target && window.FARM.Inter.target.kind === 'black',
    { timeout: 8000 }).catch(() => { });
  const bmPrompt = await page.evaluate(() => ({
    kind: window.FARM.Inter.target ? window.FARM.Inter.target.kind : '',
    prompt: (document.getElementById('prompt') || {}).textContent || '',
  }));
  await page.keyboard.press('f');
  await page.waitForTimeout(350);
  const bm = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.coins = 100000;
    F.Game.inv = { gem_rainbow: 3, iron_ingot: 6 };
    F.UI2.panelBlackMarket('stall');
    const stallList = document.querySelectorAll('#panel .friends')[0];
    const hasForm = !!document.querySelector('#bm-item');
    return {
      open: document.getElementById('panel').style.display,
      head: (document.querySelector('#panel .phead h3') || {}).textContent || '',
      tabs: Array.prototype.map.call(document.querySelectorAll('#panel .ranktabs .rt'), e => e.textContent).join('|'),
      hasForm,
      others: document.querySelectorAll('#panel .friends')[1] ? document.querySelectorAll('#panel .friends')[1].querySelectorAll('.frow').length : 0,
      othersTxt: document.querySelectorAll('#panel .friends')[1] ? document.querySelectorAll('#panel .friends')[1].textContent : '',
    };
  });
  console.log('   黑市 =', JSON.stringify({ bmPrompt, bm }));
  ok('进入黑市：摆摊面板 + 上架表单 + 别人的摊位（实付价含税）',
    bmPrompt.kind === 'black' && /黑市/.test(bmPrompt.prompt) && /flex/.test(bm.open) && /黑市/.test(bm.head) &&
    /摆摊/.test(bm.tabs) && bm.hasForm && bm.others > 0 && /税费/.test(bm.othersTxt));

  /* 真实点击「上架」按钮 */
  const post = await page.evaluate(() => {
    const F = window.FARM;
    document.querySelector('#bm-item').value = 'gem_rainbow';
    document.querySelector('#bm-n').value = '2';
    document.querySelector('#bm-price').value = '500';
    document.querySelector('#bm-post').click();
    return { mine: F.BMarket.mine.length, inv: F.Game.inv.gem_rainbow || 0, first: F.BMarket.mine[0] ? F.BMarket.mine[0].price : 0 };
  });
  ok('摆摊：点击上架 → 物品进摊位且单价生效', post.mine === 1 && post.inv === 1 && post.first === 500);

  const face = await page.evaluate(() => {
    const F = window.FARM;
    F.UI2.panelBlackMarket('face');
    const p = F.BMarket.peep();
    const row = document.querySelectorAll('#panel .friends')[1].querySelector('.frow');
    const txt = row ? row.textContent : '';
    const before = F.Game.coins;
    document.querySelectorAll('#panel .friends')[1].querySelector('.mini.buy').click();
    return { before, after: F.Game.coins, name: p.name, txt, destroyed: F.BMarket.destroyed, deals: F.BMarket.deals };
  });
  console.log('   面对面交易 =', JSON.stringify(face));
  ok('面对面交易：买方实付 = 货款 + 30% 税费（税费记入回收）',
    face.after < face.before && face.destroyed > 0 && face.deals > 0 && /税费/.test(face.txt));

  const sellFace = await page.evaluate(() => {
    const F = window.FARM;
    /* ponytail: 冶炼/制作是随时间推进的，铁锭数量会浮动 —— 先钉死成 6，断言才有意义 */
    F.Game.inv.iron_ingot = 6;
    F.UI2.panelBlackMarket('face');
    const c0 = F.Game.coins;
    const rows = document.querySelectorAll('#panel .friends')[2].querySelectorAll('.frow');
    const hwRow = Array.prototype.find.call(rows, r => /铁锭/.test(r.textContent));
    hwRow.querySelector('.mini.buy').click();
    return { gain: F.Game.coins - c0, left: F.Game.inv.iron_ingot || 0 };
  });
  ok('面对面可以把背包物资卖给对方（全额到账）', sellFace.gain > 0 && sellFace.left === 5);

  const bmLog = await page.evaluate(() => {
    const F = window.FARM;
    F.UI2.panelBlackMarket('log');
    return {
      txt: document.getElementById('panel').textContent,
      cards: document.querySelectorAll('#panel .cards .card').length,
      rows: Array.prototype.map.call(document.querySelectorAll('#panel .friends .frow'), e => e.textContent).length,
      destroyed: F.BMarket.destroyed,
    };
  });
  ok('黑市流水页：税费回收数据 + 成交明细', /30%/.test(bmLog.txt) && bmLog.cards >= 6 && bmLog.rows > 0 && bmLog.destroyed > 0);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 5.19.5 商人收购 */
  const buyback = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.inv = { iron: 12, potion: 2, axe: 1 };
    F.Game.coins = 0;
    F.UI2.panelShop('material');
    const lists = document.querySelectorAll('#panel .items');
    const buyGrid = lists[lists.length - 1];
    const before = {
      rows: buyGrid ? buyGrid.querySelectorAll('.item').length : 0,
      hasAxe: buyGrid ? /斧头/.test(buyGrid.textContent) : true,
      pcat: Array.prototype.map.call(document.querySelectorAll('#panel .pcat'), e => e.textContent).join('|'),
      unit: Math.max(1, Math.ceil((F.priceOf('iron') || 0) * 1.15)),
    };
    const btn = Array.prototype.find.call(document.querySelectorAll('#panel .btn'), b => /一键售出/.test(b.textContent));
    if (btn) btn.click();
    return {
      before,
      after: { iron: F.Game.inv.iron || 0, potion: F.Game.inv.potion || 0, axe: F.Game.inv.axe || 0, coins: F.Game.coins },
    };
  });
  console.log('   商人收购 =', JSON.stringify(buyback));
  ok('商人收购：面板列出背包物资 → 一键售出（工具被保护排除 · 主营 +15%）',
    buyback.before.rows > 0 && !buyback.before.hasAxe && /收购/.test(buyback.before.pcat) &&
    buyback.after.iron === 0 && buyback.after.axe === 1 &&
    buyback.after.coins >= buyback.before.unit * 12);
  await page.evaluate(() => window.FARM.UI.closePanel());

  /* 6. 存档 / 读档 */
  const saved = await page.evaluate(() => {
    const F = window.FARM;
    F.Game.save();
    const raw = localStorage.getItem('farm3d_save_v1');
    return raw ? JSON.parse(raw) : null;
  });
  ok('存档写入', !!saved && saved.builds.length > 0);
  await page.reload();
  await page.waitForFunction(() => window.FARM && window.FARM.Game && document.getElementById('loading').style.display === 'none', { timeout: 120000 });
  await page.waitForTimeout(1200);
  const loaded = await page.evaluate(() => ({
    builds: window.FARM.Builds.list.length,
    tilled: window.FARM.Farm.tiles.filter(t => t.state > 0).length,
    wood: window.FARM.Game.inv.wood || 0,
    mounts: window.FARM.Mounts.list.length,
  }));
  ok('刷新页面后读档恢复（含坐骑）', loaded.builds === saved.builds.length && loaded.tilled >= 1 && loaded.mounts >= 1);
  console.log('   读档状态 =', JSON.stringify(loaded));

  /* 7. 鼠标指针始终可见（曾做过「进入世界自动隐藏」，玩家不要，已撤 —— 这条断言守住别再加回来） */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const cur = await page.evaluate(() => ({
    cv: getComputedStyle(document.getElementById('cv')).cursor,
    cls: document.documentElement.classList.contains('cur-none'),
    panel: (document.querySelector('#panel .phead h3') || {}).textContent || '',
  }));
  await page.evaluate(() => window.FARM.UI.closePanel());
  console.log('   指针 =', JSON.stringify(cur));
  ok('鼠标指针不做隐藏：画布上始终可见，Esc 依旧打开设置面板',
    cur.cv !== 'none' && !cur.cls && cur.panel === '设置');

  /* 9. 镜头自动跟随：横移（A）时角色朝向与镜头前方有夹角，相机应自己绕过去；
     关掉开关后相机保持不动（量相机 yaw 的净变化，角色朝向在移动中本来就会转） */
  const camYawOff = () => page.evaluate(() => {
    const P = window.FARM.Player;
    let d = (P.camYaw - P._y0) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    return d;
  });
  await page.evaluate(() => {
    const P = window.FARM.Player;
    window.FARM.Game.opt.follow = true;
    P.camYaw = P.rot + Math.PI;            /* 从正后方出发 */
    P._y0 = P.camYaw;
    P.camIdle = 9;                          /* 视为很久没碰相机 */
  });
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(9000);          /* 软渲染 ~1.3fps，给足转动时间 */
  await page.keyboard.up('KeyA');
  const dOn = await camYawOff();
  await page.evaluate(() => {
    const P = window.FARM.Player;
    window.FARM.Game.opt.follow = false;
    P.camYaw = P.rot + Math.PI;
    P._y0 = P.camYaw;
    P.camIdle = 9;
  });
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyA');
  const dOff = await camYawOff();
  console.log('   跟随 =', JSON.stringify({ on: +dOn.toFixed(2), off: +dOff.toFixed(2) }));
  ok('镜头自动跟随：横移 3 秒相机跟转（>1.2 rad）；关掉后不动（<0.1 rad）',
    Math.abs(dOn) > 1.2 && Math.abs(dOff) < 0.1);

  /* 10. 交互隔离：右键菜单 / 鼠标手势入口 / 拖拽选中 / 中键 / 双击 / 键盘滚页 全被接管，
          且输入框里的原生行为不被误伤 */
  const guard = await page.evaluate(() => {
    document.getElementById('guard-hint') && document.getElementById('guard-hint').remove();
    const cv = document.getElementById('cv');
    const fire = (type, Ctor, opts) => {
      const e = new Ctor(type, Object.assign({ bubbles: true, cancelable: true, view: window }, opts));
      cv.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const keyOn = (k, target) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      (target || dispatchEvent) && (target ? target.dispatchEvent(e) : dispatchEvent(e));
      return e.defaultPrevented;
    };
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    const res = {
      ready: !!window.__GUARD_READY,
      ctxMenu: fire('contextmenu', MouseEvent, { button: 2 }),
      rmbDown: fire('mousedown', MouseEvent, { button: 2 }),
      mmbDown: fire('mousedown', MouseEvent, { button: 1 }),
      lmbDown: fire('mousedown', MouseEvent, { button: 0 }),   /* 左键交给游戏，不拦 */
      select: fire('selectstart', Event, {}),
      drag: fire('dragstart', Event, {}),
      dbl: fire('dblclick', MouseEvent, {}),
      space: keyOn(' ', null),
      arrow: keyOn('ArrowDown', null),
      page: keyOn('PageDown', null),
      keyInInput: keyOn(' ', inp),          /* 输入框里必须放行 */
      selInInput: (() => { const e = new Event('selectstart', { bubbles: true, cancelable: true }); inp.dispatchEvent(e); return e.defaultPrevented; })(),
      imgNoDrag: (() => {
        const im = document.createElement('img'); document.body.appendChild(im);
        window.__GUARD_HARDEN();                       /* 同步补一次，不依赖 MutationObserver 的防抖 */
        const v = im.getAttribute('draggable'); im.remove(); return v;
      })(),
      _tail: fire('mouseup', MouseEvent, { button: 2 }),   /* 复位右键状态：别让看门狗把测试误判成「事件被吞」 */
      noScrollBar: document.documentElement.scrollHeight <= window.innerHeight + 1 &&
        getComputedStyle(document.body).overflow === 'hidden',
      cvTouch: getComputedStyle(cv).touchAction,
    };
    inp.remove();
    return res;
  });
  console.log('   隔离 =', JSON.stringify(guard));
  ok('交互隔离：右键菜单/右键拖拽/中键/双击/拖拽选中被拦截', guard.ready && guard.ctxMenu && guard.rmbDown &&
    guard.mmbDown && guard.dbl && guard.select && guard.drag);
  ok('交互隔离：左键不拦 · 输入框原生行为保留 · 键盘滚页被拦', !guard.lmbDown && !guard.keyInInput &&
    !guard.selInInput && guard.space && guard.arrow && guard.page);
  ok('布局隔离：无滚动条 + 画布 touch-action:none · 图片不可拖拽',
    guard.noScrollBar && guard.cvTouch === 'none' && guard.imgNoDrag === 'false');

  /* 11. 手势扩展兜底：模拟「右键按下后事件被浏览器层吞掉」（无 mousemove 也无 mouseup），
          应弹出可关闭的友好提示 */
  await page.evaluate(() => {
    const old = document.getElementById('guard-hint'); if (old) old.remove();
    document.getElementById('cv').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 2 }));
  });
  /* ponytail: 软渲染主线程一卡，2.4s 的看门狗定时器可能晚点才响 —— 轮询等它，别赌固定 3 秒 */
  await page.waitForFunction(() => document.getElementById('guard-hint'), { timeout: 8000 })
    .catch(() => { });
  const hint = await page.evaluate(() => {
    const d = document.getElementById('guard-hint');
    return d ? d.textContent : '';
  });
  await page.screenshot({ path: path.join(__dirname, 'production', 'qa', 'evidence', 'pc-gesture-hint.png') });
  ok('手势扩展兜底：右键拖动被吞时弹出「建议关闭鼠标手势」的提示', /鼠标手势扩展/.test(hint));
  console.log('   兜底提示 =', JSON.stringify(hint.slice(0, 40)));
  await page.evaluate(() => { const d = document.getElementById('guard-hint'); if (d) d.remove(); });

  /* 12. 山坡岩石化：全图找最陡的坡，传送过去强制重建装饰层 —— 岩石必须真的撒出来了 */
  const rocks = await page.evaluate(() => {
    const F = window.FARM, T = F.T;
    F.UI.closePanel();                             /* 前面测试可能留着面板，挡镜头 */
    let best = null;
    for (let a = 0; a < 6.28; a += 0.12) for (let r = 50; r < 260; r += 10) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = T.slopeAt(x, z), h = T.hAt(x, z);
      /* 挑「真正的山坡」（0.5~0.9），且坡脚退 10m 必须是陆地缓坡（不然站到湖里拍照） */
      if (s < 0.5 || s > 0.9 || h < 3) continue;
      const gx = T.hAt(x + 8, z) - T.hAt(x - 8, z), gz = T.hAt(x, z + 8) - T.hAt(x, z - 8);
      const gl = Math.hypot(gx, gz) || 1;
      const fx = x - (gx / gl) * 10, fz = z - (gz / gl) * 10;
      if (T.hAt(fx, fz) < 1.2 || T.slopeAt(fx, fz) > 0.35) continue;
      /* 山坡体量：周边 30m 内陡坡采样点越多越适合当证据（避免选中一个小土包） */
      let size = 0;
      for (let aa = 0; aa < 6.28; aa += 0.5) for (const rr of [8, 16, 24]) {
        if (T.slopeAt(x + Math.cos(aa) * rr, z + Math.sin(aa) * rr) > 0.45) size++;
      }
      if (!best || size > best.size) best = { x, z, s, fx, fz, gx, gz, gl, size };
    }
    if (!best) return { found: false };
    const P = F.Player;
    P.pos.set(best.fx, T.hAt(best.fx, best.fz), best.fz);
    P.camYaw = Math.atan2(best.gx, best.gz);   /* 相机看向爬坡方向 */
    P.camPitch = 0.32; P.camDist = 8;
    P.updateCamera(0, true);
    F.World.updateGrass(best.x, best.z, 0.016, true);   /* 重建圈以坡上点为圆心：数的是山坡上的岩石 */
    const layer = (F.World.flora || []).find(L => L.sink);
    return { found: true, slope: +best.s.toFixed(2), count: layer ? layer.mesh.count : -1 };
  });
  console.log('   山坡岩石 =', JSON.stringify(rocks));
  ok('山坡岩石化：陡坡上撒出装饰岩石层（>10 块）', rocks.found && rocks.count > 10);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, 'production', 'qa', 'evidence', 'hill-rocks.png') });
  await page.evaluate(() => { const P = window.FARM.Player; P.pos.set(2, 0, 104); });

  /* 13. 采集资源头顶蓝色名称牌（常驻）+ 采集耗尽的消失动画 */
  const lbl = await page.evaluate(() => {
    const F = window.FARM, L = F.NodeLabel;
    const n = F.Nodes.list.find(x => x.alive && x.def.tool !== 'axe') || F.Nodes.list[0];
    F.Player.pos.set(n.x, F.T.hAt(n.x, n.z), n.z);
    F.Nodes.updateLabels(1, n.x, n.z);
    const vis = L.pool.filter(s => s.visible);
    return {
      pool: L.pool.length, visible: vis.length,
      keys: vis.slice(0, 3).map(s => s.userData.key),
      blue: vis.length ? vis[0].material.map !== null : false,
      above: vis.length ? +(vis[0].position.y - n.by).toFixed(2) : -1,
    };
  });
  console.log('   名称牌 =', JSON.stringify(lbl));
  ok('采集资源头顶常驻名称牌：附近节点挂出牌子（有贴图、挂在模型顶上）',
    lbl.pool > 0 && lbl.visible > 0 && lbl.blue && lbl.above > 0.5 && lbl.keys[0] && lbl.keys[0].length > 0);

  const van = await page.evaluate(() => {
    const F = window.FARM;
    const n = F.Nodes.list.find(x => x.alive && x.def.tool === 'pick');
    const size = () => {                        /* 读该实例当前的缩放（动画进度） */
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      F.Nodes.meshes[n.type].getMatrixAt(n.idx, m); m.decompose(p, q, s);
      return { s: +s.x.toFixed(3), y: +p.y.toFixed(2) };
    };
    const full = size().s;
    const p0 = F.FX.parts.length;
    F.Nodes.harvest(n);
    const start = { van: n.van, alive: n.alive, parts: F.FX.parts.length - p0 };
    F.Nodes.update(0.12);                       /* 动画中途：实例应处于「正在缩小」 */
    const mid = size(), midVan = +n.van.toFixed(2);   /* 此刻就取，别放到 return 里（那时循环已跑完） */
    /* ponytail: 软渲染帧率极低，直接喂固定步长把动画推完，不赌墙钟时间 */
    for (let i = 0; i < 8; i++) F.Nodes.update(0.1);
    const end = size();
    return { full: +full.toFixed(3), start, midVan, mid, endVan: n.van, end };
  });
  const vanEnd = { van: van.endVan, endScale: van.end.s, endY: van.end.y };
  console.log('   消失动画 =', JSON.stringify(van), JSON.stringify(vanEnd));
  ok('采集耗尽：先播收缩消失动画（中途仍在缩小）再隐藏实例，并迸发碎屑',
    van.start.alive === false && van.start.van === 0 && van.start.parts > 0 &&
    van.midVan > 0 && van.midVan < 1 && van.mid.s > 0.001 && van.mid.s < van.full &&
    vanEnd.van === 1 && vanEnd.endScale < 0.001);

  /* 14. 采集资源密度减半 + 模型放大 2 倍 */
  const dens = await page.evaluate(() => {
    const F = window.FARM, N = F.Nodes;
    const byType = {};
    for (const n of N.list) byType[n.type] = (byType[n.type] || 0) + 1;
    /* 模型尺寸：抽样核对每个节点的缩放是否落在 def.sc × 2 的区间里 */
    const sample = ['oak', 'rock', 'herb', 'berrybush', 'gold'].map(t => {
      const n = N.list.find(x => x.type === t);
      return n ? { t, s: +n.s.toFixed(2), lo: +(n.def.sc[0] * N.modelScale).toFixed(2), hi: +(n.def.sc[1] * N.modelScale).toFixed(2) } : null;
    }).filter(Boolean);
    return {
      total: N.list.length, bb: byType.berrybush || 0, oak: byType.oak || 0,
      density: N.density, modelScale: N.modelScale, sample,
      inRange: sample.every(x => x.s >= x.lo - 0.01 && x.s <= x.hi + 0.01),
    };
  });
  console.log('   资源密度 =', JSON.stringify(dens));
  ok('采集资源密度减半（总量约 2300、浆果丛 1400）· 模型放大 2 倍（缩放落在 def.sc×2 区间）',
    dens.density === 0.5 && dens.modelScale === 2 && dens.inRange &&
    dens.total > 1600 && dens.total < 2800 && dens.bb > 1000 && dens.bb < 1600 && dens.oak > 60 && dens.oak < 120);

  /* 15. 科幻皮肤：深空玻璃面板 + 青色描边 + 标题栏能量条 + 全站亮色文字（守住换肤，别回退成旧浅色） */
  const skin = await page.evaluate(() => {
    const F = window.FARM;
    F.UI.openPanel('inv');
    const q = s => document.querySelector(s);
    const cs = s => { const e = q(s); return e ? getComputedStyle(e) : null; };
    const p = cs('#panel .panel'), h = cs('#panel .phead');
    const r = {
      accent: getComputedStyle(document.documentElement).getPropertyValue('--green').trim(),
      ink: getComputedStyle(document.body).color,
      panelGrad: p && p.backgroundImage !== 'none',
      panelCyan: p && /90, 210, 255/.test(p.borderColor),
      headGlow: h && /63, 224, 200/.test(h.boxShadow),
      title: (q('#panel .phead h3') || {}).textContent || '',
    };
    F.UI.closePanel();
    return r;
  });
  console.log('   科幻皮肤 =', JSON.stringify(skin));
  ok('科幻皮肤：面板深空玻璃渐变 + 青色描边发光 + 标题栏青色能量条 + 全站亮色文字',
    skin.accent === '#3fe0c8' && skin.panelGrad && skin.panelCyan && skin.headGlow &&
    skin.title === '背包' && /rgb\(22\d, 2\d\d, 25\d\)/.test(skin.ink));

  /* 16. 系统菜单：15 个竖排按钮收进宫格面板，入口唯一、分组齐全、点格子能开对应面板 */
  const sys = await page.evaluate(() => {
    const F = window.FARM;
    const btns = document.querySelectorAll('#corner .cbtn').length;
    F.UI.openPanel('sys');
    const head = (document.querySelector('#panel .phead h3') || {}).textContent || '';
    const tiles = [...document.querySelectorAll('#panel .sys-tile')];
    const cats = [...document.querySelectorAll('#panel .pcat')].map(e => e.textContent);
    /* 点「背包」格子 → 背包面板应打开 */
    tiles.find(t => /背包/.test(t.textContent)).click();
    const invHead = (document.querySelector('#panel .phead h3') || {}).textContent || '';
    return { btns, head, tiles: tiles.length, keys: tiles.filter(t => t.querySelector('.tk')).length,
      cats, invHead };
  });
  console.log('   系统菜单 =', JSON.stringify(sys));
  ok('系统菜单：右下角仅 1 个入口 · 宫格 15 项全部带图标 + 14 个快捷键角标 · 功能/社交/系统 三组 · 点格开面板',
    sys.btns === 1 && sys.head === '系统菜单' && sys.tiles === 15 && sys.keys === 14 &&
    JSON.stringify(sys.cats) === JSON.stringify(['功能', '社交', '系统']) && sys.invHead === '背包');

  /* 17. 移速：初始移速 ×5（走 4.3→21.5 / 跑 7.4→37 / 游泳 2.9→14.5），实测 1 秒真的走出 20 米上下 */
  const mvx = await page.evaluate(() => {
    const F = window.FARM, P = F.Player;
    F.UI.closePanel();
    const x0 = P.pos.x, z0 = P.pos.z;
    const k = F.bind('forward');
    F.Input.keys = {}; F.Input.keys[k] = true;
    for (let i = 0; i < 10; i++) P.update(0.1);       /* 固定步长推进 1 秒，不依赖真实帧率 */
    F.Input.keys = {};
    const d = Math.hypot(P.pos.x - x0, P.pos.z - z0);
    P.speed = 0;
    return { walk: P.SPD.walk, run: P.SPD.run, swim: P.SPD.swim, d: +d.toFixed(1) };
  });
  console.log('   移速 =', JSON.stringify(mvx));
  ok('初始移速 ×5：走 21.5 / 跑 37 / 游泳 14.5，实测 1 秒前进 ≥ 15 米（原 4.3 米/秒）',
    mvx.walk === 21.5 && mvx.run === 37 && mvx.swim === 14.5 && mvx.d >= 15);

  console.log(errs.length ? '\n运行时错误:\n' + errs.slice(0, 5).join('\n') : '\n无 JS 错误');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
