"""Assemble the unsigned APK: aapt2 output (manifest, resources.arsc, res/) + classes.dex + assets/.
resources.arsc is stored uncompressed and 4-byte aligned (required for targetSdk 30+); apksig keeps alignment."""
import sys, zipfile, os
base, dex, assets, out = sys.argv[1:5]
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(out, 'w') as zo:
    def add(name, data, store):
        info = zipfile.ZipInfo(name, date_time=(2026, 11, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED
        if store:
            # pad the local header's extra field so file data starts on a 4-byte boundary
            hdr = 30 + len(name.encode())
            pad = (4 - (zo.fp.tell() + hdr) % 4) % 4
            info.extra = b'\x00' * pad
        zo.writestr(info, data)
    names = zin.namelist()
    for n in ['AndroidManifest.xml'] + [n for n in names if n != 'AndroidManifest.xml']:
        add(n, zin.read(n), n == 'resources.arsc' or n.endswith('.png'))
    add('classes.dex', open(dex, 'rb').read(), False)
    for root, _, files in os.walk(assets):
        for f in sorted(files):
            p = os.path.join(root, f)
            rel = 'assets/' + os.path.relpath(p, assets).replace(os.sep, '/')
            add(rel, open(p, 'rb').read(), f.endswith('.woff2'))
print('packaged', out)
