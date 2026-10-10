/* ==========================================================================
 * 牧野田园 Open Farm  ·  民居室内：进入房间 / 床 / 储物箱 / 房门
 * 室内建在远离地图的高空平台上，进出通过淡入淡出传送。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp;

  const CX = 0, CZ = -360;          /* 室内中心（世界坐标，远离 playable 区域） */
  const ROOM_W = 10.5, ROOM_D = 8.5, WALL_H = 3.2;

  const H = (F.House = {
    inside: false, ret: null, y0: 0, ft: 0,
    items: [], hideWhenInside: [], built: false,

    init(scene) {
      if (H.built) return;
      H.built = true;
      H.scene = scene;
      H.y0 = T.hAt(CX, CZ) + 26;      /* 抬高到群山之上，窗外只见天空 */
      H.ft = H.y0 + 0.15;             /* 地板面高度 */
      const ft = H.ft, g = new THREE.Group();
      /* 组整体平移到室内中心：下面所有构件一律用「相对 z」描述，避免两套坐标混用错位 */
      g.position.set(0, 0, CZ);

      const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
      const M = F.MATS.std;
      const mesh = (geo, arr) => { const m = new THREE.Mesh(F.mergeParts(arr), M); m.castShadow = false; m.receiveShadow = true; return m; };

      /* 地板 + 地毯 */
      g.add(Object.assign(mesh(0, [ { g: box(ROOM_W, 0.3, ROOM_D), c: 0xc9a878, t: [0, H.y0, 0] } ]), {}));
      const rug = mesh(0, [ { g: box(2.8, 0.05, 2.0), c: 0xb0705a, t: [0.2, ft + 0.02, 1.2] } ]);
      g.add(rug);

      /* 墙体（南墙留门洞） */
      const W = 0xe6dcc8, W2 = 0xd8ccb2;
      g.add(mesh(0, [ { g: box(ROOM_W, WALL_H, 0.25), c: W, t: [0, ft + WALL_H / 2, -ROOM_D / 2] } ]));            // 北
      g.add(mesh(0, [ { g: box(0.25, WALL_H, ROOM_D), c: W2, t: [-ROOM_W / 2, ft + WALL_H / 2, 0] } ]));               // 西
      g.add(mesh(0, [ { g: box(0.25, WALL_H, ROOM_D), c: W2, t: [ROOM_W / 2, ft + WALL_H / 2, 0] } ]));                // 东
      const segW = (ROOM_W - 1.8) / 2;
      const s1 = mesh(0, [ { g: box(segW, WALL_H, 0.25), c: W, t: [-(0.9 + segW / 2), ft + WALL_H / 2, ROOM_D / 2] } ]);
      const s2 = mesh(0, [ { g: box(segW, WALL_H, 0.25), c: W, t: [0.9 + segW / 2, ft + WALL_H / 2, ROOM_D / 2] } ]);
      g.add(s1); g.add(s2);

      /* 门框 */
      g.add(mesh(0, [
        { g: box(0.16, 2.3, 0.16), c: 0x8a6a4a, t: [-0.95, ft + 1.15, ROOM_D / 2] },
        { g: box(0.16, 2.3, 0.16), c: 0x8a6a4a, t: [0.95, ft + 1.15, ROOM_D / 2] },
        { g: box(2.1, 0.16, 0.18), c: 0x8a6a4a, t: [0, ft + 2.34, ROOM_D / 2] },
      ]));

      /* 屋顶（进屋后隐藏，避免遮挡第三人称镜头） */
      const roof = mesh(0, [ { g: box(ROOM_W + 0.8, 0.25, ROOM_D + 0.8), c: 0x8f5b46, t: [0, ft + WALL_H + 0.12, 0] } ]);
      g.add(roof);
      H.hideWhenInside = [roof, s1, s2];

      /* 窗（自发光，透出天光） */
      const winMat = new THREE.MeshStandardMaterial({ color: 0xbfe8f8, emissive: 0x9fd3e8, emissiveIntensity: 0.75, roughness: 0.4 });
      for (const wx of [-2.6, 0.2, 3.0]) {
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), winMat);
        wm.position.set(wx, ft + 1.85, -ROOM_D / 2 + 0.14);
        g.add(wm);
      }
      const wm2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), winMat);
      wm2.position.set(-ROOM_W / 2 + 0.14, ft + 1.85, -1.4);
      wm2.rotation.y = Math.PI / 2;
      g.add(wm2);

      /* 床（西侧）：可休息 1 小时 / 睡觉 8 小时 */
      g.add(mesh(0, [
        { g: box(1.6, 0.40, 2.4), c: 0xb08f62, t: [-3.3, ft + 0.26, -1.9] },
        { g: box(1.5, 0.20, 2.25), c: 0xf2efe6, t: [-3.3, ft + 0.56, -1.9] },
        { g: box(1.05, 0.16, 0.45), c: 0xffffff, t: [-3.3, ft + 0.68, -2.65] },
        { g: box(1.46, 0.12, 1.35), c: 0x7aa8d8, t: [-3.3, ft + 0.66, -1.40] },
        { g: box(1.7, 0.9, 0.14), c: 0x8a6a4a, t: [-3.3, ft + 0.75, -3.02] },
      ]));

      /* 储物箱（东北角）：可升级 */
      g.add(mesh(0, [
        { g: box(1.15, 0.66, 0.75), c: 0xb08f62, t: [3.7, ft + 0.40, -3.3] },
        { g: box(1.2, 0.2, 0.8), c: 0x6f5a44, t: [3.7, ft + 0.80, -3.3] },
        { g: box(0.16, 0.22, 0.05), c: 0xd9b04a, t: [3.7, ft + 0.52, -2.91] },
      ]));

      /* 小桌 + 油灯 */
      g.add(mesh(0, [
        { g: box(0.9, 0.08, 0.9), c: 0xb08f62, t: [3.5, ft + 0.62, 0.4] },
        { g: box(0.12, 0.62, 0.12), c: 0x6f5a44, t: [3.5, ft + 0.30, 0.4] },
        { g: box(0.16, 0.3, 0.16), c: 0xd9b04a, t: [3.5, ft + 0.80, 0.4] },
      ]));

      /* 暖色室内灯 */
      const lamp = new THREE.PointLight(0xffd9a0, 1.0, 16, 1.6);
      lamp.position.set(0, ft + 2.5, 0.4);
      g.add(lamp);

      scene.add(g);
      H.room = g;

      /* 交互点 */
      H.items = [
        { kind: 'bed', name: '床', x: -3.3, z: CZ - 1.9, y: ft, r: 1.9 },
        { kind: 'chest', name: '储物箱', x: 3.7, z: CZ - 3.3, y: ft, r: 1.7 },
        { kind: 'door', name: '房门', x: 0, z: CZ + ROOM_D / 2 - 0.5, y: ft, r: 1.5 },
      ];
    },

    enter(b) {
      if (H.inside) return;
      const P = F.Player;
      H.ret = { x: b.x, z: b.z + b.hd + 1.4 };
      const fd = F.fade || (fn => fn());
      fd(() => {
        H.inside = true;
        P.indoor = true; P.indoorY = H.ft; P.vy = 0;
        P.pos.set(0, H.ft, CZ + 2.6);
        P.camDist = Math.min(P.camDist, 6.2);
        P.camYaw = Math.PI;
        for (const m of H.hideWhenInside) m.visible = false;
        F.Inter.exitAll();
        F.UI.toast('回到家了，床上休息或储物箱整理物资', 'ok');
      });
    },

    exit() {
      if (!H.inside) return;
      const P = F.Player;
      const r = H.ret || { x: 4, z: 104 };
      const fd = F.fade || (fn => fn());
      fd(() => {
        H.inside = false;
        P.indoor = false;
        P.pos.set(r.x, T.hAt(r.x, r.z), r.z);
        P.camDist = 7.2;
        for (const m of H.hideWhenInside) m.visible = true;
        F.Inter.exitAll();
      });
    },

    /* 室内活动范围限制（不掉出地板） */
    clampPlayer(P) {
      P.pos.x = clamp(P.pos.x, -ROOM_W / 2 + 0.6, ROOM_W / 2 - 0.6);
      P.pos.z = clamp(P.pos.z, CZ - ROOM_D / 2 + 0.6, CZ + ROOM_D / 2 - 0.6);
    },
  });
})();
