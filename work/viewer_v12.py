from pathlib import Path
p=Path('outputs/bmw-viewer/car-v12.html');s=p.read_text(encoding='utf-8')
s=s.replace('bmw-side-concept-v11.glb','bmw-surface-wheel-v12.glb').replace('bmw-side-concept-v11.png','bmw-asphalt-v12.png').replace('.01,100)', '.01,600)')
s=s.replace("import * as THREE from 'three';","import * as THREE from 'three';import {setupEnvironment} from './environment-v12.js';")
s=s.replace('const controls=new OrbitControls','setupEnvironment(scene,renderer,key);const controls=new OrbitControls')
s=s.replace('if(o.isMesh){if(o.material.transparent)', 'if(o.isMesh){o.castShadow=!o.material.transparent;o.receiveShadow=true;if(o.material.transparent)')
p.write_text(s,encoding='utf-8');Path('outputs/bmw-viewer/index.html').write_text(s,encoding='utf-8')
