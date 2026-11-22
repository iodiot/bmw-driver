import * as THREE from 'three';
import { structuresGLSL, structureUniforms } from './road-structures.js';
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
  // Dense where bumps and holes are drawn: within 60 m of the car, and the
  // mesh recentres in 30 m steps, so 80 m either side of its centre.
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
  const asphaltHeight = { value: new THREE.Texture() };
  scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.78, 0.88, 0.98), 100, 260);
  if (ground) {
    const wetnessTexture = createRoadWetnessTexture();
    // Photographed CC0 ground textures (Poly Haven "Leafy Grass" and "Rocks
    // Ground 02"), tiled in world space.
    const loader = new THREE.TextureLoader();
    const groundTexture = (file, srgb = true) => {
      if (typeof document === 'undefined') return new THREE.Texture();
      const texture = loader.load(new URL(`./assets/ground/${file}`, import.meta.url).href);
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      return texture;
    };
    const grassTexture = groundTexture('grass.jpg'),
      gravelTexture = groundTexture('gravel.jpg');
    ground.geometry.dispose();
    ground.geometry = createRoadGeometry();
    ground.material.map.repeat.set(2800, 2800);
    ground.material.bumpScale = 0.003;
    // Photographed CC0 asphalt (Poly Haven "Asphalt Track", 2 × 2 m): colour,
    // a normal map for the stones and pores, roughness and occlusion, and a
    // height map that shifts every map by parallax, so the aggregate keeps
    // its depth as the view moves over it. The ground mesh snaps to whole
    // tiles, so the texture stays fixed to the world.
    const asphaltTile = 2,
      asphaltRepeat = 2800 / asphaltTile;
    if (typeof document !== 'undefined') {
      const asphaltTexture = (file, srgb) => {
        const texture = groundTexture(file, srgb);
        texture.repeat.set(asphaltRepeat, asphaltRepeat);
        return texture;
      };
      const material = ground.material,
        arm = asphaltTexture('asphalt-arm.jpg', false);
      material.map = asphaltTexture('asphalt.jpg', true);
      material.bumpMap = null;
      material.normalMap = asphaltTexture('asphalt-normal.jpg', false);
      material.normalScale.set(1, 1);
      material.roughnessMap = arm;
      material.aoMap = arm;
      material.aoMapIntensity = 0.7;
      asphaltHeight.value = asphaltTexture('asphalt-height.jpg', false);
    }
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
      shader.uniforms.grassMap = { value: grassTexture };
      shader.uniforms.gravelMap = { value: gravelTexture };
      shader.uniforms.asphaltHeight = asphaltHeight;
      shader.uniforms.asphaltUvPerMetre = { value: 1 / asphaltTile };
      Object.assign(shader.uniforms, structureUniforms);
      const visibleProfile =
        'uniform vec2 roadCenter;\n' +
        roadProfileGLSL +
        `
        // Bumps and holes are drawn within 60 m of the car; beyond that the
        // (costly) obstacle profile is not evaluated at all.
        float visibleRoadHeight(vec2 p) {
          float fade = 1. - smoothstep(35., 60., length(p - roadCenter));
          return fade > 0. ? roadHeight(p) * fade : 0.;
        }
      `;
      shader.vertexShader = 'varying vec2 vRoadXZ;\n' + visibleProfile + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        // Height and slope from three profile evaluations (forward differences),
        // reused for the displacement below.
        vec2 surfaceXZ = (modelMatrix * vec4(position, 1.)).xz;
        float surfaceHeight = visibleRoadHeight(surfaceXZ);
        float dx = (visibleRoadHeight(surfaceXZ + vec2(.02, 0.)) - surfaceHeight) / .02;
        float dz = (visibleRoadHeight(surfaceXZ + vec2(0., .02)) - surfaceHeight) / .02;
        objectNormal = normalize(vec3(-dx, dz, 1.));
      `
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += surfaceHeight;
      `
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;'
      );
      shader.fragmentShader =
        'varying vec2 vRoadXZ;\nuniform float roadWetness;\nuniform sampler2D roadWetnessMap;\nuniform sampler2D grassMap;\nuniform sampler2D gravelMap;\nuniform sampler2D asphaltHeight;\nuniform float asphaltUvPerMetre;\n' +
        visibleProfile +
        structuresGLSL +
        shader.fragmentShader;
      // Parallax: shift texture lookups along the view direction by the
      // asphalt's height (±3 mm), so stones stand proud and pores sink.
      // Texture u runs along world x and v along world -z.
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `void main() {
        vec2 parallaxShift = vec2(0.);
        #ifdef USE_MAP
          vec3 toEye = cameraPosition - vec3(vRoadXZ.x, 0., vRoadXZ.y);
          float eyeDistance = length(toEye);
          toEye /= eyeDistance;
          // Only near the camera, where the shift is visible; gradients are
          // taken outside the branch so mip selection stays correct.
          vec2 mapDx = dFdx(vMapUv), mapDy = dFdy(vMapUv);
          if (eyeDistance < 25.) {
            // The height map averages .82: stones above it, pores below.
            float relief = textureGrad(asphaltHeight, vMapUv, mapDx, mapDy).r - .82;
            parallaxShift = vec2(toEye.x, -toEye.z) / max(toEye.y, .25) * relief * .006 *
              asphaltUvPerMetre * (1. - smoothstep(8., 25., eyeDistance));
          }
        #endif
      `
      );
      const shifted = (chunk, uv) =>
        THREE.ShaderChunk[chunk].replaceAll(
          `texture2D( ${uv.split('|')[0]}, ${uv.split('|')[1]} )`,
          `texture2D( ${uv.split('|')[0]}, ${uv.split('|')[1]} + parallaxShift )`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          shifted('map_fragment', 'map|vMapUv').replace(
            'diffuseColor *= sampledDiffuseColor;',
            // The photo is fresh, near-black track asphalt; weathering
            // greys it and lightens the stones, without its warm tint.
            `sampledDiffuseColor.rgb = pow(sampledDiffuseColor.rgb, vec3(.6)) * 1.6;
            sampledDiffuseColor.rgb = mix(vec3(dot(sampledDiffuseColor.rgb, vec3(.3, .59, .11))),
              sampledDiffuseColor.rgb, .4);
            diffuseColor *= sampledDiffuseColor;`
          ) + '\n#include <map_fragment_road>'
        )
        .replace(
          '#include <roughnessmap_fragment>',
          shifted('roughnessmap_fragment', 'roughnessMap|vRoughnessMapUv') +
            '\n#include <roughnessmap_fragment_road>'
        )
        .replace('#include <aomap_fragment>', shifted('aomap_fragment', 'aoMap|vAoMapUv'))
        .replace(
          '#include <normal_fragment_maps>',
          shifted('normal_fragment_maps', 'normalMap|vNormalMapUv').replace(
            'mapN.xy *= normalScale;',
            // Asphalt relief only on asphalt; grass and gravel stay smooth.
            'mapN.xy *= normalScale * (1. - offRoad);'
          )
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment_road>',
        `
        // Roadside: asphalt to the shoulder, a gravel strip, then grass with
        // patchy colour and dry spots. Noise reuses the small tileable mask.
        // Lateral position relative to the curving road centre line.
        float roadLat = vRoadXZ.y - roadCenterZ(vRoadXZ.x);
        float lateral = abs(roadLat);
        // The country road: an unpaved track of packed dirt and gravel, about
        // 4.4 m wide, with grass right up to its edges.
        float branchCentre = branchOffset(vRoadXZ.x);
        float hasBranch = step(0., branchCentre);
        float branchLat = roadLat - branchCentre;
        float branchLateral = mix(1e3, abs(branchLat), hasBranch);
        float offRoad = smoothstep(6.05, 6.25, lateral) * (1. - tunnelFloor(vRoadXZ));
        float track = (1. - smoothstep(1.9, 2.5, branchLateral)) * offRoad;
        float verge = min(smoothstep(7.3, 8.1, lateral), smoothstep(2.2, 3., branchLateral));
        float broadNoise = texture2D(roadWetnessMap, vRoadXZ / 23.).r;
        float midNoise = texture2D(roadWetnessMap, vRoadXZ / 5.3).r;
        float fineNoise = texture2D(roadWetnessMap, vRoadXZ / 1.7).r;
        // Grass at two scales and offsets hides the tile; a summer-green tint
        // and broad patches of lusher and drier grass add variation.
        // Sampled only off the asphalt (most road pixels skip it), with
        // gradients taken outside the branch for correct mip levels.
        vec3 roadside = vec3(0.);
        vec2 groundDx = dFdx(vRoadXZ), groundDy = dFdy(vRoadXZ);
        if (offRoad > 0.) {
          vec3 grassNear = textureGrad(grassMap, vRoadXZ / 2.6, groundDx / 2.6, groundDy / 2.6).rgb;
          vec3 grassFar = textureGrad(grassMap, vRoadXZ.yx / 8.7 + .31, groundDx.yx / 8.7, groundDy.yx / 8.7).rgb;
          vec3 grass = mix(grassNear, grassFar, .4) * vec3(.9, 1.12, .62);
          grass *= .78 + .44 * broadNoise;
          grass = mix(grass, grass * vec3(1.15, 1.02, .7), smoothstep(.62, .85, midNoise) * .45);
          // Gravel at two scales and orientations, with broad lighter and
          // darker stretches, so the shoulder does not repeat visibly.
          vec3 gravelNear = textureGrad(gravelMap, vRoadXZ / 1.4, groundDx / 1.4, groundDy / 1.4).rgb;
          vec3 gravelFar = textureGrad(gravelMap, vRoadXZ.yx / 3.9 + .57, groundDx.yx / 3.9, groundDy.yx / 3.9).rgb;
          vec3 gravel = mix(gravelNear, gravelFar, .45) * vec3(.82, .82, .84) * (.8 + .4 * midNoise);
          roadside = mix(gravel, grass, verge);
          if (track > 0.) {
            // Two worn wheel ruts, a grassy hump between them and grass
            // creeping in at the edges, over gravel tinted to dry earth.
            vec3 dirt = mix(gravelNear, gravelFar, .6) * vec3(.78, .66, .5) * (.75 + .4 * broadNoise);
            float rut = exp(-pow((abs(branchLat) - .85) / .32, 2.));
            dirt = mix(dirt, dirt * vec3(.78, .74, .7), rut * .8);
            float hump = (1. - smoothstep(.25, .5, abs(branchLat))) * (.45 + .4 * fineNoise);
            float edge = smoothstep(1.5, 2.3, branchLateral) * (.5 + .5 * midNoise);
            dirt = mix(dirt, grass * .85, max(hump, edge));
            roadside = mix(roadside, dirt, track);
          }
        }
        // Asphalt history: polished wheel tracks in every lane, darker repair
        // patches and meandering sealed cracks.
        float onCarriageway = 1. - smoothstep(5.35, 5.55, lateral);
        float laneOffset = mod(roadLat + 5.4, 3.6) - 1.8;
        float wheelTrack = exp(-pow((abs(laneOffset) - .82) / .3, 2.)) * onCarriageway;
        vec2 patchCell = floor(vec2(vRoadXZ.x / 11., (roadLat + 5.4) / 3.6));
        float patchSeed = fract(sin(dot(patchCell, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 patchLocal = vec2(mod(vRoadXZ.x, 11.), mod(roadLat + 5.4, 3.6));
        float patchLength = 2.5 + 5. * fract(patchSeed * 7.3);
        // Slightly irregular, softened edges; newer asphalt is only a little darker.
        float patchEdge = .06 + .1 * fineNoise;
        float repairPatch = step(.74, patchSeed) * onCarriageway *
          smoothstep(1.2, 1.2 + patchEdge, patchLocal.x) *
          (1. - smoothstep(1.2 + patchLength - patchEdge, 1.2 + patchLength, patchLocal.x)) *
          smoothstep(.35, .35 + patchEdge, patchLocal.y) *
          (1. - smoothstep(3.25 - patchEdge, 3.25, patchLocal.y));
        float crackField = abs(texture2D(roadWetnessMap, vRoadXZ / 7.).r - .5);
        float crackWidth = max(fwidth(crackField), .0015);
        float sealedCrack = (1. - smoothstep(.006, .006 + 1.5 * crackWidth, crackField)) *
          smoothstep(.55, .7, midNoise) * onCarriageway;
        diffuseColor.rgb *= 1. - .14 * wheelTrack;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (.8 + .08 * midNoise), repairPatch);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.035), sealedCrack * .85);
        diffuseColor.rgb = mix(diffuseColor.rgb, roadside, offRoad);
        float roadAAZ = max(fwidth(roadLat), 0.002);
        float roadAAX = max(fwidth(vRoadXZ.x), 0.002);
        float laneDistance = min(abs(roadLat - 1.8), abs(roadLat + 1.8));
        float lanePaint = 1.0 - smoothstep(0.065 - roadAAZ, 0.065 + roadAAZ, laneDistance);
        float dashX = abs(mod(vRoadXZ.x + 4.5, 9.0) - 4.5);
        float dashPaint = 1.0 - smoothstep(1.5 - roadAAX, 1.5 + roadAAX, dashX);
        float edgeDistance = min(abs(roadLat - 5.4), abs(roadLat + 5.4));
        float edgePaint = 1.0 - smoothstep(0.075 - roadAAZ, 0.075 + roadAAZ, edgeDistance);
        // Where the country road leaves or joins, the right edge line is
        // broken into short dashes across its mouth.
        float mouth = hasBranch * step(0., roadLat) * (1. - step(5.9, branchCentre - 2.2));
        float exitDash = 1. - smoothstep(1. - roadAAX, 1. + roadAAX, abs(mod(vRoadXZ.x + 2., 4.) - 2.));
        edgePaint *= mix(1., exitDash, mouth);

        float paintVisibility = 1.0 - smoothstep(65.0, 170.0, length(cameraPosition.xz - vRoadXZ));
        // Paint is worn unevenly and most where tyres run.
        float paintWear = (.72 + .28 * fineNoise) * (1. - .35 * wheelTrack);
        float paintMask = max(lanePaint * dashPaint, edgePaint) * paintVisibility * paintWear;
        // Colour comes from the full obstacle profile, not the displaced
        // height (which fades in from 60 m), so bumps and holes do not pop
        // into colour as they approach; the geometry rises smoothly under it.
        float profileDistance = length(cameraPosition.xz - vRoadXZ);
        float height = profileDistance < 160. ? roadHeight(vRoadXZ) : 0.;
        float raised = smoothstep(.004, .018, height);
        // Yellow-black stripes, filtered by their size on screen: sharp up
        // close, softened as they shrink, and plain amber once narrower than
        // a pixel, so distant bumps do not shimmer.
        float stripePhase = (vRoadXZ.x + vRoadXZ.y * .55) * 14.;
        float stripeFootprint = fwidth(stripePhase);
        float stripe = .5 + .5 * sin(stripePhase);
        float stripeEdge = .12 + .3 * stripeFootprint;
        float yellow = smoothstep(.5 - stripeEdge, .5 + stripeEdge, stripe);
        yellow = mix(yellow, .5, smoothstep(1.2, 2.6, stripeFootprint));
        vec3 rubber = mix(vec3(.018), vec3(.72, .48, .045), yellow);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.78, 0.73), paintMask * (1. - raised));
        diffuseColor.rgb = mix(diffuseColor.rgb, rubber, raised * (1. - offRoad));
        // Potholes: broken, crumbled asphalt at the rim, then the exposed
        // stone bed, darker the deeper it lies.
        float holeDepth = smoothstep(.004, .04, -height) * (1. - offRoad);
        float holeRim = smoothstep(.0008, .004, -height) * (1. - smoothstep(.006, .02, -height)) *
          (1. - offRoad);
        if (holeRim + holeDepth > 0.) {
          vec3 bed = textureGrad(gravelMap, vRoadXZ / .8, groundDx / .8, groundDy / .8).rgb;
          bed = mix(vec3(dot(bed, vec3(.3, .59, .11))), bed, .5) * vec3(.62, .6, .57);
          diffuseColor.rgb = mix(diffuseColor.rgb, bed, holeDepth * .9);
          diffuseColor.rgb *= 1. - .45 * holeDepth;
          // The rim is broken: lighter crumbs in patches, not a ring.
          float crumbs = smoothstep(.35, .75, texture2D(roadWetnessMap, vRoadXZ / .6).r);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + .012, holeRim * crumbs);
        }
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment_road>',
        `
        float roadFilm = 0.;
        // Tyres polish their tracks slightly smoother than the rest.
        roughnessFactor = mix(roughnessFactor, .82, wheelTrack * .7);
        // Loose stones in a pothole's bed are matt; in rain it holds a puddle.
        roughnessFactor = mix(roughnessFactor, 1., holeDepth);
        float puddle = smoothstep(.012, .03, -height) * roadWetness * (1. - offRoad);
        roughnessFactor = mix(roughnessFactor, .03, puddle);
        diffuseColor.rgb *= 1. - .35 * puddle;
        if (roadWetness > .001) {
          float waterMask = texture2D(roadWetnessMap, vRoadXZ / 32.).r;
          roadFilm = smoothstep(.32, .75, waterMask);
          float unresolvedFilm = smoothstep(25., 75., length(cameraPosition.xz - vRoadXZ));
          roadFilm = mix(roadFilm, .48, unresolvedFilm) * (1. - offRoad);
          roughnessFactor = mix(.90, .60, roadFilm);
          diffuseColor.rgb *= mix(1., .9, roadFilm);
        }
      `
      );
      // Overpasses shade the road from the sun (the shadow map reaches only a
      // few metres round the car), and inside the tunnel only its lamps light
      // it, fading in over the first metres from each portal.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <lights_fragment_begin>',
          `float tunnelLit = tunnelCover(vRoadXZ);
          float structureSun = (1. - tunnelLit) * (1. - bridgeShade(vRoadXZ));
          ` +
            THREE.ShaderChunk.lights_fragment_begin.replace(
              'getDirectionalLightInfo( directionalLight, directLight );',
              'getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= structureSun;'
            )
        )
        .replace(
          '#include <lights_fragment_end>',
          // Sky light gives way to the lamps' (headlamps still add theirs).
          `irradiance = mix(irradiance, tunnelLamps(vRoadXZ) * PI, tunnelLit);
          iblIrradiance *= 1. - tunnelLit;
          radiance *= 1. - .85 * tunnelLit;
          #include <lights_fragment_end>`
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= mix(1., mix(.4, 1.35, roadFilm), roadWetness) * (1. - .85 * offRoad);
          material.clearcoatRoughness = min(1., mix(material.clearcoatRoughness,
            mix(.52, .28, roadFilm) + geometryRoughness, roadWetness));
        #endif
      `
      );
    };
    ground.material.customProgramCacheKey = () =>
      'continuous-asphalt-roadside-country-road-structures';
    ground.material.needsUpdate = true;
  }

  const wetColour = new THREE.Color(0xa3a9af);
  return {
    setRain(enabled) {
      this.setWetness(enabled ? 1 : 0, true);
    },
    // How wet the road is (0 to 1), as rain sets in or the road dries. The
    // material rebuilds only when the clear coat comes or goes.
    setWetness(level, rebuild = false) {
      roadWetness.value = level;
      if (!ground) return;
      const material = ground.material,
        coated = material.clearcoat > 0;
      material.color.set(0xc8c8c8).lerp(wetColour, level);
      material.roughness = 1 - 0.25 * level;
      material.clearcoat = 0.55 * level;
      material.clearcoatRoughness = 0.12 + 0.28 * level;
      material.envMapIntensity = 1 + 0.05 * level;
      material.bumpScale = 0.003 - 0.0012 * level;
      // Water fills the pores: a wet road shows less relief.
      material.normalScale.setScalar(1 - 0.45 * level);
      if (rebuild || coated !== material.clearcoat > 0) material.needsUpdate = true;
    },
    update(x, z) {
      roadCenter.value.set(x, z);
      if (ground) ground.position.set(Math.round(x / 30) * 30, -0.003, Math.round(z / 10) * 10);
    },
  };
}
