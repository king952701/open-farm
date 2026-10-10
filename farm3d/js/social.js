/* ==========================================================================
 * 牧野田园 Open Farm  ·  社交：好友 / 聊天频道 / 公会 / 组队 / 拍卖行
 * 单机离线版：其他玩家由本地模拟，消息、寄售、公会成员均在本地生成。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;

  const CHANNELS = [
    { id: 'world', name: '世界' },
    { id: 'zh', name: '中文' },
    { id: 'guild', name: '公会' },
    { id: 'trade', name: '交易' },
    { id: 'sys', name: '系统' },
  ];
  F.CHANNELS = CHANNELS;

  const NPCs = ['村长阿禾', '牧野小鹿', '铁匠学徒阿岩', '钓鱼的阿澈', '采药人青芜', '猎人岭风', '牧羊女云朵', '行商老周', '矿工大山', '厨娘糖糕'];
  const CHATTER = [
    '河湾那边的鲈鱼今天特别活跃！',
    '山林里刷了一只野猪王，谁一起去？',
    '收货仓的收购价又涨了，赶紧卖粮食。',
    '世界塔第 12 层的怪物好凶，建议组队。',
    '有人在拍卖行出银光剑吗？私信我。',
    '新手村的炼金师今天补货了万能溶剂。',
    '公会还缺人吗？我想加入。',
    '刚开出一把铁剑，运气不错！',
    '牧场那边的牛可以收获了，别忘了喂草。',
    '副本门票别乱用，留着打 Boss 层。',
  ];
  const REPLIES = [
    '收到，我这就过去！',
    '好呀，一起组队吧。',
    '我这边还有点材料，等会儿带给你。',
    '哈哈，你运气真不错。',
    '今天天气不错，适合钓鱼。',
    '记得补给体力药水再出门。',
  ];

  const S = (F.Social = {
    friends: [], chat: { world: [], zh: [], guild: [], trade: [], sys: [] }, privates: {},
    guild: null, party: null, listings: [], sold: [], nextId: 1, chatterT: 6, unread: 0,

    init() {
      /* 好友 */
      S.friends = [
        { name: '村长阿禾', lv: 32, job: '农夫', online: true },
        { name: '牧野小鹿', lv: 18, job: '牧民', online: true },
        { name: '铁匠学徒阿岩', lv: 24, job: '铁匠', online: true },
        { name: '钓鱼的阿澈', lv: 21, job: '渔夫', online: false },
        { name: '采药人青芜', lv: 27, job: '炼金师', online: true },
        { name: '猎人岭风', lv: 35, job: '猎人', online: true },
        { name: '牧羊女云朵', lv: 16, job: '裁缝', online: false },
        { name: '行商老周', lv: 40, job: '商人', online: true },
      ];
      /* 公会 */
      const members = [];
      for (let i = 0; i < 30; i++) {
        members.push({ name: NPCs[i % NPCs.length] + (i >= NPCs.length ? '·' + i : ''), lv: 10 + ((i * 7) % 40), job: ['农夫', '矿工', '渔夫', '猎人', '炼金师'][i % 5], online: Math.random() < 0.6 });
      }
      S.guild = {
        name: '牧野同好会',
        notice: '欢迎来到牧野同好会！公会公告可由会长编辑。\n1. 采集、挖矿、钓鱼、战斗都会产生公会经验。\n2. 副本建议组队前往，队伍有额外金币加成。',
        level: 0,
        xp: 0,
        members,
      };
      /* 队伍（默认只有自己） */
      S.party = { lead: '你', members: [{ name: '你', lv: 1, self: true }] };
      /* 拍卖行初始寄售（其他玩家） */
      S.listings = [];
      const seed = ['sword_iron', 'armor_leather', 'ring_gold', 'cloak_fur', 'sword_silver', 'armor_silver', 'amulet_moon', 'armor_dragon', 'sword_gold', 'sword_wood',
        'iron_ingot', 'gold_ingot', 'silver_ingot', 'gem_crystal', 'gem_rainbow', 'meat', 'leather', 'bone', 'fur', 'potion', 'potion_hp', 'potion_str', 'potion_luck'];
      for (let i = 0; i < 26; i++) {
        const id = seed[i % seed.length];
        const base = (F.priceOf(id) || 5) * Math.round(F.rnd(2.2, 4.2));
        const n = Math.round(F.rnd(1, 12));
        S.listings.push(S.mkListing(id, n, base, NPCs[i % NPCs.length], false));
      }
      /* 已售历史（含近 7/30/365 天样本） */
      S.sold = [];
      const ago = [0, 1, 1, 2, 3, 4, 5, 6, 9, 14, 25, 50, 120, 300];
      for (let i = 0; i < 14; i++) {
        const id = seed[(i * 5 + 3) % seed.length];
        S.sold.push(S.mkSold(id, Math.round(F.rnd(1, 6)), Math.round((F.priceOf(id) || 5) * F.rnd(2.2, 4)), NPCs[(i * 3) % NPCs.length], Math.max(1, (F.Game.day || 1) - ago[i % ago.length])));
      }
    },

    mkSold(item, n, price, buyer, day) {
      return { item, n, price, buyer, day: day || (F.Game.day || 1) };
    },
    /* 近 N 天已售列表（按时间倒序） */
    soldList(days) {
      const today = F.Game.day || 1;
      return S.sold.filter(s => today - s.day < days).slice().sort((a, b) => b.day - a.day || b.item.localeCompare(a.item));
    },
    /* 近 N 天收入统计：总价 / 税收 20% / 税后 */
    soldStats(days) {
      const rows = S.soldList(days);
      let gross = 0;
      for (const s of rows) gross += s.price * s.n;
      const tax = Math.round(gross * 0.2);
      return { count: rows.length, gross, tax, net: gross - tax };
    },

    mkListing(item, n, price, seller, mine) {
      return {
        id: S.nextId++, item, n, price, seller, mine: !!mine,
        q: F.qualityOf(item), cat: F.catOf(item), lv: F.levelOf(item),
        t: F.Game && F.Game.day ? F.Game.day : 1,
      };
    },

    /* ---------------- 聊天 ---------------- */
    /* 归一化消息体：字符串 → 文本；对象 → 文本 / 图片 / 道具 */
    norm(payload) {
      const p = (payload && typeof payload === 'object') ? Object.assign({}, payload) : { text: String(payload || '') };
      if (p.type === 'img') {
        if (!p.src) return null;
        p.text = p.text || '[图片]';
      } else if (p.type === 'item') {
        if (!p.item) return null;
        p.n = Math.max(1, Math.round(p.n || 1));
        p.text = p.text || ('[道具] ' + F.itemName(p.item));
      } else {
        p.type = 'text';
        p.text = String(p.text || '').trim();
        if (!p.text) return null;
        if (p.text.length > 300) p.text = p.text.slice(0, 300);
      }
      return p;
    },
    push(ch, msg) {
      msg.t = msg.t || Date.now();
      (S.chat[ch] || (S.chat[ch] = [])).push(msg);
      if (S.chat[ch].length > 200) S.chat[ch].shift();
      S.onMessage && S.onMessage(ch, msg);
      return msg;
    },
    /* 发送文本 / 图片 / 道具（频道） */
    send(ch, payload) {
      const p = S.norm(payload);
      if (!p) return null;
      return S.push(ch, Object.assign({ from: '你', self: true }, p));
    },
    sys(text) {
      const msg = { from: '系统', text, t: Date.now(), sys: true, type: 'text' };
      S.chat.sys.push(msg);
      if (S.chat.sys.length > 200) S.chat.sys.shift();
      S.onMessage && S.onMessage('sys', msg);
    },
    /* 私聊：同样支持图片 / 道具 */
    sendPrivate(name, payload) {
      const p = S.norm(payload);
      if (!p) return null;
      const arr = S.privates[name] || (S.privates[name] = []);
      const msg = Object.assign({ from: '你', self: true, t: Date.now() }, p);
      arr.push(msg);
      if (arr.length > 200) arr.shift();
      S.onMessage && S.onMessage('private:' + name, msg);
      /* 好友自动回复 */
      const delay = F.rnd(900, 2600);
      setTimeout(() => {
        const reply = { from: name, text: REPLIES[(Math.random() * REPLIES.length) | 0], t: Date.now(), type: 'text' };
        arr.push(reply);
        S.onMessage && S.onMessage('private:' + name, reply);
      }, delay);
      return msg;
    },

    /* ---------------- 公会 ---------------- */
    guildNeed() { return 5000000; },
    guildCap() { return 30 + 5 * (S.guild ? S.guild.level : 0); },
    addGuildXp(n) {
      if (!S.guild) return;
      S.guild.xp += n;
      S.onGuild && S.onGuild();
    },
    setNotice(t) { if (S.guild) S.guild.notice = String(t || ''); },
    upgradeGuild() {
      const g = S.guild;
      if (!g) return false;
      const need = S.guildNeed();
      if (g.xp < need) {
        F.UI.toast('公会经验不足：' + g.xp + '/' + need, 'bad');
        F.Audio2.bad();
        return false;
      }
      g.xp -= need;
      g.level++;
      /* 扩容：增加邀请额度 */
      const add = 5;
      for (let i = 0; i < add; i++) {
        g.members.push({ name: '新成员·' + (g.members.length + 1), lv: Math.round(F.rnd(8, 40)), job: F.choose(['农夫', '矿工', '渔夫', '猎人', '炼金师']), online: Math.random() < 0.5 });
      }
      F.Audio2.ok();
      F.UI.toast('公会升级到 ' + g.level + ' 级！可邀请成员上限 ' + S.guildCap() + ' 人', 'ok');
      S.sys('公会：' + g.name + ' 升级到 ' + g.level + ' 级（成员上限 ' + S.guildCap() + '）');
      return true;
    },
    inviteGuild(name) {
      if (!S.guild) return;
      if (S.guild.members.length >= S.guildCap()) { F.UI.toast('成员已满，先升级公会', 'bad'); return; }
      S.guild.members.push({ name, lv: Math.round(F.rnd(10, 40)), job: F.choose(['农夫', '矿工', '渔夫', '猎人', '炼金师']), online: true });
      F.UI.toast('已邀请 ' + name + ' 加入公会', 'ok');
    },

    /* ---------------- 组队 ---------------- */
    inviteParty(name) {
      if (S.party.members.length >= 5) { F.UI.toast('队伍最多 5 人', 'bad'); return; }
      if (S.party.members.some(m => m.name === name)) { F.UI.toast(name + ' 已在队伍中', 'info'); return; }
      S.party.members.push({ name, lv: Math.round(F.rnd(12, 40)), job: F.choose(['农夫', '矿工', '猎人', '炼金师']) });
      F.UI.toast('已邀请 ' + name + ' 加入队伍（' + S.party.members.length + '/5）', 'ok');
      S.sys('组队：' + name + ' 加入了你的队伍。');
    },
    leaveParty() {
      S.party.members = [{ name: '你', lv: 1, self: true }];
      F.UI.toast('已解散队伍', 'info');
    },
    kickParty(name) {
      S.party.members = S.party.members.filter(m => m.name !== name);
      if (!S.party.members.length) S.party.members.push({ name: '你', lv: 1, self: true });
      F.UI.toast(name + ' 已离开队伍', 'info');
    },

    /* ---------------- 拍卖行 ---------------- */
    /* 上架：手续费 = 总价 1%（拍卖师处 -20% → 0.8%） */
    list(item, n, price, viaNpc) {
      n = Math.max(1, Math.round(n || 1));
      price = Math.max(1, Math.round(price || 1));
      if ((F.Game.inv[item] || 0) < n) { F.UI.toast('物品数量不足', 'bad'); return false; }
      const total = price * n;
      const fee = Math.max(1, Math.round(total * (viaNpc ? 0.008 : 0.01)));
      if (F.Game.coins < fee) { F.UI.toast('金币不足，手续费需要 ' + fee, 'bad'); return false; }
      F.Game.coins -= fee;
      F.Game.take(item, n);
      S.listings.push(S.mkListing(item, n, price, '你', true));
      F.UI.toast('上架成功：' + F.itemName(item) + ' ×' + n + '（手续费 ' + fee + ' 金币）', 'ok');
      S.sys('交易：你在拍卖行上架了 ' + F.itemName(item) + ' ×' + n + '，单价 ' + price + ' 金币。');
      return true;
    },
    cancel(id) {
      const i = S.listings.findIndex(l => l.id === id && l.mine);
      if (i < 0) return false;
      const l = S.listings[i];
      F.Game.give(l.item, l.n);
      S.listings.splice(i, 1);
      F.UI.toast('已下架 ' + F.itemName(l.item) + ' ×' + l.n, 'info');
      return true;
    },
    buy(id) {
      const i = S.listings.findIndex(l => l.id === id);
      if (i < 0) return false;
      const l = S.listings[i];
      if (l.mine) { F.UI.toast('这是你自己上架的物品', 'info'); return false; }
      if (F.Game.coins < l.price * l.n) { F.UI.toast('金币不足', 'bad'); F.Audio2.bad(); return false; }
      F.Game.coins -= l.price * l.n;
      F.Game.give(l.item, l.n);
      S.listings.splice(i, 1);
      F.Audio2.ok();
      F.UI.toast('购买 ' + F.itemName(l.item) + ' ×' + l.n + '（- ' + l.price * l.n + ' 金币）', 'ok');
      S.sys('交易：你从拍卖行购买了 ' + F.itemName(l.item) + ' ×' + l.n + '。');
      return true;
    },
    /* 搜索 + 品质/类别/级别筛选 */
    query(opt) {
      opt = opt || {};
      const q = (opt.q || '').trim();
      const out = S.listings.filter(l => {
        if (q && F.itemName(l.item).indexOf(q) < 0 && l.seller.indexOf(q) < 0) return false;
        if (opt.quality && opt.quality !== '全部' && l.q !== opt.quality) return false;
        if (opt.cat && opt.cat !== '全部' && l.cat !== opt.cat) return false;
        if (opt.lv && opt.lv !== '全部') {
          const [a, b] = opt.lv.split('-').map(Number);
          if (a && l.lv < a) return false;
          if (b && l.lv > b) return false;
        }
        return true;
      });
      if (opt.sort === 'priceAsc') out.sort((x, y) => x.price - y.price);
      else if (opt.sort === 'priceDesc') out.sort((x, y) => y.price - x.price);
      else out.sort((x, y) => y.id - x.id);
      return out;
    },

    /* ---------------- 模拟世界 ---------------- */
    tick(dt) {
      S.chatterT -= dt;
      if (S.chatterT <= 0) {
        S.chatterT = F.rnd(14, 30);
        const who = NPCs[(Math.random() * NPCs.length) | 0];
        const ch = F.choose(['world', 'zh', 'guild', 'trade']);
        const msg = { from: who, text: CHATTER[(Math.random() * CHATTER.length) | 0], t: Date.now() };
        S.chat[ch].push(msg);
        if (S.chat[ch].length > 200) S.chat[ch].shift();
        S.onMessage && S.onMessage(ch, msg);
      }
      /* 自己的寄售偶尔被买走（税收 20%） */
      if (Math.random() < dt * 0.02) {
        const mine = S.listings.filter(l => l.mine);
        if (mine.length) {
          const l = F.choose(mine);
          const gain = Math.round(l.price * l.n * 0.8);
          F.Game.addCoins(gain);
          S.listings = S.listings.filter(x => x !== l);
          /* 记入已售（买家为模拟玩家） */
          S.sold.push(S.mkSold(l.item, l.n, l.price, NPCs[(Math.random() * NPCs.length) | 0], F.Game.day || 1));
          if (S.sold.length > 200) S.sold.shift();
          F.UI.toast('你的 ' + F.itemName(l.item) + ' ×' + l.n + ' 已售出，到账 ' + gain + ' 金币（税 20%）', 'ok');
          S.sys('交易：你的 ' + F.itemName(l.item) + ' ×' + l.n + ' 被 ' + S.sold[S.sold.length - 1].buyer + ' 买走，到账 ' + gain + ' 金币（已扣 20% 税）。');
        }
      }
      /* 其他玩家的寄售变动 */
      if (Math.random() < dt * 0.03) {
        const seed = ['sword_iron', 'armor_leather', 'meat', 'leather', 'bone', 'iron_ingot', 'potion', 'ring_gold'];
        const id = F.choose(seed);
        S.listings.push(S.mkListing(id, Math.round(F.rnd(1, 8)), Math.round((F.priceOf(id) || 5) * F.rnd(2.2, 4)), NPCs[(Math.random() * NPCs.length) | 0], false));
        if (S.listings.length > 90) S.listings.shift();
      }
    },
  });
})();
