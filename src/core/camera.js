/* Camera rig — chase / far chase / T-cam / cockpit, plus scripted shots.
   The chase camera is a critically-damped spring on position and look target,
   following a blend of heading and travel direction (so slides read on screen),
   with speed-driven FOV, acceleration lag, cornering lean and impact shake. */
import * as THREE from 'three';

export const CAMERA_MODES = ['chase', 'far', 'tcam', 'cockpit', 'toy'];
const LABEL = { toy: 'High cam', chase: 'Chase cam', far: 'Far chase', tcam: 'T-cam', cockpit: 'Cockpit' };

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
    this.fovBase = 58;
    this.occluder = null;          // (x, z) → true if a building occupies that spot
    this.pull = 1;                 // 0..1 how far out the camera may sit (smoothed)
  }
  label() { return LABEL[this.mode]; }
  cycle() { const i = CAMERA_MODES.indexOf(this.mode); this.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length]; return this.label(); }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  snapTo(carPos, carQuat) {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat); f.y = 0; f.normalize();
    this.travelDir.copy(f);
    const toy = this.mode === 'toy';
    this.pos.copy(carPos).addScaledVector(f, toy ? -15.5 : -5.8).add(new THREE.Vector3(0, toy ? 9.2 : 1.65, 0));
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
    let fovBase = this.fovBase;
    if (this.mode === 'toy') {
      const v = Math.min(speed, 85);
      const dist = 15.5 + v * 0.075 + this.accelLag * 0.05;
      const height = 9.2 + v * 0.045;
      targetPos = carPos.clone().addScaledVector(d, -dist); targetPos.y = carPos.y + height;
      targetLook = carPos.clone().addScaledVector(d, 4.5 + v * 0.09); targetLook.y = carPos.y + 0.3;
      stiff = 5.5; fovBase = 38;
    } else if (this.mode === 'chase' || this.mode === 'far') {
      const far = this.mode === 'far';
      // portrait screens: pull back a little (the FOV is widened below)
      const tall = Math.max(0, 1 - cam.aspect) * 0.45;
      // low and close: the car sits in the lower third with the street opening up ahead
      const dist = ((far ? 9.0 : 5.6) + Math.min(speed, 80) * (far ? 0.028 : 0.02) + this.accelLag * 0.03) * (1 + tall);
      const height = (far ? 3.0 : 1.62) + Math.min(speed, 80) * 0.003;
      targetPos = carPos.clone().addScaledVector(d, -dist); targetPos.y = carPos.y + height;
      targetLook = carPos.clone().addScaledVector(d, 3.6 + speed * 0.05); targetLook.y = carPos.y + (far ? 0.7 : 0.62);
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
    // keep buildings from getting between the car and the camera: slide in along the boom
    if (stiff <= 20 && this.occluder) {
      let free = 1;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        const x = carPos.x + (targetPos.x - carPos.x) * t, z = carPos.z + (targetPos.z - carPos.z) * t;
        if (this.occluder(x, z)) { free = Math.max(0.18, (k - 1.5) / 12); break; }
      }
      this.pull += (free - this.pull) * (1 - Math.exp(-dt * (free < this.pull ? 14 : 2.5)));
      targetPos.lerpVectors(carPos, targetPos, this.pull);
      targetPos.y = Math.max(targetPos.y, carPos.y + 2.2 + (1 - this.pull) * 4);
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
    // keep at least ~50° of horizontal view on narrow (portrait) screens
    const minV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) / Math.max(0.3, cam.aspect)));
    fovBase = Math.min(88, Math.max(fovBase, minV));
    const fov = fovBase + (this.mode === 'cockpit' ? 8 : 0) + Math.min(speed, 90) * (this.mode === 'toy' ? 0.1 : 0.15);
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
    // map time → curve parameter per segment so each key is reached at its own time;
    // ease in on the first segment and out on the last
    const K = this.keys, n = K.length - 1;
    let si = 0; while (si < n - 1 && K[si + 1].t <= this.t) si++;
    let f = Math.max(0, Math.min(1, (this.t - K[si].t) / (K[si + 1].t - K[si].t)));
    if (si === 0) f = f * f * (2 - f) * 0.5 + f * 0.5;
    if (si === n - 1) f = 1 - (1 - f) * (1 - f);
    const e = (si + f) / n;
    const cam = rig.camera;
    cam.position.copy(this.pc.getPoint(e));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lc.getPoint(e));
    const fl = THREE.MathUtils.clamp((this.t - K[si].t) / (K[si + 1].t - K[si].t), 0, 1);
    cam.fov = THREE.MathUtils.lerp(K[si].fov || 50, K[si + 1].fov || 50, fl);
    cam.updateProjectionMatrix();
    rig.pos.copy(cam.position);
    if (u >= 1) { if (this.onDone) this.onDone(); return true; }
    return false;
  }
}
