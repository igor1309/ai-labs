# Builds the 3D T-Rex in Blender, in the colours of the app's picture
# (src/assets/dinos/tyrannosaurus/body.webp), and exports one GLB with vertex
# colours. Run: blender -b --factory-startup --python build.py -- <out.glb> [preview.png]
import bpy, bmesh, math, sys
from mathutils import Vector, noise

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
PREVIEW = args[1] if len(args) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)

ORANGE = (0.74, 0.47, 0.22)
CREAM = (0.95, 0.80, 0.52)
GREEN = (0.45, 0.47, 0.20)
CLAW = (0.30, 0.28, 0.30)
WHITE = (0.97, 0.95, 0.88)
IRIS = (0.55, 0.25, 0.08)
PUPIL = (0.05, 0.04, 0.04)


def skin_object(name, verts, edges):
    """A mesh grown by the Skin modifier around a skeleton of (x, y, z, radius)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([v[:3] for v in verts], edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.modifiers.new('skin', 'SKIN').use_smooth_shade = True
    for sv, v in zip(me.skin_vertices[0].data, verts):
        r = v[3]
        sv.radius = (r, r * v[4] if len(v) > 4 else r)
    me.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 3
    return ob


# x points back (head at -x, facing left like the picture), y is width, z up.
# Fifth value scales the radius across the body (y) relative to height (z).
V, E = [], []
def add(x, y, z, r, w=1.0):
    V.append((x, y, z, r, w)); return len(V) - 1
def chain(*ids):
    for a, b in zip(ids, ids[1:]): E.append((a, b))

tail_tip = add(2.9, 0, 1.0, 0.04)
t1 = add(2.3, 0, 1.28, 0.18)
t2 = add(1.65, 0, 1.5, 0.36)
hip = add(0.95, 0, 1.62, 0.58)
belly = add(0.3, 0, 1.52, 0.74)
chest = add(-0.35, 0, 1.7, 0.62)
neck = add(-0.8, 0, 2.15, 0.5)
skull = add(-1.15, 0, 2.55, 0.54)
face = add(-1.55, 0, 2.48, 0.48)
snout = add(-1.92, 0, 2.38, 0.38)
nose = add(-2.14, 0, 2.34, 0.28)
chain(tail_tip, t1, t2, hip, belly, chest, neck, skull, face, snout, nose)

FEET = []   # (toe positions, side) for claws
HANDS = []
for s in (1, -1):
    thigh = add(0.62, 0.46 * s, 1.32, 0.5)
    knee = add(0.38, 0.52 * s, 0.88, 0.32)
    ankle = add(0.72, 0.53 * s, 0.42, 0.18)
    heel = add(0.58, 0.53 * s, 0.15, 0.16)
    toe = add(0.18, 0.53 * s, 0.11, 0.14)
    chain(hip, thigh, knee, ankle, heel, toe)
    FEET.append((Vector((0.2, 0.53 * s, 0.1)), s))
    shoulder = add(-0.5, 0.45 * s, 1.55, 0.12)
    elbow = add(-0.66, 0.6 * s, 1.34, 0.085)
    hand = add(-0.86, 0.62 * s, 1.42, 0.06)
    chain(chest, shoulder, elbow, hand)
    HANDS.append((Vector((-0.86, 0.62 * s, 1.42)), s))

body = skin_object('body', V, E)
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.shade_smooth()


def paint(ob, fn):
    me = ob.data
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            c = fn(v.co, v.normal)
            attr.data[li].color_srgb = (*c, 1.0)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def body_colour(p, n):
    c = ORANGE
    # green along the back and the outer thighs, in patches like the picture
    patch = noise.noise(p * 2.3) + 0.35 * noise.noise(p * 6.0)
    back = n.z * 0.9 + 0.25 * abs(n.y) - 0.15
    c = mix(c, GREEN, (back + patch * 0.8) * 2.5 - 0.6)
    # cream throat, chest and belly
    under = -n.z * 0.9 - n.x * 0.35 * (1 if p.x < 0.6 else 0)
    if p.z > 0.85 and p.x < 0.45 and abs(p.y) < 0.55:
        c = mix(c, CREAM, (under + 0.15) * 3.0)
    # dark mouth line along the head
    if p.x < -1.2:
        mouth_z = 2.26 + (p.x + 1.2) * 0.03
        c = mix(c, (0.35, 0.15, 0.08), 1 - abs(p.z - mouth_z) / 0.022)
    return c

paint(body, body_colour)
parts = [body]


def sphere(name, loc, r, colour, scale=(1, 1, 1), segs=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=loc)
    ob = bpy.context.object; ob.name = name; ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    paint(ob, lambda p, n: colour)
    parts.append(ob); return ob


def cone(name, base, tip, r, colour):
    d = tip - base
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=r, radius2=0.0, depth=d.length,
                                    location=base + d / 2)
    ob = bpy.context.object; ob.name = name
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(rotation=True)
    bpy.ops.object.shade_smooth()
    paint(ob, lambda p, n: colour)
    parts.append(ob)


# eyes: white ball, brown iris, pupil, set into the side of the head
for s in (1, -1):
    e = Vector((-1.42, 0.38 * s, 2.72))
    sphere('eye', e, 0.085, WHITE)
    sphere('iris', e + Vector((-0.03, 0.05 * s, 0.0)), 0.052, IRIS)
    sphere('pupil', e + Vector((-0.045, 0.075 * s, 0.0)), 0.03, PUPIL)
    # brow ridge
    sphere('brow', e + Vector((0.02, -0.02 * s, 0.09)), 0.09, ORANGE, scale=(1.4, 0.8, 0.5))

# friendly blunt teeth along the upper jaw
for s in (1, -1):
    for i in range(5):
        x = -2.12 + i * 0.15
        y = (0.2 + i * 0.04) * s
        cone('tooth', Vector((x, y, 2.29)), Vector((x, y * 1.02, 2.2)), 0.026, WHITE)

# claws: three toes per foot, two fingers per hand
for toe, s in FEET:
    for dy in (-0.09, 0.0, 0.09):
        b = toe + Vector((-0.02, dy, 0.0))
        cone('claw', b, b + Vector((-0.2, dy * 0.6, -0.08)), 0.05, CLAW)
for hand, s in HANDS:
    for dz in (-0.02, 0.04):
        b = hand + Vector((-0.03, 0.0, dz))
        cone('claw', b, b + Vector((-0.06, 0.0, -0.06)), 0.016, CLAW)

# one mesh, standing on z = 0, centred on x
bpy.ops.object.select_all(action='DESELECT')
for ob in parts: ob.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
rex = bpy.context.object
rex.name = 'trex'
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
bb = [rex.matrix_world @ Vector(c) for c in rex.bound_box]
rex.location.z -= min(v.z for v in bb)
rex.location.x -= rex.location.x
bpy.ops.object.transform_apply(location=True)

mat = bpy.data.materials.new('skin')
nodes = mat.node_tree.nodes
bsdf = nodes.get('Principled BSDF')
vc = nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.7
rex.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_vertex_color='ACTIVE', export_apply=True)
print('TRIS', sum(len(p.vertices) - 2 for p in rex.data.polygons))

if PREVIEW:
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.light = 'STUDIO'
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    world = bpy.data.worlds.new('w'); scene.world = world
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam); scene.camera = cam
    cam.location = (-3.5, -7.5, 2.6)
    cam.rotation_euler = (Vector((0.3, 0, 1.3)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
