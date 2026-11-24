import * as THREE from 'three';
import { branchOffset, roadBranch, roadCenterZ, roadCenterSlope } from './road-profile.js';
import { nearestOccurrence } from './road-structures.js';
import { groupShadow } from './sun-shadows.js';

// A village bus stop on the country road, on its far side where it runs
// parallel to the motorway: a Soviet-era concrete shelter, its back wall a
// tiled mosaic of a sun over the fields (as many still stand along
// Ukraine's roads), a bench, a bin and the stop's sign with the village's
// name. Its mosaic faces the road, so it can be seen from the motorway too.
export const busStopLayout = Object.freeze({
  // Distance into each section, by the service lane past the fuel station
  // (the lane serves as the bus's lay-by).
  at: 760,
  // From the lane's edge to the shelter's front.
  setback: 1.6,
  width: 4.6,
  depth: 1.7,
  height: 2.7,
  village: 'Сосонка',
});

const rand = (() => {
  let seed = 77;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
})();

// The mosaic: square tiles with grout between, each a little off its
// colour; a sun with rays over blue sky, a band of wheat and a field of
// sunflowers, and two storks.
function mosaicTexture() {
  if (typeof document === 'undefined') return null;
  const w = 512,
    h = 300,
    tile = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d8d2c4';
  g.fillRect(0, 0, w, h);
  const design = (x, y) => {
    const u = x / w,
      v = y / h;
    const sun = Math.hypot(u - 0.66, (v - 0.3) * 0.6);
    // Storks: two little white chevrons in the sky.
    for (const [sx, sy] of [
      [0.22, 0.2],
      [0.31, 0.13],
    ])
      if (Math.abs(v - sy - Math.abs(u - sx) * 0.9) < 0.022 && Math.abs(u - sx) < 0.05)
        return [242, 242, 236];
    const fieldTop = 0.6 + 0.05 * Math.sin(u * 9),
      sunflowerTop = 0.78 + 0.04 * Math.sin(u * 13 + 1);
    if (v > sunflowerTop) {
      // Sunflower heads on green.
      const cx = (Math.round(u * 14) + 0.5) / 14 - 0.5 / 14,
        cy = sunflowerTop + 0.09;
      const d = Math.hypot((u - cx) * 1.7, v - cy);
      if (d < 0.035) return [92, 58, 24];
      if (d < 0.07) return [245, 190, 25];
      return [52, 120, 48];
    }
    if (v > fieldTop) return v > fieldTop + 0.06 ? [214, 168, 52] : [232, 196, 80];
    if (sun < 0.09) return [250, 214, 50];
    if (sun < 0.115) return [240, 140, 36];
    // Rays.
    const angle = Math.atan2(v - 0.3, u - 0.66);
    if (sun < 0.3 && Math.cos(angle * 12) > 0.6) return [246, 196, 70];
    return v < 0.3 ? [38, 96, 170] : [64, 128, 196];
  };
  for (let y = 0; y < h; y += tile)
    for (let x = 0; x < w; x += tile) {
      const [r, gr, b] = design(x + tile / 2, y + tile / 2);
      const k = 0.86 + 0.22 * rand();
      g.fillStyle = `rgb(${Math.min(255, r * k)},${Math.min(255, gr * k)},${Math.min(255, b * k)})`;
      g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  // Weathering: a few lost tiles and stains.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(150,145,135,0.9)';
    g.fillRect(Math.floor(rand() * 64) * tile, Math.floor(rand() * 38) * tile, tile, tile);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// The stop's sign: a blue square with a white bus, and under it a white
// plate with the village's name.
function signTexture(village) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#1f5fbf';
  g.beginPath();
  g.roundRect(8, 8, 240, 240, 14);
  g.fill();
  // The bus.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(48, 70, 160, 104, 14);
  g.fill();
  g.fillStyle = '#1f5fbf';
  for (const x of [62, 104, 146]) g.fillRect(x, 84, 34, 36);
  g.fillRect(188, 84, 8, 66);
  g.fillStyle = '#ffffff';
  for (const x of [84, 172]) {
    g.beginPath();
    g.arc(x, 180, 16, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#1f5fbf';
  for (const x of [84, 172]) {
    g.beginPath();
    g.arc(x, 180, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.strokeRect(12, 262, 232, 110);
  g.fillStyle = '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
  g.fillText('ЗУПИНКА', 128, 296);
  g.font = 'bold 38px "Helvetica Neue", Arial, sans-serif';
  g.fillText(`с. ${village}`, 128, 340);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shelter() {
  const { width, depth, height, village } = busStopLayout;
  const group = new THREE.Group();
  group.name = 'Bus stop';
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb4afa5, roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a4c4e, roughness: 0.6, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.8 });
  const mosaic = new THREE.MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.45 });
  const box = (w, h, d, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Local frame: x along the road, z away from it (the opening faces −z).
  box(width + 1.2, 0.12, depth + 1.4, concrete, 0, 0.06, depth / 2);
  box(width, height, 0.2, concrete, 0, height / 2, depth);
  // The mosaic on the wall's road side (−z face).
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.2, (width - 0.2) * (300 / 512)),
    mosaic
  );
  panel.rotation.y = Math.PI;
  panel.position.set(0, height * 0.55, depth - 0.101);
  group.add(panel);
  for (const side of [-1, 1])
    box(0.18, height, depth, concrete, side * (width / 2 - 0.09), height / 2, depth / 2);
  // A thick roof slab, overhanging toward the road, its edge tilted up.
  const roof = box(width + 0.8, 0.22, depth + 1.0, concrete, 0, height + 0.11, depth / 2 - 0.3);
  roof.rotation.x = -0.06;
  // The bench on two legs.
  box(width - 0.8, 0.05, 0.38, wood, 0, 0.46, depth - 0.35);
  for (const side of [-1, 1])
    box(0.08, 0.44, 0.3, dark, side * (width / 2 - 0.8), 0.22, depth - 0.35);
  // The bin by the front.
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 12), dark);
  bin.position.set(width / 2 + 0.35, 0.43, -0.2);
  group.add(bin);
  // The sign on its post, at the near corner.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 8), dark);
  post.position.set(-width / 2 - 0.6, 1.45, -0.4);
  group.add(post);
  // The sign faces the road (−z), turned a little toward the traffic
  // coming along it.
  const sign = new THREE.Group();
  sign.position.set(-width / 2 - 0.6, 2.4, -0.4);
  sign.rotation.y = -0.35;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.02), dark);
  plate.position.z = 0.045;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.9),
    new THREE.MeshStandardMaterial({ map: signTexture(village), roughness: 0.5 })
  );
  face.rotation.y = Math.PI;
  face.position.z = 0.034;
  sign.add(plate, face);
  group.add(sign);
  return group;
}

export function setupBusStops(scene) {
  const group = shelter();
  scene.add(group);
  const shadow = groupShadow(scene, group, 'Bus stop shadow');
  const { at, setback } = busStopLayout;
  return {
    group,
    // Places it at its nearest occurrence to x, with its shadow for the sun
    // (`sun` toward it, `strength` 0–1).
    update(x, sun = null, strength = 0) {
      const u = nearestOccurrence(x, at);
      const offset = branchOffset(u) ?? roadBranch.separation;
      const lateral = offset + roadBranch.halfWidth + setback;
      group.position.set(u, 0, roadCenterZ(u) + lateral);
      group.rotation.y = -Math.atan(roadCenterSlope(u));
      shadow.update(sun, strength);
    },
  };
}
