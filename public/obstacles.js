import {
  branchOffset,
  fuelStationPlace,
  nearestService,
  roadBranch,
  roadCenterZ,
  roadCenterSlope,
} from './road-profile.js';
import { nearestOccurrence } from './road-structures.js';
import { priceSignPlace, pumpIslands, pumpRow } from './fuel-station.js';
import { villageSetback, villageYards, yardColliders, villageShown } from './village.js';
import { currentLand } from './route-land.js';
import { checkpointSolids } from './checkpoints.js';

// The solid things beside the country road the car can run into: the fuel
// station's shop, pump islands, canopy columns and price sign, and the
// village's houses, sheds, fences, wells and poles. Each is a box along the
// road: centre x and lateral (from the road's centre line), half length and
// half width.
const stationBoxes = (() => {
  const { from, depth } = fuelStationPlace;
  const shopZ = from + depth - 6.5;
  const boxes = [[0, shopZ + 2.5, 9.2, 4.7]];
  for (const x of pumpIslands) boxes.push([x, pumpRow, 0.7, 3]);
  for (const x of [-12, -4, 4, 12])
    for (const z of [pumpRow - 3.6, pumpRow + 3.6]) boxes.push([x, z, 0.25, 0.25]);
  return boxes;
})();
const edgeAt = (u) => (branchOffset(u) ?? roadBranch.separation) + roadBranch.halfWidth;

export function solidsNear(x, range = 40) {
  const out = [];
  const u = nearestService(x, fuelStationPlace.at);
  if (Math.abs(u - x) < 60 + range) {
    const edge = edgeAt(u);
    for (const [bx, bz, hx, hz] of stationBoxes) out.push({ x: u + bx, lat: edge + bz, hx, hz });
    // The price sign, by the service lane before the forecourt.
    out.push({ x: u + priceSignPlace.along, lat: edge + priceSignPlace.out, hx: 0.4, hz: 1.4 });
  }
  // On a real route, its own buildings and trees, and its checkpoints'
  // concrete blocks.
  if (currentLand) out.push(...currentLand.solidsNear(x, range));
  out.push(...checkpointSolids(x, range));
  if (villageShown)
    villageYards.forEach((yard, i) => {
      const at = nearestOccurrence(x, yard);
      if (Math.abs(at - x) > 20 + range) return;
      const edge = villageSetback;
      for (const [bx, bz, hx, hz] of yardColliders(i))
        out.push({ x: at + bx, lat: edge + bz, hx, hz });
    });
  return out.filter((b) => Math.abs(b.x - x) < b.hx + range);
}

// Pushes the car (`halfLength` × `halfWidth`, turned however it is to the
// road) out of anything solid: driving into it, it stops dead; glancing, it
// slides along. Returns the hardest contact (shaped like a traffic hit, for
// the crash's sound and the drift's wipe-out) or null.
export function collideWithSolids(sim, { halfLength = 2.45, halfWidth = 0.95 } = {}) {
  // The car's heading to the road, its extent along and across it, and its
  // velocity along and across it.
  const turn = sim.heading + Math.atan(roadCenterSlope(sim.x)),
    c = Math.cos(turn),
    s = Math.sin(turn);
  const extentX = Math.abs(c) * halfLength + Math.abs(s) * halfWidth,
    extentL = Math.abs(s) * halfLength + Math.abs(c) * halfWidth;
  const forward = sim.reversing ? -sim.speed : sim.speed;
  let contact = null;
  for (const b of solidsNear(sim.x, 10)) {
    const lat = sim.z - roadCenterZ(sim.x);
    const dx = b.x - sim.x,
      dLat = b.lat - lat;
    const overlapX = b.hx + extentX - Math.abs(dx),
      overlapL = b.hz + extentL - Math.abs(dLat);
    if (overlapX <= 0 || overlapL <= 0) continue;
    // Out the shorter way; what the car's motion does into it.
    const alongRoad = overlapX < overlapL;
    const toward = alongRoad ? Math.sign(dx) : Math.sign(dLat);
    const into = toward * (alongRoad ? c * forward : -s * forward);
    if (alongRoad) {
      sim.x -= toward * overlapX;
      sim.z = roadCenterZ(sim.x) + lat;
    } else sim.z = roadCenterZ(sim.x) + lat - toward * overlapL;
    const headOn = Math.abs(alongRoad ? c : s) > 0.7;
    const impact = Math.max(0, into) + (headOn ? 0 : Math.abs(sim.lateralVelocity));
    if (into > 0 && headOn) sim.speed = 0;
    else {
      sim.speed *= 0.9;
      sim.lateralVelocity *= -0.2;
      if (sim.tyres) sim.tyres.lateralVelocity = sim.lateralVelocity;
    }
    const hit = {
      x: sim.x + dx * 0.5,
      z: roadCenterZ(sim.x + dx * 0.5) + lat + dLat * 0.5,
      side: alongRoad ? 0 : toward,
      impact,
      scrape: Math.abs(sim.speed),
      strength: impact + 0.25 * Math.abs(sim.speed),
      velocityX: Math.cos(sim.heading) * sim.speed,
      velocityZ: -Math.sin(sim.heading) * sim.speed,
      railSlope: roadCenterSlope(sim.x),
      traffic: { solid: true },
    };
    if (!contact || hit.strength > contact.strength) contact = hit;
  }
  return contact;
}
