from pathlib import Path
import urllib.request,hashlib,json,datetime
base='https://country-win-determines-fell.trycloudflare.com/'
rpt={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'?version=18','files':{}}
for n in ['','viewer-v18.js','glass-sky-v18.js','road-v16.js','driving-physics-v16.js','bmw-opening-panels-v18.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as r:
  data=r.read();rpt['files'][n or 'index']={'status':r.status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 assert data==Path('outputs/bmw-viewer/'+(n or 'index.html')).read_bytes(),n
Path('outputs/car-v18-network-check.json').write_text(json.dumps(rpt,indent=2));print(json.dumps(rpt))
