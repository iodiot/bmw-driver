import * as THREE from 'three';

export function blackAutomotivePaint(source) {
  const material=new THREE.MeshPhysicalMaterial({
    name:'Black sapphire paint',color:source.color.clone(),
    metalness:.45,roughness:.34,clearcoat:.4,clearcoatRoughness:.27,
    specularIntensity:.4,envMapIntensity:.7,side:THREE.DoubleSide
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      // Softly limit the narrow directional-light hotspot on dark paint.
      float paintPeak=max(max(outgoingLight.r,outgoingLight.g),outgoingLight.b);
      outgoingLight/=1.0+paintPeak/0.45;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'black-sapphire-body-pass';
  return material;
}
