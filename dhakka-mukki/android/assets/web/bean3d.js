/* Dhakka Mukki 3D characters: glossy toy "laddoo" beans with googly eyes, swinging arms and stepping feet.
   Pure geometry, no model files. Shared by the big-screen display and the phone previews.
   Coordinates: world units = engine units, Y up, a bean is ~60 tall. Local forward is +Z. */
import * as THREE from './vendor/three.js';
import * as SkeletonUtils from './vendor/jsm/utils/SkeletonUtils.js';

export const COLORS = [
  { name: 'Tamatar', fill: '#FF4B4B', dark: '#C42828' }, { name: 'Haldi', fill: '#FFC21A', dark: '#D38E00' },
  { name: 'Mirchi', fill: '#6BD13B', dark: '#3E9A1E' }, { name: 'Mor', fill: '#14C4B4', dark: '#078F84' },
  { name: 'Neela', fill: '#3D8BFF', dark: '#1F5BC9' }, { name: 'Baingan', fill: '#9B5CFF', dark: '#6A30D0' },
  { name: 'Gulabi', fill: '#FF62B9', dark: '#CC3287' }, { name: 'Chai', fill: '#C08452', dark: '#8A5428' },
  { name: 'Doodh', fill: '#F6F2EA', dark: '#BDB5A6' }, { name: 'Koyla', fill: '#4A4A63', dark: '#25253A' }
];
const TAU = Math.PI * 2;
const cache = new Map();
function mat(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }
const std = (color, rough = 0.42, extra = {}) => mat('s' + color + rough + JSON.stringify(extra), () => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra)));
const G = {};
function geo(key, make) { if (!G[key]) G[key] = make(); return G[key]; }

/* A bean silhouette that is fuller at the bottom, like a soft toy. */
function bodyGeometry() {
  return geo('body', () => {
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, y = t * 58, e = Math.pow(Math.abs(2 * t - 1), 2.2);
      const r = 22.5 * Math.pow(Math.max(0, 1 - e), 1 / 2.2) * (1 - 0.12 * t);
      pts.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    const g = new THREE.LatheGeometry(pts, 40, Math.PI, TAU); g.computeVertexNormals(); return g;
  });
}

function makeProcBean(colorIndex, look) {
  const c = COLORS[colorIndex] || COLORS[0];
  const root = new THREE.Group();            // positioned at the feet
  const core = new THREE.Group(); root.add(core);   // squash, lean and tumble pivot (at the feet)
  const body = new THREE.Mesh(bodyGeometry(), std(c.fill, 0.36));
  body.castShadow = true; body.receiveShadow = false; core.add(body);
  // face plate: a soft lighter oval where the eyes sit
  const eyes = new THREE.Group(); eyes.position.set(0, 40, 17.5); core.add(eyes);
  const white = std('#FFFFFF', 0.18), black = std('#160A26', 0.25);
  const eyeG = geo('eye', () => new THREE.SphereGeometry(6.4, 20, 14)), pupG = geo('pup', () => new THREE.SphereGeometry(3.1, 14, 10)), glintG = geo('glint', () => new THREE.SphereGeometry(1.05, 8, 6));
  const pupils = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeG, white); e.scale.set(1, 1.18, 0.62); e.position.set(sx * 7.6, 0, 0); eyes.add(e);
    const p = new THREE.Mesh(pupG, black); p.position.set(sx * 7.6, -0.6, 3.6); p.scale.set(1, 1.15, 0.6); eyes.add(p); pupils.push(p);
    const gl = new THREE.Mesh(glintG, white); gl.position.set(sx * 7.6 - 1.2, 1.4, 5.2); eyes.add(gl);
  }
  const mouth = new THREE.Mesh(geo('mouth', () => new THREE.TorusGeometry(3.6, 1.05, 8, 18, Math.PI)), black);
  mouth.position.set(0, 30.5, 21.2); mouth.rotation.set(0.25, 0, Math.PI); core.add(mouth);
  // cheeks
  const blush = std('#FF8FB0', 0.6, { transparent: true, opacity: 0.55 });
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(geo('blush', () => new THREE.SphereGeometry(3.2, 10, 8)), blush); b.scale.set(1, 0.6, 0.3); b.position.set(sx * 13, 32, 17.4); core.add(b); }
  // arms (pivot at the shoulder)
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 20.5, 30, 0); core.add(pivot);
    const a = new THREE.Mesh(geo('arm', () => new THREE.CapsuleGeometry(4.6, 10, 6, 12)), std(c.fill, 0.36));
    a.position.set(sx * 3.5, -7, 0); a.rotation.z = sx * 0.35; a.castShadow = true; pivot.add(a);
    arms.push(pivot);
  }
  // feet
  const feet = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(geo('foot', () => new THREE.SphereGeometry(7.5, 16, 10)), std(c.dark, 0.5));
    f.scale.set(1, 0.55, 1.35); f.position.set(sx * 9, 3.2, 2); f.castShadow = true; root.add(f); feet.push(f);
  }
  addLook(core, look, c);
  // stun stars
  const stars = new THREE.Group(); stars.position.y = 74; stars.visible = false; root.add(stars);
  const starM = std('#FFD84A', 0.3, { emissive: '#FFB000', emissiveIntensity: 0.6 });
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(geo('star', () => new THREE.OctahedronGeometry(4.2, 0)), starM); stars.add(s); }
  const st = { t: Math.random() * 10, sq: 0, sqv: 0, lastZ: 0, tumble: 0, spin: 0, face: 0 };
  root.userData = { core, body, eyes, pupils, arms, feet, stars, st, mouth, color: colorIndex, look };
  return root;
}

function addLook(core, look, c) {
  const top = 58, M = (col, r = 0.45, ex) => std(col, r, ex);
  const g = new THREE.Group(); core.add(g);
  const add = (geom, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  switch (look) {
    case 1: // topi
      add(geo('topi', () => new THREE.CylinderGeometry(13, 15.5, 11, 24, 1)), M('#FFFFFF', 0.7), 0, top - 2, -1, -0.12, 0, 0, 1, 1, 0.78);
      add(geo('topiRidge', () => new THREE.BoxGeometry(1.6, 1.6, 22)), M('#E9E4D8', 0.7), 0, top + 3.2, -1, -0.12); break;
    case 2: // pagdi
      for (let i = 0; i < 3; i++) add(geo('pagdi', () => new THREE.TorusGeometry(13.5, 5.2, 12, 28)), M(i % 2 ? '#FF9A3D' : '#FF6A00', 0.55), 0, top - 6 + i * 5, 0, Math.PI / 2 + (i - 1) * 0.12, 0, 0, 1 - i * 0.16, 1 - i * 0.16, 1);
      add(geo('jewel', () => new THREE.SphereGeometry(3.4, 14, 10)), M('#FFD84A', 0.2, { metalness: 0.6 }), 0, top - 2, 14.5); break;
    case 3: // gajra
      for (let i = 0; i < 11; i++) { const a = 0.15 + i / 10 * (Math.PI - 0.3); add(geo('flower', () => new THREE.IcosahedronGeometry(3.6, 1)), M(i % 2 ? '#FFFFFF' : '#FFB627', 0.5), Math.cos(a) * 17.5, 47 + Math.sin(a) * 11, 3); }
      break;
    case 4: // backwards cap
      add(geo('capDome', () => new THREE.SphereGeometry(16.5, 24, 12, 0, TAU, 0, Math.PI / 2)), M('#E8177D', 0.5), 0, top - 9, 0, 0, 0, 0, 1, 0.8, 1);
      add(geo('brim', () => new THREE.BoxGeometry(18, 2.2, 14)), M('#A40D55', 0.5), 0, top - 8, -16, -0.12); break;
    case 5: // shades
      for (const sx of [-1, 1]) add(geo('lens', () => new THREE.BoxGeometry(12, 8.5, 2.5)), M('#111018', 0.1, { metalness: 0.4 }), sx * 7.6, 40.5, 22.6, 0, sx * 0.12, 0);
      add(geo('bridge', () => new THREE.BoxGeometry(5, 1.6, 1.6)), M('#111018', 0.2), 0, 42, 23.2); break;
    case 6: // mooch
      for (const sx of [-1, 1]) add(geo('mooch', () => new THREE.CapsuleGeometry(2.6, 9, 4, 8)), M('#1A1020', 0.6), sx * 5.6, 32.2, 22.2, 0, 0, sx * 1.32);
      break;
    case 7: // bindi and jhumka
      add(geo('bindi', () => new THREE.SphereGeometry(1.9, 10, 8)), M('#E8177D', 0.3), 0, 49, 16.4);
      for (const sx of [-1, 1]) { add(geo('jhumka', () => new THREE.ConeGeometry(3, 5, 12)), M('#FFC21A', 0.2, { metalness: 0.7 }), sx * 21.8, 31, 3, Math.PI); add(geo('jbead', () => new THREE.SphereGeometry(1.8, 10, 8)), M('#E8177D', 0.2), sx * 21.8, 27.6, 3); }
      break;
    case 8: // headphones
      add(geo('band', () => new THREE.TorusGeometry(22, 2.2, 8, 30, Math.PI)), M('#1A1020', 0.4), 0, 40, -1);
      for (const sx of [-1, 1]) add(geo('cup', () => new THREE.CylinderGeometry(7, 7, 6, 20)), M('#14C4B4', 0.35), sx * 22.5, 39, -1, 0, 0, Math.PI / 2);
      break;
    case 9: // chashma
      for (const sx of [-1, 1]) add(geo('rim', () => new THREE.TorusGeometry(7.6, 1.1, 8, 24)), M('#2A1A10', 0.3, { metalness: 0.3 }), sx * 7.6, 40.5, 22.6, 0, sx * 0.1, 0);
      add(geo('bridge', () => new THREE.BoxGeometry(5, 1.6, 1.6)), M('#2A1A10', 0.3), 0, 42, 23.2); break;
  }
}

/* Per-frame pose. o: { x, y (engine y), z (height), vx, vy, face, stun, dash, slip, falling, dt, sqImpulse, alpha } */
function poseProcBean(bean, o) {
  const u = bean.userData, st = u.st, dt = o.dt || 0.016;
  st.t += dt;
  const speed = Math.hypot(o.vx || 0, o.vy || 0), run = Math.min(1, speed / 240), air = (o.z || 0) > 2;
  // squash spring driven by vertical motion
  const vz = (o.z - st.lastZ) / Math.max(dt, 1e-3); st.lastZ = o.z;
  if (o.sqImpulse) st.sqv += o.sqImpulse;
  st.sqv += (-140 * st.sq - 13 * st.sqv) * dt; st.sq += st.sqv * dt;
  const stretch = air ? Math.max(-0.18, Math.min(0.14, -vz / 4200)) : 0;
  const sq = Math.max(-0.35, Math.min(0.45, st.sq + stretch));
  u.core.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  // facing, with a little overshoot for life
  let d = (o.face || 0) - st.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; st.face += d * Math.min(1, dt * 16);
  bean.position.set(o.x, Math.max(-2000, o.z || 0), o.y);
  bean.rotation.y = Math.PI / 2 - st.face;
  const ph = st.t * (7 + speed * 0.028);
  const bob = air ? 0 : Math.abs(Math.sin(ph)) * 2.6 * run;
  u.core.position.y = bob;
  let lean = o.dash ? 0.62 : run * 0.16 + (air ? -0.1 : 0), roll = Math.sin(ph) * 0.06 * run;
  if (o.stun) { st.tumble += dt * 9; roll = Math.sin(st.tumble * 2.3) * 0.45; lean = Math.cos(st.tumble * 1.7) * 0.35 - 0.1; }
  if (o.slip) { st.spin += dt * 18; bean.rotation.y += st.spin; lean = -0.5; }
  if (o.falling) { st.tumble += dt * 7; lean = st.tumble; roll = st.tumble * 0.6; }
  u.core.rotation.set(lean, 0, roll);
  // arms swing, fly up in the air and flail when stunned
  const sw = Math.sin(ph) * 0.9 * run;
  u.arms[0].rotation.set(o.stun || o.falling ? Math.sin(st.t * 18) * 1.4 : air ? -2.3 : o.dash ? -1.4 : sw, 0, air ? -0.6 : 0);
  u.arms[1].rotation.set(o.stun || o.falling ? Math.cos(st.t * 18) * 1.4 : air ? -2.3 : o.dash ? -1.4 : -sw, 0, air ? 0.6 : 0);
  // feet step
  const fs = Math.sin(ph) * 7 * run;
  u.feet[0].position.set(-9, 3.2 + (air ? 2 : Math.max(0, Math.sin(ph)) * 3 * run), 2 + fs);
  u.feet[1].position.set(9, 3.2 + (air ? 2 : Math.max(0, -Math.sin(ph)) * 3 * run), 2 - fs);
  // eyes look where you go, and blink
  const blink = ((st.t + u.color) % 3.7) < 0.12 ? 0.12 : 1;
  u.eyes.scale.y = blink;
  const ex = Math.max(-1, Math.min(1, (o.vx || 0) / 400)) * 0;
  for (const p of u.pupils) { p.position.y = -0.6 + (air ? 1.4 : 0); p.position.x = Math.sign(p.position.x) * 7.6 + ex; }
  u.mouth.scale.set(o.dash || o.stun ? 0.8 : 1, o.dash || o.stun ? -1.3 : 1, 1);
  u.stars.visible = !!o.stun;
  if (o.stun) u.stars.children.forEach((s, i) => { const a = st.t * 5 + i * TAU / 3; s.position.set(Math.cos(a) * 20, Math.sin(st.t * 7 + i) * 3, Math.sin(a) * 20); s.rotation.y = st.t * 6; });
  const sc = (o.scale == null ? 1 : o.scale) * (o.big || 1); bean.scale.setScalar(sc);
}

export function lightRig(scene, strong = true) {
  const hemi = new THREE.HemisphereLight('#FFF4E6', '#8B6FC9', strong ? 1.25 : 1.5); scene.add(hemi);
  const key = new THREE.DirectionalLight('#FFF1DA', strong ? 2.6 : 2.2); key.position.set(-260, 700, 420); scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight('#BFD8FF', 0.7); fill.position.set(400, 300, -300); scene.add(fill);
  return { hemi, key, fill };
}

/* Portrait renderer for menus and phone previews. One hidden WebGL canvas, results cached as data URLs. */
let pr = null, USE_RENDERED = true;
export function useRenderedPortraits(v) { USE_RENDERED = v; }
export function portrait(colorIndex, look, size = 96) {
  if (USE_RENDERED) return portraitUrl(colorIndex, look);
  const key = colorIndex + ':' + look + ':' + size;
  if (pr && pr.cache.has(key)) return pr.cache.get(key);
  if (!pr) {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene(); lightRig(scene, false);
    const cam = new THREE.PerspectiveCamera(30, 1, 10, 1000); cam.position.set(46, 62, 150); cam.lookAt(0, 33, 0);
    pr = { renderer, scene, cam, cache: new Map() };
  }
  const k = 2; pr.renderer.setPixelRatio(1); pr.renderer.setSize(size * k, size * k, false);
  const b = makeBean(colorIndex, look); poseBean(b, { x: 0, y: 0, z: 0, face: Math.PI / 2 + 0.25, dt: 0 }); b.rotation.y = 0.32;
  pr.scene.add(b); pr.renderer.setClearColor(0x000000, 0); pr.renderer.render(pr.scene, pr.cam); pr.scene.remove(b);
  const url = pr.renderer.domElement.toDataURL('image/png'); pr.cache.set(key, url); return url;
}

/* A small spinning live preview (phones: join and lobby screens). Returns a stop() function. */
export function preview(canvas, colorIndex, look) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene(); const L = lightRig(scene, false); L.key.castShadow = true; L.key.shadow.mapSize.set(512, 512);
  Object.assign(L.key.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 2000 }); L.key.shadow.camera.updateProjectionMatrix();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(52, 56, 10, 40), new THREE.MeshStandardMaterial({ color: '#FFE3F1', roughness: 0.6 }));
  disc.position.y = -5; disc.receiveShadow = true; scene.add(disc);
  const cam = new THREE.PerspectiveCamera(30, 1, 10, 2000); cam.position.set(0, 80, 190); cam.lookAt(0, 30, 0);
  let bean = makeBean(colorIndex, look); scene.add(bean);
  let raf = 0, last = performance.now(), hop = 0, alive = true;
  const size = () => { const w = canvas.clientWidth || 160, h = canvas.clientHeight || 160; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size();
  let paused = false;
  const tick = now => {
    if (!alive || paused) return; raf = requestAnimationFrame(tick);
    if (canvas.clientWidth && Math.abs(canvas.width - Math.round(canvas.clientWidth * renderer.getPixelRatio())) > 2) size();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; hop += dt;
    if (bean.userData.glb) {
      const cyc = hop % 9; // idle, wave, then a little dance
      poseBean(bean, { x: 0, y: 0, z: 0, face: Math.PI / 2 + Math.sin(hop * 0.6) * 0.5, dt, wave: cyc > 2 && cyc < 3.2, dance: cyc > 5 });
    } else {
      const cyc = hop % 2.4, z = cyc < 0.6 ? Math.sin(cyc / 0.6 * Math.PI) * 26 : 0;
      poseBean(bean, { x: 0, y: 0, z, face: Math.PI / 2 + Math.sin(hop * 0.8) * 0.9, dt, sqImpulse: cyc < dt ? -6 : (cyc > 0.6 && cyc - dt <= 0.6) ? 12 : 0 });
    }
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(tick);
  return {
    set(c, l) { scene.remove(bean); bean = makeBean(c, l); scene.add(bean); },
    pause() { paused = true; cancelAnimationFrame(raf); },
    resume() { if (paused && alive) { paused = false; last = performance.now(); raf = requestAnimationFrame(tick); } },
    stop() { alive = false; cancelAnimationFrame(raf); renderer.dispose(); renderer.forceContextLoss(); }
  };
}
export { THREE };

/* ------------------------------------------------------------------ Blender-built character (bean.glb)
   A rigged, skinned bean with an animation library. Each player gets a skeleton clone, tinted materials and its own mixer. */
let GLB = null;
export function useCharacterAsset(gltf) { GLB = gltf || null; }
export function hasCharacterAsset() { return !!GLB; }
const ONE_SHOT = new Set(['Jump', 'Dive', 'Slip', 'Land', 'Wave']);
function makeGlbBean(colorIndex, look) {
  const c = COLORS[colorIndex] || COLORS[0];
  const outer = new THREE.Group(), model = SkeletonUtils.clone(GLB.scene);
  model.scale.setScalar(50); outer.add(model);
  let mouth = null;
  model.traverse(o => {
    // multi-material looks load as a Group named after the node, so visibility is set on any object
    const n = o.name;
    if (/^Look\d$/.test(n)) o.visible = n === 'Look' + look;
    if (/^Extra_/.test(n)) o.visible = false;
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    if (n === 'Mouth') mouth = o;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      if (!m) return m;
      const base = m.name.split('.')[0];
      if (base === 'Body' || base === 'ArmSkin') { const k = m.clone(); k.color.set(c.fill); return k; }
      if (base === 'Shoe') { const k = m.clone(); k.color.set(c.dark); return k; }
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const clip of GLB.animations) {
    const a = mixer.clipAction(clip); actions[clip.name] = a;
    if (ONE_SHOT.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
  }
  const stars = new THREE.Group(); stars.position.y = 92; stars.visible = false; outer.add(stars);
  const starM = new THREE.MeshStandardMaterial({ color: '#FFD84A', emissive: '#FFB000', emissiveIntensity: 0.7, roughness: 0.3 });
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(new THREE.OctahedronGeometry(5, 0), starM));
  const st = { t: Math.random() * 10, sq: 0, sqv: 0, lastZ: 0, face: 0, state: '', until: 0, air: false };
  outer.userData = { glb: true, model, mixer, actions, mouth, stars, st, color: colorIndex, look, arms: [], core: model };
  play(outer, 'Idle', 0);
  return outer;
}
function play(bean, name, fade = 0.14, speed = 1) {
  const u = bean.userData, a = u.actions[name]; if (!a) return;
  a.timeScale = speed;
  if (u.st.state === name) return;
  const prev = u.actions[u.st.state];
  a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
  if (prev && fade) a.crossFadeFrom(prev, fade, false); else if (prev) prev.stop();
  u.st.state = name;
}
function poseGlbBean(bean, o) {
  const u = bean.userData, st = u.st, dt = o.dt || 0.016;
  st.t += dt;
  const speed = Math.hypot(o.vx || 0, o.vy || 0), z = o.z || 0, air = z > 3;
  const vz = (z - st.lastZ) / Math.max(dt, 1e-3); st.lastZ = z;
  if (o.sqImpulse) st.sqv += o.sqImpulse;
  st.sqv += (-140 * st.sq - 13 * st.sqv) * dt; st.sq += st.sqv * dt;
  const sq = Math.max(-0.3, Math.min(0.35, st.sq));
  let d = (o.face || 0) - st.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; st.face += d * Math.min(1, dt * 16);
  bean.position.set(o.x, Math.max(-2000, z), o.y);
  bean.rotation.set(0, Math.PI / 2 - st.face, 0);
  const sc = (o.scale == null ? 1 : o.scale) * (o.big || 1);
  bean.scale.set(sc * (1 + sq * 0.4), sc * (1 - sq * 0.8), sc * (1 + sq * 0.4));
  // state machine
  let want = 'Idle', rate = 1;
  if (o.falling) want = 'Tumble';
  else if (o.slip) want = 'Slip';
  else if (o.stun) want = air ? 'Flail' : 'Stun';
  else if (o.dash) want = 'Dive';
  else if (o.dance) want = 'Dance';
  else if (o.celebrate) want = 'Celebrate';
  else if (air) want = vz > 60 && st.state !== 'Air' ? 'Jump' : 'Air';
  else if (st.air && !air) { want = 'Land'; st.until = st.t + 0.22; }
  else if (st.t < st.until && st.state === 'Land') want = 'Land';
  else if (o.wave && speed < 40) want = 'Wave';
  else if (speed > 30) { want = 'Run'; rate = Math.max(0.6, Math.min(1.7, speed / 250)); }
  if (want === 'Jump' && st.state === 'Jump' && u.actions.Jump && !u.actions.Jump.isRunning()) want = 'Air';
  st.air = air;
  play(bean, want, want === 'Land' || want === 'Dive' ? 0.06 : 0.14, rate);
  if (u.actions[want]) u.actions[want].timeScale = rate;
  u.mixer.update(dt);
  if (u.mouth && u.mouth.morphTargetDictionary) {
    const open = (o.stun || o.falling || o.dash || o.slip || air) ? 1 : 0, cur = u.mouth.morphTargetInfluences;
    const i = u.mouth.morphTargetDictionary.Open; if (i != null) cur[i] += (open - cur[i]) * Math.min(1, dt * 12);
  }
  u.stars.visible = !!o.stun;
  if (o.stun) u.stars.children.forEach((s, i) => { const a = st.t * 5 + i * TAU / 3; s.position.set(Math.cos(a) * 24, Math.sin(st.t * 7 + i) * 3, Math.sin(a) * 24); s.rotation.y = st.t * 6; });
}

export function makeBean(colorIndex, look) { return GLB ? makeGlbBean(colorIndex, look) : makeProcBean(colorIndex, look); }
export function poseBean(bean, o) { return bean.userData.glb ? poseGlbBean(bean, o) : poseProcBean(bean, o); }
/* Pre-rendered Cycles portraits ship with the game; this is the URL for a colour and look. */
export function portraitUrl(colorIndex, look) { return `/assets/ui/portraits/p${colorIndex}_${look}.webp`; }
