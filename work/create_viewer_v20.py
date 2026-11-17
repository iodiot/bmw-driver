from pathlib import Path
p=Path('work/build_taillights_v20.py');s=p.read_text();s=s.replace('m.vertices=trimesh.transform_points(m.vertices,M)','m.apply_transform(M)');p.write_text(s)
p=Path('outputs/bmw-viewer/viewer-v19.js');s=p.read_text(encoding='utf-8')
s=s.replace("const $=s=>document.querySelector(s);", "const $=s=>document.querySelector(s);\nconst detailView=new URLSearchParams(location.search).get('detail')==='rear';")
s=s.replace('camera.position.set(-6,2.5,6);',"camera.position.set(...(detailView?[-3.9,1.08,1.9]:[-6,2.5,6]));",1)
s=s.replace('controls.target.set(-.15,.75,0);',"controls.target.set(...(detailView?[-2.48,.81,.55]:[-.15,.75,0]));",1)
s=s.replace("bmw-materials-v19.glb","bmw-volumetric-taillights-v20.glb")
s=s.replace('spinning=false;', 'spinning=false,tailLightsOn=true;')
needle="if(o.material.name==='Black sapphire paint')"
new="""if(o.material.name==='Taillamp ruby cover'||o.material.name==='Taillamp clear cover'){
        const ruby=o.material.name==='Taillamp ruby cover',old=o.material;
        o.material=new THREE.MeshPhysicalMaterial({name:old.name,color:old.color.clone(),metalness:0,roughness:.14,
          transparent:true,opacity:ruby?.32:.22,depthWrite:false,side:THREE.FrontSide,
          clearcoat:.4,clearcoatRoughness:.20,envMapIntensity:.45,ior:1.49});
        o.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          float lensPeak=max(max(outgoingLight.r,outgoingLight.g),outgoingLight.b);
          outgoingLight/=1.0+lensPeak/0.5;
          #include <opaque_fragment>
        `);};
        o.material.customProgramCacheKey=()=> 'molded-taillamp-cover-v20';
      }
      """
s=s.replace(needle,new+needle)
s=s.replace("o.material.name==='Rear LED guides'", "['Rear LED guides','Rear LED guides V20'].includes(o.material.name)")
s=s.replace("$('#orbit').onchange", "$('#tail-lights').onchange=e=>tailLightsOn=e.target.checked;\n$('#orbit').onchange")
s=s.replace('driving&&input.brake?2.6:1','driving&&input.brake?2.3:tailLightsOn?.85:0')
s=s.replace('const clock=new THREE.Clock()',"if(detailView)setDriving(false);\nconst clock=new THREE.Clock()")
s=s.replace("distance:sim.distance.toFixed(2)","tailLights:String(tailLightsOn),distance:sim.distance.toFixed(2)")
Path('outputs/bmw-viewer/viewer-v20.js').write_text(s,encoding='utf-8')
s=Path('outputs/bmw-viewer/car-v19.html').read_text(encoding='utf-8').replace('viewer-v19.js','viewer-v20.js')
s=s.replace('<label><input type="checkbox" id="orbit"> Orbit</label>', '<label><input type="checkbox" id="tail-lights" checked> Tail lights</label></div><div class="row"><label><input type="checkbox" id="orbit"> Orbit</label>')
Path('outputs/bmw-viewer/car-v20.html').write_text(s,encoding='utf-8')
