from pathlib import Path
import struct,json
b=Path('outputs/bmw-viewer/bmw-opening-panels-v18.glb').read_bytes();L=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+L])
for name in ['Fender_Left_outer','Fender_Right_outer','Fender_Left_shoulder','Body_door_jambs_Right','Rear_quarter_continuous_Left','Door_skin_Front_Right','Windshield','C_pillar_Left']:
 n=next(x for x in d['nodes'] if x.get('name')==name);p=d['meshes'][n['mesh']]['primitives'][0];mat=d['materials'][p['material']];print(name,json.dumps(mat))
