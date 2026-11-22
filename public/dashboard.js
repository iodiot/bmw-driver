import * as THREE from 'three';
import { grainScale, leatherGrain, roundedBlock } from './door-trim.js';

// The dashboard, rebuilt after the F10's. The model's own dash is a few
// dozen flat triangles; it is cut away and replaced by:
// - a leather-topped dash in one smooth section from door to door, its face
//   sloping down to the knee panel and the glovebox, recessed behind the
//   instruments;
// - the instrument hood, a brow over the dials with cheeks down their sides;
// - a recess under the dash top's brow for the iDrive screen, set in flush;
// - the centre stack below it, turned a little toward the driver: two vents
//   with the hazard switch between, the radio with its CD slot, favourite
//   keys and volume knob, the climate panel with two temperature knobs, its
//   display and a key row, in a gloss-black frame running down into the
//   console;
// - side vents at both ends, the light switch left of the wheel, and the
//   glovebox's shut lines and handle.
// Body space: x forward, y up, z to the right (driver at -z). Heights fit
// the model's low cabin rather than factory dimensions.
export const dashLayout = Object.freeze({
  // Across the cabin, door to door.
  halfWidth: 0.71,
  // Where the instruments sit (their face's z range) and the stack.
  cluster: Object.freeze({ from: -0.615, to: -0.195 }),
  // The iDrive screen set into the dash face under the dash top's brow, its
  // top below the dash's top line, as on the F10 (body space: its top and
  // bottom edges' x, y, its centre z and size).
  screen: Object.freeze({
    top: Object.freeze([0.646, 0.398]),
    bottom: Object.freeze([0.627, 0.326]),
    z: 0.0125,
    width: 0.27,
    // The recess in the dash it sits in, across z.
    from: -0.16,
    to: 0.185,
  }),
  // The centre stack below the screen, down into the console.
  stack: Object.freeze({
    bottom: Object.freeze([0.556, 0.15, 0.0125]),
    top: Object.freeze([0.598, 0.318]),
    width: 0.27,
    // Turned toward the driver (radians about the vertical).
    toward: -0.1,
  }),
});

// The model's dashboard triangles: everything of its interior mesh between
// the front seats' knees and the windscreen, below the windscreen's base.
export function isOldDashTriangle(a, b, c, meshName) {
  if (meshName !== 'Object_53') return false;
  const x = (a.x + b.x + c.x) / 3,
    y = (a.y + b.y + c.y) / 3,
    z = Math.abs((a.z + b.z + c.z) / 3);
  // Short of the sides: the model's corner pieces by the pillars and doors
  // stay, or the road showed through between the dash's ends and the doors.
  return x > 0.5 && x < 1.02 && y > 0.08 && y < 0.43 && z < 0.66;
}

// Dash cross-sections (x, y): the general one, and a deeper one behind the
// instruments so the cluster sits in a recess under its hood.
const dashProfile = [
  [0.975, 0.392],
  [0.86, 0.41],
  [0.74, 0.418],
  [0.665, 0.414],
  [0.632, 0.396],
  [0.612, 0.356],
  [0.597, 0.3],
  [0.588, 0.24],
  [0.585, 0.17],
  [0.592, 0.125],
  [0.64, 0.105],
  [0.8, 0.11],
  [0.97, 0.2],
];
const recessProfile = [
  [0.975, 0.392],
  [0.86, 0.41],
  [0.76, 0.418],
  [0.715, 0.41],
  [0.698, 0.385],
  [0.685, 0.33],
  [0.672, 0.272],
  [0.62, 0.25],
  [0.586, 0.2],
  [0.592, 0.125],
  [0.64, 0.105],
  [0.8, 0.11],
  [0.97, 0.2],
];

// Behind the iDrive screen: the dash top runs on to a brow over a recess,
// whose back wall holds the screen and whose floor meets the stack.
const screenProfile = [
  [0.975, 0.392],
  [0.86, 0.41],
  [0.72, 0.42],
  [0.642, 0.419],
  [0.624, 0.408],
  [0.652, 0.398],
  [0.662, 0.335],
  [0.6, 0.318],
  [0.585, 0.17],
  [0.592, 0.125],
  [0.64, 0.105],
  [0.8, 0.11],
  [0.97, 0.2],
];

// A smooth closed section through 2D points, sampled evenly.
function section(points, z, count = 48) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y]) => new THREE.Vector3(x, y, z)),
    true,
    'centripetal'
  );
  return curve.getSpacedPoints(count).slice(0, count);
}
// Lofts sections (equal point counts) into a closed solid, ends capped.
function loftSections(rings) {
  const n = rings[0].length,
    positions = [],
    indices = [];
  rings.forEach((r) => r.forEach((p) => positions.push(p.x, p.y, p.z)));
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n),
        c = a + n,
        d = b + n;
      indices.push(a, b, c, b, d, c);
    }
  for (const [r, flip] of [
    [0, true],
    [rings.length - 1, false],
  ]) {
    const centre = rings[r].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n);
    const k = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      indices.push(...(flip ? [k, b, a] : [k, a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Planar uvs (z across, y up) for the occlusion map.
  const uv = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i + 2], positions[i + 1]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The section at z: recessed behind the instruments, blending at their ends.
function dashSection(z) {
  const { from, to } = dashLayout.cluster;
  const recess = smooth(from - 0.04, from + 0.02, z) * (1 - smooth(to - 0.02, to + 0.04, z));
  const { from: sFrom, to: sTo } = dashLayout.screen;
  const screen = smooth(sFrom - 0.04, sFrom, z) * (1 - smooth(sTo, sTo + 0.04, z));
  const points = dashProfile.map(([x, y], i) => [
    x + (recessProfile[i][0] - x) * recess + (screenProfile[i][0] - x) * screen,
    y + (recessProfile[i][1] - y) * recess + (screenProfile[i][1] - y) * screen,
  ]);
  // The dash top's front edge stays inside the windscreen, which sweeps back
  // toward the pillars: otherwise its corners showed through the glass.
  const base = windscreenBase(z);
  points[0][0] = Math.min(points[0][0], base - 0.1);
  points[1][0] = Math.min(points[1][0], base - 0.135);
  return points;
}

// The windscreen's lower edge (x, about 0.35 m up) across the car, measured
// on the model.
const windscreenEdge = [
  [0, 1.089],
  [0.2, 1.076],
  [0.4, 1.052],
  [0.6, 1.019],
  [0.7, 0.982],
  [0.75, 0.96],
];
export function windscreenBase(z) {
  const a = Math.min(Math.abs(z), 0.75);
  for (let i = 1; i < windscreenEdge.length; i++) {
    const [z0, x0] = windscreenEdge[i - 1],
      [z1, x1] = windscreenEdge[i];
    if (a <= z1) return x0 + ((x1 - x0) * (a - z0)) / (z1 - z0);
  }
  return windscreenEdge.at(-1)[1];
}

function labelTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function dashboardMaterials() {
  const inside = { envMapIntensity: 0.25 };
  return {
    leather: new THREE.MeshPhysicalMaterial({
      name: 'Dash leather',
      side: THREE.DoubleSide,
      color: 0x1c1d21,
      roughness: 0.72,
      sheen: 0.3,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0x3c3d44),
      ...inside,
      normalMap: leatherGrain(),
      normalScale: grainScale,
    }),
    plastic: new THREE.MeshStandardMaterial({
      name: 'Dash plastic',
      color: 0x101114,
      roughness: 0.68,
      ...inside,
    }),
    gloss: new THREE.MeshStandardMaterial({
      name: 'Stack black',
      color: 0x0a0b0d,
      roughness: 0.4,
      ...inside,
    }),
    recess: new THREE.MeshStandardMaterial({ name: 'Vent', color: 0x040405, roughness: 0.9 }),
    slat: new THREE.MeshStandardMaterial({
      name: 'Vent slat',
      color: 0x1d1f23,
      roughness: 0.5,
      ...inside,
    }),
    key: new THREE.MeshStandardMaterial({
      name: 'Stack key',
      color: 0x202226,
      roughness: 0.45,
      ...inside,
    }),
    chrome: new THREE.MeshStandardMaterial({
      name: 'Stack chrome',
      color: 0xb7bbc0,
      metalness: 1,
      roughness: 0.25,
      envMapIntensity: 0.5,
    }),
    seam: new THREE.MeshBasicMaterial({ name: 'Shut line', color: 0x030304 }),
  };
}

// A rectangular ring (chrome surround), w × h outside, t wide, d deep.
function frame(w, h, t, d, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w / 2 + t, -h / 2 + t);
  hole.lineTo(-w / 2 + t, h / 2 - t);
  hole.lineTo(w / 2 - t, h / 2 - t);
  hole.lineTo(w / 2 - t, -h / 2 + t);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geometry.translate(0, 0, -d / 2);
  return new THREE.Mesh(geometry, material);
}
// An air vent facing +z: dark recess, chrome surround, slats (horizontal or
// vertical) and the little chrome tab that aims them.
function vent(w, h, materials, { vertical = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Air vent';
  const recess = new THREE.Mesh(roundedBlock(w, h, 0.012, 0.003), materials.recess);
  recess.position.z = -0.004;
  const surround = frame(w + 0.004, h + 0.004, 0.0028, 0.004, materials.chrome);
  surround.position.z = 0.002;
  group.add(recess, surround);
  const count = vertical ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const f = (i + 1) / (count + 1) - 0.5;
    const slat = new THREE.Mesh(
      vertical
        ? new THREE.BoxGeometry(0.0025, h - 0.006, 0.008)
        : new THREE.BoxGeometry(w - 0.006, 0.0025, 0.008),
      materials.slat
    );
    if (vertical) slat.position.x = f * w;
    else slat.position.y = f * h;
    group.add(slat);
  }
  const tab = new THREE.Mesh(roundedBlock(0.008, 0.005, 0.006, 0.002), materials.chrome);
  tab.position.z = 0.004;
  group.add(tab);
  return group;
}
// A knob facing +z: a black cap in a chrome ring.
function knob(radius, materials) {
  const group = new THREE.Group();
  group.name = 'Knob';
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.04, 0.014, 28),
    materials.gloss
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.007;
  const ringMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.005, 28, 1, true),
    materials.chrome
  );
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.z = 0.004;
  group.add(cap, ringMesh);
  return group;
}
const at = (mesh, x, y, z, name) => {
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  return mesh;
};

// The centre stack, built in its own frame: x across (to the right), y up
// along the sloping face from its bottom, z out toward the cabin.
export function buildCentreStack(materials) {
  const { bottom, top, width, toward } = dashLayout.stack;
  const base = new THREE.Vector3(...bottom),
    face = new THREE.Vector3(top[0] - bottom[0], top[1] - bottom[1], 0);
  const height = face.length();
  const up = face.normalize(),
    right = new THREE.Vector3(0, 0, 1),
    out = new THREE.Vector3().crossVectors(right, up);
  const stack = new THREE.Group();
  stack.name = 'Centre stack';
  stack.position.copy(base);
  stack.quaternion
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), toward)
    .multiply(
      new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, out))
    );
  // Gloss-black frame with chrome edges.
  stack.add(
    at(
      new THREE.Mesh(roundedBlock(width + 0.01, height + 0.006, 0.03, 0.008), materials.gloss),
      0,
      height / 2,
      -0.014,
      'Stack frame'
    )
  );
  for (const side of [-1, 1])
    stack.add(
      at(
        new THREE.Mesh(roundedBlock(0.004, height - 0.01, 0.006, 0.0015), materials.chrome),
        side * (width / 2 + 0.002),
        height / 2,
        0.002,
        'Stack chrome edge'
      )
    );
  // Vents and the hazard switch.
  const ventY = height - 0.022;
  for (const side of [-1, 1])
    stack.add(at(vent(0.118, 0.038, materials), side * 0.072, ventY, 0.004));
  const hazard = at(
    new THREE.Mesh(roundedBlock(0.017, 0.017, 0.008, 0.003), materials.key),
    0,
    ventY,
    0.004,
    'Hazard switch'
  );
  const triangle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.012, 0.012),
    new THREE.MeshBasicMaterial({
      map: labelTexture(64, 64, (g, w, h) => {
        g.strokeStyle = '#e0402f';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(w / 2, h * 0.16);
        g.lineTo(w * 0.86, h * 0.8);
        g.lineTo(w * 0.14, h * 0.8);
        g.closePath();
        g.stroke();
      }),
      transparent: true,
    })
  );
  triangle.position.set(0, ventY, 0.0085);
  stack.add(hazard, triangle);
  // Radio: gloss panel under a chrome strip, CD slot, volume knob and the
  // eight favourite keys.
  const radioY = height - 0.066;
  stack.add(
    at(
      new THREE.Mesh(roundedBlock(0.272, 0.042, 0.01, 0.004), materials.gloss),
      0,
      radioY,
      0.003,
      'Radio'
    ),
    at(
      new THREE.Mesh(roundedBlock(0.272, 0.003, 0.005, 0.001), materials.chrome),
      0,
      radioY + 0.023,
      0.005,
      'Radio chrome strip'
    ),
    at(
      new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.0022, 0.004), materials.recess),
      0.02,
      radioY + 0.01,
      0.0085,
      'CD slot'
    ),
    at(knob(0.0085, materials), -0.112, radioY + 0.002, 0.006, 'Volume knob')
  );
  for (let i = 0; i < 8; i++)
    stack.add(
      at(
        new THREE.Mesh(roundedBlock(0.0165, 0.0085, 0.005, 0.002), materials.key),
        -0.07 + i * 0.024,
        radioY - 0.011,
        0.0085,
        'Favourite key'
      )
    );
  // Climate panel: temperature knobs at the ends, a display strip and a key
  // row between them.
  const climateY = height - 0.121;
  stack.add(
    at(
      new THREE.Mesh(roundedBlock(0.272, 0.072, 0.01, 0.005), materials.plastic),
      0,
      climateY,
      0.003,
      'Climate panel'
    ),
    at(frame(0.274, 0.074, 0.002, 0.004, materials.chrome), 0, climateY, 0.006, 'Climate surround')
  );
  for (const side of [-1, 1])
    stack.add(
      at(knob(0.0145, materials), side * 0.102, climateY + 0.006, 0.006, 'Temperature knob')
    );
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.096, 0.024),
    new THREE.MeshBasicMaterial({
      name: 'Climate display',
      map: labelTexture(384, 96, (g, w, h) => {
        g.fillStyle = '#06080b';
        g.fillRect(0, 0, w, h);
        g.font = '600 38px "Helvetica Neue", Arial, sans-serif';
        g.textBaseline = 'middle';
        g.fillStyle = '#ff9a3c';
        g.textAlign = 'left';
        g.fillText('21.5', 18, h / 2);
        g.textAlign = 'right';
        g.fillText('21.0', w - 18, h / 2);
        g.font = '600 24px "Helvetica Neue", Arial, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = '#c7cbd0';
        g.fillText('AUTO', w / 2, h / 2);
      }),
    })
  );
  display.position.set(0, climateY + 0.014, 0.0085);
  display.name = 'Climate display';
  stack.add(display);
  for (let i = 0; i < 6; i++)
    stack.add(
      at(
        new THREE.Mesh(roundedBlock(0.0145, 0.0095, 0.005, 0.002), materials.key),
        -0.0475 + i * 0.019,
        climateY - 0.017,
        0.0085,
        'Climate key'
      )
    );
  return stack;
}

export function buildDashboard(materials = dashboardMaterials()) {
  const group = new THREE.Group();
  group.name = 'Dashboard';
  const { halfWidth, cluster } = dashLayout;
  // The dash in one piece: sections across the cabin, denser at the
  // instrument recess's ends.
  const zs = [];
  for (let z = -halfWidth; z <= halfWidth + 1e-6; z += 0.05) zs.push(z);
  zs.push(
    cluster.from - 0.03,
    cluster.from,
    cluster.from + 0.02,
    cluster.to - 0.02,
    cluster.to,
    cluster.to + 0.03
  );
  zs.sort((a, b) => a - b);
  const dash = new THREE.Mesh(
    loftSections(zs.map((z) => section(dashSection(z), z))),
    materials.leather
  );
  dash.name = 'Dash';
  group.add(dash);
  // Instrument hood: a brow over the dials, from the dash top out over them.
  const hoodProfile = [
    [0.735, 0.418],
    [0.66, 0.446],
    [0.588, 0.44],
    [0.566, 0.426],
    [0.584, 0.43],
    [0.66, 0.434],
    [0.73, 0.414],
  ];
  const hoodZs = [];
  for (let i = 0; i <= 10; i++)
    hoodZs.push(cluster.from - 0.012 + ((cluster.to - cluster.from + 0.024) * i) / 10);
  const hood = new THREE.Mesh(
    loftSections(
      hoodZs.map((z, i) => {
        // Rounded ends.
        const t = Math.sin((Math.PI * i) / 10);
        return section(
          hoodProfile.map(([x, y]) => [x, 0.414 + (y - 0.414) * (0.55 + 0.45 * Math.sqrt(t))]),
          z
        );
      })
    ),
    materials.leather
  );
  hood.name = 'Instrument hood';
  group.add(hood);
  // Its cheeks down the sides of the dials.
  for (const z of [cluster.from - 0.006, cluster.to + 0.006]) {
    const shape = new THREE.Shape(
      [
        [0.567, 0.426],
        [0.566, 0.27],
        [0.62, 0.252],
        [0.69, 0.3],
        [0.71, 0.41],
      ].map(([x, y]) => new THREE.Vector2(x, y))
    );
    const cheek = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }),
      materials.leather
    );
    cheek.position.z = z - 0.006;
    cheek.name = 'Instrument hood cheek';
    group.add(cheek);
  }
  // Side vents, upright, near the doors.
  for (const side of [-1, 1]) {
    const v = vent(0.05, 0.062, materials, { vertical: true });
    v.position.set(0.616, 0.352, side * 0.645);
    v.rotation.set(0, -Math.PI / 2, 0);
    v.rotateX(-0.42);
    group.add(v);
  }
  // Light switch left of the wheel.
  const lights = knob(0.016, materials);
  lights.position.set(0.598, 0.27, -0.655);
  lights.rotation.y = -Math.PI / 2;
  lights.rotateX(-0.3);
  lights.name = 'Light switch';
  group.add(lights);
  // Glovebox shut lines and handle on the passenger side.
  const glove = { y0: 0.14, y1: 0.262, z0: 0.2, z1: 0.6, x: 0.5825 };
  for (const [y, z, h, d] of [
    [glove.y0, (glove.z0 + glove.z1) / 2, 0.0025, glove.z1 - glove.z0],
    [glove.y1, (glove.z0 + glove.z1) / 2, 0.0025, glove.z1 - glove.z0],
    [(glove.y0 + glove.y1) / 2, glove.z0, glove.y1 - glove.y0, 0.0025],
    [(glove.y0 + glove.y1) / 2, glove.z1, glove.y1 - glove.y0, 0.0025],
  ])
    group.add(
      at(
        new THREE.Mesh(new THREE.BoxGeometry(0.002, h, d), materials.seam),
        glove.x,
        y,
        z,
        'Glovebox shut line'
      )
    );
  group.add(
    at(
      new THREE.Mesh(roundedBlock(0.008, 0.012, 0.09, 0.003), materials.chrome),
      glove.x - 0.004,
      glove.y1 - 0.02,
      0.4,
      'Glovebox handle'
    )
  );
  group.add(buildCentreStack(materials));
  // START ENGINE STOP button right of the column, between the instruments
  // and the stack, in a chrome ring.
  const start = new THREE.Group();
  start.name = 'Start-stop button';
  const startRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.0155, 0.0028, 10, 36),
    materials.chrome
  );
  const startCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0135, 0.0135, 0.006, 32),
    materials.gloss
  );
  startCap.rotation.x = Math.PI / 2;
  const startLegend = new THREE.Mesh(
    new THREE.CircleGeometry(0.012, 32),
    new THREE.MeshBasicMaterial({
      name: 'Start-stop legend',
      transparent: true,
      map: labelTexture(128, 128, (g, w, h) => {
        g.fillStyle = '#d4d8dd';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '700 22px Arial, sans-serif';
        g.fillText('START', w / 2, h * 0.36);
        g.font = '600 15px Arial, sans-serif';
        g.fillText('ENGINE', w / 2, h * 0.53);
        g.font = '700 22px Arial, sans-serif';
        g.fillText('STOP', w / 2, h * 0.7);
      }),
    })
  );
  startLegend.position.z = 0.0032;
  start.add(startRing, startCap, startLegend);
  start.position.set(0.583, 0.255, -0.158);
  start.rotation.y = -Math.PI / 2;
  start.rotateX(-0.18);
  group.add(start);
  // The shut line between the upper dash and the knee panel on the
  // driver's side, under the instruments.
  group.add(
    at(
      new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0025, 0.5), materials.seam),
      0.5865,
      0.222,
      -0.44,
      'Knee panel shut line'
    )
  );
  group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  return group;
}

// Fittings under the roof lining: the two sun visors folded up against the
// windscreen header either side of the rear-view mirror, and the overhead
// console behind it with its two map lights and switches.
export function buildRoofFittings(materials = dashboardMaterials()) {
  const group = new THREE.Group();
  group.name = 'Roof fittings';
  const fabric = new THREE.MeshStandardMaterial({
    name: 'Sun visor',
    color: 0x5d5e63,
    roughness: 0.95,
    // Bounced light, as for the lining.
    emissive: 0x24252a,
    envMapIntensity: 0.2,
  });
  fabric.userData.bounce = 1;
  // The windscreen's top edge meets the lining about 0.33 m forward of the
  // body's pivot, 0.72 m up; the visors lie under the lining behind it,
  // tilted down a little toward the glass.
  for (const side of [-1, 1]) {
    const visor = new THREE.Mesh(roundedBlock(0.15, 0.02, 0.33, 0.009), fabric);
    visor.position.set(0.255, 0.712, side * 0.31);
    visor.rotation.z = -0.1;
    visor.name = 'Sun visor';
    // Its hinge rod and clip near the windscreen.
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.05, 10),
      materials.plastic
    );
    hinge.rotation.x = Math.PI / 2;
    hinge.position.set(0.315, 0.708, side * 0.47);
    hinge.name = 'Sun visor hinge';
    group.add(visor, hinge);
  }
  const overhead = new THREE.Mesh(roundedBlock(0.13, 0.026, 0.21, 0.01), materials.plastic);
  overhead.position.set(0.2, 0.722, 0);
  overhead.name = 'Overhead console';
  group.add(overhead);
  const lens = new THREE.MeshStandardMaterial({
    name: 'Map light lens',
    color: 0x8f949a,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(roundedBlock(0.05, 0.004, 0.05, 0.002), lens);
    light.position.set(0.2, 0.708, side * 0.06);
    light.name = 'Map light';
    const key = new THREE.Mesh(roundedBlock(0.016, 0.006, 0.026, 0.002), materials.key);
    key.position.set(0.24, 0.708, side * 0.06);
    key.name = 'Map light key';
    group.add(light, key);
  }
  group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  return group;
}
