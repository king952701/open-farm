/* ==========================================================================
 * 牧野田园 Open Farm  ·  悬赏任务系统
 * 任务在村口「公告板」发布：每一行镇务 / 悬赏随机抽取目标与数量。
 * 奖励在**接取瞬间随机生成**（金币 / 物资 / 熟练度 / 公会经验），
 * 完成后回到公告板或直接在列表里领取。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp, rnd = F.rnd;
  const ri = (a, b) => Math.round(rnd(a, b));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ------------------------------ 奖励池（分档） ------------------------------ */
  const POOLS = [
    ['wood', 'stone', 'fiber', 'branch', 'herb', 'flower', 'mushroom', 'hay', 'leather', 'fur', 'wool', 'flour'],
    ['iron', 'copper', 'tin', 'iron_ingot', 'bronze', 'potion', 'potion_hp', 'rope', 'board', 'brick', 'ticket', 'baked'],
    ['silver', 'gold', 'silver_ingot', 'gold_ingot', 'gem_crystal', 'gem_rainbow', 'potion_str', 'potion_luck',
      'sword_iron', 'armor_silver', 'ring_gold', 'crystal'],
  ];
  const SKILLS = ['mine', 'gather', 'farm', 'fish', 'ranch', 'cook', 'alchemy', 'combat'];

  /* ------------------------------ 任务模板 ------------------------------ */
  const TPL = [
    { icon: '采', tier: 1, kind: 'gain', items: ['wood', 'stone', 'fiber', 'branch'], need: () => ri(10, 24), name: '采集委托' },
    { icon: '猎', tier: 2, kind: 'stat', stat: 'kill', need: () => ri(4, 12), name: '清剿委托' },
    { icon: '渔', tier: 1, kind: 'stat', stat: 'fish', need: () => ri(3, 8), name: '渔获委托' },
    { icon: '农', tier: 1, kind: 'stat', stat: 'harvest', need: () => ri(6, 16), name: '农事委托' },
    { icon: '牧', tier: 2, kind: 'stat', stat: 'product', need: () => ri(3, 8), name: '畜牧委托' },
    { icon: '建', tier: 2, kind: 'stat', stat: 'build', need: () => ri(2, 5), name: '营造委托' },
    { icon: '送', tier: 2, kind: 'deliver', items: ['iron_ingot', 'bronze', 'leather', 'potion', 'board', 'brick', 'rope'], need: () => ri(2, 5), name: '供货委托' },
    { icon: '塔', tier: 3, kind: 'floor', need: () => ri(3, 14), name: '世界塔委托' },
  ];

  const Q = (F.Quest = {
    board: [], doing: [], log: [], nextId: 1, day: 1, t: 240, gain: {}, done: 0, plus: 0,
    MAX: 3, wrapped: false,

    init() {
      Q.wrapGive();
      if (!Q.board.length && !Q.doing.length) Q.reroll(true);
    },

    /* 累计获得（用于「采集类」任务进度，避免卖了再买回来刷进度） */
    wrapGive() {
      if (Q.wrapped || !F.Game || !F.Game.give) return;
      Q.wrapped = true;
      const orig = F.Game.give;
      F.Game.give = function (id, n) {
        n = n || 1;
        if (n > 0) Q.gain[id] = (Q.gain[id] || 0) + n;
        return orig.apply(this, arguments);
      };
    },

    /* ------------------------------ 发布 ------------------------------ */
    reroll(force) {
      const n = ri(4, 6);
      const fresh = [];
      const used = {};
      for (let i = 0; i < n; i++) {
        let tp = pick(TPL), guard = 0;
        while (used[tp.icon] && guard < 8) { tp = pick(TPL); guard++; }
        used[tp.icon] = 1;
        fresh.push(Q.mk(tp));
      }
      if (force) Q.board = fresh;
      else {
        /* 保留已被接取的，其余替换为新委托 */
        Q.board = fresh;
      }
      Q.t = rnd(150, 260);
      Q.day = F.Game.day || 1;
    },

    mk(tp) {
      const need = tp.need();
      const item = tp.items ? pick(tp.items) : null;
      const tier = tp.tier;
      const q = {
        id: Q.nextId++, kind: tp.kind, icon: tp.icon, tier, need, item, stat: tp.stat || null,
        name: tp.name, taken: false, notified: false, base: null, reward: null,
      };
      q.title = Q.title(q);
      q.desc = Q.desc(q);
      return q;
    },

    title(q) {
      if (q.kind === 'gain') return `${q.icon} 采集 ${F.itemName(q.item)} ×${q.need}`;
      if (q.kind === 'stat') {
        const nm = { kill: '击杀野兽', fish: '钓起鱼', harvest: '收获作物', product: '收取畜产', build: '完成建造' }[q.stat] || '完成任务';
        return `${q.icon} ${nm} ×${q.need}`;
      }
      if (q.kind === 'deliver') return `${q.icon} 上缴 ${F.itemName(q.item)} ×${q.need}`;
      if (q.kind === 'floor') return `${q.icon} 通关世界塔第 ${q.need} 层`;
      return `${q.icon} 委托`;
    },
    desc(q) {
      const r = '★'.repeat(q.tier);
      if (q.kind === 'deliver') return `${q.name} · 难度 ${r}｜需要把货物带到公告板交付`;
      if (q.kind === 'floor') return `${q.name} · 难度 ${r}｜需要至少通关世界塔第 ${q.need} 层`;
      if (q.kind === 'gain') return `${q.name} · 难度 ${r}｜在野外采集获得 ${F.itemName(q.item)}`;
      return `${q.name} · 难度 ${r}｜努力产出即可推进`;
    },

    /* ------------------------------ 随机奖励 ------------------------------ */
    roll(tier) {
      const coins = Math.round([rnd(70, 150), rnd(160, 360), rnd(380, 820)][tier - 1]);
      const pool = POOLS[tier - 1];
      const cnt = tier >= 3 ? ri(2, 3) : (tier === 2 ? ri(1, 2) : ri(1, 2));
      const items = [];
      for (let i = 0; i < cnt; i++) {
        const id = pick(pool);
        const n = tier >= 3 ? ri(2, 5) : (tier === 2 ? ri(1, 4) : ri(3, 8));
        const same = items.find(x => x.id === id);
        if (same) same.n += n; else items.push({ id, n });
      }
      /* 少量概率追加惊喜物资（随机档次 + 数量） */
      if (Math.random() < 0.22) {
        const id = pick(POOLS[Math.min(2, tier)]);
        items.push({ id, n: ri(1, 3) });
      }
      return {
        coins, items,
        skill: pick(SKILLS),
        xp: Math.round([rnd(8, 20), rnd(20, 45), rnd(45, 90)][tier - 1]),
        guild: tier * ri(1, 3),
      };
    },
    rewardText(r) {
      let s = r.coins + ' 金币';
      if (r.items.length) s += ' · ' + r.items.map(i => F.itemName(i.id) + '×' + i.n).join('、');
      if (r.xp) s += ' · ' + r.skill + '熟练度 +' + r.xp;
      return s;
    },

    /* ------------------------------ 接取 / 放弃 / 领取 ------------------------------ */
    avail() { return Q.MAX - Q.doing.length; },

    accept(id) {
      const i = Q.board.findIndex(q => q.id === id);
      if (i < 0) return false;
      if (Q.avail() <= 0) { F.UI.toast('同时进行中的委托不能超过 ' + Q.MAX + ' 个', 'bad'); F.Audio2.bad(); return false; }
      const q = Q.board[i];
      q.taken = true;
      q.reward = Q.roll(q.tier);           /* 接取瞬间随机生成奖励 */
      q.base = Q.snap();
      Q.board.splice(i, 1);
      Q.doing.push(q);
      F.Audio2.ok();
      F.UI.toast('已接取：' + q.title + '（随机奖励已生成）', 'ok');
      if (F.Social) F.Social.sys('公告板：你接取了「' + q.title + '」。');
      return true;
    },

    drop(id) {
      const i = Q.doing.findIndex(q => q.id === id);
      if (i < 0) return false;
      const q = Q.doing[i];
      Q.doing.splice(i, 1);
      Q.board.push(q);
      q.taken = false; q.base = null; q.reward = null; q.notified = false;
      F.UI.toast('已放弃委托：' + q.title, 'info');
      return true;
    },

    snap() {
      const s = {};
      const st = (F.Game && F.Game.stats) || {};
      for (const k in st) s[k] = st[k];
      return { gain: Object.assign({}, Q.gain), stat: s, floor: (F.Dungeon ? (F.Dungeon.bestFloor || 0) : 0) };
    },

    prog(q) {
      if (!q.base) return 0;
      if (q.kind === 'deliver') return Math.min(q.need, F.Game.inv[q.item] || 0);
      if (q.kind === 'floor') {
        const f = F.Dungeon ? (F.Dungeon.bestFloor || 0) : 0;
        return Math.min(q.need, f >= q.need ? q.need : 0);
      }
      if (q.kind === 'stat') return clamp((F.Game.stats[q.stat] || 0) - (q.base.stat[q.stat] || 0), 0, q.need);
      if (q.kind === 'gain') return clamp((Q.gain[q.item] || 0) - (q.base.gain[q.item] || 0), 0, q.need);
      return 0;
    },
    isDone(q) { return Q.prog(q) >= q.need; },

    claim(id) {
      const i = Q.doing.findIndex(q => q.id === id);
      if (i < 0) return false;
      const q = Q.doing[i];
      if (!Q.isDone(q)) { F.UI.toast('尚未完成：' + Q.prog(q) + '/' + q.need, 'bad'); F.Audio2.bad(); return false; }
      if (q.kind === 'deliver' && !F.Game.has(q.item, q.need)) { F.UI.toast('货物不足', 'bad'); return false; }
      if (q.kind === 'deliver') F.Game.take(q.item, q.need);
      const r = q.reward;
      F.Game.addCoins(r.coins);
      for (const it of r.items) F.Game.give(it.id, it.n);
      if (r.xp) F.Game.addSkill ? F.Game.addSkill(r.skill, r.xp) : null;
      if (r.guild) F.Game.addGuildXp(r.guild);
      Q.doing.splice(i, 1);
      Q.done++;
      Q.plus += r.coins;
      Q.log.unshift({ day: F.Game.day || 1, title: q.title, coins: r.coins, items: r.items.map(x => F.itemName(x.id) + '×' + x.n).join('、') });
      if (Q.log.length > 30) Q.log.pop();
      F.Audio2.ok();
      F.UI.toast('委托完成！' + Q.rewardText(r), 'ok');
      if (F.Social) F.Social.sys('公告板：你完成了「' + q.title + '」，领到 ' + r.coins + ' 金币。');
      return true;
    },

    /* ------------------------------ 每帧 ------------------------------ */
    update(dt) {
      /* 换日或到达重发时间 → 刷新公告板（已接取的委托不受影响） */
      if ((F.Game.day || 1) !== Q.day) { Q.reroll(false); return; }
      Q.t -= dt;
      if (Q.t <= 0) Q.reroll(false);
      /* 完成提示（每条只提示一次） */
      for (const q of Q.doing) {
        if (!q.notified && Q.isDone(q)) {
          q.notified = true;
          F.UI.toast('委托已完成，回公告板领取奖励：' + q.title, 'ok');
          F.Audio2.ok();
        }
      }
    },

    saveData() {
      return {
        board: Q.board.map(Q.serialize), doing: Q.doing.map(Q.serialize), log: Q.log,
        done: Q.done, plus: Q.plus, gain: Q.gain, nextId: Q.nextId, day: Q.day, t: Q.t,
      };
    },
    serialize(q) {
      return { id: q.id, kind: q.kind, icon: q.icon, tier: q.tier, need: q.need, item: q.item, stat: q.stat, title: q.title, desc: q.desc, name: q.name, taken: q.taken, base: q.base, reward: q.reward };
    },
    loadData(d) {
      if (!d) return;
      Q.wrapGive();
      const rev = (o) => Object.assign({ base: null, reward: null, notified: false }, o);
      Q.board = (d.board || []).map(rev);
      Q.doing = (d.doing || []).map(rev);
      Q.log = d.log || [];
      Q.done = d.done || 0; Q.plus = d.plus || 0;
      Q.gain = d.gain || {};
      Q.nextId = Math.max(1, d.nextId || 1);
      Q.day = d.day || (F.Game.day || 1);
      Q.t = d.t != null ? d.t : 240;
      if (!Q.board.length && !Q.doing.length) Q.reroll(true);
    },
    reset() {
      Q.wrapGive();
      Q.board = []; Q.doing = []; Q.log = []; Q.done = 0; Q.plus = 0; Q.gain = {}; Q.nextId = 1;
      Q.day = F.Game.day || 1; Q.t = 240;
      Q.reroll(true);
    },
  });
})();
