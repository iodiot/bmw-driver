import { roadGrade } from './terrain.js';
import { oncomingLanes, roadLanes, roadCenterZ, roadCenterSlope } from './road-profile.js';
import { bumpSpeed } from './lane-keeping.js';
import { structureLayout, nearestOccurrence } from './road-structures.js';

// Traffic on the motorway: cars, vans and lorries in the three lanes, all
// going the car's way (the carriageway is one-way). Each keeps its own
// pace with the intelligent driver model (easing up to its speed, keeping a
// time gap to whatever is ahead, braking harder the faster it closes), keeps
// right, overtakes on the left with its indicator on, slows for the speed
// bumps and the tunnel's 100 km/h. The car itself is one of the road users:
// traffic brakes behind it and goes round it. Vehicles live in a window
// round the car and are taken from behind it to far ahead (or the other way
// round), out of sight beyond the haze.

// Lanes by index: 0 the left (fast) lane, 2 the right one.
const lanes = roadLanes;
export const vehicleTypes = Object.freeze({
  hatch: { length: 4.25, width: 1.79, speed: [28, 36], lanes: [0, 1, 2], weight: 4, lorry: false },
  sedan: { length: 4.8, width: 1.83, speed: [30, 38], lanes: [0, 1, 2], weight: 4, lorry: false },
  suv: { length: 4.65, width: 1.88, speed: [28, 35], lanes: [0, 1, 2], weight: 3, lorry: false },
  van: { length: 5.93, width: 2.0, speed: [25, 30], lanes: [1, 2], weight: 2, lorry: false },
  lorry: { length: 16.5, width: 2.55, speed: [21.5, 24.5], lanes: [1, 2], weight: 3, lorry: true },
});
// Roof heights (m), for the shadows they cast.
export const vehicleHeights = Object.freeze({
  hatch: 1.48,
  sedan: 1.47,
  suv: 1.72,
  van: 2.45,
  lorry: 3.95,
});

// How much of a set of points (x, y, z) lies in the traffic's sun shadow,
// 0 to 1: a point is shaded when, following the way to the sun from it (its
// horizontal part over its height is `shift`, x and z), the line passes
// through a vehicle's body. Bodies are boxes on the road at their place,
// along the road's direction there.
export function trafficShade(vehicles, points, shift) {
  if (!points.length) return 0;
  let shaded = 0;
  for (const [px, py, pz] of points) {
    let hit = false;
    for (const v of vehicles) {
      if (hit) break;
      const top = vehicleHeights[v.type] ?? 1.5;
      if (top <= py || Math.abs(v.x - px) > v.length / 2 + (top - py) * Math.abs(shift.x) + 1)
        continue;
      const heading = -Math.atan(roadCenterSlope(v.x)) + (v.yaw ?? 0),
        c = Math.cos(heading),
        s = Math.sin(heading),
        cz = roadCenterZ(v.x) + v.lat;
      // Up the way to the sun, from the point's height to the roof.
      for (let i = 0; i <= 6 && !hit; i++) {
        const t = ((top - py) * i) / 6;
        const dx = px + shift.x * t - v.x,
          dz = pz + shift.y * t - cz;
        const along = dx * c - dz * s,
          across = dx * s + dz * c;
        hit = Math.abs(along) <= v.length / 2 && Math.abs(across) <= v.width / 2;
      }
    }
    if (hit) shaded++;
  }
  return shaded / points.length;
}

// Intelligent driver model: comfortable acceleration and braking (m/s²),
// time gap (s) and standstill gap (m).
const drivers = {
  car: { a: 1.6, b: 2.6, T: 1.3, s0: 2.5 },
  lorry: { a: 0.55, b: 2, T: 1.8, s0: 3.5 },
};
export const trafficLayout = Object.freeze({
  count: 16,
  behind: 300,
  ahead: 650,
  // Where vehicles taken from one end appear at the other.
  spawnAhead: [470, 620],
  spawnBehind: [250, 290],
  // A lane change: indicator first, then across the lane.
  signalLead: 1.3,
  changeTime: { car: 3.4, lorry: 5.5 },
  tunnelSpeed: 100 / 3.6,
});
const paints = [
  ['#e9eaeb', 5],
  ['#b9bdc1', 4],
  ['#6b7075', 3],
  ['#1a1c1f', 4],
  ['#22355e', 2],
  ['#8c1d1d', 2],
  ['#2f4a39', 1],
  ['#c9b99a', 1],
  ['#3b5f8c', 1],
];
const vanPaints = [
  ['#eeeeee', 6],
  ['#b9bdc1', 2],
  ['#22355e', 1],
];
const cabPaints = [
  ['#e9eaeb', 3],
  ['#a51f1f', 2],
  ['#1f3e7a', 2],
  ['#d7d9da', 1],
];
const trailerPaints = [
  ['#f1f1ef', 4],
  ['#9ea4a8', 2],
  ['#2c4f87', 1],
  ['#2f6b45', 1],
  ['#b02a2a', 1],
];
function pick(list, random) {
  const total = list.reduce((n, [, w]) => n + w, 0);
  let r = random() * total;
  for (const [value, w] of list) if ((r -= w) <= 0) return value;
  return list[0][0];
}
const smoothstep = (t) => t * t * (3 - 2 * t);

export class Traffic {
  constructor({ count = trafficLayout.count, random = Math.random } = {}) {
    this.count = count;
    this.random = random;
    this.vehicles = [];
    this.serial = 0;
  }

  // Vehicles spread over the window round x, clear of the car (at `lateral`).
  reset(x = 0, lateral = 0) {
    this.vehicles = [];
    const player = { x, lat: lateral, length: 4.9, width: 1.9, speed: 0 };
    for (let tries = 0; this.vehicles.length < this.count && tries < 400; tries++) {
      const at = x - 180 + this.random() * 760;
      this.place(at, player, true);
    }
  }

  // A new vehicle at x in a lane with room, or none.
  place(at, player, anyType = false) {
    const type = pick(
      Object.entries(vehicleTypes).map(([name, t]) => [name, t.weight]),
      this.random
    );
    const spec = vehicleTypes[type];
    const lane = spec.lanes[Math.floor(this.random() * spec.lanes.length)];
    // Lorries keep to the right lane, mostly.
    const index = spec.lorry && this.random() < 0.8 ? 2 : lane;
    const lat = lanes[index];
    const others = [...this.vehicles, player];
    const clear = others.every(
      (o) =>
        Math.abs(o.lat - lat) > (o.width + spec.width) / 2 + 0.4 ||
        Math.abs(o.x - at) > (o.length + spec.length) / 2 + 25
    );
    if (!clear && !anyType) return null;
    if (!clear) return null;
    const [low, high] = spec.speed;
    const desired = low + (high - low) * this.random();
    const vehicle = {
      id: this.serial++,
      type,
      lorry: spec.lorry,
      length: spec.length,
      width: spec.width,
      x: at,
      lat,
      lane: index,
      from: index,
      speed: desired * (0.9 + 0.1 * this.random()),
      desired,
      accel: 0,
      latSpeed: 0,
      yaw: 0,
      crash: null,
      change: null,
      signal: 0,
      clock: this.random() * 0.7,
      decide: this.random() * 1.5,
      sinceChange: 10,
      hurried: 0,
      colour: spec.lorry
        ? pick(cabPaints, this.random)
        : pick(type === 'van' ? vanPaints : paints, this.random),
      trailer: spec.lorry ? pick(trailerPaints, this.random) : null,
    };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  // The nearest road user ahead of `v` (or behind, `dir` −1) whose lateral
  // extent meets the band round `lat`, as {gap, speed, who}.
  neighbour(v, lat, users, dir = 1) {
    let best = null;
    for (const o of users) {
      if (o === v) continue;
      // Where it is, or the lane it is signalling into.
      const band = (o.width + v.width) / 2 + 0.3;
      const into = o.change ? Math.abs(lanes[o.change.to] - lat) <= band : false;
      if (Math.abs(o.lat - lat) > band && !into) continue;
      const gap = dir * (o.x - v.x) - (o.length + v.length) / 2;
      if (dir * (o.x - v.x) <= 0) continue;
      if (!best || gap < best.gap) best = { gap, speed: o.speed, who: o };
    }
    return best;
  }

  // Intelligent driver model acceleration toward `desired` behind `leader`.
  static acceleration(v, desired, leader, lorry) {
    const p = lorry ? drivers.lorry : drivers.car;
    let a = p.a * (1 - Math.pow(Math.max(0, v) / desired, 4));
    if (leader) {
      const dv = v - leader.speed;
      const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
      a -= p.a * Math.pow(sStar / Math.max(leader.gap, 0.1), 2);
    }
    return Math.max(-9, a);
  }

  // Speed a vehicle at x wants: its own, less for the bumps and the tunnel.
  limitAt(v) {
    // Hurried by a horn: a little faster for a while.
    // (`speedScale`: slower on winter roads.)
    let desired = v.desired * (this.speedScale ?? 1) + (v.hurried > 0 ? 3 : 0);
    const front = v.x + v.length / 2;
    desired = Math.min(desired, bumpSpeed(front));
    const { from, to } = structureLayout.tunnel;
    const start = nearestOccurrence(front, from);
    if (front > start - 250 && front < start + (to - from) + 20)
      desired = Math.min(desired, trafficLayout.tunnelSpeed * (v.lorry ? 0.85 : 1.03));
    return Math.max(desired, 1);
  }

  // Is moving `v` into lane `index` safe and worth it?
  laneOpen(v, index, users, minAhead) {
    const lat = lanes[index];
    const ahead = this.neighbour(v, lat, users, 1),
      behind = this.neighbour(v, lat, users, -1);
    if (ahead && ahead.gap < minAhead) return false;
    if (behind && behind.gap < 8 + Math.max(0, behind.speed - v.speed) * 3.5) return false;
    return true;
  }

  // Advances everyone by dt; `player` is the car: {x, lat, speed} (or null
  // when it is off the carriageway).
  step(dt, player) {
    if (dt <= 0) return;
    const users = [...this.vehicles];
    if (player) users.push({ ...player, length: 4.9, width: 1.9, isPlayer: true });
    for (const v of this.vehicles) {
      v.clock += dt;
      v.sinceChange += dt;
      if (v.hurried > 0) v.hurried -= dt;
      // Who is ahead in the lane, or in either lane while crossing.
      let leader = this.neighbour(v, v.lat, users, 1);
      if (v.change) {
        const other = this.neighbour(v, lanes[v.change.to], users, 1);
        if (other && (!leader || other.gap < leader.gap)) leader = other;
      }
      const desired = this.limitAt(v);
      // Hills: a laden lorry slows on a climb and runs on downhill; cars
      // mostly make up for them.
      v.accel =
        Traffic.acceleration(v.speed, desired, leader, v.lorry) -
        9.81 * roadGrade(v.x) * (v.lorry ? 0.75 : 0.2);
      // Hit by the car: thrown off line, it brakes to a stop with its
      // hazard lights on, waits, then drives on.
      if (v.crash) {
        const c = v.crash;
        c.time += dt;
        v.yaw += c.spin * dt;
        c.spin *= Math.exp(-2.5 * dt);
        v.lat = Math.max(-6.4, Math.min(6.4, v.lat + c.drift * dt));
        c.drift *= Math.exp(-3 * dt);
        if (c.time < c.wait) v.accel = v.speed > 0 ? -Math.min(7, 2 + v.speed) : 0;
        else {
          // Straightening up as it moves off.
          v.yaw *= Math.exp(-1.5 * dt);
          v.accel = Math.min(v.accel, 1);
          if (Math.abs(v.yaw) < 0.01 && c.time > c.wait + 2) v.crash = null;
        }
      }
      v.speed = Math.max(0, v.speed + v.accel * dt);
      v.x += v.speed * dt;
      v.leader = leader;
      if (!v.crash) this.decide(v, leader, users, dt, desired);
      this.move(v, dt, users);
    }
    this.recycle(player);
  }

  decide(v, leader, users, dt, desired) {
    if (v.change) return;
    v.decide -= dt;
    if (v.decide > 0) return;
    v.decide = 0.8 + this.random() * 0.8;
    if (v.sinceChange < 4) return;
    const spec = vehicleTypes[v.type];
    const can = (index) => index >= 0 && index <= 2 && spec.lanes.includes(index);
    const stuck = leader && leader.speed < 3 && leader.gap < 35;
    // Overtake on the left when held up by something slower.
    const heldUp =
      leader && leader.gap < 40 + v.speed * 1.6 && leader.speed < desired - (v.lorry ? 1.2 : 2);
    if (heldUp && can(v.lane - 1) && (!v.lorry || this.random() < 0.35)) {
      const there = this.neighbour(v, lanes[v.lane - 1], users, 1);
      const better = !there || there.speed > leader.speed + 1 || there.gap > leader.gap + 30;
      if (better && this.laneOpen(v, v.lane - 1, users, 12 + 0.5 * v.speed))
        return this.begin(v, v.lane - 1);
    }
    // Round a car stopped in the lane, by either side.
    if (stuck && can(v.lane + 1) && this.laneOpen(v, v.lane + 1, users, 15))
      return this.begin(v, v.lane + 1);
    // Keep right when the right lane is free well ahead.
    if (can(v.lane + 1) && !heldUp) {
      const there = this.neighbour(v, lanes[v.lane + 1], users, 1);
      const roomy = !there || there.gap > 70 + v.speed * 1.5 || there.speed > desired - 1;
      if (roomy && this.laneOpen(v, v.lane + 1, users, 40)) return this.begin(v, v.lane + 1);
    }
  }

  begin(v, to, reaction = 0) {
    v.change = { from: v.lane, to, t: -trafficLayout.signalLead - reaction };
    v.signal = to < v.lane ? -1 : 1;
    v.clock = 0;
  }

  move(v, dt, users = []) {
    if (!v.change) {
      v.latSpeed = 0;
      // The indicator stays on a moment after the move.
      if (v.signal && v.sinceChange > 0.6) v.signal = 0;
      return;
    }
    const c = v.change;
    const duration = v.lorry ? trafficLayout.changeTime.lorry : trafficLayout.changeTime.car;
    c.t += dt;
    let k = Math.max(0, Math.min(1, c.t / duration));
    // Someone alongside in the lane it is moving into: back out while it
    // still can.
    if (k > 0 && k < 0.5) {
      const ahead = this.neighbour(v, lanes[c.to], users, 1),
        behind = this.neighbour(v, lanes[c.to], users, -1);
      if ((ahead && ahead.gap < 2) || (behind && behind.gap < 2)) {
        v.change = { from: c.to, to: c.from, t: (1 - k) * duration };
        v.signal = -v.signal;
        k = 1 - k;
        return;
      }
    }
    const lat = lanes[c.from] + (lanes[c.to] - lanes[c.from]) * smoothstep(k);
    v.latSpeed = (lat - v.lat) / dt;
    v.lat = lat;
    if (k > 0.5) v.lane = c.to;
    if (k >= 1) {
      v.lane = c.to;
      v.change = null;
      v.sinceChange = 0;
    }
  }

  // Vehicles left far behind reappear far ahead, and the other way round,
  // each in a lane with room.
  recycle(player) {
    if (!player) return;
    const px = player.x;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.x > px - trafficLayout.behind && v.x < px + trafficLayout.ahead) continue;
      this.vehicles.splice(i, 1);
    }
    let tries = 0;
    while (this.vehicles.length < this.count && tries++ < 20) {
      // Mostly ahead; behind when the car is slower than the traffic.
      const fromBehind = this.random() < (player.speed < 22 ? 0.5 : 0.15);
      const [a, b] = fromBehind ? trafficLayout.spawnBehind : trafficLayout.spawnAhead;
      const at = px + (fromBehind ? -1 : 1) * (a + (b - a) * this.random());
      const v = this.place(at, { ...player, length: 4.9, width: 1.9 });
      // Ones arriving from behind come at their own pace, a little faster.
      if (v && fromBehind) v.speed = v.desired;
    }
  }

  // Is `v`'s indicator lit now (on for 0.4 s of every 0.7 s)?
  static blink(v) {
    if (v.crash) return v.crash.time % 0.7 < 0.4;
    return v.signal !== 0 && v.clock % 0.7 < 0.4;
  }

  // The nearest vehicle ahead of x within `range` m whose lane is within
  // The car sounds its horn at x, `lat`: the vehicle ahead in its lane,
  // within 90 m, moves over to the right if it can, or else hurries on for
  // a while. Returns it, or null.
  honk(x, lat) {
    return this.askToYield(x, lat, 90);
  }
  // The car flashes its headlights: seen in the mirror further off than a
  // horn is heard, and answered after a moment's reaction.
  flashedAt(x, lat) {
    return this.askToYield(x, lat, 150, 0.5);
  }
  askToYield(x, lat, range, reaction = 0) {
    const ahead = this.leaderFor(x, lat);
    if (!ahead || ahead.gap > range) return null;
    const v = ahead.who;
    if (v.crash || v.change) return v;
    const users = [...this.vehicles, { x, lat, speed: v.speed, length: 4.9, width: 1.9 }];
    const spec = vehicleTypes[v.type];
    if (v.lane < 2 && spec.lanes.includes(v.lane + 1) && this.laneOpen(v, v.lane + 1, users, 12)) {
      this.begin(v, v.lane + 1, reaction);
      v.sinceChange = 0;
    } else v.hurried = 8;
    return v;
  }

  // `band` m of `lat`: its distance (or Infinity).
  distanceAhead(x, lat, range = 400, band = 6) {
    let best = Infinity;
    for (const v of this.vehicles) {
      const d = v.x - v.length / 2 - x;
      if (d > 0 && d < range && Math.abs(v.lat - lat) < band) best = Math.min(best, d);
    }
    return best;
  }

  // The nearest vehicle ahead of a car at x, `lat` (its lateral band), as
  // {gap, speed, who}.
  leaderFor(x, lat, length = 4.9, width = 1.9) {
    return this.neighbour({ x, lat, length, width }, lat, this.vehicles, 1);
  }
  // Is a car at x, `lat` clear to move into the lane at `target`?
  laneClearFor(x, speed, target, length = 4.9, width = 1.9, minAhead = 25) {
    const me = { x, lat: target, length, width, speed };
    const ahead = this.neighbour(me, target, this.vehicles, 1),
      behind = this.neighbour(me, target, this.vehicles, -1);
    if (ahead && ahead.gap < minAhead) return false;
    if (behind && behind.gap < 10 + Math.max(0, behind.speed - speed) * 3.5) return false;
    return true;
  }
}

// The car (a simulation, see driving-physics.js) against the traffic: road
// users are boxes along the road. A nose-to-tail hit trades speed between
// the two (a lorry hardly gives), a side hit pushes the car off sideways;
// the contact goes where a guardrail strike's would, for sparks, the sound
// and the scrape marks. Returns the contact, or null.
// How a vehicle's body rides the road's speed bumps, humps and potholes:
// its heave (m), pitch (nose up, rad) and roll (rad, its right side up) follow
// what its four wheels stand on through a stiff, lightly damped suspension,
// so it rocks a moment after a bump. `heightAt(x, lat)` is the road's
// height under a point; the state is kept on `v.ride`.
export const rideSuspension = Object.freeze({ frequency: 1.7, damping: 0.32 });
export function rideOver(v, dt, heightAt) {
  const ride = (v.ride ??= { y: 0, vy: 0, pitch: 0, vp: 0, roll: 0, vr: 0 });
  const axle = v.length * 0.32,
    track = v.width * 0.42;
  const fl = heightAt(v.x + axle, v.lat - track),
    fr = heightAt(v.x + axle, v.lat + track),
    rl = heightAt(v.x - axle, v.lat - track),
    rr = heightAt(v.x - axle, v.lat + track);
  const targets = [
    ['y', 'vy', (fl + fr + rl + rr) / 4],
    ['pitch', 'vp', Math.atan2(fl + fr - rl - rr, 4 * axle)],
    ['roll', 'vr', Math.atan2(fr + rr - fl - rl, 4 * track)],
  ];
  const w = 2 * Math.PI * rideSuspension.frequency,
    k = w * w,
    c = 2 * rideSuspension.damping * w;
  // Small steps, as the spring is stiff.
  const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.01)),
    h = Math.min(dt, 0.1) / steps;
  for (const [key, rate, target] of targets)
    for (let i = 0; i < steps; i++) {
      ride[rate] += (k * (target - ride[key]) - c * ride[rate]) * h;
      ride[key] += ride[rate] * h;
    }
  return ride;
}

// The oncoming carriageway's traffic, on the route: vehicles coming the
// other way in its three lanes, lorries mostly in the outer (slow) one,
// each at its own pace and easing back behind a slower one ahead rather
// than changing lanes. Those that have passed the car turn up again far
// ahead of it, out of sight.
export const oncomingLayout = Object.freeze({
  // Where a vehicle turns up (ahead of the car) and how far behind it goes.
  ahead: Object.freeze([500, 950]),
  behind: 250,
  // The gap a faster one keeps behind a slower one in its lane.
  gap: 35,
});
export class OncomingTraffic {
  // `lanes`: the oncoming lanes' centres, fast lane first.
  constructor({ count = 10, random = Math.random, lanes = oncomingLanes } = {}) {
    this.count = count;
    this.random = random;
    this.lanes = lanes;
    this.vehicles = [];
    this.serial = 100000;
  }
  reset(x = 0) {
    this.vehicles = [];
    for (let tries = 0; this.vehicles.length < this.count && tries < 200; tries++)
      this.place(x - oncomingLayout.behind + this.random() * 1150);
  }
  place(at) {
    const type = pick(
      Object.entries(vehicleTypes).map(([name, t]) => [name, t.weight]),
      this.random
    );
    const spec = vehicleTypes[type];
    const index =
      spec.lorry && this.random() < 0.8
        ? 2
        : spec.lanes[Math.floor(this.random() * spec.lanes.length)];
    const lat = this.lanes[index];
    const clear = this.vehicles.every(
      (o) =>
        o.lane !== index || Math.abs(o.x - at) > (o.length + spec.length) / 2 + oncomingLayout.gap
    );
    if (!clear) return null;
    const [low, high] = spec.speed;
    const desired = low + (high - low) * this.random();
    const vehicle = {
      id: this.serial++,
      type,
      lorry: spec.lorry,
      length: spec.length,
      width: spec.width,
      x: at,
      lat,
      lane: index,
      speed: desired,
      desired,
      accel: 0,
      latSpeed: 0,
      // Turned round: it drives toward −x.
      yaw: Math.PI,
      crash: null,
      change: null,
      signal: 0,
      clock: this.random() * 0.7,
      oncoming: true,
      colour: spec.lorry
        ? pick(cabPaints, this.random)
        : pick(type === 'van' ? vanPaints : paints, this.random),
      trailer: spec.lorry ? pick(trailerPaints, this.random) : null,
    };
    this.vehicles.push(vehicle);
    return vehicle;
  }
  // Moves them along by dt with the car at x.
  update(dt, x) {
    for (const v of this.vehicles) {
      // The one ahead of it in its lane (at smaller x).
      let ahead = null;
      for (const o of this.vehicles)
        if (o !== v && o.lane === v.lane && o.x < v.x && (!ahead || o.x > ahead.x)) ahead = o;
      const gap = ahead ? v.x - ahead.x - (v.length + ahead.length) / 2 : Infinity;
      const target = gap < oncomingLayout.gap ? Math.min(v.desired, ahead.speed) : v.desired;
      const before = v.speed;
      v.speed += Math.max(-4, Math.min(1.2, target - v.speed)) * dt;
      v.accel = dt > 0 ? (v.speed - before) / dt : 0;
      v.x -= v.speed * dt;
    }
    // Those well behind the car come again far ahead of it.
    const [low, high] = oncomingLayout.ahead;
    this.vehicles = this.vehicles.filter((v) => v.x > x - oncomingLayout.behind);
    for (let tries = 0; this.vehicles.length < this.count && tries < 6; tries++)
      this.place(x + low + this.random() * (high - low));
  }
}

export const playerBox = Object.freeze({ halfLength: 2.45, halfWidth: 0.95 });
export function collideWithTraffic(sim, traffic) {
  const lat = sim.z - roadCenterZ(sim.x);
  let contact = null;
  for (const v of traffic.vehicles) {
    const dx = v.x - sim.x,
      dLat = v.lat - lat;
    const overlapX = v.length / 2 + playerBox.halfLength - Math.abs(dx),
      overlapL = v.width / 2 + playerBox.halfWidth - Math.abs(dLat);
    if (overlapX <= 0 || overlapL <= 0) continue;
    const heavy = v.lorry ? 0.12 : 0.5;
    let impact, side;
    if (overlapX < overlapL) {
      // Nose to tail: the closing speed is shared out.
      const ahead = dx > 0 ? 1 : -1;
      const closing = ahead * (sim.speed - v.speed);
      impact = Math.max(0, closing);
      if (closing > 0) {
        sim.speed -= ahead * closing * (1 - heavy * 0.6) * 0.85;
        v.speed = Math.max(0, v.speed + ahead * closing * heavy);
      }
      sim.x -= ahead * overlapX;
      sim.z = roadCenterZ(sim.x) + lat;
      side = 0;
    } else {
      // Side by side: pushed apart, the car more than a lorry.
      side = dLat > 0 ? 1 : -1;
      const push = overlapL * (v.lorry ? 1 : 0.7);
      sim.z -= side * push;
      v.lat += side * (overlapL - push);
      impact = Math.abs(sim.lateralVelocity) + Math.abs(v.latSpeed) + 1;
      sim.lateralVelocity *= -0.3;
      if (sim.tyres) sim.tyres.lateralVelocity = sim.lateralVelocity;
      sim.speed *= 0.98;
      v.speed *= 0.97;
    }
    sim.speed = Math.max(0, sim.speed);
    // A hard enough knock stops it, turned off line (a lorry hardly turns).
    if (impact > 2.5) {
      const kick = Math.min(1, impact / 25) * (v.lorry ? 0.15 : 1);
      const turn = side !== 0 ? -side : dLat >= 0 ? -1 : 1;
      v.crash = {
        time: 0,
        wait: 6 + 4 * Math.min(1, impact / 20),
        spin: (v.crash?.spin ?? 0) + turn * kick * 1.6,
        drift: (v.crash?.drift ?? 0) + (side !== 0 ? side : 0) * kick * 2,
      };
      v.yaw ??= 0;
      v.change = null;
      v.signal = 0;
    }
    const c = Math.cos(sim.heading),
      s = Math.sin(sim.heading);
    const hit = {
      x: sim.x + dx * 0.5,
      z: roadCenterZ(sim.x + dx * 0.5) + lat + dLat * 0.5,
      side,
      impact,
      scrape: Math.abs(sim.speed - v.speed),
      strength: impact + 0.25 * Math.abs(sim.speed - v.speed),
      velocityX: c * sim.speed,
      velocityZ: -s * sim.speed,
      railSlope: roadCenterSlope(sim.x),
      traffic: v,
    };
    if (!contact || hit.strength > contact.strength) contact = hit;
  }
  return contact;
}
