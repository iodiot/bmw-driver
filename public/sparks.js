import * as THREE from 'three';

// Sparks where the body scrapes a guardrail: short glowing streaks thrown
// along the car's motion and upward, falling under gravity, bouncing off the
// asphalt and cooling from white-yellow through orange to dull red.
export const sparkSettings = Object.freeze({ capacity: 600, maxRate: 2400, gravity: 9.81 });

// Spark emission per second for a contact: impacts burst, scraping streams.
export function sparkRate(contact) {
  if (!contact) return 0;
  // A steady stream while metal touches, a burst proportional to the impact.
  return Math.min(sparkSettings.maxRate, 40 + contact.impact * 500 + contact.scrape * 24);
}

// Colour of a spark by remaining life (1 = new, 0 = gone), additive RGB.
export function sparkColour(life) {
  const t = Math.max(0, Math.min(1, life));
  return [
    Math.min(1, 0.35 + 1.1 * t),
    Math.max(0, 1.15 * t * t - 0.05),
    Math.max(0, 0.9 * t * t * t - 0.2),
  ].map((v) => v * (0.25 + 0.75 * t));
}

export function setupSparks(scene) {
  const { capacity, gravity } = sparkSettings;
  const positions = new Float32Array(capacity * 6),
    colours = new Float32Array(capacity * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
  );
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage)
  );
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  lines.name = 'Guardrail sparks';
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  scene.add(lines);
  // Glowing heads: soft round sprites, so sparks read at any distance.
  const headPositions = new Float32Array(capacity * 3),
    headColours = new Float32Array(capacity * 3);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(headPositions, 3).setUsage(THREE.DynamicDrawUsage)
  );
  headGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(headColours, 3).setUsage(THREE.DynamicDrawUsage)
  );
  const glow = document.createElement('canvas');
  glow.width = glow.height = 32;
  const g = glow.getContext('2d'),
    gradient = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 32, 32);
  const heads = new THREE.Points(
    headGeometry,
    new THREE.PointsMaterial({
      size: 0.15,
      map: new THREE.CanvasTexture(glow),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  heads.name = 'Guardrail spark glow';
  heads.frustumCulled = false;
  heads.renderOrder = 5;
  scene.add(heads);
  const particles = Array.from({ length: capacity }, () => ({
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    span: 1,
  }));
  let next = 0,
    pending = 0,
    active = 0;
  function emit(contact) {
    const p = particles[next];
    next = (next + 1) % capacity;
    const carry = 0.25 + 0.55 * Math.random();
    const spread = 1.5 + 3.5 * Math.random(),
      angle = Math.random() * 2 * Math.PI;
    Object.assign(p, {
      alive: true,
      x: contact.x,
      // Where the bumper and flank rub the beam, so they show above it.
      y: 0.45 + 0.4 * Math.random(),
      z: contact.z - contact.side * 0.05,
      // Mostly with the car's motion, some back off the rail, some upward.
      vx: contact.velocityX * carry + Math.cos(angle) * spread,
      vy: 1.5 + 4 * Math.random(),
      vz: contact.velocityZ * carry + Math.sin(angle) * spread - contact.side * Math.random() * 2,
      span: 0.25 + 0.45 * Math.random(),
    });
    p.life = p.span;
  }
  return {
    lines,
    get active() {
      return active;
    },
    reset() {
      for (const p of particles) p.alive = false;
      pending = 0;
    },
    update(dt, contact, running = true) {
      dt = Math.min(dt, 1 / 15);
      if (running && contact) {
        pending += sparkRate(contact) * dt;
        while (pending >= 1) {
          emit(contact);
          pending--;
        }
      }
      active = 0;
      for (let i = 0; i < capacity; i++) {
        const p = particles[i],
          j = i * 6;
        if (p.alive && running) {
          p.life -= dt;
          p.vy -= gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.01) {
            p.y = 0.01;
            p.vy *= -0.3;
            p.vx *= 0.6;
            p.vz *= 0.6;
          }
          if (p.life <= 0) p.alive = false;
        }
        if (!p.alive) {
          colours.fill(0, j, j + 6);
          headColours.fill(0, i * 3, i * 3 + 3);
          continue;
        }
        active++;
        // A streak from the spark back along its motion.
        const tail = 0.045;
        positions[j] = p.x;
        positions[j + 1] = p.y;
        positions[j + 2] = p.z;
        positions[j + 3] = p.x - p.vx * tail;
        positions[j + 4] = p.y - p.vy * tail;
        positions[j + 5] = p.z - p.vz * tail;
        const [r, g, b] = sparkColour(p.life / p.span);
        colours[j] = r;
        colours[j + 1] = g;
        colours[j + 2] = b;
        colours[j + 3] = r * 0.5;
        colours[j + 4] = g * 0.35;
        colours[j + 5] = b * 0.2;
        headPositions.set([p.x, p.y, p.z], i * 3);
        headColours.set([r, g * 0.9, b * 0.8], i * 3);
      }
      lines.visible = heads.visible = active > 0;
      if (active > 0) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        headGeometry.attributes.position.needsUpdate = true;
        headGeometry.attributes.color.needsUpdate = true;
      }
    },
  };
}
