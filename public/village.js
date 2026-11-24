import * as THREE from 'three';
import { roadCenterSlope, roadCenterZ } from './road-profile.js';
import { nearestOccurrence } from './road-structures.js';
import { route } from './route.js';
import { Kit, canvasTexture } from './build-kit.js';
import { addSurfaceDetail } from './surface-detail.js';
import { groupShadow } from './sun-shadows.js';

// A village along the country road's far side, past the fuel station and
// round the bus stop. Its houses are of three kinds, as in a Ukrainian
// village: long whitewashed houses along the street with carved window
// surrounds and shutters, older ones standing gable-on to the street with
// a boarded gable and an attic window, and squarer brick houses under a
// hipped roof with plain white surrounds. Roofs overhang the walls on
// eaves with a fascia board along them; some houses have a glazed veranda
// at the door, the others a porch with a little canopy. Each yard has a
// fence along the track (pickets, or profiled sheeting), fruit trees in
// front and an orchard behind, here and there a walnut or a poplar, the
// vegetable beds, a plank shed with its woodpile and sometimes a well with
// a sweep. Each yard is one mesh for its walls, roofs and fences, one for
// its windows, which glow warm in the evening, and one for its leaves and
// one for its beds and sunflowers, which are gone in winter.
// Yards' places into each section (past the service area, its bus stop at
// 760 m), and how far from the road centre their fences stand: the village
// lies back across a field, as villages along the M-06 do, not on the
// motorway's service lane.
export const villageYards = Object.freeze([840, 875, 912, 1005, 1040, 1076, 1114, 1150]);
export const villageSetback = 58;
// A route whose land is known has its real villages instead (route-land.js).
export const villageShown = !route?.land;
const plot = 30;

function seeded(n) {
  let seed = 9301 + n * 49297;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
const at = (x, y, z, turn = 0) => new THREE.Matrix4().makeRotationY(turn).setPosition(x, y, z);
const white = 0xf4f4ef;

// A window in its own frame: the wall's face at z = 0 with the outside
// toward -z, the opening `wide` × `tall` from y = 0, centred on x = 0.
// Carved: a surround (наличник) in the trim colour stepped up into a crown;
// plain: a white plastered surround, as on brick houses.
function addWindow(kit, panes, matrix, { wide = 1, tall = 1.15, carved, trim, shutters }) {
  const k = new Kit(),
    g = new Kit();
  g.box(wide, tall, 0.06, 0, 0, -0.02, 0x23303c);
  for (const s of [-1, 1]) k.box(0.07, tall, 0.05, (s * wide) / 2, 0, -0.06, white);
  k.box(wide + 0.07, 0.07, 0.05, 0, -0.03, -0.06, white);
  k.box(wide + 0.07, 0.07, 0.05, 0, tall - 0.04, -0.06, white);
  k.box(0.05, tall - 0.04, 0.04, 0, 0.01, -0.07, white);
  k.box(wide, 0.05, 0.04, 0, tall * 0.63, -0.07, white);
  k.box(wide + 0.36, 0.07, 0.18, 0, -0.1, -0.09, 0xe4e2dc);
  if (carved) {
    k.box(wide + 0.3, 0.12, 0.08, 0, tall + 0.08, -0.05, trim);
    k.box(wide + 0.1, 0.1, 0.07, 0, tall + 0.2, -0.05, trim);
    k.box(wide * 0.6, 0.1, 0.06, 0, tall + 0.3, -0.05, trim);
    for (const s of [-1, 1])
      k.box(0.12, tall + 0.15, 0.07, s * (wide / 2 + 0.1), -0.07, -0.05, trim);
  } else {
    for (const s of [-1, 1])
      k.box(0.16, tall + 0.24, 0.03, s * (wide / 2 + 0.11), -0.12, -0.02, 0xf1efe8);
    k.box(wide + 0.38, 0.18, 0.03, 0, tall + 0.03, -0.02, 0xf1efe8);
  }
  if (shutters)
    for (const s of [-1, 1]) {
      const x = s * (wide / 2 + 0.17 + wide * 0.21);
      k.box(wide * 0.42, tall + 0.04, 0.05, x, -0.02, -0.07, trim);
      // Its panels, a shade darker.
      k.box(wide * 0.3, tall * 0.36, 0.02, x, tall * 0.08, -0.1, darker(trim));
      k.box(wide * 0.3, tall * 0.36, 0.02, x, tall * 0.55, -0.1, darker(trim));
    }
  kit.append(k, matrix);
  panes.append(g, matrix);
}
function darker(colour, by = 0.82) {
  return new THREE.Color(colour).multiplyScalar(by).getHex();
}

// The roof over a w × d plan (ridge along x) whose walls top out at h:
// pitched, two slabs over eaves `eave` wide with a fascia board along them,
// barge boards up the gables, boarded gable ends with a little attic window
// and a ridge cap; or hipped, sloping down on all four sides. Returns the
// roof's height at a point of the plan, for the chimney.
function addRoof(
  kit,
  panes,
  { w, d, h, rise, hipped, roof, gable, fascia, eave = 0.5, attic = true }
) {
  const slope = rise / (d / 2),
    drop = eave * slope;
  if (hipped) {
    const hip = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    hip.rotateY(Math.PI / 4);
    hip.scale(w + 2 * eave, rise + drop, d + 2 * eave);
    hip.translate(0, (rise + drop) / 2, 0);
    kit.add(hip, roof, at(0, h - drop, 0));
    kit.box(w + 2 * eave, 0.03, d + 2 * eave, 0, h - drop - 0.03, 0, 0x5d5a55);
    for (const s of [-1, 1]) {
      kit.box(w + 2 * eave + 0.04, 0.18, 0.04, 0, h - drop - 0.16, s * (d / 2 + eave), fascia);
      kit.box(0.04, 0.18, d + 2 * eave, s * (w / 2 + eave), h - drop - 0.16, 0, fascia);
    }
    return (x, z) => h + rise * (1 - Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2)));
  }
  const angle = Math.atan(slope),
    run = d / 2 + eave,
    length = Math.hypot(run, rise + drop),
    t = 0.1,
    wide = w + 0.7;
  for (const s of [-1, 1]) {
    const slab = new THREE.BoxGeometry(wide, t, length + 0.04);
    slab.rotateX(s * angle);
    const nx = Math.cos(angle) * (t / 2),
      nz = s * Math.sin(angle) * (t / 2);
    kit.add(slab, roof, at(0, h + (rise - drop) / 2 + nx, (s * run) / 2 + nz));
    // The fascia along the eaves.
    kit.box(wide + 0.02, 0.2, 0.04, 0, h - drop - 0.17, s * (run + 0.02), fascia);
    // Barge boards up the gables.
    for (const e of [-1, 1]) {
      const board = new THREE.BoxGeometry(0.05, 0.22, length);
      board.rotateX(s * angle);
      kit.add(
        board,
        fascia,
        at((e * (wide + 0.05)) / 2, h + (rise - drop) / 2 - 0.02, (s * run) / 2)
      );
    }
  }
  kit.box(wide + 0.04, 0.12, 0.34, 0, h + rise + t / Math.cos(angle) - 0.08, 0, darker(roof, 0.85));
  // The gable ends, boarded, each with a little attic window.
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  for (const e of [-1, 1]) {
    const end = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
    end.rotateY(Math.PI / 2);
    kit.add(end, gable, at(e > 0 ? w / 2 : -w / 2 - 0.06, h, 0));
    // Boards' joints, a little darker.
    for (const z of [-d / 4, d / 4])
      kit.box(0.02, rise * 0.45, 0.04, e * (w / 2 + 0.065), h + 0.05, z, darker(gable));
    if (!attic) continue;
    const atticKit = new Kit(),
      glassKit = new Kit();
    addWindow(atticKit, glassKit, new THREE.Matrix4(), { wide: 0.5, tall: 0.6, carved: false });
    const m = at(e * (w / 2 + 0.06), h + rise * 0.28, 0, (e * -Math.PI) / 2);
    kit.append(atticKit, m);
    panes.append(glassKit, m);
  }
  return (x, z) => h + rise * (1 - Math.abs(z) / (d / 2));
}

// A house in its own frame: centred on the origin, the ridge along x, its
// front (the long side with the door) facing -z. `layout` gives where the
// windows go along each wall (front, back, and the ends at -x and +x) and
// the door's place on the front. Adds to `kit` and `panes`; returns the
// chimney's top and the door's place, in the house's frame, and its outline
// (half length and depth, with the veranda or porch).
function buildHouse(kit, panes, spec) {
  const { w, d, h, wall, plinth, trim, carved, shutters, veranda, layout } = spec;
  kit.box(w + 0.16, 0.5, d + 0.16, 0, 0, 0, plinth);
  kit.box(w, h - 0.5, d, 0, 0.5, 0, wall);
  // A thin cornice under the eaves.
  kit.box(w + 0.1, 0.12, d + 0.1, 0, h - 0.12, 0, darker(wall, 0.92));
  const roofAt = addRoof(kit, panes, spec);
  const window = (x, wallFace) => {
    const [px, pz, turn] =
      wallFace === 'front'
        ? [x, -d / 2, 0]
        : wallFace === 'back'
          ? [x, d / 2, Math.PI]
          : wallFace === 'west'
            ? [-w / 2, x, Math.PI / 2]
            : [w / 2, x, -Math.PI / 2];
    addWindow(kit, panes, at(px, 1.0, pz, turn), { carved, trim, shutters });
  };
  for (const x of layout.front) window(x, 'front');
  for (const x of layout.back ?? []) window(x, 'back');
  for (const z of layout.west ?? []) window(z, 'west');
  for (const z of layout.east ?? []) window(z, 'east');
  // The door: on the front, under a porch canopy or inside a glazed veranda.
  const dx = layout.door;
  let door = [dx, -d / 2 - 0.8],
    depth = d / 2;
  if (veranda) {
    const vw = 3.4,
      vd = 2.3,
      vh = h - 0.3,
      vz = -d / 2 - vd / 2;
    kit.box(vw, 0.4, vd, dx, 0, vz, plinth);
    // A solid lower part in the trim colour, glazing above in white frames.
    kit.box(vw, 0.55, vd, dx, 0.4, vz, veranda);
    kit.box(vw - 0.1, vh - 0.95, vd - 0.1, dx, 0.95, vz, 0xdfe6ea);
    const panes2 = new Kit();
    panes2.box(vw + 0.02, vh - 1.15, 0.04, dx, 1.02, vz - vd / 2 - 0.01, 0x2a3742);
    for (const s of [-1, 1])
      panes2.box(0.04, vh - 1.15, vd - 0.1, dx + s * (vw / 2 + 0.01), 1.02, vz, 0x2a3742);
    panes.append(panes2);
    for (let i = 0; i <= 5; i++) {
      const x = dx - vw / 2 + (i * vw) / 5;
      kit.box(0.07, vh - 0.95, 0.07, x, 0.95, vz - vd / 2 - 0.02, white);
    }
    for (const y of [0.95, 0.95 + (vh - 0.95) * 0.62, vh - 0.06])
      kit.box(vw + 0.06, 0.07, 0.07, dx, y, vz - vd / 2 - 0.02, white);
    for (const s of [-1, 1])
      for (let i = 1; i < 3; i++)
        kit.box(
          0.07,
          vh - 0.95,
          0.07,
          dx + s * (vw / 2 + 0.02),
          0.95,
          vz - vd / 2 + (i * vd) / 3,
          white
        );
    // Its lean-to roof, falling away from the house.
    const lean = new THREE.BoxGeometry(vw + 0.5, 0.08, vd + 0.5);
    lean.rotateX(-0.2);
    kit.add(lean, spec.roof, at(dx, vh + 0.22, vz - 0.1));
    kit.box(0.95, 2.0, 0.06, dx, 0.4, -d / 2 - vd - 0.01, 0x6b4a32);
    kit.box(1.4, 0.2, 0.9, dx, 0, -d / 2 - vd - 0.45, 0x8d8a85);
    door = [dx, -d / 2 - vd - 0.9];
    depth = d / 2 + vd;
  } else {
    kit.box(1.0, 2.05, 0.06, dx, 0.5, -d / 2 - 0.02, 0x6b4a32);
    kit.box(1.2, 0.08, 0.08, dx, 2.55, -d / 2 - 0.04, white);
    // Steps, two posts and a little pitched canopy.
    kit.box(1.8, 0.25, 1.3, dx, 0, -d / 2 - 0.65, 0x8d8a85);
    kit.box(1.5, 0.25, 0.9, dx, 0.25, -d / 2 - 0.45, 0x8d8a85);
    for (const s of [-1, 1]) kit.box(0.1, 2.25, 0.1, dx + s * 0.8, 0.5, -d / 2 - 1.2, 0x7a5a3c);
    const canopy = new Kit();
    addRoof(canopy, new Kit(), {
      w: 1.6,
      d: 1.5,
      h: 0,
      rise: 0.45,
      roof: spec.roof,
      gable: spec.gable,
      fascia: spec.fascia,
      eave: 0.15,
      attic: false,
    });
    kit.append(canopy, at(dx, 2.78, -d / 2 - 0.65, Math.PI / 2));
    depth = d / 2 + 1.3;
  }
  const cx = w * 0.22,
    cz = d * 0.15;
  const top = roofAt(cx, cz) + 0.95;
  kit.box(0.62, top - h + 0.2, 0.62, cx, h - 0.2, cz, 0xa3493a);
  kit.box(0.8, 0.12, 0.8, cx, top, cz, 0x8a8783);
  // (The veranda sticks out past the corner a little.)
  const reach = veranda ? Math.max(w / 2, Math.abs(dx) + 1.7) : w / 2;
  return {
    chimney: [cx, top + 0.15, cz],
    door,
    outline: [-reach - 0.1, reach + 0.1, -depth, d / 2 + 0.1],
  };
}

// A tree: a fruit tree (apple, with apples, or cherry), a big walnut or a
// tall poplar. Its trunk and limbs go into `solid`, so they stand bare in
// winter; its crown, of lumpy faceted clumps, into `leaves`.
const greens = [0x4a7530, 0x557f36, 0x3f6a2c, 0x5f8a3c, 0x46702f];
function lumpy(radius, random) {
  const g = new THREE.DodecahedronGeometry(radius, 0);
  const p = g.attributes.position,
    v = new THREE.Vector3();
  const bumps = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!bumps.has(key)) bumps.set(key, 0.82 + 0.3 * random());
    v.multiplyScalar(bumps.get(key));
    p.setXYZ(i, v.x, v.y * 0.85, v.z);
  }
  g.computeVertexNormals();
  return g;
}
export function addTree(solid, leaves, x, z, kind, random) {
  const bark = 0x5e5248;
  if (kind === 'poplar') {
    solid.cylinder(0.24, 4, x, 0, z, bark, 7);
    for (let i = 0; i < 5; i++) {
      const limb = new THREE.CylinderGeometry(0.04, 0.09, 7, 5);
      limb.translate(0, 3.5, 0);
      limb.rotateZ(0.12 + 0.1 * random());
      limb.rotateY(i * 1.3);
      solid.add(limb, bark, at(x, 2.5, z));
    }
    for (let i = 0; i < 4; i++) {
      const crown = lumpy(1, random);
      crown.scale(1.5 - i * 0.2, 3.2, 1.5 - i * 0.2);
      leaves.add(crown, pick(random, greens), at(x + (random() - 0.5) * 0.4, 4.5 + i * 2.6, z));
    }
    return;
  }
  const walnut = kind === 'walnut';
  const trunk = walnut ? 2.3 : 1.2 + random() * 0.5,
    girth = walnut ? 0.22 : 0.12,
    spread = walnut ? 2.8 : 1.6,
    crownTop = walnut ? 6 : 3.1;
  solid.cylinder(girth, trunk + 0.3, x, 0, z, bark, 7);
  const limbs = walnut ? 6 : 5;
  for (let i = 0; i < limbs; i++) {
    const length = spread * (0.9 + 0.4 * random());
    const limb = new THREE.CylinderGeometry(girth * 0.35, girth * 0.7, length, 5);
    limb.translate(0, length / 2, 0);
    limb.rotateZ(0.55 + 0.35 * random());
    limb.rotateY((i / limbs) * Math.PI * 2 + random());
    solid.add(limb, bark, at(x, trunk, z));
  }
  const clumps = walnut ? 9 : 6,
    green = pick(random, greens);
  for (let i = 0; i < clumps; i++) {
    const a = random() * Math.PI * 2,
      r = random() * spread * 0.75,
      size = (walnut ? 1.7 : 0.95) + random() * (walnut ? 0.9 : 0.5);
    const y = trunk + 0.5 + random() * (crownTop - trunk - 0.4);
    leaves.add(
      lumpy(size, random),
      darker(green, 0.88 + 0.24 * random()),
      at(x + Math.cos(a) * r, y, z + Math.sin(a) * r)
    );
  }
  if (kind === 'apple')
    for (let i = 0; i < 8; i++) {
      const a = random() * Math.PI * 2,
        y = trunk + 0.2 + random() * (crownTop - trunk);
      const r = spread * (0.6 + 0.4 * random());
      leaves.add(
        new THREE.OctahedronGeometry(0.08, 0),
        random() < 0.7 ? 0xc0352a : 0xd8c24a,
        at(x + Math.cos(a) * r, y, z + Math.sin(a) * r)
      );
    }
}

// One yard, in its own frame: x along the road, z away from the track's
// far edge (the fence along it at z = fence).
const houseKinds = ['long', 'gable', 'brick', 'long', 'gable', 'brick', 'long', 'gable'];
export function yardKits(index) {
  const random = seeded(index);
  const kit = new Kit(),
    windows = new Kit(),
    leafKit = new Kit(),
    // Sunflowers and the beds' rows apart, as there are none in winter.
    garden = new Kit();
  const kind = houseKinds[index % houseKinds.length];
  const brick = kind === 'brick';
  const wall = brick
    ? pick(random, [0xa4553f, 0x9b4a36, 0xd6bd88, 0xc9c4b8])
    : pick(random, [0xf2efe6, 0xf4f1e8, 0xe9efe9, 0xf1e6c8, 0xdfe9f2, 0xe9dcc0]);
  const roof = brick
    ? pick(random, [0x7d8288, 0x6b2f26, 0x8a8f94, 0x3f5e48])
    : pick(random, [0x9a3b2c, 0x3f6e4c, 0x3d5a87, 0x7b7f84, 0x8a4a2a]);
  const trim = pick(random, [0x2f6db5, 0x2f6db5, 0x3f7d4f, 0x2e8a8a, 0x7a4a8a]);
  const fence = 4.5;
  // What the car runs into, in the yard's frame: [x, z, half length, half
  // depth] boxes.
  const colliders = [];
  // The fence along the track: pickets, or profiled sheeting on posts, a
  // gateway left open in it.
  const gate = (random() - 0.5) * 10;
  if (random() < 0.4) {
    const sheet = pick(random, [0x2f5a3c, 0x6a3a2a, 0x7d8287, 0x3a4f6e]);
    for (const [a, b] of [
      [-plot / 2, gate - 1.6],
      [gate + 1.6, plot / 2],
    ]) {
      kit.box(b - a, 1.75, 0.03, (a + b) / 2, 0.08, fence, sheet);
      // Its ribs, catching the light, and a capping along the top.
      for (let x = a + 0.15; x < b - 0.1; x += 0.3)
        kit.box(0.06, 1.75, 0.03, x, 0.08, fence - 0.025, darker(sheet, 1.12));
      kit.box(b - a, 0.05, 0.08, (a + b) / 2, 1.83, fence, darker(sheet, 0.8));
      for (let x = a; x <= b + 0.01; x += (b - a) / Math.max(1, Math.round((b - a) / 2.5)))
        kit.box(0.08, 2.0, 0.08, x, 0, fence + 0.06, 0x55575a);
    }
  } else {
    const fenceColour = pick(random, [0x4d78b0, 0x6f9a55, 0x8a6b4a, 0xd9d4c7]);
    for (let x = -plot / 2 + 0.2; x < plot / 2 - 0.2; x += 0.24) {
      if (Math.abs(x - gate) < 1.6) continue;
      kit.box(0.09, 1.25 + 0.06 * Math.sin(x * 9), 0.035, x, 0, fence, fenceColour);
    }
    for (const y of [0.3, 0.95]) {
      kit.box(
        gate - 1.6 + plot / 2,
        0.08,
        0.05,
        (gate - 1.6 - plot / 2) / 2,
        y,
        fence + 0.05,
        0x6a5a48
      );
      kit.box(
        plot / 2 - gate - 1.6,
        0.08,
        0.05,
        (gate + 1.6 + plot / 2) / 2,
        y,
        fence + 0.05,
        0x6a5a48
      );
    }
  }
  for (const x of [gate - 1.6, gate + 1.6]) kit.box(0.14, 1.9, 0.14, x, 0, fence, 0x5a4a3a);
  // The house.
  const gableOn = kind === 'gable';
  const w = gableOn ? 10 + random() * 2 : brick ? 9 + random() * 1.5 : 10 + random() * 2.5,
    d = gableOn ? 6 + random() * 0.8 : brick ? 8 + random() : 6.2 + random() * 1.2,
    h = brick ? 3.1 : 2.8 + random() * 0.3,
    hx = (random() - 0.5) * 6,
    hz = fence + (gableOn ? 4 + w / 2 : 5.5 + d / 2) + random() * 2;
  const fourWindows = w > 12;
  const spec = {
    w,
    d,
    h,
    wall,
    roof,
    trim,
    plinth: brick ? 0x5d5853 : pick(random, [0x6d6a66, 0x5b6470, 0x7a5f4a]),
    carved: !brick,
    shutters: !brick && random() < 0.75,
    rise: gableOn ? 2.6 + random() * 0.4 : brick ? 2.2 : 2 + random() * 0.5,
    hipped: brick || (kind === 'long' && random() < 0.35),
    gable: gableOn ? pick(random, [0x8a6a4a, 0x7a5a3c, trim]) : pick(random, [wall, 0x8a6a4a]),
    fascia: brick ? 0xe9e7e2 : pick(random, [white, trim]),
    veranda: random() < 0.5 ? (brick ? 0xd9d4c7 : trim) : null,
  };
  // Where the door and the windows go: the long house shows its front to
  // the street; the gable-on one its end, two windows wide.
  let turn = 0;
  if (gableOn) {
    // The front faces the gate's side; the end at +x the street.
    const toGate = gate < hx ? -1 : 1;
    turn = toGate < 0 ? Math.PI / 2 : -Math.PI / 2;
    const streetEnd = toGate < 0 ? 'east' : 'west';
    spec.layout = {
      front: [w * 0.06, w * 0.32],
      back: [-w * 0.25, 0, w * 0.25],
      [streetEnd]: [-d * 0.22, d * 0.22],
      door: -w * 0.24,
    };
  } else {
    // The door near the end nearer the gate, the windows past it.
    const side = gate < hx ? -1 : 1,
      doorX = side * (w / 2 - 1.1);
    const n = fourWindows ? 4 : 3,
      from = side * (w / 2 - 2.9),
      to = -side * (w / 2 - 1.5);
    spec.layout = {
      front: Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1)),
      west: [0],
      east: [0],
      door: doorX,
    };
  }
  const house = new Kit(),
    housePanes = new Kit();
  const built = buildHouse(house, housePanes, spec);
  const place = at(hx, 0, hz, turn);
  kit.append(house, place);
  windows.append(housePanes, place);
  const toYard = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(place);
  const chimneyTop = new THREE.Vector3(...built.chimney).applyMatrix4(place);
  const chimney = [chimneyTop.x, chimneyTop.y, chimneyTop.z];
  const doorAt = toYard(built.door[0], built.door[1]);
  // The house's outline in the yard, for the car (and to keep the trees
  // and the shed clear of it).
  const [x0, x1, z0, z1] = built.outline;
  const corners = [toYard(x0, z0), toYard(x1, z1)];
  const houseBox = {
    minX: Math.min(corners[0].x, corners[1].x),
    maxX: Math.max(corners[0].x, corners[1].x),
    minZ: Math.min(corners[0].z, corners[1].z),
    maxZ: Math.max(corners[0].z, corners[1].z),
  };
  colliders.push([
    (houseBox.minX + houseBox.maxX) / 2,
    (houseBox.minZ + houseBox.maxZ) / 2,
    (houseBox.maxX - houseBox.minX) / 2,
    (houseBox.maxZ - houseBox.minZ) / 2,
  ]);
  // In every other yard a street lamp by the gate: a concrete pole with an
  // arm reaching over the track and a lamp that glows warm at night.
  let lamp = null;
  if (index % 2 === 0) {
    const lx = gate + (gate > 0 ? -4.2 : 4.2),
      lz = 1.3;
    kit.cylinder(0.09, 6.4, lx, 0, lz, 0x9a9a94, 8);
    kit.box(0.08, 0.08, 2.2, lx, 6.1, lz - 1.05, 0x6f706c);
    windows.box(0.3, 0.12, 0.5, lx, 5.98, lz - 2.05, 0xfff1d6);
    lamp = [lx, -1.8];
    colliders.push([lx, lz, 0.12, 0.12]);
  }
  // A path from the gate to the door, of packed earth and old bricks.
  {
    const dx = doorAt.x - gate,
      dz = doorAt.z - fence,
      length = Math.hypot(dx, dz);
    kit.box(
      length,
      0.03,
      1.1,
      (gate + doorAt.x) / 2,
      0,
      (fence + doorAt.z) / 2,
      0xa8988a,
      -Math.atan2(dz, dx)
    );
  }
  // A bench by the gate, on the track's side of the fence, as in every
  // village.
  const benchX = gate + (gate > 0 ? -2.8 : 2.8);
  kit.box(1.8, 0.07, 0.4, benchX, 0.42, fence - 0.6, 0x7a5a3c);
  kit.box(1.8, 0.4, 0.05, benchX, 0.5, fence - 0.42, 0x7a5a3c);
  for (const s of [-0.7, 0.7]) kit.box(0.08, 0.42, 0.34, benchX + s, 0, fence - 0.6, 0x5a4634);
  // Sunflowers along the fence inside, nodding toward the road.
  const flowers = 4 + Math.floor(random() * 6);
  for (let i = 0; i < flowers; i++) {
    const fx = -plot / 2 + 1.5 + random() * (plot - 3);
    if (Math.abs(fx - gate) < 2.2) continue;
    const fz = fence + 0.7 + random() * 0.8,
      tall = 1.6 + random() * 0.6;
    garden.box(0.05, tall, 0.05, fx, 0, fz, 0x4f7a2e);
    garden.box(0.45, 0.04, 0.22, fx + 0.15, tall * 0.55, fz, 0x3f6e2a, 0.6);
    const head = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12);
    head.rotateX(-(Math.PI / 2 - 0.35));
    garden.add(head, 0xf2b81c, at(fx, tall + 0.1, fz - 0.03));
    const middle = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10);
    middle.rotateX(-(Math.PI / 2 - 0.35));
    garden.add(middle, 0x5a3a1a, at(fx, tall + 0.1, fz - 0.06));
  }
  // Behind the house: the shed to one side with its woodpile, and the
  // vegetable beds, dark earth in rows.
  const houseBack = houseBox.maxZ;
  const shedSide = gate < hx ? 1 : -1;
  const sx = Math.max(-plot / 2 + 3, Math.min(plot / 2 - 3, hx + shedSide * (6 + random() * 3))),
    sz = houseBack + 2.5 + random() * 2;
  {
    const shed = new Kit(),
      none = new Kit();
    shed.box(4.4, 2.2, 3.2, 0, 0, 0, 0x7a5a3c);
    for (let x = -2; x <= 2; x += 0.55) shed.box(0.03, 2.2, 0.03, x, 0, -1.61, 0x5e4430);
    shed.box(1.0, 1.9, 0.05, -0.9, 0, -1.62, 0x5a3f2a);
    addRoof(shed, none, {
      w: 4.4,
      d: 3.2,
      h: 2.2,
      rise: 0.9,
      roof: pick(random, [0x6b6f73, 0x7a3a2c, 0x5a5f55]),
      gable: 0x6e5038,
      fascia: 0x6e5038,
      eave: 0.3,
      attic: false,
    });
    kit.append(shed, at(sx, 0, sz));
    // The woodpile against its side: logs' ends toward the house.
    const pile = sx + (shedSide > 0 ? -2.9 : 2.9);
    kit.box(1.1, 1.2, 2.6, pile, 0, sz, 0x8a6a48);
    for (let y = 0.2; y < 1.2; y += 0.32)
      for (let z = -1.05; z <= 1.1; z += 0.35) {
        const log = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 6);
        log.rotateZ(Math.PI / 2);
        kit.add(log, 0xc9a77a, at(pile - shedSide * 0.56, y, sz + z));
      }
    colliders.push([sx, sz, 2.4, 1.8], [pile, sz, 0.6, 1.3]);
  }
  {
    const bz = houseBack + 3,
      depth = 11,
      bx = hx - shedSide * 2,
      bw = 13;
    kit.box(bw, 0.05, depth, bx, 0, bz + depth / 2, 0x5b4636);
    for (let z = bz + 0.5; z < bz + depth - 0.3; z += 0.8)
      garden.box(bw - 0.6, 0.28, 0.4, bx, 0.03, z, pick(random, [0x557d34, 0x4f7530, 0x6a8a3a]));
  }
  // A well with a sweep in some yards.
  if (random() < 0.45) {
    const wx = Math.max(-plot / 2 + 2, Math.min(plot / 2 - 2, gate + (gate < hx ? -4 : 4))),
      wz = fence + 3.2;
    colliders.push([wx, wz, 0.55, 0.55]);
    kit.cylinder(0.6, 0.85, wx, 0, wz, 0x7d7368, 10);
    kit.box(0.15, 3.4, 0.15, wx + 1.2, 0, wz, 0x5a4634);
    const sweep = new THREE.BoxGeometry(6.5, 0.1, 0.1);
    sweep.rotateZ(0.45);
    kit.add(sweep, 0x5a4634, at(wx + 1.2, 3.4, wz));
    kit.box(0.04, 2.2, 0.04, wx - 1.7, 1.5, wz, 0x4a4038);
  }
  // On one yard, an old pole with a storks' nest, a stork standing in it.
  if (index === 3) {
    const px = Math.max(-plot / 2 + 1, Math.min(plot / 2 - 1, hx - shedSide * 7)),
      pz = fence + 1.2;
    colliders.push([px, pz, 0.15, 0.15]);
    kit.cylinder(0.13, 7.5, px, 0, pz, 0x7d7368);
    kit.cylinder(0.75, 0.45, px, 7.5, pz, 0x6b5536, 12);
    const body = new THREE.SphereGeometry(0.28, 10, 8);
    body.scale(1.5, 0.85, 0.8);
    kit.add(body, 0xf4f4f0, at(px, 8.35, pz));
    kit.box(0.3, 0.08, 0.36, px - 0.2, 8.32, pz, 0x161616);
    kit.box(0.06, 0.5, 0.06, px + 0.35, 8.5, pz, 0xf4f4f0);
    const beak = new THREE.ConeGeometry(0.04, 0.32, 6);
    beak.rotateZ(-Math.PI / 2 - 0.3);
    kit.add(beak, 0xd2381e, at(px + 0.5, 8.72, pz));
    kit.box(0.04, 0.4, 0.04, px - 0.05, 7.95, pz, 0xd2381e);
  }
  // Trees: two or three fruit trees in front, an orchard behind, and in
  // some yards a big walnut or a poplar.
  const trees = [];
  const clearOf = (x, z, r) =>
    colliders.every(([cx, cz, a, b]) => Math.abs(x - cx) > a + r || Math.abs(z - cz) > b + r) &&
    Math.abs(x - gate) > 2.4 &&
    trees.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > r + 1.8);
  const plant = (x, z, kind, r = 1.6) => {
    if (!clearOf(x, z, r) || Math.abs(x) > plot / 2 - 1) return;
    addTree(kit, leafKit, x, z, kind, random);
    trees.push([x, z]);
  };
  const front = houseBox.minZ;
  for (let i = 0; i < 6 && trees.length < 3; i++)
    plant(
      -plot / 2 + 2 + random() * (plot - 4),
      fence + 1.8 + random() * Math.max(0.5, front - fence - 3.5),
      random() < 0.6 ? 'apple' : 'cherry'
    );
  for (let i = 0; i < 4; i++)
    plant(
      -plot / 2 + 2 + random() * (plot - 4),
      houseBack + 15 + random() * 6,
      random() < 0.5 ? 'apple' : 'cherry'
    );
  if (random() < 0.5)
    plant(hx - shedSide * (8 + random() * 3), houseBack + 2 + random() * 3, 'walnut', 3);
  else if (random() < 0.6)
    plant(shedSide * (plot / 2 - 1.5), fence + 2 + random() * 6, 'poplar', 1.2);
  for (const [x, z] of trees) colliders.push([x, z, 0.25, 0.25]);
  // The fence either side of the gate.
  colliders.push(
    [(gate - 1.6 - plot / 2) / 2, fence, (gate - 1.6 + plot / 2) / 2, 0.1],
    [(gate + 1.6 + plot / 2) / 2, fence, (plot / 2 - gate - 1.6) / 2, 0.1]
  );
  return {
    solid: kit.geometry(),
    glass: windows.geometry(),
    leaves: leafKit.parts.length ? leafKit.geometry() : null,
    flowers: garden.parts.length ? garden.geometry() : null,
    chimney,
    lamp,
    colliders,
  };
}

// Each yard's colliders (see yardKits), kept when the village is built.
const colliderCache = [];
export function yardColliders(index) {
  colliderCache[index] ??= yardKits(index).colliders;
  return colliderCache[index];
}

export function setupVillage(scene) {
  // Plastered walls, tin roofs ribbed down their slopes (see
  // surface-detail.js).
  const material = addSurfaceDetail(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  );
  const leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const glass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.15,
    metalness: 0.3,
    emissive: 0xffc77a,
    emissiveIntensity: 0,
  });
  // The street lamps' light on the track at night: a warm pool laid on it.
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: canvasTexture(128, 128, (g, w) => {
      const grd = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,226,170,1)');
      grd.addColorStop(0.5, 'rgba(255,220,160,0.45)');
      grd.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, w);
    }),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const poolShape = new THREE.PlaneGeometry(11, 11);
  poolShape.rotateX(-Math.PI / 2);
  // Smoke from the chimneys in winter: a few soft puffs rising and drifting
  // off, one small cloud of points per yard.
  const puffs = 14,
    puffLife = 7;
  const smokeMaterial = new THREE.PointsMaterial({
    map: canvasTexture(64, 64, (g, w) => {
      const grd = g.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, w);
    }),
    size: 2.6,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
  });
  const yards = villageYards.map((u, i) => {
    const { solid, glass: panes, leaves, flowers, chimney, lamp, colliders } = yardKits(i);
    colliderCache[i] = colliders;
    const group = new THREE.Group();
    group.name = 'Village yard';
    const body = new THREE.Mesh(solid, material);
    body.castShadow = body.receiveShadow = true;
    const windows = new THREE.Mesh(panes, glass);
    group.add(body, windows);
    // The trees' leaves: gone in winter, with their shadow.
    const foliage = leaves ? new THREE.Mesh(leaves, leafMaterial) : null;
    if (foliage) {
      foliage.name = 'Village trees';
      foliage.castShadow = true;
      foliage.userData.noShadow = true;
      foliage.userData.leaves = true;
      group.add(foliage);
    }
    const garden = flowers ? new THREE.Mesh(flowers, material) : null;
    if (garden) {
      garden.name = 'Village sunflowers';
      // (Small, and gone in winter: no shadow of their own.)
      garden.userData.noShadow = true;
      group.add(garden);
    }
    let pool = null;
    if (lamp) {
      pool = new THREE.Mesh(poolShape, poolMaterial);
      pool.position.set(lamp[0], 0.05, lamp[1]);
      pool.name = 'Village lamp pool';
      pool.userData.noShadow = true;
      group.add(pool);
    }
    const smokeGeometry = new THREE.BufferGeometry();
    smokeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(puffs * 3), 3)
    );
    smokeGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(puffs * 4), 4));
    const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
    smoke.name = 'Chimney smoke';
    smoke.frustumCulled = false;
    smoke.userData.noShadow = true;
    smoke.visible = false;
    group.add(smoke);
    scene.add(group);
    return {
      u,
      group,
      garden,
      pool,
      smoke,
      chimney,
      seed: i * 1.37,
      shadow: groupShadow(scene, group, 'Village yard shadow'),
      foliage,
      leafShadow: foliage
        ? groupShadow(scene, group, 'Village trees shadow', { select: (o) => o.userData.leaves })
        : null,
    };
  });
  let time = 0;
  return {
    yards,
    // Places the yards at their nearest occurrence to x; `night` (0–1)
    // lights the windows; `sun` and `strength` lay their shadows.
    // `dt` moves the chimney smoke (in winter).
    update(x, night = 0, sun = null, strength = 0, winter = 0, dt = 0) {
      // Windows light up earlier and warmer on a winter's evening.
      const evening = winter >= 0.5 ? Math.min(1, night * 1.6) : night;
      glass.emissiveIntensity = (0.8 + 0.5 * winter) * evening;
      poolMaterial.opacity = 0.7 * night;
      time += dt;
      // Grey smoke by day, darker at night.
      const shade = 0.82 - 0.55 * night;
      for (const yard of yards) {
        if (yard.garden) yard.garden.visible = winter < 0.5;
        if (yard.foliage) yard.foliage.visible = winter < 0.5;
      }
      for (const yard of yards) {
        if (!villageShown) {
          yard.group.visible = yard.shadow.mesh.visible = false;
          if (yard.leafShadow) yard.leafShadow.mesh.visible = false;
          continue;
        }
        const u = nearestOccurrence(x, yard.u);
        // Not drawn at all when far off.
        const near = Math.abs(u - x) < 900;
        yard.group.visible = near;
        if (!near) {
          yard.shadow.mesh.visible = false;
          if (yard.leafShadow) yard.leafShadow.mesh.visible = false;
          continue;
        }
        const edge = villageSetback;
        yard.group.position.set(u, 0, roadCenterZ(u) + edge);
        yard.group.rotation.y = -Math.atan(roadCenterSlope(u));
        yard.shadow.update(sun, strength);
        if (yard.leafShadow) yard.leafShadow.update(winter < 0.5 ? sun : null, strength);
        if (yard.pool) yard.pool.visible = night > 0.02;
        yard.smoke.visible = winter >= 0.5;
        if (yard.smoke.visible) {
          const position = yard.smoke.geometry.attributes.position,
            colour = yard.smoke.geometry.attributes.color;
          const [cx, cy, cz] = yard.chimney;
          for (let k = 0; k < puffs; k++) {
            // Each puff's age through its life, staggered.
            const age = (time / puffLife + k / puffs + yard.seed) % 1;
            const rise = age * puffLife * 0.55;
            position.setXYZ(
              k,
              cx + rise * 0.7 + Math.sin(k * 2.1 + time * 0.5) * age * 0.6,
              cy + rise,
              cz + Math.cos(k * 1.7 + time * 0.4) * age * 0.6
            );
            const alpha = 0.7 * Math.sin(Math.PI * Math.min(1, age * 1.15)) * (1 - age);
            colour.setXYZW(k, shade, shade, shade * 1.02, alpha);
          }
          position.needsUpdate = colour.needsUpdate = true;
        }
      }
    },
  };
}
