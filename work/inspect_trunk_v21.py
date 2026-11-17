import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-volumetric-taillights-v20.glb',force='scene',process=False)
for n in ['Trunk_lid','Factory_trunk_lip']:
 v=trimesh.transform_points(s.geometry[s.graph[n][1]].vertices,s.graph[n][0]);print(n,v.min(0),v.max(0))
