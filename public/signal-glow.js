import * as THREE from 'three';
import { rearGlowStrength } from './rear-glow.js';

// Amber light from the turn signals on the road beside the car, flashing
// with them at dusk and night: a soft additive patch along each side, from
// the front corner lamp, the one under the mirror and the rear lamp, as the
// tail lamps' red glow is laid behind (see rear-glow.js).
export const signalGlowLayout = Object.freeze({
  // Car-space: the patch's length along the car and how far out it reaches
  // from the side, and the lamps along it (x, and how strong).
  length: 6.4,
  reach: 2.4,
  side: 0.8,
  lamps: Object.freeze([
    Object.freeze([2.25, 1]),
    Object.freeze([0.9, 0.45]),
    Object.freeze([-2.3, 0.9]),
  ]),
});

function glowTexture() {
  const { length, reach, lamps } = signalGlowLayout;
  const scale = 40,
    w = Math.round(length * scale),
    h = Math.round(reach * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      // Along the car (front at the right edge) and out from its side.
      const along = px / scale - length / 2,
        out = py / scale;
      let glow = 0;
      for (const [x, strength] of lamps)
        glow += strength * Math.exp(-(((along - x) / 0.9) ** 2) - (out / 0.85) ** 2);
      const u = px / (w - 1),
        v = py / (h - 1);
      const fade = smooth(u / 0.12) * smooth((1 - u) / 0.12) * smooth((1 - v) / 0.35);
      const i = (py * w + px) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * Math.min(1, glow * 0.8) * fade);
    }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function setupSignalGlow(scene) {
  const { length, reach, side } = signalGlowLayout;
  const texture = glowTexture();
  const sides = [-1, 1].map((sign) => {
    const material = new THREE.MeshBasicMaterial({
      name: 'Turn signal glow',
      map: texture,
      color: new THREE.Color(1, 0.42, 0.03),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      toneMapped: false,
      fog: false,
      // (The left one is mirrored.)
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(length, reach);
    // Out from the side: the texture's top row lies along the car.
    geometry.translate(0, -reach / 2, 0);
    geometry.rotateX(-Math.PI / 2);
    if (sign < 0) geometry.scale(1, 1, -1);
    geometry.translate(0, 0, sign * side);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = sign < 0 ? 'Left signal glow' : 'Right signal glow';
    mesh.renderOrder = 3;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, material, level: 0 };
  });
  return {
    meshes: sides.map((s) => s.mesh),
    // `left`, `right`: whether each side's lamps are lit now.
    update(dt, simulation, darkness, { left = false, right = false } = {}) {
      [left, right].forEach((on, i) => {
        const s = sides[i];
        // The bulbs come up and fade in a few hundredths of a second.
        s.level += ((on ? 1 : 0) - s.level) * (1 - Math.exp(-dt / 0.04));
        const strength = rearGlowStrength(darkness, s.level, 0);
        s.mesh.visible = strength > 0.005;
        if (!s.mesh.visible) return;
        s.material.opacity = 0.55 * strength;
        s.mesh.position.set(simulation.x, 0.016, simulation.z);
        s.mesh.rotation.y = simulation.heading;
      });
    },
  };
}
