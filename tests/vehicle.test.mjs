// Vehicle dynamics tests — run with `node --test tests/`
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VehicleSim, FixedStepper, FLAT_WORLD } from '../src/vehicle/sim.js';

const DT = 1 / 120;
const kmh = v => v * 3.6;

function newCar(world = FLAT_WORLD) {
  const car = new VehicleSim(undefined, world);
  car.reset(new THREE.Vector3(0, 0, 0), 0);
  return car;
}
function run(car, seconds, input, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const inp = typeof input === 'function' ? input(car, i * DT) : input;
    car.step(DT, { ...inp });
    if (each && each(car, i * DT) === false) return i * DT;
  }
  return seconds;
}
function finite(car) {
  return [car.pos.x, car.pos.y, car.pos.z, car.vel.x, car.vel.y, car.vel.z, car.quat.w].every(Number.isFinite);
}

test('settles on its springs at rest', () => {
  const car = newCar();
  run(car, 3, {});
  assert.ok(finite(car));
  assert.ok(car.speed < 0.05, `speed ${car.speed}`);
  assert.equal(car.contacts, 4);
  const h = car.pos.y;
  assert.ok(h > 0.2 && h < 0.6, `ride height ${h}`);
  for (const w of car.wheels) assert.ok(w.load > 1200 && w.load < 2800, `load ${w.load}`);
  // weight distribution slightly rearward, as specified by the mount points
  const front = car.wheels[0].load + car.wheels[1].load, rear = car.wheels[2].load + car.wheels[3].load;
  assert.ok(rear > front, 'rear-biased static load');
});

test('0–100 km/h in a plausible time, with traction control', () => {
  const car = newCar();
  run(car, 1, {});
  const t = run(car, 10, { throttle: 1 }, c => kmh(c.forwardSpeed) < 100);
  assert.ok(t > 2.0 && t < 4.5, `0-100 took ${t.toFixed(2)}s`);
  assert.ok(Math.abs(car.pos.x) < 0.5, `drifted sideways ${car.pos.x}`);
});

test('top speed is limited by drag (250–330 km/h) and gears go up', () => {
  const car = newCar();
  run(car, 1, {});
  let maxGear = 1;
  run(car, 70, { throttle: 1 }, c => { maxGear = Math.max(maxGear, c.gear); });
  const v = kmh(car.forwardSpeed);
  assert.ok(v > 250 && v < 330, `top speed ${v.toFixed(0)} km/h`);
  assert.ok(maxGear >= 7, `max gear ${maxGear}`);
  assert.ok(finite(car));
});

test('downforce compresses the suspension at speed', () => {
  const car = newCar();
  run(car, 1.5, {});
  const rest = car.pos.y;
  run(car, 25, { throttle: 1 });
  assert.ok(car.pos.y < rest - 0.01, `ride height ${rest.toFixed(3)} → ${car.pos.y.toFixed(3)}`);
});

test('braking 100→0 km/h stops in a short, stable distance (ABS on)', () => {
  const car = newCar();
  run(car, 1, {});
  run(car, 10, { throttle: 1 }, c => kmh(c.forwardSpeed) < 100);
  const z0 = car.pos.z;
  let pitchMax = 0;
  run(car, 6, { brake: 1 }, c => {
    const f = c.forward(new THREE.Vector3());
    pitchMax = Math.max(pitchMax, -Math.asin(f.y));       // nose dives → forward vector points down
    return c.forwardSpeed > 0.3;
  });
  const d = car.pos.z - z0;
  assert.ok(d > 18 && d < 45, `stopping distance ${d.toFixed(1)} m`);
  assert.ok(pitchMax > 0.002, `nose dive under braking (pitch ${pitchMax.toFixed(4)})`);
  assert.ok(Math.abs(car.pos.x) < 1, 'stays straight');
});

test('locking the brakes without ABS takes longer than with ABS', () => {
  const dist = abs => {
    const car = newCar(); car.assists.abs = abs;
    run(car, 1, {}); run(car, 10, { throttle: 1 }, c => kmh(c.forwardSpeed) < 120);
    const z0 = car.pos.z; run(car, 8, { brake: 1 }, c => c.forwardSpeed > 0.3);
    return car.pos.z - z0;
  };
  const withAbs = dist(true), without = dist(false);
  assert.ok(without > withAbs, `ABS ${withAbs.toFixed(1)} m vs locked ${without.toFixed(1)} m`);
});

test('steady cornering: lateral g is bounded by grip and the car rolls outward', () => {
  const car = newCar();
  run(car, 1, {});
  // hold ~70 km/h and full lock left
  let maxLat = 0, rollMax = 0;
  run(car, 8, (c) => ({ throttle: kmh(c.forwardSpeed) < 70 ? 0.6 : 0.15, steer: 1 }), (c, t) => {
    if (t > 3) {
      const yawRate = c.angVel.y;
      maxLat = Math.max(maxLat, Math.abs(yawRate * c.speed));
      const l = c.left(new THREE.Vector3());
      rollMax = Math.max(rollMax, Math.abs(l.y));
    }
  });
  assert.ok(finite(car));
  const g = maxLat / 9.81;
  assert.ok(g > 0.8 && g < 2.6, `lateral ${g.toFixed(2)} g`);
  assert.ok(rollMax > 0.003, `body roll ${rollMax.toFixed(4)}`);
  // weight transfer: outer (right) wheels carry more load when turning left
  const outer = car.wheels[1].load + car.wheels[3].load, inner = car.wheels[0].load + car.wheels[2].load;
  assert.ok(outer > inner * 1.15, `outer ${outer.toFixed(0)} vs inner ${inner.toFixed(0)}`);
});

test('steering lock shrinks with speed', () => {
  const lockAt = (speedKmh) => {
    const car = newCar(); run(car, 1, {});
    run(car, 30, { throttle: 1 }, c => kmh(c.forwardSpeed) < speedKmh);
    run(car, 1.2, { steer: 1, throttle: 0.3 });
    return Math.abs(car.steerAngle);
  };
  const slow = lockAt(30), fast = lockAt(180);
  assert.ok(slow > fast * 2.5, `lock ${slow.toFixed(3)} rad at 30 km/h vs ${fast.toFixed(3)} at 180`);
});

test('handbrake turn makes the rear slide, and the car recovers', () => {
  const car = newCar();
  car.assists.stability = 0;
  run(car, 1, {});
  run(car, 10, { throttle: 1 }, c => kmh(c.forwardSpeed) < 55);
  let maxSlip = 0;
  run(car, 1.2, { steer: 1, handbrake: true }, c => { maxSlip = Math.max(maxSlip, Math.abs(c.bodySlip)); });
  assert.ok(maxSlip > 0.15, `body slip during handbrake ${maxSlip.toFixed(2)} rad`);
  // release, counter-steer naturally by letting the wheel centre, light throttle
  run(car, 4, { throttle: 0.3 });
  assert.ok(finite(car));
  assert.ok(car.up(new THREE.Vector3()).y > 0.95, 'stayed upright');
  assert.ok(Math.abs(car.bodySlip) < 0.12, `recovered slip ${car.bodySlip.toFixed(3)}`);
});

test('power oversteer is possible with traction control off', () => {
  const slipWith = tc => {
    const car = newCar(); car.assists.tc = tc; car.assists.stability = 0;
    run(car, 1, {}); run(car, 10, { throttle: 0.5 }, c => kmh(c.forwardSpeed) < 40);
    let m = 0;
    run(car, 2, { throttle: 1, steer: 1 }, c => { m = Math.max(m, Math.abs(c.bodySlip)); });
    return m;
  };
  const off = slipWith(false), on = slipWith(true);
  assert.ok(off > on, `slip TC off ${off.toFixed(3)} vs on ${on.toFixed(3)}`);
});

test('reverse engages after holding brake at a standstill', () => {
  const car = newCar();
  run(car, 1, {});
  run(car, 3, { brake: 1 });
  assert.equal(car.gear, -1);
  assert.ok(car.forwardSpeed < -1, `reversing ${car.forwardSpeed.toFixed(2)} m/s`);
  assert.ok(car.forwardSpeed > -10, 'reverse speed capped');
  run(car, 2, { throttle: 1 });
  assert.equal(car.gear >= 1, true);
});

test('wall collision: no tunnelling, speed drops, car pushed back', () => {
  // wall across the road at z = 40
  const world = {
    surface: FLAT_WORLD.surface,
    collide(sim) {
      let hit = 0;
      const f = sim.forward(new THREE.Vector3());
      for (const off of [2.0, 0, -2.0]) {
        const c = sim.pos.clone().addScaledVector(f, off);
        const pen = c.z + 0.95 - 40;
        if (pen > 0) {
          sim.pos.z -= pen;
          const n = new THREE.Vector3(0, 0, -1);
          const vp = sim.vel.dot(n);
          if (vp < 0) {
            const j = -(1.3 * vp) / sim.invMassAt(c, n);
            sim.applyImpulse(n.clone().multiplyScalar(j), c);
            hit = Math.max(hit, j);
          }
        }
      }
      return hit;
    },
  };
  const car = newCar(world);
  run(car, 1, {});
  let maxImpact = 0;
  run(car, 6, { throttle: 1 }, c => { maxImpact = Math.max(maxImpact, c.impact); return c.pos.z < 39.5 - 3; });
  run(car, 2, {}, c => { maxImpact = Math.max(maxImpact, c.impact); });
  assert.ok(car.pos.z < 40, `front of car stayed behind wall (z=${car.pos.z.toFixed(2)})`);
  assert.ok(maxImpact > 1000, `impact reported ${maxImpact.toFixed(0)}`);
  assert.ok(car.forwardSpeed < 8, 'speed scrubbed');
});

test('deterministic: identical inputs give identical results', () => {
  const script = (c, t) => ({ throttle: t < 4 ? 1 : 0.2, steer: Math.sin(t * 1.3), handbrake: t > 5 && t < 5.4 });
  const a = newCar(), b = newCar();
  run(a, 8, script); run(b, 8, script);
  assert.equal(a.pos.x, b.pos.x); assert.equal(a.pos.z, b.pos.z); assert.equal(a.quat.w, b.quat.w);
});

test('frame-rate independent through the fixed stepper', () => {
  const drive = fps => {
    const car = newCar();
    const st = new FixedStepper(car, 120);
    const total = 6; let t = 0; const frame = 1 / fps;
    while (t < total - 1e-9) {
      const inp = { throttle: 1, steer: t > 3 ? 0.6 : 0 };
      st.advance(frame, inp); t += frame;
    }
    return car;
  };
  const a = drive(30), b = drive(144), c = drive(60);
  const dAB = a.pos.distanceTo(b.pos), dAC = a.pos.distanceTo(c.pos);
  // inputs are sampled per frame, so a 30 fps run can lag by up to one frame of input
  assert.ok(dAB < 2.5 && dAC < 2.5, `position spread 30/144: ${dAB.toFixed(2)} m, 30/60: ${dAC.toFixed(2)} m`);
});

test('reset is deterministic and puts the car on the ground at rest', () => {
  const car = newCar();
  run(car, 3, { throttle: 1, steer: 0.5 });
  car.reset(new THREE.Vector3(10, 0, 5), Math.PI / 2);
  assert.equal(car.speed, 0);
  assert.ok(Math.abs(car.heading - Math.PI / 2) < 1e-6);
  run(car, 1, {});
  assert.equal(car.contacts, 4);
});
