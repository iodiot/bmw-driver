from pathlib import Path
import json,urllib.request,hashlib,datetime
P=Path('outputs/bmw-viewer');html=(P/'car-v25.html').read_text(encoding='utf-8')
assert 'viewer-v25.js?revision=final' in html
assert "'./bmw-window-frames-v25.glb?revision=final'" in (P/'viewer-v25.js').read_text(encoding='utf-8')
(P/'index.html').write_text(html,encoding='utf-8')
st=json.loads(Path('outputs/car-v25-statistics.json').read_text())
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=25]+[st];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
p=Path('outputs/model-statistics.md');s=p.read_text(encoding='utf-8')
if 'Версия 25 —' in s:s=s[:s.index('Версия 25 —')].rstrip()
s+='\n\nВерсия 25 — оконные арки и рамки для всех шести стеклянных проёмов по контурам размерного рисунка BMW: четыре объёмные дверные рамки с уплотнителями, чёрные участки средней стойки, отдельные наружные дуги и нижние молдинги; широкие неподвижные стойки и верхние рейки проёмов; округлённая окантовка лобового и заднего стекла с керамической полосой, уплотнениями и кузовными кромками. Дверные рамки и молдинги открываются вместе с дверями. Номинальная ширина дверной рамки 22 мм и зазор до кузова 3,5 мм — размеры визуальной реконструкции, не заводские допуски. Добавлены/перестроены 40 сеток оконных узлов. '+f"{st['objects']} сеток, {st['vertices']} вершин, {st['triangles']} треугольника, {st['MiB']} МиБ."+' Габариты кузова, шесть узлов открывания, четыре колеса и антенна сохранены. Новых генераций SF3D нет; всего 9. Оптимизация и сжатие не выполнялись.\n'
p.write_text(s,encoding='utf-8')
base='https://calgary-surely-certificates-opposed.trycloudflare.com/'
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'car-v25.html?paused=1','files':{}}
for n in ['','car-v25.html','viewer-v25.js','bmw-window-frames-v25.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=55) as r:data=r.read();status=r.status
 assert data==(P/(n or 'index.html')).read_bytes(),n
 report['files'][n or 'index']={'status':status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
Path('outputs/car-v25-network-check.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
