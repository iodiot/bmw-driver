from pathlib import Path
import sys,json,struct,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
from scipy.interpolate import LinearNDInterpolator
P=Path('outputs/bmw-viewer');s=trimesh.load(P/'bmw-volumetric-taillights-v20.glb',force='scene',process=False);old=trimesh.load(P/'bmw-materials-v19.glb',force='scene',process=False)
parents=s.graph.transforms.parents
def world(n):return trimesh.transform_points(s.geometry[s.graph[n][1]].vertices,s.graph[n][0])
checks={};sym={};preserved=0
for n in old.graph.nodes_geometry:
 if n in s.graph.nodes_geometry and n!='Rear_bumper_sculpted':
  assert np.array_equal(old.geometry[old.graph[n][1]].vertices,s.geometry[s.graph[n][1]].vertices),n
  preserved+=1
for which in ['Outer','Inner']:
 for side in ['Right','Left']:
  prefix=f'Taillamp_{side}_{which}';n=prefix+'_Lens';m=s.geometry[s.graph[n][1]];v=world(n);N=len(v)//2
  assert m.is_watertight and abs(m.volume)>1e-8,n
  thickness=(v[N:,0]-v[:N,0])*1000;assert np.max(abs(thickness-2.8))<.001
  parent='Trunk_pivot' if which=='Inner' else 'world';assert parents[n]==parent
  back=LinearNDInterpolator(v[N:,2:0:-1],v[N:,0]);gaps=[]
  for k in range(3):
   g=prefix+f'_Lightguide_{k}';gm=s.geometry[s.graph[g][1]];gv=world(g);GN=len(gv)//2;gx=back(gv[:GN,2:0:-1]);assert np.isfinite(gx).all(),g
   gap=(gv[:GN,0]-gx)*1000;gaps.append(float(gap.min()));assert gap.min()>8.9,g
  checks[prefix]={'closed_cover':True,'cover_thickness_x_mm':[float(thickness.min()),float(thickness.max())],'minimum_guide_clearance_mm':min(gaps),'parent':parent}
for n in s.graph.nodes_geometry:
 if n.startswith('Taillamp_Right_'):
  l=n.replace('Right','Left');a=world(n);b=world(l);err=float(np.linalg.norm(a*[1,1,-1]-b,axis=1).max()*1000);sym[n]=err;assert err<.001
body=[];mir=[]
for n in s.graph.nodes_geometry:
 v=world(n);assert np.isfinite(v).all()
 if n.startswith('Mirror_'):mir.append(v)
 elif not parents.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):body.append(v)
v=np.vstack(body);mir=np.vstack(mir);front=s.graph['Steering_Left'][0][:3,3];fr=s.graph['Steering_Right'][0][:3,3];rear=s.graph['Rear_mount_Left'][0][:3,3];rr=s.graph['Rear_mount_Right'][0][:3,3]
dims={'length_mm':np.ptp(v[:,0])*1000,'body_width_mm':np.ptp(v[:,2])*1000,'height_from_ground_mm':v[:,1].max()*1000,'mirror_width_mm':np.ptp(mir[:,2])*1000,'wheelbase_mm':(front[0]-rear[0])*1000,'front_track_mm':(front[2]-fr[2])*1000,'rear_track_mm':(rear[2]-rr[2])*1000,'front_overhang_mm':(v[:,0].max()-front[0])*1000,'rear_overhang_mm':(rear[0]-v[:,0].min())*1000}
expected={'length_mm':4910,'body_width_mm':1892,'height_from_ground_mm':1451,'mirror_width_mm':2119,'wheelbase_mm':2964,'front_track_mm':1627,'rear_track_mm':1582,'front_overhang_mm':836,'rear_overhang_mm':1110}
assert all(abs(dims[k]-val)<.11 for k,val in expected.items()),dims
raw=(P/'bmw-volumetric-taillights-v20.glb').read_bytes();L=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+L]);assert len(d['animations'])==7
report={'dimensions_mm':dims,'lamp_sections':checks,'maximum_symmetry_error_mm':max(sym.values()),'preserved_original_meshes':preserved,'light_guides':12,'animation_clips':7,'wheel_spin_groups':sum(n.get('name','').startswith('Wheel_spin_') for n in d['nodes'])}
Path('outputs/car-v20-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
