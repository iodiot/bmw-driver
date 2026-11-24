// The car radio: Ukrainian stations live, through a plain <audio> element.
// Their streams send no CORS headers, so the page cannot route them through
// WebAudio (it would play silence); the radio therefore sits beside the
// car's sound rather than in it, and a recorded video has the car without
// the music.
export const radioStations = Object.freeze([
  { name: 'Hit FM', note: 'Ukrainian hits', url: 'https://online.hitfm.ua/HitFM_Ukr' },
  { name: 'Radio ROKS', note: 'Ukrainian rock', url: 'https://online.radioroks.ua/RadioROKS_Ukr' },
  { name: 'Kiss FM', note: 'Ukrainian dance', url: 'https://online.kissfm.ua/KissFM_Ukr' },
  {
    name: 'Radio Relax',
    note: 'Ukrainian chill',
    url: 'https://online.radiorelax.ua/RadioRelax_Ukr',
  },
  { name: 'Nashe Radio', note: 'Ukrainian music', url: 'https://online.nasheradio.ua/NasheRadio' },
]);

// The station after `index` (-1 is off): through the list, then off again.
export function nextStation(index, count = radioStations.length) {
  return index + 1 >= count ? -1 : index + 1;
}

// How loud the music plays for the sound's volume (0–100): from the cabin
// as the car's own speakers, from outside muffled by the glass.
export function radioVolume(volume, inside) {
  const level = Math.max(0, Math.min(1, Number(volume) / 100));
  return level * (0.24 + 0.4 * Math.max(0, Math.min(1, inside)));
}

const storageKey = 'bmw-driver:radio';
// The station to start on (its index; -1 is off): the one chosen on the
// last visit, off if it was turned off, and on a first visit the first
// station (it plays from the first click or key, as browsers allow).
export function keptStation(stored, count = radioStations.length) {
  if (String(stored) === '-1') return -1;
  if (stored === null || stored === undefined || !/^\d+$/.test(String(stored))) return 0;
  const index = Number(stored);
  return index < count ? index : 0;
}

// `sound`: the sound checkbox (unticked mutes the radio too); `volume`: the
// volume slider; `onChange({ station, state })` when the station or its
// state changes ('off', 'tuning', 'on', 'waiting' for a click, 'muted' with
// the sound off, 'error').
export function setupRadio({ sound, volume, onChange }) {
  const audio = new Audio();
  audio.preload = 'none';
  let index = 0,
    state = 'off',
    inside = 1;
  try {
    index = keptStation(localStorage.getItem(storageKey));
  } catch {
    // No storage: the first station, as on a first visit.
  }
  const station = () => radioStations[index] ?? null;
  const setState = (next) => {
    if (next === state) return;
    state = next;
    onChange?.({ station: station(), state });
  };
  // A live stream is never paused: stopped, it lets go of the connection,
  // and played again it tunes in to what is on now.
  const stop = () => {
    if (!audio.getAttribute('src')) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
  const wanted = () => index >= 0 && sound.checked && !document.hidden;
  function apply() {
    if (!wanted()) {
      stop();
      // A station kept for when the sound is on again (or the tab shown).
      setState(index >= 0 ? 'muted' : 'off');
      return;
    }
    const url = station().url;
    if (audio.getAttribute('src') !== url) {
      audio.src = url;
      audio.volume = radioVolume(volume.value, inside);
    }
    if (!audio.paused) return;
    setState('tuning');
    audio.play().catch((error) => {
      // Browsers let sound start only after a click or a key.
      if (error?.name === 'NotAllowedError') setState('waiting');
    });
  }
  audio.addEventListener('playing', () => setState('on'));
  audio.addEventListener('waiting', () => wanted() && setState('tuning'));
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    stop();
    setState('error');
  });
  const gesture = () => {
    if (wanted() && audio.paused) apply();
  };
  for (const type of ['pointerup', 'touchend', 'keydown'])
    document.addEventListener(type, gesture, { capture: true });
  sound.addEventListener('change', apply);
  document.addEventListener('visibilitychange', apply);
  const tune = (next) => {
    index = next;
    try {
      localStorage.setItem(storageKey, String(index));
    } catch {
      // Not remembered.
    }
    stop();
    state = '';
    apply();
  };
  if (index >= 0) apply();
  return {
    get station() {
      return station();
    },
    get state() {
      return state;
    },
    // The next station, then off (the radio button, N).
    next() {
      // Muted, the button turns the sound on with the radio.
      if (!sound.checked && index >= 0) {
        sound.checked = true;
        sound.dispatchEvent(new Event('change'));
        return;
      }
      tune(nextStation(index));
      if (index >= 0 && !sound.checked) {
        sound.checked = true;
        sound.dispatchEvent(new Event('change'));
      }
    },
    off() {
      tune(-1);
    },
    // `inside` (0–1): the camera in the cabin. The volume eases toward its
    // level as the view changes.
    update(dt, { inside: cabin = 1 } = {}) {
      inside = cabin;
      if (audio.paused) return;
      const target = radioVolume(volume.value, inside);
      const step = (target - audio.volume) * Math.min(1, dt * 5);
      if (Math.abs(target - audio.volume) > 0.004)
        audio.volume = Math.max(0, Math.min(1, audio.volume + step));
    },
  };
}
