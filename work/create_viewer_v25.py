from pathlib import Path
import re
P=Path('outputs/bmw-viewer');s=(P/'viewer-v24.js').read_text(encoding='utf-8')
s=re.sub(r'const modelFile=[^\n]+;',"const modelFile=compareBefore?'./bmw-rear-joints-v24.glb?revision=3':'./bmw-window-frames-v25.glb?revision=final';",s,count=1)
s=s.replace("'joints','lamp','antenna'].includes(detailMode)","'joints','lamp','antenna','windshield','rear-glass'].includes(detailMode)")
s=s.replace('controls.enableDamping=true;',"""if(detailMode==='windshield'){
 camera.position.set(2.8,1.6,.45);controls.target.set(.35,1.18,0);
}
if(detailMode==='rear-glass'){
 camera.position.set(-3.6,1.85,1.05);controls.target.set(-1.65,1.25,0);
}
controls.enableDamping=true;""")
s=s.replace("compareBefore?'23':'24'", "compareBefore?'24':'25'")
s=s.replace(':[-4.9,2.2,5.9]',':[4.8,1.85,5.8]')
(P/'viewer-v25.js').write_text(s,encoding='utf-8')
html=re.sub(r'viewer-v24\.js\?revision=[^\"]+', 'viewer-v25.js?revision=final',(P/'car-v24.html').read_text(encoding='utf-8'))
(P/'car-v25.html').write_text(html,encoding='utf-8');print('v25 glazing preview ready; public default still v24')



