/* Dhakka Mukki audio: every sound is synthesised with Web Audio, no files.
   Music is a dhol groove with a shehnai-style lead in Raag Bhupali (Sa Re Ga Pa Dha), with a mood per game phase. */
'use strict';
(() => {
let ctx = null, master = null, musicBus = null, fxBus = null, noiseBuf = null;
let musicOn = false, fxOn = true, mood = 'lobby', nextBeat = 0, beat = 0, timer = null, droneNodes = [];
const last = {};
const SCALE = [0, 2, 4, 7, 9]; // Bhupali
const MOODS = {
  lobby: { bpm: 104, lead: 0.5, dhol: 'kaharwa', key: 57 },
  intro: { bpm: 104, lead: 0.2, dhol: 'roll', key: 57 },
  play: { bpm: 138, lead: 0.65, dhol: 'bhangra', key: 60 },
  panchayat: { bpm: 72, lead: 0.15, dhol: 'sparse', key: 55, drone: true },
  reveal: { bpm: 72, lead: 0, dhol: 'roll', key: 55, drone: true },
  scores: { bpm: 112, lead: 0.4, dhol: 'kaharwa', key: 57 },
  finished: { bpm: 124, lead: 0.7, dhol: 'bhangra', key: 62 }
};
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function init() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master);
  fxBus = ctx.createGain(); fxBus.gain.value = 0.9; fxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
function env(g, t, a, peak, dcy) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
function osc(type, f0, f1, t, dur, peak, bus, a = 0.005) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, a, peak, dur); o.connect(g); g.connect(bus || fxBus); o.start(t); o.stop(t + a + dur + 0.05); return o;
}
function noise(t, dur, peak, type, f, q, bus, f1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type || 'bandpass'; fl.frequency.setValueAtTime(f || 1000, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q || 1;
  const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
  s.connect(fl); fl.connect(g); g.connect(bus || fxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

/* ---------- sound effects ---------- */
const FX = {
  jump: t => osc('sine', 320, 760, t, 0.16, 0.18),
  land: t => { osc('sine', 140, 60, t, 0.09, 0.22); noise(t, 0.05, 0.05, 'lowpass', 500); },
  dash: t => noise(t, 0.2, 0.14, 'bandpass', 600, 2, null, 2600),
  hit: t => { osc('square', 160, 50, t, 0.14, 0.12); noise(t, 0.09, 0.22, 'lowpass', 1800); osc('triangle', 900, 300, t, 0.06, 0.06); },
  boing: t => { const o = osc('sine', 220, 520, t, 0.32, 0.2); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 28; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.35); },
  fall: t => osc('sine', 1300, 180, t, 0.75, 0.12),
  qualify: t => [0, 4, 7, 12].forEach((n, i) => osc('triangle', midi(72 + n), 0, t + i * 0.07, 0.22, 0.13)),
  out: t => [0, -1, -2, -5].forEach((n, i) => osc('sawtooth', midi(55 + n), midi(54 + n), t + i * 0.22, i === 3 ? 0.6 : 0.2, 0.06)),
  peel: t => { noise(t, 0.12, 0.2, 'bandpass', 300, 4, null, 120); osc('sine', 500, 900, t + 0.06, 0.1, 0.06); },
  slip: t => { osc('sine', 300, 1200, t, 0.18, 0.1); osc('sine', 1200, 200, t + 0.18, 0.3, 0.08); },
  quake: t => { noise(t, 0.7, 0.4, 'lowpass', 220, 1, null, 60); osc('sine', 70, 35, t, 0.6, 0.35); },
  ulta: t => { noise(t, 0.6, 0.18, 'bandpass', 3000, 3, null, 300); osc('sawtooth', 900, 140, t, 0.5, 0.05); },
  crack: t => { for (let i = 0; i < 6; i++) noise(t + i * 0.03 + Math.random() * 0.02, 0.03, 0.18, 'highpass', 2500); },
  plop: t => osc('sine', 600, 140, t, 0.12, 0.08),
  grab: t => [0, 7, 12, 16].forEach((n, i) => osc('sine', midi(79 + n), 0, t + i * 0.05, 0.5, 0.08)),
  drop: t => [12, 7, 0].forEach((n, i) => osc('triangle', midi(76 + n), 0, t + i * 0.06, 0.2, 0.08)),
  beep: t => osc('square', 880, 0, t, 0.12, 0.08),
  go: t => { [0, 4, 7, 12].forEach(n => osc('sawtooth', midi(60 + n), 0, t, 0.6, 0.05, null, 0.02)); noise(t, 0.4, 0.2, 'lowpass', 400); },
  emote: t => osc('triangle', 660, 990, t, 0.1, 0.06),
  vote: t => osc('sine', 1046, 0, t, 0.15, 0.08),
  roll: t => { for (let i = 0; i < 18; i++) noise(t + i * 0.055, 0.05, 0.05 + i * 0.008, 'bandpass', 180, 2); },
  gong: t => { [1, 2.76, 5.4].forEach((m, i) => osc('sine', 110 * m, 0, t, 2.6 - i * 0.6, 0.18 / (i + 1), null, 0.01)); },
  cheer: t => { noise(t, 1.3, 0.12, 'bandpass', 1500, 0.6); for (let i = 0; i < 8; i++) osc('triangle', midi(72 + SCALE[i % 5] + 12 * (i > 4)), 0, t + i * 0.08, 0.2, 0.05); }
};
/* ---------- recorded samples (rendered with the GeneralUser GS soundfont) ---------- */
const SAMPLE_FX = ['jump', 'land', 'dash', 'hit', 'boing', 'fall', 'qualify', 'out', 'peel', 'slip', 'quake', 'ulta', 'crack', 'plop', 'grab', 'drop', 'beep', 'go', 'emote', 'vote', 'roll', 'gong', 'cheer', 'wipe', 'tick', 'join'];
const buffers = {}; let samplesLoading = false;
async function loadSamples() {
  if (samplesLoading || !init()) return; samplesLoading = true;
  await Promise.all(SAMPLE_FX.map(async n => {
    try { const r = await fetch('/assets/audio/fx_' + n + '.ogg'); if (!r.ok) return; buffers[n] = await ctx.decodeAudioData(await r.arrayBuffer()); } catch (_) {}
  }));
}
function playSample(name, t) {
  const b = buffers[name]; if (!b) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b;
  src.playbackRate.value = 0.94 + Math.random() * 0.12; g.gain.value = name === 'land' || name === 'jump' ? 0.55 : 0.85;
  src.connect(g); g.connect(fxBus); src.start(t); return true;
}
function play(name, throttle = 0.04) {
  if (!fxOn || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime; if (last[name] && t - last[name] < throttle) return; last[name] = t;
  try { if (!playSample(name, t + 0.005) && FX[name]) FX[name](t + 0.005); } catch (_) {}
}

/* ---------- composed music: two streamed decks crossfading, one track per phase and map ---------- */
const TRACK_FOR = { lobby: 'lobby', intro: null, panchayat: 'panchayat', reveal: '', scores: 'scores', finished: 'victory' };
const BY_KIND = { race: 'race', survive: 'survive', crown: 'final', lobby: 'lobby' };
const decks = []; let deckIdx = 0, current = '', mapKind = 'lobby', trackMode = true;
function deck() {
  if (!init()) return null;
  if (decks.length < 2) for (let i = 0; i < 2; i++) {
    const el = new Audio(); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el), g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(musicBus);
    decks.push({ el, g, name: '' });
  }
  return decks;
}
function trackFor(mood) {
  if (mood === 'play' || mood === 'countdown' || mood === 'roundEnd') return BY_KIND[mapKind] || 'race';
  const t = TRACK_FOR[mood]; return t === undefined ? 'lobby' : t;
}
function switchTrack(name) {
  if (!musicOn || !trackMode || !deck()) return;
  if (name === null) { decks.forEach(d => d.g.gain.setTargetAtTime(d.name === current ? 0.35 : 0, ctx.currentTime, 0.4)); return; }
  if (name === current) { decks.forEach(d => d.g.gain.setTargetAtTime(d.name === current ? 1 : 0, ctx.currentTime, 0.5)); return; }
  current = name;
  const from = decks[deckIdx], to = decks[deckIdx = 1 - deckIdx], now = ctx.currentTime;
  from.g.gain.setTargetAtTime(0, now, 0.6); setTimeout(() => { if (from.name !== current) from.el.pause(); }, 2500);
  if (!name) return;
  to.name = name; to.el.src = '/assets/audio/music_' + name + '.ogg'; to.el.currentTime = 0;
  to.el.play().catch(() => {}); to.g.gain.cancelScheduledValues(now); to.g.gain.setValueAtTime(0, now); to.g.gain.setTargetAtTime(1, now + 0.05, 0.5);
}

/* ---------- music ---------- */
function dholHit(t, kind, vel) {
  if (kind === 'dha') { osc('sine', 120, 52, t, 0.28, 0.5 * vel, musicBus); noise(t, 0.04, 0.12 * vel, 'lowpass', 800, 1, musicBus); }
  else if (kind === 'na') { osc('triangle', 420, 380, t, 0.08, 0.16 * vel, musicBus); noise(t, 0.05, 0.14 * vel, 'bandpass', 2600, 2, musicBus); }
  else if (kind === 'ge') { osc('sine', 90, 70, t, 0.18, 0.28 * vel, musicBus); }
  else if (kind === 'sh') { noise(t, 0.03, 0.06 * vel, 'highpass', 7000, 1, musicBus); }
}
const PATTERNS = {
  kaharwa: ['dha', 'sh', 'na', 'sh', 'dha', 'na', 'ge', 'na'],
  bhangra: ['dha', 'na', 'ge', 'na', 'dha', 'na', 'dha', 'na'],
  sparse: ['ge', '', '', '', 'na', '', '', ''],
  roll: ['na', 'na', 'na', 'na', 'na', 'na', 'dha', 'na']
};
function leadNote(t, m, step) {
  const n = m.key + 12 + SCALE[Math.floor(Math.random() * 5)] + (Math.random() < 0.25 ? 12 : 0), dur = (60 / m.bpm) * (Math.random() < 0.3 ? 1 : 0.5);
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = midi(n); o2.frequency.value = midi(n) * 1.003;
  vib.frequency.value = 5.5; vg.gain.value = midi(n) * 0.012; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  f.type = 'bandpass'; f.frequency.value = midi(n) * 2.2; f.Q.value = 2.4;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.04); g.gain.setValueAtTime(0.08, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus);
  [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.05); });
}
function bass(t, m, step) { const n = m.key - 24 + [0, 0, 7, 9][Math.floor(step / 4) % 4]; osc('triangle', midi(n), 0, t, 60 / m.bpm * 0.9, 0.16, musicBus); }
function drone(on) {
  droneNodes.forEach(n => { try { n.stop(); } catch (_) {} }); droneNodes = [];
  if (!on || !ctx) return;
  const m = MOODS[mood]; [0, 7, 12].forEach((iv, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = midi(m.key - 12 + iv); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0.03 / (i + 1); o.connect(f); f.connect(g); g.connect(musicBus); o.start(); droneNodes.push(o); });
}
function schedule() {
  if (!ctx || !musicOn) return;
  const m = MOODS[mood] || MOODS.lobby, spb = 60 / m.bpm / 2;
  while (nextBeat < ctx.currentTime + 0.2) {
    const step = beat % 8, hit = PATTERNS[m.dhol][step];
    if (hit) dholHit(nextBeat, hit, step === 0 ? 1 : 0.8);
    if (m.dhol !== 'sparse' && step % 2 === 1) dholHit(nextBeat, 'sh', 0.6);
    if (step % 2 === 0 && m.dhol !== 'roll') bass(nextBeat, m, beat);
    if (step % 2 === 0 && Math.random() < m.lead) leadNote(nextBeat, m, beat);
    nextBeat += spb; beat++;
  }
}
function setMood(name, kind) {
  if (kind) mapKind = kind;
  if (trackMode && ctx) { switchTrack(trackFor(name)); mood = name; return; }
  if (!MOODS[name] || name === mood) return; const hadDrone = MOODS[mood] && MOODS[mood].drone; mood = name; if (musicOn && !!MOODS[name].drone !== !!hadDrone) drone(!!MOODS[name].drone);
}
async function setMusic(on) {
  if (on && !init()) return false;
  musicOn = on;
  if (on) {
    try { await ctx.resume(); } catch (_) {}
    loadSamples();
    if (trackMode) { current = ''; switchTrack(trackFor(mood)); }
    else { nextBeat = ctx.currentTime + 0.1; if (!timer) timer = setInterval(schedule, 50); drone(!!(MOODS[mood] || {}).drone); }
  } else { if (timer) { clearInterval(timer); timer = null; } drone(false); decks.forEach(d => { d.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => d.el.pause(), 600); }); current = ''; }
  return ctx && ctx.state === 'running';
}
async function unlock() { if (!init()) return false; try { await ctx.resume(); } catch (_) {} loadSamples(); return ctx.state === 'running'; }
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (musicOn || fxOn) ctx.resume(); });

window.DAudio = { play, setMood, setMusic, unlock, setFx: v => { fxOn = v; }, get running() { return !!ctx && ctx.state === 'running'; }, get music() { return musicOn; } };
})();
