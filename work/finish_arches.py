"""Reduce exposed painted arch returns and extend the dark liners to them."""
import json,struct
from pathlib import Path
import numpy as np
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb');b=P.read_bytes();l=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+l]);blob=bytearray(b[28+l:])
def read(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w=3 if a['type']=='VEC3' else 1;typ={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
 return np.frombuffer(blob,dtype=typ,count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w).copy()
def add(a):
 a=np.ascontiguousarray(a,dtype='<f4');blob.extend(b'\0'*(-len(blob)%4));o=len(blob);blob.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':a.nbytes});ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(0).tolist(),'max':a.max(0).tolist()});return ai
changed=[]
for m in d['meshes']:
 name=m.get('name','')
 if not any(name.startswith(k) for k in ['Front_arch_folded_lip_','Rear_arch_folded_lip_','Front_wheelhouse_tunnel_','Rear_wheelhouse_tunnel_']):continue
 for pr in m['primitives']:
  v=read(pr['attributes']['POSITION']).astype(float);f=read(pr['indices']).reshape(-1,3);sign=1 if v[:,2].mean()>0 else -1
  cols=9 if 'folded_lip' in name else 21
  assert len(v)%cols==0,name
  grid=v.reshape(-1,cols,3)
  if cols==9:
   outer=grid[:,0,2].copy();grid[:,:,2]=outer[:,None]-sign*.008*np.linspace(0,1,cols)[None,:]
  else:grid[:,:,2]+=sign*.024*(1-np.linspace(0,1,cols))[None,:]
  n=np.zeros_like(v);fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
  for k in range(3):np.add.at(n,f[:,k],fn)
  n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
  pr['attributes']['POSITION']=add(v);pr['attributes']['NORMAL']=add(n);changed.append(name)
d['buffers'][0]['byteLength']=len(blob);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Painted arch returns reduced from 32 to 8 mm, matching liners:',changed)
