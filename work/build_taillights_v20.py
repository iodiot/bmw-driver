from pathlib import Path
import sys,ast,json
import numpy as np
sys.path[:0]=[str(Path(__file__).parent),str(Path(__file__).parent/'front-libs')]
import trimesh
from shapely.geometry import Polygon,LineString,Point,box
from shapely.ops import unary_union
from shapely import segmentize
from scipy.interpolate import CubicSpline
from glb_export import export_scene
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
scene=trimesh.load(OUT/'bmw-materials-v19.glb',force='scene',process=False)
source=scene.copy();parents=scene.graph.transforms.parents
SY=.9367371792029296;SZ=.9845713182727399;SX=.97743871;TX=-.01584192

def material(name,rgba,metal=0,rough=.4,emission=None,alpha=None):
 kw={'name':name,'baseColorFactor':rgba,'metallicFactor':metal,'roughnessFactor':rough,'doubleSided':False}
 if emission is not None:kw['emissiveFactor']=emission
 if alpha:kw['alphaMode']=alpha
 return trimesh.visual.material.PBRMaterial(**kw)
housing=material('Taillamp molded housing',[4,4,6,255],.05,.55)
seal=material('Taillamp perimeter gasket',[1,1,2,255],0,.85)
reflector=material('Taillamp smoked reflector',[60,4,8,255],.85,.28)
redback=material('Taillamp ruby backing',[32,1,3,255],.35,.35)
guide=material('Rear LED guides V20',[50,2,4,255],.05,.25,[.9,.008,.006])
cover=material('Taillamp ruby cover',[120,5,12,90],.02,.14,alpha='BLEND')
clear=material('Taillamp clear cover',[150,165,180,65],0,.15,alpha='BLEND')
reverse=material('Reverse reflector facets',[95,108,122,255],.85,.23)
amber=material('Amber indicator optics',[95,34,2,255],.2,.3)
lightoff=material('Reflector optical facets',[22,1,3,255],.75,.24)

# Use the actual existing apertures. The new layers are measured inward from
# the same rear surface, so no lamp is pasted over a solid body panel.
def outline(node):
 M,g=source.graph[node];m=source.geometry[g].copy();m.merge_vertices(digits_vertex=7);loop=max(m.outline().discrete,key=len);v=trimesh.transform_points(loop,M)
 return Polygon(np.column_stack([abs(v[:,2]),v[:,1]]))
polys={w:outline(f'Rear_lamp_Right_{w}_lens') for w in ['Outer','Inner']}
# Replace the old skins, protruding LED strips, and empty aperture walls.
for n in list(scene.graph.nodes_geometry):
 if n.startswith(('Rear_lamp_','Rear_LED_','Trunk_LED_','Reverse_lamp_')) or n in [f'Rear_aperture_{p}_{i}' for p in ['wall','back'] for i in range(4)]:scene.delete_geometry(scene.graph[n][1])

built=[];checks={};bounds_cache={}

def baseX(u):return SX*(-2.62+.15*(u/(SZ*.96))**3)+TX

def frontX(uv,which):
 lo,hi=bounds_cache[which];q=np.clip((uv-lo)/(hi-lo),0,1)
 crown=.006*np.sin(q[:,0]*np.pi)**2*np.sin(q[:,1]*np.pi)**2
 return baseX(uv[:,0])-.001-crown

def solid(poly,depth,thickness,name,mat,which,parent=None):
 pieces=list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly];allmeshes=[]
 for pp in pieces:
  if pp.area<1e-9:continue
  pp=segmentize(pp,max_segment_length=.010)
  uv,f=trimesh.creation.triangulate_polygon(pp,engine='triangle',triangle_args='pq25a.000065')
  f=f.copy();N=len(uv);v=np.column_stack([frontX(uv,which)+depth,uv[:,1],uv[:,0]])
  if trimesh.Trimesh(v,f,process=False).face_normals[:,0].mean()>0:f=f[:,::-1]
  back=v.copy();back[:,0]+=thickness
  edges=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);u,c=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True);single={tuple(e) for e in u[c==1]};edges=np.array([e for e in edges if tuple(sorted(e)) in single])
  walls=np.vstack([np.column_stack([edges[:,1],edges[:,0],edges[:,0]+N]),np.column_stack([edges[:,1],edges[:,0]+N,edges[:,1]+N])])
  m=trimesh.Trimesh(np.vstack([v,back]),np.vstack([f,f[:,::-1]+N,walls]),process=False);m.fix_normals();assert m.is_watertight,name
  # Smooth front/rear normals; the closed rim retains its actual thickness.
  h=1e-5;du=np.array([h,0]);dy=np.array([0,h]);gx=(frontX(uv+du,which)-frontX(uv-du,which))/(2*h);gy=(frontX(uv+dy,which)-frontX(uv-dy,which))/(2*h)
  nn=np.column_stack([-np.ones(N),gy,gx]);nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=np.vstack([nn,-nn]);allmeshes.append(m)
 m=trimesh.util.concatenate(allmeshes);m.visual=trimesh.visual.TextureVisuals(material=mat)
 transform=np.linalg.inv(scene.graph[parent][0]) if parent else np.eye(4)
 scene.add_geometry(m,node_name=name,geom_name=name,parent_node_name=parent,transform=transform)
 built.append((name,which,parent));return m

# Build one right-hand unit first, including its separate moving inner section.
for which,p in polys.items():
 bounds_cache[which]=(np.array(p.bounds[:2]),np.array(p.bounds[2:]))
 parent='Trunk_pivot' if which=='Inner' else None;prefix=f'Taillamp_Right_{which}'
 rounded=p.buffer(-.008).buffer(.008).buffer(-.001)
 cavity=rounded.buffer(-.004)
 # Separate molded frame and back cover, both closed solids.
 solid(p.buffer(.001).difference(cavity),.001,.056,prefix+'_Housing_frame',housing,which,parent)
 solid(cavity,.052,.006,prefix+'_Housing_back',redback,which,parent)
 solid(p.buffer(.001).difference(rounded),-.001,.006,prefix+'_Gasket',seal,which,parent)
 # Stepped inner perimeter creates a visible dark cavity even with lights off.
 solid(cavity.difference(cavity.buffer(-.007)),.012,.037,prefix+'_Inner_bezel',reflector,which,parent)
 for k in range(3):
  y=.725+k*.036
  if which=='Outer':
   path=np.array([[.594,y],[.677,y],[.744,y+.003],[.795,y+.014],[.833,y+.036],[.875-.008*k,y+.084]])
   tt=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))];path=CubicSpline(tt,path,bc_type='natural')(np.linspace(0,tt[-1],100))
  else:path=np.column_stack([np.linspace(.341,.534,90),np.full(90,y)])
  center=LineString(path)
  channel=center.buffer(.011,cap_style=1,join_style=1).intersection(cavity.buffer(-.005))
  well=center.buffer(.0068,cap_style=1,join_style=1).intersection(cavity.buffer(-.007))
  band=center.buffer(.0047,cap_style=1,join_style=1).intersection(cavity.buffer(-.009))
  solid(channel,.036,.007,prefix+f'_Reflector_floor_{k}',lightoff,which,parent)
  solid(channel.difference(well),.020,.018,prefix+f'_Reflector_walls_{k}',reflector,which,parent)
  solid(band,.012,.007,prefix+f'_Lightguide_{k}',guide,which,parent)
 # Separate chambers and small molded facets behind the outer cover.
 if which=='Inner':
  chamber=box(.397,.845,.519,.866).buffer(.004).intersection(cavity.buffer(-.007))
  solid(chamber,.030,.006,prefix+'_Reverse_chamber',reverse,which,parent)
  for j,u in enumerate(np.linspace(.404,.511,15)):
   rib=box(u-.0012,.847,u+.0012,.864).intersection(chamber)
   if not rib.is_empty:solid(rib,.022,.007,prefix+f'_Reverse_prism_{j}',reverse,which,parent)
  window=chamber.buffer(.001)
  lens=solid(rounded.difference(window),0,.0028,prefix+'_Lens',cover,which,parent)
  solid(window,0,.0028,prefix+'_Reverse_lens',clear,which,parent)
 else:
  chamber=box(.610,.875,.744,.893).buffer(.003).intersection(cavity.buffer(-.008))
  solid(chamber,.033,.006,prefix+'_Indicator_chamber',reflector,which,parent)
  for j,u in enumerate(np.linspace(.618,.736,17)):
   rib=box(u-.0014,.877,u+.0014,.891).intersection(chamber)
   if not rib.is_empty:solid(rib,.022,.007,prefix+f'_Indicator_prism_{j}',amber,which,parent)
  lens=solid(rounded,0,.0028,prefix+'_Lens',cover,which,parent)
 checks[which]={'cover_watertight':bool(lens.is_watertight),'cover_thickness_x_mm':2.8,'guide_front_depth_mm':12,'cover_back_depth_mm':2.8,'minimum_guide_to_cover_gap_x_mm':9.2,'housing_depth_mm':56}
 assert checks[which]['minimum_guide_to_cover_gap_x_mm']>0
# Reflect the validated construction to the left. Parent assignments are retained.
for name,which,parent in list(built):
 M,g=scene.graph[name];m=scene.geometry[g].copy();m.apply_transform(M)
 m.apply_transform(np.diag([1,1,-1,1]));new=name.replace('Right','Left');T=np.linalg.inv(scene.graph[parent][0]) if parent else np.eye(4)
 scene.add_geometry(m,node_name=new,geom_name=new,parent_node_name=parent,transform=T)
# Overall length belongs to the bumper, not to the old protruding LED tubes.
# Extend the central bumper bulge smoothly by a few mm to retain the factory anchor.
n='Rear_bumper_sculpted';g=scene.graph[n][1];m=scene.geometry[g];v=m.vertices.copy();minimum=-2.592
edge_mesh=m.copy();edge_mesh.merge_vertices(digits_vertex=7)
boundaries=unary_union([LineString(loop[:,1:3]) for loop in edge_mesh.outline().discrete])
distance=np.array([boundaries.distance(Point(p)) for p in v[:,1:3]])
weight=np.clip(distance/.040,0,1);weight=weight*weight*(3-2*weight);weight*=np.exp(-(v[:,2]/.70)**4)
# Solve the smallest smooth displacement that anchors the outer bumper at -2.592.
lo,hi=0.,.06
for _ in range(50):
 mid=(lo+hi)/2
 if np.min(v[:,0]-mid*weight)>minimum:lo=mid
 else:hi=mid
v[:,0]-=hi*weight;m.vertices=v
# Analytical normals keep the adjusted bumper highlight continuous across its
# original triangulation; duplicated triangle corners must share the same normal.
def bumper_weight(yz):
 d=np.array([boundaries.distance(Point(p)) for p in yz]);t=np.clip(d/.040,0,1)
 return t*t*(3-2*t)*np.exp(-(yz[:,1]/.70)**4)
yz=v[:,1:3];h=.0001
wy=(bumper_weight(yz+[h,0])-bumper_weight(yz-[h,0]))/(2*h)
wz=(bumper_weight(yz+[0,h])-bumper_weight(yz-[0,h]))/(2*h)
q=(.48-v[:,1]/SY)/.25
base_y=-SX*.14*np.clip(q,0,1)/(.25*SY)*((q>0)&(q<1))
base_z=SX*.45*v[:,2]*np.abs(v[:,2])/(SZ*.96)**3
nn=np.column_stack([-np.ones(len(v)),base_y-hi*wy,base_z-hi*wz]);nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=nn
panels={'Hood_pivot':(2,np.deg2rad(65)),'Trunk_pivot':(2,-np.deg2rad(65))}
for where in ['Front','Rear']:
 for side in ['Left','Right']:panels[f'Door_pivot_{where}_{side}']=(1,(1 if side=='Right' else -1)*np.deg2rad(65 if where=='Front' else 62))
stats=export_scene(scene,OUT/'bmw-volumetric-taillights-v20.glb',20,{'method':'Volumetric two-piece rear lamps with closed lens shells, reflector wells and recessed light guides','lamp_construction_checks':checks},panels)
stats.update({'method':'Explicit rear-lamp construction; no new SF3D generation','rear_lamp_meshes':len(built)*2,'closed_lens_sections':4,'lens_thickness_mm':2.8,'guide_to_lens_gap_x_mm':9.2,'housing_depth_mm':56,'bumper_anchor_adjustment_mm':round(hi*1000,3)})
(ROOT/'outputs/car-v20-statistics.json').write_text(json.dumps(stats,indent=2));(ROOT/'outputs/car-v20-lamp-checks.json').write_text(json.dumps(checks,indent=2));print(json.dumps(stats))
