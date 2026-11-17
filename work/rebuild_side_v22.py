from pathlib import Path
import sys, ast, json
import numpy as np
sys.path[:0]=[str(Path(__file__).parent),str(Path(__file__).parent/'front-libs')]
import trimesh
from scipy.interpolate import PchipInterpolator
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely import segmentize
from glb_export import export_scene

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'outputs/bmw-viewer'
source=trimesh.load(OUT/'bmw-wrapped-taillights-v21.glb',force='scene',process=False)
scene=source.copy()
paint=next(m.visual.material.copy() for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Panel recess rubber',baseColorFactor=[2,3,4,255],roughnessFactor=.80,doubleSided=True)
felt=trimesh.visual.material.PBRMaterial(name='Closed wheelhouse felt',baseColorFactor=[2,2,3,255],roughnessFactor=1,doubleSided=True)
trim=trimesh.visual.material.PBRMaterial(name='Black leather trim',baseColorFactor=[8,9,11,255],roughnessFactor=.66,doubleSided=True)
glass=trimesh.visual.material.PBRMaterial(name='Reflective automotive glass',baseColorFactor=[26,40,51,255],metallicFactor=.1,roughnessFactor=.075,doubleSided=True)
chrome=trimesh.visual.material.PBRMaterial(name='Satin window surround',baseColorFactor=[63,72,82,255],metallicFactor=.86,roughnessFactor=.30,doubleSided=True)
mirror=glass.copy();mirror.name='Mirror silver';mirror.baseColorFactor=[95,111,124,255];mirror.metallicFactor=.95
for f in ast.parse((ROOT/'work/build_car_v9.py').read_text(encoding='utf-8-sig')).body:
 if isinstance(f,ast.FunctionDef) and f.name=='tube':exec(compile(ast.Module(body=[f],type_ignores=[]),'helpers','exec'))
def smooth(v):
 v=np.clip(v,0,1);return v*v*(3-2*v)
def world(n,src=source):
 M,g=src.graph[n];m=src.geometry[g].copy();m.apply_transform(M);return m
def remove(n):
 if n in scene.graph.nodes_geometry:scene.delete_geometry(scene.graph[n][1])
def attach(m,name,mat=paint,parent=None):
 m.visual=trimesh.visual.TextureVisuals(material=mat)
 T=np.linalg.inv(scene.graph[parent][0]) if parent else np.eye(4)
 scene.add_geometry(m,node_name=name,geom_name=name,parent_node_name=parent,transform=T);return m
def meshgrid(rows):
 v=np.asarray(rows);n,m=v.shape[:2];a=(np.arange(n-1)[:,None]*m+np.arange(m-1)[None,:]).ravel()
 f=np.vstack([np.column_stack([a,a+1,a+m+1]),np.column_stack([a,a+m+1,a+m])])
 return trimesh.Trimesh(v.reshape(-1,3),f,process=False)
def patch(rows,name,mat=paint,parent=None,axis=None,sign=1):
 m=meshgrid(rows)
 if axis is not None and m.face_normals[:,axis].mean()*sign<0:m.invert()
 return attach(m,name,mat,parent)
def close_surface(m,offset):
 v=m.vertices.copy();N=len(v);f=m.faces.copy()
 e=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);u,c=np.unique(np.sort(e,axis=1),axis=0,return_counts=True);single={tuple(a) for a in u[c==1]}
 e=np.array([a for a in e if tuple(sorted(a)) in single]);walls=np.vstack([np.column_stack([e[:,1],e[:,0],e[:,0]+N]),np.column_stack([e[:,1],e[:,0]+N,e[:,1]+N])])
 mm=trimesh.Trimesh(np.vstack([v,v+offset]),np.vstack([f,f[:,::-1]+N,walls]),process=False);mm.fix_normals()
 assert mm.is_watertight
 return mm
def rounded(poly,r=.008):return poly.buffer(-r,join_style=1).buffer(r,join_style=1)
def shell(poly,field,sign,thickness,name,mat=paint,parent=None,area=.00032):
 parts=list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly];meshes=[]
 for p in parts:
  if p.area<1e-7:continue
  p=segmentize(p,max_segment_length=.018)
  uv,f=trimesh.creation.triangulate_polygon(p,engine='triangle',triangle_args=f'pq28a{area}')
  z=field(uv[:,0],uv[:,1]);m=trimesh.Trimesh(np.column_stack([uv,sign*z]),f,process=False)
  if m.face_normals[:,2].mean()*sign<0:m.invert()
  N=len(m.vertices);m=close_surface(m,[0,0,-sign*thickness]);x,y=uv.T;h=1e-5
  dx=(field(x+h,y)-field(x-h,y))/(2*h);dy=(field(x,y+h)-field(x,y-h))/(2*h)
  nn=sign*np.column_stack([-dx,-dy,np.ones(N)]);nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=np.vstack([nn,-nn]);meshes.append(m)
 return attach(trimesh.util.concatenate(meshes),name,mat,parent)

# Recover the actual old hood/fender boundary. Front and rear optical assemblies
# are reshaped with their surrounding body, rather than moved independently.
hood0=world('Hood_shell').vertices[:97*81].reshape(97,81,3)
old_side=hood0[:,-1]
sideH=PchipInterpolator([.70,.79,.95,1.176,1.482,1.832,2.164,2.25],[.985,.981,.965,.944,.924,.872,.798,.78])
oldH=PchipInterpolator(old_side[:,0],old_side[:,1],extrapolate=True)
rearH=PchipInterpolator([0,.65,.70,.919,.97889,1.0052,1.2],[0,.65,.72,.97,1.08,1.107,1.29])
def warp(v):
 v=np.array(v,float,copy=True);x,y=v[:,0].copy(),v[:,1].copy()
 v[:,1]+=(sideH(np.clip(x,.70,2.25))-oldH(np.clip(x,.70,2.25)))*smooth((x-.68)/.12)*smooth((y-.45)/.24)
 v[:,1]+=(rearH(y)-y)*smooth((-x-1.89)/.21)
 return v
def wheel_node(n):
 p=n
 while p in source.graph.transforms.parents:
  if p.startswith(('Steering_','Rear_mount_','Wheel_spin_')):return True
  p=source.graph.transforms.parents[p]
 return False
prefix=('Body_door_jambs_','Door_skin_','Door_trim_','Door_armrest_','Interior_door_pull_','Door_aperture_seal_',
 'Window_','A_pillar_','B_pillar_','C_pillar_','Rocker_solid_','Fender_','Front_arch_folded_lip_',
 'Front_wheelhouse_','Rear_arch_folded_lip_','Rear_wheelhouse_','Side_vent_','Door_handle_','Handle_recess_',
 'Mirror_','Fuel_filler_seam_','Hood_perimeter_seal','Hood_underside_brace_','Trunk_deck_joint_')
exact={'Roof','Windshield','Rear_windshield','Windshield_cowl','Hood_shell','Trunk_lid','Trunk_inner_skin'}
for n in list(scene.graph.nodes_geometry):
 if n.startswith(prefix) or n in exact:remove(n);continue
 if not wheel_node(n):
  M,g=scene.graph[n];m=scene.geometry[g];v=warp(trimesh.transform_points(m.vertices,M));m.vertices=trimesh.transform_points(v,np.linalg.inv(M))
  # Trimesh invalidates old normals when the vertices change.
  m.vertex_normals=m.vertex_normals

# Preserve the existing curved rear-lamp openings behind this transverse cut.
CUT=-2.14
cross=[]
for n in ['Rear_quarter_continuous_Left','Rear_shoulder_continuous_Left']:
 m=world(n);m.vertices=warp(m.vertices)
 lines=trimesh.intersections.mesh_plane(m,[1,0,0],[CUT,0,0]);cross.extend(lines.reshape(-1,3).tolist())
for label in ['Left','Right']:
 for kind in ['Rear_quarter_continuous','Rear_shoulder_continuous']:
  n=f'{kind}_{label}';m=world(n);m.vertices=warp(m.vertices);m=trimesh.intersections.slice_mesh_plane(m,[-1,0,0],[CUT,0,0],cap=False)
  remove(n);attach(m,n)
cross=np.array(cross);cross=cross[np.argsort(cross[:,1])];yy,ii=np.unique(np.round(cross[:,1],7),return_index=True);zz=cross[ii,2]
cutfield=PchipInterpolator(yy,zz,extrapolate=True);cuttop=float(yy[-1]);cutz=float(zz[-1])
print('rear cross',cuttop,cutz,flush=True)
belt=PchipInterpolator([CUT,-1.94,-1.45,-.38,.79],[cuttop,1.08,1.002,.965,.952])
baseZ=PchipInterpolator([CUT,-1.94,-1.45,.79],[cutz,.794,.802,.811])
ridge=PchipInterpolator([CUT,-1.48,-.35,.79,1.05],[.946,.929,.895,.858,.85])
handles=[(-.166,.884),(-1.137,.918)]

def pchip_rows(knots,values,y):
 # Vectorised monotone cubic sections: no facets or linear bands across doors.
 h=np.diff(knots,axis=1);d=np.diff(values,axis=1)/h;m=np.zeros_like(values)
 same=(d[:,:-1]*d[:,1:])>0;w1=2*h[:,1:]+h[:,:-1];w2=h[:,1:]+2*h[:,:-1]
 np.divide(w1+w2,w1/np.where(d[:,:-1]!=0,d[:,:-1],1)+w2/np.where(d[:,1:]!=0,d[:,1:],1),out=m[:,1:-1],where=same)
 m[:,0]=d[:,0];m[:,-1]=d[:,-1]
 k=np.clip(np.sum(y[:,None]>=knots,axis=1)-1,0,knots.shape[1]-2);i=np.arange(len(y));h0=h[i,k];t=np.clip((y-knots[i,k])/h0,0,1)
 return (2*t**3-3*t**2+1)*values[i,k]+(t**3-2*t**2+t)*h0*m[i,k]+(-2*t**3+3*t**2)*values[i,k+1]+(t**3-t**2)*h0*m[i,k+1]
def skin(x,y):
 x,y=np.broadcast_arrays(np.asarray(x,float),np.asarray(y,float));shape=x.shape;x=x.ravel();y=y.ravel();xc=np.clip(x,CUT,.79);r=ridge(xc);b=belt(xc)
 k=np.column_stack([np.full(len(x),.17),np.full(len(x),.26),np.full(len(x),.34),np.full(len(x),.53),np.full(len(x),.70),r-.034,r-.008,r+.010,r+.037,b])
 v=np.column_stack([np.full(len(x),.861),np.full(len(x),.915),np.full(len(x),.925),np.full(len(x),.903),np.full(len(x),.919),np.full(len(x),.927),np.full(len(x),.934),np.full(len(x),.932),np.full(len(x),.915),baseZ(xc)])
 z=pchip_rows(k,v,y)
 # A restrained arch crown and a soft lower-door scallop.
 rho=np.hypot((x+1.482)*.99,y-.3425)
 z+=.030*np.exp(-((rho-.422)/.060)**2)*np.exp(-((x+1.482)/.62)**4)*smooth((belt(xc)-y)/.10)
 z-=.006*np.exp(-((y-.54)/.19)**2)*smooth((x+1.08)/.18)*smooth((.79-x)/.20)
 for hx,hy in handles:z-=.009*np.exp(-((x-hx)/.102)**4-((y-hy)/.029)**2)
 z=np.minimum(z,.946)
 blend=smooth((x-CUT)/.20);z=blend*z+(1-blend)*cutfield(np.clip(y,yy[0],yy[-1]))
 return z.reshape(shape)

def arch(cx,cy,rx,ry,bottom=.21,N=241):
 a0=np.arcsin((bottom-cy)/ry);a=np.linspace(np.pi-a0,a0,N)
 return np.column_stack([cx+rx*np.cos(a),cy+ry*np.sin(a)])
reararc=arch(-1.482,.3425,.407,.402)
xx=np.linspace(.79,CUT,210)
body=Polygon(np.vstack([[.79,.21],np.column_stack([xx,belt(xx)]),[CUT,.21],reararc]))
assert body.is_valid
frontdoor=rounded(Polygon([[.79,float(belt(.79))],[.798,.83],[.81,.64],[.80,.40],[.77,.302],[-.295,.30],[-.305,.48],[-.321,.70],[-.383,float(belt(-.383))]]),.014).intersection(body)
reardoor=rounded(Polygon([[-.383,float(belt(-.383))],[-1.342,float(belt(-1.342))],[-1.255,.84],[-1.16,.66],[-1.055,.47],[-.99,.343],[-.945,.317],[-.295,.30],[-.305,.48],[-.321,.70]]),.011).intersection(body)
doors={'Front':frontdoor,'Rear':reardoor};gaps=.0018
frame=body.difference(unary_union([p.buffer(gaps) for p in doors.values()]))
panels={'Hood_pivot':(2,np.deg2rad(65)),'Trunk_pivot':(2,-np.deg2rad(65))}
door_areas={}
for sign,label,physical in [(1,'Left','Right'),(-1,'Right','Left')]:
 shell(frame,skin,sign,.06,f'Body_door_jambs_{physical}')
 for which,p in doors.items():
  pivot=f'Door_pivot_{which}_{physical}';x=.79 if which=='Front' else -.315
  M=np.eye(4);M[:3,3]=[x,.62,sign*(skin(x,.72)-.018)];scene.graph.update(frame_to=pivot,matrix=M)
  panels[pivot]=(1,sign*np.deg2rad(65 if which=='Front' else 62));door_areas[pivot]=p.area
  shell(p.buffer(-gaps,join_style=2),skin,sign,.045,f'Door_skin_{which}_{physical}',parent=pivot)
  shell(p.buffer(-.025),lambda x,y:skin(x,y)-.048,sign,.009,f'Door_trim_{which}_{physical}',trim,pivot,.0007)
  q=np.array(segmentize(p,.015).exterior.coords);attach(tube(np.column_stack([q,sign*(skin(q[:,0],q[:,1])-.055)]),.003,8),f'Door_aperture_seal_{which}_{physical}',dark)
  hx,hy=handles[0 if which=='Front' else 1]
  # Body-colour bridge handle, recessed pocket and two real mounts.
  for j,dx in enumerate([-.067,.067]):
   m=trimesh.creation.uv_sphere(radius=1,count=[12,20]);m.apply_scale([.016,.014,.008]);m.apply_translation([hx+dx,hy,sign*(skin(hx+dx,hy)+.003)])
   attach(m,f'Handle_mount_{physical}_{which}_{j}',paint,pivot)
  pth=[]
  for t in np.linspace(-1,1,55):
   x=hx+.073*t;pth.append([x,hy+.002*(1-t*t),sign*(skin(x,hy)+.005+.008*(1-t*t))])
  m=tube(pth,.007,12);attach(m,f'Door_handle_{label}_{which}',paint,pivot)
  inner=trimesh.creation.uv_sphere(radius=1,count=[12,20]);inner.apply_scale([.18,.026,.027]);inner.apply_translation([hx+.18,.62,sign*.84]);attach(inner,f'Door_armrest_{which}_{physical}',trim,pivot)
  pth=np.array([[hx+.07,.77,sign*.84],[hx+.16,.77,sign*.84]])
  attach(tube(pth,.008,8),f'Interior_door_pull_{which}_{physical}',chrome,pivot)
 # Continuous sculpted rocker extrusion with a turned-in lower edge.
 profile=np.array([[.300,.916],[.274,.930],[.230,.936],[.197,.920],[.185,.867],[.205,.850],[.272,.877]])
 rv=[]
 for x in np.linspace(-1.08,.79,151):
  for y,z in profile:rv.append([x,y+.008*((x-.79)/1.87)**2,sign*z])
 rv=np.array(rv);f=[];N=len(profile)
 for i in range(150):
  for j in range(N):k=(j+1)%N;a=i*N+j;b=i*N+k;f.extend([[a,b,b+N],[a,b+N,a+N]])
 for off in [0,150*N]:
  for j in range(1,N-1):f.append([off,off+j,off+j+1])
 m=trimesh.Trimesh(rv,f,process=False);m.fix_normals();assert m.is_watertight;attach(m,f'Rocker_solid_{label}')

print('doors built',flush=True)
# A complete new roof and cabin: four projection-constrained curves rather
# than the old trapezoid. Side upper boundaries also define the glass edges.
roofH=PchipInterpolator([-1.40,-1.30,-1.08,-.55,-.08,.21,.30],[1.35,1.407,1.435,1.451,1.438,1.414,1.36])
roofrows=[]
for t in np.linspace(0,1,113):
 row=[]
 for s in np.linspace(-1,1,89):
  x=(.21-.25*s*s)*(1-t)+(-1.30+.08*s*s)*t;z=s*(.615+.005*np.sin(np.pi*t));y=roofH(x)-.040*s*s
  row.append([x,y,z])
 roofrows.append(row)
roofmesh=meshgrid(roofrows)
if roofmesh.face_normals[:,1].mean()<0:roofmesh.invert()
attach(close_surface(roofmesh,[0,-.012,0]),'Roof')
roofedge=np.asarray(roofrows)[:,-1]
upperX=np.r_[-1.94,-1.75,-1.50,-1.22,roofedge[::-1,0][1:-1],-.04,.75,.79]
upperY=np.r_[1.08,1.17,1.28,float(roofH(-1.22)-.04),roofedge[::-1,1][1:-1],float(roofH(-.04)-.04),.98,float(belt(.79))]
def upper(x):
 x=np.asarray(x);rr=np.interp(x,roofedge[::-1,0],roofedge[::-1,1])
 front=np.interp(x,[-.04,.75,.79],[1.348,.98,float(belt(.79))])
 rear=np.interp(x,[-1.94,-1.22],[1.08,1.337])
 return np.where(x>-.04,front,np.where(x< -1.22,rear,rr))
def cabin(x,y):
 x,y=np.broadcast_arrays(np.asarray(x,float),np.asarray(y,float));xc=np.clip(x,-1.94,.79);b=belt(xc);top=upper(xc)
 q=np.clip((y-b)/np.maximum(top-b,.001),0,1)
 zroof=np.interp(xc,roofedge[::-1,0],roofedge[::-1,2])
 # At each header the glass side is a few millimetres wider than the roof.
 ztop=np.where(xc>-.04,np.interp(xc,[-.04,.75,.79],[.635,.811,.811]),np.where(xc< -1.22,np.interp(xc,[-1.94,-1.22],[.794,.632]),zroof))
 return baseZ(xc)*(1-q**.88)+ztop*q**.88+.006*np.sin(np.pi*q)
def px(p):
 a=np.asarray(p,float).copy();a[:,0]=1.482+(260-a[:,0])*(2.964/678);a[:,1]=np.interp(a[:,1],[625,886,965],[1.451,.34675,0]);return a
wf=rounded(Polygon(px([[445,739],[505,696],[570,663],[615,650],[660,646],[699,645],[681,732]])),.012)
wr=rounded(Polygon(px([[694,732],[712,645],[777,646],[841,653],[898,675],[927,694],[929,703],[916,718],[897,729]])),.014)
windowpolys={'Front':wf,'Rear':wr}
outercurve=np.vstack([[.79,float(belt(.79))],[.75,.98],[-.04,1.348],roofedge[:,:2],[-1.22,1.337],[-1.94,1.08]])
lowercurve=np.column_stack([np.linspace(-1.94,.79,220),belt(np.linspace(-1.94,.79,220))])
cabinpoly=Polygon(np.vstack([outercurve,lowercurve]));assert cabinpoly.is_valid
fixed=cabinpoly.difference(unary_union([wf.buffer(.014),wr.buffer(.014)]))
for sign,label,physical in [(1,'Left','Right'),(-1,'Right','Left')]:
 shell(fixed,cabin,sign,.014,f'Cabin_pillars_and_roof_rail_{physical}')
 for which,p in windowpolys.items():
  pivot=f'Door_pivot_{which}_{physical}'
  surround=p.buffer(.012).difference(p.buffer(.001));shell(surround,lambda x,y:cabin(x,y)+.0015,sign,.006,f'Window_frame_{label}_{which}',dark,pivot,.00017)
  glassfield=lambda x,y:cabin(x,y)+.003
  shell(p,glassfield,sign,.003,f'Window_{label}_{which}',glass,pivot,.00027)
  # Thin satin perimeter follows the true curved glass, not a flat overlay.
  q=np.array(segmentize(p.buffer(.0125),.012).exterior.coords);pth=np.column_stack([q,sign*(cabin(q[:,0],q[:,1])+.003)])
  attach(tube(pth,.0018,8),f'Window_chrome_{label}_{which}',chrome,pivot)
 # Mirror mount, curved housing, recessed reflective rear face.
 pivot=f'Door_pivot_Front_{physical}'
 pth=[[.65,.989,sign*.815],[.58,1.037,sign*.909],[.535,1.061,sign*.991]]
 attach(tube(pth,.014,12),f'Mirror_stalk_{label}',dark,pivot)
 m=trimesh.creation.uv_sphere(radius=1,count=[28,48]);m.apply_scale([.095,.046,.070]);m.apply_translation([.535,1.077,sign*.9895]);attach(m,f'Mirror_{label}',paint,pivot)
 rows=[]
 for r in np.linspace(0,1,13):
  rows.append([[.449-.007*(1-r*r),1.077+.033*r*np.sin(a),sign*(.9895+.056*r*np.cos(a))] for a in np.linspace(0,2*np.pi,65)])
 patch(rows,f'Mirror_glass_{label}',mirror,pivot,0,-1)

# Windshields are bounded by curved front/rear outlines in plan view.
def wind_front(t,s):
 a=np.abs(s);x=(.99-.24*a*a)*(1-t)+(.21-.25*a*a)*t
 y=(1.012-.032*a*a)*(1-t)+(1.382-.034*a*a)*t
 sideX=.75*(1-t)-.04*t;sideY=.98*(1-t)+1.348*t
 z=s*float(cabin(sideX,sideY))
 return np.array([x,y,z])
def wind_rear(t,s):
 a=np.abs(s);x=(-1.30+.08*a*a)*(1-t)+(-2.22+.28*a*a)*t
 y=(1.372-.035*a*a)*(1-t)+(1.095-.015*a*a)*t
 sideX=-1.22*(1-t)-1.94*t;sideY=1.337*(1-t)+1.08*t
 z=s*float(cabin(sideX,sideY))
 return np.array([x,y,z])
for name,fn in [('Windshield',wind_front),('Rear_windshield',wind_rear)]:
 rows=[[fn(t,s) for s in np.linspace(-1,1,97)] for t in np.linspace(0,1,73)];m=meshgrid(rows)
 if m.face_normals[:,1].mean()<0:m.invert()
 attach(close_surface(m,[0,-.003,0]),name,glass)
 # Header surfaces close the transition between each glass and roof.
 rr=[]
 roofend=np.array(roofrows)[0 if name=='Windshield' else -1]
 for j,s in enumerate(np.linspace(-1,1,89)):
  a=fn(1 if name=='Windshield' else 0,s);b=roofend[j];rr.append([(1-q)*a+q*b for q in np.linspace(0,1,9)])
 patch(rr,name+'_painted_header',axis=1)

print('cabin built',flush=True)
# Rebuild the hood from its original longitudinal ridges, lower its nose and
# give the cowl the curved plan outline read from the top drawing.
hood=hood0.copy()
for i in range(97):
 t=i/96
 for j in range(81):
  s=(j-40)/40;p=hood[i,j];delta=float(sideH(old_side[i,0])-old_side[i,1]);p[1]+=delta
  p[0]+=(.78-old_side[0,0])*(1-t)**2+.20*(1-s*s)*(1-t)**3
M=np.eye(4);M[:3,3]=[.75,.983,0]
# Other retained moving parts keep their closed world positions after a new pivot.
def repivot(name,M):
 saved=[]
 for n in list(scene.graph.nodes_geometry):
  if scene.graph.transforms.parents.get(n)==name:saved.append((n,world(n,scene),scene.geometry[scene.graph[n][1]].visual.material))
 scene.graph.update(frame_to=name,matrix=M)
 for n,m,mat in saved:remove(n);attach(m,n,mat,name)
repivot('Hood_pivot',M)
hm=meshgrid(hood)
if hm.face_normals[:,1].mean()<0:hm.invert()
attach(close_surface(hm,[0,-.012,0]),'Hood_shell',paint,'Hood_pivot')
perim=np.vstack([hood[0],hood[1:,-1],hood[-1,-2::-1],hood[-2:0:-1,0]]);perim[:,1]-=.016
attach(tube(np.vstack([perim,perim[0]]),.002,8),'Hood_perimeter_seal',dark,'Hood_pivot')
for k,i in enumerate([18,48,78]):
 p=hood[i,8:-8].copy();p[:,1]-=.030;attach(tube(p,.009,10),f'Hood_underside_brace_{k}',dark,'Hood_pivot')
rows=[]
for j,s in enumerate(np.linspace(-1,1,81)):
 a=hood[0,j].copy();a[0]-=.004;a[1]-=.005;b=wind_front(0,s);rows.append([(1-q)*a+q*b for q in np.linspace(0,1,13)])
patch(rows,'Windshield_cowl',dark,axis=1)

# Original front fascia geometry supplies the exact bumper perimeter.
# Read the earlier construction's exact front perimeter without exporting it.
ns={'__file__':str(ROOT/'work/repair_front_v17.py')};exec((ROOT/'work/repair_front_v17.py').read_text(encoding='utf-8-sig').split('for n in list(scene.graph.nodes_geometry):')[0],ns)
oldskin=ns['zskin'];oldrim=ns['rim'];oldupper=ns['upper']
newside=hood[:,-1];fx=np.linspace(.79,ns['end_x'],97);fy=newside[:,1]-.025
fy[0]=float(belt(.79));fup=PchipInterpolator(fx,fy)
def fskin(x,y):
 x,y=np.broadcast_arrays(np.asarray(x,float),np.asarray(y,float));oldy=y-(sideH(np.clip(x,.7,2.25))-oldH(np.clip(x,.7,2.25)))*smooth((y-.45)/.24)
 w=smooth((x-.90)/.40);return (1-w)*skin(np.minimum(x,.79),y)+w*oldskin(x,oldy)
frontarc=arch(1.482,.34675,.425,.407)
frontys0=np.linspace(ns['end_y'],ns['bottom'],130)
frontedge0=np.array([ns['rim'](y)-[.016,0,0] for y in frontys0]);frontedge=warp(frontedge0)
vent=rounded(Polygon([[.867,.842],[1.153,.832],[1.121,.773],[.930,.774]]),.009)
outline=np.vstack([[.79,.21],np.column_stack([fx,fy]),frontedge[:,:2],frontarc[::-1]])
fp=Polygon(outline).difference(vent);assert fp.is_valid
for sign,label in [(1,'Left'),(-1,'Right')]:
 shell(fp,fskin,sign,.007,f'Fender_{label}_outer',area=.00023)
 rows=[]
 for i,p0 in enumerate(newside):
  p=p0.copy();p[2]+=.0055;p[1]-=.0008;p[2]*=sign;q=np.array([fx[i],fy[i],sign*fskin(fx[i],fy[i])]);row=[]
  for t in np.linspace(0,1,39):
   r=p+(q-p)*np.sin(t*np.pi/2);r[1]=p[1]+(q[1]-p[1])*(1-np.cos(t*np.pi/2));row.append(r)
  rows.append(row)
 patch(rows,f'Fender_{label}_shoulder',axis=1)
 gap=newside.copy();gap[:,2]=(gap[:,2]+.0027)*sign;gap[:,1]-=.007;attach(tube(gap,.0015,8),f'Fender_{label}_hood_gap',dark)
 # A clean physical side vent, recessed chamber, satin rim and horizontal blade.
 shell(vent,lambda x,y:fskin(x,y)-.013,sign,.002,f'Side_vent_{label}_recess',dark,area=.0002)
 q=np.array(segmentize(vent,.006).exterior.coords);path=np.column_stack([q,sign*(fskin(q[:,0],q[:,1])+.001)])
 attach(tube(path,.0028,10),f'Side_vent_{label}_chrome',chrome)
 path=np.array([[x,.806,sign*(fskin(x,.806)-.003)] for x in np.linspace(.939,1.112,45)])
 attach(tube(path,.003,10),f'Side_vent_{label}_blade',chrome)
 for j,col in enumerate([[24,110,200,255],[25,35,100,255],[170,5,15,255]]):
  x=1.017+j*.009;mat=trimesh.visual.material.PBRMaterial(name=f'M side stripe {j}',baseColorFactor=col,roughnessFactor=.3)
  m=trimesh.creation.box([.007,.012,.002]);m.apply_translation([x,.814,sign*(fskin(x,.814)+.001)]);attach(m,f'Side_vent_{label}_M_stripe_{j}',mat)
 # Exact bumper-to-fender bridge after applying the same vertical change.
 remove(f'Bumper_corner_join_{label}');rows=[]
 for p0 in frontedge0:
  y0=p0[1];a=warp(np.array([p0]))[0];a[2]=sign*fskin(a[0],a[1]);b=warp(np.array([oldrim(y0)]))[0];b[2]*=sign
  rows.append([(1-t)*a+t*b for t in np.linspace(0,1,13)])
 patch(rows,f'Bumper_corner_join_{label}')
 # Fully connected arch folds and wheelhouse liners for both axles.
 for which,arc,field,cx,cy,innerZ in [('Front',frontarc,fskin,1.482,.34675,.54),('Rear',reararc,skin,-1.482,.3425,.555)]:
  outer=np.column_stack([arc,sign*field(arc[:,0],arc[:,1])]);lip=[]
  for p in outer:
   rr=p[:2]-[cx,cy];rr/=np.linalg.norm(rr);row=[]
   for t in np.linspace(0,1,9):
    q=p.copy();q[:2]-=.0015*t*rr;q[2]-=sign*.032*t;row.append(q)
   lip.append(row)
  patch(lip,f'{which}_arch_folded_lip_{label}')
  tunnel=[]
  for p in np.array(lip)[:,-1]:
   rr=p[:2]-[cx,cy];rr/=np.linalg.norm(rr);row=[]
   for t in np.linspace(0,1,21):
    q=p.copy();q[:2]+=.009*t*rr;q[2]=(1-t)*p[2]+t*sign*innerZ;row.append(q)
   tunnel.append(row)
  patch(tunnel,f'{which}_wheelhouse_tunnel_{label}',felt)
  back=np.array(tunnel)[:,-1];uv,f=trimesh.creation.triangulate_polygon(Polygon(back[:,:2]),engine='earcut');attach(trimesh.Trimesh(np.column_stack([uv,np.full(len(uv),sign*innerZ)]),f,process=False),f'{which}_wheelhouse_inner_wall_{label}',felt)
  for end in [0,-1]:
   edge=np.array(tunnel)[end];rows=[]
   for t in np.linspace(0,1,7):
    row=edge.copy();row[:,1]=edge[:,1]*(1-t)+(.185-.06*np.linspace(0,1,len(edge)))*t;rows.append(row)
   patch(rows,f'{which}_wheelhouse_kick_{label}_{end}',felt)

# Re-shaped trunk fore-edge follows the rear windscreen in top view.
tr=world('Trunk_lid');oldtr=tr.vertices.reshape(95,101,3);newtr=warp(oldtr.reshape(-1,3)).reshape(95,101,3)
# Keep a copy of the unmodified first row for every row's displacement.
trfore=newtr[0].copy()
for i in range(95):
 t=i/94
 for j,s in enumerate(np.linspace(-1,1,101)):
  target=wind_rear(1,s);target[0]-=.004;target[1]-=.002
  newtr[i,j]+=(target-trfore[j])*(1-t)**2
M=np.eye(4);M[:3,3]=[-1.94,1.08,0];repivot('Trunk_pivot',M)
tm=meshgrid(newtr)
if tm.face_normals[:,1].mean()<0:tm.invert()
attach(close_surface(tm,[0,-.012,0]),'Trunk_lid',paint,'Trunk_pivot')
inner=meshgrid(newtr);inner.vertices[:,1]-=.018;inner.invert();attach(inner,'Trunk_inner_skin',trim,'Trunk_pivot')
for sign,label in [(1,'Left'),(-1,'Right')]:
 p=newtr[:,-1 if sign>0 else 0].copy();p[:,1]+=.0004;attach(tube(p,.0015,8),f'Trunk_deck_joint_{label}',dark,'Trunk_pivot')
 # Short deck shoulder between the newly positioned C-pillar and retained rear.
 edge=p[p[:,0]>=CUT-.002];order=np.argsort(edge[:,0]);edge=edge[order]
 rows=[]
 for p0 in edge:
  x=float(p0[0]);a=np.array([x,float(belt(np.clip(x,CUT,.79))),sign*float(baseZ(np.clip(x,CUT,.79)))])
  b=p0.copy();b[2]+=sign*.0035
  rows.append([(1-t)*a+t*b for t in np.linspace(0,1,13)])
 if len(rows)>1:patch(rows,f'Rear_deck_transition_{label}',axis=1)
 # Recessed fuel door, only on the car's right, projected onto the new quarter.
 if sign==1:
  p=rounded(Polygon([[-1.84,.861],[-1.66,.861],[-1.66,.719],[-1.84,.719]]),.019)
  q=np.array(segmentize(p,.009).exterior.coords);attach(tube(np.column_stack([q,np.minimum(skin(q[:,0],q[:,1])+.0003,.9447)]),.0012,8),'Fuel_filler_seam_Right',dark)

# Remove unused graph leaves is unnecessary for glTF, but all materials need
# explicit smooth normals to avoid intermittent white/black reflected panels.
for m in scene.geometry.values():
 if not np.isfinite(m.vertices).all():raise ValueError('non-finite geometry')
 if m.visual.material.name=='Black sapphire paint':m.visual.material.roughnessFactor=.34;m.visual.material.metallicFactor=.45

stats=export_scene(scene,OUT/'bmw-blueprint-sides-v22.glb',22,{
 'method':'New side shells, door cuts, roof and glazing traced against four BMW factory projections; optical assemblies retained and reshaped with body',
 'reference':'BMW M5 press kit February 2012, factory dimension drawing page 11',
 'dimensions_mm':{'length':4910,'width':1892,'height':1451,'wheelbase':2964,'front_track':1627,'rear_track':1582},
 'door_gap_mm':3.6,'door_skin_thickness_mm':45,'glass_thickness_mm':3},panels)
stats.update({'method':'Four-view blueprint side and cabin reconstruction; no new SF3D generation','door_gap_mm':3.6,'closed_door_shells':4,'closed_glass_shells':6,'door_panel_area_m2':door_areas})
(ROOT/'outputs/car-v22-statistics.json').write_text(json.dumps(stats,indent=2))
(ROOT/'work/side-v22-parameters.json').write_text(json.dumps({'cut_x':CUT,'cut_top':cuttop,'cut_z':cutz,'front_window':list(wf.exterior.coords),'rear_window':list(wr.exterior.coords),'handles':handles},indent=2))
print(json.dumps(stats),flush=True)
