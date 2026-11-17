from pathlib import Path
import sys,json,struct,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
from scipy.spatial import cKDTree
P=Path('outputs/bmw-viewer');s=trimesh.load(P/'bmw-surface-normals-v23.glb',force='scene',process=False)
old=trimesh.load(P/'bmw-wrapped-taillights-v21.glb',force='scene',process=False);parents=s.graph.transforms.parents
def world(n,src=s):return trimesh.transform_points(src.geometry[src.graph[n][1]].vertices,src.graph[n][0])
raw=(P/'bmw-surface-normals-v23.glb').read_bytes();L=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+L]);blob=raw[28+L:]
body=[];mir=[]
for n in s.graph.nodes_geometry:
 v=world(n);assert np.isfinite(v).all(),n
 if n.startswith('Mirror_'):mir.append(v)
 elif not parents.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):body.append(v)
v=np.vstack(body);mir=np.vstack(mir);f=s.graph['Steering_Left'][0][:3,3];fr=s.graph['Steering_Right'][0][:3,3];r=s.graph['Rear_mount_Left'][0][:3,3];rr=s.graph['Rear_mount_Right'][0][:3,3]
dims={'length_mm':np.ptp(v[:,0])*1000,'body_width_mm':np.ptp(v[:,2])*1000,'height_from_ground_mm':v[:,1].max()*1000,'mirror_width_mm':np.ptp(mir[:,2])*1000,'wheelbase_mm':(f[0]-r[0])*1000,'front_track_mm':(f[2]-fr[2])*1000,'rear_track_mm':(r[2]-rr[2])*1000,'front_overhang_mm':(v[:,0].max()-f[0])*1000,'rear_overhang_mm':(r[0]-v[:,0].min())*1000}
expected={'length_mm':4910,'body_width_mm':1892,'height_from_ground_mm':1451,'mirror_width_mm':2119,'wheelbase_mm':2964,'front_track_mm':1627,'rear_track_mm':1582,'front_overhang_mm':836,'rear_overhang_mm':1110}
print('dimensions',dims,flush=True);assert all(abs(dims[k]-val)<.11 for k,val in expected.items()),dims
closed={};motion={}
for n in ['Hood_shell','Trunk_lid','Roof','Windshield','Rear_windshield']+[f'Door_skin_{w}_{p}' for w in ['Front','Rear'] for p in ['Left','Right']]+[f'Window_{p}_{w}' for p in ['Left','Right'] for w in ['Front','Rear']]:
 m=s.geometry[s.graph[n][1]];w=trimesh.Trimesh(m.vertices,m.faces,process=False);w.merge_vertices(digits_vertex=7);closed[n]=bool(w.is_watertight);assert w.is_watertight,n
 assert abs(m.volume)>1e-8,n
for n in ['Hood_pivot','Trunk_pivot']+[f'Door_pivot_{w}_{p}' for w in ['Front','Rear'] for p in ['Left','Right']]:
 children=[c for c in s.graph.nodes_geometry if parents.get(c)==n];assert children
 v=np.vstack([world(c) for c in children]);axis=[0,0,1] if n in ['Hood_pivot','Trunk_pivot'] else [0,1,0]
 angle=np.deg2rad(-65 if n=='Trunk_pivot' or n.startswith('Door') and n.endswith('Left') else 65)
 R=trimesh.transformations.rotation_matrix(angle,axis,point=s.graph[n][0][:3,3]);delta=trimesh.transform_points(v,R).mean(0)-v.mean(0)
 motion[n]={'attached_meshes':len(children),'mean_motion_m':delta.tolist()}
 if n.startswith('Door'):
  assert delta[2]>0 if n.endswith('Right') else delta[2]<0
  which=n.split('_')[2];physical=n.rsplit('_',1)[-1];label='Right' if physical=='Left' else 'Left'
  for c in [f'Door_skin_{which}_{physical}',f'Window_{label}_{which}',f'Door_handle_{label}_{which}']:assert parents[c]==n,c
 else:assert delta[1]>.12,n
symmetry={}
for n in s.graph.nodes_geometry:
 if n.endswith('_Right') and n.startswith(('Door_skin_','Body_door_jambs_','Cabin_pillars_','Rocker_solid_','Fender_','Rear_arch_folded_','Front_arch_folded_')):
  pair=n[:-5]+'Left'
  if pair not in s.graph.nodes_geometry:continue
  a=world(n)*[1,1,-1];b=world(pair);err=float(cKDTree(b).query(a)[0].max()*1000);assert err<.002,(n,err);symmetry[n]=err
# Existing wheel geometry, wheel axes and corrected forward spin survive exactly.
wheel_meshes=0
for n in s.graph.nodes_geometry:
 if parents.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):
  assert np.array_equal(s.geometry[s.graph[n][1]].vertices,old.geometry[old.graph[n][1]].vertices),n;wheel_meshes+=1
assert sum(n.get('name','').startswith('Wheel_spin_') for n in doc['nodes'])==4
assert len(doc['animations'])==7
for m in doc['meshes']:
 for p in m['primitives']:
  assert 'NORMAL' in p['attributes'];a=doc['accessors'][p['attributes']['NORMAL']];bv=doc['bufferViews'][a['bufferView']]
  arr=np.frombuffer(blob,dtype='<f4',count=a['count']*3,offset=bv.get('byteOffset',0)+a.get('byteOffset',0));assert np.isfinite(arr).all()
rotors=[m for n,m in s.geometry.items() if 'Drilled_brake_rotor' in n];calipers=[m for n,m in s.geometry.items() if 'Caliper' in n]
assert len(rotors)==4 and all(np.array_equal(m.visual.material.baseColorFactor,[72,76,82,255]) for m in rotors)
assert calipers and all(np.array_equal(m.visual.material.baseColorFactor,[105,1,7,255]) for m in calipers)
# Tyre envelopes at straight ahead and both steering limits fit within the
# actual elliptical wheel-opening contours in side projection.
clearances={}
for label,axle,cy,rx,ry in [('Front',1.482,.34675,.425,.407),('Rear',-1.482,.3425,.407,.402)]:
 for ang in ([0,-25,25] if label=='Front' else [0]):
  for side in ['Left','Right']:
   pivot=f'Steering_{side}' if label=='Front' else f'Rear_mount_{side}'
   p=s.graph[pivot][0][:3,3]
   names=[n for n in s.graph.nodes_geometry if 'Tire' in n and 'groove' not in n and (parents.get(n,'')==('Wheel_spin_'+side if label=='Front' else 'Wheel_spin_Rear_'+side))]
   assert names,(label,side)
   vv=np.vstack([world(n) for n in names]);R=trimesh.transformations.rotation_matrix(np.deg2rad(ang),[0,1,0],point=p);vv=trimesh.transform_points(vv,R);vv=vv[vv[:,1]>=.21]
   metric=((vv[:,0]-axle)/rx)**2+((vv[:,1]-cy)/ry)**2;assert metric.max()<1,(label,side,ang,metric.max())
   clearances[f'{label}_{side}_{ang}']={'max_normalized_ellipse_radius':float(np.sqrt(metric.max()))}
report={'dimensions_mm':dims,'closed_new_shells':closed,'opening_motion':motion,'symmetry_error_mm':symmetry,'retained_wheel_meshes':wheel_meshes,'animation_clips':7,'wheel_spin_groups':4,'tyre_opening_checks':clearances,'steel_rotors':4,'deep_red_caliper_meshes':len(calipers),'normals_exported_on_all_meshes':True,'projection_review':['close-up left','close-up right','perspective','top'],'accuracy_note':'Dimension drawing constrains outline and scale; sculpted panel depths reconstructed from photographs, not original BMW CAD.'}

# Independent export check: exterior normals must follow the exterior faces,
# without receiving the wall's 90-degree turn at their shared positions.
edge_checks={}
for name in ['Door_skin_Front_Right','Door_skin_Rear_Right','Window_Left_Front','Window_Left_Rear','Window_Right_Front','Window_Right_Rear','Roof']:
 M,key=s.graph[name];m=s.geometry[key];v=world(name);norm=m.vertex_normals@np.linalg.inv(M[:3,:3]);norm/=np.linalg.norm(norm,axis=1)[:,None]
 axis=1 if name=='Roof' else 2;direction=1 if name=='Roof' or v[:,2].mean()>0 else -1
 candidates=[]
 for comp in trimesh.graph.connected_components(m.edges,nodes=np.arange(len(v)),min_len=3):
  if norm[comp,axis].mean()*direction>.20:candidates.append(comp)
 comp=max(candidates,key=len);isin=np.zeros(len(v),bool);isin[comp]=True;f=m.faces[np.all(isin[m.faces],axis=1)]
 used,ind=np.unique(f,return_inverse=True);geo=trimesh.Trimesh(v[used],ind.reshape(-1,3),process=False)
 ee=np.vstack([geo.faces[:,[0,1]],geo.faces[:,[1,2]],geo.faces[:,[2,0]]]);u,c=np.unique(np.sort(ee,axis=1),axis=0,return_counts=True);edge=np.unique(u[c==1])
 angle=np.rad2deg(np.arccos(np.clip(np.einsum('ij,ij->i',norm[used],geo.vertex_normals),-1,1)))
 p95=float(np.percentile(angle[edge],95));assert p95<9,(name,p95)
 if name.startswith('Window'):assert norm[used,1].mean()>0,(name,'glass normals face downward')
 edge_checks[name]={'boundary_normal_vs_exterior_deg_p50_p95_max':np.percentile(angle[edge],[50,95,100]).tolist()}
report['independent_exterior_normal_checks']=edge_checks
report['closed_mesh_note']='Render vertices are separated across hard edges; matching spatial vertices recover closed physical shells.'

Path('outputs/car-v23-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
