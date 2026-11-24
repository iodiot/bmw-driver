import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { keptClear, landBuildings, routeLand } from '../public/route-land.js';

const data = JSON.parse(readFileSync(new URL('../public/assets/route-n08.json', import.meta.url)));
const land = routeLand(data.land);

test('the N-08 has its real buildings and ponds', () => {
  assert.ok(data.land.water.length > 3, 'water');
  assert.ok(land.buildings.length > 1000, `buildings ${land.buildings.length}`);
  assert.equal(land.water.length, data.land.water.length);
  // Dnipro's edge and Zaporizhzhia's are built up, the steppe between not.
  const near = (a, b) => land.buildings.filter((x) => x.x >= a && x.x < b).length;
  assert.ok(near(0, 5000) > 200);
  assert.ok(near(30000, 35000) < near(0, 5000) / 4);
  assert.ok(
    land.buildings.some((b) => b.kind === 3),
    'blocks of flats'
  );
  assert.ok(land.buildings.filter((b) => b.kind === 0).length > 500, 'houses');
});

test('nothing real stands on the game’s own road, service area or bridges', () => {
  for (const b of land.buildings) {
    assert.ok(!keptClear(b.x, b.lat, b.across), `building at ${b.x}, ${b.lat}`);
    assert.ok(Math.abs(b.lat) - b.across > 20);
  }
  assert.equal(keptClear(5000, 0), true);
  assert.equal(keptClear(5000, -20), true);
  assert.equal(keptClear(5000, 40), false);
  assert.equal(keptClear(5000, -60), false);
  // (The service area: 12 km apart on the route, its lane on the right.)
  assert.equal(keptClear(12600, 50), true);
  assert.equal(keptClear(12600, -50), false);
});

test('the car can run into the buildings', () => {
  const b = land.buildings[Math.floor(land.buildings.length / 2)];
  const solids = land.solidsNear(b.x, 10);
  assert.ok(solids.some((s) => s.x === b.x && s.lat === b.lat && s.hx > 0 && s.hz > 0));
  assert.ok(land.solidsNear(b.x + 5000, 10).every((s) => Math.abs(s.x - b.x - 5000) < 200));
});

test('a route without land data has none', () => {
  assert.equal(routeLand(null), null);
  assert.deepEqual(landBuildings({}), []);
});
