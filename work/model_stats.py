from pathlib import Path
import json, struct, urllib.request
root=Path(__file__).resolve().parents[1]
base=Path('C:/Users/iodio/Desktop/SF3D/ComfyUI/output')
entries=[
('G01','First car, inverted mask','GlowRush_00006_.glb','6b6a41a8-b77c-401d-bdd7-03a45fec43fd','Rejected: background reconstructed; flat geometry'),
('G02','Black car, corrected mask','BMW-M5-F10-Black_00001_.glb','1a0e6018-99df-42c6-bee0-5b2240dd30e5','Rejected: warped body and details'),
('G03','Matte reference, remeshed car','BMW-M5-F10-Black-v2_00001_.glb','450ec79e-1cd5-4e4f-8381-cac9be389b7e','Better silhouette; soft details'),
('G04','Matte reference, larger foreground','BMW-M5-F10-Black-v3_00001_.glb','5a4be35b-6a00-4939-aa91-ae5550bd7dd5','Rejected: uneven surface; smoothing exposed UV seams'),
('G05','Body shell, no wheels','BMW-F10-Shell-v4_00001_.glb','64a8455f-0449-4f61-af37-d90e6951b24c','Used in assembly 4; body detail remains weak'),
('G06','Separate wheel, slight angle','BMW-F10-Wheel-v4_00001_.glb','4b27397d-3dae-434b-8b79-92b26372cd1b','Used in assembly 4; irregular rim and spokes'),
('G07','Orthographic side body','BMW-Side-Ortho-v5_00001_.glb','b1a5683c-710e-4e6c-8238-76d3b18bce95','Assembly 5 candidate; side profile improved, volume still approximate'),
('G08','Orthographic front module','BMW-Front-Ortho-v5_00001_.glb','de9a5ae3-7c89-4309-8e4b-eab39c6d156f','Assembly 5 candidate; front has visible assembly seam'),
('G09','Orthographic wheel','BMW-Wheel-Ortho-v5_00001_.glb','67c481d9-3942-4b9e-ad01-6ac10c7e688d','Raw result retained; final wheel rebuilt with exact circular and spoke geometry'),
]
def info(path):
    b=path.read_bytes();size=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+size]);vertices=triangles=0
    for n in j['nodes']:
        if 'mesh' not in n:continue
        for p in j['meshes'][n['mesh']]['primitives']:
            count=j['accessors'][p['attributes']['POSITION']]['count'];vertices+=count
            triangles+=(j['accessors'][p['indices']]['count'] if 'indices' in p else count)//3
    return {'vertices':vertices,'triangles':triangles,'bytes':len(b),'MiB':round(len(b)/1024**2,3)}
rows=[]
for id,name,file,prompt,status in entries:
    path=base/file
    row={'id':id,'name':name,'file':file,'prompt_id':prompt,'assessment':status,**info(path)}
    try:
        history=json.load(urllib.request.urlopen('http://127.0.0.1:8188/history/'+prompt))[prompt]
        events=history['status']['messages'];start=next(e[1]['timestamp'] for e in events if e[0]=='execution_start');end=next(e[1]['timestamp'] for e in events if e[0]=='execution_success')
        row['generation_seconds']=round((end-start)/1000,2)
        row['server_status']=history['status']['status_str']
    except Exception:row['generation_seconds']=None
    rows.append(row)
assemblies=[]
for v in (4,5):
    path=root/f'outputs/bmw-viewer/bmw-m5-f10-animated-v{v}.glb'
    assemblies.append({'version':v,'kind':'Processed assembly, not another server generation',**info(path)})
result={'raw_generations':rows,'assemblies':assemblies,'note':'Triangle and vertex counts are read from the saved GLB accessors. Assembly counts include four wheel instances. MiB = 1,048,576 bytes. Server success confirms execution only, not visual quality.'}
(root/'outputs/model-statistics.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
