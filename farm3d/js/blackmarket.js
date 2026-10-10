/* ==========================================================================
 * 牧野田园 Open Farm  ·  黑市（摆摊 / 面对面交易）
 * 税费规则：每一笔成交按成交价向**买方**额外收取 30% 税费，税费直接退出流通
 *          （累计计入 destroyed），卖家按成交价全额到账。
 *          同样适用于：别人买走你摊位上的货（你全额到账），以及面对面买卖。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp, rnd = F.rnd;
  const ri = (a, b) => Math.round(rnd(a, b));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* 黑市常见流通物 */
  const GOODS = ['wood', 'stone', 'iron', 'copper', 'tin', 'silver', 'gold', 'crystal',
    'iron_ingot', 'copper_ingot', 'tin_ingot', 'bronze', 'silver_ingot', 'gold_ingot', 'alu_ingot',
    'leather', 'fur', 'wool', 'bone', 'meat', 'gem_crystal', 'gem_rainbow',
    'potion', 'potion_hp', 'potion_str', 'potion_luck', 'ticket', 'herb', 'flower', 'mushroom',
    'sword_iron', 'sword_silver', 'armor_leather', 'armor_silver', 'ring_gold', 'amulet_moon', 'cloak_fur'];
  const JOBS = ['行商', '游侠', '猎人', '矿工', '炼金师', '铁匠', '渔夫', '牧人'];

  const M = (F.BMarket = {
    TAX: 0.3,
    mine: [],      /* 我的摊位挂单：{id,item,n,price} */
    others: [],    /* 其他玩家的摊位 */
    peeps: [],     /* 在场的人：{name,job,lv,stock:[{item,n,price}]} */
    sold: [],      /* 成交记录：{day,side,who,item,n,price,tax} */
    destroyed: 0, deals: 0, volume: 0, nextId: 1, day: 1,
    tPick: 12, tOut: 20, cur: null,

    init() {
      M.sync(null, true);
    },

    /* ------------------------------ 人员 / 摊位生成 ------------------------------ */
    names() {
      const out = [];
      if (F.Rank && F.Rank.players) for (const p of F.Rank.players) out.push(p.name);
      if (F.Social && F.Social.friends) for (const f of F.Social.friends) out.push(f.name);
      return out.filter(n => n && n !== '你');
    },

    priceOf(id) { return Math.max(1, Math.round((F.priceOf(id) || 1) * rnd(0.72, 1.35))); },

    mkStock(nMax) {
      const stock = [], used = {};
      const cnt = ri(3, nMax || 5);
      for (let i = 0; i < cnt; i++) {
        const item = pick(GOODS);
        if (used[item]) continue;
        used[item] = 1;
        stock.push({ item, n: pick([1, 1, 1, 2, 3, ri(4, 8)]), price: M.priceOf(item) });
      }
      return stock;
    },

    genPeeps() {
      const ns = M.names();
      M.peeps = [];
      const cnt = Math.min(ns.length, ri(5, 7));
      const pool = ns.slice();
      for (let i = 0; i < cnt; i++) {
        const name = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        if (!name) break;
        M.peeps.push({ name, job: pick(JOBS), lv: ri(8, 52), stock: M.mkStock() });
      }
      if (!M.peeps.length) {
        for (let i = 0; i < 4; i++) M.peeps.push({ name: '黑市客 ' + (i + 1), job: pick(JOBS), lv: ri(8, 52), stock: M.mkStock() });
      }
      M.cur = M.peeps[0] ? M.peeps[0].name : null;
    },

    genOthers() {
      const ns = M.names();
      M.others = [];
      const cnt = ri(6, 11);
      for (let i = 0; i < cnt; i++) {
        const seller = ns.length ? pick(ns) : '匿名摊位';
        const item = pick(GOODS);
        M.others.push({
          id: M.nextId++, seller, item,
          n: pick([1, 2, 3, ri(4, 9)]), price: M.priceOf(item), mine: false,
        });
      }
    },

    /* ------------------------------ 摆摊 ------------------------------ */
    list(item, n, price) {
      n = Math.max(1, Math.round(n || 1));
      price = Math.max(1, Math.round(price || 1));
      if ((F.Game.inv[item] || 0) < n) { F.UI.toast('物品数量不足', 'bad'); F.Audio2.bad(); return false; }
      F.Game.take(item, n);
      M.mine.push({ id: M.nextId++, item, n, price, mine: true });
      F.Audio2.ok();
      F.UI.toast('已摆上摊位：' + F.itemName(item) + ' ×' + n + '（单价 ' + price + ' 金币）', 'ok');
      if (F.Social) F.Social.sys('黑市：你在摊位挂出了 ' + F.itemName(item) + ' ×' + n + '，单价 ' + price + ' 金币。');
      return true;
    },

    cancel(id) {
      const i = M.mine.findIndex(l => l.id === id);
      if (i < 0) return false;
      const l = M.mine[i];
      F.Game.give(l.item, l.n);
      M.mine.splice(i, 1);
      F.UI.toast('已收摊：' + F.itemName(l.item) + ' ×' + l.n, 'info');
      return true;
    },

    /* 向其他玩家的摊位购买（含 30% 买方税费） */
    buyStall(id) {
      const i = M.others.findIndex(l => l.id === id);
      if (i < 0) return false;
      const l = M.others[i];
      return M.pay(l.seller, l.item, l.n, l.price, '摊位', i);
    },

    /* 面对面：向选中玩家购买 */
    buyFace(idx) {
      const p = M.peep();
      if (!p) return false;
      const s = p.stock[idx];
      if (!s) return false;
      const ok = M.pay(p.name, s.item, s.n, s.price, '买入', -1);
      if (ok) p.stock.splice(idx, 1);
      return ok;
    },

    /* 面对面：把背包物资卖给对面 */
    sellFace(item, n) {
      const p = M.peep();
      if (!p) return false;
      n = Math.max(1, Math.round(n || 1));
      if ((F.Game.inv[item] || 0) < n) { F.UI.toast('物品数量不足', 'bad'); F.Audio2.bad(); return false; }
      const unit = Math.max(1, Math.round((F.priceOf(item) || 1) * rnd(0.82, 1.12)));
      const total = unit * n;
      F.Game.take(item, n);
      F.Game.addCoins(total);
      const tax = Math.round(total * M.TAX);       /* 买方（对方）承担的税费，直接销毁回收 */
      M.destroyed += tax; M.deals++; M.volume += total;
      M.sold.unshift({ day: F.Game.day || 1, side: '卖出', who: p.name, item, n, price: total, tax });
      if (M.sold.length > 40) M.sold.pop();
      F.Audio2.ok();
      F.UI.toast('卖给 ' + p.name + '：' + F.itemName(item) + ' ×' + n + '，+' + total + ' 金币', 'ok');
      if (F.Social) F.Social.sys('黑市：' + p.name + ' 以 ' + total + ' 金币买走了你的 ' + F.itemName(item) + ' ×' + n + '。');
      return true;
    },

    /* 统一的「付款结算」：买家多付 30% 税费，卖家全额到账 */
    pay(seller, item, n, unit, side, rmIdx) {
      const total = Math.max(1, Math.round(unit)) * n;
      const tax = Math.round(total * M.TAX);
      const pay = total + tax;
      if (F.Game.coins < pay) { F.UI.toast('金币不足，含税费需要 ' + pay + ' 金币', 'bad'); F.Audio2.bad(); return false; }
      F.Game.coins -= pay;
      F.Game.give(item, n);
      M.destroyed += tax; M.deals++; M.volume += total;
      M.sold.unshift({ day: F.Game.day || 1, side: side || '成交', who: seller || '匿名', item, n, price: total, tax });
      if (M.sold.length > 40) M.sold.pop();
      if (rmIdx >= 0 && M.others[rmIdx]) M.others.splice(rmIdx, 1);
      F.Audio2.ok();
      F.UI.toast('成交：' + F.itemName(item) + ' ×' + n + '（- ' + pay + ' 金币，含税费 ' + tax + '）', 'ok');
      return true;
    },

    peep() { return M.peeps.find(p => p.name === M.cur) || M.peeps[0] || null; },

    suggestion(item) { return Math.max(1, Math.round((F.priceOf(item) || 1) * 1.05)); },

    /* ------------------------------ 每帧 ------------------------------ */
    sync(dt, force) {
      if (!M.peeps.length || force) M.genPeeps();
      if (!M.others.length || force) M.genOthers();
      const day = F.Game.day || 1;
      if (day !== M.day) {
        M.day = day;
        M.genOthers();
        for (const p of M.peeps) p.stock = M.mkStock();
      }
    },

    update(dt) {
      M.sync(dt);
      /* 别人来买你摊位上的货 */
      M.tPick -= dt;
      if (M.tPick <= 0) {
        M.tPick = rnd(9, 26);
        if (M.mine.length) {
          const i = Math.floor(Math.random() * M.mine.length);
          const l = M.mine[i];
          const n = Math.random() < 0.55 ? l.n : Math.max(1, Math.floor(l.n / 2));
          const total = l.price * n;
          const tax = Math.round(total * M.TAX);
          F.Game.addCoins(total);
          M.destroyed += tax; M.deals++; M.volume += total;
          M.sold.unshift({ day: F.Game.day || 1, side: '摊售出', who: '匿名买家', item: l.item, n, price: total, tax });
          if (M.sold.length > 40) M.sold.pop();
          if (n >= l.n) M.mine.splice(i, 1); else l.n -= n;
          F.UI.toast('摊位成交：' + F.itemName(l.item) + ' ×' + n + '，+' + total + ' 金币', 'ok');
        }
      }
      /* 其他玩家的摊位也会被别人买走（保持货源流动） */
      M.tOut -= dt;
      if (M.tOut <= 0) {
        M.tOut = rnd(14, 34);
        if (M.others.length > 3) M.others.splice(Math.floor(Math.random() * M.others.length), 1);
        if (M.others.length < 5) {
          const ns = M.names();
          const item = pick(GOODS);
          M.others.push({ id: M.nextId++, seller: ns.length ? pick(ns) : '匿名摊位', item, n: pick([1, 2, 3, ri(4, 9)]), price: M.priceOf(item), mine: false });
        }
        /* 偶尔有人补货 */
        if (M.peeps.length && Math.random() < 0.5) {
          const p = pick(M.peeps);
          if (p.stock.length < 5) {
            const item = pick(GOODS);
            p.stock.push({ item, n: pick([1, 2, 3]), price: M.priceOf(item) });
          }
        }
      }
    },

    saveData() {
      return {
        mine: M.mine, others: M.others, peeps: M.peeps, sold: M.sold.slice(0, 20),
        destroyed: M.destroyed, deals: M.deals, volume: M.volume, nextId: M.nextId, day: M.day, cur: M.cur,
      };
    },
    loadData(d) {
      if (!d) return;
      M.mine = d.mine || []; M.others = d.others || []; M.peeps = d.peeps || [];
      M.sold = d.sold || []; M.destroyed = d.destroyed || 0;
      M.deals = d.deals || 0; M.volume = d.volume || 0;
      M.nextId = Math.max(1, d.nextId || 1); M.day = d.day || (F.Game.day || 1); M.cur = d.cur || null;
      M.sync(null, true);
    },
    reset() {
      M.mine = []; M.others = []; M.peeps = []; M.sold = [];
      M.destroyed = 0; M.deals = 0; M.volume = 0; M.nextId = 1; M.day = F.Game.day || 1; M.cur = null;
      M.sync(null, true);
    },
  });
})();
