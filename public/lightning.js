import * as THREE from 'three';

// Lightning in a thunderstorm. Strikes come every few seconds at random,
// from a few hundred metres to a few kilometres away. Each lights the sky
// and the scene in two or three flickers, a near one shows its bolt, and
// its thunder follows at the speed of sound: a crack if it was close, a
// long rumble whatever the distance.
export const lightningTiming = Object.freeze({
  // Seconds between strikes while the storm is at its height.
  gap: Object.freeze([3.5, 12]),
  // Metres to a strike.
  distance: Object.freeze([350, 4000]),
  // Bolts are seen out to here (beyond, only their glow in the clouds).
  boltRange: 2200,
  speedOfSound: 343,
});

// The flash's brightness `t` seconds into a strike: a return stroke and one
// or two re-strikes, each a sharp peak dying away.
export function flashEnvelope(t, strokes) {
  let level = 0;
  for (const [at, peak] of strokes) {
    const s = t - at;
    if (s < 0) continue;
    level = Math.max(level, peak * (s < 0.012 ? s / 0.012 : Math.exp(-(s - 0.012) / 0.07)));
  }
  return level;
}

// How bright a strike at `distance` metres looks (1 overhead), and how loud
// its thunder (0–1).
export const strikeBrightness = (distance) => 1 / (1 + (distance / 900) ** 1.3);
export const thunderLoudness = (distance) =>
  Math.min(1, 0.15 + 0.85 / (1 + (distance / 1600) ** 1.4));

// A jagged channel from the cloud base to the ground, in a vertical plane:
// [x, y] points, with branches as separate runs. x across, y up (0 to 1).
export function boltPaths(random) {
  const runs = [];
  const grow = (x, y, toY, spread, depth) => {
    const run = [[x, y]];
    while (y > toY) {
      y -= 0.025 + random() * 0.05;
      x += (random() - 0.5) * spread;
      run.push([x, Math.max(y, toY)]);
      if (depth < 2 && random() < 0.12 - depth * 0.05)
        grow(x, y, Math.max(0, y - 0.12 - random() * 0.25), spread * 1.2, depth + 1);
    }
    runs.push({ points: run, depth });
  };
  grow(0, 1, 0, 0.09, 0);
  return runs;
}

// Ribbons along the bolt's runs, facing along +z, `width` units wide (the
// main channel; branches thinner). Each vertex carries a brightness.
function boltGeometry(runs, height, width) {
  const positions = [],
    shades = [],
    sides = [],
    index = [];
  for (const { points, depth } of runs) {
    const w = (width * (depth ? 0.45 : 1)) / 2,
      shade = depth ? 0.55 : 1;
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      const [x0, y0] = points[Math.max(0, i - 1)],
        [x1, y1] = points[Math.min(points.length - 1, i + 1)];
      let nx = -(y1 - y0) * height,
        ny = (x1 - x0) * height;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const base = positions.length / 3;
      positions.push(
        x * height - nx * w,
        y * height - ny * w,
        0,
        x * height + nx * w,
        y * height + ny * w,
        0
      );
      // Branches fade toward their tips.
      const fade = depth ? 1 - i / points.length : 1;
      shades.push(shade * fade, shade * fade);
      sides.push(-1, 1);
      if (i) index.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('shade', new THREE.Float32BufferAttribute(shades, 1));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setIndex(index);
  return geometry;
}

export function setupLightning(scene, { random = Math.random, onThunder = () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Lightning';
  group.visible = false;
  // Drawn after the sky (which draws last of the opaque scene), unfogged.
  group.renderOrder = 1001;
  scene.add(group);
  const materials = [0, 1].map(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { brightness: { value: 0 }, colour: { value: new THREE.Color() } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
        vertexShader: `
        attribute float shade;
        attribute float side;
        varying float vShade;
        varying float vSide;
        void main() {
          vShade = shade;
          vSide = side;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
        fragmentShader: `
        uniform float brightness;
        uniform vec3 colour;
        varying float vShade;
        varying float vSide;
        void main() {
          // Brightest along the channel, fading to its edges.
          float across = 1. - abs(vSide);
          gl_FragColor = vec4(colour * brightness * vShade * across * across, 1.);
        }
      `,
      })
  );
  materials[0].uniforms.colour.value.setRGB(0.95, 0.97, 1.4);
  materials[1].uniforms.colour.value.setRGB(0.35, 0.4, 0.85);
  const coreMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials[0]),
    glowMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials[1]);
  for (const m of [coreMesh, glowMesh]) {
    m.frustumCulled = false;
    m.renderOrder = 1001;
    group.add(m);
  }
  let wait = 2 + random() * 3,
    strike = null,
    flash = 0,
    strikes = 0;
  // Thunder on its way: [seconds left, loudness, distance].
  const rolling = [];
  const range = (r) => r[0] + (r[1] - r[0]) * random();
  // Where the bolt is seen: its bearing and how far below the camera its
  // foot is drawn. It is drawn `reach` metres away (nearer than the storm's
  // fogged horizon, which would hide it) and moves with the camera, as the
  // sky does, at the size it would look from its true distance.
  const direction = new THREE.Vector3(),
    reach = 100;
  let foot = 0;
  const place = (camera) => {
    group.position.copy(camera.position).addScaledVector(direction, reach);
    group.position.y = camera.position.y + foot;
    group.lookAt(camera.position.x, group.position.y, camera.position.z);
  };
  function begin(camera, given = null, towards = null) {
    // Distances spread evenly over the area round the car, so far strikes
    // are the common ones.
    const [near, far] = lightningTiming.distance;
    const distance = given ?? Math.sqrt(near * near + (far * far - near * near) * random());
    const bearing = towards ?? random() * Math.PI * 2;
    const strokes = [[0, 1]];
    for (let i = 0, n = 1 + Math.floor(random() * 2.6); i < n; i++)
      strokes.push([0.09 + i * 0.11 + random() * 0.08, 0.5 + random() * 0.45]);
    strike = {
      time: 0,
      distance,
      strokes,
      brightness: strikeBrightness(distance),
    };
    rolling.push([distance / lightningTiming.speedOfSound, thunderLoudness(distance), distance]);
    strikes++;
    // A bolt seen inside the sky: drawn at 520 m (inside the sky sphere)
    // along its bearing, scaled to look as big as it would at its distance.
    const shown = distance < lightningTiming.boltRange;
    group.visible = shown;
    if (shown) {
      const runs = boltPaths(random);
      // The cloud base about 900 m up (at most 27° above the horizon).
      const height = Math.min(50, (900 * reach) / distance),
        core = Math.max(0.16, (2.5 * reach) / distance);
      foot = (-camera.position.y * reach) / distance;
      for (const m of [coreMesh, glowMesh]) m.geometry.dispose();
      coreMesh.geometry = boltGeometry(runs, height, core);
      glowMesh.geometry = boltGeometry(runs, height, core * 9);
      direction.set(Math.cos(bearing), 0, Math.sin(bearing));
      place(camera);
    }
  }
  return {
    group,
    get flash() {
      return flash;
    },
    get strikes() {
      return strikes;
    },
    // Strikes a bolt now (for a look at one); `distance` in metres,
    // `bearing` (radians from +x toward +z) where it comes down.
    strike(camera, distance = null, bearing = null) {
      begin(camera, distance, bearing);
    },
    // `storm` 0–1: how far a thunderstorm has set in; `shelter` 0–1, under
    // the tunnel's roof (no flash seen, thunder still heard).
    update(dt, camera, storm, shelter = 0) {
      for (let i = rolling.length - 1; i >= 0; i--) {
        rolling[i][0] -= dt;
        if (rolling[i][0] > 0) continue;
        const [, loudness, distance] = rolling.splice(i, 1)[0];
        onThunder(loudness, distance);
      }
      if (!strike && storm > 0.6) {
        wait -= dt * storm;
        if (wait <= 0) {
          begin(camera);
          wait = range(lightningTiming.gap);
        }
      }
      if (!strike) {
        flash = 0;
        group.visible = false;
        return 0;
      }
      strike.time += dt;
      const level = flashEnvelope(strike.time, strike.strokes);
      flash = level * strike.brightness * storm * (1 - 0.85 * shelter);
      materials[0].uniforms.brightness.value = level * 2.6;
      materials[1].uniforms.brightness.value = level * 0.7;
      if (group.visible) place(camera);
      if (strike.time > 0.8) {
        group.visible = false;
        strike = null;
      }
      return flash;
    },
  };
}
