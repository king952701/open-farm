/* ==========================================================================
 * 牧野田园 Open Farm  ·  界面：HUD / 背包 / 建造 / 小地图 / 提示
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp;
  const U = (F.UI = {});

  const TOOLS = [
    { id: 'axe', name: '斧头', key: '1', tip: '砍伐树木' },
    { id: 'pick', name: '镐子', key: '2', tip: '开采矿石' },
    { id: 'sickle', name: '镰刀', key: '3', tip: '采集花草 / 收获作物' },
    { id: 'hoe', name: '锄头', key: '4', tip: '开垦土地' },
    { id: 'seed', name: '种子袋', key: '5', tip: '播种（Q 切换种子）' },
    { id: 'can', name: '水壶', key: '6', tip: '浇水 / 打水' },
    { id: 'rod', name: '鱼竿', key: '7', tip: '钓鱼' },
    { id: 'feed', name: '牧草捆', key: '8', tip: '喂食 / 放牧跟随' },
    { id: 'hammer', name: '建造锤', key: '9', tip: '打开建造菜单（B）' },
  ];

  let elPrompt, elProg, elProgBar, elProgTxt, elToasts, elHotbar, elSeedbar, elTime, elVitals, elPanel, elNodeInfo, mmCanvas, mmCtx, mmBase;
  let curPanel = null, mmT = 0;

  /* ============================ 初始化 ============================ */
  U.init = function () {
    elPrompt = F.$('#prompt');
    elNodeInfo = F.$('#nodeinfo');
    elProg = F.$('#progress'); elProgBar = F.$('#progress-bar'); elProgTxt = F.$('#progress-txt');
    elToasts = F.$('#toasts');
    elHotbar = F.$('#hotbar');
    elSeedbar = F.$('#seedbar');
    elTime = F.$('#clock');
    elVitals = F.$('#vitals');
    elPanel = F.$('#panel');
    mmCanvas = F.$('#mm'); mmCtx = mmCanvas.getContext('2d');

    /* 快捷栏 */
    TOOLS.forEach((t, i) => {
      const d = F.el('div', 'slot');
      d.innerHTML = `<b>${t.name[0]}</b><span class="nm">${t.name}</span><i>${t.key}</i>`;
      d.title = t.name + '：' + t.tip;
      d.dataset.tip = `<div class="tp-n">${t.name}</div><div class="tp-d">${t.tip}</div><div class="tp-p">快捷键 ${t.key}</div>`;
      d.onclick = () => F.Player.setTool(t.id);
      elHotbar.appendChild(d);
    });
    /* 种子条 */
    for (const k in F.CROPS) {
      const d = F.el('div', 'seed');
      d.dataset.seed = k;
      const cr = F.CROPS[k];
      d.dataset.tip = `<div class="tp-n">${cr.name}种子</div><div class="tp-d">生长约 ${Math.round(cr.grow / 60)} 分钟 · 收获 ${cr.yield[0]}~${cr.yield[1]} 个 · 食用 +${cr.food} 饥饿</div><div class="tp-p">收购价 ${cr.p || 3} 金币/个</div>`;
      d.innerHTML = `<span class="dot" style="background:#${F.CROPS[k].c.toString(16).padStart(6, '0')}"></span>${F.CROPS[k].name}<b>0</b>`;
      d.onclick = () => { F.Inter.seed = k; U.syncHotbar(); };
      elSeedbar.appendChild(d);
    }
    U.syncHotbar();
    buildMinimapBase();

    /* 小地图点击传送 */
    mmCanvas.style.cursor = 'pointer';
    mmCanvas.addEventListener('click', e => {
      const r = mmCanvas.getBoundingClientRect();
      const x = -T.HALF + ((e.clientX - r.left) / r.width) * T.WORLD;
      const z = -T.HALF + ((e.clientY - r.top) / r.height) * T.WORLD;
      tryTeleport(x, z);
    });

    /* 全局物品悬停信息面板（移开渐隐） */
    let tipEl = document.getElementById('tooltip');
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'tooltip'; document.body.appendChild(tipEl); }
    document.addEventListener('mousemove', e => {
      const t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (t && t.dataset && t.dataset.tip) {
        if (tipEl.innerHTML !== t.dataset.tip) tipEl.innerHTML = t.dataset.tip;
        tipEl.classList.add('show');
        tipEl.style.left = Math.min(e.clientX + 14, window.innerWidth - 250) + 'px';
        tipEl.style.top = Math.min(e.clientY + 16, window.innerHeight - 110) + 'px';
      } else tipEl.classList.remove('show');
    });

    /* 按键：全部走 F.bind 键位映射（设置 → 快捷键 可自定义；Esc 与数字 1~9 固定） */
    addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); if (F.bind('map') === 'tab') U.togglePanel('map'); return; }
      if (k >= '1' && k <= '9') { const t = TOOLS[+k - 1]; if (t) { F.Player.setTool(t.id); if (t.id === 'hammer') U.openPanel('build'); } }
      else if (k === F.bind('build')) U.openPanel('build');
      else if (k === F.bind('bag')) U.togglePanel('inv');
      else if (k === F.bind('craft')) U.togglePanel('craft');
      else if (k === F.bind('help') || k === '?' || k === '/') { U.setTab = 'manual'; U.togglePanel('settings'); }
      else if (k === F.bind('skill')) U.togglePanel('skill');
      else if (k === F.bind('settings')) U.togglePanel('settings');
      else if (k === F.bind('chat')) F.UI2 && F.UI2.toggleChat();
      else if (k === F.bind('friends')) U.togglePanel('friends');
      else if (k === F.bind('guild')) U.togglePanel('guild');
      else if (k === F.bind('auction')) U.togglePanel('auction');
      else if (k === F.bind('party')) U.togglePanel('party');
      else if (k === F.bind('rank')) U.togglePanel('rank');
      else if (k === F.bind('throwball')) F.Mounts && F.Mounts.throwBall();
      else if (k === F.bind('mounts')) U.togglePanel('mounts');
      else if (k === F.bind('arena')) U.togglePanel('arena');
      else if (k === F.bind('homebuild')) { if (F.HomeBuild) { if (U.getPanel && U.getPanel() === 'homebuild') U.closePanel(); else F.HomeBuild.panel(); } }
      else if (k === F.bind('ab1')) F.Ability && F.Ability.cast(0);
      else if (k === F.bind('ab2')) F.Ability && F.Ability.cast(1);
      else if (k === F.bind('seed')) U.cycleSeed(1);
      else if (k === F.bind('remove')) { F.Inter.enterRemove(); }
      else if (k === F.bind('interact')) { if (F.Inter.fishing && F.Inter.fishing.phase === 'bite') F.Inter.reelIn(); else F.Inter.pressF(); }
      else if (k === F.bind('alt')) F.Inter.pressG();
      else if (k === F.bind('map')) U.togglePanel('map');
      else if (k === 'escape') {
        if (F.Inter.build || F.Inter.removeMode || F.Inter.moveMode) F.Inter.exitAll();
        else if (curPanel) U.closePanel();
        else U.openPanel('settings');
      }
    });
    F.$('#btn-build').onclick = () => U.openPanel('build');
    F.$('#btn-inv').onclick = () => U.togglePanel('inv');
    F.$('#btn-help').onclick = () => { U.setTab = 'manual'; U.togglePanel('settings'); };
    F.$('#btn-about').onclick = () => { U.setTab = 'about'; U.togglePanel('settings'); };
    F.$('#btn-set').onclick = () => U.togglePanel('settings');
    /* 不给「关于」绑快捷键：? 与 / 已经是手册的入口，再绑会跟上面的 keydown 双重 toggle */
    const bind = (id, fn) => { const e = F.$(id); if (e) e.onclick = fn; };
    bind('#btn-skill', () => U.togglePanel('skill'));
  bind('#btn-chat', () => F.UI2 && F.UI2.toggleChat());
    bind('#btn-friends', () => U.togglePanel('friends'));
    bind('#btn-guild', () => U.togglePanel('guild'));
    bind('#btn-party', () => U.togglePanel('party'));
    bind('#btn-ah', () => U.togglePanel('auction'));
    bind('#btn-rank', () => U.togglePanel('rank'));
    bind('#btn-mount', () => U.togglePanel('mounts'));
    bind('#btn-arena', () => U.togglePanel('arena'));
    bind('#btn-home', () => F.HomeBuild && F.HomeBuild.panel());
  };

  U.syncHotbar = function () {
    if (!elHotbar) return;
    const cur = F.Player.tool;
    Array.prototype.forEach.call(elHotbar.children, (d, i) => {
      d.classList.toggle('on', TOOLS[i].id === cur);
    });
    elSeedbar.style.display = cur === 'seed' ? 'flex' : 'none';
    Array.prototype.forEach.call(elSeedbar.children, d => {
      const k = d.dataset.seed;
      d.classList.toggle('on', k === F.Inter.seed);
      d.querySelector('b').textContent = F.Game.seeds(k);
    });
  };

  U.cycleSeed = function (d) {
    const keys = Object.keys(F.CROPS);
    let i = keys.indexOf(F.Inter.seed) + d;
    if (i < 0) i = keys.length - 1; if (i >= keys.length) i = 0;
    F.Inter.seed = keys[i];
    U.syncHotbar();
    U.toast('选择种子：' + F.CROPS[F.Inter.seed].name, 'info');
  };

  /* ============================ 提示 ============================ */
  U.setPrompt = function (txt) {
    if (elPrompt.textContent !== txt) elPrompt.textContent = txt || '';
    elPrompt.style.display = txt ? 'block' : 'none';
  };
  /* 靠近资源点时的资源信息卡（null / '' 隐藏）*/
  U.setNodeInfo = function (html) {
    if (!elNodeInfo) return;
    if (elNodeInfo.innerHTML !== (html || '')) elNodeInfo.innerHTML = html || '';
    elNodeInfo.style.display = html ? 'block' : 'none';
  };
  U.setProgress = function (v, label) {
    if (v <= 0) { elProg.style.display = 'none'; return; }
    elProg.style.display = 'block';
    elProgBar.style.width = (v * 100).toFixed(1) + '%';
    elProgTxt.textContent = label || '';
  };
  U.toast = function (txt, kind) {
    const d = F.el('div', 'toast ' + (kind || 'info'), txt);
    elToasts.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateY(-8px)'; }, 2100);
    setTimeout(() => d.remove(), 2600);
    while (elToasts.children.length > 6) elToasts.removeChild(elToasts.firstChild);
  };

  /* ============================ HUD ============================ */
  U.update = function (dt, G) {
    const t = G.time;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    const phase = t < 5 ? '黎明前' : t < 8 ? '清晨' : t < 11 ? '上午' : t < 13 ? '正午' : t < 17 ? '午后' : t < 19 ? '黄昏' : '夜间';
    elTime.innerHTML = `<b>第 ${G.day} 天</b> · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${phase}`;

    const P = F.Player;
    elVitals.innerHTML =
      /* 科幻配色的状态条：红→品红、橙→琥珀、绿→青（与 --green 主色一致） */
      bar('生命', P.hp, '#ff5470') +
      bar('饥饿', P.hunger, '#ffb454') + bar('体力', P.energy, '#3fe0c8') +
      `<div class="vrow"><span>水壶</span><div class="vbar"><i style="width:${(G.can / 10 * 100)}%;background:#5ad2ff"></i></div><em>${Math.ceil(G.can)}/10</em></div>` +
      `<div class="vrow"><span>金币</span><div class="vbar"><i style="width:100%;background:#ffd45a"></i></div><em>${G.coins}</em></div>`;

    mmT -= dt;
    if (mmT <= 0) { mmT = 0.25; drawMinimap(); }
  };
  function bar(name, v, c) {
    return `<div class="vrow"><span>${name}</span><div class="vbar"><i style="width:${clamp(v, 0, 100)}%;background:${c}"></i></div><em>${Math.round(v)}</em></div>`;
  }

  /* ============================ 小地图 ============================ */
  function buildMinimapBase() {
    const S = 180;
    mmBase = document.createElement('canvas');
    mmBase.width = S; mmBase.height = S;
    const c = mmBase.getContext('2d');
    const img = c.createImageData(S, S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = -T.HALF + (i / (S - 1)) * T.WORLD;
        const z = -T.HALF + (j / (S - 1)) * T.WORLD;
        const h = T.hAt(x, z);
        let r, g, b;
        if (h < 0) { const d = clamp(-h / 4, 0, 1); r = 40 + (1 - d) * 40; g = 90 + (1 - d) * 60; b = 130 + (1 - d) * 60; }
        else if (h < 1.4) { r = 216; g = 202; b = 160; }
        else {
          const sl = T.slopeAt(x, z);
          const pd = T.pathDist(x, z);
          const forest = T.inForestCore(x, z);
          let gr = 111 + F.fbm(x * 0.03, z * 0.03, 2) * 30;
          let gg = 154, bb = 78;
          if (forest) { gr = 77; gg = 122; bb = 58; }
          if (sl > 0.55) { gr = 141; gg = 135; bb = 121; }
          if (h > 22) { gr = 156; gg = 150; bb = 140; }
          if (pd < 3.2) { gr = 178; gg = 166; bb = 140; }
          r = gr; g = gg; b = bb;
        }
        const k = (j * S + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }

  function w2m(x, z) {
    return [((x + T.HALF) / T.WORLD) * 180, ((z + T.HALF) / T.WORLD) * 180];
  }
  function drawWorldTo(c, S) {
    const k = S / 180;
    c.clearRect(0, 0, S, S);
    c.drawImage(mmBase, 0, 0, S, S);
    /* 农田区 */
    for (const z0 of T.ZONES) {
      const [ax, ay] = w2m(z0.x - z0.w / 2, z0.z - z0.d / 2);
      c.strokeStyle = 'rgba(240,220,140,.85)'; c.lineWidth = 1.5 * k;
      c.strokeRect(ax * k, ay * k, (z0.w / T.WORLD) * S, (z0.d / T.WORLD) * S);
    }
    /* 钓点 */
    c.fillStyle = '#7fe0ff';
    for (const s of F.Fish.spots) { const [x, y] = w2m(s.x, s.z); c.beginPath(); c.arc(x * k, y * k, 2 * k, 0, 6.283); c.fill(); }
    /* 建筑 */
    for (const b of F.Builds.list) {
      const [x, y] = w2m(b.x, b.z);
      c.fillStyle = b.id === 'fence' ? 'rgba(200,170,120,.9)' : (b.id === 'house' ? '#ffd479' : '#f0a070');
      c.beginPath(); c.arc(x * k, y * k, (b.id === 'house' ? 2.6 : 1.7) * k, 0, 6.283); c.fill();
    }
    /* 畜禽 */
    for (const a of F.Animals.list) {
      const [x, y] = w2m(a.x, a.z);
      c.fillStyle = a.type === 'cow' ? '#ffffff' : (a.type === 'sheep' ? '#e8e8e0' : '#ffd24a');
      c.beginPath(); c.arc(x * k, y * k, 1.8 * k, 0, 6.283); c.fill();
    }
    /* 玩家 */
    const P = F.Player;
    const [px, py] = w2m(P.pos.x, P.pos.z);
    c.save(); c.translate(px * k, py * k); c.rotate(-P.rot + Math.PI); c.scale(k, k);
    c.fillStyle = '#ff6a4a';
    c.beginPath(); c.moveTo(0, -5); c.lineTo(3.6, 4); c.lineTo(0, 2); c.lineTo(-3.6, 4); c.closePath(); c.fill();
    c.restore();
    /* 视野扇形 */
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1 * k;
    c.beginPath(); c.arc(px * k, py * k, 9 * k, 0, 6.283); c.stroke();
  }

  function drawMinimap() {
    drawWorldTo(mmCtx, 180);
  }

  /* ============================ 传送 ============================ */
  function tryTeleport(x, z) {
    if (F.Player.indoor) { U.toast('先走出房间再传送', 'bad'); return; }
    const rr = Math.hypot(x, z);
    if (rr > 272) { U.toast('超出可传送范围', 'bad'); return; }
    if (T.isWater(x, z) || T.hAt(x, z) < 0.55) { U.toast('那里是水面，不能传送', 'bad'); return; }
    if (T.slopeAt(x, z) > 0.55) { U.toast('那里太陡峭，不能传送', 'bad'); return; }
    const P = F.Player;
    P.pos.set(x, T.hAt(x, z), z);
    P.vy = 0;
    F.Inter.exitAll();
    U.closePanel();
    U.toast('已传送 (' + Math.round(x) + ', ' + Math.round(z) + ')', 'ok');
  }

  /* ============================ 大地图（Tab） ============================ */
  function panelMap() {
    const { body } = panelShell('牧野田园 · 世界地图', '点击地图任意位置即可传送 · [Tab] 关闭');
    const S = 440;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    cv.className = 'bigmap';
    cv.style.cursor = 'pointer';
    body.appendChild(cv);
    body.appendChild(F.el('div', 'tip', '黄框 = 农田 · 橙点 = 建筑 · 蓝点 = 钓点 · 白点 = 畜禽 · 红色箭头 = 你的位置与朝向。点击地图任意陆地位置传送。'));
    let alive = true;
    (function draw() {
      if (!alive) return;
      drawWorldTo(cv.getContext('2d'), S);
      requestAnimationFrame(draw);
    })();
    cv.onclick = e => {
      const r = cv.getBoundingClientRect();
      const x = -T.HALF + ((e.clientX - r.left) / r.width) * T.WORLD;
      const z = -T.HALF + ((e.clientY - r.top) / r.height) * T.WORLD;
      tryTeleport(x, z);
    };
    /* 面板关闭时停止重绘 */
    const obs = new MutationObserver(() => {
      if (!document.body.contains(cv)) { alive = false; obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ============================ 面板 ============================ */
  /* 统一面板拉伸：右缘(↔) / 底缘(↕) / 右下角(↔↕)。
     ponytail: Pointer Events 一套代码通吃鼠标/手指/手写笔；尺寸按面板名存 localStorage，
     窗口变化（转屏 / 平板分屏）时自动夹回范围内；把手常显不依赖 hover；支持键盘微调 */
  const PANEL_MIN = { w: 320, h: 220 };
  function clampPanelSize(w, h) {
    return [F.clamp(w, PANEL_MIN.w, Math.round(innerWidth * 0.94)), F.clamp(h, PANEL_MIN.h, Math.round(innerHeight * 0.9))];
  }
  function makeResizable(box, key) {
    const store = 'farm3d_panel_' + key;
    try {
      const s = JSON.parse(localStorage.getItem(store) || 'null');
      if (s && s.w && s.h) { const [w, h] = clampPanelSize(s.w, s.h); box.style.width = w + 'px'; box.style.height = h + 'px'; box.style.maxHeight = '94vh'; }
    } catch (e) { /* 存档损坏就当没调过 */ }
    const save = () => {
      const r = box.getBoundingClientRect();
      try { localStorage.setItem(store, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) })); } catch (e) { }
    };
    const resize = (dir, dx, dy) => {
      const r = box.getBoundingClientRect();
      let w = r.width, h = r.height;
      if (dir.indexOf('e') >= 0) w = r.width + dx;
      if (dir.indexOf('s') >= 0) h = r.height + dy;
      [w, h] = clampPanelSize(w, h);
      box.style.width = w + 'px'; box.style.height = h + 'px'; box.style.maxHeight = '94vh';
    };
    for (const [cls, dir, label] of [
      ['prs-e', 'e', '左右拉伸面板'], ['prs-s', 's', '上下拉伸面板'], ['prs-se', 'se', '斜角拉伸面板'],
    ]) {
      const hd = F.el('div', 'prs ' + cls);
      if (cls === 'prs-se') hd.appendChild(F.el('i'));
      hd.setAttribute('role', 'separator');
      hd.setAttribute('aria-label', label + '（可用方向键微调）');
      hd.tabIndex = 0;
      let px = 0, py = 0;
      hd.addEventListener('pointerdown', e => {
        px = e.clientX; py = e.clientY;
        hd.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      hd.addEventListener('pointermove', e => {
        if (!hd.hasPointerCapture || !hd.hasPointerCapture(e.pointerId)) return;
        resize(dir, e.clientX - px, e.clientY - py);
        px = e.clientX; py = e.clientY;
      });
      const end = e => { if (hd.hasPointerCapture && hd.hasPointerCapture(e.pointerId)) { hd.releasePointerCapture(e.pointerId); save(); } };
      hd.addEventListener('pointerup', end);
      hd.addEventListener('pointercancel', end);
      hd.addEventListener('keydown', e => {          /* 键盘微调：方向键 ±24px */
        const step = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
        if (!step) return;
        e.preventDefault(); e.stopPropagation();
        resize(dir, step[0], step[1]); save();
      });
      box.appendChild(hd);
    }
    return box;
  }
  /* 转屏 / 平板分屏 / 多窗口改尺寸：把打开中的面板夹回可用范围 */
  addEventListener('resize', () => {
    if (!elPanel || elPanel.style.display === 'none') return;
    const box = elPanel.querySelector('.panel');
    if (!box || !box.style.width) return;
    const r = box.getBoundingClientRect();
    const [w, h] = clampPanelSize(r.width, r.height);
    if (Math.abs(w - r.width) > 1 || Math.abs(h - r.height) > 1) {
      box.style.width = w + 'px'; box.style.height = h + 'px'; box.style.maxHeight = '94vh';
      if (curPanel) { try { localStorage.setItem('farm3d_panel_' + curPanel, JSON.stringify({ w: Math.round(w), h: Math.round(h) })); } catch (e) { } }
    }
  });

  /* ponytail: 面板容器是 flex 居中，拖拽时转成绝对定位；全局只挂一对 mousemove/mouseup，
     否则每开一次面板就累积一对监听器 */
  let pDrag = null;
  addEventListener('mousemove', e => {
    if (!pDrag) return;
    if (!document.body.contains(pDrag.box)) { pDrag = null; return; }
    pDrag.box.style.left = Math.max(8, Math.min(window.innerWidth - 80, e.clientX - pDrag.ox)) + 'px';
    pDrag.box.style.top = Math.max(8, Math.min(window.innerHeight - 40, e.clientY - pDrag.oy)) + 'px';
  });
  addEventListener('mouseup', () => { pDrag = null; });

  function panelShell(title, sub) {
    elPanel.innerHTML = '';
    elPanel.style.display = 'flex';
    const box = F.el('div', 'panel');
    box.style.position = 'relative';                    /* 拉伸把手需要定位基准 */
    box.innerHTML = `<div class="phead"><h3>${title}</h3><span>${sub || ''}</span><div class="close">✕</div></div>`;
    box.querySelector('.close').onclick = () => U.closePanel();
    if (curPanel) makeResizable(box, curPanel);
    /* 标题栏拖拽（斗兽场 / 背包 / 排行等所有面板通用） */
    const head = box.querySelector('.phead');
    head.style.cursor = 'move';
    head.addEventListener('mousedown', e => {
      if (e.target.closest('.close')) return;
      const r = box.getBoundingClientRect();
      if (box.style.position !== 'absolute') {
        box.style.position = 'absolute';
        box.style.left = r.left + 'px';
        box.style.top = r.top + 'px';
        box.style.margin = '0';
      }
      pDrag = { box, ox: e.clientX - r.left, oy: e.clientY - r.top };
      e.preventDefault();
    });
    const body = F.el('div', 'pbody');
    box.appendChild(body);
    elPanel.appendChild(box);
    return { box, body };
  }
  U.closePanel = function () { pDrag = null; elPanel.style.display = 'none'; elPanel.innerHTML = ''; curPanel = null; };
  U.togglePanel = function (n) { if (curPanel === n) U.closePanel(); else U.openPanel(n); };
  U.panelShell = panelShell;
  U.setPanel = function (n) { curPanel = n; };
  U.getPanel = function () { return curPanel; };

  U.openPanel = function (n) {
    curPanel = n;
    if (n === 'friends' && F.UI2) return F.UI2.panelFriends();
    if (n === 'guild' && F.UI2) return F.UI2.panelGuild();
    if (n === 'party' && F.UI2) return F.UI2.panelParty();
    if (n === 'auction' && F.UI2) return F.UI2.panelAuction(false);
    if (n === 'rank' && F.UI2) return F.UI2.panelRank();
    if (n === 'mounts' && F.UI2) return F.UI2.panelMounts();
    if (n === 'arena' && F.UI2) return F.UI2.panelArena();
    if (n === 'homebuild' && F.HomeBuild) return F.HomeBuild.panel();
    if (n === 'skill') return panelSkill();
    if (n === 'build') return panelBuild();
    if (n === 'inv') return panelInv();
    if (n === 'craft') return panelCraft();
    if (n === 'storage') return panelStorage();
    if (n === 'barn') return panelBarn();
    if (n === 'map') return panelMap();
    if (n === 'trade') return panelTrade();
    if (n === 'chest') return panelChest();
    if (n === 'help') return panelHelp();
    if (n === 'settings') return panelSettings();
  };

  /* ============================ 技能面板：战斗 / 生活 / 天赋 ============================ */
  /* ponytail: 数据一律读现成的 F.Skills / F.Inter.gateList，这里只补 UI，不新增技能逻辑 */
  function skillCard(id) {
    const s = F.SKILLS[id], d = F.Skills.get(id), need = F.Skills.need(d.lv);
    const unlocked = F.Inter.gateList ? F.Inter.gateList(id) : [];
    const next = unlocked.find(g => g.lv > d.lv);
    const el = F.el('div', 'skill');
    el.dataset.tip = `<div class="tp-n">${s.name} Lv.${d.lv}</div>
      <div class="tp-d">经验 ${d.xp} / ${need}（${(d.xp / need * 100).toFixed(1)}%）</div>
      <div class="tp-p">${next ? `升到 Lv.${next.lv} 解锁：${next.name}` : '本技能对应资源已全部解锁'}</div>`;
    el.innerHTML =
      `<span class="si" style="background:${s.c}">${s.icon}</span>
       <span class="sn">${s.name}</span>
       <span class="sl">Lv.${d.lv}</span>
       <div class="sb"><i style="width:${(d.xp / need * 100).toFixed(1)}%"></i></div>
       <span class="sx">${d.xp} / ${need}</span>`;
    return el;
  }

  function panelSkill() {
    const tab = U.skillTab || 'life';
    const { body } = panelShell('技能', '战斗 / 生活 / 天赋 · [L] 开关 · [Tab] 关闭');
    U.setPanel('skill');
    const tabs = F.el('div', 'ranktabs');
    for (const [id, nm] of [['combat', '战斗'], ['life', '生活'], ['talent', '天赋']]) {
      const t = F.el('div', 'rt' + (tab === id ? ' on' : ''), nm);
      t.onclick = () => { U.skillTab = id; panelSkill(); };
      tabs.appendChild(t);
    }
    body.appendChild(tabs);

    /* ---------------- 生活：全部技能等级 / 经验条 / 解锁门槛 ---------------- */
    if (tab === 'life') {
      body.appendChild(F.el('div', 'pstat', '综合等级 Lv.' + F.Skills.total() + ' · 采集 / 挖矿 / 钓鱼都有等级门槛，练级即可解锁高阶资源'));
      const sg = F.el('div', 'skillgrid');
      for (const k in F.SKILLS) sg.appendChild(skillCard(k));
      body.appendChild(sg);

      const gates = F.Inter.gateList('mine');
      if (gates.length) {
        body.appendChild(F.el('div', 'pcat', '挖矿解锁表'));
        const g = F.el('div', 'items');
        for (const it of gates) {
          if (it.lv <= 1) continue;
          const row = F.el('div', 'item');
          const lv = F.Skills.lv('mine');
          row.dataset.tip = `<div class="tp-n">${it.name} · 需要挖矿 Lv.${it.lv}</div>
            <div class="tp-d">${lv >= it.lv ? '已解锁' : `还差 ${it.lv - lv} 级`}</div>`;
          row.innerHTML = `<span class="sw" style="background:${lv >= it.lv ? '#6ac06a' : '#8a8a8a'}"></span>
            <span class="nm">${it.name}</span><b>Lv.${it.lv}</b>`;
          g.appendChild(row);
        }
        body.appendChild(g);
      }
      return;
    }

    /* ---------------- 战斗：熟练度 + 装备带来的战斗力 ---------------- */
    if (tab === 'combat') {
      body.appendChild(F.el('div', 'pstat', '击杀怪物累计战斗熟练度 · 攻击力来自武器与工具，防御力来自防具与首饰'));
      const sg = F.el('div', 'skillgrid');
      sg.appendChild(skillCard('combat'));
      body.appendChild(sg);

      const G = F.Game, eq = G.equip || {};
      const rows = [['weapon', '武器'], ['armor', '防具'], ['trinket', '首饰']];
      const g = F.el('div', 'items');
      for (const [slot, label] of rows) {
        const id = eq[slot], e = id ? F.EQUIP[id] : null;
        const d = F.el('div', 'item');
        d.dataset.tip = id
          ? `<div class="tp-n">${F.itemName(id)}</div><div class="tp-d">品质：${e ? e.q : '普通'}${e && e.atk ? ' · 攻击 +' + e.atk : ''}${e && e.def ? ' · 防御 +' + e.def : ''}</div><div class="tp-p">在背包中「装备 / 卸下」</div>`
          : `<div class="tp-n">${label}：空</div><div class="tp-d">尚未装备${label}</div>`;
        d.innerHTML = `<span class="sw" style="background:#${((F.ITEMS[id] && F.ITEMS[id].c) || 0x888888).toString(16).padStart(6, '0')}"></span>
          <span class="nm">${label}：${id ? F.itemName(id) : '未装备'}</span>
          <b>${e && e.atk ? '攻+' + e.atk : (e && e.def ? '防+' + e.def : '')}</b>`;
        g.appendChild(d);
      }
      body.appendChild(g);
      body.appendChild(F.el('div', 'tip',
        `当前防御 ${G.defense ? G.defense() : 0} 点 · 伤害 =（武器攻击 + 工具基础） × 战斗等级加成 × 技能倍率 × 等级压制`));
      abilitySection(body);
      return;
    }

    /* ---------------- 天赋：数据没接，保留入口与空态 ---------------- */
    body.appendChild(F.el('div', 'pstat', '天赋树：加点后强化采集效率 / 战斗数值 / 体力上限'));
    body.appendChild(F.el('div', 'empty', '天赋数据尚未接入，这里先把入口留出来（以后按技能等级给点数即可）'));
  }

  /* 主动技能列表 + 三槽装配。槽位：[Q] / [E] / 鼠标右键，也可点右下角技能按钮 */
  function abilitySection(body) {
    const A = F.Ability;
    if (!A || !F.ABILITY_DEF) return;
    const lv = A.lv();
    body.appendChild(F.el('div', 'pcat', `主动技能 · 战斗 Lv.${lv} · 装到 [Q] / [E] / 右键三个槽（也可点右下角按钮）`));
    const list = F.el('div', 'items');
    const SLOT_NAME = ['Q', 'E', '右键'];
    for (const id of F.ABILITY_DEF._order) {
      const d = F.ABILITY_DEF[id];
      const un = A.unlocked(id);
      const si = A.slots.indexOf(id);
      const row = F.el('div', 'item');
      row.dataset.tip = `<div class="tp-n">${d.name}${si >= 0 ? ' · 已装配槽 ' + (si + 1) : ''}</div>
        <div class="tp-d">${un ? d.desc : '战斗等级达到 Lv.' + d.lv + ' 解锁（当前 Lv.' + lv + '）'}</div>
        <div class="tp-p">冷却 ${d.cd}s · 消耗 ${d.cost} 体力 · 伤害倍率 ×${d.mult}（点击查看 / 换槽）</div>`;
      row.innerHTML = `<span class="sw" style="background:#${(d.c || 0xffffff).toString(16).padStart(6, '0')}"></span>
        <span class="nm">${d.name}${si >= 0 ? ` · 槽${si + 1}（${SLOT_NAME[si]}）` : ''}</span>
        <b>${un ? '×' + d.mult : 'Lv.' + d.lv}</b>`;
      row.style.cursor = un ? 'pointer' : 'default';
      row.style.opacity = un ? '1' : '.55';
      row.onclick = () => {
        if (!un) { F.UI.toast(d.name + ' 需要战斗 Lv.' + d.lv, 'bad'); F.Audio2.bad(); return; }
        A.setSlot((si + 1) % 3, id);
        F.Audio2.ok();
        F.UI.toast(d.name + ' 装配到 ' + SLOT_NAME[(si + 1) % 3] + ' 槽', 'ok');
        panelSkill();
      };
      list.appendChild(row);
    }
    body.appendChild(list);
    body.appendChild(F.el('div', 'tip', '释放时机：起手（前摇）→ 结算 → 收招，过程移动变慢；冷却中转好前再按不会消耗体力'));
  }

  function costText(cost) {
    return Object.keys(cost).map(k => `${k === 'coins' ? '金币' : F.itemName(k)}×${cost[k]}`).join('  ');
  }

  /* ============================ 物品提示 / 行操作 ============================ */
  function itemTip(id, n) {
    const it = F.ITEMS[id] || {};
    let h = `<div class="tp-n">${it.name || id}${n != null ? ` <span>×${n}</span>` : ''}</div>`;
    if (it.d) h += `<div class="tp-d">${it.d}</div>`;
    const food = F.Game.foodOf(id);
    const stam = F.Game.staminaOf(id);
    if (food) h += `<div class="tp-d">食用：恢复 ${food} 点饥饿</div>`;
    if (stam) h += `<div class="tp-d">食用：恢复 ${stam} 点体力</div>`;
    if (id === 'potion') h += `<div class="tp-d">使用：每秒恢复 5 点体力，持续 3 秒</div>`;
    h += `<div class="tp-p">收购价 ${F.priceOf(id)} 金币/个</div>`;
    return h;
  }

  function nearestBuild(id) {
    let best = null, bd = 1e9;
    for (const b of F.Builds.list) {
      if (b.id !== id) continue;
      const d = Math.hypot(b.x - F.Player.pos.x, b.z - F.Player.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { b: best, d: bd } : null;
  }

  function storeFromInv(k) {
    const n = F.Game.inv[k] || 0;
    if (!n) return;
    const near = nearestBuild('storage');
    const nm = F.itemName(k);
    U.closePanel();
    if (!near) { U.toast('还没有仓库，先建造一座「谷仓」', 'bad'); return; }
    const doStore = () => {
      F.Game.storage[k] = (F.Game.storage[k] || 0) + n;
      delete F.Game.inv[k];
      F.UI.toast('已存入仓库：' + nm + ' ×' + n, 'ok');
    };
    if (near.d < 5) doStore();
    else F.Game.autoTo(near.b.x, near.b.z, '前往仓库存入 ' + nm, doStore);
  }

  function sellFromInv(k) {
    const n = F.Game.inv[k] || 0;
    if (!n) return;
    const near = nearestBuild('depot');
    const nm = F.itemName(k);
    U.closePanel();
    if (!near) { U.toast('还没有收货仓，先建造一座（建造菜单 · 生产）', 'bad'); return; }
    const doSell = () => {
      const g = F.Game.sellItem(k, n);
      F.UI.toast('售出 ' + nm + ' ×' + n + '，+' + g + ' 金币', 'ok');
    };
    if (near.d < 5) doSell();
    else F.Game.autoTo(near.b.x, near.b.z, '前往收货仓出售 ' + nm, doSell);
  }

  function invRow(k) {
    const inv = F.Game.inv;
    const n = inv[k] || 0;
    const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
    const d = F.el('div', 'item');
    d.dataset.tip = itemTip(k, n);
    d.innerHTML = `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
      <span class="nm">${it.name}</span><b>${n}</b>`;
    const usable = F.Game.foodOf(k) > 0 || F.Game.staminaOf(k) > 0 ||
      k === 'potion' || k === 'potion_hp' || k === 'potion_str' || k === 'potion_luck' || !!F.EQUIP[k];
    if (usable) {
      d.classList.add('eat');
      /* 浆果这类只回体力的也是「吃」，不是「用」 */
      const b = F.el('div', 'mini',
        (F.EQUIP[k] ? '装备' : ((F.Game.foodOf(k) > 0 || F.Game.staminaOf(k) > 0) ? '吃' : '用')));
      b.onclick = e => { e.stopPropagation(); F.Game.use(k); panelInv(); };
      d.appendChild(b);
    }
    const b2 = F.el('div', 'mini', '仓');
    b2.title = '存入仓库（自动寻路）';
    b2.onclick = e => { e.stopPropagation(); storeFromInv(k); };
    d.appendChild(b2);
    const b3 = F.el('div', 'mini', '卖');
    b3.title = '出售换金币（自动寻路至收货仓）';
    b3.onclick = e => { e.stopPropagation(); sellFromInv(k); };
    d.appendChild(b3);
    return d;
  }

  function panelBuild() {
    const { body } = panelShell('建造菜单', '点击卡片进入摆放模式 · [Esc] 退出');
    const cats = {};
    for (const id in F.PROPS.BUILDS) {
      const d = F.PROPS.BUILDS[id];
      if (d.cat && d.cat.indexOf('家园') === 0) continue;   /* 家园构配件走「V 家园建造」面板 */
      (cats[d.cat] || (cats[d.cat] = [])).push(d);
    }
    for (const cat in cats) {
      const h = F.el('div', 'pcat', cat);
      body.appendChild(h);
      const grid = F.el('div', 'cards');
      for (const d of cats[cat]) {
        const c = F.el('div', 'card');
        const afford = F.Game.canAfford(d.cost);
        c.dataset.tip = `<div class="tp-n">${d.name}</div><div class="tp-d">${d.desc || ''}</div><div class="tp-p">造价：${costText(d.cost)}</div>`;
        c.innerHTML = `<div class="ic">${d.icon}</div><div class="tt">${d.name}</div>
          <div class="ct ${afford ? '' : 'no'}">${costText(d.cost)}</div><div class="ds">${d.desc || ''}</div>`;
        c.onclick = () => {
          if (!afford) { U.toast('材料不足：' + costText(d.cost), 'bad'); F.Audio2.bad(); return; }
          U.closePanel();
          F.Inter.startBuild(d.id);
        };
        grid.appendChild(c);
      }
      body.appendChild(grid);
    }
    const row = F.el('div', 'prow');
    row.innerHTML = `<button class="btn" id="pb-rm">拆除模式 (X)</button><button class="btn" id="pb-mv">移动模式 (M)</button>`;
    body.appendChild(row);
    row.querySelector('#pb-rm').onclick = () => { U.closePanel(); F.Inter.enterRemove(); };
    row.querySelector('#pb-mv').onclick = () => { U.closePanel(); F.Inter.enterMove(); };
  }

  function panelInv() {
    const { body } = panelShell('背包', '悬停查看物品信息 · 吃/仓/卖 一键操作（仓/卖 自动寻路）');
    const grid = F.el('div', 'items');
    const inv = F.Game.inv;
    let any = false;
    for (const k in inv) {
      if (!inv[k]) continue;
      any = true;
      grid.appendChild(invRow(k));
    }
    if (!any) grid.innerHTML = '<div class="empty">背包空空如也，去野外采集吧</div>';
    body.appendChild(grid);

    const h2 = F.el('div', 'pcat', '种子');
    body.appendChild(h2);
    const sg = F.el('div', 'items');
    for (const k in F.CROPS) {
      const d = F.el('div', 'item' + (F.Inter.seed === k ? ' on' : ''));
      const cr = F.CROPS[k];
      d.dataset.tip = `<div class="tp-n">${cr.name}种子</div><div class="tp-d">生长约 ${Math.round(cr.grow / 60)} 分钟 · 收获 ${cr.yield[0]}~${cr.yield[1]} 个 · 食用 +${cr.food} 饥饿</div><div class="tp-p">收购价 ${cr.p || 3} 金币/个</div>`;
      d.innerHTML = `<span class="sw" style="background:#${F.CROPS[k].c.toString(16).padStart(6, '0')}"></span>
        <span class="nm">${F.CROPS[k].name}种子</span><b>${F.Game.seeds(k)}</b>`;
      d.onclick = () => { F.Inter.seed = k; U.syncHotbar(); panelInv(); };
      sg.appendChild(d);
    }
    body.appendChild(sg);

    const st = F.Game.stats;
    const row = F.el('div', 'pstat',
      `采集 ${st.gather} · 开垦 ${st.till} · 播种 ${st.plant} · 收获 ${st.harvest} · 建造 ${st.build} · 畜牧 ${st.product} · 钓鱼 ${st.fish}`);
    body.appendChild(row);
  }

  const RECIPES = [
    { cat: '材料加工', id: 'board', name: '木板', cost: { wood: 3 }, out: 1, desc: '建筑升级材料' },
    { cat: '材料加工', id: 'brick', name: '石砖', cost: { stone: 3 }, out: 1, desc: '建筑升级材料' },
    { cat: '材料加工', id: 'rope', name: '绳索', cost: { fiber: 4 }, out: 1, desc: '建筑升级材料' },
    { cat: '材料加工', id: 'glass', name: '玻璃', cost: { crystal: 2, fiber: 1 }, out: 2, desc: '透明建材：窗户 / 幕墙必备（家园建造）' },
    { cat: '材料加工', id: 'hay', name: '牧草捆', cost: { fiber: 2, hay: 2 }, out: 3, desc: '喂养畜禽' },
    { cat: '冶炼', id: 'copper_ingot', name: '铜锭', cost: { copper: 3, wood: 1 }, out: 1, desc: '铜矿加木炭熔炼而成' },
    { cat: '冶炼', id: 'tin_ingot', name: '锡锭', cost: { tin: 3, wood: 1 }, out: 1, desc: '锡矿熔炼，用于合成青铜' },
    { cat: '冶炼', id: 'bronze', name: '青铜锭', cost: { copper_ingot: 1, tin_ingot: 1 }, out: 1, desc: '铜锡合金，坚固耐用' },
    { cat: '冶炼', id: 'iron_ingot', name: '铁锭', cost: { iron: 3, wood: 1 }, out: 1, desc: '铁矿熔炼，高级建材与工具' },
    { cat: '冶炼', id: 'alu_ingot', name: '铝锭', cost: { alum: 3, wood: 1 }, out: 1, desc: '轻金属，高级建材' },
    { cat: '冶炼', id: 'silver_ingot', name: '银锭', cost: { silver: 3, wood: 2 }, out: 1, desc: '贵金属，价值很高' },
    { cat: '冶炼', id: 'gold_ingot', name: '金锭', cost: { gold: 3, wood: 2 }, out: 1, desc: '贵重金锭，可直接出售' },
    { cat: '冶炼', id: 'gem_crystal', name: '精制水晶', cost: { crystal: 2 }, out: 1, desc: '打磨后的水晶饰品' },
    { cat: '冶炼', id: 'gem_rainbow', name: '彩虹宝石', cost: { rainbow: 1, crystal: 2 }, out: 1, desc: '流转七彩光芒的传奇宝石' },
    { cat: '炼金', id: 'potion', name: '体力药水', cost: { herb: 3, flower: 2, mushroom: 1 }, out: 2, desc: '使用后每秒恢复 5 点体力，持续 3 秒（背包中点「用」）' },
    { cat: '工器', id: 'ball_nab', name: '纳球', cost: { copper_ingot: 1, leather: 2, fiber: 3 }, out: 1, desc: '捕捉球：对虚弱（生命 ≤40%）的野兽按 R 投掷，成功后成为坐骑' },
  ];

  function panelCraft() {
    const { body } = panelShell('工坊加工', '靠近工坊即可加工 / 冶炼 / 炼金 · 悬停查看配方');
    if (!F.Builds.nearType(F.Player.pos.x, F.Player.pos.z, 8, 'workshop')) {
      body.appendChild(F.el('div', 'empty', '需要站在工坊旁边才能加工'));
    }
    const cats = {};
    for (const r of RECIPES) (cats[r.cat] || (cats[r.cat] = [])).push(r);
    for (const cat in cats) {
      body.appendChild(F.el('div', 'pcat', cat));
      const grid = F.el('div', 'cards');
      for (const r of cats[cat]) {
        const c = F.el('div', 'card');
        const ok = F.Game.canAfford(r.cost);
        c.dataset.tip = `<div class="tp-n">${r.name} ×${r.out}</div><div class="tp-d">${r.desc}</div><div class="tp-p">配方：${costText(r.cost)}</div>`;
        c.innerHTML = `<div class="ic">${r.name[0]}</div><div class="tt">${r.name} ×${r.out}</div>
          <div class="ct ${ok ? '' : 'no'}">${costText(r.cost)}</div><div class="ds">${r.desc}</div>`;
        c.onclick = () => {
          if (!F.Game.spend(r.cost)) { U.toast('材料不足：' + costText(r.cost), 'bad'); F.Audio2.bad(); return; }
          F.Game.give(r.id, r.out);
          F.Audio2.ok();
          U.toast('制作 ' + r.name + ' ×' + r.out, 'ok');
          panelCraft();
        };
        grid.appendChild(c);
      }
      body.appendChild(grid);
    }
  }

  function panelStorage() {
    const { body } = panelShell('谷仓仓库', '一键存取物资');
    const st = F.Game.storage;
    const grid = F.el('div', 'items');
    let any = false;
    for (const k in st) {
      if (!st[k]) continue; any = true;
      const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
      const d = F.el('div', 'item',
        `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span><span class="nm">${it.name}</span><b>${st[k]}</b>`);
      d.dataset.tip = itemTip(k, st[k]);
      grid.appendChild(d);
    }
    if (!any) grid.innerHTML = '<div class="empty">仓库是空的</div>';
    body.appendChild(grid);
    const row = F.el('div', 'prow');
    row.innerHTML = `<button class="btn ok" id="ps-in">存入全部资源</button><button class="btn" id="ps-out">取出全部</button>`;
    body.appendChild(row);
    row.querySelector('#ps-in').onclick = () => { F.Game.storeAll(); panelStorage(); };
    row.querySelector('#ps-out').onclick = () => { F.Game.takeAll(); panelStorage(); };
  }

  /* ============================ 收货仓（出售换金币） ============================ */
  function panelTrade() {
    const near = F.Builds.nearType(F.Player.pos.x, F.Player.pos.z, 8, 'depot');
    const { body } = panelShell('收货仓 · 收购物资', '出售背包物资换取金币 · 悬停查看详情');
    if (!near) { body.appendChild(F.el('div', 'empty', '需要站在收货仓旁边才能出售')); return; }
    body.appendChild(F.el('div', 'pcat', '持有金币：' + F.Game.coins));
    const grid = F.el('div', 'items');
    const inv = F.Game.inv;
    let any = false;
    for (const k in inv) {
      if (!inv[k]) continue;
      any = true;
      const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
      const p = F.priceOf(k);
      const d = F.el('div', 'item');
      d.dataset.tip = itemTip(k, inv[k]);
      d.innerHTML = `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
        <span class="nm">${it.name} <i style="font-style:normal;color:#c8930a;font-size:11px">${p}金</i></span><b>${inv[k]}</b>`;
      const b1 = F.el('div', 'mini', '卖1');
      b1.onclick = () => { const g = F.Game.sellItem(k, 1); U.toast('售出 ' + it.name + '，+' + g + ' 金币', 'ok'); panelTrade(); };
      const b2 = F.el('div', 'mini', '全卖');
      b2.onclick = () => { const g = F.Game.sellItem(k, inv[k]); U.toast('售出 ' + it.name + ' ×' + inv[k] + '，+' + g + ' 金币', 'ok'); panelTrade(); };
      d.appendChild(b1); d.appendChild(b2);
      grid.appendChild(d);
    }
    if (!any) grid.innerHTML = '<div class="empty">背包里没有可出售的物资</div>';
    body.appendChild(grid);
  }

  /* ============================ 屋内储物箱（可升级） ============================ */
  function panelChest() {
    const G = F.Game;
    const { body } = panelShell('储物箱 · ' + G.chestLv + ' 级', '容量 ' + G.chestSlots() + '/' + G.chestCap() + ' 格 · 悬停查看详情');
    const grid = F.el('div', 'items');
    let any = false;
    for (const k in G.chest) {
      if (!G.chest[k]) continue;
      any = true;
      const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
      const d = F.el('div', 'item');
      d.dataset.tip = itemTip(k, G.chest[k]);
      d.innerHTML = `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span><span class="nm">${it.name}</span><b>${G.chest[k]}</b>`;
      grid.appendChild(d);
    }
    if (!any) grid.innerHTML = '<div class="empty">储物箱是空的</div>';
    body.appendChild(grid);
    const row = F.el('div', 'prow');
    const upCost = G.chestUpgradeCost();
    row.innerHTML = `<button class="btn ok" id="pc-in">存入全部</button><button class="btn" id="pc-out">取出全部</button>
      <button class="btn" id="pc-up" ${upCost ? '' : 'disabled'}>${upCost ? '升级（' + costText(upCost) + '）' : '已满级'}</button>`;
    body.appendChild(row);
    row.querySelector('#pc-in').onclick = () => { G.chestStoreAll(); panelChest(); };
    row.querySelector('#pc-out').onclick = () => { G.chestTakeAll(); panelChest(); };
    if (upCost) row.querySelector('#pc-up').onclick = () => { G.chestUpgrade(); panelChest(); };
  }

  function panelBarn() {
    const { body } = panelShell('畜禽状态', '喂食与收产让畜禽更快繁殖');
    const list = F.el('div', 'rows');
    for (const a of F.Animals.list) {
      const def = a.def;
      const ready = F.Animals.productReady(a);
      const row = F.el('div', 'row');
      row.innerHTML = `<span class="tag">${def.name}${a.baby ? '（幼崽）' : ''}</span>
        <span>饱食 <b>${Math.round(a.hunger)}%</b></span>
        <span>${def.pname} <b>${a.baby ? '-' : Math.round(a.product / def.ptime * 100) + '%'}</b></span>
        <span class="${ready ? 'ok2' : ''}">${ready ? '可收获' : (a.hunger > 60 ? '可繁殖' : '需喂食')}</span>
        <span>距离 <b>${Math.round(Math.hypot(a.x - F.Player.pos.x, a.z - F.Player.pos.z))}m</b></span>`;
      list.appendChild(row);
    }
    body.appendChild(list);
    const row = F.el('div', 'prow');
    row.innerHTML = `<button class="btn ok" id="pb-feed">投喂附近畜禽（牧草×1）</button>`;
    body.appendChild(row);
    row.querySelector('#pb-feed').onclick = () => {
      let n = 0;
      for (const a of F.Animals.list) {
        if (Math.hypot(a.x - F.Player.pos.x, a.z - F.Player.pos.z) < 22 && F.Game.has('hay', 1)) {
          F.Game.take('hay', 1); F.Animals.feed(a); n++;
        }
      }
      U.toast(n ? '投喂了 ' + n + ' 只畜禽' : '牧草不足或附近没有畜禽', n ? 'ok' : 'bad');
      panelBarn();
    };
  }

  /* 帮助内容：原「操作指南」面板收纳进 设置 → 手册 标签页（H 键 / 帮助按钮都走这里） */
  function helpHTML() {
    return `
      <div class="pcat">移动与视角</div>
      <div class="keys">
        <div><b>W A S D</b> 行走（相对镜头）</div>
        <div><b>Shift</b> 奔跑</div>
        <div><b>空格</b> 跳跃 · 深水自动游泳</div>
        <div><b>鼠标拖拽</b> 旋转镜头</div>
        <div><b>滚轮</b> 拉近 / 拉远</div>
      </div>
      <div class="pcat">交互</div>
      <div class="keys">
        <div><b>F</b> 主交互（采集 / 开垦 / 播种 / 浇水 / 收获 / 挤奶 / 抛竿 / 提竿）</div>
        <div><b>G</b> 副交互（铲平地块 / 驱赶畜禽 / 烹饪）</div>
        <div><b>鼠标左键</b> 也可触发交互 / 放置建筑</div>
        <div><b>1~9</b> 切换工具 · <b>Q</b> 切换种子</div>
      </div>
      <div class="pcat">建造</div>
      <div class="keys">
        <div><b>B</b> 建造菜单 · <b>V</b> 家园建造（四种风格构配件）· <b>R</b> 旋转 90° · <b>Esc</b> 取消</div>
        <div><b>Shift + 拖动</b> 批量摆放（围栏成排）</div>
        <div><b>X</b> 拆除模式 · <b>M</b> 移动模式</div>
        <div>除水域与山林核心生态区外，全域可自由建造</div>
      </div>
      <div class="pcat">其它</div>
      <div class="keys">
        <div><b>Tab</b> 世界地图（点击传送）· 小地图点击也可传送</div>
        <div><b>T</b> 聊天窗（世界/中文/公会/交易/系统，可拖拽拉伸，工具栏可发表情 / 本地图片 / 摄像头照片 / 背包道具 / 仓库道具，道具可悬浮查看、点击开详情）· <b>K</b> 好友（右击可私聊/组队/邀请入会）</div>
        <div><b>U</b> 公会（公告可编辑、经验进度条、升级扩容）· <b>P</b> 队伍（最多 5 人）· <b>Y</b> 拍卖行（税 20% / 手续费 1%）</div>
        <div>新手村有 8 位商人、炼金师与拍卖师；世界塔 33 层副本消耗门票进入</div>
        <div><b>J</b> 排行榜：综合/战斗/挖矿/采集/农耕/钓鱼/畜牧/烹饪/炼金/财富/副本/公会 动态排名；点击任意一行查看该玩家的装备、工具熟练度与全部技能等级</div>
        <div><b>拍卖行</b>三个标签页：在售 / 我的上架（上架 + 取回）/ 已售记录（近 7/30/365 天、含购买人与 20% 税收统计）</div>
        <div><b>坐骑</b>：工坊「工器」制作纳球 → 把野猪/灰狼/棕熊生命打到 40% 以下 → <b>R</b> 投掷捕捉 → <b>M</b> 打开坐骑面板骑乘（移速大幅提升，奔跑更省体力）</div>
        <div><b>天气</b>：晴朗 / 多云 / 阴天 / 雾 / 小雨 / 雷暴 / 雪 / 大风自动轮换，草随风卷动并伴有风声雨声雷鸣；每种天气的增益减益显示在左上角天气条（移速、体力、饥饿、作物生长、钓鱼、捕捉、怪物刷新）</div>
        <div><b>V</b> 家园建造：用大世界材料制取四种风格（中式 / 西方 / 古典 / 现代）的墙体、地板、天花板、门、门框、门锁、窗户、屋顶、楼梯等构配件；野外通过面板制取需额外 ${F.HomeBuild ? F.HomeBuild.fee : 50} 金币 / 件手续费，站在自己的「工作台」旁可免除</div>
        <div><b>N</b> 斗兽场：1v1 / 3v3 / 10v10 宠物对战；其他玩家开赛时右下角自动弹出观战竞猜面板（双方信息 + 宠物 + 动态赔率）。结算时按「市场税收」收取 ${Math.round((F.Arena ? F.Arena.market.tax : 0.12) * 100)}% 并直接销毁，同时限制下注额度，抑制通货膨胀</div>
        <div><b>商人收购</b>：与任何商人对话时，面板下方有「收购」区，可单件卖出或一键售出全部物资；该商人主营品类的物资收购价 +15%（工具与身上的装备不会被卖）</div>
        <div><b>公告板</b>（村口）：① 「名人堂」显示该榜单前 3 名卡片（实时变动），点击卡片弹出该玩家的人物信息面板（装备 / 工具熟练度 / 全部技能等级）；② 「悬赏委托」随机发布采集 / 狩猎 / 渔获 / 农事 / 畜牧 / 营造 / 供货 / 世界塔任务，<b>奖励在接取瞬间随机生成</b>（金币 + 物资 + 熟练度），同时最多接 3 条，完成后回来领取</div>
        <div><b>黑市</b>（紫色帐篷）：可「摆摊」挂单让别人买走，也可与在场的人「面对面交易」买卖物资；所有成交按 ${Math.round((F.BMarket ? F.BMarket.TAX : 0.3) * 100)}% 收取税费并由买方承担，税费直接进入回收池销毁，用于抑制金币膨胀</div>
        <div><b>L</b> 技能面板（战斗 / 生活 / 天赋，生活页可看 采矿 · 伐木 · 钓鱼 的等级与经验条，高等级才能采高阶矿脉）</div>
        <div><b>I</b> 背包（物品可 吃 / 存仓 / 出售，自动寻路）</div>
        <div><b>C</b> 工坊加工 / 冶炼 / 炼金 · <b>O</b> 设置 · <b>H</b> 本帮助</div>
        <div>民居按 F 进屋：床上休息 / 睡觉，储物箱可升级</div>
        <div>收货仓出售物资换金币；矿脉分布于外圈山地</div>
        <div>资源采完后会自动刷新；鱼群与作物也会持续恢复</div>
      </div>`;
  }
  /* ---------------- 关于 · 致谢 ----------------
     ponytail: 内容全部写死在这里 —— 第三方清单是「事实」不是「数据」，没必要进存档 */
  function aboutHTML() {
    return `
      <div class="pcat">牧野田园 Open Farm</div>
      <div class="keys">
        <div>版本 1.0 · 一款跑在浏览器里的 3D 开放式休闲生存建造游戏：开荒种地、伐木挖矿、钓鱼畜牧、建屋造院，白天干活，夜里防野兽</div>
        <div>无后端、无联网、无广告、无内购；安卓 APK 与网页版共用同一套源码，改一次两处生效</div>
      </div>
      <div class="pcat">致谢 · 第三方</div>
      <div class="keys">
        <div><b>Three.js</b>（MIT License）— 渲染引擎，随包附在 vendor/three.min.js · threejs.org</div>
        <div><b>Web Audio API</b> — 风声、雨声、雷鸣、脚步、采集声全部实时合成，仓库里没有一个音频文件</div>
        <div><b>Canvas 2D</b> — 物品图标与部分贴图由代码绘制，没有引用任何第三方图片</div>
        <div><b>系统字体</b>（苹方 / 微软雅黑 / 思源黑体 等）— 未打包任何第三方字体</div>
        <div><b>Android WebViewAssetLoader</b>（AndroidX，Apache-2.0）— 让 APK 里的网页也能可靠存档</div>
      </div>
      <div class="pcat">致谢 · 人</div>
      <div class="keys">
        <div>开发与维护：king952701</div>
        <div>感谢每一位试玩、吐槽、报 bug 的玩家 —— 是你们把这块荒地一点点种成了田园</div>
        <div>感谢开源社区：无数人无偿写下的代码、文档与回答，是这个游戏真正的地基</div>
      </div>
      <div class="pcat">许可</div>
      <div class="keys">
        <div>本项目以 <b>MIT License</b> 开源：可自由使用、修改、再发布，保留版权声明即可</div>
        <div>源码与更新：github.com/king952701/open-farm</div>
        <div>安卓安装包：github.com/king952701/open-farm/releases/latest</div>
      </div>
      <div class="pcat">想让它更好？</div>
      <div class="keys">
        <div>发现 bug 或有新想法，欢迎到仓库提 Issue —— 每一条我都会看</div>
        <div>本作不含任何第三方品牌、角色与素材；如你认为某处仍有不妥，也请直接告诉我，我会第一时间处理</div>
      </div>`;
  }
  /* ponytail: openPanel('help') 保留为兼容入口，实际就是打开设置面板的手册标签页 */
  function panelHelp() { U.setTab = 'manual'; return panelSettings(); }

  function panelSettings() {
    const G = F.Game;
    const tab = U.setTab || 'display';
    const { body } = panelShell('设置', '画面 / 手册 / 快捷键 / 关于');
    U.setPanel('settings');
    const tabs = F.el('div', 'ranktabs');
    for (const [id, nm] of [['display', '画面与存档'], ['manual', '手册'], ['keys', '快捷键'], ['about', '关于 · 致谢']]) {
      const t = F.el('div', 'rt' + (tab === id ? ' on' : ''), nm);
      t.onclick = () => { U.setTab = id; panelSettings(); };
      tabs.appendChild(t);
    }
    body.appendChild(tabs);

    /* ---------------- 关于 · 致谢 ---------------- */
    if (tab === 'about') {
      const w = F.el('div');
      w.innerHTML = aboutHTML();
      body.appendChild(w);
      return;
    }

    /* ---------------- 手册（原左下角帮助卡与「操作指南」面板收纳于此） ---------------- */
    if (tab === 'manual') {
      const wrap = F.el('div');
      wrap.innerHTML = helpHTML();
      body.appendChild(wrap);
      return;
    }

    /* ---------------- 快捷键自定义 ---------------- */
    if (tab === 'keys') return keysTab(body);

    /* ---------------- 画面 / 天气 / 时间 / 存档 ---------------- */
    const wrap = F.el('div');
    wrap.innerHTML = `
      <div class="pcat">画面</div>
      <div class="srow"><span>草地密度</span>
        <input type="range" id="s-grass" min="0" max="3" step="1" value="${G.opt.grass}">
        <b id="v-grass">${['关闭', '低', '中', '高'][G.opt.grass]}</b></div>
      <div class="srow"><span>阴影</span>
        <input type="checkbox" id="s-shadow" ${G.opt.shadow ? 'checked' : ''}><b>动态阴影</b></div>
      <div class="srow"><span>音效</span>
        <input type="checkbox" id="s-audio" ${G.opt.audio ? 'checked' : ''}><b>交互音效</b></div>
      <div class="srow"><span>镜头</span>
        <input type="checkbox" id="s-follow" ${G.opt.follow !== false ? 'checked' : ''}><b>自动跟随人物（移动时镜头转到背后）</b></div>
      <div class="pcat">天气</div>
      <div class="srow"><span>天气系统</span>
        <input type="checkbox" id="s-wx" ${F.Weather && F.Weather.enabled ? 'checked' : ''}><b>动态天气与增益/减益</b></div>
      <div class="srow"><span>环境音</span>
        <input type="checkbox" id="s-amb" ${F.Weather && F.Weather.ambience ? 'checked' : ''}><b>风声 / 雨声 / 雷鸣</b></div>
      <div class="pcat">时间</div>
      <div class="srow"><span>流速</span>
        <input type="range" id="s-speed" min="0" max="600" step="10" value="${G.opt.timeScale}">
        <b id="v-speed">${G.opt.timeScale === 0 ? '暂停' : (G.opt.timeScale / 100).toFixed(1) + '×'}</b></div>
      <div class="srow"><span>时刻</span>
        <input type="range" id="s-time" min="0" max="23.9" step="0.1" value="${G.time.toFixed(1)}">
        <b id="v-time">${Math.floor(G.time)}:00</b></div>
      <div class="pcat">存档</div>
      <div class="prow">
        <button class="btn ok" id="s-save">立即保存</button>
        <button class="btn warn" id="s-reset">重置存档</button>
      </div>
      <div class="tip">进度每 30 秒自动保存，刷新页面后自动继续。</div>`;
    body.appendChild(wrap);

    const grass = wrap.querySelector('#s-grass');
    grass.oninput = () => {
      G.opt.grass = +grass.value;
      wrap.querySelector('#v-grass').textContent = ['关闭', '低', '中', '高'][G.opt.grass];
      F.World.setGrassQuality(G.opt.grass);
    };
    const sh = wrap.querySelector('#s-shadow');
    sh.onchange = () => { G.opt.shadow = sh.checked; F.World.setShadows(sh.checked); };
    const au = wrap.querySelector('#s-audio');
    au.onchange = () => { G.opt.audio = au.checked; F.Audio2.on = au.checked; };
    const fo = wrap.querySelector('#s-follow');
    if (fo) fo.onchange = () => { G.opt.follow = fo.checked; F.Player.camIdle = 0; };
    const wx = wrap.querySelector('#s-wx');
    if (wx) wx.onchange = () => {
      F.Weather.enabled = wx.checked;
      F.UI.toast('天气系统已' + (wx.checked ? '开启' : '关闭（天气效果暂停）'), 'info');
    };
    const amb = wrap.querySelector('#s-amb');
    if (amb) amb.onchange = () => {
      F.Weather.ambience = amb.checked;
      F.Ambience.on = amb.checked;
      if (!amb.checked && F.Ambience.set) F.Ambience.set(0, 0);
      F.UI.toast('环境音已' + (amb.checked ? '开启' : '静音'), 'info');
    };
    const sp = wrap.querySelector('#s-speed');
    sp.oninput = () => {
      G.opt.timeScale = +sp.value;
      wrap.querySelector('#v-speed').textContent = G.opt.timeScale === 0 ? '暂停' : (G.opt.timeScale / 100).toFixed(1) + '×';
    };
    const tm = wrap.querySelector('#s-time');
    tm.oninput = () => { G.time = +tm.value; F.World.setTime(G.time); wrap.querySelector('#v-time').textContent = Math.floor(G.time) + ':00'; };
    wrap.querySelector('#s-save').onclick = () => { G.save(); U.toast('已保存进度', 'ok'); };
    wrap.querySelector('#s-reset').onclick = () => {
      if (confirm('确定重置存档？所有建筑、作物与物资都会清空。')) { G.reset(); U.toast('存档已重置', 'ok'); U.closePanel(); }
    };
  }

  /* 快捷键标签页：每个动作一个文本框，冲突标红不生效，「恢复默认键位」一键还原 */
  /* ponytail: 键值只存差异到 G.opt.keys（读时兜底默认表），Esc / 数字 1~9 / 鼠标固定不开放修改 */
  function keysTab(body) {
    const G = F.Game;
    G.opt.keys = G.opt.keys || {};
    const dispKey = k => (k === ' ' ? '空格' : k);
    body.appendChild(F.el('div', 'pstat', '点击输入框后直接按下新键即可；冲突的键会标红且不生效。Esc、数字 1~9（工具快捷栏）与鼠标操作固定，方向键始终可作为移动备选。'));
    const grid = F.el('div', 'keygrid');
    for (const id in F.KEY_DEFAULT) {
      const row = F.el('div', 'keyrow');
      row.innerHTML = `<span>${F.KEY_LABEL[id]}</span><input maxlength="8" data-k="${id}" value="${dispKey(F.bind(id))}"><em></em>`;
      grid.appendChild(row);
    }
    body.appendChild(grid);
    const row = F.el('div', 'prow');
    row.innerHTML = '<button class="btn warn" id="k-reset">恢复默认键位</button>';
    body.appendChild(row);

    grid.querySelectorAll('input').forEach(inp => {
      const apply = () => {
        const id = inp.dataset.k;
        const em = inp.parentElement.querySelector('em');
        inp.classList.remove('bad');
        em.textContent = '';
        const key = F.normKey(inp.value);
        if (!key) { em.textContent = inp.value.trim() ? '无法识别的按键' : ''; return; }
        const c = F.keyConflict(id, key);
        if (c) {                                   /* 冲突：标红提醒且不写入，原键位继续有效 */
          inp.classList.add('bad');
          em.textContent = '与「' + F.KEY_LABEL[c] + '」冲突';
          return;
        }
        G.opt.keys[id] = key;
        inp.value = dispKey(key);
      };
      inp.oninput = apply;
      inp.onkeydown = e => {                       /* 在框内直接按键即完成改键；Esc 取消不改 */
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { inp.value = dispKey(F.bind(inp.dataset.k)); inp.blur(); return; }
        inp.value = dispKey(e.key.toLowerCase());
        apply();
        inp.blur();
      };
    });
    body.querySelector('#k-reset').onclick = () => {
      G.opt.keys = {};
      panelSettings();
      U.toast('键位已恢复默认', 'ok');
    };
  }

  /* 供建筑按钮复用 */
  U.costText = costText;
  U.keepBuild = false;

})();
