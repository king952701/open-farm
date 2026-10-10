/* ==========================================================================
 * 牧野田园 Open Farm  ·  野外怪物 / 战斗 / 掉落 / 宝箱 / 世界BOSS
 * 怪物用 InstancedMesh 绘制，AI 只更新玩家附近的个体，远离即休眠。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp, lerp = F.lerp;

  const pt = (g, c, t, r, s) => ({ g, c, t, r, s });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
  const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 8, h || 6);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 6, 1);
  const cone = (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 6, 1);

  /* ============================ 怪物原型 ============================ */
  /* ponytail: 怪物模型统一由 Creatures.createMonsterModel(type) 生成（不规则多面体 + 爪牙犄角），
     这里只保留属性表；具体五官/配色的调整全部落在 creatures.js 的 MON 表上 */
  const M = (type) => F.Creatures.createMonsterModel(type);

  const MOBS = (F.MOBS = {
    boar: {
      name: '野猪', lv: 3, hp: 60, atk: 8, spd: 2.6, aggro: 7, r: 0.62,
      drops: { meat: [1, 2], leather: [0, 1] }, coin: [0, 4],
      geo: () => M('boar')
    },
    wolf: {
      name: '灰狼', lv: 5, hp: 80, atk: 12, spd: 3.6, aggro: 9, r: 0.58,
      drops: { meat: [1, 2], fur: [1, 2] }, coin: [0, 6],
      geo: () => M('wolf')
    },
    bear: {
      name: '棕熊', lv: 12, hp: 180, atk: 20, spd: 3.0, aggro: 8, r: 0.8,
      drops: { meat: [2, 3], leather: [1, 2], bone: [0, 1] }, coin: [2, 12],
      geo: () => M('bear')
    },
    slime: {
      name: '史莱姆', lv: 2, hp: 45, atk: 5, spd: 1.8, aggro: 6, r: 0.5,
      drops: { bone: [0, 1] }, coin: [0, 3],
      geo: () => M('slime')
    },
    bandit: {
      name: '荒野强盗', lv: 10, hp: 120, atk: 15, spd: 3.2, aggro: 10, r: 0.6,
      drops: { fur: [0, 1], bone: [0, 1], meat: [0, 1] }, coin: [8, 30],
      geo: () => M('bandit')
    },
    guard: {
      name: '银甲士兵', lv: 99, hp: 500000, atk: 60, spd: 2.0, aggro: 6, r: 0.62, passive: true,
      drops: { bone: [0, 2] }, coin: [0, 0], guard: true,
      geo: () => M('guard')
    },
    boss_boar: {
      name: '野猪王', lv: 20, hp: 1600, atk: 30, spd: 3.0, aggro: 12, r: 1.1, boss: true, sc: 2.0,
      drops: { meat: [4, 6], leather: [2, 3], bone: [1, 2] }, coin: [120, 300], ticketDrop: 2,
      geo: () => M('boss_boar')
    },
    boss_wyvern: {
      name: '苍空飞龙', lv: 30, hp: 4200, atk: 45, spd: 3.4, aggro: 16, r: 1.3, boss: true, sc: 1.8,
      drops: { meat: [5, 8], bone: [3, 5], leather: [2, 4] }, coin: [400, 900], ticketDrop: 4,
      geo: () => M('boss_wyvern')
    },
  });

  const SPAWN_KINDS = ['boar', 'wolf', 'slime', 'bandit', 'bear'];
  const WORLD_CAP = 30;      /* 野外同时存在的怪物数 */
  const DUNGEON_CAP = 26;

  /* ponytail: 普攻与技能走同一条结算管线，倍数由调用方给；
     换来「一处调平衡、两处同时生效」；伤害下限 1 保留，防止打不死假象 */
  const TOOL_DMG = { axe: 14, pick: 12, hoe: 6, sickle: 8, hammer: 10, sword: 22, rod: 3, can: 2, feed: 2, seed: 2, none: 4 };
  const LV_COEF = 0.02;              /* 战斗等级每级加成（GDD talents-and-numbers §3.1） */

  /* ============================ 模块 ============================ */
  const C = (F.Combat = {
    mobs: [], chests: [], meshes: { world: {}, dungeon: {} },
    boss: null, bossT: 0, atkCd: 0, target: null, scene: null,
    killCount: 0, chestT: 0,

    init(scene) {
      C.scene = scene;
      C.geos = {};
      for (const k in MOBS) C.geos[k] = MOBS[k].geo();
      C.chestGeo = F.mergeParts([
        pt(box(1.05, 0.55, 0.72), 0x8a6a4a, [0, 0.30, 0]),
        pt(box(1.12, 0.22, 0.78), 0x6f5a44, [0, 0.68, 0]),
        pt(box(1.12, 0.14, 0.78), 0xd9b04a, [0, 0.44, 0]),
        pt(box(0.18, 0.22, 0.06), 0xf0c840, [0, 0.46, 0.40]),
      ]);
      C.spawnInitial();
      C.spawnChests();
    },

    /* ---------- 网格池 ---------- */
    meshFor(realm, type, cap) {
      const bag = C.meshes[realm] || (C.meshes[realm] = {});
      if (!bag[type]) {
        /* ponytail: 只有史莱姆用半透明材质（需求要求），其余共用 std，避免多材质破坏批处理 */
        const mat = type === 'slime' ? F.MATS.jelly : F.MATS.std;
        const m = new THREE.InstancedMesh(C.geos[type], mat, cap);
        m.count = 0; m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        F.ensureInstColor(m);
        m.castShadow = false; m.receiveShadow = false;
        C.scene.add(m);
        bag[type] = m;
      }
      return bag[type];
    },

    /* ---------- 出生点合法性 ---------- */
    validSpot(x, z) {
      if (Math.hypot(x, z) > 272) return false;
      if (T.isWater(x, z) || T.hAt(x, z) < T.WATER + 0.45) return false;
      if (T.slopeAt(x, z) > 0.42) return false;
      if (F.playerSafe && F.playerSafe(x, z)) return false;
      if (F.Village && F.Village.safe && F.Village.safe(x, z)) return false;
      if (F.Builds && F.Builds.nearBuildings && F.Builds.nearBuildings(x, z, 4).length) return false;
      return true;
    },
    findSpot(cx, cz, rMin, rMax) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = F.rnd(rMin, rMax);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (C.validSpot(x, z)) return { x, z };
      }
      return null;
    },

    spawnInitial() {
      const P = F.Player;
      for (let i = 0; i < WORLD_CAP; i++) {
        const s = C.findSpot(P.pos.x, P.pos.z, 55, 190);
        if (s) C.spawn(F.choose(SPAWN_KINDS), s.x, s.z, 1, 'world');
      }
    },

    spawn(type, x, z, lvMul, realm, fixedY) {
      const d = MOBS[type];
      if (!d) return null;
      const lv = Math.max(1, Math.round(d.lv * (lvMul || 1)));
      const m = {
        type, def: d, realm: realm || 'world', lv,
        x, z, y: fixedY != null ? fixedY : T.hAt(x, z) + 0.02,
        fixedY: fixedY != null ? fixedY : null,
        hp: Math.round(d.hp * (1 + ((lvMul || 1) - 1) * 0.7)), maxHp: Math.round(d.hp * (1 + ((lvMul || 1) - 1) * 0.7)),
        rot: Math.random() * 6.283, sc: (d.sc || 1) * F.rnd(0.92, 1.08),
        state: 'idle', t: 0, tx: x, tz: z, cd: 0, hurtT: 0, alive: true,
        angry: !d.passive, bob: Math.random() * 6.283,
      };
      C.mobs.push(m);
      return m;
    },

    /* ---------- 宝箱 ---------- */
    spawnChests() {
      const P = F.Player;
      for (let i = 0; i < 14; i++) {
        const s = C.findSpot(P.pos.x, P.pos.z, 40, 240);
        if (!s) continue;
        const mesh = new THREE.Mesh(C.chestGeo, F.MATS.std);
        mesh.position.set(s.x, T.hAt(s.x, s.z), s.z);
        mesh.rotation.y = Math.random() * 6.283;
        mesh.castShadow = true;
        C.scene.add(mesh);
        C.chests.push({ x: s.x, z: s.z, y: T.hAt(s.x, s.z), mesh, open: false, t: 0 });
      }
    },

    nearestChest(x, z, r) {
      let best = null, bd = r * r;
      for (const c of C.chests) {
        if (c.open) continue;
        const d = F.dist2(x, z, c.x, c.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },

    openChest(c) {
      if (!c || c.open) return;
      c.open = true; c.t = 0;
      c.mesh.visible = false;
      const luck = (F.Player.luckT && F.Player.luckT > 0) ? 1.6 : 1;
      const roll = Math.random();
      const P = F.Player;
      let msg = '';
      if (roll < 0.34 * luck) {
        const g = Math.round(F.rnd(30, 260));
        F.Game.addCoins(g);
        msg = '宝箱：金币 +' + g;
      } else if (roll < 0.80) {
        const pool = ['wood', 'stone', 'iron', 'copper', 'tin', 'herb', 'mushroom', 'fiber', 'meat', 'leather', 'bone'];
        const id = F.choose(pool);
        const n = Math.round(F.rnd(3, 12));
        F.Game.give(id, n);
        msg = '宝箱：' + F.itemName(id) + ' ×' + n;
      } else {
        const pool = ['sword_wood', 'sword_iron', 'armor_leather', 'ring_gold', 'cloak_fur', 'sword_silver', 'amulet_moon'];
        const weights = [0.34, 0.26, 0.18, 0.12, 0.06, 0.03, 0.01];
        let k = Math.random(), id = pool[0];
        for (let i = 0; i < pool.length; i++) { if (k < weights[i]) { id = pool[i]; break; } k -= weights[i]; }
        F.Game.give(id, 1);
        msg = '宝箱：装备【' + F.itemName(id) + '】';
      }
      F.FX.burst(c.x, c.y + 0.6, c.z, 0xf0c840, 16, 1.2);
      F.FX.text(c.x, c.y + 1.4, c.z, msg, '#f0c840');
      F.UI.toast(msg, 'ok');
      F.Audio2.ok();
      if (F.Social) F.Social.sys('掉落提醒：开启了一只野外的宝箱 → ' + msg);
      if (F.Game.addGuildXp) F.Game.addGuildXp(1);
    },

    /* ---------- 世界 BOSS ---------- */
    checkBoss(dt) {
      C.bossT -= dt;
      if (C.bossT <= 0) {
        C.bossT = F.rnd(360, 600);
        if (!C.boss) {
          const P = F.Player;
          const s = C.findSpot(P.pos.x, P.pos.z, 90, 200);
          if (s) {
            const type = Math.random() < 0.5 ? 'boss_boar' : 'boss_wyvern';
            C.boss = C.spawn(type, s.x, s.z, 1.4, 'world');
            F.UI.toast('世界BOSS 出现：' + MOBS[type].name + '（' + s.x.toFixed(0) + ', ' + s.z.toFixed(0) + '）', 'bad');
            if (F.Social) F.Social.sys('【世界BOSS】' + MOBS[type].name + ' 出现在 (' + s.x.toFixed(0) + ', ' + s.z.toFixed(0) + ')，勇士们出发吧！');
          }
        }
      }
    },

    /* ---------- 查询 ---------- */
    nearest(x, z, r) {
      let best = null, bd = r * r;
      for (const m of C.mobs) {
        if (!m.alive || m.realm !== 'world') continue;
        const d = F.dist2(x, z, m.x, m.z);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    },
    nearestInRealm(realm, x, z, r) {
      let best = null, bd = r * r;
      for (const m of C.mobs) {
        if (!m.alive || m.realm !== realm) continue;
        const d = F.dist2(x, z, m.x, m.z);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    },

    /* ---------- 伤害 ---------- */
    hit(m, dmg, crit) {
      if (!m.alive) return;
      m.hp -= dmg;
      m.hurtT = 0.22;
      m.angry = true;
      if (m.state !== 'attack') m.state = 'chase';
      F.FX.text(m.x, m.y + 1.9 * m.sc, m.z, (crit ? '暴击 ' : '') + Math.round(dmg), crit ? '#ffd24a' : '#ff9a7a');
      F.FX.burst(m.x, m.y + 1.0 * m.sc, m.z, 0xd05a4a, 5, 0.8);
      if (m.hp <= 0) C.kill(m);
    },

    kill(m) {
      m.alive = false; m.deadT = 0;
      const P = F.Player;
      C.killCount++;
      F.FX.burst(m.x, m.y + 1.0 * m.sc, m.z, m.def.boss ? 0xf0c840 : 0xc86a5a, m.def.boss ? 34 : 12, m.def.boss ? 1.8 : 1);
      /* 掉落 */
      const luck = (P.luckT && P.luckT > 0) ? 1.5 : 1;
      const lines = [];
      for (const k in m.def.drops) {
        const [a, b] = m.def.drops[k];
        if (Math.random() < 0.72 * luck) {
          const n = Math.round(F.rnd(a, b));
          if (n > 0) { F.Game.give(k, n); lines.push(F.itemName(k) + '×' + n); }
        }
      }
      if (m.def.coin && m.def.coin[1] > 0) {
        const g = Math.round(F.rnd(m.def.coin[0], m.def.coin[1]));
        if (g > 0) { F.Game.addCoins(g); lines.push('金币×' + g); }
      }
      if (m.def.ticketDrop && Math.random() < 0.9) { F.Game.give('ticket', m.def.ticketDrop); lines.push('副本门票×' + m.def.ticketDrop); }
      if (!m.def.guard && Math.random() < 0.04 * luck) { F.Game.give('ticket', 1); lines.push('副本门票×1'); }
      F.Game.stats.kill = (F.Game.stats.kill || 0) + 1;
      if (F.Game.addGuildXp) F.Game.addGuildXp(1);
      F.Game.addSkill('combat', m.def.boss ? 12 : 3);
      const txt = lines.length ? '击杀 ' + m.def.name + '：' + lines.join('、') : '击杀 ' + m.def.name;
      F.FX.text(m.x, m.y + 2.2 * m.sc, m.z, '击败 ' + m.def.name + '！', '#ffd24a');
      F.UI.toast(txt, 'ok');
      if (F.Social) F.Social.sys('战斗：你击败了 ' + m.def.name + '（Lv.' + m.lv + '）' + (lines.length ? ' → ' + lines.join('、') : ''));
      if (m.def.boss) {
        if (F.Social) F.Social.sys('【击杀】世界BOSS ' + m.def.name + ' 被击败了！协战奖励已发放。');
        F.Game.addCoins(300);
        if (m === C.boss) C.boss = null;
      }
      if (F.Dungeon && m.realm === 'dungeon') F.Dungeon.onMobDie(m);
    },

    /* ---------- 伤害公式（GDD talents-and-numbers §3.1） ---------- */
    combatLv() {
      const s = F.Skills && F.Skills.data && F.Skills.data.combat;
      return s ? (s.lv || 1) : 1;
    },
    baseAttack() {
      const P = F.Player;
      const eq = (F.Game.equip && F.Game.equip.weapon && F.EQUIP[F.Game.equip.weapon]) || null;
      return (TOOL_DMG[P.tool] || 4) + (eq ? eq.atk : 0);
    },
    resolve(m, mult, o) {
      o = o || {};
      if (!m || !m.alive) return 0;
      const P = F.Player;
      const T = (F.Talents && F.Talents.mods) ? F.Talents.mods() : null;   /* S2 天赋系统接入口，未实现时为 null */
      const atkPct = T ? T.atk_pct : 0, skillPct = T ? T.skill_pct : 0;
      const critPct = T ? T.crit_pct : 0, critDmg = T ? T.crit_dmg : 0;
      const lv = C.combatLv();
      const atkScale = 1 + lv * LV_COEF + atkPct;
      const crit = Math.random() < clamp(0.12 + critPct, 0, 0.75);
      const critMult = crit ? (1.8 + critDmg) : 1;
      const levelMult = 1 + clamp((lv - (m.lv || 1)) * 0.01, -0.2, 0.3);
      const buffMult = P.strT > 0 ? 1.5 : 1;
      const dmg = Math.max(1, Math.round(
        C.baseAttack() * atkScale * (mult == null ? 1 : mult) * (1 + skillPct) * critMult * levelMult * buffMult));
      C.hit(m, dmg, crit);
      if (T && T.lifeOnHit) P.energy = Math.min(100, P.energy + T.lifeOnHit);
      return dmg;
    },

    /* ---------- 玩家攻击 ---------- */
    playerAttack() {
      const P = F.Player;
      if (C.atkCd > 0) return false;
      const realm = (F.Dungeon && F.Dungeon.inside) ? 'dungeon' : 'world';
      const m = C.nearestInRealm(realm, P.pos.x, P.pos.z, 3.4);
      if (!m) return false;
      C.atkCd = 0.52;
      P.playAction('chop', 0.42);
      F.Audio2.blip(180, 0.09, 'square', 0.05);
      C.resolve(m, 1, { basic: true });
      C.target = m;
      return true;
    },

    /* ---------- 每帧 ---------- */
    update(dt) {
      const P = F.Player;
      if (C.atkCd > 0) C.atkCd -= dt;
      if (P.luckT > 0) P.luckT -= dt;
      if (P.strT > 0) P.strT -= dt;

      const dungeon = F.Dungeon && F.Dungeon.inside;
      const counts = { world: {}, dungeon: {} };

      for (let i = C.mobs.length - 1; i >= 0; i--) {
        const m = C.mobs[i];
        const d = m.def;
        /* 死亡处理 */
        if (!m.alive) {
          m.deadT += dt;
          if (m.deadT > 1.2) {
            C.mobs.splice(i, 1);
            if (m.realm === 'world' && !d.boss && !d.guard) {
              /* 原地一段时间后刷新一只新的 */
              if (m.respawnT === undefined) {
                m.respawnT = F.rnd(60, 180);
              }
            }
          }
          continue;
        }
        /* 距离剔除 */
        const dist = Math.hypot(m.x - P.pos.x, m.z - P.pos.z);
        if (m.realm === 'world' && !d.boss && !d.guard) {
          if (dist > 230) {
            C.mobs.splice(i, 1);
            continue;
          }
        }
        /* AI */
        m.hurtT = Math.max(0, m.hurtT - dt);
        m.t += dt;
        /* 技能控制状态：眩晕期间不出手也不移动；减速只影响移动速度 */
        if (m.stunT > 0) { m.stunT -= dt; m.state = 'idle'; }
        else {
          if (m.slowT > 0) { m.slowT -= dt; if (m.slowT <= 0) m.slowK = 0; }
          const aggroR = d.aggro * (d.boss ? 1.3 : 1);
        const inRange = dist < aggroR && (d.passive ? m.angry : true) && !P.indoor;
        if (inRange && P.hp > 0) {
          m.tx = P.pos.x; m.tz = P.pos.z;
          if (dist < 1.9 + d.r) {
            m.state = 'attack';
            m.cd -= dt;
            if (m.cd <= 0) {
              m.cd = 1.25;
              const def = F.Game.defense ? F.Game.defense() : 0;
              const dmg = Math.max(1, Math.round(d.atk * F.rnd(0.85, 1.15) - def * 0.5));
              F.Player.hurt(dmg);
              F.FX.text(P.pos.x, P.pos.y + 2.0, P.pos.z, '-' + dmg, '#ff6a6a');
            }
          } else {
            m.state = 'chase';
            const sp = d.spd * (m.hurtT > 0 ? 0.6 : 1) * (m.slowT > 0 && m.slowK ? m.slowK : 1);
            const nx = m.x + Math.cos(Math.atan2(m.tx - m.x, m.tz - m.z)) * sp * dt;
            const nz = m.z + Math.sin(Math.atan2(m.tx - m.x, m.tz - m.z)) * sp * dt;
            if (m.fixedY !== null || !T.isWater(nx, nz)) { m.x = nx; m.z = nz; }
            m.rot = Math.atan2(m.tx - m.x, m.tz - m.z);
          }
        } else {
          /* 游荡 */
          if (m.t > (m.wanderT || 3)) {
            m.t = 0; m.wanderT = F.rnd(2.5, 6);
            const a = Math.random() * 6.283, r = F.rnd(3, 12);
            m.tx = m.x + Math.cos(a) * r; m.tz = m.z + Math.sin(a) * r;
            if (m.fixedY !== null) { /* 副本内限制在场地半径内 */
              const D = F.Dungeon;
              if (D && D.inside) {
                const rr = Math.hypot(m.tx - D.cx, m.tz - D.cz);
                if (rr > D.radius - 2) { m.tx = D.cx + (m.tx - D.cx) / rr * (D.radius - 2); m.tz = D.cz + (m.tz - D.cz) / rr * (D.radius - 2); }
              }
            }
          }
          const dx = m.tx - m.x, dz = m.tz - m.z;
          const dd = Math.hypot(dx, dz);
          if (dd > 0.6) {
            const sp = d.spd * 0.35;
            const nx = m.x + dx / dd * sp * dt, nz = m.z + dz / dd * sp * dt;
            if (m.fixedY !== null || (!T.isWater(nx, nz) && Math.hypot(nx, nz) < 278)) { m.x = nx; m.z = nz; }
            m.rot = Math.atan2(dx, dz);
          }
        }
        }
        if (m.fixedY === null) m.y = T.hAt(m.x, m.z) + 0.02;

        /* 绘制 */
        const bag = counts[m.realm] || (counts[m.realm] = {});
        const idx = bag[m.type] || 0;
        const cap = m.realm === 'world' ? WORLD_CAP + 6 : DUNGEON_CAP + 6;
        if (idx < cap) {
          const mesh = C.meshFor(m.realm, m.type, cap);
          let bob = 0, lean = 0;
          if (m.state === 'chase' || m.state === 'attack') bob = Math.abs(Math.sin(m.t * 9)) * 0.06 * m.sc;
          /* ponytail: 攻击「前倾」用整体 x 轴倾斜代替骨骼动画（InstancedMesh 只能整体变换） */
          /* 用 m.cd 倒推攻击进度：0 → 峰值 → 0，YXZ 保证沿朝向（而非世界轴）前倾 */
          if (m.state === 'attack') lean = Math.sin(clamp(1 - m.cd / 1.25, 0, 1) * Math.PI) * 0.32;
          const col = m.hurtT > 0 ? F.WHITE_RED : F.WHITE;
          if (lean) F.setInst7(mesh, idx, m.x, m.y + bob, m.z, lean, m.rot, 0, m.sc, m.sc, m.sc, col, 'YXZ');
          else F.setInst(mesh, idx, m.x, m.y + bob, m.z, m.rot, m.sc, col);
          bag[m.type] = idx + 1;
        }
      }

      /* 写入实例数量 */
      for (const realm in counts) {
        for (const type in C.meshes[realm]) C.meshes[realm][type].count = counts[realm][type] || 0;
      }
      for (const realm in C.meshes) {
        for (const type in C.meshes[realm]) {
          const mesh = C.meshes[realm][type];
          if (!(counts[realm] && counts[realm][type] != null)) mesh.count = 0;
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }

      /* 补充野外怪物 */
      if (!dungeon) {
        let alive = 0;
        for (const m of C.mobs) if (m.alive && m.realm === 'world' && !m.def.boss && !m.def.guard) alive++;
        if (alive < WORLD_CAP && Math.random() < dt * 0.6) {
          const s = C.findSpot(P.pos.x, P.pos.z, 70, 170);
          if (s) C.spawn(F.choose(SPAWN_KINDS), s.x, s.z, 1, 'world');
        }
        C.checkBoss(dt);
      }

      /* 宝箱刷新 */
      for (const c of C.chests) {
        if (!c.open) continue;
        c.t += dt;
        if (c.t > 480) { c.open = false; c.mesh.visible = true; c.t = 0; }
      }

      /* 目标（HUD 血条） */
      C.target = C.nearestInRealm(dungeon ? 'dungeon' : 'world', P.pos.x, P.pos.z, 9);
    },

    clearRealm(realm) {
      for (let i = C.mobs.length - 1; i >= 0; i--) if (C.mobs[i].realm === realm) C.mobs.splice(i, 1);
      for (const type in C.meshes[realm]) C.meshes[realm][type].count = 0;
    },
    aliveInRealm(realm) {
      let n = 0;
      for (const m of C.mobs) if (m.alive && m.realm === realm) n++;
      return n;
    },
  });

  /* 复用颜色对象，避免每帧 new Color */
  F.WHITE = new THREE.Color(1, 1, 1);
  F.WHITE_RED = new THREE.Color(1.6, 0.35, 0.3);
})();
