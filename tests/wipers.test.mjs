import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { WiperMotion, WindshieldWipeMask, wiperPose, wiperSpecs } from '../public/wipers.js';

test('Rain starts the wipers; switching it off finishes the cycle and parks at different frame rates', () => {
  for (const fps of [15, 30, 60, 144]) {
    const motion = new WiperMotion();
    motion.step(1 / fps, false);
    assert.equal(motion.active, false);
    for (let i = 0; i < Math.round(fps * 0.7); i++) motion.step(1 / fps, true, 20);
    assert.ok(motion.active && motion.sweep > 0.8);
    const before = motion.sweep;
    motion.step(0, false);
    assert.equal(motion.sweep, before);
    for (let i = 0; i < fps * 3; i++) motion.step(1 / fps, false);
    assert.equal(motion.active, false);
    assert.equal(motion.sweep, 0);
  }
});

test('The mask follows each blade and leaves unswept glass wet', () => {
  const mask = new WindshieldWipeMask(new THREE.Vector4(-0.85, -0.12, 1.7, 1.2));
  mask.clock.value = 5;
  for (const spec of wiperSpecs) {
    let previous = wiperPose(spec, 0);
    for (let i = 1; i <= 120; i++) {
      const current = wiperPose(spec, i / 120);
      mask.stamp(previous, current);
      assert.equal(mask.read(current.centre), 5);
      previous = current;
    }
  }
  for (const p of [
    [0, 0.87],
    [0.68, 0.72],
    [-0.73, 0.2],
  ])
    assert.equal(mask.read(new THREE.Vector2(...p)), -1000, 'Unswept corners stay wet');
  mask.clock.value = 8;
  const p = wiperPose(wiperSpecs[0], 0.5);
  mask.stamp(p, p);
  assert.equal(mask.read(p.centre), 8, 'The return pass refreshes the cleared strip');
});
