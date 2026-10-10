/* ==========================================================================
 * 牧野田园 Open Farm  ·  交互隔离守卫
 *
 * 硬性要求：游戏区内的输入只属于游戏，浏览器的「默认动作」一律不让插手：
 *   ① 禁止浏览器右键菜单（整容器）
 *   ② 防止鼠标手势扩展干扰右键拖拽（SmartUp / crxMouse / 浏览器自带手势）
 *   ③ 禁止文本选中与元素 / 图片拖拽
 *   ④ 禁止中键自动滚动、禁止双击选中
 *   ⑤ 禁止方向键 / 空格 / PageUp·Down 滚动页面
 *   ⑥ 触摸端：touch-action:none（画布与 HUD）；里面要滚动的面板例外
 *   ⑦ 布局隔离：无滚动条、画布铺满（见 index.html 的 html,body / #cv）
 *   ⑧ 所有拦截集中在本文件，绑定在同一容器上，每处 preventDefault 都写明作用
 *
 * ponytail: 这里只做「隔离」，不掺任何游戏逻辑 —— 玩家的输入照旧走 player.js 的 Input。
 *   本文件由 index.html 在 main.js 之前加载，安卓入口 m.html 由 prepare.js 从
 *   index.html 派生，因此会被自动带上，两端行为一致。
 *   容器说明：游戏铺满视口（body 即整页游戏），所以统一挂在 document 上监听，
 *   统一用 target 做「输入框等例外」判定，不影响页面本身的原生行为。
 * ========================================================================== */
(function () {
  'use strict';

  /* ---------- 例外判定：输入框 / 可编辑区要保持浏览器原生行为 ---------- */
  function inEditor(t) {
    if (!t || !t.tagName) return false;
    const tag = (t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
  }

  /* ---------------- ②-3 手势扩展提示条（可关，一局只弹一次） ---------------- */
  const HINT = '检测到鼠标手势扩展可能影响游戏操作，建议在浏览器设置中为本页面关闭鼠标手势功能';
  let hinted = false;
  function showGestureHint() {
    if (hinted) return;
    hinted = true;
    try { if (sessionStorage.getItem('farm3d_gesture_hint')) return; } catch (e) { }
    try { sessionStorage.setItem('farm3d_gesture_hint', '1'); } catch (e) { }
    const st = document.createElement('style');
    st.textContent = `#guard-hint{position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:300;
      max-width:min(760px,94vw);padding:9px 14px;border-radius:0 0 12px 12px;
      background:rgba(40,30,26,.92);color:#ffe9c8;font-size:12.5px;line-height:1.5;
      box-shadow:0 8px 24px rgba(10,25,15,.4);cursor:pointer}
      #guard-hint b{margin-left:8px;color:#ffb98a;font-weight:700}`;
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.id = 'guard-hint';
    d.innerHTML = HINT + ' <b>✕</b>';
    d.title = '点击关闭';
    d.addEventListener('contextmenu', e => e.preventDefault());
    d.addEventListener('pointerdown', e => { e.preventDefault(); d.remove(); });
    document.body.appendChild(d);
    if (window.FARM && window.FARM.UI && window.FARM.UI.toast) window.FARM.UI.toast(HINT, 'bad');
    setTimeout(() => { if (d.parentNode) d.remove(); }, 15000);
  }

  /* ---------------- ① 禁止浏览器右键菜单 ----------------
     地图上、道具上、UI 任意位置都不许弹系统菜单；游戏要用右键时一律走自绘菜单
     （ ui2.js 的好友/队伍右键菜单就是自绘的，已在各自 handler 里 preventDefault） */
  addEventListener('contextmenu', e => { e.preventDefault(); }, false);

  /* ---------------- ② 接管右键 / ④ 禁止中键：按下即拦截 ---------------- */
  let rmbDown = false, seenMove = 0, watchdog = 0;
  addEventListener('mousedown', e => {
    /* 右键：阻止浏览器菜单与「鼠标手势扩展」在右键拖动时画出轨迹或触发
       后退 / 关闭标签页 / 刷新 —— 右键拖动全程交给游戏处理（转视角） */
    if (e.button === 2) {
      e.preventDefault();
      rmbDown = true; seenMove = 0;
      clearTimeout(watchdog);
      /* ②-3 兜底侦测：按下右键后 2.4 秒内既没收到 mousemove 也没收到 mouseup，
         说明事件很可能被浏览器层的手势扩展整段吞掉（游戏内右键拖动被中断），提示玩家 */
      watchdog = setTimeout(() => {
        if (rmbDown && seenMove < 2) showGestureHint();
        watchdog = 0;
      }, 2400);
    }
    /* 中键：阻止 Chrome / Firefox 的自动滚动（那个上下箭头八方向滚屏） */
    if (e.button === 1) e.preventDefault();
  }, false);

  /* 右键拖动期间持续吃掉默认动作（选中 / 原生拖拽），保证视角拖动顺滑 */
  addEventListener('mousemove', e => {
    if (!rmbDown) return;
    seenMove++;
    clearTimeout(watchdog); watchdog = 0;
    e.preventDefault();
  }, false);

  addEventListener('mouseup', e => {
    if (e.button === 2) { rmbDown = false; clearTimeout(watchdog); watchdog = 0; }
  }, false);
  /* 拖到窗口外松手 / 切窗口时也要复位，否则会误判成「被吞掉」 */
  addEventListener('blur', () => { rmbDown = false; clearTimeout(watchdog); watchdog = 0; });

  /* ---------------- ③ 禁止文本选中 / 元素与图片拖拽 ---------------- */
  addEventListener('selectstart', e => {
    if (inEditor(e.target)) return;          /* 输入框里要能正常选字 */
    e.preventDefault();                       /* 禁止拖拽鼠标时把 UI 文字当选户选走 */
  }, false);
  addEventListener('dragstart', e => {
    if (inEditor(e.target)) return;
    e.preventDefault();                       /* 禁止把图片 / 链接拖出去（会打断操作、也可能新建标签页） */
  }, false);
  addEventListener('drop', e => { if (!inEditor(e.target)) e.preventDefault(); }, false);
  addEventListener('dragover', e => { if (!inEditor(e.target)) e.preventDefault(); }, false);

  /* 所有 img / a 一律 draggable=false：聊天里发的图片长按拖动最容易被误触 */
  function harden() {
    const ns = document.querySelectorAll('img,a');
    for (let i = 0; i < ns.length; i++) {
      if (ns[i].getAttribute('draggable') !== 'false') ns[i].setAttribute('draggable', 'false');
    }
  }
  harden();
  addEventListener('DOMContentLoaded', harden);
  /* 聊天图片是动态插入的，新节点进来顺手补上（节流，别每张图都跑一遍全表） */
  if (window.MutationObserver) {
    let t = 0;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(harden, 300); })
      .observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- ④ 禁止双击选中 / 双击放大 ---------------- */
  addEventListener('dblclick', e => {
    if (inEditor(e.target)) return;
    e.preventDefault();                       /* 禁止双击选中文本或元素（也顺带禁掉双击缩放） */
  }, false);

  /* ---------------- ⑤ 禁止键盘滚动页面 ---------------- */
  const SCROLL_KEYS = { ' ': 1, space: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, pageup: 1, pagedown: 1, home: 1, end: 1 };
  addEventListener('keydown', e => {
    if (inEditor(e.target)) return;           /* 聊天输入框里空格 / 上下键必须是原生行为 */
    const k = (e.key || '').toLowerCase();
    if (SCROLL_KEYS[k]) e.preventDefault();   /* 页面本身不滚动，但键盘事件照旧送给游戏（ WASD/跳跃/快捷键不受影响） */
  }, false);

  /* ---------------- ⑥ 触摸端兜底：HUD 上的默认手势 ----------------
     画布与触控层已在 CSS 里 touch-action:none；这里再挡一道双指手势事件（iOS Safari） */
  addEventListener('gesturestart', e => e.preventDefault(), false);
  addEventListener('gesturechange', e => e.preventDefault(), false);
  addEventListener('gestureend', e => e.preventDefault(), false);
  /* 安卓 / iOS 长按不弹系统「保存图片 / 复制」菜单 —— 交由 -webkit-touch-callout:none 与上面的 contextmenu 拦截共同保证 */
  addEventListener('touchmove', e => {
    if (inEditor(e.target)) return;
    /* 面板内部要能滚动（背包 / 排行榜很长），所以只在非滚动容器里拦默认手势 */
    if (!e.target.closest || !e.target.closest('.pbody,.cw-body,.mmwrap')) e.preventDefault();
  }, { passive: false });

  window.__GUARD_READY = true;
  window.__GUARD_HARDEN = harden;   /* 给测试与后续动态 UI 用：同步把新插入的 img/a 置为不可拖 */
})();
