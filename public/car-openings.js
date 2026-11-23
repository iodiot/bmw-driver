import * as THREE from 'three';

// The four doors, the bonnet and the boot lid open while the car stands
// still. The model is one shell per material, so the first time anything
// opens each panel is cut out of it: every triangle of the bodywork, glass,
// seals and door cards is clipped against the panel's outline (a few
// planes in body space: x forward, y up, z to the right) and what lies
// inside goes onto a hinge. Until then nothing is cut and nothing costs
// more to draw. Each opens over about a second; they all close once the car
// moves off.
const side = (s) => (s === 'left' ? 1 : -1);
// A plane [a, b, c, d]: inside where a·x + b·y + c·z <= d.
const door = (s, from, to) => [
  [-1, 0, 0, -from],
  [1, 0, 0, to],
  [0, -1, 0, 0.31],
  [0, 1, 0, 0.8],
  // The side, leaning in toward the roof (and clear of the seats).
  [0, -0.15, side(s), -0.66],
];
const frontDoor = (s) => [
  [...door(s, -0.31, 1.06), [0.62, 1, 0, 1.03]],
  // The door mirror, on the door's front corner.
  [
    [-1, 0, 0, -0.55],
    [1, 0, 0, 1.25],
    [0, -1, 0, -0.25],
    [0, 1, 0, 0.72],
    [0, 0, side(s), -0.78],
  ],
];
export const carOpenings = Object.freeze({
  frontLeft: {
    group: 'doors',
    regions: frontDoor('left'),
    hinge: [1.04, 0.2, -0.9],
    axis: 'y',
    angle: -1.08,
  },
  frontRight: {
    group: 'doors',
    regions: frontDoor('right'),
    hinge: [1.04, 0.2, 0.9],
    axis: 'y',
    angle: 1.08,
  },
  rearLeft: {
    group: 'doors',
    regions: [door('left', -0.95, -0.35)],
    hinge: [-0.37, 0.2, -0.9],
    axis: 'y',
    angle: -1.13,
  },
  rearRight: {
    group: 'doors',
    regions: [door('right', -0.95, -0.35)],
    hinge: [-0.37, 0.2, 0.9],
    axis: 'y',
    angle: 1.13,
  },
  bonnet: {
    group: 'bonnet',
    regions: [
      [
        [-1, 0, 0, -1.08],
        [1, 0, 0, 2.38],
        [0, 0, 1, 0.84],
        [0, 0, -1, 0.84],
        [-0.12, -1, 0, -0.4296],
      ],
    ],
    hinge: [1.08, 0.41, 0],
    axis: 'z',
    angle: 0.85,
  },
  boot: {
    group: 'boot',
    regions: [
      [
        [1, 0, 0, -1.86],
        [0, -1, 0, -0.22],
        [0, 0, 1, 0.66],
        [0, 0, -1, 0.66],
      ],
    ],
    hinge: [-1.86, 0.52, 0],
    axis: 'z',
    angle: -1,
  },
});
export const openingGroups = Object.freeze(['doors', 'bonnet', 'boot']);
// Seconds to open or close, and the speed (m/s) above which they close.
export const openingMotion = Object.freeze({ seconds: 0.9, closeAbove: 1.5, openBelow: 0.5 });

// The cabin's own parts stay put however close to a door they come.
const cabinOnly =
  /Merino|Seat|Console|Dash|Stack|Vent|Carpet|Floor|Headliner|headliner|Roof lining|Steering|Wheel|Pedal|Instrument|iDrive|Screen|Dial|Climate|Overhead|Map light|Sun visor|Airbag|Paddle|chrome strip|Selector|Interior black|Start-stop|Shadow only|Wheel arch liner|Pearl chrome|Cluster|Rear-view|Mirror housing stem|Shut line/;

const inside = (plane, p) => plane[0] * p[0] + plane[1] * p[1] + plane[2] * p[2] - plane[3];

// Splits a convex polygon (vertices {p: body-space [x, y, z], a: attribute
// values}) by a plane into the parts inside and outside it.
export function splitPolygon(polygon, plane) {
  const inner = [],
    outer = [];
  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i],
      w = polygon[(i + 1) % polygon.length];
    const dv = inside(plane, v.p),
      dw = inside(plane, w.p);
    if (dv <= 0) inner.push(v);
    if (dv >= 0) outer.push(v);
    if ((dv < 0 && dw > 0) || (dv > 0 && dw < 0)) {
      const t = dv / (dv - dw);
      const between = {
        p: v.p.map((x, k) => x + (w.p[k] - x) * t),
        a: v.a.map((x, k) => x + (w.a[k] - x) * t),
      };
      inner.push(between);
      outer.push(between);
    }
  }
  return [inner, outer];
}

// Cuts a triangle by the openings' outlines: [owner (name or null), polygon]
// pieces covering it exactly.
export function cutTriangle(triangle, openings) {
  let free = [triangle];
  const owned = [];
  for (const [name, { regions }] of openings)
    for (const planes of regions) {
      const next = [];
      for (const polygon of free) {
        let rest = polygon;
        for (const plane of planes) {
          const [inner, outer] = splitPolygon(rest, plane);
          if (outer.length >= 3) next.push(outer);
          rest = inner;
          if (rest.length < 3) break;
        }
        if (rest.length >= 3) owned.push([name, rest]);
      }
      free = next;
    }
  return [...free.map((p) => [null, p]), ...owned];
}

function boxOutside(box, planes) {
  // Wholly outside one of the planes (every corner past it).
  return planes.some((plane) => {
    for (let i = 0; i < 8; i++) {
      const p = [
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ];
      if (inside(plane, p) <= 0) return false;
    }
    return true;
  });
}

// Cuts a geometry (positions mapped to body space by `toBody`) into what
// stays and what goes with each opening.
function cutGeometry(geometry, toBody, openings) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const names = Object.keys(source.attributes);
  const sizes = names.map((n) => source.attributes[n].itemSize);
  const stride = sizes.reduce((a, b) => a + b, 0);
  const position = source.attributes.position;
  const out = new Map();
  const emit = (owner, polygon) => {
    if (!out.has(owner)) out.set(owner, []);
    const list = out.get(owner);
    for (let i = 1; i < polygon.length - 1; i++)
      for (const v of [polygon[0], polygon[i], polygon[i + 1]]) list.push(v.a);
  };
  const point = new THREE.Vector3();
  const vertex = (i) => {
    const a = new Float32Array(stride);
    let k = 0;
    names.forEach((n, j) => {
      const attribute = source.attributes[n];
      for (let c = 0; c < sizes[j]; c++) a[k++] = attribute.getComponent(i, c);
    });
    point.fromBufferAttribute(position, i).applyMatrix4(toBody);
    return { p: [point.x, point.y, point.z], a };
  };
  for (let i = 0; i + 2 < position.count; i += 3)
    for (const [owner, polygon] of cutTriangle([vertex(i), vertex(i + 1), vertex(i + 2)], openings))
      emit(owner, polygon);
  const build = (list) => {
    const g = new THREE.BufferGeometry();
    let offset = 0;
    names.forEach((n, j) => {
      const s = source.attributes[n];
      const array = new s.array.constructor(list.length * sizes[j]);
      list.forEach((a, v) => {
        for (let c = 0; c < sizes[j]; c++) array[v * sizes[j] + c] = a[offset + c];
      });
      g.setAttribute(n, new THREE.BufferAttribute(array, sizes[j], s.normalized));
      offset += sizes[j];
    });
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };
  return new Map([...out].map(([owner, list]) => [owner, build(list)]));
}

export function setupCarOpenings(rig) {
  const state = Object.fromEntries(
    Object.keys(carOpenings).map((n) => [n, { target: 0, progress: 0 }])
  );
  const pivots = {};
  let cut = false;
  const axes = { y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

  // Cuts every panel out of the body, once.
  function cutPanels() {
    cut = true;
    rig.root.updateMatrixWorld(true);
    const toBodySpace = rig.body.matrixWorld.clone().invert();
    for (const [name, { hinge }] of Object.entries(carOpenings)) {
      const pivot = new THREE.Group();
      pivot.name = `Opening ${name}`;
      pivot.position.fromArray(hinge);
      rig.body.add(pivot);
      pivots[name] = pivot;
    }
    rig.body.updateMatrixWorld(true);
    const meshes = [];
    rig.body.traverse((o) => {
      if (
        !o.isMesh ||
        o.isInstancedMesh ||
        Array.isArray(o.material) ||
        !o.geometry.attributes.position
      )
        return;
      if (cabinOnly.test(o.material.name ?? '') || cabinOnly.test(o.name)) return;
      if (Object.values(pivots).some((p) => p === o.parent)) return;
      meshes.push(o);
    });
    const done = new Map();
    for (const mesh of meshes) {
      const toBody = toBodySpace.clone().multiply(mesh.matrixWorld);
      const box = (
        mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox)
      )
        .clone()
        .applyMatrix4(toBody);
      const near = Object.entries(carOpenings).filter(([, o]) =>
        o.regions.some((planes) => !boxOutside(box, planes))
      );
      if (!near.length) continue;
      const key = `${mesh.geometry.uuid}|${toBody.elements.map((v) => v.toFixed(4)).join(',')}`;
      if (!done.has(key)) done.set(key, cutGeometry(mesh.geometry, toBody, near));
      const parts = done.get(key);
      if (parts.size === 1 && parts.has(null)) continue;
      mesh.geometry = parts.get(null) ?? new THREE.BufferGeometry();
      for (const [owner, geometry] of parts) {
        if (owner === null) continue;
        const piece = new THREE.Mesh(geometry, mesh.material);
        piece.name = `${mesh.name} (${owner})`;
        piece.matrixAutoUpdate = false;
        piece.matrix.makeTranslation(...carOpenings[owner].hinge.map((v) => -v)).multiply(toBody);
        piece.layers.mask = mesh.layers.mask;
        piece.castShadow = mesh.castShadow;
        piece.receiveShadow = mesh.receiveShadow;
        piece.renderOrder = mesh.renderOrder;
        piece.visible = mesh.visible;
        piece.userData = { ...mesh.userData };
        piece.customDepthMaterial = mesh.customDepthMaterial;
        piece.customDistanceMaterial = mesh.customDistanceMaterial;
        pivots[owner].add(piece);
      }
    }
  }

  // What lies under the bonnet and the boot lid, added when they are first
  // cut: an engine cover between the strut towers over a dark bay, and the
  // boot's carpeted well.
  function addBays() {
    const plastic = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.7 });
    const cover = new THREE.MeshStandardMaterial({
      color: 0x2b2d30,
      roughness: 0.45,
      metalness: 0.3,
    });
    const carpet = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.95 });
    const box = (material, w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.name = 'Bay';
      rig.body.add(mesh);
      return mesh;
    };
    box(plastic, 1.2, 0.06, 1.5, 1.7, -0.05, 0);
    box(cover, 0.75, 0.16, 0.72, 1.55, 0.06, 0);
    for (const z of [-0.35, -0.12, 0.12, 0.35]) box(plastic, 0.6, 0.03, 0.06, 1.55, 0.155, z);
    for (const z of [-0.58, 0.58]) box(plastic, 0.32, 0.22, 0.3, 1.38, 0.02, z);
    box(plastic, 0.12, 0.05, 1.1, 1.38, 0.17, 0);
    box(carpet, 0.62, 0.04, 1.2, -2.12, -0.12, 0);
    box(carpet, 0.04, 0.5, 1.2, -1.82, 0.12, 0);
    for (const z of [-0.62, 0.62]) box(carpet, 0.62, 0.5, 0.04, -2.12, 0.12, z);
  }
  const ease = (t) => t * t * (3 - 2 * t);
  return {
    // Whether a group of openings ('doors', 'bonnet' or 'boot') is open.
    isOpen(group) {
      return Object.entries(carOpenings).some(([n, o]) => o.group === group && state[n].target > 0);
    },
    get moving() {
      return Object.values(state).some((s) => s.progress > 0);
    },
    // Opens or closes a group; false if the car is moving too fast.
    toggle(group, speed = 0) {
      const open = !this.isOpen(group);
      if (open && Math.abs(speed) > openingMotion.openBelow) return false;
      if (open && !cut) {
        cutPanels();
        addBays();
      }
      for (const [n, o] of Object.entries(carOpenings))
        if (o.group === group) state[n].target = open ? 1 : 0;
      return true;
    },
    closeAll() {
      for (const s of Object.values(state)) s.target = 0;
    },
    update(dt, speed = 0) {
      if (Math.abs(speed) > openingMotion.closeAbove) this.closeAll();
      if (!cut) return;
      for (const [n, o] of Object.entries(carOpenings)) {
        const s = state[n];
        const step = dt / openingMotion.seconds;
        s.progress = THREE.MathUtils.clamp(
          s.progress +
            Math.sign(s.target - s.progress) * Math.min(step, Math.abs(s.target - s.progress)),
          0,
          1
        );
        pivots[n].quaternion.setFromAxisAngle(axes[o.axis], o.angle * ease(s.progress));
      }
    },
  };
}
