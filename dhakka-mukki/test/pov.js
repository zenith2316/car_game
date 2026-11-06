/* Phone camera check: joins one phone with its own 3D view, drives the room through the host token, and screenshots each mode.
   Run: node server/dev-host.js & node test/pov.js <tokenFile> <outDir> [modes] [x] [portrait]   (needs the dev host started with DM_TOKEN_FILE) */

const { chromium, devices } = require('playwright'); const fs = require('fs');
const tok = fs.readFileSync(process.argv[2], 'utf8').trim(), out = process.argv[3], modes = (process.argv[4] || 'akhada,patakha,sumo,rassi,chor,tapri').split(','), withDisplay = process.argv[5] === 'display';
const ws = new WebSocket('ws://127.0.0.1:8793/ws'); const send = o => ws.send(JSON.stringify(o)); let room = null;
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.t === 'room') room = m; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => ws.onopen = r); send({ t: 'hello', role: 'display', host: tok }); await sleep(300);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const errs = [];
  const ph = await (await b.newContext({ ...devices[process.argv[6] === 'portrait' ? 'Pixel 7' : 'Pixel 7 landscape'], reducedMotion: 'reduce' })).newPage();
  ph.on('pageerror', e => errs.push('phone: ' + e.message)); ph.on('console', m => { if (m.type() === 'error') errs.push('phone: ' + m.text().slice(0, 150)); });
  let disp = null;
  if (withDisplay) { disp = await (await b.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: 'reduce' })).newPage(); disp.on('pageerror', e => errs.push('display: ' + e.message)); await disp.goto('http://127.0.0.1:8793/display?gfx=low&nohq'); }
  await ph.goto('http://127.0.0.1:8793/'); await ph.waitForSelector('#join'); await ph.fill('#nm', 'Chamma'); await ph.click('#join .cta');
  await ph.waitForSelector('#pad:not([hidden])'); for (let i = 0; i < 6; i++) { send({ t: 'host', a: 'addBot' }); await sleep(120); }
  await sleep(4000); await ph.screenshot({ path: out + '/0-lobby.png', timeout: 120000 }); console.log('lobby shot, pov canvas visible:', await ph.evaluate(() => !document.querySelector('#gl').hidden));
  for (const m of modes) {
    send({ t: 'host', a: 'settings', settings: { games: [m], rounds: 3, talk: 30 } }); await sleep(200); send({ t: 'host', a: 'start' });
    const t0 = Date.now(); while (Date.now() - t0 < 40000 && !(room && room.phase === 'play')) await sleep(200);
    await sleep(3500);

    await ph.screenshot({ path: `${out}/p-${m}.png`, timeout: 120000 });
    if (disp) await disp.screenshot({ path: `${out}/d-${m}.png`, timeout: 120000 });
    console.log(m, 'phase', room && room.phase);
    send({ t: 'host', a: 'lobby' }); await sleep(800);
  }
  console.log('errors', errs.slice(0, 10)); await b.close(); ws.close(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });
