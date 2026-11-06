"""Dhakka Mukki props: modelled in Blender with procedural materials, baked to PBR textures, exported as GLB.
Conventions (so the engine can scale them to physics sizes): see each builder's docstring.
Run: python3.11 assets-src/blender/props.py -- <repo_root> <qa_dir> [names...]"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from common import *

args = sys.argv[sys.argv.index('--') + 1:]
ROOT, QA, ONLY = args[0], args[1], set(args[2:])
OUT = os.path.join(ROOT, 'android/assets/web/assets/models'); os.makedirs(OUT, exist_ok=True)
BK = os.path.join(QA, 'bake'); os.makedirs(BK, exist_ok=True)
random.seed(7)

# ------------------------------------------------------------ procedural materials
def proc(name, kind, c1, c2='#000000', rough=0.55, scale=8.0, bump=0.4, metal=0.0, extra=None):
    m = principled(name, c1, rough, metal); b = bsdf(m); nt = m.node_tree
    tc = node(m, 'ShaderNodeTexCoord', (-1400, 0))
    mp = node(m, 'ShaderNodeMapping', (-1200, 0)); link(m, tc.outputs['Object'], mp.inputs['Vector']); mp.inputs['Scale'].default_value = (scale, scale, scale)
    ramp = node(m, 'ShaderNodeValToRGB', (-500, 300))
    ramp.color_ramp.elements[0].color = hex_rgba(c1); ramp.color_ramp.elements[1].color = hex_rgba(c2)
    height = None
    if kind == 'wood':
        wv = node(m, 'ShaderNodeTexWave', (-900, 300)); wv.wave_type = 'RINGS'; wv.rings_direction = 'Y'
        wv.inputs['Scale'].default_value = 2.5; wv.inputs['Distortion'].default_value = 6; wv.inputs['Detail'].default_value = 3
        link(m, mp.outputs['Vector'], wv.inputs['Vector']); link(m, wv.outputs['Fac'], ramp.inputs['Fac']); height = wv.outputs['Fac']
    elif kind in ('clay', 'rock', 'grass', 'leather', 'paint', 'foam', 'cloud'):
        ns = node(m, 'ShaderNodeTexNoise', (-900, 300)); ns.inputs['Scale'].default_value = {'clay': 6, 'rock': 3, 'grass': 14, 'leather': 18, 'paint': 4, 'foam': 2, 'cloud': 2}[kind]
        ns.inputs['Detail'].default_value = 8 if kind in ('rock', 'clay') else 4; ns.inputs['Roughness'].default_value = 0.6
        link(m, mp.outputs['Vector'], ns.inputs['Vector']); link(m, ns.outputs['Fac'], ramp.inputs['Fac'])
        ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[1].position = 0.7
        vo = node(m, 'ShaderNodeTexVoronoi', (-900, 0)); vo.inputs['Scale'].default_value = {'clay': 40, 'rock': 6, 'grass': 60, 'leather': 90, 'paint': 30, 'foam': 10, 'cloud': 3}[kind]
        link(m, mp.outputs['Vector'], vo.inputs['Vector'])
        mx = node(m, 'ShaderNodeMath', (-700, 0), operation='MULTIPLY_ADD'); mx.inputs[1].default_value = 0.6
        link(m, ns.outputs['Fac'], mx.inputs[0]); link(m, vo.outputs['Distance'], mx.inputs[2]); height = mx.outputs[0]
    elif kind == 'metal':
        ns = node(m, 'ShaderNodeTexNoise', (-900, 300)); ns.inputs['Scale'].default_value = 60; ns.inputs['Detail'].default_value = 2
        mp.inputs['Scale'].default_value = (scale * 30, scale * 0.4, scale * 30)
        link(m, mp.outputs['Vector'], ns.inputs['Vector']); link(m, ns.outputs['Fac'], ramp.inputs['Fac']); height = ns.outputs['Fac']
        ramp.color_ramp.elements[0].position = 0.4; ramp.color_ramp.elements[1].position = 0.6
    if extra == 'stripes':
        wv = node(m, 'ShaderNodeTexWave', (-900, 600)); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'
        wv.inputs['Scale'].default_value = 1.2; link(m, tc.outputs['Object'], wv.inputs['Vector'])
        ramp2 = node(m, 'ShaderNodeValToRGB', (-500, 600)); ramp2.color_ramp.interpolation = 'CONSTANT'
        ramp2.color_ramp.elements[0].color = hex_rgba(c1); ramp2.color_ramp.elements[1].color = hex_rgba(c2); ramp2.color_ramp.elements[1].position = 0.5
        link(m, wv.outputs['Fac'], ramp2.inputs['Fac']); link(m, ramp2.outputs['Color'], b.inputs['Base Color'])
    else:
        link(m, ramp.outputs['Color'], b.inputs['Base Color'])
    if height is not None and bump:
        bp = node(m, 'ShaderNodeBump', (-200, -300)); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.02
        link(m, height, bp.inputs['Height']); link(m, bp.outputs['Normal'], b.inputs['Normal'])
    return m

def flat(name, c, rough=0.5, metal=0.0, emit=None, es=1.0):
    return principled(name, c, rough, metal, emit=emit, emit_strength=es)

def mesh_obj(name, verts, faces):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); return o

def P(fn, name, mat=None, **kw):
    fn(**kw); o = bpy.context.object; o.name = name
    if mat: o.data.materials.append(mat)
    return o

def tube(name, pts, r, mat, taper=None, cyclic=False, res=10):
    cd = bpy.data.curves.new(name, 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 4; cd.resolution_u = res
    sp = cd.splines.new('NURBS'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    sp.use_cyclic_u = cyclic; sp.use_endpoint_u = not cyclic; sp.order_u = 4
    if taper:
        for i, w in enumerate(taper): sp.points[i].radius = w
    o = bpy.data.objects.new(name, cd); bpy.context.collection.objects.link(o); cd.materials.append(mat)
    select_only(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object; smooth(o); return o

def finish(name, objs, size=1024, metal=0.0, rough_bake=True, keep_mats=None):
    """join, unwrap, bake albedo + roughness + normal from the procedural materials, export GLB."""
    objs = [o for o in objs if o]
    for o in objs:
        if o.modifiers: apply_mods(o)
    select_only(*objs); bpy.ops.object.join(); ob = bpy.context.object; ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    smart_uv(ob, 0.006, 60)
    s = bpy.context.scene
    alb = bake(ob, 'DIFFUSE', os.path.join(BK, f'{name}_albedo.jpg'), size, 1, pass_filter={'COLOR'})
    rgh = bake(ob, 'ROUGHNESS', os.path.join(BK, f'{name}_rough.jpg'), size, 1, color_space='Non-Color') if rough_bake else None
    nrm = bake(ob, 'NORMAL', os.path.join(BK, f'{name}_normal.png'), size, 4, color_space='Non-Color')
    glow = any(bsdf(m).inputs['Emission Strength'].default_value > 0 and sum(bsdf(m).inputs['Emission Color'].default_value[:3]) > 0.01 for m in ob.data.materials)
    emi = bake(ob, 'EMIT', os.path.join(BK, f'{name}_emit.jpg'), size // 2, 1) if glow else None
    ob.data.materials.clear()
    bm_ = baked_material(name, color_img=alb, normal_img=nrm, rough_img=rgh, metal=metal)
    if emi:  # flames, bulbs and burners keep their glow through an emissive map
        b_ = bsdf(bm_); t_ = node(bm_, 'ShaderNodeTexImage', (-600, -600)); t_.image = emi
        link(bm_, t_.outputs['Color'], b_.inputs['Emission Color']); b_.inputs['Emission Strength'].default_value = 2.0
    ob.data.materials.append(bm_)
    export_glb(os.path.join(OUT, f'{name}.glb'), [ob])
    print('PROP', name, os.path.getsize(os.path.join(OUT, f'{name}.glb')))
    return ob

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def want(n): return not ONLY or n in ONLY

# ------------------------------------------------------------ builders
def kulhad():
    """clay chai cup bumper. rim radius 1, height 1.5, origin at the base centre"""
    clay = proc('Clay', 'clay', '#C8643A', '#9E4524', 0.85, 3, 0.6)
    pts = [(0.01, 0.0), (0.62, 0.0), (0.66, 0.04), (0.72, 0.3), (0.86, 0.9), (0.98, 1.38), (1.04, 1.47), (1.02, 1.52), (0.93, 1.5), (0.88, 1.3), (0.01, 1.3)]
    cup = lathe('Cup', [(r, z) for r, z in pts], 64); cup.data.materials.append(clay)
    add_mod(cup, 'SUBSURF', levels=2); smooth(cup)
    for i in range(5):   # potter's ridges
        z = 0.35 + i * 0.2; r = 0.74 + (z - 0.3) * 0.24
        rg = P(bpy.ops.mesh.primitive_torus_add, f'Ridge{i}', clay, major_radius=r, minor_radius=0.012, location=(0, 0, z), major_segments=64)
    chai = P(bpy.ops.mesh.primitive_cylinder_add, 'Chai', proc('Chai', 'paint', '#B8784A', '#D9A77A', 0.25, 3, 0.15), radius=0.9, depth=0.04, location=(0, 0, 1.31), vertices=64)
    foam = []
    for i in range(14):
        a = random.random() * TAU; r = random.random() * 0.7
        f = P(bpy.ops.mesh.primitive_uv_sphere_add, f'Foam{i}', flat('Foam', '#E9C9A2', 0.7), radius=0.05 + random.random() * 0.05, location=(math.cos(a) * r, math.sin(a) * r, 1.33), segments=12, ring_count=6)
        f.scale = (1, 1, 0.35); foam.append(f)
    return finish('kulhad', [cup, chai] + foam + [bpy.data.objects[f'Ridge{i}'] for i in range(5)], 1024)

def dhol():
    """dhol drum bumper standing upright. radius 1, height 1.5, origin at base centre"""
    fab = proc('DholFabric', 'paint', '#D61F3C', '#FFD84A', 0.55, 1, 0.1, extra='stripes')
    leather = proc('Leather', 'leather', '#F3E3C0', '#D8C08F', 0.6, 2, 0.4)
    rope = proc('Rope', 'leather', '#FFF1D0', '#E0C890', 0.8, 30, 0.6)
    brass = flat('Brass', '#E0A83A', 0.25, 1.0)
    pts = [(0.94, 0.06), (1.0, 0.3), (1.04, 0.75), (1.0, 1.2), (0.94, 1.44)]
    body = lathe('Barrel', pts, 64); body.data.materials.append(fab); add_mod(body, 'SUBSURF', levels=1); smooth(body)
    parts = [body]
    for z in (0.04, 1.46):
        h = P(bpy.ops.mesh.primitive_cylinder_add, f'Head{z}', leather, radius=0.97, depth=0.06, location=(0, 0, z), vertices=64); add_mod(h, 'BEVEL', width=0.02, segments=3); parts.append(h)
        rg = P(bpy.ops.mesh.primitive_torus_add, f'Hoop{z}', brass, major_radius=0.98, minor_radius=0.045, location=(0, 0, z), major_segments=64); parts.append(rg)
    zig = []
    for i in range(33):
        a = i / 32 * TAU; z = 0.12 if i % 2 == 0 else 1.38; r = 1.0 + 0.04 * math.sin(math.pi * (z - 0.06) / 1.38)
        zig.append((math.cos(a) * (r + 0.03), math.sin(a) * (r + 0.03), z))
    parts.append(tube('Lacing', zig, 0.018, rope, res=4))
    for i in range(16):
        a = i / 16 * TAU
        for z in (0.12, 1.38):
            parts.append(P(bpy.ops.mesh.primitive_uv_sphere_add, f'Knot{i}{z}', brass, radius=0.035, location=(math.cos(a) * 1.0, math.sin(a) * 1.0, z), segments=10, ring_count=6))
    return finish('dhol', parts, 1024)

def belan():
    """rolling pin spanning x -1..1 (centre at origin), barrel radius 0.1"""
    wood = proc('BelanWood', 'wood', '#E7B47A', '#C98A4B', 0.5, 2, 0.15)
    dark = proc('BelanHandle', 'wood', '#8A5A2B', '#5E3A18', 0.45, 3, 0.15)
    barrel = lathe('Barrel', [(0.06, -0.86), (0.095, -0.84), (0.1, -0.7), (0.1, 0.7), (0.095, 0.84), (0.06, 0.86)], 48)
    barrel.rotation_euler = (0, math.pi / 2, 0); barrel.data.materials.append(wood); add_mod(barrel, 'SUBSURF', levels=1); smooth(barrel)
    parts = [barrel]
    for sx in (-1, 1):
        hd = lathe(f'Handle{sx}', [(0.02, 0.0), (0.035, 0.02), (0.042, 0.06), (0.036, 0.12), (0.03, 0.15), (0.05, 0.17), (0.04, 0.2), (0.005, 0.205)], 32)
        hd.rotation_euler = (0, sx * math.pi / 2, 0); hd.location = (sx * 0.84, 0, 0); hd.data.materials.append(dark); add_mod(hd, 'SUBSURF', levels=1); smooth(hd); parts.append(hd)
    return finish('belan', parts, 1024)

def fan_blade():
    """ceiling fan blade from x=0.12 to x=1.0, width about 0.2, top at y=+0.02"""
    wood = proc('FanWood', 'wood', '#A46A3A', '#7A4A22', 0.45, 2, 0.12)
    steel = proc('FanSteel', 'metal', '#C9CED8', '#9AA3B5', 0.25, 1, 0.05, metal=1.0)
    bm = bmesh.new(); prof = []
    for i in range(21):
        u = i / 20; x = 0.28 + u * 0.72; w = 0.085 + 0.05 * math.sin(u * math.pi * 0.85) + 0.02 * u
        prof.append((x, w))
    top = [bm.verts.new((x, w, 0.012)) for x, w in prof] + [bm.verts.new((x, -w, 0.012)) for x, w in reversed(prof)]
    bot = [bm.verts.new((v.co.x, v.co.y, -0.012)) for v in top]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    n = len(top)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((top[i], top[j], bot[j], bot[i]))
    me = bpy.data.meshes.new('Blade'); bm.to_mesh(me); bm.free(); bl = bpy.data.objects.new('Blade', me); bpy.context.collection.objects.link(bl)
    bl.data.materials.append(wood); add_mod(bl, 'BEVEL', width=0.008, segments=3); add_mod(bl, 'SUBSURF', levels=1); smooth(bl)
    arm = P(bpy.ops.mesh.primitive_cube_add, 'Bracket', steel, size=1, location=(0.22, 0, 0.03)); arm.scale = (0.22, 0.05, 0.02); add_mod(arm, 'BEVEL', width=0.01, segments=3)
    screws = [P(bpy.ops.mesh.primitive_cylinder_add, f'Screw{k}', steel, radius=0.012, depth=0.02, location=(0.3 + k * 0.03, 0.02 * (1 if k % 2 else -1), 0.045), vertices=12) for k in range(2)]
    return finish('fan_blade', [bl, arm] + screws, 1024)

def fan_motor():
    """fan motor housing, radius 1, height 0.85, origin at base"""
    chrome = proc('Chrome', 'metal', '#E6EAF0', '#B9C0CC', 0.15, 1, 0.03, metal=1.0)
    pink = flat('MotorCap', '#E8177D', 0.35)
    body = lathe('Motor', [(0.01, 0.0), (0.88, 0.0), (1.0, 0.1), (1.0, 0.55), (0.92, 0.68), (0.55, 0.72), (0.01, 0.72)], 64)
    body.data.materials.append(chrome); add_mod(body, 'SUBSURF', levels=1); smooth(body)
    cap = P(bpy.ops.mesh.primitive_uv_sphere_add, 'Cap', pink, radius=0.55, location=(0, 0, 0.7), segments=48, ring_count=24)
    bpy.context.view_layer.objects.active = cap; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0.7), plane_no=(0, 0, 1), clear_inner=True, use_fill=True); bpy.ops.object.mode_set(mode='OBJECT'); smooth(cap)
    vents = [P(bpy.ops.mesh.primitive_torus_add, f'Vent{i}', flat('Vent', '#5C6578', 0.3, 0.8), major_radius=1.0, minor_radius=0.015, location=(0, 0, 0.2 + i * 0.1), major_segments=64) for i in range(3)]
    return finish('fan_motor', [body, cap] + vents, 1024, metal=0.6)

def fan_wall():
    """inner high paddle: box from x=0 to 1, height 1 (y up), thickness 0.2"""
    steel = proc('Paddle', 'metal', '#B9C2D2', '#8C96AA', 0.3, 1, 0.05, metal=0.8)
    stripe = flat('PaddleStripe', '#E8177D', 0.4)
    b_ = P(bpy.ops.mesh.primitive_cube_add, 'Wall', steel, size=1, location=(0.5, 0, 0.5)); b_.scale = (1, 0.2, 1); add_mod(b_, 'BEVEL', width=0.03, segments=3)
    s_ = P(bpy.ops.mesh.primitive_cube_add, 'Stripe', stripe, size=1, location=(0.5, 0, 0.75)); s_.scale = (0.96, 0.21, 0.12); add_mod(s_, 'BEVEL', width=0.01, segments=2)
    bolts = [P(bpy.ops.mesh.primitive_uv_sphere_add, f'Bolt{k}{sy}', flat('Bolt', '#5C6578', 0.3, 1.0), radius=0.025, location=(0.1 + k * 0.2, sy * 0.105, 0.35), segments=12, ring_count=6) for k in range(5) for sy in (-1, 1)]
    return finish('fan_wall', [b_, s_] + bolts, 1024, metal=0.6)

def thali():
    """steel thali platform. footprint x 0..1, y 0..1 (z up), top at z=0, thickness 0.14"""
    steel = proc('ThaliSteel', 'metal', '#EEF1F6', '#C2C9D4', 0.2, 1, 0.04, metal=1.0)
    bowls = proc('Katori', 'metal', '#E3E8EF', '#B5BDCA', 0.18, 1, 0.03, metal=1.0)
    base = P(bpy.ops.mesh.primitive_cube_add, 'Plate', steel, size=1, location=(0.5, 0.5, -0.07)); base.scale = (1, 1, 0.14)
    add_mod(base, 'BEVEL', width=0.18, segments=8, limit_method='ANGLE')
    rim = [P(bpy.ops.mesh.primitive_torus_add, f'Ring{i}', steel, major_radius=0.18 + i * 0.12, minor_radius=0.006, location=(0.5, 0.5, 0.0), major_segments=64) for i in range(3)]
    for r in rim: r.scale = (1, 1, 0.3)
    return finish('thali', [base] + rim, 1024, metal=1.0)

def crate():
    """wooden crate, unit cube centred on the origin"""
    wood = proc('CrateWood', 'wood', '#C8874E', '#9C6230', 0.75, 3, 0.25)
    iron = flat('CrateIron', '#3A3A44', 0.5, 0.8)
    parts = []
    for i in range(5):
        p = P(bpy.ops.mesh.primitive_cube_add, f'Plank{i}', wood, size=1, location=(0, -0.5, -0.4 + i * 0.2)); p.scale = (0.98, 0.04, 0.18); add_mod(p, 'BEVEL', width=0.01, segments=2); parts.append(p)
        q = P(bpy.ops.mesh.primitive_cube_add, f'PlankB{i}', wood, size=1, location=(0, 0.5, -0.4 + i * 0.2)); q.scale = (0.98, 0.04, 0.18); add_mod(q, 'BEVEL', width=0.01, segments=2); parts.append(q)
        r = P(bpy.ops.mesh.primitive_cube_add, f'PlankL{i}', wood, size=1, location=(-0.5, 0, -0.4 + i * 0.2)); r.scale = (0.04, 0.98, 0.18); add_mod(r, 'BEVEL', width=0.01, segments=2); parts.append(r)
        t = P(bpy.ops.mesh.primitive_cube_add, f'PlankR{i}', wood, size=1, location=(0.5, 0, -0.4 + i * 0.2)); t.scale = (0.04, 0.98, 0.18); add_mod(t, 'BEVEL', width=0.01, segments=2); parts.append(t)
    lid = P(bpy.ops.mesh.primitive_cube_add, 'Lid', wood, size=1, location=(0, 0, 0.5)); lid.scale = (1.0, 1.0, 0.05); add_mod(lid, 'BEVEL', width=0.01, segments=2); parts.append(lid)
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = P(bpy.ops.mesh.primitive_cube_add, f'Corner{sx}{sy}', iron, size=1, location=(sx * 0.5, sy * 0.5, 0)); c.scale = (0.1, 0.1, 1.04); add_mod(c, 'BEVEL', width=0.02, segments=2); parts.append(c)
    for sy in (-1, 1):
        d = P(bpy.ops.mesh.primitive_cube_add, f'Diag{sy}', wood, size=1, location=(0, sy * 0.53, 0)); d.scale = (1.3, 0.03, 0.12); d.rotation_euler = (0, math.radians(45), 0); add_mod(d, 'BEVEL', width=0.01, segments=2); parts.append(d)
    return finish('crate', parts, 1024)

def papad():
    """roasted papad disc, radius 1, thickness 0.1, top at z=0.05"""
    pap = proc('Papad', 'clay', '#F4C46A', '#E39A3A', 0.65, 2, 0.9)
    burn = proc('PapadBurn', 'clay', '#C97A2A', '#7A3E12', 0.7, 6, 0.5)
    d = P(bpy.ops.mesh.primitive_cylinder_add, 'Disc', pap, radius=1, depth=0.08, vertices=96)
    add_mod(d, 'BEVEL', width=0.03, segments=3)
    bpy.context.view_layer.objects.active = d; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=6); bpy.ops.object.mode_set(mode='OBJECT')
    apply_mods(d)
    for v in d.data.vertices:  # blistered surface and a wavy edge
        n_ = noise.noise(Vector((v.co.x * 4, v.co.y * 4, 0)))
        if v.co.z > 0: v.co.z += max(0, n_) * 0.06
        rr = math.hypot(v.co.x, v.co.y)
        if rr > 0.9: v.co.z += 0.02 * math.sin(math.atan2(v.co.y, v.co.x) * 9)
    smooth(d)
    spots = []
    for i in range(26):
        a = random.random() * TAU; r = math.sqrt(random.random()) * 0.85
        s_ = P(bpy.ops.mesh.primitive_uv_sphere_add, f'Spot{i}', burn, radius=0.04 + random.random() * 0.05, location=(math.cos(a) * r, math.sin(a) * r, 0.045), segments=10, ring_count=6); s_.scale = (1, 1, 0.2); spots.append(s_)
    return finish('papad', [d] + spots, 1024)

def peel():
    """banana peel lying flat, about radius 1"""
    yel = proc('Peel', 'paint', '#FFD93B', '#E8B800', 0.5, 2, 0.3); brown = proc('PeelTip', 'leather', '#6B4A00', '#3E2A00', 0.6, 6, 0.4)
    parts = []
    for k in range(4):
        a = k / 4 * TAU + 0.3
        pts = [(math.cos(a) * 0.1, math.sin(a) * 0.1, 0.12), (math.cos(a + 0.15) * 0.45, math.sin(a + 0.15) * 0.45, 0.1), (math.cos(a + 0.25) * 0.85, math.sin(a + 0.25) * 0.85, 0.06), (math.cos(a + 0.35) * 1.0, math.sin(a + 0.35) * 1.0, 0.1)]
        t = tube(f'Leaf{k}', pts, 0.15, yel, taper=[1.0, 1.0, 0.7, 0.2]); t.scale = (1, 1, 0.45); parts.append(t)
    parts.append(P(bpy.ops.mesh.primitive_cylinder_add, 'Stem', brown, radius=0.08, depth=0.3, location=(0, 0, 0.25), vertices=16))
    return finish('peel', parts, 512)

def mukut():
    """gold crown, radius 1, height about 0.9, origin at base"""
    gold = proc('MukutGold', 'metal', '#FFCE4A', '#E2A21A', 0.2, 1, 0.05, metal=1.0)
    ruby = flat('MRuby', '#D0103A', 0.05); emerald = flat('MEmerald', '#14C48A', 0.05); pearl = flat('MPearl', '#FFF8F0', 0.15)
    band = lathe('Band', [(0.9, 0.0), (1.0, 0.04), (1.02, 0.3), (0.96, 0.34), (0.9, 0.3), (0.88, 0.04)], 64); band.data.materials.append(gold); smooth(band)
    parts = [band]
    for k in range(8):
        a = k / 8 * TAU; c = (math.cos(a), math.sin(a))
        sp = P(bpy.ops.mesh.primitive_cone_add, f'Peak{k}', gold, radius1=0.24, depth=0.62, vertices=16, location=(c[0] * 0.95, c[1] * 0.95, 0.6)); sp.scale = (1, 0.45, 1); sp.rotation_euler = (0, 0, a + math.pi / 2); parts.append(sp)
        parts.append(P(bpy.ops.mesh.primitive_uv_sphere_add, f'Ball{k}', pearl, radius=0.07, location=(c[0] * 0.95, c[1] * 0.95, 0.94), segments=12, ring_count=8))
        g = P(bpy.ops.mesh.primitive_ico_sphere_add, f'Gem{k}', ruby if k % 2 else emerald, radius=0.1, subdivisions=1, location=(c[0] * 1.03, c[1] * 1.03, 0.17)); parts.append(g)
    return finish('mukut', parts, 1024, metal=0.8)

def island(name, round_=False):
    """floating rock underside: footprint 1x1 (x, y in 0..1) or a unit-radius disc, top at z=0 with a grassy lip, rock tapering down to about z=-1.1"""
    rock = proc('Rock', 'rock', '#8A6BB8', '#5A3E8A', 0.85, 1.5, 1.2)
    moss = proc('Moss', 'grass', '#6BD13B', '#3E9A1E', 0.8, 3, 0.6)
    bm = bmesh.new()
    if round_:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=1.0, radius2=0.12, depth=1.1)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -0.55))
    else:
        bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.translate(bm, verts=bm.verts, vec=(0.5, 0.5, -0.5))
        for v in bm.verts:
            if v.co.z < -0.5: v.co.x = 0.5 + (v.co.x - 0.5) * 0.25; v.co.y = 0.5 + (v.co.y - 0.5) * 0.25; v.co.z = -1.1
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.data.materials.append(rock)
    add_mod(o, 'SUBSURF', levels=4, subdivision_type='SIMPLE'); apply_mods(o)
    for v in o.data.vertices:
        if v.co.z < -0.02:
            d = noise.fractal(v.co * 3.0, 0.6, 2.0, 5) * 0.12
            k = min(1.0, -v.co.z * 2.0)
            if round_:
                rr = math.hypot(v.co.x, v.co.y) or 1.0
                d2 = noise.fractal(v.co * 1.4, 0.55, 2.0, 4) * 0.16; k2 = min(1.0, max(0.0, (-v.co.z - 0.12) * 1.6))
                v.co.x += d2 * k2 * v.co.x / rr; v.co.y += d2 * k2 * v.co.y / rr
            else:
                v.co.x += d * k * (1 if v.co.x > 0.5 else -1); v.co.y += d * k * (1 if v.co.y > 0.5 else -1)
            v.co.z += noise.noise(v.co * 5.0) * 0.05 * k
    smooth(o)
    lip = P(bpy.ops.mesh.primitive_cylinder_add if round_ else bpy.ops.mesh.primitive_cube_add, 'Lip', moss, **({'radius': 1.02, 'depth': 0.08, 'vertices': 64, 'location': (0, 0, -0.05)} if round_ else {'size': 1, 'location': (0.5, 0.5, -0.05)}))
    if not round_: lip.scale = (1.03, 1.03, 0.08)
    add_mod(lip, 'BEVEL', width=0.02, segments=3)
    return finish(name, [o, lip], 2048)

def cloud():
    """soft cloud cluster, about 3 wide"""
    cm = proc('Cloud', 'cloud', '#FFFFFF', '#EEF2FF', 0.95, 1, 0.15)
    mb = bpy.data.metaballs.new('CloudMB'); mb.resolution = 0.08
    o = bpy.data.objects.new('CloudMB', mb); bpy.context.collection.objects.link(o)
    for i in range(16):
        el = mb.elements.new(); el.co = (random.uniform(-1.3, 1.3), random.uniform(-0.6, 0.6), random.uniform(0, 0.5) * (1 - abs(el.co[0]) / 1.6) if False else random.uniform(-0.05, 0.45)); el.radius = random.uniform(0.45, 0.75)
    select_only(o); bpy.ops.object.convert(target='MESH'); o = bpy.context.object; o.data.materials.append(cm); smooth(o)
    return finish('cloud', [o], 1024)

def lantern():
    """kandil paper lantern, about 1 tall, hanging point at the top"""
    paper = proc('Paper', 'paint', '#FF3D7F', '#FFC21A', 0.6, 1, 0.1, extra='stripes')
    glowm = flat('LanternGlow', '#FFD36B', 0.5, emit='#FFB627', es=4)
    body = lathe('Lantern', [(0.05, -0.5), (0.3, -0.42), (0.42, -0.2), (0.45, 0.0), (0.42, 0.2), (0.3, 0.42), (0.05, 0.5)], 12)
    body.data.materials.append(paper); add_mod(body, 'SUBSURF', levels=1)
    tassels = [tube(f'Tassel{k}', [(math.cos(k) * 0.06, math.sin(k) * 0.06, -0.5), (math.cos(k) * 0.1, math.sin(k) * 0.1, -0.75), (math.cos(k) * 0.12, math.sin(k) * 0.12, -0.95)], 0.015, flat('Tassel', '#FFC21A', 0.6)) for k in range(5)]
    return finish('lantern', [body] + tassels, 512)

def diya():
    """clay oil lamp with a flame, about 0.5 wide"""
    clay = proc('DiyaClay', 'clay', '#B85A30', '#8A3E1C', 0.8, 4, 0.5)
    flame = flat('Flame', '#FFC94A', 0.3, emit='#FF8A00', es=6)
    bowl = lathe('Bowl', [(0.01, 0.0), (0.12, 0.0), (0.22, 0.06), (0.26, 0.12), (0.22, 0.12), (0.12, 0.06), (0.01, 0.06)], 48); bowl.data.materials.append(clay); smooth(bowl)
    bowl.scale = (1.25, 0.9, 1)
    fl = P(bpy.ops.mesh.primitive_uv_sphere_add, 'Flame', flame, radius=0.05, location=(0.25, 0, 0.18), segments=16, ring_count=8); fl.scale = (1, 1, 2.2)
    return finish('diya', [bowl, fl], 512)

def kite():
    """patang kite with tail, about 1 tall"""
    paper = proc('KitePaper', 'paint', '#14C4B4', '#FFFFFF', 0.6, 1, 0.05)
    accent = flat('KiteAccent', '#E8177D', 0.6); stick = flat('KiteStick', '#8A5A2B', 0.6)
    v = [(0, 0, 0.5), (0.38, 0, 0), (0, 0, -0.45), (-0.38, 0, 0)]
    k = mesh_obj('Kite', v, [(0, 1, 2, 3)]); k.data.materials.append(paper); add_mod(k, 'SOLIDIFY', thickness=0.01)
    tri = mesh_obj('KiteTri', [(0, -0.006, 0.5), (0.15, -0.006, 0.31), (-0.15, -0.006, 0.31)], [(0, 1, 2)]); tri.data.materials.append(accent); add_mod(tri, 'SOLIDIFY', thickness=0.004)
    s1 = tube('Spine', [(0, -0.01, 0.5), (0, -0.01, 0), (0, -0.01, -0.45)], 0.01, stick)
    s2 = tube('Bow', [(-0.38, -0.01, 0), (0, -0.01, 0.12), (0.38, -0.01, 0)], 0.008, stick)
    tail = tube('Tail', [(0, 0, -0.45), (0.06, 0, -0.65), (-0.06, 0, -0.85), (0.04, 0, -1.05)], 0.02, accent, taper=[1, 0.8, 0.6, 0.3])
    return finish('kite', [k, tri, s1, s2, tail], 512)

def garland():
    """marigold garland strand: 1 long along x, sagging 0.25"""
    mar = proc('Marigold', 'leather', '#FF8A1C', '#FFC21A', 0.7, 8, 0.8); mar2 = proc('Marigold2', 'leather', '#FFC21A', '#FFE06B', 0.7, 8, 0.8)
    parts = []
    for i in range(22):
        u = i / 21; x = u; z = -math.sin(u * math.pi) * 0.25
        f = P(bpy.ops.mesh.primitive_ico_sphere_add, f'Flower{i}', mar if i % 2 else mar2, radius=0.032, subdivisions=2, location=(x, 0, z)); parts.append(f)
    return finish('garland', parts, 512)

def ferris():
    """giant mela ferris wheel: wheel radius 1 centred at (0,0,1.15), on an A-frame. Exported as two parts: frame and wheel"""
    steel = proc('FerrisSteel', 'paint', '#FFFFFF', '#E9E4F2', 0.4, 1, 0.05)
    pinkm = flat('FerrisPink', '#E8177D', 0.4); bulbs = flat('Bulb', '#FFE9A8', 0.3, emit='#FFC94A', es=5)
    cab = [flat(f'Cabin{i}', c, 0.45) for i, c in enumerate(['#FF4B4B', '#FFC21A', '#14C4B4', '#3D8BFF', '#9B5CFF', '#6BD13B'])]
    frame = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            frame.append(tube(f'Leg{sx}{sy}', [(sx * 0.6, sy * 0.25, 0), (sx * 0.3, sy * 0.15, 0.6), (0, sy * 0.1, 1.15)], 0.025, pinkm, res=4))
    finish('ferris_frame', frame, 1024)
    clear()
    wheel = []
    for r in (1.0, 0.98):
        wheel.append(P(bpy.ops.mesh.primitive_torus_add, f'Rim{r}', steel, major_radius=r, minor_radius=0.02, major_segments=96, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0)))
    for k in range(12):
        a = k / 12 * TAU
        wheel.append(tube(f'Spoke{k}', [(0, 0, 0), (math.cos(a) * 0.5, 0, math.sin(a) * 0.5), (math.cos(a), 0, math.sin(a))], 0.01, steel, res=2))
        wheel.append(P(bpy.ops.mesh.primitive_uv_sphere_add, f'Bulb{k}', bulbs, radius=0.03, location=(math.cos(a + 0.26) * 1.0, -0.03, math.sin(a + 0.26) * 1.0), segments=8, ring_count=6))
        c = P(bpy.ops.mesh.primitive_cube_add, f'Cab{k}', cab[k % 6], size=1, location=(math.cos(a) * 1.0, 0, math.sin(a) * 1.0 - 0.1)); c.scale = (0.12, 0.16, 0.12); add_mod(c, 'BEVEL', width=0.03, segments=3); wheel.append(c)
    wheel.append(P(bpy.ops.mesh.primitive_cylinder_add, 'Hub', pinkm, radius=0.08, depth=0.2, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0)))
    return finish('ferris_wheel', wheel, 1024)

def tapri():
    """chai tapri stall that frames the finish. 1 unit = 50 engine units. Counter faces -Y. Footprint about 3.6 x 1.8"""
    wood = proc('StallWood', 'wood', '#C8874E', '#9C6230', 0.7, 3, 0.25)
    paint = proc('StallPaint', 'paint', '#14C4B4', '#0FA899', 0.6, 2, 0.1)
    awn = proc('Awning', 'paint', '#E8177D', '#FFFFFF', 0.6, 1, 0.05, extra='stripes')
    steel = proc('Kettle', 'metal', '#E6EAF0', '#B9C0CC', 0.18, 1, 0.03, metal=1.0)
    glass = flat('ChaiGlass', '#D9A77A', 0.15); signm = flat('Sign', '#FFC21A', 0.5); dark = flat('Stove', '#2A2A33', 0.5, 0.6)
    flame = flat('StoveFlame', '#4AA8FF', 0.3, emit='#2E7BFF', es=5)
    parts = []
    c = P(bpy.ops.mesh.primitive_cube_add, 'Counter', paint, size=1, location=(0, 0, 0.55)); c.scale = (3.4, 1.2, 1.1); add_mod(c, 'BEVEL', width=0.05, segments=3); parts.append(c)
    top = P(bpy.ops.mesh.primitive_cube_add, 'Top', wood, size=1, location=(0, -0.05, 1.13)); top.scale = (3.6, 1.35, 0.08); add_mod(top, 'BEVEL', width=0.02, segments=2); parts.append(top)
    for sx in (-1.7, 1.7):
        for sy in (-0.6, 0.6):
            parts.append(P(bpy.ops.mesh.primitive_cylinder_add, f'Post{sx}{sy}', wood, radius=0.07, depth=2.6, location=(sx, sy, 1.3), vertices=16))
    roof = P(bpy.ops.mesh.primitive_cube_add, 'Roof', wood, size=1, location=(0, 0, 2.62)); roof.scale = (3.9, 1.7, 0.12); add_mod(roof, 'BEVEL', width=0.03, segments=2); parts.append(roof)
    aw = P(bpy.ops.mesh.primitive_plane_add, 'Awning', awn, size=1, location=(0, -1.22, 2.38)); aw.scale = (3.9, 0.9, 1); aw.rotation_euler = (math.radians(35), 0, 0)
    add_mod(aw, 'SOLIDIFY', thickness=0.02); parts.append(aw)
    for i in range(14):  # scalloped awning edge
        x = -1.9 + i * 0.29
        sc_ = P(bpy.ops.mesh.primitive_uv_sphere_add, f'Scallop{i}', awn, radius=0.15, location=(x, -1.6, 2.1), segments=16, ring_count=8); sc_.scale = (1, 0.4, 1); parts.append(sc_)
    sg = P(bpy.ops.mesh.primitive_cube_add, 'SignBoard', signm, size=1, location=(0, -0.2, 3.05)); sg.scale = (2.4, 0.12, 0.7); add_mod(sg, 'BEVEL', width=0.05, segments=3); parts.append(sg)
    # text "CHAI" in 3D on the board
    bpy.ops.object.text_add(location=(0, -0.28, 2.88), rotation=(math.pi / 2, 0, 0)); t = bpy.context.object; t.data.body = 'CHAI'
    fnt = os.environ.get('DM_FONT');
    if fnt and os.path.exists(fnt): t.data.font = bpy.data.fonts.load(fnt)
    t.data.size = 0.55; t.data.extrude = 0.04; t.data.align_x = 'CENTER'; t.data.materials.append(flat('SignText', '#E8177D', 0.4))
    select_only(t); bpy.ops.object.convert(target='MESH'); parts.append(bpy.context.object)
    st = P(bpy.ops.mesh.primitive_cylinder_add, 'Stove', dark, radius=0.3, depth=0.25, location=(0.9, 0.0, 1.3)); parts.append(st)
    parts.append(P(bpy.ops.mesh.primitive_torus_add, 'Burner', flame, major_radius=0.18, minor_radius=0.03, location=(0.9, 0.0, 1.45)))
    k = lathe('KettleBody', [(0.01, 0), (0.28, 0.0), (0.33, 0.12), (0.3, 0.32), (0.18, 0.42), (0.08, 0.46), (0.01, 0.46)], 48); k.location = (0.9, 0.0, 1.46); k.data.materials.append(steel); smooth(k); parts.append(k)
    parts.append(tube('Spout', [(0.65, 0, 1.6), (0.5, 0, 1.72), (0.42, 0, 1.8)], 0.035, steel))
    parts.append(tube('KHandle', [(0.75, 0, 1.85), (0.9, 0, 2.05), (1.05, 0, 1.85)], 0.025, dark))
    for i in range(6):
        g = lathe(f'Glass{i}', [(0.01, 0), (0.06, 0), (0.08, 0.16), (0.07, 0.16), (0.05, 0.02), (0.01, 0.02)], 24); g.location = (-1.2 + i * 0.22, -0.4, 1.17); g.data.materials.append(glass); smooth(g); parts.append(g)
    for i in range(3):
        j = lathe(f'Jar{i}', [(0.01, 0), (0.15, 0), (0.17, 0.3), (0.12, 0.36), (0.13, 0.42), (0.01, 0.42)], 32); j.location = (-0.3 + i * 0.36, 0.25, 1.17); j.data.materials.append(flat('JarGlass', '#FFE6A8', 0.1)); smooth(j); parts.append(j)
    return finish('tapri', parts, 2048)

BUILDERS = [('kulhad', kulhad), ('dhol', dhol), ('belan', belan), ('fan_blade', fan_blade), ('fan_motor', fan_motor), ('fan_wall', fan_wall),
            ('thali', thali), ('crate', crate), ('papad', papad), ('peel', peel), ('mukut', mukut), ('island_rect', lambda: island('island_rect')),
            ('island_round', lambda: island('island_round', True)), ('cloud', cloud), ('lantern', lantern), ('diya', diya), ('kite', kite),
            ('garland', garland), ('ferris', ferris), ('tapri', tapri)]
for name, fn in BUILDERS:
    if not want(name): continue
    reset(); fn()
print('PROPS DONE')
os._exit(0)
