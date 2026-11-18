import * as THREE from 'three';

export function setupHeadlights(rig) {
  const lens = rig.root.getObjectByName('Object_27');
  if (!lens?.isMesh) throw new Error('Headlight lenses were not found in the model.');
  lens.material = lens.material.clone();
  lens.material.name = 'Headlight LEDs';
  lens.material.emissive.set(0xfff3df);
  lens.material.toneMapped = false;

  const beams = new THREE.Group();
  beams.name = 'Low beams';
  rig.body.add(beams);
  for (const side of [-1, 1]) {
    // Measured projector centres, expressed relative to the suspended body pivot.
    const light = new THREE.SpotLight(0xfff3df, 1000, 55, 0.32, 0.5, 2);
    light.name = side > 0 ? 'Left low beam' : 'Right low beam';
    light.position.set(2.24, 0.645 - 0.55, side * 0.685);
    light.target.position.set(18, -0.35 - 0.55, side * 0.8);
    beams.add(light, light.target);
  }

  return {
    beams,
    lens,
    setNight(enabled) {
      beams.visible = enabled;
      lens.material.emissiveIntensity = enabled ? 4 : 0.8;
    },
  };
}
