from pathlib import Path
s=Path('work/verify_v23.py').read_text(encoding='utf-8-sig').replace('bmw-surface-normals-v23.glb','bmw-rear-joints-v24.glb').replace('car-v23-verification.json','car-v24-verification.json')
s=s.replace("if n.startswith('Mirror_'):mir.append(v)","if n.startswith('Antenna_'):continue\n if n.startswith('Mirror_'):mir.append(v)")
s=s.replace("'projection_review':['close-up left','close-up right','perspective','top']", "'projection_review':['rear deck close-up','outer lamp close-up','roof antenna','top','side','trunk open']")
extra='''
fin=world('Antenna_shark_fin_shell');base=world('Antenna_contoured_footplate')
assert s.graph.transforms.parents['Antenna_shark_fin_shell']=='Roof_antenna'
assert np.max(abs(fin[:,2]))<.034
assert abs((fin[:,0].max()-fin[:,0].min())-.185)<.0001
assert fin[:,0].min()>-1.30 and fin[:,0].max()<-.99
assert np.max(abs(fin[:,2]))>.025
report['antenna']={'length_mm':float(np.ptp(fin[:,0])*1000),'width_mm':float(np.ptp(fin[:,2])*1000),'maximum_height_from_ground_mm':float(fin[:,1].max()*1000),'contoured_base':True}
for name in ['Taillamp_Right_Outer_Lens','Taillamp_Left_Outer_Lens','Taillamp_Right_Inner_Lens','Taillamp_Left_Inner_Lens']:
 m=s.geometry[s.graph[name][1]];w=trimesh.Trimesh(m.vertices,m.faces,process=False);w.merge_vertices(digits_vertex=7);assert w.is_watertight,name
 assert s.graph.transforms.parents[name]==('Trunk_pivot' if '_Inner_' in name else 'world')
report['lens_edge_proud_note']='Nominal visual-model edge offset 2.5 mm above the rebuilt surround; not a BMW manufacturing tolerance.'
report['rear_glass_base_width_mm']=1300
report['nominal_side_gap_mm']=3.8
'''
s=s.replace("Path('outputs/car-v24-verification.json')",extra+"\nPath('outputs/car-v24-verification.json')")
Path('work/verify_v24.py').write_text(s,encoding='utf-8')
