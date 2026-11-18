import * as THREE from 'three';
import { roadProfileGLSL } from './road-profile.js';

// Dense tyre-contact area, with progressively larger cells toward the horizon.
// A single connected surface keeps the distant asphalt present in every direction.
export function createRoadGeometry() {
  function axis(core, bands) {
    const positive = [];
    for (let p = 0; p <= core + 0.001; p += 0.2) positive.push(Number(p.toFixed(4)));
    let start = core;
    for (const [end, step] of bands) {
      for (let p = start + step; p <= end + 0.001; p += step) positive.push(p);
      start = end;
    }
    return [
      ...positive
        .slice(1)
        .reverse()
        .map((p) => -p),
      ...positive,
    ];
  }
  const xs = axis(80, [
    [120, 2],
    [240, 8],
    [600, 40],
    [1400, 100],
  ]);
  const ys = axis(8, [
    [24, 2],
    [120, 8],
    [600, 40],
    [1400, 100],
  ]);
  const width = xs.length,
    height = ys.length,
    positions = new Float32Array(width * height * 3);
  const normals = new Float32Array(positions.length),
    uvs = new Float32Array(width * height * 2);
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const n = j * width + i;
      positions[n * 3] = xs[i];
      positions[n * 3 + 1] = ys[j];
      normals[n * 3 + 2] = 1;
      uvs[n * 2] = (xs[i] + 1400) / 2800;
      uvs[n * 2 + 1] = (ys[j] + 1400) / 2800;
    }
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let k = 0;
  for (let j = 0; j < height - 1; j++)
    for (let i = 0; i < width - 1; i++) {
      const a = j * width + i,
        b = a + 1,
        c = b + width,
        d = a + width;
      indices.set([a, b, c, a, c, d], k);
      k += 6;
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.boundingBox.min.z = -0.15;
  geometry.boundingBox.max.z = 0.15;
  geometry.computeBoundingSphere();
  return geometry;
}

export function setupRoad(scene) {
  const ground = scene.getObjectByName('Asphalt ground');
  const roadCenter = { value: new THREE.Vector2() };
  scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.78, 0.88, 0.98), 100, 260);
  if (ground) {
    ground.geometry.dispose();
    ground.geometry = createRoadGeometry();
    ground.material.map.repeat.set(2800, 2800);
    ground.material.bumpScale = 0.003;
    ground.geometry.computeBoundingBox();
    ground.geometry.boundingBox.min.z = -0.15;
    ground.geometry.boundingBox.max.z = 0.15;
    ground.geometry.computeBoundingSphere();
    // Paint on the asphalt itself: one depth surface, with derivative-based
    // antialiasing and a distance fade instead of coplanar strip geometry.
    ground.material.onBeforeCompile = (shader) => {
      shader.uniforms.roadCenter = roadCenter;
      const visibleProfile =
        'uniform vec2 roadCenter;\n' +
        roadProfileGLSL +
        `
        float visibleRoadHeight(vec2 p) {
          return roadHeight(p) * (1. - smoothstep(45., 60., length(p - roadCenter)));
        }
      `;
      shader.vertexShader = 'varying vec2 vRoadXZ;\n' + visibleProfile + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vec2 surfaceXZ = (modelMatrix * vec4(position, 1.)).xz;
        float dx = (visibleRoadHeight(surfaceXZ + vec2(.02, 0.)) -
                    visibleRoadHeight(surfaceXZ - vec2(.02, 0.))) / .04;
        float dz = (visibleRoadHeight(surfaceXZ + vec2(0., .02)) -
                    visibleRoadHeight(surfaceXZ - vec2(0., .02))) / .04;
        objectNormal = normalize(vec3(-dx, dz, 1.));
      `
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 surfacePosition = (modelMatrix * vec4(position, 1.)).xz;
        transformed.z += visibleRoadHeight(surfacePosition);
      `
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;'
      );
      shader.fragmentShader = 'varying vec2 vRoadXZ;\n' + visibleProfile + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float roadAAZ = max(fwidth(vRoadXZ.y), 0.002);
        float roadAAX = max(fwidth(vRoadXZ.x), 0.002);
        float laneDistance = min(abs(vRoadXZ.y - 1.8), abs(vRoadXZ.y + 1.8));
        float lanePaint = 1.0 - smoothstep(0.065 - roadAAZ, 0.065 + roadAAZ, laneDistance);
        float dashX = abs(mod(vRoadXZ.x + 4.5, 9.0) - 4.5);
        float dashPaint = 1.0 - smoothstep(1.5 - roadAAX, 1.5 + roadAAX, dashX);
        float edgeDistance = min(abs(vRoadXZ.y - 5.4), abs(vRoadXZ.y + 5.4));
        float edgePaint = 1.0 - smoothstep(0.075 - roadAAZ, 0.075 + roadAAZ, edgeDistance);
        float paintVisibility = 1.0 - smoothstep(65.0, 170.0, length(cameraPosition.xz - vRoadXZ));
        float paintMask = max(lanePaint * dashPaint, edgePaint) * paintVisibility;
        float height = visibleRoadHeight(vRoadXZ);
        float raised = smoothstep(.004, .018, height);
        float stripe = .5 + .5 * sin((vRoadXZ.x + vRoadXZ.y * .55) * 14.);
        vec3 rubber = mix(vec3(.018), vec3(.72, .48, .045), smoothstep(.38, .62, stripe));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.78, 0.73), paintMask * (1. - raised));
        diffuseColor.rgb = mix(diffuseColor.rgb, rubber, raised);
        diffuseColor.rgb *= 1. - .5 * smoothstep(.003, .045, -height);
      `
      );
    };
    ground.material.customProgramCacheKey = () => 'continuous-asphalt-horizon';
    ground.material.needsUpdate = true;
  }

  return {
    setRain(enabled) {
      if (!ground) return;
      const material = ground.material;
      material.color.set(enabled ? 0x7d8792 : 0xc8c8c8);
      material.roughness = enabled ? 0.38 : 1;
      material.clearcoat = enabled ? 1 : 0;
      material.envMapIntensity = enabled ? 1.3 : 1;
      material.bumpScale = enabled ? 0.001 : 0.003;
      material.needsUpdate = true;
    },
    update(x, z) {
      roadCenter.value.set(x, z);
      if (ground) ground.position.set(Math.round(x / 30) * 30, -0.003, Math.round(z / 10) * 10);
    },
  };
}
