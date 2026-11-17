from pathlib import Path
import sys,json,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-materials-v19.glb',force='scene',process=False)
names=['Rear_lamp_Left_Outer_lens','Rear_lamp_Left_Inner_lens','Rear_LED_Left_0','Trunk_LED_Left_0','Headlamp_clear_cover_0','Door_handle_Left_Front','Mirror_Left','Rear_diffuser','Exhaust_Left_0']
r=[]
for n in names:
 if n not in s.graph.nodes_geometry:continue
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);parent=s.graph.transforms.parents.get(n)
 r.append({'name':n,'vertices':len(v),'triangles':len(m.faces),'watertight':m.is_watertight,'bounds_mm':np.round(np.array([v.min(0),v.max(0)])*1000,2).tolist(),'parent':parent})
print(json.dumps(r,indent=2))
