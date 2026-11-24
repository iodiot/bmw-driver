import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keptStation, nextStation, radioStations, radioVolume } from '../public/radio.js';

test('the radio has Ukrainian stations, each its own secure stream', () => {
  assert.ok(radioStations.length >= 4);
  const urls = radioStations.map((s) => s.url);
  assert.equal(new Set(urls).size, urls.length);
  for (const station of radioStations) {
    assert.match(station.url, /^https:\/\/online\.[a-z]+\.ua\//);
    assert.ok(station.name && station.note);
  }
});

test('its button steps through the stations and then turns it off', () => {
  const seen = [];
  let index = -1;
  do {
    index = nextStation(index);
    seen.push(index);
  } while (index !== -1);
  assert.deepEqual(seen, [...radioStations.keys(), -1]);
});

test('it plays louder in the cabin than outside, and follows the volume', () => {
  assert.ok(radioVolume(100, 1) > radioVolume(100, 0) * 2);
  assert.ok(radioVolume(100, 1) <= 1);
  assert.equal(radioVolume(0, 1), 0);
  assert.ok(Math.abs(radioVolume(50, 1) - radioVolume(100, 1) / 2) < 1e-9);
  assert.equal(radioVolume(250, 2), radioVolume(100, 1));
});

test('it plays the first station on a first visit, then keeps the choice', () => {
  assert.equal(keptStation(null), 0);
  assert.equal(keptStation(''), 0);
  assert.equal(keptStation('-1'), -1);
  assert.equal(keptStation('2'), 2);
  assert.equal(keptStation(String(radioStations.length)), 0);
});
