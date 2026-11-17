from pathlib import Path
p=Path('outputs/bmw-viewer/glass-sky-v18.js');s=p.read_text(encoding='utf-8').replace('outgoingLight=vec3(.1,.3,.7);','outgoingLight=glassSky(normalize(glassReflected));');p.write_text(s,encoding='utf-8')
