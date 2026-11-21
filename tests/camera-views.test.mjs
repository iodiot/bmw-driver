import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SeatCamera,
  cameraOrder,
  cameraViews,
  lookLimits,
  nextCameraView,
  viewFov,
} from '../public/camera-views.js';

test('C cycles chase, driver and bonnet views, and back', () => {
  assert.deepEqual(cameraOrder, ['chase', 'driver', 'bonnet']);
  let view = 'chase';
  const seen = [];
  for (let i = 0; i < 3; i++) seen.push((view = nextCameraView(view)));
  assert.deepEqual(seen, ['driver', 'bonnet', 'chase']);
  assert.equal(cameraViews.driver.inside, true);
  assert.equal(cameraViews.bonnet.inside, false);
});

test('The seat view widens on narrow screens so enough of the road is seen', () => {
  assert.equal(viewFov('chase', 1.6), null);
  assert.equal(viewFov('driver', 16 / 9), cameraViews.driver.fov);
  const portrait = viewFov('driver', 0.6);
  assert.ok(portrait > cameraViews.driver.fov);
  const horizontal = 2 * Math.atan(Math.tan((portrait * Math.PI) / 360) * 0.6) * (180 / Math.PI);
  assert.ok(Math.abs(horizontal - cameraViews.driver.minHorizontal) < 1e-6);
});

test("The driver's head turns with a drag, within limits, and drifts back ahead", () => {
  const head = new SeatCamera();
  head.drag(200, 0, 800, 56);
  assert.ok(head.yaw < 0, 'Dragging right looks right');
  head.drag(0, -100, 800, 56);
  assert.ok(head.pitch > 0, 'Dragging up looks up');
  head.drag(-100000, 100000, 800, 56);
  assert.equal(head.yaw, lookLimits.yaw);
  assert.equal(head.pitch, -lookLimits.down);
  head.step(0.5, null);
  assert.equal(head.yaw, lookLimits.yaw, 'Holds the look for a moment');
  for (let i = 0; i < 300; i++) head.step(1 / 60, null);
  assert.ok(Math.abs(head.yaw) < 0.01 && Math.abs(head.pitch) < 0.01);
  // Into a left bend the gaze leads to the left; braking sways it forward.
  for (let i = 0; i < 120; i++)
    head.step(1 / 60, { yawRate: 0.3, acceleration: -8, lateralAcceleration: 0 });
  assert.ok(head.bendLook > 0.05 && head.sway.x > 0.01);
});
