from pathlib import Path
p=Path('outputs/bmw-viewer/viewer-v18.js');s=p.read_text(encoding='utf-8');s=s.replace("import {reflectSkyOnGlass} from './glass-sky-v18.js';", "import {reflectSkyOnGlass} from './glass-sky-v18.js?revision=2';\nimport {blackAutomotivePaint} from './paint-finish-v19.js';")
s=s.replace('if(o.isMesh){',"if(o.isMesh){\n      if(o.material.name==='Black sapphire paint')o.material=blackAutomotivePaint(o.material);")
p.write_text(s,encoding='utf-8')
p=Path('outputs/bmw-viewer/car-v18.html');s=p.read_text(encoding='utf-8').replace('src="./viewer-v18.js"','src="./viewer-v18.js?revision=2"');p.write_text(s,encoding='utf-8');Path('outputs/bmw-viewer/index.html').write_text(s,encoding='utf-8')
p=Path('work/opening_panels_v18.py');s=p.read_text();s=s.replace('# Dark steel rotors and deep crimson calipers, as requested.',"# Keep the exported black paint below a mirror-like polished-metal finish.\nfor m in scene.geometry.values():\n if m.visual.material.name=='Black sapphire paint':m.visual.material.roughnessFactor=.34;m.visual.material.metallicFactor=.45\n# Dark steel rotors and deep crimson calipers, as requested.")
p.write_text(s)
