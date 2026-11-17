import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-wrapped-taillights-v21.glb',force='scene',process=False)
for n in ['Body_door_jambs_Right','Door_skin_Front_Right','Door_skin_Rear_Right','Rear_quarter_continuous_Left','Fender_Left_outer','Roof','C_pillar_Left','Window_Left_Rear','Rocker_solid_Left']:
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);print(n,len(v),np.round([v.min(0),v.max(0)],4).tolist())
