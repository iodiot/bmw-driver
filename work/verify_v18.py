from pathlib import Path
import sys,struct,json,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
P=Path('outputs/bmw-viewer');s=trimesh.load(P/'bmw-opening-panels-v18.glb',force='scene',process=False)
parents=s.graph.transforms.parents
body=[];mir=[]
for n in s.graph.nodes_geometry:
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0])
 assert np.isfinite(v).all(),n
 if n.startswith('Mirror_'):mir.append(v)
 elif not parents.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):body.append(v)
v=np.vstack(body);mir=np.vstack(mir);f=s.graph['Steering_Left'][0][:3,3];fr=s.graph['Steering_Right'][0][:3,3];r=s.graph['Rear_mount_Left'][0][:3,3];rr=s.graph['Rear_mount_Right'][0][:3,3]
dims={'length_mm':np.ptp(v[:,0])*1000,'body_width_mm':np.ptp(v[:,2])*1000,'height_from_ground_mm':v[:,1].max()*1000,'mirror_width_mm':np.ptp(mir[:,2])*1000,'wheelbase_mm':(f[0]-r[0])*1000,'front_track_mm':(f[2]-fr[2])*1000,'rear_track_mm':(r[2]-rr[2])*1000,'front_overhang_mm':(v[:,0].max()-f[0])*1000,'rear_overhang_mm':(r[0]-v[:,0].min())*1000}
expected={'length_mm':4910,'body_width_mm':1892,'height_from_ground_mm':1451,'mirror_width_mm':2119,'wheelbase_mm':2964,'front_track_mm':1627,'rear_track_mm':1582,'front_overhang_mm':836,'rear_overhang_mm':1110}
print('dimensions',dims)
assert all(abs(dims[k]-val)<.11 for k,val in expected.items()),dims
panels=['Hood_pivot','Trunk_pivot']+[f'Door_pivot_{where}_{side}' for where in ['Front','Rear'] for side in ['Left','Right']]
closed={};motion={}
for n in panels:
 children=[c for c in s.graph.nodes_geometry if parents.get(c)==n];assert children,n
 world=np.vstack([trimesh.transform_points(s.geometry[s.graph[c][1]].vertices,s.graph[c][0]) for c in children]);pivot=s.graph[n][0][:3,3]
 axis=[0,0,1] if n in ['Hood_pivot','Trunk_pivot'] else [0,1,0];angle=np.deg2rad(-65 if n=='Trunk_pivot' else 65 if n=='Hood_pivot' or n.endswith('Right') else -65)
 R=trimesh.transformations.rotation_matrix(angle,axis,point=pivot);op=trimesh.transform_points(world,R)
 delta=op.mean(0)-world.mean(0);motion[n]={'attached_meshes':len(children),'mean_motion_m':delta.tolist()}
 if n.startswith('Door_'):
  assert delta[2]>0 if n.endswith('Right') else delta[2]<0
  name='Door_skin_'+n.removeprefix('Door_pivot_');m=s.geometry[s.graph[name][1]];closed[name]=m.is_watertight;assert m.is_watertight
  physical=n.rsplit('_',1)[-1];which=n.split('_')[2];sideLabel='Right' if physical=='Left' else 'Left'
  for node in [f'Window_{sideLabel}_{which}',f'Door_handle_{sideLabel}_{which}']:assert parents[node]==n,node
 else:assert delta[1]>.15,n
assert parents['Trunk_lid']=='Trunk_pivot';assert parents['Rear_number_plate']=='Trunk_pivot'
raw=(P/'bmw-opening-panels-v18.glb').read_bytes();L=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+L]);buf=raw[28+L:]
normals=0
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  assert 'NORMAL' in prim['attributes']
  a=doc['accessors'][prim['attributes']['NORMAL']];b=doc['bufferViews'][a['bufferView']];arr=np.frombuffer(buf,dtype='<f4',count=a['count']*3,offset=b.get('byteOffset',0)+a.get('byteOffset',0));assert np.isfinite(arr).all();normals+=1
assert len(doc['animations'])==7
rotors=[m for n,m in s.geometry.items() if 'Drilled_brake_rotor' in n];assert len(rotors)==4
assert all(np.array_equal(m.visual.material.baseColorFactor,[72,76,82,255]) for m in rotors)
calipers=[m for n,m in s.geometry.items() if 'Caliper' in n];assert calipers and all(np.array_equal(m.visual.material.baseColorFactor,[105,1,7,255]) for m in calipers)
report={'dimensions_mm':dims,'closed_door_shells':closed,'opening_motion':motion,'normals_exported_on_meshes':normals,'animation_clips':len(doc['animations']),'steel_rotors':len(rotors),'deep_red_caliper_meshes':len(calipers),'brake_rotor_rgba':[72,76,82,255],'caliper_rgba':[105,1,7,255],'wheel_spin_nodes':sum(n.get('name','').startswith('Wheel_spin_') for n in doc['nodes'])}
Path('outputs/car-v18-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
