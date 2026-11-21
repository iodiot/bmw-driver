import assert from 'node:assert/strict';
import { straightTestTrack } from '../public/road-profile.js';
import { test } from 'node:test';
import { DrivingSimulation, suspensionSpecifications } from '../public/driving-physics.js';
import { wheelCorner } from '../public/suspension-display.js';

test('Wheel loads represent actual tyre support forces, including zero load in the air', () => {
  const sim = new DrivingSimulation(undefined, straightTestTrack);
  const totalWeight =
    (suspensionSpecifications.sprungMass + suspensionSpecifications.wheelMass * 4) * 9.81;
  assert.ok(Math.abs(sim.wheels.reduce((sum, w) => sum + w.load, 0) - totalWeight) < 1e-8);
  assert.deepEqual(sim.wheels.map(wheelCorner), ['FL', 'FR', 'RL', 'RR']);
  let unequalLoads = false,
    airborne = false,
    compressing = false,
    extending = false;
  for (let i = 0; i < 60 * 12; i++) {
    sim.step(1 / 60);
    unequalLoads ||= Math.abs(sim.wheels[0].load - sim.wheels[1].load) > 500;
    for (const wheel of sim.wheels) {
      assert.ok(Number.isFinite(wheel.load) && wheel.load >= 0);
      assert.equal(
        wheel.damperForce,
        suspensionSpecifications.dampingRate * wheel.compressionVelocity
      );
      if (!wheel.contact) {
        airborne = true;
        assert.equal(wheel.load, 0, 'A wheel off the road cannot support ground load');
      }
      compressing ||= wheel.compressionVelocity > 0.05;
      extending ||= wheel.compressionVelocity < -0.05;
    }
  }
  assert.ok(unequalLoads && airborne && compressing && extending);
  const before = sim.wheels.map(({ load, compression, damperForce }) => ({
    load,
    compression,
    damperForce,
  }));
  sim.step(1 / 60, {}, false);
  assert.deepEqual(
    sim.wheels.map(({ load, compression, damperForce }) => ({ load, compression, damperForce })),
    before
  );
});
