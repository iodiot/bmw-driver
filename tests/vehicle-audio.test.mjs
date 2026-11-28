import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  contactSurfaces,
  crunchSamples,
  knockStrength,
  noiseSamples,
  obstacleAt,
  roadAudioMix,
  windGusts,
  vehicleAudioMix,
} from '../public/vehicle-audio.js';

test('Recorded sound loops are valid non-silent PCM with bounded peaks and smooth loop seams', () => {
  let bytes = 0;
  for (const name of ['engine-idle', 'engine-low', 'engine-high', 'rain', 'tyres']) {
    const data = readFileSync(new URL(`../public/assets/audio/${name}.wav`, import.meta.url));
    bytes += data.length;
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt16LE(20), 1);
    assert.equal(data.readUInt16LE(34), 16);
    const count = (data.length - 44) / 2;
    let energy = 0,
      peak = 0;
    for (let i = 0; i < count; i++) {
      const value = data.readInt16LE(44 + i * 2) / 32768;
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    assert.ok(peak <= 0.851 && energy / count > 0.0001);
    assert.ok(Math.abs(data.readInt16LE(44) - data.readInt16LE(data.length - 2)) / 32768 < 0.15);
  }
  assert.ok(bytes < 2_000_000, 'The complete recording set should remain compact');
});

test('Engine follows RPM and load, braking stops tyre sound at rest, rain is independent of driving', () => {
  const idle = vehicleAudioMix({ rpm: 800, speed: 0 });
  const cruise = vehicleAudioMix({ rpm: 4500, speed: 35 });
  const throttle = vehicleAudioMix({ rpm: 4500, speed: 35, accelerate: true });
  const afterShift = vehicleAudioMix({ rpm: 3200, speed: 35, accelerate: true });
  assert.ok(idle.idle > 0 && idle.low === 0 && idle.high === 0);
  assert.equal(idle.idleRate, 1, 'The new idle recording retains its natural pitch at rest');
  assert.ok(throttle.low + throttle.high > cruise.low + cruise.high);
  assert.ok(afterShift.lowRate < throttle.lowRate && afterShift.highRate < throttle.highRate);
  assert.ok(vehicleAudioMix({ rpm: 2500, speed: 30, brake: true, acceleration: -15 }).tyres > 0);
  assert.equal(vehicleAudioMix({ rpm: 800, speed: 0, brake: true, acceleration: -15 }).tyres, 0);
  assert.equal(vehicleAudioMix({ raining: false }).rain, 0);
  const paused = vehicleAudioMix({
    rpm: 7000,
    speed: 60,
    accelerate: true,
    driving: false,
    raining: true,
  });
  assert.equal(paused.rpm, 800);
  assert.ok(paused.rain > 0 && paused.tyres === 0);
});

test('Cruise control loads the engine when it accelerates, as the pedal does', () => {
  const coasting = vehicleAudioMix({ rpm: 3000, speed: 25 });
  const cruising = vehicleAudioMix({ rpm: 3000, speed: 25, throttle: 1 });
  const pedal = vehicleAudioMix({ rpm: 3000, speed: 25, accelerate: true });
  assert.ok(cruising.low > coasting.low);
  assert.equal(cruising.low, pedal.low);
});

test('The road sounds by its surface: stones crunch on gravel, grass swishes, asphalt only rolls', () => {
  const asphalt = roadAudioMix({ speed: 20, surfaces: { asphalt: 1 } });
  const gravel = roadAudioMix({ speed: 20, surfaces: { gravel: 1 } });
  const grass = roadAudioMix({ speed: 20, surfaces: { grass: 1 } });
  assert.equal(asphalt.crunch, 0);
  assert.ok(gravel.crunch > 0.2 && gravel.crunch > grass.crunch);
  assert.ok(grass.swish > gravel.swish && asphalt.swish === 0);
  assert.ok(asphalt.roll > 0);
  // Airborne: no road at all; stopped: silence apart from the engine.
  const air = roadAudioMix({ speed: 20, surfaces: {} });
  assert.equal(air.roll + air.crunch + air.swish + air.spray, 0);
  const still = roadAudioMix({ speed: 0, surfaces: { gravel: 1 } });
  assert.equal(still.roll + still.crunch + still.swish, 0);
  // Two wheels on each surface blend the two.
  const edge = roadAudioMix({ speed: 20, surfaces: { asphalt: 0.5, gravel: 0.5 } });
  assert.ok(Math.abs(edge.crunch - gravel.crunch / 2) < 1e-9);
  assert.deepEqual(
    contactSurfaces([
      { contact: true, surface: 'asphalt' },
      { contact: true, surface: 'asphalt' },
      { contact: true, surface: 'grass' },
      { contact: false, surface: 'grass' },
    ]),
    { asphalt: 0.5, grass: 0.25 }
  );
});

test('Tyres squeal when sliding on asphalt, a wet road sprays, rails scrape', () => {
  assert.equal(roadAudioMix({ speed: 25, slipAngle: 0.01 }).squeal, 0);
  const slide = roadAudioMix({ speed: 25, slipAngle: 0.2 });
  assert.ok(slide.squeal > 0.15);
  assert.ok(roadAudioMix({ speed: 25, slipAngle: 0.2, wet: true }).squeal < slide.squeal / 2);
  assert.equal(roadAudioMix({ speed: 25, slipAngle: 0.2, surfaces: { dirt: 1 } }).squeal, 0);
  assert.ok(roadAudioMix({ speed: 25, wet: true }).spray > 0);
  assert.equal(roadAudioMix({ speed: 25 }).scrape, 0);
  assert.ok(roadAudioMix({ speed: 25, scrape: 8 }).scrape > 0.3);
  assert.equal(roadAudioMix({ speed: 40, driving: false, slipAngle: 0.2 }).squeal, 0);
});

test('Wheels knock on speed bumps and potholes, harder when faster, and on rail strikes', () => {
  // A full-width speed bump at x = 36 and a pothole in a centre-lane wheel track at x = 49.
  assert.ok(obstacleAt(36, 0).w > 5);
  assert.ok(obstacleAt(36 + 120 * 3, -2.5).w > 5, 'Obstacles repeat along the road');
  assert.ok(obstacleAt(49, 0.81).h < 0);
  assert.equal(obstacleAt(42, 0), null);
  assert.equal(obstacleAt(36, 42), null, 'The country road has none');
  assert.equal(knockStrength('bump', 0.085, 1), 0, 'Rolling over at walking pace is silent');
  assert.ok(knockStrength('bump', 0.085, 20) > knockStrength('bump', 0.085, 6));
  assert.ok(knockStrength('bump', -0.075, 25) <= 1);
  assert.equal(knockStrength('rail', 0.1), 0);
  assert.ok(knockStrength('rail', 6) > 0.999 && knockStrength('rail', 2) > 0);
});

test('Synthesised loops are deterministic, bounded, and crunch clicks never cross the loop seam', () => {
  const noise = noiseSamples(48000, 3);
  assert.deepEqual(noise, noiseSamples(48000, 3));
  assert.ok(noise.every((v) => v >= -1 && v <= 1));
  const crunch = crunchSamples(96000, 48000);
  let peak = 0,
    clicks = 0;
  for (let i = 0; i < crunch.length; i++) {
    peak = Math.max(peak, Math.abs(crunch[i]));
    if (Math.abs(crunch[i]) > 0.05 && Math.abs(crunch[i - 1] ?? 0) <= 0.05) clicks++;
  }
  assert.ok(Math.abs(peak - 0.9) < 1e-6);
  assert.ok(clicks > 200, 'Hundreds of stones per second');
  assert.ok(Math.abs(crunch[0]) < 0.05 && Math.abs(crunch.at(-1)) < 0.05);
});

test('winter: snow crunches off the asphalt, slush hisses on it, grass is muffled', () => {
  const field = roadAudioMix({ speed: 15, surfaces: { grass: 1 }, winter: 1 });
  const summerField = roadAudioMix({ speed: 15, surfaces: { grass: 1 } });
  assert.ok(field.snow > 0.2 && summerField.snow === 0);
  assert.equal(field.swish, 0);
  const motorway = roadAudioMix({ speed: 25, surfaces: { asphalt: 1 }, winter: 1 });
  const dry = roadAudioMix({ speed: 25, surfaces: { asphalt: 1 } });
  assert.ok(motorway.spray > dry.spray && motorway.snow < field.snow);
  // Gusts swell and ease but never drop out.
  for (let t = 0; t < 60; t += 0.5) {
    const g = windGusts(t);
    assert.ok(g >= 0.25 && g <= 1);
  }
});

test('a car going by close whooshes, loudest drawing level; the air rushes with speed', async () => {
  const { passingWhoosh, airflowLevel } = await import('../public/vehicle-audio.js');
  const me = { x: 100, lat: 1.8, speed: 30 };
  // Overtaking a slow car in the next lane, level with it.
  const level = passingWhoosh(me, [{ x: 100, lat: -1.8, speed: 20 }]);
  const before = passingWhoosh(me, [{ x: 106, lat: -1.8, speed: 20 }]);
  assert.ok(level > before && before > 0);
  // One coming the other way passes much faster: louder.
  const oncoming = passingWhoosh(me, [{ x: 100, lat: -6, speed: 25, oncoming: true }]);
  assert.ok(oncoming > passingWhoosh(me, [{ x: 100, lat: -6, speed: 25 }]));
  // Nobody near: nothing.
  assert.equal(passingWhoosh(me, [{ x: 200, lat: 1.8, speed: 0 }]), 0);
  assert.equal(airflowLevel(10), 0);
  assert.ok(airflowLevel(40) < airflowLevel(60) && airflowLevel(80) === 1);
});
