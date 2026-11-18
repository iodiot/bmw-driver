import * as THREE from 'three';

export function setupBrakeLights(rig) {
  rig.root.updateMatrixWorld(true);
  const original = rig.root.getObjectByName('Object_29');
  if (!original?.isMesh) throw new Error('Rear lamps were not found in the model.');
  const geometry = original.geometry,
    position = geometry.attributes.position,
    index = geometry.index;
  const sides = [[], []],
    point = new THREE.Vector3();
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    let z = 0;
    for (const id of ids) {
      point.fromBufferAttribute(position, id).applyMatrix4(original.matrixWorld);
      z += point.z;
    }
    sides[z > 0 ? 0 : 1].push(...ids);
  }
  if (sides.some((ids) => !ids.length)) throw new Error('Unable to separate the rear lamps.');
  const lamps = sides.map((ids, i) => {
    const mesh = original.clone(false);
    mesh.name = i === 0 ? 'BrakeLamp_Left' : 'BrakeLamp_Right';
    mesh.geometry = geometry.clone();
    mesh.geometry.setIndex(ids);
    // Preserve the authored LED pattern and isolate it from the front headlamps.
    mesh.material = original.material.clone();
    mesh.material.name = mesh.name + '_red_LED';
    mesh.material.emissive.setRGB(1, 0.0004, 0.0001);
    mesh.material.emissiveIntensity = 0.08;
    mesh.material.color.setRGB(0.75, 0.025, 0.012);
    // Keep saturated red LEDs from bleaching orange/white under the scene's ACES curve.
    mesh.material.toneMapped = false;
    mesh.material.metalness = 0;
    mesh.material.roughness = 0.28;
    original.parent.add(mesh);
    return mesh;
  });
  original.removeFromParent();
  const rest = 0.08,
    brake = 3.4;
  return {
    lamps,
    rest,
    brake,
    update(dt, pressed, night = false) {
      const target = pressed ? brake : night ? 0.45 : rest;
      for (const lamp of lamps)
        lamp.material.emissiveIntensity = THREE.MathUtils.damp(
          lamp.material.emissiveIntensity,
          target,
          32,
          dt
        );
      return { braking: Boolean(pressed), intensity: lamps[0].material.emissiveIntensity };
    },
  };
}
