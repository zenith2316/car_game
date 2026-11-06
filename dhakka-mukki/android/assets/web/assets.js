/* Dhakka Mukki asset loader: Blender-built models, baked PBR textures, sky panoramas and the music and effects library.
   Everything is bundled in the APK under /assets and served by the local host, so nothing comes from the internet. */
import * as THREE from './vendor/three.js';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';

export const MODELS = ['bean', 'kulhad', 'dhol', 'belan', 'fan_blade', 'fan_motor', 'fan_wall', 'thali', 'crate', 'papad', 'peel', 'mukut',
  'island_rect', 'island_round', 'cloud', 'lantern', 'diya', 'kite', 'garland', 'ferris_wheel', 'ferris_frame', 'tapri'];
export const MATERIALS = ['foam', 'terracotta', 'marble', 'gold', 'wood', 'belt'];
export const DECALS = ['rangoli_a', 'rangoli_b', 'rangoli_c'];
export const SKIES = { aangan: 'day', tapri: 'bright', papad: 'golden', pankha: 'dream', king: 'sunset' };

const A = { models: {}, mats: {}, decals: {}, skies: {}, ready: false, failed: false };
export default A;

const gltf = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
function tex(url, srgb) {
  return new Promise((res, rej) => texLoader.load(url, t => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; res(t); }, undefined, rej));
}

/* Loads everything, reporting progress 0..1. Models and textures are loaded in parallel batches. */
export async function loadAll(onProgress, quality = 'high') {
  const jobs = [];
  for (const m of MODELS) jobs.push(() => gltf.loadAsync(`/assets/models/${m}.glb`).then(g => { A.models[m] = g; }));
  for (const m of MATERIALS) jobs.push(async () => {
    const [map, normalMap, orm] = await Promise.all([tex(`/assets/tex/${m}_albedo.jpg`, true), tex(`/assets/tex/${m}_normal.png`, false), tex(`/assets/tex/${m}_orm.jpg`, false)]);
    A.mats[m] = { map, normalMap, orm };
  });
  for (const d of DECALS) jobs.push(() => tex(`/assets/tex/${d}.webp`, true).then(t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; A.decals[d] = t; }));
  for (const s of new Set(Object.values(SKIES))) jobs.push(() => tex(`/assets/env/sky_${s}.jpg`, true).then(t => { t.mapping = THREE.EquirectangularReflectionMapping; t.wrapS = THREE.RepeatWrapping; A.skies[s] = t; }));
  let done = 0; const total = jobs.length;
  const run = async job => { try { await job(); } catch (e) { console.warn('asset failed', e && e.message); } done++; onProgress && onProgress(done / total); };
  const queue = jobs.slice(); const lanes = quality === 'high' ? 6 : 3;
  await Promise.all(Array.from({ length: lanes }, async () => { while (queue.length) await run(queue.shift()); }));
  A.ready = !!A.models.bean; A.failed = !A.ready;
  return A;
}

/* Cloned, scaled props. The first mesh found is the prop; GLB props are single meshes with baked PBR materials. */
export function prop(name) {
  const g = A.models[name]; if (!g) return null;
  const o = g.scene.clone(true);
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
}
export function propMesh(name) {
  const g = A.models[name]; if (!g) return null; let mesh = null;
  g.scene.traverse(m => { if (!mesh && m.isMesh) mesh = m; });
  return mesh;
}
