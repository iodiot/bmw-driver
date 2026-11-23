import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foxCanBe, foxRules } from '../public/foxes.js';
import { structureLayout } from '../public/road-structures.js';

test('foxes keep off the tunnel hill and the bridge embankments', () => {
  const { tunnel, bridges, period } = structureLayout;
  assert.equal(foxCanBe((tunnel.from + tunnel.to) / 2), false);
  assert.equal(foxCanBe(period + (tunnel.from + tunnel.to) / 2), false);
  for (const b of bridges) assert.equal(foxCanBe(b), false);
  // Somewhere in open country they may roam.
  let open = 0;
  for (let x = 0; x < period; x += 10) if (foxCanBe(x)) open++;
  assert.ok(open > period / 20, `open ${open}`);
  // Their bands keep clear of the motorway and of the country road (42 m).
  for (const [a, b] of foxRules.bands) {
    assert.ok(Math.min(Math.abs(a), Math.abs(b)) >= foxRules.verge);
    assert.ok(!(a < 42 + 6 && b > 42 - 6));
  }
});
