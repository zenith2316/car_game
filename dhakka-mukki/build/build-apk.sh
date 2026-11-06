#!/usr/bin/env bash
# Builds and signs DhakkaMukki.apk without Gradle or the Android SDK downloader.
# Tools come from Maven Central and npm: Robolectric android-all (API 34 framework jar for compiling and linking),
# dalvik-dx (dexer), apksig (signing), ZXing core (QR codes), and aapt2 from the aaptjs3 npm package.
# Usage: build/build-apk.sh            env: DM_KEYSTORE, DM_KEY_ALIAS, DM_KEY_PASS to sign with your own key
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="${DM_TOOLS:-$ROOT/build/.tools}"; OUT="$ROOT/build/out"; mkdir -p "$T"
M=https://repo1.maven.org/maven2
fetch() { [ -s "$T/$2" ] && return 0; for i in 1 2 3 4 5; do curl -fsSL -o "$T/$2" "$1" && return 0; sleep $((i * 4)); done; echo "could not download $1" >&2; return 1; }
fetch "$M/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar" android-all.jar
fetch "$M/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" dx.jar
fetch "$M/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar" apksig.jar
fetch "$M/com/google/zxing/core/3.5.3/core-3.5.3.jar" zxing.jar
if [ ! -x "$T/aapt2" ]; then (cd "$T" && npm pack aaptjs3@2.0.2 --silent >/dev/null && tar xzf aaptjs3-2.0.2.tgz && cp package/bin/x64/linux/aapt2 aapt2 && chmod +x aapt2 && rm -rf package aaptjs3-2.0.2.tgz); fi
AJ="$T/android-all.jar"; A2="$T/aapt2"
KS="${DM_KEYSTORE:-$ROOT/build/.keystore/release.p12}"; ALIAS="${DM_KEY_ALIAS:-dhakka}"; PASS="${DM_KEY_PASS:-dhakkamukki}"
if [ ! -f "$KS" ]; then mkdir -p "$(dirname "$KS")"; keytool -genkeypair -storetype PKCS12 -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Dhakka Mukki, O=Local Party Games" >/dev/null 2>&1; echo "created signing key $KS (keep it to ship updates)"; fi

rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes"
"$A2" compile --dir "$ROOT/android/res" -o "$OUT/res.zip"
"$A2" link -I "$AJ" --manifest "$ROOT/android/AndroidManifest.xml" --java "$OUT/gen" -o "$OUT/base.apk" "$OUT/res.zip" --min-sdk-version 26 --target-sdk-version 36 --auto-add-overlay
javac -source 8 -target 8 -Xlint:-options -nowarn -encoding UTF-8 -cp "$AJ:$T/zxing.jar" -d "$OUT/classes" $(find "$ROOT/android/src" "$OUT/gen" -name '*.java')
java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes" "$T/zxing.jar"
python3 "$ROOT/build/package.py" "$OUT/base.apk" "$OUT/classes.dex" "$ROOT/android/assets" "$OUT/unsigned.apk"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$T/apksig.jar" "$ROOT/build/Sign.java" sign "$OUT/unsigned.apk" "$OUT/DhakkaMukki.apk" "$KS" "$ALIAS" "$PASS"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$T/apksig.jar" "$ROOT/build/Sign.java" verify "$OUT/DhakkaMukki.apk"
ls -la "$OUT/DhakkaMukki.apk"
