import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TurnSignals, highBeamWanted, signalTiming } from '../public/signals.js';
import { highBeamProfile, lowBeamProfile } from '../public/headlight-profile.js';

test('Turn signals flash about 85 times a minute with a relay click each way', () => {
  const s = new TurnSignals();
  s.set('left');
  let on = 0,
    off = 0;
  for (let i = 0; i < 600; i++) {
    const click = s.step(0.01, 0, { autoCancel: false });
    if (click === 'on') on++;
    if (click === 'off') off++;
  }
  // Six seconds at a 0.7 s period.
  assert.ok(Math.abs(on - 6 / signalTiming.period) <= 1 && Math.abs(off - on) <= 1);
  s.toggle('left');
  assert.equal(s.side, null);
  assert.equal(s.lit, false);
});

test('The stalk cancels once the steering turns that way and comes back', () => {
  const s = new TurnSignals();
  s.set('right');
  // Steering left (positive) does not cancel a right signal.
  for (let i = 0; i < 50; i++) s.step(0.02, 0.2);
  for (let i = 0; i < 50; i++) s.step(0.02, 0);
  assert.equal(s.side, 'right');
  for (let i = 0; i < 50; i++) s.step(0.02, -0.15);
  assert.equal(s.side, 'right', 'Still turning');
  s.step(0.02, 0);
  assert.equal(s.side, null);
  // The self-driving car cancels its own.
  s.set('left');
  for (let i = 0; i < 50; i++) s.step(0.02, 0.2, { autoCancel: false });
  s.step(0.02, 0, { autoCancel: false });
  assert.equal(s.side, 'left');
});

test('The high-beam assistant needs night, speed, a dry open road and no traffic near', () => {
  const open = { night: true, speed: 25, raining: false };
  assert.equal(highBeamWanted(open), true);
  assert.equal(highBeamWanted({ ...open, night: false }), false);
  assert.equal(highBeamWanted({ ...open, speed: 8 }), false);
  assert.equal(highBeamWanted({ ...open, raining: true }), false);
  assert.equal(highBeamWanted({ ...open, trafficDistance: 150 }), false);
  assert.equal(highBeamWanted({ ...open, enabled: false }), false);
});

test('The high beam lights above the low beam cut-off and keeps the low beam below it', () => {
  assert.ok(highBeamProfile(0, 0.01) > 0.5 && lowBeamProfile(0, 0.01) < 0.05);
  for (const [h, v] of [
    [0, -0.02],
    [0.3, -0.06],
    [-0.4, -0.2],
  ])
    assert.ok(highBeamProfile(h, v) >= lowBeamProfile(h, v));
});

test('Hazards flash both sides over a turn signal, which resumes after', async () => {
  const signals = new TurnSignals();
  signals.toggleHazard();
  assert.ok(signals.active && signals.flashes('left') && signals.flashes('right'));
  let clicks = 0;
  for (let t = 0; t < 2.8; t += 0.01) if (signals.step(0.01, 0.3)) clicks++;
  assert.ok(clicks >= 7, 'The relay ticks');
  assert.ok(signals.hazard, 'Steering does not cancel hazards');
  signals.set('left');
  assert.ok(signals.flashes('right'), 'Still both while the hazards are on');
  signals.toggleHazard();
  assert.ok(signals.flashes('left') && !signals.flashes('right'));
});

test('Flashing the headlights blinks the main beam twice, with a click each way', async () => {
  const { HeadlightFlasher } = await import('../public/signals.js');
  const f = new HeadlightFlasher();
  assert.equal(f.lit, false, 'Off until flashed');
  f.start();
  assert.equal(f.lit, true);
  const clicks = [];
  for (let i = 0; i < 100; i++) {
    const click = f.step(0.01);
    if (click) clicks.push(click);
  }
  assert.deepEqual(clicks, ['off', 'on', 'off']);
  assert.equal(f.lit, false, 'Done within a second');
});
