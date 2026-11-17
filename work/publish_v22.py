from pathlib import Path
import json,urllib.request,hashlib,datetime
P=Path('outputs/bmw-viewer')
(P/'index.html').write_text((P/'car-v22.html').read_text(encoding='utf-8'),encoding='utf-8')
st=json.loads(Path('outputs/car-v22-statistics.json').read_text())
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=22]+[st];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
p=Path('outputs/model-statistics.md');s=p.read_text(encoding='utf-8')
if 'Версия 22 —' in s:s=s[:s.index('Версия 22 —')].rstrip()
s+='\n\nВерсия 22 — полностью перестроены боковые панели, двери, плечо кузова, пороги, арки, крыша, стойки, остекление, зеркала и боковые воздуховоды. Контуры окон и ручки привязаны к четырём проекциям размерного рисунка BMW; глубина штамповок восстановлена по фотографиям. Настроены стыки капота и крышки багажника. Сохранены 9 контрольных габаритов, 4 узла вращения и 6 механизмов открывания. '+f"{st['objects']} сеток, {st['vertices']} вершин, {st['triangles']} треугольников, {st['MiB']} МиБ."+' Новых генераций Glow Rush/SF3D нет; всего 9. Это реконструкция по схемам и фотографиям, не исходный заводской CAD.\n'
p.write_text(s,encoding='utf-8')
base='https://country-win-determines-fell.trycloudflare.com/'
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'?version=22&paused=1','files':{}}
for n in ['','viewer-v22.js','bmw-blueprint-sides-v22.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as r:
  data=r.read();report['files'][n or 'index']={'status':r.status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 assert data==(P/(n or 'index.html')).read_bytes(),n
Path('outputs/car-v22-network-check.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
