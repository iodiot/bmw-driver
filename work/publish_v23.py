from pathlib import Path
import json,urllib.request,hashlib,datetime,subprocess
P=Path('outputs/bmw-viewer')
(P/'index.html').write_text((P/'car-v23.html').read_text(encoding='utf-8'),encoding='utf-8')
st=json.loads(Path('outputs/car-v23-statistics.json').read_text())
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=23]+[st];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
p=Path('outputs/model-statistics.md');s=p.read_text(encoding='utf-8')
if 'Версия 23 —' in s:s=s[:s.index('Версия 23 —')].rstrip()
s+='\n\nВерсия 23 — исправлены зубчатые блики и волнистые отражения по краям дверей, стёкол и крыши. Наружная поверхность, внутренняя поверхность и торцы получили раздельные нормали; удалены резкие переходы функции формы бокового остекления; сетка уточнена на изгибах. Проверены обе стороны, симметрия, физическая замкнутость панелей, исходные габариты, четыре колеса и шесть открывающихся панелей. '+f"{st['objects']} сеток, {st['vertices']} вершин, {st['triangles']} треугольников, {st['MiB']} МиБ."+' Это исправление поверхностей с увеличением детализации сетки; оптимизация и сжатие не выполнялись. Новых запусков Glow Rush/SF3D нет; всего 9.\n'
p.write_text(s,encoding='utf-8')
base='https://calgary-surely-certificates-opposed.trycloudflare.com/'
report={'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':base+'car-v23.html?detail=surface','files':{}}
for n in ['','car-v23.html','viewer-v23.js','bmw-surface-normals-v23.glb']:
 try:
  with urllib.request.urlopen(urllib.request.Request(base+n,headers={'User-Agent':'Mozilla/5.0'}),timeout=45) as r:
   data=r.read();status=r.status
  mode='system DNS'
 except urllib.error.URLError:
  # Public DNS previously resolved this active tunnel to the Cloudflare edge.
  # HTTPS still validates the hostname; this does not disable TLS checking.
  f=Path('work')/('remote-v23-'+(n or 'index'))
  subprocess.run(['curl.exe','--fail','--silent','--show-error','--max-time','55','--resolve','calgary-surely-certificates-opposed.trycloudflare.com:443:104.16.230.132',base+n,'--output',str(f)],check=True)
  data=f.read_bytes();status=200;mode='public DNS address, hostname TLS verification'
 assert data==(P/(n or 'index.html')).read_bytes(),n
 report['files'][n or 'index']={'status':status,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'resolution':mode}
Path('outputs/car-v23-network-check.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
