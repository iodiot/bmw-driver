import * as THREE from 'three';
import { canvasTexture } from './build-kit.js';
import { clearOfServiceLane, roadCenterZ, roadCenterSlope } from './road-profile.js';

// On the route, the real places along the M-06 by name, as Ukrainian signs
// show them: a white board with the name where the road enters a village it
// runs through, and the same crossed out in red where it leaves; for a
// village off to one side, a blue sign with its name and an arrow toward
// it. Each stands on the right verge facing the traffic toward Kyiv.
export const routeSignLayout = Object.freeze({
  // Entry and exit this far either side of the place.
  reach: 380,
  // A side village's sign this far before it.
  ahead: 250,
  lateral: 9.4,
  // Signs are only drawn this near the car.
  near: 900,
});

// Where each sign stands and what it shows.
export function routeSigns(places) {
  const { reach, ahead } = routeSignLayout;
  const out = [];
  for (const p of places) {
    if (p.through) {
      out.push({ at: p.at - reach, kind: 'enter', name: p.name });
      out.push({ at: p.at + reach, kind: 'leave', name: p.name });
    } else out.push({ at: p.at - ahead, kind: 'turn', name: p.name, side: p.side });
  }
  return out.filter((s) => s.at > 20).sort((a, b) => a.at - b.at);
}

function face(kind, name, side) {
  return canvasTexture(512, 160, (g, w, h) => {
    const blue = kind === 'turn';
    g.fillStyle = blue ? '#1f4fa8' : '#f6f6f2';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = blue ? '#ffffff' : '#1b1b1b';
    g.lineWidth = 10;
    g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = blue ? '#ffffff' : '#141414';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    let size = 74;
    const font = () => `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
    g.font = font();
    const room = blue ? w - 150 : w - 60;
    while (g.measureText(name).width > room && size > 34) {
      size -= 2;
      g.font = font();
    }
    const x = blue ? (side === 'left' ? w / 2 + 40 : w / 2 - 40) : w / 2;
    g.fillText(name, x, h / 2 + 4);
    if (blue) {
      // The arrow toward it.
      const ax = side === 'left' ? 62 : w - 62,
        dir = side === 'left' ? -1 : 1;
      g.beginPath();
      g.moveTo(ax + dir * 34, h / 2);
      g.lineTo(ax - dir * 6, h / 2 - 32);
      g.lineTo(ax - dir * 6, h / 2 - 12);
      g.lineTo(ax - dir * 34, h / 2 - 12);
      g.lineTo(ax - dir * 34, h / 2 + 12);
      g.lineTo(ax - dir * 6, h / 2 + 12);
      g.lineTo(ax - dir * 6, h / 2 + 32);
      g.closePath();
      g.fill();
    }
    if (kind === 'leave') {
      // Crossed out: leaving the village.
      g.strokeStyle = '#d3242c';
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(30, h - 24);
      g.lineTo(w - 30, 24);
      g.stroke();
    }
  });
}

export function setupRouteSigns(scene, route) {
  const group = new THREE.Group();
  group.name = 'Route signs';
  scene.add(group);
  const post = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8);
  post.translate(0, 1.2, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.5, roughness: 0.5 });
  const back = new THREE.MeshStandardMaterial({ color: 0x5f6468, roughness: 0.7 });
  const board = new THREE.PlaneGeometry(2.1, 0.66);
  // Facing the traffic (along −x).
  board.rotateY(-Math.PI / 2);
  const backing = new THREE.BoxGeometry(0.03, 0.68, 2.12);
  // And Kyiv's own at its edge, where the drive ends.
  const specs = [
    ...routeSigns(route.places),
    { at: route.length - 150, kind: 'enter', name: route.to },
  ];
  const signs = specs.map((spec) => {
    const sign = new THREE.Group();
    sign.name = `Route sign ${spec.name}`;
    for (const z of [-0.75, 0.75]) {
      const p = new THREE.Mesh(post, steel);
      p.position.set(0.03, 0, z);
      sign.add(p);
    }
    const panel = new THREE.Mesh(
      board,
      new THREE.MeshStandardMaterial({ map: face(spec.kind, spec.name, spec.side), roughness: 0.6 })
    );
    panel.position.y = 2.2;
    const rear = new THREE.Mesh(backing, back);
    rear.position.set(0.03, 2.2, 0);
    sign.add(panel, rear);
    sign.visible = false;
    const x = spec.at,
      // (Beyond the service lane where it runs there.)
      lateral = clearOfServiceLane(x, routeSignLayout.lateral + (spec.kind === 'turn' ? 0.6 : 0));
    sign.position.set(x, 0, roadCenterZ(x) + lateral);
    sign.rotation.y = -Math.atan(roadCenterSlope(x));
    group.add(sign);
    return { spec, sign };
  });
  return {
    signs,
    // Shows those near x.
    update(x) {
      for (const { spec, sign } of signs)
        sign.visible = spec.at > x - 150 && spec.at < x + routeSignLayout.near;
    },
  };
}
