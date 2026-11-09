// chessVill Race editions: passes player status between players who share a game code. Nothing is stored.
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const ROOM_RE = /^(cv|c4)-[a-z0-9]{6}$/;
const STATES = new Set(['playing', 'solved', 'timeup', 'lost']);
const MAX_PER_ROOM = 100;      // abuse guard only; far above any real race
const MAX_CLIENTS = 2000;
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
const rooms = new Map(); // name -> Set(ws)

function cleanPresence(d) {
  const out = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  if (typeof d.nick === 'string') out.nick = d.nick.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 16);
  if (typeof d.state === 'string' && STATES.has(d.state)) out.state = d.state;
  if (d.t === null) out.t = null;
  else if (typeof d.t === 'number' && isFinite(d.t) && d.t >= 0 && d.t <= 100000) out.t = Math.round(d.t);
  return out;
}
function broadcast(name) {
  const set = rooms.get(name); if (!set) return;
  const peers = [...set].map(c => ({ id: c.cvId, presence: c.cvPresence }));
  for (const c of set) {
    if (c.readyState === 1) c.send(JSON.stringify({ t: 'snap', you: c.cvId, peers }));
  }
}
function leave(ws) {
  const name = ws.cvRoom; if (!name) return;
  const set = rooms.get(name);
  if (set) { set.delete(ws); if (set.size === 0) rooms.delete(name); else broadcast(name); }
  ws.cvRoom = null;
}

wss.on('connection', (ws) => {
  if (wss.clients.size > MAX_CLIENTS) { ws.close(1013, 'busy'); return; }
  ws.cvId = crypto.randomBytes(6).toString('hex');
  ws.cvRoom = null; ws.cvPresence = {}; ws.cvAlive = true; ws.cvCount = 0;
  ws.on('pong', () => { ws.cvAlive = true; });
  ws.on('message', (raw) => {
    ws.cvCount++;
    if (ws.cvCount > 40) return; // simple per-second flood guard, reset below
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      if (ws.cvRoom || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;
      const set = rooms.get(m.room) || new Set();
      if (set.size >= MAX_PER_ROOM) { ws.send(JSON.stringify({ t: 'full' })); return; }
      set.add(ws); rooms.set(m.room, set); ws.cvRoom = m.room;
      broadcast(m.room);
    } else if (m.t === 'presence') {
      if (!ws.cvRoom) return;
      ws.cvPresence = Object.assign({}, ws.cvPresence, cleanPresence(m.data));
      broadcast(ws.cvRoom);
    } else if (m.t === 'ping') {
      ws.send('{"t":"pong"}');
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

setInterval(() => { wss.clients.forEach(c => { c.cvCount = 0; }); }, 1000);
setInterval(() => {
  wss.clients.forEach((c) => {
    if (!c.cvAlive) return c.terminate();
    c.cvAlive = false; c.ping();
  });
}, 30000);
module.exports = { wss };
