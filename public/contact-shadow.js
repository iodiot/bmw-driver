import * as THREE from 'three';

// Soft ambient-occlusion shadow under the car, with darker contact patches at
// the tyres. It sits just above the road and follows position and heading,
// but not body roll or pitch: the ground does not tilt with the car.
export const contactShadowSize = Object.freeze({ length: 5.7, width: 2.7 });

export function drawContactShadow(ctx, layout, size = contactShadowSize, scale = 64) {
  const w = size.length * scale,
    h = size.width * scale;
  ctx.clearRect(0, 0, w, h);
  const toPx = (x, z) => [w / 2 + x * scale, h / 2 - z * scale];
  // Broad occlusion under the body: a soft rounded rectangle.
  ctx.save();
  ctx.filter = `blur(${0.28 * scale}px)`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(
    w / 2 - 2.32 * scale,
    h / 2 - 0.86 * scale,
    4.64 * scale,
    1.72 * scale,
    0.5 * scale
  );
  ctx.fill();
  ctx.restore();
  // Tight, darker contact under each tyre.
  for (const wheel of layout) {
    const [x, y] = toPx(wheel.x, wheel.z);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 0.42 * scale);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 0.42 * scale, 0.24 * scale, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function setupContactShadow(scene, layout) {
  const { length, width } = contactShadowSize,
    scale = 64;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(length * scale);
  canvas.height = Math.round(width * scale);
  drawContactShadow(canvas.getContext('2d'), layout, contactShadowSize, scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    name: 'Contact shadow',
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, width), material);
  mesh.name = 'Contact shadow';
  mesh.rotation.order = 'YXZ';
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return {
    mesh,
    setNight(night) {
      material.opacity = night ? 0.8 : 1;
    },
    update(simulation) {
      mesh.position.set(simulation.x, 0.012, simulation.z);
      mesh.rotation.y = simulation.heading;
    },
  };
}
