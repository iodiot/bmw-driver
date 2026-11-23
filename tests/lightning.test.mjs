import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  boltPaths,
  flashEnvelope,
  lightningTiming,
  setupLightning,
  strikeBrightness,
  thunderLoudness,
} from '../public/lightning.js';
import { daylight } from '../public/time-of-day.js';

test('A flash peaks at once and flickers with its re-strikes', () => {
  const strokes = [
    [0, 1],
    [0.2, 0.6],
  ];
  assert.equal(flashEnvelope(0, strokes), 0);
  assert.ok(flashEnvelope(0.012, strokes) > 0.99);
  assert.ok(flashEnvelope(0.15, strokes) < 0.2, 'Dies away between strokes');
  assert.ok(flashEnvelope(0.212, strokes) > 0.55, 'Then strikes again');
  assert.ok(flashEnvelope(1, strokes) < 0.01);
  assert.ok(strikeBrightness(400) > strikeBrightness(3000));
  assert.ok(thunderLoudness(400) > thunderLoudness(3000));
});

test('A bolt runs from the cloud base to the ground', () => {
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const runs = boltPaths(random);
  const main = runs.find((r) => r.depth === 0).points;
  assert.deepEqual(main[0], [0, 1]);
  assert.equal(main.at(-1)[1], 0);
  for (let i = 1; i < main.length; i++) assert.ok(main[i][1] < main[i - 1][1]);
});

test('Storms strike, and thunder follows at the speed of sound', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera();
  const heard = [];
  const lightning = setupLightning(scene, {
    random: () => 0.5,
    onThunder: (loudness, distance) => heard.push({ loudness, distance }),
  });
  // No storm, no lightning.
  for (let t = 0; t < 30; t += 0.05) lightning.update(0.05, camera, 0);
  assert.equal(lightning.strikes, 0);
  lightning.strike(camera, 686);
  let brightest = 0,
    time = 0;
  while (!heard.length && time < 5) {
    brightest = Math.max(brightest, lightning.update(0.01, camera, 1));
    time += 0.01;
  }
  assert.ok(brightest > 0.4, 'A near strike lights the scene');
  assert.ok(Math.abs(time - 686 / lightningTiming.speedOfSound) < 0.03, 'Thunder two seconds on');
  assert.ok(heard[0].loudness > 0.5);
  // In a storm they come by themselves.
  for (let t = 0; t < 40; t += 0.05) lightning.update(0.05, camera, 1);
  assert.ok(lightning.strikes > 2);
});

test('Fog veils the sun and a storm darkens the day', () => {
  const clear = daylight(8),
    fog = daylight(8, 0, { fog: 1 }),
    storm = daylight(13, 1, { storm: 1 }),
    rain = daylight(13, 1);
  assert.ok(fog.direct < clear.direct * 0.4);
  assert.ok(fog.ambient > clear.ambient);
  assert.equal(fog.photo, 0);
  assert.ok(fog.lowBeams && !clear.lowBeams, 'Lamps on in fog');
  assert.ok(storm.ambient < rain.ambient * 0.7 && storm.direct < rain.direct);
  assert.ok(storm.lowBeams && !storm.night);
});
