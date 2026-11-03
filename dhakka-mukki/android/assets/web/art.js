/* Dhakka Mukki procedural art. Everything is drawn in code: no image assets.
   Characters are squishy "laddoo" beans; maps are desi mela set pieces. Shared by the display and the phone previews. */
'use strict';
(() => {
const TAU = Math.PI * 2;
/* Ten colours chosen to stay distinct for common colour-vision deficiencies when paired with the look and the seat number. */
const COLORS = [
  { name: 'Tamatar', fill: '#FF4B4B', dark: '#A81E1E', light: '#FF9C8F' },
  { name: 'Haldi', fill: '#FFC21A', dark: '#A87800', light: '#FFE38A' },
  { name: 'Mirchi', fill: '#6BD13B', dark: '#357A16', light: '#B6F08F' },
  { name: 'Mor', fill: '#14C4B4', dark: '#06716A', light: '#8FF0E5' },
  { name: 'Neela', fill: '#3D8BFF', dark: '#1A4AA6', light: '#9DC4FF' },
  { name: 'Baingan', fill: '#9B5CFF', dark: '#5527AE', light: '#CDB0FF' },
  { name: 'Gulabi', fill: '#FF62B9', dark: '#A42673', light: '#FFB3DC' },
  { name: 'Chai', fill: '#B57B4E', dark: '#6A4021', light: '#E2B48D' },
  { name: 'Doodh', fill: '#F3EFE6', dark: '#9A9284', light: '#FFFFFF' },
  { name: 'Koyla', fill: '#44445A', dark: '#16161F', light: '#8C8CA8' }
];
const LOOKS = ['Plain', 'Topi', 'Pagdi', 'Gajra', 'Cap', 'Shades', 'Mooch', 'Bindi', 'Headphones', 'Chashma'];
const INK = '#1C0B33';

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }

/* ---------- character ----------
   o: { x, y, z, color, look, face, speed, t, squash, stun, dash, scale, alpha, seat, slip } */
function drawBean(ctx, o) {
  const c = COLORS[o.color] || COLORS[0], s = o.scale == null ? 1 : o.scale;
  const sq = o.squash || 0, sx = 1 + sq * 0.55, sy = 1 - sq * 0.5;
  const speed = o.speed || 0, run = Math.min(1, speed / 220), ph = (o.t || 0) * (8 + speed * 0.03);
  const bob = o.z > 1 ? 0 : Math.abs(Math.sin(ph)) * 3.2 * run;
  const fx = Math.cos(o.face || 0), fy = Math.sin(o.face || 0);
  ctx.save();
  ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
  // shadow on the floor
  if (!o.noShadow) { const k = 1 - Math.min(o.z || 0, 180) / 260; ctx.fillStyle = 'rgba(20,6,40,' + (0.32 * k).toFixed(3) + ')'; ell(ctx, o.x, o.y + 3, 21 * k * s, 9 * k * s); ctx.fill(); }
  ctx.translate(o.x, o.y - (o.z || 0) - bob);
  ctx.scale(s, s);
  let lean = o.dash ? fx * 0.35 : fx * 0.08 * run;
  if (o.stun) lean += Math.sin((o.t || 0) * 22) * 0.25;
  if (o.slip) lean += Math.sin((o.t || 0) * 30) * 0.5;
  ctx.rotate(lean);
  // feet
  const step = Math.sin(ph) * 6 * run;
  ctx.fillStyle = c.dark;
  ell(ctx, -9 + step * 0.4, -3, 8, 5); ctx.fill();
  ell(ctx, 9 - step * 0.4, -3, 8, 5); ctx.fill();
  // body
  const bw = 22 * sx, bh = 27 * sy, cy = -bh - 2;
  ctx.fillStyle = c.dark; ell(ctx, 0, cy + 2, bw + 2.6, bh + 2.6); ctx.fill();
  const g = ctx.createRadialGradient(-bw * 0.35, cy - bh * 0.45, 2, 0, cy, bh * 1.25);
  g.addColorStop(0, c.light); g.addColorStop(0.45, c.fill); g.addColorStop(1, c.dark);
  ctx.fillStyle = g; ell(ctx, 0, cy, bw, bh); ctx.fill();
  // arms
  const sw = Math.sin(ph + Math.PI / 2) * 5 * run + (o.dash ? -8 : 0);
  ctx.fillStyle = c.fill; ctx.strokeStyle = c.dark; ctx.lineWidth = 2;
  ell(ctx, -bw - 2, cy + 6 + sw, 6, 8, 0.4); ctx.fill(); ctx.stroke();
  ell(ctx, bw + 2, cy + 6 - sw, 6, 8, -0.4); ctx.fill(); ctx.stroke();
  // belly sheen
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ell(ctx, -bw * 0.38, cy - bh * 0.42, bw * 0.32, bh * 0.2, -0.5); ctx.fill();
  // face
  const away = fy < -0.55;
  const ex = fx * 7, ey = cy - 6 + fy * 3;
  if (!away) {
    if (o.stun || o.slip) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (const d of [-8, 8]) { ctx.beginPath(); ctx.arc(ex + d, ey, 4.2, (o.t || 0) * 9, (o.t || 0) * 9 + 4.6); ctx.stroke(); }
      ctx.fillStyle = INK; ell(ctx, ex, ey + 10, 4, 3); ctx.fill();
    } else {
      const blink = hash(Math.floor((o.t || 0) * 0.7) + o.color) > 0.85 && ((o.t || 0) * 0.7) % 1 < 0.08;
      for (const d of [-8.5, 8.5]) {
        ctx.fillStyle = '#FFFFFF'; ell(ctx, ex + d, ey, 5.6, blink ? 0.8 : 6.6); ctx.fill();
        if (!blink) { ctx.fillStyle = INK; ell(ctx, ex + d + fx * 2.2, ey + fy * 2 + 0.8, 2.8, 3.4); ctx.fill(); ctx.fillStyle = '#fff'; ell(ctx, ex + d + fx * 2.2 - 1, ey + fy * 2 - 0.8, 0.9, 0.9); ctx.fill(); }
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
      if (o.dash) { ell(ctx, ex, ey + 11, 4, 4); ctx.fillStyle = INK; ctx.fill(); }
      else { ctx.arc(ex, ey + 7, 5, 0.2, Math.PI - 0.2); ctx.stroke(); }
    }
  }
  drawLook(ctx, o.look || 0, cy, bh, ex, ey, away, c);
  ctx.restore();
  // stun stars
  if (o.stun) {
    ctx.save(); ctx.translate(o.x, o.y - (o.z || 0) - 62 * s);
    for (let i = 0; i < 3; i++) { const a = (o.t || 0) * 5 + i * TAU / 3; star(ctx, Math.cos(a) * 18, Math.sin(a) * 6, 5, '#FFD84A'); }
    ctx.restore();
  }
}
function star(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); }
function drawLook(ctx, look, cy, bh, ex, ey, away, c) {
  const top = cy - bh;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (look) {
    case 1: // Gandhi topi
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#B8B2A6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-15, top + 7); ctx.quadraticCurveTo(0, top - 12, 15, top + 7); ctx.lineTo(13, top + 10); ctx.lineTo(-13, top + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, top + 3); ctx.lineTo(10, top + 3); ctx.stroke(); break;
    case 2: // pagdi
      ctx.fillStyle = '#FF7A1A'; ctx.strokeStyle = '#B34700'; ctx.lineWidth = 2;
      ell(ctx, 0, top + 4, 19, 11); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, top + 6); ctx.quadraticCurveTo(0, top - 6, 16, top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, top + 11); ctx.quadraticCurveTo(0, top + 1, 17, top + 7); ctx.stroke();
      ctx.fillStyle = '#FFD84A'; ell(ctx, 0, top - 1, 3.4, 3.4); ctx.fill(); break;
    case 3: // gajra flowers
      for (let i = 0; i < 6; i++) { const a = Math.PI + 0.35 + i * 0.47; ctx.fillStyle = i % 2 ? '#FFFFFF' : '#FFB627'; ell(ctx, Math.cos(a) * 17, cy - 14 + Math.sin(a) * 17, 4.2, 4.2); ctx.fill(); }
      break;
    case 4: // backwards cap
      ctx.fillStyle = '#E8177D'; ctx.strokeStyle = '#8F0B4B'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, top + 9, 16, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8F0B4B'; rr(ctx, -4, top - 9, 8, 6, 2); ctx.fill(); break;
    case 5: // shades
      if (!away) { ctx.fillStyle = INK; rr(ctx, ex - 15, ey - 5, 12, 9, 3); ctx.fill(); rr(ctx, ex + 3, ey - 5, 12, 9, 3); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 3, ey - 2); ctx.lineTo(ex + 3, ey - 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(ex - 13, ey - 3, 3, 2); ctx.fillRect(ex + 5, ey - 3, 3, 2); }
      break;
    case 6: // mooch
      if (!away) { ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(ex, ey + 5); ctx.quadraticCurveTo(ex - 9, ey + 2, ex - 14, ey + 8); ctx.quadraticCurveTo(ex - 7, ey + 9, ex, ey + 7); ctx.quadraticCurveTo(ex + 7, ey + 9, ex + 14, ey + 8); ctx.quadraticCurveTo(ex + 9, ey + 2, ex, ey + 5); ctx.fill(); }
      break;
    case 7: // bindi and jhumka
      if (!away) { ctx.fillStyle = '#E8177D'; ell(ctx, ex, ey - 9, 2.6, 2.6); ctx.fill(); }
      ctx.fillStyle = '#FFD84A'; ell(ctx, -21, cy + 2, 3, 4); ctx.fill(); ell(ctx, 21, cy + 2, 3, 4); ctx.fill(); break;
    case 8: // headphones
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, cy - 4, 21, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.fillStyle = '#14C4B4'; rr(ctx, -25, cy - 12, 9, 15, 4); ctx.fill(); rr(ctx, 16, cy - 12, 9, 15, 4); ctx.fill(); break;
    case 9: // round chashma
      if (!away) { ctx.strokeStyle = INK; ctx.lineWidth = 2; for (const d of [-8.5, 8.5]) { ctx.beginPath(); ctx.arc(ex + d, ey, 7.2, 0, TAU); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(ex - 1.3, ey - 1); ctx.lineTo(ex + 1.3, ey - 1); ctx.stroke(); }
      break;
  }
}

/* ---------- map art ---------- */
const THEMES = {
  aangan: { top: '#E9855A', top2: '#D8703F', side: '#8E3B1E', edge: '#F7B489', void: ['#1A0D33', '#3B1A5C'] },
  tapri: { top: '#E7C08A', top2: '#D9AD72', side: '#7A4A22', edge: '#FFE2B3', void: ['#120A2A', '#2D1856'] },
  papad: { top: '#F4C46A', top2: '#E8B04C', side: '#9A5B12', edge: '#FFE6A8', void: ['#3A1500', '#8A3A00'] },
  pankha: { top: '#F2EEE6', top2: '#E2DCD0', side: '#8A8478', edge: '#FFFFFF', void: ['#0F1630', '#22305A'] },
  king: { top: '#F6C443', top2: '#E8AE22', side: '#8F5A00', edge: '#FFE79A', void: ['#1B0730', '#4A1260'] }
};
function drawBackground(ctx, map, W, H) {
  const th = THEMES[map.theme] || THEMES.aangan;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.void[0]); g.addColorStop(1, th.void[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (map.theme === 'papad') {
    // hot oil kadhai
    const og = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.62); og.addColorStop(0, '#E07A10'); og.addColorStop(0.6, '#A84A05'); og.addColorStop(1, '#3A1500');
    ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,214,120,0.12)'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, 120 + i * 95, 0, TAU); ctx.stroke(); }
    return;
  }
  // stars
  for (let i = 0; i < 140; i++) { const x = hash(i) * W, y = hash(i + 99) * H, r = hash(i + 7) * 1.6 + 0.3; ctx.fillStyle = 'rgba(255,240,210,' + (0.25 + hash(i + 3) * 0.6).toFixed(2) + ')'; ell(ctx, x, y, r, r); ctx.fill(); }
  // moon
  ctx.fillStyle = 'rgba(255,236,190,0.9)'; ell(ctx, W * 0.86, H * 0.16, 34, 34); ctx.fill();
  ctx.fillStyle = th.void[0]; ell(ctx, W * 0.86 + 14, H * 0.16 - 8, 30, 30); ctx.fill();
  // skyline silhouettes
  ctx.fillStyle = 'rgba(10,4,24,0.55)';
  let x = 0; let i = 0;
  while (x < W) { const w = 40 + hash(i) * 70, h = 40 + hash(i + 50) * 120; ctx.fillRect(x, H - h, w, h); if (hash(i + 9) > 0.7) { ctx.beginPath(); ctx.arc(x + w / 2, H - h, w / 2.4, Math.PI, 0); ctx.fill(); } x += w + 4; i++; }
  ctx.fillStyle = 'rgba(255,196,90,0.5)';
  for (let k = 0; k < 90; k++) { const wx = hash(k + 300) * W, wy = H - hash(k + 400) * 140; ctx.fillRect(wx, wy, 3, 4); }
}
function slab(ctx, th, kind, f, thick = 30) {
  ctx.fillStyle = th.side;
  if (kind === 'rect') { rr(ctx, f.x, f.y + 8, f.w, f.h + thick - 8, 12); ctx.fill(); }
  else { ell(ctx, f.x, f.y + thick * 0.6, f.r, f.r * 0.98 + thick * 0.3); ctx.fill(); ctx.fillRect(f.x - f.r, f.y, f.r * 2, thick * 0.6); }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  if (kind === 'rect') { ctx.fillRect(f.x + 8, f.y + f.h + 6, f.w - 16, 4); }
  const g = kind === 'rect' ? ctx.createLinearGradient(0, f.y, 0, f.y + f.h) : ctx.createRadialGradient(f.x - f.r * 0.3, f.y - f.r * 0.3, 10, f.x, f.y, f.r);
  g.addColorStop(0, th.top); g.addColorStop(1, th.top2);
  ctx.fillStyle = g;
  if (kind === 'rect') { rr(ctx, f.x, f.y, f.w, f.h, 12); ctx.fill(); }
  else { ell(ctx, f.x, f.y, f.r, f.r); ctx.fill(); }
  ctx.strokeStyle = th.edge; ctx.lineWidth = 3;
  if (kind === 'rect') { rr(ctx, f.x + 2, f.y + 2, f.w - 4, f.h - 4, 10); ctx.stroke(); }
  else { ell(ctx, f.x, f.y, f.r - 3, f.r - 3); ctx.stroke(); }
}
function rangoli(ctx, x, y, r, cols, petals = 8) {
  ctx.save(); ctx.translate(x, y);
  for (let ring = 3; ring >= 1; ring--) {
    const rad = r * ring / 3; ctx.fillStyle = cols[ring % cols.length];
    for (let i = 0; i < petals * ring; i++) { const a = i * TAU / (petals * ring); ctx.save(); ctx.rotate(a); ell(ctx, rad * 0.72, 0, rad * 0.26, rad * 0.1 + 2); ctx.fill(); ctx.restore(); }
  }
  ctx.fillStyle = cols[0]; ell(ctx, 0, 0, r * 0.18, r * 0.18); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; for (let i = 0; i < petals * 2; i++) { const a = i * TAU / (petals * 2); ell(ctx, Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, 2.4, 2.4); ctx.fill(); }
  ctx.restore();
}
function drawMapStatic(ctx, map, W, H) {
  drawBackground(ctx, map, W, H);
  const th = THEMES[map.theme] || THEMES.aangan;
  for (const f of map.floors) slab(ctx, th, f.t, f, map.theme === 'pankha' || map.theme === 'king' ? 46 : 30);
  // surface detail
  ctx.save();
  if (map.theme === 'tapri' || map.theme === 'aangan') {
    for (const f of map.floors) { if (f.t !== 'rect') continue; ctx.save(); rr(ctx, f.x + 4, f.y + 4, f.w - 8, f.h - 8, 9); ctx.clip(); ctx.strokeStyle = 'rgba(120,60,20,0.18)'; ctx.lineWidth = 2; for (let yy = f.y + 28; yy < f.y + f.h; yy += 28) { ctx.beginPath(); ctx.moveTo(f.x, yy); ctx.lineTo(f.x + f.w, yy); ctx.stroke(); } for (let yy = f.y; yy < f.y + f.h; yy += 28) for (let xx = f.x + ((yy / 28) % 2) * 40; xx < f.x + f.w; xx += 80) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 28); ctx.stroke(); } ctx.restore(); }
  }
  if (map.theme === 'aangan') { rangoli(ctx, 800, 410, 74, ['#E8177D', '#FFC21A', '#14C4B4', '#FFFFFF']); rangoli(ctx, 400, 610, 44, ['#FFC21A', '#3D8BFF', '#FF4B4B']); rangoli(ctx, 1200, 610, 44, ['#14C4B4', '#E8177D', '#FFC21A']); }
  if (map.theme === 'pankha') { rangoli(ctx, 800, 470, 210, ['#E8177D', '#FFC21A', '#14C4B4', '#FF7A1A'], 10); }
  if (map.theme === 'king') { rangoli(ctx, 800, 470, 150, ['#E8177D', '#FFFFFF', '#9B5CFF', '#FF4B4B'], 12); ctx.strokeStyle = 'rgba(143,90,0,0.4)'; ctx.lineWidth = 4; ell(ctx, 800, 470, 300, 300); ctx.stroke(); }
  ctx.restore();
  if (map.finish) {
    const f = map.finish;
    ctx.save(); ctx.beginPath(); ctx.rect(f.x, f.y, f.w, f.h); ctx.clip();
    for (let yy = 0; yy < f.h / 20; yy++) for (let xx = 0; xx < f.w / 20; xx++) { ctx.fillStyle = (xx + yy) % 2 ? '#FFFFFF' : INK; ctx.fillRect(f.x + xx * 20, f.y + yy * 20, 20, 20); }
    ctx.restore();
  }
  for (const c of map.checkpoints || []) { flag(ctx, c.sx - 50, c.sy - 60); }
  for (const cv of map.conveyors) { ctx.fillStyle = 'rgba(28,11,51,0.28)'; rr(ctx, cv.x + 4, cv.y + 4, cv.w - 8, cv.h - 8, 8); ctx.fill(); }
}
function flag(ctx, x, y) { ctx.strokeStyle = '#5A3A1A'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.lineTo(x, y - 10); ctx.stroke(); ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 30, y - 2); ctx.lineTo(x, y + 6); ctx.fill(); }

/* Dynamic map pieces that move or change, drawn under the players. */
function drawMapDynamic(ctx, map, d, t) {
  const th = THEMES[map.theme] || THEMES.aangan, ulta = d.u;
  // conveyors: moving chevrons
  for (const cv of map.conveyors) {
    ctx.save(); rr(ctx, cv.x + 4, cv.y + 4, cv.w - 8, cv.h - 8, 8); ctx.clip();
    const dir = Math.sign(cv.vx || cv.vy) * (ulta ? -1 : 1), off = ((t * Math.abs(cv.vx || cv.vy) * (ulta ? 1.7 : 1)) % 40) * dir;
    ctx.strokeStyle = ulta ? 'rgba(232,23,125,0.75)' : 'rgba(255,255,255,0.42)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let x = cv.x - 40; x < cv.x + cv.w + 40; x += 40) { const xx = x + off; ctx.beginPath(); ctx.moveTo(xx + 10 * dir, cv.y + cv.h * 0.3); ctx.lineTo(xx - 6 * dir, cv.y + cv.h / 2); ctx.lineTo(xx + 10 * dir, cv.y + cv.h * 0.7); ctx.stroke(); }
    ctx.restore();
  }
  // tiles (papad)
  if (map.tiles && d.tl) {
    for (let i = 0; i < map.tiles.length; i++) {
      const tl = map.tiles[i], st = d.tl[i]; if (st === 'x') { const ft = d.tf && d.tf[i]; if (ft != null && t - ft < 0.9) papad(ctx, tl.x, tl.y + (t - ft) * 60, tl.r * (1 - (t - ft) / 0.9), 9, i, 1 - (t - ft) / 0.9); continue; }
      const k = st === '0' ? 0 : Number(st), shake = k ? Math.sin(t * 60 + i) * k * 0.35 : 0;
      papad(ctx, tl.x + shake, tl.y, tl.r, k, i, 1);
    }
  }
  // moving platforms (steel thalis)
  map.plats.forEach((p, i) => {
    const q = d.pl ? { x: d.pl[i][0], y: d.pl[i][1] } : Dhakka.platPos(p, t);
    ctx.fillStyle = 'rgba(10,4,24,0.35)'; rr(ctx, q.x + 6, q.y + 16, p.w, p.h, 30); ctx.fill();
    const g = ctx.createLinearGradient(q.x, q.y, q.x + p.w, q.y + p.h); g.addColorStop(0, '#F4F6FA'); g.addColorStop(0.5, '#B9C0CC'); g.addColorStop(1, '#E8ECF2');
    ctx.fillStyle = g; rr(ctx, q.x, q.y, p.w, p.h, 30); ctx.fill();
    ctx.strokeStyle = '#8D95A3'; ctx.lineWidth = 4; rr(ctx, q.x + 8, q.y + 8, p.w - 16, p.h - 16, 24); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ell(ctx, q.x + p.w * 0.32, q.y + p.h * 0.3, 14, 6, -0.6); ctx.fill();
  });
  // banana peels
  for (const pe of d.pe || []) peel(ctx, pe[0], pe[1]);
}
/* Pieces that stand up off the floor (bumpers, sweepers, walls, finish arch), drawn interleaved with players by depth. */
function tallPieces(map, d, t) {
  const list = [];
  map.bumpers.forEach((b, i) => { const q = d.bu ? { x: d.bu[i][0], y: d.bu[i][1] } : b.orbit ? Dhakka.orbitPos(b, t) : b; list.push({ y: q.y + b.r * 0.5, draw: ctx => (map.theme === 'king' ? dhol : kulhad)(ctx, q.x, q.y, b.r, t, (d.bump && d.bump[i]) || 0) }); });
  map.movers.forEach((m, i) => { const q = d.mv ? { x: d.mv[i][0], y: d.mv[i][1] } : Dhakka.platPos(m, t); list.push({ y: q.y + m.h, draw: ctx => crate(ctx, q.x, q.y, m.w, m.h) }); });
  map.sweepers.forEach((s, i) => { const a = d.sw ? d.sw[i] / 1000 : 0; list.push({ y: s.h > 200 ? 99999 : s.y - 999, draw: ctx => sweeper(ctx, map.theme, s, a, d.u) }); });
  if (map.finish) { const f = map.finish; list.push({ y: f.y + f.h + 1, draw: ctx => arch(ctx, f, t) }); }
  return list;
}
function papad(ctx, x, y, r, crack, seed, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = '#9A5B12'; ell(ctx, x, y + 6, r, r * 0.92); ctx.fill();
  const heat = crack / 9;
  ctx.fillStyle = heat ? `rgb(${244 - heat * 40 | 0},${196 - heat * 90 | 0},${106 - heat * 70 | 0})` : '#F4C46A';
  ell(ctx, x, y, r, r * 0.92); ctx.fill();
  ctx.fillStyle = 'rgba(176,104,24,0.35)';
  for (let k = 0; k < 7; k++) { const a = hash(seed * 13 + k) * TAU, rad = hash(seed * 7 + k) * r * 0.75; ell(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.9, 3 + hash(k + seed) * 4, 2.5 + hash(k + seed + 1) * 3); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.lineWidth = 2; ell(ctx, x, y, r - 4, r * 0.92 - 4); ctx.stroke();
  if (crack) {
    ctx.strokeStyle = 'rgba(60,20,0,' + (0.3 + heat * 0.6).toFixed(2) + ')'; ctx.lineWidth = 2.2;
    const n = 2 + Math.ceil(heat * 5);
    for (let k = 0; k < n; k++) { const a = hash(seed + k * 3.1) * TAU; ctx.beginPath(); ctx.moveTo(x, y); let px = x, py = y; for (let s = 1; s <= 3; s++) { px = x + Math.cos(a + (hash(k + s) - 0.5) * 0.6) * r * s / 3.2; py = y + Math.sin(a + (hash(k + s + 1) - 0.5) * 0.6) * r * s / 3.4; ctx.lineTo(px, py); } ctx.stroke(); }
  }
  ctx.restore();
}
function peel(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(10,4,24,0.3)'; ell(ctx, 2, 6, 20, 8); ctx.fill();
  ctx.fillStyle = '#FFD93B'; ctx.strokeStyle = '#8A6A00'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(i * TAU / 4 + 0.4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -6, 20, -2); ctx.quadraticCurveTo(12, 4, 0, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = '#6B4A00'; ell(ctx, 0, 0, 4, 4); ctx.fill();
  ctx.restore();
}
function kulhad(ctx, x, y, r, t, pulse) {
  const p = 1 + pulse * 0.18;
  ctx.fillStyle = 'rgba(10,4,24,0.35)'; ell(ctx, x + 4, y + r * 0.5, r * 1.05, r * 0.5); ctx.fill();
  ctx.fillStyle = '#8E3B1E'; rr(ctx, x - r * 0.9 * p, y - r * 0.9, r * 1.8 * p, r * 1.3, 10); ctx.fill();
  ctx.fillStyle = '#C8643A'; ell(ctx, x, y - r * 0.9, r * p, r * 0.55 * p); ctx.fill();
  ctx.fillStyle = '#7A3A10'; ell(ctx, x, y - r * 0.9, r * 0.8 * p, r * 0.42 * p); ctx.fill();
  ctx.fillStyle = '#D9A36A'; ell(ctx, x, y - r * 0.88, r * 0.7 * p, r * 0.34 * p); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y - r * 1.25); ctx.quadraticCurveTo(x + 4 + Math.sin(t * 3) * 4, y - r * 1.6, x - 2, y - r * 1.95); ctx.stroke();
}
function dhol(ctx, x, y, r, t, pulse) {
  const p = 1 + pulse * 0.18;
  ctx.fillStyle = 'rgba(10,4,24,0.35)'; ell(ctx, x + 4, y + r * 0.5, r * 1.1, r * 0.5); ctx.fill();
  ctx.fillStyle = '#B3122E'; rr(ctx, x - r * p, y - r * 1.1, r * 2 * p, r * 1.3, 12); ctx.fill();
  ctx.strokeStyle = '#FFD84A'; ctx.lineWidth = 3; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.4, y - r * 1.05); ctx.lineTo(x + i * r * 0.4 + r * 0.2, y + 0.15 * r); ctx.stroke(); }
  ctx.fillStyle = '#F3E3C0'; ell(ctx, x, y - r * 1.1, r * p, r * 0.5 * p); ctx.fill(); ctx.strokeStyle = '#7A4A22'; ctx.lineWidth = 4; ell(ctx, x, y - r * 1.1, r * p, r * 0.5 * p); ctx.stroke();
}
function crate(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,4,24,0.35)'; ctx.fillRect(x + 6, y + 10, w, h);
  ctx.fillStyle = '#6A4021'; ctx.fillRect(x, y - 18, w, h + 18);
  ctx.fillStyle = '#B57B4E'; ctx.fillRect(x, y - 18, w, 18);
  ctx.strokeStyle = '#3E220D'; ctx.lineWidth = 3; ctx.strokeRect(x, y - 18, w, h + 18);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
}
function sweeper(ctx, theme, s, a, ulta) {
  const high = s.h > 200, lift = high ? 70 : 34;
  for (let k = 0; k < s.arms; k++) {
    const ang = a + k * TAU / s.arms, ex = s.x + Math.cos(ang) * s.len, ey = s.y + Math.sin(ang) * s.len;
    // shadow on the floor
    ctx.strokeStyle = 'rgba(10,4,24,0.3)'; ctx.lineWidth = s.w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.x + 8, s.y + 8); ctx.lineTo(ex + 8, ey + 8); ctx.stroke();
  }
  for (let k = 0; k < s.arms; k++) {
    const ang = a + k * TAU / s.arms, ex = s.x + Math.cos(ang) * s.len, ey = s.y + Math.sin(ang) * s.len - lift;
    if (theme === 'pankha') {
      // wooden fan blade, widening outward
      const px = -Math.sin(ang), py = Math.cos(ang), w0 = s.w * 0.35, w1 = s.w * (high ? 0.8 : 1.2);
      ctx.fillStyle = high ? '#9AA3B5' : ulta ? '#E8177D' : '#8A5A2B'; ctx.strokeStyle = high ? '#5C6578' : '#4A2C10'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x + px * w0, s.y - lift + py * w0); ctx.lineTo(ex + px * w1, ey + py * w1); ctx.quadraticCurveTo(ex + Math.cos(ang) * 22, ey + Math.sin(ang) * 22, ex - px * w1, ey - py * w1); ctx.lineTo(s.x - px * w0, s.y - lift - py * w0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y - lift); ctx.lineTo(ex, ey); ctx.stroke();
    } else {
      // belan (rolling pin)
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#6A4021'; ctx.lineWidth = s.w + 6; ctx.beginPath(); ctx.moveTo(s.x, s.y - lift); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = ulta ? '#FF62B9' : '#D9A36A'; ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(s.x, s.y - lift); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y - lift - s.w * 0.25); ctx.lineTo(ex, ey - s.w * 0.25); ctx.stroke();
      ctx.fillStyle = '#4A2C10'; ell(ctx, ex, ey, s.w * 0.42, s.w * 0.42); ctx.fill();
    }
  }
  // hub
  ctx.fillStyle = theme === 'pankha' ? '#C9CED8' : '#4A2C10'; ell(ctx, s.x, s.y - lift, theme === 'pankha' ? 30 : 14, theme === 'pankha' ? 26 : 12); ctx.fill();
  ctx.fillStyle = theme === 'pankha' ? '#7D8596' : '#FFC21A'; ell(ctx, s.x, s.y - lift - 2, theme === 'pankha' ? 12 : 6, theme === 'pankha' ? 10 : 5); ctx.fill();
}
function arch(ctx, f, t) {
  const x0 = f.x + f.w / 2, top = f.y - 70;
  ctx.fillStyle = '#7A4A22'; ctx.fillRect(f.x - 6, f.y - 40, 12, f.h + 40); ctx.fillRect(f.x + f.w - 6, f.y - 40, 12, f.h + 40);
  ctx.fillStyle = '#E8177D'; rr(ctx, f.x - 30, top - 26, f.w + 60, 50, 12); ctx.fill();
  ctx.strokeStyle = '#FFC21A'; ctx.lineWidth = 3; rr(ctx, f.x - 26, top - 22, f.w + 52, 42, 10); ctx.stroke();
  ctx.fillStyle = '#FFF4DC'; ctx.font = '700 22px Shrikhand, "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Tapri', x0, top);
  for (let i = 0; i < 9; i++) { const k = i / 8, gx = f.x - 20 + k * (f.w + 40), gy = top + 30 + Math.sin(k * Math.PI) * 22 + Math.sin(t * 2 + i) * 2; ctx.fillStyle = i % 2 ? '#FF7A1A' : '#FFC21A'; ell(ctx, gx, gy, 8, 8); ctx.fill(); }
}
function crown(ctx, x, y, z, t, held) {
  ctx.save();
  if (!held) { ctx.fillStyle = 'rgba(10,4,24,0.3)'; ell(ctx, x, y + 4, 18, 7); ctx.fill(); }
  const yy = y - z - (held ? 0 : 18 + Math.sin(t * 4) * 4);
  ctx.translate(x, yy); ctx.rotate(Math.sin(t * 3) * 0.08);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 46); glow.addColorStop(0, 'rgba(255,216,74,0.55)'); glow.addColorStop(1, 'rgba(255,216,74,0)');
  ctx.fillStyle = glow; ell(ctx, 0, 0, 46, 46); ctx.fill();
  ctx.fillStyle = '#FFC21A'; ctx.strokeStyle = '#8F5A00'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-20, 10); ctx.lineTo(-22, -10); ctx.lineTo(-11, 0); ctx.lineTo(0, -18); ctx.lineTo(11, 0); ctx.lineTo(22, -10); ctx.lineTo(20, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#E8177D'; ell(ctx, 0, 3, 4, 4); ctx.fill(); ctx.fillStyle = '#14C4B4'; ell(ctx, -11, 5, 3, 3); ctx.fill(); ell(ctx, 11, 5, 3, 3); ctx.fill();
  ctx.restore();
}
/* Animated string lights across the top of the display. */
function bunting(ctx, W, t) {
  const cols = ['#E8177D', '#FFC21A', '#14C4B4', '#FF7A1A', '#9B5CFF'];
  for (let row = 0; row < 2; row++) {
    const y0 = 14 + row * 30, sag = 22;
    ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = 0; x <= W; x += 20) { const k = (x % 400) / 400; ctx.lineTo(x, y0 + Math.sin(k * Math.PI) * sag); } ctx.stroke();
    for (let x = 10 + row * 20; x < W; x += 40) {
      const k = (x % 400) / 400, y = y0 + Math.sin(k * Math.PI) * sag, on = (Math.floor(t * 3) + x / 40 + row) % 3 !== 0;
      ctx.fillStyle = cols[(x / 40 + row) % cols.length | 0]; ctx.globalAlpha = on ? 1 : 0.35;
      if (row === 0) { ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 16); ctx.closePath(); ctx.fill(); }
      else { ell(ctx, x, y + 4, 4, 5); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
}

window.DArt = { COLORS, LOOKS, INK, THEMES, drawBean, drawMapStatic, drawMapDynamic, tallPieces, crown, bunting, peel, star, rr, ell };
})();
