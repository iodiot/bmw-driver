import * as THREE from 'three';

// The season: summer, or winter with snow lying over the land. `winter`
// (0–1) eases between them over a few seconds and is shared by every
// shader that shows snow: the ground (road.js), the embankments
// (road-structures.js) and, through `addSnowCover`, everything standing
// on the land, whose upward faces (roofs, decks, rails, the traffic's
// roofs) are white with it.
export const seasons = Object.freeze(['summer', 'winter']);
export const seasonUniforms = { winterCover: { value: 0 } };
export const snowColour = Object.freeze([0.9, 0.92, 0.96]);

// What winter changes besides the look: grip on snow and packed ice (a
// share of the dry asphalt's), and how fast the traffic and the autopilot
// go.
// (`autopilotSpeed`: its 90 km/h in the right-hand lanes; `autopilotPace`:
// its pace in the left one.)
export const winterDriving = Object.freeze({
  grip: 0.6,
  trafficSpeed: 0.82,
  autopilotSpeed: 0.8,
  autopilotPace: 0.7,
});

// Snow on a material's upward faces as winter sets in.
export function addSnowCover(material) {
  if (material.userData.snowCover) return;
  material.userData.snowCover = true;
  const before = material.onBeforeCompile,
    key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.uniforms.winterCover = seasonUniforms.winterCover;
    if (!shader.fragmentShader.includes('#include <normal_fragment_maps>')) return;
    shader.fragmentShader =
      'uniform float winterCover;\n' +
      shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (winterCover > 0.) {
          // Snow lies where the surface faces up, thicker the flatter it is.
          vec3 upward = inverseTransformDirection(normal, viewMatrix);
          float snowLying = winterCover * smoothstep(.42, .78, upward.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${snowColour.map((v) => v.toFixed(2)).join(', ')}), snowLying);
          #ifdef STANDARD
            roughnessFactor = mix(roughnessFactor, .85, snowLying);
            metalnessFactor = mix(metalnessFactor, 0., snowLying);
          #endif
        }`
      );
  };
  material.customProgramCacheKey = () => `${key ? key.call(material) : ''}|snow-cover`;
  material.needsUpdate = true;
}

// Snow cover on every lit material in the scene except those under
// `except` (the car, which drives through it) and those that draw the land
// themselves.
export function snowOnScene(scene, except = []) {
  const skip = new Set();
  for (const root of except) root?.traverse((o) => skip.add(o));
  scene.traverse((o) => {
    if (!o.isMesh || skip.has(o) || o.name === 'Asphalt ground') return;
    for (const m of [o.material].flat())
      if (
        m &&
        !m.isShaderMaterial &&
        (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)
      )
        addSnowCover(m);
  });
}

// Eases the cover toward the season over `seconds`.
export function stepSeason(dt, winter, seconds = 3) {
  const target = winter ? 1 : 0,
    u = seasonUniforms.winterCover;
  u.value += Math.sign(target - u.value) * Math.min(Math.abs(target - u.value), dt / seconds);
  return u.value;
}
