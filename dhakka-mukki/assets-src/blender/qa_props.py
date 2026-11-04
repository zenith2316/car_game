"""QA contact sheet: imports exported prop GLBs and renders them together. python3.11 qa_props.py -- <repo> <out.png> names..."""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from common import *
a = sys.argv[sys.argv.index('--') + 1:]; ROOT, OUTP, names = a[0], a[1], a[2:]
reset(); bpy.context.scene.view_settings.look = 'AgX - Punchy'
cols = 4
for i, n in enumerate(names):
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'android/assets/web/assets/models', n + '.glb'))
    objs = bpy.context.selected_objects
    mn = [min((o.matrix_world @ __import__('mathutils').Vector(c)).__getitem__(k) for o in objs if o.type == 'MESH' for c in o.bound_box) for k in range(3)]
    mx = [max((o.matrix_world @ __import__('mathutils').Vector(c)).__getitem__(k) for o in objs if o.type == 'MESH' for c in o.bound_box) for k in range(3)]
    size = max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); s = 2.2 / size
    for o in objs:
        if o.parent is None:
            o.scale = [x * s for x in o.scale]
            o.location = ((i % cols) * 3.2 - (mn[0] + mx[0]) / 2 * s, -(i // cols) * 3.2 - (mn[1] + mx[1]) / 2 * s, -mn[2] * s)
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = hex_rgba('#BFE0FF')
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(30))); bpy.context.object.data.energy = 4
rows = (len(names) + cols - 1) // cols
cx = (cols - 1) * 1.6; cy = -(rows - 1) * 1.6
camera((cx, cy - 9 - rows * 2.4, 6 + rows * 1.5), (cx, cy, 0.6), lens=50)
bpy.ops.mesh.primitive_plane_add(size=60, location=(cx, cy, 0)); bpy.context.object.data.materials.append(principled('ground', '#F4E8FF', 0.8))
render(OUTP, 1600, 400 + rows * 260, 48, transparent=False)
os._exit(0)
