/* ==========================================================================
 * 牧野田园 Open Farm  ·  交互：采集 / 开垦种植 / 放牧 / 建造 / 钓鱼
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp, lerp = F.lerp;

  /* 鱼作为物品登记 */
  for (const f of F.FISH) F.ITEMS['fish_' + f.id] = { name: f.name, c: f.c };

  const TOOL_NAME = { axe: '斧头', pick: '镐子', sickle: '镰刀', hoe: '锄头', seed: '种子袋', can: '水壶', rod: '鱼竿', feed: '牧草捆', hammer: '建造锤', none: '空手' };
  const ACTION_VERB = { axe: '砍伐', pick: '开采', sickle: '采集' };

  /* 采集门槛：所需生活技能等级（缺 lv 字段 = 1 级即可）· 镐→挖矿，其余→采集 */
  /* ponytail: 门槛表直接写在 NODE_DEFS 的 lv 字段上，资源种类再多再抽成独立配置 */
  const GATE_XP = 2;                                   /* 与下面 addSkill(…, 2) 保持一致 */
  const NODE_CLASS = { axe: '伐木', pick: '采矿', sickle: '采摘' };
  /* 选中反馈配色（低饱和、避开纯白/高亮），ACTIVE = 真正操作时才允许的透明度上限 */
  const RING_C = { select: 0x9fd8b0, remove: 0xd99a8a, move: 0x9ab8d8, active: 0.5 };
  function nodeSkill(d) { return d.tool === 'pick' ? 'mine' : 'gather'; }
  function nodeNeed(d) { return d.lv || 1; }
  /* 靠近资源点时左下角弹出的信息卡：等级要求 / 现有等级 / 采集种类 / 掉落物 / 经验值 */
  function nodeCard(d) {
    const sk = nodeSkill(d), need = nodeNeed(d), lv = F.Skills.lv(sk);
    const ok = lv >= need;
    const drops = Object.keys(d.yield).map(k => F.itemName(k) + ' ×' + d.yield[k]).join('、');
    /* 概率额外产出（例如灌木丛的浆果）单独一行写清楚，否则玩家不知道这里能采到吃的 */
    let bonus = '';
    if (d.bonus) {
      for (const k in d.bonus) {
        const b = d.bonus[k];
        bonus += `<div class="ni-d">另有 ${Math.round(b.p * 100)}% 概率额外产出：${F.itemName(k)} ${b.n[0]}~${b.n[1]} 个</div>`;
      }
    }
    /* 「35% 多出 1 个」只对普通固定产出成立；bonus 同名的产出（如浆果丛的浆果）走上面那行 */
    const fixed = Object.keys(d.yield).filter(k => !(d.bonus && d.bonus[k]));
    const extraTxt = fixed.length ? '（另有约 35% 概率多出 1 个）' : '';
    return `<div class="ni-h">${d.name}<span>${NODE_CLASS[d.tool] || '资源'}</span></div>
      <div class="ni-r">等级要求 <b>${F.SKILLS[sk].name} Lv.${need}</b> · 现有 <b class="${ok ? 'ok' : 'no'}">Lv.${lv}</b></div>
      <div class="ni-d">${ok ? '可采集' : '等级不足，无法采集'}</div>
      <div class="ni-d">掉落物：${drops}${extraTxt}</div>${bonus}
      <div class="ni-d">采集经验：${F.SKILLS[sk].name} +${GATE_XP}</div>`;
  }

  const I = (F.Inter = {
    target: null, work: null, build: null, removeMode: false, moveMode: false,
    fishing: null, ghost: null, ghostOK: false, ghostMat: null,
    ring: null, bobber: null, line: null, ripple: null, lastPlace: null, placeT: 0,
    seed: 'wheat', torch: 0,

    init(scene, camera) {
      I.scene = scene; I.camera = camera;

      /* 选中反馈：默认完全不可见，只有真正操作时才浮现一条 ≤1px 的细线
         ponytail: 用 LineLoop（线宽恒为 1px，最克制）代替原来的粗 torus 亮环；
                   配合夜晚低多边形场景选了低饱和的柔绿，避免刺眼白光 */
      const rp = [];
      for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2; rp.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
      I.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rp),
        new THREE.LineBasicMaterial({ color: RING_C.select, transparent: true, opacity: 0, depthTest: false }));
      I.ring.renderOrder = 5;
      I.ring.visible = false;
      I.ringT = 0;                                   /* 目标透明度：默认 0（不渲染任何可见图形） */
      scene.add(I.ring);

      /* 幽灵建筑材质 */
      I.ghostMat = new THREE.MeshStandardMaterial({
        color: 0x7fe08a, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.6, emissive: 0x224422,
      });

      /* 浮标 + 鱼线 + 波纹 */
      const bob = F.mergeParts([
        { g: new THREE.SphereGeometry(0.16, 10, 8), c: 0xe8443c, t: [0, 0, 0] },
        { g: new THREE.SphereGeometry(0.16, 10, 8), c: 0xf5f5f0, t: [0, 0.13, 0] },
      ]);
      I.bobber = new THREE.Mesh(bob, F.MATS.std);
      I.bobber.visible = false; scene.add(I.bobber);

      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      I.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf0f0e0, transparent: true, opacity: 0.6 }));
      I.line.visible = false; I.line.frustumCulled = false;
      scene.add(I.line);

      const rg = new THREE.TorusGeometry(0.5, 0.06, 5, 20);
      rg.rotateX(-Math.PI / 2);
      I.ripple = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
      I.ripple.visible = false; scene.add(I.ripple);
    },

    /* -------------------- 视线与地面求交（解析法，避免逐帧射线检测） -------------------- */
    pickGround(mx, my) {
      const cam = I.camera;
      const ndc = new THREE.Vector3((mx / window.innerWidth) * 2 - 1, -(my / window.innerHeight) * 2 + 1, 0.5);
      ndc.unproject(cam);
      const dir = ndc.sub(cam.position).normalize();
      const o = cam.position;
      let t = 1.0, prev = o.y - T.hAt(o.x, o.z);
      for (let i = 0; i < 160; i++) {
        const p = { x: o.x + dir.x * t, y: o.y + dir.y * t, z: o.z + dir.z * t };
        const d = p.y - T.hAt(p.x, p.z);
        if (d < 0) {
          let a = t - (t / i || 2), b = t;
          for (let k = 0; k < 12; k++) {
            const m = (a + b) / 2;
            const q = { x: o.x + dir.x * m, y: o.y + dir.y * m, z: o.z + dir.z * m };
            if (q.y - T.hAt(q.x, q.z) < 0) b = m; else a = m;
          }
          const m = (a + b) / 2;
          return new THREE.Vector3(o.x + dir.x * m, 0, o.z + dir.z * m);
        }
        prev = d;
        t += clamp(Math.max(0.6, d * 0.9), 0.6, 4.5);
        if (t > 320) break;
      }
      return null;
    },

    /* ============================ 目标查找 ============================ */
    findTarget() {
      const P = F.Player;
      const px = P.pos.x, pz = P.pos.z;
      let best = null, bestScore = 1e9;

      /* 室内：只与床 / 储物箱 / 房门交互 */
      if (F.House && F.House.inside) {
        for (const f of F.House.items) {
          const d = Math.hypot(f.x - px, f.z - pz);
          if (d < f.r && d < bestScore) { bestScore = d; best = { kind: 'furn', f, d }; }
        }
        return best;
      }

      /* 副本内：通关奖励箱 / 出口传送门 / 副本怪物 */
      if (F.Dungeon && F.Dungeon.inside) {
        if (F.Dungeon.nearReward(px, pz, 2.8)) return { kind: 'dreward', d: 0 };
        if (F.Dungeon.nearExit(px, pz, 3.4)) return { kind: 'dexit', d: 0 };
        const dm = F.Combat ? F.Combat.nearestInRealm('dungeon', px, pz, 3.6) : null;
        if (dm) return { kind: 'mob', m: dm, d: Math.hypot(dm.x - px, dm.z - pz) };
        return null;
      }

      /* NPC / 传送门 / 宝箱 / 野外怪物（近距离优先） */
      if (F.Village) {
        if (F.Village.nearPortal(px, pz, 4.2)) return { kind: 'portal', d: 0 };
        if (F.Village.nearBoard && F.Village.nearBoard(px, pz, 3.0)) return { kind: 'board', d: 0 };
        if (F.Village.nearBroker && F.Village.nearBroker(px, pz, 3.4)) return { kind: 'black', d: 0 };
        const npc = F.Village.nearest(px, pz, 3.2);
        if (npc) return { kind: 'npc', n: npc, d: 0 };
      }
      if (F.Combat) {
        const ch = F.Combat.nearestChest(px, pz, 2.8);
        if (ch) return { kind: 'chest', c: ch, d: 0 };
        const mb = F.Combat.nearest(px, pz, 3.8);
        if (mb) return { kind: 'mob', m: mb, d: Math.hypot(mb.x - px, mb.z - pz) };
      }

      /* 资源节点 */
      const nodes = F.Nodes.near(px, pz, 3.4);
      for (const e of nodes) {
        const n = e.n;
        const score = Math.sqrt(e.d) - n.def.r * 0.4;
        if (score < bestScore) { bestScore = score; best = { kind: 'node', n, d: Math.sqrt(e.d) }; }
      }
      /* 农田地块（脚下优先） */
      const tile = F.Farm.tileAt(px, pz);
      if (tile) {
        const score = -0.6;
        if (score < bestScore) { bestScore = score; best = { kind: 'tile', t: tile, d: 0 }; }
      }
      /* 畜禽 */
      const an = F.Animals.nearest(px, pz, 3.2);
      if (an) {
        const d = Math.hypot(an.x - px, an.z - pz);
        if (d - 0.5 < bestScore) { bestScore = d - 0.5; best = { kind: 'animal', a: an, d }; }
      }
      /* 建筑 */
      const bs = F.Builds.nearBuildings(px, pz, 6);
      for (const b of bs) {
        if (!b.def.interact) continue;
        const d = Math.hypot(b.x - px, b.z - pz) - Math.max(b.hw, b.hd) - 0.6;
        if (d < bestScore) { bestScore = d; best = { kind: 'build', b, d }; }
      }
      /* 钓鱼点 */
      const spot = F.Fish.nearestSpot(px, pz, 5.0);
      if (spot) {
        const d = Math.hypot(spot.x - px, spot.z - pz) - 1.2;
        if (d < bestScore) { bestScore = d; best = { kind: 'fish', s: spot, d }; }
      }
      /* 水边打水 */
      if (P.tool === 'can') {
        const d = T.depthAt(px, pz);
        if (d < 0.35) {
          for (let a = 0; a < 8; a++) {
            const ang = a * 0.785;
            const wx = px + Math.cos(ang) * 2.2, wz = pz + Math.sin(ang) * 2.2;
            if (T.depthAt(wx, wz) > 0.25) {
              if (-1.0 < bestScore) { bestScore = -1.0; best = { kind: 'water', d: 0 }; }
              break;
            }
          }
        }
      }
      return best;
    },

    promptFor(t) {
      const P = F.Player;
      if (!t) return null;
      switch (t.kind) {
        case 'node': {
          const d = t.n.def;
          const verb = ACTION_VERB[d.tool];
          const need = TOOL_NAME[d.tool];
          const okTool = P.tool === d.tool;
          if (F.Skills.lv(nodeSkill(d)) < nodeNeed(d)) {
            return {
              text: `✖ ${verb}${d.name}：需要${F.SKILLS[nodeSkill(d)].name}等级 ${nodeNeed(d)} 级（当前 Lv.${F.Skills.lv(nodeSkill(d))}）`,
              tool: 'none', act: 'locked',
            };
          }
          return { text: `[F] ${verb} ${d.name}${okTool ? '' : '（需' + need + '）'}`, tool: d.tool, act: 'node' };
        }
        case 'tile': {
          const ti = t.t;
          if (ti.state === 0) return { text: '[F] 开垦土地（锄头）  ·  [G] 规划整理', tool: 'hoe', act: 'till' };
          if (ti.state === 1) return { text: `[F] 播种 ${F.CROPS[I.seed] ? F.CROPS[I.seed].name : ''}种子（${F.Game.seeds(I.seed)}）  ·  [G] 铲平`, tool: 'seed', act: 'plant' };
          if (ti.growth >= 1) return { text: '[F] 收获 ' + F.CROPS[ti.crop].name + '  ·  [G] 铲平', tool: 'sickle', act: 'harvest' };
          if (ti.water < 0.85) return { text: '[F] 浇水（水壶 ' + Math.ceil(F.Game.can) + '/10）  ·  [G] 铲平', tool: 'can', act: 'water' };
          return { text: '作物生长中 ' + Math.floor(ti.growth * 100) + '%  ·  [G] 铲平地块', tool: 'none', act: 'wait' };
        }
        case 'animal': {
          const a = t.a, def = a.def;
          if (F.Animals.productReady(a) && !def.lays) return { text: `[F] 收取${def.pname}  ·  [G] 驱赶`, tool: 'none', act: 'product' };
          if (a.baby) return { text: `${def.name}（幼崽 ${Math.floor(a.age * 100)}%）  ·  [G] 驱赶`, tool: 'none', act: 'none' };
          if (F.Game.has('hay', 1)) return { text: `[F] 喂食（牧草 ${F.Game.inv.hay || 0}）  ·  [G] 驱赶`, tool: 'feed', act: 'feed' };
          return { text: `${def.name}（饱食 ${Math.floor(a.hunger)}%${F.Animals.productReady(a) ? ' · 可收获' : ''}）  ·  [G] 驱赶`, tool: 'none', act: 'none' };
        }
        case 'mob': {
          const canCatch = F.Mounts && F.Mounts.canCatch(t.m) && (F.Game.inv.ball_nab || 0) > 0;
          return { text: '[F] 攻击 ' + t.m.def.name + '（Lv.' + t.m.lv + '）' + (canCatch ? ' · [R] 投掷纳球捕捉' : ''), tool: 'none', act: 'attack' };
        }
        case 'chest': return { text: '[F] 开启宝箱', tool: 'none', act: 'chest' };
        case 'npc': return { text: '[F] 与 ' + t.n.name + ' 对话', tool: 'none', act: 'npc' };
        case 'board': return { text: '[F] 查看公告板（悬赏委托 / 名人堂）', tool: 'none', act: 'board' };
        case 'black': return { text: '[F] 进入黑市（摆摊 / 面对面交易 · 税费 30%）', tool: 'none', act: 'black' };
        case 'portal': return { text: '[F] 世界塔传送门（选择副本层数）', tool: 'none', act: 'portal' };
        case 'dexit': return { text: '[F] 离开副本', tool: 'none', act: 'dexit' };
        case 'dreward': return { text: '[F] 领取通关奖励', tool: 'none', act: 'dreward' };
        case 'furn': {
          const f = t.f;
          if (f.kind === 'bed') return { text: '[F] 休息 1 小时（+20 体力）  ·  [G] 睡觉 8 小时', tool: 'none', act: 'bed' };
          if (f.kind === 'chest') return { text: '[F] 打开储物箱', tool: 'none', act: 'chest' };
          return { text: '[F] 走出房间', tool: 'none', act: 'door' };
        }
        case 'build': {
          const b = t.b;
          switch (b.def.interact) {
            case 'sleep': return { text: '[F] 休息至次日清晨', tool: 'none', act: 'sleep' };
            case 'enter': return { text: '[F] 进入房间', tool: 'none', act: 'enter' };
            case 'trade': return { text: '[F] 出售物资（换金币）', tool: 'none', act: 'trade' };
            case 'craft': return { text: '[F] 加工制作', tool: 'none', act: 'craft' };
            case 'storage': return { text: '[F] 仓库存取', tool: 'none', act: 'storage' };
            case 'barn': return { text: '[F] 查看畜禽状态', tool: 'none', act: 'barn' };
            case 'well': return { text: '[F] 打水（装满水壶）', tool: 'can', act: 'well' };
            case 'mill': return { text: '[F] 磨面（小麦×3 → 面粉×1）', tool: 'none', act: 'mill' };
            case 'campfire': return { text: '[F] 休息恢复体力  ·  [G] 烤制食物', tool: 'none', act: 'campfire' };
            case 'gate': return { text: '[F] ' + (b.door ? '关门' : '开门'), tool: 'none', act: 'gate' };
            case 'haystack': return { text: `[F] 存入牧草×10  ·  [G] 取出（存${b.stored || 0}）`, tool: 'none', act: 'haystack' };
            case 'dock': return { text: '[F] 在此抛竿钓鱼', tool: 'rod', act: 'fish' };
            case 'hb_door': {
              if (F.HomeBuild && F.HomeBuild.isLocked(b)) return { text: '[F] 门已上锁（先解锁旁边的门锁）', tool: 'none', act: 'hb_door' };
              return { text: '[F] ' + (b.door ? '关门' : '开门'), tool: 'none', act: 'hb_door' };
            }
            case 'hb_lock': return { text: '[F] ' + (b.locked ? '解锁' : '上锁'), tool: 'none', act: 'hb_lock' };
            case 'hb_chest': return { text: '[F] 打开储物箱（仓库存取）', tool: 'none', act: 'hb_chest' };
            case 'hb_bench': return { text: '[F] 打开加工台 · 此处制取家园构件免手续费', tool: 'none', act: 'hb_bench' };
          }
          return null;
        }
        case 'fish': {
          const s = t.s;
          return { text: `[F] 抛竿钓鱼（鱼群 ${s.stock}/${s.max}）`, tool: 'rod', act: 'fish' };
        }
        case 'water':
          return { text: '[F] 打水（装满水壶）', tool: 'can', act: 'well' };
      }
      return null;
    },

    /* ============================ 每帧 ============================ */
    update(dt) {
      const P = F.Player;

      /* 进行中的工作 */
      if (I.work) {
        I.work.t += dt;
        const k = clamp(I.work.t / I.work.dur, 0, 1);
        F.UI.setProgress(k, I.work.label);
        if (k >= 1) { const f = I.work.onDone; I.work = null; F.UI.setProgress(0, ''); f && f(); }
        else {
          P.playAction(I.work.anim || 'chop', 0.5);
          if (Math.random() < dt * 8 && I.work.fx) {
            F.FX.burst(I.work.fx.x, I.work.fx.y, I.work.fx.z, I.work.fx.c, 2, 0.6);
          }
        }
      }

      /* 建造模式 */
      if (I.build) { I.updateBuild(dt); F.UI.setNodeInfo(null); }
      else if (I.removeMode || I.moveMode) { I.updateRemove(dt); F.UI.setNodeInfo(null); }
      else {
        I.target = I.findTarget();
        const pr = I.target ? I.promptFor(I.target) : null;
        F.UI.setPrompt(pr ? pr.text : '');
        F.UI.setNodeInfo(I.target && I.target.kind === 'node' ? nodeCard(I.target.n.def) : null);
        I.showRing(I.target);
      }
      I.updateRing();                    /* 每帧收敛：操作结束立即恢复不可见 */

      /* 点击：建造放置 / 拆除 / 提竿 */
      if (F.Input.clicked) {
        F.Input.clicked = false;
        if (I.fishing) I.reelIn();
        else if (I.build) I.tryPlace();
        else if (I.removeMode) I.tryRemove();
        else if (I.moveMode) I.tryMove();
        else if (I.target) I.pressF();
      }

      /* 钓鱼状态机 */
      I.updateFishing(dt);
    },

    /* 每帧淡入淡出（渐变，不是脉冲/闪烁），目标为 0 时彻底不渲染 */
    updateRing() {
      const r = I.ring, m = r.material;
      const target = I.ringT;
      m.opacity = m.opacity > target ? Math.max(target, m.opacity - 0.08) : Math.min(target, m.opacity + 0.08);
      r.visible = m.opacity > 0.02;
      if (!r.visible) m.opacity = 0;
    },

    /* 只有「真正操作」才允许出现：执行中 / 拆除或移动模式 / 按住鼠标（且没在拖视角） */
    ringActive() {
      return !!I.work || I.removeMode || I.moveMode || (F.Input.down && F.Input.dragDist < 6);
    },

    showRing(t) {
      const r = I.ring;
      if (!t) { I.ringT = 0; I.updateRing(); return; }
      let x, y, z, s = 1;
      if (t.kind === 'node') { x = t.n.x; z = t.n.z; y = t.n.y + 0.06; s = t.n.def.r * 1.5 + 0.4; }
      else if (t.kind === 'tile') { x = t.t.x; z = t.t.z; y = t.t.y + 0.08; s = 1.28; }
      else if (t.kind === 'animal') { x = t.a.x; z = t.a.z; y = t.a.y + 0.05; s = t.a.def.r * 2.0; }
      else if (t.kind === 'build') { x = t.b.x; z = t.b.z; y = t.b.y + 0.08; s = Math.max(t.b.hw, t.b.hd) * 1.25; }
      else if (t.kind === 'fish') { x = t.s.x; z = t.s.z; y = T.hAt(t.s.x, t.s.z) + 0.08; s = 1.6; }
      else if (t.kind === 'furn') { x = t.f.x; z = t.f.z; y = t.f.y + 0.35; s = t.f.kind === 'bed' ? 1.5 : 1.1; }
      else if (t.kind === 'mob') { x = t.m.x; z = t.m.z; y = t.m.y + 0.12; s = 0.9 + t.m.sc * 0.5; }
      else if (t.kind === 'chest') { x = t.c.x; z = t.c.z; y = t.c.y + 0.10; s = 1.2; }
      else if (t.kind === 'npc') { x = t.n.x; z = t.n.z; y = t.n.y + 0.06; s = 1.0; }
      else if (t.kind === 'portal') { const V = F.Village; x = V.portal.x; z = V.portal.z; y = V.portal.y + 0.1; s = 2.6; }
      else if (t.kind === 'dexit' || t.kind === 'dreward') { x = t.kind === 'dreward' ? 0 : F.Dungeon.exitPortal.x; z = t.kind === 'dreward' ? F.Dungeon.cz + 2 : F.Dungeon.exitPortal.z; y = F.Dungeon.y + 0.1; s = 2.2; }
      else { I.ringT = 0; I.updateRing(); return; }
      r.position.set(x, y, z);
      r.scale.setScalar(s);
      r.material.color.setHex(RING_C.select);
      I.ringT = I.ringActive() ? RING_C.active : 0;
      I.updateRing();
    },

    /* ============================ 主交互 F ============================ */
    pressF() {
      if (I.build || I.removeMode || I.moveMode) return;
      const t = I.target;
      if (!t) return;
      const p = I.promptFor(t);
      if (!p || p.act === 'none' || p.act === 'wait') {
        if (p && p.act === 'wait') F.UI.toast('作物还在生长，浇点水会更快', 'info');
        return;
      }
      /* 自动切换所需工具 */
      if (p.tool && p.tool !== 'none' && F.Player.tool !== p.tool) F.Player.setTool(p.tool);

      switch (p.act) {
        case 'locked': return;                     /* 生活技能等级不够：按键不生效，提示在屏幕提示行 */
        case 'node': return I.gatherNode(t.n);
        case 'till': return I.doTill(t.t);
        case 'plant': return I.doPlant(t.t);
        case 'harvest': return I.doHarvest(t.t);
        case 'water': return I.doWater(t.t);
        case 'product': return I.doProduct(t.a);
        case 'feed': return I.doFeed(t.a);
        case 'sleep': return I.doSleep();
        case 'craft': return F.UI.openPanel('craft');
        case 'storage': return F.UI.openPanel('storage');
        case 'barn': return F.UI.openPanel('barn');
        case 'well': return I.doWell();
        case 'mill': return I.doMill();
        case 'campfire': return I.doRest();
        case 'gate': return I.doGate(t.b);
        case 'haystack': return I.doHaystack(t.b, false);
        case 'hb_door': return I.doHomeDoor(t.b);
        case 'hb_lock': return I.doHomeLock(t.b);
        case 'hb_chest': return F.UI.openPanel('storage');
        case 'hb_bench': return F.UI.openPanel('craft');
        case 'fish': return I.startFishing(t.s || F.Fish.nearestSpot(F.Player.pos.x, F.Player.pos.z, 6));
        case 'enter': return F.House && F.House.enter(t.b);
        case 'trade': return F.UI.openPanel('trade');
        case 'bed': return F.Game.rest(1);
        case 'chest': return F.UI.openPanel('chest');
        case 'door': return F.House && F.House.exit();
        case 'furn': return null;
        case 'attack': return F.Combat && F.Combat.playerAttack();
        case 'chest': return F.Combat && F.Combat.openChest(t.c);
        case 'npc': return F.UI2 && F.UI2.panelShop(t.n.id);
        case 'board': return F.UI2 && F.UI2.panelBoard();
        case 'black': return F.UI2 && F.UI2.panelBlackMarket();
        case 'portal': return F.UI2 && F.UI2.panelPortal();
        case 'dexit': return F.Dungeon && F.Dungeon.exit();
        case 'dreward': return F.Dungeon && F.Dungeon.takeReward();
      }
    },

    pressG() {
      const t = I.target;
      if (t && t.kind === 'furn' && t.f.kind === 'bed') return F.Game.rest(8, 100);
      if (!t) {
        /* 空手驱赶附近畜禽 */
        const n = F.Animals.herd(F.Player.pos.x, F.Player.pos.z, 11);
        if (n) F.UI.toast('驱赶了 ' + n + ' 只畜禽', 'info');
        return;
      }
      if (t.kind === 'tile') return I.doClear(t.t);
      if (t.kind === 'animal') {
        const n = F.Animals.herd(F.Player.pos.x, F.Player.pos.z, 12);
        F.UI.toast('驱赶了 ' + n + ' 只畜禽', 'info');
        F.Audio2.pick();
        return;
      }
      if (t.kind === 'build') {
        if (t.b.def.interact === 'haystack') return I.doHaystack(t.b, true);
        if (t.b.def.interact === 'campfire') return I.doCook();
      }
      if (t.kind === 'node' || t.kind === 'fish') {
        const n = F.Animals.herd(F.Player.pos.x, F.Player.pos.z, 11);
        if (n) F.UI.toast('驱赶了 ' + n + ' 只畜禽', 'info');
      }
    },

    /* -------------------- 采集 -------------------- */
    gatherNode(n) {
      if (I.work) return;
      const d = n.def;
      if (F.Player.tool !== d.tool) { F.UI.toast('需要装备' + TOOL_NAME[d.tool], 'bad'); F.Audio2.bad(); return; }
      const skn = F.SKILLS[nodeSkill(d)].name;
      if (F.Skills.lv(nodeSkill(d)) < nodeNeed(d)) {
        F.UI.toast(`需要${skn}等级 ${nodeNeed(d)} 级才能采集（当前 Lv.${F.Skills.lv(nodeSkill(d))}）`, 'bad');
        F.Audio2.bad(); return;
      }
      const dur = 0.55 * d.hits;
      I.work = {
        t: 0, dur, label: ACTION_VERB[d.tool] + ' ' + d.name + '…', anim: d.tool === 'pick' ? 'mine' : 'chop',
        fx: { x: n.x, y: n.y + 1.0, z: n.z, c: d.tool === 'axe' ? 0x8a6a4a : (d.tool === 'pick' ? 0x9a9285 : 0x8fb255) },
        onDone: () => {
          const y = F.Nodes.harvest(n);
          if (!y) return;
          let first = '';
          for (const k in y) {
            /* 概率产出（如浆果）的数量已由 bonus 区间决定，不再叠那 35% 的 +1，否则会超出 5~10 */
            const amount = (d.bonus && d.bonus[k]) ? y[k] : y[k] + (Math.random() < 0.35 ? 1 : 0);
            F.Game.give(k, amount);
            if (!first) first = '+' + amount + ' ' + F.itemName(k);
          }
          F.FX.text(n.x, n.y + 1.6, n.z, first, '#ffe9a0');
          F.FX.burst(n.x, n.y + 1.1, n.z, d.tool === 'axe' ? 0x8a6a4a : 0x9a9285, 12, 1);
          if (d.tool === 'axe') { F.Audio2.chop(); F.Nodes.fall(n); }
          else if (d.tool === 'pick') { F.Audio2.mine(); }
          else { F.Audio2.pick(); }
          F.Game.stats.gather++;
          F.Game.addGuildXp(1);        /* 采集（砍树 / 挖矿 / 采摘）→ 公会经验 +1 */
          /* 技能：镐 = 挖矿，其余（斧 / 镰 / 手采）= 采集 */
          F.Game.addSkill(d.tool === 'pick' ? 'mine' : 'gather', 2);
          F.Game.addTool(F.Player.tool, 1);
          if (d.r >= 0.6) F.Player.energy = clamp(F.Player.energy - 2, 0, 100);
        },
      };
    },

    /* 技能面板用：某项生活技能对应的资源门槛表（按所需等级升序） */
    gateList(sk) {
      const out = [];
      for (const k in F.NODE_DEFS) {
        const d = F.NODE_DEFS[k];
        if (nodeSkill(d) !== sk) continue;
        out.push({ id: k, name: d.name, lv: nodeNeed(d) });
      }
      return out.sort((a, b) => a.lv - b.lv);
    },

    /* -------------------- 种植 -------------------- */
    doTill(t) {
      if (F.Farm.till(t)) {
        F.FX.burst(t.x, t.y + 0.15, t.z, 0x7a5c3c, 14, 0.8);
        F.FX.text(t.x, t.y + 0.7, t.z, '已开垦', '#e8d8a0');
        F.Audio2.pick();
        F.Player.playAction('hoe', 0.5);
        F.Game.stats.till++;
        F.Game.addSkill('farm', 1);
        F.Game.addTool('hoe', 1);
      } else F.UI.toast('这块地已经开垦过了', 'bad');
    },
    doPlant(t) {
      if (F.Game.seeds(I.seed) <= 0) { F.UI.toast('没有' + F.CROPS[I.seed].name + '种子了', 'bad'); F.Audio2.bad(); return; }
      if (F.Farm.plant(t, I.seed)) {
        F.Game.seeds(I.seed, -1);
        F.FX.burst(t.x, t.y + 0.2, t.z, 0xc8b06a, 8, 0.5);
        F.FX.text(t.x, t.y + 0.7, t.z, '播种 ' + F.CROPS[I.seed].name, '#b8e890');
        F.Audio2.pick();
        F.Player.playAction('hoe', 0.45);
        F.Game.stats.plant++;
      } else F.UI.toast('请先开垦这块地', 'bad');
    },
    doWater(t) {
      if (F.Game.can < 1) { F.UI.toast('水壶空了，去水边或水井打水', 'bad'); F.Audio2.bad(); return; }
      if (t.water > 0.9) { F.UI.toast('土壤还很湿润', 'info'); return; }
      if (F.Farm.water(t)) {
        F.Game.can -= 1;
        F.FX.burst(t.x, t.y + 0.6, t.z, 0x6fc8e0, 12, 0.5);
        F.Audio2.water();
        F.Player.playAction('water', 0.5);
      }
    },
    doHarvest(t) {
      const r = F.Farm.harvest(t);
      if (!r) return;
      F.Game.give(r.id, r.n);
      F.Game.seeds(r.id, r.seeds);
      F.FX.text(t.x, t.y + 1.0, t.z, '+' + r.n + ' ' + F.CROPS[r.id].name + '  +' + r.seeds + '种子', '#ffe9a0');
      F.FX.burst(t.x, t.y + 0.5, t.z, F.CROPS[r.id].c, 16, 0.9);
      F.Audio2.ok();
      F.Player.playAction('sickle', 0.45);
      F.Game.stats.harvest++;
      F.Game.addGuildXp(1);
      F.Game.addSkill('farm', 3);
      F.Game.addTool('sickle', 1);
    },
    doClear(t) {
      if (t.state === 0) { F.UI.toast('这里本来就是野地', 'info'); return; }
      if (F.Farm.clear(t)) {
        F.FX.burst(t.x, t.y + 0.15, t.z, 0x7a5c3c, 10, 0.7);
        F.FX.text(t.x, t.y + 0.7, t.z, '地块已还原', '#d8c8a0');
        F.Audio2.pick();
      }
    },

    /* -------------------- 畜牧 -------------------- */
    doProduct(a) {
      const def = a.def;
      if (!F.Animals.productReady(a)) { F.UI.toast(def.name + '还没产出' + def.pname, 'info'); return; }
      a.product = 0;
      F.Game.give(def.product, 1);
      F.FX.text(a.x, a.y + 1.8, a.z, '+' + def.pname, '#fff0c0');
      F.FX.burst(a.x, a.y + 1.2, a.z, 0xf0f0e0, 8, 0.6);
      F.Audio2.ok();
      F.Game.stats.product++;
    F.Game.addSkill('ranch', 2);     /* 畜牧熟练度 */
    },
    doFeed(a) {
      if (!F.Game.has('hay', 1)) { F.UI.toast('需要牧草', 'bad'); return; }
      F.Game.take('hay', 1);
      F.Animals.feed(a);
      F.FX.text(a.x, a.y + 1.8, a.z, '吃饱啦 +45', '#b8e890');
      F.FX.burst(a.x, a.y + 1.0, a.z, 0xd0ba72, 8, 0.5);
      F.Audio2.pick();
    },

    /* -------------------- 设施 -------------------- */
    doWell() {
      F.Game.can = 10;
      F.UI.toast('水壶已装满（10/10）', 'ok');
      F.FX.burst(F.Player.pos.x, F.Player.pos.y + 1.2, F.Player.pos.z, 0x6fc8e0, 10, 0.5);
      F.Audio2.water();
    },
    doMill() {
      if (!F.Game.has('wheat', 3)) { F.UI.toast('需要小麦 ×3', 'bad'); F.Audio2.bad(); return; }
      F.Game.take('wheat', 3); F.Game.give('flour', 1);
      F.UI.toast('磨得面粉 ×1', 'ok'); F.Audio2.ok();
    },
    doRest() {
      F.Player.energy = 100;
      F.Player.hunger = clamp(F.Player.hunger - 4, 0, 100);
      F.UI.toast('在篝火边休息，体力恢复', 'ok');
      F.Audio2.ok();
    },
    doCook() {
      const eatable = ['fish_crucian', 'fish_carp', 'fish_bass', 'fish_trout', 'fish_mandarin', 'fish_sturgeon', 'corn', 'mushroom', 'fish_shrimp'];
      for (const id of eatable) {
        if (F.Game.has(id, 1)) {
          F.Game.take(id, 1);
          F.Game.give('baked', 1);
          F.Game.addSkill('cook', 3);      /* 烹饪熟练度 */
          F.Game.addGuildXp(1);            /* 副职业制作 → 公会经验 +1 */
          F.UI.toast('烤制完成：烤物 ×1', 'ok');
          F.Audio2.ok();
          F.FX.burst(F.Player.pos.x, F.Player.pos.y + 1.0, F.Player.pos.z, 0xffa64d, 10, 0.6);
          return;
        }
      }
      F.UI.toast('没有可烤的食材（鱼 / 玉米 / 蘑菇）', 'bad');
    },
    doSleep() {
      F.Game.sleep();
    },
    doHomeDoor(b) {
      const HB = F.HomeBuild;
      if (HB && HB.isLocked(b)) {
        F.UI.toast('门锁已上锁，先按 [F] 解锁旁边的「门锁」', 'bad'); F.Audio2.bad(); return;
      }
      b.door = b.door ? 0 : 1;
      F.Audio2.pick();
    },
    doHomeLock(b) {
      b.locked = b.locked ? 0 : 1;
      if (b.locked) {
        /* 上锁顺手带上附近敞开的门 */
        for (const d of F.Builds.nearBuildings(b.x, b.z, 3)) {
          if (d.def && d.def.homeDoor) d.door = 0;
        }
      }
      F.UI.toast('门锁已' + (b.locked ? '上锁' : '解锁'), b.locked ? 'info' : 'ok');
      F.Audio2.pick();
    },
    doGate(b) { b.door = b.door ? 0 : 1; F.Audio2.pick(); },
    doHaystack(b, out) {
      if (!out) {
        if (!F.Game.has('hay', 10)) { F.UI.toast('需要牧草 ×10', 'bad'); return; }
        F.Game.take('hay', 10); b.stored = (b.stored || 0) + 10;
        F.UI.toast('存入牧草，共存 ' + b.stored, 'ok'); F.Audio2.ok();
      } else {
        if ((b.stored || 0) < 10) { F.UI.toast('草料堆里不足 10 牧草', 'bad'); return; }
        b.stored -= 10; F.Game.give('hay', 10);
        F.UI.toast('取出牧草 ×10', 'ok'); F.Audio2.ok();
      }
    },

    /* ============================ 钓鱼 ============================ */
    startFishing(spot) {
      if (!spot || I.fishing) return;
      if (spot.stock <= 0) { F.UI.toast('这里的鱼暂时被钓完了，稍后再来', 'bad'); return; }
      if (F.Player.tool !== 'rod') F.Player.setTool('rod');
      const P = F.Player;
      /* 落点：钓点前方水域 */
      let wx = spot.wx, wz = spot.wz;
      if (T.depthAt(wx, wz) < 0.8) {
        for (let r = 3; r < 16; r += 1.5) {
          for (let a = 0; a < 16; a++) {
            const ang = a * 0.3927;
            const tx = spot.x + Math.cos(ang) * r, tz = spot.z + Math.sin(ang) * r;
            if (T.depthAt(tx, tz) > 1.1) { wx = tx; wz = tz; a = 99; r = 99; }
          }
        }
      }
      I.fishing = { spot, phase: 'cast', t: 0, wx, wz, fx: P.pos.x, fz: P.pos.z, bite: 0, fish: null, hooked: null };
      I.bobber.visible = true;
      I.line.visible = true;
      F.UI.toast('抛竿！等待鱼讯…', 'info');
      F.Audio2.splash();
    },
    endFishing(success) {
      const f = I.fishing;
      if (!f) return;
      I.fishing = null;
      I.bobber.visible = false;
      I.line.visible = false;
      I.ripple.visible = false;
      if (f.hooked) { I.scene.remove(f.hooked.m); }
    },
    updateFishing(dt) {
      const f = I.fishing;
      if (!f) return;
      f.t += dt;
      const P = F.Player;

      /* 鱼线 */
      const tip = new THREE.Vector3();
      P.model.arms[1].getWorldPosition(tip);
      const pos = I.line.geometry.attributes.position;
      const bx = I.bobber.position.x, by = I.bobber.position.y, bz = I.bobber.position.z;
      for (let i = 0; i < 8; i++) {
        const k = i / 7;
        const sag = Math.sin(k * Math.PI) * 0.35;
        pos.setXYZ(i, lerp(tip.x, bx, k), lerp(tip.y, by, k) - sag, lerp(tip.z, bz, k));
      }
      pos.needsUpdate = true;

      if (f.phase === 'cast') {
        const k = clamp(f.t / 0.85, 0, 1);
        const x = lerp(f.fx, f.wx, k), z = lerp(f.fz, f.wz, k);
        const arc = Math.sin(k * Math.PI) * 2.2;
        I.bobber.position.set(x, T.WATER + 0.08 + arc, z);
        if (k >= 1) {
          f.phase = 'wait'; f.t = 0;
          f.wait = F.rnd(2.2, 8.5) * (F.Weather ? F.Weather.m('fishWait', 1) : 1);   /* 天气影响咬钩快慢 */
          I.ripple.position.set(x, T.WATER + 0.03, z);
        }
      } else if (f.phase === 'wait') {
        const bx2 = f.wx, bz2 = f.wz;
        const bob = Math.sin(f.t * 1.6) * 0.05;
        I.bobber.position.set(bx2, T.WATER + 0.08 + bob, bz2);
        I.ripple.visible = true;
        I.ripple.scale.setScalar(0.6 + Math.sin(f.t * 1.2) * 0.08);
        I.ripple.material.opacity = 0.28;
        if (f.t > f.wait) {
          f.phase = 'bite'; f.t = 0;
          f.fish = F.Fish.rollFish(f.spot);
          F.Audio2.blip(520, 0.12, 'sine', 0.09);
          F.UI.toast('有鱼讯！按 [F] 提竿！', 'ok');
        }
      } else if (f.phase === 'bite') {
        const dip = Math.sin(clamp(f.t / 1.7, 0, 1) * Math.PI * 3) * 0.22;
        I.bobber.position.set(f.wx, T.WATER + 0.08 - Math.abs(dip), f.wz);
        I.ripple.scale.setScalar(0.7 + Math.sin(f.t * 9) * 0.16);
        I.ripple.material.opacity = 0.55;
        if (f.t > 1.7) {
          F.UI.toast('鱼跑了…再等等', 'bad');
          f.phase = 'wait'; f.t = 0; f.wait = F.rnd(2.5, 7) * (F.Weather ? F.Weather.m('fishWait', 1) : 1);
        }
      } else if (f.phase === 'reel') {
        /* 上钩的鱼飞向玩家 */
        const k = clamp(f.t / 0.75, 0, 1);
        const m = f.hooked.m;
        m.position.set(
          lerp(f.wx, P.pos.x + Math.sin(P.rot) * 1.0, k),
          lerp(T.WATER, P.pos.y + 1.0, k) + Math.sin(k * Math.PI) * 2.0,
          lerp(f.wz, P.pos.z + Math.cos(P.rot) * 1.0, k)
        );
        m.rotation.z += dt * 8;
        if (k >= 1) {
          const sp = f.hooked.sp;
          F.Game.give('fish_' + sp.id, 1);
          F.FX.text(P.pos.x, P.pos.y + 2.0, P.pos.z, '钓到 ' + sp.name + '！', '#9fe8ff');
          F.UI.toast('收获 ' + sp.name + ' ×1', 'ok');
          F.Audio2.ok();
          F.Game.stats.fish++;
          F.Game.addGuildXp(1);        /* 钓鱼 → 公会经验 +1 */
          F.Game.addSkill('fish', 4);
          F.Game.addTool('rod', 1);
          I.scene.remove(m);
          f.hooked = null;
          f.spot.stock = Math.max(0, f.spot.stock - 1);
          /* 继续钓 */
          if (f.spot.stock > 0) { f.phase = 'wait'; f.t = 0; f.wait = F.rnd(2.2, 8.0) * (F.Weather ? F.Weather.m('fishWait', 1) : 1); }
          else { F.UI.toast('这里的鱼被钓完了，鱼群正在恢复', 'info'); I.endFishing(false); }
        }
      }

      /* 走远自动收竿 */
      if (F.dist2(P.pos.x, P.pos.z, f.spot.x, f.spot.z) > 90) I.endFishing(false);
    },
    reelIn() {
      const f = I.fishing;
      if (!f) return;
      if (f.phase === 'bite') {
        const sp = f.fish;
        const m = new THREE.Mesh(F.Fish.geoOf(sp.id), F.MATS.std);
        m.scale.setScalar(sp.size);
        m.position.set(f.wx, T.WATER, f.wz);
        I.scene.add(m);
        f.hooked = { m, sp };
        f.phase = 'reel'; f.t = 0;
        F.Player.reelT = 0.5;
        F.Audio2.splash();
      } else if (f.phase === 'wait') {
        I.endFishing(false);
        F.Player.reelT = 0.5;
        F.UI.toast('收竿了', 'info');
      }
    },

    /* ============================ 建造 ============================ */
    startBuild(id, free) {
      if (F.House && F.House.inside) { F.UI.toast('在房间里不能建造', 'bad'); return; }
      I.cancelBuild(true);
      const def = F.PROPS.BUILDS[id];
      if (!def) return;
      const g = F.PROPS.makeBuild(id);
      g.traverse(o => { if (o.isMesh) { o.material = I.ghostMat; o.castShadow = false; o.receiveShadow = false; } });
      I.scene.add(g);
      I.build = { id, def, ghost: g, rot: 0, free: !!free, x: 0, z: 0, y: 0, ok: false };
      I.removeMode = false; I.moveMode = false;
      F.Player.setTool('hammer');
      F.UI.toast('建造模式：' + def.name + '（[R] 旋转 · [Shift] 连续摆放 · [Esc] 取消）', 'info');
    },
    cancelBuild(silent) {
      if (I.ghost) { I.scene.remove(I.ghost); I.ghost = null; }
      if (I.build && I.build.ghost) I.scene.remove(I.build.ghost);
      I.build = null;
      if (!silent) F.UI.toast('已退出建造模式', 'info');
    },
    updateBuild(dt) {
      const b = I.build;
      const p = I.pickGround(F.Input.mx, F.Input.my);
      if (!p) return;
      const snap = b.def.snap || 2;
      let x = Math.round(p.x / snap) * snap, z = Math.round(p.z / snap) * snap;
      b.x = x; b.z = z;
      const chk = F.Builds.canPlace(b.def, x, z, b.rot);
      const costOK = b.free || F.Game.canAfford(b.def.cost);
      b.ok = chk.ok && costOK;
      b.why = chk.ok ? (costOK ? '' : '材料不足') : chk.why;
      const y = F.Builds.groundY(b.def, x, z, b.rot);
      b.ghost.position.set(x, y, z);
      b.ghost.rotation.y = b.rot;
      I.ghostMat.color.setHex(b.ok ? 0x7fe08a : 0xe86a5a);
      I.ghostMat.opacity = 0.5 + Math.sin(performance.now() * 0.004) * 0.06;
      F.UI.setPrompt(b.ok ? `[点击] 放置 ${b.def.name}${b.free ? '（移动）' : ' · ' + F.Game.costText(b.def.cost)}  ·  [R] 旋转` : '✖ ' + b.why);

      /* Shift 拖动：连续 / 成排摆放（奔跑键同款，可自定义） */
      if (F.Input.key(F.bind('run')) && F.Input.down) {
        I.placeT -= dt;
        const moved = !I.lastPlace || Math.hypot(x - I.lastPlace.x, z - I.lastPlace.z) >= snap * 0.9;
        if (moved && I.placeT <= 0) { I.tryPlace(true); I.placeT = 0.1; }
      } else I.placeT = 0;

      /* R 旋转（仅建造时生效，与投掷纳球不冲突，固定不改） */
      if (F.Input.keys['r'] && !I._rDown) { I._rDown = true; b.rot = (b.rot + Math.PI / 2) % (Math.PI * 2); }
      if (!F.Input.keys['r']) I._rDown = false;
    },
    tryPlace(chain) {
      const b = I.build;
      if (!b) return;
      if (!b.ok) { F.UI.toast(b.why || '这里不能建造', 'bad'); F.Audio2.bad(); return; }
      if (!b.free && !F.Game.spend(b.def.cost)) { F.UI.toast('材料不足', 'bad'); F.Audio2.bad(); return; }
      const nb = F.Builds.add(b.id, b.x, b.z, b.rot, b.free);
      F.Audio2.build();
      F.FX.burst(b.x, b.y + 0.4, b.z, 0xd8c8a0, 12, 0.7);
      F.Game.stats.build++;
      F.Game.addTool('hammer', 1);
      I.lastPlace = { x: b.x, z: b.z };
      if (b.free) { I.cancelBuild(true); F.UI.toast('已移动 ' + b.def.name, 'ok'); return; }
      if (!chain && !F.Input.key(F.bind('run'))) {
        /* 连续建造模式：保留 */
        if (!F.UI.keepBuild) I.cancelBuild(true);
      }
    },

    enterRemove() { if (F.House && F.House.inside) { F.UI.toast('在房间里不能拆除', 'bad'); return; } I.removeMode = true; I.moveMode = false; I.cancelBuild(true); F.UI.toast('拆除模式：点击建筑拆除（返还 50% 材料，[Shift] 拖动批量）', 'info'); },
    enterMove() { if (F.House && F.House.inside) { F.UI.toast('在房间里不能移动建筑', 'bad'); return; } I.moveMode = true; I.removeMode = false; I.cancelBuild(true); F.UI.toast('移动模式：点击建筑拎起，再选新位置放下', 'info'); },
    exitAll() { I.removeMode = false; I.moveMode = false; I.cancelBuild(true); },

    updateRemove(dt) {
      const p = I.pickGround(F.Input.mx, F.Input.my);
      if (!p) return;
      const near = F.Builds.nearBuildings(p.x, p.z, 6);
      let best = null, bd = 1e9;
      for (const b of near) {
        const dx = p.x - b.x, dz = p.z - b.z;
        const [lx, lz] = F.Builds.toLocal(b, p.x, p.z);
        if (Math.abs(lx) < b.hw + 0.6 && Math.abs(lz) < b.hd + 0.6) {
          const d = Math.hypot(dx, dz);
          if (d < bd) { bd = d; best = b; }
        }
      }
      I.removeTarget = best;
      /* 拆除 / 移动模式是玩家主动进入的操作态，此时才允许显示反馈（同上：≤1px 细线 + 低饱和） */
      if (best) {
        I.ring.position.set(best.x, best.y + 0.06, best.z);
        I.ring.scale.setScalar(Math.max(best.hw, best.hd) * 1.3);
        I.ring.material.color.setHex(I.moveMode ? RING_C.move : RING_C.remove);
        I.ringT = RING_C.active;
        F.UI.setPrompt((I.moveMode ? '[点击] 移动 ' : '[点击] 拆除 ') + best.def.name + '（返还 50% 材料）');
      } else {
        I.ringT = 0;
        F.UI.setPrompt(I.moveMode ? '移动模式：点击建筑' : '拆除模式：点击建筑（[Esc] 退出）');
      }
      if (F.Input.key(F.bind('run')) && F.Input.down && best) I.tryRemove();
    },
    tryRemove() {
      const b = I.removeTarget;
      if (!b) return;
      for (const k in b.def.cost) {
        const back = Math.max(1, Math.floor(b.def.cost[k] * 0.5));
        if (k === 'coins') F.Game.addCoins(back);          /* 家园构件的手续费按金币返还 */
        else F.Game.give(k, back);
      }
      F.FX.burst(b.x, b.y + 0.6, b.z, 0xb08f62, 14, 0.8);
      F.Audio2.build();
      F.Builds.remove(b);
      F.UI.toast('拆除 ' + b.def.name + '，返还部分材料', 'ok');
      I.removeTarget = null;
    },
    tryMove() {
      const b = I.removeTarget;
      if (!b) return;
      const id = b.id, rot = b.rot;
      F.Builds.remove(b);
      I.removeTarget = null;
      I.startBuild(id, true);
      I.build.rot = rot;
    },

    rotate() {
      if (I.build) I.build.rot = (I.build.rot + Math.PI / 2) % (Math.PI * 2);
    },
  });

})();
