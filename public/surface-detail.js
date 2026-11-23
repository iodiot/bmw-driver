// Surface detail for the buildings drawn in plain vertex colours (the
// village, the fuel station): worked out in the shader from where each
// pixel is and which way it faces, so it needs no textures or UVs. Walls
// get a plaster's uneven tone and the dirt splashed up their foot; pitched
// roofs the ribs of corrugated tin running down the slope; flat ground
// slabs (the forecourt) the joints between their concrete panels.
export function addSurfaceDetail(material, { joints = 0 } = {}) {
  if (material.userData.surfaceDetail) return material;
  material.userData.surfaceDetail = true;
  const before = material.onBeforeCompile,
    key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.vertexShader =
      'varying vec3 vDetailPosition;\nvarying vec3 vDetailNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // (In the object's world frame before the land lifts it, so heights
        // are above its own ground.)
        vDetailPosition = (modelMatrix * vec4(transformed, 1.)).xyz;
        vDetailNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader =
      `varying vec3 vDetailPosition;
      varying vec3 vDetailNormal;
      float detailHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float detailNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(
          mix(mix(detailHash(i), detailHash(i + vec3(1, 0, 0)), f.x),
              mix(detailHash(i + vec3(0, 1, 0)), detailHash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(detailHash(i + vec3(0, 0, 1)), detailHash(i + vec3(1, 0, 1)), f.x),
              mix(detailHash(i + vec3(0, 1, 1)), detailHash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      ` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 n = normalize(vDetailNormal);
          vec3 p = vDetailPosition;
          float up = abs(n.y);
          // Walls: plaster, a little uneven, and dirtier toward the ground.
          float wall = 1. - smoothstep(.25, .4, up);
          float plaster = .55 * detailNoise(p * 2.3) + .3 * detailNoise(p * 9.) + .15 * detailNoise(p * 31.);
          diffuseColor.rgb *= mix(1., .88 + .2 * plaster, wall);
          diffuseColor.rgb *= mix(1., mix(.72, 1., smoothstep(.05, .7, p.y)), wall);
          // Pitched roofs: corrugated, the ribs running down the slope.
          float roof = smoothstep(.3, .4, n.y) * (1. - smoothstep(.93, .985, n.y));
          if (roof > 0.) {
            vec2 down = normalize(n.xz + 1e-5);
            float across = dot(p.xz, vec2(-down.y, down.x));
            float rib = .5 + .5 * cos(across * 6.2831853 / .14);
            float aa = clamp(fwidth(across) / .14, 0., 1.);
            rib = mix(rib, .5, aa);
            diffuseColor.rgb *= mix(1., .8 + .26 * rib + .08 * detailNoise(p * 1.7), roof);
          }
          ${
            joints > 0
              ? `// Flat slabs at the ground: joints between the panels.
          float slab = smoothstep(.97, .99, n.y) * (1. - smoothstep(.2, .3, p.y));
          if (slab > 0.) {
            vec2 cell = abs(fract(p.xz / ${joints.toFixed(2)} + .5) - .5) * ${joints.toFixed(2)};
            float edge = min(cell.x, cell.y);
            float joint = 1. - smoothstep(.015, .035 + fwidth(edge), edge);
            // Fading out once a joint is thinner than a pixel, so it does not
            // shimmer from afar.
            joint *= 1. - smoothstep(.015, .06, fwidth(edge));
            diffuseColor.rgb *= mix(1., .62, joint * slab);
            diffuseColor.rgb *= mix(1., .9 + .16 * detailNoise(p * .9), slab);
          }`
              : ''
          }
        }`
      );
  };
  material.customProgramCacheKey = () => `${key ? key.call(material) : ''}|surface-detail${joints}`;
  material.needsUpdate = true;
  return material;
}
