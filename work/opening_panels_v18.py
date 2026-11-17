from pathlib import Path
import sys,ast,json
import numpy as np
sys.path[:0]=[str(Path(__file__).parent),str(Path(__file__).parent/'front-libs')]
import trimesh
from scipy.interpolate import RBFInterpolator
from shapely.geometry import Polygon,Point
from shapely import segmentize
from shapely.ops import unary_union
from glb_export import export_scene
import side_surfaces as S
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
scene=trimesh.load(OUT/'bmw-front-seams-v17.glb',force='scene',process=False)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
trim=trimesh.visual.material.PBRMaterial(name='Black leather trim',baseColorFactor=[8,9,11,255],metallicFactor=0,roughnessFactor=.66,doubleSided=True)
seal=trimesh.visual.material.PBRMaterial(name='Opening weatherstrip',baseColorFactor=[1,1,2,255],metallicFactor=0,roughnessFactor=.9,doubleSided=True)
glass=trimesh.visual.material.PBRMaterial(name='Reflective automotive glass',baseColorFactor=[26,40,51,255],metallicFactor=.1,roughnessFactor=.075,doubleSided=True)
alum=trimesh.visual.material.PBRMaterial(name='Interior satin aluminium',baseColorFactor=[60,68,77,255],metallicFactor=.85,roughnessFactor=.3)
for f in ast.parse((ROOT/'work/build_car_v9.py').read_text(encoding='utf-8-sig')).body:
 if isinstance(f,ast.FunctionDef) and f.name in ['add','tube','patch']:exec(compile(ast.Module(body=[f],type_ignores=[]),'helpers','exec'))
def attach_mesh(m,name,mat,parent=None):
 m.visual=trimesh.visual.TextureVisuals(material=mat);mat.doubleSided=True
 transform=np.linalg.inv(scene.graph[parent][0]) if parent else np.eye(4)
 scene.add_geometry(m,node_name=name,geom_name=name,parent_node_name=parent,transform=transform);return m

def reparent(n,parent):
 M,g=scene.graph[n];m=scene.geometry[g].copy();scene.delete_geometry(g)
 scene.add_geometry(m,node_name=n,geom_name=n,parent_node_name=parent,transform=np.linalg.inv(scene.graph[parent][0])@M)

def field(x,y):return S.sz*S.surface(S.invX(x),y/S.sy)
def solid(poly,sign,thickness,name,parent=None):
 parts=list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]
 meshes=[]
 for pp in parts:
  if pp.area<1e-6:continue
  pp=segmentize(pp,max_segment_length=.020)
  v,f=trimesh.creation.triangulate_polygon(pp,engine='triangle',triangle_args='pq28a.00020');out=np.column_stack([v,sign*field(v[:,0],v[:,1])]);inner=out.copy();inner[:,2]-=sign*thickness;N=len(out)
  m=trimesh.Trimesh(out,f,process=False)
  if m.face_normals[:,2].mean()*sign<0:f=f[:,::-1]
  e=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);u,c=np.unique(np.sort(e,axis=1),axis=0,return_counts=True);single={tuple(x) for x in u[c==1]};e=np.array([x for x in e if tuple(sorted(x)) in single])
  wall=np.vstack([np.column_stack([e[:,1],e[:,0],e[:,0]+N]),np.column_stack([e[:,1],e[:,0]+N,e[:,1]+N])]);ff=np.vstack([f,f[:,::-1]+N,wall]);m=trimesh.Trimesh(np.vstack([out,inner]),ff,process=False);m.fix_normals();assert m.is_watertight,name
  h=1e-5;x,y=out[:,0],out[:,1];gx=(field(x+h,y)-field(x-h,y))/(2*h);gy=(field(x,y+h)-field(x,y-h))/(2*h)
  nn=np.column_stack([-gx,-gy,np.ones(N)])*sign;nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=np.vstack([nn,-nn]);meshes.append(m)
 return attach_mesh(trimesh.util.concatenate(meshes),name,paint,parent)

def worldpoly(raw):
 a=np.array(raw,float);a[:,0]=S.X(a[:,0]);a[:,1]*=S.sy;return Polygon(a)
# One surface covers both door skin and the rolled belt, with real cut-outs.
cy=.3425/S.sy;rx=.407/S.sx;ry=.395/S.sy;a0=np.arcsin((.225-cy)/ry);angles=np.linspace(np.pi-a0,a0,193)
arch=np.column_stack([-1.5+rx*np.cos(angles),cy+ry*np.sin(angles)])
boundary=np.vstack([[.715,.225],[.715,1.045],[-2.04,1.045],[-2.04,.225],arch])
bodypoly=worldpoly(boundary)
frontpoly=worldpoly([[.715,1.045],[.745,.90],[.745,.72],[.733,.44],[.72,.30],[.64,.29],[-.35,.285],[-.33,.30],[-.315,.49],[-.315,.70],[-.345,.91],[-.37,1.045]])
rearpoly=worldpoly([[-.37,1.045],[-.345,.91],[-.315,.70],[-.315,.49],[-.33,.30],[-.98,.285],[-1.075,.31],[-1.20,.65],[-1.23,.72],[-1.26,.82],[-1.30,.93],[-1.38,1.045]])
doors={'Front':frontpoly.intersection(bodypoly),'Rear':rearpoly.intersection(bodypoly)}
framepoly=bodypoly.difference(unary_union([p.buffer(.0018) for p in doors.values()]))
# Remove ornamental door lines; the panel gaps now exist in the geometry.
for n in list(scene.graph.nodes_geometry):
 if n.startswith(('Side_shell_solid_','Belt_shoulder_joined_','Door_seam_','Door_lower_seam_')):scene.delete_geometry(scene.graph[n][1])
panels={};door_area={}
for sign,sideLabel,physical in [(1,'Left','Right'),(-1,'Right','Left')]:
 solid(framepoly,sign,.060,f'Body_door_jambs_{physical}')
 for which,poly in doors.items():
  doorpoly=poly.buffer(-.0018,join_style=2);pivot=f'Door_pivot_{which}_{physical}';xr=.715 if which=='Front' else -.355
  M=np.eye(4);M[:3,3]=[float(S.X(xr)),.55,sign*(field(float(S.X(xr)),.70)-.018)];scene.graph.update(frame_to=pivot,matrix=M)
  panels[pivot]=(1,sign*np.deg2rad(65 if which=='Front' else 62));door_area[pivot]=doorpoly.area
  solid(doorpoly,sign,.045,f'Door_skin_{which}_{physical}',pivot)
  # Recessed inner trim, not an exposed sheet when the door opens.
  innerpoly=doorpoly.buffer(-.025)
  if not innerpoly.is_empty:
   v,f=trimesh.creation.triangulate_polygon(innerpoly,engine='triangle',triangle_args='pq25a.0008Y');v=np.column_stack([v,sign*(field(v[:,0],v[:,1])-.048)])
   attach_mesh(trimesh.Trimesh(v,f,process=False),f'Door_trim_{which}_{physical}',trim,pivot)
  edge=np.array(poly.exterior.coords);z=sign*(field(edge[:,0],edge[:,1])-.055)
  add(tube(np.column_stack([edge,z]),.003,8),f'Door_aperture_seal_{which}_{physical}',seal)
  # Existing glazing, trim, handles and mirrors follow the correct door.
  names=[n for n in scene.graph.nodes_geometry if (n.startswith(('Window_','Window_frame_','Window_chrome_')) and sideLabel in n and n.endswith('_'+which)) or n in [f'Door_handle_{sideLabel}_{which}',f'Handle_recess_{sideLabel}_{which}']]
  if which=='Front':names += [n for n in scene.graph.nodes_geometry if n in [f'Mirror_{sideLabel}',f'Mirror_stalk_{sideLabel}']]
  for n in list(dict.fromkeys(names)):reparent(n,pivot)
  center=.15 if which=='Front' else -.76
  arm=trimesh.creation.uv_sphere(radius=1,count=[12,20]);arm.apply_scale([.20,.028,.030]);arm.apply_translation([center,.62,sign*.845]);attach_mesh(arm,f'Door_armrest_{which}_{physical}',trim,pivot)
  hand=trimesh.creation.box([.09,.012,.018]);hand.apply_translation([center+.12,.77,sign*.842]);attach_mesh(hand,f'Interior_door_pull_{which}_{physical}',alum,pivot)
# Curved side glazing makes the cloud reflections vary across each pane.
for n in list(scene.graph.nodes_geometry):
 if n.startswith('Window_') and not n.startswith(('Window_frame_','Window_chrome_')):
  M,g=scene.graph[n];oldmesh=scene.geometry[g];world=trimesh.transform_points(oldmesh.vertices,M);poly=Polygon(world[:,:2]).convex_hull
  # Recover the actual ordered boundary rather than the triangulated vertex order.
  mm=oldmesh.copy();loop=max(mm.outline().discrete,key=len);loop=trimesh.transform_points(loop,M);poly=Polygon(loop[:,:2])
  v,f=trimesh.creation.triangulate_polygon(poly,engine='triangle',triangle_args='pq28a.0005Y')
  unique=np.unique(loop,axis=0);fit=RBFInterpolator(unique[:,:2],unique[:,2],kernel='thin_plate_spline',smoothing=1e-9)
  sign=1 if world[:,2].mean()>0 else -1;dist=np.array([poly.boundary.distance(Point(p)) for p in v]);z=fit(v)+sign*.007*(1-np.exp(-dist/.035))
  mesh=trimesh.Trimesh(np.column_stack([v,z]),f,process=False)
  if mesh.face_normals[:,2].mean()*sign<0:mesh.invert()
  parent=scene.graph.transforms.parents[n];scene.delete_geometry(g);attach_mesh(mesh,n,glass,parent)
for n in ['Windshield','Rear_windshield']:
 m=scene.geometry[scene.graph[n][1]];m.visual=trimesh.visual.TextureVisuals(material=glass);m.merge_vertices(digits_vertex=7)
# Trunk lid, its inner lamp halves, number plate and badge form one moving assembly.
M=np.eye(4);M[:3,3]=[-2.0098169,.97889,0];scene.graph.update(frame_to='Trunk_pivot',matrix=M)
trunk_names=[]
for n in list(scene.graph.nodes_geometry):
 if n in ['Trunk_lid','Rear_trunk_face','Factory_trunk_lip','Rear_number_plate','Rear_roundel'] or n.startswith(('Rear_roundel_inlay_','M_badge_stripe_','Trunk_LED_','Reverse_lamp_','Plate_fastener_','Trunk_deck_joint_')) or n.startswith('Rear_lamp_') and '_Inner_' in n or n in [f'Rear_aperture_{p}_{i}' for p in ['wall','back'] for i in [1,3,4]]:
  trunk_names.append(n);reparent(n,'Trunk_pivot')
panels['Trunk_pivot']=(2,-np.deg2rad(65));panels['Hood_pivot']=(2,np.deg2rad(65))
# A shallow inner deck supports the visible lid and moving rear face.
tr=scene.geometry[scene.graph['Trunk_lid'][1]];Mt=scene.graph['Trunk_lid'][0];v=trimesh.transform_points(tr.vertices,Mt);inner=tr.copy();inner.vertices=v-[0,.015,0];inner.invert();attach_mesh(inner,'Trunk_inner_skin',trim,'Trunk_pivot')
def box(size,center,name,mat=trim,parent=None):
 m=trimesh.creation.box(size);m.apply_translation(center);return attach_mesh(m,name,mat,parent)
# The openings reveal simple cabin and luggage compartments.
box([2.06,.045,1.55],[-.50,.30,0],'Cabin_floor')
box([.12,.24,1.40],[.65,.82,0],'Dashboard')
box([.56,.30,.25],[.18,.50,0],'Centre_console')
for z in [-.39,.39]:
 seat=trimesh.creation.uv_sphere(radius=1,count=[16,24]);seat.apply_scale([.28,.07,.25]);seat.apply_translation([-.05,.48,z]);attach_mesh(seat,f'Front_seat_base_{z}',trim)
 back=trimesh.creation.uv_sphere(radius=1,count=[16,24]);back.apply_scale([.07,.29,.23]);back.apply_transform(trimesh.transformations.rotation_matrix(-.14,[0,0,1]));back.apply_translation([-.27,.76,z]);attach_mesh(back,f'Front_seat_back_{z}',trim)
 head=trimesh.creation.uv_sphere(radius=1,count=[12,20]);head.apply_scale([.067,.085,.13]);head.apply_translation([-.30,1.075,z]);attach_mesh(head,f'Front_headrest_{z}',trim)
box([.47,.13,1.31],[-1.09,.49,0],'Rear_seat_cushion');box([.12,.43,1.29],[-1.32,.75,0],'Rear_seat_back')
for z in [-.44,0,.44]:
 head=trimesh.creation.uv_sphere(radius=1,count=[12,20]);head.apply_scale([.055,.075,.13]);head.apply_translation([-1.32,1.04,z]);attach_mesh(head,f'Rear_headrest_{z}',trim)
# Driver's steering wheel is on the physical left (-Z).
theta=np.linspace(0,2*np.pi,90);wheel=np.column_stack([np.full(90,.40),.89+.15*np.sin(theta),-.39+.15*np.cos(theta)]);add(tube(wheel,.016,12),'Cabin_steering_wheel',trim)
for a in [0,2*np.pi/3,4*np.pi/3]:add(tube([[.40,.89,-.39],[.40,.89+.135*np.sin(a),-.39+.135*np.cos(a)]],.012,8),f'Steering_wheel_spoke_{a}',alum)
box([.54,.035,1.08],[-2.17,.43,0],'Trunk_carpet_floor')
box([.025,.41,1.10],[-1.91,.65,0],'Trunk_front_bulkhead')
for z in [-.55,.55]:box([.54,.30,.025],[-2.17,.60,z],f'Trunk_side_liner_{z}')
box([.025,.27,1.10],[-2.44,.56,0],'Trunk_rear_liner')
# Keep the exported black paint below a mirror-like polished-metal finish.
for m in scene.geometry.values():
 if m.visual.material.name=='Black sapphire paint':m.visual.material.roughnessFactor=.34;m.visual.material.metallicFactor=.45
# Dark steel rotors and deep crimson calipers, as requested.
for n in scene.graph.nodes_geometry:
 m=scene.geometry[scene.graph[n][1]]
 if 'Drilled_brake_rotor' in n:
  mat=m.visual.material.copy();mat.name='Dark steel brake rotor';mat.baseColorFactor=[72,76,82,255];mat.metallicFactor=.80;mat.roughnessFactor=.48;m.visual.material=mat
 elif 'Caliper' in n or 'caliper' in n:
  mat=m.visual.material.copy();mat.name='Blood red caliper';mat.baseColorFactor=[105,1,7,255];mat.metallicFactor=.25;mat.roughnessFactor=.30;m.visual.material=mat
stats=export_scene(scene,OUT/'bmw-opening-panels-v18.glb',18,{'method':'Four independent doors, hood and trunk, real openings, curved reflective glazing','door_panel_area_m2':door_area},panels)
stats.update({'method':'Functional opening panels and glazing; no new SF3D generation','doors':4,'hood':1,'trunk':1,'moving_trunk_meshes':len(trunk_names)})
(ROOT/'outputs/car-v18-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))
