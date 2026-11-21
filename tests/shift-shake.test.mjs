import assert from 'node:assert/strict';
import { straightTestTrack } from '../public/road-profile.js';
import { test } from 'node:test';
import * as THREE from 'three';
import { GearShiftShake } from '../public/shift-shake.js';
import { DrivingSimulation } from '../public/driving-physics.js';

test('Actual acceleration shifts give a short bounded impulse, braking downshifts give a weaker one', () => {
  for (const fps of [30, 60, 144]) {
    const sim = new DrivingSimulation(undefined, straightTestTrack),
      shake = new GearShiftShake();
    shake.update(1 / fps, sim.powertrain.gear);
    assert.equal(shake.events, 0, 'Loading the initial D3 must not shake the camera');
    let upStrength = 0,
      downStrength = 0;
    for (let i = 0; i < fps * 9; i++) {
      const braking = i >= fps * 6;
      sim.step(1 / fps, { accelerate: !braking, brake: braking });
      const count = shake.events;
      shake.update(1 / fps, sim.powertrain.gear, {
        accelerate: !braking,
        brake: braking,
        speed: sim.speed,
      });
      assert.ok(Math.abs(shake.x) <= 0.65 && Math.abs(shake.y) <= 2.4);
      if (shake.events > count) {
        if (shake.lastKind === 'upshift') upStrength = shake.lastStrength;
        if (shake.lastKind === 'braking-downshift') downStrength = shake.lastStrength;
      }
    }
    assert.ok(upStrength > downStrength * 2.5 && downStrength > 0);
    for (let i = 0; i < fps; i++) shake.update(1 / fps, sim.powertrain.gear);
    assert.equal(shake.x, 0);
    assert.equal(shake.y, 0);
    const count = shake.events;
    shake.update(1 / fps, 7, { enabled: false, accelerate: true });
    assert.equal(shake.events, count);
    assert.equal(shake.x, 0);
    shake.reset(3);
    shake.update(1 / fps, 3, { accelerate: true });
    assert.equal(shake.events, 0, 'Restart cannot create a false shift impulse');
  }
});

test('Projection shake does not move the camera or accumulate changes to its base projection', () => {
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.05, 600);
  camera.position.set(4.8, 1.9, 5.6);
  camera.lookAt(0, 0.75, 0);
  const position = camera.position.clone(),
    rotation = camera.quaternion.clone(),
    base = camera.projectionMatrix.clone();
  const shake = new GearShiftShake();
  shake.update(1 / 60, 1);
  shake.update(1 / 60, 2, { accelerate: true, speed: 20 });
  shake.apply(camera, 1280, 720);
  assert.notDeepEqual(camera.projectionMatrix.elements, base.elements);
  for (let i = 0; i < 60; i++) {
    shake.update(1 / 60, 2);
    shake.apply(camera, 1280, 720);
  }
  assert.deepEqual(camera.projectionMatrix.elements, base.elements);
  assert.ok(camera.position.equals(position) && camera.quaternion.equals(rotation));
  shake.update(1 / 60, 3, { accelerate: true });
  shake.apply(camera, 1280, 720);
  shake.update(1 / 60, 3, { enabled: false });
  shake.apply(camera, 1280, 720);
  assert.deepEqual(camera.projectionMatrix.elements, base.elements, 'Pause clears an active jolt');
});
