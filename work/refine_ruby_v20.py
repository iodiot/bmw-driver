from pathlib import Path
p=Path('work/build_taillights_v20.py');s=p.read_text();s=s.replace("[135,3,7,255]","[50,2,4,255]").replace("[65,31,33,255]","[22,8,10,255]");p.write_text(s)
p=Path('outputs/bmw-viewer/viewer-v20.js');s=p.read_text(encoding='utf-8')
s=s.replace("name:old.name,color:old.color.clone(),metalness:0,roughness:.14,\n          transparent:true,opacity:ruby?.32:.22,depthWrite:false,side:THREE.FrontSide,\n          clearcoat:.4,clearcoatRoughness:.20,envMapIntensity:.45,ior:1.49", "name:old.name,color:ruby?0xd92335:0xf1f5ff,metalness:0,roughness:.12,\n          transmission:ruby?.72:.9,thickness:.0028,ior:1.49,\n          attenuationColor:new THREE.Color(ruby?0xa80818:0xffffff),attenuationDistance:ruby?.012:1,\n          side:THREE.FrontSide,clearcoat:.25,clearcoatRoughness:.18,envMapIntensity:.3")
s=s.replace('o.castShadow=!o.material.transparent;', 'o.castShadow=!o.material.transparent&&!o.material.transmission;')
p.write_text(s,encoding='utf-8')
