/* ==========================================================================
 * 牧野田园 Open Farm  ·  游戏装配与主循环
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp;

  let renderer, scene, camera, clockT = 0, elapsed = 0, saveT = 0, farmT = 0;

  const G = (F.Game = {
    time: 9.0, day: 1, can: 10, isNight: false, coins: 30,
    inv: {}, seedInv: {}, storage: {}, chest: {}, chestLv: 1,
    equip: { weapon: null, armor: null, trinket: null },
    stats: { gather: 0, till: 0, plant: 0, harvest: 0, build: 0, product: 0, fish: 0 },
    opt: { grass: 2, shadow: true, audio: true, timeScale: 150 },
    auto: null,

    /* ---------------- 物资 ---------------- */
    give(id, n) { G.inv[id] = (G.inv[id] || 0) + (n || 1); F.UI.syncHotbar && F.UI.syncHotbar(); },
    take(id, n) {
      if ((G.inv[id] || 0) < n) return false;
      G.inv[id] -= n; if (G.inv[id] <= 0) delete G.inv[id];
      F.UI.syncHotbar && F.UI.syncHotbar(); return true;
    },
    has(id, n) { return (G.inv[id] || 0) >= (n || 1); },
    canAfford(cost) {
      for (const k in cost) {
        if (k === 'coins') { if (G.coins < cost[k]) return false; continue; }
        if ((G.inv[k] || 0) < cost[k]) return false;
      }
      return true;
    },
    spend(cost) {
      if (!G.canAfford(cost)) return false;
      for (const k in cost) {
        if (k === 'coins') { G.coins -= cost[k]; continue; }
        G.take(k, cost[k]);
      }
      return true;
    },
    addCoins(n) { G.coins = Math.max(0, G.coins + (n || 0)); },
    /* 出售：返回所得金币 */
    sellItem(id, n) {
      n = Math.min(n || 1, G.inv[id] || 0);
      if (n <= 0) return 0;
      G.take(id, n);
      const gold = (F.priceOf(id) || 1) * n;
      G.addCoins(gold);
      return gold;
    },
    /* 体力药水：每秒 +5 体力，持续 3 秒 */
    usePotion() {
      if (!G.has('potion', 1)) { F.UI.toast('没有体力药水，可在工坊炼金制作', 'bad'); return; }
      G.take('potion', 1);
      F.Player.energyBuff = 3;
      F.UI.toast('饮下体力药水：每秒 +5 体力，持续 3 秒', 'ok');
      F.Audio2.ok();
    },

    /* ---------------- 装备 ---------------- */
    equipItem(id) {
      const e = F.EQUIP[id];
      if (!e) { F.UI.toast('这件物品不能装备', 'bad'); return; }
      if ((G.inv[id] || 0) < 1) { F.UI.toast('背包里没有这件装备', 'bad'); return; }
      const slot = e.slot;
      if (G.equip[slot]) G.give(G.equip[slot], 1);
      G.take(id, 1);
      G.equip[slot] = id;
      F.UI.toast('装备 ' + F.itemName(id) + (e.atk ? '（攻击 +' + e.atk + '）' : '') + (e.def ? '（防御 +' + e.def + '）' : ''), 'ok');
      F.Audio2.ok();
    },
    unequip(slot) {
      const id = G.equip[slot];
      if (!id) return;
      G.give(id, 1); G.equip[slot] = null;
      F.UI.toast('卸下 ' + F.itemName(id), 'info');
    },
    defense() {
      let d = 0;
      for (const s of ['armor', 'trinket']) {
        const id = G.equip[s];
        if (id && F.EQUIP[id]) d += F.EQUIP[id].def || 0;
      }
      return d;
    },

    /* ---------------- 通用「使用」---------------- */
    use(id) {
      if (!G.has(id, 1)) { F.UI.toast('没有这个物品', 'bad'); return; }
      if (id === 'potion') return G.usePotion();
      if (id === 'potion_hp') {
        G.take(id, 1);
        F.Player.hp = clamp(F.Player.hp + 40, 0, F.Player.hpMax);
        F.UI.toast('生命 +40', 'ok'); F.Audio2.ok(); return;
      }
      if (id === 'potion_str') {
        G.take(id, 1); F.Player.strT = 60;
        F.UI.toast('力量药剂：60 秒内攻击 +50%', 'ok'); F.Audio2.ok(); return;
      }
      if (id === 'potion_luck') {
        G.take(id, 1); F.Player.luckT = 120;
        F.UI.toast('幸运药剂：120 秒内掉落率提升', 'ok'); F.Audio2.ok(); return;
      }
      if (F.EQUIP[id]) return G.equipItem(id);
      if (G.foodOf(id) > 0 || G.staminaOf(id) > 0) return G.eat(id);
      F.UI.toast('这个物品不能直接使用', 'info');
    },

    /* 公会经验：采集 / 挖矿 / 钓鱼 / 战斗 / 副职业制作 每次 +1 */
    addGuildXp(n) { if (F.Social && F.Social.addGuildXp) F.Social.addGuildXp(n || 1); },
    /* 技能熟练度（排行榜依据） */
    addSkill(id, n) { if (F.Skills) F.Skills.add(id, n || 1); },
    /* 工具熟练度 */
    addTool(id, n) { if (F.Skills) F.Skills.addTool(id, n || 1); },
    costText(cost) { return Object.keys(cost).map(k => (k === 'coins' ? '金币' : F.itemName(k)) + '×' + cost[k]).join(' '); },
    seeds(k, d) {
      if (d === undefined) return G.seedInv[k] || 0;
      G.seedInv[k] = Math.max(0, (G.seedInv[k] || 0) + d);
      F.UI.syncHotbar && F.UI.syncHotbar();
      return G.seedInv[k];
    },
    /* 数值派生统一在 entities.js（F.foodOf / F.staminaOf），这里只做转发 */
    foodOf(id) { return F.foodOf(id); },
    staminaOf(id) { return F.staminaOf(id); },
    eat(id) {
      const f = G.foodOf(id), st = G.staminaOf(id);
      if ((!f && !st) || !G.has(id, 1)) { F.UI.toast('这个不能吃', 'bad'); return; }
      G.take(id, 1);
      const P = F.Player;
      if (f) P.hunger = clamp(P.hunger + f, 0, 100);
      /* 普通食物仍是「吃一口顺带回 6 点体力」，体力小食按 stam 给 */
      P.energy = clamp(P.energy + (st || (f ? 6 : 0)), 0, 100);
      F.UI.toast('食用 ' + F.itemName(id) + (st ? '（体力 +' + st + '）' : '（饥饿 +' + f + '）'), 'ok');
      F.Audio2.ok();
    },
    storeAll() {
      let n = 0;
      for (const k in G.inv) { if (G.inv[k] > 0) { G.storage[k] = (G.storage[k] || 0) + G.inv[k]; n += G.inv[k]; G.inv[k] = 0; delete G.inv[k]; } }
      F.UI.toast(n ? '存入 ' + n + ' 件物资' : '没有可存入的物资', n ? 'ok' : 'info');
    },
    takeAll() {
      let n = 0;
      for (const k in G.storage) { if (G.storage[k] > 0) { G.inv[k] = (G.inv[k] || 0) + G.storage[k]; n += G.storage[k]; G.storage[k] = 0; delete G.storage[k]; } }
      F.UI.toast(n ? '取出 ' + n + ' 件物资' : '仓库是空的', n ? 'ok' : 'info');
    },

    /* ---------------- 睡觉 / 休息 ---------------- */
    /* hours: 推进的小时数；energySet: 体力直接设为该值（缺省 +20） */
    rest(hours, energySet) {
      const doIt = () => {
        G.time += hours;
        while (G.time >= 24) { G.time -= 24; G.day++; }
        F.World.setTime(G.time);
        F.Player.energy = energySet != null ? clamp(energySet, 0, 100) : clamp(F.Player.energy + 20, 0, 100);
        F.Player.hunger = clamp(F.Player.hunger - hours * 1.6, 0, 100);
        F.Farm.update(hours * 20, 1);   // 休息期间作物继续生长
        F.UI.toast(hours >= 8 ? '睡了个好觉，体力全满，第 ' + G.day + ' 天开始了' : '休息了一会儿，体力恢复了不少', 'ok');
        G.save();
      };
      if (hours >= 8) fade(doIt); else doIt();
    },
    sleep() { G.rest(8, 100); },

    /* ---------------- 自动寻路 ---------------- */
    autoTo(x, z, label, act) {
      if (F.Player.indoor) { F.UI.toast('先走出房间', 'bad'); return; }
      G.auto = { x, z, label: label || '前往目标', act, t: 0 };
      F.UI.toast('自动寻路：' + (label || '前往目标'), 'info');
    },
    updateAuto(dt) {
      const a = G.auto;
      if (!a) return;
      const P = F.Player;
      if (P.indoor) { G.auto = null; return; }
      /* 手动移动立即取消 */
      const K = F.Input.keys;
      if (K[F.bind('forward')] || K[F.bind('left')] || K[F.bind('back')] || K[F.bind('right')]) { G.auto = null; F.UI.toast('已取消自动寻路', 'info'); return; }
      const dx = a.x - P.pos.x, dz = a.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      a.t += dt;
      if (d < 1.7 || a.t > 90) {
        G.auto = null;
        P.speed = 0;
        if (a.t > 90) { F.UI.toast('路被挡住了，自动寻路已停止', 'bad'); return; }
        if (a.act) a.act();
        return;
      }
      const step = Math.min(4.3 * dt, d);
      P.pos.x += dx / d * step;
      P.pos.z += dz / d * step;
      P.pos.y = Math.max(T.hAt(P.pos.x, P.pos.z), T.WATER);
      P.rot += F.angDelta(P.rot, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
      P.speed = 4.3;
    },

    /* ---------------- 储物箱（屋内，可升级） ---------------- */
    chestCap() { return [0, 12, 20, 30, 42][G.chestLv] || 12; },
    chestSlots() { return Object.keys(G.chest).filter(k => G.chest[k] > 0).length; },
    chestStoreAll() {
      let n = 0;
      for (const k in G.inv) {
        if (!G.inv[k]) continue;
        if (!(G.chest[k] > 0) && G.chestSlots() >= G.chestCap()) { F.UI.toast('储物箱格子已满，先升级储物箱', 'bad'); break; }
        G.chest[k] = (G.chest[k] || 0) + G.inv[k]; n += G.inv[k]; delete G.inv[k];
      }
      F.UI.toast(n ? '存入储物箱 ' + n + ' 件' : '背包里没有可存入的物资', n ? 'ok' : 'info');
    },
    chestTakeAll() {
      let n = 0;
      for (const k in G.chest) { if (G.chest[k] > 0) { G.inv[k] = (G.inv[k] || 0) + G.chest[k]; n += G.chest[k]; delete G.chest[k]; } }
      F.UI.toast(n ? '从储物箱取出 ' + n + ' 件' : '储物箱是空的', n ? 'ok' : 'info');
    },
    chestUpgradeCost() {
      return [{ board: 4, coins: 20 }, { board: 8, brick: 4, coins: 60 }, { board: 12, brick: 8, iron_ingot: 2, coins: 150 }][G.chestLv - 1] || null;
    },
    chestUpgrade() {
      if (G.chestLv >= 4) { F.UI.toast('储物箱已是最高级', 'info'); return; }
      const c = G.chestUpgradeCost();
      if (!G.canAfford(c)) { F.UI.toast('材料不足：' + F.Game.costText(c), 'bad'); F.Audio2.bad(); return; }
      G.spend(c);
      G.chestLv++;
      F.Audio2.ok();
      F.UI.toast('储物箱升级到 ' + G.chestLv + ' 级（容量 ' + G.chestCap() + ' 格）', 'ok');
    },

    /* ---------------- 存档 ---------------- */
    save() {
      try {
        const data = {
          v: F.Migrate.CURRENT, time: G.time, day: G.day, can: G.can, inv: G.inv, seeds: G.seedInv, storage: G.storage,
          coins: G.coins, chest: G.chest, chestLv: G.chestLv,
          equip: G.equip, hp: F.Player.hp,
          talents: G.talents, talentPts: G.talentPts,            /* S2 天赋：先占位，本轮只追随保存 */
          abil: F.Ability ? F.Ability.slots.slice() : null,      /* 技能装配槽 */
          skills: F.Skills ? F.Skills.data : null, tools: F.Skills ? F.Skills.tools : null,
          mounts: F.Mounts ? F.Mounts.saveData() : null,
          weather: F.Weather ? F.Weather.saveData() : null, arena: F.Arena ? F.Arena.saveData() : null,
          home: F.HomeBuild ? F.HomeBuild.saveData() : null,
          quest: F.Quest ? F.Quest.saveData() : null, bmarket: F.BMarket ? F.BMarket.saveData() : null,
          bestFloor: F.Dungeon ? (F.Dungeon.bestFloor || 0) : 0,
          guild: F.Social.guild ? { name: F.Social.guild.name, level: F.Social.guild.level, xp: F.Social.guild.xp, notice: F.Social.guild.notice } : null,
          stats: G.stats, opt: G.opt,
          px: F.Player.pos.x, pz: F.Player.pos.z, hunger: F.Player.hunger, energy: F.Player.energy,
          builds: F.Builds.list.map(b => ({ id: b.id, x: b.x, z: b.z, r: b.rot, s: b.stored || 0, d: b.door || 0 })),
          tiles: F.Farm.tiles.filter(t => t.state > 0).map(t => ({ k: t.zone + '_' + t.tx + '_' + t.tz, s: t.state, c: t.crop, g: t.growth, w: t.water })),
          animals: F.Animals.list.map(a => ({ t: a.type, x: a.x, z: a.z, h: a.hunger, a: a.age, p: a.product })),
        };
        localStorage.setItem('farm3d_save_v1', JSON.stringify(data));
        return true;
      } catch (e) { return false; }
    },
    load() {
      try {
        const raw = localStorage.getItem('farm3d_save_v1');
        if (!raw) return false;
        const d = F.Migrate.run(JSON.parse(raw));       /* 旧档逐版本迁移到当前 schema，只加字段不清档 */
        G.time = d.time || 9; G.day = d.day || 1; G.can = d.can != null ? d.can : 10;
        G.coins = d.coins != null ? d.coins : 30;
        G.chest = d.chest || {}; G.chestLv = d.chestLv || 1;
        G.talents = d.talents || {}; G.talentPts = d.talentPts || 0;
        if (F.Ability && Array.isArray(d.abil)) {
          for (let i = 0; i < 3; i++) F.Ability.setSlot(i, d.abil[i] || F.Ability.slots[i]);
        }
        G.equip = Object.assign({ weapon: null, armor: null, trinket: null }, d.equip || {});
        if (d.hp != null) F.Player.hp = clamp(d.hp, 1, 100);
        if (d.guild && F.Social.guild) {
          F.Social.guild.name = d.guild.name || F.Social.guild.name;
          F.Social.guild.level = d.guild.level || 0;
          F.Social.guild.xp = d.guild.xp || 0;
          F.Social.guild.notice = d.guild.notice || F.Social.guild.notice;
        }
        if (F.Skills) {
          if (d.skills) for (const k in d.skills) F.Skills.data[k] = { lv: d.skills[k].lv || 1, xp: d.skills[k].xp || 0 };
          if (d.tools) for (const k in d.tools) F.Skills.tools[k] = { lv: d.tools[k].lv || 1, xp: d.tools[k].xp || 0 };
        }
        if (F.Dungeon && d.bestFloor) F.Dungeon.bestFloor = d.bestFloor;
        if (F.Mounts && d.mounts) F.Mounts.loadData(d.mounts);
        if (F.Weather && d.weather) F.Weather.loadData(d.weather);
        if (F.Arena && d.arena) F.Arena.loadData(d.arena);
        if (F.HomeBuild && d.home) F.HomeBuild.loadData(d.home);
        if (F.Quest && d.quest) F.Quest.loadData(d.quest);
        if (F.BMarket && d.bmarket) F.BMarket.loadData(d.bmarket);
        G.inv = d.inv || {}; G.seedInv = d.seeds || {}; G.storage = d.storage || {};
        G.stats = Object.assign(G.stats, d.stats || {});
        G.opt = Object.assign(G.opt, d.opt || {});
        F.Player.hunger = d.hunger != null ? d.hunger : 90;
        F.Player.energy = d.energy != null ? d.energy : 100;
        if (d.px != null) { F.Player.pos.x = d.px; F.Player.pos.z = d.pz; F.Player.pos.y = T.hAt(d.px, d.pz); }
        for (const b of d.builds || []) {
          const nb = F.Builds.add(b.id, b.x, b.z, b.r || 0, true);
          if (nb) { nb.stored = b.s || 0; nb.door = b.d || 0; }
        }
        for (const t of d.tiles || []) {
          const tt = F.Farm.map[t.k];
          if (!tt) continue;
          tt.state = t.s; tt.crop = t.c; tt.growth = t.g; tt.water = t.w;
          if (tt.state >= 1) { F.Farm.allocSoil(tt); F.Farm.setSoilColor(tt, tt.water > 0.3 ? 0x6f5238 : 0xa89878); }
          if (tt.state === 2 && tt.crop) { F.Farm.allocCrop(tt, tt.crop); F.Farm.updateCropVisual(tt); }
        }
        for (const a of d.animals || []) {
          const na = F.Animals.spawn(a.t, a.x, a.z, a.a != null ? a.a : 1);
          if (na) { na.hunger = a.h != null ? a.h : 70; na.product = a.p || 0; }
        }
        return true;
      } catch (e) { console.warn('读档失败', e); return false; }
    },
    reset() {
      localStorage.removeItem('farm3d_save_v1');
      for (const b of F.Builds.list.slice()) F.Builds.remove(b);
      for (const a of F.Animals.list.slice()) F.Animals.remove(a);
      for (const t of F.Farm.tiles) if (t.state > 0) F.Farm.clear(t);
      G.inv = {}; G.seedInv = {}; G.storage = {}; G.chest = {}; G.chestLv = 1;
      G.coins = 30; G.day = 1; G.time = 9; G.can = 10; G.auto = null;
      G.stats = { gather: 0, till: 0, plant: 0, harvest: 0, build: 0, product: 0, fish: 0 };
      G.equip = { weapon: null, armor: null, trinket: null };
      if (F.Skills) F.Skills.init();
      if (F.Mounts) F.Mounts.reset();
      if (F.Arena) F.Arena.reset();
      if (F.Quest) F.Quest.reset();
      if (F.BMarket) F.BMarket.reset();
      if (F.HomeBuild) F.HomeBuild.reset();
      if (F.Dungeon) F.Dungeon.bestFloor = 0;
      F.Player.pos.set(4, T.hAt(4, 104), 104);
      F.Player.hunger = 90; F.Player.energy = 100; F.Player.hp = 100;
      starterItems(); starterBuilds();
      F.World.setTime(G.time);
    },

    /* ---------------- 主循环 ---------------- */
    update(dt) {
      elapsed += dt;
      /* 时间流逝 */
      if (G.opt.timeScale > 0) {
        G.time += dt * (G.opt.timeScale / 100) * (1 / 60);
        if (G.time >= 24) { G.time -= 24; G.day++; }
        F.World.setTime(G.time);
      }
      /* 自动寻路 */
      G.updateAuto(dt);
      /* 实体 */
      F.Player.update(dt, false);
      F.Animals.update(dt, F.Player);
      F.Fish.update(dt);
      F.Nodes.update(dt);
      F.Farm.update(dt, F.Weather ? F.Weather.m('growth', 1) : 1);
      farmT -= dt;
      if (farmT <= 0) { farmT = 0.5; F.Farm.visualTick(); }
      F.Builds.update(dt, G.isNight);
      F.Drops.update(dt, F.Player.pos.x, F.Player.pos.z);
      F.FX.update(dt);
      F.Inter.update(dt);
      F.Combat.update(dt);
      if (F.Ability) F.Ability.update(dt);
      F.Village.update(dt);
      F.Dungeon.update(dt);
      F.Social.tick(dt);
      F.Rank.tick(dt);
      F.Mounts.update(dt);
      F.Arena.update(dt);
      if (F.Quest) F.Quest.update(dt);
      if (F.BMarket) F.BMarket.update(dt);
      if (F.HomeBuild) F.HomeBuild.placed = F.Builds.list.filter(b => b.def && b.def.home).length;
      F.World.update(dt, elapsed, F.Player.pos);
      F.World.updateGrass(F.Player.pos.x, F.Player.pos.z, dt);
      F.Weather.update(dt, F.Player.pos);
      F.UI.update(dt, G);
      F.UI2.update(dt);

      saveT -= dt;
      if (saveT <= 0) { saveT = 30; G.save(); }
    },
  });

  /* ------------------------- 淡入淡出 ------------------------- */
  function fade(fn) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;background:#0a1210;opacity:0;transition:opacity .45s;z-index:40;pointer-events:none';
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = '1'; });
    setTimeout(() => {
      fn();
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 500);
    }, 480);
  }
  F.fade = fade;

  /* ------------------------- 初始内容 ------------------------- */
  function starterItems() {
    G.inv = { wood: 70, stone: 45, fiber: 22, hay: 14, branch: 10, herb: 4, flower: 5, mushroom: 2 };
    G.seedInv = { wheat: 24, carrot: 16, corn: 12, pumpkin: 8, tomato: 14 };
    G.can = 10; G.coins = 30;
  }

  function starterBuilds() {
    const B = F.Builds;
    B.add('house', 2, 92, 0, true);
    B.add('storage', 11, 90, -0.4, true);
    B.add('campfire', -5, 100, 0.5, true);
    B.add('lamp', 9, 100, 0, true);
    B.add('lamp', -9, 96, 0, true);
    B.add('workshop', -14, 92, 0.6, true);
    B.add('depot', 16, 98, 0.3, true);
    B.add('haystack', -8, 106, 0, true);
    /* 两座跨河木桥（自动对齐河道法向） */
    [[-20], [110]].forEach(([bx]) => {
      const rz = T.riverZ(bx);
      const slope = (T.riverZ(bx + 0.5) - T.riverZ(bx - 0.5));
      const rot = Math.atan2(1, -slope);   // 桥身垂直于河流走向
      for (let k = -1; k <= 1; k++) {
        const off = k * 13.6;
        const x = bx + Math.cos(rot) * off;
        const z = rz - Math.sin(rot) * off;
        B.add('bridge', x, z, rot, true);
      }
    });
    /* 湖畔钓鱼台 */
    B.add('dock', 122, -108, 0.2, true);
    B.add('dock', 96, -178, 1.9, true);
  }

  /* 手机 / 平板（粗指针设备）：一次判定，后面几处降档都用得着。
     ponytail: 必须「没有精确指针」才算手机 —— 触屏笔记本/一体机 maxTouchPoints>1，
     旧判定会把它们误伤成手机档：草锁低档、阴影默认关、渲染比压到 1.25 */
  const COARSE = (F.coarseDevice = !!(
    (window.matchMedia && matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1) &&
    !(window.matchMedia && matchMedia('(pointer: fine)').matches)
  ));

  /* ------------------------- 启动 ------------------------- */
  const TASKS = [
    ['正在创建渲染器…', () => {
      const canvas = F.$('#cv');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
      /* 手机 / 平板的像素比再压一档（是填充率大户）；桌面端维持 1.75 上限不变 */
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, F.coarseDevice ? 1.25 : 1.75));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.15, 2400);
      camera.position.set(2, 12, 110);
    }],
    ['正在烘焙地形与铺设水域…', () => { F.World.init(scene, renderer); }],
    ['正在结识村民与组建公会…', () => { F.Social.init(); F.Rank.init(); F.Mounts.init(scene); F.HomeBuild.init(); F.Weather.init(scene); F.Arena.init(); F.UI2.init(); }],
    ['正在张贴公告与开门营业…', () => { if (F.Quest) F.Quest.init(); if (F.BMarket) F.BMarket.init(); }],
    ['正在规划农田与播撒资源…', () => { F.Farm.init(scene); F.Nodes.init(scene); }],
    ['正在安置畜禽与鱼群…', () => {
      F.Builds.init(scene);
      F.Animals.init(scene);
      F.Fish.init(scene);
      F.Drops.init(scene);
    }],
    ['正在搭建营地…', () => {
      F.UI.init();
      F.Player.init(scene, camera);
      F.House.init(scene);
      F.Combat.init(scene);
      F.Ability.init(scene); F.Ability.buildHud();
      F.Village.init(scene);
      F.FX.init(scene, camera, F.$('#floatlayer'));
      F.Inter.init(scene, camera);
      F.Input.init(F.$('#cv'));
    }],
    ['正在唤醒晨光…', () => {
      const hasSave = G.load();
      if (!hasSave) { starterItems(); starterBuilds(); }
      /* 手机 / 平板自动降植被与草画质，保住帧率但仍显茂密（首次进入还默认关阴影） */
      if (COARSE && !hasSave) { G.opt.grass = Math.min(G.opt.grass, 1); G.opt.shadow = false; }
      F.World.setTime(G.time);
      F.World.setGrassQuality(G.opt.grass);
      if (COARSE && F.World.setFloraDensity) F.World.setFloraDensity(1.5);   /* 移动端植被降密度 */
      F.World.setShadows(G.opt.shadow);
      F.Audio2.on = G.opt.audio;
      F.Player.setTool('hoe');
      F.Player.updateCamera(0, true);
      F.UI.toast(hasSave ? '欢迎回到牧野田园' : '欢迎来到牧野田园，先去开垦几块地吧', 'ok');
    }],
  ];

  let taskI = 0;
  function runTask() {
    const bar = F.$('#lbar i'), tip = F.$('#ltip');
    if (taskI >= TASKS.length) {
      F.$('#loading').style.display = 'none';
      /* 进入世界：藏起鼠标指针，Esc 取回（只在画布上生效，UI 悬停照旧显示箭头） */
      if (F.UI && F.UI.setCursor) F.UI.setCursor(true);
      start();
      return;
    }
    const [label, fn] = TASKS[taskI];
    tip.textContent = label;
    bar.style.width = (8 + (taskI / TASKS.length) * 92) + '%';
    setTimeout(() => {
      try { fn(); } catch (e) { console.error(e); tip.textContent = '出错了：' + e.message; }
      taskI++;
      runTask();
    }, 30);
  }

  function start() {
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try { G.update(dt); } catch (e) { console.error(e); }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    addEventListener('beforeunload', () => G.save());
    addEventListener('pointerdown', () => { F.Audio2.init(); }, { once: true });
    window.addEventListener('keydown', () => { F.Audio2.init(); }, { once: true });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') runTask();
  else addEventListener('DOMContentLoaded', runTask);

})();
