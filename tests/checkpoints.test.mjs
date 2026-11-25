import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkpointLayout, parkedSpots, rowBlocks, slalomFor } from '../public/checkpoints.js';
import { guardrailOffset, roadLanes } from '../public/road-profile.js';
import { vehicleTypes } from '../public/traffic.js';

const { rows, block } = checkpointLayout;

test('a checkpoint’s rows leave one lane open, left and right by turns', () => {
  rows.forEach((_, row) => {
    const gap = row % 2 === 0 ? roadLanes[0] : roadLanes.at(-1);
    // No block reaches into the open lane.
    for (const lat of rowBlocks(row)) assert.ok(Math.abs(lat - gap) >= block.long / 2 + 1.7);
  });
});

test('the way through weaves from gap to gap, clear of every block', () => {
  for (const lane of roadLanes) {
    // In the lane far before and after.
    assert.equal(slalomFor(-checkpointLayout.approach - 1, lane), lane);
    assert.ok(Math.abs(slalomFor(rows.at(-1) + checkpointLayout.leave + 1, lane) - lane) < 1e-9);
    // At each row, in its gap, a car's half width and more from the blocks.
    rows.forEach((u, row) => {
      const lat = slalomFor(u, lane);
      for (const b of rowBlocks(row)) assert.ok(Math.abs(lat - b) > block.long / 2 + 1.2);
    });
    // And smooth: under 80 cm sideways a metre at the sharpest, taken at a
    // walking pace (three lanes here; two, on the N-08, half that).
    for (let u = -100; u < 120; u += 1)
      assert.ok(Math.abs(slalomFor(u + 1, lane) - slalomFor(u, lane)) < 0.8, `at ${u}`);
  }
});

test('its patrol cars park clear of the rail', () => {
  const { length, width } = vehicleTypes.police;
  for (const { lat, yaw } of parkedSpots(0)) {
    // The outer corners, turned by the car's angle.
    const reach = Math.abs(lat) + width / 2 + (length / 2) * Math.abs(Math.sin(yaw));
    assert.ok(reach < guardrailOffset - 0.15, `reach ${reach.toFixed(2)}`);
  }
});
