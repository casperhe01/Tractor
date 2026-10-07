/* Tractor — browser UI: table rendering, the original's mouse controls, dialogs, sound. */
(function () {
  'use strict';
  var E = window.TractorEngine, AI = window.TractorAI, Game = window.TractorGame, I18N = window.TractorI18N;
  var t = I18N.t;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  // Suit shapes as SVG (viewBox 0 0 100 100) — crisp and identical on every system, unlike font glyphs.
  var SUIT_PATH = {
    H: '<path d="M50 92C22 70 4 52 4 31 4 15 16 5 30 5c9 0 16 5 20 13C54 10 61 5 70 5c14 0 26 10 26 26 0 21-18 39-46 61z"/>',
    D: '<path d="M50 2 88 50 50 98 12 50z"/>',
    S: '<path d="M50 3C62 22 96 40 96 63c0 14-10 24-23 24-9 0-16-5-20-11 1 9 5 16 13 23H34c8-7 12-14 13-23-4 6-11 11-20 11C14 87 4 77 4 63 4 40 38 22 50 3z"/>',
    C: '<circle cx="50" cy="27" r="22"/><circle cx="25" cy="60" r="22"/><circle cx="75" cy="60" r="22"/><path d="M43 50h14c0 22 4 35 13 47H30c9-12 13-25 13-47z"/>'
  };
  function suitIcon(s) { return '<svg class="si" viewBox="0 0 100 100" aria-hidden="true">' + SUIT_PATH[s] + '</svg>'; }
  // Inline suit chip for messages and labels (white backing keeps every colour readable on the felt).
  function suitChip(s) { return '<span class="suit-chip suit-' + s + '">' + suitIcon(s) + '</span>'; }
  var RANK_TXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  var SPEED = {
    1: { deal: 160, declareWindow: 4500, declarePause: 2600, think: 750, play: 250, trickEnd: 1500 },
    2: { deal: 100, declareWindow: 3500, declarePause: 2000, think: 420, play: 120, trickEnd: 950 },
    3: { deal: 45, declareWindow: 2500, declarePause: 1400, think: 140, play: 40, trickEnd: 500 }
  };

  /* ---------- settings (per-browser convenience) ---------- */
  var DEFAULTS = { lang: 'en', rules: Object.assign({}, Game.DEFAULT_RULES), difficulty: { partner: 2, opponents: 2 }, speed: 2, back: 1, fourColor: true, autoDeclare: false, luck: 0, sound: true, music: false };
  var settings = load('tractor.settings', DEFAULTS);
  settings = Object.assign({}, DEFAULTS, settings, { rules: Object.assign({}, DEFAULTS.rules, settings.rules || {}), difficulty: Object.assign({}, DEFAULTS.difficulty, settings.difficulty || {}) });
  if (!localStorageHas('tractor.settings') && /^zh/i.test(navigator.language || '')) settings.lang = 'zh';

  function load(k, fallback) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : JSON.parse(JSON.stringify(fallback)); } catch (e) { return JSON.parse(JSON.stringify(fallback)); } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function localStorageHas(k) { try { return localStorage.getItem(k) !== null; } catch (e) { return false; } }
  function saveSettings() { store('tractor.settings', settings); }

  /* ---------- state ---------- */
  var game = null, pending = null, mode = null, selected = {}, turnSeat = null, timers = [], declareKey = '';
  var screen = { kind: 'start', data: null }; // start / win / lose overlay (null = hidden)

  /* ---------- i18n ---------- */
  function applyLang() {
    I18N.lang = settings.lang;
    document.documentElement.lang = settings.lang;
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.title = settings.lang === 'zh' ? '拖拉机大赛' : 'Tractor';
    renderAll();
    renderScreen();
  }

  /* ---------- sound ---------- */
  var sounds = {};
  ['upgrade', 'getup', 'getdown', 'beupgrade'].forEach(function (n) {
    var a = new Audio();
    a.preload = n === 'beupgrade' ? 'none' : 'auto'; // beupgrade.wav is optional (see README)
    a.src = 'assets/sounds/' + n + '.wav';
    sounds[n] = a;
  });
  function playSound(n) {
    if (!settings.sound) return;
    try {
      var a = sounds[n]; a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () { if (n === 'beupgrade') playSound('getdown'); });
    } catch (e) {}
  }
  var actx = null;
  function tick(freq) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain(), now = actx.currentTime;
      o.type = 'triangle'; o.frequency.value = freq || 520;
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      o.connect(g).connect(actx.destination); o.start(now); o.stop(now + 0.1);
    } catch (e) {}
  }
  function syncMusic() {
    var m = $('#music');
    $('#btnMusic').setAttribute('aria-pressed', settings.music ? 'true' : 'false');
    $('#btnSound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
    $('#btnSound').textContent = settings.sound ? '🔊' : '🔈';
    if (settings.music) { m.volume = 0.45; var p = m.play(); if (p && p.catch) p.catch(function () {}); }
    else m.pause();
  }

  /* ---------- rendering helpers ---------- */
  function seatName(s) { return t('seat' + s); }
  function suitLabel(suit) { return suit === 'N' ? t('noTrump') : suitChip(suit); }
  function suitText(suit) { return suit === 'N' ? t('noTrump') : suitChip(suit); }
  function rankText(r) { return r === E.NT_LEVEL ? t('noTrump') : (RANK_TXT[r] || String(r)); }
  function cardText(c) { return c.suit === 'J' ? (c.rank === 16 ? 'JOKER+' : 'joker') : suitChip(c.suit) + rankText(c.rank); }

  function cardEl(c, ctx) {
    var el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = c.id;
    if (c.suit === 'J') {
      el.classList.add('joker', c.rank === 16 ? 'big' : 'small');
      el.innerHTML = '<div class="idx">JOKER</div><div class="pip">' + (c.rank === 16 ? '★' : '☆') + '</div>';
      el.setAttribute('aria-label', c.rank === 16 ? 'Big joker' : 'Small joker');
    } else {
      el.classList.add('suit-' + c.suit);
      el.innerHTML = '<div class="idx"><span class="r">' + rankText(c.rank) + '</span><span class="s">' + suitIcon(c.suit) + '</span></div><div class="pip">' + suitIcon(c.suit) + '</div>';
      el.setAttribute('aria-label', rankText(c.rank) + ' ' + SUIT_SYM[c.suit]);
    }
    if (ctx && E.isTrump(c, ctx)) el.classList.add('trump');
    return el;
  }

  // Trump context for display while dealing (trump may not be fixed yet).
  function displayCtx() {
    if (!game || !game.ctx) return null;
    if (game.ctx.trump) return game.ctx;
    return { level: game.level, trump: game.decl ? game.decl.suit : 'none', twoPerm: game.rules.twoPerm };
  }

  // The declarer as soon as it is known: from the start of the deal in later hands (set by the last
  // result), or in the first hand from the moment someone declares (先亮者为庄家).
  function knownDeclarer() {
    if (!game) return null;
    if (game.declarer !== null && game.declarer !== undefined) return game.declarer;
    if (game.phase === 'deal' && game.firstDeclarer !== null && game.firstDeclarer !== undefined) return game.firstDeclarer;
    return null;
  }

  function renderBoards() {
    var lv = game ? game.levels : [E.startLevel(settings.rules), E.startLevel(settings.rules)];
    $('#levelUs').textContent = rankText(lv[0]);
    $('#levelThem').textContent = rankText(lv[1]);
    var d = knownDeclarer();
    // like the original panel: the declaring team shows the trump suit, the defending team a circle (○)
    var trump = game && game.ctx && game.ctx.trump ? game.ctx.trump : (game && game.decl ? game.decl.suit : null);
    var declTeam = d !== null ? d % 2 : null;
    [['#suitUs', 0], ['#suitThem', 1]].forEach(function (x) {
      var el = $(x[0]); el.className = 'lv-suit'; el.textContent = ''; el.removeAttribute('title');
      if (declTeam === null) return;
      if (x[1] === declTeam) {
        if (!trump) { el.textContent = '?'; return; }
        if (trump === 'N') { if (game.level === E.NT_LEVEL) return; el.textContent = t('noTrump'); el.classList.add('nt'); }
        else { el.innerHTML = suitIcon(trump); el.classList.add('suit-' + trump); }
        el.title = t('trump');
      } else { el.textContent = '○'; el.classList.add('def'); el.title = t('boardDefending'); }
    });
    $$('[data-seat-tag]').forEach(function (b) {
      var s = +b.getAttribute('data-seat-tag');
      b.textContent = settings.lang === 'zh' ? ['南', '东', '北', '西'][s] : ['S', 'E', 'N', 'W'][s];
      b.classList.toggle('lit', d === s);
    });
    var ru = $('#roleUs'), rt = $('#roleThem');
    ru.className = 'role'; rt.className = 'role'; ru.textContent = ''; rt.textContent = '';
    if (d !== null && d !== undefined) {
      var us = d % 2 === 0;
      ru.textContent = us ? t('declaring') : t('defending'); ru.classList.toggle('declaring', us);
      rt.textContent = us ? t('defending') : t('declaring'); rt.classList.toggle('declaring', !us);
    }
  }

  function renderStatus() {
    var tv = $('#trumpVal'), pv = $('#pointsVal'), hn = $('#handNo'), pc = $('#pointCards');
    if (!game) { tv.textContent = t('notSet'); pv.textContent = '0'; hn.textContent = ''; pc.innerHTML = ''; return; }
    var lvl = rankText(game.level);
    var suit = game.ctx && game.ctx.trump ? game.ctx.trump : (game.decl ? game.decl.suit : null);
    tv.innerHTML = game.level === E.NT_LEVEL ? lvl : (suit ? suitLabel(suit) : '?') + ' ' + lvl;
    pv.textContent = game.defenderPoints || 0;
    hn.innerHTML = t('handNo', { n: game.handNo }) + (game.luckUsed ? '<span class="luck-badge" title="' + t('optLuck') + '">' + t('luckBadge' + game.luck) + '</span>' : '');
    pc.innerHTML = '';
    if (game.phase === 'play' || game.phase === 'handEnd') {
      var defTeam = 1 - (game.declarer % 2);
      (game.pointCards[defTeam] || []).slice().sort(function (a, b) { return a.rank - b.rank; }).forEach(function (c) {
        var s = document.createElement('span');
        s.className = 'pc suit-' + c.suit;
        s.innerHTML = suitIcon(c.suit) + rankText(c.rank);
        pc.appendChild(s);
      });
    }
  }

  function renderSeats() {
    [1, 2, 3].forEach(function (s) {
      var root = $('#seat' + s);
      var n = game ? game.hands[s].length : 0;
      var isDecl = game && knownDeclarer() === s;
      root.querySelector('.seat-name').innerHTML = t('seatLong' + s) + (isDecl ? ' <span class="crown" title="' + t('declarer') + '">👑</span>' : '') +
        (game ? ' · <span class="count-badge">' + n + '</span>' : '');
      var backs = root.querySelector('.backs');
      var want = Math.min(n, s === 2 ? 25 : 13);
      if (backs.children.length !== want) {
        backs.innerHTML = '';
        for (var i = 0; i < want; i++) { var b = document.createElement('div'); b.className = 'back'; backs.appendChild(b); }
      }
      root.classList.toggle('turn', turnSeat === s);
      root.classList.toggle('is-decl', !!isDecl);
    });
    $('#seat0').classList.toggle('turn', turnSeat === 0);
  }

  function renderDeclBadges() {
    [0, 1, 2, 3].forEach(function (s) {
      var box = s === 0 ? $('#myDecl') : $('#seat' + s + ' .seat-decl');
      box.innerHTML = '';
      if (!game || game.phase !== 'deal' || !game.declHistory) return;
      var last = null;
      game.declHistory.forEach(function (h) { if (h.seat === s) last = h; });
      if (last) last.cards.forEach(function (c) { box.appendChild(cardEl(c, null)); });
    });
  }

  function renderDeclareBar() {
    var opts = game && game.phase === 'deal' ? game.humanDeclareOptions() : [];
    var can = {}; opts.forEach(function (o) { can[o.suit] = true; });
    $$('#declareBar .suit-btn').forEach(function (b) {
      var on = !!can[b.dataset.suit];
      b.classList.toggle('on', on); b.disabled = !on;
    });
    $('#declareBar').style.visibility = game && game.phase === 'deal' ? 'visible' : 'hidden';
  }

  function renderHand() {
    var box = $('#hand');
    box.innerHTML = '';
    if (!game) return;
    var ctx = displayCtx();
    var cards = E.sortHand(game.hands[0], ctx || { level: game.level, trump: 'none', twoPerm: game.rules.twoPerm });
    cards.forEach(function (c) {
      var el = cardEl(c, ctx);
      if (selected[c.id]) el.classList.add('sel');
      box.appendChild(el);
    });
    // place freshly built cards without animating them in from the bottom (that made the top row bounce)
    box.classList.add('no-anim');
    layoutHand();
    void box.offsetWidth;
    box.classList.remove('no-anim');
  }

  function layoutHand() {
    var box = $('#hand'), els = Array.prototype.slice.call(box.children), n = els.length;
    if (!n) { box.style.height = ''; return; }
    var cw = els[0].offsetWidth, ch = els[0].offsetHeight, W = box.clientWidth;
    var ctx = displayCtx() || { level: game.level, trump: 'none', twoPerm: game.rules.twoPerm };
    var cards = els.map(function (el) { return cardById(+el.dataset.id); });
    var suitOf = function (k) { return E.effSuit(cards[k], ctx); };
    // one row if every card keeps its rank + suit index visible; otherwise two rows (narrow screens).
    // While dealing, plan for the full 25-card hand so the layout never switches mid-deal; the bottom
    // row fills first (up to half the hand) and extra cards go to the top row, so rows only grow.
    var N = game && game.phase === 'deal' ? Math.max(n, 25) : n;
    var minStep = cw * 0.46;
    var rows = N > 8 && (W - cw) / (N - 1) < minStep ? 2 : 1;
    // portrait phones: always two rows, even as the hand shrinks (no switch back to one row)
    if (window.matchMedia('(max-width: 640px) and (orientation: portrait)').matches) rows = 2;
    var split = rows === 2 ? Math.max(0, n - Math.ceil(N / 2)) : n; // top row = cards [0, split)
    // burying the kitty in two rows: pull the rows fully apart so a raised (selected) bottom card never
    // covers the top row; the trick area is empty then, so the table gives it the room
    // two rows on a tall portrait screen: always keep the rows fully apart (the table has room to spare);
    // on short screens only while burying
    var spread = rows === 2 && (mode === 'bury' || window.innerHeight >= 660);
    box.classList.toggle('two-rows', rows === 2);
    box.classList.toggle('spread', spread);
    $('#table').classList.toggle('burying', mode === 'bury');
    var raise = 20;
    var lift = rows === 2 ? (spread ? ch + raise + 6 : Math.round(ch * 0.58)) : 0;
    // with the rows apart (outside burying, where the button docks in the action bar), leave headroom above
    // the top row so the Play bubble sits as far above a selected top-row card as it does for the bottom row
    var head = spread && mode !== 'bury' ? 46 : 0;
    box.style.height = rows === 2 ? (ch + lift + 22 + head) + 'px' : '';
    [[0, split, lift], [split, n, 0]].forEach(function (r) {
      var a = r[0], b = r[1], m = b - a;
      if (m <= 0) return;
      var groups = 0;
      for (var i = a + 1; i < b; i++) if (suitOf(i) !== suitOf(i - 1)) groups++;
      var gap = 10;
      var step = Math.min(cw * 0.55, (W - cw - groups * gap) / Math.max(1, m - 1));
      if (step < 8) { gap = 0; step = (W - cw) / Math.max(1, m - 1); }
      var total = cw + step * (m - 1) + groups * gap, x = Math.max(0, (W - total) / 2);
      for (var j = a; j < b; j++) {
        if (j > a && suitOf(j) !== suitOf(j - 1)) x += gap;
        els[j].style.left = x + 'px';
        els[j].style.bottom = (r[2] + (els[j].classList.contains('sel') ? raise : 0)) + 'px';
        els[j].style.zIndex = j + 1;
        x += step;
      }
    });
  }

  function renderTrick(newSeat) {
    $$('.slot').forEach(function (s) { s.innerHTML = ''; s.classList.remove('win'); });
    // an empty trick area may shrink on small screens (more room for messages / declared cards)
    $('#table').classList.toggle('trick-empty', !game || !game.trick || !game.trick.length);
    if (!game || !game.trick) return;
    var ctx = game.ctx && game.ctx.trump ? game.ctx : null;
    game.trick.forEach(function (p) {
      var slot = $('.slot-' + p.seat);
      p.cards.forEach(function (c) { var el = cardEl(c, ctx); if (p.seat === newSeat) el.classList.add('new'); slot.appendChild(el); });
    });
  }

  function renderAll() {
    renderBoards(); renderStatus(); renderSeats(); renderDeclBadges(); renderDeclareBar(); renderHand(); renderTrick(); renderButtons();
  }

  function renderButtons() {
    var btn = $('#btnPlay'), n = Object.keys(selected).length;
    $('#playLabel').textContent = mode === 'bury' ? t('bury') + (n && n !== 8 ? ' (' + n + '/8)' : '') : t('play');
    btn.disabled = !(mode && n && (mode !== 'bury' || n === 8));
    placePlayButton();
    $('#btnHint').disabled = !mode;
    $('#btnLast').disabled = !(game && game.lastTrick && game.phase === 'play');
  }

  // Floating Play button: shown just above the selected cards, centred on them.
  function placePlayButton() {
    var btn = $('#btnPlay'), player = $('#seat0');
    var sel = $$('#hand .card.sel');
    if (!mode || !sel.length) { btn.hidden = true; return; }
    btn.hidden = false;
    var bad = false;
    if (mode === 'play' && game) { try { bad = !game.checkPlay(0, selectedCards()).ok; } catch (e) { bad = false; } }
    btn.classList.toggle('bad', bad);
    var pr = player.getBoundingClientRect(), x0 = Infinity, x1 = -Infinity, top = Infinity;
    sel.forEach(function (el) {
      var r = el.getBoundingClientRect(), nx = el.nextElementSibling;
      // only the strip up to the next (overlapping) card is visible
      var right = nx ? Math.max(r.left + 16, Math.min(r.right, nx.getBoundingClientRect().left)) : r.right;
      x0 = Math.min(x0, r.left); x1 = Math.max(x1, right); top = Math.min(top, r.top);
    });
    // burying: the button sits in the action bar (left, where the declare buttons were), never over the cards
    btn.classList.toggle('docked', mode === 'bury');
    if (mode === 'bury') {
      var ar = $('#seat0 .actions').getBoundingClientRect();
      btn.style.left = '0px';
      // centred on the bar, but never lower than its bottom edge (raised cards start right below it)
      btn.style.top = (Math.min(ar.top + (ar.height - btn.offsetHeight) / 2, ar.bottom - btn.offsetHeight - 2) - pr.top) + 'px';
      return;
    }
    var bw = btn.offsetWidth, bh = btn.offsetHeight;
    var cx = (x0 + x1) / 2 - pr.left, left = Math.max(4, Math.min(pr.width - bw - 4, cx - bw / 2));
    var y = top - pr.top - bh - 12;
    // never cover the message or the Last trick / Hint buttons
    var msg = $('#message'), mr = msg.textContent ? msg.getBoundingClientRect() : null;
    var ab = $('#seat0 .action-buttons').getBoundingClientRect(), ar = $('#seat0 .actions').getBoundingClientRect();
    var hit = function (r) { var bl = pr.left + left, bt = pr.top + y; return r && r.width && bl < r.right && r.left < bl + bw && bt < r.bottom && r.top < bt + bh; };
    if (hit(mr) && window.matchMedia('(max-height: 500px) and (min-width: 560px)').matches) {
      // landscape phones: the message sits in the side column, so slide right of it
      left = Math.min(pr.width - bw - 4, mr.right - pr.left + 6);
    } else if (hit(mr) || hit(ab)) {
      // otherwise drop into the free left part of the action bar (below the message), left of Last trick / Hint
      y = ar.top - pr.top + (ar.height - bh) / 2;
      if (mr) y = Math.max(y, mr.bottom - pr.top + 2);
      left = Math.max(4, Math.min(left, ab.left - pr.left - bw - 8));
    }
    if (hit(ab)) left = Math.max(4, ab.left - pr.left - bw - 8);
    btn.style.left = left + 'px';
    btn.style.top = y + 'px';
  }

  function message(txt, isError, isYou) {
    var m = $('#message');
    m.innerHTML = txt || '';
    m.classList.toggle('error', !!isError);
    m.classList.toggle('you', !!isYou && !isError);
  }

  function cardById(id) {
    if (!game) return null;
    for (var s = 0; s < 4; s++) for (var i = 0; i < game.hands[s].length; i++) if (game.hands[s][i].id === id) return game.hands[s][i];
    return null;
  }

  /* ---------- human input ---------- */
  function clearSelection() { selected = {}; }
  function selectedCards() { return game.hands[0].filter(function (c) { return selected[c.id]; }); }

  function promptTurnMessage() {
    if (mode === 'bury') message(t('msgBury'), false, true);
    else if (mode === 'play') {
      if (!game.trick.length) message(t('msgYourLead'), false, true);
      else message(t('msgYourFollow', { n: game.trick[0].cards.length }), false, true);
    }
  }

  // Tell the player they can declare, naming the suit button(s) to click.
  /*
   * 自动亮主: choose a declaration for you, or null.
   *  - nobody has declared → declare your strongest suit (a pair if you have one, which locks it)
   *  - your own single → lock it (自保); partner's single → partner protect (对家保) if allowed
   *  - opponents' single → override with your strongest pair (反主)
   *  - four jokers → no-trump, unless your own team's suit already stands
   *  Never overrides your partner, and never switches your own suit (自反).
   */
  function autoDeclarePick(g) {
    var opts = g.humanDeclareOptions(), decl = g.decl;
    var ours = decl && E.sameTeam(decl.seat, 0);
    var strength = function (suit) {
      if (suit === 'N') return 0;
      var ctx = { level: g.level, trump: suit, twoPerm: g.rules.twoPerm };
      return g.hands[0].reduce(function (a, c) { return a + (E.isTrump(c, ctx) ? 1 : 0); }, 0);
    };
    var ok = opts.filter(function (o) {
      if (o.kind === 'selfOverride') return false;
      if (o.kind === 'override' && ours) return false;
      if (o.suit === 'N') return !ours;
      return true;
    });
    if (!ok.length) return null;
    var rank = { selfProtect: 3, partnerProtect: 3, noTrump: 2, override: 1, first: 0 };
    ok.sort(function (a, b) {
      return (rank[b.kind] - rank[a.kind]) || (b.count - a.count) || (strength(b.suit) - strength(a.suit));
    });
    return ok[0];
  }

  // Returns true if a declaration was made automatically for you.
  function tryAutoDeclare(g) {
    if (!settings.autoDeclare || g.phase !== 'deal') return false;
    var pick = autoDeclarePick(g);
    if (!pick) return false;
    var opt = g.humanDeclareOptions().filter(function (o) { return o.suit === pick.suit && o.kind === pick.kind; })[0];
    if (!opt) return false;
    g.applyDeclare(0, opt);
    message(t('msgAutoDeclared', { suit: suitText(pick.suit) }), false, true);
    renderAll();
    return true;
  }

  function promptDeclare(last) {
    var opts = game.humanDeclareOptions(), seen = {}, chips = [];
    opts.forEach(function (o) { if (!seen[o.suit]) { seen[o.suit] = 1; chips.push(suitText(o.suit)); } });
    message(t(last ? 'msgCanDeclareLast' : 'msgCanDeclare', { suits: chips.join(' ') }), false, true);
    renderDeclareBar();
  }

  function submit() {
    if (!pending || !game) return;
    var cards = selectedCards();
    if (mode === 'bury') {
      if (cards.length !== 8) { message(t('err_bury'), true); return; }
    } else {
      var r = game.checkPlay(0, cards);
      if (!r.ok) { message(t('err_' + r.reason), true); return; }
    }
    var p = pending; pending = null; mode = null; clearSelection(); layoutHand(); renderButtons();
    p(cards);
  }

  // Pointer selection: press a card to toggle it; keep the button down and slide across cards to
  // give them the same state (drag-select). Shift+click picks the whole suit up to the pointer.
  var drag = null;
  function cardAt(x, y) { var el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('#hand .card') : null; }
  function setSel(el, on) {
    var id = +el.dataset.id;
    if (on) selected[id] = true; else delete selected[id];
    el.classList.toggle('sel', on);
  }
  function afterSelChange() {
    layoutHand(); renderButtons();
    if ($('#message').classList.contains('error')) promptTurnMessage();
  }
  function onHandDown(e) {
    if (e.button !== 0) return;
    var el = e.target.closest('.card'); if (!el || !mode) return;
    if (e.shiftKey) { selectSuitTo(el); return; }
    var on = !selected[+el.dataset.id];
    drag = { on: on, seen: {} }; drag.seen[el.dataset.id] = 1;
    setSel(el, on); afterSelChange();
  }
  function onHandMove(e) {
    if (!drag) return;
    var el = cardAt(e.clientX, e.clientY);
    if (!el || drag.seen[el.dataset.id]) return;
    drag.seen[el.dataset.id] = 1;
    if (!!selected[+el.dataset.id] !== drag.on) { setSel(el, drag.on); afterSelChange(); }
  }
  function onHandUp() { drag = null; }
  function onHandDbl(e) {
    var el = e.target.closest('.card'); if (!el || mode !== 'play' || e.shiftKey) return;
    selected = {}; selected[+el.dataset.id] = true;
    renderHand(); renderButtons(); submit();
  }
  function selectSuitTo(el) {
    var id = +el.dataset.id, ctx = displayCtx();
    var els = Array.prototype.slice.call($('#hand').children);
    var suit = E.effSuit(cardById(id), ctx), group = [];
    for (var i = 0; i < els.length; i++) {
      var c = cardById(+els[i].dataset.id);
      if (E.effSuit(c, ctx) === suit) group.push(c.id);
      if (+els[i].dataset.id === id) break;
    }
    var on = !selected[id];
    group.forEach(function (x) { if (on) selected[x] = true; else delete selected[x]; });
    renderHand(); renderButtons();
  }
  // Right click anywhere on the table plays (or buries) the selected cards.
  function onTableContext(e) {
    if (document.querySelector('dialog[open]')) return;
    if (e.target.closest('.topbar, header')) return;
    e.preventDefault();
    if (!mode || !Object.keys(selected).length) return;
    submit();
  }

  function hint() {
    if (!game || !mode) return;
    var cards;
    if (mode === 'bury') cards = AI.chooseBury(game.hands[0], game.ctx, 3);
    else {
      var v = game.viewFor(0, 3);
      cards = game.trick.length ? AI.chooseFollow(v) : AI.chooseLead(v);
    }
    selected = {}; cards.forEach(function (c) { selected[c.id] = true; });
    renderHand(); renderButtons();
  }

  /* ---------- game hooks ---------- */
  function hooksFor(g) {
    return {
      delay: function (kind) {
        if (g.aborted) return null;
        var ms = SPEED[settings.speed][kind] || 0;
        // You just got a new way to declare: pause the deal so you have time to click (the computer waits too).
        if (kind === 'deal' && g.phase === 'deal') {
          var key = g.humanDeclareOptions().map(function (o) { return o.suit + o.count; }).join(',');
          if (key && key !== declareKey) {
            if (tryAutoDeclare(g)) key = g.humanDeclareOptions().map(function (o) { return o.suit + o.count; }).join(',');
            else { ms = SPEED[settings.speed].declarePause; promptDeclare(); }
          }
          declareKey = key;
        }
        if (kind === 'declareWindow' && g.humanDeclareOptions().length && !tryAutoDeclare(g) && g.humanDeclareOptions().length) promptDeclare(true);
        return new Promise(function (res) { var id = setTimeout(res, ms); timers.push({ id: id, res: res }); });
      },
      askPlay: function () {
        return new Promise(function (res) { pending = res; mode = 'play'; clearSelection(); renderAll(); promptTurnMessage(); });
      },
      askBury: function () {
        return new Promise(function (res) { pending = res; mode = 'bury'; clearSelection(); renderAll(); promptTurnMessage(); });
      },
      event: function (type, d) {
        if (g !== game) return;
        return onEvent(type, d);
      }
    };
  }

  function onEvent(type, d) {
    switch (type) {
      case 'preparing':
        message(t('msgPreparing'));
        return new Promise(function (res) { setTimeout(res, 30); }); // let the message paint first
      case 'handStart':
        turnSeat = null; declareKey = ''; message(t(game.ntLevel ? 'msgNtLevel' : 'msgDealing')); renderAll(); break;
      case 'deal':
        if (d.seat === 0) { renderHand(); renderDeclareBar(); }
        if (d.count % 4 === 0) renderSeats();
        break;
      case 'dealEnd':
        renderAll();
        if (game.ntLevel) { message(t('msgNtLevel')); break; }
        if (game.humanDeclareOptions().length && !tryAutoDeclare(game)) promptDeclare(true);
        else if (!game.decl || game.decl.by !== 0) message(t('msgDealEnd'));
        break;
      case 'declare': {
        var k = 'msgDeclareKind_' + d.option.kind;
        var txt = I18N.STR[I18N.lang][k] ? t(k, { seat: seatName(d.seat), suit: suitText(d.option.suit) }) : t('msgDeclare', { seat: seatName(d.seat), suit: suitText(d.option.suit) });
        message(txt); tick(760); renderAll(); break;
      }
      case 'trumpSet':
        message(d.fromKitty ? t('msgTrumpKitty', { suit: suitText(d.trump) }) + ' · ' + t('msgTrumpSet', { suit: suitText(d.trump), seat: seatName(d.declarer) })
          : t('msgTrumpSet', { suit: suitText(d.trump), seat: seatName(d.declarer) }));
        renderAll(); break;
      case 'kittyTaken':
        if (d.seat !== 0) message(t('msgBuryWait', { seat: seatName(d.seat) }));
        renderAll(); break;
      case 'buried':
        renderAll(); break;
      case 'turn':
        turnSeat = d.seat; renderSeats();
        if (d.seat !== 0 && game.phase === 'play') message(t('msgWaiting', { seat: seatName(d.seat) }));
        break;
      case 'play':
        tick(440 + d.seat * 40);
        if (d.trick.length === 1) $$('.slot').forEach(function (s) { s.innerHTML = ''; s.classList.remove('win'); });
        renderTrick(d.seat); renderSeats(); if (d.seat === 0) renderHand();
        break;
      case 'throwFailed':
        message(t('msgThrowFailed', { seat: seatName(d.seat), cards: d.forced.map(cardText).join(' ') }), true);
        return new Promise(function (res) { setTimeout(res, SPEED[settings.speed].trickEnd); });
      case 'trickEnd':
        turnSeat = null; renderSeats();
        $('.slot-' + d.winner).classList.add('win');
        message(t('msgTrickWon', { seat: seatName(d.winner), pts: d.points && d.defenders ? ' (+' + d.points + ')' : (d.points ? ' (' + d.points + ')' : '') }));
        renderStatus(); renderButtons();
        break;
      case 'kitty':
        if (d.bonus) {
          message(t('msgKitty', { points: d.points, mult: d.multiplier, bonus: d.bonus }));
          renderStatus();
          return new Promise(function (res) { setTimeout(res, 1800); });
        }
        break;
      case 'handEnd':
        if (d.matchOver) { showEnd(d); return; }
        return showResult(d);
    }
  }

  function showResult(s) {
    renderAll();
    var dTeam = s.declarerTeam, usDecl = dTeam === 0, r = s.result;
    var line;
    if (s.matchOver) line = t('resDeclTop', { level: rankText(s.level) });
    else if (r.declarersWin) line = t('resDecl' + r.steps);
    else line = r.steps ? t('resTakeN', { n: r.steps }) : t('resTake0');
    // original sound effects: we level up / opponents level up / we take over / we lose the seat
    if (r.declarersWin) playSound(usDecl ? 'upgrade' : 'beupgrade');
    else playSound(usDecl ? 'getdown' : 'getup');
    var body = '<div class="res-line">' + t('defPoints') + '</div>' +
      '<div class="res-points">' + s.defenderPoints + '</div>' +
      '<div class="res-line"><b>' + line + '</b></div>' +
      '<div class="res-levels"><div>' + t('teamUs') + ': ' + rankText(s.levelsBefore[0]) + ' → <b>' + rankText(s.levelsAfter[0]) + '</b></div>' +
      '<div>' + t('teamThem') + ': ' + rankText(s.levelsBefore[1]) + ' → <b>' + rankText(s.levelsAfter[1]) + '</b></div></div>';
    if (!s.matchOver) body += '<div class="res-line">' + t('nextDeclarer', { seat: t('seatLong' + s.nextDeclarer) }) + '</div>';
    body += '<div class="res-line" style="margin-top:10px">' + t('kittyWas') + ':</div><div class="res-kitty" id="resKitty"></div>';
    $('#resTitle').textContent = s.matchOver ? (s.winnerTeam === 0 ? t('matchWon') : t('matchLost')) : t('handOver');
    $('#resBody').innerHTML = body;
    game.kitty.forEach(function (c) { $('#resKitty').appendChild(cardEl(c, game.ctx)); });
    $('#resBtn').textContent = s.matchOver ? t('playAgain') : t('continue');
    var dlg = $('#dlgResult');
    return new Promise(function (res) {
      dlg.addEventListener('close', function once() { dlg.removeEventListener('close', once); res(); }, { once: true });
      dlg.showModal();
    });
  }

  /* ---------- game lifecycle ---------- */
  function abortGame() {
    if (!game) return;
    game.aborted = true;
    timers.forEach(function (x) { clearTimeout(x.id); x.res(); }); timers = [];
    if (pending) { var p = pending; pending = null; p(null); }
    mode = null;
  }

  async function run(config) {
    abortGame();
    var g = new Game(Object.assign({ humanSeat: 0, rules: settings.rules, difficulty: settings.difficulty, luck: settings.luck }, config || {}), null);
    g.hooks = hooksFor(g);
    game = g; selected = {}; turnSeat = null;
    hideScreen();
    renderAll();
    while (game === g && !g.aborted && g.winner === null) {
      var s = await g.playHand();
      if (!s) return;
    }
  }

  /* ---------- start / end screens ---------- */
  function topLevelText() { return rankText(E.maxLevel(settings.rules)); }
  function hasSave() { var st = load('tractor.save', null); return !!(st && st.levels); }

  function showScreen(kind, data, guardMs) {
    // guardMs: ignore Start/Play-again for a moment so a held or repeated Enter can't skip the screen
    screen = { kind: kind, data: data || null, readyAt: Date.now() + (guardMs || 0) };
    $('#screenNote').textContent = ''; $('#screenNote').classList.remove('error');
    renderScreen();
  }
  function startFromScreen() {
    if (screen && Date.now() < screen.readyAt) return;
    run();
  }
  // Messages go to the status line, or onto the start/end panel while it covers the table.
  function notify(txt, isError) {
    if (!screen) { message(txt, isError); return; }
    var n = $('#screenNote'); n.textContent = txt; n.classList.toggle('error', !!isError);
  }
  function hideScreen() { screen = null; renderScreen(); }

  function renderScreen() {
    var el = $('#screen');
    if (!screen) { el.hidden = true; $('#confetti').innerHTML = ''; return; }
    el.hidden = false;
    el.dataset.kind = screen.kind;
    var top = topLevelText(), d = screen.data;
    var fan = $('#screenFan'), badge = $('#screenBadge'), body = $('#screenBody');
    fan.innerHTML = ''; badge.textContent = ''; body.innerHTML = '';
    $('#btnStartLoad').hidden = !(screen.kind === 'start' && hasSave());
    if (screen.kind === 'start') {
      $('#screenTitle').textContent = t('startTitle');
      $('#screenSub').textContent = t('startSub');
      body.innerHTML = '<p class="screen-goal">' + t('startGoal', { start: rankText(E.startLevel(settings.rules)), top: top }) + '</p>';
      [{ suit: 'J', rank: 16 }, { suit: 'S', rank: 14 }, { suit: 'H', rank: 13 }, { suit: 'C', rank: 12 }, { suit: 'D', rank: 10 }].forEach(function (c, i) {
        var ce = cardEl({ id: -1 - i, suit: c.suit, rank: c.rank }, null); ce.style.setProperty('--i', i - 2); fan.appendChild(ce);
      });
      $('#btnStart').textContent = t('startBtn');
    } else {
      var win = screen.kind === 'win';
      badge.textContent = win ? '🏆' : '🃏';
      $('#screenTitle').textContent = t(win ? 'winTitle' : 'loseTitle');
      $('#screenSub').textContent = t(win ? 'winSub' : 'loseSub', { top: d ? rankText(d.level) : top });
      if (d) {
        body.innerHTML =
          '<div class="end-stats">' +
            '<div class="end-team us"><span>' + t('teamUs') + '</span><b>' + rankText(d.levelsAfter[0]) + '</b></div>' +
            '<div class="end-team them"><span>' + t('teamThem') + '</span><b>' + rankText(d.levelsAfter[1]) + '</b></div>' +
          '</div>' +
          '<p class="end-meta">' + t('endHands', { n: d.handNo }) + ' · ' + t('endLast') + ': ' + t('defPoints') + ' ' + d.defenderPoints + '</p>';
      }
      $('#btnStart').textContent = t('restartBtn');
    }
    var cf = $('#confetti');
    if (screen.kind === 'win') {
      if (!cf.children.length) {
        var colors = ['#f2c14e', '#d32f2f', '#18803a', '#1565c0', '#fffdf7', '#ff8f00'];
        for (var i = 0; i < 80; i++) {
          var p = document.createElement('i');
          p.style.left = (Math.random() * 100) + '%';
          p.style.background = colors[i % colors.length];
          p.style.animationDelay = (Math.random() * 2.5) + 's';
          p.style.animationDuration = (2.6 + Math.random() * 2.4) + 's';
          p.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
          p.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
          cf.appendChild(p);
        }
      }
    } else cf.innerHTML = '';
  }

  function showEnd(s) {
    renderAll();
    var win = s.winnerTeam === 0;
    setTimeout(function () { playSound(win ? 'upgrade' : 'getdown'); }, 50);
    showScreen(win ? 'win' : 'lose', { level: s.level, levelsAfter: s.levelsAfter, defenderPoints: s.defenderPoints, handNo: game ? game.handNo : 0 }, 900);
    setTimeout(function () { var b = $('#btnStart'); if (b && screen) b.focus(); }, 60);
  }

  function saveGame() {
    if (!game) { notify(t('saveNoGame'), true); return; }
    if (game.winner !== null) { notify(t('saveOver'), true); return; } // the match is finished — nothing to continue
    var st = game.saveState();
    // saves the match position at the start of the current hand (like the original GAME.SAV)
    if (game.phase !== 'handEnd') st.handNo = Math.max(0, st.handNo - 1);
    if (game.handNo === 1 && game.phase === 'deal') st.declarer = null;
    store('tractor.save', st);
    notify(t('saved'));
  }
  function loadGame() {
    var st = load('tractor.save', null);
    if (!st || !st.levels) { notify(t('noSave'), true); return; }
    if (screen && Date.now() < screen.readyAt) return;
    settings.rules = Object.assign({}, settings.rules, st.rules || {});
    saveSettings();
    run({ levels: st.levels, declarer: st.declarer, handNo: st.handNo, rules: settings.rules });
    message(t('loaded'));
  }

  /* ---------- options dialog ---------- */
  function openOptions() {
    var f = $('#dlgOptions form');
    Object.keys(settings.rules).forEach(function (k) { if (f.elements[k]) f.elements[k].checked = !!settings.rules[k]; });
    f.elements.partner.value = settings.difficulty.partner;
    f.elements.opponents.value = settings.difficulty.opponents;
    f.querySelector('input[name=speed][value="' + settings.speed + '"]').checked = true;
    f.querySelector('input[name=back][value="' + settings.back + '"]').checked = true;
    f.elements.fourColor.checked = !!settings.fourColor;
    f.elements.autoDeclare.checked = !!settings.autoDeclare;
    f.elements.luck.value = settings.luck || 0;
    syncLuckNote();
    $('#dlgOptions').showModal();
  }
  function closeOptions() {
    var dlg = $('#dlgOptions'); if (dlg.returnValue !== 'ok') return;
    var f = dlg.querySelector('form');
    Object.keys(settings.rules).forEach(function (k) { if (f.elements[k]) settings.rules[k] = f.elements[k].checked; });
    settings.difficulty = { partner: +f.elements.partner.value, opponents: +f.elements.opponents.value };
    settings.speed = +f.querySelector('input[name=speed]:checked').value;
    settings.back = +f.querySelector('input[name=back]:checked').value;
    settings.fourColor = f.elements.fourColor.checked;
    settings.autoDeclare = f.elements.autoDeclare.checked; // takes effect immediately, even mid-deal
    $('#app').dataset.back = settings.back;
    applyColors();
    if (game) game.difficulty = Object.assign({}, settings.difficulty); // difficulty applies immediately
    settings.luck = +f.elements.luck.value;
    if (game) game.luck = settings.luck; // good-hand mode: from the next deal
    renderStatus();
    saveSettings();
    renderScreen();
  }

  /* ---------- last trick ---------- */
  function showLast() {
    if (!game || !game.lastTrick) return;
    var box = $('#lastBody'); box.innerHTML = '';
    var w = E.trickWinner(game.lastTrick, game.ctx);
    game.lastTrick.forEach(function (p, i) {
      var row = document.createElement('div'); row.className = 'last-row' + (i === w ? ' win' : '');
      row.innerHTML = '<div class="who">' + t('seatLong' + p.seat) + '</div><div class="cards"></div>';
      p.cards.forEach(function (c) { row.querySelector('.cards').appendChild(cardEl(c, game.ctx)); });
      box.appendChild(row);
    });
    $('#dlgLast').showModal();
  }

  /* ---------- wire up ---------- */
  // Good-hand mode note: must-win mode gets its own explanation.
  function syncLuckNote() {
    var v = +$('#dlgOptions select[name=luck]').value;
    $('#luckNote').textContent = t(v === 3 ? 'optLuckNote3' : 'optLuckNote');
  }

  function applyColors() { document.documentElement.dataset.colors = settings.fourColor ? '4' : '2'; }

  function init() {
    $('#app').dataset.back = settings.back;
    applyColors();
    $$('#declareBar .suit-btn[data-suit]').forEach(function (b) { if (b.dataset.suit !== 'N') b.innerHTML = suitIcon(b.dataset.suit); });
    $('#hand').addEventListener('pointerdown', onHandDown);
    $('#hand').addEventListener('pointermove', onHandMove);
    document.addEventListener('pointerup', onHandUp);
    document.addEventListener('pointercancel', onHandUp);
    $('#hand').addEventListener('dblclick', onHandDbl);
    $('#app').addEventListener('contextmenu', onTableContext);
    $('#hand').addEventListener('transitionend', function (e) { if (e.propertyName === 'bottom') placePlayButton(); });
    $('#btnPlay').addEventListener('click', submit);
    $('#btnHint').addEventListener('click', hint);
    $('#btnLast').addEventListener('click', showLast);
    $('#btnNew').addEventListener('click', function () { run(); });
    $('#btnOptions').addEventListener('click', openOptions);
    $('#dlgOptions').addEventListener('close', closeOptions);
    $('#dlgOptions select[name=luck]').addEventListener('change', syncLuckNote);
    $('#btnRules').addEventListener('click', function () { $('#dlgRules').showModal(); });
    $('#btnSave').addEventListener('click', saveGame);
    $('#btnLoad').addEventListener('click', loadGame);
    $('#btnLang').addEventListener('click', function () { settings.lang = settings.lang === 'en' ? 'zh' : 'en'; saveSettings(); applyLang(); promptTurnMessage(); });
    $('#btnSound').addEventListener('click', function () { settings.sound = !settings.sound; saveSettings(); syncMusic(); });
    $('#btnMusic').addEventListener('click', function () { settings.music = !settings.music; saveSettings(); syncMusic(); });
    $('#declareBar').addEventListener('click', function (e) {
      var b = e.target.closest('.suit-btn'); if (!b || !game) return;
      if (game.humanDeclare(b.dataset.suit)) { declareKey = game.humanDeclareOptions().map(function (o) { return o.suit + o.count; }).join(','); renderAll(); }
    });
    document.addEventListener('keydown', function (e) {
      if (document.querySelector('dialog[open]')) return;
      if (screen && e.key === 'Enter') {
        // Enter on a focused button (Continue saved game, Options, Rules, menu…) does that button's job;
        // otherwise it starts the game.
        var a = document.activeElement;
        if (!a || a === document.body || a === $('#screen') || !a.closest('button, a, input, select')) { e.preventDefault(); if (!e.repeat) startFromScreen(); }
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); $('#dlgRules').showModal(); }
      else if (e.key === 'F2') { e.preventDefault(); run(); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { clearSelection(); renderHand(); renderButtons(); }
    });
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { layoutHand(); placePlayButton(); }, 60); });
    applyLang();
    $('#btnSound').setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
    $('#btnSound').textContent = settings.sound ? '🔊' : '🔈';
    $('#btnMusic').setAttribute('aria-pressed', settings.music ? 'true' : 'false');
    // browsers only allow music after a user gesture
    document.addEventListener('pointerdown', function first() { document.removeEventListener('pointerdown', first); syncMusic(); });
    $('#btnStart').addEventListener('click', startFromScreen);
    $('#btnStartLoad').addEventListener('click', loadGame);
    $('#btnStartOptions').addEventListener('click', openOptions);
    $('#btnStartRules').addEventListener('click', function () { $('#dlgRules').showModal(); });
    showScreen('start'); // the game waits for “Start game”
    try { $('#btnStart').focus({ preventScroll: true }); } catch (e) {}
  }

  window.TractorUI = { get game() { return game; }, get screen() { return screen && screen.kind; }, submit: submit, hint: hint, run: run, showEnd: showEnd };
  init();
})();
