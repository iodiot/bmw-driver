import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrivingSimulation, wheelLayout } from '../public/driving-physics.js';
import {
  road,
  obstacles,
  roadCenterZ,
  roadCenterSlope,
  straightTestTrack,
} from '../public/road-profile.js';
import { RoadJolt } from '../public/road-jolt.js';

function drive(sim, seconds, input) {
  const jolt = new RoadJolt();
  let peak = 0;
  for (let i = 0; i < seconds * 60; i++) {
    sim.step(1 / 60, input);
    jolt.update(1 / 60, sim.wheels, { speed: sim.speed });
    peak = Math.max(peak, Math.abs(jolt.heave));
  }
  return { events: jolt.events, peak };
}

test('Smooth driving, hard braking and cornering give no jolt', () => {
  const cruise = new DrivingSimulation(undefined, straightTestTrack);
  cruise.reset(25);
  cruise.z = 300;
  assert.equal(drive(cruise, 3, { cruiseSpeed: 25 }).events, 0);
  const braking = new DrivingSimulation(undefined, straightTestTrack);
  braking.reset(30);
  braking.z = 300;
  assert.equal(drive(braking, 3, { brake: true }).events, 0);
  const turning = new DrivingSimulation(undefined, straightTestTrack);
  turning.reset(20);
  turning.z = 300;
  assert.equal(drive(turning, 3, { left: true, cruiseSpeed: 20 }).events, 0);
});

test('A pothole under a wheel jolts the body and the camera; a speed bump too', () => {
  const hole = obstacles.find((o) => o.h < 0 && o.l > 1);
  const sim = new DrivingSimulation(undefined, road);
  sim.reset(25);
  const x = hole.x - 20 + 600;
  sim.x = x;
  sim.z = roadCenterZ(x) + hole.z - wheelLayout[0].z;
  sim.heading = -Math.atan(roadCenterSlope(x));
  const hit = drive(sim, 2, { cruiseSpeed: 25, steerAngle: 0 });
  assert.ok(hit.events >= 1, 'jolted');
  assert.ok(hit.peak > 0.004, `the body moves visibly (${hit.peak})`);
  const bump = obstacles.find((o) => o.w > 10);
  const over = new DrivingSimulation(undefined, road);
  over.reset(15);
  const bx = bump.x - 20 + 600;
  over.x = bx;
  over.z = roadCenterZ(bx);
  over.heading = -Math.atan(roadCenterSlope(bx));
  assert.ok(drive(over, 3, { cruiseSpeed: 15, steerAngle: 0 }).events >= 1);
});
