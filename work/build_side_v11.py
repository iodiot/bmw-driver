from pathlib import Path
import sys,json,struct,ast
import numpy as np
import trimesh
from scipy.interpolate import PchipInterpolator,CubicSpline
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/bmw-viewer'
sys.path.insert(0,str(Path(__file__).parent/'front-libs'))
from shapely.geometry import Polygon
scene=trimesh.load(OUT/'bmw-sedan-refined-v9.glb',force='scene',process=False)
paint=next(m.visual.material for m in scene.geometry.values() if m.visual.material.name=='Black sapphire paint')
dark=trimesh.visual.material.PBRMaterial(name='Body seams',baseColorFactor=[1,1,2,255],roughnessFactor=.65)
glass=trimesh.visual.material.PBRMaterial(name='Smoked windows',baseColorFactor=[2,4,7,255],metallicFactor=.13,roughnessFactor=.18)
chrome=trimesh.visual.material.PBRMaterial(name='Window trim',baseColorFactor=[105,115,125,255],metallicFactor=.85,roughnessFactor=.24)
tree=ast.parse((Path(__file__).parent/'build_car_v9.py').read_text(encoding='utf-8-sig'))
for fn in tree.body:
    if isinstance(fn,ast.FunctionDef) and fn.name in {'add','tube','flat','patch','acc'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'helpers','exec'))
def curved(points,closed=False,n=120):
    p=np.array(points,float)
    if closed:p=np.vstack([p,p[0]])
    t=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    return CubicSpline(t,p,bc_type='periodic' if closed else 'natural')(np.linspace(0,t[-1],n))
def bevel_contour(points,r=.025):
    p=np.array(points,float);out=[]
    for i,c in enumerate(p):
        before=p[(i-1)%len(p)]-c;after=p[(i+1)%len(p)]-c
        a=c+before*min(.25,r/np.linalg.norm(before));b=c+after*min(.25,r/np.linalg.norm(after))
        out.extend([(1-t)**2*a+2*(1-t)*t*c+t*t*b for t in np.linspace(0,1,9)])
    return np.array(out)

# Remove the rough side panels, cabin and trim before rebuilding them against the concept.
prefix=('Body_','Door_','Side_sill_','Rear_arch_','Window_','A_pillar_','B_pillar_','C_pillar_','Mirror_')
exact={'Roof','Windshield','Rear_windshield','Trunk_lid','Windshield_cowl'}
for node in list(scene.graph.nodes_geometry):
    _,g=scene.graph[node]
    if node.startswith(prefix) or node in exact or node.startswith('Fender_') and node.endswith('rear_seam'):
        scene.delete_geometry(g);continue
    m=scene.geometry[g]
    if node.startswith('Hood_'):
        v=m.vertices.copy();v[:,0]*=(2.27-.70)/(2.27-.36);m.vertices=v
    elif node.startswith('Fender_'):
        if 'shoulder' in node or 'hood_seam' in node:
            v=m.vertices.copy();v[:,0]=.70+(v[:,0]-.36)*(2.19-.70)/(2.19-.36);m.vertices=v
        else:
            clip=trimesh.intersections.slice_mesh_plane(m,[1,0,0],[.715,0,0],cap=False)
            if clip is not None and len(clip.faces):
                clip.visual=trimesh.visual.TextureVisuals(material=m.visual.material)
                scene.geometry[g]=clip
    if 'Drilled_brake_rotor' in node:
        m.visual.material=m.visual.material.copy();m.visual.material.name='Steel brake rotor';m.visual.material.baseColorFactor=[100,105,112,255];m.visual.material.metallicFactor=.8;m.visual.material.roughnessFactor=.45
parent=scene.graph.transforms.parents['Hood_pivot'];M=np.eye(4);M[:3,3]=[.70,1.025,0];scene.graph.update(frame_to='Hood_pivot',frame_from=parent,matrix=M)

# Concept side surface: pronounced shoulder crease, shallow concavity and rolled sill.
def skinz(x,y):
    base=.925+.018*np.exp(-((x+1.50)/.50)**2)
    crease=.012*np.exp(-((y-(.875+.012*x))/.055)**2)
    hollow=-.020*np.exp(-((y-.58)/.17)**2)
    sill=.009*np.exp(-((y-.29)/.055)**2)
    taper=-.045*np.clip((-x-2.10)/.45,0,1)
    return base+crease+hollow+sill+taper
rear=-1.50;radius=.455;cy=.385;a0=np.arcsin((.225-cy)/radius)
a=np.linspace(np.pi-a0,a0,140);arch=np.column_stack([rear+radius*np.cos(a),cy+radius*np.sin(a)])
upperx=np.linspace(.715,-2.55,150);uppery=np.interp(upperx,[-2.55,-2.05,.715],[.93,.993,.985])
outline=np.vstack([[.715,.225],np.column_stack([upperx,uppery]),[-2.55,.225],arch])
for sign,label in [(1,'Left'),(-1,'Right')]:
    v,f=trimesh.creation.triangulate_polygon(Polygon(outline),engine='earcut');v=np.column_stack([v,np.zeros(len(v))]);v,f=trimesh.remesh.subdivide_to_size(v,f,max_edge=.045,max_iter=7)
    x,y=v[:,0],v[:,1];v[:,2]=sign*skinz(x,y);m=trimesh.Trimesh(v,f,process=False)
    if m.face_normals[:,2].mean()*sign<0:m.invert()
    h=.0001;gx=(skinz(x+h,y)-skinz(x-h,y))/(2*h);gy=(skinz(x,y+h)-skinz(x,y-h))/(2*h)
    nn=np.column_stack([-gx,-gy,np.ones(len(v))])*sign;nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=nn
    add(m,f'Concept_side_{label}')
    rows=[]
    for x,y in zip(upperx,uppery):rows.append([[x,y+.052*(1-t*t),sign*(.795+(skinz(x,y)-.795)*t)] for t in np.linspace(0,1,20)])
    patch(rows,f'Concept_belt_shoulder_{label}')
    add(tube([[x,y,sign*(skinz(x,y)+.001)] for x,y in arch],.004),f'Rear_arch_{label}')
    for name,control in [
        ('Front',[[.715,.983],[.735,.90],[.745,.72],[.733,.44],[.72,.30]]),
        ('Middle',[[-.37,1.04],[-.345,.91],[-.315,.70],[-.315,.49],[-.33,.30]]),
        ('Rear',[[-1.38,1.04],[-1.30,.88],[-1.24,.70],[-1.16,.49],[-1.11,.31]])]:
        p=curved(control,n=90);add(tube([[x,y,sign*(skinz(x,y)+.0015)] for x,y in p],.0022,8),f'Door_seam_{label}_{name}',dark)
    bottom=curved([[-1.11,.31],[-.98,.285],[-.35,.285],[.64,.29],[.72,.31]],n=100)
    add(tube([[x,y,sign*(skinz(x,y)+.002)] for x,y in bottom],.0021),f'Door_lower_seam_{label}',dark)
    rows=[]
    for x in np.linspace(-1.04,.71,100):rows.append([[x,.22+.095*t,sign*(.875+.060*np.sin(t*np.pi/2))] for t in np.linspace(0,1,12)])
    patch(rows,f'Concept_sill_{label}')
    for x,name in [(.47,'Front'),(-.67,'Rear')]:
        handle=trimesh.creation.uv_sphere(radius=1,count=[12,24]);handle.apply_scale([.085,.016,.019]);handle.apply_translation([x,.92,sign*(skinz(x,.92)+.010)]);add(handle,f'Door_handle_{label}_{name}',paint)
        recess=curved([[x-.09,.914],[x,.904],[x+.09,.914]],n=30);add(tube([[xx,y,sign*(skinz(xx,y)+.002)] for xx,y in recess],.002),f'Handle_recess_{label}_{name}',dark)
    if sign==-1:
        fuel=bevel_contour([[-1.83,1.00],[-1.62,1.00],[-1.62,.84],[-1.83,.84]],.025)
        add(tube([[x,y,sign*(skinz(x,y)+.002)] for x,y in np.vstack([fuel,fuel[0]])],.0018),f'Fuel_filler_seam_{label}',dark)
    # Curved window outline traced from the earlier orthographic concept.
    front=np.array([[.62,1.043,.795],[.47,1.19,.765],[.13,1.395,.705],[-.055,1.455,.682],[-.40,1.468,.68],[-.32,1.043,.795]])
    rearwin=np.array([[-.38,1.043,.795],[-.46,1.468,.68],[-.93,1.445,.69],[-1.25,1.355,.72],[-1.47,1.235,.755],[-1.49,1.17,.77],[-1.39,1.075,.789],[-1.29,1.043,.795]])
    for control,name in [(front,'Front'),(rearwin,'Rear')]:
        control[:,2]*=sign;p=bevel_contour(control,.055)
        flat(p,f'Window_{label}_{name}',glass)
        closed=np.vstack([p,p[0]]);add(tube(closed,.011),f'Window_frame_{label}_{name}',paint);add(tube(closed,.002),f'Window_chrome_{label}_{name}',chrome)
    add(tube([[-.35,1.045,sign*.795],[-.43,1.47,sign*.68]],.027),f'B_pillar_{label}',dark)
    # Painted A/C pillar surfaces close the glazing to the roof and rear deck.
    ap=[[.74,1.035,sign*.80],[.21,1.405,sign*.71],[-.02,1.48,sign*.69],[-.055,1.455,sign*.682],[.13,1.395,sign*.705],[.47,1.19,sign*.765],[.62,1.043,sign*.795]]
    flat(ap,f'A_pillar_{label}',paint)
    cp=[[-.93,1.445,sign*.69],[-.98,1.49,sign*.69],[-1.35,1.40,sign*.73],[-2.04,1.045,sign*.80],[-1.29,1.043,sign*.795],[-1.39,1.075,sign*.789],[-1.49,1.17,sign*.77],[-1.47,1.235,sign*.755],[-1.25,1.355,sign*.72]]
    flat(cp,f'C_pillar_{label}',paint)
    mirror=trimesh.creation.uv_sphere(radius=1,count=[20,32]);mirror.apply_scale([.11,.052,.078]);mirror.apply_translation([.56,1.055,sign*1.005]);add(mirror,f'Mirror_{label}')
    stalk=trimesh.creation.box([.08,.022,.13]);stalk.apply_translation([.59,1.02,sign*.91]);add(stalk,f'Mirror_stalk_{label}',dark)

# Cabin cross-sections now follow the arched concept roof rather than a trapezoid.
rx=np.array([-.98,-.8,-.5,-.2,-.02]);ry=np.array([1.49,1.515,1.525,1.515,1.48]);roofline=PchipInterpolator(rx,ry)
patch([[[x,float(roofline(x))+.024*(1-s*s),s*.69] for s in np.linspace(-1,1,65)] for x in np.linspace(-.02,-.98,70)],'Roof')
patch([[[.74-.76*t-.018*(1-s*s),1.035+.445*t+.012*(1-s*s),s*(.80-.11*t)] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,40)],'Windshield',glass)
patch([[[-.98-1.06*t,1.49-.445*t+.018*(1-s*s),s*(.69+.11*t)] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,40)],'Rear_windshield',glass)
patch([[[-2.04-.51*t,1.045-.10*t+.025*(1-s*s),s*(.80+.05*t)] for s in np.linspace(-1,1,65)] for t in np.linspace(0,1,30)],'Trunk_lid')
patch([[[x,1.033,z] for z in np.linspace(-.8,.8,40)] for x in np.linspace(.70,.74,6)],'Windshield_cowl',dark)

# Keep the paired side surfaces exactly reflected (fuel flap is intentionally one-sided).
nodes=set(scene.graph.nodes_geometry);pairs=0
for left in sorted(nodes):
    right=left.replace('Left','Right')
    if left==right or right not in nodes:continue
    _,lg=scene.graph[left];_,rg=scene.graph[right];m=scene.geometry[lg].copy();m.apply_transform(np.diag([1,1,-1,1]));scene.geometry[rg]=m;pairs+=1
raw=scene.export(file_type='glb');length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
times=np.linspace(0,2,9,dtype='<f4');angles=-times*np.pi;q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(angles/2),np.cos(angles/2)]).astype('<f4')
ti=acc(times.tobytes(),'SCALAR',9,[0],[2]);ri=acc(q.tobytes(),'VEC4',9);channels=[]
for i,n in enumerate(doc['nodes']):
    name=n.get('name','')
    if name.startswith(('Steering_','Wheel_spin_','Rear_mount_')) or name=='Hood_pivot':
        m=n.pop('matrix',None)
        if m is not None:n['translation']=[m[12],m[13],m[14]]
    if name.startswith('Wheel_spin_'):channels.append({'sampler':0,'target':{'node':i,'path':'rotation'}})
doc['animations']=[{'name':'Forward wheel spin','samplers':[{'input':ti,'output':ri,'interpolation':'LINEAR'}],'channels':channels}]
doc['asset']['extras']={'version':11,'reference':'bmw-side-ortho-v5.png','method':'Geometric construction using orthographic concept','brakes':'Steel rotors, red calipers','rotation':'Negative Z for forward travel along +X'}
doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(OUT/'bmw-side-concept-v11.glb').write_bytes(result)
stats={'version':11,'objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'wheels':len(channels),'paired_parts':pairs,'method':'Concept side refinement, steel rotors, red calipers, forward wheel rotation'}
(ROOT/'outputs/car-v11-statistics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))

