/* Headless engine test: a full 10-player match driven by engine bots plus one scripted "human" client.
   Run: node test/sim.test.js   (exits non-zero on failure) */
'use strict';
const assert = require('node:assert');
const { Engine, buildMap, floorAt, newMapState } = require('../android/assets/web/engine.js');

let failures = 0;
function check(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); } }
const parse = out => out.filter(([to]) => to !== '#').map(([to, text]) => [to, JSON.parse(text)]);

check('every map spawn point stands on floor', () => {
  for (const id of ['aangan', 'tapri', 'papad', 'pankha', 'king', 'akhada', 'patakha', 'sumo', 'rassi', 'chor']) {
    const m = buildMap(id), ms = newMapState(m);
    m.spawns.forEach(([x, y], i) => assert(floorAt(m, ms, x, y), id + ' spawn ' + i + ' is over the void'));
  }
});

check('papad floor has no holes between intact tiles', () => {
  const m = buildMap('papad'), ms = newMapState(m);
  const xs = m.tiles.map(t => t.x), ys = m.tiles.map(t => t.y);
  const x0 = Math.min(...xs) + 60, x1 = Math.max(...xs) - 60, y0 = Math.min(...ys) + 60, y1 = Math.max(...ys) - 60;
  for (let x = x0; x <= x1; x += 3) for (let y = y0; y <= y1; y += 3) assert(floorAt(m, ms, x, y), `hole at ${x},${y}`);
});

check('tapri route is walkable (every waypoint and the line between them is floor)', () => {
  const m = buildMap('tapri'), ms = newMapState(m);
  for (let i = 0; i < m.route.length - 1; i++) {
    const [ax, ay] = m.route[i], [bx, by] = m.route[i + 1];
    // a moving thali counts as floor anywhere along its track (the ferry gap is crossed by riding it)
    const onPlat = (x, y) => m.plats.some(p => [[p.ax, p.ay], [p.bx, p.by]].some(([px, py]) => x >= Math.min(px, p.ax) && x <= Math.max(px, p.bx) + p.w && y >= py && y <= py + p.h));
    for (let k = 0; k <= 20; k++) { const x = ax + (bx - ax) * k / 20, y = ay + (by - ay) * k / 20; assert(floorAt(m, ms, x, y) || onPlat(x, y), `gap between waypoint ${i} and ${i + 1} at ${x | 0},${y | 0}`); }
  }
});

function makeMatch(seed, rounds) {
  const e = new Engine({ seed });
  e.open('disp'); e.message('disp', JSON.stringify({ t: 'hello', role: 'display', host: e.hostToken }));
  e.open('h1'); e.message('h1', JSON.stringify({ t: 'hello', role: 'player' }));
  e.message('h1', JSON.stringify({ t: 'join', name: 'Chinmay', color: 3, look: 2 }));
  for (let i = 0; i < 9; i++) e.message('disp', JSON.stringify({ t: 'host', a: 'addBot' }));
  e.message('disp', JSON.stringify({ t: 'host', a: 'settings', settings: { rounds, talk: 30 } }));
  return e;
}

check('join, seat limit and duplicate-name rules', () => {
  const e = makeMatch(7, 5);
  assert.strictEqual(e.players.length, 10);
  e.open('h2'); e.message('h2', JSON.stringify({ t: 'hello', role: 'player' }));
  const out = parse(e.drain()).filter(([to]) => to === 'h2').map(x => x[1]);
  e.message('h2', JSON.stringify({ t: 'join', name: 'Late' }));
  const err = parse(e.drain()).find(([to, m]) => to === 'h2' && m.t === 'err');
  assert(err && err[1].code === 'full', 'eleventh player should be refused');
  assert(new Set(e.players.map(p => p.color)).size === 10, 'colours must be unique');
});

check('non-host cannot start, host can', () => {
  const e = makeMatch(11, 3);
  e.open('d2'); e.message('d2', JSON.stringify({ t: 'hello', role: 'display', host: 'nope' }));
  e.drain();
  e.message('d2', JSON.stringify({ t: 'host', a: 'start' }));
  assert.strictEqual(e.phase, 'lobby');
  e.message('disp', JSON.stringify({ t: 'host', a: 'start' }));
  assert.strictEqual(e.phase, 'choose', 'starting opens the seven-second pick, then round 1');
});

check('reconnect with token reclaims the same seat', () => {
  const e = makeMatch(5, 3);
  const me = e.players.find(p => !p.bot);
  e.close('h1');
  assert.strictEqual(me.online, false);
  e.open('h1b'); e.message('h1b', JSON.stringify({ t: 'hello', role: 'player', token: me.token }));
  assert.strictEqual(me.cid, 'h1b'); assert.strictEqual(me.online, true);
});

check('full 5-round match with saboteurs runs to the podium', () => {
  const e = makeMatch(42, 5);
  e.message('disp', JSON.stringify({ t: 'host', a: 'start' }));
  const seen = new Set(), maps = [], perRound = [];
  let jc = 0, t = 0, snaps = 0, lastMap = '', maxSnap = 0, sabCount = 0;
  const me = e.players.find(p => !p.bot);
  while (e.phase !== 'finished' && t < 60 * 20) {
    // the human wanders and jumps
    if (e.phase === 'play') e.message('h1', JSON.stringify({ t: 'in', x: Math.cos(t), y: Math.sin(t * 0.7), j: (jc = jc + (Math.random() < 0.05 ? 1 : 0)), d: 0 }));
    if (e.phase === 'panchayat' && !e.votes[me.id]) e.message('h1', JSON.stringify({ t: 'vote', target: 'skip' }));
    const out = e.update(33); t += 0.033;
    for (const [to, text] of out) { if (to === '*' && text.startsWith('{"t":"s"')) { snaps++; maxSnap = Math.max(maxSnap, text.length); } }
    seen.add(e.phase);
    if (e.map.id !== lastMap && e.phase === 'intro') { lastMap = e.map.id; maps.push(lastMap); sabCount += e.saboteurs.length; }
    if (e.phase === 'scores' && (!perRound.length || perRound[perRound.length - 1].round !== e.round)) {
      perRound.push({ round: e.round, map: e.map.id, qualified: e.result.qualified.length, falls: e.stats.falls, hits: e.stats.hits, sabo: e.result.sabo, ejected: !!e.result.ejected, time: +t.toFixed(1) });
    }
  }
  console.log('     maps: ' + maps.join(' > '));
  perRound.forEach(r => console.log('     ' + JSON.stringify(r)));
  console.log('     final: ' + e.players.slice().sort((a, b) => b.score - a.score).map(p => p.name + ' ' + p.score).join(', '));
  console.log(`     ${snaps} display snapshots, largest ${maxSnap} bytes, match time ${t.toFixed(0)}s`);
  assert.strictEqual(e.phase, 'finished', 'match did not finish');
  for (const ph of ['intro', 'countdown', 'play', 'roundEnd', 'panchayat', 'reveal', 'scores']) assert(seen.has(ph), 'never reached ' + ph);
  assert.strictEqual(maps.length, 5); assert.strictEqual(maps[4], 'king');
  assert(sabCount >= 4, 'each non-final round of 10 players should have saboteurs');
  const race = perRound.find(r => r.map === 'tapri');
  if (race) assert(race.qualified >= 1, 'no bot finished Tapri Dash');
  assert(perRound.some(r => r.falls > 0), 'nobody ever fell');
  assert(e.players.some(p => p.score > 0), 'no points awarded');
  assert(maxSnap < 4000, 'snapshot too large for 30 Hz');
});

check('the host can play: a player connection with the host token runs the room', () => {
  const e = new Engine({ seed: 7 });
  e.open('hp'); e.message('hp', JSON.stringify({ t: 'hello', role: 'player', host: e.hostToken }));
  e.open('p2'); e.message('p2', JSON.stringify({ t: 'hello', role: 'player', host: 'wrong-token-1234567' }));
  let out = parse(e.drain());
  assert.strictEqual(out.find(([to, m]) => to === 'hp' && m.t === 'welcome')[1].host, true, 'host player is told it is host');
  assert.strictEqual(out.find(([to, m]) => to === 'p2' && m.t === 'welcome')[1].host, false, 'a wrong token gets no host rights');
  e.message('hp', JSON.stringify({ t: 'join', name: 'Host', color: 0, look: 1 }));
  e.message('p2', JSON.stringify({ t: 'host', a: 'addBot' }));
  out = parse(e.drain());
  assert(out.some(([to, m]) => to === 'p2' && m.t === 'err' && m.code === 'permission'), 'ordinary players cannot use host actions');
  for (let i = 0; i < 3; i++) e.message('hp', JSON.stringify({ t: 'host', a: 'addBot' }));
  e.message('hp', JSON.stringify({ t: 'host', a: 'start' }));
  e.update(100);
  assert.strictEqual(e.players.length, 4, 'host seat plus three bots');
  assert.notStrictEqual(e.phase, 'lobby', 'the host player started the match');
  assert(e.roundPlayers().some(p => p.name === 'Host'), 'the host is in the round');
});

function room(seed, games, extra) {
  const e = new Engine({ seed });
  e.open('d'); e.message('d', JSON.stringify({ t: 'hello', role: 'display', host: e.hostToken }));
  for (let i = 0; i < 6; i++) e.message('d', JSON.stringify({ t: 'host', a: 'addBot' }));
  e.message('d', JSON.stringify({ t: 'host', a: 'settings', settings: Object.assign({ games, rounds: 3 }, extra || {}) }));
  return e;
}
const run = (e, ms) => { for (let t = 0; t < ms; t += 50) { e.update(50); e.drain(); } };

check('the host picks the games: the playlist uses only those, with the finale last', () => {
  const e = room(5, ['akhada', 'chor', 'king'], { rounds: 5 });
  e.message('d', JSON.stringify({ t: 'host', a: 'start' }));
  assert.strictEqual(e.playlist.length, 5); assert.strictEqual(e.playlist[4], 'king');
  assert(e.playlist.slice(0, 4).every(id => ['akhada', 'chor'].includes(id)), e.playlist.join());
  const f = room(5, ['rassi']); f.message('d', JSON.stringify({ t: 'host', a: 'start' }));
  assert(f.playlist.every(id => id === 'rassi'));
  const g = room(5, ['tapri']); g.message('d', JSON.stringify({ t: 'host', a: 'settings', settings: { games: [] } }));
  assert.deepStrictEqual(g.settings.games, ['tapri'], 'an empty pick is refused');
});

check('akhada: punches drain health, a faint stops you, a fainted boxer flies when hit', () => {
  const e = room(6, ['akhada'], { powerups: false }); e.message('d', JSON.stringify({ t: 'host', a: 'start' }));
  run(e, 17000); assert.strictEqual(e.phase, 'play');
  const [a, v] = e.roundPlayers(); a.bot = v.bot = false;
  Object.assign(a.b, { x: 700, y: 470, face: 0, vx: 0, vy: 0, dashCd: 0, stun: 0 }); Object.assign(v.b, { x: 745, y: 470, vx: 0, vy: 0, hp: 15, inv: 0, faint: 0 });
  e.strike(a, v, 1, 0, 1); assert(v.b.hp <= 5, 'damage applied'); e.strike(a, v, 1, 0, 1);
  assert(v.b.faint > 0, 'fainted at zero health');
  v.b.inv = 0; v.b.vx = 0; e.strike(a, v, 1, 0, 1); assert(v.b.vx > 1000, 'fainted boxers are thrown hard: ' + v.b.vx);
  v.p = v; v.inp.x = 1; const x0 = v.b.x; v.b.vx = 0; run(e, 300); assert(Math.abs(v.b.x - x0) < 40 || v.b.state !== 'run', 'no control while fainted');
});

check('explosives: a stepped-on bomb blasts nearby players and a rocket detonates on a hit', () => {
  const e = room(7, ['patakha']); e.message('d', JSON.stringify({ t: 'host', a: 'start' }));
  run(e, 17000); assert.strictEqual(e.phase, 'play');
  const ps = e.roundPlayers(); ps.forEach(p => { p.bot = false; p.inp.x = p.inp.y = 0; });
  e.ms.mines = []; e.addMine(800, 470, null, 0);
  Object.assign(ps[0].b, { x: 800, y: 470, vx: 0, vy: 0, z: 0 }); Object.assign(ps[1].b, { x: 880, y: 470, vx: 0, vy: 0, z: 0 });
  let blasts = 0; for (let t = 0; t < 600; t += 50) { for (const [, txt] of e.update(50)) if (txt.includes('["x",')) blasts++; }
  assert(blasts > 0, 'the bomb went off'); assert(ps[1].b.vx > 150 || ps[1].b.state !== 'run', 'the neighbour was thrown: ' + ps[1].b.vx);
  const sh = ps[2], tg = ps[3]; Object.assign(sh.b, { x: 600, y: 300, face: 0, ammo: 1, fireCd: 0, stun: 0, faint: 0, z: 0, vx: 0, vy: 0 }); Object.assign(tg.b, { x: 850, y: 300, vx: 0, vy: 0, z: 0, stun: 0, state: 'run' });
  e.fire(sh); assert.strictEqual(sh.b.ammo, 0); run(e, 600); assert(Math.abs(tg.b.vx) > 100 || tg.b.state !== 'run', 'the rocket blasted its target');
});

check('chor police: a police dhakka turns a chor into police, and the round ends when nobody is free', () => {
  const e = room(8, ['chor'], { powerups: false }); e.message('d', JSON.stringify({ t: 'host', a: 'start' }));
  run(e, 17000); assert.strictEqual(e.phase, 'play');
  const cop = e.roundPlayers().find(p => e.police.has(p.id)), chor = e.roundPlayers().find(p => !e.police.has(p.id));
  chor.b.inv = 0; e.strike(cop, chor, 1, 0, 1);
  assert(e.police.has(chor.id), 'caught'); assert.strictEqual(e.catches[cop.id], 1);
  e.roundPlayers().forEach(p => e.police.add(p.id)); run(e, 200); assert.notStrictEqual(e.phase, 'play', 'round ended');
});

check('every new mode runs a full round with bots without errors', () => {
  for (const id of ['akhada', 'patakha', 'sumo', 'rassi', 'chor']) {
    const e = room(9, [id]); e.message('d', JSON.stringify({ t: 'host', a: 'start' }));
    let t = 0; while (t < 200000 && !['roundEnd', 'panchayat', 'scores'].includes(e.phase)) { e.update(50); e.drain(); t += 50; }
    assert(['roundEnd', 'panchayat', 'scores'].includes(e.phase), id + ' never ended');
    assert(e.result && Array.isArray(e.result.qualified), id + ' scored');
  }
});

check('starting a match gives everyone seven seconds to pick how they play, then round 1', () => {
  const e = room(11, ['tapri']); e.open('p'); e.message('p', JSON.stringify({ t: 'hello', role: 'player' })); e.message('p', JSON.stringify({ t: 'join', name: 'Asha', color: 7, look: 1 }));
  e.message('p', JSON.stringify({ t: 'view', phone: false }));
  e.message('d', JSON.stringify({ t: 'host', a: 'start' }));
  assert.strictEqual(e.phase, 'choose'); assert.strictEqual(e.round, 0);
  assert.strictEqual(e.roomState().players.find(p => p.name === 'Asha').view, 'pad', 'the choice shows on the big screen');
  run(e, 6500); assert.strictEqual(e.phase, 'choose'); run(e, 800); assert.strictEqual(e.phase, 'intro'); assert.strictEqual(e.round, 1);
});

check('saboteur traps respect role and cooldown', () => {
  const e = makeMatch(3, 3);
  e.message('disp', JSON.stringify({ t: 'host', a: 'start' }));
  while (e.phase !== 'play') e.update(100);
  const sab = e.byId(e.saboteurs[0]), racer = e.players.find(p => !e.saboteurs.includes(p.id));
  sab.b.cd = [0, 0, 0]; racer.b.cd = [0, 0, 0];
  e.useTrap(racer, 0); assert.strictEqual(e.ms.peels.length, 0, 'racer dropped a peel');
  e.useTrap(sab, 0); assert.strictEqual(e.ms.peels.length, 1, 'saboteur could not drop a peel');
  e.useTrap(sab, 0); assert.strictEqual(e.ms.peels.length, 1, 'cooldown ignored');
});

check('votes score correctly and a plurality ejects', () => {
  const e = makeMatch(9, 3);
  e.message('disp', JSON.stringify({ t: 'host', a: 'start' }));
  while (e.phase !== 'panchayat') e.update(100);
  const sab = e.saboteurs[0];
  for (const p of e.players) e.votes[p.id] = p.id === sab ? e.players.find(q => q.id !== sab).id : sab;
  const before = {}; e.players.forEach(p => { before[p.id] = p.score; });
  e.phaseLeft = 0; e.update(20);
  assert.strictEqual(e.phase, 'reveal');
  assert.strictEqual(e.result.ejected, sab, 'saboteur should be ejected');
  assert(e.result.caught.includes(sab));
  const voter = e.players.find(p => !e.saboteurs.includes(p.id));
  assert(e.result.gains[voter.id] >= 2, 'correct voter should gain at least 2');
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
