import { weatherIcon } from './day-bar.js';

// The weather panel, opened from the top panel's weather button: the season
// (summer or winter), the weather (clear, rain or snow, a thunderstorm or a
// blizzard, fog) and whether it changes by itself. Choices apply at once;
// Escape, the button again or a click elsewhere closes it.
const kinds = Object.freeze(['clear', 'rain', 'storm', 'fog']);
const names = {
  summer: { clear: 'Clear', rain: 'Rain', storm: 'Storm', fog: 'Fog' },
  winter: { clear: 'Clear', rain: 'Snow', storm: 'Blizzard', fog: 'Fog' },
};
const iconOf = (kind, season) =>
  season === 'winter' ? ({ rain: 'snow', storm: 'blizzard' }[kind] ?? kind) : kind;

export function setupWeatherPicker(
  container,
  { season, weather, auto, onSeason, onWeather, onAuto }
) {
  const panel = document.createElement('div');
  panel.className = 'look-picker weather-picker';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Season and weather');
  panel.innerHTML = `
    <h3>Season</h3>
    <div class="look-graphics" role="group" aria-label="Season">
      <button type="button" data-season="summer">☀︎ Summer</button>
      <button type="button" data-season="winter">❄︎ Winter</button>
    </div>
    <h3>Weather<span data-name="weather"></span></h3>
    <div class="weather-kinds" role="group" aria-label="Weather">
      ${kinds.map((k) => `<button type="button" data-weather="${k}"></button>`).join('')}
    </div>
    <label class="weather-auto"><input type="checkbox" /> Changes by itself</label>`;
  container.append(panel);
  const state = { season, weather, auto };
  const autoBox = panel.querySelector('.weather-auto input');
  const show = () => {
    for (const b of panel.querySelectorAll('[data-season]'))
      b.setAttribute('aria-pressed', String(b.dataset.season === state.season));
    for (const b of panel.querySelectorAll('[data-weather]')) {
      const k = b.dataset.weather,
        label = names[state.season][k];
      b.innerHTML = `${weatherIcon(iconOf(k, state.season))}<span>${label}</span>`;
      b.title = b.ariaLabel = label;
      b.setAttribute('aria-pressed', String(k === state.weather));
    }
    panel.querySelector('[data-name="weather"]').textContent = names[state.season][state.weather];
    autoBox.checked = state.auto;
  };
  show();
  let opener = null;
  const close = () => {
    panel.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
  };
  panel.addEventListener('click', (e) => {
    const s = e.target.closest('button[data-season]'),
      w = e.target.closest('button[data-weather]');
    if (s) {
      state.season = s.dataset.season;
      onSeason?.(state.season);
    } else if (w) {
      state.weather = w.dataset.weather;
      onWeather?.(state.weather);
    } else return;
    show();
    // The keyboard drives the car again.
    e.target.closest('button')?.blur();
  });
  autoBox.addEventListener('change', () => {
    state.auto = autoBox.checked;
    onAuto?.(state.auto);
    autoBox.blur();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !opener?.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
  return {
    panel,
    get open() {
      return !panel.hidden;
    },
    // What changed elsewhere (the weather changing by itself).
    set({ season: s = state.season, weather: w = state.weather, auto: a = state.auto } = {}) {
      if (s === state.season && w === state.weather && a === state.auto) return;
      Object.assign(state, { season: s, weather: w, auto: a });
      show();
    },
    toggle(button) {
      opener = button;
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    },
    close,
  };
}
