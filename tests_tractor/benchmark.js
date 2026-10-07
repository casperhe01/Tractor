// Run: node tests/benchmark.js [hands]  — strength check: team S/N difficulty a vs E/W difficulty b
'use strict';
var Game = require('../js/game.js');
var N = parseInt(process.argv[2] || '300', 10);
(async function () {
  for (var pair of [[1, 1], [2, 1], [3, 1], [3, 2], [2, 3]]) {
    var swing = 0, defPtsSN = [], defPtsEW = [];
    for (var i = 0; i < N; i++) {
      var g = new Game({ humanSeat: null, difficulty: { partner: pair[0], opponents: pair[1] } }, {});
      g.seatDifficulty = function (s) { return s % 2 === 0 ? pair[0] : pair[1]; };
      g.declarer = i % 4; g.levels = [8, 8];
      var s = await g.playHand();
      var gain = s.levelsAfter[0] - s.levelsBefore[0] - (s.levelsAfter[1] - s.levelsBefore[1]);
      // a takeover with 0 levels is still a win for the defenders
      if (gain === 0) gain = (s.result.declarersWin ? 1 : -1) * (s.declarerTeam === 0 ? 1 : -1) * 0.5;
      swing += gain;
      (s.declarerTeam === 0 ? defPtsEW : defPtsSN).push(s.defenderPoints);
    }
    var avg = function (a) { return (a.reduce(function (x, y) { return x + y; }, 0) / a.length).toFixed(0); };
    console.log('S/N=' + pair[0] + ' vs E/W=' + pair[1] + ': net level swing per hand for S/N ' + (swing / N).toFixed(2) +
      ' | S/N defending pts ' + avg(defPtsSN) + ', E/W defending pts ' + avg(defPtsEW));
  }
})();
