import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createWeatherCycle, nextWeather, weatherCycle } from '../public/weather-cycle.js';
import { setupRain } from '../public/rain.js';

test('Showers come and go by themselves, and a chosen weather lasts a full spell', () => {
  const cycle = createWeatherCycle(() => 0.5);
  assert.equal(cycle.raining, false);
  const clear = (weatherCycle.clear[0] + weatherCycle.clear[1]) / 2,
    rain = (weatherCycle.rain[0] + weatherCycle.rain[1]) / 2;
  let changes = [],
    t = 0;
  for (; t < 2 * (clear + rain) + 1; t += 1)
    if (cycle.update(1)) changes.push([Math.round(t + 1), cycle.raining]);
  assert.deepEqual(changes, [
    [clear, true],
    [clear + rain, false],
    [2 * clear + rain, true],
    [2 * (clear + rain), false],
  ]);
  cycle.set(true);
  assert.equal(cycle.raining, true);
  assert.equal(cycle.remaining, rain);
});

test('Rain sets in and eases off gradually when asked to fade', () => {
  const rain = setupRain(new THREE.Scene()),
    camera = new THREE.PerspectiveCamera(),
    state = { x: 0, z: 0, heading: 0 };
  const amount = rain.group.children[0].material.uniforms.rainAmount;
  rain.setEnabled(true, 4);
  assert.equal(rain.group.visible, true);
  assert.equal(amount.value, 0, 'A shower starts with no drops');
  for (let i = 0; i < 120; i++) rain.update(1 / 60, camera, state, false);
  assert.ok(Math.abs(amount.value - 0.5) < 1e-6, 'Halfway after half the fade');
  for (let i = 0; i < 240; i++) rain.update(1 / 60, camera, state, false);
  assert.equal(amount.value, 1);
  rain.setEnabled(false, 4);
  rain.update(1 / 60, camera, state, false);
  assert.equal(rain.group.visible, true, 'Drops thin out before the rain stops');
  for (let i = 0; i < 300; i++) rain.update(1 / 60, camera, state, false);
  assert.equal(amount.value, 0);
  assert.equal(rain.group.visible, false);
  rain.setEnabled(true);
  assert.equal(amount.value, 1, 'Turning rain on directly is immediate');
});

test('Some showers are storms, and early mornings often bring fog', () => {
  // (The first draw is the opening dry spell.)
  const draws = [0.5, 0.1];
  // A storm: the shower draw falls in the storms' share.
  let cycle = createWeatherCycle(() => draws.shift() ?? 0.5);
  cycle.update(1000, 13);
  assert.equal(cycle.kind, 'storm');
  assert.equal(cycle.raining, true);
  // At 6:00 a dry spell gives way to fog instead.
  cycle = createWeatherCycle(() => 0.1);
  cycle.update(1000, 6);
  assert.equal(cycle.kind, 'fog');
  assert.equal(cycle.raining, false);
  cycle.update(1000, 6);
  assert.equal(cycle.kind, 'clear', 'Fog lifts to a dry spell');
  // Chosen weather steps clear, rain, storm, fog.
  assert.deepEqual(['clear', 'rain', 'storm', 'fog'].map(nextWeather), [
    'rain',
    'storm',
    'fog',
    'clear',
  ]);
  cycle.set('fog');
  assert.equal(cycle.kind, 'fog');
  cycle.set(true);
  assert.equal(cycle.kind, 'rain');
});
