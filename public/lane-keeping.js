import { roadCenterSlope, roadLateral, roadLanes, obstacles, roadPeriod } from './road-profile.js';

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// The lane whose centre is nearest a lateral offset from the road centre.
export function nearestLane(lateral) {
  return roadLanes.reduce((best, lane) =>
    Math.abs(lane - lateral) < Math.abs(best - lateral) ? lane : best
  );
}

// A path is a lateral offset from the road centre: a lane's constant offset,
// or a function of x (the branch road's centre line).
const offsetAt = (path, x) => (typeof path === 'function' ? path(x) : path);

// Heading of a path at x, in the simulation's convention (positive turns
// toward -z), and its curvature (1/m).
function pathHeading(path, x, h = 0.5) {
  const slope = roadCenterSlope(x) + (offsetAt(path, x + h) - offsetAt(path, x - h)) / (2 * h);
  return -Math.atan(slope);
}
export function pathCurvature(path, x, h = 0.5) {
  return (pathHeading(path, x + h) - pathHeading(path, x - h)) / (2 * h);
}

// Highest speed (m/s) for the bends ahead: each point ahead allows the speed
// at which its curve needs `lateral` m/s² of grip, plus what slowing at
// `braking` m/s² sheds before reaching it. The default is a gentle 2 m/s²,
// about what lifting off sheds at motorway speed: hard braking mid-bend at
// 240 km/h unsettles the car more than the bend does.
export function curveSpeed(x, path = 0, { lateral = 4, braking = 2, lookahead = 900 } = {}) {
  let limit = Infinity;
  for (let d = 0; d <= lookahead; d += 10) {
    const k = Math.abs(pathCurvature(path, x + d)) + 1e-6;
    limit = Math.min(limit, Math.sqrt(lateral / k + 2 * braking * d));
  }
  return limit;
}

// Gains tuned in simulation: at full throttle up to the curve speed limit,
// over every bump and pothole, dry or wet, the car stays within about 1.5 m
// of the lane centre.
export const laneKeepingGains = Object.freeze({
  understeer: 4e-4,
  heading: 1,
  crossTrack: 2.5,
  yawDamping: 3,
});

// Lane keeping steer angle (rad) along a lane or path. Heading convention
// follows the simulation: positive steer and heading turn the car toward -z.
//  - feedforward: the path's curvature, scaled up for understeer at speed;
//  - heading: align the car with the path;
//  - cross track: return to the path (Stanley term);
//  - yaw damping: resist yaw rate beyond what the curve needs.
export function laneKeepingSteer(simulation, lane, gains = laneKeepingGains) {
  const v = simulation.speed,
    x = simulation.x;
  const curvature = pathCurvature(lane, x);
  const feedforward = Math.atan(simulation.wheelbase * curvature) * (1 + gains.understeer * v * v);
  const headingError = wrap(pathHeading(lane, x) - simulation.heading);
  const crossTrack = roadLateral(x, simulation.z) - offsetAt(lane, x);
  const yawExcess = simulation.yawRate - v * curvature;
  return (
    feedforward +
    gains.heading * headingError +
    Math.atan((gains.crossTrack * crossTrack) / (v + 2)) -
    (gains.yawDamping * yawExcess * simulation.wheelbase) / Math.max(v, 3)
  );
}

// Speed for the speed bumps ahead: over each full-width bump at `over` m/s
// (50 km/h), slowing at `braking` m/s² before it, as a driver would.
export function bumpSpeed(x, { over = 13.9, braking = 2.2 } = {}) {
  let distance = Infinity;
  for (const o of obstacles) {
    if (o.w < 5) continue;
    // From a few metres before the bump's start to its far edge.
    const d = (((o.x - o.l / 2 - 3 - x) % roadPeriod) + roadPeriod) % roadPeriod;
    distance = Math.min(distance, d > roadPeriod - o.l - 3 ? 0 : d);
  }
  return Math.sqrt(over * over + 2 * braking * distance);
}

// The self-driving car keeps to the left, fast lane: from another lane it
// moves over as soon as the left one is clear; in it, held up by something
// slower within `flashRange` m, it presses on as a driver in a hurry does
// on a Ukrainian motorway: close behind with the left indicator on (move
// over), flashing its headlights, first twice `flashEvery` s apart and then
// every `flashAgain` s till the other moves over. It never goes round on
// the right. `lane` is the lane's index from the left, `leader` {gap,
// speed, moving} the vehicle ahead in it (moving: already changing lanes),
// `cruise` the car's own pace. Returns 'left', 'flash' or null.
// (Close up: some 40 m behind at 170 km/h.)
export const fastLane = Object.freeze({
  flashGap: 35,
  flashEvery: 2.5,
  flashAgain: 3.5,
  patience: 2,
  slower: 1,
});
export const flashRange = (speed = 0) => Math.max(fastLane.flashGap, 5 + 0.8 * speed);
// Held up in the left lane by a slower vehicle that is not moving over:
// the left indicator goes on (and stays on while it lasts).
export function pressingOn({ lane, leader, cruise, speed = 0 }) {
  return (
    lane === 0 &&
    Boolean(leader) &&
    !leader.moving &&
    leader.gap < flashRange(speed) + 20 &&
    leader.speed < cruise - fastLane.slower
  );
}
export function fastLanePlan({ lane, leader, cruise, speed = 0, clearLeft, flashes, sinceFlash }) {
  if (lane > 0) return clearLeft ? 'left' : null;
  const heldUp =
    leader && leader.gap < flashRange(speed) && leader.speed < cruise - fastLane.slower;
  if (!heldUp || leader.moving) return null;
  const every = flashes < fastLane.patience ? fastLane.flashEvery : fastLane.flashAgain;
  return sinceFlash >= every ? 'flash' : null;
}

// How hard the self-driving car presses on in the left lane, as a driver
// would: spells of a brisk cruise at 140–160 km/h, now and then a push to
// 180–200 km/h, and back. It picks up speed briskly (more gently the
// faster it goes and the calmer its mood) and, when the mood passes, lifts
// off and lets the speed fall away on the drag instead of braking. Bends,
// traffic and cameras are left to the caller: they brake as they need.
// Speeds in m/s.
export const autopilotPace = Object.freeze({
  slow: 25,
  cruise: [39, 44],
  push: [50, 55],
  cruiseFor: [8, 18],
  pushFor: [8, 16],
  liftOff: 0.9,
});
export class AutopilotPace {
  constructor(random = Math.random) {
    this.random = random;
    this.pushing = false;
    // (The first spell, once in the left lane, is always a push.)
    this.first = true;
    this.left = 4 + 3 * random();
    this.wish = this.pick();
    this.drive = 0.9 + 0.3 * random();
    this.set = autopilotPace.slow;
  }
  pick() {
    const [low, high] = this.pushing ? autopilotPace.push : autopilotPace.cruise;
    return low + (high - low) * this.random();
  }
  // Advances by dt; returns the speed it wants now and the acceleration it
  // would use to get there. In the other lanes it keeps to 90 km/h, unless
  // `passing` (going round a car on the right) holds its pace.
  step(dt, { fastLane, passing = false, speed = 0 }) {
    if (fastLane || !this.first) this.left -= dt;
    if (this.left <= 0) {
      this.pushing = this.first || (!this.pushing && this.random() < 0.6);
      this.first = false;
      const [a, b] = this.pushing ? autopilotPace.pushFor : autopilotPace.cruiseFor;
      this.left = a + (b - a) * this.random();
      this.wish = this.pick();
      this.drive = (this.pushing ? 1.05 : 0.8) + 0.25 * this.random();
    }
    const wish = fastLane || passing ? this.wish : autopilotPace.slow;
    // Up at once (the accelerator does the easing), down at a lift-off's rate.
    this.set = wish >= this.set ? wish : Math.max(wish, this.set - autopilotPace.liftOff * dt);
    // Brisk at motorway pace, tailing off toward 200 km/h as a driver eases
    // the throttle.
    const accel = this.drive * Math.max(1.4, 4.2 - 0.05 * speed);
    return { speed: this.set, accel };
  }
}

// The speed to keep behind a vehicle going at `speed`, `spare` metres
// beyond the distance to keep: as fast as still lets the car brake (at
// `braking` m/s²) down to its speed by then, and slower once inside it.
export function followSpeed(spare, speed, braking = 3.5) {
  return spare > 0 ? speed + Math.sqrt(2 * braking * spare) : Math.max(0, speed + 0.6 * spare);
}
