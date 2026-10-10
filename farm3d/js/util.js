/* ==========================================================================
 * 牧野田园 Open Farm  ·  基础工具 + 地形数学（权威高度场）
 * 所有玩法（人物行走 / 建筑贴合 / 资源散布 / 畜禽游走）都从这里的高度场取值，
 * 保证"渲染网格"与"逻辑地面"完全一致，杜绝悬浮与穿模。
 * ========================================================================== */
(function () {
  'use strict';
  const F = (window.FARM = window.FARM || {});

  /* ---------------------------- 数学 ---------------------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / ((e1 - e0) || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
  const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
  // 角度差归一到 [-PI, PI]
  function angDelta(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
  Object.assign(F, { clamp, lerp, smoothstep, damp, rnd, rndi, pick, dist, dist2, angDelta });
  F.choose = F.pick;

  /* ------------------------ 随机 & 噪声（确定性） ------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2i(i, j) {
    let n = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash2i(xi, zi), b = hash2i(xi + 1, zi), c = hash2i(xi, zi + 1), d = hash2i(xi + 1, zi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, z, oct) {
    let s = 0, amp = 0.5, fr = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * noise2(x * fr + i * 17.31, z * fr - i * 9.13); norm += amp; fr *= 2; amp *= 0.5; }
    return s / norm;
  }
  Object.assign(F, { mulberry32, hash2i, noise2, fbm });

  /* ============================ 地形 ============================ */
  const WORLD = 620, HALF = 310, WATER = 0.0;

  // 农田区（可开垦，网格化）
  const ZONES = [
    { id: 'A', name: '中央农场', x: 0, z: 56, w: 48, d: 34, h: 3.30 },
    { id: 'B', name: '东坡农场', x: 172, z: 44, w: 40, d: 30, h: 4.60 },
    { id: 'C', name: '西林农场', x: -152, z: -34, w: 40, d: 30, h: 2.80 },
  ];
  // 其它被平整的地块（营地 / 牧场）
  const FLATS = [
    { x: 0, z: 98, w: 62, d: 52, h: 3.10 },      // 出生营地
    { x: -120, z: -176, w: 118, d: 96, h: 2.35 }, // 牧场草场
    { x: 108, z: -104, w: 54, d: 40, h: 1.90 },   // 湖畔营地
  ];
  // 砂石小路（折线）：绕开农田区，避免路面切开耕地
  const PATHS = [
    [[0, 96], [12, 80], [34, 72], [40, 44], [32, 12], [4, -22], [-20, -56], [-44, -100], [-96, -160]],
    [[32, 12], [70, 14], [126, 30], [172, 52]],
    [[-44, -100], [-142, -66], [-152, -30]],
    [[70, 14], [96, -46], [124, -104], [122, -140]],
    [[32, 12], [-30, 28], [-70, 66], [-130, 120], [-156, 156]],
    [[-96, -160], [-30, -196], [52, -186], [104, -150]],
  ];
  const LAKE = { x: 122, z: -152, r: 44 };
  const FOREST_CORE = { x: -168, y: 172, r: 116 }; // 山林核心生态区（禁建）

  function riverZ(x) {
    return -78 + 44 * Math.sin(x * 0.0062) + 18 * Math.sin(x * 0.0170 + 1.7)
      + 6.5 * Math.sin(x * 0.0370 + 0.9) + 3.2 * Math.sin(x * 0.0880 + 2.1);
  }
  function riverHalfW(x) { return 13.0 + 3.2 * Math.sin(x * 0.011 + 0.4) + 1.8 * Math.sin(x * 0.052 + 1.2); }
  function lakeDist(x, z) {
    const d = Math.hypot(x - LAKE.x, z - LAKE.z);
    return d + (fbm(x * 0.021 + 3, z * 0.021 - 2, 2) - 0.5) * 13.0;
  }
  function riverDist(x, z) { return Math.abs(z - riverZ(x)); }

  function pathDist(x, z) {
    let best = 1e9;
    for (let p = 0; p < PATHS.length; p++) {
      const pl = PATHS[p];
      for (let i = 0; i < pl.length - 1; i++) {
        const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1];
        const dx = bx - ax, dz = bz - az;
        const L2 = dx * dx + dz * dz || 1e-6;
        let t = ((x - ax) * dx + (z - az) * dz) / L2;
        t = clamp(t, 0, 1);
        const px = ax + dx * t, pz = az + dz * t;
        const d = dist2(x, z, px, pz);
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  }

  function flatBlend(h, x, z, f) {
    const dx = Math.abs(x - f.x) / (f.w * 0.5), dz = Math.abs(z - f.z) / (f.d * 0.5);
    const m = 1 - smoothstep(0.70, 1.0, Math.max(dx, dz));
    return lerp(h, f.h, m * 0.94);
  }
  // 低频地形（道路顺着它走，避免路面起伏突兀）
  function hLow(x, z) {
    let h = fbm(x * 0.0040, z * 0.0040, 4) * 15 - 2.4;
    h += smoothstep(250, 100, Math.hypot(x + 168, z - 172)) * 20;
    h += smoothstep(215, 90, Math.hypot(x - 208, z + 138)) * 11;
    return h;
  }

  /* 解析高度（只在烘焙时调用一次，运行时一律走 hAt 双线性采样） */
  function hRaw(x, z) {
    let h = fbm(x * 0.0040, z * 0.0040, 4) * 15 - 2.4;          // 大起伏
    h += (fbm(x * 0.0170 + 5.1, z * 0.0170 - 3.3, 3) - 0.5) * 2.8; // 缓坡
    h += (fbm(x * 0.081, z * 0.081, 2) - 0.5) * 0.55;             // 细节

    const dm = Math.hypot(x + 168, z - 172);
    h += smoothstep(250, 100, dm) * (17 + fbm(x * 0.0102 + 11, z * 0.0102 + 7, 3) * 17); // 西北山林
    const de = Math.hypot(x - 208, z + 138);
    h += smoothstep(215, 90, de) * (8 + fbm(x * 0.0140 + 31, z * 0.0140 + 19, 2) * 10);  // 东南丘陵

    // 砂石小路：压平并轻微下切成路基（先修路，再平整营地与农田，避免路面把农田切成两半）
    const pd = pathDist(x, z);
    if (pd < 15) h = lerp(h, hLow(x, z) - 0.30, (1 - smoothstep(3.4, 13, pd)) * 0.86);

    for (let i = 0; i < FLATS.length; i++) h = flatBlend(h, x, z, FLATS[i]);
    for (let i = 0; i < ZONES.length; i++) h = flatBlend(h, x, z, ZONES[i]);

    // 河流下切（含宽阔浅滩）
    const rz = riverZ(x), rw = riverHalfW(x), rd = Math.abs(z - rz);
    if (rd < rw + 36) {
      const prof = -3.40 + 4.05 * smoothstep(0, 1, (rd - (rw - 2)) / 9.0);
      h = lerp(h, prof, 1 - smoothstep(rw - 2, rw + 7, rd));
      const beach = 1 - smoothstep(rw + 7, rw + 32, rd);
      const cap = 0.62 + Math.max(0, rd - (rw + 7)) * 0.062;
      h = lerp(h, Math.min(h, cap), beach * 0.94);
    }
    // 湖泊下切（缓入湖滩）
    const ld = lakeDist(x, z);
    if (ld < LAKE.r + 38) {
      const prof = -3.90 + 4.65 * smoothstep(0, 1, (ld - (LAKE.r - 6)) / 9.0);
      h = lerp(h, prof, 1 - smoothstep(LAKE.r - 6, LAKE.r + 3, ld));
      const beach = 1 - smoothstep(LAKE.r + 2, LAKE.r + 34, ld);
      const cap = 0.52 + Math.max(0, ld - (LAKE.r + 2)) * 0.055;
      h = lerp(h, Math.min(h, cap), beach * 0.96);
    }
    // 外圈群山（消隐地图边界，构成天际线）
    const r = Math.hypot(x, z);
    h += smoothstep(246, 322, r) * 48;

    return Math.max(h, -4.6);
  }

  const T = F.T = {
    WORLD, HALF, WATER, ZONES, FLATS, PATHS, LAKE, FOREST_CORE,
    riverZ, riverHalfW, riverDist, lakeDist, pathDist, hRaw, hLow,
    N: 300, STEP: WORLD / 300, grid: null,

    /* 烘焙高度场 */
    bake(N) {
      const n = (this.N = N || 300);
      const step = (this.STEP = WORLD / n);
      const g = (this.grid = new Float32Array((n + 1) * (n + 1)));
      for (let j = 0; j <= n; j++) {
        const z = -HALF + j * step;
        for (let i = 0; i <= n; i++) g[j * (n + 1) + i] = hRaw(-HALF + i * step, z);
      }
      return g;
    },
    /* 双线性采样：与渲染网格严格一致 */
    hAt(x, z) {
      const n = this.N, step = this.STEP, g = this.grid;
      if (!g) return hRaw(x, z);
      const fx = (x + HALF) / step, fz = (z + HALF) / step;
      const i = clamp(Math.floor(fx), 0, n - 1), j = clamp(Math.floor(fz), 0, n - 1);
      const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
      const k = j * (n + 1) + i, k2 = (j + 1) * (n + 1) + i;
      return lerp(lerp(g[k], g[k + 1], tx), lerp(g[k2], g[k2 + 1], tx), tz);
    },
    /* 三角面精确采样：与 PlaneGeometry 的对角线剖分一致，
       陡坡上双线性插值会低于可见网格（视觉穿模），此函数保证人物/相机贴在可见表面上 */
    hMesh(x, z) {
      const n = this.N, step = this.STEP, g = this.grid;
      if (!g) return this.hAt(x, z);
      const fx = (x + HALF) / step, fz = (z + HALF) / step;
      const i = clamp(Math.floor(fx), 0, n - 1), j = clamp(Math.floor(fz), 0, n - 1);
      const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
      const k = j * (n + 1) + i, k2 = (j + 1) * (n + 1) + i;
      const A = g[k], B = g[k2], C = g[k2 + 1], D = g[k + 1];
      /* 渲染网格对角线：B(i,j+1) → D(i+1,j)，即 tx+tz=1 */
      if (tx + tz <= 1) return A + (B - A) * tz + (D - A) * tx;
      return (1 - tx) * B + (tx + tz - 1) * C + (1 - tz) * D;
    },
    slopeAt(x, z) {
      const d = this.STEP * 1.2;
      const hx = this.hAt(x + d, z) - this.hAt(x - d, z);
      const hz = this.hAt(x, z + d) - this.hAt(x, z - d);
      return Math.hypot(hx, hz) / (2 * d);
    },
    normalAt(x, z, out) {
      const d = this.STEP * 1.2;
      const hx = this.hAt(x + d, z) - this.hAt(x - d, z);
      const hz = this.hAt(x, z + d) - this.hAt(x, z - d);
      out = out || new THREE.Vector3();
      return out.set(-hx / (2 * d), 1, -hz / (2 * d)).normalize();
    },
    /* 水深（>0 表示在水下） */
    depthAt(x, z) { return Math.max(0, WATER - this.hAt(x, z)); },
    isWater(x, z) { return this.hAt(x, z) < WATER - 0.05; },
    inForestCore(x, z) { return dist2(x, z, FOREST_CORE.x, FOREST_CORE.z) < FOREST_CORE.r * FOREST_CORE.r; },
    /* 世界坐标 → 0..1 UV */
    uv(x, z) { return [(x + HALF) / WORLD, (z + HALF) / WORLD]; },
    /* 建造合法性 */
    buildCheck(x, z) {
      if (this.depthAt(x, z) > 0.22) return { ok: false, why: '水域内不可建造' };
      if (this.inForestCore(x, z)) return { ok: false, why: '山林核心生态区禁止建造' };
      if (this.slopeAt(x, z) > 0.62) return { ok: false, why: '地形过陡，需先平整' };
      if (Math.hypot(x, z) > 280) return { ok: false, why: '超出可建造范围' };
      return { ok: true, why: '' };
    },
    /* 地块所属农田区 */
    zoneAt(x, z) {
      for (let i = 0; i < ZONES.length; i++) {
        const z0 = ZONES[i];
        if (Math.abs(x - z0.x) <= z0.w * 0.5 && Math.abs(z - z0.z) <= z0.d * 0.5) return z0;
      }
      return null;
    },
  };

  /* ======================= 渲染小工具 ======================= */
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
    _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _c = new THREE.Color();
  F._tmp = { _m4, _q, _e, _v3, _s3, _c };

  F.col = function (hex) { return new THREE.Color().setHex(hex); };

  /* 合并带顶点色的零件 → 单个几何体（低 draw call 的关键） */
  F.mergeParts = function (parts) {
    const pos = [], nor = [], col = [];
    const c = new THREE.Color(), nm = new THREE.Matrix3();
    for (const p of parts) {
      let g = p.g;
      g = g.index ? g.toNonIndexed() : g.clone();
      if (p.m) g.applyMatrix4(p.m);
      else if (p.t || p.r || p.s) {
        const m = new THREE.Matrix4();
        m.compose(
          new THREE.Vector3().fromArray(p.t || [0, 0, 0]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray((p.r || [0, 0, 0]))),
          new THREE.Vector3().fromArray(p.s || [1, 1, 1])
        );
        g.applyMatrix4(m);
      }
      const pa = g.attributes.position.array;
      let na = g.attributes.normal ? g.attributes.normal.array : null;
      if (!na) { g.computeVertexNormals(); na = g.attributes.normal.array; }
      c.setHex(p.c);
      if (p.j !== undefined && p.j > 0) { c.offsetHSL(0, 0, (Math.random() - 0.5) * p.j); }
      for (let i = 0; i < pa.length; i += 3) {
        pos.push(pa[i], pa[i + 1], pa[i + 2]);
        nor.push(na[i], na[i + 1], na[i + 2]);
        col.push(c.r, c.g, c.b);
      }
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  };

  const Tbox = new THREE.Box3();
  F.measure = function (geo) { geo.computeBoundingBox(); const b = geo.boundingBox; return { w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z, min: b.min.clone(), max: b.max.clone() }; };

  /* InstancedMesh 便捷写入 */
  F.ensureInstColor = function (mesh) {
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3).fill(1), 3);
    }
    return mesh.instanceColor;
  };
  F.setInst = function (mesh, i, x, y, z, ry, s, color) {
    _e.set(0, ry, 0); _q.setFromEuler(_e);
    _v3.set(x, y, z); _s3.set(s, s, s);
    _m4.compose(_v3, _q, _s3);
    mesh.setMatrixAt(i, _m4);
    if (color) { F.ensureInstColor(mesh); mesh.setColorAt(i, color); }
  };
  F.setInst7 = function (mesh, i, x, y, z, rx, ry, rz, sx, sy, sz, color, order) {
    _e.set(rx, ry, rz, order || 'XYZ'); _q.setFromEuler(_e);
    _v3.set(x, y, z); _s3.set(sx, sy, sz);
    _m4.compose(_v3, _q, _s3);
    mesh.setMatrixAt(i, _m4);
    if (color) { F.ensureInstColor(mesh); mesh.setColorAt(i, color); }
  };
  F.hideInst = function (mesh, i) {
    _m4.makeScale(0, 0, 0); _m4.setPosition(0, -9999, 0);
    mesh.setMatrixAt(i, _m4);
  };

  /* 共享材质 */
  F.MATS = null;
  F.buildMaterials = function () {
    const std = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 });
    const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, flatShading: true });
    const soft = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0 });
    const emis = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0, emissive: 0xffcf87, emissiveIntensity: 0.0 });
    /* 史莱姆专用：微透明的果冻质感（仍然无贴图） */
    const jelly = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.72 });
    F.MATS = { std, flat, soft, emis, jelly };
    return F.MATS;
  };

  /* --------------------------- DOM --------------------------- */
  F.$ = (s) => document.querySelector(s);
  F.$$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  F.el = function (tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ------------------------ 简易音效 ------------------------ */
  F.Audio2 = {
    ctx: null, on: true,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; } } },
    blip(freq, dur, type, vol) {
      if (!this.on) return; this.init(); if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.6), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((vol || 0.12), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    chop() { this.blip(180 + Math.random() * 40, 0.16, 'triangle', 0.10); },
    mine() { this.blip(320 + Math.random() * 60, 0.13, 'square', 0.07); },
    pick() { this.blip(620, 0.10, 'sine', 0.07); },
    water() { this.blip(880, 0.22, 'sine', 0.06); },
    ok() { this.blip(520, 0.09, 'sine', 0.08); setTimeout(() => this.blip(780, 0.10, 'sine', 0.07), 70); },
    bad() { this.blip(150, 0.16, 'sawtooth', 0.06); },
    splash() { this.blip(260, 0.26, 'sine', 0.08); },
    build() { this.blip(240, 0.12, 'triangle', 0.09); },
    };

    /* ============================ 键位映射（可在设置里自定义） ============================ */
    /* ponytail: 默认表写死在这里，玩家改的键只把差异存进 G.opt.keys（随存档持久化）；
    Esc、数字 1~9（工具快捷栏）与鼠标操作固定不改 */
    const KEY_DEFAULT = {
    forward: 'w', back: 's', left: 'a', right: 'd', run: 'shift', jump: ' ',
    interact: 'f', alt: 'g', remove: 'x', throwball: 'r',
    /* ponytail: 种子原先占 Q，Q/E 让给技能槽 1/2（第三个槽是鼠标右键，不在键表里）；
       旧存档仍写着 seed:'q' 的会在 Migrate v1→v2 里被清掉，自动回落到 z */
    seed: 'z', ab1: 'q', ab2: 'e',
    build: 'b', bag: 'i', skill: 'l', craft: 'c', help: 'h', chat: 't',
    friends: 'k', guild: 'u', party: 'p', auction: 'y', rank: 'j',
    mounts: 'm', arena: 'n', homebuild: 'v', settings: 'o', map: 'tab',
    };
    const KEY_LABEL = {
    forward: '前进', back: '后退', left: '左移', right: '右移', run: '奔跑（按住）', jump: '跳跃',
    interact: '主交互', alt: '副交互', seed: '切换种子', remove: '拆除模式', throwball: '投掷纳球',
    ab1: '技能 1', ab2: '技能 2',
    build: '建造菜单', bag: '背包', skill: '技能', craft: '工坊', help: '手册', chat: '聊天',
    friends: '好友', guild: '公会', party: '队伍', auction: '拍卖行', rank: '排行榜',
    mounts: '坐骑', arena: '斗兽场', homebuild: '家园建造', settings: '设置', map: '世界地图',
    };
    F.KEY_DEFAULT = KEY_DEFAULT;
    F.KEY_LABEL = KEY_LABEL;
    F.bind = function (id) {
    const u = F.Game && F.Game.opt && F.Game.opt.keys;
    const v = u && u[id];
    /* ponytail: 存档里若混进不规范写法（如 "space" / "空格"），这里兜成规范值，非法则回落默认，
       否则该动作会永久按不出来 */
    return v ? (F.normKey(v) || KEY_DEFAULT[id]) : KEY_DEFAULT[id];
    };
    /* 键名规范化：接受「空格 / space / tab / 上档字符」，返回 e.key.toLowerCase() 体系的值；非法返回 null */
    F.normKey = function (v) {
    v = (v || '').trim().toLowerCase();
    if (!v) return null;
    if (v === '空格' || v === 'space' || v === 'spacebar') return ' ';
    if (v.length === 1) return v;
    return ['tab', 'shift', 'ctrl', 'alt', 'escape', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(v) >= 0 ? v : null;
    };
    /* ============================ 存档版本迁移 ============================ */
  /* ponytail: 所有 schema 变更走这里的一条单向链 —— v1 → v2 → …。
     只追加字段、从不删除字段，因此旧档永远能读进来，不需要版本号不符就清档 */
  F.Migrate = {
    CURRENT: 2,
    steps: {
      /* v1 → v2：Q/E 让给技能槽（种子挪到 Z）；新增天赋字段与技能装配槽 */
      1: function (d) {
        d = Object.assign({}, d);
        if (d.opt && d.opt.keys && d.opt.keys.seed === 'q') delete d.opt.keys.seed;
        if (d.opt && d.opt.keys && d.opt.keys.seed === 'e') delete d.opt.keys.seed;
        d.talents = d.talents || {};
        d.talentPts = d.talentPts || 0;
        d.abil = d.abil || ['heavy', 'whirl', 'dash'];
        d.v = 2;
        return d;
      },
    },
    run(d) {
      let v = d.v || 1, guard = 0;
      while (v < F.Migrate.CURRENT && guard++ < 16) {
        const fn = F.Migrate.steps[v];
        if (!fn) { d.v = F.Migrate.CURRENT; break; }
        d = fn(d) || d;
        const nv = d.v || (v + 1);
        if (nv <= v) { d.v = F.Migrate.CURRENT; break; }
        v = nv;
      }
      if ((d.v || 1) < F.Migrate.CURRENT) d.v = F.Migrate.CURRENT;
      return d;
    },
  };

  /* id 动作改成 key 后是否与其它动作冲突，返回冲突动作 id 或 null（固定键 Esc / 1~9 不参与） */
    F.keyConflict = function (id, key) {
    for (const k in KEY_DEFAULT) {
     if (k === id) continue;
     if (F.bind(k) === key) return k;
    }
    return null;
    };

    })();
