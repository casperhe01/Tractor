// Run: node tests/simulate.js [matches]
// Plays full computer-vs-computer matches and checks invariants on every play.
'use strict';
var E = require('../js/engine.js');
var Game = require('../js/game.js');

var matches = parseInt(process.argv[2] || '20', 10);
var errors = 0, hands = 0, tricks = 0, throws = 0, throwFails = 0, noTrump = 0, kittyBonus = 0;
var wins = [0, 0], diffWins = {};

function check(cond, msg) { if (!cond) { errors++; if (errors < 20) console.log('  ERROR: ' + msg); } }

async function runMatch(m) {
  var rulesVariants = [
    {},
    { twoPerm: true, allowPartnerProtect: true },
    { fiveTenK: true, allowSelfOverride: false, allowNoTrump: false },
    { ajMust: false }
  ];
  var rules = rulesVariants[m % rulesVariants.length];
  var diff = { partner: 1 + (m % 3), opponents: 1 + ((m + 1) % 3) };
  var g = new Game({ humanSeat: null, rules: rules, difficulty: diff }, {
    event: function (type, d, game) {
      if (type === 'play') {
        var t = game.trick;
        if (t.length > 1) {
          // re-validate the follow against the hand before it was played
          var hand = game.hands[d.seat].concat(d.cards);
          var v = E.validateFollow(hand, t[0].cards, d.cards, game.ctx);
          check(v.ok, 'illegal follow (' + v.reason + ') seat ' + d.seat);
        } else {
          check(E.isValidLeadForm(d.cards, game.ctx), 'mixed lead');
          if (E.shapeOf(d.cards, game.ctx).components > 1) throws++;
        }
      }
      if (type === 'throwFailed') throwFails++;
      if (type === 'trickEnd') tricks++;
      if (type === 'trumpSet' && d.trump === 'N') noTrump++;
      if (type === 'kitty' && d.bonus) kittyBonus++;
      if (type === 'buried') check(game.hands[d.seat].length === 25 && game.kitty.length === 8, 'bury size');
    }
  });
  var safety = 0;
  while (g.winner === null && safety++ < 200) {
    var s = await g.playHand();
    hands++;
    check(g.hands.every(function (h) { return h.length === 0; }), 'cards left in hand');
    check(g.played.length === 100, 'played count ' + g.played.length);
    check(s.defenderPoints >= 0 && s.defenderPoints <= 200 + E.sumPoints(g.kitty) * 64, 'points range');
    var all = g.played.concat(g.kitty).map(function (c) { return c.id; });
    check(new Set(all).size === 108, 'card conservation');
    check(g.levels.every(function (l) { return l >= 2 && l <= E.maxLevel(g.rules); }), 'level range');
  }
  check(g.winner !== null, 'match did not finish');
  if (g.winner !== null) {
    wins[g.winner]++;
    var k = 'S/N=' + diff.partner + ' vs E/W=' + diff.opponents;
    diffWins[k] = diffWins[k] || [0, 0];
    diffWins[k][g.winner]++;
  }
}

(async function () {
  var t0 = Date.now();
  for (var m = 0; m < matches; m++) await runMatch(m);
  console.log('matches: ' + matches + ', hands: ' + hands + ', tricks: ' + tricks + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  console.log('multi-card leads: ' + throws + ', failed throws: ' + throwFails + ', no-trump hands: ' + noTrump + ', kitty bonuses: ' + kittyBonus);
  console.log('match wins S/N vs E/W: ' + wins.join(' / '));
  console.log('by difficulty:', JSON.stringify(diffWins));
  console.log(errors ? errors + ' ERRORS' : 'all invariants held');
  process.exit(errors ? 1 : 0);
})();
