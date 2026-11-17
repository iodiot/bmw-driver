import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-solid-sides-v16.glb',force='scene',process=False);p=s.graph.transforms.parents
for n in s.graph.nodes_geometry:
 if n.startswith('Mirror_') or p.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):continue
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);z=np.abs(v[:,2]).max()
 if z>.9460001:print(n,z)
