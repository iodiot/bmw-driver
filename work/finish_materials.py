"""Correct non-metallic trim materials that relied on glTF's metallic default."""
import json,struct
from pathlib import Path
p=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb');raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);blob=raw[28+n:]
nonmetal={'Body seams','Rear black trim','Panel joints','Black leather trim','Panel recess rubber','Closed wheelhouse felt','Rear panel joint rubber','Window EPDM seal','Black ceramic glass border','Black seals','Taillamp perimeter gasket','Taillamp molded housing','Headlight housing','M side stripe 0','M side stripe 1','M side stripe 2'}
changed=[]
for m in d['materials']:
 if m.get('name')=='Grille black':m['pbrMetallicRoughness'].update(metallicFactor=0,roughnessFactor=.52)
for m in d['materials']:
 if m.get('name') not in nonmetal:continue
 pbr=m.setdefault('pbrMetallicRoughness',{})
 if pbr.get('metallicFactor',1)!=0:changed.append(m.get('name'))
 pbr['metallicFactor']=0
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
p.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Corrected dielectric materials:',changed)
