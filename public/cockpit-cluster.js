import * as THREE from 'three';

// The instrument cluster inside the car. The model shows it as a small,
// blurred picture; it is replaced by a sharp display drawn here, in the
// style of the European F10 M5 cluster: a 0–330 km/h speedometer and a
// tachometer to 8000 rpm with its red zone, white markings on black, orange
// needles and the gear between them. Dials are drawn once; the needles and
// gear are redrawn a few times a second.
export const clusterLayout = Object.freeze({
  // The model's cluster face (body space): top left, bottom left, top right,
  // bottom right as the driver sees it.
  corners: Object.freeze([
    Object.freeze([0.645, 0.393, -0.586]),
    Object.freeze([0.57, 0.27, -0.586]),
    Object.freeze([0.646, 0.394, -0.225]),
    Object.freeze([0.57, 0.27, -0.225]),
  ]),
  width: 900,
  height: 360,
  speedMax: 330,
  rpmMax: 8,
  redline: 7.2,
  refresh: 1 / 15,
});

// Needle angle (radians, canvas convention) for a dial value: 0 at lower
// left, full scale at lower right, sweeping 270° clockwise over the top.
export function dialAngle(value, max) {
  const t = Math.max(0, Math.min(1, value / max));
  return Math.PI * 0.75 + t * Math.PI * 1.5;
}

function drawDial(ctx, cx, cy, r, { max, major, minor, labels, red = null }) {
  // Face and chrome ring.
  const face = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  face.addColorStop(0, '#1b1f25');
  face.addColorStop(1, '#07080a');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.lineWidth = r * 0.035;
  ctx.strokeStyle = '#9aa3ad';
  ctx.stroke();
  if (red !== null) {
    ctx.strokeStyle = '#d3242b';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, dialAngle(red, max), dialAngle(max, max));
    ctx.stroke();
  }
  // Ticks.
  for (let v = 0; v <= max + 1e-9; v += minor) {
    const a = dialAngle(v, max),
      isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const inner = r * (isMajor ? 0.78 : 0.84);
    ctx.strokeStyle = red !== null && v >= red ? '#ff5a5a' : '#f2f4f6';
    ctx.lineWidth = r * (isMajor ? 0.03 : 0.014);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  // Numerals.
  ctx.fillStyle = '#f2f4f6';
  ctx.font = `600 ${Math.round(r * 0.15)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [v, text] of labels) {
    const a = dialAngle(v, max);
    ctx.fillText(text, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
  }
}

function drawNeedle(ctx, cx, cy, r, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(255,110,40,0.8)';
  ctx.shadowBlur = r * 0.06;
  ctx.fillStyle = '#ff5a1f';
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.022);
  ctx.lineTo(r * 0.9, -r * 0.006);
  ctx.lineTo(r * 0.9, r * 0.006);
  ctx.lineTo(-r * 0.12, r * 0.022);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#16191d';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.075, 0, 2 * Math.PI);
  ctx.fill();
}

export function setupCockpitCluster(rig) {
  const { corners, width, height, speedMax, rpmMax, redline, refresh } = clusterLayout;
  const body = rig.body;
  // Hide the model's cluster picture (its own mesh also carries the centre
  // screen, which stays).
  body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const old = body.getObjectByName('Object_31');
  if (old?.geometry.index) {
    const matrix = new THREE.Matrix4().multiplyMatrices(toBody, old.matrixWorld),
      position = old.geometry.attributes.position,
      index = old.geometry.index,
      v = new THREE.Vector3(),
      kept = [];
    for (let i = 0; i < index.count; i += 3) {
      let z = 0;
      for (let j = 0; j < 3; j++)
        z += v.fromBufferAttribute(position, index.getX(i + j)).applyMatrix4(matrix).z;
      if (z / 3 > -0.2) kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    old.geometry.setIndex(kept);
  }
  // Static dial faces, drawn once.
  const r = height * 0.44,
    left = [width * 0.25, height * 0.52],
    right = [width * 0.75, height * 0.52];
  const dials = document.createElement('canvas');
  dials.width = width;
  dials.height = height;
  const d = dials.getContext('2d');
  d.fillStyle = '#030405';
  d.fillRect(0, 0, width, height);
  drawDial(d, ...left, r, {
    max: speedMax,
    major: 30,
    minor: 10,
    labels: Array.from({ length: 12 }, (_, i) => [i * 30, String(i * 30)]),
  });
  drawDial(d, ...right, r, {
    max: rpmMax,
    major: 1,
    minor: 0.25,
    red: redline,
    labels: Array.from({ length: 9 }, (_, i) => [i, String(i)]),
  });
  d.fillStyle = '#9aa3ad';
  d.font = `500 ${Math.round(r * 0.09)}px "Helvetica Neue", Arial, sans-serif`;
  d.textAlign = 'center';
  d.fillText('km/h', left[0], left[1] + r * 0.32);
  d.fillText('1/min ×1000', right[0], right[1] + r * 0.32);
  // M stripes under the tachometer.
  ['#81c4ff', '#16588e', '#e7222e'].forEach((c, i) => {
    d.fillStyle = c;
    d.fillRect(right[0] - r * 0.15 + i * r * 0.1, right[1] + r * 0.45, r * 0.08, r * 0.05);
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // The face, just in front of the model's cluster, facing the driver.
  const p = corners.map((c) => new THREE.Vector3(...c));
  const normal = new THREE.Vector3()
    .crossVectors(p[1].clone().sub(p[0]), p[2].clone().sub(p[0]))
    .normalize();
  if (normal.x > 0) normal.negate();
  for (const q of p) q.addScaledVector(normal, 0.002);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      p.flatMap((q) => q.toArray()),
      3
    )
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 1, 1, 0], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    name: 'Instrument cluster display',
    map: texture,
    color: 0xd8d8d8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Instrument cluster display';
  body.add(mesh);
  // The dials stand out in chrome rings, each in a short black tube, rather
  // than lying flat on the display.
  const [tl, bl, tr, br] = p;
  const across = br.clone().sub(bl),
    upward = tl.clone().sub(bl);
  const ringRadius = upward.length() * 0.44 * 1.03;
  const chrome = new THREE.MeshStandardMaterial({
    name: 'Dial chrome',
    color: 0xc9cdd2,
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 0.6,
  });
  const tube = new THREE.MeshStandardMaterial({
    name: 'Dial tube',
    color: 0x07080a,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const facing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  for (const u of [0.25, 0.75]) {
    const centre = bl.clone().addScaledVector(across, u).addScaledVector(upward, 0.48);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.0032, 10, 64), chrome);
    ring.position.copy(centre).addScaledVector(normal, 0.012);
    ring.quaternion.copy(facing);
    ring.name = 'Dial ring';
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(ringRadius, ringRadius, 0.012, 48, 1, true),
      tube
    );
    sleeve.position.copy(centre).addScaledVector(normal, 0.006);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    sleeve.name = 'Dial tube';
    body.add(ring, sleeve);
  }
  let elapsed = Infinity;
  function draw(speedKmh, rpm, gear) {
    ctx.drawImage(dials, 0, 0);
    drawNeedle(ctx, ...left, r, dialAngle(speedKmh, speedMax));
    drawNeedle(ctx, ...right, r, dialAngle(rpm / 1000, rpmMax));
    ctx.fillStyle = '#f4f6f8';
    ctx.font = `700 ${Math.round(r * 0.32)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gear, width / 2, height * 0.5);
    ctx.fillStyle = '#9aa3ad';
    ctx.font = `600 ${Math.round(r * 0.1)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText('M DCT', width / 2, height * 0.5 + r * 0.26);
    ctx.fillText(`${Math.round(speedKmh)}`, width / 2, height * 0.5 - r * 0.32);
    texture.needsUpdate = true;
  }
  draw(0, 0, 'D1');
  return {
    mesh,
    // `visible`: seen from the driver's seat; from outside the canvas is
    // neither redrawn nor uploaded.
    update(dt, simulation, night = false, visible = true) {
      material.color.setScalar(night ? 0.62 : 0.85);
      elapsed += dt;
      if (elapsed < refresh || !simulation || !visible) return;
      elapsed = 0;
      draw(
        simulation.speed * 3.6,
        simulation.powertrain.rpm,
        simulation.gearLabel ?? `D${simulation.powertrain.gear}`
      );
    },
  };
}
