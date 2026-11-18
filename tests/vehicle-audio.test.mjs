import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { vehicleAudioMix } from '../public/vehicle-audio.js';

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
