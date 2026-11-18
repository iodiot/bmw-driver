import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ExhaustSimulation, exhaustOutlets } from '../public/exhaust.js';

function seededRandom() {
  let seed = 2471;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function state(speed = 0, throttle = 0.2) {
  return {
    outlets: exhaustOutlets.map((p) => new THREE.Vector3(...p)),
    direction: new THREE.Vector3(-1, 0, 0),
    vehicleVelocity: new THREE.Vector3(speed, 0, 0),
    throttle,
  };
}

function run(fps, throttle) {
  const simulation = new ExhaustSimulation(seededRandom());
  const input = state(0, throttle);
  for (let i = 0; i < fps * 3; i++) simulation.step(1 / fps, input);
  return { simulation, input };
}

const { simulation, input } = run(60, 0.2);
const live = simulation.particles.filter((p) => p.opacity > 0);
assert.ok(live.length > 150 && live.length < 512);
assert.ok(
  live.every((p) => p.position.x < -2.4),
  'Vapor must exit behind the rear bumper'
);
assert.ok(
  live.some((p) => p.position.y > 0.4),
  'Warm vapor should rise'
);
assert.ok(
  live.every((p) => p.opacity < 0.1),
  'The plume should stay translucent'
);
assert.ok(live.some((p) => p.position.z > 0.4) && live.some((p) => p.position.z < -0.4));
const paused = JSON.stringify(simulation.particles);
simulation.step(1 / 60, { ...input, enabled: false });
assert.equal(JSON.stringify(simulation.particles), paused, 'Pause must freeze the plume');

const vapor = live.find((p) => p.age > 0.5);
const previous = vapor.position.clone();
input.outlets.forEach((p) => p.add(new THREE.Vector3(1, 0, 2)));
simulation.step(1 / 60, input);
assert.ok(
  vapor.position.distanceTo(previous) < 0.1,
  'Existing vapor must not follow a moved emitter'
);

const idleStrength = live.reduce((sum, p) => sum + p.opacity, 0);
const underLoad = run(60, 1).simulation.particles.filter((p) => p.opacity > 0);
assert.ok(underLoad.reduce((sum, p) => sum + p.opacity, 0) > idleStrength * 1.3);
const counts = [30, 60, 144].map(
  (fps) => run(fps, 0.2).simulation.particles.filter((p) => p.opacity > 0).length
);
assert.ok(
  Math.max(...counts) - Math.min(...counts) < 12,
  'Emission density must be stable across frame rates'
);

const moving = new ExhaustSimulation(seededRandom());
const travel = state(30);
for (let i = 0; i < 60 * 20; i++) {
  travel.outlets.forEach((p) => (p.x += 30 / 60));
  moving.step(1 / 60, travel);
}
assert.equal(moving.particles.length, 512, 'Long runs must use a bounded particle pool');
assert.ok(moving.particles.every((p) => p.position.toArray().every(Number.isFinite)));
moving.reset();
assert.ok(moving.particles.every((p) => p.opacity === 0));
assert.equal(moving.previousOutlets, null, 'Restart must clear the old trail');
console.log(
  'Exhaust: four outlets, buoyancy, throttle response, world-space wake, pause, reset and bounded memory passed.'
);
