from pathlib import Path
p=Path('outputs/bmw-viewer/glass-sky-v18.js');s=p.read_text(encoding='utf-8');Path('work/glass-sky-v18-original.js').write_text(s,encoding='utf-8');p.write_text(s.replace('outgoingLight=mix(outgoingLight,glassSky(normalize(glassReflected)),glassFresnel);','outgoingLight=vec3(.1,.3,.7);'),encoding='utf-8')
