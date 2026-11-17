from pathlib import Path
import sys,json,struct
import numpy as np
import trimesh
from scipy.interpolate import PchipInterpolator
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
from shapely.geometry import Polygon
source=trimesh.load(OUT/'bmw-full-blockout-v8.glb',force='scene',process=False)
scene=trimesh.Scene()
parents=source.graph.transforms.parents
for node in source.graph.nodes:
    if node==source.graph.base_frame:continue
    parent=parents.get(node,source.graph.base_frame)
    world,geom=source.graph[node];pw=source.graph[parent][0]
    local=np.linalg.inv(pw)@world
    if geom is None:scene.graph.update(frame_to=node,frame_from=parent,matrix=local)
    else:scene.add_geometry(source.geometry[geom].copy(),node_name=node,geom_name=node,parent_node_name=parent,transform=local)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Body seams',baseColorFactor=[1,1,2,255],roughnessFactor=.6)
glass=trimesh.visual.material.PBRMaterial(name='Smoked windows',baseColorFactor=[2,5,9,255],metallicFactor=.32,roughnessFactor=.13)
chrome=trimesh.visual.material.PBRMaterial(name='Window trim',baseColorFactor=[95,105,115,255],metallicFactor=.85,roughnessFactor=.23)
def add(m,name,mat=paint):
    m.visual=trimesh.visual.TextureVisuals(material=mat);mat.doubleSided=True;scene.add_geometry(m,node_name=name,geom_name=name);return m
def tube(path,r=.005,sides=10):
    p=np.asarray(path,float);closed=np.linalg.norm(p[0]-p[-1])<1e-7
    if closed:p=p[:-1]
    v=[];f=[]
    for i,c in enumerate(p):
        t=p[(i+1)%len(p)]-p[(i-1)%len(p)] if closed else p[min(i+1,len(p)-1)]-p[max(i-1,0)]
        t/=np.linalg.norm(t);n=np.cross(t,[0,1,0])
        if np.linalg.norm(n)<.01:n=np.cross(t,[1,0,0])
        n/=np.linalg.norm(n);b=np.cross(t,n)
        for a in np.arange(sides)*2*np.pi/sides:v.append(c+r*(n*np.cos(a)+b*np.sin(a)))
    for i in range(len(p) if closed else len(p)-1):
        j=(i+1)%len(p)
        for k in range(sides):l=(k+1)%sides;f.extend([[i*sides+k,j*sides+k,j*sides+l],[i*sides+k,j*sides+l,i*sides+l]])
    return trimesh.Trimesh(v,f,process=False)
def patch(rows,name,mat=paint):
    v=np.array(rows);n,m=v.shape[:2];f=[]
    for i in range(n-1):
        for j in range(m-1):
            a=i*m+j;f.extend([[a,a+1,a+m+1],[a,a+m+1,a+m]])
    return add(trimesh.Trimesh(v.reshape(-1,3),f,process=False),name,mat)
def flat(points,name,mat):
    p=np.array(points);c=p.mean(0);_,_,vh=np.linalg.svd(p-c,full_matrices=False);B=vh[:2].T
    uv=(p-c)@B;v,f=trimesh.creation.triangulate_polygon(Polygon(uv),engine='earcut')
    return add(trimesh.Trimesh(c+v@B.T,f,process=False),name,mat)
def old_hood(t,s):
    z=(.80+.035*np.sin(np.pi*t)-.02*t)*s
    y=1.025-.085*t+.022*np.sin(np.pi*t)-.055*abs(s)**2
    y+=.018*np.exp(-((abs(z)-(.28+.045*t))/.035)**2)*np.sin(np.pi*(.10+.82*t))
    y+=.010*np.exp(-((abs(z)-.57)/.026)**2)*np.sin(np.pi*(.08+.84*t))
    return np.array([.36+1.91*t-.08*abs(s)**3*t,y,z])
def new_hood(t,s):
    z=(.80+.025*np.sin(np.pi*t)-.02*t)*s
    y=1.025-.060*t+.016*np.sin(np.pi*t)-.025*abs(s)**2
    y+=.008*np.exp(-((abs(z)-(.29+.035*t))/.05)**2)*np.sin(np.pi*(.12+.76*t))
    return np.array([.36+1.91*t-.10*s*s*t,y,z])
def normal_smooth(m):
    p,inv=np.unique(np.round(m.vertices,6),axis=0,return_inverse=True)
    w=trimesh.Trimesh(p,inv[m.faces],process=False);m.vertex_normals=w.vertex_normals[inv]
def remap_arch(v,axle):
    v=v.copy();dx=v[:,0]-axle;dy=v[:,1]-.35;r=np.hypot(dx,dy)
    w=np.clip(1-np.maximum(0,r-.412)/.19,0,1)
    w*=np.clip((.93-v[:,1])/.13,0,1)
    w*=np.clip((.72-np.abs(dx))/.18,0,1)
    v[:,0]+=dx*(.455/.412-1)*w
    v[:,1]+=(.035+dy*(.455/.412-1))*w
    return v
nose_curve=PchipInterpolator([.2,.3,.53,.70,.84,.98],[-.13,-.095,.025,.015,-.035,-.11],extrapolate=True)
def front_offset(y,z):
    delta=nose_curve(np.clip(y,.2,.98))
    return delta-.025*(np.abs(z)/.96)**4
def side_profile(x,y,front=False):
    if front:return .937+.014*np.exp(-((x-1.46)/.4)**2)-.014*((y-.58)/.4)**2-.015*np.clip((x-1.9)/.3,0,1)
    return .937+.014*np.exp(-((x+1.5)/.4)**2)-.014*((y-.58)/.4)**2-.055*np.clip((-x-2.13)/.42,0,1)
front_prefix=('Bumper_','Aperture_','Kidney_','Projector_','LED_','Indicator_','Headlamp_','Intake_','Lower_splitter','Parking_','Headlight_washer','License_','Plate_')
for node in list(scene.graph.nodes_geometry):
    _,geom=scene.graph[node];m=scene.geometry[geom]
    parent=scene.graph.transforms.parents.get(node,'')
    # All four wheels: 10% larger tires, 15% larger alloys and brakes.
    if parent.startswith(('Wheel_spin_','Steering_','Rear_mount_')):
        scale=1.10 if 'Tire' in node else 1.15
        m.apply_scale([scale,scale,1.05])
        if 'caliper' in node.lower() or 'Caliper_' in node:
            m.visual.material=m.visual.material.copy();m.visual.material.name='Red caliper';m.visual.material.baseColorFactor=[190,2,4,255];m.visual.material.metallicFactor=.3;m.visual.material.roughnessFactor=.26
        if 'Drilled_brake_rotor' in node:
            m.visual.material=m.visual.material.copy();m.visual.material.name='Red brake rotor';m.visual.material.baseColorFactor=[120,3,6,255];m.visual.material.metallicFactor=.65;m.visual.material.roughnessFactor=.36
        continue
    if node.startswith(front_prefix):
        v=m.vertices.copy();v[:,0]+=front_offset(v[:,1],v[:,2]);v[:,1]-=.025*np.clip((v[:,1]-.88)/.10,0,1)**2;m.vertices=v
        continue
    if node.startswith('Hood_'):
        v=m.vertices.copy();world=v+np.array([.36,1.025,0])
        for i,p in enumerate(world):
            t=np.clip((p[0]-.36)/1.85,0,1);s=np.clip(p[2]/(.8-.02*t),-1.1,1.1)
            v[i]+=new_hood(t,s)-old_hood(t,s)
        if node in ('Hood_outer','Hood_inner') and len(v)==97*81:
            v=np.array([new_hood(t,s)-[.36,1.025,0] for t in np.linspace(0,1,97) for s in np.linspace(-1,1,81)])
            if node=='Hood_inner':v[:,1]-=.018
        m.vertices=v;normal_smooth(m)
        continue
    if node.startswith(('Fender_','Wheel_well_','Body_','Rear_arch_','Door_seam_','Side_sill_')):
        v=m.vertices.copy()
        if node.startswith('Fender_') and ('shoulder' in node or 'hood_seam' in node):
            t=np.clip((v[:,0]-.36)/1.83,0,1);z=np.clip((.95-np.abs(v[:,2]))/.15,0,1)
            v[:,1]+=(.025+.035*t)*z
        v=remap_arch(v,1.46 if node.startswith(('Fender_','Wheel_well_')) else -1.5)
        if 'doors_and_rear_quarter' in node or node.endswith('_outer'):
            front=node.startswith('Fender_');sign=1 if 'Left' in node else -1
            x,y=v[:,0],v[:,1];v[:,2]=sign*side_profile(x,y,front);m.vertices=v
            h=.0001;gx=(side_profile(x+h,y,front)-side_profile(x-h,y,front))/(2*h);gy=(side_profile(x,y+h,front)-side_profile(x,y-h,front))/(2*h)
            normals=np.column_stack([-gx,-gy,np.ones(len(v))])*sign;normals/=np.linalg.norm(normals,axis=1)[:,None];m.vertex_normals=normals
        else:m.vertices=v;normal_smooth(m)

# Raise all axle pivots to retain ground contact with the larger tires.
for node in list(scene.graph.nodes):
    if node.startswith(('Steering_','Rear_mount_')):
        parent=scene.graph.transforms.parents[node];world=scene.graph[node][0];pw=scene.graph[parent][0];local=np.linalg.inv(pw)@world;local[1,3]=.385
        scene.graph.update(frame_to=node,frame_from=parent,matrix=local)

# Rebuild the cabin with a rounded roof, sloped pillars and a distinct rear deck.
remove_prefix=('Window_','C_pillar_','A_pillar_','B_pillar_','Mirror_')
remove_exact={'Roof','Windshield','Rear_windshield','Trunk_lid','Windshield_cowl'}
for node in list(scene.graph.nodes_geometry):
    if node.startswith(remove_prefix) or node in remove_exact:
        _,g=scene.graph[node];scene.delete_geometry(g)
for sign,label in [(1,'Left'),(-1,'Right')]:
    front=np.array([[.49,1.045,.79],[-.035,1.417,.685],[-.57,1.452,.68],[-.57,1.042,.79]])
    rear=np.array([[-.63,1.042,.79],[-.63,1.452,.68],[-1.205,1.415,.68],[-1.66,1.095,.78],[-1.73,1.047,.79]])
    for p,name in [(front,'Front'),(rear,'Rear')]:
        p[:,2]*=sign;flat(p,f'Window_{label}_{name}',glass);path=np.vstack([p,p[0]])
        add(tube(path,.013),f'Window_frame_{label}_{name}',paint);add(tube(path,.0022),f'Window_trim_{label}_{name}',chrome)
    flat([[-1.205,1.415,sign*.68],[-1.25,1.44,sign*.69],[-1.86,1.045,sign*.79],[-1.73,1.047,sign*.79],[-1.66,1.095,sign*.78]],f'C_pillar_{label}',paint)
    add(tube([[.515,1.035,sign*.80],[-.015,1.44,sign*.69]],.023,12),f'A_pillar_{label}',paint)
    add(tube([[-.60,1.043,sign*.79],[-.60,1.46,sign*.68]],.024),f'B_pillar_{label}',dark)
    stalk=trimesh.creation.box([.10,.022,.11]);stalk.apply_translation([.35,1.015,sign*.91]);add(stalk,f'Mirror_stalk_{label}',dark)
    mirror=trimesh.creation.uv_sphere(radius=1,count=[16,24]);mirror.apply_scale([.105,.05,.075]);mirror.apply_translation([.34,1.045,sign*1.00]);add(mirror,f'Mirror_{label}')
patch([[[.515-.55*t-.025*(1-s*s),1.035+.405*t+.018*(1-s*s),s*(.80-.11*t)] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,35)],'Windshield',glass)
patch([[[ -.015-1.235*t,1.44+.033*np.sin(np.pi*t)+.032*(1-s*s),s*(.69-.005*np.sin(np.pi*t))] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,65)],'Roof')
patch([[[-1.25-.61*t,1.44-.395*t+.016*(1-s*s),s*(.69+.10*t)] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,35)],'Rear_windshield',glass)
patch([[[-1.86-.69*t,1.045-.10*t+.025*(1-s*s),s*(.79+.06*t)] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,35)],'Trunk_lid')
patch([[[x,1.025+.012*np.sin((x-.35)/.17*np.pi),z] for z in np.linspace(-.8,.8,45)] for x in np.linspace(.35,.52,12)],'Windshield_cowl',dark)

# Enforce exact reflected geometry for every named left/right pair.
nodes=set(scene.graph.nodes_geometry);pairs=0
for left in sorted(nodes):
    if 'Left' not in left:continue
    right=left.replace('Left','Right')
    if right not in nodes:continue
    _,lg=scene.graph[left];_,rg=scene.graph[right]
    reflected=scene.geometry[lg].copy();reflected.apply_transform(np.diag([1,1,-1,1]));scene.geometry[rg]=reflected;pairs+=1
    assert np.allclose(np.sort(scene.geometry[lg].vertices[:,1]),np.sort(scene.geometry[rg].vertices[:,1]))
raw=scene.export(file_type='glb');length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
def acc(data,typ,count,lo=None,hi=None):
    while len(blob)%4:blob.append(0)
    offset=len(blob);blob.extend(data);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
    a={'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':count,'type':typ}
    if lo is not None:a.update(min=lo,max=hi)
    doc['accessors'].append(a);return len(doc['accessors'])-1
times=np.linspace(0,2,9,dtype='<f4');angle=times*np.pi;q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(angle/2),np.cos(angle/2)]).astype('<f4')
ti=acc(times.tobytes(),'SCALAR',9,[0],[2]);ri=acc(q.tobytes(),'VEC4',9);channels=[]
for i,n in enumerate(doc['nodes']):
    name=n.get('name','')
    if name.startswith(('Steering_','Wheel_spin_','Rear_mount_')) or name=='Hood_pivot':
        m=n.pop('matrix',None)
        if m is not None:n['translation']=[m[12],m[13],m[14]]
    if name.startswith('Wheel_spin_'):channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'All wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'version':9,'method':'Geometric refinement','symmetry_pairs':pairs,'tire_scale':1.10,'rim_and_brake_scale':1.15,'calipers':'red','rotors':'red','body':'Rounded nose and hood; sedan cabin proportions'}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(OUT/'bmw-sedan-refined-v9.glb').write_bytes(result)
stats={'version':9,'method':'Geometric refinement, no new Glow Rush generation','objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'wheels':len(channels),'mirrored_pairs':pairs,'tire_diameter_m':.77,'rim_and_brake_increase_percent':15,'calipers':'red','rotors':'red'}
(ROOT/'outputs/car-v9-statistics.json').write_text(json.dumps(stats,indent=2),encoding='utf-8');print(json.dumps(stats))
