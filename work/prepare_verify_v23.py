from pathlib import Path
p=Path('work/verify_v22.py');s=p.read_text(encoding='utf-8-sig')
s=s.replace('bmw-blueprint-sides-v22.glb','bmw-surface-normals-v23.glb').replace('car-v22-verification.json','car-v23-verification.json')
s=s.replace("m=s.geometry[s.graph[n][1]];closed[n]=bool(m.is_watertight);assert m.is_watertight,n", "m=s.geometry[s.graph[n][1]];w=trimesh.Trimesh(m.vertices,m.faces,process=False);w.merge_vertices(digits_vertex=7);closed[n]=bool(w.is_watertight);assert w.is_watertight,n")
s=s.replace("'projection_review':['side','top','front','rear']", "'projection_review':['close-up left','close-up right','perspective','top']")
extra='''
# Independent export check: exterior normals must follow the exterior faces,
# without receiving the wall's 90-degree turn at their shared positions.
edge_checks={}
for name in ['Door_skin_Front_Right','Door_skin_Rear_Right','Window_Left_Front','Window_Left_Rear','Window_Right_Front','Window_Right_Rear','Roof']:
 M,key=s.graph[name];m=s.geometry[key];v=world(name);norm=m.vertex_normals@np.linalg.inv(M[:3,:3]);norm/=np.linalg.norm(norm,axis=1)[:,None]
 axis=1 if name=='Roof' else 2;direction=1 if name=='Roof' or v[:,2].mean()>0 else -1
 candidates=[]
 for comp in trimesh.graph.connected_components(m.edges,nodes=np.arange(len(v)),min_len=3):
  if norm[comp,axis].mean()*direction>.20:candidates.append(comp)
 comp=max(candidates,key=len);isin=np.zeros(len(v),bool);isin[comp]=True;f=m.faces[np.all(isin[m.faces],axis=1)]
 used,ind=np.unique(f,return_inverse=True);geo=trimesh.Trimesh(v[used],ind.reshape(-1,3),process=False)
 ee=np.vstack([geo.faces[:,[0,1]],geo.faces[:,[1,2]],geo.faces[:,[2,0]]]);u,c=np.unique(np.sort(ee,axis=1),axis=0,return_counts=True);edge=np.unique(u[c==1])
 angle=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',norm[used],geo.vertex_normals),-1,1)))
 p95=float(np.percentile(angle[edge],95));assert p95<9,(name,p95)
 if name.startswith('Window'):assert norm[used,1].mean()>0,(name,'glass normals face downward')
 edge_checks[name]={'boundary_normal_vs_exterior_deg_p50_p95_max':np.percentile(angle[edge],[50,95,100]).tolist()}
report['independent_exterior_normal_checks']=edge_checks
report['closed_mesh_note']='Render vertices are separated across hard edges; matching spatial vertices recover closed physical shells.'
'''
s=s.replace("Path('outputs/car-v23-verification.json')",extra+"\nPath('outputs/car-v23-verification.json')")
Path('work/verify_v23.py').write_text(s,encoding='utf-8')
p=Path('work/create_viewer_v23.py');s=p.read_text(encoding='utf-8-sig').replace('revision=3','revision=4');p.write_text(s,encoding='utf-8')
