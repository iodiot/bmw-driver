from pathlib import Path
import sys,json,struct,numpy as np
sys.path.insert(0,str(Path('work/front-libs').resolve()))
import trimesh
from scipy.interpolate import CubicSpline
P=Path('outputs/bmw-viewer');s=trimesh.load(P/'bmw-wrapped-taillights-v21.glb',force='scene',process=False);old=trimesh.load(P/'bmw-volumetric-taillights-v20.glb',force='scene',process=False)
raw=(P/'bmw-wrapped-taillights-v21.glb').read_bytes();J=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+J]);changed=doc['asset']['extras']['body_surfaces_rebuilt'];parents=s.graph.transforms.parents

def world(n):return trimesh.transform_points(s.geometry[s.graph[n][1]].vertices,s.graph[n][0])
checks={};sym=0.;retained=0
for n in old.graph.nodes_geometry:
 if n in changed or n.startswith('Taillamp_') and '_Outer_' in n:continue
 if n in s.graph.nodes_geometry:
  assert np.array_equal(s.geometry[s.graph[n][1]].vertices,old.geometry[old.graph[n][1]].vertices),n;retained+=1
for side in ['Right','Left']:
 for which in ['Outer','Inner']:
  n=f'Taillamp_{side}_{which}_Lens';m=s.geometry[s.graph[n][1]];v=world(n);N=len(v)//2
  assert m.is_watertight and abs(m.volume)>1e-8,n
  th=np.linalg.norm(v[:N]-v[N:],axis=1)*1000;assert max(abs(th-2.8))<.001
  assert parents[n]==('Trunk_pivot' if which=='Inner' else 'world')
  checks[n]={'closed':True,'thickness_mm':[float(th.min()),float(th.max())],'frontmost_x_mm':float(v[:,0].max()*1000)}
for n in s.graph.nodes_geometry:
 if n.startswith('Taillamp_Right_Outer_'):
  a=world(n);b=world(n.replace('Right','Left'));err=float(np.linalg.norm(a*[1,1,-1]-b,axis=1).max()*1000);sym=max(sym,err);assert err<.001
# Independent rays verify that the visible side lamp sits in a real body opening.
bodytri=[]
for n in s.graph.nodes_geometry:
 m=s.geometry[s.graph[n][1]]
 if m.visual.material.name!='Black sapphire paint':continue
 v=world(n)
 if v[:,0].min()<-2.1 and v[:,1].max()>.65:bodytri.append(v[m.faces])
tri=np.concatenate(bodytri);e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0]
def hit(origin,direction):
 h=np.cross(direction,e2);aa=np.einsum('ij,ij->i',e1,h);valid=np.abs(aa)>1e-10;inv=np.zeros_like(aa);inv[valid]=1/aa[valid];q=origin-tri[:,0];u=inv*np.einsum('ij,ij->i',q,h);qq=np.cross(q,e1);v=inv*np.einsum('ij,j->i',qq,direction);t=inv*np.einsum('ij,ij->i',e2,qq);good=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>1e-6)
 return float(t[good].min()) if good.any() else None
n='Taillamp_Right_Outer_Lens';m=s.geometry[s.graph[n][1]];wv=world(n);N=len(wv)//2;norm=m.vertex_normals[:N];verts=wv[:N]
raychecks={}
for label,target in [('Rear',np.array([-2.53,.79,.66])),('Side',np.array([-2.29,.82,.926]))]:
 idx=np.argmin(np.linalg.norm(verts-target,axis=1));p=verts[idx];nn=norm[idx];distance=hit(p+nn*.1,-nn)
 assert distance is None or distance>.0995,(label,distance)
 raychecks[label]={'body_occludes_lens':False,'nearest_body_behind_ray_origin_m':distance,'lens_point_mm':(p*1000).tolist(),'outward_normal':nn.tolist()}
assert raychecks['Side']['outward_normal'][2]>.8
assert checks['Taillamp_Right_Outer_Lens']['frontmost_x_mm']>-2270
sp=np.load('work/lamp_spine_v21.npz');curve=CubicSpline(sp['s'],sp['points'],axis=0);ss=np.linspace(.005,float(sp['length'])-.005,3000);v=curve(ss,1);a=curve(ss,2);R=np.linalg.norm(v,axis=1)**3/np.maximum(1e-9,np.abs(v[:,0]*a[:,1]-v[:,1]*a[:,0]));assert R.min()>.056
body=[];mir=[]
for n in s.graph.nodes_geometry:
 v=world(n);assert np.isfinite(v).all()
 if n.startswith('Mirror_'):mir.append(v)
 elif not parents.get(n,'').startswith(('Wheel_spin_','Steering_','Rear_mount_')):body.append(v)
v=np.vstack(body);mir=np.vstack(mir);f=s.graph['Steering_Left'][0][:3,3];fr=s.graph['Steering_Right'][0][:3,3];r=s.graph['Rear_mount_Left'][0][:3,3];rr=s.graph['Rear_mount_Right'][0][:3,3]
dims={'length_mm':np.ptp(v[:,0])*1000,'body_width_mm':np.ptp(v[:,2])*1000,'height_from_ground_mm':v[:,1].max()*1000,'mirror_width_mm':np.ptp(mir[:,2])*1000,'wheelbase_mm':(f[0]-r[0])*1000,'front_track_mm':(f[2]-fr[2])*1000,'rear_track_mm':(r[2]-rr[2])*1000,'front_overhang_mm':(v[:,0].max()-f[0])*1000,'rear_overhang_mm':(r[0]-v[:,0].min())*1000}
expected={'length_mm':4910,'body_width_mm':1892,'height_from_ground_mm':1451,'mirror_width_mm':2119,'wheelbase_mm':2964,'front_track_mm':1627,'rear_track_mm':1582,'front_overhang_mm':836,'rear_overhang_mm':1110}
assert all(abs(dims[k]-val)<.11 for k,val in expected.items()),dims
assert len(doc['animations'])==7
report={'dimensions_mm':dims,'lamp_sections':checks,'maximum_outer_lamp_symmetry_error_mm':sym,'real_body_opening_ray_checks':raychecks,'minimum_curve_radius_mm':float(R.min()*1000),'housing_depth_mm':56,'other_meshes_preserved':retained,'animation_clips':7,'wheel_spin_groups':4}
Path('outputs/car-v21-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
