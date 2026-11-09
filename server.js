// chessVill website: home, learn pages, bot game, friends table and race editions in one server.
// Pages are read once at start-up. Live games exist only in memory, so nothing is stored on disk.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SITE = {
  name: 'ChessVill Center',
  wallet: 'vpqidmcYT44D8YmwUGwQSPcYqSarCjofnpvAuXKXGTn',
  email: 'brianmacugu254@gmail.com',
  whatsapp: { shown: '0115983555', link: 'https://wa.me/254115983555' },
  x: { shown: 'ChessVill Center on X', link: 'https://x.com/search?q=ChessVill%20Center&f=user' }   // replace with the exact profile link
};

function load(dir, name) {
  const p = path.join(__dirname, dir, name);
  if (!fs.existsSync(p)) { console.error('Missing file: ' + dir + '/' + name); process.exit(1); }
  return fs.readFileSync(p, 'utf8');
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// path -> page file, title, description, which menu entry is current
const ROUTES = {
  '/': { f: 'home.html', t: "chessVill: chess for the mind's eye", d: "chessVill is a card-based chess game, a game of luck and intellect, that trains the mind's eye.", nav: 'home' },
  '/learn': { f: 'learn.html', t: "Beginner's Guide | chessVill", d: 'Learn chessVill from zero, with touchable boards and practice puzzles.', nav: 'learn' },
  '/learn/kids': { f: 'kids.html', t: "Kids' Tutorial | chessVill", d: 'A friendly chessVill tutorial for kids, with worked examples.', nav: 'kids' },
  '/play/bots': { f: 'bots.html', t: "Who's The Lucky Genius? | chessVill", d: 'Play chessVill against eight bots and win three games to take the tournament.', nav: 'bots' },
  '/play/friends': { f: 'friends.html', t: 'Friends table | chessVill', d: 'Open a chessVill table and invite up to 7 friends. Humans only.', nav: 'friends' },
  '/play/race/4': { f: 'race4.html', t: 'Race edition, chessVill-4 | chessVill', d: 'Race the clock or a friend on a 4 by 4 board.', nav: 'race4' },
  '/play/race/3': { f: 'race3.html', t: 'Race edition, chessVill-3 | chessVill', d: 'Race the clock or a friend on a 3 by 3 board.', nav: 'race3' }
};
const REDIRECTS = { '/war': '/play/bots', '/war4': '/play/bots', '/war4.html': '/play/bots', '/4': '/play/race/4', '/chessvill4.html': '/play/race/4', '/index.html': '/', '/play': '/#play', '/play/race': '/play/race/4' };
Object.keys(ROUTES).forEach((k) => { ROUTES[k].html = load('pages', ROUTES[k].f); });

const cur = (n, id) => (n === id ? ' aria-current="page"' : '');
function navHtml(n) {
  return '<header class="cvnav"><div class="cvin"><a class="cvbrand" href="/">chess<b>Vill</b><span>Center</span></a><nav aria-label="Main">' +
    '<details' + (/^(learn|kids)$/.test(n) ? ' open' : '') + '><summary' + (/^(learn|kids)$/.test(n) ? ' aria-current="true"' : '') + '>Learn</summary><div><a href="/learn"' + cur(n, 'learn') + '>Beginner&#39;s Guide</a><a href="/learn/kids"' + cur(n, 'kids') + '>Kids&#39; Tutorial</a></div></details>' +
    '<a href="/play/bots"' + cur(n, 'bots') + '>Play the bots</a>' +
    '<a href="/play/friends"' + cur(n, 'friends') + '>Friends</a>' +
    '<details><summary' + (/^race/.test(n) ? ' aria-current="true"' : '') + '>Race</summary><div><a href="/play/race/4"' + cur(n, 'race4') + '>chessVill-4</a><a href="/play/race/3"' + cur(n, 'race3') + '>chessVill-3</a></div></details>' +
    '</nav></div></header>';
}
function footHtml() {
  return '<footer class="cvfoot"><div class="cvin">' +
    '<div><h2>About</h2><p><b>chessVill</b> is a card-based chess game, a game of luck and intellect. It was developed to train the mind&#39;s eye by visualizing a chessboard.</p><p>Author: Brian Macugu<br>Developer: Brian Macugu</p></div>' +
    '<div><h2>Contact</h2><p>Gmail: <a href="mailto:' + SITE.email + '">' + SITE.email + '</a><br>WhatsApp: <a href="' + SITE.whatsapp.link + '" target="_blank" rel="noopener">' + SITE.whatsapp.shown + '</a><br>X: <a href="' + SITE.x.link + '" target="_blank" rel="noopener">' + esc(SITE.x.shown) + '</a></p></div>' +
    '<div><h2>Support chessVill</h2><p>chessVill is free to play. A donation in USDC on the Solana network helps keep it running.</p><div class="cvwallet" id="cvwallet">' + SITE.wallet + '</div><button id="cvcopy" type="button">Copy address</button><div id="cvqr" role="img" aria-label="QR code of the USDC wallet address"></div><p class="cvsmall" id="cvmsg">Scan the code in your wallet app, or copy the address. Send USDC on Solana only. Check the first and last four characters (' + SITE.wallet.slice(0, 4) + '...' + SITE.wallet.slice(-4) + ') before you send.</p></div>' +
    '<p class="cvlegal">&copy; ' + new Date().getFullYear() + ' ' + SITE.name + '. Donations are voluntary and non-refundable. chessVill is a game for training and fun.</p>' +
    '</div></footer><script src="/shell.js"></script>';
}
function page(r) {
  let h = r.html;
  const head = '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="description" content="' + esc(r.d) + '"><meta property="og:title" content="' + esc(r.t) + '"><meta property="og:description" content="' + esc(r.d) + '"><meta property="og:type" content="website"><meta property="og:site_name" content="' + SITE.name + '"><meta name="twitter:card" content="summary"><link rel="stylesheet" href="/shell.css">';
  h = h.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(r.t) + '</title>').replace('</head>', head + '</head>');
  h = h.replace(/<body[^>]*>/, (m) => m + navHtml(r.nav));
  h = h.replace(/<\/body>/, footHtml() + '</body>');
  return h;
}
const RENDERED = {}; Object.keys(ROUTES).forEach((k) => { RENDERED[k] = page(ROUTES[k]); });

const ASSETS = {
  '/shell.css': ['text/css; charset=utf-8', fs.readFileSync(path.join(__dirname, 'public', 'shell.css'))],
  '/shell.js': ['application/javascript; charset=utf-8', fs.readFileSync(path.join(__dirname, 'public', 'shell.js'))],
  '/favicon.svg': ['image/svg+xml', fs.readFileSync(path.join(__dirname, 'public', 'favicon.svg'))],
  '/robots.txt': ['text/plain; charset=utf-8', fs.readFileSync(path.join(__dirname, 'public', 'robots.txt'))]
};
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' };

const server = http.createServer((req, res) => {
  let url = (req.url || '/').split('?')[0];
  if (url.length > 1 && url.endsWith('/')) url = url.slice(0, -1);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (REDIRECTS[url]) { const q = (req.url || '').includes('?') ? '?' + req.url.split('?')[1] : ''; res.writeHead(301, { Location: REDIRECTS[url] + (REDIRECTS[url].includes('#') ? '' : q) }); return res.end(); }
  if (RENDERED[url]) { res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }, SEC)); return res.end(RENDERED[url]); }
  if (ASSETS[url]) { res.writeHead(200, Object.assign({ 'Content-Type': ASSETS[url][0], 'Cache-Control': 'public, max-age=300' }, SEC)); return res.end(ASSETS[url][1]); }
  res.writeHead(404, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, SEC));
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title><body style="font-family:system-ui;padding:24px;max-width:32em;margin:auto"><h1>Page not found</h1><p><a href="/">Back to chessVill</a></p></body>');
});

const race = require('./lib/race.js'), bots = require('./lib/bots.js'), friends = require('./lib/friends.js');
const SOCKETS = { '/ws': race.wss, '/war-ws': bots.wss, '/friends-ws': friends.wss };
server.on('upgrade', (req, sock, head) => {
  const w = SOCKETS[(req.url || '').split('?')[0]];
  if (!w) { sock.destroy(); return; }
  w.handleUpgrade(req, sock, head, (ws) => w.emit('connection', ws, req));
});
server.listen(PORT, () => console.log('chessVill site listening on ' + PORT));
