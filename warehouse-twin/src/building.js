import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  m, BUILD_L, BUILD_W, uToZ, vToX, Y_YARD, Y_EAVE, Y_RIDGE, gridPositions, worldUV, merge, mesh, instanced, trs,
  flatRect, flipFaces, clamp,
} from './util.js';
import { doorList } from './docks.js';
import { logoCanvas } from './materials.js';

const B = CONFIG.building;
const LV = CONFIG.levels;
const T = m(B.wallThickness);
const HL = BUILD_L / 2;
const HW = BUILD_W / 2;
const Y_RC = m(LV.rcTop);
const Y_BR = m(LV.brickTop);
const OV = 0.45; // roof overhang beyond the long walls
const SLOPE = (Y_RIDGE - Y_EAVE) / HW;
const ANG = Math.atan(SLOPE);
const slopeY = (x) => Y_RIDGE - SLOPE * Math.abs(x);

// BoxGeometry face order: +x, -x, +y, -y, +z, -z
const OUT_FACE = { east: 0, west: 1, south: 4, north: 5 };

function boxNI(sx, sy, sz, cx, cy, cz) {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  g.translate(cx, cy, cz);
  worldUV(g);
  return g;
}

/** Keep (or drop) a subset of the 6 faces of a non-indexed box. */
function faces(g, list, keep = true) {
  const sel = [];
  for (let f = 0; f < 6; f++) if (list.includes(f) === keep) sel.push(f);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    const k = a.itemSize;
    const arr = new Float32Array(sel.length * 6 * k);
    sel.forEach((f, i) => arr.set(a.array.subarray(f * 6 * k, (f + 1) * 6 * k), i * 6 * k));
    out.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  return out;
}

function wallPiece(side, a0, a1, y0, y1) {
  const len = a1 - a0, h = y1 - y0, c = (a0 + a1) / 2, yc = (y0 + y1) / 2;
  let g;
  if (side === 'west') g = boxNI(T, h, len, -HW + T / 2, yc, uToZ(c));
  else if (side === 'east') g = boxNI(T, h, len, HW - T / 2, yc, uToZ(c));
  else if (side === 'north') g = boxNI(len, h, T, vToX(c), yc, -HL + T / 2);
  else g = boxNI(len, h, T, vToX(c), yc, HL - T / 2);
  return { ext: faces(g, [OUT_FACE[side]]), rest: faces(g, [OUT_FACE[side]], false) };
}

function subtract(intervals, c0, c1) {
  const out = [];
  for (const [a, b] of intervals) {
    if (c1 <= a || c0 >= b) {
      out.push([a, b]);
      continue;
    }
    if (c0 > a) out.push([a, c0]);
    if (c1 < b) out.push([c1, b]);
  }
  return out;
}

/** Wall band between y0..y1 along a0..a1, with rectangular openings cut out. */
function bandPieces(side, a0, a1, y0, y1, openings) {
  const cuts = new Set([a0, a1]);
  for (const o of openings) {
    if (o.a1 > a0 && o.a0 < a1 && o.y1 > y0 && o.y0 < y1) {
      cuts.add(clamp(o.a0, a0, a1));
      cuts.add(clamp(o.a1, a0, a1));
    }
  }
  const xs = [...cuts].sort((p, q) => p - q);
  const pieces = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const s0 = xs[i], s1 = xs[i + 1];
    if (s1 - s0 < 1e-4) continue;
    const mid = (s0 + s1) / 2;
    let free = [[y0, y1]];
    for (const o of openings) if (mid > o.a0 && mid < o.a1) free = subtract(free, o.y0, o.y1);
    for (const [f0, f1] of free) if (f1 - f0 > 1e-3) pieces.push(wallPiece(side, s0, s1, f0, f1));
  }
  return pieces;
}

/** Quad from 4 points; winding fixed so the normal points up (or down). */
function quad(a, b, c, d, up = true) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
  let v = [a, b, c, a, c, d];
  if (n.y > 0 !== up) v = [a, c, b, a, d, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  worldUV(g);
  return g;
}

/** Slope quad over x in [xa, xb] (one side of the ridge) and z in [za, zb]. */
function slopeQuad(xa, xb, za, zb, dy, up = true) {
  const P = (x, z) => new THREE.Vector3(x, slopeY(x) + dy, z);
  return quad(P(xa, za), P(xb, za), P(xb, zb), P(xa, zb), up);
}

/** Vertical pentagon (end wall above the brick band) as a flat plane facing +z or -z. */
function gablePlane(z, facePlusZ, notch, yTopExtra = 0, yBottom = Y_BR) {
  const pts = [[0, yBottom]];
  if (notch) pts.push([notch.v0, yBottom], [notch.v0, notch.y1], [BUILD_W, notch.y1]);
  else pts.push([BUILD_W, yBottom]);
  pts.push([BUILD_W, Y_EAVE + yTopExtra], [HW, Y_RIDGE + yTopExtra], [0, Y_EAVE + yTopExtra]);
  const shape = new THREE.Shape(pts.map(([v, y]) => new THREE.Vector2(vToX(v), y)));
  const g = new THREE.ShapeGeometry(shape).toNonIndexed();
  if (!facePlusZ) flipFaces(g);
  g.translate(0, 0, z);
  worldUV(g);
  return g;
}

function orientedBox(len, thick, depth, a, b) {
  // box whose length runs from point a to point b (Vector3) in a vertical plane
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  const g = new THREE.BoxGeometry(L, thick, depth);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export function buildBuilding(M, TH) {
  const group = new THREE.Group();
  group.name = 'building';
  const xrayMats = new Set();
  const X = (mat, min = 0.08) => {
    mat.userData.xrayMin = min;
    xrayMats.add(mat);
    return mat;
  };

  const interiorUpper = X(M.interior.clone());
  const roofUnderX = X(M.roofUnder.clone());
  const firewallUpper = X(M.firewall.clone());
  const trimX = X(M.trim.clone());
  const steelX = X(M.steel.clone(), 0.45);

  const doors = doorList();
  const office1 = CONFIG.offices.find((o) => o.id === 'OF1');
  const of1 = { u0: m(office1.u0), u1: m(office1.u1), v0: m(office1.v0), v1: m(office1.v1), h: m(office1.height) };

  const openings = { east: [], west: [], north: [], south: [] };
  for (const d of doors) openings[d.side].push({ a0: d.u - d.width / 2, a1: d.u + d.width / 2, y0: 0, y1: d.height });
  openings.north.push({ a0: of1.v0, a1: of1.v1, y0: 0, y1: of1.h });
  openings.east.push({ a0: of1.u0 + T, a1: of1.u1, y0: 0, y1: of1.h });

  const warehouses = {};
  const grid = gridPositions(B.xBays);

  for (const wh of B.warehouses) {
    const th = TH[wh.id];
    X(th.cladding);
    X(th.gable);
    X(th.roof);
    const fascia = X(th.accent.clone());
    const u0 = m(wh.u0), u1 = m(wh.u1);
    const whGroup = new THREE.Group();
    whGroup.name = wh.id;
    const bins = { rcBaseE: [], rcBaseI: [], brickE: [], lowI: [], cladE: [], upI: [] };

    const addBand = (side, a0, a1, y0, y1, extKey, restKey) => {
      for (const p of bandPieces(side, a0, a1, y0, y1, openings[side])) {
        bins[extKey].push(p.ext);
        bins[restKey].push(p.rest);
      }
    };
    const sides = [
      ['west', u0, u1],
      ['east', u0, u1],
    ];
    if (wh.id === 'F1') sides.push(['north', 0, BUILD_W]);
    if (wh.id === 'F2') sides.push(['south', 0, BUILD_W]);
    for (const [side, a0, a1] of sides) {
      addBand(side, a0, a1, Y_YARD, 0, 'rcBaseE', 'rcBaseI');
      addBand(side, a0, a1, 0, Y_RC, 'rcBaseE', 'lowI');
      addBand(side, a0, a1, Y_RC, Y_BR, 'brickE', 'lowI');
      if (side === 'east' || side === 'west') addBand(side, a0, a1, Y_BR, Y_EAVE, 'cladE', 'upI');
    }

    const pick = [];
    const add = (geos, mat, opts) => {
      const g = merge(geos);
      if (!g) return null;
      const me = mesh(g, mat, opts);
      me.userData.pick = wh.id;
      whGroup.add(me);
      pick.push(me);
      return me;
    };
    add(bins.rcBaseE, th.rcBase);
    add(bins.rcBaseI, M.rc);
    add(bins.brickE, th.brick);
    add(bins.lowI, M.interior);
    add(bins.cladE, th.cladding);
    add(bins.upI, interiorUpper);

    // End wall (gable) above the brick band
    if (wh.id === 'F1') {
      const notch = { v0: of1.v0, y1: of1.h };
      add([gablePlane(-HL, false, notch)], th.gable);
      add([gablePlane(-HL + T, true, notch)], interiorUpper, { cast: false });
    } else {
      add([gablePlane(HL, true, null)], th.gable);
      add([gablePlane(HL - T, false, null)], interiorUpper, { cast: false });
    }

    // Floor slab
    const floor = mesh(flatRect(-HW + T, HW - T, uToZ(u0) + (wh.id === 'F1' ? T : 0), uToZ(u1) - (wh.id === 'F2' ? T : 0), 0.002), M.floor, { cast: false });
    floor.userData.pick = wh.id;
    whGroup.add(floor);
    pick.push(floor);

    // Roof: panels with gaps for the skylight strips
    const top = [], under = [], sky = [];
    const sw = m(B.skylight.width) / 2;
    const margin = m(B.skylight.endMargin);
    for (let i = 0; i < grid.length - 1; i++) {
      const b0 = grid[i], b1 = grid[i + 1];
      if (b1 <= u0 + 1e-6 || b0 >= u1 - 1e-6) continue;
      const c = (b0 + b1) / 2;
      for (const s of [-1, 1]) {
        const xr = (xa, xb) => [Math.min(s * xa, s * xb), Math.max(s * xa, s * xb)];
        const full = xr(0, HW + OV);
        const pieces = [
          [full, b0, c - sw],
          [full, c + sw, b1],
          [xr(0, margin), c - sw, c + sw],
          [xr(HW - margin, HW + OV), c - sw, c + sw],
        ];
        for (const [[xa, xb], ua, ub] of pieces) {
          top.push(slopeQuad(xa, xb, uToZ(ua), uToZ(ub), 0.25, true));
          under.push(slopeQuad(xa, xb, uToZ(ua), uToZ(ub), 0.05, false));
        }
        const [sa, sb] = xr(margin, HW - margin);
        sky.push(slopeQuad(sa, sb, uToZ(c - sw), uToZ(c + sw), 0.24, true));
      }
    }
    const roofTop = add(top, th.roof);
    add(under, roofUnderX, { cast: false });
    const skyMesh = mesh(merge(sky), M.skylight, { cast: false, receive: false });
    skyMesh.renderOrder = 2;
    whGroup.add(skyMesh);

    // Ridge cap, eave fascia / gutter, barge boards
    const zc = uToZ((u0 + u1) / 2), zl = u1 - u0;
    add([boxNI(1.0, 0.12, zl, 0, Y_RIDGE + 0.33, zc)], trimX);
    const fasc = [];
    for (const s of [-1, 1]) fasc.push(boxNI(0.3, 0.5, zl + 0.2, s * (HW + OV), slopeY(HW + OV) + 0.12, zc));
    const endZ = wh.id === 'F1' ? -HL - 0.15 : HL + 0.15;
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(0, Y_RIDGE + 0.2, endZ);
      const b = new THREE.Vector3(s * (HW + OV), slopeY(HW + OV) + 0.2, endZ);
      fasc.push(orientedBox(0, 0.55, 0.3, a, b));
    }
    add(fasc.map((g) => worldUV(g.index ? g.toNonIndexed() : g)), fascia);

    // Selection volume (hidden until the warehouse is clicked)
    const sel = selectionVolume(u0, u1, wh.theme.accent);
    whGroup.add(sel);

    group.add(whGroup);
    warehouses[wh.id] = {
      config: wh,
      group: whGroup,
      pick,
      roof: roofTop,
      selection: sel,
      center: new THREE.Vector3(0, 8, uToZ((u0 + u1) / 2)),
      doors: doors.filter((d) => d.warehouse === wh.id).length,
    };
  }

  // --- Brand mark painted across both roof slopes (as on master plan REV02) -----------
  if (B.roofLogo) {
    const R = B.roofLogo;
    const L = m(R.length), Wd = m(R.width), zc = uToZ(m(R.centreU));
    const zS = zc + L / 2; // logo left edge (south); logo reads with its top to the west
    const mat = X(new THREE.MeshStandardMaterial({ map: M.T.roofMark, transparent: true, roughness: 0.5, metalness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const geos = [slopeQuad(-Wd / 2, 0, zc - L / 2, zc + L / 2, 0.27, true), slopeQuad(0, Wd / 2, zc - L / 2, zc + L / 2, 0.27, true)];
    for (const g of geos) {
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < pos.count; k++) uv.setXY(k, (zS - pos.getZ(k)) / L, (Wd / 2 - pos.getX(k)) / Wd);
    }
    const decal = mesh(merge(geos), mat, { cast: false });
    decal.renderOrder = 3;
    group.add(decal);
  }

  // --- Fire wall ---------------------------------------------------------------
  const zf = uToZ(m(B.firewallAt));
  const fwLow = boxNI(BUILD_W - 2 * T, Y_BR, T, 0, Y_BR / 2, zf);
  group.add(mesh(fwLow, M.firewall));
  {
    const shape = new THREE.Shape(
      [[-HW + T, Y_BR], [HW - T, Y_BR], [HW - T, Y_EAVE + 0.9], [0, Y_RIDGE + 0.9], [-HW + T, Y_EAVE + 0.9]].map(([x, y]) => new THREE.Vector2(x, y)),
    );
    const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    g.translate(0, 0, zf - T / 2);
    group.add(mesh(worldUV(g), firewallUpper));
  }

  // --- Steel portal frames (rafters) and interior columns ------------------------
  const rafters = [], cols = [];
  const colTops = [];
  const fwU = m(B.firewallAt);
  for (let i = 1; i < grid.length - 1; i++) {
    const u = grid[i];
    if (Math.abs(u - fwU) < 0.01) continue;
    const z = uToZ(u);
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(0, Y_RIDGE - 0.4, z);
      const b = new THREE.Vector3(s * (HW - T), slopeY(HW) - 0.4, z);
      rafters.push(worldUV(orientedBox(0, 0.75, 0.22, a, b).toNonIndexed()));
    }
    for (const v of B.interiorColumnsV) {
      const x = vToX(m(v));
      const h = slopeY(x) - 0.4;
      cols.push(boxNI(m(B.columnSize), h, m(B.columnSize), x, h / 2, z));
      colTops.push(h);
    }
  }
  group.add(mesh(merge(rafters), steelX, { cast: false }));
  group.add(mesh(merge(cols), M.column, { cast: false }));

  // --- Interior high-bay lights --------------------------------------------------
  const lampMats = [];
  for (let i = 0; i < grid.length - 1; i++) {
    const u = (grid[i] + grid[i + 1]) / 2;
    for (let v = 6; v < BUILD_W - 4; v += 11) {
      const x = vToX(v);
      lampMats.push(trs(x, slopeY(x) - 1.3, uToZ(u)));
    }
  }
  const lamps = instanced(new THREE.BoxGeometry(0.7, 0.14, 0.7), M.lamp, lampMats, null, { cast: false, receive: false });
  group.add(lamps);

  // --- Offices -------------------------------------------------------------------
  const officeGlass = [];
  group.add(buildOffice1(of1, TH.F1, M, officeGlass));
  group.add(buildOffice2(CONFIG.offices.find((o) => o.id === 'OF2'), TH.F2, M, officeGlass));

  // --- Logo panels ---------------------------------------------------------------
  const logoTex = new THREE.CanvasTexture(logoCanvas(CONFIG.project.logoLine1, CONFIG.project.logoLine2));
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 8;
  const logoMat = X(new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.45, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const logoGeos = [];
  for (const l of B.logos) {
    const g = new THREE.PlaneGeometry(m(l.width), m(l.height));
    if (l.side === 'east') {
      g.rotateY(Math.PI / 2);
      g.translate(HW + 0.03, m(l.y), uToZ(m(l.u)));
    } else {
      g.rotateY(-Math.PI / 2);
      g.translate(-HW - 0.03, m(l.y), uToZ(m(l.u)));
    }
    logoGeos.push(g);
  }
  {
    const g = new THREE.PlaneGeometry(24, 6.46);
    g.rotateY(Math.PI);
    g.translate(vToX(36), 12.6, -HL - 0.03);
    logoGeos.push(g);
    const g2 = new THREE.PlaneGeometry(30, 8.1);
    g2.translate(0, 11.4, HL + 0.03);
    logoGeos.push(g2);
  }
  const logos = mesh(merge(logoGeos), logoMat, { cast: false });
  logos.renderOrder = 1;
  group.add(logos);

  return { group, xrayMats: [...xrayMats], warehouses, lamps, officeGlass, skylight: M.skylight };
}

// -----------------------------------------------------------------------------
// Offices
// -----------------------------------------------------------------------------

function buildOffice1(o, th, M, glassList) {
  const g = new THREE.Group();
  g.name = 'office-F1';
  glassList.push(th.glass);
  const zN = -HL; // north facade plane
  const xE = HW; // east facade plane
  const glass = [], acp = [], dark = [];
  // curtain walls (inset 0.35 behind the facade line)
  glass.push(boxNI(o.v1 - o.v0, o.h, 0.12, vToX((o.v0 + o.v1) / 2), o.h / 2, zN + 0.35));
  glass.push(boxNI(0.12, o.h, o.u1 - o.u0, xE - 0.35, o.h / 2, uToZ((o.u0 + o.u1) / 2)));
  // aluminium composite frame: head band, floor band, fins
  acp.push(boxNI(o.v1 - o.v0 + 0.6, 1.0, 0.9, vToX((o.v0 + o.v1) / 2), o.h - 0.5, zN - 0.1));
  acp.push(boxNI(0.9, 1.0, o.u1 - o.u0 + 0.6, xE + 0.1, o.h - 0.5, uToZ((o.u0 + o.u1) / 2)));
  acp.push(boxNI(o.v1 - o.v0, 0.45, 0.7, vToX((o.v0 + o.v1) / 2), 5.0, zN + 0.05));
  acp.push(boxNI(0.7, 0.45, o.u1 - o.u0, xE - 0.05, 5.0, uToZ((o.u0 + o.u1) / 2)));
  for (let v = o.v0; v <= o.v1 - 1; v += 4.64) acp.push(boxNI(0.35, o.h - 1, 0.8, vToX(v + 0.17), (o.h - 1) / 2, zN + 0.0));
  for (const u of [3.5, o.u1]) acp.push(boxNI(0.8, o.h - 1, 0.35, xE, (o.h - 1) / 2, uToZ(u)));
  // entrance doors and steps
  dark.push(boxNI(6, 3.0, 0.15, vToX(o.v0 + 8), 1.5, zN + 0.2));
  const steps = [];
  for (let k = 0; k < 4; k++) steps.push(boxNI(10, (k + 1) * 0.325, 0.4, vToX(o.v0 + 8), Y_YARD + ((k + 1) * 0.325) / 2, zN - 0.2 - (3 - k) * 0.4 - 1.6));
  steps.push(boxNI(10, 1.3, 1.6, vToX(o.v0 + 8), Y_YARD + 0.65, zN - 0.8));

  // Tall angled portal frame wrapping the NE corner
  const p = o.portal || CONFIG.offices[0].portal;
  const pv0 = m(p.v0), pv1 = m(p.v1), ph = m(p.height), pd = m(p.depth);
  const zP = zN - pd / 2 - 0.4; // portal plane (north)
  const xP = xE + pd / 2 + 0.4; // portal plane (east)
  const tk = 1.3; // member thickness
  const run = ph / Math.tan((60 * Math.PI) / 180);
  const legBot = pv0, legTop = pv0 + run;
  const portal = [];
  // north: slanted leg + head beam
  portal.push(orientedBox(0, tk, pd, new THREE.Vector3(vToX(legBot), 0, zP), new THREE.Vector3(vToX(legTop), ph - tk / 2, zP)));
  portal.push(orientedBox(0, tk, pd, new THREE.Vector3(vToX(legTop) - tk * 0.3, ph - tk / 2, zP), new THREE.Vector3(xP + pd / 2, ph - tk / 2, zP)));
  // corner post
  portal.push(new THREE.BoxGeometry(pd, ph, pd).translate(xP, ph / 2, zP));
  acp.push(...portal.map((q) => worldUV(q.toNonIndexed())));
  // east facade: head beam + slanted leg (depth along x)
  const uTop = 9.5, uBot = uTop + run;
  acp.push(orientedBoxZ(tk, pd, new THREE.Vector3(xP, ph - tk / 2, zP - pd / 2), new THREE.Vector3(xP, ph - tk / 2, uToZ(uTop) + tk * 0.3)));
  acp.push(orientedBoxZ(tk, pd, new THREE.Vector3(xP, ph - tk / 2, uToZ(uTop)), new THREE.Vector3(xP, 0, uToZ(uBot))));

  const gm = mesh(merge(glass), th.glass);
  gm.userData.pick = 'F1';
  g.add(gm);
  const am = mesh(merge(acp), th.acp);
  am.userData.pick = 'F1';
  g.add(am);
  g.add(mesh(merge(dark), M.dark, { cast: false }));
  g.add(mesh(merge(steps), M.rc));
  return g;
}

/** Box running from a to b in the y-z plane, thickness `tk` in-plane, depth `pd` along x. */
function orientedBoxZ(tk, pd, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  const g = new THREE.BoxGeometry(pd, tk, L);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return worldUV(g);
}

function buildOffice2(cfg, th, M, glassList) {
  const g = new THREE.Group();
  g.name = 'office-F2';
  glassList.push(th.glass);
  const u0 = m(cfg.u0), u1 = m(cfg.u1), v0 = m(cfg.v0), v1 = m(cfg.v1), h = m(cfg.height);
  const x0 = vToX(v0), x1 = vToX(v1), z0 = uToZ(u0), z1 = uToZ(u1);
  const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const base = [boxNI(w, -Y_YARD, d, xc, Y_YARD / 2, zc)];
  const glass = [boxNI(w - 0.6, h - 0.8, d - 0.6, xc + 0.3, (h - 0.8) / 2, zc)];
  const acp = [];
  // parapet ring
  acp.push(boxNI(w + 0.3, 1.0, 0.5, xc, h - 0.5, z0 + 0.1));
  acp.push(boxNI(w + 0.3, 1.0, 0.5, xc, h - 0.5, z1 - 0.1));
  acp.push(boxNI(0.5, 1.0, d + 0.3, x0 + 0.1, h - 0.5, zc));
  // floor band
  acp.push(boxNI(0.6, 0.45, d, x0 + 0.25, h / 2 - 0.2, zc));
  acp.push(boxNI(w, 0.45, 0.6, xc, h / 2 - 0.2, z0 + 0.25));
  // corner posts and a tall accent fin
  for (const z of [z0 + 0.35, z1 - 0.35]) acp.push(boxNI(0.7, h, 0.7, x0 + 0.35, h / 2, z));
  acp.push(boxNI(1.2, h + 1.8, 0.5, x0 + 0.3, (h + 1.8) / 2, zc - 1.5));
  const roof = [boxNI(w, 0.3, d, xc, h - 0.35, zc)];
  const gm = mesh(merge(glass), th.glass);
  gm.userData.pick = 'F2';
  g.add(gm);
  const am = mesh(merge(acp), th.acp);
  am.userData.pick = 'F2';
  g.add(am);
  g.add(mesh(merge(roof), M.ancRoof));
  g.add(mesh(merge(base), M.rc));
  return g;
}

// -----------------------------------------------------------------------------
// Selection volume
// -----------------------------------------------------------------------------

function selectionVolume(u0, u1, color) {
  const pad = 0.8;
  const shape = new THREE.Shape(
    [[-HW - pad, Y_YARD], [HW + pad, Y_YARD], [HW + pad, Y_EAVE + pad], [0, Y_RIDGE + pad * 1.2], [-HW - pad, Y_EAVE + pad]].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const g = new THREE.ExtrudeGeometry(shape, { depth: u1 - u0 + pad * 2, bevelEnabled: false });
  g.translate(0, 0, uToZ(u0) - pad);
  const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  fill.renderOrder = 5;
  const bright = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: bright, transparent: true, opacity: 0.95 }));
  edges.renderOrder = 6;
  // bold frame on the ground around the footprint (lines are 1 px wide in WebGL)
  const w = 2.2, x0 = -HW - pad - w / 2, x1 = HW + pad + w / 2, z0 = uToZ(u0) - pad - w / 2, z1 = uToZ(u1) + pad + w / 2;
  const fy = Y_YARD + 0.35;
  const frame = new THREE.Mesh(
    merge([
      new THREE.BoxGeometry(x1 - x0 + w, 0.2, w).translate(0, fy, z0),
      new THREE.BoxGeometry(x1 - x0 + w, 0.2, w).translate(0, fy, z1),
      new THREE.BoxGeometry(w, 0.2, z1 - z0).translate(x0, fy, (z0 + z1) / 2),
      new THREE.BoxGeometry(w, 0.2, z1 - z0).translate(x1, fy, (z0 + z1) / 2),
    ]),
    new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  frame.renderOrder = 7;
  const grp = new THREE.Group();
  grp.add(fill, edges, frame);
  grp.visible = false;
  grp.userData.fill = fill;
  grp.userData.edges = edges;
  return grp;
}
