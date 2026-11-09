// Friends table: humans only, a host and up to 7 friends.
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Game = require('./friends-game.js');
const CODE_RE = /^w4-[a-f0-9]{6}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_GAMES = 200;
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const games = new Map();

function sendState(g, seatIdx) {
  const s = g.seats[seatIdx];
  if (s && s.conn && s.conn.readyState === 1) s.conn.send(JSON.stringify(Game.view(g, seatIdx)));
}
function pushAll(g) { g.seats.forEach((s, i) => sendState(g, i)); }
function newCode() { for (;;) { const c = 'w4-' + crypto.randomBytes(3).toString('hex'); if (!games.has(c)) return c; } }
function err(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'err', msg })); }
function attach(g, seat, ws) {
  if (seat.conn && seat.conn !== ws) { try { seat.conn.close(); } catch (e) {} }
  seat.conn = ws; seat.discAt = 0; ws.cvGame = g.code; ws.cvToken = seat.token;
}
const seatOf = (g, ws) => g.seats.findIndex((s) => s.conn === ws);

wss.on('connection', (ws) => {
  ws.cvCount = 0; ws.cvGame = null; ws.cvAlive = true;
  ws.on('pong', () => { ws.cvAlive = true; });
  ws.on('message', (raw) => {
    if (++ws.cvCount > 20) return;
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const tokenOk = typeof m.token === 'string' && TOKEN_RE.test(m.token);
    if (m.t === 'new') {
      if (ws.cvGame || !tokenOk) return;
      if (games.size >= MAX_GAMES) return err(ws, 'The server is busy. Try again in a few minutes.');
      const g = Game.createGame(newCode(), m.name, m.token);
      games.set(g.code, g); attach(g, g.seats[0], ws); pushAll(g);
    } else if (m.t === 'join') {
      if (ws.cvGame || !tokenOk) return;
      const code = String(m.code || '').trim().toLowerCase();
      const g = CODE_RE.test(code) ? games.get(code) : null;
      if (!g) return err(ws, 'No game has that code. Check it with the host.');
      const mine = g.seats.find((s) => s.token === m.token);
      if (mine) { attach(g, mine, ws); return pushAll(g); }
      const r = Game.joinGame(g, m.name, m.token);
      if (r.err) return err(ws, r.err);
      attach(g, r.seat, ws); pushAll(g);
    } else if (m.t === 'resume') {
      const g = games.get(String(m.code || '').toLowerCase());
      const seat = g && tokenOk ? g.seats.find((s) => s.token === m.token) : null;
      if (!seat) { ws.send(JSON.stringify({ t: 'gone' })); return; }
      attach(g, seat, ws); pushAll(g);
    } else if (m.t === 'start' || m.t === 'next' || m.t === 'act') {
      const g = games.get(ws.cvGame); if (!g) return;
      const si = seatOf(g, ws); if (si < 0) return;
      let e = null;
      if (m.t === 'start') e = Game.startGame(g, si);
      else if (m.t === 'next') e = Game.nextGame(g, si);
      else {
        const a = m.a; if (!a || typeof a !== 'object') return;
        e = Game.act(g, si, { t: String(a.t), uid: Number(a.uid), to: String(a.to || ''), keep: Array.isArray(a.keep) ? a.keep.slice(0, 4).map(Number) : [], order: Array.isArray(a.order) ? a.order.slice(0, 4).map(Number) : [] });
      }
      if (e) err(ws, e); else pushAll(g);
    } else if (m.t === 'ping') ws.send('{"t":"pong"}');
  });
  const drop = () => {
    const g = games.get(ws.cvGame);
    if (g) { const i = seatOf(g, ws); if (i >= 0) { g.seats[i].conn = null; pushAll(g); } }
    ws.cvGame = null;
  };
  ws.on('close', drop); ws.on('error', drop);
});

setInterval(() => { wss.clients.forEach((c) => { c.cvCount = 0; }); }, 1000);
setInterval(() => {
  const now = Date.now();
  games.forEach((g, code) => {
    let ch = false;
    try { ch = Game.tick(g, now); } catch (e) { console.error('tick', e); g.dead = true; }
    if (g.dead) { games.delete(code); return; }
    if (ch) pushAll(g);
  });
}, 250);
setInterval(() => { games.forEach((g) => { if (g.phase === 'play' && !g.over) pushAll(g); }); }, 5000);
setInterval(() => { wss.clients.forEach((c) => { if (!c.cvAlive) return c.terminate(); c.cvAlive = false; c.ping(); }); }, 30000);
module.exports = { wss };
