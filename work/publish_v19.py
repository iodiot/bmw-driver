from pathlib import Path
import json,struct
P=Path('outputs/bmw-viewer');raw=(P/'bmw-opening-panels-v18.glb').read_bytes();L=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+L]);binary=raw[20+L:]
d['asset']['extras'].update({'version':19,'parent_version':18,'finish':'Controlled dark paint highlights and tinted directional cloud reflections; geometry and animation unchanged'})
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4);out=struct.pack('<4sII',b'glTF',2,20+len(j)+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+binary
(P/'bmw-materials-v19.glb').write_bytes(out)
s=(P/'viewer-v18.js').read_text(encoding='utf-8').replace('bmw-opening-panels-v18.glb','bmw-materials-v19.glb');(P/'viewer-v19.js').write_text(s,encoding='utf-8')
s=(P/'car-v18.html').read_text(encoding='utf-8').replace('viewer-v18.js?revision=2','viewer-v19.js');(P/'car-v19.html').write_text(s,encoding='utf-8');(P/'index.html').write_text(s,encoding='utf-8')
st=json.loads(Path('outputs/car-v18-statistics.json').read_text());st.update({'version':19,'bytes':len(out),'MiB':round(len(out)/1048576,3),'method':'Material refinement only; geometry, hinges and animations unchanged; no new SF3D generation','parent_version':18});Path('outputs/car-v19-statistics.json').write_text(json.dumps(st,indent=2))
p=Path('outputs/model-statistics.json');data=json.loads(p.read_text(encoding='utf-8'));data['detailed_construction']=[x for x in data['detailed_construction'] if x.get('version')!=19]+[st];p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(st))
