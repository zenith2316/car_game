/* End-to-end check against the dev host: one host display, two phones joined through the real UI, eight bots.
   Walks every phase and map, saves screenshots, and fails on any page error.
   Run: node server/dev-host.js 8793 & node test/e2e.js [outDir] */
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const BASE = process.env.DM_BASE || 'http://127.0.0.1:8793';
const OUT = process.argv[2] || path.join(__dirname, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const token = process.env.DM_HOST || fs.readFileSync(process.env.DM_TOKEN_FILE || '/dev/null', 'utf8').trim();
  const browser = await chromium.launch();
  // phones get their own browser (and GPU process), like separate devices in a real room
  const phonesBrowser = await chromium.launch();
  const errors = [];
  const watch = (page, who) => { page.on('pageerror', e => errors.push(who + ': ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(who + ' console: ' + m.text()); }); };
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })).newPage(); watch(host, 'display');
  await host.goto(BASE + '/display' + (process.env.DM_GFX ? '?gfx=' + process.env.DM_GFX : '') + '#host=' + token);
  await host.waitForSelector('.lobby');
  const phoneCtx = () => phonesBrowser.newContext({ ...devices['Pixel 7'], hasTouch: true, reducedMotion: 'reduce' });
  const phones = [];
  for (const [i, name] of [['0', 'Chinmay'], ['1', 'Asha']]) {
    const p = await (await phoneCtx()).newPage(); watch(p, 'phone' + i);
    await p.goto(BASE + '/'); await p.waitForSelector('#join');
    if (i === '1') { await p.click('[data-color="6"]'); await p.click('[data-look="2"]'); }
    await p.fill('#nm', name);
    if (i === '0') await p.screenshot({ path: path.join(OUT, '02-phone-join.png') });
    await p.click('#join .cta');
    await p.waitForSelector('[data-act="ready"]');
    await p.click('[data-act="ready"]');
    phones.push(p);
  }
  for (let i = 0; i < 7; i++) { await host.click('[data-act="addBot"]', { timeout: 8000 }).catch(async e => { await host.screenshot({ path: path.join(OUT, 'fail-addbot.png') }); console.log('chips', await host.evaluate(() => document.querySelectorAll('.chip:not(.empty)').length)); throw e; }); await host.waitForTimeout(250); }
  // walk a couple of players around the aangan
  await phones[0].evaluate(() => {});
  await host.waitForTimeout(2500);
  await host.screenshot({ path: path.join(OUT, '01-display-lobby.png') });
  await phones[0].screenshot({ path: path.join(OUT, '03-phone-lobby.png') });
  await host.click('[data-act="set"][data-k="rounds"][data-v="5"]');
  await host.click('[data-act="set"][data-k="talk"][data-v="30"]');
  await host.waitForTimeout(300);
  await host.click('[data-act="start"]', { force: true });
  const seenMaps = new Set();
  const phaseOf = () => host.evaluate(() => document.querySelector('#overlay').dataset.phase);
  const waitPhase = async (ph, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phaseOf()) === ph) return true; await host.waitForTimeout(150); } return false; };
  for (let round = 1; round <= 5; round++) {
    if (!await waitPhase('intro')) throw Error('no intro in round ' + round);
    if (round === 1) await host.click('#hostbar [data-act="pause"]');
    await host.waitForSelector('.intro .title'); const map = await host.evaluate(() => document.querySelector('.intro .title').textContent);
    seenMaps.add(map);
    await host.waitForTimeout(700);
    if (round <= 2) await host.screenshot({ path: path.join(OUT, `1${round}-intro.png`) });
    if (round === 1) {
      await phones[0].waitForSelector('[data-hold="role"]', { timeout: 15000 }).catch(async e => { console.log('phone screen:', await phones[0].evaluate(() => document.body.className + ' | ' + document.querySelector('#screen').innerHTML.slice(0, 160) + ' | pad hidden=' + document.querySelector('#pad').hidden)); throw e; });
      await phones[0].screenshot({ path: path.join(OUT, '04-phone-role-hidden.png') });
      const btn = await phones[0].$('[data-hold="role"]'); const box = await btn.boundingBox();
      await phones[0].mouse.move(box.x + box.width / 2, box.y + box.height / 2); await phones[0].mouse.down();
      await phones[0].waitForTimeout(250); await phones[0].screenshot({ path: path.join(OUT, '05-phone-role.png') }); await phones[0].mouse.up();
      await host.click('#hostbar [data-act="resume"]');
    }
    if (!await waitPhase('countdown')) throw Error('no countdown');
    if (!await waitPhase('play', 8000)) throw Error('no play');
    // phone 0 runs right and jumps, phone 1 runs in circles and shoves
    const drive = async (p, fn) => p.evaluate(fn);
    await phones[0].keyboard.down('d');
    await phones[1].keyboard.down('w');
    for (let k = 0; k < 6; k++) { await phones[0].keyboard.press(' '); await phones[1].keyboard.press('k'); await host.waitForTimeout(450); }
    await host.screenshot({ path: path.join(OUT, `2${round}-play-${map.replace(/\s+/g, '-').toLowerCase()}.png`) });
    if (round === 1) await phones[0].screenshot({ path: path.join(OUT, '06-phone-pad.png') });
    await phones[0].keyboard.up('d'); await phones[1].keyboard.up('w');
    await host.waitForTimeout(1500);
    if (round === 1) await host.screenshot({ path: path.join(OUT, `2${round}b-play-later.png`) });
    await host.click('#hostbar [data-act="skip"]');
    if (!await waitPhase('roundEnd', 4000)) throw Error('no roundEnd');
    await host.waitForTimeout(600);
    if (round === 1) await host.screenshot({ path: path.join(OUT, '30-round-end.png') });
    if (map !== 'Dhakka King') {
      if (!await waitPhase('panchayat', 8000)) throw Error('no panchayat');
      await host.waitForTimeout(600);
      for (const p of phones) { const b = await p.$('[data-vote]'); if (b) { p.once('dialog', d => d.accept()); await b.click(); } }
      if (round === 1) { await phones[0].screenshot({ path: path.join(OUT, '07-phone-voted.png') }); await host.screenshot({ path: path.join(OUT, '31-panchayat.png') }); }
      if (!await waitPhase('reveal', 35000)) throw Error('no reveal');
      await host.waitForTimeout(5600);
      if (round <= 2) await host.screenshot({ path: path.join(OUT, `3${round + 1}-reveal.png`) });
    }
    if (!await waitPhase('scores', 12000)) throw Error('no scores');
    await host.waitForTimeout(1600);
    if (round === 1) { await host.screenshot({ path: path.join(OUT, '34-scores.png') }); await phones[0].screenshot({ path: path.join(OUT, '08-phone-scores.png') }); }
    if (round < 5) await host.click('#hostbar [data-act="skip"]');
  }
  if (!await waitPhase('finished', 15000)) throw Error('no finished');
  await host.waitForTimeout(2200);
  await host.screenshot({ path: path.join(OUT, '40-podium.png') });
  await phones[0].screenshot({ path: path.join(OUT, '09-phone-final.png') });
  // landscape phone layout
  const land = await (await phonesBrowser.newContext({ ...devices['Pixel 7 landscape'], hasTouch: true })).newPage(); watch(land, 'landscape');
  await land.goto(BASE + '/'); await land.waitForSelector('#join'); await land.fill('#nm', 'Ravi'); await land.click('#join .cta'); await land.waitForSelector('#pad:not([hidden])'); await land.waitForTimeout(400);
  await land.screenshot({ path: path.join(OUT, '10-phone-landscape.png') });
  console.log('maps seen: ' + [...seenMaps].join(', '));
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close(); await phonesBrowser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
