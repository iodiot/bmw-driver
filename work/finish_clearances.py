"""Keep simplified chassis/seat meshes behind their wheelhouse liners."""
import json,struct
from pathlib import Path
import numpy as np
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb');raw=P.read_bytes();l=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+l]);blob=bytearray(raw[28+l:]);old=json.loads(json.dumps(d))
def read(i):
 a=d['accessors'][i];bv=d['bufferViews'][a['bufferView']];w=3 if a['type']=='VEC3' else 1;typ={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
 return np.frombuffer(blob,dtype=typ,count=a['count']*w,offset=bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w).copy()
def add(a,kind='VEC3'):
 a=np.ascontiguousarray(a,dtype='<f4' if kind=='VEC3' else '<u4');blob.extend(b'\0'*(-len(blob)%4));o=len(blob);blob.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':a.nbytes});ai=len(d['accessors']);a0={'bufferView':vi,'componentType':5126 if kind=='VEC3' else 5125,'count':len(a),'type':kind}
 if kind=='VEC3':a0.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 d['accessors'].append(a0);return ai

def flat(v,f,mat):
 points=v[f].reshape(-1,3);fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]);fn/=np.maximum(np.linalg.norm(fn,axis=1)[:,None],1e-12);n=np.repeat(fn,3,axis=0)
 return {'attributes':{'POSITION':add(points),'NORMAL':add(n)},'indices':add(np.arange(len(points)).reshape(-1,1),'SCALAR'),'material':mat,'mode':4}
def loft(rings):
 v=np.array(rings).reshape(-1,3);f=[];count=len(rings)
 for r in range(count-1):
  for k in range(4):
   a=r*4+k;b=r*4+(k+1)%4;c=a+4;e=b+4;f.extend([[a,b,c],[b,e,c]])
 f.extend([[0,2,1],[0,3,2]])
 o=(count-1)*4;f.extend([[o,o+1,o+2],[o,o+2,o+3]])
 f=np.array(f)
 volume=np.sum(np.einsum('ij,ij->i',v[f[:,0]],np.cross(v[f[:,1]],v[f[:,2]])))/6
 if volume<0:f=f[:,::-1]
 return v,f
changed=[]
for mesh in d['meshes']:
 name=mesh.get('name','')
 if name.startswith(('Chassis_front_rail_','Strut_top_mount_')):
  for p in mesh['primitives']:
   v=read(p['attributes']['POSITION']).astype(float);sign=1 if v[:,2].mean()>0 else -1;target=.44 if name.startswith('Strut') else .4465;v[:,2]+=sign*target-v[:,2].mean();p['attributes']['POSITION']=add(v)
  changed.append(name)
 if name=='Cabin_floor':
  rings=[]
  for x,w in [(-1.53,.52),(-1.075,.52),(-.97,.775),(.53,.775)]:rings.append([[x,.2775,-w],[x,.3225,-w],[x,.3225,w],[x,.2775,w]])
  v,f=loft(rings);mesh['primitives']=[flat(v,f,mesh['primitives'][0]['material'])];changed.append(name)
 if name=='Rear_seat_cushion':
  rings=[]
  for x,w in [(-1.325,.52),(-1.075,.52),(-1.005,.655),(-.855,.655)]:rings.append([[x,.425,-w],[x,.555,-w],[x,.555,w],[x,.425,w]])
  v,f=loft(rings);mesh['primitives']=[flat(v,f,mesh['primitives'][0]['material'])];changed.append(name)
 if name=='Rear_seat_back':
  rings=[]
  for y,w in [(.535,.52),(.775,.52),(.835,.645),(.965,.645)]:rings.append([[-1.38,y,-w],[-1.26,y,-w],[-1.26,y,w],[-1.38,y,w]])
  v,f=loft(rings);mesh['primitives']=[flat(v,f,mesh['primitives'][0]['material'])];changed.append(name)
assert d['nodes']==old['nodes'] and d['animations']==old['animations']
d['buffers'][0]['byteLength']=len(blob);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Removed wheelhouse intrusions:',changed)
