import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, BUILD_L, BUILD_W, Y_YARD, merge, mesh, instanced, trs, rng, worldUV, flatRect, clamp } from './util.js';
import { logoCanvas } from './materials.js';
import { LT, LC, LTOT, bx, wheel, trailerParts, tractorParts, mergedParts, partMaterial, fillet, Path, fixContainerUV, reachStackerParts } from './trucks.js';

/**
 * Container depot in the west yard (master plan REV02):
 *   container blocks, 3 access control gates, the office building,
 *   container trucks driving through the gates and reach stackers picking / placing containers.
 * Moving things use InstancedMesh with per-frame matrix updates (a handful of draw calls).
 */

const D = CONFIG.depot;
const C = CONFIG.context;
const HL = BUILD_L / 2;
const TIER = 2.6; // container height incl. a small gap

/** 20 ft or 40 ft box, origin at the bottom centre, long axis along z, UVs in metres. */
function containerGeo(len) {
  const g = new THREE.BoxGeometry(2.44, 2.59, len);
  g.translate(0, 1.295, 0);
  fixContainerUV(g);
  return g;
}

// ---------------------------------------------------------------------------
// Reach stacker split into body / boom / spreader for animation (local +x = boom direction)
// ---------------------------------------------------------------------------
const RS = { reach: 9.0, pivot: new THREE.Vector3(-3.2, 3.4, -0.3), low: 3.3 };

function stackerBody() {
  const p = { body: [], dark: [], tyre: [], glass: [] };
  p.body.push(bx(7.6, 1.4, 3.4, 0, 1.6, 0));
  p.body.push(bx(1.5, 2.2, 3.4, -3.9, 2.0, 0));
  p.dark.push(bx(1.9, 0.4, 1.8, -0.5, 2.5, 1.0));
  p.body.push(bx(1.9, 0.25, 1.8, -0.5, 4.85, 1.0));
  p.glass.push(bx(1.7, 2.2, 1.6, -0.5, 3.6, 1.0));
  for (const s of [-1, 1]) {
    p.tyre.push(wheel(0.95, 0.8, 2.3, 0.95, s * 1.35));
    p.tyre.push(wheel(0.95, 0.8, 2.3, 0.95, s * 0.55));
    p.tyre.push(wheel(0.78, 0.6, -2.6, 0.78, s * 1.35));
  }
  return p;
}

function spreaderParts() {
  const p = { body: [], dark: [] };
  p.dark.push(bx(0.6, 1.2, 0.6, 0, 0.7, -0.3));
  p.body.push(bx(1.1, 0.45, 6.1, 0, 0, 0));
  for (const s of [-1, 1]) p.dark.push(bx(0.3, 0.5, 0.3, 0, -0.4, s * 2.9));
  return p;
}

// ---------------------------------------------------------------------------
// Instanced "part sets": one InstancedMesh per material, all sharing the same matrices
// ---------------------------------------------------------------------------
class PartSet {
  constructor(group, parts, matFor, count, { colorKey = null, cast = true } = {}) {
    this.meshes = [];
    for (const [k, g] of Object.entries(parts)) {
      if (!g) continue;
      const im = new THREE.InstancedMesh(g, matFor(k), count);
      im.castShadow = cast;
      im.receiveShadow = k === 'container' || k === 'body';
      im.frustumCulled = false;
      im.userData.key = k;
      if (k === colorKey) for (let i = 0; i < count; i++) im.setColorAt(i, new THREE.Color('#ffffff'));
      group.add(im);
      this.meshes.push(im);
    }
  }
  set(i, matrix) {
    for (const im of this.meshes) im.setMatrixAt(i, matrix);
  }
  color(i, key, c) {
    for (const im of this.meshes) if (im.userData.key === key) im.setColorAt(i, c);
  }
  commit() {
    for (const im of this.meshes) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function buildDepot(M, ancillary) {
  const statics = new THREE.Group(); // gates, office, plazas (always visible)
  statics.name = 'depot';
  const yard = new THREE.Group(); // containers and moving vehicles (Trucks & containers layer)
  yard.name = 'depot-yard';
  const rand = rng(909);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const anchors = [];

  // ===========================================================================
  // 1. Container blocks
  // ===========================================================================
  const office = D.office;
  const excl = [office.compound].map((r) => [m(r.x0) - 3, m(r.x1) + 3, m(r.z0) - 3, m(r.z1) + 3]);
  const inExcl = (x, z) => excl.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  const m20 = [], c20 = [], m40 = [], c40 = [], slotGeos = [];
  const targets = []; // stack faces for the reach stackers
  const sw = m(D.slotWidth), cl = m(D.cellLength), aisle = m(D.aisle), margin = m(D.margin);
  const colW = D.slots * sw;
  const colorOf = () => new THREE.Color(pick(D.containerColors));
  const strips = []; // facility strips replacing the first block row { yd, kind, x0, x1, z0, z1 }
  const outlines = []; // painted lines around marked blocks

  for (const yd of D.yards) {
    const X0 = m(yd.x0), X1 = m(yd.x1), Z0 = m(yd.z0), Z1 = m(yd.z1);
    // a = along the blocks, b = across (blocks side by side)
    const alongX = yd.dir === 'x';
    const [a0, a1, b0, b1] = alongX ? [X0, X1, Z0, Z1] : [Z0, Z1, X0, X1];
    const extB = b1 - b0 - 2 * margin;
    const nCol = Math.max(1, Math.floor((extB + aisle) / (colW + aisle)));
    const usedB = nCol * colW + (nCol - 1) * aisle;
    const bStart = b0 + margin + (extB - usedB) / 2;
    const nCell = Math.floor((a1 - a0 - 2 * margin) / cl);
    const aStart = a0 + (a1 - a0 - nCell * cl) / 2;
    const toXZ = (a, b) => (alongX ? [a, b] : [b, a]);
    const ry = alongX ? Math.PI / 2 : 0; // container long axis along the block

    for (let c = 0; c < nCol; c++) {
      const cb0 = bStart + c * (colW + aisle);
      if (yd.strip && c === 0) {
        // first block row (next to road N1) becomes the facility strip
        strips.push({ yd, kind: yd.strip, x0: X0, x1: X1, z0: Z0, z1: cb0 + colW + aisle * 0.5 });
        continue;
      }
      if (yd.outline && c === (yd.strip ? 1 : 0)) {
        const [ax0, az0] = toXZ(aStart, cb0);
        const [ax1, az1] = toXZ(aStart + nCell * cl, cb0 + colW);
        outlines.push({ ...yd.outline, x0: ax0, x1: ax1, z0: az0, z1: az1 });
      }
      const blockH = D.maxTiers - Math.floor(rand() * 2); // blocks are stacked fairly evenly (4 to 5 high)
      // ground slot markings for the block
      {
        const [cx, cz] = toXZ(aStart + (nCell * cl) / 2, cb0 + colW / 2);
        const g = new THREE.PlaneGeometry(alongX ? nCell * cl : colW, alongX ? colW : nCell * cl);
        g.rotateX(-Math.PI / 2);
        g.translate(cx, Y_YARD + 0.06, cz);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (alongX ? nCell : D.slots), uv.getY(i) * (alongX ? D.slots : nCell));
        slotGeos.push(g);
      }
      // stack heights: one base height per cell pair, lower on the block edges
      for (let k = 0; k < nCell; ) {
        const is40 = rand() < D.share40ft && k + 1 < nCell;
        const span = is40 ? 2 : 1;
        const base = rand() < 0.8 ? blockH : 1 + Math.floor(rand() * blockH);
        const aMid = aStart + (k + span / 2) * cl;
        for (let s = 0; s < D.slots; s++) {
          const bMid = cb0 + (s + 0.5) * sw;
          const [x, z] = toXZ(aMid, bMid);
          if (inExcl(x, z)) continue;
          const edge = s === 0 || s === D.slots - 1;
          let h = clamp(base - (edge && rand() < 0.35 ? 1 : 0) - (rand() < 0.08 ? 1 : 0), 0, D.maxTiers);
          if (rand() < 0.02) h = 0;
          // candidate stack face for a reach stacker (20 ft, block edge facing an aisle)
          const face = s === 0 ? -1 : s === D.slots - 1 ? 1 : 0;
          if (face && !is40 && h >= 1 && h <= D.maxTiers - 1 && k > 2 && k < nCell - 3 && rand() < 0.08) {
            const n = alongX ? [0, face] : [face, 0]; // outward normal towards the aisle
            targets.push({ x, z, h, n, ry });
          }
          for (let t = 0; t < h; t++) {
            if (is40) {
              m40.push(trs(x, Y_YARD + t * TIER, z, ry));
              c40.push(colorOf());
            } else {
              m20.push(trs(x, Y_YARD + t * TIER, z, ry));
              c20.push(colorOf());
            }
          }
        }
        k += span;
      }
    }
    // zone label (yards with marked blocks are labelled per block instead)
    if (!yd.outline) anchors.push({ text: yd.name, cls: 'zone', pos: [(X0 + X1) / 2, Y_YARD + 16, (Z0 + Z1) / 2] });
  }
  const g20 = containerGeo(6.06), g40 = containerGeo(12.19);

  // --- painted outlines around the marked blocks (MNR done / awaiting MNR) ---------------
  const lineW = 0.9, off = 1.8;
  for (const o of outlines) {
    const x0 = Math.min(o.x0, o.x1) - off, x1 = Math.max(o.x0, o.x1) + off;
    const z0 = Math.min(o.z0, o.z1) - off, z1 = Math.max(o.z0, o.z1) + off;
    const y = Y_YARD + 0.075;
    const lines = merge([
      bx(x1 - x0 + lineW, 0.02, lineW, (x0 + x1) / 2, y, z0),
      bx(x1 - x0 + lineW, 0.02, lineW, (x0 + x1) / 2, y, z1),
      bx(lineW, 0.02, z1 - z0, x0, y, (z0 + z1) / 2),
      bx(lineW, 0.02, z1 - z0, x1, y, (z0 + z1) / 2),
    ]);
    const mat = new THREE.MeshStandardMaterial({ color: o.color, emissive: o.color, emissiveIntensity: 0.35, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    statics.add(mesh(lines, mat, { cast: false }));
    // corner posts with a coloured cap, visible from low angles too
    const posts = [], caps = [];
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      posts.push(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8).translate(px, Y_YARD + 1.3, pz));
      caps.push(bx(0.7, 0.5, 0.7, px, Y_YARD + 2.8, pz));
    }
    statics.add(mesh(merge(posts), M.pole, { cast: false }));
    statics.add(mesh(merge(caps), mat, { cast: false }));
    anchors.push({ text: o.label, cls: 'zone', pos: [(x0 + x1) / 2, Y_YARD + 15, (z0 + z1) / 2] });
  }

  // --- facility strips next to road N1 ---------------------------------------------------
  const orangeLine = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
  const blueLine = new THREE.MeshStandardMaterial({ color: '#2f6fe0', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
  const blueRoof = new THREE.MeshStandardMaterial({ color: '#1d5fb8', roughness: 0.5, metalness: 0.2 });
  const wetMat = new THREE.MeshStandardMaterial({ color: '#8d9aa3', roughness: 0.25, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  const bayTrailers = [], bayTractors = [], bayCols = [], stripStackers = [];
  const bayOutline = (x0, x1, z0, z1, list, w = 0.2) => {
    const y = Y_YARD + 0.075;
    list.push(bx(x1 - x0, 0.02, w, (x0 + x1) / 2, y, z0), bx(x1 - x0, 0.02, w, (x0 + x1) / 2, y, z1));
    list.push(bx(w, 0.02, z1 - z0, x0, y, (z0 + z1) / 2), bx(w, 0.02, z1 - z0, x1, y, (z0 + z1) / 2));
  };
  const facility = (name, size, build) => {
    const g = new THREE.Group();
    g.name = name;
    build(g);
    statics.add(g);
    ancillary.push({ config: { id: name }, group: g, box: new THREE.Box3().setFromObject(g), info: { name, size } });
    g.traverse((q) => q.isMesh && (q.userData.anc = ancillary.length - 1));
  };

  for (const st of strips) {
    if (st.kind === 'wash') {
      const W = D.wash;
      const bw = m(W.bayWidth), bd = m(W.bayDepth), gap = m(W.gap), barD = m(W.barDepth);
      const fx0 = st.x0 + m(W.offsetX);
      const zBar0 = st.z0 + 0.8, zBar1 = zBar0 + barD; // service building bar (north)
      const zBay0 = zBar1 + 0.6, zBay1 = zBay0 + bd; // bays (container on trailer, head to the south)
      const washX0 = fx0, washX1 = washX0 + W.washBays * bw;
      const survX0 = washX1 + gap, survX1 = survX0 + W.surveyBays * bw;
      // service bar: fire water tanks, pump / utility rooms, substation (as on the drawing)
      facility('Fire water tanks & utility rooms', 'fire water tanks, pump rooms, substation', (g) => {
        const tanks = [bx(washX1 - washX0, 3.2, barD, (washX0 + washX1) / 2, Y_YARD + 1.6, (zBar0 + zBar1) / 2), bx(24, 3.2, barD, survX0 + 7 + 12, Y_YARD + 1.6, (zBar0 + zBar1) / 2)];
        const bands = tanks.map((t) => {
          t.computeBoundingBox();
          const b = t.boundingBox;
          return bx(b.max.x - b.min.x + 0.1, 0.5, barD + 0.1, (b.min.x + b.max.x) / 2, Y_YARD + 3.0, (zBar0 + zBar1) / 2);
        });
        g.add(mesh(merge(tanks), M.tankSlab));
        g.add(mesh(merge(bands), blueRoof, { cast: false }));
        const rooms = [bx(3.2, 3.6, barD, washX1 + 1.8, Y_YARD + 1.8, (zBar0 + zBar1) / 2), bx(3.2, 3.6, barD, washX1 + 5.2, Y_YARD + 1.8, (zBar0 + zBar1) / 2), bx(8, 3.8, barD, survX0 + 32 + 4, Y_YARD + 1.9, (zBar0 + zBar1) / 2)];
        g.add(mesh(merge(rooms), M.ancWall));
        rooms.forEach((r) => r.computeBoundingBox());
        g.add(mesh(merge(rooms.map((r) => { const b = r.boundingBox; return bx(b.max.x - b.min.x + 0.4, 0.25, barD + 0.4, (b.min.x + b.max.x) / 2, b.max.y + 0.12, (zBar0 + zBar1) / 2); })), blueRoof));
        g.add(mesh(bx(Math.max(3, survX1 - (survX0 + 40.5)), 2.6, barD - 1.5, (survX0 + 40.5 + survX1) / 2 + 0.3, Y_YARD + 1.3, (zBar0 + zBar1) / 2), M.substation));
      });
      // washing station: canopy over the bays, wet floor with drain channels
      facility('Container washing', `${W.washBays} bays with canopy`, (g) => {
        g.add(mesh(flatRect(washX0, washX1, zBay0, zBay1, Y_YARD + 0.07), wetMat, { cast: false }));
        const cols = [], lines = [], drains = [];
        for (let i = 0; i <= W.washBays; i++) {
          const x = washX0 + i * bw;
          if (i % 2 === 0) for (const z of [zBay0 + 0.4, zBay1 - 0.4]) cols.push(bx(0.35, 6.2, 0.35, x, Y_YARD + 3.1, z));
          if (i < W.washBays) drains.push(bx(0.4, 0.02, bd - 1.5, x + bw / 2, Y_YARD + 0.085, (zBay0 + zBay1) / 2));
        }
        for (let i = 0; i < W.washBays; i++) bayOutline(washX0 + i * bw, washX0 + (i + 1) * bw, zBay0, zBay1, lines);
        g.add(mesh(merge(cols), blueRoof));
        g.add(mesh(bx(washX1 - washX0 + 1.2, 0.35, bd + 1.2, (washX0 + washX1) / 2, Y_YARD + 6.35, (zBay0 + zBay1) / 2), M.trim));
        g.add(mesh(bx(washX1 - washX0 + 1.3, 0.9, 0.25, (washX0 + washX1) / 2, Y_YARD + 6.2, zBay1 + 0.6), blueRoof, { cast: false }));
        g.add(mesh(merge(lines), orangeLine, { cast: false }));
        g.add(mesh(merge(drains), M.dark, { cast: false }));
        // spray gantry pipes along each bay divider
        const pipes = [];
        for (let i = 1; i < W.washBays; i++) pipes.push(bx(0.12, 0.12, bd - 2, washX0 + i * bw, Y_YARD + 4.4, (zBay0 + zBay1) / 2));
        g.add(mesh(merge(pipes), M.pole, { cast: false }));
      });
      // survey area: open marked bays
      facility('Container survey area', `${W.surveyBays} inspection bays`, (g) => {
        const lines = [];
        for (let i = 0; i < W.surveyBays; i++) bayOutline(survX0 + i * bw, survX0 + (i + 1) * bw, zBay0, zBay1, lines);
        g.add(mesh(merge(lines), orangeLine, { cast: false }));
        // inspection platforms (steps) on both ends
        const steps = [];
        for (const x of [survX0 - 1.2, survX1 + 1.2]) steps.push(bx(1.4, 2.6, 6, x, Y_YARD + 1.3, zBay0 + 6));
        g.add(mesh(merge(steps), M.yellowBlack));
      });
      // containers on trailers in the bays (some with the tractor still coupled)
      const fill = (x0, n) => {
        for (let i = 0; i < n; i++) {
          if (rand() > W.occupied) continue;
          const x = x0 + (i + 0.5) * bw;
          bayTrailers.push(trs(x, Y_YARD, zBay0 + 0.6, -Math.PI / 2));
          bayCols.push(colorOf());
          if (rand() < 0.5) bayTractors.push(trs(x, Y_YARD, zBay0 + 0.6 + LT, -Math.PI / 2));
        }
      };
      fill(washX0, W.washBays);
      fill(survX0, W.surveyBays);
      stripStackers.push(trs(washX1 + gap / 2, Y_YARD, zBay1 + 15, Math.PI / 2));
      anchors.push({ text: 'Container washing', cls: 'zone', pos: [(washX0 + washX1) / 2, Y_YARD + 12, (zBay0 + zBay1) / 2] });
      anchors.push({ text: 'Survey area', cls: 'zone', pos: [(survX0 + survX1) / 2, Y_YARD + 9, (zBay0 + zBay1) / 2] });
    } else if (st.kind === 'mnr') {
      const R = D.mnr;
      const pitchX = (st.x1 - st.x0 - 2) / R.cols, pitchZ = m(R.rowPitch);
      const z0 = st.z0 + 3.5;
      facility('MNR area', '100 containers / day, maintenance and repair', (g) => {
        const lines = [];
        for (let r = 0; r < R.rows; r++) {
          for (let c = 0; c < R.cols; c++) {
            const cx = st.x0 + 1 + (c + 0.5) * pitchX, cz = z0 + (r + 0.5) * pitchZ;
            bayOutline(cx - 3.4, cx + 3.4, cz - 1.55, cz + 1.55, lines, 0.15);
            if (rand() < R.occupied) {
              m20.push(trs(cx, Y_YARD, cz, Math.PI / 2));
              c20.push(colorOf());
            }
          }
        }
        g.add(mesh(merge(lines), blueLine, { cast: false }));
        // a few repair tool carts / welding sets between the rows
        const carts = [];
        for (let i = 0; i < 9; i++) {
          const cx = st.x0 + 1 + (Math.floor(rand() * R.cols) + 0.5) * pitchX + (rand() - 0.5) * 3;
          const cz = z0 + (Math.floor(rand() * R.rows) + 1) * pitchZ;
          carts.push(bx(1.1, 0.9, 0.7, cx, Y_YARD + 0.45, cz));
        }
        g.add(mesh(merge(carts), M.ancAccent, { cast: false }));
      });
      stripStackers.push(trs((st.x0 + st.x1) / 2 + 10, Y_YARD, z0 + R.rows * pitchZ + 12, Math.PI / 2));
      anchors.push({ text: 'MNR (100 containers/day)', cls: 'zone', pos: [(st.x0 + st.x1) / 2, Y_YARD + 9, z0 + (R.rows * pitchZ) / 2] });
    }
  }
  if (bayTrailers.length) {
    const tl0 = mergedParts(trailerParts());
    for (const [k, gg] of Object.entries(tl0)) yard.add(instanced(gg, partMaterial(M, k), bayTrailers, k === 'container' ? bayCols : null));
  }
  if (bayTractors.length) {
    const tr0 = mergedParts(tractorParts());
    const cabs = bayTractors.map(() => new THREE.Color(pick(CONFIG.trucks.cabColors)));
    for (const [k, gg] of Object.entries(tr0)) yard.add(instanced(gg, partMaterial(M, k), bayTractors, k === 'cab' ? cabs : null));
  }
  if (stripStackers.length) {
    const rs0 = mergedParts(reachStackerParts());
    for (const [k, gg] of Object.entries(rs0)) yard.add(instanced(gg, ({ body: M.reachBody, dark: M.chassis, tyre: M.tyre, glass: M.windshield })[k], stripStackers, null));
  }
  yard.add(instanced(g20, M.container, m20, c20));
  yard.add(instanced(g40, M.container, m40, c40));
  M.T.parking.repeat.set(1, 1);
  yard.add(mesh(merge(slotGeos), M.parking, { cast: false }));

  // ===========================================================================
  // 2. Access control gates (lanes, islands, booths, barriers, canopy)
  // ===========================================================================
  const gateLogo = new THREE.CanvasTexture(logoCanvas(CONFIG.project.logoLine1, CONFIG.project.logoLine2, { background: '#ffffff' }));
  gateLogo.colorSpace = THREE.SRGBColorSpace;
  const gateLogoMat = new THREE.MeshStandardMaterial({ map: gateLogo, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: '#1d5fb8', roughness: 0.45, metalness: 0.2 });
  const white = M.trim;
  const booms = []; // { mesh, pivotLocal, gate, laneOffset }
  const gates = [];
  for (const g of D.gates) {
    const gx = m(g.x), gz = m(g.z);
    const grp = new THREE.Group();
    grp.name = g.id;
    grp.position.set(gx, 0, gz);
    // local frame: +x along the traffic, z across the road
    if (g.axis === 'z') grp.rotation.y = Math.PI / 2;
    const lanes = g.lanes, lw = 4.5, W = lanes * lw + 3, Lp = 34;
    const plaza = new THREE.PlaneGeometry(Lp, W);
    plaza.rotateX(-Math.PI / 2);
    plaza.translate(0, Y_YARD + 0.045, 0);
    const pm = M.asphalt.clone();
    pm.polygonOffset = true;
    pm.polygonOffsetFactor = -2;
    pm.polygonOffsetUnits = -6;
    grp.add(mesh(plaza, pm, { cast: false }));
    const islands = [], ends = [], booths = [], glass = [], roofs = [], cols = [];
    for (let i = 1; i < lanes; i++) {
      const w = -((lanes * lw) / 2) + i * lw;
      islands.push(bx(14, 0.25, 1.2, 0, Y_YARD + 0.125, w));
      for (const e of [-7.3, 7.3]) ends.push(bx(0.6, 0.9, 1.2, e, Y_YARD + 0.45, w));
      booths.push(bx(2.0, 2.4, 1.0, 1.5, Y_YARD + 1.45, w));
      glass.push(bx(1.7, 0.9, 1.04, 1.5, Y_YARD + 2.0, w));
      roofs.push(bx(2.6, 0.2, 1.3, 1.5, Y_YARD + 2.75, w));
      for (const u of [-5.5, 5.5]) cols.push(bx(0.45, 7.6, 0.45, u, Y_YARD + 4.05, w));
      // barrier on the exit side of each island (lane to its right)
      const arm = new THREE.Mesh(bx(lw - 0.8, 0.12, 0.12, (lw - 0.8) / 2, 0, 0), M.yellowBlack);
      const pivot = new THREE.Group();
      pivot.position.set(-4.2, Y_YARD + 1.05, w + 0.6);
      pivot.rotation.y = -Math.PI / 2; // arm points across the lane (+z local)
      pivot.add(arm);
      grp.add(pivot);
      booms.push({ pivot, gate: gates.length, w: w + lw / 2 });
    }
    // canopy
    roofs.push(bx(16, 0.9, W + 1, 0, Y_YARD + 8.3, 0));
    grp.add(mesh(merge(islands), M.curb));
    grp.add(mesh(merge(ends), M.yellowBlack, { cast: false }));
    grp.add(mesh(merge(booths), M.ancWall));
    grp.add(mesh(merge(glass), M.window, { cast: false }));
    grp.add(mesh(merge(roofs), white));
    grp.add(mesh(merge(cols), M.pole));
    const fascia = [bx(16.2, 1.1, 0.3, 0, Y_YARD + 8.3, W / 2 + 0.6), bx(16.2, 1.1, 0.3, 0, Y_YARD + 8.3, -W / 2 - 0.6), bx(0.3, 1.1, W + 1.5, 8.1, Y_YARD + 8.3, 0), bx(0.3, 1.1, W + 1.5, -8.1, Y_YARD + 8.3, 0)];
    grp.add(mesh(merge(fascia), blue));
    for (const s of [-1, 1]) {
      const p = new THREE.PlaneGeometry(7.4, 2.0);
      p.rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.translate(s * 8.3, Y_YARD + 8.3, 0);
      grp.add(mesh(p, gateLogoMat, { cast: false }));
    }
    // lane markings
    const lm = [];
    for (let i = 1; i < lanes; i++) for (const e of [-15, 11]) lm.push(bx(6, 0.02, 0.15, e, Y_YARD + 0.07, -((lanes * lw) / 2) + i * lw));
    grp.add(mesh(merge(lm), M.marking, { cast: false }));
    statics.add(grp);
    grp.updateMatrixWorld(true);
    gates.push({ cfg: g, grp, x: gx, z: gz, axis: g.axis });
    ancillary.push({ config: { id: g.id }, group: grp, box: new THREE.Box3().setFromObject(grp), info: { name: g.name, size: `${lanes} lanes with booths and barriers` } });
    grp.traverse((o) => o.isMesh && (o.userData.anc = ancillary.length - 1));
    anchors.push({ text: 'Access control gate', cls: 'gate', pos: [gx, Y_YARD + 12, gz] });
  }

  // ===========================================================================
  // 3. Office building (3 floors, entrance tower with the brand portal)
  // ===========================================================================
  {
    const o = office;
    const x0 = m(o.x0), x1 = m(o.x1), z0 = m(o.z0), z1 = m(o.z1);
    const cp = o.compound;
    const g = new THREE.Group();
    g.name = 'office';
    const fh = 4.2, H = o.floors * fh + 0.6;
    const zMain0 = z1 - 18; // main block 18 m deep, facing N3 (south, +z)
    const xc = (x0 + x1) / 2;
    // lawn and forecourt
    const lawn = new THREE.Mesh(flatRect(m(cp.x0), m(cp.x1), m(cp.z0), m(cp.z1), Y_YARD + 0.08), M.grass);
    lawn.receiveShadow = true;
    g.add(lawn);
    const fore = M.sidewalk.clone();
    fore.polygonOffset = true;
    fore.polygonOffsetFactor = -2;
    fore.polygonOffsetUnits = -6;
    g.add(mesh(flatRect(xc - 16, xc + 16, z1, m(cp.z1), Y_YARD + 0.1), fore, { cast: false }));
    g.add(mesh(flatRect(m(cp.x1) - 10, m(cp.x1), m(cp.z0), m(cp.z1), Y_YARD + 0.1), fore, { cast: false }));
    // main block and rear wing
    const walls = [bx(x1 - x0, H, z1 - zMain0, xc, Y_YARD + H / 2, (zMain0 + z1) / 2), bx(20, 2 * fh + 0.6, zMain0 - z0, x1 - 11, Y_YARD + fh + 0.3, (z0 + zMain0) / 2)];
    const glassBands = [], fins = [], blueTrim = [], orange = [];
    for (let f = 0; f < o.floors; f++) {
      const y = Y_YARD + f * fh + 1.0 + 1.3;
      for (const zz of [z1 + 0.05, zMain0 - 0.05]) glassBands.push(bx(x1 - x0 - 1.2, 2.6, 0.12, xc, y, zz));
      for (const xx of [x0 - 0.05, x1 + 0.05]) glassBands.push(bx(0.12, 2.6, z1 - zMain0 - 1.2, xx, y, (zMain0 + z1) / 2));
    }
    for (let xx = x0 + 3; xx < x1 - 1; xx += 3) fins.push(bx(0.3, H - 1, 0.35, xx, Y_YARD + H / 2, z1 + 0.15));
    blueTrim.push(bx(x1 - x0 + 0.6, 0.9, z1 - zMain0 + 0.6, xc, Y_YARD + H + 0.15, (zMain0 + z1) / 2));
    blueTrim.push(bx(x1 - x0 + 0.4, 0.5, 0.4, xc, Y_YARD + 0.25, z1 + 0.1));
    // entrance tower
    const tw = 12, tH = H + 3.2;
    orange.push(bx(1.2, tH, 4.2, xc - tw / 2, Y_YARD + tH / 2, z1 + 1.5));
    orange.push(bx(1.2, tH, 4.2, xc + tw / 2, Y_YARD + tH / 2, z1 + 1.5));
    orange.push(bx(tw + 1.2, 1.4, 4.2, xc, Y_YARD + tH - 0.7, z1 + 1.5));
    blueTrim.push(bx(tw - 1.2, 3.0, 0.6, xc, Y_YARD + tH - 3.0, z1 + 3.2));
    const towerGlass = bx(tw - 1.2, tH - 4.6, 0.2, xc, Y_YARD + (tH - 4.6) / 2, z1 + 2.2);
    walls.push(bx(tw, 0.35, 5.5, xc, Y_YARD + 4.6, z1 + 3.0)); // entrance canopy slab
    g.add(mesh(merge(walls), M.ancWall));
    g.add(mesh(merge([...glassBands, towerGlass]), M.window, { cast: false }));
    g.add(mesh(merge(fins), M.ancWall, { cast: false }));
    g.add(mesh(merge(blueTrim), blue));
    g.add(mesh(merge(orange), M.ancAccent));
    const lp = new THREE.PlaneGeometry(tw - 2.4, (tw - 2.4) * 0.27);
    lp.translate(xc, Y_YARD + tH - 3.0, z1 + 3.52);
    g.add(mesh(lp, gateLogoMat, { cast: false }));
    // flag poles
    const poles = [];
    for (const dx of [-4, 0, 4]) poles.push(new THREE.CylinderGeometry(0.08, 0.1, 12, 6).translate(xc + dx, Y_YARD + 6, m(cp.z1) - 5));
    g.add(mesh(merge(poles), M.pole, { cast: false }));
    // guard house at the compound corner
    g.add(mesh(bx(4, 3.2, 4, m(cp.x0) + 3, Y_YARD + 1.6, m(cp.z1) - 3), M.ancWall));
    g.add(mesh(bx(4.6, 0.3, 4.6, m(cp.x0) + 3, Y_YARD + 3.35, m(cp.z1) - 3), blue));
    statics.add(g);
    ancillary.push({ config: { id: 'office' }, group: g, box: new THREE.Box3().setFromObject(g), info: { name: 'Office building', size: `${o.floors} floors, about ${Math.round(x1 - x0)} x ${Math.round(z1 - z0)} m` } });
    g.traverse((q) => q.isMesh && (q.userData.anc = ancillary.length - 1));
    anchors.push({ text: 'Office building', cls: 'zone', pos: [xc, Y_YARD + 20, (z0 + z1) / 2] });
  }

  // ===========================================================================
  // 4. Reach stackers working in the yards (pick / place loop)
  // ===========================================================================
  const nRS = Math.min(D.reachStackers, targets.length);
  // spread the stackers over the yards: take every k-th candidate
  const chosen = [];
  for (let i = 0; i < nRS; i++) chosen.push(targets[Math.floor(((i + 0.5) * targets.length) / nRS)]);
  const rsBody = new PartSet(yard, mergedParts(stackerBody()), (k) => ({ body: M.reachBody, dark: M.chassis, tyre: M.tyre, glass: M.windshield })[k], nRS);
  const rsSpread = new PartSet(yard, mergedParts(spreaderParts()), (k) => ({ body: M.reachBody, dark: M.chassis })[k], nRS);
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0);
  const boomOuter = new PartSet(yard, { body: unit }, () => M.reachBody, nRS);
  const boomInner = new PartSet(yard, { body: unit.clone() }, () => M.reachBody, nRS);
  const carried = new PartSet(yard, { container: g20 }, () => M.container, nRS, { colorKey: 'container' });
  const placed = new PartSet(yard, { container: g20 }, () => M.container, nRS, { colorKey: 'container' });
  const stackers = chosen.map((t, i) => {
    const col = colorOf();
    carried.color(i, 'container', col);
    placed.color(i, 'container', col);
    // facing: the stacker stands in the aisle and looks back at the block (-normal)
    const fx = -t.n[0], fz = -t.n[1];
    return { t, fx, fz, ry: Math.atan2(-fz, fx), phase: rand() * 52, placedM: trs(t.x, Y_YARD + t.h * TIER, t.z, t.ry) };
  });

  const _m = new THREE.Matrix4(), _c = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const smooth = (x) => x * x * (3 - 2 * x);
  /** state of a stacker at time p within a 52 s cycle (26 s place + 26 s pick) */
  function rsState(st, p) {
    const half = p % 26;
    const placing = p < 26;
    const Ht = (st.t.h + 1) * TIER + 0.25; // spreader resting on the target tier
    const D0 = 6; // travel between the working and the waiting position
    let d = 0, H = RS.low, hold;
    const seg = (a, b) => smooth(clamp((half - a) / (b - a), 0, 1));
    d = D0 * (seg(0, 5) - seg(19, 24));
    H = RS.low + (Ht + 1.2 - RS.low) * seg(5, 9) - 1.2 * seg(9, 11) + 1.2 * seg(12, 14) - (Ht + 1.2 - RS.low) * seg(14.5, 19);
    const released = half >= 11.5;
    // placing: carrying until released; picking: carrying after grabbing
    hold = placing ? !released : released;
    const onStack = placing ? released : !released;
    return { d: D0 - d, H, hold, onStack };
  }

  function updateStackers(dt) {
    stackers.forEach((st, i) => {
      st.phase = (st.phase + dt) % 52;
      const s = rsState(st, st.phase);
      const back = RS.reach + s.d;
      const cx = st.t.x - st.fx * back, cz = st.t.z - st.fz * back;
      _q.setFromAxisAngle(_v.set(0, 1, 0), st.ry);
      _c.compose(_v.set(cx, Y_YARD, cz), _q, _s.set(1, 1, 1));
      rsBody.set(i, _c);
      // boom from the pivot to the spreader head
      const hx = RS.reach, hy = s.H + 1.4;
      const dx = hx - RS.pivot.x, dy = hy - RS.pivot.y;
      const L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const boom = (l0, l1, t) => {
        _m.makeRotationZ(ang);
        _m.premultiply(new THREE.Matrix4().makeTranslation(RS.pivot.x, RS.pivot.y, RS.pivot.z));
        const local = new THREE.Matrix4().makeTranslation(l0, 0, 0).multiply(new THREE.Matrix4().makeScale(l1 - l0, t, t));
        return _c.clone().multiply(_m).multiply(local);
      };
      boomOuter.set(i, boom(0, Math.min(8, L * 0.62), 1.0));
      boomInner.set(i, boom(L * 0.5, L, 0.8));
      const spread = _c.clone().multiply(new THREE.Matrix4().makeTranslation(RS.reach, s.H, 0));
      rsSpread.set(i, spread);
      carried.set(i, s.hold ? spread.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.22 - 2.62, 0)) : ZERO);
      placed.set(i, s.onStack ? st.placedM : ZERO);
    });
    for (const p of [rsBody, rsSpread, boomOuter, boomInner, carried, placed]) p.commit();
  }

  // ===========================================================================
  // 5. Container trucks driving through the gates and along the yard roads
  // ===========================================================================
  const PLOTX0 = -BUILD_W / 2 - m(CONFIG.site.setback.west);
  const yardX0 = PLOTX0 - m(C.yardWidth);
  const n1 = -(HL + m(CONFIG.site.setback.north)) - m(C.sidewalk) - m(C.roadWidth) / 2;
  const n3 = -n1;
  const d1 = yardX0 - 6 - 5.5; // D1 carriageway next to the yard
  const zEW = m(C.yardRoads.find((r) => r.dir === 'ew' && r.x0 === undefined).z);
  const xA = m(C.yardRoads.filter((r) => r.dir === 'ns')[1].x); // -343
  const xB = m(C.yardRoads.filter((r) => r.dir === 'ns')[0].x); // -195
  const routes = [
    [[d1, -330], [d1, zEW], [xB, zEW], [xB, n3], [-40, n3]],
    [[-40, n1], [xA, n1], [xA, zEW], [xB, zEW], [xB, n3], [-420, n3]],
    [[-420, n3], [xB, n3], [xB, zEW], [d1, zEW], [d1, -330]],
    [[d1, 330], [d1, zEW], [xA, zEW], [xA, n1], [-40, n1]],
  ].map((pts) => new Path(fillet(offsetRight(pts, 4.3), 11)));
  // where each route passes a gate: stop there briefly (front bumper at the booth line)
  const stops = routes.map((P) => {
    const out = [];
    for (const g of gates) {
      let best = Infinity, bs = 0;
      const q = { x: 0, z: 0 };
      for (let s = 0; s < P.len; s += 1) {
        P.at(s, q);
        const dd = Math.hypot(q.x - g.x, q.z - g.z);
        if (dd < best) {
          best = dd;
          bs = s;
        }
      }
      if (best < 9) out.push(bs + 3);
    }
    return out.sort((a, b) => a - b);
  });
  const nT = D.yardTrucks;
  const tr = mergedParts(tractorParts());
  const tl = mergedParts(trailerParts());
  const trucksT = new PartSet(yard, tr, (k) => partMaterial(M, k), nT, { colorKey: 'cab' });
  const trucksL = new PartSet(yard, tl, (k) => partMaterial(M, k), nT, { colorKey: 'container' });
  const trucks = [];
  for (let i = 0; i < nT; i++) {
    const r = i % routes.length;
    const P = routes[r];
    trucks.push({ r, s: LTOT + ((Math.floor(i / routes.length) + (r * 0.37) % 1) / Math.ceil(nT / routes.length)) * (P.len - LTOT), wait: 0, stopped: new Set(), laden: rand() < 0.75 });
    trucksT.color(i, 'cab', new THREE.Color(pick(CONFIG.trucks.cabColors)));
    trucksL.color(i, 'container', colorOf());
  }
  const pF = { x: 0, z: 0 }, pK = { x: 0, z: 0 }, pR = { x: 0, z: 0 };
  const containerMesh = trucksL.meshes.find((im) => im.userData.key === 'container');
  function updateTrucks(dt) {
    const v = D.yardTruckSpeed;
    trucks.forEach((t, i) => {
      const P = routes[t.r];
      if (t.wait > 0) t.wait -= dt;
      else {
        // slow down before a gate stop, then wait at the booth
        const next = stops[t.r].find((s) => s > t.s && !t.stopped.has(s));
        let k = 1;
        if (next !== undefined) k = clamp((next - t.s) / 25, 0.12, 1);
        t.s += v * k * dt;
        if (next !== undefined && t.s >= next) {
          t.s = next;
          t.wait = 2.5;
          t.stopped.add(next);
        }
        if (t.s > P.len) {
          t.s = LTOT;
          t.stopped.clear();
          t.laden = rand() < 0.75;
        }
      }
      P.at(t.s, pF);
      P.at(t.s - LC, pK);
      P.at(t.s - LTOT, pR);
      _q.setFromAxisAngle(_v.set(0, 1, 0), Math.atan2(-(pF.z - pK.z), pF.x - pK.x));
      trucksT.set(i, _c.compose(_v.set(pK.x, Y_YARD, pK.z), _q, _s.set(1, 1, 1)));
      _q.setFromAxisAngle(_v.set(0, 1, 0), Math.atan2(-(pK.z - pR.z), pK.x - pR.x));
      trucksL.set(i, _c.compose(_v.set(pR.x, Y_YARD, pR.z), _q, _s.set(1, 1, 1)));
      if (!t.laden) containerMesh.setMatrixAt(i, ZERO);
    });
    trucksT.commit();
    trucksL.commit();
    // barriers: open while a truck is close to the lane
    for (const b of booms) {
      const g = gates[b.gate];
      let open = false;
      for (const t of trucks) {
        routes[t.r].at(t.s, pF);
        const lx = g.axis === 'x' ? pF.x - g.x : pF.z - g.z;
        const lz = g.axis === 'x' ? pF.z - g.z : pF.x - g.x;
        if (Math.abs(lx) < 16 && Math.abs(lz - b.w) < 3) open = true;
      }
      const target = open ? -Math.PI / 2.2 : 0;
      b.pivot.rotation.x += (target - b.pivot.rotation.x) * Math.min(1, dt * 4);
    }
  }

  function update(dt) {
    updateStackers(dt);
    updateTrucks(dt);
  }
  update(0);

  return { statics, yard, anchors, update, stackers, stats: { containers: m20.length + m40.length, stackers: nRS, trucks: nT } };
}

/** Offset an axis-aligned polyline to the right of the travel direction (right-hand traffic). */
function offsetRight(pts, d) {
  const n = pts.length;
  const segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
    const L = Math.hypot(dx, dz);
    segN.push([-dz / L, dx / L]); // right-hand normal in x / z (y up)
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(n - 2, i)];
    if (i === 0 || i === n - 1 || (a[0] === b[0] && a[1] === b[1])) {
      const nn = i === 0 ? b : a;
      out.push([pts[i][0] + nn[0] * d, pts[i][1] + nn[1] * d]);
    } else {
      // corner: move along both normals (axis aligned segments)
      out.push([pts[i][0] + (a[0] + b[0]) * d, pts[i][1] + (a[1] + b[1]) * d]);
    }
  }
  return out;
}
