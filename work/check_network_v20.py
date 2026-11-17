from pathlib import Path
import urllib.request,hashlib,json,datetime
P=Path('outputs/bmw-viewer');base='https://country-win-determines-fell.trycloudflare.com/'
rpt={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'?version=20&detail=rear','files':{}}
for n in ['','viewer-v20.js','bmw-volumetric-taillights-v20.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as r:
  data=r.read();rpt['files'][n or 'index']={'status':r.status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 assert data==(P/(n or 'index.html')).read_bytes(),n
Path('outputs/car-v20-network-check.json').write_text(json.dumps(rpt,indent=2));print(json.dumps(rpt))
