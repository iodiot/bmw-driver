import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-quarter-refined-v15.glb',force='scene',process=False)
for n in s.graph.nodes_geometry:
 if n.startswith(('Wheel_well','Rear_copy_Wheel','Rear_copy_Tire','Tire_groove','Rear_copy_Rim')):
  m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);print(n,np.round([v.min(0),v.max(0)],3).tolist(),m.visual.material.baseColorFactor)
