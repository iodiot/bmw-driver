"""Match the remaining rear skin boundary and clean up the four exhaust tips."""
import json,struct
from pathlib import Path
import numpy as np
import trimesh
from scipy.interpolate import LinearNDInterpolator
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb');raw=P.read_bytes();l=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+l]);blob=bytearray(raw[28+l:]);old=json.loads(json.dumps(d));s=trimesh.load(P,force='scene',process=False)
def read(i):
 a=d['accessors'][i];bv=d['bufferViews'][a['bufferView']];w=3 if a['type']=='VEC3' else 1;typ={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
 return np.frombuffer(blob,dtype=typ,count=a['count']*w,offset=bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w).copy().astype(float)
def add(a,kind='VEC3'):
 a=np.ascontiguousarray(a,dtype='<f4' if kind=='VEC3' else '<u4');blob.extend(b'\0'*(-len(blob)%4));o=len(blob);blob.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':a.nbytes});ai=len(d['accessors']);item={'bufferView':vi,'componentType':5126 if kind=='VEC3' else 5125,'count':len(a),'type':kind}
 if kind=='VEC3':item.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 d['accessors'].append(item);return ai

def trans(v,T):return np.einsum('ni,ji->nj',v,T[:3,:3])+T[:3,3]
def smooth(a,b,x):
 q=np.clip((x-a)/(b-a),0,1);return q*q*(3-2*q)
nodes={n.get('name'):n for n in d['nodes']}
def source_field(name,axes,component,normal_component):
 T=s.graph[name][0];p=d['meshes'][nodes[name]['mesh']]['primitives'][0];v=trans(read(p['attributes']['POSITION']),T);n=np.einsum('ni,ij->nj',read(p['attributes']['NORMAL']),np.linalg.inv(T[:3,:3]));mask=(n[:,normal_component]>.25)&(v[:,0]>-1.80)&(v[:,0]<-1.40)
 v=v[mask];n=n[mask];_,ids=np.unique(np.round(v[:,axes],6),axis=0,return_index=True);v=v[ids];n=n[ids]
 return LinearNDInterpolator(v[:,axes],v[:,component]),LinearNDInterpolator(v[:,axes],n)
sidefield,sidenormal=source_field('Body_door_jambs_Right',[0,1],2,2)
upperfield,uppernormal=source_field('Rear_C_pillar_inner_fairing_Right',[0,2],1,1)
joined=0
for label,sign in [('Left',1),('Right',-1)]:
 name='Rear_shoulder_continuous_'+label;T=s.graph[name][0];inv=np.linalg.inv(T);mesh=d['meshes'][nodes[name]['mesh']]
 for index,pr in enumerate(mesh['primitives'][:2]):
  v=trans(read(pr['attributes']['POSITION']),T);n=np.einsum('ni,ij->nj',read(pr['attributes']['NORMAL']),np.linalg.inv(T[:3,:3]));w=smooth(-1.69,-1.62,v[:,0]);
  if index==0:w=np.maximum(w,smooth(1.13,1.18,v[:,1]))
  ids=np.flatnonzero(w>0)
  if not len(ids):continue
  if index==0:
   uv=np.column_stack([v[ids,0],abs(v[ids,2])]);target=upperfield(uv);tn=uppernormal(uv);component=1
  else:
   uv=v[ids,:2];target=sidefield(uv);tn=sidenormal(uv);component=2
  valid=np.isfinite(target)&np.isfinite(tn).all(1);ids=ids[valid];target=target[valid];tn=tn[valid]
  if not len(ids):continue
  if component==2:target=(target+.0002)*sign
  else:target+=.0001
  tn[:,2]*=sign
  ww=w[ids];v[ids,component]=v[ids,component]*(1-ww)+target*ww
  n[ids]=n[ids]*(1-ww[:,None])+tn*ww[:,None];n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
  pr['attributes']['POSITION']=add(trans(v,inv));pr['attributes']['NORMAL']=add(np.einsum('ni,ij->nj',n,T[:3,:3]));joined+=len(ids)
# Exhaust mouths: round open tubes with separate satin metal lips and dark bores.
steel=len(d['materials']);d['materials'].append({'name':'Satin exhaust tip steel','pbrMetallicRoughness':{'baseColorFactor':[.30,.32,.35,1],'metallicFactor':.9,'roughnessFactor':.28}})
inside=len(d['materials']);d['materials'].append({'name':'Exhaust inner bore','pbrMetallicRoughness':{'baseColorFactor':[.008,.009,.011,1],'metallicFactor':.1,'roughnessFactor':.8},'doubleSided':True})
def primitive(v,f,normal,mat):return {'attributes':{'POSITION':add(v),'NORMAL':add(normal)},'indices':add(f.reshape(-1,1),'SCALAR'),'material':mat,'mode':4}
def tube(xrings,rings,cy,cz,mat,reverse=False):
 N=96;v=[];norm=[];f=[]
 for x,r in zip(xrings,rings):
  for i in range(N):
   a=i*2*np.pi/N;v.append([x,cy+r*np.sin(a),cz+r*np.cos(a)]);norm.append([0,np.sin(a)*(-1 if reverse else 1),np.cos(a)*(-1 if reverse else 1)])
 for j in range(len(rings)-1):
  for i in range(N):
   a=j*N+i;b=j*N+(i+1)%N;c=a+N;e=b+N;f.extend([[a,b,c],[b,e,c]])
 v=np.array(v);f=np.array(f)
 fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]);nn=np.array(norm)
 if np.sum(fn*nn[f].mean(1))<0:f=f[:,::-1]
 return primitive(v,f,nn,mat)
for name,node in nodes.items():
 if not name.startswith(('Exhaust_Left_','Exhaust_Right_')):continue
 mesh=d['meshes'][node['mesh']];p=mesh['primitives'][0];v=read(p['attributes']['POSITION']);lo,hi=v.min(0),v.max(0);cy=(lo[1]+hi[1])/2;cz=(lo[2]+hi[2])/2;mouth=lo[0];back=hi[0]
 outer=tube([back,mouth+.004,mouth],[.040,.040,.0385],cy,cz,steel)
 bore=tube([mouth+.001,back],[.0345,.0345],cy,cz,inside,True)
 N=96;lipv=[];lipf=[]
 for radius in [.0385,.0345]:
  for i in range(N):a=2*np.pi*i/N;lipv.append([mouth,cy+radius*np.sin(a),cz+radius*np.cos(a)])
 for i in range(N):
  j=(i+1)%N;lipf.extend([[i,i+N,j],[j,i+N,j+N]])
 lipv=np.array(lipv);lipf=np.array(lipf)
 fn=np.cross(lipv[lipf[:,1]]-lipv[lipf[:,0]],lipv[lipf[:,2]]-lipv[lipf[:,0]])
 if fn[:,0].mean()>0:lipf=lipf[:,::-1]
 lip=primitive(lipv,lipf,np.tile([-1.,0,0],(len(lipv),1)),steel)
 diskv=[[back-.002,cy,cz]]+[[back-.002,cy+.0345*np.sin(2*np.pi*i/N),cz+.0345*np.cos(2*np.pi*i/N)] for i in range(N)];diskf=[[0,1+i,1+(i+1)%N] for i in range(N)]
 disk=primitive(np.array(diskv),np.array(diskf),np.tile([-1.,0,0],(N+1,1)),inside)
 mesh['primitives']=[outer,bore,lip,disk]
assert d['nodes']==old['nodes'] and d['animations']==old['animations']
d['buffers'][0]['byteLength']=len(blob);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Boundary vertices fitted:',joined,'; rebuilt four open exhaust tips.')
