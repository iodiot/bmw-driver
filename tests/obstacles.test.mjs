import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collideWithSolids, solidsNear } from '../public/obstacles.js';
import {
  fuelStationPlace,
  roadBranch,
  roadCenterZ,
  roadCenterSlope,
} from '../public/road-profile.js';
import { pumpLane, pumpRow } from '../public/fuel-station.js';

const car = (x, lat, turn = 0, speed = 0) => ({
  x,
  z: roadCenterZ(x) + lat,
  heading: -Math.atan(roadCenterSlope(x)) + turn,
  speed,
  lateralVelocity: 0,
});
const edge = roadBranch.separation + roadBranch.halfWidth;

test('driving into the fuel station shop stops the car at its wall', () => {
  const shop = solidsNear(fuelStationPlace.at).find((b) => b.hx > 5);
  // Head on, at 40 km/h, the car's nose just into the shop's front wall.
  const sim = car(shop.x, shop.lat - shop.hz - 2.2, -Math.PI / 2, 11);
  const hit = collideWithSolids(sim);
  assert.ok(hit && hit.impact > 10);
  assert.equal(sim.speed, 0);
  const lat = sim.z - roadCenterZ(sim.x);
  assert.ok(lat <= shop.lat - shop.hz - 0.94, `pushed out to ${lat}`);
});

test('a car drawn up beside a pump, along the forecourt, touches nothing', () => {
  // In the lane beside the middle island, between it and the columns, on
  // either side.
  for (const side of [-1, 1]) {
    const sim = car(fuelStationPlace.at, edge + pumpRow + side * pumpLane, 0, 0);
    assert.equal(collideWithSolids(sim), null);
  }
});

test('the open road has nothing solid on it', () => {
  for (let x = 0; x < 3000; x += 25) assert.equal(collideWithSolids(car(x, 3.6, 0, 30)), null);
});
