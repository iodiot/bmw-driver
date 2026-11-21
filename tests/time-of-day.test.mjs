import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayCycle,
  dayPhase,
  daylight,
  formatClock,
  sunElevation,
  wrapHours,
} from '../public/time-of-day.js';
import { dayGraphPoint } from '../public/day-bar.js';

test('The sun rises near 7:00, stands 43° high at 13:00 and sets near 19:00', () => {
  assert.ok(Math.abs(sunElevation(13) - 43) < 1e-9, 'Matches the photographed sun at noon');
  assert.ok(sunElevation(6.5) < 0 && sunElevation(7.5) > 0);
  assert.ok(sunElevation(18.5) > 0 && sunElevation(19.5) < 0);
  assert.equal(formatClock(18.9), '18:54');
  assert.equal(formatClock(24.5), '00:30');
  assert.equal(wrapHours(-1), 23);
  assert.deepEqual(
    Object.values(dayCycle.presets).map(dayPhase),
    ['Day', 'Dusk', 'Night'],
    'Presets land in day, dusk and night'
  );
});

test('Light changes continuously over the day, with lamps from dusk to dawn', () => {
  let previous = daylight(0);
  // Every half game-minute (1.25 real seconds).
  for (let h = 1 / 120; h <= 24; h += 1 / 120) {
    const light = daylight(h);
    assert.ok(Math.abs(light.darkness - previous.darkness) < 0.05, `darkness jumps at ${h}`);
    assert.ok(Math.abs(light.ambient - previous.ambient) < 0.05, `ambient jumps at ${h}`);
    assert.ok(Math.abs(light.direct - previous.direct) < 0.1, `direct light jumps at ${h}`);
    previous = light;
  }
  const noon = daylight(13),
    dusk = daylight(dayCycle.presets.sunset),
    night = daylight(23);
  assert.equal(noon.darkness, 0);
  assert.equal(noon.photo, 1, 'The photographed sky shows at midday');
  assert.equal(night.darkness, 1);
  assert.ok(dusk.sunset > 0.8 && dusk.photo === 0, 'Sunset glow on the procedural sky');
  assert.ok(dusk.ambient < noon.ambient * 0.6, 'The fields dim before the sun sets');
  assert.ok(!noon.lowBeams && night.lowBeams && night.night);
  assert.ok(night.direct < 0.4 && night.ambient < 0.4, 'Night is dark enough for the beams');
  const wet = daylight(13, true);
  assert.equal(wet.photo, 0, 'Rain hides the photographed sky');
  assert.ok(wet.direct < noon.direct);
});

test('The day graph runs left to right with the horizon in the middle', () => {
  const [x0] = dayGraphPoint(0),
    [x12, y12] = dayGraphPoint(13),
    [x24] = dayGraphPoint(24);
  assert.ok(x0 < x12 && x12 < x24);
  assert.ok(y12 < dayGraphPoint(23)[1], 'Noon is drawn high, midnight low');
});

test('Tail lamps light the road only in the dark, more when braking', async () => {
  const { rearGlowStrength } = await import('../public/rear-glow.js');
  assert.equal(rearGlowStrength(0, 1), 0, 'No glow by day');
  assert.ok(rearGlowStrength(1, 0.45) > 0.3, 'Running lamps glow at night');
  assert.ok(rearGlowStrength(1, 1) > rearGlowStrength(1, 0.45), 'Braking glows brighter');
});
