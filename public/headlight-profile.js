const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Peak intensity in candela, about a real low beam's hotspot. The road at a
// grazing angle receives only a small part of it, so a weaker lamp lit just a
// patch in front of the bumper.
export const lowBeamSettings = Object.freeze({
  angle: 0.78,
  range: 70,
  downwardSlope: 0.012,
  intensity: 24000,
});

// A visual approximation of an ECE low beam for right-hand traffic, not a
// measured BMW photometric file. Angles are relative to the projector axis.
// Most light sits just under the cut-off, where it reaches the road 10–30 m
// ahead; the steeper rays toward the near road are much weaker, as in a real
// lamp, so the road is brightest 10–15 m ahead and stays lit to about 50 m
// instead of a bright pool at the bumper.
export function lowBeamProfile(horizontal, vertical) {
  const cutoff = clamp(horizontal * 0.27, 0, 0.014);
  const belowCutoff = 1 - smooth(cutoff - 0.002, cutoff + 0.001, vertical);
  const hotspot = Math.exp(-((horizontal / 0.22) ** 2) - ((vertical + 0.016) / 0.03) ** 2);
  const spread = 0.05 * Math.exp(-((horizontal / 0.42) ** 2) - ((vertical + 0.05) / 0.06) ** 2);
  const foreground = 0.003 * Math.exp(-((horizontal / 0.58) ** 2) - ((vertical + 0.19) / 0.2) ** 2);
  const edge = 1 - smooth(0.66, 0.76, Math.hypot(horizontal, vertical));
  return clamp((hotspot + spread + foreground) * belowCutoff * edge, 0, 1);
}

// High beam: the low beam plus a long-reaching hotspot on the axis (no
// cut-off) and a wide fill, lighting the road far ahead and the verges.
// Intensities are relative to the low beam's peak; the lamp itself is
// brighter (see highBeamSettings).
export function highBeamProfile(horizontal, vertical) {
  const hotspot = Math.exp(-((horizontal / 0.16) ** 2) - ((vertical - 0.004) / 0.035) ** 2);
  const fill = 0.18 * Math.exp(-((horizontal / 0.5) ** 2) - ((vertical + 0.01) / 0.09) ** 2);
  const edge = 1 - smooth(0.66, 0.76, Math.hypot(horizontal, vertical));
  return clamp(Math.max(lowBeamProfile(horizontal, vertical), (hotspot + fill) * edge), 0, 1);
}
export const highBeamSettings = Object.freeze({
  intensity: 60000,
  range: 180,
  downwardSlope: 0.002,
});
