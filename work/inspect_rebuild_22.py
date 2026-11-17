from pathlib import Path
import sys
sys.path.insert(0,'work/front-libs')
import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-wrapped-taillights-v21.glb',force='scene',process=False)
for n in ['Rear_shoulder_continuous_Left','Trunk_lid','Fender_Left_shoulder','Hood_shell','Side_vent_Left_recess','Fuel_filler_seam_Left']:
 if n not in s.graph.nodes:continue
 M,g=s.graph[n];m=s.geometry[g];v=trimesh.transform_points(m.vertices,M);print(n,len(v),m.is_watertight,np.round([v.min(0),v.max(0)],4))
 if 'shoulder_continuous' in n:print('start',v[:40:4].round(4),'end',v[-40::4].round(4))
print('sideprefix', [n for n in s.graph.nodes_geometry if n.startswith(('Side_vent','Mirror','Handle','Fuel','Door_handle'))])
