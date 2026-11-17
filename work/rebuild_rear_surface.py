"""Replace overlapping rear shoulder/deck patches with one boundary-fitted skin."""
import argparse,json,struct
from pathlib import Path
import numpy as np
import trimesh,triangle
from scipy.spatial import cKDTree
from scipy.interpolate import RBFInterpolator
from shapely.geometry import Polygon,MultiPolygon,Point,box,MultiPoint
from shapely.ops import unary_union
from shapely import segmentize
ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);args=ap.parse_args()
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb')
raw=args.source.read_bytes();ln=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+ln]);blob=bytearray(raw[28+ln:]);old=json.loads(json.dumps(d))
s=trimesh.load(args.source,force='scene',process=False)
lampT,lampG=s.graph['Taillamp_Right_Outer_Lens']
lampV=trimesh.transform_points(s.geometry[lampG].vertices,lampT)
lampHole=MultiPoint(lampV[:,:2]).convex_hull.buffer(.004)
def acc(a,kind):
 a=np.ascontiguousarray(a,dtype='<u4' if kind=='SCALAR' else '<f4');blob.extend(b'\0'*(-len(blob)%4));off=len(blob);blob.extend(a.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes});ai=len(d['accessors']);item={'bufferView':vi,'componentType':5125 if kind=='SCALAR' else 5126,'count':len(a),'type':kind}
 if kind=='VEC3':item.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 d['accessors'].append(item);return ai

def trans(v,T):return np.einsum('ni,ji->nj',v,T[:3,:3])+T[:3,3]
def arr(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];width=3 if a['type']=='VEC3' else 1;dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
 return np.frombuffer(blob,dtype=dtype,offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*width).reshape(-1,width).copy()
# Work on the positive-Z side; generate the opposite side as its exact reflection.
polys=[];samples=[];selected={};nodes={n.get('name'):n for n in d['nodes']}
names=['Rear_shoulder_continuous_Left','Rear_fixed_deck_fairing_Right','Body_door_jambs_Right','Rear_quarter_continuous_Left','Rear_C_pillar_inner_fairing_Right','Cabin_pillars_and_roof_rail_Right']
for name in names:
 T,key=s.graph[name];m=s.geometry[key];v=trans(m.vertices,T);f=m.faces;mid=v[f].mean(1);ny=m.vertex_normals[f].mean(1)[:,1]
 if name.startswith('Rear_shoulder'):mask=np.ones(len(f),bool)
 elif name.startswith('Rear_fixed'):mask=ny>.15
 elif name.startswith('Body_'):mask=(ny>.12)&(mid[:,1]>.94)&(v[f][:,:,0].max(1)<-1.62)
 elif name.startswith(('Rear_C_pillar','Cabin_pillars')):mask=(ny>.1)&(mid[:,0]<-1.62)&(mid[:,1]<1.18)
 else:mask=(ny>.12)&(mid[:,1]>.90)
 sel=f[mask];project=v[sel][:,:,[0,2]]
 area=abs(np.cross(project[:,1]-project[:,0],project[:,2]-project[:,0]));project=project[area>1e-10]
 polys.extend(Polygon(t) for t in project);samples.append(v[np.unique(sel)])
 remove=mask.copy()
 if name.startswith('Body_'):remove=((mid[:,1]>.935)&(v[f][:,:,0].max(1)<-1.62))|((mid[:,0]>-2.30)&(mid[:,0]<-1.62)&(mid[:,1]>.85))
 if name.startswith(('Rear_C_pillar','Cabin_pillars')):remove=(mid[:,0]<-1.62)&(mid[:,1]<1.18)
 if name.startswith('Rear_quarter'):remove=mask|((mid[:,0]>-2.30)&(mid[:,0]<-1.62)&(mid[:,1]>.85))
 selected[name]=remove
cloud=np.vstack(samples);domain=unary_union(polys).buffer(.0007).buffer(-.0007).simplify(.00012,preserve_topology=True)
if isinstance(domain,MultiPolygon):domain=max(domain.geoms,key=lambda p:p.area)
# Close insignificant pinholes from the old triangulations, retaining only real boundaries.
domain=Polygon(domain.exterior,[ring.coords for ring in domain.interiors if Polygon(ring).area>.00002])
domain=domain.difference(box(-2.30,.89,-1.62,1.2))
if isinstance(domain,MultiPolygon):domain=max(domain.geoms,key=lambda p:p.area)
tree=cKDTree(cloud[:,[0,2]])
boundary=segmentize(domain,.008);rings=[np.array(boundary.exterior.coords)[:-1]]+[np.array(r.coords)[:-1] for r in boundary.interiors]
uv=np.vstack(rings);dist,ids=tree.query(uv,k=5);weights=1/np.maximum(dist,.0001)**2;ys=(cloud[ids,1]*weights).sum(1)/weights.sum(1)
# Duplicate projected positions on closed source shells must not constrain opposing skins.
rounded=np.round(uv,5);_,keep=np.unique(rounded,axis=0,return_index=True);uv=uv[keep];ys=ys[keep]
# Interior guide samples suppress the unconstrained thin-plate sag on this narrow domain.
extra=[];ey=[]
for x in np.arange(domain.bounds[0]+.025,domain.bounds[2],.045):
 for z in np.arange(domain.bounds[1]+.025,domain.bounds[3],.045):
  q=Point(x,z)
  if not domain.contains(q) or domain.boundary.distance(q)<.018:continue
  dd,ii=tree.query([x,z],k=min(200,len(cloud)));weights=np.exp(-(dd/.065)**2)
  A=np.column_stack([cloud[ii,0]-x,cloud[ii,2]-z,np.ones(len(ii))]);W=np.sqrt(weights)
  coef=np.linalg.lstsq(A*W[:,None],cloud[ii,1]*W,rcond=1e-8)[0]
  mean=float(np.dot(cloud[ii,1],weights)/weights.sum());val=float(np.clip(coef[2],mean-.02,mean+.02))
  extra.append([x,z]);ey.append(val)
boundary_count=len(uv)
uv=np.vstack([uv,extra]);ys=np.r_[ys,ey]
# A low-order global surface has no local interpolation ripples.
from numpy.polynomial.chebyshev import chebvander2d,chebval2d
training=cloud[cloud[:,1]>.925]
key=np.round(training[:,[0,2]]/.004).astype(int);_,ids=np.unique(key,axis=0,return_index=True);training=training[ids]
U=(training[:,0]+2.10)/.5;V=(training[:,2]-.80)/.16
A=chebvander2d(U,V,[4,4]).reshape(-1,25)
coef=np.linalg.lstsq(A,training[:,1],rcond=1e-8)[0].reshape(5,5)
def fit(q):
 q=np.asarray(q);return chebval2d((q[:,0]+2.10)/.5,(q[:,1]-.80)/.16,coef)[:,None]
basefit=fit
residual=np.zeros((len(uv),1));residual[:boundary_count,0]=ys[:boundary_count]-basefit(uv[:boundary_count]).ravel()
edgefit=RBFInterpolator(uv,residual,kernel='thin_plate_spline',smoothing=.0006,degree=1)
def fit(q):return basefit(q)
# A single continuous triangulation covers the former internal seams.
verts=[];segments=[];holes=[];off=0
for ri,ring in enumerate(rings):
 verts.extend(ring.tolist());segments.extend([[off+i,off+(i+1)%len(ring)] for i in range(len(ring))]);off+=len(ring)
 if ri:holes.append(list(Polygon(ring).representative_point().coords)[0])
settings={'vertices':np.array(verts),'segments':np.array(segments)}
if holes:settings['holes']=np.array(holes)
out=triangle.triangulate(settings,'pq28a0.000035');uv=out['vertices'];f=out['triangles'];y=fit(uv).ravel()
if not np.isfinite(y).all() or np.max(y)>1.23 or np.min(y)<.76:raise ValueError(('Invalid patch range',y.min(),y.max()))
v=np.column_stack([uv[:,0],y,uv[:,1]])
if np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])[:,1].mean()<0:f=f[:,::-1]
eps=.0001;dx=(fit(uv+[eps,0])-fit(uv-[eps,0])).ravel()/(2*eps);dz=(fit(uv+[0,eps])-fit(uv-[0,eps])).ravel()/(2*eps)
n=np.column_stack([-dx,np.ones(len(v)),-dz]);n/=np.linalg.norm(n,axis=1)[:,None]
# Remove the complete old overlapping patches, and only the selected top faces
# of the retained side panel. The new skin occupies precisely their footprint.
for sign in [1,-1]:
 def paired(name):return name if sign==1 else name.replace('Left','TEMP').replace('Right','Left').replace('TEMP','Right')
 for name,mask in selected.items():
  node=nodes[paired(name)];mesh=d['meshes'][node['mesh']]
  if name.startswith(('Rear_shoulder','Rear_fixed')):
   if name.startswith('Rear_fixed'):del node['mesh']
   continue
  for pr in mesh['primitives']:
   indices=arr(pr['indices']).reshape(-1,3)
   assert len(indices)==len(mask)
   pr['indices']=acc(indices[~mask].reshape(-1,1),'SCALAR')
 node=nodes[paired('Rear_shoulder_continuous_Left')];T=s.graph[paired('Rear_shoulder_continuous_Left')][0];vv=v.copy();nn=n.copy();ff=f.copy();vv[:,2]*=sign;nn[:,2]*=sign
 if sign<0:ff=ff[:,::-1]
 local=trans(vv,np.linalg.inv(T));localn=np.einsum('ni,ij->nj',nn,T[:3,:3]);mesh=d['meshes'][node['mesh']]
 mesh['primitives']=[{'attributes':{'POSITION':acc(local,'VEC3'),'NORMAL':acc(localn,'VEC3')},'indices':acc(ff.reshape(-1,1),'SCALAR'),'material':11,'mode':4}]
 # Join the deck to a new vertical quarter skin with the same position/tangent.
 sidev=[];NX=151;NY=41
 for xx in np.linspace(-2.30,-1.62,NX):
  join=float(fit(np.array([[xx,.89]]))[0,0]);eps=.0001
  derivative=float((fit(np.array([[xx,.89+eps]]))[0,0]-fit(np.array([[xx,.89-eps]]))[0,0])/(2*eps))
  scale=max(.015,.037*abs(derivative))
  for yy in np.linspace(.85,join,NY):
   zz=.89+.037*(1-np.exp(-(join-yy)/scale));sidev.append([xx,yy,zz*sign])
 sidev=np.array(sidev);sidef=[]
 for ix in range(NX-1):
  for iy in range(NY-1):
   a=ix*NY+iy;sidef.extend([[a,a+1,a+NY],[a+1,a+NY+1,a+NY]])
 sidef=np.array(sidef)
 midxy=sidev[sidef][:,:,:2].mean(1)
 sidef=sidef[[not lampHole.contains(Point(q)) for q in midxy]]
 if np.cross(sidev[sidef[:,1]]-sidev[sidef[:,0]],sidev[sidef[:,2]]-sidev[sidef[:,0]])[:,2].mean()*sign<0:sidef=sidef[:,::-1]
 siden=np.zeros_like(sidev)
 for k in range(3):np.add.at(siden,sidef[:,k],np.cross(sidev[sidef[:,1]]-sidev[sidef[:,0]],sidev[sidef[:,2]]-sidev[sidef[:,0]]))
 siden/=np.maximum(np.linalg.norm(siden,axis=1)[:,None],1e-12)
 mesh['primitives'].append({'attributes':{'POSITION':acc(trans(sidev,np.linalg.inv(T)),'VEC3'),'NORMAL':acc(np.einsum('ni,ij->nj',siden,T[:3,:3]),'VEC3')},'indices':acc(sidef.reshape(-1,1),'SCALAR'),'material':11,'mode':4})
 # A recessed return closes the join to the retained vertical side skin.
 for ring in rings:
  yh=fit(ring).ravel();top=np.column_stack([ring[:,0],yh,ring[:,1]*sign]);bottom=top.copy();bottom[:,1]-=np.where(ring[:,1]>.86,.012,.003)
  rv=np.vstack([top,bottom]);rf=[];K=len(ring)
  for i in range(K):
   j=(i+1)%K
   if (ring[i,1]+ring[j,1])/2>.86:continue
   rf.extend([[i,j,i+K],[j,j+K,i+K]])
  rf=np.array(rf);rn=np.zeros_like(rv)
  for face in rf:
   a,b,c=rv[face];normal=np.cross(b-a,c-a)
   for ix in face:rn[ix]+=normal
  rn/=np.maximum(np.linalg.norm(rn,axis=1)[:,None],1e-12)
  mesh['primitives'].append({'attributes':{'POSITION':acc(trans(rv,np.linalg.inv(T)),'VEC3'),'NORMAL':acc(np.einsum('ni,ij->nj',rn,T[:3,:3]),'VEC3')},'indices':acc(rf.reshape(-1,1),'SCALAR'),'material':11,'mode':4})
for node in d['nodes']:
 if not node.get('name','').startswith('Fuel_filler_seam_') or 'mesh' not in node:continue
 T=s.graph[node['name']][0]
 for pr in d['meshes'][node['mesh']]['primitives']:
  vv=trans(arr(pr['attributes']['POSITION']),T).astype(float)
  mask=vv[:,1]>.85
  if not mask.any():continue
  xx=vv[mask,0];yy=vv[mask,1];side=np.sign(vv[mask,2]);join=fit(np.column_stack([xx,np.full(len(xx),.89)])).ravel();eps=.0001
  deriv=(fit(np.column_stack([xx,np.full(len(xx),.89+eps)]))-fit(np.column_stack([xx,np.full(len(xx),.89-eps)]))).ravel()/(2*eps)
  scale=np.maximum(.015,.037*abs(deriv));vv[mask,2]=side*(.89+.037*(1-np.exp(-(join-yy)/scale))+.001)
  pr['attributes']['POSITION']=acc(trans(vv,np.linalg.inv(T)),'VEC3')
assert d['animations']==old['animations']
for a,b in zip(d['nodes'],old['nodes']):assert {k:v for k,v in a.items() if k!='mesh'}=={k:v for k,v in b.items() if k!='mesh'}
d['buffers'][0]['byteLength']=len(blob);j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Unified upper quarter:',len(v),'vertices,',len(f),'triangles per side; height range:',float(y.min()),float(y.max()),'; boundary samples:',len(ys))
