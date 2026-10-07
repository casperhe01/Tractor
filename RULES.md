# Tractor (拖拉机大赛) — Rules Specification

Source: `Desktop/TRACTOR.HLP` (Windows Help, Simplified Chinese / GB2312), decompiled and translated.
Purpose: reference spec for rebuilding the game as a web app in `Web/`.

Examples in the original help file assume the current level is **10**. Below, "level card" means whichever rank is currently being played.

---

## 1. Overview

- **Game:** 拖拉机 ("Tractor"), also called 双抠 ("Shuang Kou"). A two-deck variant of 升级 (Shengji / "Upgrade").
- **Players:** 4, two fixed partnerships, partners sit opposite. Seats are labelled 东/南/西/北 (East/South/West/North); the human player is South.
- **Deck:** 2 × 54 = **108 cards** (two standard decks including jokers).
- **Deal:** 25 cards each, **8 cards to the kitty** (底牌). The declarer picks up the kitty and buries 8 cards (the UI refuses to bury until exactly 8 are selected).
- **Teams' roles per hand:** declarers (庄家) vs defenders (闲家). Defenders try to capture point cards.
- **Levels:** each team has a level, starting at 2. Winning raises your level.
- **Point cards** *(not stated in the help file; confirmed by the owner)*: 5 = 5, 10 = 10, K = 10. Total = **200 points** across both decks.

## 2. Card ranking (牌的大小顺序)

**Trumps (主牌)** = jokers + all cards of the level rank + all cards of the trump suit (+ all 2s if "2 is permanent trump" is on).
**Non-trumps (副牌)** = everything else.

### Default (2 is NOT permanent trump), level 10

| | High → Low |
|---|---|
| Trumps | Big Joker, Small Joker, trump-suit 10, other-suit 10s, A, K, Q, J, 9, 8, 7, 6, 5, 4, 3, 2 (of trump suit) |
| Non-trumps | A, K, Q, J, 9, 8, 7, 6, 5, 4, 3, 2 |

### Option: 2 is permanent trump (2为常主), level 10

| | High → Low |
|---|---|
| Trumps | Big Joker, Small Joker, trump-suit 10, other-suit 10s, trump-suit 2, other-suit 2s, A, K, Q, J, 9 … 3 (of trump suit) |
| Non-trumps | A, K, Q, J, 9 … 3 |

Notes:
- The level rank (and 2s, if permanent trump) is removed from its normal position in each suit.
- Off-suit level cards are equal to each other in rank (no suit ordering among them).

## 3. Combinations

- **Single** — one card.
- **Pair (对)** — two *identical* cards (same rank and same suit).
- **Tractor (拖拉机)** — two or more pairs that are *consecutive* in the current ranking and of the same suit / both trump.
  - Valid: `KKQQ`, `JJ99` (10 is removed, so J and 9 are adjacent), `554433`.
  - Valid trump tractors: Small Joker pair + trump-suit-10 pair; trump-suit-10 pair + off-suit-10 pair; off-suit-10 pair + trump-A pair; trump-10 pair + off-10 pair + trump-A pair.
  - `JJQQ` **is** a tractor (姊妹对 — adjacent pairs). The help file's listing of it as invalid is treated as a typo (confirmed by the project owner).
  - **Not** tractors: `554`, `544` (not two pairs), `5533` (gap), two pairs of off-suit 10s (equal rank, not consecutive), `JJ1010` (level card is trump, J is not), `AA22` (no wrap-around).
- **Three-pair tractor (三拖)** — three consecutive pairs.

## 4. Declaring trump (亮牌)

During the deal, the first player to reveal a level card sets that card's suit as trump. Then:

| Rule | Chinese | Trigger | Result | Configurable |
|---|---|---|---|---|
| Self-protect | 自保 | Same player reveals the second level card of their suit, or reveals a pair directly | Suit locked | No (always on) |
| Override | 反主 | Another player reveals a **pair** of level cards in a different suit | New suit becomes trump | No |
| Self-override | 自反 | Same player who showed a single reveals a pair of a different suit | New suit becomes trump | **Yes** |
| Partner protect | 对家保 | Partner reveals the second level card of the declared suit | Suit locked | **Yes** |
| No-trump override | 反无主 | A player reveals **all four jokers** | Hand is no-trump: only jokers, level cards (and 2s if permanent) are trump | **Yes** |

- Among override / self-override / partner protect, **whichever happens first wins**.
- **Nobody declares:** flip the kitty's 3rd card; its suit is trump. If it is a joker, try the 4th, 5th, 6th, 7th card until a non-joker appears.
- UI: a row of suit buttons (♣ ♦ ♥ ♠ 无主); a button lights up when the player is allowed to declare that suit.

## 5. Playing tricks (打牌)

- Equal cards: **the one played first wins**.
- A failed multi-card lead carries **no penalty** (confirmed by the owner).
- **Multi-card lead (甩牌):** leader may play several cards of one suit at once if each component is the highest outstanding (e.g. `AAK`, `AKK`, `AQQJJ`; `98844` only if nobody can beat the single 9, the pair 88, or the pair 44).
  - If any component can be beaten by another player, the lead fails and the leader must play **only the smallest beatable component**. Example: leading `98844` — if someone holds a J in that suit, leader must play just the 9; if someone holds `QQ` or `55`, leader must play just `44`.
- **Following:**
  - Must follow suit if possible (same number of cards as led).
  - Pair led → must play a pair of that suit if held (including a pair from inside a tractor).
  - Tractor led → must play a tractor if held; else pairs; else any cards of that suit.
- **Trumping (毙):** if out of the led non-trump suit, a player may play trumps.
  - If the lead contains tractors/pairs, the trumping cards must all be trump and contain **at least as many tractors and at least as many pairs** as the lead; otherwise they count as a discard (垫牌) and cannot win.
  - Multiple trumpers: compare by the highest tractor/pair structure; higher wins (盖毙 "over-trump").
  - Examples: trump `998872` can trump off-suit `AK5544` but not `AA5544`. Trump `977` can trump `544`, and `884` can over-trump it. Trump `977` can trump `567`, but `884` cannot over-trump it (lead had no pair, so compare by highest single).
- Winner of a trick leads the next.

## 6. Kitty bonus (抠底)

If the **defenders win the last trick**, the points in the kitty are added to their score, multiplied by the size of the winning lead:

| Last trick won with | Multiplier |
|---|---|
| Single | ×2 |
| Pair | ×4 |
| Tractor (2 pairs) | ×8 |
| Three-pair tractor | ×16 |
| … | doubles per extra pair |

## 7. Scoring and level change (升级)

Standard table, identical to the original help file (and to pagat.com's standard Tractor rules). Based on the defenders' total points:

| Defenders' points | Outcome |
|---|---|
| 0 (大光) | Declarers +3 levels |
| 5–35 (小光) | Declarers +2 levels |
| 40–75 | Declarers +1 level |
| 80–115 | Defenders take over (上台), no level change |
| 120–155 | Defenders take over, +1 level |
| 160–195 | Defenders take over, +2 levels |
| … | +1 level per further 40 points |

**Option 上台即升级 (Level up on taking over, off by default):** the defenders get one extra level whenever they take over: 80–115 → +1, 120–155 → +2, 160–195 → +3. Declarer results are unchanged.

- **Mandatory levels** cannot be skipped when jumping: level **2** (or **3** if "2 is permanent trump"), and **J** and **A** when "A, J must be played" is on, and **5, 10, K** when "5, 10, K must be played" is on. A jump stops at the mandatory level.
- After A, if no-trump is allowed, the no-trump level (无主) must also be played (打A后，若允许打无主，则必打). Level order: 2 … K, A, 无主. A is skippable unless "A, J must be played" is on; 无主 is never skippable.
- **No-trump level:** no trump suit, no level rank, no declaring. Only the jokers are trumps — the 2s are **not** trump at this level even when "2 is permanent trump" is on (owner-confirmed 2026-10-03); all suits rank A high … 2 low. The match is won by the team that wins a hand as declarers at the top level (无主, or A if no-trump is off).

## 8. Rotation of declarer (轮庄)

- **First hand:** the first player to declare trump becomes the declarer (help file: 开局中，双方争庄，先亮者为庄家).
- **Declarers win:** the declarer's **partner** declares the next hand.
- **Defenders win:** the player to the **next seat (下家)** after the previous declarer declares the next hand.

## 9. Configurable options (Options → Rules dialog)

| Option | Chinese | Default in screenshot |
|---|---|---|
| Allow self-override | 允许自反 | ✔ |
| Allow partner protect | 允许对家保 | ☐ |
| 2 is permanent trump | 2为常主 | ☐ |
| Allow no-trump override | 允许反无将 | ✔ |
| 5, 10, K must be played | 5，10，K必打 | ☐ |
| A, J must be played | A，J必打 | ✔ |

Other options in the original: AI difficulty for partner and opponents (3 levels), game speed (3), card face style (normal / art / football), card back (5 designs), music on/off, sound effects on/off.

## 10. Original UI / controls (for reference when porting)

- **Menus:** Game (New F2, Save, Load, Exit), Options (the 7 above), Help (Help F1, About).
- **Mouse:**
  - Left click a card — select / deselect it.
  - Left double-click — play that single card.
  - Right click — select / deselect all cards of the same suit (or trump group) to the left of the pointer.
  - Right double-click — play all those cards.
  - Click the hand icon — play the selected cards. Hand holding cards = you may play; empty hand = choose valid cards.
- **Score panels:** show seat letters (lit = declarer this hand), each team's level, current trump suit, and a circle marking the defending team.
- **Assets:** `TRACTOR.MID` (music), `GETUP.WAV`, `GETDOWN.WAV`, `UPGRADE.WAV`, `BEUPGR~1.WAV` (sound effects).

## 11. Strategy tips (from the help file — useful for AI)

- When burying the kitty, bury few or no points unless sure the defenders can't win the last trick.
- With the lead, play off-suit Aces and tractors first (they keep the lead).
- Lead a suit your partner is void in so they can trump and collect points.
- Declarer can bury an entire short suit to become void and trump it later.
- In no-trump, don't exhaust your big cards early; exploit long suits.
- When playing 10 or K, declare early so your trump-suit 10/K beats others' off-suit 10/K.
- When playing 10 or K, use the no-trump override when possible.
- If you infer the declarer buried points, aim to win the last trick.

## 12. Decisions made in the web version (Web/)

- Point cards 5/10/K (200 total) — confirmed by the owner.
- JJQQ (姊妹对) is a tractor — confirmed by the project owner.
- Scoring: standard / original help-file table (80 takes over only, 120 +1, 160 +2) by default; option 上台即升级 adds +1 on takeover.
- Score boards show the trump suit on the declaring team's panel and ○ on the defending team's, as in the original.
- First hand: the first player to declare becomes the declarer.
- No-trump level (无主) implemented after A (owner-reported bug, 2026-10-03): K + 2 with A optional goes to 无主. Match ends when a team wins as declarers at the top level.
- Save/Load stores levels + next declarer (start-of-hand), like the 6-byte GAME.SAV.
- Tricks continue until hands are empty (multi-card leads mean fewer than 25 tricks).

## 13. Confirmed by the owner (2026-10-03)

- Point cards: 5 = 5, 10 = 10, K = 10 (200 in total) — as implemented.
- First hand: the first player to declare becomes the declarer (the help file agrees: 开局中，双方争庄，先亮者为庄家).
- A failed multi-card lead (甩牌失败) carries no penalty.
- No-trump level (无主): only the jokers are trump; the 2s are not trump even with "2 is permanent trump". (The help file only says 打A后，若允许打无主，则必打; the no-trump *override* hand 反无主 keeps its own rule: jokers, level cards and permanent 2s are trump.)
- First hand: both teams start at level 2 (at 3 when "2 is permanent trump" is on, per the help file's 3必打（2为常主时）).

## 14. Open questions for the web version

- Format of `GAME.DAT` (200 bytes, likely settings) and `GAME.SAV` (6 bytes, likely team levels/declarer) — decode if save compatibility is wanted.
