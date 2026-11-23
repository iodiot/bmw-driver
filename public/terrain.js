import * as THREE from 'three';
import { roadSeed, seededRandom } from './road-seed.js';

// Rolling country: the land rises and falls along the road in long, gentle
// hills, the motorway climbing and dropping with it at up to 4–5%, as
// motorways across the Ukrainian forest-steppe do. The height depends only
// on the distance along the road (x), so the fields, verges, bridges, the
// tunnel and everything beside the road rise and fall together, and it
// repeats with the 3 km sections, so each section's structures sit on the
// same ground every time.
//
// Everything drawn with three.js's own shaders is lifted on the GPU (see
// `installTerrainLift`): a vertex at x is raised by roadElevation(x). The
// car is placed and pitched on it by the simulation instead, and its own
// parts are left unlifted (`keepUnlifted`).
export const elevationPeriod = 3000;
const originalHills = [
  { amplitude: 4, harmonic: 1, phase: 0.4 },
  { amplitude: 3.5, harmonic: 3, phase: 2.1 },
  { amplitude: 2.2, harmonic: 5, phase: 4.0 },
  { amplitude: 0.8, harmonic: 8, phase: 1.3 },
];
// The steepest grade the road may have.
export const maxGrade = 0.05;
function drawnHills(random) {
  return originalHills.map((h) => ({
    ...h,
    amplitude: h.amplitude * (0.7 + 0.6 * random()),
    phase: random() * 2 * Math.PI,
  }));
}
const raw = roadSeed ? drawnHills(seededRandom(roadSeed, 4)) : originalHills;
const k = (harmonic) => (2 * Math.PI * harmonic) / elevationPeriod;
// Scaled so the sum of the terms' slopes (an upper bound on the grade)
// stays within maxGrade.
const bound = raw.reduce((s, h) => s + h.amplitude * k(h.harmonic), 0);
export const hills = Object.freeze(
  raw.map((h) =>
    Object.freeze({
      ...h,
      amplitude: bound > maxGrade ? (h.amplitude * maxGrade) / bound : h.amplitude,
    })
  )
);

const wrap = (x) => ((x % elevationPeriod) + elevationPeriod) % elevationPeriod;
// Height of the land (m) at x along the road.
export function roadElevation(x) {
  const u = wrap(x);
  let h = 0;
  for (const { amplitude, harmonic, phase } of hills)
    h += amplitude * Math.sin(k(harmonic) * u + phase);
  return h;
}
// Its slope dh/dx: the grade along the x axis.
export function roadGrade(x) {
  const u = wrap(x);
  let g = 0;
  for (const { amplitude, harmonic, phase } of hills)
    g += amplitude * k(harmonic) * Math.cos(k(harmonic) * u + phase);
  return g;
}

const f = (n) => Number(n).toFixed(7);
// The same height in GLSL, safe to include more than once.
export const terrainGLSL = `
#ifndef TERRAIN_LIFT
#define TERRAIN_LIFT
float terrainLift(float x) {
  float u = mod(x, ${f(elevationPeriod)});
  return ${hills.map((h) => `${f(h.amplitude)} * sin(${f(k(h.harmonic))} * u + ${f(h.phase)})`).join(' + ')};
}
#endif
`;

// Lifts every vertex drawn by three.js's own shaders (all the standard
// materials, lines, points and the shadow-map passes) by the land's height
// at its x, unless its material defines NO_TERRAIN_LIFT. Custom shader
// materials add terrainLift themselves where they draw on the ground.
let installed = false;
export function installTerrainLift() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk;
  chunks.common = chunks.common + '\n' + terrainGLSL;
  const projected = 'mvPosition = modelViewMatrix * mvPosition;';
  if (!chunks.project_vertex.includes(projected))
    throw new Error('Unexpected project_vertex chunk');
  chunks.project_vertex = chunks.project_vertex.replace(
    projected,
    `#ifdef NO_TERRAIN_LIFT
      mvPosition = modelViewMatrix * mvPosition;
    #else
      vec4 liftedPosition = modelMatrix * mvPosition;
      liftedPosition.y += terrainLift(liftedPosition.x);
      mvPosition = viewMatrix * liftedPosition;
    #endif`
  );
  const world = 'worldPosition = modelMatrix * worldPosition;';
  if (!chunks.worldpos_vertex.includes(world)) throw new Error('Unexpected worldpos_vertex chunk');
  chunks.worldpos_vertex = chunks.worldpos_vertex.replace(
    world,
    `${world}
    #ifndef NO_TERRAIN_LIFT
      worldPosition.y += terrainLift(worldPosition.x);
    #endif`
  );
}

// Leaves a model's parts unlifted (it is placed on the land as a whole), in
// its own drawing and in the sun's shadow map.
const unliftedDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
unliftedDepth.defines = { NO_TERRAIN_LIFT: '' };
export function keepUnlifted(root) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    for (const m of [o.material].flat()) {
      if (!m || done.has(m)) continue;
      // Shader materials of their own lift nothing unless they draw with
      // three.js's chunks.
      if (m.isShaderMaterial && !/project_vertex|worldpos_vertex/.test(m.vertexShader)) continue;
      done.add(m);
      m.defines = { ...(m.defines ?? {}), NO_TERRAIN_LIFT: '' };
      m.needsUpdate = true;
    }
    if (o.castShadow) o.customDepthMaterial = unliftedDepth;
  });
}
