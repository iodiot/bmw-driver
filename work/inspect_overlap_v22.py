import sys
sys.path.insert(0,'work/front-libs')
import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-blueprint-sides-v22.glb',force='scene',process=False)
for n in s.graph.nodes_geometry:
 M,g=s.graph[n];v=trimesh.transform_points(s.geometry[g].vertices,M)
 if v[:,1].min()>1.10:print(n,len(v),s.geometry[g].visual.material.name)
print('under glass',[(n,s.geometry[s.graph[n][1]].visual.material.name) for n in s.graph.nodes_geometry if any(x in n.lower() for x in ['roof','wind','glass','heater','handle','arch'])])
