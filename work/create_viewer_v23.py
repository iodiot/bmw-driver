from pathlib import Path
P=Path('outputs/bmw-viewer');s=(P/'viewer-v22.js').read_text(encoding='utf-8')
s=s.replace("const projection=query.get('view');", "const projection=query.get('view');\nconst compareBefore=query.get('compare')==='before';\nconst modelFile=compareBefore?'./bmw-blueprint-sides-v22.glb?revision=final':'./bmw-surface-normals-v23.glb?revision=4';")
s=s.replace("const detailView=detailMode==='rear'||detailMode==='side';","const detailView=['rear','side','surface'].includes(detailMode);")
s=s.replace("detailMode==='side'?[-2.8,1.03,2.9]:[-3.9,1.08,1.9]", "detailMode==='surface'?[-.15,1.43,-2.9]:detailMode==='side'?[-2.8,1.03,2.9]:[-3.9,1.08,1.9]")
s=s.replace("detailMode==='surface'?[-.15,1.43,-2.9]", "detailMode==='surface'?[-.15,1.43,query.get('side')==='right'?2.9:-2.9]")
s=s.replace("detailMode==='side'?[-2.4,.81,.76]:[-2.48,.81,.55]", "detailMode==='surface'?[-.53,.98,0]:detailMode==='side'?[-2.4,.81,.76]:[-2.48,.81,.55]")
s=s.replace("new GLTFLoader().load('./bmw-blueprint-sides-v22.glb?revision=final'", "new GLTFLoader().load(modelFile")
s=s.replace("document.body.dataset.version='22'", "document.body.dataset.version=compareBefore?'22':'23'")
(P/'viewer-v23.js').write_text(s,encoding='utf-8')
html=(P/'car-v22.html').read_text(encoding='utf-8').replace('viewer-v22.js?revision=final','viewer-v23.js?revision=4')
(P/'car-v23.html').write_text(html,encoding='utf-8')
print('v23 close-up preview ready; public default unchanged until verification')

