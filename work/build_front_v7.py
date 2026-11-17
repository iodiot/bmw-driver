from pathlib import Path
import sys,runpy,json,struct
import numpy as np
import trimesh
WORK=Path(__file__).resolve().parent
sys.path.insert(0,str(WORK))
sys.path.insert(0,str(WORK/'front-libs'))
from shapely.geometry import Polygon,Point
from precision_wheel import build_wheel,solid
d=runpy.run_path(str(WORK/'build_front_v6.py'))
scene=d['scene'];add=d['add'];tube=d['tube'];box=d['box'];hood_point=d['hood_point'];OUT=d['OUT'];ROOT=d['ROOT']
materials=d['materials']
materials['liner']=trimesh.visual.material.PBRMaterial(name='Wheel arch felt',baseColorFactor=[1,1,2,255],roughnessFactor=.95,metallicFactor=0)
materials['brake']=trimesh.visual.material.PBRMaterial(name='Brake rotor steel',baseColorFactor=[85,90,98,255],roughnessFactor=.47,metallicFactor=.78)
materials['caliper']=trimesh.visual.material.PBRMaterial(name='M blue caliper',baseColorFactor=[5,44,115,255],roughnessFactor=.25,metallicFactor=.45)
for name in list(scene.geometry):
    if name.startswith(('Fender_rail_','Hood_gap_')):scene.delete_geometry(name)

AXLE=1.46;CY=.35;ZC=.82;ARCH=.412
def edge(x):
    t=np.clip((x-.36)/1.83,0,1)
    return hood_point(t,1)
def outer_z(x,y):
    return .937+.014*np.exp(-((x-AXLE)/.4)**2)-.014*((y-.58)/.4)**2-.015*np.clip((x-1.9)/.3,0,1)
def top_y(x):return edge(x)[1]-.055
def side_mesh(poly,sign,offset=0):
    v,f=trimesh.creation.triangulate_polygon(poly,engine='earcut')
    v=np.column_stack([v,np.zeros(len(v))]);v,f=trimesh.remesh.subdivide_to_size(v,f,max_edge=.023,max_iter=8)
    v[:,2]=sign*(outer_z(v[:,0],v[:,1])+offset)
    mesh=trimesh.Trimesh(v,f,process=False)
    if mesh.face_normals[:,2].mean()*sign<0:mesh.invert()
    return mesh
arc_start=np.arcsin((.225-CY)/ARCH)
angles=np.linspace(arc_start,np.pi-arc_start,161)
arch_xy=np.column_stack([AXLE+ARCH*np.cos(angles),CY+ARCH*np.sin(angles)])
top_x=np.linspace(.36,2.19,120)
outline=np.vstack([[.36,.225],np.column_stack([top_x,top_y(top_x) if False else [top_y(x) for x in top_x]]),[2.19,.225],arch_xy])
vent=np.array([[.735,.757],[.97,.748],[.951,.698],[.77,.708]])
fender_poly=Polygon(outline,[vent])
assert fender_poly.is_valid
for sign,label in [(1,'Left'),(-1,'Right')]:
    panel=add(side_mesh(fender_poly,sign),f'Fender_{label}_outer')
    inner=side_mesh(fender_poly,sign,-.009);inner.invert();add(inner,f'Fender_{label}_inner','dark')
    verts=[];faces=[];cols=25
    for x in top_x:
        e=edge(x);zin=e[2]+.004;yinner=e[1]-.001;yout=top_y(x);zout=outer_z(x,yout)
        for a in np.linspace(0,1,cols):
            verts.append([x,yinner-(yinner-yout)*(1-np.cos(a*np.pi/2)),sign*(zin+(zout-zin)*np.sin(a*np.pi/2))])
    for i in range(len(top_x)-1):
        for j in range(cols-1):
            a=i*cols+j;faces.extend([[a,a+1,a+cols+1],[a,a+cols+1,a+cols]])
    crown=trimesh.Trimesh(verts,faces,process=False)
    if crown.face_normals[:,1].mean()<0:crown.invert()
    add(crown,f'Fender_{label}_shoulder')
    seam=np.array([[x,edge(x)[1]-.004,sign*(edge(x)[2]+.002)] for x in top_x])
    add(tube(seam,.0022,8),f'Fender_{label}_hood_seam','rubber')
    # Folded arch lip; inner edge stays beyond the tire's steering envelope.
    vv=[];ff=[]
    for a in angles:
        for j in range(7):
            u=j/6;r=ARCH+.002-.007*u
            x=AXLE+r*np.cos(a);y=CY+r*np.sin(a)
            vv.append([x,y,sign*(outer_z(x,y)-.027*u)])
    for i in range(len(angles)-1):
        for j in range(6):
            a=i*7+j;ff.extend([[a,a+1,a+8],[a,a+8,a+7]])
    lip=trimesh.Trimesh(vv,ff,process=False)
    if lip.face_normals[:,2].mean()*sign<0:lip.invert()
    add(lip,f'Fender_{label}_rolled_arch')
    path=np.array([[x,y,sign*(outer_z(x,y)+.001)] for x,y in arch_xy])
    add(tube(path,.0035,8),f'Fender_{label}_arch_edge')
    # Real wheel-well tunnel, no flat disc behind the wheel.
    vv=[];ff=[]
    for a in angles:
        for depth in np.linspace(.59,.917,17):vv.append([AXLE+.422*np.cos(a),CY+.422*np.sin(a),sign*depth])
    for i in range(len(angles)-1):
        for j in range(16):
            a=i*17+j;ff.extend([[a,a+17,a+18],[a,a+18,a+1]])
    liner=trimesh.Trimesh(vv,ff,process=False)
    liner.visual=trimesh.visual.TextureVisuals(material=materials['liner'])
    liner.visual.material.doubleSided=True
    scene.add_geometry(liner,node_name=f'Wheel_well_{label}',geom_name=f'Wheel_well_{label}')
    rear_edge=np.array([[.36,y,sign*outer_z(.36,y)] for y in np.linspace(.225,top_y(.36),60)])
    add(tube(rear_edge,.003),f'Fender_{label}_rear_seam','rubber')
    sill=np.array([[x,.231,sign*outer_z(x,.231)] for x in np.linspace(.36,AXLE+ARCH*np.cos(np.pi-arc_start),55)])
    add(tube(sill,.012,10),f'Fender_{label}_lower_sill','paint')
    # Side vent opening, chrome outline and three independent blades.
    vp=np.array([[x,y,sign*(outer_z(x,y)+.002)] for x,y in np.vstack([vent,vent[0]])])
    add(tube(vp,.0032,10),f'Side_vent_{label}_chrome','chrome')
    back=side_mesh(Polygon(vent),sign,-.018);add(back,f'Side_vent_{label}_recess','rubber')
    for k in range(3):
        y=.719+k*.009
        add(box([.155,.003,.013],[.851,y,sign*(outer_z(.85,y)-.003)]),f'Side_vent_{label}_blade_{k}','dark')
    for k,color in enumerate([[38,123,213,255],[31,44,106,255],[185,14,28,255]]):
        m=box([.014,.012,.003],[.809+k*.015,.738,sign*(outer_z(.81,.738)+.006)])
        m.visual=trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(baseColorFactor=color,roughnessFactor=.3,metallicFactor=.15))
        scene.add_geometry(m,node_name=f'Side_vent_{label}_M_stripe_{k}')

# Pair of front wheels with independent steering and rotation pivots.
parts=[(m,n) for m,n in build_wheel() if n!='Brake_disc']
rotor_poly=Point(0,0).buffer(.215,quad_segs=64).difference(Point(0,0).buffer(.073,quad_segs=32))
for radius,n in [(.174,26),(.196,30)]:
    for a in np.arange(n)*2*np.pi/n:
        rotor_poly=rotor_poly.difference(Point(radius*np.cos(a),radius*np.sin(a)).buffer(.0033,quad_segs=5))
rotor=trimesh.creation.extrude_polygon(rotor_poly,height=.014,engine='earcut');rotor.apply_translation([0,0,.035])
solid(rotor,[85,90,98,255],.78,.47);parts.append((rotor,'Drilled_brake_rotor'))
# Grooves remain exact concentric circles, attached to the rotating tire.
for k,z in enumerate([-.065,-.022,.022,.065]):
    a=np.linspace(0,2*np.pi,193)
    path=np.column_stack([.3503*np.cos(a),.3503*np.sin(a),np.full(len(a),z)])
    groove=tube(path,.0016,6);solid(groove,[0,0,0,255],0,.98);parts.append((groove,f'Tire_groove_{k}'))
for sign,label in [(1,'Left'),(-1,'Right')]:
    steer=f'Steering_{label}';spin=f'Wheel_spin_{label}'
    scene.graph.update(frame_to=steer,matrix=trimesh.transformations.translation_matrix([AXLE,CY,sign*ZC]))
    scene.graph.update(frame_to=spin,frame_from=steer,matrix=np.eye(4))
    for mesh,name in parts:
        part=mesh.copy()
        if sign<0:part.apply_transform(trimesh.transformations.rotation_matrix(np.pi,[0,1,0]))
        scene.add_geometry(part,node_name=f'{name}_{label}',geom_name=f'{name}_{label}',parent_node_name=spin)
    # Brake caliper turns with the steering knuckle but never with wheel rotation.
    ca=np.linspace(2.48,3.40,40)
    cp=np.vstack([np.column_stack([.231*np.cos(ca),.231*np.sin(ca)]),np.column_stack([.165*np.cos(ca[::-1]),.165*np.sin(ca[::-1])])])
    caliper=trimesh.creation.extrude_polygon(Polygon(cp),height=.062,engine='earcut')
    caliper.apply_translation([0,0,.016])
    if sign<0:caliper.apply_transform(np.diag([1,1,-1,1]))
    add(caliper,f'Brake_caliper_{label}','caliper',steer)
    for k in (-1,1):
        bridge=box([.023,.055,.070],[-.17,.045+k*.06,sign*.045])
        add(bridge,f'Caliper_bridge_{label}_{k}','caliper',steer)
    add(box([.035,.080,.004],[-.174,.045,sign*.080]),f'Caliper_badge_{label}','chrome',steer)

# Mounting rails, front support and radiator visible with the hood raised.
for sign in (-1,1):
    add(box([1.55,.070,.060],[1.30,.50,sign*.55]),f'Chassis_front_rail_{sign}','dark')
    add(box([.12,.075,.15],[AXLE,.77,sign*.64]),f'Strut_top_mount_{sign}','dark')
add(box([.10,.09,1.50],[2.02,.58,0]),'Front_cross_member','dark')
add(box([.055,.43,1.25],[1.98,.67,0]),'Radiator_core','dark')
for i,y in enumerate(np.linspace(.47,.87,32)):
    add(box([.012,.003,1.16],[2.015,y,0]),f'Radiator_fin_{i}','mesh')

raw=scene.export(file_type='glb');length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
def accessor(data,typ,count,minv=None,maxv=None):
    while len(blob)%4:blob.append(0)
    offset=len(blob);blob.extend(data);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
    a={'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':count,'type':typ}
    if minv is not None:a.update(min=minv,max=maxv)
    doc['accessors'].append(a);return len(doc['accessors'])-1
times=np.linspace(0,2,9,dtype='<f4');angles=times*np.pi
q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(angles/2),np.cos(angles/2)]).astype('<f4')
ti=accessor(times.tobytes(),'SCALAR',9,[0],[2]);ri=accessor(q.tobytes(),'VEC4',9);channels=[]
for i,node in enumerate(doc['nodes']):
    name=node.get('name','')
    if name.startswith(('Steering_','Wheel_spin_')) or name=='Hood_pivot':
        m=node.pop('matrix',None)
        if m is not None:node['translation']=[m[12],m[13],m[14]]
    if name.startswith('Wheel_spin_'):channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'Front wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'version':7,'method':'Explicit geometric construction','scope':'Front clip: hood, bumper, fenders and two rigged front wheels','steering_degrees':[-25,25],'arch_radius_m':ARCH,'wheel_radius_m':.35}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
path=OUT/'bmw-front-assembly-v7.glb';path.write_bytes(result)
fenders=trimesh.Scene()
for node in scene.graph.nodes_geometry:
    if node.startswith(('Fender_','Side_vent_','Wheel_well_')):
        tr,geom=scene.graph[node];fenders.add_geometry(scene.geometry[geom],node_name=node,transform=tr)
fenders.export(OUT/'bmw-front-fenders-v7.glb')

# Check the actual spinning wheel geometry at every supported steering extreme.
all_vertices=np.vstack([m.vertices for m,n in parts])
worst=0
for yaw in np.linspace(-25,25,11):
    for spin in np.linspace(0,2*np.pi,25):
        R=trimesh.transformations.rotation_matrix(np.deg2rad(yaw),[0,1,0])[:3,:3]@trimesh.transformations.rotation_matrix(spin,[0,0,1])[:3,:3]
        p=all_vertices@R.T
        worst=max(worst,float(np.sqrt(p[:,0]**2+p[:,1]**2).max()))
assert worst<ARCH-.007,f'Wheel intersects arch: {worst}'
stats={'version':7,'method':'Geometric construction; no new Glow Rush generation','objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'front_wheels':2,'fenders':2,'steering_range_degrees':[-25,25],'minimum_arch_radius_clearance_mm':round((ARCH-.007-worst)*1000,2),'wheel_spin_channels':len(channels),'scope':'Front clip study; no cabin, doors or engine'}
(ROOT/'outputs/front-v7-statistics.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats))
