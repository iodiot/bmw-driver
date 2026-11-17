from pathlib import Path
p=Path('work/repair_sides_v16.py');s=p.read_text()
s=s.replace('from shapely.geometry import Polygon','from shapely.geometry import Polygon\nfrom scipy.interpolate import CubicSpline')
s=s.replace("'Concept_sill_','Belt_shoulder_joined_','Wheel_well_'))", "'Concept_sill_','Belt_shoulder_joined_','Wheel_well_'))")
needle='# Join the front fender\'s actual boundary to a complete wheelhouse too.'
addition='''# The rear door gap must terminate at the wheel opening, not hang inside it.
ctrl=np.array([[-1.38,1.045],[-1.30,.93],[-1.26,.82],[-1.23,.72],[-1.20,.65],[-1.19,.63]])
t=np.r_[0,np.cumsum(np.linalg.norm(np.diff(ctrl,axis=0),axis=1))]
p=CubicSpline(t,ctrl,bc_type='natural')(np.linspace(0,t[-1],240))
metric=((X(p[:,0])+1.482)/.407)**2+((p[:,1]*sy-.3425)/.395)**2
idx=np.flatnonzero(metric<1)[0];frac=(metric[idx-1]-1)/(metric[idx-1]-metric[idx]);last=p[idx-1]*(1-frac)+p[idx]*frac;p=np.vstack([p[:idx],last])
for sign,label in [(1,'Left'),(-1,'Right')]:
 n=f'Door_seam_{label}_Rear';scene.delete_geometry(scene.graph[n][1])
 v=np.column_stack([p,sign*(surface(p[:,0],p[:,1])+.0012)])
 add(tube(mapped(v),.0017,8),n,dark)
 # Remove the first few millimetres of the lower door gap inside the arch.
 n=f'Door_lower_seam_{label}';scene.delete_geometry(scene.graph[n][1])
 pp=np.array([[-1.075,.31],[-.98,.285],[-.35,.285],[.64,.29],[.715,.31]])
 tt=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pp,axis=0),axis=1))]
 pp=CubicSpline(tt,pp)(np.linspace(0,tt[-1],120))
 add(tube(mapped(np.column_stack([pp,sign*(surface(pp[:,0],pp[:,1])+.0012)])),.0017,8),n,dark)
# Close the lower ends of the wheelhouse instead of leaving open side slots.
for label in ['Left','Right']:
 for end in [0,-1]:
  tunnel=scene.geometry[scene.graph[f'Rear_wheelhouse_tunnel_{label}'][1]].vertices.reshape(len(arch),19,3)
  edge=tunnel[end];rows=[]
  for h in np.linspace(0,1,5):
   row=edge.copy();row[:,1]=edge[:,1]*(1-h)+.117*h;rows.append(row)
  patch(rows,f'Rear_wheelhouse_kick_{label}_{end}',felt)
'''
s=s.replace(needle,addition+'\n'+needle)
p.write_text(s)
p=Path('outputs/bmw-viewer/car-v16.html');s=p.read_text(encoding='utf-8')
import re
s=re.sub(r"\.panel\[open\] summary::after\{content:'[^']*'",r".panel[open] summary::after{content:'-'",s)
p.write_text(s,encoding='utf-8')
