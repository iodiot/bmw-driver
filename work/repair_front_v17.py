from pathlib import Path
import sys,ast,json
import numpy as np
sys.path[:0]=[str(Path(__file__).parent),str(Path(__file__).parent/'front-libs')]
import trimesh
from scipy.interpolate import PchipInterpolator
from shapely.geometry import Polygon
from glb_export import export_scene
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
scene=trimesh.load(OUT/'bmw-solid-sides-v16.glb',force='scene',process=False)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Panel recess rubber',baseColorFactor=[2,2,3,255],metallicFactor=0,roughnessFactor=.8,doubleSided=True)
felt=trimesh.visual.material.PBRMaterial(name='Wheelhouse liner',baseColorFactor=[2,2,3,255],metallicFactor=0,roughnessFactor=1,doubleSided=True)
metal=trimesh.visual.material.PBRMaterial(name='Hinge steel',baseColorFactor=[45,48,52,255],metallicFactor=.8,roughnessFactor=.4)
for fn in ast.parse((ROOT/'work/build_car_v9.py').read_text(encoding='utf-8-sig')).body:
 if isinstance(fn,ast.FunctionDef) and fn.name in {'add','tube','patch'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'helpers','exec'))
H=scene.graph['Hood_pivot'][0].copy();hood=trimesh.transform_points(scene.geometry[scene.graph['Hood_outer'][1]].vertices,H).reshape(97,81,3)
old=trimesh.load(OUT/'bmw-aluminum-v13.glb',force='scene',process=False)
a=old.geometry[old.graph['Bumper_outer_skin'][1]].vertices;b=scene.geometry[scene.graph['Bumper_outer_skin'][1]].vertices
sf,tf=np.polyfit(a[:,0],b[:,0],1);sy=float(np.median(b[:,1]/a[:,1]));sz=float(np.median(b[a[:,2]!=0,2]/a[a[:,2]!=0,2]))
nose=PchipInterpolator([.2,.3,.53,.70,.84,.98],[-.13,-.095,.025,.015,-.035,-.11],extrapolate=True)
def raw_y(y):return y-.025*np.clip((y-.88)/.10,0,1)**2
ys=np.linspace(.215,.975,600)
def frontpoint(z,y):
 x=2.35-.20*(np.abs(z)/.96)**2+.012*np.sin((y-.2)*np.pi)+nose(np.clip(y,.2,.98))-.025*(abs(z)/.96)**4
 return np.array([sf*x+tf,sy*raw_y(y),sz*z])
def rim(y):
 yr=float(np.interp(y,raw_y(ys)*sy,ys));z=.945*max(0,1-abs((yr-.595)/.38)**7)**(1/7)
 return frontpoint(z,yr)
side=hood[:,-1].copy();rearx=.7359932065;bottom=.2107658684
rear_y=.975*sy;drop0=side[0,1]-rear_y
end_y=side[-1,1]-.026;end_x=rim(end_y)[0]-.016
outer_x=np.linspace(rearx,end_x,97);outer_y=side[:,1]-(drop0+(.026-drop0)*np.linspace(0,1,97))
upper=PchipInterpolator(outer_x,outer_y)
def zskin(x,y):
 # A rounded fender with a restrained flare, joined to the existing door side.
 xr=(x-tf)/sf;yr=y/sy
 z=sz*(.937+.014*np.exp(-((xr-1.46)/.4)**2)-.014*((yr-.58)/.4)**2-.015*np.clip((xr-1.9)/.3,0,1))
 rho=np.hypot(x-1.482,y-.34675)
 fade=np.clip((x-rearx)/.18,0,1)*np.clip((end_x-x)/.14,0,1)*np.clip((upper(np.clip(x,rearx,end_x))-y)/.07,0,1)
 delta=.018*np.exp(-((rho-.445)/.08)**2)*fade
 return z+(.945-z)*np.tanh(delta/np.maximum(.945-z,.001))
def cfront(y):return rim(float(y))[0]-.016
# Preserve the existing vent opening, but rebuild the fender around it.
m=scene.geometry[scene.graph['Fender_Left_outer'][1]].copy();m.merge_vertices(digits_vertex=6)
loops=m.outline().discrete;vent=min(loops,key=len)[:,:2]
for n in list(scene.graph.nodes_geometry):
 if n.startswith(('Fender_','Front_arch_joined_','Front_wheelhouse_','Hinge_base_')) or n in ['Bumper_outer_roll','Windshield_cowl'] or n.startswith('Hood_') and not n.startswith('Hood_roundel'):
  scene.delete_geometry(scene.graph[n][1])
def add_parent(m,name,mat,parent):
 m.visual=trimesh.visual.TextureVisuals(material=mat);m.visual.material.doubleSided=True;scene.add_geometry(m,node_name=name,geom_name=name,parent_node_name=parent);return m
# A closed hood replaces the old raised perimeter tubes.
v=hood.reshape(-1,3);N=len(v);faces=[]
for i in range(96):
 for j in range(80):
  k=i*81+j;faces.extend([[k,k+1,k+82],[k,k+82,k+81]])
f=np.array(faces);outer=trimesh.Trimesh(v,f,process=False)
if outer.face_normals[:,1].mean()<0:f=f[:,::-1]
edge=np.vstack([np.arange(81),np.arange(161,97*81,81),np.arange(97*81-2,96*81-1,-1),np.arange(95*81,0,-81)]) if False else np.r_[np.arange(81),np.arange(161,97*81,81),np.arange(97*81-2,96*81-1,-1),np.arange(95*81,0,-81)]
under=v.copy();under[:,1]-=.012;walls=[]
for a,b in zip(edge,np.roll(edge,-1)):walls.extend([[a,b,b+N],[a,b+N,a+N]])
solid=trimesh.Trimesh(np.vstack([v,under]),np.vstack([f,f[:,::-1]+N,walls]),process=False);solid.fix_normals();assert solid.is_watertight
solid.vertices=trimesh.transform_points(solid.vertices,np.linalg.inv(H));add_parent(solid,'Hood_shell',paint,'Hood_pivot')
perimeter=v[edge];seal=perimeter.copy();seal[:,1]-=.016
add_parent(tube(trimesh.transform_points(np.vstack([seal,seal[0]]),np.linalg.inv(H)),.002,8),'Hood_perimeter_seal',dark,'Hood_pivot')
for k,i in enumerate([18,48,78]):
 p=hood[i,8:-8].copy();p[:,1]-=.030
 add_parent(tube(trimesh.transform_points(p,np.linalg.inv(H)),.009,10),f'Hood_underside_brace_{k}',dark,'Hood_pivot')
# The shoulder starts 5.5 mm outside the real hood edge, never through it.
arch_a=np.linspace(np.pi-np.arcsin((bottom-.34675)/.407),np.arcsin((bottom-.34675)/.407),193)
arch=np.column_stack([1.482+.430*np.cos(arch_a),.34675+.407*np.sin(arch_a)])
frontys=np.linspace(end_y,bottom,100)
outline=np.vstack([[rearx,bottom],np.column_stack([outer_x,outer_y]),np.column_stack([[cfront(y) for y in frontys],frontys]),arch[::-1]])
# Arch contour goes from the front lower end back around the wheel to the rear.
poly=Polygon(outline,[vent.tolist()]);assert poly.is_valid
uv,ff=trimesh.creation.triangulate_polygon(poly,engine='triangle',triangle_args='pq28a.0004Y')
for sign,label in [(1,'Left'),(-1,'Right')]:
 vz=np.column_stack([uv,sign*zskin(uv[:,0],uv[:,1])]);mm=trimesh.Trimesh(vz,ff,process=False)
 if mm.face_normals[:,2].mean()*sign<0:mm.invert()
 add(mm,f'Fender_{label}_outer')
 inner=mm.copy();inner.vertices[:,2]-=sign*.006;inner.invert();add(inner,f'Fender_{label}_inner',dark)
 rows=[]
 for i,p in enumerate(side):
  p=p.copy();p[2]+=.0055;p[1]-=.0008;p[2]*=sign
  q=np.array([outer_x[i],outer_y[i],sign*zskin(outer_x[i],outer_y[i])]);row=[]
  for a in np.linspace(0,1,37):
   r=p+(q-p)*np.sin(a*np.pi/2);r[1]=p[1]+(q[1]-p[1])*(1-np.cos(a*np.pi/2));row.append(r)
  rows.append(row)
 shoulder=patch(rows,f'Fender_{label}_shoulder')
 if shoulder.face_normals[:,1].mean()<0:shoulder.invert()
 gap=side.copy();gap[:,2]=(gap[:,2]+.0027)*sign;gap[:,1]-=.007
 add(tube(gap,.0015,8),f'Fender_{label}_hood_gap',dark)
 # A rear return closes the fender at the A-pillar/door shut line.
 path=np.array([[rearx,y,sign*zskin(rearx,y)] for y in np.linspace(bottom,rear_y,90)])
 back=path.copy();back[:,0]-=.005;back[:,2]-=sign*.035
 patch(np.stack([path,back],axis=1),f'Fender_{label}_rear_return',dark)
 # Folded lip, wheelhouse tunnel and inner wall share their boundaries.
 arc3=np.column_stack([arch,sign*zskin(arch[:,0],arch[:,1])]);lip=[]
 for p in arc3:
  rr=np.array([p[0]-1.482,p[1]-.34675]);rr/=np.linalg.norm(rr);row=[]
  for t in np.linspace(0,1,9):
   q=p.copy();q[:2]-=.0015*t*rr;q[2]-=sign*.032*t;row.append(q)
  lip.append(row)
 patch(lip,f'Front_arch_folded_lip_{label}')
 tunnel=[]
 for p in np.array(lip)[:,-1]:
  row=[];rr=np.array([p[0]-1.482,p[1]-.34675]);rr/=np.linalg.norm(rr)
  for t in np.linspace(0,1,19):
   q=p.copy();q[:2]+=.009*t*rr;q[2]=(1-t)*p[2]+t*sign*.54;row.append(q)
  tunnel.append(row)
 patch(tunnel,f'Front_wheelhouse_tunnel_{label}',felt)
 back=np.array(tunnel)[:,-1];vv,ff2=trimesh.creation.triangulate_polygon(Polygon(back[:,:2]),engine='earcut');add(trimesh.Trimesh(np.column_stack([vv,np.full(len(vv),sign*.54)]),ff2,process=False),f'Front_wheelhouse_inner_wall_{label}',felt)
 # A narrow corner return joins the fender to the existing bumper perimeter.
 rows=[]
 for y in frontys:
  a=np.array([cfront(y)+.003,y,sign*zskin(cfront(y),y)]);b=rim(y);b[2]*=sign
  rows.append([(1-t)*a+t*b for t in np.linspace(0,1,12)])
 patch(rows,f'Bumper_corner_join_{label}')
 # The vent trim follows the new side surface.
 for n in list(scene.graph.nodes_geometry):
  if n.startswith(f'Side_vent_{label}_'):
   m=scene.geometry[scene.graph[n][1]];v=m.vertices.copy();oldz=sz*(.937+.014*np.exp(-(((v[:,0]-tf)/sf-1.46)/.4)**2)-.014*((v[:,1]/sy-.58)/.4)**2-.015*np.clip(((v[:,0]-tf)/sf-1.9)/.3,0,1));v[:,2]+=sign*(zskin(v[:,0],v[:,1])-oldz);m.vertices=v
# A shallow front bridge closes the gap above the headlights and grille.
rows=[]
for s in np.linspace(-1,1,161):
 z=s*.945*sz;zr=z/sz;yr=.595+.38*max(0,1-(abs(zr)/.945)**7)**(1/7);a=frontpoint(zr,yr)
 za=abs(z)
 if za<=side[-1,2]:
  x=float(np.interp(z,hood[-1,:,2],hood[-1,:,0]));y=float(np.interp(z,hood[-1,:,2],hood[-1,:,1]));b=np.array([x+.004,y-.0035,z])
 else:
  q=(za-side[-1,2])/(.945*sz-side[-1,2]);p0=side[-1].copy();p0[2]+=.0055;p0[1]-=.0008
  p1=np.array([end_x,end_y,zskin(end_x,end_y)]);b=p0+(p1-p0)*q;b[2]=z
 rows.append([(1-t)*a+t*b for t in np.linspace(0,1,14)])
patch(rows,'Bumper_upper_shutline_bridge')
# Cowl matches the windshield and the hood rear edge; hinges are at the real pivot.
w=scene.geometry[scene.graph['Windshield'][1]].vertices.reshape(40,65,3)[0]
rows=[]
for s in np.linspace(-1,1,81):
 a=hood[0,int(round((s+1)*40))].copy();a[0]-=.004;a[1]-=.004
 b=np.array([np.interp(s,np.linspace(-1,1,65),w[:,0]),np.interp(s,np.linspace(-1,1,65),w[:,1]),np.interp(s,np.linspace(-1,1,65),w[:,2])])
 rows.append([(1-t)*a+t*b for t in np.linspace(0,1,8)])
patch(rows,'Windshield_cowl',dark)
for sign in [-1,1]:
 m=trimesh.creation.box([.06,.018,.035]);m.apply_translation([H[0,3]+.02,H[1,3]-.035,sign*.58]);add(m,f'Hood_hinge_base_{sign}',metal)
 p=np.array([[H[0,3]-.015,H[1,3]-.03,sign*.58],[H[0,3],H[1,3]-.012,sign*.58],[H[0,3]+.045,H[1,3]-.020,sign*.58]])
 p[:,1]-=.024
 add(tube(p,.006,10),f'Hood_hinge_arm_{sign}',metal)
# Basic enclosed engine bay makes the hood opening useful.
def box(size,centre,name,mat=dark):
 m=trimesh.creation.box(size);m.apply_translation(centre);return add(m,name,mat)
box([1.10,.025,1.03],[1.31,.44,0],'Engine_bay_floor')
box([.025,.37,1.03],[.77,.64,0],'Engine_firewall')
box([.05,.28,1.04],[1.93,.60,0],'Radiator_housing')
box([.67,.25,.63],[1.30,.64,0],'Engine_block')
cover=trimesh.creation.uv_sphere(radius=1,count=[20,36]);cover.apply_scale([.40,.07,.34]);cover.apply_translation([1.30,.79,0]);add(cover,'V8_engine_cover',dark)
for sign in [-1,1]:
 add(tube([[.94,.71,sign*.40],[1.15,.75,sign*.41],[1.48,.72,sign*.42],[1.78,.62,sign*.44]],.047,16),f'Engine_intake_{sign}',dark)
 for x in np.linspace(1.10,1.50,6):box([.016,.008,.27],[x,.841,sign*.17],f'Engine_cover_rib_{sign}_{x}',metal)
stats=export_scene(scene,OUT/'bmw-front-seams-v17.glb',17,{'method':'Front panels rebuilt from the actual hood perimeter','hood_side_gap_mm':5.5}, {'Hood_pivot':(2,np.deg2rad(65))})
stats['method']='Front seam reconstruction; no new SF3D generation';(ROOT/'outputs/car-v17-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))
