import assert from 'node:assert/strict';
import { test } from 'node:test';
import { straightTestTrack } from '../public/road-profile.js';
import { DrivingSimulation, reverseGear } from '../public/driving-physics.js';

const run = (sim, seconds, input) => {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, input);
};
function stopped() {
  const sim = new DrivingSimulation(undefined, straightTestTrack);
  sim.reset(15);
  sim.z = 300;
  // Brake to a standstill, still holding the pedal.
  for (let i = 0; i < 600 && sim.speed > 0; i++) sim.step(1 / 60, { brake: true });
  return sim;
}

test('Pressing the brake again at a standstill selects reverse and backs the car up', () => {
  const sim = stopped();
  assert.equal(sim.speed, 0);
  assert.equal(sim.reversing, false, 'braking to a stop does not select R at once');
  run(sim, 0.3, {});
  run(sim, 0.2, { brake: true });
  assert.equal(sim.reversing, true);
  assert.equal(sim.gearLabel, 'R');
  const x = sim.x;
  run(sim, 6, { brake: true });
  assert.ok(sim.x < x - 15, 'it drives backward');
  assert.ok(sim.speed <= reverseGear.topSpeed + 1e-9 && sim.speed > reverseGear.topSpeed * 0.8);
  assert.ok(sim.forwardSpeed < 0);
  assert.ok(Math.abs(sim.z - 300) < 1e-6 && sim.heading === 0, 'straight back');
  // The accelerator brakes it, then (from a standstill) selects D again.
  for (let i = 0; i < 180 && sim.speed > 0; i++) sim.step(1 / 60, { accelerate: true });
  assert.equal(sim.speed, 0);
  assert.equal(sim.reversing, true);
  run(sim, 0.2, {});
  run(sim, 3, { accelerate: true });
  assert.equal(sim.reversing, false);
  assert.ok(sim.speed > 5 && sim.gearLabel.startsWith('D'));
});

test('Holding the brake after stopping selects reverse after a second; steering turns the other way', () => {
  const sim = stopped();
  run(sim, reverseGear.engage + 0.05, { brake: true });
  assert.equal(sim.reversing, true);
  run(sim, 2, { brake: true, left: true });
  // Backing up with the wheel turned left swings the nose right.
  assert.ok(sim.heading < -0.05);
});
