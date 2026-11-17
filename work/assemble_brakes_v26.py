"""Replace four brake meshes without re-exporting the animated car scene."""
import json
import struct
import sys
from pathlib import Path
sys.path.insert(0, str(Path('work').resolve()))
import numpy as np
from perforated_brakes_v26 import build_rotor

P = Path('outputs/bmw-viewer')

def main():
    raw = (P/'bmw-window-frames-v25.glb').read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length])
    blob = bytearray(raw[28+length:])
    original_blob = bytes(blob)
    original = json.loads(json.dumps(doc))

    def accessor(array, kind, component):
        array = np.ascontiguousarray(array)
        blob.extend(b'\0' * (-len(blob) % 4))
        offset = len(blob)
        blob.extend(array.tobytes())
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': array.nbytes})
        index = len(doc['accessors'])
        item = {'bufferView': view, 'componentType': component, 'count': len(array), 'type': kind}
        if kind == 'VEC3':
            item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        doc['accessors'].append(item)
        return index

    metrics = {}
    for mesh in doc['meshes']:
        if 'Drilled_brake_rotor' not in mesh.get('name', ''):
            continue
        old = mesh['primitives'][0]
        position = doc['accessors'][old['attributes']['POSITION']]
        lower, upper = position['min'], position['max']
        rotor, measured = build_rotor((upper[0]-lower[0])/2, lower[2], upper[2])
        # Separate cap normals from the cylindrical hole walls.
        vertices = rotor.vertices[rotor.faces].reshape(-1, 3)
        normals = np.repeat(rotor.face_normals, 3, axis=0)
        mesh['primitives'] = [{
            'attributes': {'POSITION': accessor(np.asarray(vertices, dtype='<f4'), 'VEC3', 5126),
                           'NORMAL': accessor(np.asarray(normals, dtype='<f4'), 'VEC3', 5126)},
            'indices': accessor(np.arange(len(vertices), dtype='<u4'), 'SCALAR', 5125),
            'material': old['material'], 'mode': 4,
        }]
        metrics[mesh['name']] = measured
    assert len(metrics) == 4
    assert len(doc['animations']) == 7
    assert bytes(blob[:len(original_blob)]) == original_blob
    for key in ['nodes', 'animations', 'materials', 'scenes', 'scene']:
        assert doc.get(key) == original.get(key), key
    for before, after in zip(original['meshes'], doc['meshes']):
        if 'Drilled_brake_rotor' not in before.get('name', ''):
            assert before == after
    doc['buffers'][0]['byteLength'] = len(blob)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    blob.extend(b'\0' * (-len(blob) % 4))
    output = (struct.pack('<4sII', b'glTF', 2, 28+len(encoded)+len(blob))
              + struct.pack('<I4s', len(encoded), b'JSON') + encoded
              + struct.pack('<I4s', len(blob), b'BIN\0') + blob)
    (P/'bmw-perforated-brakes-v26.glb').write_bytes(output)
    primitives = [p for m in doc['meshes'] for p in m['primitives']]
    stats = {'version': 26, 'method': 'Procedural drilled rotors; local-model draft reviewed and corrected',
             'objects': len(doc['meshes']),
             'vertices': sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives),
             'triangles': sum(doc['accessors'][p['indices']]['count']//3 for p in primitives),
             'bytes': len(output), 'MiB': round(len(output)/1048576, 3),
             'rotors': 4, 'holes_per_rotor': 72, 'total_through_holes': 288,
             'hole_diameter_mm': 8.6, 'thickness_mm': 16, 'animation_clips': 7,
             'wheel_spin_groups': 4, 'new_3d_generations': 0,
             'note': 'Visual reconstruction; hole dimensions are not factory specifications.'}
    Path('outputs/car-v26-statistics.json').write_text(json.dumps(stats, indent=2))
    Path('outputs/car-v26-verification.json').write_text(json.dumps({
        'rotors': metrics, 'original_binary_prefix_preserved': True,
        'nodes_animations_materials_and_non_brake_meshes_unchanged': True,
    }, indent=2))
    js = (P/'viewer-v25.js').read_text(encoding='utf-8')
    js = js.replace('./bmw-window-frames-v25.glb?revision=final', './bmw-perforated-brakes-v26.glb?revision=2')
    js = js.replace("dataset.version=compareBefore?'24':'25'", "dataset.version=compareBefore?'24':'26'")
    js = js.replace('controls.enableDamping=true;', "if(detailMode==='wheel'){camera.position.set(1.482,.48,2.0);controls.target.set(1.482,.34675,.8135);}\ncontrols.enableDamping=true;")
    (P/'viewer-v26.js').write_text(js, encoding='utf-8')
    html = (P/'car-v25.html').read_text(encoding='utf-8').replace('viewer-v25.js?revision=final', 'viewer-v26.js?revision=2').replace('viewer-v26.js?revision=1', 'viewer-v26.js?revision=2')
    for name in ['car-v26.html', 'index.html', 'car-v25.html']:
        (P/name).write_text(html, encoding='utf-8')
    print(json.dumps(stats))

if __name__ == '__main__':
    main()
