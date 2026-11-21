import * as THREE from 'three';

// Front door cards after the F10 M5's: black Merino leather under the sill,
// an Aluminium Trace strip along the door, the chrome opener in a dark
// recess, an armrest with the window and mirror switches and a pull handle
// curving up from its front, a round speaker grille with a chrome ring and a
// door pocket. They replace the model's door panels, two flat triangles
// each. Body space: x forward, y up, z to the right; the driver's door is on
// the left (negative z). The model's cabin is low, so heights are fitted to
// its sill and seats rather than to factory dimensions.
export const doorTrim = Object.freeze({
  // Front door, between the dashboard and the B-pillar.
  from: -0.6,
  to: 0.56,
  // The card's face (|z|), its bottom and the sill above it.
  face: 0.712,
  bottom: 0.12,
  sill: 0.386,
  // Where the leather upper meets the lower panel, and the trim strip.
  leatherFrom: 0.33,
  strip: 0.352,
  armrest: Object.freeze({ from: -0.42, to: 0.2, top: 0.312, depth: 0.068 }),
  opener: Object.freeze([0.42, 0.352]),
  speaker: Object.freeze({ x: 0.33, y: 0.215, r: 0.056 }),
});

// The model's door panels: triangles facing across the car on the inside
// of a front door, below the sill.
export function isOldDoorTriangle(a, b, c, meshName) {
  if (meshName !== 'Object_53') return false;
  const x = (a.x + b.x + c.x) / 3,
    y = (a.y + b.y + c.y) / 3,
    z = Math.abs((a.z + b.z + c.z) / 3);
  const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
  return (
    x > doorTrim.from &&
    x < doorTrim.to &&
    y > 0.02 &&
    y < doorTrim.sill - 0.01 &&
    z > 0.6 &&
    z < 0.8 &&
    Math.abs(normal.z) > 0.7
  );
}

// A block w × h (x, y) and d deep (z) with rounded edges, centred.
function roundedBlock(w, h, d, r) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const shape = new THREE.Shape(),
    x = w / 2 - r,
    y = h / 2 - r;
  shape.moveTo(-x, -h / 2);
  shape.lineTo(x, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  shape.lineTo(w / 2, y);
  shape.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  shape.lineTo(-x, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  shape.lineTo(-w / 2, -y);
  shape.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - 2 * r),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -(d - 2 * r) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// A flat panel in the x–y plane through outline points, d thick.
function panel(points, d) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -d / 2);
  return geometry;
}

// Speaker cloth: dark perforated metal, drawn once.
function grilleTexture() {
  const size = 128,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#060607';
  for (let y = 4; y < size; y += 8)
    for (let x = (y / 8) % 2 ? 8 : 4; x < size; x += 8) {
      g.beginPath();
      g.arc(x, y, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

export function doorMaterials() {
  // Inside the cabin the sky and grass reflect only faintly.
  const inside = { envMapIntensity: 0.25 };
  return {
    leather: new THREE.MeshPhysicalMaterial({
      name: 'Door leather',
      color: 0x1c1c1f,
      roughness: 0.6,
      sheen: 0.4,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color(0x45454d),
      ...inside,
    }),
    lower: new THREE.MeshStandardMaterial({
      name: 'Door panel',
      color: 0x121315,
      roughness: 0.7,
      ...inside,
    }),
    trim: new THREE.MeshStandardMaterial({
      name: 'Aluminium Trace',
      color: 0x7c8086,
      metalness: 0.85,
      roughness: 0.38,
      ...inside,
    }),
    chrome: new THREE.MeshStandardMaterial({
      name: 'Door chrome',
      color: 0xc4c8cc,
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 0.6,
    }),
    recess: new THREE.MeshStandardMaterial({
      name: 'Door recess',
      color: 0x060607,
      roughness: 0.8,
      ...inside,
    }),
    gloss: new THREE.MeshStandardMaterial({
      name: 'Switch panel',
      color: 0x0a0b0d,
      roughness: 0.15,
      ...inside,
    }),
    switches: new THREE.MeshStandardMaterial({
      name: 'Switches',
      color: 0x1b1d21,
      roughness: 0.45,
      ...inside,
    }),
    grille: new THREE.MeshStandardMaterial({
      name: 'Speaker grille',
      map: grilleTexture(),
      metalness: 0.5,
      roughness: 0.55,
      ...inside,
    }),
  };
}

// One front door card. `side` is -1 for the driver's door (left), +1 for
// the passenger's.
export function buildDoorCard(side, materials) {
  const { from, to, face, bottom, sill, leatherFrom, strip, armrest, opener, speaker } = doorTrim;
  const card = new THREE.Group();
  card.name = side < 0 ? 'Driver door card' : 'Passenger door card';
  // Inward from the card's face by `depth` (towards the cabin).
  const at = (mesh, x, y, depth, name) => {
    mesh.position.set(x, y, side * (face - depth));
    mesh.name = name;
    card.add(mesh);
    return mesh;
  };
  // Lower panel and the leather upper, their front corner following the
  // A-pillar; flat-backed so both sit on the old door's plane.
  const lower = new THREE.Mesh(
    panel(
      [
        [from + 0.03, bottom],
        [to - 0.06, bottom],
        [to, bottom + 0.06],
        [to, leatherFrom],
        [from, leatherFrom],
        [from, bottom + 0.03],
      ],
      0.012
    ),
    materials.lower
  );
  at(lower, 0, 0, 0.002, 'Door lower panel');
  const upper = new THREE.Mesh(
    panel(
      [
        [from, leatherFrom],
        [to, leatherFrom],
        [to - 0.02, sill - 0.025],
        [to - 0.06, sill],
        [from, sill],
      ],
      0.02
    ),
    materials.leather
  );
  at(upper, 0, 0, 0.006, 'Door leather upper');
  // Sill cap: the rounded top edge under the window.
  at(
    new THREE.Mesh(roundedBlock(to - from - 0.06, 0.016, 0.05, 0.007), materials.leather),
    (from + to) / 2 - 0.03,
    sill,
    0.006,
    'Door sill cap'
  );
  // Aluminium Trace strip, from the B-pillar to the opener.
  at(
    new THREE.Mesh(roundedBlock(to - from - 0.16, 0.02, 0.012, 0.004), materials.trim),
    (from + to) / 2 - 0.08,
    strip,
    0.017,
    'Door trim strip'
  );
  // Opener: a chrome lever in a dark recess.
  at(
    new THREE.Mesh(roundedBlock(0.12, 0.04, 0.01, 0.012), materials.recess),
    opener[0],
    opener[1],
    0.014,
    'Door opener recess'
  );
  const lever = at(
    new THREE.Mesh(roundedBlock(0.095, 0.014, 0.014, 0.006), materials.chrome),
    opener[0] - 0.006,
    opener[1] - 0.004,
    0.024,
    'Door opener'
  );
  lever.rotation.z = 0.06;
  // Armrest.
  const length = armrest.to - armrest.from;
  at(
    new THREE.Mesh(roundedBlock(length, 0.034, armrest.depth, 0.014), materials.leather),
    (armrest.from + armrest.to) / 2,
    armrest.top - 0.017,
    armrest.depth / 2,
    'Door armrest'
  );
  // Its support down to the pocket, set back under the armrest.
  at(
    new THREE.Mesh(roundedBlock(length - 0.06, 0.07, 0.03, 0.01), materials.lower),
    (armrest.from + armrest.to) / 2,
    armrest.top - 0.065,
    0.018,
    'Door armrest support'
  );
  // Switch panel at the armrest's front: four window switches and the
  // mirror pad, gloss black.
  const panelX = armrest.to - 0.11;
  const switchPanel = at(
    new THREE.Mesh(roundedBlock(0.17, 0.006, 0.044, 0.003), materials.gloss),
    panelX,
    armrest.top + 0.001,
    armrest.depth * 0.55,
    'Window switch panel'
  );
  switchPanel.rotation.z = -0.04;
  for (let i = 0; i < 4; i++) {
    at(
      new THREE.Mesh(roundedBlock(0.024, 0.01, 0.016, 0.004), materials.switches),
      panelX + 0.045 - (i % 2) * 0.034,
      armrest.top + 0.007,
      armrest.depth * 0.55 + (i < 2 ? -0.011 : 0.011),
      'Window switch'
    );
  }
  const pad = at(
    new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.007, 20), materials.switches),
    panelX - 0.05,
    armrest.top + 0.005,
    armrest.depth * 0.55,
    'Mirror switch'
  );
  pad.rotation.set(0, 0, -0.04);
  // Pull handle: a leather bar curving up from the armrest's front into the
  // door, below the opener.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(armrest.to - 0.03, armrest.top - 0.004, side * (face - armrest.depth + 0.01)),
    new THREE.Vector3(
      armrest.to + 0.05,
      armrest.top + 0.008,
      side * (face - armrest.depth + 0.004)
    ),
    new THREE.Vector3(armrest.to + 0.11, armrest.top + 0.024, side * (face - 0.045)),
    new THREE.Vector3(armrest.to + 0.15, armrest.top + 0.03, side * (face - 0.02)),
  ]);
  const pull = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.011, 10), materials.leather);
  pull.name = 'Door pull handle';
  card.add(pull);
  // Speaker: perforated grille in a thin chrome ring.
  const grille = at(
    new THREE.Mesh(new THREE.CircleGeometry(speaker.r, 40), materials.grille),
    speaker.x,
    speaker.y,
    0.009,
    'Door speaker grille'
  );
  grille.rotation.y = side < 0 ? 0 : Math.PI;
  const ring = at(
    new THREE.Mesh(new THREE.TorusGeometry(speaker.r + 0.002, 0.0025, 8, 48), materials.chrome),
    speaker.x,
    speaker.y,
    0.009,
    'Door speaker ring'
  );
  ring.rotation.y = grille.rotation.y;
  // Door pocket: a lip along the bottom.
  at(
    new THREE.Mesh(roundedBlock(0.5, 0.045, 0.034, 0.01), materials.lower),
    -0.12,
    bottom + 0.045,
    0.017,
    'Door pocket'
  );
  // Inside the body: shaded by it, casting nothing (see the interior).
  card.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  return card;
}
