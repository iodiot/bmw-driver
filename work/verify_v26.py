from pathlib import Path
import sys, json, struct
sys.path.insert(0, str(Path('work/front-libs').resolve()))
import numpy as np
import trimesh

p = Path('outputs/bmw-viewer')
raw = (p/'bmw-perforated-brakes-v26.glb').read_bytes()
assert struct.unpack_from('<I', raw, 8)[0] == len(raw)
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+length])
blob = raw[28+length:]
for view in doc['bufferViews']:
    assert view.get('byteOffset', 0)+view['byteLength'] <= len(blob)
scene = trimesh.load(p/'bmw-perforated-brakes-v26.glb', force='scene', process=False)
old = trimesh.load(p/'bmw-window-frames-v25.glb', force='scene', process=False)
rotors = []
for name, mesh in scene.geometry.items():
    assert np.isfinite(mesh.vertices).all()
    if 'Drilled_brake_rotor' in name:
        normal = mesh.vertex_normals.copy()
        cap = np.abs(normal[:, 2]) > .99
        assert np.allclose(np.abs(normal[cap, 2]), 1)
        mesh = mesh.copy()
        mesh.merge_vertices()
        assert mesh.is_watertight and mesh.is_winding_consistent and mesh.euler_number == -144
        assert np.array_equal(mesh.visual.material.baseColorFactor, [72,76,82,255])
        rotors.append(name)
    else:
        assert np.array_equal(mesh.vertices, old.geometry[name].vertices), name
        assert np.array_equal(mesh.faces, old.geometry[name].faces), name
assert len(rotors) == 4
assert len(doc['animations']) == 7
report_path = Path('outputs/car-v26-verification.json')
report = json.loads(report_path.read_text())
report.update(exported_glb_reloaded=True, exported_rotor_topology_verified=True,
              planar_cap_normals_verified=True, other_meshes_identical=True,
              buffer_ranges_valid=True, visual_review='Wheel close-up: flat steel faces, visible holes, red caliper retained')
report_path.write_text(json.dumps(report, indent=2))
stats = json.loads(Path('outputs/car-v26-statistics.json').read_text())
history = Path('outputs/model-statistics.json')
data = json.loads(history.read_text(encoding='utf-8'))
data['detailed_construction'] = [x for x in data['detailed_construction'] if x.get('version') != 26]+[stats]
history.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
notes = Path('outputs/model-statistics.md')
text = notes.read_text(encoding='utf-8')
if 'Версия 26 —' in text:
    text = text[:text.index('Версия 26 —')].rstrip()
text += '\n\nВерсия 26 — четыре тормозных диска с 72 сквозными отверстиями на каждом, всего 288. Толщина 16 мм, диаметр отверстий 8,6 мм — визуальная реконструкция, не заводские размеры. Исправлены нормали лицевых поверхностей: устранены волнистые блики у отверстий. Сохранены суппорта, кузов, остальные сетки и семь анимаций. '+f"{stats['objects']} сеток, {stats['vertices']} вершин, {stats['triangles']} треугольников, {stats['MiB']} МиБ. Новых генераций 3D нет. Локальные нейросети отключены по запросу пользователя. Изменения в GitHub не отправлялись.\n"
notes.write_text(text, encoding='utf-8')
print('Verified four exported perforated rotors, flat cap normals, unchanged non-brake meshes and seven animations.')
