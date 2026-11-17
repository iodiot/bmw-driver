from pathlib import Path
import sys,ast,json,struct
import numpy as np
import trimesh
from scipy.spatial import Delaunay
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
from shapely.geometry import Polygon,Point
scene=trimesh.load(OUT/'bmw-side-concept-v11.glb',force='scene',process=False)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(baseColorFactor=[1,1,2,255],roughnessFactor=.65)
glass=trimesh.visual.material.PBRMaterial(baseColorFactor=[2,4,7,255],roughnessFactor=.18)
chrome=trimesh.visual.material.PBRMaterial(baseColorFactor=[205,211,220,255],metallicFactor=.72,roughnessFactor=.24)
for fn in ast.parse((Path(__file__).parent/'build_car_v9.py').read_text(encoding='utf-8-sig')).body:
    if isinstance(fn,ast.FunctionDef) and fn.name in {'add','patch','acc'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'helpers','exec'))
def fenderz(x,y):return .937+.014*np.exp(-((x-1.46)/.4)**2)-.014*((y-.58)/.4)**2-.015*np.clip((x-1.9)/.3,0,1)
def skin(x,y):
    b=.931+.010*np.exp(-((x+1.50)/.5)**2)-.004*((y-.62)/.42)**2
    b+=.005*np.exp(-((y-(.875+.012*x))/.075)**2)-.004*np.exp(-((y-.55)/.20)**2)
    b-=.045*np.clip((-x-2.10)/.45,0,1)
    t=np.clip((x-.38)/.335,0,1);w=t*t*(3-2*t)
    return b*(1-w)+fenderz(x,y)*w
def side_normals(m,sign,fun):
    x,y=m.vertices[:,0],m.vertices[:,1];h=.0001
    gx=(fun(x+h,y)-fun(x-h,y))/(2*h);gy=(fun(x,y+h)-fun(x,y-h))/(2*h)
    n=np.column_stack([-gx,-gy,np.ones(len(x))])*sign;n/=np.linalg.norm(n,axis=1)[:,None];m.vertex_normals=n
for node in list(scene.graph.nodes_geometry):
    _,g=scene.graph[node];m=scene.geometry[g]
    if node.startswith(('Concept_side_','Concept_belt_shoulder_')):scene.delete_geometry(g);continue
    if node.startswith('Fender_') and any(s in node for s in ['_outer','_inner','_shoulder']):
        sign=1 if 'Left' in node else -1;v=m.vertices.copy();x=v[:,0];oldy=v[:,1].copy()
        w=np.clip((2.19-x)/1.475,0,1)*np.clip((oldy-.86)/.055,0,1)
        if '_shoulder' in node:w*=np.clip((np.abs(v[:,2])-.80)/.14,0,1)
        v[:,1]+=.065*w
        if '_outer' in node or '_inner' in node:v[:,2]=sign*(fenderz(x,v[:,1])-(.009 if '_inner' in node else 0))
        else:v[:,2]+=sign*(fenderz(x,v[:,1])-fenderz(x,oldy))*np.clip((np.abs(v[:,2])-.80)/.14,0,1)
        m.vertices=v
        if '_outer' in node:side_normals(m,sign,fenderz)
    if node in ['Tire_Left','Tire_Right','Rear_copy_Tire_Left','Rear_copy_Tire_Right']:
        v=m.vertices.copy();r=np.linalg.norm(v[:,:2],axis=1);new=.302+(r-.2739)*(.385-.302)/(.385-.2739);v[:,:2]*=(new/r)[:,None];m.vertices=v
    if node in ['Rim_Left','Rim_Right','Rear_copy_Rim_Left','Rear_copy_Rim_Right']:
        profile=[[.274,-.137],[.298,-.137],[.304,-.125],[.304,.136],[.301,.151],[.289,.154],[.276,.145],[.274,.123],[.274,-.137]]
        rim=trimesh.creation.revolve(profile,sections=192)
        if node.endswith('Right'):rim.apply_transform(np.diag([1,1,-1,1]))
        rim.visual=trimesh.visual.TextureVisuals(material=chrome);scene.geometry[g]=rim

# Uniform side triangulation removes skinny fan triangles at the shoulder crease.
cy=.385;R=.455;a0=np.arcsin((.225-cy)/R);a=np.linspace(np.pi-a0,a0,100)
arch=np.column_stack([-1.50+R*np.cos(a),cy+R*np.sin(a)])
xx=np.linspace(.715,-2.55,130);top=np.interp(xx,[-2.55,-2.05,.715],[.93,.993,.975])
boundary=np.vstack([[.715,.225],np.column_stack([xx,top]),[-2.55,.225],arch]);poly=Polygon(boundary)
grid=np.array([[x,y] for x in np.arange(-2.55,.716,.027) for y in np.arange(.225,1.00,.023) if poly.contains(Point(x,y))])
points=np.unique(np.round(np.vstack([boundary,grid]),7),axis=0);tri=Delaunay(points).simplices
faces=np.array([f for f in tri if poly.covers(Polygon(points[f]))])
for sign,label in [(1,'Left'),(-1,'Right')]:
    v=np.column_stack([points,sign*skin(points[:,0],points[:,1])]);m=trimesh.Trimesh(v,faces,process=False)
    if m.face_normals[:,2].mean()*sign<0:m.invert()
    side_normals(m,sign,skin);add(m,f'Concept_side_{label}')
    rows=[]
    for x,y in zip(xx,top):
        rows.append([[x,1.045-(1.045-y)*(1-np.cos(t*np.pi/2)),sign*(.795+(skin(x,y)-.795)*np.sin(t*np.pi/2))] for t in np.linspace(0,1,30)])
    patch(rows,f'Concept_belt_shoulder_{label}')

raw=scene.export(file_type='glb');length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
times=np.linspace(0,2,9,dtype='<f4');angle=-times*np.pi;q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(angle/2),np.cos(angle/2)]).astype('<f4')
ti=acc(times.tobytes(),'SCALAR',9,[0],[2]);ri=acc(q.tobytes(),'VEC4',9);channels=[]
for i,n in enumerate(doc['nodes']):
    name=n.get('name','')
    if name.startswith(('Steering_','Wheel_spin_','Rear_mount_')) or name=='Hood_pivot':
        m=n.pop('matrix',None)
        if m is not None:n['translation']=[m[12],m[13],m[14]]
    if name.startswith('Wheel_spin_'):channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'Forward wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'version':12,'method':'Geometric refinement','changes':'Uniform side mesh, fender continuity, metallic rim barrels and corrected tire bead, steel brake rotors, red calipers'}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(OUT/'bmw-surface-wheel-v12.glb').write_bytes(result)
stats={'version':12,'objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'method':'Uniform side topology and corrected rim/tire fit; no new Glow Rush generation'}
(ROOT/'outputs/car-v12-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))
