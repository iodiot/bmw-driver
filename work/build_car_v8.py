from pathlib import Path
import sys,json,struct
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
from shapely.geometry import Polygon
scene=trimesh.load(OUT/'bmw-front-assembly-v7.glb',force='scene',process=False)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Body seams',baseColorFactor=[1,1,2,255],roughnessFactor=.6)
glass=trimesh.visual.material.PBRMaterial(name='Smoked windows',baseColorFactor=[3,8,14,255],metallicFactor=.5,roughnessFactor=.12)
chrome=trimesh.visual.material.PBRMaterial(name='Window trim',baseColorFactor=[90,100,115,255],metallicFactor=.85,roughnessFactor=.23)
red=trimesh.visual.material.PBRMaterial(name='Rear lamps',baseColorFactor=[100,2,4,255],emissiveFactor=[.24,.002,.005],roughnessFactor=.22)
def add(mesh,name,mat=paint,parent=None):
    mesh.visual=trimesh.visual.TextureVisuals(material=mat);scene.add_geometry(mesh,node_name=name,geom_name=name,parent_node_name=parent);return mesh
def box(size,pos):
    m=trimesh.creation.box(size);m.apply_translation(pos);return m
def tube(path,r=.006,sides=8):
    p=np.asarray(path,float);closed=np.linalg.norm(p[0]-p[-1])<1e-7
    if closed:p=p[:-1]
    v=[];f=[]
    for i,c in enumerate(p):
        tangent=p[(i+1)%len(p)]-p[(i-1)%len(p)] if closed else p[min(i+1,len(p)-1)]-p[max(i-1,0)]
        tangent/=np.linalg.norm(tangent);n=np.cross(tangent,[0,1,0])
        if np.linalg.norm(n)<.01:n=np.cross(tangent,[1,0,0])
        n/=np.linalg.norm(n);b=np.cross(tangent,n)
        for a in np.arange(sides)*2*np.pi/sides:v.append(c+r*(n*np.cos(a)+b*np.sin(a)))
    for i in range(len(p) if closed else len(p)-1):
        j=(i+1)%len(p)
        for k in range(sides):l=(k+1)%sides;f.extend([[i*sides+k,j*sides+k,j*sides+l],[i*sides+k,j*sides+l,i*sides+l]])
    return trimesh.Trimesh(v,f,process=False)
def patch(rows,name,mat=paint):
    v=np.array(rows);f=[];nx,nz=v.shape[:2]
    for i in range(nx-1):
        for j in range(nz-1):
            a=i*nz+j;f.extend([[a,a+1,a+nz+1],[a,a+nz+1,a+nz]])
    m=trimesh.Trimesh(v.reshape(-1,3),f,process=False);m.visual=trimesh.visual.TextureVisuals(material=mat);m.visual.material.doubleSided=True
    return add(m,name,mat)
def flat_polygon(points,name,mat=paint):
    points=np.asarray(points,float);c=points.mean(0);_,_,vh=np.linalg.svd(points-c,full_matrices=False);basis=vh[:2].T
    uv=(points-c)@basis;p=Polygon(uv)
    v,f=trimesh.creation.triangulate_polygon(p,engine='earcut');m=trimesh.Trimesh(c+v@basis.T,f,process=False);mat.doubleSided=True;return add(m,name,mat)
def belt(x):return np.interp(x,[-2.55,-2.1,-.3,.36],[.93,.985,.97,.915])
def side_z(x,y):return .937+.014*np.exp(-((x+1.5)/.4)**2)-.014*((y-.58)/.4)**2-.055*np.clip((-x-2.13)/.42,0,1)
rear_axle=-1.50;R=.412;a0=np.arcsin((.225-.35)/R)
arc=np.linspace(np.pi-a0,a0,121)
arcxy=np.column_stack([rear_axle+R*np.cos(arc),.35+R*np.sin(arc)])
xx=np.linspace(.36,-2.55,100)
outline=np.vstack([[.36,.225],np.column_stack([xx,[belt(x) for x in xx]]),[-2.55,.225],arcxy])
for sign,label in [(1,'Left'),(-1,'Right')]:
    poly=Polygon(outline);v,f=trimesh.creation.triangulate_polygon(poly,engine='earcut')
    v=np.column_stack([v,np.zeros(len(v))]);v,f=trimesh.remesh.subdivide_to_size(v,f,max_edge=.075,max_iter=6);v[:,2]=sign*side_z(v[:,0],v[:,1])
    m=trimesh.Trimesh(v,f,process=False)
    if m.face_normals[:,2].mean()*sign<0:m.invert()
    add(m,f'Body_{label}_doors_and_rear_quarter')
    # Belt shoulder closes the upper side to the window sill and trunk.
    rows=[]
    for x in xx:
        y=belt(x);zin=.79 if x> -2.1 else .79+.07*np.clip((-x-2.1)/.45,0,1)
        rows.append([[x,y+.055*(1-t*t),sign*(zin+(side_z(x,y)-zin)*t)] for t in np.linspace(0,1,15)])
    patch(rows,f'Body_{label}_belt_shoulder')
    archpath=[[x,y,sign*(side_z(x,y)+.001)] for x,y in arcxy]
    add(tube(archpath,.004),f'Rear_arch_{label}_lip')
    # Rough door boundaries and handles, each separately named for later editing.
    for x,name in [(.345,'Front_edge'),(-.62,'B_pillar'),(-1.29,'Rear_edge')]:
        ylo=.245 if x> -1.07 else .35+np.sqrt(max(0,R**2-(x+1.5)**2))+.008
        p=[[x,y,sign*(side_z(x,y)+.002)] for y in np.linspace(ylo,belt(x)-.008,35)]
        add(tube(p,.002),f'Door_seam_{label}_{name}',dark)
    for x,name in [(-.15,'Front'),(-1.08,'Rear')]:
        add(box([.13,.018,.018],[x,.845,sign*(side_z(x,.845)+.006)]),f'Door_handle_{label}_{name}',chrome)
    add(tube([[x,.239,sign*side_z(x,.239)] for x in np.linspace(-1.07,.35,70)],.013),f'Side_sill_{label}')
    # Front and rear side glazing with coarse A/B/C pillars.
    front=np.array([[.285,1.035,.79],[-.18,1.435,.68],[-.59,1.465,.68],[-.59,1.038,.79]])
    rear=np.array([[-.65,1.038,.79],[-.65,1.465,.68],[-1.40,1.432,.675],[-1.78,1.085,.78],[-1.84,1.038,.79]])
    for points,name in [(front,'Front'),(rear,'Rear')]:
        points[:,2]*=sign
        flat_polygon(points,f'Window_{label}_{name}',glass)
        add(tube(np.vstack([points,points[0]]),.010,10),f'Window_frame_{label}_{name}',paint)
        add(tube(np.vstack([points,points[0]]),.0023,8),f'Window_trim_{label}_{name}',chrome)
    cp=np.array([[-1.40,1.432,sign*.675],[-1.44,1.46,sign*.68],[-2.03,1.04,sign*.79],[-1.84,1.038,sign*.79],[-1.78,1.085,sign*.78]])
    flat_polygon(cp,f'C_pillar_{label}')
    add(tube([[.30,1.025,sign*.80],[-.18,1.455,sign*.69]],.024,12),f'A_pillar_{label}')
    add(tube([[-.62,1.045,sign*.79],[-.62,1.47,sign*.68]],.024,10),f'B_pillar_{label}',dark)
    # Quick mirror pods attached near the A pillar.
    add(box([.12,.025,.12],[.20,1.015,sign*.91]),f'Mirror_stalk_{label}',dark)
    mirror=trimesh.creation.icosphere(subdivisions=2,radius=1);mirror.apply_scale([.115,.055,.08]);mirror.apply_translation([.19,1.045,sign*1.005]);add(mirror,f'Mirror_{label}')

# Curved windshield, roof, rear glass and trunk lid.
rows=[]
for t in np.linspace(0,1,25):
    rows.append([[.30-.48*t-.015*(1-s*s),1.035+.405*t+.012*(1-s*s),s*(.79-.11*t)] for s in np.linspace(-1,1,49)])
patch(rows,'Windshield',glass)
rows=[]
for t in np.linspace(0,1,50):
    rows.append([[-.18-1.26*t,1.45+.025*np.sin(np.pi*t)+.034*(1-s*s),s*(.69-.01*t)] for s in np.linspace(-1,1,49)])
patch(rows,'Roof')
rows=[]
for t in np.linspace(0,1,25):rows.append([[-1.44-.59*t,1.46-.42*t+.01*(1-s*s),s*(.68+.11*t)] for s in np.linspace(-1,1,49)])
patch(rows,'Rear_windshield',glass)
rows=[]
for t in np.linspace(0,1,25):rows.append([[-2.03-.52*t,1.04-.095*t+.025*(1-s*s),s*(.79+.06*t)] for s in np.linspace(-1,1,49)])
patch(rows,'Trunk_lid')
add(box([.07,.025,1.57],[.335,1.012,0]),'Windshield_cowl',dark)
add(box([2.72,.045,1.65],[-1.0,.22,0]),'Cabin_floor',dark)

# Simple rounded rear fascia, red lamps, lower diffuser and four exhaust tips.
yy=np.linspace(.235,.95,24);zz=np.linspace(-.9,.9,65)
patch([[[-2.59+.075*(abs(z)/.9)**3,y,z] for z in zz] for y in yy],'Rear_bumper')
for sign in (-1,1):
    p=[[-2.60,.82,sign*z] for z in np.linspace(.28,.82,50)]+[[-2.60,y,sign*.82] for y in np.linspace(.82,.87,10)]
    add(tube(p,.021,10),f'Taillight_{sign}',red)
    for k,z in enumerate([.64,.73]):
        profile=[[.026,-.075],[.034,-.075],[.035,.065],[.027,.065],[.026,-.075]]
        tip=trimesh.creation.revolve(profile,sections=48);tip.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0]));tip.apply_translation([-2.60,.26,sign*z]);add(tip,f'Exhaust_{sign}_{k}',chrome)
add(box([.045,.12,1.50],[-2.60,.285,0]),'Rear_diffuser',dark)
add(box([.008,.10,.42],[-2.67,.63,0]),'Rear_license_plate_mount',dark)
for z in np.linspace(-.55,.55,5):add(box([.13,.08,.012],[-2.62,.225,z]),f'Diffuser_fin_{z}',dark)

# Reuse front wheel meshes at the rear. Rear calipers do not rotate with the rims.
source_nodes=list(scene.graph.nodes_geometry)
parents=scene.graph.transforms.parents
for sign,label in [(1,'Left'),(-1,'Right')]:
    mount=f'Rear_mount_{label}';spin=f'Wheel_spin_Rear_{label}'
    scene.graph.update(frame_to=mount,matrix=trimesh.transformations.translation_matrix([rear_axle,.35,sign*.82]))
    scene.graph.update(frame_to=spin,frame_from=mount,matrix=np.eye(4))
    for node in source_nodes:
        parent=parents.get(node)
        if parent not in (f'Wheel_spin_{label}',f'Steering_{label}'):continue
        _,geom=scene.graph[node];target=spin if parent.startswith('Wheel_spin_') else mount
        scene.add_geometry(scene.geometry[geom].copy(),node_name=f'Rear_copy_{node}',geom_name=f'Rear_copy_{node}',parent_node_name=target)

raw=scene.export(file_type='glb');length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
def accessor(data,typ,count,minv=None,maxv=None):
    while len(blob)%4:blob.append(0)
    offset=len(blob);blob.extend(data);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
    a={'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':count,'type':typ}
    if minv is not None:a.update(min=minv,max=maxv)
    doc['accessors'].append(a);return len(doc['accessors'])-1
times=np.linspace(0,2,9,dtype='<f4');a=times*np.pi;q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(a/2),np.cos(a/2)]).astype('<f4')
ti=accessor(times.tobytes(),'SCALAR',9,[0],[2]);ri=accessor(q.tobytes(),'VEC4',9);channels=[]
for i,n in enumerate(doc['nodes']):
    name=n.get('name','')
    if name.startswith(('Steering_','Wheel_spin_','Rear_mount_')) or name=='Hood_pivot':
        m=n.pop('matrix',None)
        if m is not None:n['translation']=[m[12],m[13],m[14]]
    if name.startswith('Wheel_spin_'):channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'All wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'version':8,'scope':'Quick full-car blockout retaining detailed front clip; rear wheels copied from front','method':'Geometric construction'}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
path=OUT/'bmw-full-blockout-v8.glb';path.write_bytes(result)
stats={'version':8,'method':'Quick geometric blockout, rear wheels reused from front','objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'wheels':len(channels),'scope':'Full exterior blockout; no interior detail'}
assert len(channels)==4
(ROOT/'outputs/car-v8-statistics.json').write_text(json.dumps(stats,indent=2),encoding='utf-8');print(json.dumps(stats))
