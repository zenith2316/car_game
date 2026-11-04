"""Dhakka Mukki character: rigged bean with baked plush detail, morphing mouth, 9 accessory looks and an animation library.
Output: android/assets/web/assets/models/bean.glb (+ preview renders for QA).
Run: python3.11 assets-src/blender/characters.py -- <repo_root> <qa_dir>"""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix, Euler
from common import *

ROOT, QA = sys.argv[-2], sys.argv[-1]
OUT = os.path.join(ROOT, 'android/assets/web/assets/models')
TEX = os.path.join(QA, 'bake'); os.makedirs(TEX, exist_ok=True); os.makedirs(OUT, exist_ok=True)
H, R = 1.16, 0.45            # bean height and radius in metres (runtime scale 50 = engine units)
scene = reset()
scene.render.fps = 30

# ---------------------------------------------------------------- body
def bean_profile(n=44):
    pts = []
    for i in range(n + 1):
        t = i / n
        e = abs(2 * t - 1) ** 2.2
        r = R * max(0.0, 1 - e) ** (1 / 2.2) * (1 - 0.12 * t)
        pts.append((max(0.004, r), t * H))
    return pts

body = lathe('Body', bean_profile(), 72)
add_mod(body, 'SUBSURF', levels=1, render_levels=1)
apply_mods(body); smooth(body)

# plush material: micro fabric bump, side seams with stitches, a waist seam
mat = principled('BodyBake', '#FFFFFF', 0.5)
b = bsdf(mat)
tc = node(mat, 'ShaderNodeTexCoord', (-1400, 0))
sep = node(mat, 'ShaderNodeSeparateXYZ', (-1200, 0)); link(mat, tc.outputs['Object'], sep.inputs['Vector'])
ax = node(mat, 'ShaderNodeMath', (-1000, 200), operation='ABSOLUTE'); link(mat, sep.outputs['Y'], ax.inputs[0])
groove = node(mat, 'ShaderNodeMapRange', (-800, 200)); groove.inputs['From Min'].default_value = 0.0; groove.inputs['From Max'].default_value = 0.012; groove.inputs['To Min'].default_value = -1; groove.inputs['To Max'].default_value = 0
link(mat, ax.outputs[0], groove.inputs['Value'])
# stitches either side of the seam
off = node(mat, 'ShaderNodeMath', (-1000, 400), operation='SUBTRACT'); off.inputs[1].default_value = 0.022; link(mat, ax.outputs[0], off.inputs[0])
offa = node(mat, 'ShaderNodeMath', (-850, 400), operation='ABSOLUTE'); link(mat, off.outputs[0], offa.inputs[0])
band = node(mat, 'ShaderNodeMath', (-700, 400), operation='LESS_THAN'); band.inputs[1].default_value = 0.006; link(mat, offa.outputs[0], band.inputs[0])
zs = node(mat, 'ShaderNodeMath', (-1000, 600), operation='MULTIPLY'); zs.inputs[1].default_value = 190.0; link(mat, sep.outputs['Z'], zs.inputs[0])
sn = node(mat, 'ShaderNodeMath', (-850, 600), operation='SINE'); link(mat, zs.outputs[0], sn.inputs[0])
dash = node(mat, 'ShaderNodeMath', (-700, 600), operation='GREATER_THAN'); dash.inputs[1].default_value = 0.2; link(mat, sn.outputs[0], dash.inputs[0])
stitch = node(mat, 'ShaderNodeMath', (-550, 500), operation='MULTIPLY'); link(mat, band.outputs[0], stitch.inputs[0]); link(mat, dash.outputs[0], stitch.inputs[1])
# waist seam ring
wz = node(mat, 'ShaderNodeMath', (-1000, -200), operation='SUBTRACT'); wz.inputs[1].default_value = 0.30; link(mat, sep.outputs['Z'], wz.inputs[0])
wza = node(mat, 'ShaderNodeMath', (-850, -200), operation='ABSOLUTE'); link(mat, wz.outputs[0], wza.inputs[0])
waist = node(mat, 'ShaderNodeMapRange', (-700, -200)); waist.inputs['From Min'].default_value = 0; waist.inputs['From Max'].default_value = 0.01; waist.inputs['To Min'].default_value = -0.8; waist.inputs['To Max'].default_value = 0
link(mat, wza.outputs[0], waist.inputs['Value'])
noise = node(mat, 'ShaderNodeTexNoise', (-900, -450)); noise.inputs['Scale'].default_value = 420; noise.inputs['Detail'].default_value = 3
link(mat, tc.outputs['Object'], noise.inputs['Vector'])
nm = node(mat, 'ShaderNodeMath', (-700, -450), operation='MULTIPLY'); nm.inputs[1].default_value = 0.25; link(mat, noise.outputs['Fac'], nm.inputs[0])
a1 = node(mat, 'ShaderNodeMath', (-400, 200), operation='ADD'); link(mat, groove.outputs['Result'], a1.inputs[0]); link(mat, stitch.outputs[0], a1.inputs[1])
a2 = node(mat, 'ShaderNodeMath', (-250, 100), operation='ADD'); link(mat, a1.outputs[0], a2.inputs[0]); link(mat, waist.outputs['Result'], a2.inputs[1])
a3 = node(mat, 'ShaderNodeMath', (-100, 0), operation='ADD'); link(mat, a2.outputs[0], a3.inputs[0]); link(mat, nm.outputs[0], a3.inputs[1])
bump = node(mat, 'ShaderNodeBump', (100, -200)); bump.inputs['Strength'].default_value = 0.9; bump.inputs['Distance'].default_value = 0.004
link(mat, a3.outputs[0], bump.inputs['Height']); link(mat, bump.outputs['Normal'], b.inputs['Normal'])
body.data.materials.append(mat)
smart_uv(body, 0.01, 75)

# ---------------------------------------------------------------- face, arms, shoes
def obj_from(fn, name, **kw):
    fn(**kw); o = bpy.context.object; o.name = name; return o

white = principled('EyeWhite', '#FFFFFF', 0.12, coat=1.0)
ink = principled('Ink', '#150A24', 0.25, coat=0.6)
glint = principled('Glint', '#FFFFFF', 0.1, emit='#FFFFFF', emit_strength=2.0)
blush = principled('Blush', '#FF7FA8', 0.6, alpha=0.6)
shoe = principled('Shoe', '#FFFFFF', 0.45, coat=0.5)
sole = principled('Sole', '#FFF4E0', 0.7)
armmat = principled('Arm', '#FFFFFF', 0.5)

def surface_y(x, z, extra=0.0):
    """front surface (−Y) of the bean at height z and side offset x"""
    t = z / H; e = abs(2 * t - 1) ** 2.2
    r = R * max(0.0, 1 - e) ** (1 / 2.2) * (1 - 0.12 * t)
    return -math.sqrt(max(1e-6, r * r - x * x)) - extra

face = []
for sx in (-1, 1):
    x, z = sx * 0.152, 0.80
    e = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Eye.{sx}', radius=0.128, segments=40, ring_count=24, location=(x, surface_y(x, z, -0.045), z))
    e.scale = (1, 0.62, 1.18); e.data.materials.append(white); smooth(e); face.append(e)
    p = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Pupil.{sx}', radius=0.062, segments=32, ring_count=16, location=(x, surface_y(x, z, 0.03), z - 0.012))
    p.scale = (1, 0.55, 1.15); p.data.materials.append(ink); smooth(p); face.append(p)
    g = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Glint.{sx}', radius=0.02, segments=16, ring_count=8, location=(x - 0.024, surface_y(x, z, 0.062), z + 0.03))
    g.data.materials.append(glint); smooth(g); face.append(g)
    c = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Cheek.{sx}', radius=0.07, segments=24, ring_count=12, location=(sx * 0.27, surface_y(sx * 0.27, 0.64, -0.01), 0.64))
    c.scale = (1, 0.35, 0.62); c.data.materials.append(blush); smooth(c); face.append(c)

# mouth: a flat D-shaped smile with shape keys Open (an O) and Grit (flat line)
def mouth_mesh():
    bm = bmesh.new(); pts = []
    N = 24
    for i in range(N + 1):            # top edge, gentle curve
        u = i / N; x = (u - 0.5) * 0.21; pts.append((x, 0.016 * math.cos((u - 0.5) * math.pi)))
    for i in range(1, N):             # bottom edge, round
        u = 1 - i / N; x = (u - 0.5) * 0.21; pts.append((x, -0.088 * math.sin(u * math.pi)))
    front = [bm.verts.new((x, 0, z)) for x, z in pts]
    back = [bm.verts.new((x, 0.03, z)) for x, z in pts]
    cf = bm.verts.new((0, 0, -0.03)); cb = bm.verts.new((0, 0.03, -0.03))
    n = len(pts)
    for i in range(n):   # triangle fans: the D shape is concave, so an n-gon would triangulate badly
        j = (i + 1) % n; bm.faces.new((cf, front[j], front[i])); bm.faces.new((cb, back[i], back[j]))
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((front[i], front[j], back[j], back[i]))
    me = bpy.data.meshes.new('Mouth'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('Mouth', me); bpy.context.collection.objects.link(o); return o, pts
mouth, mpts = mouth_mesh()
mouth.location = (0, surface_y(0, 0.61, 0.006), 0.61); mouth.data.materials.append(ink)
def conform(co):
    # wrap the flat mouth onto the curved face: front verts sit just proud of the surface, back verts sink in
    x, y, z = co; base = surface_y(0, 0.61, 0.006)
    sy = surface_y(max(-0.4, min(0.4, x)), 0.61 + z, 0.004) - base
    return Vector((x, sy + (0.035 if y > 0.01 else 0.0), z))
for v in mouth.data.vertices: v.co = conform(v.co)
mouth.shape_key_add(name='Basis')
k_open = mouth.shape_key_add(name='Open'); k_grit = mouth.shape_key_add(name='Grit')
n = len(mpts)
for i, v in enumerate(mouth.data.vertices):
    x, y, z = v.co
    a = math.atan2(z + 0.03, x); k_open.data[i].co = conform(Vector((math.cos(a) * 0.06, 0.03 if y > 0.01 else 0, math.sin(a) * 0.07 - 0.03)))
    k_grit.data[i].co = conform(Vector((x * 0.9, 0.03 if y > 0.01 else 0, max(-0.022, min(0.014, z)) * 0.6)))
smooth(mouth)

arms = []
for sx in (-1, 1):
    a = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Arm.{sx}', radius=1, segments=32, ring_count=20, location=(sx * 0.47, 0, 0.47))
    a.scale = (0.092, 0.092, 0.17); a.rotation_euler = (0, sx * 0.38, 0); a.data.materials.append(armmat); smooth(a); arms.append(a)

shoes = []
for sx in (-1, 1):
    s = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Shoe.{sx}', radius=1, segments=32, ring_count=18, location=(sx * 0.18, -0.04, 0.075))
    s.scale = (0.15, 0.22, 0.095); s.data.materials.append(shoe); smooth(s)
    bpy.context.view_layer.objects.active = s
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0.03), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    so = obj_from(bpy.ops.mesh.primitive_cylinder_add, f'Sole.{sx}', radius=1, depth=1, vertices=32, location=(sx * 0.18, -0.04, 0.03))
    so.scale = (0.152, 0.222, 0.03); so.data.materials.append(sole)
    add_mod(so, 'BEVEL', width=0.01, segments=2); shoes += [s, so]

# ---------------------------------------------------------------- accessories (looks)
def curve_tube(name, points, radius, mat, taper=None, resolution=12, cyclic=False):
    cd = bpy.data.curves.new(name, 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = radius; cd.bevel_resolution = 6; cd.resolution_u = resolution
    sp = cd.splines.new('NURBS' if not cyclic else 'NURBS'); sp.points.add(len(points) - 1)
    for i, p in enumerate(points): sp.points[i].co = (*p, 1)
    sp.use_endpoint_u = not cyclic; sp.use_cyclic_u = cyclic; sp.order_u = 4
    if taper:
        for i, w in enumerate(taper): sp.points[i].radius = w
    o = bpy.data.objects.new(name, cd); bpy.context.collection.objects.link(o)
    cd.materials.append(mat)
    select_only(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object; smooth(o); return o

looks = {}
def look(i, *objs):
    looks.setdefault(i, []).extend(objs)

# 1 Gandhi topi: a boat-shaped khadi cap with a centre crease
topi_m = principled('Khadi', '#FAF7F0', 0.85)
t = obj_from(bpy.ops.mesh.primitive_cylinder_add, 'Topi', radius=0.29, depth=0.17, vertices=48, location=(0, 0.02, 1.115))
bpy.context.view_layer.objects.active = t; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
for v in t.data.vertices:
    if v.co.z > 0: v.co.x *= 0.28; v.co.z += 0.03 * (1 - abs(v.co.y) / 0.25)
t.scale = (1.0, 1.22, 1.0); t.rotation_euler = (math.radians(-8), 0, 0)
add_mod(t, 'SUBSURF', levels=2); t.data.materials.append(topi_m); apply_mods(t); smooth(t); look(1, t)

# 2 pagdi: saffron fabric wrapped in a rising spiral, ruby brooch and a plume
pag_m = principled('Pagdi', '#FF7A00', 0.7, sss=0.05); pag2 = principled('Pagdi2', '#FFB000', 0.65)
gold = principled('Gold', '#FFC23A', 0.22, metal=1.0); ruby = principled('Ruby', '#D0103A', 0.05, coat=1.0)
pts = []
for i in range(60):
    a = i / 60 * TAU * 2.6; z = 0.93 + i / 60 * 0.22; r = 0.36 - (i / 60) ** 2 * 0.22
    pts.append((math.cos(a) * r, math.sin(a) * r * 1.04, z))
look(2, curve_tube('PagdiWrap', pts, 0.07, pag_m, resolution=6))
pts2 = [(math.cos(a) * 0.335, math.sin(a) * 0.35, 0.965 + 0.02 * math.sin(a * 3)) for a in [i / 32 * TAU for i in range(33)]]
look(2, curve_tube('PagdiBand', pts2, 0.04, pag2, resolution=4))
br = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, 'Brooch', radius=0.05, location=(0, -0.37, 1.02)); br.scale = (1, 0.5, 1); br.data.materials.append(ruby); smooth(br)
ring = obj_from(bpy.ops.mesh.primitive_torus_add, 'BroochRing', major_radius=0.055, minor_radius=0.012, location=(0, -0.365, 1.02), rotation=(math.pi / 2, 0, 0)); ring.data.materials.append(gold); smooth(ring)
plume = curve_tube('Plume', [(0, -0.33, 1.05), (0.02, -0.30, 1.18), (0.06, -0.24, 1.30), (0.12, -0.17, 1.36)], 0.035, principled('Plume', '#FFF6E0', 0.9), taper=[0.3, 1, 0.8, 0.1])
look(2, br, ring, plume)

# 3 gajra: jasmine flowers with orange kanakambaram arching over the head
jas = principled('Jasmine', '#FFFFFF', 0.6, sss=0.1); kan = principled('Kanakambaram', '#FF8A1C', 0.55); leaf = principled('Leaf', '#2E9A3A', 0.5)
for i in range(13):
    a = 0.18 + i / 12 * (math.pi - 0.36)
    cx, cz = math.cos(a) * 0.37, 0.86 + math.sin(a) * 0.28; cy = -0.06
    m_ = jas if i % 3 else kan
    for k in range(5):
        pa = k / 5 * TAU
        p = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Petal{i}_{k}', radius=0.035, segments=12, ring_count=8,
                     location=(cx + math.cos(pa) * 0.03 * math.cos(a + math.pi / 2), cy - 0.02 + math.sin(pa) * 0.03, cz + math.cos(pa) * 0.03 * math.sin(a + math.pi / 2)))
        p.scale = (1, 0.45, 0.6); p.data.materials.append(m_); smooth(p); look(3, p)
    c = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Bud{i}', radius=0.015, location=(cx, cy - 0.04, cz)); c.data.materials.append(principled('Pollen', '#FFD23A', 0.5)); look(3, c)
for sx in (-1, 1):
    lf = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Leaf{sx}', radius=0.06, location=(sx * 0.37, 0.05, 0.86)); lf.scale = (0.5, 0.2, 1.3); lf.rotation_euler = (0, sx * 0.5, 0); lf.data.materials.append(leaf); smooth(lf); look(3, lf)

# 4 backwards cap
capm = principled('Cap', '#E8177D', 0.55); capd = principled('CapDark', '#A40D55', 0.5)
dome = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, 'CapDome', radius=0.335, segments=48, ring_count=24, location=(0, 0, 0.9))
bpy.context.view_layer.objects.active = dome; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.bisect(plane_co=(0, 0, 0.93), plane_no=(0, 0, 1), clear_inner=True, use_fill=False); bpy.ops.object.mode_set(mode='OBJECT')
add_mod(dome, 'SOLIDIFY', thickness=0.015); dome.data.materials.append(capm); apply_mods(dome); smooth(dome)
brim = obj_from(bpy.ops.mesh.primitive_cylinder_add, 'Brim', radius=0.2, depth=0.025, vertices=40, location=(0, 0.34, 0.95))
brim.scale = (1.0, 0.85, 1); brim.rotation_euler = (math.radians(-10), 0, 0)
bpy.context.view_layer.objects.active = brim
for v in brim.data.vertices:
    if v.co.y < -0.05: v.co.y = -0.05
add_mod(brim, 'BEVEL', width=0.008, segments=2); brim.data.materials.append(capd)
btn = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, 'CapButton', radius=0.035, location=(0, 0, 1.17)); btn.data.materials.append(capd); smooth(btn)
look(4, dome, brim, btn)

# 5 shades: rounded rectangle lenses with a gold frame
lensm = principled('Lens', '#07060C', 0.35, metal=0.0); framem = principled('Frame', '#FFC23A', 0.25, metal=1.0)
for sx in (-1, 1):
    l = obj_from(bpy.ops.mesh.primitive_cube_add, f'Lens{sx}', size=1, location=(sx * 0.155, surface_y(sx * 0.155, 0.81, 0.045), 0.81))
    l.scale = (0.2, 0.025, 0.15); l.rotation_euler = (0, 0, sx * -0.18)
    add_mod(l, 'BEVEL', width=0.045, segments=6); l.data.materials.append(lensm); apply_mods(l); smooth(l); look(5, l)
br5 = curve_tube('ShadeBridge', [(-0.06, surface_y(0.06, 0.85, 0.06), 0.85), (0, surface_y(0, 0.86, 0.07), 0.865), (0.06, surface_y(0.06, 0.85, 0.06), 0.85)], 0.012, framem)
look(5, br5)
for sx in (-1, 1):
    look(5, curve_tube(f'Temple{sx}', [(sx * 0.25, surface_y(0.25, 0.83, 0.03), 0.83), (sx * 0.37, -0.15, 0.83), (sx * 0.4, 0.05, 0.82)], 0.01, framem))

# 6 mooch: a curled handlebar moustache
moom = principled('Mooch', '#1A1020', 0.55)
for sx in (-1, 1):
    pts = [(0, surface_y(0, 0.665, 0.02), 0.665), (sx * 0.06, surface_y(0.06, 0.67, 0.03), 0.665), (sx * 0.13, surface_y(0.13, 0.66, 0.03), 0.645), (sx * 0.18, surface_y(0.18, 0.67, 0.03), 0.68), (sx * 0.17, surface_y(0.17, 0.71, 0.04), 0.715), (sx * 0.14, surface_y(0.14, 0.7, 0.045), 0.7)]
    look(6, curve_tube(f'Mooch{sx}', pts, 0.03, moom, taper=[1.0, 1.0, 0.8, 0.5, 0.3, 0.15]))

# 7 bindi and jhumka earrings
bindi = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, 'Bindi', radius=0.028, location=(0, surface_y(0, 0.98, -0.005), 0.98)); bindi.scale = (1, 0.4, 1); bindi.data.materials.append(principled('BindiRed', '#E8177D', 0.2, coat=1.0)); look(7, bindi)
pearl = principled('Pearl', '#FFF8F0', 0.15, coat=1.0)
for sx in (-1, 1):
    bell = lathe(f'Jhumka{sx}', [(0.004, 0.0), (0.05, 0.005), (0.055, 0.02), (0.035, 0.05), (0.012, 0.075), (0.004, 0.09)], 24)
    bell.location = (sx * 0.43, -0.05, 0.53); bell.data.materials.append(gold); add_mod(bell, 'SUBSURF', levels=1); apply_mods(bell); smooth(bell)
    hook = obj_from(bpy.ops.mesh.primitive_torus_add, f'Hook{sx}', major_radius=0.02, minor_radius=0.006, location=(sx * 0.43, -0.05, 0.64), rotation=(0, math.pi / 2, 0)); hook.data.materials.append(gold)
    look(7, bell, hook)
    for k in range(6):
        a = k / 6 * TAU; pe = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f'Pearl{sx}{k}', radius=0.011, segments=10, ring_count=6, location=(sx * 0.43 + math.cos(a) * 0.05, -0.05 + math.sin(a) * 0.05, 0.525)); pe.data.materials.append(pearl); look(7, pe)

# 8 headphones
hp_band = principled('HPBand', '#1A1020', 0.35); hp_cup = principled('HPCup', '#14C4B4', 0.3, coat=0.8); hp_cush = principled('HPCushion', '#2A2A33', 0.8)
band_pts = [(math.cos(a) * 0.46, 0.02, 0.76 + math.sin(a) * 0.43) for a in [math.pi * (i / 16) for i in range(17)]]
look(8, curve_tube('HPBand', band_pts, 0.028, hp_band))
for sx in (-1, 1):
    cup = obj_from(bpy.ops.mesh.primitive_cylinder_add, f'HPCup{sx}', radius=0.12, depth=0.08, vertices=40, location=(sx * 0.47, 0.02, 0.72), rotation=(0, math.pi / 2, 0))
    add_mod(cup, 'BEVEL', width=0.02, segments=4); cup.data.materials.append(hp_cup); apply_mods(cup); smooth(cup, math.radians(40))
    cu = obj_from(bpy.ops.mesh.primitive_torus_add, f'HPCush{sx}', major_radius=0.095, minor_radius=0.03, location=(sx * 0.43, 0.02, 0.72), rotation=(0, math.pi / 2, 0)); cu.data.materials.append(hp_cush); smooth(cu)
    look(8, cup, cu)

# 9 chashma: round wire spectacles
specm = principled('Specs', '#3A2412', 0.3, metal=0.6); glassm = principled('Glass', '#DDEEFF', 0.02, alpha=0.25)
for sx in (-1, 1):
    x = sx * 0.152; y = surface_y(x, 0.8, 0.07)
    rim = obj_from(bpy.ops.mesh.primitive_torus_add, f'Rim{sx}', major_radius=0.135, minor_radius=0.012, major_segments=48, location=(x, y, 0.8), rotation=(math.pi / 2, 0, sx * -0.15)); rim.data.materials.append(specm); smooth(rim)
    gl = obj_from(bpy.ops.mesh.primitive_cylinder_add, f'SpecGlass{sx}', radius=0.13, depth=0.006, vertices=40, location=(x, y, 0.8), rotation=(math.pi / 2, 0, sx * -0.15)); gl.data.materials.append(glassm)
    look(9, rim, gl, curve_tube(f'SpecTemple{sx}', [(sx * 0.28, y + 0.03, 0.81), (sx * 0.38, -0.12, 0.82), (sx * 0.41, 0.06, 0.8)], 0.009, specm))
look(9, curve_tube('SpecBridge', [(-0.03, surface_y(0.03, 0.82, 0.08), 0.82), (0, surface_y(0, 0.84, 0.085), 0.84), (0.03, surface_y(0.03, 0.82, 0.08), 0.82)], 0.01, specm))

# extras for menu art: chupa rustam mask and a mini mukut
maskm = principled('Mask', '#2A0F4A', 0.4, coat=0.7)
mask = obj_from(bpy.ops.mesh.primitive_cube_add, 'Extra_Mask', size=1, location=(0, surface_y(0, 0.82, 0.04), 0.82)); mask.scale = (0.58, 0.05, 0.2)
add_mod(mask, 'BEVEL', width=0.07, segments=6); add_mod(mask, 'SIMPLE_DEFORM', deform_method='BEND', angle=math.radians(-80), deform_axis='Z'); mask.data.materials.append(maskm); apply_mods(mask); smooth(mask)
crown = lathe('Extra_Crown', [(0.17, 0.0), (0.2, 0.02), (0.205, 0.09), (0.17, 0.1), (0.16, 0.02)], 48); crown.location = (0, 0, 1.08); crown.data.materials.append(gold); smooth(crown)
spikes = []
for k in range(8):
    a = k / 8 * TAU
    sp_ = obj_from(bpy.ops.mesh.primitive_cone_add, f'Spike{k}', radius1=0.04, depth=0.12, vertices=12, location=(math.cos(a) * 0.19, math.sin(a) * 0.19, 1.22)); sp_.data.materials.append(gold); spikes.append(sp_)
    gem = obj_from(bpy.ops.mesh.primitive_ico_sphere_add, f'Gem{k}', radius=0.025, subdivisions=1, location=(math.cos(a) * 0.205, math.sin(a) * 0.205, 1.13)); gem.data.materials.append(ruby if k % 2 else principled('Emerald', '#14C48A', 0.05, coat=1.0)); spikes.append(gem)
select_only(crown, *spikes); bpy.ops.object.join(); crown = bpy.context.object; crown.name = 'Extra_Crown'

# ---------------------------------------------------------------- merge parts so each character is a handful of draw calls
def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in objs:
        if o.type != 'MESH':
            select_only(o); bpy.ops.object.convert(target='MESH')
        if o.modifiers: apply_mods(o)
    select_only(*objs); bpy.ops.object.join(); o = bpy.context.object; o.name = name; return o
face = [join(face, 'Face')]
looks = {i: [join(objs, f'Look{i}')] for i, objs in looks.items()}
shoes = [join(shoes[0:2], 'Shoe.R'), join(shoes[2:4], 'Shoe.L')]

# ---------------------------------------------------------------- bake body detail
print('baking body maps')
# AO uses the arms and shoes, so bake with everything present
scene.cycles.samples = 64
nrm = bake(body, 'NORMAL', os.path.join(TEX, 'bean_normal.png'), 2048, 16, color_space='Non-Color')
ao = bake(body, 'AO', os.path.join(TEX, 'bean_ao.png'), 2048, 96)
from PIL import Image, ImageFilter
aoi = Image.open(os.path.join(TEX, 'bean_ao.png')).convert('L').filter(ImageFilter.GaussianBlur(1.2))
alb = aoi.point(lambda v: int(255 * (0.62 + 0.38 * (v / 255) ** 0.8)))
Image.merge('RGB', (alb, alb, alb)).save(os.path.join(TEX, 'bean_albedo.jpg'), quality=92)
Image.open(os.path.join(TEX, 'bean_normal.png')).save(os.path.join(TEX, 'bean_normal.png'), optimize=True)
alb_img = bpy.data.images.load(os.path.join(TEX, 'bean_albedo.jpg')); nrm_img = bpy.data.images.load(os.path.join(TEX, 'bean_normal.png'))
body.data.materials.clear()
body.data.materials.append(baked_material('Body', color_img=alb_img, normal_img=nrm_img, rough=0.48))
armskin = baked_material('ArmSkin', rough=0.48)
for a in arms: a.data.materials.clear(); a.data.materials.append(armskin)

# ---------------------------------------------------------------- rig
bpy.ops.object.armature_add(location=(0, 0, 0)); arm = bpy.context.object; arm.name = 'Rig'
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones; eb.remove(eb[0])
def bone(name, head, tail, parent=None):
    b_ = eb.new(name); b_.head = head; b_.tail = tail
    if parent: b_.parent = eb[parent]
    return b_
bone('Root', (0, 0, 0), (0, 0, 0.2))
bone('Body', (0, 0, 0.05), (0, 0, 0.55), 'Root')
bone('Upper', (0, 0, 0.55), (0, 0, 1.16), 'Body')
bone('Arm.L', (0.42, 0, 0.62), (0.5, 0, 0.33), 'Upper')
bone('Arm.R', (-0.42, 0, 0.62), (-0.5, 0, 0.33), 'Upper')
bone('Foot.L', (0.18, 0.06, 0.07), (0.18, -0.16, 0.07), 'Root')
bone('Foot.R', (-0.18, 0.06, 0.07), (-0.18, -0.16, 0.07), 'Root')
for b_ in eb: b_.roll = 0
bpy.ops.object.mode_set(mode='OBJECT')

# skin the body with a smooth Body/Upper split
gb = body.vertex_groups.new(name='Body'); gu = body.vertex_groups.new(name='Upper')
for v in body.data.vertices:
    z = v.co.z; w = min(1, max(0, (z - 0.3) / 0.45)); w = w * w * (3 - 2 * w)
    gb.add([v.index], 1 - w, 'REPLACE'); gu.add([v.index], w, 'REPLACE')
body.parent = arm; md = body.modifiers.new('Armature', 'ARMATURE'); md.object = arm

def parent_to_bone(o, bname):
    mw = o.matrix_world.copy()
    o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bname
    o.matrix_world = mw
for o in face + [mouth]: parent_to_bone(o, 'Upper')
for i, o in enumerate(arms): parent_to_bone(o, 'Arm.R' if i == 0 else 'Arm.L')
for i, o in enumerate(shoes): parent_to_bone(o, 'Foot.R' if i == 0 else 'Foot.L')
for i, objs in looks.items():
    for o in objs:
        parent_to_bone(o, 'Upper')
for o in (mask, crown): parent_to_bone(o, 'Upper')

# ---------------------------------------------------------------- animations
pb = arm.pose.bones
for p in pb: p.rotation_mode = 'XYZ'
def clear_pose():
    for p in pb: p.location = (0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)
def K(f, name, loc=None, rot=None, scl=None):
    p = pb[name]
    if loc is not None: p.location = loc; p.keyframe_insert('location', frame=f)
    if rot is not None: p.rotation_euler = [math.radians(a) for a in rot]; p.keyframe_insert('rotation_euler', frame=f)
    if scl is not None: p.scale = scl; p.keyframe_insert('scale', frame=f)
def squash(s): return (1 + s * 0.5, 1 - s, 1 + s * 0.5)
# arm rotation helpers in bone space, verified below: X swings forward and back, Z raises the arm sideways
def arms_rest(f): K(f, 'Arm.L', rot=(0, 0, 0)); K(f, 'Arm.R', rot=(0, 0, 0))
def action(name, frames, build, loop=True):
    clear_pose()
    arm.animation_data_create()
    act = bpy.data.actions.new(name); arm.animation_data.action = act
    build()
    for fc in act.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
        if loop:
            m_ = fc.modifiers.new('CYCLES')
    act.frame_range = (0, frames); act.use_frame_range = True; act.use_fake_user = True
    track = arm.animation_data.nla_tracks.new(); track.name = name; track.strips.new(name, 0, act); track.mute = True
    arm.animation_data.action = None
    return act

def idle():
    for f, s, r in [(0, 0.0, 0), (24, -0.03, 2), (48, 0.0, 0)]:
        K(f, 'Body', scl=squash(s)); K(f, 'Upper', rot=(0, r, 0)); K(f, 'Arm.L', rot=(r * 3, 0, -4)); K(f, 'Arm.R', rot=(-r * 3, 0, 4))
def run():
    for f in (0, 8, 16):
        ph = f / 16 * TAU
        K(f, 'Root', loc=(0, 0.0, 0)); K(f, 'Upper', rot=(14, math.sin(ph) * 6, 0))
        K(f, 'Arm.L', rot=(math.cos(ph) * 60, 0, -8)); K(f, 'Arm.R', rot=(-math.cos(ph) * 60, 0, 8))
        K(f, 'Foot.L', loc=(0, math.cos(ph) * 0.15, 0)); K(f, 'Foot.R', loc=(0, -math.cos(ph) * 0.15, 0))
    for f in (4, 12):
        ph = f / 16 * TAU
        K(f, 'Root', loc=(0, 0.045, 0)); K(f, 'Upper', rot=(14, math.sin(ph) * 6, 0))
        K(f, 'Foot.L', loc=(0, math.cos(ph) * 0.15, 0.06 if f == 12 else 0)); K(f, 'Foot.R', loc=(0, -math.cos(ph) * 0.15, 0.06 if f == 4 else 0))
        K(f, 'Arm.L', rot=(math.cos(ph) * 60, 0, -8)); K(f, 'Arm.R', rot=(-math.cos(ph) * 60, 0, 8))
def jump():
    K(0, 'Body', scl=squash(0.22)); K(0, 'Arm.L', rot=(0, 0, -20)); K(0, 'Arm.R', rot=(0, 0, 20))
    K(4, 'Body', scl=squash(-0.2)); K(4, 'Arm.L', rot=(-20, 0, -150)); K(4, 'Arm.R', rot=(-20, 0, 150)); K(4, 'Foot.L', loc=(0, -0.05, 0.05)); K(4, 'Foot.R', loc=(0, 0.05, 0.08))
    K(12, 'Body', scl=squash(0)); K(12, 'Arm.L', rot=(-10, 0, -130)); K(12, 'Arm.R', rot=(-10, 0, 130))
def air():
    for f, a in [(0, 0), (10, 1), (20, 0)]:
        K(f, 'Arm.L', rot=(-10, 0, -120 - a * 30)); K(f, 'Arm.R', rot=(-10, 0, 120 + a * 30))
        K(f, 'Foot.L', loc=(0, 0.05 - a * 0.1, 0.04)); K(f, 'Foot.R', loc=(0, -0.05 + a * 0.1, 0.04)); K(f, 'Upper', rot=(-6, 0, 0))
def flail():
    for f, a in [(0, 1), (4, -1), (8, 1), (12, -1), (16, 1)]:
        K(f, 'Arm.L', rot=(a * 70, 0, -100 + a * 30)); K(f, 'Arm.R', rot=(-a * 70, 0, 100 + a * 30)); K(f, 'Upper', rot=(-12, a * 14, 0))
        K(f, 'Foot.L', loc=(0, a * 0.1, 0.06)); K(f, 'Foot.R', loc=(0, -a * 0.1, 0.06))
def dive():
    K(0, 'Upper', rot=(0, 0, 0)); K(0, 'Body', rot=(0, 0, 0))
    K(3, 'Upper', rot=(50, 0, 0)); K(3, 'Body', rot=(18, 0, 0)); K(3, 'Arm.L', rot=(-100, 0, -15)); K(3, 'Arm.R', rot=(-100, 0, 15)); K(3, 'Foot.L', loc=(0, 0.14, 0.05)); K(3, 'Foot.R', loc=(0, 0.1, 0.08))
    K(12, 'Upper', rot=(40, 0, 0)); K(12, 'Body', rot=(14, 0, 0)); K(12, 'Arm.L', rot=(-90, 0, -20)); K(12, 'Arm.R', rot=(-90, 0, 20))
def stun():
    for f, a in [(0, 1), (12, -1), (24, 1)]:
        K(f, 'Upper', rot=(-8, a * 16, a * 10)); K(f, 'Body', rot=(0, -a * 6, 0)); K(f, 'Arm.L', rot=(a * 25, 0, -15)); K(f, 'Arm.R', rot=(-a * 25, 0, 15))
def tumble():
    for f in range(0, 21, 5):
        K(f, 'Root', rot=(-f / 20 * 360, 0, 0), loc=(0, 0.5, 0))
        a = 1 if (f // 5) % 2 else -1
        K(f, 'Arm.L', rot=(a * 60, 0, -110)); K(f, 'Arm.R', rot=(-a * 60, 0, 110))
def slip():
    K(0, 'Root', rot=(0, 0, 0)); K(0, 'Upper', rot=(0, 0, 0))
    K(9, 'Root', rot=(0, 200, 0)); K(9, 'Upper', rot=(-35, 0, 0)); K(9, 'Arm.L', rot=(40, 0, -120)); K(9, 'Arm.R', rot=(40, 0, 120)); K(9, 'Foot.L', loc=(0, 0.2, 0.15)); K(9, 'Foot.R', loc=(0, 0.25, 0.12))
    K(27, 'Root', rot=(0, 360, 0)); K(27, 'Upper', rot=(-10, 0, 0)); K(27, 'Arm.L', rot=(0, 0, -20)); K(27, 'Arm.R', rot=(0, 0, 20)); K(27, 'Foot.L', loc=(0, 0, 0)); K(27, 'Foot.R', loc=(0, 0, 0))
def land():
    K(0, 'Body', scl=squash(0.3)); K(0, 'Arm.L', rot=(0, 0, -50)); K(0, 'Arm.R', rot=(0, 0, 50))
    K(3, 'Body', scl=squash(-0.08)); K(8, 'Body', scl=squash(0)); K(8, 'Arm.L', rot=(0, 0, 0)); K(8, 'Arm.R', rot=(0, 0, 0))
def celebrate():
    for f, h in [(0, 0), (6, 0.22), (12, 0), (18, 0.22), (24, 0)]:
        K(f, 'Root', loc=(0, h, 0)); K(f, 'Body', scl=squash(0.15 if h == 0 else -0.1))
        w = 20 if f % 12 == 0 else -20
        K(f, 'Arm.L', rot=(0, 0, -150 + w)); K(f, 'Arm.R', rot=(0, 0, 150 - w))
def dance():
    for f, a in [(0, -1), (10, 0), (20, 1), (30, 0), (40, -1)]:
        K(f, 'Body', rot=(0, 0, a * 12)); K(f, 'Upper', rot=(0, 0, -a * 8)); K(f, 'Root', loc=(a * 0.06, abs(a) * 0.0 + (0.05 if a == 0 else 0), 0))
        K(f, 'Arm.L', rot=(0, 0, -150 if a > 0 else -40)); K(f, 'Arm.R', rot=(0, 0, 150 if a < 0 else 40))
def wave():
    K(0, 'Arm.R', rot=(0, 0, 0)); K(6, 'Arm.R', rot=(0, 0, 150))
    for f, a in [(10, 1), (15, -1), (20, 1), (25, -1)]: K(f, 'Arm.R', rot=(0, a * 20, 150 + a * 10))
    K(30, 'Arm.R', rot=(0, 0, 0)); K(0, 'Upper', rot=(0, 0, 0)); K(15, 'Upper', rot=(0, 0, -8)); K(30, 'Upper', rot=(0, 0, 0))

ACTIONS = [('Idle', 48, idle, True), ('Run', 16, run, True), ('Jump', 12, jump, False), ('Air', 20, air, True), ('Flail', 16, flail, True),
           ('Dive', 12, dive, False), ('Stun', 24, stun, True), ('Tumble', 20, tumble, True), ('Slip', 27, slip, False), ('Land', 8, land, False),
           ('Celebrate', 24, celebrate, True), ('Dance', 40, dance, True), ('Wave', 30, wave, False)]
for name, frames, fn, loop in ACTIONS: action(name, frames, fn, loop)

# verify arm axes: Z rotation must raise the left arm outward (tail moves up), X rotation must swing it forward (−Y)
clear_pose(); bpy.context.view_layer.update()
t0 = (arm.matrix_world @ pb['Arm.L'].tail).copy()
pb['Arm.L'].rotation_euler = (0, 0, math.radians(-90)); bpy.context.view_layer.update(); t1 = (arm.matrix_world @ pb['Arm.L'].tail).copy()
pb['Arm.L'].rotation_euler = (math.radians(-60), 0, 0); bpy.context.view_layer.update(); t2 = (arm.matrix_world @ pb['Arm.L'].tail).copy()
open(os.path.join(QA, 'armcheck.txt'), 'w').write('raise dz=%.3f swing dy=%.3f' % (t1.z - t0.z, t2.y - t0.y))
clear_pose()

# ---------------------------------------------------------------- export
allobjs = [arm, body, mouth] + face + arms + shoes + [o for v in looks.values() for o in v] + [mask, crown]
export_glb(os.path.join(OUT, 'bean.glb'), allobjs, animations=True)
print('EXPORTED', os.path.getsize(os.path.join(OUT, 'bean.glb')))

# ---------------------------------------------------------------- portraits rendered from this scene (same rig, same actions)
MODE = os.environ.get('DM_PORTRAITS', 'qa')
COLORS = [('#FF4B4B', '#C42828'), ('#FFC21A', '#D38E00'), ('#6BD13B', '#3E9A1E'), ('#14C4B4', '#078F84'), ('#3D8BFF', '#1F5BC9'),
          ('#9B5CFF', '#6A30D0'), ('#FF62B9', '#CC3287'), ('#C08452', '#8A5428'), ('#F6F2EA', '#BDB5A6'), ('#4A4A63', '#25253A')]
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'; scene.view_settings.exposure = 0.0
tints = {}
for mname in ('Body', 'ArmSkin', 'Shoe'):
    m = bpy.data.materials[mname]; b_ = bsdf(m)
    rgb = node(m, 'ShaderNodeRGB', (-500, 500)); mix = node(m, 'ShaderNodeMix', (-250, 400)); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
    src = b_.inputs['Base Color'].links[0].from_socket if b_.inputs['Base Color'].links else None
    if src: link(m, src, mix.inputs['A'])
    else: mix.inputs['A'].default_value = (1, 1, 1, 1)
    link(m, rgb.outputs['Color'], mix.inputs['B']); link(m, mix.outputs['Result'], b_.inputs['Base Color'])
    b_.inputs['Coat Weight'].default_value = 0.3; b_.inputs['Coat Roughness'].default_value = 0.25
    tints[mname] = rgb
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = hex_rgba('#D8ECFF'); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
area_light((-1.6, -2.2, 2.4), (0, 0, 0.6), 2.2, 330, '#FFF1DE'); area_light((2.0, 1.4, 1.8), (0, 0, 0.7), 1.2, 240, '#BFD9FF'); area_light((1.8, -2.4, 0.6), (0, 0, 0.5), 2.5, 80, '#FFE6F0')
arm.rotation_euler = (0, 0, math.radians(-18))
camera((0.0, -3.4, 1.12), (0, 0, 0.6), lens=60)
def colorize(i):
    f_, d_ = COLORS[i]; tints['Body'].outputs[0].default_value = hex_rgba(f_); tints['ArmSkin'].outputs[0].default_value = hex_rgba(f_); tints['Shoe'].outputs[0].default_value = hex_rgba(d_)
def show_look(l, extras=()):
    for i_, objs in looks.items():
        for o in objs: o.hide_render = i_ != l
    mask.hide_render = 'mask' not in extras; crown.hide_render = 'crown' not in extras
def pose(name, frame):
    arm.animation_data.action = bpy.data.actions[name]; scene.frame_set(frame)
from PIL import Image as PImage
PORT = os.path.join(ROOT, 'android/assets/web/assets/ui/portraits'); os.makedirs(PORT, exist_ok=True)
if MODE == 'qa':
    shots = [(0, 0, 'Idle', 0), (1, 1, 'Run', 4), (2, 2, 'Jump', 4), (3, 3, 'Dive', 4), (4, 4, 'Stun', 6), (5, 5, 'Celebrate', 6), (6, 6, 'Dance', 20), (7, 7, 'Wave', 12), (8, 8, 'Air', 5), (9, 9, 'Flail', 4)]
    sheet = PImage.new('RGBA', (360 * 5, 720), (200, 226, 255, 255))
    for k, (c_, l_, a_, f_) in enumerate(shots):
        colorize(c_); show_look(l_); pose(a_, f_); p_ = os.path.join(QA, 'qa.png'); render(p_, 360, 360, 40)
        sheet.alpha_composite(PImage.open(p_), ((k % 5) * 360, (k // 5) * 360))
    sheet.save(os.path.join(QA, 'bean_sheet.png'))
else:
    pose('Idle', 0)
    for c_ in range(10):
        colorize(c_)
        for l_ in range(10):
            show_look(l_); p_ = os.path.join(QA, 'p.png'); render(p_, 512, 512, 56)
            PImage.open(p_).save(os.path.join(PORT, f'p{c_}_{l_}.webp'), 'WEBP', quality=90, method=6)
    print('PORTRAITS DONE')
os._exit(0)
