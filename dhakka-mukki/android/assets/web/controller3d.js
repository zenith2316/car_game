/* Phone-side 3D: shipped Cycles portraits for the pickers, and a live preview of your real animated character.
   Skipped on phones without WebGL; controller.js keeps its 2D art then. */
import { portrait, preview, useCharacterAsset } from './bean3d.js';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
function ok() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }
if (ok()) {
  try {
    let live = null, liveCanvas = null, key = '';
    window.DPortrait = {
      portrait,
      show(canvas, color, look) {
        if (live && liveCanvas === canvas) { live.resume(); if (key !== color + ':' + look) { key = color + ':' + look; live.set(color, look); } return; }
        if (live) live.stop();
        liveCanvas = canvas; key = color + ':' + look; live = preview(canvas, color, look);
      },
      pause() { if (live) live.pause(); },
      stop() { if (live) live.stop(); live = null; liveCanvas = null; key = ''; }
    };
    document.dispatchEvent(new CustomEvent('dm3d-ready'));
    // the rigged character is about 10 MB, fetched once over the local network, then the preview switches to it.
    // Embedded over the arena on the host screen, the arena already shows the character, so no second copy is loaded.
    if (!new URLSearchParams(location.search).has('embed')) new GLTFLoader().loadAsync('/assets/models/bean.glb').then(g => {
      useCharacterAsset(g);
      if (live && liveCanvas) { const c = key.split(':'); live.set(Number(c[0]), Number(c[1])); }
    }).catch(() => {});
  } catch (e) { window.DPortrait = null; }
}
