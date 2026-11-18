import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineTorque, M5Powertrain, m5Specifications } from '../public/powertrain.js';
import { DrivingSimulation } from '../public/driving-physics.js';

test('Full driving simulation matches BMW launch sprints and the standard 250 km/h limiter', () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const sim = new DrivingSimulation();
    sim.reset(0);
    const times = {},
      gears = new Set();
    for (let i = 0; i < fps * 35; i++) {
      const previous = sim.speed;
      sim.step(1 / fps, { accelerate: true });
      assert.ok(Number.isFinite(sim.speed) && Number.isFinite(sim.powertrain.rpm));
      assert.ok(sim.speed >= previous && sim.speed <= m5Specifications.topSpeed);
      assert.ok(sim.powertrain.rpm <= m5Specifications.redline);
      assert.ok(sim.powertrain.gear >= 1 && sim.powertrain.gear <= 7);
      gears.add(sim.powertrain.gear);
      for (const target of [100, 200]) {
        const threshold = target / 3.6;
        if (!times[target] && previous < threshold && sim.speed >= threshold)
          times[target] = (i + (threshold - previous) / (sim.speed - previous)) / fps;
      }
    }
    assert.ok(Math.abs(times[100] - 4.4) < 0.08, `0–100 at ${fps} fps: ${times[100]}`);
    assert.ok(Math.abs(times[200] - 13) < 0.1, `0–200 at ${fps} fps: ${times[200]}`);
    assert.ok(Math.abs(sim.speed * 3.6 - 250) < 0.01);
    assert.deepEqual([...gears], [1, 2, 3, 4, 5]);
    results.push({ fps, zeroTo100: times[100], zeroTo200: times[200], topSpeed: sim.speed * 3.6 });
  }
  console.log('BMW F10 full-throttle calibration:', results);
});

test('Automatic DCT uses all seven gears, kicks down, and returns to D1 at a stop', () => {
  const sim = new DrivingSimulation();
  assert.equal(sim.powertrain.gear, 3, 'Demo cruise at 30 km/h starts in D3');
  sim.speed = 200 / 3.6;
  sim.powertrain.reset(sim.speed);
  assert.equal(sim.powertrain.gear, 7);
  const cruisingRpm = sim.powertrain.rpm;
  for (let i = 0; i < 30; i++) sim.step(1 / 60, { accelerate: true });
  assert.equal(sim.powertrain.gear, 4, 'Full throttle must kick down from D7');
  assert.ok(sim.powertrain.rpm > cruisingRpm);
  for (let i = 0; i < 360; i++) sim.step(1 / 60, { brake: true });
  assert.equal(sim.speed, 0);
  assert.equal(sim.powertrain.gear, 1);
  assert.equal(sim.powertrain.rpm, 800);
  for (let i = 0; i < 60; i++) sim.step(1 / 60, {});
  assert.equal(sim.speed, 0, 'Coasting cannot make the vehicle move backwards');
  sim.step(1 / 60, { accelerate: true, brake: true });
  assert.equal(sim.speed, 0, 'Brake takes priority over accelerator');
});

test('Coasting, pause, reset and clutch transitions remain continuous', () => {
  const sim = new DrivingSimulation();
  for (let i = 0; i < 120; i++) sim.step(1 / 60, {});
  assert.equal(sim.speed, 30 / 3.6, 'The initial demonstration maintains its cruise speed');
  for (let i = 0; i < 300; i++) sim.step(1 / 60, { accelerate: true });
  const beforeCoast = sim.speed;
  for (let i = 0; i < 120; i++) sim.step(1 / 60, {});
  assert.ok(sim.speed < beforeCoast, 'Releasing the accelerator must slow the car');
  const paused = JSON.stringify(sim);
  sim.step(1, { accelerate: true }, false);
  sim.step(0, { accelerate: true });
  assert.equal(
    JSON.stringify(sim),
    paused,
    'Pause and zero dt freeze the drivetrain as well as the body'
  );
  sim.reset();
  assert.equal(sim.powertrain.gear, 3);
  assert.equal(sim.powertrain.shiftRemaining, 0);
  const gearbox = new M5Powertrain();
  gearbox.reset(0);
  let speed = 0;
  for (let i = 0; i < 4800; i++) {
    const acceleration = gearbox.step(1 / 240, speed, { accelerate: true });
    assert.ok(Math.abs(acceleration) < 8, 'A gear change cannot cause an impulse in speed');
    speed += acceleration / 240;
  }
});

test('Engine torque and power respect the factory ratings', () => {
  for (const rpm of [1500, 3000, 5750]) assert.equal(engineTorque(rpm), 680);
  for (const rpm of [6000, 6500, 7000])
    assert.ok(Math.abs((engineTorque(rpm) * rpm * Math.PI) / 30 - 412000) < 1e-6);
  assert.equal(engineTorque(7200), 0);
});
