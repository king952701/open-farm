/* ==========================================================================
 * 牧野田园 Open Farm  ·  技能熟练度 / 工具熟练度 / 排行榜（专属类别动态排名）
 * 单机离线版：榜单上的其他玩家由本地模拟，分数随时间动态变化，支持排名涨跌。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp;

  /* ============================ 技能表 ============================ */
  /* 8 项主技能，对应采集 / 生产 / 战斗 / 副职业 */
  const SK = (F.SKILLS = {
    farm: { name: '农耕', icon: '耕', c: '#8fc86a' },
    gather: { name: '采集', icon: '采', c: '#7fc0a0' },
    mine: { name: '挖矿', icon: '矿', c: '#c8a06a' },
    fish: { name: '钓鱼', icon: '渔', c: '#6ac0e0' },
    combat: { name: '战斗', icon: '战', c: '#e0785a' },
    ranch: { name: '畜牧', icon: '牧', c: '#e0b46a' },
    cook: { name: '烹饪', icon: '烹', c: '#e88a6a' },
    alchemy: { name: '炼金', icon: '炼', c: '#b08ae8' },
  });

  /* 工具熟练度（与技能分开统计） */
  const TK = (F.TOOLSK = {
    axe: { name: '斧头', icon: '斧' }, pick: { name: '镐子', icon: '镐' },
    hoe: { name: '锄头', icon: '锄' }, sickle: { name: '镰刀', icon: '镰' },
    hammer: { name: '锤子', icon: '锤' }, rod: { name: '鱼竿', icon: '竿' },
    can: { name: '水壶', icon: '壶' },
  });

  const S = (F.Skills = {
    MAX: 60, data: {}, tools: {},

    /* 升级所需经验：60 + 40 × 等级^1.35 */
    need(lv) { return Math.round(60 + 40 * Math.pow(Math.max(1, lv), 1.35)); },

    init() {
      S.data = {}; S.tools = {};
      for (const k in SK) S.data[k] = { lv: 1, xp: 0 };
      for (const k in TK) S.tools[k] = { lv: 1, xp: 0 };
    },
    get(id) { return S.data[id] || (S.data[id] = { lv: 1, xp: 0 }); },
    tool(id) { return S.tools[id] || (S.tools[id] = { lv: 1, xp: 0 }); },
    lv(id) { return S.get(id).lv; },
    xp(id) { return S.get(id).xp; },
    /* 综合等级 = 全部技能等级之和 */
    total() { let t = 0; for (const k in SK) t += S.get(k).lv; return t; },

    /* 加经验（可升级，升级时提示） */
    add(id, n) {
      if (!SK[id]) return;
      const s = S.get(id);
      s.xp += (n || 1);
      while (s.lv < S.MAX && s.xp >= S.need(s.lv)) {
        s.xp -= S.need(s.lv);
        s.lv++;
        F.UI && F.UI.toast(SK[id].name + '提升到 ' + s.lv + ' 级！', 'ok');
        F.FX && F.FX.text(F.Player.pos.x, F.Player.pos.y + 2.2, F.Player.pos.z,
          SK[id].name + ' Lv.' + s.lv, '#ffe9a0');
      }
      if (s.lv >= S.MAX) s.xp = 0;
    },
    addTool(id, n) {
      const t = S.tool(id);
      t.xp += (n || 1);
      while (t.lv < S.MAX && t.xp >= S.need(t.lv)) { t.xp -= S.need(t.lv); t.lv++; }
      if (t.lv >= S.MAX) t.xp = 0;
    },
  });

  /* ============================ 榜单玩家（模拟） ============================ */
  const SUR = ['林', '苏', '陈', '周', '白', '云', '山', '溪', '木', '禾', '陆', '沈', '许', '柳', '叶', '安', '宋', '罗', '常', '江'];
  const GIV = ['青禾', '牧', '屿', '野', '露', '舟', '澈', '岚', '亭', '南', '风', '歌', '岩', '川', '葵', '原', '桥', '麦', '桑', '舟'];
  const JOBS = ['农夫', '矿工', '渔夫', '猎人', '炼金师', '铁匠', '裁缝', '厨师'];
  const GUILDS = ['牧野同好会', '晨曦农庄', '青山矿业', '碧溪渔社', '铁炉工坊', '百草药园', '云间织坊', '金穗商会'];

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
  function pickOf(arr, h) { return arr[h % arr.length]; }
  function avatarOf(name) {
    const h = hash(name);
    const hue = h % 360;
    return { ch: name.slice(-1), bg: 'linear-gradient(140deg,hsl(' + hue + ',52%,58%),hsl(' + ((hue + 48) % 360) + ',48%,42%))' };
  }
  const W = ['sword_wood', 'sword_iron', 'sword_silver', 'sword_gold', 'sword_rainbow'];
  const A = ['armor_leather', 'cloak_fur', 'armor_silver', 'armor_dragon'];
  const T = ['ring_gold', 'amulet_moon'];

  function mkPlayer(name, base) {
    const h = hash(name);
    const b = base != null ? base : 3 + (h % 34);
    const skills = {};
    for (const k in SK) {
      const lv = clamp(1 + Math.round(b * (0.5 + ((h >> (k.length % 7)) % 100) / 130)), 1, 60);
      skills[k] = { lv, xp: (h + k.length * 37) % F.Skills.need(lv) };
    }
    const tools = {};
    for (const k in TK) {
      const lv = clamp(skills[TK[k].name === '鱼竿' ? 'fish' : (k === 'pick' ? 'mine' : 'gather')].lv + ((h % 5) - 2), 1, 60);
      tools[k] = { lv, xp: (h + k.length * 11) % F.Skills.need(lv) };
    }
    const combat = skills.combat.lv;
    return {
      name, self: false, avatar: avatarOf(name),
      job: pickOf(JOBS, h >> 3), guild: pickOf(GUILDS, h >> 5),
      kills: Math.round(combat * (6 + (h % 40))),
      coins: Math.round((skills.mine.lv * 90 + skills.gather.lv * 60) * (0.6 + (h % 90) / 100)),
      floor: clamp(Math.round(combat * 1.1), 1, 33),
      clears: Math.round(combat * 0.8),
      guildLv: (h % 4), guildXp: (h % 4600000),
      skills, tools,
      equip: {
        weapon: W[clamp(Math.floor(combat / 9), 0, 4)],
        armor: A[clamp(Math.floor(combat / 10), 0, 3)],
        trinket: combat >= 18 ? T[clamp(Math.floor(combat / 22), 0, 1)] : null,
      },
    };
  }

  /* ============================ 排行榜 ============================ */
  const R = (F.Rank = {
    cats: [
      { id: 'total', name: '综合', icon: '★', get: p => R.totalLv(p), fmt: v => 'Lv.' + v },
      { id: 'combat', name: '战斗', icon: '战', get: p => p.kills, fmt: v => v + ' 击杀', skill: 'combat' },
      { id: 'mine', name: '挖矿', icon: '矿', get: p => p.skills.mine.lv, fmt: v => 'Lv.' + v, skill: 'mine' },
      { id: 'gather', name: '采集', icon: '采', get: p => p.skills.gather.lv, fmt: v => 'Lv.' + v, skill: 'gather' },
      { id: 'farm', name: '农耕', icon: '耕', get: p => p.skills.farm.lv, fmt: v => 'Lv.' + v, skill: 'farm' },
      { id: 'fish', name: '钓鱼', icon: '渔', get: p => p.skills.fish.lv, fmt: v => 'Lv.' + v, skill: 'fish' },
      { id: 'ranch', name: '畜牧', icon: '牧', get: p => p.skills.ranch.lv, fmt: v => 'Lv.' + v, skill: 'ranch' },
      { id: 'cook', name: '烹饪', icon: '烹', get: p => p.skills.cook.lv, fmt: v => 'Lv.' + v, skill: 'cook' },
      { id: 'alchemy', name: '炼金', icon: '炼', get: p => p.skills.alchemy.lv, fmt: v => 'Lv.' + v, skill: 'alchemy' },
      { id: 'coins', name: '财富', icon: '金', get: p => p.coins, fmt: v => v + ' 金币' },
      { id: 'dungeon', name: '副本', icon: '塔', get: p => p.floor, fmt: v => '第 ' + v + ' 层' },
      { id: 'guild', name: '公会', icon: '旗', get: p => p.guildLv * 10000000 + p.guildXp, fmt: (v, p) => p.guildLv + ' 级（' + Math.round(p.guildXp / 10000) + '万）' },
    ],
    players: [], me: null, delta: {}, order: {}, t: 6,

    totalLv(p) { let t = 0; for (const k in SK) t += (p.skills[k] ? p.skills[k].lv : 1); return t; },
    cat(id) { return R.cats.find(c => c.id === id) || R.cats[0]; },

    init() {
      S.init();
      R.players = [];
      const names = [];
      for (let i = 0; i < SUR.length && names.length < 46; i++) {
        for (let j = 0; j < GIV.length && names.length < 46; j++) {
          const n = SUR[i] + GIV[j];
          if (names.indexOf(n) < 0 && n.length >= 2) names.push(n);
        }
      }
      for (const n of names) R.players.push(mkPlayer(n));
      /* 好友也进榜（若重名则复用） */
      if (F.Social && F.Social.friends) {
        for (const fr of F.Social.friends) {
          if (!R.players.some(p => p.name === fr.name)) R.players.push(mkPlayer(fr.name, fr.lv));
        }
      }
      R.me = {
        name: '你', self: true, avatar: avatarOf('你'), job: '农夫',
        guild: (F.Social && F.Social.guild) ? F.Social.guild.name : '牧野同好会',
        kills: 0, coins: 0, floor: 0, clears: 0, guildLv: 0, guildXp: 0,
        skills: S.data, tools: S.tools,
        equip: (F.Game && F.Game.equip) ? F.Game.equip : { weapon: null, armor: null, trinket: null },
      };
      R.players.push(R.me);
      R.sync();
      R.snapshot();
      R.snapshot();
    },

    /* 同步自己的真实数据 */
    sync() {
      const m = R.me;
      if (!m) return;
      m.kills = (F.Game && F.Game.stats ? F.Game.stats.kill : 0) || 0;
      m.coins = F.Game ? (F.Game.coins || 0) : 0;
      if (F.Dungeon && F.Dungeon.bestFloor) m.floor = Math.max(m.floor || 0, F.Dungeon.bestFloor);
      m.clears = F.Dungeon && F.Dungeon.clears ? F.Dungeon.clears : (m.clears || 0);
      if (F.Social && F.Social.guild) {
        m.guild = F.Social.guild.name;
        m.guildLv = F.Social.guild.level;
        m.guildXp = F.Social.guild.xp;
      }
      m.skills = S.data; m.tools = S.tools;
      m.equip = F.Game ? F.Game.equip : m.equip;
      m.avatar = avatarOf('你');
    },

    /* 排名快照：记录每个类别的名次变化（↑↓） */
    snapshot() {
      for (const c of R.cats) {
        const arr = R.players.slice().sort((a, b) => c.get(b) - c.get(a) || (a.name < b.name ? -1 : 1));
        const prev = R.order[c.id] || {};
        const cur = {}, dl = R.delta[c.id] || (R.delta[c.id] = {});
        arr.forEach((p, i) => {
          cur[p.name] = i + 1;
          dl[p.name] = prev[p.name] != null ? prev[p.name] - (i + 1) : 0;
        });
        R.order[c.id] = cur;
      }
    },

    /* 取某个类别的榜单（含名次与涨跌） */
    list(catId) {
      R.sync();
      const c = R.cat(catId);
      const arr = R.players.slice().sort((a, b) => c.get(b) - c.get(a) || (a.name < b.name ? -1 : 1));
      const dl = R.delta[c.id] || {};
      const ord = R.order[c.id] || {};
      return arr.map((p, i) => ({
        p, rank: ord[p.name] || (i + 1), delta: dl[p.name] || 0, score: c.get(p),
      }));
    },
    myRank(catId) {
      const l = R.list(catId);
      const i = l.findIndex(x => x.p.self);
      return i < 0 ? null : { rank: l[i].rank, score: l[i].score, total: l.length };
    },

    /* 动态排名：其他玩家持续产出，榜单实时变化 */
    tick(dt) {
      R.t -= dt;
      if (R.t > 0) return;
      R.t = F.rnd(2.5, 5.5);
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const p = R.players[(Math.random() * R.players.length) | 0];
        if (p.self) continue;
        const roll = Math.random();
        if (roll < 0.30) {                       /* 战斗 */
          p.kills += Math.round(F.rnd(8, 40));
          R.xpTo(p.skills.combat, Math.round(F.rnd(70, 240)));
        } else if (roll < 0.48) {                /* 挖矿 */
          p.coins += Math.round(F.rnd(60, 480));
          R.xpTo(p.skills.mine, Math.round(F.rnd(70, 240)));
        } else if (roll < 0.62) {                /* 采集 */
          R.xpTo(p.skills.gather, Math.round(F.rnd(70, 240)));
          p.coins += Math.round(F.rnd(30, 260));
        } else if (roll < 0.74) {                /* 钓鱼 */
          R.xpTo(p.skills.fish, Math.round(F.rnd(70, 240)));
        } else if (roll < 0.84) {                /* 农耕 / 畜牧 */
          R.xpTo(p.skills.farm, Math.round(F.rnd(60, 190)));
          R.xpTo(p.skills.ranch, Math.round(F.rnd(44, 140)));
        } else if (roll < 0.92) {                /* 副职业 */
          R.xpTo(p.skills.cook, Math.round(F.rnd(60, 190)));
          R.xpTo(p.skills.alchemy, Math.round(F.rnd(60, 190)));
        } else {                                 /* 副本推进 */
          p.floor = Math.min(33, p.floor + 1);
          p.clears++;
          p.guildXp += Math.round(F.rnd(10000, 90000));
        }
        /* 偶尔换装备 */
        if (Math.random() < 0.10) {
          const combat = p.skills.combat.lv;
          p.equip.weapon = W[clamp(Math.floor(combat / 9), 0, 4)];
          p.equip.armor = A[clamp(Math.floor(combat / 10), 0, 3)];
        }
      }
      R.snapshot();
      R.onChange && R.onChange();
    },

    /* 给模拟玩家加技能经验（复用等级曲线） */
    xpTo(sk, n) {
      sk.xp += n;
      while (sk.lv < S.MAX && sk.xp >= S.need(sk.lv)) { sk.xp -= S.need(sk.lv); sk.lv++; }
      if (sk.lv >= S.MAX) sk.xp = 0;
    },

    byName(name) {
      return R.players.find(p => p.name === name) || null;
    },
    /* 玩家详情：装备 / 工具 / 全部技能等级 */
    playerInfo(name) {
      R.sync();
      let p = R.byName(name);
      /* 榜单外的人（如新好友）按需生成，等级从低起步 */
      if (!p) { p = mkPlayer(name, 2 + (hash(name) % 5)); R.players.push(p); R.snapshot(); }
      const skills = [];
      for (const k in SK) {
        const s = p.skills[k] || { lv: 1, xp: 0 };
        skills.push({ id: k, name: SK[k].name, icon: SK[k].icon, c: SK[k].c, lv: s.lv, xp: s.xp, need: S.need(s.lv) });
      }
      const tools = [];
      for (const k in TK) {
        const t = p.tools[k] || { lv: 1, xp: 0 };
        tools.push({ id: k, name: TK[k].name, icon: TK[k].icon, lv: t.lv, xp: t.xp, need: S.need(t.lv) });
      }
      return {
        name: p.name, self: !!p.self, avatar: p.avatar, job: p.job, guild: p.guild,
        lv: R.totalLv(p), kills: p.kills, coins: p.coins, floor: p.floor,
        equip: p.equip || {}, skills, tools,
      };
    },
  });
})();
