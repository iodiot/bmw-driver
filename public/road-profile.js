// Shared road dimensions for the visible asphalt and tyre contact calculation.
export const roadPeriod = 120;
export const obstacles = [
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
export function roadHeight(x, z) {
  let height = 0;
  for (const o of obstacles) {
    const dx =
      ((((x - o.x + roadPeriod / 2) % roadPeriod) + roadPeriod) % roadPeriod) - roadPeriod / 2;
    const u = Math.abs(dx) / (o.l / 2),
      v = Math.abs(z - o.z) / (o.w / 2);
    if (u >= 1 || v >= 1) continue;
    const along = o.table ? 1 - smooth(0.65, 1, u) : 0.5 + 0.5 * Math.cos(Math.PI * u);
    const across = 1 - smooth(o.h < 0 ? 0 : 0.72, 1, v);
    height += o.h * along * across;
  }
  return height;
}
const f = (n) => Number(n).toFixed(6);
export const roadProfileGLSL = `
float roadHeight(vec2 p) {
  float h = 0.;
 ${obstacles
   .map(
     (o) => `{
    float u = abs(mod(p.x - ${f(o.x)} + 60., 120.) - 60.) / ${f(o.l / 2)};
    float v = abs(p.y - (${f(o.z)})) / ${f(o.w / 2)};
    if (u < 1. && v < 1.) h += ${f(o.h)} *
      ${o.table ? '(1. - smoothstep(.65, 1., u))' : '(.5 + .5 * cos(3.14159265359 * u))'} *
      (1. - smoothstep(${o.h < 0 ? '0.' : '.72'}, 1., v));
  }`
   )
   .join('\n')}
  return h;
}
`;
