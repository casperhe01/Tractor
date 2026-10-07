# Tractor (拖拉机大赛) — web version

A browser rebuild of the 1998 Windows game in `../Desktop` (TRACTOR.EXE), following the rules in its help file (`../Desktop/TRACTOR.HLP`, summarised in `RULES.md`).

## Run it

Double-click **`index.html`**. It runs in any modern browser with no install, no server and no internet. To put it online, copy the whole `Web` folder to any static web host.

## What's in it

- The full rules from the help file: card ranking, pairs and tractors, trump declaring (self-protect, override, self-override, partner protect, no-trump with four jokers), multi-card leads (甩牌), trumping and over-trumping (毙 / 盖毙), the kitty multiplier (抠底), level-up table, mandatory levels and declarer rotation.
- The six rule switches from the original Options → Rules dialog, plus one extra (上台即升级 / level up on taking over).
- Three computer difficulty levels, set separately for your partner and the opponents (as in the original). Hard players remember played cards and known voids.
- Mouse controls: click selects a card, or press and drag across several cards to select them all. The Play button appears just above the cards you picked; right-click anywhere on the table also plays them. Shift+click picks up all cards of that suit up to the pointer, double-click plays a single card. Also F1 (rules), F2 (new game), Enter (play) and Esc (clear selection).
- Start and end screens: the page opens on a start screen and waits for **Start game** (Enter also works; Options and Rules can be set first). The game ends when a team wins a hand as declarers at the top level (no-trump, or A if no-trump is off): a win shows a congratulations screen, a loss a defeat screen, each with final levels and a **Play again** button that starts a new game at once.
- English / 中文 toggle. The Chinese rules page keeps the original help text.
- Large SVG suit symbols and a four-colour deck (♠ black, ♥ red, ♣ green, ♦ blue) so no two suits look alike; switch back to the classic two colours in Options → Cards. On narrow screens the hand wraps into two rows so every card stays readable.
- The original sound effects and music (TRACTOR.MID rendered to MP3), game speed, five card backs, save/load, a Hint button and a Last-trick view.
- Works on phones (tap to select, Play button).

## How to declare trump (亮主)

While the cards are dealt, the suit buttons ♣ ♦ ♥ ♠ NT sit at the bottom left. When you receive a card of the current level (for example a 2 when playing 2s), the matching button lights up and pulses. The deal also pauses briefly and the message bar tells you which button to click.

- **One level card** declares that suit, if nobody has declared yet.
- **A second card of the same suit** locks it (自保).
- **A pair in another suit** overrides someone else's declaration (反主).
- **All four jokers** make the hand no-trump (NT), if that rule is on.

**Auto-declare (自动亮主):** tick it in Options → Declaring trump and the game declares for you as soon as you can. It picks your strongest suit, locks it when you get a pair, and overrides the opponents with a pair. It never overrides your partner.

After the deal there's one last chance, and you get it before the computer players. A greyed-out button means the rules don't allow that declaration right now. For example, a single level card can't override an existing declaration; you need a pair.

## Good-hand mode (好牌模式) and must-win mode (必胜模式)

Options → 好牌模式 makes the deal deliberately not random, in your favour. While it's on, the hand number shows a badge. It takes effect from the next deal.

- **稍好 / 很好:** each hand the game shuffles 4 or 20 decks, scores your 25 cards (jokers, level cards, aces, pairs, one long suit) and deals you the strongest. The other three players, your partner included, get weaker cards on average.
- **必胜模式 (must-win):** your partner automatically plays Hard and the opponents Easy. Before each deal (about half a second) the game tries dozens of candidate deals and secretly plays each one out many times, with a stand-in for you who is either normal or weak and either declares trump or doesn't. It deals the candidate your team wins most consistently in all of those cases. Nobody cheats during play; only the deal is chosen. It is nearly certain, not guaranteed: a strict guarantee is impossible, because no deal can protect against very poor play.

Measured through the real player seat (`node tests/luck.js`, `node tests/mustwin.js`):

| Setting | Your hands won |
|---|---|
| 关闭 (off, pure random) | 52% |
| 稍好 | 60% |
| 很好 | 68% |
| 必胜模式, normal player | 99–100% |
| 必胜模式, weak player | 94–98% |

## Files

| Path | Purpose |
|---|---|
| `index.html`, `css/style.css` | Page and table layout |
| `js/engine.js` | Rules engine: pure functions, no DOM |
| `js/ai.js` | Computer players |
| `js/game.js` | Game flow: deal, declare, kitty, tricks, scoring |
| `js/ui.js`, `js/i18n.js` | Browser UI and EN/中文 strings |
| `assets/sounds/` | Original WAVs + `music.mp3` (rendered from TRACTOR.MID) |
| `tests/` | Node tests (see below) |
| `RULES.md` | Rules spec from the help file |

## Tests

Requires Node.js, used only for the tests (the game itself doesn't need it).

```
node tests/engine.test.js     # 48 rule tests built from the help file's own examples
node tests/simulate.js 24     # full computer-vs-computer matches; checks every play is legal
node tests/benchmark.js 300   # checks Hard > Medium > Easy
node tests/luck.js 300        # measures good-hand mode through the real player seat
node tests/mustwin.js 160     # measures must-win mode for normal and weak players
```

## Notes and decisions

- **Optional sound:** `BEUPGR~1.WAV` couldn't be copied automatically because of the `~` in its name. To use it, copy it into `assets/sounds/` and rename it `beupgrade.wav`; until then the game plays `getdown.wav` in its place.
- **Point cards** are 5 = 5, 10 = 10, K = 10 (the help file doesn't list them, but its 80/120/160 thresholds assume a 200-point total).
- **JJQQ (姊妹对)** is a tractor. The help file lists it as "not a tractor", which is a typo.
- **Scoring:** the standard table, the same as the original help file: defenders 80–115 take over with no level change, 120–155 take over +1, 160–195 take over +2. Declarers go up 1 level for 40–75, 2 for 5–35 and 3 for 0. Tick **上台即升级** (Options → Rules, off by default) to give the defenders one extra level when they take over: 80 → +1, 120 → +2, 160 → +3.
- **Score boards:** like the original panel, the declaring team's board shows the trump suit next to its level and the defending team's board shows ○.
- **First hand:** the first player to declare trump becomes the declarer (先亮者为庄家).
- **Levels and winning:** 2 … K, A, then the **no-trump level (无主)** when "Allow no-trump override" is on (打A后，若允许打无主，则必打). A can be skipped unless "J and A cannot be skipped" is on; the no-trump level can never be skipped. At the no-trump level there is no trump suit and no declaring; only the jokers are trumps (2s are not trump here, even with "2 is permanent trump"). The first team to win a hand as declarers at the top level (no-trump, or A when no-trump is off) wins the match.
- **Save/Load** stores the match position at the start of the current hand (levels and declarer), like the original's 6-byte `GAME.SAV`. It uses this browser's local storage.
- **Card face styles** (普通 / 艺术 / 足球) from the original aren't reproduced; cards are drawn in CSS.
