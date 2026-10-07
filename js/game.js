/*
 * Tractor — game flow: deal & declare, kitty, tricks, scoring, level-up, rotation.
 * Seats: 0 South (you), 1 East (your 下家, next to play), 2 North (partner), 3 West.
 * Teams: 0 = South/North, 1 = East/West.
 */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var E = isNode ? require('./engine.js') : root.TractorEngine;
  var AI = isNode ? require('./ai.js') : root.TractorAI;

  var DEFAULT_RULES = {
    allowSelfOverride: true, allowPartnerProtect: false, twoPerm: false,
    allowNoTrump: true, fiveTenK: false, ajMust: true,
    takeoverUp: false // 上台即升级: off = standard table
  };

  function Game(config, hooks) {
    this.rules = Object.assign({}, DEFAULT_RULES, config.rules || {});
    this.difficulty = Object.assign({ partner: 2, opponents: 2 }, config.difficulty || {});
    // 好牌模式 (good-hand mode): 0 off (pure random), 1 better, 2 much better. Applies to the human seat.
    this.luck = config.luck || 0;
    this.humanSeat = config.humanSeat === undefined ? 0 : config.humanSeat; // null → all computer
    // seat that good-hand / must-win mode favours (set after humanSeat — it defaults to the player's seat)
    this.luckSeat = config.luckSeat !== undefined ? config.luckSeat : this.humanSeat;
    this.hooks = hooks || {};
    var start = E.startLevel(this.rules);
    this.levels = config.levels ? config.levels.slice() : [start, start];
    this.declarer = config.declarer === undefined ? null : config.declarer; // null → first hand, race to declare
    this.handNo = config.handNo || 0;
    this.winner = null;
    this.aborted = false;
    this.hands = [[], [], [], []];
    this.trick = [];
    this.phase = 'idle';
  }

  Game.prototype.emit = function (type, data) {
    if (this.hooks.event) return this.hooks.event(type, data || {}, this);
  };
  Game.prototype.delay = function (kind) {
    if (this.hooks.delay) return this.hooks.delay(kind);
    return null;
  };
  Game.prototype.isHuman = function (seat) { return this.humanSeat !== null && seat === this.humanSeat; };
  Game.prototype.seatDifficulty = function (seat) {
    if (this.seatDiffOverride && this.seatDiffOverride[seat] !== undefined) return this.seatDiffOverride[seat];
    var ref = this.humanSeat !== null ? this.humanSeat : this.luckSeat;
    // 必胜模式: partner plays at Hard, opponents at Easy
    if (this.luck === 3 && ref !== null && ref !== undefined && seat !== ref) return E.sameTeam(seat, ref) ? 3 : 1;
    if (this.humanSeat === null) return this.difficulty.opponents;
    return E.sameTeam(seat, this.humanSeat) ? this.difficulty.partner : this.difficulty.opponents;
  };
  Game.prototype.teamOf = function (seat) { return seat % 2; };

  Game.prototype.saveState = function () {
    var pd = this.pendingDeclarer;
    return { levels: this.levels.slice(), declarer: pd !== null && pd !== undefined ? pd : this.declarer, handNo: this.handNo, rules: this.rules, difficulty: this.difficulty };
  };

  /* ---------- Human input helpers (called by the UI) ---------- */

  Game.prototype.humanDeclareOptions = function () {
    if (this.phase !== 'deal' || this.humanSeat === null || this.ntLevel) return [];
    return E.declareOptions(this.hands[this.humanSeat], this.humanSeat, this.decl, this.level, this.rules);
  };

  Game.prototype.humanDeclare = function (suit) {
    var opt = this.humanDeclareOptions().filter(function (o) { return o.suit === suit; })
      .sort(function (a, b) { return b.count - a.count; })[0];
    if (!opt) return false;
    this.applyDeclare(this.humanSeat, opt);
    return true;
  };

  // Check a human play before submitting. Returns { ok, reason }.
  Game.prototype.checkPlay = function (seat, cards) {
    var ctx = this.ctx;
    if (!cards.length) return { ok: false, reason: 'empty' };
    if (!this.trick.length) {
      if (!E.isValidLeadForm(cards, ctx)) return { ok: false, reason: 'leadMixed' };
      return { ok: true };
    }
    return E.validateFollow(this.hands[seat], this.trick[0].cards, cards, ctx);
  };

  /* ---------- Core flow ---------- */

  Game.prototype.applyDeclare = function (seat, opt) {
    this.decl = E.applyDeclare(this.decl, seat, opt);
    if (this.firstDeclarer === null) this.firstDeclarer = seat;
    this.declHistory.push({ seat: seat, suit: opt.suit, kind: opt.kind, cards: opt.cards });
    this.emit('declare', { seat: seat, option: opt, decl: this.decl });
  };

  Game.prototype.aiDeclareRound = function (dealt) {
    if (this.ntLevel) return;
    for (var s = 0; s < 4; s++) {
      if (this.isHuman(s) || s === this.noDeclareSeat) continue;
      var o = AI.chooseDeclare(this.hands[s], s, this.decl, this.level, this.rules, this.seatDifficulty(s), dealt);
      if (o) this.applyDeclare(s, o);
    }
  };

  // Shuffle a deck. In good-hand mode, try several shuffles and keep the one that gives
  // the lucky seat the strongest 25 cards — each hand still looks like a natural deal.
  var LUCK_TRIES = [1, 4, 20];
  Game.prototype.dealDeck = function (first) {
    var tries = this.luckSeat === null ? 1 : LUCK_TRIES[this.luck] || 1;
    var best = null, bestScore = -Infinity, seat = this.luckSeat, level = this.level;
    for (var t = 0; t < tries; t++) {
      var deck = E.shuffle(E.makeDeck());
      if (tries === 1) return deck;
      var mine = [];
      for (var i = 0; i < 100; i++) if ((first + i) % 4 === seat) mine.push(deck[i]);
      var sc = E.handQuality(mine, level);
      if (sc > bestScore) { bestScore = sc; best = deck; }
    }
    return best;
  };

  /*
   * 必胜模式 (must-win mode): try candidate deals and secretly play each hand out several
   * times with a stand-in for the player — a normal player, a weak player, and one who
   * never declares trump — then deal the candidate the player's team wins most safely.
   * Nobody cheats during play; only the deal is chosen.
   */
  var MUSTWIN_REHEARSALS = [{ d: 2 }, { d: 1 }, { d: 2, noDeclare: true }, { d: 2 }, { d: 1 }, { d: 1, noDeclare: true }];
  Game.prototype.rehearse = async function (deck, stand) {
    var Self = this.constructor;
    var g = new Self({ humanSeat: null, rules: this.rules, levels: this.levels.slice(), declarer: this.declarer, handNo: this.handNo - 1 }, {});
    g.presetDeck = deck; g.luck = 3; g.luckSeat = this.luckSeat;
    g.seatDiffOverride = {}; g.seatDiffOverride[this.luckSeat] = stand.d;
    if (stand.noDeclare) g.noDeclareSeat = this.luckSeat;
    var s = await g.playHand();
    var ourDecl = E.sameTeam(s.declarer, this.luckSeat);
    var p = s.defenderPoints;
    return ourDecl ? 80 - p : p - 80; // > 0 means our team wins this hand
  };
  // Two stages, because play is noisy (the same deal can swing by 80+ points): screen many
  // candidates with a few rehearsals, then re-rehearse the best few many times and keep
  // the one that wins most consistently. This avoids picking a deal that was only lucky.
  Game.prototype.mustWinDeck = async function (first) {
    var t0 = Date.now(), budget = this.mustWinBudget || 1200; // ms
    var seat = this.luckSeat, partner = E.partnerOf(seat), level = this.level;
    var R = MUSTWIN_REHEARSALS, pool = [], sims = 0;
    var candidate = function () {
      var cand = null, cq = -Infinity;
      for (var k = 0; k < 6; k++) {
        var d = E.shuffle(E.makeDeck()), q = 0;
        for (var i = 0; i < 100; i++) {
          var who = (first + i) % 4;
          if (who === seat || who === partner) q += E.handQuality([d[i]], level);
        }
        if (q > cq) { cq = q; cand = d; }
      }
      return cand;
    };
    // stage 1: screen
    for (var c = 0; c < 60 && (c < 12 || Date.now() - t0 < budget * 0.4); c++) {
      var deck = candidate(), ms = [], st = [];
      for (var r = 0; r < 3; r++) { var sd = R[(c + r) % R.length]; ms.push(await this.rehearse(deck, sd)); st.push(sd); sims++; }
      pool.push({ deck: deck, ms: ms, st: st });
    }
    pool.sort(function (a, b) { return Math.min.apply(null, b.ms) - Math.min.apply(null, a.ms); });
    // stage 2: verify the best few
    var best = null, bestKey = -Infinity, top = pool.slice(0, 6);
    for (var t = 0; t < top.length; t++) {
      var e = top[t];
      for (var k = 0; k < 18 && (k < 8 || Date.now() - t0 < budget); k++) { var sk = R[k % R.length]; e.ms.push(await this.rehearse(e.deck, sk)); e.st.push(sk); sims++; }
      // must win whether or not the player declares trump: score by the worse of the two
      var rate = function (noDecl) {
        var xs = e.ms.filter(function (m, i) { return !!e.st[i].noDeclare === noDecl; });
        return xs.length ? xs.filter(function (m) { return m > 0; }).length / xs.length : 0;
      };
      var wins = Math.min(rate(false), rate(true));
      var sorted = e.ms.slice().sort(function (a, b) { return a - b; });
      var low = sorted[Math.floor(sorted.length * 0.1)]; // 10th-percentile margin
      var key = wins * 1000 + low;
      if (key > bestKey) { bestKey = key; best = e; }
    }
    var wr = bestKey / 1000;
    this.mustWinInfo = { candidates: pool.length, rehearsals: sims, winRate: wr, ms: Date.now() - t0 };
    return best.deck;
  };

  Game.prototype.playHand = async function () {
    var self = this;
    this.handNo++;
    this.phase = 'deal';
    if (this.pendingDeclarer !== null && this.pendingDeclarer !== undefined) { this.declarer = this.pendingDeclarer; this.pendingDeclarer = null; }
    // the level being played is the declaring team's level; first hand both teams are equal
    this.level = this.declarer === null ? this.levels[0] : this.levels[this.teamOf(this.declarer)];
    this.decl = null; this.firstDeclarer = null; this.declHistory = [];
    this.ntLevel = this.level === E.NT_LEVEL; // 打无主: no declaring, no trump suit
    this.ctx = { level: this.level, trump: this.ntLevel ? E.NO_TRUMP : null, twoPerm: this.rules.twoPerm };
    this.hands = [[], [], [], []];
    this.played = []; this.voids = [{}, {}, {}, {}];
    this.trick = []; this.lastTrick = null;
    this.defenderPoints = 0; this.pointCards = [[], []];
    var first = this.declarer === null ? 0 : this.declarer;
    var mustWin = !this.presetDeck && this.luck === 3 && this.luckSeat !== null;
    if (mustWin) await this.emit('preparing', {});
    var deck = this.presetDeck ? this.presetDeck.slice() : (mustWin ? await this.mustWinDeck(first) : this.dealDeck(first));
    this.deck = deck.slice();
    this.kitty = deck.slice(100);
    this.luckUsed = this.luck > 0 && this.luckSeat !== null;
    await this.emit('handStart', { handNo: this.handNo, level: this.level, declarer: this.declarer });

    for (var i = 0; i < 100; i++) {
      if (this.aborted) return null;
      var seat = (first + i) % 4;
      this.hands[seat].push(deck[i]);
      await this.emit('deal', { seat: seat, card: deck[i], count: i + 1 });
      await this.delay('deal');
      if (i % 4 === 3) this.aiDeclareRound(Math.floor(i / 4) + 1);
    }
    // last chance to declare
    await this.emit('dealEnd', {});
    if (!this.ntLevel) {
      // last chance to declare: the human's window comes first, then the computer players
      await this.delay('declareWindow');
      if (this.aborted) return null;
      this.aiDeclareRound(25);
    }
    this.phase = 'kitty';
    var trump = this.ntLevel ? E.NO_TRUMP : (this.decl ? this.decl.suit : E.trumpFromKitty(this.kitty));
    if (this.declarer === null) {
      this.declarer = this.firstDeclarer !== null ? this.firstDeclarer : Math.floor(Math.random() * 4);
      this.level = this.levels[this.teamOf(this.declarer)];
    }
    this.ctx = { level: this.level, trump: trump, twoPerm: this.rules.twoPerm };
    await this.emit('trumpSet', { trump: trump, fromKitty: !this.decl, kitty: this.decl ? null : this.kitty, declarer: this.declarer });

    // declarer takes the kitty and buries 8 (扣底)
    var d = this.declarer;
    this.hands[d] = this.hands[d].concat(this.kitty);
    await this.emit('kittyTaken', { seat: d });
    await this.emit('turn', { seat: d });
    var bury;
    if (this.isHuman(d)) bury = await this.hooks.askBury(this);
    else { await this.delay('think'); bury = AI.chooseBury(this.hands[d], this.ctx, this.seatDifficulty(d)); }
    if (this.aborted) return null;
    var buryIds = {}; bury.forEach(function (c) { buryIds[c.id] = true; });
    this.hands[d] = this.hands[d].filter(function (c) { return !buryIds[c.id]; });
    this.kitty = bury;
    await this.emit('buried', { seat: d });

    // 25 tricks
    this.phase = 'play';
    var leader = d;
    for (var t = 0; this.hands[leader].length > 0; t++) {
      this.trick = [];
      for (var k = 0; k < 4; k++) {
        if (this.aborted) return null;
        var s = (leader + k) % 4;
        var cards = await this.getPlay(s);
        if (this.aborted) return null;
        this.commitPlay(s, cards);
        await this.emit('play', { seat: s, cards: cards, trick: this.trick });
        await this.delay('play');
      }
      var wi = E.trickWinner(this.trick, this.ctx);
      var winSeat = this.trick[wi].seat;
      var pts = this.trick.reduce(function (a, p) { return a + E.sumPoints(p.cards); }, 0);
      var defenders = !E.sameTeam(winSeat, d);
      if (defenders) {
        this.defenderPoints += pts;
        this.trick.forEach(function (p) { self.pointCards[1 - self.teamOf(d)] = self.pointCards[1 - self.teamOf(d)].concat(p.cards.filter(function (c) { return E.points(c) > 0; })); });
      }
      this.lastTrick = this.trick;
      await this.emit('trickEnd', { winner: winSeat, points: pts, defenders: defenders, trickNo: t + 1 });
      await this.delay('trickEnd');
      leader = winSeat;
      if (this.hands[leader].length === 0) {
        var kittyPts = E.sumPoints(this.kitty);
        var mult = E.kittyMultiplier(this.trick[0].cards, this.ctx);
        var bonus = defenders ? kittyPts * mult : 0;
        this.defenderPoints += bonus;
        await this.emit('kitty', { kitty: this.kitty, points: kittyPts, multiplier: mult, bonus: bonus, defenders: defenders });
      }
    }
    return this.finishHand();
  };

  // What a player at `s` is allowed to know (used by the AI and by the Hint button).
  Game.prototype.viewFor = function (s, difficulty) {
    return {
      seat: s, hand: this.hands[s], ctx: this.ctx, trick: this.trick, played: this.played,
      deck: this.deck, buried: s === this.declarer ? this.kitty : null, voids: this.voids,
      difficulty: difficulty || this.seatDifficulty(s), declarer: this.declarer
    };
  };

  Game.prototype.getPlay = async function (s) {
    var view = this.viewFor(s);
    var cards;
    await this.emit('turn', { seat: s });
    if (this.isHuman(s)) cards = await this.hooks.askPlay(this);
    else {
      await this.delay('think');
      cards = this.trick.length ? AI.chooseFollow(view) : AI.chooseLead(view);
    }
    if (!cards) return null;
    if (!this.trick.length) {
      var others = [0, 1, 2, 3].filter(function (x) { return x !== s; }).map(function (x) { return this.hands[x]; }, this);
      var r = E.checkThrow(cards, others, this.ctx);
      if (!r.ok) {
        await this.emit('throwFailed', { seat: s, attempted: cards, forced: r.forced });
        cards = r.forced;
      }
    }
    return cards;
  };

  Game.prototype.commitPlay = function (s, cards) {
    var ctx = this.ctx;
    var ids = {}; cards.forEach(function (c) { ids[c.id] = true; });
    this.hands[s] = this.hands[s].filter(function (c) { return !ids[c.id]; });
    this.played = this.played.concat(cards);
    if (this.trick.length) {
      var lead = this.trick[0].cards, suit = E.uniformSuit(lead, ctx);
      if (E.ofSuit(cards, suit, ctx).length < lead.length) this.voids[s][suit] = true;
    }
    this.trick.push({ seat: s, cards: cards });
  };

  Game.prototype.finishHand = async function () {
    var d = this.declarer, dTeam = this.teamOf(d), oTeam = 1 - dTeam;
    var res = E.handResult(this.defenderPoints, this.rules.takeoverUp);
    var before = this.levels.slice();
    var matchOver = false, newDeclarer;
    if (res.declarersWin) {
      if (this.levels[dTeam] >= E.maxLevel(this.rules)) matchOver = true;
      this.levels[dTeam] = E.advanceLevel(this.levels[dTeam], res.steps, this.rules);
      newDeclarer = E.partnerOf(d); // 庄家升级 → 对家坐庄
    } else {
      this.levels[oTeam] = E.advanceLevel(this.levels[oTeam], res.steps, this.rules);
      newDeclarer = E.nextSeat(d); // 闲家上台 → 原庄家的下家坐庄
    }
    var summary = {
      declarer: d, declarerTeam: dTeam, defenderPoints: this.defenderPoints, result: res,
      levelsBefore: before, levelsAfter: this.levels.slice(), nextDeclarer: newDeclarer,
      matchOver: matchOver, winnerTeam: matchOver ? dTeam : null, trump: this.ctx.trump, level: this.level
    };
    this.pendingDeclarer = newDeclarer; // takes effect when the next hand starts
    this.phase = 'handEnd';
    if (matchOver) this.winner = dTeam;
    await this.emit('handEnd', summary);
    return summary;
  };

  Game.DEFAULT_RULES = DEFAULT_RULES;
  if (isNode) module.exports = Game;
  else root.TractorGame = Game;
})(typeof window !== 'undefined' ? window : this);
