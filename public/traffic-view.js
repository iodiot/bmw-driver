import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadCenterZ, roadCenterSlope, roadHeight } from './road-profile.js';
import { tunnelCover, bridgeShade, structureUniforms } from './road-structures.js';
import { OncomingTraffic, Traffic, rideOver, vehicleTypes } from './traffic.js';
// The part kinds that hold wheels (tyres, recesses and hub caps; rims and
// spokes).
const wheelKinds = Object.freeze({ trim: true, metal: true });
import { roadSeed, seededRandom } from './road-seed.js';

// The traffic's vehicles, drawn: each type a few instanced meshes (paint,
// glass, dark trim, wheels' hubs and the lamps), so all of them take some
// thirty draws. Bodies are side profiles with rounded corners, extruded
// across the vehicle's width with rounded edges; windows a darker, narrower
// greenhouse on top. Lamps glow by instance colour: tail lamps by night and
// brighter when braking, indicators blinking, headlamps lit in the tunnel
// and after dark. A soft shadow lies under each.

// A closed outline through `points` ([x, y]), each corner rounded off by
// its radius.
function roundedShape(points, radii) {
  const shape = new THREE.Shape();
  const n = points.length;
  const v = (p) => new THREE.Vector2(p[0], p[1]);
  points.forEach((p, i) => {
    const here = v(p),
      before = v(points[(i - 1 + n) % n]),
      after = v(points[(i + 1) % n]);
    const r = Array.isArray(radii) ? radii[i] : radii;
    const toBefore = before.clone().sub(here),
      toAfter = after.clone().sub(here);
    const a = here.clone().add(toBefore.clone().setLength(Math.min(r, toBefore.length() / 2)));
    const b = here.clone().add(toAfter.clone().setLength(Math.min(r, toAfter.length() / 2)));
    if (i === 0) shape.moveTo(a.x, a.y);
    else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(here.x, here.y, b.x, b.y);
  });
  shape.closePath();
  return shape;
}
// A profile (x forward, y up) extruded `width` wide across z, centred.
function extruded(points, radii, width, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(roundedShape(points, radii), {
    depth: Math.max(0.01, width - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelSegments: 3,
    curveSegments: 5,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.deleteAttribute('uv');
  return g;
}
// Narrows a part toward its top (tumblehome): z scaled from 1 at `from` to
// `to` at `top` metres up.
function taper(geometry, from, top, to) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - from) / (top - from)));
    p.setZ(i, p.getZ(i) * (1 - (1 - to) * t * t));
  }
  geometry.computeVertexNormals();
  return geometry;
}
// A number plate (520 × 112 mm) at x, height y, facing forward (+1) or back.
const plateAt = (x, y, facing) => {
  const g = new THREE.PlaneGeometry(0.52, 0.112);
  g.rotateY((facing * Math.PI) / 2);
  g.translate(x + facing * 0.075, y, 0);
  return g;
};
const box = (sx, sy, sz, x, y, z) => {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return g;
};
// A five-spoke alloy on a tyre's outer face: rim, spokes and centre cap in
// metal over a dark recess.
// A wheel's piece, marked with its hub (x along the vehicle, height r) so
// the shader turns it as the vehicle rolls.
const onHub = (g, x, r) => ((g.userData.hub = [x, r]), g);
function alloy(parts, r, w, x, z, side) {
  const face = z + side * (w / 2 + 0.006);
  const recess = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.012, 16);
  recess.rotateX(Math.PI / 2);
  recess.translate(x, r, face - side * 0.004);
  recess.deleteAttribute('uv');
  parts.trim.push(onHub(recess, x, r));
  const rim = new THREE.TorusGeometry(r * 0.64, 0.022, 5, 20);
  rim.translate(x, r, face);
  rim.deleteAttribute('uv');
  parts.metal.push(onHub(rim, x, r));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(0.05, r * 0.6, 0.02);
    spoke.translate(0, r * 0.3, 0);
    spoke.rotateZ(a);
    spoke.translate(x, r, face + side * 0.004);
    spoke.deleteAttribute('uv');
    parts.metal.push(onHub(spoke, x, r));
  }
  const cap = new THREE.CylinderGeometry(r * 0.14, r * 0.14, 0.03, 10);
  cap.rotateX(Math.PI / 2);
  cap.translate(x, r, face + side * 0.008);
  cap.deleteAttribute('uv');
  parts.metal.push(onHub(cap, x, r));
}

// The parts of a vehicle, by what they are drawn with.
const newParts = (trailer = false) => ({
  paint: [],
  ...(trailer ? { trailer: [] } : {}),
  glass: [],
  trim: [],
  metal: [],
  plate: [],
  tail: [],
  head: [],
  left: [],
  right: [],
});
// A side profile whose bottom edge (its first two points, rear and front)
// is cut away round each wheel: an arch of `r` + clearance over each.
function withArches(points, radii, wheels, r, clearance = 0.06) {
  const ra = r + clearance;
  const arc = [];
  for (const x of [...wheels].sort((a, b) => a - b))
    for (let i = 0; i <= 12; i++) {
      const t = Math.PI - (i / 12) * Math.PI;
      arc.push([x + ra * Math.cos(t), r + ra * Math.sin(t)]);
    }
  const [rear, front, ...rest] = points;
  const [rr, fr, ...restRadii] = Array.isArray(radii) ? radii : points.map(() => radii);
  return {
    points: [rear, ...arc, front, ...rest],
    radii: [rr, ...arc.map(() => 0.015), fr, ...restRadii],
  };
}
// A dark wheel well behind an arch: half a tube across the body.
function wheelWell(r, x, width, clearance = 0.06) {
  const g = new THREE.CylinderGeometry(
    r + clearance,
    r + clearance,
    width,
    14,
    1,
    true,
    -Math.PI / 2,
    Math.PI
  );
  g.rotateX(Math.PI / 2);
  g.translate(x, r, 0);
  g.deleteAttribute('uv');
  return g;
}
// A tyre with its tread and both sidewalls.
function tyre(r, w, x, z) {
  const g = new THREE.CylinderGeometry(r, r, w, 22);
  g.rotateX(Math.PI / 2);
  g.translate(x, r, z);
  g.deleteAttribute('uv');
  return onHub(g, x, r);
}
// A plain steel wheel with its hub cap, on a van or a lorry.
function steelWheel(parts, r, w, x, z, side) {
  parts.trim.push(tyre(r, w, x, z));
  const face = z + side * (w / 2 + 0.004);
  const rim = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.02, 18);
  rim.rotateX(Math.PI / 2);
  rim.translate(x, r, face);
  rim.deleteAttribute('uv');
  parts.metal.push(onHub(rim, x, r));
  const cap = new THREE.CylinderGeometry(r * 0.24, r * 0.3, 0.06, 12);
  cap.rotateX(Math.PI / 2);
  cap.translate(x, r, face + side * 0.03);
  cap.deleteAttribute('uv');
  parts.trim.push(onHub(cap, x, r));
}
// A slanted box: `sx` long, `sy` tall, `sz` deep, tilted back by `lean`
// (radians) about its own centre.
const leaning = (sx, sy, sz, x, y, z, lean) => {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.rotateZ(lean);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return g;
};

// A police car: the saloon in white, with a light bar on the roof, blue on
// the left and red on the right.
function police(spec) {
  const parts = car(spec, profiles.sedan);
  const { width: W } = spec;
  // The bar: a dark base across the roof and a lamp each side of it.
  parts.trim.push(box(0.32, 0.06, W * 0.8, -0.25, 1.49, 0));
  parts.beaconBlue = [box(0.27, 0.1, W * 0.36, -0.25, 1.57, -W * 0.2)];
  parts.beaconRed = [box(0.27, 0.1, W * 0.36, -0.25, 1.57, W * 0.2)];
  return parts;
}
// Its light bar flashing, blue and red by turns, each a double flash: lamp
// `side` (0 blue, 1 red) lit now?
export function beaconLit(v, side) {
  if (!v.police?.lights) return false;
  const t = (v.clock * 2.2 + side * 0.5) % 1;
  return t < 0.42 && (t < 0.16 || t > 0.24);
}
// A car: a body with its wheel arches cut out and dark wells behind them,
// a glasshouse leaning in with black pillars and a bright line along the
// windows, a roof, bumpers with their dark lower parts, a grille, lamps in
// dark housings, door handles and mirrors, and alloy wheels on tyres.
function car({ length: L, width: W }, profile) {
  const { body, glass, roof, wheelbase, r, frontOverhang, lampY } = profile;
  const parts = newParts();
  const front = L / 2 - frontOverhang,
    rear = front - wheelbase;
  const belt = body.points.reduce((m, p) => Math.max(m, p[1]), 0);
  const top = roof.points.reduce((m, p) => Math.max(m, p[1]), 0);
  // The body, its arches cut out, rounded at the shoulders.
  const cut = withArches(body.points, body.radii, [front, rear], r);
  parts.paint.push(taper(extruded(cut.points, cut.radii, W, 0.1), belt - 0.35, belt, 0.95));
  for (const x of [front, rear]) parts.trim.push(wheelWell(r, x, W - 0.16));
  // The glasshouse and the roof over it.
  parts.glass.push(
    taper(extruded(glass.points, glass.radii, W * 0.9, 0.05), belt - 0.05, top, 0.78)
  );
  parts.paint.push(taper(extruded(roof.points, roof.radii, W * 0.74, 0.05), belt, top, 0.92));
  const [rearSill, screenBase, screenTop, rearTop] = glass.points;
  // Black pillars between the side windows, and a bright strip along their
  // foot.
  const pillar = (x, width) => {
    for (const side of [-1, 1]) {
      const g = box(width, top - belt + 0.05, 0.02, x, (belt + top) / 2, side * (W * 0.45 + 0.012));
      parts.trim.push(taper(g, belt - 0.05, top, 0.78));
    }
  };
  const bPillar = (screenTop[0] + rearTop[0]) / 2 + 0.05;
  pillar(bPillar, 0.12);
  for (const side of [-1, 1])
    parts.metal.push(
      box(
        screenBase[0] - rearSill[0] - 0.2,
        0.025,
        0.02,
        (screenBase[0] + rearSill[0]) / 2,
        belt + 0.02,
        side * (W * 0.45 + 0.016)
      )
    );
  // Door seams, handles and the sill between the arches.
  const doorFront = screenBase[0] - 0.05,
    doorRear = rearSill[0] + 0.25;
  for (const side of [-1, 1]) {
    for (const x of [doorFront, bPillar, doorRear])
      parts.trim.push(
        box(0.012, belt - 0.5, 0.006, x, 0.3 + (belt - 0.5) / 2 + 0.1, side * (W / 2 + 0.004))
      );
    for (const x of [bPillar - 0.28, doorRear + 0.32])
      parts.metal.push(box(0.16, 0.035, 0.03, x, belt - 0.12, side * (W / 2 + 0.01)));
    parts.trim.push(
      box(
        front - rear - 2 * (r + 0.08),
        0.09,
        0.03,
        (front + rear) / 2,
        0.33,
        side * (W / 2 - 0.004)
      )
    );
    // Door mirrors at the windscreen's foot: a cap in the body's colour on
    // a dark base, its glass facing back.
    parts.paint.push(box(0.11, 0.1, 0.19, screenBase[0] - 0.2, belt + 0.1, side * (W / 2 + 0.07)));
    parts.trim.push(
      box(0.08, 0.04, 0.1, screenBase[0] - 0.16, belt + 0.03, side * (W / 2 - 0.005))
    );
    parts.glass.push(
      box(0.01, 0.07, 0.15, screenBase[0] - 0.26, belt + 0.1, side * (W / 2 + 0.07))
    );
  }
  // The front: a grille in a bright surround between the lamps, a dark
  // intake low in the bumper; the rear: a dark diffuser.
  const nose = L / 2;
  parts.trim.push(box(0.05, 0.16, W * 0.4, nose + 0.02, lampY.head - 0.03, 0));
  parts.metal.push(box(0.03, 0.02, W * 0.42, nose + 0.035, lampY.head + 0.06, 0));
  parts.metal.push(box(0.03, 0.02, W * 0.42, nose + 0.035, lampY.head - 0.12, 0));
  parts.trim.push(box(0.08, 0.1, W * 0.62, nose - 0.02, 0.4, 0));
  parts.trim.push(box(0.12, 0.12, W * 0.86, -nose + 0.06, 0.38, 0));
  // Roof rails on an SUV.
  if (profile.rails)
    for (const side of [-1, 1])
      parts.metal.push(
        box(
          screenTop[0] - rearTop[0] - 0.3,
          0.05,
          0.05,
          (rearTop[0] + screenTop[0]) / 2,
          top + 0.04,
          side * W * 0.3
        )
      );
  // Number plates, front and rear.
  parts.plate.push(plateAt(-nose - 0.035, lampY.tail - 0.33, -1));
  parts.plate.push(plateAt(nose + 0.035, 0.46, 1));
  // Alloy wheels on tyres, flush with the body's sides.
  for (const x of [front, rear])
    for (const side of [-1, 1]) {
      const z = side * (W / 2 - 0.13);
      parts.trim.push(tyre(r, 0.22, x, z));
      alloy(parts, r, 0.22, x, z, side);
    }
  // Lamps: each in a dark housing, the tail lamps wrapping round the rear
  // corners, the indicators at the corners.
  for (const side of [-1, 1]) {
    parts.trim.push(box(0.05, 0.16, 0.42, nose - 0.01, lampY.head, side * (W / 2 - 0.25)));
    parts.head.push(box(0.03, 0.09, 0.34, nose + 0.012, lampY.head + 0.01, side * (W / 2 - 0.27)));
    parts.trim.push(box(0.05, 0.17, 0.48, -nose + 0.01, lampY.tail, side * (W / 2 - 0.26)));
    parts.tail.push(box(0.03, 0.12, 0.42, -nose - 0.012, lampY.tail, side * (W / 2 - 0.27)));
    parts.tail.push(box(0.3, 0.12, 0.03, -nose + 0.16, lampY.tail, side * (W / 2 + 0.004)));
    const lamps = side < 0 ? parts.left : parts.right;
    lamps.push(box(0.05, 0.07, 0.08, -nose - 0.014, lampY.tail, side * (W / 2 - 0.05)));
    lamps.push(box(0.05, 0.06, 0.08, nose + 0.014, lampY.head, side * (W / 2 - 0.05)));
  }
  return parts;
}
const profiles = {
  hatch: {
    body: {
      points: [
        [-2.1, 0.3],
        [2.06, 0.3],
        [2.12, 0.55],
        [2.0, 0.78],
        [0.98, 0.95],
        [-1.9, 0.98],
        [-2.12, 0.74],
      ],
      radii: [0.1, 0.1, 0.15, 0.25, 0.1, 0.12, 0.12],
    },
    glass: {
      points: [
        [-1.93, 0.9],
        [1.0, 0.9],
        [0.18, 1.4],
        [-1.74, 1.38],
      ],
      radii: [0.02, 0.05, 0.15, 0.15],
    },
    roof: {
      points: [
        [-1.73, 1.34],
        [0.2, 1.37],
        [0.12, 1.46],
        [-1.66, 1.45],
      ],
      radii: 0.06,
    },
    wheelbase: 2.62,
    frontOverhang: 0.85,
    r: 0.31,
    lampY: { tail: 0.9, head: 0.68 },
  },
  sedan: {
    body: {
      points: [
        [-2.35, 0.3],
        [2.3, 0.3],
        [2.4, 0.55],
        [2.3, 0.76],
        [1.25, 0.93],
        [-1.55, 0.96],
        [-2.36, 0.98],
        [-2.42, 0.62],
      ],
      radii: [0.1, 0.1, 0.15, 0.25, 0.1, 0.2, 0.1, 0.12],
    },
    glass: {
      points: [
        [-1.62, 0.9],
        [1.24, 0.9],
        [0.35, 1.4],
        [-0.85, 1.42],
      ],
      radii: [0.03, 0.05, 0.15, 0.15],
    },
    roof: {
      points: [
        [-0.86, 1.37],
        [0.38, 1.36],
        [0.3, 1.45],
        [-0.8, 1.46],
      ],
      radii: 0.05,
    },
    wheelbase: 2.8,
    frontOverhang: 0.92,
    r: 0.32,
    lampY: { tail: 0.88, head: 0.67 },
  },
  suv: {
    body: {
      points: [
        [-2.3, 0.4],
        [2.28, 0.4],
        [2.33, 0.65],
        [2.25, 0.92],
        [1.25, 1.06],
        [-2.1, 1.1],
        [-2.33, 0.85],
      ],
      radii: [0.12, 0.12, 0.15, 0.28, 0.1, 0.12, 0.14],
    },
    glass: {
      points: [
        [-2.13, 1.02],
        [1.27, 1.02],
        [0.45, 1.6],
        [-1.96, 1.6],
      ],
      radii: [0.03, 0.05, 0.15, 0.14],
    },
    roof: {
      points: [
        [-1.96, 1.56],
        [0.48, 1.56],
        [0.42, 1.69],
        [-1.9, 1.69],
      ],
      radii: 0.06,
    },
    wheelbase: 2.72,
    frontOverhang: 0.88,
    r: 0.36,
    lampY: { tail: 1.0, head: 0.8 },
    rails: true,
  },
};
// A panel van: a short bonnet and a raked windscreen, the cab's side
// windows, a sliding side door on its rail, two rear doors, a dark rubbing
// strip along the sides, black bumpers, mirrors on arms, steel wheels.
function van({ length: L, width: W }) {
  const parts = newParts();
  const nose = L / 2,
    tail = -L / 2;
  const r = 0.36,
    front = nose - 0.98,
    rear = front - 3.66;
  const shape = withArches(
    [
      [tail + 0.06, 0.38],
      [nose - 0.1, 0.38],
      [nose, 0.58],
      [nose - 0.05, 0.95],
      [nose - 0.62, 1.15],
      [nose - 1.38, 2.25],
      [nose - 1.62, 2.44],
      [tail + 0.08, 2.46],
      [tail, 2.2],
      [tail, 0.55],
    ],
    [0.05, 0.06, 0.12, 0.2, 0.12, 0.25, 0.3, 0.12, 0.1, 0.06],
    [front, rear],
    r
  );
  parts.paint.push(extruded(shape.points, shape.radii, W, 0.08));
  for (const x of [front, rear]) parts.trim.push(wheelWell(r, x, W - 0.16));
  // The windscreen and the cab's side windows, standing just proud.
  parts.glass.push(
    extruded(
      [
        [nose - 2.1, 1.36],
        [nose - 0.66, 1.2],
        [nose - 1.4, 2.15],
        [nose - 2.1, 2.15],
      ],
      [0.03, 0.04, 0.06, 0.03],
      W + 0.02,
      0.02
    )
  );
  // The B-pillar behind the cab doors, black.
  for (const side of [-1, 1])
    parts.trim.push(box(0.12, 0.85, 0.02, nose - 2.16, 1.75, side * (W / 2 + 0.012)));
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.005);
    // The sliding door (right side only, as on the real ones) and its rail.
    if (side > 0) {
      for (const x of [nose - 2.25, nose - 3.75])
        parts.trim.push(box(0.014, 1.75, 0.008, x, 1.4, z));
      parts.trim.push(box(1.9, 0.04, 0.03, nose - 3.4, 2.02, z));
    }
    // The cab door's seam, its handle; the rubbing strip; the mirror.
    parts.trim.push(box(0.014, 1.5, 0.008, nose - 0.75, 1.35, z));
    parts.metal.push(box(0.16, 0.035, 0.03, nose - 2.0, 1.2, side * (W / 2 + 0.012)));
    parts.trim.push(box(L - 1.6, 0.14, 0.03, -0.4, 0.68, side * (W / 2 + 0.008)));
    parts.trim.push(box(0.04, 0.04, 0.32, nose - 0.75, 1.62, side * (W / 2 + 0.14)));
    parts.trim.push(box(0.1, 0.34, 0.16, nose - 0.8, 1.72, side * (W / 2 + 0.3)));
    parts.glass.push(box(0.01, 0.28, 0.12, nose - 0.86, 1.72, side * (W / 2 + 0.3)));
  }
  // Bumpers, the grille with its bright bars, the rear doors' seams and
  // their handle.
  parts.trim.push(box(0.16, 0.24, W * 0.98, nose - 0.04, 0.46, 0));
  parts.trim.push(box(0.14, 0.24, W * 0.98, tail + 0.04, 0.46, 0));
  parts.trim.push(box(0.05, 0.3, W * 0.52, nose - 0.02, 0.8, 0));
  for (const y of [0.72, 0.82, 0.92]) parts.metal.push(box(0.03, 0.02, W * 0.5, nose + 0.01, y, 0));
  for (const z of [0, -W / 2 + 0.06, W / 2 - 0.06])
    parts.trim.push(box(0.02, 1.85, 0.025, tail - 0.012, 1.5, z));
  parts.metal.push(box(0.03, 0.04, 0.16, tail - 0.02, 1.25, 0.1));
  parts.plate.push(plateAt(tail - 0.05, 0.62, -1));
  parts.plate.push(plateAt(nose + 0.05, 0.5, 1));
  for (const x of [front, rear])
    for (const side of [-1, 1]) steelWheel(parts, r, 0.24, x, side * (W / 2 - 0.15), side);
  for (const side of [-1, 1]) {
    // Headlamps on the corners of the nose, tail lamps up the rear pillars.
    parts.trim.push(leaning(0.42, 0.2, 0.42, nose - 0.25, 1.0, side * (W / 2 - 0.24), 0.32));
    parts.head.push(leaning(0.36, 0.13, 0.36, nose - 0.22, 1.02, side * (W / 2 - 0.25), 0.32));
    parts.tail.push(box(0.05, 0.5, 0.14, tail - 0.01, 1.1, side * (W / 2 - 0.08)));
    const lamps = side < 0 ? parts.left : parts.right;
    lamps.push(box(0.05, 0.12, 0.14, tail - 0.012, 0.78, side * (W / 2 - 0.08)));
    lamps.push(box(0.05, 0.07, 0.1, nose - 0.08, 0.98, side * (W / 2 - 0.04)));
  }
  return parts;
}
// A tractor unit and a box trailer, 16.5 m in all. The cab: a sloped,
// rounded front with a big windscreen under a sun visor, a dark grille with
// bright bars, a heavy bumper with the headlamps in it, mirrors on long
// arms, steps under the doors, a roof fairing up to the trailer's height,
// fuel tanks and side fairings. The trailer: ribbed sides between bright
// top and bottom rails, side guards, landing legs, rear doors with their
// locking bars, a bumper, mud flaps and three axles.
function lorry({ length: L, width: W }) {
  const parts = newParts(true);
  const front = L / 2;
  const cabBack = front - 2.35;
  parts.paint.push(
    extruded(
      [
        [cabBack, 0.95],
        [front - 0.03, 0.95],
        [front + 0.05, 1.6],
        [front + 0.02, 2.25],
        [front - 0.14, 3.4],
        [front - 0.42, 3.86],
        [cabBack, 3.86],
      ],
      [0.05, 0.08, 0.12, 0.1, 0.25, 0.2, 0.05],
      W,
      0.1
    )
  );
  // The roof fairing, up toward the trailer's roof.
  parts.paint.push(
    extruded(
      [
        [cabBack + 0.1, 3.8],
        [front - 0.55, 3.8],
        [cabBack + 0.6, 4.02],
        [cabBack + 0.1, 4.02],
      ],
      [0.02, 0.15, 0.2, 0.02],
      W - 0.2,
      0.05
    )
  );
  // Windscreen, the doors' windows and the sun visor over them.
  parts.glass.push(leaning(0.05, 1.08, W - 0.26, front - 0.06, 2.82, 0, -0.14));
  parts.glass.push(box(0.75, 0.82, W + 0.02, front - 0.82, 2.72, 0));
  parts.trim.push(leaning(0.32, 0.05, W - 0.12, front - 0.12, 3.44, 0, 0.2));
  // Grille with bright bars, the bumper and the headlamps' housings.
  parts.trim.push(box(0.06, 0.82, W * 0.62, front + 0.05, 1.82, 0));
  for (const y of [1.55, 1.72, 1.89, 2.06])
    parts.metal.push(box(0.04, 0.035, W * 0.6, front + 0.08, y, 0));
  parts.trim.push(box(0.28, 0.42, W - 0.02, front - 0.02, 0.82, 0));
  // Mirrors on their arms, the steps, fuel tanks and the side fairings.
  for (const side of [-1, 1]) {
    parts.trim.push(box(0.05, 0.05, 0.42, front - 0.3, 2.9, side * (W / 2 + 0.18)));
    parts.trim.push(box(0.12, 0.62, 0.2, front - 0.32, 2.6, side * (W / 2 + 0.4)));
    parts.glass.push(box(0.01, 0.55, 0.16, front - 0.39, 2.6, side * (W / 2 + 0.4)));
    for (const y of [0.55, 0.85])
      parts.trim.push(box(0.5, 0.05, 0.26, front - 1.75, y, side * (W / 2 - 0.12)));
    const tank = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16);
    tank.rotateZ(Math.PI / 2);
    tank.translate(front - 3.2, 0.72, side * (W / 2 - 0.32));
    tank.deleteAttribute('uv');
    parts.metal.push(tank);
    parts.paint.push(box(1.6, 0.55, 0.04, front - 3.9, 1.0, side * (W / 2 - 0.02)));
  }
  // The trailer: its box, ribs along both sides and bright rails top and
  // bottom.
  const trailerFront = front - 2.55,
    back = trailerFront - 13.6,
    trailerMid = (trailerFront + back) / 2,
    floor = 1.25,
    height = 2.75;
  parts.trailer.push(box(13.6, height, W, trailerMid, floor + height / 2, 0));
  for (const side of [-1, 1]) {
    for (let x = back + 0.6; x < trailerFront - 0.3; x += 0.62)
      parts.trailer.push(
        box(0.07, height - 0.2, 0.035, x, floor + height / 2, side * (W / 2 + 0.012))
      );
    for (const y of [floor + 0.06, floor + height - 0.06])
      parts.metal.push(box(13.6, 0.1, 0.04, trailerMid, y, side * (W / 2 + 0.02)));
    // Side guards between the legs and the rear axles.
    for (const y of [0.6, 0.95])
      parts.metal.push(box(6.2, 0.06, 0.03, back + 8.4, y, side * (W / 2 - 0.06)));
    // The landing legs.
    parts.trim.push(box(0.1, 0.9, 0.1, trailerFront - 2.4, floor - 0.45, side * (W / 2 - 0.35)));
  }
  // Chassis under it all, the cab's mudguards and the rear underrun bar.
  parts.trim.push(box(L - 0.4, 0.35, 0.9, 0, 0.95, 0));
  parts.trim.push(box(0.16, 0.2, W - 0.3, back + 0.25, 0.55, 0));
  // The rear doors, their hinges and locking bars, and the plates.
  for (const dz of [-0.55, 0.55, -1.18, 1.18])
    parts.metal.push(box(0.05, height - 0.2, 0.045, back - 0.03, floor + height / 2, dz));
  parts.trim.push(box(0.03, height - 0.1, 0.025, back - 0.015, floor + height / 2, 0));
  parts.plate.push(plateAt(back + 0.25 - 0.06, 0.42, -1));
  parts.plate.push(plateAt(front + 0.12, 0.62, 1));
  for (const side of [-1, 1])
    parts.trim.push(box(0.03, 0.55, 0.55, back + 0.15, 0.62, side * (W / 2 - 0.35)));
  // Single tyres in front, pairs of tyres side by side on the drive axle
  // and the trailer's three.
  const r = 0.5;
  for (const [x, dual] of [
    [front - 1.15, false],
    [front - 4.9, true],
    [back + 3.3, true],
    [back + 2.0, true],
    [back + 0.7, true],
  ])
    for (const side of [-1, 1]) {
      const outer = side * (W / 2 - 0.16);
      steelWheel(parts, r, 0.3, x, outer, side);
      if (dual) parts.trim.push(tyre(r, 0.28, x, outer - side * 0.34));
    }
  // Mudguards over the cab's wheels.
  for (const x of [front - 1.15, front - 4.9])
    for (const side of [-1, 1])
      parts.trim.push(box(1.1, 0.05, 0.62, x, 1.14, side * (W / 2 - 0.3)));
  for (const side of [-1, 1]) {
    parts.tail.push(box(0.05, 0.14, 0.42, back + 0.22, 0.68, side * (W / 2 - 0.35)));
    parts.head.push(box(0.05, 0.16, 0.36, front + 0.13, 0.86, side * (W / 2 - 0.3)));
    const lamps = side < 0 ? parts.left : parts.right;
    lamps.push(box(0.05, 0.12, 0.12, back + 0.22, 0.68, side * (W / 2 - 0.08)));
    lamps.push(box(0.05, 0.1, 0.14, front + 0.13, 0.86, side * (W / 2 - 0.06)));
  }
  return parts;
}

// Ukrainian number plates for the traffic, all on one texture: a grid of
// `plateGrid` × `plateGrid`, each with the blue band, the flag and UA, and a
// region's two letters, four digits and two more letters (those in both
// alphabets, as on real plates).
export const plateGrid = 8;
const regions = [
  'AA',
  'KA',
  'AI',
  'BC',
  'AX',
  'BH',
  'AE',
  'BI',
  'AT',
  'BX',
  'AM',
  'CA',
  'BO',
  'BK',
  'AP',
  'BA',
];
const plateLetters = 'ABCEHIKMOPTX';
export function randomPlate(random = Math.random) {
  const letter = () => plateLetters[Math.floor(random() * plateLetters.length)];
  const digits = String(Math.floor(random() * 10000)).padStart(4, '0');
  return `${regions[Math.floor(random() * regions.length)]} ${digits} ${letter()}${letter()}`;
}
function plateAtlas() {
  if (typeof document === 'undefined') return null;
  const w = 260,
    h = 56;
  const canvas = document.createElement('canvas');
  canvas.width = w * plateGrid;
  canvas.height = h * plateGrid;
  const g = canvas.getContext('2d');
  let seed = 20251;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < plateGrid * plateGrid; i++) {
    const x = (i % plateGrid) * w,
      y = Math.floor(i / plateGrid) * h;
    g.fillStyle = '#2b2f33';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#f3f4f4';
    g.beginPath();
    g.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 3);
    g.fill();
    g.fillStyle = '#2a76d6';
    g.fillRect(x + 1.5, y + 1.5, 23, h - 3);
    g.fillStyle = '#1f5fbf';
    g.fillRect(x + 6, y + 8, 14, 5);
    g.fillStyle = '#f5cd1c';
    g.fillRect(x + 6, y + 13, 14, 5);
    g.fillStyle = '#ffffff';
    g.font = '700 10px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('UA', x + 13, y + h - 9);
    g.fillStyle = '#141518';
    g.font = '700 38px "Arial Narrow", "DIN Condensed", "Roboto Condensed", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(randomPlate(random), x + 24 + (w - 28) / 2, y + h / 2 + 2, w - 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function shadowTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const gradient = g.createRadialGradient(32, 64, 4, 32, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.save();
  g.scale(1, 2);
  g.fillRect(0, 0, 64, 64);
  g.restore();
  return new THREE.CanvasTexture(c);
}

// `oncoming`: how many come the other way (on the route's dual carriageway).
export function setupTraffic(scene, { count, oncoming = 0 } = {}) {
  // The same traffic for the same road (?road=N), for repeatable pictures.
  const traffic = new Traffic({ count, random: seededRandom(roadSeed || 1, 9) });
  const materials = {
    // Glossy paint under a clear coat, reflecting the sky as the car's own
    // does.
    paint: new THREE.MeshPhysicalMaterial({
      name: 'Traffic paint',
      metalness: 0.5,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
    trailer: new THREE.MeshStandardMaterial({
      name: 'Trailer sides',
      metalness: 0.15,
      roughness: 0.55,
    }),
    glass: new THREE.MeshStandardMaterial({
      name: 'Traffic glass',
      color: 0x10151a,
      metalness: 0.3,
      roughness: 0.08,
    }),
    trim: new THREE.MeshStandardMaterial({ name: 'Traffic trim', color: 0x15171a, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({
      name: 'Traffic wheels',
      color: 0xa4a9ad,
      metalness: 0.8,
      roughness: 0.35,
    }),
    plate: new THREE.MeshStandardMaterial({
      name: 'Traffic plates',
      map: plateAtlas(),
      roughness: 0.45,
    }),
    lamp: new THREE.MeshBasicMaterial({ name: 'Traffic lamps', toneMapped: false }),
  };
  // Each vehicle's plate: its cell of the atlas, by an instance attribute.
  materials.plate.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float plateIndex;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_MAP
          vec2 plateCell = vec2(mod(plateIndex, ${plateGrid}.), ${plateGrid - 1}. - floor(plateIndex / ${plateGrid}.));
          vMapUv = (vMapUv + plateCell) / ${plateGrid}.;
        #endif`
      );
  };
  materials.plate.customProgramCacheKey = () => 'traffic-plates';
  // The wheels turn as the vehicle rolls: each piece marked with its hub is
  // turned about the axle by the distance rolled over the wheel's radius
  // (the hub's height).
  for (const kind of Object.keys(wheelKinds)) {
    const material = materials[kind];
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 wheelHub;
          attribute float wheelRoll;`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          float wheelAngle = wheelHub.z > .5 ? -wheelRoll / max(wheelHub.y, .05) : 0.;
          mat2 wheelTurn = mat2(cos(wheelAngle), sin(wheelAngle), -sin(wheelAngle), cos(wheelAngle));
          objectNormal.xy = wheelTurn * objectNormal.xy;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          if (wheelHub.z > .5) transformed.xy = wheelHub.xy + wheelTurn * (transformed.xy - wheelHub.xy);`
        );
    };
    material.customProgramCacheKey = () => `traffic-wheels-${kind}`;
  }
  const builders = {
    hatch: (spec) => car(spec, profiles.hatch),
    sedan: (spec) => car(spec, profiles.sedan),
    suv: (spec) => car(spec, profiles.suv),
    van,
    lorry,
    police,
  };
  const group = new THREE.Group();
  group.name = 'Traffic';
  scene.add(group);
  const opposite = oncoming
    ? new OncomingTraffic({ count: oncoming, random: seededRandom(roadSeed || 1, 10) })
    : null;
  const capacity = (traffic.count || 16) + oncoming + 2;
  // Sun shadows: the bodies again, flattened onto the road along the sun's
  // direction (a projection set as the meshes' own matrix, after each
  // vehicle's instance matrix). Drawn translucent and dark, each pixel once:
  // the stencil marks where shadow has been laid, so parts overlapping in
  // the projection do not darken it twice.
  const sunShadow = new THREE.MeshBasicMaterial({
    name: 'Traffic sun shadows',
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    // Flat or added on: one pass for both faces (three otherwise draws
    // a double-sided transparent material twice, re-checking its program
    // each time).
    forceSinglePass: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const projection = new THREE.Matrix4();
  const shadowMeshes = [];
  // Per type: one instanced mesh per material, with its part kind.
  const meshes = {};
  for (const [type, spec] of Object.entries(vehicleTypes)) {
    const parts = builders[type](spec);
    meshes[type] = Object.entries(parts)
      .filter(([, list]) => list.length)
      .map(([kind, list]) => {
        const rolling = kind in wheelKinds;
        const pieces = list.map((g) => {
          const piece = g.index ? g.toNonIndexed() : g;
          // Each vertex's hub (x, height, 1), or nothing (0, 0, 0).
          if (rolling) {
            const [hx, hy] = g.userData.hub ?? [0, 0];
            const flag = g.userData.hub ? 1 : 0;
            const hub = new Float32Array(piece.attributes.position.count * 3);
            for (let i = 0; i < hub.length; i += 3) hub.set([hx, hy, flag], i);
            piece.setAttribute('wheelHub', new THREE.BufferAttribute(hub, 3));
          }
          return piece;
        });
        const geometry = mergeGeometries(pieces, false);
        for (const g of pieces) g.dispose();
        for (const g of list) g.dispose();
        const lamp = ['tail', 'head', 'left', 'right', 'beaconBlue', 'beaconRed'].includes(kind);
        const material = lamp ? materials.lamp : materials[kind];
        // How far each vehicle has rolled (m), turning its wheels.
        if (rolling)
          geometry.setAttribute(
            'wheelRoll',
            new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
              THREE.DynamicDrawUsage
            )
          );
        if (kind === 'plate')
          geometry.setAttribute(
            'plateIndex',
            new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(
              THREE.DynamicDrawUsage
            )
          );
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, new THREE.Color(1, 1, 1));
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.receiveShadow = !lamp;
        mesh.name = `Traffic ${type} ${kind}`;
        group.add(mesh);
        let flat = null;
        if (['paint', 'trailer', 'glass', 'trim'].includes(kind)) {
          flat = new THREE.InstancedMesh(geometry, sunShadow, capacity);
          flat.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          flat.count = 0;
          flat.frustumCulled = false;
          flat.matrixAutoUpdate = false;
          flat.renderOrder = 2;
          flat.name = `Traffic ${type} ${kind} shadow`;
          group.add(flat);
          shadowMeshes.push(flat);
        }
        return { kind, mesh, flat };
      });
  }
  const shadow = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      name: 'Traffic shadows',
      color: 0x000000,
      map: shadowTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    capacity
  );
  shadow.frustumCulled = false;
  shadow.count = 0;
  shadow.renderOrder = 1;
  shadow.name = 'Traffic shadows';
  group.add(shadow);
  // Their lamps' light on the road when they are lit (after dark and in
  // the tunnel): a warm fan ahead of each from its headlamps and a red glow
  // behind from its tail lamps, soft additive patches as the car's own
  // tail-lamp glow is (see rear-glow.js), two draws for all of them.
  const lampPool = (name, colour, opacity, draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    draw(canvas.getContext('2d'), 128, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const pool = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        name,
        color: colour,
        map: texture,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        toneMapped: false,
        fog: false,
        // (The tail glow's is mirrored.)
        side: THREE.DoubleSide,
        // Flat or added on: one pass for both faces (three otherwise draws
        // a double-sided transparent material twice, re-checking its program
        // each time).
        forceSinglePass: true,
      }),
      capacity
    );
    pool.frustumCulled = false;
    pool.count = 0;
    pool.renderOrder = 3;
    pool.name = name;
    group.add(pool);
    return pool;
  };
  // Every pool fades to nothing at each edge of its patch, so no edge of it
  // shows on the road.
  const smoothEdge = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const paintPool = (g, w, h, light) => {
    const image = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const along = x / (w - 1),
          across = (y / (h - 1) - 0.5) * 2;
        const edges =
          smoothEdge(along / 0.12) *
          smoothEdge((1 - along) / 0.35) *
          smoothEdge((1 - Math.abs(across)) / 0.45);
        const i = (y * w + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(255 * Math.min(1, light(along, across)) * edges);
      }
    g.putImageData(image, 0, 0);
  };
  // Ahead: brightest a few metres in front, widening as it reaches out (the
  // texture's left edge at the bumper).
  const headPool = lampPool(
    'Traffic headlamp light',
    new THREE.Color(1, 0.93, 0.8),
    0.55,
    (g, w, h) =>
      paintPool(g, w, h, (along, across) => {
        const spread = 0.3 + 0.6 * along;
        return (
          1.1 * Math.exp(-(((along - 0.28) / 0.34) ** 2)) * Math.exp(-((across / spread) ** 2) * 2)
        );
      })
  );
  // Behind: a round red glow from the tail lamps.
  const tailPool = lampPool(
    'Traffic tail-lamp light',
    new THREE.Color(1, 0.06, 0.03),
    0.42,
    (g, w, h) =>
      paintPool(g, w, h, (along, across) => Math.exp(-((along / 0.45) ** 2) - (across / 0.6) ** 2))
  );
  // A patrol car's light bar at night: a blue and a red wash on the road
  // either side of it, each lit as its lamp flashes.
  const roundGlow = (g, w, h) => {
    const image = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x / (w - 1)) * 2 - 1,
          dy = (y / (h - 1)) * 2 - 1;
        const i = (y * w + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(255 * Math.max(0, 1 - Math.hypot(dx, dy)) ** 2);
      }
    g.putImageData(image, 0, 0);
  };
  const blueGlow = lampPool('Police blue glow', new THREE.Color(0.25, 0.45, 1), 0.85, roundGlow),
    redGlow = lampPool('Police red glow', new THREE.Color(1, 0.15, 0.1), 0.75, roundGlow);
  const poolAt = new THREE.Vector3(),
    poolSize = new THREE.Vector3(),
    flatTurn = new THREE.Quaternion();

  const rideRange = 220;
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    euler = new THREE.Euler(0, 0, 0, 'YXZ'),
    one = new THREE.Vector3(1, 1, 1),
    hidden = new THREE.Matrix4().makeScale(0, 0, 0),
    colour = new THREE.Color(),
    paint = new THREE.Color(),
    lit = {
      off: new THREE.Color(0.22, 0.03, 0.02),
      tail: new THREE.Color(1.1, 0.07, 0.05),
      brake: new THREE.Color(3.4, 0.2, 0.12),
      headDay: new THREE.Color(0.9, 0.92, 0.95),
      headNight: new THREE.Color(3, 2.9, 2.6),
      signalOff: new THREE.Color(0.25, 0.12, 0.02),
      signalOn: new THREE.Color(3.2, 1.35, 0.08),
      blueOn: new THREE.Color(0.25, 0.7, 5),
      blueOff: new THREE.Color(0.04, 0.07, 0.3),
      redOn: new THREE.Color(5, 0.25, 0.18),
      redOff: new THREE.Color(0.3, 0.03, 0.03),
    };
  const paintCache = new Map();
  const paintOf = (hex) => {
    if (!paintCache.has(hex)) paintCache.set(hex, new THREE.Color(hex));
    return paintCache.get(hex);
  };

  return {
    traffic,
    group,
    oncoming: opposite,
    reset(x, lateral) {
      traffic.reset(x, lateral);
      opposite?.reset(x);
    },
    // Draws the vehicles; `night` 0–1 lights their lamps, `playerCover`
    // how far the car is under the tunnel's roof (the scene is dimmed for
    // it already); `sun` points toward the sun and `sunlight` (0–1) is how
    // strong its shadows are. Those within `rideRange` of `x` ride the
    // road's bumps and potholes (dt in seconds).
    update({ night = 0, playerCover = 0, sun = null, sunlight = 0, x = 0, dt = 0 } = {}) {
      // Flatten onto the road (y = 0.02) along the sun's direction, the sun
      // kept off the horizon so shadows stay a sensible length.
      const showShadows = Boolean(sun) && sunlight > 0.02;
      if (showShadows) {
        const y = Math.max(0.22, sun.y);
        const kx = sun.x / y,
          kz = sun.z / y,
          h = 0.02;
        projection.set(1, -kx, 0, kx * h, 0, 0, 0, h, 0, -kz, 1, kz * h, 0, 0, 0, 1);
        sunShadow.opacity = 0.5 * sunlight;
        for (const flat of shadowMeshes) {
          flat.matrix.copy(projection);
          flat.matrixWorld.copy(projection);
        }
      }
      const counts = Object.fromEntries(Object.keys(meshes).map((t) => [t, 0]));
      let shadows = 0,
        pools = 0,
        blues = 0,
        reds = 0;
      opposite?.update(dt, x);
      for (const v of opposite ? [...traffic.vehicles, ...opposite.vehicles] : traffic.vehicles) {
        const index = counts[v.type]++;
        // (Kept under a kilometre for the shader's precision; the jump at
        // the wrap is lost in a fast-turning wheel.)
        v.rolled = ((v.rolled ?? 0) + Math.max(0, v.speed) * dt) % 1000;
        const z = roadCenterZ(v.x) + v.lat;
        const heading =
          -Math.atan(roadCenterSlope(v.x)) -
          Math.atan2(v.latSpeed, Math.max(v.speed, 1)) +
          (v.yaw ?? 0);
        // Bumps and potholes rock it (the far ones are not worth the work).
        const ride =
          Math.abs(v.x - x) < rideRange
            ? rideOver(v, dt, (rx, lat) => roadHeight(rx, roadCenterZ(rx) + lat))
            : null;
        // The nose dips under braking and lifts a little accelerating; the
        // body leans out of a lane change.
        euler.set(
          THREE.MathUtils.clamp(v.latSpeed * 0.012, -0.03, 0.03) - (ride?.roll ?? 0),
          heading,
          THREE.MathUtils.clamp(v.accel * 0.004, -0.02, 0.012) + (ride?.pitch ?? 0)
        );
        rotation.setFromEuler(euler);
        position.set(v.x, ride?.y ?? 0, z);
        matrix.compose(position, rotation, one);
        // In the tunnel, darker than the daylight the scene is lit by.
        const cover = Math.max(0, tunnelCover(v.x, v.lat) - playerCover);
        const shade = 1 - 0.75 * cover;
        const lamps = Math.max(night, tunnelCover(v.x, v.lat) > 0.1 ? 1 : 0);
        const braking = v.accel < -1.2;
        // No sun shadow in the tunnel or in a bridge's shade.
        const sunlit =
          tunnelCover(v.x, v.lat) < 0.3 &&
          bridgeShade(v.x, z, structureUniforms.structureSunShift.value, 1) < 0.5;
        for (const { kind, mesh, flat } of meshes[v.type]) {
          mesh.setMatrixAt(index, matrix);
          if (kind in wheelKinds) {
            mesh.geometry.attributes.wheelRoll.setX(index, v.rolled);
            mesh.geometry.attributes.wheelRoll.needsUpdate = true;
          }
          if (kind === 'plate') {
            mesh.geometry.attributes.plateIndex.setX(index, v.id % (plateGrid * plateGrid));
            mesh.geometry.attributes.plateIndex.needsUpdate = true;
          }
          if (flat) flat.setMatrixAt(index, sunlit ? matrix : hidden);
          if (kind === 'paint') colour.copy(paint.copy(paintOf(v.colour))).multiplyScalar(shade);
          else if (kind === 'trailer') colour.copy(paintOf(v.trailer)).multiplyScalar(shade);
          else if (kind === 'tail')
            colour.copy(braking ? lit.brake : lamps > 0.5 ? lit.tail : lit.off);
          else if (kind === 'head') colour.copy(lamps > 0.5 ? lit.headNight : lit.headDay);
          else if (kind === 'beaconBlue' || kind === 'beaconRed')
            colour.copy(
              kind === 'beaconBlue'
                ? beaconLit(v, 0)
                  ? lit.blueOn
                  : lit.blueOff
                : beaconLit(v, 1)
                  ? lit.redOn
                  : lit.redOff
            );
          else if (kind === 'left' || kind === 'right')
            colour.copy(
              Traffic.blink(v) && (v.crash || (kind === 'left') === v.signal < 0)
                ? lit.signalOn
                : lit.signalOff
            );
          else colour.setRGB(shade, shade, shade);
          mesh.setColorAt(index, colour);
        }
        // The soft shadow under it.
        position.y = 0.03;
        euler.set(0, heading, 0);
        rotation.setFromEuler(euler);
        matrix.compose(position, rotation, new THREE.Vector3(v.length + 0.7, 1, v.width + 0.6));
        shadow.setMatrixAt(shadows++, matrix);
        // A patrol car's light bar after dark: its blue and red on the road.
        if (v.police?.lights && lamps > 0.5) {
          euler.set(0, heading, 0);
          flatTurn.setFromEuler(euler);
          for (const [side, glow] of [
            [0, blueGlow],
            [1, redGlow],
          ]) {
            if (!beaconLit(v, side)) continue;
            const off = side ? 1.6 : -1.6;
            poolAt.set(v.x - Math.sin(heading) * off, 0.03, position.z + Math.cos(heading) * off);
            poolSize.set(11, 1, 9);
            matrix.compose(poolAt, flatTurn, poolSize);
            if (side) redGlow.setMatrixAt(reds++, matrix);
            else blueGlow.setMatrixAt(blues++, matrix);
          }
        }
        // Lamps lit: their light on the road ahead and behind.
        if (lamps > 0.5) {
          flatTurn.setFromEuler(euler);
          const c = Math.cos(heading),
            s = Math.sin(heading);
          const reach = v.lorry ? 16 : 13,
            front = v.length / 2;
          poolAt.set(v.x + c * (front + reach / 2), 0.02, position.z - s * (front + reach / 2));
          poolSize.set(reach, 1, v.width + 2.6);
          matrix.compose(poolAt, flatTurn, poolSize);
          headPool.setMatrixAt(pools, matrix);
          // (Behind: the texture turned to face back.)
          poolAt.set(v.x - c * (front + 1.6), 0.02, position.z + s * (front + 1.6));
          poolSize.set(-3.4, 1, v.width + 1.8);
          matrix.compose(poolAt, flatTurn, poolSize);
          tailPool.setMatrixAt(pools, matrix);
          pools++;
        }
      }
      for (const [type, list] of Object.entries(meshes))
        for (const { mesh, flat } of list) {
          if (flat) {
            flat.count = showShadows ? counts[type] : 0;
            // (An empty instanced mesh still costs a draw call.)
            flat.visible = flat.count > 0;
            flat.instanceMatrix.needsUpdate = true;
          }
          mesh.count = counts[type];
          mesh.visible = mesh.count > 0;
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      shadow.count = shadows;
      shadow.instanceMatrix.needsUpdate = true;
      headPool.count = tailPool.count = pools;
      blueGlow.count = blues;
      redGlow.count = reds;
      blueGlow.visible = blues > 0;
      redGlow.visible = reds > 0;
      headPool.visible = tailPool.visible = pools > 0;
      blueGlow.instanceMatrix.needsUpdate = redGlow.instanceMatrix.needsUpdate = true;
      headPool.instanceMatrix.needsUpdate = tailPool.instanceMatrix.needsUpdate = true;
    },
  };
}
