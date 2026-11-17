from pathlib import Path
import sys,ast,json
import numpy as np
sys.path[:0]=[str(Path(__file__).parent),str(Path(__file__).parent/'front-libs')]
import trimesh
from scipy.interpolate import CubicSpline
from shapely.geometry import Polygon,LineString,Point,box
from shapely import segmentize
from shapely.ops import unary_union
from shapely.prepared import prep
from glb_export import export_scene
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
scene=trimesh.load(OUT/'bmw-volumetric-taillights-v20.glb',force='scene',process=False)
old19=trimesh.load(OUT/'bmw-materials-v19.glb',force='scene',process=False)
materials={m.visual.material.name:m.visual.material for m in scene.geometry.values()}
paint=materials['Black sapphire paint'];SY=.9367371792029296;SZ=.9845713182727399;SX=.97743871;TX=-.01584192
for f in ast.parse((ROOT/'work/build_car_v9.py').read_text(encoding='utf-8-sig')).body:
 if isinstance(f,ast.FunctionDef) and f.name=='tube':exec(compile(ast.Module(body=[f],type_ignores=[]),'helpers','exec'))
def rearX(u,y=None):return SX*(-2.62+.15*(u/(SZ*.96))**3)+TX
# Horizontal spine: rear plane -> rounded body corner -> side wing.
u=np.linspace(.576,.825,110);back=np.column_stack([rearX(u),u]);A=back[-1];E=np.array([-2.24,.926]);slope=SX*.45*.825**2/(SZ*.96)**3;B=np.array([A[0]+slope*(E[1]-A[1]),E[1]])
t=np.linspace(0,1,180)[1:];corner=(1-t[:,None])**2*A+2*(1-t[:,None])*t[:,None]*B+t[:,None]**2*E
lamp_spine=np.vstack([back,corner]);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(lamp_spine,axis=0),axis=1))];L=arc[-1]
ext=np.column_stack([np.linspace(E[0],-2.13,65)[1:],np.full(64,E[1])]);full=np.vstack([lamp_spine,ext]);fullarc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(full,axis=0),axis=1))]
curve=CubicSpline(fullarc,full,axis=0,bc_type='natural')
O=np.array([-2.17,.78]);theta=np.arctan2(full[:,1]-O[1],-(full[:,0]-O[0]));radius=np.linalg.norm(full-O,axis=1)
assert np.all(np.diff(theta)>0)
def coordS(v):
 z=np.abs(v[:,2]);th=np.arctan2(z-O[1],-(v[:,0]-O[0]));return np.interp(th,theta,fullarc)
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def deform(v):
 v=np.array(v,float);sign=np.where(v[:,2]>=0,1.,-1.);z=np.abs(v[:,2]);th=np.arctan2(z-O[1],-(v[:,0]-O[0]));r=np.hypot(v[:,0]-O[0],z-O[1]);rn=np.interp(th,theta,radius)
 w=smooth((v[:,1]-.65)/.05)*smooth((.945-v[:,1])/.025)*smooth((z-.78)/.045)*smooth((-v[:,0]-2.18)/.06)
 rr=r+(rn-r)*w;v[:,0]=O[0]-rr*np.cos(th);v[:,2]=sign*(O[1]+rr*np.sin(th));return v
# Fill the old rear-only openings before cutting the new wrapped apertures.
def old_outline(side):
 n=f'Rear_lamp_{side}_Outer_lens';M,g=old19.graph[n];m=old19.geometry[g].copy();m.merge_vertices(digits_vertex=7);loop=max(m.outline().discrete,key=len);v=trimesh.transform_points(loop,M);return Polygon(np.column_stack([abs(v[:,2]),v[:,1]]))
oldpoly=old_outline('Right');uv=np.array(oldpoly.exterior.coords);v=np.column_stack([rearX(uv[:,0]),uv[:,1],uv[:,0]])
old_uv=Polygon(np.column_stack([coordS(v),v[:,1]]))
shape=np.array([[0,.703],[0,.896],[.29,.917],[.53,.919],[.75,.896],[.91,.864],[1,.835],[.985,.791],[.91,.753],[.76,.721],[.53,.703]])
shape[:,0]*=L
aperture=unary_union([Polygon(shape),old_uv]).convex_hull
lenspoly=aperture.buffer(-.007).buffer(.007).buffer(-.001)
cutpoly=aperture.buffer(.0012);prepared=prep(cutpoly);cutbounds=cutpoly.bounds
n='Rear_quarter_lamp_panel';g=scene.graph[n][1];m=scene.geometry[g].copy();parts=[m]
for sign in [1,-1]:
 uv,f=trimesh.creation.triangulate_polygon(oldpoly,engine='triangle',triangle_args='pq25a.00012');v=np.column_stack([rearX(uv[:,0]),uv[:,1],sign*uv[:,0]]);plug=trimesh.Trimesh(v,f,process=False)
 if plug.face_normals[:,0].mean()>0:plug.invert()
 parts.append(plug)
combined=trimesh.util.concatenate(parts);combined.visual=trimesh.visual.TextureVisuals(material=paint);scene.geometry[g]=combined
for n in list(scene.graph.nodes_geometry):
 if n.startswith('Taillamp_') and '_Outer_' in n:scene.delete_geometry(scene.graph[n][1])
# Return the bumper to its unmodified surface; its small dimension anchor uses
# one smooth compact bulge, without the prior nearest-boundary field.
n='Rear_bumper_sculpted';g=scene.graph[n][1];bm=old19.geometry[old19.graph[n][1]].copy();bv=bm.vertices.copy();q=np.clip((bv[:,1]-.39)/.14,0,1);wy=np.sin(q*np.pi)**4;wz=np.clip(1-(bv[:,2]/.66)**2,0,1)**4;w=wy*wz
lo,hi=0.,.06
for _ in range(50):
 a=(lo+hi)/2
 if np.min(bv[:,0]-a*w)>-2.592:lo=a
 else:hi=a
amp=hi;bv[:,0]-=amp*w;bm.vertices=bv
qy=(bv[:,1]-.39)/.14;dwy=4*np.sin(q*np.pi)**3*np.cos(q*np.pi)*np.pi/.14*((qy>0)&(qy<1));zq=1-(bv[:,2]/.66)**2;dwz=4*np.maximum(zq,0)**3*(-2*bv[:,2]/.66**2)*(zq>0)
rawq=(.48-bv[:,1]/SY)/.25;basey=-SX*.14*np.clip(rawq,0,1)/(.25*SY)*((rawq>0)&(rawq<1));basez=SX*.45*bv[:,2]*abs(bv[:,2])/(SZ*.96)**3
nn=np.column_stack([-np.ones(len(bv)),basey-amp*dwy*wz,basez-amp*wy*dwz]);nn/=np.linalg.norm(nn,axis=1)[:,None];bm.vertex_normals=nn;scene.geometry[g]=bm
# Cut actual openings in both the rear-facing and side-facing body surfaces.
changed=[];cutfaces=0
for n in list(scene.graph.nodes_geometry):
 M,g=scene.graph[n];m=scene.geometry[g]
 if m.visual.material.name!='Black sapphire paint':continue
 v=trimesh.transform_points(m.vertices,M)
 if v[:,0].min()>-2.15 or np.abs(v[:,2]).max()<.78 or v[:,1].max()<.65 or v[:,1].min()>.945:continue
 cancut=v[:,1].min()<cutbounds[3] and v[:,1].max()>cutbounds[1]
 vv=[];ff=[]
 if cancut:
  suv=np.column_stack([coordS(v),v[:,1]])
  for face in m.faces:
   pts=v[face];uv=suv[face]
   if np.abs(pts[:,2]).max()<.55 or uv[:,0].max()<cutbounds[0] or uv[:,0].min()>cutbounds[2] or uv[:,1].max()<cutbounds[1] or uv[:,1].min()>cutbounds[3]:
    k=len(vv);vv.extend(pts);ff.append([k,k+1,k+2]);continue
   poly=Polygon(uv)
   if poly.area<1e-12 or not prepared.intersects(poly):
    k=len(vv);vv.extend(pts);ff.append([k,k+1,k+2]);continue
   remain=poly.difference(cutpoly);cutfaces+=1
   for pp in (list(remain.geoms) if remain.geom_type=='MultiPolygon' else [remain]):
    if pp.is_empty or pp.area<1e-12:continue
    pu,pf=trimesh.creation.triangulate_polygon(pp,engine='earcut')
    weights=np.linalg.solve(np.vstack([uv.T,np.ones(3)]),np.column_stack([pu,np.ones(len(pu))]).T).T
    new=weights@pts;k=len(vv);vv.extend(new);ff.extend(pf+k)
  vv=np.asarray(vv);ff=np.asarray(ff)
 else:vv=v;ff=m.faces.copy()
 out=trimesh.Trimesh(deform(vv),ff,process=False);out.merge_vertices(digits_vertex=7,merge_norm=True,merge_tex=True);out.remove_unreferenced_vertices();out.visual=trimesh.visual.TextureVisuals(material=m.visual.material)
 out.vertices=trimesh.transform_points(out.vertices,np.linalg.inv(M));scene.geometry[g]=out;changed.append(n)
# All optical layers follow the same curved spine. Extrusion depth is along
# the inward normal, so the side portion has the same real thickness.
lo=np.array(lenspoly.bounds[:2]);hi=np.array(lenspoly.bounds[2:])
def point(uv,depth):
 s=uv[:,0];y=uv[:,1];xz=curve(s);d=curve(s,1);N=np.column_stack([-d[:,1],d[:,0]]);N/=np.linalg.norm(N,axis=1)[:,None]
 q=np.clip((uv-lo)/(hi-lo),0,1);crown=.006*np.sin(q[:,0]*np.pi)**2*np.sin(q[:,1]*np.pi)**2
 xz=xz+N*(crown+.001-depth)[:,None];return np.column_stack([xz[:,0],y,xz[:,1]])
built=[]
def solid(poly,depth,thickness,name,mat):
 meshes=[]
 for p in (list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]):
  if p.is_empty or p.area<1e-9:continue
  p=segmentize(p,max_segment_length=.009);uv,f=trimesh.creation.triangulate_polygon(p,engine='triangle',triangle_args='pq25a.00007');N=len(uv);a=point(uv,depth);b=point(uv,depth+thickness)
  h=1e-5;ds=(point(uv+[h,0],depth)-point(uv-[h,0],depth))/(2*h);dy=(point(uv+[0,h],depth)-point(uv-[0,h],depth))/(2*h);nn=np.cross(ds,dy);nn/=np.linalg.norm(nn,axis=1)[:,None]
  test=trimesh.Trimesh(a,f,process=False)
  if np.sum(test.face_normals*nn[f].mean(1))<0:f=f[:,::-1]
  e=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);u,c=np.unique(np.sort(e,axis=1),axis=0,return_counts=True);one={tuple(e) for e in u[c==1]};e=np.array([e for e in e if tuple(sorted(e)) in one])
  walls=np.vstack([np.column_stack([e[:,1],e[:,0],e[:,0]+N]),np.column_stack([e[:,1],e[:,0]+N,e[:,1]+N])]);m=trimesh.Trimesh(np.vstack([a,b]),np.vstack([f,f[:,::-1]+N,walls]),process=False);m.fix_normals();assert m.is_watertight,name;m.vertex_normals=np.vstack([nn,-nn]);meshes.append(m)
 m=trimesh.util.concatenate(meshes);m.visual=trimesh.visual.TextureVisuals(material=mat);scene.add_geometry(m,node_name=name,geom_name=name);built.append(name);return m
pre='Taillamp_Right_Outer';cavity=lenspoly.buffer(-.004)
solid(aperture.buffer(.001).difference(cavity),.001,.056,pre+'_Housing_frame',materials['Taillamp molded housing'])
solid(cavity,.052,.006,pre+'_Housing_back',materials['Taillamp ruby backing'])
solid(aperture.buffer(.001).difference(lenspoly),-.001,.006,pre+'_Gasket',materials['Taillamp perimeter gasket'])
solid(cavity.difference(cavity.buffer(-.007)),.012,.037,pre+'_Inner_bezel',materials['Taillamp smoked reflector'])
for k in range(3):
 y=.725+k*.036
 path=np.array([[.04,y],[.24,y],[.49,y+.003],[.69,y+.014],[.82,y+.040],[.94-.04*k,y+.088]])
 path[:,0]*=L;tt=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))];path=CubicSpline(tt,path,bc_type='natural')(np.linspace(0,tt[-1],150));ln=LineString(path)
 channel=ln.buffer(.011).intersection(cavity.buffer(-.005));well=ln.buffer(.0068).intersection(cavity.buffer(-.007));band=ln.buffer(.0047).intersection(cavity.buffer(-.009))
 solid(channel,.036,.007,pre+f'_Reflector_floor_{k}',materials['Reflector optical facets']);solid(channel.difference(well),.020,.018,pre+f'_Reflector_walls_{k}',materials['Taillamp smoked reflector']);solid(band,.012,.007,pre+f'_Lightguide_{k}',materials['Rear LED guides V20'])
chamber=box(.075*L,.875,.34*L,.894).buffer(.003).intersection(cavity.buffer(-.008));solid(chamber,.033,.006,pre+'_Indicator_chamber',materials['Taillamp smoked reflector'])
for j,s in enumerate(np.linspace(.09*L,.32*L,17)):
 p=box(s-.0014,.877,s+.0014,.892).intersection(chamber)
 if not p.is_empty:solid(p,.022,.007,pre+f'_Indicator_prism_{j}',materials['Amber indicator optics'])
solid(lenspoly,0,.0028,pre+'_Lens',materials['Taillamp ruby cover'])
for n in list(built):
 g=scene.graph[n][1];m=scene.geometry[g].copy();m.apply_transform(np.diag([1,1,-1,1]));nn=n.replace('Right','Left');scene.add_geometry(m,node_name=nn,geom_name=nn)
panels={'Hood_pivot':(2,np.deg2rad(65)),'Trunk_pivot':(2,-np.deg2rad(65))}
for which in ['Front','Rear']:
 for side in ['Left','Right']:panels[f'Door_pivot_{which}_{side}']=(1,(1 if side=='Right' else -1)*np.deg2rad(65 if which=='Front' else 62))
np.savez(ROOT/'work/lamp_spine_v21.npz',s=fullarc,points=full,length=L)
stats=export_scene(scene,OUT/'bmw-wrapped-taillights-v21.glb',21,{'method':'Rear lamps wrap around a rounded body corner into real wing apertures','outer_lamp_spine_length_mm':L*1000,'outer_lamp_forward_tip_x_mm':-2240,'body_surfaces_rebuilt':changed},panels)
stats.update({'method':'Wrapped outer rear lamps and rounded quarter-panel openings; no SF3D generation','outer_lamp_spine_length_mm':round(L*1000,2),'body_panels_rebuilt':len(changed),'body_triangles_cut':cutfaces,'lens_thickness_mm':2.8})
(ROOT/'outputs/car-v21-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats));print('body',changed)

