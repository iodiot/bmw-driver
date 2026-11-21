import * as THREE from 'three';

// Camera views: the orbiting chase camera, the driver's seat and the bonnet.
// Seat and bonnet views ride with the car's body (car space: x forward,
// y up, z to the right; the driver sits on the left, at negative z).
export const cameraViews = Object.freeze({
  chase: Object.freeze({ label: 'Chase' }),
  driver: Object.freeze({
    label: "Driver's seat",
    // Eye point behind the wheel, at a seated driver's eye height.
    eye: Object.freeze([-0.22, 0.585, -0.385]),
    // Vertical field of view (degrees) on a wide screen; narrow screens
    // widen it so at least `minHorizontal` degrees are seen across.
    fov: 56,
    minHorizontal: 80,
    // Looks a little down at the road.
    pitch: -0.035,
    inside: true,
  }),
  bonnet: Object.freeze({
    label: 'Bonnet',
    eye: Object.freeze([0.72, 0.6, 0]),
    fov: 48,
    minHorizontal: 70,
    pitch: -0.05,
    inside: false,
  }),
});
export const cameraOrder = Object.freeze(['chase', 'driver', 'bonnet']);
export function nextCameraView(view) {
  return cameraOrder[(cameraOrder.indexOf(view) + 1) % cameraOrder.length];
}

// Vertical field of view for a view on a screen of this aspect ratio.
export function viewFov(view, aspect) {
  const v = cameraViews[view];
  if (!v.fov) return null;
  const horizontal = (2 * Math.atan(Math.tan((v.fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
  if (horizontal >= v.minHorizontal) return v.fov;
  return (2 * Math.atan(Math.tan((v.minHorizontal * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

// How far the driver may turn their head (radians): far round to the left
// and right, a little up and further down.
export const lookLimits = Object.freeze({ yaw: 2.3, up: 0.45, down: 0.65 });
// After the pointer lets go, the gaze drifts back ahead after a pause.
export const lookReturn = Object.freeze({ delay: 1.2, time: 0.5 });

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const swayTarget = new THREE.Vector3(),
  eyePoint = new THREE.Vector3(),
  rootQ = new THREE.Quaternion(),
  bodyQ = new THREE.Quaternion(),
  lookQ = new THREE.Quaternion(),
  lookEuler = new THREE.Euler();

// The driver's head: looks into a bend a little, sways with the car's
// acceleration, and turns where the pointer drags it.
export class SeatCamera {
  constructor() {
    this.reset();
  }
  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.idle = Infinity;
    this.bendLook = 0;
    this.sway = new THREE.Vector3();
  }
  // Pointer drag in pixels on a screen `height` pixels tall: drag right to
  // look right, up to look up.
  drag(dx, dy, height, fov) {
    const perPixel = ((fov * Math.PI) / 180 / height) * 1.1;
    this.yaw = clamp(this.yaw - dx * perPixel, -lookLimits.yaw, lookLimits.yaw);
    this.pitch = clamp(this.pitch - dy * perPixel, -lookLimits.down, lookLimits.up);
    this.idle = 0;
  }
  step(dt, simulation) {
    this.idle += dt;
    if (this.idle > lookReturn.delay) {
      const ease = 1 - Math.exp(-dt / lookReturn.time);
      this.yaw -= this.yaw * ease;
      this.pitch -= this.pitch * ease;
    }
    // Into the bend: the gaze leads the turn by a fraction of the yaw rate.
    const lead = clamp((simulation?.yawRate ?? 0) * 0.35, -0.2, 0.2);
    this.bendLook += (lead - this.bendLook) * (1 - Math.exp(-dt / 0.35));
    // The head sways against the acceleration, a centimetre or two.
    const target = swayTarget.set(
      clamp(-(simulation?.acceleration ?? 0) * 0.0025, -0.025, 0.02),
      0,
      clamp((simulation?.lateralAcceleration ?? 0) * 0.0025, -0.03, 0.03)
    );
    this.sway.lerp(target, 1 - Math.exp(-dt / 0.25));
  }
  // Places the camera at a view's eye point on the body. The head keeps
  // itself steadier than the body: it takes only part of the body's roll and
  // pitch.
  place(camera, view, root, body) {
    const v = cameraViews[view];
    const eye = eyePoint.fromArray(v.eye);
    if (v.inside) eye.add(this.sway);
    body.updateWorldMatrix(true, false);
    camera.position.copy(eye.applyMatrix4(body.matrixWorld));
    const q = root
      .getWorldQuaternion(rootQ)
      .slerp(body.getWorldQuaternion(bodyQ), v.inside ? 0.55 : 0.85);
    lookEuler.set(
      v.pitch + (v.inside ? this.pitch : 0),
      -Math.PI / 2 + (v.inside ? this.yaw + this.bendLook : 0),
      0,
      'YXZ'
    );
    camera.quaternion.copy(q).multiply(lookQ.setFromEuler(lookEuler));
  }
}
