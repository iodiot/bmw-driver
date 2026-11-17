from pathlib import Path
import sys,json,numpy as np
sys.path[:0]=[str(Path('work').resolve()),str(Path('work/front-libs').resolve())]
import trimesh
code=Path('work/rebuild_side_v22.py').read_text(encoding='utf-8-sig')
ns={'__file__':str(Path('work/rebuild_side_v22.py').resolve())}
exec(code.split('def arch(')[0],ns)
s=trimesh.load('outputs/bmw-viewer/bmw-blueprint-sides-v22.glb',force='scene',process=False)
report={}
for name in ['Door_skin_Front_Right','Door_skin_Rear_Right','Window_Left_Front','Window_Left_Rear','Roof']:
 M,g=s.graph[name];m=s.geometry[g];N=len(m.vertices)//2;v=trimesh.transform_points(m.vertices,M);f=m.faces;nn=m.vertex_normals[:N]
 outer=f[np.all(f<N,axis=1)];inner=f[np.all(f>=N,axis=1)];wall=f[~(np.all(f<N,axis=1)|np.all(f>=N,axis=1))]
 edges=np.unique(wall[wall<N]);interior=np.setdiff1d(np.arange(N),edges)
 raw=trimesh.Trimesh(v[:N],outer,process=False).vertex_normals
 expected=raw
 if name.startswith('Door_skin'):
  field=ns['skin'];h=1e-5;x,y=v[:N,:2].T
  gx=(field(x+h,y)-field(x-h,y))/(2*h);gy=(field(x,y+h)-field(x,y-h))/(2*h)
  expected=np.column_stack([-gx,-gy,np.ones(N)]);expected/=np.linalg.norm(expected,axis=1)[:,None]
 angle=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',nn,expected),-1,1)))
 report[name]={'vertices':len(v),'faces':len(f),'closed':m.is_watertight,'outer_face_count':len(outer),'wall_face_count':len(wall),'boundary_vertices':len(edges),'boundary_normal_error_deg_p50_p95_max':np.percentile(angle[edges],[50,95,100]).tolist(),'interior_normal_error_deg_p50_p95_max':np.percentile(angle[interior],[50,95,100]).tolist()}
Path('work/edge-normal-diagnosis-v23.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
