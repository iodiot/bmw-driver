from pathlib import Path
import json
p=Path('outputs/bmw-viewer/car-v15.html');s=p.read_text();s=s.replace('<a href="front-v7.html">Front detail</a>','<a href="car-v14.html">Previous iteration</a><a href="factory-dimensions.png" target="_blank">Factory drawing</a>');p.write_text(s)
Path('outputs/bmw-viewer/index.html').write_text(s)
Path('outputs/bmw-viewer/factory-dimensions.png').write_bytes(Path('outputs/bmw-m5-f10-factory-dimensions.png').read_bytes())
st=json.loads(Path('outputs/car-v15-statistics.json').read_text());p=Path('outputs/model-statistics.json');data=json.loads(p.read_text(encoding='utf-8-sig'));data['detailed_construction']=[v for v in data.get('detailed_construction',[]) if v.get('version')!=15]+[st];p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
