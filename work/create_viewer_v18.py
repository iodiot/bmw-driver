from pathlib import Path
s=Path('outputs/bmw-viewer/car-v17.html').read_text(encoding='utf-8').replace('viewer-v17.js','viewer-v18.js')
needle='<div class="row"><label for="steer">'
panels='''<details class="subpanel"><summary>Doors &amp; trunk</summary><p class="key-help">Click a door, hood or trunk to open or close it.</p><div class="row"><button id="open-all">Open all</button><button id="close-all">Close all</button></div>'''
for ident,label,maxval in [('front-left','Front left door',65),('front-right','Front right door',65),('rear-left','Rear left door',62),('rear-right','Rear right door',62),('trunk','Trunk',65)]:
 panels+=f'<div class="row"><label for="{ident}">{label}</label><output id="{ident}-angle">0°</output></div><input id="{ident}" type="range" min="0" max="{maxval}" value="0">'
panels+='</details>'
s=s.replace(needle,panels+needle)
s=s.replace('<style>.drive-hud','<style>.subpanel{border-top:1px solid #304052;border-bottom:1px solid #304052;padding:9px 0;margin:12px 0}.subpanel summary{font-weight:500;font-size:13px}.panel .subpanel[open] summary{border:0;padding:0;margin:0}.subpanel summary::after{font-size:17px}.subpanel[open] summary::after{content:"-"}.drive-hud')
Path('outputs/bmw-viewer/car-v18.html').write_text(s,encoding='utf-8')
s=Path('outputs/bmw-viewer/viewer-v17.js').read_text(encoding='utf-8').replace('bmw-front-seams-v17.glb','bmw-opening-panels-v18.glb')
s=s.replace('let wheelPivots=[], steeringPivots=[], leds=[], rearLeds=[];', '''let wheelPivots=[], steeringPivots=[], leds=[], rearLeds=[];
const panelRoots={}, panelTargets={}, panelSpecs={
 Hood_pivot:{axis:'z',sign:1,id:'hood',output:'angle'},
 Trunk_pivot:{axis:'z',sign:-1,id:'trunk',output:'trunk-angle'},
 Door_pivot_Front_Left:{axis:'y',sign:-1,id:'front-left',output:'front-left-angle'},
 Door_pivot_Front_Right:{axis:'y',sign:1,id:'front-right',output:'front-right-angle'},
 Door_pivot_Rear_Left:{axis:'y',sign:-1,id:'rear-left',output:'rear-left-angle'},
 Door_pivot_Rear_Right:{axis:'y',sign:1,id:'rear-right',output:'rear-right-angle'}
};
for(const name of Object.keys(panelSpecs))panelTargets[name]=0;
let pendingResume=false;''')
s=s.replace("if(o.name==='Hood_pivot')hoodRoot=o;", "if(o.name==='Hood_pivot')hoodRoot=o;if(panelSpecs[o.name])panelRoots[o.name]=o;")
s=s.replace('if(o.isMesh){', '''if(o.isMesh){
      if(o.material.name==='Reflective automotive glass')o.material=new THREE.MeshPhysicalMaterial({
        name:'Reflective automotive glass',color:0x203948,metalness:0,roughness:.06,
        ior:1.52,clearcoat:1,clearcoatRoughness:.035,envMapIntensity:1.8,
        specularIntensity:1,transmission:.06,thickness:.006,side:THREE.DoubleSide
      });''')
s=s.replace('function setDriving(enabled){', '''function setDriving(enabled){
  if(enabled&&Object.keys(panelRoots).some(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])>.006)){
    pendingResume=true;for(const n of Object.keys(panelTargets)){panelTargets[n]=0;updatePanelControl(n,0);}enabled=false;
  }else pendingResume=false;''')
a=s.index("$('#hood').oninput=");b=s.index("$('#steer').oninput=",a)
s=s[:a]+'''function updatePanelControl(name,degrees){
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
''' + s[b:]
s=s.replace('if(hoodRoot)hoodRoot.rotation.z=THREE.MathUtils.damp(hoodRoot.rotation.z,opening,8,dt);', '''for(const [name,root] of Object.entries(panelRoots))root.rotation[panelSpecs[name].axis]=THREE.MathUtils.damp(root.rotation[panelSpecs[name].axis],panelTargets[name],7,dt);
  if(pendingResume&&Object.keys(panelRoots).every(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])<.006))setDriving(true);''')
s=s.replace("driving?Math.round(sim.speed*3.6)+' km/h':'Paused'", "driving?Math.round(sim.speed*3.6)+' km/h':pendingResume?'Closing panels…':'Paused'")
s=s.replace('telemetryTime=0;', "telemetryTime=0;document.body.dataset.panelsOpen=Object.keys(panelRoots).filter(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])>.03).length;",1) if False else s
s=s.replace("telemetryTime=0;$('#velocity')", "telemetryTime=0;document.body.dataset.panelsOpen=Object.keys(panelRoots).filter(n=>Math.abs(panelRoots[n].rotation[panelSpecs[n].axis])>.03).length;$('#velocity')")
Path('outputs/bmw-viewer/viewer-v18.js').write_text(s,encoding='utf-8')
