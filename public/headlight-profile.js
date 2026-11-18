const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const lowBeamSettings = Object.freeze({
  angle: 0.78,
  range: 70,
  downwardSlope: 0.012,
  intensity: 1800,
});

// A visual approximation of an ECE low beam for right-hand traffic, not a
// measured BMW photometric file. Angles are relative to the projector axis.
export function lowBeamProfile(horizontal, vertical) {
  const cutoff = clamp(horizontal * 0.27, 0, 0.014);
  const belowCutoff = 1 - smooth(cutoff - 0.002, cutoff + 0.001, vertical);
  const hotspot = Math.exp(-((horizontal / 0.18) ** 2) - ((vertical + 0.032) / 0.028) ** 2);
  const spread = 0.16 * Math.exp(-((horizontal / 0.42) ** 2) - ((vertical + 0.075) / 0.085) ** 2);
  const foreground = 0.025 * Math.exp(-((horizontal / 0.58) ** 2) - ((vertical + 0.19) / 0.2) ** 2);
  const edge = 1 - smooth(0.66, 0.76, Math.hypot(horizontal, vertical));
  return clamp((hotspot + spread + foreground) * belowCutoff * edge, 0, 1);
}
