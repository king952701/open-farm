/* ==========================================================================
 * 牧野田园 Open Farm  ·  新手村 / 商人 NPC / 世界塔 / 副本传送门
 * 村庄自动选址在平整地块上：石砌广场 + 木屋 + 摊位商人 + 33 层世界塔。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;

  const pt = (g, c, t, r, s) => ({ g, c, t, r, s });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 10, 1);
  const cone = (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 10, 1);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
  const merge = (arr) => F.mergeParts(arr);

  /* ============================ 商人 / 商店表 ============================ */
  const SHOPS = (F.SHOPS = {
    general: {
      name: '杂货商人 · 老麦', shirt: 0xd8a860, cat: '杂货',
      tip: '什么都卖一点，也回收你的杂物。',
      price: { rope: 20, hay: 8, flour: 30, baked: 60, branch: 3, fiber: 4, potion_hp: 40 },
    },
    armor: {
      name: '防具商人 · 铁卫', shirt: 0x8a9ab0, cat: '防具',
      tip: '皮甲到龙鳞甲，护甲越厚命越硬。',
      price: { armor_leather: 90, cloak_fur: 240, armor_silver: 640, armor_dragon: 2400 },
    },
    material: {
      name: '材料商人 · 石伯', shirt: 0x9a8a70, cat: '材料',
      tip: '矿石、木材与副本门票都在这里。',
      price: { wood: 6, stone: 6, iron: 14, copper: 12, tin: 14, alum: 18, silver: 24, gold: 40, crystal: 30, ticket: 200 },
    },
    jewelry: {
      name: '首饰商人 · 珠娘', shirt: 0xc88ad0, cat: '首饰',
      tip: '戒指与护符能提升你的生存能力。',
      price: { ring_gold: 360, amulet_moon: 1400, gem_crystal: 80, gem_rainbow: 300 },
    },
    alchemist: {
      name: '炼金师 · 药翁', shirt: 0x7ac0a0, cat: '炼金',
      tip: '系统材料只在此出售；大世界材料 + 系统材料 = 药剂。',
      price: { alkahest: 40, mana_powder: 60, crystal_dust: 80, herb: 12, mushroom: 16, flower: 12 },
    },
    blacksmith: {
      name: '铁匠 · 炉心', shirt: 0xb06a4a, cat: '武器',
      tip: '好剑是冒险者的第二条命。',
      price: { sword_wood: 20, sword_iron: 120, sword_silver: 520, sword_gold: 1800, iron_ingot: 40, bronze: 90 },
    },
    tailor: {
      name: '裁缝 · 织娘', shirt: 0xd88ab0, cat: '布甲',
      tip: '皮革与毛发在这里也能买到。',
      price: { leather: 20, fur: 12, wool: 18, cloak_fur: 240 },
    },
    auctioneer: {
      name: '拍卖师 · 金秤', shirt: 0xe0c060, cat: '拍卖',
      tip: '在拍卖师处上架物品，手续费减免 20%。',
      price: {},
    },
  });

  /* 炼金配方：大世界产出材料 + 炼金术系统材料 */
  F.ALCHEMY = [
    { id: 'potion', name: '体力药水', cost: { herb: 3, flower: 2, mushroom: 1 }, out: 2, desc: '每秒恢复 5 点体力，持续 3 秒' },
    { id: 'potion_hp', name: '治疗药水', cost: { herb: 2, alkahest: 1 }, out: 1, desc: '立即恢复 40 点生命' },
    { id: 'potion_str', name: '力量药剂', cost: { bone: 2, mana_powder: 1 }, out: 1, desc: '60 秒内攻击 +50%' },
    { id: 'potion_luck', name: '幸运药剂', cost: { flower: 3, crystal_dust: 1 }, out: 1, desc: '120 秒内掉落率提升' },
  ];

  /* ============================ 村庄 ============================ */
  const V = (F.Village = {
    x: 0, z: 0, y: 0, radius: 26, npcs: [], built: false, portal: null, tower: null,

    /* 自动选址：外圈 110~190 米内找一块最平整的陆地 */
    findSpot() {
      let best = null, bestScore = 1e9;
      for (let r = 110; r <= 200; r += 10) {
        for (let a = 0; a < 24; a++) {
          const ang = (a / 24) * Math.PI * 2 + r * 0.11;
          const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
          if (T.isWater(cx, cz) || T.hAt(cx, cz) < T.WATER + 1.2) continue;
          let lo = 1e9, hi = -1e9, ok = true;
          for (let k = 0; k < 8; k++) {
            const aa = k / 8 * 6.283;
            for (const rr of [0, 12, 22]) {
              const h = T.hAt(cx + Math.cos(aa) * rr, cz + Math.sin(aa) * rr);
              if (T.isWater(cx + Math.cos(aa) * rr, cz + Math.sin(aa) * rr)) { ok = false; break; }
              lo = Math.min(lo, h); hi = Math.max(hi, h);
            }
            if (!ok) break;
          }
          if (!ok) continue;
          const score = hi - lo;
          if (score < bestScore) { bestScore = score; best = { x: cx, z: cz, y: (lo + hi) / 2 }; }
          if (score < 1.2) return best;
        }
      }
      return best || { x: 0, z: 150, y: T.hAt(0, 150) };
    },

    safe(x, z) { if (!V.built) return false; return F.dist2(x, z, V.x, V.z) < 30 * 30; },

    init(scene) {
      if (V.built) return;
      V.built = true;
      const s = V.findSpot();
      V.x = s.x; V.z = s.z; V.y = s.y;
      V.scene = scene;
      const g = new THREE.Group();
      scene.add(g);
      V.group = g;

      /* 石砌广场 */
      const plaza = new THREE.Mesh(merge([
        pt(cyl(14, 14.6, 1.4, 26), 0xa8a094, [0, 0, 0]),
        pt(cyl(13.2, 13.2, 0.12, 26), 0xc0b8a8, [0, 0.72, 0]),
        pt(cyl(4.2, 4.2, 0.14, 20), 0x8fb0c8, [0, 0.80, 0]),
        pt(cyl(1.1, 1.3, 0.9, 10), 0xb0a894, [0, 1.20, 0]),
        pt(cyl(1.5, 1.5, 0.16, 12), 0x9fb8c8, [0, 1.62, 0]),
      ]), F.MATS.std);
      plaza.position.set(V.x, V.y - 0.55, V.z);
      plaza.receiveShadow = true;
      g.add(plaza);
      V.top = V.y - 0.55 + 0.78;   /* 广场地面高度 */

      /* 木屋 */
      const hutGeo = merge([
        pt(box(4.6, 2.4, 4.0), 0xc9a878, [0, 1.2, 0]),
        pt(box(4.7, 0.12, 4.1), 0xb08f62, [0, 0.5, 0]),
        pt(cone(3.6, 1.9, 4), 0x8f5b46, [0, 3.35, 0], [0, Math.PI / 4, 0]),
        pt(box(4.9, 0.14, 4.3), 0x7a5a52, [0, 2.44, 0]),
        pt(box(1.1, 1.8, 0.12), 0x6f5a44, [0, 1.05, 2.06]),
        pt(box(0.9, 0.8, 0.10), 0x9fd3e8, [-1.4, 1.6, 2.04]),
        pt(box(0.9, 0.8, 0.10), 0x9fd3e8, [1.4, 1.6, 2.04]),
      ]);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * 6.283 + 0.4;
        const hx = V.x + Math.cos(a) * 21, hz = V.z + Math.sin(a) * 21;
        const hut = new THREE.Mesh(hutGeo, F.MATS.std);
        hut.position.set(hx, T.hAt(hx, hz) - 0.3, hz);
        hut.rotation.y = -a + Math.PI / 2;
        hut.castShadow = true; hut.receiveShadow = true;
        g.add(hut);
      }

      /* 商人（8 位，围在广场边） */
      const ids = Object.keys(SHOPS);
      ids.forEach((id, i) => {
        const a = i / ids.length * 6.283 + 0.25;
        const nx = V.x + Math.cos(a) * 10.5, nz = V.z + Math.sin(a) * 10.5;
        const sh = SHOPS[id];
        const c = F.PROPS.character({ shirt: sh.shirt });
        c.group.position.set(nx, V.top, nz);
        c.group.rotation.y = -a - Math.PI / 2;
        c.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
        g.add(c.group);
        /* 摊位 */
        const stall = new THREE.Mesh(merge([
          pt(box(2.0, 0.14, 1.0), 0xb08f62, [0, 0.86, 0]),
          pt(box(0.12, 0.86, 0.12), 0x6f5a44, [-0.85, 0.43, -0.35]),
          pt(box(0.12, 0.86, 0.12), 0x6f5a44, [0.85, 0.43, -0.35]),
          pt(box(0.12, 0.86, 0.12), 0x6f5a44, [-0.85, 0.43, 0.35]),
          pt(box(0.12, 0.86, 0.12), 0x6f5a44, [0.85, 0.43, 0.35]),
          pt(box(2.2, 0.10, 1.2), 0xd86a5a, [0, 1.62, 0], [0, 0, 0.10]),
          pt(box(0.34, 0.30, 0.34), 0xe8e0c0, [-0.6, 1.08, 0]),
          pt(box(0.30, 0.26, 0.30), 0x9ad0e8, [0.2, 1.05, 0.1]),
        ]), F.MATS.std);
        stall.castShadow = true;
        /* 摊位放在商人内侧（朝广场中心）：商人站在柜台后面，不再嵌进桌子里 */
        stall.position.set(nx - Math.cos(a) * 1.2, V.top, nz - Math.sin(a) * 1.2);
        stall.rotation.y = -a - Math.PI / 2;
        g.add(stall);
        V.npcs.push({ id, name: sh.name, x: nx, z: nz, y: V.top, mesh: c.group, shop: sh, bob: Math.random() * 6.283 });
      });

      V.buildBoard(scene);
      V.buildMarket(scene);
      V.buildTower(scene);
    },

    /* ---------------- 公告板：悬赏任务 + 名人堂 ---------------- */
    buildBoard(scene) {
      const bx = V.x + Math.cos(1.35) * 12.6, bz = V.z + Math.sin(1.35) * 12.6;
      const parts = [
        pt(box(0.22, 2.4, 0.22), 0x7a5a44, [-1.5, 1.2, 0]),
        pt(box(0.22, 2.4, 0.22), 0x7a5a44, [1.5, 1.2, 0]),
        pt(box(3.5, 2.1, 0.16), 0xc9a878, [0, 1.75, 0]),
        pt(box(3.7, 0.18, 0.34), 0x8a6a4a, [0, 2.66, 0]),
        pt(box(2.9, 1.5, 0.06), 0xf0e4c8, [0, 1.75, 0.12]),
        /* 贴在板上的三张小纸片（象征悬赏与榜帖） */
        pt(box(0.80, 1.00, 0.03), 0xffffff, [-0.95, 1.80, 0.17], [0, 0, 0.03]),
        pt(box(0.80, 1.00, 0.03), 0xfff4d8, [0.00, 1.80, 0.17], [0, 0, -0.04]),
        pt(box(0.80, 1.00, 0.03), 0xfff0e8, [0.95, 1.80, 0.17], [0, 0, 0.02]),
        pt(box(3.6, 0.16, 0.9), 0xa89880, [0, 0.08, 0]),
      ];
      const board = new THREE.Mesh(merge(parts), F.MATS.std);
      board.position.set(bx, V.top, bz);
      board.rotation.y = -1.35 - Math.PI / 2;
      board.castShadow = true; board.receiveShadow = true;
      scene.add(board);
      const bpos = { x: bx, z: bz, y: V.top, mesh: board };
      V.board = bpos;
      V.nearBoard = function (x, z, r) { return !!V.board && F.dist2(x, z, V.board.x, V.board.z) < r * r; };
    },

    /* ---------------- 黑市：紫色帐篷 + 柜台 ---------------- */
    buildMarket(scene) {
      const mx = V.x + Math.cos(3.1) * 13.4, mz = V.z + Math.sin(3.1) * 13.4;
      const parts = [
        pt(box(2.6, 0.16, 1.2), 0x6a4a68, [0, 0.9, 0]),
        pt(box(0.14, 0.9, 0.14), 0x4a3050, [-1.1, 0.45, -0.45]),
        pt(box(0.14, 0.9, 0.14), 0x4a3050, [1.1, 0.45, -0.45]),
        pt(box(0.14, 0.9, 0.14), 0x4a3050, [-1.1, 0.45, 0.45]),
        pt(box(0.14, 0.9, 0.14), 0x4a3050, [1.1, 0.45, 0.45]),
        pt(cone(2.5, 1.5, 4), 0x5a3a68, [0, 3.1, 0], [0, Math.PI / 4, 0]),
        pt(box(0.10, 1.5, 0.10), 0x3a2848, [-1.5, 2.3, -0.6]),
        pt(box(0.10, 1.5, 0.10), 0x3a2848, [1.5, 2.3, -0.6]),
        pt(box(0.10, 1.5, 0.10), 0x3a2848, [-1.5, 2.3, 0.6]),
        pt(box(0.10, 1.5, 0.10), 0x3a2848, [1.5, 2.3, 0.6]),
        pt(box(0.5, 0.5, 0.5), 0xd8b060, [-0.7, 1.22, 0]),
        pt(box(0.4, 0.4, 0.4), 0x9ad0e8, [0.5, 1.15, 0.1]),
        pt(box(0.9, 0.5, 0.9), 0x2a2038, [0, 0.25, 1.6]),
      ];
      const tent = new THREE.Mesh(merge(parts), F.MATS.std);
      tent.position.set(mx, V.top, mz);
      tent.rotation.y = -3.1 - Math.PI / 2;
      tent.castShadow = true; tent.receiveShadow = true;
      scene.add(tent);
      V.broker = { x: mx, z: mz, y: V.top, mesh: tent };
      V.nearBroker = function (x, z, r) { return !!V.broker && F.dist2(x, z, V.broker.x, V.broker.z) < r * r; };
      /* 门口一名黑市管事 */
      const c = F.PROPS.character({ shirt: 0x6a5aa0, pants: 0x2a2438 });
      c.group.position.set(mx - Math.cos(3.1) * 1.3, V.top, mz - Math.sin(3.1) * 1.3);
      c.group.rotation.y = -3.1 - Math.PI / 2;
      c.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(c.group);
      V.brokerNpc = c.group;
    },

    /* ---------------- 世界塔：欧式圆柱、白色条纹、33 层 ---------------- */
    buildTower(scene) {
      const FLOORS = 33;
      const tx = V.x + Math.cos(0.9) * 40, tz = V.z + Math.sin(0.9) * 40;
      const baseY = T.hAt(tx, tz);
      const parts = [pt(cyl(11.5, 12.2, 1.6, 22), 0xc8c0b0, [0, 0.8, 0])];
      for (let i = 0; i < FLOORS; i++) {
        const h = 3.05;
        const y = 1.6 + i * h + h / 2;
        const r0 = lerpR(9.2, 6.6, i / (FLOORS - 1));
        const r1 = lerpR(9.2, 6.6, (i + 1) / (FLOORS - 1));
        const col = (i % 2 === 0) ? 0xf2efe6 : 0xdfe0d8;   /* 白色条纹 */
        parts.push(pt(cyl(r1, r0, h, 20), col, [0, y, 0]));
        /* 每层腰线 + 小窗 */
        parts.push(pt(cyl(r0 + 0.22, r0 + 0.22, 0.16, 20), 0xc8c4b8, [0, 1.6 + i * h, 0]));
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * 6.283 + i * 0.18;
          parts.push(pt(box(0.9, 1.1, 0.16), 0x8fb8cc, [Math.cos(a) * (r0 - 0.1), y, Math.sin(a) * (r0 - 0.1)], [0, -a, 0]));
        }
      }
      const topY = 1.6 + FLOORS * 3.05;
      parts.push(pt(cyl(7.2, 7.2, 0.5, 20), 0xc8c4b8, [0, topY + 0.25, 0]));
      parts.push(pt(cone(7.6, 8.5, 20), 0x8a5a4a, [0, topY + 4.6, 0]));
      parts.push(pt(cyl(0.5, 0.8, 2.0, 8), 0xd9b04a, [0, topY + 9.4, 0]));
      const tower = new THREE.Mesh(merge(parts), F.MATS.std);
      tower.position.set(tx, baseY - 0.6, tz);
      tower.castShadow = true; tower.receiveShadow = true;
      scene.add(tower);
      V.tower = { x: tx, z: tz, y: baseY - 0.6, mesh: tower, floors: FLOORS };

      /* 塔基传送门（海洋色 · 旋转模型，复用 F.PROPS.portal） */
      const portal = new THREE.Group();
      const pp = F.PROPS.portal({ r: 2.2, h: 2.3 });
      portal.add(pp.group);
      const steps = new THREE.Mesh(merge([
        pt(cyl(3.0, 3.6, 0.5, 16), 0xc8c0b0, [0, 0.25, 0]),
        pt(cyl(2.6, 2.9, 0.4, 16), 0xd8d2c4, [0, 0.65, 0]),
      ]), F.MATS.std);
      portal.add(steps);
      const px = tx, pz = tz + 11.5;
      portal.position.set(px, baseY - 0.6, pz);
      scene.add(portal);
      const light = new THREE.PointLight(F.PROPS.OCEAN.light, 1.1, 16, 1.8);
      light.position.set(px, baseY + 2.4, pz);
      scene.add(light);
      V.portal = { x: px, z: pz, y: baseY - 0.6, group: portal, portal: pp };

      /* 门口 2 名银甲士兵（50 万血） */
      if (F.Combat) {
        for (const side of [-1, 1]) {
          const gx = px + side * 3.6, gz = pz + 1.6;
          const m = F.Combat.spawn('guard', gx, gz, 1, 'world', T.hAt(gx, gz));
          if (m) { m.rot = Math.PI; m.tx = gx; m.tz = gz; m.guardPost = { x: gx, z: gz }; }
        }
      }
    },

    nearest(x, z, r) {
      let best = null, bd = r * r;
      for (const n of V.npcs) {
        const d = F.dist2(x, z, n.x, n.z);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },
    nearPortal(x, z, r) {
      if (!V.portal) return false;
      return F.dist2(x, z, V.portal.x, V.portal.z) < r * r;
    },

    /* 购买：系统固定价格，金币支付 */
    buy(id, item, n) {
      const sh = SHOPS[id];
      if (!sh || sh.price[item] == null) return false;
      const cost = sh.price[item] * (n || 1);
      if (F.Game.coins < cost) { F.UI.toast('金币不足，需要 ' + cost, 'bad'); F.Audio2.bad(); return false; }
      F.Game.coins -= cost;
      F.Game.give(item, n || 1);
      F.Audio2.ok();
      F.UI.toast('购买 ' + F.itemName(item) + ' ×' + (n || 1) + '（- ' + cost + ' 金币）', 'ok');
      return true;
    },

    update(dt) {
      if (!V.built) return;
      for (const n of V.npcs) {
        n.bob += dt;
        n.mesh.position.y = n.y + Math.sin(n.bob * 1.6) * 0.03;
      }
      if (V.portal) V.portal.portal.update(dt);
    },
  });

  function lerpR(a, b, k) { return a + (b - a) * k; }
})();
