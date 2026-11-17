import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {setupEnvironment} from './environment-v12.js';
import {setupRoad} from './road-v16.js?revision=2';
import {DrivingSimulation} from './driving-physics-v16.js?revision=2';

const $=s=>document.querySelector(s);
const scene=new THREE.Scene();
const extent=3.3;
const orthoCamera=new THREE.OrthographicCamera(-extent*innerWidth/innerHeight,extent*innerWidth/innerHeight,extent,-extent,.1,600);
const perspectiveCamera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,600);
let camera=perspectiveCamera;camera.position.set(6,2.5,6);
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
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(-.15,.75,0);
controls.enableDamping=true;controls.autoRotateSpeed=.5;controls.minZoom=.5;controls.maxZoom=6;
const sim=new DrivingSimulation(), input={}, held=new Set();
const carFrame=new THREE.Group();carFrame.name='Vehicle movement';scene.add(carFrame);
const bodyMotion=new THREE.Group();bodyMotion.name='Suspended body';bodyMotion.position.y=.55;carFrame.add(bodyMotion);
let loaded=false, driving=true, hoodRoot, opening=0, steeringPreview=0, rpm=30, spinning=false;
let wheelPivots=[], steeringPivots=[], leds=[], rearLeds=[];

new GLTFLoader().load('./bmw-front-seams-v17.glb',g=>{
  bodyMotion.add(g.scene);g.scene.position.y=-.55;g.scene.updateMatrixWorld(true);
  const wheelMounts=[];
  g.scene.traverse(o=>{
    if(o.name==='Hood_pivot')hoodRoot=o;
    if(o.name.startsWith('Wheel_spin_'))wheelPivots.push(o);
    if(o.name.startsWith('Steering_'))steeringPivots.push(o);
    if(o.name.startsWith('Steering_')||o.name.startsWith('Rear_mount_'))wheelMounts.push(o);
    if(o.isMesh){
      o.castShadow=!o.material.transparent;o.receiveShadow=false;
      if(o.material.transparent)o.material.depthWrite=false;
      if(o.material.name==='LED rings'){leds.push(o.material);o.material.emissiveIntensity=1.6;}
      if(o.material.name==='Rear LED guides'&&!rearLeds.includes(o.material))rearLeds.push(o.material);
    }
  });
  // Wheel mounts remain level with the road while the sprung body leans.
  for(const mount of wheelMounts)carFrame.attach(mount);
  loaded=true;$('#status').textContent='Ready';
  document.body.dataset.loaded='true';document.body.dataset.wheels=wheelPivots.length;
},undefined,e=>{$('#status').hidden=false;$('#status').textContent='Unable to load: '+e.message;});

function setDriving(enabled){
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

$('#hood').oninput=e=>{
  const degrees=Number(e.target.value);opening=degrees*Math.PI/180;$('#angle').textContent=degrees+'°';
  if(degrees>0)setDriving(false);
};
$('#steer').oninput=e=>{steeringPreview=Number(e.target.value)*Math.PI/180;$('#steer-angle').textContent=e.target.value+'°';setDriving(false);};
$('#speed').oninput=e=>{rpm=Number(e.target.value);$('#rpm').textContent=rpm+' RPM';};
$('#spin').onchange=e=>{spinning=e.target.checked;if(spinning)setDriving(false);};
$('#lights').onchange=e=>leds.forEach(m=>m.emissiveIntensity=e.target.checked?1.6:0);
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
  if(hoodRoot)hoodRoot.rotation.z=THREE.MathUtils.damp(hoodRoot.rotation.z,opening,8,dt);
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
  rearLeds.forEach(m=>m.emissiveIntensity=driving&&input.brake?2.6:1);
  road.update(sim.x,sim.z);
  key.position.set(sim.x+4,6,sim.z+2);key.target.position.set(sim.x,0,sim.z);
  fill.position.set(sim.x-2,2,sim.z-4);
  fill.target.position.set(sim.x,.7,sim.z);
  telemetryTime+=dt;
  if(telemetryTime>.1){
    telemetryTime=0;$('#velocity').textContent=driving?Math.round(sim.speed*3.6)+' km/h':'Paused';
    Object.assign(document.body.dataset,{speed:sim.speed.toFixed(3),steering:sim.steer.toFixed(4),roll:sim.roll.toFixed(4),pitch:sim.pitch.toFixed(4),distance:sim.distance.toFixed(2),vehicleX:sim.x.toFixed(2),vehicleZ:sim.z.toFixed(2),driving:String(driving)});
  }
  controls.update();renderer.render(scene,camera);
});
