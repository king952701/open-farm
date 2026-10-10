/* ==========================================================================
 * 牧野田园 Open Farm  ·  坐骑：纳球捕捉 / 坐骑栏 / 骑乘与上下马动作
 * 捕捉：把野外野兽生命打到 40% 以下，按 R 投掷纳球，概率捕获。
 * 骑乘：玩家模型抬升到鞍位，腿部收拢，坐骑独立网格随行并附带奔跑节奏。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp, lerp = F.lerp, smoothstep = F.smoothstep;

  /* 可捕捉 → 坐骑定义（h: 鞍位高度, mul: 基础移速倍率） */
  const RIDE_DEF = (F.MountsDef = {
    boar: { name: '野猪', h: 1.02, mul: 1.35 },
    wolf: { name: '灰狼', h: 0.98, mul: 1.55 },
    bear: { name: '棕熊', h: 1.42, mul: 1.45 },
  });
  /* 品质额外移速：普通→传说 */
  const QSPD = [0, 0.08, 0.16, 0.26, 0.4];

  const M = (F.Mounts = {
    RIDE_DEF, list: [], active: -1, scene: null, mesh: null,
    MAX: 6, k: 0, phase: null, dustT: 0,

    init(scene) { M.scene = scene; },
    saveData() { return M.list; },
    loadData(d) {
      M.list = Array.isArray(d) ? d.filter(x => x && RIDE_DEF[x.type]) : [];
      if (M.list.length >= M.MAX) M.list = M.list.slice(0, M.MAX);
      M.active = -1; F.Player.riding = false;
    },
    reset() { M.list = []; M.active = -1; F.Player.riding = false; if (M.mesh) M.mesh.visible = false; },

    qualityOf(lv) { return lv >= 16 ? '史诗' : lv >= 10 ? '稀有' : lv >= 5 ? '精良' : '普通'; },
    /* 目标是否可捕捉（虚弱 ≤40% 且为可骑乘兽类） */
    canCatch(m) {
      return !!(m && m.alive && m.realm === 'world' && !m.def.boss && !m.def.guard &&
        RIDE_DEF[m.type] && m.hp / m.maxHp <= 0.4);
    },
    chance(m) {
      const r = clamp(m.hp / m.maxHp, 0, 1);
      let c = 0.3 + (1 - r) * 0.65;
      if (F.Player.luckT > 0) c += 0.15;
      c *= F.Weather ? F.Weather.m('catch', 1) : 1;   /* 天气影响捕捉率 */
      return clamp(c, 0.15, 0.95);
    },
    curMount() { return F.Player.riding ? (M.list[M.active] || null) : null; },

    /* ---------- 投掷纳球 ---------- */
    throwBall(force) {
      const P = F.Player;
      if (P.riding) { F.UI.toast('骑乘中无法投掷纳球，先下马', 'info'); return false; }
      if ((F.Game.inv.ball_nab || 0) < 1) { F.UI.toast('没有纳球了（工坊「工器」可制作）', 'bad'); F.Audio2.bad(); return false; }
      const m = F.Combat ? F.Combat.nearest(P.pos.x, P.pos.z, 5.4) : null;
      if (!m) { F.UI.toast('附近没有野生动物', 'info'); return false; }
      if (!RIDE_DEF[m.type]) { F.UI.toast(m.def.name + ' 无法成为坐骑', 'info'); return false; }
      if (m.hp / m.maxHp > 0.4) { F.UI.toast(m.def.name + ' 还很健壮，先把生命打到 40% 以下', 'info'); return false; }
      F.Game.take('ball_nab', 1);
      P.playAction('chop', 0.5);
      /* 纳球飞行（抛物线） */
      const from = P.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
      const to = new THREE.Vector3(m.x, m.y + 0.9 * m.sc, m.z);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), F.MATS.std);
      M.scene.add(ball);
      const t0 = performance.now(), dur = 420;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        ball.position.lerpVectors(from, to, k);
        ball.position.y += Math.sin(k * Math.PI) * 1.5;
        if (k < 1) return requestAnimationFrame(step);
        M.scene.remove(ball);
        const ok = force !== undefined ? !!force : Math.random() < M.chance(m);
        if (ok) M.capture(m);
        else {
          m.angry = true; m.state = 'chase';
          F.FX.burst(m.x, m.y + 1.0 * m.sc, m.z, 0xd05a4a, 10, 1);
          F.FX.text(m.x, m.y + 2.1 * m.sc, m.z, '挣脱了！', '#ff9a7a');
          F.UI.toast('纳球被挣脱了！目标被激怒（剩余纳球 ×' + (F.Game.inv.ball_nab || 0) + '）', 'bad');
          F.Audio2.bad();
        }
      };
      step();
      return true;
    },

    capture(m) {
      if (M.list.length >= M.MAX) { F.UI.toast('坐骑栏已满（' + M.MAX + '），先放生一只', 'bad'); return; }
      const d = RIDE_DEF[m.type];
      const q = M.qualityOf(m.lv);
      const qi = Math.max(0, F.QUALITIES.indexOf(q));
      const mount = {
        type: m.type, name: d.name, q, lv: m.lv, h: d.h,
        mul: +(d.mul + QSPD[qi]).toFixed(2), day: F.Game.day || 1,
      };
      /* 从怪物列表移除 */
      m.alive = false;
      const i = F.Combat.mobs.indexOf(m);
      if (i >= 0) F.Combat.mobs.splice(i, 1);
      M.list.push(mount);
      F.FX.burst(m.x, m.y + 1.0, m.z, 0x7fd8e8, 24, 1.4);
      F.FX.text(m.x, m.y + 2.2, m.z, '捕捉成功！', '#7fd8e8');
      F.UI.toast('捕捉成功！' + d.name + '（' + q + ' · 移速 +' + Math.round((mount.mul - 1) * 100) + '%）加入坐骑栏，按 M 查看', 'ok');
      F.Audio2.ok();
      if (F.Social) F.Social.sys('捕捉：你收服了 ' + d.name + '（' + q + '）作为坐骑！');
      M.onChange && M.onChange();
    },

    /* ---------- 骑乘 / 下马 ---------- */
    ride(i) {
      const mt = M.list[i];
      if (!mt) return false;
      if (F.Player.riding) M.dismount(true);
      const P = F.Player;
      if (P.swimming) { F.UI.toast('水中无法骑乘', 'bad'); return false; }
      if (F.Dungeon && F.Dungeon.inside) { F.UI.toast('副本内无法骑乘', 'bad'); return false; }
      if (F.House && F.House.inside) { F.UI.toast('室内无法骑乘', 'bad'); return false; }
      M.active = i;
      P.riding = true;
      M.phase = 'up'; M.k = 0;
      /* 坐骑网格（复用怪物几何） */
      const geo = F.MOBS[mt.type].geo();
      if (!M.mesh) {
        M.mesh = new THREE.Mesh(geo, F.MATS.std);
        M.mesh.castShadow = true;
        M.scene.add(M.mesh);
      } else {
        M.mesh.geometry = geo;
      }
      M.mesh.visible = true;
      P.playAction('chop', 0.45);
      F.Audio2.ok();
      F.UI.toast('骑上了' + mt.name + '（移速 +' + Math.round((mt.mul - 1) * 100) + '%）· 再按 M 下马', 'ok');
      M.onChange && M.onChange();
      return true;
    },
    dismount(quiet) {
      if (!F.Player.riding) return;
      F.Player.riding = false;
      M.active = -1;
      M.phase = 'down'; M.k = 1;
      const P = F.Player;
      /* 下马侧跳 */
      P.vy = 3.6; P.onGround = false;
      P.pos.x += Math.cos(P.rot + Math.PI / 2) * 0.9;
      P.pos.z += Math.sin(P.rot + Math.PI / 2) * 0.9;
      F.Audio2.blip(240, 0.1, 'square', 0.05);
      if (!quiet) { F.UI.toast('已下马', 'info'); M.onChange && M.onChange(); }
    },

    /* ---------- 每帧：坐骑跟随 + 姿态动画 ---------- */
    update(dt) {
      const P = F.Player;
      if (!M.mesh) return;
      /* 自动下马 */
      if (P.riding && (P.swimming || (F.House && F.House.inside))) M.dismount();

      const mt = F.Player.riding ? M.list[M.active] : null;
      /* 过渡动画 */
      if (M.phase === 'up') {
        M.k = Math.min(1, M.k + dt * 3.2);
        if (M.k >= 1) M.phase = null;
      } else if (M.phase === 'down') {
        M.k = Math.max(0, M.k - dt * 4.5);
        if (M.k <= 0) { M.phase = null; M.mesh.visible = false; }
      }
      const e = smoothstep(0, 1, M.k);
      const lift = mt ? mt.h : (M.list[0] ? M.list[0].h : 1);

      /* 坐骑贴地跟随（略带弹跳节奏） */
      if (M.mesh.visible) {
        const gy = T.hAt(P.pos.x, P.pos.z);
        const spdK = clamp(P.speed / (P.SPD.walk * 1.4), 0, 1.4);
        M.mesh.position.set(P.pos.x, gy + Math.abs(Math.sin(P.anim)) * 0.07 * spdK, P.pos.z);
        M.mesh.rotation.y = P.rot;
        /* 奔跑尘土 */
        M.dustT -= dt;
        if (P.riding && spdK > 0.5 && M.dustT <= 0) {
          M.dustT = 0.22;
          F.FX.burst(P.pos.x, gy + 0.15, P.pos.z, 0xcabb9a, 2, 0.5);
        }
      }

      /* 玩家姿态：上抬 + 腿部收拢（覆盖步行摆腿） */
      const mm = P.model;
      if (!mm) return;
      if (e > 0.001) mm.group.position.y += lift * e;
      if (P.riding || e > 0.05) {
        const tuck = -1.15 * e;
        mm.legs[0].rotation.x = tuck;
        mm.legs[1].rotation.x = tuck + 0.08;
        mm.arms[0].rotation.x = lerp(mm.arms[0].rotation.x, -0.55, Math.min(1, dt * 8));
        mm.arms[1].rotation.x = lerp(mm.arms[1].rotation.x, -0.55, Math.min(1, dt * 8));
      }
    },
  });
})();
