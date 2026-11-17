from pathlib import Path
p=Path('work/repair_sides_v16.py');s=p.read_text();s=s.replace("v,f=trimesh.creation.triangulate_polygon(poly,engine='earcut')\nv3=np.column_stack([v,np.zeros(len(v))]);v3,f=trimesh.remesh.subdivide_to_size(v3,f,max_edge=.032,max_iter=8)","v,f=trimesh.creation.triangulate_polygon(poly,engine='triangle',triangle_args='pq28a0.00035Y')\nv3=np.column_stack([v,np.zeros(len(v))])")
s=s.replace("print('shell edge incidence',np.unique(np.bincount(m.edges_unique_inverse),return_counts=True));",'')
p.write_text(s)
