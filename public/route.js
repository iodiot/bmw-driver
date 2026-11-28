import * as THREE from 'three';

// Real roads to drive instead of the endless one: Zhytomyr to Kyiv on the
// M-06, and Dnipro to Zaporizhzhia on the N-08 (see tools/routes). Each has
// its own link, the site's ?kyiv and ?zp (the old /kyiv/ and /zp/ pages
// send there; ?route=m06 or n08 does the same, ?route=endless the
// opposite), to send to friends; the endless road stays at the main one.
//
// x is the distance from the start, just past the first city's streets. The road's
// centre line (z) follows the real bends, unbent into the game's shape, and
// the land's height is the real height above sea level (SRTM), smoothed.
// Outside a browser (the tests) there is no route.
export const routes = Object.freeze(['endless', 'm06', 'n08']);
// Each route's link: ?kyiv, ?zp.
export const routePaths = Object.freeze({ kyiv: 'm06', zp: 'n08' });
export const routePath = 'kyiv';

export function routeFor(pathname = '', search = '') {
  const query = new URLSearchParams(search);
  const asked = query.get('route');
  if (routes.includes(asked)) return asked;
  for (const [path, name] of Object.entries(routePaths)) if (query.has(path)) return name;
  const last = pathname.replace(/\/+$/, '').split('/').pop();
  return routePaths[last] ?? 'endless';
}
const chosenRoute = () =>
  typeof location === 'undefined' ? 'endless' : routeFor(location.pathname, location.search);

const decode = (text) => {
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return new Float32Array(bytes.buffer);
};

// The heights are given relative to this (the endless road's land lies
// about here too).
export const routeDatum = 170;

// A curve through samples (a Catmull-Rom spline), `fine` points to each
// step: the road bends smoothly between them instead of running straight
// and turning at each one.
export function refineSamples(array, fine) {
  const n = array.length;
  if (n < 2 || fine <= 1) return Float32Array.from(array);
  const out = new Float32Array((n - 1) * fine + 1);
  for (let i = 0; i < n - 1; i++) {
    const p0 = array[Math.max(0, i - 1)],
      p1 = array[i],
      p2 = array[i + 1],
      p3 = array[Math.min(n - 1, i + 2)];
    for (let k = 0; k < fine; k++) {
      const t = k / fine;
      out[i * fine + k] =
        0.5 *
        (2 * p1 +
          (p2 - p0) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    }
  }
  out[out.length - 1] = array[n - 1];
  return out;
}
// The road's samples are refined to this many to each of the route's.
export const routeRefine = 4;

export function makeRoute(data) {
  const centre = refineSamples(
    typeof data.centre === 'string' ? decode(data.centre) : data.centre,
    routeRefine
  );
  const height = refineSamples(
    typeof data.height === 'string' ? decode(data.height) : data.height,
    routeRefine
  );
  const step = data.step / routeRefine,
    { length } = data;
  const last = centre.length - 1;
  // Linear between samples, held level beyond the ends.
  const at = (array, x) => {
    const f = Math.min(last, Math.max(0, x / step));
    const i = Math.min(last - 1, Math.floor(f));
    return array[i] + (array[i + 1] - array[i]) * (f - i);
  };
  const slopeOf = (array, x) => {
    if (x <= 0 || x >= length) return 0;
    const i = Math.min(last - 1, Math.floor(x / step));
    return (array[i + 1] - array[i]) / step;
  };
  // Both into one float texture (R: centre, G: height above the datum),
  // 1024 samples to a row, for the shaders.
  const width = 1024,
    rows = Math.ceil(centre.length / width);
  const texels = new Float32Array(width * rows * 2);
  for (let i = 0; i < centre.length; i++) {
    texels[i * 2] = centre[i];
    texels[i * 2 + 1] = height[i] - routeDatum;
  }
  const texture = new THREE.DataTexture(texels, width, rows, THREE.RGFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return {
    name: data.name,
    road: data.road,
    // Lanes each way (three unless the route says otherwise).
    lanes: data.lanes ?? 3,
    from: data.from,
    to: data.to,
    // (Its name as “to Kyiv” and “in Kyiv” want it.)
    toGenitive: data.toGenitive ?? data.to,
    toLocative: data.toLocative ?? data.to,
    // What its green distance boards count down to.
    boards: data.boards ?? [],
    step,
    length,
    places: data.places ?? [],
    // Checkpoints: where each one's first row of blocks stands.
    checkpoints: data.checkpoints ?? [],
    // The fuel stations by the road: [along, across] (right positive).
    fuel: data.fuel ?? null,
    // What stands beside it, from OpenStreetMap (route-land.js), if known.
    land: data.land ?? null,
    texture,
    samples: centre.length,
    width,
    centreZ: (x) => at(centre, x),
    centreSlope: (x) => slopeOf(centre, x),
    // Height above the datum, and its grade.
    height: (x) => at(height, x) - routeDatum,
    grade: (x) => slopeOf(height, x),
    // Metres still to go to the end.
    toGo: (x) => Math.max(0, length - x),
  };
}

async function loadRoute(name) {
  const response = await fetch(new URL(`./assets/route-${name}.json`, import.meta.url));
  if (!response.ok) throw new Error('Route unavailable');
  return makeRoute(await response.json());
}

export const routeName = chosenRoute();
export const route = routeName === 'endless' ? null : await loadRoute(routeName).catch(() => null);
// Its own title in the tab and the bookmarks.
if (route && typeof document !== 'undefined')
  document.title = `BMW M5 F10 · ${route.from} → ${route.to}`;

// The same in GLSL: routeAt(x) gives (centre z, height), from the texture.
export const routeGLSL = route
  ? `
uniform sampler2D routeMap;
vec2 routeAt(float x) {
  float f = clamp(x / ${route.step.toFixed(4)}, 0., ${(route.samples - 1.001).toFixed(3)});
  int i = int(f);
  vec2 a = texelFetch(routeMap, ivec2(i % ${route.width}, i / ${route.width}), 0).rg;
  vec2 b = texelFetch(routeMap, ivec2((i + 1) % ${route.width}, (i + 1) / ${route.width}), 0).rg;
  return mix(a, b, f - float(i));
}
`
  : '';
// For the shader materials of our own that use it.
export const routeUniforms = route ? { routeMap: { value: route.texture } } : {};
