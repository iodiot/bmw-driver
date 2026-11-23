import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RunTimer, describeRun } from '../public/runs.js';
import { camerasPassed, fineFor, speedCameras } from '../public/speed-cameras.js';
import { structureLayout } from '../public/road-structures.js';

function memory() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
}
// Accelerates from a standstill at `a` m/s² up to `top` m/s, then lifts.
function drive(timer, a, top, seconds, dt = 1 / 60) {
  const results = [];
  for (let t = 0; t < 0.5; t += dt) results.push(...timer.update(dt, 0, true));
  let v = 0;
  for (let t = 0; t < seconds; t += dt) {
    v = Math.min(top, v + a * dt);
    results.push(...timer.update(dt, v, true));
  }
  for (let t = 0; t < 3; t += dt) {
    v = Math.max(0, v - 6 * dt);
    results.push(...timer.update(dt, v, true));
  }
  return results;
}

test('Runs from a standstill are timed and the best kept', () => {
  const storage = memory();
  const timer = new RunTimer({ storage });
  // 100 km/h at 6.5 m/s²: 4.27 s; 200 km/h is reached and held.
  const results = drive(timer, 6.5, 60, 14);
  const byKind = Object.fromEntries(results.map((r) => [r.kind, r]));
  assert.ok(Math.abs(byKind['0-100'].value - 100 / 3.6 / 6.5) < 0.05);
  assert.ok(byKind['0-100'].record);
  assert.ok(Math.abs(byKind['100-200'].value - 100 / 3.6 / 6.5) < 0.05);
  assert.ok(byKind.quarter.value > 10 && byKind.quarter.value < 13);
  assert.ok(byKind.top.value > 210);
  // A slower run is no record, and the best is shown.
  const again = new RunTimer({ storage });
  const slower = drive(again, 4, 40, 10).find((r) => r.kind === '0-100');
  assert.equal(slower.record, false);
  assert.match(describeRun(slower).note, /best 4\.2/);
});

test('Autopilot and lifting off cancel a run', () => {
  const timer = new RunTimer({ storage: memory() });
  for (let t = 0; t < 1; t += 1 / 60) timer.update(1 / 60, 0, true);
  let v = 0;
  const results = [];
  for (let t = 0; t < 3; t += 1 / 60) results.push(...timer.update(1 / 60, (v += 0.1), false));
  assert.equal(results.length, 0);
});

test('Speed cameras fine more than 20 km/h over, more above 50', () => {
  assert.equal(fineFor(135, 120), 0);
  assert.equal(fineFor(145, 120), 340);
  assert.equal(fineFor(175, 120), 1700);
  const camera = speedCameras[0];
  assert.equal(camera.limit, 100);
  assert.ok(camera.at < structureLayout.tunnel.from, 'before the tunnel');
  assert.deepEqual(
    camerasPassed(camera.at - 1, camera.at + 1).map((c) => c.at),
    [camera.at]
  );
  assert.equal(camerasPassed(camera.at + 1, camera.at + 5).length, 0);
});
