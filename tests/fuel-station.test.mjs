import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FuelTank, atPump, fuelPrice, pumpIslands, pumpRow } from '../public/fuel-station.js';
import {
  branchOffset,
  fuelStationPlace,
  roadBranch,
  roadCenterZ,
  surfaceAt,
} from '../public/road-profile.js';
import { villageYards, yardKits } from '../public/village.js';

const at = fuelStationPlace.at;
const edge = (x) => branchOffset(x) + roadBranch.halfWidth;
const point = (along, depth) => {
  const x = at + along;
  return [x, roadCenterZ(x) + edge(x) + depth];
};

test('The forecourt is paved and the car fills up beside a pump', () => {
  assert.equal(surfaceAt(...point(0, 10)), 'asphalt');
  assert.equal(surfaceAt(...point(0, 40)), 'grass');
  // Beside the middle island, stopped: at the pump; moving or on the
  // island's far end, not.
  assert.ok(atPump(...point(pumpIslands[1], pumpRow - 2.4), 0));
  assert.ok(atPump(...point(pumpIslands[0] + 1, pumpRow + 2.4), 0.2));
  assert.ok(!atPump(...point(pumpIslands[1], pumpRow - 2.4), 3));
  assert.ok(!atPump(...point(pumpIslands[1] + 4.5, pumpRow - 2.4), 0));
  assert.ok(!atPump(...point(pumpIslands[1], pumpRow - 2.4 + 3000 * 0 + 30), 0));
  // A section later, the same.
  const [x, z] = point(pumpIslands[2], pumpRow + 2);
  assert.ok(
    atPump(x + roadBranch.period, z - roadCenterZ(x) + roadCenterZ(x + roadBranch.period), 0)
  );
});

test('The tank burns about 14 L/100 km and fills at the pump', () => {
  const tank = new FuelTank(60);
  tank.burn(100_000);
  assert.ok(Math.abs(tank.litres - 46) < 1e-9);
  assert.ok(Math.abs(tank.rangeKm - (46 / 14) * 100) < 1e-9);
  let done = null;
  for (let t = 0; t < 30 && !done; t += 0.1) done = tank.step(0.1, true);
  assert.ok(done, 'Stops when full');
  assert.equal(tank.litres, 80);
  assert.ok(Math.abs(done.litres - 34) < 1e-6);
  assert.ok(Math.abs(done.cost - 34 * fuelPrice) < 1e-6);
  // Driving off mid-fill reports what went in.
  const second = new FuelTank(20);
  for (let i = 0; i < 20; i++) second.step(0.1, true);
  const left = second.step(0.1, false);
  assert.ok(left && Math.abs(left.litres - 5) < 1e-6);
  assert.equal(second.step(0.1, false), null);
  tank.burn(1e9);
  assert.equal(tank.litres, 0);
});

test('Village yards stay clear of the bus stop and the fuel station', () => {
  for (const u of villageYards) {
    assert.ok(Math.abs(u - 900) > 30, `yard at ${u}`);
    assert.ok(u - at > fuelStationPlace.length / 2 + 15, `yard at ${u}`);
  }
  const { solid, glass } = yardKits(0);
  assert.ok(solid.attributes.position.count > 1000 && glass.attributes.position.count > 0);
});

test('Village houses come in three kinds, with trees, a shed and room to walk round', () => {
  const sizes = new Set();
  for (let i = 0; i < villageYards.length; i++) {
    const { solid, leaves, flowers, chimney, colliders } = yardKits(i);
    assert.ok(leaves && leaves.attributes.position.count > 500, `yard ${i} has trees`);
    assert.ok(flowers, 'Beds and sunflowers');
    assert.ok(chimney[1] > 4.5, 'The chimney stands over the roof');
    const [house] = colliders;
    // The house stands back from the fence (at 4.5 m), inside its plot.
    assert.ok(house[1] - house[3] > 4.5 + 2, `yard ${i}: house clear of the fence`);
    assert.ok(Math.abs(house[0]) + house[2] < 15, `yard ${i}: house inside its plot`);
    sizes.add(`${Math.round(house[2])}x${Math.round(house[3])}`);
    assert.ok(solid.attributes.position.count < 30000, 'Light enough');
  }
  assert.ok(sizes.size >= 3, 'Houses of different shapes');
});
