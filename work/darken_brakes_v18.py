from pathlib import Path
p=Path('work/opening_panels_v18.py');s=p.read_text();needle="stats=export_scene(scene,OUT/'bmw-opening-panels-v18.glb'"
insert='''# Dark steel rotors and deep crimson calipers, as requested.
for n in scene.graph.nodes_geometry:
 m=scene.geometry[scene.graph[n][1]]
 if 'Drilled_brake_rotor' in n:
  mat=m.visual.material.copy();mat.name='Dark steel brake rotor';mat.baseColorFactor=[72,76,82,255];mat.metallicFactor=.80;mat.roughnessFactor=.48;m.visual.material=mat
 elif 'Caliper' in n or 'caliper' in n:
  mat=m.visual.material.copy();mat.name='Blood red caliper';mat.baseColorFactor=[125,2,10,255];mat.metallicFactor=.25;mat.roughnessFactor=.30;m.visual.material=mat
'''
s=s.replace(needle,insert+needle);p.write_text(s)
