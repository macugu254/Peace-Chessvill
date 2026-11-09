// chessVill-4, humans only: server-authoritative game for a host and up to 7 friends.
'use strict';
const crypto = require('crypto');
const E = require('./engine.js')(4);
const MAX_SEATS = 8, MIN_SEATS = 2, HAND = 4, CLOCK_MS = 15 * 60 * 1000, GRACE_MS = 30 * 1000, EMPTY_MS = 2 * 60 * 1000, TARGET = 3;

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f\u007f<>&"']/g, '').trim().slice(0, 16) || 'Player'; }

function newSeat(g, name, token) {
  let nm = cleanName(name), k = 2;
  while (g.seats.some((s) => s.name === nm)) nm = cleanName(name).slice(0, 13) + ' ' + k++;
  return { name: nm, token, conn: null, hand: [], clock: g.clockMs, out: false, announced: null, wins: 0, discAt: 0, host: false };
}
function createGame(code, hostName, token, opts) {
  opts = opts || {};
  const g = { code, phase: 'lobby', uid: 0, seats: [], log: [], rev: 0, created: Date.now(), gameNo: 0, champion: null, over: false, winner: null,
    clockMs: opts.clockMs || CLOCK_MS, turn: 0, lastTick: Date.now(), noHumanSince: 0, deck: [], spare: [], king: null, cast: [] };
  const h = newSeat(g, hostName, token); h.host = true; g.seats.push(h);
  log(g, h.name + ' opened the table. Share the invite code with up to 7 friends.');
  return g;
}
function mk(g, id, spare) { return { id, spare: !!spare, uid: ++g.uid }; }
function log(g, t) { g.log.push(t); if (g.log.length > 120) g.log.shift(); }
function release(g, c) { if (c.spare) g.spare.push(c.id); else g.deck.push(c.id); }
function draw(g, s) { if (g.deck.length) s.hand.push(mk(g, g.deck.shift(), false)); }
function kingSq(g) { return E.parse(g.king.id).sq; }
const alive = (g) => g.seats.filter((s) => !s.out);
function ensureHost(g) { if (g.seats.length && !g.seats.some((s) => s.host)) { g.seats[0].host = true; log(g, g.seats[0].name + ' is now the host.'); } }
function hostIndex(g) { return Math.max(0, g.seats.findIndex((s) => s.host)); }

// ---- lobby ----
function joinGame(g, name, token) {
  if (g.phase !== 'lobby') return { err: 'This game has already started.' };
  if (g.seats.length >= MAX_SEATS) return { err: 'The table is full: a host and 7 friends.' };
  const s = newSeat(g, name, token); g.seats.push(s);
  log(g, s.name + ' joined the table.');
  return { seat: s };
}
function startGame(g, si) {
  const s = g.seats[si];
  if (!s || !s.host) return 'Only the host can start the game.';
  if (g.phase !== 'lobby') return 'The game has already started.';
  if (g.seats.length < MIN_SEATS) return 'Wait for at least one friend to join.';
  deal(g); return null;
}
function nextGame(g, si) {
  const s = g.seats[si];
  if (!s || !s.host) return 'Only the host can start the next game.';
  if (g.phase !== 'over') return 'The game is still on.';
  if (g.champion) { g.seats.forEach((x) => { x.wins = 0; }); g.champion = null; g.gameNo = 0; }
  deal(g); return null;
}
function deal(g) {
  g.seats = g.seats.filter((s) => s.conn);          // players who left are dropped between games
  ensureHost(g);
  if (g.seats.length < MIN_SEATS) { g.phase = 'lobby'; g.over = false; g.winner = null; log(g, 'Not enough players. Waiting for friends to join.'); return; }
  const deck = shuffle(E.allCards());
  const kingId = deck.filter((c) => c[0] === 'K')[0];
  deck.splice(deck.indexOf(kingId), 1);
  g.deck = deck; g.spare = E.spareList(); g.king = { id: kingId, spare: false }; g.cast = [];
  g.phase = 'play'; g.over = false; g.winner = null; g.gameNo++; g.log = []; g.lastTick = Date.now();
  g.seats.forEach((s) => { s.hand = []; s.clock = g.clockMs; s.out = false; s.announced = null; for (let k = 0; k < HAND; k++) s.hand.push(mk(g, g.deck.shift(), false)); });
  g.turn = hostIndex(g);
  log(g, 'Game ' + g.gameNo + '. The king stands on ' + E.sqName(E.parse(kingId).sq) + ' (' + kingId + '). ' + g.seats[g.turn].name + ' moves first.');
  g.lastTick = Date.now();
}

// ---- play ----
function award(g, s) {
  s.wins++;
  if (s.wins >= TARGET) { g.champion = { name: s.name, score: s.wins }; log(g, s.name + ' has won ' + TARGET + ' games and wins the tournament!'); }
}
function finishLast(g) {
  const live = alive(g);
  if (live.length === 1) { g.over = true; g.phase = 'over'; g.winner = { name: live[0].name, last: true }; log(g, live[0].name + ' is the last seat standing and wins the game.'); award(g, live[0]); return true; }
  if (live.length === 0) { g.over = true; g.phase = 'over'; g.winner = null; log(g, 'Nobody is left, so the game ends.'); return true; }
  return false;
}
function endTurn(g) {
  if (finishLast(g)) return;
  do { g.turn = (g.turn + 1) % g.seats.length; } while (g.seats[g.turn].out);
  g.lastTick = Date.now();
}
function eliminate(g, s, why) {
  s.out = true; s.announced = null;
  s.hand.forEach((c) => release(g, c)); s.hand = [];
  log(g, s.name + ' ' + why + ' and is out. Their cards go to the bottom of the deck.');
}
function swapCard(g, s, uid, to) {
  const c = s.hand.find((x) => x.uid === uid);
  if (!c) return 'Card not found.';
  const p = E.parse(c.id);
  if (c.spare || p.t !== 'P' || p.sq >= 4) return 'Only a pawn on rank 8 can be swapped.';
  if (!'NBRQK'.includes(to)) return 'Pick a knight, bishop, rook, queen or king.';
  const want = to + c.id[1] + '8', at = g.spare.indexOf(want);
  if (at < 0) return want + ' is not in the spare deck.';
  g.spare.splice(at, 1); g.deck.push(c.id);
  s.hand[s.hand.indexOf(c)] = mk(g, want, true);
  log(g, s.name + ' swaps ' + c.id + ' for ' + want + ' from the spare deck.');
  return null;
}
function act(g, si, m) {
  if (g.phase !== 'play' || g.over) return 'The game is not running.';
  const s = g.seats[si];
  if (!s || s.out) return 'You are out.';
  if (g.turn !== si) return 'It is not your turn.';
  const find = (u) => s.hand.find((x) => x.uid === u);
  switch (m.t) {
    case 'swap': return swapCard(g, s, m.uid, m.to);
    case 'pass': if (s.announced) return 'Reveal your announcement.'; log(g, s.name + ' passes.'); endTurn(g); return null;
    case 'discard': {
      if (s.announced) return 'Reveal your announcement.';
      const c = find(m.uid); if (!c) return 'Card not found.';
      s.hand.splice(s.hand.indexOf(c), 1); release(g, c); draw(g, s);
      log(g, s.name + ' discards and draws.'); endTurn(g); return null;
    }
    case 'cast': {
      if (s.announced) return 'Reveal your announcement.';
      const c = find(m.uid); if (!c || c.id[0] !== 'K') return 'Pick a king card.';
      s.hand.splice(s.hand.indexOf(c), 1);
      release(g, { id: g.king.id, spare: g.king.spare });
      g.king = { id: c.id, spare: c.spare }; g.cast.push(c.id); draw(g, s);
      log(g, s.name + ' casts ' + c.id + ': the king moves to ' + E.sqName(E.parse(c.id).sq) + '.'); endTurn(g); return null;
    }
    case 'announce': {
      if (s.announced) return 'You already announced.';
      const keep = Array.isArray(m.keep) ? m.keep : [];
      if (new Set(keep).size !== keep.length) return 'Duplicate cards.';
      const kept = keep.map(find);
      if (kept.some((x) => !x)) return 'Card not found.';
      if (kept.length < 2) return 'A mate needs at least 2 cards.';
      if (kept.some((x) => x.id[0] === 'K')) return 'King cards cannot be part of a mate.';
      s.hand.filter((x) => !kept.includes(x)).forEach((x) => release(g, x));
      s.hand = kept; s.announced = kept.length;
      log(g, s.name + ' announces: checkmate in ' + kept.length + '.'); endTurn(g); return null;
    }
    case 'reveal': {
      if (!s.announced) return 'You have not announced.';
      const order = Array.isArray(m.order) ? m.order : [];
      if (order.length !== s.hand.length || new Set(order).size !== order.length) return 'Order every card you hold.';
      const cards = order.map(find);
      if (cards.some((x) => !x)) return 'Card not found.';
      const k0 = kingSq(g), seq = cards.map((x) => x.id), r = E.verify(seq, k0);
      if (r.ok) {
        g.over = true; g.phase = 'over'; g.winner = { name: s.name, seq, king: k0, line: E.mateLine(seq, k0) };
        log(g, s.name + ' reveals ' + seq.join(', ') + ': CHECKMATE. ' + s.name + ' wins the game!'); award(g, s); return null;
      }
      log(g, s.name + ' reveals ' + seq.join(', ') + ' and it fails. ' + r.why);
      s.announced = null; while (s.hand.length < HAND && g.deck.length) draw(g, s);
      endTurn(g); return null;
    }
  }
  return 'Unknown action.';
}

// ---- clocks and connections; returns true when the table changed ----
function tick(g, now) {
  now = now || Date.now();
  let changed = false;
  // connection grace
  for (let i = g.seats.length - 1; i >= 0; i--) {
    const s = g.seats[i];
    if (s.conn) { s.discAt = 0; continue; }
    if (!s.discAt) { s.discAt = now; changed = true; continue; }
    if (now - s.discAt <= GRACE_MS) continue;
    changed = true;
    if (g.phase === 'lobby') {
      g.seats.splice(i, 1); log(g, s.name + ' left the table.');
      if (s.host) { ensureHost(g); }
    } else if (!s.out && g.phase === 'play') {
      eliminate(g, s, 'lost connection');
      if (s.host) { s.host = false; const nh = g.seats.find((x) => x.conn); if (nh) { nh.host = true; log(g, nh.name + ' is now the host.'); } }
      if (!finishLast(g) && g.turn === i) endTurn(g);
    } else if (s.host) {
      s.host = false; const nh = g.seats.find((x) => x.conn && x !== s); if (nh) { nh.host = true; log(g, nh.name + ' is now the host.'); }
    }
  }
  if (!g.seats.some((s) => s.conn)) {
    if (!g.noHumanSince) g.noHumanSince = now; else if (now - g.noHumanSince > EMPTY_MS) { g.dead = true; return true; }
  } else g.noHumanSince = 0;
  if (g.phase !== 'play' || g.over) { g.lastTick = now; return changed; }
  const dt = Math.min(2000, Math.max(0, now - g.lastTick)); g.lastTick = now;
  const cur = g.seats[g.turn];
  if (cur && !cur.out) {
    cur.clock -= dt;
    if (cur.clock <= 0) { cur.clock = 0; eliminate(g, cur, 'ran out of time'); endTurn(g); return true; }
  }
  return changed;
}

function view(g, si) {
  const s = g.seats[si];
  return {
    t: 'state', code: g.code, phase: g.phase, rev: ++g.rev, you: si, turn: g.turn, gameNo: g.gameNo, target: TARGET, champion: g.champion,
    over: g.over, winner: g.winner, max: MAX_SEATS, min: MIN_SEATS,
    seats: g.seats.map((x, i) => ({ i, name: x.name, out: x.out, host: x.host, count: x.hand.length, announced: x.announced, clock: Math.max(0, Math.round(x.clock)), live: !!x.conn, wins: x.wins })),
    top: g.deck[0] || null, deckCount: g.deck.length, king: g.king ? g.king.id : null, cast: g.cast.slice(), spare: g.spare.slice(),
    hand: s ? s.hand.map((c) => ({ id: c.id, spare: c.spare, uid: c.uid })) : [], log: g.log.slice(-60)
  };
}
module.exports = { createGame, joinGame, startGame, nextGame, act, tick, view, MAX_SEATS, E };
