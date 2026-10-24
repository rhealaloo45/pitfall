/* =====================================================================
   Vehicle simulation — open-wheel race car
   ---------------------------------------------------------------------
   A 3D rigid body (6 DOF) supported by four suspension "raycasts".
   Every substep:
     1. each wheel samples the drivable surface below its mount point
     2. spring + damper + bump stop + anti-roll bar give the normal load
     3. a tyre model turns slip angle + drive/brake demand into forces,
        limited by a friction ellipse (μ · load), so throttle, braking
        and cornering compete for the same grip
     4. aero drag + downforce, rolling resistance
     5. forces/torques integrate the body (semi-implicit Euler)
   Weight transfer is not scripted: it emerges because tyre forces act
   at the contact patch, below the centre of mass, and the springs react.

   Local axes: +Z forward, +Y up, +X left. Heading 0 faces world +Z.
   Pure module: no DOM, no rendering, no randomness → deterministic.
===================================================================== */
import * as THREE from 'three';

const V3 = THREE.Vector3;

export const CAR_SPEC = {
  mass: 800,                       // kg (car + driver)
  inertia: [1700, 2000, 420],      // body-frame [pitch(X), yaw(Y), roll(Z)] kg·m²
  wheelRadius: 0.34,
  wheels: [                        // mount points relative to CoM
    { x: 0.82, z: 2.0, front: true },    // FL
    { x: -0.82, z: 2.0, front: true },   // FR
    { x: 0.80, z: -1.6, front: false },  // RL
    { x: -0.80, z: -1.6, front: false }, // RR
  ],
  mountY: 0.18,
  restLength: 0.205,               // mount → wheel centre with spring unloaded
  travel: 0.10,                    // usable compression before the bump stop
  springF: 98000, springR: 104000, // N/m
  damperF: 5400, damperR: 5800,    // N·s/m
  antiRollF: 38000, antiRollR: 26000,
  // tyres
  mu: 1.45,                        // peak friction on asphalt
  slideRatio: 0.82,                // kinetic/peak when the wheel is spinning or locked
  pacejkaB: 12.5, pacejkaC: 1.45,  // lateral curve: peak ≈ 8°, keeps ~76 % grip deep in a slide
  loadSensitivity: 0.06,           // μ drops slightly with heavy load
  // drivetrain
  idleRpm: 4000, maxRpm: 13000, limiterRpm: 12800,
  torqueCurve: [[1000, .55], [4000, .75], [7000, .92], [9500, 1], [11500, .96], [12500, .86], [13000, .80]],
  peakTorque: 365,                 // N·m at the crank → ~420 kW
  gears: [19.0, 14.2, 11.2, 9.3, 8.0, 7.0, 6.3, 5.75],  // overall ratios incl. final drive
  reverseRatio: 15,
  drivelineEff: 0.92,
  upshiftRpm: 12100, downshiftRpm: 7200, shiftTime: 0.075,
  engineBrake: 55,                 // N·m at max rpm, off throttle
  brakeForce: 21000,               // N total at full pedal (before grip limit)
  brakeBias: 0.58,                 // front share
  handbrakeForce: 12000,
  // aero
  dragCoef: 0.74,                  // ½ρ·Cd·A
  downforceCoef: 2.15,             // ½ρ·Cl·A
  aeroBalance: 0.45,               // front share of downforce
  rollingRes: 0.012,
  maxSteer: 0.42,                  // rad, lock at walking pace
  reverseMaxSpeed: 9,              // m/s
};

const tmp = {
  a: new V3(), b: new V3(), c: new V3(), d: new V3(), e: new V3(),
  q: new THREE.Quaternion(), m: new THREE.Matrix3(), mi: new THREE.Matrix3(),
};

function torqueAt(spec, rpm) {
  const c = spec.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1] * spec.peakTorque;
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
      return (c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t) * spec.peakTorque;
    }
  }
  return c[c.length - 1][1] * spec.peakTorque;
}

/** Default flat world: infinite asphalt at y=0 with no colliders. */
export const FLAT_WORLD = {
  surface(x, z, yRef, out) {
    out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0; out.mu = 1; out.kind = 'road'; out.rough = 0; out.water = false;
    return out;
  },
  collide() { return 0; },
};

export class VehicleSim {
  constructor(spec = CAR_SPEC, world = FLAT_WORLD) {
    this.spec = spec;
    this.world = world;
    this.assists = { abs: true, tc: true, stability: 0.5, autoGear: true };
    this.pos = new V3();
    this.vel = new V3();
    this.quat = new THREE.Quaternion();
    this.angVel = new V3();           // world frame
    this.invI = new V3(1 / spec.inertia[0], 1 / spec.inertia[1], 1 / spec.inertia[2]);
    this.wheels = spec.wheels.map(w => ({
      ...w, len: spec.restLength, prevLen: spec.restLength, contact: false, load: 0,
      steer: 0, spin: 0, spinVel: 0, slipAngle: 0, slipRatio: 0, sliding: 0,
      surface: { h: 0, nx: 0, ny: 1, nz: 0, mu: 1, kind: 'road', rough: 0, water: false },
      worldContact: new V3(),
    }));
    this.steer = 0;          // current steering wheel position −1..1
    this.steerAngle = 0;     // front wheel angle (rad)
    this.gear = 1;           // −1 reverse, 1..8
    this.rpm = spec.idleRpm;
    this.shiftTimer = 0;
    this.throttleOut = 0;    // what the engine actually got (after TC / shift cut)
    this.reverseHold = 0;
    this.impact = 0;         // largest collision impulse this step (N·s)
    this.time = 0;
    this.shifted = 0;        // +1 / −1 when a shift happened this step (audio cue)
    this.limiter = false;
    this.speedCap = Infinity; // optional (pit-limiter style zones)
  }

  reset(pos, heading = 0) {
    const s = this.spec;
    this.pos.copy(pos);
    this.quat.setFromAxisAngle(new V3(0, 1, 0), heading);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.steer = 0; this.steerAngle = 0;
    this.gear = 1; this.rpm = s.idleRpm; this.shiftTimer = 0; this.reverseHold = 0;
    for (const w of this.wheels) { w.len = w.prevLen = s.restLength; w.spin = 0; w.spinVel = 0; w.contact = false; w.load = 0; w.sliding = 0; }
    // place the body so the springs start near static compression
    const surf = this.world.surface(pos.x, pos.z, pos.y + 50, this.wheels[0].surface);
    this.pos.y = surf.h + s.wheelRadius + s.restLength - 0.02 - s.mountY;
  }

  /* helpers ---------------------------------------------------------- */
  forward(out = new V3()) { return out.set(0, 0, 1).applyQuaternion(this.quat); }
  up(out = new V3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  left(out = new V3()) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  get speed() { return this.vel.length(); }
  get forwardSpeed() { return this.vel.dot(this.forward(tmp.e)); }
  get heading() { const f = this.forward(tmp.e); return Math.atan2(f.x, f.z); }

  /** Body slip angle β (rad): angle between where the car points and where it travels. */
  get bodySlip() {
    const f = this.forward(tmp.e);
    const vx = this.vel.x, vz = this.vel.z, sp = Math.hypot(vx, vz);
    if (sp < 2) return 0;
    const fl = Math.hypot(f.x, f.z) || 1;
    const cross = (f.x / fl) * vz - (f.z / fl) * vx;
    const dot = (f.x / fl) * vx + (f.z / fl) * vz;
    return Math.atan2(-cross, dot);
  }

  /** Apply an impulse J (world) at world point p. */
  applyImpulse(J, p) {
    this.vel.addScaledVector(J, 1 / this.spec.mass);
    const r = tmp.d.copy(p).sub(this.pos);
    const torque = tmp.c.copy(r).cross(J);
    this.angVel.add(this.applyInvInertiaWorld(torque));
  }

  /** I⁻¹ (world) · v, returned in place in v. */
  applyInvInertiaWorld(v) {
    const qi = tmp.q.copy(this.quat).invert();
    v.applyQuaternion(qi);
    v.x *= this.invI.x; v.y *= this.invI.y; v.z *= this.invI.z;
    return v.applyQuaternion(this.quat);
  }

  /** Effective inverse mass for an impulse along n at point p. */
  invMassAt(p, n) {
    const r = tmp.a.copy(p).sub(this.pos);
    const rn = tmp.b.copy(r).cross(n);
    const k = this.applyInvInertiaWorld(rn).cross(r);
    return 1 / this.spec.mass + n.dot(k);
  }

  /* main step -------------------------------------------------------- */
  step(dt, input) {
    const s = this.spec;
    this.impact = 0;
    this.shifted = 0;
    this.time += dt;
    const fwd = this.forward(new V3());
    const up = this.up(new V3());
    const left = this.left(new V3());
    const vLong = this.vel.dot(fwd);
    const speed = this.vel.length();

    /* ---- steering: speed-sensitive lock derived from available grip ---- */
    const steerIn = THREE.MathUtils.clamp(input.steer || 0, -1, 1);
    const analog = !!input.analog;
    const rate = analog ? 12 : (Math.abs(steerIn) > Math.abs(this.steer) && Math.sign(steerIn) === Math.sign(this.steer || steerIn)
      ? THREE.MathUtils.lerp(4.2, 1.9, Math.min(1, speed / 55))  // turning in: quick at low speed, calmer at speed
      : 6.5);                                                     // releasing / counter-steering: fast
    this.steer += THREE.MathUtils.clamp(steerIn - this.steer, -rate * dt, rate * dt);
    const v = Math.max(speed, 1);
    const latAvail = s.mu * 9.81 * (1 + s.downforceCoef * v * v / (s.mass * 9.81));
    let lock = Math.min(s.maxSteer, 1.12 * latAvail * 3.6 / (v * v));
    // extra lock only when steering toward the direction of travel (counter-steering a slide)
    const beta = this.bodySlip;
    if (Math.sign(this.steer) === Math.sign(beta)) lock = Math.min(s.maxSteer, lock + Math.abs(beta) * 0.9);
    let steerAngle = this.steer * lock;
    // stability assist: nudge the wheels toward the direction of travel when sliding
    if (this.assists.stability > 0 && Math.abs(beta) > 0.06 && vLong > 4) {
      steerAngle += THREE.MathUtils.clamp(beta * 0.55 * this.assists.stability, -0.2, 0.2);
    }
    this.steerAngle = THREE.MathUtils.clamp(steerAngle, -s.maxSteer, s.maxSteer);

    /* ---- gearbox / engine ---- */
    let throttle = THREE.MathUtils.clamp(input.throttle || 0, 0, 1);
    let brake = THREE.MathUtils.clamp(input.brake || 0, 0, 1);
    const handbrake = input.handbrake ? 1 : 0;
    // reverse: hold brake at a standstill
    if (this.gear > 0) {
      if (brake > 0.5 && throttle < 0.1 && Math.abs(vLong) < 0.8) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.3) { this.gear = -1; this.reverseHold = 0; this.shifted = -1; }
      } else this.reverseHold = 0;
    } else {
      if (throttle > 0.1 && vLong > -0.8) { this.gear = 1; this.shifted = 1; }
    }
    let driveDemand = 0;
    if (this.gear === -1) { // brake key drives backwards, throttle key brakes
      const t = brake; brake = throttle; throttle = t;
    }
    const ratio = this.gear === -1 ? s.reverseRatio : s.gears[this.gear - 1];
    const rearSpeed = (this.wheels[2].spinVel + this.wheels[3].spinVel) * 0.5 * s.wheelRadius;
    const wheelRpm = Math.abs(rearSpeed) / s.wheelRadius * ratio * 60 / (2 * Math.PI);
    // clutch slip below idle: engine can rev while the car launches
    let rpm = Math.max(wheelRpm, s.idleRpm + throttle * 3500 * Math.max(0, 1 - wheelRpm / (s.idleRpm + 3500)));
    rpm = Math.min(rpm, s.maxRpm);
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 18);

    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const manualUp = input.shiftUp, manualDown = input.shiftDown;
    if (this.gear > 0) {
      if (this.assists.autoGear) {
        if (this.rpm > s.upshiftRpm && this.gear < s.gears.length && this.shiftTimer <= 0 && throttle > 0.2) { this.gear++; this.shiftTimer = s.shiftTime; this.shifted = 1; }
        else if (wheelRpm < s.downshiftRpm && this.gear > 1 && this.shiftTimer <= 0) {
          const lower = s.gears[this.gear - 2] / ratio * wheelRpm;
          if (lower < s.upshiftRpm - 900) { this.gear--; this.shiftTimer = s.shiftTime; this.shifted = -1; }
        }
      }
      if (manualUp && this.gear < s.gears.length && this.shiftTimer <= 0) { this.gear++; this.shiftTimer = s.shiftTime; this.shifted = 1; }
      if (manualDown && this.gear > 1 && this.shiftTimer <= 0) {
        const lower = s.gears[this.gear - 2] / ratio * wheelRpm;
        if (lower < s.maxRpm) { this.gear--; this.shiftTimer = s.shiftTime; this.shifted = -1; }
      }
    }
    this.limiter = this.rpm >= s.limiterRpm;
    let thr = throttle;
    if (this.shiftTimer > 0) thr = 0;                // torque cut during the shift
    if (this.limiter) thr *= 0.2;
    if (this.gear === -1 && Math.abs(vLong) > s.reverseMaxSpeed) thr = 0;
    if (speed > this.speedCap) thr = 0;
    const engTorque = thr > 0 ? torqueAt(s, this.rpm) * thr : -s.engineBrake * (this.rpm / s.maxRpm) * (Math.abs(vLong) > 1 ? 1 : 0);
    driveDemand = engTorque * ratio * s.drivelineEff / s.wheelRadius * (this.gear === -1 ? -1 : 1);
    this.throttleOut = thr;

    /* ---- suspension & tyres ---- */
    const force = new V3(0, -9.81 * s.mass, 0);
    const torque = new V3();
    const surfaceInfo = this.wheels[0].surface;
    let contacts = 0;

    // aero
    const sp2 = vLong * vLong;
    const downforce = s.downforceCoef * sp2 * (vLong > 0 ? 1 : 0.3);
    force.addScaledVector(this.vel, -s.dragCoef * speed);

    // pass 1: suspension geometry
    const mountW = [];
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const m = new V3(w.x, s.mountY, w.z).applyQuaternion(this.quat).add(this.pos);
      mountW.push(m);
      const surf = this.world.surface(m.x, m.z, m.y + 0.5, w.surface);
      let h = surf.h;
      if (surf.rough) h += surf.rough * (Math.sin(m.x * 3.1 + m.z * 1.7) * Math.sin(m.z * 2.3 - m.x * 0.9));
      // distance from mount to ground measured along body-down
      const upY = Math.max(0.25, up.y);
      const dist = (m.y - h) / upY;
      w.prevLen = w.len;
      const len = dist - s.wheelRadius;
      if (len < s.restLength && !surf.water) {
        w.contact = true; w.len = Math.max(len, s.restLength - s.travel - 0.05);
        w.groundH = h;
        contacts++;
      } else { w.contact = false; w.len = s.restLength; }
    }
    // anti-roll bars
    const arb = [0, 0, 0, 0];
    for (const [a, b, k] of [[0, 1, s.antiRollF], [2, 3, s.antiRollR]]) {
      const ca = s.restLength - this.wheels[a].len, cb = s.restLength - this.wheels[b].len;
      const f = (ca - cb) * k;
      if (this.wheels[a].contact) arb[a] = f;
      if (this.wheels[b].contact) arb[b] = -f;
    }

    // pass 2: loads and tyre forces
    const massShare = s.mass / 4;
    const brakeTotal = brake * s.brakeForce;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const m = mountW[i];
      if (!w.contact) {
        w.load = 0; w.sliding = 0;
        // free wheel spin decays toward road speed
        w.spinVel *= Math.exp(-dt * 0.8);
        if (!w.front && thr > 0.2) w.spinVel += Math.sign(driveDemand) * dt * 40;
        w.spin += w.spinVel * dt;
        continue;
      }
      const surf = w.surface;
      const compression = s.restLength - w.len;
      const compVel = (w.prevLen - w.len) / dt;
      const kS = w.front ? s.springF : s.springR, cD = w.front ? s.damperF : s.damperR;
      let fs = kS * compression + cD * compVel + arb[i];
      const over = compression - s.travel;
      if (over > 0) fs += kS * 9 * over + cD * 2 * Math.max(0, compVel);
      fs = Math.max(0, fs);
      const load = fs;   // downforce reaches the tyres through the springs
      w.load = load;

      const n = new V3(surf.nx, surf.ny, surf.nz);
      const cp = new V3(m.x, w.groundH, m.z);
      w.worldContact.copy(cp);
      // suspension force acts along body up at the mount; aero acts on the body directly
      force.addScaledVector(up, fs);
      torque.add(tmp.a.copy(m).sub(this.pos).cross(tmp.b.copy(up).multiplyScalar(fs)));
      // wheel axes in the ground plane
      const steer = w.front ? this.steerAngle : 0;
      w.steer = steer;
      const wf = tmp.c.copy(fwd).multiplyScalar(Math.cos(steer)).addScaledVector(left, Math.sin(steer));
      wf.addScaledVector(n, -wf.dot(n)).normalize();
      const wl = new V3().crossVectors(n, wf).normalize(); // left of the wheel
      const wfv = wf.clone();
      // contact point velocity
      const r = new V3().subVectors(cp, this.pos);
      const vc = new V3().crossVectors(this.angVel, r).add(this.vel);
      const vx = vc.dot(wfv), vy = vc.dot(wl);

      // friction available
      const muEff = s.mu * surf.mu * (1 - s.loadSensitivity * Math.min(2, load / 4000));
      const limit = muEff * load;

      // lateral: Pacejka-style curve on slip angle
      const alpha = Math.atan2(vy, Math.max(Math.abs(vx), 2.0));
      w.slipAngle = alpha;
      let fy = -Math.sign(alpha) * limit * Math.sin(s.pacejkaC * Math.atan(s.pacejkaB * Math.abs(alpha)));
      const fyStatic = massShare * Math.abs(vy) / dt;          // never overshoot zero lateral velocity
      if (Math.abs(fy) > fyStatic) fy = Math.sign(fy) * fyStatic;

      // longitudinal demand: drive (rears) + brakes + handbrake + rolling resistance
      let fx = 0;
      if (!w.front) fx += driveDemand * 0.5;
      let fb = brakeTotal * (w.front ? s.brakeBias : 1 - s.brakeBias) * 0.5;
      if (!w.front && handbrake) fb += s.handbrakeForce * 0.5;
      fb += s.rollingRes * load;
      // brake opposes rolling direction; clamped so it stops (and holds) the car without reversing it
      const fbMax = massShare * Math.abs(vx) / dt;
      let brakeApplied = Math.min(fb, fbMax);
      // ABS: keep braking just under the grip limit (never on a handbraked rear)
      if (this.assists.abs && brakeApplied > limit * 0.96 && !(handbrake && !w.front)) brakeApplied = limit * 0.96;
      fx -= Math.sign(vx) * brakeApplied;
      if (this.assists.tc && !w.front && driveDemand !== 0) {
        const room = Math.sqrt(Math.max(0, limit * limit * 0.94 - fy * fy));
        if (Math.abs(fx) > room) {
          const cut = room / Math.abs(fx);
          fx *= cut;
          this.throttleOut = Math.min(this.throttleOut, thr * cut);
        }
      }

      // friction ellipse
      let total = Math.hypot(fx, fy);
      let sliding = 0;
      if (total > limit && total > 1e-6) {
        sliding = Math.min(1, (total - limit) / limit);
        const scale = limit * (1 - (1 - s.slideRatio) * Math.min(1, sliding * 2)) / total;
        fx *= scale; fy *= scale;
        total = limit;
      }
      w.sliding = sliding;
      w.slipRatio = sliding * Math.sign(fx);

      const F = new V3().addScaledVector(wfv, fx).addScaledVector(wl, fy);
      force.add(F);
      torque.add(new V3().crossVectors(r, F));

      // visual wheel spin
      const rolling = vx / s.wheelRadius;
      let target = rolling;
      if (sliding > 0.05) {
        if (!w.front && fx * Math.sign(vx || 1) > 0 && driveDemand !== 0) target = rolling + Math.sign(driveDemand) * sliding * 60; // wheelspin
        else if (brakeApplied > 0) target = rolling * (1 - Math.min(1, sliding * 1.5));                                              // lock-up
      }
      if (!w.front && handbrake) target = 0;
      w.spinVel += (target - w.spinVel) * Math.min(1, dt * 25);
      w.spin += w.spinVel * dt;
    }
    // aero downforce pushes the body down at the axles (balance sets the pitch moment)
    if (downforce > 0) {
      const zF = s.wheels[0].z, zR = s.wheels[2].z;
      for (const [z, share] of [[zF, s.aeroBalance], [zR, 1 - s.aeroBalance]]) {
        const F = tmp.b.copy(up).multiplyScalar(-downforce * share);
        const p = tmp.a.set(0, 0, z).applyQuaternion(this.quat);
        force.add(F);
        torque.add(tmp.d.copy(p).cross(F));
      }
    }

    /* ---- integrate ---- */
    this.vel.addScaledVector(force, dt / s.mass);
    // angular: ω̇ = I⁻¹ (τ − ω × Iω) in body frame
    const qi = tmp.q.copy(this.quat).invert();
    const wb = this.angVel.clone().applyQuaternion(qi);
    const tb = torque.clone().applyQuaternion(qi);
    const I = s.inertia;
    const Iw = new V3(wb.x * I[0], wb.y * I[1], wb.z * I[2]);
    const gyro = new V3().crossVectors(wb, Iw);
    wb.x += (tb.x - gyro.x) / I[0] * dt;
    wb.y += (tb.y - gyro.y) / I[1] * dt;
    wb.z += (tb.z - gyro.z) / I[2] * dt;
    // light angular damping (air + chassis losses)
    const angDamp = Math.exp(-dt * (contacts ? 0.6 : 0.15));
    wb.multiplyScalar(angDamp);
    this.angVel.copy(wb).applyQuaternion(this.quat);
    this.pos.addScaledVector(this.vel, dt);
    const wq = new THREE.Quaternion(this.angVel.x * dt * 0.5, this.angVel.y * dt * 0.5, this.angVel.z * dt * 0.5, 0);
    wq.multiply(this.quat);
    this.quat.x += wq.x; this.quat.y += wq.y; this.quat.z += wq.z; this.quat.w += wq.w;
    this.quat.normalize();

    /* ---- body vs ground: keep the chassis out of the road surface ---- */
    this.bodyGroundContact(dt);
    /* ---- body vs world colliders ---- */
    this.impact = Math.max(this.impact, this.world.collide(this, dt) || 0);

    this.contacts = contacts;
  }

  bodyGroundContact() {
    const pts = [[0, -0.12, 2.6], [0, -0.12, -2.3], [0.85, -0.1, 0], [-0.85, -0.1, 0], [0, 0.75, -0.4], [0.6, 0.55, 0.2], [-0.6, 0.55, 0.2]];
    const surf = this._bodySurf || (this._bodySurf = {});
    for (const [x, y, z] of pts) {
      const p = new V3(x, y, z).applyQuaternion(this.quat).add(this.pos);
      const sfc = this.world.surface(p.x, p.z, p.y + 0.6, surf);
      if (sfc.water) continue;
      const pen = sfc.h - p.y;
      if (pen > 0 && pen < 1.5) {
        const n = new V3(sfc.nx, sfc.ny, sfc.nz);
        this.pos.addScaledVector(n, pen * 0.8);
        const r = new V3().subVectors(p, this.pos);
        const vp = new V3().crossVectors(this.angVel, r).add(this.vel);
        const vn = vp.dot(n);
        if (vn < 0) {
          const j = -(1.1 * vn) / this.invMassAt(p, n);
          const J = n.clone().multiplyScalar(j);
          // scraping friction
          const vt = vp.clone().addScaledVector(n, -vn);
          const vtl = vt.length();
          if (vtl > 1e-3) J.addScaledVector(vt, -Math.min(0.5 * j, vtl / this.invMassAt(p, vt.clone().normalize())) / vtl);
          this.applyImpulse(J, p);
          this.impact = Math.max(this.impact, j);
        }
      }
    }
  }

  /** Snapshot for interpolation. */
  snapshot(out = {}) {
    out.pos = (out.pos || new V3()).copy(this.pos);
    out.quat = (out.quat || new THREE.Quaternion()).copy(this.quat);
    out.wheels = out.wheels || this.wheels.map(() => ({}));
    this.wheels.forEach((w, i) => { out.wheels[i].len = w.len; out.wheels[i].spin = w.spin; out.wheels[i].steer = w.steer; });
    return out;
  }
}

/** Fixed-timestep driver: feeds variable frame times into constant sim steps. */
export class FixedStepper {
  constructor(sim, hz = 120) {
    this.sim = sim; this.dt = 1 / hz; this.acc = 0;
    this.prev = sim.snapshot(); this.curr = sim.snapshot();
    this.alpha = 0;
  }
  resync() { this.sim.snapshot(this.prev); this.sim.snapshot(this.curr); this.acc = 0; }
  advance(frameDt, input, onStep) {
    this.acc += Math.min(frameDt, 0.1);   // avoid spiral of death after a tab switch
    let n = 0;
    while (this.acc >= this.dt) {
      this.sim.snapshot(this.prev);
      this.sim.step(this.dt, input);
      if (onStep) onStep(this.dt);
      // edge-triggered inputs are consumed by the first step
      input.shiftUp = false; input.shiftDown = false;
      this.acc -= this.dt; n++;
    }
    this.sim.snapshot(this.curr);
    this.alpha = this.acc / this.dt;
    return n;
  }
  /** Interpolated pose for rendering. */
  pose(outPos, outQuat) {
    outPos.lerpVectors(this.prev.pos, this.curr.pos, this.alpha);
    outQuat.slerpQuaternions(this.prev.quat, this.curr.quat, this.alpha);
  }
}
