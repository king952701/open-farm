/* ==========================================================================
 * 牧野田园 Open Farm  ·  移动端触控层
 * 只由 farm3d-android/scripts/prepare.js 生成的 m.html 注入加载 —— 桌面端完全不加载，
 * 也就不可能影响到 PC 的行为。
 *
 * 设计原则：一行不改游戏逻辑，只把触摸翻译成「已有的输入」：
 *   摇杆      → F.Input.axis（player.js 里读它的分支）
 *   滑动      → F.Input.dx / dy（和鼠标拖拽同一条相机路径）
 *   双指 pinch → F.Input.wheel（和滚轮同一条缩放路径）
 *   轻点      → F.Input.clicked（建造放置 / 提竿）
 *   行动键    → UI 快捷键走合成 keydown；战斗/交互直接调 Inter / Mounts / Ability
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;

  /* ---------------- 手机端 UI 适配样式 ----------------
     #corner 那一列功能按钮在桌上貌不惊人，到手机上十四行会挤爆屏幕 —— 默认收起，点「菜单」展开
     所有尺寸乘 var(--ms)（JS 按屏幕短边实时算）：小屏收一收、平板放大一点，
     加上刘海/手势条的 env(safe-area-inset-*)，全机型自适应 */
  const CSS = `
html.mobile #topbar{min-width:0;padding:calc(7px*var(--ms,1)) calc(10px*var(--ms,1))}
html.mobile #clock{font-size:calc(12px*var(--ms,1))}
html.mobile #vitals{margin-top:5px;gap:3px}
html.mobile #vstatus,#topbar .vrow{font-size:calc(11px*var(--ms,1))}
html.mobile #minimap{right:calc(10px*var(--ms,1));top:calc(10px*var(--ms,1));padding:6px}
html.mobile #mm{width:calc(104px*var(--ms,1));height:calc(104px*var(--ms,1))}
html.mobile #mm-label{font-size:calc(10px*var(--ms,1))}
html.mobile #prompt{bottom:calc(104px*var(--ms,1));font-size:calc(13px*var(--ms,1));padding:6px 14px}
html.mobile #nodeinfo{max-width:min(300px,84vw);font-size:calc(12px*var(--ms,1))}
html.mobile #hotbar{gap:calc(5px*var(--ms,1));bottom:calc(10px*var(--ms,1))}
html.mobile .slot{width:calc(50px*var(--ms,1));height:calc(48px*var(--ms,1));border-radius:10px}
html.mobile .slot b{font-size:calc(17px*var(--ms,1))}
html.mobile #seedbar{bottom:calc(66px*var(--ms,1))}
html.mobile .cbtn{min-width:calc(106px*var(--ms,1));padding:calc(11px*var(--ms,1)) calc(14px*var(--ms,1));font-size:calc(14px*var(--ms,1))}
html.mobile #corner{display:none;right:calc(10px*var(--ms,1));bottom:calc(96px*var(--ms,1) + env(safe-area-inset-bottom));
  max-height:52vh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
  padding:6px;border-radius:14px;background:rgba(255,255,255,.55);backdrop-filter:blur(8px)}
html.mobile.corner-open #corner{display:flex}
#mtouch{position:absolute;inset:0;z-index:8;pointer-events:none;touch-action:none}
#mtouch>*{pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none}
#mjoy{position:absolute;left:calc(16px*var(--ms,1) + env(safe-area-inset-left));bottom:calc(78px*var(--ms,1) + env(safe-area-inset-bottom));
  width:calc(118px*var(--ms,1));height:calc(118px*var(--ms,1));border-radius:50%;background:rgba(255,255,255,.30);border:1px solid rgba(60,90,60,.18);
  box-shadow:0 6px 22px rgba(20,40,25,.16)}
#mjoy-k{position:absolute;left:50%;top:50%;width:calc(52px*var(--ms,1));height:calc(52px*var(--ms,1));
  margin:calc(-26px*var(--ms,1)) 0 0 calc(-26px*var(--ms,1));border-radius:50%;
  background:rgba(255,255,255,.86);border:1px solid var(--bd);box-shadow:0 4px 14px rgba(20,40,25,.22);
  transition:transform .06s linear}
#mact{position:absolute;right:calc(14px*var(--ms,1) + env(safe-area-inset-right));bottom:calc(78px*var(--ms,1) + env(safe-area-inset-bottom));
  display:flex;flex-direction:column-reverse;align-items:flex-end;gap:calc(10px*var(--ms,1))}
.mkey{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;
  border:1px solid rgba(60,90,60,.18);border-radius:50%;background:rgba(255,255,255,.86);
  box-shadow:0 6px 22px rgba(20,40,25,.18);color:var(--ink);font-size:calc(13px*var(--ms,1));line-height:1.1}
.mkey b{font-size:calc(10px*var(--ms,1));color:var(--dim);font-weight:400}
.mkey.big{width:calc(82px*var(--ms,1));height:calc(82px*var(--ms,1));font-size:calc(16px*var(--ms,1))}
.mkey.mid{width:calc(62px*var(--ms,1));height:calc(62px*var(--ms,1))}
.mkey.on{background:linear-gradient(180deg,#fff,#e9f6e6);border-color:var(--green);box-shadow:0 0 0 2px rgba(90,168,106,.35),var(--sh)}
#mmenu{position:absolute;right:calc(14px*var(--ms,1) + env(safe-area-inset-right));top:calc(10px*var(--ms,1) + env(safe-area-inset-top));
  padding:calc(9px*var(--ms,1)) calc(13px*var(--ms,1));border-radius:11px;background:var(--glass);border:1px solid var(--bd);
  box-shadow:var(--sh);font-size:calc(13px*var(--ms,1));color:var(--ink)}
#mtip{position:absolute;left:50%;top:calc(10px*var(--ms,1) + env(safe-area-inset-top));transform:translateX(-50%);
  padding:8px 14px;border-radius:16px;background:rgba(28,40,30,.82);color:#f2f7f0;font-size:calc(12px*var(--ms,1));
  max-width:82vw;text-align:center;line-height:1.5}
#cv{touch-action:none}
`;

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  function whenReady(fn) {
    let tries = 0;
    const tick = () => {
      const l = document.getElementById('loading');
      if (l && l.style.display === 'none' && F.Input && F.Player) return fn();
      if (++tries > 900) { console.warn('[mobile] 启动超时，触控层未装配'); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }

  function build() {
    document.documentElement.classList.add('mobile');
    const st = el('style'); st.textContent = CSS; document.head.appendChild(st);

    /* ---------------- 全机型自适应 ----------------
       缩放系数 = 短边 / 420（参考机型 420dp），钳在 0.78~1.35：
       5 寸小屏 → 收缩不挡视野；平板/折叠屏 → 放大好按；超矮屏（带手势条的 21:9）再收一档 */
    const fit = () => {
      let s = Math.min(innerWidth, innerHeight) / 420;
      s = Math.max(0.78, Math.min(1.35, s));
      if (innerHeight < 340) s *= 0.92;
      document.documentElement.style.setProperty('--ms', s.toFixed(3));
    };
    fit();
    addEventListener('resize', fit);
    addEventListener('orientationchange', fit);
    if (window.visualViewport) visualViewport.addEventListener('resize', fit);
    /* ponytail: 模拟器/部分 WebView 改视口不派发 resize —— 每帧比一眼，变了才重算（开销可忽略） */
    let lw = innerWidth, lh = innerHeight;
    (function tickFit() {
      if (innerWidth !== lw || innerHeight !== lh) { lw = innerWidth; lh = innerHeight; fit(); }
      requestAnimationFrame(tickFit);
    })();

    const root = el('div'); root.id = 'mtouch';
    const joy = el('div'); joy.id = 'mjoy';
    const knob = el('div'); knob.id = 'mjoy-k'; joy.appendChild(knob);
    root.appendChild(joy);

    const act = el('div'); act.id = 'mact';

    /* 主交互键：钓鱼提竿与按 F 是同一颗键，跟 ui.js 的分支保持一致 */
    const bF = el('div', 'mkey big', '交互<b>F</b>');
    bF.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (F.Inter && F.Inter.fishing && F.Inter.fishing.phase === 'bite') F.Inter.reelIn();
      else if (F.Inter) F.Inter.pressF();
    });
    act.appendChild(bF);

    const bG = el('div', 'mkey mid', '辅助<b>G</b>');
    bG.addEventListener('pointerdown', e => { e.preventDefault(); F.Inter && F.Inter.pressG(); });
    act.appendChild(bG);

    /* 奔跑：手机长按别扭，做成开关 */
    let running = false;
    const bRun = el('div', 'mkey mid', '奔跑<b>Shift</b>');
    const setRun = v => {
      running = v; bRun.classList.toggle('on', v);
      if (F.Input) F.Input.keys['shift'] = v;
    };
    bRun.addEventListener('pointerdown', e => { e.preventDefault(); setRun(!running); });
    act.appendChild(bRun);

    const bBall = el('div', 'mkey mid', '纳球<b>R</b>');
    bBall.addEventListener('pointerdown', e => { e.preventDefault(); F.Mounts && F.Mounts.throwBall(); });
    act.appendChild(bBall);

    root.appendChild(act);

    const menu = el('div'); menu.id = 'mmenu'; menu.textContent = '菜单';
    menu.addEventListener('pointerdown', e => {
      e.preventDefault();
      document.documentElement.classList.toggle('corner-open');
    });
    root.appendChild(menu);

    const tip = el('div'); tip.id = 'mtip';
    tip.innerHTML = '左侧摇杆走动 · 空白处滑动转视角 · 右下 <b>交互</b> 采集/对话<br>右上「菜单」打开背包 · 建造 · 技能等面板';
    root.appendChild(tip);
    setTimeout(() => tip.remove(), 9000);

    document.body.appendChild(root);

    /* ---------------- 摇杆 ----------------
       摇杆半径跟着 --ms 缩放走：每次按下时实测，别用写死的 44 */
    let R = 44;
    let joyId = null, jcx = 0, jcy = 0;
    const setAxis = (x, y) => {
      if (!x && !y) { if (F.Input) F.Input.axis = null; return; }
      F.Input.axis = { x, y, a: true };
    };
    const joyDown = e => {
      if (joyId !== null) return;
      joyId = e.pointerId;
      R = Math.max(20, joy.clientWidth / 2 - knob.clientWidth / 2);
      const b = joy.getBoundingClientRect();
      jcx = b.left + b.width / 2; jcy = b.top + b.height / 2;
      joy.setPointerCapture && joy.setPointerCapture(e.pointerId);
      joyMove(e);
    };
    const joyMove = e => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - jcx, dy = e.clientY - jcy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      /* 屏幕上「向上」= 前进：clientY 越小，iz 越大 */
      setAxis(dx / R, -dy / R);
    };
    const joyUp = e => {
      if (e.pointerId !== joyId) return;
      joyId = null; knob.style.transform = ''; setAxis(0, 0);
    };
    joy.addEventListener('pointerdown', joyDown);
    joy.addEventListener('pointermove', joyMove);
    joy.addEventListener('pointerup', joyUp);
    joy.addEventListener('pointercancel', joyUp);
    joy.addEventListener('pointerleave', joyUp);

    /* ---------------- 画布：滑动转视角 / 双指缩放 / 轻点 ---------------- */
    const cv = document.getElementById('cv');
    const pts = new Map();
    let pinchPrev = 0, moved = 0, downT = 0, sx = 0, sy = 0;

    const down = e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      if (pts.size === 1) { moved = 0; downT = performance.now(); sx = e.clientX; sy = e.clientY; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinchPrev = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (F.Input) { F.Input.dx += dx; F.Input.dy += dy; }   /* 与鼠标拖拽同一条路径 */
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchPrev && F.Input) F.Input.wheel += (d - pinchPrev) * 0.02;
        pinchPrev = d;
        moved += 99;                                            /* pinch 不算轻点 */
      }
    };
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      pinchPrev = 0;
      /* 短促轻点 = 鼠标左键单击（建造放置 / 提竿收线都读这个） */
      if (pts.size === 0 && moved < 10 && performance.now() - downT < 320 && F.Input) {
        F.Input.clicked = true; F.Input.clickX = sx; F.Input.clickY = sy;
      }
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    /* 禁掉双击放大 / 下拉橡皮筋等移动端默认手势 */
    document.addEventListener('touchmove', e => { if (e.target === cv) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());

    /* -------- 离开前台 / 解锁时把摇杆残留清掉（切回来不会自己跑） -------- */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { joyUp({ pointerId: joyId }); if (F.Input) F.Input.keys['shift'] = false; bRun.classList.remove('on'); running = false; }
    });

    console.log('[mobile] 触控层已装配');
  }

  whenReady(build);
})();
