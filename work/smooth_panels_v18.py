from pathlib import Path
p=Path('work/opening_panels_v18.py');s=p.read_text();s=s.replace('from shapely.geometry import Polygon,Point','from shapely.geometry import Polygon,Point\nfrom shapely import segmentize')
s=s.replace("v,f=trimesh.creation.triangulate_polygon(pp,engine='triangle',triangle_args='pq28a.00035Y')", "pp=segmentize(pp,max_segment_length=.020)\n  v,f=trimesh.creation.triangulate_polygon(pp,engine='triangle',triangle_args='pq28a.00020')")
s=s.replace("m.fix_normals();assert m.is_watertight,name;meshes.append(m)", "m.fix_normals();assert m.is_watertight,name\n  h=1e-5;x,y=out[:,0],out[:,1];gx=(field(x+h,y)-field(x-h,y))/(2*h);gy=(field(x,y+h)-field(x,y-h))/(2*h)\n  nn=np.column_stack([-gx,-gy,np.ones(N)])*sign;nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=np.vstack([nn,-nn]);meshes.append(m)")
p.write_text(s)
