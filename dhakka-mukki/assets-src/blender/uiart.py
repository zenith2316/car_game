"""Path-traced menu art for Dhakka Mukki: 3D logo, role art, button icons, map title cards and the loading splash.
Run: python3.11 assets-src/blender/uiart.py -- <repo_root> <qa_dir> <font.ttf> [parts...]   parts: logo roles icons cards splash"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from common import *
from PIL import Image

a = sys.argv[sys.argv.index('--') + 1:]
ROOT, QA, FONT, PARTS = a[0], a[1], a[2], set(a[3:]) or {'logo', 'roles', 'icons', 'cards', 'splash'}
UI = os.path.join(ROOT, 'android/assets/web/assets/ui'); os.makedirs(UI, exist_ok=True)
MODELS = os.path.join(ROOT, 'android/assets/web/assets/models'); ENV = os.path.join(ROOT, 'android/assets/web/assets/env')
COLORS = [('#FF4B4B', '#C42828'), ('#FFC21A', '#D38E00'), ('#6BD13B', '#3E9A1E'), ('#14C4B4', '#078F84'), ('#3D8BFF', '#1F5BC9'),
          ('#9B5CFF', '#6A30D0'), ('#FF62B9', '#CC3287'), ('#C08452', '#8A5428'), ('#F6F2EA', '#BDB5A6'), ('#4A4A63', '#25253A')]

def base_scene(look='AgX - Punchy', exposure=0.0):
    s = reset(); s.view_settings.look = look; s.view_settings.exposure = exposure; return s

def sky_world(name, strength=1.0, rot=0.0):
    s = bpy.context.scene; w = bpy.data.worlds.new('sky'); s.world = w; w.use_nodes = True; nt = w.node_tree
    tex = nt.nodes.new('ShaderNodeTexEnvironment'); tex.image = bpy.data.images.load(os.path.join(ENV, f'sky_{name}.jpg'))
    mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord'); mp.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], nt.nodes['Background'].inputs['Color']); nt.nodes['Background'].inputs['Strength'].default_value = strength

def color_world(c, strength=1.0):
    s = bpy.context.scene; w = bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = hex_rgba(c); w.node_tree.nodes['Background'].inputs[1].default_value = strength

def imp(name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'), bone_heuristic='BLENDER')
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    holder = bpy.data.objects.new(name + '_holder', None); bpy.context.collection.objects.link(holder)
    for r in roots: r.parent = holder
    holder.location = loc; holder.rotation_euler = rot; holder.scale = (scale,) * 3
    return holder, new

def bean(color=0, look=0, action='Idle', frame=0, loc=(0, 0, 0), rot_z=0.0, scale=1.0, extras=()):
    holder, objs = imp('bean', loc, (0, 0, rot_z), scale)
    fill, dark = COLORS[color]
    for o in objs:
        if o.type == 'MESH':
            if o.name.startswith('Look'): o.hide_render = o.name.split('.')[0] != f'Look{look}'
            if o.name.startswith('Extra_'): o.hide_render = o.name.split('.')[0] not in extras
            for i, m in enumerate(o.data.materials):
                if m and m.name.split('.')[0] in ('Body', 'ArmSkin', 'Shoe'):
                    m2 = m.copy(); o.data.materials[i] = m2; b = bsdf(m2)
                    rgb = node(m2, 'ShaderNodeRGB', (-500, 500)); rgb.outputs[0].default_value = hex_rgba(dark if m.name.startswith('Shoe') else fill)
                    mix = node(m2, 'ShaderNodeMix', (-250, 400)); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
                    if b.inputs['Base Color'].links: link(m2, b.inputs['Base Color'].links[0].from_socket, mix.inputs['A'])
                    else: mix.inputs['A'].default_value = (1, 1, 1, 1)
                    link(m2, rgb.outputs['Color'], mix.inputs['B']); link(m2, mix.outputs['Result'], b.inputs['Base Color'])
                    b.inputs['Coat Weight'].default_value = 0.3
    rig = next(o for o in objs if o.type == 'ARMATURE')
    act = next(x for x in bpy.data.actions if x.name.split('_')[0] == action)
    rig.animation_data_create(); rig.animation_data.action = act
    rig['dm_frame'] = frame
    return holder, rig

def pose_all():
    # every rig samples its own action at its own frame: bake each pose to a static copy of the action at that frame
    for rig in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
        f = rig.get('dm_frame', 0); act = rig.animation_data.action
        for fc in act.fcurves:
            dp = fc.data_path; idx = fc.array_index; val = fc.evaluate(f)
            try:
                tgt = rig.path_resolve(dp.rsplit('.', 1)[0]); attr = dp.rsplit('.', 1)[1]
                arr = getattr(tgt, attr)
                if hasattr(arr, '__len__'): arr[idx] = val
                else: setattr(tgt, attr, val)
            except Exception: pass
        rig.animation_data.action = None
    bpy.context.view_layer.update()

def save_webp(png, out, size=None, q=92):
    im = Image.open(png)
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(out, 'WEBP', quality=q, method=6)

# ------------------------------------------------------------------ logo
if 'logo' in PARTS:
    base_scene(); bpy.context.scene.view_settings.view_transform = 'Standard'; bpy.context.scene.view_settings.look = 'None'; font = bpy.data.fonts.load(FONT)
    def word(txt, z, mat, tilt):
        bpy.ops.object.text_add(location=(0, 0, z), rotation=(math.pi / 2, 0, tilt)); t = bpy.context.object; t.data.body = txt; t.data.font = font
        t.data.size = 0.95; t.data.extrude = 0.1; t.data.bevel_depth = 0.022; t.data.bevel_resolution = 5; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
        t.data.materials.append(mat); return t
    yel = principled('LogoYellow', '#FFC21A', 0.22, coat=1.0)
    tc = node(yel, 'ShaderNodeTexCoord', (-800, 300)); sep = node(yel, 'ShaderNodeSeparateXYZ', (-600, 300)); link(yel, tc.outputs['Object'], sep.inputs['Vector'])
    rp = node(yel, 'ShaderNodeValToRGB', (-400, 300)); rp.color_ramp.elements[0].color = hex_rgba('#FF7A00'); rp.color_ramp.elements[1].color = hex_rgba('#FFE84A')
    mr = node(yel, 'ShaderNodeMapRange', (-500, 200)); mr.inputs['From Min'].default_value = -0.3; mr.inputs['From Max'].default_value = 0.35
    link(yel, sep.outputs['Y'], mr.inputs['Value']); link(yel, mr.outputs['Result'], rp.inputs['Fac']); link(yel, rp.outputs['Color'], bsdf(yel).inputs['Base Color'])
    white = principled('LogoWhite', '#FFF6FB', 0.22, coat=1.0)
    word('Dhakka', 0.45, yel, math.radians(-4)); word('Mukki', -0.45, white, math.radians(3))
    area_light((-2, -5, 3), (0, 0, 0), 4, 800); area_light((3, -3, -1), (0, 0, 0), 3, 260, '#FFD0E8'); color_world('#FFFFFF', 0.9)
    camera((0, -9, 0), (0, 0, 0), lens=45, ortho=4.6)
    render(os.path.join(QA, 'logo_raw.png'), 2048, 1024, 64)
    # thick plum outline and a pink drop shadow, built from the alpha so edges stay clean
    from PIL import ImageFilter, ImageChops
    im = Image.open(os.path.join(QA, 'logo_raw.png')).convert('RGBA'); a_ = im.split()[3]
    pad = Image.new('L', (im.width + 120, im.height + 120), 0); pad.paste(a_, (60, 60))
    outl = pad.filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(1.5))
    shadow = Image.new('L', pad.size, 0); shadow.paste(outl, (0, 22))
    canvas = Image.new('RGBA', pad.size, (0, 0, 0, 0))
    canvas.paste(Image.new('RGBA', pad.size, (232, 23, 125, 255)), (0, 0), shadow)
    canvas.paste(Image.new('RGBA', pad.size, (42, 15, 74, 255)), (0, 0), outl)
    canvas.alpha_composite(im, (60, 60))
    canvas = canvas.crop(canvas.getbbox())
    canvas.save(os.path.join(QA, 'logo.png')); canvas.save(os.path.join(UI, 'logo.webp'), 'WEBP', quality=94, method=6)
    print('ART logo')

# ------------------------------------------------------------------ role art
if 'roles' in PARTS:
    for name, color, look, action, frame, extras, rim, bg in [
        ('racer', 2, 4, 'Run', 0, (), '#6BFF7A', '#1E8A3E'),
        ('rustam', 5, 0, 'Idle', 10, (), '#C77DFF', '#2A0F66'),
        ('king', 1, 0, 'Celebrate', 6, ('Extra_Crown',), '#FFE16B', '#A87800')]:
        base_scene()
        bean(color, look, action, frame, (0, 0, 0), math.radians(-22), 1.0, extras); pose_all()
        if name == 'rustam':
            imp('peel', (0.62, -0.35, 0.02), (0, 0, 0.4), 0.18)
            # domino mask with eye holes, wrapped onto the face of the bean
            import bmesh
            H_, R_ = 1.16, 0.45
            def sy(x, z):
                t = z / H_; e = abs(2 * t - 1) ** 2.2; r = R_ * max(0.0, 1 - e) ** (1 / 2.2) * (1 - 0.12 * t)
                return -math.sqrt(max(1e-6, r * r - x * x))
            bm = bmesh.new(); nx, nz = 40, 14; grid = {}
            for i in range(nx + 1):
                for j in range(nz + 1):
                    x = -0.4 + 0.8 * i / nx; z = 0.64 + 0.32 * j / nz
                    if abs(x) > 0.4 * (1 - ((z - 0.8) / 0.16) ** 2 * 0.45): continue
                    if math.hypot((abs(x) - 0.152) / 0.085, (z - 0.81) / 0.095) < 1: continue
                    grid[(i, j)] = bm.verts.new((x, sy(x, z) - 0.012, z))
            for i in range(nx):
                for j in range(nz):
                    q = [grid.get(k) for k in [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]]
                    if all(q): bm.faces.new(q)
            me = bpy.data.meshes.new('Mask'); bm.to_mesh(me); bm.free(); mo = bpy.data.objects.new('Mask', me); bpy.context.collection.objects.link(mo)
            mo.data.materials.append(principled('MaskMat', '#2A0F4A', 0.35, coat=0.8)); add_mod(mo, 'SOLIDIFY', thickness=0.02); add_mod(mo, 'SUBSURF', levels=1); smooth(mo)
            mo.parent = [o for o in bpy.data.objects if o.name.startswith('bean_holder')][0]
        if name == 'king':
            for k in range(14):
                bpy.ops.mesh.primitive_ico_sphere_add(radius=0.03, location=(random.uniform(-1, 1), random.uniform(-0.5, 0.5), random.uniform(0.2, 1.8)))
                bpy.context.object.data.materials.append(principled(f'Sparkle{k}', '#FFE16B', 0.2, emit='#FFD040', emit_strength=8))
        area_light((-1.8, -2.4, 2.6), (0, 0, 0.6), 2.4, 380, '#FFF1DE'); area_light((1.6, 1.8, 1.6), (0, 0, 0.8), 1.5, 900, rim); area_light((-1.6, 1.6, 1.2), (0, 0, 0.8), 1.2, 500, rim)
        color_world(bg, 0.6)
        camera((0.2, -3.6, 1.05), (0, 0, 0.62), lens=55)
        render(os.path.join(QA, f'role_{name}.png'), 1024, 1024, 64)
        save_webp(os.path.join(QA, f'role_{name}.png'), os.path.join(UI, f'role_{name}.webp'))
        print('ART role', name)

# ------------------------------------------------------------------ icons
if 'icons' in PARTS:
    def icon_scene():
        base_scene(); area_light((-2, -3, 3), (0, 0, 0.3), 3, 500); area_light((2, 2, 1), (0, 0, 0.3), 2, 300, '#FFE0F0'); color_world('#FFFFFF', 0.7)
    def shot(name, cam_loc=(0, -3, 1.6), target=(0, 0, 0.3), lens=50):
        camera(cam_loc, target, lens=lens); render(os.path.join(QA, f'icon_{name}.png'), 512, 512, 48)
        save_webp(os.path.join(QA, f'icon_{name}.png'), os.path.join(UI, f'icon_{name}.webp'), (256, 256)); print('ART icon', name)
    icon_scene(); bean(1, 0, 'Jump', 4, (0, 0, 0.15), math.radians(-20)); pose_all(); shot('jump', (0, -3.6, 1.3), (0, 0, 0.75), 55)
    icon_scene(); bean(3, 0, 'Dive', 4, (0, 0, 0), math.radians(-70)); pose_all(); shot('dhakka', (0.3, -3.4, 1.4), (0.1, 0, 0.55), 55)
    icon_scene(); imp('peel', (0, 0, 0), (0, 0, 0.5), 0.75); shot('kela', (0, -1.9, 1.7), (0, 0, 0.05))
    icon_scene(); imp('papad', (0, 0, 0), (0, 0, 0), 0.8); shot('crack', (0, -1.9, 1.6), (0, 0, 0))
    icon_scene(); imp('belan', (0, 0, 0.2), (0, 0, 0.6), 0.85)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.75, minor_radius=0.04, location=(0, 0, 0.2)); bpy.context.object.data.materials.append(principled('Swirl', '#E8177D', 0.3, emit='#E8177D', emit_strength=1.5)); shot('ulta', (0, -2.2, 1.8), (0, 0, 0.1))
    icon_scene()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.7, depth=0.1, vertices=64); g = bpy.context.object; g.data.materials.append(principled('Ground', '#C8874E', 0.8))
    for k in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.35 + k * 0.25, minor_radius=0.03, location=(0, 0, 0.08 + k * 0.05)); bpy.context.object.data.materials.append(principled(f'Wave{k}', '#9B5CFF', 0.3, emit='#9B5CFF', emit_strength=2.0 - k * 0.5))
    shot('bhookamp', (0, -2.1, 1.7), (0, 0, 0.05))

# ------------------------------------------------------------------ map title cards and splash (need the sky panoramas)
def ring_beans(n, center, radius, z, actions, scale=1.0):
    for i in range(n):
        a_ = i / n * math.tau + 0.3
        bean(i % 10, (i * 3) % 10, actions[i % len(actions)], (i * 3) % 12, (center[0] + math.cos(a_) * radius, center[1] + math.sin(a_) * radius, z), a_ + math.pi / 2 + random.uniform(-0.6, 0.6), scale)

def grade(im):
    # lift the haze the sky light leaves on wide shots: a touch more contrast and colour
    from PIL import ImageEnhance
    return ImageEnhance.Color(ImageEnhance.Contrast(im).enhance(1.14)).enhance(1.12)


def card(name, sky, build, cam_loc, target, lens=40, rot=0.0, out=None, size=(1600, 900), samples=48):
    base_scene(exposure=0.1); sky_world(sky, 1.0, rot)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(30))); bpy.context.object.data.energy = 3.0; bpy.context.object.data.angle = math.radians(6)
    build(); pose_all()
    camera(cam_loc, target, lens=lens)
    p = os.path.join(QA, f'{name}.png'); render(p, size[0], size[1], samples, transparent=False)
    grade(Image.open(p).convert('RGB')).save(out or os.path.join(UI, f'{name}.jpg'), quality=92); print('ART', name)

def slab(w, h, col, loc, tex='foam'):
    holder, objs = imp('island_rect', loc, (0, 0, 0), 1.0); holder.scale = (w, h, min(w, h) * 0.6)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(loc[0] + w / 2, loc[1] + h / 2, loc[2] + 0.04)); t = bpy.context.object; t.scale = (w * 1.0, h * 1.0, 0.12)
    m = principled('Slab' + col, col, 0.55); t.data.materials.append(m); add_mod(t, 'BEVEL', width=0.08, segments=4)
    return t

if 'cards' in PARTS:
    random.seed(5)
    def tapri_scene():
        slab(6, 3, '#3FD0BE', (-9, -1.5, 0)); slab(7, 1.4, '#FF6FAE', (-3, -0.7, 0)); slab(4, 5, '#FFC93C', (4, -2.5, 0))
        imp('tapri', (6, 0.5, 0.08), (0, 0, 0), 1.0)
        imp('belan', (-1.0, 0, 0.45), (0, 0, 0.5), 1.8); imp('belan', (2.0, 0, 0.45), (0, 0, -0.4), 1.8)
        for x, y in [(5, -1.5), (6.8, -1.2)]: imp('kulhad', (x, y, 0.1), (0, 0, 0), 0.6)
        for i, (x, y, act, fr) in enumerate([(-6, 0.2, 'Run', 2), (-4.5, -0.4, 'Run', 8), (-2.2, 0.1, 'Jump', 4), (0.4, 0.0, 'Dive', 4), (3.3, 0.2, 'Flail', 4), (-7.4, -0.8, 'Run', 12)]):
            bean(i, (i * 2) % 10, act, fr, (x, y, 0.1 if act != 'Jump' else 0.9), math.radians(90) + random.uniform(-0.3, 0.3), 1.0)
    def papad_scene():
        for r in range(7):
            for c_ in range(11):
                x = (c_ - 5) * 1.75 + (0.87 if r % 2 else 0); y = (r - 3) * 1.52
                if random.random() < 0.18: continue
                imp('papad', (x, y, 0), (0, 0, random.random() * 6), 1.0)
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -6)); bpy.context.object.data.materials.append(principled('Oil', '#E07A10', 0.1, emit='#B84A00', emit_strength=0.6))
        for i, (x, y, act, fr) in enumerate([(-2, -1, 'Run', 4), (0.5, 0.6, 'Jump', 5), (2.6, -0.8, 'Flail', 2), (-4, 1.4, 'Stun', 6), (3.6, 1.8, 'Run', 10)]):
            bean(i + 3, (i * 3 + 1) % 10, act, fr, (x, y, 0.08 if act != 'Jump' else 0.9), random.uniform(0, math.tau), 1.0)
    def pankha_scene():
        bpy.ops.mesh.primitive_cylinder_add(radius=7.8, depth=1.0, vertices=96, location=(0, 0, -0.5)); bpy.context.object.data.materials.append(principled('Marble', '#F6F2EE', 0.2))
        imp('island_round', (0, 0, -1.0), (0, 0, 0), 7.6)
        imp('fan_motor', (0, 0, 0), (0, 0, 0), 1.1)
        for k in range(3): imp('fan_blade', (0, 0, 0.55), (0, 0, k * math.tau / 3 + 0.4), 7.4)
        for i, (r, a_, act, fr) in enumerate([(4.5, 0.4, 'Jump', 4), (5.5, 1.7, 'Run', 4), (3.5, 3.2, 'Flail', 4), (5.0, 4.4, 'Run', 10), (4.0, 5.5, 'Stun', 8)]):
            bean(i * 2, (i + 5) % 10, act, fr, (math.cos(a_) * r, math.sin(a_) * r, 0.0 if act != 'Jump' else 1.0), a_ + math.pi / 2, 1.0)
    def king_scene():
        bpy.ops.mesh.primitive_cylinder_add(radius=7.2, depth=1.0, vertices=96, location=(0, 0, -0.5)); bpy.context.object.data.materials.append(principled('GoldFloor', '#FFC93C', 0.35, 0.4))
        imp('island_round', (0, 0, -1.0), (0, 0, 0), 7.0)
        for a_ in (0.3, 3.4, 1.9): imp('dhol', (math.cos(a_) * 4.6, math.sin(a_) * 4.6, 0), (0, 0, 0), 0.8)
        bean(1, 2, 'Celebrate', 6, (0, 0, 0.0), math.radians(-10), 1.15, ('Extra_Crown',))
        for i, (r, a_, act, fr) in enumerate([(2.0, 4.2, 'Dive', 4), (2.4, 5.4, 'Run', 4), (2.8, 2.3, 'Run', 10), (3.2, 0.9, 'Dive', 6)]):
            bean(i + 4, (i * 3) % 10, act, fr, (math.cos(a_) * r, math.sin(a_) * r, 0.0), a_ + math.pi, 1.0)
    card('card_tapri', 'bright', tapri_scene, (-2, -15, 8.5), (0, 0, 0.5), 36)
    card('card_papad', 'golden', papad_scene, (0, -13, 9.5), (0, 0, 0), 36)
    card('card_pankha', 'dream', pankha_scene, (0, -15, 10), (0, 0, 0), 36)
    card('card_king', 'sunset', king_scene, (0, -12, 6.5), (0, 0, 0.8), 38)

if 'splash' in PARTS:
    random.seed(8)
    def splash_scene():
        imp('island_round', (0, 0, -0.1), (0, 0, 0), 4.2)
        bpy.ops.mesh.primitive_cylinder_add(radius=4.3, depth=0.2, vertices=96, location=(0, 0, 0)); bpy.context.object.data.materials.append(principled('Grass', '#6BD13B', 0.7))
        imp('ferris_wheel', (5.5, 9, 6), (0, 0, 0.3), 5.0); imp('ferris_frame', (5.5, 9, 1.0), (0, 0, 0.3), 5.0)
        imp('tapri', (-4.2, 6, 0.1), (0, 0, 0.4), 0.9)
        for k in range(5): imp('kite', (-6 + k * 3, 6 + random.random() * 4, 4 + random.random() * 3), (0, random.uniform(-0.3, 0.3), random.uniform(-0.4, 0.4)), 1.2)
        poses = [('Dive', 4), ('Flail', 4), ('Celebrate', 6), ('Run', 4), ('Jump', 4), ('Stun', 8), ('Dance', 20), ('Wave', 12), ('Run', 10), ('Slip', 9)]
        for i, (act, fr) in enumerate(poses):
            a_ = i / 10 * math.tau; r = 1.2 + (i % 3) * 0.9
            bean(i, (i * 7) % 10, act, fr, (math.cos(a_) * r, math.sin(a_) * r - 0.5, 0.1 if act != 'Jump' else 1.0), a_ + math.pi / 2 + random.uniform(-0.5, 0.5), 1.0)
    card('splash', 'day', splash_scene, (0, -11, 5.0), (0, 0.6, 1.0), 34, out=os.path.join(UI, 'splash.jpg'), size=(1920, 1080), samples=64)
os._exit(0)
