import * as THREE from 'three';
import { shadowMaterial, shadowOpacity, sunProjection } from './sun-shadows.js';
import {
  roadCenterZ,
  guardrailOffset,
  guardrailsAt,
  oncoming,
  oncomingCentre,
} from './road-profile.js';

// Roadside furniture. The guardrails follow the curving road on a fixed post
// grid around the car, so posts never slide along the road. The right rail
// opens where the country road leaves and rejoins the main road.
export const roadsideLayout = Object.freeze({
  railOffset: guardrailOffset,
  railBottom: 0.45,
  railHeight: 0.31,
  postSpacing: 4,
  span: 1400,
});

// W-beam guardrail profile: two ridges over the beam height.
export function wBeamProfile(steps = 12) {
  const { railHeight } = roadsideLayout;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const s = i / steps;
    return [0.042 * Math.sin(2 * Math.PI * s) ** 2, s * railHeight];
  });
}

// Rail stations every 4 m over the span. Positions are rewritten in place as
// the car advances, so each rail bends with the road's centre line.
// 4 m chords deviate under 4 mm from the tightest (550 m) bends.
const railStep = 4;
function railGeometry() {
  const { span } = roadsideLayout;
  const stations = span / railStep + 1,
    n = wBeamProfile().length,
    indices = [];
  for (let s = 0; s < stations - 1; s++)
    for (let i = 0; i < n - 1; i++) {
      const a = s * n + i,
        b = a + n;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(stations * n * 3), 3).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(stations * n * 3), 3).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  // Texture coordinates and weathering colour are written with the positions
  // (layRail), from world x, so they stay put as the rail is re-laid.
  geometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array(stations * n * 2), 2).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(stations * n * 3), 3).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  geometry.setIndex(indices);
  return geometry;
}

// Panels in the texture: four different 4 m panels repeat every 16 m.
const texturePanels = 4;

// Smooth 1D value noise (0…1) over world distance, for weathering that
// varies along the road instead of repeating with the texture.
function hash(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
export function roadsideNoise(x, cell, seed = 0) {
  const i = Math.floor(x / cell),
    t = x / cell - i,
    f = t * t * (3 - 2 * t);
  return hash(i + seed * 101.3) * (1 - f) + hash(i + 1 + seed * 101.3) * f;
}
// Weathering tint of the rail at world x: cleaner and dirtier stretches tens
// of metres long, some with a faint rust cast.
export function railWeathering(x) {
  const dirt = 0.6 * roadsideNoise(x, 23, 1) + 0.4 * roadsideNoise(x, 61, 2),
    rust = Math.max(0, roadsideNoise(x, 37, 3) - 0.6) * 2.5;
  const brightness = 1.08 - 0.3 * dirt;
  return [
    brightness * (1 + 0.06 * rust),
    brightness * (1 - 0.02 * rust),
    brightness * (1 - 0.1 * rust),
  ];
}

// Galvanised steel for four different 4 m panels, drawn once: zinc spangle,
// faint rolling lines, road grime thrown up on the lower half (heavier on some
// panels), drip streaks under the top edge, and the bolts of the splice and
// post at each panel's start. A matching roughness map makes the grime matte
// and the clean zinc satin.
function guardrailTextures() {
  if (typeof document === 'undefined') return {};
  const panel = 512,
    width = panel * texturePanels,
    height = 128;
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return [canvas, canvas.getContext('2d')];
  };
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const [colour, c] = make(),
    [rough, r] = make();
  c.fillStyle = '#c3c8ca';
  c.fillRect(0, 0, width, height);
  r.fillStyle = 'rgb(0,150,0)';
  r.fillRect(0, 0, width, height);
  // Spangle: zinc crystals a few centimetres across, slightly lighter or darker.
  for (let i = 0; i < 1400 * texturePanels; i++) {
    const x = random() * width,
      y = random() * height,
      w = 3 + random() * 9,
      h = 2 + random() * 6,
      light = random() < 0.5;
    c.fillStyle = light ? 'rgba(235,240,242,0.16)' : 'rgba(70,78,84,0.14)';
    c.fillRect(x, y, w, h);
    r.fillStyle = light ? 'rgba(0,80,0,0.25)' : 'rgba(0,150,0,0.25)';
    r.fillRect(x, y, w, h);
  }
  // Rolling lines along the panel.
  for (let i = 0; i < 90; i++) {
    const y = random() * height;
    c.fillStyle = `rgba(${random() < 0.5 ? '255,255,255' : '40,46,50'},0.05)`;
    c.fillRect(0, y, width, 1);
  }
  // Grime: spray from the road darkens the lower part of the beam.
  const grime = c.createLinearGradient(0, height, 0, height * 0.35);
  grime.addColorStop(0, 'rgba(96,88,72,0.32)');
  grime.addColorStop(0.55, 'rgba(100,94,80,0.1)');
  grime.addColorStop(1, 'rgba(90,84,70,0)');
  c.fillStyle = grime;
  for (let p = 0; p < texturePanels; p++) {
    c.globalAlpha = 0.45 + 0.9 * random();
    c.fillRect(p * panel, 0, panel, height);
  }
  c.globalAlpha = 1;
  const matte = r.createLinearGradient(0, height, 0, height * 0.35);
  matte.addColorStop(0, 'rgba(0,215,0,0.8)');
  matte.addColorStop(1, 'rgba(0,215,0,0)');
  r.fillStyle = matte;
  r.fillRect(0, 0, width, height);
  // Blotches of grime and white zinc oxide.
  for (let i = 0; i < 60 * texturePanels; i++) {
    const x = random() * width,
      y = height * (0.3 + 0.7 * random()),
      radius = 6 + random() * 22,
      oxide = random() < 0.3;
    const blot = c.createRadialGradient(x, y, 0, x, y, radius);
    blot.addColorStop(0, oxide ? 'rgba(235,238,234,0.25)' : 'rgba(80,72,60,0.14)');
    blot.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = blot;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  // Drip streaks running down from the top edge.
  for (let i = 0; i < 40 * texturePanels; i++) {
    const x = random() * width,
      length = height * (0.2 + 0.6 * random());
    const drip = c.createLinearGradient(0, 0, 0, length);
    drip.addColorStop(0, 'rgba(70,66,58,0.1)');
    drip.addColorStop(1, 'rgba(60,56,48,0)');
    c.fillStyle = drip;
    c.fillRect(x, 0, 1 + random() * 2, length);
  }
  // Splice: the next panel's edge overlaps at the post, with its bolt rows;
  // the post bolt is in the middle valley.
  for (let x0 = 0; x0 <= width; x0 += panel) {
    c.fillStyle = 'rgba(40,44,46,0.45)';
    c.fillRect(x0 + 34, 0, 2, height);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(x0 + 36, 0, 1, height);
    const bolts = [
      [x0 - 22, 0.14],
      [x0 - 22, 0.86],
      [x0 + 22, 0.14],
      [x0 + 22, 0.86],
      [x0 - 22, 0.36],
      [x0 + 22, 0.36],
      [x0 - 22, 0.64],
      [x0 + 22, 0.64],
      [x0, 0.5],
    ];
    for (const [x, v] of bolts) {
      const y = height * (1 - v);
      c.fillStyle = 'rgba(30,32,34,0.85)';
      c.beginPath();
      c.arc(x, y, 4.2, 0, 2 * Math.PI);
      c.fill();
      c.fillStyle = 'rgba(200,205,208,0.7)';
      c.beginPath();
      c.arc(x - 0.8, y - 0.8, 2.2, 0, 2 * Math.PI);
      c.fill();
      // Rust weeping from the bolt.
      const rust = c.createLinearGradient(0, y, 0, y + 22);
      rust.addColorStop(0, 'rgba(120,72,40,0.3)');
      rust.addColorStop(1, 'rgba(120,72,40,0)');
      c.fillStyle = rust;
      c.fillRect(x - 1.5, y + 3, 3, 20);
    }
  }
  const texture = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: texture(colour, true), roughnessMap: texture(rough, false) };
}

// Steel C-channel post: the web faces the road, the flanges run away from it.
// Built along +y from the ground, its web at local z = 0.
function postGeometry() {
  const width = 0.055,
    depth = 0.1,
    t = 0.005,
    h = width / 2;
  const shape = new THREE.Shape([
    new THREE.Vector2(-h, 0),
    new THREE.Vector2(h, 0),
    new THREE.Vector2(h, -depth),
    new THREE.Vector2(h - t, -depth),
    new THREE.Vector2(h - t, -t),
    new THREE.Vector2(-h + t, -t),
    new THREE.Vector2(-h + t, -depth),
    new THREE.Vector2(-h, -depth),
  ]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.93, bevelEnabled: false });
  // Extrusion (local z) becomes height; the shape's -y becomes +z, away from the road.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.15, 0);
  return geometry;
}

// The rails by their lateral offset at x (null where a rail is absent, at the
// country road's mouths) and the side their posts stand on, away from the
// main road.
export const railLines = Object.freeze([
  { name: 'left', side: -1, lateral: () => -guardrailOffset },
  // On the route, the oncoming carriageway's outer rail, facing it.
  ...(oncoming
    ? [{ name: 'oncoming', side: -1, lateral: () => oncomingCentre - guardrailOffset }]
    : []),
  {
    name: 'right',
    side: 1,
    lateral: (x) => guardrailsAt(x).find((rail) => rail.lateral > 0)?.lateral ?? null,
  },
]);

// Fills a rail: the W profile is offset from the centre line by the rail's
// lateral distance, its face turned toward the road. Normals come from the
// profile slope, tilted with the rail's direction. A rail that is absent over
// part of the span is drawn only where it stands. Returns the stations drawn.
export function layRail(geometry, side, startX, lateralAt, centre = roadCenterZ) {
  const { railBottom, span } = roadsideLayout;
  const profile = wBeamProfile(),
    n = profile.length,
    position = geometry.attributes.position.array,
    normal = geometry.attributes.normal.array,
    uv = geometry.attributes.uv.array,
    colour = geometry.attributes.color.array;
  const stations = span / railStep + 1;
  const panelLength = roadsideLayout.postSpacing * texturePanels;
  const lateral = [];
  let first = -1;
  for (let s = 0; s < stations; s++) {
    lateral[s] = lateralAt(startX + s * railStep);
    if (lateral[s] !== null && first < 0) first = s;
  }
  for (let s = 0; s < stations; s++) {
    if (lateral[s] === null) continue;
    const x = startX + s * railStep,
      z = centre(x) + lateral[s],
      ahead = lateralAt(x + 0.5) ?? lateral[s],
      behind = lateralAt(x - 0.5) ?? lateral[s],
      k = (centre(x + 0.5) + ahead - centre(x - 0.5) - behind) / 1,
      along = Math.hypot(1, k),
      tint = railWeathering(x);
    for (let i = 0; i < n; i++) {
      const [depth, y] = profile[i],
        prev = profile[Math.max(0, i - 1)],
        next = profile[Math.min(n - 1, i + 1)];
      // Profile normal in the (lateral, up) plane, pointing toward the road.
      let nz = -(next[1] - prev[1]),
        ny = next[0] - prev[0];
      const length = Math.hypot(nz, ny) || 1;
      nz = (side * nz) / length;
      ny /= length;
      const j = (s * n + i) * 3;
      position[j] = x;
      position[j + 1] = railBottom + y;
      position[j + 2] = z - side * depth;
      normal[j] = (-k * nz) / along;
      normal[j + 1] = ny;
      normal[j + 2] = nz / along;
      // Posts sit on whole multiples of 4 m, so splices meet them.
      uv[(s * n + i) * 2] = x / panelLength;
      uv[(s * n + i) * 2 + 1] = i / (n - 1);
      colour.set(tint, j);
    }
  }
  // Where the rail is absent (at the country road's mouths) the stations of
  // the gap collapse to points: the first half to the foot of the rail end
  // before the gap, the rest to the foot of the rail start after it. Every
  // strip in the gap then has no area, and the end strips close the beam's
  // cross-section like a cap.
  const collapse = (s, onto) => {
    const from = onto * n;
    for (let i = 0; i < n; i++) {
      const to = s * n + i;
      position.copyWithin(to * 3, from * 3, from * 3 + 3);
      normal.copyWithin(to * 3, from * 3, from * 3 + 3);
      uv.copyWithin(to * 2, from * 2, from * 2 + 2);
      colour.copyWithin(to * 3, from * 3, from * 3 + 3);
    }
  };
  for (let s = 0; s < stations && first >= 0;) {
    if (lateral[s] !== null) {
      s++;
      continue;
    }
    let end = s;
    while (end < stations && lateral[end] === null) end++;
    const before = s - 1,
      after = end < stations ? end : -1;
    for (let g = s; g < end; g++)
      collapse(g, before >= 0 && (after < 0 || g - s < (end - s) / 2) ? before : after);
    s = end;
  }
  geometry.setDrawRange(0, first < 0 ? 0 : Infinity);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.attributes.uv.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  return lateral.filter((v) => v !== null).length;
}

export function setupRoadside(scene) {
  const { railBottom, railHeight, postSpacing, span } = roadsideLayout;
  const group = new THREE.Group();
  group.name = 'Roadside guardrails';
  const steel = new THREE.MeshStandardMaterial({
    name: 'Galvanised guardrail',
    color: 0xffffff,
    metalness: 0.45,
    roughness: 1,
    vertexColors: true,
    ...guardrailTextures(),
    side: THREE.DoubleSide,
  });
  const postMaterial = new THREE.MeshStandardMaterial({
    name: 'Guardrail post',
    color: 0xa3a8aa,
    metalness: 0.45,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  const posts = Math.round(span / postSpacing) + 1,
    slots = posts * railLines.length;
  const postMesh = new THREE.InstancedMesh(postGeometry(), postMaterial, slots);
  // Spacer blocks hold the beam off the posts.
  const spacerMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.05, 0.2, 0.12),
    postMaterial,
    slots
  );
  for (const mesh of [postMesh, spacerMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
  }
  const rails = railLines.map((line) => {
    const mesh = new THREE.Mesh(railGeometry(), steel);
    mesh.name = `Guardrail ${line.name}`;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { ...line, mesh };
  });
  group.add(postMesh, spacerMesh);
  scene.add(group);
  // Their sun shadows, beyond the shadow map's few metres: the beams and
  // posts drawn again flattened onto the ground along the sun (their
  // geometry and post places shared, so nothing more to lay out).
  const shade = shadowMaterial('Guardrail shadow');
  const shadows = [
    ...rails.map(({ mesh }) => new THREE.Mesh(mesh.geometry, shade)),
    Object.assign(new THREE.InstancedMesh(postMesh.geometry, shade, slots), {
      instanceMatrix: postMesh.instanceMatrix,
    }),
  ];
  for (const s of shadows) {
    s.name = 'Guardrail shadow';
    s.matrixAutoUpdate = false;
    s.frustumCulled = false;
    s.renderOrder = 2;
    s.visible = false;
    scene.add(s);
  }
  const projection = new THREE.Matrix4();
  const matrix = new THREE.Matrix4(),
    rotation = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    position = new THREE.Vector3(),
    unit = new THREE.Vector3(1, 1, 1),
    hidden = new THREE.Matrix4().makeScale(0, 0, 0),
    postColour = new THREE.Color();
  let builtAt = NaN;
  // Re-lays rails and posts on the fixed post grid around x.
  function layout(x) {
    const startX = Math.round(x / postSpacing) * postSpacing - span / 2;
    builtAt = x;
    rails.forEach(({ side, lateral, mesh }, r) => {
      layRail(mesh.geometry, side, startX, lateral);
      for (let i = 0; i < posts; i++) {
        const slot = r * posts + i,
          px = startX + i * postSpacing,
          offset = lateral(px);
        if (offset === null) {
          postMesh.setMatrixAt(slot, hidden);
          spacerMesh.setMatrixAt(slot, hidden);
          continue;
        }
        const centre = roadCenterZ(px),
          slope =
            (roadCenterZ(px + 0.5) +
              (lateral(px + 0.5) ?? offset) -
              roadCenterZ(px - 0.5) -
              (lateral(px - 0.5) ?? offset)) /
            1;
        // Turned half a turn on the left, so the web faces the road there too.
        rotation.setFromAxisAngle(up, -Math.atan(slope) + (side < 0 ? Math.PI : 0));
        position.set(px, 0, centre + offset + side * 0.12);
        postMesh.setMatrixAt(slot, matrix.compose(position, rotation, unit));
        // Each post weathered a little differently.
        const shade = 0.82 + 0.26 * hash(px * 0.25 + r * 7.1);
        postColour.setRGB(shade, shade * (0.98 + 0.03 * hash(px)), shade * 0.98);
        postMesh.setColorAt(slot, postColour);
        spacerMesh.setColorAt(slot, postColour);
        position.set(px, railBottom + railHeight / 2, centre + offset + side * 0.06);
        spacerMesh.setMatrixAt(slot, matrix.compose(position, rotation, unit));
      }
    });
    postMesh.instanceMatrix.needsUpdate = true;
    spacerMesh.instanceMatrix.needsUpdate = true;
    postMesh.instanceColor.needsUpdate = true;
    spacerMesh.instanceColor.needsUpdate = true;
  }
  layout(0);

  return {
    group,
    update(x) {
      if (!(Math.abs(x - builtAt) < 16)) layout(x);
    },
    // Lays their shadows for the sun (pointing toward it) and its strength.
    shadow(sun, strength) {
      const show = Boolean(sun) && strength > 0.02;
      if (show) {
        shade.opacity = shadowOpacity(strength);
        sunProjection(sun, projection);
      }
      for (const s of shadows) {
        s.visible = show;
        if (!show) continue;
        s.matrix.copy(projection);
        s.matrixWorld.copy(projection);
      }
    },
  };
}
