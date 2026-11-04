/* Dhakka Mukki display: renders the arena on the host device or any big screen at /display.
   Receives 30 Hz snapshots, interpolates ~70 ms behind for smooth 60 fps motion, and adds every animation locally. */
'use strict';
(() => {
const $ = s => document.querySelector(s);
const A = window.DArt, D = window.Dhakka, S = window.DAudio;
const W = 1600, H = 900, DELAY = 70, TAU = Math.PI * 2;
const canvas = $('#stage'), ctx = canvas.getContext('2d');
const ss = { get(k) { try { return sessionStorage.getItem('dm.' + k) || ''; } catch (_) { return ''; } }, set(k, v) { try { sessionStorage.setItem('dm.' + k, v); } catch (_) {} } };
const ls = { get(k) { try { return localStorage.getItem('dm.' + k) || ''; } catch (_) { return ''; } }, set(k, v) { try { localStorage.setItem('dm.' + k, v); } catch (_) {} } };
let hostToken = new URLSearchParams(location.hash.slice(1)).get('host') || ss.get('host');
if (hostToken) { ss.set('host', hostToken); history.replaceState({}, '', location.pathname + location.search); }
const native = / DhakkaNative\//.test(navigator.userAgent);
let R3 = null;
function use3d() { if (R3 || !window.DRender3D) return; R3 = window.DRender3D; R3.setMap(app.map, D); document.body.classList.add('gl'); app.avatars.clear(); app.overlayKey = ''; renderOverlay(); }
document.addEventListener('dm3d-ready', () => use3d());

const app = {
  ws: null, host: false, room: null, snaps: [], map: D.buildMap('aangan'), mapId: 'aangan', stat: null, statKey: '',
  parts: [], shake: 0, beans: new Map(), emotes: new Map(), invite: null, inviteAt: 0, overlayKey: '', hostKey: '',
  tf: {}, pulse: {}, flashUntil: 0, retry: 500, phaseSeenAt: performance.now(), lastPhase: '', avatars: new Map(), view: { s: 1, ox: 0, oy: 0, dpr: 1 }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byColor = c => app.room && app.room.players.find(p => p.color === c);
const nameOf = id => { const p = app.room && app.room.players.find(x => x.id === id); return p ? p.name : 'Someone'; };

/* ---------- avatars as data URLs for DOM screens ---------- */
function avatar(color, look, size = 64) {
  const key = color + ':' + look + ':' + size; if (app.avatars.has(key)) return app.avatars.get(key);
  if (R3) { try { const u = R3.portrait(color, look, size); app.avatars.set(key, u); return u; } catch (_) {} }
  const c = document.createElement('canvas'), k = 2; c.width = c.height = size * k; const x = c.getContext('2d');
  x.scale(k * size / 80, k * size / 80); A.drawBean(x, { x: 40, y: 72, z: 0, color, look, face: Math.PI / 2, t: 0.3, noShadow: true });
  const url = c.toDataURL(); app.avatars.set(key, url); return url;
}
const av = (p, size = 56, cls = '') => `<img class="av ${cls}" src="${avatar(p.color, p.look, size)}" width="${size}" height="${size}" alt="">`;

/* ---------- network ---------- */
function connect() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  app.ws = ws;
  ws.onopen = () => { app.retry = 500; $('#conn').hidden = true; ws.send(JSON.stringify({ t: 'hello', role: 'display', host: hostToken || undefined })); };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; } onMessage(m); };
  ws.onclose = () => { $('#conn').hidden = false; setTimeout(connect, app.retry); app.retry = Math.min(4000, app.retry * 1.6); };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
function send(o) { if (app.ws && app.ws.readyState === 1) app.ws.send(JSON.stringify(o)); }
function hostDo(a, extra) { send(Object.assign({ t: 'host', a }, extra || {})); }
function onMessage(m) {
  if (m.t === 'welcome') { app.host = !!m.host; if (!m.host && hostToken) { hostToken = ''; ss.set('host', ''); } renderHost(true); }
  else if (m.t === 'room') onRoom(m);
  else if (m.t === 's') onSnap(m);
  else if (m.t === 'err') toast(m.msg || 'That did not work.');
}
function onRoom(r) {
  const prev = app.room; app.room = r;
  if (r.map.id !== app.mapId) { app.mapId = r.map.id; app.map = D.buildMap(r.map.id); app.snaps = []; app.tf = {}; app.parts = []; app.statKey = ''; if (R3) R3.setMap(app.map, D); }
  if (!prev || prev.phase !== r.phase) { app.phaseSeenAt = performance.now(); onPhase(r.phase, prev && prev.phase); }
  app.phaseLeftAt = { left: r.left, at: performance.now() };
  renderOverlay(); renderHost();
}
function onPhase(ph, was) {
  if (was && ph !== 'play' && !(was === 'intro' && ph === 'countdown')) wipe();
  S.setMood(ph === 'countdown' || ph === 'roundEnd' ? 'play' : ph);
  if (ph === 'intro') S.play('roll');
  if (ph === 'reveal') { S.play('roll'); setTimeout(() => S.play('gong'), 3300); }
  if (ph === 'finished') { S.play('cheer'); for (let i = 0; i < 6; i++) setTimeout(() => confetti(300 + Math.random() * 1000, 300, 60), i * 450); }
  if (ph === 'roundEnd') S.play('gong');
  if (ph === 'countdown') { [0, 1, 2].forEach(i => setTimeout(() => S.play('beep', 0), i * 1000)); }
  if (ph === 'lobby') loadInvite();
}
function onSnap(s) {
  const now = performance.now();
  if (s.p) { app.snaps.push({ at: now, s }); while (app.snaps.length > 12) app.snaps.shift(); }
  for (const f of s.fx || []) fx(f, now);
}

function wipe() { const w = $('#wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); S.play('dash', 0); }
/* ---------- effects ---------- */
function part(o) { if (R3 && o.kind !== 'text') return; if (app.parts.length > 520) app.parts.shift(); app.parts.push(Object.assign({ z: 0, vx: 0, vy: 0, vz: 0, life: 0.6, age: 0, size: 6, rot: 0, vr: 0, g: 0 }, o)); }
function dust(x, y, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 30 + Math.random() * 70; part({ kind: 'dust', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, life: 0.45 + Math.random() * 0.3, size: 5 + Math.random() * 6, col: col || 'rgba(255,240,215,0.7)' }); } }
function sparks(x, y, n) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 150 + Math.random() * 260; part({ kind: 'spark', x, y, z: 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 80 + Math.random() * 120, g: 500, life: 0.5, size: 5 + Math.random() * 4, col: ['#FFD84A', '#FFFFFF', '#FF7A1A'][i % 3] }); } }
function confetti(x, y, n) { const cols = ['#E8177D', '#FFC21A', '#14C4B4', '#FF7A1A', '#9B5CFF', '#6BD13B']; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 80 + Math.random() * 260; part({ kind: 'conf', x, y, z: 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 300 + Math.random() * 380, g: 700, life: 1.6 + Math.random(), size: 6 + Math.random() * 5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, col: cols[i % cols.length] }); } }
function ring(x, y, r, col, life = 0.5) { part({ kind: 'ring', x, y, life, size: r, col }); }
function words(x, y, text, col, size = 34) { if (app.parts.filter(p => p.kind === 'text').length >= 4) return; part({ kind: 'text', x, y, z: 60, vz: 60, life: 1.1, text, col, size }); }
function bean(c) { let b = app.beans.get(c); if (!b) { b = { sq: 0, v: 0, t: Math.random() * 10 }; app.beans.set(c, b); } return b; }
function flash(text, cls, ms = 1400) { const el = $('#flash'); el.textContent = text; el.className = 'flash show ' + (cls || ''); app.flashUntil = performance.now() + ms; }
let toastTimer = 0;
function toast(msg) { const el = $('#flash'); el.textContent = msg; el.className = 'flash show toast'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'flash'; }, 2600); }
const HIT_WORDS = ['Dhakka!', 'Dhishoom!', 'Arre!', 'Oof!', 'Hatt!'];
function fx(f, now) {
  if (R3) R3.fx(f);
  const [k, a, b, c] = f, col = typeof c === 'number' && A.COLORS[c] ? A.COLORS[c].fill : null;
  switch (k) {
    case 'j': dust(a, b, 4); bean(c).v -= 9; S.play('jump', 0.05); break;
    case 'l': dust(a, b, 6); bean(c).v += 14; S.play('land', 0.07); break;
    case 'd': for (let i = 0; i < 5; i++) part({ kind: 'line', x: a, y: b, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.25, size: 18, col: 'rgba(255,255,255,0.7)' }); S.play('dash', 0.05); break;
    case 'h': sparks(a, b, 12); app.shake = Math.max(app.shake, 7); if (Math.random() < 0.2) words(a, b - 40, HIT_WORDS[Math.random() * HIT_WORDS.length | 0], '#FFD84A', 30); S.play('hit', 0.04); break;
    case 'b': { let best = -1, bd = 1e9; app.map.bumpers.forEach((q, i) => { const p = cur.bu ? { x: cur.bu[i][0], y: cur.bu[i][1] } : q; const d = Math.hypot(p.x - a, p.y - b); if (d < bd) { bd = d; best = i; } }); if (best >= 0) app.pulse[best] = 1; S.play('boing', 0.08); break; }
    case 'f': ring(a, b, 40, 'rgba(255,255,255,0.6)', 0.6); S.play('fall', 0.1); break;
    case 'q': { const p = byColor(a); const pos = beanPos(a); if (pos) { confetti(pos.x, pos.y, 40); words(pos.x, pos.y - 60, b === 1 ? 'PEHLA!' : 'Qualified #' + b, '#FFFFFF', 34); } S.play('qualify', 0); if (p) flash(p.name + (b === 1 ? ' wins the race!' : ' qualified #' + b), 'good', 1500); break; }
    case 'o': { const p = byColor(a); if (p) flash(p.name + ' is out!', 'bad', 1300); S.play('out', 0.3); break; }
    case 'k': dust(a, b, 5, 'rgba(255,217,59,0.8)'); S.play('peel'); break;
    case 's': ring(a, b, 30, 'rgba(255,217,59,0.9)', 0.4); words(a, b - 50, 'Kela!', '#FFD93B', 28); S.play('slip'); break;
    case 'w': ring(a, b, 230, 'rgba(155,92,255,0.9)', 0.6); ring(a, b, 150, 'rgba(232,23,125,0.8)', 0.45); dust(a, b, 18, 'rgba(155,92,255,0.6)'); app.shake = 16; S.play('quake'); break;
    case 'u': flash('ULTA!', 'ulta', 1600); S.play('ulta'); break;
    case 'c': dust(a, b, 14, 'rgba(244,196,106,0.9)'); S.play('crack'); break;
    case 'tf': { app.tf[a] = now / 1000; const t = app.map.tiles && app.map.tiles[a]; if (t) for (let i = 0; i < 5; i++) part({ kind: 'crumb', x: t.x + (Math.random() - 0.5) * 60, y: t.y + (Math.random() - 0.5) * 50, vz: 60, g: 300, life: 0.7, size: 6, col: '#E8B04C' }); S.play('plop', 0.05); break; }
    case 'r': { const pos = beanPos(a); if (pos) ring(pos.x, pos.y, 34, 'rgba(255,255,255,0.8)'); break; }
    case 'e': app.emotes.set(a, { text: D.EMOTES[b] || 'Oye!', until: now + 1600 }); S.play('emote', 0.1); break;
    case 'g': { const p = byColor(a); if (p) flash(p.name + ' has the mukut!', 'gold', 1200); S.play('grab', 0); break; }
    case 'cd': S.play('drop', 0.1); break;
    case 'go': flash('CHALO!', 'go', 900); S.play('go', 0); break;
    case 'end': S.play('beep', 0); break;
  }
}

/* ---------- interpolation ---------- */
let cur = {};
function lerpAng(a, b, k) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; }
function sample(now) {
  const snaps = app.snaps; if (!snaps.length) return null;
  const t = now - DELAY; let i = snaps.length - 1;
  while (i > 0 && snaps[i - 1].at > t) i--;
  const b = snaps[i], a = snaps[Math.max(0, i - 1)];
  if (a === b || b.at <= t) return { s: snaps[snaps.length - 1].s, k: 1, a: snaps[snaps.length - 1].s };
  const k = Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at)));
  return { s: b.s, a: a.s, k };
}
function interp(sm) {
  const { s, a, k } = sm, out = Object.assign({}, s);
  const prev = new Map((a.p || []).map(p => [p[0], p]));
  out.p = (s.p || []).map(p => { const q = prev.get(p[0]); if (!q || Math.hypot(q[1] - p[1], q[2] - p[2]) > 120) return p; return [p[0], q[1] + (p[1] - q[1]) * k, q[2] + (p[2] - q[2]) * k, q[3] + (p[3] - q[3]) * k, p[4], p[5], lerpAng(q[6] / 100, p[6] / 100, k) * 100, p[7], p[8], p[9]]; });
  if (s.sw && a.sw && a.sw.length === s.sw.length) out.sw = s.sw.map((v, i) => lerpAng(a.sw[i] / 1000, v / 1000, k) * 1000);
  for (const key of ['pl', 'mv', 'bu']) if (s[key] && a[key] && a[key].length === s[key].length) out[key] = s[key].map((v, i) => [a[key][i][0] + (v[0] - a[key][i][0]) * k, a[key][i][1] + (v[1] - a[key][i][1]) * k]);
  if (s.cr && a.cr) out.cr = [a.cr[0] + (s.cr[0] - a.cr[0]) * k, a.cr[1] + (s.cr[1] - a.cr[1]) * k, a.cr[2] + (s.cr[2] - a.cr[2]) * k, s.cr[3]];
  return out;
}
function beanPos(c) { const p = (cur.p || []).find(x => x[0] === c); return p ? { x: p[1], y: p[2] } : null; }

/* ---------- canvas ---------- */
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = innerWidth, h = innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const s = Math.min(w / W, h / H); app.view = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2, dpr };
  document.documentElement.style.setProperty('--u', s.toFixed(5) + 'px');
  document.documentElement.style.setProperty('--ox', app.view.ox + 'px');
  document.documentElement.style.setProperty('--oy', app.view.oy + 'px');
  app.statKey = '';
}
function staticLayer() {
  const k = Math.min(2, app.view.s * app.view.dpr), key = app.mapId + ':' + k.toFixed(2);
  if (app.statKey === key && app.stat) return app.stat;
  const c = app.stat || document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); A.drawMapStatic(x, app.map, W, H);
  app.stat = c; app.statKey = key; return c;
}
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; const T = now / 1000;
  const sm = sample(now); cur = sm ? interp(sm) : {};
  const v = app.view, th = A.THEMES[app.map.theme] || A.THEMES.aangan;
  if (R3) { frame3d(now, dt, T); return; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = th.void[0]; ctx.fillRect(0, 0, canvas.width, canvas.height);
  app.shake *= Math.exp(-9 * dt); const sx = (Math.random() - 0.5) * app.shake, sy = (Math.random() - 0.5) * app.shake;
  ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * (v.ox + sx), v.dpr * (v.oy + sy));
  ctx.drawImage(staticLayer(), 0, 0, W, H);
  for (const k in app.pulse) { app.pulse[k] = Math.max(0, app.pulse[k] - dt * 4); }
  const dyn = { sw: cur.sw, pl: cur.pl, mv: cur.mv, bu: cur.bu, tl: cur.tl, pe: cur.pe, u: cur.u, tf: app.tf, bump: app.pulse };
  A.drawMapDynamic(ctx, app.map, dyn, T);
  // depth-sorted drawables
  const items = A.tallPieces(app.map, dyn, T);
  const players = cur.p || [];
  for (const p of players) {
    const [c, x, y, z, vx, vy, f, stun, fl, place] = p; if (fl & 4) continue;
    const b = bean(c); b.t += dt;
    b.v += (-120 * b.sq - 12 * b.v) * dt; b.sq += b.v * dt; b.sq = Math.max(-0.45, Math.min(0.55, b.sq));
    const falling = fl & 2, scale = falling ? Math.max(0, 1 + z / 420) : 1;
    const alpha = (fl & 32) ? (Math.floor(T * 12) % 2 ? 0.45 : 0.9) : (fl & 8) ? 0.9 : 1;
    items.push({ y, draw: x2 => {
      A.drawBean(x2, { x, y: falling ? y - z * 0.3 : y, z: falling ? 0 : z, color: c, look: (byColor(c) || {}).look || 0, face: f / 100, speed: Math.hypot(vx, vy), t: b.t, squash: b.sq, stun: stun > 0, dash: fl & 1, slip: fl & 64, scale, alpha, noShadow: falling });
      if (fl & 16) A.crown(x2, x, y, z + 62, T, true);
      if (fl & 8) { x2.fillStyle = '#27982F'; x2.beginPath(); x2.arc(x + 20, y - z - 62, 13, 0, TAU); x2.fill(); x2.fillStyle = '#fff'; x2.font = '800 15px "Baloo 2", sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(place, x + 20, y - z - 61); }
    } });
  }
  if (cur.cr && cur.cr[3] < 0) items.push({ y: cur.cr[1], draw: x2 => A.crown(x2, cur.cr[0], cur.cr[1], cur.cr[2], T, false) });
  items.sort((a, b) => a.y - b.y).forEach(it => it.draw(ctx));
  drawParts(dt);
  // name tags and emotes
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of players) {
    const [c, x, y, z, , , , , fl] = p; if (fl & 6) continue;
    const pl = byColor(c); if (!pl) continue;
    const col = A.COLORS[c], top = y - z - 78;
    ctx.font = '800 17px "Baloo 2", sans-serif'; const w = ctx.measureText(pl.name).width + 18;
    ctx.fillStyle = 'rgba(28,11,51,0.78)'; A.rr(ctx, x - w / 2, top - 12, w, 24, 12); ctx.fill();
    ctx.fillStyle = col.fill; ctx.fillRect(x - w / 2 + 8, top + 8, w - 16, 3);
    ctx.fillStyle = '#FFF4DC'; ctx.fillText(pl.name, x, top);
    const em = app.emotes.get(c);
    if (em && em.until > now) { ctx.font = '800 20px "Baloo 2", sans-serif'; const ew = ctx.measureText(em.text).width + 22; ctx.fillStyle = '#FFF4DC'; A.rr(ctx, x - ew / 2, top - 52, ew, 32, 14); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 6, top - 21); ctx.lineTo(x + 6, top - 21); ctx.lineTo(x, top - 12); ctx.fill(); ctx.fillStyle = A.INK; ctx.fillText(em.text, x, top - 36); }
  }
  A.bunting(ctx, W, T);
  updateHud(now);
  if (app.flashUntil && now > app.flashUntil) { $('#flash').className = 'flash'; app.flashUntil = 0; }
}
function tag(x, y, k, name, col, emote) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.font = '800 17px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 22;
  ctx.fillStyle = 'rgba(28,11,51,0.82)'; A.rr(ctx, -w / 2, -13, w, 26, 13); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = col.fill; A.rr(ctx, -w / 2, -13, w, 26, 13); ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.fillText(name, 0, 1);
  if (emote) { ctx.font = '800 21px "Baloo 2", sans-serif'; const ew = ctx.measureText(emote).width + 26; ctx.fillStyle = '#FFFFFF'; A.rr(ctx, -ew / 2, -58, ew, 34, 17); ctx.fill(); ctx.beginPath(); ctx.moveTo(-7, -25); ctx.lineTo(7, -25); ctx.lineTo(0, -15); ctx.fill(); ctx.fillStyle = A.INK; ctx.fillText(emote, 0, -40); }
  ctx.restore();
}
function frame3d(now, dt, T) {
  R3.render({ cur, room: app.room, dt, T, phaseAge: (now - app.phaseSeenAt) / 1000, Dhakka: D });
  const v = app.view;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const players = cur.p || [], ph = app.room && app.room.phase;
  if (!['panchayat', 'reveal', 'scores'].includes(ph)) for (const p of players) {
    const [c, x, y, z, , , , , fl] = p; if (fl & 6) continue;
    const pl = byColor(c); if (!pl || (ph === 'finished')) continue;
    const pt = R3.project(x, y, z + 112); if (!pt.ok) continue;
    const k = Math.max(0.62, Math.min(1.35, R3.scaleAt(x, y, z) * 1.15));
    const em = app.emotes.get(c);
    tag(pt.x, pt.y, k, pl.name, A.COLORS[c], em && em.until > now ? em.text : '');
  }
  // floating words, projected from the arena
  const keep = [], rdt = Math.min(0.5, (now - (app.lastReal || now)) / 1000), menu = ['panchayat', 'reveal', 'scores', 'intro'].includes(ph); app.lastReal = now;
  for (const p of app.parts) {
    p.age += rdt; if (p.age >= p.life || menu) continue; keep.push(p);
    p.z += p.vz * rdt; const pt = R3.project(p.x, p.y, p.z + 40); if (!pt.ok) continue;
    const sc = (p.age < 0.15 ? p.age / 0.15 * 1.25 : 1) * Math.max(0.8, v.s * 1.4);
    ctx.save(); ctx.globalAlpha = Math.min(1, (1 - p.age / p.life) * 2); ctx.translate(pt.x, pt.y); ctx.rotate(Math.sin(p.x) * 0.12); ctx.scale(sc, sc);
    ctx.font = `400 ${p.size}px Shrikhand, "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 9; ctx.strokeStyle = A.INK; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0); ctx.restore();
  }
  app.parts = keep;
  ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
  A.bunting(ctx, W, T);
  updateHud(now);
  if (app.flashUntil && now > app.flashUntil) { $('#flash').className = 'flash'; app.flashUntil = 0; }
}
function drawParts(dt) {
  const keep = [];
  for (const p of app.parts) {
    p.age += dt; if (p.age >= p.life) continue; keep.push(p);
    p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.g * dt; p.z = Math.max(0, p.z + p.vz * dt); p.rot += p.vr * dt;
    if (p.kind === 'dust' || p.kind === 'line') { p.vx *= 0.92; p.vy *= 0.92; }
    const k = 1 - p.age / p.life; ctx.globalAlpha = Math.min(1, k * 1.6);
    if (p.kind === 'dust') { ctx.fillStyle = p.col; A.ell(ctx, p.x, p.y - p.z, p.size * (1.6 - k * 0.6), p.size * (1.6 - k * 0.6) * 0.8); ctx.fill(); }
    else if (p.kind === 'spark') A.star(ctx, p.x, p.y - p.z, p.size * k + 1, p.col);
    else if (p.kind === 'conf' || p.kind === 'crumb') { ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    else if (p.kind === 'ring') { ctx.strokeStyle = p.col; ctx.lineWidth = 6 * k + 1; A.ell(ctx, p.x, p.y, p.size * (1.1 - k * 0.8) + 4, (p.size * (1.1 - k * 0.8) + 4) * 0.62); ctx.stroke(); }
    else if (p.kind === 'line') { ctx.strokeStyle = p.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y - 20); ctx.lineTo(p.x - p.vx * 0.2, p.y - 20 - p.vy * 0.2); ctx.stroke(); }
    else if (p.kind === 'text') { ctx.save(); ctx.translate(p.x, p.y - p.z); const sc = p.age < 0.15 ? p.age / 0.15 * 1.2 : 1; ctx.scale(sc, sc); ctx.font = `400 ${p.size}px Shrikhand, "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = A.INK; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0); ctx.restore(); }
  }
  ctx.globalAlpha = 1; app.parts = keep;
}

/* ---------- HUD ---------- */
function leftNow() { const pl = app.phaseLeftAt; if (!pl) return 0; const s = app.snaps[app.snaps.length - 1]; if (s && s.s.left != null && performance.now() - s.at < 400) return s.s.left; return Math.max(0, pl.left - (app.room && app.room.paused ? 0 : (performance.now() - pl.at) / 1000)); }
function updateHud(now) {
  const r = app.room, hud = $('#hud'); if (!r) { hud.hidden = true; return; }
  const show = ['countdown', 'play', 'roundEnd'].includes(r.phase); hud.hidden = !show; if (!show) { tickOverlay(); return; }
  $('#hud-round').textContent = 'Round ' + r.round + ' of ' + r.rounds;
  $('#hud-map').textContent = r.map.name;
  const left = leftNow();
  $('#hud-timer').textContent = r.phase === 'countdown' ? Math.ceil(left) : Math.ceil(left) + 's';
  $('#hud-timer').classList.toggle('urgent', r.phase === 'play' && left < 10);
  const ps = r.players.filter(p => !p.waiting);
  let st = '';
  if (r.map.kind === 'race') st = `<b>${ps.filter(p => p.st === 'done').length}</b> / ${r.quota} qualified`;
  else if (r.map.kind === 'survive') st = `<b>${ps.filter(p => p.st !== 'out').length}</b> standing · ${r.quota} survive`;
  else if (r.map.kind === 'crown') st = 'Hold the mukut!';
  const hs = $('#hud-status'); if (hs.dataset.v !== st) { hs.dataset.v = st; hs.innerHTML = st; }
  tickOverlay();
}
function tickOverlay() { const el = document.querySelector('[data-left]'); if (el) el.textContent = Math.ceil(leftNow()); const bar = document.querySelector('[data-leftbar]'); if (bar && app.room) bar.style.transform = `scaleX(${Math.max(0, leftNow() / (Number(bar.dataset.leftbar) || 1))})`; }

/* ---------- overlays ---------- */
function goal(r) {
  const n = r.players.filter(p => !p.waiting).length;
  if (r.map.kind === 'race') return `First <b>${r.quota}</b> to the tapri qualify. Fall and you restart at the last flag.`;
  if (r.map.kind === 'survive') return `<b>${r.quota}</b> of ${n} survive. Fall off and you are out of this round.`;
  if (r.map.kind === 'crown') return 'Hold the mukut the longest. Any dhakka knocks it loose. No saboteurs, no mercy.';
  return '';
}
function playerChips(r) {
  const chips = [];
  for (let i = 0; i < 10; i++) {
    const p = r.players[i];
    if (!p) { chips.push('<li class="chip empty"><span class="seat"></span><span>Open spot</span></li>'); continue; }
    chips.push(`<li class="chip ${p.online ? '' : 'offline'}" style="--pc:${A.COLORS[p.color].fill}">${av(p, 44)}<span class="nm">${esc(p.name)}</span>${p.bot ? '<span class="tag">bot</span>' : p.online ? (p.ready ? '<span class="tag ok">ready</span>' : '') : '<span class="tag">away</span>'}${app.host ? `<button class="x" data-act="kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>` : ''}</li>`);
  }
  return '<ul class="chips">' + chips.join('') + '</ul>';
}
function renderOverlay() {
  const r = app.room, ov = $('#overlay'); if (!r) return;
  const res = r.result;
  const key = [r.phase, r.paused, r.round, app.host, r.players.map(p => [p.id, p.name, p.color, p.look, p.online, p.ready, r.phase === 'panchayat' ? p.voted : '', p.score].join(',')).join('|'), JSON.stringify(res && [res.gains, res.saboteurs, res.ejected]), app.invite && app.invite.urls.join(), r.settings.rounds, r.settings.saboteurs, r.settings.talk].join('#');
  if (key === app.overlayKey) return; app.overlayKey = key;
  let html = '';
  const ps = r.players.filter(p => !p.waiting);
  switch (r.phase) {
    case 'lobby': {
      const inv = app.invite, url = inv && inv.urls[0];
      html = `<section class="lobby">
        <header class="brand"><h1 class="logo">Dhakka <span>Mukki</span></h1><p>The desi push-and-shove party race for 3 to 10 players. Phones are the controllers. Watch out, a <b>Chupa Rustam</b> is hiding among you.</p></header>
        <aside class="join card">
          <h2>Join on your phone</h2>
          ${inv && inv.qr ? `<img class="qr" src="${inv.qr}" alt="QR code to join">` : ''}
          <p class="url">${url ? esc(url) : 'Open the Wi-Fi menu on the host phone for the address'}</p>
          <p class="hint">Same Wi-Fi as this screen. No app needed, any phone browser works.</p>
        </aside>
        <footer class="dock">
          ${playerChips(r)}
          ${app.host ? `<div class="hostset">
            <div class="seg" role="group" aria-label="Rounds">${[3, 5, 7].map(n => `<button data-act="set" data-k="rounds" data-v="${n}" aria-pressed="${r.settings.rounds === n}">${n} rounds</button>`).join('')}</div>
            <div class="seg" role="group" aria-label="Saboteurs"><button data-act="set" data-k="saboteurs" data-v="1" aria-pressed="${r.settings.saboteurs}">Chupa Rustam on</button><button data-act="set" data-k="saboteurs" data-v="0" aria-pressed="${!r.settings.saboteurs}">Off</button></div>
            <div class="seg" role="group" aria-label="Panchayat time">${[30, 45, 60, 90].map(n => `<button data-act="set" data-k="talk" data-v="${n}" aria-pressed="${r.settings.talk === n}">${n}s talk</button>`).join('')}</div>
            <button class="btn ghost" data-act="addBot" ${r.players.length >= 10 ? 'disabled' : ''}>+ Add bot</button>
            <button class="btn go" data-act="start" ${r.players.length < 3 ? 'disabled' : ''}>${r.players.length < 3 ? `Need ${3 - r.players.length} more` : 'Start match'}</button>
          </div>` : `<p class="waithost">Waiting for the host to start. ${r.players.length}/10 in.</p>`}
        </footer></section>`;
      break;
    }
    case 'intro': {
      const sab = r.saboteurCount;
      html = `<section class="card intro pop">
        <p class="kicker">Round ${r.round} of ${r.rounds}</p><h1 class="title">${esc(r.map.name)}</h1>
        <p class="blurb">${esc(r.map.blurb)}</p><p class="goal">${goal(r)}</p>
        ${sab ? `<p class="secret">Check your phone. <b>${sab} Chupa Rustam${sab > 1 ? 's are' : ' is'}</b> hiding among you, sabotaging the round.</p>` : r.map.kind === 'crown' ? '<p class="secret gold">Final round. Biggest points of the night.</p>' : ''}
        <ul class="controls"><li><i class="k">◉</i>Joystick to run</li><li><i class="k">⤒</i>Jump</li><li><i class="k">✊</i>Dhakka to shove</li></ul>
      </section>`;
      break;
    }
    case 'countdown': html = `<div class="count"><span data-left>3</span></div>`; break;
    case 'roundEnd': {
      const q = (res && res.qualified) || [];
      html = `<section class="banner pop"><h1 class="title">${r.map.kind === 'race' ? 'Race over' : r.map.kind === 'survive' ? 'Time!' : 'Mukut time over'}</h1>
        <ul class="qual">${q.map((id, i) => { const p = r.players.find(x => x.id === id); return p ? `<li style="--pc:${A.COLORS[p.color].fill}">${av(p, 40)}<span>${r.map.kind === 'crown' ? ['🥇', '🥈', '🥉'][i] || '' : ''} ${esc(p.name)}</span></li>` : ''; }).join('') || '<li class="none">Nobody made it. Shameful.</li>'}</ul>
        ${r.saboteurCount ? '<p class="next">The Panchayat is gathering…</p>' : ''}</section>`;
      break;
    }
    case 'panchayat': {
      const st = r.stats || {}, total = r.settings.talk;
      html = `<section class="panch card pop">
        <p class="kicker">Round ${r.round} · ${esc(r.map.name)}</p>
        <h1 class="title">Panchayat baithi hai</h1>
        <p class="blurb">Who was the <b>Chupa Rustam</b>? Argue it out loud, then vote on your phone. Catch them and they lose everything this round.</p>
        <div class="timer"><span data-left>${total}</span><i class="bar"><b data-leftbar="${total}"></b></i></div>
        <ul class="facts"><li><b>${st.hits || 0}</b> dhakkas</li><li><b>${st.falls || 0}</b> falls</li><li><b>${st.peels || 0}</b> kela peels</li><li><b>${st.quakes || 0}</b> bhookamps</li><li><b>${st.tricks || 0}</b> ${esc(r.map.id === 'papad' ? 'cracks' : 'ultas')}</li></ul>
        <ul class="voters">${ps.map(p => `<li class="${p.voted ? 'done' : ''}" style="--pc:${A.COLORS[p.color].fill}">${av(p, 52)}<span>${esc(p.name)}</span><i>${p.voted ? 'voted' : 'thinking…'}</i></li>`).join('')}</ul>
      </section>`;
      break;
    }
    case 'reveal': {
      const t = res.tally || {}, ej = res.ejected, sabs = res.saboteurs || [];
      const ejP = ej && r.players.find(p => p.id === ej);
      html = `<section class="reveal card">
        <h1 class="title pop">Panchayat ka faisla</h1>
        <ul class="tally">${ps.map((p, i) => `<li style="--pc:${A.COLORS[p.color].fill};--d:${0.3 + i * 0.08}s" class="${p.id === ej ? 'ej' : ''}">${av(p, 48)}<span>${esc(p.name)}</span><i>${'<b class="v"></b>'.repeat(t[p.id] || 0) || '<em>no votes</em>'}</i></li>`).join('')}<li class="skip" style="--d:${0.3 + ps.length * 0.08}s"><span>Skipped</span><i>${'<b class="v"></b>'.repeat(res.skip || 0) || '<em>none</em>'}</i></li></ul>
        <p class="verdict" style="--d:2.2s">${ejP ? `The Panchayat throws out <b>${esc(ejP.name)}</b>…` : 'No decision. Nobody is thrown out.'}</p>
        <p class="truth" style="--d:3.6s">${ejP ? (sabs.includes(ej) ? `…and ${esc(ejP.name)} <b>was</b> the Chupa Rustam! Pakda gaya!` : `…but ${esc(ejP.name)} was innocent. Bechara.`) : ''}</p>
        <div class="rustams" style="--d:4.8s">${sabs.map(id => { const p = r.players.find(x => x.id === id); return p ? `<div class="rustam ${res.caught.includes(id) ? 'caught' : ''}" style="--pc:${A.COLORS[p.color].fill}">${av(p, 72)}<p><small>Chupa Rustam</small><b>${esc(p.name)}</b><span>${(res.sabo && res.sabo[id]) || 0} sabotage${((res.sabo && res.sabo[id]) || 0) === 1 ? '' : 's'} · ${res.caught.includes(id) ? 'caught, loses the round' : 'got away'}</span></p></div>` : ''; }).join('')}</div>
      </section>`;
      break;
    }
    case 'scores': html = scoreboard(r, false); break;
    case 'finished': html = podium(r); break;
  }
  if (r.paused) html += `<div class="paused"><h1 class="title">Paused</h1><p>${app.host ? 'Resume from the host bar.' : 'The host paused the game.'}</p></div>`;
  ov.innerHTML = html; ov.dataset.phase = r.phase;
}
function scoreboard(r) {
  const res = r.result, gains = (res && res.gains) || {}, notes = (res && res.notes) || {};
  const ranked = r.players.slice().sort((a, b) => b.score - a.score), max = Math.max(1, ranked[0] ? ranked[0].score : 1);
  return `<section class="scores card pop"><p class="kicker">After round ${r.round} of ${r.rounds}</p><h1 class="title">Points table</h1>
    <ol class="board">${ranked.map((p, i) => { const g = gains[p.id] || 0; return `<li style="--pc:${A.COLORS[p.color].fill};--w:${(p.score / max * 100).toFixed(1)}%;--d:${i * 0.07}s">${av(p, 40)}<span class="nm">${esc(p.name)}<small>${esc((notes[p.id] || []).join(' · '))}</small></span><span class="bar"><b></b></span><span class="pts">${p.score}</span><span class="delta ${g > 0 ? 'up' : g < 0 ? 'down' : ''}">${g > 0 ? '+' + g : g || ''}</span></li>`; }).join('')}</ol>
    <p class="next">${r.round >= r.rounds ? 'Crowning the Dhakka King…' : 'Next round loading…'}</p></section>`;
}
function podium(r) {
  const ids = r.podium || [], top = ids.map(id => r.players.find(p => p.id === id)).filter(Boolean), order = [1, 0, 2];
  return `<section class="podium pop"><p class="kicker">Match over</p><h1 class="title">${top[0] ? esc(top[0].name) + ' is the Dhakka King!' : 'Match over'}</h1>
    <div class="steps">${order.map(i => top[i] ? `<div class="step s${i + 1}" style="--pc:${A.COLORS[top[i].color].fill}">${av(top[i], i === 0 ? 120 : 92)}<b>${esc(top[i].name)}</b><span>${top[i].score} pts</span><i>${i + 1}</i></div>` : '').join('')}</div>
    ${app.host ? '<div class="row"><button class="btn go" data-act="start">Play again</button><button class="btn ghost" data-act="lobby">Back to lobby</button></div>' : ''}</section>`;
}
function renderHost(force) {
  const bar = $('#hostbar'), r = app.room; if (!app.host || !r || ['lobby', 'finished'].includes(r.phase)) { bar.hidden = true; app.hostKey = ''; return; }
  const key = r.phase + r.paused; if (!force && key === app.hostKey) return; app.hostKey = key;
  bar.hidden = false;
  bar.innerHTML = `<span>Host</span><button data-act="${r.paused ? 'resume' : 'pause'}">${r.paused ? 'Resume' : 'Pause'}</button><button data-act="skip">Skip</button><button data-act="end">End match</button>`;
}
async function loadInvite() {
  if (performance.now() - app.inviteAt < 8000 && app.invite) return; app.inviteAt = performance.now();
  try { const res = await fetch('/api/invite', { cache: 'no-store' }); const j = await res.json(); if (j && j.ok) { app.invite = j; app.overlayKey = ''; renderOverlay(); } } catch (_) {}
}

/* ---------- input ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'set') { const k = b.dataset.k, v = k === 'saboteurs' ? b.dataset.v === '1' : Number(b.dataset.v); hostDo('settings', { settings: { [k]: v } }); }
  else if (a === 'kick') { const n = nameOf(b.dataset.id); if (confirm('Remove ' + n + ' from the room?')) hostDo('kick', { id: b.dataset.id }); }
  else if (a === 'end') { if (confirm('End the match now and show the podium?')) hostDo('end'); }
  else hostDo(a);
});
const soundBtn = $('#sound');
function setSoundLabel() { soundBtn.textContent = S.music ? 'Music on' : 'Music off'; soundBtn.setAttribute('aria-pressed', String(S.music)); }
soundBtn.addEventListener('click', async () => { await S.setMusic(!S.music); ls.set('music', S.music ? 'on' : 'off'); setSoundLabel(); });
document.addEventListener('pointerdown', () => { S.unlock(); }, { once: true });
if (native || ls.get('music') === 'on') S.setMusic(true).then(setSoundLabel); else setSoundLabel();

addEventListener('resize', resize); resize();
connect(); loadInvite(); setInterval(() => { if (app.room && app.room.phase === 'lobby') loadInvite(); }, 15000);
requestAnimationFrame(frame);
})();
