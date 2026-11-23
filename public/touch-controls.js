// Driving without a keyboard.
//
// On a touch screen: a steering track at the bottom left (slide a thumb
// across it; it springs back to centre on release) and the accelerator and
// brake pedals at the bottom right. Several fingers work at once.
//
// With a gamepad (standard mapping): left stick steers, right trigger
// accelerates, left trigger brakes; the shoulder buttons work the turn
// signals, Y changes the camera, B sounds the horn, X the hazards, Start
// restarts and Back pauses.

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

// Stick dead zone, rescaled so steering starts smoothly at its edge.
export function deadZone(value, zone = 0.12) {
  const magnitude = Math.abs(value);
  if (magnitude <= zone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - zone) / (1 - zone));
}

// Position on the steering track (0…1 across) to steering (1 left … -1
// right), with a little extra travel near the centre.
export function trackSteer(fraction) {
  const centred = clamp(fraction * 2 - 1, -1, 1);
  return -Math.sign(centred) * Math.abs(centred) ** 1.3;
}

export const padButtons = Object.freeze({
  accelerate: 7,
  brake: 6,
  camera: 3,
  signalLeft: 4,
  signalRight: 5,
  restart: 9,
  pause: 8,
  horn: 1,
  hazard: 2,
});

// Reads the first connected standard gamepad: steering, pedals, and the
// buttons pressed since the last read.
export function readPad(pad, previous = []) {
  if (!pad) return null;
  const pressed = (i) => Boolean(pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.2);
  const now = pad.buttons.map((_, i) => pressed(i));
  const tapped = (i) => now[i] && !previous[i];
  return {
    steer: -deadZone(pad.axes[0] ?? 0),
    accelerate: pressed(padButtons.accelerate),
    brake: pressed(padButtons.brake),
    camera: tapped(padButtons.camera),
    signalLeft: tapped(padButtons.signalLeft),
    signalRight: tapped(padButtons.signalRight),
    restart: tapped(padButtons.restart),
    pause: tapped(padButtons.pause),
    horn: pressed(padButtons.horn),
    hazard: tapped(padButtons.hazard),
    buttons: now,
  };
}

export function setupTouchControls(container, { onDrive }) {
  container.innerHTML = `
    <div class="touch-steer" aria-label="Steering: slide left or right">
      <div class="touch-steer-track"><span class="touch-steer-knob"></span></div>
    </div>
    <div class="touch-pedals">
      <button type="button" class="touch-pedal touch-brake" aria-label="Brake">BRAKE</button>
      <button type="button" class="touch-pedal touch-gas" aria-label="Accelerator">GAS</button>
    </div>`;
  const track = container.querySelector('.touch-steer-track'),
    knob = container.querySelector('.touch-steer-knob'),
    gas = container.querySelector('.touch-gas'),
    brake = container.querySelector('.touch-brake');
  const state = { steer: 0, accelerate: false, brake: false, active: false };
  // Shown once the screen is touched (or on a touch-first device).
  const show = () => {
    if (state.active) return;
    state.active = true;
    document.body.dataset.touchControls = 'true';
  };
  if (matchMedia('(pointer: coarse)').matches) show();
  addEventListener('touchstart', show, { passive: true, once: true });
  let steerPointer = null;
  const steerAt = (event) => {
    const box = track.getBoundingClientRect();
    state.steer = trackSteer((event.clientX - box.left) / box.width);
    knob.style.transform = `translateX(${(-state.steer * 0.5 * box.width) / 1.15}px)`;
  };
  track.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    steerPointer = event.pointerId;
    track.setPointerCapture(event.pointerId);
    steerAt(event);
    onDrive();
  });
  track.addEventListener('pointermove', (event) => {
    if (event.pointerId === steerPointer) steerAt(event);
  });
  const release = (event) => {
    if (event.pointerId !== steerPointer) return;
    steerPointer = null;
    state.steer = 0;
    knob.style.transform = '';
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  for (const [button, key] of [
    [gas, 'accelerate'],
    [brake, 'brake'],
  ]) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      state[key] = true;
      button.classList.add('pressed');
      onDrive();
    });
    const up = () => {
      state[key] = false;
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  return state;
}
