import * as THREE from 'three';
import { roadCenterSlope, roadCenterZ } from './road-profile.js';
import { structureLayout } from './road-structures.js';
import { powerLineLayout } from './power-lines.js';
import { Kit } from './build-kit.js';
import { route } from './route.js';

// The buildings beside a real route as they are, from OpenStreetMap (see
// tools/routes/build.py): the villages' houses, sheds and garages, farm
// buildings, shops and works, and blocks of flats on the cities' edges,
// and the ponds, each where it stands, x along the road and `lat` across
// it (right of the road positive). They are placed as the game places its
// own things, at (x, the road's centre + lat). (The shelterbelts' trees
// were tried and cost too much to draw.)
//
// Only what the camera can see is drawn (it sees 700 m): the buildings are
// built a few hundred metres of road at a time as the car comes near, into
// one mesh for their walls and roofs and two for their windows (lit and
// unlit at night).
export const landLayout = Object.freeze({
  reach: 700,
  // Buildings are built this many metres of road at a time.
  block: 400,
});

// Where the game's own road and roadside stand, nothing real goes: the two
// carriageways, their verges and rails, the power line beyond the oncoming
// one, the service area on the right (its lane, fuel station and bus
// stop) and the farm-track overpasses with their ramps. `half` is how far
// the thing reaches across the road either side of `lat`.
export function keptClear(x, lat, half = 0) {
  if (lat + half > -26 && lat - half < 22) return true;
  if (Math.abs(lat - powerLineLayout.lateral) < 4 + half) return true;
  const period = structureLayout.period;
  const u = ((x % period) + period) % period;
  if (u > 200 && u < 1320 && lat + half > 0 && lat - half < 85) return true;
  for (const b of structureLayout.bridges)
    if (Math.abs(u - b) < 40 && Math.abs(lat) - half < 140) return true;
  return false;
}

// A repeatable random number (0–1) for a pair of whole numbers.
export function hash2(i, j, salt = 0) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Outlines as [x, lat] points with their bounds.
function outlines(list = []) {
  return list.map((flat) => {
    const points = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
    const xs = points.map((p) => p[0]),
      ls = points.map((p) => p[1]);
    return {
      points,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minL: Math.min(...ls),
      maxL: Math.max(...ls),
    };
  });
}

// The buildings, each a rectangle: its centre, length and width, its angle
// to the road (radians), height and kind (0 a house under a pitched roof,
// 1 a shed or garage, 2 a large flat-roofed building, 3 a block of flats),
// with how far it reaches along and across the road. Those that would
// stand on the game's own road are left out.
export function landBuildings(land) {
  const list = land?.buildings ?? [];
  const out = [];
  for (let i = 0; i + 6 < list.length; i += 7) {
    const [x, lat, length, width, degrees, height, kind] = list.slice(i, i + 7);
    const angle = (degrees * Math.PI) / 180,
      c = Math.abs(Math.cos(angle)),
      s = Math.abs(Math.sin(angle));
    const along = (length * c + width * s) / 2,
      across = (length * s + width * c) / 2;
    if (keptClear(x, lat, across + 1) || keptClear(x - along, lat, across + 1)) continue;
    if (keptClear(x + along, lat, across + 1)) continue;
    out.push({ x, lat, length, width, angle, height, kind, along, across, seed: i / 7 });
  }
  return out.sort((a, b) => a.x - b.x);
}

// The first index in a list sorted by x at or past `x`.
function firstFrom(list, x) {
  let a = 0,
    b = list.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (list[m].x < x) a = m + 1;
    else b = m;
  }
  return a;
}

// Everything known about one route's land.
export function routeLand(land) {
  if (!land) return null;
  const buildings = landBuildings(land);
  return {
    buildings,
    water: outlines(land.water),
    // What the car can hit near x: the buildings, as boxes along the road
    // (see obstacles.js). A building turned to the road is held by a box a
    // little inside its corners.
    solidsNear(x, range = 40) {
      const out = [];
      for (let i = firstFrom(buildings, x - range - 60); i < buildings.length; i++) {
        const b = buildings[i];
        if (b.x - b.along > x + range) break;
        if (b.x + b.along < x - range) continue;
        const k = 1 - 0.25 * Math.abs(Math.sin(2 * b.angle));
        out.push({ x: b.x, lat: b.lat, hx: b.along * k, hz: b.across * k });
      }
      return out;
    },
  };
}

// Colours of the buildings.
const walls = [0xe9e4d6, 0xe6d6a8, 0xdcc78e, 0xb9c9d6, 0xa65a3c, 0xc9c1b0, 0xe2ddd0, 0xd4b48a];
const roofs = [0x8a3a2e, 0x6b4a35, 0x7d7f80, 0x4f6b4a, 0x40566e, 0x9a4a38, 0x6f7275];
const large = [0xc8c6c0, 0xb8bcc0, 0xd8d2c4, 0x9fa9b0, 0xe0ddd6];
const blocks = [0xd6d0c4, 0xc4c0b8, 0xe0d6c0, 0xb7bcc0];
const pickOf = (list, r) => list[Math.floor(r * list.length) % list.length];

// One building, in its own frame (centred, its length along x), into the
// kits: walls and roof into `solid`, windows into `lit` or `dark`.
function addBuilding(b, solid, lit, dark) {
  const r = (n) => hash2(b.seed, n, 71);
  const { length: L, width: W, height: h } = b;
  // A window: one quad on the wall, facing out (z < 0 the front, else the
  // back), two triangles where a box would take twelve.
  const pane = (kit, x, y, z, w, tall) =>
    kit.add(
      new THREE.PlaneGeometry(w, tall),
      0x2a3440,
      new THREE.Matrix4().makeRotationY(z < 0 ? Math.PI : 0).setPosition(x, y + tall / 2, z)
    );
  const glass = (n) => (r(n) < 0.55 ? lit : dark);
  if (b.kind === 0) {
    solid.box(L, h, W, 0, 0, 0, pickOf(walls, r(1)));
    // A plinth, and the roof: a gable along the length.
    solid.box(L + 0.1, 0.45, W + 0.1, 0, 0, 0, 0x8d8478);
    solid.gable(L, W, Math.min(2.8, W * 0.36), 0, h, 0, pickOf(roofs, r(2)), 0.35);
    const count = Math.max(1, Math.floor(L / 3.4));
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * (L / count);
      for (const z of [-W / 2 - 0.03, W / 2 + 0.03])
        pane(glass(10 + i * 2 + (z > 0 ? 1 : 0)), x, 0.95, z, 1.05, 1.25);
    }
    return;
  }
  if (b.kind === 1) {
    solid.box(L, h, W, 0, 0, 0, r(1) < 0.5 ? 0x7a6a58 : 0x9a9a94);
    solid.gable(L, W, 0.6, 0, h, 0, r(2) < 0.5 ? 0x6f7275 : 0x7b5a44, 0.2);
    return;
  }
  const colour = b.kind === 3 ? pickOf(blocks, r(1)) : pickOf(large, r(1));
  solid.box(L, h, W, 0, 0, 0, colour);
  solid.box(L + 0.3, 0.35, W + 0.3, 0, h, 0, 0x55575a);
  if (b.kind === 3) {
    // A block of flats: rows of windows on its long sides, a floor apart.
    const floors = Math.max(1, Math.round(h / 3)),
      columns = Math.max(1, Math.floor(L / 3.3));
    for (let f = 0; f < floors; f++)
      for (let i = 0; i < columns; i++) {
        const x = (i - (columns - 1) / 2) * (L / columns);
        for (const z of [-W / 2 - 0.03, W / 2 + 0.03])
          pane(glass(100 + f * 97 + i * 2 + (z > 0 ? 1 : 0)), x, f * 3 + 0.9, z, 1.3, 1.45);
      }
  } else if (r(3) < 0.5) {
    // A shop or an office: a band of windows along the front.
    for (const z of [-W / 2 - 0.03, W / 2 + 0.03])
      pane(glass(5 + (z > 0 ? 1 : 0)), 0, 1.1, z, L * 0.7, Math.min(2, h - 1.6));
  }
}

// This visit's route's land, shared by the drawing and the car's
// collisions.
export const currentLand = routeLand(route?.land);

export function setupRouteLand(scene) {
  const land = currentLand;
  if (!land) return null;
  const group = new THREE.Group();
  group.name = 'Route land';
  scene.add(group);
  // Ponds and reservoirs: still water, frozen and snowed over in winter.
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c4a52,
    roughness: 0.06,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  for (const pond of land.water) {
    const shape = new THREE.Shape(
      pond.points.map(([x, lat]) => new THREE.Vector2(x, -(roadCenterZ(x) + lat)))
    );
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    geometry.translate(0, 0.06, 0);
    const water = new THREE.Mesh(geometry, waterMaterial);
    water.name = 'Route pond';
    water.receiveShadow = true;
    water.userData.noShadow = true;
    group.add(water);
  }
  // The buildings, built a block of road at a time when the car comes near.
  const solidMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  const litGlass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.15,
    metalness: 0.3,
    emissive: 0xffc77a,
    emissiveIntensity: 0,
  });
  const darkGlass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.15,
    metalness: 0.3,
  });
  const blocks = new Map();
  const matrix = new THREE.Matrix4();
  function buildBlock(k) {
    const from = k * landLayout.block,
      to = from + landLayout.block;
    const solid = new Kit(),
      lit = new Kit(),
      dark = new Kit();
    for (let i = firstFrom(land.buildings, from); i < land.buildings.length; i++) {
      const b = land.buildings[i];
      if (b.x >= to) break;
      const s = new Kit(),
        l = new Kit(),
        d = new Kit();
      addBuilding(b, s, l, d);
      const turn = -(Math.atan(roadCenterSlope(b.x)) + b.angle);
      matrix.makeRotationY(turn).setPosition(b.x, 0, roadCenterZ(b.x) + b.lat);
      solid.append(s, matrix);
      lit.append(l, matrix);
      dark.append(d, matrix);
    }
    const meshes = [];
    for (const [kit, material, name] of [
      [solid, solidMaterial, 'Route buildings'],
      [lit, litGlass, 'Route windows'],
      [dark, darkGlass, 'Route windows unlit'],
    ]) {
      if (!kit.parts.length) continue;
      const mesh = new THREE.Mesh(kit.geometry(), material);
      mesh.name = name;
      // (They stand well outside the few metres the sun's shadow map
      // covers round the car, so they cast nothing into it.)
      mesh.receiveShadow = material === solidMaterial;
      mesh.userData.noShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
  return {
    land,
    group,
    // `x`: where the car is; `evening` (0–1) lights the windows.
    update(x, { evening = 0, winter = 0 } = {}) {
      // Buildings within sight, one block built a frame.
      const first = Math.floor((x - landLayout.reach - 60) / landLayout.block),
        last = Math.floor((x + landLayout.reach + 60) / landLayout.block);
      let built = false;
      for (let k = first; k <= last; k++)
        if (!blocks.has(k) && !built) {
          blocks.set(k, buildBlock(k));
          built = true;
        }
      for (const [k, meshes] of blocks) {
        // Blocks well behind (or ahead, after a restart) are let go.
        if (k < first - 4 || k > last + 4) {
          for (const m of meshes) {
            group.remove(m);
            m.geometry.dispose();
          }
          blocks.delete(k);
          continue;
        }
        for (const m of meshes) m.visible = k >= first && k <= last;
      }
      litGlass.emissiveIntensity = (0.9 + 0.4 * winter) * evening;
    },
  };
}
