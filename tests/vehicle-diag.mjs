import * as THREE from 'three';
import { VehicleSim } from '../src/vehicle/sim.js';
const DT=1/120, kmh=v=>v*3.6;
const mk=()=>{const c=new VehicleSim(); c.reset(new THREE.Vector3(),0); for(let i=0;i<120;i++) c.step(DT,{}); return c;};
const until=(c,inp,cond,max=60)=>{let t=0; while(t<max && cond(c)){ c.step(DT,typeof inp==='function'?inp(c,t):{...inp}); t+=DT;} return t;};
let c=mk(); console.log('static loads', c.wheels.map(w=>w.load.toFixed(0)).join(' '), 'y', c.pos.y.toFixed(3));
c=mk(); console.log('0-100', until(c,{throttle:1},c=>kmh(c.forwardSpeed)<100).toFixed(2), '0-200', (until(c,{throttle:1},c=>kmh(c.forwardSpeed)<200)).toFixed(2));
c=mk(); until(c,{throttle:1},()=>true,70); console.log('vmax', kmh(c.forwardSpeed).toFixed(0), 'gear', c.gear, 'rpm', c.rpm.toFixed(0));
for (const sp of [40,80,150,220]) { c=mk(); until(c,{throttle:1},c=>kmh(c.forwardSpeed)<sp); let lat=0, slip=0; until(c,c=>({throttle:kmh(c.forwardSpeed)<sp?0.7:0.1, steer:1}),()=>true,4); for(let i=0;i<240;i++){c.step(DT,{throttle:kmh(c.forwardSpeed)<sp?0.7:0.1,steer:1}); lat=Math.max(lat,Math.abs(c.angVel.y*c.speed)); slip=Math.max(slip,Math.abs(c.bodySlip));} console.log('corner',sp,'kmh lat g',(lat/9.81).toFixed(2),'slip',slip.toFixed(3),'steer',c.steerAngle.toFixed(3),'v',kmh(c.speed).toFixed(0)); }
for (const sp of [50,80]) { c=mk(); c.assists.stability=0; until(c,{throttle:1},c=>kmh(c.forwardSpeed)<sp); let m=0; until(c,{steer:1,handbrake:true},c=>{m=Math.max(m,Math.abs(c.bodySlip));return true;},1.2); console.log('handbrake',sp,'slip',m.toFixed(3), 'yaw', c.heading.toFixed(2)); }
c=mk(); until(c,{throttle:1},c=>kmh(c.forwardSpeed)<100); let z0=c.pos.z; until(c,{brake:1},c=>c.forwardSpeed>0.3); console.log('brake 100-0', (c.pos.z-z0).toFixed(1));
c=mk(); until(c,{throttle:1},c=>kmh(c.forwardSpeed)<200); z0=c.pos.z; until(c,{brake:1},c=>c.forwardSpeed>0.3); console.log('brake 200-0', (c.pos.z-z0).toFixed(1));
