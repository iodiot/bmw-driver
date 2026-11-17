from pathlib import Path
import sys,ast,json,numpy as np
sys.path[:0]=[str(Path('work').resolve()),str(Path('work/front-libs').resolve())]
import trimesh,networkx as nx
from scipy.interpolate import PchipInterpolator,CubicSpline
from shapely.geometry import Polygon,Point
from shapely import segmentize
from glb_export import export_scene
ROOT=Path(__file__).resolve().parents[1];P=ROOT/'outputs/bmw-viewer'
# Surface definitions only; neither earlier version is exported by these reads.
ctx={'__file__':str(ROOT/'work/fix_surface_normals_v23.py')}
exec((ROOT/'work/fix_surface_normals_v23.py').read_text(encoding='utf-8-sig').split('def refine(')[0],ctx)
C=ctx['cabin_smooth'];V=ctx['ns'];warp22=V['warp'];tube=V['tube']
W={'__file__':str(ROOT/'work/wrap_taillights_v21.py')}
exec((ROOT/'work/wrap_taillights_v21.py').read_text(encoding='utf-8-sig').split("n='Rear_quarter_lamp_panel'")[0],W)
curve=W['curve'];aperture=W['aperture'];coordS=W['coordS']
invY=PchipInterpolator(V['rearH'](np.linspace(.35,1.15,3000)),np.linspace(.35,1.15,3000))
s=trimesh.load(P/'bmw-surface-normals-v23.glb',force='scene',process=False)
mat={m.visual.material.name:m.visual.material for m in s.geometry.values()};paint=mat['Black sapphire paint'];glass=mat['Reflective automotive glass']
rubber=trimesh.visual.material.PBRMaterial(name='Rear panel joint rubber',baseColorFactor=[1,2,3,255],roughnessFactor=.85,doubleSided=True)
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
def get(n):
 M,g=s.graph[n];m=s.geometry[g];v=trimesh.transform_points(m.vertices,M);nn=m.vertex_normals@np.linalg.inv(M[:3,:3]);nn/=np.maximum(np.linalg.norm(nn,axis=1)[:,None],1e-12)
 return trimesh.Trimesh(v,m.faces.copy(),vertex_normals=nn,visual=m.visual,process=False)
def remove(n):
 if n in s.graph.nodes_geometry:s.delete_geometry(s.graph[n][1])
def add(m,name,material=paint,parent=None):
 m.visual=trimesh.visual.TextureVisuals(material=material);T=np.linalg.inv(s.graph[parent][0]) if parent else np.eye(4)
 s.add_geometry(m,node_name=name,geom_name=name,parent_node_name=parent,transform=T);return m
def grid(rows):return V['meshgrid'](rows)
def joined(parts):
 vs=[];fs=[];nn=[];off=0
 for m in parts:
  vs.append(m.vertices);fs.append(m.faces+off);nn.append(m.vertex_normals);off+=len(m.vertices)
 return trimesh.Trimesh(np.vstack(vs),np.vstack(fs),vertex_normals=np.vstack(nn),process=False)
def closed(m,offset):
 # Separate render vertices at the two skins and return walls.
 m.merge_vertices(digits_vertex=8);m.update_faces(m.area_faces>1e-12);m.remove_unreferenced_vertices()
 v=m.vertices;f=m.faces;N=len(v);e=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);u,c=np.unique(np.sort(e,axis=1),axis=0,return_counts=True);one={tuple(a) for a in u[c==1]};e=np.array([a for a in e if tuple(sorted(a)) in one])
 wallf=np.vstack([np.column_stack([e[:,1],e[:,0],e[:,0]+N]),np.column_stack([e[:,1],e[:,0]+N,e[:,1]+N])])
 out=trimesh.Trimesh(v,f,process=False);inside=trimesh.Trimesh(v+offset,f[:,::-1],process=False);walls=trimesh.Trimesh(np.vstack([v,v+offset]),wallf,process=False)
 walls.remove_unreferenced_vertices()
 return joined([out,inside,walls])
def bodydrop(v):
 v=np.asarray(v,float).copy();x,y=v[:,0].copy(),v[:,1].copy();v[:,1]-=.025*smooth((-x-1.48)/.30)*smooth((x+2.14)/.20)*smooth((y-.94)/.10);return v
def bodydrop_mesh(m):
 v=m.vertices.copy();h=1e-5;dyx=(bodydrop(v+[h,0,0])[:,1]-bodydrop(v-[h,0,0])[:,1])/(2*h);dyy=(bodydrop(v+[0,h,0])[:,1]-bodydrop(v-[0,h,0])[:,1])/(2*h)
 n=m.vertex_normals.copy();n[:,0]-=dyx*n[:,1]/dyy;n[:,1]/=dyy;n/=np.linalg.norm(n,axis=1)[:,None]
 return trimesh.Trimesh(bodydrop(v),m.faces,vertex_normals=n,visual=m.visual,process=False)

# The drawing's rear glass base is about 1.30 m wide; its centre lies roughly
# 140 mm aft of its outside corners. These are raster-traced shape estimates.
topWidth=float(C(-1.22,1.337))
def rear_glass(t,zeta):
 a=zeta*zeta;x=(-1.30+.08*a)*(1-t)+(-2.06+.14*a)*t
 y=(1.372-.035*a)*(1-t)+(1.095-.015*a)*t
 z=zeta*(topWidth*(1-t)+.650*t+.008*np.sin(np.pi*t));return np.array([x,y,z])
for n in ['Body_door_jambs_Left','Body_door_jambs_Right','Cabin_pillars_and_roof_rail_Left','Cabin_pillars_and_roof_rail_Right']:
 old=get(n);parent=s.graph.transforms.parents.get(n);remove(n);add(bodydrop_mesh(old),n,paint,parent if parent!='world' else None)
for n in ['Rear_windshield','Rear_windshield_painted_header','Trunk_lid','Trunk_inner_skin','Factory_trunk_lip','Rear_deck_transition_Left','Rear_deck_transition_Right','Trunk_deck_joint_Left','Trunk_deck_joint_Right']:
 remove(n)
gm=grid([[rear_glass(t,z) for z in np.linspace(-1,1,121)] for t in np.linspace(0,1,97)])
if gm.face_normals[:,1].mean()<0:gm.invert()
add(closed(gm,[0,-.003,0]),'Rear_windshield',glass)
rows=[];roofend=np.array(V['roofrows'])[-1]
for j,z in enumerate(np.linspace(-1,1,89)):
 a=rear_glass(0,z);b=roofend[j];rows.append([(1-q)*a+q*b for q in np.linspace(0,1,11)])
hm=grid(rows)
if hm.face_normals[:,1].mean()<0:hm.invert()
add(hm,'Rear_windshield_painted_header')

def pillar_edges(t):
 x=-1.22-.72*t;y=1.337-.257*t;a=bodydrop(np.array([[x,y,float(C(x,y))]]))[0];b=rear_glass(t,1);return a,b
def pillar_strip(t,q):
 a,b=pillar_edges(t);dz=max(a[2]-b[2],0);p=a*(1-q)+b*q
 # Fair painted shoulder, without the old folded transition patch.
 p[1]=(2*q**3-3*q*q+1)*a[1]+(q**3-2*q*q+q)*dz*.30+(-2*q**3+3*q*q)*b[1]+(q**3-q*q)*dz*.15
 return p
for sign,label in [(1,'Right'),(-1,'Left')]:
 m=grid([[pillar_strip(t,q)*[1,1,sign] for q in np.linspace(0,1,65)] for t in np.linspace(0,1,141)])
 if m.face_normals[:,1].mean()<0:m.invert()
 add(closed(m,[0,-.003,0]),f'Rear_C_pillar_inner_fairing_{label}')

# Extract the retained quarter's actual inner edge, so the new fixed deck
# meets it exactly instead of crossing it with a guessed bridging triangle.
oldquarter=get('Rear_shoulder_continuous_Left');oldquarter.merge_vertices(digits_vertex=7)
edge=oldquarter.edges_unique[np.bincount(oldquarter.edges_unique_inverse)==1];G=nx.Graph()
for a,b in edge:G.add_edge(int(a),int(b),weight=float(np.linalg.norm(oldquarter.vertices[a]-oldquarter.vertices[b])))
ids=np.unique(edge);a=int(ids[np.argmin(np.linalg.norm(oldquarter.vertices[ids]-[-2.14,1.0573049,.8043208],axis=1))]);b=int(ids[np.argmin(np.linalg.norm(oldquarter.vertices[ids]-[-2.4697,.9845,.8464],axis=1))])
path=nx.shortest_path(G,a,b,weight='weight');backedge=oldquarter.vertices[path]
forex=np.linspace(-1.94,-2.14,50);fore=bodydrop(np.column_stack([forex,V['belt'](forex),V['baseZ'](forex)]))
O=np.vstack([fore[:-1],backedge]);dist=np.r_[0,np.cumsum(np.linalg.norm(np.diff(O,axis=0),axis=1))];dist/=dist[-1]
outer=CubicSpline(dist,O,axis=0)
# Replace the old twisted shoulder itself, rather than only covering its edge.
# The new roll starts at the measured transverse cut and ends on the retained
# rear envelope, with a flat tangent at the deck and a turned-down outer edge.
R={'__file__':str(ROOT/'work/refine_quarter_v15.py')}
exec((ROOT/'work/refine_quarter_v15.py').read_text(encoding='utf-8-sig').split('quarter_boundary={}')[0],R)
bs=np.r_[0,np.cumsum(np.linalg.norm(np.diff(backedge,axis=0),axis=1))];bs/=bs[-1];innerRoll=CubicSpline(bs,backedge,axis=0)
startX=float(R['X'](-2.04));endRaw=np.array([R['rx'](.86,R['top'](.86)),R['top'](.86),.86]);endX=float(R['mapped'](endRaw)[0])
def rolled(t,q):
 a=innerRoll(t);oldT=np.clip((a[0]-startX)/(endX-startX),0,1)
 b=warp22(W['deform'](R['mapped'](np.array([R['outeredge'](oldT,1)]))))[0]
 p=a+(b-a)*np.sin(q*np.pi/2);p[1]=a[1]+(b[1]-a[1])*(1-np.cos(q*np.pi/2))
 return p
cutlines=trimesh.intersections.mesh_plane(oldquarter,[1,0,0],[-2.14001,0,0]).reshape(-1,3)
cutlines=cutlines[np.argsort(cutlines[:,2])];zuniq,ii=np.unique(np.round(cutlines[:,2],7),return_index=True);cutY=PchipInterpolator(zuniq,cutlines[ii,1],extrapolate=True)
for sign,label in [(1,'Left'),(-1,'Right')]:
 rows=[]
 for t in np.linspace(0,1,155):
  row=[]
  for q in np.linspace(0,1,81):
   p=rolled(t,q);first=rolled(0,q);target=np.array([-2.14,float(cutY(first[2])),first[2]]);p+=(target-first)*(1-t)**4
   row.append(p*[1,1,sign])
  rows.append(row)
 m=grid(rows)
 if m.face_normals[:,1].mean()<0:m.invert()
 remove(f'Rear_shoulder_continuous_{label}');add(m,f'Rear_shoulder_continuous_{label}')
old22=trimesh.load(P/'bmw-blueprint-sides-v22.glb',force='scene',process=False);M,g=old22.graph['Trunk_lid'];back=trimesh.transform_points(old22.geometry[g].vertices,M)[:9595].reshape(95,101,3)[-1]
def back_at(z):
 z=np.asarray(z);return np.stack([np.interp(z,back[:,2],back[:,0]),np.interp(z,back[:,2],back[:,1]),z],axis=-1)
lidwidth=PchipInterpolator([0,.30,.65,1],[.654,.686,.698,.700])
def lid(t,zeta):
 a=np.array([-2.064+.14*zeta*zeta,1.0935-.015*zeta*zeta,zeta*.654]);b=back_at(zeta*.700)
 p=(1-t)*a+t*b;p[2]=zeta*lidwidth(t);p[1]+=.006*np.sin(np.pi*t)*(1-zeta*zeta);return p
lidrows=[[lid(t,z) for z in np.linspace(-1,1,145)] for t in np.linspace(0,1,145)]
lm=grid(lidrows)
if lm.face_normals[:,1].mean()<0:lm.invert()
add(closed(lm,[0,-.012,0]),'Trunk_lid',paint,'Trunk_pivot')
inn=grid(lidrows);inn.vertices[:,1]-=.018;inn.invert();add(inn,'Trunk_inner_skin',rubber,'Trunk_pivot')
GAP=.0038
def baseline(t,q):
 a=lid(t,1);a[2]+=GAP;b=outer(t);p=(1-q)*a+q*b
 span=b[2]-a[2];eps=.0001;d=(lid(t,1+eps)-lid(t,1-eps))/(2*eps*float(lidwidth(t)))
 endSlope=-.30*(1-smooth(t/.40))
 p[1]=(2*q**3-3*q*q+1)*a[1]+(q**3-2*q*q+q)*d[1]*span+(-2*q**3+3*q*q)*b[1]+(q**3-q*q)*endSlope*span
 return p
def fixed_deck(t,q):
 p=baseline(t,q);end=baseline(1,q);target=back_at(end[2]);p+=(target-end)*t**4
 front=baseline(0,q);a,b=pillar_edges(1);cq=np.clip((a[2]-front[2])/(a[2]-b[2]),0,1);targetFront=pillar_strip(1,cq)
 p+=(targetFront-front)*(1-t)**4;return p
for sign,label in [(1,'Right'),(-1,'Left')]:
 m=grid([[fixed_deck(t,q)*[1,1,sign] for q in np.linspace(0,1,73)] for t in np.linspace(0,1,161)])
 if m.face_normals[:,1].mean()<0:m.invert()
 add(closed(m,[0,-.003,0]),f'Rear_fixed_deck_fairing_{label}')
 # A recessed drain channel beneath a real 3.8 mm lateral panel gap.
 rows=[];seal=[]
 for t in np.linspace(0,1,180):
  p=lid(t,1);p[2]+=GAP/2;p[1]-=.010;seal.append(p*[1,1,sign])
  rows.append([p+[0,0,-.008],p+[0,0,.008]])
 rows=np.array(rows)*[1,1,sign];add(grid(rows),f'Trunk_side_drain_{label}',rubber)
 add(tube(seal,.0012,8),f'Trunk_side_weatherstrip_{label}',rubber)
lip=np.array([back_at(z)+[0,.004,0] for z in np.linspace(-.698,.698,200)])
add(tube(lip,.004,12),'Factory_trunk_lip',paint,'Trunk_pivot')

# Re-cut the lamp surrounds in the same unwrapped coordinates as the lenses.
# The new body's rim is 2.5 mm behind the lens edge; the existing optical crown
# adds a small central rise. It is a visual reconstruction, not an OEM tolerance.
hole=aperture.buffer(.0012);outerRing=hole.buffer(.008);prepared=outerRing
def lamp_uv(v):return np.column_stack([coordS(v),invY(v[:,1])])
def lamp_body(uv,sign):
 xy=curve(uv[:,0]);d=curve(uv[:,0],1);N=np.column_stack([-d[:,1],d[:,0]]);N/=np.linalg.norm(N,axis=1)[:,None]
 xy+=.001*N;v=np.column_stack([xy[:,0],V['rearH'](uv[:,1]),sign*xy[:,1]]);return v
cut_nodes=[]
for node in list(s.graph.nodes_geometry):
 old=get(node)
 if old.visual.material.name!='Black sapphire paint' or node.startswith(('Trunk_','Factory_','Rear_C_pillar','Rear_fixed_deck')) or s.graph.transforms.parents.get(node)=='Trunk_pivot':continue
 v=old.vertices
 if v[:,0].min()>-2.15 or abs(v[:,2]).max()<.55 or v[:,1].max()<.69 or v[:,1].min()>1.05:continue
 uv=lamp_uv(v);verts=[];faces=[]
 for face in old.faces:
  xyz=v[face];p=uv[face]
  if abs(xyz[:,2]).max()<.55 or xyz[:,0].min()>-2.15:
   off=len(verts);verts.extend(xyz);faces.append([off,off+1,off+2]);continue
  poly=Polygon(p)
  if poly.area<1e-12 or not poly.intersects(outerRing):
   off=len(verts);verts.extend(xyz);faces.append([off,off+1,off+2]);continue
  remain=poly.difference(outerRing)
  for pp in (list(remain.geoms) if remain.geom_type=='MultiPolygon' else [remain]):
   if pp.is_empty or pp.area<1e-12:continue
   pu,pf=trimesh.creation.triangulate_polygon(pp,engine='earcut');weights=np.linalg.solve(np.vstack([p.T,np.ones(3)]),np.column_stack([pu,np.ones(len(pu))]).T).T
   q=weights@xyz;sgn=1 if xyz[:,2].mean()>0 else -1
   distance=np.array([outerRing.boundary.distance(Point(a)) for a in pu]);blend=1-smooth(distance/.012)
   q=q*(1-blend[:,None])+lamp_body(pu,sgn)*blend[:,None]
   off=len(verts);verts.extend(q);faces.extend(pf+off)
 m=trimesh.Trimesh(verts,faces,process=False);m.merge_vertices(digits_vertex=7);m.remove_unreferenced_vertices()
 remove(node);add(m,node);cut_nodes.append(node)
ring=outerRing.difference(hole);uv,f=trimesh.creation.triangulate_polygon(segmentize(ring,.003),engine='triangle',triangle_args='pq28a.000007')
for sign,label in [(1,'Right'),(-1,'Left')]:
 m=trimesh.Trimesh(lamp_body(uv,sign),f,process=False)
 # Rear-facing outward direction is -X on both sides.
 if m.face_normals[:,0].mean()>0:m.invert()
 add(closed(m,[.002,0,0]),f'Rear_lamp_continuous_surround_{label}')

# Give every lamp's cover and optical layer independent return-wall normals.
# This also removes the thin zigzags on the light-guide edges in the close-up.
optics=0
for node in list(s.graph.nodes_geometry):
 if not node.startswith('Taillamp_'):continue
 M,g=s.graph[node];m=s.geometry[g];wv=trimesh.transform_points(m.vertices,M)
 if '_Outer_' in node:
  u=coordS(wv);d=curve(u,1);normal=np.column_stack([-d[:,1],np.zeros(len(wv)),np.sign(wv[:,2])*d[:,0]]);normal/=np.linalg.norm(normal,axis=1)[:,None];wv+=.0025*normal
 else:wv[:,0]-=.0025
 v=trimesh.transform_points(wv,np.linalg.inv(M));N=len(v)//2
 if len(v)%2:continue
 f=m.faces;of=f[np.all(f<N,axis=1)];inf=f[np.all(f>=N,axis=1)];wf=f[~(np.all(f<N,axis=1)|np.all(f>=N,axis=1))]
 if not len(of) or not len(inf) or not len(wf):continue
 parts=[]
 for fs in [of,inf,wf]:
  used,ind=np.unique(fs,return_inverse=True);parts.append(trimesh.Trimesh(v[used],ind.reshape(-1,3),process=False))
 new=joined(parts);new.visual=m.visual;s.geometry[g]=new;optics+=1

# The lid's rear corners flare above the inner/outer lamp split. Partition
# those small rear-face patches as moving lid parts instead of leaving a fixed
# wall beneath the newly narrowed top. A 3.6 mm physical diagonal shut line
# connects the deck seam to the existing lamp division.
ytail=float(back_at(.700)[1]);corner=Polygon([[.565,.969],[.700,ytail],[.704,1.20],[.565,1.20]])
for node in ['Rear_quarter_lamp_panel','Rear_lamp_continuous_surround_Right','Rear_lamp_continuous_surround_Left']:
 if node not in s.graph.nodes_geometry:continue
 old=get(node);fixed=[];fixedf=[];moving={1:([],[]),-1:([],[])}
 for face in old.faces:
  xyz=old.vertices[face];uv=np.column_stack([abs(xyz[:,2]),xyz[:,1]]);poly=Polygon(uv)
  if poly.area<1e-12 or not poly.intersects(corner.buffer(.0018)):
   off=len(fixed);fixed.extend(xyz);fixedf.append([off,off+1,off+2]);continue
  sign=1 if xyz[:,2].mean()>0 else -1
  for geom,dest in [(poly.difference(corner.buffer(.0018)),(fixed,fixedf)),(poly.intersection(corner.buffer(-.0018)),moving[sign])]:
   for pp in (list(geom.geoms) if geom.geom_type=='MultiPolygon' else [geom]):
    if pp.is_empty or pp.area<1e-12:continue
    pu,pf=trimesh.creation.triangulate_polygon(pp,engine='earcut');weights=np.linalg.solve(np.vstack([uv.T,np.ones(3)]),np.column_stack([pu,np.ones(len(pu))]).T).T;q=weights@xyz;vv,ff=dest;off=len(vv);vv.extend(q);ff.extend(pf+off)
 remove(node)
 if fixedf:add(trimesh.Trimesh(fixed,fixedf,process=False),node)
 for sign,(vv,ff) in moving.items():
  if ff:add(trimesh.Trimesh(vv,ff,process=False),node+('_lid_corner_Right' if sign>0 else '_lid_corner_Left'),paint,'Trunk_pivot')
for sign,label in [(1,'Right'),(-1,'Left')]:
 pp=[]
 for z in np.linspace(.571,.700,100):
  y=.972+(ytail-.972)*(z-.571)/(.700-.571);p=back_at(z);p[0]+=.005;p[1]=y;p[2]*=sign;pp.append(p)
 add(tube(pp,.0018,8),f'Trunk_rear_corner_weatherstrip_{label}',rubber)

# Move the hinge axis slightly ahead of the new fore corners. Preserve every
# child's closed world transform, including the existing inner lamp halves.
trunk_children=[n for n,p in s.graph.transforms.parents.items() if p=='Trunk_pivot']
closed_world={n:s.graph[n][0].copy() for n in trunk_children}
hinge=np.eye(4);hinge[:3,3]=[-1.89,1.075,0];s.graph.update(frame_to='Trunk_pivot',matrix=hinge)
for n,M in closed_world.items():s.graph.update(frame_to=n,frame_from='Trunk_pivot',matrix=np.linalg.inv(hinge)@M)

# Roof-mounted BMW shark-fin study. The side drawing locates its foot between
# raster X~850..892, near the back of the roof. Its base follows the roof crown.
finFront=-1.095;finRear=-1.280
finH=PchipInterpolator([0,.18,.45,.65,.78,.85,.90,1],[.001,.015,.039,.057,.058,.055,.006,.001])
def roof_y(x,z):return V['roofH'](x)-.040*(z/.615)**2
finrows=[];baseOutline=[]
for t in np.linspace(0,1,129):
 x=finFront+(finRear-finFront)*t;w=.031*np.sin(np.pi*t)**.60
 row=[]
 for a in np.linspace(-np.pi/2,np.pi/2,65):
  z=w*np.sin(a);y=roof_y(x,z)+.0015+float(finH(t))*max(np.cos(a),0)**1.25;row.append([x,y,z])
 finrows.append(row)
fm=grid(finrows)
if fm.face_normals[:,1].mean()<0:fm.invert()
s.graph.update(frame_to='Roof_antenna',matrix=np.eye(4))
add(closed(fm,[0,-.0025,0]),'Antenna_shark_fin_shell',paint,'Roof_antenna')
edge=np.vstack([np.array(finrows)[:,0],np.array(finrows)[::-1,-1]]);edge[:,1]=roof_y(edge[:,0],edge[:,2])+.0011
add(tube(np.vstack([edge,edge[0]]),.0011,10),'Antenna_roof_gasket',rubber,'Roof_antenna')
uv,ff=trimesh.creation.triangulate_polygon(Polygon(edge[:,[0,2]]),engine='earcut')
v=np.column_stack([uv[:,0],roof_y(uv[:,0],uv[:,1])+.0012,uv[:,1]]);bm=trimesh.Trimesh(v,ff,process=False)
if bm.face_normals[:,1].mean()<0:bm.invert()
add(closed(bm,[0,-.002,0]),'Antenna_contoured_footplate',rubber,'Roof_antenna')

panels={'Hood_pivot':(2,np.deg2rad(65)),'Trunk_pivot':(2,-np.deg2rad(65))}
for which in ['Front','Rear']:
 for phys in ['Left','Right']:panels[f'Door_pivot_{which}_{phys}']=(1,np.deg2rad((1 if phys=='Right' else -1)*(65 if which=='Front' else 62)))
stats=export_scene(s,P/'bmw-rear-joints-v24.glb',24,{'method':'Rear glazing/deck outline traced from BMW dimension drawing; continuous fixed quarter decks, independent lid, shared-coordinate lamp apertures','side_gap_mm':GAP*1000,'lens_edge_proud_of_new_surround_mm':2.5,'source_version':23},panels)
stats.update({'method':'Rear joints, lamp apertures and contoured shark-fin antenna; no SF3D generation','side_gap_mm':GAP*1000,'lamp_edge_proud_mm':2.5,'rear_glass_base_width_mm':1300,'optical_mesh_normals_repaired':optics,'body_panels_recut':cut_nodes,'antenna_length_mm':(finFront-finRear)*1000,'antenna_local_height_mm':58,'antenna_base_follows_roof':True})
(ROOT/'outputs/car-v24-statistics.json').write_text(json.dumps(stats,indent=2))
np.savez(ROOT/'work/rear-joint-reference24.npz',outer=O,lid=np.array(lidrows),glass=np.array([[rear_glass(t,z) for z in np.linspace(-1,1,121)] for t in np.linspace(0,1,97)]),aperture=np.array(aperture.exterior.coords))
print(json.dumps(stats))
