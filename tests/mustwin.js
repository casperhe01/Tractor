// Run: node tests/mustwin.js [hands] — must-win mode (必胜模式), measured through the real player seat
'use strict';
var P = require('./player.js');
var N = parseInt(process.argv[2] || '160', 10);
(async function () {
  var players = [
    { name: 'normal player, declares     ', skill: 2, declares: true },
    { name: 'normal player, never declares', skill: 2, declares: false },
    { name: 'weak player, declares       ', skill: 1, declares: true },
    { name: 'weak player, never declares ', skill: 1, declares: false }
  ];
  for (var pl of players) {
    var won = 0, ms = 0;
    for (var i = 0; i < N; i++) {
      var g = P.playerGame({ luck: 3, skill: pl.skill, declares: pl.declares });
      if (i % 2) { g.declarer = i % 4; g.levels = [6, 6]; g.handNo = 3; } // half first hands, half later hands
      var s = await g.playHand();
      if (P.weWon(s)) won++;
      ms += g.mustWinInfo.ms;
    }
    console.log('MUST-WIN | ' + pl.name + ' | hands won ' + (100 * won / N).toFixed(1) + '% | deal prep ' + (ms / N).toFixed(0) + ' ms');
  }
})();
