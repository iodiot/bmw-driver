import * as THREE from 'three';
import { BrakeHeatState, brakeGlow } from './brake-heat.js';

// Stock M Compound brakes; dimensions from BMW F10 technical training/parts data.
// Caliper contours and drilling layout are visual reconstructions, not factory CAD.
export const brakeSpecifications = Object.freeze({
  front: Object.freeze({
    diameter: 0.4,
    thickness: 0.036,
    innerRadius: 0.115,
    tyreRadius: 0.34675,
  }),
  rear: Object.freeze({
    diameter: 0.396,
    thickness: 0.024,
    innerRadius: 0.118,
    tyreRadius: 0.3425,
  }),
});

function circlePath(radius, x = 0, y = 0) {
  const path = new THREE.Path();
  const segments = radius < 0.01 ? 12 : 64;
  for (let i = 0; i <= segments; i++) {
    const angle = (-i * Math.PI * 2) / segments;
    const px = x + Math.cos(angle) * radius,
      py = y + Math.sin(angle) * radius;
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  return path;
}

function discOutline(radius) {
  return new THREE.Shape(
    Array.from({ length: 128 }, (_, i) => {
      const angle = (i * Math.PI) / 64;
      return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    })
  );
}

export function createRotorPlate(spec, handedness = 1) {
  const radius = spec.diameter / 2;
  const shape = discOutline(radius);
  shape.holes.push(circlePath(spec.innerRadius));
  const holes = [];
  for (let group = 0; group < 12; group++) {
    for (let row = 0; row < 4; row++) {
      const r = spec.innerRadius + 0.015 + (row * (radius - spec.innerRadius - 0.027)) / 3;
      const angle = (group * Math.PI) / 6 + handedness * row * 0.085;
      const centre = new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
      holes.push({ centre, radius: 0.0028 });
      shape.holes.push(circlePath(0.0028, centre.x, centre.y));
    }
  }
  const plateThickness = spec.thickness * 0.25;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: plateThickness,
    bevelEnabled: false,
    curveSegments: 8,
    steps: 1,
  });
  geometry.userData.drilledHoles = holes;
  geometry.userData.plateThickness = plateThickness;
  return geometry;
}

function annularSector(inner, outer, angle, halfAngle) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, angle - halfAngle, angle + halfAngle, false);
  shape.lineTo(Math.cos(angle + halfAngle) * inner, Math.sin(angle + halfAngle) * inner);
  shape.absarc(0, 0, inner, angle + halfAngle, angle - halfAngle, true);
  shape.closePath();
  return shape;
}

function repeatMesh(geometry, material, matrices, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.name = name;
  matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.castShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function transform(x, y, z, angle = 0) {
  return new THREE.Matrix4().makeRotationZ(angle).setPosition(x, y, z);
}

function logo() {
  const group = new THREE.Group();
  group.name = 'M caliper emblem';
  function polygon(points, color) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.45,
        metalness: 0.1,
      })
    );
    group.add(mesh);
  }
  [0x36a9e1, 0x254984, 0xe62a3b].forEach((color, i) => {
    const x = -0.02 + i * 0.0055;
    polygon(
      [
        [x, 0],
        [x + 0.0045, 0],
        [x + 0.009, 0.012],
        [x + 0.0045, 0.012],
      ],
      color
    );
  });
  polygon(
    [
      [0, 0],
      [0.0045, 0.012],
      [0.009, 0.012],
      [0.011, 0.005],
      [0.018, 0.012],
      [0.023, 0.012],
      [0.0185, 0],
      [0.0145, 0],
      [0.017, 0.007],
      [0.0105, 0],
      [0.007, 0],
      [0.005, 0.007],
      [0.0025, 0],
    ],
    0xf4f6fa
  );
  return group;
}

function createCaliper(spec, front, blue, hardware) {
  const group = new THREE.Group();
  group.name = front ? 'Blue six-piston fixed caliper' : 'Blue single-piston floating caliper';
  const radius = spec.diameter / 2;
  const angle = front ? Math.PI - 0.12 : 0.14;
  const halfAngle = front ? 0.52 : 0.34;
  const shellDepth = front ? 0.022 : 0.018;
  const inner = radius - (front ? 0.052 : 0.043),
    outer = radius + 0.025;
  const faceZ = spec.thickness / 2 + 0.004;
  const shellGeometry = new THREE.ExtrudeGeometry(annularSector(inner, outer, angle, halfAngle), {
    depth: shellDepth,
    bevelEnabled: true,
    bevelSize: 0.0025,
    bevelThickness: 0.002,
    bevelSegments: 2,
    curveSegments: 16,
    steps: 1,
  });
  const outboard = new THREE.Mesh(shellGeometry, blue);
  outboard.position.z = faceZ;
  const inboard = new THREE.Mesh(shellGeometry, blue);
  inboard.position.z = -faceZ - shellDepth;
  group.add(outboard, inboard);
  // Bridges sit beyond the rotor edge, leaving a real channel for the disc/pads.
  const bridges = [];
  for (const t of [-0.7, 0.7]) {
    const a = angle + t * halfAngle,
      r = radius + 0.015;
    bridges.push(transform(Math.cos(a) * r, Math.sin(a) * r, 0, a));
  }
  group.add(
    repeatMesh(
      new THREE.BoxGeometry(0.019, 0.018, spec.thickness + 0.014),
      blue,
      bridges,
      'Caliper bridges'
    )
  );
  const pads = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      annularSector(radius - 0.048, radius - 0.004, angle, halfAngle * 0.88),
      { depth: 0.003, bevelEnabled: false, curveSegments: 12 }
    ),
    new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: 0.82 })
  );
  pads.position.z = spec.thickness / 2 + 0.0005;
  const innerPad = pads.clone();
  innerPad.position.z = -spec.thickness / 2 - 0.0035;
  group.add(pads, innerPad);
  const caps = [],
    bolts = [];
  const pistonCount = front ? 3 : 1;
  for (let i = 0; i < pistonCount; i++) {
    const a = angle + (i - (pistonCount - 1) / 2) * 0.25,
      r = radius - 0.027;
    caps.push(transform(Math.cos(a) * r, Math.sin(a) * r, faceZ + shellDepth + 0.001));
  }
  const capGeometry = new THREE.SphereGeometry(
    front ? 0.021 : 0.026,
    16,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2
  );
  capGeometry.rotateX(Math.PI / 2);
  capGeometry.scale(1, 1, 0.18);
  group.add(repeatMesh(capGeometry, blue, caps, 'Piston housing lobes'));
  for (const t of [-0.8, 0.8]) {
    const a = angle + t * halfAngle,
      r = radius - 0.014;
    bolts.push(transform(Math.cos(a) * r, Math.sin(a) * r, faceZ + shellDepth + 0.003));
  }
  group.add(
    repeatMesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.003, 8).rotateX(Math.PI / 2),
      hardware,
      bolts,
      'Pad retaining hardware'
    )
  );
  const emblem = logo();
  const logoRadius = radius - 0.014;
  emblem.position.set(
    Math.cos(angle) * logoRadius,
    Math.sin(angle) * logoRadius,
    faceZ + shellDepth + 0.008
  );
  emblem.rotation.z = angle - Math.PI / 2;
  group.add(emblem);
  if (!front) {
    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.036, 16),
      new THREE.MeshStandardMaterial({ color: 0x171c22, roughness: 0.7 })
    );
    motor.rotation.x = Math.PI / 2;
    motor.position.set(
      Math.cos(angle) * (radius - 0.033),
      Math.sin(angle) * (radius - 0.033),
      -faceZ - shellDepth - 0.02
    );
    motor.name = 'Rear electric parking brake actuator';
    group.add(motor);
  }
  group.traverse((mesh) => {
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return group;
}

function frictionMaterial(spec) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b9199,
    metalness: 0.7,
    roughness: 0.48,
    toneMapped: false,
  });
  material.name = 'Machined iron brake friction ring';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rotorRadii = { value: new THREE.Vector2(spec.innerRadius, spec.diameter / 2) };
    shader.vertexShader = 'varying vec2 vRotorXY;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvRotorXY = position.xy;'
    );
    shader.fragmentShader =
      'varying vec2 vRotorXY;\nuniform vec2 rotorRadii;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      float machiningPhase = length(vRotorXY) * 16000.;
      float machining = sin(machiningPhase) * exp(-fwidth(machiningPhase));
      roughnessFactor += machining * .045;
      diffuseColor.rgb *= 1. - machining * .025;
    `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      float rotorRadius = length(vRotorXY);
      float hotBand = smoothstep(rotorRadii.x + .002, rotorRadii.x + .025, rotorRadius) *
                      (1. - .45 * smoothstep(rotorRadii.y - .018, rotorRadii.y, rotorRadius));
      totalEmissiveRadiance *= (.25 + .75 * hotBand) * (.94 + machining * .06);
    `
    );
  };
  material.customProgramCacheKey = () => 'machined-brake-iron';
  return material;
}

export function setupBrakes(rig) {
  const heat = new BrakeHeatState();
  const coldIron = new THREE.Color(0x8b9199);
  const hotIron = new THREE.Color(0x2c2119);
  const blue = new THREE.MeshPhysicalMaterial({
    color: 0x0b58af,
    metalness: 0.4,
    roughness: 0.3,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
  });
  blue.name = 'BMW M blue metallic caliper';
  const hardware = new THREE.MeshStandardMaterial({
    color: 0x8b929a,
    metalness: 0.85,
    roughness: 0.4,
  });
  const assemblies = rig.wheels.map((wheel, i) => {
    const spec = wheel.front ? brakeSpecifications.front : brakeSpecifications.rear;
    const side = Math.sign(wheel.z),
      scale = wheel.r / spec.tyreRadius;
    const rotor = new THREE.Group();
    rotor.name = 'Vented drilled rotor ' + wheel.name;
    rotor.position.z = -side * 0.01;
    rotor.scale.set(scale, scale, side * scale);
    wheel.spin.add(rotor);
    const metal = frictionMaterial(spec);
    const plateGeometry = createRotorPlate(spec, side);
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x30363c,
      metalness: 0.5,
      roughness: 0.7,
      toneMapped: false,
    });
    for (const z of [
      -spec.thickness / 2,
      spec.thickness / 2 - plateGeometry.userData.plateThickness,
    ]) {
      const plate = new THREE.Mesh(plateGeometry, [metal, edgeMaterial]);
      plate.name = 'Drilled friction plate';
      plate.position.z = z;
      plate.castShadow = true;
      rotor.add(plate);
    }
    const vaneMatrices = [];
    const radius = spec.diameter / 2,
      vaneLength = radius - spec.innerRadius - 0.006;
    for (let n = 0; n < 48; n++) {
      const angle = (n * Math.PI) / 24;
      const r = (radius + spec.innerRadius) / 2;
      vaneMatrices.push(
        transform(Math.cos(angle) * r, Math.sin(angle) * r, 0, angle + side * 0.15)
      );
    }
    rotor.add(
      repeatMesh(
        new THREE.BoxGeometry(vaneLength, 0.003, spec.thickness / 2),
        edgeMaterial,
        vaneMatrices,
        'Internal ventilation vanes'
      )
    );
    const hatShape = discOutline(spec.innerRadius + 0.003);
    hatShape.holes.push(circlePath(0.04));
    const hat = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hatShape, { depth: 0.01, bevelEnabled: false, curveSegments: 24 }),
      hardware
    );
    hat.name = 'Unheated aluminium disc hat';
    rotor.add(hat);
    const pinMatrices = [];
    for (let n = 0; n < 12; n++) {
      const angle = (n * Math.PI) / 6,
        r = spec.innerRadius + 0.001;
      pinMatrices.push(transform(Math.cos(angle) * r, Math.sin(angle) * r, 0.012));
    }
    rotor.add(
      repeatMesh(
        new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 8).rotateX(Math.PI / 2),
        hardware,
        pinMatrices,
        'Compound disc connecting pins'
      )
    );
    const caliper = createCaliper(spec, wheel.front, blue, hardware);
    caliper.position.z = rotor.position.z;
    caliper.scale.copy(rotor.scale);
    caliper.getObjectByName('M caliper emblem').scale.x = side;
    wheel.mount.add(caliper);
    return { wheel, spec, rotor, caliper, metal, edgeMaterial, index: i, scale };
  });
  return {
    heat,
    assemblies,
    reset() {
      heat.reset();
      for (const assembly of assemblies) {
        assembly.metal.emissiveIntensity = 0;
        assembly.metal.color.copy(coldIron);
        assembly.edgeMaterial.emissiveIntensity = 0;
      }
    },
    update(dt, state) {
      heat.step(dt, state);
      for (const assembly of assemblies) {
        const temperature = heat.discs[assembly.index].surface;
        const glow = brakeGlow(temperature);
        const orange = THREE.MathUtils.smoothstep(temperature, 520, 850);
        // Keep the glowing iron orange rather than mixing red light with a blue
        // sky reflection and bleaching it pink through the scene's tone curve.
        assembly.metal.color.lerpColors(
          coldIron,
          hotIron,
          THREE.MathUtils.smoothstep(temperature, 450, 650)
        );
        assembly.metal.emissive.setRGB(1, 0.045 + orange * 0.2, 0.001 + orange * 0.008);
        assembly.metal.emissiveIntensity = glow * 3;
        assembly.edgeMaterial.emissive.copy(assembly.metal.emissive);
        assembly.edgeMaterial.emissiveIntensity = glow * 0.65;
      }
    },
  };
}
