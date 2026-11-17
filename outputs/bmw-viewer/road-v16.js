export function setupRoad(scene) {
  const ground=scene.getObjectByName('Asphalt ground');
  if(ground) {
    ground.scale.set(10,10,1);ground.material.map.repeat.set(2000,2000);
    // Paint on the asphalt itself: one depth surface, with derivative-based
    // antialiasing and a distance fade instead of coplanar strip geometry.
    ground.material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 vRoadXZ;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRoadXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
      shader.fragmentShader='varying vec2 vRoadXZ;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float roadAAZ=max(fwidth(vRoadXZ.y),0.002);
        float roadAAX=max(fwidth(vRoadXZ.x),0.002);
        float laneDistance=min(abs(vRoadXZ.y-1.8),abs(vRoadXZ.y+1.8));
        float lanePaint=1.0-smoothstep(0.065-roadAAZ,0.065+roadAAZ,laneDistance);
        float dashX=abs(mod(vRoadXZ.x+4.5,9.0)-4.5);
        float dashPaint=1.0-smoothstep(1.5-roadAAX,1.5+roadAAX,dashX);
        float edgeDistance=min(abs(vRoadXZ.y-5.4),abs(vRoadXZ.y+5.4));
        float edgePaint=1.0-smoothstep(0.075-roadAAZ,0.075+roadAAZ,edgeDistance);
        float paintVisibility=1.0-smoothstep(65.0,170.0,length(cameraPosition.xz-vRoadXZ));
        float paintMask=max(lanePaint*dashPaint,edgePaint)*paintVisibility;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.78,0.78,0.73),paintMask);
      `);
    };
    ground.material.customProgramCacheKey=()=> 'asphalt-painted-lines-v16-r2';
    ground.material.needsUpdate=true;
  }
  const sky=scene.getObjectByName('Cloud sky sphere');
  return {
    update(x,z) {
      if(ground) ground.position.set(Math.round(x/50)*50,-.003,Math.round(z/50)*50);
      if(sky) sky.position.set(x,0,z);
    }
  };
}
