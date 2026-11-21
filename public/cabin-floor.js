import * as THREE from 'three';
import { roundedBlock } from './door-trim.js';

// The lower cabin the model lacks: footwells, pedals and the centre console.
//
// The model's cabin floor is one flat sheet at the height of the seat
// mounts, so from the driver's seat the view under the wheel ended on a
// featureless sheet, and the bottom of the steering wheel's rim went
// through it. Each front footwell is dropped below it as in a real car:
// a carpeted well from the front of the seat to a toe board rising to the
// dashboard, with a floor mat; the driver's has the M5's aluminium
// accelerator and brake pedals and a footrest. Between the seats runs the
// centre console with the M DCT selector, the iDrive controller and the
// armrest. Body space: x forward, y up, z to the right (driver at -z).
export const footwell = Object.freeze({
  // From the front of the seat to the toe board, and the toe board's top
  // where it meets the dashboard's lower edge.
  rear: 0.1,
  toe: 0.4,
  front: 0.586,
  floor: 0.02,
  toeTop: 0.125,
  // Across: from the console's side to the door sill.
  inner: 0.155,
  outer: 0.69,
  // The seat floor's height at the riser.
  step: 0.142,
});
export const consoleLayout = Object.freeze({
  halfWidth: 0.11,
  // From under the centre stack's foot back between the seats.
  front: 0.5,
  rear: -0.78,
  top: 0.19,
  armrestFrom: -0.22,
  armrestTop: 0.29,
  selector: 0.22,
  controller: 0.05,
});

// The model's front floor sheet: four large flat triangles from the rear
// seat to the dashboard at the seat floor's height. The carpet covers it up
// to the front of the seats and the dropped footwells take over from there,
// so it is cut whole.
export function isOldFootwellTriangle(a, b, c, meshName) {
  if (meshName !== 'Object_53') return false;
  const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
  const ys = [a.y, b.y, c.y],
    xs = [a.x, b.x, c.x];
  return (
    normal.y > 0.8 &&
    Math.min(...ys) > 0.05 &&
    Math.max(...ys) < 0.25 &&
    Math.max(...xs) > footwell.rear &&
    Math.min(...xs) < footwell.front &&
    Math.max(Math.abs(a.z), Math.abs(b.z), Math.abs(c.z)) < footwell.outer + 0.06
  );
}

// Fine carpet pile and a ribbed rubber pedal face, drawn once.
function noiseTexture(size, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}
function carpetTexture() {
  return noiseTexture(
    128,
    (g, size) => {
      const image = g.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const v = 26 + Math.random() * 20;
        image.data.set([v, v, v + 2, 255], i * 4);
      }
      g.putImageData(image, 0, 0);
    },
    6
  );
}
function pedalTexture() {
  return noiseTexture(
    64,
    (g, size) => {
      g.fillStyle = '#7d8187';
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#121315';
      for (let y = 4; y < size; y += 10) g.fillRect(5, y, size - 10, 5);
    },
    1
  );
}

export function cabinFloorMaterials() {
  // Inside the cabin the sky reflects only faintly.
  const inside = { envMapIntensity: 0.1 };
  return {
    carpet: new THREE.MeshStandardMaterial({
      name: 'Footwell carpet',
      map: carpetTexture(),
      color: 0x8a8d94,
      roughness: 1,
      side: THREE.DoubleSide,
      ...inside,
    }),
    mat: new THREE.MeshStandardMaterial({
      name: 'Floor mat',
      color: 0x151619,
      roughness: 0.95,
      ...inside,
    }),
    piping: new THREE.MeshStandardMaterial({
      name: 'Floor mat piping',
      color: 0x34373d,
      roughness: 0.7,
      ...inside,
    }),
    pedal: new THREE.MeshStandardMaterial({
      name: 'Aluminium pedal',
      map: pedalTexture(),
      metalness: 0.5,
      roughness: 0.45,
      ...inside,
    }),
    plastic: new THREE.MeshStandardMaterial({
      name: 'Console',
      color: 0x111215,
      roughness: 0.7,
      ...inside,
    }),
    gloss: new THREE.MeshStandardMaterial({
      // Satin rather than piano black: the scene's sky map, reflected at
      // the grazing angle the driver sees it from, turned a gloss top white
      // where a real cabin would mirror its dark roof.
      name: 'Console black panel',
      color: 0x0a0b0d,
      roughness: 0.62,
      ...inside,
    }),
    trim: new THREE.MeshStandardMaterial({
      name: 'Console Aluminium Trace',
      color: 0x55585e,
      metalness: 0.4,
      roughness: 0.6,
      ...inside,
    }),
    leather: new THREE.MeshPhysicalMaterial({
      name: 'Console leather',
      color: 0x1c1c1f,
      roughness: 0.6,
      sheen: 0.4,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color(0x45454d),
      ...inside,
    }),
    chrome: new THREE.MeshStandardMaterial({
      name: 'Console chrome',
      color: 0xc4c8cc,
      metalness: 1,
      roughness: 0.2,
      envMapIntensity: 0.6,
    }),
  };
}

// A flat polygon in the x–y plane (points [x, y]) placed at depth z.
function wall(points, z, material, name) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.position.z = z;
  mesh.name = name;
  return mesh;
}
// A flat quad through four corners.
function quad(corners, material, name) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}
// A mesh at a position, tilted about z (pitch, positive raises the front).
function placed(mesh, [x, y, z], pitch = 0, name = mesh.name) {
  mesh.position.set(x, y, z);
  mesh.rotation.z = pitch;
  mesh.name = name;
  return mesh;
}

// One footwell: side -1 for the driver's, +1 for the passenger's.
export function buildFootwell(side, materials) {
  const { rear, toe, front, floor, toeTop, inner, outer, step } = footwell;
  const group = new THREE.Group();
  group.name = side < 0 ? 'Driver footwell' : 'Passenger footwell';
  const zi = side * inner,
    zo = side * outer;
  // Floor, toe board, the riser up to the seat floor, and the sill side.
  group.add(
    quad(
      [
        [rear, floor, zi],
        [toe, floor, zi],
        [toe, floor, zo],
        [rear, floor, zo],
      ],
      materials.carpet,
      'Footwell floor'
    ),
    quad(
      [
        [toe, floor, zi],
        [front, toeTop, zi],
        [front, toeTop, zo],
        [toe, floor, zo],
      ],
      materials.carpet,
      'Toe board'
    ),
    quad(
      [
        [rear, floor, zi],
        [rear, step, zi],
        [rear, step, zo],
        [rear, floor, zo],
      ],
      materials.carpet,
      'Footwell riser'
    ),
    wall(
      [
        [rear, floor],
        [toe, floor],
        [front, toeTop],
        [front, step + 0.01],
        [rear, step + 0.01],
      ],
      zo,
      materials.carpet,
      'Footwell sill side'
    )
  );
  // Floor mat with lighter piping round its edge.
  const matLength = toe - rear - 0.05,
    matWidth = outer - inner - 0.08,
    matCentre = [(rear + toe) / 2, floor + 0.004, (side * (inner + outer)) / 2];
  const piping = new THREE.Mesh(roundedBlock(matLength, matWidth, 0.004, 0.03), materials.piping);
  piping.rotation.x = -Math.PI / 2;
  piping.position.set(...matCentre);
  piping.name = 'Floor mat piping';
  const mat = new THREE.Mesh(
    roundedBlock(matLength - 0.016, matWidth - 0.016, 0.006, 0.026),
    materials.mat
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(matCentre[0], matCentre[1] + 0.002, matCentre[2]);
  mat.name = 'Floor mat';
  group.add(piping, mat);
  if (side < 0) {
    // The toe board's slope, for the pedals that lie on it.
    const slope = Math.atan2(toeTop - floor, front - toe);
    const onToe = (t, lift) => [
      toe + (front - toe) * t - Math.sin(slope) * lift,
      floor + (toeTop - floor) * t + Math.cos(slope) * lift,
    ];
    // Accelerator: a tall floor-hinged pad, right of the brake.
    const [ax, ay] = onToe(0.5, 0.014);
    const accelerator = placed(
      new THREE.Mesh(roundedBlock(0.115, 0.01, 0.05, 0.004), materials.pedal),
      [ax, ay, -0.27],
      slope + 0.12,
      'Accelerator pedal'
    );
    // Brake: a wide pad hanging from under the dashboard.
    // Its face leans forward at the top.
    const brake = placed(
      new THREE.Mesh(roundedBlock(0.01, 0.045, 0.08, 0.004), materials.pedal),
      [0.49, 0.1, -0.395],
      -0.35,
      'Brake pedal'
    );
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.1, 10),
      materials.plastic
    );
    arm.position.set(0.53, 0.13, -0.395);
    arm.rotation.z = -0.9;
    arm.name = 'Brake pedal arm';
    // Footrest on the left.
    const [fx, fy] = onToe(0.45, 0.008);
    const footrest = placed(
      new THREE.Mesh(roundedBlock(0.13, 0.008, 0.06, 0.004), materials.pedal),
      [fx, fy, -0.6],
      slope,
      'Footrest'
    );
    group.add(accelerator, brake, arm, footrest);
  }
  return group;
}

export function buildConsole(materials) {
  const { halfWidth, front, rear, top, armrestFrom, armrestTop, selector, controller } =
    consoleLayout;
  const group = new THREE.Group();
  group.name = 'Centre console';
  const floor = footwell.floor;
  // The body: from the footwells' floor up, the full length between the seats.
  const length = front - rear;
  group.add(
    placed(
      new THREE.Mesh(roundedBlock(length, top - floor, halfWidth * 2, 0.02), materials.plastic),
      [(front + rear) / 2, (top + floor) / 2, 0],
      0,
      'Console body'
    )
  );
  // Top: a piano-black panel in an Aluminium Trace surround, from the dash
  // to the armrest.
  const panelLength = front - armrestFrom - 0.06;
  group.add(
    placed(
      new THREE.Mesh(roundedBlock(panelLength, 0.008, halfWidth * 2 - 0.02, 0.004), materials.trim),
      [armrestFrom + 0.03 + panelLength / 2, top + 0.003, 0],
      0,
      'Console trim'
    ),
    placed(
      new THREE.Mesh(
        roundedBlock(panelLength - 0.03, 0.006, halfWidth * 2 - 0.06, 0.003),
        materials.gloss
      ),
      [armrestFrom + 0.03 + panelLength / 2, top + 0.008, 0],
      0,
      'Console panel'
    )
  );
  // Armrest over the storage box.
  group.add(
    placed(
      new THREE.Mesh(
        roundedBlock(armrestFrom - rear, armrestTop - top + 0.02, halfWidth * 2 + 0.01, 0.03),
        materials.leather
      ),
      [(armrestFrom + rear) / 2, (armrestTop + top) / 2, 0],
      0,
      'Console armrest'
    )
  );
  // M DCT selector: a chrome-ringed gate and the leather lever, leaning back.
  const gate = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.012, 32), materials.chrome);
  gate.position.set(selector, top + 0.014, 0);
  gate.name = 'Selector gate';
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.01, 32), materials.gloss);
  boot.position.set(selector, top + 0.02, 0);
  boot.name = 'Selector boot';
  const lever = placed(
    new THREE.Mesh(roundedBlock(0.085, 0.06, 0.044, 0.018), materials.leather),
    [selector - 0.005, top + 0.055, 0],
    0.15,
    'Selector lever'
  );
  const button = placed(
    new THREE.Mesh(roundedBlock(0.03, 0.008, 0.022, 0.004), materials.chrome),
    [selector + 0.015, top + 0.086, 0.0],
    0.15,
    'Selector release'
  );
  group.add(gate, boot, lever, button);
  // Drivelogic and M buttons beside the selector.
  for (const [dx, dz] of [
    [-0.02, -0.068],
    [0.03, -0.068],
    [-0.02, 0.068],
    [0.03, 0.068],
  ])
    group.add(
      placed(
        new THREE.Mesh(roundedBlock(0.034, 0.008, 0.026, 0.004), materials.plastic),
        [selector + dx, top + 0.013, dz],
        0,
        'Console button'
      )
    );
  // iDrive controller: a knurled chrome ring round a black dial, with its
  // shortcut keys in front.
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.038, 0.022, 36),
    materials.chrome
  );
  ring.position.set(controller, top + 0.02, 0);
  ring.name = 'iDrive controller ring';
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.033, 0.026, 36), materials.gloss);
  dial.position.set(controller, top + 0.024, 0);
  dial.name = 'iDrive controller';
  group.add(ring, dial);
  for (const dz of [-0.05, -0.017, 0.017, 0.05])
    group.add(
      placed(
        new THREE.Mesh(roundedBlock(0.024, 0.007, 0.028, 0.004), materials.plastic),
        [controller + 0.06, top + 0.012, dz],
        0,
        'iDrive key'
      )
    );
  return group;
}

// Footwells, pedals and the console, receiving the body's shadow only.
export function buildCabinFloor() {
  const materials = cabinFloorMaterials();
  const group = new THREE.Group();
  group.name = 'Cabin floor';
  group.add(buildFootwell(-1, materials), buildFootwell(1, materials), buildConsole(materials));
  group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  return { group, materials };
}
