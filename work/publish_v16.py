from pathlib import Path
p=Path('outputs/bmw-viewer/car-v16.html');s=p.read_text(encoding='utf-8');s=s.replace('.drive-pad{display:grid', 'body[data-driving="false"] .drive-pad{display:none}.drive-pad{display:grid');p.write_text(s,encoding='utf-8')
Path('outputs/bmw-viewer/index.html').write_text(s,encoding='utf-8')
import json
stats=json.loads(Path('outputs/car-v16-statistics.json').read_text());p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'));d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=16]+[stats];p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
