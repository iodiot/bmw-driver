"""Build F10 M5 mirror shells, inset glazing and sail mounts in the current GLB.
Visual references: BMW ETK plate 51_8441 and OEM mirror 51168049331/334.
Dimensions below are visual reconstruction, not factory component measurements.
"""
import json, math, struct
from pathlib import Path
P=Path('outputs/bmw-viewer/bmw-perforated-brakes-v26.glb')
b=P.read_bytes(); size=struct.unpack_from('<I',b,12)[0]
d=json.loads(b[20:20+size]); blob=bytearray(b[28+size:])
original_nodes=json.dumps(d['nodes'],sort_keys=True)
original_animations=json.dumps(d.get('animations'),sort_keys=True)
def accessor(values,kind):
 flat=[v for row in values for v in row] if kind=='VEC3' else values
 while len(blob)%4:blob.append(0)
 offset=len(blob);blob.extend(struct.pack('<'+('f' if kind=='VEC3' else 'I')*len(flat),*flat))
 vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(flat)*4})
 ai=len(d['accessors']);a={'bufferView':vi,'componentType':5126 if kind=='VEC3' else 5125,'count':len(values),'type':kind}
 if kind=='VEC3':a.update(min=[min(v[k] for v in values) for k in range(3)],max=[max(v[k] for v in values) for k in range(3)])
 d['accessors'].append(a);return ai

def primitive(vertices,faces,material,sign):
 vertices=[[x,y,sign*z] for x,y,z in vertices]
 if sign<0:faces=[[a,c,b] for a,b,c in faces]
 normals=[[0.,0.,0.] for v in vertices]
 for a,b,c in faces:
  u=[vertices[b][i]-vertices[a][i] for i in range(3)];v=[vertices[c][i]-vertices[a][i] for i in range(3)]
  n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  for idx in [a,b,c]:
   for k in range(3):normals[idx][k]+=n[k]
 for n in normals:
  l=math.sqrt(sum(v*v for v in n)) or 1
  for k in range(3):n[k]/=l
 return {'attributes':{'POSITION':accessor(vertices,'VEC3'),'NORMAL':accessor(normals,'VEC3')},'indices':accessor([i for f in faces for i in f],'SCALAR'),'material':material,'mode':4}
# Smoothed asymmetric rear aperture, broad outboard end and tapered inner corner.
points=[(-.090,-.023),(-.068,-.043),(.057,-.043),(.090,-.028),(.098,.008),(.080,.038),(.036,.053),(-.049,.045),(-.085,.024)]
contour=[]
for i,p1 in enumerate(points):
 p0=points[(i-1)%len(points)];p2=points[(i+1)%len(points)];p3=points[(i+2)%len(points)]
 for j in range(8):
  t=j/8
  contour.append([.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t) for k in range(2)])
N=len(contour);cz=.960;cy=1.075
# The mirror opening looks rearwards, with a slight outward yaw.
def point(z,y,depth=0,sz=1,sy=1):
 return [.482+.14*z+depth,cy+y*sy,cz+z*sz]
def strip(rings,material,sign,reverse=False):
 vertices=[p for ring in rings for p in ring];faces=[]
 for r in range(len(rings)-1):
  for i in range(N):
   a=r*N+i;b=r*N+(i+1)%N;c=(r+1)*N+i;e=(r+1)*N+(i+1)%N
   faces.extend([[a,b,c],[b,e,c]])
 if reverse:faces=[[a,c,b] for a,b,c in faces]
 return primitive(vertices,faces,material,sign)
black=len(d['materials']);d['materials'].append({'name':'Mirror gloss black base','pbrMetallicRoughness':{'baseColorFactor':[.009,.012,.017,1],'metallicFactor':.15,'roughnessFactor':.29},'doubleSided':True})
glass=len(d['materials']);d['materials'].append({'name':'Exterior mirror reflective glass','pbrMetallicRoughness':{'baseColorFactor':[.65,.72,.76,1],'metallicFactor':1,'roughnessFactor':.06},'doubleSided':True})
for sign,label in [(1,'Left'),(-1,'Right')]:
 # Loft a shallow cap; its rear is open, with a continuous dark inset bezel.
 # Sample a rounded cap densely, with one welded pole instead of a pinched ring.
 rings=[]
 for k in range(33):
  angle=(math.pi/2-.035)*k/32
  rings.append([point(z,y,.075*math.sin(angle),math.cos(angle),math.cos(angle)) for z,y in contour])
 verts=[p for ring in rings for p in ring]
 pole=len(verts);verts.append(point(0,0,.075))
 fs=[]
 for r in range(len(rings)-1):
  for i in range(N):
   a=r*N+i;b=r*N+(i+1)%N;c=(r+1)*N+i;e=(r+1)*N+(i+1)%N
   fs.extend([[a,c,b],[b,c,e]])
 for i in range(N):fs.append([(len(rings)-1)*N+i,pole,(len(rings)-1)*N+(i+1)%N])
 shell=primitive(verts,fs,11,sign)
 # Split by the actual lower contour, preserving the smooth shell normals.
 # Add a restrained black lower housing section rather than a separate spherical cap.
 all_indices=d['accessors'][shell['indices']]
 v= rings
 # Build the lower section separately by changing material on triangle groups.
 bv=d['bufferViews'][all_indices['bufferView']];ids=struct.unpack_from('<'+'I'*all_indices['count'],blob,bv['byteOffset'])
 upper=[];lower=[]
 for k in range(0,len(ids),3):
  face=ids[k:k+3]; mean=sum(verts[i][1] for i in face)/3
  (lower if mean<cy-.025 else upper).extend(face)
 shell['indices']=accessor(upper,'SCALAR');low=dict(shell);low['indices']=accessor(lower,'SCALAR');low['material']=black
 bezel=strip([[point(z,y,-.001) for z,y in contour],[point(z,y,.004,.90,.80) for z,y in contour],[point(z,y,.009,.89,.79) for z,y in contour]],black,sign)
 mesh=next(m for m in d['meshes'] if m.get('name')=='Mirror_'+label);mesh['primitives']=[shell,low,bezel];mesh.pop('extras',None)
 # Closed fan with a single centre vertex, recessed behind the bezel lip.
 vertices=[point(0,0,.008)]+[point(z,y,.008+.001*(z/.1)**2,.885,.785) for z,y in contour]
 faces=[[0,1+i,1+(i+1)%N] for i in range(N)]
 # contour runs counterclockwise in z/y, therefore orient glass towards -X.
 test=vertices[1:4];u=[test[1][i]-test[0][i] for i in range(3)];v=[test[2][i]-test[0][i] for i in range(3)]
 if u[1]*v[2]-u[2]*v[1]>0:pass
 # Double-sided optical surface handles both yaw orientations.
 next(m for m in d['meshes'] if m.get('name')=='Mirror_glass_'+label)['primitives']=[primitive(vertices,faces,glass,sign)]
 # Door sail and short wedge support replace the long cylindrical stalk.
 sail=[(.720,.980,.816),(.505,1.080,.785),(.480,.985,.858)]
 vertices=[list(p) for p in sail]+[[x-.006,y,z+.012] for x,y,z in sail]
 faces=[[0,2,1],[3,4,5],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]]
 sail_prim=primitive(vertices,faces,black,sign)
 # Broad tapering pedestal with softly bevelled rectangular sections.
 sections=[(.827,.595,1.017,.058,.030),(.858,.558,1.035,.038,.024),(.895,.530,1.057,.023,.018)]
 profile=[(-1,-.65),(-.75,-1),(.75,-1),(1,-.65),(1,.65),(.75,1),(-.75,1),(-1,.65)]
 vr=[]
 for z,x,y,rx,ry in sections:
  for u,v in profile:vr.append([x+rx*u,y+ry*v,z])
 fs=[];Q=len(profile)
 for r in range(2):
  for i in range(Q):
   a=r*Q+i;b=r*Q+(i+1)%Q;c=(r+1)*Q+i;e=(r+1)*Q+(i+1)%Q
   fs.extend([[a,b,c],[b,e,c]])
 for off,reverse in [(0,True),(2*Q,False)]:
  for k in range(1,Q-1):
   face=[off,off+k,off+k+1];fs.append(face[::-1] if reverse else face)
 next(m for m in d['meshes'] if m.get('name')=='Mirror_stalk_'+label)['primitives']=[sail_prim,primitive(vr,fs,black,sign)]
assert json.dumps(d['nodes'],sort_keys=True)==original_nodes
assert json.dumps(d.get('animations'),sort_keys=True)==original_animations
d['buffers'][0]['byteLength']=len(blob)
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
P.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
print('Rebuilt two open-backed shells, recessed glass, bezels, triangular sails and short mounts. Door nodes and animations preserved.')
