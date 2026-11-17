from pathlib import Path
import struct,json,numpy as np
b=Path('outputs/bmw-viewer/bmw-opening-panels-v18.glb').read_bytes();L=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+L]);buf=b[28+L:]
for name in ['Windshield','Window_Left_Front','Hood_shell']:
 n=next(x for x in d['nodes'] if x.get('name')==name);p=d['meshes'][n['mesh']]['primitives'][0];print(name,p['attributes'])
 if 'NORMAL' in p['attributes']:
  a=d['accessors'][p['attributes']['NORMAL']];v=d['bufferViews'][a['bufferView']];arr=np.frombuffer(buf,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3);print('normals',np.isfinite(arr).all(),np.linalg.norm(arr,axis=1).min(),np.linalg.norm(arr,axis=1).max(),arr[:2])
