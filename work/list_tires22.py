import sys
sys.path.insert(0,'work/front-libs')
import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-blueprint-sides-v22.glb',force='scene',process=False)
print([(n,s.graph.transforms.parents.get(n,'')) for n in s.graph.nodes_geometry if 'Tire' in n and 'groove' not in n])
