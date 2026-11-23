import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DriftScore, driftRate, driftRules } from '../public/drift.js';
import { DrivingSimulation } from '../public/driving-physics.js';
import { straightTestTrack } from '../public/road-profile.js';

function memory() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
}
const run = (score, seconds, state, dt = 1 / 60) => {
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    const e = score.update(dt, state);
    if (e) events.push(e);
  }
  return events;
};

test('A held drift scores by angle and speed, its multiplier climbing', () => {
  const score = new DriftScore({ storage: memory() });
  run(score, 3, { angle: 30, speed: 80 });
  assert.ok(score.active);
  assert.equal(score.multiplier, 2, 'Held 2.5 s: ×2');
  assert.ok(Math.abs(score.points - driftRate(30, 80) * 3) < driftRate(30, 80) / 30);
  // A flick to the other side adds half.
  run(score, 0.5, { angle: -25, speed: 80 });
  assert.equal(score.multiplier, 2.5);
  // Straightening up ends it after the chain time, banking the points.
  const [end] = run(score, driftRules.chain + 0.2, { angle: 2, speed: 80 });
  assert.equal(end.kind, 'drift');
  assert.ok(end.points > 0 && end.record);
  assert.equal(score.best, end.points);
});

test('Drifts link within the chain time, and a hit loses the lot', () => {
  const score = new DriftScore({ storage: memory() });
  run(score, 1, { angle: 20, speed: 70 });
  const linked = run(score, driftRules.chain * 0.6, { angle: 3, speed: 70 });
  assert.equal(linked.length, 0, 'Still the same drift');
  run(score, 1, { angle: 20, speed: 70 });
  const [wipe] = run(score, 1 / 60, { angle: 20, speed: 70, crashed: true });
  assert.equal(wipe.kind, 'wipeout');
  assert.equal(score.active, false);
  // Too slow, or on autopilot: no drift.
  run(score, 2, { angle: 30, speed: 20 });
  assert.equal(score.active, false);
  run(score, 2, { angle: 30, speed: 80, manual: false });
  assert.equal(score.active, false);
});

test('With DSC off the car can be held sideways; with it on it cannot', () => {
  const slide = (off) => {
    const sim = new DrivingSimulation(undefined, straightTestTrack);
    sim.dscOff = off;
    sim.reset(60 / 3.6);
    sim.z = 300;
    let max = 0;
    for (let t = 0; t < 6; t += 1 / 60) {
      const input =
        t < 0.6
          ? { left: true, accelerate: true }
          : { accelerate: true, steerAxis: Math.max(-1, Math.min(1, -sim.slipAngle * 2.2 + 0.25)) };
      sim.step(1 / 60, input);
      max = Math.max(max, Math.abs(sim.slipAngle) * 57.3);
    }
    return max;
  };
  assert.ok(slide(false) < 8);
  assert.ok(slide(true) > 20);
});
