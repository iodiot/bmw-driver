from pathlib import Path
p=Path('work/build_taillights_v20.py');s=p.read_text();s=s.replace('from shapely.geometry import Polygon,LineString,Point,box','from shapely.geometry import Polygon,LineString,Point,box\nfrom shapely.ops import unary_union')
s=s.replace("weight=np.exp(-((v[:,1]-.47)/.24)**4)*np.exp(-(v[:,2]/.64)**4)","edge_mesh=m.copy();edge_mesh.merge_vertices(digits_vertex=7)\nboundaries=unary_union([LineString(loop[:,1:3]) for loop in edge_mesh.outline().discrete])\ndistance=np.array([boundaries.distance(Point(p)) for p in v[:,1:3]])\nweight=np.clip(distance/.040,0,1);weight=weight*weight*(3-2*weight);weight*=np.exp(-(v[:,2]/.70)**4)")
p.write_text(s)
