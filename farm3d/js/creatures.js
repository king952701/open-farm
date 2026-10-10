/* ==========================================================================
 * 牧野田园 Open Farm  ·  生物模型：人物 / 动物 / 怪物
 * 全部由 Three.js 内置几何体 + 顶点色拼装：无贴图、无骨骼、无外部资源。
 * 对外暴露 createPlayerModel / createAnimalModel / createMonsterModel 三个入口，
 * props.js 与 combat.js 只负责调用，不再各写一遍零件表。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;

  const pt = (g, c, t, r, s) => ({ g, c, t, r, s });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
  const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 8, h || 6);
  const cone = (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 6, 1);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 8, 1);

  const EYE = 0x22201c;
  /* 挂在指定父节点上的合并网格，玩家/动物仍按部件分组以便旋转动画 */
  function mesh(parts, parent) {
    const m = new THREE.Mesh(F.mergeParts(parts), F.MATS.std);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  /* 绕某点旋转的肢体支点：animation 直接改 rotation.x */
  function limb(g, x, y, z, parts) {
    const piv = new THREE.Group();
    piv.position.set(x, y, z);
    mesh(parts, piv);
    g.add(piv);
    return piv;
  }

  /* ============================ 人物 ============================ */
  /* ponytail: 头身比 ≈1:5 用「分段圆柱 + 肩/手圆球」堆出来，不引 lathe/骨骼 */
  function createPlayerModel(opt) {
    opt = opt || {};
    const skin = opt.skin || 0xe8c39d, shirt = opt.shirt || 0x6ba8d6;
    const pants = opt.pants || 0x3f4a5e;
    const shirt2 = new THREE.Color().setHex(shirt).offsetHSL(0, 0, -0.07).getHex();
    const g = new THREE.Group();

    /* 躯干：颈 → 胸（宽）→ 收腰 → 胯，四级轮廓，不再是等粗方柱 */
    const torso = mesh([
      pt(cyl(0.072, 0.078, 0.07, 6), skin, [0, 1.37, 0]),
      pt(cyl(0.20, 0.225, 0.32, 8), shirt, [0, 1.20, 0]),
      pt(cyl(0.17, 0.20, 0.14, 8), shirt2, [0, 1.02, 0]),
      pt(cyl(0.205, 0.19, 0.13, 8), pants, [0, 0.90, 0]),
      pt(box(0.30, 0.42, 0.16), 0x8a6a4a, [0, 1.06, -0.22]),
      pt(box(0.10, 0.10, 0.10), 0xc9a878, [0, 1.02, 0.18]),
      pt(sph(0.086, 6, 5), shirt, [-0.21, 1.30, 0]),
      pt(sph(0.086, 6, 5), shirt, [0.21, 1.30, 0]),
    ], g);

    const headG = new THREE.Group();
    headG.position.set(0, 1.48, 0);
    g.add(headG);
    mesh([
      pt(sph(0.175, 10, 7), skin, [0, 0.02, 0], [0, 0, 0], [1, 1.06, 0.94]),
      pt(sph(0.184, 10, 6), 0x4a3524, [0, 0.09, -0.01], [0, 0, 0], [1, 0.62, 1]),
      pt(sph(0.030, 5, 4), EYE, [0.072, 0.01, 0.152]),
      pt(sph(0.030, 5, 4), EYE, [-0.072, 0.01, 0.152]),
      pt(cyl(0.272, 0.296, 0.026, 14), 0xd9c07a, [0, 0.15, 0]),
      pt(cone(0.185, 0.17, 14), 0xd9c07a, [0, 0.23, 0]),
      pt(sph(0.034, 6, 4), 0xc9b06a, [0, 0.315, 0]),
    ], headG);

    const mkArm = (sx) => limb(g, sx * 0.21, 1.30, 0, [
      pt(cyl(0.072, 0.068, 0.28, 6), shirt, [0, -0.14, 0]),
      pt(cyl(0.056, 0.052, 0.26, 6), skin, [0, -0.41, 0]),
      pt(sph(0.062, 6, 5), skin, [0, -0.55, 0]),
    ]);
    const mkLeg = (sx) => limb(g, sx * 0.115, 0.86, 0, [
      pt(cyl(0.098, 0.088, 0.36, 6), pants, [0, -0.18, 0]),
      pt(cyl(0.078, 0.066, 0.40, 6), pants, [0, -0.56, 0]),
      pt(box(0.14, 0.16, 0.22), 0x5a4a38, [0, -0.78, 0.03]),
    ]);
    return { group: g, head: headG, arms: [mkArm(-1), mkArm(1)], legs: [mkLeg(-1), mkLeg(1)], torso };
  }

  /* ============================ 动物 ============================ */
  /* ponytail: 一套「躯干椭球 + 圆台腿 + 头 + 耳 + 尾」模板，
     不同动物只改配置（尺寸 / 配色 / 耳朵形状 / 特征开关），不逐种单独建模 */
  const SPEC = {
    cow: {
      c: 0xf2efe6, c2: 0x8d6a4a, hoof: 0x2f2620, leg: 0.72, hip: 0.72, sp: [0.28, 0.52], rad: 0.11,
      br: 0.50, bs: [0.92, 0.90, 1.42], bt: [0, 1.02, 0],
      spots: [[0.30, [0.9, 0.7, 0.9], [0.28, 1.18, 0.10]], [0.26, [1, 0.8, 0.9], [-0.30, 1.06, -0.34]]],
      headY: 1.30, headZ: 0.92, hr: 0.23, snout: 0xd6a9a0, ears: 'round', horns: 1, tail: 0.44, udder: 1, h: 1.5,
    },
    sheep: {
      c: 0xf4f1e8, c2: 0x4a443c, hoof: 0x3a352e, leg: 0.60, hip: 0.60, sp: [0.22, 0.34], rad: 0.075,
      br: 0.54, bs: [1.02, 0.96, 1.16], bt: [0, 0.96, 0], wool: 1, dark: 0x4a443c,
      headY: 1.02, headZ: 0.66, hr: 0.15, ears: 'round', tail: 0.14, h: 1.15,
    },
    chicken: {
      c: 0xf0ece2, c2: 0xe8a33c, hoof: 0xe8a33c, leg: 0.28, hip: 0.28, sp: [0.10, 0.02], rad: 0.032, legs: 2,
      br: 0.28, bs: [1, 0.92, 1.28], bt: [0, 0.44, 0],
      headY: 0.74, headZ: 0.22, hr: 0.155, beak: 1, comb: 1, wing: 1, tail: 0.24, h: 0.75,
    },
    /* 兔 / 鹿 / 狼 三种配置已就绪，当前世界暂不生成，日后加野外或宠物时直接套用 */
    rabbit: {
      c: 0xf2f0ea, c2: 0xd8c8c0, hoof: 0xd8c8c0, leg: 0.22, hip: 0.26, sp: [0.13, 0.20], rad: 0.05,
      br: 0.26, bs: [1, 0.95, 1.25], bt: [0, 0.40, 0],
      headY: 0.58, headZ: 0.30, hr: 0.13, snout: 0xe0bcc0, ears: 'long', tail: 0.10, h: 0.5,
    },
    deer: {
      c: 0x9a6a3c, c2: 0x6a4526, hoof: 0x3a2a18, leg: 0.74, hip: 0.80, sp: [0.20, 0.44], rad: 0.062,
      br: 0.42, bs: [0.92, 0.92, 1.40], bt: [0, 1.06, 0],
      headY: 1.34, headZ: 0.86, hr: 0.17, snout: 0x6a4526, ears: 'point', antlers: 1, tail: 0.16, h: 1.2,
    },
    wolf: {
      c: 0x8a8f96, c2: 0x6a6f76, hoof: 0x555a60, leg: 0.44, hip: 0.48, sp: [0.18, 0.34], rad: 0.062,
      br: 0.34, bs: [0.92, 0.90, 1.50], bt: [0, 0.62, 0],
      headY: 0.74, headZ: 0.56, hr: 0.16, snout: 0x6a6f76, ears: 'point', tail: 0.40, h: 0.95,
    },
  };

  /* 耳朵：狼尖锥 / 兔长椭球 / 牛羊圆片，三种形状足够区分外形 */
  function earParts(kind, x, y, c) {
    if (kind === 'point') return [pt(cone(0.075, 0.17, 4), c, [x, y, 0])];
    if (kind === 'long') return [pt(sph(0.062, 6, 5), c, [x, y + 0.10, -0.02], [0.25, 0, x > 0 ? 0.2 : -0.2], [1, 2.6, 0.7])];
    return [pt(ico(0.088, 1), c, [x, y, -0.02], [0, 0, x > 0 ? -0.35 : 0.35], [1, 0.9, 0.5])];
  }

  function createAnimalModel(type) {
    const s = SPEC[type] || SPEC.cow;
    const g = new THREE.Group();
    const hx = s.br * s.bs[0], hy = s.br * s.bs[1], hz = s.br * s.bs[2];
    const parts = [pt(ico(s.br, 1), s.c, s.bt, [0, 0.3, 0], s.bs)];

    for (const [r, sc, t] of (s.spots || [])) parts.push(pt(ico(r, 1), s.c2, t, [0, 0.4, 0], sc));
    if (s.wool) {                                     /* 绵羊：叠几坨绒球代替光板椭球 */
      for (const t of [[0, 0.98, -0.30], [0, 1.02, 0.14], [0.30, 0.86, -0.10], [-0.30, 0.86, -0.10]]) {
        parts.push(pt(ico(0.26, 1), t[2] > 0 ? 0xf7f4ec : 0xefeade, t, [0, 0.6, 0], [1.1, 1, 1.1]));
      }
    }
    if (s.udder) parts.push(pt(sph(0.13, 6, 5), 0xd6a9a0, [0, 0.72, 0.16], [0, 0, 0], [1.1, 0.8, 1.3]));
    if (s.wing) {                                     /* 鸡翅：两片压扁的球 */
      parts.push(pt(sph(0.15, 7, 5), 0xe8dfcb, [0.17, 0.42, 0.02], [0, 0, -0.3], [0.35, 1, 1.2]));
      parts.push(pt(sph(0.15, 7, 5), 0xe8dfcb, [-0.17, 0.42, 0.02], [0, 0, 0.3], [0.35, 1, 1.2]));
    }
    if (s.tail) {
      parts.push(pt(cyl(0.022 * (s.br / 0.5), 0.036 * (s.br / 0.5), s.tail, 5),
        s.c2, [0, s.bt[1] + hy * 0.4, -(hz + s.tail * 0.25)], [0.55, 0, 0]));
    }
    const bodyM = mesh(parts, g);

    /* 腿：上粗下细的圆台 + 蹄；四足前后交替由上层动画旋转 */
    const legs = [], n = s.legs || 4;
    for (let i = 0; i < n; i++) {
      const x = (i % 2 ? s.sp[0] : -s.sp[0]);
      const z = n === 4 ? (i < 2 ? s.sp[1] : -s.sp[1]) : s.sp[1];
      legs.push(limb(g, x, s.hip, z, [
        pt(cyl(s.rad, s.rad * 0.82, s.leg, 6), s.c2, [0, -s.leg / 2, 0]),
        pt(ico(s.rad * 1.4, 0), s.hoof, [0, -s.leg + 0.03, n === 2 ? 0.02 : 0], [0, 0, 0], [1.2, 0.7, n === 2 ? 1.4 : 1]),
      ]));
    }

    /* 头：圆润头骨 + 吻部 + 眼 + 耳 / 角 / 喙 */
    const head = new THREE.Group();
    head.position.set(0, s.headY, s.headZ);
    g.add(head);
    const hp = [
      pt(ico(s.hr, 1), s.dark || s.c, [0, 0, 0], [0, 0.2, 0], [1.1, 1, 1.15]),
      pt(sph(0.030, 5, 4), EYE, [s.hr * 0.55, s.hr * 0.22, s.hr * 0.78]),
      pt(sph(0.030, 5, 4), EYE, [-s.hr * 0.55, s.hr * 0.22, s.hr * 0.78]),
    ];
    if (s.snout) hp.push(pt(ico(s.hr * 0.62, 1), s.snout, [0, -s.hr * 0.30, s.hr * 1.05], [0, 0.2, 0], [1, 0.8, 0.9]));
    if (s.beak) hp.push(pt(cone(0.06, 0.15, 5), 0xe8a33c, [0, -0.02, s.hr * 1.15], [Math.PI / 2, 0, 0]));
    if (s.comb) hp.push(pt(box(0.05, 0.09, 0.16), 0xd8483c, [0, s.hr * 0.92, 0.02]));
    if (s.ears && s.ears !== 'none') hp.push(...earParts(s.ears, s.hr * 1.05, s.hr * 0.75, s.c2));
    if (s.horns) {                                    /* 牛角 */
      hp.push(pt(cone(0.045, 0.18, 5), 0xe8dccb, [s.hr * 1.05, s.hr * 0.60, -0.02], [0, 0, -0.55]));
      hp.push(pt(cone(0.045, 0.18, 5), 0xe8dccb, [-s.hr * 1.05, s.hr * 0.60, -0.02], [0, 0, 0.55]));
    }
    if (s.antlers) {                                  /* 鹿角：带一根分叉 */
      for (const sx of [0.6, -0.6]) {
        hp.push(pt(cone(0.035, 0.26, 4), 0xd8cbb4, [s.hr * sx, s.hr * 1.05, -0.02], [0, 0, sx > 0 ? -0.3 : 0.3]));
        hp.push(pt(cone(0.025, 0.13, 4), 0xd8cbb4, [s.hr * sx * 1.3, s.hr * 1.40, 0.02], [0.4, 0, sx > 0 ? -0.5 : 0.5]));
      }
    }
    mesh(hp, head);
    return { group: g, legs, head, body: bodyM, h: s.h };
  }

  /* ============================ 怪物 ============================ */
  /* ponytail: 怪物走 InstancedMesh（性能），返回的是合并几何体；
     因此只能整体倾斜/起伏做攻击动作，逐部件的骨骼动画要改渲染管线，不做 */
  const MON = {
    boar: () => ([
      pt(ico(0.54, 1), 0x7a5c40, [0, 0.66, 0], [0, 0, 0], [1.35, 0.9, 1.05]),   /* 不规则岩块躯干 */
      pt(ico(0.34, 1), 0x6a4c34, [0, 0.86, -0.24], [0, 0.4, 0], [1, 0.8, 1]),
      pt(ico(0.30, 1), 0x8a6a4a, [0, 0.70, 0.58], [0, 0, 0], [1, 0.95, 0.9]),
      pt(ico(0.16, 0), 0x4a3426, [0, 0.62, 0.84]),
      pt(cone(0.055, 0.26, 5), 0xf4efe4, [0.16, 0.66, 0.80], [1.45, 0, 0.35]),  /* 獠牙（攻击特征） */
      pt(cone(0.055, 0.26, 5), 0xf4efe4, [-0.16, 0.66, 0.80], [1.45, 0, -0.35]),
      pt(sph(0.045, 6, 4), 0xff5a3a, [0.13, 0.82, 0.74]),
      pt(sph(0.045, 6, 4), 0xff5a3a, [-0.13, 0.82, 0.74]),
      pt(cone(0.07, 0.24, 4), 0x5a4432, [0.18, 0.92, 0.30], [0, 0, -0.4]),
      pt(cone(0.07, 0.24, 4), 0x5a4432, [-0.18, 0.92, 0.30], [0, 0, 0.4]),
      pt(cyl(0.02, 0.035, 0.22, 5), 0x5a4432, [0, 0.74, -0.72], [0.5, 0, 0]),
      ...legs(0.26, 0.30, 0.36, 0x5a4432, 0.11),
    ]),
    wolf: () => ([
      pt(ico(0.48, 1), 0x7e848c, [0, 0.62, 0], [0, 0, 0], [1.42, 0.9, 0.92]),
      pt(ico(0.27, 1), 0x9aa0a8, [0, 0.74, 0.56], [0, 0, 0], [1, 0.95, 0.95]),
      pt(ico(0.13, 0), 0x5a6068, [0, 0.66, 0.82]),
      pt(cone(0.07, 0.20, 4), 0x9aa0a8, [0.13, 0.94, 0.48]),
      pt(cone(0.07, 0.20, 4), 0x9aa0a8, [-0.13, 0.94, 0.48]),
      pt(sph(0.04, 6, 4), 0xffd05a, [0.10, 0.80, 0.80]),
      pt(sph(0.04, 6, 4), 0xffd05a, [-0.10, 0.80, 0.80]),
      pt(cone(0.045, 0.14, 4), 0xf0ece0, [0.09, 0.70, 0.88], [1.4, 0, 0]),       /* 尖牙 */
      pt(cone(0.045, 0.14, 4), 0xf0ece0, [-0.09, 0.70, 0.88], [1.4, 0, 0]),
      pt(cyl(0.035, 0.06, 0.46, 5), 0x7e848c, [0, 0.70, -0.62], [0.45, 0, 0]),
      ...legs(0.21, 0.28, 0.42, 0x6a6f76, 0.10),
    ]),
    bear: () => ([
      pt(ico(0.80, 1), 0x6f4a2a, [0, 0.94, 0], [0, 0, 0], [1.2, 1.0, 1.1]),
      pt(ico(0.44, 1), 0x8a5c38, [0, 1.32, 0.64], [0, 0.3, 0], [1, 1, 0.95]),
      pt(ico(0.17, 0), 0x3a2a18, [0, 1.22, 0.96]),
      pt(sph(0.10, 6, 5), 0x8a5c38, [0.23, 1.58, 0.50]),
      pt(sph(0.10, 6, 5), 0x8a5c38, [-0.23, 1.58, 0.50]),
      pt(sph(0.05, 6, 4), 0xff7a3a, [0.10, 1.36, 0.86]),
      pt(sph(0.05, 6, 4), 0xff7a3a, [-0.10, 1.36, 0.86]),
      pt(cone(0.05, 0.12, 4), 0xf0ece0, [0.08, 1.20, 1.00], [1.5, 0, 0]),
      pt(cone(0.05, 0.12, 4), 0xf0ece0, [-0.08, 1.20, 1.00], [1.5, 0, 0]),
      pt(cone(0.06, 0.14, 5), 0x3a2a18, [0.24, 0.92, 0.86], [1.2, 0, 0.3]),       /* 大爪 */
      pt(cone(0.06, 0.14, 5), 0x3a2a18, [-0.24, 0.92, 0.86], [1.2, 0, -0.3]),
      ...legs(0.36, 0.42, 0.54, 0x6a4628, 0.13),
    ]),
    slime: () => ([
      pt(sph(0.54, 12, 7), 0x5fbe72, [0, 0.44, 0], [0, 0, 0], [1, 0.80, 1]),
      pt(sph(0.55, 12, 6), 0x74d08a, [0, 0.30, 0], [0, 0, 0], [1, 0.22, 1]),      /* 塌下去的底盘 */
      pt(sph(0.13, 6, 5), 0x1f2a22, [0.17, 0.56, 0.42]),
      pt(sph(0.13, 6, 5), 0x1f2a22, [-0.17, 0.56, 0.42]),
      pt(box(0.26, 0.05, 0.05), 0x1f2a22, [0, 0.40, 0.50]),
      pt(sph(0.10, 8, 6), 0xffffff, [-0.20, 0.66, 0.28], [0, 0, 0], [1, 0.7, 1]),
    ]),
    bandit: () => humanoid(0x5c4a3c, 0x3a342c, 0x2a2620, 0xe8c39d, 0xb0b4bc),
    guard: () => humanoid(0xdfe4ec, 0xb0b8c4, 0xc8d0dc, 0xe8c39d, 0xf0f4fa),
    boss_boar: () => ([
      pt(ico(0.58, 1), 0x5a3a20, [0, 0.72, 0], [0, 0, 0], [1.35, 0.92, 1.05]),
      pt(ico(0.38, 1), 0x4a2e18, [0, 0.94, -0.26], [0, 0.4, 0], [1, 0.8, 1]),
      pt(ico(0.32, 1), 0x6a4426, [0, 0.76, 0.60], [0, 0, 0], [1, 0.95, 0.9]),
      pt(ico(0.17, 0), 0x2e1e10, [0, 0.64, 0.88]),
      pt(cone(0.09, 0.40, 5), 0xfaf6ea, [0.20, 0.72, 0.84], [1.45, 0, 0.35]),
      pt(cone(0.09, 0.40, 5), 0xfaf6ea, [-0.20, 0.72, 0.84], [1.45, 0, -0.35]),
      pt(sph(0.06, 6, 4), 0xff3a2a, [0.14, 0.88, 0.76]),
      pt(sph(0.06, 6, 4), 0xff3a2a, [-0.14, 0.88, 0.76]),
      pt(cone(0.10, 0.30, 5), 0x3a2416, [0.34, 1.06, 0.10], [0.2, 0, -0.35]),      /* 背刺 */
      pt(cone(0.10, 0.30, 5), 0x3a2416, [-0.34, 1.06, 0.10], [0.2, 0, 0.35]),
      pt(cone(0.08, 0.26, 5), 0x3a2416, [0, 1.18, -0.32], [0.3, 0, 0]),
      ...legs(0.30, 0.34, 0.42, 0x4a3020, 0.13),
    ]),
    boss_wyvern: () => ([
      pt(ico(0.82, 1), 0x3f6ea4, [0, 1.32, 0], [0, 0, 0], [1.3, 1.0, 1.1]),
      pt(ico(0.46, 1), 0x5a8ac4, [0, 1.92, 0.70], [0, 0.3, 0], [1, 1, 1.05]),
      pt(cone(0.15, 0.46, 5), 0xf0d060, [0, 1.88, 1.10], [1.5, 0, 0]),
      pt(sph(0.07, 6, 4), 0xff5a3a, [0.16, 2.02, 0.92]),
      pt(sph(0.07, 6, 4), 0xff5a3a, [-0.16, 2.02, 0.92]),
      pt(box(0.96, 0.06, 0.62), 0x6a9ad0, [0.96, 1.66, -0.20], [0, 0, 0.35]),
      pt(box(0.96, 0.06, 0.62), 0x6a9ad0, [-0.96, 1.66, -0.20], [0, 0, -0.35]),
      pt(cone(0.09, 0.30, 5), 0xc8a040, [0.60, 1.58, -0.10], [0.3, 0, 0.6]),       /* 翼爪 */
      pt(cone(0.09, 0.30, 5), 0xc8a040, [-0.60, 1.58, -0.10], [0.3, 0, -0.6]),
      pt(box(0.16, 0.16, 1.30), 0x4a7ab0, [0, 1.12, -1.00], [0.2, 0, 0]),
      pt(cone(0.07, 0.18, 5), 0xf0d060, [0, 1.20, -1.62]),
      pt(cyl(0.13, 0.10, 0.82, 6), 0x3a6a9c, [0.38, 0.42, 0.20]),
      pt(cyl(0.13, 0.10, 0.82, 6), 0x3a6a9c, [-0.38, 0.42, 0.20]),
    ]),
  };

  /* 四条 hoofed 腿（含蹄），交给调用方铺开 */
  function legs(x, z, len, c, r) {
    const out = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      out.push(pt(cyl(r * 0.85, r, len, 6), c, [sx * x, len / 2, sz * z]));
      out.push(pt(ico(r * 1.15, 0), 0x2f2620, [sx * x, 0.04, sz * z], [0, 0, 0], [1, 0.7, 1.2]));
    }
    return out;
  }

  /* 人形怪：和人物保持差异——头更小、肩更宽、配色偏暗 + 武器 */
  function humanoid(shirt, pants, metal, skin, steel) {
    return [
      pt(cyl(0.23, 0.25, 0.34, 8), shirt, [0, 1.16, 0]),
      pt(cyl(0.19, 0.23, 0.16, 8), new THREE.Color().setHex(shirt).offsetHSL(0, 0, -0.08).getHex(), [0, 0.94, 0]),
      pt(cyl(0.21, 0.20, 0.12, 8), pants, [0, 0.83, 0]),
      pt(sph(0.10, 6, 5), metal, [-0.25, 1.30, 0]),
      pt(sph(0.10, 6, 5), metal, [0.25, 1.30, 0]),
      pt(cyl(0.085, 0.075, 0.30, 6), shirt, [-0.25, 0.98, 0]),
      pt(cyl(0.085, 0.075, 0.30, 6), shirt, [0.25, 0.98, 0]),
      pt(cyl(0.062, 0.056, 0.28, 6), skin, [-0.25, 0.70, 0]),
      pt(cyl(0.062, 0.056, 0.28, 6), skin, [0.25, 0.70, 0]),
      pt(cyl(0.10, 0.09, 0.46, 6), pants, [-0.13, 0.58, 0]),
      pt(cyl(0.10, 0.09, 0.46, 6), pants, [0.13, 0.58, 0]),
      pt(box(0.16, 0.10, 0.24), 0x2a2620, [-0.13, 0.32, 0.03]),
      pt(box(0.16, 0.10, 0.24), 0x2a2620, [0.13, 0.32, 0.03]),
      pt(sph(0.175, 8, 6), skin, [0, 1.44, 0], [0, 0, 0], [1, 1.05, 0.95]),
      pt(sph(0.185, 8, 5), metal, [0, 1.51, 0], [0, 0, 0], [1, 0.62, 1]),
      pt(box(0.08, 0.09, 0.06), 0xff5030, [0.075, 1.44, 0.152]),
      pt(box(0.08, 0.09, 0.06), 0xff5030, [-0.075, 1.44, 0.152]),
      pt(box(0.09, 0.86, 0.10), steel, [0.34, 1.06, 0.12], [0, 0, 0.18]),
    ];
  }

  /* ponytail: 怪物是 InstancedMesh 单材质，这里只产几何体；透明度靠 meshFor 选材质 */
  function createMonsterModel(type) {
    const gen = MON[type] || MON.boar;
    return F.mergeParts(gen());
  }

  F.Creatures = { createPlayerModel, createAnimalModel, createMonsterModel, SPEC, MON };
})();
