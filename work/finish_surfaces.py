"""Round the roof/side-rail junction without touching animation nodes."""
import json,struct,argparse
from pathlib import Path
import numpy as np
import trimesh
from scipy.interpolate import PchipInterpolator,LinearNDInterpolator
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb')
ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path);args=ap.parse_args()
source=args.source or P
raw=source.read_bytes();ln=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+ln]);blob=bytearray(raw[28+ln:]);old=json.loads(json.dumps(d));s=trimesh.load(source,force='scene',process=False)
def read(i):
 a=d['accessors'][i];bv=d['bufferViews'][a['bufferView']];kind='<f4' if a['componentType']==5126 else '<u4' if a['componentType']==5125 else '<u2';w=3 if a['type']=='VEC3' else 1
 return np.frombuffer(blob,dtype=kind,count=a['count']*w,offset=bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w).copy()
def add(a,kind='VEC3'):
 a=np.ascontiguousarray(a,dtype='<f4' if kind=='VEC3' else '<u4');blob.extend(b'\0'*(-len(blob)%4));offset=len(blob);blob.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes});ai=len(d['accessors']);item={'bufferView':vi,'componentType':5126 if kind=='VEC3' else 5125,'count':len(a),'type':kind}
 if kind=='VEC3':item.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 d['accessors'].append(item);return ai

def trans(v,T):return np.einsum('ni,ji->nj',v,T[:3,:3])+T[:3,3]
def mesh(v,f,mat=11):
 n=np.zeros_like(v);fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
 for k in range(3):np.add.at(n,f[:,k],fn)
 n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
 return {'attributes':{'POSITION':add(v),'NORMAL':add(n)},'indices':add(f.reshape(-1,1),'SCALAR'),'material':mat,'mode':4}
def grid(rows):
 v=np.array(rows);r,c=v.shape[:2];a=(np.arange(r-1)[:,None]*c+np.arange(c-1)[None,:]).ravel();f=np.concatenate([np.column_stack([a,a+1,a+c]),np.column_stack([a+1,a+c+1,a+c])]);v=v.reshape(-1,3)
 if np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])[:,1].mean()<0:f=f[:,::-1]
 return v,f
H=PchipInterpolator([-1.40,-1.30,-1.08,-.55,-.08,.21,.30],[1.35,1.407,1.435,1.451,1.438,1.414,1.36])
nodes={n.get('name'):n for n in d['nodes']}
T,g=s.graph['Cabin_pillars_and_roof_rail_Right'];body=s.geometry[g];world=trans(body.vertices,T);mask=(body.vertex_normals[:,2]>.2)&(world[:,1]>1.30)
a=world[mask];key=np.round(a[:,:2],6);_,ids=np.unique(key,axis=0,return_index=True);a=a[ids];C=LinearNDInterpolator(a[:,:2],a[:,2])
# Central panel ends inside the rolled edge, rather than leaving a vertical ledge.
rows=[];sides={1:[],-1:[]}
for t in np.linspace(0,1,161):
 width=.615+.005*np.sin(np.pi*t);ss=np.linspace(-.59/width,.59/width,101)
 xx=(.21-.25*ss*ss)*(1-t)+(-1.30+.08*ss*ss)*t
 rows.append(np.column_stack([xx,H(xx)-.04*ss*ss,ss*width]))
 for sign in [1,-1]:
  ratio=.59/width;x0=(.21-.25*ratio**2)*(1-t)+(-1.30+.08*ratio**2)*t
  xb=-.04*(1-t)-1.22*t;yb=float(H(xb)-.052);zb=float(C(xb,yb))
  if not np.isfinite(zb):zb=width+.005
  zb=max(.61,min(.65,zb))
  p0=np.array([x0,float(H(x0)-.04*ratio**2),.59]);p3=np.array([xb,yb,zb])
  p1=p0+np.array([(xb-x0)*.35,(zb-.59)*.6*(-.08*ratio/width),(zb-.59)*.6])
  p2=p3+np.array([(x0-xb)*.1,.0065,-.0025]);line=[]
  for q in np.linspace(0,1,25):
   p=(1-q)**3*p0+3*(1-q)**2*q*p1+3*(1-q)*q*q*p2+q**3*p3;p[2]*=sign;line.append(p)
  sides[sign].append(line)
v,f=grid(rows);parts=[mesh(v,f),mesh(v-[0,.003,0],f[:,::-1])]
for sign in [1,-1]:
 v,f=grid(sides[sign]);parts.append(mesh(v,f));parts.append(mesh(v-[0,.003,0],f[:,::-1]))
d['meshes'][nodes['Roof']['mesh']]['primitives']=parts
# Rebuild the fore/aft painted headers against the exact new roof boundary.
for rear,name in [(False,'Windshield_painted_header'),(True,'Rear_windshield_painted_header')]:
 idx=-1 if rear else 0
 edge=np.vstack([np.array(sides[-1][idx])[::-1],np.array(rows[idx])[1:-1],np.array(sides[1][idx])])
 zz,ii=np.unique(np.round(edge[:,2],9),return_index=True);edge=edge[ii]
 bx=PchipInterpolator(zz,edge[:,0]);by=PchipInterpolator(zz,edge[:,1]);maxz=float(zz.max());rr=[]
 for q in np.linspace(0,1,25):
  line=[]
  for u in np.linspace(-1,1,129):
   if rear:glass=np.array([-1.355+.08*u*u,1.372-.035*u*u,u*.635])
   else:glass=np.array([.270-.25*u*u,1.382-.034*u*u,u*.635])
   top=np.array([float(bx(u*maxz)),float(by(u*maxz)),u*maxz]);point=glass*(1-q)+top*q
   delta=top-glass;startSlope=abs(delta[0])*(.40 if rear else .48)
   endSlope=float(H.derivative()(top[0]))*delta[0]-.08*top[2]/(.62*.62)*delta[2]
   point[1]=(2*q**3-3*q*q+1)*glass[1]+(q**3-2*q*q+q)*startSlope+(-2*q**3+3*q*q)*top[1]+(q**3-q*q)*endSlope
   line.append(point)
  rr.append(line)
 vv,ff=grid(rr);ps=[mesh(vv,ff)]
 for sign in [-1,1]:
  glass=np.array([(-1.275 if rear else .02),(1.337 if rear else 1.348),sign*.635])
  oldpoint=np.array([(-1.22 if rear else -.04),glass[1],sign*.635])
  top=np.array([float(bx(sign*maxz)),float(by(sign*maxz)),sign*maxz])
  cap=np.array([oldpoint,glass,top]);faces=np.array([[0,1,2]])
  if np.cross(cap[1]-cap[0],cap[2]-cap[0])[2]*sign<0:faces=faces[:,::-1]
  ps.append(mesh(cap,faces))
 d['meshes'][nodes[name]['mesh']]['primitives']=ps

# Clip the old rail skins exactly to the bottom of the new round-over.
def level(p):
 x=p[0]
 if x< -1.275 or x>.02:return -1.
 if x>-.04:limit=float(H(-.04)-.052)+(1.348-float(H(-.04)-.052))*(x+.04)/.06
 elif x< -1.22:limit=1.337+(float(H(-1.22)-.052)-1.337)*(x+1.275)/.055
 else:limit=float(H(x)-.052)
 return p[1]-limit
clipped=0
for name in ['Cabin_pillars_and_roof_rail_Left','Cabin_pillars_and_roof_rail_Right']:
 node=nodes[name];T=s.graph[name][0];inv=np.linalg.inv(T)
 for pr in d['meshes'][node['mesh']]['primitives']:
  vv=trans(read(pr['attributes']['POSITION']),T);nn=read(pr['attributes']['NORMAL']);ff=read(pr['indices']).reshape(-1,3);V=[];N=[];F=[]
  for tri in ff:
   polygon=[(vv[i],nn[i]) for i in tri];out=[]
   for k,A in enumerate(polygon):
    B=polygon[(k+1)%3];fa,fb=level(A[0]),level(B[0]);ia,ib=fa<=0,fb<=0
    if ia:out.append(A)
    if ia!=ib:
     q=fa/(fa-fb);out.append((A[0]+q*(B[0]-A[0]),A[1]+q*(B[1]-A[1])))
   if len(out)<3:clipped+=1;continue
   off=len(V);V.extend(p[0] for p in out);N.extend(p[1] for p in out)
   for k in range(1,len(out)-1):F.append([off,off+k,off+k+1])
  V=np.array(V);N=np.array(N);N/=np.maximum(np.linalg.norm(N,axis=1)[:,None],1e-12)
  pr['attributes']['POSITION']=add(trans(V,inv));pr['attributes']['NORMAL']=add(N);pr['indices']=add(np.array(F).reshape(-1,1),'SCALAR')
assert d['nodes']==old['nodes'] and d['animations']==old['animations']
d['buffers'][0]['byteLength']=len(blob);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Roof edge replaced by two smooth rolled junctions; clipped old protruding rail triangles:',clipped)
