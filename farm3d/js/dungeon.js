/* ==========================================================================
 * 牧野田园 Open Farm  ·  世界塔副本（33 层）
 * 每层独立生成场地：随机怪物 + Boss，通关掉落，门票进入。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;

  const pt = (g, c, t, r, s) => ({ g, c, t, r, s });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 14, 1);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
  const merge = (arr) => F.mergeParts(arr);
  const CX = 0, CZ = -560;

  /* 每 5 层换一套主题配色 */
  const THEMES = [
    { name: '草原回廊', floor: 0x7fb060, wall: 0xa89478, pillar: 0xb0a894, light: 0xfff0d0 },
    { name: '石砖地窖', floor: 0x9a9285, wall: 0x77706a, pillar: 0x8a827a, light: 0xc8d0e0 },
    { name: '寒霜冰窟', floor: 0xa8d0e8, wall: 0x8fb4cc, pillar: 0xc0e0f0, light: 0xbfe8ff },
    { name: '熔岩深炉', floor: 0x8a5a44, wall: 0x6a4030, pillar: 0xa87050, light: 0xffb070 },
    { name: '水晶回音', floor: 0x9adcf4, wall: 0x7aa8c0, pillar: 0xb2e8fa, light: 0xaee8fc },
    { name: '星辉穹顶', floor: 0x6a6a94, wall: 0x50506e, pillar: 0x8a8ac0, light: 0xc0b0ff },
  ];

  const D = (F.Dungeon = {
    inside: false, floor: 0, cx: CX, cz: CZ, radius: 26, y: 0,
    group: null, cleared: false, clearedT: 0, reward: null, boss: null, exitPortal: null,
    mobTotal: 0, tickets: 0,

    theme(f) { return THEMES[Math.min(THEMES.length - 1, Math.floor((f - 1) / 5))]; },

    /* ---------------- 进入 ---------------- */
    enter(floor) {
      floor = clampInt(floor, 1, 33);
      if (D.inside) { F.UI.toast('你已经在副本里了', 'info'); return false; }
      if (!F.Game.has('ticket', 1)) {
        F.UI.toast('需要 1 张副本门票（材料商人处 200 金币 / 怪物掉落）', 'bad');
        F.Audio2.bad();
        return false;
      }
      F.Game.take('ticket', 1);
      D.tickets++;
      const fd = F.fade || (fn => fn());
      fd(() => {
        D.build(floor);
        const P = F.Player;
        D.inside = true;
        P.indoor = true;
        P.indoorY = D.y + 0.12;
        P.pos.set(D.cx, P.indoorY, D.cz + D.radius - 5);
        P.vy = 0;
        P.camDist = Math.min(P.camDist, 8.5);
        F.Inter.exitAll();
        F.UI.toast('进入世界塔 ' + floor + ' 层 · ' + D.theme(floor).name, 'ok');
        if (F.Social) F.Social.sys('副本：你消耗 1 张门票进入世界塔第 ' + floor + ' 层。');
      });
      return true;
    },

    build(floor) {
      D.clearArena();
      D.floor = floor;
      D.cleared = false; D.clearedT = 0;
      D.radius = Math.min(34, 24 + floor * 0.3);
      D.y = T.hAt(CX, CZ) + 70;
      const th = D.theme(floor);
      const R = D.radius;
      const g = new THREE.Group();
      const parts = [];
      /* 地面 */
      parts.push(pt(cyl(R, R, 0.5, 30), th.floor, [0, -0.25, 0]));
      parts.push(pt(cyl(R * 0.98, R * 0.98, 0.06, 30), darken(th.floor, 0.94), [0, 0.02, 0]));
      /* 外墙 */
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * 6.283;
        parts.push(pt(box(2.6, 5.4, 1.2), th.wall, [Math.cos(a) * (R + 0.4), 2.7, Math.sin(a) * (R + 0.4)], [0, -a, 0]));
      }
      /* 柱子与掩体（随机） */
      const seed = floor * 7919;
      let s = seed;
      const rr = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s % 10000) / 10000; };
      const nPillar = 6 + (floor % 7);
      for (let i = 0; i < nPillar; i++) {
        const a = rr() * 6.283, rad = 5 + rr() * (R - 9);
        const h = 2.4 + rr() * 2.6;
        parts.push(pt(cyl(0.85, 1.05, h, 8), th.pillar, [Math.cos(a) * rad, h / 2, Math.sin(a) * rad]));
      }
      for (let i = 0; i < 8 + (floor % 5); i++) {
        const a = rr() * 6.283, rad = 7 + rr() * (R - 11);
        parts.push(pt(ico(0.9 + rr() * 0.8, 0), darken(th.wall, 1.08), [Math.cos(a) * rad, 0.45, Math.sin(a) * rad], [rr(), rr() * 6, rr()], [1, 0.7, 1]));
      }
      /* Boss 台 */
      const isBoss = (floor % 5 === 0) || floor === 33;
      if (isBoss) {
        parts.push(pt(cyl(7.5, 8.2, 0.9, 20), darken(th.floor, 0.86), [0, 0.45, 0]));
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * 6.283;
          parts.push(pt(box(0.5, 3.2, 0.5), th.pillar, [Math.cos(a) * 7.4, 1.6, Math.sin(a) * 7.4]));
        }
      }
      const arena = new THREE.Mesh(merge(parts), F.MATS.std);
      arena.receiveShadow = true;
      g.add(arena);

      /* 灯 */
      const lamp = new THREE.PointLight(th.light, 1.25, 90, 1.5);
      lamp.position.set(0, 16, 0);
      g.add(lamp);
      const amb = new THREE.HemisphereLight(th.light, th.floor, 0.55);
      g.add(amb);

      /* 出口传送门（海洋色 · 旋转，与塔基传送门同款） */
      const portal = new THREE.Group();
      const pp = F.PROPS.portal({ r: 2.0, h: 2.2 });
      portal.add(pp.group);
      portal.position.set(0, 0, -(R - 4));
      g.add(portal);
      D.exitPortal = { x: CX, z: CZ - (R - 4), y: D.y, group: portal, portal: pp };

      g.position.set(CX, D.y, CZ);
      F.Player.scene.add(g);
      D.group = g;

      /* 怪物 */
      const lvMul = 1 + floor * 0.13;
      const kinds = ['boar', 'wolf', 'slime', 'bandit', 'bear'];
      const n = Math.min(24, 8 + Math.round(floor * 0.6));
      for (let i = 0; i < n; i++) {
        const a = rr() * 6.283, rad = 6 + rr() * (R - 10);
        const x = CX + Math.cos(a) * rad, z = CZ + Math.sin(a) * rad;
        const m = F.Combat.spawn(kinds[i % kinds.length], x, z, lvMul, 'dungeon', D.y + 0.12);
        if (m) m.angry = true;
      }
      D.mobTotal = n;
      if (isBoss) {
        const b = F.Combat.spawn(floor >= 25 ? 'boss_wyvern' : 'boss_boar', CX, CZ, lvMul * 1.1, 'dungeon', D.y + 0.12);
        if (b) { b.angry = true; D.boss = b; D.mobTotal++; }
      } else D.boss = null;
      D.reward = null;
    },

    clearArena() {
      if (D.group) {
        D.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
        F.Player.scene.remove(D.group);
      }
      D.group = null; D.exitPortal = null;
      if (F.Combat) F.Combat.clearRealm('dungeon');
    },

    onMobDie(m) {
      if (!D.inside || D.cleared) return;
      const left = F.Combat.aliveInRealm('dungeon');
      if (left <= 0) D.finish();
    },

    finish() {
      D.cleared = true; D.clearedT = 0;
      const f = D.floor;
      D.bestFloor = Math.max(D.bestFloor || 0, f);
      D.clears = (D.clears || 0) + 1;
      if (F.Rank) F.Rank.sync();
      const party = (F.Social && F.Social.party) ? F.Social.party.members.length : 1;
      const bonus = 1 + (party - 1) * 0.1;
      const coins = Math.round((60 + f * 34) * bonus);
      F.Game.addCoins(coins);
      const mats = ['iron', 'copper', 'tin', 'alum', 'silver', 'gold', 'crystal', 'herb', 'meat', 'leather', 'bone'];
      const id = F.choose(mats);
      const n = Math.round(F.rnd(4, 14));
      F.Game.give(id, n);
      let extra = '';
      if (f % 5 === 0 || f === 33) {
        const eq = ['sword_iron', 'armor_leather', 'ring_gold', 'cloak_fur', 'sword_silver', 'armor_silver', 'amulet_moon', 'armor_dragon', 'sword_gold'][Math.min(8, Math.floor(f / 4))];
        F.Game.give(eq, 1);
        extra = '，装备【' + F.itemName(eq) + '】';
      }
      if (Math.random() < 0.35) { F.Game.give('ticket', 1); extra += '，副本门票×1'; }
      if (F.Game.addGuildXp) F.Game.addGuildXp(500);
      F.UI.toast('副本通关！金币 +' + coins + '，' + F.itemName(id) + ' ×' + n + extra, 'ok');
      F.FX.text(F.Player.pos.x, F.Player.pos.y + 2.4, F.Player.pos.z, '第 ' + f + ' 层通关！', '#ffd24a');
      if (F.Social) F.Social.sys('副本：你通关了世界塔第 ' + f + ' 层（金币 +' + coins + '）');
      /* 奖励箱 */
      const cg = F.Combat.chestGeo;
      if (cg) {
        const m = new THREE.Mesh(cg, F.MATS.std);
        m.position.set(CX, D.y + 0.12, CZ + 2);
        m.scale.setScalar(1.4);
        F.Player.scene.add(m);
        D.reward = m;
      }
    },

    /* ---------------- 离开 ---------------- */
    exit() {
      if (!D.inside) return;
      const fd = F.fade || (fn => fn());
      fd(() => {
        const P = F.Player;
        D.inside = false;
        P.indoor = false;
        const V = F.Village;
        const rx = V && V.portal ? V.portal.x + 3 : 4, rz = V && V.portal ? V.portal.z + 6 : 104;
        P.pos.set(rx, T.hAt(rx, rz), rz);
        P.camDist = 7.2;
        D.clearArena();
        F.Inter.exitAll();
        F.UI.toast('离开副本，回到世界塔脚下', 'ok');
      });
    },

    nearExit(x, z, r) {
      if (!D.exitPortal) return false;
      return F.dist2(x, z, D.exitPortal.x, D.exitPortal.z) < r * r;
    },
    nearReward(x, z, r) {
      if (!D.reward) return false;
      return F.dist2(x, z, CX, CZ + 2) < r * r;
    },
    takeReward() {
      if (!D.reward) return;
      F.Player.scene.remove(D.reward);
      D.reward = null;
      const g = Math.round(F.rnd(80, 400));
      F.Game.addCoins(g);
      const pool = ['potion', 'potion_hp', 'potion_str', 'potion_luck', 'ticket', 'sword_iron', 'armor_leather'];
      const id = F.choose(pool);
      const n = id === 'ticket' ? Math.round(F.rnd(1, 2)) : Math.round(F.rnd(1, 3));
      F.Game.give(id, n);
      F.UI.toast('通关奖励：金币 +' + g + '，' + F.itemName(id) + ' ×' + n, 'ok');
      if (F.Social) F.Social.sys('掉落提醒：副本通关奖励 → 金币×' + g + '、' + F.itemName(id) + '×' + n);
    },

    clampPlayer(P) {
      const dx = P.pos.x - CX, dz = P.pos.z - CZ;
      const d = Math.hypot(dx, dz);
      const lim = D.radius - 1.2;
      if (d > lim) { P.pos.x = CX + dx / d * lim; P.pos.z = CZ + dz / d * lim; }
    },

    update(dt) {
      if (!D.inside) return;
      if (D.exitPortal) D.exitPortal.portal.update(dt);
      if (D.cleared) D.clearedT += dt;
      if (D.reward) D.reward.rotation.y += dt * 0.6;
      /* 掉出场地保护 */
      F.Dungeon.clampPlayer(F.Player);
    },
  });

  function clampInt(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }
  function darken(hex, k) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(k);
    return c.getHex();
  }
})();
