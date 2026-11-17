from pathlib import Path
import sys,json,numpy as np
sys.path[:0]=[str(Path('work').resolve()),str(Path('work/front-libs').resolve())]
import trimesh
from scipy.interpolate import PchipInterpolator
from shapely.geometry import Polygon,Point,LineString,box
from shapely.ops import unary_union
from shapely import segmentize
from glb_export import export_scene
ROOT=Path(__file__).resolve().parents[1];P=ROOT/'outputs/bmw-viewer'
ctx={'__file__':str(ROOT/'work/fix_surface_normals_v23.py')}
exec((ROOT/'work/fix_surface_normals_v23.py').read_text(encoding='utf-8-sig').split('def refine(')[0],ctx)
C=ctx['cabin_smooth'];V=ctx['ns'];wf=V['wf'];wr=V['wr'];px=V['px']
s=trimesh.load(P/'bmw-rear-joints-v24.glb',force='scene',process=False)
mats={m.visual.material.name:m.visual.material for m in s.geometry.values()};paint=mats['Black sapphire paint'];glass=mats['Reflective automotive glass']
seal=trimesh.visual.material.PBRMaterial(name='Window EPDM seal',baseColorFactor=[2,3,4,255],roughnessFactor=.78,doubleSided=True)
frame=trimesh.visual.material.PBRMaterial(name='Black window frame enamel',baseColorFactor=[5,7,10,255],metallicFactor=.45,roughnessFactor=.25,doubleSided=True)
post=trimesh.visual.material.PBRMaterial(name='Satin black B pillar',baseColorFactor=[4,5,7,255],metallicFactor=.15,roughnessFactor=.36,doubleSided=True)
metal=trimesh.visual.material.PBRMaterial(name='Satin window moulding aluminium',baseColorFactor=[70,78,88,255],metallicFactor=.85,roughnessFactor=.42,doubleSided=True)
frit=trimesh.visual.material.PBRMaterial(name='Black ceramic glass border',baseColorFactor=[1,2,3,255],metallicFactor=0,roughnessFactor=.36,doubleSided=True)
for finish in [seal,frame,post,metal,frit]:finish.doubleSided=False
created=[];records={}
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def remove(n):
 if n in s.graph.nodes_geometry:s.delete_geometry(s.graph[n][1])
def add(m,n,mat,parent=None):
 m.visual=trimesh.visual.TextureVisuals(material=mat);T=np.linalg.inv(s.graph[parent][0]) if parent else np.eye(4)
 s.add_geometry(m,node_name=n,geom_name=n,parent_node_name=parent,transform=T);created.append(n);return m
def normal(uv,S,direction):
 h=1e-5;du=(S(uv+[h,0])-S(uv-[h,0]))/(2*h);dv=(S(uv+[0,h])-S(uv-[0,h]))/(2*h);nn=np.cross(du,dv)
 if np.einsum('ij,j->i',nn,np.array(direction)).mean()<0:nn*=-1
 nn/=np.maximum(np.linalg.norm(nn,axis=1)[:,None],1e-12);return nn
def join(parts):
 vv=[];ff=[];nn=[];off=0
 for m in parts:vv.append(m.vertices);ff.append(m.faces+off);nn.append(m.vertex_normals);off+=len(m.vertices)
 return trimesh.Trimesh(np.vstack(vv),np.vstack(ff),vertex_normals=np.vstack(nn),process=False)
def solid(poly,S,height,depth,direction,name,mat,parent=None,area=.000025,spacing=.004,analytic=False):
 parts=[]
 for p in (list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]):
  if p.is_empty or p.area<1e-8:continue
  p=segmentize(p.simplify(.00002,preserve_topology=True),max_segment_length=spacing)
  uv,ff=trimesh.creation.triangulate_polygon(p,engine='triangle',triangle_args=f'pq28a{area}')
  nn=normal(uv,S,direction);base=S(uv);hh=height(uv) if callable(height) else np.full(len(uv),height)
  v=base+nn*hh[:,None];out=trimesh.Trimesh(v,ff,process=False)
  if (out.face_normals*nn[ff].mean(1)).sum()<0:ff=ff[:,::-1];out=trimesh.Trimesh(v,ff,process=False)
  shade=nn
  if analytic and callable(height):
   def raised(q):return S(q)+normal(q,S,direction)*height(q)[:,None]
   eps=1e-5;du=(raised(uv+[eps,0])-raised(uv-[eps,0]))/(2*eps);dv=(raised(uv+[0,eps])-raised(uv-[0,eps]))/(2*eps);shade=np.cross(du,dv)
   if np.sum(shade*nn)<0:shade*=-1
   shade/=np.maximum(np.linalg.norm(shade,axis=1)[:,None],1e-12)
  if analytic:out.vertex_normals=shade
  inner=trimesh.Trimesh(v-nn*depth,ff[:,::-1],process=False)
  if analytic:inner.vertex_normals=-shade
  N=len(v);ee=np.vstack([ff[:,[0,1]],ff[:,[1,2]],ff[:,[2,0]]]);u,c=np.unique(np.sort(ee,axis=1),axis=0,return_counts=True);one={tuple(x) for x in u[c==1]};e=np.array([e for e in ee if tuple(sorted(e)) in one])
  walls=np.vstack([np.column_stack([e[:,1],e[:,0],e[:,0]+N]),np.column_stack([e[:,1],e[:,0]+N,e[:,1]+N])])
  wall=trimesh.Trimesh(np.vstack([v,v-nn*depth]),walls,process=False);wall.remove_unreferenced_vertices()
  parts.extend([out,inner,wall])
 m=join(parts);add(m,name,mat,parent)
 check=trimesh.Trimesh(m.vertices,m.faces,process=False);check.merge_vertices(digits_vertex=7)
 if not check.is_watertight:
  check.update_faces(check.area_faces>1e-14);check.remove_unreferenced_vertices()
 assert check.is_watertight,(name,len(check.edges_unique[np.bincount(check.edges_unique_inverse)!=2]))
 records[name]={'parent':parent or 'world','physically_closed':True,'triangles':len(m.faces),'depth_mm':depth*1000}
 return m
def rounded_rect(a,b,c,d,r):return box(a,b,c,d).buffer(-r).buffer(r)
def signed_distance(uv,p):
 return np.array([p.boundary.distance(Point(q))*(1 if not p.contains(Point(q)) else -1) for q in uv])
def Side(sign):
 def S(uv):
  uv=np.asarray(uv);return np.column_stack([uv,sign*C(uv[:,0],uv[:,1])])
 return S
def BodySide(sign):
 S=Side(sign)
 def body(uv):
  v=S(uv);x,y=v[:,0].copy(),v[:,1].copy();v[:,1]-=.025*smooth((-x-1.48)/.30)*smooth((x+2.14)/.20)*smooth((y-.94)/.10);return v
 return body

# Replace the thin, identical outlines with framed doors, soft inner seals,
# a proper outer arch and separate belt mouldings. The centre post has no chrome.
for n in list(s.graph.nodes_geometry):
 if n.startswith(('Window_frame_','Window_chrome_','Window_trim_')):remove(n)
for sign,label,physical in [(1,'Left','Right'),(-1,'Right','Left')]:
 S=Side(sign);direction=[0,0,sign]
 for which,p in [('Front',wf),('Rear',wr)]:
  pivot=f'Door_pivot_{which}_{physical}'
  remove(f'Window_{label}_{which}')
  solid(p,S,.0015,.003,direction,f'Window_{label}_{which}',glass,pivot,.00017,.005,True)
  # Ceramic frit inside the pane and a softly raised rubber glazing channel.
  solid(p.difference(p.buffer(-.011)),S,.00195,.0005,direction,f'Window_frit_{label}_{which}',frit,pivot,.000008,.003,True)
  gasket=p.buffer(.0055).difference(p.buffer(-.0015))
  ghcurve=PchipInterpolator([-.0015,.001,.0035,.0055],[.0019,.0048,.0047,.0035])
  def gh(uv,p=p,hh=ghcurve):return hh(np.clip(signed_distance(uv,p),-.0015,.0055))
  solid(gasket,S,gh,.006,direction,f'Window_glass_seal_{label}_{which}',seal,pivot,.000006,.0025,True)
  profile=p.buffer(.022).difference(p.buffer(.004))
  fhcurve=PchipInterpolator([.004,.007,.012,.017,.020,.022],[.0038,.0063,.0070,.0068,.0048,.0012])
  def fh(uv,p=p,hh=fhcurve):return hh(np.clip(signed_distance(uv,p),.004,.022))
  bline=LineString(px([[699,645],[681,732]]) if which=='Front' else px([[712,645],[694,732]]))
  bm=bline.buffer(.030,cap_style=2)
  solid(profile.difference(bm),S,fh,.011,direction,f'Window_frame_{label}_{which}',frame,pivot,.000008,.003,True)
  solid(profile.intersection(bm),S,fh,.011,direction,f'Window_B_post_trim_{label}_{which}',post,pivot,.000008,.003,True)
  # Chrome follows only the outside arch and sill, never the B-pillar edge.
  chromepoly=p.buffer(.021).difference(p.buffer(.018)).difference(bline.buffer(.024,cap_style=2))
  lowx=np.linspace(p.bounds[0]-.1,p.bounds[2]+.1,150)
  line=px([[445,739],[681,732]]) if which=='Front' else px([[694,732],[897,729]])
  order=np.argsort(line[:,0]);by=np.interp(lowx,line[order,0],line[order,1])+.010
  lowerMask=Polygon(np.vstack([[lowx[0],.75],[lowx[-1],.75],np.column_stack([lowx[::-1],by[::-1]])]))
  for poly,suffix in [(chromepoly.difference(lowerMask),'outer_arch'),(chromepoly.intersection(lowerMask),'belt_moulding')]:
   if not poly.is_empty:solid(poly,S,.0083,.0016,direction,f'Window_{suffix}_{label}_{which}',metal,pivot,.000004,.002,True)

 # A wider, physically closed roof rail/A/C surround with actual door openings.
 # Expand only where the traced glass outline needs room, and retain the belt.
 old=V['cabinpoly'];outer=unary_union([old,wf.buffer(.046),wr.buffer(.046)])
 xx=np.linspace(-1.94,.79,310);bottom=np.column_stack([xx,V['belt'](xx)])
 above=Polygon(np.vstack([bottom,[[.79,1.6],[-1.94,1.6]]]))
 fixed=outer.intersection(above).difference(unary_union([wf.buffer(.0255),wr.buffer(.0255)]))
 remove(f'Cabin_pillars_and_roof_rail_{physical}')
 solid(fixed,BodySide(sign),0,.014,direction,f'Cabin_pillars_and_roof_rail_{physical}',paint,None,.000035,.004,True)
 # Recessed structural post and its satin-black visible cap remain on the body.
 btop=px([[705.5,645]])[0];bbot=px([[687.5,732]])[0]
 poly=Polygon([[btop[0]-.018,btop[1]+.025],[btop[0]+.018,btop[1]+.025],[bbot[0]+.018,float(V['belt'](bbot[0]))+.002],[bbot[0]-.018,float(V['belt'](bbot[0]))+.002]])
 solid(poly,S,-.017,.035,direction,f'B_pillar_backbone_{physical}',post,None,.000018,.004,True)

# The front and rear glass have shaped ceramic borders, seals and coloured
# aperture lips. All are generated from the same curved surface as the pane.
LF=.80;WF=.72;LR=.82;WR=.65;topWidth=float(C(-1.22,1.337))
def Front(uv):
 t=uv[:,0]/LF;zeta=uv[:,1]/WF;a=zeta*zeta
 x=(.99-.24*a)*(1-t)+(.21-.25*a)*t;y=(1.012-.032*a)*(1-t)+(1.382-.034*a)*t
 sideX=.75*(1-t)-.04*t;sideY=.98*(1-t)+1.348*t;z=zeta*C(sideX,sideY)
 return np.column_stack([x,y,z])
def Rear(uv):
 t=uv[:,0]/LR;zeta=uv[:,1]/WR;a=zeta*zeta
 x=(-1.30+.08*a)*(1-t)+(-2.06+.14*a)*t;y=(1.372-.035*a)*(1-t)+(1.095-.015*a)*t
 z=zeta*(topWidth*(1-t)+.650*t+.008*np.sin(np.pi*t));return np.column_stack([x,y,z])
for name,S,L,W in [('Windshield',Front,LF,WF),('Rear_windshield',Rear,LR,WR)]:
 p=rounded_rect(0,-W,L,W,.018);direction=[0,1,0]
 remove(name)
 solid(p,S,0,.003,direction,name,glass,None,.00018,.005,True)
 solid(p.difference(p.buffer(-.026)),S,.00055,.0005,direction,name+'_ceramic_frit',frit,None,.000015,.003,True)
 # Lower rear clearance is kept inside the existing 4 mm trunk shut line.
 limits=box(-.005,-W-.02,L+.013,W+.02) if name=='Windshield' else box(-.013,-W-.02,L+.0015,W+.02)
 rubberPoly=p.buffer(.0035).difference(p.buffer(-.001)).intersection(limits)
 shcurve=PchipInterpolator([-.001,.001,.0025,.0035],[.0007,.0026,.0025,.0010])
 def sh(uv,p=p,hh=shcurve):return hh(np.clip(signed_distance(uv,p),-.001,.0035))
 solid(rubberPoly,S,sh,.005,direction,name+'_perimeter_seal',seal,None,.000005,.0025,True)
 lip=p.buffer(.013).difference(p.buffer(.003)).intersection(limits)
 lhcurve=PchipInterpolator([.003,.006,.010,.013],[.0010,.0037,.0036,.0005])
 def lh(uv,p=p,hh=lhcurve):return hh(np.clip(signed_distance(uv,p),.003,.013))
 solid(lip,S,lh,.009,direction,name+'_aperture_return',paint,None,.00001,.003,True)

panels={'Hood_pivot':(2,np.deg2rad(65)),'Trunk_pivot':(2,-np.deg2rad(65))}
for which in ['Front','Rear']:
 for side in ['Left','Right']:panels[f'Door_pivot_{which}_{side}']=(1,np.deg2rad((1 if side=='Right' else -1)*(65 if which=='Front' else 62)))
stats=export_scene(s,P/'bmw-window-frames-v25.glb',25,{'method':'BMW drawing-traced window arches with profiled frames, glazing seals, ceramic frit, belt mouldings and body roof rails','source_version':24,'door_frame_width_mm':22,'door_frame_to_body_gap_mm':3.5,'windscreen_frit_width_mm':26},panels)
stats.update({'method':'Window aperture/frame reconstruction; no new SF3D generation','new_frame_meshes':len(created),'glazed_openings':6,'profiled_door_frames':4,'frame_width_mm':22,'frame_body_clearance_mm':3.5,'new_raw_generations':0})
(ROOT/'outputs/car-v25-statistics.json').write_text(json.dumps(stats,indent=2))
(ROOT/'work/window-frames-v25-records.json').write_text(json.dumps(records,indent=2))
print(json.dumps(stats))
