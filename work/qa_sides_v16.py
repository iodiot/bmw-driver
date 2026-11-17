from pathlib import Path
import sys,json,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-solid-sides-v16.glb',force='scene',process=False)
for n in ['Side_shell_solid_Left','Side_shell_solid_Right','Rocker_solid_Left','Rocker_solid_Right']:
 m=s.geometry[s.graph[n][1]];print(n,'watertight',m.is_watertight,'bounds',m.bounds.tolist())
P=s.graph.transforms.parents;v=[]
for n in s.graph.nodes_geometry:
 if not n.startswith('Mirror_') and not P.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):
  v.append(trimesh.transform_points(s.geometry[s.graph[n][1]].vertices,s.graph[n][0]))
v=np.vstack(v);print('body dimensions',np.ptp(v,axis=0)*1000,'height',v[:,1].max()*1000)
