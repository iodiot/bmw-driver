import json
from pathlib import Path
d=json.loads(Path('work/normal-repair-v23.json').read_text())
print([(k,v['vertices_before'],v['vertices_after'],v['triangles']) for k,v in d['meshes'].items()])
p=Path('work/create_viewer_v23.py');s=p.read_text(encoding='utf-8-sig').replace('revision=2','revision=3');p.write_text(s,encoding='utf-8')
