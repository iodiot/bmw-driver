from pathlib import Path
p=Path('outputs/bmw-viewer/car-v16.html');s=p.read_text(encoding='utf-8').replace('src="./viewer-v16.js"','src="./viewer-v16.js?revision=2"');p.write_text(s,encoding='utf-8');Path('outputs/bmw-viewer/index.html').write_text(s,encoding='utf-8')
p=Path('work/test_driving_v16.mjs');s=p.read_text(encoding='utf-8').replace('left.z>0&&right.z<0','left.z<0&&right.z>0').replace('left.roll<0&&right.roll>0','left.roll>0&&right.roll<0');p.write_text(s,encoding='utf-8')
