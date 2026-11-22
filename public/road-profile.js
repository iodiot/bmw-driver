import { roadSeed, seededRandom } from './road-seed.js';
// Shared road geometry for the visible asphalt, roadside, physics and effects.
//
// The road follows a curving centre line z = roadCenterZ(x). All road
// features (lanes, paint, verges, guardrails, obstacles) are placed by their
// lateral offset z - roadCenterZ(x). Three bends of unrelated lengths add up
// to an ever-changing road: long sweepers, tighter bends down to a radius of
// about 550 m, and straights where they cancel. All three bend the same way at
// x = 0, so the drive opens with a 550 m bend. The road stays within about
// 18° of the x axis, so lateral offsets stay within 5% of true distances.
const originalCurve = [
  { amplitude: 60, wavelength: 2400 },
  { amplitude: 14, wavelength: 900 },
  { amplitude: 5, wavelength: 530 },
];
// Another layout's bends: each term's length changed by up to a third and
// its direction drawn, its amplitude from a share of the same curvature
// (the tightest radius stays at least 550 m) and within the same 18°.
function drawnCurve(random) {
  const terms = originalCurve.map(({ wavelength }) => ({
    wavelength: Math.round(wavelength * (0.8 + 0.5 * random())),
    share: 0.15 + 0.35 * random(),
    sign: random() < 0.5 ? -1 : 1,
  }));
  const shares = terms.reduce((sum, t) => sum + t.share, 0);
  const curvature = (1 / 550) * (0.7 + 0.3 * random());
  let out = terms.map(({ wavelength, share, sign }) => {
    const k = (2 * Math.PI) / wavelength;
    return { amplitude: (sign * curvature * share) / shares / (k * k), wavelength };
  });
  const slope = out.reduce(
    (sum, t) => sum + Math.abs(t.amplitude) * ((2 * Math.PI) / t.wavelength),
    0
  );
  if (slope > 0.32) out = out.map((t) => ({ ...t, amplitude: (t.amplitude * 0.32) / slope }));
  return out.map((t) => ({ ...t, amplitude: Math.round(t.amplitude * 100) / 100 }));
}
export const roadCurve = Object.freeze(
  (roadSeed ? drawnCurve(seededRandom(roadSeed, 1)) : originalCurve).map((t) => Object.freeze(t))
);
const curveTerms = roadCurve.map(({ amplitude, wavelength }) => ({
  a: amplitude,
  k: (2 * Math.PI) / wavelength,
}));
// Each term is a(1 - cos kx): the road starts straight and centred at x = 0.
export function roadCenterZ(x) {
  return curveTerms.reduce((z, { a, k }) => z + a * (1 - Math.cos(k * x)), 0);
}
export function roadCenterSlope(x) {
  return curveTerms.reduce((s, { a, k }) => s + a * k * Math.sin(k * x), 0);
}
export function roadLateral(x, z) {
  return z - roadCenterZ(x);
}

// Three 3.6 m lanes between edge lines at ±5.4 m.
export const roadLanes = Object.freeze([-3.6, 0, 3.6]);
export const roadEdge = 5.4;
// Guardrails stand this far from the road centre; the beam's face is a few
// centimetres nearer the road.
export const guardrailOffset = 7.3;
export const guardrailFace = guardrailOffset - 0.045;
export const railFaceGap = guardrailOffset - guardrailFace;

// A country road branching off. Every `period` metres it leaves the right
// lane, swings out to run `separation` metres from the road centre behind a
// grass strip, and rejoins the right lane. It is unpaved and has no
// guardrails; the main road's right rail opens where it leaves and rejoins.
export const roadBranch = Object.freeze({
  start: 300,
  period: 3000,
  diverge: 300,
  length: 600,
  separation: 42,
  halfWidth: 2.2,
  // The main road's right rail stands again once the branch's inner edge is
  // this far from the road centre.
  railFrom: 13,
});
const branchSpan = 2 * roadBranch.diverge + roadBranch.length;
// Distance into the current branch section, or -1 outside one.
function branchLocal(x) {
  const { start, period } = roadBranch;
  const u = (((x - start) % period) + period) % period;
  return u <= branchSpan ? u : -1;
}
// Lateral offset of the branch centre line from the road centre, or null
// where there is no branch. It starts and ends on the right lane centre.
export function branchOffset(x) {
  const u = branchLocal(x);
  if (u < 0) return null;
  const { diverge, separation } = roadBranch,
    lane = roadLanes.at(-1);
  const out = smooth(0, diverge, u) - smooth(branchSpan - diverge, branchSpan, u);
  return lane + (separation - lane) * out;
}
// Distance from x to the start of the next branch section (0 inside one).
export function nextBranch(x) {
  if (branchLocal(x) >= 0) return 0;
  const { start, period } = roadBranch;
  return period - ((((x - start) % period) + period) % period);
}

// Guardrails at x, each by its lateral offset and the side its traffic is on
// (0: both sides, so a car coming from the field is stopped as well as one
// from the road). The main road has rails on both sides; the right one
// opens where the country road leaves and rejoins.
export function guardrailsAt(x) {
  const rails = [{ lateral: -guardrailOffset, traffic: 0 }];
  const branch = branchOffset(x);
  if (branch === null || branch - roadBranch.halfWidth > roadBranch.railFrom)
    rails.push({ lateral: guardrailOffset, traffic: 0 });
  return rails;
}

// Obstacles repeat every roadPeriod metres. z is the lateral offset from the
// road centre; ±0.81 m from a lane centre is a wheel track.
// Obstacles repeat every `roadPeriod` metres: 120 m in the original layout,
// 600 m in a drawn one, so the same bump comes round far less often.
export const roadPeriod = roadSeed ? 600 : 120;
const originalObstacles = [
  // Centre lane.
  { x: 12, z: 0.81, l: 1.3, w: 0.66, h: 0.065 },
  { x: 24, z: -0.81, l: 1.3, w: 0.66, h: 0.065 },
  { x: 49, z: 0.81, l: 1.25, w: 0.66, h: -0.075 },
  { x: 60, z: -0.81, l: 1.25, w: 0.66, h: -0.075 },
  { x: 73, z: 0.81, l: 1.45, w: 0.7, h: -0.07 },
  { x: 73, z: -0.81, l: 1.45, w: 0.7, h: -0.07 },
  // Speed bumps across the full carriageway.
  { x: 36, z: 0, l: 1.5, w: 10.8, h: 0.085 },
  { x: 90, z: 0, l: 6.4, w: 10.8, h: 0.075, table: true },
  // Left lane (−3.6 m).
  { x: 6, z: -4.41, l: 1.3, w: 0.7, h: -0.072 },
  { x: 29, z: -2.79, l: 1.25, w: 0.66, h: 0.06 },
  { x: 55, z: -4.41, l: 1.5, w: 0.8, h: -0.078 },
  { x: 104, z: -2.79, l: 1.35, w: 0.7, h: -0.07 },
  // Right lane (+3.6 m).
  { x: 18, z: 4.41, l: 1.35, w: 0.7, h: -0.074 },
  { x: 44, z: 2.79, l: 1.3, w: 0.66, h: 0.062 },
  { x: 66, z: 2.79, l: 1.4, w: 0.72, h: -0.076 },
  { x: 112, z: 4.41, l: 1.3, w: 0.66, h: -0.07 },
];
// Another layout's obstacles, over 600 m: seven to twelve potholes of
// different sizes anywhere in the lanes, and now and then (one layout in
// two) a speed bump across the road.
function drawnObstacles(random) {
  const pick = (low, high) => low + (high - low) * random();
  const round = (v, step) => Math.round(v / step) * step;
  const list = [],
    taken = [];
  const free = (x, gap) => x > 8 && x < roadPeriod - 8 && taken.every((t) => Math.abs(t - x) > gap);
  if (random() < 0.5) {
    const x = pick(60, roadPeriod - 60);
    taken.push(x);
    list.push(
      random() < 0.4
        ? { x: round(x, 0.1), z: 0, l: 6.4, w: 10.8, h: 0.07, table: true }
        : { x: round(x, 0.1), z: 0, l: 1.5, w: 10.8, h: round(pick(0.06, 0.08), 0.001) }
    );
  }
  const holes = 7 + Math.floor(random() * 6);
  for (let n = 0, tries = 0; n < holes && tries < 300; tries++) {
    const x = pick(0, roadPeriod);
    if (!free(x, 14)) continue;
    taken.push(x);
    n++;
    const lane = roadLanes[Math.floor(random() * roadLanes.length)];
    list.push({
      x: round(x, 0.1),
      z: round(lane + pick(-1.2, 1.2), 0.01),
      l: round(pick(0.7, 1.6), 0.01),
      w: round(pick(0.5, 1.05), 0.01),
      h: -round(pick(0.04, 0.07), 0.001),
    });
  }
  return list.sort((a, b) => a.x - b.x);
}
export const obstacles = roadSeed ? drawnObstacles(seededRandom(roadSeed, 2)) : originalObstacles;
// The original straight test track: centre-lane bumps and holes only, two
// 3.3 m speed bumps, no curves and no guardrails. Vehicle tests use it to
// check the car itself, independent of the road layout.
export const testTrackObstacles = [
  { x: 12, z: 0.81, l: 1.3, w: 0.66, h: 0.065 },
  { x: 24, z: -0.81, l: 1.3, w: 0.66, h: 0.065 },
  { x: 36, z: 0, l: 1.5, w: 3.3, h: 0.085 },
  { x: 49, z: 0.81, l: 1.25, w: 0.66, h: -0.075 },
  { x: 60, z: -0.81, l: 1.25, w: 0.66, h: -0.075 },
  { x: 73, z: 0.81, l: 1.45, w: 0.7, h: -0.07 },
  { x: 73, z: -0.81, l: 1.45, w: 0.7, h: -0.07 },
  { x: 90, z: 0, l: 6.4, w: 3.3, h: 0.075, table: true },
];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// A pothole's depth (0 to 1) at u, v (along and across, in half-lengths
// from its centre): an irregular outline of its own, steep broken sides
// and an uneven floor. The road's shader draws the same shape.
export const potholePhases = (o) => [o.x * 1.7 + o.z, o.x * 0.61 - o.z * 2.3];
export function potholeDepth(o, u, v) {
  const r = Math.hypot(u, v);
  if (r >= 1.3) return 0;
  const [p1, p2] = potholePhases(o);
  const a = Math.atan2(v, u);
  const edge = 0.9 + 0.16 * Math.sin(3 * a + p1) + 0.09 * Math.sin(5 * a + p2);
  return (1 - smooth(0.7, 1, r / edge)) * (0.85 + 0.15 * Math.cos(u * 4 + p1));
}
function heightOf(list, x, lateral) {
  let height = 0;
  for (const o of list) {
    const dx =
      ((((x - o.x + roadPeriod / 2) % roadPeriod) + roadPeriod) % roadPeriod) - roadPeriod / 2;
    if (o.h < 0) {
      height += o.h * potholeDepth(o, dx / (o.l / 2), (lateral - o.z) / (o.w / 2));
      continue;
    }
    const u = Math.abs(dx) / (o.l / 2),
      v = Math.abs(lateral - o.z) / (o.w / 2);
    if (u >= 1 || v >= 1) continue;
    const along = o.table ? 1 - smooth(0.65, 1, u) : 0.5 + 0.5 * Math.cos(Math.PI * u);
    const across = 1 - smooth(o.h < 0 ? 0 : 0.72, 1, v);
    height += o.h * along * across;
  }
  return height;
}
export function roadHeight(x, z) {
  return heightOf(obstacles, x, roadLateral(x, z));
}
export function testTrackHeight(x, z) {
  return heightOf(testTrackObstacles, x, z);
}
// What the tyres run on. Grip is relative to dry asphalt (dry and wet:
// loose gravel and grass are slippery, wet dirt turns to mud), rolling is the
// rolling-resistance coefficient, and roughness the height (m) of the bumps
// the wheels ride over off the asphalt.
export const surfaces = Object.freeze({
  asphalt: Object.freeze({ grip: 1, wetGrip: 0.536, rolling: 0.013, roughness: 0 }),
  gravel: Object.freeze({ grip: 0.62, wetGrip: 0.48, rolling: 0.035, roughness: 0.012 }),
  dirt: Object.freeze({ grip: 0.68, wetGrip: 0.36, rolling: 0.03, roughness: 0.018 }),
  grass: Object.freeze({ grip: 0.5, wetGrip: 0.3, rolling: 0.06, roughness: 0.028 }),
});
// The surface at a world point: the carriageway and its asphalt shoulders,
// the country road's packed dirt, the gravel strips beside the motorway and
// grass everywhere else.
export function surfaceAt(x, z) {
  const lateral = roadLateral(x, z);
  if (Math.abs(lateral) < 6.15) return 'asphalt';
  const branch = branchOffset(x);
  if (branch !== null && Math.abs(lateral - branch) < roadBranch.halfWidth) return 'dirt';
  if (Math.abs(lateral) < 7.7) return 'gravel';
  return 'grass';
}
// Bumps off the asphalt: smooth undulations a couple of centimetres high and
// one to four metres long (a sum of slanted waves of unrelated lengths).
export function surfaceRoughness(x, z, surface = surfaceAt(x, z)) {
  const amplitude = surfaces[surface].roughness;
  if (!amplitude) return 0;
  return (
    amplitude *
    (0.5 * Math.sin(1.7 * x + 0.6 * z) +
      0.3 * Math.sin(-0.9 * x + 2.3 * z + 1.3) +
      0.2 * Math.sin(3.1 * x - 1.4 * z + 0.4))
  );
}
export function roadSurfaceHeight(x, z) {
  return roadHeight(x, z) + surfaceRoughness(x, z);
}

// Surfaces the driving simulation can run on.
// Guardrails line the main road (see guardrailsAt); false removes them all,
// with their collisions and sparks.
export const guardrailsEnabled = true;
export const road = Object.freeze({
  height: roadSurfaceHeight,
  guardrails: guardrailsEnabled,
  surfaceAt,
});
// The road with its guardrails regardless of the switch, for rail tests.
export const guardedRoad = Object.freeze({
  height: roadSurfaceHeight,
  guardrails: true,
  surfaceAt,
});
export const straightTestTrack = Object.freeze({ height: testTrackHeight, guardrails: false });
// Slope dz/dx of the guardrail at a lateral offset: the road's slope plus
// the rate the rail moves away from the centre line (on the branch).
export function guardrailSlope(x, lateral, h = 0.5) {
  const near = (at) =>
    guardrailsAt(at).reduce((best, rail) =>
      Math.abs(rail.lateral - lateral) < Math.abs(best.lateral - lateral) ? rail : best
    ).lateral;
  return roadCenterSlope(x) + (near(x + h) - near(x - h)) / (2 * h);
}
const f = (n) => Number(n).toFixed(6);
export const roadProfileGLSL = `
float roadCenterZ(float x) {
  return ${curveTerms.map(({ a, k }) => `${f(a)} * (1. - cos(${f(k)} * x))`).join(' + ')};
}
// Branch centre offset from the road centre; negative where there is none.
float branchOffset(float x) {
  float u = mod(x - ${f(roadBranch.start)}, ${f(roadBranch.period)});
  if (u > ${f(branchSpan)}) return -1.;
  float swing = smoothstep(0., ${f(roadBranch.diverge)}, u) -
    smoothstep(${f(branchSpan - roadBranch.diverge)}, ${f(branchSpan)}, u);
  return ${f(roadLanes.at(-1))} + ${f(roadBranch.separation - roadLanes.at(-1))} * swing;
}
float roadHeight(vec2 p) {
  float h = 0.;
  float lateral = p.y - roadCenterZ(p.x);
 ${obstacles
   .map((o) =>
     o.h < 0
       ? `{
    float u = (mod(p.x - ${f(o.x)} + ${f(roadPeriod / 2)}, ${f(roadPeriod)}) - ${f(roadPeriod / 2)}) / ${f(o.l / 2)};
    float v = (lateral - (${f(o.z)})) / ${f(o.w / 2)};
    float r = length(vec2(u, v));
    if (r < 1.3) {
      float a = atan(v, u);
      float edge = .9 + .16 * sin(3. * a + ${f(potholePhases(o)[0])}) + .09 * sin(5. * a + ${f(potholePhases(o)[1])});
      h += ${f(o.h)} * (1. - smoothstep(.7, 1., r / edge)) * (.85 + .15 * cos(u * 4. + ${f(potholePhases(o)[0])}));
    }
  }`
       : `{
    float u = abs(mod(p.x - ${f(o.x)} + ${f(roadPeriod / 2)}, ${f(roadPeriod)}) - ${f(roadPeriod / 2)}) / ${f(o.l / 2)};
    float v = abs(lateral - (${f(o.z)})) / ${f(o.w / 2)};
    if (u < 1. && v < 1.) h += ${f(o.h)} *
      ${o.table ? '(1. - smoothstep(.65, 1., u))' : '(.5 + .5 * cos(3.14159265359 * u))'} *
      (1. - smoothstep(${o.h < 0 ? '0.' : '.72'}, 1., v));
  }`
   )
   .join('\n')}
  return h;
}
`;
