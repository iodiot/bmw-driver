import urllib.request
for n in ['viewer-v16.js','driving-physics-v16.mjs','road-v16.js']:
 try:
  r=urllib.request.urlopen('http://127.0.0.1:5195/'+n);print(n,r.status,r.headers.get('Content-Type'),len(r.read()))
 except Exception as e:print(n,e)
