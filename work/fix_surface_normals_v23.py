from pathlib import Path
import sys,json,numpy as np
sys.path[:0]=[str(Path('work').resolve()),str(Path('work/front-libs').resolve())]
import trimesh
from glb_export import export_scene
ROOT=Path(__file__).resolve().parents[1];P=ROOT/'outputs/bmw-viewer'
# Recover the exact analytic surface functions without exporting or modifying v22.
code=(ROOT/'work/rebuild_side_v22.py').read_text(encoding='utf-8-sig')
ns={'__file__':str(ROOT/'work/rebuild_side_v22.py')}
exec(code.split('# Re-shaped trunk fore-edge')[0],ns)
from scipy.interpolate import PchipInterpolator
oldcabin=ns['cabin']
roofedge=ns['roofedge']
guideX=np.r_[-1.94,-1.50,-1.30,roofedge[::-1,0],.10,.40,.60,.75,.79]
guideY=np.r_[1.08,1.25,1.35,roofedge[::-1,1],1.32,1.17,1.07,.98,float(ns['belt'](.79))]
guideZ=np.r_[.794,.70,.642,roofedge[::-1,2],.667,.740,.785,.811,.811]
height=PchipInterpolator(guideX,guideY);width=PchipInterpolator(guideX,guideZ)
def cabin_smooth(x,y):
 x,y=np.broadcast_arrays(np.asarray(x,float),np.asarray(y,float));xc=np.clip(x,-1.94,.79)
 base=ns['belt'](xc);zbase=ns['baseZ'](xc)
 q=(y-base)/np.maximum(height(xc)-base,.025)
 # A continuously differentiable section, including the small area beyond
 # the window outline. No clipping or fractional-power cusp through glass.
 return zbase+(width(xc)-zbase)*q+.009*q*(1-q)
ns['cabin']=cabin_smooth

def refine(uv,faces,field,sign,offset):
 uv=np.asarray(uv,float);faces=np.asarray(faces,int)
 def normals(p):
  x,y=p.T;h=1e-5;dx=(field(x+h,y)-field(x-h,y))/(2*h);dy=(field(x,y+h)-field(x,y-h))/(2*h)
  n=np.column_stack([-dx,-dy,np.full(len(p),sign)]);return n/np.linalg.norm(n,axis=1)[:,None]
 for it in range(5):
  ee=np.stack([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]],axis=1)
  edges,inv=np.unique(np.sort(ee.reshape(-1,2),axis=1),axis=0,return_inverse=True);inv=inv.reshape(-1,3)
  a,b=uv[edges[:,0]],uv[edges[:,1]];mid=(a+b)/2;n=normals(uv);nm=normals(mid)
  endangle=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',n[edges[:,0]],n[edges[:,1]]),-1,1)))
  avg=n[edges[:,0]]+n[edges[:,1]];avg/=np.maximum(np.linalg.norm(avg,axis=1)[:,None],1e-12)
  bend=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',avg,nm),-1,1)))
  sag=np.abs(field(mid[:,0],mid[:,1])-(field(a[:,0],a[:,1])+field(b[:,0],b[:,1]))/2)
  flag=((endangle>8)|(bend>3)|(sag>.00012))&(np.linalg.norm(a-b,axis=1)>.0022)
  center=uv[faces].mean(1);csag=np.abs(field(center[:,0],center[:,1])-field(uv[faces,0],uv[faces,1]).mean(1))
  large=(np.linalg.norm(a-b,axis=1)[inv].max(1)>.003)&(csag>.00015)
  flag[inv[large].ravel()]=True
  if not flag.any():break
  ids=np.full(len(edges),-1,int);ids[flag]=np.arange(flag.sum())+len(uv);uv=np.vstack([uv,mid[flag]])
  mi=ids[inv];mask=(mi>=0).astype(int)@np.array([1,2,4]);out=[]
  for case in range(8):
   fs=faces[mask==case];mm=mi[mask==case]
   if not len(fs):continue
   aa,bb,cc=fs.T;ab,bc,ca=mm.T
   patterns={0:[(aa,bb,cc)],1:[(aa,ab,cc),(ab,bb,cc)],2:[(bb,bc,aa),(bc,cc,aa)],4:[(cc,ca,bb),(ca,aa,bb)],3:[(ab,bb,bc),(aa,ab,cc),(ab,bc,cc)],5:[(aa,ab,ca),(ab,bb,cc),(ab,cc,ca)],6:[(bc,cc,ca),(aa,bb,ca),(bb,bc,ca)],7:[(aa,ab,ca),(ab,bb,bc),(ca,bc,cc),(ab,bc,ca)]}
   out.extend(np.column_stack(t) for t in patterns[case])
  faces=np.vstack(out)
 return uv,faces

s=trimesh.load(P/'bmw-blueprint-sides-v22.glb',force='scene',process=False)
# Keep the adjoining windscreen and its painted headers on the same new cabin
# section. Their X/Y outlines and the roof edge remain unchanged.
for name,fn in [('Windshield',ns['wind_front']),('Rear_windshield',ns['wind_rear'])]:
 M,key=s.graph[name];mat=s.geometry[key].visual.material
 rows=[[fn(t,ss) for ss in np.linspace(-1,1,97)] for t in np.linspace(0,1,73)]
 m=ns['meshgrid'](rows)
 if m.face_normals[:,1].mean()<0:m.invert()
 m=ns['close_surface'](m,[0,-.003,0]);m.vertices=trimesh.transform_points(m.vertices,np.linalg.inv(M));m.visual=trimesh.visual.TextureVisuals(material=mat);s.geometry[key]=m
 rr=[];end=np.array(ns['roofrows'])[0 if name=='Windshield' else -1]
 for j,ss in enumerate(np.linspace(-1,1,89)):
  a=fn(1 if name=='Windshield' else 0,ss);b=end[j];rr.append([(1-q)*a+q*b for q in np.linspace(0,1,9)])
 M,key=s.graph[name+'_painted_header'];mat=s.geometry[key].visual.material;m=ns['meshgrid'](rr)
 if m.face_normals[:,1].mean()<0:m.invert()
 m.vertices=trimesh.transform_points(m.vertices,np.linalg.inv(M));m.visual=trimesh.visual.TextureVisuals(material=mat);s.geometry[key]=m
before_counts={k:(len(m.vertices),len(m.faces)) for k,m in s.geometry.items()}
changes={};diagnostics={}
def analytic(name):
 if name.startswith(('Door_skin_','Door_trim_','Body_door_jambs_')):return ns['skin']
 if name.startswith(('Window_','Cabin_pillars_')):return cabin_smooth
 if name.startswith('Fender_') and name.endswith('_outer'):return ns['fskin']
 return None
def target(name):
 return name in {'Roof','Hood_shell','Trunk_lid','Windshield','Rear_windshield'} or name.startswith(('Door_skin_','Door_trim_','Body_door_jambs_','Cabin_pillars_','Window_frame_')) or name.startswith('Fender_') and name.endswith('_outer') or name.startswith('Window_') and not name.startswith(('Window_chrome_','Window_trim_'))
def subset(v,f):
 used,ind=np.unique(f,return_inverse=True)
 return used,v[used],ind.reshape(-1,3)
for node in list(s.graph.nodes_geometry):
 if not target(node):continue
 M,key=s.graph[node];old=s.geometry[key];v=old.vertices;faces=old.faces
 components=trimesh.graph.connected_components(old.edges, nodes=np.arange(len(v)), min_len=1)
 vv=[];ff=[];nn=[];off=0;errors=[];boundary_errors=[]
 func=analytic(node);sign=1 if trimesh.transform_points(v,M)[:,2].mean()>0 else -1
 for component in components:
  component=np.sort(component);N=len(component)//2
  assert len(component)%2==0,node
  outerids=component[:N];innerids=component[N:]
  # These shells were constructed by translating a second copy of the outer
  # vertices. This check prevents accidentally applying the repair to other meshes.
  displacement=v[innerids]-v[outerids]
  assert np.max(np.linalg.norm(displacement-displacement[0],axis=1))<1e-6,(node,'not a paired shell')
  isin=np.zeros(len(v),bool);isin[component]=True
  f=faces[np.all(isin[faces],axis=1)]
  outmask=np.zeros(len(v),bool);outmask[outerids]=True
  inmask=np.zeros(len(v),bool);inmask[innerids]=True
  of=f[np.all(outmask[f],axis=1)];inf=f[np.all(inmask[f],axis=1)]
  wf=f[~(np.all(outmask[f],axis=1)|np.all(inmask[f],axis=1))]
  original_v=v
  if func is not None:
   used,pv,pf=subset(v,of);wv=trimesh.transform_points(pv,M);uv=wv[:,:2]
   original_field=oldcabin if node.startswith(('Window_','Cabin_pillars_')) else func
   offset=float(np.median(sign*wv[:,2]-original_field(uv[:,0],uv[:,1])))
   if not node.startswith('Door_trim_'):uv,pf=refine(uv,pf,func,sign,offset)
   wv=np.column_stack([uv,sign*(func(uv[:,0],uv[:,1])+offset)])
   pv=trimesh.transform_points(wv,np.linalg.inv(M));N=len(pv)
   v=np.vstack([pv,pv+displacement[0]])
   of=pf;inf=pf[:,::-1]+N
   ee=np.vstack([of[:,[0,1]],of[:,[1,2]],of[:,[2,0]]]);u,c=np.unique(np.sort(ee,axis=1),axis=0,return_counts=True);single={tuple(x) for x in u[c==1]};edge=np.array([e for e in ee if tuple(sorted(e)) in single])
   wf=np.vstack([np.column_stack([edge[:,1],edge[:,0],edge[:,0]+N]),np.column_stack([edge[:,1],edge[:,0]+N,edge[:,1]+N])])
   outmask=np.zeros(len(v),bool);outmask[:N]=True
  expected_normals=None
  for category,part in [('outer',of),('inner',inf),('wall',wf)]:
   used,pv,pf=subset(v,part);pm=trimesh.Trimesh(pv,pf,process=False)
   normals=pm.vertex_normals.copy()
   if func is not None and category!='wall':
    wv=trimesh.transform_points(pv,M)
    if category=='inner':wv-=displacement[0]@M[:3,:3].T
    x,y=wv[:,:2].T;h=1e-5
    dx=(func(x+h,y)-func(x-h,y))/(2*h);dy=(func(x,y+h)-func(x,y-h))/(2*h)
    # Mirroring Z changes only the Z component of the outward normal.
    # Multiplying all components by sign would point the left-side normals down.
    normals=np.column_stack([-dx,-dy,np.full(len(pv),sign)])
    if category=='inner':normals*=-1
    normals=normals@M[:3,:3];normals/=np.linalg.norm(normals,axis=1)[:,None]
   assert np.isfinite(normals).all()
   if category=='outer' and func is None:
    ang=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',old.vertex_normals[used],normals),-1,1)))
    errors.extend(ang.tolist());edge=np.unique(wf[outmask[wf]]);where=np.isin(used,edge);boundary_errors.extend(ang[where].tolist())
   vv.append(pv);ff.append(pf+off);nn.append(normals);off+=len(pv)
  v=original_v
 # Store the normals explicitly. Do not call .copy() or concatenate([mesh]):
 # trimesh's default copy drops the cached explicit vertex normals.
 new=trimesh.Trimesh(np.vstack(vv),np.vstack(ff),vertex_normals=np.vstack(nn),visual=old.visual,process=False)
 # Surface geometry is unchanged; the render vertices are only separated at
 # hard edges. Welding positions must recover a closed physical shell.
 welded=trimesh.Trimesh(new.vertices,new.faces,process=False);welded.merge_vertices(digits_vertex=7)
 assert welded.is_watertight,(node,'geometric opening after splitting shading')
 s.geometry[key]=new
 changes[node]={'vertices_before':len(old.vertices),'vertices_after':len(new.vertices),'triangles':len(new.faces),'physically_closed':True}
 diagnostics[node]={'old_boundary_error_deg_p50_p95_max':np.percentile(boundary_errors,[50,95,100]).tolist() if boundary_errors else None,'repaired_boundary_error_deg':0.0}

# Identical mirrored sampling prevents tiny numerical differences in adaptive
# subdivision from producing a different triangulation on the opposite side.
for node in list(changes):
 if 'Left' not in node:continue
 pair=node.replace('Left','Right')
 if pair not in changes:continue
 ma,ga=s.graph[node];mb,gb=s.graph[pair]
 pos,neg=(node,pair) if trimesh.transform_points(s.geometry[ga].vertices,ma)[:,2].mean()>0 else (pair,node)
 mp,gp=s.graph[pos];mn,gn=s.graph[neg];m=s.geometry[gp]
 vworld=trimesh.transform_points(m.vertices,mp)*[1,1,-1]
 normals=(m.vertex_normals@np.linalg.inv(mp[:3,:3]))*[1,1,-1];normals=normals@mn[:3,:3];normals/=np.linalg.norm(normals,axis=1)[:,None]
 other=trimesh.Trimesh(trimesh.transform_points(vworld,np.linalg.inv(mn)),m.faces[:,::-1],vertex_normals=normals,visual=s.geometry[gn].visual,process=False)
 s.geometry[gn]=other;changes[neg]['vertices_after']=len(other.vertices);changes[neg]['triangles']=len(other.faces)
panels={'Hood_pivot':(2,np.deg2rad(65)),'Trunk_pivot':(2,-np.deg2rad(65))}
for which in ['Front','Rear']:
 for physical in ['Left','Right']:panels[f'Door_pivot_{which}_{physical}']=(1,np.deg2rad((1 if physical=='Right' else -1)*(65 if which=='Front' else 62)))
stats=export_scene(s,P/'bmw-surface-normals-v23.glb',23,{'method':'Separated exterior/interior/return-wall normals, continuous cabin curvature and adaptive panel tessellation','normal_repair_meshes':list(changes),'source_version':22},panels)
stats.update({'method':'Surface correction; no optimization, no new SF3D generation','repaired_meshes':len(changes),'surface_positions_changed':True,'triangle_count_changed':True})
(ROOT/'outputs/car-v23-statistics.json').write_text(json.dumps(stats,indent=2))
(ROOT/'work/normal-repair-v23.json').write_text(json.dumps({'meshes':changes,'diagnostics':diagnostics},indent=2))
print(json.dumps(stats))
