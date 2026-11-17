from pathlib import Path
import trimesh,numpy as np
s=trimesh.load('outputs/bmw-viewer/bmw-quarter-refined-v15.glb',force='scene',process=False)
for n in s.graph.nodes_geometry:
 m=s.geometry[s.graph[n][1]];v=trimesh.transform_points(m.vertices,s.graph[n][0]);lo=v.min(0);hi=v.max(0)
 if ('arch' in n.lower() or 'sill' in n.lower() or 'side' in n.lower() or 'Fender' in n or 'Liner' in n) and not 'Hood' in n:
  print(n, len(m.faces), np.round([lo,hi],4).tolist(), m.visual.material.name)
