from pathlib import Path
import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-solid-sides-v16.glb',force='scene',process=False)
for n in s.graph.nodes_geometry:
 if n.startswith(('Hood_','Fender_','Bumper_','Hinge_','Windshield_cowl','Front_arch_')):
  m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);print(n,len(m.vertices),np.round([v.min(0),v.max(0)],4).tolist())
print('Hood pivot',s.graph['Hood_pivot'][0])
h=s.geometry[s.graph['Hood_outer'][1]];M=s.graph['Hood_outer'][0];v=trimesh.transform_points(h.vertices,M).reshape(97,81,3)
print('hood leading row',np.round(v[-1,::10],4));print('hood side',np.round(v[::16,-1],4))
