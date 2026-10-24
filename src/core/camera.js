/* Camera rig — chase / far chase / T-cam / cockpit, plus scripted shots.
   The chase camera is a critically-damped spring on position and look target,
   following a blend of heading and travel direction (so slides read on screen),
   with speed-driven FOV, acceleration lag, cornering lean and impact shake. */
import * as THREE from 'three';

export const CAMERA_MODES = ['chase', 'far', 'tcam', 'cockpit'];
const LABEL = { chase: 'Chase cam', far: 'Far chase', tcam: 'T-cam', cockpit: 'Cockpit' };

function damp(current, target, lambda, dt) { return current + (target - current) * (1 - Math.exp(-lambda * dt)); }

export class CameraRig {
  constructor(camera, groundFn) {
    this.camera = camera;
    this.groundFn = groundFn;      // (x, z, yRef) → ground height, to keep the camera above terrain
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 10, -20);
    this.look = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.shake = 0;
    this.roll = 0;
    this.accelLag = 0;
    this.prevSpeed = 0;
    this.travelDir = new THREE.Vector3(0, 0, 1);
    this.script = null;            // {update(dt, rig) → bool done}
    this.fovBase = 62;
  }
  label() { return LABEL[this.mode]; }
  cycle() { const i = CAMERA_MODES.indexOf(this.mode); this.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length]; return this.label(); }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  snapTo(carPos, carQuat) {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat); f.y = 0; f.normalize();
    this.travelDir.copy(f);
    this.pos.copy(carPos).addScaledVector(f, -7).add(new THREE.Vector3(0, 2.4, 0));
    this.look.copy(carPos).addScaledVector(f, 3);
  }

  update(dt, carPos, carQuat, sim) {
    const cam = this.camera;
    if (this.script) {
      const done = this.script.update(dt, this);
      if (done) this.script = null; else return;
    }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(carQuat);
    const flat = fwd.clone(); flat.y = 0; flat.normalize();
    const speed = sim.speed;
    // travel direction (only trusted at speed) blended with heading
    const v = sim.vel.clone(); v.y = 0;
    if (speed > 3 && sim.forwardSpeed > 0) {
      v.normalize();
      const blend = Math.min(0.55, (speed - 3) / 30);
      const dir = flat.clone().lerp(v, blend).normalize();
      this.travelDir.lerp(dir, 1 - Math.exp(-dt * 5)).normalize();
    } else this.travelDir.lerp(flat, 1 - Math.exp(-dt * 4)).normalize();

    // longitudinal acceleration → camera lag (pulls back under throttle, pushes in under braking)
    const accel = (sim.forwardSpeed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = sim.forwardSpeed;
    this.accelLag = damp(this.accelLag, THREE.MathUtils.clamp(accel, -40, 15), 4, dt);
    // lateral accel → lean
    const lat = sim.angVel.y * speed;
    this.roll = damp(this.roll, THREE.MathUtils.clamp(-lat * 0.0022, -0.05, 0.05), 3, dt);

    let targetPos, targetLook, stiff;
    const d = this.travelDir;
    if (this.mode === 'chase' || this.mode === 'far') {
      const far = this.mode === 'far';
      const dist = (far ? 9.6 : 6.6) + Math.min(speed, 80) * (far ? 0.03 : 0.022) + this.accelLag * 0.035;
      const height = (far ? 3.4 : 2.05) + Math.min(speed, 80) * 0.004;
      targetPos = carPos.clone().addScaledVector(d, -dist); targetPos.y = carPos.y + height;
      targetLook = carPos.clone().addScaledVector(d, 4 + speed * 0.05); targetLook.y = carPos.y + 0.55;
      stiff = 9;
    } else if (this.mode === 'tcam') {
      targetPos = carPos.clone().addScaledVector(fwd, -0.45).addScaledVector(up, 1.12);
      targetLook = carPos.clone().addScaledVector(fwd, 12).addScaledVector(up, 0.5);
      stiff = 60;
    } else { // cockpit
      targetPos = carPos.clone().addScaledVector(fwd, 0.55).addScaledVector(up, 0.66);
      targetLook = carPos.clone().addScaledVector(fwd, 12).addScaledVector(up, 0.42);
      stiff = 80;
    }
    if (stiff > 20) { this.pos.copy(targetPos); this.look.copy(targetLook); }
    else {
      // spring with a little lag on height so bumps don't jitter the view
      this.pos.x = damp(this.pos.x, targetPos.x, stiff, dt);
      this.pos.z = damp(this.pos.z, targetPos.z, stiff, dt);
      this.pos.y = damp(this.pos.y, targetPos.y, stiff * 0.7, dt);
      this.look.lerp(targetLook, 1 - Math.exp(-dt * 14));
      const g = this.groundFn ? this.groundFn(this.pos.x, this.pos.z, this.pos.y + 1) : -Infinity;
      if (this.pos.y < g + 0.8) this.pos.y = g + 0.8;
    }
    cam.position.copy(this.pos);
    if (this.shake > 0.002) {
      const s = this.shake * (stiff > 20 ? 0.04 : 0.12);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-dt * 6);
    }
    cam.up.set(0, 1, 0);
    if (stiff > 20) cam.up.copy(up);
    cam.lookAt(this.look);
    if (stiff <= 20) cam.rotateZ(this.roll);
    const fov = this.fovBase + (this.mode === 'cockpit' ? 6 : 0) + Math.min(speed, 90) * 0.17;
    cam.fov = damp(cam.fov, fov, 3, dt);
    cam.updateProjectionMatrix();
  }
}

/** A sequence of keyframed shots (cinematic intro). keys: [{t, pos:[x,y,z], look:[x,y,z], fov}] */
export class ShotScript {
  constructor(keys, onDone) {
    this.keys = keys; this.t = 0; this.onDone = onDone;
    this.total = keys[keys.length - 1].t;
    this.pc = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k.pos)), false, 'centripetal');
    this.lc = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k.look)), false, 'centripetal');
  }
  skip() { this.t = this.total; }
  update(dt, rig) {
    this.t += dt;
    const u = Math.min(1, this.t / this.total);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;   // ease in-out
    const cam = rig.camera;
    cam.position.copy(this.pc.getPoint(e));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lc.getPoint(e));
    let i = 0; while (i < this.keys.length - 2 && this.keys[i + 1].t < this.t) i++;
    const a = this.keys[i], b = this.keys[i + 1];
    const f = THREE.MathUtils.clamp((this.t - a.t) / (b.t - a.t), 0, 1);
    cam.fov = THREE.MathUtils.lerp(a.fov || 50, b.fov || 50, f);
    cam.updateProjectionMatrix();
    rig.pos.copy(cam.position);
    if (u >= 1) { if (this.onDone) this.onDone(); return true; }
    return false;
  }
}
