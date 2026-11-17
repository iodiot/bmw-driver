from pathlib import Path
import re
p=Path('outputs/bmw-viewer/car-v16.html');s=p.read_text(encoding='utf-8');s=re.sub(r'<title>.*?</title>','<title>BMW M5 F10</title>',s);p.write_text(s,encoding='utf-8')
p=Path('work/test_driving_v16.mjs');s=p.read_text(encoding='utf-8');p.write_text(s.replace('driving-physics-v16.mjs','driving-physics-v16.js'),encoding='utf-8')
