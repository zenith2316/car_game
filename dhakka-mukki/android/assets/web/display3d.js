/* Dhakka Mukki 3D renderer for the big screen (WebGL via three.js, bundled locally).
   display.js owns networking, interpolation, HUD and menus. This module only draws, and exposes window.DRender3D.
   Falls back to the 2D canvas renderer when WebGL is missing or ?gfx=2d is set. */
import * as THREE from './vendor/three.js';
import { makeBean, poseBean, portrait, lightRig, COLORS, useCharacterAsset } from './bean3d.js';
import { buildWorld, updateWorld, skyTexture, THEMES } from './world3d.js';
import { buildWorldHQ } from './worldhq.js';
import A, { loadAll } from './assets.js';

const params = new URLSearchParams(location.search);
/* The phone controller reuses this renderer with its own camera: DM3D_OPTS = { phone: true, follow: () => colour, offsetY: 0..0.4 }. */
const OPTS = window.DM3D_OPTS || {};
const TAU = Math.PI * 2, BIG = 1.0;
/* Party-brawler camera: a wider lens, a lower angle and close framing that follows the players, instead of a
   telephoto overview of the whole map. FOV is the play lens; EL_* are elevations above the floor in radians. */
const FOV = 42, EL_PLAY = 0.7, EL_OVER = 0.86;
function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }

function start() {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
  let quality = params.get('gfx') === 'low' || OPTS.phone ? 'low' : params.get('gfx') === 'high' ? 'high' : lowEnd ? 'low' : 'high';
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 20, 12000);
  const L = lightRig(scene, true);
  L.key.castShadow = true;
  Object.assign(L.key.shadow.camera, { left: -1150, right: 1150, top: 820, bottom: -820, near: 100, far: 4000 });
  L.key.shadow.bias = -0.0004; L.key.shadow.normalBias = 1.5;
  function applyQuality() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
    const n = quality === 'high' ? 2048 : 1024; L.key.shadow.mapSize.set(n, n); if (L.key.shadow.map) { L.key.shadow.map.dispose(); L.key.shadow.map = null; }
    resize();
  }
  // soft environment for glossy toy materials
  (() => {
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: { top: { value: new THREE.Color('#9FD4FF') }, bot: { value: new THREE.Color('#FFD1E6') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bot, top, h), 1.0); }'
    }));
    env.add(sky);
    const box = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), side: THREE.DoubleSide })); box.position.set(0, 40, 10); box.rotation.x = Math.PI / 2; env.add(box);
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 2.6), side: THREE.DoubleSide })); rim.position.set(-40, 10, -20); rim.lookAt(0, 0, 0); env.add(rim);
    scene.environment = pm.fromScene(env, 0.04).texture; scene.environmentIntensity = 0.6;
  })();

  let world = null, map = null, mapId = '', overview = { cx: 800, cz: 450, d: 2000, w: 1600, h: 900 };
  const beans = new Map(); let heldCrown = null;
  const cam = { tx: 800, ty: 0, tz: 450, d: 2000, yaw: 0, el: EL_OVER, shake: 0, punch: 0, fov: FOV, init: false };

  function dispose(obj) { obj.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); }); }
  let hq = false, lastDhakka = null, ownBackground = null;
  const envCache = new Map(), pmrem = new THREE.PMREMGenerator(renderer);
  function envFor(tex) { if (!envCache.has(tex)) envCache.set(tex, pmrem.fromEquirectangular(tex).texture); return envCache.get(tex); }
  function setMap(m, Dhakka) {
    lastDhakka = Dhakka || lastDhakka; Dhakka = lastDhakka;
    if (world) { scene.remove(world.root); if (!world.hq) dispose(world.root); }
    if (hq) {
      map = m; mapId = m.id; world = buildWorldHQ(m, Dhakka); world.hq = true; scene.add(world.root);
      if (ownBackground) { ownBackground.dispose(); ownBackground = null; }
      scene.background = world.sky || skyTexture(world.theme); scene.backgroundIntensity = 1.0;
      if (world.sky) { scene.environment = envFor(world.sky); scene.environmentIntensity = 0.85; L.hemi.intensity = 0.55; }
      scene.fog = new THREE.Fog(world.theme.fog, 3600, 9000);
      frameMap(m); return;
    }
    map = m; mapId = m.id; world = buildWorld(m, Dhakka); scene.add(world.root);
    const th = world.theme; if (ownBackground) ownBackground.dispose();
    ownBackground = scene.background = skyTexture(th); scene.fog = new THREE.Fog(th.fog, 3200, 7600);
    frameMap(m);
  }
  function frameMap(m) {
    // overview framing from the map's floor bounds
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    const grow = (a, b, c, d) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, d); };
    m.floors.forEach(f => f.t === 'rect' ? grow(f.x, f.x + f.w, f.y, f.y + f.h) : grow(f.x - f.r, f.x + f.r, f.y - f.r, f.y + f.r));
    (m.tiles || []).forEach(t => grow(t.x - t.r, t.x + t.r, t.y - t.r, t.y + t.r));
    m.plats.forEach(p => grow(Math.min(p.ax, p.bx), Math.max(p.ax, p.bx) + p.w, Math.min(p.ay, p.by), Math.max(p.ay, p.by) + p.h));
    overview = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, h: z1 - z0, d: 0 }; overview.d = fitDistance(overview.w + 120, overview.h + 120);
    if (heldCrown) { scene.remove(heldCrown); heldCrown = null; }
    if (world.dyn.crown) { heldCrown = world.dyn.crown.clone(); heldCrown.children = heldCrown.children.filter(c => !c.isSprite); heldCrown.scale.setScalar(0.85); heldCrown.visible = false; scene.add(heldCrown); }
    cam.init = false;
  }
  function fitDistance(w, h, el = cam.el) {
    const vf = FOV * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    return Math.max((w / 2) / Math.tan(hf / 2), (h * Math.sin(el) * 0.9 + 120) / Math.tan(vf / 2) * 0.62) * 1.04;
  }
  // frame a set of players closely: never tighter than a few body widths, never wider than the whole map
  function follow(players, padX, padZ) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of players) { x0 = Math.min(x0, p[1]); x1 = Math.max(x1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    const near = fitDistance(560, 300, EL_PLAY), far = fitDistance(overview.w + 120, overview.h + 120, EL_PLAY);
    return { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2 + 30, d: Math.max(near, Math.min(far, fitDistance(x1 - x0 + padX, z1 - z0 + padZ, EL_PLAY))) };
  }
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.aspect = w / h;
    const off = OPTS.offsetY ? OPTS.offsetY() : 0; if (off) camera.setViewOffset(w, h + 2 * off * h, 0, 2 * off * h, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix(); if (map) overview.d = fitDistance(overview.w + 120, overview.h + 120);
  }
  addEventListener('resize', resize);

  /* ---------- particles (instanced pools) ---------- */
  function pool(geom, material, cap) { const m = new THREE.InstancedMesh(geom, material, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = false; scene.add(m); const parts = []; const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < cap; i++) { m.setMatrixAt(i, zero); m.setColorAt(i, new THREE.Color(1, 1, 1)); } return { m, parts, cap, next: 0 }; }
  const puffs = pool(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.95, transparent: true, opacity: 0.8, depthWrite: false }), 240);
  const sparks = pool(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFB000', emissiveIntensity: 0.9, roughness: 0.3 }), 180);
  const confetti = pool(new THREE.BoxGeometry(1, 0.18, 0.62), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5, side: THREE.DoubleSide }), 420);
  const rings = []; for (let i = 0; i < 10; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false })); r.rotation.x = Math.PI / 2; r.visible = false; scene.add(r); rings.push({ r, age: 1, life: 1, size: 1 }); }
  const tmpC = new THREE.Color();
  function emit(P, o) { const i = P.next; P.next = (P.next + 1) % P.cap; P.parts[i] = Object.assign({ age: 0, life: 0.6, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 6, rot: Math.random() * TAU, vr: 0, grow: 0 }, o); P.m.setColorAt(i, tmpC.set(o.col || '#FFFFFF')); P.m.instanceColor.needsUpdate = true; }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  function stepPool(P, dt) {
    for (let i = 0; i < P.cap; i++) {
      const p = P.parts[i]; if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) { P.parts[i] = null; m4.makeScale(0, 0, 0); P.m.setMatrixAt(i, m4); continue; }
      p.vy -= p.g * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy *= p.drag ? dr : 1;
      p.x += p.vx * dt; p.y = Math.max(-900, p.y + p.vy * dt); p.z += p.vz * dt; p.rot += p.vr * dt;
      const k = p.age / p.life, sc = p.size * (p.grow ? (0.5 + k * p.grow) * (1 - k * k) : (1 - k * 0.7));
      e.set(p.rot, p.rot * 0.7, 0); q.setFromEuler(e); v.set(p.x, p.y, p.z); s3.set(sc, sc, sc); m4.compose(v, q, s3); P.m.setMatrixAt(i, m4);
    }
    P.m.instanceMatrix.needsUpdate = true;
  }
  function puff(x, y, z, n, col, spd = 70, size = 9) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; emit(puffs, { x, y: z + 4, z: y, vx: Math.cos(a) * spd * (0.4 + Math.random()), vz: Math.sin(a) * spd * (0.4 + Math.random()), vy: 20 + Math.random() * 40, drag: 3, life: 0.45 + Math.random() * 0.35, size: size * (0.6 + Math.random() * 0.6), grow: 1.4, col }); } }
  function spark(x, y, z, n) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 160 + Math.random() * 280; emit(sparks, { x, y: z + 30, z: y, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 120 + Math.random() * 220, g: 700, life: 0.5 + Math.random() * 0.2, size: 4 + Math.random() * 3, vr: 12, col: ['#FFD84A', '#FFFFFF', '#FF9A3D'][i % 3] }); } }
  const CONF = ['#E8177D', '#FFC21A', '#14C4B4', '#FF7A1A', '#9B5CFF', '#6BD13B', '#3D8BFF'];
  function burst(x, y, z, n, up = 520) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 60 + Math.random() * 260; emit(confetti, { x, y: z + 40, z: y, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: up * (0.5 + Math.random() * 0.7), g: 520, drag: 1.2, life: 2 + Math.random(), size: 9 + Math.random() * 6, vr: (Math.random() - 0.5) * 18, col: CONF[i % CONF.length] }); } }
  function ring(x, y, r, col, life = 0.55, h = 4) { const R = rings.find(o => o.age >= o.life) || rings[0]; Object.assign(R, { age: 0, life, size: r }); R.r.material.color.set(col); R.r.position.set(x, h, y); R.r.visible = true; }
  function stepRings(dt) { for (const R of rings) { if (R.age >= R.life) { R.r.visible = false; continue; } R.age += dt; const k = R.age / R.life, sc = R.size * (0.25 + k * 0.9); R.r.scale.set(sc, sc, 1 + k * 8); R.r.material.opacity = (1 - k) * 0.9; } }

  /* ---------- power-ups: anaar bombs, rocket boxes, rockets in flight ---------- */
  function inst(geom, mat, n) { const m = new THREE.InstancedMesh(geom, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; m.count = 0; scene.add(m); return m; }
  const bombGeo = new THREE.ConeGeometry(15, 30, 20); bombGeo.translate(0, 15, 0);
  const mines = inst(bombGeo, new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.45, emissive: '#FF3B1A', emissiveIntensity: 0.25 }), 16);
  const boxGeo = new THREE.BoxGeometry(34, 26, 34); boxGeo.translate(0, 13, 0);
  const boxes = inst(boxGeo, new THREE.MeshStandardMaterial({ color: '#FF7A1A', roughness: 0.4, emissive: '#FFB000', emissiveIntensity: 0.35 }), 8);
  const rocketGeo = new THREE.CylinderGeometry(5, 7, 38, 12); rocketGeo.rotateZ(Math.PI / 2);
  const rockets = inst(rocketGeo, new THREE.MeshStandardMaterial({ color: '#E8177D', roughness: 0.3, emissive: '#FF4B1A', emissiveIntensity: 0.6 }), 20);
  const sirenMat = new THREE.MeshStandardMaterial({ color: '#3D8BFF', emissive: '#3D8BFF', emissiveIntensity: 1 });
  const meRing = new THREE.Mesh(new THREE.RingGeometry(26, 34, 40), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, depthWrite: false }));
  meRing.rotation.x = -Math.PI / 2; meRing.visible = false; scene.add(meRing);
  const cB = new THREE.Color();
  function drawPowerups(snap, T, dt) {
    const mn = snap.mn || [], pu = snap.pu || [], pj = snap.pj || [];
    mines.count = Math.min(16, mn.length);
    for (let i = 0; i < mines.count; i++) {
      const [x, y, st] = mn[i], blink = st === 2 ? (Math.floor(T * 14) % 2) : st === 1 ? (Math.sin(T * 5 + i) > 0.6 ? 1 : 0) : 0, sc = st === 0 ? 0.7 : st === 2 ? 1.2 : 1;
      m4.compose(v.set(x, 0, y), q.identity(), s3.set(sc, sc, sc)); mines.setMatrixAt(i, m4); mines.setColorAt(i, cB.set(blink ? '#FFE36A' : st === 0 ? '#C9A8FF' : '#D61F3C'));
    }
    mines.instanceMatrix.needsUpdate = true; if (mines.instanceColor) mines.instanceColor.needsUpdate = true;
    boxes.count = Math.min(8, pu.length);
    for (let i = 0; i < boxes.count; i++) { const [x, y] = pu[i]; e.set(0, T * 1.6 + i, 0); q.setFromEuler(e); m4.compose(v.set(x, 10 + Math.sin(T * 3 + i) * 6, y), q, s3.set(1, 1, 1)); boxes.setMatrixAt(i, m4); }
    boxes.instanceMatrix.needsUpdate = true;
    rockets.count = Math.min(20, pj.length);
    for (let i = 0; i < rockets.count; i++) {
      const [x, y, vx, vy] = pj[i]; e.set(0, -Math.atan2(vy, vx), 0); q.setFromEuler(e); m4.compose(v.set(x, 40, y), q, s3.set(1, 1, 1)); rockets.setMatrixAt(i, m4);
      if (Math.random() < 0.7) emit(sparks, { x: x - vx * 0.03, y: 40, z: y - vy * 0.03, vx: (Math.random() - 0.5) * 60, vz: (Math.random() - 0.5) * 60, vy: 20, g: 120, life: 0.35, size: 4, col: Math.random() < 0.5 ? '#FFD84A' : '#FF7A1A' });
    }
    rockets.instanceMatrix.needsUpdate = true;
  }
  function boom(x, y, r) {
    puff(x, y, 0, 26, '#FFB04A', r * 1.6, 16); puff(x, y, 20, 14, '#6B5A70', r * 0.9, 20); spark(x, y, 10, 40); burst(x, y, 0, 24, 600);
    ring(x, y, r, '#FFD84A', 0.5, 10); ring(x, y, r * 0.7, '#FF4B1A', 0.4, 26);
    const near = !OPTS.follow || !lastFollow || Math.hypot(lastFollow.x - x, lastFollow.y - y) < 700;
    if (near) { cam.shake = Math.max(cam.shake, 26); cam.punch = Math.max(cam.punch, 1.2); }
  }

  /* ---------- characters ---------- */
  function beanFor(c, look) {
    let b = beans.get(c);
    if (!b || b.userData.look !== look) { if (b) { scene.remove(b); } b = makeBean(c, look); beans.set(c, b); scene.add(b); }
    return b;
  }
  function nearestBumper(x, y, snap) {
    if (!world) return; let best = null, bd = 1e9;
    world.dyn.bumpers.forEach((b, i) => { const p = snap && snap.bu ? { x: snap.bu[i][0], y: snap.bu[i][1] } : b.bp; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = b; } });
    if (best) best.pulse = 1;
  }
  const tf = {}; let lastSnap = {}, ultaFlash = 0, focusQ = null, lastFollow = null;
  function fx(f) {
    const [k, a, b, c] = f, bean = typeof c === 'number' ? beans.get(c) : null, col = typeof c === 'number' && COLORS[c] ? COLORS[c].fill : '#FFFFFF';
    const T = performance.now() / 1000;
    switch (k) {
      case 'j': puff(a, b, 0, 3, '#FFF4E6', 50, 6); if (bean) bean.userData.st.sqv -= 9; break;
      case 'l': puff(a, b, 0, 4, '#FFF4E6', 80, 7); if (bean) bean.userData.st.sqv += 15; break;
      case 'd': puff(a, b, 0, 3, '#FFFFFF', 120, 6); break;
      case 'h': spark(a, b, 0, 16); ring(a, b, 44, '#FFD84A', 0.35, 40); cam.shake = Math.max(cam.shake, 10); cam.punch = Math.max(cam.punch, 0.6); break;
      case 'b': nearestBumper(a, b, lastSnap); spark(a, b, 30, 3); break;
      case 'f': puff(a, b, -20, 12, '#FFFFFF', 160, 12); ring(a, b, 60, '#FFFFFF', 0.6); break;
      case 'q': { const pos = beanPos(a); if (pos) { burst(pos.x, pos.y, 0, 70); focusQ = { x: pos.x, y: pos.y, until: T + 1.2 }; } cam.punch = 1; break; }
      case 'k': puff(a, b, 0, 6, '#FFE36A', 60, 7); break;
      case 's': ring(a, b, 40, '#FFD93B', 0.4); spark(a, b, 0, 6); break;
      case 'w': ring(a, b, 230, '#9B5CFF', 0.6, 10); ring(a, b, 160, '#E8177D', 0.45, 20); puff(a, b, 0, 26, '#C9A8FF', 260, 14); cam.shake = 22; cam.punch = 1; break;
      case 'u': ultaFlash = 1; break;
      case 'c': puff(a, b, 0, 16, '#F4C46A', 140, 9); break;
      case 'tf': { tf[a] = T; const t = map && map.tiles && map.tiles[a]; if (t) puff(t.x, t.y, 0, 6, '#E8B04C', 80, 7); break; }
      case 'r': { const pos = beanPos(a); if (pos) { ring(pos.x, pos.y, 40, '#FFFFFF', 0.5); spark(pos.x, pos.y, 100, 8); } break; }
      case 'x': boom(a, b, c || 160); break;
      case 'fr': spark(a, b, 30, 10); puff(a, b, 20, 5, '#FFE6C2', 90, 7); break;
      case 'mf': spark(a, b, 10, 8); break;
      case 'pk': { const pos = beanPos(a); if (pos) { ring(pos.x, pos.y, 50, '#FF7A1A', 0.45, 30); spark(pos.x, pos.y, 50, 10); } break; }
      case 'ko': { const pos = beanPos(a); if (pos) { ring(pos.x, pos.y, 60, '#9B5CFF', 0.6, 20); spark(pos.x, pos.y, 80, 14); } cam.punch = Math.max(cam.punch, 0.8); break; }
      case 'wk': { const pos = beanPos(a); if (pos) ring(pos.x, pos.y, 40, '#FFFFFF', 0.5); break; }
      case 'tg': { const pos = beanPos(a); if (pos) { ring(pos.x, pos.y, 70, '#3D8BFF', 0.6, 20); spark(pos.x, pos.y, 60, 14); } break; }
      case 'g': { const pos = beanPos(a); if (pos) { spark(pos.x, pos.y, 60, 18); ring(pos.x, pos.y, 70, '#FFC21A', 0.5, 60); } cam.punch = 0.8; break; }
      case 'go': cam.punch = 1.2; break;
    }
  }
  function beanPos(c) { const p = (lastSnap.p || []).find(x => x[0] === c); return p ? { x: p[1], y: p[2] } : null; }

  /* ---------- podium ---------- */
  let podium = null;
  function numTex(n, col) { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 256, 256); x.font = '190px Shrikhand, "Baloo 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 16; x.strokeStyle = 'rgba(28,11,51,0.85)'; x.strokeText(n, 128, 140); x.fillStyle = '#FFFFFF'; x.fillText(n, 128, 140); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
  function ensurePodium(r) {
    const ids = (r.podium || []).join();
    if (podium && podium.ids === ids) return podium;
    if (podium) { scene.remove(podium.g); dispose(podium.g); }
    const g = new THREE.Group(), steps = [[0, 100, '#FFC21A'], [-150, 70, '#C9D3E0'], [150, 46, '#E0915A']], winners = [];
    steps.forEach(([dx, h, col], i) => {
      const side = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.25 }), front = new THREE.MeshStandardMaterial({ map: numTex(String(i + 1), col), roughness: 0.4 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(130, h, 110), [side, side, side, side, front, side]); box.position.set(800 + dx, h / 2, 520); box.castShadow = box.receiveShadow = true; g.add(box);
      const p = r.players.find(x => x.id === (r.podium || [])[i]);
      if (p) { const b = makeBean(p.color, p.look); b.userData.base = { x: 800 + dx, y: 520, z: h, rank: i }; g.add(b); winners.push(b); }
    });
    scene.add(g); podium = { g, ids, winners, colors: (r.podium || []).map(id => (r.players.find(x => x.id === id) || {}).color) }; return podium;
  }

  /* ---------- camera director ---------- */
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function direct(o, dt, T) {
    const r = o.room, ph = r ? r.phase : 'lobby', age = o.phaseAge || 0;
    let tx = overview.cx, tz = overview.cz, d = overview.d, yaw = Math.sin(T * 0.12) * 0.06, el = EL_OVER;
    const players = (lastSnap.p || []).filter(p => !(p[8] & (2 | 4 | 8)));
    if (ph === 'intro') {
      const k = ease(Math.min(1, age / 5.5));
      let sx = overview.cx, sz = overview.cz; if (map && map.kind === 'race' && map.spawns) { sx = map.spawns.reduce((s, p) => s + p[0], 0) / map.spawns.length; sz = map.spawns.reduce((s, p) => s + p[1], 0) / map.spawns.length; }
      tx = sx + (overview.cx - sx) * k; tz = sz + (overview.cz - sz) * k; d = overview.d * (0.42 + 0.58 * k); yaw = -0.9 * (1 - k); el = 0.5 + (EL_OVER - 0.5) * k;
    } else if (['countdown', 'play', 'lobby', 'choose'].includes(ph) && players.length) {
      // follow the pack up close; a race looks a little ahead along the course
      const f = follow(players, 340, 260); tx = f.tx; tz = f.tz; d = f.d; el = EL_PLAY; yaw = Math.sin(T * 0.12) * 0.04;
      if (map && map.kind === 'race') tx += 70;
      if (ph === 'countdown') d *= 1.06;
      if (focusQ && T < focusQ.until) { tx += (focusQ.x - tx) * 0.35; tz += (focusQ.y - tz) * 0.35; d *= 0.9; }
    } else if (ph === 'roundEnd') { yaw = Math.sin(age * 0.35) * 0.25; d = overview.d * 0.82; }
    else if (['panchayat', 'reveal', 'scores'].includes(ph)) { yaw = T * 0.05 % TAU; d = overview.d * 0.95; el = 0.78; }
    else if (ph === 'finished') { tx = 800; tz = 520; d = overview.d * 0.98; el = 0.36; yaw = Math.sin(T * 0.25) * 0.14; }
    // phone camera: the same angle and height as the big screen's close shot, centred on your own character
    let snappy = false;
    if (OPTS.follow && ['lobby', 'countdown', 'play', 'roundEnd'].includes(ph)) {
      const me = (lastSnap.p || []).find(p => p[0] === OPTS.follow());
      if (me && !(me[8] & 4)) {
        if (!(me[8] & 2)) lastFollow = { x: me[1] + me[4] * 0.25, y: me[2] + me[5] * 0.25 };
        tx = lastFollow.x; tz = lastFollow.y + 30; el = EL_PLAY; yaw = 0; snappy = true;
        const vf = FOV * Math.PI / 180; d = (420 * Math.sin(EL_PLAY) * 0.9 + 120) / Math.tan(vf / 2) * 0.66 * (camera.aspect < 1 ? 1.5 : 1);
        if (focusQ) focusQ = null;
      }
    }
    const k = cam.init ? 1 - Math.exp(-dt * (ph === 'intro' ? 6 : snappy ? 5 : 2.4)) : 1; cam.init = true;
    cam.tx += (tx - cam.tx) * k; cam.tz += (tz - cam.tz) * k; cam.d += (d - cam.d) * k; cam.el += (el - cam.el) * k;
    let dy = yaw - cam.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU; cam.yaw += dy * k;
    cam.shake *= Math.exp(-dt * 8); cam.punch *= Math.exp(-dt * 5);
    const sh = cam.shake, ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    const fy = ph === 'finished' ? 150 : 0;
    camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.cos(cam.el) * cam.d + ox, fy + Math.sin(cam.el) * cam.d + oy, cam.tz + Math.cos(cam.yaw) * Math.cos(cam.el) * cam.d);
    camera.lookAt(cam.tx + ox * 0.3, fy, cam.tz);
    const fov = FOV - cam.punch * 2.6; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    L.key.target.position.set(cam.tx, 0, cam.tz); L.key.position.set(cam.tx - 420, 1300, cam.tz + 640);
  }

  /* ---------- frame ---------- */
  let fpsAcc = 0, fpsN = 0, slow = 0;
  function render(o) {
    const dt = o.dt, T = o.T, r = o.room, snap = o.cur || {};
    lastSnap = snap;
    if (quality === 'high') { fpsAcc += dt; fpsN++; if (fpsN >= 90) { if (fpsAcc / fpsN > 1 / 38) slow++; else slow = 0; if (slow >= 2) { quality = 'low'; applyQuality(); } fpsAcc = 0; fpsN = 0; } }
    if (!world) return;
    updateWorld(world, map, snap, T, tf, o.Dhakka);
    const fin = r && r.phase === 'finished' ? ensurePodium(r) : null;
    if (podium) podium.g.visible = !!fin;
    const seen = new Set();
    for (const p of snap.p || []) {
      const [c, x, y, z, vx, vy, f, stun, fl] = p, pl = r && r.players.find(q => q.color === c);
      const b = beanFor(c, pl ? pl.look : 0); seen.add(c);
      const hide = (fl & 4) || !!fin;
      b.visible = !hide && !((fl & 32) && Math.floor(T * 12) % 2);
      if (hide) continue;
      const falling = !!(fl & 2);
      const em = o.emotes && o.emotes.get(c);
      poseBean(b, { x, y, z: falling ? z * 1.4 : z, vx, vy, face: f / 100, stun: stun > 0, dash: fl & 1, slip: fl & 64, falling, dt, big: BIG, scale: falling ? Math.max(0.2, 1 + z / 700) : 1, celebrate: !!(fl & 8), wave: !!(em && em.until > o.now) });
      if ((fl & 8) && !b.userData.glb) { b.userData.core.position.y = Math.abs(Math.sin(T * 6 + c)) * 14; b.userData.arms.forEach((a, i) => { a.rotation.x = -2.6 + Math.sin(T * 10 + i * 3) * 0.4; }); }
      // police wear a flashing siren; fainted boxers lie dizzy (stun stars come from the pose)
      let siren = b.userData.siren;
      if ((fl & 512) && !siren) { siren = b.userData.siren = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), sirenMat); b.add(siren); }
      if (siren) { siren.visible = !!(fl & 512); siren.position.set(0, (b.userData.glb ? 74 : 92), 0); siren.scale.setScalar(Math.floor(T * 6) % 2 ? 1.25 : 0.9); }
      if (fl & 256) { b.rotation.z = Math.PI / 2 * 0.9; b.position.y = 6; } else b.rotation.z = 0;
      if (OPTS.follow && c === OPTS.follow()) { meRing.visible = true; meRing.position.set(x, 2 + Math.max(0, z) * 0, y); meRing.material.color.set(COLORS[c] ? COLORS[c].fill : '#FFFFFF'); const k = 1 + Math.sin(T * 5) * 0.08; meRing.scale.set(k, k, k); }
      if (fl & 16 && heldCrown) { heldCrown.visible = true; heldCrown.position.set(x, z + 86 + Math.sin(T * 5) * 2, y); heldCrown.rotation.y = T * 2; }
    }
    if (heldCrown && !(snap.p || []).some(p => p[8] & 16)) heldCrown.visible = false;
    if (OPTS.follow && !(snap.p || []).some(p => p[0] === OPTS.follow() && !(p[8] & 6))) meRing.visible = false;
    drawPowerups(snap, T, dt);
    for (const [c, b] of beans) if (!seen.has(c)) b.visible = false;
    if (fin) fin.winners.forEach(b => { const bs = b.userData.base, cyc = (T * 1.3 + bs.rank * 0.4) % 1, hop = bs.rank === 0 ? Math.sin(cyc * Math.PI) * 34 : Math.sin(cyc * Math.PI) * 16; if (b.userData.glb) { poseBean(b, { x: bs.x, y: bs.y, z: bs.z, face: Math.PI / 2 + Math.sin(T * 0.8 + bs.rank) * 0.3, dt, big: 1.6, dance: bs.rank === 0, celebrate: bs.rank > 0 }); return; } poseBean(b, { x: bs.x, y: bs.y, z: bs.z + hop, face: Math.PI / 2, dt, big: 1.6 }); b.userData.arms.forEach((a, i) => { a.rotation.x = -2.7 + Math.sin(T * 9 + i * 2) * 0.35; }); });
    if (fin && Math.random() < dt * 3) burst(600 + Math.random() * 400, 420 + Math.random() * 120, 220, 18, 300);
    ultaFlash = Math.max(0, ultaFlash - dt * 1.5);
    renderer.toneMappingExposure = 1.08 + ultaFlash * 0.25;
    direct(o, dt, T);
    stepPool(puffs, dt); stepPool(sparks, dt); stepPool(confetti, dt); stepRings(dt);
    renderer.render(scene, camera);
  }
  const pv = new THREE.Vector3();
  function project(x, y, z) { pv.set(x, z, y).project(camera); return { x: (pv.x * 0.5 + 0.5) * innerWidth, y: (-pv.y * 0.5 + 0.5) * innerHeight, ok: pv.z < 1 && pv.z > -1 }; }
  function scaleAt(x, y, z) { const a = project(x, y, z), b = project(x, y, z + 60); return Math.abs(a.y - b.y) / 60; }

  applyQuality();
  // load the Blender-built asset library, then rebuild the current map and characters in high quality
  const loading = document.getElementById('loading'), bar = loading && loading.querySelector('b'), pct = loading && loading.querySelector('span');
  if (loading && !params.has('nohq')) loading.hidden = false;
  if (OPTS.phone) {
    if (loading) loading.hidden = true;
    import('./vendor/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync('/assets/models/bean.glb')).then(g => {
      useCharacterAsset(g); for (const [, b] of beans) scene.remove(b); beans.clear();
    }).catch(() => {});
  } else if (!params.has('nohq')) loadAll(p => { if (bar) bar.style.transform = `scaleX(${p})`; if (pct) pct.textContent = Math.round(p * 100) + '%'; }, quality).then(() => {
    if (A.ready) {
      useCharacterAsset(A.models.bean); hq = true;
      for (const [c, b] of beans) scene.remove(b); beans.clear();
      if (podium) { scene.remove(podium.g); podium = null; }
      if (map) setMap(map, lastDhakka);
    }
    if (loading) { loading.classList.add('done'); setTimeout(() => { loading.hidden = true; }, 700); }
    document.dispatchEvent(new CustomEvent('dm3d-assets', { detail: { ready: A.ready } }));
  });
  window.DRender3D = { setMap, render, fx, project, scaleAt, portrait, resize, get hq() { return hq; }, get quality() { return quality; }, setQuality(qv) { quality = qv; applyQuality(); }, get mapId() { return mapId; } };
  document.dispatchEvent(new CustomEvent('dm3d-ready'));
}

if (params.get('gfx') !== '2d' && webglOk()) {
  try { start(); } catch (err) { console.warn('3D renderer unavailable, using 2D', err); window.DRender3D = null; document.dispatchEvent(new CustomEvent('dm3d-failed')); }
} else document.dispatchEvent(new CustomEvent('dm3d-failed'));
