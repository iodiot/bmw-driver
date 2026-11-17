from pathlib import Path
import re
p=Path('outputs/bmw-viewer/car-v16.html');s=p.read_text(encoding='utf-8')
s=re.sub(r'<div class="row"><button id="front">.*?</div>','',s)
s=re.sub(r'<div class="row"><button id="rear">.*?</div>','',s)
s=re.sub(r'<div class="downloads">.*?</div>','',s)
s=s.replace('viewer-v16.js?revision=2','viewer-v16.js?revision=3')
p.write_text(s,encoding='utf-8');Path('outputs/bmw-viewer/index.html').write_text(s,encoding='utf-8')
p=Path('outputs/bmw-viewer/viewer-v16.js');s=p.read_text(encoding='utf-8')
start=s.index("$('#front').onclick=");end=s.index("$('#perspective').onchange=",start)
s=s[:start]+s[end:];p.write_text(s,encoding='utf-8')
