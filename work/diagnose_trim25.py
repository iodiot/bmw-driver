from pathlib import Path
import sys,numpy as np
sys.path.insert(0,'work/front-libs')
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-window-frames-v25.glb',force='scene',process=False)
for name in ['Window_belt_moulding_Left_Front','Window_outer_arch_Left_Front']:
 m=s.geometry[s.graph[name][1]];nv=m.vertex_normals;cc=trimesh.graph.connected_components(m.edges,nodes=np.arange(len(m.vertices)),min_len=3)
 comps=[c for c in cc if nv[c,2].mean()>.1];c=max(comps,key=len);mask=np.zeros(len(nv),bool);mask[c]=True;f=m.faces[np.all(mask[m.faces],axis=1)];ids,ind=np.unique(f,return_inverse=True);geo=trimesh.Trimesh(m.vertices[ids],ind.reshape(-1,3),process=False)
 a=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',nv[ids],geo.vertex_normals),-1,1)));print(name,'normal error',np.percentile(a,[50,95,100]).tolist(),'material',m.visual.material.name,'double',m.visual.material.doubleSided)
