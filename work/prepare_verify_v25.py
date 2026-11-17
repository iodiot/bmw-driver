from pathlib import Path
s=Path('work/verify_v24.py').read_text(encoding='utf-8-sig').replace('bmw-rear-joints-v24.glb','bmw-window-frames-v25.glb').replace('car-v24-verification.json','car-v25-verification.json')
s=s.replace("'rear deck close-up','outer lamp close-up','roof antenna','top','side','trunk open'", "'left window arches','right window arches','windshield perimeter','rear-glass perimeter','top','four doors open'")
extra='''
records=json.loads(Path('work/window-frames-v25-records.json').read_text())
frame_report={}
for name,info in records.items():
 assert name in s.graph.nodes_geometry,name
 assert s.graph.transforms.parents.get(name,'world')==info['parent'],name
 m=s.geometry[s.graph[name][1]]
 welded=trimesh.Trimesh(m.vertices,m.faces,process=False);welded.merge_vertices(digits_vertex=7);welded.update_faces(welded.area_faces>1e-14);welded.remove_unreferenced_vertices()
 assert welded.is_watertight,name
 assert np.isfinite(m.vertex_normals).all(),name
 frame_report[name]={'parent':info['parent'],'closed':True,'depth_mm':info['depth_mm']}
for label,physical in [('Left','Right'),('Right','Left')]:
 for which in ['Front','Rear']:
  for stem in ['Window_frame','Window_glass_seal','Window_outer_arch','Window_belt_moulding','Window_B_post_trim']:
   assert parents[f'{stem}_{label}_{which}']==f'Door_pivot_{which}_{physical}'
for name in ['Windshield','Rear_windshield']:
 for suffix in ['ceramic_frit','perimeter_seal','aperture_return']:assert parents[name+'_'+suffix]=='world'
report['new_window_frame_meshes']=frame_report
report['window_arch_note']='Frame profiles and body openings traced from BMW dimension drawing. Section dimensions are a visual reconstruction, not OEM tooling dimensions.'
report['door_frame_width_mm']=22
report['nominal_frame_to_body_gap_mm']=3.5
report['new_glazing_seals']=6
'''
s=s.replace("Path('outputs/car-v25-verification.json')",extra+"\nPath('outputs/car-v25-verification.json')")
Path('work/verify_v25.py').write_text(s,encoding='utf-8')
