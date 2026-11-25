import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collideWithSolids } from '../public/obstacles.js';
import { atPump } from '../public/fuel-station.js';
import { branchEndFor, branchStartFor, pitLateral, pitSpeed, pitStop } from '../public/pit-stop.js';
import {
  fuelStationPlace,
  roadCenterSlope,
  roadCenterZ,
  roadLanes,
} from '../public/road-profile.js';

// A service area's station on the endless road.
const at = fuelStationPlace.at + 3000;
const car = (x, lat, turn = 0, speed = 0) => ({
  x,
  z: roadCenterZ(x) + lat,
  heading: -Math.atan(roadCenterSlope(x)) + turn,
  speed,
  lateralVelocity: 0,
});
const slope = (x) => (pitLateral(x + 0.5, at) - pitLateral(x - 0.5, at)) / 1;

test('the way to the pump and back runs clear of the station', () => {
  // (With some 0.4 m of the car's own wander either side.)
  for (let x = branchStartFor(at) - 50; x < branchEndFor(at) + 50; x += 0.5)
    for (const off of [-0.4, 0, 0.4]) {
      const sim = car(x, pitLateral(x, at) + off, -Math.atan(slope(x)), 5);
      assert.equal(collideWithSolids(sim), null, `at ${(x - at).toFixed(1)} ${off}`);
    }
});

test('it stops beside the middle pump, and is on the motorway either side', () => {
  const x = at + pitStop.stopAt;
  assert.ok(atPump(x, roadCenterZ(x) + pitLateral(x, at), 0));
  assert.equal(pitSpeed(x, at), 0);
  for (const x of [branchStartFor(at) - 10, branchEndFor(at) + 10])
    assert.equal(pitLateral(x, at), roadLanes.at(-1));
});

test('it eases into the forecourt and never turns sharper than a car can', () => {
  for (let x = at - 60; x < at + 60; x += 0.5) {
    assert.ok(Math.abs(slope(x)) < 0.85, `slope ${slope(x)} at ${x - at}`);
    const bend = (slope(x + 0.5) - slope(x - 0.5)) / 1;
    // (A radius of 6.5 m at the least, at a walking pace: the car's
    // tightest is under 6 m.)
    assert.ok(Math.abs(bend) < 1 / 6.5, `bend ${bend} at ${x - at}`);
  }
});

test('it slows from the motorway to a stop and sets off again filled', () => {
  assert.ok(pitSpeed(branchStartFor(at) - 600, at) > 40);
  assert.ok(pitSpeed(at - 30, at) <= pitStop.forecourt + 0.01);
  assert.equal(pitSpeed(at + 5, at, true), pitStop.forecourt);
  assert.ok(pitSpeed(branchEndFor(at), at, true) > 25);
});
