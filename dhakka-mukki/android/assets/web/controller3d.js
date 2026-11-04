/* Phone-side 3D: portraits for the colour and look pickers, and a live spinning preview of your character.
   Skipped on phones without WebGL; controller.js keeps its 2D art then. */
import { portrait, preview } from './bean3d.js';
function ok() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }
if (ok()) {
  try {
    portrait(0, 0, 32);
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
  } catch (e) { window.DPortrait = null; }
}
