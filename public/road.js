import * as THREE from 'three';
import { roadProfileGLSL } from './road-profile.js';

// A small, tileable surface mask is sampled in world space. It stays fixed on
// the asphalt as the road mesh is recentered and is uploaded only once.
export function createRoadWetnessTexture(size = 64) {
  let seed = 4193;
  const grids = [8, 16, 32].map((width) => ({
    width,
    values: Float32Array.from({ length: width * width }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }),
  }));
  function noise(u, v, { width, values }) {
    const x = u * width,
      y = v * width,
      ix = Math.floor(x),
      iy = Math.floor(y);
    const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
    const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
    const at = (a, b) => values[(b % width) * width + (a % width)];
    const a = THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx);
    const b = THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx);
    return THREE.MathUtils.lerp(a, b, sy);
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size,
        v = (y + 0.5) / size;
      const value =
        noise(u, v, grids[0]) * 0.66 + noise(u, v, grids[1]) * 0.24 + noise(u, v, grids[2]) * 0.1;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(value * 255);
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'Asphalt water film variation';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

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
  const roadWetness = { value: 0 };
  scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.78, 0.88, 0.98), 100, 260);
  if (ground) {
    const wetnessTexture = createRoadWetnessTexture();
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
      shader.uniforms.roadWetness = roadWetness;
      shader.uniforms.roadWetnessMap = { value: wetnessTexture };
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
      shader.fragmentShader =
        'varying vec2 vRoadXZ;\nuniform float roadWetness;\nuniform sampler2D roadWetnessMap;\n' +
        visibleProfile +
        shader.fragmentShader;
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
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float roadFilm = 0.;
        if (roadWetness > .001) {
          float waterMask = texture2D(roadWetnessMap, vRoadXZ / 32.).r;
          roadFilm = smoothstep(.32, .75, waterMask);
          float unresolvedFilm = smoothstep(25., 75., length(cameraPosition.xz - vRoadXZ));
          roadFilm = mix(roadFilm, .48, unresolvedFilm);
          roughnessFactor = mix(.90, .60, roadFilm);
          diffuseColor.rgb *= mix(1., .9, roadFilm);
        }
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= mix(1., mix(.4, 1.35, roadFilm), roadWetness);
          material.clearcoatRoughness = min(1., mix(material.clearcoatRoughness,
            mix(.52, .28, roadFilm) + geometryRoughness, roadWetness));
        #endif
      `
      );
    };
    ground.material.customProgramCacheKey = () => 'continuous-asphalt-water-film';
    ground.material.needsUpdate = true;
  }

  return {
    setRain(enabled) {
      roadWetness.value = enabled ? 1 : 0;
      if (!ground) return;
      const material = ground.material;
      material.color.set(enabled ? 0xa3a9af : 0xc8c8c8);
      material.roughness = enabled ? 0.75 : 1;
      material.clearcoat = enabled ? 0.55 : 0;
      material.clearcoatRoughness = enabled ? 0.4 : 0.12;
      material.envMapIntensity = enabled ? 1.05 : 1;
      material.bumpScale = enabled ? 0.0018 : 0.003;
      material.needsUpdate = true;
    },
    update(x, z) {
      roadCenter.value.set(x, z);
      if (ground) ground.position.set(Math.round(x / 30) * 30, -0.003, Math.round(z / 10) * 10);
    },
  };
}
