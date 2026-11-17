from pathlib import Path
import urllib.request,hashlib,json,datetime
base='https://country-win-determines-fell.trycloudflare.com/'
result={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'?version=16','files':{}}
for n in ['','viewer-v16.js','driving-physics-v16.js','road-v16.js','bmw-solid-sides-v16.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as r:
  data=r.read();result['files'][n or 'index']={'status':r.status,'bytes':len(data),'content_type':r.headers.get('Content-Type'),'sha256':hashlib.sha256(data).hexdigest()}
 assert data==Path('outputs/bmw-viewer/'+(n or 'index.html')).read_bytes(),n
Path('outputs/car-v16-network-check.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
