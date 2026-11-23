import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  graphicsLevels,
  graphicsPresets,
  loadSettings,
  nextGraphics,
  saveSettings,
} from '../public/settings.js';
import { RenderQuality } from '../public/render-quality.js';

function memory() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
}

test('Graphics level, time of day and camera are remembered', () => {
  const storage = memory();
  assert.deepEqual(loadSettings(storage), {
    graphics: 'auto',
    season: 'summer',
    time: null,
    timeRunning: true,
    camera: null,
  });
  saveSettings(
    { graphics: 'low', season: 'winter', time: 25.5, timeRunning: false, camera: 'driver' },
    storage
  );
  assert.deepEqual(loadSettings(storage), {
    graphics: 'low',
    season: 'winter',
    time: 1.5,
    timeRunning: false,
    camera: 'driver',
  });
  saveSettings({ graphics: 'ultra', time: 'noon' }, storage);
  const fallback = loadSettings(storage);
  assert.equal(fallback.graphics, 'auto');
  assert.equal(fallback.time, null);
  assert.deepEqual(graphicsLevels.map(nextGraphics), ['high', 'medium', 'low', 'auto']);
  assert.ok(graphicsPresets.low.pixels < graphicsPresets.medium.pixels);
  assert.equal(graphicsPresets.low.shadowMap, 0);
});

test('A fixed budget holds the resolution whatever the frame rate', () => {
  const quality = new RenderQuality(2);
  quality.setBudget(1_000_000, { adaptive: false });
  const ratio = quality.resize(1280, 720);
  assert.ok(1280 * 720 * ratio ** 2 <= 1_000_001);
  for (let i = 0; i < 600; i++) quality.update(1 / 20);
  assert.equal(quality.ratio, ratio);
});
