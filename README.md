# chessVill website
One Render web service that serves everything:
  /               Home
  /learn          Beginner's Guide
  /learn/kids     Kids' Tutorial
  /play/bots      Who's The Lucky Genius? (you against 8 bots)
  /play/friends   Friends table (host + up to 7 friends)
  /play/race/4    Race edition, chessVill-4
  /play/race/3    Race edition, chessVill-3
  /healthz        Health check
Upload the whole folder structure to GitHub exactly as it is (server.js, package.json, package-lock.json, lib/, pages/, public/).
On Render: New > Web Service > this repo. Build command: npm install   Start command: npm start
To change the X link, contact details or wallet address, edit the SITE block at the top of server.js.
Games live only in memory. If the free Render service sleeps or restarts, open tables are lost.
