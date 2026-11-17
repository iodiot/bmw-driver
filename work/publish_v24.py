from pathlib import Path
import json,urllib.request,hashlib,datetime
P=Path('outputs/bmw-viewer');(P/'index.html').write_text((P/'car-v24.html').read_text(encoding='utf-8'),encoding='utf-8')
st=json.loads(Path('outputs/car-v24-statistics.json').read_text())
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=24]+[st];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
p=Path('outputs/model-statistics.md');s=p.read_text(encoding='utf-8')
if 'Версия 24 —' in s:s=s[:s.index('Версия 24 —')].rstrip()
s+='\n\nВерсия 24 — перестроены стык крышки багажника и крыла, внутренние поверхности задних стоек, боковые неподвижные участки задней полки и плечи задних крыльев. Основание заднего стекла сужено по виду сверху заводского размерного рисунка. Номинальный боковой зазор крышки 3,8 мм; ось петель перенесена вперёд, внутренние половины фонарей продолжают открываться с багажником. Перестроена окантовка фонарей; кромка рассеивателя выступает на 2,5 мм в визуальной модели, это не заводской допуск. Исправлены нормали 126 оптических сеток. Добавлен плавник антенны длиной 185 мм с основанием по кривизне крыши и уплотнением. Габариты кузова сохранены; антенна повышает полную высоту примерно до 1481 мм. '+f"{st['objects']} сеток, {st['vertices']} вершин, {st['triangles']} треугольников, {st['MiB']} МиБ."+' Новых генераций SF3D нет; всего 9. Сжатие и оптимизация не выполнялись.\n'
p.write_text(s,encoding='utf-8')
q=json.loads(Path('outputs/car-v24-verification.json').read_text());q['lamp_occlusion_check']=json.loads(Path('work/lamp-occlusion24.json').read_text());Path('outputs/car-v24-verification.json').write_text(json.dumps(q,indent=2))
base='https://calgary-surely-certificates-opposed.trycloudflare.com/'
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'car-v24.html?paused=1','files':{}}
for n in ['','car-v24.html','viewer-v24.js','bmw-rear-joints-v24.glb']:
 with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=55) as r:data=r.read();status=r.status
 assert data==(P/(n or 'index.html')).read_bytes(),n
 report['files'][n or 'index']={'status':status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
Path('outputs/car-v24-network-check.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
