// A short video of the drive, at the press of a button (or V): ten seconds
// of the scene as drawn, with the car's sound, saved where the browser saves
// downloads. The canvas is captured as it is drawn (the panels over it are
// left out, so the clip is the road and the car alone); MP4 where the
// browser records it (Chrome, Safari), WebM otherwise.
export const clipLength = 10;
const clipTypes = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

// The first kind of video the browser can record, or null.
export function clipType(supported = (t) => globalThis.MediaRecorder?.isTypeSupported(t)) {
  return clipTypes.find((t) => supported(t)) ?? null;
}

// BMW-M5-2026-11-24-1530.mp4: the date and time it was taken.
export function clipName(date = new Date(), type = 'video/mp4') {
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `BMW-M5-${stamp}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
}

// `canvas`: what to record; `sound()`: a MediaStream of the car's sound, or
// null; `onChange({recording, left})` as it runs; `onSaved(name)` once the
// file is handed to the browser.
export function setupClipRecorder({ canvas, sound, onChange, onSaved, seconds = clipLength }) {
  const type = clipType();
  let recorder = null,
    timer = 0,
    started = 0;
  const report = () => {
    const left = recorder
      ? Math.max(0, Math.ceil(seconds - (performance.now() - started) / 1000))
      : 0;
    onChange?.({ recording: Boolean(recorder), left });
  };
  function stop() {
    if (recorder?.state === 'recording') recorder.stop();
  }
  function start() {
    if (recorder || !type || !canvas.captureStream) return false;
    const stream = canvas.captureStream(60);
    for (const track of sound?.()?.getAudioTracks() ?? []) stream.addTrack(track);
    const chunks = [];
    const taken = new Date();
    recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: 16e6,
      audioBitsPerSecond: 192e3,
    });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      clearInterval(timer);
      for (const track of stream.getVideoTracks()) track.stop();
      recorder = null;
      report();
      if (!chunks.length) return;
      const url = URL.createObjectURL(new Blob(chunks, { type }));
      const link = document.createElement('a');
      link.href = url;
      link.download = clipName(taken, type);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      onSaved?.(link.download);
    };
    recorder.start(500);
    started = performance.now();
    timer = setInterval(() => {
      report();
      if (performance.now() - started >= seconds * 1000) stop();
    }, 200);
    report();
    return true;
  }
  return {
    available: Boolean(type && canvas.captureStream),
    get recording() {
      return Boolean(recorder);
    },
    // Starts a clip, or ends the one running early (and saves it).
    toggle() {
      if (recorder) stop();
      else start();
    },
  };
}

// A picture of the scene as drawn: the canvas read straight after a frame
// is rendered (its pixels are gone once the frame is shown), saved as PNG.
export function savePhoto(canvas, date = new Date()) {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = clipName(date).replace(/\.\w+$/, '.png');
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      resolve(link.download);
    }, 'image/png')
  );
}

// The capture button's menu: a photo, or a ten-second video (or, while one
// runs, a stop that saves it). Escape, the button again or a click elsewhere
// closes it.
export function setupCaptureMenu(container, { onPhoto, onVideo, video = true }) {
  const panel = document.createElement('div');
  panel.className = 'look-picker capture-menu';
  panel.hidden = true;
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Photo or video');
  panel.innerHTML = `
    <button type="button" role="menuitem" data-capture="photo">
      <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 6.2h3l1.4-2h4.2l1.4 2h3v8.3h-13z"/><circle cx="9" cy="10.2" r="2.6"/></svg>
      <span><b>Photo</b><small>A picture of the screen · P</small></span>
    </button>
    <button type="button" role="menuitem" data-capture="video"${video ? '' : ' disabled'}>
      <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.2"/><circle class="dot" cx="9" cy="9" r="3"/></svg>
      <span><b>Video · ${clipLength} s</b><small>${video ? 'With sound · V' : 'Not in this browser'}</small></span>
    </button>`;
  container.append(panel);
  let opener = null;
  const close = () => {
    panel.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
  };
  panel.addEventListener('click', (e) => {
    const item = e.target.closest('[data-capture]');
    if (!item || item.disabled) return;
    close();
    item.blur();
    if (item.dataset.capture === 'photo') onPhoto?.();
    else onVideo?.();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !opener?.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
  return {
    panel,
    close,
    toggle(button) {
      opener = button;
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    },
  };
}
