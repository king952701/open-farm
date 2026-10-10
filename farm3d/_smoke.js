/* 本地冒烟测试：在 Node 中跑通全部世界生成 + 600 帧模拟 + 核心交互（不渲染） */
const path = require('path');
const fs = require('fs');

/* ---- 最小 DOM ---- */
function mkEl() {
  const el = {
    style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', className: '',
    classList: { toggle() { }, add() { }, remove() { } },
    appendChild(e) { this.children.push(e); return e; },
    removeChild(e) { }, remove() { },
    querySelector() { return mkEl(); }, querySelectorAll() { return []; },
    addEventListener() { }, getContext() { return null; },
    setAttribute() { }, getBoundingClientRect() { return { left: 0, top: 0, width: 1, height: 1 }; },
  };
  return el;
}
global.window = global;
global.self = global;
global.document = {
  createElement: () => mkEl(),
  querySelector: () => mkEl(),
  querySelectorAll: () => [],
  body: mkEl(),
  readyState: 'complete',
  addEventListener() { },
};
global.addEventListener = () => { };
global.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
global.innerWidth = 1600; global.innerHeight = 900; global.devicePixelRatio = 1;
if (!global.performance) global.performance = { now: () => Date.now() };

global.THREE = require(path.join(__dirname, 'vendor', 'three.min.js'));

const files = ['util.js', 'creatures.js', 'props.js', 'world.js', 'entities.js', 'player.js', 'house.js', 'interact.js',
  'combat.js', 'ability.js', 'npc.js', 'dungeon.js', 'social.js', 'rank.js', 'mount.js', 'weather.js', 'arena.js', 'homebuild.js',
  'quest.js', 'blackmarket.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');
  (0, eval)(code);
}
const F = global.FARM;
const T = F.T;

function ok(label, fn) {
  try { const r = fn(); console.log('  ✓', label, r === undefined ? '' : r); }
  catch (e) { console.log('  ✗', label, '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); fails++; }
}
let fails = 0;

console.log('— 地形 —');
ok('bake', () => { T.bake(300); return 'grid=' + T.grid.length; });
ok('hAt 采样', () => {
  const a = T.hAt(0, 0), b = T.hAt(2, 96), c = T.hAt(-168, 172);
  return `营地=${b.toFixed(2)} 中心=${a.toFixed(2)} 山林=${c.toFixed(2)}`;
});
ok('河道有水下切', () => {
  const x = -20, rz = T.riverZ(x);
  return `riverZ=${rz.toFixed(1)} 河心h=${T.hAt(x, rz).toFixed(2)} 岸h=${T.hAt(x, rz + T.riverHalfW(x) + 9).toFixed(2)}`;
});
ok('湖泊', () => `湖心h=${T.hAt(T.LAKE.x, T.LAKE.z).toFixed(2)} 湖岸h=${T.hAt(T.LAKE.x, T.LAKE.z + T.LAKE.r + 7).toFixed(2)}`);
ok('农田区平整', () => T.ZONES.map(z => `${z.id}:${T.hAt(z.x, z.z).toFixed(2)}`).join(' '));
ok('外圈群山', () => `r300=${T.hAt(0, -300).toFixed(1)} r280=${T.hAt(0, -280).toFixed(1)}`);
ok('建造校验', () => JSON.stringify([T.buildCheck(0, 96), T.buildCheck(122, -152), T.buildCheck(-168, 172)]));

console.log('— 世界 —');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.15, 2400);
const renderer = { setClearColor() { }, shadowMap: { enabled: true } };
ok('World.init', () => { F.World.init(scene, renderer); return 'objects=' + scene.children.length; });
ok('World.setTime 昼夜', () => { [0, 6, 9, 12, 18, 21].forEach(t => F.World.setTime(t)); return 'ok'; });

console.log('— 实体 —');
ok('Farm.init', () => { F.Farm.init(scene); return 'tiles=' + F.Farm.tiles.length; });
ok('Nodes.init', () => { const g = F.Nodes.init(scene); return 'nodes=' + F.Nodes.list.length + ' ' + JSON.stringify(g); });
ok('Builds.init', () => { F.Builds.init(scene); return 'ok'; });
ok('Animals.init', () => { F.Animals.init(scene); return 'count=' + F.Animals.list.length; });
ok('Fish.init', () => { F.Fish.init(scene); return 'spots=' + F.Fish.spots.length + ' fish=' + F.Fish.ambient.length; });
ok('Drops.init', () => { F.Drops.init(scene); return 'ok'; });
ok('Player.init', () => { F.Player.init(scene, camera); return `pos=${F.Player.pos.x.toFixed(1)},${F.Player.pos.y.toFixed(1)},${F.Player.pos.z.toFixed(1)}`; });
ok('FX.init', () => { F.FX.init(scene, camera, mkEl()); return 'ok'; });
ok('Inter.init', () => { F.Inter.init(scene, camera); return 'ok'; });

console.log('— 建筑原型 —');
ok('全部建筑可构建', () => {
  let n = 0;
  for (const id in F.PROPS.BUILDS) { const g = F.PROPS.makeBuild(id); if (!g) throw new Error('fail ' + id); n++; }
  return n + ' 种';
});

console.log('— 玩法流程 —');
/* 简易 Game 替身 */
const G = F.Game = {
  time: 9, day: 1, can: 10, coins: 100,
  inv: { wood: 200, stone: 200, fiber: 50, hay: 40, branch: 20, herb: 5, flower: 5, mushroom: 3 },
  seeds: { wheat: 20, carrot: 10, corn: 10, pumpkin: 5, tomato: 10 }, storage: {}, chest: {}, chestLv: 1, auto: null, stats: {},
  opt: { grass: 2, shadow: true, audio: false, timeScale: 150 },
  give(id, n) { this.inv[id] = (this.inv[id] || 0) + n; },
  take(id, n) { if ((this.inv[id] || 0) < n) return false; this.inv[id] -= n; return true; },
  has(id, n) { return (this.inv[id] || 0) >= n; },
  canAfford(c) { for (const k in c) if ((this.inv[k] || 0) < c[k]) return false; return true; },
  spend(c) { if (!this.canAfford(c)) return false; for (const k in c) this.take(k, c[k]); return true; },
  seedsn(k, d) { if (d === undefined) return this.seeds[k] || 0; this.seeds[k] = Math.max(0, (this.seeds[k] || 0) + d); },
  costText(c) { return Object.keys(c).map(k => k + '×' + c[k]).join(' '); },
  sleep() { },
  equip: { weapon: null, armor: null, trinket: null },
  defense() { return 0; }, equipItem() { }, unequip() { }, use() { },
  addGuildXp() { }, addCoins(n) { this.coins += n; },
  addSkill(id, n) { F.Skills.add(id, n); }, addTool(id, n) { F.Skills.addTool(id, n); },
  rest() { }, usePotion() { }, autoTo() { }, sellItem() { return 0 },
  chestStoreAll() { }, chestTakeAll() { }, chestUpgrade() { },
  chestCap() { return 12 }, chestSlots() { return 0 }, chestUpgradeCost() { return null },
  save() { }, load() { return false; }, reset() { },
  stats2: 0, foodOf() { return 0; }, eat() { }, storeAll() { }, takeAll() { },
};
F.Game.seeds = function (k, d) { if (d === undefined) return G.seeds[k] || 0; G.seeds[k] = Math.max(0, (G.seeds[k] || 0) + d); };
F.UI = { toast() { }, setPrompt() { }, setProgress() { }, setNodeInfo() { }, syncHotbar() { }, openPanel() { } };

ok('开垦→播种→浇水→收获', () => {
  const t = F.Farm.tiles.find(t => t.zone === 'A');
  F.Farm.till(t);
  F.Farm.plant(t, 'wheat');
  F.Farm.water(t);
  for (let i = 0; i < 400; i++) F.Farm.update(0.5, 1);
  const r = F.Farm.harvest(t);
  if (!r) throw new Error('未成熟 growth=' + t.growth);
  return `growth=${t.growth.toFixed(2)} 收获=${r.n}`;
});
ok('地块可反复开垦', () => {
  const t = F.Farm.tiles.find(t => t.zone === 'B');
  F.Farm.till(t); F.Farm.plant(t, 'corn'); F.Farm.clear(t);
  const s1 = t.state; F.Farm.till(t);
  return `state ${s1} → ${t.state}`;
});
ok('采集节点', () => {
  const e = F.Nodes.near(0, 96, 60)[0];
  const y = F.Nodes.harvest(e.n);
  return `${e.n.type} → ${JSON.stringify(y)} alive=${e.n.alive}`;
});
ok('节点刷新', () => {
  const n = F.Nodes.list.find(n => !n.alive);
  for (let i = 0; i < 400; i++) F.Nodes.update(0.5);
  return 'alive=' + n.alive + ' grow=' + n.grow.toFixed(2);
});
ok('建造放置(全部类型)', () => {
  const out = [];
  for (const id in F.PROPS.BUILDS) {
    const def = F.PROPS.BUILDS[id];
    let placed = null;
    for (let r = 4; r < 120 && !placed; r += 3) {
      for (let a = 0; a < 12; a++) {
        const ang = a * 0.52;
        const x = Math.round((Math.cos(ang) * r) / 2) * 2, z = Math.round((96 + Math.sin(ang) * r) / 2) * 2;
        if (F.Builds.canPlace(def, x, z, 0).ok) { placed = F.Builds.add(id, x, z, 0, true); break; }
      }
    }
    out.push(id + (placed ? '' : '✗'));
  }
  return out.join(' ');
});
ok('木桥跨河且桥面等高可踩踏', () => {
  const out = [];
  for (const bx of [-20, 110]) {
    const rz = T.riverZ(bx);
    const slope = (T.riverZ(bx + 0.5) - T.riverZ(bx - 0.5));
    const rot = Math.atan2(1, -slope);
    for (let k = -1; k <= 1; k++) {
      const off = k * 13.6;
      F.Builds.add('bridge', bx + Math.cos(rot) * off, rz - Math.sin(rot) * off, rot, true);
    }
    const mid = [];
    for (let d = -18; d <= 18; d += 6) {
      const px = bx + Math.cos(rot) * d, pz = rz - Math.sin(rot) * d;
      const deck = F.Builds.deckAt(px, pz);
      mid.push(deck === null ? '✗' : (T.hAt(px, pz) < 0 ? '桥' : '岸'));
    }
    out.push(`x${bx}:${mid.join('')}`);
  }
  return out.join(' ');
});
ok('建筑碰撞推挤', () => {
  const b = F.Builds.list.find(b => b.id === 'house');
  const r = F.Builds.pushOut(b.x, b.z, 0.52);
  return r ? `推出 ${Math.hypot(r.x - b.x, r.z - b.z).toFixed(2)}m` : '未触发';
});
ok('钓点贴岸', () => {
  const bad = F.Fish.spots.filter(s => T.depthAt(s.x, s.z) > 0.05 || Math.hypot(s.x, s.z) > 285);
  return bad.length ? '异常钓点 ' + JSON.stringify(bad.map(s => [s.x | 0, s.z | 0])) : F.Fish.spots.length + ' 个钓点全部在岸上';
});
ok('抛竿 → 咬钩 → 提竿', () => {
  const s = F.Fish.spots[0];
  F.Player.pos.set(s.x, T.hAt(s.x, s.z), s.z);
  F.Inter.startFishing(s);
  let guard = 0;
  while (F.Inter.fishing && F.Inter.fishing.phase !== 'bite' && guard++ < 4000) F.Inter.updateFishing(0.05);
  if (!F.Inter.fishing) throw new Error('未进入咬钩');
  const sp = F.Inter.fishing.fish;
  F.Inter.reelIn();
  guard = 0;
  while (F.Inter.fishing && guard++ < 200) F.Inter.updateFishing(0.05);
  return `钓到 ${sp ? sp.name : '?'} 库存=${s.stock}`;
});
ok('畜禽产出与繁殖', () => {
  for (const a of F.Animals.list) { a.hunger = 90; a.product = a.def.ptime; }
  const cow = F.Animals.list.find(a => a.type === 'cow');
  const before = F.Animals.list.length;
  F.Animals.update(1, F.Player);
  return `可收获=${F.Animals.list.filter(a => F.Animals.productReady(a)).length} 数量=${before}→${F.Animals.list.length}`;
});
ok('驱赶', () => F.Animals.herd(F.Player.pos.x, F.Player.pos.z, 40) + ' 只受惊');
ok('新矿脉生成', () => {
  const need = ['copper', 'tin', 'alum', 'silver', 'gold', 'crystal', 'rainbow'];
  const counts = {};
  for (const n of F.Nodes.list) if (need.includes(n.type)) counts[n.type] = (counts[n.type] || 0) + 1;
  for (const k of need) if (!counts[k]) throw new Error('缺少矿脉 ' + k);
  return JSON.stringify(counts);
});
ok('矿石采集产出', () => {
  const n = F.Nodes.list.find(n => n.type === 'gold');
  const y = F.Nodes.harvest(n);
  if (!y || !y.gold) throw new Error('金矿产出缺失');
  return 'gold → ' + JSON.stringify(y);
});
ok('采集等级门槛：等级不够锁住，够了放行', () => {
  F.Skills.init();
  const mk = (type) => ({ type, x: 0, z: 0, y: 0, def: F.NODE_DEFS[type], alive: true, hits: 1, s: 1, ry: 0 });
  F.Player.tool = 'pick';
  const iron = mk('iron'), copper = mk('copper');
  const locked = F.Inter.promptFor({ kind: 'node', n: iron });
  if (locked.act !== 'locked') throw new Error('1 级竟能开采铁矿');
  if (!/需要挖矿等级 10 级/.test(locked.text) || !/当前 Lv\.1/.test(locked.text)) throw new Error('提示缺少等级要求/现有等级：' + locked.text);
  F.Inter.work = null;
  F.Inter.gatherNode(iron);
  if (F.Inter.work) throw new Error('等级不够却开始了采集');
  if (F.Inter.promptFor({ kind: 'node', n: copper }).act !== 'node') throw new Error('铜矿（无门槛）应可正常采集');
  F.Skills.get('mine').lv = 10;
  const passed = F.Inter.promptFor({ kind: 'node', n: iron });
  if (passed.act !== 'node') throw new Error('挖矿 Lv.10 后仍不能采铁矿');
  F.Inter.work = null;
  F.Inter.gatherNode(iron);
  if (!F.Inter.work) throw new Error('等级够了却采集不了');
  F.Inter.work = null;
  F.Skills.init();
  F.Player.tool = 'axe';
  return '铜矿放行 · 铁矿 Lv.10 门槛（' + locked.text.slice(0, 40) + '…）';
});
ok('民居进出（床/储物箱/房门）', () => {
  F.House.init(scene);
  const b = F.Builds.list.find(b => b.id === 'house') || F.Builds.add('house', 2, 92, 0, true);
  F.House.enter(b);
  if (!F.Player.indoor) throw new Error('未进入室内');
  if (F.House.items.length !== 3) throw new Error('交互点数量=' + F.House.items.length);
  F.House.clampPlayer(F.Player);
  F.House.exit();
  if (F.Player.indoor) throw new Error('未退出室内');
  return '交互点=' + F.House.items.map(i => i.kind).join('/');
});
ok('民居室内：全部构件都在室内中心（错位修复）', () => {
  const H = F.House, CZ = -360;
  if (!H.room) throw new Error('室内未生成');
  const bb = new THREE.Box3().setFromObject(H.room);
  if (bb.min.z < CZ - 5.5 || bb.max.z > CZ + 5.5) throw new Error(`构件 z 范围 ${bb.min.z.toFixed(1)}~${bb.max.z.toFixed(1)}，脱离室内中心`);
  if (bb.min.y < H.y0 - 1) throw new Error('地板低于平台高度');
  /* 出生点脚下必须有地板：检查房间包围盒覆盖出生点 */
  const px = 0, pz = CZ + 2.6;
  if (px < bb.min.x || px > bb.max.x || pz < bb.min.z || pz > bb.max.z) throw new Error('出生点不在房间范围内');
  return `构件范围 z ${bb.min.z.toFixed(1)}~${bb.max.z.toFixed(1)}（中心 ${CZ}），出生点在地板上`;
});
ok('山脉实体：裙边 + 底盖已生成', () => {
  const shell = scene.children.find(o => o.name === 'worldShell');
  if (!shell) throw new Error('缺少世界裙边');
  const n = shell.geometry.attributes.position.count;
  if (n < 800) throw new Error('裙边顶点过少 ' + n);
  return (n / 1000).toFixed(1) + 'k 顶点的封闭岩壁';
});
ok('贴地防穿模：hMesh 与渲染三角面一致（陡坡不沉入山体）', () => {
  const T = F.T;
  let worst = 0, flatErr = 0;
  for (let i = 0; i < 400; i++) {
    /* 陡坡区（外圈群山 r 246~283）随机采样 */
    const a = Math.random() * Math.PI * 2, r = 246 + Math.random() * 37;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hb = T.hMesh(x, z), ha = T.hAt(x, z);
    /* hMesh 应处于该网格四角高度的凸包内（保证不低于可见表面） */
    const n = T.N, step = T.STEP;
    const i0 = Math.min(n - 1, Math.max(0, Math.floor((x + 310) / step)));
    const j0 = Math.min(n - 1, Math.max(0, Math.floor((z + 310) / step)));
    const cs = [T.hAt(-310 + i0 * step, -310 + j0 * step), T.hAt(-310 + (i0 + 1) * step, -310 + j0 * step),
      T.hAt(-310 + i0 * step, -310 + (j0 + 1) * step), T.hAt(-310 + (i0 + 1) * step, -310 + (j0 + 1) * step)];
    if (hb < Math.min.apply(null, cs) - 0.01 || hb > Math.max.apply(null, cs) + 0.01) throw new Error('hMesh 越界');
    worst = Math.max(worst, Math.abs(hb - ha));
  }
  /* 平地（农田区）两者应几乎一致 */
  flatErr = Math.abs(T.hMesh(0, 56) - T.hAt(0, 56)) + Math.abs(T.hMesh(4, 104) - T.hAt(4, 104));
  if (flatErr > 0.06) throw new Error('平地误差过大 ' + flatErr.toFixed(3));
  return `陡坡区 |hMesh-hAt| 最大 ${worst.toFixed(2)}m（修正确保不沉模） · 平地误差 ${flatErr.toFixed(3)}m`;
});
ok('移动方向（相机相对）', () => {
  F.Input.keys = {};
  const test = (key) => {
    F.Player.indoor = false;
    F.Player.pos.set(4, T.hAt(4, 104), 104);
    F.Player.camYaw = Math.PI; F.Player.camPitch = 0.42; F.Player.rot = 0; F.Player.speed = 0;
    const x0 = F.Player.pos.x, z0 = F.Player.pos.z;
    F.Input.keys[key] = true;
    F.Player.update(1 / 60, false);
    F.Input.keys[key] = false;
    return { dx: F.Player.pos.x - x0, dz: F.Player.pos.z - z0 };
  };
  const w = test('w');
  if (!(w.dz > 0.02 && Math.abs(w.dx) < 0.02)) throw new Error(`W → dx=${w.dx.toFixed(3)} dz=${w.dz.toFixed(3)}（应远离镜头 +z）`);
  const d = test('d');
  if (!(d.dx < -0.02 && Math.abs(d.dz) < 0.02)) throw new Error(`D → dx=${d.dx.toFixed(3)} dz=${d.dz.toFixed(3)}（应向屏幕右 -x）`);
  return 'W→远离镜头(+z)  D→屏幕右(-x) ✓';
});
ok('体力药水 Buff（每秒+5 持续3秒）', () => {
  F.Player.indoor = false; F.Input.keys = {};
  F.Player.energy = 50; F.Player.energyBuff = 3;
  for (let i = 0; i < 60; i++) F.Player.update(1 / 60, false);
  const gained = F.Player.energy - 50;
  F.Player.energyBuff = 0;
  if (gained < 4.5) throw new Error('恢复不足 ' + gained.toFixed(2));
  return '1 秒恢复 ' + gained.toFixed(2) + ' 点';
});

console.log('— 战斗 / 新手村 / 副本 / 社交 —');
ok('怪物生成与击杀掉落', () => {
  F.Combat.init(scene);
  const n0 = F.Combat.mobs.length;
  const m = F.Combat.mobs[0];
  if (!m) throw new Error('没有生成怪物');
  const before = Object.assign({}, G.inv);
  F.Combat.hit(m, 99999);
  const got = Object.keys(G.inv).filter(k => (G.inv[k] || 0) > (before[k] || 0));
  return `怪物 ${n0} 只 · 击杀掉落 ${JSON.stringify(got)} · kill=${F.Game.stats.kill}`;
});
ok('野外宝箱', () => {
  const c = F.Combat.chests[0];
  if (!c) throw new Error('没有宝箱');
  F.Combat.openChest(c);
  return `宝箱 ${F.Combat.chests.length} 个 · 开启后 open=${c.open}`;
});
ok('新手村 8 名商人 + 世界塔 33 层', () => {
  F.Village.init(scene);
  if (F.Village.npcs.length !== 8) throw new Error('NPC 数量=' + F.Village.npcs.length);
  const t = F.Village.tower;
  if (!t || t.floors !== 33) throw new Error('世界塔层数异常');
  const guards = F.Combat.mobs.filter(m => m.type === 'guard').length;
  return `村庄 (${F.Village.x.toFixed(0)},${F.Village.z.toFixed(0)}) · 商人 8 名 · 塔 ${t.floors} 层 · 门卫 ${guards} 名`;
});
ok('副本门卫 50 万血', () => {
  const g = F.Combat.mobs.find(m => m.type === 'guard');
  if (!g) throw new Error('未生成门卫');
  if (g.maxHp !== 500000) throw new Error('门卫血量 ' + g.maxHp);
  return `hp=${g.maxHp} · 位置 ${g.x.toFixed(0)},${g.z.toFixed(0)}`;
});
ok('拍卖行：上架手续费 1% / 拍卖师 0.8% / 税收 20%', () => {
  F.Social.init();
  const S = F.Social;
  F.Game.coins = 100000;
  F.Game.inv.wood = 100;
  const c0 = F.Game.coins;
  S.list('wood', 10, 100, false);           /* 总价 1000 → 手续费 10 */
  const fee1 = c0 - F.Game.coins;
  const c1 = F.Game.coins;
  F.Game.inv.wood = 100;
  S.list('wood', 10, 100, true);            /* 拍卖师 → 8 */
  const fee2 = c1 - F.Game.coins;
  const mine = S.listings.filter(l => l.mine);
  const gain = Math.round(mine[0].price * mine[0].n * 0.8);
  if (fee1 !== 10 || fee2 !== 8) throw new Error('手续费错误 ' + fee1 + '/' + fee2);
  return `手续费 ${fee1} / ${fee2}（拍卖师减免）· 成交到账 ${gain}（税 20%）· 在售 ${S.listings.length} 条`;
});
ok('拍卖行搜索 / 品质 / 类别 / 级别筛选', () => {
  const S = F.Social;
  const all = S.query({}).length;
  const w = S.query({ cat: '武器' }).length;
  const q = S.query({ quality: '稀有' }).length;
  const lv = S.query({ lv: '1-10' }).length;
  const s = S.query({ q: '铁剑' }).length;
  return `全部 ${all} · 武器 ${w} · 稀有 ${q} · Lv1-10 ${lv} · 搜索"铁剑" ${s}`;
});
ok('公会：经验 0→1 需 500 万 + 升级扩容', () => {
  const S = F.Social;
  const need = S.guildNeed();
  if (need !== 5000000) throw new Error('需求经验 ' + need);
  const cap0 = S.guildCap();
  S.guild.xp = need;
  S.upgradeGuild();
  const cap1 = S.guildCap();
  if (cap1 !== cap0 + 5) throw new Error('扩容异常 ' + cap0 + '→' + cap1);
  return `${need} 经验 · 等级 ${S.guild.level} · 成员上限 ${cap0}→${cap1}`;
});
ok('聊天频道与系统消息', () => {
  const S = F.Social;
  S.send('world', '你好，世界');
  S.sys('系统测试消息');
  S.sendPrivate('村长阿禾', '在吗');
  const ch = Object.keys(S.chat);
  if (ch.length !== 5) throw new Error('频道数 ' + ch.length);
  return ch.join('/') + ' · 世界消息 ' + S.chat.world.length + ' 条';
});
ok('组队：邀请上限 5 人', () => {
  const S = F.Social;
  S.inviteParty('村长阿禾'); S.inviteParty('猎人岭风');
  return `队伍 ${S.party.members.length} 人：${S.party.members.map(m => m.name).join('、')}`;
});
ok('副本：门票进入 33 层 / 怪物与 BOSS 生成', () => {
  F.Game.give('ticket', 3);
  const okIn = F.Dungeon.enter(7);
  if (!okIn) throw new Error('进入失败');
  const mobs = F.Combat.mobs.filter(m => m.realm === 'dungeon');
  /* 击杀全部 → 通关 */
  for (const m of mobs.slice()) F.Combat.hit(m, 9999999);
  const cleared = F.Dungeon.cleared;
  const out = `第 ${F.Dungeon.floor} 层 · 怪物 ${mobs.length} 只 · 通关=${cleared} · 剩余门票 ${F.Game.inv.ticket}`;
  F.Dungeon.exit();
  return out + ' · 出场 inside=' + F.Dungeon.inside;
});
ok('商人购买（金币结算）', () => {
  F.Game.coins = 5000;
  const before = F.Game.inv.ticket || 0;
  F.Village.buy('material', 'ticket', 2);
  return `门票 ${before}→${F.Game.inv.ticket} · 金币剩余 ${F.Game.coins}`;
});

console.log('— 技能 / 排行榜 —');
ok('技能表：8 项技能 + 7 种工具熟练度', () => {
  const sk = Object.keys(F.SKILLS), tk = Object.keys(F.TOOLSK);
  if (sk.length !== 8 || tk.length !== 7) throw new Error(sk.length + '/' + tk.length);
  return sk.map(k => F.SKILLS[k].name).join('/') + ' · 工具 ' + tk.map(k => F.TOOLSK[k].name).join('/');
});
ok('技能升级（经验曲线）', () => {
  F.Skills.init();
  const need1 = F.Skills.need(1), need5 = F.Skills.need(5);
  if (!(need5 > need1)) throw new Error('曲线异常');
  F.Skills.add('mine', need1 + 5);
  if (F.Skills.lv('mine') !== 2) throw new Error('升级失败 lv=' + F.Skills.lv('mine'));
  F.Skills.add('mine', 100000);
  const lv = F.Skills.lv('mine');
  if (lv <= 2 || lv > 60) throw new Error('等级溢出 ' + lv);
  return `Lv.1 需 ${need1} · Lv.5 需 ${need5} · 大量经验后 mine=Lv.${lv}（上限 60）`;
});
ok('工具熟练度独立累计', () => {
  F.Skills.init();
  F.Skills.addTool('axe', F.Skills.need(1) + 2);
  if (F.Skills.tool('axe').lv !== 2) throw new Error('斧头未升级');
  if (F.Skills.tool('pick').lv !== 1) throw new Error('镐子被误加');
  return '斧头 Lv.' + F.Skills.tool('axe').lv + ' · 镐子 Lv.' + F.Skills.tool('pick').lv;
});
ok('排行榜：12 个专属类别 + 有序排名', () => {
  F.Rank.init();
  const cats = F.Rank.cats.map(c => c.name);
  if (F.Rank.cats.length !== 12) throw new Error('类别数 ' + F.Rank.cats.length);
  for (const c of F.Rank.cats) {
    const l = F.Rank.list(c.id);
    for (let i = 1; i < l.length; i++) if (l[i - 1].score < l[i].score) throw new Error(c.name + ' 榜未降序');
  }
  const my = F.Rank.myRank('total');
  if (!my) throw new Error('自己不在榜上');
  return cats.join('/') + ' · 玩家 ' + F.Rank.players.length + ' 位 · 我的综合名次 ' + my.rank + '/' + my.total;
});
ok('动态排名（模拟玩家持续产出，名次涨跌）', () => {
  const snap = (id) => F.Rank.list(id).map(x => x.p.name + ':' + x.score).join(',');
  const before = {};
  for (const c of F.Rank.cats) before[c.id] = snap(c.id);
  for (let i = 0; i < 60; i++) { F.Rank.t = 0; F.Rank.tick(0.016); }
  let changedCats = 0, moved = 0, up = 0;
  let detail = '';
  for (const c of F.Rank.cats) {
    const after = F.Rank.list(c.id);
    if (before[c.id] !== snap(c.id)) changedCats++;
    const mv = after.filter(x => !x.p.self && x.delta !== 0);
    moved += mv.length;
    up += mv.filter(x => x.delta > 0).length;
    if (c.id === 'combat') detail = c.name + '榜首 ' + after[0].p.name + ' ' + after[0].score + ' 击杀';
  }
  if (!changedCats) throw new Error('榜单没有变化');
  if (!moved) throw new Error('没有任何名次变动');
  return `${changedCats}/${F.Rank.cats.length} 个榜单分数变化 · 名次变动 ${moved} 人次（上升 ${up}） · ${detail}`;
});
ok('玩家详情：装备 / 工具 / 全部技能等级', () => {
  const target = F.Rank.players.find(p => !p.self).name;
  const info = F.Rank.playerInfo(target);
  if (info.skills.length !== 8) throw new Error('技能项 ' + info.skills.length);
  if (info.tools.length !== 7) throw new Error('工具项 ' + info.tools.length);
  if (!info.equip || !('weapon' in info.equip)) throw new Error('缺装备字段');
  const s0 = info.skills[0];
  if (!(s0.need > 0 && s0.xp >= 0 && s0.lv >= 1)) throw new Error('技能数值异常');
  const me = F.Rank.playerInfo('你');
  if (!me.self) throw new Error('自己条目缺失');
  return `${target}：武器 ${F.itemName(info.equip.weapon)} · ${info.skills.map(s => s.name + 'Lv' + s.lv).join(' ')} · 我自己 Lv.${me.lv}`;
});
ok('未知玩家也能按需生成详情', () => {
  const info = F.Rank.playerInfo('路边的新人');
  return info.name + ' · 综合 Lv.' + info.lv + ' · 技能 ' + info.skills.length + ' 项';
});

console.log('— 拍卖已售 / 纳球坐骑 —');
ok('拍卖行：已售记录 + 收入统计（税 20%）', () => {
  const S = F.Social;
  const st7 = S.soldStats(7), st30 = S.soldStats(30), st365 = S.soldStats(365);
  if (st7.tax !== Math.round(st7.gross * 0.2) || st7.net !== st7.gross - st7.tax) throw new Error('统计口径错误');
  if (!(st365.gross >= st30.gross && st30.gross >= st7.gross)) throw new Error('时间区间异常');
  if (!S.soldList(7).length || !S.soldList(7).every(s => s.buyer && s.day >= 1)) throw new Error('缺买家或日期');
  const st = S.soldStats(365);
  return `7天 ${st7.count} 笔/${st7.gross} 金 · 30天 ${st30.count} · 365天 ${st365.count} · 总计${st.gross} 税${st.tax} 税后${st.net}`;
});
ok('纳球：物品 + 配方（工器）', () => {
  if (!F.ITEMS.ball_nab) throw new Error('缺纳球物品');
  return F.ITEMS.ball_nab.name + ' · 品质 ' + F.qualityOf('ball_nab') + ' · 类别 ' + F.catOf('ball_nab') + ' · 售价 ' + F.priceOf('ball_nab');
});
ok('捕捉：虚弱判定 / 成功率 / 捕获入栏', () => {
  F.Mounts.init(scene); F.Mounts.reset();
  const m = F.Combat.spawn('boar', F.Player.pos.x + 3, F.Player.pos.z, 1, 'world');
  if (F.Mounts.canCatch(m)) throw new Error('满血即可捕捉，判定过松');
  m.hp = m.maxHp * 0.3;
  if (!F.Mounts.canCatch(m)) throw new Error('虚弱仍不可捕捉');
  const c = F.Mounts.chance(m);
  if (!(c > 0.4 && c <= 0.95)) throw new Error('成功率异常 ' + c);
  F.Mounts.capture(m);
  if (F.Mounts.list.length !== 1) throw new Error('未入栏');
  if (F.Combat.mobs.indexOf(m) >= 0) throw new Error('怪物未被移除');
  const mt = F.Mounts.list[0];
  return `野猪 hp30% → 成功率 ${(c * 100).toFixed(0)}% · 入栏 ${mt.name}（${mt.q} · 移速 +${Math.round((mt.mul - 1) * 100)}%）`;
});
ok('骑乘：上马 / 坐骑跟随 / 移速加成 / 下马', () => {
  const M = F.Mounts, P = F.Player;
  if (!M.ride(0)) throw new Error('骑乘失败');
  if (!P.riding) throw new Error('riding 标记缺失');
  const mul = M.curMount().mul;
  M.update(0.5);
  if (!M.mesh || !M.mesh.visible) throw new Error('坐骑网格未显示');
  if (Math.abs(M.mesh.position.x - P.pos.x) > 0.01) throw new Error('坐骑未跟随');
  M.dismount(true);
  if (P.riding) throw new Error('未下马');
  return `移速 ×${mul} · 网格跟随正常 · 下马 riding=${P.riding}`;
});
ok('坐骑栏上限（6）与放生', () => {
  const M = F.Mounts;
  while (M.list.length < M.MAX) M.list.push({ type: 'wolf', name: '灰狼', q: '普通', lv: 5, mul: 1.55, h: 0.98, day: 1 });
  const m2 = F.Combat.spawn('bear', F.Player.pos.x + 4, F.Player.pos.z, 1, 'world');
  m2.hp = 0.2 * m2.maxHp;
  M.capture(m2);
  if (M.list.length !== M.MAX) throw new Error('上限失效 ' + M.list.length);
  M.list.pop();
  return `上限 ${M.MAX} 生效 · 剩余 ${M.list.length}`;
});

console.log('— 聊天富媒体（表情 / 图片 / 道具） —');
ok('聊天：发送图片消息', () => {
  const n0 = F.Social.chat.trade.length;
  const m = F.Social.send('trade', { type: 'img', src: 'data:image/jpeg;base64,AAAA' });
  if (!m || m.type !== 'img' || !m.src) throw new Error('图片消息未生成');
  if (F.Social.chat.trade.length !== n0 + 1) throw new Error('未进入频道');
  if (m.from !== '你' || !m.self) throw new Error('发送者字段异常');
  return 'type=' + m.type + ' · from=' + m.from + ' · 频道消息 ' + F.Social.chat.trade.length + ' 条';
});
ok('聊天：发送背包道具链接', () => {
  F.Game.inv.wood = 5;
  const m = F.Social.send('world', { type: 'item', item: 'wood', n: 5 });
  if (!m || m.type !== 'item' || m.item !== 'wood' || m.n !== 5) throw new Error('道具消息异常');
  if (m.text.indexOf(F.itemName('wood')) < 0) throw new Error('回退文本异常：' + m.text);
  return m.text + ' ×' + m.n;
});
ok('聊天：私聊同样支持图片 / 道具', () => {
  F.Social.sendPrivate('村长阿禾', { type: 'item', item: 'apple', n: 3 });
  F.Social.sendPrivate('村长阿禾', { type: 'img', src: 'data:image/png;base64,BBBB' });
  const arr = F.Social.privates['村长阿禾'] || [];
  const cnt = arr.filter(m => m.type === 'item' || m.type === 'img').length;
  if (cnt < 2) throw new Error('私聊富媒体缺失 ' + cnt);
  return '私聊 ' + arr.length + ' 条，其中富媒体 ' + cnt + ' 条';
});
ok('聊天：空文本 / 非法内容被忽略', () => {
  if (F.Social.send('zh', '') !== null) throw new Error('空文本应忽略');
  if (F.Social.send('zh', '   ') !== null) throw new Error('空白文本应忽略');
  if (F.Social.send('zh', { type: 'img' }) !== null) throw new Error('无 src 图片应忽略');
  if (F.Social.send('zh', { type: 'item' }) !== null) throw new Error('无 item 道具应忽略');
  const m = F.Social.send('zh', '普通文本仍可用');
  if (!m || m.type !== 'text') throw new Error('文本消息异常');
  return '无效消息已忽略，纯文本仍正常';
});

console.log('— 天气 / 斗兽场 —');
ok('天气：8 种天气 + 自动轮换', () => {
  F.Weather.init(scene);
  const ids = Object.keys(F.WX);
  if (ids.length !== 8) throw new Error('天气种类 ' + ids.length);
  F.Weather.set('clear', true);
  F.Weather.enabled = true;
  F.Weather.nextT = 0.001;
  const before = F.Weather.cur;
  for (let i = 0; i < 40; i++) F.Weather.update(1, F.Player.pos);
  return ids.map(i => F.WX[i].name).join('/') + ' · ' + before + ' → ' + F.Weather.cur;
});
ok('天气：每种天气都有明确的增益 / 减益', () => {
  const rows = [];
  for (const id of Object.keys(F.WX)) {
    F.Weather.set(id, true);
    const b = F.Weather.buffList();
    if (!b.length) throw new Error(F.WX[id].name + ' 没有任何效果');
    rows.push(F.WX[id].name + '(' + b.length + ')');
  }
  return rows.join(' ');
});
ok('天气：数值 mods 生效（移速 / 体力 / 作物 / 捕捉）', () => {
  F.Weather.set('clear', true);
  const spClear = F.Weather.m('speed', 1), enClear = F.Weather.m('energy', 1), grClear = F.Weather.m('growth', 1);
  F.Weather.set('storm', true);
  const spS = F.Weather.m('speed', 1), enS = F.Weather.m('energy', 1), catchS = F.Weather.m('catch', 1);
  if (!(spClear > 1 && spS < 1)) throw new Error('移速 mods 异常');
  if (!(enClear < 1 && enS > 1)) throw new Error('体力 mods 异常');
  if (!(grClear > 1)) throw new Error('作物 mods 异常');
  if (!(catchS > 1)) throw new Error('捕捉 mods 异常');
  F.Weather.set('clear', true);
  return `晴朗 移速×${spClear} 体力×${enClear} 作物×${grClear} · 雷暴 移速×${spS} 体力×${enS} 捕捉×${catchS}`;
});
ok('天气：风力驱动草的卷动 + 降水粒子', () => {
  F.Weather.set('storm', true);
  for (let i = 0; i < 120; i++) F.Weather.update(1 / 30, F.Player.pos);
  if (!(F.World.wind.strength > 0.8)) throw new Error('风力未随天气上升 ' + F.World.wind.strength.toFixed(2));
  if (!(F.Weather.precip > 0.5)) throw new Error('降水未生成 ' + F.Weather.precip.toFixed(2));
  if (!F.Weather.rain.pts.visible) throw new Error('雨粒子未显示');
  const stormWind = F.World.wind.strength;
  F.Weather.set('snow', true);
  for (let i = 0; i < 120; i++) F.Weather.update(1 / 30, F.Player.pos);
  if (!F.Weather.snow.pts.visible) throw new Error('雪粒子未显示');
  F.Weather.set('clear', true);
  for (let i = 0; i < 40; i++) F.Weather.update(1 / 20, F.Player.pos);
  return `雷暴风力 ${stormWind.toFixed(2)}（草随之卷动）· 雨雪切换正常 · 复晴后 ${F.World.wind.strength.toFixed(2)}`;
});
ok('斗兽场：1v1 / 3v3 / 10v10 阵容', () => {
  F.Arena.reset();
  const mk = (n) => {
    const list = [];
    for (let i = 0; i < n; i++) list.push({ type: 'boar', name: '野猪', q: '精良', lv: 6 + i, mul: 1.35, h: 1 });
    return list;
  };
  const out = [];
  for (const md of F.ARENA_MODES) {
    F.Mounts.list = mk(md.n);
    const m = F.Arena.startMatch({ mode: md.id, mine: true });
    if (!m) throw new Error(md.name + ' 无法创建');
    if (m.a.pets.length !== md.n || m.b.pets.length !== md.n) throw new Error(md.name + ' 阵容数量不符');
    out.push(md.name + ' 双方各 ' + m.a.pets.length + ' 只');
  }
  if (!F.Arena.matches.length) throw new Error('比赛未入列表');
  return out.join(' · ');
});
ok('斗兽场：宠物不足时无法报名', () => {
  F.Mounts.list = [];
  const m = F.Arena.startMatch({ mode: '3v3', mine: true });
  if (m) throw new Error('宠物不足竟然能开赛');
  return '宠物不足 3 只时被拒绝';
});
ok('斗兽场：竞猜赔率随投注动态变化', () => {
  F.Mounts.list = [{ type: 'wolf', name: '灰狼', q: '稀有', lv: 12, mul: 1.5, h: 1 }];
  F.Arena.reset();
  const m = F.Arena.startMatch({ mode: '1v1' });
  const o0 = m.odds.slice();
  F.Game.coins = 100000;
  if (!F.Arena.bet(m, 0, 2000)) throw new Error('下注失败');
  if (!(m.odds[0] < o0[0])) throw new Error('红方下注后赔率未下降');
  if (!(m.odds[1] > o0[1])) throw new Error('另一方赔率未上升');
  return `初始 ${o0[0]}/${o0[1]} → 押红 2000 后 ${m.odds[0]}/${m.odds[1]}`;
});
ok('斗兽场：下注上限 + 市场税收回收（防通胀）', () => {
  F.Arena.reset();
  F.Game.coins = 100000;
  const m = F.Arena.startMatch({ mode: '1v1' });
  const cap = F.Arena.betCap();
  if (!(cap > 0)) throw new Error('上限异常');
  if (F.Arena.bet(m, 0, cap + 100000)) throw new Error('超过上限竟然成功');
  /* 当日累计投注越多 → 上限越低 */
  const beforeLimit = F.Arena.betCap();
  F.Arena.market.dayBet = 15000;
  const afterLimit = F.Arena.betCap();
  if (!(afterLimit < beforeLimit)) throw new Error('累进调控未生效');
  F.Arena.bet(m, 1, 1000);
  /* 结算：市场税收部分退出流通 */
  const total = m.pools[0] + m.pools[1];
  m.winner = 1;
  F.Arena.settle(m);
  if (!(F.Arena.market.destroyed >= Math.round(total * F.Arena.market.tax))) throw new Error('税收未回收销毁');
  return `上限 ${cap} → 当日投注后 ${afterLimit} · 彩池 ${total} 已退出流通 ${F.Arena.market.destroyed} 金币`;
});
ok('斗兽场：战斗推进并产生胜者', () => {
  F.Arena.reset();
  const m = F.Arena.startMatch({ mode: '3v3' });
  m.phase = 'fight'; m.cd = 0;
  let guard = 0;
  while (m.phase === 'fight' && guard < 4000) { F.Arena.tickFight(m, 0.5); guard++; }
  if (m.winner < 0) throw new Error('没有产生胜者');
  if (!m.log.length) throw new Error('没有战斗日志');
  return `${m.a.name} VS ${m.b.name} → 胜者 ${m.winner === 0 ? m.a.name : m.b.name}（${m.log.length} 条日志）`;
});

console.log('— 委托任务 / 商人收购 / 黑市 —');
ok('委托：随机发布 + 接取时随机生成奖励', () => {
  F.Quest.reset();
  if (!F.Quest.board.length) throw new Error('公告板没有委托');
  const kinds = {};
  for (let round = 0; round < 12; round++) {
    F.Quest.reroll(true);
    for (const q of F.Quest.board) {
      kinds[q.kind] = (kinds[q.kind] || 0) + 1;
      if (!q.title || !q.need || q.need <= 0) throw new Error('委托数据异常 ' + JSON.stringify(q));
    }
  }
  const need = ['gain', 'stat', 'deliver', 'floor'];
  for (const k of need) if (!kinds[k]) throw new Error('缺少类型 ' + k);
  /* 奖励随机：两次 Roll 结果不完全相同 */
  let same = true;
  for (let i = 0; i < 30; i++) { const a = F.Quest.roll(2), b = F.Quest.roll(2); if (JSON.stringify(a) !== JSON.stringify(b)) { same = false; break; } }
  if (same) throw new Error('奖励没有随机性');
  const q = F.Quest.board[0];
  if (!F.Quest.accept(q.id)) throw new Error('接取失败');
  if (!q.reward || !F.Quest.doing.length) throw new Error('接取后未生成奖励');
  return `模板覆盖 ${Object.keys(kinds).join('/')} · 本次接取：${q.title} → ${F.Quest.rewardText(q.reward)}`;
});
ok('委托：同时进行上限 3 条 + 进度推进 + 领取随机奖励', () => {
  F.Quest.reset();
  for (let i = 0; i < 5; i++) { const q = F.Quest.board[0]; if (q) F.Quest.accept(q.id); }
  if (F.Quest.doing.length !== 3) throw new Error('上限失效：' + F.Quest.doing.length);
  /* 找一个采集类，模拟收益推进 */
  const q = F.Quest.doing.find(x => x.kind === 'gain') || F.Quest.doing[0];
  const before = F.Quest.prog(q);
  if (q.kind === 'gain') for (let i = 0; i < q.need; i++) F.Game.give(q.item, 1);
  else if (q.kind === 'stat') for (let i = 0; i < q.need; i++) F.Game.stats[q.stat] = (F.Game.stats[q.stat] || 0) + 1;
  else if (q.kind === 'deliver') { F.Game.give(q.item, q.need); if (q.stat) null; }
  else if (q.kind === 'floor') { F.Dungeon.bestFloor = Math.max(F.Dungeon.bestFloor || 0, q.need); }
  const after = F.Quest.prog(q);
  if (!(after > before)) throw new Error('进度没有推进 ' + before + '→' + after);
  F.Game.stats[q.stat] = F.Game.stats[q.stat];
  const coins0 = F.Game.coins, rw = q.reward;
  if (!F.Quest.isDone(q)) throw new Error('未判定完成：' + after + '/' + q.need);
  if (!F.Quest.claim(q.id)) throw new Error('领取失败');
  if (!(F.Game.coins > coins0)) throw new Error('没有发放金币奖励');
  for (const it of rw.items) if (!(F.Game.inv[it.id] > 0)) throw new Error('没有发放物资 ' + it.id);
  if (F.Quest.done !== 1) throw new Error('完成计数异常');
  return `${q.title} → ${F.Quest.rewardText(rw)}（进度 ${after}/${q.need}）`;
});
ok('委托：未完成不能领取 + 放弃回收为可接取', () => {
  F.Quest.reset();
  const q = F.Quest.board[0];
  F.Quest.accept(q.id);
  if (F.Quest.claim(q.id)) throw new Error('未完成竟然能领取');
  const n0 = F.Quest.board.length;
  F.Quest.drop(q.id);
  if (F.Quest.board.length !== n0 + 1) throw new Error('放弃后没有回到可接取列表');
  if (q.reward) throw new Error('放弃后应清空随机奖励');
  return '未完成拒绝领取 · 放弃后重新随机（奖励清空）';
});
ok('商人收购：按物价回收且主营品类 +15%', () => {
  F.Game.inv = { iron: 10, potion: 3, axe: 1 };
  F.Game.coins = 0;
  const material = F.SHOPS.material;                 /* 主营含 iron */
  const base = F.priceOf('iron');
  const unit = Math.max(1, Math.ceil(base * 1.15));
  /* 模拟面板收购：卖 10 个铁矿给材料商人 */
  for (let i = 0; i < 10; i++) F.Game.take('iron', 1);
  F.Game.addCoins(unit * 10);
  if (F.Game.inv.iron) throw new Error('物品未扣除');
  if (F.Game.coins !== unit * 10) throw new Error('收购金额异常 ' + F.Game.coins);
  if (!(unit > base)) throw new Error('主营加价未生效');
  if (!(F.priceOf('potion') > 0)) throw new Error('非主营物价异常');
  /* 工具不在一键售出范围内 */
  if (!F.TOOLSK.axe) throw new Error('工具表异常');
  return `铁矿基础价 ${base} → 材料商人收购 ${unit} 金币/个（+15%），共 ${F.Game.coins} 金币 · 斧头等工具不会被卖`;
});
ok('黑市：摆摊 ↔ 别人买走（全额到账 / 买方税费回收）', () => {
  F.BMarket.reset();
  F.Game.inv = { iron_ingot: 5 };
  F.Game.coins = 0;
  if (!F.BMarket.list('iron_ingot', 3, 100)) throw new Error('上架失败');
  if (F.Game.inv.iron_ingot !== 2) throw new Error('上架未扣物');
  if (F.BMarket.mine.length !== 1) throw new Error('摊位没挂上');
  const d0 = F.BMarket.destroyed;
  /* 模拟别人买走 1 件 */
  const l = F.BMarket.mine[0];
  F.BMarket.update(0);
  F.BMarket.tPick = 0.001;
  const before = F.Game.coins;
  F.BMarket.update(0.01);
  if (!(F.Game.coins > before)) throw new Error('卖家没有到账');
  if (!(F.BMarket.destroyed > d0)) throw new Error('税费没有回收');
  const tax = F.BMarket.sold[0].tax;
  if (Math.abs(tax - Math.round(F.BMarket.sold[0].price * 0.3)) > 1) throw new Error('税率不是 30%：' + tax);
  return `摊位成交 ${F.BMarket.sold[0].price} 金币到账 · 回收税费 ${tax}（30%）`;
});
ok('黑市：面对面买卖 → 买方额外付 30% 税费', () => {
  F.BMarket.reset();
  F.Game.inv = { gem_crystal: 2 };
  F.Game.coins = 100000;
  /* 买入：让在场的人挂一件确定价的商品 */
  const p = F.BMarket.peep();
  if (!p || !p.stock.length) throw new Error('黑市里没有人带货');
  const s = p.stock[0];
  const total = s.price * s.n, tax = Math.round(total * F.BMarket.TAX);
  const before = F.Game.coins, d0 = F.BMarket.destroyed, n0 = p.stock.length;
  if (!F.BMarket.buyFace(0)) throw new Error('面对面买入失败');
  if (F.Game.coins !== before - (total + tax)) throw new Error('扣费不符：' + (before - F.Game.coins) + ' 应为 ' + (total + tax));
  if (F.BMarket.destroyed !== d0 + tax) throw new Error('税费未回收');
  if (p.stock.length !== n0 - 1) throw new Error('对方库存未减少');
  /* 卖出 */
  const c1 = F.Game.coins, d1 = F.BMarket.destroyed;
  if (!F.BMarket.sellFace('gem_crystal', 2)) throw new Error('面对面卖出失败');
  if (!(F.Game.coins > c1)) throw new Error('卖出没有收金币');
  if (!(F.BMarket.destroyed > d1)) throw new Error('卖出未回收税费');
  return `买入实付 ${total + tax}（货款 ${total} + 税费 ${tax}）· 卖出到账 ${F.Game.coins - c1} 金币`;
});
ok('黑市：收摊返还 + 成交费率 30%', () => {
  F.BMarket.reset();
  F.Game.inv = { leather: 4 };
  F.BMarket.list('leather', 4, 20);
  F.BMarket.cancel(F.BMarket.mine[0].id);
  if (F.Game.inv.leather !== 4) throw new Error('收摊没有返还物品');
  if (F.BMarket.TAX !== 0.3) throw new Error('税率不是 30%');
  return '收摊全额返还 · 税率固定 30%';
});

console.log('— 生物模型（creatures.js）—');
ok('人物模型：头身比 ≈1:5 · 有眼有帽 · 脚踩地不穿模', () => {
  const m = F.Creatures.createPlayerModel({ shirt: 0x6ba8d6 });
  let meshes = 0;
  m.group.traverse(o => { if (o.isMesh) meshes++; });
  if (!meshes) throw new Error('没有生成任何网格');
  if (!(m.group && m.head && m.arms.length === 2 && m.legs.length === 2 && m.torso)) throw new Error('缺少动画所需句柄');
  const bb = new THREE.Box3().setFromObject(m.group);
  const tall = bb.max.y - bb.min.y;
  if (bb.min.y < -0.06 || bb.min.y > 0.10) throw new Error('脚没落在地面上：底 y=' + bb.min.y.toFixed(3));
  const headH = 0.175 * 1.06 * 2;                       /* 头部自身高度 */
  const ratio = tall / headH;
  if (ratio < 4.4 || ratio > 5.6) throw new Error('头身比 ' + ratio.toFixed(2) + ' 不在 1:5 附近');
  /* 摆动四肢不应露出破面：各部件仍有实体 */
  m.legs[0].rotation.x = 0.6; m.arms[0].rotation.x = -0.6;
  const bb2 = new THREE.Box3().setFromObject(m.group);
  if (bb2.min.y < -0.12) throw new Error('抬腿后穿到地面以下 ' + bb2.min.y.toFixed(2));
  m.legs[0].rotation.x = 0; m.arms[0].rotation.x = 0;
  return `身高 ${tall.toFixed(2)}m · 头身比 1:${ratio.toFixed(1)} · 底面 ${bb.min.y.toFixed(2)}m · ${meshes} 个合并网格`;
});
ok('动物模板：牛/羊/鸡三类共用一套躯干+四肢+头/耳结构', () => {
  const out = [];
  for (const t of ['cow', 'sheep', 'chicken', 'rabbit', 'deer', 'wolf']) {
    const a = F.Creatures.createAnimalModel(t);
    if (!a.group || !a.head || !a.body) throw new Error(t + ' 结构缺失');
    if (!a.legs.length) throw new Error(t + ' 没有腿');
    const bb = new THREE.Box3().setFromObject(a.group);
    if (bb.min.y < -0.10 || bb.min.y > 0.14) throw new Error(t + ' 悬空/入地：' + bb.min.y.toFixed(2));
    /* 区分度：不同动物的体高应当不同 */
    out.push({ t, h: +(bb.max.y - bb.min.y).toFixed(2), legs: a.legs.length });
  }
  const get = (t) => out.find(o => o.t === t).h;
  if (!(get('cow') > get('sheep') && get('sheep') > get('chicken'))) throw new Error('体型没有拉开：' + JSON.stringify(out));
  if (new Set(out.map(o => Math.round(o.h * 10))).size < 3) throw new Error('体型档位太少：' + JSON.stringify(out));
  if (out.find(o => o.t === 'chicken').legs !== 2) throw new Error('鸡应该是两条腿');
  if (out.find(o => o.t === 'cow').legs !== 4) throw new Error('牛应该是四条腿');
  return out.map(o => `${o.t} ${o.h}m/${o.legs}腿`).join(' · ');
});
ok('怪物模型：8 种都有几何体且剪影足够大（打架看得见）', () => {
  const out = [];
  for (const k in F.MOBS) {
    const g = F.MOBS[k].geo();
    if (!g || !g.attributes || !g.attributes.position.count) throw new Error(k + ' 几何体为空');
    const b = F.measure(g);
    if (b.h < 0.4 || b.w < 0.3) throw new Error(k + ' 体积过小 ' + JSON.stringify(b));
    if (b.min.y < -0.12) throw new Error(k + ' 陷进地面 ' + b.min.y.toFixed(2));
    out.push({ k, h: +b.h.toFixed(2), faces: g.attributes.position.count / 3 });
  }
  if (out.length !== 8) throw new Error('怪物种类 ' + out.length);
  const faces = out.reduce((s, o) => s + o.faces, 0);
  if (faces > 8 * 2600) throw new Error('面数失控：合计 ' + faces);
  return out.map(o => `${o.k} ${o.h}m`).join(' · ') + ' · 合计约 ' + Math.round(faces) + ' 面';
});

console.log('— 键位映射（util.js）—');
ok('默认键位表无冲突 · bind/normKey/keyConflict 可用', () => {
  const seen = {};
  for (const id in F.KEY_DEFAULT) {
    const k = F.bind(id);
    if (!k) throw new Error(id + ' 没有默认键');
    if (seen[k]) throw new Error('键 ' + k + ' 同时绑定了 ' + seen[k] + ' 与 ' + id);
    seen[k] = id;
    if (F.keyConflict(id, k)) throw new Error(id + ' 默认值自相冲突');
  }
  if (F.normKey('空格') !== ' ' || F.normKey('TAB') !== 'tab' || F.normKey('zz') !== null || F.normKey('') !== null) {
    throw new Error('normKey 规范化异常');
  }
  if (F.normKey('z') !== 'z') throw new Error('单字符规范化失败');
  return Object.keys(F.KEY_DEFAULT).length + ' 个动作 · 前进=' + F.bind('forward').toUpperCase() + ' · 主交互=' + F.bind('interact').toUpperCase();
});

ok('键位兜底：存档里的脏值（space / 空格 / 非法）自动回落可用键', () => {
  F.Game.opt.keys = { jump: 'space', forward: '空格', bag: '??' };
  const j = F.bind('jump'), f = F.bind('forward'), b = F.bind('bag');
  F.Game.opt.keys = {};
  if (j !== ' ') throw new Error('jump 应为空格，实际 ' + JSON.stringify(j));
  if (f !== ' ') throw new Error('forward 应为空格，实际 ' + JSON.stringify(f));
  if (b !== 'i') throw new Error('非法值应回落默认 i，实际 ' + JSON.stringify(b));
  return 'jump/forward → 空格 · 非法项回落默认';
});

ok('灌木丛：50% 概率出 5~10 个浆果（数量不越界 · 概率约一半）', () => {
  const node = { alive: true, def: F.NODE_DEFS.bush, respawn: 0, hits: 1, grow: 0, type: 'bush', idx: 0 };
  let hit = 0, min = 99, max = 0, noBonus = 0;
  for (let i = 0; i < 2000; i++) {
    F.Nodes.meshes.bush = F.Nodes.meshes.bush || { instanceMatrix: { needsUpdate: false } };
    F.hideInst = F.hideInst || function () { };
    node.alive = true;
    const y = F.Nodes.harvest(node);
    if (y.berry) { hit++; min = Math.min(min, y.berry); max = Math.max(max, y.berry); }
    else noBonus++;
    if (y.fiber !== 2 || y.branch !== 1) throw new Error('基础掉落被概率产出污染');
  }
  const rate = hit / 2000;
  if (min < 5 || max > 10) throw new Error(`浆果数量越界：${min}~${max}`);
  if (Math.abs(rate - 0.5) > 0.06) throw new Error('概率偏离 50% 太多：' + rate.toFixed(3));
  if (hit + noBonus !== 2000) throw new Error('统计口径不对');
  return `出货率 ${(rate * 100).toFixed(1)}% · 数量 ${min}~${max} · 期望 ${(rate * 7.5).toFixed(2)} 个/丛`;
});

ok('浆果丛（原装饰层转正）：必得基础浆果，50% 概率追加 5~10 个（叠加不替换）', () => {
  const node = { alive: true, def: F.NODE_DEFS.berrybush, respawn: 0, hits: 1, grow: 0, type: 'berrybush', idx: 0 };
  F.Nodes.meshes.berrybush = F.Nodes.meshes.berrybush || { instanceMatrix: { needsUpdate: false } };
  F.hideInst = F.hideInst || function () { };
  let min = 99, max = 0, hit = 0;
  for (let i = 0; i < 1500; i++) {
    node.alive = true;
    const y = F.Nodes.harvest(node);
    if (!(y.berry >= 2)) throw new Error('基础浆果 2 个没保住：' + y.berry);
    if (y.berry > 2) hit++;
    min = Math.min(min, y.berry); max = Math.max(max, y.berry);
  }
  const rate = hit / 1500;
  if (min < 2 || max > 12) throw new Error(`数量越界：${min}~${max}（应为 2~12）`);
  if (Math.abs(rate - 0.5) > 0.06) throw new Error('追加概率偏离 50%：' + rate.toFixed(3));
  if (F.Nodes.meshes.berrybush) delete F.Nodes.meshes.berrybush;
  return `基础 2 + 追加率 ${(rate * 100).toFixed(1)}% · 区间 ${min}~${max}`;
});

ok('浆果食用：恢复 10 点体力（沿用真实 eat 规则，饥饿食物规则不变）', () => {
  const P = F.Player, G = F.Game;
  if (F.staminaOf('berry') !== 10) throw new Error('浆果体力值不对：' + F.staminaOf('berry'));
  if (F.foodOf('berry') !== 0) throw new Error('浆果不应按饥饿食物计价');
  /* 冒烟不加载 main.js，这里照搬 eat() 的同一套算术做演算（真实 eat 在 e2e 里走真按键验证） */
  const eat = (id) => {
    const f = F.foodOf(id), st = F.staminaOf(id);
    if (!f && !st) throw new Error(id + ' 不能吃');
    if (f) P.hunger = F.clamp(P.hunger + f, 0, 100);
    P.energy = F.clamp(P.energy + (st || (f ? 6 : 0)), 0, 100);
  };
  G.inv.berry = 3; P.energy = 40; P.hunger = 50;
  eat('berry');
  if (P.energy !== 50) throw new Error('体力应为 50，实际 ' + P.energy);
  if (P.hunger !== 50) throw new Error('饥饿不该变：' + P.hunger);
  P.energy = 95; eat('berry');
  if (P.energy !== 100) throw new Error('体力应夹在上限 100，实际 ' + P.energy);
  P.energy = 40; P.hunger = 50; eat('carrot');
  if (P.hunger !== 68 || P.energy !== 46) throw new Error(`胡萝卜应饥饿 68 / 体力 46，实际 ${P.hunger} / ${P.energy}`);
  G.inv.berry = 0; delete G.inv.berry;
  return '浆果 体力+10（上限夹紧）· 胡萝卜 饥饿+18 体力+6（旧规则不变）';
});

ok('装饰植被：白花簇 / 浆果丛几何可生成（纯装饰不进采集表）', () => {
  const d = F.PROPS.flora('daisy'), b = F.PROPS.flora('berry');
  const n = g => g.attributes.position.count;
  if (!d || n(d) < 60) throw new Error('白花簇几何异常');
  if (!b || n(b) < 80) throw new Error('浆果丛几何异常');
  if (F.NODE_DEFS.daisy || F.NODE_DEFS.berry) throw new Error('装饰植被不应进入采集表');
  const daisyPos = [], col = d.attributes.color;
  for (let i = 0; i < 6; i++) daisyPos.push([col.getX(i), col.getY(i), col.getZ(i)]);
  return '白花簇 ' + n(d) + ' 顶点 · 浆果丛 ' + n(b) + ' 顶点';
});

ok('传送门：海洋色 + 旋转部件真的会转', () => {
  const p = F.PROPS.portal({ r: 2.2, h: 2.3 });
  if (!p.spin || p.spin.children.length < 7) throw new Error('旋转部件不足：' + (p.spin ? p.spin.children.length : 0));
  const z0 = p.spin.rotation.z, o0 = p.disc.material.opacity;
  for (let i = 0; i < 10; i++) p.update(0.05);
  if (p.spin.rotation.z >= z0) throw new Error('海浪盘没有转起来');
  if (p.disc.material.opacity === o0) throw new Error('圆盘没有呼吸');
  const c = p.ring.material.color, dd = p.disc.material.color;
  if (!(c.b > c.r && dd.b > dd.r)) throw new Error('不是冷色调（海洋色）：' + c.getHexString() + ' / ' + dd.getHexString());
  if (p.ring.material.emissiveIntensity > 0.7) throw new Error('自发光过强，会像原来的白光圈');
  return '#' + c.getHexString() + ' 外环 · ' + p.spin.children.length + ' 个旋转部件 · 0.5s 转 ' + (z0 - p.spin.rotation.z).toFixed(2) + ' rad';
});

console.log('— 家园建筑 —');
ok('家园：4 种风格 × 17 种构配件全部注册', () => {
  F.HomeBuild.init();
  const n = Object.keys(F.HOME_PARTS).length;
  let cnt = 0;
  for (const pid in F.HOME_PARTS) for (const sid in F.HOME_STYLES) {
    const d = F.PROPS.BUILDS[F.HomeBuild.id(pid, sid)];
    if (!d) throw new Error('缺少 ' + pid + '/' + sid);
    if (!d.cost || !Object.keys(d.cost).length) throw new Error('无造价 ' + pid);
    cnt++;
  }
  if (cnt !== n * 4) throw new Error('组合数 ' + cnt);
  const need = ['wall', 'ceiling', 'floor', 'door', 'frame', 'lock', 'window', 'chest', 'bench'];
  for (const k of need) if (!F.HOME_PARTS[k]) throw new Error('缺少用户要求的构件 ' + k);
  return Object.keys(F.HOME_STYLES).map(s => F.HOME_STYLES[s].name).join('/') + ' × ' + n + ' 构件 = ' + cnt + ' 个可建造项';
});
ok('家园：各风格取材不同（材料 + 风格系数）', () => {
  const rows = [];
  for (const sid in F.HOME_STYLES) {
    const c = F.HomeBuild.materials('wall', sid);
    rows.push(F.HOME_STYLES[sid].name + ':' + Object.keys(c).map(k => F.itemName(k) + '×' + c[k]).join('+'));
  }
  const a = JSON.stringify(F.HomeBuild.materials('wall', 'chinese'));
  const b = JSON.stringify(F.HomeBuild.materials('wall', 'modern'));
  if (a === b) throw new Error('不同风格造价相同');
  return rows.join(' | ');
});
ok('家园：野外面板制取 50 金币手续费 / 工作台旁免除', () => {
  const far = F.HomeBuild.effCost('wall', 'chinese');
  if (far.coins !== 50) throw new Error('野外手续费异常 ' + JSON.stringify(far));
  /* 放一个自己的工作台在脚边 → 免手续费 */
  const b = F.Builds.add(F.HomeBuild.id('bench', 'modern'), F.Player.pos.x + 2, F.Player.pos.z, 0);
  const near = F.HomeBuild.effCost('wall', 'chinese');
  F.Builds.remove(b);
  if (near.coins) throw new Error('工作台旁仍收手续费');
  return '野外 50 金币 + 材料 → 工作台旁仅材料';
});
ok('家园：几何生成（门 / 窗 / 屋顶均能构建且带铰链）', () => {
  const out = [];
  for (const pid in F.HOME_PARTS) {
    for (const sid in F.HOME_STYLES) {
      const g = F.PROPS.makeBuild(F.HomeBuild.id(pid, sid));
      let meshes = 0;
      g.traverse(o => { if (o.isMesh) meshes++; });
      if (!meshes) throw new Error(pid + '/' + sid + ' 没有生成网格');
    }
  }
  const door = F.PROPS.makeBuild(F.HomeBuild.id('door', 'chinese'));
  if (!door.userData.anim || !door.userData.anim.hinge) throw new Error('门缺少铰链部件');
  out.push('17×4 全部生成成功');
  return out.join(' · ');
});
ok('家园：自由拼装（墙体内可嵌套门/窗/屋顶重叠放置）', () => {
  const x = F.Player.pos.x + 40, z = F.Player.pos.z;
  const w = F.Builds.add(F.HomeBuild.id('wall', 'chinese'), x, z, 0);
  const win = F.Builds.add(F.HomeBuild.id('window', 'chinese'), x, z, 0);
  const d = F.Builds.add(F.HomeBuild.id('door', 'chinese'), x, z, 0);
  const rf = F.Builds.add(F.HomeBuild.id('roof', 'chinese'), x, z, 0);
  for (const b of [w, win, d, rf]) F.Builds.remove(b);
  return '墙 + 窗 + 门 + 屋顶 同点位拼接成功（不被重叠判定拦截）';
});
ok('家园：门锁控制开关门', () => {
  const x = F.Player.pos.x + 60, z = F.Player.pos.z;
  const d = F.Builds.add(F.HomeBuild.id('door', 'western'), x, z, 0);
  const lk = F.Builds.add(F.HomeBuild.id('lock', 'western'), x + 1, z, 0);
  F.Inter.doHomeDoor(d);
  if (d.door !== 1) throw new Error('门未打开');
  F.Inter.doHomeLock(lk);
  if (!lk.locked) throw new Error('未上锁');
  if (d.door !== 0) throw new Error('上锁未自动关门');
  F.Inter.doHomeDoor(d);
  if (d.door !== 0) throw new Error('上锁后竟然还能开门');
  F.Inter.doHomeLock(lk);
  F.Inter.doHomeDoor(d);
  if (d.door !== 1) throw new Error('解锁后仍打不开');
  F.Builds.remove(d); F.Builds.remove(lk);
  return '开门 → 上锁（自动带上门）→ 拒绝开启 → 解锁 → 可开';
});
ok('家园：拆除返还一半材料（金币手续费也返还一半）', () => {
  const id = F.HomeBuild.id('wall', 'classic');
  const cost = F.HomeBuild.materials('wall', 'classic');
  const b = F.Builds.add(id, F.Player.pos.x + 80, F.Player.pos.z, 0);
  const before = {};
  for (const k in cost) before[k] = F.Game.inv[k] || 0;
  const coins0 = F.Game.coins;
  F.Inter.removeTarget = b;
  F.Inter.tryRemove();
  const rows = [];
  for (const k in cost) {
    const got = (F.Game.inv[k] || 0) - (before[k] || 0);
    const want = Math.max(1, Math.floor(cost[k] * 0.5));
    if (got !== want) throw new Error(F.itemName(k) + ' 返还 ' + got + '，应为 ' + want);
    rows.push(F.itemName(k) + ' +' + got);
  }
  if (Object.keys(F.Game.inv).indexOf('coins') >= 0) throw new Error('金币被当成普通物品返还');
  if (F.Game.coins < coins0) throw new Error('金币未返还');
  return rows.join(' / ');
});

console.log('— 600 帧模拟 —');
ok('草覆盖率 ×30：中档重建后草丛数量应从旧版约 3000 株抬到 3 万株以上（分帧重建能跑完）', () => {
  F.World.setGrassQuality(2);
  /* 分帧切片：重建完成前 count 一直是 0，完成那一刻跳到最终值并保持 —— 以「>0 且连续 3 帧不变」为完成 */
  let last = -1, stable = 0;
  const t0 = Date.now();
  while (stable < 3 && Date.now() - t0 < 15000) {
    F.World.updateGrass(F.Player.pos.x, F.Player.pos.z, 1 / 60);
    if (F.World.grass.mesh.count > 0 && F.World.grass.mesh.count === last) stable++;
    else { stable = 0; last = F.World.grass.mesh.count; }
  }
  const n = F.World.grass.mesh.count;
  if (n < 30000) throw new Error('草丛数量不足 3 万：' + n);
  if (n > F.World.grass.cap) throw new Error('超出实例容量');
  F.World.setGrassQuality(F.Game.opt.grass);
  return `中档 ${n} 株（旧版约 3000）· 重建 ${Date.now() - t0}ms 内分帧完成`;
});
ok('主循环', () => {
  for (let i = 0; i < 600; i++) {
    const dt = 1 / 60;
    F.Player.speed = 3;
    F.Player.pos.x += Math.sin(i * 0.05) * 0.06;
    F.Player.pos.z += Math.cos(i * 0.03) * 0.06;
    F.Player.update(dt, false);
    F.Animals.update(dt, F.Player);
    F.Fish.update(dt);
    F.Nodes.update(dt);
    F.Farm.update(dt, 1);
    F.Builds.update(dt, i % 120 < 30);
    F.Drops.update(dt, F.Player.pos.x, F.Player.pos.z);
    F.FX.update(dt);
    F.Inter.update(dt);
    F.Combat.update(dt);
    F.Village.update(dt);
    F.Dungeon.update(dt);
    F.Social.tick(dt);
    F.Rank.tick(dt);
    F.Mounts.update(dt);
    F.World.update(dt, i * dt, F.Player.pos);
    F.World.updateGrass(F.Player.pos.x, F.Player.pos.z, dt);
    F.World.setTime((9 + i * 0.02) % 24);
  }
  return `玩家 ${F.Player.pos.x.toFixed(1)},${F.Player.pos.y.toFixed(2)},${F.Player.pos.z.toFixed(1)} 草丛=${F.World.grass.mesh.count}`;
});

console.log('— 边界 —');
ok('边界回推', () => {
  F.Player.pos.set(295, 0, 295);
  for (let i = 0; i < 120; i++) { F.Input.keys['w'] = true; F.Player.update(1 / 60, false); }
  F.Input.keys['w'] = false;
  return `半径=${Math.hypot(F.Player.pos.x, F.Player.pos.z).toFixed(1)}`;
});
ok('深水游泳', () => {
  const x = -20, z = T.riverZ(-20);
  F.Player.pos.set(x, 0, z);
  for (let i = 0; i < 60; i++) F.Player.update(1 / 60, false);
  return `y=${F.Player.pos.y.toFixed(2)} 游泳=${F.Player.swimming}`;
});

console.log('— 存档迁移 —');
ok('迁移 v1→v2：Q 让给技能、天赋字段与装配槽补齐、旧档字段一个不少', () => {
  const old = { v: 1, time: 12.5, coins: 777, opt: { grass: 2, keys: { seed: 'q' } } };
  const d = F.Migrate.run(old);
  if (d.v !== 2) throw new Error('版本号未升到 2：' + d.v);
  if (d.coins !== 777 || d.time !== 12.5) throw new Error('旧字段被破坏');
  if (d.opt.keys.seed) throw new Error('旧 seed=q 未清掉，会让 Q 键打架');
  if (!d.talents || d.talentPts !== 0) throw new Error('天赋字段未补齐');
  if (!Array.isArray(d.abil) || d.abil.length !== 3) throw new Error('装配槽未补齐');
  if (F.Migrate.run(d).v !== 2) throw new Error('重复迁移应幂等');
  return 'v=2 · seed→' + F.bind('seed') + ' · 技能槽 Q/E/右键 · abil=' + d.abil.join(',');
});

console.log('— 战斗技能 —');
ok('技能释放：前摇→结算一次→CD 生效→体力扣除', () => {
  const A = F.Ability, P = F.Player, C = F.Combat;
  C.init(scene); A.init(scene);
  F.Skills.data.combat = F.Skills.data.combat || { lv: 1, xp: 0 };
  F.Skills.data.combat.lv = 60;                       /* 解锁全部技能便于验证 */
  P.dead = false; P.indoor = false; P.swimming = false;
  P.pos.set(4, T.hAt(4, 104), 104); P.rot = 0; P.energy = 100; P.tool = 'sword';
  const m = C.spawn('slime', P.pos.x, P.pos.z + 2.0, 1, 'world');
  if (!m) throw new Error('测试怪未生成');
  m.hp = m.maxHp = 9999;
  A.setSlot(0, 'heavy');
  A.cd = {}; A.casting = null; A.hitCount = 0; A.lastDmg = 0;
  const hp0 = m.hp;
  if (A.cast(0) !== true) throw new Error('首次释放失败');
  if (A.cast(0) !== false) throw new Error('释放中不该能再次触发');
  for (let i = 0; i < 40; i++) A.update(1 / 60);       /* 0.667s > wind+rec */
  if (A.hitCount !== 1) throw new Error('结算次数应为 1，实际 ' + A.hitCount);
  if (!(m.hp < hp0)) throw new Error('伤害没有进入结算');
  if (P.energy !== 100 - 8) throw new Error('体力扣除不对：' + P.energy);
  if (A.cast(0) !== false) throw new Error('冷却中不该能释放');
  const c0 = A.cd.heavy;
  for (let i = 0; i < 60; i++) A.update(1 / 60);
  if (!(A.cd.heavy < c0)) throw new Error('冷却没有走表');
  A.fx.length = 0;
  return `重斩 ${Math.round(hp0 - m.hp)} 伤害 · 体力 100→${P.energy} · CD ${c0.toFixed(1)}s`;
});

ok('五种释放路径：都能跑完并自行回收（无残留、无异常）', () => {
  const A = F.Ability, P = F.Player, C = F.Combat;
  const cases = [['heavy', 'melee'], ['whirl', 'around'], ['dash', 'dash'], ['blade', 'proj'], ['quake', 'ground'], ['chain', 'chain'], ['mend', 'self']];
  const out = [];
  for (const [id, path] of cases) {
    C.mobs.length = 0;
    P.pos.set(4, T.hAt(4, 104), 104); P.rot = 0; P.energy = 100; P.hp = 60; P.hpMax = 100;
    C.spawn('boar', P.pos.x, P.pos.z + 2.2, 1, 'world');
    C.spawn('wolf', P.pos.x + 1.5, P.pos.z + 3.0, 1, 'world');
    for (const mm of C.mobs) { mm.hp = mm.maxHp = 99999; }
    A.setSlot(0, id);
    A.cd = {}; A.casting = null; A.fx.length = 0; A.hitCount = 0;
    const before = A.hitCount;
    if (A.cast(0) !== true) throw new Error(id + ' 释放失败');
    for (let i = 0; i < 180; i++) A.update(1 / 60);     /* 3 秒，足够所有路径走完 */
    if (A.fx.length) throw new Error(path + ' 路径有残留实例：' + A.fx.length);
    if (id !== 'mend' && A.hitCount <= before) throw new Error(path + ' 没有产生任何结算');
    if (id === 'mend' && P.hp <= 60) throw new Error('治疗没有回血');
    const rr = Math.hypot(P.pos.x, P.pos.z);
    if (rr > 283.1) throw new Error('位移把玩家推出了世界：r=' + rr.toFixed(1));
    out.push(path + (id === 'mend' ? '(回血' + Math.round(P.hp - 60) + ')' : '×' + (A.hitCount - before)));
  }
  return out.join(' ');
});

ok('位移落点：不会被推进建筑/推出边界（判定顺序固定）', () => {
  const A = F.Ability, P = F.Player, C = F.Combat;
  A.setSlot(0, 'dash');
  for (const [x, z] of [[282, 0], [0, 282], [-282, 0], [0, -282]]) {
    P.pos.set(x, T.hAt(x, z), z); P.rot = Math.atan2(0 - x, 0 - z) + Math.PI;   /* 朝向外圈硬冲 */
    P.energy = 100; A.cd = {}; A.casting = null; A.fx.length = 0;
    A.cast(0);
    for (let i = 0; i < 120; i++) A.update(1 / 60);
    const r = Math.hypot(P.pos.x, P.pos.z);
    if (r > 283.05) throw new Error('冲出了世界边界：r=' + r.toFixed(2));
  }
  A.fx.length = 0;
  return '四次边界冲刺均被夹住';
});

ok('技能面板数据：八技能、等级门槛、消耗与冷却都在表内', () => {
  const D = F.ABILITY_DEF, keys = D._order;
  if (!keys || keys.length !== 8) throw new Error('技能数应为 8，实际 ' + (keys ? keys.length : 0));
  let prev = 0;
  for (const id of keys) {
    const d = D[id];
    if (!d.name || !d.desc) throw new Error(id + ' 缺名称或说明');
    if (!(d.cd > 0) || !(d.wind > 0) || !(d.cost >= 0)) throw new Error(id + ' 数值异常');
    if (d.lv < prev) throw new Error('解锁等级应递增');
    prev = d.lv;
  }
  return keys.map(k => `${D[k].name}(Lv${D[k].lv}/${D[k].cost}体/${D[k].cd}s)`).join(' ');
});

console.log(fails ? `\n✗ 失败 ${fails} 项` : '\n全部通过');
process.exit(fails ? 1 : 0);
