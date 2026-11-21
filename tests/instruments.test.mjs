import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gaugeAngle, InstrumentMotion, DscIndicatorMotion } from '../public/instruments.js';

test('F10 dial scales convert speed and RPM to the correct needle angles', () => {
  assert.equal(gaugeAngle(0, 330), -120);
  assert.equal(gaugeAngle(165, 330), 0);
  assert.equal(gaugeAngle(330, 330), 120);
  assert.equal(gaugeAngle(4000, 8000), 0);
  assert.equal(gaugeAngle(7200, 8000), 96);
  assert.equal(gaugeAngle(-30, 330), -120);
  assert.equal(gaugeAngle(9000, 8000), 120);
  assert.equal(gaugeAngle(NaN, 330), -120);
  const motion = new InstrumentMotion().update(0, 30 / 3.6, 1400);
  assert.ok(Math.abs(motion.speed - 30) < 1e-10, 'The speedometer converts m/s to km/h');
  assert.equal(motion.rpm, 1400);
});

test('Needle damping follows acceleration and gear-change RPM drops at every frame rate', () => {
  const readings = [];
  for (const fps of [15, 30, 60, 144]) {
    const motion = new InstrumentMotion().update(0, 0, 800);
    for (let i = 0; i < fps / 3; i++) motion.update(1 / fps, 100 / 3.6, 7000);
    assert.ok(motion.speed > 99 && motion.speed < 100);
    assert.ok(motion.rpm > 6800 && motion.rpm < 7000);
    for (let i = 0; i < fps; i++) motion.update(1 / fps, 100 / 3.6, 4200);
    assert.ok(Math.abs(motion.rpm - 4200) < 0.02, 'An upshift must lower the tachometer');
    readings.push(motion.rpm);
    const before = { speed: motion.speed, rpm: motion.rpm };
    motion.update(0, 0, 800);
    assert.equal(motion.speed, before.speed);
    assert.equal(motion.rpm, before.rpm, 'A zero-time frame must not move the needles');
  }
  assert.ok(Math.max(...readings) - Math.min(...readings) < 0.002);
});

test('The amber DSC warning flashes only during intervention and clears on pause or reset', () => {
  for (const fps of [30, 60, 144]) {
    const warning = new DscIndicatorMotion();
    assert.equal(warning.update(1 / fps, false).visible, false);
    assert.equal(warning.update(1 / fps, true).visible, true);
    let lit = 0,
      transitions = 0,
      previous = warning.visible;
    for (let i = 0; i < fps; i++) {
      warning.update(1 / fps, true);
      lit += warning.visible;
      transitions += Number(warning.visible !== previous);
      previous = warning.visible;
    }
    assert.ok(transitions >= 5 && transitions <= 6, 'About three flashes per second');
    assert.ok(lit / fps > 0.43 && lit / fps < 0.57);
    assert.equal(warning.update(0, false).visible, false);
    assert.equal(warning.active, false);
    warning.update(1 / fps, true);
    warning.reset();
    assert.equal(warning.visible, false);
  }
});

test('Cluster scales follow the European F10 M5: 0–330 km/h numbered every 30', async () => {
  const { speedometerLabels, speedometerMaximum, fuelState } = await import(
    '../public/instruments.js'
  );
  assert.equal(speedometerMaximum, 330);
  assert.deepEqual(speedometerLabels, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  const start = fuelState(0),
    later = fuelState(100_000);
  assert.ok(later.fraction < start.fraction && later.rangeKm < start.rangeKm);
  assert.ok(start.rangeKm > 300 && start.rangeKm < 500);
});
