// Run: node tests/luck.js [hands] — good-hand mode (好牌模式), measured through the real player seat
'use strict';
var E = require('../js/engine.js');
var P = require('./player.js');
var N = parseInt(process.argv[2] || '400', 10);
(async function () {
  for (var luck = 0; luck <= 2; luck++) {
    var jokers = 0, levelCards = 0, pairs = 0, won = 0;
    for (var i = 0; i < N; i++) {
      var g = P.playerGame({ luck: luck, skill: 2, declares: true });
      if (i % 2) { g.declarer = i % 4; g.levels = [6, 6]; g.handNo = 3; }
      var dealt = null, ev = g.hooks.event;
      g.hooks.event = function (type, d, game) { if (type === 'dealEnd') dealt = game.hands[0].slice(); return ev(type, d, game); };
      var s = await g.playHand();
      var grp = {};
      dealt.forEach(function (c) { if (c.suit === 'J') jokers++; else if (c.rank === g.level) levelCards++; grp[E.key(c)] = (grp[E.key(c)] || 0) + 1; });
      pairs += Object.keys(grp).filter(function (k) { return grp[k] >= 2; }).length;
      if (P.weWon(s)) won++;
    }
    var f = function (x) { return (x / N).toFixed(2); };
    console.log(['off   ', 'better', 'much  '][luck] + ' | your cards: jokers ' + f(jokers) + ', level cards ' + f(levelCards) + ', pairs ' + f(pairs) +
      ' | hands won ' + (100 * won / N).toFixed(1) + '%');
  }
})();
