from pathlib import Path
import json,numpy as np,trimesh
P=Path('outputs/bmw-viewer');s=trimesh.load(P/'bmw-quarter-refined-v15.glb',force='scene',process=False);old=trimesh.load(P/'bmw-factory-rear-v14.glb',force='scene',process=False)
parents=s.graph.transforms.parents
body=[];mirrors=[]
for n in s.graph.nodes_geometry:
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);parent=parents.get(n,'')
 if n.startswith('Mirror_'):mirrors.append(v)
 elif not parent.startswith(('Wheel_spin_','Steering_','Rear_mount_')):body.append(v)
v=np.vstack(body);mir=np.vstack(mirrors)
front=s.graph['Steering_Left'][0][:3,3];fr=s.graph['Steering_Right'][0][:3,3];rear=s.graph['Rear_mount_Left'][0][:3,3];rr=s.graph['Rear_mount_Right'][0][:3,3]
dims={'length_mm':np.ptp(v[:,0])*1000,'body_width_mm':np.ptp(v[:,2])*1000,'height_from_ground_mm':v[:,1].max()*1000,'mirror_width_mm':np.ptp(mir[:,2])*1000,'wheelbase_mm':(front[0]-rear[0])*1000,'front_track_mm':(front[2]-fr[2])*1000,'rear_track_mm':(rear[2]-rr[2])*1000,'front_overhang_mm':(v[:,0].max()-front[0])*1000,'rear_overhang_mm':(rear[0]-v[:,0].min())*1000}
expected={'length_mm':4910,'body_width_mm':1892,'height_from_ground_mm':1451,'mirror_width_mm':2119,'wheelbase_mm':2964,'front_track_mm':1627,'rear_track_mm':1582,'front_overhang_mm':836,'rear_overhang_mm':1110}
assert all(abs(dims[k]-val)<.1 for k,val in expected.items()),dims
checks={}
for label in ['Left','Right']:
 q=s.geometry[s.graph['Rear_quarter_continuous_'+label][1]].vertices.reshape(95,65,3)
 sh=s.geometry[s.graph['Rear_shoulder_continuous_'+label][1]].vertices.reshape(95,37,3)
 lid=s.geometry[s.graph['Trunk_lid'][1]].vertices.reshape(95,101,3)
 cap=s.geometry[s.graph['Rear_bumper_lower_return_'+label][1]].vertices.reshape(95,37,3)
 checks[label]={'quarter_to_shoulder_mm':float(np.linalg.norm(q[:,-1]-sh[:,-1],axis=1).max()*1000),'deck_to_shoulder_mm':float(np.linalg.norm(lid[:,-1 if label=='Left' else 0]-sh[:,0],axis=1).max()*1000),'quarter_to_lower_return_mm':float(np.linalg.norm(q[:,0]-cap[:,-1],axis=1).max()*1000)}
 assert max(checks[label].values())<.001
sym={}
for prefix in ['Rear_quarter_continuous_','Rear_shoulder_continuous_','Rear_bumper_lower_return_']:
 a=s.geometry[s.graph[prefix+'Left'][1]].vertices;b=s.geometry[s.graph[prefix+'Right'][1]].vertices
 sym[prefix]=float(np.linalg.norm(a*[1,1,-1]-b,axis=1).max()*1000)
 assert sym[prefix]<.001
report={'dimensions_mm':dims,'maximum_dimension_error_mm':max(abs(dims[k]-val) for k,val in expected.items()),'panel_boundary_errors':checks,'symmetry_errors_mm':sym,'four_wheel_rig_preserved':all(n in s.graph.nodes for n in ['Wheel_spin_Left','Wheel_spin_Right','Wheel_spin_Rear_Left','Wheel_spin_Rear_Right'])}
Path('outputs/car-v15-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
