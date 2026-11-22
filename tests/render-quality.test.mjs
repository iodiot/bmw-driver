import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RenderQuality } from '../public/render-quality.js';

function run(quality, fps, seconds) {
  for (let i = 0; i < fps * seconds; i++) quality.update(1 / fps);
}

test('Retina framebuffers respect the pixel budget without upscaling low-DPI screens', () => {
  const quality = new RenderQuality(2);
  assert.equal(quality.resize(1200, 600), 2);
  const ratio = quality.resize(2560, 1440);
  assert.ok(2560 * 1440 * ratio ** 2 <= 3_000_001);
  assert.equal(new RenderQuality(1).resize(1280, 720), 1);
});

test('Sustained slow frames lower resolution, stable frames recover it gradually', () => {
  const quality = new RenderQuality(2);
  quality.resize(1200, 600);
  run(quality, 60, 10);
  assert.equal(quality.ratio, 2, 'A stable 60 fps must retain full resolution');
  run(quality, 30, 5);
  const reduced = quality.ratio;
  assert.ok(reduced < 2 && reduced >= 0.75);
  run(quality, 60, 2); // Let the last mixed slow/fast measurement window finish.
  const settled = quality.ratio;
  run(quality, 60, 3);
  assert.equal(quality.ratio, settled, 'Cooldown prevents resolution oscillation');
  run(quality, 60, 45);
  assert.ok(quality.ratio > reduced && quality.ratio <= 2);
  run(quality, 10, 60);
  assert.equal(quality.ratio, 0.75);
});

test('A single stall or hidden-tab gap does not reduce resolution', () => {
  const quality = new RenderQuality(2);
  quality.resize(1200, 600);
  run(quality, 60, 5);
  quality.update(0.12);
  run(quality, 60, 2);
  quality.update(10);
  quality.update(NaN);
  run(quality, 60, 5);
  assert.equal(quality.ratio, 2);
});
