import * as THREE from 'three';
import { roadCenterZ, branchOffset, roadEdge } from './road-profile.js';
import { formatClock } from './time-of-day.js';

// The centre of the dashboard. The model shows a blurred portrait picture
// there; the F10 has a wide iDrive screen standing on the dashboard in a
// black bezel, with the centre stack below it (air vents and the climate
// panel). The screen shows a live navigation map of the road ahead, the
// country roads branching off and the car, beside the time, outside
// temperature and radio, redrawn a few times a second.
export const centreLayout = Object.freeze({
  // The model's centre picture (body space): top left, bottom left, top
  // right, bottom right as the driver sees it.
  corners: Object.freeze([
    Object.freeze([0.636, 0.406, -0.085]),
    Object.freeze([0.495, 0.17, -0.086]),
    Object.freeze([0.636, 0.406, 0.11]),
    Object.freeze([0.495, 0.171, 0.11]),
  ]),
  // The iDrive screen: 8.8-inch class, 8:3.
  screen: Object.freeze({ width: 0.3, height: 0.1125, pixels: [960, 360] }),
  refresh: 1 / 4,
  // Map scale (pixels per metre) and how far ahead the car sits.
  mapScale: 1.3,
});

// A quad from four corners (top left, bottom left, top right, bottom right).
function quad(corners, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      corners.flatMap((q) => q.toArray()),
      3
    )
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 1, 1, 0], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function canvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

// Centre stack: two vents under the screen, hazard switch, the climate
// panel with its temperature displays and a row of buttons.
function drawStack(ctx, w, h) {
  const panel = ctx.createLinearGradient(0, 0, 0, h);
  panel.addColorStop(0, '#15171a');
  panel.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, w, h);
  const vent = (x, y, vw, vh) => {
    ctx.fillStyle = '#050506';
    ctx.beginPath();
    ctx.roundRect(x, y, vw, vh, vw * 0.12);
    ctx.fill();
    ctx.strokeStyle = '#6d737a';
    ctx.lineWidth = w * 0.008;
    ctx.stroke();
    ctx.strokeStyle = '#2a2d31';
    ctx.lineWidth = w * 0.012;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x + vw * 0.08, y + (vh * i) / 6);
      ctx.lineTo(x + vw * 0.92, y + (vh * i) / 6);
      ctx.stroke();
    }
  };
  vent(w * 0.06, h * 0.05, w * 0.38, h * 0.22);
  vent(w * 0.56, h * 0.05, w * 0.38, h * 0.22);
  // Hazard switch between the vents.
  ctx.fillStyle = '#1f2226';
  ctx.beginPath();
  ctx.roundRect(w * 0.455, h * 0.11, w * 0.09, h * 0.08, w * 0.015);
  ctx.fill();
  ctx.strokeStyle = '#d63a2c';
  ctx.lineWidth = w * 0.01;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.125);
  ctx.lineTo(w * 0.525, h * 0.175);
  ctx.lineTo(w * 0.475, h * 0.175);
  ctx.closePath();
  ctx.stroke();
  // Climate panel: chrome-edged strip with two temperature displays.
  const top = h * 0.36;
  ctx.fillStyle = '#1a1c20';
  ctx.beginPath();
  ctx.roundRect(w * 0.04, top, w * 0.92, h * 0.26, w * 0.03);
  ctx.fill();
  ctx.strokeStyle = '#8b9198';
  ctx.lineWidth = w * 0.007;
  ctx.stroke();
  ctx.font = `600 ${Math.round(h * 0.055)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [x, t] of [
    [0.2, '21.5'],
    [0.8, '21.0'],
  ]) {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(w * (x - 0.11), top + h * 0.03, w * 0.22, h * 0.08);
    ctx.fillStyle = '#ff9a3c';
    ctx.fillText(t, w * x, top + h * 0.07);
  }
  ctx.fillStyle = '#c8ccd1';
  ctx.font = `600 ${Math.round(h * 0.035)}px "Helvetica Neue", Arial, sans-serif`;
  ['AUTO', 'A/C', 'MAX', 'REST', 'OFF'].forEach((label, i) => {
    const x = w * (0.14 + i * 0.18);
    ctx.fillStyle = '#26292e';
    ctx.beginPath();
    ctx.roundRect(x - w * 0.075, top + h * 0.15, w * 0.15, h * 0.075, w * 0.012);
    ctx.fill();
    ctx.fillStyle = '#c8ccd1';
    ctx.fillText(label, x, top + h * 0.188);
  });
  // Radio buttons and a CD slot below.
  ctx.fillStyle = '#050506';
  ctx.fillRect(w * 0.2, h * 0.7, w * 0.6, h * 0.012);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = '#23262a';
    ctx.beginPath();
    ctx.roundRect(w * (0.08 + i * 0.107), h * 0.76, w * 0.085, h * 0.05, w * 0.01);
    ctx.fill();
  }
}

// Map position of a world point relative to the car, heading up.
export function mapPoint(simulation, x, z, scale, cx, cy) {
  const dx = x - simulation.x,
    dz = z - simulation.z;
  const c = Math.cos(simulation.heading),
    s = Math.sin(simulation.heading);
  // Forward is (cos h, -sin h) in x/z; right is (sin h, cos h).
  const forward = dx * c - dz * s,
    right = dx * s + dz * c;
  return [cx + right * scale, cy - forward * scale];
}

function drawScreen(ctx, w, h, simulation, hours, raining) {
  // Map on the left two thirds, in iDrive's night-blue style.
  const mapW = w * 0.66;
  ctx.fillStyle = '#0c1724';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, mapW, h);
  ctx.clip();
  // Fields: faint parcels.
  ctx.strokeStyle = 'rgba(70,110,140,0.18)';
  ctx.lineWidth = 1;
  for (let i = -6; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 60, 0);
    ctx.lineTo(i * 60 - 80, h);
    ctx.stroke();
  }
  const { mapScale } = centreLayout,
    cx = mapW / 2,
    cy = h * 0.78;
  const line = (lateral, from, to, width, colour) => {
    ctx.beginPath();
    let drawing = false;
    for (let x = from; x <= to; x += 4) {
      const l = typeof lateral === 'function' ? lateral(x) : lateral;
      if (l === null) {
        drawing = false;
        continue;
      }
      const [px, py] = mapPoint(simulation, x, roadCenterZ(x) + l, mapScale, cx, cy);
      if (drawing) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      drawing = true;
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const from = simulation.x - 120,
    to = simulation.x + 320;
  // Country roads, the motorway, and the route along it.
  line(branchOffset, from, to, 4.4 * mapScale + 3, '#8a7a5c');
  line(0, from, to, (2 * roadEdge + 2) * mapScale + 4, '#c9d3dc');
  line(0, from, to, 2 * roadEdge * mapScale, '#e6ebf0');
  line(0, simulation.x, to, 3.6 * mapScale + 4, '#2d8cff');
  // The car: a white arrowhead.
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0c1724';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(12, 14);
  ctx.lineTo(0, 7);
  ctx.lineTo(-12, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Top bar.
  ctx.fillStyle = 'rgba(6,12,20,0.85)';
  ctx.fillRect(0, 0, w, h * 0.13);
  ctx.fillStyle = '#e8eef4';
  ctx.font = `500 ${Math.round(h * 0.075)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Navigation', w * 0.025, h * 0.066);
  ctx.textAlign = 'right';
  ctx.fillText(formatClock(hours), w * 0.975, h * 0.066);
  // Right pane: time, outside temperature, radio.
  ctx.fillStyle = '#101d2c';
  ctx.fillRect(mapW, h * 0.13, w - mapW, h * 0.87);
  ctx.fillStyle = '#2a3c50';
  ctx.fillRect(mapW, h * 0.13, 2, h * 0.87);
  const px = mapW + (w - mapW) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `300 ${Math.round(h * 0.2)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(formatClock(hours), px, h * 0.36);
  ctx.fillStyle = '#9fb3c6';
  ctx.font = `400 ${Math.round(h * 0.07)}px "Helvetica Neue", Arial, sans-serif`;
  const temperature = Math.round(
    14 + 9 * Math.sin((Math.PI * (hours - 9)) / 12) - (raining ? 4 : 0)
  );
  ctx.fillText(`${temperature} °C  ${raining ? 'Rain' : 'Clear'}`, px, h * 0.53);
  ctx.fillStyle = '#e8eef4';
  ctx.fillText('FM 101.5', px, h * 0.72);
  ctx.fillStyle = '#5f7a93';
  ctx.fillText('Radio', px, h * 0.84);
}

export function setupCentreDisplay(rig) {
  const { corners, screen, refresh } = centreLayout;
  const body = rig.body;
  // The model's centre picture is its own mesh (beside the cluster, which
  // cockpit-cluster.js replaced): hide it entirely.
  const old = body.getObjectByName('Object_31');
  if (old) old.visible = false;
  const p = corners.map((c) => new THREE.Vector3(...c));
  const up = p[0].clone().sub(p[1]).normalize(),
    right = p[2].clone().sub(p[0]).normalize(),
    normal = new THREE.Vector3().crossVectors(right, up).normalize();
  if (normal.x > 0) normal.negate();
  // Centre stack on the old picture's place.
  const stack = canvasTexture(320, 450);
  drawStack(stack.ctx, 320, 450);
  stack.texture.needsUpdate = true;
  const stackMesh = quad(
    p.map((q) => q.clone().addScaledVector(normal, 0.0015)),
    new THREE.MeshStandardMaterial({
      name: 'Centre stack',
      map: stack.texture,
      roughness: 0.45,
      metalness: 0.2,
    })
  );
  stackMesh.name = 'Centre stack';
  // The iDrive screen standing on the dashboard above it, in a bezel.
  const topCentre = p[0].clone().add(p[2]).multiplyScalar(0.5);
  const screenCentre = topCentre
    .clone()
    .addScaledVector(up, screen.height * 0.32)
    .addScaledVector(normal, 0.012);
  const hw = screen.width / 2,
    hh = screen.height / 2;
  const corner = (sx, sy) =>
    screenCentre
      .clone()
      .addScaledVector(right, sx * hw)
      .addScaledVector(up, sy * hh);
  const display = canvasTexture(...screen.pixels);
  const screenMesh = quad(
    [corner(-1, 1), corner(-1, -1), corner(1, 1), corner(1, -1)],
    new THREE.MeshBasicMaterial({ name: 'iDrive screen', map: display.texture, color: 0xd8d8d8 })
  );
  screenMesh.name = 'iDrive screen';
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(screen.width + 0.014, screen.height + 0.014, 0.012),
    new THREE.MeshStandardMaterial({ name: 'Screen bezel', color: 0x07080a, roughness: 0.25 })
  );
  bezel.position.copy(screenCentre).addScaledVector(normal, -0.0065);
  bezel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  const group = new THREE.Group();
  group.name = 'Centre display';
  group.add(stackMesh, bezel, screenMesh);
  body.add(group);
  let elapsed = Infinity;
  return {
    group,
    update(dt, simulation, { hours = 13, raining = false, night = false } = {}) {
      screenMesh.material.color.setScalar(night ? 0.6 : 0.85);
      elapsed += dt;
      if (elapsed < refresh || !simulation) return;
      elapsed = 0;
      drawScreen(display.ctx, ...screen.pixels, simulation, hours, raining);
      display.texture.needsUpdate = true;
    },
  };
}
