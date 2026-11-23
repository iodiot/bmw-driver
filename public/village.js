import * as THREE from 'three';
import { branchOffset, roadBranch, roadCenterSlope, roadCenterZ } from './road-profile.js';
import { nearestOccurrence } from './road-structures.js';
import { Kit } from './build-kit.js';
import { groupShadow } from './sun-shadows.js';

// A village along the country road's far side, past the fuel station and
// round the bus stop: a row of whitewashed (or pastel) houses with tin roofs
// in red, green or blue, blue window frames and shutters, a chimney, a
// picket fence with a gate along the track, a plank shed behind and here
// and there a well with a sweep. Each yard is one mesh for its walls, roofs
// and fences and one for its windows, which glow warm in the evening.
// Yards' places into each section (clear of the bus stop at 900 m).
export const villageYards = Object.freeze([770, 805, 842, 935, 970, 1006, 1044, 1080]);
const plot = 30;

function seeded(n) {
  let seed = 9301 + n * 49297;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const pick = (random, list) => list[Math.floor(random() * list.length)];

// One yard, in its own frame: x along the road, z away from the track's
// far edge (the fence along it at z = fence).
export function yardKits(index) {
  const random = seeded(index);
  const kit = new Kit(),
    windows = new Kit(),
    // Sunflowers apart, as there are none in winter.
    garden = new Kit();
  const wall = pick(random, [0xf2efe6, 0xf4f1e8, 0xe9efe9, 0xf3ead2, 0xdfe9f2]);
  const roof = pick(random, [0x9a3b2c, 0x3f6e4c, 0x3d5a87, 0x7b7f84, 0x8a4a2a]);
  const trim = pick(random, [0x2f6db5, 0x2f6db5, 0x4f8a5a, 0xe9e7e2]);
  const fenceColour = pick(random, [0x4d78b0, 0x6f9a55, 0x8a6b4a, 0xd9d4c7]);
  const fence = 4.5;
  // The picket fence along the track, a gate in it.
  const gate = (random() - 0.5) * 10;
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
  for (const x of [gate - 1.6, gate + 1.6]) kit.box(0.14, 1.5, 0.14, x, 0, fence, 0x5a4a3a);
  // The house: whitewashed walls on a dark plinth, set back from the fence.
  const w = 9 + random() * 3,
    d = 6 + random() * 1.4,
    h = 2.8 + random() * 0.4,
    hx = (random() - 0.5) * 8,
    hz = fence + 6 + random() * 4;
  kit.box(w + 0.2, 0.45, d + 0.2, hx, 0, hz, 0x6d6a66);
  kit.box(w, h - 0.45, d, hx, 0.45, hz, wall);
  // A gable roof, or a hipped one sloping down on all four sides.
  const rise = 1.9 + random() * 0.6;
  if (random() < 0.4) {
    const hip = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    hip.rotateY(Math.PI / 4);
    hip.scale(w + 1, rise, d + 1);
    hip.translate(0, rise / 2, 0);
    kit.add(hip, roof, new THREE.Matrix4().setPosition(hx, h, hz));
  } else kit.gable(w, d, rise, hx, h, hz, roof, 0.5);
  // The chimney.
  kit.box(0.6, 1.6, 0.6, hx + w * 0.22, h + 0.6, hz + d * 0.15, 0xb24c3a);
  // Windows toward the track, framed and shuttered.
  const count = w > 10.5 ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const x = hx - w / 2 + ((i + 0.5) * w) / count;
    windows.box(1.0, 1.15, 0.06, x, 1.05, hz - d / 2 - 0.02, 0x23303c);
    kit.box(1.22, 0.1, 0.1, x, 0.98, hz - d / 2 - 0.05, trim);
    kit.box(1.22, 0.1, 0.1, x, 2.22, hz - d / 2 - 0.05, trim);
    for (const side of [-1, 1])
      kit.box(0.42, 1.2, 0.05, x + side * 0.78, 1.03, hz - d / 2 - 0.06, trim);
  }
  // A door and a porch on the gable end nearer the gate.
  const end = gate < hx ? -1 : 1;
  kit.box(0.08, 2.0, 0.95, hx + end * (w / 2 + 0.03), 0.45, hz - 0.8, 0x6b4a32);
  kit.box(1.4, 0.25, 1.8, hx + end * (w / 2 + 0.7), 0, hz - 0.8, 0x8d8a85);
  // A path from the gate to the porch, of packed earth and old bricks.
  const porchX = hx + end * (w / 2 + 0.7),
    porchZ = hz - 0.8;
  {
    const dx = porchX - gate,
      dz = porchZ - fence,
      length = Math.hypot(dx, dz);
    kit.box(
      length,
      0.03,
      1.1,
      (gate + porchX) / 2,
      0,
      (fence + porchZ) / 2,
      0xa8988a,
      -Math.atan2(dz, dx)
    );
  }
  // A bench by the gate, on the track's side of the fence, as in every
  // village.
  kit.box(1.8, 0.07, 0.4, gate + (gate > 0 ? -2.8 : 2.8), 0.42, fence - 0.6, 0x7a5a3c);
  for (const s of [-0.7, 0.7])
    kit.box(0.08, 0.42, 0.34, gate + (gate > 0 ? -2.8 : 2.8) + s, 0, fence - 0.6, 0x5a4634);
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
    garden.add(head, 0xf2b81c, new THREE.Matrix4().setPosition(fx, tall + 0.1, fz - 0.03));
    const middle = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10);
    middle.rotateX(-(Math.PI / 2 - 0.35));
    garden.add(middle, 0x5a3a1a, new THREE.Matrix4().setPosition(fx, tall + 0.1, fz - 0.06));
  }
  // A plank shed behind, with a lean-to roof.
  const sx = hx + (random() - 0.5) * 10,
    sz = hz + d / 2 + 4 + random() * 3;
  kit.box(4.5, 2.3, 3.2, sx, 0, sz, 0x7a5a3c);
  const shedRoof = new THREE.BoxGeometry(5, 0.1, 3.8);
  shedRoof.rotateX(-0.18);
  kit.add(shedRoof, 0x6b6f73, new THREE.Matrix4().setPosition(sx, 2.45, sz));
  // A well with a sweep in some yards.
  if (random() < 0.45) {
    const wx = hx - end * (w / 2 + 3),
      wz = fence + 3.2;
    kit.box(1.1, 0.8, 1.1, wx, 0, wz, 0x7d7368);
    kit.box(0.15, 3.4, 0.15, wx + 1.2, 0, wz, 0x5a4634);
    const sweep = new THREE.BoxGeometry(6.5, 0.1, 0.1);
    sweep.rotateZ(0.45);
    kit.add(sweep, 0x5a4634, new THREE.Matrix4().setPosition(wx + 1.2, 3.4, wz));
  }
  // On one yard, an old pole with a storks' nest, a stork standing in it.
  if (index === 3) {
    const px = hx + end * -(w / 2 + 5),
      pz = fence + 1.2;
    kit.cylinder(0.13, 7.5, px, 0, pz, 0x7d7368);
    kit.cylinder(0.75, 0.45, px, 7.5, pz, 0x6b5536, 12);
    const body = new THREE.SphereGeometry(0.28, 10, 8);
    body.scale(1.5, 0.85, 0.8);
    kit.add(body, 0xf4f4f0, new THREE.Matrix4().setPosition(px, 8.35, pz));
    kit.box(0.3, 0.08, 0.36, px - 0.2, 8.32, pz, 0x161616);
    kit.box(0.06, 0.5, 0.06, px + 0.35, 8.5, pz, 0xf4f4f0);
    const beak = new THREE.ConeGeometry(0.04, 0.32, 6);
    beak.rotateZ(-Math.PI / 2 - 0.3);
    kit.add(beak, 0xd2381e, new THREE.Matrix4().setPosition(px + 0.5, 8.72, pz));
    kit.box(0.04, 0.4, 0.04, px - 0.05, 7.95, pz, 0xd2381e);
  }
  return {
    solid: kit.geometry(),
    glass: windows.geometry(),
    flowers: garden.parts.length ? garden.geometry() : null,
  };
}

export function setupVillage(scene) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.15,
    metalness: 0.3,
    emissive: 0xffc77a,
    emissiveIntensity: 0,
  });
  const yards = villageYards.map((u, i) => {
    const { solid, glass: panes, flowers } = yardKits(i);
    const group = new THREE.Group();
    group.name = 'Village yard';
    const body = new THREE.Mesh(solid, material);
    body.castShadow = body.receiveShadow = true;
    const windows = new THREE.Mesh(panes, glass);
    group.add(body, windows);
    const garden = flowers ? new THREE.Mesh(flowers, material) : null;
    if (garden) {
      garden.name = 'Village sunflowers';
      // (Small, and gone in winter: no shadow of their own.)
      garden.userData.noShadow = true;
      group.add(garden);
    }
    scene.add(group);
    return { u, group, garden, shadow: groupShadow(scene, group, 'Village yard shadow') };
  });
  return {
    yards,
    // Places the yards at their nearest occurrence to x; `night` (0–1)
    // lights the windows; `sun` and `strength` lay their shadows.
    update(x, night = 0, sun = null, strength = 0, winter = 0) {
      glass.emissiveIntensity = 0.8 * night;
      for (const yard of yards) if (yard.garden) yard.garden.visible = winter < 0.5;
      for (const yard of yards) {
        const u = nearestOccurrence(x, yard.u);
        // Not drawn at all when far off.
        const near = Math.abs(u - x) < 900;
        yard.group.visible = near;
        if (!near) {
          yard.shadow.mesh.visible = false;
          continue;
        }
        const edge = (branchOffset(u) ?? roadBranch.separation) + roadBranch.halfWidth;
        yard.group.position.set(u, 0, roadCenterZ(u) + edge);
        yard.group.rotation.y = -Math.atan(roadCenterSlope(u));
        yard.shadow.update(sun, strength);
      }
    },
  };
}
