// Run: node tests/engine.test.js
// Test cases are the worked examples from the original TRACTOR.HLP (level 10).
'use strict';
var E = require('../js/engine.js');
var assert = require('assert');

var nextId = 1000;
var R = { J: 11, Q: 12, K: 13, A: 14 };
// 'S10' 'HA' 'C2' 'SJ'(small joker 'jk') 'BJ'(big joker)
function c(s) {
  if (s === 'jk') return { id: nextId++, suit: 'J', rank: 15 };
  if (s === 'JK') return { id: nextId++, suit: 'J', rank: 16 };
  var suit = s[0], r = s.slice(1);
  return { id: nextId++, suit: suit, rank: R[r] || parseInt(r, 10) };
}
function cs(str) { return str.split(' ').map(c); }

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

var ctx = { level: 10, trump: 'H', twoPerm: false };
var ctx2 = { level: 10, trump: 'H', twoPerm: true };
var V = function (s, x) { return E.value(c(s), x || ctx); };

console.log('Card ranking (牌的大小顺序)');
test('trump order: BJ > jk > H10 > S10 > HA > HK > ... > H2', function () {
  var order = ['JK', 'jk', 'H10', 'S10', 'HA', 'HK', 'HQ', 'HJ', 'H9', 'H8', 'H2'];
  for (var i = 0; i < order.length - 1; i++) assert(V(order[i]) > V(order[i + 1]), order[i] + ' > ' + order[i + 1]);
});
test('off-suit 10s are equal', function () { assert.strictEqual(V('S10'), V('D10')); });
test('off-suit 10s are trump', function () { assert(E.isTrump(c('C10'), ctx)); });
test('2 permanent: H10 > S10 > H2 > S2 > HA', function () {
  var order = ['JK', 'jk', 'H10', 'S10', 'H2', 'S2', 'HA', 'HK', 'H3'];
  for (var i = 0; i < order.length - 1; i++) assert(V(order[i], ctx2) > V(order[i + 1], ctx2), order[i] + ' > ' + order[i + 1]);
  assert(E.isTrump(c('C2'), ctx2));
});
test('non-trump order A > K > Q > J > 9 (10 removed)', function () {
  assert(V('SA') > V('SK') && V('SJ') - V('S9') === 1);
});

console.log('Tractors (拖拉机的构成)');
function isTractor(str, x) { return E.comboName(cs(str), x || ctx) === 'tractor'; }
['SK SK SQ SQ', 'SJ SJ S9 S9', 'S5 S5 S4 S4 S3 S3', 'jk jk H10 H10', 'H10 H10 S10 S10', 'S10 S10 HA HA', 'H10 H10 S10 S10 HA HA']
  .forEach(function (t) { test('is tractor: ' + t, function () { assert(isTractor(t), E.comboName(cs(t), ctx)); }); });
['S5 S5 S4', 'S5 S4 S4', 'S5 S5 S3 S3', 'S10 S10 D10 D10', 'SJ SJ S10 S10', 'SA SA S2 S2', 'SJ SJ DQ DQ']
  .forEach(function (t) { test('not tractor: ' + t, function () { assert(!isTractor(t), E.comboName(cs(t), ctx)); }); });

console.log('Declaring (亮牌规则)');
var dOpts = { allowSelfOverride: true, allowPartnerProtect: true, allowNoTrump: true };
test('first single 10 declares', function () {
  var o = E.declareOptions(cs('S10 H3'), 0, null, 10, dOpts);
  assert(o.some(function (x) { return x.suit === 'S' && x.count === 1; }));
});
test('override needs a pair of a different suit', function () {
  var decl = { seat: 0, suit: 'S', count: 1, locked: false };
  assert(!E.declareOptions(cs('H10'), 1, decl, 10, dOpts).length);
  assert(E.declareOptions(cs('H10 H10'), 1, decl, 10, dOpts).some(function (x) { return x.kind === 'override'; }));
});
test('self-protect locks', function () {
  var decl = { seat: 0, suit: 'S', count: 1, locked: false };
  var o = E.declareOptions(cs('S10 S10'), 0, decl, 10, dOpts);
  assert(o.some(function (x) { return x.kind === 'selfProtect'; }));
});
test('partner protect only when allowed', function () {
  var decl = { seat: 0, suit: 'S', count: 1, locked: false };
  assert(E.declareOptions(cs('S10'), 2, decl, 10, dOpts).some(function (x) { return x.kind === 'partnerProtect'; }));
  assert(!E.declareOptions(cs('S10'), 2, decl, 10, { allowPartnerProtect: false }).length);
});
test('self-override only when allowed', function () {
  var decl = { seat: 0, suit: 'S', count: 1, locked: false };
  assert(E.declareOptions(cs('H10 H10'), 0, decl, 10, dOpts).some(function (x) { return x.kind === 'selfOverride'; }));
  assert(!E.declareOptions(cs('H10 H10'), 0, decl, 10, { allowSelfOverride: false }).length);
});
test('four jokers → no-trump, even over a locked suit', function () {
  var decl = { seat: 0, suit: 'S', count: 2, locked: true };
  assert(E.declareOptions(cs('jk jk JK JK'), 1, decl, 10, dOpts).some(function (x) { return x.suit === 'N'; }));
});
test('no declaration: kitty 3rd card, skipping jokers', function () {
  assert.strictEqual(E.trumpFromKitty(cs('S3 S4 D5 C6 C7 C8 C9 S2')), 'D');
  assert.strictEqual(E.trumpFromKitty(cs('S3 S4 jk JK C7 C8 C9 S2')), 'C');
});

console.log('Multi-card leads (甩牌)');
test('98844 with an opponent holding J → must play the 9', function () {
  var r = E.checkThrow(cs('S9 S8 S8 S4 S4'), [cs('SJ D3'), cs('D4'), cs('C5')], ctx);
  assert(!r.ok && r.forced.length === 1 && r.forced[0].rank === 9);
});
test('98844 with an opponent holding QQ → must play 44', function () {
  var r = E.checkThrow(cs('S9 S8 S8 S4 S4'), [cs('SQ SQ'), cs('D4'), cs('C5')], ctx);
  assert(!r.ok && r.forced.length === 2 && r.forced[0].rank === 4);
});
test('98844 with an opponent holding 55 → must play 44', function () {
  var r = E.checkThrow(cs('S9 S8 S8 S4 S4'), [cs('S5 S5'), cs('D4'), cs('C5')], ctx);
  assert(!r.ok && r.forced[0].rank === 4);
});
test('AAK unbeatable → allowed', function () {
  assert(E.checkThrow(cs('SA SA SK'), [cs('SQ SK'), cs('S3'), cs('C5')], ctx).ok);
});

console.log('Following (打牌规则)');
test('pair led: must play a pair if held', function () {
  var hand = cs('S3 S3 S7 D2');
  assert(!E.validateFollow(hand, cs('SA SA'), [hand[0], hand[2]], ctx).ok);
  assert(E.validateFollow(hand, cs('SA SA'), [hand[0], hand[1]], ctx).ok);
});
test('pair inside a tractor counts', function () {
  var hand = cs('S3 S3 S4 S4 S9');
  assert(!E.validateFollow(hand, cs('SA SA'), [hand[0], hand[4]], ctx).ok);
});
test('tractor led: tractor if held, else pairs', function () {
  var hand = cs('S3 S3 S4 S4 S9 S9 S7');
  var lead = cs('SA SA SK SK');
  assert(!E.validateFollow(hand, lead, [hand[0], hand[1], hand[4], hand[5]], ctx).ok, 'must use tractor');
  assert(E.validateFollow(hand, lead, hand.slice(0, 4), ctx).ok);
  var hand2 = cs('S3 S3 S9 S9 S7 D2');
  assert(E.validateFollow(hand2, lead, hand2.slice(0, 4), ctx).ok);
  assert(!E.validateFollow(hand2, lead, [hand2[0], hand2[1], hand2[4], hand2[5]], ctx).ok);
});
test('must follow suit with all remaining cards of the suit', function () {
  var hand = cs('S3 D4 D5');
  assert(!E.validateFollow(hand, cs('SA SA'), [hand[1], hand[2]], ctx).ok);
  assert(E.validateFollow(hand, cs('SA SA'), [hand[0], hand[1]], ctx).ok);
});

console.log('Trumping (毙 / 盖毙)');
function win(lead, plays) {
  var all = [{ seat: 0, cards: cs(lead) }].concat(plays.map(function (p, i) { return { seat: i + 1, cards: cs(p) }; }));
  return E.trickWinner(all, ctx);
}
test('trump 998872 beats off-suit AK5544', function () {
  assert.strictEqual(win('SA SK S5 S5 S4 S4', ['H9 H9 H8 H8 H7 H2']), 1);
});
test('trump 998872 cannot beat AA5544', function () {
  assert.strictEqual(win('SA SA S5 S5 S4 S4', ['H9 H9 H8 H8 H7 H2']), 0);
});
test('977 trumps 544, 884 over-trumps', function () {
  assert.strictEqual(win('S5 S4 S4', ['H9 H7 H7', 'H8 H8 H4']), 2);
});
test('977 trumps 567, 884 cannot over-trump', function () {
  assert.strictEqual(win('S5 S6 S7', ['H9 H7 H7', 'H8 H8 H4']), 1);
});
test('equal cards: first played wins', function () {
  assert.strictEqual(win('SA', ['SA']), 0);
  assert.strictEqual(win('S3', ['S10', 'D10']), 1);
});
test('in-suit cannot beat a throw', function () {
  assert.strictEqual(win('SA SK', ['SA SA']), 0);
});

console.log('Kitty & scoring (抠底 / 升级)');
test('option 上台即升级: 80 → +1, 120 → +2, 160 → +3', function () {
  assert.deepStrictEqual(E.handResult(80, true), { declarersWin: false, steps: 1 });
  assert.deepStrictEqual(E.handResult(115, true), { declarersWin: false, steps: 1 });
  assert.deepStrictEqual(E.handResult(120, true), { declarersWin: false, steps: 2 });
  assert.deepStrictEqual(E.handResult(160, true), { declarersWin: false, steps: 3 });
  assert.deepStrictEqual(E.handResult(75, true), { declarersWin: true, steps: 1 });
  assert.deepStrictEqual(E.handResult(0, true), { declarersWin: true, steps: 3 });
});
test('no-trump level after A (打A后，若允许打无主，则必打)', function () {
  assert.strictEqual(E.advanceLevel(13, 2, { ajMust: false, allowNoTrump: true }), 15, 'K +2 skips A when A is not mandatory');
  assert.strictEqual(E.advanceLevel(13, 2, { ajMust: true, allowNoTrump: true }), 14, 'stops at A when A is mandatory');
  assert.strictEqual(E.advanceLevel(13, 3, { ajMust: false, allowNoTrump: true }), 15, 'never goes past no-trump');
  assert.strictEqual(E.advanceLevel(13, 2, { ajMust: false, allowNoTrump: false }), 14, 'A is the top level without no-trump');
  assert.strictEqual(E.advanceLevel(12, 5, { ajMust: false, allowNoTrump: true }), 15);
});
test('no-trump level: only jokers are trumps; joker pairs form a tractor', function () {
  var nt = { level: 15, trump: 'N', twoPerm: false };
  ['SA', 'H2', 'D10', 'CK'].forEach(function (s) { assert(!E.isTrump(c(s), nt), s + ' is not trump'); });
  assert(E.isTrump(c('jk'), nt) && E.isTrump(c('JK'), nt));
  assert.strictEqual(E.comboName(cs('jk jk JK JK'), nt), 'tractor');
  assert(E.value(c('SA'), nt) > E.value(c('SK'), nt));
  // owner-confirmed: at the no-trump level the 2s are NOT trump, even with "2 is permanent trump"
  var nt2 = { level: 15, trump: 'N', twoPerm: true };
  assert(!E.isTrump(c('S2'), nt2), '2 is not trump at the no-trump level');
  assert(E.value(c('S2'), nt2) < E.value(c('S3'), nt2), '2 is the lowest card of its suit');
  assert.strictEqual(E.comboName(cs('S3 S3 S2 S2'), nt2), 'tractor', '3322 is a plain tractor');
  assert(E.isTrump(c('S2'), { level: 14, trump: 'H', twoPerm: true }), 'still trump below the no-trump level');
});
test('kitty multipliers ×2 ×4 ×8 ×16', function () {
  assert.strictEqual(E.kittyMultiplier(cs('SA'), ctx), 2);
  assert.strictEqual(E.kittyMultiplier(cs('SA SA'), ctx), 4);
  assert.strictEqual(E.kittyMultiplier(cs('SA SA SK SK'), ctx), 8);
  assert.strictEqual(E.kittyMultiplier(cs('SA SA SK SK SQ SQ'), ctx), 16);
});
test('level table (standard / original help file)', function () {
  assert.deepStrictEqual(E.handResult(0), { declarersWin: true, steps: 3 });
  assert.deepStrictEqual(E.handResult(35), { declarersWin: true, steps: 2 });
  assert.deepStrictEqual(E.handResult(40), { declarersWin: true, steps: 1 });
  assert.deepStrictEqual(E.handResult(75), { declarersWin: true, steps: 1 });
  assert.deepStrictEqual(E.handResult(80), { declarersWin: false, steps: 0 });
  assert.deepStrictEqual(E.handResult(115), { declarersWin: false, steps: 0 });
  assert.deepStrictEqual(E.handResult(120), { declarersWin: false, steps: 1 });
  assert.deepStrictEqual(E.handResult(160), { declarersWin: false, steps: 2 });
  assert.deepStrictEqual(E.handResult(200), { declarersWin: false, steps: 3 });
});
test('JJQQ (姊妹对) is a tractor', function () {
  assert.strictEqual(E.comboName(cs('SJ SJ SQ SQ'), ctx), 'tractor');
});
test('mandatory J and A cannot be skipped', function () {
  assert.strictEqual(E.advanceLevel(9, 3, { ajMust: true }), 11);
  assert.strictEqual(E.advanceLevel(13, 3, { ajMust: true }), 14);
  assert.strictEqual(E.advanceLevel(9, 3, { ajMust: false }), 12);
  assert.strictEqual(E.advanceLevel(4, 3, { fiveTenK: true }), 5);
});
test('deck has 108 cards, 200 points', function () {
  var d = E.makeDeck();
  assert.strictEqual(d.length, 108);
  assert.strictEqual(E.sumPoints(d), 200);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
