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
// slower within `flashGap` m, it flashes its headlights (no more often than
// every `flashEvery` s) and waits for it to move over; ignored `patience`
// times, it goes round on the right and comes back. `lane` is the lane's
// index from the left, `leader` {gap, speed, moving} the vehicle ahead in
// it (moving: already changing lanes), `cruise` the car's own pace.
// Returns 'left', 'right', 'flash' or null.
export const fastLane = Object.freeze({ flashGap: 90, flashEvery: 4, patience: 2, slower: 1 });
export function fastLanePlan({ lane, leader, cruise, clearLeft, clearRight, flashes, sinceFlash }) {
  if (lane > 0) return clearLeft ? 'left' : null;
  const heldUp =
    leader && leader.gap < fastLane.flashGap && leader.speed < cruise - fastLane.slower;
  if (!heldUp || leader.moving) return null;
  if (flashes < fastLane.patience) return sinceFlash >= fastLane.flashEvery ? 'flash' : null;
  return clearRight && sinceFlash >= fastLane.flashEvery ? 'right' : null;
}
