import * as THREE from 'three';

// Flashing the headlights, seen from outside by day as well as at night: a
// soft additive fan of white light thrown on the road ahead of the car for
// each blink, from the two lamps outward, brightest some ten metres ahead
// and fading out by about forty-five (at night the main beam itself shows
// it, and the fan only adds a little).
export const beamFlashLayout = Object.freeze({
  // Car space: from just ahead of the bumper, this far along and this wide.
  start: 2.2,
  length: 46,
  width: 15,
});

function fanTexture() {
  const { length, width } = beamFlashLayout;
  const w = Math.round(length * 7),
    h = Math.round(width * 12);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const along = (px / (w - 1)) * length,
        across = (py / (h - 1) - 0.5) * width;
      // Each lamp's cone widening ahead, the two merging into one.
      const spread = 0.7 + along * 0.17;
      let glow = 0;
      for (const lamp of [-0.7, 0.7])
        glow += Math.exp(-(((across - lamp * Math.max(0, 1 - along / 14)) / spread) ** 2) * 1.6);
      glow *= smooth(along / 6) * Math.exp(-along / 20);
      const fade =
        smooth((1 - px / (w - 1)) / 0.25) *
        smooth(py / (h - 1) / 0.2) *
        smooth((1 - py / (h - 1)) / 0.2);
      const i = (py * w + px) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 250;
      image.data[i + 2] = 238;
      image.data[i + 3] = Math.round(255 * Math.min(1, glow * 0.75) * fade);
    }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function setupBeamFlash(scene) {
  const { start, length, width } = beamFlashLayout;
  const material = new THREE.MeshBasicMaterial({
    name: 'Headlight flash',
    map: fanTexture(),
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
  const geometry = new THREE.PlaneGeometry(length, width);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(start + length / 2, 0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Headlight flash';
  mesh.renderOrder = 3;
  mesh.visible = false;
  scene.add(mesh);
  let level = 0;
  return {
    mesh,
    // `lit`: the main beam flashed on now; `darkness` 0 (day) to 1.
    update(dt, simulation, darkness, lit) {
      // The lamps come up and die away in a few hundredths of a second.
      level += ((lit ? 1 : 0) - level) * (1 - Math.exp(-dt / 0.035));
      const strength = level * (0.5 * (1 - darkness) + 0.12);
      mesh.visible = strength > 0.005;
      if (!mesh.visible) return;
      material.opacity = strength;
      mesh.position.set(simulation.x, 0.02, simulation.z);
      mesh.rotation.y = simulation.heading;
    },
  };
}
