// Shared helper: a game where seat 0 is a real "human" seat (exactly like the browser),
// played by a stand-in of a given strength who either declares trump or never does.
'use strict';
var E = require('../js/engine.js');
var AI = require('../js/ai.js');
var Game = require('../js/game.js');

function playerGame(opts) {
  var g = new Game({ humanSeat: 0, luck: opts.luck || 0, difficulty: opts.difficulty || { partner: 2, opponents: 2 }, rules: opts.rules }, null);
  if (g.luckSeat !== 0) throw new Error('good-hand mode is not targeting the player seat (luckSeat=' + g.luckSeat + ')');
  var d = opts.skill || 2;
  g.hooks = {
    askPlay: async function (game) { var v = game.viewFor(0, d); return game.trick.length ? AI.chooseFollow(v) : AI.chooseLead(v); },
    askBury: async function (game) { return AI.chooseBury(game.hands[0], game.ctx, d); },
    event: function (type, ev, game) {
      if (opts.declares && type === 'deal') {
        var o = game.humanDeclareOptions().filter(function (x) {
          return x.kind !== 'selfOverride' && !(x.kind === 'override' && game.decl && E.sameTeam(game.decl.seat, 0));
        }).sort(function (a, b) { return b.count - a.count; })[0];
        if (o) game.humanDeclare(o.suit);
      }
    }
  };
  return g;
}
function weWon(s) { return E.sameTeam(s.declarer, 0) === s.result.declarersWin; }
module.exports = { playerGame: playerGame, weWon: weWon };
