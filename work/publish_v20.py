from pathlib import Path
import json
P=Path('outputs/bmw-viewer');(P/'index.html').write_text((P/'car-v20.html').read_text(encoding='utf-8'),encoding='utf-8')
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));s=json.loads(Path('outputs/car-v20-statistics.json').read_text());d['detailed_construction']=[v for v in d['detailed_construction'] if v.get('version')!=20]+[s];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
