import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Traffic, collideWithTraffic, rideOver, trafficLayout } from '../public/traffic.js';
import { roadCenterZ, roadLanes } from '../public/road-profile.js';

function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}
// Do any two vehicles overlap (side by side within their widths and nose to
// tail within their lengths)?
function overlaps(vehicles) {
  for (let i = 0; i < vehicles.length; i++)
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i],
        b = vehicles[j];
      if (
        Math.abs(a.lat - b.lat) < (a.width + b.width) / 2 - 0.1 &&
        Math.abs(a.x - b.x) < (a.length + b.length) / 2 - 0.2
      )
        return [a, b];
    }
  return null;
}

test('Traffic flows round a car at motorway pace without anyone running into anyone', () => {
  const traffic = new Traffic({ random: seeded(7) });
  // The car drives as the autopilot does: 90 km/h, keeping its distance.
  let x = 0,
    speed = 25;
  traffic.reset(x, 0);
  assert.equal(traffic.vehicles.length, trafficLayout.count);
  const dt = 1 / 30;
  let changes = 0;
  for (let t = 0; t < 240; t += dt) {
    const leader = traffic.leaderFor(x, 0);
    speed = Math.max(0, speed + Traffic.acceleration(speed, 25, leader, false) * dt);
    x += speed * dt;
    const before = new Map(traffic.vehicles.map((v) => [v.id, v.lane]));
    traffic.step(dt, { x, lat: 0, speed });
    for (const v of traffic.vehicles)
      if (before.has(v.id) && before.get(v.id) !== v.lane) changes++;
    const hit = overlaps(traffic.vehicles);
    assert.equal(hit, null, hit && `${hit[0].type} and ${hit[1].type} at ${hit[0].x.toFixed(1)}`);
    for (const v of traffic.vehicles) {
      // Lorries never take the left lane.
      if (v.lorry) assert.ok(v.lat > roadLanes[0] + 1);
      assert.ok(Math.abs(v.lat) < 4, 'on the carriageway');
      // And none of them sits in the car.
      assert.ok(
        Math.abs(v.lat) > (v.width + 1.9) / 2 - 0.1 ||
          Math.abs(v.x - x) > (v.length + 4.9) / 2 - 0.2
      );
    }
  }
  assert.equal(traffic.vehicles.length, trafficLayout.count, 'kept topped up round the car');
  assert.ok(changes > 5, `vehicles overtake and keep right (${changes} lane changes)`);
});

test('Traffic stops behind a car stopped in its lane, or goes round it', () => {
  const traffic = new Traffic({ count: 0, random: seeded(3) });
  const v = traffic.place(0, { x: 1e6, lat: 0, length: 4.9, width: 1.9, speed: 0 });
  v.lat = 0;
  v.lane = 1;
  v.speed = v.desired = 30;
  // The car stands 150 m ahead in the middle lane; the right lane is free.
  const player = { x: 150 + v.length / 2, lat: 0, speed: 0 };
  for (let t = 0; t < 30; t += 1 / 30) traffic.step(1 / 30, player);
  const nose = v.x + v.length / 2,
    tail = player.x - 2.45;
  assert.ok(nose < tail || Math.abs(v.lat) > 2.5, 'stopped short of it or passed beside it');
});

test('Driving into the back of a vehicle trades speed and pushes the car back', () => {
  const traffic = new Traffic({ count: 0, random: seeded(5) });
  const v = traffic.place(100, { x: 1e6, lat: 0, length: 4.9, width: 1.9, speed: 0 });
  v.lat = 0;
  v.speed = 20;
  const sim = {
    x: 100 - v.length / 2 - 2.4,
    z: roadCenterZ(100 - v.length / 2 - 2.4),
    heading: 0,
    speed: 35,
    lateralVelocity: 0,
  };
  const hit = collideWithTraffic(sim, traffic);
  assert.ok(hit && hit.impact > 10);
  assert.ok(sim.speed < 30 && sim.speed <= v.speed, `the car slows (${sim.speed.toFixed(1)} m/s)`);
  assert.ok(v.speed > 20, 'and shoves the other one on');
  assert.ok(sim.x + 2.45 <= v.x - v.length / 2 + 1e-6, 'no longer inside it');
});

test('A vehicle hit hard stops with its hazards on, then drives on', () => {
  const traffic = new Traffic({ count: 0, random: seeded(9) });
  const v = traffic.place(100, { x: 1e6, lat: 0, length: 4.9, width: 1.9, speed: 0 });
  v.lat = 0;
  v.speed = v.desired = 25;
  const sim = {
    x: 100 - v.length / 2 - 2.4,
    z: roadCenterZ(100 - v.length / 2 - 2.4),
    heading: 0,
    speed: 45,
    lateralVelocity: 0,
  };
  collideWithTraffic(sim, traffic);
  assert.ok(v.crash, 'knocked');
  let stopped = false;
  for (let t = 0; t < 30; t += 1 / 30) {
    traffic.step(1 / 30, null);
    if (v.speed < 0.1) stopped = true;
    if (stopped && v.crash) assert.ok(Traffic.blink(v) !== undefined);
  }
  assert.ok(stopped, 'it stopped');
  assert.equal(v.crash, null, 'and drove on');
  assert.ok(v.speed > 5);
});

test('A horn moves the car ahead over to the right, or hurries it', async () => {
  const { Traffic } = await import('../public/traffic.js');
  const { roadLanes } = await import('../public/road-profile.js');
  const traffic = new Traffic({ count: 0, random: () => 0.5 });
  traffic.reset(0, 0);
  traffic.vehicles.length = 0;
  const far = { x: -5000, lat: 0, length: 4.9, width: 1.9 };
  const ahead = traffic.place(40, far, true);
  const blocker = traffic.place(400, far, true);
  Object.assign(ahead, { lane: 0, lat: roadLanes[0], type: 'sedan', change: null, crash: null });
  Object.assign(blocker, { x: -400 });
  const yielding = traffic.honk(0, roadLanes[0]);
  assert.equal(yielding, ahead);
  assert.equal(ahead.change.to, 1, 'Moves one lane right');
  // Blocked on the right: it hurries instead.
  Object.assign(blocker, { x: 42, lane: 2, lat: roadLanes[2], type: 'sedan', change: null });
  Object.assign(ahead, { lane: 1, lat: roadLanes[1], change: null });
  traffic.honk(0, roadLanes[1]);
  assert.ok(ahead.hurried > 0 && !ahead.change);
  // (A slow vehicle, below what the speed bumps allow.)
  const hurried = traffic.limitAt({ ...ahead, desired: 10 }),
    calm = traffic.limitAt({ ...ahead, desired: 10, hurried: 0 });
  assert.ok(hurried > calm, 'A little faster while hurried');
  assert.equal(traffic.honk(0, roadLanes[1] + 0), ahead);
  assert.equal(traffic.honk(-200, roadLanes[1]), null, 'Too far to hear');
});

test("A lorry's shadow falls on the car beside it, not on one in front", async () => {
  const { trafficShade, vehicleTypes } = await import('../public/traffic.js');
  const { roadCenterZ } = await import('../public/road-profile.js');
  const x = 5000;
  const lorry = { type: 'lorry', x, lat: 0, yaw: 0, ...vehicleTypes.lorry };
  // The sun low in the -z direction: shadows fall toward +z.
  const shift = { x: 0, y: -1.2 };
  const beside = [[x, 1.05, roadCenterZ(x) + 3.6]],
    ahead = [[x + 30, 1.05, roadCenterZ(x + 30) + 3.6]],
    sunnySide = [[x, 1.05, roadCenterZ(x) - 3.6]];
  assert.equal(trafficShade([lorry], beside, shift), 1);
  assert.equal(trafficShade([lorry], ahead, shift), 0);
  assert.equal(trafficShade([lorry], sunnySide, shift), 0);
  // A low hatchback casts no shadow up to a lorry's windows.
  const hatch = { type: 'hatch', x, lat: 0, yaw: 0, ...vehicleTypes.hatch };
  assert.equal(trafficShade([hatch], [[x, 1.6, roadCenterZ(x) + 2.5]], shift), 0);
});

test('a car rides up over a speed bump nose first, rocks and settles', () => {
  // A bump 10 cm high and 1 m long across the road at x = 20.
  const bump = (x) => (Math.abs(x - 20) < 0.5 ? 0.1 * Math.cos(Math.PI * (x - 20)) : 0);
  const v = { x: 0, lat: 0, length: 4.6, width: 1.8 };
  let highest = 0,
    noseUp = 0,
    noseDown = 0;
  for (let t = 0; t < 6; t += 1 / 60) {
    v.x += 25 / 3.6 / 60;
    const ride = rideOver(v, 1 / 60, (x) => bump(x));
    highest = Math.max(highest, ride.y);
    if (v.x < 20.5) noseUp = Math.max(noseUp, ride.pitch);
    noseDown = Math.min(noseDown, ride.pitch);
  }
  assert.ok(highest > 0.01 && highest < 0.1, `heave ${highest}`);
  assert.ok(noseUp > 0.005, `nose up ${noseUp}`);
  assert.ok(noseDown < -0.005, `nose down ${noseDown}`);
  assert.ok(Math.abs(v.ride.y) < 0.002 && Math.abs(v.ride.pitch) < 0.001, 'settled');
});

test('a pothole under one side rolls the car toward it', () => {
  const hole = (x, lat) => (Math.abs(x - 10) < 0.4 && lat > 0.3 ? -0.06 : 0);
  const v = { x: 0, lat: 0, length: 4.6, width: 1.8 };
  let roll = 0;
  for (let t = 0; t < 3; t += 1 / 60) {
    v.x += 5 / 60;
    roll = Math.min(roll, rideOver(v, 1 / 60, hole).roll);
  }
  assert.ok(roll < -0.003, `roll ${roll}`);
});
