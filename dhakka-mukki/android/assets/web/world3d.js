/* Dhakka Mukki 3D world: builds every map from the engine's own map data (so physics and visuals always agree)
   as a bright toy-like diorama floating in the sky. World units = engine units. Engine (x, y, z) maps to (X, Z, Y). */
import * as THREE from './vendor/three.js';
const TAU = Math.PI * 2;

export const THEMES = {
  aangan: { sky: ['#6EC3FF', '#FFE1EE'], fog: '#FFD9EA', slabs: ['#FF8A5C', '#FFB347', '#5FD3C6'], side: '#C8553A', accent: '#E8177D' },
  tapri: { sky: ['#47A8FF', '#D2F1FF'], fog: '#D6EEFF', slabs: ['#3FD0BE', '#FF6FAE', '#FFC93C', '#9B7BFF', '#FF8A5C', '#6BD13B'], side: '#4B3A8F', accent: '#FFC21A' },
  papad: { sky: ['#FF8F4D', '#FFE4A6'], fog: '#FFD49A', slabs: ['#F4C46A'], side: '#9A5B12', accent: '#E8177D' },
  pankha: { sky: ['#8C7BFF', '#FFD0F2'], fog: '#F5D2F4', slabs: ['#FFFFFF'], side: '#7D6BD9', accent: '#14C4B4' },
  king: { sky: ['#FF7A5A', '#FFD86B'], fog: '#FFD3A0', slabs: ['#FFC93C'], side: '#B36B00', accent: '#E8177D' }
};

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function shade(hex, k) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, Math.min(1, hsl.s * (k > 1 ? 0.9 : 1.05)), Math.max(0, Math.min(1, hsl.l * k))); return '#' + c.getHexString(); }
function rangoli(x, cx, cy, r, cols, petals = 8) {
  x.save(); x.translate(cx, cy);
  for (let ring = 3; ring >= 1; ring--) {
    const rad = r * ring / 3; x.fillStyle = cols[ring % cols.length];
    for (let i = 0; i < petals * ring; i++) { x.save(); x.rotate(i * TAU / (petals * ring)); x.beginPath(); x.ellipse(rad * 0.72, 0, rad * 0.26, rad * 0.1 + 2, 0, 0, TAU); x.fill(); x.restore(); }
  }
  x.fillStyle = cols[0]; x.beginPath(); x.arc(0, 0, r * 0.18, 0, TAU); x.fill();
  x.fillStyle = '#FFFFFF'; for (let i = 0; i < petals * 2; i++) { const a = i * TAU / (petals * 2); x.beginPath(); x.arc(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.035, 0, TAU); x.fill(); }
  x.restore();
}
/* Slab top: bright base, darker painted border, soft diamond pattern. Mapped across the whole slab. */
function slabTexture(color, w, h, opts = {}) {
  const k = 1024 / Math.max(w, h), cw = Math.max(64, Math.round(w * k)), ch = Math.max(64, Math.round(h * k));
  return canvasTex(cw, ch, (x, W, H) => {
    x.fillStyle = color; x.fillRect(0, 0, W, H);
    const s = 56 * k;
    x.fillStyle = shade(color, 1.07);
    for (let yy = -s; yy < H + s; yy += s) for (let xx = -s; xx < W + s; xx += s) { if (((xx / s) + (yy / s)) % 2 === 0) { x.beginPath(); x.moveTo(xx + s / 2, yy); x.lineTo(xx + s, yy + s / 2); x.lineTo(xx + s / 2, yy + s); x.lineTo(xx, yy + s / 2); x.closePath(); x.fill(); } }
    const b = 14 * k; x.strokeStyle = shade(color, 0.8); x.lineWidth = b; x.strokeRect(b * 1.3, b * 1.3, W - b * 2.6, H - b * 2.6);
    x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = b * 0.35; x.setLineDash([b * 1.4, b * 1.1]); x.strokeRect(b * 2.6, b * 2.6, W - b * 5.2, H - b * 5.2); x.setLineDash([]);
    if (opts.rangoli) rangoli(x, W * opts.rangoli[0], H * opts.rangoli[1], opts.rangoli[2] * k, opts.cols || ['#E8177D', '#FFC21A', '#14C4B4', '#FFFFFF']);
    if (opts.grid) { x.strokeStyle = shade(color, 0.86); x.lineWidth = 3 * k; for (let yy = s * 0.5; yy < H; yy += s * 0.5) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); } }
  });
}
function discTexture(color, r, opts = {}) {
  return canvasTex(1024, 1024, (x, W) => {
    const k = W / (r * 2.1); x.fillStyle = color; x.fillRect(0, 0, W, W);
    x.save(); x.translate(W / 2, W / 2);
    for (let i = 0; i < 24; i++) { x.fillStyle = i % 2 ? shade(color, 1.06) : shade(color, 0.97); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, r * k, i * TAU / 24, (i + 1) * TAU / 24); x.fill(); }
    x.strokeStyle = shade(color, 0.78); x.lineWidth = 16; x.beginPath(); x.arc(0, 0, r * k - 22, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 6; x.setLineDash([22, 16]); x.beginPath(); x.arc(0, 0, r * k - 44, 0, TAU); x.stroke(); x.setLineDash([]);
    x.restore();
    if (opts.rangoli) rangoli(x, W / 2, W / 2, opts.rangoli * k, opts.cols, opts.petals || 10);
  });
}
const papadTex = () => canvasTex(256, 256, (x, W) => {
  const g = x.createRadialGradient(W * 0.4, W * 0.4, 10, W / 2, W / 2, W * 0.55); g.addColorStop(0, '#FFE3A0'); g.addColorStop(1, '#EDB24E');
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${150 + Math.random() * 40 | 0},${80 + Math.random() * 30 | 0},20,${0.18 + Math.random() * 0.25})`; x.beginPath(); x.ellipse(Math.random() * W, Math.random() * W, 2 + Math.random() * 7, 2 + Math.random() * 5, Math.random() * 3, 0, TAU); x.fill(); }
  for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(40,20,10,0.55)'; x.beginPath(); x.arc(Math.random() * W, Math.random() * W, 1.6, 0, TAU); x.fill(); }
});
const chevronTex = () => canvasTex(128, 128, (x, W) => {
  x.clearRect(0, 0, W, W); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 16; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(36, 22); x.lineTo(84, 64); x.lineTo(36, 106); x.stroke();
}, true);
function textTex(text, w, h, bg, fg, font) {
  return canvasTex(w, h, (x, W, H) => {
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#FFC21A'; x.lineWidth = 10; x.strokeRect(10, 10, W - 20, H - 20);
    x.font = font || `${H * 0.56}px Shrikhand, "Baloo 2", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = H * 0.08; x.strokeStyle = '#1C0B33'; x.strokeText(text, W / 2, H * 0.55); x.fillStyle = fg; x.fillText(text, W / 2, H * 0.55);
  });
}
const checkerTex = () => canvasTex(64, 64, (x) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#FFFFFF' : '#1C0B33'; x.fillRect(i * 16, j * 16, 16, 16); } }, true);
export function skyTexture(theme) {
  return canvasTex(16, 512, (x, W, H) => { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, theme.sky[0]); g.addColorStop(0.65, theme.sky[1]); g.addColorStop(1, theme.sky[1]); x.fillStyle = g; x.fillRect(0, 0, W, H); });
}

/* ---------- geometry helpers ---------- */
function roundRectShape(x, z, w, h, r) {
  const s = new THREE.Shape(), y = -z, hh = -h; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y - r); s.lineTo(x + w, y + hh + r); s.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
  s.lineTo(x + r, y + hh); s.quadraticCurveTo(x, y + hh, x, y + hh + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function slabMesh(shape, depth, topMat, sideMat) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 6, bevelSize: 6, bevelSegments: 3, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); g.translate(0, -depth, 0);
  const m = new THREE.Mesh(g, [topMat, sideMat]); m.receiveShadow = true; m.castShadow = true; return m;
}
function texForRect(tex, f) { tex.repeat.set(1 / f.w, 1 / f.h); tex.offset.set(-f.x / f.w, (f.y + f.h) / f.h); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; return tex; }
function texForCirc(tex, f) { const d = f.r * 2.1; tex.repeat.set(1 / d, 1 / d); tex.offset.set(-(f.x - d / 2) / d, (f.y + d / 2) / d); return tex; }
const M = (color, rough = 0.5, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra || {}));

/* ---------- world ---------- */
export function buildWorld(map, Dhakka) {
  const theme = THEMES[map.theme] || THEMES.aangan, root = new THREE.Group(), dyn = { sweepers: [], plats: [], movers: [], bumpers: [], conveyors: [], tiles: null, peels: [], crown: null, oil: null, clouds: [] };
  const depth = map.theme === 'pankha' || map.theme === 'king' ? 70 : 54;
  // floors
  map.floors.forEach((f, i) => {
    const col = theme.slabs[i % theme.slabs.length];
    let top, shape, tex;
    if (f.t === 'rect') {
      const opts = map.theme === 'aangan' ? { rangoli: [0.5, 0.36, 80] } : {};
      tex = texForRect(slabTexture(col, f.w, f.h, opts), f); shape = roundRectShape(f.x, f.y, f.w, f.h, 16);
    } else {
      const opts = map.theme === 'pankha' ? { rangoli: 200, cols: ['#E8177D', '#FFC21A', '#14C4B4', '#FF7A1A'], petals: 10 } : map.theme === 'king' ? { rangoli: 150, cols: ['#E8177D', '#FFFFFF', '#9B5CFF', '#FF4B4B'], petals: 12 } : {};
      tex = texForCirc(discTexture(col, f.r, opts), f); shape = new THREE.Shape(); shape.absarc(f.x, -f.y, f.r, 0, TAU, false);
    }
    top = M('#FFFFFF', 0.55, { map: tex });
    root.add(slabMesh(shape, depth, top, M(shade(theme.side, 1), 0.65)));
  });
  // underside glow ring for round arenas
  // papads (instanced)
  if (map.tiles) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 32);
    const tile = new THREE.InstancedMesh(g, [M('#D99A3A', 0.6), M('#FFFFFF', 0.5, { map: papadTex() }), M('#B87720', 0.7)], map.tiles.length);
    tile.castShadow = true; tile.receiveShadow = true; tile.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tile.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(map.tiles.length * 3).fill(1), 3);
    root.add(tile); dyn.tiles = { mesh: tile, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), fall: {} };
    // hot oil kadhai far below
    const oil = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), M('#E07A10', 0.15, { emissive: '#B84A00', emissiveIntensity: 0.55, metalness: 0.2 }));
    oil.rotation.x = -Math.PI / 2; oil.position.set(800, -520, 450); root.add(oil);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1400, 34, 12, 80), M('#8A4B22', 0.4, { metalness: 0.5 })); rim.rotation.x = Math.PI / 2; rim.position.copy(oil.position); root.add(rim);
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), M('#FFC46B', 0.2, { emissive: '#FF9A2E', emissiveIntensity: 0.6 }), 40);
    root.add(bubbles); dyn.oil = { bubbles, seeds: Array.from({ length: 40 }, () => [400 + Math.random() * 800 - 400 + 400, Math.random() * 900, Math.random() * 6, 8 + Math.random() * 18]), m4: new THREE.Matrix4() };
  }
  // conveyors
  map.conveyors.forEach(cv => {
    const t = chevronTex(); const dir = Math.sign(cv.vx || cv.vy);
    t.repeat.set(cv.w / 48 * (dir < 0 ? -1 : 1), cv.h / 48);
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 0.15, depthWrite: false });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(cv.w - 10, cv.h - 10), M('#3A2E6E', 0.5)); base.rotation.x = -Math.PI / 2; base.position.set(cv.x + cv.w / 2, 0.6, cv.y + cv.h / 2); base.receiveShadow = true; root.add(base);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(cv.w - 10, cv.h - 10), mat); p.rotation.x = -Math.PI / 2; p.position.set(cv.x + cv.w / 2, 1.2, cv.y + cv.h / 2); root.add(p);
    dyn.conveyors.push({ cv, tex: t, mat, speed: Math.abs(cv.vx || cv.vy) / 48 * (dir < 0 ? 1 : -1) });
  });
  // moving thalis
  map.plats.forEach(p => {
    const g = new THREE.Group();
    const steel = M('#E6EBF2', 0.22, { metalness: 0.85 });
    const s = slabMesh(roundRectShape(0, 0, p.w, p.h, 40), 18, steel, M('#AEB6C4', 0.3, { metalness: 0.8 })); g.add(s);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(p.w * 0.34, 4, 8, 40), M('#C9D0DC', 0.25, { metalness: 0.9 })); inner.rotation.x = Math.PI / 2; inner.position.set(p.w / 2, 1, p.h / 2); g.add(inner);
    root.add(g); dyn.plats.push({ g, p });
  });
  // crate pushers
  map.movers.forEach(m => {
    const tex = canvasTex(128, 256, (x, W, H) => { x.fillStyle = '#C8874E'; x.fillRect(0, 0, W, H); x.strokeStyle = '#7A4A22'; x.lineWidth = 12; x.strokeRect(6, 6, W - 12, H - 12); x.beginPath(); x.moveTo(6, 6); x.lineTo(W - 6, H - 6); x.moveTo(W - 6, 6); x.lineTo(6, H - 6); x.stroke(); });
    const b = new THREE.Mesh(new THREE.BoxGeometry(m.w, 80, m.h), M('#FFFFFF', 0.7, { map: tex })); b.castShadow = true; b.receiveShadow = true; root.add(b); dyn.movers.push({ b, m });
  });
  // bumpers: kulhad (clay chai cups) or dhol drums
  map.bumpers.forEach(bp => {
    const g = new THREE.Group(), r = bp.r;
    if (map.theme === 'king') {
      const stripes = canvasTex(256, 64, (x, W, H) => { x.fillStyle = '#D61F3C'; x.fillRect(0, 0, W, H); x.strokeStyle = '#FFD84A'; x.lineWidth = 8; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 26, 0); x.lineTo(i * 26 + 26, H); x.stroke(); } }, true);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 1.5, 32, 1, true), M('#FFFFFF', 0.45, { map: stripes })); body.position.y = r * 0.75; g.add(body);
      for (const y of [0, r * 1.5]) { const head = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 5, 32), M('#F6E7C6', 0.6)); head.position.y = y; g.add(head); const rimT = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, 3, 8, 32), M('#7A4A22', 0.5)); rimT.rotation.x = Math.PI / 2; rimT.position.y = y; g.add(rimT); }
    } else {
      const pts = [new THREE.Vector2(0.01, 0)]; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * (0.72 + 0.32 * t), t * r * 1.55)); }
      pts.push(new THREE.Vector2(r * 1.06, r * 1.6)); pts.push(new THREE.Vector2(r * 0.9, r * 1.6)); pts.push(new THREE.Vector2(r * 0.86, r * 1.0)); pts.push(new THREE.Vector2(0.01, r * 1.0));
      const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), M('#C8643A', 0.85)); g.add(cup);
      const chai = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 32), M('#C89062', 0.3)); chai.rotation.x = -Math.PI / 2; chai.position.y = r * 1.36; g.add(chai);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g); dyn.bumpers.push({ g, bp, pulse: 0 });
  });
  // sweepers
  map.sweepers.forEach((s, i) => {
    const g = new THREE.Group(), high = s.h > 200, theme3 = map.theme;
    for (let k = 0; k < s.arms; k++) {
      const arm = new THREE.Group(); arm.rotation.y = -k * TAU / s.arms; g.add(arm);
      if (theme3 === 'pankha') {
        if (high) {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(s.len, 96, s.w), M('#9AA3B5', 0.3, { metalness: 0.6 })); wall.position.set(s.len / 2, 48, 0); arm.add(wall);
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(s.len - 10, 12, s.w + 1), M('#E8177D', 0.4)); stripe.position.set(s.len / 2, 70, 0); arm.add(stripe);
        } else {
          const shape = new THREE.Shape(); shape.moveTo(30, -6); shape.lineTo(s.len - 10, -s.w * 0.75); shape.quadraticCurveTo(s.len + 12, 0, s.len - 10, s.w * 0.75); shape.lineTo(30, 6); shape.closePath();
          const bg = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, bevelSegments: 2 }); bg.rotateX(-Math.PI / 2);
          const blade = new THREE.Mesh(bg, M('#9A6235', 0.55)); blade.position.y = 28; arm.add(blade);
          const rod = new THREE.Mesh(new THREE.BoxGeometry(60, 5, 10), M('#7D8596', 0.3, { metalness: 0.7 })); rod.position.set(30, 32, 0); arm.add(rod);
        }
      } else {
        const L = s.arms === 2 ? s.len : s.len;
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(s.w / 2, s.w / 2, L * 0.86, 24), M('#E7B47A', 0.55)); pin.rotation.z = Math.PI / 2; pin.position.set(L * 0.5, s.w / 2 + 6, 0); arm.add(pin);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(s.w * 0.24, s.w * 0.24, L * 0.16, 12), M('#7A4A22', 0.5)); handle.rotation.z = Math.PI / 2; handle.position.set(L * 0.94, s.w / 2 + 6, 0); arm.add(handle);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(s.w * 0.34, 12, 10), M('#7A4A22', 0.5)); knob.position.set(L * 1.01, s.w / 2 + 6, 0); arm.add(knob);
      }
    }
    if (theme3 === 'pankha' && !high) {
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(52, 60, 44, 40), M('#C9CED8', 0.25, { metalness: 0.8 })); motor.position.y = 22; g.add(motor);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12, 0, TAU, 0, Math.PI / 2), M('#E8177D', 0.35)); cap.position.y = 44; g.add(cap);
    } else if (!high) { const hub = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 30, 20), M('#7A4A22', 0.5)); hub.position.y = 15; g.add(hub); }
    g.position.set(s.x, 0, s.y);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g); dyn.sweepers.push({ g, s });
  });
  // finish arch
  if (map.finish) {
    const f = map.finish, cx = f.x + f.w / 2, cz = f.y + f.h / 2;
    const ch = checkerTex(); ch.repeat.set(f.w / 20, f.h / 20);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), M('#FFFFFF', 0.6, { map: ch })); pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 0.8, cz); pad.receiveShadow = true; root.add(pad);
    for (const zz of [f.y - 8, f.y + f.h + 8]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 190, 16), M('#E8177D', 0.4)); post.position.set(cx, 95, zz); post.castShadow = true; root.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 30, f.h + 40), M('#E8177D', 0.4)); beam.position.set(cx, 186, cz); beam.castShadow = true; root.add(beam);
    const signM = M('#FFFFFF', 0.5, { map: textTex('Tapri', 512, 192, '#E8177D', '#FFF4DC') }), pinkM = M('#C80F69', 0.5);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(190, 72, 12), [pinkM, pinkM, pinkM, pinkM, signM, pinkM]); sign.position.set(cx, 240, cz + 10); sign.rotation.x = -0.35; sign.castShadow = true; root.add(sign);
    const garland = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(9, 1), M('#FFFFFF', 0.6), 15);
    for (let i = 0; i < 15; i++) { const t = i / 14, m4 = new THREE.Matrix4().makeTranslation(cx - 6, 150 - Math.sin(t * Math.PI) * 34, f.y - 8 + t * (f.h + 16)); garland.setMatrixAt(i, m4); garland.setColorAt(i, new THREE.Color(i % 2 ? '#FF7A1A' : '#FFC21A')); }
    root.add(garland);
  }
  for (const c of map.checkpoints || []) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 90, 8), M('#5A3A1A', 0.6)); pole.position.set(c.sx - 60, 45, c.sy - 70); pole.castShadow = true; root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(44, 28), M('#FF7A1A', 0.6, { side: THREE.DoubleSide })); flag.position.set(c.sx - 38, 76, c.sy - 70); root.add(flag);
  }
  // crown
  if (map.kind === 'crown') {
    const g = new THREE.Group(), gold = M('#FFC21A', 0.22, { metalness: 0.9, emissive: '#8A5A00', emissiveIntensity: 0.35 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(16, 14, 12, 24, 1, true), gold); band.material.side = THREE.DoubleSide; g.add(band);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6, sp = new THREE.Mesh(new THREE.ConeGeometry(4.5, 15, 8), gold); sp.position.set(Math.cos(a) * 15, 12, Math.sin(a) * 15); g.add(sp); const gem = new THREE.Mesh(new THREE.OctahedronGeometry(3, 0), M(i % 2 ? '#E8177D' : '#14C4B4', 0.1, { emissive: i % 2 ? '#E8177D' : '#14C4B4', emissiveIntensity: 0.5 })); gem.position.set(Math.cos(a) * 16.5, 2, Math.sin(a) * 16.5); g.add(gem); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const glowTex = canvasTex(128, 128, (x, W) => { const gr = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(255,220,90,0.9)'); gr.addColorStop(1, 'rgba(255,220,90,0)'); x.fillStyle = gr; x.fillRect(0, 0, W, W); });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(110, 110, 1); g.add(glow);
    root.add(g); dyn.crown = g;
  }
  // banana peel pool
  const peelGeo = new THREE.SphereGeometry(1, 10, 6), peelMat = M('#FFD93B', 0.5);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const leaf = new THREE.Mesh(peelGeo, peelMat); leaf.scale.set(14, 3, 6); leaf.position.set(Math.cos(k * TAU / 4) * 10, 3, Math.sin(k * TAU / 4) * 10); leaf.rotation.y = -k * TAU / 4; leaf.castShadow = true; g.add(leaf); }
    const stem = new THREE.Mesh(peelGeo, M('#6B4A00', 0.6)); stem.scale.set(5, 6, 5); stem.position.y = 5; g.add(stem);
    g.visible = false; root.add(g); dyn.peels.push(g);
  }
  // sky dressing: puffy clouds drifting below the arena, floating diyas around it
  const cloudMat = M('#FFFFFF', 0.95, { emissive: '#FFF1F8', emissiveIntensity: 0.25 });
  const puff = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(), n = 4 + (i % 3);
    for (let k = 0; k < n; k++) { const s = new THREE.Mesh(puff, cloudMat); const r = 60 + Math.random() * 70; s.scale.set(r, r * 0.6, r); s.position.set((k - n / 2) * 70 + Math.random() * 30, Math.random() * 30, Math.random() * 50); g.add(s); }
    const a = i / 14 * TAU, rad = 1100 + (i % 4) * 260;
    g.position.set(800 + Math.cos(a) * rad, -260 - (i % 5) * 90, 450 + Math.sin(a) * rad * 0.7);
    if (!map.tiles) root.add(g); dyn.clouds.push({ g, base: g.position.clone(), ph: Math.random() * TAU });
  }
  if (!map.tiles) for (let i = 0; i < 4; i++) { const g = new THREE.Group(); const s = new THREE.Mesh(puff, cloudMat); s.scale.set(260, 90, 200); g.add(s); g.position.set(300 + i * 360, -420, 300 + (i % 2) * 300); root.add(g); }
  const diyaG = new THREE.CylinderGeometry(10, 6, 12, 16), flameG = new THREE.ConeGeometry(5, 16, 12);
  const diyaM = M('#C8643A', 0.7), flameM = M('#FFB627', 0.3, { emissive: '#FF8A00', emissiveIntensity: 1.4 });
  dyn.diyas = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(diyaG, diyaM)); const fl = new THREE.Mesh(flameG, flameM); fl.position.y = 14; g.add(fl);
    const a = i / 10 * TAU + 0.3; g.position.set(800 + Math.cos(a) * 980, 60 + (i % 3) * 70, 450 + Math.sin(a) * 640); g.scale.setScalar(2.2);
    root.add(g); dyn.diyas.push({ g, y: g.position.y, ph: i });
  }
  return { root, dyn, theme };
}

/* Per-frame update of moving map parts from the interpolated snapshot. */
export function updateWorld(w, map, snap, T, tfTimes, Dhakka) {
  const d = w.dyn;
  d.sweepers.forEach((s, i) => { if (snap.sw) s.g.rotation.y = -(snap.sw[i] / 1000); });
  d.plats.forEach((p, i) => { const q = snap.pl ? { x: snap.pl[i][0], y: snap.pl[i][1] } : Dhakka.platPos(p.p, T); p.g.position.set(q.x, 0, q.y); });
  d.movers.forEach((m, i) => { const q = snap.mv ? { x: snap.mv[i][0], y: snap.mv[i][1] } : Dhakka.platPos(m.m, T); m.b.position.set(q.x + m.m.w / 2, 40, q.y + m.m.h / 2); });
  d.bumpers.forEach((b, i) => {
    const q = snap.bu ? { x: snap.bu[i][0], y: snap.bu[i][1] } : b.bp.orbit ? Dhakka.orbitPos(b.bp, T) : b.bp;
    b.pulse = Math.max(0, b.pulse - 0.06); const k = 1 + Math.sin(b.pulse * Math.PI) * 0.22;
    b.g.position.set(q.x, 0, q.y); b.g.scale.set(k, 1 / Math.sqrt(k), k);
  });
  d.conveyors.forEach(c => { c.tex.offset.x = (T * c.speed * (snap.u ? -1.7 : 1)) % 1; c.mat.color.set(snap.u ? '#FF62B9' : '#FFFFFF'); });
  if (d.tiles && map.tiles) {
    const t = d.tiles, str = snap.tl || '';
    map.tiles.forEach((tl, i) => {
      const s = str[i] || '0'; let y = -5, sc = 1, shake = 0;
      if (s === 'x') { const ft = tfTimes[i]; const age = ft != null ? T - ft : 9; if (age > 1.2) { sc = 0.0001; } else { y = -5 - age * age * 380; sc = 1 - age * 0.4; } }
      const k = s === 'x' ? 9 : s === '0' ? 0 : Number(s);
      if (k && s !== 'x') shake = Math.sin(T * 70 + i) * k * 0.35;
      t.v.set(tl.x + shake, y, tl.y); t.s.set(tl.r * sc, 10, tl.r * sc); t.q.identity();
      if (s === 'x') t.q.setFromEuler(new THREE.Euler(Math.sin(i) * 0.5 * (1 - sc), 0, Math.cos(i) * 0.5 * (1 - sc)));
      t.m4.compose(t.v, t.q, t.s); t.mesh.setMatrixAt(i, t.m4);
      const h = k / 9; t.c.setRGB(1, 1 - h * 0.45, 1 - h * 0.8); t.mesh.setColorAt(i, t.c);
    });
    t.mesh.instanceMatrix.needsUpdate = true; t.mesh.instanceColor.needsUpdate = true;
  }
  if (d.oil) { const o = d.oil; o.seeds.forEach((s, i) => { const ph = (T * 0.5 + s[2]) % 1, sc = Math.sin(ph * Math.PI) * s[3]; o.m4.makeScale(sc + 0.01, sc + 0.01, sc + 0.01).setPosition(s[0] + 200 * Math.sin(i), -515, s[1]); o.bubbles.setMatrixAt(i, o.m4); }); o.bubbles.instanceMatrix.needsUpdate = true; }
  d.peels.forEach((p, i) => { const pe = snap.pe && snap.pe[i]; p.visible = !!pe; if (pe) { p.position.set(pe[0], 0, pe[1]); p.rotation.y = i * 1.7; } });
  if (d.crown) {
    const c = snap.cr; d.crown.visible = !!c && c[3] < 0;
    if (c && c[3] < 0) { d.crown.position.set(c[0], c[2] + 26 + Math.sin(T * 4) * 5, c[1]); d.crown.rotation.y = T * 1.6; }
  }
  d.clouds.forEach(c => { c.g.position.x = c.base.x + Math.sin(T * 0.08 + c.ph) * 60; c.g.position.y = c.base.y + Math.sin(T * 0.3 + c.ph) * 10; });
  (d.diyas || []).forEach(dy => { dy.g.position.y = dy.y + Math.sin(T * 0.9 + dy.ph) * 18; dy.g.rotation.y = T * 0.3 + dy.ph; });
}
