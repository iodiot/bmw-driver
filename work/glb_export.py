import json,struct
import numpy as np

def export_scene(scene,path,version,extras=None,panel_specs=None):
 raw=scene.export(file_type='glb',include_normals=True);length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=bytearray(raw[28+length:])
 def acc(array,kind,minv=None,maxv=None):
  a=np.asarray(array,dtype='<f4');blob.extend(b'\0'*((-len(blob))%4));offset=len(blob);blob.extend(a.tobytes());bv=len(doc.setdefault('bufferViews',[]));doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes});i=len(doc.setdefault('accessors',[]));v={'bufferView':bv,'componentType':5126,'count':len(a),'type':kind}
  if minv is not None:v['min']=minv
  if maxv is not None:v['max']=maxv
  doc['accessors'].append(v);return i
 for n in doc['nodes']:
  name=n.get('name','')
  if name.startswith(('Steering_','Wheel_spin_','Rear_mount_','Door_pivot_')) or name in ['Hood_pivot','Trunk_pivot']:
   mat=n.pop('matrix',None)
   if mat is not None:n['translation']=[mat[12],mat[13],mat[14]]
 t=np.linspace(0,2,9);a=-t*np.pi;q=np.column_stack([np.zeros(9),np.zeros(9),np.sin(a/2),np.cos(a/2)])
 ti=acc(t,'SCALAR',[0],[2]);qi=acc(q,'VEC4');ch=[{'sampler':0,'target':{'node':i,'path':'rotation'}} for i,n in enumerate(doc['nodes']) if n.get('name','').startswith('Wheel_spin_')]
 doc['animations']=[{'name':'Forward wheel spin','samplers':[{'input':ti,'output':qi,'interpolation':'LINEAR'}],'channels':ch}]
 if panel_specs:
  t=acc([0,1],'SCALAR',[0],[1])
  for name,(axis,angle) in panel_specs.items():
   ni=next(i for i,n in enumerate(doc['nodes']) if n.get('name')==name);q=np.array([[0,0,0,1],[0,0,0,np.cos(angle/2)]],float);q[1,axis]=np.sin(angle/2);r=acc(q,'VEC4');doc['animations'].append({'name':'Open '+name,'samplers':[{'input':t,'output':r,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':ni,'path':'rotation'}}]})
 doc['asset']['extras']={'version':version,**(extras or {})};doc['buffers'][0]['byteLength']=len(blob)
 j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
 path.write_bytes(result)
 return {'version':version,'objects':len(scene.geometry),'vertices':sum(len(m.vertices) for m in scene.geometry.values()),'triangles':sum(len(m.faces) for m in scene.geometry.values()),'bytes':len(result),'MiB':round(len(result)/1048576,3),'wheel_spin_groups':len(ch),'panel_animation_clips':len(panel_specs or {})}
