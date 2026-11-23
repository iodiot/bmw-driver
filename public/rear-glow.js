import * as THREE from 'three';

// Red light from the tail lamps on the road behind the car, at dusk and
// night: a soft additive patch spreading back from each lamp, brighter while
// braking. A patch on the road costs one small draw; two more real lights
// would add their cost to every lit surface in the scene.
export const rearGlowLayout = Object.freeze({
  // Car-space x of the rear bumper and how far back the glow reaches (m).
  // (A little under the car, so the glow grows out from under the bumper.)
  rear: -2.1,
  reach: 4.2,
  width: 3.4,
  lampOffset: 0.62,
});

// Glow strength (0…1) for how dark it is and how bright the lamps are
// (0 = off, 1 = full brake light).
// `idle`: the share with the lamps at rest (none for the reversing lamps).
export function rearGlowStrength(darkness, lamp, idle = 0.35) {
  const dark = Math.max(0, Math.min(1, (darkness - 0.2) / 0.6));
  return dark * (idle + (1 - idle) * Math.max(0, Math.min(1, lamp)));
}

// `colour` of the light (red for the tail lamps, white for reversing) and
// its share at rest.
export function setupRearGlow(
  scene,
  { colour = new THREE.Color(1, 0.06, 0.03), idle = 0.35, name = 'Tail lamp glow' } = {}
) {
  const { rear, reach, width, lampOffset } = rearGlowLayout;
  const scale = 48,
    w = Math.round(reach * scale),
    h = Math.round(width * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Computed per pixel: a soft spot spreading back from each lamp, times a
  // window that reaches exactly zero at every edge of the patch, so its
  // outline never shows on the road.
  const image = ctx.createImageData(w, h);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const back = (w - px) / scale, // metres behind the bumper
        across = (h / 2 - py) / scale;
      let glow = 0;
      for (const z of [-lampOffset, lampOffset])
        glow += Math.exp(-((back / 1.5) ** 2) - ((across - z) / 0.42) ** 2);
      const u = px / (w - 1),
        v = py / (h - 1);
      const fade =
        smooth(u / 0.35) * smooth((1 - u) / 0.14) * smooth(v / 0.3) * smooth((1 - v) / 0.3);
      const i = (py * w + px) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * Math.min(1, glow * 0.7) * fade);
    }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    name,
    map: texture,
    color: colour,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    toneMapped: false,
    fog: false,
  });
  const geometry = new THREE.PlaneGeometry(reach, width);
  // The plane's +x edge is the bumper; it extends backward from there.
  geometry.translate(-reach / 2, 0, 0);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = 3;
  mesh.visible = false;
  scene.add(mesh);
  const offset = new THREE.Vector3();
  return {
    mesh,
    update(simulation, darkness, lamp) {
      const strength = rearGlowStrength(darkness, lamp, idle);
      mesh.visible = strength > 0.005;
      if (!mesh.visible) return;
      material.opacity = 0.45 * strength;
      offset.set(rear, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, simulation.heading);
      mesh.position.set(simulation.x + offset.x, 0.014, simulation.z + offset.z);
      mesh.rotation.y = simulation.heading;
    },
  };
}
