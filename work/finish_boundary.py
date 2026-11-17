"""Cut the old and new C-pillar skins at a shared exact boundary."""
import json,struct
from pathlib import Path
import numpy as np
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb');b=P.read_bytes();l=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+l]);blob=bytearray(b[28+l:]);old=json.loads(json.dumps(d))
def read(i):
 a=d['accessors'][i];bv=d['bufferViews'][a['bufferView']];w=3 if a['type']=='VEC3' else 1;typ={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
 return np.frombuffer(blob,dtype=typ,count=a['count']*w,offset=bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w).copy().astype(float)
def add(a,kind='VEC3'):
 a=np.ascontiguousarray(a,dtype='<f4' if kind=='VEC3' else '<u4');blob.extend(b'\0'*(-len(blob)%4));o=len(blob);blob.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':a.nbytes});ai=len(d['accessors']);item={'bufferView':vi,'componentType':5126 if kind=='VEC3' else 5125,'count':len(a),'type':kind}
 if kind=='VEC3':item.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 d['accessors'].append(item);return ai

def clip(poly,axis,edge,le=True):
 out=[]
 if not poly:return out
 for i,a in enumerate(poly):
  z=poly[(i+1)%len(poly)];fa=(a[0][axis]-edge)*(1 if le else -1);fb=(z[0][axis]-edge)*(1 if le else -1)
  if fa<=0:out.append(a)
  if (fa<=0)!=(fb<=0):
   t=fa/(fa-fb);out.append((a[0]+t*(z[0]-a[0]),a[1]+t*(z[1]-a[1])))
 return out
changed=[]
for m in d['meshes']:
 name=m.get('name','');new=name.startswith('Rear_shoulder_continuous_');retained=name.startswith(('Rear_C_pillar_inner_fairing_','Cabin_pillars_and_roof_rail_'))
 if not(new or retained):continue
 for index,p in enumerate(m['primitives']):
  if new and index!=0:continue
  v=read(p['attributes']['POSITION']);n=read(p['attributes']['NORMAL']);f=read(p['indices']).astype(int).reshape(-1,3);V=[];N=[];F=[]
  for face in f:
   poly=[(v[i],n[i]) for i in face]
   if new:parts=[clip(clip(poly,0,-1.62,True),1,1.18,True)]
   else:parts=[clip(poly,0,-1.62,False),clip(clip(poly,0,-1.62,True),1,1.18,False)]
   for part in parts:
    if len(part)<3:continue
    off=len(V);V.extend(a[0] for a in part);N.extend(a[1] for a in part)
    for k in range(1,len(part)-1):F.append([off,off+k,off+k+1])
  V=np.array(V);N=np.array(N);F=np.array(F);N/=np.maximum(np.linalg.norm(N,axis=1)[:,None],1e-12)
  p['attributes']['POSITION']=add(V);p['attributes']['NORMAL']=add(N);p['indices']=add(F.reshape(-1,1),'SCALAR');changed.append((name,index))
assert d['nodes']==old['nodes'] and d['animations']==old['animations']
d['buffers'][0]['byteLength']=len(blob);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Exact shared boundaries:',changed)
