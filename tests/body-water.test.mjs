import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BodyWaterState, setupBodyWater } from '../public/body-water.js';

function advance(state, seconds, options, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) state.step(1 / fps, options);
  return state;
}

const parked = advance(new BodyWaterState(), 5, { raining: true, speed: 0 });
assert.ok(parked.wetness > 0.9);
assert.ok(Math.abs(parked.flow.x) < 1e-8 && parked.flow.y < 0);
const fast = advance(new BodyWaterState(), 5, { raining: true, speed: 30 });
assert.ok(fast.flow.x < -0.5, 'Airflow must move water toward the back of the car');
assert.ok(fast.wetness < parked.wetness, 'Speed should shed a portion of the accumulated beads');
const wet = parked.wetness;
advance(parked, 1, { raining: false, speed: 0 });
assert.ok(parked.wetness > wet * 0.9, 'Drops must remain when rain is switched off');
const slowDry = new BodyWaterState(),
  fastDry = new BodyWaterState();
slowDry.wetness = fastDry.wetness = 1;
advance(slowDry, 10, { raining: false, speed: 0 });
advance(fastDry, 10, { raining: false, speed: 35 });
assert.ok(fastDry.wetness < slowDry.wetness * 0.5);
advance(fastDry, 120, { raining: false, speed: 35 });
assert.equal(fastDry.wetness, 0);
const wetnessAtRates = [30, 60, 144].map(
  (fps) => advance(new BodyWaterState(), 5, { raining: true, speed: 25 }, fps).wetness
);
assert.ok(Math.max(...wetnessAtRates) - Math.min(...wetnessAtRates) < 0.001);

const root = new THREE.Group(),
  body = new THREE.Group();
root.add(body);
body.position.y = 0.55;
const material = new THREE.MeshPhysicalMaterial({ clearcoat: 0.85, clearcoatRoughness: 0.16 });
material.name = 'M5_F10_Paint';
const painted = new THREE.Mesh(new THREE.BoxGeometry(), material);
painted.position.set(1, 0.5, 0.1);
body.add(painted);
const trim = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
body.add(trim);
const glassMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.47 });
glassMaterial.name = 'Glass_Parts';
const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), glassMaterial);
glass.position.set(0, 0.65, 0.75);
body.add(glass);
const originalGlassPositions = Array.from(glass.geometry.attributes.position.array);
const originalPositions = Array.from(painted.geometry.attributes.position.array);
const originalNormals = Array.from(painted.geometry.attributes.normal.array);
const originalUVs = Array.from(painted.geometry.attributes.uv.array);
const water = setupBodyWater({ root, body });
assert.equal(water.meshes.length, 2);
assert.equal(water.glassMeshes.length, 1);
assert.notEqual(
  glass.material,
  glassMaterial,
  'Glass surface effects must be isolated from other shared parts'
);
assert.equal(glass.material.transparent, true);
assert.equal(glass.material.opacity, 0.47);
assert.deepEqual(Array.from(glass.geometry.attributes.position.array), originalGlassPositions);
assert.ok(glass.geometry.attributes.waterPosition && glass.geometry.attributes.waterNormal);
assert.equal(
  trim.geometry.attributes.waterPosition,
  undefined,
  'Water must only affect paint and glass surfaces'
);
assert.deepEqual(Array.from(painted.geometry.attributes.position.array), originalPositions);
assert.deepEqual(Array.from(painted.geometry.attributes.normal.array), originalNormals);
assert.deepEqual(Array.from(painted.geometry.attributes.uv.array), originalUVs);
const local = new THREE.Vector3().fromBufferAttribute(painted.geometry.attributes.waterPosition, 0);
const expected = new THREE.Vector3()
  .fromBufferAttribute(painted.geometry.attributes.position, 0)
  .add(painted.position);
assert.ok(local.distanceTo(expected) < 1e-6, 'Drops must use body coordinates and remain attached');
for (let i = 0; i < 300; i++) water.update(1 / 60, { raining: true, speed: 8 });
assert.ok(material.clearcoat > 0.95 && material.clearcoatRoughness < 0.1);
for (let i = 0; i < 18000; i++) water.update(1 / 60, { raining: false, speed: 35 });
assert.equal(material.clearcoat, 0.85);
assert.equal(material.clearcoatRoughness, 0.16);
assert.equal(glass.material.opacity, 0.47, 'Drying must retain the original glass transparency');
console.log(
  'Body water: accumulation, retention, gravity, speed-dependent runoff, drying and unchanged paint geometry passed.'
);
