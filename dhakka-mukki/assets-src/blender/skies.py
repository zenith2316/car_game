"""Equirectangular sky panoramas for each Dhakka Mukki theme: Nishita sky, cloud fields, distant floating islands.
Run: python3.11 assets-src/blender/skies.py -- <repo_root> <qa_dir> <width> [themes...]"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from common import *

a = sys.argv[sys.argv.index('--') + 1:]
ROOT, QA, WIDTH, ONLY = a[0], a[1], int(a[2]), set(a[3:])
OUT = os.path.join(ROOT, 'android/assets/web/assets/env'); os.makedirs(OUT, exist_ok=True)
MODELS = os.path.join(ROOT, 'android/assets/web/assets/models')
THEMES = {
    'day': dict(sun=38, rot=20, tint='#FFFFFF', mix=0.0, zenith='#3D9BFF', sat=0.8, abyss='#7FB8F0', horizon='#FFE3F0', clouds='#FFFFFF', exposure=0.0, air=1.0, dust=0.6),
    'bright': dict(sun=55, rot=60, tint='#E8F6FF', mix=0.1, zenith='#1F8BFF', sat=0.85, abyss='#6FB3F5', horizon='#DDF4FF', clouds='#FFFFFF', exposure=0.1, air=0.8, dust=0.3),
    'golden': dict(sun=12, rot=200, tint='#FFB86B', mix=0.35, zenith='#FF9A4A', sat=0.6, abyss='#C9703A', horizon='#FFD9A0', clouds='#FFE2C2', exposure=0.2, air=1.6, dust=2.5),
    'dream': dict(sun=20, rot=300, tint='#C9B0FF', mix=0.45, zenith='#8A6BFF', sat=0.75, abyss='#8A78D8', horizon='#FFD0F2', clouds='#FFE9FA', exposure=0.25, air=1.4, dust=1.2),
    'sunset': dict(sun=4, rot=120, tint='#FF8A5B', mix=0.4, zenith='#FF5A7A', sat=0.65, abyss='#B5506A', horizon='#FFC86E', clouds='#FFD2B0', exposure=0.35, air=2.5, dust=4.0),
}

def world(t):
    s = bpy.context.scene; w = bpy.data.worlds.new('sky'); s.world = w; w.use_nodes = True; nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(t['sun']); sky.sun_rotation = math.radians(t['rot']); sky.air_density = t['air']; sky.dust_density = t['dust']; sky.sun_intensity = 0.6
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = t['mix']
    nt.links.new(sky.outputs['Color'], mix.inputs['A']); mix.inputs['B'].default_value = hex_rgba(t['tint'])
    # below the horizon Nishita is black ground: blend to a soft horizon haze fading into a deep sky-blue abyss
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    low = nt.nodes.new('ShaderNodeValToRGB'); low.color_ramp.elements[0].position = 0.0; low.color_ramp.elements[0].color = hex_rgba(t['abyss'])
    low.color_ramp.elements[1].position = 1.0; low.color_ramp.elements[1].color = hex_rgba(t['horizon'])
    zr = nt.nodes.new('ShaderNodeMapRange'); zr.inputs['From Min'].default_value = -1.0; zr.inputs['From Max'].default_value = 0.0
    nt.links.new(sep.outputs['Z'], zr.inputs['Value']); nt.links.new(zr.outputs['Result'], low.inputs['Fac'])
    hz = nt.nodes.new('ShaderNodeMapRange'); hz.inputs['From Min'].default_value = -0.04; hz.inputs['From Max'].default_value = 0.06
    nt.links.new(sep.outputs['Z'], hz.inputs['Value'])
    up = nt.nodes.new('ShaderNodeMix'); up.data_type = 'RGBA'; up.blend_type = 'MIX'
    nt.links.new(hz.outputs['Result'], up.inputs['Factor']); nt.links.new(low.outputs['Color'], up.inputs['A']); nt.links.new(mix.outputs['Result'], up.inputs['B'])
    # saturate the upper sky towards a stylised zenith colour
    zen = nt.nodes.new('ShaderNodeMix'); zen.data_type = 'RGBA'; zen.blend_type = 'OVERLAY'; zen.inputs['Factor'].default_value = t['sat']
    nt.links.new(up.outputs['Result'], zen.inputs['A']); zen.inputs['B'].default_value = hex_rgba(t['zenith'])
    nt.links.new(zen.outputs['Result'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.6
    return sky

def clouds(t):
    random.seed(3)
    cm = principled('Cloud', t['clouds'], 0.95, sss=0.4); bsdf(cm).inputs['Subsurface Radius'].default_value = (1.0, 0.9, 0.8)
    for i in range(54):
        mb = bpy.data.metaballs.new(f'c{i}'); mb.resolution = 0.6; o = bpy.data.objects.new(f'c{i}', mb); bpy.context.collection.objects.link(o)
        n = random.randint(6, 14); w = random.uniform(8, 22)
        for k in range(n):
            el = mb.elements.new(); el.co = (random.uniform(-w, w), random.uniform(-w * 0.5, w * 0.5), random.uniform(-1, w * 0.25)); el.radius = random.uniform(w * 0.25, w * 0.45)
        az = random.uniform(0, math.tau); dist = random.uniform(120, 320); h = random.choice([random.uniform(-80, -25), random.uniform(-25, 10), random.uniform(10, 60)])
        o.location = (math.cos(az) * dist, math.sin(az) * dist, h); o.data.materials.append(cm)
    # a cloud floor far below the arena
    for i in range(30):
        mb = bpy.data.metaballs.new(f'f{i}'); mb.resolution = 1.5; o = bpy.data.objects.new(f'f{i}', mb); bpy.context.collection.objects.link(o)
        for k in range(10):
            el = mb.elements.new(); el.co = (random.uniform(-40, 40), random.uniform(-40, 40), random.uniform(-3, 6)); el.radius = random.uniform(18, 30)
        az = i / 30 * math.tau; d = random.uniform(30, 260); o.location = (math.cos(az) * d, math.sin(az) * d, random.uniform(-140, -110)); o.data.materials.append(cm)

def islands():
    random.seed(9)
    dome = principled('Dome', '#FFF1E0', 0.5); gold = principled('Finial', '#FFC23A', 0.3, 1.0); pink = principled('Temple', '#FF8FB8', 0.6)
    for i in range(7):
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, 'island_round.glb')); isl = bpy.context.selected_objects[0]
        az = random.uniform(0, math.tau); d = random.uniform(160, 260); s = random.uniform(10, 22)
        isl.location = (math.cos(az) * d, math.sin(az) * d, random.uniform(-30, 25)); isl.scale = (s, s, s)
        base = isl.location.copy()
        if i % 3 == 0:
            bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, 'ferris_wheel.glb')); fw = bpy.context.selected_objects[0]
            fw.location = base + Vector((0, 0, s * 1.1)); fw.scale = (s * 0.8,) * 3; fw.rotation_euler = (0, 0, az + math.pi / 2)
            bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, 'ferris_frame.glb')); ff = bpy.context.selected_objects[0]
            ff.location = base + Vector((0, 0, 0.0)); ff.scale = (s * 0.8,) * 3; ff.rotation_euler = (0, 0, az + math.pi / 2)
        else:
            bpy.ops.mesh.primitive_cube_add(size=1, location=base + Vector((0, 0, s * 0.35))); c = bpy.context.object; c.scale = (s * 0.5, s * 0.5, s * 0.7); c.data.materials.append(pink)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=s * 0.32, location=base + Vector((0, 0, s * 0.75))); dm = bpy.context.object; dm.data.materials.append(dome); dm.scale = (1, 1, 1.25)
            bpy.ops.mesh.primitive_cone_add(radius1=s * 0.05, depth=s * 0.3, location=base + Vector((0, 0, s * 1.2))); bpy.context.object.data.materials.append(gold)

for name, t in THEMES.items():
    if ONLY and name not in ONLY: continue
    s = reset(); s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Base Contrast'; s.view_settings.exposure = t['exposure']
    world(t); clouds(t); islands()
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(90 - t['sun']), 0, math.radians(t['rot'] + 90))); bpy.context.object.data.energy = 3.0
    bpy.ops.object.camera_add(location=(0, 0, 0), rotation=(math.radians(90), 0, 0)); cam = bpy.context.object
    cam.data.type = 'PANO'; cam.data.panorama_type = 'EQUIRECTANGULAR'; s.camera = cam
    s.cycles.max_bounces = 4
    p = os.path.join(QA, f'sky_{name}.png'); render(p, WIDTH, WIDTH // 2, 14, transparent=False)
    from PIL import Image
    Image.open(p).convert('RGB').save(os.path.join(OUT, f'sky_{name}.jpg'), quality=90)
    print('SKY', name)
os._exit(0)
