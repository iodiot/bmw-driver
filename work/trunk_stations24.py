import sys,numpy as np
sys.path.insert(0,'work/front-libs')
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-blueprint-sides-v22.glb',force='scene',process=False)
M,g=s.graph['Trunk_lid'];v=trimesh.transform_points(s.geometry[g].vertices,M)[:9595].reshape(95,101,3)
for i in [0,24,48,71,94]:print(i,np.round(v[i,[0,15,25,50,75,85,100]],4).tolist())
