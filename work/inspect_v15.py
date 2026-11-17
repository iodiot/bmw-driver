from pathlib import Path
import trimesh,numpy as np
p=Path('outputs/bmw-viewer');a=trimesh.load(p/'bmw-aluminum-v13.glb',force='scene',process=False);b=trimesh.load(p/'bmw-factory-rear-v14.glb',force='scene',process=False)
for name in ['Roof','Concept_side_Right','Concept_belt_shoulder_Right','Rear_deck_shoulder_Right','Trunk_lid','Rear_quarter_lamp_panel','Rear_windshield','C_pillar_Right','Rear_arch_Right','Rear_bumper_sculpted']:
 m=b.geometry[b.graph[name][1]];print(name,np.round(m.bounds,5).tolist())
o=a.geometry[a.graph['Concept_side_Right'][1]].vertices;n=b.geometry[b.graph['Concept_side_Right'][1]].vertices;mask=o[:,0]<-1.51;print('map rear x',np.polyfit(o[mask,0],n[mask,0],1));print('sy sz',np.median(n[:,1]/o[:,1]),np.median(n[:,2]/o[:,2]));print('new nodes',[(x,b.graph.transforms.parents[x]) for x in b.graph.nodes_geometry if 'Rear' in x and ('spin' in x or 'Caliper' in x)])
