import * as THREE from 'three';
import { buildDoorCard, doorMaterials, isOldDoorTriangle } from './door-trim.js';

// New front seats and M steering wheel. The downloaded model's front seats
// are a few dozen flat triangles and its wheel a coarse ring; both are
// replaced by smooth parts modelled after the F10 M5: sculpted sports seats
// with side bolsters and separate headrests in black Merino leather, and the
// three-spoke M leather wheel with thumb rests, a split lower spoke with the
// M badge, the BMW roundel, button panels and shift paddles. The wheel turns
// with the steering. Body space: x forward, y up, z to the right; the car is
// left-hand drive, so the driver sits at negative z.
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

// Smooth normals for an indexed mesh whose vertices are split at every
// face (the model's low-poly trim): faces meeting at a point share one
// normal there, oriented like the face, unless the faces fold back sharply
// (an edge kept crisp).
export function smoothNormals(geometry) {
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
        if (other.unit.dot(face.unit) > 0.5) sum.add(other.n);
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
    indices = [];
  rings.forEach((ring, r) =>
    ring.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      const v = shade ? shade(r, i) : 1;
      colours.push(v, v, v);
    })
  );
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
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      indices.push(...(flip ? [k, b, a] : [k, a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
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
function ring(points2d, origin, axisA, axisB, scale = 1, count = 40) {
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
function cushionProfile(hw, top, bottom, bolster) {
  return mirrored([
    [0, top],
    [hw - 0.13, top + 0.004],
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
function backrestProfile(hw, bolster, thickness) {
  return mirrored([
    [0, 0],
    [hw - 0.13, 0.004],
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
function benchCushionProfile(hw, top, bottom) {
  return mirrored([
    [0, top + 0.016],
    [0.2, top + 0.012],
    [0.36, top - 0.004],
    [0.5, top + 0.02],
    [hw - 0.03, top + 0.03],
    [hw, top - 0.02],
    [hw - 0.02, bottom],
    [0, bottom],
  ]);
}
function benchBackProfile(hw, thickness) {
  return mirrored([
    [0, 0.028],
    [0.2, 0.024],
    [0.36, 0],
    [0.5, 0.034],
    [hw - 0.03, 0.045],
    [hw, -0.02],
    [hw - 0.02, -thickness],
    [0, -thickness - 0.006],
  ]);
}

const leather = () =>
  new THREE.MeshPhysicalMaterial({
    name: 'Merino leather',
    vertexColors: true,
    color: 0x1f1f22,
    roughness: 0.58,
    sheen: 0.45,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0x4a4a52),
    envMapIntensity: 0.3,
  });

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
  xs.forEach((x, i) => {
    const t = (x - xs[0]) / (xs.at(-1) - xs[0]),
      floor = cabinFloor(x);
    const bolster = 0.055 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.01;
    const scale = i === xs.length - 1 ? 0.82 : i === xs.length - 2 ? 0.95 : i === 0 ? 0.92 : 1;
    cushionRings.push(
      ring(
        cushionProfile(hw, floor + 0.07 + 0.015 * t, floor - 0.02, bolster),
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
  const us = [0, 0.08, 0.25, 0.45, 0.65, 0.8, 0.9, 0.96, 1];
  us.forEach((u, i) => {
    const width =
      hw + 0.012 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.035 * Math.max(0, u - 0.75) * 4;
    const bolster = 0.08 * Math.sin(Math.PI * Math.min(1, 0.15 + u * 1.05)) + 0.01;
    const scale = i === us.length - 1 ? 0.8 : i === us.length - 2 ? 0.93 : 1;
    backRings.push(
      ring(
        backrestProfile(width, bolster, 0.08 + 0.015 * (1 - u)),
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
  const us = [0, 0.1, 0.35, 0.65, 0.88, 0.96, 1];
  const backRings = us.map((u, i) =>
    ring(
      benchBackProfile(hw - 0.02 * u, 0.09),
      base.clone().addScaledVector(up, u * height),
      Z,
      forward,
      i === us.length - 1 ? 0.9 : i === us.length - 2 ? 0.97 : 1,
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
  // Rim, slightly oval in section like a sports grip.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, grip, 20, 120),
    materials.wheelLeather
  );
  rim.scale.set(1, 1, 1.12);
  rim.name = 'Steering wheel rim';
  wheel.add(rim);
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
  // Hub with the airbag pad, a little toward the driver.
  const hub = plate(roundedOutline(0.12, 0.105, 0.03, 0.135), 0.02, 0.014, materials.plastic);
  hub.position.set(0, 0.0, 0.012);
  hub.name = 'Airbag pad';
  wheel.add(hub);
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(0.0195, 40),
    new THREE.MeshStandardMaterial({
      map: badgeTexture(roundel, 128, 128),
      roughness: 0.35,
      metalness: 0.2,
    })
  );
  logo.position.set(0, 0.012, 0.0465);
  wheel.add(logo);
  // Side spokes from the hub to the rim, with button panels.
  for (const side of [-1, 1]) {
    const spoke = plate(
      [
        [0.05, 0.002],
        [radius - 0.006, -0.008],
        [radius - 0.006, -0.042],
        [0.05, -0.052],
      ].map(([x, y]) => [side * x, y]),
      0.012,
      0.006,
      materials.plastic
    );
    spoke.position.z = 0.004;
    wheel.add(spoke);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.004), materials.chrome);
    trim.position.set(side * 0.118, -0.047, 0.024);
    trim.rotation.z = side * 0.06;
    wheel.add(trim);
    const buttons = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.03, 0.006), materials.buttons);
    buttons.position.set(side * 0.102, -0.022, 0.026);
    wheel.add(buttons);
    // Shift paddle behind the rim.
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.004), materials.paddle);
    paddle.position.set(side * (radius - 0.03), 0.01, -0.03);
    wheel.add(paddle);
  }
  // Split lower spoke with the M badge between its bars.
  for (const side of [-1, 1]) {
    const bar = plate(
      [
        [side * 0.012, -0.05],
        [side * 0.03, -0.05],
        [side * 0.024, -radius + 0.006],
        [side * 0.008, -radius + 0.006],
      ],
      0.01,
      0.005,
      materials.plastic
    );
    bar.position.z = 0.003;
    wheel.add(bar);
  }
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.034, 0.016),
    new THREE.MeshStandardMaterial({ map: badgeTexture(mBadge, 128, 60), roughness: 0.4 })
  );
  badge.position.set(0, -0.12, 0.016);
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
        isOldDoorTriangle(a, b, c, mesh.name)
      )
        removed++;
      else if (isHeadlinerTriangle(a, b, c, mesh.name)) lining.push(...ids);
      else kept.push(...ids);
    }
    mesh.geometry.setIndex(kept);
    if (lining.length) headliners.push([mesh, lining]);
    // Inside the cabin the sky and grass reflect only faintly.
    mesh.material.envMapIntensity = 0.35;
  });
  const materials = {
    leather: leather(),
    wheelLeather: new THREE.MeshPhysicalMaterial({
      name: 'Steering wheel leather',
      color: 0x151517,
      roughness: 0.62,
      sheen: 0.4,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0x3c3c44),
      envMapIntensity: 0.3,
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
  const lining = new THREE.MeshStandardMaterial({
    name: 'Anthracite headliner',
    color: 0x2a2b2f,
    roughness: 0.95,
  });
  for (const [mesh, ids] of headliners) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes))
      geometry.setAttribute(name, attribute);
    geometry.setIndex(ids);
    geometry.setAttribute('normal', smoothNormals(geometry));
    const headliner = new THREE.Mesh(geometry, lining);
    headliner.name = 'Headliner';
    mesh.add(headliner);
  }
  for (const z of interiorLayout.seatCentres) interior.add(buildSeat(z, materials));
  const doors = doorMaterials();
  interior.add(buildDoorCard(-1, doors), buildDoorCard(1, doors));
  interior.add(buildBench(materials));
  // Dark carpet over the model's floor sheet, whose light-grey texture shone
  // through the windows.
  const carpet = new THREE.BufferGeometry();
  const floorCorners = [
    [-0.975, -0.72],
    [0.58, -0.72],
    [-0.975, 0.72],
    [0.58, 0.72],
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
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.14), materials.plastic);
  shroud.position.set(0, -0.012, -0.12);
  mount.add(column, shroud);
  interior.add(mount);
  interior.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  body.add(interior);
  return {
    interior,
    wheel,
    removed,
    update(simulation) {
      wheel.rotation.z = (simulation?.steer ?? 0) * interiorLayout.wheel.ratio;
    },
  };
}
