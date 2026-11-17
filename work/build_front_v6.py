from pathlib import Path
import sys, json
import numpy as np
import trimesh
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
from shapely.geometry import Polygon, Point, LineString

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/bmw-viewer'
scene=trimesh.Scene()
materials={
 'paint':trimesh.visual.material.PBRMaterial(name='Black sapphire paint',baseColorFactor=[4,5,7,255],metallicFactor=.75,roughnessFactor=.24),
 'rubber':trimesh.visual.material.PBRMaterial(name='Black seals',baseColorFactor=[1,1,1,255],metallicFactor=0,roughnessFactor=.7),
 'dark':trimesh.visual.material.PBRMaterial(name='Grille black',baseColorFactor=[3,3,4,255],metallicFactor=.35,roughnessFactor=.32),
 'chrome':trimesh.visual.material.PBRMaterial(name='Polished aluminium',baseColorFactor=[185,190,200,255],metallicFactor=.95,roughnessFactor=.19),
 'mesh':trimesh.visual.material.PBRMaterial(name='Intake mesh',baseColorFactor=[18,20,24,255],metallicFactor=.5,roughnessFactor=.45),
 'housing':trimesh.visual.material.PBRMaterial(name='Headlight housing',baseColorFactor=[2,3,5,255],metallicFactor=.3,roughnessFactor=.2),
 'led':trimesh.visual.material.PBRMaterial(name='LED rings',baseColorFactor=[210,235,255,255],emissiveFactor=[.65,.85,1],metallicFactor=.05,roughnessFactor=.15),
 'glass':trimesh.visual.material.PBRMaterial(name='Headlight cover',baseColorFactor=[160,190,220,30],alphaMode='BLEND',doubleSided=True,metallicFactor=.1,roughnessFactor=.08),
 'lens':trimesh.visual.material.PBRMaterial(name='Projector glass',baseColorFactor=[12,25,42,255],metallicFactor=.85,roughnessFactor=.09),
 'amber':trimesh.visual.material.PBRMaterial(name='Indicator',baseColorFactor=[235,140,18,255],metallicFactor=.15,roughnessFactor=.25),
}
counts={}
def add(mesh,name,material='paint',parent=None):
    mesh.visual=trimesh.visual.TextureVisuals(material=materials[material])
    scene.add_geometry(mesh,node_name=name,geom_name=name,parent_node_name=parent)
    counts[material]=counts.get(material,0)+1
    return mesh
def tube(points,radius=.004,sides=8):
    p=np.asarray(points,float);closed=np.linalg.norm(p[0]-p[-1])<1e-7
    if closed:p=p[:-1]
    verts=[]
    for i,c in enumerate(p):
        prev=p[(i-1)%len(p)] if closed or i else p[i]
        nxt=p[(i+1)%len(p)] if closed or i<len(p)-1 else p[i]
        tangent=nxt-prev;tangent/=np.linalg.norm(tangent)
        normal=np.cross(tangent,[1,0,0])
        if np.linalg.norm(normal)<.01:normal=np.cross(tangent,[0,1,0])
        normal/=np.linalg.norm(normal);other=np.cross(tangent,normal)
        for a in np.arange(sides)*2*np.pi/sides:verts.append(c+radius*(normal*np.cos(a)+other*np.sin(a)))
    faces=[]
    for i in range(len(p) if closed else len(p)-1):
        j=(i+1)%len(p)
        for k in range(sides):
            l=(k+1)%sides;faces.extend([[i*sides+k,j*sides+k,j*sides+l],[i*sides+k,j*sides+l,i*sides+l]])
    return trimesh.Trimesh(verts,faces,process=False)
def front_x(z,y):return 2.35-.20*(np.abs(z)/.96)**2+.012*np.sin((y-.2)*np.pi)
def yz_path(outline,offset=0):
    p=np.asarray(outline);return np.column_stack([front_x(p[:,0],p[:,1])+offset,p[:,1],p[:,0]])
def superellipse(cz,cy,w,h,n=3.2,samples=80,taper=0):
    a=np.arange(samples)*2*np.pi/samples;c=np.cos(a);s=np.sin(a)
    zz=np.sign(c)*np.abs(c)**(2/n);yy=np.sign(s)*np.abs(s)**(2/n)
    return np.column_stack([cz+w/2*zz*(1+taper*yy),cy+h/2*yy])
def surface(poly,offset=0):
    v,f=trimesh.creation.triangulate_polygon(poly,engine='earcut')
    m=trimesh.Trimesh(np.column_stack([np.zeros(len(v)),v[:,1],v[:,0]]),f,process=False)
    v,f=trimesh.remesh.subdivide_to_size(m.vertices,m.faces,max_edge=.035,max_iter=6)
    v[:,0]=front_x(v[:,2],v[:,1])+offset
    m=trimesh.Trimesh(v,f,process=False)
    # Front face normals point outwards along +X.
    if np.mean(m.face_normals[:,0])<0:m.invert()
    return m
def box(size,centre):
    m=trimesh.creation.box(size);m.apply_translation(centre);return m
def disc(radius,depth,centre,axis='x',sections=64):
    m=trimesh.creation.cylinder(radius=radius,height=depth,sections=sections)
    if axis=='x':m.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0]))
    if axis=='y':m.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[1,0,0]))
    m.apply_translation(centre);return m

# Hood surface: smooth transverse crown plus two pressed ridges on each half.
def hood_point(t,s):
    width=.80+.035*np.sin(np.pi*t)-.02*t
    x=.36+1.91*t-.08*abs(s)**3*t
    z=width*s
    y=1.025-.085*t+.022*np.sin(np.pi*t)-.055*abs(s)**2
    y+=.018*np.exp(-((abs(z)-(.28+.045*t))/.035)**2)*np.sin(np.pi*(.10+.82*t))
    y+=.010*np.exp(-((abs(z)-.57)/.026)**2)*np.sin(np.pi*(.08+.84*t))
    return np.array([x,y,z])
nx,nz=97,81
hv=np.array([hood_point(t,s) for t in np.linspace(0,1,nx) for s in np.linspace(-1,1,nz)])
hf=[]
for i in range(nx-1):
    for j in range(nz-1):
        a=i*nz+j;hf.extend([[a,a+1,a+nz+1],[a,a+nz+1,a+nz]])
hood=trimesh.Trimesh(hv.copy(),np.array(hf),process=False)
if hood.face_normals[:,1].mean()<0:hood.invert()
hinge=np.array([.36,1.025,0])
scene.graph.update(frame_to='Hood_pivot',matrix=trimesh.transformations.translation_matrix(hinge))
hood.vertices-=hinge
add(hood,'Hood_outer','paint','Hood_pivot')
under=hood.copy();under.vertices[:,1]-=.018;under.invert()
add(under,'Hood_inner','dark','Hood_pivot')
boundary=np.vstack([hv[:nz],hv[nz-1::nz],hv[-nz:][::-1],hv[::nz][::-1],hv[0]])
add(tube(boundary-hinge,.006),'Hood_rolled_edge','paint','Hood_pivot')
add(tube(boundary-hinge+[0,-.008,0],.003),'Hood_perimeter_seal','rubber','Hood_pivot')
for k,t in enumerate([.18,.5,.82]):
    p=np.array([hood_point(t,s)-hinge+[0,-.034,0] for s in np.linspace(-.88,.88,45)])
    add(tube(p,.012,10),f'Hood_underside_brace_{k}','dark','Hood_pivot')
for sign in (-1,1):
    for label,s in [('outer',.92),('inner',.38)]:
        p=np.array([hood_point(t,sign*s)-hinge+[0,-.031,0] for t in np.linspace(.07,.94,60)])
        add(tube(p,.010),f'Hood_inner_{label}_{sign}','dark','Hood_pivot')
    add(box([.12,.025,.045],[.43,.953,sign*.59]),f'Hinge_base_{sign}','chrome')
    # Narrow fender rail around the hood; the seam remains physically open.
    p=np.array([hood_point(t,sign*1.035) for t in np.linspace(0,1,100)])
    add(tube(p,.027,12),f'Fender_rail_{sign}','paint')
    add(tube(p+[0,-.024,0],.003),f'Hood_gap_{sign}','rubber')

# Bumper skin with true open apertures.
outline=superellipse(0,.595,1.89,.76,n=7,samples=160)
kidneys=[superellipse(sign*.225,.825,.405,.245,n=3.1,taper=.12) for sign in (-1,1)]
lamp_right=np.array([[.465,.933],[.70,.954],[.887,.919],[.906,.803],[.81,.768],[.49,.786]])
lamps=[lamp_right*np.array([s,1]) for s in (-1,1)]
center_intake=np.array([[-.43,.505],[-.365,.54],[.365,.54],[.43,.505],[.383,.275],[-.383,.275]])
side_right=np.array([[.56,.527],[.83,.56],[.89,.52],[.882,.307],[.61,.285],[.535,.34]])
intakes=[center_intake,side_right,side_right*np.array([-1,1])]
holes=kidneys+lamps+intakes
poly=Polygon(outline,[h.tolist() for h in holes])
assert poly.is_valid,'Bumper aperture polygons overlap'
skin=surface(poly)
add(skin,'Bumper_outer_skin')
add(tube(np.vstack([outline,outline[0]]) if False else yz_path(np.vstack([outline,outline[0]])),.010,10),'Bumper_outer_roll')
for idx,h in enumerate(holes):
    a=yz_path(h,-.002);b=yz_path(h,-.13)
    verts=np.vstack([a,b]);faces=[];n=len(a)
    for i in range(n):j=(i+1)%n;faces.extend([[i,j,n+j],[i,n+j,n+i]])
    add(trimesh.Trimesh(verts,faces,process=False),f'Aperture_inner_wall_{idx}','dark')
    add(surface(Polygon(h),-.145),f'Aperture_back_{idx}','rubber')

# Paired kidneys: separate chrome trim and nine individual vertical blades each.
for side,h in enumerate(kidneys):
    closed=np.vstack([h,h[0]])
    add(tube(yz_path(closed,.006),.010,12),f'Kidney_black_frame_{side}','dark')
    add(tube(yz_path(closed,.013),.0055,12),f'Kidney_chrome_surround_{side}','chrome')
    shape=Polygon(h)
    cz=(-1 if side==0 else 1)*.225
    for k,z in enumerate(np.linspace(cz-.17,cz+.17,9)):
        inter=shape.intersection(LineString([[z,.66],[z,.98]]))
        if inter.is_empty:continue
        coords=np.array(inter.coords);low,high=coords[:,1].min()+.005,coords[:,1].max()-.005
        y=(low+high)/2;x=front_x(z,y)-.012
        add(box([.043,high-low,.009],[x,y,z]),f'Kidney_{side}_slat_{k}','dark')
        add(box([.003,high-low-.003,.0015],[x+.023,y,z-.003]),f'Kidney_{side}_slat_edge_{k}','chrome')

# Two detailed projector units per side, with genuine separate LED ring tubes.
for side,sign in enumerate((-1,1)):
    h=lamps[side]
    add(tube(yz_path(np.vstack([h,h[0]]),.010),.003,10),f'Headlamp_bezel_{side}','dark')
    for k,z0 in enumerate([.585,.768]):
        z=sign*z0;y=.855 if k==0 else .86;x=front_x(z,y)-.025
        add(disc(.063,.018,[x-.022,y,z]),f'Projector_reflector_{side}_{k}','chrome')
        add(disc(.052,.020,[x-.01,y,z]),f'Projector_dark_cone_{side}_{k}','housing')
        ball=trimesh.creation.uv_sphere(radius=.041,count=[24,32]);ball.apply_scale([.42,1,1]);ball.apply_translation([x+.007,y,z])
        add(ball,f'Projector_glass_{side}_{k}','lens')
        ring=superellipse(z,y,.122,.128,n=2.6,samples=96)
        add(tube(yz_path(np.vstack([ring,ring[0]]),.002),.0047,10),f'LED_ring_{side}_{k}','led')
    brow=np.array([[sign*z,.925-.025*((z-.5)/.37)**2] for z in np.linspace(.50,.87,40)])
    add(tube(yz_path(brow,.012),.0035,8),f'LED_eyebrow_{side}','led')
    indicator=np.array([[sign*.87,y] for y in np.linspace(.815,.887,15)])
    add(tube(yz_path(indicator,-.005),.0045,8),f'Indicator_{side}','amber')
    add(surface(Polygon(h),.023),f'Headlamp_clear_cover_{side}','glass')

# Open hexagonal intake cells; merged by intake for efficient drawing.
hex_count=0
for intake_id,h in enumerate(intakes):
    domain=Polygon(h).buffer(-.008);pieces=[]
    rad=.0165
    for row,y in enumerate(np.arange(.285,.55,rad*1.5)):
        for z in np.arange(-.9,.91,np.sqrt(3)*rad):
            z+=np.sqrt(3)*rad/2*(row%2)
            a=np.arange(6)*np.pi/3+np.pi/6
            hh=np.column_stack([z+rad*np.cos(a),y+rad*np.sin(a)])
            if not domain.contains(Polygon(hh)):continue
            pieces.append(tube(yz_path(np.vstack([hh,hh[0]]),-.055),.00125,6));hex_count+=1
    if pieces:add(trimesh.util.concatenate(pieces),f'Intake_honeycomb_{intake_id}','mesh')
    add(tube(yz_path(np.vstack([h,h[0]]),.001),.0045),f'Intake_edge_{intake_id}','paint')

# Lower lip, washer covers, parking sensors and plate bracket.
lip=np.array([[front_x(z,.235)+.02,.235,z] for z in np.linspace(-.85,.85,100)])
add(tube(lip,.014,12),'Lower_splitter','dark')
for i,z in enumerate([-.83,-.35,.35,.83]):
    y=.63;x=front_x(z,y)
    ring=superellipse(z,y,.023,.023,n=2,samples=40)
    add(tube(yz_path(np.vstack([ring,ring[0]]),.003),.0015,6),f'Parking_sensor_seam_{i}','rubber')
    add(disc(.010,.003,[x+.002,y,z]),f'Parking_sensor_{i}','paint')
for sign in (-1,1):
    washer=superellipse(sign*.685,.715,.092,.031,n=4,samples=40)
    add(tube(yz_path(np.vstack([washer,washer[0]]),.003),.0015),f'Headlight_washer_seam_{sign}','rubber')
add(box([.020,.073,.385],[front_x(0,.635)+.01,.635,0]),'License_plate_mount','dark')
for z in (-.16,.16):add(disc(.003,.003,[front_x(z,.635)+.023,.635,z]),f'Plate_screw_{z}','chrome')

# Raised hood roundel with four separate coloured inlays.
badge_pos=hood_point(.94,0)+[0,.006,0]-hinge
add(disc(.026,.004,badge_pos,'y'),'Hood_roundel_base','chrome','Hood_pivot')
add(disc(.023,.005,badge_pos+[0,.001,0],'y'),'Hood_roundel_ring','dark','Hood_pivot')
for k in range(4):
    a=np.linspace(k*np.pi/2,(k+1)*np.pi/2,25)
    center=badge_pos+[0,.004,0]
    verts=np.vstack([center,center+np.column_stack([.017*np.cos(a),np.zeros(len(a)),.017*np.sin(a)])])
    faces=np.array([[0,i+1,i] for i in range(1,len(a))]);m=trimesh.Trimesh(verts,faces,process=False)
    material=trimesh.visual.material.PBRMaterial(name='Roundel inlay',baseColorFactor=[12,88,190,255] if k%2==0 else [220,225,230,255],metallicFactor=.2,roughnessFactor=.2)
    m.visual=trimesh.visual.TextureVisuals(material=material);scene.add_geometry(m,node_name=f'Hood_roundel_inlay_{k}',parent_node_name='Hood_pivot')

path=OUT/'bmw-front-detailed-v6.glb'
scene.export(path)
hood_scene=trimesh.Scene()
for node in scene.graph.nodes_geometry:
    if node.startswith('Hood_'):
        transform,geometry=scene.graph[node];hood_scene.add_geometry(scene.geometry[geometry],node_name=node,transform=transform)
hood_scene.export(OUT/'bmw-hood-v6.glb')
stats={'version':6,'method':'Explicit geometric construction; not a new Glow Rush generation','objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'honeycomb_cells':hex_count,'grille_slats':18,'LED_rings':4,'hood_surface_grid':[nx,nz],'bytes':path.stat().st_size,'materials':counts,'scope':'Standalone hood and front module; approximate F10 study, not manufacturer CAD'}
(ROOT/'outputs/front-v6-statistics.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats))


