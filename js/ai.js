/*
 * Tractor — computer players. Three levels (original: 低级 / 中级 / 高级):
 *   1 easy   – legal but loose play, no card memory
 *   2 medium – heuristics from the help file's strategy tips
 *   3 hard   – adds card memory (played cards, known voids) and safe multi-card leads
 */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.TractorEngine;

  function rnd(n) { return Math.floor(Math.random() * n); }
  function ids(cards) { var m = {}; cards.forEach(function (c) { m[c.id] = true; }); return m; }
  function minus(a, b) { var m = ids(b); return a.filter(function (c) { return !m[c.id]; }); }

  /* ---------- building plays of a given shape ---------- */

  function sorter(mode, ctx) {
    return function (a, b) {
      var pa = E.points(a), pb = E.points(b), va = E.value(a, ctx), vb = E.value(b, ctx);
      if (mode === 'high') return vb - va;
      if (mode === 'dump') return (pb - pa) || (va - vb);
      return (pa - pb) || (va - vb); // low: avoid points, cheapest first
    };
  }

  // Choose n cards from a single-suit pool, matching the lead's structure as far as possible.
  function buildFromPool(pool, shape, n, mode, ctx) {
    if (pool.length <= n) return pool.slice();
    var g = E.groupCards(pool, ctx);
    var runs = E.buildRuns(g.pairs);
    var picked = [], tractorPairs = 0;
    shape.tractors.forEach(function (k) {
      if (picked.length + 2 * k > n) return;
      var cand = runs.filter(function (r) { return r.length >= k; });
      if (!cand.length) return;
      cand.sort(function (a, b) { return mode === 'high' ? b[0].v - a[0].v : a[a.length - 1].v - b[b.length - 1].v; });
      var run = cand[0], idx = runs.indexOf(run);
      var seg = mode === 'high' ? run.slice(0, k) : run.slice(run.length - k);
      var rest = mode === 'high' ? run.slice(k) : run.slice(0, run.length - k);
      runs.splice(idx, 1);
      if (rest.length) runs.push(rest);
      seg.forEach(function (p) { picked = picked.concat(p.cards); });
      tractorPairs += k;
    });
    var pairsLeft = [].concat.apply([], runs);
    var needPairs = Math.min(shape.totalPairs, g.pairs.length) - tractorPairs;
    needPairs = Math.min(needPairs, pairsLeft.length, Math.floor((n - picked.length) / 2));
    var ps = sorter(mode, ctx);
    pairsLeft.sort(function (a, b) { return ps(a.cards[0], b.cards[0]); });
    for (var i = 0; i < needPairs; i++) picked = picked.concat(pairsLeft[i].cards);
    var rem = minus(pool, picked);
    var pairIds = {};
    g.pairs.forEach(function (p) { pairIds[p.cards[0].id] = true; pairIds[p.cards[1].id] = true; });
    rem.sort(function (a, b) {
      if (mode !== 'high' && shape.totalPairs === 0) {
        var x = (pairIds[a.id] ? 1 : 0) - (pairIds[b.id] ? 1 : 0);
        if (x) return x; // don't break pairs needlessly
      }
      return ps(a, b);
    });
    return picked.concat(rem.slice(0, n - picked.length));
  }

  // Cheapest filler cards from outside the led suit.
  function filler(cards, n, mode, ctx) {
    var s = cards.slice().sort(function (a, b) {
      var ta = E.isTrump(a, ctx) ? 1 : 0, tb = E.isTrump(b, ctx) ? 1 : 0;
      if (ta !== tb) return ta - tb;
      return sorter(mode === 'dump' ? 'dump' : 'low', ctx)(a, b);
    });
    return s.slice(0, n);
  }

  function legalFallback(hand, lead, ctx) {
    var suit = E.uniformSuit(lead, ctx), shape = E.shapeOf(lead, ctx);
    var hS = E.ofSuit(hand, suit, ctx);
    var base = buildFromPool(hS, shape, Math.min(lead.length, hS.length), 'low', ctx);
    var play = base.concat(filler(minus(hand, base), lead.length - base.length, 'low', ctx));
    if (E.validateFollow(hand, lead, play, ctx).ok) return play;
    // random search (should essentially never be needed)
    for (var t = 0; t < 3000; t++) {
      var pool = hS.length >= lead.length ? hS.slice() : hand.slice();
      E.shuffle(pool);
      var p = hS.length >= lead.length ? pool.slice(0, lead.length) : hS.concat(minus(pool, hS).slice(0, lead.length - hS.length));
      if (E.validateFollow(hand, lead, p, ctx).ok) return p;
    }
    return play;
  }

  /* ---------- knowledge ---------- */

  // Cards this player cannot see (could be in other hands).
  function unseen(view) {
    var known = view.hand.concat(view.difficulty >= 3 ? view.played : []);
    if (view.difficulty >= 3 && view.buried) known = known.concat(view.buried);
    return minus(view.deck, known);
  }

  function isBoss(comp, suit, view) {
    return !E.componentBeatable(comp, suit, [unseen(view)], view.ctx);
  }

  /* ---------- leading ---------- */

  function chooseLead(view) {
    var hand = view.hand, ctx = view.ctx, d = view.difficulty;
    var suits = {};
    hand.forEach(function (c) { var s = E.effSuit(c, ctx); (suits[s] = suits[s] || []).push(c); });
    var plain = Object.keys(suits).filter(function (s) { return s !== 'T'; });

    if (d <= 1) {
      var keys = Object.keys(suits), s = keys[rnd(keys.length)];
      var comps = E.decompose(suits[s], ctx);
      var pick = Math.random() < 0.4 ? comps[0] : comps[comps.length - 1];
      return pick.cards;
    }

    var voids = view.voids || {};
    var opp = [E.nextSeat(view.seat), E.nextSeat(E.nextSeat(E.nextSeat(view.seat)))];
    var partner = E.partnerOf(view.seat);
    var oppVoid = function (s) { return d >= 3 && opp.some(function (o) { return voids[o] && voids[o][s]; }); };

    // Last trick for defenders, or the declarer's side guarding the kitty: lead the biggest structure.
    // 1. Boss combinations in plain suits (A's, top pairs, tractors) — keep the lead.
    var best = null;
    plain.forEach(function (s) {
      if (oppVoid(s)) return;
      var comps = E.decompose(suits[s], ctx);
      var boss = comps.filter(function (c) { return isBoss(c, s, view); });
      if (!boss.length) return;
      var cards;
      if (d >= 3 && boss.length >= 2) cards = [].concat.apply([], boss.map(function (c) { return c.cards; }));
      else {
        boss.sort(function (a, b) { return b.cards.length - a.cards.length || b.v - a.v; });
        cards = boss[0].cards;
      }
      var score = cards.length * 10 + E.sumPoints(cards);
      if (!best || score > best.score) best = { cards: cards, score: score };
    });
    if (best) return best.cards;

    // 2. Partner is void in a suit and opponents are not: lead it (points if possible) so partner can trump.
    if (d >= 3) {
      for (var i = 0; i < plain.length; i++) {
        var s2 = plain[i];
        if (voids[partner] && voids[partner][s2] && !oppVoid(s2)) {
          var sorted = suits[s2].slice().sort(sorter('dump', ctx));
          return [sorted[0]];
        }
      }
    }

    // 3. Declaring side with lots of trumps: pull trumps with boss trump structures.
    var trumps = suits.T || [];
    if (trumps.length >= hand.length * 0.5 && trumps.length) {
      var tc = E.decompose(trumps, ctx).filter(function (c) { return c.type !== 'single' || isBoss(c, 'T', view); });
      if (tc.length) return tc[0].cards;
    }

    // 4. Shortest plain suit, cheapest card — work towards a void (策略: 扣光一门).
    if (plain.length) {
      plain.sort(function (a, b) { return suits[a].length - suits[b].length; });
      var s3 = plain[0];
      var comps3 = E.decompose(suits[s3], ctx);
      var pairs = comps3.filter(function (c) { return c.type !== 'single' && E.sumPoints(c.cards) === 0; });
      if (pairs.length && Math.random() < 0.5) return pairs[pairs.length - 1].cards;
      return [suits[s3].slice().sort(sorter('low', ctx))[0]];
    }
    return [trumps.slice().sort(sorter('low', ctx))[0]];
  }

  /* ---------- following ---------- */

  function wins(view, cards) {
    var plays = view.trick.concat([{ seat: view.seat, cards: cards }]);
    return E.trickWinner(plays, view.ctx) === plays.length - 1;
  }

  function chooseFollow(view) {
    var hand = view.hand, ctx = view.ctx, d = view.difficulty;
    var lead = view.trick[0].cards, n = lead.length;
    var suit = E.uniformSuit(lead, ctx), shape = E.shapeOf(lead, ctx);
    var hS = E.ofSuit(hand, suit, ctx);
    var winnerIdx = E.trickWinner(view.trick, ctx);
    var winnerSeat = view.trick[winnerIdx].seat;
    var partnerWinning = E.sameTeam(winnerSeat, view.seat);
    var isLast = view.trick.length === 3;
    var trickPts = view.trick.reduce(function (a, p) { return a + E.sumPoints(p.cards); }, 0);
    var lastTrick = hand.length === n;

    var partnerSafe = partnerWinning && (isLast || (function () {
      var wc = view.trick[winnerIdx].cards;
      if (d <= 1) return Math.random() < 0.5;
      var ws = E.uniformSuit(wc, ctx);
      if (ws === 'T' && suit !== 'T') return true;
      var comps = E.decompose(wc, ctx);
      return comps.every(function (c) { return isBoss(c, ws, view); });
    })());

    var choice = null;

    if (hS.length >= n) {
      if (partnerSafe) choice = buildFromPool(hS, shape, n, 'dump', ctx);
      else {
        // try to win cheaply
        if (n === 1) {
          var asc = hS.slice().sort(function (a, b) { return E.value(a, ctx) - E.value(b, ctx); });
          var w = null;
          for (var i = 0; i < asc.length && !w; i++) if (wins(view, [asc[i]])) w = asc[i];
          // take the trick with the cheapest winning card when it is worth it
          if (w && (trickPts > 0 || E.points(w) > 0 || isLast || lastTrick || (d <= 1 && Math.random() < 0.5) ||
              (d >= 2 && isBoss({ type: 'single', v: E.value(w, ctx), cards: [w] }, suit, view)))) choice = [w];
        } else {
          var hi = buildFromPool(hS, shape, n, 'high', ctx);
          if (wins(view, hi) && (trickPts > 0 || lastTrick || d <= 1)) choice = hi;
        }
        if (!choice) choice = buildFromPool(hS, shape, n, partnerWinning ? 'dump' : 'low', ctx);
      }
    } else if (hS.length > 0) {
      choice = hS.concat(filler(minus(hand, hS), n - hS.length, partnerSafe ? 'dump' : 'low', ctx));
    } else {
      // void in the led suit: trump (毙) or discard (垫)
      var trumps = suit === 'T' ? [] : E.ofSuit(hand, 'T', ctx);
      var wantTrump = !partnerSafe && trumps.length >= n &&
        (trickPts > 0 || lastTrick || trumps.length >= 8 || (d <= 1 && Math.random() < 0.5));
      if (wantTrump) {
        var lo = buildFromPool(trumps, shape, n, 'low', ctx);
        if (E.matchExact(lo, shape, ctx) !== null && wins(view, lo)) choice = lo;
        else {
          var th = buildFromPool(trumps, shape, n, 'high', ctx);
          if (E.matchExact(th, shape, ctx) !== null && wins(view, th) && (trickPts >= 10 || lastTrick)) choice = th;
        }
      }
      if (!choice) choice = filler(hand, n, partnerSafe ? 'dump' : 'low', ctx);
    }

    if (!E.validateFollow(hand, lead, choice, ctx).ok) choice = legalFallback(hand, lead, ctx);
    return choice;
  }

  /* ---------- kitty (扣底) ---------- */

  function chooseBury(hand, ctx, difficulty) {
    var counts = {};
    hand.forEach(function (c) { var s = E.effSuit(c, ctx); counts[s] = (counts[s] || 0) + 1; });
    var g = {};
    hand.forEach(function (c) { var k = E.key(c); g[k] = (g[k] || 0) + 1; });
    var score = function (c) {
      if (E.isTrump(c, ctx)) return 1000 + E.value(c, ctx);
      var s = E.value(c, ctx) * 2;
      if (E.points(c)) s += difficulty <= 1 ? 4 : 30; // don't bury points (策略)
      if (g[E.key(c)] >= 2) s += 20;
      if (c.rank === 14) s += 25;
      s += counts[E.effSuit(c, ctx)] * (difficulty >= 2 ? 3 : 0); // void short suits
      return s;
    };
    return hand.slice().sort(function (a, b) { return score(a) - score(b); }).slice(0, 8);
  }

  /* ---------- declaring (亮牌) ---------- */

  function suitStrength(hand, suit, level, ctx2) {
    var c = { level: level, trump: suit, twoPerm: ctx2.twoPerm };
    return hand.reduce(function (a, x) { return a + (E.isTrump(x, c) ? (x.suit === 'J' || x.rank === level ? 2 : 1) : 0); }, 0);
  }

  /*
   * The human player's partner (对家) declares for the human's team (r37):
   *  - hand 1, nobody has declared yet → grab at once (抢亮: the first declarer becomes declarer)
   *  - never overrides the human's declaration; protects it when the rules allow
   *  - overrides an opponent's single with a pair only when that suit is at least as good for us
   *    (opponents declaring: ≥ their suit, taking their suit away is a gain; we declaring: ≥ +1)
   *  - 反无主 only when the opponents are the declarers (hand 1: the opponents declared first), in the
   *    last window after the deal. Never when our own side is declaring. It also replaces a suit the
   *    human declared: with all four jokers in our hands, no-trump measured better (tests/declare.js).
   *    Exception: hand 1 with nobody declared at the end → no-trump grabs the declarer seat.
   */
  function allyDeclare(options, hand, seat, decl, level, opts, dealt, info) {
    var base = { twoPerm: opts.twoPerm };
    var d = info.declarer, known = d !== null && d !== undefined;
    var oppDeclaring = known && !E.sameTeam(d, seat), end = dealt >= 25;
    var nt = options.filter(function (o) { return o.suit === E.NO_TRUMP; })[0];
    if (nt && end) {
      if (oppDeclaring) return nt;
      if (!known && !decl) return nt;
    }
    var scored = options.filter(function (o) { return o.suit !== E.NO_TRUMP; }).map(function (o) {
      return { o: o, s: suitStrength(hand, o.suit, level, base) + (o.count >= 2 ? 0.5 : 0) };
    }).sort(function (a, b) { return b.s - a.s; });
    if (!scored.length) return null;
    var top = scored[0];
    if (!decl) {
      if (!known) return top.o; // hand 1: 抢亮
      if (dealt < 6) return null;
      return top.s >= dealt * 0.45 + 2 || dealt >= 20 ? top.o : null;
    }
    var protect = scored.filter(function (x) { return x.o.kind === 'selfProtect' || x.o.kind === 'partnerProtect'; })[0];
    if (protect) return protect.o;
    var cur = suitStrength(hand, decl.suit, level, base);
    if (decl.seat === info.humanSeat) return null; // never override the human partner
    if (decl.seat === seat) return top.o.kind === 'selfOverride' && top.s >= cur + 5 ? top.o : null;
    var over = scored.filter(function (x) { return x.o.kind === 'override'; })[0];
    if (!over) return null;
    return over.s >= cur + (oppDeclaring ? 0 : 1) ? over.o : null;
  }

  function chooseDeclare(hand, seat, decl, level, opts, difficulty, dealt, info) {
    var options = E.declareOptions(hand, seat, decl, level, opts);
    if (!options.length) return null;
    if (info && info.ally) return allyDeclare(options, hand, seat, decl, level, opts, dealt, info);
    var base = { twoPerm: opts.twoPerm };
    var nt = options.filter(function (o) { return o.suit === E.NO_TRUMP; })[0];
    if (nt && (!decl || !E.sameTeam(decl.seat, seat) || level === 10 || level === 13)) return nt;
    var expect = dealt / 4; // average trump-ish count for a random suit
    var scored = options.filter(function (o) { return o.suit !== E.NO_TRUMP; }).map(function (o) {
      return { o: o, s: suitStrength(hand, o.suit, level, base) };
    }).sort(function (a, b) { return b.s - a.s; });
    if (!scored.length) return null;
    var top = scored[0];
    if (!decl) {
      // wait to see some cards first (a level card counts 2, other trumps 1)
      if (dealt < 6) return null;
      if (difficulty <= 1) return dealt >= 10 ? top.o : null;
      if (top.s >= dealt * 0.45 + 2 || dealt >= 20) return top.o;
      return null;
    }
    // protecting our own / partner's suit
    var protect = scored.filter(function (x) { return x.o.kind === 'selfProtect' || x.o.kind === 'partnerProtect'; })[0];
    if (protect) return protect.o;
    var cur = suitStrength(hand, decl.suit, level, base);
    if (E.sameTeam(decl.seat, seat)) return top.s >= cur + 5 ? top.o : null;
    return top.s >= cur + 1 ? top.o : null;
  }

  /*
   * 自动亮主 (r37): declare only when it helps your team.
   *  Strength of a suit X = your trumps if X were trump (jokers / level cards count 2, others 1);
   *  "mean" = average over the four suits (≈ what a random kitty suit would give you).
   *  - hand 1, nobody declared yet → grab at once (抢亮: the first declarer becomes declarer);
   *    a pair if its suit is about as good, else your strongest single
   *  - declarer already known (hand 2+, or someone else declared first in hand 1) → watch first:
   *      pair: from 12 cards, if it is your strongest suit and mean+1 (from 20: mean+1)
   *      single: from 16 cards, strongest suit by 1+ and mean+2; from 21, strongest and mean+1;
   *              from 24, mean+1
   *      (thresholds tuned with tests/declare.js: earlier declaring measured worse)
   *      after the deal (last chance): always your best suit — you are never asked to choose (r43)
   *  - your own single: lock it (自保) if it is still within 1 of your best other suit (always at the end); switch (自反,
   *    when allowed) only to a suit 3+ stronger
   *  - partner's single: protect (对家保, when allowed) unless that suit is clearly bad for you;
   *    never override your partner
   *  - opponents' single: override (反主) with your best pair if it is stronger for you — when the
   *    opponents are the declarers an equal suit is enough (taking their suit away is a gain);
   *    before 13 cards one extra point is required
   *  - never no-trump (owner, r36): the NT button stays lit for you to press
   */
  function autoDeclarePick(g, final) {
    var me = g.humanSeat;
    if (me === null || me === undefined) return null;
    var opts = g.humanDeclareOptions().filter(function (o) { return o.suit !== 'N'; }), decl = g.decl;
    if (!opts.length) return null;
    var hand = g.hands[me], n = hand.length, S = {}, sum = 0;
    E.SUITS.forEach(function (x) { S[x] = suitStrength(hand, x, g.level, { twoPerm: g.rules.twoPerm }); sum += S[x]; });
    var mean = sum / 4;
    var bestOther = function (x) { return Math.max.apply(null, E.SUITS.filter(function (y) { return y !== x; }).map(function (y) { return S[y]; })); };
    var d = g.declarer !== null && g.declarer !== undefined ? g.declarer : g.firstDeclarer;
    var known = d !== null && d !== undefined, oppDeclaring = known && !E.sameTeam(d, me);
    var pick = function (kind, bonus) {
      return opts.filter(function (o) { return !kind || o.kind === kind; })
        .sort(function (a, b) { return (S[b.suit] + (b.count >= 2 ? bonus : 0)) - (S[a.suit] + (a.count >= 2 ? bonus : 0)); })[0] || null;
    };
    if (!decl) {
      if (!known) return pick(null, 2); // hand 1: 抢亮
      var o = pick(null, 0.5), s = S[o.suit], lead = s - bestOther(o.suit);
      if (final) return o; // last chance: always declare your best suit for you (owner, r43)
      if (o.count >= 2) return (n >= 12 && lead >= 0 && s >= mean + 1) || (n >= 20 && s >= mean + 1) ? o : null;
      if (n >= 16 && lead >= 1 && s >= mean + 2) return o;
      if (n >= 21 && lead >= 0 && s >= mean + 1) return o;
      return n >= 24 && s >= mean + 1 ? o : null;
    }
    var X = decl.suit;
    if (decl.seat === me) { // your own single
      var sw = pick('selfOverride', 0);
      if (sw && S[sw.suit] >= S[X] + 3) return sw;
      var lock = pick('selfProtect', 0);
      return lock && (final || S[X] >= bestOther(X) - 1) ? lock : null;
    }
    if (E.sameTeam(decl.seat, me)) { // partner's single
      var pp = pick('partnerProtect', 0);
      return pp && S[X] >= mean - 1 ? pp : null;
    }
    var ov = pick('override', 0); // opponents' single
    if (!ov) return null;
    var need = S[X] + (oppDeclaring ? 0 : 1) + (n < 13 && !final ? 1 : 0);
    return S[ov.suit] >= need && S[ov.suit] >= mean ? ov : null;
  }

  var api = {
    chooseLead: chooseLead, chooseFollow: chooseFollow, chooseBury: chooseBury, chooseDeclare: chooseDeclare, suitStrength: suitStrength, autoDeclarePick: autoDeclarePick,
    buildFromPool: buildFromPool, legalFallback: legalFallback
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TractorAI = api;
})(typeof window !== 'undefined' ? window : this);
