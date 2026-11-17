from pathlib import Path
import ast,sys,json,struct
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(ROOT/'work/front-libs'))
scene=trimesh.load(OUT/'bmw-factory-rear-v14.glb',force='scene',process=False)
before=scene.copy()
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Panel joints',baseColorFactor=[1,1,2,255],roughnessFactor=.55)
for fn in ast.parse((ROOT/'work/build_car_v9.py').read_text(encoding='utf-8-sig')).body:
 if isinstance(fn,ast.FunctionDef) and fn.name in {'add','tube','patch','acc'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'helpers','exec'))
# Work in the previous construction coordinates; calibration is recovered from
# corresponding vertices, so the fixed factory dimensions are not changed.
source=trimesh.load(OUT/'bmw-aluminum-v13.glb',force='scene',process=False)
a=source.geometry[source.graph['Concept_side_Left'][1]].vertices
b=scene.geometry[scene.graph['Concept_side_Left'][1]].vertices
mask=a[:,0]<-1.51
sx,tx=np.polyfit(a[mask,0],b[mask,0],1)
sy=float(np.median(b[:,1]/a[:,1]));sz=float(np.median(b[:,2]/a[:,2]))
# Front portion of the map is recovered independently.
xanchors=np.array([-2.7,-1.5,.715]);newanchors=np.interp(xanchors,np.sort(a[:,0]),b[np.argsort(a[:,0]),0])
def X(x):
 x=np.asarray(x);return np.where(x<-1.5,x*sx+tx,np.interp(x,[-1.5,.715],[-1.482,float(b[a[:,0].argmax(),0])]))
def mapped(v):
 v=np.array(v,float);v[...,0]=X(v[...,0]);v[...,1]*=sy;v[...,2]*=sz;return v
def rx(z,y):return -2.62+.15*(np.abs(z)/.96)**3+.070*np.clip((.48-y)/.25,0,1)**2
def top(z):return .63+.4*np.maximum(0,1-(abs(z)/.945)**7)**(1/7)
def edgez(y):return .945*np.maximum(0,1-(abs((y-.63)/.4))**7)**(1/7)
def skin(x,y):
 b=.931+.010*np.exp(-((x+1.50)/.5)**2)-.004*((y-.62)/.42)**2
 b+=.005*np.exp(-((y-(.875+.012*x))/.075)**2)-.004*np.exp(-((y-.55)/.20)**2)
 b-=.045*np.clip((-x-2.10)/.45,0,1)
 return b
for n in list(scene.graph.nodes_geometry):
 if n.startswith(('Concept_belt_shoulder_','Rear_deck_shoulder_')) or n in ['Trunk_lid','Factory_trunk_lip','Trunk_panel_gap']:
  scene.delete_geometry(scene.graph[n][1])
cut=-2.04
# A rear quarter is a single loft from the existing side to the actual rear
# perimeter. Both sides use the same surface reflected about the centreline.
def outeredge(t,v):
 y0=.225+(.993-.225)*v;ye=.34+(.93-.34)*v;ze=edgez(ye);xe=rx(ze,ye)
 x=cut+(xe-cut)*t;w=t*t*(3-2*t);y=y0+(ye-y0)*w
 z=skin(x,y)*(1-w)+ze*w
 return np.array([x,y,z])
quarter_boundary={}
for sign,label in [(1,'Left'),(-1,'Right')]:
 n=f'Concept_side_{label}';g=scene.graph[n][1];old=scene.geometry[g]
 front=trimesh.intersections.slice_mesh_plane(old,[1,0,0],[float(X(cut)),0,0],cap=False)
 scene.delete_geometry(g);add(front,n)
 rows=[]
 for t in np.linspace(0,1,95):
  row=[]
  for v in np.linspace(0,1,65):
   p=outeredge(t,v);p[2]*=sign;row.append(p)
  rows.append(row)
 mesh=patch(mapped(rows),f'Rear_quarter_continuous_{label}')
 if mesh.face_normals[:,2].mean()*sign<0:mesh.invert()
 quarter_boundary[label]=mapped(np.array(rows)[:,-1])
 # Belt shoulder forward of the rear glass, with no overlapping rear strip.
 rows=[]
 for x in np.linspace(.715,cut,120):
  yo=np.interp(x,[-2.04,.715],[.993,.975]);zi=.795+.005*np.clip((-x-1.90)/.14,0,1)
  rows.append([[x,1.045-(1.045-yo)*(1-np.cos(q*np.pi/2)),sign*(zi+(skin(x,yo)-zi)*np.sin(q*np.pi/2))] for q in np.linspace(0,1,28)])
 patch(mapped(rows),f'Belt_shoulder_joined_{label}')
 # The deck and quarter share this inner edge exactly.
 rows=[]
 for t in np.linspace(0,1,95):
  inner=np.array([cut+(rx(.86,top(.86))-cut)*t,1.045+(top(.86)-1.045)*t,.80+.06*t])
  outer=outeredge(t,1);row=[]
  for q in np.linspace(0,1,37):
   f=np.sin(q*np.pi/2);z=inner[2]+(outer[2]-inner[2])*f
   p=inner+(outer-inner)*f
   p[1]=inner[1]+(outer[1]-inner[1])*(1-np.cos(q*np.pi/2))
   # Converge smoothly onto the same curved perimeter as the rear face.
   endinner=np.array([rx(.86,top(.86)),top(.86),.86]);endouter=outeredge(1,1)
   endstandard=endinner+(endouter-endinner)*f
   endstandard[1]=endinner[1]+(endouter[1]-endinner[1])*(1-np.cos(q*np.pi/2))
   endz=endstandard[2]
   p[0]+=(rx(endz,top(endz))-endstandard[0])*t*t
   p[1]+=(top(endz)-endstandard[1])*t*t
   p[2]*=sign;row.append(p)
  rows.append(row)
 m=patch(mapped(rows),f'Rear_shoulder_continuous_{label}')
 if m.face_normals[:,1].mean()<0:m.invert()
 # Actual edge-to-edge checks, before seam details are added.
 assert np.max(np.linalg.norm(np.array(rows)[:,-1]-np.array([outeredge(t,1)*[1,1,sign] for t in np.linspace(0,1,95)]),axis=1))<1e-12
# Crown and trailing edge follow the top of the same factory rear envelope.
rows=[]
for t in np.linspace(0,1,95):
 row=[]
 for s in np.linspace(-1,1,101):
  z=s*(.80+.06*t);zend=s*.86
  x=cut+(rx(zend,top(zend))-cut)*t
  y=(1-t)*(1.045+.028*(1-s*s))+t*top(zend)
  row.append([x,y,z])
 rows.append(row)
m=patch(mapped(rows),'Trunk_lid')
if m.face_normals[:,1].mean()<0:m.invert()
# Narrow deck seams replace the disconnected oversized lip.
for sign,label in [(1,'Left'),(-1,'Right')]:
 p=np.array(rows)[:,-1 if sign>0 else 0].copy();p[:,1]+=.0004
 add(tube(mapped(p),.0016,8),f'Trunk_deck_joint_{label}',dark)
p=np.array([[rx(z,top(z))-.003,top(z)+.004,z] for z in np.linspace(-.86,.86,160)])
add(tube(mapped(p),.007,12),'Factory_trunk_lip')
# Restore a thin real trunk-face gap (the earlier tube cut through the top).
path=np.array([[-.58,.963],[-.58,.895],[-.535,.647],[-.40,.57],[.40,.57],[.535,.647],[.58,.895],[.58,.963]])
p=np.column_stack([rx(path[:,0],path[:,1])-.002,path[:,1],path[:,0]])
add(tube(mapped(p),.0018,8),'Trunk_face_joint',dark)
# Close the lower quarter with a curved return to the rear bumper perimeter.
# This removes the open black slit seen from the side under the new corner.
for sign,label in [(1,'Left'),(-1,'Right')]:
 rows=[]
 for t in np.linspace(0,1,95):
  out=outeredge(t,0);row=[]
  for q in np.linspace(0,1,37):
   z=out[2]*q
   ye=.63-.4*np.maximum(0,1-(q*edgez(.34)/.945)**7)**(1/7)
   xe=rx(q*edgez(.34),ye)
   x=cut+(xe-cut)*t
   w=t*t*(3-2*t);y=(1-w)*(.225-.028*(1-q*q))+w*ye
   row.append([x,y,sign*z])
  rows.append(row)
 m=patch(mapped(rows),f'Rear_bumper_lower_return_{label}')
 if m.face_normals[:,1].mean()>0:m.invert()

# Check every retained mesh, front detail and wheel rig against the source.
retained=0
for n in before.graph.nodes_geometry:
 if n in scene.graph.nodes_geometry and not n.startswith('Concept_side_') and n not in ['Trunk_lid','Factory_trunk_lip']:
  ma=before.geometry[before.graph[n][1]];mb=scene.geometry[scene.graph[n][1]]
  assert np.array_equal(ma.vertices,mb.vertices),n
  retained+=1
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
doc['asset']['extras']={'version':15,'method':'Separate rear-quarter and trunk surface reconstruction with shared boundary curves','references':['BMW M5 factory dimension drawing, February 2012 press kit','BMW M5 F10 rear quarter, Overlaet, IAA 2011'],'preserved_meshes':retained}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(OUT/'bmw-quarter-refined-v15.glb').write_bytes(result)
stats={'version':15,'objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'method':'Rear quarter / trunk refinement; no new SF3D generation','retained_meshes_identical':retained,'wheel_spin_groups':len(channels),'shared_quarter_shoulder_boundary_error_mm':0.0}
(ROOT/'outputs/car-v15-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))



