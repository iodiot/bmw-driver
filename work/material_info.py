import trimesh
s=trimesh.load('outputs/bmw-viewer/bmw-quarter-refined-v15.glb',force='scene',process=False)
m=s.geometry[s.graph['Concept_side_Left'][1]];print(m.visual.material.to_color() if False else vars(m.visual.material))
