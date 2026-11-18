import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { DrivingSimulation } from '../public/driving-physics.js';
import { brakingMarkStrength, setupSkidMarks } from '../public/skid-marks.js';
import { roadHeight } from '../public/road-profile.js';

const dry = { enabled: true, braking: true, raining: false };
function state() {
  const sim = new DrivingSimulation();
  sim.reset(25);
  sim.acceleration = -13;
  sim.brakePressure = 1;
  return sim;
}

test('Preparing the trail draw pipeline restores visibility and segment counts, including on errors', () => {
  const scene = new THREE.Scene(),
    sim = state(),
    marks = setupSkidMarks(scene, sim.layout);
  let calls = 0;
  marks.warmup(
    {
      render(actualScene) {
        calls++;
        assert.equal(actualScene, scene);
        assert.equal(marks.mesh.visible, true);
        assert.equal(marks.geometry.instanceCount, 1);
        assert.equal(marks.geometry.attributes.markStrength.getX(0), 0);
      },
    },
    {},
    scene
  );
  assert.equal(calls, 1);
  assert.equal(marks.mesh.visible, false);
  assert.equal(marks.geometry.instanceCount, 0);
  assert.throws(() =>
    marks.warmup(
      {
        render() {
          throw new Error('Context lost');
        },
      },
      {},
      scene
    )
  );
  assert.equal(marks.mesh.visible, false);
  assert.equal(marks.geometry.instanceCount, 0);
  assert.equal(marks.count, 0);
});

test('Tyre deposits require hard braking, speed, load and contact; rain makes them lighter', () => {
  const sim = state(),
    wheel = sim.wheels[0];
  const strength = brakingMarkStrength(wheel, sim, dry);
  assert.ok(strength > 0.15 && strength < 0.4);
  assert.ok(brakingMarkStrength(wheel, sim, { ...dry, raining: true }) < strength * 0.4);
  for (const options of [
    { ...dry, enabled: false },
    { ...dry, braking: false },
  ])
    assert.equal(brakingMarkStrength(wheel, sim, options), 0);
  assert.equal(brakingMarkStrength({ ...wheel, contact: false }, sim, dry), 0);
  assert.equal(brakingMarkStrength({ ...wheel, load: 0 }, sim, dry), 0);
  assert.equal(brakingMarkStrength(wheel, { ...sim, speed: 0 }, dry), 0);
  assert.equal(brakingMarkStrength(wheel, { ...sim, acceleration: -3 }, dry), 0);
  assert.equal(brakingMarkStrength(wheel, { ...sim, acceleration: -8.5 }, dry), 0);
  assert.equal(brakingMarkStrength(wheel, { ...sim, brakePressure: 0.7 }, dry), 0);
  assert.equal(brakingMarkStrength(wheel, { ...sim, speed: 30 / 3.6 }, dry), 0);
  assert.ok(
    brakingMarkStrength(wheel, { ...sim, acceleration: -5.5 }, { ...dry, raining: true }) > 0,
    'A hard wet stop can still leave a faint trace despite its lower available grip'
  );
  assert.equal(
    brakingMarkStrength({ ...wheel, slip: 0.2 }, { ...sim, acceleration: -5 }, dry),
    0,
    'Ordinary braking while turning must not bypass the hard-braking threshold'
  );
});

test('Short brake taps and low-speed stops leave clean asphalt; sustained emergency braking leaves traces', () => {
  for (const fps of [30, 60, 144]) {
    for (const speed of [30, 100]) {
      const sim = new DrivingSimulation(),
        marks = setupSkidMarks(new THREE.Scene(), sim.layout);
      sim.reset(speed / 3.6);
      for (let tap = 0; tap < 3; tap++) {
        for (let i = 0; i < Math.ceil(fps * 0.2); i++) {
          sim.step(1 / fps, { brake: true });
          marks.update(1 / fps, sim, dry);
        }
        sim.step(1 / fps, {});
        marks.update(1 / fps, sim, { ...dry, braking: false });
        assert.equal(sim.brakePressure, 0);
      }
      assert.equal(marks.count, 0, `${fps} fps / ${speed} km/h: repeated taps must not draw marks`);
    }
    const sim = new DrivingSimulation(),
      marks = setupSkidMarks(new THREE.Scene(), sim.layout);
    sim.reset(30 / 3.6);
    for (let i = 0; i < fps * 2; i++) {
      sim.step(1 / fps, { brake: true });
      marks.update(1 / fps, sim, dry);
    }
    assert.equal(marks.count, 0, 'A normal low-speed stop must leave no trace');
    sim.reset(100 / 3.6);
    marks.reset();
    for (let i = 0; i < fps * 2; i++) {
      sim.step(1 / fps, { brake: true });
      marks.update(1 / fps, sim, dry);
    }
    assert.ok(
      marks.count > 100,
      'Holding the pedal at speed must still leave strong braking marks'
    );
  }
});

test('Instanced trails stay in world space, conform to asphalt and do not bridge jumps or teleports', () => {
  const scene = new THREE.Scene(),
    sim = state(),
    marks = setupSkidMarks(scene, sim.layout);
  marks.update(1 / 60, sim, dry);
  for (let i = 1; i <= 60; i++) {
    sim.x = i * 0.24;
    marks.update(1 / 60, sim, dry);
  }
  assert.ok(marks.count > 100 && marks.mesh.visible);
  assert.equal(scene.children.length, 1);
  assert.ok(marks.geometry.isInstancedBufferGeometry);
  const a = marks.geometry.attributes.markStart,
    b = marks.geometry.attributes.markEnd;
  for (let i = 0; i < marks.count; i++) {
    assert.ok(Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i)) <= 0.181);
    assert.ok(Math.abs(roadHeight(a.getX(i), a.getY(i))) < 0.012);
    assert.ok(Math.abs(roadHeight(b.getX(i), b.getY(i))) < 0.012);
  }
  const first = [a.getX(0), a.getY(0)],
    before = marks.count;
  sim.x += 100;
  marks.update(1 / 60, sim, dry);
  assert.equal(marks.count, before);
  assert.deepEqual([a.getX(0), a.getY(0)], first, 'Moving the car cannot drag existing marks');
  sim.wheels.forEach((w) => {
    w.contact = false;
    w.load = 0;
  });
  sim.x += 0.3;
  marks.update(1 / 60, sim, dry);
  assert.equal(marks.count, before);
  marks.reset();
  assert.equal(marks.count, 0);
  assert.equal(marks.geometry.instanceCount, 0);
  assert.equal(marks.mesh.visible, false);
});

test('Large trail writes wrap the fixed GPU buffer without out-of-bounds upload ranges', () => {
  const sim = state(),
    marks = setupSkidMarks(new THREE.Scene(), sim.layout, 16);
  sim.speed = 60;
  marks.update(1 / 15, sim, dry);
  for (let i = 0; i < 8; i++) {
    sim.x += 2.5;
    marks.update(1 / 15, sim, dry);
    assert.equal(marks.count, 16);
    for (const [name, attribute] of Object.entries(marks.geometry.attributes)) {
      if (!name.startsWith('mark')) continue;
      assert.ok(attribute.updateRanges.length > 0 && attribute.updateRanges.length <= 2);
      for (const range of attribute.updateRanges) {
        assert.ok(range.start >= 0 && range.count > 0);
        assert.ok(range.start + range.count <= attribute.array.length);
      }
      assert.ok([...attribute.array].every(Number.isFinite));
    }
  }
});

test('The mark buffer is bounded, quiet frames do not upload it, and old marks fade away', () => {
  const sim = state(),
    marks = setupSkidMarks(new THREE.Scene(), sim.layout, 64);
  const array = marks.geometry.attributes.markStart.array;
  marks.update(1 / 60, sim, dry);
  for (let i = 1; i < 100; i++) {
    sim.x = i * 0.3;
    marks.update(1 / 60, sim, dry);
  }
  assert.equal(marks.count, 64);
  assert.equal(marks.geometry.instanceCount, 64);
  assert.equal(marks.geometry.attributes.markStart.array, array);
  assert.ok([...array].every(Number.isFinite));
  const version = marks.geometry.attributes.markStart.version;
  for (let i = 0; i < 4000; i++) marks.update(1 / 60, sim, { ...dry, enabled: false });
  assert.equal(marks.geometry.attributes.markStart.version, version);
  assert.equal(marks.mesh.visible, false);
});

test('Actual braking produces trails at different frame rates while cruising does not', () => {
  for (const fps of [30, 60, 144]) {
    const sim = new DrivingSimulation(),
      marks = setupSkidMarks(new THREE.Scene(), sim.layout);
    for (let i = 0; i < fps; i++) {
      sim.step(1 / fps);
      marks.update(1 / fps, sim, { ...dry, braking: false });
    }
    assert.equal(marks.count, 0);
    sim.reset(30);
    marks.reset();
    for (let i = 0; i < fps * 3; i++) {
      sim.step(1 / fps, { brake: true });
      marks.update(1 / fps, sim, dry);
    }
    assert.ok(marks.count > 100, `${fps} fps must leave braking traces`);
    const count = marks.count;
    for (let i = 0; i < fps; i++) {
      sim.step(1 / fps, { brake: true });
      marks.update(1 / fps, sim, dry);
    }
    assert.equal(marks.count, count, 'Holding the brake at rest must not stack dark marks');
  }
});
