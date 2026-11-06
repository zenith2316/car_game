"""Shared Blender helpers for the Dhakka Mukki asset pipeline (run with Blender's Python, bpy 4.2).
Everything is built from code so every asset can be regenerated: python3.11 -m pip install bpy==4.2.0"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

TAU = math.tau


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 64
    s.cycles.use_denoising = True
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'AgX - Medium High Contrast'
    return s


def hex_rgba(h, a=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def principled(name, color='#FFFFFF', rough=0.5, metal=0.0, coat=0.0, emit=None, emit_strength=1.0, sss=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hex_rgba(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.15
    if emit:
        b.inputs['Emission Color'].default_value = hex_rgba(emit)
        b.inputs['Emission Strength'].default_value = emit_strength
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    return m


def node(m, kind, loc=(0, 0), **inputs):
    n = m.node_tree.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def link(m, a, b):
    m.node_tree.links.new(a, b)


def bsdf(m):
    return m.node_tree.nodes['Principled BSDF']


def smooth(obj, angle=None):
    for p in obj.data.polygons:
        p.use_smooth = True
    if angle is not None:
        try:
            obj.data.set_sharp_from_angle(angle=angle)
        except Exception:
            pass


def add_mod(obj, kind, **kw):
    md = obj.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(md, k, v)
    return md


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for md in list(obj.modifiers):
        if md.type == 'ARMATURE':
            continue
        bpy.ops.object.modifier_apply(modifier=md.name)


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def smart_uv(obj, margin=0.02, angle=66):
    select_only(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def lathe(name, profile, segments=64):
    """profile: list of (radius, z) bottom to top. Builds a closed surface of revolution around Z."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segments):
            a = i / segments * TAU
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def bake(obj, kind, path, size=2048, samples=32, margin=8, mat_slot=0, color_space='sRGB', pass_filter=None):
    """Bake one map for obj into an image saved at path. kind: NORMAL, AO, DIFFUSE, ROUGHNESS, EMIT, COMBINED."""
    s = bpy.context.scene
    s.cycles.samples = samples
    img = bpy.data.images.new(os.path.basename(path), size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = color_space
    for m in obj.data.materials:
        tn = m.node_tree.nodes.new('ShaderNodeTexImage')
        tn.image = img
        tn.name = '__bake'
        m.node_tree.nodes.active = tn
    select_only(obj)
    kw = dict(type=kind, margin=margin, use_clear=True)
    if kind == 'DIFFUSE':
        kw['pass_filter'] = pass_filter or {'COLOR'}
    if kind == 'NORMAL':
        kw['normal_space'] = 'TANGENT'
    bpy.ops.object.bake(**kw)
    img.filepath_raw = path
    img.file_format = 'PNG' if path.endswith('.png') else 'JPEG'
    img.save()
    for m in obj.data.materials:
        n = m.node_tree.nodes.get('__bake')
        if n:
            m.node_tree.nodes.remove(n)
    return img


def baked_material(name, color_img=None, normal_img=None, rough_img=None, ao_img=None, rough=0.5, metal=0.0, color='#FFFFFF'):
    """Material that the glTF exporter turns into a clean PBR material with image textures."""
    m = principled(name, color, rough, metal)
    b = bsdf(m)
    if color_img:
        t = node(m, 'ShaderNodeTexImage', (-600, 300)); t.image = color_img
        link(m, t.outputs['Color'], b.inputs['Base Color'])
    if rough_img:
        t = node(m, 'ShaderNodeTexImage', (-600, 0)); t.image = rough_img; t.image.colorspace_settings.name = 'Non-Color'
        sep = node(m, 'ShaderNodeSeparateColor', (-300, 0))
        link(m, t.outputs['Color'], sep.inputs['Color'])
        link(m, sep.outputs['Green'], b.inputs['Roughness'])
    if normal_img:
        t = node(m, 'ShaderNodeTexImage', (-600, -300)); t.image = normal_img; t.image.colorspace_settings.name = 'Non-Color'
        nm = node(m, 'ShaderNodeNormalMap', (-300, -300))
        link(m, t.outputs['Color'], nm.inputs['Color'])
        link(m, nm.outputs['Normal'], b.inputs['Normal'])
    return m


def export_glb(path, objs=None, animations=False, draco=False):
    if objs is not None:
        select_only(*objs)
    kw = dict(filepath=path, export_format='GLB', use_selection=objs is not None, export_apply=True, export_yup=True,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_image_format='AUTO', export_animations=animations, export_skins=True, export_morph=True)
    if animations:
        kw.update(export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True)
    bpy.ops.export_scene.gltf(**kw)


def studio(world_color='#D9ECFF', strength=1.0, sun=(35, 0, 40), sun_strength=3.0):
    s = bpy.context.scene
    w = bpy.data.worlds.new('studio'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = hex_rgba(world_color)
    w.node_tree.nodes['Background'].inputs[1].default_value = strength
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(sun[0]), math.radians(sun[1]), math.radians(sun[2])))
    l = bpy.context.object; l.data.energy = sun_strength; l.data.angle = math.radians(8)
    return l


def area_light(loc, target=(0, 0, 0.5), size=2.0, energy=300, color='#FFFFFF'):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object; l.data.size = size; l.data.energy = energy; l.data.color = hex_rgba(color)[:3]
    d = Vector(target) - Vector(loc); l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return l


def camera(loc, target, lens=50, ortho=None):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    d = Vector(target) - Vector(loc); c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    c.data.lens = lens
    if ortho:
        c.data.type = 'ORTHO'; c.data.ortho_scale = ortho
    bpy.context.scene.camera = c
    return c


def render(path, w, h, samples=64, transparent=True, fmt='PNG', quality=90):
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = w, h, 100
    s.cycles.samples = samples
    s.render.film_transparent = transparent
    s.render.image_settings.file_format = fmt
    if fmt == 'PNG':
        s.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
        s.render.image_settings.compression = 90
    else:
        s.render.image_settings.color_mode = 'RGB'; s.render.image_settings.quality = quality
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
