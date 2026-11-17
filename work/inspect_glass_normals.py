import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-opening-panels-v18.glb',force='scene',process=False)
for n in ['Windshield','Rear_windshield','Window_Left_Front','Window_Left_Rear','Window_Right_Front']:
 m=s.geometry[s.graph[n][1]];print(n,m.visual.material.name, len(m.vertices), np.mean(m.vertex_normals,axis=0),np.isfinite(m.vertex_normals).all(),np.max(np.linalg.norm(m.vertex_normals,axis=1)),np.mean(m.face_normals,axis=0))
