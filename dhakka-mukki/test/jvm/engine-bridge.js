/* Stands in for the Android engine WebView: loads engine_host.js unchanged and answers nativeStep calls
   over stdin/stdout, returning JSON string literals exactly like WebView.evaluateJavascript does. */
'use strict';
const path = require('node:path'), readline = require('node:readline');
globalThis.window = globalThis;
globalThis.Dhakka = require(path.join(__dirname, '../../android/assets/web/engine.js'));
globalThis.NativeEngine = { ready: t => process.stderr.write('TOKEN ' + t + '\n'), failure: m => process.stderr.write('FAIL ' + m + '\n') };
require(path.join(__dirname, '../../android/assets/engine_host.js'));
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { const tab = line.lastIndexOf('\t'); const batch = JSON.parse(line.slice(0, tab)); const out = window.nativeStep(batch, Number(line.slice(tab + 1))); process.stdout.write(JSON.stringify(out) + '\n'); });
