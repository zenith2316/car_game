/* Dhakka Mukki authoritative rules, physics, maps and bots.
   Shared by the Android engine WebView, the Node dev host and the display (map geometry only).
   Fixed 60 Hz physics. All gameplay time is engine time, never wall-clock, so matches are reproducible in tests. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Dhakka = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

/* ---------- constants ---------- */
const W = 1600, H = 900, STEP = 1 / 60, R = 22;
const MAXS = 330, ACC = 11, G = 1700, JUMPV = 560, DASHV = 440, DASH_T = 0.22, DASH_CD = 1.1;
const KNOCK = 560, STUN_HIT = 0.6, SEATS = 10, BLAME_WINDOW = 3.5;
const NAMES = ['Bunty', 'Pinky', 'Golu', 'Chintu', 'Sweety', 'Pappu', 'Munna', 'Dolly', 'Raju', 'Tinku', 'Babli', 'Lalli'];
const EMOTES = ['Oye!', 'Arre!', 'Chalo!'];
const PHASE_SECS = { intro: 6, countdown: 3, roundEnd: 4.5, reveal: 9, scores: 7 };

/* ---------- utils ---------- */
function randomBytes(n) {
  const b = new Uint8Array(n);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(b);
  else if (typeof require === 'function') return Uint8Array.from(require('node:crypto').randomBytes(n));
  else throw Error('Secure random unavailable');
  return b;
}
function uid() { return Array.from(randomBytes(18), x => x.toString(16).padStart(2, '0')).join(''); }
function mulberry(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hyp = Math.hypot;
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d: hyp(px - cx, py - cy), cx, cy, t };
}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

/* ---------- maps ----------
   Every map is plain data plus pure functions of map time, so the display can draw the same geometry. */
function platPos(p, t) {
  const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / p.period + (p.phase || 0));
  return { x: p.ax + (p.bx - p.ax) * k, y: p.ay + (p.by - p.ay) * k };
}
function orbitPos(b, t) { return { x: b.ox + Math.cos(b.a0 + b.w * t) * b.orbit, y: b.oy + Math.sin(b.a0 + b.w * t) * b.orbit }; }

const MAPS = {
  aangan: () => ({
    id: 'aangan', name: 'Aangan Warm-up', kind: 'lobby', theme: 'aangan', duration: 0,
    blurb: 'Run, jump and practise your dhakka while everyone joins.',
    floors: [{ t: 'rect', x: 280, y: 250, w: 1040, h: 440 }],
    walls: [], plats: [], conveyors: [],
    bumpers: [{ x: 500, y: 480, r: 40 }, { x: 1100, y: 480, r: 40 }],
    sweepers: [{ x: 800, y: 590, len: 90, w: 24, arms: 2, speed: 1.4, h: 44 }],
    spawns: grid(800, 380, 5, 2, 110, 80), trapName: 'Ulta'
  }),
  tapri: () => ({
    id: 'tapri', name: 'Tapri Dash', kind: 'race', theme: 'tapri', duration: 90,
    blurb: 'Race to the chai tapri. Dodge the belans, ride the thalis or take the slow rope.',
    floors: [
      { t: 'rect', x: 40, y: 250, w: 230, h: 400 },      // start pad
      { t: 'rect', x: 268, y: 385, w: 360, h: 130 },     // belan bridge
      { t: 'rect', x: 626, y: 190, w: 200, h: 520 },     // island 1
      { t: 'rect', x: 700, y: 120, w: 126, h: 80 },      // ledge up to the rope
      { t: 'rect', x: 824, y: 120, w: 270, h: 56 },      // rope bridge (slow, top)
      { t: 'rect', x: 1092, y: 120, w: 216, h: 580 },    // island 2
      { t: 'rect', x: 1306, y: 330, w: 260, h: 240 }     // final run + tapri
    ],
    plats: [
      { x: 0, y: 0, w: 116, h: 116, ax: 846, ay: 250, bx: 846, by: 590, period: 4.2, phase: 0 },
      { x: 0, y: 0, w: 116, h: 116, ax: 966, ay: 590, bx: 966, by: 250, period: 4.2, phase: 0 }
    ],
    conveyors: [
      { x: 824, y: 120, w: 270, h: 56, vx: -95, vy: 0 },
      { x: 1306, y: 330, w: 170, h: 240, vx: -110, vy: 0 }
    ],
    walls: [], movers: [{ x: 0, y: 0, w: 34, h: 120, ax: 1400, ay: 330, bx: 1400, by: 450, period: 2.6, phase: 0 }],
    bumpers: [{ x: 1160, y: 270, r: 34 }, { x: 1240, y: 420, r: 34 }, { x: 1160, y: 560, r: 34 }, { x: 1250, y: 640, r: 30 }],
    sweepers: [
      { x: 360, y: 450, len: 112, w: 24, arms: 2, speed: 2.3, h: 44 },
      { x: 530, y: 450, len: 112, w: 24, arms: 2, speed: -2.7, h: 44 }
    ],
    checkpoints: [
      { x: 626, y: 190, w: 200, h: 520, sx: 690, sy: 450 },
      { x: 1092, y: 120, w: 216, h: 580, sx: 1150, sy: 380 }
    ],
    finish: { x: 1486, y: 330, w: 80, h: 240 },
    spawns: grid(150, 450, 2, 5, 80, 78), trapName: 'Ulta',
    route: [[150, 450], [275, 450], [620, 450], [720, 450], [760, 200], [830, 148], [1100, 148], [1150, 200], [1200, 340], [1300, 450], [1530, 450]]
  }),
  papad: () => {
    const tiles = [], r = 56, dx = 92, dy = 80; // r must exceed the triple-junction gap (~53) or players fall between papads
    for (let row = 0; row < 9; row++) for (let col = 0; col < 14; col++) {
      const x = 200 + col * dx + (row % 2 ? dx / 2 : 0), y = 130 + row * dy;
      if (x < 1440) tiles.push({ x, y, r });
    }
    return {
      id: 'papad', name: 'Papad Floor', kind: 'survive', theme: 'papad', duration: 60,
      blurb: 'Every papad cracks under your feet. Keep moving. Half of you survive.',
      floors: [], tiles, plats: [], conveyors: [], walls: [], movers: [], bumpers: [], sweepers: [],
      spawns: grid(800, 450, 5, 2, 120, 110), trapName: 'Crack'
    };
  },
  pankha: () => ({
    id: 'pankha', name: 'Pankha Panic', kind: 'survive', theme: 'pankha', duration: 60,
    blurb: 'The ceiling fan fell and it is still spinning. Jump the low blades. Half of you survive.',
    floors: [{ t: 'circ', x: 800, y: 470, r: 390 }],
    plats: [], conveyors: [], walls: [], movers: [], bumpers: [],
    sweepers: [
      { x: 800, y: 470, len: 380, w: 30, arms: 3, speed: 1.15, h: 46, ramp: 0.026 },
      { x: 800, y: 470, len: 150, w: 34, arms: 2, speed: -1.6, h: 999, ramp: 0.018 }
    ],
    spawns: ring(800, 470, 245, 10), trapName: 'Ulta'
  }),
  king: () => ({
    id: 'king', name: 'Dhakka King', kind: 'crown', theme: 'king', duration: 60,
    blurb: 'Final round. Grab the mukut and hold it. Every dhakka knocks it loose.',
    floors: [{ t: 'circ', x: 800, y: 470, r: 360 }],
    plats: [], conveyors: [], walls: [], movers: [],
    bumpers: [
      { x: 0, y: 0, r: 40, ox: 800, oy: 470, orbit: 230, a0: 0, w: 0.7 },
      { x: 0, y: 0, r: 40, ox: 800, oy: 470, orbit: 230, a0: Math.PI, w: 0.7 },
      { x: 0, y: 0, r: 30, ox: 800, oy: 470, orbit: 110, a0: Math.PI / 2, w: -1.1 }
    ],
    sweepers: [], spawns: ring(800, 470, 300, 10), trapName: ''
  })
};
function grid(cx, cy, cols, rows, sx, sy) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([cx + (c - (cols - 1) / 2) * sx, cy + (r - (rows - 1) / 2) * sy]);
  return out;
}
function ring(cx, cy, rad, n) { const out = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } return out; }
function buildMap(id) { const f = MAPS[id]; if (!f) throw Error('Unknown map ' + id); const m = f(); m.movers = m.movers || []; m.checkpoints = m.checkpoints || []; return m; }

/* Map dynamic state: sweeper angles, platform positions, tile states, trap effects. */
function newMapState(map) {
  return {
    t: 0, ang: map.sweepers.map((s, i) => i * 0.7), ulta: 0, ultaBy: null,
    plat: map.plats.map(p => platPos(p, 0)), mover: map.movers.map(p => platPos(p, 0)), bump: map.bumpers.map(b => b.orbit ? orbitPos(b, 0) : { x: b.x, y: b.y }),
    tiles: map.tiles ? map.tiles.map(() => 0) : null, tileBy: map.tiles ? map.tiles.map(() => null) : null, press: map.tiles ? map.tiles.map(() => 0) : null, heat: 4,
    peels: [], crown: map.kind === 'crown' ? { x: 800, y: 470, z: 0, vx: 0, vy: 0, vz: 0, holder: null, cool: 0 } : null
  };
}
const TILE_CRACK = 1.2, TILE_PRESS = 0.6;
function floorAt(map, ms, x, y) {
  for (let i = 0; i < map.plats.length; i++) { const p = map.plats[i], q = ms.plat[i]; if (x >= q.x && x <= q.x + p.w && y >= q.y && y <= q.y + p.h) return { k: 'plat', i }; }
  for (const f of map.floors) {
    if (f.t === 'rect' && inRect(x, y, f)) return { k: 'floor' };
    if (f.t === 'circ' && hyp(x - f.x, y - f.y) <= f.r) return { k: 'floor' };
  }
  if (map.tiles) for (let i = 0; i < map.tiles.length; i++) { const t = map.tiles[i]; if (ms.tiles[i] >= 0 && hyp(x - t.x, y - t.y) <= t.r) return { k: 'tile', i }; }
  return null;
}

/* ---------- engine ---------- */
class Engine {
  constructor(opts = {}) {
    this.hostToken = uid();
    this.room = uid().slice(0, 4).toUpperCase();
    this.rng = mulberry(opts.seed != null ? opts.seed : parseInt(uid().slice(0, 8), 16));
    this.clients = new Map();
    this.players = [];
    this.settings = { rounds: 5, saboteurs: true, talk: 45 };
    this.t = 0; this.acc = 0;
    this.phase = 'lobby'; this.phaseLeft = 0; this.paused = false;
    this.round = 0; this.playlist = []; this.history = []; this.lastSabo = [];
    this.out = []; this.fx = []; this.roomDirty = true; this.meTimer = 0; this.clock = 0;
    this.saboteurs = []; this.sabo = {}; this.votes = {}; this.result = null; this.quota = 0; this.finishOrder = []; this.outOrder = [];
    this.stats = { falls: 0, peels: 0, quakes: 0, tricks: 0, hits: 0 };
    this.loadMap('aangan');
  }

  /* ----- transport -----
     Output is a list of [target, text]. target is a client id, '*' (everyone), 'D' (displays), 'P' (players)
     or '#' (control line 'cid:D|P' telling the transport which group a client belongs to). */
  open(cid) { this.clients.set(cid, { cid, kind: 'new', host: false, pid: null, win: 0, count: 0 }); }
  close(cid) {
    const c = this.clients.get(cid); if (!c) return;
    const p = c.pid && this.byId(c.pid);
    if (p && p.cid === cid) { p.cid = null; p.online = false; p.inp.x = 0; p.inp.y = 0; this.roomDirty = true; }
    this.clients.delete(cid);
  }
  send(cid, o) { this.out.push([cid, JSON.stringify(o)]); }
  cast(group, o) { this.out.push([group, JSON.stringify(o)]); }
  drain() { const o = this.out; this.out = []; return o; }
  err(cid, code, msg) { this.send(cid, { t: 'err', code, msg }); }
  buzz(p, k) { if (p && p.cid) this.send(p.cid, { t: 'bz', k }); }

  message(cid, text) {
    const c = this.clients.get(cid); if (!c || typeof text !== 'string' || text.length > 2000) return;
    const sec = Math.floor(this.clock); if (c.win !== sec) { c.win = sec; c.count = 0; }
    if (++c.count > 120) return;
    let m; try { m = JSON.parse(text); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { this.handle(c, m); } catch (e) { this.err(cid, e.code || 'error', e.message || 'That did not work.'); }
  }

  handle(c, m) {
    const p = c.pid ? this.byId(c.pid) : null;
    switch (m.t) {
      case 'hello': {
        if (m.role === 'display') {
          c.kind = 'display'; c.host = typeof m.host === 'string' && m.host === this.hostToken;
          this.out.push(['#', c.cid + ':D']);
          this.send(c.cid, { t: 'welcome', role: 'display', host: c.host, room: this.room });
          this.send(c.cid, this.roomState());
          return;
        }
        // the host may also play: a player connection that carries the host token gets host rights too
        c.kind = 'player'; c.host = typeof m.host === 'string' && m.host === this.hostToken;
        this.out.push(['#', c.cid + ':P']);
        const seat = typeof m.token === 'string' && this.players.find(x => x.token === m.token);
        if (seat) {
          if (seat.cid && seat.cid !== c.cid) { const old = this.clients.get(seat.cid); if (old) { old.pid = null; this.err(old.cid, 'replaced', 'This seat was opened on another screen.'); } }
          seat.cid = c.cid; seat.online = true; c.pid = seat.id; seat.inp.lj = null; seat.inp.ld = null;
          this.send(c.cid, { t: 'welcome', role: 'player', id: seat.id, token: seat.token, room: this.room, host: c.host });
          this.roomDirty = true; this.sendMe(seat);
        } else this.send(c.cid, { t: 'welcome', role: 'player', id: null, room: this.room, host: c.host });
        this.send(c.cid, this.roomState());
        return;
      }
      case 'ping': this.send(c.cid, { t: 'pong', c: m.c }); return;
      case 'join': {
        if (c.kind !== 'player') fail('role', 'Open the player page to join.');
        if (p) { this.send(c.cid, { t: 'welcome', role: 'player', id: p.id, token: p.token, room: this.room, host: c.host }); return; }
        const name = String(m.name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 1 || name.length > 14 || /[\u0000-\u001f<>]/.test(name)) fail('name', 'Use a name of 1 to 14 characters.');
        if (this.players.some(x => x.name.toLowerCase() === name.toLowerCase())) fail('name', 'Someone already has that name.');
        if (this.players.length >= SEATS) fail('full', 'All ten spots are taken.');
        const n = this.addPlayer(name, m.color, m.look, false);
        n.cid = c.cid; n.online = true; c.pid = n.id;
        this.send(c.cid, { t: 'welcome', role: 'player', id: n.id, token: n.token, room: this.room, host: c.host });
        this.sendMe(n); return;
      }
      case 'look': {
        if (!p) fail('seat', 'Join first.');
        if (!['lobby', 'finished'].includes(this.phase)) fail('phase', 'Change your look between matches.');
        if (Number.isInteger(m.color) && m.color >= 0 && m.color < SEATS && m.color !== p.color) {
          if (this.players.some(x => x.color === m.color)) fail('color', 'That colour is taken.');
          p.color = m.color;
        }
        if (Number.isInteger(m.look) && m.look >= 0 && m.look < 10) p.look = m.look;
        this.roomDirty = true; this.sendMe(p); return;
      }
      case 'ready': if (!p) fail('seat', 'Join first.'); p.ready = m.on === true; this.roomDirty = true; this.sendMe(p); return;
      case 'in': {
        if (!p) return;
        const x = Number(m.x) || 0, y = Number(m.y) || 0, l = hyp(x, y);
        p.inp.x = l > 1 ? x / l : x; p.inp.y = l > 1 ? y / l : y;
        if (Number.isInteger(m.j)) { if (p.inp.lj === null) p.inp.lj = m.j; else if (m.j !== p.inp.lj) { p.inp.lj = m.j; p.inp.jump = true; } }
        if (Number.isInteger(m.d)) { if (p.inp.ld === null) p.inp.ld = m.d; else if (m.d !== p.inp.ld) { p.inp.ld = m.d; p.inp.dash = true; } }
        return;
      }
      case 'trap': if (!p) return; this.useTrap(p, m.k); return;
      case 'emote': if (!p || !(Number.isInteger(m.k) && m.k >= 0 && m.k < 3)) return; if (p.b.emoteT <= 0) { p.b.emoteT = 1.6; this.fx.push(['e', p.color, m.k]); } return;
      case 'vote': {
        if (!p) fail('seat', 'Join first.');
        if (this.phase !== 'panchayat' || !this.inRound(p)) fail('phase', 'Voting is closed.');
        if (this.votes[p.id]) fail('voted', 'Your vote is locked in.');
        if (m.target !== 'skip' && (!this.inRound(this.byId(m.target)) || m.target === p.id)) fail('vote', 'Vote for someone else, or skip.');
        this.votes[p.id] = m.target; this.roomDirty = true; this.sendMe(p);
        if (this.roundPlayers().every(x => this.votes[x.id])) this.phaseLeft = Math.min(this.phaseLeft, 1.2);
        return;
      }
      case 'leave': if (!p) return; this.removePlayer(p.id); c.pid = null; this.send(c.cid, { t: 'welcome', role: 'player', id: null, room: this.room, host: c.host }); return;
      case 'host': if (!c.host) fail('permission', 'Only the host can do that.'); this.hostAction(m); return;
      default: return;
    }
  }

  hostAction(m) {
    switch (m.a) {
      case 'settings': {
        if (this.phase !== 'lobby' && this.phase !== 'finished') fail('phase', 'Change settings between matches.');
        const s = m.settings || {};
        if ([3, 5, 7].includes(s.rounds)) this.settings.rounds = s.rounds;
        if (typeof s.saboteurs === 'boolean') this.settings.saboteurs = s.saboteurs;
        if ([30, 45, 60, 90].includes(s.talk)) this.settings.talk = s.talk;
        break;
      }
      case 'addBot': {
        if (this.players.length >= SEATS) fail('full', 'All ten spots are taken.');
        const name = NAMES.find(n => !this.players.some(p => p.name === n)) || ('Bot ' + (this.players.length + 1));
        this.addPlayer(name, -1, Math.floor(this.rng() * 10), true); break;
      }
      case 'kick': { const p = this.byId(m.id); if (!p) fail('player', 'Player not found.'); if (p.cid) this.err(p.cid, 'kicked', 'The host removed you from the room.'); this.removePlayer(p.id); break; }
      case 'start': {
        if (this.phase !== 'lobby' && this.phase !== 'finished') fail('phase', 'A match is already running.');
        if (this.players.length < 3) fail('players', 'At least three players are needed. Add bots to fill seats.');
        this.startMatch(); break;
      }
      case 'pause': if (['lobby', 'finished'].includes(this.phase)) fail('phase', 'Nothing to pause.'); this.paused = true; break;
      case 'resume': this.paused = false; break;
      case 'skip': if (['lobby', 'finished'].includes(this.phase)) fail('phase', 'Nothing to skip.'); this.paused = false; this.phaseLeft = 0; if (this.phase === 'play') this.endRound(); else this.advance(); break;
      case 'lobby': this.toLobby(); break;
      case 'end': if (this.phase === 'lobby') fail('phase', 'No match running.'); this.finish(); break;
      default: fail('action', 'Unknown host action.');
    }
    this.roomDirty = true;
  }

  /* ----- players ----- */
  byId(id) { return this.players.find(p => p.id === id); }
  addPlayer(name, color, look, bot) {
    if (!(Number.isInteger(color) && color >= 0 && color < SEATS) || this.players.some(x => x.color === color)) {
      for (let i = 0; i < SEATS; i++) if (!this.players.some(x => x.color === i)) { color = i; break; }
    }
    const n = {
      id: uid().slice(0, 12), token: uid(), name, color, look: Number.isInteger(look) && look >= 0 && look < 10 ? look : 0,
      bot, online: bot, cid: null, ready: bot, score: 0, waiting: !['lobby', 'finished'].includes(this.phase),
      inp: { x: 0, y: 0, lj: null, ld: null, jump: false, dash: false }, b: null, ai: { tx: 0, ty: 0, think: 0, wp: 0, j: 0, d: 0, vote: 2 + this.rng() * 10 }
    };
    this.players.push(n);
    this.spawn(n, this.players.length - 1);
    this.roomDirty = true; return n;
  }
  removePlayer(id) {
    const p = this.byId(id); if (!p) return;
    this.players = this.players.filter(x => x !== p);
    if (this.votes) delete this.votes[id];
    if (this.ms.crown && this.ms.crown.holder === id) this.dropCrown(p);
    if (this.saboteurs) this.saboteurs = this.saboteurs.filter(x => x !== id);
    this.roomDirty = true;
  }
  inRound(p) { return !!p && !p.waiting; }
  roundPlayers() { return this.players.filter(p => !p.waiting); }
  spawn(p, i) {
    const s = this.map.spawns[i % this.map.spawns.length];
    p.b = { x: s[0] + (this.rng() - 0.5) * 6, y: s[1] + (this.rng() - 0.5) * 6, vx: 0, vy: 0, z: 0, vz: 0, face: this.map.kind === 'race' ? 0 : Math.atan2(470 - s[1], 800 - s[0]), stun: 0, dash: 0, dashCd: 0, state: 'run', fallT: 0, cp: -1, inv: 0, slip: 0, hit: null, hold: 0, emoteT: 0, place: 0, cd: [4, 4, 4], tile: -1 };
  }

  /* ----- match flow ----- */
  loadMap(id) { this.map = buildMap(id); this.ms = newMapState(this.map); this.players.forEach((p, i) => this.spawn(p, i)); }
  startMatch() {
    this.players.forEach(p => { p.score = 0; p.waiting = false; p.last = 0; });
    const pool = ['tapri', 'papad', 'pankha'], list = [];
    let bag = [];
    while (list.length < this.settings.rounds - 1) { if (!bag.length) bag = shuffle(pool.slice(), this.rng); const n = bag.pop(); if (list[list.length - 1] !== n) list.push(n); else bag.unshift(n); }
    list.push('king');
    this.playlist = list; this.round = 0; this.history = []; this.lastSabo = []; this.paused = false;
    this.nextRound();
  }
  nextRound() {
    this.round++;
    this.players.forEach(p => { p.waiting = false; });
    this.loadMap(this.playlist[this.round - 1]);
    const ps = this.roundPlayers();
    this.saboteurs = [];
    if (this.settings.saboteurs && this.map.kind !== 'crown' && ps.length >= 3) {
      const count = ps.length >= 7 ? 2 : 1;
      let pool = ps.filter(p => !this.lastSabo.includes(p.id)); if (pool.length < count) pool = ps.slice();
      this.saboteurs = shuffle(pool, this.rng).slice(0, count).map(p => p.id);
      this.lastSabo = this.saboteurs.slice();
    }
    this.sabo = {}; this.saboteurs.forEach(id => { this.sabo[id] = 0; });
    this.finishOrder = []; this.outOrder = []; this.votes = {}; this.result = null; this.stats = { falls: 0, peels: 0, quakes: 0, tricks: 0, hits: 0 };
    this.quota = this.map.kind === 'race' ? Math.max(1, Math.ceil(ps.length * 0.6)) : this.map.kind === 'survive' ? Math.max(1, Math.floor(ps.length * 0.5)) : 0;
    this.setPhase('intro', PHASE_SECS.intro);
    this.players.forEach(p => this.sendMe(p));
  }
  setPhase(ph, secs) { this.phase = ph; this.phaseLeft = secs; this.roomDirty = true; this.players.forEach(p => { p.meDirty = true; }); }
  advance() {
    switch (this.phase) {
      case 'intro': this.setPhase('countdown', PHASE_SECS.countdown); break;
      case 'countdown': this.setPhase('play', this.map.duration); this.fx.push(['go']); break;
      case 'play': this.endRound(); break;
      case 'roundEnd':
        if (this.saboteurs.length) this.setPhase('panchayat', this.settings.talk);
        else { this.applyRound(); this.setPhase('scores', PHASE_SECS.scores); }
        break;
      case 'panchayat': this.closeVotes(); this.setPhase('reveal', PHASE_SECS.reveal); break;
      case 'reveal': this.setPhase('scores', PHASE_SECS.scores); break;
      case 'scores': if (this.round >= this.playlist.length) this.finish(); else this.nextRound(); break;
    }
  }
  toLobby() { this.phase = 'lobby'; this.paused = false; this.round = 0; this.saboteurs = []; this.result = null; this.players.forEach(p => { p.waiting = false; p.ready = p.bot; }); this.loadMap('aangan'); this.roomDirty = true; this.players.forEach(p => this.sendMe(p)); }
  finish() {
    this.phase = 'finished'; this.paused = false; this.saboteurs = []; this.phaseLeft = 0; this.loadMap('aangan');
    const ranked = this.players.slice().sort((a, b) => b.score - a.score);
    this.podium = ranked.slice(0, 3).map(p => p.id);
    this.roomDirty = true; this.players.forEach(p => this.sendMe(p));
  }

  endRound() {
    const ps = this.roundPlayers(), gains = {}, notes = {};
    ps.forEach(p => { gains[p.id] = 0; notes[p.id] = []; });
    let qualified = [];
    if (this.map.kind === 'race') {
      qualified = this.finishOrder.slice();
      qualified.forEach((id, i) => { gains[id] += 3 + (i === 0 ? 2 : i === 1 ? 1 : 0); notes[id].push(i === 0 ? 'Won the race' : 'Qualified #' + (i + 1)); });
    } else if (this.map.kind === 'survive') {
      qualified = ps.filter(p => p.b.state !== 'out').map(p => p.id);
      qualified.forEach(id => { gains[id] += 3; notes[id].push('Survived'); });
    } else if (this.map.kind === 'crown') {
      const ranked = ps.filter(p => p.b.hold > 0).sort((a, b) => b.b.hold - a.b.hold);
      ranked.forEach((p, i) => { const g = [6, 4, 2][i] || 1; gains[p.id] += g; notes[p.id].push('Mukut held ' + p.b.hold.toFixed(1) + 's'); });
      qualified = ranked.slice(0, 3).map(p => p.id);
    }
    this.result = { qualified, gains, notes, sabo: Object.assign({}, this.sabo), caught: [], ejected: null, tally: {}, votes: {}, revealed: false };
    this.setPhase('roundEnd', PHASE_SECS.roundEnd);
    this.fx.push(['end']);
  }
  closeVotes() {
    const r = this.result, tally = {}; let skip = 0;
    for (const [voter, target] of Object.entries(this.votes)) {
      if (target === 'skip') { skip++; continue; }
      tally[target] = (tally[target] || 0) + 1;
      if (this.saboteurs.includes(voter)) continue;
      if (this.saboteurs.includes(target)) { r.gains[voter] = (r.gains[voter] || 0) + 2; (r.notes[voter] = r.notes[voter] || []).push('Spotted the Chupa Rustam'); }
      else { r.gains[voter] = (r.gains[voter] || 0) - 1; (r.notes[voter] = r.notes[voter] || []).push('Blamed an innocent'); }
    }
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (top.length && top[0][1] > skip && (top.length === 1 || top[0][1] > top[1][1])) r.ejected = top[0][0];
    for (const id of this.saboteurs) {
      const s = Math.min(5, this.sabo[id] || 0);
      if (r.ejected === id) { r.caught.push(id); (r.notes[id] = r.notes[id] || []).push('Caught by the Panchayat'); }
      else { r.gains[id] = (r.gains[id] || 0) + 3 + s; (r.notes[id] = r.notes[id] || []).push('Got away with ' + s + ' sabotage' + (s === 1 ? '' : 's')); }
    }
    r.tally = tally; r.skip = skip; r.votes = Object.assign({}, this.votes); r.revealed = true; r.saboteurs = this.saboteurs.slice();
    this.applyRound();
  }
  applyRound() {
    const r = this.result; if (!r || r.applied) return; r.applied = true;
    for (const p of this.players) { const g = r.gains[p.id] || 0; p.last = g; p.score = Math.max(0, p.score + g); }
    this.history.push({ round: this.round, map: this.map.name, qualified: r.qualified.length, saboteurs: (this.saboteurs || []).map(id => (this.byId(id) || {}).name || 'Left'), caught: r.caught.length });
    this.players.forEach(p => this.sendMe(p));
  }

  /* ----- traps ----- */
  trapNames() { return ['Kela', 'Bhookamp', this.map.trapName || 'Ulta']; }
  useTrap(p, k) {
    if (this.phase !== 'play' || !this.saboteurs.includes(p.id) || p.b.state !== 'run' || !(k === 0 || k === 1 || k === 2)) return;
    const b = p.b; if (b.cd[k] > 0) return;
    const jx = (this.rng() - 0.5) * 80, jy = (this.rng() - 0.5) * 80;
    if (k === 0) {
      if (this.ms.peels.length >= 8) this.ms.peels.shift();
      const x = b.x - Math.cos(b.face) * 34, y = b.y - Math.sin(b.face) * 34;
      this.ms.peels.push({ x, y, life: 14, by: p.id }); b.cd[0] = 6; this.stats.peels++; this.fx.push(['k', x | 0, y | 0]);
    } else if (k === 1) {
      const cx = b.x + jx, cy = b.y + jy;
      for (const q of this.roundPlayers()) {
        if (q === p || q.b.state !== 'run' || q.b.z > 30) continue;
        const d = hyp(q.b.x - cx, q.b.y - cy); if (d > 230) continue;
        const nx = (q.b.x - cx) / (d || 1), ny = (q.b.y - cy) / (d || 1), f = 220 + 420 * (1 - d / 230);
        q.b.vx += nx * f; q.b.vy += ny * f; q.b.vz = 260; q.b.stun = Math.max(q.b.stun, 0.45); q.b.hit = { by: p.id, t: this.t };
      }
      b.cd[1] = 9; this.stats.quakes++; this.fx.push(['w', cx | 0, cy | 0]);
    } else {
      if (this.map.kind === 'race' || this.map.id === 'pankha' || this.map.kind === 'lobby') { this.ms.ulta = 3.5; this.ms.ultaBy = p.id; this.fx.push(['u']); }
      else if (this.ms.tiles) {
        const cx = b.x + jx, cy = b.y + jy;
        this.map.tiles.forEach((t, i) => { if (this.ms.tiles[i] === 0 && hyp(t.x - cx, t.y - cy) < 150) { this.ms.tiles[i] = 0.001; this.ms.tileBy[i] = p.id; } });
        this.fx.push(['c', cx | 0, cy | 0]);
      }
      b.cd[2] = 11; this.stats.tricks++;
    }
    this.sendMe(p);
  }

  /* ----- main loop ----- */
  update(ms) {
    const dt = clamp(Number(ms) || 0, 0, 250) / 1000;
    this.clock += dt;
    if (!this.paused) {
      this.acc += dt; let n = 0;
      while (this.acc >= STEP && n < 12) { this.acc -= STEP; n++; this.fixed(STEP); }
      if (n === 12) this.acc = 0;
    }
    this.flush(dt);
    return this.drain();
  }
  physicsOn() { return ['lobby', 'play', 'roundEnd', 'finished'].includes(this.phase); }
  fixed(dt) {
    this.t += dt;
    if (this.physicsOn()) this.simulate(dt);
    if (!['lobby', 'finished'].includes(this.phase)) {
      this.phaseLeft -= dt;
      if (this.phase === 'play') this.checkRoundEnd();
      if (this.phase === 'panchayat') this.botVotes(dt);
      if (this.phaseLeft <= 0) this.advance();
    }
  }
  checkRoundEnd() {
    const ps = this.roundPlayers(); if (!ps.length) return this.endRound();
    if (this.map.kind === 'race' && (this.finishOrder.length >= this.quota || ps.every(p => p.b.state === 'done'))) this.endRound();
    if (this.map.kind === 'survive' && ps.filter(p => p.b.state !== 'out').length <= this.quota) this.endRound();
  }
  botVotes(dt) {
    for (const p of this.roundPlayers()) {
      if (!p.bot || this.votes[p.id]) continue;
      p.ai.vote -= dt; if (p.ai.vote > 0) continue;
      const others = this.roundPlayers().filter(q => q !== p);
      let target = 'skip';
      const r = this.rng();
      if (this.saboteurs.includes(p.id)) target = others.filter(q => !this.saboteurs.includes(q.id))[Math.floor(this.rng() * Math.max(1, others.length - this.saboteurs.length))]?.id || 'skip';
      else if (r < 0.45) target = this.saboteurs[Math.floor(this.rng() * this.saboteurs.length)];
      else if (r < 0.9 && others.length) target = others[Math.floor(this.rng() * others.length)].id;
      this.votes[p.id] = target || 'skip'; this.roomDirty = true;
      p.ai.vote = 2 + this.rng() * 10;
      if (this.roundPlayers().every(x => this.votes[x.id])) this.phaseLeft = Math.min(this.phaseLeft, 1.2);
    }
  }

  simulate(dt) {
    const map = this.map, ms = this.ms, playing = this.phase === 'play' || this.phase === 'lobby' || this.phase === 'finished';
    ms.t += dt;
    const ultaK = ms.ulta > 0 ? -1.7 : 1; if (ms.ulta > 0) { ms.ulta -= dt; if (ms.ulta <= 0) ms.ultaBy = null; }
    const el = this.phase === 'play' ? map.duration - this.phaseLeft : 99, spin = Math.min(1, el / 2.5);
    ms.spin = spin;
    map.sweepers.forEach((s, i) => { const sp = s.speed * spin * (1 + (s.ramp || 0) * (this.phase === 'play' ? el : 0)); ms.ang[i] += sp * ultaK * dt; });
    const platD = map.plats.map((p, i) => { const n = platPos(p, ms.t), o = ms.plat[i]; ms.plat[i] = n; return { dx: n.x - o.x, dy: n.y - o.y }; });
    map.movers.forEach((p, i) => { ms.mover[i] = platPos(p, ms.t); });
    map.bumpers.forEach((b, i) => { if (b.orbit) ms.bump[i] = orbitPos(b, ms.t); });
    if (ms.tiles && this.phase === 'play') {
      // the oil heats up: random papads crack, faster as the round goes on
      ms.heat -= dt;
      if (ms.heat <= 0) { const el2 = map.duration - this.phaseLeft; ms.heat = el2 > 40 ? 0.5 : el2 > 20 ? 1 : 1.8; const solid = []; ms.tiles.forEach((v, i) => { if (v === 0) solid.push(i); }); for (let k = 0; k < (el2 > 30 ? 3 : 2) && solid.length; k++) ms.tiles[solid.splice(Math.floor(this.rng() * solid.length), 1)[0]] = 0.001; }
    }
    if (ms.tiles) for (let i = 0; i < ms.tiles.length; i++) if (ms.tiles[i] > 0) { ms.tiles[i] += dt; if (ms.tiles[i] >= TILE_CRACK) { ms.tiles[i] = -1; this.fx.push(['tf', i]); } }
    for (const pe of ms.peels) pe.life -= dt; ms.peels = ms.peels.filter(pe => pe.life > 0);

    const bodies = this.players.filter(p => !p.waiting);
    for (const p of bodies) if (p.bot && playing) this.botThink(p, dt);

    for (const p of bodies) {
      const b = p.b;
      if (b.state === 'fall') { b.fallT -= dt; b.z -= 600 * dt; if (b.fallT <= 0) this.afterFall(p); continue; }
      if (b.state !== 'run') continue;
      b.stun = Math.max(0, b.stun - dt); b.dash = Math.max(0, b.dash - dt); b.dashCd = Math.max(0, b.dashCd - dt);
      b.inv = Math.max(0, b.inv - dt); b.slip = Math.max(0, b.slip - dt); b.emoteT = Math.max(0, b.emoteT - dt);
      for (let k = 0; k < 3; k++) if (this.phase === 'play') b.cd[k] = Math.max(0, b.cd[k] - dt);
      const ground = b.z <= 0, live = playing && this.phase !== 'roundEnd';
      let ix = live ? p.inp.x : 0, iy = live ? p.inp.y : 0;
      let ctrl = (b.stun > 0 || b.dash > 0) ? 0 : ground ? 1 : 0.5;
      if (b.slip > 0) ctrl *= 0.12;
      const holder = ms.crown && ms.crown.holder === p.id;
      const sp = MAXS * (holder ? 0.86 : 1);
      if (ctrl > 0) { const k = 1 - Math.exp(-ACC * ctrl * dt); b.vx += (ix * sp - b.vx) * k; b.vy += (iy * sp - b.vy) * k; }
      else if (ground && b.dash <= 0) { const f = Math.exp(-(b.slip > 0 ? 0.6 : 4.6) * dt); b.vx *= f; b.vy *= f; }
      if ((ix || iy) && b.stun <= 0) { const a = Math.atan2(iy, ix); let d = a - b.face; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; b.face += d * Math.min(1, 14 * dt); }
      if (p.inp.jump) { p.inp.jump = false; if (live && ground && b.stun <= 0) { b.vz = JUMPV; this.fx.push(['j', b.x | 0, b.y | 0, p.color]); } }
      if (p.inp.dash) { p.inp.dash = false; if (live && b.dashCd <= 0 && b.stun <= 0) { b.dash = DASH_T; b.dashCd = DASH_CD; b.vx += Math.cos(b.face) * DASHV; b.vy += Math.sin(b.face) * DASHV; const s = hyp(b.vx, b.vy); if (s > 720) { b.vx *= 720 / s; b.vy *= 720 / s; } if (ground) b.vz = 160; this.fx.push(['d', b.x | 0, b.y | 0, p.color]); } }
      if (ground) {
        const f = floorAt(map, ms, b.x, b.y);
        if (f && f.k === 'plat') { b.x += platD[f.i].dx; b.y += platD[f.i].dy; }
        for (const c of map.conveyors) if (inRect(b.x, b.y, c)) { b.x += c.vx * ultaK * dt; b.y += c.vy * ultaK * dt; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.z > 0 || b.vz > 0) { b.vz -= G * dt; b.z += b.vz * dt; if (b.z <= 0) { b.z = 0; b.vz = 0; this.fx.push(['l', b.x | 0, b.y | 0, p.color]); } }
    }
    this.collide(bodies, dt);
    for (const p of bodies) if (p.b.state === 'run') this.zones(p, dt);
    if (ms.crown) this.crownStep(bodies, dt);
  }

  collide(bodies, dt) {
    const map = this.map, ms = this.ms, live = bodies.filter(p => p.b.state === 'run');
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i].b, c = live[j].b; if (Math.abs(a.z - c.z) > 40) continue;
      let dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy); if (d >= 2 * R || (a.inv > 0 && c.inv > 0)) continue;
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
      a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
      const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rel < 0) { const im = -(1.45) * rel / 2; a.vx -= im * nx; a.vy -= im * ny; c.vx += im * nx; c.vy += im * ny; }
      const hit = (atk, vic, sx, sy, pa, pv) => {
        if (vic.inv > 0) return;
        vic.vx = sx * KNOCK + atk.vx * 0.25; vic.vy = sy * KNOCK + atk.vy * 0.25; vic.vz = Math.max(vic.vz, 220);
        vic.stun = STUN_HIT; vic.hit = { by: pa.id, t: this.t }; atk.dash = 0; atk.vx *= 0.3; atk.vy *= 0.3; this.buzz(pv, 'hit'); this.buzz(pa, 'bonk');
        this.stats.hits++; this.fx.push(['h', ((atk.x + vic.x) / 2) | 0, ((atk.y + vic.y) / 2) | 0, pv.color]);
        if (ms.crown && ms.crown.holder === pv.id) this.dropCrown(pv);
      };
      if (a.dash > 0 && c.dash <= 0) hit(a, c, nx, ny, live[i], live[j]);
      else if (c.dash > 0 && a.dash <= 0) hit(c, a, -nx, -ny, live[j], live[i]);
      else if (a.dash > 0 && c.dash > 0) { a.vx = -nx * KNOCK * 0.7; a.vy = -ny * KNOCK * 0.7; c.vx = nx * KNOCK * 0.7; c.vy = ny * KNOCK * 0.7; a.dash = c.dash = 0; a.stun = c.stun = 0.35; this.fx.push(['h', ((a.x + c.x) / 2) | 0, ((a.y + c.y) / 2) | 0, -1]); }
    }
    for (const p of live) {
      const b = p.b;
      for (let i = 0; i < map.bumpers.length; i++) {
        const q = ms.bump[i], r = map.bumpers[i].r; if (b.z > 60) continue;
        const dx = b.x - q.x, dy = b.y - q.y, d = hyp(dx, dy); if (d >= r + R) continue;
        const nx = dx / (d || 1), ny = dy / (d || 1); b.x = q.x + nx * (r + R); b.y = q.y + ny * (r + R);
        const vn = b.vx * nx + b.vy * ny; b.vx -= 2 * Math.min(0, vn) * nx; b.vy -= 2 * Math.min(0, vn) * ny; b.vx += nx * 520; b.vy += ny * 520; b.stun = Math.max(b.stun, 0.25);
        this.fx.push(['b', q.x | 0, q.y | 0]);
        if (ms.crown && ms.crown.holder === p.id) this.dropCrown(p);
      }
      for (let i = 0; i < map.sweepers.length; i++) {
        const s = map.sweepers[i]; if (b.z >= s.h) continue;
        const sp = s.speed * (ms.spin == null ? 1 : ms.spin) * (this.ms.ulta > 0 ? -1.7 : 1);
        for (let k = 0; k < s.arms; k++) {
          const a = ms.ang[i] + k * 2 * Math.PI / s.arms, ex = s.x + Math.cos(a) * s.len, ey = s.y + Math.sin(a) * s.len;
          const g = segDist(b.x, b.y, s.x, s.y, ex, ey), lim = s.w / 2 + R; if (g.d >= lim) continue;
          let nx = (b.x - g.cx) / (g.d || 1), ny = (b.y - g.cy) / (g.d || 1);
          const rr = g.t * s.len, tx = -Math.sin(a) * sp * rr, ty = Math.cos(a) * sp * rr;
          if (nx * tx + ny * ty < 0 && g.d < lim * 0.6) { nx = -nx; ny = -ny; }
          b.x = g.cx + nx * lim; b.y = g.cy + ny * lim;
          const strength = Math.min(900, Math.abs(sp * rr));
          b.vx = tx * 0.95 + nx * (110 + strength * 0.25); b.vy = ty * 0.95 + ny * (110 + strength * 0.25); b.vz = Math.max(b.vz, 180);
          if (strength > 200) { b.stun = Math.max(b.stun, 0.4); this.fx.push(['h', b.x | 0, b.y | 0, p.color]); if (ms.crown && ms.crown.holder === p.id) this.dropCrown(p); }
          if (ms.ultaBy) b.hit = { by: ms.ultaBy, t: this.t };
        }
      }
      for (let i = 0; i < map.movers.length; i++) {
        const m = map.movers[i], q = ms.mover[i]; if (b.z > 50) continue;
        const cx = clamp(b.x, q.x, q.x + m.w), cy = clamp(b.y, q.y, q.y + m.h), dx = b.x - cx, dy = b.y - cy, d = hyp(dx, dy);
        if (d >= R) continue;
        if (d > 0.01) { b.x = cx + dx / d * R; b.y = cy + dy / d * R; b.vx += dx / d * 120; b.vy += dy / d * 120; }
        else { const up = b.y - q.y < q.y + m.h - b.y; b.y = up ? q.y - R : q.y + m.h + R; b.vy = up ? -380 : 380; }
      }
    }
  }

  zones(p, dt) {
    const b = p.b, map = this.map, ms = this.ms;
    if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) return this.startFall(p);
    if (b.z > 0) return;
    const f = floorAt(map, ms, b.x, b.y);
    if (!f) return this.startFall(p);
    if (f.k === 'tile') { b.tile = f.i; if (ms.tiles[f.i] === 0 && this.phase === 'play' && this.map.duration - this.phaseLeft > 2 && (ms.press[f.i] += dt * (hyp(b.vx, b.vy) < 150 ? 1 : 0.3)) >= TILE_PRESS) ms.tiles[f.i] = 0.001; }
    for (const pe of ms.peels) if (hyp(pe.x - b.x, pe.y - b.y) < 30 && b.slip <= 0) {
      pe.life = 0; b.slip = 1.1; b.stun = Math.max(b.stun, 0.9);
      const s = Math.max(260, hyp(b.vx, b.vy)) * 1.5; b.vx = Math.cos(b.face) * s; b.vy = Math.sin(b.face) * s;
      if (pe.by !== p.id) b.hit = { by: pe.by, t: this.t };
      this.buzz(p, 'slip');
      this.fx.push(['s', b.x | 0, b.y | 0, p.color]);
    }
    if (map.kind === 'race' && this.phase === 'play') {
      map.checkpoints.forEach((c, i) => { if (i > b.cp && inRect(b.x, b.y, c)) b.cp = i; });
      if (inRect(b.x, b.y, map.finish)) {
        b.state = 'done'; this.finishOrder.push(p.id); b.place = this.finishOrder.length; b.vx = b.vy = 0;
        this.fx.push(['q', p.color, b.place]); this.roomDirty = true; this.sendMe(p);
      }
    }
  }
  startFall(p) {
    const b = p.b; b.state = 'fall'; b.fallT = 0.85; this.stats.falls++; this.buzz(p, 'fall');
    this.fx.push(['f', b.x | 0, b.y | 0, p.color]);
    if (this.ms.crown && this.ms.crown.holder === p.id) this.dropCrown(p);
    if (this.phase !== 'play') return;
    let by = b.hit && this.t - b.hit.t < BLAME_WINDOW ? b.hit.by : null;
    if (!by && this.ms.tileBy && b.tile >= 0 && this.ms.tileBy[b.tile]) by = this.ms.tileBy[b.tile];
    if (by && by !== p.id && this.saboteurs.includes(by)) this.sabo[by] = (this.sabo[by] || 0) + 1;
  }
  afterFall(p) {
    const b = p.b, kind = this.map.kind;
    if (kind === 'survive' && this.phase === 'play') { b.state = 'out'; this.outOrder.push(p.id); this.fx.push(['o', p.color]); this.roomDirty = true; this.sendMe(p); return; }
    let sx, sy;
    if (kind === 'race' && b.cp >= 0) { const c = this.map.checkpoints[b.cp]; sx = c.sx; sy = c.sy; }
    else { const s = this.map.spawns[Math.floor(this.rng() * this.map.spawns.length)]; sx = s[0]; sy = s[1]; }
    if (this.ms.tiles) { let best = -1, bd = 1e9; this.map.tiles.forEach((t, i) => { if (this.ms.tiles[i] === 0) { const d = hyp(t.x - 800, t.y - 450); if (d < bd) { bd = d; best = i; } } }); if (best >= 0) { sx = this.map.tiles[best].x; sy = this.map.tiles[best].y; } }
    Object.assign(b, { x: sx + (this.rng() - 0.5) * 40, y: sy + (this.rng() - 0.5) * 40, vx: 0, vy: 0, z: 140, vz: 0, stun: 0, dash: 0, state: 'run', inv: 1.4, slip: 0, hit: null });
    this.fx.push(['r', p.color]);
  }
  dropCrown(p) {
    const c = this.ms.crown; if (!c || c.holder !== p.id) return;
    c.holder = null; c.x = p.b.x; c.y = p.b.y; c.z = 30; c.vz = 420; c.cool = 0.6;
    const a = this.rng() * Math.PI * 2; c.vx = Math.cos(a) * 240; c.vy = Math.sin(a) * 240;
    if (!floorAt(this.map, this.ms, c.x, c.y)) { c.x = 800; c.y = 470; c.vx = c.vy = 0; c.z = 300; c.vz = 0; }
    this.fx.push(['cd']);
  }
  crownStep(bodies, dt) {
    const c = this.ms.crown;
    if (c.holder) {
      const h = this.byId(c.holder);
      if (!h || h.b.state !== 'run') { c.holder = null; c.x = 800; c.y = 470; c.z = 300; c.vx = c.vy = c.vz = 0; return; }
      c.x = h.b.x; c.y = h.b.y; c.z = h.b.z + 46;
      if (this.phase === 'play') h.b.hold += dt;
      return;
    }
    c.cool = Math.max(0, c.cool - dt);
    c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-2.2 * dt); c.vy *= Math.exp(-2.2 * dt);
    c.vz -= G * 0.7 * dt; c.z += c.vz * dt; if (c.z <= 0) { c.z = 0; c.vz = Math.abs(c.vz) > 120 ? -c.vz * 0.4 : 0; }
    const d0 = hyp(c.x - 800, c.y - 470); if (d0 > 340) { c.x = 800 + (c.x - 800) * 340 / d0; c.y = 470 + (c.y - 470) * 340 / d0; c.vx = -c.vx * 0.5; c.vy = -c.vy * 0.5; }
    if (c.cool > 0 || this.phase !== 'play') return;
    for (const p of bodies) if (p.b.state === 'run' && p.b.stun <= 0 && hyp(p.b.x - c.x, p.b.y - c.y) < R + 20 && Math.abs(p.b.z - c.z) < 60) { c.holder = p.id; this.fx.push(['g', p.color]); this.roomDirty = true; break; }
  }

  /* ----- bots ----- */
  botThink(p, dt) {
    const b = p.b, ai = p.ai, map = this.map, ms = this.ms;
    if (b.state !== 'run') { p.inp.x = p.inp.y = 0; return; }
    ai.think -= dt; if (ai.think > 0) return;
    ai.think = 0.09 + this.rng() * 0.05;
    let tx = ai.tx, ty = ai.ty;
    const kind = map.kind;
    if (kind === 'race') {
      const route = map.route; if (ai.wp >= route.length) ai.wp = route.length - 1;
      let near = 0, nd = 1e9; route.forEach((w, i) => { const d = hyp(w[0] - b.x, w[1] - b.y); if (d < nd) { nd = d; near = i; } });
      if (near > ai.wp || (near < ai.wp - 2)) ai.wp = near;
      const w = route[ai.wp]; if (hyp(w[0] - b.x, w[1] - b.y) < 46 && ai.wp < route.length - 1) ai.wp++;
      tx = route[ai.wp][0]; ty = route[ai.wp][1];
    } else if (map.id === 'papad') {
      ai.re = (ai.re || 0) - 0.1;
      const under = floorAt(map, ms, b.x, b.y);
      if (ai.re <= 0 || ms.tiles[ai.tile] !== 0 || (under && under.k === 'tile' && ms.tiles[under.i] > 0.35 && ai.tile === under.i)) {
        ai.re = 0.5 + this.rng() * 0.5; let best = -1, bs = -1e9;
        for (let i = 0; i < map.tiles.length; i++) {
          if (ms.tiles[i] !== 0) continue; const t = map.tiles[i], d = hyp(t.x - b.x, t.y - b.y); if (d > 260 || d < 30) continue;
          let s = -d * 0.3 - hyp(t.x - 820, t.y - 450) * 0.15 - ms.press[i] * 120 + this.rng() * 40; for (let j = 0; j < map.tiles.length; j++) if (ms.tiles[j] === 0 && hyp(map.tiles[j].x - t.x, map.tiles[j].y - t.y) < 100) s += 25;
          if (s > bs) { bs = s; best = i; }
        }
        ai.tile = best;
      }
      if (ai.tile >= 0) { tx = map.tiles[ai.tile].x; ty = map.tiles[ai.tile].y; if (hyp(tx - b.x, ty - b.y) < 40) ai.re = 0; }
    } else if (map.id === 'pankha') {
      const a = Math.atan2(b.y - 470, b.x - 800) + 0.5; tx = 800 + Math.cos(a) * 250; ty = 470 + Math.sin(a) * 250;
    } else if (kind === 'crown') {
      const c = ms.crown; tx = c.x; ty = c.y;
      if (c.holder === p.id) { const a = Math.atan2(b.y - 470, b.x - 800) + 0.9; tx = 800 + Math.cos(a) * 180; ty = 470 + Math.sin(a) * 180; }
    } else {
      if (!ai.tx || hyp(ai.tx - b.x, ai.ty - b.y) < 40 || this.rng() < 0.02) { ai.tx = 300 + this.rng() * 1000; ai.ty = 280 + this.rng() * 460; }
      tx = ai.tx; ty = ai.ty;
    }
    let dx = tx - b.x, dy = ty - b.y, d = hyp(dx, dy) || 1; dx /= d; dy /= d;
    const tileOk = (x, y) => map.tiles.some((t, i) => ms.tiles[i] >= 0 && ms.tiles[i] < TILE_CRACK * 0.45 && hyp(x - t.x, y - t.y) <= t.r - 6);
    const safe = (vx, vy) => {
      for (const s of [30, 64, 100]) { const x = b.x + vx * s, y = b.y + vy * s; if (map.tiles ? !tileOk(x, y) : !floorAt(map, ms, x, y)) return false; }
      return true;
    };
    if (!safe(dx, dy)) {
      const base = Math.atan2(dy, dx); let found = false;
      for (const off of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) { const a = base + off; if (safe(Math.cos(a), Math.sin(a))) { dx = Math.cos(a); dy = Math.sin(a); found = true; break; } }
      if (!found) {
        let gx = 800, gy = 470;
        if (map.tiles) { let bd = 1e9; map.tiles.forEach((t, i) => { if (ms.tiles[i] >= 0 && ms.tiles[i] < TILE_CRACK * 0.45) { const dd = hyp(t.x - b.x, t.y - b.y); if (dd < bd) { bd = dd; gx = t.x; gy = t.y; } } }); }
        dx = gx - b.x; dy = gy - b.y; const l = hyp(dx, dy) || 1; dx /= l; dy /= l;
      }
    }
    const slow = d < 30 ? d / 30 : 1;
    p.inp.x = dx * slow; p.inp.y = dy * slow;
    for (let i = 0; i < map.sweepers.length; i++) {
      const s = map.sweepers[i]; if (s.h > 200) continue;
      for (let k = 0; k < s.arms; k++) { const a = ms.ang[i] + k * 2 * Math.PI / s.arms; const g = segDist(b.x, b.y, s.x, s.y, s.x + Math.cos(a) * s.len, s.y + Math.sin(a) * s.len); if (g.d < 62 && this.rng() < 0.55) p.inp.jump = true; }
    }
    const sab = this.saboteurs && this.saboteurs.includes(p.id);
    for (const q of this.players) {
      if (q === p || q.waiting || q.b.state !== 'run') continue;
      const ox = q.b.x - b.x, oy = q.b.y - b.y, od = hyp(ox, oy);
      if (od < 70 && (ox * Math.cos(b.face) + oy * Math.sin(b.face)) / (od || 1) > 0.7 && this.rng() < (sab ? 0.2 : kind === 'crown' && ms.crown.holder === q.id ? 0.5 : kind === 'survive' ? 0.015 : 0.04)) p.inp.dash = true;
    }
    if (sab && this.phase === 'play' && this.rng() < 0.025) { const k = Math.floor(this.rng() * 3); this.useTrap(p, k); }
    if (this.rng() < 0.004) { p.b.emoteT = 1.6; this.fx.push(['e', p.color, Math.floor(this.rng() * 3)]); }
  }

  /* ----- outbound state ----- */
  flush(dt) {
    if (this.roomDirty) { this.roomDirty = false; this.cast('*', this.roomState()); }
    this.meTimer -= dt;
    const tickMe = this.meTimer <= 0; if (tickMe) this.meTimer = this.phase === 'play' ? 0.5 : 2;
    for (const p of this.players) if (p.cid && (p.meDirty || tickMe)) { p.meDirty = false; this.sendMe(p); }
    if (this.physicsOn() || ['intro', 'countdown', 'roundEnd'].includes(this.phase)) this.cast('D', this.snapshot());
    else if (this.fx.length) this.cast('D', { t: 's', fx: this.fx.splice(0) });
    this.fx = [];
  }
  snapshot() {
    const ms = this.ms, out = { t: 's', mt: +ms.t.toFixed(3), ph: this.phase, left: +Math.max(0, this.phaseLeft).toFixed(2), p: [], fx: this.fx.slice(0, 80) };
    for (const p of this.players) {
      if (p.waiting) continue; const b = p.b;
      const fl = (b.dash > 0 ? 1 : 0) | (b.state === 'fall' ? 2 : 0) | (b.state === 'out' ? 4 : 0) | (b.state === 'done' ? 8 : 0) | (ms.crown && ms.crown.holder === p.id ? 16 : 0) | (b.inv > 0 ? 32 : 0) | (b.slip > 0 ? 64 : 0) | (b.emoteT > 0 ? 128 : 0);
      out.p.push([p.color, Math.round(b.x), Math.round(b.y), Math.round(b.z), Math.round(b.vx), Math.round(b.vy), Math.round(b.face * 100), Math.round(b.stun * 100), fl, b.place || 0]);
    }
    if (ms.ang.length) out.sw = ms.ang.map(a => Math.round(a * 1000));
    if (ms.plat.length) out.pl = ms.plat.map(q => [Math.round(q.x), Math.round(q.y)]);
    if (ms.mover.length) out.mv = ms.mover.map(q => [Math.round(q.x), Math.round(q.y)]);
    if (this.map.bumpers.some(b => b.orbit)) out.bu = ms.bump.map(q => [Math.round(q.x), Math.round(q.y)]);
    if (ms.tiles) out.tl = ms.tiles.map(v => v < 0 ? 'x' : v === 0 ? '0' : String(Math.min(9, 1 + Math.floor(v / TILE_CRACK * 9)))).join('');
    if (ms.peels.length) out.pe = ms.peels.map(pe => [Math.round(pe.x), Math.round(pe.y)]);
    if (ms.crown) { const c = ms.crown, h = c.holder && this.byId(c.holder); out.cr = [Math.round(c.x), Math.round(c.y), Math.round(c.z), h ? h.color : -1]; }
    if (ms.ulta > 0) out.u = 1;
    return out;
  }
  roomState() {
    const r = this.result, revealed = r && r.revealed, phase = this.phase;
    const showResult = r && ['roundEnd', 'panchayat', 'reveal', 'scores'].includes(phase);
    return {
      t: 'room', room: this.room, phase, paused: this.paused, left: +Math.max(0, this.phaseLeft).toFixed(2),
      round: this.round, rounds: this.playlist.length || this.settings.rounds, playlist: this.playlist, map: { id: this.map.id, name: this.map.name, kind: this.map.kind, blurb: this.map.blurb, duration: this.map.duration },
      settings: Object.assign({}, this.settings), quota: this.quota || 0, saboteurCount: (this.saboteurs || []).length,
      players: this.players.map(p => ({ id: p.id, name: p.name, color: p.color, look: p.look, score: p.score, last: p.last || 0, ready: p.ready, bot: p.bot, online: p.online, waiting: p.waiting, st: p.b ? p.b.state : 'run', place: p.b ? p.b.place : 0, voted: !!(this.votes && this.votes[p.id]), hold: p.b ? +p.b.hold.toFixed(1) : 0 })),
      result: showResult ? {
        qualified: r.qualified, gains: (phase === 'scores' || revealed) ? r.gains : null, notes: (phase === 'scores' || revealed) ? r.notes : null,
        saboteurs: revealed ? r.saboteurs : null, tally: revealed ? r.tally : null, skip: revealed ? r.skip : null, ejected: revealed ? r.ejected : null, caught: revealed ? r.caught : null, votes: revealed ? r.votes : null,
        sabo: revealed ? r.sabo : null
      } : null,
      stats: ['roundEnd', 'panchayat'].includes(phase) ? this.stats : null,
      podium: phase === 'finished' ? this.podium : null, history: this.history.slice(-8)
    };
  }
  sendMe(p) {
    if (!p.cid) { p.meDirty = false; return; }
    const sab = this.saboteurs && this.saboteurs.includes(p.id) && !['lobby', 'finished'].includes(this.phase);
    const role = ['lobby', 'finished'].includes(this.phase) || p.waiting ? null : this.map.kind === 'crown' ? 'king' : sab ? 'saboteur' : 'racer';
    const me = {
      t: 'me', id: p.id, name: p.name, color: p.color, look: p.look, ready: p.ready, score: p.score, last: p.last || 0, waiting: p.waiting, phase: this.phase,
      role, partners: sab ? this.saboteurs.filter(id => id !== p.id).map(id => (this.byId(id) || {}).name).filter(Boolean) : [],
      traps: sab ? this.trapNames() : null, emotes: EMOTES, cd: sab ? p.b.cd.map(v => +v.toFixed(2)) : null,
      st: p.b ? p.b.state : 'run', place: p.b ? p.b.place : 0, vote: this.votes ? this.votes[p.id] || null : null,
      rank: 1 + this.players.filter(q => q.score > p.score).length, map: this.map.kind
    };
    this.send(p.cid, me);
  }
}
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }

return { Engine, buildMap, newMapState, floorAt, platPos, orbitPos, segDist, W, H, R, SEATS, EMOTES, TILE_CRACK };
});
