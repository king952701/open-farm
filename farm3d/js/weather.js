/* ==========================================================================
 * 牧野田园 Open Farm  ·  天气系统
 * 1) 动态天气（晴朗/多云/阴天/雾/小雨/雷暴/雪/大风）自动轮换并平滑过渡
 * 2) 每种天气带来不同的增益 buff / 减益 debuff（移速 / 体力 / 饥饿 / 作物 /
 *    钓鱼 / 捕捉 / 怪物刷新）
 * 3) 风力驱动草的卷动（World.setWind），并叠加程序化环境音：
 *    风声（低通棕噪，随风力变化）、雨声、雷鸣
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp, lerp = F.lerp;

  /* 天气定义：light=光照系数 fogFar=雾距 precip=降水 pAmp=降水强度 mods=数值影响 */
  const WX = (F.WX = {
    clear: {
      name: '晴朗', icon: '☀️', wind: [0.15, 0.45], light: 1.0, fogFar: 470, precip: null, pAmp: 0, dur: [120, 220],
      mods: { speed: 1.05, energy: 0.88, hunger: 1.0, growth: 1.15, fishWait: 1.0, catch: 1.0, spawn: 1.0 },
      desc: '阳光和煦：移速 +5%、体力消耗 -12%、作物生长 +15%',
    },
    cloudy: {
      name: '多云', icon: '⛅', wind: [0.30, 0.62], light: 0.92, fogFar: 420, precip: null, pAmp: 0, dur: [110, 200],
      mods: { speed: 1.0, energy: 0.95, hunger: 1.0, growth: 1.05, fishWait: 0.95, catch: 1.05, spawn: 1.0 },
      desc: '云层遮阴：体力消耗 -5%、钓鱼略快、捕捉率 +5%',
    },
    overcast: {
      name: '阴天', icon: '☁️', wind: [0.35, 0.70], light: 0.74, fogFar: 300, precip: null, pAmp: 0, dur: [100, 190],
      mods: { speed: 1.0, energy: 1.0, hunger: 1.0, growth: 0.95, fishWait: 0.85, catch: 1.1, spawn: 1.05 },
      desc: '光线昏暗：作物生长 -5%、钓鱼更快、怪物略多',
    },
    foggy: {
      name: '雾天', icon: '🌫️', wind: [0.08, 0.30], light: 0.82, fogFar: 105, precip: null, pAmp: 0, dur: [70, 140],
      mods: { speed: 0.94, energy: 1.05, hunger: 1.0, growth: 1.0, fishWait: 0.95, catch: 0.88, spawn: 0.85 },
      desc: '浓雾弥漫：视野缩短、移速 -6%、怪物刷新 -15%、捕捉率 -12%',
    },
    rain: {
      name: '小雨', icon: '🌦️', wind: [0.50, 0.90], light: 0.62, fogFar: 230, precip: 'rain', pAmp: 0.55, dur: [90, 170],
      mods: { speed: 0.98, energy: 1.08, hunger: 1.0, growth: 1.35, fishWait: 0.75, catch: 1.12, spawn: 1.0 },
      desc: '细雨滋润：作物生长 +35%、免浇水、钓鱼与捕捉加成，体力消耗 +8%',
    },
    storm: {
      name: '雷暴', icon: '⛈️', wind: [1.15, 1.65], light: 0.42, fogFar: 165, precip: 'rain', pAmp: 1.0, dur: [60, 120], thunder: true,
      mods: { speed: 0.90, energy: 1.35, hunger: 1.15, growth: 1.2, fishWait: 0.62, catch: 1.25, spawn: 1.18, hp: 1 },
      desc: '狂风骤雨：移速 -10%、体力与饥饿消耗剧增、露天会被雷击掉血；钓鱼捕捉大幅加成',
    },
    snow: {
      name: '雪天', icon: '❄️', wind: [0.35, 0.80], light: 0.84, fogFar: 210, precip: 'snow', pAmp: 0.75, dur: [90, 160], snowy: true,
      mods: { speed: 0.85, energy: 1.12, hunger: 1.28, growth: 0.35, fishWait: 1.15, catch: 0.92, spawn: 0.7, cook: 1.2 },
      desc: '寒风飘雪：地面湿滑移速 -15%、饥饿消耗 +28%、作物近乎停滞',
    },
    windy: {
      name: '大风', icon: '🌬️', wind: [1.20, 1.80], light: 0.96, fogFar: 430, precip: null, pAmp: 0, dur: [70, 150],
      mods: { speed: 0.92, energy: 1.18, hunger: 1.05, growth: 1.0, fishWait: 1.15, catch: 0.9, spawn: 1.1 },
      desc: '劲风呼啸：逆风移速 -8%、体力消耗 +18%、钓鱼变难，怪物更活跃',
    },
  });
  const ORDER = ['clear', 'clear', 'cloudy', 'clear', 'overcast', 'rain', 'cloudy', 'windy',
    'clear', 'foggy', 'rain', 'cloudy', 'storm', 'rain', 'clear', 'snow', 'overcast'];

  /* ============================ 环境音：风 / 雨 / 雷 ============================ */
  const Amb = (F.Ambience = {
    ctx: null, ready: false, on: true, t: 0, thunderT: 6,
    master: null, noiseBuf: null, windGain: null, windFilter: null, rainGain: null, rainFilter: null,

    ensure() {
      if (Amb.ready) return;
      if (!F.Audio2) return;
      if (!F.Audio2.ctx && F.Audio2.init) { try { F.Audio2.init(); } catch (e) { } }
      const ctx = Amb.ctx = F.Audio2.ctx;
      if (!ctx) return;
      try {
        /* 2 秒棕噪（比白噪更像自然风） */
        const len = Math.floor(ctx.sampleRate * 2);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
        Amb.noiseBuf = buf;
        const master = Amb.master = ctx.createGain();
        master.gain.value = 0.9; master.connect(ctx.destination);

        const mk = (type, freq, q, gain) => {
          const src = ctx.createBufferSource();
          src.buffer = buf; src.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = type; f.frequency.value = freq; if (q != null) f.Q.value = q;
          const g = ctx.createGain(); g.gain.value = gain;
          src.connect(f); f.connect(g); g.connect(master);
          src.start();
          return { f, g };
        };
        const w = mk('lowpass', 520, 0.8, 0);
        Amb.windFilter = w.f; Amb.windGain = w.g;
        const r = mk('bandpass', 2200, 0.6, 0);
        Amb.rainFilter = r.f; Amb.rainGain = r.g;
        Amb.ready = true;
      } catch (e) { Amb.ready = false; }
    },

    set(wind, rain) {
      Amb.ensure();
      if (!Amb.ready || !Amb.ctx) return;
      const t = Amb.ctx.currentTime, k = Amb.on ? 1 : 0;
      try {
        Amb.windGain.gain.setTargetAtTime(clamp(wind, 0, 1) * 0.30 * k, t, 0.35);
        Amb.windFilter.frequency.setTargetAtTime(360 + clamp(wind, 0, 1) * 1500, t, 0.5);
        Amb.rainGain.gain.setTargetAtTime(clamp(rain, 0, 1) * 0.16 * k, t, 0.35);
        Amb.rainFilter.frequency.setTargetAtTime(1500 + clamp(rain, 0, 1) * 1800, t, 0.5);
      } catch (e) { }
    },

    thunder() {
      Amb.ensure();
      if (!Amb.ready || !Amb.ctx || !Amb.on) return;
      const ctx = Amb.ctx, t = ctx.currentTime;
      try {
        const src = ctx.createBufferSource();
        src.buffer = Amb.noiseBuf; src.loop = true; src.playbackRate.value = 0.35;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        src.connect(f); f.connect(g); g.connect(Amb.master);
        src.start(t); src.stop(t + 2.0);
      } catch (e) { }
    },

    tick(dt, wind, rain, storm) {
      if (!Amb.ready) { Amb.ensure(); if (!Amb.ready) return; }
      Amb.t -= dt;
      if (Amb.t > 0) return;
      Amb.t = 0.18;
      const now = performance.now();
      const gust = 0.75 + Math.sin(now * 0.00021) * 0.18 + Math.sin(now * 0.00073) * 0.10;
      Amb.set(wind * gust, rain);
      if (storm) {
        Amb.thunderT -= 0.18;
        if (Amb.thunderT <= 0) { Amb.thunderT = F.rnd(5, 15); Amb.thunder(); }
      } else Amb.thunderT = F.rnd(3, 8);
    },
  });

  /* ============================== 天气主体 ============================== */
  const Wt = (F.Weather = {
    cur: 'clear', enabled: true, ambience: true, nextT: 90, idx: 0, windT: 0,
    wind: { angle: 0.6, strength: 0.35, target: 0.35 },
    precip: 0, scene: null, rain: null, snow: null, flash: 0, lightK: 1, _home: null, announced: {},

    init(scene) {
      Wt.scene = scene;
      Wt._home = new THREE.Vector3();
      buildPrecip();
      Wt.lightK = 1;
      Wt.set('clear', true);
    },

    def(id) { return WX[id] || WX.clear; },
    curDef() { return WX[Wt.cur] || WX.clear; },

    set(id, quiet) {
      if (!WX[id]) return;
      Wt.cur = id;
      Wt.nextT = F.rnd(WX[id].dur[0], WX[id].dur[1]);
      /* 切换天气时立刻朝该天气的风力区间靠拢 */
      Wt.wind.target = F.rnd(WX[id].wind[0], WX[id].wind[1]);
      Wt.idx = Math.max(0, ORDER.indexOf(id));
      if (!quiet) {
        F.UI.toast('天气转为「' + WX[id].name + '」：' + WX[id].desc, id === 'storm' || id === 'snow' ? 'bad' : 'info');
        if (F.Social) F.Social.sys('天象：' + WX[id].name + ' —— ' + WX[id].desc);
      }
    },

    next() {
      if (Math.random() < 0.35) return ORDER[(Math.random() * ORDER.length) | 0];
      Wt.idx = (Wt.idx + 1) % ORDER.length;
      return ORDER[Wt.idx];
    },

    /* 数值修正 */
    m(key, dft) {
      const d = Wt.enabled ? WX[Wt.cur] : null;
      if (!d) return dft != null ? dft : 1;
      const v = d.mods[key];
      return v == null ? (dft != null ? dft : 1) : v;
    },

    buffList() {
      const d = WX[Wt.cur];
      if (!d || !Wt.enabled) return [];
      const out = [];
      const push = (name, ratio, good) => {
        const pct = Math.round((ratio - 1) * 100);
        if (!pct) return;
        out.push({ name: name + (pct > 0 ? ' +' : ' ') + pct + '%', good: good });
      };
      push('移速', d.mods.speed, true);
      push('体力消耗', d.mods.energy, false);
      push('饥饿消耗', d.mods.hunger, false);
      push('作物生长', d.mods.growth, true);
      push('钓鱼等待', d.mods.fishWait, false);
      push('捕捉概率', d.mods.catch, true);
      push('怪物刷新', d.mods.spawn, false);
      if (d.mods.hp) out.push({ name: '露天持续掉血', good: false });
      if (d.snowy) out.push({ name: '地面湿滑', good: false });
      if (Wt.precip > 0.2 && d.precip === 'rain') out.push({ name: '作物免浇水', good: true });
      return out;
    },

    saveData() { return { cur: Wt.cur, nextT: Wt.nextT, idx: Wt.idx, enabled: Wt.enabled, ambience: Wt.ambience }; },
    loadData(d) {
      if (!d) return;
      Wt.enabled = d.enabled !== false;
      Wt.ambience = d.ambience !== false;
      F.Ambience.on = Wt.ambience;
      Wt.set(WX[d.cur] ? d.cur : 'clear', true);
      Wt.nextT = d.nextT || F.rnd(60, 140);
      Wt.idx = d.idx || 0;
    },

    update(dt, playerPos) {
      if (!Wt.scene) return;
      if (Wt.enabled) {
        Wt.nextT -= dt;
        if (Wt.nextT <= 0) {
          const n = Wt.next();
          Wt.set(n);
        }
      }
      const d = WX[Wt.cur] || WX.clear;

      /* 风：方向缓慢漂移，强度在天气区间内呼吸 */
      Wt.wind.angle += Math.sin(performance.now() * 0.00012) * dt * 0.08;
      Wt.windT -= dt;
      if (Wt.windT <= 0) { Wt.windT = F.rnd(2.5, 5.5); Wt.wind.target = F.rnd(d.wind[0], d.wind[1]); }
      Wt.wind.strength = lerp(Wt.wind.strength, Wt.wind.target, Math.min(1, dt * 1.2));
      if (F.World && F.World.setWind) F.World.setWind(Wt.wind.angle, Wt.wind.strength);

      const targetP = Wt.enabled ? d.pAmp : 0;
      Wt.precip = lerp(Wt.precip, targetP, Math.min(1, dt * 0.45));
      updatePrecip(dt, playerPos, d);
      applyLight(d, dt);

      /* 雷暴闪光 */
      if (d.thunder && Wt.enabled && Wt.precip > 0.35) {
        Wt.flash -= dt;
        if (Wt.flash <= 0) { Wt.flash = F.rnd(3.5, 11); Wt._lit = 0.16; }
      }
      if (Wt._lit > 0) Wt._lit -= dt;

      /* 环境音 */
      Amb.tick(dt, Wt.ambience ? clamp(Wt.wind.strength / 1.6, 0, 1) : 0,
        Wt.ambience ? Wt.precip * (d.precip === 'rain' ? 1 : 0.22) : 0,
        Wt.ambience && !!d.thunder && Wt.precip > 0.5);

      /* 雷暴：露天缓慢掉血 */
      if (Wt.enabled && d.mods.hp && F.Player && !F.Player.indoor && !F.Player.dead) {
        F.Player.hp = Math.max(1, F.Player.hp - dt * 0.9);
      }
    },
  });

  /* ---------------------------- 降水粒子 ---------------------------- */
  const RN = 4200;
  function buildPrecip() {
    const mk = (box, color, size, rain, op) => {
      const g = new THREE.BufferGeometry();
      const arr = new Float32Array(RN * 3);
      const spd = new Float32Array(RN);
      for (let i = 0; i < RN; i++) {
        arr[i * 3] = (Math.random() - 0.5) * box;
        arr[i * 3 + 1] = Math.random() * 26;
        arr[i * 3 + 2] = (Math.random() - 0.5) * box;
        spd[i] = 0.7 + Math.random() * 0.6;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const m = new THREE.PointsMaterial({
        color, size: size, sizeAttenuation: true,
        transparent: true, opacity: op, depthWrite: false, fog: false,
      });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.visible = false;
      Wt.scene.add(pts);
      return { pts, arr, spd, geo: g, mat: m, box, rain };
    };
    Wt.rain = mk(56, 0xbfe0f5, 0.055, true, 0.55);
    Wt.snow = mk(46, 0xffffff, 0.16, false, 0.9);
  }

  function updatePrecip(dt, playerPos, d) {
    const home = Wt._home;
    if (playerPos) home.copy(playerPos);
    const wd = Wt.wind, wind = wd.strength;
    const wdx = Math.cos(wd.angle) * wind * 6.5, wdz = Math.sin(wd.angle) * wind * 6.5;
    const now = performance.now() * 0.001;

    for (const P of [Wt.rain, Wt.snow]) {
      if (!P) continue;
      const isRain = P.rain;
      const on = Wt.precip > 0.02 && ((isRain && d.precip === 'rain') || (!isRain && d.precip === 'snow'));
      P.pts.visible = on;
      if (!on) continue;
      P.mat.opacity = clamp(Wt.precip * (isRain ? 0.7 : 0.95), 0, 0.95);
      const n = Math.floor(RN * clamp(Wt.precip, 0, 1));
      P.geo.setDrawRange(0, n);
      const b = P.box;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        if (isRain) {
          P.arr[j + 1] -= (26 + wind * 8) * P.spd[i] * dt;
          P.arr[j] += wdx * dt; P.arr[j + 2] += wdz * dt;
        } else {
          P.arr[j + 1] -= (1.6 + (i % 7) * 0.2) * dt;
          P.arr[j] += (wdx * 0.45 + Math.sin(now * 1.3 + i) * 0.55) * dt;
          P.arr[j + 2] += (wdz * 0.45 + Math.cos(now * 1.1 + i * 1.7) * 0.55) * dt;
        }
        if (P.arr[j + 1] < 0) {
          P.arr[j] = home.x + (Math.random() - 0.5) * b;
          P.arr[j + 1] = isRain ? 20 + Math.random() * 8 : 18 + Math.random() * 6;
          P.arr[j + 2] = home.z + (Math.random() - 0.5) * b;
        }
        if (Math.abs(P.arr[j] - home.x) > b * 0.55) P.arr[j] = home.x + (Math.random() - 0.5) * b;
        if (Math.abs(P.arr[j + 2] - home.z) > b * 0.55) P.arr[j + 2] = home.z + (Math.random() - 0.5) * b;
      }
      P.geo.attributes.position.needsUpdate = true;
    }
  }

  /* ------------------------ 光照 / 雾（覆盖昼夜设置） ------------------------ */
  const _fc = new THREE.Color();
  function applyLight(d, dt) {
    const W = F.World;
    if (!W) return;
    const targetLight = Wt.enabled ? d.light : 1;
    Wt.lightK = lerp(Wt.lightK, targetLight, Math.min(1, dt * 0.6));
    const k = Wt.lightK * ((Wt._lit > 0) ? 1.9 : 1);
    if (W.sun) {
      if (W.sun.userData.base == null) W.sun.userData.base = W.sun.intensity;
      W.sun.intensity = W.sun.userData.base * k;
    }
    if (W.amb) {
      if (W.amb.userData.base == null) W.amb.userData.base = W.amb.intensity;
      W.amb.intensity = W.amb.userData.base * (0.55 + 0.45 * k);
    }
    const sc = Wt.scene;
    if (sc && sc.fog) {
      const far = lerp(sc.fog.far, Wt.enabled ? d.fogFar : 470, Math.min(1, dt * 0.5));
      sc.fog.far = far;
      sc.fog.near = clamp(far * 0.26, 10, 140);
      /* 雨雪天雾色偏灰蓝 */
      if (Wt.precip > 0.05) {
        _fc.setHex(d.precip === 'snow' ? 0xdfe6ee : 0x9aa8b4);
        sc.fog.color.lerp(_fc, Math.min(1, dt * 0.5));
      }
    }
  }
})();
