/* ==========================================================================
 * 牧野田园 Open Farm  ·  社交 UI：聊天窗（拖拽/拉伸/关闭）/ 好友 / 公会 /
 *                        组队 / 拍卖行 / 商人商店 / 世界塔副本入口
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp;
  const U2 = (F.UI2 = {});
  let win = null, body = null, input = null, tabsEl = null, cur = 'world', privTab = null;
  let fileEl = null, pop = null;
  let S = null;

  const CH_COLOR = { world: '#e8f0ff', zh: '#e8f0ff', guild: '#b8e890', trade: '#f0c840', sys: '#ff9a8a' };

  /* ============================ 聊天窗 ============================ */
  function buildChat() {
    if (win) return;
    S = F.Social;
    win = F.el('div', 'chatwin');
    win.id = 'chatwin';
    win.innerHTML =
      `<div class="cw-head" id="cw-head">
         <span class="cw-title">聊天</span>
         <div class="cw-tabs" id="cw-tabs"></div>
         <div class="cw-btns"><span id="cw-min">—</span><span id="cw-x">✕</span></div>
       </div>
       <div class="cw-body" id="cw-body"></div>
       <div class="cw-bar" id="cw-bar">
         <span class="cw-tool" id="ct-emoji" title="表情">😊<i>表情</i></span>
         <span class="cw-tool" id="ct-img" title="发送图片">🖼<i>图片</i></span>
         <span class="cw-tool" id="ct-photo" title="拍照发送">📷<i>照片</i></span>
         <span class="cw-tool" id="ct-bag" title="背包道具">🎒<i>背包</i></span>
         <span class="cw-tool" id="ct-store" title="仓库道具">📦<i>仓库</i></span>
         <input type="file" id="cw-file" accept="image/*" hidden>
       </div>
       <div class="cw-input"><input id="cw-in" placeholder="输入消息，回车发送…" maxlength="140"><button id="cw-send">发送</button></div>
       <div class="cw-rs" id="cw-rs"></div>`;
    document.body.appendChild(win);
    body = win.querySelector('#cw-body');
    input = win.querySelector('#cw-in');
    tabsEl = win.querySelector('#cw-tabs');

    /* 拖拽 */
    const head = win.querySelector('#cw-head');
    let drag = null;
    head.addEventListener('mousedown', e => {
      if (e.target.id === 'cw-min' || e.target.id === 'cw-x') return;
      const r = win.getBoundingClientRect();
      if (!win.style.left) { win.style.left = r.left + 'px'; win.style.top = r.top + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto'; }
      drag = { ox: e.clientX - r.left, oy: e.clientY - r.top };
      e.preventDefault();
    });
    addEventListener('mousemove', e => {
      if (!drag) return;
      win.style.left = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.ox)) + 'px';
      win.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.oy)) + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto';
    });
    addEventListener('mouseup', () => { drag = null; });

    /* 拉伸 */
    const rs = win.querySelector('#cw-rs');
    let rz = null;
    rs.addEventListener('mousedown', e => {
      const r = win.getBoundingClientRect();
      if (!win.style.left) { win.style.left = r.left + 'px'; win.style.top = r.top + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto'; }
      rz = { w: r.width, h: r.height, x: e.clientX, y: e.clientY };
      e.preventDefault(); e.stopPropagation();
    });
    addEventListener('mousemove', e => {
      if (!rz) return;
      win.style.width = Math.max(240, Math.min(760, rz.w + (e.clientX - rz.x))) + 'px';
      win.style.height = Math.max(160, Math.min(620, rz.h + (e.clientY - rz.y))) + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto';
    });
    addEventListener('mouseup', () => { rz = null; });

    win.querySelector('#cw-x').onclick = () => U2.closeChat();
    win.querySelector('#cw-min').onclick = () => {
      const b = win.querySelector('.cw-body'), i = win.querySelector('.cw-input'), bar = win.querySelector('.cw-bar');
      const hidden = b.style.display === 'none';
      b.style.display = hidden ? 'block' : 'none';
      i.style.display = hidden ? 'flex' : 'none';
      bar.style.display = hidden ? 'flex' : 'none';
      if (hidden) win.style.height = '260px';
      else { closePop(); win.style.height = '34px'; }
    };
    const send = () => {
      const v = input.value;
      if (!v.trim()) return;
      if (cur.indexOf('p:') === 0) S.sendPrivate(cur.slice(2), v);
      else S.send(cur, v);
      input.value = '';
      closePop();
      render();
    };
    win.querySelector('#cw-send').onclick = send;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); send(); } e.stopPropagation && e.stopPropagation(); });
    input.addEventListener('keyup', e => e.stopPropagation());

    /* ---- 工具栏：表情 / 图片 / 照片 / 背包 / 仓库 ---- */
    const bar = win.querySelector('#cw-bar');
    fileEl = win.querySelector('#cw-file');
    fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0];
      fileEl.value = '';
      if (!f) return;
      closePop();
      fileToImage(f, src => { if (src) sendPayload({ type: 'img', src }); });
    });
    bar.querySelector('#ct-emoji').onclick = () => openEmoji();
    bar.querySelector('#ct-img').onclick = () => fileEl.click();
    bar.querySelector('#ct-photo').onclick = () => openPhoto();
    bar.querySelector('#ct-bag').onclick = () => openItems('inv');
    bar.querySelector('#ct-store').onclick = () => openItems('storage');
    win.addEventListener('mousedown', e => {
      if (pop && !pop.contains(e.target) && !bar.contains(e.target)) closePop();
    });

    renderTabs();
    render();
    if (S.onMessage !== onMsg) {
      const prev = S.onMessage;
      S.onMessage = (ch, msg) => { prev && prev(ch, msg); onMsg(ch, msg); };
    }
  }

  function onMsg(ch, msg) {
    if (!win || win.style.display === 'none') return;
    if (ch === cur || (cur.indexOf('p:') === 0 && ch === 'private:' + cur.slice(2))) render();
    else {
      const t = tabsEl && tabsEl.querySelector('[data-ch="' + ch + '"]');
      if (t && ch !== cur) t.classList.add('new');
    }
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    const list = F.CHANNELS.map(c => ({ id: c.id, name: c.name }));
    for (const k in S.privates) list.push({ id: 'p:' + k, name: '私·' + k });
    for (const t of list) {
      const d = F.el('div', 'cw-tab' + (cur === t.id ? ' on' : ''), t.name);
      d.dataset.ch = t.id;
      d.onclick = () => { cur = t.id; closePop(); renderTabs(); render(); };
      tabsEl.appendChild(d);
    }
  }

  function render() {
    if (!body) return;
    const arr = cur.indexOf('p:') === 0 ? (S.privates[cur.slice(2)] || []) : (S.chat[cur] || []);
    body.innerHTML = '';
    const show = arr.slice(-60);
    for (const m of show) {
      const d = F.el('div', 'cw-msg' + (m.sys ? ' sys' : '') + (m.self ? ' self' : ''));
      const col = m.sys ? CH_COLOR.sys : (m.self ? '#ffe9a0' : CH_COLOR[cur] || '#e8f0ff');
      const head = document.createElement('b');
      head.style.color = col;
      head.textContent = m.sys ? '' : m.from + '：';
      d.appendChild(head);
      const tc = m.sys ? CH_COLOR.sys : '#e6efe4';
      if (m.type === 'img' && m.src) {
        const im = document.createElement('img');
        im.className = 'cw-img';
        im.src = m.src;
        im.alt = '[图片]';
        im.title = '点击查看大图';
        im.addEventListener('click', () => showImage(m.src));
        d.appendChild(im);
      } else if (m.type === 'item' && m.item) {
        const it = F.ITEMS[m.item] || { name: m.item, c: 0xcccccc };
        const chip = F.el('span', 'cw-chip');
        chip.dataset.tip = chatItemTip(m.item, m.n);
        chip.innerHTML =
          `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
           <span class="nm">${it.name}</span><b>×${m.n || 1}</b>`;
        chip.title = '点击查看物品详情';
        chip.addEventListener('click', () => U2.panelChatItem(m.item, m.n));
        d.appendChild(chip);
      } else {
        const sp = document.createElement('span');
        sp.style.color = tc;
        sp.textContent = m.text || '';
        d.appendChild(sp);
      }
      body.appendChild(d);
    }
    body.scrollTop = body.scrollHeight;
    renderTabs();
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==================== 聊天：表情 / 图片 / 照片 / 道具 ==================== */
  const EMOJIS = ['😀', '😄', '😁', '😂', '😍', '😘', '😎', '🤔', '😭', '😡', '🥳', '😴',
    '👍', '🙏', '👏', '💪', '🎉', '❤️', '🌾', '🌽', '🍞', '🐟', '🐄', '🐖',
    '🌳', '⚔️', '🛡️', '💰', '🔥', '✨', '🌙', '☀️', '🍀', '🐝'];

  /* 聊天内道具的悬浮面板内容（沿用物品悬停格式） */
  function chatItemTip(id, n) {
    const it = F.ITEMS[id] || {};
    const e = F.EQUIP[id];
    let h = `<div class="tp-n">${it.name || id}${n != null ? ` <span>×${n}</span>` : ''}</div>`;
    h += `<div class="tp-d">品质：${F.qualityOf(id)} · 类别：${F.catOf(id)} · 等级：${F.levelOf(id)}</div>`;
    if (it.d) h += `<div class="tp-d">${it.d}</div>`;
    if (e) h += `<div class="tp-d">${e.atk ? '攻击 +' + e.atk + ' ' : ''}${e.def ? '防御 +' + e.def : ''}</div>`;
    const food = F.Game.foodOf(id), stam = F.Game.staminaOf(id);
    if (food) h += `<div class="tp-d">食用：恢复 ${food} 点饥饿</div>`;
    if (stam) h += `<div class="tp-d">食用：恢复 ${stam} 点体力</div>`;
    h += `<div class="tp-p">收购价 ${F.priceOf(id)} 金币/个 · 点击查看详情</div>`;
    return h;
  }

  /* 发送任意内容（文本 / 图片 / 道具）到当前频道或私聊 */
  function sendPayload(p) {
    if (!S) S = F.Social;
    if (cur.indexOf('p:') === 0) S.sendPrivate(cur.slice(2), p);
    else S.send(cur, p);
    F.Audio2 && F.Audio2.blip && F.Audio2.blip(680, 0.07, 'sine', 0.05);
    render();
  }

  /* 图片文件 → 压缩后的 dataURL（避免聊天里塞原图） */
  function fileToImage(file, cb) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { F.UI.toast('请选择图片文件', 'bad'); F.Audio2.bad(); return; }
    const fr = new FileReader();
    fr.onerror = () => { F.UI.toast('图片读取失败', 'bad'); };
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => { F.UI.toast('图片解析失败', 'bad'); };
      im.onload = () => {
        try {
          const max = 720, k = Math.min(1, max / Math.max(im.width, im.height) || 1);
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(im.width * k));
          cv.height = Math.max(1, Math.round(im.height * k));
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          cb && cb(cv.toDataURL('image/jpeg', 0.72));
        } catch (e) { F.UI.toast('图片处理失败', 'bad'); }
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* 图片查看器（点击聊天里的图片放大） */
  function showImage(src) {
    let v = document.getElementById('cwviewer');
    if (!v) {
      v = document.createElement('div');
      v.id = 'cwviewer';
      v.className = 'cw-viewer';
      v.addEventListener('click', () => v.classList.remove('show'));
      document.body.appendChild(v);
    }
    v.innerHTML = '';
    const im = document.createElement('img');
    im.src = src;
    v.appendChild(im);
    v.classList.add('show');
  }

  /* 道具详情面板（点击聊天里的道具链接） */
  U2.panelChatItem = function (id, n) {
    const it = F.ITEMS[id] || { name: id, c: 0xcccccc };
    const e = F.EQUIP[id];
    const { body: pb } = F.UI.panelShell('物品详情 · ' + (it.name || id), '来自聊天消息的道具');
    F.UI.setPanel('chatitem');
    const head = F.el('div', 'pl-head');
    head.innerHTML =
      `<div class="pl-av" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')};font-size:13px">${(it.name || id)[0]}</div>
       <div class="pl-meta">
         <div class="pl-name">${it.name || id} <span class="pl-job">${F.qualityOf(id)}</span></div>
         <div class="pl-sub">类别：${F.catOf(id)} · 等级：${F.levelOf(id)}${n != null ? ' · 数量 ×' + n : ''}</div>
       </div>`;
    pb.appendChild(head);
    pb.appendChild(F.el('div', 'pcat', '说明'));
    pb.appendChild(F.el('div', 'tip', it.d || '（这件物品没有额外说明）'));
    pb.appendChild(F.el('div', 'pcat', '属性'));
    const kv = F.el('div', 'cards');
    const add = (k, v) => { const c = F.el('div', 'card'); c.innerHTML = `<div class="tt">${k}</div><div class="ds">${v}</div>`; kv.appendChild(c); };
    add('收购价', F.priceOf(id) + ' 金币/个');
    if (F.Game.foodOf(id)) add('食用恢复', F.Game.foodOf(id) + ' 点饥饿');
    if (F.Game.staminaOf(id)) add('食用恢复', F.Game.staminaOf(id) + ' 点体力');
    add('售卖总价', F.priceOf(id) * (n || 1) + ' 金币' + (n > 1 ? '（×' + n + '）' : ''));
    if (e && e.atk) add('攻击加成', '+' + e.atk);
    if (e && e.def) add('防御加成', '+' + e.def);
    if (k_equipable(id)) add('可装备', '在背包中点击「装备」');
    pb.appendChild(kv);
    const row = F.el('div', 'prow');
    row.innerHTML = `<button class="btn" id="ci-close">关闭</button>`;
    pb.appendChild(row);
    row.querySelector('#ci-close').onclick = () => F.UI.closePanel();
  };
  function k_equipable(id) { return !!(F.EQUIP && F.EQUIP[id]); }

  /* 弹出层容器 */
  function mkPop(title) {
    closePop();
    pop = F.el('div', 'cw-pop');
    if (title) pop.appendChild(F.el('div', 'cw-pop-t', title));
    win.appendChild(pop);
    return pop;
  }
  function closePop() {
    if (!pop) return;
    if (pop._stopCam) { try { pop._stopCam(); } catch (e) { } }
    if (pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
  }

  /* ---- 表情 ---- */
  function openEmoji() {
    if (pop && pop.dataset.k === 'emoji') { closePop(); return; }
    const p = mkPop('表情（点击插入到输入框）');
    p.dataset.k = 'emoji';
    const g = F.el('div', 'cw-emo');
    for (const e of EMOJIS) {
      const b = F.el('div', 'cw-e', e);
      b.onclick = () => {
        const room = 140 - input.value.length;
        if (room <= 0) { F.UI.toast('消息长度到上限了', 'info'); return; }
        input.value += e;
        input.focus();
      };
      g.appendChild(b);
    }
    p.appendChild(g);
  }

  /* ---- 图片（本地文件） ---- */
  /* 由 #cw-file change 事件驱动，见 buildChat */

  /* ---- 照片（摄像头拍摄） ---- */
  function openPhoto() {
    if (pop && pop.dataset.k === 'photo') { closePop(); return; }
    const p = mkPop('拍照发送');
    p.dataset.k = 'photo';
    p.innerHTML +=
      `<video id="cw-vid" playsinline muted autoplay></video>
       <div class="prow"><button class="btn ok" id="cw-shot">拍照发送</button><button class="btn" id="cw-pick">本地图片</button></div>
       <div class="cw-pop-tip" id="cw-camtip">正在请求摄像头…</div>`;
    const tip = p.querySelector('#cw-camtip');
    const vid = p.querySelector('#cw-vid');
    let stream = null;
    const stop = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } };
    p._stopCam = stop;
    p.querySelector('#cw-pick').onclick = () => { stop(); closePop(); fileEl && fileEl.click(); };
    p.querySelector('#cw-shot').onclick = () => {
      if (!vid.videoWidth) { F.UI.toast('摄像头还没准备好', 'bad'); return; }
      try {
        const cv = document.createElement('canvas');
        cv.width = vid.videoWidth; cv.height = vid.videoHeight;
        cv.getContext('2d').drawImage(vid, 0, 0);
        const src = cv.toDataURL('image/jpeg', 0.78);
        stop(); closePop();
        sendPayload({ type: 'img', src });
        F.UI.toast('照片已发送', 'ok');
      } catch (e) { F.UI.toast('拍照失败：' + e.message, 'bad'); }
    };
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      tip.textContent = '当前环境不支持摄像头，请点「本地图片」选择照片';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
      stream = s;
      vid.srcObject = s;
      const pl = vid.play(); if (pl && pl.catch) pl.catch(() => { });
      tip.textContent = '对准镜头后点「拍照发送」';
    }).catch(err => {
      tip.textContent = '无法打开摄像头（' + ((err && err.name) || '未知原因') + '），可点「本地图片」';
    });
  }

  /* ---- 背包 / 仓库道具 ---- */
  function openItems(source) {
    const key = 'item:' + source;
    if (pop && pop.dataset.k === key) { closePop(); return; }
    const dict = source === 'storage' ? (F.Game.storage || {}) : (F.Game.inv || {});
    const keys = Object.keys(dict).filter(k => (dict[k] || 0) > 0);
    const p = mkPop((source === 'storage' ? '仓库道具' : '背包道具') + '（点击发送道具链接，可悬浮查看详情）');
    p.dataset.k = key;
    const g = F.el('div', 'cw-ipick');
    if (!keys.length) g.innerHTML = `<div class="empty">${source === 'storage' ? '仓库是空的' : '背包是空的'}</div>`;
    for (const k of keys) {
      const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
      const d = F.el('div', 'cw-irow');
      d.dataset.tip = chatItemTip(k, dict[k]);
      d.innerHTML =
        `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
         <span class="nm">${it.name}</span><b>×${dict[k]}</b>`;
      d.onclick = () => {
        closePop();
        sendPayload({ type: 'item', item: k, n: dict[k], srcFrom: source });
        F.UI.toast('已发送道具：' + (it.name || k), 'ok');
      };
      g.appendChild(d);
    }
    p.appendChild(g);
  }

  U2.openChat = function (tab) {
    buildChat();
    if (tab) { cur = tab; closePop(); if (tab.indexOf('p:') === 0 && !S.privates[tab.slice(2)]) S.privates[tab.slice(2)] = []; }
    win.style.display = 'flex';
    renderTabs(); render();
  };
  U2.closeChat = function () { closePop(); if (win) win.style.display = 'none'; };
  U2.toggleChat = function () { if (!win || win.style.display === 'none') U2.openChat(); else U2.closeChat(); };

  /* ============================ 好友面板 ============================ */
  let ctxMenu = null;
  function closeCtx() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  addEventListener('mousedown', e => { if (ctxMenu && !ctxMenu.contains(e.target)) closeCtx(); });

  U2.panelFriends = function () {
    const { body: pb } = F.UI.panelShell('好友', '右击好友 → 聊天 / 组队 / 公会邀请 · [K] 开关');
    F.UI.setPanel('friends');
    const list = F.el('div', 'friends');
    for (const fr of S.friends) {
      const row = F.el('div', 'frow' + (fr.online ? ' on' : ''));
      row.innerHTML = `<span class="dot" style="background:${fr.online ? '#5ac07a' : '#8a9490'}"></span>
        <span class="fn">${fr.name}</span><span class="fj">${fr.job}</span><span class="fl">Lv.${fr.lv}</span>
        <span class="fs">${fr.online ? '在线' : '离线'}</span>`;
      row.oncontextmenu = e => {
        e.preventDefault();
        closeCtx();
        ctxMenu = F.el('div', 'ctxmenu');
        ctxMenu.style.left = e.clientX + 'px';
        ctxMenu.style.top = e.clientY + 'px';
        const mk = (label, fn) => { const b = F.el('div', 'ctxitem', label); b.onclick = () => { closeCtx(); fn(); }; ctxMenu.appendChild(b); };
        mk('聊天', () => { U2.openChat('p:' + fr.name); F.UI.closePanel(); });
        mk('邀请组队', () => S.inviteParty(fr.name));
        mk('邀请入会', () => S.inviteGuild(fr.name));
        mk('查看装备', () => U2.panelPlayer(fr.name));
        document.body.appendChild(ctxMenu);
      };
      /* 左键点击（或点头像）直接查看该玩家详情 */
      row.onclick = () => U2.panelPlayer(fr.name);
      list.appendChild(row);
    }
    pb.appendChild(list);
    const row2 = F.el('div', 'prow');
    row2.innerHTML = `<button class="btn ok" id="pf-chat">打开聊天窗 (T)</button><button class="btn" id="pf-party">我的队伍</button>`;
    pb.appendChild(row2);
    row2.querySelector('#pf-chat').onclick = () => { F.UI.closePanel(); U2.openChat(); };
    row2.querySelector('#pf-party').onclick = () => U2.panelParty();
  };

  /* ============================ 公会面板 ============================ */
  U2.panelGuild = function () {
    const g = S.guild;
    const { body: pb } = F.UI.panelShell('公会：' + g.name, '采集 / 挖矿 / 钓鱼 / 战斗 / 制作都会产生公会经验');
    F.UI.setPanel('guild');

    const head = F.el('div', 'pstat',
      `等级 ${g.level} 级 · 成员 ${g.members.length}/${S.guildCap()} 人 · 会长：你`);
    pb.appendChild(head);

    /* 经验条：0/5000000 + 百分比 + 升级按钮 + 帮助 */
    const need = S.guildNeed();
    const pct = (g.xp / need * 100);
    const barRow = F.el('div', 'gxp');
    barRow.innerHTML =
      `<div class="gxp-bar"><i style="width:${Math.min(100, pct).toFixed(3)}%"></i></div>
       <span class="gxp-num">${g.xp} / ${need}</span>
       <span class="gxp-pct">${pct.toFixed(3)}%</span>`;
    pb.appendChild(barRow);
    const btnRow = F.el('div', 'prow');
    btnRow.innerHTML =
      `<button class="btn ok" id="pg-up" ${g.xp >= need ? '' : 'disabled'}>升级公会</button>
       <span class="help-q" id="pg-help" title="">❓️</span>`;
    pb.appendChild(btnRow);
    btnRow.querySelector('#pg-up').onclick = () => { if (S.upgradeGuild()) U2.panelGuild(); };
    const hq = btnRow.querySelector('#pg-help');
    hq.style.cssText = 'color:#4aa8f0;cursor:help;font-size:18px;line-height:34px';
    hq.onclick = () => F.UI.toast('公会经验：成员的每次采集 / 挖矿 / 钓鱼 / 战斗 / 副职业制作都会 +1；副本通关额外 +500。0 级升 1 级需要 ' + need + ' 点，每级成员上限 +5。', 'info');

    /* 公告（可编辑） */
    pb.appendChild(F.el('div', 'pcat', '公会公告（可编辑）'));
    const ta = F.el('textarea', 'gnotice');
    ta.value = g.notice;
    ta.rows = 4;
    pb.appendChild(ta);
    const saveRow = F.el('div', 'prow');
    saveRow.innerHTML = `<button class="btn" id="pg-save">保存公告</button><span class="tip">公告对所有成员可见</span>`;
    pb.appendChild(saveRow);
    saveRow.querySelector('#pg-save').onclick = () => { S.setNotice(ta.value); F.UI.toast('公会公告已保存', 'ok'); };

    /* 成员 */
    pb.appendChild(F.el('div', 'pcat', '成员列表'));
    const ml = F.el('div', 'friends');
    for (const m of g.members.slice(0, 60)) {
      const row = F.el('div', 'frow' + (m.online ? ' on' : ''));
      row.innerHTML = `<span class="dot" style="background:${m.online ? '#5ac07a' : '#8a9490'}"></span>
        <span class="fn">${m.name}</span><span class="fj">${m.job}</span><span class="fl">Lv.${m.lv}</span><span class="fs">${m.online ? '在线' : '离线'}</span>`;
      ml.appendChild(row);
    }
    pb.appendChild(ml);
  };

  /* ============================ 组队面板 ============================ */
  U2.panelParty = function () {
    const { body: pb } = F.UI.panelShell('我的队伍', '队伍最多 5 人 · 组队进入副本有金币加成');
    F.UI.setPanel('party');
    const list = F.el('div', 'friends');
    for (const m of S.party.members) {
      const row = F.el('div', 'frow on');
      row.innerHTML = `<span class="dot" style="background:${m.self ? '#f0c840' : '#5ac07a'}"></span>
        <span class="fn">${m.name}${m.self ? '（你）' : ''}</span><span class="fj">${m.job || '农夫'}</span>
        <span class="fl">Lv.${m.lv}</span><span class="fs">${m.self ? '队长' : '成员'}</span>`;
      if (!m.self) {
        row.oncontextmenu = e => {
          e.preventDefault();
          closeCtx();
          ctxMenu = F.el('div', 'ctxmenu');
          ctxMenu.style.left = e.clientX + 'px'; ctxMenu.style.top = e.clientY + 'px';
          const b = F.el('div', 'ctxitem', '移出队伍');
          b.onclick = () => { closeCtx(); S.kickParty(m.name); U2.panelParty(); };
          ctxMenu.appendChild(b);
          document.body.appendChild(ctxMenu);
        };
      }
      list.appendChild(row);
    }
    pb.appendChild(list);
    pb.appendChild(F.el('div', 'pcat', '邀请在线好友'));
    const inv = F.el('div', 'items');
    for (const fr of S.friends) {
      if (!fr.online) continue;
      const row = F.el('div', 'item');
      row.innerHTML = `<span class="nm">${fr.name}</span><b>Lv.${fr.lv}</b>`;
      const b = F.el('div', 'mini', '邀请');
      b.onclick = () => { S.inviteParty(fr.name); U2.panelParty(); };
      row.appendChild(b);
      inv.appendChild(row);
    }
    pb.appendChild(inv);
    const row2 = F.el('div', 'prow');
    row2.innerHTML = `<button class="btn" id="pp-leave">解散队伍</button><button class="btn ok" id="pp-dun">前往副本传送门</button>`;
    pb.appendChild(row2);
    row2.querySelector('#pp-leave').onclick = () => { S.leaveParty(); U2.panelParty(); };
    row2.querySelector('#pp-dun').onclick = () => {
      const V = F.Village;
      if (!V || !V.portal) { F.UI.toast('还没找到世界塔', 'bad'); return; }
      F.UI.closePanel();
      F.Game.autoTo(V.portal.x, V.portal.z + 4, '前往世界塔传送门', null);
    };
  };

  /* ============================ 拍卖行 ============================ */
  const FILTER = { q: '', quality: '全部', cat: '全部', lv: '全部', sort: 'new', tab: 'sale', days: '7' };
  const qnClass = q => ' qn-' + (F.QUALITIES.indexOf(q) >= 0 ? q : '普通');

  U2.panelAuction = function (viaNpc, tab) {
    FILTER.tab = tab || FILTER.tab || 'sale';
    const feeRate = viaNpc ? 0.008 : 0.01;
    const { body: pb } = F.UI.panelShell('拍卖行（交易行）',
      `税收 20%（成交后扣除） · 上架手续费 ${(feeRate * 100).toFixed(1)}%${viaNpc ? '（拍卖师处减免 20%）' : ''}`);
    F.UI.setPanel('auction');
    const refresh = () => { U2.panelAuction(viaNpc); };

    /* 标签页：在售 / 我的上架 / 已售记录 */
    const tabs = F.el('div', 'ranktabs');
    for (const [id, label] of [['sale', '在售'], ['mine', '我的上架'], ['sold', '已售记录']]) {
      const d = F.el('div', 'rt' + (FILTER.tab === id ? ' on' : ''), label);
      d.onclick = () => U2.panelAuction(viaNpc, id);
      tabs.appendChild(d);
    }
    pb.appendChild(tabs);

    const rowHtml = (l, btn) => {
      const it = F.ITEMS[l.item] || { name: l.item, c: 0xcccccc };
      const d = F.el('div', 'ah-row' + (l.mine ? ' mine' : ''));
      d.dataset.tip = `<div class="tp-n">${it.name} <span>×${l.n}</span></div>
        <div class="tp-d">品质：${l.q} · 类别：${l.cat} · 等级：${l.lv}</div>
        <div class="tp-d">${it.d || ''}</div>
        <div class="tp-p">单价 ${l.price} 金币 · 卖家 ${l.seller}</div>`;
      d.innerHTML =
        `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
         <span class="ah-n${qnClass(l.q)}">${it.name}</span>
         <span class="ah-q q-${l.q}">${l.q}</span>
         <span class="ah-c">${l.cat}</span>
         <span class="ah-l">Lv.${l.lv}</span>
         <span class="ah-c2">×${l.n}</span>
         <span class="ah-p">${l.price}</span>
         <span class="ah-s">${l.seller}</span>`;
      if (btn) {
        const b = F.el('div', 'mini' + (btn.buy ? ' buy' : ''), btn.label);
        b.onclick = e => { e.stopPropagation(); btn.fn(); refresh(); };
        d.appendChild(b);
      }
      return d;
    };

    /* ---- 在售 ---- */
    if (FILTER.tab === 'sale') {
      const bar = F.el('div', 'filters');
      bar.innerHTML =
        `<input id="pa-q" placeholder="搜索物品 / 卖家…" value="${FILTER.q}">
         <select id="pa-c">${opt(['全部', '武器', '防具', '首饰', '材料', '消耗品'], FILTER.cat)}</select>
         <select id="pa-q2">${opt(['全部'].concat(F.QUALITIES), FILTER.quality)}</select>
         <select id="pa-lv">${opt(['全部', '1-10', '11-20', '21-30', '31-99'], FILTER.lv)}</select>
         <select id="pa-s">${opt2([['new', '最新'], ['priceAsc', '价格↑'], ['priceDesc', '价格↓']], FILTER.sort)}</select>`;
      pb.appendChild(bar);
      const q = bar.querySelector('#pa-q'), selC = bar.querySelector('#pa-c'), selQ = bar.querySelector('#pa-q2'),
        selL = bar.querySelector('#pa-lv'), selS = bar.querySelector('#pa-s');
      q.onchange = () => { FILTER.q = q.value; refresh(); };
      q.oninput = () => { FILTER.q = q.value; refresh(); };
      selC.onchange = () => { FILTER.cat = selC.value; refresh(); };
      selQ.onchange = () => { FILTER.quality = selQ.value; refresh(); };
      selL.onchange = () => { FILTER.lv = selL.value; refresh(); };
      selS.onchange = () => { FILTER.sort = selS.value; refresh(); };

      pb.appendChild(F.el('div', 'pcat', '在售商品'));
      const rows = S.query(FILTER);
      const grid = F.el('div', 'ah');
      if (!rows.length) grid.innerHTML = '<div class="empty">没有符合条件的商品</div>';
      for (const l of rows.slice(0, 40)) {
        grid.appendChild(rowHtml(l, l.mine
          ? { label: '取回', fn: () => S.cancel(l.id) }
          : { label: '购买', buy: true, fn: () => S.buy(l.id) }));
      }
      pb.appendChild(grid);
    }

    /* ---- 我的上架（上架 + 取回） ---- */
    if (FILTER.tab === 'mine') {
      pb.appendChild(F.el('div', 'pcat', '上架物品'));
      const inv = F.Game.inv;
      const keys = Object.keys(inv).filter(k => inv[k] > 0);
      const form = F.el('div', 'prow');
      form.innerHTML = `<select id="pa-item">${keys.length ? keys.map(k => `<option value="${k}">${F.itemName(k)}（持有 ${inv[k]}）</option>`).join('') : '<option>背包为空</option>'}</select>
        <input id="pa-n" type="number" min="1" value="1" style="width:64px">
        <input id="pa-price" type="number" min="1" value="50" style="width:88px">
        <button class="btn ok" id="pa-list">上架</button>`;
      pb.appendChild(form);
      if (keys.length) {
        form.querySelector('#pa-item').onchange = e => {
          form.querySelector('#pa-price').value = Math.max(1, Math.round((F.priceOf(e.target.value) || 5) * 3));
        };
        form.querySelector('#pa-list').onclick = () => {
          const item = form.querySelector('#pa-item').value;
          const n = Math.max(1, parseInt(form.querySelector('#pa-n').value || '1', 10));
          const price = Math.max(1, parseInt(form.querySelector('#pa-price').value || '1', 10));
          if (S.list(item, n, price, viaNpc)) refresh();
        };
      }
      pb.appendChild(F.el('div', 'pcat', '我的寄售（点击「取回」收回物品）'));
      const mine = S.listings.filter(l => l.mine).sort((a, b) => b.id - a.id);
      const grid = F.el('div', 'ah');
      if (!mine.length) grid.innerHTML = '<div class="empty">暂无寄售物品</div>';
      for (const l of mine) grid.appendChild(rowHtml(l, { label: '取回', fn: () => S.cancel(l.id) }));
      pb.appendChild(grid);
    }

    /* ---- 已售记录（近 7 / 30 / 365 天 + 收入统计） ---- */
    if (FILTER.tab === 'sold') {
      const days = parseInt(FILTER.days, 10);
      const bar = F.el('div', 'filters');
      bar.innerHTML = `<select id="pa-days">${opt2([['7', '近 7 天'], ['30', '近 30 天'], ['365', '近 365 天']], FILTER.days)}</select>`;
      pb.appendChild(bar);
      bar.querySelector('#pa-days').onchange = e => { FILTER.days = e.target.value; refresh(); };

      const rows = S.soldList(days);
      pb.appendChild(F.el('div', 'pcat', '已售物品（含购买人）'));
      const grid = F.el('div', 'ah');
      if (!rows.length) grid.innerHTML = '<div class="empty">该时间段内没有售出记录</div>';
      const today = F.Game.day || 1;
      for (const sRec of rows.slice(0, 60)) {
        const it = F.ITEMS[sRec.item] || { name: sRec.item, c: 0xcccccc };
        const d = F.el('div', 'ah-row sold');
        const q = F.qualityOf(sRec.item);
        d.dataset.tip = `<div class="tp-n">${it.name} ×${sRec.n}</div>
          <div class="tp-d">成交价 ${sRec.price} 金币/件 · 总收入 ${sRec.price * sRec.n} 金币 · 税后到账 ${Math.round(sRec.price * sRec.n * 0.8)} 金币</div>`;
        d.innerHTML =
          `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
           <span class="ah-n${qnClass(q)}">${it.name}</span>
           <span class="ah-q q-${q}">${q}</span>
           <span class="ah-c2">×${sRec.n}</span>
           <span class="ah-p">${sRec.price * sRec.n}</span>
           <span class="ah-b">买家 ${sRec.buyer}</span>
           <span class="ah-s">${today === sRec.day ? '今天' : today - sRec.day + ' 天前'}</span>`;
        grid.appendChild(d);
      }
      pb.appendChild(grid);

      /* 右下角收入统计 */
      const st = S.soldStats(days);
      const sum = F.el('div', 'sold-sum');
      sum.innerHTML =
        `<div class="ss-row">总计收入：<b>${st.gross}</b> 金币</div>
         <div class="ss-row">税收（市场税收 20%）：-<b>${st.tax}</b> 金币</div>
         <div class="ss-row ss-net">税后收入：<b>${st.net}</b> 金币</div>`;
      pb.appendChild(sum);
    }

    if (FILTER.tab === 'sale') {
      pb.appendChild(F.el('div', 'tip',
        `上架请切换到「我的上架」；成交后系统收取 20% 税收，卖家到账 80%。`));
    }
  };

  function opt(arr, cur) {
    return arr.map(v => `<option ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
  }
  function opt2(arr, cur) {
    return arr.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
  }

  /* ============================ 商人商店 ============================ */
  U2.panelShop = function (npcId) {
    const sh = F.SHOPS[npcId];
    if (!sh) return;
    const { body: pb } = F.UI.panelShell(sh.name, sh.tip);
    F.UI.setPanel('shop');
    pb.appendChild(F.el('div', 'pstat', '持有金币：' + F.Game.coins));

    if (npcId === 'auctioneer') {
      pb.appendChild(F.el('div', 'pcat', '拍卖服务'));
      const row = F.el('div', 'prow');
      row.innerHTML = `<button class="btn ok" id="ps-ah">打开拍卖行（手续费 -20%）</button>
        <button class="btn" id="ps-ticket">购买副本门票（200 金币）</button>`;
      pb.appendChild(row);
      row.querySelector('#ps-ah').onclick = () => U2.panelAuction(true);
      row.querySelector('#ps-ticket').onclick = () => { F.Village.buy('material', 'ticket', 1); U2.panelShop(npcId); };
      pb.appendChild(F.el('div', 'tip', '系统拍卖界面上架手续费 1%，在拍卖师处上架仅 0.8%。'));
      return;
    }

    pb.appendChild(F.el('div', 'pcat', sh.cat + ' · 出售'));
    const grid = F.el('div', 'items');
    for (const k in sh.price) {
      const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
      const d = F.el('div', 'item');
      d.dataset.tip = `<div class="tp-n">${it.name}</div><div class="tp-d">${it.d || ''}</div>
        <div class="tp-d">${F.EQUIP[k] ? '品质：' + F.EQUIP[k].q + ' · 等级：' + F.EQUIP[k].lv + (F.EQUIP[k].atk ? ' · 攻击 +' + F.EQUIP[k].atk : '') + (F.EQUIP[k].def ? ' · 防御 +' + F.EQUIP[k].def : '') : ''}</div>
        <div class="tp-p">售价 ${sh.price[k]} 金币</div>`;
      d.innerHTML = `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
        <span class="nm">${it.name}</span><b>${sh.price[k]}金</b>`;
      const b1 = F.el('div', 'mini', '买1');
      b1.onclick = () => { F.Village.buy(npcId, k, 1); U2.panelShop(npcId); };
      const b10 = F.el('div', 'mini', '买10');
      b10.onclick = () => { F.Village.buy(npcId, k, 10); U2.panelShop(npcId); };
      d.appendChild(b1); d.appendChild(b10);
      grid.appendChild(d);
    }
    pb.appendChild(grid);

    /* ---------------- 收购：把背包物资卖给商人（主营品类多给 15%） ---------------- */
    /* 向上取整：哪怕是最便宜的物资，主营商人也至少多给 1 金币 */
    const unitOf = (k) => Math.max(1, Math.ceil((F.priceOf(k) || 0) * (sh.price[k] ? 1.15 : 1)));
    let totPrice = 0;
    const sellables = [];
    for (const k in F.Game.inv) {
      const n = F.Game.inv[k] || 0;
      if (!n || k === 'coins') continue;
      const base = F.priceOf(k) || 0;
      if (base <= 0) continue;
      if (F.TOOLSK && F.TOOLSK[k]) continue;                     /* 工具不卖 */
      if (F.EQUIP && F.EQUIP[k] && F.Game.equip && Object.keys(F.Game.equip).some(s => F.Game.equip[s] === k)) continue;
      sellables.push(k);
      totPrice += unitOf(k) * n;
    }
    pb.appendChild(F.el('div', 'pcat', '收购 · ' + sh.cat + '主营的物资多给 15%'));
    const doSell = (k, n) => {
      const n2 = Math.min(n, F.Game.inv[k] || 0);
      if (n2 <= 0) return;
      const gold = unitOf(k) * n2;
      F.Game.take(k, n2);
      F.Game.addCoins(gold);
      F.Audio2.ok();
      F.UI.toast('卖给' + sh.name.split(' · ').pop() + '：' + F.itemName(k) + ' ×' + n2 + '，+' + gold + ' 金币', 'ok');
      if (F.Social) F.Social.sys('交易：你把 ' + F.itemName(k) + ' ×' + n2 + ' 卖给了' + sh.name + '。');
    };
    if (sellables.length) {
      const g2 = F.el('div', 'items');
      for (const k of sellables) {
        const n = F.Game.inv[k] || 0;
        const it = F.ITEMS[k] || { name: k, c: 0xcccccc };
        const unit = unitOf(k);
        const d = F.el('div', 'item');
        d.dataset.tip = `<div class="tp-n">${it.name} <span>×${n}</span></div>
          <div class="tp-d">${it.d || ''}</div>
          <div class="tp-d">${sh.price[k] ? sh.cat + '主营：收购价 +15%' : '非主营品类'}</div>
          <div class="tp-p">收购价 ${unit} 金币 / 个（全部 ${n} 个共 ${unit * n} 金币）</div>`;
        d.innerHTML = `<span class="sw" style="background:#${(it.c || 0xcccccc).toString(16).padStart(6, '0')}"></span>
          <span class="nm">${it.name}</span><span class="nn">${n}</span><b>${unit}金</b>`;
        const b1 = F.el('div', 'mini', '卖1');
        b1.onclick = () => { doSell(k, 1); U2.panelShop(npcId); };
        const b2 = F.el('div', 'mini', '全卖');
        b2.onclick = () => { doSell(k, n); U2.panelShop(npcId); };
        d.appendChild(b1); d.appendChild(b2);
        g2.appendChild(d);
      }
      pb.appendChild(g2);
      const bullet = F.el('div', 'prow');
      bullet.innerHTML = `<button class="btn ok" id="ps-all">一键售出全部物资（约 ${totPrice} 金币）</button>`;
      pb.appendChild(bullet);
      bullet.querySelector('#ps-all').onclick = () => {
        const list = sellables.slice();
        for (const k of list) doSell(k, F.Game.inv[k] || 0);
        U2.panelShop(npcId);
      };
    } else {
      pb.appendChild(F.el('div', 'empty', '背包里暂时没有可出售的物资（工具与已装备的装备不会被卖掉）'));
    }

    /* 炼金师：炼金配方 */
    if (npcId === 'alchemist') {
      pb.appendChild(F.el('div', 'pcat', '炼金制作（大世界材料 + 系统材料）'));
      const cg = F.el('div', 'cards');
      for (const r of F.ALCHEMY) {
        const c = F.el('div', 'card');
        const ok = F.Game.canAfford(r.cost);
        c.dataset.tip = `<div class="tp-n">${r.name} ×${r.out}</div><div class="tp-d">${r.desc}</div>
          <div class="tp-p">配方：${Object.keys(r.cost).map(k => F.itemName(k) + '×' + r.cost[k]).join('、')}</div>`;
        c.innerHTML = `<div class="ic">${r.name[0]}</div><div class="tt">${r.name} ×${r.out}</div>
          <div class="ct ${ok ? '' : 'no'}">${Object.keys(r.cost).map(k => F.itemName(k) + '×' + r.cost[k]).join(' ')}</div>
          <div class="ds">${r.desc}</div>`;
        c.onclick = () => {
          if (!F.Game.spend(r.cost)) { F.UI.toast('材料不足', 'bad'); F.Audio2.bad(); return; }
          F.Game.give(r.id, r.out);
          F.Audio2.ok();
          F.UI.toast('炼金成功：' + r.name + ' ×' + r.out, 'ok');
          if (F.Game.addGuildXp) F.Game.addGuildXp(1);   /* 副职业制作 +1 公会经验 */
          F.Game.addSkill('alchemy', 3);                 /* 炼金熟练度 */
          U2.panelShop(npcId);
        };
        cg.appendChild(c);
      }
      pb.appendChild(cg);
    }
  };

  /* ============================ 村口公告板：名人堂 + 悬赏委托 ============================ */
  U2.boardTab = 'rank';
  U2.boardCat = 'total';

  U2.panelBoard = function (tab) {
    const Q = F.Quest, R = F.Rank;
    U2.boardTab = tab || U2.boardTab || 'rank';
    const { body: pb } = F.UI.panelShell('村口公告板',
      '名人堂：各榜单前三名 · 悬赏委托：完成后领取随机奖励');
    F.UI.setPanel('board');
    const refresh = () => U2.panelBoard();

    const tabs = F.el('div', 'ranktabs');
    for (const [id, nm] of [['rank', '名人堂 · 榜单前三'], ['quest', '悬赏委托']]) {
      const t = F.el('div', 'rt' + (U2.boardTab === id ? ' on' : ''), nm);
      t.onclick = () => U2.panelBoard(id);
      tabs.appendChild(t);
    }
    pb.appendChild(tabs);

    /* ---------------- 名人堂：动态前三名卡片 ---------------- */
    if (U2.boardTab === 'rank') {
      const cats = F.el('div', 'ranktabs');
      for (const c of R.cats) {
        const t = F.el('div', 'rt' + (c.id === U2.boardCat ? ' on' : ''), c.icon + ' ' + c.name);
        t.onclick = () => { U2.boardCat = c.id; refresh(); };
        cats.appendChild(t);
      }
      pb.appendChild(cats);

      const c = R.cat(U2.boardCat);
      const all = R.list(U2.boardCat);
      pb.appendChild(F.el('div', 'pstat',
        `${c.name}榜 · 前三名（每 2.5 秒自动刷新，随众人产出实时变动）· 共 ${all.length} 人上榜`));
      const wrap = F.el('div', 'cards');
      const medal = ['🥇', '🥈', '🥉'];
      const crown = ['gold', 'silver', 'bronze'];
      all.slice(0, 3).forEach((it, i) => {
        const p = it.p;
        const card = F.el('div', 'card bd-card ' + crown[i]);
        card.dataset.tip = `<div class="tp-n">第 ${i + 1} 名 ${p.self ? '（你）' : ''}${p.self ? '' : p.name}</div>
          <div class="tp-d">${p.job} · ${p.guild}</div>
          <div class="tp-p">${c.fmt(it.score, p)} · 点击查看人物信息（装备 / 工具熟练度 / 全部技能）</div>`;
        card.innerHTML =
          `<div class="bd-m">${medal[i]}</div>
           <div class="pl-av" style="background:${p.avatar.bg}">${p.avatar.ch}</div>
           <div class="tt">${p.self ? '你' : p.name}</div>
           <div class="ds">${p.job} · ${p.guild}</div>
           <div class="ds">综合等级 Lv.${R.totalLv(p)}</div>
           <div class="ds bd-score">${c.fmt(it.score, p)}</div>`;
        card.onclick = () => U2.panelPlayer(p.name, U2.boardCat);
        wrap.appendChild(card);
      });
      pb.appendChild(wrap);
      const idx = all.findIndex(x => x.p.self);
      pb.appendChild(F.el('div', 'tip',
        (idx >= 0 ? `你在本榜第 ${idx + 1} 名（${c.fmt(all[idx].score, all[idx].p)}）` : '你还没进榜，继续产出吧') +
        '；点击任意卡片即可查看该玩家的人物信息面板。'));
    } else {
      /* ---------------- 悬赏委托 ---------------- */
      pb.appendChild(F.el('div', 'pstat',
        `可接取 ${Q.board.length} 条 · 进行中 ${Q.doing.length}/${Q.MAX} · 累计完成 ${Q.done} 条（奖金 ${Q.plus} 金币） · 约 ${Math.ceil(Q.t)} 秒后刷新`));

      if (Q.doing.length) {
        pb.appendChild(F.el('div', 'pcat', '进行中的委托'));
        const list = F.el('div', 'friends');
        for (const q of Q.doing) {
          const pr = Q.prog(q), done = pr >= q.need;
          const pct = Math.round(clamp(pr / q.need, 0, 1) * 100);
          const row = F.el('div', 'frow qrow');
          row.innerHTML =
            `<div class="fav">${q.icon}</div>
             <div class="fmeta">
               <div class="fn">${q.title} <span class="qgn">${'★'.repeat(q.tier)}</span></div>
               <div class="fs">${q.desc}</div>
               <div class="fs">随机奖励：${Q.rewardText(q.reward || { coins: 0, items: [], xp: 0 })}</div>
               <div class="fs">进度 ${pr}/${q.need}</div>
               <div class="bd-bar"><i style="width:${pct}%"></i></div>
             </div>`;
          if (done) {
            const b = F.el('div', 'mini buy', '领取');
            b.onclick = () => { if (Q.claim(q.id)) refresh(); };
            row.appendChild(b);
          }
          const x = F.el('div', 'mini', '放弃');
          x.onclick = () => { Q.drop(q.id); refresh(); };
          row.appendChild(x);
          list.appendChild(row);
        }
        pb.appendChild(list);
      }

      pb.appendChild(F.el('div', 'pcat', '可接取的委托（奖励在接取瞬间随机生成）'));
      const list2 = F.el('div', 'friends');
      if (!Q.board.length) list2.innerHTML = '<div class="empty">今天暂时没有新委托了，过一会儿再来</div>';
      for (const q of Q.board) {
        const row = F.el('div', 'frow qrow');
        row.innerHTML =
          `<div class="fav">${q.icon}</div>
           <div class="fmeta">
             <div class="fn">${q.title} <span class="qgn">${'★'.repeat(q.tier)}</span></div>
             <div class="fs">${q.desc}</div>
             <div class="fs">奖励随机：金币 + 物资 + 熟练度（星级越高越丰厚）</div>
           </div>`;
        const b = F.el('div', 'mini buy', '接取');
        b.onclick = () => { Q.accept(q.id); refresh(); };
        row.appendChild(b);
        list2.appendChild(row);
      }
      pb.appendChild(list2);

      if (Q.log.length) {
        pb.appendChild(F.el('div', 'pcat', '完成记录'));
        const h = F.el('div', 'friends');
        for (const r of Q.log.slice(0, 8)) {
          const d = F.el('div', 'frow');
          d.innerHTML = `<div class="fav">✓</div><div class="fmeta"><div class="fn">${r.title}</div>
            <div class="fs">第 ${r.day} 天 · 奖金 ${r.coins} 金币${r.items ? ' · ' + r.items : ''}</div></div>`;
          h.appendChild(d);
        }
        pb.appendChild(h);
      }
      pb.appendChild(F.el('div', 'tip',
        '委托由公告板随机发布（采集 / 狩猎 / 渔获 / 农事 / 畜牧 / 营造 / 供货 / 世界塔）。同时最多接取 ' +
        Q.MAX + ' 条，奖励在**接取时**随机生成金币、物资与熟练度；完成后回这里领取。'));
    }
  };

  /* ============================ 黑市：摆摊 / 面对面交易 ============================ */
  U2.bmTab = 'stall';
  U2.panelBlackMarket = function (tab) {
    const M = F.BMarket;
    U2.bmTab = tab || U2.bmTab || 'stall';
    const { body: pb } = F.UI.panelShell('黑市',
      '摆摊寄卖 / 与在场的人面对面交易 · 成交税费 ' + Math.round(M.TAX * 100) + '%（买方承担，直接回收）');
    F.UI.setPanel('blackmarket');
    const refresh = () => U2.panelBlackMarket();

    const tabs = F.el('div', 'ranktabs');
    for (const [id, nm] of [['stall', '摆摊'], ['face', '面对面交易'], ['log', '流水与规则']]) {
      const t = F.el('div', 'rt' + (U2.bmTab === id ? ' on' : ''), nm);
      t.onclick = () => U2.panelBlackMarket(id);
      tabs.appendChild(t);
    }
    pb.appendChild(tabs);
    pb.appendChild(F.el('div', 'pstat',
      `金币 ${F.Game.coins} · 我的摊位 ${M.mine.length} 件 · 已成交 ${M.deals} 笔 · 累计回收税费 ${M.destroyed} 金币`));

    /* ---------------- 摆摊 ---------------- */
    if (U2.bmTab === 'stall') {
      pb.appendChild(F.el('div', 'pcat', '我的摊位'));
      const mine = F.el('div', 'friends');
      if (!M.mine.length) mine.innerHTML = '<div class="empty">摊位空着呢，先在下面挂点货</div>';
      for (const l of M.mine) {
        const r = F.el('div', 'frow');
        r.innerHTML = `<div class="fav">摊</div><div class="fmeta">
          <div class="fn">${F.itemName(l.item)} ×${l.n}</div>
          <div class="fs">单价 ${l.price} 金币 · 全额到账 ${l.price * l.n} 金币（税费由买方承担）</div></div>`;
        const b = F.el('div', 'mini', '收摊');
        b.onclick = () => { M.cancel(l.id); refresh(); };
        r.appendChild(b);
        mine.appendChild(r);
      }
      pb.appendChild(mine);

      pb.appendChild(F.el('div', 'pcat', '挂出新货'));
      const invOpts = [];
      for (const k in F.Game.inv) {
        const n = F.Game.inv[k] || 0;
        if (!n || k === 'coins') continue;
        if ((F.priceOf(k) || 0) <= 0) continue;
        if (F.TOOLSK && F.TOOLSK[k]) continue;
        invOpts.push(k);
      }
      if (!invOpts.length) {
        pb.appendChild(F.el('div', 'empty', '背包里没有可上架的物资（工具不能摆摊）'));
      } else {
        const row = F.el('div', 'prow');
        row.innerHTML =
          `<select id="bm-item" class="sel">${invOpts.map(k => `<option value="${k}">${F.itemName(k)}（持有 ${F.Game.inv[k]}）</option>`).join('')}</select>
           <input id="bm-n" class="inp" type="number" min="1" value="1" title="数量">
           <input id="bm-price" class="inp" type="number" min="1" value="1" title="单价（金币）">
           <button class="btn ok" id="bm-post">上架</button>`;
        pb.appendChild(row);
        const sync = () => {
          const sel = row.querySelector('#bm-item');
          row.querySelector('#bm-n').max = String(F.Game.inv[sel.value] || 1);
          if (!row.querySelector('#bm-price').value || Number(row.querySelector('#bm-price').value) <= 0) {
            row.querySelector('#bm-price').value = M.suggestion(sel.value);
          }
        };
        const selEl = row.querySelector('#bm-item');
        selEl.onchange = () => {
          row.querySelector('#bm-n').max = String(F.Game.inv[selEl.value] || 1);
          row.querySelector('#bm-price').value = M.suggestion(selEl.value);
        };
        sync();
        row.querySelector('#bm-post').onclick = () => {
          const item = selEl.value;
          const n = clamp(Math.floor(Number(row.querySelector('#bm-n').value) || 1), 1, F.Game.inv[item] || 1);
          const price = Math.max(1, Math.floor(Number(row.querySelector('#bm-price').value) || 1));
          if (M.list(item, n, price)) refresh();
        };
      }

      pb.appendChild(F.el('div', 'pcat', '别人的摊位（可直接买走）'));
      const others = F.el('div', 'friends');
      if (!M.others.length) others.innerHTML = '<div class="empty">暂时没有其他摊位</div>';
      for (const l of M.others) {
        const total = l.price * l.n, tax = Math.round(total * M.TAX);
        const r = F.el('div', 'frow');
        r.innerHTML = `<div class="fav">${l.seller.slice(0, 1)}</div><div class="fmeta">
          <div class="fn">${F.itemName(l.item)} ×${l.n} <span class="qgn">${l.seller}</span></div>
          <div class="fs">单价 ${l.price} · 货款 ${total} 金币 · 税费 ${tax} → 实付 ${total + tax} 金币</div></div>`;
        const b = F.el('div', 'mini buy', '买下');
        b.onclick = () => { M.buyStall(l.id); refresh(); };
        r.appendChild(b);
        others.appendChild(r);
      }
      pb.appendChild(others);
      pb.appendChild(F.el('div', 'tip', '挂在摊位上的货会被路人陆续买走，卖家按单价全额到账；' +
        Math.round(M.TAX * 100) + '% 税费由买方额外支付，并直接从经济系统中回收。'));
    }

    /* ---------------- 面对面交易 ---------------- */
    if (U2.bmTab === 'face') {
      pb.appendChild(F.el('div', 'pcat', '在场的人（选中后进行面对面交易）'));
      const pl = F.el('div', 'friends');
      for (const p of M.peeps) {
        const r = F.el('div', 'frow' + (p.name === M.cur ? ' on' : ''));
        r.innerHTML = `<div class="fav">${p.name.slice(-1)}</div><div class="fmeta">
          <div class="fn">${p.name}</div>
          <div class="fs">Lv.${p.lv} · ${p.job} · 随身 ${p.stock.length} 件货</div></div>`;
        r.onclick = () => { M.cur = p.name; refresh(); };
        pl.appendChild(r);
      }
      pb.appendChild(pl);

      const p = M.peep();
      if (p) {
        pb.appendChild(F.el('div', 'pcat', `${p.name} 随身出售`));
        const own = F.el('div', 'friends');
        if (!p.stock.length) own.innerHTML = '<div class="empty">对方今天没带货</div>';
        p.stock.forEach((s, i) => {
          const total = s.price * s.n, tax = Math.round(total * M.TAX);
          const r = F.el('div', 'frow');
          r.innerHTML = `<div class="fav">售</div><div class="fmeta">
            <div class="fn">${F.itemName(s.item)} ×${s.n}</div>
            <div class="fs">单价 ${s.price} · 货款 ${total} + 税费 ${tax} = 实付 ${total + tax} 金币</div></div>`;
          const b = F.el('div', 'mini buy', '买入');
          b.onclick = () => { M.buyFace(i); refresh(); };
          r.appendChild(b);
          own.appendChild(r);
        });
        pb.appendChild(own);

        pb.appendChild(F.el('div', 'pcat', `把背包物资卖给 ${p.name}`));
        const mineInv = F.el('div', 'friends');
        let any = false;
        for (const k in F.Game.inv) {
          const n = F.Game.inv[k] || 0;
          if (!n || k === 'coins') continue;
          if ((F.priceOf(k) || 0) <= 0) continue;
          if (F.TOOLSK && F.TOOLSK[k]) continue;
          any = true;
          const unit = Math.max(1, Math.round(F.priceOf(k)));
          const r = F.el('div', 'frow');
          r.innerHTML = `<div class="fav">我</div><div class="fmeta">
            <div class="fn">${F.itemName(k)} ×${n}</div>
            <div class="fs">对方出价约 ${unit} 金币 / 个（全额到账，税费由对方承担）</div></div>`;
          const b1 = F.el('div', 'mini buy', '卖1');
          b1.onclick = () => { M.sellFace(k, 1); refresh(); };
          r.appendChild(b1);
          if (n > 1) {
            const b2 = F.el('div', 'mini', '全卖');
            b2.onclick = () => { M.sellFace(k, n); refresh(); };
            r.appendChild(b2);
          }
          mineInv.appendChild(r);
        }
        if (!any) mineInv.innerHTML = '<div class="empty">背包里没有可交易的物资</div>';
        pb.appendChild(mineInv);
      }
    }

    /* ---------------- 流水与规则 ---------------- */
    if (U2.bmTab === 'log') {
      pb.appendChild(F.el('div', 'pcat', '市场数据'));
      const g = F.el('div', 'cards');
      const add = (k, v) => { const c = F.el('div', 'card'); c.innerHTML = `<div class="tt">${k}</div><div class="ds">${v}</div>`; g.appendChild(c); };
      add('成交笔数', M.deals + ' 笔');
      add('成交额', M.volume + ' 金币');
      add('税费总额', M.destroyed + ' 金币（已回收销毁）');
      add('税率', Math.round(M.TAX * 100) + '%（买方承担）');
      add('我的摊位', M.mine.length + ' 件');
      add('在场人数', M.peeps.length + ' 人');
      pb.appendChild(g);

      pb.appendChild(F.el('div', 'pcat', '成交明细'));
      const sl = F.el('div', 'friends');
      if (!M.sold.length) sl.innerHTML = '<div class="empty">还没有成交记录</div>';
      for (const s of M.sold.slice(0, 20)) {
        const r = F.el('div', 'frow');
        r.innerHTML = `<div class="fav">${s.side.slice(0, 1)}</div><div class="fmeta">
          <div class="fn">${F.itemName(s.item)} ×${s.n} · ${s.price} 金币</div>
          <div class="fs">${s.side} · 对手：${s.who} · 第 ${s.day} 天 · 回收税费 ${s.tax}</div></div>`;
        sl.appendChild(r);
      }
      pb.appendChild(sl);
      pb.appendChild(F.el('div', 'tip',
        '规则：① 摊位与面对面成交都按成交价向买方额外收取 ' + Math.round(M.TAX * 100) + '% 税费，税费不进入任何人账户，而是直接销毁回收；' +
        '② 卖家按成交价全额到账，鼓励把大世界产出换成金币 ;③ 高税率的目的是让黑市比拍卖行更灵活但更昂贵，从而抑制金币总量膨胀。'));
    }
  };

  /* ============================ 世界塔传送门 ============================ */
  U2.panelPortal = function () {
    const { body: pb } = F.UI.panelShell('世界塔 · 副本传送门', '33 层，每层独立地图 · 每 5 层与第 33 层有 BOSS · 消耗 1 张门票');
    F.UI.setPanel('portal');
    pb.appendChild(F.el('div', 'pstat', '门票：' + (F.Game.inv.ticket || 0) + ' 张 · 队伍：' + S.party.members.length + ' 人'));
    const grid = F.el('div', 'floors');
    for (let f = 1; f <= 33; f++) {
      const th = F.Dungeon.theme(f);
      const boss = (f % 5 === 0) || f === 33;
      const d = F.el('div', 'floor' + (boss ? ' boss' : ''));
      d.innerHTML = `<b>${f}</b><span>${th.name}</span><i>${boss ? 'BOSS' : ''}</i>`;
      d.onclick = () => { F.UI.closePanel(); F.Dungeon.enter(f); };
      grid.appendChild(d);
    }
    pb.appendChild(grid);
    pb.appendChild(F.el('div', 'tip', '点击层数进入副本；门票可在材料商人 / 拍卖师处购买，也会从怪物与 BOSS 掉落。'));
  };

  /* ============================ 坐骑面板 ============================ */
  U2.panelMounts = function () {
    const M = F.Mounts;
    const { body: pb } = F.UI.panelShell('坐骑 · 捕捉与骑乘',
      '把野生动物生命打到 40% 以下后按 R 投掷纳球捕捉 · M 键开关本面板');
    F.UI.setPanel('mounts');
    const refresh = () => U2.panelMounts();

    pb.appendChild(F.el('div', 'pstat',
      '纳球 ×' + (F.Game.inv.ball_nab || 0) + '（工坊「工器」制作） · 坐骑栏 ' + M.list.length + '/' + M.MAX));

    /* 捕捉指南 */
    pb.appendChild(F.el('div', 'pcat', '可捕捉目标'));
    const guide = F.el('div', 'cards');
    for (const t of ['boar', 'wolf', 'bear']) {
      const d = F.MOBS[t], rd = M.RIDE_DEF[t];
      const c = F.el('div', 'card');
      c.innerHTML = `<div class="tt">${rd.name}</div><div class="ds">Lv.${d.lv} · 移速加成约 +${Math.round((rd.mul - 1) * 100)}%</div>`;
      guide.appendChild(c);
    }
    pb.appendChild(guide);

    /* 坐骑栏 */
    pb.appendChild(F.el('div', 'pcat', '我的坐骑'));
    const grid = F.el('div', 'cards');
    if (!M.list.length) grid.innerHTML = '<div class="empty">还没有坐骑，去捕捉一只吧</div>';
    M.list.forEach((mt, i) => {
      const riding = F.Player.riding && M.active === i;
      const c = F.el('div', 'card' + (riding ? ' on' : ''));
      c.innerHTML =
        `<div class="tt">${mt.name} <span class="ah-q q-${mt.q}">${mt.q}</span></div>
         <div class="ds">Lv.${mt.lv} · 移速 +${Math.round((mt.mul - 1) * 100)}% · 第 ${mt.day} 天捕捉</div>`;
      const row = F.el('div', 'prow');
      const bRide = F.el('button', 'btn' + (riding ? '' : ' ok'), riding ? '下马' : '骑乘');
      bRide.onclick = () => { riding ? M.dismount() : M.ride(i); refresh(); };
      const bFree = F.el('button', 'btn', '放生');
      bFree.onclick = () => {
        if (riding) M.dismount();
        M.list.splice(i, 1);
        F.UI.toast('已放生 ' + mt.name, 'info');
        refresh();
      };
      row.appendChild(bRide); row.appendChild(bFree);
      c.appendChild(row);
      grid.appendChild(c);
    });
    pb.appendChild(grid);
    pb.appendChild(F.el('div', 'tip',
      '捕捉概率随目标剩余生命降低而提高（幸运药剂 +15%）；野猪 / 灰狼 / 棕熊可捕捉，品质由其等级决定。'));
  };

  /* ============================ 天气 HUD ============================ */
  let wxEl = null, wxT = 0, boardT = 2.5;
  function updateWxHud() {
    if (!wxEl) wxEl = document.getElementById('weather');
    if (!wxEl || !F.Weather) return;
    const W = F.Weather, d = W.curDef();
    const buffs = W.buffList();
    let h = `<span class="wx-ic">${d.icon}</span><span class="wx-n">${W.enabled ? d.name : '关闭'}</span>`;
    for (const b of buffs.slice(0, 4)) h += `<span class="wx-b ${b.good ? 'ok' : 'no'}">${b.name}</span>`;
    if (buffs.length > 4) h += `<span class="wx-b">+${buffs.length - 4}</span>`;
    wxEl.innerHTML = h;
    wxEl.title = W.enabled ? (d.name + '：' + d.desc) : '天气系统已关闭';
  }
  U2.updateWxHud = updateWxHud;

  /* ============================ 斗兽场观战 / 竞猜面板 ============================ */
  let betEl = null, betMatch = null, betT = 0;
  const qcls = q => 'q-' + (F.QUALITIES.indexOf(q) >= 0 ? q : '普通');

  U2.openArenaBet = function (m) {
    betMatch = m;
    if (!betEl) {
      betEl = F.el('div', 'abet');
      betEl.id = 'abet';
      betEl.innerHTML =
        `<div class="ab-head"><span id="ab-title">斗兽场</span><span id="ab-x">✕</span></div>
         <div class="ab-body" id="ab-body"></div>`;
      document.body.appendChild(betEl);
      betEl.querySelector('#ab-x').onclick = () => U2.closeArenaBet();
      /* 标题栏拖拽：首次拖动把 right/bottom 定位转成 left/top（与聊天窗同款），
         ponytail: 只在创建时挂一次监听，closeArenaBet 只隐藏不销毁，位置保留 */
      const head = betEl.querySelector('.ab-head');
      head.style.cursor = 'move';
      head.style.userSelect = 'none';
      let drag = null;
      head.addEventListener('mousedown', e => {
        if (e.target.id === 'ab-x') return;
        const r = betEl.getBoundingClientRect();
        if (!betEl.style.left) {
          betEl.style.left = r.left + 'px'; betEl.style.top = r.top + 'px';
          betEl.style.right = 'auto'; betEl.style.bottom = 'auto';
        }
        drag = { ox: e.clientX - r.left, oy: e.clientY - r.top };
        e.preventDefault();
      });
      addEventListener('mousemove', e => {
        if (!drag) return;
        betEl.style.left = Math.max(8, Math.min(window.innerWidth - 80, e.clientX - drag.ox)) + 'px';
        betEl.style.top = Math.max(8, Math.min(window.innerHeight - 40, e.clientY - drag.oy)) + 'px';
        betEl.style.right = 'auto'; betEl.style.bottom = 'auto';
      });
      addEventListener('mouseup', () => { drag = null; });
    }
    betEl.style.display = 'flex';
    renderBet();
  };
  U2.closeArenaBet = function () { betT = 0; betMatch = null; if (betEl) betEl.style.display = 'none'; };

  function petLine(p) {
    const alive = p.hp > 0;
    const pct = Math.max(0, Math.round(p.hp / p.maxHp * 100));
    return `<div class="ab-pet${alive ? '' : ' dead'}">
        <span class="pn ${qcls(p.q)}">${p.name}</span>
        <span class="pl2">Lv.${p.lv}</span>
        <span class="pp">${p.pow}</span>
        <div class="pb"><i style="width:${pct}%"></i></div>
      </div>`;
  }
  function sideHtml(m, s) {
    const side = s === 0 ? m.a : m.b;
    const cls = s === 0 ? 'red' : 'blue';
    const label = s === 0 ? '红方' : '蓝方';
    return `<div class="ab-side ${cls}">
        <div class="ab-st">${label}：${side.name}</div>
        <div class="ab-sm">Lv.${side.lv} · ${side.guild} · 战力 ${F.Arena.sidePower(side)}</div>
        ${side.pets.map(petLine).join('')}
      </div>`;
  }
  function renderBet() {
    if (!betEl || !betMatch) return;
    const m = betMatch, A = F.Arena;
    const body = betEl.querySelector('#ab-body');
    const phaseTxt = m.phase === 'bet' ? '竞猜中 ' + Math.ceil(m.cd) + 's'
      : m.phase === 'fight' ? '战斗中' : '已结束';
    betEl.querySelector('#ab-title').textContent = '斗兽场 · ' + m.modeName + '（' + phaseTxt + '）';
    let h = `<div class="ab-vs">${sideHtml(m, 0)}<div class="ab-mid">
        <div class="ab-odd"><b>${m.odds[0]}</b><span>赔率</span></div>
        <div class="ab-vstxt">VS</div>
        <div class="ab-odd"><b>${m.odds[1]}</b><span>赔率</span></div>
      </div>${sideHtml(m, 1)}</div>`;
    h += `<div class="ab-pot">彩池 ${m.pools[0] + m.pools[1]} 金币（红 ${m.pools[0]} / 蓝 ${m.pools[1]}）· 你已投 红 ${m.myBets[0]} / 蓝 ${m.myBets[1]}</div>`;
    if (m.phase === 'bet' && !m.mine) {
      const amounts = [10, 100, 500];
      h += '<div class="ab-betrow">';
      for (let s = 0; s < 2; s++) {
        h += `<div class="ab-bets ${s === 0 ? 'red' : 'blue'}">`;
        for (const a of amounts) h += `<div class="mini" data-s="${s}" data-a="${a}">押 ${a}</div>`;
        h += '</div>';
      }
      h += '</div>';
    } else if (m.mine) {
      h += '<div class="ab-tip">这是你的出战阵容，无法为自己下注</div>';
    }
    if (m.log.length) h += `<div class="ab-log">${m.log.slice(-5).join('<br>')}</div>`;
    if (m.phase === 'done' && m.settle) {
      const w = m.winner === 0 ? '红方 ' + m.a.name : '蓝方 ' + m.b.name;
      h += `<div class="ab-res">胜者：${w}${m.settle.payout ? ' · 你获得 ' + m.settle.payout + ' 金币' : ''}</div>`;
    }
    h += `<div class="ab-foot">市场税收 ${Math.round(A.market.tax * 100)}% · 已退出流通 ${A.market.destroyed} 金币 · 本场上限 ${A.betCap()} 金币（动态）</div>`;
    body.innerHTML = h;
    body.querySelectorAll('.ab-bets .mini').forEach(b => {
      b.onclick = () => {
        if (F.Arena.bet(m, +b.dataset.s, +b.dataset.a)) renderBet();
      };
    });
  }
  U2.renderArenaBet = renderBet;

  /* ============================ 斗兽场主面板 ============================ */
  U2.arenaTab = 'join';
  U2.panelArena = function (tab) {
    const A = F.Arena;
    U2.arenaTab = tab || U2.arenaTab || 'join';
    const { body: pb } = F.UI.panelShell('斗兽场 · 宠物对战与竞猜',
      '宠物来自「纳球捕捉」的野兽 · 其他玩家开赛时会自动弹出观战竞猜面板');
    F.UI.setPanel('arena');
    const refresh = () => U2.panelArena();

    const tabs = F.el('div', 'ranktabs');
    for (const [id, name] of [['join', '报名参战'], ['live', '赛程 / 竞猜'], ['record', '战绩与市场']]) {
      const t = F.el('div', 'rt' + (U2.arenaTab === id ? ' on' : ''), name);
      t.onclick = () => U2.panelArena(id);
      tabs.appendChild(t);
    }
    pb.appendChild(tabs);

    const myPets = F.Mounts && F.Mounts.list ? F.Mounts.list : [];
    pb.appendChild(F.el('div', 'pstat',
      '我的宠物 ' + myPets.length + ' 只 · 战绩 ' + A.record.win + ' 胜 ' + A.record.lose + ' 负 · 斗兽声望 ' + A.record.points));

    if (U2.arenaTab === 'join') {
      pb.appendChild(F.el('div', 'pcat', '选择赛制'));
      const grid = F.el('div', 'cards');
      for (const md of F.ARENA_MODES) {
        const can = myPets.length >= md.n;
        const c = F.el('div', 'card' + (can ? '' : ' no'));
        c.innerHTML = `<div class="tt">${md.name}</div>
          <div class="ds">需要宠物 ${md.n} 只 · 奖励 ${md.reward[0]}~${md.reward[1]} 金币</div>
          <div class="ds">${can ? '可以出战' : '还缺 ' + (md.n - myPets.length) + ' 只宠物'}</div>`;
        const b = F.el('button', 'btn' + (can ? ' ok' : ''), can ? '出战' : '宠物不足');
        b.onclick = () => {
          if (!can) { F.UI.toast('先用纳球捕捉更多野兽吧', 'bad'); return; }
          const m = A.startMatch({ mode: md.id, mine: true });
          if (m) { F.UI.closePanel(); U2.openArenaBet(m); }
        };
        c.appendChild(b);
        grid.appendChild(c);
      }
      pb.appendChild(grid);
      pb.appendChild(F.el('div', 'pcat', '我的出战宠物'));
      const pick = F.el('div', 'cards');
      if (!myPets.length) pick.innerHTML = '<div class="empty">还没有宠物，去野外捕捉吧</div>';
      for (const mt of myPets) {
        const p = A.petFromMount(mt);
        const c = F.el('div', 'card');
        c.innerHTML = `<div class="tt">${p.name} <span class="ah-q ${qcls(p.q)}">${p.q}</span></div>
          <div class="ds">Lv.${p.lv} · 生命 ${p.maxHp} · 攻击 ${p.atk} · 战力 ${p.pow}</div>`;
        pick.appendChild(c);
      }
      pb.appendChild(pick);
    }

    if (U2.arenaTab === 'live') {
      pb.appendChild(F.el('div', 'pcat', '进行中的比赛'));
      const list = F.el('div', 'friends');
      const live = A.matches.filter(m => m.phase !== 'done');
      if (!live.length) list.innerHTML = '<div class="empty">暂无比赛，可发起一场表演赛</div>';
      for (const m of live) {
        const r = F.el('div', 'frow');
        r.innerHTML = `<div class="fav">${m.modeName[0]}</div>
          <div class="fmeta"><div class="fn">${m.a.name} VS ${m.b.name}</div>
          <div class="fs">${m.phase === 'bet' ? '竞猜中 ' + Math.ceil(m.cd) + 's' : '战斗中'} · 赔率 ${m.odds[0]} / ${m.odds[1]} · 彩池 ${m.pools[0] + m.pools[1]}</div></div>`;
        const b = F.el('div', 'mini buy', '观战');
        b.onclick = () => { F.UI.closePanel(); U2.openArenaBet(m); };
        r.appendChild(b);
        list.appendChild(r);
      }
      pb.appendChild(list);
      const row = F.el('div', 'prow');
      row.innerHTML = '<button class="btn ok" id="aa-demo">发起表演赛</button>';
      pb.appendChild(row);
      row.querySelector('#aa-demo').onclick = () => {
        const m = A.startMatch({ mode: '1v1' });
        if (m) { F.UI.closePanel(); U2.openArenaBet(m); }
      };
    }

    if (U2.arenaTab === 'record') {
      pb.appendChild(F.el('div', 'pcat', '我的战绩'));
      const g = F.el('div', 'cards');
      const add = (k, v) => { const c = F.el('div', 'card'); c.innerHTML = `<div class="tt">${k}</div><div class="ds">${v}</div>`; g.appendChild(c); };
      add('参赛战绩', A.record.win + ' 胜 ' + A.record.lose + ' 负');
      add('斗兽声望', String(A.record.points));
      add('参赛奖金', A.record.coins + ' 金币');
      add('竞猜次数', A.record.bets + ' 次（中 ' + A.record.betWin + ' / 失 ' + A.record.betLose + '）');
      pb.appendChild(g);

      pb.appendChild(F.el('div', 'pcat', '市场调控（防通胀）'));
      const g2 = F.el('div', 'cards');
      const add2 = (k, v) => { const c = F.el('div', 'card'); c.innerHTML = `<div class="tt">${k}</div><div class="ds">${v}</div>`; g2.appendChild(c); };
      add2('竞猜市场税率', Math.round(A.market.tax * 100) + '%（结算时直接销毁）');
      add2('累计退出流通金币', A.market.destroyed + ' 金币');
      add2('当日累计投注', A.market.dayBet + ' 金币');
      add2('本场下注上限', A.betCap() + ' 金币');
      pb.appendChild(g2);
      pb.appendChild(F.el('div', 'tip',
        '调控规则：① 竞猜彩池按「市场税收」抽取 ' + Math.round(A.market.tax * 100) + '%，这部分金币在结算时直接销毁、退出流通，使得竞猜整体为零和偏紧缩 ;② 单场与单日下注上限随当日累计投注递减 ;③ 单边热度过高时赔率自动下调，抑制跟风炒作 ;④ 参赛奖励与返还以金币形式发放，但整体产出小于回收口径的税额与常规税收，避免金币总量膨胀。'));

      pb.appendChild(F.el('div', 'pcat', '近期战报'));
      const h = F.el('div', 'friends');
      if (!A.history.length) h.innerHTML = '<div class="empty">暂无战报</div>';
      for (const r of A.history.slice(0, 10)) {
        const d = F.el('div', 'frow');
        d.innerHTML = `<div class="fav">${r.mode[0]}</div>
          <div class="fmeta"><div class="fn">${r.a} VS ${r.b}</div>
          <div class="fs">${r.mode} · 胜者：${r.winner === 0 ? r.a : r.b}</div></div>`;
        h.appendChild(d);
      }
      pb.appendChild(h);
    }
  };

  /* ============================ 排行榜（专属类别动态排名） ============================ */
  U2.rankCat = 'total';
  let rankScroll = 0, rankT = 2.5;

  U2.panelRank = function (catId) {
    const R = F.Rank, S = F.Skills;
    U2.rankCat = catId || U2.rankCat || 'total';
    const c = R.cat(U2.rankCat);
    const { body: pb } = F.UI.panelShell('排行榜 · ' + c.name,
      '点击任意一行（或头像）查看该玩家的装备 / 工具 / 全部技能等级 · 榜单实时变动');
    F.UI.setPanel('rank');

    /* 类别页签 */
    const tabs = F.el('div', 'ranktabs');
    for (const t of R.cats) {
      const d = F.el('div', 'rt' + (t.id === U2.rankCat ? ' on' : ''), t.icon + ' ' + t.name);
      d.onclick = () => { rankScroll = 0; U2.panelRank(t.id); };
      tabs.appendChild(d);
    }
    pb.appendChild(tabs);

    /* 我的名次 */
    const my = R.myRank(U2.rankCat);
    pb.appendChild(F.el('div', 'pstat',
      '我的名次：' + (my ? '第 ' + my.rank + ' / ' + my.total + ' 名 · ' + c.fmt(my.score) : '—') +
      ' · 综合等级 Lv.' + S.total()));

    /* 榜单 */
    const list = F.el('div', 'rklist');
    const rows = R.list(U2.rankCat).slice(0, 60);
    rows.forEach((it, i) => {
      const p = it.p;
      const d = F.el('div', 'rk-row' + (p.self ? ' me' : '') + (i < 3 ? ' top' : ''));
      const dl = it.delta > 0 ? '<i class="up">▲' + it.delta + '</i>'
        : (it.delta < 0 ? '<i class="dn">▼' + (-it.delta) + '</i>' : '<i class="eq">–</i>');
      d.innerHTML =
        `<span class="rk-n">${i + 1}</span>
         <span class="rk-av" style="background:${p.avatar.bg}">${p.avatar.ch}</span>
         <span class="rk-name">${p.self ? '你' : p.name}</span>
         <span class="rk-job">${p.job}</span>
         <span class="rk-g">${p.guild}</span>
         <span class="rk-sc">${c.fmt(it.score, p)}</span>
         <span class="rk-d">${dl}</span>`;
      d.onclick = () => U2.panelPlayer(p.name, U2.rankCat);
      list.appendChild(d);
    });
    pb.appendChild(list);
    list.scrollTop = rankScroll;
    list.onscroll = () => { rankScroll = list.scrollTop; };
    pb.appendChild(F.el('div', 'tip',
      '共 ' + R.players.length + ' 位玩家参与排名；其他玩家由本地模拟，会持续产出并改变名次（▲▼ 为较上一次变动的名次）。'));
  };

  /* ============================ 玩家详情面板（装备 / 工具 / 技能） ============================ */
  U2.panelPlayer = function (name, back) {
    const R = F.Rank;
    const info = R.playerInfo(name);
    if (!info) { F.UI.toast('找不到这位玩家', 'bad'); return; }
    const { body: pb } = F.UI.panelShell('玩家信息 · ' + (info.self ? '你' : name),
      '装备 / 工具熟练度 / 全部技能等级');
    F.UI.setPanel('playerinfo');

    /* 头部：头像 + 名字 + 职业 + 公会 + 综合等级 */
    const head = F.el('div', 'pl-head');
    head.innerHTML =
      `<div class="pl-av" style="background:${info.avatar.bg}">${info.avatar.ch}</div>
       <div class="pl-meta">
         <div class="pl-name">${info.self ? '你' : name} <span class="pl-job">${info.job}</span></div>
         <div class="pl-sub">公会：${info.guild} · 综合等级 Lv.${info.lv}</div>
         <div class="pl-sub">击杀 ${info.kills} · 金币 ${info.coins} · 副本最高第 ${info.floor} 层</div>
       </div>`;
    pb.appendChild(head);

    /* 装备 */
    pb.appendChild(F.el('div', 'pcat', '装备'));
    const eq = F.el('div', 'items');
    const slots = [['weapon', '武器'], ['armor', '防具'], ['trinket', '首饰']];
    for (const [slot, label] of slots) {
      const id = info.equip[slot];
      const e = id ? F.EQUIP[id] : null;
      const d = F.el('div', 'item');
      const tip = id
        ? `<div class="tp-n">${F.itemName(id)}</div>
           <div class="tp-d">${(F.ITEMS[id] && F.ITEMS[id].d) || ''}</div>
           <div class="tp-d">品质：${e ? e.q : '普通'} · 等级：${e ? e.lv : 1}${e && e.atk ? ' · 攻击 +' + e.atk : ''}${e && e.def ? ' · 防御 +' + e.def : ''}</div>`
        : `<div class="tp-n">${label}：空</div><div class="tp-d">尚未装备${label}</div>`;
      d.dataset.tip = tip;
      d.innerHTML = `<span class="sw" style="background:#${((F.ITEMS[id] && F.ITEMS[id].c) || 0x888888).toString(16).padStart(6, '0')}"></span>
        <span class="nm">${label}：${id ? F.itemName(id) : '未装备'}</span>
        <b>${id ? ((e && e.atk) ? '攻+' + e.atk : (e && e.def) ? '防+' + e.def : '') : ''}</b>`;
      eq.appendChild(d);
    }
    pb.appendChild(eq);

    /* 工具熟练度 */
    pb.appendChild(F.el('div', 'pcat', '工具熟练度'));
    const tg = F.el('div', 'toolgrid');
    for (const t of info.tools) {
      const d = F.el('div', 'tool');
      d.dataset.tip = `<div class="tp-n">${t.name} Lv.${t.lv}</div>
        <div class="tp-d">熟练度 ${t.xp} / ${t.need}</div>
        <div class="tp-p">使用工具即可积累熟练度</div>`;
      d.innerHTML =
        `<span class="ti">${t.icon}</span>
         <span class="tn2">${t.name}</span>
         <span class="tl">Lv.${t.lv}</span>
         <div class="tb2"><i style="width:${(t.xp / t.need * 100).toFixed(1)}%"></i></div>`;
      tg.appendChild(d);
    }
    pb.appendChild(tg);

    /* 全部技能等级 */
    pb.appendChild(F.el('div', 'pcat', '技能等级'));
    const sg = F.el('div', 'skillgrid');
    for (const s of info.skills) {
      const d = F.el('div', 'skill');
      d.dataset.tip = `<div class="tp-n">${s.name} Lv.${s.lv}</div>
        <div class="tp-d">经验 ${s.xp} / ${s.need}（${(s.xp / s.need * 100).toFixed(1)}%）</div>
        <div class="tp-p">下一级还需 ${Math.max(0, s.need - s.xp)} 点经验</div>`;
      d.innerHTML =
        `<span class="si" style="background:${s.c}">${s.icon}</span>
         <span class="sn">${s.name}</span>
         <span class="sl">Lv.${s.lv}</span>
         <div class="sb"><i style="width:${(s.xp / s.need * 100).toFixed(1)}%"></i></div>
         <span class="sx">${s.xp} / ${s.need}</span>`;
      sg.appendChild(d);
    }
    pb.appendChild(sg);

    /* 按钮 */
    const row = F.el('div', 'prow');
    row.innerHTML = `<button class="btn" id="pp-back">返回排行榜</button>
      <button class="btn" id="pp-close">关闭</button>`;
    pb.appendChild(row);
    row.querySelector('#pp-back').onclick = () => {
      F.UI.setPanel('rank');
      U2.panelRank(back || U2.rankCat);
    };
    row.querySelector('#pp-close').onclick = () => F.UI.closePanel();
    if (!info.self) {
      const row2 = F.el('div', 'prow');
      row2.innerHTML = `<button class="btn ok" id="pp-chat">私聊</button><button class="btn" id="pp-party">邀请组队</button>`;
      pb.appendChild(row2);
      row2.querySelector('#pp-chat').onclick = () => { F.UI.closePanel(); U2.openChat('p:' + name); };
      row2.querySelector('#pp-party').onclick = () => F.Social && F.Social.inviteParty(name);
    }
  };

  /* ============================ 目标血条 ============================ */
  let hpEl = null, hpName = null, hpBar = null;
  U2.update = function (dt) {
    /* 天气 HUD */
    wxT -= dt;
    if (wxT <= 0) { wxT = 0.4; updateWxHud(); }
    /* 斗兽场竞猜面板实时刷新（赔率 / 倒计时 / 战况） */
    if (betEl && betMatch && betEl.style.display !== 'none') {
      betT -= dt;
      if (betT <= 0) { betT = betMatch.phase === 'fight' ? 0.25 : 0.5; renderBet(); }
    }
    /* 排行榜打开时定期刷新（动态排名） */
    if (F.UI.getPanel && F.UI.getPanel() === 'rank') {
      rankT -= dt;
      if (rankT <= 0) { rankT = 2.5; U2.panelRank(); }
    } else rankT = 2.5;
    /* 公告板名人堂：前三名卡片动态刷新 */
    if (F.UI.getPanel && F.UI.getPanel() === 'board' && U2.boardTab !== 'quest') {
      boardT -= dt;
      if (boardT <= 0) { boardT = 2.5; U2.panelBoard(); }
    } else boardT = 2.5;
    if (!hpEl) {
      hpEl = F.$('#targethp');
      if (hpEl) { hpName = hpEl.querySelector('.tn'); hpBar = hpEl.querySelector('.tb i'); }
    }
    const m = F.Combat && F.Combat.target;
    if (hpEl) {
      if (m && m.alive && Math.hypot(m.x - F.Player.pos.x, m.z - F.Player.pos.z) < 10) {
        hpEl.style.display = 'block';
        hpName.textContent = m.def.name + '  Lv.' + m.lv;
        hpBar.style.width = Math.max(0, m.hp / m.maxHp * 100) + '%';
        hpEl.querySelector('.th').textContent = Math.max(0, Math.round(m.hp)) + ' / ' + m.maxHp;
      } else hpEl.style.display = 'none';
    }
  };

  U2.init = function () {
    S = F.Social;
    buildChat();
    U2.closeChat();
  };
})();
