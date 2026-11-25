import * as THREE from 'three';
import { fuelStationPlace, roadBranch, roadProfileGLSL } from './road-profile.js';

// Blades of grass on the fields either side of the road, round the camera:
// two strips `length` metres along the road, from the verge out to `reach`,
// each blade fixed to its place along the road and wrapped round the camera
// (one that falls behind reappears ahead), so the strips follow the view
// without the blades sliding. They grow thickest near the road, sway in the
// wind and shrink away toward `radius` from the camera, where the ground's
// own grass texture takes over. One draw call.
export const grassLayout = Object.freeze({
  length: 64,
  // Lateral range from the road's centre line: from the verge outward.
  verge: 8.7,
  reach: 30,
  radius: 34,
  count: 72000,
  // Clear of the guardrails and the gravel verge, and of the country
  // road's track.
  clearRoad: [8.4, 9.4],
  clearTrack: [2.5, 3.3],
});

function bladeGeometry(count) {
  const { length, verge, reach } = grassLayout;
  // One blade: a tapered strip, two segments and a point, 0 at its root
  // and 1 at its tip (x across, -0.5…0.5 of its width).
  const base = new THREE.BufferGeometry();
  base.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.5, 0, 0, 0.5, 0, 0, -0.38, 0.45, 0, 0.38, 0.45, 0, -0.2, 0.8, 0, 0.2, 0.8, 0, 0, 1, 0],
      3
    )
  );
  base.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  const geometry = new THREE.InstancedBufferGeometry().copy(base);
  geometry.instanceCount = count;
  let seed = 1234567;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const offsets = new Float32Array(count * 3),
    shapes = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // Along the road, and out from it: more of them near the road, where
    // they are seen closest.
    offsets[i * 3] = random() * length;
    offsets[i * 3 + 1] = (i % 2 ? 1 : -1) * (verge + (reach - verge) * Math.pow(random(), 1.7));
    offsets[i * 3 + 2] = random() * Math.PI * 2;
    // Height (some tall stems among the short), width, lean and shade.
    const tall = random() < 0.12;
    shapes[i * 4] = tall ? 0.6 + random() * 0.4 : 0.22 + random() * 0.3;
    shapes[i * 4 + 1] = 0.05 + random() * 0.05;
    shapes[i * 4 + 2] = (random() - 0.5) * 0.9;
    shapes[i * 4 + 3] = random();
  }
  geometry.setAttribute('bladeOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('bladeShape', new THREE.InstancedBufferAttribute(shapes, 4));
  return geometry;
}

export function setupGrassBlades(scene, { grassMap, noiseMap }) {
  const { length, verge, radius, count, clearRoad, clearTrack } = grassLayout;
  const time = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    name: 'Grass blades',
    color: 0xffffff,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const f = (n) => Number(n).toFixed(4);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassTime = time;
    shader.uniforms.grassMap = { value: grassMap };
    shader.uniforms.grassNoise = { value: noiseMap };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 bladeOffset;
        attribute vec4 bladeShape;
        uniform float grassTime;
        uniform sampler2D grassMap;
        uniform sampler2D grassNoise;
        varying float vBladeY;
        varying vec3 vBladeColour;
        ${roadProfileGLSL}`
      )
      .replace(
        '#include <beginnormal_vertex>',
        // Lit as the ground under them is, so they shade into it.
        'vec3 objectNormal = vec3(0., 1., 0.);'
      )
      .replace(
        '#include <begin_vertex>',
        `
        // Mostly ahead of the camera, which looks along the road.
        vec2 root = vec2(bladeOffset.x, 0.);
        root.x += ${f(length)} * floor((cameraPosition.x + ${f(length * 0.22)} - root.x) / ${f(length)} + .5);
        float roadLat = bladeOffset.y;
        root.y = roadCenterZ(root.x) + roadLat;
        float branch = branchOffset(root.x);
        float trackLat = branch < 0. ? 1e3 : abs(roadLat - branch);
        float grows = smoothstep(${f(clearRoad[0])}, ${f(clearRoad[1])}, abs(carriageLat(roadLat))) *
          smoothstep(${f(clearTrack[0])}, ${f(clearTrack[1])}, trackLat);
        // None on the fuel station's forecourt, nor on the way onto it and
        // off it from the service lane.
        float stationAlong = branchAlong(root.x) - ${f(fuelStationPlace.at - roadBranch.start)};
        float depth = roadLat - branch - ${f(roadBranch.halfWidth)};
        if (branch >= 0. && abs(stationAlong) < ${f(fuelStationPlace.length / 2 + 26)} &&
            depth > -1. && depth < ${f(fuelStationPlace.from + fuelStationPlace.depth + 1)})
          grows = 0.;
        float away = length(root - cameraPosition.xz);
        grows *= 1. - smoothstep(${f(radius * 0.55)}, ${f(radius)}, away);
        float height = bladeShape.x * grows;
        // Wider farther out, so they still read at a distance.
        float width = bladeShape.y * (1. + (abs(roadLat) - ${f(verge)}) / 14.);
        float y = position.y;
        // Gusts run across the fields; each blade bends from its root, most
        // at the tip, and leans its own way.
        float gust = sin(grassTime * 1.3 + root.x * .21 + root.y * .13) * .6 +
          sin(grassTime * 2.7 + root.x * .73 - root.y * .41) * .25;
        float bend = (bladeShape.z + gust * .45) * y * y * height;
        float c = cos(bladeOffset.z), s = sin(bladeOffset.z);
        vec3 transformed = vec3(position.x * width * c, y * height, position.x * width * s);
        transformed.x += bend * .8;
        transformed.z += bend * .5;
        transformed.y -= abs(bend) * .35 * y;
        transformed.xz += root;
        vBladeY = y;
        // The colour of the fields' grass where it grows (as road.js shades
        // the ground), each blade a little lighter or darker.
        vec3 near = textureLod(grassMap, root / 2.6, 1.5).rgb;
        vec3 far = textureLod(grassMap, root.yx / 8.7 + .31, 1.5).rgb;
        vec3 grass = mix(near, far, .4) * vec3(.9, 1.12, .62);
        grass *= .78 + .44 * textureLod(grassNoise, root / 23., 0.).r;
        float mid = textureLod(grassNoise, root / 5.3, 0.).r;
        grass = mix(grass, grass * vec3(1.15, 1.02, .7), smoothstep(.62, .85, mid) * .45);
        vBladeColour = grass * (.8 + .4 * bladeShape.w);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vBladeY;
        varying vec3 vBladeColour;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Darker in among the stems, lighter toward the tips.
        diffuseColor.rgb *= vBladeColour * (.55 + .65 * vBladeY);`
      )
      .replace(
        '#include <normal_fragment_begin>',
        // Both faces lit alike (no flipping for the back face).
        `float faceDirection = 1.;
        vec3 normal = normalize(vNormal);
        vec3 nonPerturbedNormal = normal;`
      );
  };
  material.customProgramCacheKey = () => 'grass-blades';
  const mesh = new THREE.Mesh(bladeGeometry(count), material);
  mesh.name = 'Grass blades';
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh,
    count,
    update(dt) {
      time.value += dt;
    },
  };
}
