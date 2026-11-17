from pathlib import Path
import json
p=Path('outputs/bmw-viewer/viewer-v18.js');s=p.read_text(encoding='utf-8').replace('camera.position.set(6,2.5,6)','camera.position.set(-6,2.5,6)');p.write_text(s,encoding='utf-8')
Path('outputs/bmw-viewer/index.html').write_text(Path('outputs/bmw-viewer/car-v18.html').read_text(encoding='utf-8'),encoding='utf-8')
p=Path('outputs/model-statistics.json');d=json.loads(p.read_text(encoding='utf-8'))
for ver in [17,18]:
 st=json.loads(Path(f'outputs/car-v{ver}-statistics.json').read_text());d['detailed_construction']=[x for x in d['detailed_construction'] if x.get('version')!=ver]+[st]
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
