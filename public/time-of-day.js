// Time of day: a summer day with sunrise near 7:00, the sun 43° high at 13:00
// (as in the sky photograph), sunset near 19:00, and twilight on either side.
// Everything the scene needs for an hour is derived here, so the lighting,
// sky and fog change together and smoothly.
export const dayCycle = Object.freeze({
  // Real minutes for a full 24-hour day.
  minutesPerDay: 24,
  start: 13,
  presets: Object.freeze({ day: 13, sunset: 18.9, night: 23 }),
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const mixColour = (a, b, t) => a.map((v, i) => mix(v, b[i], t));

export const wrapHours = (hours) => ((hours % 24) + 24) % 24;

// Sun elevation in degrees.
export function sunElevation(hours) {
  return 53 * Math.sin((Math.PI * (wrapHours(hours) - 6.2)) / 13.6) - 10;
}

export function formatClock(hours) {
  const minutes = Math.floor(wrapHours(hours) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function dayPhase(hours) {
  const elevation = sunElevation(hours);
  if (elevation > 10) return 'Day';
  if (elevation < -6) return 'Night';
  return wrapHours(hours) < 12 ? 'Dawn' : 'Dusk';
}

// Scene conditions for an hour, dry or wet: `raining` is true or false, or
// how far rain has set in (0 to 1), so the sky darkens as it comes.
export function daylight(hours, raining = false) {
  const wet = Math.max(0, Math.min(1, Number(raining)));
  const elevation = sunElevation(hours);
  // 0 in daylight, 1 after civil twilight.
  const darkness = 1 - smooth(-6, 3, elevation);
  // Golden light and a glowing horizon while the sun is low.
  const sunset = Math.exp(-(((elevation - 2) / 7) ** 2)) * mix(1, 0.25, wet);
  // The photographed sky (its sun stands 43° high) shows once the sun is
  // well up; low sun and night use the procedural sky.
  const photo = (1 - wet) * smooth(10, 22, elevation);
  // The direct light is the sun while it is up and the moon at night. Both
  // are faint around the switch, so it is never seen to jump.
  const sunUp = elevation > -4;
  const direct = sunUp
    ? 3 * smooth(-2, 12, elevation) * mix(1, 0.25, wet)
    : 0.35 * smooth(-4, -10, elevation) * mix(1, 0.65, wet);
  // Skylight fades gradually as the sun sinks, well before it sets: at
  // sunset the fields are already dim under a glowing sky.
  const dim = 1 - smooth(-6, 20, elevation);
  const directColour = sunUp ? mixColour([1, 1, 1], [1, 0.62, 0.38], sunset) : [0.71, 0.79, 1];
  return {
    hours: wrapHours(hours),
    elevation,
    darkness,
    sunset,
    photo,
    sunUp,
    direct,
    directColour,
    ambient: mix(mix(1, 1.05, wet), mix(0.3, 0.25, wet), dim),
    ambientColour: mixColour(
      mixColour([0.86, 0.93, 1], [1, 0.8, 0.68], sunset * 0.5),
      [0.55, 0.66, 0.87],
      darkness
    ),
    fill: mix(mix(1, 0.7, wet), 0.15, dim),
    // Discrete systems: low beams from early dusk, night-time lamps and
    // materials once it is mostly dark.
    lowBeams: darkness > 0.3,
    night: darkness > 0.5,
  };
}
