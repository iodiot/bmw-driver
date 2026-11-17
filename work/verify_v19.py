from pathlib import Path
import urllib.request,hashlib,json,datetime,struct
P=Path('outputs/bmw-viewer')
def chunks(path):
 raw=path.read_bytes();L=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+L]),raw[20+L:]
a,ab=chunks(P/'bmw-opening-panels-v18.glb');b,bb=chunks(P/'bmw-materials-v19.glb');assert ab==bb
for key in ['nodes','meshes','accessors','animations']:assert a[key]==b[key],key
base='https://country-win-determines-fell.trycloudflare.com/'
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'?version=19','geometry_and_rigs_identical_to_v18':True,'files':{}}
for n in ['','viewer-v19.js','glass-sky-v18.js?revision=2','paint-finish-v19.js','bmw-materials-v19.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as r:
  data=r.read();report['files'][n or 'index']={'status':r.status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 assert data==(P/(n.split('?')[0] or 'index.html')).read_bytes(),n
Path('outputs/car-v19-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
