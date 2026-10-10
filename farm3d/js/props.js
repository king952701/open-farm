/* ==========================================================================
 * 牧野田园 Open Farm  ·  程序化模型库
 * 全部由基础几何体 + 顶点色合并而成：风格统一、无外部资源、draw call 可控。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const P = (F.PROPS = {});

  /* 零件速记：几何 / 颜色 / 位置 / 旋转 / 缩放 */
  const pt = (g, c, t, r, s) => ({ g, c, t, r, s });
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg || 8, 1);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
  const cone = (r, h, seg) => new THREE.ConeGeometry(r, h, seg || 8, 1);
  const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 10, h || 7);
  const plate = (w, h) => new THREE.PlaneGeometry(w, h);
  const merge = (arr) => F.mergeParts(arr);

  /* 复用缓存 */
  const cache = {};
  function geo(key, fn) { if (!cache[key]) cache[key] = fn(); return cache[key]; }

  /* ============================ 树木 ============================ */
  P.tree = function (kind) {
    switch (kind) {
      case 'oak': return geo('t_oak', () => merge([
        pt(cyl(0.62, 0.50, 0.55, 8), 0x5d4027, [0, 0.26, 0]),
        pt(cyl(0.30, 0.48, 5.20, 9), 0x6b4b2e, [0, 2.85, 0]),
        pt(cyl(0.14, 0.20, 1.60, 6), 0x63452a, [0.55, 4.30, 0.28], [0, 0, -0.6]),
        pt(ico(2.05, 1), 0x4f8b3b, [0, 5.75, 0], [0, 0.6, 0], [1, 0.92, 1]),
        pt(ico(1.52, 1), 0x59a044, [1.35, 4.95, 0.55], [0.3, 0.2, 0.1], [1, 0.9, 1]),
        pt(ico(1.62, 1), 0x467f34, [-1.25, 5.15, -0.65], [0.2, 1.1, 0.3], [1, 0.88, 1]),
        pt(ico(1.28, 1), 0x65ad4b, [0.45, 7.05, 0.35], [0.5, 0.9, 0.2], [1, 0.85, 1]),
        pt(ico(0.95, 0), 0x3f7530, [-0.75, 6.35, 0.95]),
      ]));
      case 'pine': return geo('t_pine', () => merge([
        pt(cyl(0.52, 0.44, 0.45, 8), 0x503824, [0, 0.22, 0]),
        pt(cyl(0.20, 0.34, 5.00, 7), 0x5b3f2a, [0, 2.70, 0]),
        pt(cone(2.15, 2.70, 8), 0x2f6b45, [0, 3.45, 0]),
        pt(cone(1.72, 2.45, 8), 0x35774b, [0, 4.95, 0]),
        pt(cone(1.12, 2.20, 8), 0x3d8152, [0, 6.25, 0]),
      ]));
      case 'birch': return geo('t_birch', () => merge([
        pt(cyl(0.30, 0.26, 0.40, 7), 0x8b8578, [0, 0.20, 0]),
        pt(cyl(0.16, 0.25, 6.20, 7), 0xd6d0c0, [0, 3.30, 0]),
        pt(box(0.10, 0.34, 0.10), 0x3b3630, [0.12, 2.20, 0.16]),
        pt(box(0.09, 0.30, 0.09), 0x3b3630, [-0.10, 3.60, -0.14]),
        pt(box(0.08, 0.26, 0.08), 0x3b3630, [0.14, 4.70, 0.12]),
        pt(ico(1.22, 1), 0x76ab4a, [0, 6.05, 0], [0, 0.4, 0], [1, 0.95, 1]),
        pt(ico(0.98, 1), 0x84b955, [0.85, 5.35, 0.35]),
        pt(ico(0.86, 1), 0x6da045, [-0.75, 5.60, -0.30]),
      ]));
      case 'dead': return geo('t_dead', () => merge([
        pt(cyl(0.34, 0.26, 0.40, 6), 0x6f675c, [0, 0.20, 0]),
        pt(cyl(0.20, 0.32, 4.10, 6), 0x8a7f70, [0, 2.20, 0]),
        pt(cyl(0.09, 0.13, 1.50, 5), 0x7d7365, [0.55, 3.60, 0.20], [0.2, 0.4, -0.9]),
        pt(cyl(0.08, 0.11, 1.30, 5), 0x7d7365, [-0.50, 3.10, -0.25], [0.3, -0.6, 0.8]),
        pt(cyl(0.06, 0.09, 0.90, 5), 0x7d7365, [0.30, 4.30, -0.40], [0.5, 1.2, 0.5]),
      ]));
      default: return geo('t_bush', () => merge([ // bush
        pt(ico(0.92, 0), 0x4f8b3b, [0, 0.52, 0], [0.3, 0.5, 0.2], [1, 0.85, 1]),
        pt(ico(0.68, 0), 0x5f9a45, [0.62, 0.40, 0.28]),
        pt(ico(0.58, 0), 0x447a35, [-0.55, 0.36, -0.22]),
      ]));
    }
  };

  /* ============================ 岩石 / 矿石 ============================ */
  P.rock = function (kind) {
    switch (kind) {
      case 'iron': return geo('r_iron', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.15, 0.90, 1.00]),
        pt(ico(0.48, 0), 0x9a938a, [0.75, 0.30, -0.35], [0.9, 0.3, 0.5]),
        pt(ico(0.26, 0), 0xc07a3c, [0.35, 0.95, 0.35]),
        pt(ico(0.22, 0), 0xb8703a, [-0.42, 0.80, 0.30]),
        pt(ico(0.19, 0), 0xd08a48, [0.10, 0.55, -0.62]),
        pt(ico(0.17, 0), 0xc07a3c, [-0.60, 0.45, -0.30]),
      ]));
      case 'pile': return geo('r_pile', () => merge([
        pt(ico(0.62, 0), 0x8d8779, [0, 0.42, 0], [0.3, 0.5, 0.2], [1.2, 0.85, 1]),
        pt(ico(0.44, 0), 0x9a938a, [0.55, 0.30, 0.30], [0.7, 1.1, 0.3]),
        pt(ico(0.36, 0), 0x847e70, [-0.45, 0.24, -0.20]),
      ]));
      /* 新增矿脉：灰岩底座 + 彩色晶斑 */
      case 'copper': return geo('r_copper', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.15, 0.90, 1.00]),
        pt(ico(0.30, 0), 0xc87a3c, [0.38, 0.98, 0.30]), pt(ico(0.24, 0), 0xd88a48, [-0.44, 0.82, 0.28]),
        pt(ico(0.20, 0), 0xb87034, [0.06, 0.58, -0.60]), pt(ico(0.18, 0), 0xc87a3c, [-0.62, 0.46, -0.26]),
      ]));
      case 'tin': return geo('r_tin', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.12, 0.90, 1.00]),
        pt(ico(0.30, 0), 0xc4c8d4, [0.40, 0.96, 0.28]), pt(ico(0.22, 0), 0xd4d8e2, [-0.42, 0.84, 0.30]),
        pt(ico(0.20, 0), 0xb8bcc8, [0.08, 0.56, -0.62]), pt(ico(0.17, 0), 0xc4c8d4, [-0.60, 0.44, -0.28]),
      ]));
      case 'alum': return geo('r_alum', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.12, 0.90, 1.00]),
        pt(ico(0.30, 0), 0xd8dce4, [0.38, 0.98, 0.30]), pt(ico(0.23, 0), 0xe4e8f0, [-0.44, 0.80, 0.26]),
        pt(ico(0.19, 0), 0xccd0da, [0.06, 0.58, -0.60]), pt(ico(0.16, 0), 0xd8dce4, [-0.60, 0.46, -0.30]),
      ]));
      case 'silver': return geo('r_silver', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.12, 0.92, 1.00]),
        pt(ico(0.30, 0), 0xeceef4, [0.38, 0.98, 0.30]), pt(ico(0.23, 0), 0xf4f6fa, [-0.44, 0.82, 0.28]),
        pt(ico(0.19, 0), 0xdcdfe8, [0.06, 0.58, -0.62]), pt(ico(0.16, 0), 0xeceef4, [-0.62, 0.46, -0.30]),
      ]));
      case 'gold': return geo('r_gold', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.12, 0.90, 1.00]),
        pt(ico(0.29, 0), 0xf0c040, [0.38, 0.98, 0.30]), pt(ico(0.22, 0), 0xf8d458, [-0.44, 0.82, 0.28]),
        pt(ico(0.19, 0), 0xe0b030, [0.06, 0.58, -0.62]), pt(ico(0.16, 0), 0xf0c040, [-0.62, 0.46, -0.30]),
      ]));
      case 'crystal': return geo('r_crystal', () => merge([
        pt(ico(1.00, 0), 0x84807a, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.12, 0.88, 1.00]),
        pt(cone(0.20, 0.85, 6), 0x9adcf4, [0.30, 1.10, 0.24], [0.18, 0.3, 0.10]),
        pt(cone(0.16, 0.70, 6), 0xb2e8fa, [-0.38, 1.02, 0.30], [-0.14, 0.5, -0.08]),
        pt(cone(0.14, 0.60, 6), 0x8ad0ee, [0.05, 1.00, -0.42], [0.24, 1.1, -0.12]),
        pt(ico(0.15, 0), 0xc8f2fc, [-0.10, 0.62, 0.42]),
      ]));
      case 'rainbow': return geo('r_rainbow', () => merge([
        pt(ico(1.00, 0), 0x7c7872, [0, 0.55, 0], [0.4, 0.7, 0.2], [1.12, 0.92, 1.00]),
        pt(cone(0.20, 0.80, 6), 0xff8ac8, [0.30, 1.08, 0.22], [0.16, 0.3, 0.10]),
        pt(cone(0.17, 0.72, 6), 0x9adcf4, [-0.36, 1.04, 0.28], [-0.14, 0.5, -0.08]),
        pt(cone(0.15, 0.66, 6), 0xf4d458, [0.05, 1.00, -0.42], [0.22, 1.1, -0.12]),
        pt(ico(0.14, 0), 0x9ae87a, [-0.12, 0.64, 0.44]),
        pt(ico(0.12, 0), 0xc89af4, [0.52, 0.60, 0.30]),
      ]));
      default: return geo('r_rock', () => merge([
        pt(ico(1.00, 0), 0x8d8779, [0, 0.50, 0], [0.4, 0.7, 0.2], [1.10, 0.82, 0.96]),
        pt(ico(0.46, 0), 0x9a938a, [0.70, 0.26, -0.30], [0.9, 0.3, 0.5]),
      ]));
    }
  };

  /* ============================ 花草 / 采集物 ============================ */
  P.plant = function (kind) {
    switch (kind) {
      case 'flower': return geo('p_flower', () => {
        const a = [pt(cyl(0.016, 0.022, 0.44, 5), 0x5f9442, [0, 0.22, 0])];
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          a.push(pt(sph(0.078, 6, 4), 0xffffff, [Math.cos(ang) * 0.085, 0.47, Math.sin(ang) * 0.085], [0, ang, 0], [1, 0.55, 1]));
        }
        a.push(pt(sph(0.055, 6, 5), 0xf2d24a, [0, 0.50, 0]));
        return merge(a);
      });
      case 'herb': return geo('p_herb', () => {
        const a = [pt(cyl(0.016, 0.024, 0.52, 5), 0x5f9442, [0, 0.26, 0])];
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + 0.4;
          a.push(pt(box(0.20, 0.028, 0.11), 0x6aa64a, [Math.cos(ang) * 0.10, 0.30 + i * 0.05, Math.sin(ang) * 0.10], [0, -ang, 0.35]));
        }
        a.push(pt(sph(0.085, 6, 5), 0xa98bd6, [0, 0.60, 0]));
        a.push(pt(sph(0.05, 5, 4), 0xd9c6f2, [0.08, 0.55, 0.05]));
        return merge(a);
      });
      case 'reed': return geo('p_reed', () => {
        const a = [];
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2, r = 0.05 + i * 0.012;
          a.push(pt(box(0.035, 1.30, 0.035), 0x7f9a52, [Math.cos(ang) * r, 0.65, Math.sin(ang) * r], [Math.cos(ang) * 0.16, ang, Math.sin(ang) * 0.16]));
        }
        for (let i = 0; i < 3; i++) {
          const ang = i * 2.1;
          a.push(pt(cyl(0.012, 0.045, 0.30, 5), 0x9a7a4a, [Math.cos(ang) * 0.07, 1.35, Math.sin(ang) * 0.07], [0, 0, Math.cos(ang) * 0.2]));
        }
        return merge(a);
      });
      case 'branch': return geo('p_branch', () => merge([
        pt(cyl(0.045, 0.055, 1.15, 5), 0x7a6a55, [0, 0.07, 0], [Math.PI / 2, 0.4, 0]),
        pt(cyl(0.035, 0.045, 0.85, 5), 0x84735c, [0.18, 0.06, 0.22], [Math.PI / 2, -0.9, 0]),
        pt(cyl(0.025, 0.035, 0.55, 5), 0x6f604c, [-0.22, 0.06, -0.15], [Math.PI / 2, 1.4, 0]),
      ]));
      case 'hay': return geo('p_hay', () => {
        const a = [];
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2, r = 0.06 + (i % 3) * 0.05;
          a.push(pt(box(0.045, 0.85, 0.045), i % 2 ? 0xd0ba72 : 0xc0a85e,
            [Math.cos(ang) * r, 0.42, Math.sin(ang) * r], [Math.cos(ang) * 0.22, ang, Math.sin(ang) * 0.22]));
        }
        return merge(a);
      });
      case 'mushroom': return geo('p_mush', () => merge([
        pt(cyl(0.055, 0.075, 0.26, 6), 0xe8ddc4, [0, 0.13, 0]),
        pt(sph(0.20, 8, 5), 0xb5533f, [0, 0.27, 0], [0, 0, 0], [1, 0.62, 1]),
        pt(sph(0.13, 7, 5), 0xc76a4c, [0.17, 0.16, 0.10], [0, 0, 0], [1, 0.55, 1]),
      ]));
      case 'vine': return geo('p_vine', () => {
        const a = [];
        for (let i = 0; i < 4; i++) {
          const ang = i * 1.57;
          a.push(pt(cyl(0.028, 0.035, 1.70, 5), 0x5f8b3c, [Math.cos(ang) * 0.16, -0.85, Math.sin(ang) * 0.16], [0.10, ang, 0.10]));
          for (let j = 0; j < 3; j++) a.push(pt(box(0.16, 0.025, 0.10), 0x6fa04a,
            [Math.cos(ang) * 0.20, -0.25 - j * 0.45, Math.sin(ang) * 0.20], [0, ang + j, 0.3]));
        }
        return merge(a);
      });
      default: return geo('p_grass', () => {
        const a = [];
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2, r = 0.05 + (i % 3) * 0.045;
          a.push(pt(box(0.04, 0.62, 0.04), i % 2 ? 0x86ab54 : 0x769c48,
            [Math.cos(ang) * r, 0.31, Math.sin(ang) * r], [Math.cos(ang) * 0.26, ang, Math.sin(ang) * 0.26]));
        }
        return merge(a);
      });
    }
  };

  /* ============================ 作物 ============================ */
  P.crop = function (kind) {
    switch (kind) {
      case 'wheat': return geo('c_wheat', () => {
        const a = [];
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2, r = 0.04 + (i % 3) * 0.07;
          a.push(pt(box(0.028, 0.62, 0.028), 0x8fb255, [Math.cos(ang) * r, 0.36, Math.sin(ang) * r], [Math.cos(ang) * 0.12, ang, Math.sin(ang) * 0.12]));
          a.push(pt(ico(0.075, 0), 0xd9b04a, [Math.cos(ang) * r * 1.25, 0.72, Math.sin(ang) * r * 1.25], [0, 0, 0], [1, 2.1, 1]));
        }
        return merge(a);
      });
      case 'carrot': return geo('c_carrot', () => {
        const a = [pt(cone(0.17, 0.52, 7), 0xd9722f, [0, 0.10, 0], [Math.PI, 0, 0])];
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          a.push(pt(box(0.03, 0.50, 0.03), 0x5f9442, [Math.cos(ang) * 0.09, 0.34, Math.sin(ang) * 0.09], [Math.cos(ang) * 0.35, ang, Math.sin(ang) * 0.35]));
        }
        return merge(a);
      });
      case 'corn': return geo('c_corn', () => {
        const a = [pt(cyl(0.045, 0.06, 1.35, 6), 0x6fa04a, [0, 0.68, 0])];
        for (let i = 0; i < 6; i++) {
          const ang = i * 1.05;
          a.push(pt(box(0.07, 0.62, 0.03), i % 2 ? 0x7fb255 : 0x5f9442, [Math.cos(ang) * 0.10, 0.55 + (i % 3) * 0.22, Math.sin(ang) * 0.10], [0.25, ang, 0.5]));
        }
        a.push(pt(cyl(0.075, 0.085, 0.34, 7), 0xe8c552, [0.17, 0.86, 0.06], [0, 0, 0.35]));
        a.push(pt(cyl(0.070, 0.080, 0.30, 7), 0xf0cf60, [-0.15, 1.02, -0.05], [0, 0, -0.3]));
        a.push(pt(cyl(0.02, 0.03, 0.22, 5), 0xd8b04a, [0, 1.44, 0]));
        return merge(a);
      });
      case 'pumpkin': return geo('c_pumpkin', () => {
        const a = [
          pt(ico(0.44, 1), 0xdb7a2a, [0.05, 0.34, 0], [0, 0.4, 0], [1.15, 0.84, 1.05]),
          pt(cyl(0.05, 0.07, 0.20, 6), 0x6f7a3c, [0.05, 0.66, 0]),
        ];
        for (let i = 0; i < 6; i++) {
          const ang = i * 1.05;
          a.push(pt(ico(0.26, 0), 0x5f9442, [Math.cos(ang) * 0.52, 0.14, Math.sin(ang) * 0.52], [0, ang, 0], [1, 0.42, 1]));
        }
        return merge(a);
      });
      case 'tomato': return geo('c_tomato', () => {
        const a = [pt(cyl(0.04, 0.05, 0.85, 6), 0x5f9442, [0, 0.42, 0])];
        for (let i = 0; i < 4; i++) {
          const ang = i * 1.57;
          a.push(pt(ico(0.28, 0), 0x6fa04a, [Math.cos(ang) * 0.24, 0.42, Math.sin(ang) * 0.24], [0, ang, 0], [1, 0.7, 1]));
        }
        for (let i = 0; i < 6; i++) {
          const ang = i * 1.05 + 0.5;
          a.push(pt(sph(0.115, 7, 5), 0xd8483c, [Math.cos(ang) * 0.26, 0.36 + (i % 3) * 0.18, Math.sin(ang) * 0.26]));
        }
        return merge(a);
      });
      default: return geo('c_cabbage', () => merge([
        pt(ico(0.34, 1), 0x7fb255, [0, 0.30, 0], [0, 0.3, 0], [1, 0.85, 1]),
        pt(ico(0.26, 0), 0x9ac46a, [0, 0.44, 0], [0, 0.9, 0], [1, 0.7, 1]),
      ]));
    }
  };

  /* ============================ 鱼 ============================ */
  P.fish = function (color) {
    const c = new THREE.Color().setHex(color);
    const body = new THREE.Color().setHex(color).offsetHSL(0, -0.05, 0.06);
    const fin = new THREE.Color().setHex(color).offsetHSL(0, 0, -0.12);
    const parts = [
      { g: ico(1, 1), c: body.getHex(), t: [0, 0, 0], r: [0, 0, 0], s: [0.15, 0.19, 0.40] },
      { g: cone(0.16, 0.28, 5), c: fin.getHex(), t: [0, 0, -0.44], r: [-Math.PI / 2, 0, 0], s: [1, 1, 0.35] },
      { g: cone(0.10, 0.20, 4), c: fin.getHex(), t: [0, 0.16, -0.02], r: [0.35, 0, 0], s: [1, 1, 0.35] },
      { g: box(0.02, 0.22, 0.18), c: fin.getHex(), t: [0, -0.16, 0.02], r: [0, 0, 0] },
      { g: sph(0.032, 5, 4), c: 0x1a1a22, t: [0.10, 0.06, 0.27] },
      { g: sph(0.032, 5, 4), c: 0x1a1a22, t: [-0.10, 0.06, 0.27] },
    ];
    return merge(parts.map(p => pt(p.g, p.c, p.t, p.r, p.s)));
  };

  /* ============================ 角色 ============================ */
  /* ponytail: 模型本体统一在 creatures.js，这里只做转发，调用方（player / npc）不用改 */
  P.character = function (opt) { return F.Creatures.createPlayerModel(opt); };

  /* ============================ 畜禽 ============================ */
  /* ponytail: 三种家畜都由 Creatures.createAnimalModel(type) 从同一套模板生成 */
  /* ============================ 建筑 ============================ */
  const WOOD = 0xc9a878, WOOD2 = 0xb08f62, DARK = 0x6f5a44, STONE = 0x9a9285,
    ROOF = 0x8f5b46, ROOF2 = 0x7a5a52, DIRT = 0x6d5b45, WHITE = 0xe6e0d0;

  /* 地基裙边：贴合坡地，杜绝悬浮 */
  function skirt(w, d, h) {
    return pt(box(w, h || 1.6, d), DIRT, [0, -(h || 1.6) * 0.5 + 0.06, 0]);
  }

  const BUILDS = P.BUILDS = {};

  function def(id, o) { o.id = id; BUILDS[id] = o; return o; }

  def('house', {
    name: '民居', icon: '屋', cost: { wood: 30, stone: 18 }, size: [5.6, 4.8], r: 3.4, h: 4.4, cat: '居住',
    desc: '你的家：按 F 进入房间，屋内有床与储物箱。',
    build() {
      const a = [
        skirt(5.8, 5.0),
        pt(box(5.40, 0.34, 4.60), STONE, [0, 0.16, 0]),
        pt(box(5.00, 2.60, 4.20), WOOD, [0, 1.62, 0]),
        pt(box(5.06, 0.10, 4.26), WOOD2, [0, 0.72, 0]),
        pt(box(5.06, 0.10, 4.26), WOOD2, [0, 1.60, 0]),
        pt(box(5.06, 0.10, 4.26), WOOD2, [0, 2.48, 0]),
        pt(box(0.16, 2.60, 0.16), DARK, [2.44, 1.62, 2.04]),
        pt(box(0.16, 2.60, 0.16), DARK, [-2.44, 1.62, 2.04]),
        pt(box(0.16, 2.60, 0.16), DARK, [2.44, 1.62, -2.04]),
        pt(box(0.16, 2.60, 0.16), DARK, [-2.44, 1.62, -2.04]),
        pt(cone(4.30, 2.05, 4), ROOF, [0, 3.95, 0], [0, Math.PI / 4, 0]),
        pt(box(5.60, 0.16, 5.00), ROOF2, [0, 2.94, 0]),
        pt(box(1.10, 1.95, 0.12), DARK, [0, 1.30, 2.16]),
        pt(box(0.16, 0.16, 0.14), 0xd9b04a, [0.38, 1.28, 2.22]),
        pt(box(1.00, 0.90, 0.10), 0x9fd3e8, [-1.60, 1.80, 2.14]),
        pt(box(1.00, 0.90, 0.10), 0x9fd3e8, [1.60, 1.80, 2.14]),
        pt(box(0.08, 0.90, 0.10), DARK, [-1.60, 1.80, 2.18]),
        pt(box(0.54, 1.30, 0.54), STONE, [1.70, 3.30, -1.10]),
        pt(box(1.40, 0.16, 0.60), STONE, [1.70, 3.96, -1.10]),
        pt(box(1.60, 0.14, 0.90), WOOD2, [0, 0.08, 2.60]),
        pt(box(0.70, 0.30, 0.70), 0xb08f62, [2.20, 0.50, 2.30]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'enter',
  });

  def('depot', {
    name: '收货仓', icon: '市', cost: { wood: 18, stone: 12 }, size: [4.2, 3.4], r: 2.6, h: 2.8, cat: '生产',
    desc: '收购你的物资换金币：作物、矿石、鱼类统收。',
    build() {
      const a = [
        skirt(4.4, 3.6, 0.9),
        pt(box(4.00, 0.18, 3.20), WOOD2, [0, 0.16, 0]),
        pt(cyl(0.10, 0.12, 2.10, 7), DARK, [-1.75, 1.15, -1.35]),
        pt(cyl(0.10, 0.12, 2.10, 7), DARK, [1.75, 1.15, -1.35]),
        pt(cyl(0.10, 0.12, 2.10, 7), DARK, [-1.75, 1.15, 1.35]),
        pt(cyl(0.10, 0.12, 2.10, 7), DARK, [1.75, 1.15, 1.35]),
        pt(box(4.40, 0.16, 3.60), ROOF, [0, 2.30, 0]),
        pt(box(4.60, 0.12, 3.80), ROOF2, [0, 2.46, 0]),
        pt(box(3.60, 0.55, 0.14), WOOD, [0, 2.00, -1.60]),
        pt(box(0.60, 0.60, 0.10), 0xf0d060, [0, 2.00, -1.50]),
        pt(box(0.90, 0.70, 0.70), WOOD2, [-1.20, 0.55, 0.30]),
        pt(box(0.80, 0.60, 0.65), WOOD, [1.20, 0.50, -0.20]),
        pt(box(0.70, 0.50, 0.60), DARK, [1.15, 1.05, -0.25]),
        pt(box(1.50, 0.90, 0.10), WOOD, [0, 0.65, 1.55]),
        pt(box(0.30, 0.22, 0.06), 0xd9b04a, [0, 0.72, 1.62]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'trade',
  });

  def('workshop', {
    name: '工坊', icon: '坊', cost: { wood: 24, stone: 14 }, size: [4.8, 4.2], r: 2.9, h: 3.4, cat: '生产',
    desc: '加工材料：木板 / 石砖 / 绳索；也可制作农具。',
    build() {
      const a = [
        skirt(5.0, 4.4),
        pt(box(4.60, 0.30, 4.00), STONE, [0, 0.14, 0]),
        pt(box(4.20, 2.20, 3.60), WOOD2, [0, 1.40, 0]),
        pt(box(4.60, 0.18, 4.10), ROOF, [0.60, 2.62, 0], [0, 0, 0.13]),
        pt(box(4.60, 0.18, 4.10), ROOF2, [-0.60, 2.62, 0], [0, 0, -0.13]),
        pt(box(1.20, 1.70, 0.12), DARK, [0, 1.00, 1.86]),
        pt(box(1.80, 0.14, 1.00), WOOD, [0, 0.90, 2.42], [0.22, 0, 0]),
        pt(box(1.60, 0.12, 0.70), WOOD, [1.90, 0.86, 1.90]),
        pt(box(1.30, 0.50, 0.60), 0x5a5a60, [1.90, 1.16, 1.90]),
        pt(box(0.90, 0.30, 0.50), 0x4a4a50, [1.90, 1.52, 1.90]),
        pt(cyl(0.10, 0.12, 1.00, 6), 0x4a4a50, [-1.60, 0.50, 1.90]),
        pt(box(0.60, 0.60, 0.60), 0x8a6a4a, [-1.60, 1.10, 1.90]),
        pt(box(0.50, 1.00, 0.50), STONE, [-1.40, 2.60, -1.00]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'craft',
  });

  def('storage', {
    name: '谷仓', icon: '仓', cost: { wood: 26, stone: 10 }, size: [5.2, 4.4], r: 3.0, h: 4.6, cat: '储物',
    desc: '大型储物建筑，可一键存入 / 取出全部物资。',
    build() {
      const a = [
        skirt(5.4, 4.6),
        pt(box(5.00, 0.32, 4.20), STONE, [0, 0.15, 0]),
        pt(box(4.60, 2.40, 3.80), 0xa8563f, [0, 1.50, 0]),
        pt(box(4.66, 0.10, 3.86), 0x8e4633, [0, 0.70, 0]),
        pt(box(4.66, 0.10, 3.86), 0x8e4633, [0, 2.30, 0]),
        pt(cone(3.90, 1.70, 4), 0x6f5a52, [0, 3.55, 0], [0, Math.PI / 4, 0]),
        pt(box(2.00, 1.80, 0.12), 0xe0d6c0, [0, 1.10, 1.94]),
        pt(box(0.12, 1.80, 0.12), 0x8e4633, [0, 1.10, 1.98]),
        pt(box(2.00, 0.12, 0.12), 0x8e4633, [0, 2.00, 1.98]),
        pt(box(0.90, 0.90, 0.10), 0x9fd3e8, [1.70, 1.90, 1.94]),
        pt(cyl(0.90, 0.95, 4.00, 12), 0xcfc7b4, [2.90, 2.00, -0.60]),
        pt(box(1.90, 0.14, 1.90), 0xb5ad9a, [2.90, 4.02, -0.60]),
        pt(cone(1.10, 0.80, 12), 0x8a8478, [2.90, 4.45, -0.60]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'storage',
  });

  def('barn', {
    name: '畜棚', icon: '棚', cost: { wood: 20, hay: 6 }, size: [6.0, 5.0], r: 3.4, h: 3.2, cat: '畜牧',
    desc: '畜禽的遮风之所，附近 20 米内的畜禽产出更快。',
    build() {
      const a = [
        skirt(6.2, 5.2),
        pt(box(0.22, 2.30, 0.22), DARK, [2.70, 1.15, 2.30]),
        pt(box(0.22, 2.30, 0.22), DARK, [-2.70, 1.15, 2.30]),
        pt(box(0.22, 2.30, 0.22), DARK, [2.70, 1.15, -2.30]),
        pt(box(0.22, 2.30, 0.22), DARK, [-2.70, 1.15, -2.30]),
        pt(box(6.40, 0.20, 5.40), ROOF, [0.30, 2.50, 0], [0, 0, 0.10]),
        pt(box(6.40, 0.20, 5.40), ROOF2, [-0.30, 2.50, 0], [0, 0, -0.10]),
        pt(box(5.90, 1.20, 0.16), WOOD2, [0, 1.20, -2.30]),
        pt(box(0.16, 1.20, 4.60), WOOD2, [2.70, 1.20, 0]),
        pt(box(2.20, 0.40, 0.80), 0x8a6a4a, [1.40, 0.30, 1.60]),
        pt(box(2.00, 0.30, 0.62), 0xc0a85e, [1.40, 0.52, 1.60]),
        pt(ico(0.60, 0), 0xd0ba72, [-1.60, 0.45, -1.40], [0, 0.4, 0], [1.3, 0.9, 1.1]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'barn',
  });

  def('well', {
    name: '水井', icon: '井', cost: { stone: 22, wood: 6 }, size: [2.6, 2.6], r: 1.5, h: 2.8, cat: '设施',
    desc: '打满水壶，也可直接取水饮用。',
    build() {
      const a = [
        skirt(2.8, 2.8, 1.2),
        pt(new THREE.CylinderGeometry(0.85, 0.90, 0.95, 14, 1, true), STONE, [0, 0.48, 0]),
        pt(cyl(0.78, 0.78, 0.06, 14), 0x3f6f7a, [0, 0.72, 0]),
        pt(box(0.18, 2.00, 0.18), WOOD2, [0.80, 1.50, 0]),
        pt(box(0.18, 2.00, 0.18), WOOD2, [-0.80, 1.50, 0]),
        pt(cone(1.60, 0.85, 4), ROOF, [0, 2.70, 0], [0, Math.PI / 4, 0]),
        pt(cyl(0.06, 0.06, 1.50, 6), DARK, [0, 2.20, 0], [0, 0, Math.PI / 2]),
        pt(box(0.34, 0.38, 0.34), 0x8a6a4a, [0, 1.40, 0]),
        pt(box(0.38, 0.08, 0.38), DARK, [0, 1.60, 0]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'well',
  });

  def('windmill', {
    name: '风车磨坊', icon: '磨', cost: { wood: 34, board: 4, stone: 12 }, size: [4.4, 4.4], r: 2.6, h: 8.0, cat: '生产',
    desc: '把小麦磨成面粉， flour 可直接食用或用于烹饪。',
    build() {
      const a = [
        skirt(4.6, 4.6),
        pt(cyl(0.95, 1.45, 4.60, 12), WHITE, [0, 2.30, 0]),
        pt(cyl(1.00, 1.00, 0.16, 12), 0xb5ad9a, [0, 4.60, 0]),
        pt(cone(1.35, 1.10, 12), ROOF, [0, 5.20, 0]),
        pt(box(1.00, 1.60, 0.14), DARK, [0, 1.10, 1.30]),
        pt(box(0.70, 0.70, 0.12), 0x9fd3e8, [1.10, 3.20, 0.30], [0, 0.5, 0]),
      ];
      const g = merge(a);
      const blades = merge([
        pt(box(0.22, 3.20, 0.08), 0xe6dcc0, [0, 1.60, 0]),
        pt(box(1.60, 0.22, 0.08), 0xe6dcc0, [0.70, 0.90, 0]),
        pt(box(0.40, 0.40, 0.40), DARK, [0, 0, 0]),
      ]);
      return { geo: g, extra: [{ geo: blades, pos: [0, 4.30, 1.55], rot: [0, 0, 0], spin: 'z', speed: 0.55 }], y: 0 };
    },
    interact: 'mill',
  });

  def('fence', {
    name: '木围栏', icon: '栏', cost: { wood: 2 }, size: [2.0, 0.4], r: 1.05, h: 1.2, cat: '围栏', snap: 2, line: true,
    desc: '围出牧场与菜园，畜禽无法穿越。按住 Shift 拖动可批量摆放。',
    build() {
      const a = [
        pt(box(0.13, 1.30, 0.13), WOOD2, [0.90, 0.50, 0]),
        pt(box(0.13, 1.30, 0.13), WOOD2, [-0.90, 0.50, 0]),
        pt(box(0.13, 1.30, 0.13), WOOD2, [0.00, 0.50, 0]),
        pt(box(1.95, 0.14, 0.07), WOOD, [0, 0.62, 0]),
        pt(box(1.95, 0.14, 0.07), WOOD, [0, 0.98, 0]),
      ];
      return { geo: merge(a), y: 0, sink: 0.35 };
    },
  });

  def('gate', {
    name: '围栏门', icon: '门', cost: { wood: 5 }, size: [2.0, 0.6], r: 1.05, h: 1.4, cat: '围栏', snap: 2,
    desc: '可开合的通道，[F] 开关。',
    build() {
      const a = [
        pt(box(0.15, 1.50, 0.15), DARK, [0.95, 0.60, 0]),
        pt(box(0.15, 1.50, 0.15), DARK, [-0.95, 0.60, 0]),
        pt(box(0.20, 0.20, 0.20), 0x8a6a4a, [0.95, 1.40, 0]),
        pt(box(0.20, 0.20, 0.20), 0x8a6a4a, [-0.95, 1.40, 0]),
      ];
      const leaf = merge([
        pt(box(1.80, 0.14, 0.09), WOOD, [0.90, 0.62, 0]),
        pt(box(1.80, 0.14, 0.09), WOOD, [0.90, 0.98, 0]),
        pt(box(0.12, 1.00, 0.12), WOOD2, [1.75, 0.78, 0]),
        pt(box(0.12, 1.00, 0.12), WOOD2, [0.10, 0.78, 0]),
      ]);
      return { geo: merge(a), extra: [{ geo: leaf, pos: [-0.85, 0, 0], rot: [0, 0, 0], hinge: true }], y: 0, sink: 0.35 };
    },
    interact: 'gate',
  });

  def('campfire', {
    name: '篝火', icon: '火', cost: { wood: 8, stone: 5 }, size: [2.0, 2.0], r: 1.1, h: 1.0, cat: '设施',
    desc: '[F] 休息恢复体力；[G] 烤制食物。',
    build() {
      const a = [];
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        a.push(pt(ico(0.22, 0), STONE, [Math.cos(ang) * 0.78, 0.10, Math.sin(ang) * 0.78], [0, ang, 0], [1.2, 0.9, 1]));
      }
      a.push(pt(box(0.16, 0.16, 1.20), 0x6b4b2e, [0, 0.16, 0], [0, 0.6, 0]));
      a.push(pt(box(0.16, 0.16, 1.20), 0x5d4027, [0, 0.16, 0], [0, -0.7, 0]));
      a.push(pt(box(0.14, 0.14, 1.00), 0x7a5a3c, [0.10, 0.34, 0.10], [0.3, 1.2, 0]));
      const flame = merge([
        pt(cone(0.26, 0.70, 6), 0xffb347, [0, 0.35, 0]),
        pt(cone(0.16, 0.44, 6), 0xffe08a, [0, 0.26, 0]),
      ]);
      return {
        geo: merge(a), y: 0,
        extra: [{ geo: flame, pos: [0, 0.20, 0], rot: [0, 0, 0], flame: true }],
        light: { y: 0.9, color: 0xffa64d, intensity: 1.5, dist: 14 },
      };
    },
    interact: 'campfire',
  });

  def('lamp', {
    name: '路灯', icon: '灯', cost: { wood: 4, iron: 1 }, size: [1.2, 1.2], r: 0.6, h: 3.0, cat: '设施',
    desc: '入夜自动点亮，照亮营地。',
    build() {
      const a = [
        pt(cyl(0.16, 0.20, 0.30, 8), STONE, [0, 0.15, 0]),
        pt(cyl(0.07, 0.09, 2.60, 7), 0x5a5a60, [0, 1.40, 0]),
        pt(box(0.44, 0.08, 0.08), 0x5a5a60, [0.22, 2.70, 0]),
        pt(box(0.30, 0.34, 0.30), 0x4a4a50, [0.44, 2.42, 0]),
      ];
      const bulb = merge([pt(sph(0.14, 8, 6), 0xfff0c0, [0, 0, 0])]);
      return {
        geo: merge(a),
        extra: [{ geo: bulb, pos: [0.44, 2.28, 0], rot: [0, 0, 0], emissive: true }],
        light: { y: 2.3, color: 0xffcf87, intensity: 1.1, dist: 13 },
      };
    },
  });

  def('bridge', {
    name: '木桥', icon: '桥', cost: { wood: 14 }, size: [14.0, 3.2], r: 7.0, h: 1.2, cat: '设施', snap: 2, deck: 0.34,
    desc: '跨越水域的通道（可踩踏），串起多段即可跨河。',
    build() {
      const L = 14.0, Wd = 3.2;
      const a = [
        pt(box(L, 0.20, Wd), WOOD, [0, 0.12, 0]),
        pt(box(L, 0.07, 0.42), WOOD2, [0, 0.26, Wd / 2 - 0.16]),
        pt(box(L, 0.07, 0.42), WOOD2, [0, 0.26, -Wd / 2 + 0.16]),
        pt(box(L, 0.26, 0.22), DARK, [0, -0.05, Wd / 2 - 0.05]),
        pt(box(L, 0.26, 0.22), DARK, [0, -0.05, -Wd / 2 + 0.05]),
      ];
      for (let i = -6; i <= 6; i++) a.push(pt(box(0.10, 0.26, Wd), WOOD2, [i * 1.08, 0.02, 0]));
      for (let i = -6; i <= 6; i += 3) {
        a.push(pt(box(0.16, 1.10, 0.16), DARK, [i * 1.08, 0.60, Wd / 2 - 0.12]));
        a.push(pt(box(0.16, 1.10, 0.16), DARK, [i * 1.08, 0.60, -Wd / 2 + 0.12]));
        a.push(pt(box(0.12, 0.12, Wd - 0.2), DARK, [i * 1.08, 1.10, Wd / 2 - 0.12]));
        a.push(pt(box(0.12, 0.12, Wd - 0.2), DARK, [i * 1.08, 1.10, -Wd / 2 + 0.12]));
        a.push(pt(cyl(0.17, 0.19, 3.4, 6), DARK, [i * 1.08, -1.70, Wd / 2 - 0.4]));
        a.push(pt(cyl(0.17, 0.19, 3.4, 6), DARK, [i * 1.08, -1.70, -Wd / 2 + 0.4]));
      }
      return { geo: merge(a), y: 0, overWater: true, deck: 0.34 };
    },
  });

  def('haystack', {
    name: '草料堆', icon: '草', cost: { hay: 12 }, size: [2.6, 2.6], r: 1.4, h: 2.2, cat: '设施',
    desc: '储存牧草，冬季也能喂饱畜禽。',
    build() {
      const a = [
        skirt(2.8, 2.8, 0.8),
        pt(cyl(1.05, 1.20, 1.60, 10), 0xc9b06a, [0, 0.80, 0]),
        pt(cyl(0.10, 0.10, 2.40, 6), DARK, [0, 1.20, 0]),
        pt(cone(1.30, 0.90, 10), 0xd8c27a, [0, 2.00, 0]),
        pt(box(1.60, 0.10, 0.10), 0x8a6a4a, [0.90, 0.60, 0.90], [0, 0.6, 0.5]),
      ];
      return { geo: merge(a), y: 0 };
    },
    interact: 'haystack',
  });

  def('dock', {
    name: '钓鱼台', icon: '钓', cost: { wood: 12 }, size: [4.0, 3.0], r: 2.2, h: 1.6, cat: '设施', deck: 0.22,
    desc: '伸入水中的钓鱼平台，站上去即可抛竿（自带钓点）。',
    build() {
      const a = [
        pt(box(4.00, 0.20, 3.00), WOOD, [0, 0.10, 0]),
        pt(box(4.00, 0.10, 0.50), WOOD2, [0, 0.24, -1.30]),
      ];
      for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
        a.push(pt(cyl(0.13, 0.15, 2.20, 6), DARK, [i * 1.70, -0.90, j * 1.20]));
      }
      a.push(pt(cyl(0.09, 0.11, 1.80, 6), WOOD2, [1.60, 1.00, 1.20]));
      a.push(pt(box(0.70, 0.50, 0.08), 0xe6dcc0, [1.60, 1.90, 1.20]));
      a.push(pt(box(0.50, 0.34, 0.06), 0x7fb8a8, [1.60, 1.88, 1.26]));
      a.push(pt(box(0.80, 0.30, 0.50), 0x8a6a4a, [-1.40, 0.35, 0.90]));
      return { geo: merge(a), y: 0, overWater: true, sink: 0.5, dock: true, deck: 0.22 };
    },
    interact: 'dock',
  });

  /* ============================ 工具 ============================ */
  P.tool = function (kind) {
    switch (kind) {
      case 'axe': return merge([
        pt(cyl(0.028, 0.032, 0.90, 6), 0x8a6a4a, [0, 0, 0]),
        pt(box(0.10, 0.26, 0.20), 0x9aa0a6, [0.05, 0.36, 0], [0, 0, -0.2]),
      ]);
      case 'pick': return merge([
        pt(cyl(0.028, 0.032, 0.95, 6), 0x8a6a4a, [0, 0, 0]),
        pt(box(0.62, 0.10, 0.10), 0x8a8f95, [0, 0.40, 0], [0, 0, 0.12]),
      ]);
      case 'hoe': return merge([
        pt(cyl(0.026, 0.030, 1.05, 6), 0x8a6a4a, [0, 0, 0]),
        pt(box(0.26, 0.08, 0.16), 0x9aa0a6, [0.10, 0.48, 0], [0, 0, 0.3]),
      ]);
      case 'sickle': return merge([
        pt(cyl(0.024, 0.028, 0.42, 6), 0x8a6a4a, [0, 0, 0]),
        pt(new THREE.TorusGeometry(0.20, 0.026, 5, 10, Math.PI * 1.1), 0xb8bec4, [0.10, 0.34, 0], [Math.PI / 2, 0, 0.6]),
      ]);
      case 'can': return merge([
        pt(cyl(0.13, 0.15, 0.30, 8), 0x7fb8a8, [0, 0.06, 0]),
        pt(cyl(0.05, 0.05, 0.42, 6), 0x7fb8a8, [0.16, 0.20, 0], [0, 0, -0.7]),
        pt(cyl(0.09, 0.07, 0.10, 8), 0x9fd3e8, [0.30, 0.36, 0], [0, 0, -0.7]),
        pt(box(0.20, 0.06, 0.06), 0x5a8f84, [0.06, 0.24, 0]),
      ]);
      case 'rod': return merge([
        pt(cyl(0.016, 0.026, 2.30, 6), 0x9a7a4a, [0, 0.60, 0]),
        pt(cyl(0.04, 0.04, 0.30, 6), 0x5a4a38, [0, -0.30, 0]),
        pt(box(0.06, 0.10, 0.06), 0x4a4a50, [0.06, 0.20, 0]),
      ]);
      case 'feed': return merge([
        pt(box(0.34, 0.26, 0.26), 0xc9b06a, [0, 0, 0]),
        pt(box(0.36, 0.05, 0.10), 0x8a6a4a, [0, 0.06, 0]),
      ]);
      case 'seed': return merge([
        pt(box(0.30, 0.30, 0.22), 0xd8c9a4, [0, 0, 0]),
        pt(box(0.32, 0.08, 0.24), 0xa88a5a, [0, 0.14, 0]),
        pt(ico(0.06, 0), 0xd9b04a, [0.08, 0.20, 0.04]),
        pt(ico(0.06, 0), 0xd9722f, [-0.06, 0.20, -0.03]),
        pt(ico(0.06, 0), 0xe8c552, [0.02, 0.21, -0.08]),
      ]);
      default: return merge([pt(box(0.30, 0.30, 0.30), 0xb08f62, [0, 0, 0])]); // hammer
    }
  };

  /* ---------------------- 建筑实例化（含动画部件） ---------------------- */
  P.makeBuild = function (id) {
    const def = BUILDS[id];
    const built = def.build();
    const g = new THREE.Group();
    const main = new THREE.Mesh(built.geo, F.MATS.std);
    main.castShadow = true; main.receiveShadow = true;
    g.add(main);
    const anim = { flame: null, spin: [], hinge: null, emissive: [] };
    (built.extra || []).forEach((ex, i) => {
      const m = new THREE.Mesh(ex.geo, ex.emissive ? F.MATS.emis.clone() : F.MATS.std);
      m.position.fromArray(ex.pos || [0, 0, 0]);
      if (ex.rot) m.rotation.fromArray(ex.rot);
      m.castShadow = !ex.flame && !ex.emissive;
      if (ex.flame) { m.material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }); anim.flame = m; }
      if (ex.emissive) { m.material.emissive = new THREE.Color(0xffcf87); m.material.emissiveIntensity = 0; m.material.color = new THREE.Color(0xffffff); anim.emissive.push(m); }
      if (ex.spin) anim.spin.push({ m, axis: ex.spin, speed: ex.speed || 0.5 });
      if (ex.hinge) anim.hinge = m;
      g.add(m);
    });
    g.userData.anim = anim;
    g.userData.def = def;
    return g;
  };

  /* ============================ 装饰植被：白花簇 / 浆果丛 ============================ */
  /* ponytail: 纯装饰（world.js InstancedMesh 撒布），不进 NODE_DEFS、不参与采集与碰撞；
     顶点色低模 + mergeParts，与整套美术同一画法 */
  P.flora = function (kind) {
    if (kind === 'daisy') {                       /* 贴地白花簇：5 朵小白花聚生 */
      return geo('f_daisy', () => {
        const a = [];
        const rnd = F.mulberry32(421);
        for (let i = 0; i < 5; i++) {
          const ang = rnd() * 6.283, rr = 0.05 + rnd() * 0.13;
          const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr, hgt = 0.13 + rnd() * 0.09;
          a.push(pt(cyl(0.011, 0.015, hgt, 4), 0x5a8f46, [x, hgt / 2, z]));
          a.push(pt(new THREE.IcosahedronGeometry(0.042, 0), 0xf4f6ee, [x, hgt + 0.02, z]));
          a.push(pt(new THREE.IcosahedronGeometry(0.018, 0), 0xf0d878, [x, hgt + 0.045, z]));
        }
        /* 底部一小撮草叶陪衬 */
        a.push(pt(cyl(0.004, 0.014, 0.12, 4), 0x679a4c, [0.06, 0.06, -0.04], [0.3, 0, 0.4]));
        a.push(pt(cyl(0.004, 0.014, 0.10, 4), 0x679a4c, [-0.05, 0.05, 0.06], [-0.35, 0, -0.3]));
        return merge(a);
      });
    }
    /* 浆果丛：矮浓密绿丛 + 成串红果 */
    return geo('f_berry', () => {
      const a = [
        pt(ico(0.34, 0), 0x3f7a34, [0, 0.24, 0], [0.2, 0.5, 0.1], [1, 0.8, 1]),
        pt(ico(0.26, 0), 0x4c8a3e, [0.24, 0.18, 0.12]),
        pt(ico(0.22, 0), 0x365f2c, [-0.2, 0.16, -0.14]),
      ];
      const rnd = F.mulberry32(97);
      for (let i = 0; i < 9; i++) {
        const ang = rnd() * 6.283, rr = 0.18 + rnd() * 0.22;
        const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr, y = 0.12 + rnd() * 0.26;
        const c = rnd() < 0.75 ? 0xd84848 : 0x9a4ac0;
        a.push(pt(new THREE.IcosahedronGeometry(0.045, 0), c, [x, y, z]));
        if (rnd() < 0.6) a.push(pt(new THREE.IcosahedronGeometry(0.036, 0), c, [x + 0.05, y - 0.045, z + 0.02]));
      }
      return merge(a);
    });
  };

  /* ============================ 传送门（海洋色 · 旋转） ============================ */
  /* ponytail: 圆环绕自身轴转是看不出来的，旋转交给盘内的海浪弧 + 四片鳍这类非对称图形；
     外/中/盘三层海洋渐变配上夜间场景的低强度自发光，避免像原来那样发白光 */
  P.OCEAN = { deep: 0x0e5c86, mid: 0x1c86a8, teal: 0x2fc6b0, foam: 0x8ff0e0, glow: 0x2aa8c0, light: 0x6fdcff };

  P.portal = function (o) {
    o = o || {};
    const C = P.OCEAN;
    const R = o.r || 2.2, h = o.h == null ? 2.3 : o.h;
    const mat = (c, e, ei) => new THREE.MeshStandardMaterial({
      color: c, emissive: e || 0x000000, emissiveIntensity: ei == null ? 0.5 : ei, roughness: 0.42, metalness: 0.05,
    });
    const g = new THREE.Group();

    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 8, 28), mat(C.deep, C.glow, 0.6));
    ring.position.y = h;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.92, 26),
      new THREE.MeshBasicMaterial({ color: C.foam, transparent: true, opacity: 0.34, side: THREE.DoubleSide }));
    disc.position.y = h;
    g.add(disc);

    /* 旋转组：三层收拢的海浪弧（半径/弧长不同）+ 带鳍内环 */
    const spin = new THREE.Group();
    spin.position.y = h;
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(R * (0.36 + i * 0.23), 0.05, 5, 18, Math.PI * (0.7 + i * 0.2)),
        mat(C.teal, C.teal, 0.9));
      arc.rotation.z = i * 1.25;
      spin.add(arc);
    }
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.52, 0.07, 6, 22), mat(C.mid, C.teal, 0.85));
    spin.add(inner);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const fin = new THREE.Mesh(box(0.09, 0.3, 0.09), mat(C.foam, C.teal, 0.9));
      fin.position.set(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, 0);
      fin.rotation.z = a;
      spin.add(fin);
    }
    g.add(spin);

    let t = 0;
    return {
      group: g, ring, disc, spin,
      update(dt) {
        t += dt;
        spin.rotation.z -= dt * 0.8;                       /* 海浪盘整体缓缓涡转 */
        ring.rotation.z += dt * 0.2;
        disc.material.opacity = 0.30 + Math.sin(t * 1.5) * 0.07;
      },
    };
  };

})();
