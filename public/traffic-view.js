import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadCenterZ, roadCenterSlope, roadHeight } from './road-profile.js';
import { tunnelCover, bridgeShade, structureUniforms } from './road-structures.js';
import { OncomingTraffic, Traffic, rideOver, vehicleTypes } from './traffic.js';
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
const wheel = (r, w, x, z) => {
  const g = new THREE.CylinderGeometry(r, r, w, 16);
  g.rotateX(Math.PI / 2);
  g.translate(x, r, z);
  g.deleteAttribute('uv');
  return g;
};
const hub = (r, w, x, z, side) => {
  const g = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.02, 12);
  g.rotateX(Math.PI / 2);
  g.translate(x, r, z + side * (w / 2 + 0.005));
  g.deleteAttribute('uv');
  return g;
};
// A five-spoke alloy on a tyre's outer face: rim, spokes and centre cap in
// metal over a dark recess.
function alloy(parts, r, w, x, z, side) {
  const face = z + side * (w / 2 + 0.006);
  const recess = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.012, 16);
  recess.rotateX(Math.PI / 2);
  recess.translate(x, r, face - side * 0.004);
  recess.deleteAttribute('uv');
  parts.trim.push(recess);
  const rim = new THREE.TorusGeometry(r * 0.64, 0.022, 5, 20);
  rim.translate(x, r, face);
  rim.deleteAttribute('uv');
  parts.metal.push(rim);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(0.05, r * 0.6, 0.02);
    spoke.translate(0, r * 0.3, 0);
    spoke.rotateZ(a);
    spoke.translate(x, r, face + side * 0.004);
    spoke.deleteAttribute('uv');
    parts.metal.push(spoke);
  }
  const cap = new THREE.CylinderGeometry(r * 0.14, r * 0.14, 0.03, 10);
  cap.rotateX(Math.PI / 2);
  cap.translate(x, r, face + side * 0.008);
  cap.deleteAttribute('uv');
  parts.metal.push(cap);
}
// A dark wheel-arch lip over a wheel, on the body's side.
function arch(r, x, z) {
  const g = new THREE.TorusGeometry(r + 0.07, 0.045, 5, 18, Math.PI);
  g.scale(1, 1, 0.6);
  g.translate(x, r, z);
  g.deleteAttribute('uv');
  return g;
}

// A car: lower body, greenhouse, roof, bumpers, wheels and lamps.
function car({ length: L, width: W }, profile) {
  const { body, glass, roof, wheelbase, r, frontOverhang, lampY } = profile;
  const parts = {
    paint: [],
    glass: [],
    trim: [],
    metal: [],
    plate: [],
    tail: [],
    head: [],
    left: [],
    right: [],
  };
  const belt = body.points.reduce((m, p) => Math.max(m, p[1]), 0);
  const top = roof.points.reduce((m, p) => Math.max(m, p[1]), 0);
  // The body rounded at its shoulders, the greenhouse and roof leaning in.
  parts.paint.push(taper(extruded(body.points, body.radii, W, 0.1), belt - 0.35, belt, 0.95));
  parts.glass.push(
    taper(extruded(glass.points, glass.radii, W * 0.9, 0.05), belt - 0.05, top, 0.78)
  );
  parts.paint.push(taper(extruded(roof.points, roof.radii, W * 0.74, 0.05), belt, top, 0.92));
  // Pillars between the side windows (the B-pillar, and on a saloon the
  // C-pillar's root), leaning in with the glass.
  const [rearSill, screenBase, screenTop, rearTop] = glass.points;
  const pillar = (x, width) => {
    for (const side of [-1, 1]) {
      const g = box(width, top - belt + 0.05, 0.02, x, (belt + top) / 2, side * (W * 0.45 + 0.012));
      parts.paint.push(taper(g, belt - 0.05, top, 0.78));
    }
  };
  pillar((screenTop[0] + rearTop[0]) / 2 + 0.05, 0.1);
  // Door seams and the sill below them.
  const doorFront = screenBase[0] - 0.05,
    doorRear = rearSill[0] + 0.25;
  const seams = [doorFront, (screenTop[0] + rearTop[0]) / 2 + 0.05, doorRear];
  for (const side of [-1, 1]) {
    for (const x of seams)
      parts.trim.push(
        box(0.012, belt - 0.55, 0.006, x, 0.3 + (belt - 0.55) / 2 + 0.12, side * (W / 2 + 0.004))
      );
    parts.trim.push(
      box(
        doorFront - doorRear + 0.2,
        0.08,
        0.02,
        (doorFront + doorRear) / 2,
        0.34,
        side * (W / 2 - 0.005)
      )
    );
    // Door mirrors at the windscreen's foot.
    parts.paint.push(
      box(0.1, 0.09, 0.17, screenBase[0] - 0.18, belt + 0.09, side * (W / 2 + 0.06))
    );
    parts.trim.push(
      box(0.06, 0.03, 0.08, screenBase[0] - 0.16, belt + 0.03, side * (W / 2 - 0.01))
    );
  }
  // Grille between the headlamps; tail lamps wrap round the rear corners.
  parts.trim.push(box(0.04, 0.14, W * 0.42, L / 2 + 0.03, lampY.head - 0.04, 0));
  for (const side of [-1, 1])
    parts.tail.push(box(0.26, 0.13, 0.03, -L / 2 + 0.13, lampY.tail, side * (W / 2 + 0.004)));
  if (profile.rails)
    for (const side of [-1, 1])
      parts.trim.push(
        // (Within the roof, short of each end.)
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
  parts.plate.push(plateAt(-L / 2 - 0.035, lampY.tail - 0.33, -1));
  parts.plate.push(plateAt(L / 2 + 0.035, 0.46, 1));
  // Bumpers' dark lower edges.
  parts.trim.push(box(0.12, 0.16, W * 0.92, L / 2 - 0.05, 0.36, 0));
  parts.trim.push(box(0.12, 0.16, W * 0.92, -L / 2 + 0.05, 0.38, 0));
  const front = L / 2 - frontOverhang,
    rear = front - wheelbase;
  for (const x of [front, rear])
    for (const side of [-1, 1]) {
      parts.trim.push(wheel(r, 0.22, x, side * (W / 2 - 0.14)));
      alloy(parts, r, 0.22, x, side * (W / 2 - 0.14), side);
      parts.trim.push(arch(r, x, side * (W / 2 - 0.01)));
    }
  for (const side of [-1, 1]) {
    parts.tail.push(box(0.06, 0.14, 0.42, -L / 2 - 0.01, lampY.tail, side * (W / 2 - 0.28)));
    parts.head.push(box(0.05, 0.1, 0.32, L / 2 + 0.01, lampY.head, side * (W / 2 - 0.25)));
    const lamps = side < 0 ? parts.left : parts.right;
    lamps.push(box(0.05, 0.07, 0.08, -L / 2 - 0.012, lampY.tail, side * (W / 2 - 0.05)));
    lamps.push(box(0.05, 0.06, 0.08, L / 2 + 0.012, lampY.head, side * (W / 2 - 0.05)));
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
        [-2.3, 0.38],
        [2.28, 0.38],
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
function van({ length: L, width: W }) {
  const parts = {
    paint: [],
    glass: [],
    trim: [],
    metal: [],
    plate: [],
    tail: [],
    head: [],
    left: [],
    right: [],
  };
  parts.paint.push(
    extruded(
      [
        [-2.95, 0.35],
        [2.88, 0.35],
        [2.96, 0.7],
        [2.78, 1.05],
        [2.22, 1.25],
        [1.62, 2.32],
        [-2.9, 2.42],
        [-2.97, 0.7],
      ],
      [0.08, 0.08, 0.15, 0.3, 0.2, 0.3, 0.12, 0.08],
      W,
      0.07
    )
  );
  // Windscreen and the cab's side windows.
  parts.glass.push(
    extruded(
      [
        [0.95, 1.32],
        [2.2, 1.3],
        [1.7, 2.06],
        [0.95, 2.08],
      ],
      [0.02, 0.05, 0.08, 0.02],
      W + 0.02,
      0.02
    )
  );
  parts.trim.push(box(0.14, 0.2, W * 0.95, L / 2 - 0.02, 0.42, 0));
  parts.trim.push(box(0.14, 0.2, W * 0.95, -L / 2 + 0.03, 0.42, 0));
  parts.plate.push(plateAt(-L / 2 - 0.05, 0.62, -1));
  parts.plate.push(plateAt(L / 2 + 0.03, 0.55, 1));
  // The rear doors' seam.
  parts.trim.push(box(0.02, 1.7, 0.03, -L / 2 - 0.03, 1.45, 0));
  for (const x of [1.95, -1.72])
    for (const side of [-1, 1]) {
      parts.trim.push(wheel(0.34, 0.24, x, side * (W / 2 - 0.16)));
      parts.metal.push(hub(0.34, 0.24, x, side * (W / 2 - 0.16), side));
    }
  for (const side of [-1, 1]) {
    parts.tail.push(box(0.05, 0.36, 0.14, -L / 2 - 0.01, 1.05, side * (W / 2 - 0.1)));
    parts.head.push(box(0.05, 0.12, 0.34, L / 2 - 0.05, 0.82, side * (W / 2 - 0.28)));
    const lamps = side < 0 ? parts.left : parts.right;
    lamps.push(box(0.05, 0.1, 0.14, -L / 2 - 0.012, 0.8, side * (W / 2 - 0.1)));
    lamps.push(box(0.05, 0.07, 0.1, L / 2 - 0.04, 0.82, side * (W / 2 - 0.06)));
  }
  return parts;
}
// A tractor unit and a box trailer, 16.5 m in all.
function lorry({ length: L, width: W }) {
  const parts = {
    paint: [],
    trailer: [],
    glass: [],
    trim: [],
    metal: [],
    plate: [],
    tail: [],
    head: [],
    left: [],
    right: [],
  };
  const front = L / 2;
  parts.paint.push(
    extruded(
      [
        [front - 2.35, 0.95],
        [front - 0.02, 0.95],
        [front + 0.03, 1.5],
        [front - 0.05, 3.55],
        [front - 0.35, 3.86],
        [front - 2.35, 3.86],
      ],
      [0.05, 0.08, 0.12, 0.3, 0.2, 0.05],
      W,
      0.08
    )
  );
  parts.glass.push(box(0.06, 1.0, W - 0.3, front - 0.03, 2.62, 0));
  parts.glass.push(box(0.7, 0.85, W + 0.02, front - 0.75, 2.6, 0));
  parts.trailer.push(box(13.6, 2.75, W, front - 2.55 - 6.8, 1.25 + 2.75 / 2, 0));
  // Chassis, bumper, the gap under the trailer and its underrun bar.
  parts.trim.push(box(L - 0.4, 0.35, 0.9, 0, 0.95, 0));
  parts.trim.push(box(0.22, 0.45, W - 0.1, front - 0.05, 0.75, 0));
  parts.trim.push(box(0.12, 0.18, W - 0.3, -L / 2 + 0.25, 0.55, 0));
  parts.trim.push(box(2.6, 0.25, W - 0.4, front - 3.6, 1.12, 0));
  // The trailer's rear doors (hinges, locking bars and the seam), its plate
  // and mud flaps.
  const back = front - 2.55 - 13.6;
  for (const dz of [-0.55, 0.55, -1.18, 1.18])
    parts.trim.push(box(0.05, 2.55, 0.05, back - 0.03, 2.62, dz));
  parts.trim.push(box(0.03, 2.7, 0.025, back - 0.015, 2.62, 0));
  parts.plate.push(plateAt(-L / 2 + 0.2, 0.42, -1));
  parts.plate.push(plateAt(front + 0.14, 0.62, 1));
  for (const side of [-1, 1])
    parts.trim.push(box(0.03, 0.55, 0.55, -L / 2 + 0.15, 0.62, side * (W / 2 - 0.35)));
  const r = 0.52;
  for (const [x, w] of [
    [front - 1.15, 0.34],
    [front - 4.9, 0.6],
    [-L / 2 + 3.3, 0.6],
    [-L / 2 + 2.0, 0.6],
    [-L / 2 + 0.7, 0.6],
  ])
    for (const side of [-1, 1]) {
      parts.trim.push(wheel(r, w, x, side * (W / 2 - w / 2 - 0.02)));
      parts.metal.push(hub(r, w, x, side * (W / 2 - w / 2 - 0.02), side));
    }
  for (const side of [-1, 1]) {
    parts.tail.push(box(0.05, 0.14, 0.42, -L / 2 + 0.22, 0.68, side * (W / 2 - 0.35)));
    parts.head.push(box(0.05, 0.16, 0.36, front + 0.02, 1.08, side * (W / 2 - 0.3)));
    const lamps = side < 0 ? parts.left : parts.right;
    lamps.push(box(0.05, 0.12, 0.12, -L / 2 + 0.22, 0.68, side * (W / 2 - 0.08)));
    lamps.push(box(0.05, 0.1, 0.14, front + 0.02, 1.08, side * (W / 2 - 0.06)));
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
    paint: new THREE.MeshStandardMaterial({
      name: 'Traffic paint',
      metalness: 0.45,
      roughness: 0.32,
    }),
    trailer: new THREE.MeshStandardMaterial({
      name: 'Trailer sides',
      metalness: 0.1,
      roughness: 0.6,
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
  const builders = {
    hatch: (spec) => car(spec, profiles.hatch),
    sedan: (spec) => car(spec, profiles.sedan),
    suv: (spec) => car(spec, profiles.suv),
    van,
    lorry,
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
        const pieces = list.map((g) => (g.index ? g.toNonIndexed() : g));
        const geometry = mergeGeometries(pieces, false);
        for (const g of pieces) g.dispose();
        for (const g of list) g.dispose();
        const lamp = ['tail', 'head', 'left', 'right'].includes(kind);
        const material = lamp ? materials.lamp : materials[kind];
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
  // Ahead: brightest a few metres in front, spreading and fading out (the
  // texture's left edge at the bumper).
  const headPool = lampPool(
    'Traffic headlamp light',
    new THREE.Color(1, 0.93, 0.8),
    0.55,
    (g, w, h) => {
      const image = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const along = x / w,
            across = (y / h - 0.5) * 2;
          const spread = 0.35 + 0.65 * along;
          const a =
            Math.exp(-(((along - 0.3) / 0.32) ** 2)) *
            Math.exp(-((across / spread) ** 2) * 2.2) *
            Math.min(1, along * 12) *
            Math.min(1, (1 - along) * 4);
          const i = (y * w + x) * 4;
          image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
          image.data[i + 3] = Math.round(255 * a);
        }
      g.putImageData(image, 0, 0);
    }
  );
  const tailPool = lampPool(
    'Traffic tail-lamp light',
    new THREE.Color(1, 0.06, 0.03),
    0.4,
    (g, w, h) => {
      const glow = g.createRadialGradient(0, h / 2, 2, 0, h / 2, w);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);
    }
  );
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
        pools = 0;
      opposite?.update(dt, x);
      for (const v of opposite ? [...traffic.vehicles, ...opposite.vehicles] : traffic.vehicles) {
        const index = counts[v.type]++;
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
          poolSize.set(-3.2, 1, v.width + 1.2);
          matrix.compose(poolAt, flatTurn, poolSize);
          tailPool.setMatrixAt(pools, matrix);
          pools++;
        }
      }
      for (const [type, list] of Object.entries(meshes))
        for (const { mesh, flat } of list) {
          if (flat) {
            flat.count = showShadows ? counts[type] : 0;
            flat.instanceMatrix.needsUpdate = true;
          }
          mesh.count = counts[type];
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      shadow.count = shadows;
      shadow.instanceMatrix.needsUpdate = true;
      headPool.count = tailPool.count = pools;
      headPool.instanceMatrix.needsUpdate = tailPool.instanceMatrix.needsUpdate = true;
    },
  };
}
