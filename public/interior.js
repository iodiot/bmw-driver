import * as THREE from 'three';
import {
  buildDoorCard,
  cognacLeather,
  doorMaterials,
  grainScale,
  leatherGrain,
  isOldDoorTriangle,
  roundedBlock,
} from './door-trim.js';
import { buildCabinFloor, footwell, isOldFootwellTriangle } from './cabin-floor.js';
import { buildDashboard, buildRoofFittings, isOldDashTriangle } from './dashboard.js';
import { isOldRearMirrorTriangle } from './mirrors.js';

// New front seats and M steering wheel. The downloaded model's front seats
// are a few dozen flat triangles and its wheel a coarse ring; both are
// replaced by smooth parts modelled after the F10 M5: sculpted sports seats
// with side bolsters and separate headrests in black Merino leather, and the
// three-spoke M leather wheel with thumb rests, a split lower spoke with the
// M badge, the BMW roundel, button panels and shift paddles. The wheel turns
// with the steering. Body space: x forward, y up, z to the right; the car is
// left-hand drive, so the driver sits at negative z.
// Share of the sky's indirect light that reaches the cabin's surfaces.
export const cabinOcclusion = 0.55;
export const interiorLayout = Object.freeze({
  // Fitted to the model's own wheel: rim centre, axis toward the driver.
  wheel: Object.freeze({
    centre: Object.freeze([0.399, 0.287, -0.397]),
    axis: Object.freeze([-0.925, 0.379, 0]),
    radius: 0.188,
    grip: 0.0185,
    // Front-wheel angle to steering-wheel angle.
    ratio: 14,
  }),
  // The model's front seats occupy this region (body space, metres).
  oldSeats: Object.freeze({
    minX: -0.75,
    maxX: 0.02,
    minY: -0.15,
    maxY: 0.68,
    minZ: 0.1,
    maxZ: 0.62,
  }),
  seatCentres: Object.freeze([-0.385, 0.385]),
  // The front seats stand this far ahead of the model's own seats, which
  // sat behind the B-pillar, too far from the wheel.
  seatForward: 0.15,
});

// The model's cabin floor: a flat sheet from 0.21 m at the rear bench
// (x = -0.98) to 0.11 m under the dashboard (x = 0.6). Its cabin is low, so
// the seats sit on this sheet with compressed proportions, as the model's
// own seats did.
export function cabinFloor(x) {
  return 0.21 - ((x + 0.98) * 0.1) / 1.58;
}

// Triangles of the model's rear bench (cushion, backrest and headrests),
// in its shared interior meshes; the parcel shelf behind it, the doors and
// the floor sheet stay.
export function isOldBenchTriangle(a, b, c, meshName) {
  if (meshName !== 'Object_53' && meshName !== 'Object_37') return false;
  const x = (a.x + b.x + c.x) / 3,
    y = (a.y + b.y + c.y) / 3,
    z = Math.abs((a.z + b.z + c.z) / 3);
  const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  const normalY = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3()).y;
  return (
    x > -1.6 &&
    x < -0.92 &&
    y > -0.3 &&
    y < 0.6 &&
    z < 0.66 &&
    edge < 1 &&
    !(normalY > 0.85 && x < -1.38) &&
    !(z > 0.6 && y > 0.3)
  );
}

// Triangles of the model's headliner and trim (roof lining, pillars and
// door panels): its texture paints them a murky
// mustard, which fills the view from the driver's seat. They get an
// anthracite headliner instead.
export function isHeadlinerTriangle(a, b, c, meshName) {
  if (meshName !== 'Object_53') return false;
  const x = (a.x + b.x + c.x) / 3,
    y = (a.y + b.y + c.y) / 3,
    z = Math.abs((a.z + b.z + c.z) / 3),
    low = Math.min(a.y, b.y, c.y);
  // The parcel shelf under the rear window, seen through it from outside,
  // is anthracite too (its light grey showed as pale triangles).
  if (x < -1.7 && x > -2.0 && low > 0.45) return true;
  if (x < -1.7 || x > 1.25) return false;
  return low > 0.5 || (low > 0.3 && y > 0.38 && z > 0.55) || (low > 0.1 && z > 0.62);
}

// Triangles of the model's front seats in a shared interior mesh: small
// triangles inside the seat region, excluding the pillar trim above it.
export function isOldSeatTriangle(a, b, c) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = interiorLayout.oldSeats;
  const x = (a.x + b.x + c.x) / 3,
    y = (a.y + b.y + c.y) / 3,
    z = Math.abs((a.z + b.z + c.z) / 3);
  const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  return (
    edge < 1 &&
    x > minX &&
    x < maxX &&
    y > minY &&
    y < maxY &&
    z > minZ &&
    z < maxZ &&
    !(z > 0.58 && y > 0.5)
  );
}

// Woven headliner cloth: fine grey noise, repeated.
function fabricTexture() {
  const size = 128,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'),
    image = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 200 + Math.random() * 55;
    image.data.set([v, v, v, 255], i * 4);
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// Smooth normals for an indexed mesh whose vertices are split at every
// face (the model's low-poly trim): faces meeting at a point share one
// normal there, oriented like the face, unless the faces fold back sharply
// (an edge kept crisp).
export function smoothNormals(geometry, crease = 0.5) {
  const position = geometry.attributes.position,
    index = geometry.index,
    key = (i) =>
      `${Math.round(position.getX(i) * 2000)},${Math.round(position.getY(i) * 2000)},${Math.round(position.getZ(i) * 2000)}`;
  const faces = [],
    byPoint = new Map(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const face = { ids, n, unit: n.clone().normalize() };
    faces.push(face);
    for (const id of ids) {
      const k = key(id);
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(face);
    }
  }
  const normals = new Float32Array(position.count * 3);
  if (geometry.attributes.normal) normals.set(geometry.attributes.normal.array);
  const sum = new THREE.Vector3();
  for (const face of faces)
    for (const id of face.ids) {
      sum.set(0, 0, 0);
      for (const other of byPoint.get(key(id)))
        if (other.unit.dot(face.unit) > crease) sum.add(other.n);
      sum.normalize();
      normals.set([sum.x, sum.y, sum.z], id * 3);
    }
  return new THREE.BufferAttribute(normals, 3);
}

// A smooth closed tube through cross-sections (rings of equal point count),
// with its ends closed by fans. Shared vertices give smooth shading.
export function loft(rings, shade = null) {
  const n = rings[0].length,
    positions = [],
    colours = [],
    uvs = [],
    indices = [];
  // Uvs in metres: round each section, and along the sections, so surface
  // textures (the leather grain) keep their size.
  const along = new Array(n).fill(0);
  rings.forEach((ring, r) => {
    let round = 0;
    ring.forEach((p, i) => {
      if (i) round += p.distanceTo(ring[i - 1]);
      if (r) along[i] += p.distanceTo(rings[r - 1][i]);
      positions.push(p.x, p.y, p.z);
      uvs.push(round, along[i]);
      const v = shade ? shade(r, i) : 1;
      colours.push(v, v, v);
    });
  });
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n),
        c = a + n,
        d = b + n;
      indices.push(a, c, b, b, c, d);
    }
  // End caps wound like the sides, so both face the same way.
  for (const [r, flip] of [
    [0, false],
    [rings.length - 1, true],
  ]) {
    const centre = rings[r].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n);
    const k = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    colours.push(1, 1, 1);
    uvs.push(0, 0);
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      indices.push(...(flip ? [k, b, a] : [k, a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Faces must point outward whichever way the outlines run: compare the
  // normals of a middle ring with the direction away from its centre.
  const mid = rings[Math.floor(rings.length / 2)],
    centre = mid.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n),
    normal = geometry.attributes.normal,
    v = new THREE.Vector3();
  let outward = 0;
  const offset = Math.floor(rings.length / 2) * n;
  for (let i = 0; i < n; i++)
    outward += v.fromBufferAttribute(normal, offset + i).dot(mid[i].clone().sub(centre));
  if (outward < 0) {
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  return geometry;
}

// A smooth closed outline through 2D control points, as N points placed in
// 3D by an origin and two axes; scaled toward its centre to round off ends.
export function ring(points2d, origin, axisA, axisB, scale = 1, count = 40) {
  const cx = points2d.reduce((s, p) => s + p[0], 0) / points2d.length,
    cy = points2d.reduce((s, p) => s + p[1], 0) / points2d.length;
  const curve = new THREE.CatmullRomCurve3(
    points2d.map(([a, b]) => new THREE.Vector3(cx + (a - cx) * scale, cy + (b - cy) * scale, 0)),
    true,
    'centripetal'
  );
  const local = curve.getSpacedPoints(count).slice(0, count);
  const points = local.map((p) =>
    origin.clone().addScaledVector(axisA, p.x).addScaledVector(axisB, p.y)
  );
  // Each point's lateral and depth coordinates, for shading panels.
  points.local = local.map((p) => [p.x, p.y]);
  return points;
}

// Perforated panels a shade darker than the smooth bolsters, on the seating
// face only: `inPanel(lateral, depth)` picks them out.
// A seam along lofted sections: through the point of each section on its
// front (upper) half nearest a lateral position, as a thin tube.
function seamAlong(rings, lateral, material) {
  const points = rings.map((r) => {
    const depths = r.local.map(([, b]) => b);
    const mid = (Math.min(...depths) + Math.max(...depths)) / 2;
    // The front edge between the two points either side of the lateral
    // position, interpolated, so the seam runs straight.
    let found = null;
    for (let i = 0; i < r.length; i++) {
      const j = (i + 1) % r.length;
      const [a0, b0] = r.local[i],
        [a1, b1] = r.local[j];
      if (b0 < mid || b1 < mid || (a0 - lateral) * (a1 - lateral) > 0 || a0 === a1) continue;
      const t = (lateral - a0) / (a1 - a0);
      found = r[i].clone().lerp(r[j], t);
      break;
    }
    return found;
  });
  const path = points.filter(Boolean);
  const seam = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), path.length * 3, 0.0011, 5),
    material
  );
  seam.name = 'Seat seam';
  return seam;
}
const panelShade = (rings, inPanel) => (r, i) => (inPanel(...rings[r].local[i]) ? 0.62 : 1);

// Mirrors the right half of an outline (from the top centre, clockwise
// round to the bottom centre) into a closed outline.
function mirrored(half) {
  return [
    ...half,
    ...half
      .slice(1, -1)
      .reverse()
      .map(([a, b]) => [-a, b]),
  ];
}
// Seat cushion cross-section (lateral, height): a flat centre between raised
// side bolsters, a flat base.
function cushionProfile(hw, top, bottom, bolster, dip = 0) {
  return mirrored([
    [0, top - dip],
    [hw - 0.13, top + 0.004 - dip * 0.5],
    [hw - 0.09, top + bolster * 0.6],
    [hw - 0.045, top + bolster],
    [hw - 0.01, top + bolster * 0.75],
    [hw, top - 0.02],
    [hw - 0.01, bottom + 0.02],
    [hw - 0.035, bottom],
    [0, bottom],
  ]);
}
// Backrest cross-section (lateral, forward depth): a recessed centre panel
// between forward-reaching bolsters, a gently rounded back.
function backrestProfile(hw, bolster, thickness, dip = 0) {
  return mirrored([
    [0, -dip],
    [hw - 0.13, 0.004 - dip * 0.5],
    [hw - 0.09, bolster * 0.55],
    [hw - 0.045, bolster],
    [hw - 0.01, bolster * 0.8],
    [hw, -0.022],
    [hw - 0.014, -thickness + 0.022],
    [hw - 0.045, -thickness],
    [0, -thickness - 0.008],
  ]);
}
// Rear bench cross-sections: two outer seats with shallow dishes and a
// raised centre, across the full width.
function benchCushionProfile(hw, top, bottom, dip = 0) {
  // Two sculpted outer places either side of a raised middle.
  return mirrored([
    [0, top + 0.02],
    [0.2, top + 0.014],
    [0.36, top - 0.012 - dip],
    [0.5, top + 0.03],
    [hw - 0.03, top + 0.036],
    [hw, top - 0.02],
    [hw - 0.02, bottom],
    [0, bottom],
  ]);
}
function benchBackProfile(hw, thickness, dip = 0) {
  return mirrored([
    [0, 0.04],
    [0.2, 0.03],
    [0.36, -0.012 - dip],
    [0.5, 0.05],
    [hw - 0.03, 0.056],
    [hw, -0.02],
    [hw - 0.02, -thickness],
    [0, -thickness - 0.006],
  ]);
}

// Seats, headrests and the rear bench in BMW Cognac leather (the centre
// panels a shade darker through the vertex colours).
const leather = () => cognacLeather('Merino leather', { vertexColors: true });

const Z = new THREE.Vector3(0, 0, 1),
  Y = new THREE.Vector3(0, 1, 0);
// Lofted along a reclined axis from `base` to `top` (backrests, headrests):
// returns the axis, its length and the forward direction across it.
function reclined(base, top) {
  const up = top.clone().sub(base),
    height = up.length();
  up.normalize();
  return { up, height, forward: new THREE.Vector3(up.y, -up.x, 0) };
}
// A rounded headrest pillow, `width` × `depth`, `tall` high above `base`.
function headrest(base, up, forward, width, depth, tall, material) {
  const w = width / 2,
    d = depth / 2;
  const rings = [0, 0.12, 0.35, 0.65, 0.88, 1].map((h) =>
    ring(
      [
        [-w, -d * 0.55],
        [-w * 0.93, d * 0.75],
        [0, d],
        [w * 0.93, d * 0.75],
        [w, -d * 0.55],
        [w * 0.78, -d * 1.1],
        [-w * 0.78, -d * 1.1],
      ],
      base.clone().addScaledVector(up, h * tall),
      Z,
      forward,
      0.72 + 0.28 * Math.sin(Math.PI * (0.12 + 0.76 * h))
    )
  );
  const mesh = new THREE.Mesh(loft(rings), material);
  mesh.name = 'Headrest';
  return mesh;
}

function buildSeat(centreZ, materials) {
  const seat = new THREE.Group();
  seat.name = centreZ < 0 ? 'Driver seat' : 'Passenger seat';
  const hw = 0.225;
  // Cushion on the cabin floor: sections from the backrest forward, the
  // nose rounded off.
  const cushionRings = [];
  const shift = interiorLayout.seatForward;
  const xs = [-0.47, -0.42, -0.34, -0.24, -0.15, -0.09, -0.06, -0.045].map((x) => x + shift);
  // Stitched pleats across the centre panel: a shallow crease at each, with
  // sections close either side to keep it narrow.
  const cushionPleats = [0.3, 0.45, 0.6].map((t) => xs[0] + t * (xs.at(-1) - xs[0]));
  const cushionXs = [...xs, ...cushionPleats.flatMap((x) => [x - 0.012, x, x + 0.012])].sort(
    (a, b) => a - b
  );
  cushionXs.forEach((x) => {
    const t = (x - xs[0]) / (xs.at(-1) - xs[0]),
      floor = cabinFloor(x);
    const bolster = 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.01;
    const scale = x === xs.at(-1) ? 0.82 : x === xs.at(-2) ? 0.95 : x === xs[0] ? 0.92 : 1;
    const dip = cushionPleats.includes(x) ? 0.005 : 0;
    cushionRings.push(
      ring(
        cushionProfile(hw, floor + 0.07 + 0.015 * t, floor - 0.02, bolster, dip),
        new THREE.Vector3(x, 0, centreZ),
        Z,
        Y,
        scale
      )
    );
  });
  const cushion = new THREE.Mesh(
    loft(
      cushionRings,
      panelShade(
        cushionRings,
        (a, b) => Math.abs(a) < hw - 0.13 && b > cabinFloor(-0.25 + shift) + 0.05
      )
    ),
    materials.leather
  );
  cushion.name = 'Seat cushion';
  // Backrest: sections up a reclined axis, the shoulders rounded off.
  const base = new THREE.Vector3(-0.44 + shift, cabinFloor(-0.44 + shift) + 0.055, centreZ),
    top = new THREE.Vector3(-0.53 + shift, 0.545, centreZ);
  const { up, height, forward } = reclined(base, top);
  const backRings = [];
  const baseUs = [0, 0.08, 0.25, 0.45, 0.65, 0.8, 0.9, 0.96, 1];
  const backPleats = [0.2, 0.32, 0.44, 0.56, 0.68];
  const us = [...baseUs, ...backPleats.flatMap((u) => [u - 0.025, u, u + 0.025])].sort(
    (a, b) => a - b
  );
  us.forEach((u) => {
    const width =
      hw + 0.012 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.035 * Math.max(0, u - 0.75) * 4;
    // Sport-seat side bolsters, deepest at the small of the back.
    const bolster = 0.1 * Math.sin(Math.PI * Math.min(1, 0.15 + u * 1.05)) + 0.01;
    const scale = u === 1 ? 0.8 : u === 0.96 ? 0.93 : 1;
    const dip = backPleats.includes(u) ? 0.006 : 0;
    backRings.push(
      ring(
        backrestProfile(width, bolster, 0.08 + 0.015 * (1 - u), dip),
        base.clone().addScaledVector(up, u * height),
        Z,
        forward,
        scale
      )
    );
  });
  const backrest = new THREE.Mesh(
    loft(
      backRings,
      panelShade(backRings, (a, b) => Math.abs(a) < hw - 0.13 && b > -0.01)
    ),
    materials.leather
  );
  backrest.name = 'Seat backrest';
  // Headrest on two posts, its top where the model's headrest top was.
  const headBase = base
    .clone()
    .addScaledVector(up, height + 0.02)
    .addScaledVector(forward, -0.015);
  const head = headrest(headBase, up, forward, 0.23, 0.085, 0.095, materials.leather);
  const postGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.035, 10);
  for (const dz of [-0.065, 0.065]) {
    const post = new THREE.Mesh(postGeometry, materials.chrome);
    post.position
      .copy(base.clone().addScaledVector(up, height + 0.008))
      .add(new THREE.Vector3(0, 0, dz));
    post.quaternion.setFromUnitVectors(Y, up);
    seat.add(post);
  }
  // Seams where the centre panels meet the bolsters.
  for (const side of [-1, 1]) {
    seat.add(seamAlong(cushionRings, side * (hw - 0.13), materials.seam));
    seat.add(seamAlong(backRings, side * (hw - 0.13), materials.seam));
  }
  seat.add(cushion, backrest, head);
  return seat;
}

// The rear bench: one cushion and backrest across the cabin with two outer
// seats, and three headrests, the middle one smaller.
function buildBench(materials) {
  const bench = new THREE.Group();
  bench.name = 'Rear bench';
  const hw = 0.6,
    count = 72;
  const xs = [-0.955, -0.97, -1.0, -1.06, -1.12, -1.17];
  const cushionRings = xs.map((x, i) => {
    const floor = cabinFloor(x);
    const scale = i === 0 ? 0.86 : i === 1 ? 0.96 : i === xs.length - 1 ? 0.95 : 1;
    return ring(
      benchCushionProfile(hw, floor + 0.07, floor - 0.02),
      new THREE.Vector3(x, 0, 0),
      Z,
      Y,
      scale,
      count
    );
  });
  const seatPanel = (a) => Math.abs(Math.abs(a) - 0.36) < 0.12;
  const cushion = new THREE.Mesh(
    loft(
      cushionRings,
      panelShade(cushionRings, (a, b) => seatPanel(a) && b > cabinFloor(-1.06) + 0.05)
    ),
    materials.leather
  );
  cushion.name = 'Bench cushion';
  const base = new THREE.Vector3(-1.13, cabinFloor(-1.13) + 0.05, 0),
    top = new THREE.Vector3(-1.255, 0.465, 0);
  const { up, height, forward } = reclined(base, top);
  // Stitched pleats across the outer places, as on the front seats.
  const pleats = [0.25, 0.42, 0.59];
  const us = [
    0,
    0.1,
    0.35,
    0.65,
    0.88,
    0.96,
    1,
    ...pleats.flatMap((u) => [u - 0.03, u, u + 0.03]),
  ].sort((a, b) => a - b);
  const backRings = us.map((u) =>
    ring(
      benchBackProfile(hw - 0.02 * u, 0.09, pleats.includes(u) ? 0.006 : 0),
      base.clone().addScaledVector(up, u * height),
      Z,
      forward,
      u === 1 ? 0.9 : u === 0.96 ? 0.97 : 1,
      count
    )
  );
  const backrest = new THREE.Mesh(
    loft(
      backRings,
      panelShade(backRings, (a, b) => seatPanel(a) && b > -0.005)
    ),
    materials.leather
  );
  backrest.name = 'Bench backrest';
  // Seams round the outer places' centre panels.
  for (const lateral of [-0.48, -0.24, 0.24, 0.48]) {
    bench.add(seamAlong(cushionRings, lateral, materials.seam));
    bench.add(seamAlong(backRings, lateral, materials.seam));
  }
  bench.add(cushion, backrest);
  for (const z of [-0.36, 0, 0.36]) {
    const headBase = base
      .clone()
      .addScaledVector(up, height + 0.012)
      .addScaledVector(forward, -0.02)
      .add(new THREE.Vector3(0, 0, z));
    bench.add(
      headrest(headBase, up, forward, z ? 0.21 : 0.16, 0.075, z ? 0.085 : 0.07, materials.leather)
    );
  }
  return bench;
}

// The BMW roundel and M badge, drawn once.
function badgeTexture(draw, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function roundel(ctx, w) {
  const r = w / 2;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(r, r, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#d9dde2';
  ctx.beginPath();
  ctx.arc(r, r, r * 0.66, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#1c69d4';
  for (const start of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.arc(r, r, r * 0.62, start - Math.PI / 2, start);
    ctx.fill();
  }
  ctx.strokeStyle = '#b8bcc2';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.97, 0, 2 * Math.PI);
  ctx.stroke();
}
function mBadge(ctx, w, h) {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, h);
  const stripes = ['#81c4ff', '#16588e', '#e7222e'];
  stripes.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    const x = w * (0.08 + i * 0.1);
    ctx.moveTo(x + w * 0.05, h * 0.2);
    ctx.lineTo(x + w * 0.12, h * 0.2);
    ctx.lineTo(x + w * 0.07, h * 0.8);
    ctx.lineTo(x, h * 0.8);
    ctx.fill();
  });
  ctx.fillStyle = '#e8eaed';
  ctx.font = `italic 900 ${h * 0.72}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('M', w * 0.42, h * 0.53);
}

// A flat part extruded from an outline, with rounded edges.
function plate(points, depth, bevel, material) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 12,
  });
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
function roundedOutline(w, h, r, top = w) {
  // A rounded trapezoid: `top` wide at the top, `w` at the bottom.
  const shape = new THREE.Shape();
  const t = top / 2,
    b = w / 2,
    hh = h / 2;
  shape.moveTo(-b + r, -hh);
  shape.lineTo(b - r, -hh);
  shape.quadraticCurveTo(b, -hh, b, -hh + r);
  shape.lineTo(t, hh - r);
  shape.quadraticCurveTo(t, hh, t - r, hh);
  shape.lineTo(-t + r, hh);
  shape.quadraticCurveTo(-t, hh, -t, hh - r);
  shape.lineTo(-b, -hh + r);
  shape.quadraticCurveTo(-b, -hh, -b + r, -hh);
  return shape.getPoints(8).map((p) => [p.x, p.y]);
}

function buildWheel(materials) {
  const { radius, grip } = interiorLayout.wheel;
  const wheel = new THREE.Group();
  wheel.name = 'M steering wheel';
  // Thick rim, oval in section like the M grip.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, grip, 22, 140),
    materials.wheelLeather
  );
  rim.scale.set(1, 1, 1.15);
  rim.name = 'Steering wheel rim';
  wheel.add(rim);
  // M tricolour stitching on the rim's inner edge beside the lower spoke.
  [0x6fb8e8, 0x2b3c8f, 0xe03a3e].forEach((color, i) => {
    const stitch = new THREE.Mesh(
      new THREE.TorusGeometry(radius - grip * 0.92, 0.0016, 6, 16, 0.045),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    stitch.rotation.z = -Math.PI / 2 + 0.11 + i * 0.05;
    stitch.position.z = 0.004;
    stitch.name = 'M stitching';
    wheel.add(stitch);
  });
  // Thumb rests at a quarter to three.
  for (const side of [-1, 1]) {
    const thumb = new THREE.Mesh(
      new THREE.SphereGeometry(grip * 1.25, 18, 12),
      materials.wheelLeather
    );
    const a = side > 0 ? 0.2 : Math.PI - 0.2;
    thumb.position.set(Math.cos(a) * (radius - 0.004), Math.sin(a) * (radius - 0.004), 0.004);
    thumb.scale.set(1, 2.2, 1);
    thumb.rotation.z = a;
    wheel.add(thumb);
  }
  // Airbag cover: a domed, rounded trapezoid, wider at the top, with the roundel.
  const hub = plate(roundedOutline(0.088, 0.096, 0.026, 0.124), 0.016, 0.014, materials.plastic);
  hub.position.set(0, 0.008, 0.012);
  hub.name = 'Airbag pad';
  wheel.add(hub);
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(0.0185, 40),
    new THREE.MeshStandardMaterial({
      map: badgeTexture(roundel, 128, 128),
      roughness: 0.35,
      metalness: 0.2,
    })
  );
  logo.position.set(0, 0.022, 0.0425);
  wheel.add(logo);
  // Side spokes: broad wedges from the hub to the rim, a little below the
  // centre, each with a gloss key panel, and a pearl-chrome strip along the
  // lower edge.
  for (const side of [-1, 1]) {
    const spoke = plate(
      [
        [0.05, 0.014],
        [0.1, 0.008],
        [radius - 0.008, -0.002],
        [radius - 0.008, -0.044],
        [0.1, -0.05],
        [0.046, -0.044],
      ].map(([x, y]) => [side * x, y]),
      0.012,
      0.007,
      materials.wheelLeather
    );
    spoke.position.z = 0.004;
    spoke.name = 'Steering wheel spoke';
    wheel.add(spoke);
    const panel = new THREE.Mesh(roundedBlock(0.064, 0.03, 0.006, 0.006), materials.buttons);
    panel.position.set(side * 0.098, -0.014, 0.025);
    panel.name = 'Wheel key panel';
    wheel.add(panel);
    for (const [dx, dy] of [
      [-0.016, 0.007],
      [0.016, 0.007],
      [-0.016, -0.007],
      [0.016, -0.007],
    ]) {
      const key = new THREE.Mesh(roundedBlock(0.024, 0.011, 0.004, 0.003), materials.plastic);
      key.position.set(side * 0.098 + dx, -0.014 + dy, 0.0285);
      key.name = 'Wheel key';
      wheel.add(key);
    }
    const trim = new THREE.Mesh(roundedBlock(0.12, 0.004, 0.005, 0.0015), materials.chrome);
    trim.position.set(side * 0.112, -0.049, 0.021);
    trim.rotation.z = side * 0.05;
    trim.name = 'Spoke chrome strip';
    wheel.add(trim);
    // Shift paddle behind the rim.
    const paddle = new THREE.Mesh(roundedBlock(0.05, 0.03, 0.004, 0.0015), materials.paddle);
    paddle.position.set(side * (radius - 0.03), 0.01, -0.03);
    wheel.add(paddle);
  }
  // M1 and M2 keys on the left spoke, below its panel.
  ['M1', 'M2'].forEach((label, i) => {
    const x = -0.088 + i * 0.022;
    const key = new THREE.Mesh(roundedBlock(0.018, 0.011, 0.004, 0.003), materials.plastic);
    key.position.set(x, -0.036, 0.024);
    key.name = `${label} key`;
    // Its legend, on a plane just in front (an extruded key's uvs are in
    // metres, not 0–1).
    const legend = new THREE.Mesh(
      new THREE.PlaneGeometry(0.014, 0.008),
      new THREE.MeshBasicMaterial({
        map: badgeTexture(
          (g, w, h) => {
            g.fillStyle = '#d9dde2';
            g.font = `700 ${Math.round(h * 0.7)}px Arial, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(label, w / 2, h / 2 + 1);
          },
          64,
          36
        ),
        transparent: true,
        color: 0x9a9ea4,
      })
    );
    legend.position.set(x, -0.036, 0.0265);
    wheel.add(key, legend);
  });
  // Split lower spoke: two bars with chrome edges and the M badge between.
  for (const side of [-1, 1]) {
    const bar = plate(
      [
        [side * 0.014, -0.042],
        [side * 0.034, -0.042],
        [side * 0.026, -radius + 0.006],
        [side * 0.01, -radius + 0.006],
      ],
      0.01,
      0.005,
      materials.wheelLeather
    );
    bar.position.z = 0.003;
    wheel.add(bar);
    const edge = new THREE.Mesh(roundedBlock(0.003, 0.11, 0.004, 0.001), materials.chrome);
    edge.position.set(side * 0.034, -0.1, 0.019);
    edge.rotation.z = side * -0.07;
    wheel.add(edge);
  }
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.03, 0.014),
    new THREE.MeshStandardMaterial({ map: badgeTexture(mBadge, 128, 60), roughness: 0.4 })
  );
  badge.position.set(0, -0.122, 0.017);
  wheel.add(badge);
  return wheel;
}

export function setupInterior(rig) {
  const body = rig.body;
  body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(body.matrixWorld).invert();
  // Hide the model's wheel (its own mesh) and cut its front seats out of the
  // shared interior mesh; nothing else of the interior changes.
  const oldWheel = body.getObjectByName('Object_25');
  if (oldWheel) oldWheel.visible = false;
  let removed = 0;
  const headliners = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  body.traverse((mesh) => {
    if (!mesh.isMesh || !['Object_53', 'Object_37'].includes(mesh.name) || !mesh.geometry.index)
      return;
    matrix.multiplyMatrices(toBody, mesh.matrixWorld);
    const position = mesh.geometry.attributes.position,
      index = mesh.geometry.index,
      kept = [],
      lining = [];
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      a.fromBufferAttribute(position, ids[0]).applyMatrix4(matrix);
      b.fromBufferAttribute(position, ids[1]).applyMatrix4(matrix);
      c.fromBufferAttribute(position, ids[2]).applyMatrix4(matrix);
      if (
        isOldSeatTriangle(a, b, c) ||
        isOldBenchTriangle(a, b, c, mesh.name) ||
        isOldDoorTriangle(a, b, c, mesh.name) ||
        isOldFootwellTriangle(a, b, c, mesh.name) ||
        isOldDashTriangle(a, b, c, mesh.name) ||
        isOldRearMirrorTriangle(a, b, c, mesh.name)
      )
        removed++;
      else if (isHeadlinerTriangle(a, b, c, mesh.name)) lining.push(...ids);
      else kept.push(...ids);
    }
    mesh.geometry.setIndex(kept);
    if (lining.length) headliners.push([mesh, lining]);
    mesh.castShadow = false;
    // Inside the cabin the sky and grass reflect only faintly.
    mesh.material.envMapIntensity = 0.35;
  });
  const materials = {
    leather: leather(),
    wheelLeather: new THREE.MeshPhysicalMaterial({
      name: 'Steering wheel leather',
      color: 0x1f1f22,
      roughness: 0.62,
      sheen: 0.4,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0x3c3c44),
      envMapIntensity: 0.3,
      // The rim's uvs run once round it (1.2 m) and round its grip (0.13 m).
      normalMap: leatherGrain(17, 2),
      normalScale: grainScale,
    }),
    plastic: new THREE.MeshStandardMaterial({
      name: 'Interior black',
      color: 0x101114,
      roughness: 0.45,
      envMapIntensity: 0.3,
    }),
    buttons: new THREE.MeshStandardMaterial({
      name: 'Wheel buttons',
      color: 0x1d1f23,
      roughness: 0.25,
    }),
    chrome: new THREE.MeshStandardMaterial({
      name: 'Pearl chrome',
      color: 0x9da1a6,
      metalness: 0.9,
      roughness: 0.3,
    }),
    // Tonal stitching, a little lighter than the leather.
    seam: new THREE.MeshStandardMaterial({
      name: 'Seat seam',
      color: 0x74503a,
      roughness: 0.7,
    }),
    paddle: new THREE.MeshStandardMaterial({
      name: 'Paddle',
      color: 0x3a3d42,
      metalness: 0.6,
      roughness: 0.4,
    }),
  };
  const interior = new THREE.Group();
  interior.name = 'Interior';
  // The headliner: the same triangles in their own mesh, in anthracite cloth.
  // Facing down, the lining gets none of the sun and only the scene's dark
  // ground light; in a car it is lit by light bounced off the seats, dash
  // and windows, which a faint glow of its own stands in for.
  const lining = new THREE.MeshStandardMaterial({
    name: 'Anthracite headliner',
    color: 0x3d3e43,
    map: fabricTexture(),
    roughness: 0.95,
    emissive: 0x2a2b30,
    emissiveMap: fabricTexture(),
    emissiveIntensity: 0.55,
  });
  lining.userData.bounce = 0.55;
  for (const [mesh, ids] of headliners) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes))
      geometry.setAttribute(name, attribute);
    geometry.setIndex(ids);
    // Soft creases: the pillars and lining read as one padded surface.
    geometry.setAttribute('normal', smoothNormals(geometry, 0.15));
    const headliner = new THREE.Mesh(geometry, lining);
    headliner.name = 'Headliner';
    mesh.add(headliner);
  }
  for (const z of interiorLayout.seatCentres) interior.add(buildSeat(z, materials));
  const doors = doorMaterials();
  interior.add(buildDoorCard(-1, doors), buildDoorCard(1, doors));
  // Footwells dropped below the seat floor, pedals and the centre console.
  interior.add(buildCabinFloor().group);
  // The dashboard, instrument hood and centre stack, rebuilt.
  interior.add(buildDashboard(), buildRoofFittings());
  interior.add(buildBench(materials));
  // Dark carpet over the model's floor sheet, whose light-grey texture shone
  // through the windows.
  const carpet = new THREE.BufferGeometry();
  const floorCorners = [
    [-0.975, -0.72],
    [footwell.rear, -0.72],
    [-0.975, 0.72],
    [footwell.rear, 0.72],
  ];
  carpet.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      floorCorners.flatMap(([x, z]) => [x, cabinFloor(x) + 0.004, z]),
      3
    )
  );
  carpet.setIndex([0, 2, 1, 1, 2, 3]);
  carpet.computeVertexNormals();
  const carpetMesh = new THREE.Mesh(
    carpet,
    new THREE.MeshStandardMaterial({ name: 'Carpet', color: 0x121316, roughness: 1 })
  );
  carpetMesh.name = 'Carpet';
  carpetMesh.receiveShadow = true;
  interior.add(carpetMesh);
  // The wheel in its own frame: z toward the driver, y up along the rim.
  const { centre, axis } = interiorLayout.wheel;
  const zAxis = new THREE.Vector3(...axis).normalize(),
    yAxis = new THREE.Vector3(0, 1, 0).addScaledVector(zAxis, -zAxis.y).normalize(),
    xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
  const mount = new THREE.Group();
  mount.name = 'Steering column';
  mount.position.set(...centre);
  mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  const wheel = buildWheel(materials);
  mount.add(wheel);
  // Column and its shroud, from the wheel into the dashboard.
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.034, 0.24, 16),
    materials.plastic
  );
  column.rotation.x = Math.PI / 2;
  column.position.z = -0.13;
  const shroud = new THREE.Mesh(roundedBlock(0.1, 0.075, 0.14, 0.025), materials.plastic);
  shroud.position.set(0, -0.012, -0.12);
  mount.add(column, shroud);
  interior.add(mount);
  // Inside the body, the cabin's parts would only shade each other: they
  // receive the body's shadow but cast none, which keeps them out of the
  // shadow map's draw calls.
  interior.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  body.add(interior);
  // The roof hides most of the sky from the cabin, but the scene's sky light
  // (hemisphere lights and the environment map) reaches every surface
  // alike, so flat tops inside glowed as if outdoors and gloss reflected
  // the open sky. An even ambient-occlusion map dims that indirect light on
  // the cabin's lit materials; direct sun through the glass is unchanged.
  const occlusion = new THREE.DataTexture(
    new Uint8Array([cabinOcclusion * 255, cabinOcclusion * 255, cabinOcclusion * 255, 255]),
    1,
    1
  );
  occlusion.needsUpdate = true;
  const occluded = new Map();
  const occlude = (mesh) => {
    mesh.material = [mesh.material].flat().map((m) => {
      if (!m.isMeshStandardMaterial || !mesh.geometry.attributes.uv) return m;
      if (!occluded.has(m)) {
        // The model's interior material is shared with outside parts.
        const own = m.clone();
        own.aoMap = occlusion;
        own.aoMapIntensity = 1;
        occluded.set(m, own);
      }
      return occluded.get(m);
    });
    if (mesh.material.length === 1) mesh.material = mesh.material[0];
  };
  interior.traverse((o) => o.isMesh && occlude(o));
  body.traverse((o) => {
    if (o.isMesh && ['Object_53', 'Object_37', 'Headliner'].includes(o.name)) occlude(o);
  });
  // The light cloth lining and pillars catch light bounced round the cabin:
  // half the occlusion, so they read dark grey rather than black.
  body.traverse((o) => {
    if (o.isMesh && o.name === 'Headliner') o.material.aoMapIntensity = 0.5;
  });
  // The body has no floor pan and a sun-facing panel casts no shadow, so
  // low sun slipping under the sills or round the arches crossed the cabin
  // and left through the roof, drawing bright streaks in the car's shadow.
  // The model's cabin shell and the lining (a few hundred triangles) close
  // it.
  body.traverse((o) => {
    if (o.isMesh && ['Object_53', 'Object_37', 'Headliner'].includes(o.name)) o.castShadow = true;
  });
  let bounced = null;
  return {
    interior,
    wheel,
    removed,
    // Other cabin parts built elsewhere (the dashboard's screen housing and
    // trim) take the same dimmed sky light.
    occlude(object) {
      object.traverse((o) => o.isMesh && occlude(o));
    },
    // Bounced daylight on the lining and visors fades with the daylight.
    setDaylight(level) {
      if (!bounced) {
        bounced = [];
        body.traverse((o) => {
          for (const m of [o.material].flat())
            if (m?.userData?.bounce !== undefined && !bounced.includes(m)) bounced.push(m);
        });
      }
      for (const m of bounced) m.emissiveIntensity = m.userData.bounce * level;
    },
    update(simulation) {
      wheel.rotation.z = (simulation?.steer ?? 0) * interiorLayout.wheel.ratio;
    },
  };
}
