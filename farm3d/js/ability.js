/* ==========================================================================
 * 牧野田园 Open Farm  ·  战斗技能系统
 * GDD：design/gdd/combat-skills.md
 * 三段式时间线 windup → damageT → recover → cd，五种释放路径 melee / around /
 * dash / projectile / ground（+ self），资源用体力，由 Q / E / 右键 + HUD 按钮释放。
 * ponytail: 数值集中在 DEF 表里一处可改；伤害结算统一走 Combat.resolve，不在本模块重算
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  if (!F) return;
  const clamp = F.clamp;

  /* ============================ 技能表 ============================ */
  const DEF = (F.ABILITY_DEF = {
    heavy: {
      name: '重斩', lv: 1, cd: 3.0, wind: 0.28, rec: 0.24, cost: 8, path: 'melee',
      range: 3.6, ang: 0.61, mult: 1.9, act: 'chop', slowT: 1.5, slowK: 0.85, c: 0xffd070,
      desc: '正前方扇形重击，削断目标移速 1.5 秒',
    },
    whirl: {
      name: '旋风斩', lv: 5, cd: 6.0, wind: 0.20, rec: 0.35, cost: 12, path: 'around',
      radius: 3.2, mult: 1.2, cap: 6, act: 'chop', c: 0x8fe0ff,
      desc: '旋身一周，最多命中 6 个目标',
    },
    dash: {
      name: '突进斩', lv: 10, cd: 7.0, wind: 0.16, rec: 0.20, cost: 10, path: 'dash',
      dist: 4.5, mult: 1.5, act: 'mine', c: 0xa0f0c0,
      desc: '向前突进，沿途每个目标结算一次',
    },
    blade: {
      name: '飞刃', lv: 15, cd: 1.8, wind: 0.18, rec: 0.14, cost: 3, path: 'proj',
      range: 12, spd: 14, mult: 0.9, act: 'chop', c: 0xd0d8ff,
      desc: '掷出飞刃，远程基础输出',
    },
    quake: {
      name: '地刺', lv: 20, cd: 9.0, wind: 0.35, rec: 0.30, cost: 14, path: 'ground',
      radius: 3.6, delay: 0.55, mult: 2.2, act: 'mine', stunT: 0.8, c: 0xffa060,
      desc: '地面延迟爆发，命中眩晕 0.8 秒',
    },
    mend: {
      name: '疗愈', lv: 25, cd: 14.0, wind: 0.40, rec: 0.20, cost: 12, path: 'self',
      heal: 0.22, act: 'hoe', c: 0x90ffb0,
      desc: '回复 22% 最大生命',
    },
    chain: {
      name: '雷霆链', lv: 35, cd: 10.0, wind: 0.22, rec: 0.24, cost: 10, path: 'chain',
      hopR: 6, hops: 3, decay: 0.8, mult: 1.3, act: 'chop', c: 0xc0a0ff,
      desc: '雷光在目标间跳跃三次，每段伤害递减 20%',
    },
    finisher: {
      name: '终结技', lv: 45, cd: 20.0, wind: 0.45, rec: 0.35, cost: 18, path: 'melee',
      range: 3.8, ang: 0.7, mult: 2.6, act: 'chop', exec: 0.3, execMul: 1.5, c: 0xff8a8a,
      desc: '重击正前方；目标生命低于 30% 时伤害再 ×1.5',
    },
  });
  const ORDER = ['heavy', 'whirl', 'dash', 'blade', 'quake', 'mend', 'chain', 'finisher'];
  DEF._order = ORDER;

  /* ============================ 状态 ============================ */
  const A = (F.Ability = {
    slots: ['heavy', 'whirl', 'dash'],
    cd: {},              /* id → 剩余冷却秒 */
    casting: null,       /* 当前正在释放的技能实例 */
    fx: [],              /* 释放路径实例（弹道 / 地面预警 / 位移） */
    scene: null,
    hudT: 0,
    prevRmb: false,
    lastDmg: 0,          /* 最近一次技能结算的伤害（供测试断言） */
    hitCount: 0,         /* 累计结算次数（结算次数断言） */

    init(scene) {
      A.scene = scene;
      A.cd = {}; A.fx = [];
      /* ponytail: 右键走事件而不是每帧轮询 —— 低帧率时轮询会漏掉一次短促点击，
         而且事件触发能让释放响应不晚于下一帧（GDD §6 要求起手与音效同帧） */
      const cv = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('cv') : null;
      if (cv) cv.addEventListener('mousedown', e => { if (e.button === 2) A.cast(2); });
      A.syncHud(true);
    },

    /* 是否解锁：战斗等级达标 */
    unlocked(id) {
      const d = DEF[id];
      if (!d) return false;
      return F.Combat.combatLv() >= d.lv;
    },
    lv() { return F.Combat.combatLv(); },

    setSlot(i, id) {
      if (!DEF[id] || i < 0 || i > 2) return false;
      A.slots[i] = id;
      A.syncHud(true);
      return true;
    },

    /* ---------- 释放 ---------- */
    cast(i) {
      const P = F.Player;
      if (A.casting) return false;                       /* 正在释放中，不打断不排队 */
      const id = A.slots[i];
      const d = DEF[id];
      if (!d) return false;
      if (P.dead) { F.UI.toast('已经倒下了', 'bad'); return false; }
      if (F.Inter && F.Inter.busy && F.Inter.busy()) { F.UI.toast('当前操作无法释放技能', 'bad'); return false; }
      if (!A.unlocked(id)) {
        if (F.UI) F.UI.toast(d.name + ' 需要战斗等级 ' + d.lv + '（当前 ' + A.lv() + '）', 'bad');
        if (F.Audio2) F.Audio2.bad();
        return false;
      }
      if ((A.cd[id] || 0) > 0) { if (F.Audio2) F.Audio2.bad(); return false; }
      if (P.energy < d.cost) {
        if (F.UI) F.UI.toast('体力不足：' + d.name + ' 需要 ' + d.cost + ' 点体力', 'bad');
        if (F.Audio2) F.Audio2.bad();
        return false;
      }
      P.energy -= d.cost;
      A.cd[id] = d.cd;
      A.casting = { id, d, i, t: 0, fired: false };
      P.playAction(d.act, d.wind + d.rec);
      if (F.Audio2) F.Audio2.blip(520, 0.07, 'triangle', 0.05);       /* cast_start */
      A.syncHud(true);
      return true;
    },

    moveMul() {
      const c = A.casting;
      if (!c) return 1;
      return c.t < c.d.wind ? 0.35 : 0.6;                              /* 前摇更慢、收招稍慢 */
    },

    /* ---------- 每帧 ---------- */
    update(dt) {
      /* 单帧上限：卡顿帧不能让弹道跳穿目标 */
      dt = Math.min(dt, 1 / 20);
      const P = F.Player;
      for (const k in A.cd) if (A.cd[k] > 0) A.cd[k] = Math.max(0, A.cd[k] - dt);

      const rmb = !!(F.Input && F.Input.rmb);
      A.prevRmb = rmb;    /* 仅用于记录状态；真正的释放走 mousedown 事件（见 init），不依赖帧率 */

      const c = A.casting;
      if (c) {
        c.t += dt;
        if (!c.fired && c.t >= c.d.wind) { c.fired = true; A.__fire(c); }
        if (c.t >= c.d.wind + c.d.rec) { A.casting = null; A.syncHud(true); }
      }
      for (let i = A.fx.length - 1; i >= 0; i--) {
        if (A.fx[i].update(dt)) A.fx.splice(i, 1);
      }
      A.hudT -= dt;
      if (A.hudT <= 0) { A.hudT = 0.1; A.syncHud(); }
    },

    /* ============================ 伤害结算 ============================ */
    __fire(c) {
      const d = c.d, P = F.Player;
      if (F.Audio2) F.Audio2.blip(d.path === 'self' ? 440 : 300, 0.1, 'square', 0.06);   /* cast_hit */
      switch (d.path) {
        case 'melee': case 'around': A.__hits(d); break;
        case 'dash': A.__dash(d); break;
        case 'proj': A.__proj(d); break;
        case 'ground': A.__ground(d); break;
        case 'chain': A.__chain(d); break;
        case 'self': {
          const heal = Math.round(P.hpMax * d.heal);
          P.hp = clamp(P.hp + heal, 1, P.hpMax);
          F.FX.text(P.pos.x, P.pos.y + 2.1, P.pos.z, '+' + heal, '#90ffb0');
          F.FX.burst(P.pos.x, P.pos.y + 0.9, P.pos.z, 0x60d090, 10, 0.7);
          break;
        }
      }
    },

    /* 单个目标的最终倍率（终结技残血加成） */
    __mult(d, m) {
      let mult = d.mult;
      if (d.exec && m.maxHp > 0 && m.hp / m.maxHp < d.exec) mult *= d.execMul;
      return mult;
    },
    __applyFx(d, m) {
      if (d.slowT) { m.slowT = d.slowT; m.slowK = d.slowK; }
      if (d.stunT) m.stunT = d.stunT;
    },
    __hitOne(d, m) {
      const dm = F.Combat.resolve(m, A.__mult(d, m));
      A.__applyFx(d, m);
      A.lastDmg = dm; A.hitCount++;
      return dm;
    },

    /* 扇形 / 圆形命中集 */
    __targets(d) {
      const P = F.Player, out = [];
      const realm = (F.Dungeon && F.Dungeon.inside) ? 'dungeon' : 'world';
      const list = (F.Combat && F.Combat.mobs) || [];
      const fx = Math.sin(P.rot), fz = Math.cos(P.rot);
      for (const m of list) {
        if (!m.alive || m.realm !== realm) continue;
        const dx = m.x - P.pos.x, dz = m.z - P.pos.z;
        const dist = Math.hypot(dx, dz);
        if (d.path === 'around') {
          if (dist <= d.radius + (m.def.r || 0.5)) out.push(m);
        } else {
          if (dist > d.range + (m.def.r || 0.5)) continue;
          const dot = dist > 0.001 ? (dx * fx + dz * fz) / dist : 1;
          if (Math.acos(clamp(dot, -1, 1)) <= d.ang) out.push(m);
        }
        if (d.cap && out.length >= d.cap) break;
      }
      return out;
    },
    __hits(d) {
      const list = A.__targets(d);
      for (const m of list) A.__hitOne(d, m);
      /* 打击感：结算帧给一次短促镜头反馈（* 不常驻、不影响选中判定） */
      A.fx.push(A.__arc(d));
      return list.length;
    },

    /* ---------- 位移路径 ---------- */
    __dash(d) {
      const P = F.Player;
      const total = d.dist, spd = 12;
      const dirx = Math.sin(P.rot), dirz = Math.cos(P.rot);
      let travelled = 0;
      const seen = [];
      A.fx.push({
        update(dt) {
          const step = Math.min(spd * dt, total - travelled);
          travelled += step;
          place(P.pos.x + dirx * step, P.pos.z + dirz * step);
          for (const m of (F.Combat && F.Combat.mobs) || []) {
            if (!m.alive || seen.indexOf(m) >= 0) continue;
            if (Math.hypot(m.x - P.pos.x, m.z - P.pos.z) < 1.5 + (m.def.r || 0.5)) {
              seen.push(m); A.__hitOne(d, m);
            }
          }
          return travelled >= total - 0.001;
        },
      });
      return true;
    },

    /* ---------- 弹道路径 ---------- */
    __proj(d) {
      const P = F.Player;
      const mesh = take('bolt');
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(P.pos.x + Math.sin(P.rot) * 0.5, P.pos.y + 1.0, P.pos.z + Math.cos(P.rot) * 0.5);
      }
      let travelled = 0;
      const dirx = Math.sin(P.rot), dirz = Math.cos(P.rot);
      let x = mesh ? mesh.position.x : P.pos.x, z = mesh ? mesh.position.z : P.pos.z;
      A.fx.push({
        update(dt) {
          const step = d.spd * dt;
          travelled += step;
          x += dirx * step; z += dirz * step;
          if (mesh) {
            mesh.position.set(x, Math.max(T_h(x, z) + 0.55, mesh.position.y - dt * 0.4), z);
            mesh.rotation.y += dt * 14;
          }
          let done = travelled >= d.range;
          if (!done && x * x + z * z > 283 * 283) done = true;                 /* 世界边界 */
          if (!done) {
            for (const m of (F.Combat && F.Combat.mobs) || []) {
              if (!m.alive) continue;
              if (Math.hypot(m.x - x, m.z - z) < 0.9 + (m.def.r || 0.5)) {
                A.__hitOne(d, m);
                F.FX.burst(x, T_h(x, z) + 0.8, z, 0xd0d8ff, 6, 0.6);
                done = true; break;
              }
            }
          }
          if (!done && T_h(x, z) < F.T.WATER - 0.1) done = true;                /* 落入水中 */
          if (done && mesh) { mesh.visible = false; mesh.userData.busy = false; }
          return done;
        },
      });
    },

    /* ---------- 延迟地面路径 ---------- */
    __ground(d) {
      const P = F.Player;
      const cx = P.pos.x + Math.sin(P.rot) * 2.2, cz = P.pos.z + Math.cos(P.rot) * 2.2;
      const mark = take('mark');
      if (mark) {
        mark.visible = true;
        mark.position.set(cx, T_h(cx, cz) + 0.06, cz);
        mark.scale.setScalar(d.radius);
        mark.material.opacity = 0.15;
      }
      let t = 0;
      A.fx.push({
        update(dt) {
          t += dt;
          const k = clamp(t / d.delay, 0, 1);
          if (mark) mark.material.opacity = 0.15 + k * 0.45;
          if (t < d.delay) return false;
          if (mark) { mark.visible = false; mark.userData.busy = false; }
          const realm = (F.Dungeon && F.Dungeon.inside) ? 'dungeon' : 'world';
          for (const m of (F.Combat && F.Combat.mobs) || []) {
            if (!m.alive || m.realm !== realm) continue;
            if (Math.hypot(m.x - cx, m.z - cz) < d.radius + (m.def.r || 0.5)) A.__hitOne(d, m);
          }
          F.FX.burst(cx, T_h(cx, cz) + 0.5, cz, 0xffa060, 14, 1.1);
          if (F.Audio2) F.Audio2.blip(120, 0.18, 'sawtooth', 0.07);
          return true;
        },
      });
    },

    /* ---------- 链式跳跃 ---------- */
    __chain(d) {
      const realm = (F.Dungeon && F.Dungeon.inside) ? 'dungeon' : 'world';
      let cur = null;
      const P = F.Player;
      for (const m of (F.Combat && F.Combat.mobs) || []) {
        if (!m.alive || m.realm !== realm) continue;
        if (Math.hypot(m.x - P.pos.x, m.z - P.pos.z) > 9) continue;
        if (!cur || Math.hypot(m.x - P.pos.x, m.z - P.pos.z) < Math.hypot(cur.x - P.pos.x, cur.z - P.pos.z)) cur = m;
      }
      if (!cur) return;
      const done = [];
      let mult = d.mult, hop = 0;
      let prev = { x: P.pos.x, z: P.pos.z };
      while (cur && hop < d.hops) {
        F.Combat.resolve(cur, mult);
        A.__applyFx(d, cur);
        A.lastDmg = mult; A.hitCount++;
        flash(cur, prev);
        done.push(cur); prev = { x: cur.x, z: cur.z };
        hop++; mult *= d.decay;
        let next = null;
        for (const m of (F.Combat && F.Combat.mobs) || []) {
          if (!m.alive || m.realm !== realm || done.indexOf(m) >= 0) continue;
          if (Math.hypot(m.x - prev.x, m.z - prev.z) > d.hopR) continue;
          if (!next || Math.hypot(m.x - prev.x, m.z - prev.z) < Math.hypot(next.x - prev.x, next.z - prev.z)) next = m;
        }
        cur = next;
      }
    },
  });

  /* ============================ 工具 ============================ */
  function T_h(x, z) { return F.T.hAt(x, z); }

  /* ponytail: 位移落点必须按「建筑推出 → 世界/副本边界」的固定顺序夹一次，
     否则突进会把玩家推进墙里或推到地图外（评审清单第 2 条） */
  function place(x, z) {
    const P = F.Player;
    let nx = x, nz = z;
    if (F.Builds) { const hit = F.Builds.pushOut(nx, nz, 0.52); if (hit) { nx = hit.x; nz = hit.z; } }
    if (!P.indoor) {
      const rr = Math.hypot(nx, nz);
      if (rr > 283) { nx = nx / rr * 283; nz = nz / rr * 283; }
    }
    P.pos.x = nx; P.pos.z = nz;
    if (P.indoor) {
      if (F.Dungeon && F.Dungeon.inside) F.Dungeon.clampPlayer(P);
      else if (F.House) F.House.clampPlayer(P);
    }
    P.pos.y = P.swimming ? P.pos.y : (P.indoor ? P.pos.y : T_h(nx, nz));
  }

  /* ---------------- 特效池：同类型最多缓存 8 个，全部忙碌则复用最早的，零泄漏 ---------------- */
  const POOL = {};
  function take(kind) {
    if (!A.scene) return null;
    const p = POOL[kind] || (POOL[kind] = []);
    for (const m of p) if (!m.userData.busy) { m.userData.busy = true; return m; }
    let m = null;
    for (const it of p) if (!it.visible) { m = it; break; }
    if (!m) {
      if (p.length < 8) { m = makeFx(kind); if (!m) return null; p.push(m); A.scene.add(m); }
      else { m = p[0]; }
    }
    m.userData.busy = true;
    return m;
  }
  function makeFx(kind) {
    if (kind === 'bolt') {
      const g = new THREE.OctahedronGeometry(0.16, 0);
      const mt = new THREE.MeshBasicMaterial({ color: 0xd0d8ff, transparent: true, opacity: 0.9 });
      return new THREE.Mesh(g, mt);
    }
    if (kind === 'mark') {
      const g = new THREE.RingGeometry(0.55, 1, 26);
      const mt = new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const m = new THREE.Mesh(g, mt); m.rotation.x = -Math.PI / 2; return m;
    }
    return null;
  }

  /* 近身 / 圆形命中：一次性挥砍弧。ponytail: 两种路径几何不同（扇形 vs 整环）必须分池缓存，
     否则先释放的那一次会把几何固定下来、另一种路径跟着变形；每池最多 3 个，超了复用最早的 */
  const ARCS = { melee: [], around: [] };
  A.__arc = function (d) {
    const P = F.Player;
    const around = d.path === 'around';
    const pool = ARCS[around ? 'around' : 'melee'];
    let mesh = null;
    for (const m of pool) if (!m.userData.busy) { mesh = m; break; }
    if (!mesh) {
      if (pool.length < 3 && A.scene) {
        const geo = around
          ? new THREE.RingGeometry(0.6, 1, 28)
          : new THREE.RingGeometry(0.35, 1, 20, 1, -0.7, 1.4);      /* 半角固定 0.7，实际张角由 target.ang 判定控制 */
        const mat = new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
        mesh = new THREE.Mesh(geo, mat);
        A.scene.add(mesh); pool.push(mesh);
      } else if (pool.length) mesh = pool[0];
    }
    if (!mesh) return { update() { return true; } };
    mesh.userData.busy = true; mesh.visible = true;
    mesh.material.color.setHex(d.c || 0xffffff);
    const R = around ? d.radius : d.range;
    mesh.scale.setScalar(R);
    mesh.material.opacity = 0.5;
    let t = 0, dur = 0.26;
    return {
      update(dt) {
        t += dt;
        if (around) { mesh.position.set(P.pos.x, P.pos.y + 0.7, P.pos.z); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z += dt * 6; }
        else {
          mesh.position.set(P.pos.x, P.pos.y + 0.9, P.pos.z);
          /* 扇面朝向逻辑 hero: RingGeometry 在 XY 平面上，theta 以 +X 为 0；玩家 rot 以 +Z 为 0 */
          mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - P.rot);
        }
        mesh.material.opacity = Math.max(0, 0.5 * (1 - t / dur));
        if (t >= dur) { mesh.visible = false; mesh.userData.busy = false; return true; }
        return false;
      },
    };
  };

  /* 链式闪电：细线段，用完释放 */
  const LINES = [];
  function flash(m, from) {
    if (!A.scene) return;
    let mesh = null;
    for (const l of LINES) if (!l.userData.busy) { mesh = l; break; }
    if (!mesh) {
      if (LINES.length < 4) {
        const geo = new THREE.BoxGeometry(1, 0.05, 0.05);
        const mat = new THREE.MeshBasicMaterial({ color: 0xc0a0ff, transparent: true, opacity: 0.9, depthWrite: false });
        mesh = new THREE.Mesh(geo, mat); A.scene.add(mesh); LINES.push(mesh);
      } else mesh = LINES[0];
    }
    if (!mesh) return;
    mesh.userData.busy = true; mesh.visible = true;
    const dx = m.x - from.x, dz = m.z - from.z;
    const len = Math.hypot(dx, dz) || 0.1;
    mesh.position.set(from.x + dx / 2, Math.max(T_h(from.x, from.z), m.y) + 0.9, from.z + dz / 2);
    mesh.scale.set(len, 1, 1);
    mesh.rotation.y = -Math.atan2(dz, dx);
    let t = 0;
    A.fx.push({
      update(dt) {
        t += dt;
        mesh.material.opacity = Math.max(0, 0.9 * (1 - t / 0.18));
        if (t >= 0.18) { mesh.visible = false; mesh.userData.busy = false; return true; }
        return false;
      },
    });
  }

  /* ============================ HUD ============================ */
  /* ponytail: HUD 按钮是触摸端唯一可行的释放途径（没有右键、没有 Q/E），所以 PC 也常显 */
  /* ponytail: Node 冒烟环境没有 getElementById，取值要能优雅返回 null，而不是抛错 */
  function hudBar() {
    return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('skillbar') : null;
  }
  A.syncHud = function (force) {
    const bar = hudBar();
    if (!bar) return;
    for (let i = 0; i < 3; i++) {
      const el = bar.children[i];
      if (!el) continue;
      const id = A.slots[i], d = DEF[id];
      const nm = el.querySelector('b'), sub = el.querySelector('span'), cdEl = el.querySelector('i');
      if (!nm) continue;
      if (d && nm.textContent !== d.name) nm.textContent = d.name;
      const cdv = d ? (A.cd[id] || 0) : 0;
      const ok = d && A.unlocked(id) && cdv <= 0 && (!F.Player || F.Player.energy >= d.cost);
      if (el.dataset.id !== id) { el.dataset.id = id; }
      el.classList.toggle('off', !(d && A.unlocked(id)));
      el.classList.toggle('cd', cdv > 0);
      if (sub) sub.textContent = d ? (['Q', 'E', '右键'][i] + ' · ' + d.cost + '体') : '';
      if (cdEl) cdEl.style.height = (cdv > 0 && d ? (cdv / d.cd * 100) : 0) + '%';
      if (el.dataset.ok !== String(!!ok)) el.dataset.ok = String(!!ok);
    }
  };
  A.buildHud = function () {
    const bar = hudBar();
    if (!bar) return;
    bar.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const b = F.el('div', 'sb');
      b.appendChild(F.el('b', '', ''));
      b.appendChild(F.el('span', '', ''));
      b.appendChild(F.el('i', '', ''));
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.setAttribute('aria-label', '技能槽 ' + (i + 1));
      const fire = e => { e.preventDefault(); A.cast(i); };
      b.addEventListener('pointerdown', fire);
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fire(e); });
      bar.appendChild(b);
    }
    A.syncHud(true);
  };
})();
