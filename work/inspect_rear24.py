from pathlib import Path
import sys,numpy as np
sys.path.insert(0,'work/front-libs')
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-surface-normals-v23.glb',force='scene',process=False)
for n in ['Rear_trunk_face','Rear_quarter_lamp_panel','Rear_shoulder_continuous_Left','Rear_quarter_continuous_Left','Rear_deck_transition_Left','Trunk_lid','Factory_trunk_lip','Rear_windshield','Cabin_pillars_and_roof_rail_Right','Body_door_jambs_Right','Taillamp_Right_Outer_Lens','Taillamp_Right_Outer_Housing_frame']:
 M,g=s.graph[n];v=trimesh.transform_points(s.geometry[g].vertices,M);print(n,len(v),np.round([v.min(0),v.max(0)],4).tolist())
