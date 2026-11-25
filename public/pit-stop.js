import { branchOffset, fuelStationPlace, roadBranch, roadLanes } from './road-profile.js';
import { forecourtWay, pumpLane, pumpRow, wayShare } from './fuel-station.js';

// The self-driving car's stop for fuel: from the right lane onto the
// service lane where it leaves the motorway, past the price sign, over onto
// the forecourt into the lane beside the middle island, to a stop at its
// pump; filled up, on through the forecourt and back onto the service lane,
// and with it back onto the motorway. All of it a path across the road at
// each x (see pitLateral) and a speed for each x (see pitSpeed), as the
// autopilot's lanes are.
export const pitStop = Object.freeze({
  // Over onto the forecourt between these (m along from the station's
  // middle), and back to the service lane between these.
  turnIn: forecourtWay.turnIn,
  turnOut: forecourtWay.turnOut,
  // Where it stops (its middle, along from the station's), beside the
  // middle island's pump.
  stopAt: -1.5,
  // Speeds (m/s): on the service lane, on the forecourt; braking (m/s²)
  // for each, and to the stop.
  lane: 16,
  forecourt: 5,
  braking: 2.2,
  stopping: 1.6,
  // It goes for fuel with less than this share of a tank.
  below: 0.9,
});

// Where a station's service lane leaves the motorway, from the station's
// middle `at`.
export const branchStartFor = (at) => at - fuelStationPlace.at + roadBranch.start;
// And where it is back on it.
export const branchEndFor = (at) => branchStartFor(at) + 2 * roadBranch.diverge + roadBranch.length;

// The lateral offset to follow at x for a stop at the station at `at`: the
// right lane, the service lane, the lane beside the pumps.
export function pitLateral(x, at) {
  const right = roadLanes.at(-1);
  const service = branchOffset(x) ?? right;
  const along = x - at;
  const over = wayShare(along);
  if (over <= 0) return service;
  // The pumps' lane, across the forecourt from the service lane's far edge
  // (the near one of the two lanes beside the islands).
  const pumps = roadBranch.separation + roadBranch.halfWidth + pumpRow - pumpLane;
  return service + (pumps - service) * over;
}

// The speed to keep at x on the way to the pump (`filled`: on the way out),
// in m/s; Infinity where the stop sets none.
export function pitSpeed(x, at, filled = false) {
  const { lane, forecourt, braking, stopping, stopAt, turnIn, turnOut } = pitStop;
  const start = branchStartFor(at),
    along = x - at;
  if (!filled) {
    // Easing off for the service lane, then for the forecourt, then to a
    // stop at the pump.
    const toLane = Math.sqrt(lane * lane + 2 * braking * Math.max(0, start - x));
    const toForecourt = Math.sqrt(
      forecourt * forecourt + 2 * braking * Math.max(0, turnIn[0] - 6 - along)
    );
    const toStop = Math.sqrt(2 * stopping * Math.max(0, stopAt - along));
    return Math.min(toLane, toForecourt, toStop);
  }
  // Out: slowly off the forecourt, then picking up speed along the service
  // lane and onto the motorway.
  if (along < turnOut[1]) return forecourt;
  return Math.sqrt(forecourt * forecourt + 2 * braking * (along - turnOut[1]));
}
