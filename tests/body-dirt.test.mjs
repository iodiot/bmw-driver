import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BodyDirtState } from '../public/body-dirt.js';

const drive = (state, seconds, options) => {
  for (let t = 0; t < seconds; t += 1 / 60) state.step(1 / 60, options);
};

test('Dry dirt roads coat the car in dust; asphalt does not', () => {
  const state = new BodyDirtState();
  drive(state, 30, { surfaces: Array(4).fill('asphalt'), speed: 25 });
  assert.equal(state.dust, 0);
  drive(state, 30, { surfaces: Array(4).fill('dirt'), speed: 20 });
  assert.ok(state.dust > 0.6 && state.dust < 1, `dust ${state.dust}`);
  assert.equal(state.mud, 0, 'No mud from dry ground');
  // Standing still raises nothing.
  const still = state.dust;
  drive(state, 10, { surfaces: Array(4).fill('dirt'), speed: 0 });
  assert.equal(state.dust, still);
});

test('Wet ground throws mud; rain washes dust off sooner than mud', () => {
  const state = new BodyDirtState();
  drive(state, 20, { surfaces: Array(4).fill('dirt'), speed: 20, wetness: 1 });
  assert.ok(state.mud > 0.5 && state.dust === 0);
  state.dust = 0.8;
  const mud = state.mud;
  drive(state, 60, { surfaces: Array(4).fill('asphalt'), speed: 20, wetness: 1, raining: true });
  assert.ok(state.dust < 0.8 * 0.35, 'Rain rinses the dust');
  assert.ok(state.mud > mud * 0.6, 'Mud clings longer');
  state.reset();
  assert.equal(state.dust + state.mud, 0);
});

test('A rail contact scratches the side and place of the body that touched', async () => {
  const { scratchAt, addScratchWear, scratchLayout } = await import('../public/body-dirt.js');
  // Car heading along +x at the origin; contact by the right front corner.
  const car = { x: 0, z: 0, heading: 0 };
  const hit = scratchAt({ x: 2.3, z: 0.95, impact: 2, scrape: 10 }, car, 1 / 60);
  assert.equal(hit.side, 1, 'Right side (+z)');
  assert.ok(Math.abs(hit.x - 2.3) < 1e-9);
  assert.ok(hit.wear > 0.4, 'A hit scratches at once');
  const row = new Float32Array(scratchLayout.columns);
  assert.ok(addScratchWear(row, hit.x, hit.wear));
  const column = (x) =>
    Math.floor(((x - scratchLayout.from) / scratchLayout.length) * scratchLayout.columns);
  assert.ok(row[column(2.3)] > 0.4 && row[column(1.5)] === 0, 'Only around the contact');
  // Turned 90°, a contact on its left is the car's left side.
  const turned = scratchAt(
    { x: -0.95, z: -1, impact: 0, scrape: 5 },
    { x: 0, z: 0, heading: Math.PI / 2 },
    1 / 60
  );
  assert.equal(turned.side, 0);
});

test('Rubbing along a rail parallel to it scratches the whole side', async () => {
  const { addScratchWear, scratchLayout } = await import('../public/body-dirt.js');
  const along = new Float32Array(scratchLayout.columns),
    angled = new Float32Array(scratchLayout.columns);
  addScratchWear(along, 0.3, 0.5, 0.01);
  addScratchWear(angled, 0.3, 0.5, 0.5);
  const worn = (row) => Array.from(row).filter((v) => v > 0.1).length;
  const perMetre = scratchLayout.columns / scratchLayout.length;
  assert.ok(worn(along) > 3.5 * perMetre, 'Almost the whole side');
  assert.ok(worn(angled) < 0.8 * perMetre, 'At an angle only near the corner');
});

test('winter cakes the car in snow and slush on any road; it thaws after', () => {
  const state = new BodyDirtState();
  const surfaces = ['asphalt', 'asphalt', 'asphalt', 'asphalt'];
  for (let t = 0; t < 30; t += 0.1) state.step(0.1, { surfaces, speed: 25, winter: 1 });
  assert.ok(state.slush > 0.5, `slush ${state.slush}`);
  assert.equal(state.dust, 0);
  const summer = new BodyDirtState();
  for (let t = 0; t < 30; t += 0.1) summer.step(0.1, { surfaces, speed: 25, winter: 0 });
  assert.equal(summer.slush, 0);
  for (let t = 0; t < 60; t += 0.1) state.step(0.1, { surfaces, speed: 0, winter: 0 });
  assert.ok(state.slush < 0.1, `thawed ${state.slush}`);
});
