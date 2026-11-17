from pathlib import Path
P=Path('outputs/bmw-viewer')
s=(P/'viewer-v21.js').read_text(encoding='utf-8')
s=s.replace('bmw-wrapped-taillights-v21.glb','bmw-blueprint-sides-v22.glb?revision=final')
s=s.replace(':[-6,2.5,6]',':[4.8,1.85,5.8]')
s=s.replace("const detailMode=new URLSearchParams(location.search).get('detail');", "const query=new URLSearchParams(location.search);\nconst projection=query.get('view');\nconst detailMode=query.get('detail');")
s=s.replace('const extent=3.3;',"const extent=projection==='top'?3.05:projection==='front'||projection==='rear'?1.35:projection==='side'?Math.max(1.15,2.8/(innerWidth/innerHeight)):3.3;")
s=s.replace('let camera=perspectiveCamera;',"let camera=projection?orthoCamera:perspectiveCamera;")
s=s.replace("  document.body.dataset.loaded='true';document.body.dataset.wheels=wheelPivots.length;", "  document.body.dataset.loaded='true';document.body.dataset.version='22';document.body.dataset.wheels=wheelPivots.length;")
s=s.replace('if(detailView)setDriving(false);',"""if(projection){
 const positions={side:[-.137,.78,-8],top:[-.137,9,0],front:[8,.78,0],rear:[-8,.78,0]};
 camera.position.set(...(positions[projection]||positions.side));
 camera.up.set(...(projection==='top'?[0,0,1]:[0,1,0]));
 controls.target.set(-.137,.78,0);camera.lookAt(controls.target);controls.update();
 $('#perspective').checked=false;document.body.dataset.projection=projection;
}
if(detailView||projection||query.get('paused')==='1')setDriving(false);""")
(P/'viewer-v22.js').write_text(s,encoding='utf-8')
s=(P/'car-v21.html').read_text(encoding='utf-8').replace('viewer-v21.js','viewer-v22.js?revision=final')
(P/'car-v22.html').write_text(s,encoding='utf-8')
print('v22 preview ready; current public default remains v21 until review')
