/* ==========================================================================
 * 牧野田园 Open Farm  ·  世界：地形网格 / 水域 / 天空昼夜 / 草地摇曳 / 云
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const W = (F.World = {});
  const clamp = F.clamp, lerp = F.lerp, smoothstep = F.smoothstep;

  let scene, renderer, sun, hemi, amb, moon;
  let sky, skyMat, stars, clouds = [], water, waterMat, grass = null;
  let depthTex = null;

  /* --------------------------- 地表调色 --------------------------- */
  const C = {
    grassA: new THREE.Color().setHex(0x6f9a4e),
    grassB: new THREE.Color().setHex(0x88ab5c),
    dry: new THREE.Color().setHex(0x9aa866),
    forest: new THREE.Color().setHex(0x4d7a3a),
    farm: new THREE.Color().setHex(0x7d9a52),
    farmEdge: new THREE.Color().setHex(0x8f7d58),
    sand: new THREE.Color().setHex(0xd8caa0),
    wet: new THREE.Color().setHex(0xa79a78),
    rock: new THREE.Color().setHex(0x8d8779),
    rockHi: new THREE.Color().setHex(0x9c968c),
    gravel: new THREE.Color().setHex(0xb2a68c),
    tmp: new THREE.Color(),
  };

  /* 昼夜关键帧：小时 → 颜色 */
  const KEY = [
    { t: 0, top: 0x0d1a36, bot: 0x24314e, sun: 0x39496e, hs: 0x35486e, hg: 0x232b38, amb: 0.27, fog: 0x33435e },
    { t: 5.2, top: 0x2c4c7c, bot: 0xe0a074, sun: 0xffb489, hs: 0x6b7f9c, hg: 0x4a4436, amb: 0.30, fog: 0xc8a888 },
    { t: 7.5, top: 0x4f8ad0, bot: 0xc8d8e4, sun: 0xffe6c4, hs: 0x9dc4e2, hg: 0x6b7a4a, amb: 0.42, fog: 0xcfe0ea },
    { t: 12, top: 0x3f80c8, bot: 0xcfe8f4, sun: 0xffffff, hs: 0xbcdcf2, hg: 0x77894e, amb: 0.50, fog: 0xdceaf2 },
    { t: 16.5, top: 0x4d84c0, bot: 0xf2dcc0, sun: 0xffe9c8, hs: 0xbcd0e0, hg: 0x7b7a4a, amb: 0.46, fog: 0xe4ddd0 },
    { t: 18.6, top: 0x3a4a86, bot: 0xe89a63, sun: 0xff9a5c, hs: 0x7c7f9a, hg: 0x54483a, amb: 0.32, fog: 0xd9a878 },
    { t: 20.5, top: 0x18254a, bot: 0x323f5e, sun: 0x42527a, hs: 0x3a4c72, hg: 0x262e3c, amb: 0.27, fog: 0x3a4a66 },
    { t: 24, top: 0x0d1a36, bot: 0x24314e, sun: 0x39496e, hs: 0x35486e, hg: 0x232b38, amb: 0.27, fog: 0x33435e },
  ];

  const _cA = new THREE.Color(), _cB = new THREE.Color();
  function keyColor(hours, field) {
    let i = 0;
    for (; i < KEY.length - 1; i++) if (hours < KEY[i + 1].t) break;
    const a = KEY[i], b = KEY[Math.min(i + 1, KEY.length - 1)];
    const k = clamp((hours - a.t) / ((b.t - a.t) || 1), 0, 1);
    _cA.setHex(a[field]); _cB.setHex(b[field]);
    return _cA.lerp(_cB, k);
  }
  function keyNum(hours, field) {
    let i = 0;
    for (; i < KEY.length - 1; i++) if (hours < KEY[i + 1].t) break;
    const a = KEY[i], b = KEY[Math.min(i + 1, KEY.length - 1)];
    const k = clamp((hours - a.t) / ((b.t - a.t) || 1), 0, 1);
    return lerp(a[field], b[field], k);
  }

  /* ============================ 初始化 ============================ */
  W.init = function (sc, rend) {
    scene = sc; renderer = rend;
    F.buildMaterials();

    hemi = new THREE.HemisphereLight(0xbcdcf2, 0x77894e, 0.55); scene.add(hemi);
    amb = new THREE.AmbientLight(0xffffff, 0.22); scene.add(amb);
    sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35;
    scene.add(sun); scene.add(sun.target);
    moon = new THREE.DirectionalLight(0x9fb4d8, 0.0); scene.add(moon);

    scene.fog = new THREE.Fog(0xdceaf2, 140, 470);

    buildTerrain();
    buildShell();
    buildWater();
    buildSky();
    buildClouds();
    buildGrass();
    buildFlora();

    W.sun = sun; W.hemi = hemi; W.amb = amb; W.moon = moon;
    W.sunDir = new THREE.Vector3(0.4, 1, 0.25).normalize();
    W.time = 9;
    W.setTime(9);
  };

  /* ============================ 地形 ============================ */
  /* 世界实体化：沿方形地图边缘生成一圈岩壁裙边并封底，
     从高空 / 室内平台 / 山背面看都是完整大陆，不再是一层会穿模的薄壳 */
  function buildShell() {
    const N2 = 110;                       /* 每条边采样数 */
    const M = 4 * N2;                     /* 环一周顶点数 */
    const BOTTOM = -36;                   /* 裙边下探深度 */
    const edge = (tt) => {                /* tt: 0~1 环绕方形一周 */
      const s = (tt * 4) % 4, side = Math.floor(s), f = s - side;
      const a = -T.HALF + f * T.WORLD;
      if (side === 0) return [a, -T.HALF];
      if (side === 1) return [T.HALF, a];
      if (side === 2) return [T.HALF - f * T.WORLD, T.HALF];
      return [-T.HALF, T.HALF - f * T.WORLD];
    };
    const topArr = [], botArr = [];
    for (let i = 0; i <= M; i++) {
      const [x, z] = edge(i / M);
      topArr.push(x, T.hAt(x, z), z);
      botArr.push(x, BOTTOM, z);
    }
    const posArr = new Float32Array(topArr.concat(botArr));
    const idx = [];
    for (let i = 0; i < M; i++) {
      const a = i, b = i + 1, c = M + 1 + i, d = M + 2 + i;
      idx.push(a, c, b, b, c, d);
    }
    /* 底面封盖（两块三角面片拼成方形） */
    const H = T.HALF, base = posArr.length / 3;
    const cap = new Float32Array([
      -H, BOTTOM, -H, H, BOTTOM, -H, H, BOTTOM, H,
      -H, BOTTOM, -H, H, BOTTOM, H, -H, BOTTOM, H,
    ]);
    const all = new Float32Array(posArr.length + cap.length);
    all.set(posArr, 0); all.set(cap, posArr.length);
    const ci = [base, base + 1, base + 2, base + 3, base + 4, base + 5];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    geo.setIndex(idx.concat(ci));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x655c50, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'worldShell';
    scene.add(mesh);
    W.shell = mesh;
  }

  function buildTerrain() {
    const N = 300;
    T.bake(N);
    const geo = new THREE.PlaneGeometry(T.WORLD, T.WORLD, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colArr = new Float32Array(pos.count * 3);
    const step = T.STEP;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = T.hAt(x, z);
      pos.setY(i, h);

      const hx = T.hAt(x + step, z) - T.hAt(x - step, z);
      const hz = T.hAt(x, z + step) - T.hAt(x, z - step);
      const slope = Math.hypot(hx, hz) / (2 * step);

      const patch = F.fbm(x * 0.030, z * 0.030, 2);
      const dry = F.fbm(x * 0.013 + 9, z * 0.013 - 4, 2);
      const mott = F.fbm(x * 0.14, z * 0.14, 2);

      const c = C.tmp.copy(C.grassA).lerp(C.grassB, patch);
      c.lerp(C.dry, smoothstep(0.66, 0.94, dry) * 0.34);
      if (T.inForestCore(x, z)) c.lerp(C.forest, 0.55);
      const zone = T.zoneAt(x, z);
      if (zone) {
        c.lerp(C.farm, 0.55);
        const edge = Math.max(Math.abs(x - zone.x) / (zone.w * 0.5), Math.abs(z - zone.z) / (zone.d * 0.5));
        if (edge > 0.88) c.lerp(C.farmEdge, smoothstep(0.88, 0.985, edge) * 0.55);
      }

      const pd = T.pathDist(x, z);
      if (pd < 6.5) c.lerp(C.gravel, (1 - smoothstep(2.9, 6.0, pd)) * 0.92);
      /* 山坡岩石化：阈值放宽到 0.34，并在岩石色上叠两层噪声 ——
         中频做「碎石斑驳」、高频做明暗变化，山坡呈现岩草交错的贴图感而不是一整片纯色 */
      if (slope > 0.34) {
        const rk = smoothstep(0.34, 0.88, slope);
        c.lerp(C.rock, Math.min(1, rk * (0.55 + 0.75 * F.fbm(x * 0.11 + 3, z * 0.11 - 7, 2))));
        if (rk > 0.2) c.offsetHSL(0, 0, (F.fbm(x * 0.42, z * 0.42, 2) - 0.5) * 0.11 * rk);
      }
      if (h > 19) c.lerp(C.rock, smoothstep(19, 26, h) * 0.55);
      if (h > 27) c.lerp(C.rockHi, smoothstep(27, 36, h) * 0.80);
      if (h < 2.2) c.lerp(C.sand, smoothstep(2.2, 0.55, h) * 0.90);
      if (h < 0.15) c.lerp(C.wet, smoothstep(0.15, -1.6, h) * 0.95);

      const m = 0.93 + mott * 0.14;
      colArr[i * 3] = c.r * m; colArr[i * 3 + 1] = c.g * m; colArr[i * 3 + 2] = c.b * m;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    W.terrain = mesh;

    /* 水深贴图：供水面做浅滩渐变与岸边浪花 */
    const DN = 256, data = new Uint8Array(DN * DN);
    for (let j = 0; j < DN; j++) {
      for (let i = 0; i < DN; i++) {
        const x = -T.HALF + (i / (DN - 1)) * T.WORLD;
        const z = -T.HALF + (j / (DN - 1)) * T.WORLD;
        data[j * DN + i] = (clamp(T.depthAt(x, z) / 6, 0, 1) * 255) | 0;
      }
    }
    depthTex = new THREE.DataTexture(data, DN, DN, THREE.RedFormat, THREE.UnsignedByteType);
    depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;
    W.depthTex = depthTex;
  }

  /* ============================ 水面 ============================ */
  const WAVE = `
    float wv(vec2 p){
      return sin(p.x*0.32 + uTime*1.15)*0.055
           + sin(p.y*0.41 - uTime*0.95)*0.050
           + sin((p.x+p.y)*0.17 + uTime*1.70)*0.030;
    }`;
  const WATER_VS = `
    uniform float uTime;
    varying vec3 vWorld;
    ${WAVE}
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      wp.y += wv(wp.xz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const WATER_FS = `
    uniform sampler2D uDepth; uniform float uTime; uniform float uMap;
    uniform vec3 uShallow, uDeep, uSky, uSunCol, uSunDir;
    varying vec3 vWorld;
    ${WAVE}
    void main(){
      vec2 uvv = (vWorld.xz + uMap*0.5) / uMap;
      float dep = texture2D(uDepth, uvv).r * 6.0;
      if(dep < 0.05) discard;
      float e = 0.75;
      float h1 = wv(vWorld.xz + vec2(e,0.0)), h2 = wv(vWorld.xz - vec2(e,0.0));
      float h3 = wv(vWorld.xz + vec2(0.0,e)), h4 = wv(vWorld.xz - vec2(0.0,e));
      vec3 n = normalize(vec3(h1-h2, 2.0*e, h3-h4));
      vec3 vd = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(dot(n, vd), 0.0, 1.0), 3.0);
      vec3 base = mix(uShallow, uDeep, clamp(dep/3.2, 0.0, 1.0));
      vec3 sd = normalize(uSunDir);
      float spec = pow(max(dot(reflect(-vd, n), sd), 0.0), 90.0);
      float flow = sin((vWorld.x*0.75 + vWorld.z*0.35) - uTime*2.1)*0.5 + 0.5;
      float foam = smoothstep(0.68, 0.05, dep) * (0.42 + 0.58*sin(uTime*2.3 + vWorld.x*0.85 + vWorld.z*0.62));
      vec3 col = base + uSunCol * spec * 1.7 + vec3(0.92,0.96,1.0) * max(foam,0.0) * 0.20 + flow * 0.022;
      col = mix(col, uSky, fres * 0.48);
      float a = mix(0.28, 0.85, clamp(dep/2.2, 0.0, 1.0));
      a = clamp(max(a, fres * 0.5 + 0.14), 0.0, 1.0);
      gl_FragColor = vec4(col, a);
    }`;

  function buildWater() {
    const geo = new THREE.PlaneGeometry(T.WORLD, T.WORLD, 180, 180);
    geo.rotateX(-Math.PI / 2);
    waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDepth: { value: depthTex }, uMap: { value: T.WORLD },
        uShallow: { value: new THREE.Color().setHex(0x93d2d6) },
        uDeep: { value: new THREE.Color().setHex(0x2f7c96) },
        uSky: { value: new THREE.Color().setHex(0xbcdcf2) },
        uSunCol: { value: new THREE.Color().setHex(0xffffff) },
        uSunDir: { value: new THREE.Vector3(0.4, 1, 0.25).normalize() },
      },
      vertexShader: WATER_VS, fragmentShader: WATER_FS,
      transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    water = new THREE.Mesh(geo, waterMat);
    water.position.y = T.WATER;
    water.renderOrder = 2;
    scene.add(water);
    W.water = water; W.waterMat = waterMat;
  }

  /* ============================ 天空 / 星空 ============================ */
  const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const SKY_FS = `
    uniform vec3 uTop, uBot, uSunCol, uSunDir;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float hh = clamp(d.y*0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uBot, uTop, pow(hh, 0.62));
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunCol * pow(s, 340.0) * 2.2;
      col += uSunCol * pow(s, 9.0) * 0.16;
      col += uSunCol * pow(s, 2.0) * 0.045;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function buildSky() {
    skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color().setHex(0x3f80c8) },
        uBot: { value: new THREE.Color().setHex(0xcfe8f4) },
        uSunCol: { value: new THREE.Color().setHex(0xffffff) },
        uSunDir: { value: new THREE.Vector3(0.4, 1, 0.25).normalize() },
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 18), skyMat);
    sky.renderOrder = -1000;
    scene.add(sky);
    W.sky = sky;

    /* 星空 */
    const n = 1400, arr = new Float32Array(n * 3);
    const rnd = F.mulberry32(20240910);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 0.92 + 0.02), r = 1400;
      arr[i * 3] = r * Math.sin(v) * Math.cos(u);
      arr[i * 3 + 1] = r * Math.cos(v);
      arr[i * 3 + 2] = r * Math.sin(v) * Math.sin(u);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    stars.renderOrder = -999;
    scene.add(stars);
    W.stars = stars;
  }

  /* ============================ 云 ============================ */
  function buildClouds() {
    const rnd = F.mulberry32(777);
    const geos = [];
    for (let c = 0; c < 12; c++) {
      const parts = [];
      const lobes = 3 + ((rnd() * 3) | 0);
      for (let i = 0; i < lobes; i++) {
        const r = 9 + rnd() * 9;
        parts.push({
          g: new THREE.IcosahedronGeometry(r, 1), c: 0xffffff,
          t: [(rnd() - 0.5) * 34, (rnd() - 0.5) * 4, (rnd() - 0.5) * 22],
          r: [rnd(), rnd(), rnd()], s: [1, 0.55 + rnd() * 0.2, 1],
        });
      }
      const geo = F.mergeParts(parts);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, fog: true }));
      m.position.set((rnd() - 0.5) * 700, 130 + rnd() * 70, (rnd() - 0.5) * 700);
      m.userData.speed = 0.7 + rnd() * 1.1;
      m.renderOrder = 1;
      scene.add(m);
      clouds.push(m);
    }
    W.clouds = clouds;
  }

  /* ============================ 草地（摇曳） ============================ */
  function bladeGeo() {
    /* ponytail: 密度提到 30 倍后三角预算翻不起 30 倍 —— 面片从 1x2 段降到 1x1 段，
       每株三角数减半（12→6），锥形收窄与风摇效果不变 */
    const g = new THREE.PlaneGeometry(0.10, 0.58, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.29;              // 0..0.58
      const k = 1 - (y / 0.58) * 0.75;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, (y / 0.58) * 0.09);            // 前倾弯曲
    }
    g.computeVertexNormals();
    return g;
  }

  function buildGrass() {
    const blades = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      blades.push({
        g: bladeGeo(), c: i === 1 ? 0x92c05e : 0x76a850,
        t: [Math.cos(a) * 0.055, 0.29, Math.sin(a) * 0.055], r: [0, a * 1.7, 0.16], s: [1, 0.8 + i * 0.14, 1],
      });
    }
    const geo = F.mergeParts(blades);
    const cap = 260000;   /* 覆盖率 ×30 后最高档的容量上限（见 setGrassQuality） */
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const shaderRef = { u: null };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.uniforms.uFade = { value: 44 };
      sh.uniforms.uWindDir = { value: new THREE.Vector2(1, 0.35).normalize() };
      sh.uniforms.uWindStr = { value: 0.45 };
      sh.vertexShader = 'uniform float uTime;\nuniform float uFade;\nuniform vec2 uWindDir;\nuniform float uWindStr;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
         #ifdef USE_INSTANCING
           vec3 ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
         #else
           vec3 ip = vec3( 0.0 );
         #endif
         /* 风向：沿风向传播的行进波（阵风），每株草自带相位 */
         vec2 wd = normalize( uWindDir + vec2( 0.0001, 0.0 ) );
         float travel = dot( ip.xz, wd ) * 0.055;
         float gust  = pow( sin( uTime * 0.42 - travel ) * 0.5 + 0.5, 1.7 );
         float phase = ip.x * 0.37 + ip.z * 0.29;
         float sway  = sin( uTime * 2.1 + phase ) * 0.62 + sin( uTime * 4.3 + phase * 1.7 ) * 0.20;
         float amp   = uWindStr * ( 0.42 + gust * 1.05 );
         float f     = pow( clamp( transformed.y / 0.55, 0.0, 1.0 ), 1.6 );
         /* 只有叶尖弯曲，且沿风向倾倒 */
         transformed.x += wd.x * sway * amp * f * 0.34;
         transformed.z += wd.y * sway * amp * f * 0.34;
         transformed.y -= abs( sway ) * amp * f * 0.055;
         vec4 wp2 = modelMatrix * vec4( ip + transformed, 1.0 );
         float dd = length( cameraPosition - wp2.xyz );
         transformed *= 1.0 - smoothstep( uFade*0.70, uFade, dd );
        `);
      shaderRef.u = sh;
    };
    mat.customProgramCacheKey = () => 'grass-wind2';
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    F.ensureInstColor(mesh);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.count = 0;
    scene.add(mesh);
    grass = { mesh, mat, shaderRef, cap, spacing: 1.2, cx: 1e9, cz: 1e9, timer: 0, key: '', R: 42 };
    W.grass = grass;
  }

  /* ============================ 白花簇 / 浆果丛（纯装饰层） ============================ */
  /* ponytail: 与草同一套 InstancedMesh + 顶点风摇（相位按位置错开），格子哈希撒布稳定不闪；
     纯装饰：不进 NODE_DEFS，不参与拾取/碰撞/遮挡，渐隐距离比草更远 */
  const FLORA = [];
  function buildFlora() {
    const windInject = (mat, key, hRef) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = { value: 0 };
        sh.uniforms.uFade = { value: 52 };
        sh.uniforms.uWindDir = { value: new THREE.Vector2(1, 0.35).normalize() };
        sh.uniforms.uWindStr = { value: 0.45 };
        sh.vertexShader = 'uniform float uTime;\nuniform float uFade;\nuniform vec2 uWindDir;\nuniform float uWindStr;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3( position );
           vec3 ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
           vec2 wd = normalize( uWindDir + vec2( 0.0001, 0.0 ) );
           float travel = dot( ip.xz, wd ) * 0.05;
           float gust  = pow( sin( uTime * 0.4 - travel ) * 0.5 + 0.5, 1.7 );
           float phase = ip.x * 0.41 + ip.z * 0.33;
           float sway  = sin( uTime * 1.9 + phase ) * 0.6 + sin( uTime * 4.1 + phase * 1.6 ) * 0.18;
           float amp   = uWindStr * ( 0.35 + gust * 0.9 );
           float f     = pow( clamp( transformed.y / ${Number(hRef).toFixed(4)}, 0.0, 1.0 ), 1.5 );
           transformed.x += wd.x * sway * amp * f * 0.3;
           transformed.z += wd.y * sway * amp * f * 0.3;
           vec4 wp2 = modelMatrix * vec4( ip + transformed, 1.0 );
           float dd = length( cameraPosition - wp2.xyz );
           transformed *= 1.0 - smoothstep( uFade*0.7, uFade, dd );`);
        mat.userData.u = sh;
      };
      mat.customProgramCacheKey = () => 'flora-' + key;
    };
    const mk = (geo, cap, base, R, cond, opts) => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      windInject(mat, base.toFixed(2), geo.userData.floraH || 0.2);
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.frustumCulled = false;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.count = 0;
      scene.add(mesh);
      FLORA.push(Object.assign({ mesh, mat, cap, base, spacing: base, R, cond, cx: 1e9, cz: 1e9, key: '' }, opts));
    };
    /* 成片白色小花：草地上密铺，避开路面 / 农田 / 林芯密林 */
    /* ponytail: 浆果丛装饰层已撤销 —— 改为真正的采集节点 NODE_DEFS.berrybush（entities.js），
       看得见的浆果丛全图统一可采，不再有「装饰的采不了」的割裂 */
    const daisy = F.PROPS.flora('daisy'); daisy.userData.floraH = 0.2;
    mk(daisy, 900, 3.4, 40,
      (x, z, h) => h > 1.2 && h < 15 && T.slopeAt(x, z) < 0.5 && T.pathDist(x, z) > 2.2 && !T.zoneAt(x, z) && !T.inForestCore(x, z));
    /* 山坡碎石：陡坡上撒低模岩石（与采集矿石同画法的纯装饰层，不碰撞不可采），
       配合地形的岩石斑驳色，山坡有「岩石贴图」的质感；
       ponytail: floraH 顶到 999 → 风 sway 的高度因子 f≈0，岩石纹丝不动但保留距离渐隐。
       必须写 999.0：这段数字会被原样插进 GLSL，int 会把顶点着色器编挂 */
    const rock = F.PROPS.rock('plain'); rock.userData.floraH = 999.0;
    mk(rock, 420, 5.2, 46,
      (x, z, h) => h > 1.0 && T.slopeAt(x, z) > 0.40 && T.pathDist(x, z) > 2.6 && !T.zoneAt(x, z),
      { sink: 0.24 });
    W.flora = FLORA;
  }

  function rebuildFlora(px, pz) {
    for (const L of FLORA) {
      const sp = L.spacing, R = L.R;
      const gk = Math.round(px / sp) + ':' + Math.round(pz / sp) + ':' + sp;
      if (gk === L.key) continue;
      L.key = gk;
      const n = Math.floor((R * 2) / sp);
      let count = 0;
      for (let j = 0; j <= n && count < L.cap; j++) {
        for (let i = 0; i <= n && count < L.cap; i++) {
          const bx = Math.round((px - R + i * sp) / sp) * sp;
          const bz = Math.round((pz - R + j * sp) / sp) * sp;
          const h1 = F.hash2i(Math.round(bx * 9.1) + 5, Math.round(bz * 6.7) - 3);
          const h2 = F.hash2i(Math.round(bz * 4.9) + 77, Math.round(bx * 8.3) + 11);
          const ox = (h1 - 0.5) * sp * 0.9, oz = (h2 - 0.5) * sp * 0.9;
          const x = bx + ox, z = bz + oz;
          if ((x - px) * (x - px) + (z - pz) * (z - pz) > R * R) continue;
          const h = T.hAt(x, z);
          if (!L.cond(x, z, h)) continue;
          const s = 0.8 + h1 * 0.5;
          _ge.set(0, h2 * 6.283, 0); _gq.setFromEuler(_ge);
          _gv.set(x, h - (L.sink || 0.03), z); _gs.set(s, s, s);
          _gm.compose(_gv, _gq, _gs);
          L.mesh.setMatrixAt(count, _gm);
          count++;
        }
      }
      L.mesh.count = count;
      L.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  /* 密度系数：>1 更稀（移动端 / 平板降档），=1 满密度 */
  W.setFloraDensity = function (mul) {
    for (const L of FLORA) { L.spacing = L.base * mul; L.key = ''; }
    rebuildFlora(W.grass && W.grass.cx === 1e9 ? 0 : (W.grass ? W.grass.cx : 0), W.grass && W.grass.cz === 1e9 ? 0 : (W.grass ? W.grass.cz : 0));
  };

  /* 风场（由天气系统驱动：angle 弧度方向，strength 0~1.6） */
  W.wind = { dir: new THREE.Vector2(1, 0.35).normalize(), strength: 0.45, gustT: 0 };
  W.setWind = function (angle, strength) {
    const w = W.wind;
    w.dir.set(Math.cos(angle), Math.sin(angle));
    if (w.dir.lengthSq() < 1e-6) w.dir.set(1, 0);
    w.dir.normalize();
    if (strength != null) w.strength = clamp(strength, 0, 2);
    if (grass && grass.shaderRef.u) {
      grass.shaderRef.u.uniforms.uWindDir.value.copy(w.dir);
      grass.shaderRef.u.uniforms.uWindStr.value = w.strength;
    }
  };

  /* 按玩家位置重建草丛（世界坐标哈希 → 位置稳定，不会闪烁）
     ponytail: 覆盖率 ×30 后一次重建要扫二三十万个格子，整表一口气算完必然卡帧，两个手段：
     ① 「能不能长草」判定（地形采样，最贵）按格子永久缓存，重复重建只查表；
     ② 重建分帧切片，每帧只算几毫秒，期间旧布局照常显示 —— 草的位置锚定世界坐标，
        绝大部分格子的结果与上一轮完全一致，切换瞬间肉眼无感 */
  const growOK = new Map();                 /* 格子键 → 0/1 可长草（换密度档时清空） */
  const _rs = { active: false, px: 0, pz: 0, sp: 0, R: 0, n: 0, i: 0, j: 0, count: 0, done: false };
  const _cc = new THREE.Color();
  function cellGrow(x, z, gi, gj) {
    const k = gi * 8192 + gj;
    const hit = growOK.get(k);
    if (hit !== undefined) return hit === 1;
    let ok = 1;
    const h = T.hAt(x, z);
    if (h < 0.80 || h > 30) ok = 0;                   // 水里 / 裸岩不长草
    else if (T.slopeAt(x, z) > 0.60) ok = 0;
    else if (T.pathDist(x, z) < 2.4) ok = 0;          // 路面不长草
    else if (T.zoneAt(x, z)) ok = 0;                  // 农田区不长草（保持耕地整洁）
    if (growOK.size < 500000) growOK.set(k, ok);      /* 上限保护：极端情况只查不算 */
    return ok === 1;
  }
  W.clearGrassCache = function () { growOK.clear(); };

  const _gv = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), _gm = new THREE.Matrix4(), _ge = new THREE.Euler();
  const _gc = new THREE.Color(), _gc2 = new THREE.Color();
  W.updateGrass = function (px, pz, dt, force) {
    if (!grass) return;
    rebuildFlora(px, pz);                          /* 花与浆果丛共用这套跟随重建（内部有格子缓存） */
    if (!grass.mesh.visible) return;

    const sp = grass.spacing, R = grass.R;
    /* 换档 / 强制：立刻作废进行中的重建，从头来 */
    if (_rs.active && (_rs.sp !== sp || _rs.R !== R)) _rs.active = false;
    if (force) _rs.active = false;

    if (!_rs.active) {
      /* 草按世界网格锚定，玩家小步移动不需要重排 —— 挪出几米再重建（远处本来就淡出在雾里） */
      const moved = Math.abs(px - grass.cx) + Math.abs(pz - grass.cz);
      if (!force && moved < Math.max(3, sp * 2.5)) return;
      _rs.active = true; _rs.done = false;
      _rs.px = px; _rs.pz = pz; _rs.sp = sp; _rs.R = R;
      _rs.n = Math.floor((R * 2) / sp); _rs.i = 0; _rs.j = 0; _rs.count = 0;
      grass.cx = px; grass.cz = pz;
    }

    const cDry = _gc.setHex(0x9aa866), cGrn = _gc2.setHex(0xffffff);
    const t0 = performance.now();
    while (_rs.j <= _rs.n && !_rs.done) {
      const i = _rs.i, j = _rs.j;
      _rs.i++;
      if (_rs.i > _rs.n) { _rs.i = 0; _rs.j++; }
      const bx = Math.round((_rs.px - R + i * sp) / sp) * sp;
      const bz = Math.round((_rs.pz - R + j * sp) / sp) * sp;
      const gi = Math.round(bx / sp), gj = Math.round(bz / sp);
      const h1 = F.hash2i(Math.round(bx * 7.3), Math.round(bz * 5.1));
      const h2 = F.hash2i(Math.round(bz * 11.7) + 31, Math.round(bx * 3.3) - 17);
      const ox = (h1 - 0.5) * sp * 0.95, oz = (h2 - 0.5) * sp * 0.95;
      const x = bx + ox, z = bz + oz;
      const d2 = (x - _rs.px) * (x - _rs.px) + (z - _rs.pz) * (z - _rs.pz);
      if (d2 > R * R) continue;
      if (!cellGrow(x, z, gi, gj)) continue;
      const h = T.hAt(x, z);
      const dryN = F.fbm(x * 0.021 + 4, z * 0.021 - 7, 2);
      const s = 0.75 + h1 * 0.55;
      _ge.set(0, h2 * 6.283, 0); _gq.setFromEuler(_ge);
      _gv.set(x, h - 0.05, z); _gs.set(s, s * (0.85 + h2 * 0.4), s);
      _gm.compose(_gv, _gq, _gs);
      grass.mesh.setMatrixAt(_rs.count, _gm);
      grass.mesh.setColorAt(_rs.count, _cc.copy(cGrn).lerp(cDry, smoothstep(0.68, 0.95, dryN) * 0.55));
      _rs.count++;
      if (_rs.count >= grass.cap) _rs.done = true;            /* 容量到顶：结束本轮，保住已完成的部分 */
      else if (performance.now() - t0 > 5) return;            /* 本帧预算用完，剩下的下帧继续 */
    }
    grass.mesh.count = _rs.count;
    grass.mesh.instanceMatrix.needsUpdate = true;
    if (grass.mesh.instanceColor) grass.mesh.instanceColor.needsUpdate = true;
    _rs.active = false;
  };

  /* ============================ 昼夜 ============================ */
  const _sd = new THREE.Vector3();
  W.setTime = function (hours) {
    W.time = ((hours % 24) + 24) % 24;
    const t = W.time;
    const ang = ((t - 6) / 12) * Math.PI;          // 6点地平线，12点天顶
    const elev = Math.sin(ang);
    const az = 0.55;
    _sd.set(Math.cos(ang) * Math.cos(az), Math.sin(ang), Math.cos(ang) * Math.sin(az)).normalize();
    W.sunDir.copy(_sd);

    const day = clamp(elev, 0, 1);
    const night = clamp(-elev * 2.2, 0, 1);

    const sc = keyColor(t, 'sun');
    sun.color.copy(sc);
    sun.intensity = 0.35 + day * 2.05;
    sun.userData.base = sun.intensity;      /* 天气系统在此基础上做明暗修正 */
    sun.position.copy(_sd).multiplyScalar(180);
    // 夜间用月光（方向相反）
    moon.color.copy(keyColor(t, 'sun')).lerp(new THREE.Color().setHex(0xa8c0e8), 0.85);
    moon.intensity = night * 1.05;
    moon.position.copy(_sd).multiplyScalar(-180);

    hemi.color.copy(keyColor(t, 'hs'));
    hemi.groundColor.copy(keyColor(t, 'hg'));
    hemi.intensity = 0.36 + day * 0.46;
    amb.intensity = keyNum(t, 'amb');
    amb.userData.base = amb.intensity;      /* 同上 */
    amb.color.copy(sc);

    const fogC = keyColor(t, 'fog');
    scene.fog.color.copy(fogC);
    scene.fog.near = 140; scene.fog.far = 470;
    renderer.setClearColor(fogC, 1);

    skyMat.uniforms.uTop.value.copy(keyColor(t, 'top'));
    skyMat.uniforms.uBot.value.copy(keyColor(t, 'bot'));
    skyMat.uniforms.uSunCol.value.copy(sc);
    skyMat.uniforms.uSunDir.value.copy(W.sunDir);

    stars.material.opacity = night * 0.9;

    waterMat.uniforms.uSunDir.value.copy(W.sunDir);
    waterMat.uniforms.uSunCol.value.copy(sc);
    waterMat.uniforms.uSky.value.copy(keyColor(t, 'bot'));
    waterMat.uniforms.uShallow.value.copy(new THREE.Color().setHex(0x8fd3d6).lerp(new THREE.Color().setHex(0x2a4a6a), night * 0.8));
    waterMat.uniforms.uDeep.value.copy(new THREE.Color().setHex(0x2f7c96).lerp(new THREE.Color().setHex(0x11263a), night * 0.8));

    if (F.Game) F.Game.isNight = night > 0.35;
  };

  /* ============================ 每帧更新 ============================ */
  const _lp = new THREE.Vector3();
  W.update = function (dt, time, playerPos) {
    const t = time;
    waterMat.uniforms.uTime.value = t * 1.0;
    if (grass && grass.shaderRef.u) {
      grass.shaderRef.u.uniforms.uTime.value = t;
      grass.shaderRef.u.uniforms.uFade.value = grass.R + 2;   /* 淡出跟随绘制半径（密度档位可调 R） */
    }
    for (const L of FLORA) {                       /* 花与浆果丛共用风场（随天气风向/强度变化） */
      const u = L.mat.userData.u;
      if (!u) continue;
      u.uniforms.uTime.value = t;
      u.uniforms.uWindDir.value.copy(W.wind.dir);
      u.uniforms.uWindStr.value = W.wind.strength;
    }
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt * 0.6;
      if (c.position.x > 420) c.position.x = -420;
    }
    // 阴影相机跟随玩家
    if (playerPos) {
      _lp.copy(W.sunDir).multiplyScalar(150).add(playerPos);
      sun.position.copy(_lp);
      sun.target.position.copy(playerPos);
      sun.target.updateMatrixWorld();
      moon.position.copy(playerPos).addScaledVector(W.sunDir, -120);
      moon.target.position.copy(playerPos);
      moon.target.updateMatrixWorld();
    }
    // 草随风（风向缓慢变化不改，统一正弦）
  };

  /* 草地密度：0 关 / 1 低 / 2 中 / 3 高 —— 覆盖率比旧版 ×30（spacing ÷ √30）
     代价：中档约 8 万株、高档可达 15 万+，重建已分帧切片（见 updateGrass），移动端自动锁在低档 */
  W.setGrassQuality = function (level) {
    if (!grass) return;
    grass.spacing = [0, 0.44, 0.24, 0.18][level] || 0.24;
    grass.R = [0, 30, 40, 46][level] || 40;             /* 渲染优化：低画质缩小草的绘制半径 */
    grass.mesh.visible = level > 0;
    W.clearGrassCache();
    W.updateGrass(grass.cx === 1e9 ? 0 : grass.cx, grass.cz === 1e9 ? 0 : grass.cz, 0, true);
  };

  W.waterLevelAt = function () { return T.WATER; };
  W.setShadows = function (on) {
    sun.castShadow = on;
    renderer.shadowMap.enabled = on;
    scene.traverse(o => { if (o.isMesh && o.material) { o.material.needsUpdate = true; } });
  };

})();
