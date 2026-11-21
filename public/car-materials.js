// Material refinements for the imported model: metallic flakes under the
// paint's clear coat, and separate rubber and alloy response on the wheels.
// The GLB stays unmodified; shaders are extended at runtime.

// Flake cell size in metres. Flakes fade out where a cell becomes smaller
// than a pixel, so distant paint does not shimmer.
export const paintFlakes = Object.freeze({ cell: 0.0011, strength: 0.32 });

export function addPaintFlakes(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlakePosition;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Object-space position in metres, so flakes stay fixed on the body.
        vFlakePosition = position * length(modelMatrix[0].xyz);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlakePosition;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 flakePosition = vFlakePosition / ${paintFlakes.cell.toFixed(5)};
          vec3 cell = floor(flakePosition);
          vec3 tilt = fract(sin(vec3(dot(cell, vec3(12.9898, 78.233, 37.719)),
            dot(cell, vec3(39.346, 11.135, 83.155)),
            dot(cell, vec3(73.156, 52.235, 9.151)))) * 43758.5453) - .5;
          float flakeFade = 1. - smoothstep(.35, 1., length(fwidth(flakePosition)));
          // The clear coat keeps the unperturbed normal and stays mirror-smooth.
          normal = normalize(normal + tilt * ${paintFlakes.strength.toFixed(2)} * flakeFade);
        }`
      );
  };
  material.customProgramCacheKey = () => 'm5-paint-flakes';
  material.needsUpdate = true;
}

// Wheels share one texture for alloy and tyre. Dark texels are rubber: matte
// and a deep grey rather than pure black. Lighter texels are machined alloy.
export function refineWheelMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wheelLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        float rubber = 1. - smoothstep(.035, .11, wheelLuma);
        roughnessFactor = mix(.34, .92, rubber);
        diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb, vec3(.03, .029, .028)), rubber);`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(.7, 0., rubber);`
      );
  };
  material.customProgramCacheKey = () => 'm5-wheel-rubber-alloy';
  material.needsUpdate = true;
}

export function refineCarMaterials(root) {
  const seen = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      if (material.name === 'M5_F10_Paint') addPaintFlakes(material);
      if (material.name === 'Bmwm50011_diff') refineWheelMaterial(material);
    }
  });
}
