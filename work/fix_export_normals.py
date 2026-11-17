from pathlib import Path
p=Path('work/glb_export.py');s=p.read_text();s=s.replace("scene.export(file_type='glb')","scene.export(file_type='glb',include_normals=True)");p.write_text(s)
p=Path('outputs/bmw-viewer/glass-sky-v18.js');p.write_text(Path('work/glass-sky-v18-original.js').read_text(encoding='utf-8'),encoding='utf-8')
p=Path('outputs/bmw-viewer/viewer-v18.js');s=p.read_text(encoding='utf-8');s=s.replace("if(o.material.name==='Reflective automotive glass')o.material=reflectSkyOnGlass", "if(o.material.name==='Reflective automotive glass'&&!o.geometry.attributes.normal)o.geometry.computeVertexNormals();\n      if(o.material.name==='Reflective automotive glass')o.material=reflectSkyOnGlass");p.write_text(s,encoding='utf-8')
