/* Runs ONLY in the isolated native engine WebView, never served to guests.
   The service calls nativeStep(batchJson, elapsedMs) every ~33 ms with the socket events since the last call.
   It returns the engine's output as lines of "target<TAB>json" (JSON never contains raw tabs or newlines). */
'use strict';
(function () {
  let engine;
  try { engine = new Dhakka.Engine(); }
  catch (e) { NativeEngine.failure('The game engine could not start. Reinstall Dhakka Mukki. ' + String(e && e.message || e)); return; }
  window.nativeStep = function (batch, ms) {
    try {
      const events = JSON.parse(batch);
      for (const ev of events) {
        if (ev[0] === 'o') engine.open(ev[1]);
        else if (ev[0] === 'm') engine.message(ev[1], ev[2]);
        else if (ev[0] === 'c') engine.close(ev[1]);
      }
      const out = engine.update(ms);
      let s = '';
      for (let i = 0; i < out.length; i++) s += out[i][0] + '\t' + out[i][1] + '\n';
      return s;
    } catch (e) { return ''; }
  };
  NativeEngine.ready(engine.hostToken);
})();
