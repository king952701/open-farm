/* ==========================================================================
 * 牧野田园 Open Farm  ·  斗兽场：1v1 / 3v3 / 10v10 对战 + 观战竞猜
 * 参战宠物来自「纳球捕捉」得到的宠物（F.Mounts.list）。
 * 竞猜采用**彩池制**：赔率随两边投注实时波动；按「市场税收」比例抽取的部分直接
 * 退出流通（销毁），配合下注上限与累进调控，抑制投注市场带来的通胀。
 * ========================================================================== */
(function () {
  'use strict';
  const F = window.FARM;
  const clamp = F.clamp;

  const MODES = (F.ARENA_MODES = [
    { id: '1v1', n: 1, name: '1v1 单挑', reward: [80, 180] },
    { id: '3v3', n: 3, name: '3v3 小队', reward: [260, 520] },
    { id: '10v10', n: 10, name: '10v10 团战', reward: [900, 1800] },
  ]);
  const QPOW = { 普通: 1, 精良: 1.15, 稀有: 1.34, 史诗: 1.6, 传说: 2.0 };
  const QIDX = ['普通', '精良', '稀有', '史诗', '传说'];
  const PET_TYPES = ['boar', 'wolf', 'bear', 'boar', 'wolf', 'bear'];

  const A = (F.Arena = {
    matches: [], history: [], nextId: 1, spawnT: 20, betT: 0,
    record: { win: 0, lose: 0, bets: 0, betWin: 0, betLose: 0, coins: 0, points: 0 },
    /* 市场调控：税收比例 / 已回收销毁的金币 / 下注上限基准 */
    market: { tax: 0.12, destroyed: 0, capBase: 300, dayBet: 0, day: 1 },

    init() { },

    /* ------------------------------ 宠物 ------------------------------ */
    petFromMount(mt) {
      const def = F.MOBS[mt.type] || { hp: 40, atk: 6, lv: 1, name: '野兽', spd: 2.5 };
      const qi = clamp(QIDX.indexOf(mt.q), 0, 4);
      const hp = Math.round((def.hp * 0.9 + mt.lv * 6) * QPOW[QIDX[qi]]);
      const atk = Math.round((def.atk * 0.8 + mt.lv * 0.7) * QPOW[QIDX[qi]] * 10) / 10;
      return {
        type: mt.type, name: def.name || mt.name, q: mt.q, lv: mt.lv,
        hp, maxHp: hp, atk, pow: Math.round(hp * 0.55 + atk * 9 + mt.lv * 4),
      };
    },
    randPet(lvHint) {
      const type = PET_TYPES[(Math.random() * PET_TYPES.length) | 0];
      const lv = clamp(Math.round(lvHint + F.rnd(-3, 4)), 1, 60);
      const qi = clamp(Math.floor(Math.random() * 3) + (lv > 12 ? 1 : 0) + (lv > 28 ? 1 : 0), 0, 4);
      return A.petFromMount({ type, lv, q: QIDX[qi], mul: 1.2 });
    },
    sidePower(side) {
      let p = 0;
      for (const pet of side.pets) p += pet.pow;
      return p;
    },

    /* --------------------------- 对手（模拟玩家） --------------------------- */
    randomPlayer(exclude) {
      let p = null;
      if (F.Rank && F.Rank.players && F.Rank.players.length) {
        const pool = F.Rank.players.filter(x => !x.self && x.name !== exclude);
        if (pool.length) p = pool[(Math.random() * pool.length) | 0];
      }
      if (!p) return { name: '游侠·' + (1 + ((Math.random() * 90) | 0)), lv: Math.round(F.rnd(5, 45)), guild: '牧野同好会' };
      return { name: p.name, lv: p.lv || 10, guild: p.guild || '自由冒险者' };
    },
    mkSide(info, lvHint, n) {
      const pets = [];
      for (let i = 0; i < n; i++) pets.push(A.randPet(lvHint));
      return { name: info.name, lv: info.lv, guild: info.guild, pets };
    },

    /* ------------------------------ 开赛 ------------------------------ */
    startMatch(opt) {
      opt = opt || {};
      const mode = MODES.find(m => m.id === (opt.mode || '1v1')) || MODES[0];
      const lvHint = opt.lvHint || Math.round(F.rnd(8, 30));
      let sideA, sideB;
      if (opt.mine) {
        const mine = A.mySide(mode.n);
        if (!mine) { F.UI.toast('你的宠物不足 ' + mode.n + ' 只，先用纳球捕捉更多野兽（按 M 查看坐骑栏）', 'bad'); return null; }
        sideA = mine;
        sideB = A.mkSide(A.randomPlayer('你'), clamp(lvHint, 3, 50), mode.n);
      } else {
        const pa = A.randomPlayer();
        sideA = A.mkSide(pa, lvHint, mode.n);
        sideB = A.mkSide(A.randomPlayer(pa.name), lvHint + Math.round(F.rnd(-4, 4)), mode.n);
      }
      const seedpot = Math.round(mode.n * F.rnd(180, 460));     /* 系统垫入的底池：保证初始赔率合理 */
      const m = {
        id: A.nextId++, mode: mode.id, modeName: mode.name, mine: !!opt.mine,
        a: sideA, b: sideB, phase: 'bet', cd: opt.mine ? 8 : 26, t: 0,
        pools: [seedpot, seedpot], myBets: [0, 0], odds: [2, 2], log: [], winner: -1,
        seedpot, settle: null,
      };
      A.updateOdds(m);
      A.matches.push(m);
      if (A.matches.length > 4) A.matches.shift();
      if (F.UI2 && F.UI2.openArenaBet) F.UI2.openArenaBet(m);
      return m;
    },

    mySide(n) {
      if (!F.Mounts || !F.Mounts.list || F.Mounts.list.length < n) return null;
      const picks = F.Mounts.list.slice(0, n).map(A.petFromMount);
      const me = (F.Rank && F.Rank.playerInfo) ? F.Rank.playerInfo('你') : null;
      return {
        name: '你', lv: me ? me.lv : (F.Skills ? F.Skills.total() : 1),
        guild: (F.Social && F.Social.guild) ? F.Social.guild.name : '自由冒险者',
        pets: picks, self: true,
      };
    },

    /* --------------------- 赔率（动态 + 防单边过热） --------------------- */
    updateOdds(m) {
      const total = m.pools[0] + m.pools[1];
      const keep = 1 - A.market.tax;
      for (let i = 0; i < 2; i++) {
        const share = total > 0 ? m.pools[i] / total : 0.5;
        let odd = m.pools[i] > 0 ? (total * keep) / m.pools[i] : keep * 2;
        /* 市场调控：单边过热时下调配率，抑制跟风炒作 */
        if (share > 0.68) odd *= 1 - (share - 0.68) * 1.1;
        m.odds[i] = Math.max(1.05, Math.round(odd * 100) / 100);
      }
    },

    /* 下注上限：随当日累计投注递减（累进调控），且不超过自身财富的一定比例 */
    betCap() {
      const M = A.market;
      const today = F.Game.day || 1;
      if (M.day !== today) { M.day = today; M.dayBet = 0; }
      const base = M.capBase + Math.max(0, F.Game.coins || 0) * 0.12;
      const decay = 1 - Math.min(0.6, M.dayBet / 20000);
      return Math.max(50, Math.round(base * decay));
    },

    bet(m, side, amount) {
      if (m.phase !== 'bet') { F.UI.toast('本场已封盘', 'bad'); return false; }
      if (m.mine) { F.UI.toast('自己的比赛不能下注，专心指挥！', 'info'); return false; }
      amount = Math.round(amount);
      if (!(amount > 0)) return false;
      const cap = A.betCap();
      if (m.myBets[side] + amount > cap) { F.UI.toast('超出本场下注上限 ' + cap + ' 金币（防通胀限制）', 'bad'); return false; }
      if ((F.Game.coins || 0) < amount) { F.UI.toast('金币不足', 'bad'); F.Audio2.bad(); return false; }
      F.Game.addCoins(-amount);
      m.pools[side] += amount;
      m.myBets[side] += amount;
      A.market.dayBet += amount;
      A.record.bets++;
      A.updateOdds(m);
      F.Audio2.pick();
      F.UI.toast('已下注「' + (side === 0 ? '红方 ' + m.a.name : '蓝方 ' + m.b.name) + '」' + amount + ' 金币 · 赔率 ' + m.odds[side], 'ok');
      return true;
    },

    settle(m) {
      const win = m.winner, lose = 1 - m.winner;
      const total = m.pools[0] + m.pools[1];
      let payout = 0;
      if (m.myBets[win] > 0) {
        payout = Math.round(m.myBets[win] * m.odds[win]);
        F.Game.addCoins(payout);
        A.record.betWin++;
      } else if (m.myBets[lose] > 0) A.record.betLose++;
      /* 市场税收 → 退出流通并销毁（防通胀核心） */
      const burned = Math.round(total * A.market.tax);
      A.market.destroyed += burned;
      m.settle = { payout, total, burned, net: payout - (m.myBets[0] + m.myBets[1]) };
      m.phase = 'done';
      if (payout > 0) {
        F.UI.toast('竞猜获胜！返还 ' + payout + ' 金币（净 ' + (m.settle.net >= 0 ? '+' : '') + m.settle.net + '）', 'ok');
        F.Audio2.ok();
      } else if (m.myBets[0] + m.myBets[1] > 0) F.UI.toast('竞猜失败，损失 ' + (m.myBets[0] + m.myBets[1]) + ' 金币', 'bad');

      if (m.mine) {
        const mode = MODES.find(x => x.id === m.mode) || MODES[0];
        if (win === 0) {
          const rw = Math.round(F.rnd(mode.reward[0], mode.reward[1]));
          F.Game.addCoins(rw);
          A.record.win++; A.record.coins += rw;
          A.record.points += m.mode === '10v10' ? 10 : (m.mode === '3v3' ? 5 : 2);
          F.UI.toast('你的队伍获胜！获得 ' + rw + ' 金币与斗兽声望', 'ok');
          if (F.Social) F.Social.sys('斗兽场：你在「' + mode.name + '」战胜了 ' + m.b.name + '！');
        } else {
          A.record.lose++;
          const c = Math.round(mode.reward[0] * 0.2);
          F.Game.addCoins(c);
          F.UI.toast('你的队伍落败…安慰奖 ' + c + ' 金币', 'info');
          if (F.Social) F.Social.sys('斗兽场：你在「' + mode.name + '」中不敌 ' + m.b.name + '。');
        }
      }
      A.history.unshift({ id: m.id, mode: m.modeName, a: m.a.name, b: m.b.name, winner: win, t: Date.now() });
      if (A.history.length > 30) A.history.pop();
    },

    tickFight(m, dt) {
      m.t -= dt;
      if (m.t > 0) return;
      m.t = 0.5;
      const sides = [m.a, m.b];
      for (let s = 0; s < 2; s++) {
        const me = sides[s], foe = sides[1 - s];
        const av = me.pets.filter(p => p.hp > 0), fv = foe.pets.filter(p => p.hp > 0);
        if (!av.length || !fv.length) continue;
        const src = av[(Math.random() * av.length) | 0];
        const dst = fv[(Math.random() * fv.length) | 0];
        const dmg = Math.max(1, Math.round(src.atk * F.rnd(0.75, 1.3)));
        dst.hp = Math.max(0, dst.hp - dmg);
        m.log.push(src.name + ' → ' + dst.name + ' -' + dmg);
        if (dst.hp <= 0) m.log.push(dst.name + ' 倒下了');
        if (m.log.length > 30) m.log.shift();
      }
      const ad = m.a.pets.every(p => p.hp <= 0), bd = m.b.pets.every(p => p.hp <= 0);
      if (ad || bd) {
        m.winner = (ad && bd) ? (Math.random() < 0.5 ? 0 : 1) : (bd ? 0 : 1);
        A.settle(m);
      }
    },

    update(dt) {
      /* NPC 对战排期 */
      A.spawnT -= dt;
      if (A.spawnT <= 0) {
        A.spawnT = F.rnd(40, 78);
        const running = A.matches.filter(m => m.phase !== 'done').length;
        if (running < 2) {
          const r = Math.random();
          const mode = MODES[r < 0.55 ? 0 : (r < 0.85 ? 1 : 2)];
          A.startMatch({ mode: mode.id, lvHint: Math.round(F.rnd(8, 34)) });
        }
      }
      /* NPC 围观者持续下注 → 赔率实时波动 */
      A.betT -= dt;
      if (A.betT <= 0) {
        A.betT = 1.1;
        for (const m of A.matches) {
          if (m.phase !== 'bet') continue;
          const bias = (A.sidePower(m.b) - A.sidePower(m.a)) / Math.max(1, A.sidePower(m.a) + A.sidePower(m.b));
          const pickA = Math.random() < clamp(0.5 + bias * 0.5, 0.15, 0.85);
          const amt = Math.round(F.rnd(20, 260) * (m.mode === '10v10' ? 2.2 : m.mode === '3v3' ? 1.4 : 1));
          m.pools[pickA ? 0 : 1] += amt;
          A.updateOdds(m);
        }
      }
      for (const m of A.matches) {
        if (m.phase === 'bet') {
          m.cd -= dt;
          if (m.cd <= 0) { m.phase = 'fight'; m.t = 0; m.log.push('裁判：战斗开始！'); }
        } else if (m.phase === 'fight') A.tickFight(m, dt);
      }
    },

    saveData() {
      return { record: A.record, market: { tax: A.market.tax, destroyed: A.market.destroyed } };
    },
    loadData(d) {
      if (!d) return;
      if (d.record) Object.assign(A.record, d.record);
      if (d.market) {
        /* 兼容旧存档字段（市场税率） */
        const t = d.market.tax != null ? d.market.tax : d.market.vig;
        A.market.tax = t != null ? clamp(t, 0, 0.5) : A.market.tax;
        A.market.destroyed = d.market.destroyed || 0;
      }
    },
    reset() {
      A.matches = []; A.history = []; A.record = { win: 0, lose: 0, bets: 0, betWin: 0, betLose: 0, coins: 0, points: 0 };
      A.market.destroyed = 0; A.market.dayBet = 0;
    },
  });
})();
