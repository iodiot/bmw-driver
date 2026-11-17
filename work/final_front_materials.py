from pathlib import Path
p=Path('work/repair_front_v17.py');s=p.read_text();s=s.replace("add(tube(p,.006,10),f'Hood_hinge_arm_{sign}',metal)","p[:,1]-=.024\n add(tube(p,.006,10),f'Hood_hinge_arm_{sign}',metal)");p.write_text(s)
p=Path('work/opening_panels_v18.py');s=p.read_text();s=s.replace('mat.baseColorFactor=[125,2,10,255]','mat.baseColorFactor=[105,1,7,255]');p.write_text(s)
p=Path('work/verify_v18.py');s=p.read_text();s=s.replace('[125,2,10,255]','[105,1,7,255]');p.write_text(s)
p=Path('outputs/bmw-viewer/viewer-v18.js');s=p.read_text(encoding='utf-8');line="renderer.debug.onShaderError=(gl,p,v,f)=>{document.body.dataset.shaderError=(gl.getProgramInfoLog(p)||'')+' '+(gl.getShaderInfoLog(v)||'')+' '+(gl.getShaderInfoLog(f)||'');};\n";s=s.replace(line,'');p.write_text(s,encoding='utf-8')
