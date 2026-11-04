"""Tileable 2K PBR floor materials and rangoli decals for Dhakka Mukki.
Spectral (FFT) noise is periodic by construction, so every texture tiles seamlessly.
Run: python3 assets-src/textures.py <repo_root>   (needs numpy and pillow)"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = sys.argv[1]
OUT = os.path.join(ROOT, 'android/assets/web/assets/tex'); os.makedirs(OUT, exist_ok=True)
N = 2048
rng = np.random.default_rng(11)

def fnoise(beta=2.0, n=N, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((n, n))
    f = np.fft.fft2(w)
    ky = np.fft.fftfreq(n)[:, None]; kx = np.fft.fftfreq(n)[None, :]
    k = np.sqrt(kx * kx + ky * ky); k[0, 0] = 1
    out = np.real(np.fft.ifft2(f / k ** (beta / 2)))
    out -= out.min(); out /= out.max(); return out

def band(beta, lo, hi, n=N):
    w = rng.standard_normal((n, n)); f = np.fft.fft2(w)
    ky = np.fft.fftfreq(n)[:, None] * n; kx = np.fft.fftfreq(n)[None, :] * n
    k = np.sqrt(kx * kx + ky * ky); mask = (k >= lo) & (k <= hi)
    out = np.real(np.fft.ifft2(f * mask)); out -= out.min(); out /= out.max(); return out

def normal_from_height(h, strength=4.0):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h); l = np.sqrt(dx * dx + dy * dy + nz * nz)
    n = np.stack([-dx / l, dy / l, nz / l], -1)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))

def save(name, albedo, height, rough, strength=4.0, metal=None):
    Image.fromarray(np.clip(albedo * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_albedo.jpg'), quality=90)
    normal_from_height(height, strength).save(os.path.join(OUT, f'{name}_normal.png'), optimize=True)
    r = np.clip(rough, 0, 1)
    m = np.zeros_like(r) if metal is None else np.clip(metal, 0, 1)
    # glTF style packing: G = roughness, B = metalness
    Image.fromarray((np.stack([np.ones_like(r), r, m], -1) * 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_orm.jpg'), quality=92)
    print('texture', name)

yy, xx = np.mgrid[0:N, 0:N] / N

# 1. padded foam: soft quilted cushions with stitched seams (neutral, tinted per slab at runtime)
cells = 8; u = (xx * cells) % 1; v = (yy * cells) % 1
pillow = (np.sin(u * np.pi) * np.sin(v * np.pi)) ** 0.45
seam = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
stitch = ((seam > 0.035) & (seam < 0.05)) * ((np.sin((u + v) * cells * 40) > 0.2) * 1.0)
micro = fnoise(1.2)
h = pillow * 0.9 + micro * 0.06 - stitch * 0.05
alb = 0.86 + 0.1 * pillow + 0.04 * (fnoise(2.2) - 0.5)
alb = np.stack([alb, alb, alb], -1)
alb[stitch > 0] *= 1.08
save('foam', alb, h, 0.62 + 0.15 * micro, 5.0)

# 2. terracotta tiles with grout, per-tile variation and chips
cells = 6; tu = xx * cells; tv = yy * cells
ix, iy = np.floor(tu).astype(int) % cells, np.floor(tv).astype(int) % cells
u, v = tu % 1, tv % 1
tile_rand = rng.random((cells, cells))[iy, ix]
edge = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
grout = np.clip((0.035 - edge) / 0.015, 0, 1)
bevel = np.clip(edge / 0.06, 0, 1) ** 0.6
n1 = fnoise(2.4); n2 = band(1, 200, 600)
h = bevel * (1 - grout) + n1 * 0.08 + n2 * 0.03 - (n2 > 0.92) * 0.2
base = np.array([0.78, 0.38, 0.22]); var = (0.85 + 0.25 * tile_rand)[..., None]
alb = base * var * (0.9 + 0.2 * n1[..., None])
alb = alb * (1 - grout[..., None]) + np.array([0.86, 0.8, 0.72]) * grout[..., None]
save('terracotta', alb, h, 0.8 - 0.15 * n1 + grout * 0.1, 4.0)

# 3. white marble with veins
t = fnoise(4.2); t2 = fnoise(3.8)
vein = 1 - np.exp(-np.abs(np.sin((xx * 2 + yy * 1 + t * 2.2) * np.pi * 2)) * 14)
vein2 = 1 - np.exp(-np.abs(np.sin((xx * 1 - yy * 3 + t2 * 2.6) * np.pi * 2)) * 30) * 0.6
m = np.clip(np.minimum(vein, vein2) * (0.96 + 0.04 * fnoise(3.0)), 0, 1)
alb = 0.97 - (1 - m) * 0.35; alb = np.stack([alb * 0.99, alb * 0.97, alb], -1)
alb += (np.array([0.75, 0.62, 0.95]) - 1) * ((1 - m) * 0.25)[..., None]
save('marble', alb, m * 0.2 + t * 0.05, 0.12 + (1 - m) * 0.15, 2.0)

# 4. gold mosaic: diamond tiles of gold with jewel-pink grout
cells = 10; d = (np.abs(((xx + yy) * cells) % 1 - 0.5) + np.abs(((xx - yy) * cells) % 1 - 0.5))
edge = np.abs(d - 0.5); grout = np.clip((0.06 - edge) / 0.02, 0, 1)
n1 = fnoise(2.2)
alb = np.array([1.0, 0.76, 0.24]) * (0.85 + 0.25 * n1[..., None])
alb = alb * (1 - grout[..., None]) + np.array([0.9, 0.12, 0.45]) * grout[..., None]
h = (1 - grout) * (0.5 + 0.5 * (1 - d)) + n1 * 0.05
save('gold', alb, h, 0.28 + 0.2 * n1 + grout * 0.5, 4.0, metal=(1 - grout) * 0.95)

# 5. wood planks
rows = 8; pv = yy * rows; prow = np.floor(pv).astype(int) % rows; pu = (xx + rng.random(rows)[prow]) % 1
grain = np.sin((pv % 1) * 40 + fnoise(1.6)[..., ] * 18 + pu * 3) * 0.5 + 0.5
seam = np.clip((0.04 - np.minimum(pv % 1, 1 - pv % 1)) / 0.02, 0, 1)
end = np.clip((0.006 - np.abs(((pu * 3) % 1) - 0.5) + 0.494) / 0.004, 0, 1) * 0
alb = np.array([0.78, 0.53, 0.3]) * (0.8 + 0.25 * grain[..., None]) * (0.9 + 0.2 * rng.random(rows)[prow][..., None])
alb = alb * (1 - seam[..., None] * 0.7)
save('wood', alb, grain * 0.15 - seam * 0.6, 0.55 + grain * 0.15, 3.0)

# 6. conveyor rubber: ribbed belt
rib = (np.sin(xx * N / 16 * np.pi * 2) * 0.5 + 0.5) ** 2
n1 = fnoise(1.4)
alb = np.stack([0.22 + 0.04 * n1] * 3, -1) * np.array([1.0, 0.95, 1.15])
save('belt', alb, rib * 0.6 + n1 * 0.05, 0.7, 6.0)

# 7. rangoli decals (RGBA), drawn at 2048 with supersampling
def rangoli(name, cols, petals=12, rings=4):
    S = 2048; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); c = S / 2
    for ring in range(rings, 0, -1):
        R = S * 0.46 * ring / rings; col = cols[ring % len(cols)]; n = petals * ring
        for i in range(n):
            a = i / n * math.tau
            for k, (rr, w, colk) in enumerate([(R * 0.74, R * 0.2, col), (R * 0.74, R * 0.12, cols[(ring + 1) % len(cols)])]):
                pts = []
                for t in np.linspace(0, math.tau, 40):
                    x = math.cos(t) * w * 1.25; y = math.sin(t) * w * 0.48
                    px = c + math.cos(a) * (rr + x) - math.sin(a) * y; py = c + math.sin(a) * (rr + x) + math.cos(a) * y
                    pts.append((px, py))
                dr.polygon(pts, fill=colk)
        for i in range(n * 2):
            a = i / (n * 2) * math.tau; x = c + math.cos(a) * R * 0.98; y = c + math.sin(a) * R * 0.98
            dr.ellipse((x - S * 0.006, y - S * 0.006, x + S * 0.006, y + S * 0.006), fill=(255, 255, 255, 255))
    for k, rr in enumerate([0.12, 0.08, 0.04]):
        dr.ellipse((c - S * rr, c - S * rr, c + S * rr, c + S * rr), fill=cols[k % len(cols)])
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    im.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=92)
    print('decal', name)
H = lambda h, a=255: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (a,)
rangoli('rangoli_a', [H('#E8177D'), H('#FFC21A'), H('#14C4B4'), H('#FFFFFF')], 12, 4)
rangoli('rangoli_b', [H('#FF7A1A'), H('#9B5CFF'), H('#FFC21A'), H('#FFFFFF')], 10, 3)
rangoli('rangoli_c', [H('#FF4B4B'), H('#FFFFFF'), H('#3D8BFF'), H('#FFC21A')], 14, 5)
print('TEXTURES DONE')
