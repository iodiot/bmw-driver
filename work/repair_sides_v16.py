from pathlib import Path
import sys,ast,json,struct
import numpy as np
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
import trimesh
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(ROOT/'work/front-libs'))
from shapely.geometry import Polygon
from scipy.interpolate import CubicSpline
scene=trimesh.load(OUT/'bmw-quarter-refined-v15.glb',force='scene',process=False)
before=scene.copy()
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
felt=trimesh.visual.material.PBRMaterial(name='Closed wheelhouse felt',baseColorFactor=[2,2,3,255],metallicFactor=0,roughnessFactor=1,doubleSided=True)
dark=trimesh.visual.material.PBRMaterial(name='Side joint rubber',baseColorFactor=[1,1,2,255],metallicFactor=0,roughnessFactor=.75,doubleSided=True)
for fn in ast.parse((ROOT/'work/build_car_v9.py').read_text(encoding='utf-8-sig')).body:
 if isinstance(fn,ast.FunctionDef) and fn.name in {'add','tube','patch','acc'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'helpers','exec'))
source=trimesh.load(OUT/'bmw-aluminum-v13.glb',force='scene',process=False)
a=source.geometry[source.graph['Concept_side_Left'][1]].vertices
ref=trimesh.load(OUT/'bmw-factory-rear-v14.glb',force='scene',process=False)
b=ref.geometry[ref.graph['Concept_side_Left'][1]].vertices
sel=a[:,0]<-1.51;sx,tx=np.polyfit(a[sel,0],b[sel,0],1);sy=float(np.median(b[:,1]/a[:,1]));sz=float(np.median(b[:,2]/a[:,2]))
frontx=float(b[a[:,0].argmax(),0]);cut=-2.04
xp=np.array([cut,-1.5,.715]);wp=np.array([cut*sx+tx,-1.482,frontx])
def X(x):return np.interp(x,xp,wp)
def invX(x):return np.interp(x,wp,xp)
def mapped(v):
 v=np.array(v,float);v[...,0]=X(v[...,0]);v[...,1]*=sy;v[...,2]*=sz;return v
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def topy(x):return np.interp(x,[cut,.715],[.993,.975])
def fenderz(x,y):return .937+.014*np.exp(-((x-1.46)/.4)**2)-.014*((y-.58)/.4)**2-.015*np.clip((x-1.9)/.3,0,1)
def original(x,y):
 z=.931+.010*np.exp(-((x+1.50)/.5)**2)-.004*((y-.62)/.42)**2
 z+=.005*np.exp(-((y-(.875+.012*x))/.075)**2)-.004*np.exp(-((y-.55)/.20)**2)
 z-=.045*np.clip((-x-2.10)/.45,0,1)
 w=smooth((x-.38)/.335);return z*(1-w)+fenderz(x,y)*w
def skin(x,y):
 rho=np.hypot((x+1.5)*.985,(y*sy-.3425))
 fade=smooth((x-cut)/.20)*smooth((.715-x)/.36)*smooth((topy(x)-y)/.085)
 flare=.024*np.exp(-((rho-.422)/.070)**2)*np.exp(-((x+1.5)/.65)**4)
 # A continuous soft concavity on the doors, and a gentle belt crease.
 door=smooth((x+1.03)/.22)*smooth((.715-x)/.30)
 hollow=-.010*np.exp(-((y-.57)/.20)**2)*door
 base=original(x,y);delta=(flare+hollow)*fade;allowance=np.maximum(.9455/sz-base,1e-5)
 return base+np.where(delta>0,allowance*np.tanh(delta/allowance),delta)

def surface(x,y):
 yo=topy(x);zi=.795+.005*np.clip((-x-1.90)/.14,0,1)
 co=np.clip((y-yo)/(1.045-yo),0,1)
 shoulder=zi+(skin(x,yo)-zi)*np.sqrt(np.maximum(0,1-co*co))
 return np.where(y>yo,shoulder,skin(x,y))

def old_attachment(x,y):
 return .925+.018*np.exp(-((x+1.50)/.50)**2)+.012*np.exp(-((y-(.875+.012*x))/.055)**2)-.020*np.exp(-((y-.58)/.17)**2)+.009*np.exp(-((y-.29)/.055)**2)-.045*np.clip((-x-2.10)/.45,0,1)
# Capture the front opening from the actual fender perimeter, not an estimated ring.
fm=scene.geometry[scene.graph['Fender_Left_outer'][1]].copy();fm.merge_vertices(digits_vertex=6)
loop=max(fm.outline().discrete,key=len);mask=(loop[:,0]>1.0)&(loop[:,0]<1.92)&(loop[:,1]>.212)&(loop[:,1]<.82)
frontcurve=loop[mask];ang=np.arctan2(frontcurve[:,1]-.36,frontcurve[:,0]-1.455);ang=np.where(ang<-1,ang+2*np.pi,ang);frontcurve=frontcurve[np.argsort(ang)]
frontcurve=np.unique(np.round(frontcurve,7),axis=0) if False else frontcurve
# Remove mismatched trim and open shells before replacing them.
for n in list(scene.graph.nodes_geometry):
 if n.startswith(('Concept_side_','Rear_arch_','Concept_sill_','Belt_shoulder_joined_','Wheel_well_')) or n.startswith('Fender_') and n.endswith(('_rolled_arch','_arch_edge')):
  scene.delete_geometry(scene.graph[n][1])
# Closed, 6 mm thick side panels. The triangulation covers the whole polygon;
# there is no Delaunay filtering that can drop triangles along the arch.
CX=-1.5;CY=.3425/sy;RX=.407/sx;RY=.395/sy;BOTTOM=.225
a0=np.arcsin((BOTTOM-CY)/RY);angles=np.linspace(np.pi-a0,a0,193)
arch=np.column_stack([CX+RX*np.cos(angles),CY+RY*np.sin(angles)])
xx=np.linspace(.715,cut,170);outline=np.vstack([[.715,BOTTOM],np.column_stack([xx,topy(xx)]),[cut,BOTTOM],arch])
poly=Polygon(outline);assert poly.is_valid
v,f=trimesh.creation.triangulate_polygon(poly,engine='triangle',triangle_args='pq28a0.00035Y')
v3=np.column_stack([v,np.zeros(len(v))])
planar=trimesh.Trimesh(v3,f,process=False);planar.merge_vertices(digits_vertex=8);uv=planar.vertices[:,:2];f=planar.faces
boundary=planar.edges_unique[np.bincount(planar.edges_unique_inverse)==1]
new_panels=[]
for sign,label in [(1,'Left'),(-1,'Right')]:
 outer=mapped(np.column_stack([uv,sign*skin(uv[:,0],uv[:,1])]))
 inner=outer.copy();inner[:,2]-=sign*.006;N=len(outer)
 ff=f.copy()
 if np.cross(outer[ff[:,1]]-outer[ff[:,0]],outer[ff[:,2]]-outer[ff[:,0]])[:,2].mean()*sign<0:ff=ff[:,::-1]
 # Orient each boundary from the outward faces, ensuring a manifold solid.
 ed=np.vstack([ff[:,[0,1]],ff[:,[1,2]],ff[:,[2,0]]]);uni,counts=np.unique(np.sort(ed,axis=1),axis=0,return_counts=True)
 single={tuple(e) for e in uni[counts==1]};edges=np.array([e for e in ed if tuple(sorted(e)) in single])
 walls=np.vstack([np.column_stack([edges[:,1],edges[:,0],edges[:,0]+N]),np.column_stack([edges[:,1],edges[:,0]+N,edges[:,1]+N])])
 faces=np.vstack([ff,ff[:,::-1]+N,walls]);m=trimesh.Trimesh(np.vstack([outer,inner]),faces,process=False)
 assert m.is_watertight,(label,'side shell has an unintended hole')
 # Analytical normals retain smooth paint across the triangulated surface.
 xw,yw=outer[:,0],outer[:,1];h=1e-5
 def sw(x,y):return sz*skin(invX(x),y/sy)
 gx=(sw(xw+h,yw)-sw(xw-h,yw))/(2*h);gy=(sw(xw,yw+h)-sw(xw,yw-h))/(2*h)
 nn=np.column_stack([-gx,-gy,np.ones(N)])*sign;nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=np.vstack([nn,-nn])
 add(m,f'Side_shell_solid_{label}');new_panels.append(m)
 # Shared upper edge rolls smoothly inward to the window belt.
 rows=[]
 for x in np.linspace(.715,cut,170):
  yo=topy(x);zi=.795+.005*np.clip((-x-1.90)/.14,0,1)
  rows.append([[x,yo+(1.045-yo)*np.cos(q*np.pi/2),sign*(zi+(skin(x,yo)-zi)*np.sin(q*np.pi/2))] for q in np.linspace(0,1,37)])
 crown=patch(mapped(rows),f'Belt_shoulder_joined_{label}')
 if crown.face_normals[:,1].mean()<0:crown.invert()
 # Fold the arch into the body; no floating decorative tube remains.
 outerarch=mapped(np.column_stack([arch,sign*skin(arch[:,0],arch[:,1])]))
 rows=[]
 for p in outerarch:
  row=[]
  radial=np.array([p[0]+1.482,p[1]-.3425]);radial/=np.linalg.norm(radial)
  for t in np.linspace(0,1,9):
   q=p.copy();q[:2]-=.0015*np.sin(t*np.pi/2)*radial;q[2]-=sign*.033*t;row.append(q)
  rows.append(row)
 lip=patch(rows,f'Rear_arch_folded_lip_{label}')
 # Tunnel and inner wheelhouse wall block all views through the body.
 innercurve=np.array(rows)[:,-1]
 tunnel=[]
 for p in innercurve:
  row=[];radial=np.array([p[0]+1.482,p[1]-.3425]);radial/=np.linalg.norm(radial)
  for t in np.linspace(0,1,19):
   q=p.copy();q[:2]+=.009*smooth(t)*radial;q[2]=(1-t)*p[2]+t*sign*.555;row.append(q)
  tunnel.append(row)
 patch(tunnel,f'Rear_wheelhouse_tunnel_{label}',felt)
 back=np.array(tunnel)[:,-1]
 capv,capf=trimesh.creation.triangulate_polygon(Polygon(back[:,:2]),engine='earcut')
 add(trimesh.Trimesh(np.column_stack([capv,np.full(len(capv),sign*.555)]),capf,process=False),f'Rear_wheelhouse_inner_wall_{label}',felt)
 # A closed rocker extrusion gives the bottom of each side real volume.
 profile=np.array([[.285,0],[.264,.006],[.224,.005],[.195,-.012],[.185,-.060],[.205,-.073],[.252,-.060]])
 verts=[]
 for x in np.linspace(-1.075,.715,150):
  for y,offset in profile:verts.append([float(X(x)),y,sign*(sz*skin(x,y/sy)+offset)])
 n=len(profile);faces=[]
 for i in range(149):
  for j in range(n):k=(j+1)%n;a=i*n+j;b=i*n+k;faces.extend([[a,b,b+n],[a,b+n,a+n]])
 for off in [0,149*n]:
  for j in range(1,n-1):faces.append([off,off+j,off+j+1])
 rock=trimesh.Trimesh(verts,faces,process=False);rock.fix_normals();add(rock,f'Rocker_solid_{label}')
# Snap existing door gaps, handles and fuel flap onto the new sheet metal.
for n in list(scene.graph.nodes_geometry):
 if n.startswith(('Door_seam_','Door_lower_seam_','Door_handle_','Handle_recess_','Fuel_filler_seam_')):
  m=scene.geometry[scene.graph[n][1]];v=m.vertices.copy();x=invX(v[:,0]);y=v[:,1]/sy;sign=1 if 'Left' in n else -1
  v[:,2]+=sign*sz*(surface(x,y)-old_attachment(x,y))
  if n.startswith('Door_handle_'):v[:,2]-=sign*max(0,float(np.abs(v[:,2]).max())-.946)
  m.vertices=v
# The rear door gap must terminate at the wheel opening, not hang inside it.
ctrl=np.array([[-1.38,1.045],[-1.30,.93],[-1.26,.82],[-1.23,.72],[-1.20,.65],[-1.19,.63]])
t=np.r_[0,np.cumsum(np.linalg.norm(np.diff(ctrl,axis=0),axis=1))]
p=CubicSpline(t,ctrl,bc_type='natural')(np.linspace(0,t[-1],240))
metric=((X(p[:,0])+1.482)/.407)**2+((p[:,1]*sy-.3425)/.395)**2
idx=np.flatnonzero(metric<1)[0];frac=(metric[idx-1]-1)/(metric[idx-1]-metric[idx]);last=p[idx-1]*(1-frac)+p[idx]*frac;p=np.vstack([p[:idx],last])
for sign,label in [(1,'Left'),(-1,'Right')]:
 n=f'Door_seam_{label}_Rear';scene.delete_geometry(scene.graph[n][1])
 v=np.column_stack([p,sign*(surface(p[:,0],p[:,1])+.0012)])
 add(tube(mapped(v),.0017,8),n,dark)
 # Remove the first few millimetres of the lower door gap inside the arch.
 n=f'Door_lower_seam_{label}';scene.delete_geometry(scene.graph[n][1])
 pp=np.array([[-1.075,.31],[-.98,.285],[-.35,.285],[.64,.29],[.715,.31]])
 tt=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pp,axis=0),axis=1))]
 pp=CubicSpline(tt,pp)(np.linspace(0,tt[-1],120))
 add(tube(mapped(np.column_stack([pp,sign*(surface(pp[:,0],pp[:,1])+.0012)])),.0017,8),n,dark)
# Close the lower ends of the wheelhouse instead of leaving open side slots.
for label in ['Left','Right']:
 for end in [0,-1]:
  tunnel=scene.geometry[scene.graph[f'Rear_wheelhouse_tunnel_{label}'][1]].vertices.reshape(len(arch),19,3)
  edge=tunnel[end];rows=[]
  for h in np.linspace(0,1,5):
   row=edge.copy();floor=.185-.068*np.linspace(0,1,len(edge));row[:,1]=edge[:,1]*(1-h)+floor*h;rows.append(row)
  patch(rows,f'Rear_wheelhouse_kick_{label}_{end}',felt)

# Join the front fender's actual boundary to a complete wheelhouse too.
for sign,label in [(1,'Left'),(-1,'Right')]:
 curve=frontcurve.copy();curve[:,2]*=sign;rows=[]
 for p in curve:
  row=[];radial=np.array([p[0]-1.455,p[1]-.36]);radial/=np.linalg.norm(radial)
  for t in np.linspace(0,1,9):
   q=p.copy();q[:2]-=.0015*np.sin(t*np.pi/2)*radial;q[2]-=sign*.033*t;row.append(q)
  rows.append(row)
 patch(rows,f'Front_arch_joined_lip_{label}')
 tunnel=[]
 for p in np.array(rows)[:,-1]:
  row=[];radial=np.array([p[0]-1.455,p[1]-.36]);radial/=np.linalg.norm(radial)
  for t in np.linspace(0,1,19):
   q=p.copy();q[:2]+=.012*smooth(t)*radial;q[2]=(1-t)*p[2]+t*sign*.54;row.append(q)
  tunnel.append(row)
 patch(tunnel,f'Front_wheelhouse_tunnel_{label}',felt)
 back=np.array(tunnel)[:,-1];v,f=trimesh.creation.triangulate_polygon(Polygon(back[:,:2]),engine='earcut')
 add(trimesh.Trimesh(np.column_stack([v,np.full(len(v),sign*.54)]),f,process=False),f'Front_wheelhouse_inner_wall_{label}',felt)
# Preserve all four wheel rigs and export the existing forward rotation animation.
raw=scene.export(file_type='glb');length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
times=np.linspace(0,2,9,dtype='<f4');angle=-times*np.pi;q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(angle/2),np.cos(angle/2)]).astype('<f4')
ti=acc(times.tobytes(),'SCALAR',9,[0],[2]);ri=acc(q.tobytes(),'VEC4',9);channels=[]
for i,n in enumerate(doc['nodes']):
 name=n.get('name','')
 if name.startswith(('Steering_','Wheel_spin_','Rear_mount_')) or name=='Hood_pivot':
  mat=n.pop('matrix',None)
  if mat is not None:n['translation']=[mat[12],mat[13],mat[14]]
 if name.startswith('Wheel_spin_'):channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'Forward wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'version':16,'method':'Solid side panels, integrated arch returns, full wheelhouse liners','side_shells_watertight':True,'rear_arch_radius_mm':[407,395],'rear_arch_centre_mm':[-1482,342.5]}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(OUT/'bmw-solid-sides-v16.glb').write_bytes(result)
stats={'version':16,'objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'method':'Solid side and wheelhouse construction; no new SF3D generation','wheel_spin_groups':len(channels),'side_shells_watertight':all(m.is_watertight for m in new_panels)}
(ROOT/'outputs/car-v16-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))






