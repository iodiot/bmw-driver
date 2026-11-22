import * as THREE from 'three';

// LHD F10: separate driver/passenger arms and 650/450 mm flat blades.
// The pivots and stroke below are fitted to this imported windshield, not factory CAD.
export const wiperSpecs = [
  {
    name: 'Driver wiper',
    pivot: [-0.65, 0.015],
    reach: 0.5,
    length: 0.65,
    park: 0.17,
    end: 1.53,
    bladeOffset: -0.1,
  },
  {
    name: 'Passenger wiper',
    pivot: [-0.12, -0.025],
    reach: 0.56,
    length: 0.45,
    park: 0.28,
    end: 1.42,
    bladeOffset: -0.13,
  },
];

export function wiperPose(spec, sweep) {
  const angle = THREE.MathUtils.lerp(spec.park, spec.end, sweep);
  const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  const pivot = new THREE.Vector2(...spec.pivot);
  const centre = pivot.clone().addScaledVector(direction, spec.reach);
  const bladeDirection = new THREE.Vector2(
    Math.cos(angle + spec.bladeOffset),
    Math.sin(angle + spec.bladeOffset)
  );
  return {
    pivot,
    centre,
    direction,
    bladeDirection,
    a: centre.clone().addScaledVector(bladeDirection, -spec.length / 2),
    b: centre.clone().addScaledVector(bladeDirection, spec.length / 2),
  };
}

export class WiperMotion {
  constructor() {
    this.phase = 0;
    this.active = false;
    this.sweep = 0;
  }
  step(dt, raining, speed = 0) {
    if (raining) this.active = true;
    if (!this.active || dt <= 0) return;
    this.phase += Math.min(dt, 1 / 15) / (1.9 - 0.35 * THREE.MathUtils.clamp(speed / 36, 0, 1));
    if (this.phase >= 1) {
      if (!raining) {
        this.phase = 0;
        this.active = false;
      } else this.phase %= 1;
    }
    this.sweep = 0.5 - 0.5 * Math.cos(this.phase * Math.PI * 2);
  }
}

export class WindshieldSurface {
  constructor(rig) {
    rig.root.updateMatrixWorld(true);
    this.mesh = rig.root.getObjectByName('Object_49');
    const geometry = this.mesh.geometry;
    const transform = rig.body.matrixWorld.clone().invert().multiply(this.mesh.matrixWorld);
    const vertices = Array.from({ length: geometry.attributes.position.count }, (_, i) =>
      new THREE.Vector3()
        .fromBufferAttribute(geometry.attributes.position, i)
        .applyMatrix4(transform)
    );
    const roots = vertices.map((_, i) => i),
      weld = new Map();
    const find = (i) => (roots[i] === i ? i : (roots[i] = find(roots[i])));
    vertices.forEach((p, i) => {
      const key = p
        .toArray()
        .map((n) => n.toFixed(5))
        .join(',');
      if (weld.has(key)) roots[i] = find(weld.get(key));
      else weld.set(key, i);
    });
    const indices = geometry.index;
    for (let i = 0; i < indices.count; i += 3) {
      const a = find(indices.getX(i));
      roots[find(indices.getX(i + 1))] = a;
      roots[find(indices.getX(i + 2))] = a;
    }
    const groups = new Map();
    vertices.forEach((p, i) => {
      const id = find(i);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(i);
    });
    const selected = [...groups.values()].find((ids) => {
      const box = new THREE.Box3().setFromPoints(ids.map((i) => vertices[i]));
      return box.min.x > 0.1 && box.max.x < 1.4 && box.min.z < -0.4 && box.max.z > 0.4;
    });
    if (!selected) throw new Error('Unable to identify the front windshield.');
    this.vertexIds = new Set(selected);
    const centre = selected
      .map((i) => vertices[i])
      .filter((p) => Math.abs(p.z) < 0.01)
      .sort((a, b) => a.y - b.y);
    this.origin = centre[0].clone();
    this.up = centre.at(-1).clone().sub(this.origin).normalize();
    this.side = new THREE.Vector3(0, 0, 1);
    this.project = (p) => new THREE.Vector2(p.z, p.clone().sub(this.origin).dot(this.up));
    this.triangles = [];
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [0, 1, 2].map((j) => indices.getX(i + j));
      if (!ids.every((id) => this.vertexIds.has(id))) continue;
      const points = ids.map((id) => vertices[id]);
      const normal = new THREE.Triangle(...points).getNormal(new THREE.Vector3());
      if (normal.y < 0) normal.negate();
      const uv = points.map(this.project);
      this.triangles.push({
        points,
        uv,
        normal,
        flat: new THREE.Triangle(...uv.map((p) => new THREE.Vector3(p.x, p.y, 0))),
      });
    }
    const uv = selected.map((i) => this.project(vertices[i]));
    this.bounds = new THREE.Vector4(-0.85, -0.12, 1.7, 1.2);
    this.uvBounds = new THREE.Box2().setFromPoints(uv);
  }

  sample(uv, offset = 0, allowOutside = false) {
    let closest,
      distance = Infinity;
    const p = new THREE.Vector3(uv.x, uv.y, 0);
    const scratch = new THREE.Vector3();
    for (const triangle of this.triangles) {
      const flat = triangle.flat;
      const bary = flat.getBarycoord(p, scratch);
      if (!bary) continue;
      if (Math.min(bary.x, bary.y, bary.z) >= -1e-6) {
        const point = new THREE.Vector3();
        triangle.points.forEach((v, i) => point.addScaledVector(v, bary.getComponent(i)));
        return {
          point: point.addScaledVector(triangle.normal, offset),
          normal: triangle.normal,
          inside: true,
        };
      }
      if (allowOutside) {
        const edge = flat.closestPointToPoint(p, new THREE.Vector3());
        const d = edge.distanceToSquared(p);
        if (d < distance) {
          closest = { triangle, edge, flat };
          distance = d;
        }
      }
    }
    if (!closest) return null;
    const bary = closest.flat.getBarycoord(closest.edge, new THREE.Vector3());
    const point = new THREE.Vector3();
    closest.triangle.points.forEach((v, i) => point.addScaledVector(v, bary.getComponent(i)));
    point
      .addScaledVector(this.side, uv.x - closest.edge.x)
      .addScaledVector(this.up, uv.y - closest.edge.y);
    return {
      point: point.addScaledVector(closest.triangle.normal, offset),
      normal: closest.triangle.normal,
      inside: false,
    };
  }
}

export class WindshieldWipeMask {
  constructor(bounds, width = 384, height = 256) {
    this.bounds = bounds;
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height).fill(-1000);
    this.texture = new THREE.DataTexture(
      this.data,
      width,
      height,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.clock = { value: 0 };
  }
  pixel(p) {
    return new THREE.Vector2(
      ((p.x - this.bounds.x) / this.bounds.z) * this.width,
      ((p.y - this.bounds.y) / this.bounds.w) * this.height
    );
  }
  stamp(previous, current) {
    const polygon = [previous.a, previous.b, current.b, current.a].map((p) => this.pixel(p));
    const low = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p.y))));
    const high = Math.min(this.height - 1, Math.ceil(Math.max(...polygon.map((p) => p.y))));
    for (let y = low; y <= high; y++) {
      const intersections = [];
      for (let i = 0; i < 4; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % 4],
          scan = y + 0.5;
        if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan))
          intersections.push(a.x + ((scan - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      if (intersections.length < 2) continue;
      const start = Math.max(0, Math.floor(Math.min(...intersections))),
        end = Math.min(this.width - 1, Math.ceil(Math.max(...intersections)));
      for (let x = start; x <= end; x++) this.data[y * this.width + x] = this.clock.value;
    }
    const a = this.pixel(current.a),
      b = this.pixel(current.b),
      steps = Math.ceil(a.distanceTo(b));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(THREE.MathUtils.lerp(a.x, b.x, i / steps)),
        y = Math.round(THREE.MathUtils.lerp(a.y, b.y, i / steps));
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (x + dx >= 0 && x + dx < this.width && y + dy >= 0 && y + dy < this.height)
            this.data[(y + dy) * this.width + x + dx] = this.clock.value;
    }
    this.texture.needsUpdate = true;
  }
  read(uv) {
    const p = this.pixel(uv);
    return this.data[
      Math.max(0, Math.min(this.height - 1, Math.floor(p.y))) * this.width +
        Math.max(0, Math.min(this.width - 1, Math.floor(p.x)))
    ];
  }
}

function strip(segments, profile, material) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(
    new Float32Array((segments + 1) * profile.length * 3),
    3
  );
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  const indices = [];
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < profile.length; j++) {
      const a = i * profile.length + j,
        b = i * profile.length + ((j + 1) % profile.length),
        c = b + profile.length,
        d = a + profile.length;
      indices.push(a, d, b, b, d, c);
    }
  const last = segments * profile.length;
  for (let j = 1; j < profile.length - 1; j++)
    indices.push(0, j, j + 1, last, last + j + 1, last + j);
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(path, width, height) {
      for (let i = 0; i <= segments; i++) {
        const t = i / segments,
          frame = path(t),
          next = path(Math.min(1, t + 0.001)),
          previous = path(Math.max(0, t - 0.001));
        const tangent = next.point.clone().sub(previous.point).normalize();
        const across = new THREE.Vector3().crossVectors(frame.normal, tangent).normalize();
        profile.forEach(([x, y], j) => {
          const point = frame.point
            .clone()
            .addScaledVector(across, x * width)
            .addScaledVector(frame.normal, y * height);
          positions.setXYZ(i * profile.length + j, point.x, point.y, point.z);
        });
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
}

export function setupWipers(rig, bodyWater) {
  const surface = new WindshieldSurface(rig);
  const motion = new WiperMotion();
  const mask = new WindshieldWipeMask(surface.bounds);
  const marker = surface.mesh.geometry.attributes.waterWindscreen;
  surface.vertexIds.forEach((i) => marker.setX(i, 1));
  marker.needsUpdate = true;
  bodyWater.setWipers({
    texture: mask.texture,
    clock: mask.clock,
    origin: surface.origin,
    up: surface.up,
    bounds: surface.bounds,
  });
  const group = new THREE.Group();
  group.name = 'Windshield wipers';
  // Its parts move: never joined with the body's still ones.
  group.userData.keep = true;
  rig.body.add(group);
  const armMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b20,
    metalness: 0.3,
    roughness: 0.5,
  });
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x111419,
    metalness: 0.05,
    roughness: 0.6,
  });
  const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x080a0c, roughness: 0.88 });
  const assemblies = wiperSpecs.map((spec) => {
    const arm = strip(
      12,
      [
        [-0.5, 0],
        [-0.5, 1],
        [0.5, 1],
        [0.5, 0],
      ],
      armMaterial
    );
    const blade = strip(
      28,
      [
        [-0.5, 0],
        [-0.4, 0.7],
        [0, 1],
        [0.4, 0.7],
        [0.5, 0],
        [0, -0.1],
      ],
      bladeMaterial
    );
    const rubber = strip(
      28,
      [
        [-0.5, 0],
        [-0.5, 1],
        [0.5, 1],
        [0.5, 0],
      ],
      rubberMaterial
    );
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.007, 12), armMaterial);
    const connector = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.018), armMaterial);
    const part = new THREE.Group();
    part.name = spec.name;
    part.add(arm.mesh, blade.mesh, rubber.mesh, cap, connector);
    group.add(part);
    function pose(sweep) {
      const p = wiperPose(spec, sweep);
      const bladePath = (t) => surface.sample(p.a.clone().lerp(p.b, t), 0.0035, true);
      blade.update(bladePath, 0.017, 0.008);
      rubber.update((t) => surface.sample(p.a.clone().lerp(p.b, t), 0.0014, true), 0.007, 0.002);
      arm.update(
        (t) => {
          const uv = p.pivot.clone().lerp(p.centre, t);
          uv.addScaledVector(
            new THREE.Vector2(-p.direction.y, p.direction.x),
            Math.sin(t * Math.PI) * 0.018
          );
          return surface.sample(uv, 0.012 + Math.sin(t * Math.PI) * 0.006, true);
        },
        0.012,
        0.004
      );
      const base = surface.sample(p.pivot, 0.004, true);
      cap.position.copy(base.point);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), base.normal);
      const joint = surface.sample(p.centre, 0.014, true);
      connector.position.copy(joint.point);
      const tangent = surface
        .sample(p.centre.clone().addScaledVector(p.bladeDirection, 0.01), 0.014, true)
        .point.sub(joint.point)
        .normalize();
      const across = new THREE.Vector3().crossVectors(tangent, joint.normal).normalize();
      connector.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(tangent, joint.normal, across)
      );
      return p;
    }
    // Fit the flexible blades to the glass once. Runtime only interpolates the
    // fitted stroke; it does not resample hundreds of windshield triangles or
    // rebuild vertex normals on every rainy frame.
    const steps = 64;
    const strips = [arm.mesh, blade.mesh, rubber.mesh].map((mesh) => ({
      position: mesh.geometry.attributes.position,
      frames: [],
      normals: [],
      mesh,
    }));
    const joints = [];
    for (let i = 0; i <= steps; i++) {
      pose(i / steps);
      for (const strip of strips) {
        strip.frames.push(strip.position.array.slice());
        strip.normals.push(strip.mesh.geometry.attributes.normal.array.slice());
      }
      joints.push({ position: connector.position.clone(), rotation: connector.quaternion.clone() });
    }
    for (const strip of strips) {
      strip.normal = strip.mesh.geometry.attributes.normal;
      strip.normal.setUsage(THREE.DynamicDrawUsage);
    }
    function cachedPose(sweep) {
      const frame = THREE.MathUtils.clamp(sweep, 0, 1) * steps;
      const a = Math.min(Math.floor(frame), steps - 1),
        b = a + 1,
        blend = frame - a;
      for (const strip of strips) {
        for (let j = 0; j < strip.position.array.length; j++) {
          strip.position.array[j] = THREE.MathUtils.lerp(
            strip.frames[a][j],
            strip.frames[b][j],
            blend
          );
          strip.normal.array[j] = THREE.MathUtils.lerp(
            strip.normals[a][j],
            strip.normals[b][j],
            blend
          );
        }
        strip.position.needsUpdate = strip.normal.needsUpdate = true;
      }
      connector.position.lerpVectors(joints[a].position, joints[b].position, blend);
      connector.quaternion.slerpQuaternions(joints[a].rotation, joints[b].rotation, blend);
      return wiperPose(spec, sweep);
    }
    return { spec, pose: cachedPose, previous: cachedPose(0) };
  });
  return {
    group,
    surface,
    motion,
    mask,
    update(dt, { raining, speed }) {
      if (raining) mask.clock.value += Math.min(dt, 1 / 15);
      const wasActive = motion.active;
      motion.step(dt, raining, speed);
      if (motion.active || wasActive) {
        for (const assembly of assemblies) {
          const next = assembly.pose(motion.sweep);
          mask.stamp(assembly.previous, next);
          assembly.previous = next;
        }
      }
    },
  };
}
