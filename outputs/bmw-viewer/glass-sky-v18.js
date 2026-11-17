import {cloudDrift} from './environment-v12.js?revision=sky-motion';

// The same sky and clouds as the sky sphere, sampled along the reflected view
// direction. This supplements the soft PMREM reflection on automotive glazing.
export function reflectSkyOnGlass(material) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.cloudDrift=cloudDrift;
    shader.fragmentShader=`
      uniform float cloudDrift;
      float gHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float gNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(gHash(i),gHash(i+vec3(1,0,0)),f.x),mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x),mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float gFbm(vec3 p){float v=0.,a=.55;for(int i=0;i<5;i++){v+=a*gNoise(p);p=p*2.06+vec3(4.1,8.2,2.3);a*=.5;}return v;}
      vec3 glassSky(vec3 d){
        float h=max(d.y,0.);
        vec3 color=mix(vec3(.78,.88,.98),vec3(.15,.43,.82),pow(h,.40));
        float c=cos(cloudDrift),s=sin(cloudDrift);
        vec3 p=vec3(c*d.x-s*d.z,d.y,s*d.x+c*d.z)*6.5;p.y*=2.;
        float cloud=smoothstep(.49,.68,gFbm(p))*smoothstep(.03,.20,h);
        vec3 white=mix(vec3(.69,.74,.80),vec3(1.),gFbm(p+5.));
        color=mix(color,white,cloud*.93);
        return mix(vec3(.045,.055,.07),color,smoothstep(-.025,.025,d.y));
      }
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 glassView=normalize(vViewPosition);
      vec3 glassReflected=inverseTransformDirection(reflect(-glassView,normal),viewMatrix);
      float glassCosine=clamp(abs(dot(normal,glassView)),0.0,1.0);
      float glassFresnel=.14+.20*pow(1.0-glassCosine,5.0);
      vec3 tintedSky=glassSky(normalize(glassReflected))*vec3(.72,.82,.90);
      outgoingLight=mix(vec3(.012,.019,.026),tintedSky,glassFresnel);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'tinted-cloud-sky-drifting';
  return material;
}
