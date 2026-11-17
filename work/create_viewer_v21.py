from pathlib import Path
p=Path('outputs/bmw-viewer/viewer-v20.js');s=p.read_text(encoding='utf-8').replace('bmw-volumetric-taillights-v20.glb','bmw-wrapped-taillights-v21.glb');Path('outputs/bmw-viewer/viewer-v21.js').write_text(s,encoding='utf-8')
s=Path('outputs/bmw-viewer/car-v20.html').read_text(encoding='utf-8').replace('viewer-v20.js','viewer-v21.js');Path('outputs/bmw-viewer/car-v21.html').write_text(s,encoding='utf-8')
