/* Dhakka Mukki phone controller. Sends joystick input at 30 Hz over WebSocket; shows private role, traps and votes.
   Each screen redraws only when its own data changes, so taps never land on replaced buttons. */
'use strict';
(() => {
const $ = (s, r = document) => r.querySelector(s);
const A = window.DArt;
const ls = { get(k) { try { return localStorage.getItem('dm.' + k) || ''; } catch (_) { return ''; } }, set(k, v) { try { localStorage.setItem('dm.' + k, v); } catch (_) {} } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = {
  ws: null, token: ls.get('player'), id: null, me: null, room: null, screenKey: '', retry: 500, meAt: 0,
  pick: { name: ls.get('name'), color: Number(ls.get('color') || -1), look: Number(ls.get('look') || 0) }, picking: false, joining: false,
  inp: { x: 0, y: 0, j: 0, d: 0 }, sentAt: 0, sentKey: '', avatars: new Map(), role: null
};
const PAD_PHASES = ['lobby', 'countdown', 'play', 'roundEnd', 'finished'];

function avatar(color, look, size = 64) {
  const key = color + ':' + look + ':' + size; if (app.avatars.has(key)) return app.avatars.get(key);
  const c = document.createElement('canvas'), k = 2; c.width = c.height = size * k; const x = c.getContext('2d');
  x.scale(k * size / 80, k * size / 80); A.drawBean(x, { x: 40, y: 72, color, look, face: Math.PI / 2, t: 0.3, noShadow: true });
  const url = c.toDataURL(); app.avatars.set(key, url); return url;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2800); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

/* ---------- network ---------- */
function connect() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); app.ws = ws;
  ws.onopen = () => { app.retry = 500; $('#conn').className = 'dot on'; $('#conn').setAttribute('aria-label', 'Connected'); ws.send(JSON.stringify({ t: 'hello', role: 'player', token: app.token || undefined })); };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; } onMessage(m); };
  ws.onclose = () => { $('#conn').className = 'dot off'; $('#conn').setAttribute('aria-label', 'Reconnecting'); setTimeout(connect, app.retry); app.retry = Math.min(4000, app.retry * 1.6); };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}
function send(o) { if (app.ws && app.ws.readyState === 1) { app.ws.send(JSON.stringify(o)); return true; } return false; }
function onMessage(m) {
  if (m.t === 'welcome') {
    app.id = m.id; app.joining = false;
    if (m.id) { app.token = m.token; ls.set('player', m.token); }
    else { app.token = ''; ls.set('player', ''); app.me = null; }
    render();
  } else if (m.t === 'room') { app.room = m; render(); }
  else if (m.t === 'me') {
    const was = app.me; app.me = m; app.meAt = performance.now();
    if (m.role && (!was || was.role !== m.role || was.phase !== m.phase) && m.phase === 'intro') buzz([30, 60, 30]);
    if (was && was.st !== m.st && m.st === 'done') buzz([20, 40, 20, 40, 60]);
    if (was && was.st !== m.st && m.st === 'out') buzz(220);
    render();
  } else if (m.t === 'err') {
    app.joining = false;
    if (m.code === 'kicked') { app.token = ''; ls.set('player', ''); app.id = null; app.me = null; }
    if (m.code !== 'phase' || m.msg) toast(m.msg || 'That did not work.'); render();
  }
}

/* ---------- screens ---------- */
function render() {
  const me = app.me, r = app.room;
  $('#me-chip').innerHTML = me ? `<img src="${avatar(me.color, me.look, 28)}" width="28" height="28" alt=""><span>${esc(me.name)}</span><b>${me.score}</b>` : '';
  if (!r) return;
  let screen, key;
  if (!app.id) { screen = joinScreen; key = 'join:' + r.players.map(p => p.color).join(',') + ':' + app.joining + ':' + r.phase; }
  else if (!me) { screen = () => '<section class="msg"><div class="spin"></div><h1>Taking your spot…</h1></section>'; key = 'wait-me'; }
  else if (app.picking) { screen = pickScreen; key = 'pick:' + r.players.map(p => p.id + p.color).join(',') + ':' + app.pick.color + ':' + app.pick.look; }
  else {
    const ph = me.waiting ? 'waiting' : me.phase;
    screen = SCREENS[ph] || SCREENS.wait;
    key = ph + ':' + [me.role, me.st, me.place, me.vote, me.ready, me.score, me.last, me.rank, r.round, ph === 'panchayat' ? (me.vote ? r.players.map(p => p.id + p.voted).join() : r.players.filter(p => !p.waiting).map(p => p.id).join()) : '', ph === 'lobby' ? r.players.length : '', ph === 'reveal' || ph === 'scores' ? JSON.stringify(r.result && r.result.gains) : ''].join('|');
  }
  const showPad = !!me && !app.picking && !me.waiting && PAD_PHASES.includes(me.phase);
  document.body.classList.toggle('playing', showPad);
  document.body.classList.toggle('live', showPad && ['countdown', 'play', 'roundEnd'].includes(me.phase));
  $('#pad').hidden = !showPad;
  if (showPad) updatePad();
  if (key !== app.screenKey) { app.screenKey = key; $('#screen').innerHTML = screen(); afterRender(); }
}
function colorGrid(selected) {
  const taken = new Set(app.room.players.filter(p => p.id !== app.id).map(p => p.color));
  return `<div class="swatches" role="radiogroup" aria-label="Colour">${A.COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${selected === i}" aria-label="${c.name}${taken.has(i) ? ' (taken)' : ''}" data-color="${i}" ${taken.has(i) ? 'disabled' : ''} style="--c:${c.fill};--d:${c.dark}"></button>`).join('')}</div>`;
}
function lookGrid(color, selected) {
  return `<div class="looks" role="radiogroup" aria-label="Look">${A.LOOKS.map((n, i) => `<button type="button" role="radio" aria-checked="${selected === i}" data-look="${i}"><img src="${avatar(color, i, 56)}" width="56" height="56" alt=""><span>${n}</span></button>`).join('')}</div>`;
}
function freeColor() { const taken = new Set(app.room.players.map(p => p.color)); if (app.pick.color >= 0 && !taken.has(app.pick.color)) return app.pick.color; for (let i = 0; i < 10; i++) if (!taken.has(i)) return i; return 0; }
function joinScreen() {
  const r = app.room, full = r.players.length >= 10; app.pick.color = freeColor();
  if (full) return '<section class="msg"><h1>All ten spots are taken</h1><p>Ask the host to remove a bot, or wait for the next mela.</p></section>';
  return `<form id="join" class="card form" autocomplete="off">
    <h1>Jump in</h1>
    <p class="sub">${r.phase === 'lobby' || r.phase === 'finished' ? 'Pick a name and a look. Then run around the aangan while everyone joins.' : 'A match is on. You will join from the next round.'}</p>
    <label for="nm">Your name</label><input id="nm" name="nm" maxlength="14" required placeholder="What do we shout?" value="${esc(app.pick.name)}">
    <label>Colour</label>${colorGrid(app.pick.color)}
    <label>Look</label>${lookGrid(app.pick.color, app.pick.look)}
    <button class="cta" type="submit" ${app.joining ? 'disabled' : ''}>${app.joining ? 'Joining…' : 'Join the mela'}</button>
    <p class="fine">Players are on the same Wi-Fi. Nothing leaves this network.</p>
  </form>`;
}
function pickScreen() {
  return `<section class="card form"><h1>Change your look</h1><label>Colour</label>${colorGrid(app.pick.color)}<label>Look</label>${lookGrid(app.pick.color, app.pick.look)}
    <div class="row"><button class="cta" data-act="savelook">Save</button><button class="ghost" data-act="cancelpick">Cancel</button></div></section>`;
}
const roleCard = me => {
  if (me.role === 'saboteur') return `<div class="role sab"><small>Your secret role</small><h2>Chupa Rustam</h2><p>Make others fall without getting caught. Every fall you cause is a point, if the Panchayat does not catch you.</p><ul><li><b>Kela</b> drops a banana peel behind you</li><li><b>Bhookamp</b> shoves everyone near you</li><li><b>${esc((me.traps || [])[2] || 'Ulta')}</b> ${me.map === 'survive' && (me.traps || [])[2] === 'Crack' ? 'cracks the papads around you' : 'reverses and speeds up the course'}</li></ul>${me.partners.length ? `<p class="partner">Your partner: <b>${me.partners.map(esc).join(', ')}</b></p>` : ''}<p class="warn">Act normal. Run the course too.</p></div>`;
  if (me.role === 'king') return '<div class="role king"><small>Final round</small><h2>Dhakka King</h2><p>No saboteurs. Grab the mukut and hold it. Every dhakka knocks it loose.</p></div>';
  return '<div class="role racer"><small>Your secret role</small><h2>Racer</h2><p>Qualify for points. Somebody is sabotaging. Watch who drops peels, who shoves, who is always nearby when people fall.</p></div>';
};
const SCREENS = {
  lobby: () => { const me = app.me, r = app.room; return `<section class="lobby-top"><div class="who"><img src="${avatar(me.color, me.look, 72)}" width="72" height="72" alt=""><div><h1>${esc(me.name)}</h1><p>${r.players.length}/10 in the mela. The host starts the match.</p></div></div>
    <div class="row"><button class="cta ${me.ready ? 'on' : ''}" data-act="ready" aria-pressed="${me.ready}">${me.ready ? 'Ready ✓' : 'I’m ready'}</button><button class="ghost" data-act="pick">Change look</button><button class="ghost small" data-act="leave">Leave</button></div></section>`; },
  intro: () => { const me = app.me; return `<section class="intro-phone"><p class="kicker">Round ${app.room.round} · ${esc(app.room.map.name)}</p><button class="reveal-btn" data-hold="role" type="button"><span>Press and hold to see your role</span><small>Hide your screen from your neighbours</small></button><div id="role-slot" hidden>${roleCard(me)}</div></section>`; },
  countdown: () => '',
  play: () => '',
  roundEnd: () => '',
  finished: () => { const me = app.me; return `<section class="lobby-top"><div class="who"><img src="${avatar(me.color, me.look, 72)}" width="72" height="72" alt=""><div><h1>#${me.rank} with ${me.score} pts</h1><p>${me.rank === 1 ? 'You are the Dhakka King!' : 'Good match. Rematch?'}</p></div></div></section>`; },
  panchayat: () => {
    const me = app.me, r = app.room, others = r.players.filter(p => !p.waiting && p.id !== me.id);
    if (me.vote) { const t = r.players.find(p => p.id === me.vote); return `<section class="msg"><h1>Vote locked</h1><p>${me.vote === 'skip' ? 'You skipped.' : 'You blamed <b>' + esc(t ? t.name : 'someone') + '</b>.'}</p><p class="sub">${r.players.filter(p => !p.waiting && p.voted).length} of ${r.players.filter(p => !p.waiting).length} have voted.</p></section>`; }
    return `<section class="vote"><h1>Who is the Chupa Rustam?</h1><p class="sub">${me.role === 'saboteur' ? 'Blend in. Vote for someone, or skip.' : 'Right guess +2. Wrong guess -1. Skip is safe.'}</p>
      <div class="vote-grid">${others.map(p => `<button data-vote="${p.id}" style="--pc:${A.COLORS[p.color].fill}"><img src="${avatar(p.color, p.look, 48)}" width="48" height="48" alt=""><span>${esc(p.name)}</span></button>`).join('')}</div>
      <button class="ghost wide" data-vote="skip">Skip vote</button></section>`;
  },
  reveal: () => '<section class="msg"><h1>Faisla on the big screen</h1><p>Look up!</p></section>',
  scores: () => { const me = app.me, g = me.last; return `<section class="msg"><h1>${g > 0 ? '+' + g + ' points' : g < 0 ? g + ' points' : 'No points this round'}</h1><p>You are <b>#${me.rank}</b> with ${me.score}.</p></section>`; },
  waiting: () => '<section class="msg"><h1>You are in</h1><p>A round is running. You join from the next one. Watch the big screen and spot the saboteur.</p></section>',
  wait: () => '<section class="msg"><h1>Hold tight</h1></section>'
};
function afterRender() {
  const f = $('#join');
  if (f) {
    const nm = $('#nm'); nm.addEventListener('input', () => { app.pick.name = nm.value; ls.set('name', nm.value); });
    f.addEventListener('submit', e => { e.preventDefault(); const name = nm.value.trim(); if (!name) return nm.focus(); app.joining = true; ls.set('color', app.pick.color); ls.set('look', app.pick.look); send({ t: 'join', name, color: app.pick.color, look: app.pick.look }); render(); });
  }
  const hold = $('[data-hold="role"]');
  if (hold) {
    const slot = $('#role-slot'), show = e => { e.preventDefault(); slot.hidden = false; hold.classList.add('held'); buzz(15); }, hide = () => { slot.hidden = true; hold.classList.remove('held'); };
    hold.addEventListener('pointerdown', show); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => hold.addEventListener(ev, hide));
    hold.addEventListener('contextmenu', e => e.preventDefault());
  }
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-color]'); if (c && !c.disabled) { app.pick.color = Number(c.dataset.color); app.screenKey = ''; render(); return; }
  const l = e.target.closest('[data-look]'); if (l) { app.pick.look = Number(l.dataset.look); app.screenKey = ''; render(); return; }
  const v = e.target.closest('[data-vote]'); if (v) { const t = v.dataset.vote, n = t === 'skip' ? null : app.room.players.find(p => p.id === t); if (t === 'skip' || confirm('Blame ' + (n ? n.name : 'them') + '? Your vote locks in.')) { send({ t: 'vote', target: t }); buzz(20); } return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'ready') send({ t: 'ready', on: !app.me.ready });
  else if (a === 'pick') { app.picking = true; app.pick.color = app.me.color; app.pick.look = app.me.look; render(); }
  else if (a === 'cancelpick') { app.picking = false; app.screenKey = ''; render(); }
  else if (a === 'savelook') { send({ t: 'look', color: app.pick.color, look: app.pick.look }); ls.set('color', app.pick.color); ls.set('look', app.pick.look); app.picking = false; app.screenKey = ''; render(); }
  else if (a === 'leave') { if (confirm('Leave the mela? Your spot opens for someone else.')) { send({ t: 'leave' }); } }
});

/* ---------- controller pad ---------- */
const stick = $('#stick'), knob = $('.knob', stick), base = $('.base', stick);
let stickId = null, origin = null;
const RADIUS = 64;
function stickMove(e) {
  if (e.pointerId !== stickId) return;
  let dx = e.clientX - origin.x, dy = e.clientY - origin.y; const d = Math.hypot(dx, dy);
  if (d > RADIUS) { origin.x += dx * (1 - RADIUS / d); origin.y += dy * (1 - RADIUS / d); dx = e.clientX - origin.x; dy = e.clientY - origin.y; base.style.left = origin.x - stick.getBoundingClientRect().left + 'px'; base.style.top = origin.y - stick.getBoundingClientRect().top + 'px'; }
  const n = Math.min(1, Math.hypot(dx, dy) / RADIUS), a = Math.atan2(dy, dx), dead = n < 0.12;
  app.inp.x = dead ? 0 : Math.cos(a) * n; app.inp.y = dead ? 0 : Math.sin(a) * n;
  knob.style.transform = `translate(${dx}px,${dy}px)`; pushInput(false);
}
stick.addEventListener('pointerdown', e => {
  if (stickId !== null) return; stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
  const rc = stick.getBoundingClientRect(); origin = { x: e.clientX, y: e.clientY };
  base.style.left = (e.clientX - rc.left) + 'px'; base.style.top = (e.clientY - rc.top) + 'px'; stick.classList.add('active'); stickMove(e);
});
stick.addEventListener('pointermove', stickMove);
const stickEnd = e => { if (e.pointerId !== stickId) return; stickId = null; app.inp.x = app.inp.y = 0; knob.style.transform = ''; base.style.left = base.style.top = ''; stick.classList.remove('active'); pushInput(true); };
stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);
function press(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('down'); fn(); buzz(10); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => el.classList.remove('down'))); el.addEventListener('contextmenu', e => e.preventDefault()); }
press($('#b-jump'), () => { app.inp.j++; pushInput(true); });
press($('#b-dash'), () => { app.inp.d++; pushInput(true); });
function pushInput(force) {
  const now = performance.now(), i = app.inp, key = [i.x.toFixed(2), i.y.toFixed(2), i.j, i.d].join();
  if (!force && key === app.sentKey && now - app.sentAt < 250) return;
  if (!force && now - app.sentAt < 30) return;
  if (send({ t: 'in', x: +i.x.toFixed(3), y: +i.y.toFixed(3), j: i.j, d: i.d })) { app.sentAt = now; app.sentKey = key; }
}
setInterval(() => { if (!$('#pad').hidden) pushInput(false); }, 33);
// keyboard for laptops: WASD or arrows, Space jump, Shift or K dhakka, 1 2 3 traps or emotes
const keys = new Set();
function keyVec() { const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0), y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0), l = Math.hypot(x, y) || 1; if (stickId === null) { app.inp.x = x / l; app.inp.y = y / l; pushInput(true); } }
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || $('#pad').hidden) return; const k = e.key.toLowerCase(); if (e.repeat) return; if (k === ' ') { app.inp.j++; pushInput(true); e.preventDefault(); } else if (k === 'shift' || k === 'k') { app.inp.d++; pushInput(true); } else if (['1', '2', '3'].includes(k)) extra(Number(k) - 1); else { keys.add(k); keyVec(); } });
addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); if (!$('#pad').hidden) keyVec(); });

function extra(k) { const me = app.me; if (!me) return; if (me.role === 'saboteur' && me.phase === 'play') { send({ t: 'trap', k }); buzz(25); } else send({ t: 'emote', k }); }
let extrasKey = '';
function updatePad() {
  const me = app.me, sab = me.role === 'saboteur' && ['countdown', 'play'].includes(me.phase);
  const labels = sab ? me.traps : me.emotes, key = (sab ? 'T' : 'E') + labels.join();
  if (key !== extrasKey) {
    extrasKey = key;
    $('#extras').innerHTML = labels.map((n, i) => `<button type="button" class="ex ${sab ? 'trap' : ''}" data-x="${i}"><span>${esc(n)}</span><i></i></button>`).join('');
    $('#extras').querySelectorAll('[data-x]').forEach(b => press(b, () => extra(Number(b.dataset.x))));
  }
  const st = $('#status');
  let msg = '', cls = '';
  if (me.phase === 'lobby') msg = 'Practice in the aangan! ' + (me.ready ? 'You are ready.' : 'Tap Ready above when set.');
  else if (me.phase === 'countdown') msg = 'Get set…';
  else if (me.phase === 'finished') msg = 'Run around while the host sets up a rematch.';
  else if (me.st === 'done') { msg = me.place === 1 ? 'Pehla! You won the race. Now watch for sabotage.' : 'Qualified #' + me.place + '! Watch who is causing trouble.'; cls = 'good'; }
  else if (me.st === 'out') { msg = 'Out this round. Keep your eyes on the suspects.'; cls = 'bad'; }
  else if (me.phase === 'roundEnd') msg = 'Round over!';
  else if (me.map === 'race') msg = 'Run! Reach the tapri.';
  else if (me.map === 'survive') msg = 'Stay on the floor!';
  else if (me.map === 'crown') msg = 'Grab the mukut!';
  if (st.textContent !== msg) st.textContent = msg; st.className = 'status ' + cls + (sab ? ' sab' : '');
  $('#peek').hidden = !me.role || me.role === 'king';
}
// cooldown rings for traps
function cdLoop() {
  requestAnimationFrame(cdLoop);
  const me = app.me; if (!me || !me.cd || $('#pad').hidden) return;
  const el = performance.now() - app.meAt, max = [6, 9, 11];
  $('#extras').querySelectorAll('[data-x]').forEach(b => { const i = Number(b.dataset.x), left = Math.max(0, me.cd[i] - el / 1000); b.style.setProperty('--cd', (left / max[i] * 360).toFixed(1) + 'deg'); b.classList.toggle('cooling', left > 0.05); });
}
requestAnimationFrame(cdLoop);
const peek = $('#peek'), rp = $('#role-peek');
peek.addEventListener('pointerdown', e => { e.preventDefault(); if (app.me) { rp.innerHTML = roleCard(app.me); rp.hidden = false; } });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => peek.addEventListener(ev, () => { rp.hidden = true; }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { app.inp.x = app.inp.y = 0; pushInput(true); } });
connect();
})();
