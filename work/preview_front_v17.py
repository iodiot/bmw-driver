from pathlib import Path
p=Path('outputs/bmw-viewer/car-v16.html');s=p.read_text(encoding='utf-8').replace('viewer-v16.js?revision=3','viewer-v17.js');Path('outputs/bmw-viewer/car-v17.html').write_text(s,encoding='utf-8')
p=Path('outputs/bmw-viewer/viewer-v16.js');s=p.read_text(encoding='utf-8').replace('bmw-solid-sides-v16.glb','bmw-front-seams-v17.glb').replace('camera.position.set(-6,2.5,6)','camera.position.set(6,2.5,6)');Path('outputs/bmw-viewer/viewer-v17.js').write_text(s,encoding='utf-8')
