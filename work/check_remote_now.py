import urllib.request,hashlib,json
from pathlib import Path
base='https://calgary-surely-certificates-opposed.trycloudflare.com/'
for name,local in [('', 'index.html'),('bmw-blueprint-sides-v22.glb?revision=final','bmw-blueprint-sides-v22.glb')]:
 try:
  with urllib.request.urlopen(base+name,timeout=20) as r:
   data=r.read();status=r.status
  good=hashlib.sha256(data).digest()==hashlib.sha256((Path('outputs/bmw-viewer')/local).read_bytes()).digest()
  print(json.dumps({'file':local,'status':status,'bytes':len(data),'matches_local':good}))
 except Exception as e:print(json.dumps({'file':local,'error':str(e)}))

