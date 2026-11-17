from pathlib import Path
import json, struct
import numpy as np
import trimesh

root = Path(__file__).resolve().parents[1]
out = root / 'outputs/bmw-viewer'
body = trimesh.load(out/'body-generated-v4.glb', force='mesh', process=False)
v = body.vertices.copy()
# Align the generated shell's long axis; choose the hood end from cabin position.
_, axes = np.linalg.eigh(np.cov(v[:,[0,2]].T))
long = axes[:,1]
short = np.array([-long[1],long[0]])
v[:,0] = body.vertices[:,[0,2]] @ long
v[:,2] = body.vertices[:,[0,2]] @ short
upper = v[:,1] > np.quantile(v[:,1],.80)
if v[upper,0].mean() > v[:,0].mean():
    v[:,[0,2]] *= -1
lo,hi = v.min(0),v.max(0)
v = (v-(lo+hi)/2)/(hi-lo)*[4.91,1.22,1.89]
v[:,1] += .84
body.vertices = v
axles = [1.46,-1.50]
# Cut empty wheel arches through the AI shell so generated wheel wells cannot cover tires.
centres = body.triangles_center
keep = np.ones(len(body.faces),dtype=bool)
for x in axles:
    keep &= ((centres[:,0]-x)**2+(centres[:,1]-.35)**2 > .395**2)
body.update_faces(keep)
body.remove_unreferenced_vertices()
unique, inverse = np.unique(np.round(body.vertices,6),axis=0,return_inverse=True)
welded = trimesh.Trimesh(unique,inverse[body.faces],process=False)
trimesh.smoothing.filter_humphrey(welded,alpha=.2,beta=.5,iterations=6)
body.vertices = welded.vertices[inverse]
body.vertex_normals = welded.vertex_normals[inverse]
body.visual.material.baseColorFactor = [3,3,3,255]
body.visual.material.metallicFactor = .28
body.visual.material.roughnessFactor = .48
body.visual.material.normalTexture = None

wheel = trimesh.load(out/'wheel-generated-v4.glb',force='mesh',process=False)
w = wheel.vertices.copy()
values, axes = np.linalg.eigh(np.cov(w.T))
normal = axes[:,0]
up = np.array([0.,1.,0.]);up -= normal*np.dot(up,normal);up /= np.linalg.norm(up)
right = np.cross(up,normal)
w = w @ np.column_stack([right,up,normal])
lo,hi = w.min(0),w.max(0)
w = (w-(lo+hi)/2)/(hi-lo)*[.70,.70,.275]
wheel.vertices = w
wheel.visual.material.metallicFactor = .1
wheel.visual.material.roughnessFactor = .55
wheel.visual.material.normalTexture = None
radius=np.linalg.norm(w[:,:2],axis=1)
outer=radius>.285
# Regularize the generated tire's circumference while retaining the generated rim.
target=.35-.018*(np.abs(w[:,2])/.1375)**4
w[outer,:2]*=(target[outer]/radius[outer])[:,None]
wheel.vertices=w
is_tire=np.linalg.norm(wheel.triangles_center[:,:2],axis=1)>.267
tire=wheel.submesh([np.where(is_tire)[0]],append=True,repair=False)
rim=wheel.submesh([np.where(~is_tire)[0]],append=True,repair=False)
tire.visual=trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(baseColorFactor=[1,1,1,255],metallicFactor=0,roughnessFactor=1.0))
rim.visual.material.metallicFactor=.5
rim.visual.material.roughnessFactor=.32
for part in (tire,rim):
    points, mapping=np.unique(np.round(part.vertices,6),axis=0,return_inverse=True)
    joined=trimesh.Trimesh(points,mapping[part.faces],process=False)
    part.vertex_normals=joined.vertex_normals[mapping]
wheel_scene=trimesh.Scene()
wheel_scene.add_geometry(tire,node_name='Tire')
wheel_scene.add_geometry(rim,node_name='Rim')
wheel_scene.export(out/'wheel-separate-v4.glb')
body.export(out/'body-separate-v4.glb')
scene=trimesh.Scene()
scene.add_geometry(body,node_name='Body',geom_name='Generated_body')
for x,label in zip(axles,['Front','Rear']):
    for sign,side in [(1,'Left'),(-1,'Right')]:
        transform=np.eye(4);transform[:3,3]=[x,.35,sign*.82]
        pivot=f'Wheel_{label}_{side}'
        scene.graph.update(frame_to=pivot,matrix=transform)
        for mesh,name in [(tire,'Tire'),(rim,'Rim')]:
            part=mesh.copy()
            if sign<0:part.apply_transform(trimesh.transformations.rotation_matrix(np.pi,[0,1,0]))
            scene.add_geometry(part,node_name=f'{name}_{label}_{side}',geom_name=f'{name}_{label}_{side}',parent_node_name=pivot)
raw=scene.export(file_type='glb')
length=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+length])
bin_start=20+length
blob=bytearray(raw[bin_start+8:])
def accessor(data,typ,count,minimum=None,maximum=None):
    while len(blob)%4: blob.append(0)
    offset=len(blob);blob.extend(data)
    views=doc.setdefault('bufferViews',[]);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
    a={'bufferView':len(views)-1,'componentType':5126,'count':count,'type':typ}
    if minimum is not None:a['min']=minimum;a['max']=maximum
    doc['accessors'].append(a)
    return len(doc['accessors'])-1
times=np.linspace(0,2,9,dtype='<f4')
angles=times*np.pi
rot=np.column_stack([np.zeros(9),np.zeros(9),np.sin(angles/2),np.cos(angles/2)]).astype('<f4')
ti=accessor(times.tobytes(),'SCALAR',9,[0],[2])
ri=accessor(rot.tobytes(),'VEC4',9)
channels=[]
for i,node in enumerate(doc['nodes']):
    if node.get('name','').startswith('Wheel_'):
        matrix=node.pop('matrix',None)
        if matrix is not None: node['translation']=[matrix[12],matrix[13],matrix[14]]
        channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'Wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'generation':'Glow Rush 3D / Stable Fast 3D','body_prompt_id':'64a8455f-0449-4f61-af37-d90e6951b24c','wheel_prompt_id':'4b27397d-3dae-434b-8b79-92b26372cd1b','postprocessing':'Body alignment, material adjustment, open arches; wheel alignment, circular proportions, four independent pivots.'}
doc['buffers'][0]['byteLength']=len(blob)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(out/'bmw-m5-f10-animated-v4.glb').write_bytes(result)
print(json.dumps({'body_vertices':len(body.vertices),'wheel_vertices':len(wheel.vertices),'wheel_nodes':len(channels),'bytes':len(result),'body_bounds':body.bounds.tolist()}))

