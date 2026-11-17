from pathlib import Path
import sys,numpy as np
sys.path.insert(0,'work/front-libs')
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-blueprint-sides-v22.glb',force='scene',process=False);p=s.graph.transforms.parents
b=[];mir=[]
for n in s.graph.nodes_geometry:
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0])
 if n.startswith('Mirror_'):mir.append(v)
 elif not p.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):b.append(v)
v=np.vstack(b);print('body',v.min(0),v.max(0),np.ptp(v,axis=0));print('mirrors',np.ptp(np.vstack(mir),axis=0))
for ax in [0,1,2]:
 for which in [min,max]:
  out=which([(which(trimesh.transform_points(s.geometry[s.graph[n][1]].vertices,s.graph[n][0])[:,ax]),n) for n in s.graph.nodes_geometry if not p.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')) and not n.startswith('Mirror_')]);print(ax,which.__name__,out)
