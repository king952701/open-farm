/* ==========================================================================
 * 牧野田园 Open Farm  ·  家园建筑模块
 * 用大世界采集的材料制取「墙体 / 天花板 / 地板 / 门 / 门框 / 门锁 / 窗户 /
 * 楼梯 / 栏杆 / 横梁 / 梁柱 / 屋脊 / 斜屋顶 / 地基 / 台阶 / 储物箱 / 工作台」
 * 等建筑构配件，每种构件都有 中式 / 西方 / 古典 / 现代 四种外观风格。
 * 野外通过系统面板制取时：材料 + 50 金币/次手续费；站在自己的「工作台」旁
 * （或已建成的工坊旁）可免除手续费。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp;

  const pt = (g, c, t, r, s) => ({ g, c, t, r, s });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 10, 1);
  const cone = (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 4, 1);
  const merge = (arr) => F.mergeParts(arr);

  /* ============================ 四种风格 ============================ */
  const STYLES = (F.HOME_STYLES = {
    chinese: {
      id: 'chinese', name: '中式', icon: '中', mul: 1.0, extra: { rope: 1 },
      note: '朱柱黛瓦 · 飞檐格栅 · 万字纹 ',
      pal: { post: 0x9b3b2e, beam: 0x7c4a2a, wall: 0xe8dcbe, trim: 0xd8a13a, roof: 0x3f4a52, floor: 0x8a5a34, metal: 0xc8a44a, glass: 0xbfe3ea, stone: 0x9a9285 },
    },
    western: {
      id: 'western', name: '西方', icon: '西', mul: 1.05, extra: { stone: 2 },
      note: '白石圆柱 · 拱券门窗 · 缓坡瓦顶',
      pal: { post: 0xe8e2d2, beam: 0xc9bfae, wall: 0xf2ece0, trim: 0xd8c9a8, roof: 0x8a5a46, floor: 0xb9a98c, metal: 0xc8ccd2, glass: 0xcfe8f0, stone: 0xb0a898 },
    },
    classic: {
      id: 'classic', name: '古典', icon: '古', mul: 1.15, extra: { bronze: 1 },
      note: '深色木筋 · 铜饰雕纹 · 陡坡重瓦',
      pal: { post: 0x6b4a30, beam: 0x54351f, wall: 0xd9c8a8, trim: 0xd4af37, roof: 0x5a4a3a, floor: 0x7a5636, metal: 0xd9b45a, glass: 0xcfd8e6, stone: 0x8d8677 },
    },
    modern: {
      id: 'modern', name: '现代', icon: '现', mul: 1.1, extra: { iron_ingot: 1 },
      note: '清水水泥 · 大幅玻璃 · 平顶简洁',
      pal: { post: 0xbfc4c9, beam: 0xd8dce0, wall: 0xe8eaec, trim: 0x9aa4ac, roof: 0x8f969c, floor: 0xb4b8bc, metal: 0xa8b0b8, glass: 0xaee4f4, stone: 0x9fa4a8 },
    },
  });

  /* ============================ 分组 ============================ */
  const GROUPS = (F.HOME_GROUPS = [
    { id: 'base', name: '地基与框架' },
    { id: 'wall', name: '墙体与门窗' },
    { id: 'roof', name: '屋顶与楼梯' },
    { id: 'life', name: '储物与设施' },
  ]);

  const FEE = 50;   /* 野外通过系统面板制取的手续费（金币 / 次） */

  /* ============================ 构件几何 ============================ */
  const geoCache = {};
  function cached(k, fn) { if (!geoCache[k]) geoCache[k] = fn(); return geoCache[k]; }

  /* ---- 通用：格栅窗芯（中式万字 / 古典小格 / 现代大格） ---- */
  function lattice(w, h, st, pal) {
    const a = [];
    if (st === 'chinese') {
      for (let i = -2; i <= 2; i++) {
        a.push(pt(box(0.05, h * 0.94, 0.05), pal.post, [i * (w / 5), 0, 0]));
        a.push(pt(box(w * 0.94, 0.05, 0.05), pal.post, [0, i * (h / 5), 0]));
      }
    } else if (st === 'classic') {
      for (let i = -1; i <= 1; i += 2) a.push(pt(box(0.06, h * 0.9, 0.05), pal.beam, [i * w * 0.22, 0, 0]));
      for (let i = -1; i <= 1; i += 2) a.push(pt(box(w * 0.9, 0.06, 0.05), pal.beam, [0, i * h * 0.22, 0]));
    } else if (st === 'modern') {
      a.push(pt(box(0.05, h * 0.96, 0.05), pal.trim, [0, 0, 0]));
    } else {
      a.push(pt(box(0.05, h * 0.96, 0.05), pal.trim, [0, 0, 0]));
      a.push(pt(box(w * 0.96, 0.05, 0.05), pal.trim, [0, 0, 0]));
    }
    return a;
  }

  const PARTS = (F.HOME_PARTS = {
    /* ------------------------- 地基与框架 ------------------------- */
    foundation: {
      name: '地基', grp: 'base', size: [4, 4], h: 0.4, noClip: true, deck: 0.34, base: { stone: 8, brick: 2 },
      desc: '整平地块并抬高室内地面，墙体的落脚之处。',
      core(pal, st) {
        const a = [pt(box(4.0, 0.30, 4.0), st === 'modern' ? pal.stone : pal.beam, [0, 0.15, 0])];
        a.push(pt(box(4.2, 0.16, 4.2), pal.stone, [0, 0.02, 0]));
        for (let i = 0; i < 4; i++) {
          const x = (i % 2 ? 1 : -1) * 1.86, z = (i < 2 ? 1 : -1) * 1.86;
          a.push(pt(box(0.34, 0.40, 0.34), pal.stone, [x, 0.24, z]));
        }
        if (st === 'chinese') a.push(pt(box(4.3, 0.10, 4.3), pal.trim, [0, 0.31, 0]));
        return a;
      },
    },
    floor: {
      name: '地板', grp: 'base', size: [4, 4], h: 0.3, noClip: true, deck: 0.26, base: { wood: 6, board: 2 },
      desc: '室内地面：拼花木板 / 石板，站在上面即为二楼平台。',
      core(pal, st) {
        const a = [];
        if (st === 'western' || st === 'chinese') {
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
            const c = (i + j) % 2 ? pal.floor : pal.stone;
            a.push(pt(box(0.94, 0.14, 0.94), c, [-1.5 + i, 0.07, -1.5 + j]));
          }
        } else {
          for (let i = 0; i < 8; i++) a.push(pt(box(3.9, 0.14, 0.46), i % 2 ? pal.floor : pal.beam, [0, 0.07, -1.75 + i * 0.5]));
          a.push(pt(box(3.9, 0.10, 3.9), pal.beam, [0, -0.02, 0]));
        }
        return a;
      },
    },
    pillar: {
      name: '梁柱', grp: 'base', size: [0.6, 0.6], h: 3.2, base: { wood: 4, board: 1 },
      desc: '承重立柱：朱漆木柱 / 白石圆柱，撑起横梁与屋顶。',
      core(pal, st) {
        const a = [pt(box(0.62, 0.20, 0.62), pal.stone, [0, 0.10, 0])];
        if (st === 'western') {
          a.push(pt(cyl(0.22, 0.26, 2.80, 14), pal.post, [0, 1.60, 0]));
          a.push(pt(box(0.62, 0.22, 0.62), pal.post, [0, 3.02, 0]));
        } else if (st === 'modern') {
          a.push(pt(box(0.34, 3.00, 0.34), pal.post, [0, 1.70, 0]));
        } else {
          a.push(pt(cyl(0.20, 0.24, 2.90, 10), pal.post, [0, 1.65, 0]));
          a.push(pt(box(0.56, 0.24, 0.56), pal.trim, [0, 3.10, 0]));
        }
        return a;
      },
    },
    beam: {
      name: '横梁', grp: 'base', size: [4, 0.3], h: 0.4, base: { wood: 3, board: 2 },
      desc: '横向承重梁，架在两根柱子之间，可托住屋顶。',
      core(pal, st) {
        const a = [pt(box(4.0, 0.30, 0.28), pal.beam, [0, 0, 0])];
        a.push(pt(box(0.30, 0.42, 0.34), pal.beam, [-1.9, -0.10, 0]));
        a.push(pt(box(0.30, 0.42, 0.34), pal.beam, [1.9, -0.10, 0]));
        if (st === 'chinese') {
          for (let i = -1; i <= 1; i++) a.push(pt(box(0.16, 0.34, 0.32), pal.post, [i * 1.2, 0.20, 0]));
        } else if (st === 'classic') {
          a.push(pt(box(4.0, 0.08, 0.32), pal.metal, [0, 0.18, 0]));
        }
        return a;
      },
    },
    ceiling: {
      name: '天花板', grp: 'base', size: [4, 4], h: 0.3, noClip: true, base: { wood: 4, board: 2 },
      desc: '封顶板材：藻井 / 井格 / 平吊顶，让屋子真正成型。',
      core(pal, st) {
        const a = [pt(box(4.0, 0.18, 4.0), pal.wall, [0, 0.06, 0])];
        if (st === 'chinese') {
          for (let i = -1; i <= 1; i++) {
            a.push(pt(box(3.9, 0.14, 0.24), pal.post, [0, -0.10, i * 1.3]));
            a.push(pt(box(0.24, 0.14, 3.9), pal.post, [i * 1.3, -0.10, 0]));
          }
          a.push(pt(box(1.2, 0.10, 1.2), pal.trim, [0, -0.20, 0]));
        } else if (st === 'classic') {
          for (let i = 0; i < 4; i++) a.push(pt(box(0.30, 0.20, 4.0), pal.beam, [-1.5 + i, -0.12, 0]));
        } else {
          a.push(pt(box(3.9, 0.10, 3.9), pal.trim, [0, -0.06, 0]));
        }
        return a;
      },
    },

    /* ------------------------- 墙体与门窗 ------------------------- */
    wall: {
      name: '墙体', grp: 'wall', size: [4, 0.34], h: 3.0, base: { wood: 6, board: 2, rope: 1 },
      desc: '4 米一段的墙体，三种立面造型；转角处两面墙可直接拼合。',
      core(pal, st) {
        const a = [pt(box(4.0, 2.90, 0.30), pal.wall, [0, 1.45, 0])];
        a.push(pt(box(4.1, 0.22, 0.38), pal.beam, [0, 0.11, 0]));
        a.push(pt(box(4.1, 0.22, 0.38), pal.beam, [0, 2.79, 0]));
        if (st === 'chinese') {
          for (let i = -1; i <= 1; i++) a.push(pt(box(0.22, 2.90, 0.34), pal.post, [i * 1.4, 1.45, 0]));
          a.push(pt(box(4.2, 0.16, 0.44), pal.trim, [0, 2.96, 0]));
        } else if (st === 'classic') {
          for (let i = -1; i <= 1; i++) a.push(pt(box(0.20, 2.90, 0.36), pal.beam, [i * 1.4, 1.45, 0]));
          a.push(pt(box(4.0, 0.20, 0.36), pal.beam, [0, 1.45, 0]));
        } else if (st === 'western') {
          for (let i = -1; i <= 1; i += 2) a.push(pt(box(0.30, 2.90, 0.36), pal.post, [i * 1.7, 1.45, 0]));
          a.push(pt(box(4.2, 0.20, 0.44), pal.post, [0, 2.96, 0]));
        } else {
          a.push(pt(box(4.0, 0.10, 0.36), pal.trim, [0, 1.45, 0]));
          a.push(pt(box(4.2, 0.12, 0.40), pal.stone, [0, 2.96, 0]));
        }
        return a;
      },
    },
    window: {
      name: '窗户', grp: 'wall', size: [1.8, 0.3], h: 1.8, base: { wood: 2, board: 1, glass: 1 },
      desc: '透光窗：格栅窗芯 + 玻璃，锁住风雨的同时留住光。',
      core(pal, st) {
        const a = [
          pt(box(1.80, 0.18, 0.24), pal.trim, [0, -0.92, 0]),
          pt(box(1.80, 0.18, 0.24), pal.trim, [0, 0.92, 0]),
          pt(box(0.18, 1.80, 0.24), pal.trim, [-0.92, 0, 0]),
          pt(box(0.18, 1.80, 0.24), pal.trim, [0.92, 0, 0]),
          pt(box(1.62, 1.62, 0.10), pal.glass, [0, 0, 0]),
        ];
        a.push(...lattice(1.6, 1.6, st, pal));
        if (st === 'western') a.push(pt(box(2.0, 0.14, 0.40), pal.post, [0, -1.02, 0]));
        if (st === 'chinese') a.push(pt(box(2.1, 0.14, 0.34), pal.post, [0, 1.04, 0]));
        return a;
      },
    },
    frame: {
      name: '门框', grp: 'wall', size: [2.4, 0.36], h: 2.8, base: { wood: 4, board: 2 },
      desc: '门洞框架：装上门与门锁后即为可通行的出入口。',
      core(pal, st) {
        const a = [
          pt(box(0.30, 2.80, 0.36), pal.trim, [-1.20, 1.40, 0]),
          pt(box(0.30, 2.80, 0.36), pal.trim, [1.20, 1.40, 0]),
        ];
        if (st === 'western') a.push(pt(cyl(1.20, 1.20, 0.36, 16), pal.trim, [0, 2.85, 0], [Math.PI / 2, 0, 0]));
        else if (st === 'chinese') {
          a.push(pt(box(2.90, 0.34, 0.42), pal.post, [0, 2.94, 0]));
          a.push(pt(box(2.30, 0.18, 0.46), pal.metal, [0, 2.66, 0]));
        } else if (st === 'classic') a.push(pt(box(2.70, 0.36, 0.42), pal.beam, [0, 2.92, 0]));
        else a.push(pt(box(2.70, 0.28, 0.40), pal.stone, [0, 2.92, 0]));
        return a;
      },
    },
    door: {
      name: '门', grp: 'wall', size: [2.0, 0.22], h: 2.5, base: { board: 3, rope: 1 },
      desc: '可开合的门扇：[F] 开关；装上「门锁」并上锁后他人无法推开。',
      interact: 'hb_door', homeDoor: true, swing: -1.62,
      core(pal, st) {
        const a = [pt(box(2.0, 0.06, 0.30), pal.stone, [0, 0.03, 0])];   /* 门槛 */
        const leaf = [];
        if (st === 'chinese') {
          leaf.push(pt(box(1.90, 2.40, 0.12), pal.post, [0.95, 1.20, 0]));
          leaf.push(pt(box(1.60, 1.90, 0.16), pal.trim, [0.95, 1.20, 0]));
          for (let i = 0; i < 5; i++) leaf.push(pt(box(0.08, 1.80, 0.18), pal.beam, [0.40 + i * 0.28, 1.20, 0]));
          for (let i = 0; i < 4; i++) leaf.push(pt(box(1.50, 0.08, 0.18), pal.beam, [0.95, 0.55 + i * 0.42, 0]));
          leaf.push(pt(cyl(0.10, 0.10, 0.10, 10), pal.metal, [1.72, 1.20, 0], [Math.PI / 2, 0, 0]));
        } else if (st === 'western') {
          leaf.push(pt(box(1.90, 2.20, 0.12), pal.beam, [0.95, 1.10, 0]));
          leaf.push(pt(box(1.40, 0.90, 0.16), pal.post, [0.95, 1.50, 0]));
          leaf.push(pt(box(1.40, 0.90, 0.16), pal.post, [0.95, 0.50, 0]));
          leaf.push(pt(box(0.16, 0.16, 0.16), pal.metal, [1.74, 1.10, 0]));
        } else if (st === 'classic') {
          leaf.push(pt(box(1.90, 2.40, 0.14), pal.beam, [0.95, 1.20, 0]));
          for (let i = 0; i < 4; i++) leaf.push(pt(box(1.70, 0.10, 0.18), pal.metal, [0.95, 0.35 + i * 0.62, 0]));
          leaf.push(pt(cyl(0.09, 0.09, 0.12, 10), pal.metal, [1.74, 1.20, 0], [Math.PI / 2, 0, 0]));
        } else {
          leaf.push(pt(box(1.92, 2.40, 0.10), pal.wall, [0.96, 1.20, 0]));
          leaf.push(pt(box(1.30, 0.90, 0.08), pal.glass, [0.96, 1.62, 0]));
          leaf.push(pt(box(0.90, 0.10, 0.14), pal.metal, [0.96, 0.90, 0]));
        }
        return { geo: merge(a), extra: [{ geo: merge(leaf), pos: [-0.95, 0, 0], hinge: true }], y: 0, sink: 0.02 };
      },
    },
    lock: {
      name: '门锁', grp: 'wall', size: [0.5, 0.4], h: 0.5, noClip: true, base: { iron_ingot: 1, bronze: 1 },
      desc: '装在门旁的锁具：[F] 上锁 / 解锁。上锁后门无法开启（还会顺手带上敞开的门）。',
      interact: 'hb_lock',
      core(pal, st) {
        const a = [pt(box(0.42, 0.50, 0.24), pal.metal, [0, 0.25, 0])];
        a.push(pt(cyl(0.11, 0.11, 0.30, 12), st === 'chinese' ? pal.metal : pal.trim, [0, 0.30, 0.16], [Math.PI / 2, 0, 0]));
        a.push(pt(box(0.10, 0.16, 0.08), 0x3a3a3a, [0, 0.22, 0.14]));
        if (st === 'chinese') a.push(pt(cyl(0.06, 0.06, 0.34, 8), pal.metal, [0, 0.52, 0], [0, 0, 0.5]));
        if (st === 'modern') a.push(pt(box(0.30, 0.10, 0.06), 0x6ad0a0, [0, 0.40, 0.15]));
        return a;
      },
    },

    /* ------------------------- 屋顶与楼梯 ------------------------- */
    roof: {
      name: '斜屋顶', grp: 'roof', size: [4, 4], h: 1.6, base: { wood: 6, board: 2, rope: 1 },
      desc: '双坡屋顶：中式飞檐 / 西式缓坡瓦 / 古典陡坡 / 现代平顶。',
      core(pal, st) {
        const a = [];
        if (st === 'modern') {
          a.push(pt(box(4.3, 0.24, 4.3), pal.roof, [0, 0.10, 0]));
          a.push(pt(box(4.4, 0.30, 0.20), pal.trim, [0, 0.30, 2.10]));
          a.push(pt(box(4.4, 0.30, 0.20), pal.trim, [0, 0.30, -2.10]));
        } else {
          const sp = st === 'classic' ? 0.72 : (st === 'chinese' ? 0.52 : 0.44);
          for (let s = -1; s <= 1; s += 2) {
            a.push(pt(box(4.2, 0.18, 2.55), st === 'chinese' ? pal.roof : pal.roof, [0, 0.62, s * 1.02], [s * sp, 0, 0]));
            /* 飞檐 / 檐口 */
            a.push(pt(box(4.3, 0.16, 0.34), pal.trim, [0, 0.62 - Math.cos(sp) * 0.10, s * 2.20], [s * sp * 0.9, 0, 0]));
          }
          if (st === 'chinese') {
            for (let s = -1; s <= 1; s += 2) {
              a.push(pt(box(0.50, 0.14, 0.90), pal.trim, [-2.05, 0.68, s * 1.60], [0, 0, -0.30]));
              a.push(pt(box(0.50, 0.14, 0.90), pal.trim, [2.05, 0.68, s * 1.60], [0, 0, -0.30]));
            }
          }
          a.push(pt(box(4.3, 0.30, 0.28), pal.roof, [0, 1.30, 0]));
        }
        return a;
      },
    },
    ridge: {
      name: '屋脊', grp: 'roof', size: [4, 0.7], h: 0.5, base: { brick: 2, wood: 2 },
      desc: '压在两坡屋顶交线上的脊饰，中式带吻兽、古典带铜饰。',
      core(pal, st) {
        const a = [pt(cyl(0.16, 0.16, 4.1, 10), pal.trim, [0, 0.16, 0], [0, 0, Math.PI / 2])];
        if (st === 'chinese') {
          a.push(pt(cone(0.22, 0.44, 4), pal.trim, [-2.05, 0.36, 0], [0, 0, 0]));
          a.push(pt(cone(0.22, 0.44, 4), pal.trim, [2.05, 0.36, 0], [0, 0, 0]));
        } else if (st === 'classic') {
          a.push(pt(box(4.1, 0.10, 0.40), pal.metal, [0, 0.28, 0]));
        } else if (st === 'western') {
          a.push(pt(box(0.60, 0.30, 0.46), pal.post, [0, 0.30, 0]));
        }
        return a;
      },
    },
    stairs: {
      name: '楼梯', grp: 'roof', size: [2, 4], h: 2.6, noClip: true, base: { wood: 8, board: 2, rope: 1 },
      desc: '上下楼的通道，六段踏步加扶手；与「地板」搭配可搭出二层。',
      core(pal, st) {
        const a = [];
        for (let i = 0; i < 6; i++) {
          const y = 0.18 + i * 0.40;
          a.push(pt(box(1.70, 0.18, 0.62), pal.floor, [0, y, 1.6 - i * 0.64]));
          a.push(pt(box(1.70, 0.34, 0.16), pal.beam, [0, y - 0.16, 1.28 - i * 0.64]));
        }
        const rail = st === 'modern' ? pal.metal : pal.post;
        for (let i = 0; i < 3; i++) {
          const z = 1.6 - i * 1.28;
          a.push(pt(box(0.14, 0.80, 0.14), rail, [-0.78, 0.9 + i * 0.80, z]));
          a.push(pt(box(0.14, 0.80, 0.14), rail, [0.78, 0.9 + i * 0.80, z]));
        }
        a.push(pt(box(0.12, 0.12, 3.90), rail, [-0.78, 2.30, -0.30], [0.62, 0, 0]));
        a.push(pt(box(0.12, 0.12, 3.90), rail, [0.78, 2.30, -0.30], [0.62, 0, 0]));
        return a;
      },
    },
    step: {
      name: '台阶', grp: 'roof', size: [2, 1], h: 0.35, noClip: true, deck: 0.32, base: { stone: 4, brick: 1 },
      desc: '门前一步台阶，站上去会抬高落脚点，方便接驳门槛与平台。',
      core(pal, st) {
        const a = [pt(box(2.0, 0.30, 1.0), pal.stone, [0, 0.15, 0])];
        a.push(pt(box(2.1, 0.12, 0.16), pal.trim, [0, 0.30, 0.50]));
        if (st === 'chinese') a.push(pt(box(2.1, 0.10, 1.1), pal.trim, [0, 0.05, 0]));
        return a;
      },
    },
    railing: {
      name: '栏杆', grp: 'roof', size: [4, 0.24], h: 1.1, base: { wood: 3, rope: 1 },
      desc: '平台边的安全护栏，中式万字栏、现代金属横栏。',
      core(pal, st) {
        const a = [
          pt(box(0.16, 1.10, 0.16), pal.post, [-1.90, 0.55, 0]),
          pt(box(0.16, 1.10, 0.16), pal.post, [1.90, 0.55, 0]),
          pt(box(4.1, 0.14, 0.22), pal.beam, [0, 1.05, 0]),
          pt(box(4.1, 0.10, 0.20), pal.beam, [0, 0.55, 0]),
        ];
        if (st === 'chinese' || st === 'classic') {
          for (let i = -3; i <= 3; i++) a.push(pt(box(0.09, 0.90, 0.09), i % 2 ? pal.post : pal.trim, [i * 0.55, 0.50, 0]));
        } else if (st === 'modern') {
          for (let i = -3; i <= 3; i++) a.push(pt(box(0.05, 1.00, 0.05), pal.metal, [i * 0.55, 0.50, 0]));
        } else {
          for (let i = -4; i <= 4; i++) a.push(pt(cyl(0.055, 0.055, 0.95, 6), pal.post, [i * 0.45, 0.50, 0]));
        }
        return a;
      },
    },

    /* ------------------------- 储物与设施 ------------------------- */
    chest: {
      name: '储物箱', grp: 'life', size: [1.3, 1.0], h: 0.9, base: { wood: 6, board: 2, rope: 1 },
      desc: '家园储物：[F] 打开自己的仓库存取（与收货仓仓储互通）。',
      interact: 'hb_chest',
      core(pal, st) {
        const a = [
          pt(box(1.20, 0.66, 0.90), pal.beam, [0, 0.33, 0]),
          pt(box(1.26, 0.22, 0.96), st === 'chinese' ? pal.post : pal.trim, [0, 0.76, 0]),
          pt(box(0.30, 0.24, 0.10), pal.metal, [0, 0.50, 0.48]),
        ];
        a.push(pt(box(1.24, 0.10, 0.94), pal.stone, [0, 0.05, 0]));
        if (st === 'classic') {
          for (let i = -1; i <= 1; i += 2) a.push(pt(box(0.10, 0.70, 0.96), pal.metal, [i * 0.55, 0.35, 0]));
        }
        if (st === 'modern') a.push(pt(box(1.0, 0.06, 0.7), pal.trim, [0, 0.88, 0]));
        return a;
      },
    },
    bench: {
      name: '工作台', grp: 'life', size: [2.2, 1.0], h: 1.0, base: { wood: 8, board: 4, iron_ingot: 1 },
      desc: '木工作业台：[F] 打开加工台；站在它旁边制取家园构件可免除 50 金币手续费。',
      interact: 'hb_bench',
      core(pal, st) {
        const a = [
          pt(box(2.10, 0.18, 0.95), pal.floor, [0, 0.92, 0]),
          pt(box(0.16, 0.90, 0.16), pal.beam, [-0.92, 0.45, -0.36]),
          pt(box(0.16, 0.90, 0.16), pal.beam, [0.92, 0.45, -0.36]),
          pt(box(0.16, 0.90, 0.16), pal.beam, [-0.92, 0.45, 0.36]),
          pt(box(0.16, 0.90, 0.16), pal.beam, [0.92, 0.45, 0.36]),
          pt(box(2.00, 0.34, 0.50), pal.beam, [0, 0.30, -0.10]),
          pt(box(2.00, 0.10, 0.16), pal.metal, [0, 1.02, -0.30]),
        ];
        /* 背上挂着的工具 */
        a.push(pt(box(0.12, 0.44, 0.10), pal.metal, [-0.60, 1.30, -0.42]));
        a.push(pt(box(0.34, 0.10, 0.10), pal.metal, [-0.48, 1.50, -0.42]));
        a.push(pt(box(0.10, 0.36, 0.10), pal.metal, [0.30, 1.28, -0.42]));
        return a;
      },
    },
  });

  /* ============================ 注册到 BUILDS ============================ */
  const HB = (F.HomeBuild = {
    fee: FEE, style: 'chinese', placed: 0,

    /* 材料 × 风格系数 + 风格附加材料 */
    materials(partId, styleId) {
      const p = PARTS[partId], s = STYLES[styleId] || STYLES.chinese;
      const out = {};
      for (const k in p.base) out[k] = Math.max(1, Math.round(p.base[k] * s.mul));
      for (const k in s.extra) out[k] = (out[k] || 0) + s.extra[k];
      return out;
    },

    id(partId, styleId) { return 'hb_' + partId + '_' + styleId; },

    /* 是否在自己的「工作台 / 工坊」旁：免除手续费 */
    atBench() {
      const B = F.Builds;
      if (!B || !B.grid || !F.Player) return false;
      const P = F.Player.pos;
      const near = B.nearBuildings(P.x, P.z, 8);
      for (const b of near) {
        if (b.id === 'workshop') return true;
        if (b.def && b.def.home && b.def.interact === 'hb_bench') return true;
      }
      return false;
    },

    /* 有效造价：材料 +（野外制取时的 50 金币手续费） */
    effCost(partId, styleId) {
      const c = HB.materials(partId, styleId);
      if (!HB.atBench()) c.coins = FEE;
      return c;
    },

    /* 刷新所有 def 的 cost（放置前的可负担判断与提示都读它） */
    refreshCost() {
      const free = HB.atBench();
      for (const pid in PARTS) for (const sid in STYLES) {
        const d = F.PROPS.BUILDS[HB.id(pid, sid)];
        if (!d) continue;
        const c = HB.materials(pid, sid);
        if (!free) c.coins = FEE;
        d.cost = c;
      }
    },

    /* 门的锁：附近上锁的门锁 */
    lockNear(x, z, r) {
      let best = null, bd = 1e9;
      for (const b of F.Builds.list) {
        if (!b.def || b.def.interact !== 'hb_lock') continue;
        const d = Math.hypot(b.x - x, b.z - z);
        if (d < (r || 2.6) && d < bd) { bd = d; best = b; }
      }
      return best;
    },
    isLocked(b) { const l = HB.lockNear(b.x, b.z); return l ? !!l.locked : false; },

    init() {
      const B = F.PROPS.BUILDS;
      for (const sid in STYLES) {
        const s = STYLES[sid];
        for (const pid in PARTS) {
          const p = PARTS[pid];
          const grp = GROUPS.find(g => g.id === p.grp) || GROUPS[0];
          const id = HB.id(pid, sid);
          B[id] = {
            id, home: true, part: pid, style: sid,
            name: p.name + '·' + s.name, icon: s.icon,
            cat: '家园 · ' + grp.name,
            cost: (function () { const c = HB.materials(pid, sid); c.coins = FEE; return c; })(),
            size: p.size.slice(), r: Math.max(p.size[0], p.size[1]) * 0.5, h: p.h,
            snap: 1, noClip: !!p.noClip, homeDoor: !!p.homeDoor, swing: p.swing,
            deck: p.deck, interact: p.interact,
            desc: p.desc + '（风格：' + s.name + ' —— ' + s.note + '）',
            build() {
              return cached(id, () => {
                const pal = STYLES[sid].pal;
                const built = p.core(pal, sid);
                if (built && built.geo) return built;
                return { geo: merge(built), y: 0, sink: 0.02 };
              });
            },
          };
        }
      }
      HB.refreshCost();
    },

    /* 进入摆放模式（先按其当前有效造价，放置时才真正扣除） */
    start(partId, styleId) {
      HB.style = styleId;
      const id = HB.id(partId, styleId);
      const d = F.PROPS.BUILDS[id];
      if (!d) { F.UI.toast('该构件尚未解锁', 'bad'); return; }
      d.cost = HB.effCost(partId, styleId);
      F.UI.closePanel();
      F.Inter.startBuild(id);
      const extra = d.cost.coins ? '（手续费 ' + d.cost.coins + ' 金币）' : '（工作台旁：免手续费）';
      F.UI.toast('开始摆放：' + d.name + ' ' + extra, 'info');
    },

    /* ------------------------ 家园建造面板 ------------------------ */
    panel() {
      const { body: pb } = F.UI.panelShell('家园建造 · 构配件',
        '选定风格后点「制取并摆放」 · 材料在放置时扣除');
      F.UI.setPanel('homebuild');

      const free = HB.atBench();
      pb.appendChild(F.el('div', 'pstat',
        '手续费：' + (free ? '工作台旁 · 本次免收' : FEE + ' 金币 / 件 · 站在工作台旁可免除') +
        ' · 金币 ' + F.Game.coins + ' · 已建造 ' + HB.placed + ' 件'));

      /* 风格标签 */
      const stabs = F.el('div', 'ranktabs');
      for (const sid in STYLES) {
        const s = STYLES[sid];
        const t = F.el('div', 'rt' + (HB.style === sid ? ' on' : ''), s.name);
        t.dataset.tip = `<div class="tp-n">${s.name}风格</div><div class="tp-d">${s.note}</div>` +
          `<div class="tp-p">附加材料：${Object.keys(s.extra).map(k => F.itemName(k) + '×' + s.extra[k]).join('、')} · 造价系数 ${s.mul}</div>`;
        t.onclick = () => { HB.style = sid; HB.panel(); };
        stabs.appendChild(t);
      }
      pb.appendChild(stabs);

      /* 分组 → 卡片 */
      for (const grp of GROUPS) {
        const arr = Object.keys(PARTS).filter(k => PARTS[k].grp === grp.id);
        if (!arr.length) continue;
        pb.appendChild(F.el('div', 'pcat', grp.name));
        const grid = F.el('div', 'cards');
        for (const pid of arr) {
          const p = PARTS[pid];
          const cost = HB.effCost(pid, HB.style);
          const can = F.Game.canAfford(cost);
          const c = F.el('div', 'card' + (can ? '' : ' no'));
          c.dataset.tip = `<div class="tp-n">${p.name}·${STYLES[HB.style].name}</div>` +
            `<div class="tp-d">${p.desc}</div>` +
            `<div class="tp-p">尺寸 ${p.size[0]}×${p.size[1]} 米 · 造价：${F.Game.costText(cost)}</div>`;
          c.innerHTML = `<div class="tt">${p.name} <span class="ah-q">${STYLES[HB.style].name}</span></div>
            <div class="ds">${p.desc}</div>
            <div class="ds">${F.Game.costText(cost)}${cost.coins ? '（含手续费 ' + cost.coins + '）' : '（免手续费）'}</div>`;
          const b = F.el('button', 'btn' + (can ? ' ok' : ''), can ? '制取并摆放' : '材料不足');
          b.onclick = () => HB.start(pid, HB.style);
          c.appendChild(b);
          grid.appendChild(c);
        }
        pb.appendChild(grid);
      }
      pb.appendChild(F.el('div', 'tip',
        '流程：选风格 → 点「制取并摆放」→ 移动鼠标选位（[R] 旋转）→ 左键落位扣费；[Esc] 取消。[X] 拆除可回收一半材料。'));
    },

    saveData() { return { placed: HB.placed }; },
    loadData(d) { if (d && d.placed) HB.placed = d.placed; },
    reset() { HB.placed = 0; },
  });
})();
