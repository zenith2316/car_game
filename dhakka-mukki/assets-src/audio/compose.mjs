/* Dhakka Mukki music and sound effects.
   Composes arrangements in code (raag-based scales, motif melodies with meend slides, tabla/dhol grooves), renders them through
   the GeneralUser GS soundfont with spessasynth_core, and writes seamless OGG loops via ffmpeg.
   Run: node compose.mjs <GeneralUser.sf2> <out_dir> [names...]   (npm i spessasynth_core@4.4.5 in this folder) */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SoundBankLoader, SpessaSynthProcessor, SpessaSynthSequencer, MIDIBuilder, audioToWav } from 'spessasynth_core';

const [SF, OUT, ...ONLY] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const sfb = fs.readFileSync(SF);
const BANK = SoundBankLoader.fromArrayBuffer(sfb.buffer.slice(sfb.byteOffset, sfb.byteOffset + sfb.byteLength));
const SR = 48000, TPB = 480;

/* ---------- deterministic randomness ---------- */
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const SCALES = { bilawal: [0, 2, 4, 5, 7, 9, 11], kafi: [0, 2, 3, 5, 7, 9, 10], bhupali: [0, 2, 4, 7, 9], yaman: [0, 2, 4, 6, 7, 9, 11], bhairav: [0, 1, 4, 5, 7, 8, 11], malkauns: [0, 3, 5, 8, 10] };

/* ---------- a tiny arranger over MIDIBuilder ---------- */
class Song {
  constructor(bpm, bars) { this.bpm = bpm; this.bars = bars; this.m = new MIDIBuilder({ timeDivision: TPB, initialTempo: bpm, format: 1 }); this.m.addTrack('all'); this.ch = 0; this.n = 0; }
  bar(b) { return b * 4 * TPB; }
  chan(program, { vol = 100, pan = 64, rev = 40, cho = 0, drums = false, bend = 2 } = {}) {
    const c = drums ? 9 : (this.ch === 9 ? ++this.ch : this.ch); if (!drums) this.ch++;
    if (!drums) this.m.addEvent(0, 1, 0xC0 | c, [program]);
    for (const [cc, v] of [[7, vol], [10, pan], [91, rev], [93, cho], [101, 0], [100, 0], [6, bend], [38, 0]]) this.m.addEvent(0, 1, 0xB0 | c, [cc, v]);
    return c;
  }
  note(c, t, pitch, dur, vel = 100) { if (pitch < 0 || pitch > 127) return; this.m.noteOn(Math.round(t), 1, c, pitch, Math.max(1, Math.min(127, Math.round(vel)))); this.m.noteOff(Math.round(t + Math.max(10, dur)), 1, c, pitch); this.n++; }
  bend(c, t, semis) { const v = Math.max(0, Math.min(16383, Math.round(8192 + semis / 2 * 8191))); this.m.addEvent(Math.round(t), 1, 0xE0 | c, [v & 127, v >> 7]); }
  cc(c, t, cc, v) { this.m.addEvent(Math.round(t), 1, 0xB0 | c, [cc, v]); }
}
const deg = (root, scale, d) => { const s = SCALES[scale], o = Math.floor(d / s.length); return root + s[((d % s.length) + s.length) % s.length] + 12 * o; };
const chordTones = (root, scale, d) => [deg(root, scale, d), deg(root, scale, d + 2), deg(root, scale, d + 4)];

/* ---------- part writers ---------- */
function pad(S, c, prog, root, scale, bars0, bars1, vel = 60, octave = 0) {
  for (let b = bars0; b < bars1; b++) { const d = prog[b % prog.length]; for (const p of chordTones(root + octave, scale, d)) S.note(c, S.bar(b), p, 4 * TPB - 20, vel); }
}
function bass(S, c, prog, root, scale, bars0, bars1, style = 'walk', vel = 96) {
  for (let b = bars0; b < bars1; b++) {
    const d = prog[b % prog.length], r = deg(root - 24, scale, d), f = deg(root - 24, scale, d + 4), t = S.bar(b);
    if (style === 'bhangra') { for (const [o, p, l] of [[0, r, 1.5], [1.5, r, 0.5], [2, f, 1], [3, r + 12, 0.5], [3.5, f, 0.5]]) S.note(c, t + o * TPB, p, l * TPB - 30, vel); }
    else if (style === 'pulse') { for (let k = 0; k < 8; k++) S.note(c, t + k * TPB / 2, k % 4 === 3 ? f : r, TPB / 2 - 40, vel - (k % 2) * 14); }
    else if (style === 'long') { S.note(c, t, r, 4 * TPB - 40, vel); }
    else { for (const [o, p] of [[0, r], [1, f], [2, r + 12], [3, deg(root - 24, scale, d + 5)]]) S.note(c, t + o * TPB, p, TPB - 40, vel - (o % 2) * 10); }
  }
}
function arp(S, c, prog, root, scale, bars0, bars1, { step = 0.5, vel = 70, octave = 12, pattern = [0, 1, 2, 1] } = {}) {
  for (let b = bars0; b < bars1; b++) {
    const tones = chordTones(root + octave, scale, prog[b % prog.length]); tones.push(tones[0] + 12);
    for (let k = 0; k < 4 / step; k++) S.note(c, S.bar(b) + k * step * TPB, tones[pattern[k % pattern.length] % tones.length], step * TPB * 0.9, vel - (k % 2) * 10);
  }
}
const RHYTHMS = [[1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 0.5, 0.5, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 2], [1, 1, 0.5, 0.5, 1], [0.75, 0.25, 0.5, 0.5, 1, 1], [2, 1, 1]];
function phrase(root, scale, prog, b0, len, startDeg) {
  const notes = []; let d = startDeg; const rhy = [];
  for (let b = 0; b < len; b++) rhy.push(pick(RHYTHMS));
  for (let b = 0; b < len; b++) {
    let t = 0; const chord = prog[(b0 + b) % prog.length];
    rhy[b].forEach((l, i) => {
      const strong = t === 0 || t === 2;
      const step = pick([-1, -1, 1, 1, 1, -2, 2, 0, 3, -3]); d += step;
      if (strong) { const ct = [chord, chord + 2, chord + 4, chord + 7]; d = ct.reduce((a, x) => Math.abs(x - d) < Math.abs(a - d) ? x : a, ct[0]); }
      d = Math.max(-2, Math.min(11, d));
      const last = b === len - 1 && i === rhy[b].length - 1;
      notes.push({ bar: b, beat: t, len: last ? Math.max(l, 1.5) : l, d: last ? chord : d, rest: !last && rnd() < 0.08 });
      t += l;
    });
  }
  return notes;
}
function lead(S, c, root, scale, prog, bars0, bars1, { octave = 12, vel = 100, meend = true, seed: sd = 7, form = 'AABA' } = {}) {
  seed = sd;
  const A = phrase(root + octave, scale, prog, 0, 2, 4), B = phrase(root + octave, scale, prog, 2, 2, 7), A2 = A.map(n => ({ ...n, d: n.d + (n.bar === 1 ? 2 : 0) }));
  const forms = { AABA: [A, A2, B, A], ABAB: [A, B, A2, B], AAAB: [A, A, A2, B] }[form];
  for (let b = bars0, k = 0; b < bars1; b += 2, k++) {
    const ph = forms[k % forms.length];
    for (const n of ph) {
      if (n.rest || b + n.bar >= bars1) continue;
      const t = S.bar(b + n.bar) + n.beat * TPB, p = deg(root + octave, scale, n.d);
      if (meend && n.len >= 1 && rnd() < 0.45) { S.bend(c, t - 4, -1); for (let s = 1; s <= 6; s++) S.bend(c, t + s * 14, -1 + s / 6); }
      else S.bend(c, t - 2, 0);
      S.note(c, t, p, n.len * TPB * 0.92, vel - (n.beat % 1 ? 12 : 0) + (n.beat === 0 ? 8 : 0));
    }
  }
}
/* tabla-style hand percussion on the GM kit: bongos, congas, timbales; dhol on low toms and kick */
const KIT = { kick: 36, snare: 38, clap: 39, ltom: 41, mtom: 45, htom: 48, chh: 42, ohh: 46, ride: 51, crash: 49, tamb: 54, bongoH: 60, bongoL: 61, congaM: 62, congaH: 63, congaL: 64, timbH: 65, timbL: 66, shaker: 70, cabasa: 69, wblock: 76, triangle: 81 };
const GROOVES = {
  kaharwa: { len: 8, hits: [[0, 'congaL', 110], [0, 'kick', 80], [1, 'bongoH', 70], [2, 'congaM', 90], [3, 'bongoH', 60], [4, 'congaL', 100], [5, 'bongoL', 80], [6, 'congaH', 95], [7, 'bongoH', 70], [2, 'shaker', 40], [6, 'shaker', 40]] },
  bhangra: { len: 8, hits: [[0, 'kick', 120], [0, 'ltom', 100], [1.5, 'kick', 90], [2, 'clap', 100], [2, 'snare', 70], [3, 'ltom', 90], [3.5, 'mtom', 80], [4, 'kick', 120], [5, 'ltom', 80], [5.5, 'kick', 90], [6, 'clap', 110], [6, 'snare', 80], [7, 'mtom', 90], [7.5, 'htom', 80]].concat([0, 1, 2, 3, 4, 5, 6, 7].map(i => [i + 0.5, 'chh', 50])) },
  teental: { len: 8, hits: [[0, 'congaL', 110], [0.5, 'bongoH', 60], [1, 'congaM', 90], [1.5, 'bongoH', 60], [2, 'congaL', 100], [2.5, 'bongoL', 70], [3, 'congaH', 90], [3.5, 'bongoH', 60], [4, 'timbL', 90], [4.5, 'bongoH', 60], [5, 'congaM', 80], [5.5, 'bongoH', 55], [6, 'congaL', 110], [6.5, 'bongoL', 70], [7, 'congaH', 95], [7.5, 'bongoH', 70]] },
  march: { len: 8, hits: [[0, 'kick', 120], [0, 'crash', 70], [1, 'snare', 80], [2, 'kick', 110], [3, 'snare', 100], [3.5, 'snare', 70], [4, 'kick', 120], [5, 'snare', 80], [6, 'kick', 110], [6.5, 'kick', 90], [7, 'snare', 110], [7.5, 'snare', 90]].concat([0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, 'ride', 45])) },
  sparse: { len: 8, hits: [[0, 'congaL', 90], [3, 'bongoL', 50], [4, 'timbL', 60], [6.5, 'bongoH', 40]] },
  light: { len: 8, hits: [[0, 'kick', 80], [1, 'clap', 70], [2, 'kick', 70], [3, 'clap', 80], [0.5, 'shaker', 40], [1.5, 'shaker', 40], [2.5, 'shaker', 40], [3.5, 'shaker', 40], [3, 'triangle', 40]] }
};
function groove(S, name, bars0, bars1, { swing = 0, fill = true, vel = 1 } = {}) {
  const g = GROOVES[name], c = 9;
  for (let b = bars0; b < bars1; b++) {
    for (const [pos, k, v] of g.hits) {   // pos is in half-beats, 0 to 7.5 across the bar
      const sw = (pos % 1) ? swing * TPB * 0.25 : 0;
      S.note(c, S.bar(b) + pos * TPB / 2 + sw, KIT[k], TPB / 4, v * vel * (0.92 + rnd() * 0.12));
    }
    if (fill && (b - bars0) % 8 === 7) for (let k = 0; k < 8; k++) S.note(c, S.bar(b) + 2 * TPB + k * TPB / 4, KIT[['htom', 'mtom', 'ltom', 'congaL'][k % 4]], TPB / 4, 70 + k * 6);
  }
}
function dhol(S, c, bars0, bars1, vel = 110) { // taiko-as-dhol on the off-beat pattern dha-ge-na
  for (let b = bars0; b < bars1; b++) for (const [o, p, v] of [[0, 40, 1], [1.5, 40, 0.7], [2, 47, 0.9], [3, 40, 0.8], [3.5, 47, 0.7]]) S.note(c, S.bar(b) + o * TPB, p, TPB / 2, vel * v);
}
function drone(S, c, root, bars0, bars1, vel = 50) { for (let b = bars0; b < bars1; b += 2) { S.note(c, S.bar(b), root - 12, 8 * TPB - 20, vel); S.note(c, S.bar(b) + TPB / 2, root - 5, 7 * TPB, vel * 0.8); S.note(c, S.bar(b) + TPB, root, 6 * TPB, vel * 0.7); } }

/* ---------- rendering ---------- */
async function render(song, seconds) {
  const synth = new SpessaSynthProcessor(SR, { enableEventSystem: false });
  synth.soundBankManager.addSoundBank(BANK, 'gu');
  await synth.processorInitialized;
  if (song.m.flush) song.m.flush();
  const seq = new SpessaSynthSequencer(synth); seq.loadNewSongList([song.m]); seq.play();
  const N = Math.ceil(SR * seconds), L = new Float32Array(N), R = new Float32Array(N);
  for (let f = 0; f < N; f += 128) { seq.processTick(); synth.process(L, R, f, Math.min(128, N - f)); }
  return [L, R];
}
function normalize([L, R], target = 0.89) {
  let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? target / peak : 1; for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}
/* fold the reverb tail rendered past the loop point back onto the start, so the loop is seamless */
function loopify([L, R], loopSec) {
  const n = Math.round(loopSec * SR), l = new Float32Array(n), r = new Float32Array(n);
  l.set(L.subarray(0, n)); r.set(R.subarray(0, n));
  for (let i = n; i < L.length; i++) { l[i - n] += L[i]; r[i - n] += R[i]; }
  return [l, r];
}
function writeOgg(name, ch, q = 6) {
  const wav = path.join(OUT, name + '.wav'); fs.writeFileSync(wav, Buffer.from(audioToWav(ch, SR)));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', String(q), path.join(OUT, name + '.ogg')]);
  fs.unlinkSync(wav); console.log('audio', name, (fs.statSync(path.join(OUT, name + '.ogg')).size / 1024).toFixed(0) + ' KB');
}
const GM = { sitar: 104, shanai: 111, bansuri: 73, panflute: 75, marimba: 12, kalimba: 108, pizz: 45, strings: 48, slowStrings: 49, tremolo: 44, choir: 52, brass: 61, trumpet: 56, tuba: 58, horn: 60, taiko: 116, timpani: 47, bass: 33, fretless: 35, synthBass: 38, harp: 46, santoor: 15, glock: 9, celesta: 8, steel: 114, shamisen: 106, banjo: 105, koto: 107, accordion: 21, harmonium: 20, vibes: 11, piano: 0 };

/* ---------- tracks ---------- */
const TRACKS = {
  async lobby() { // "Aangan" relaxed mela groove, Raag Bhupali
    const S = new Song(100, 32), root = 62, sc = 'bhupali', prog = [0, 3, 4, 0, 1, 3, 4, 0];
    const sit = S.chan(GM.sitar, { vol: 92, pan: 50, rev: 60 }), flute = S.chan(GM.bansuri, { vol: 82, pan: 80, rev: 70 }), mar = S.chan(GM.santoor, { vol: 70, pan: 76, rev: 50 });
    const bs = S.chan(GM.fretless, { vol: 96 }), pd = S.chan(GM.slowStrings, { vol: 52, rev: 80 }), har = S.chan(GM.harmonium, { vol: 48, pan: 40, rev: 50 });
    drone(S, pd, root, 0, 32, 46); bass(S, bs, prog, root, sc, 4, 32, 'walk', 88); groove(S, 'kaharwa', 4, 32, { swing: 0.3 });
    arp(S, mar, prog, root, sc, 0, 32, { step: 0.5, vel: 62, octave: 12, pattern: [0, 2, 1, 3, 2, 1, 0, 2] });
    pad(S, har, prog, root, sc, 8, 32, 44, 0);
    lead(S, sit, root, sc, prog, 4, 20, { octave: 12, vel: 100, seed: 11, form: 'AABA' }); lead(S, flute, root, sc, prog, 20, 32, { octave: 24, vel: 92, seed: 23, form: 'ABAB' });
    const sec = 32 * 4 * 60 / 100; return loopify(normalize(await render(S, sec + 4)), sec);
  },
  async race() { // "Tapri Dash" bhangra, Raag Kafi
    const S = new Song(140, 48), root = 64, sc = 'kafi', prog = [0, 0, 5, 6, 3, 3, 4, 4];
    const shn = S.chan(GM.shanai, { vol: 96, pan: 60, rev: 40 }), tumbi = S.chan(GM.shamisen, { vol: 90, pan: 30, rev: 30 }), br = S.chan(GM.brass, { vol: 78, pan: 90, rev: 40 });
    const bs = S.chan(GM.synthBass, { vol: 100 }), dh = S.chan(GM.taiko, { vol: 104, rev: 25 }), st = S.chan(GM.strings, { vol: 56, rev: 60 });
    dhol(S, dh, 0, 48, 112); groove(S, 'bhangra', 2, 48); bass(S, bs, prog, root, sc, 2, 48, 'bhangra', 104);
    arp(S, tumbi, prog, root, sc, 0, 48, { step: 0.25, vel: 78, octave: 12, pattern: [0, 0, 3, 0, 2, 0, 3, 1] });
    for (let b = 8; b < 48; b += 2) for (const o of [0, 1.5]) for (const p of chordTones(root, sc, prog[b % 8])) S.note(br, S.bar(b) + o * TPB, p, TPB * 0.5, 84);
    pad(S, st, prog, root, sc, 16, 48, 50, 12);
    lead(S, shn, root, sc, prog, 8, 32, { octave: 12, vel: 104, seed: 31, form: 'AABA' }); lead(S, shn, root, sc, prog, 32, 48, { octave: 12, vel: 108, seed: 37, form: 'ABAB' });
    const sec = 48 * 4 * 60 / 140; return loopify(normalize(await render(S, sec + 3)), sec);
  },
  async survive() { // "Papad and Pankha" tense playful, Raag Yaman
    const S = new Song(128, 48), root = 60, sc = 'yaman', prog = [0, 1, 5, 4, 0, 3, 1, 4];
    const pz = S.chan(GM.pizz, { vol: 92, pan: 40, rev: 50 }), kal = S.chan(GM.kalimba, { vol: 84, pan: 88, rev: 50 }), sit = S.chan(GM.sitar, { vol: 90, pan: 64, rev: 55 });
    const bs = S.chan(GM.bass, { vol: 96 }), st = S.chan(GM.tremolo, { vol: 50, rev: 70 }), tim = S.chan(GM.timpani, { vol: 80, rev: 50 });
    groove(S, 'teental', 0, 48); bass(S, bs, prog, root, sc, 4, 48, 'pulse', 92);
    arp(S, pz, prog, root, sc, 0, 48, { step: 0.5, vel: 76, octave: 0, pattern: [0, 1, 2, 3, 2, 1, 0, 1] });
    arp(S, kal, prog, root, sc, 16, 48, { step: 0.25, vel: 60, octave: 24, pattern: [0, 2, 1, 3] });
    pad(S, st, prog, root, sc, 24, 48, 46, 12);
    for (let b = 0; b < 48; b += 4) S.note(tim, S.bar(b), root - 24, TPB, 96);
    lead(S, sit, root, sc, prog, 8, 48, { octave: 12, vel: 100, seed: 43, form: 'AAAB' });
    const sec = 48 * 4 * 60 / 128; return loopify(normalize(await render(S, sec + 3)), sec);
  },
  async final() { // "Dhakka King" epic, Raag Bhairav
    const S = new Song(150, 48), root = 62, sc = 'bhairav', prog = [0, 0, 1, 1, 3, 3, 4, 0];
    const br = S.chan(GM.brass, { vol: 96, pan: 70, rev: 50 }), hn = S.chan(GM.horn, { vol: 84, pan: 40, rev: 60 }), shn = S.chan(GM.shanai, { vol: 100, pan: 64, rev: 45 });
    const st = S.chan(GM.strings, { vol: 76, rev: 70 }), ch = S.chan(GM.choir, { vol: 70, rev: 80 }), dh = S.chan(GM.taiko, { vol: 110, rev: 30 }), tim = S.chan(GM.timpani, { vol: 96, rev: 40 }), bs = S.chan(GM.synthBass, { vol: 100 });
    dhol(S, dh, 0, 48, 118); groove(S, 'march', 4, 48); bass(S, bs, prog, root, sc, 4, 48, 'pulse', 104);
    for (let b = 0; b < 48; b++) S.note(tim, S.bar(b), root - 24, TPB, b % 4 === 0 ? 120 : 80);
    arp(S, st, prog, root, sc, 0, 48, { step: 0.25, vel: 70, octave: 0, pattern: [0, 1, 2, 1] });
    pad(S, ch, prog, root, sc, 16, 48, 60, 12); pad(S, hn, prog, root, sc, 8, 48, 66, 0);
    for (let b = 8; b < 48; b += 2) for (const o of [0, 0.75, 1.5]) for (const p of chordTones(root + 12, sc, prog[b % 8])) S.note(br, S.bar(b) + o * TPB, p, TPB * 0.6, 96);
    lead(S, shn, root, sc, prog, 16, 48, { octave: 12, vel: 108, seed: 53, form: 'AABA' });
    const sec = 48 * 4 * 60 / 150; return loopify(normalize(await render(S, sec + 3)), sec);
  },
  async panchayat() { // suspense: tanpura-like drone, tremolo strings, sparse tabla, Raag Malkauns
    const S = new Song(80, 24), root = 57, sc = 'malkauns', prog = [0, 0, 3, 2, 0, 0, 4, 3];
    const tp = S.chan(GM.sitar, { vol: 70, pan: 40, rev: 80 }), tr = S.chan(GM.tremolo, { vol: 64, rev: 85 }), pz = S.chan(GM.pizz, { vol: 78, pan: 84, rev: 60 }), bs = S.chan(GM.slowStrings, { vol: 70, rev: 80 }), harp = S.chan(GM.harp, { vol: 60, pan: 70, rev: 80 });
    for (let b = 0; b < 24; b++) for (const [o, p] of [[0, root - 12], [1, root - 5], [2, root], [3, root - 5]]) S.note(tp, S.bar(b) + o * TPB, p, TPB * 1.8, 52);
    pad(S, tr, prog, root, sc, 4, 24, 48, 0); bass(S, bs, prog, root, sc, 0, 24, 'long', 64);
    groove(S, 'sparse', 2, 24, { fill: false });
    for (let b = 4; b < 24; b++) for (let k = 0; k < 4; k++) if (rnd() < 0.5) S.note(pz, S.bar(b) + k * TPB + TPB / 2, deg(root, sc, pick([0, 1, 2, 3, 4, 5])), TPB / 2, 60 + rnd() * 20);
    arp(S, harp, prog, root, sc, 12, 24, { step: 1, vel: 50, octave: 12, pattern: [0, 2, 1, 3] });
    const sec = 24 * 4 * 60 / 80; return loopify(normalize(await render(S, sec + 5), 0.8), sec);
  },
  async scores() { // light breezy points table, Raag Bilawal
    const S = new Song(112, 16), root = 65, sc = 'bilawal', prog = [0, 4, 5, 3, 0, 3, 4, 0];
    const mar = S.chan(GM.marimba, { vol: 88, pan: 50, rev: 50 }), fl = S.chan(GM.panflute, { vol: 84, pan: 80, rev: 60 }), bs = S.chan(GM.fretless, { vol: 92 }), vib = S.chan(GM.vibes, { vol: 60, pan: 30, rev: 60 });
    groove(S, 'light', 0, 16, { fill: false }); bass(S, bs, prog, root, sc, 0, 16, 'walk', 86);
    arp(S, mar, prog, root, sc, 0, 16, { step: 0.5, vel: 70, octave: 12, pattern: [0, 1, 2, 3, 2, 1] }); pad(S, vib, prog, root, sc, 0, 16, 44, 12);
    lead(S, fl, root, sc, prog, 4, 16, { octave: 24, vel: 92, seed: 61, form: 'ABAB', meend: false });
    const sec = 16 * 4 * 60 / 112; return loopify(normalize(await render(S, sec + 3)), sec);
  },
  async victory() { // fanfare into a bhangra celebration, Raag Bilawal
    const S = new Song(132, 24), root = 62, sc = 'bilawal', prog = [0, 3, 4, 0, 5, 3, 4, 0];
    const tp = S.chan(GM.trumpet, { vol: 100, pan: 64, rev: 50 }), br = S.chan(GM.brass, { vol: 90, pan: 40, rev: 50 }), shn = S.chan(GM.shanai, { vol: 96, pan: 80, rev: 40 }), dh = S.chan(GM.taiko, { vol: 110 }), bs = S.chan(GM.synthBass, { vol: 100 }), ch = S.chan(GM.choir, { vol: 70, rev: 80 }), gl = S.chan(GM.glock, { vol: 70, rev: 60 });
    for (const [o, p, l] of [[0, 0, 0.5], [0.5, 2, 0.5], [1, 4, 0.5], [1.5, 7, 2.5]]) S.note(tp, o * TPB, deg(root + 12, sc, p), l * TPB, 110);
    for (const p of chordTones(root, sc, 0)) S.note(br, 1.5 * TPB, p, 2.5 * TPB, 100);
    dhol(S, dh, 1, 24, 116); groove(S, 'bhangra', 1, 24); bass(S, bs, prog, root, sc, 1, 24, 'bhangra', 104);
    pad(S, ch, prog, root, sc, 1, 24, 58, 12); arp(S, gl, prog, root, sc, 8, 24, { step: 0.5, vel: 60, octave: 24 });
    lead(S, shn, root, sc, prog, 2, 24, { octave: 12, vel: 106, seed: 71, form: 'AABA' });
    const sec = 24 * 4 * 60 / 132; return loopify(normalize(await render(S, sec + 3)), sec);
  }
};

/* ---------- sound effects: short one-shots from the soundfont ---------- */
async function oneShot(build, seconds, gain = 0.9) { const S = new Song(120, 4); build(S); return normalize(await render(S, seconds), gain); }
const FX = {
  jump: S => { const c = S.chan(GM.kalimba, { rev: 10 }); S.bend(c, 0, -2); for (let i = 1; i <= 10; i++) S.bend(c, i * 18, -2 + i * 0.4); S.note(c, 0, 72, 200, 120); },
  land: S => { const c = S.chan(GM.taiko, { rev: 10 }); S.note(c, 0, 36, 200, 100); S.note(9, 0, KIT.kick, 100, 90); },
  dash: S => { const c = S.chan(121, { rev: 15 }); S.bend(c, 0, -2); for (let i = 1; i <= 8; i++) S.bend(c, i * 20, -2 + i * 0.5); S.note(c, 0, 72, 260, 127); },
  hit: S => { const c = S.chan(GM.taiko, { rev: 15 }); const o = S.chan(55, { rev: 20, vol: 80 }); S.note(c, 0, 42, 300, 127); S.note(o, 0, 48, 200, 90); S.note(9, 0, KIT.clap, 100, 110); },
  boing: S => { const c = S.chan(GM.steel, { rev: 25 }); S.bend(c, 0, 2); for (let i = 1; i <= 14; i++) S.bend(c, i * 24, 2 - i * 0.28); S.note(c, 0, 67, 400, 120); },
  fall: S => { const c = S.chan(78, { rev: 40 }); S.bend(c, 0, 2); for (let i = 1; i <= 30; i++) S.bend(c, i * 40, 2 - i * 0.13); S.note(c, 0, 84, 1300, 110); const d = S.chan(78, { rev: 40 }); S.bend(d, 0, 2); for (let i = 1; i <= 30; i++) S.bend(d, i * 40, 2 - i * 0.13); S.note(d, 600, 72, 900, 100); },
  qualify: S => { const c = S.chan(GM.glock, { rev: 40 }); [0, 4, 7, 12, 16].forEach((n, i) => S.note(c, i * 70, 72 + n, 400, 115)); const a = S.chan(126, { vol: 70, rev: 30 }); S.note(a, 200, 60, 1400, 90); },
  out: S => { const c = S.chan(GM.tuba, { rev: 40 }); [[0, 55], [260, 54], [520, 53]].forEach(([t, p]) => S.note(c, t, p, 240, 110)); S.bend(c, 780, 0); S.note(c, 780, 52, 700, 110); for (let i = 1; i <= 20; i++) S.bend(c, 780 + i * 30, Math.sin(i) * 0.6 - i * 0.04); },
  peel: S => { const c = S.chan(GM.pizz, { rev: 20 }); S.bend(c, 0, 0); for (let i = 1; i <= 10; i++) S.bend(c, i * 15, -i * 0.2); S.note(c, 0, 60, 200, 120); S.note(9, 60, KIT.wblock, 60, 90); },
  slip: S => { const c = S.chan(GM.panflute, { rev: 30 }); S.bend(c, 0, -2); for (let i = 1; i <= 10; i++) S.bend(c, i * 20, -2 + i * 0.4); for (let i = 1; i <= 16; i++) S.bend(c, 200 + i * 25, 2 - i * 0.25); S.note(c, 0, 79, 600, 110); },
  quake: S => { const t = S.chan(GM.timpani, { rev: 50 }); for (let i = 0; i < 16; i++) S.note(t, i * 30, 36 + (i % 2) * 2, 60, 80 + i * 2); const d = S.chan(GM.taiko, { rev: 30 }); S.note(d, 0, 33, 800, 127); S.note(9, 480, KIT.crash, 300, 110); },
  ulta: S => { const c = S.chan(119, { rev: 30 }); S.note(c, 0, 60, 1100, 120); },
  crack: S => { for (let i = 0; i < 6; i++) S.note(9, i * 30 + Math.round(rnd() * 20), pick([KIT.wblock, 75, 77]), 40, 90 + rnd() * 30); },
  plop: S => { const c = S.chan(GM.marimba, { rev: 20 }); S.bend(c, 0, 2); for (let i = 1; i <= 8; i++) S.bend(c, i * 15, 2 - i * 0.5); S.note(c, 0, 60, 200, 110); },
  grab: S => { const c = S.chan(GM.celesta, { rev: 60 }); [0, 7, 12, 16, 19, 24].forEach((n, i) => S.note(c, i * 50, 76 + n, 500, 110)); },
  drop: S => { const c = S.chan(GM.glock, { rev: 40 }); [24, 19, 12, 7].forEach((n, i) => S.note(c, i * 60, 72 + n, 300, 100)); },
  beep: S => { const c = S.chan(80, { rev: 10 }); S.note(c, 0, 81, 160, 100); },
  go: S => { const b = S.chan(GM.brass, { rev: 40 }); for (const p of [62, 66, 69, 74]) S.note(b, 0, p, 700, 120); const d = S.chan(GM.taiko); S.note(d, 0, 36, 500, 127); S.note(9, 0, KIT.crash, 600, 120); },
  vote: S => { S.note(9, 0, KIT.wblock, 60, 110); const c = S.chan(GM.vibes, { rev: 30 }); S.note(c, 20, 84, 300, 90); },
  roll: S => { for (let i = 0; i < 48; i++) S.note(9, i * 30, KIT.snare, 30, 50 + i * 1.5); S.note(9, 1440, KIT.crash, 400, 120); },
  gong: S => { const c = S.chan(GM.taiko, { rev: 80 }); S.note(c, 0, 28, 2400, 127); S.note(9, 0, 52, 2000, 110); const s = S.chan(GM.slowStrings, { rev: 90, vol: 70 }); for (const p of [45, 52, 57]) S.note(s, 0, p, 2200, 80); },
  cheer: S => { const a = S.chan(126, { rev: 30 }); S.note(a, 0, 60, 2600, 120); const c = S.chan(GM.choir, { rev: 70, vol: 70 }); for (const p of [62, 66, 69]) S.note(c, 100, p, 1800, 90); },
  emote: S => { const c = S.chan(53, { rev: 30 }); S.bend(c, 0, -1); for (let i = 1; i <= 8; i++) S.bend(c, i * 20, -1 + i * 0.35); S.note(c, 0, 69, 260, 110); },
  wipe: S => { const c = S.chan(121, { rev: 30 }); for (let i = 0; i <= 12; i++) S.bend(c, i * 20, -2 + i * 0.33); S.note(c, 0, 76, 380, 120); },
  tick: S => { S.note(9, 0, KIT.wblock, 40, 80); },
  join: S => { const c = S.chan(GM.santoor, { rev: 50 }); [0, 4, 7].forEach((n, i) => S.note(c, i * 80, 74 + n, 400, 100)); }
};
const FX_LEN = { fall: 2.2, out: 2.0, qualify: 2.2, quake: 1.6, ulta: 1.4, grab: 1.2, roll: 2.4, gong: 4.0, cheer: 3.2, go: 1.6, join: 1.0 };

for (const [name, fn] of Object.entries(TRACKS)) {
  if (ONLY.length && !ONLY.includes(name) && !ONLY.includes('music')) continue;
  writeOgg('music_' + name, await fn(), 6);
}
for (const [name, fn] of Object.entries(FX)) {
  if (ONLY.length && !ONLY.includes('fx') && !ONLY.includes(name)) continue;
  seed = name.length * 97;
  writeOgg('fx_' + name, await oneShot(fn, FX_LEN[name] || 0.8), 5);
}
console.log('AUDIO DONE');
