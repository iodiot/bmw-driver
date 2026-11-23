import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Traffic, collideWithTraffic, trafficLayout } from '../public/traffic.js';
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
