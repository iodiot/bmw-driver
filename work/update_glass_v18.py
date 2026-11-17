from pathlib import Path
p=Path('outputs/bmw-viewer/viewer-v18.js');s=p.read_text(encoding='utf-8');s="import {reflectSkyOnGlass} from './glass-sky-v18.js';\n"+s
s=s.replace("if(o.material.name==='Reflective automotive glass')o.material=new THREE.MeshPhysicalMaterial({", "if(o.material.name==='Reflective automotive glass')o.material=reflectSkyOnGlass(new THREE.MeshPhysicalMaterial({")
s=s.replace("specularIntensity:1,transmission:.06,thickness:.006,side:THREE.DoubleSide\n      });", "specularIntensity:1,transmission:0,thickness:.006,side:THREE.DoubleSide\n      }));")
p.write_text(s,encoding='utf-8')
p=Path('outputs/bmw-viewer/car-v18.html');s=p.read_text(encoding='utf-8').replace('.subpanel[open] summary::after{content:"-"}', '.subpanel[open] summary::after{content:"-"}.panel .subpanel:not([open]) summary::after{content:"+"}');p.write_text(s,encoding='utf-8')
