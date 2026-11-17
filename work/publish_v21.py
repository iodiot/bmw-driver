from pathlib import Path
import json
p=Path('outputs/bmw-viewer/viewer-v21.js');s=p.read_text(encoding='utf-8')
s=s.replace("const detailView=new URLSearchParams(location.search).get('detail')==='rear';", "const detailMode=new URLSearchParams(location.search).get('detail');\nconst detailView=detailMode==='rear'||detailMode==='side';")
s=s.replace('detailView?[-3.9,1.08,1.9]:[-6,2.5,6]',"detailView?(detailMode==='side'?[-2.8,1.03,2.9]:[-3.9,1.08,1.9]):[-6,2.5,6]")
s=s.replace('detailView?[-2.48,.81,.55]:[-.15,.75,0]',"detailView?(detailMode==='side'?[-2.4,.81,.76]:[-2.48,.81,.55]):[-.15,.75,0]")
p.write_text(s,encoding='utf-8')
P=Path('outputs/bmw-viewer');(P/'index.html').write_text((P/'car-v21.html').read_text(encoding='utf-8'),encoding='utf-8')
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));st=json.loads(Path('outputs/car-v21-statistics.json').read_text());d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=21]+[st];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
