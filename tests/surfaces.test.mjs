import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrivingSimulation } from '../public/driving-physics.js';
import {
  road,
  roadBranch,
  roadCenterZ,
  roadCenterSlope,
  surfaceAt,
  surfaceRoughness,
  surfaces,
  branchOffset,
} from '../public/road-profile.js';
import { dustRate } from '../public/dust.js';

const place = (sim, x, lateral) => {
  sim.x = x;
  sim.z = roadCenterZ(x) + lateral;
  sim.heading = -Math.atan(roadCenterSlope(x));
};

test('Asphalt, gravel shoulders, the paved country road and grass', () => {
  const x = 2000;
  assert.equal(surfaceAt(x, roadCenterZ(x) + 3.6), 'asphalt');
  assert.equal(surfaceAt(x, roadCenterZ(x) + 7), 'gravel');
  assert.equal(surfaceAt(x, roadCenterZ(x) - 25), 'grass');
  const bx = roadBranch.start + roadBranch.diverge + 100;
  assert.equal(surfaceAt(bx, roadCenterZ(bx) + branchOffset(bx)), 'asphalt');
  // Loose and soft ground grips less and drags more; wet dirt is mud.
  assert.ok(surfaces.grass.grip < surfaces.dirt.grip && surfaces.dirt.grip < surfaces.asphalt.grip);
  assert.ok(surfaces.dirt.wetGrip < surfaces.asphalt.wetGrip);
  assert.ok(
    surfaces.grass.rolling > surfaces.dirt.rolling &&
      surfaces.dirt.rolling > surfaces.asphalt.rolling
  );
  // Bumps off the asphalt only.
  let bumps = 0;
  for (let i = 0; i < 200; i++) {
    assert.equal(surfaceRoughness(x + i * 0.3, roadCenterZ(x) + 1), 0);
    bumps = Math.max(bumps, Math.abs(surfaceRoughness(x + i * 0.3, roadCenterZ(x) - 25)));
  }
  assert.ok(bumps > 0.015 && bumps < 0.04);
});

test('On grass the car launches slower, tops out lower and slides wider', () => {
  const run = (lateral) => {
    const sim = new DrivingSimulation(undefined, road);
    sim.reset(0);
    place(sim, 1800, lateral);
    for (let t = 0; t < 6; t += 1 / 60) sim.step(1 / 60, { accelerate: true }, true);
    const launched = sim.speed;
    let maxLateral = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      sim.step(1 / 60, { left: true }, true);
      maxLateral = Math.max(maxLateral, Math.abs(sim.lateralAcceleration));
    }
    return { launched, maxLateral, surface: sim.surfaceName };
  };
  const asphalt = run(1.8),
    grass = run(-40);
  assert.equal(grass.surface, 'grass');
  assert.ok(grass.launched < asphalt.launched * 0.8, `${grass.launched} vs ${asphalt.launched}`);
  assert.ok(grass.maxLateral < asphalt.maxLateral * 0.7, 'Less cornering grip on grass');
});

test('The suspension works over the bumps off the asphalt', () => {
  const travel = (lateral) => {
    const sim = new DrivingSimulation(undefined, road);
    sim.reset(15);
    place(sim, 1900, lateral);
    let moved = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      sim.step(1 / 60, {}, true);
      if (t > 0.5)
        moved = Math.max(moved, ...sim.wheels.map((w) => Math.abs(w.compressionVelocity)));
    }
    return moved;
  };
  // Across a field at about 50 km/h the wheels work over the bumps (the
  // asphalt lanes have their own potholes and bumps, so no comparison here).
  assert.ok(travel(-30) > 0.3, 'Grass shakes the car');
});

test('Dust rises off dry dirt at speed, not off asphalt or wet ground', () => {
  assert.equal(dustRate('asphalt', 30), 0);
  assert.equal(dustRate('dirt', 1), 0);
  assert.ok(
    dustRate('dirt', 25) > dustRate('gravel', 25) && dustRate('gravel', 25) > dustRate('grass', 25)
  );
  assert.equal(dustRate('dirt', 25, 1), 0);
});
