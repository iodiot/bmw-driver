// Changing weather: dry spells of a few minutes alternate with showers.
// Durations are in seconds, drawn evenly from each range.
export const weatherCycle = Object.freeze({
  clear: Object.freeze([150, 300]),
  rain: Object.freeze([60, 150]),
  // Seconds over which the rain sets in or eases off.
  fade: 8,
});

export function createWeatherCycle(random = Math.random) {
  const span = (rain) => {
    const [low, high] = rain ? weatherCycle.rain : weatherCycle.clear;
    return low + (high - low) * random();
  };
  let raining = false,
    remaining = span(false);
  return {
    get raining() {
      return raining;
    },
    get remaining() {
      return remaining;
    },
    // The driver chose the weather: keep it for a full spell from now.
    set(value) {
      raining = Boolean(value);
      remaining = span(raining);
    },
    // Advances the clock; true when the weather has just changed.
    update(dt) {
      remaining -= dt;
      if (remaining > 0) return false;
      raining = !raining;
      remaining = span(raining);
      return true;
    },
  };
}
