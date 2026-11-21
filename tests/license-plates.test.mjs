import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plateLayout, ukrainianPlate } from '../public/license-plates.js';

test('Ukrainian plate keeps the registration, standard size and grouped characters', () => {
  assert.equal(ukrainianPlate.text, 'AP 1011 CX');
  assert.equal(ukrainianPlate.width, 0.52);
  assert.equal(ukrainianPlate.height, 0.112);
  const { glyphs, width } = plateLayout(ukrainianPlate.text);
  assert.deepEqual(
    glyphs.map((g) => g.ch),
    ['A', 'P', '1', '0', '1', '1', 'C', 'X']
  );
  // Characters fit in the white field right of the 47 mm blue band.
  assert.ok(width > 300 && width < 520 - 47 - 20);
  // Group gaps are wider than the spacing inside a group.
  const gapAfter = (i) => glyphs[i + 1].x - (glyphs[i].x + glyphs[i].w);
  assert.ok(gapAfter(1) > gapAfter(0) && gapAfter(5) > gapAfter(6));
  assert.ok(glyphs.every((g, i) => i === 0 || g.x > glyphs[i - 1].x));
});

test('Unsupported plate characters are rejected rather than drawn blank', () => {
  assert.throws(() => plateLayout('AP 1011 CQ'), /Unsupported plate character/);
});
