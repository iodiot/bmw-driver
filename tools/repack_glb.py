"""Remove unreachable GLB export data without changing used buffers or scene content."""
import argparse
import copy
import json
import struct
from pathlib import Path


def repack(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw, 0) == (b'glTF', 2, len(raw))
    length = struct.unpack_from('<I', raw, 12)[0]
    original = json.loads(raw[20:20 + length])
    binary = raw[28 + length:]
    if original.get('extensionsUsed'):
        raise ValueError('Extension references must be reviewed before repacking')
    doc = copy.deepcopy(original)
    mesh_ids = sorted({node['mesh'] for node in doc['nodes'] if 'mesh' in node})
    meshes = {old: new for new, old in enumerate(mesh_ids)}
    doc['meshes'] = [doc['meshes'][i] for i in mesh_ids]
    for node in doc['nodes']:
        if 'mesh' in node:
            node['mesh'] = meshes[node['mesh']]
    refs = []
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            refs.extend((primitive['attributes'], key) for key in primitive['attributes'])
            if 'indices' in primitive:
                refs.append((primitive, 'indices'))
            for target in primitive.get('targets', []):
                refs.extend((target, key) for key in target)
    for animation in doc.get('animations', []):
        for sampler in animation['samplers']:
            refs.extend([(sampler, 'input'), (sampler, 'output')])
    for skin in doc.get('skins', []):
        if 'inverseBindMatrices' in skin:
            refs.append((skin, 'inverseBindMatrices'))
    accessor_ids = sorted({container[key] for container, key in refs})
    accessors = {old: new for new, old in enumerate(accessor_ids)}
    for container, key in refs:
        container[key] = accessors[container[key]]
    doc['accessors'] = [doc['accessors'][i] for i in accessor_ids]
    views_refs = []
    for accessor in doc['accessors']:
        if 'bufferView' in accessor:
            views_refs.append((accessor, 'bufferView'))
        if 'sparse' in accessor:
            views_refs.extend([(accessor['sparse']['indices'], 'bufferView'),
                               (accessor['sparse']['values'], 'bufferView')])
    for item in doc.get('images', []):
        if 'bufferView' in item:
            views_refs.append((item, 'bufferView'))
    view_ids = sorted({container[key] for container, key in views_refs})
    views = {old: new for new, old in enumerate(view_ids)}
    for container, key in views_refs:
        container[key] = views[container[key]]
    packed = bytearray()
    doc['bufferViews'] = []
    for index in view_ids:
        view = copy.deepcopy(original['bufferViews'][index])
        assert view.get('buffer', 0) == 0
        offset = view.get('byteOffset', 0)
        content = binary[offset:offset + view['byteLength']]
        assert len(content) == view['byteLength']
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'] = len(packed)
        packed.extend(content)
        doc['bufferViews'].append(view)
    doc['buffers'] = [{'byteLength': len(packed)}]
    # Every reachable data block must remain byte-for-byte identical.
    for old, new in views.items():
        a, b = original['bufferViews'][old], doc['bufferViews'][new]
        old_offset, new_offset = a.get('byteOffset', 0), b['byteOffset']
        assert binary[old_offset:old_offset + a['byteLength']] == packed[new_offset:new_offset + b['byteLength']]
        assert {k: v for k, v in a.items() if k != 'byteOffset'} == {k: v for k, v in b.items() if k != 'byteOffset'}
    for old, new in accessors.items():
        a = copy.deepcopy(original['accessors'][old])
        if 'bufferView' in a:
            a['bufferView'] = views[a['bufferView']]
        if 'sparse' in a:
            for kind in ['indices', 'values']:
                a['sparse'][kind]['bufferView'] = views[a['sparse'][kind]['bufferView']]
        assert a == doc['accessors'][new]
    for a, b in zip(original['nodes'], doc['nodes']):
        expected = copy.deepcopy(a)
        if 'mesh' in expected:
            expected['mesh'] = meshes[expected['mesh']]
        assert expected == b
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    packed.extend(b'\0' * (-len(packed) % 4))
    output = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(packed))
              + struct.pack('<I4s', len(encoded), b'JSON') + encoded
              + struct.pack('<I4s', len(packed), b'BIN\0') + packed)
    temporary = path.with_suffix('.repack.tmp')
    temporary.write_bytes(output)
    temporary.replace(path)
    print(f'{len(raw):,} -> {len(output):,} bytes; {len(views)} reachable buffer views verified unchanged')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    repack(parser.parse_args().path)
