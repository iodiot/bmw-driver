import * as THREE from 'three';
import {
  guardrailOffset,
  laneWidth,
  roadCenterSlope,
  roadCenterZ,
  roadEdge,
  roadLanes,
} from './road-profile.js';
import { makeRoadSign } from './road-structures.js';
import { route } from './route.js';
import { groupShadow } from './sun-shadows.js';

// Checkpoints on a route, as on Ukraine's highways: concrete blocks laid in
// a chicane across the carriageway, rows from the right and the left in
// turn, each leaving one lane's gap, so a car weaves through slowly; a 40
// and a 20 limit on the way in and a STOP sign with its КОНТРОЛЬ plate on
// a stand on the carriageway before the first row; patrol cars parked on the shoulders with their light bars
// flashing. The traffic and the autopilot slow to a walking pace, weave
// through the gaps one by one and pick up speed after. `at` is where the
// first row stands, along the road.
export const checkpointLayout = Object.freeze({
  // The rows of blocks, metres past `at`; the first leaves the left lane
  // open, the next the right, and so on.
  rows: Object.freeze([0, 24, 48]),
  // A block (a jersey barrier): along the road, across it, its height.
  block: Object.freeze({ thick: 0.62, long: 2, high: 0.85 }),
  // Through the chicane (m/s, some 16 km/h), braking for it before.
  speed: 4.5,
  braking: 1.8,
  // The way in: from the lane toward the first gap over this, and back to
  // the lane over this after the last row (m).
  approach: 90,
  leave: 55,
});
export const checkpoints = Object.freeze([...(route?.checkpoints ?? [])].sort((a, b) => a - b));

const { rows, block } = checkpointLayout;
const last = rows.at(-1);
// Which lane a row leaves open: the left one first, then the right.
const gapOf = (row) => (row % 2 === 0 ? roadLanes[0] : roadLanes.at(-1));
// The blocks of a row, by their lateral centres: from the gap's far edge
// out over the shoulder on the other side.
export function rowBlocks(row) {
  const gapLeft = row % 2 === 0;
  const from = gapLeft ? roadLanes[0] + laneWidth / 2 : roadLanes.at(-1) - laneWidth / 2;
  const to = gapLeft ? roadEdge + 0.4 : -(roadEdge + 0.4);
  const n = Math.ceil(Math.abs(to - from) / block.long);
  const step = (to - from) / n;
  return Array.from({ length: n }, (_, i) => from + step * (i + 0.5));
}

// The checkpoint whose stretch x is in (from the approach to the way out),
// or null.
export function checkpointAt(x, before = checkpointLayout.approach) {
  for (const at of checkpoints)
    if (x >= at - before && x <= at + last + checkpointLayout.leave) return at;
  return null;
}

const ease = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The lateral offset to follow `u` metres past a checkpoint's first row,
// for a vehicle in the lane at `lane`: over toward the first gap, through
// each in turn, and back to the lane after.
export function slalomFor(u, lane) {
  const { approach, leave } = checkpointLayout;
  const end = gapOf(rows.length - 1);
  if (u < rows[0]) return lane + (gapOf(0) - lane) * ease(-approach, rows[0] - 12, u);
  if (u > last) return end + (lane - end) * ease(last + 6, last + leave, u);
  for (let i = 0; i < rows.length - 1; i++)
    if (u <= rows[i + 1])
      return gapOf(i) + (gapOf(i + 1) - gapOf(i)) * ease(rows[i] + 5, rows[i + 1] - 5, u);
  return end;
}
// The same at x along the road; null away from a checkpoint.
export function slalomLat(x, lane) {
  const at = checkpointAt(x);
  return at === null ? null : slalomFor(x - at, lane);
}

// The speed to keep at x for the checkpoints ahead: a walking pace through
// one, braking for it before (m/s; Infinity away from them).
export function checkpointSpeed(x) {
  const { speed, braking } = checkpointLayout;
  let limit = Infinity;
  for (const at of checkpoints) {
    const from = at - 18,
      to = at + last + 8;
    if (x > to) continue;
    const d = Math.max(0, from - x);
    limit = Math.min(limit, Math.sqrt(speed * speed + 2 * braking * d));
  }
  return limit;
}

// The blocks near x, as boxes along the road (see obstacles.js).
export function checkpointSolids(x, range = 40) {
  const out = [];
  for (const at of checkpoints) {
    if (Math.abs(at + last / 2 - x) > last / 2 + range + 5) continue;
    rows.forEach((u, row) => {
      for (const lat of rowBlocks(row))
        out.push({ x: at + u, lat, hx: block.thick / 2, hz: block.long / 2 });
    });
    const stand = stopStand(at);
    out.push({ ...stand, x: stand.x + 0.25, hx: 0.55, hz: 0.45 });
  }
  return out;
}

// Where its patrol cars stand: on the shoulders, between the edge line and
// the rail, a little askew, before, among and after the rows.
// (Half a car's width, the swing of its corner at that angle and a hand's
// breadth off the rail: a wheel or two over the edge line.)
export function parkedSpots(at) {
  const shoulder = guardrailOffset - 1.4;
  return [
    { x: at - 32, lat: shoulder, yaw: 0.05 },
    { x: at + 12, lat: -shoulder, yaw: -0.05 },
    { x: at + last + 22, lat: shoulder, yaw: -0.04 },
  ];
}

// Its signs: the limits on the way in, on the right verge beyond the rail.
export function checkpointSigns(at) {
  return [
    { x: at - 320, spec: { kind: 'limit', value: 40 } },
    { x: at - 150, spec: { kind: 'limit', value: 20 } },
  ];
}
// Its STOP: on a stand on the carriageway, a few metres before the first
// row, in front of its blocks (the open lane beside it is the way through).
export function stopStand(at) {
  const lats = rowBlocks(0);
  return { x: at - 7, lat: lats.reduce((a, b) => a + b, 0) / lats.length };
}

export function setupCheckpoints(scene) {
  if (!checkpoints.length) return null;
  const group = new THREE.Group();
  group.name = 'Checkpoints';
  scene.add(group);
  // A jersey barrier: a broad foot, sloping faces and a narrow top, along
  // its length.
  const { thick, long, high } = block;
  const profile = new THREE.Shape();
  profile.moveTo(-thick / 2, 0);
  profile.lineTo(thick / 2, 0);
  profile.lineTo(thick / 2 - 0.03, 0.08);
  profile.lineTo(thick * 0.2, 0.3);
  profile.lineTo(thick * 0.13, high);
  profile.lineTo(-thick * 0.13, high);
  profile.lineTo(-thick * 0.2, 0.3);
  profile.lineTo(-thick / 2 + 0.03, 0.08);
  profile.closePath();
  // (A little short of their spacing: the joints between them show.)
  const geometry = new THREE.ExtrudeGeometry(profile, { depth: long - 0.08, bevelEnabled: false });
  geometry.translate(0, 0, -(long - 0.08) / 2);
  // Photographed CC0 concrete (Poly Haven "Concrete Wall 006", 2 × 2 m),
  // laid in metres over the faces (the extrusion's UVs are in metres).
  const loader = new THREE.TextureLoader();
  const concrete = (file, srgb) => {
    const texture = loader.load(new URL(`./assets/concrete/${file}`, import.meta.url).href);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(0.5, 0.5);
    texture.anisotropy = 4;
    return texture;
  };
  const arm = concrete('concrete-arm.jpg', false);
  const material = new THREE.MeshStandardMaterial({
    map: concrete('concrete.jpg', true),
    normalMap: concrete('concrete-normal.jpg', false),
    roughnessMap: arm,
    aoMap: arm,
    aoMapIntensity: 0.6,
  });
  const count = checkpoints.length * rows.reduce((n, _, row) => n + rowBlocks(row).length, 0);
  const blocks = new THREE.InstancedMesh(geometry, material, count);
  blocks.name = 'Checkpoint blocks';
  blocks.castShadow = blocks.receiveShadow = true;
  const dummy = new THREE.Object3D(),
    tint = new THREE.Color();
  // The sun's shadows of each checkpoint, its blocks and STOP (see
  // sun-shadows.js): cast from hidden copies of the blocks where they stand.
  const posts = [];
  let n = 0;
  for (const at of checkpoints) {
    const caster = new THREE.Group();
    rows.forEach((u, row) =>
      rowBlocks(row).forEach((lat, i) => {
        const x = at + u;
        dummy.position.set(x, 0, roadCenterZ(x) + lat);
        // Across the road, each a little out of line.
        dummy.rotation.set(0, -Math.atan(roadCenterSlope(x)) + (((n * 37) % 7) - 3) * 0.02, 0);
        dummy.updateMatrix();
        blocks.setMatrixAt(n, dummy.matrix);
        const copy = new THREE.Mesh(geometry);
        copy.visible = false;
        copy.matrixAutoUpdate = false;
        copy.matrix.copy(dummy.matrix);
        caster.add(copy);
        // Painted red and white by turns, as on the checkpoints, to be seen
        // from far off (the photograph is a dark, brownish wall: the tint
        // makes it pale or red, each a little different).
        const pale = 1 + (((n * 53) % 9) - 4) * 0.035;
        if ((i + row) % 2) blocks.setColorAt(n, tint.setRGB(5.6 * pale, 6.4 * pale, 7.6 * pale));
        else blocks.setColorAt(n, tint.setRGB(5.2 * pale, 0.42 * pale, 0.5 * pale));
        n++;
      })
    );
    for (const { x, spec } of checkpointSigns(at)) {
      const sign = makeRoadSign(spec);
      sign.position.set(x, 0, roadCenterZ(x) + guardrailOffset + 1.3);
      sign.rotation.y = -Math.atan(roadCenterSlope(x));
      group.add(sign);
    }
    const stand = stopStand(at),
      stop = makeRoadSign({ kind: 'stop', stand: true });
    stop.position.set(stand.x, 0, roadCenterZ(stand.x) + stand.lat);
    stop.rotation.y = -Math.atan(roadCenterSlope(stand.x)) + 0.06;
    caster.add(stop);
    group.add(caster);
    posts.push({ at, shadow: groupShadow(scene, caster, 'Checkpoint shadow') });
  }
  blocks.instanceMatrix.needsUpdate = true;
  group.add(blocks);
  return {
    group,
    blocks,
    // `x`: the car's place; `sun` (toward it) and `strength` (0–1) lay the
    // shadows of the checkpoints in sight.
    update(x, sun, strength) {
      for (const { at, shadow } of posts) {
        const near = x > at - 900 && x < at + last + 300;
        if (near) shadow.update(sun, strength);
        else shadow.mesh.visible = false;
      }
    },
  };
}
