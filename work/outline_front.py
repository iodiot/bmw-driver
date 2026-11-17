import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-quarter-refined-v15.glb',force='scene',process=False)
m=s.geometry[s.graph['Fender_Left_outer'][1]].copy();m.merge_vertices(digits_vertex=6)
print('merged',len(m.vertices),len(m.faces))
p=m.outline();print('entities',len(p.entities))
for d in p.discrete:
 print('loop',len(d),np.round([d.min(0),d.max(0)],4).tolist())
np.savez('work/front_boundary.npz',**{'loop'+str(i):x for i,x in enumerate(p.discrete)})
