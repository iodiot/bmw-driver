from pathlib import Path
import json,struct,copy
root=Path(__file__).resolve().parents[1];out=root/'outputs/bmw-viewer'
b=(out/'bmw-surface-wheel-v12.glb').read_bytes();length=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+length]);binary=b[20+length:]
changed=0
for node in doc['nodes']:
    name=node.get('name','')
    if 'mesh' not in node or not any(s in name for s in ('Rim_','Spoke_','Hub_')):continue
    for primitive in doc['meshes'][node['mesh']]['primitives']:
        mat=copy.deepcopy(doc['materials'][primitive['material']]);mat['name']='Machined aluminium'
        p=mat.setdefault('pbrMetallicRoughness',{});p['baseColorFactor']=[.36,.39,.43,1];p['metallicFactor']=1;p['roughnessFactor']=.30
        if 'Rim_' in name:p['baseColorFactor']=[.29,.32,.36,1];p['roughnessFactor']=.32
        doc['materials'].append(mat);primitive['material']=len(doc['materials'])-1;changed+=1
doc['asset'].setdefault('extras',{}).update(version=13,wheel_finish='Grey machined aluminium, metallic=1, roughness=.30')
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
result=struct.pack('<4sII',b'glTF',2,20+len(j)+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+binary
(out/'bmw-aluminum-v13.glb').write_bytes(result)
p=out/'car-v12.html';s=p.read_text(encoding='utf-8').replace('bmw-surface-wheel-v12.glb','bmw-aluminum-v13.glb').replace('bmw-asphalt-v12.png','bmw-aluminum-v13.png')
s=s.replace('<a href="front-v6.html">Hood detail</a>','<a href="bmw-rear-concept.png" target="_blank">Rear reference</a>')
(out/'car-v13.html').write_text(s,encoding='utf-8');(out/'index.html').write_text(s,encoding='utf-8')
stats={'version':13,'modified_meshes':changed,'bytes':len(result),'MiB':round(len(result)/1048576,3),'method':'Aluminium wheel material adjustment only; topology unchanged','rear_concept':'Separate generated image based on real BMW M5 F10; not applied to mesh'}
(root/'outputs/car-v13-statistics.json').write_text(json.dumps(stats,indent=2));print(stats)
