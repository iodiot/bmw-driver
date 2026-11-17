import * as THREE from 'three';
import {roadProfileGLSL} from './road-profile.js?revision=suspension3';

export function setupRoad(scene) {
  const ground=scene.getObjectByName('Asphalt ground');
  if(ground) {
    ground.geometry.dispose();
    ground.geometry=new THREE.PlaneGeometry(180,32,900,160);
    ground.material.map.repeat.set(180,32);
    ground.material.bumpScale=.003;
    ground.geometry.computeBoundingBox();
    ground.geometry.boundingBox.min.z=-.15;ground.geometry.boundingBox.max.z=.15;
    ground.geometry.computeBoundingSphere();
    // Paint on the asphalt itself: one depth surface, with derivative-based
    // antialiasing and a distance fade instead of coplanar strip geometry.
    ground.material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 vRoadXZ;\n'+roadProfileGLSL+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec2 surfaceXZ=(modelMatrix*vec4(position,1.)).xz;
        float dx=(roadHeight(surfaceXZ+vec2(.02,0.))-roadHeight(surfaceXZ-vec2(.02,0.)))/.04;
        float dz=(roadHeight(surfaceXZ+vec2(0.,.02))-roadHeight(surfaceXZ-vec2(0.,.02)))/.04;
        objectNormal=normalize(vec3(-dx,dz,1.));
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec2 surfacePosition=(modelMatrix*vec4(position,1.)).xz;
        transformed.z+=roadHeight(surfacePosition);
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRoadXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
      shader.fragmentShader='varying vec2 vRoadXZ;\n'+roadProfileGLSL+shader.fragmentShader;
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
        float height=roadHeight(vRoadXZ);
        float raised=smoothstep(.004,.018,height);
        float stripe=.5+.5*sin((vRoadXZ.x+vRoadXZ.y*.55)*14.);
        vec3 rubber=mix(vec3(.018),vec3(.72,.48,.045),smoothstep(.38,.62,stripe));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.78,0.78,0.73),paintMask*(1.-raised));
        diffuseColor.rgb=mix(diffuseColor.rgb,rubber,raised);
        diffuseColor.rgb*=1.-.5*smoothstep(.003,.045,-height);
      `);
    };
    ground.material.customProgramCacheKey=()=> 'asphalt-shaped-suspension-road';
    ground.material.needsUpdate=true;
  }

  return {
    update(x,z) {
      if(ground) ground.position.set(Math.round(x/30)*30,-.003,Math.round(z/10)*10);

    }
  };
}
