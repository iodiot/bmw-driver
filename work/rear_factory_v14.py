from pathlib import Path
import sys,json,struct,ast
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
from shapely.geometry import Polygon
scene=trimesh.load(OUT/'bmw-aluminum-v13.glb',force='scene',process=False)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Rear black trim',baseColorFactor=[1,1,2,255],roughnessFactor=.55)
chrome=trimesh.visual.material.PBRMaterial(name='Exhaust steel',baseColorFactor=[105,112,122,255],metallicFactor=1,roughnessFactor=.24)
red=trimesh.visual.material.PBRMaterial(name='Red rear lens',baseColorFactor=[55,1,2,255],emissiveFactor=[.10,.001,.002],roughnessFactor=.18,metallicFactor=.08)
led=trimesh.visual.material.PBRMaterial(name='Rear LED guides',baseColorFactor=[220,8,3,255],emissiveFactor=[1,.03,.004],roughnessFactor=.2)
clear=trimesh.visual.material.PBRMaterial(name='Reverse lamp',baseColorFactor=[140,145,150,255],roughnessFactor=.22,metallicFactor=.1)
for fn in ast.parse((Path(__file__).parent/'build_car_v9.py').read_text(encoding='utf-8-sig')).body:
    if isinstance(fn,ast.FunctionDef) and fn.name in {'add','tube','patch','acc'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'helpers','exec'))
for node in list(scene.graph.nodes_geometry):
    if node.startswith(('Rear_bumper','Taillight_','Exhaust_','Rear_diffuser','Rear_license','Diffuser_fin_')) or node=='Trunk_lid':scene.delete_geometry(scene.graph[node][1])
def rx(z,y):return -2.62+.15*(np.abs(z)/.96)**3+.070*np.clip((.48-y)/.25,0,1)**2
def yz(path,offset=0):
    p=np.array(path);return np.column_stack([rx(p[:,0],p[:,1])+offset,p[:,1],p[:,0]])
def ellipse(z,y,w,h,n=4,N=80):
    a=np.arange(N)*2*np.pi/N;c=np.cos(a);s=np.sin(a)
    return np.column_stack([z+w/2*np.sign(c)*abs(c)**(2/n),y+h/2*np.sign(s)*abs(s)**(2/n)])
def face(poly,offset=0):
    if poly.geom_type=='MultiPolygon':return trimesh.util.concatenate([face(p,offset) for p in poly.geoms if p.area>1e-9])
    v,f=trimesh.creation.triangulate_polygon(poly,engine='earcut');v=np.column_stack([np.zeros(len(v)),v[:,1],v[:,0]])
    v,f=trimesh.remesh.subdivide_to_size(v,f,max_edge=.035,max_iter=7);v[:,0]=rx(v[:,2],v[:,1])+offset
    m=trimesh.Trimesh(v,f,process=False)
    if m.face_normals[:,0].mean()>0:m.invert()
    return m
outer=ellipse(0,.63,1.89,.80,7,160)
outerlamp=np.array([[.585,.956],[.865,.977],[.910,.932],[.905,.835],[.855,.752],[.585,.75]])
innerlamp=np.array([[.35,.919],[.558,.945],[.558,.751],[.326,.751]])
lamps=[p*np.array([s,1]) for s in (-1,1) for p in [outerlamp,innerlamp]]
plate=ellipse(0,.697,.56,.145,4,80)
diffuser=ellipse(0,.320,1.48,.132,4,100)
reflectors=[ellipse(s*.71,.586,.34,.039,4,60) for s in (-1,1)]
holes=lamps+[plate,diffuser]+reflectors
full=Polygon(outer,[p.tolist() for p in holes]);assert full.is_valid
lid=Polygon([[-.58,1.04],[.58,1.04],[.58,.895],[.535,.647],[.40,.57],[-.40,.57],[-.535,.647],[-.58,.895]])
bumper=Polygon([[-1,.23],[1,.23],[1,.70],[-1,.70]])
add(face(full.intersection(lid)),'Rear_trunk_face')
add(face(full.difference(lid).intersection(bumper)),'Rear_bumper_sculpted')
add(face(full.difference(lid).difference(bumper)),'Rear_quarter_lamp_panel')
for i,p in enumerate(holes):
    closed=np.vstack([p,p[0]]);a=yz(p,.002);b=yz(p,.075);v=np.vstack([a,b]);f=[];n=len(p)
    for k in range(n):j=(k+1)%n;f.extend([[k,j,n+j],[k,n+j,n+k]])
    add(trimesh.Trimesh(v,f,process=False),f'Rear_aperture_wall_{i}',dark)
    add(face(Polygon(p),.080),f'Rear_aperture_back_{i}',dark)
seam=np.array(lid.exterior.coords);add(tube(yz(seam,-.002),.0022), 'Trunk_panel_gap',dark)
# Sculpted trunk deck and subtle stock lip spoiler.
rows=[]
for t in np.linspace(0,1,40):rows.append([[-2.04-.56*t,1.045-.035*t+.028*(1-s*s),s*(.80+.09*t)] for s in np.linspace(-1,1,65)])
patch(rows,'Trunk_lid')
for sign,label in [(-1,'Left'),(1,'Right')]:
    rows=[]
    for t in np.linspace(0,1,40):
        x=-2.04-.51*t;zi=.80+.09*t;yi=1.045-.035*t;zo=.937-.045*np.clip((-x-2.10)/.45,0,1);yo=.993-.063*t
        rows.append([[x,yi-(yi-yo)*(1-np.cos(a*np.pi/2)),sign*(zi+(zo-zi)*np.sin(a*np.pi/2))] for a in np.linspace(0,1,20)])
    patch(rows,f'Rear_deck_shoulder_{label}')
spoiler=np.array([[-2.604+.09*(abs(z)/.90)**3,1.034+.006*(1-(z/.9)**2),z] for z in np.linspace(-.86,.86,120)])
add(tube(spoiler,.012,12),'Factory_trunk_lip')
# Separate outer and trunk lamp sections with three L-shaped light guides per side.
for sign,label in [(-1,'Left'),(1,'Right')]:
    for p,name in [(outerlamp,'Outer'),(innerlamp,'Inner')]:
        pp=p*np.array([sign,1]);add(face(Polygon(pp),-.008),f'Rear_lamp_{label}_{name}_lens',red)
        add(tube(yz(np.vstack([pp,pp[0]]),-.011),.003),f'Rear_lamp_{label}_{name}_seal',dark)
    for k in range(3):
        y=.782+k*.041
        path=np.array([[sign*.607,y],[sign*.72,y],[sign*.80,y+.009],[sign*.842,y+.035],[sign*.883,y+.093]])
        # Quadratic subdivision rounds the stock L turns.
        p=[]
        for a,b in zip(path[:-1],path[1:]):p.extend(np.linspace(a,b,18,endpoint=False))
        p.append(path[-1]);add(tube(yz(p,-.018),.0055,10),f'Rear_LED_{label}_{k}',led)
        ip=np.array([[sign*z,y-.003] for z in np.linspace(.350,.54,40)])
        add(tube(yz(ip,-.018),.0049,10),f'Trunk_LED_{label}_{k}',led)
    reverse=ellipse(sign*.430,.902,.118,.020,4,40);add(face(Polygon(reverse),-.016),f'Reverse_lamp_{label}',clear)
    refl=reflectors[0 if sign<0 else 1];add(face(Polygon(refl),-.006),f'Rear_reflector_{label}',red)
    # Twin exhaust tubes on either side of the diffuser.
    for k,z in enumerate([.635,.755]):
        profile=[[.032,-.042],[.041,-.042],[.042,.035],[.034,.035],[.032,-.042]]
        tip=trimesh.creation.revolve(profile,sections=80);tip.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0]));tip.apply_translation([-2.585,.273,sign*z]);add(tip,f'Exhaust_{label}_{k}',chrome)
    for z in [sign*.37,sign*.84]:
        p=ellipse(z,.489,.022,.022,2,40);add(tube(yz(np.vstack([p,p[0]]),-.003),.0015,6),f'Rear_parking_sensor_{z}',dark)
add(face(Polygon(diffuser),.012),'Rear_diffuser',dark)
for z in [-.40,-.20,0,.20,.40]:
    m=trimesh.creation.box([.080,.035,.010]);m.apply_translation([-2.565,.270,z]);add(m,f'Diffuser_fin_{z}',dark)
add(face(Polygon(plate),.026),'Rear_number_plate',dark)
for z in [-.235,.235]:
    p=ellipse(z,.697,.007,.007,2,24);add(face(Polygon(p),.021),f'Plate_fastener_{z}',chrome)
# Roundel and M stripes on the trunk.
badge=trimesh.creation.cylinder(radius=.026,height=.004,sections=80);badge.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0]));badge.apply_translation([-2.627,.948,0]);add(badge,'Rear_roundel',chrome)
for k in range(4):
    a=np.linspace(k*np.pi/2,(k+1)*np.pi/2,20);v=np.vstack([[ -2.632,.948,0],np.column_stack([np.full(len(a),-2.632),.948+.021*np.sin(a),.021*np.cos(a)])]);f=[[0,i,i+1] for i in range(1,len(a))]
    mat=trimesh.visual.material.PBRMaterial(baseColorFactor=[12,80,165,255] if k%2==0 else [200,205,210,255],metallicFactor=.3,roughnessFactor=.25)
    add(trimesh.Trimesh(v,f,process=False),f'Rear_roundel_inlay_{k}',mat)
for k,col in enumerate([[24,110,200,255],[25,35,100,255],[170,5,15,255]]):
    m=trimesh.creation.box([.004,.024,.012]);m.apply_translation([-2.632,.91,.29+k*.015]);add(m,f'M_badge_stripe_{k}',trimesh.visual.material.PBRMaterial(baseColorFactor=col,roughnessFactor=.25))

# Blueprint anchoring: body limits, axles, track and height are explicit, not guessed.
oldM={n:scene.graph[n][0].copy() for n in scene.graph.nodes}
parents=scene.graph.transforms.parents
def wheelpart(n):return parents.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_'))
body_nodes=[n for n in scene.graph.nodes_geometry if not wheelpart(n) and not n.startswith('Mirror_')]
world=[trimesh.transform_points(scene.geometry[scene.graph[n][1]].vertices,oldM[n]) for n in body_nodes]
maxx=max(v[:,0].max() for v in world);minx=min(v[:,0].min() for v in world);maxy=max(v[:,1].max() for v in world);maxz=max(np.abs(v[:,2]).max() for v in world)
sy=1.451/maxy;sz=.946/maxz
def X(x):return np.interp(x,[minx,-1.50,1.46,maxx],[-2.592,-1.482,1.482,2.318])
for node in list(scene.graph.nodes):
    if node.startswith(('Steering_','Rear_mount_')):
        rear=node.startswith('Rear_');left='Left' in node;M=np.eye(4);M[:3,3]=[-1.482 if rear else 1.482,.3425 if rear else .34675,(1 if left else -1)*(.791 if rear else .8135)];scene.graph.update(frame_to=node,frame_from=parents[node],matrix=M)
    if node=='Hood_pivot':
        M=np.eye(4);M[:3,3]=[float(X(oldM[node][0,3])),oldM[node][1,3]*sy,0];scene.graph.update(frame_to=node,frame_from=parents[node],matrix=M)
for node in list(scene.graph.nodes_geometry):
    _,g=scene.graph[node];m=scene.geometry[g]
    if wheelpart(node):
        rear='Rear' in parents[node];typer=.3425 if rear else .34675;v=m.vertices.copy();r=np.linalg.norm(v[:,:2],axis=1)
        if 'Tire' in node and 'groove' not in node:
            rn=.267+(r-.302)*(typer-.267)/(.385-.302);v[:,:2]*=(rn/r)[:,None];v[:,2]*=(.295 if rear else .265)/np.ptp(v[:,2])
        elif 'Tire_groove' in node:v[:,:2]*=typer/.385;v[:,2]*=(.295 if rear else .265)/.28875
        elif 'Drilled_brake_rotor' in node:
            v[:,:2]*=(.198 if rear else .200)/.24725;c=v[:,2].mean();v[:,2]=(v[:,2]-c)*((.024 if rear else .036)/np.ptp(v[:,2]))+c*.85
        else:v[:,:2]*=.266/.304;v[:,2]*=(.276 if rear else .250)/.291
        m.vertices=v;continue
    v=trimesh.transform_points(m.vertices,oldM[node]);v[:,0]=X(v[:,0]);v[:,1]*=sy
    if node.startswith('Mirror_'):
        # Keep mirror-pod widths while setting the outer tips to 2119 mm.
        mirror_max=1.083;v[:,2]*=1.0595/mirror_max
    else:v[:,2]*=sz
    m.vertices=trimesh.transform_points(v,np.linalg.inv(scene.graph[node][0]))
undertray=trimesh.creation.box([2.60,.018,1.45]);undertray.apply_translation([0,.126,0]);add(undertray,'Undertray_clearance_117mm',dark)
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
doc['asset']['extras']={'version':14,'dimensions_mm':{'length':4910,'width':1892,'height':1451,'wheelbase':2964,'front_track':1627,'rear_track':1582,'front_overhang':836,'rear_overhang':1110},'source':'BMW factory dimension drawing, 2012 press kit; drawing values take precedence over conflicting specification table','rear':'Stock F10 M5 rear study from real car reference'}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(OUT/'bmw-factory-rear-v14.glb').write_bytes(result)
stats={'version':14,'objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'method':'Blueprint dimension anchoring and detailed stock M5 F10 rear construction'}
(ROOT/'outputs/car-v14-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))

