import * as THREE from 'three';
import {
  highBeamProfile,
  highBeamSettings,
  lowBeamProfile,
  lowBeamSettings,
} from './headlight-profile.js';

// The beam meets the road at a grazing angle, so a small step in vertical
// angle spans metres of road: with 256 rows each texel covered about 2 m at
// 15 m, and the linear steps between texels showed as bands across the lit
// road. Rows are therefore dense (about 0.2 m at 15 m); the light varies
// more gently sideways, so fewer columns suffice (but enough that the
// cutoff's rise to the right reads as a line, not steps).
export function createLowBeamPattern(width = 256, height = 4096, profile = lowBeamProfile) {
  const data = new Uint16Array(width * height * 4);
  const tangent = Math.tan(lowBeamSettings.angle);
  for (let y = 0; y < height; y++) {
    const vertical = Math.atan((((y + 0.5) / height) * 2 - 1) * tangent);
    for (let x = 0; x < width; x++) {
      const horizontal = Math.atan((((x + 0.5) / width) * 2 - 1) * tangent);
      const value = THREE.DataUtils.toHalfFloat(profile(horizontal, vertical));
      const offset = (y * width + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'Low beam angular distribution';
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

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
  const pattern = createLowBeamPattern();
  // The high beam's pattern, made with the low beam's while the scene loads:
  // made on first use, at nightfall, it cost a visible hitch.
  const highPattern = createLowBeamPattern(256, 4096, highBeamProfile);
  highPattern.name = 'High beam angular distribution';
  let night = false,
    high = false,
    flash = false;
  const projectors = [];
  for (const side of [-1, 1]) {
    // Measured projector centres, expressed relative to the suspended body pivot.
    const light = new THREE.SpotLight(
      0xfff3df,
      lowBeamSettings.intensity,
      lowBeamSettings.range,
      lowBeamSettings.angle,
      0.08,
      2
    );
    light.name = side > 0 ? 'Left low beam' : 'Right low beam';
    light.position.set(2.24, 0.645 - 0.55, side * 0.685);
    light.map = pattern;
    // r180 updates cookie projection matrices without rendering shadow maps.
    light.castShadow = false;
    light.shadow.camera.near = 0.05;
    beams.add(light, light.target);
    projectors.push(light);
  }
  const correction = new THREE.Quaternion();
  const inverseBody = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  function update(dt) {
    // Projector centres follow suspension motion; their aim settles back to the
    // nominal dip, instead of pitching the beam above the road over each bump.
    inverseBody.copy(rig.body.quaternion).invert();
    correction.slerp(inverseBody, dt > 0 ? 1 - Math.exp(-Math.min(dt, 1 / 15) / 0.18) : 1);
    const slope = high ? highBeamSettings.downwardSlope : lowBeamSettings.downwardSlope;
    direction.set(1, -slope, 0).applyQuaternion(correction);
    for (const light of projectors)
      light.target.position.copy(light.position).addScaledVector(direction, 40);
  }
  update(0);
  function apply() {
    const settings = night && high ? highBeamSettings : lowBeamSettings;
    for (const light of projectors) {
      light.intensity = night ? settings.intensity : 0;
      // Out of the scene's lights by day: every lit pixel (the road above
      // all) would otherwise work out two dark projected lamps.
      light.visible = night;
      light.distance = settings.range;
      light.map = night && high ? highPattern : pattern;
    }
    // A flash by day shows only in the lenses, bright for a moment.
    lens.material.emissiveIntensity = night ? (high ? 6 : 4) : flash ? 7 : 0.8;
  }

  return {
    beams,
    lens,
    pattern,
    highPattern,
    projectors,
    update,
    // Switching the lamps' lights in and out changes every lit material's
    // program; both versions are compiled while the scene loads (see
    // warmNightPrograms in viewer.js), so the switch at dusk or in the tunnel
    // only swaps programs.
    get lit() {
      return projectors[0].intensity > 0;
    },
    get high() {
      return night && high;
    },
    // The pattern the lamps project now (the rain lights its drops by it).
    get currentPattern() {
      return projectors[0].map;
    },
    setNight(enabled) {
      night = enabled;
      apply();
    },
    // High beam: a different pattern on the same lamps, brighter and
    // reaching further; swapping textures needs no shader recompile.
    setHighBeam(enabled) {
      if (enabled === high) return;
      high = enabled;
      apply();
    },
    // Flashing the headlights: the main beam at night (setHighBeam), the
    // lenses lit up by day.
    setFlash(enabled) {
      if (enabled === flash) return;
      flash = enabled;
      apply();
    },
  };
}
