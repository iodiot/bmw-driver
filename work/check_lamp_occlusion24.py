from pathlib import Path
import sys,json,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-rear-joints-v24.glb',force='scene',process=False)
body=[]
for n in s.graph.nodes_geometry:
 M,g=s.graph[n];m=s.geometry[g]
 if m.visual.material.name!='Black sapphire paint':continue
 v=trimesh.transform_points(m.vertices,M)
 if v[:,0].min()<-2.15 and v[:,1].max()>.69 and abs(v[:,2]).max()>.55:body.append(v[m.faces])
tri=np.concatenate(body);e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0]
def hit(origin,direction):
 h=np.cross(direction,e2);a=np.einsum('ij,ij->i',e1,h);valid=abs(a)>1e-10;inv=np.zeros_like(a);inv[valid]=1/a[valid];q=origin-tri[:,0];u=inv*np.einsum('ij,ij->i',q,h);qq=np.cross(q,e1);v=inv*np.einsum('ij,j->i',qq,direction);t=inv*np.einsum('ij,ij->i',e2,qq);good=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>1e-6)
 return float(t[good].min()) if good.any() else None
M,g=s.graph['Taillamp_Right_Outer_Lens'];m=s.geometry[g];p=trimesh.transform_points(m.vertices,M);n=m.vertex_normals@np.linalg.inv(M[:3,:3])
# First surface is the front cap; body return walls have separate vertices.
src=trimesh.load('outputs/bmw-viewer/bmw-surface-normals-v23.glb',force='scene',process=False);N=len(src.geometry[src.graph['Taillamp_Right_Outer_Lens'][1]].vertices)//2
indices=np.linspace(0,N-1,45,dtype=int);checks=[]
for i in indices:
 nn=n[i]/np.linalg.norm(n[i]);d=hit(p[i]+.035*nn,-nn);checks.append({'index':int(i),'body_hit_m':d,'body_ahead_of_lens':bool(d is not None and d<.0347)})
report={'body_triangle_count':len(tri),'sample_count':len(checks),'occluded_samples':sum(c['body_ahead_of_lens'] for c in checks),'checks':checks}
Path('work/lamp-occlusion24.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
