import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, Y_YARD, merge, mesh, instanced, trs, rng, flatRect, clamp } from './util.js';
import { LT, LC, LTOT, bx, wheel, trailerParts, tractorParts, mergedParts, partMaterial, fillet, Path } from './trucks.js';

/**
 * Yard operations in the west depot:
 *   - container truck waiting area (east of the EV charging row)
 *   - container stuffing: open 20 ft containers with cargo trucks parked alongside, conveyors from
 *     the trucks into the containers, workers carrying bags, trucks arriving / leaving through the apron
 */

const O = CONFIG.operations;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Stacked cargo bags seen through a container door. */
function bagWallTexture(color) {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#6b5410';
    x.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let row = 0; row < 12; row++) {
      const off = row % 2 ? 16 : 0;
      for (let col = -1; col < 9; col++) {
        const px = col * 32 + off, py = h - (row + 1) * 21;
        x.fillStyle = color;
        x.globalAlpha = 0.85 + r() * 0.15;
        x.beginPath();
        x.roundRect(px + 1, py + 1, 30, 19, 6);
        x.fill();
        x.globalAlpha = 1;
        x.fillStyle = 'rgba(200,40,30,0.8)';
        x.fillRect(px + 10, py + 7, 12, 3);
      }
    }
  });
}

/** Covered cargo truck (green body, dark tarp), local +x forward, origin at the rear. */
function cargoTruckParts() {
  const p = { cab: [], body: [], tarp: [], chassis: [], tyre: [], glass: [] };
  p.chassis.push(bx(9.6, 0.35, 1.0, 4.9, 0.95, 0));
  p.body.push(bx(7.4, 1.25, 2.45, 3.8, 1.75, 0)); // green drop sides
  p.tarp.push(bx(7.5, 1.5, 2.5, 3.8, 3.1, 0)); // tarpaulin cover
  p.cab.push(bx(2.1, 2.5, 2.45, 8.65, 2.05, 0));
  p.glass.push(bx(0.06, 1.0, 2.2, 9.72, 2.6, 0));
  for (const s of [-1, 1]) {
    for (const x of [1.4, 2.6, 8.4]) p.tyre.push(wheel(0.5, 0.45, x, 0.5, s * 1.0));
  }
  return p;
}

/** Worker parts, origin at the feet, facing +x. */
function workerParts() {
  return {
    legs: merge([bx(0.22, 0.85, 0.36, 0, 0.425, 0)]),
    torso: merge([bx(0.26, 0.62, 0.48, 0, 1.16, 0)]),
    head: merge([new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.6, 0)]),
    hat: merge([new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.66, 0)]),
  };
}

export function buildOperations(M, ancillary) {
  const statics = new THREE.Group();
  statics.name = 'operations';
  const yard = new THREE.Group(); // vehicles, containers, bags, workers (Trucks & containers layer)
  yard.name = 'operations-yard';
  const anchors = [];
  const rand = rng(4242);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4ee', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
  const addHover = (group, name, size) => {
    ancillary.push({ config: { id: name }, group, box: new THREE.Box3().setFromObject(group), info: { name, size } });
    group.traverse((q) => q.isMesh && (q.userData.anc = ancillary.length - 1));
  };

  // ===========================================================================
  // 1. Container truck waiting area
  // ===========================================================================
  {
    const W = O.truckWaiting;
    const x0 = m(W.x0), x1 = x0 + m(W.bayDepth), z0 = m(W.z0), z1 = m(W.z1), bw = m(W.bayWidth);
    const n = Math.floor((z1 - z0) / bw);
    const area = new THREE.Group();
    area.name = 'truck-waiting';
    const lines = [];
    for (let k = 0; k <= n; k++) lines.push(bx(x1 - x0, 0.02, 0.15, (x0 + x1) / 2, Y_YARD + 0.075, z0 + k * bw));
    lines.push(bx(0.15, 0.02, n * bw, x1, Y_YARD + 0.075, z0 + (n * bw) / 2));
    area.add(mesh(merge(lines), white, { cast: false }));
    statics.add(area);
    const trailers = [], tractors = [], boxCols = [], cabCols = [];
    for (let k = 0; k < n; k++) {
      if (rand() > W.occupied) continue;
      const z = z0 + (k + 0.5) * bw;
      trailers.push(trs(x0 + 0.8, Y_YARD, z, 0));
      tractors.push(trs(x0 + 0.8 + LT, Y_YARD, z, 0));
      boxCols.push(new THREE.Color(pick(CONFIG.depot.containerColors)));
      cabCols.push(new THREE.Color(pick(CONFIG.trucks.cabColors)));
    }
    for (const [k, g] of Object.entries(mergedParts(trailerParts()))) yard.add(instanced(g, partMaterial(M, k), trailers, k === 'container' ? boxCols : null));
    for (const [k, g] of Object.entries(mergedParts(tractorParts()))) yard.add(instanced(g, partMaterial(M, k), tractors, k === 'cab' ? cabCols : null));
    addHover(area, 'Container truck waiting area', `${n} bays, trucks waiting for their turn`);
    anchors.push({ text: 'Container truck waiting area', cls: 'zone', pos: [(x0 + x1) / 2 + 4, Y_YARD + 9, (z0 + z1) / 2] });
  }

  // ===========================================================================
  // 2. Container stuffing area
  // ===========================================================================
  const R = O.stuffing;
  const X0 = m(R.x0), X1 = m(R.x1), Z0 = m(R.z0), Z1 = m(R.z1);
  const CL = 6.06, cp = m(R.containerPitch);
  const gLen = R.perGroup * cp;
  const nG = Math.floor((Z1 - Z0 + m(R.groupGap)) / (gLen + m(R.groupGap)));
  const zStart = Z0 + (Z1 - Z0 - (nG * gLen + (nG - 1) * m(R.groupGap))) / 2;
  const rows = [
    { xc: X0 + CL / 2 + 0.4, dir: 1 }, // west row: doors face east (+x)
    { xc: X1 - CL / 2 - 0.4, dir: -1 }, // east row: doors face west (-x)
  ];
  const workGap = m(R.workGap);
  // truck slots: parked in a lane in front of the container doors, parallel to the container row
  const bays = []; // one per truck slot { dir, xd, xt, zt, zc (served container), face, state }
  const conts = []; // { xc, xd, z, dir, fill }
  const slotLen = gLen / R.trucksPerGroup;
  rows.forEach((row) => {
    const xd = row.xc + row.dir * (CL / 2);
    const xt = xd + row.dir * (workGap + 1.25);
    for (let g = 0; g < nG; g++) {
      const z0 = zStart + g * (gLen + m(R.groupGap));
      for (let i = 0; i < R.perGroup; i++) conts.push({ xc: row.xc, xd, z: z0 + (i + 0.5) * cp, dir: row.dir, fill: null });
      for (let k = 0; k < R.trucksPerGroup; k++) {
        const zt = z0 + (k + 0.5) * slotLen;
        bays.push({ dir: row.dir, xd, xt, zt, zc: 0, face: rand() < 0.5 ? 1 : -1, state: 'empty' });
      }
    }
  });
  // truck slot states, shuffled
  {
    const states = [];
    for (const [k, n] of Object.entries(R.mix)) for (let i = 0; i < n; i++) states.push(k);
    while (states.length < bays.length) states.push('empty');
    for (let i = states.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [states[i], states[j]] = [states[j], states[i]];
    }
    bays.forEach((b, i) => (b.state = states[i]));
  }
  // the container each working truck serves: the one opposite the truck's middle
  for (const b of bays) {
    let best = null;
    for (const c of conts) if (c.dir === b.dir && (!best || Math.abs(c.z - b.zt) < Math.abs(best.z - b.zt))) best = c;
    b.zc = best.z;
    if (b.state === 'conveyor' || b.state === 'hand') best.fill = 0.25 + rand() * 0.55;
  }

  const bodyM = [], bodyC = [], openM = [], fillM = [], doorM = [], doorC = [], truckM = [];
  for (const c of conts) {
    const col = new THREE.Color(pick(CONFIG.depot.containerColors));
    bodyM.push(trs(c.xc, Y_YARD, c.z, Math.PI / 2));
    bodyC.push(col);
    const ry = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    openM.push(trs(c.xd + c.dir * 0.01, Y_YARD + 1.3, c.z, ry, 2.3, 2.4, 1));
    const fill = c.fill ?? (rand() < 0.45 ? 0.95 : rand() * 0.5);
    fillM.push(trs(c.xd + c.dir * 0.02, Y_YARD + 0.1 + (2.4 * fill) / 2, c.z, ry, 2.3, 2.4 * fill, 1));
    for (const s of [-1, 1]) {
      const flare = THREE.MathUtils.degToRad(3 + rand() * 10);
      const ux = c.dir * Math.cos(flare), uz = s * Math.sin(flare);
      doorM.push(trs(c.xd + ux * 0.6, Y_YARD + 1.3, c.z + s * 1.2 + uz * 0.6, Math.atan2(-uz, ux)));
      doorC.push(col);
    }
  }
  // cargo trucks: origin at the rear, running along z (face = +1 nose south, -1 nose north)
  const TRUCK_L = 9.7;
  for (const b of bays) {
    if (b.state === 'empty') continue;
    truckM.push(trs(b.xt, Y_YARD, b.zt - b.face * (TRUCK_L / 2), b.face > 0 ? -Math.PI / 2 : Math.PI / 2));
  }
  const cGeo = new THREE.BoxGeometry(2.44, 2.59, CL).translate(0, 1.295, 0);
  {
    const uv = cGeo.attributes.uv, pos = cGeo.attributes.position, nor = cGeo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), az = Math.abs(nor.getZ(i));
      if (ax > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i));
      else if (az > 0.5) uv.setXY(i, pos.getX(i), pos.getY(i));
      else uv.setXY(i, pos.getX(i), pos.getZ(i));
    }
  }
  yard.add(instanced(cGeo, M.container, bodyM, bodyC));
  const plane = new THREE.PlaneGeometry(1, 1);
  const darkMat = new THREE.MeshStandardMaterial({ color: '#17191c', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const fillMat = new THREE.MeshStandardMaterial({ map: bagWallTexture(R.bagColor), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  yard.add(instanced(plane, darkMat, openM, null, { cast: false }));
  yard.add(instanced(plane, fillMat, fillM, null, { cast: false }));
  yard.add(instanced(new THREE.BoxGeometry(1.2, 2.5, 0.06), M.container, doorM, doorC));

  const truckMats = {
    cab: new THREE.MeshStandardMaterial({ color: '#f1f1ec', roughness: 0.4, metalness: 0.3 }),
    body: new THREE.MeshStandardMaterial({ color: '#46663a', roughness: 0.7 }),
    tarp: new THREE.MeshStandardMaterial({ color: '#3b4046', roughness: 0.9 }),
    chassis: M.chassis,
    tyre: M.tyre,
    glass: M.windshield,
  };
  const cargoParts = mergedParts(cargoTruckParts());
  for (const [k, g] of Object.entries(cargoParts)) yard.add(instanced(g, truckMats[k], truckM, null));

  // ground markings: container row outline per group, truck parking lane in front of it
  {
    const lines = [];
    const y = Y_YARD + 0.075;
    const rect = (xa, xb, za, zb) => {
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      lines.push(bx(x1 - x0, 0.02, 0.14, (x0 + x1) / 2, y, za), bx(x1 - x0, 0.02, 0.14, (x0 + x1) / 2, y, zb));
      lines.push(bx(0.14, 0.02, zb - za, x0, y, (za + zb) / 2), bx(0.14, 0.02, zb - za, x1, y, (za + zb) / 2));
    };
    rows.forEach((row) => {
      const xd = row.xc + row.dir * (CL / 2);
      for (let g = 0; g < nG; g++) {
        const z0 = zStart + g * (gLen + m(R.groupGap));
        rect(row.xc - row.dir * (CL / 2 + 0.2), xd + row.dir * 0.2, z0 - 0.2, z0 + gLen + 0.2);
        for (let k = 0; k < R.trucksPerGroup; k++) {
          const za = z0 + k * slotLen + 0.4;
          rect(xd + row.dir * (workGap - 0.2), xd + row.dir * (workGap + 2.7), za, za + slotLen - 0.8);
        }
      }
    });
    statics.add(mesh(merge(lines), white, { cast: false }));
  }

  // conveyors: from the truck across to the container door
  const bagGeo = new THREE.BoxGeometry(0.58, 0.22, 0.9);
  const bagMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const bagYellow = new THREE.Color(R.bagColor);
  const bagCol = () => bagYellow.clone().offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.08);
  const belts = [];
  const frames = [], legs = [];
  for (const b of bays.filter((q) => q.state === 'conveyor')) {
    // from the truck bed (tail) down the side of the truck, turning into the container door
    // from the side of the truck bed across the work gap into the container door
    const a = new THREE.Vector3(b.xt - b.dir * 0.9, Y_YARD + 1.55, b.zt - b.face * 1.6);
    const e = new THREE.Vector3(b.xd - b.dir * 1.1, Y_YARD + 1.95, b.zc);
    belts.push({ a, b: e, yaw: Math.atan2(-(e.z - a.z), e.x - a.x), bay: b });
    const dir = new THREE.Vector3().subVectors(e, a);
    const L = dir.length();
    const g = new THREE.BoxGeometry(L + 0.6, 0.25, 0.95);
    // explicit pitch then yaw, so the belt surface stays level across its width
    const horiz = Math.hypot(dir.x, dir.z);
    g.rotateZ(Math.atan2(dir.y, horiz));
    g.rotateY(Math.atan2(-dir.z, dir.x));
    g.translate((a.x + e.x) / 2, (a.y + e.y) / 2, (a.z + e.z) / 2);
    frames.push(g);
    for (const t of [0.15, 0.7]) {
      const p = new THREE.Vector3().lerpVectors(a, e, t);
      legs.push(bx(0.08, p.y - Y_YARD, 0.08, p.x, (p.y + Y_YARD) / 2, p.z + 0.3), bx(0.08, p.y - Y_YARD, 0.08, p.x, (p.y + Y_YARD) / 2, p.z - 0.3));
    }
  }
  if (frames.length) {
    statics.add(mesh(merge(frames), new THREE.MeshStandardMaterial({ color: '#2e7d4f', roughness: 0.6, metalness: 0.2 })));
    statics.add(mesh(merge(legs), M.pole, { cast: false }));
  }
  const BPB = 4;
  const beltBags = new THREE.InstancedMesh(bagGeo, bagMat, Math.max(1, belts.length * BPB));
  beltBags.frustumCulled = false;
  beltBags.castShadow = true;
  beltBags.userData.dynamic = true;
  for (let i = 0; i < belts.length * BPB; i++) beltBags.setColorAt(i, bagCol());
  yard.add(beltBags);

  // --- moving trucks: arriving / leaving through the apron (loop with a stop, queueing) -----
  const p0 = [-339, 188.5], p1 = [-339, 27], p2 = [-382, 27], p3 = [-382, 188.5];
  const S = [(p3[0] + p0[0]) / 2, 188.5];
  const loop = new Path(fillet([S, p0, p1, p2, p3, S], 9));
  const at = (s, out) => loop.at(((s % loop.len) + loop.len) % loop.len, out);
  // apron stretch (southbound along x = -382) where trucks stop for a while
  let sA = 0, sB = 0;
  {
    const q = { x: 0, z: 0 };
    let bA = 1e9, bB = 1e9;
    for (let s = 0; s < loop.len; s += 0.5) {
      at(s, q);
      const dA = Math.hypot(q.x + 382, q.z - 60), dB = Math.hypot(q.x + 382, q.z - 172);
      if (dA < bA) (bA = dA), (sA = s);
      if (dB < bB) (bB = dB), (sB = s);
    }
  }
  const nCargo = R.movingCargoTrucks, nCont = R.movingContainerTrucks, nMov = nCargo + nCont;
  const dynSet = (parts, matFor, n, colorKey) => {
    const out = [];
    for (const [k, g] of Object.entries(parts)) {
      const im = new THREE.InstancedMesh(g, matFor(k), Math.max(1, n));
      im.frustumCulled = false;
      im.castShadow = true;
      im.userData.dynamic = true;
      im.userData.key = k;
      if (k === colorKey) for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color(pick(colorKey === 'cab' ? CONFIG.trucks.cabColors : CONFIG.depot.containerColors)));
      yard.add(im);
      out.push(im);
    }
    return out;
  };
  const cargoDyn = dynSet(cargoParts, (k) => truckMats[k], nCargo, null);
  const tractorDyn = dynSet(mergedParts(tractorParts()), (k) => partMaterial(M, k), nCont, 'cab');
  const trailerDyn = dynSet(mergedParts(trailerParts()), (k) => partMaterial(M, k), nCont, 'container');
  const movers = [];
  for (let i = 0; i < nMov; i++) {
    movers.push({ kind: i < nCargo ? 'cargo' : 'container', idx: i < nCargo ? i : i - nCargo, s: (i / nMov) * loop.len, wait: 0, stopAt: sA + rand() * (sB - sA), stopped: false, len: i < nCargo ? 10.3 : LTOT });
  }
  const fP = { x: 0, z: 0 }, kP = { x: 0, z: 0 }, rP = { x: 0, z: 0 };
  const place = (ims, i, px, pz, yaw) => {
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_p.set(px, Y_YARD, pz), _q, _s.set(1, 1, 1));
    for (const im of ims) im.setMatrixAt(i, _m);
  };
  function updateMovers(dt) {
    const speed = 6;
    for (const mv of movers) {
      if (mv.wait > 0) {
        mv.wait -= dt;
        continue;
      }
      // queue: keep a gap to the vehicle ahead
      let gap = Infinity;
      for (const o of movers) if (o !== mv) gap = Math.min(gap, (((o.s - o.len - mv.s) % loop.len) + loop.len) % loop.len);
      if (gap < 6) continue;
      const before = ((mv.s % loop.len) + loop.len) % loop.len;
      mv.s += speed * Math.min(1, (gap - 6) / 10) * dt;
      const after = ((mv.s % loop.len) + loop.len) % loop.len;
      if (!mv.stopped && before <= mv.stopAt && after > mv.stopAt) {
        mv.wait = 6 + rand() * 8; // loading / checking stop in the apron
        mv.stopped = true;
      }
      if (after < before) {
        mv.stopped = false; // new lap
        mv.stopAt = sA + rand() * (sB - sA);
      }
    }
    for (const mv of movers) {
      if (mv.kind === 'cargo') {
        at(mv.s, fP);
        at(mv.s - 9.8, rP);
        place(cargoDyn, mv.idx, rP.x, rP.z, Math.atan2(-(fP.z - rP.z), fP.x - rP.x));
      } else {
        at(mv.s, fP);
        at(mv.s - LC, kP);
        at(mv.s - LTOT, rP);
        place(tractorDyn, mv.idx, kP.x, kP.z, Math.atan2(-(fP.z - kP.z), fP.x - kP.x));
        place(trailerDyn, mv.idx, rP.x, rP.z, Math.atan2(-(kP.z - rP.z), kP.x - rP.x));
      }
    }
    for (const im of [...cargoDyn, ...tractorDyn, ...trailerDyn]) im.instanceMatrix.needsUpdate = true;
  }

  // --- workers ---------------------------------------------------------------------------
  const wp = workerParts();
  const shirt = ['#f07a1a', '#1f4fa8', '#c62828', '#2b2f36', '#f2f2ee', '#3b6fb0'].map((c) => new THREE.Color(c));
  const hats = ['#ffffff', '#f7d117', '#f07a1a'].map((c) => new THREE.Color(c));
  const workers = [];
  for (const b of bays) {
    const side = { x: b.xt - b.dir * 1.55, z: b.zt };
    const door = { x: b.xd + b.dir * 0.35, z: b.zc };
    if (b.state === 'conveyor') {
      workers.push({ walk: false, x: side.x, z: b.zt - b.face * 2.8, ry: b.dir > 0 ? Math.PI : 0 }); // feeding the belt from the truck
      workers.push({ walk: false, x: b.xd - b.dir * 0.5, z: b.zc + 0.6, ry: b.dir > 0 ? Math.PI : 0 }); // stacking inside the door
    } else if (b.state === 'hand') {
      const n = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        workers.push({ walk: true, carry: true, ax: side.x, az: side.z + (rand() - 0.5) * 5, bx: door.x, bz: door.z + (rand() - 0.5) * 1.4, t: rand() * 8, speed: 0.9 + rand() * 0.3 });
      }
    } else if (b.state === 'parked' && rand() < 0.6) {
      workers.push({ walk: false, x: b.xt + b.dir * 1.9, z: b.zt + b.face * 3.5, ry: rand() * 6.28 }); // driver by the cab
    }
  }
  for (let i = 0; i < R.supervisors; i++) {
    const x = (X0 + X1) / 2 + (i % 2 ? 6 : -6);
    workers.push({ walk: true, carry: false, ax: x, az: Z0 + 8 + rand() * 20, bx: x + (rand() - 0.5) * 4, bz: Z1 - 8 - rand() * 20, t: rand() * 60, speed: 0.8 + rand() * 0.3 });
  }
  const nW = workers.length;
  const wm = {
    legs: new THREE.InstancedMesh(wp.legs, new THREE.MeshStandardMaterial({ color: '#2a3446', roughness: 0.8 }), nW),
    torso: new THREE.InstancedMesh(wp.torso, new THREE.MeshStandardMaterial({ roughness: 0.8 }), nW),
    head: new THREE.InstancedMesh(wp.head, new THREE.MeshStandardMaterial({ color: '#b98260', roughness: 0.7 }), nW),
    hat: new THREE.InstancedMesh(wp.hat, new THREE.MeshStandardMaterial({ roughness: 0.4 }), nW),
  };
  const carried = new THREE.InstancedMesh(bagGeo, bagMat, nW);
  for (const im of [...Object.values(wm), carried]) {
    im.frustumCulled = false;
    im.castShadow = true;
    im.userData.dynamic = true;
    yard.add(im);
  }
  for (let i = 0; i < nW; i++) {
    wm.torso.setColorAt(i, pick(shirt));
    wm.hat.setColorAt(i, pick(hats));
    carried.setColorAt(i, bagCol());
    workers[i].phase = rand() * 6;
  }
  for (const im of [...Object.values(wm), carried, beltBags]) if (im.instanceColor) im.instanceColor.needsUpdate = true;

  function update(dt) {
    const time = performance.now() / 1000;
    belts.forEach((b, bi) => {
      _q.setFromAxisAngle(_up, b.yaw);
      for (let k = 0; k < BPB; k++) {
        const u = (time * 0.3 + k / BPB + bi * 0.17) % 1;
        _p.lerpVectors(b.a, b.b, u);
        _p.y += 0.2;
        beltBags.setMatrixAt(bi * BPB + k, _m.compose(_p, _q, _s.set(1, 1, 1)));
      }
    });
    beltBags.instanceMatrix.needsUpdate = true;
    updateMovers(dt);
    workers.forEach((w, i) => {
      let x, z, ry, bob = 0, carry = false;
      if (w.walk) {
        const L = Math.hypot(w.bx - w.ax, w.bz - w.az) || 1;
        const walkT = L / w.speed;
        const cycle = 2 * walkT + 3;
        w.t = (w.t + dt) % cycle;
        let u, toward;
        if (w.t < walkT) (u = w.t / walkT), (toward = true);
        else if (w.t < walkT + 1.5) (u = 1), (toward = true);
        else if (w.t < 2 * walkT + 1.5) (u = 1 - (w.t - walkT - 1.5) / walkT), (toward = false);
        else (u = 0), (toward = false);
        x = w.ax + (w.bx - w.ax) * u;
        z = w.az + (w.bz - w.az) * u;
        const dx = (w.bx - w.ax) * (toward ? 1 : -1), dz = (w.bz - w.az) * (toward ? 1 : -1);
        ry = Math.atan2(-dz, dx);
        bob = u > 0 && u < 1 ? Math.abs(Math.sin(w.t * 7)) * 0.05 : 0;
        carry = w.carry && toward && u < 1; // bag on the shoulder from the truck to the container
      } else {
        x = w.x;
        z = w.z;
        ry = w.ry + Math.sin(time * 0.8 + w.phase) * 0.35;
      }
      _q.setFromAxisAngle(_up, ry);
      _m.compose(_p.set(x, Y_YARD + bob, z), _q, _s.set(1, 1, 1));
      for (const im of Object.values(wm)) im.setMatrixAt(i, _m);
      carried.setMatrixAt(i, carry ? _m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.62, 0.18)) : HIDDEN);
    });
    for (const im of [...Object.values(wm), carried]) im.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // hover target and label for the whole area
  {
    const g = new THREE.Group();
    g.name = 'stuffing-area';
    const hit = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 3, Z1 - Z0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set((X0 + X1) / 2, Y_YARD + 1.5, (Z0 + Z1) / 2);
    g.add(hit);
    statics.add(g);
    addHover(g, 'Container stuffing area', `${conts.length} containers, ${bays.length} truck bays, conveyor and hand loading`);
    anchors.push({ text: 'Container stuffing area', cls: 'zone', pos: [(X0 + X1) / 2, Y_YARD + 10, (Z0 + Z1) / 2] });
  }

  return { statics, yard, anchors, update, belts, stats: { containers: conts.length, bays: bays.length, workers: nW, belts: belts.length, movers: nMov } };
}

// =============================================================================
// Forklifts unloading containers at the west dock doors
// =============================================================================

/** Counterbalance forklift, local +x = forks, origin on the ground under the body centre. */
function forkliftBody() {
  return {
    body: merge([bx(2.0, 0.9, 1.15, -0.25, 0.75, 0), bx(0.7, 1.1, 1.15, -1.1, 0.95, 0)]), // chassis + counterweight
    guard: merge([
      ...[-0.5, 0.5].flatMap((s) => [bx(0.08, 1.35, 0.08, 0.45, 1.85, s), bx(0.08, 1.35, 0.08, -0.85, 1.85, s)]),
      bx(1.45, 0.08, 1.1, -0.2, 2.55, 0),
    ]),
    seat: merge([bx(0.5, 0.35, 0.5, -0.4, 1.35, 0)]),
    tyre: merge([-1, 1].flatMap((s) => [wheel(0.33, 0.25, 0.45, 0.33, s * 0.5), wheel(0.28, 0.22, -0.95, 0.28, s * 0.5)])),
    mast: merge([bx(0.1, 2.3, 0.1, 0.95, 1.2, 0.35), bx(0.1, 2.3, 0.1, 0.95, 1.2, -0.35), bx(0.1, 0.1, 0.8, 0.95, 2.3, 0)]),
  };
}
function forkliftCarriage() {
  // origin at the fork heel on the ground; raised by the lift height
  return {
    carriage: merge([bx(0.1, 0.9, 0.9, 1.05, 0.5, 0)]),
    forks: merge([bx(1.1, 0.06, 0.12, 1.6, 0.05, 0.28), bx(1.1, 0.06, 0.12, 1.6, 0.05, -0.28)]),
  };
}
function palletLoad() {
  return {
    pallet: merge([bx(1.2, 0.14, 1.0, 0, 0.07, 0)]),
    goods: merge([bx(1.1, 0.95, 0.95, 0, 0.62, 0)]),
  };
}

export function buildDockForklifts(M, doors) {
  const group = new THREE.Group();
  group.name = 'dock-forklifts';
  const W = O.dockForklifts;
  const pd = m(CONFIG.docks.platformDepth);
  const sel = doors.filter((d) => d.side === 'west' && W.doorsU.some((u) => Math.abs(m(u) - d.u) < 0.5));
  const n = sel.length;
  const yellow = new THREE.MeshStandardMaterial({ color: '#f2b418', roughness: 0.5, metalness: 0.2 });
  const matFor = { body: yellow, guard: M.chassis, seat: M.chassis, tyre: M.tyre, mast: M.chassis, carriage: M.chassis, forks: M.pole, pallet: M.trunk, goods: new THREE.MeshStandardMaterial({ color: '#d9c7a3', roughness: 0.85 }) };
  const mk = (parts, count) =>
    Object.entries(parts).map(([k, g]) => {
      const im = new THREE.InstancedMesh(g, matFor[k], Math.max(1, count));
      im.frustumCulled = false;
      im.castShadow = true;
      im.userData.dynamic = true;
      group.add(im);
      return im;
    });
  const bodyIM = mk(forkliftBody(), n);
  const carrIM = mk(forkliftCarriage(), n);
  const loadIM = mk(palletLoad(), n); // pallet on the forks
  const doneIM = mk(palletLoad(), n * 3); // pallets set down on the dock platform

  // static containers in front of the selected doors, doors open towards the dock
  const cm = [], cc = [], om = [];
  const units = sel.map((d) => {
    const edge = d.x + d.dir * pd; // platform edge (x), dir = -1 on the west side
    const doorX = edge + d.dir * m(W.gap); // container door line
    const cx = doorX + d.dir * 3.03;
    cm.push(trs(cx, Y_YARD, d.z, Math.PI / 2));
    cc.push(new THREE.Color(pick0(CONFIG.depot.containerColors, d.u)));
    om.push(trs(doorX + d.dir * 0.01, Y_YARD + 1.3, d.z, d.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 2.3, 2.4, 1));
    d.users = 1; // keep this dock shutter open
    return { d, edge, doorX, t: (d.u * 7.3) % 20, placed: 0 };
  });
  const cGeo = new THREE.BoxGeometry(2.44, 2.59, 6.06).translate(0, 1.295, 0);
  group.add(instanced(cGeo, M.container, cm, cc));
  group.add(instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#17191c', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), om, null, { cast: false }));

  const _mm = new THREE.Matrix4(), _c = new THREE.Matrix4();
  const smooth = (x) => x * x * (3 - 2 * x);
  const seg = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));
  const CYCLE = 20;
  // pose along the cycle: s = forward travel away from the container, yaw flip, lift height
  function pose(u, t) {
    // 0-2 drive into container, 2-3 lift, 3-5 back out, 5-7 turn, 7-9 drive to dock + lift, 9-10 lower,
    // 10-12 reverse, 12-14 turn back, 14-20 wait / next pallet
    const inC = 1 - seg(t, 0, 2) + seg(t, 3, 5); // 0 = inside the container, 1 = clear
    const toDock = seg(t, 7, 9) - seg(t, 10, 12);
    const turn = seg(t, 5, 7) - seg(t, 12, 14);
    // dock platform top is 1.3 m above the yard: carry at 1.65, set down at 1.35, drop to 0.1 once clear
    const lift = 0.1 + 0.25 * seg(t, 2, 3) + 1.3 * seg(t, 7, 8.5) - 0.3 * seg(t, 9, 10) - 1.25 * seg(t, 12, 13);
    const carrying = t > 2.5 && t < 9.6;
    const d = u.d.dir; // -1 west side: container at smaller x
    const clearX = (u.doorX + u.edge) / 2; // body centre when turning
    let x = clearX + d * (1.9 * (1 - inC)); // towards the container
    x += -d * 0.55 * toDock; // towards the dock edge
    const yawC = d > 0 ? 0 : Math.PI; // forks towards the container
    const yaw = yawC + Math.PI * turn;
    return { x, z: u.d.z, yaw, lift: Math.max(0.05, lift), carrying };
  }
  function update(dt) {
    units.forEach((u, i) => {
      const prev = u.t;
      u.t = (u.t + dt) % CYCLE;
      if (prev < 9.8 && u.t >= 9.8) u.placed = (u.placed + 1) % 4;
      const p = pose(u, u.t);
      _q.setFromAxisAngle(_up, p.yaw);
      _c.compose(_p.set(p.x, Y_YARD, p.z), _q, _s.set(1, 1, 1));
      for (const im of bodyIM) im.setMatrixAt(i, _c);
      _mm.copy(_c).multiply(new THREE.Matrix4().makeTranslation(0, p.lift, 0));
      for (const im of carrIM) im.setMatrixAt(i, _mm);
      const onForks = _mm.clone().multiply(new THREE.Matrix4().makeTranslation(1.65, 0.08, 0));
      for (const im of loadIM) im.setMatrixAt(i, p.carrying ? onForks : HIDDEN);
      // up to three pallets waiting on the dock platform in front of the door
      for (let k = 0; k < 3; k++) {
        const vis = k < u.placed;
        const m4 = vis ? trs(u.edge - u.d.dir * 0.4, 0.01, u.d.z + [0, -1.4, 1.4][k], 0) : HIDDEN;
        for (const im of doneIM) im.setMatrixAt(i * 3 + k, m4);
      }
    });
    for (const im of [...bodyIM, ...carrIM, ...loadIM, ...doneIM]) im.instanceMatrix.needsUpdate = true;
  }
  update(0);
  // debug hook: jump every forklift to time t of its cycle
  const setTime = (t) => {
    for (const u of units) u.t = t;
    update(0);
  };
  return { group, update, setTime, count: n };
}

function pick0(arr, seed) {
  return arr[Math.floor(Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1 * arr.length)];
}
