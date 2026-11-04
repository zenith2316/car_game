# Dhakka Mukki

A local multiplayer party game for 3 to 10 players, built on the same foundation as DesiQuip and IKKP. One Android device hosts the room and shows the arena (or casts it to a TV). Everyone else plays from their phone's browser on the same Wi-Fi. No app install for players and no internet needed.

**The idea:** a physics obstacle party (race, survive, king of the hill) where one or two players each round are secretly a **Chupa Rustam**. The saboteurs score by making others fall without being noticed. After every round the **Panchayat** sits: everyone argues out loud, then votes on their phone.

## How a match plays

| Phase | What happens |
|---|---|
| Aangan (lobby) | Players join by QR code, pick one of 10 colours and 10 looks, and practise running, jumping and shoving while they wait. The host can add bots to fill seats. |
| Intro | The round card appears on the big screen. Each phone shows a **press-and-hold** secret role card (Racer, Chupa Rustam, or Dhakka King in the final). |
| Play | 60 to 90 seconds of physics. The joystick runs, **Jump** clears low obstacles, **Dhakka** is a shove-dash that stuns whoever it hits. |
| Panchayat | 30 to 90 seconds to talk, with round facts on screen (dhakkas, falls, peels). Everyone votes or skips on their phone. |
| Reveal | Vote tally, the Panchayat's verdict, then the real saboteurs and how many falls they caused. |
| Points table | Per-player gains with reasons. After the last round comes the podium. |

**Rounds** (the playlist is shuffled, and the final round is always Dhakka King):

- **Tapri Dash** (race). Rolling-pin sweepers on a narrow bridge, moving steel thalis over a gap (or the slow rope bridge), kulhad bumpers, a crate pusher and a conveyor to the finish. The first 60% qualify. Falling respawns you at the last flag.
- **Papad Floor** (survival). 122 papads over hot oil. A papad cracks if you stand on it, and the oil heats up and breaks random papads faster over time. Half the players survive.
- **Pankha Panic** (survival). A fallen ceiling fan: three low blades you must jump plus a high hub blade you must avoid. It speeds up over the round. Half the players survive.
- **Dhakka King** (final, no saboteurs). Grab the mukut and hold it. Any hit knocks it loose. Ranked by hold time.

**Saboteur kit** (phone-only, each with a cooldown): **Kela** drops a banana peel behind you. **Bhookamp** sends a shockwave that shoves everyone nearby. **Ulta** reverses and speeds up the sweepers and conveyors (on Papad Floor this slot is **Crack** instead). Racers see three emote buttons in the same spot, so a glance at someone's phone gives nothing away. One saboteur with 3 to 6 players, two with 7 or more (they know each other).

**Scoring:** a race qualifier gets +3, with +2 for 1st and +1 for 2nd. Surviving gets +3. In the final, hold time ranks +6 / +4 / +2, and anyone else who held it gets +1. Spotting a saboteur in the vote is +2, and blaming an innocent is -1. A saboteur who isn't ejected gets +3 plus 1 per fall they caused in the last 3.5 seconds before it (capped at 5). A caught saboteur gets nothing that round.

## The host plays too (version 1.3)

Tap **Play too** on the host screen (in the lobby settings row, or the Host bar during a match) and pick a mode:

- **Play on this screen:** a joystick, Jump and Dhakka buttons and your emotes or traps appear over the arena. Menus such as joining, your role and voting open in a side card. Your role stays hidden until you press and hold, the same as on a phone, so it works on the honour system. Host controls (rounds, Chupa Rustam, talk time, bots, start, pause, skip, end) move into a **Host** button in the corner. **Stop playing on this screen** gives the arena back.
- **Use this device as my controller:** first open the display address on a TV or laptop, then this device becomes a normal phone controller with the same **Host** button. **Show the arena on this device** switches it back.

Both modes open the controller page with the host token, and the engine gives host rights to any connection that holds it, display or player.

## Architecture (reused from IKKP, upgraded for real time)

```
Host Android device                                   Player phones / TV browser
+-------------------------------------------+         +------------------------+
| MainActivity: native bar + display WebView|  Wi-Fi  | index.html  controller |
|   http://127.0.0.1:8793/display#host=...  |  (LAN)  | display.html  big screen|
| HostingService (foreground, wake+wifi lock)|  HTTP + +------------------------+
|   GameServer: static files, /api/invite,  | WebSocket
|   /ws (RFC 6455), Host + Origin checks    |
|   engine WebView (isolated, no network)   |
|     web/engine.js  via nativeStep() 30 Hz |
+-------------------------------------------+
```

- `android/assets/web/engine.js` is the single authoritative engine: rules, 60 Hz fixed-step physics, maps, bots and scoring. It is pure JavaScript with no wall-clock time, so the same file runs in the Android engine WebView, the Node dev host and the tests. The display loads it too, for map geometry.
- The service ticks the engine every 33 ms with the socket events that arrived since the last tick. The engine replies with lines of `target<TAB>json` (a client id, `*`, `D` for displays, `P` for players). The display gets about 600 byte snapshots at 30 Hz and interpolates 70 ms behind for smooth 60 fps. Phones get only their own private state.
- What carries over from IKKP: the foreground hosting service with wake and Wi-Fi locks, the isolated headless engine WebView, Host and Origin header checks, host-token admin rights, the Connect dialog (same Wi-Fi or local-only hotspot, with ZXing QR codes), a `/display` URL for a TV, seats that survive phone reconnects, no AndroidX, minSdk 26 and targetSdk 36. From DesiQuip: the Baloo 2 and Shrikhand fonts (SIL OFL) and the desi tone.
- What's new: a WebSocket channel instead of HTTP polling (IKKP's 350 requests per 10 s cap can't carry joystick input), a 3D renderer, and path-traced art, PBR textures and soundfont-rendered music. The APK is about 110 MB (see below).

## Graphics (version 1.1)

The big screen renders in 3D with three.js 0.169 (MIT, bundled in `web/vendor/`, since the page security policy only allows local scripts). Everything is still procedural, with no model or image files:

- `bean3d.js`: glossy toy characters with googly eyes, swinging arms, stepping feet, squash and stretch, stun tumbles and all 10 looks. It also renders the menu portraits and the phone's live preview.
- `world3d.js`: builds each map in 3D from the engine's own map data, so the visuals always match the physics. Candy slabs float over a sky of clouds and diyas, with rolling pins, steel thalis, clay kulhads, instanced papads over an oil kadhai, the fallen fan, dhol drums and the mukut.
- `display3d.js`: soft shadows, an environment map for the glossy look, a director camera (intro flyover, follows the pack, zooms in on a qualifier, orbits during menus), instanced 3D particles, and a dancing 3D podium.
- Quality is picked automatically and drops to a lighter mode if the frame rate falls. `/display?gfx=low`, `?gfx=high` or `?gfx=2d` force a mode. Without WebGL, the original 2D canvas renderer is used.
- The menus use a bright candy party-show style (cream panels, thick outlines, press-down buttons, stripe wipes between phases). Phones buzz and flash their screen edge when you're shoved, slip or fall.

## Assets (version 1.2)

Version 1.2 ships about 100 MB of original art and audio. Every file is generated from source in `assets-src/`, so it can be rebuilt or tweaked. Nothing is copied from another game. The style is the soft toy look of party brawlers, with desi props.

- Character (`blender/characters.py`, Blender 4.2 Python API): a rigged, skinned plush bean with baked 2K normal and AO maps, stitched seams, a morphing mouth, 9 looks plus a Rustam mask and a king's crown, and 13 animations (idle, run, jump, air, flail, dive, stun, tumble, slip, land, celebrate, dance, wave). It also renders 100 Cycles portraits (10 colours by 10 looks) for menus and phones.
- Props (`blender/props.py`): 21 models with baked PBR materials, including the chai tapri, kulhad and dhol bumpers, belan sweepers, the ceiling fan, thalis, papads, floating rock islands, clouds, lanterns, diyas, kites, garlands and a Ferris wheel.
- Textures (`textures.py`): tileable 2K foam, terracotta, marble, gold, wood and conveyor-belt sets (albedo, normal, roughness and metal), plus rangoli floor decals.
- Skies (`blender/skies.py`): five 4K equirectangular panoramas, one per map, with cloud fields, distant temples and a fairground. They also light the scene as an environment map.
- Menu art (`blender/uiart.py`): the 3D logo, role cards, trap and button icons, map title cards and the loading splash.
- Music and sound (`audio/compose.mjs`): seven looping tracks built on Indian scales with dhol grooves and meend bends, rendered through the GeneralUser GS soundfont, plus 26 sound effects. Effects fall back to the synth if a file is missing.

The display loads the asset pack in the background behind a loading screen and swaps the procedural stand-ins for the real models when ready. `assets.js` lists every file. The APK stores already-compressed media uncompressed so it can be read straight from the package.

## Run it

```bash
npm run dev            # Node dev host with the same routes and protocol as the APK
# host screen: the URL printed with #host=...   players: http://<your-lan-ip>:8793/
npm test               # headless engine tests, including a full 10-player match with bots
npm run e2e            # Playwright: display + 2 phones + bots through every phase (needs the dev host running. DM_GFX=2d keeps it fast without a GPU)
npm run apk            # builds and signs build/out/DhakkaMukki.apk
```

`build/build-apk.sh` needs no Gradle or SDK manager. It downloads Robolectric's `android-all` (API 34 framework jar) and dalvik-dx, apksig and ZXing from Maven Central, and aapt2 from the `aaptjs3` npm package. It signs with APK Signature Scheme v2, which every Android 8+ device verifies. Set `DM_KEYSTORE`, `DM_KEY_ALIAS` and `DM_KEY_PASS` to sign with your own key. Otherwise it creates one in `build/.keystore/` (git-ignored). Keep that key to ship updates over an existing install.

`test/jvm/` runs the real Java `GameServer` on a desktop JVM, with a Node process standing in for the engine WebView, so the native networking can be tested without a device.

## Known limits

- Tested on desktop JVM, Chromium and emulated phones, with software WebGL for the 3D path. Not yet run on a physical Android device, so 3D frame rate on a real host tablet or phone is unmeasured (the renderer falls back to a lighter mode on its own).
- If the host app's process is killed, the room is gone (no mid-match checkpoint, unlike IKKP's turn-based save).
- Loading the asset pack on a low-end host device may take several seconds, and GPU memory use with all textures loaded is unmeasured on real hardware.
- English UI with Hinglish flavour. There is no full Hinglish toggle yet (IKKP has one).
