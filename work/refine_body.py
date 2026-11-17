"""Repair body junctions against the BMW F10 M5 four-view dimension sheet.
Preserve scene hierarchy, wheel assemblies, doors and animation channels.
The corrections are a visual reconstruction, not original BMW CAD surfaces.
"""
import argparse,json,struct
from pathlib import Path
import numpy as np
from scipy.interpolate import PchipInterpolator

ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path);args=ap.parse_args()
target=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb')
raw=(args.source or target).read_bytes();ln=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+ln]);blob=bytearray(raw[28+ln:]);before=json.loads(json.dumps(doc))
parents={child:i for i,n in enumerate(doc['nodes']) for child in n.get('children',[])}
def matrix(i):
 n=doc['nodes'][i]
 if 'matrix' in n:a=np.array(n['matrix']).reshape(4,4).T
 else:
  a=np.eye(4);a[:3,3]=n.get('translation',[0,0,0]);a[:3,:3]*=n.get('scale',[1,1,1])
  if 'rotation' in n:
   from scipy.spatial.transform import Rotation
   a[:3,:3]=Rotation.from_quat(n['rotation']).as_matrix()@a[:3,:3]
 return matrix(parents[i])@a if i in parents else a

def read(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 off=v.get('byteOffset',0)+a.get('byteOffset',0)
 if v.get('byteStride'):
  return np.ndarray((a['count'],width),dtype=dtype,buffer=blob,offset=off,strides=(v['byteStride'],np.dtype(dtype).itemsize)).copy()
 return np.frombuffer(blob,dtype=dtype,count=a['count']*width,offset=off).copy().reshape(-1,width)
def add(array,kind):
 a=np.ascontiguousarray(array,dtype='<u4' if kind=='SCALAR' else '<f4');blob.extend(b'\0'*(-len(blob)%4));off=len(blob);blob.extend(a.tobytes())
 vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes})
 ai=len(doc['accessors']);d={'bufferView':vi,'componentType':5125 if kind=='SCALAR' else 5126,'count':len(a),'type':kind}
 if kind=='VEC3':d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 doc['accessors'].append(d);return ai

def transform(v,T):return np.einsum('ni,ji->nj',v,T[:3,:3])+T[:3,3]
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def curve(v):
 v=v.copy();x,y,z=v.T.copy();edge=(np.abs(z)/.946)**4
 v[:,0]-=.045*smooth(1.65,2.318,x)*edge
 v[:,0]+=.045*smooth(1.95,2.592,-x)*edge
 v[:,1]+=.055*smooth(1.94,2.592,-x)*smooth(.85,1.03,y)
 v[:,1]+=.012*smooth(1.7,2.3,x)*smooth(.65,.94,np.abs(z))*(1-smooth(.25,.55,y))
 return v

def glazing(v,rear=False):
 v=v.copy();x,y,z=v.T
 t=np.clip((y-1.0)/.38,0,1)
 if rear:
  t=np.clip((y-1.09)/.282,0,1)
  for _ in range(4):
   s=np.clip(z/(.795*(1-t)+.635*t),-1,1)
   t=np.clip((y-(1.095-.015*s*s))/(.277-.020*s*s),0,1)
  v[:,0]-=.055*t**5
 else:
  for _ in range(4):
   s=np.clip(z/(.811*(1-t)+.635*t),-1,1)
   t=np.clip((y-(1.012-.032*s*s))/(.370-.002*s*s),0,1)
  v[:,0]+=.060*t**5
 return v

def warp(v,name):
 v=curve(v)
 if name.startswith('Windshield') and name not in ['Windshield_painted_header','Windshield_cowl']:v=glazing(v)
 if name.startswith('Rear_windshield') and name!='Rear_windshield_painted_header':v=glazing(v,True)
 if name.startswith('Rear_bumper_lower_return'):
  # Hide the return inside the bumper instead of exposing a long bottom blade.
  v[:,1]=np.maximum(v[:,1],.185);v[:,2]=np.clip(v[:,2],-.905,.905)
 return v

def normals(v,f):
 n=np.zeros_like(v);a=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
 for k in range(3):np.add.at(n,f[:,k],a)
 length=np.linalg.norm(n,axis=1);n/=np.maximum(length[:,None],1e-14)
 return n

def new_primitive(v,f,mat):
 return {'attributes':{'POSITION':add(v,'VEC3'),'NORMAL':add(normals(v,f),'VEC3')},'indices':add(np.array(f).reshape(-1,1),'SCALAR'),'material':mat,'mode':4}

def grid(rows):
 v=np.array(rows);r,c=v.shape[:2];a=(np.arange(r-1)[:,None]*c+np.arange(c-1)[None,:]).ravel()
 f=np.concatenate([np.column_stack([a,a+1,a+c]),np.column_stack([a+1,a+c+1,a+c])])
 v=v.reshape(-1,3)
 if np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])[:,1].mean()<0:f=f[:,::-1]
 return v,f

roofH=PchipInterpolator([-1.40,-1.30,-1.08,-.55,-.08,.21,.30],[1.35,1.407,1.435,1.451,1.438,1.414,1.36])
roofrows=[]
for t in np.linspace(0,1,129):
 s=np.linspace(-1,1,97);x=(.21-.25*s*s)*(1-t)+(-1.30+.08*s*s)*t
 roofrows.append(np.column_stack([x,roofH(x)-.040*s*s,s*(.615+.005*np.sin(np.pi*t))]))
rv,rf=grid(roofrows)
# Thin roof skin with smooth exterior and separately shaded edge returns.
N=len(rv);under=rv-[0,.003,0]
edges=np.sort(np.concatenate([rf[:,[0,1]],rf[:,[1,2]],rf[:,[2,0]]]),axis=1)
u,c=np.unique(edges,axis=0,return_counts=True);boundary=u[c==1]
wallfaces=np.concatenate([np.column_stack([boundary[:,0],boundary[:,1],boundary[:,0]+N]),np.column_stack([boundary[:,1],boundary[:,1]+N,boundary[:,0]+N])])
replacements={'Roof':[(rv,rf),(under,rf[:,::-1]),(np.vstack([rv,under]),wallfaces)]}
for rear,name in [(False,'Windshield_painted_header'),(True,'Rear_windshield_painted_header')]:
 rows=[]
 for q in np.linspace(0,1,17):
  s=np.linspace(-1,1,97);a=np.abs(s)
  if rear:
   x=-1.30+.08*a*a;y=1.372-.035*a*a;gx=x-.055
   end=np.array(roofrows[-1])
  else:
   x=.21-.25*a*a;y=1.382-.034*a*a;gx=x+.060
   end=np.array(roofrows[0])
  glass=np.column_stack([gx,y,s*.635])
  rows.append(glass*(1-q)+end*q)
 v,f=grid(rows)
 # Close the small side triangles where the raked header meets the A/C pillars.
 caps=[]
 for sign in [-1,1]:
  if rear:
   old=np.array([-1.22,1.337,sign*.635]);base=np.array([-1.275,1.337,sign*.635]);end=np.array(roofrows[-1][0 if sign<0 else -1])
  else:
   old=np.array([-.04,1.348,sign*.635]);base=np.array([.02,1.348,sign*.635]);end=np.array(roofrows[0][0 if sign<0 else -1])
  tri=np.array([old,base,end]);face=np.array([[0,1,2]])
  if np.cross(tri[1]-tri[0],tri[2]-tri[0])[2]*sign<0:face=face[:,::-1]
  caps.append((tri,face))
 replacements[name]=[(v,f)]+caps

changed=[];removed=[];used=set()
for ni,node in enumerate(doc['nodes']):
 if 'mesh' not in node:continue
 name=node.get('name','');mi=node['mesh'];T=matrix(ni);mesh=doc['meshes'][mi]
 if any(doc['nodes'][i].get('name','').startswith(('Steering_','Rear_mount_','Wheel_spin_')) for i in [ni]+list([])):
  continue
 ancestor=ni;wheel=False
 while ancestor in parents:
  ancestor=parents[ancestor]
  if doc['nodes'][ancestor].get('name','').startswith(('Steering_','Rear_mount_','Wheel_spin_')):wheel=True;break
 if wheel or mi in used:continue
 used.add(mi)
 if 'wheelhouse_kick_' in name:
  # The old planar kick panels protruded below the body as sharp fins.
  del node['mesh'];removed.append(name);continue
 if name in replacements:
  mat=mesh['primitives'][0].get('material',11)
  inv=np.linalg.inv(T);mesh['primitives']=[new_primitive(transform(v,inv),f,mat) for v,f in replacements[name]]
  if name.endswith('_painted_header'):
   # Use the continuous roof's shading field through the small side closures;
   # independent triangle normals otherwise make these joins look like plates.
   for pr,(v,f) in zip(mesh['primitives'],replacements[name]):
    nn=np.column_stack([-roofH.derivative()(np.clip(v[:,0],-1.40,.30)),np.ones(len(v)),.08*v[:,2]/(.62*.62)])
    nn=np.einsum('ni,ij->nj',nn,T[:3,:3]);nn/=np.linalg.norm(nn,axis=1)[:,None]
    pr['attributes']['NORMAL']=add(nn,'VEC3')
  mesh.pop('extras',None);changed.append(name);continue
 for pr in mesh.get('primitives',[]):
  if 'POSITION' not in pr['attributes']:continue
  local=read(pr['attributes']['POSITION']);world=transform(local,T)
  out=warp(world,name)
  if np.max(abs(out-world))<1e-7:continue
  pr['attributes']['POSITION']=add(transform(out,np.linalg.inv(T)),'VEC3')
  if 'NORMAL' in pr['attributes']:
   n=read(pr['attributes']['NORMAL']);nw=np.einsum('ni,ij->nj',n,np.linalg.inv(T[:3,:3]))
   h=1e-5;J=np.stack([(warp(world+np.eye(3)[k]*h,name)-warp(world-np.eye(3)[k]*h,name))/(2*h) for k in range(3)],axis=2)
   # Use the inverse-transpose deformation for continuous original shading.
   nn=np.einsum('nij,nj->ni',np.linalg.pinv(J).transpose(0,2,1),nw)
   nn=np.einsum('ni,ij->nj',nn,T[:3,:3]);nn/=np.maximum(np.linalg.norm(nn,axis=1)[:,None],1e-12)
   pr['attributes']['NORMAL']=add(nn,'VEC3')
  if name not in changed:changed.append(name)
# Repair the one measured asymmetrical rear lamp/body corner as an exact pair.
nodes={n.get('name'):i for i,n in enumerate(doc['nodes'])}
left='Rear_quarter_lamp_panel_lid_corner_Left';right=left.replace('Left','Right')
if left in nodes and right in nodes:
 li,ri=nodes[left],nodes[right];lm=doc['meshes'][doc['nodes'][li]['mesh']];rm=doc['meshes'][doc['nodes'][ri]['mesh']]
 LT,RT=matrix(li),matrix(ri);parts=[]
 for pr in rm['primitives']:
  w=transform(read(pr['attributes']['POSITION']),RT);w[:,2]*=-1
  v=transform(w,np.linalg.inv(LT));f=read(pr['indices']).reshape(-1,3)[:,::-1]
  parts.append(new_primitive(v,f,pr.get('material',11)))
 lm['primitives']=parts;changed.append(left)
assert doc['animations']==before['animations']
for a,b in zip(doc['nodes'],before['nodes']):
 assert {k:v for k,v in a.items() if k!='mesh'}=={k:v for k,v in b.items() if k!='mesh'}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
target.write_bytes(result)
print(json.dumps({'repaired_meshes':len(changed),'removed_protruding_inner_panels':removed,'roof_and_headers_rebuilt':list(replacements),'bytes':len(result),'animations_preserved':len(doc['animations'])},indent=2))
