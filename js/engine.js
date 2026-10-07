/*
 * Tractor (拖拉机 / 双抠) — rules engine.
 * Pure functions, no DOM. Implements RULES.md sections 2–8 (from TRACTOR.HLP).
 * Works in the browser (window.TractorEngine) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  var SUITS = ['S', 'H', 'D', 'C']; // spades, hearts, diamonds, clubs
  var SMALL_JOKER = 15, BIG_JOKER = 16;
  var NO_TRUMP = 'N';
  // 打无主: the level after A (when no-trump is allowed). No level rank, no trump suit:
  // only the jokers are trumps (permanent 2s are not trump at this level — see perm2).
  var NT_LEVEL = 15;

  /* ---------- Deck ---------- */

  function makeDeck() {
    var deck = [], id = 0;
    for (var d = 0; d < 2; d++) {
      for (var s = 0; s < 4; s++) {
        for (var r = 2; r <= 14; r++) deck.push({ id: id++, suit: SUITS[s], rank: r });
      }
      deck.push({ id: id++, suit: 'J', rank: SMALL_JOKER });
      deck.push({ id: id++, suit: 'J', rank: BIG_JOKER });
    }
    return deck; // 108 cards
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function key(c) { return c.suit + c.rank; }

  function points(c) {
    if (c.rank === 5) return 5;
    if (c.rank === 10 || c.rank === 13) return 10;
    return 0;
  }
  function sumPoints(cards) { var p = 0; for (var i = 0; i < cards.length; i++) p += points(cards[i]); return p; }

  /* ---------- Context: { level, trump: 'S'|'H'|'D'|'C'|'N', twoPerm } ---------- */

  // Permanent 2s apply at every level except the no-trump level (打无主: only the jokers are trump).
  function perm2(ctx) { return !!ctx.twoPerm && ctx.level !== NT_LEVEL; }

  function isTrump(c, ctx) {
    if (c.suit === 'J') return true;
    if (c.rank === ctx.level) return true;
    if (perm2(ctx) && c.rank === 2) return true;
    return c.suit === ctx.trump;
  }

  function effSuit(c, ctx) { return isTrump(c, ctx) ? 'T' : c.suit; }

  // Plain ranks of a suit, low → high, excluding the level rank and (if permanent) the 2.
  function plainRanks(ctx) {
    var out = [];
    for (var r = 2; r <= 14; r++) {
      if (r === ctx.level) continue;
      if (perm2(ctx) && r === 2) continue;
      out.push(r);
    }
    return out;
  }

  /*
   * Ordering value: higher beats lower within the same effective suit, and
   * consecutive values are "adjacent" (for tractors). Off-suit level cards share
   * one value (equal rank), as do off-suit permanent 2s.
   */
  function value(c, ctx) {
    var plain = plainRanks(ctx);
    if (!isTrump(c, ctx)) return plain.indexOf(c.rank);
    var nt = ctx.trump === NO_TRUMP;
    var v = nt ? 0 : plain.length; // trump-suit plain cards occupy 0..n-1
    if (!nt && c.suit === ctx.trump && c.rank !== ctx.level && !(perm2(ctx) && c.rank === 2)) {
      return plain.indexOf(c.rank);
    }
    // permanent 2s (if level is not 2)
    if (perm2(ctx) && ctx.level !== 2) {
      if (c.rank === 2 && c.suit !== 'J') {
        if (nt) return v;
        return c.suit === ctx.trump ? v + 1 : v;
      }
      v += nt ? 1 : 2;
    }
    // level cards (none at the no-trump level, so no gap before the jokers)
    if (ctx.level !== NT_LEVEL) {
      if (c.rank === ctx.level && c.suit !== 'J') {
        if (nt) return v;
        return c.suit === ctx.trump ? v + 1 : v;
      }
      v += nt ? 1 : 2;
    }
    if (c.rank === SMALL_JOKER) return v;
    return v + 1; // big joker
  }

  // Sort for display: trumps on the right-most (highest), grouped by suit.
  function sortHand(cards, ctx) {
    var order = { S: 0, H: 1, C: 2, D: 3, T: 4 };
    return cards.slice().sort(function (a, b) {
      var ea = effSuit(a, ctx), eb = effSuit(b, ctx);
      if (ea !== eb) return order[ea] - order[eb];
      var va = value(a, ctx), vb = value(b, ctx);
      if (va !== vb) return va - vb;
      var sa = order[a.suit] === undefined ? 5 : order[a.suit], sb = order[b.suit] === undefined ? 5 : order[b.suit];
      if (sa !== sb) return sa - sb;
      return a.id - b.id;
    });
  }

  function uniformSuit(cards, ctx) {
    if (!cards.length) return null;
    var s = effSuit(cards[0], ctx);
    for (var i = 1; i < cards.length; i++) if (effSuit(cards[i], ctx) !== s) return null;
    return s;
  }

  function ofSuit(cards, s, ctx) {
    return cards.filter(function (c) { return effSuit(c, ctx) === s; });
  }

  /* ---------- Structure: pairs, runs (tractors), singles ---------- */

  // Returns { pairs: [{v, cards:[a,b]}], singles: [{v, cards:[a]}] } — cards assumed one effective suit.
  function groupCards(cards, ctx) {
    var m = {}, order = [];
    cards.forEach(function (c) {
      var k = key(c);
      if (!m[k]) { m[k] = []; order.push(k); }
      m[k].push(c);
    });
    var pairs = [], singles = [];
    order.forEach(function (k) {
      var g = m[k], v = value(g[0], ctx);
      if (g.length >= 2) pairs.push({ v: v, cards: [g[0], g[1]] });
      if (g.length === 1) singles.push({ v: v, cards: [g[0]] });
    });
    pairs.sort(function (a, b) { return b.v - a.v; });
    singles.sort(function (a, b) { return b.v - a.v; });
    return { pairs: pairs, singles: singles };
  }

  // Build maximal runs of consecutive-value pairs (greedy, highest first). Each run: array of pair objects, high → low.
  function buildRuns(pairs) {
    var byV = {};
    pairs.forEach(function (p) { (byV[p.v] = byV[p.v] || []).push(p); });
    var runs = [];
    for (;;) {
      var vals = Object.keys(byV).map(Number).filter(function (v) { return byV[v].length; });
      if (!vals.length) break;
      var top = Math.max.apply(null, vals), run = [], v = top;
      while (byV[v] && byV[v].length) { run.push(byV[v].shift()); v--; }
      runs.push(run);
    }
    runs.sort(function (a, b) { return b.length - a.length || b[0].v - a[0].v; });
    return runs;
  }

  // Decompose a set (one effective suit) into components: tractors, pairs, singles.
  function decompose(cards, ctx) {
    var g = groupCards(cards, ctx);
    var runs = buildRuns(g.pairs);
    var comps = [];
    runs.forEach(function (run) {
      if (run.length >= 2) {
        comps.push({ type: 'tractor', len: run.length, v: run[0].v, cards: [].concat.apply([], run.map(function (p) { return p.cards; })) });
      } else {
        comps.push({ type: 'pair', len: 1, v: run[0].v, cards: run[0].cards });
      }
    });
    g.singles.forEach(function (s) { comps.push({ type: 'single', len: 0, v: s.v, cards: s.cards }); });
    return comps;
  }

  function shapeOf(cards, ctx) {
    var comps = decompose(cards, ctx);
    var tractors = comps.filter(function (c) { return c.type === 'tractor'; }).map(function (c) { return c.len; }).sort(function (a, b) { return b - a; });
    var pairs = comps.filter(function (c) { return c.type === 'pair'; }).length;
    var singles = comps.filter(function (c) { return c.type === 'single'; }).length;
    var totalPairs = pairs + tractors.reduce(function (a, b) { return a + b; }, 0);
    return { n: cards.length, tractors: tractors, pairs: pairs, singles: singles, totalPairs: totalPairs, components: comps.length };
  }

  function comboName(cards, ctx) {
    if (uniformSuit(cards, ctx) === null) return 'mixed'; // different suits never form a combination
    var s = shapeOf(cards, ctx);
    if (s.components > 1) return 'throw';
    if (s.tractors.length) return 'tractor';
    if (s.pairs) return 'pair';
    return 'single';
  }

  // Greedily consume tractors of the requested lengths from a pool of runs. Returns pairs matched + top values.
  function takeTractors(runs, lens) {
    var pool = runs.map(function (r) { return r.slice(); });
    var matched = 0, tops = [];
    lens.slice().sort(function (a, b) { return b - a; }).forEach(function (k) {
      // highest-topped run that is long enough
      var best = -1;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].length >= k && (best < 0 || pool[i][0].v > pool[best][0].v)) best = i;
      }
      if (best < 0) return;
      var run = pool[best];
      tops.push(run[0].v);
      matched += k;
      pool.splice(best, 1);
      if (run.length - k > 0) pool.push(run.slice(k));
    });
    var leftoverPairs = [].concat.apply([], pool);
    return { matched: matched, tops: tops, leftoverPairs: leftoverPairs };
  }

  /*
   * Exact shape match for winning a trick: can `cards` be arranged as the lead's
   * shape (same tractor lengths, same number of pairs)? Returns the primary value
   * (top of longest tractor, else highest pair, else highest single) or null.
   */
  function matchExact(cards, shape, ctx) {
    if (cards.length !== shape.n) return null;
    var g = groupCards(cards, ctx);
    var runs = buildRuns(g.pairs);
    var t = takeTractors(runs, shape.tractors);
    if (t.matched !== shape.tractors.reduce(function (a, b) { return a + b; }, 0)) return null;
    if (t.leftoverPairs.length < shape.pairs) return null;
    if (shape.tractors.length) return t.tops[0];
    if (shape.pairs) {
      var pv = t.leftoverPairs.map(function (p) { return p.v; });
      return Math.max.apply(null, pv);
    }
    return Math.max.apply(null, cards.map(function (c) { return value(c, ctx); }));
  }

  // How well does a card set satisfy the lead's structure obligations (for follow-suit rules).
  function structureScore(cards, shape, ctx) {
    var g = groupCards(cards, ctx);
    var runs = buildRuns(g.pairs);
    var t = takeTractors(runs, shape.tractors);
    var pairsAll = g.pairs.length;
    return { tractorPairs: t.matched, pairs: Math.min(pairsAll, shape.totalPairs) };
  }

  /* ---------- Leading ---------- */

  // A lead is legal if all cards share one effective suit.
  function isValidLeadForm(cards, ctx) { return cards.length > 0 && uniformSuit(cards, ctx) !== null; }

  // Can any opponent beat a component (same type, same effective suit)?
  function componentBeatable(comp, suit, otherHands, ctx) {
    for (var h = 0; h < otherHands.length; h++) {
      var cs = ofSuit(otherHands[h], suit, ctx);
      if (!cs.length) continue;
      if (comp.type === 'single') {
        for (var i = 0; i < cs.length; i++) if (value(cs[i], ctx) > comp.v) return true;
      } else {
        var g = groupCards(cs, ctx);
        if (comp.type === 'pair') {
          if (g.pairs.some(function (p) { return p.v > comp.v; })) return true;
        } else {
          var runs = buildRuns(g.pairs);
          if (runs.some(function (r) { return r.length >= comp.len && r[0].v > comp.v; })) return true;
        }
      }
    }
    return false;
  }

  /*
   * Multi-card lead (甩牌). If any component can be beaten by another player,
   * the leader must play only the smallest beatable component.
   * Returns { ok: true } or { ok: false, forced: [cards], failed: comp }.
   */
  function checkThrow(cards, otherHands, ctx) {
    var suit = uniformSuit(cards, ctx);
    var comps = decompose(cards, ctx);
    if (comps.length <= 1) return { ok: true };
    var failed = comps.filter(function (c) { return componentBeatable(c, suit, otherHands, ctx); });
    if (!failed.length) return { ok: true };
    failed.sort(function (a, b) { return a.v - b.v || a.cards.length - b.cards.length; });
    return { ok: false, forced: failed[0].cards, failed: failed[0] };
  }

  /* ---------- Following ---------- */

  /*
   * Validate a follow. Rules (打牌规则):
   *  - same number of cards as the lead
   *  - must play as many cards of the led suit as possible
   *  - pair led → must play pairs if held; tractor led → tractor if held, else pairs
   */
  function validateFollow(hand, leadCards, play, ctx) {
    if (play.length !== leadCards.length) return { ok: false, reason: 'count' };
    var ids = {}; hand.forEach(function (c) { ids[c.id] = true; });
    for (var i = 0; i < play.length; i++) if (!ids[play[i].id]) return { ok: false, reason: 'notInHand' };
    var suit = uniformSuit(leadCards, ctx);
    var shape = shapeOf(leadCards, ctx);
    var hS = ofSuit(hand, suit, ctx), pS = ofSuit(play, suit, ctx);
    var need = Math.min(shape.n, hS.length);
    if (pS.length !== need) return { ok: false, reason: 'suit' };
    if (need === 0) return { ok: true };
    var hs = structureScore(hS, shape, ctx), ps = structureScore(pS, shape, ctx);
    if (ps.tractorPairs < Math.min(hs.tractorPairs, Math.floor(need / 2))) return { ok: false, reason: 'tractor' };
    if (ps.pairs < Math.min(hs.pairs, Math.floor(need / 2))) return { ok: false, reason: 'pair' };
    return { ok: true };
  }

  /* ---------- Trick resolution ---------- */

  // plays: [{ seat, cards }], plays[0] is the lead. Returns index into plays of the winner.
  function trickWinner(plays, ctx) {
    var lead = plays[0].cards;
    var suit = uniformSuit(lead, ctx);
    var shape = shapeOf(lead, ctx);
    var isThrow = shape.components > 1;
    var best = { i: 0, tier: 0, v: matchExact(lead, shape, ctx) };
    for (var i = 1; i < plays.length; i++) {
      var cs = plays[i].cards, s = uniformSuit(cs, ctx);
      if (s === null) continue;
      if (s === suit) {
        if (isThrow || best.tier > 0) continue;
        var v = matchExact(cs, shape, ctx);
        if (v !== null && v > best.v) best = { i: i, tier: 0, v: v };
      } else if (s === 'T') {
        var tv = matchExact(cs, shape, ctx);
        if (tv === null) continue;
        if (best.tier === 0 || tv > best.v) best = { i: i, tier: 1, v: tv };
      }
    }
    return best.i;
  }

  /* ---------- Kitty & scoring ---------- */

  // 抠底: single ×2, pair ×4, tractor ×8, three-pair tractor ×16 …
  function kittyMultiplier(leadCards, ctx) {
    var comps = decompose(leadCards, ctx);
    var maxPairs = 0;
    comps.forEach(function (c) {
      var p = c.type === 'tractor' ? c.len : c.type === 'pair' ? 1 : 0;
      if (p > maxPairs) maxPairs = p;
    });
    return Math.pow(2, maxPairs + 1);
  }

  /*
   * 升级规则. Returns { declarersWin, steps } — steps = levels the winning side goes up.
   * Declarers: 0 → +3, 5–35 → +2, 40–75 → +1.
   * Defenders: 80–115 → take over (+0), 120–155 → +1, 160–195 → +2 … (original help file / standard rule)
   * Option takeoverUp (上台即升级): defenders get one extra level when they take over: 80 → +1, 120 → +2, 160 → +3 …
   */
  function handResult(defenderPoints, takeoverUp) {
    var p = defenderPoints;
    if (p <= 0) return { declarersWin: true, steps: 3 };
    if (p < 40) return { declarersWin: true, steps: 2 };
    if (p < 80) return { declarersWin: true, steps: 1 };
    return { declarersWin: false, steps: Math.floor((p - 80) / 40) + (takeoverUp ? 1 : 0) };
  }

  function mandatoryLevels(opts) {
    var m = {};
    if (opts.ajMust) { m[11] = true; m[14] = true; }
    if (opts.fiveTenK) { m[5] = true; m[10] = true; m[13] = true; }
    return m;
  }

  function startLevel(opts) { return opts.twoPerm ? 3 : 2; }

  // Advance a level by `steps`, stopping at mandatory levels (can't be skipped) and capping at A (14).
  // Highest level: 无主 after A when no-trump is allowed (打A后，若允许打无主，则必打), else A.
  function maxLevel(opts) { return opts.allowNoTrump === false ? 14 : NT_LEVEL; }

  // Advance a level by `steps`, stopping at mandatory levels (can't be skipped) and at the top level.
  function advanceLevel(level, steps, opts) {
    var m = mandatoryLevels(opts), top = maxLevel(opts);
    m[NT_LEVEL] = true; // the no-trump level must always be played
    for (var i = 0; i < steps; i++) {
      if (level >= top) break;
      level++;
      if (m[level]) break;
    }
    return level;
  }

  /*
   * 好牌模式: how good is a freshly dealt hand? Trump isn't known yet, so this values
   * what is strong whatever happens: jokers, level cards, aces, pairs, and one long
   * suit (a good trump suit to declare).
   */
  function handQuality(cards, level) {
    var s = 0, g = {}, len = { S: 0, H: 0, D: 0, C: 0 };
    cards.forEach(function (c) {
      var k = key(c); g[k] = (g[k] || 0) + 1;
      if (c.rank === BIG_JOKER) s += 5;
      else if (c.rank === SMALL_JOKER) s += 4;
      else if (c.rank === level) s += 3;
      else if (c.rank === 14) s += 1.5;
      else if (c.rank === 13) s += 0.7;
      if (c.suit !== 'J') len[c.suit]++;
    });
    Object.keys(g).forEach(function (k) { if (g[k] >= 2) s += 1.5; });
    s += 0.6 * Math.max(len.S, len.H, len.D, len.C);
    return s;
  }

  /* ---------- Declaring trump (亮牌) ---------- */

  function partnerOf(seat) { return (seat + 2) % 4; }
  function nextSeat(seat) { return (seat + 1) % 4; }
  function sameTeam(a, b) { return a % 2 === b % 2; }

  /*
   * Which declarations can `seat` make right now?
   * decl: null | { seat, suit, count, locked }
   * opts: { allowSelfOverride, allowPartnerProtect, allowNoTrump }
   * Returns [{ suit, count, kind, cards }]
   */
  function declareOptions(hand, seat, decl, level, opts) {
    var bySuit = { S: [], H: [], D: [], C: [] }, small = [], big = [];
    hand.forEach(function (c) {
      if (c.suit === 'J') (c.rank === BIG_JOKER ? big : small).push(c);
      else if (c.rank === level) bySuit[c.suit].push(c);
    });
    var out = [];
    if (opts.allowNoTrump && small.length === 2 && big.length === 2 && !(decl && decl.suit === NO_TRUMP)) {
      out.push({ suit: NO_TRUMP, count: 4, kind: 'noTrump', cards: small.concat(big) });
    }
    if (!decl) {
      SUITS.forEach(function (s) {
        if (bySuit[s].length >= 1) out.push({ suit: s, count: 1, kind: 'first', cards: bySuit[s].slice(0, 1) });
        if (bySuit[s].length >= 2) out.push({ suit: s, count: 2, kind: 'selfProtect', cards: bySuit[s].slice(0, 2) });
      });
      return out;
    }
    if (decl.locked) return out;
    var X = decl.suit;
    SUITS.forEach(function (s) {
      if (s === X) {
        if (seat === decl.seat && bySuit[s].length >= 2) out.push({ suit: s, count: 2, kind: 'selfProtect', cards: bySuit[s].slice(0, 2) });
        else if (seat === partnerOf(decl.seat) && opts.allowPartnerProtect && bySuit[s].length >= 1) {
          out.push({ suit: s, count: 2, kind: 'partnerProtect', cards: bySuit[s].slice(0, 1) });
        }
      } else if (bySuit[s].length >= 2) {
        if (seat === decl.seat) {
          if (opts.allowSelfOverride) out.push({ suit: s, count: 2, kind: 'selfOverride', cards: bySuit[s].slice(0, 2) });
        } else {
          out.push({ suit: s, count: 2, kind: 'override', cards: bySuit[s].slice(0, 2) });
        }
      }
    });
    return out;
  }

  function applyDeclare(decl, seat, option) {
    return {
      seat: option.kind === 'partnerProtect' ? decl.seat : seat,
      suit: option.suit,
      count: option.count,
      locked: option.count >= 2,
      kind: option.kind,
      by: seat
    };
  }

  // No declaration: 3rd kitty card's suit, skipping jokers (4th, 5th … 7th).
  function trumpFromKitty(kitty) {
    for (var i = 2; i < kitty.length; i++) if (kitty[i].suit !== 'J') return kitty[i].suit;
    return NO_TRUMP;
  }

  var api = {
    SUITS: SUITS, SMALL_JOKER: SMALL_JOKER, BIG_JOKER: BIG_JOKER, NO_TRUMP: NO_TRUMP,
    makeDeck: makeDeck, shuffle: shuffle, key: key, points: points, sumPoints: sumPoints,
    isTrump: isTrump, effSuit: effSuit, value: value, sortHand: sortHand, uniformSuit: uniformSuit, ofSuit: ofSuit,
    groupCards: groupCards, buildRuns: buildRuns, decompose: decompose, shapeOf: shapeOf, comboName: comboName,
    matchExact: matchExact, structureScore: structureScore,
    isValidLeadForm: isValidLeadForm, checkThrow: checkThrow, componentBeatable: componentBeatable,
    validateFollow: validateFollow, trickWinner: trickWinner,
    kittyMultiplier: kittyMultiplier, handResult: handResult, advanceLevel: advanceLevel,
    mandatoryLevels: mandatoryLevels, startLevel: startLevel, maxLevel: maxLevel, NT_LEVEL: NT_LEVEL,
    partnerOf: partnerOf, nextSeat: nextSeat, sameTeam: sameTeam,
    handQuality: handQuality, declareOptions: declareOptions, applyDeclare: applyDeclare, trumpFromKitty: trumpFromKitty
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TractorEngine = api;
})(typeof window !== 'undefined' ? window : this);
