import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, Y_YARD, merge, mesh, instanced, trs, rng, flatRect, clamp } from './util.js';
import { LT, bx, wheel, trailerParts, tractorParts, mergedParts, partMaterial } from './trucks.js';

/**
 * Yard operations in the west depot:
 *   - container truck waiting area (east of the EV charging row)
 *   - rice container stuffing: open 20 ft containers, conveyors, bag piles on tarps,
 *     covered cargo trucks unloading straight into containers and workers carrying bags
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

/** Stacked rice bags seen through a container door. */
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
  // 2. Rice container stuffing
  // ===========================================================================
  const R = O.riceStuffing;
  const X0 = m(R.x0), X1 = m(R.x1), Z0 = m(R.z0), Z1 = m(R.z1);
  const CL = 6.06, pitch = 2.9;
  const groupLen = R.perGroup * pitch;
  const total = R.groups * groupLen + (R.groups - 1) * m(R.groupGap);
  const zStart = Z0 + (Z1 - Z0 - total) / 2;
  const rows = [
    { xc: X0 + CL / 2 + 0.3, dir: 1 }, // west row, doors face east (+x)
    { xc: X1 - CL / 2 - 0.3, dir: -1 }, // east row, doors face west (-x)
  ];
  const doors = []; // { xd, z, dir }
  const bodyM = [], bodyC = [], openM = [], fillM = [], doorM = [], doorC = [];
  for (const row of rows) {
    for (let g = 0; g < R.groups; g++) {
      for (let i = 0; i < R.perGroup; i++) {
        const z = zStart + g * (groupLen + m(R.groupGap)) + (i + 0.5) * pitch;
        const col = new THREE.Color(pick(CONFIG.depot.containerColors));
        bodyM.push(trs(row.xc, Y_YARD, z, Math.PI / 2));
        bodyC.push(col);
        const xd = row.xc + row.dir * (CL / 2);
        const ry = row.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        openM.push(trs(xd + row.dir * 0.01, Y_YARD + 0.1 + 1.2, z, ry, 2.3, 2.4, 1));
        const fill = 0.25 + rand() * 0.75;
        fillM.push(trs(xd + row.dir * 0.02, Y_YARD + 0.1 + (2.4 * fill) / 2, z, ry, 2.3, 2.4 * fill, 1));
        // two doors swung open a little past 90 degrees (flared outwards from the hinges)
        for (const s of [-1, 1]) {
          const flare = THREE.MathUtils.degToRad(5 + rand() * 15);
          const ux = row.dir * Math.cos(flare), uz = s * Math.sin(flare);
          doorM.push(trs(xd + ux * 0.6, Y_YARD + 1.3, z + s * 1.2 + uz * 0.6, Math.atan2(-uz, ux)));
          doorC.push(col);
        }
        doors.push({ xd, z, dir: row.dir });
      }
    }
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

  // --- apron: tarps, bag piles, conveyors, cargo trucks -------------------------------
  const tarpM = [], tarpC = [], bagM = [], bagC = [];
  const bagYellow = new THREE.Color(R.bagColor);
  const bagCol = () => bagYellow.clone().offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.08);
  const piles = []; // pile centres for the walking workers
  const pile = (cx, cz, nx, nz) => {
    let h = 0;
    for (let a = nx, b = nz; a > 0 && b > 0; a--, b--, h++) {
      for (let i = 0; i < a; i++) {
        for (let j = 0; j < b; j++) {
          const x = cx + (i - (a - 1) / 2) * 0.62 + (rand() - 0.5) * 0.1;
          const z = cz + (j - (b - 1) / 2) * 0.95 + (rand() - 0.5) * 0.12;
          bagM.push(trs(x, Y_YARD + 0.13 + h * 0.24, z, Math.PI / 2 + (rand() - 0.5) * 0.3));
          bagC.push(bagCol());
        }
      }
    }
  };
  const used = new Set();
  const choose = (filter) => {
    for (let t = 0; t < 200; t++) {
      const i = Math.floor(rand() * doors.length);
      if (!used.has(i) && filter(doors[i], i)) {
        used.add(i);
        return i;
      }
    }
    return -1;
  };
  // cargo trucks backed up to container doors (bags carried straight across)
  const truckM = [], truckDoors = [];
  for (let t = 0; t < R.cargoTrucks; t++) {
    const i = choose((d, k) => k % R.perGroup > 1 && k % R.perGroup < R.perGroup - 2 && !used.has(k - 1) && !used.has(k + 1));
    if (i < 0) continue;
    used.add(i - 1);
    used.add(i + 1);
    const d = doors[i];
    truckM.push(trs(d.xd + d.dir * 1.4, Y_YARD, d.z + 1.6, d.dir > 0 ? 0 : Math.PI));
    truckDoors.push(d);
  }
  // conveyors from a bag pile up into a container
  const belts = [];
  for (let c = 0; c < R.conveyors; c++) {
    const i = choose(() => true);
    if (i < 0) continue;
    const d = doors[i];
    const a = new THREE.Vector3(d.xd + d.dir * 7.2, Y_YARD + 0.55, d.z);
    const b = new THREE.Vector3(d.xd - d.dir * 0.6, Y_YARD + 1.75, d.z);
    belts.push({ a, b, d });
    tarpM.push(trs(d.xd + d.dir * 9.8, Y_YARD + 0.07, d.z, 0, 6.5, 1, 5.4));
    tarpC.push(new THREE.Color(pick(R.tarpColors)));
    pile(d.xd + d.dir * 10, d.z, 8, 5);
    piles.push({ x: d.xd + d.dir * 8.2, z: d.z, door: d });
  }
  // more tarps and bag piles in front of open doors
  for (let t = 0; t < 7; t++) {
    const i = choose(() => true);
    if (i < 0) continue;
    const d = doors[i];
    tarpM.push(trs(d.xd + d.dir * 4.6, Y_YARD + 0.07, d.z, 0, 5.6, 1, 4.6));
    tarpC.push(new THREE.Color(pick(R.tarpColors)));
    pile(d.xd + d.dir * 5, d.z, 7, 4);
    piles.push({ x: d.xd + d.dir * 2.6, z: d.z, door: d });
  }
  const tarpGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const tarpMat = new THREE.MeshStandardMaterial({ roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  statics.add(instanced(tarpGeo, tarpMat, tarpM, tarpC, { cast: false }));
  const bagGeo = new THREE.BoxGeometry(0.58, 0.22, 0.9);
  const bagMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  yard.add(instanced(bagGeo, bagMat, bagM, bagC));

  // conveyor frames
  const frames = [], legs = [];
  for (const { a, b } of belts) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const L = dir.length();
    const g = new THREE.BoxGeometry(L, 0.22, 0.85);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    frames.push(g);
    for (const t of [0.2, 0.8]) {
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      for (const s of [-0.35, 0.35]) legs.push(bx(0.08, p.y - Y_YARD, 0.08, p.x, (p.y + Y_YARD) / 2, p.z + s));
    }
  }
  if (frames.length) {
    statics.add(mesh(merge(frames), new THREE.MeshStandardMaterial({ color: '#2e7d4f', roughness: 0.6, metalness: 0.2 })));
    statics.add(mesh(merge(legs), M.pole, { cast: false }));
  }
  // bags riding up the conveyors (animated)
  const BPB = 5;
  const beltBags = new THREE.InstancedMesh(bagGeo, bagMat, Math.max(1, belts.length * BPB));
  beltBags.frustumCulled = false;
  beltBags.castShadow = true;
  for (let i = 0; i < belts.length * BPB; i++) beltBags.setColorAt(i, bagCol());
  yard.add(beltBags);

  // covered cargo trucks
  if (truckM.length) {
    const cp = mergedParts(cargoTruckParts());
    const mats = {
      cab: new THREE.MeshStandardMaterial({ color: '#f1f1ec', roughness: 0.4, metalness: 0.3 }),
      body: new THREE.MeshStandardMaterial({ color: '#46663a', roughness: 0.7 }),
      tarp: new THREE.MeshStandardMaterial({ color: '#3b4046', roughness: 0.9 }),
      chassis: M.chassis,
      tyre: M.tyre,
      glass: M.windshield,
    };
    for (const [k, g] of Object.entries(cp)) yard.add(instanced(g, mats[k], truckM, null));
  }

  // --- workers ---------------------------------------------------------------------------
  const wp = workerParts();
  const shirt = ['#f07a1a', '#1f4fa8', '#c62828', '#2b2f36', '#f2f2ee', '#3b6fb0'].map((c) => new THREE.Color(c));
  const hats = ['#ffffff', '#f7d117', '#f07a1a'].map((c) => new THREE.Color(c));
  const nW = R.workers;
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
    yard.add(im);
  }
  const workers = [];
  for (let i = 0; i < nW; i++) {
    wm.torso.setColorAt(i, pick(shirt));
    wm.hat.setColorAt(i, pick(hats));
    carried.setColorAt(i, bagCol());
    let w;
    const kind = i % 3;
    if (kind === 0 && piles.length) {
      // carrier: pile or truck <-> container door
      const p = piles[i % piles.length];
      w = { walk: true, ax: p.x, az: p.z + (rand() - 0.5) * 2, bx: p.door.xd + p.door.dir * 0.4, bz: p.door.z + (rand() - 0.5) * 1.2, t: rand() * 2, speed: 1.1 + rand() * 0.3 };
    } else if (kind === 1 && truckDoors.length) {
      const d = truckDoors[i % truckDoors.length];
      w = { walk: true, ax: d.xd + d.dir * 1.2, az: d.z + 2.3, bx: d.xd - d.dir * 0.2, bz: d.z + (rand() - 0.5), t: rand() * 2, speed: 0.9 + rand() * 0.3 };
    } else {
      // standing: at a pile, a conveyor foot, or supervising on the apron
      const b = belts.length ? belts[i % belts.length] : null;
      const x = b && rand() < 0.6 ? b.a.x + (rand() - 0.5) * 1.6 : X0 + 8 + rand() * (X1 - X0 - 16);
      const z = b ? b.a.z + (rand() - 0.5) * 2.4 : Z0 + rand() * (Z1 - Z0);
      w = { walk: false, x, z, ry: rand() * Math.PI * 2, phase: rand() * 6 };
    }
    workers.push(w);
  }

  function update(dt) {
    // bags riding the conveyors
    const time = performance.now() / 1000;
    belts.forEach((b, bi) => {
      for (let k = 0; k < BPB; k++) {
        const u = (time * 0.18 + k / BPB + bi * 0.13) % 1;
        _p.lerpVectors(b.a, b.b, u);
        _p.y += 0.2;
        _q.setFromAxisAngle(_up, b.d.dir > 0 ? 0 : Math.PI);
        beltBags.setMatrixAt(bi * BPB + k, _m.compose(_p, _q, _s.set(1, 1, 1)));
      }
    });
    beltBags.instanceMatrix.needsUpdate = true;
    // workers
    workers.forEach((w, i) => {
      let x, z, ry, bob = 0, carry = false;
      if (w.walk) {
        const L = Math.hypot(w.bx - w.ax, w.bz - w.az) || 1;
        const cycle = (2 * L) / w.speed + 3; // two walks + 1.5 s pause at each end
        w.t = (w.t + dt) % cycle;
        const walkT = L / w.speed;
        let u, toward;
        if (w.t < walkT) {
          u = w.t / walkT;
          toward = true;
        } else if (w.t < walkT + 1.5) {
          u = 1;
          toward = true;
        } else if (w.t < 2 * walkT + 1.5) {
          u = 1 - (w.t - walkT - 1.5) / walkT;
          toward = false;
        } else {
          u = 0;
          toward = false;
        }
        x = w.ax + (w.bx - w.ax) * u;
        z = w.az + (w.bz - w.az) * u;
        const dx = (w.bx - w.ax) * (toward ? 1 : -1), dz = (w.bz - w.az) * (toward ? 1 : -1);
        ry = Math.atan2(-dz, dx);
        const moving = u > 0 && u < 1;
        bob = moving ? Math.abs(Math.sin(w.t * 7)) * 0.05 : 0;
        carry = toward && u < 1; // carries a bag towards the container
      } else {
        x = w.x;
        z = w.z;
        ry = w.ry + Math.sin(time * 0.5 + w.phase) * 0.4;
      }
      _q.setFromAxisAngle(_up, ry);
      _m.compose(_p.set(x, Y_YARD + bob, z), _q, _s.set(1, 1, 1));
      for (const im of Object.values(wm)) im.setMatrixAt(i, _m);
      if (carry) {
        const c = _m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.62, 0.18));
        carried.setMatrixAt(i, c);
      } else carried.setMatrixAt(i, HIDDEN);
    });
    for (const im of [...Object.values(wm), carried]) im.instanceMatrix.needsUpdate = true;
  }
  for (const im of [...Object.values(wm), carried, beltBags]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  update(0);

  // hover target and label for the whole stuffing area
  {
    const g = new THREE.Group();
    g.name = 'rice-stuffing';
    const hit = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 3, Z1 - Z0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set((X0 + X1) / 2, Y_YARD + 1.5, (Z0 + Z1) / 2);
    g.add(hit);
    statics.add(g);
    addHover(g, 'Rice container stuffing', `${doors.length} containers, bags loaded by conveyor and by hand`);
    anchors.push({ text: 'Rice container stuffing', cls: 'zone', pos: [(X0 + X1) / 2, Y_YARD + 10, (Z0 + Z1) / 2] });
  }

  return { statics, yard, anchors, update, stats: { bags: bagM.length, workers: nW, containers: doors.length } };
}
