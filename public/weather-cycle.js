// Changing weather: dry spells of a few minutes alternate with showers,
// some of them thunderstorms, and early mornings often bring fog instead.
// Durations are in seconds, drawn evenly from each range.
export const weatherKinds = Object.freeze(['clear', 'rain', 'storm', 'fog']);
export const weatherCycle = Object.freeze({
  clear: Object.freeze([150, 300]),
  rain: Object.freeze([60, 150]),
  storm: Object.freeze([60, 120]),
  fog: Object.freeze([120, 240]),
  // The share of showers that are thunderstorms.
  storms: 0.3,
  // Morning (hours) when a dry spell may give way to fog, and how often.
  fogHours: Object.freeze([4.5, 9]),
  fogChance: 0.6,
  // Seconds over which the weather sets in or clears.
  fade: 10,
});
export const isWet = (kind) => kind === 'rain' || kind === 'storm';

// The weather a toggle or a key steps to next: clear, rain, storm, fog.
export function nextWeather(kind) {
  return weatherKinds[(weatherKinds.indexOf(kind) + 1) % weatherKinds.length];
}

export function createWeatherCycle(random = Math.random) {
  const span = (kind) => {
    const [low, high] = weatherCycle[kind];
    return low + (high - low) * random();
  };
  let kind = 'clear',
    remaining = span(kind);
  return {
    get kind() {
      return kind;
    },
    get raining() {
      return isWet(kind);
    },
    get remaining() {
      return remaining;
    },
    // The driver chose the weather: keep it for a full spell from now. true
    // and false stand for rain and clear.
    set(value) {
      kind =
        typeof value === 'boolean'
          ? value
            ? 'rain'
            : 'clear'
          : weatherKinds.includes(value)
            ? value
            : 'clear';
      remaining = span(kind);
    },
    // Advances the clock at a time of day (hours); true when the weather
    // has just changed.
    update(dt, hours = 13) {
      remaining -= dt;
      if (remaining > 0) return false;
      if (kind !== 'clear') kind = 'clear';
      else {
        const [from, to] = weatherCycle.fogHours;
        const morning = hours >= from && hours < to;
        if (morning && random() < weatherCycle.fogChance) kind = 'fog';
        else kind = random() < weatherCycle.storms ? 'storm' : 'rain';
      }
      remaining = span(kind);
      return true;
    },
  };
}
