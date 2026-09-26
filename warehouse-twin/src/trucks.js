import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, Y_YARD, BUILD_L, uToZ, merge, rng, instanced, trs, clamp } from './util.js';
import { dockSlots, doorList } from './docks.js';

const TR = CONFIG.trucks;
const LT = 11.8; // trailer rear bumper to king pin
const LC = 4.7; // king pin to tractor front bumper
const LTOT = LT + LC;

// -----------------------------------------------------------------------------
// Geometry (local frame: +x forward, y = 0 on the ground, z lateral)
// -----------------------------------------------------------------------------
const bx = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const wheel = (r, w, x, y, z) => new THREE.CylinderGeometry(r, r, w, 10).rotateX(Math.PI / 2).translate(x, y, z);
const tank = (r, l, x, y, z) => new THREE.CylinderGeometry(r, r, l, 12).rotateZ(Math.PI / 2).translate(x, y, z);

/** Trailer with 40 ft container. Origin at the rear bumper. */
function trailerParts() {
  const p = { container: [], chassis: [], tyre: [], tail: [] };
  p.container.push(bx(12.19, 2.59, 2.44, 6.095, 1.32 + 1.295, 0));
  p.chassis.push(bx(12.0, 0.24, 1.0, 6.2, 1.18, 0));
  p.chassis.push(bx(0.14, 0.3, 2.3, 0.2, 0.8, 0));
  for (const x of [1.3, 2.6, 3.9]) {
    for (const s of [-1, 1]) p.tyre.push(wheel(0.5, 0.56, x, 0.5, s * 0.92));
    p.chassis.push(bx(0.9, 0.35, 2.3, x, 1.05, 0));
  }
  for (const s of [-1, 1]) p.chassis.push(bx(0.12, 0.9, 0.12, 9.3, 0.62, s * 0.8));
  for (const s of [-1, 1]) p.tail.push(bx(0.05, 0.14, 0.4, -0.03, 1.02, s * 0.95));
  return p;
}

/** Cab-over tractor unit. Origin at the king pin. */
function tractorParts() {
  const p = { cab: [], chassis: [], tyre: [], glass: [], head: [] };
  p.chassis.push(bx(6.2, 0.32, 1.0, 1.25, 1.0, 0));
  p.chassis.push(bx(1.3, 0.14, 1.5, 0, 1.24, 0));
  p.cab.push(bx(2.3, 2.55, 2.5, 3.35, 2.47, 0));
  p.cab.push(bx(1.6, 0.55, 2.3, 3.05, 4.0, 0));
  p.glass.push(bx(0.06, 1.05, 2.2, 4.52, 3.05, 0));
  p.glass.push(bx(1.05, 0.8, 2.52, 3.95, 3.1, 0));
  p.chassis.push(bx(0.32, 0.5, 2.5, 4.55, 1.05, 0));
  for (const s of [-1, 1]) {
    p.head.push(bx(0.06, 0.22, 0.42, 4.72, 1.12, s * 0.85));
    p.chassis.push(tank(0.32, 1.3, 1.4, 0.95, s * 1.02));
    p.tyre.push(wheel(0.52, 0.32, 3.6, 0.52, s * 1.06));
    for (const x of [-0.15, -1.45]) p.tyre.push(wheel(0.52, 0.56, x, 0.52, s * 0.92));
  }
  p.chassis.push(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8).translate(2.05, 3.4, 1.12));
  return p;
}

// Reach stacker (local: +x = boom direction, origin at the chassis centre on the ground)
const RS_REACH = 9.0; // horizontal distance from chassis centre to the spreader
const RS_SPREADER_Y = 8.2;
function reachStackerParts() {
  const p = { body: [], dark: [], tyre: [], glass: [] };
  p.body.push(bx(7.6, 1.4, 3.4, 0, 1.6, 0)); // chassis
  p.body.push(bx(1.5, 2.2, 3.4, -3.9, 2.0, 0)); // counterweight
  p.dark.push(bx(1.9, 0.4, 1.8, -0.5, 2.5, 1.0)); // cab floor
  p.body.push(bx(1.9, 0.25, 1.8, -0.5, 4.85, 1.0)); // cab roof
  p.glass.push(bx(1.7, 2.2, 1.6, -0.5, 3.6, 1.0)); // cab glazing
  for (const s of [-1, 1]) {
    p.tyre.push(wheel(0.95, 0.8, 2.3, 0.95, s * 1.35));
    p.tyre.push(wheel(0.95, 0.8, 2.3, 0.95, s * 0.55));
    p.tyre.push(wheel(0.78, 0.6, -2.6, 0.78, s * 1.35));
  }
  // telescopic boom from the rear pivot up to the spreader head
  const pivot = new THREE.Vector3(-3.2, 3.4, -0.3);
  const head = new THREE.Vector3(RS_REACH, RS_SPREADER_Y + 1.4, -0.3);
  const dir = new THREE.Vector3().subVectors(head, pivot);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
  const boom = (w, h, l0, l1) => {
    const g = new THREE.BoxGeometry(l1 - l0, h, w).translate((l0 + l1) / 2, 0, 0);
    g.applyQuaternion(q);
    g.translate(pivot.x, pivot.y, pivot.z);
    return g;
  };
  p.body.push(boom(1.0, 1.0, 0, len * 0.62));
  p.body.push(boom(0.8, 0.8, len * 0.55, len));
  p.dark.push(bx(0.5, 2.6, 0.5, 0.6, 3.2, -0.3)); // lift cylinder
  // rotator and spreader (parallel to the container, along z)
  p.dark.push(bx(0.6, 1.2, 0.6, RS_REACH, RS_SPREADER_Y + 0.7, -0.3));
  p.body.push(bx(1.1, 0.45, 6.1, RS_REACH, RS_SPREADER_Y, 0));
  for (const s of [-1, 1]) p.dark.push(bx(0.3, 0.5, 0.3, RS_REACH, RS_SPREADER_Y - 0.4, s * 2.9));
  return p;
}

const reachMaterial = (M, key) => ({ body: M.reachBody, dark: M.chassis, tyre: M.tyre, glass: M.windshield })[key];

function mergedParts(parts) {
  const out = {};
  for (const [k, list] of Object.entries(parts)) out[k] = merge(list);
  return out;
}

const partMaterial = (M, key) =>
  ({ container: M.container, cab: M.cab, chassis: M.chassis, tyre: M.tyre, glass: M.windshield, head: M.headlight, tail: M.taillight })[key];

// -----------------------------------------------------------------------------
// Paths: polyline with rounded corners, sampled by arc length (with linear extrapolation)
// -----------------------------------------------------------------------------
function fillet(pts, radius) {
  const out = [pts[0]];
  const n = pts.length;
  for (let i = 1; i < n - 1; i++) {
    const r = Array.isArray(radius) ? radius[i - 1] : radius;
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1];
    const d2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    const ang = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
    if (ang < 1e-3 || !r) {
      out.push(b);
      continue;
    }
    let t = r * Math.tan(ang / 2);
    t = Math.min(t, l1 * (i - 1 === 0 ? 1 : 0.5), l2 * (i + 1 === n - 1 ? 1 : 0.5));
    const p1 = [b[0] - d1[0] * t, b[1] - d1[1] * t];
    const p2 = [b[0] + d2[0] * t, b[1] + d2[1] * t];
    const N = 12;
    for (let k = 0; k <= N; k++) {
      const s = k / N, q = 1 - s;
      out.push([q * q * p1[0] + 2 * q * s * b[0] + s * s * p2[0], q * q * p1[1] + 2 * q * s * b[1] + s * s * p2[1]]);
    }
  }
  out.push(pts[n - 1]);
  // drop duplicates
  return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-4);
}

class Path {
  constructor(pts) {
    this.p = pts;
    this.c = [0];
    for (let i = 1; i < pts.length; i++) this.c.push(this.c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.c[this.c.length - 1];
  }
  at(s, out) {
    const p = this.p, c = this.c, n = p.length;
    let i;
    if (s <= 0) i = 0;
    else if (s >= this.len) i = n - 2;
    else {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (c[mid] <= s) lo = mid;
        else hi = mid;
      }
      i = lo;
    }
    const seg = c[i + 1] - c[i] || 1e-6;
    const t = (s - c[i]) / seg;
    out.x = p[i][0] + (p[i + 1][0] - p[i][0]) * t;
    out.z = p[i][1] + (p[i + 1][1] - p[i][1]) * t;
    return out;
  }
}

/** Trapezoidal velocity profile: accelerate over `a` of the time (optional in / out). */
function profile(u, a, easeIn, easeOut) {
  const ai = easeIn ? a : 0, ao = easeOut ? a : 0;
  const vmax = 1 / (1 - (ai + ao) / 2);
  if (u < ai) return (0.5 * vmax * u * u) / ai;
  if (u > 1 - ao) return 1 - (0.5 * vmax * (1 - u) * (1 - u)) / ao;
  return 0.5 * vmax * ai + vmax * (u - ai);
}

// -----------------------------------------------------------------------------
// Build
// -----------------------------------------------------------------------------
export function buildTrucks(M, doors, parkingBays = [], evBays = []) {
  const group = new THREE.Group();
  group.name = 'trucks';
  const rand = rng(77);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const trailer = mergedParts(trailerParts());
  const tractor = mergedParts(tractorParts());

  // Whole truck in trailer frame (for static instances)
  const whole = {};
  for (const [k, g] of Object.entries(trailer)) whole[k] = [g];
  for (const [k, g] of Object.entries(tractor)) (whole[k] ||= []).push(g.clone().translate(LT, 0, 0));
  for (const k of Object.keys(whole)) whole[k] = merge(whole[k]);

  const doorByKey = new Map(doors.map((d) => [`${d.group}:${d.index}`, d]));
  const slots = dockSlots();
  const animKeys = new Set(TR.animatedSlots.map((a) => `${a.group}:${a.door}:${a.slot}`));

  // ---- static trucks ---------------------------------------------------------
  const statics = []; // {x, z, ry, yard}
  for (const s of slots) {
    const key = `${s.door.group}:${s.door.index}:${s.slot}`;
    if (animKeys.has(key)) continue;
    // west side: container trucks park parallel to the facade instead (see westApron)
    const ratio = s.door.side === 'east' ? TR.staticDockRatio : 0;
    if (rand() > ratio) continue;
    statics.push({ x: s.x, z: s.z, ry: s.dir > 0 ? 0 : Math.PI, yard: false });
  }
  const WA = CONFIG.westApron;
  for (const t of WA.parallelTrucks) {
    // cab to the north: the rear bumper sits half a truck length south of the centre
    statics.push({ x: m(t.x), z: m(t.z) + LTOT / 2, ry: Math.PI / 2, yard: false });
  }
  for (const b of parkingBays) {
    if (rand() > CONFIG.context.parkedTruckRatio) continue;
    const dir = rand() > 0.5 ? 1 : -1; // nose north or south
    statics.push({ x: b.x, z: b.z + dir * (LTOT / 2 - 0.3) * -1, ry: dir > 0 ? -Math.PI / 2 : Math.PI / 2, yard: true });
  }
  // two instanced sets: trucks at the docks cast shadows, the far truck yard does not (cheaper)
  const staticGroup = new THREE.Group();
  for (const yard of [false, true]) {
    const set = statics.filter((s) => s.yard === yard);
    if (!set.length) continue;
    const mats = set.map((s) => trs(s.x, Y_YARD, s.z, s.ry));
    const cabCols = set.map(() => new THREE.Color(pick(TR.cabColors)));
    const boxCols = set.map(() => new THREE.Color(pick(TR.containerColors)));
    for (const [k, g] of Object.entries(whole)) {
      const cols = k === 'cab' ? cabCols : k === 'container' ? boxCols : null;
      staticGroup.add(instanced(g, partMaterial(M, k), mats, cols, { cast: !yard, receive: k === 'container' }));
    }
  }
  group.add(staticGroup);

  // ---- container blocks on the west apron (bays between the west doors) --------
  // 2 x 20 ft along the wall, 4 rows deep; rows under the canopy stay one high.
  const westDoors = doorList().filter((d) => d.side === 'west');
  const cMats = [], cCols = [];
  const cGeo = new THREE.BoxGeometry(2.44, 2.59, 6.06);
  cGeo.translate(0, 1.295, 0);
  const stackBays = [];
  for (const wh of CONFIG.building.warehouses) {
    const du = westDoors.filter((d) => d.warehouse === wh.id).map((d) => d.u);
    if (!du.length) continue;
    for (let u = Math.min(...du); u <= Math.max(...du); u += 12) if (!du.some((x) => Math.abs(x - u) < 1)) stackBays.push(u);
  }
  for (const u of stackBays) {
    for (const dz of [-3.2, 3.2]) {
      WA.stackRowsX.forEach((rx, ri) => {
        if (rand() < 0.1) return;
        const hgt = 1 + Math.floor(rand() * WA.stackMaxHigh[ri]);
        for (let k = 0; k < hgt; k++) {
          cMats.push(trs(m(rx), Y_YARD + k * 2.6, uToZ(u) + dz));
          cCols.push(new THREE.Color(pick(TR.containerColors)));
        }
      });
    }
  }

  // ---- reach stackers, perpendicular to the wall, boom towards the stacks -------
  const rs = mergedParts(reachStackerParts());
  const rsMats = WA.reachStackers.map((u) => trs(m(WA.reachStackerX), Y_YARD, uToZ(m(u)), 0));
  for (const [k, g] of Object.entries(rs)) group.add(instanced(g, reachMaterial(M, k), rsMats, null));
  // two of them are carrying a container on the spreader
  WA.reachStackers.forEach((u, i) => {
    if (i % 2 === 1) {
      cMats.push(trs(m(WA.reachStackerX) + RS_REACH, Y_YARD + RS_SPREADER_Y - 2.75, uToZ(m(u))));
      cCols.push(new THREE.Color(pick(TR.containerColors)));
    }
  });

  // ---- electric tractor units on charge (EV charging area) -----------------------
  if (evBays.length) {
    const evMats = [], evCols = [];
    for (const b of evBays) {
      if (rand() > CONFIG.context.evCharging.occupied) continue;
      // nose towards the charger (west): king pin 6 m inside the bay
      evMats.push(trs(b.x0 + 1.4 + LC, Y_YARD, b.z, Math.PI));
      evCols.push(new THREE.Color(pick(['#f4f4f2', '#1d5fb8', '#e2622b', '#2f8f4e', '#fafafa'])));
    }
    for (const [k, g] of Object.entries(tractor)) {
      group.add(instanced(g, partMaterial(M, k), evMats, k === 'cab' ? evCols : null, { cast: false }));
    }
  }

  // worldUV-like local UVs for the corrugation texture
  const uv = cGeo.attributes.uv, pos = cGeo.attributes.position, nor = cGeo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), az = Math.abs(nor.getZ(i));
    if (ax > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else if (az > 0.5) uv.setXY(i, pos.getX(i), pos.getY(i));
    else uv.setXY(i, pos.getZ(i), pos.getX(i));
  }
  group.add(instanced(cGeo, M.container, cMats, cCols));
  fixContainerUV(trailer.container);
  fixContainerUV(whole.container);

  // ---- animated trucks -------------------------------------------------------
  const animated = [];
  const gateX = m(CONFIG.site.gates.find((g) => g.id === 'G1').x);
  // eastbound lane of N1 / westbound lane of N3 (right-hand traffic)
  const nLane = -(BUILD_L / 2 + m(CONFIG.site.setback.north)) - m(CONFIG.context.sidewalk) - m(CONFIG.context.roadWidth) * 0.25;
  const sLane = BUILD_L / 2 + m(CONFIG.site.setback.south) + m(CONFIG.context.sidewalk) + m(CONFIG.context.roadWidth) * 0.25;
  const spawnX = -150;
  const laneIn = 80, laneOut = 76;

  TR.animatedSlots.slice(0, TR.animated).forEach((a, idx) => {
    const slot = slots.find((s) => s.door.group === a.group && s.door.index === a.door && s.slot === a.slot);
    if (!slot || slot.door.side !== 'east') return;
    const door = doorByKey.get(`${a.group}:${a.door}`);
    const zd = slot.z, xd = slot.x;

    const entry = new Path(fillet([[spawnX, nLane], [gateX, nLane], [gateX, -186], [68, -172], [68, -122], [laneIn, -106], [laneIn, zd + 8 + LTOT]], [10, 10, 12, 12, 12]));
    const rev = new Path([[laneIn, zd + 8 + LTOT], ...fillet([[laneIn, zd + 8], [laneIn, zd], [xd, zd]], 8)]);
    const exit = new Path(fillet([[xd, zd], [laneOut, zd], [laneOut, 146], [gateX, 172], [gateX, sLane], [spawnX, sLane]], [6, 14, 14, 10]));

    const dwell = TR.dwell[0] + rand() * (TR.dwell[1] - TR.dwell[0]);
    const v = TR.speed, vr = TR.reverseSpeed;
    // door: open while reversing and docked, closes 3.5 s after the truck pulls out
    const segs = [
      { kind: 'move', path: entry, rev: false, s0: LTOT, s1: entry.len, dur: (entry.len - LTOT) / (v * 0.9), easeIn: true, easeOut: true, fadeIn: true },
      { kind: 'wait', dur: 1.5 },
      { kind: 'move', path: rev, rev: true, s0: LTOT, s1: rev.len, dur: (rev.len - LTOT) / (vr * 0.8), easeIn: true, easeOut: true, reversing: true, door: true },
      { kind: 'wait', dur: dwell, door: true },
      { kind: 'move', path: exit, rev: false, s0: LTOT, s1: exit.len, dur: (exit.len - LTOT) / (v * 0.92), easeIn: true, easeOut: false, fadeOut: true, doorFor: 3.5 },
      { kind: 'hide', dur: 5 + rand() * 6 },
    ];
    let t0 = 0;
    let lastMove = null;
    for (const s of segs) {
      s.t0 = t0;
      t0 += s.dur;
      if (s.kind === 'move') lastMove = s;
      else s.hold = lastMove; // pose to keep while waiting
    }
    const cycle = t0;

    // per-truck materials (colour + fade)
    const cabColor = new THREE.Color(TR.cabColors[(idx * 2 + 1) % TR.cabColors.length]);
    const boxColor = new THREE.Color(TR.containerColors[(idx * 3) % TR.containerColors.length]);
    const own = {};
    const makeGroup = (parts) => {
      const g = new THREE.Group();
      for (const [k, geo] of Object.entries(parts)) {
        if (!own[k]) {
          own[k] = partMaterial(M, k).clone();
          own[k].transparent = true;
          if (k === 'cab') own[k].color = cabColor;
          if (k === 'container') own[k].color = boxColor;
        }
        const me = new THREE.Mesh(geo, own[k]);
        me.castShadow = true;
        me.receiveShadow = k === 'container';
        g.add(me);
      }
      group.add(g);
      return g;
    };
    const trG = makeGroup(tractor);
    const tlG = makeGroup(trailer);
    animated.push({ segs, cycle, t: (idx / TR.animated) * cycle, trG, tlG, own, door, state: {} });
  });

  // ---- update ------------------------------------------------------------------
  const pF = { x: 0, z: 0 }, pK = { x: 0, z: 0 }, pR = { x: 0, z: 0 };
  let dusk = 0;

  function place(tr, seg, s) {
    const P = seg.path;
    if (!seg.rev) {
      P.at(s, pF);
      P.at(s - LC, pK);
      P.at(s - LTOT, pR);
    } else {
      P.at(s, pR);
      P.at(s - LT, pK);
      P.at(s - LTOT, pF);
    }
    tr.tlG.position.set(pR.x, Y_YARD, pR.z);
    tr.tlG.rotation.y = Math.atan2(-(pK.z - pR.z), pK.x - pR.x);
    tr.trG.position.set(pK.x, Y_YARD, pK.z);
    tr.trG.rotation.y = Math.atan2(-(pF.z - pK.z), pF.x - pK.x);
  }

  function setOpacity(tr, o) {
    const vis = o > 0.01;
    tr.trG.visible = tr.tlG.visible = vis;
    for (const mat of Object.values(tr.own)) {
      mat.opacity = o;
      mat.transparent = o < 0.999;
      mat.depthWrite = o > 0.5;
    }
  }

  function update(dt) {
    for (const tr of animated) {
      tr.t = (tr.t + dt) % tr.cycle;
      const seg = tr.segs.find((s) => tr.t >= s.t0 && tr.t < s.t0 + s.dur) || tr.segs[0];
      const u = clamp((tr.t - seg.t0) / seg.dur, 0, 1);
      const wantDoor = !!seg.door || (seg.doorFor !== undefined && tr.t - seg.t0 < seg.doorFor);
      if (tr.door && wantDoor !== !!tr.state.holding) {
        tr.door.users = Math.max(0, tr.door.users + (wantDoor ? 1 : -1));
        tr.state.holding = wantDoor;
      }
      if (seg.kind === 'hide') {
        setOpacity(tr, 0);
        continue;
      }
      let op = 1;
      if (seg.kind === 'wait' && seg.hold) place(tr, seg.hold, seg.hold.s1);
      if (seg.kind === 'move') {
        const f = profile(u, 0.18, seg.easeIn, seg.easeOut);
        place(tr, seg, seg.s0 + (seg.s1 - seg.s0) * f);
        const tIn = tr.t - seg.t0, tLeft = seg.t0 + seg.dur - tr.t;
        if (seg.fadeIn) op = Math.min(1, tIn / 1.5);
        if (seg.fadeOut) op = Math.min(1, tLeft / 1.5);
      }
      setOpacity(tr, op);
      tr.own.tail.emissiveIntensity = seg.reversing ? 2.5 : 0.3 + dusk;
      tr.own.head.emissiveIntensity = 0.2 + dusk * 2.5;
    }
    for (const d of doors) {
      d.target = d.users > 0 ? 1 : 0;
      if (Math.abs(d.open - d.target) > 1e-3) {
        const step = dt * 0.45;
        d.setOpen(d.open < d.target ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step));
      }
    }
  }

  function setDusk(k) {
    dusk = k;
    M.headlight.emissiveIntensity = 0.2 + k * 2.5;
    M.taillight.emissiveIntensity = 0.2 + k * 1.2;
  }

  // Warm start so trucks are already spread over the site on first frame
  update(0);

  return { group, update, setDusk, animated, stats: { static: statics.length, containers: cMats.length, animated: animated.length } };
}

function fixContainerUV(g) {
  if (!g) return;
  const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), az = Math.abs(nor.getZ(i));
    if (ax > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else if (az > 0.5) uv.setXY(i, pos.getX(i), pos.getY(i));
    else uv.setXY(i, pos.getX(i), pos.getZ(i));
  }
  uv.needsUpdate = true;
}
