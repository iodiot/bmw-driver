import * as THREE from 'three';
import { roadSeed, seededRandom } from './road-seed.js';
import { route, routeGLSL } from './route.js';

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
  // (On the route: the real land's height.)
  if (route) return route.height(x);
  const u = wrap(x);
  let h = 0;
  for (const { amplitude, harmonic, phase } of hills)
    h += amplitude * Math.sin(k(harmonic) * u + phase);
  return h;
}
// Its slope dh/dx: the grade along the x axis.
export function roadGrade(x) {
  if (route) return route.grade(x);
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
${
  route
    ? `${routeGLSL}
float terrainLift(float x) {
  return routeAt(x).y;
}`
    : `float terrainLift(float x) {
  float u = mod(x, ${f(elevationPeriod)});
  return ${hills.map((h) => `${f(h.amplitude)} * sin(${f(k(h.harmonic))} * u + ${f(h.phase)})`).join(' + ')};
}`
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
  // On the route every material reads the land from the route's texture:
  // three.js's own get it with their standard uniforms.
  if (route)
    for (const shader of Object.values(THREE.ShaderLib))
      shader.uniforms.routeMap = { value: route.texture };
  // Culling: three.js tests each object's bounds where they are before the
  // lift, so on a rise or a dip a sign or a pole could be judged out of view
  // and vanish in front of the car. The bounds are lifted as the shader
  // lifts the vertices (and widened by the grade across a large one), except
  // for whatever is drawn unlifted (the car, its own shader effects).
  const lifted = new THREE.Sphere();
  let liftNext = true;
  const drawnUnlifted = (m) =>
    Boolean(m) &&
    ((m.defines && 'NO_TERRAIN_LIFT' in m.defines) ||
      (m.isShaderMaterial && !/project_vertex|worldpos_vertex|terrainLift/.test(m.vertexShader)));
  const frustum = THREE.Frustum.prototype,
    intersectsObject = frustum.intersectsObject,
    intersectsSphere = frustum.intersectsSphere;
  frustum.intersectsObject = function (object) {
    liftNext = ![object.material].flat().some(drawnUnlifted);
    try {
      return intersectsObject.call(this, object);
    } finally {
      liftNext = true;
    }
  };
  frustum.intersectsSphere = function (sphere) {
    if (!liftNext) return intersectsSphere.call(this, sphere);
    lifted.center.copy(sphere.center);
    lifted.center.y += roadElevation(sphere.center.x);
    lifted.radius = sphere.radius * (1 + maxGrade);
    return intersectsSphere.call(this, lifted);
  };
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
