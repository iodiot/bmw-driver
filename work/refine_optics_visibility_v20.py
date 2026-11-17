from pathlib import Path
p=Path('work/build_taillights_v20.py');s=p.read_text().replace("[50,42,45,255]","[60,4,8,255]").replace("[22,8,10,255]","[22,1,3,255]");p.write_text(s)
p=Path('outputs/bmw-viewer/viewer-v20.js');s=p.read_text(encoding='utf-8')
s=s.replace("name:old.name,color:ruby?0xd92335:0xf1f5ff,metalness:0,roughness:.12,\n          transmission:ruby?.72:.9,thickness:.0028,ior:1.49,\n          attenuationColor:new THREE.Color(ruby?0xa80818:0xffffff),attenuationDistance:ruby?.012:1,\n          side:THREE.FrontSide,clearcoat:.25,clearcoatRoughness:.18,envMapIntensity:.3", "name:old.name,color:old.color.clone(),metalness:0,roughness:.13,\n          transparent:true,opacity:ruby?.24:.18,depthWrite:false,side:THREE.FrontSide,\n          clearcoat:.35,clearcoatRoughness:.18,envMapIntensity:.35,ior:1.49")
p.write_text(s,encoding='utf-8')
