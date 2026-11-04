/* Dhakka Mukki high-quality world: every map rebuilt from the engine's map data with the Blender-built assets.
   Produces the same "dyn" structure as world3d.js so updateWorld() animates both. Engine (x, y, z) maps to (X, Z, Y). */
import * as THREE from './vendor/three.js';
import A, { prop, propMesh, SKIES } from './assets.js';
import { THEMES } from './world3d.js';
const TAU = Math.PI * 2;

const FLOOR = { aangan: 'terracotta', tapri: 'foam', papad: null, pankha: 'marble', king: 'gold' };
const TILE_WORLD = { foam: 380, terracotta: 520, marble: 900, gold: 420, wood: 500, belt: 160 };

function pbr(name, color, repeat, extra = {}) {
  const m = A.mats[name]; if (!m) return new THREE.MeshStandardMaterial({ color });
  const t = (x, cs) => { const k = x.clone(); k.needsUpdate = true; k.repeat.set(repeat, repeat); k.wrapS = k.wrapT = THREE.RepeatWrapping; return k; };
  const mat = new THREE.MeshStandardMaterial(Object.assign({ color, map: t(m.map), normalMap: t(m.normalMap), roughnessMap: t(m.orm), metalnessMap: name === 'gold' ? t(m.orm) : null, metalness: name === 'gold' ? 1 : 0, roughness: 1 }, extra));
  mat.normalScale.set(1.2, 1.2);
  return mat;
}
function roundRectShape(x, z, w, h, r) {
  const s = new THREE.Shape(), y = -z, hh = -h; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y - r); s.lineTo(x + w, y + hh + r); s.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
  s.lineTo(x + r, y + hh); s.quadraticCurveTo(x, y + hh, x, y + hh + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function slab(shape, depth, top, side) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 7, bevelSize: 7, bevelSegments: 4, curveSegments: 32 });
  g.rotateX(-Math.PI / 2); g.translate(0, -depth, 0);
  const m = new THREE.Mesh(g, [top, side]); m.receiveShadow = true; m.castShadow = true; return m;
}
function place(o, x, y, z, sx, sy, sz, ry = 0) { o.position.set(x, y, z); o.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); o.rotation.y = ry; return o; }
function decal(tex, x, z, size, y = 0.8) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; return m;
}

export function buildWorldHQ(map, Dhakka) {
  const theme = THEMES[map.theme] || THEMES.aangan, root = new THREE.Group();
  const dyn = { sweepers: [], plats: [], movers: [], bumpers: [], conveyors: [], tiles: null, peels: [], crown: null, oil: null, clouds: [], diyas: [], kites: [], ferris: null };
  const depth = map.theme === 'pankha' || map.theme === 'king' ? 70 : 54;
  const fl = FLOOR[map.theme];
  // ---- floors on floating rock islands
  map.floors.forEach((f, i) => {
    const col = fl === 'foam' ? theme.slabs[i % theme.slabs.length] : '#FFFFFF';
    const top = pbr(fl || 'foam', col, 1 / TILE_WORLD[fl || 'foam']);
    const side = pbr('foam', new THREE.Color(theme.side).lerp(new THREE.Color(col), 0.25), 1 / 260, { roughness: 1 });
    let shape;
    if (f.t === 'rect') {
      shape = roundRectShape(f.x, f.y, f.w, f.h, 18);
      const isl = prop('island_rect'); if (isl) root.add(place(isl, f.x - 4, -depth - 6, f.y + f.h + 4, f.w + 8, Math.min(f.w, f.h) * 0.9 + 60, f.h + 8));
    } else {
      shape = new THREE.Shape(); shape.absarc(f.x, -f.y, f.r, 0, TAU, false);
      const isl = prop('island_round'); if (isl) root.add(place(isl, f.x, -depth - 6, f.y, f.r * 1.02, f.r * 0.9, f.r * 1.02));
    }
    // world-space UVs: caps use (x, -z), so repeat and offset come from the tile size
    root.add(slab(shape, depth, top, side));
    if (fl === 'foam' && f.t === 'rect' && f.w > 120 && f.h > 120) {
      for (const [cx, cz] of [[f.x + 14, f.y + 14], [f.x + f.w - 14, f.y + 14], [f.x + 14, f.y + f.h - 14], [f.x + f.w - 14, f.y + f.h - 14]]) { const d = prop('diya'); if (d) root.add(place(d, cx, 0, cz, 34, 34, 34, Math.random() * TAU)); }
    }
    if (f.t === 'rect' && f.w > 140) { const g = prop('garland'); if (g) root.add(place(g, f.x + 6, -8, f.y + f.h + 9, f.w - 12, 110, 110)); }
  });
  if (A.decals.rangoli_a) {
    if (map.theme === 'aangan') { root.add(decal(A.decals.rangoli_a, 800, 410, 300)); root.add(decal(A.decals.rangoli_b, 400, 620, 150)); root.add(decal(A.decals.rangoli_c, 1200, 620, 150)); }
    if (map.theme === 'pankha') root.add(decal(A.decals.rangoli_c, 800, 470, 560, 1.0));
    if (map.theme === 'king') root.add(decal(A.decals.rangoli_a, 800, 470, 420, 1.0));
  }
  // ---- papads (instanced from the baked papad model)
  if (map.tiles) {
    const pm = propMesh('papad');
    const mesh = new THREE.InstancedMesh(pm.geometry, pm.material, map.tiles.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(map.tiles.length * 3).fill(1), 3);
    root.add(mesh);
    dyn.tiles = { mesh, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), uniform: true, y0: -3 };
    const oil = new THREE.Mesh(new THREE.CircleGeometry(1050, 72), new THREE.MeshStandardMaterial({ color: '#E07A10', roughness: 0.08, metalness: 0.3, emissive: '#B84A00', emissiveIntensity: 0.55 }));
    oil.rotation.x = -Math.PI / 2; oil.position.set(820, -430, 450); root.add(oil);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1050, 40, 16, 120), new THREE.MeshStandardMaterial({ color: '#2E2E38', roughness: 0.3, metalness: 0.9 })); rim.rotation.x = Math.PI / 2; rim.position.copy(oil.position); root.add(rim);
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: '#FFC46B', roughness: 0.15, emissive: '#FF9A2E', emissiveIntensity: 0.7 }), 60);
    root.add(bubbles); dyn.oil = { bubbles, y: -425, seeds: Array.from({ length: 60 }, () => [200 + Math.random() * 1200, Math.random() * 1000 - 50, Math.random() * 6, 8 + Math.random() * 22]), m4: new THREE.Matrix4() };
  }
  // ---- conveyors: rubber belt with scrolling chevrons
  map.conveyors.forEach(cv => {
    const dir = Math.sign(cv.vx || cv.vy);
    const beltM = pbr('belt', '#FFFFFF', 1, {}); beltM.map.repeat.set(cv.w / 160, cv.h / 160); beltM.normalMap.repeat.copy(beltM.map.repeat);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(cv.w - 10, cv.h - 10), beltM); base.rotation.x = -Math.PI / 2; base.position.set(cv.x + cv.w / 2, 0.7, cv.y + cv.h / 2); base.receiveShadow = true; root.add(base);
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,214,90,0.95)'; x.lineWidth = 16; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(36, 22); x.lineTo(84, 64); x.lineTo(36, 106); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(cv.w / 52 * (dir < 0 ? -1 : 1), cv.h / 52);
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, emissive: '#FFB000', emissiveIntensity: 0.35, emissiveMap: t });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(cv.w - 10, cv.h - 10), mat); p.rotation.x = -Math.PI / 2; p.position.set(cv.x + cv.w / 2, 1.4, cv.y + cv.h / 2); root.add(p);
    dyn.conveyors.push({ cv, tex: t, mat, speed: Math.abs(cv.vx || cv.vy) / 52 * (dir < 0 ? 1 : -1) });
  });
  // ---- steel thali platforms
  map.plats.forEach(p => {
    const g = new THREE.Group(), t = prop('thali');
    if (t) g.add(place(t, 0, 0, p.h, p.w, 120, p.h));
    root.add(g); dyn.plats.push({ g, p });
  });
  // ---- crate pushers
  map.movers.forEach(m => { const b = prop('crate') || new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); b.scale.set(m.w, 80, m.h); root.add(b); dyn.movers.push({ b, m }); });
  // ---- bumpers: clay kulhads, or dhol drums on the king map
  map.bumpers.forEach(bp => { const g = new THREE.Group(), k = prop(map.theme === 'king' ? 'dhol' : 'kulhad'); if (k) g.add(place(k, 0, 0, 0, bp.r)); root.add(g); dyn.bumpers.push({ g, bp, pulse: 0 }); });
  // ---- sweepers
  map.sweepers.forEach(s => {
    const g = new THREE.Group(), high = s.h > 200;
    if (map.theme === 'pankha') {
      for (let k = 0; k < s.arms; k++) {
        const arm = new THREE.Group(); arm.rotation.y = -k * TAU / s.arms; g.add(arm);
        if (high) { const w = prop('fan_wall'); if (w) arm.add(place(w, 0, 0, 0, s.len, 96, s.w / 0.2)); }
        else { const b = prop('fan_blade'); if (b) arm.add(place(b, 0, 26, 0, s.len, s.len * 0.7, s.len)); }
      }
      if (!high) { const m = prop('fan_motor'); if (m) g.add(place(m, 0, 0, 0, 62, 62, 62)); }
    } else {
      const r = s.w / 2, bl = prop('belan');
      if (s.arms === 2 && bl) g.add(place(bl, 0, r + 6, 0, s.len, r / 0.1, r / 0.1));
      else for (let k = 0; k < s.arms; k++) { const b2 = prop('belan'); if (b2) { const arm = new THREE.Group(); arm.rotation.y = -k * TAU / s.arms; arm.add(place(b2, s.len / 2, r + 6, 0, s.len / 2, r / 0.1, r / 0.1)); g.add(arm); } }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(14, 17, 34, 24), pbr('wood', '#B07040', 1 / 120)); hub.position.y = 17; hub.castShadow = true; g.add(hub);
    }
    g.position.set(s.x, 0, s.y); root.add(g); dyn.sweepers.push({ g, s });
  });
  // ---- finish: chequered pad and the chai tapri
  if (map.finish) {
    const f = map.finish, cx = f.x + f.w / 2, cz = f.y + f.h / 2;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#FFFFFF' : '#1C0B33'; x.fillRect(i * 16, j * 16, 16, 16); }
    const ch = new THREE.CanvasTexture(c); ch.colorSpace = THREE.SRGBColorSpace; ch.wrapS = ch.wrapT = THREE.RepeatWrapping; ch.repeat.set(f.w / 40, f.h / 40); ch.magFilter = THREE.NearestFilter;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshStandardMaterial({ map: ch, roughness: 0.5 })); pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 1.0, cz); pad.receiveShadow = true; root.add(pad);
    const tp = prop('tapri'); if (tp) root.add(place(tp, f.x + f.w + 80, -4, cz, 52, 52, 52, -Math.PI / 2));
    const g = prop('garland'); if (g) root.add(place(g, f.x - 4, 150, f.y - 6, 1, 1, 1));
    for (const zz of [f.y - 10, f.y + f.h + 10]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 170, 16), new THREE.MeshStandardMaterial({ color: '#E8177D', roughness: 0.35 })); post.position.set(f.x - 4, 85, zz); post.castShadow = true; root.add(post); }
    if (g) { g.scale.set(1, 70, 70); g.position.set(f.x - 4, 165, f.y - 10); g.rotation.y = -Math.PI / 2; g.scale.x = f.h + 20; }
  }
  for (const c of map.checkpoints || []) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 100, 8), new THREE.MeshStandardMaterial({ color: '#5A3A1A' })); pole.position.set(c.sx - 60, 50, c.sy - 70); pole.castShadow = true; root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(46, 30), new THREE.MeshStandardMaterial({ color: '#FF7A1A', side: THREE.DoubleSide })); flag.position.set(c.sx - 36, 84, c.sy - 70); root.add(flag);
  }
  // ---- mukut and peels
  if (map.kind === 'crown') {
    const g = new THREE.Group(), mk = prop('mukut'); if (mk) g.add(place(mk, 0, -6, 0, 22));
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,220,90,0.9)'); gr.addColorStop(1, 'rgba(255,220,90,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(120, 120, 1); g.add(glow);
    root.add(g); dyn.crown = g;
  }
  for (let i = 0; i < 8; i++) { const p = prop('peel') || new THREE.Group(); p.scale.setScalar(18); p.visible = false; root.add(p); dyn.peels.push(p); }
  // ---- sky dressing: clouds, sky lanterns, kites, distant islands and a Ferris wheel on the horizon
  for (let i = 0; i < 16; i++) {
    const c = prop('cloud'); if (!c) break;
    const a = i / 16 * TAU + Math.random() * 0.3, rad = 1250 + (i % 4) * 300, s = 120 + Math.random() * 140;
    place(c, 800 + Math.cos(a) * rad, -300 - (i % 5) * 110, 450 + Math.sin(a) * rad * 0.75, s, s * 0.8, s, Math.random() * TAU);
    if (!map.tiles) root.add(c); dyn.clouds.push({ g: c, base: c.position.clone(), ph: Math.random() * TAU });
  }
  for (let i = 0; i < 12; i++) {
    const l = prop('lantern'); if (!l) break; const a = i / 12 * TAU + 0.2;
    place(l, 800 + Math.cos(a) * 1050, 120 + (i % 4) * 70, 450 + Math.sin(a) * 700, 46); root.add(l); dyn.diyas.push({ g: l, y: l.position.y, ph: i });
  }
  for (let i = 0; i < 5; i++) {
    const k = prop('kite'); if (!k) break;
    place(k, 200 + i * 300, 380 + (i % 2) * 90, -260 - (i % 3) * 120, 90); k.rotation.z = (Math.random() - 0.5) * 0.6; root.add(k); dyn.kites.push({ g: k, base: k.position.clone(), ph: i * 1.7 });
  }
  for (let i = 0; i < 5; i++) {
    const isl = prop('island_round'); if (!isl) break;
    const a = Math.PI + 0.35 + i * 0.55, d = 1900 + (i % 2) * 400, s = 110 + (i % 3) * 50;
    const px = 800 + Math.cos(a) * d * 1.3, pz = 450 + Math.sin(a) * d * 0.55 - 500, py = -40 + (i % 3) * 70;
    root.add(place(isl, px, py, pz, s, s * 0.9, s));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 10, 40), new THREE.MeshStandardMaterial({ color: '#6BD13B', roughness: 0.9 })); top.position.set(px, py + 4, pz); root.add(top);
    const kd = prop(i % 2 ? 'kulhad' : 'lantern'); if (kd) root.add(place(kd, px, py + 8, pz, s * 0.35));
  }
  const fw = prop('ferris_wheel'), ff = prop('ferris_frame');
  if (fw && ff) {
    const g = new THREE.Group(); g.position.set(2900, -420, -2900); g.scale.setScalar(700); g.rotation.y = -0.5;
    ff.position.set(0, -1.15, 0); g.add(ff); const wheel = new THREE.Group(); wheel.add(fw); g.add(wheel); root.add(g);
    const isl = prop('island_round'); if (isl) root.add(place(isl, 1900, -800, -1400, 420, 380, 420));
    dyn.ferris = wheel;
  }
  return { root, dyn, theme, sky: A.skies[SKIES[map.theme]] };
}
