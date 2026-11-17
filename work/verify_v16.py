from pathlib import Path
import sys,json,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-solid-sides-v16.glb',force='scene',process=False);old=trimesh.load('outputs/bmw-viewer/bmw-quarter-refined-v15.glb',force='scene',process=False)
p=s.graph.transforms.parents;body=[];mir=[];preserved=0
for n in s.graph.nodes_geometry:
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);parent=p.get(n,'')
 if n.startswith('Mirror_'):mir.append(v)
 elif not parent.startswith(('Wheel_spin_','Steering_','Rear_mount_')):body.append(v)
 if parent.startswith(('Wheel_spin_','Steering_','Rear_mount_')):
  a=old.geometry[old.graph[n][1]];assert np.array_equal(m.vertices,a.vertices),n;preserved+=1
v=np.vstack(body);mir=np.vstack(mir);f=s.graph['Steering_Left'][0][:3,3];fr=s.graph['Steering_Right'][0][:3,3];r=s.graph['Rear_mount_Left'][0][:3,3];rr=s.graph['Rear_mount_Right'][0][:3,3]
dims={'length_mm':np.ptp(v[:,0])*1000,'body_width_mm':np.ptp(v[:,2])*1000,'height_from_ground_mm':v[:,1].max()*1000,'mirror_width_mm':np.ptp(mir[:,2])*1000,'wheelbase_mm':(f[0]-r[0])*1000,'front_track_mm':(f[2]-fr[2])*1000,'rear_track_mm':(r[2]-rr[2])*1000,'front_overhang_mm':(v[:,0].max()-f[0])*1000,'rear_overhang_mm':(r[0]-v[:,0].min())*1000}
expected={'length_mm':4910,'body_width_mm':1892,'height_from_ground_mm':1451,'mirror_width_mm':2119,'wheelbase_mm':2964,'front_track_mm':1627,'rear_track_mm':1582,'front_overhang_mm':836,'rear_overhang_mm':1110}
assert all(abs(dims[k]-val)<.1 for k,val in expected.items()),dims
closed={};sym={}
for prefix in ['Side_shell_solid_','Rocker_solid_']:
 for label in ['Left','Right']:
  m=s.geometry[s.graph[prefix+label][1]];closed[prefix+label]=m.is_watertight;assert m.is_watertight
for prefix in ['Side_shell_solid_','Rocker_solid_','Rear_arch_folded_lip_','Rear_wheelhouse_tunnel_','Front_arch_joined_lip_','Front_wheelhouse_tunnel_']:
 a=s.geometry[s.graph[prefix+'Left'][1]].vertices;b=s.geometry[s.graph[prefix+'Right'][1]].vertices
 err=float(np.linalg.norm(a*[1,1,-1]-b,axis=1).max()*1000);sym[prefix]=err;assert err<.001
lip=s.geometry[s.graph['Rear_arch_folded_lip_Left'][1]].vertices.reshape(193,9,3)
liner=s.geometry[s.graph['Rear_wheelhouse_tunnel_Left'][1]].vertices.reshape(193,19,3)
gap=float(np.linalg.norm(lip[:,-1]-liner[:,0],axis=1).max()*1000);assert gap<.001
clearance=float(np.linalg.norm(lip[:,:,:2]-[-1.482,.3425],axis=2).min()-.3425)*1000;assert clearance>40
report={'dimensions_mm':dims,'closed_side_parts':closed,'symmetry_errors_mm':sym,'arch_to_liner_boundary_error_mm':gap,'rear_minimum_radial_clearance_mm':clearance,'preserved_wheel_meshes':preserved,'four_wheel_rig':all(n in s.graph.nodes for n in ['Wheel_spin_Left','Wheel_spin_Right','Wheel_spin_Rear_Left','Wheel_spin_Rear_Right'])}
Path('outputs/car-v16-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
