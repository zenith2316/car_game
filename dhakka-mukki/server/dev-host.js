/* Dhakka Mukki dev host. Same routes and wire protocol as the Android HostingService, so the web client
   and engine can be played and tested from a laptop. No dependencies.
   Run: node server/dev-host.js [port]   then open http://<lan-ip>:<port>/display on the big screen. */
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os');
const { Engine } = require('../android/assets/web/engine.js');

const PORT = Number(process.argv[2] || process.env.PORT || 8793);
const WEB = path.join(__dirname, '..', 'android', 'assets', 'web');
const TYPES = { '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.json': 'application/json', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

const engine = new Engine();
const sockets = new Map(); let nextId = 1;
const lan = () => Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);

function headers(type, len) { return { 'Content-Type': type, 'Content-Length': len, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP }; }
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/info') { const b = JSON.stringify({ ok: true, app: 'Dhakka Mukki', protocol: 1, ready: true }); res.writeHead(200, headers('application/json', Buffer.byteLength(b))); return res.end(b); }
  if (url === '/api/invite') {
    const host = req.headers.host || '', local = /^(127\.0\.0\.1|localhost)(:|$)/.test(host);
    const urls = local ? lan().map(ip => `http://${ip}:${PORT}/`) : [`http://${host}/`];
    const b = JSON.stringify({ ok: true, urls, qr: null }); res.writeHead(200, headers('application/json; charset=utf-8', Buffer.byteLength(b))); return res.end(b);
  }
  let file;
  if (url === '/' ) file = 'index.html';
  else if (url === '/display') file = 'display.html';
  else if (/^\/[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*\.(js|css|svg|png|woff2|txt|glb|jpg|webp|ogg|json)$/.test(url) && !url.includes('..')) file = url.slice(1);
  if (!file) { res.writeHead(404, headers('text/plain', 9)); return res.end('Not found'); }
  fs.readFile(path.join(WEB, file), (err, data) => {
    if (err) { res.writeHead(404, headers('text/plain', 9)); return res.end('Not found'); }
    const h = headers(TYPES[path.extname(file)] || 'application/octet-stream', data.length); if (file.startsWith('assets/')) h['Cache-Control'] = 'public, max-age=3600';
    res.writeHead(200, h); res.end(data);
  });
});

/* ---- minimal RFC 6455 server ---- */
function frame(text) {
  const p = Buffer.from(text, 'utf8'), n = p.length;
  const h = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([h, p]);
}
server.on('upgrade', (req, sock) => {
  const origin = req.headers.origin, host = req.headers.host;
  if (req.url !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key'] || (origin && origin !== 'http://' + host) || sockets.size >= 24) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const id = 'c' + (nextId++), client = { sock, id, kind: 'new' };
  sockets.set(id, client); engine.open(id);
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { sock.destroy(); return; }
      if (!masked || len > 4096) { sock.destroy(); return; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.slice(off, off + 4), data = Buffer.alloc(len);
      for (let i = 0; i < len; i++) data[i] = buf[off + 4 + i] ^ mask[i & 3];
      buf = buf.slice(off + 4 + len);
      if (op === 1) engine.message(id, data.toString('utf8'));
      else if (op === 8) { sock.end(Buffer.from([0x88, 0])); }
      else if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8A, data.length]), data])); }
    }
  });
  const gone = () => { if (sockets.delete(id)) engine.close(id); };
  sock.on('close', gone); sock.on('error', gone);
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), out = engine.update(now - last); last = now;
  for (const [to, text] of out) {
    if (to === '#') { const [cid, kind] = text.split(':'); const c = sockets.get(cid); if (c) c.kind = kind; continue; }
    const f = frame(text);
    if (to === '*' || to === 'D' || to === 'P') { for (const c of sockets.values()) if (to === '*' || c.kind === to) if (c.sock.writableLength < 262144) c.sock.write(f); }
    else { const c = sockets.get(to); if (c) c.sock.write(f); }
  }
}, 33);

server.listen(PORT, '0.0.0.0', () => {
  console.log('Dhakka Mukki dev host on port ' + PORT);
  console.log('  Host screen:  http://127.0.0.1:' + PORT + '/display#host=' + engine.hostToken);
  lan().forEach(ip => console.log('  Players join: http://' + ip + ':' + PORT + '/'));
  if (process.env.DM_TOKEN_FILE) fs.writeFileSync(process.env.DM_TOKEN_FILE, engine.hostToken);
});
