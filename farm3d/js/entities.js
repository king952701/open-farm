/* ==========================================================================
 * 牧野田园 Open Farm  ·  实体：资源节点 / 农田 / 畜禽 / 鱼群 / 建筑 / 特效
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM, T = F.T;
  const clamp = F.clamp, lerp = F.lerp, smoothstep = F.smoothstep;

  /* ============================ 物品表 ============================ */
  /* p = 收购价（金币），d = 悬停说明 */
  F.ITEMS = {
    wood: { name: '木材', c: 0xb08f62, p: 2, d: '最常用的建材，砍树获得。' }, branch: { name: '树枝', c: 0x8a6a4a, p: 1, d: '细树枝，可当引火物。' },
    stone: { name: '石块', c: 0x9a9285, p: 2, d: '开采岩石获得的基础建材。' }, iron: { name: '铁矿', c: 0xc07a3c, p: 5, d: '可冶炼成铁锭。' },
    fiber: { name: '纤维', c: 0x8fb255, p: 1, d: '柔韧的植物纤维。' }, herb: { name: '草药', c: 0xa98bd6, p: 4, d: '炼金的基础材料。' },
    /* stam = 食用恢复的体力点数（与 foodOf 的饥饿恢复是两条线） */
    berry: { name: '浆果', c: 0xd8486a, p: 2, stam: 10, d: '灌木丛里结的野浆果，酸甜可口，食用恢复 10 点体力。' },
    flower: { name: '野花', c: 0xe08ab0, p: 3, d: '鲜艳的野花，也可装点家园。' }, hay: { name: '牧草', c: 0xd0ba72, p: 1, d: '畜禽的最爱。' },
    board: { name: '木板', c: 0xd8bb8a, p: 6, d: '工坊加工的精细建材。' }, brick: { name: '石砖', c: 0xb0a898, p: 6, d: '坚固的石制建材。' },
    rope: { name: '绳索', c: 0xc8b070, p: 4, d: '结实的绳索。' }, flour: { name: '面粉', c: 0xf0e6d0, p: 6, d: '磨坊磨出的面粉，可食用。' },
    glass: { name: '玻璃', c: 0xbfe8f0, p: 26, d: '石英烧制的透光建材，用于窗户与幕墙（工坊加工）。' },
    wheat: { name: '小麦', c: 0xd9b04a, p: 3, d: '最常见的作物，可磨面或出售。' },
    carrot: { name: '胡萝卜', c: 0xd9722f, p: 4, d: '爽脆的根茎作物。' },
    corn: { name: '玉米', c: 0xe8c552, p: 5, d: '饱满的玉米棒。' },
    pumpkin: { name: '南瓜', c: 0xdb7a2a, p: 8, d: '沉甸甸的大南瓜。' },
    tomato: { name: '番茄', c: 0xd8483c, p: 5, d: '多汁的番茄。' },
    milk: { name: '牛奶', c: 0xf0f0e0, p: 6, d: '奶牛的新鲜产出。' }, wool: { name: '羊毛', c: 0xf4f1e8, p: 6, d: '绵羊的柔软绒毛。' },
    egg: { name: '鸡蛋', c: 0xf2e6c8, p: 4, d: '母鸡产下的蛋。' }, mushroom: { name: '蘑菇', c: 0xb5533f, p: 4, d: '林间的蘑菇，可食用。' },
    baked: { name: '烤物', c: 0xd98a4a, p: 12, d: '篝火烤制的食物，恢复大量饥饿。' },
    copper: { name: '铜矿', c: 0xc87a3c, p: 4, d: '山间的铜矿脉产出。' },
    tin: { name: '锡矿', c: 0xb8bcc8, p: 5, d: '山间的锡矿脉产出。' },
    alum: { name: '铝矿', c: 0xd0d4dc, p: 6, d: '轻金属铝矿。' },
    silver: { name: '银矿', c: 0xe8e8f0, p: 10, d: '闪光的高价值矿脉。' },
    gold: { name: '金矿', c: 0xf0c840, p: 16, d: '稀有的金矿脉。' },
    crystal: { name: '水晶', c: 0x9adcf4, p: 12, d: '深山中晶莹的矿石。' },
    rainbow: { name: '彩虹晶', c: 0xff8ac8, p: 40, d: '传说中的七彩矿石，极为稀有。' },
    copper_ingot: { name: '铜锭', c: 0xd08850, p: 12, d: '冶炼后的铜锭。' },
    tin_ingot: { name: '锡锭', c: 0xccd0da, p: 14, d: '冶炼后的锡锭。' },
    bronze: { name: '青铜锭', c: 0xc88a4a, p: 28, d: '铜锡合金，坚固耐用。' },
    iron_ingot: { name: '铁锭', c: 0xb8bcc0, p: 14, d: '冶炼后的铁锭。' },
    alu_ingot: { name: '铝锭', c: 0xe0e4ec, p: 18, d: '轻巧的铝锭。' },
    silver_ingot: { name: '银锭', c: 0xf0f0f8, p: 30, d: '闪亮的银锭。' },
    gold_ingot: { name: '金锭', c: 0xf4cc50, p: 50, d: '贵重的金锭。' },
    gem_crystal: { name: '精制水晶', c: 0xaee8fc, p: 28, d: '打磨后的水晶饰品。' },
    gem_rainbow: { name: '彩虹宝石', c: 0xff9ad0, p: 96, d: '流转七彩光芒的传奇宝石。' },
    potion: { name: '体力药水', c: 0x7fe0a0, p: 20, d: '炼金调制：使用后每秒恢复 5 点体力，持续 3 秒。' },
    /* ---- 战斗掉落 ---- */
    meat: { name: '生肉', c: 0xc8685a, p: 6, d: '野兽掉落的肉，可烹饪或炼金。' },
    leather: { name: '皮革', c: 0xa8703c, p: 8, d: '结实的兽皮，裁缝与防具的材料。' },
    fur: { name: '毛发', c: 0xd8c8a8, p: 5, d: '柔软的兽毛，可织布。' },
    bone: { name: '骨头', c: 0xe8e4d4, p: 4, d: '野兽的骨头，炼骨粉的原料。' },
    /* ---- 炼金（系统材料 + 大世界产出） ---- */
    alkahest: { name: '万能溶剂', c: 0x8ad0e8, p: 0, d: '炼金术处出售的系统材料，不产出、不入拍卖。' },
    mana_powder: { name: '魔药粉', c: 0xb08ae8, p: 0, d: '炼金术处出售的系统材料。' },
    crystal_dust: { name: '晶尘', c: 0xaee8fc, p: 0, d: '炼金术处出售的系统材料。' },
    potion_hp: { name: '治疗药水', c: 0xff7a7a, p: 26, d: '立即恢复 40 点生命。' },
    potion_str: { name: '力量药剂', c: 0xffa04a, p: 30, d: '60 秒内攻击力提升 50%。' },
    potion_luck: { name: '幸运药剂', c: 0x9ae87a, p: 30, d: '120 秒内掉落率与宝箱几率提升。' },
    /* ---- 捕捉 ---- */
    ball_nab: { name: '纳球', c: 0x7fd8e8, p: 24, d: '工坊制作的捕捉球：投掷虚弱（生命 ≤40%）的野生动物，成功后收入坐骑栏（按 R 投掷）。' },
    /* ---- 副本 ---- */
    ticket: { name: '副本门票', c: 0xe8d060, p: 0, d: '进入世界塔副本的凭证（每次消耗 1 张）。' },
    /* ---- 装备 ---- */
    sword_wood: { name: '木剑', c: 0xb08f62, p: 10, d: '新手武器。' },
    sword_iron: { name: '铁剑', c: 0xc0c4c8, p: 60, d: '铁匠打造的可靠武器。' },
    sword_silver: { name: '银光剑', c: 0xe8ecf4, p: 260, d: '银光闪烁的利刃。' },
    sword_gold: { name: '黄金剑', c: 0xf0c840, p: 900, d: '华贵而致命。' },
    sword_rainbow: { name: '彩虹圣剑', c: 0xff9ad0, p: 3000, d: '传说中的七彩圣剑。' },
    armor_leather: { name: '皮甲', c: 0xa8703c, p: 45, d: '轻便的皮制护甲。' },
    armor_silver: { name: '亮银甲', c: 0xdfe4ec, p: 320, d: '中世纪亮银盔甲。' },
    armor_dragon: { name: '龙鳞甲', c: 0x6aa0d8, p: 1200, d: '以龙鳞锻造的重甲。' },
    cloak_fur: { name: '毛皮斗篷', c: 0xd8c8a8, p: 120, d: '保暖且耐穿。' },
    ring_gold: { name: '金戒指', c: 0xf0c840, p: 180, d: '增益首饰。' },
    amulet_moon: { name: '月牙护符', c: 0xc8b0f0, p: 700, d: '古老的护身符。' },
  };
  F.itemName = (id) => (F.ITEMS[id] ? F.ITEMS[id].name : id);

  /* ============================ 装备属性 / 品质 / 类别 ============================ */
  /* cat: 武器 / 防具 / 首饰 / 材料 / 消耗品   q: 普通 精良 稀有 史诗 传说 */
  F.EQUIP = {
    sword_wood: { cat: '武器', q: '普通', lv: 1, atk: 4, slot: 'weapon' },
    sword_iron: { cat: '武器', q: '精良', lv: 10, atk: 12, slot: 'weapon' },
    sword_silver: { cat: '武器', q: '稀有', lv: 20, atk: 22, slot: 'weapon' },
    sword_gold: { cat: '武器', q: '史诗', lv: 30, atk: 34, slot: 'weapon' },
    sword_rainbow: { cat: '武器', q: '传说', lv: 40, atk: 50, slot: 'weapon' },
    armor_leather: { cat: '防具', q: '普通', lv: 5, def: 6, slot: 'armor' },
    cloak_fur: { cat: '防具', q: '精良', lv: 15, def: 9, slot: 'armor' },
    armor_silver: { cat: '防具', q: '稀有', lv: 20, def: 18, slot: 'armor' },
    armor_dragon: { cat: '防具', q: '史诗', lv: 30, def: 30, slot: 'armor' },
    ring_gold: { cat: '首饰', q: '精良', lv: 12, def: 4, slot: 'trinket' },
    amulet_moon: { cat: '首饰', q: '史诗', lv: 28, def: 10, slot: 'trinket' },
  };
  F.QUALITIES = ['普通', '精良', '稀有', '史诗', '传说'];
  F.equipOf = (id) => F.EQUIP[id] || null;
  F.qualityOf = function (id) {
    if (id && id.indexOf('fish_') === 0) return '普通';
    if (F.EQUIP[id]) return F.EQUIP[id].q;
    if (id === 'sword_rainbow' || id === 'armor_dragon') return '传说';
    return '普通';
  };
  F.catOf = function (id) {
    if (F.EQUIP[id]) return F.EQUIP[id].cat;
    if (id === 'potion' || id === 'potion_hp' || id === 'potion_str' || id === 'potion_luck' || id === 'ball_nab') return '消耗品';
    if (id === 'alkahest' || id === 'mana_powder' || id === 'crystal_dust') return '材料';
    if (F.CROPS[id]) return '材料';
    return '材料';
  };
  F.levelOf = function (id) {
    if (F.EQUIP[id]) return F.EQUIP[id].lv;
    return 1;
  };
  /* 食用恢复：饥饿（foodOf）与体力（staminaOf）是两条独立的线
     ponytail: 放在物品表旁边而不是主循环里——纯数据派生、无副作用，测试和面板都能直接读 */
  F.foodOf = function (id) {
    if (id === 'baked') return 42;
    if (id === 'milk') return 12;
    if (id === 'egg') return 10;
    if (id === 'mushroom') return 9;
    if (id === 'flour') return 7;
    if (id && id.indexOf('fish_') === 0) {
      const sp = F.fishBy(id.slice(5));
      return sp ? sp.food : 0;
    }
    if (F.CROPS[id]) return F.CROPS[id].food;
    return 0;
  };
  F.staminaOf = function (id) {
    const it = F.ITEMS[id];
    return (it && it.stam) || 0;
  };

  /* 统一售价：物品表 → 作物表 → 鱼类（按食用恢复折算） */
  F.priceOf = function (id) {
    if (F.ITEMS[id] && F.ITEMS[id].p) return F.ITEMS[id].p;
    if (F.CROPS[id]) return F.CROPS[id].p || 3;
    if (id && id.indexOf('fish_') === 0) {
      const sp = F.fishBy(id.slice(5));
      if (sp) return Math.max(2, Math.round((sp.food || 4) * 0.8));
    }
    return 1;
  };

  /* ============================ 作物表 ============================ */
  F.CROPS = {
    wheat: { name: '小麦', seed: '小麦种子', grow: 200, yield: [2, 4], food: 14, c: 0xd9b04a, p: 3 },
    carrot: { name: '胡萝卜', seed: '胡萝卜种子', grow: 165, yield: [2, 4], food: 18, c: 0xd9722f, p: 4 },
    corn: { name: '玉米', seed: '玉米种子', grow: 260, yield: [2, 3], food: 22, c: 0xe8c552, p: 5 },
    pumpkin: { name: '南瓜', seed: '南瓜种子', grow: 300, yield: [1, 2], food: 30, c: 0xdb7a2a, p: 8 },
    tomato: { name: '番茄', seed: '番茄种子', grow: 225, yield: [3, 5], food: 16, c: 0xd8483c, p: 5 },
  };

  /* ============================ 鱼类表 ============================ */
  F.FISH = [
    { id: 'crucian', name: '鲫鱼', c: 0xd0b98a, w: 34, size: 0.9, food: 12 },
    { id: 'carp', name: '鲤鱼', c: 0xc98a4a, w: 26, size: 1.25, food: 18 },
    { id: 'bass', name: '鲈鱼', c: 0x8fa8b8, w: 15, size: 1.05, food: 16 },
    { id: 'trout', name: '鳟鱼', c: 0xb98a9a, w: 9, size: 0.85, food: 14 },
    { id: 'shrimp', name: '河虾', c: 0xc98a7a, w: 10, size: 0.55, food: 8 },
    { id: 'mandarin', name: '鳜鱼', c: 0x7fae6a, w: 4.5, size: 1.15, food: 24 },
    { id: 'sturgeon', name: '鲟鱼', c: 0x9aa4b0, w: 1.5, size: 1.7, food: 32 },
    { id: 'weed', name: '水草', c: 0x6f8a4a, w: 0, size: 0.6, food: 0, junk: true },
  ];
  F.fishBy = (id) => F.FISH.find(f => f.id === id);

  /* ============================ 资源节点 ============================ */
  const NODE_DEFS = F.NODE_DEFS = {
    oak: { name: '阔叶树', tool: 'axe', yield: { wood: 4, branch: 1 }, respawn: 110, hits: 3, r: 0.62, sc: [0.85, 1.35], shadow: true },
    pine: { name: '松树', tool: 'axe', yield: { wood: 5, branch: 1 }, respawn: 125, hits: 3, r: 0.58, sc: [0.9, 1.4], shadow: true },
    birch: { name: '白桦', tool: 'axe', yield: { wood: 3, branch: 1 }, respawn: 95, hits: 2, r: 0.5, sc: [0.85, 1.25], shadow: true },
    dead: { name: '枯树', tool: 'axe', yield: { wood: 2, branch: 3 }, respawn: 150, hits: 2, r: 0.5, sc: [0.8, 1.2], shadow: true },
    /* bonus：概率额外产出 { 物品: { p 概率, n: [最小, 最大] } } —— 灌木丛 50% 概率出一捧浆果 */
    bush: { name: '灌木丛', tool: 'sickle', yield: { fiber: 2, branch: 1 }, bonus: { berry: { p: 0.5, n: [5, 10] } }, respawn: 80, hits: 1, r: 0.68, sc: [0.8, 1.4] },
    /* 浆果丛：原「装饰浆果丛」转正 —— 以前是纯装饰层（看得见采不着），现在全图统一可采集 */
    berrybush: { name: '浆果丛', tool: 'sickle', yield: { berry: 2 }, bonus: { berry: { p: 0.5, n: [5, 10] } }, respawn: 90, hits: 1, r: 0.4, sc: [0.8, 1.3] },
    rock: { name: '岩石', tool: 'pick', yield: { stone: 3 }, respawn: 100, hits: 3, r: 0.95, sc: [0.7, 1.5], shadow: true },
    iron: { name: '铁矿脉', tool: 'pick', yield: { stone: 1, iron: 2 }, respawn: 185, hits: 4, r: 0.95, sc: [0.8, 1.3], shadow: true, lv: 10 },
    copper: { name: '铜矿脉', tool: 'pick', yield: { stone: 1, copper: 2 }, respawn: 190, hits: 4, r: 0.95, sc: [0.8, 1.3], shadow: true },
    tin: { name: '锡矿脉', tool: 'pick', yield: { stone: 1, tin: 2 }, respawn: 200, hits: 4, r: 0.95, sc: [0.8, 1.3], shadow: true, lv: 15 },
    alum: { name: '铝矿脉', tool: 'pick', yield: { stone: 1, alum: 2 }, respawn: 210, hits: 4, r: 0.95, sc: [0.8, 1.3], shadow: true, lv: 18 },
    silver: { name: '银矿脉', tool: 'pick', yield: { stone: 1, silver: 2 }, respawn: 240, hits: 5, r: 0.95, sc: [0.8, 1.3], shadow: true, lv: 20 },
    gold: { name: '金矿脉', tool: 'pick', yield: { stone: 1, gold: 2 }, respawn: 260, hits: 5, r: 0.95, sc: [0.8, 1.3], shadow: true, lv: 30 },
    crystal: { name: '水晶矿', tool: 'pick', yield: { crystal: 1, stone: 1 }, respawn: 300, hits: 5, r: 0.95, sc: [0.85, 1.35], shadow: true, lv: 36 },
    rainbow: { name: '彩虹矿', tool: 'pick', yield: { rainbow: 1 }, respawn: 420, hits: 6, r: 0.95, sc: [0.9, 1.3], shadow: true, lv: 45 },
    pile: { name: '碎石堆', tool: 'pick', yield: { stone: 2 }, respawn: 70, hits: 1, r: 0.7, sc: [0.6, 1.1] },
    herb: { name: '草药', tool: 'sickle', yield: { herb: 2 }, respawn: 90, hits: 1, r: 0.4, sc: [0.8, 1.3] },
    flower: { name: '野花', tool: 'sickle', yield: { flower: 2 }, respawn: 70, hits: 1, r: 0.35, sc: [0.8, 1.3], tint: true },
    reed: { name: '芦苇', tool: 'sickle', yield: { fiber: 2 }, respawn: 85, hits: 1, r: 0.4, sc: [0.8, 1.4] },
    branch: { name: '枯枝', tool: 'sickle', yield: { branch: 2 }, respawn: 75, hits: 1, r: 0.45, sc: [0.8, 1.3] },
    hay: { name: '牧草', tool: 'sickle', yield: { hay: 3 }, respawn: 70, hits: 1, r: 0.5, sc: [0.8, 1.35] },
    mushroom: { name: '蘑菇', tool: 'sickle', yield: { mushroom: 2 }, respawn: 120, hits: 1, r: 0.35, sc: [0.8, 1.3] },
    vine: { name: '藤蔓', tool: 'sickle', yield: { fiber: 3 }, respawn: 110, hits: 1, r: 0.4, sc: [0.8, 1.3], hang: true },
  };
  const FLOWER_COLORS = [0xe8607a, 0xf0c04a, 0xc78ae0, 0xf0f0f0, 0xe88a4a, 0x9ac6f0];
  /* 使用岩石模型的节点类型（含全部矿脉） */
  F.ORE_TYPES = { rock: 1, iron: 1, pile: 1, copper: 1, tin: 1, alum: 1, silver: 1, gold: 1, crystal: 1, rainbow: 1 };

  /* ==========================================================================
   * 采集资源头顶名称牌（蓝色常驻）
   * ponytail: 全图四千多个节点，不可能人人都挂一块牌子 —— 只给「玩家附近」的节点发牌，
   *   用固定大小的对象池循环复用（桌面 48 / 手机 30），同名资源共用一张文字贴图。
   *   牌子是 Sprite：自动朝向相机、随距离缩小、被山体建筑挡住时会被深度测试遮掉。
   *   文字用 Canvas2D 现画，不引入任何外部美术资源（与全项目「零外部资源」一致）。
   * ========================================================================== */
  const LBL = (F.NodeLabel = { pool: [], keys: new Map(), top: {}, cool: 0, R: 26, cap: 48, ready: false });

  /* 名称 → 文字贴图（同名共用一张） */
  function nameTex(name) {
    let o = LBL.keys.get(name);
    if (o) return o;
    const FS = 44, PAD = 22, H = 68;
    const font = '700 ' + FS + 'px "PingFang SC","Microsoft YaHei","Hiragino Sans GB",system-ui,sans-serif';
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const w = Math.max(110, Math.ceil(m.measureText(name).width) + PAD * 2);
    const c = document.createElement('canvas');
    c.width = w; c.height = H;
    const g = c.getContext('2d');
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(8,26,48,0.66)';                    /* 深蓝胶囊底衬：草地 / 雪地 / 矿洞里都看得清 */
    g.beginPath();
    if (g.roundRect) g.roundRect(2, 2, w - 4, H - 4, (H - 4) / 2);
    else g.rect(2, 2, w - 4, H - 4);
    g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(150,215,255,0.60)'; g.stroke();
    g.fillStyle = '#8fd6ff';                               /* 蓝色资源名 */
    g.fillText(name, w / 2, H / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    o = { tex, aspect: w / H };
    LBL.keys.set(name, o);
    return o;
  }

  const N = (F.Nodes = {
    list: [], meshes: {}, grid: null, cell: 10, gw: 0, seed: 20250101,

    init(scene) {
      N.scene = scene;
      const groups = {};
      /* --- 散布 --- */
      const rnd = F.mulberry32(N.seed);
      const plans = [
        ['oak', 190, (x, z) => N.inForest(x, z, 210) && !T.isWater(x, z)],
        ['pine', 150, (x, z) => N.inForest(x, z, 240) && T.hAt(x, z) > 6],
        ['birch', 70, (x, z) => N.inForest(x, z, 300) && !T.isWater(x, z)],
        ['dead', 34, (x, z) => N.inForest(x, z, 200)],
        ['bush', 120, (x, z) => true],
        ['berrybush', 2800, (x, z) => T.hAt(x, z) > 2],   /* 全图撒布，替代原装饰浆果丛层 */
        ['rock', 120, (x, z) => T.slopeAt(x, z) > 0.18 || N.inForest(x, z, 260)],
        ['iron', 46, (x, z) => T.hAt(x, z) > 13 && !T.isWater(x, z)],
        ['copper', 60, (x, z) => T.hAt(x, z) > 12 && !T.isWater(x, z)],
        ['tin', 46, (x, z) => T.hAt(x, z) > 13 && !T.isWater(x, z)],
        ['alum', 40, (x, z) => T.hAt(x, z) > 14 && !T.isWater(x, z)],
        ['silver', 30, (x, z) => T.hAt(x, z) > 18 && !T.isWater(x, z)],
        ['gold', 22, (x, z) => T.hAt(x, z) > 19 && !T.isWater(x, z)],
        ['crystal', 18, (x, z) => T.hAt(x, z) > 20 && !T.isWater(x, z)],
        ['rainbow', 8, (x, z) => T.hAt(x, z) > 25 && !T.isWater(x, z)],
        ['pile', 55, (x, z) => true],
        ['herb', 130, (x, z) => N.inForest(x, z, 320)],
        ['flower', 210, (x, z) => T.hAt(x, z) > 1.2 && T.hAt(x, z) < 16],
        ['reed', 130, (x, z) => N.nearShore(x, z)],
        ['branch', 70, (x, z) => N.inForest(x, z, 220)],
        ['hay', 170, (x, z) => T.hAt(x, z) > 1.2 && T.hAt(x, z) < 18],
        ['mushroom', 50, (x, z) => N.inForest(x, z, 190)],
        ['vine', 60, (x, z) => N.inForest(x, z, 200) && T.hAt(x, z) > 2],
      ];
      // 最小间距网格
      const CELL = 4, GW = Math.ceil(620 / CELL);
      const occ = new Int16Array(GW * GW).fill(-1);
      const occupied = (x, z) => {
        const i = ((x + 310) / CELL) | 0, j = ((z + 310) / CELL) | 0;
        if (i < 0 || j < 0 || i >= GW || j >= GW) return true;
        return occ[j * GW + i] >= 0;
      };
      const mark = (x, z) => {
        const i = ((x + 310) / CELL) | 0, j = ((z + 310) / CELL) | 0;
        if (i >= 0 && j >= 0 && i < GW && j < GW) occ[j * GW + i] = 1;
      };

      const madeTypes = {};
      for (const [type, count, test] of plans) {
        let made = 0, tries = 0;
        /* 藤蔓挂在已有树干上，避免悬空 */
        if (type === 'vine') {
          const hosts = [].concat(madeTypes.oak || [], madeTypes.pine || [], madeTypes.birch || []);
          for (let i = 0; i < count && hosts.length; i++) {
            const host = hosts[(rnd() * hosts.length) | 0];
            const x = host.x + (rnd() - 0.5) * 1.6, z = host.z + (rnd() - 0.5) * 1.6;
            const def = NODE_DEFS.vine;
            const s = lerp(def.sc[0], def.sc[1], rnd());
            const node = {
              type, def, x, z, y: host.y + (host.type === 'pine' ? 4.2 : 4.9) * host.s, ry: rnd() * 6.283, s,
              alive: true, respawn: 0, grow: 1, hits: def.hits, idx: 0, tint: 0, host,
              van: 1,                       /* 消失动画进度 0→1（1 = 没在播） */
            };
            N.list.push(node);
            (madeTypes.vine || (madeTypes.vine = [])).push(node);
            made++;
          }
          groups[type] = made;
          continue;
        }
        while (made < count && tries < count * 26) {
          tries++;
          const x = (rnd() - 0.5) * 540, z = (rnd() - 0.5) * 540;
          if (Math.hypot(x, z) > 272) continue;
          if (T.isWater(x, z)) continue;
          if (T.depthAt(x, z) > -0.6 && T.hAt(x, z) < 0.9) continue;
          if (T.slopeAt(x, z) > 0.62) continue;
          if (T.pathDist(x, z) < 3.0) continue;
          if (T.zoneAt(x, z)) continue;
          if (F.playerSafe && F.playerSafe(x, z)) continue;
          if (!test(x, z)) continue;
          if (occupied(x, z)) continue;
          const h = T.hAt(x, z);
          if (h < 0.55) continue;
          mark(x, z);
          const def = NODE_DEFS[type];
          const s = lerp(def.sc[0], def.sc[1], rnd());
          const node = {
            type, def, x, z, y: h, ry: rnd() * 6.283, s,
            alive: true, respawn: 0, grow: 1, hits: def.hits, idx: 0,
            tint: def.tint ? FLOWER_COLORS[(rnd() * FLOWER_COLORS.length) | 0] : 0,
            van: 1,                       /* 消失动画进度 0→1（1 = 没在播） */
          };
          N.list.push(node);
          (madeTypes[type] || (madeTypes[type] = [])).push(node);
          made++;
        }
        groups[type] = made;
      }

      /* --- 建立 InstancedMesh --- */
      const byType = {};
      for (const n of N.list) (byType[n.type] || (byType[n.type] = [])).push(n);
      for (const type in byType) {
        const arr = byType[type];
        const def = NODE_DEFS[type];
        const geo = (type === 'oak' || type === 'pine' || type === 'birch' || type === 'dead' || type === 'bush')
          ? F.PROPS.tree(type === 'bush' ? 'bush' : type)
          : F.ORE_TYPES[type] ? F.PROPS.rock(type)
            : (type === 'vine') ? F.PROPS.plant('vine')
              : (type === 'berrybush') ? F.PROPS.flora('berry')   /* 和原装饰浆果丛同一套模型，外观无缝 */
                : F.PROPS.plant(type);
        const mat = F.MATS.std;
        const mesh = new THREE.InstancedMesh(geo, mat, arr.length);
        mesh.castShadow = !!def.shadow; mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        F.ensureInstColor(mesh);
        arr.forEach((n, i) => {
          n.idx = i;
          n.by = n.y;
          F.setInst(mesh, i, n.x, n.by, n.z, n.ry, n.s, n.tint ? new THREE.Color().setHex(n.tint) : null);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
        N.meshes[type] = mesh;
      }

      /* --- 查询网格 --- */
      N.cell = 12; N.gw = Math.ceil(640 / N.cell);
      N.grid = new Array(N.gw * N.gw);
      for (const n of N.list) {
        const i = ((n.x + 320) / N.cell) | 0, j = ((n.z + 320) / N.cell) | 0;
        const k = j * N.gw + i;
        (N.grid[k] || (N.grid[k] = [])).push(n);
      }
      N.stats = groups;
      return groups;
    },

    inForest(x, z, r) {
      const d = F.dist2(x, z, T.FOREST_CORE.x, T.FOREST_CORE.z);
      const hills = F.dist2(x, z, 208, -138) < 170 * 170;
      return d < r * r || hills;
    },
    nearShore(x, z) {
      const h = T.hAt(x, z);
      return h > 0.25 && h < 1.7;
    },

    /* 附近节点（用于交互 & 碰撞） */
    near(x, z, r, filter) {
      const out = [];
      const i0 = Math.max(0, ((x + 320 - r) / N.cell) | 0), i1 = Math.min(N.gw - 1, ((x + 320 + r) / N.cell) | 0);
      const j0 = Math.max(0, ((z + 320 - r) / N.cell) | 0), j1 = Math.min(N.gw - 1, ((z + 320 + r) / N.cell) | 0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = N.grid[j * N.gw + i]; if (!c) continue;
        for (const n of c) {
          if (!n.alive) continue;
          if (filter && !filter(n)) continue;
          const d = F.dist2(x, z, n.x, n.z);
          if (d <= r * r) out.push({ n, d });
        }
      }
      out.sort((a, b) => a.d - b.d);
      return out;
    },
    /* 碰撞体（树/石） */
    colliders(x, z, r, out) {
      const near = N.near(x, z, r + 2);
      for (const e of near) {
        const n = e.n;
        if (n.def.r < 0.45) continue;
        out.push({ x: n.x, z: n.z, r: n.def.r * n.s * 0.8 });
      }
      return out;
    },

    harvest(node) {
      if (!node.alive) return null;
      node.alive = false;
      node.respawn = node.def.respawn;
      node.hits = node.def.hits;
      node.grow = 0;
      const mesh = N.meshes[node.type];
      /* 采集次数耗尽 → 播消失动画（先鼓一下再缩走 + 尘土），播完才真正隐藏实例，
         不再是「啪」地瞬移消失；砍树另有 Nodes.fall 的倒下动画，别两套一起播 */
      if (node.def.tool === 'axe') {
        node.van = 1;
        F.hideInst(mesh, node.idx);
        mesh.instanceMatrix.needsUpdate = true;
      } else {
        node.van = 0;
        N.vanishFx(node);
      }
      /* ponytail: 返回拷贝而不是 def.yield 本身——概率产出要写进结果，不能污染节点定义 */
      const out = Object.assign({}, node.def.yield);
      const bo = node.def.bonus;
      if (bo) {
        for (const k in bo) {
          const b = bo[k];
          /* 叠加而不是替换：浆果丛自己就是 berry 主产出，bonus 命中时是「基础 + 额外」 */
          if (Math.random() < b.p) out[k] = (out[k] || 0) + F.rndi(b.n[0], b.n[1]);
        }
      }
      return out;
    },

    update(dt) {
      let dirty = false;
      for (const n of N.list) {
        if (n.alive) {
          if (n.grow < 1) {
            n.grow = Math.min(1, n.grow + dt / 8);
            const s = n.s * smoothstep(0, 1, n.grow);
            const mesh = N.meshes[n.type];
            F.setInst(mesh, n.idx, n.x, n.by, n.z, n.ry, s, n.tint ? new THREE.Color().setHex(n.tint) : null);
            dirty = true;
          }
        } else {
          /* 采集耗尽后的消失动画：先微微鼓一下，再边缩边沉边转一点点，播完隐藏实例。
             与生长（grow）用的是同一套 instance 缩放，但走独立的 van 字段，
             不会和 respawn 重生逻辑打架 —— 重生时 van 复位成 1 */
          if (n.van < 1) {
            n.van = Math.min(1, n.van + dt / 0.5);
            const k = 1 - n.van;
            const s = Math.max(0.0001, n.s * k * (1 + 0.28 * Math.sin(Math.PI * n.van)));
            const mesh = N.meshes[n.type];
            F.setInst(mesh, n.idx, n.x, n.by - n.van * 0.45, n.z, n.ry + n.van * 1.1, s);
            dirty = true;
            if (n.van >= 1) F.hideInst(mesh, n.idx);
          }
          if (n.respawn > 0) {
            n.respawn -= dt;
            if (n.respawn <= 0) {
              n.alive = true; n.grow = 0.001; n.van = 1;
              F.setInst(N.meshes[n.type], n.idx, n.x, n.by, n.z, n.ry, 0.001, n.tint ? new THREE.Color().setHex(n.tint) : null);
              dirty = true;
            }
          }
        }
      }
      if (dirty) for (const k in N.meshes) N.meshes[k].instanceMatrix.needsUpdate = true;
    },

    /* 采集耗尽的一瞬间：碎屑迸发（按工具分色）+ 一圈尘土 */
    vanishFx(n) {
      if (!F.FX) return;
      const c = n.def.tool === 'pick' ? 0xa8a094 : (n.def.tool === 'sickle' ? 0x8fb255 : 0x7fae4a);
      F.FX.burst(n.x, n.by + 0.35, n.z, c, 10, 0.75);
      F.FX.burst(n.x, n.by + 0.15, n.z, 0xcbb894, 8, 0.55);   /* 地面扬尘 */
    },

    /* 头顶名称牌刷新：节流 0.2 秒 —— 只有玩家挪动后才需要重排 */
    updateLabels(dt, px, pz) {
      if (!N.scene || !N.meshes || !(F.FX && F.FX.camera)) return;
      if (!LBL.ready) {
        LBL.ready = true;
        LBL.cap = F.coarseDevice ? 30 : 48;
        /* 每种模型的高度量一次：牌子挂模型顶上，而不是脚下 */
        for (const k in N.meshes) {
          try { LBL.top[k] = Math.max(0.5, F.measure(N.meshes[k].geometry).max.y); } catch (e) { LBL.top[k] = 1.2; }
        }
        const ph = nameTex('资源');
        for (let i = 0; i < LBL.cap; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: ph.tex, transparent: true, depthWrite: false,
            sizeAttenuation: false,      /* 恒定屏幕尺寸：近处的牌子不会糊脸放大 */
            fog: false, opacity: 0,
          }));
          sp.visible = false; sp.renderOrder = 3;
          N.scene.add(sp);
          LBL.pool.push(sp);
        }
      }
      LBL.cool -= dt;
      if (LBL.cool > 0) return;
      LBL.cool = 0.2;
      const near = N.near(px, pz, LBL.R);
      const cnt = Math.min(near.length, LBL.pool.length);
      for (let i = 0; i < LBL.pool.length; i++) {
        const sp = LBL.pool[i];
        if (i >= cnt) { sp.visible = false; continue; }
        const e = near[i], nd = e.n, d = Math.sqrt(e.d);
        const name = nd.def.name;
        if (sp.userData.key !== name) {
          const t = nameTex(name);
          sp.material.map = t.tex; sp.material.needsUpdate = true;
          sp.userData.key = name;
          /* sizeAttenuation:false 时 scale 是「屏高占比」：0.055 ≈ 5.5% 屏高 */
          const h = 0.055 * (F.coarseDevice ? 1.3 : 1);
          sp.scale.set(h * t.aspect, h, 1);
        }
        sp.position.set(nd.x, nd.by + (LBL.top[nd.type] || 1.2) * nd.s + 0.34, nd.z);
        /* 远处淡出，26m 外不显示 —— 免得满屏都是牌子 */
        const fade = 1 - Math.max(0, (d - LBL.R * 0.62) / (LBL.R * 0.38));
        sp.material.opacity = fade;
        sp.visible = fade > 0.02;
      }
    },

    /* 砍伐时的倒下动画 */
    fall(node, done) {
      node.van = 1;                 /* 倒下动画接管，别再播收缩消失那套 */
      const mesh = N.meshes[node.type];
      const geo = mesh.geometry;
      const m = new THREE.Mesh(geo, F.MATS.std);
      m.castShadow = true;
      m.position.set(node.x, node.by, node.z);
      m.rotation.y = node.ry;
      m.scale.setScalar(node.s);
      N.scene.add(m);
      const dir = Math.random() * 6.283;
      const t0 = performance.now();
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / 900);
        const e = k * k;
        m.rotation.z = Math.cos(dir) * e * 1.45;
        m.rotation.x = Math.sin(dir) * e * 1.45;
        m.position.y = node.by - e * 0.35;
        if (k < 1) requestAnimationFrame(tick);
        else {
          N.scene.remove(m);
          // 留下倒木残骸一小会儿
          const log = new THREE.Mesh(geo, F.MATS.std);
          log.position.set(node.x, node.by - 0.35, node.z);
          log.rotation.set(Math.sin(dir) * 1.45, node.ry, Math.cos(dir) * 1.45);
          log.scale.setScalar(node.s);
          log.castShadow = true;
          N.scene.add(log);
          setTimeout(() => N.scene.remove(log), 12000);
          if (done) done();
        }
      };
      tick();
    },
  });

  /* ============================ 农田 ============================ */
  const TILE = 2.4, SOIL_CAP = 420;
  const Farm = (F.Farm = {
    tiles: [], map: {}, soil: null, pools: {}, zoneTiles: {},

    init(scene) {
      Farm.scene = scene;
      /* 土壤 */
      const g = new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96, 6, 6);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        let y = 0.055 * Math.cos(x * (Math.PI * 4 / (TILE * 0.96)));
        const edge = Math.max(Math.abs(x), Math.abs(z)) / (TILE * 0.48);
        y -= smoothstep(0.72, 1.0, edge) * 0.06;
        p.setY(i, y);
      }
      g.computeVertexNormals();
      const soilGeo = F.mergeParts([{ g, c: 0x7a5c3c }]);
      const mesh = new THREE.InstancedMesh(soilGeo, F.MATS.std, SOIL_CAP);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      F.ensureInstColor(mesh);
      scene.add(mesh);
      Farm.soil = mesh;

      /* 作物池 */
      for (const k in F.CROPS) {
        const geo = F.PROPS.crop(k);
        const m = new THREE.InstancedMesh(geo, F.MATS.std, 200);
        m.castShadow = true; m.receiveShadow = true;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        F.ensureInstColor(m);
        m.count = 200;
        for (let i = 0; i < 200; i++) F.hideInst(m, i);
        m.instanceMatrix.needsUpdate = true;
        scene.add(m);
        Farm.pools[k] = { mesh: m, free: [], cap: 200 };
        for (let i = 199; i >= 0; i--) Farm.pools[k].free.push(i);
      }

      /* 生成地块 */
      for (const zone of T.ZONES) {
        const cols = Math.floor(zone.w / TILE), rows = Math.floor(zone.d / TILE);
        const x0 = zone.x - (cols * TILE) / 2, z0 = zone.z - (rows * TILE) / 2;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const x = x0 + (c + 0.5) * TILE, z = z0 + (r + 0.5) * TILE;
          const t = {
            x, z, y: T.hAt(x, z) - 0.02, zone: zone.id, tx: c, tz: r,
            state: 0, crop: null, growth: 0, water: 0, slot: -1, soilSlot: -1, wet: 0,
          };
          Farm.tiles.push(t);
          Farm.map[zone.id + '_' + c + '_' + r] = t;
        }
      }
      Farm.keyOf = (x, z) => {
        const zone = T.zoneAt(x, z); if (!zone) return null;
        const cols = Math.floor(zone.w / TILE), rows = Math.floor(zone.d / TILE);
        const x0 = zone.x - (cols * TILE) / 2, z0 = zone.z - (rows * TILE) / 2;
        const c = Math.floor((x - x0) / TILE), r = Math.floor((z - z0) / TILE);
        return zone.id + '_' + c + '_' + r;
      };
    },

    tileAt(x, z) {
      const k = Farm.keyOf(x, z);
      return k ? Farm.map[k] || null : null;
    },
    /* 玩家脚下/最近地块 */
    tileNear(x, z, maxD) {
      const t = Farm.tileAt(x, z);
      if (t) return t;
      let best = null, bd = (maxD || 3.2) * (maxD || 3.2);
      for (const t2 of Farm.tiles) {
        const d = F.dist2(x, z, t2.x, t2.z);
        if (d < bd) { bd = d; best = t2; }
      }
      return best;
    },
    occupied(x, z) {
      const t = Farm.tileAt(x, z);
      return !!(t && t.state > 0);
    },

    allocSoil(t) {
      if (t.soilSlot >= 0) return t.soilSlot;
      const m = Farm.soil;
      if (m.count >= SOIL_CAP) return -1;
      const slot = m.count++;
      t.soilSlot = slot;
      F.setInst(m, slot, t.x, t.y, t.z, 0, 1, new THREE.Color().setHex(0xb0a08a));
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      return slot;
    },
    setSoilColor(t, hex) {
      if (t.soilSlot < 0) return;
      Farm.soil.setColorAt(t.soilSlot, new THREE.Color().setHex(hex));
      if (Farm.soil.instanceColor) Farm.soil.instanceColor.needsUpdate = true;
    },
    freeSoil(t) {
      if (t.soilSlot < 0) return;
      F.hideInst(Farm.soil, t.soilSlot);
      Farm.soil.instanceMatrix.needsUpdate = true;
      t.soilSlot = -1;
    },

    allocCrop(t, type) {
      const p = Farm.pools[type];
      if (!p || !p.free.length) return false;
      t.crop = type; t.slot = p.free.pop();
      Farm.updateCropVisual(t);
      return true;
    },
    freeCrop(t) {
      if (!t.crop || t.slot < 0) return;
      const p = Farm.pools[t.crop];
      F.hideInst(p.mesh, t.slot);
      p.mesh.instanceMatrix.needsUpdate = true;
      p.free.push(t.slot);
      t.crop = null; t.slot = -1; t.growth = 0;
    },
    updateCropVisual(t) {
      if (!t.crop || t.slot < 0) return;
      const p = Farm.pools[t.crop];
      const g = clamp(t.growth, 0, 1);
      const s = 0.18 + 0.82 * g;
      const c = new THREE.Color().setRGB(lerp(0.62, 1, g), lerp(0.98, 1, g), lerp(0.55, 1, g));
      F.setInst(p.mesh, t.slot, t.x, t.y + 0.02, t.z, (t.tx * 1.7 + t.tz * 2.3) % 6.283, s, c);
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    },

    /* state: 0 野地 1 已开垦 2 已播种 */
    till(t) {
      if (t.state !== 0) return false;
      t.state = 1; t.water = 0; t.wet = 0;
      Farm.allocSoil(t);
      Farm.setSoilColor(t, 0xa89878);
      return true;
    },
    plant(t, crop) {
      if (t.state !== 1) return false;
      if (!Farm.allocCrop(t, crop)) return false;
      t.state = 2; t.growth = 0; t.water = 0.35; t.wet = 0;
      Farm.setSoilColor(t, 0x8a6a4a);
      Farm.updateCropVisual(t);
      return true;
    },
    water(t) {
      if (t.state === 0) return false;
      t.water = 1; t.wet = 1;
      Farm.setSoilColor(t, 0x5f4630);
      return true;
    },
    harvest(t) {
      if (t.state !== 2 || t.growth < 1) return null;
      const def = F.CROPS[t.crop];
      const n = F.rndi(def.yield[0], def.yield[1]);
      const seeds = F.rndi(1, 2);
      Farm.freeCrop(t);
      t.state = 1; t.water = 0; t.wet = 0;
      Farm.setSoilColor(t, 0x8a6a4a);
      return { crop: def.name, id: t.crop, n, seeds };
    },
    clear(t) {
      if (t.state === 0) return false;
      Farm.freeCrop(t);
      Farm.freeSoil(t);
      t.state = 0; t.growth = 0; t.water = 0;
      return true;
    },
    stageOf(t) {
      const g = t.growth;
      if (g >= 1) return 4;
      if (g > 0.72) return 3;
      if (g > 0.42) return 2;
      if (g > 0.14) return 1;
      return 0;
    },

    update(dt, speed) {
      for (const t of Farm.tiles) {
        if (t.state !== 2 || !t.crop) continue;
        if (t.water > 0.02) {
          t.water = Math.max(0, t.water - dt / 190);
          const boost = t.water > 0.35 ? 1.55 : 1.0;
          t.growth = Math.min(1, t.growth + (dt * speed) / F.CROPS[t.crop].grow * boost);
        }
        if (t.wet > 0) {
          t.wet = Math.max(0, t.wet - dt / 26);
          if (t.wet === 0) Farm.setSoilColor(t, t.water > 0.3 ? 0x6f5238 : 0xa89878);
        }
      }
    },
    visualTick() {
      for (const t of Farm.tiles) if (t.state === 2) Farm.updateCropVisual(t);
    },
  });

  /* ============================ 掉落物 ============================ */
  const Drops = (F.Drops = {
    list: [], mesh: null, cap: 80,
    init(scene) {
      const geo = F.mergeParts([
        { g: new THREE.IcosahedronGeometry(0.18, 0), c: 0xffffff, t: [0, 0.18, 0] },
        { g: new THREE.BoxGeometry(0.34, 0.05, 0.34), c: 0xffffff, t: [0, 0.03, 0] },
      ]);
      const m = new THREE.InstancedMesh(geo, F.MATS.std, Drops.cap);
      m.castShadow = true;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      F.ensureInstColor(m);
      scene.add(m);
      Drops.mesh = m;
    },
    add(x, z, item, n, y) {
      if (Drops.list.length >= Drops.cap) return;
      Drops.list.push({ x, z, y: (y != null ? y : T.hAt(x, z)), item, n, t: Math.random() * 6.283, born: performance.now() });
    },
    update(dt, px, pz) {
      const m = Drops.mesh;
      let i = 0;
      for (let k = Drops.list.length - 1; k >= 0; k--) {
        const d = Drops.list[k];
        d.t += dt;
        const dd = F.dist2(px, pz, d.x, d.z);
        if (dd < 1.6 * 1.6) {
          F.Game.give(d.item, d.n);
          F.UI.toast('拾取 ' + F.itemName(d.item) + ' ×' + d.n, 'ok');
          F.Audio2.pick();
          Drops.list.splice(k, 1);
          continue;
        }
        if (i < Drops.cap) {
          const bob = Math.sin(d.t * 2.4) * 0.06;
          F.setInst(m, i, d.x, d.y + 0.1 + bob, d.z, d.t * 0.7, 1, new THREE.Color().setHex((F.ITEMS[d.item] || { c: 0xffffff }).c));
          i++;
        }
      }
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    },
  });

  /* ============================ 畜禽 ============================ */
  const ANIMAL_DEF = F.ANIMAL_DEF = {
    cow: { name: '奶牛', make: () => F.Creatures.createAnimalModel('cow'), speed: 1.55, run: 3.4, product: 'milk', pname: '牛奶', ptime: 95, r: 0.9, scale: 1 },
    sheep: { name: '绵羊', make: () => F.Creatures.createAnimalModel('sheep'), speed: 1.75, run: 3.6, product: 'wool', pname: '羊毛', ptime: 140, r: 0.7, scale: 1 },
    chicken: { name: '土鸡', make: () => F.Creatures.createAnimalModel('chicken'), speed: 1.9, run: 3.2, product: 'egg', pname: '鸡蛋', ptime: 75, r: 0.42, scale: 1, lays: true },
  };

  const A = (F.Animals = {
    list: [], scene: null, max: 34,

    init(scene) {
      A.scene = scene;
      const pasture = { x: -120, z: -176 };
      const yard = { x: 6, z: 92 };
      let i = 0;
      const put = (type, cx, cz, r) => {
        const a = Math.random() * 6.283, d = Math.random() * r;
        A.spawn(type, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 1);
      };
      for (i = 0; i < 5; i++) put('cow', pasture.x, pasture.z, 22);
      for (i = 0; i < 7; i++) put('sheep', pasture.x, pasture.z, 26);
      for (i = 0; i < 6; i++) put('chicken', yard.x, yard.z, 12);
      for (i = 0; i < 3; i++) put('sheep', 96, -100, 16);
    },

    spawn(type, x, z, age) {
      if (A.list.length >= A.max) return null;
      const def = ANIMAL_DEF[type];
      const model = def.make();
      const a = {
        type, def, obj: model, x, z, y: T.hAt(x, z), rot: Math.random() * 6.283,
        state: 'wander', timer: F.rnd(1, 4), tx: x, tz: z, speed: 0, hunger: 70,
        product: 0, fed: 0, age: age === undefined ? 1 : age, baby: age !== undefined && age < 1,
        vt: Math.random() * 6.283, flee: 0, follow: 0, mateT: 0, anim: 0,
      };
      model.group.scale.setScalar(a.baby ? 0.55 : 1);
      A.scene.add(model.group);
      A.list.push(a);
      return a;
    },

    remove(a) {
      A.scene.remove(a.obj.group);
      const i = A.list.indexOf(a);
      if (i >= 0) A.list.splice(i, 1);
    },

    nearest(x, z, r) {
      let best = null, bd = r * r;
      for (const a of A.list) {
        const d = F.dist2(x, z, a.x, a.z);
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    },

    feed(a) { a.hunger = Math.min(100, a.hunger + 45); a.fed = 90; return true; },
    herd(px, pz, radius) {
      let n = 0;
      for (const a of A.list) {
        if (F.dist2(px, pz, a.x, a.z) < radius * radius) {
          a.flee = 5.5; a.state = 'flee'; n++;
        }
      }
      return n;
    },

    update(dt, player, collidersFn) {
      const pFeed = player && player.tool === 'feed';
      for (let i = A.list.length - 1; i >= 0; i--) {
        const a = A.list[i];
        const def = a.def;
        a.timer -= dt;
        if (a.flee > 0) a.flee -= dt;
        if (a.fed > 0) a.fed -= dt;
        a.hunger = clamp(a.hunger - dt * 0.55, 0, 100);

        /* 靠近 barn 产出更快 */
        let barnBoost = 1;
        if (F.Builds && F.Builds.nearType(a.x, a.z, 22, 'barn')) barnBoost = 1.35;

        /* 产出 */
        if (!a.baby) {
          a.product += dt * barnBoost * (a.hunger > 35 ? 1 : 0.45);
          if (a.product >= def.ptime) {
            a.product = def.ptime;
            if (def.lays && Math.random() < dt * 0.9) {
              a.product = 0;
              Drops.add(a.x + F.rnd(-1, 1), a.z + F.rnd(-1, 1), 'egg', 1);
            }
          }
        }

        /* 繁殖 */
        if (!a.baby && a.hunger > 62 && A.list.length < A.max) {
          a.mateT += dt;
          if (a.mateT > 6) {
            a.mateT = 0;
            let mate = null;
            for (const b of A.list) {
              if (b !== a && b.type === a.type && !b.baby && b.hunger > 62 && F.dist2(a.x, a.z, b.x, b.z) < 16) { mate = b; break; }
            }
            if (mate && Math.random() < 0.5) {
              const baby = A.spawn(a.type, (a.x + mate.x) / 2, (a.z + mate.z) / 2, 0);
              if (baby) {
                baby.baby = true; baby.age = 0;
                F.UI.toast(def.name + '产下了幼崽！', 'ok');
                F.Audio2.ok();
              }
              a.hunger -= 30; mate.hunger -= 30;
            }
          }
        }
        if (a.baby) {
          a.age += dt / 150;
          if (a.age >= 1) { a.baby = false; a.age = 1; a.obj.group.scale.setScalar(1); F.UI.toast(def.name + '长大了', 'ok'); }
        }

        /* 状态机 */
        let tx = a.tx, tz = a.tz, sp = 0;
        if (a.flee > 0 && player) {
          const dx = a.x - player.pos.x, dz = a.z - player.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          tx = a.x + (dx / d) * 14; tz = a.z + (dz / d) * 14;
          sp = def.run;
        } else if (pFeed && player && F.dist2(a.x, a.z, player.pos.x, player.pos.z) < 144 && a.type !== 'chicken') {
          sp = def.speed * 0.95; tx = player.pos.x; tz = player.pos.z;
          if (F.dist2(a.x, a.z, player.pos.x, player.pos.z) < 9) sp = 0;
        } else {
          switch (a.state) {
            case 'wander':
              if (a.timer <= 0) {
                a.timer = F.rnd(2.5, 6);
                if (Math.random() < 0.45) { a.state = 'graze'; a.timer = F.rnd(4, 9); }
                else if (Math.random() < 0.2) { a.state = 'rest'; a.timer = F.rnd(5, 11); }
                else {
                  const ang = Math.random() * 6.283, d = F.rnd(3, 11);
                  a.tx = a.x + Math.cos(ang) * d; a.tz = a.z + Math.sin(ang) * d;
                }
              }
              sp = def.speed * 0.72;
              break;
            case 'graze':
              sp = 0;
              a.hunger = Math.min(100, a.hunger + dt * 4.5);
              if (a.timer <= 0) { a.state = 'wander'; a.timer = F.rnd(1, 3); }
              break;
            case 'rest':
              sp = 0;
              if (a.timer <= 0) { a.state = 'wander'; a.timer = F.rnd(1, 3); }
              break;
          }
          tx = a.tx; tz = a.tz;
        }

        /* 移动 */
        const dx = tx - a.x, dz = tz - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.6 && sp > 0) {
          const vx = (dx / d) * sp, vz = (dz / d) * sp;
          let nx = a.x + vx * dt, nz = a.z + vz * dt;
          /* 避开深水 */
          if (T.depthAt(nx, nz) > 0.85) { nx = a.x; nz = a.z; a.tx = a.x + F.rnd(-6, 6); a.tz = a.z + F.rnd(-6, 6); }
          /* 边界 */
          const rr = Math.hypot(nx, nz);
          if (rr > 278) { nx = a.x; nz = a.z; a.tx = -nx * 0.4; a.tz = -nz * 0.4; }
          /* 建筑/围栏碰撞 */
          if (F.Builds) {
            const hit = F.Builds.pushOut(nx, nz, def.r * 0.6);
            if (hit) { nx = hit.x; nz = hit.z; if (Math.random() < 0.25) { a.tx = a.x + F.rnd(-4, 4); a.tz = a.z + F.rnd(-4, 4); } }
          }
          a.x = nx; a.z = nz;
          const want = Math.atan2(dx, dz);
          a.rot += F.angDelta(a.rot, want) * Math.min(1, dt * 6);
          a.speed = sp;
        } else {
          a.speed = lerp(a.speed, 0, Math.min(1, dt * 5));
          if (a.state === 'wander') { a.tx = a.x; a.tz = a.z; }
        }

        /* 贴地 */
        const gy = T.hAt(a.x, a.z);
        a.y = lerp(a.y, Math.max(gy, T.WATER - 0.15), Math.min(1, dt * 8));

        /* 动画 */
        const g = a.obj.group;
        g.position.set(a.x, a.y, a.z);
        g.rotation.y = a.rot;
        const walk = clamp(a.speed / def.speed, 0, 1.4);
        a.anim += dt * (2.2 + walk * 7);
        const sw = Math.sin(a.anim) * 0.55 * walk;
        const legs = a.obj.legs;
        if (legs && legs.length) {
          if (legs.length === 4) {
            legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
            legs[2].rotation.x = -sw; legs[3].rotation.x = sw;
          } else { legs[0].rotation.x = sw; legs[1].rotation.x = -sw; }
        }
        const resting = a.state === 'rest';
        if (resting) {
          g.rotation.z = lerp(g.rotation.z, 1.15, Math.min(1, dt * 3));
          g.position.y = a.y - 0.30;
        } else {
          g.rotation.z = lerp(g.rotation.z, 0, Math.min(1, dt * 4));
        }
        if (a.obj.head) {
          const grazing = a.state === 'graze';
          a.obj.head.rotation.x = lerp(a.obj.head.rotation.x, grazing ? 0.75 : Math.sin(a.anim * 0.5) * 0.06, Math.min(1, dt * 4));
        }
        if (a.obj.body) a.obj.body.position.y = Math.sin(a.anim * 1.0) * 0.03 * walk;
      }
    },

    productReady(a) { return !a.baby && a.product >= a.def.ptime * 0.999; },
  });

  /* ============================ 鱼群 & 钓鱼点 ============================ */
  const Fish = (F.Fish = {
    ambient: [], spots: [], scene: null, meshes: {},

    init(scene) {
      Fish.scene = scene;
      /* 预设钓点：按地形解析计算，保证一定落在岸边 */
      const add = (x, z) => {
        const h = T.hAt(x, z);
        if (h < 0.35) return;
        Fish.spots.push({ x, z, wx: x, wz: z, stock: 8, max: 10, regen: 0, built: false });
      };
      /* 湖泊四周 */
      add(T.LAKE.x, T.LAKE.z + T.LAKE.r + 7);
      add(T.LAKE.x - T.LAKE.r - 7, T.LAKE.z);
      add(T.LAKE.x + T.LAKE.r + 7, T.LAKE.z);
      add(T.LAKE.x, T.LAKE.z - T.LAKE.r - 7);
      /* 河流两岸（自动贴合蜿蜒河道） */
      const bank = (x, side) => add(x, T.riverZ(x) + side * (T.riverHalfW(x) + 9.5));
      bank(-24, 1); bank(-24, -1);
      bank(64, 1); bank(64, -1);
      bank(150, 1); bank(150, -1);
      bank(-150, 1); bank(-150, -1);
      bank(-224, 1);

      /* 岸边钓点标识：木牌 + 地面圆环，方便一眼找到钓鱼区 */
      const postGeo = F.mergeParts([
        { g: new THREE.CylinderGeometry(0.09, 0.12, 1.90, 6), c: 0x8a6a4a, t: [0, 0.95, 0] },
        { g: new THREE.BoxGeometry(0.92, 0.62, 0.09), c: 0xe6dcc0, t: [0, 1.92, 0] },
        { g: new THREE.BoxGeometry(0.62, 0.42, 0.06), c: 0x7fb8a8, t: [0, 1.90, 0.07] },
        { g: new THREE.ConeGeometry(0.15, 0.34, 5), c: 0xd06a4a, t: [0, 1.90, 0.11], r: [Math.PI / 2, 0, 0.35] },
        { g: new THREE.CylinderGeometry(0.14, 0.18, 0.16, 6), c: 0x7a6a55, t: [0, 0.06, 0] },
      ]);
      const ringRaw = new THREE.TorusGeometry(1.05, 0.07, 5, 20);
      ringRaw.rotateX(-Math.PI / 2);
      const ringGeoC = F.mergeParts([{ g: ringRaw, c: 0xd8caa0 }]);
      for (const s of Fish.spots) {
        const g = new THREE.Group();
        const post = new THREE.Mesh(postGeo, F.MATS.std);
        post.castShadow = true;
        g.add(post);
        const ring = new THREE.Mesh(ringGeoC, F.MATS.std);
        ring.position.y = 0.04;
        g.add(ring);
        g.position.set(s.x, T.hAt(s.x, s.z), s.z);
        /* 木牌朝向最深的水域 */
        let ang = 0, best = -1;
        for (let a = 0; a < 32; a++) {
          const t = a * 0.1963;
          const d = T.depthAt(s.x + Math.cos(t) * 10, s.z + Math.sin(t) * 10);
          if (d > best) { best = d; ang = t; }
        }
        g.rotation.y = -ang;
        s.rot = -ang;
        s.wx = s.x + Math.cos(ang) * 6.5;
        s.wz = s.z + Math.sin(ang) * 6.5;
        scene.add(g);
        s.marker = g;
      }

      /* 水面下巡游的鱼影 */
      for (let i = 0; i < 26; i++) {
        const sp = F.FISH[(Math.random() * (F.FISH.length - 1)) | 0];
        const geo = Fish.geoOf(sp.id);
        const m = new THREE.Mesh(geo, F.MATS.std);
        m.scale.setScalar(sp.size);
        let x, z, tries = 0;
        do {
          const r = Fish.spots[(Math.random() * Fish.spots.length) | 0];
          x = r.wx + F.rnd(-16, 16); z = r.wz + F.rnd(-16, 16);
          tries++;
        } while (T.depthAt(x, z) < 1.1 && tries < 40);
        Fish.ambient.push({ m, x, z, tx: x, tz: z, rot: 0, sp, t: Math.random() * 10, timer: 0 });
        scene.add(m);
      }
    },

    geoOf(id) {
      if (!Fish.meshes[id]) Fish.meshes[id] = F.PROPS.fish(F.fishBy(id).c);
      return Fish.meshes[id];
    },

    update(dt) {
      for (const f of Fish.ambient) {
        f.t += dt; f.timer -= dt;
        if (f.timer <= 0) {
          f.timer = F.rnd(2, 6);
          const ang = Math.random() * 6.283, d = F.rnd(4, 12);
          f.tx = f.x + Math.cos(ang) * d; f.tz = f.z + Math.sin(ang) * d;
        }
        const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz) || 1;
        const sp = 0.9;
        let nx = f.x + (dx / d) * sp * dt, nz = f.z + (dz / d) * sp * dt;
        if (T.depthAt(nx, nz) < 0.9) { f.tx = f.x - (dx / d) * 8; f.tz = f.z - (dz / d) * 8; nx = f.x; nz = f.z; }
        f.x = nx; f.z = nz;
        f.rot += F.angDelta(f.rot, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
        const dep = T.depthAt(f.x, f.z);
        const y = T.WATER - clamp(0.35 + Math.sin(f.t * 0.7) * 0.18, 0.15, dep - 0.1);
        f.m.position.set(f.x, y, f.z);
        f.m.rotation.set(0, f.rot, Math.sin(f.t * 6) * 0.12);
      }
      /* 钓点补给 */
      for (const s of Fish.spots) {
        if (s.stock < s.max) {
          s.regen += dt;
          if (s.regen > 22) { s.regen = 0; s.stock++; }
        }
      }
    },

    nearestSpot(x, z, r) {
      let best = null, bd = r * r;
      for (const s of Fish.spots) {
        const d = F.dist2(x, z, s.x, s.z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },

    rollFish(spot) {
      const pool = F.FISH.filter(f => !f.junk || Math.random() < 0.5);
      let total = 0;
      for (const f of pool) total += f.w;
      let r = Math.random() * total;
      for (const f of pool) { r -= f.w; if (r <= 0) return f; }
      return pool[0];
    },
  });

  /* ============================ 建筑 ============================ */
  const B = (F.Builds = {
    list: [], scene: null, grid: null, cell: 12, gw: 0, nextId: 1,

    init(scene) {
      B.scene = scene;
      B.gw = Math.ceil(700 / B.cell);
      B.grid = new Array(B.gw * B.gw);
    },

    key(x, z) {
      const i = clamp(((x + 350) / B.cell) | 0, 0, B.gw - 1);
      const j = clamp(((z + 350) / B.cell) | 0, 0, B.gw - 1);
      return j * B.gw + i;
    },
    addToGrid(b) {
      const k = B.key(b.x, b.z);
      (B.grid[k] || (B.grid[k] = [])).push(b);
    },
    removeFromGrid(b) {
      const k = B.key(b.x, b.z);
      const arr = B.grid[k];
      if (arr) { const i = arr.indexOf(b); if (i >= 0) arr.splice(i, 1); }
    },
    nearBuildings(x, z, r) {
      const out = [];
      const i0 = clamp(((x + 350 - r) / B.cell) | 0, 0, B.gw - 1), i1 = clamp(((x + 350 + r) / B.cell) | 0, 0, B.gw - 1);
      const j0 = clamp(((z + 350 - r) / B.cell) | 0, 0, B.gw - 1), j1 = clamp(((z + 350 + r) / B.cell) | 0, 0, B.gw - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = B.grid[j * B.gw + i]; if (!c) continue;
        for (const b of c) out.push(b);
      }
      return out;
    },
    nearType(x, z, r, id) {
      return B.nearBuildings(x, z, r).some(b => b.id === id);
    },

    /* 计算地基高度：取四角与中心的加权，保证贴合且不悬空 */
    groundY(def, x, z, rot) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const hw = def.size[0] * 0.5, hd = def.size[1] * 0.5;
      let sum = 0, n = 0, min = 1e9;
      const off = [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd], [hw * 0.5, 0], [-hw * 0.5, 0]];
      for (const [ox, oz] of off) {
        const wx = x + ox * c + oz * s, wz = z - ox * s + oz * c;
        const h = T.hAt(wx, wz);
        sum += h; n++; if (h < min) min = h;
      }
      const avg = sum / n;
      /* 可踩踏平台统一架在水面之上，保证多段桥面等高 */
      if (def.deck !== undefined) return Math.max(avg, T.WATER + 0.90);
      return def.overWater ? Math.max(avg, T.WATER + 0.35) : lerp(avg, min, 0.35);
    },

    /* 旋转后的轴对齐包围盒半尺寸 */
    extent(def, rot) {
      const c = Math.abs(Math.cos(rot || 0)), s = Math.abs(Math.sin(rot || 0));
      const hw = def.size[0] * 0.5, hd = def.size[1] * 0.5;
      return { ex: hw * c + hd * s, ez: hw * s + hd * c };
    },

    canPlace(def, x, z, rot) {
      const chk = T.buildCheck(x, z);
      if (!chk.ok && !(def.overWater && chk.why === '水域内不可建造')) return chk;
      const hw = def.size[0] * 0.5, hd = def.size[1] * 0.5;
      const near = B.nearBuildings(x, z, Math.max(hw, hd) + 8);
      const me = B.extent(def, rot);
      for (const b of near) {
        /* 家园构件之间可以自由穿插拼装（墙里装门/窗、墙外贴檐），只做地基合法性检查 */
        if (def.home && b.def.home) continue;
        if (b.id === 'fence' && def.id === 'fence') continue;
        if (b.def.deck !== undefined && def.deck !== undefined) continue; // 桥面允许相接
        const ob = B.extent(b.def, b.rot);
        const marg = (def.id === 'fence' || b.id === 'fence') ? 0.15 : 0.45;
        if (Math.abs(x - b.x) < me.ex + ob.ex - marg && Math.abs(z - b.z) < me.ez + ob.ez - marg) {
          return { ok: false, why: '与已有建筑重叠' };
        }
      }
      /* 不能压在树上 */
      if (!def.overWater) {
        const ns = F.Nodes.near(x, z, Math.max(hw, hd) + 1.2);
        for (const e of ns) {
          if (e.n.def.r < 0.5) continue;
          if (e.d < Math.pow(Math.max(hw, hd) + 0.5, 2)) return { ok: false, why: '此处有树木/岩石阻挡' };
        }
      }
      return { ok: true, why: '' };
    },

    add(id, x, z, rot, free) {
      const def = F.PROPS.BUILDS[id];
      const g = F.PROPS.makeBuild(id);
      const y = B.groundY(def, x, z, rot);
      g.position.set(x, y, z);
      g.rotation.y = rot;
      B.scene.add(g);
      const b = {
        id, def, x, z, y, rot, group: g, uid: B.nextId++,
        hw: def.size[0] * 0.5, hd: def.size[1] * 0.5, anim: g.userData.anim,
        door: 0, light: null, spot: null,
      };
      if (def.dock) {
        const s = { x: x, z: z, wx: x + Math.cos(rot) * 3.2, wz: z + Math.sin(rot) * 3.2, stock: 8, max: 10, regen: 0, built: true, b };
        F.Fish.spots.push(s);
        b.spot = s;
      }
      if (def.light) {
        const l = new THREE.PointLight(def.light.color, 0, def.light.dist, 1.6);
        l.position.set(0, def.light.y, 0);
        g.add(l);
        b.light = l;
      }
      B.list.push(b);
      B.addToGrid(b);
      return b;
    },

    remove(b) {
      if (b.spot) {
        const i = F.Fish.spots.indexOf(b.spot);
        if (i >= 0) F.Fish.spots.splice(i, 1);
      }
      B.scene.remove(b.group);
      b.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose && 0; });
      B.removeFromGrid(b);
      const i = B.list.indexOf(b);
      if (i >= 0) B.list.splice(i, 1);
    },

    /* 世界 → 建筑局部坐标 */
    toLocal(b, x, z) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const dx = x - b.x, dz = z - b.z;
      return [dx * c - dz * s, dx * s + dz * c];
    },
    toWorld(b, lx, lz) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    },

    /* 圆形 vs 旋转矩形：把物体推出建筑外 */
    pushOut(x, z, r) {
      const near = B.nearBuildings(x, z, r + 6);
      let hit = false;
      for (const b of near) {
        if (b.id === 'bridge' || b.def.deck !== undefined) continue;
        if (b.id === 'gate' && b.door === 1) continue;
        /* 家园构件：地板 / 天花板 / 台阶等不挡路；开着的门可通行 */
        if (b.def.home) {
          if (b.def.noClip) continue;
          if (b.def.homeDoor && b.door === 1) continue;
        }
        const [lx, lz] = B.toLocal(b, x, z);
        const hw = b.hw, hd = b.hd;
        const ox = hw + r - Math.abs(lx);
        const oz = hd + r - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          let nlx = lx, nlz = lz;
          if (ox < oz) nlx = lx > 0 ? hw + r : -(hw + r);
          else nlz = lz > 0 ? hd + r : -(hd + r);
          const w = B.toWorld(b, nlx, nlz);
          x = w[0]; z = w[1];
          hit = true;
        }
      }
      return hit ? { x, z } : null;
    },

    /* 可踩踏的平台（木桥 / 钓鱼台）高度 */
    deckAt(x, z) {
      const near = B.nearBuildings(x, z, 10);
      let best = null;
      for (const b of near) {
        if (b.def.deck === undefined) continue;
        const [lx, lz] = B.toLocal(b, x, z);
        if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) {
          const y = b.y + b.def.deck;
          if (best === null || y > best) best = y;
        }
      }
      return best;
    },

    update(dt, night) {
      for (const b of B.list) {
        const a = b.anim;
        if (!a) continue;
        for (const sp of a.spin) sp.m.rotation[sp.axis] += dt * sp.speed;
        if (a.flame) {
          const k = 0.85 + Math.sin(performance.now() * 0.006) * 0.12 + Math.random() * 0.06;
          a.flame.scale.set(k * 0.9, k, k * 0.9);
          a.flame.rotation.y += dt * 1.2;
        }
        for (const e of a.emissive) {
          const target = night ? 1 : 0;
          e.material.emissiveIntensity = lerp(e.material.emissiveIntensity, target, Math.min(1, dt * 3));
        }
        if (b.light) {
          const want = night ? b.def.light.intensity : 0;
          b.light.intensity = lerp(b.light.intensity, want, Math.min(1, dt * 2.5));
        }
        if (a.hinge && (b.id === 'gate' || b.def.homeDoor)) {
          const sw = b.def.swing || -1.45;
          a.hinge.rotation.y = lerp(a.hinge.rotation.y, b.door ? sw : 0, Math.min(1, dt * 5));
        }
      }
    },
  });

  /* ============================ 特效 ============================ */
  const FX = (F.FX = {
    parts: [], cap: 220, mesh: null, texts: [], pool: [], camera: null, layer: null,

    init(scene, camera, layer) {
      FX.camera = camera; FX.layer = layer;
      const geo = new THREE.IcosahedronGeometry(0.1, 0);
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.8 }), FX.cap);
      m.count = 0; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      F.ensureInstColor(m);
      scene.add(m);
      FX.mesh = m;
      for (let i = 0; i < 16; i++) {
        const d = document.createElement('div');
        d.className = 'float-txt';
        d.style.display = 'none';
        layer.appendChild(d);
        FX.pool.push(d);
      }
    },

    burst(x, y, z, color, n, power) {
      n = n || 10; power = power || 1;
      for (let i = 0; i < n; i++) {
        if (FX.parts.length >= FX.cap) break;
        FX.parts.push({
          x, y, z,
          vx: (Math.random() - 0.5) * 3.2 * power,
          vy: 1.6 + Math.random() * 2.6 * power,
          vz: (Math.random() - 0.5) * 3.2 * power,
          life: 0.7 + Math.random() * 0.5, t: 0,
          s: 0.5 + Math.random() * 0.9, c: new THREE.Color().setHex(color),
        });
      }
    },

    text(x, y, z, str, color) {
      let d = null;
      for (const p of FX.pool) if (p.style.display === 'none') { d = p; break; }
      if (!d) d = FX.pool[0];
      d.textContent = str;
      d.style.color = color || '#fff';
      d.style.display = 'block';
      FX.texts.push({ d, x, y, z, t: 0, life: 1.4 });
    },

    update(dt) {
      const m = FX.mesh;
      let i = 0;
      for (let k = FX.parts.length - 1; k >= 0; k--) {
        const p = FX.parts[k];
        p.t += dt;
        if (p.t >= p.life) { FX.parts.splice(k, 1); continue; }
        p.vy -= 9.2 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < T.hAt(p.x, p.z)) { p.y = T.hAt(p.x, p.z); p.vy *= -0.32; p.vx *= 0.6; p.vz *= 0.6; }
        if (i < FX.cap) {
          const s = p.s * (1 - p.t / p.life);
          F.setInst(m, i, p.x, p.y, p.z, p.t * 4, s, p.c);
          i++;
        }
      }
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;

      /* 浮动文字 */
      const v = new THREE.Vector3();
      for (let k = FX.texts.length - 1; k >= 0; k--) {
        const t = FX.texts[k];
        t.t += dt;
        if (t.t >= t.life) { t.d.style.display = 'none'; FX.texts.splice(k, 1); continue; }
        v.set(t.x, t.y + t.t * 0.9, t.z).project(FX.camera);
        if (v.z > 1) { t.d.style.display = 'none'; continue; }
        const sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
        t.d.style.display = 'block';
        t.d.style.left = sx + 'px';
        t.d.style.top = sy + 'px';
        t.d.style.opacity = String(1 - Math.pow(t.t / t.life, 2));
      }
    },
  });

})();
