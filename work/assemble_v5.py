from pathlib import Path
import json, struct
import numpy as np
import trimesh
from precision_wheel import build_wheel

root = Path(__file__).resolve().parents[1]
out = root / 'outputs/bmw-viewer'
body = trimesh.load(out/'body-generated-v5.glb', force='mesh', process=False)
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
# Keep the complete shell: separate front module failed the seam check.
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

wheel = trimesh.load(out/'wheel-generated-v5.glb',force='mesh',process=False)
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
parts=build_wheel()
wheel_scene=trimesh.Scene()
for mesh,name in parts:wheel_scene.add_geometry(mesh,node_name=name)
wheel_scene.export(out/'wheel-separate-v5.glb')
body.export(out/'body-separate-v5.glb')
scene=trimesh.Scene()
scene.add_geometry(body,node_name='Body',geom_name='Generated_body')
front=trimesh.load(out/'front-generated-v5.glb',force='mesh',process=False)
fv=front.vertices.copy()
_,basis=np.linalg.eigh(np.cov(fv[:,[0,2]].T))
normal=basis[:,0]
if normal[1]<0:normal=-normal
wide=np.array([normal[1],-normal[0]])
fv[:,0]=front.vertices[:,[0,2]]@normal
fv[:,2]=front.vertices[:,[0,2]]@wide
lo,hi=fv.min(0),fv.max(0)
fv=(fv-(lo+hi)/2)/(hi-lo)*[.30,.55,1.74]+[2.205,.505,0]
front.vertices=fv
u,inv=np.unique(np.round(fv,6),axis=0,return_inverse=True)
joined=trimesh.Trimesh(u,inv[front.faces],process=False)
front.vertex_normals=joined.vertex_normals[inv]
front.visual.material.normalTexture=None
front.visual.material.baseColorFactor=[3,3,3,255]
front.visual.material.metallicFactor=.28
front.visual.material.roughnessFactor=.48
fc=front.triangles_center
lamps=(np.abs(fc[:,2])>.46)&(np.abs(fc[:,2])<.85)&(fc[:,1]>.58)&(fc[:,1]<.77)
paint=front.submesh([np.where(~lamps)[0]],append=True,repair=False)
lampsmesh=front.submesh([np.where(lamps)[0]],append=True,repair=False)
lampsmesh.visual.material=lampsmesh.visual.material.copy()
lampsmesh.visual.material.baseColorFactor=[120,120,120,255]
# Front module retained separately; not used in accepted assembly.
front.export(out/'front-separate-v5.glb')
for x,label in zip(axles,['Front','Rear']):
    for sign,side in [(1,'Left'),(-1,'Right')]:
        transform=np.eye(4);transform[:3,3]=[x,.35,sign*.82]
        pivot=f'Wheel_{label}_{side}'
        scene.graph.update(frame_to=pivot,matrix=transform)
        for mesh,name in parts:
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
doc['asset']['extras']={'generation':'Glow Rush 3D / Stable Fast 3D, separate orthographic references','body_prompt_id':'b1a5683c-710e-4e6c-8238-76d3b18bce95','front_prompt_id':'de9a5ae3-7c89-4309-8e4b-eab39c6d156f','wheel_prompt_id':'67c481d9-3942-4b9e-ad01-6ac10c7e688d','postprocessing':'Generated orthographic body retained whole. Separate front candidate excluded due to seam defects. Wheel remeshed using exact circular surfaces and five identical double-spoke pairs based on the orthographic wheel design; raw generated wheel retained separately.'}
doc['buffers'][0]['byteLength']=len(blob)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(out/'bmw-m5-f10-animated-v5.glb').write_bytes(result)
print(json.dumps({'body_vertices':len(body.vertices),'wheel_vertices':len(wheel.vertices),'wheel_nodes':len(channels),'bytes':len(result),'body_bounds':body.bounds.tolist()}))




