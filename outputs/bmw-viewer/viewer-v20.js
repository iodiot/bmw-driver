import {reflectSkyOnGlass} from './glass-sky-v18.js?revision=2';
import {blackAutomotivePaint} from './paint-finish-v19.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {setupEnvironment} from './environment-v12.js';
import {setupRoad} from './road-v16.js?revision=2';
import {DrivingSimulation} from './driving-physics-v16.js?revision=2';

const $=s=>document.querySelector(s);
const detailView=new URLSearchParams(location.search).get('detail')==='rear';
const scene=new THREE.Scene();
const extent=3.3;
const orthoCamera=new THREE.OrthographicCamera(-extent*innerWidth/innerHeight,extent*innerWidth/innerHeight,extent,-extent,.1,600);
const perspectiveCamera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,600);
let camera=perspectiveCamera;camera.position.set(...(detailView?[-3.9,1.08,1.9]:[-6,2.5,6]));
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
document.body.appendChild(renderer.domElement);renderer.domElement.tabIndex=0;
renderer.domElement.addEventListener('pointerdown',()=>renderer.domElement.focus({preventScroll:true}));
scene.add(new THREE.HemisphereLight(0xdceeff,0x243246,1));
const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(4,6,2);scene.add(key);scene.add(key.target);
const fill=new THREE.DirectionalLight(0xa0caff,1);fill.position.set(-2,2,-4);scene.add(fill);scene.add(fill.target);
setupEnvironment(scene,renderer,key);
const road=setupRoad(scene);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(...(detailView?[-2.48,.81,.55]:[-.15,.75,0]));
controls.enableDamping=true;controls.autoRotateSpeed=.5;controls.minZoom=.5;controls.maxZoom=6;
const sim=new DrivingSimulation(), input={}, held=new Set();
const carFrame=new THREE.Group();carFrame.name='Vehicle movement';scene.add(carFrame);
const bodyMotion=new THREE.Group();bodyMotion.name='Suspended body';bodyMotion.position.y=.55;carFrame.add(bodyMotion);
let loaded=false, driving=true, hoodRoot, opening=0, steeringPreview=0, rpm=30, spinning=false,tailLightsOn=true;
let wheelPivots=[], steeringPivots=[], leds=[], rearLeds=[];
const panelRoots={}, panelTargets={}, panelSpecs={
 Hood_pivot:{axis:'z',sign:1,id:'hood',output:'angle'},
 Trunk_pivot:{axis:'z',sign:-1,id:'trunk',output:'trunk-angle'},
 Door_pivot_Front_Left:{axis:'y',sign:-1,id:'front-left',output:'front-left-angle'},
 Door_pivot_Front_Right:{axis:'y',sign:1,id:'front-right',output:'front-right-angle'},
 Door_pivot_Rear_Left:{axis:'y',sign:-1,id:'rear-left',output:'rear-left-angle'},
 Door_pivot_Rear_Right:{axis:'y',sign:1,id:'rear-right',output:'rear-right-angle'}
};
for(const name of Object.keys(panelSpecs))panelTargets[name]=0;
let pendingResume=false;

new GLTFLoader().load('./bmw-volumetric-taillights-v20.glb',g=>{
  bodyMotion.add(g.scene);g.scene.position.y=-.55;g.scene.updateMatrixWorld(true);
  const wheelMounts=[];
  g.scene.traverse(o=>{
    if(o.name==='Hood_pivot')hoodRoot=o;if(panelSpecs[o.name])panelRoots[o.name]=o;
    if(o.name.startsWith('Wheel_spin_'))wheelPivots.push(o);
    if(o.name.startsWith('Steering_'))steeringPivots.push(o);
    if(o.name.startsWith('Steering_')||o.name.startsWith('Rear_mount_'))wheelMounts.push(o);
    if(o.isMesh){
      if(o.material.name==='Taillamp ruby cover'||o.material.name==='Taillamp clear cover'){
        const ruby=o.material.name==='Taillamp ruby cover',old=o.material;
        o.material=new THREE.MeshPhysicalMaterial({name:old.name,color:old.color.clone(),metalness:0,roughness:.13,
          transparent:true,opacity:ruby?.24:.18,depthWrite:false,side:THREE.FrontSide,
          clearcoat:.35,clearcoatRoughness:.18,envMapIntensity:.35,ior:1.49});
        o.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          float lensPeak=max(max(outgoingLight.r,outgoingLight.g),outgoingLight.b);
          outgoingLight/=1.0+lensPeak/0.5;
          #include <opaque_fragment>
        `);};
        o.material.customProgramCacheKey=()=> 'molded-taillamp-cover-v20';
      }
      if(o.material.name==='Black sapphire paint')o.material=blackAutomotivePaint(o.material);
      if(o.material.name==='Reflective automotive glass'&&!o.geometry.attributes.normal)o.geometry.computeVertexNormals();
      if(o.material.name==='Reflective automotive glass')o.material=reflectSkyOnGlass(new THREE.MeshPhysicalMaterial({
        name:'Reflective automotive glass',color:0x203948,metalness:0,roughness:.06,
        ior:1.52,clearcoat:1,clearcoatRoughness:.035,envMapIntensity:1.8,
        specularIntensity:1,transmission:0,thickness:.006,side:THREE.DoubleSide
      }));
      o.castShadow=!o.material.transparent&&!o.material.transmission;o.receiveShadow=false;
      if(o.material.transparent)o.material.depthWrite=false;
      if(o.material.name==='LED rings'){leds.push(o.material);o.material.emissiveIntensity=1.6;}
      if(['Rear LED guides','Rear LED guides V20'].includes(o.material.name)&&!rearLeds.includes(o.material))rearLeds.push(o.material);
    }
  });
  // Wheel mounts remain level with the road while the sprung body leans.
  for(const mount of wheelMounts)carFrame.attach(mount);
  loaded=true;$('#status').textContent='Ready';
  document.body.dataset.loaded='true';document.body.dataset.wheels=wheelPivots.length;
},undefined,e=>{$('#status').hidden=false;$('#status').textContent='Unable to load: '+e.message;});

function setDriving(enabled){
  if(enabled&&Object.keys(panelRoots).some(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])>.006)){
    pendingResume=true;for(const n of Object.keys(panelTargets)){panelTargets[n]=0;updatePanelControl(n,0);}enabled=false;
  }else pendingResume=false;
  driving=enabled;$('#drive').checked=enabled;
  $('#pause').textContent=enabled?'Pause':'Resume';
  $('#pause').setAttribute('aria-label',enabled?'Pause driving':'Resume driving');
  held.clear();for(const k of Object.keys(input))input[k]=false;
  document.querySelectorAll('[data-action]').forEach(b=>b.dataset.pressed='false');
}
$('#drive').onchange=e=>setDriving(e.target.checked);
$('#pause').onclick=()=>setDriving(!driving);
$('#reset').onclick=()=>{
  sim.reset();carFrame.position.set(0,0,0);carFrame.rotation.set(0,0,0);
  view([-6,2.5,6]);
  setDriving(true);
};
const keyActions={ArrowUp:'accelerate',ArrowDown:'brake',ArrowLeft:'left',ArrowRight:'right',KeyW:'accelerate',KeyS:'brake',KeyA:'left',KeyD:'right'};
addEventListener('keydown',e=>{
  if(['TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.matches('input[type=range],input[type=text]'))return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat)setDriving(!driving);return;}
  const action=keyActions[e.code];if(action){e.preventDefault();held.add(e.code);input[action]=true;}
});
addEventListener('keyup',e=>{
  const action=keyActions[e.code];if(action){e.preventDefault();held.delete(e.code);input[action]=Object.keys(keyActions).some(k=>keyActions[k]===action&&held.has(k));}
});
const clearInput=()=>{held.clear();for(const k of Object.keys(input))input[k]=false;document.querySelectorAll('[data-action]').forEach(b=>b.dataset.pressed='false');};
addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();setDriving(false);}});
for(const button of document.querySelectorAll('[data-action]')){
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();button.setPointerCapture(e.pointerId);
    input[button.dataset.action]=true;button.dataset.pressed='true';
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{input[button.dataset.action]=false;button.dataset.pressed='false';});
}

function updatePanelControl(name,degrees){
 const spec=panelSpecs[name], slider=$('#'+spec.id), output=$('#'+spec.output);
 if(slider)slider.value=degrees;if(output)output.textContent=Math.round(degrees)+'°';
}
function setPanel(name,degrees){
 const spec=panelSpecs[name];panelTargets[name]=spec.sign*degrees*Math.PI/180;
 updatePanelControl(name,degrees);if(degrees>0)setDriving(false);
}
for(const [name,spec] of Object.entries(panelSpecs))$('#'+spec.id).oninput=e=>setPanel(name,Number(e.target.value));
$('#open-all').onclick=()=>{for(const [name,spec] of Object.entries(panelSpecs))setPanel(name,Number($('#'+spec.id).max));};
$('#close-all').onclick=()=>{pendingResume=false;for(const name of Object.keys(panelSpecs))setPanel(name,0);};
// Small clicks select a moving assembly; orbit drags never open panels.
const raycaster=new THREE.Raycaster();let clickStart=null;
renderer.domElement.addEventListener('pointerdown',e=>clickStart={x:e.clientX,y:e.clientY,time:performance.now()});
renderer.domElement.addEventListener('pointerup',e=>{
 if(!clickStart||Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)>5||performance.now()-clickStart.time>550)return;
 const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
 for(const hit of raycaster.intersectObject(carFrame,true)){
  let root=hit.object;while(root&&!panelSpecs[root.name])root=root.parent;
  if(root){const spec=panelSpecs[root.name];setPanel(root.name,Math.abs(panelTargets[root.name])>.01?0:Number($('#'+spec.id).max));break;}
  if(hit.object.isMesh&&!hit.object.material.transparent)break;
 }
 clickStart=null;
});
$('#steer').oninput=e=>{steeringPreview=Number(e.target.value)*Math.PI/180;$('#steer-angle').textContent=e.target.value+'°';setDriving(false);};
$('#speed').oninput=e=>{rpm=Number(e.target.value);$('#rpm').textContent=rpm+' RPM';};
$('#spin').onchange=e=>{spinning=e.target.checked;if(spinning)setDriving(false);};
$('#lights').onchange=e=>leds.forEach(m=>m.emissiveIntensity=e.target.checked?1.6:0);
$('#tail-lights').onchange=e=>tailLightsOn=e.target.checked;
$('#orbit').onchange=e=>controls.autoRotate=e.target.checked;
function view(pos,target=[-.15,.75,0],zoom=1){
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sim.heading);
  camera.zoom=zoom;camera.position.copy(new THREE.Vector3(...pos).applyQuaternion(rotation).add(carFrame.position));
  camera.up.set(0,1,0);camera.updateProjectionMatrix();
  controls.target.copy(new THREE.Vector3(...target).applyQuaternion(rotation).add(carFrame.position));controls.update();
}
$('#perspective').onchange=e=>{
  const next=e.target.checked?perspectiveCamera:orthoCamera;
  next.position.copy(camera.position);next.quaternion.copy(camera.quaternion);next.up.copy(camera.up);next.zoom=1;
  camera=next;camera.updateProjectionMatrix();controls.object=camera;controls.update();
};
addEventListener('resize',()=>{
  orthoCamera.left=-extent*innerWidth/innerHeight;orthoCamera.right=extent*innerWidth/innerHeight;orthoCamera.updateProjectionMatrix();
  perspectiveCamera.aspect=innerWidth/innerHeight;perspectiveCamera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
});

if(detailView)setDriving(false);
const clock=new THREE.Clock(), up=new THREE.Vector3(0,1,0);let telemetryTime=0;
renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),1/30), oldHeading=sim.heading, oldPosition=carFrame.position.clone();
  sim.step(dt,input,driving&&loaded);
  carFrame.position.set(sim.x,0,sim.z);carFrame.rotation.y=sim.heading;
  const movement=carFrame.position.clone().sub(oldPosition);
  // Follow the vehicle without discarding the user's orbit or zoom.
  const offset=camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(up,sim.heading-oldHeading);
  controls.target.add(movement);camera.position.copy(controls.target).add(offset);
  bodyMotion.rotation.set(sim.roll,0,sim.pitch);bodyMotion.position.y=.55+sim.heave;
  for(const [name,root] of Object.entries(panelRoots))root.rotation[panelSpecs[name].axis]=THREE.MathUtils.damp(root.rotation[panelSpecs[name].axis],panelTargets[name],7,dt);
  if(pendingResume&&Object.keys(panelRoots).every(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])<.006))setDriving(true);
  for(const pivot of steeringPivots){
    const a=driving?sim.steer:steeringPreview;
    const ackermann=Math.atan(Math.tan(a)/(1+pivot.position.z*Math.tan(a)/2.964));
    pivot.rotation.y=THREE.MathUtils.damp(pivot.rotation.y,ackermann,12,dt);
  }
  for(const pivot of wheelPivots){
    const rear=pivot.name.includes('Rear'),r=rear?.3425:.34675;
    const side=pivot.name.includes('Left')?1:-1,track=rear?.791:.8135;
    const angularSpeed=driving&&loaded?(sim.speed+sim.yawRate*side*track)/r:spinning?rpm*Math.PI/30:0;
    pivot.rotation.z=(pivot.rotation.z-angularSpeed*dt)%(2*Math.PI);
  }
  rearLeds.forEach(m=>m.emissiveIntensity=driving&&input.brake?2.3:tailLightsOn?.85:0);
  road.update(sim.x,sim.z);
  key.position.set(sim.x+4,6,sim.z+2);key.target.position.set(sim.x,0,sim.z);
  fill.position.set(sim.x-2,2,sim.z-4);
  fill.target.position.set(sim.x,.7,sim.z);
  telemetryTime+=dt;
  if(telemetryTime>.1){
    telemetryTime=0;document.body.dataset.panelsOpen=Object.keys(panelRoots).filter(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])>.03).length;$('#velocity').textContent=driving?Math.round(sim.speed*3.6)+' km/h':pendingResume?'Closing panels…':'Paused';
    Object.assign(document.body.dataset,{speed:sim.speed.toFixed(3),steering:sim.steer.toFixed(4),roll:sim.roll.toFixed(4),pitch:sim.pitch.toFixed(4),tailLights:String(tailLightsOn),distance:sim.distance.toFixed(2),vehicleX:sim.x.toFixed(2),vehicleZ:sim.z.toFixed(2),driving:String(driving)});
  }
  controls.update();renderer.render(scene,camera);
});
