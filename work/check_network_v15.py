import urllib.request,hashlib,json
from pathlib import Path
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text());print({k:len(v) if isinstance(v,list) else type(v).__name__ for k,v in d.items()})
base='https://country-win-determines-fell.trycloudflare.com/'
result={}
for name in ['', 'bmw-quarter-refined-v15.glb']:
 req=urllib.request.Request(base+name,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=45) as r:
  data=r.read();result[name or 'index']={'status':r.status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 if name:assert data==Path('outputs/bmw-viewer/'+name).read_bytes()
 else:assert b'bmw-quarter-refined-v15.glb' in data
Path('outputs/car-v15-network-check.json').write_text(json.dumps(result,indent=2));print(result)
