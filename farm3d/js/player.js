/* ==========================================================================
 * 牧野田园 Open Farm  ·  第三人称角色控制 / 相机 / 输入
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp, lerp = F.lerp, damp = F.damp;

  /* 出生点：营地，安全区不生成资源节点 */
  const SPAWN = { x: 4, z: 104 };
  F.playerSafe = (x, z) => F.dist2(x, z, SPAWN.x, SPAWN.z) < 11 * 11;

  /* ============================ 输入 ============================ */
  const Input = (F.Input = {
    keys: {}, codes: {}, mx: 0, my: 0, dx: 0, dy: 0, dragging: false, wheel: 0,
    clickX: 0, clickY: 0, clicked: false, down: false, downT: 0, dragDist: 0,
    init(dom) {
      /* ponytail: 只忽略「正在打字的可见输入框」——隐藏的输入框（面板已关但焦点残留）
         不该把游戏按键全吞掉；同时记 e.code，供空格这类键做兜底 */
      const typing = e => !!e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && e.target.offsetParent !== null;
      addEventListener('keydown', e => {
        if (typing(e)) return;
        const k = (e.key || '').toLowerCase();
        Input.keys[k] = true;
        if (e.code) Input.codes[e.code] = true;
        if (k === ' ' || e.code === 'Space') e.preventDefault();
      });
      addEventListener('keyup', e => {
        Input.keys[(e.key || '').toLowerCase()] = false;
        if (e.code) Input.codes[e.code] = false;
      });
      addEventListener('blur', () => { Input.keys = {}; Input.codes = {}; Input.rmb = false; });
      dom.addEventListener('mousedown', e => {
        Input.down = true; Input.downT = performance.now(); Input.dragDist = 0;
        Input.mx = e.clientX; Input.my = e.clientY;
        Input.clickX = e.clientX; Input.clickY = e.clientY;
        Input.dragging = true;
        /* 在画布上开始操作 = 回到游戏中，指针重新藏起来 */
        if (F.UI && F.UI.setCursor) F.UI.setCursor(true);
        if (e.button === 2) Input.rmb = true;                    /* 技能槽 3 */
      });
      addEventListener('mousemove', e => {
        if (Input.down) {
          Input.dx += e.clientX - Input.mx;
          Input.dy += e.clientY - Input.my;
          Input.dragDist += Math.abs(e.clientX - Input.mx) + Math.abs(e.clientY - Input.my);
        }
        Input.mx = e.clientX; Input.my = e.clientY;
      });
      addEventListener('mouseup', e => {
        Input.down = false; Input.dragging = false;
        if (e.button === 2) Input.rmb = false;
        if (Input.dragDist < 6 && performance.now() - Input.downT < 320) {
          Input.clicked = true;
          Input.clickX = e.clientX; Input.clickY = e.clientY;
        }
      });
      dom.addEventListener('wheel', e => { Input.wheel += Math.sign(e.deltaY) * 1.0; e.preventDefault(); }, { passive: false });
      dom.addEventListener('contextmenu', e => e.preventDefault());
    },
    consume() { const d = { dx: Input.dx, dy: Input.dy, wheel: Input.wheel }; Input.dx = 0; Input.dy = 0; Input.wheel = 0; return d; },
    key(k) { return !!Input.keys[k]; },
    code(c) { return !!Input.codes[c]; },
  });

  /* ============================ 玩家 ============================ */
  const P = (F.Player = {
    pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
    rot: 0, vy: 0, onGround: true, speed: 0, anim: 0,
    camYaw: Math.PI, camPitch: 0.42, camDist: 7.2,
    tool: 'none', toolMesh: null, action: null, actionT: 0,
    hunger: 88, energy: 100, swimming: false, riding: false,
    energyBuff: 0, indoor: false, indoorY: 0,
    hp: 100, hpMax: 100, luckT: 0, strT: 0, dead: false, deadT: 0,
    model: null, scene: null, camera: null,

    init(scene, camera) {
      P.scene = scene; P.camera = camera;
      const m = F.PROPS.character({ shirt: 0x6ba8d6 });
      scene.add(m.group);
      P.model = m;
      P.pos.y = T.hAt(P.pos.x, P.pos.z);
      P.setTool('none');
      P.updateCamera(0, true);
    },

    setTool(id) {
      if (P.toolMesh) { P.toolMesh.parent && P.toolMesh.parent.remove(P.toolMesh); P.toolMesh = null; }
      P.tool = id;
      if (id && id !== 'none') {
        const kind = { axe: 'axe', pick: 'pick', hoe: 'hoe', sickle: 'sickle', can: 'can', rod: 'rod', feed: 'feed', hammer: 'hammer' }[id] || 'hammer';
        const mesh = new THREE.Mesh(F.PROPS.tool(kind), F.MATS.std);
        mesh.castShadow = true;
        mesh.position.set(0, -0.42, 0.06);
        mesh.rotation.x = -0.25;
        P.model.arms[1].add(mesh);
        P.toolMesh = mesh;
      }
      F.UI && F.UI.syncHotbar && F.UI.syncHotbar();
    },

    /* 播放一次交互动作 */
    playAction(type, dur) { P.action = type; P.actionT = 0; P.actionDur = dur || 0.6; },

    update(dt, locked) {
      /* ---- 输入 ---- */
      const ev = Input.consume();
      if (!locked) {
        P.camYaw -= ev.dx * 0.0042;
        P.camPitch = clamp(P.camPitch + ev.dy * 0.0030, -0.15, 1.05);
        P.camDist = clamp(P.camDist + ev.wheel * 0.85, 3.2, 15);
      }

      /* ---- 移动（键位可自定义，方向键始终作为备选） ----
         ponytail: Input.axis 是移动端摇杆的连续输入（-1~1），有它时优先用它 —— 手轻推就慢走、
         推满才全速；键盘那套布尔量保持原样（axis 只在 js/mobile.js 里存在） */
      let ix = 0, iz = 0;
      const ax = Input.axis;
      if (!locked && ax && ax.a) {
        ix = ax.x; iz = ax.y;
      } else if (!locked) {
        if (Input.key(F.bind('forward')) || Input.key('arrowup')) iz += 1;
        if (Input.key(F.bind('back')) || Input.key('arrowdown')) iz -= 1;
        if (Input.key(F.bind('left')) || Input.key('arrowleft')) ix -= 1;
        if (Input.key(F.bind('right')) || Input.key('arrowright')) ix += 1;
      }
      const mag = Math.hypot(ix, iz);
      const run = Input.key(F.bind('run')) && P.energy > 6 && P.hunger > 5;
      const deckY = F.Builds ? F.Builds.deckAt(P.pos.x, P.pos.z) : null;
      const onDeck = !P.indoor && deckY !== null && deckY > T.hAt(P.pos.x, P.pos.z);
      const depth = P.indoor ? 0 : T.depthAt(P.pos.x, P.pos.z);
      P.swimming = !P.indoor && !onDeck && depth > 1.45;

      let sp = 0;
      if (mag > 0.01) {
        if (mag > 1.01) { ix /= mag; iz /= mag; }   /* 只归一化超过 1 的情况：键盘斜向不变，摇杆保留推力大小 */
        const fwd = P.camYaw + Math.PI;
        const dirX = Math.sin(fwd), dirZ = Math.cos(fwd);
        const rightX = Math.sin(fwd - Math.PI / 2), rightZ = Math.cos(fwd - Math.PI / 2);
        const mx = dirX * iz + rightX * ix;
        const mz = dirZ * iz + rightZ * ix;
        const rid = F.Mounts && F.Mounts.curMount ? F.Mounts.curMount() : null;
        const wx = F.Weather ? F.Weather.m('speed', 1) : 1;
        const base = P.swimming ? 2.9 : (run ? 7.4 : 4.3) * (rid ? rid.mul : 1) * wx;
        const hungry = P.hunger <= 0 ? 0.62 : 1;
        sp = base * hungry;
        if (P.action) sp *= 0.35;
        if (F.Ability) sp *= F.Ability.moveMul();           /* 施法前摇/收招期间脚步变沉 */
        let nx = P.pos.x + mx * sp * dt;
        let nz = P.pos.z + mz * sp * dt;

        /* 世界边界（柔软回推，无硬墙感） */
        const rr = Math.hypot(nx, nz);
        if (rr > 283 && !P.indoor) { const k = 283 / rr; nx *= k; nz *= k; }

        /* 建筑碰撞 */
        if (F.Builds) {
          const hit = F.Builds.pushOut(nx, nz, 0.52);
          if (hit) { nx = hit.x; nz = hit.z; }
        }
        /* 树木 / 岩石碰撞 */
        if (F.Nodes) {
          const cols = F.Nodes.near(nx, nz, 1.6);
          for (const e of cols) {
            const n = e.n;
            if (n.def.r < 0.45) continue;
            const rad = n.def.r * n.s * 0.8 + 0.5;
            const d = Math.hypot(nx - n.x, nz - n.z);
            if (d < rad && d > 0.001) {
              const k = (rad - d) / d;
              nx += (nx - n.x) * k; nz += (nz - n.z) * k;
            }
          }
        }
        P.pos.x = nx; P.pos.z = nz;
        if (P.indoor) {
          if (F.Dungeon && F.Dungeon.inside) F.Dungeon.clampPlayer(P);
          else if (F.House) F.House.clampPlayer(P);
        }
        P.rot += F.angDelta(P.rot, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
        P.speed = damp(P.speed, sp, 12, dt);
      } else {
        P.speed = damp(P.speed, 0, 12, dt);
      }

      /* ---- 垂直：地形贴附 / 桥面 / 游泳 / 跳跃 ---- */
      /* 贴地用 hMesh（与渲染三角面一致），陡坡上不会沉进山体 */
      const gy = P.indoor ? P.indoorY : Math.max(T.hMesh ? T.hMesh(P.pos.x, P.pos.z) : T.hAt(P.pos.x, P.pos.z), onDeck ? deckY : -999);
      /* ponytail: 空格在不同输入法/键盘下 e.key 可能是 'Process' / 'Spacebar'，用 e.code 兜底；
         落地判定放宽到「贴着地面」而不是死盯 onGround 标志位，避免偶尔跳不起来 */
      const jumpKey = F.bind('jump');
      const jumpDown = Input.key(jumpKey) || (jumpKey === ' ' && Input.code('Space'));
      const grounded = P.onGround || P.pos.y <= gy + 0.05;
      if (P.swimming) {
        P.pos.y = damp(P.pos.y, T.WATER - 0.62, 6, dt);
        P.vy = 0; P.onGround = false;
      } else {
        if (!jumpDown || !grounded) {
          if (P.onGround && P.pos.y <= gy + 0.02) { P.pos.y = gy; P.vy = 0; }
          else { P.vy -= 22 * dt; P.pos.y += P.vy * dt; if (P.pos.y <= gy) { P.pos.y = gy; P.vy = 0; P.onGround = true; } }
        }
        if (grounded && jumpDown) {
          if (P.energy > 4) { P.vy = 7.2; P.onGround = false; P.energy -= 4; }
          else {                                   /* 以前是静默失败，玩家会以为「空格坏了」 */
            const now = performance.now() / 1000;
            if (now - (P.jumpWarnT || 0) > 2.5) {
              P.jumpWarnT = now;
              if (F.UI) F.UI.toast('体力不足：跳跃需要 4 点体力', 'bad');
              if (F.Audio2) F.Audio2.bad();
            }
          }
        }
        if (!P.onGround) { P.vy -= 22 * dt; P.pos.y += P.vy * dt; if (P.pos.y <= gy) { P.pos.y = gy; P.vy = 0; P.onGround = true; } }
        if (P.onGround) P.pos.y = damp(P.pos.y, gy, 18, dt);
      }

      /* ---- 生命：脱战缓慢自愈 ---- */
      P.hpMax = 100 + (F.Game && F.Game.defense ? F.Game.defense() * 2 : 0);
      if (P.hp > 0 && !P.dead) P.hp = clamp(P.hp + dt * 0.8, 0, P.hpMax);

      /* ---- 体力 / 饥饿 ---- */
      const moving = P.speed > 0.6;
      if (P.energyBuff > 0) {         /* 体力药水：每秒 +5，持续 3 秒 */
        P.energyBuff -= dt;
        P.energy = clamp(P.energy + dt * 5, 0, 100);
      }
      const we = F.Weather ? F.Weather.m('energy', 1) : 1;
      if (P.swimming) P.energy = clamp(P.energy - dt * 2.2 * we, 0, 100);
      else if (run && moving) P.energy = clamp(P.energy - dt * (P.riding ? 1.4 : 3.4) * we, 0, 100);
      else if (moving) P.energy = clamp(P.energy - dt * 0.35 * we, 0, 100);
      else P.energy = clamp(P.energy + dt / 60, 0, 100);   /* 静息恢复：1 点 / 分钟 */
      P.hunger = clamp(P.hunger - dt * 0.22 * (F.Weather ? F.Weather.m('hunger', 1) : 1), 0, 100);

      /* ---- 动画 ---- */
      const M = P.model;
      M.group.position.copy(P.pos);
      M.group.rotation.y = P.rot;
      const walkK = clamp(P.speed / 4.3, 0, 2);
      P.anim += dt * (1.6 + walkK * 8.5);
      const sw = Math.sin(P.anim) * 0.62 * clamp(walkK, 0, 1.3);
      if (P.swimming) {
        M.arms[0].rotation.x = -1.1 + Math.sin(P.anim * 1.6) * 0.5;
        M.arms[1].rotation.x = -1.1 + Math.sin(P.anim * 1.6 + 1.6) * 0.5;
        M.legs[0].rotation.x = Math.sin(P.anim * 1.2) * 0.35;
        M.legs[1].rotation.x = -Math.sin(P.anim * 1.2) * 0.35;
        M.group.rotation.x = 0.55;
      } else {
        M.group.rotation.x = lerp(M.group.rotation.x, 0, Math.min(1, dt * 8));
        M.legs[0].rotation.x = sw; M.legs[1].rotation.x = -sw;
        if (P.action) {
          P.actionT += dt;
          const k = clamp(P.actionT / P.actionDur, 0, 1);
          const swing = Math.sin(k * Math.PI) * (P.action === 'chop' || P.action === 'mine' ? 1 : 0.5);
          M.arms[0].rotation.x = -0.2 - swing * 0.4;
          M.arms[1].rotation.x = -0.3 - swing * 1.5;
          if (P.actionT >= P.actionDur) P.action = null;
        } else {
          M.arms[0].rotation.x = -sw * 0.85;
          M.arms[1].rotation.x = sw * 0.85;
        }
        M.head.rotation.y = lerp(M.head.rotation.y, clamp(F.angDelta(P.rot, P.camYaw + Math.PI) * 0.35, -0.6, 0.6), Math.min(1, dt * 5));
      }

      /* ---- 钓鱼动作：抛竿后举竿，咬钩抖动，收竿回拉 ---- */
      const fs = F.Inter && F.Inter.fishing;
      if (fs) {
        if (fs.phase === 'cast') {
          const k = clamp(fs.t / 0.85, 0, 1);
          M.arms[1].rotation.x = lerp(M.arms[1].rotation.x, -0.5 - Math.sin(k * Math.PI) * 1.5, Math.min(1, dt * 10));
          M.arms[0].rotation.x = lerp(M.arms[0].rotation.x, -0.35, Math.min(1, dt * 8));
        } else if (fs.phase === 'wait') {
          M.arms[1].rotation.x = lerp(M.arms[1].rotation.x, -1.75 + Math.sin(P.anim * 0.8) * 0.05, Math.min(1, dt * 6));
          M.arms[0].rotation.x = lerp(M.arms[0].rotation.x, -0.28, Math.min(1, dt * 6));
        } else if (fs.phase === 'bite') {
          M.arms[1].rotation.x = -1.75 + Math.sin(fs.t * 22) * 0.16;
          M.arms[0].rotation.x = -0.28;
        } else if (fs.phase === 'reel') {
          const k = clamp(fs.t / 0.75, 0, 1);
          M.arms[1].rotation.x = lerp(-1.7, 0.5, Math.sin(k * Math.PI * 0.9));
          M.arms[0].rotation.x = lerp(-0.28, -1.0, Math.sin(k * Math.PI * 0.9));
        }
      } else if (P.reelT > 0) {
        /* 收竿余韵（空竿收线） */
        P.reelT -= dt;
        const k = clamp(1 - P.reelT / 0.5, 0, 1);
        M.arms[1].rotation.x = lerp(-1.7, 0.4, Math.sin(k * Math.PI));
      }
      if (!P.onGround && !P.swimming) {
        M.legs[0].rotation.x = -0.3; M.legs[1].rotation.x = 0.25;
      }

      P.updateCamera(dt);
    },

    /* 受伤 / 被击倒 → 送回新手村 */
    hurt(dmg) {
      if (P.dead) return;
      P.hp -= dmg;
      F.FX.burst(P.pos.x, P.pos.y + 1.1, P.pos.z, 0xd05a4a, 6, 0.7);
      F.Audio2.blip(140, 0.14, 'sawtooth', 0.07);
      if (P.hp <= 0) {
        P.hp = 0; P.dead = true;
        F.UI.toast('你被击倒了…正在送回新手村', 'bad');
        if (F.Social) F.Social.sys('战斗：你在战斗中被击倒，已被送回新手村。');
        const fd = F.fade || (fn => fn());
        fd(() => {
          const V = F.Village;
          const rx = V && V.built ? V.x : 4, rz = V && V.built ? V.z + 8 : 104;
          P.pos.set(rx, T.hAt(rx, rz), rz);
          P.hp = P.hpMax * 0.6; P.dead = false; P.energy = Math.max(P.energy, 30);
          F.Inter.exitAll();
          if (F.Dungeon && F.Dungeon.inside) F.Dungeon.exit();
        });
      }
    },

    updateCamera(dt, instant) {
      const cam = P.camera;
      const d = P.camDist;
      const px = P.pos.x, py = P.pos.y + 1.45, pz = P.pos.z;
      const cp = Math.cos(P.camPitch), sp2 = Math.sin(P.camPitch);
      let cx = px + Math.sin(P.camYaw) * d * cp;
      let cz = pz + Math.cos(P.camYaw) * d * cp;
      let cy = py + sp2 * d * 0.92 + 0.5;
      /* 相机不入地 / 不穿山体：沿视线多次采样，被地形挡住就把相机拉近 */
      let cd = d;
      for (let s = 1; s <= 6; s++) {
        const tt = s / 6;
        const sx = px + (cx - px) * tt, sy = py + (cy - py) * tt, sz = pz + (cz - pz) * tt;
        if (sy < (T.hMesh ? T.hMesh(sx, sz) : T.hAt(sx, sz)) + 0.55) { cd = Math.max(1.5, d * tt - 0.35); break; }
      }
      if (cd !== d) {
        cx = px + Math.sin(P.camYaw) * cd * cp;
        cz = pz + Math.cos(P.camYaw) * cd * cp;
        cy = py + sp2 * cd * 0.92 + 0.5;
      }
      const gh = T.hMesh ? T.hMesh(cx, cz) : T.hAt(cx, cz);
      if (cy < gh + 0.75) cy = gh + 0.75;
      if (instant) cam.position.set(cx, cy, cz);
      else {
        cam.position.x = damp(cam.position.x, cx, 14, dt || 0.016);
        cam.position.y = damp(cam.position.y, cy, 12, dt || 0.016);
        cam.position.z = damp(cam.position.z, cz, 14, dt || 0.016);
      }
      cam.lookAt(px, py + 0.35, pz);
    },

    /* 前方 1.4 米的交互点 */
    frontPos(out) {
      out = out || new THREE.Vector3();
      return out.set(P.pos.x + Math.sin(P.rot) * 1.1, P.pos.y, P.pos.z + Math.cos(P.rot) * 1.1);
    },
  });

})();
