from pathlib import Path
p=Path('outputs/bmw-viewer/glass-sky-v18.js');s=p.read_text(encoding='utf-8').replace('outgoingLight=glassSky(normalize(glassReflected));','outgoingLight=vec3(.5)+glassReflected*.5;');p.write_text(s,encoding='utf-8')
