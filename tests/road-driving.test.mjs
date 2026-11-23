import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrivingSimulation } from '../public/driving-physics.js';
import {
  roadCenterZ,
  roadCenterSlope,
  roadLateral,
  roadHeight,
  roadLanes,
  obstacles,
  guardrailFace,
  guardrailsAt,
  branchOffset,
  nextBranch,
  roadBranch,
  guardedRoad,
} from '../public/road-profile.js';
import { laneKeepingSteer, nearestLane, curveSpeed } from '../public/lane-keeping.js';
import { sparkRate, sparkColour } from '../public/sparks.js';
import {
  altitudeAt,
  baseAltitude,
  gradeLabel,
  drawnLateral,
  nextCurve,
  nextSpeedBump,
  toMinimap,
} from '../public/minimap.js';
import { roadElevation } from '../public/terrain.js';

test('The road opens with a bend, then winds through varied bends', () => {
  assert.equal(roadCenterZ(0), 0);
  assert.equal(roadCenterSlope(0), 0);
  let maxSlope = 0,
    maxCurvature = 0;
  const radii = [];
  for (let x = 0; x < 20000; x += 5) {
    maxSlope = Math.max(maxSlope, Math.abs(roadCenterSlope(x)));
    const k = (roadCenterSlope(x + 1) - roadCenterSlope(x - 1)) / 2;
    maxCurvature = Math.max(maxCurvature, Math.abs(k));
    if (x % 500 === 0) radii.push(1 / Math.abs(k));
  }
  assert.ok(maxSlope > 0.2 && maxSlope < 0.33, 'Real bends, within 18° of the x axis');
  assert.ok(1 / maxCurvature > 500 && 1 / maxCurvature < 800, 'Tightest bends near 550 m');
  assert.ok(
    radii.some((r) => r < 1500) && radii.some((r) => r > 5000),
    'Tight bends and near-straights alternate'
  );
  const k0 = (roadCenterSlope(1) - roadCenterSlope(-1)) / 2;
  assert.ok(1 / Math.abs(k0) < 700, 'The drive opens with a bend, not a straight');
  assert.ok(Math.abs(Math.atan(roadCenterSlope(200))) > (10 * Math.PI) / 180);
});

test('Obstacles sit in every lane and follow the curving road', () => {
  for (const lane of roadLanes)
    assert.ok(
      obstacles.some((o) => Math.abs(o.z - lane) < 1.2 && o.w < 2),
      `lane ${lane} has its own bumps or holes`
    );
  const bumps = obstacles.filter((o) => o.w > 10);
  assert.equal(bumps.length, 2, 'Two speed bumps span the full carriageway');
  // A pothole far down the road is found at its lateral offset from the centre.
  const hole = obstacles.find((o) => o.h < 0 && o.z < -4);
  const x = hole.x + 120 * 20;
  assert.ok(roadHeight(x, roadCenterZ(x) + hole.z) < -0.05);
  assert.ok(Math.abs(roadHeight(x, roadCenterZ(x) + hole.z + 2)) < 1e-9);
});

for (const [name, accelerate, lane, raining] of [
  ['cruising', false, 0, false],
  ['full throttle in the left lane', true, -3.6, false],
  ['full throttle in the right lane in rain', true, 3.6, true],
]) {
  test(`Lane keeping follows the curves: ${name}`, () => {
    const sim = new DrivingSimulation(undefined, guardedRoad);
    sim.z = lane;
    assert.equal(nearestLane(roadLateral(sim.x, sim.z)), lane);
    let worst = 0;
    for (let t = 0; t < 60; t += 1 / 60) {
      // Full throttle up to the speed the bends ahead allow, lifting early and
      // braking only well above it.
      const limit = curveSpeed(sim.x, lane, { lateral: raining ? 3 : 4 });
      sim.step(
        1 / 60,
        {
          accelerate: accelerate && sim.speed < limit,
          brake: sim.speed > limit + 4,
          steerAngle: laneKeepingSteer(sim, lane),
        },
        true,
        { raining }
      );
      if (t > 1) worst = Math.max(worst, Math.abs(roadLateral(sim.x, sim.z) - lane));
      assert.equal(sim.railContact, null, 'Lane keeping never touches a guardrail');
    }
    assert.ok(worst < 1.8, `stays within ${worst.toFixed(2)} m of the lane centre`);
  });
}

test('Guardrails stop the car: it scrapes along, loses speed and makes sparks', () => {
  const sim = new DrivingSimulation(undefined, guardedRoad);
  let contacts = 0,
    speedAtContact = 0,
    maxRate = 0;
  for (let t = 0; t < 12; t += 1 / 60) {
    // Into the left rail, which stays put (the right one swings out along
    // the branch road).
    sim.step(1 / 60, t < 3 ? { accelerate: true } : { accelerate: true, steerAngle: 0.04 }, true);
    const lateral = -roadLateral(sim.x, sim.z);
    assert.ok(lateral + 0.95 <= guardrailFace + 0.06, 'The body never passes through the rail');
    if (sim.railContact) {
      if (!contacts) speedAtContact = sim.speed;
      contacts++;
      maxRate = Math.max(maxRate, sparkRate(sim.railContact));
    }
  }
  assert.ok(contacts > 10, 'The car rides along the rail');
  assert.ok(maxRate > 200, 'Impacts throw bursts of sparks');
  assert.equal(sparkRate(null), 0);
  const [r, g, b] = sparkColour(1),
    cool = sparkColour(0.2);
  assert.ok(r > 0.9 && g > 0.8 && b > 0.5, 'New sparks are white-hot');
  assert.ok(cool[0] > cool[1] && cool[1] >= cool[2], 'Cooling sparks turn orange-red');
  assert.ok(speedAtContact > 0);
});

test('The country road has no rails: a car can drive off it into the field', () => {
  const { start, diverge, length, separation } = roadBranch;
  const sim = new DrivingSimulation();
  sim.reset(20);
  sim.x = start + diverge + length / 2;
  sim.z = roadCenterZ(sim.x) + separation;
  sim.heading = -Math.atan(roadCenterSlope(sim.x));
  for (let t = 0; t < 6; t += 1 / 60) {
    sim.step(1 / 60, { steerAngle: -0.05 }, true);
    assert.equal(sim.railContact, null);
  }
  assert.ok(roadLateral(sim.x, sim.z) > separation + 6, 'It left the track for the field');
});

test('The minimap shows the road ahead, the next curve and the next speed bump', () => {
  const sim = new DrivingSimulation(undefined, guardedRoad);
  const [cx, cy] = toMinimap(sim, sim.x, sim.z, 120, 140);
  assert.equal(cx, 60);
  assert.ok(Math.abs(cy - 112) < 1e-9);
  const [, ahead] = toMinimap(sim, sim.x + 500, roadCenterZ(sim.x + 500), 120, 140);
  assert.ok(ahead < cy, 'The road ahead is drawn upward');
  const curve = nextCurve(0);
  assert.ok(curve && curve.distance > 0 && ['left', 'right'].includes(curve.direction));
  assert.equal(nextSpeedBump(0), 36);
  assert.equal(nextSpeedBump(40), 50);
  // True on the road; the country road comes closer.
  assert.equal(drawnLateral(3.6), 3.6);
  assert.ok(drawnLateral(42) < 30 && drawnLateral(-42) === -drawnLateral(42));
  // Perspective: the road narrows with distance.
  const near = toMinimap(sim, sim.x, roadCenterZ(sim.x) + 5, 120, 140)[0] - cx,
    far =
      toMinimap(sim, sim.x + 800, roadCenterZ(sim.x + 800) + 5, 120, 140)[0] -
      toMinimap(sim, sim.x + 800, roadCenterZ(sim.x + 800), 120, 140)[0];
  assert.ok(far < near / 5);
  // Height above sea level and the grade as shown.
  assert.equal(altitudeAt(300), baseAltitude + roadElevation(300));
  assert.equal(gradeLabel(0.002).text, 'level');
  assert.deepEqual([gradeLabel(0.031).arrow, gradeLabel(0.031).text], ['↗', '3.1%']);
  assert.equal(gradeLabel(-0.04).arrow, '↘');
});

test('The branch road splits from the right lane, runs beside the road and merges back', () => {
  const { start, period, diverge, length, separation } = roadBranch;
  assert.equal(branchOffset(start - 1), null, 'No branch before its start');
  assert.equal(branchOffset(start), roadLanes.at(-1), 'It leaves from the right lane');
  assert.equal(branchOffset(start + diverge + length / 2), separation);
  assert.ok(Math.abs(branchOffset(start + 2 * diverge + length) - roadLanes.at(-1)) < 1e-9);
  assert.equal(nextBranch(0), start);
  assert.equal(nextBranch(start + 10), 0);
  // The main road keeps both rails, except where the country road leaves and
  // rejoins; beside the country road the right rail faces both ways; the
  // country road itself has none.
  const right = (x) => guardrailsAt(x).find((r) => r.lateral > 0);
  assert.equal(right(start - 10).traffic, 0, 'Solid from both sides');
  assert.equal(right(start + 50), undefined, 'The rail opens at the mouth');
  assert.equal(right(start + diverge + length / 2).traffic, 0);
  assert.equal(right(start + 2 * diverge + length - 50), undefined);
  for (let x = start - 50; x < start + period - 100; x += 0.5) {
    const rails = guardrailsAt(x);
    assert.ok(
      rails.some((r) => r.lateral < 0),
      `left rail at ${x}`
    );
    assert.ok(
      rails.every((r) => Math.abs(r.lateral) <= 7.3 + 1e-9),
      'No rail beyond the main road'
    );
  }
});

test('A car can drive the branch and back without touching a rail', () => {
  const sim = new DrivingSimulation(undefined, guardedRoad);
  sim.reset(25);
  const { start, diverge, length } = roadBranch;
  const path = (x) => branchOffset(x) ?? roadLanes.at(-1);
  sim.x = start - 150;
  sim.z = roadCenterZ(sim.x) + roadLanes.at(-1);
  sim.heading = -Math.atan(roadCenterSlope(sim.x));
  let furthest = 0;
  while (sim.x < start + 2 * diverge + length + 100) {
    const limit = Math.min(25, curveSpeed(sim.x, path));
    sim.step(
      1 / 60,
      {
        accelerate: sim.speed < limit,
        brake: sim.speed > limit + 2,
        steerAngle: laneKeepingSteer(sim, path),
      },
      true
    );
    assert.equal(sim.railContact, null, `rail contact at x ${sim.x.toFixed(0)}`);
    assert.ok(Math.abs(roadLateral(sim.x, sim.z) - path(sim.x)) < 1.5, 'stays on the branch');
    furthest = Math.max(furthest, roadLateral(sim.x, sim.z));
  }
  assert.ok(furthest > 40, 'It really went out along the branch');
});

test('The gore rail stops a car leaving the main road between the two roads', () => {
  const { start, diverge, length } = roadBranch;
  const sim = new DrivingSimulation(undefined, guardedRoad);
  sim.reset(25);
  sim.x = start + diverge + length / 2;
  sim.z = roadCenterZ(sim.x) + roadLanes.at(-1);
  sim.heading = -Math.atan(roadCenterSlope(sim.x));
  let contact = false;
  for (let t = 0; t < 4; t += 1 / 60) {
    sim.step(1 / 60, { steerAngle: -0.05 }, true);
    contact ||= Boolean(sim.railContact);
    assert.ok(roadLateral(sim.x, sim.z) + 0.95 < 7.3, 'The body stays on the road side');
  }
  assert.ok(contact);
});

test('Self-driving cruises up to the set speed and hands over on a pedal', () => {
  const sim = new DrivingSimulation(undefined, guardedRoad);
  sim.z = 0;
  for (let t = 0; t < 20; t += 1 / 60)
    sim.step(1 / 60, { cruiseSpeed: 25, steerAngle: laneKeepingSteer(sim, 0) }, true);
  assert.ok(Math.abs(sim.speed - 25) < 0.8, `cruising at ${(sim.speed * 3.6).toFixed(0)} km/h`);
  // Braking takes over from cruise control at once.
  const before = sim.speed;
  for (let t = 0; t < 1; t += 1 / 60) sim.step(1 / 60, { cruiseSpeed: 25, brake: true }, true);
  assert.ok(sim.speed < before - 3);
});

test('Self-driving slows to 50 km/h over each full-width speed bump', async () => {
  const { bumpSpeed } = await import('../public/lane-keeping.js');
  // Bumps span x 35.25…36.75 and 86.8…93.2 in every 120 m.
  assert.ok(Math.abs(bumpSpeed(35) - 13.9) < 1e-9, 'On the bump');
  assert.ok(Math.abs(bumpSpeed(90 + 120) - 13.9) < 1e-9, 'On the speed table');
  assert.ok(bumpSpeed(0) > 18, 'Well before the bump it may go faster');
  assert.ok(bumpSpeed(20) < bumpSpeed(0), 'and slows on the approach');
});

test('Guardrails stop a car coming from the field too', () => {
  const sim = new DrivingSimulation(undefined, guardedRoad);
  sim.reset(15);
  const x = 2000;
  sim.x = x;
  sim.z = roadCenterZ(x) - 14;
  // Heading across toward the road (toward +z is a right turn of 90°).
  sim.heading = -Math.atan(roadCenterSlope(x)) - 0.6;
  let contact = false;
  for (let t = 0; t < 4; t += 1 / 60) {
    sim.step(1 / 60, {}, true);
    contact ||= Boolean(sim.railContact);
    assert.ok(roadLateral(sim.x, sim.z) < -7.3 + 0.05, 'The car stays on the field side');
  }
  assert.ok(contact);
});

test('The autopilot keeps left and flashes slower cars out of its way', async () => {
  const { fastLanePlan, fastLane } = await import('../public/lane-keeping.js');
  const base = { cruise: 32, clearLeft: true, clearRight: true, flashes: 0, sinceFlash: 99 };
  assert.equal(fastLanePlan({ ...base, lane: 2, leader: null }), 'left', 'Moves left when clear');
  assert.equal(fastLanePlan({ ...base, lane: 1, clearLeft: false, leader: null }), null);
  assert.equal(fastLanePlan({ ...base, lane: 0, leader: null }), null, 'Stays left');
  const slow = { gap: 40, speed: 26, moving: false };
  assert.equal(fastLanePlan({ ...base, lane: 0, leader: slow }), 'flash');
  assert.equal(
    fastLanePlan({ ...base, lane: 0, leader: slow, sinceFlash: 1 }),
    null,
    'Not again yet'
  );
  assert.equal(
    fastLanePlan({ ...base, lane: 0, leader: { ...slow, moving: true } }),
    null,
    'Waits while it moves over'
  );
  assert.equal(
    fastLanePlan({ ...base, lane: 0, leader: { ...slow, gap: fastLane.flashGap + 10 } }),
    null
  );
  assert.equal(
    fastLanePlan({ ...base, lane: 0, leader: { ...slow, speed: 35 } }),
    null,
    'Not at faster cars'
  );
  const ignored = { ...base, lane: 0, leader: slow, flashes: fastLane.patience };
  assert.equal(fastLanePlan(ignored), 'right', 'Ignored, goes round on the right');
  assert.equal(fastLanePlan({ ...ignored, clearRight: false, sinceFlash: 5 }), null);
  assert.equal(fastLanePlan({ ...ignored, clearRight: false }), 'flash', 'No room: flashes again');
});

test('In the left lane the autopilot presses on in spells, up toward 180 km/h', async () => {
  const { AutopilotPace, autopilotPace } = await import('../public/lane-keeping.js');
  let seed = 7;
  const pace = new AutopilotPace(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  let top = 0,
    pushes = 0,
    was = false,
    fallMax = 0,
    last = pace.set;
  for (let t = 0; t < 600; t += 0.1) {
    const { speed, accel } = pace.step(0.1, { fastLane: true, speed: 40 });
    top = Math.max(top, speed);
    if (pace.pushing && !was) pushes++;
    was = pace.pushing;
    fallMax = Math.max(fallMax, (last - speed) / 0.1);
    last = speed;
    assert.ok(accel > 0.5 && accel < 4.5);
  }
  assert.ok(top * 3.6 > 170 && top <= autopilotPace.push[1], `top ${top * 3.6} km/h`);
  assert.ok(pushes >= 5 && pushes < 60, `${pushes} pushes in ten minutes`);
  assert.ok(fallMax <= autopilotPace.liftOff + 1e-9, 'Lifts off rather than brakes');
  // Out of the left lane: back to 90 km/h, unless going round a car.
  for (let t = 0; t < 60; t += 0.1) pace.step(0.1, { fastLane: false });
  assert.equal(pace.set, autopilotPace.slow);
  assert.ok(pace.step(0.1, { fastLane: false, passing: true }).speed > autopilotPace.slow);
});

test('The autopilot slows for the speed cameras and the tunnel', async () => {
  const { cameraSpeed, speedCameras, fineFor } = await import('../public/speed-cameras.js');
  const { structureLayout } = await import('../public/road-structures.js');
  for (const camera of speedCameras) {
    const at = camera.at + structureLayout.period;
    assert.equal(fineFor(cameraSpeed(at) * 3.6, camera.limit), 0, 'No fine passing');
    assert.ok(cameraSpeed(at - 1500) * 3.6 > 180, 'Free well before');
  }
  const { from, to } = structureLayout.tunnel;
  assert.ok(
    Math.abs(cameraSpeed(from + structureLayout.period + (to - from) / 2) * 3.6 - 110) < 0.5
  );
});
