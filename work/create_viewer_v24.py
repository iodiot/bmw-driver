from pathlib import Path
P=Path('outputs/bmw-viewer');s=(P/'viewer-v23.js').read_text(encoding='utf-8')
s=s.replace("'./bmw-blueprint-sides-v22.glb?revision=final':'./bmw-surface-normals-v23.glb?revision=4'", "'./bmw-surface-normals-v23.glb?revision=4':'./bmw-rear-joints-v24.glb?revision=3'")
s=s.replace("['rear','side','surface'].includes(detailMode)","['rear','side','surface','joints','lamp','antenna'].includes(detailMode)")
s=s.replace('controls.enableDamping=true;',"""if(detailMode==='joints'){
 camera.position.set(-3.10,1.70,1.55);controls.target.set(-2.18,1.04,.72);
}
if(detailMode==='lamp'){
 camera.position.set(-3.10,1.04,1.10);controls.target.set(-2.46,.86,.72);
}
if(detailMode==='antenna'){
 camera.position.set(-1.39,1.61,.36);controls.target.set(-1.18,1.43,0);
}
controls.enableDamping=true;""")
s=s.replace("compareBefore?'22':'23'", "compareBefore?'23':'24'")
s=s.replace(':[4.8,1.85,5.8]',':[-4.9,2.2,5.9]')
(P/'viewer-v24.js').write_text(s,encoding='utf-8')
html=(P/'car-v23.html').read_text(encoding='utf-8').replace('viewer-v23.js?revision=4','viewer-v24.js?revision=3')
(P/'car-v24.html').write_text(html,encoding='utf-8')
print('v24 preview ready')


