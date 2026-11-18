import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrivingSimulation } from '../public/driving-physics.js';
import { TyreDynamics } from '../public/tyre-dynamics.js';
import { brakingMarkStrength } from '../public/skid-marks.js';

function simulation(speed = 22) {
  const sim = new DrivingSimulation();
  sim.reset(speed);
  // Smooth asphalt avoids conflating suspension obstacle kicks with cornering.
  sim.z = 300;
  return sim;
}

function maneuver(fps, raining, brake = false, right = false) {
  const sim = simulation();
  for (let i = 0; i < fps * 2; i++) sim.step(1 / fps, {}, true, { raining });
  let peak = 0,
    intervention = false,
    marks = false;
  for (let i = 0; i < fps * 1.5; i++) {
    sim.step(1 / fps, { left: !right, right, accelerate: !brake, brake }, true, { raining });
    peak = Math.max(peak, Math.abs(sim.slipAngle));
    intervention ||= sim.dscActive;
    marks ||= sim.wheels.some(
      (w) => brakingMarkStrength(w, sim, { enabled: true, braking: brake, raining }) > 0.001
    );
    assert.ok(
      [
        sim.speed,
        sim.heading,
        sim.x,
        sim.z,
        sim.roll,
        sim.pitch,
        sim.yawRate,
        sim.lateralVelocity,
      ].every(Number.isFinite)
    );
  }
  const heading = sim.heading;
  for (let i = 0; i < fps * 6; i++) sim.step(1 / fps, {}, true, { raining });
  assert.ok(Math.abs(sim.slipAngle) < 0.005, 'Releasing the steering and throttle recovers grip');
  assert.ok(Math.abs(sim.yawRate) < 0.01);
  assert.equal(sim.dscActive, false);
  return { peak, intervention, marks, heading };
}

test('Dry slides remain light; wet slides grow and DSC recovers them at different frame rates', () => {
  const readings = [];
  for (const fps of [30, 60, 144]) {
    const dry = maneuver(fps, false);
    const wet = maneuver(fps, true);
    const dryBrake = maneuver(fps, false, true);
    const wetBrake = maneuver(fps, true, true);
    assert.ok(dry.peak > 0.025 && dry.peak < 0.09);
    assert.ok(wet.peak > dry.peak * 1.15 && wet.peak < 0.18);
    assert.ok(dryBrake.peak < 0.11);
    assert.ok(wetBrake.peak > dryBrake.peak * 1.5 && wetBrake.peak < 0.3);
    assert.ok(
      dry.intervention && wet.intervention && dryBrake.intervention && wetBrake.intervention
    );
    assert.ok(wet.marks, 'Cornering scrub can leave traces without pressing the brake');
    readings.push([dry.peak, wet.peak, dryBrake.peak, wetBrake.peak]);
  }
  for (let i = 0; i < 4; i++)
    assert.ok(
      Math.max(...readings.map((r) => r[i])) - Math.min(...readings.map((r) => r[i])) < 0.006
    );
});

test('Straight cruising never wiggles or flashes DSC; wet traction reduces acceleration and braking', () => {
  for (const raining of [false, true]) {
    const sim = simulation();
    for (let i = 0; i < 600; i++) sim.step(1 / 60, {}, true, { raining });
    assert.equal(sim.heading, 0);
    assert.equal(sim.z, 300);
    assert.equal(sim.lateralVelocity, 0);
    assert.equal(sim.dscActive, false);
  }
  const dry = simulation(0),
    wet = simulation(0);
  let wetDsc = false;
  for (let i = 0; i < 240; i++) {
    dry.step(1 / 60, { accelerate: true });
    wet.step(1 / 60, { accelerate: true }, true, { raining: true });
    wetDsc ||= wet.dscActive;
  }
  assert.ok(wet.speed < dry.speed * 0.8);
  assert.ok(wetDsc, 'Traction control signals its reduction of excess rear-wheel drive');
  const stopping = [];
  for (const raining of [false, true]) {
    const sim = simulation();
    sim.tyres.wetness = Number(raining);
    for (let i = 0; i < 480; i++) sim.step(1 / 60, { brake: true }, true, { raining });
    stopping.push(sim.distance);
    assert.equal(sim.speed, 0);
    assert.equal(sim.dscActive, false, 'Straight-line ABS braking is not a lateral DSC event');
    assert.equal(sim.lateralVelocity, 0);
  }
  assert.ok(stopping[1] > stopping[0] * 1.6);
});

test('Left/right handling mirrors, lateral motion affects the path, and reset/pause clear or freeze state', () => {
  const left = maneuver(60, true),
    right = maneuver(60, true, false, true);
  assert.ok(Math.abs(left.peak - right.peak) < 0.005);
  assert.ok(left.heading > 0 && right.heading < 0);
  const sim = simulation();
  for (let i = 0; i < 70; i++) sim.step(1 / 60, { left: true, brake: true });
  assert.ok(Math.abs(sim.lateralVelocity) > 0.2);
  const x = sim.x,
    z = sim.z;
  sim.step(1 / 240, { left: true, brake: true });
  const sideDisplacement =
    -(sim.x - x) * Math.sin(sim.heading) - (sim.z - z) * Math.cos(sim.heading);
  assert.ok(Math.abs(sideDisplacement - sim.lateralVelocity / 240) < 1e-8);
  const snapshot = JSON.stringify(sim);
  sim.step(1, { left: true }, false, { raining: true });
  assert.equal(JSON.stringify(sim), snapshot);
  sim.reset(0);
  assert.equal(sim.lateralVelocity, 0);
  assert.equal(sim.yawRate, 0);
  assert.equal(sim.tractionLoss, 0);
  assert.equal(sim.dscActive, false);
  assert.ok(sim.wheels.every((w) => w.slip === 0));
});

test('Weather grip blends gradually; airborne tyres cannot create cornering or DSC yaw force', () => {
  const sim = simulation();
  const tyres = new TyreDynamics(sim.layout, 1945);
  sim.steer = 0.08;
  sim.wheels.forEach((w) => {
    w.load = 0;
    w.contact = false;
  });
  for (let i = 0; i < 240; i++) tyres.step(1 / 240, sim, { accelerate: true }, true, 6);
  assert.ok(tyres.wetness > 0.7 && tyres.wetness < 0.9);
  assert.equal(tyres.lateralAcceleration, 0);
  assert.equal(tyres.yawRate, 0);
  assert.equal(tyres.lateralVelocity, 0);
  const wetness = tyres.wetness;
  tyres.step(1 / 240, sim, {}, false, 0);
  assert.ok(tyres.wetness < wetness && tyres.wetness > wetness * 0.99);
});
