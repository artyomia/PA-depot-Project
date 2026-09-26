import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, BUILD_L, BUILD_W, Y_YARD, flatRect, merge, mesh, instanced, trs, rng, worldUV, flipFaces } from './util.js';
import { doorList } from './docks.js';
import { logoCanvas } from './materials.js';

const S = CONFIG.site;
const C = CONFIG.context;
const HL = BUILD_L / 2;
const HW = BUILD_W / 2;

/** Plot boundary in world metres */
export const PLOT = {
  x0: -HW - m(S.setback.west),
  x1: HW + m(S.setback.east),
  z0: -HL - m(S.setback.north),
  z1: HL + m(S.setback.south),
};

const Y = {
  grass: Y_YARD - 0.22,
  pave: Y_YARD,
  road: Y_YARD + 0.03,
  mark: Y_YARD + 0.06,
};

function roadMat(base) {
  const mat = base.clone();
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -4;
  return mat;
}

/** Island shape in (x, -z) so that after rotateX(-90deg) it lands on (x, z). */
function islandShape(x0, x1, z0, z1, r) {
  const s = new THREE.Shape();
  const X0 = x0, X1 = x1, Y0 = -z1, Y1 = -z0;
  r = Math.max(0, Math.min(r, (X1 - X0) / 2 - 0.01, (Y1 - Y0) / 2 - 0.01));
  s.moveTo(X0 + r, Y0);
  s.lineTo(X1 - r, Y0);
  if (r) s.quadraticCurveTo(X1, Y0, X1, Y0 + r);
  s.lineTo(X1, Y1 - r);
  if (r) s.quadraticCurveTo(X1, Y1, X1 - r, Y1);
  s.lineTo(X0 + r, Y1);
  if (r) s.quadraticCurveTo(X0, Y1, X0, Y1 - r);
  s.lineTo(X0, Y0 + r);
  if (r) s.quadraticCurveTo(X0, Y0, X0 + r, Y0);
  return s;
}

export function buildSite(M) {
  const group = new THREE.Group();
  group.name = 'site';
  const landscape = new THREE.Group();
  landscape.name = 'landscape';
  const labels = new THREE.Group();
  labels.name = 'site-labels';
  const rand = rng(5);

  const roadM = roadMat(M.asphalt);
  const walkM = roadMat(M.sidewalk);
  const parkM = roadMat(M.park);

  // --- Ground --------------------------------------------------------------------
  const ground = mesh(flatRect(-9000, 9000, -9000, 9000, Y.grass), M.grass, { cast: false });
  group.add(ground);

  // --- Plot paving and internal roads -------------------------------------------
  group.add(mesh(flatRect(PLOT.x0, PLOT.x1, PLOT.z0, PLOT.z1, Y.pave), M.paving, { cast: false }));
  const plotRoads = [
    [PLOT.x0, PLOT.x0 + 15, PLOT.z0, PLOT.z1],
    [PLOT.x0, PLOT.x1, PLOT.z0 + 2, PLOT.z0 + 17],
    [PLOT.x0, PLOT.x1, PLOT.z1 - 17, PLOT.z1 - 2],
    [70, 84, -106, PLOT.z1 - 2],
    [64, 73, PLOT.z0 + 2, -104],
  ];
  const roadGeos = plotRoads.map(([a, b, c, d]) => flatRect(a, b, c, d, Y.road));

  // container depot gates: driveways across the sidewalks of N1 / N3 / D1
  for (const g of CONFIG.depot?.gates || []) {
    const gx = m(g.x), gz = m(g.z);
    if (g.axis === 'z') {
      const out = gz < 0 ? PLOT.z0 - m(C.sidewalk) : PLOT.z1 + m(C.sidewalk);
      roadGeos.push(flatRect(gx - 11, gx + 11, Math.min(gz, out), Math.max(gz, out), Y.road));
    } else {
      const xw = PLOT.x0 - m(C.yardWidth);
      roadGeos.push(flatRect(xw - 6.5, gx, gz - 11, gz + 11, Y.road));
    }
  }

  // gate driveways across the sidewalk
  for (const g of S.gates) {
    const gx = m(g.x), gw = m(g.width);
    const zEdge = g.side === 'north' ? PLOT.z0 : PLOT.z1;
    const zOut = g.side === 'north' ? PLOT.z0 - m(C.sidewalk) : PLOT.z1 + m(C.sidewalk);
    roadGeos.push(flatRect(gx - gw / 2, gx + gw / 2, Math.min(zEdge, zOut), Math.max(zEdge, zOut), Y.road));
  }

  // --- External roads N1, N3, D1 ---------------------------------------------------
  const sw = m(C.sidewalk), rw = m(C.roadWidth);
  const yardX0 = PLOT.x0 - m(C.yardWidth);
  const d1x1 = yardX0, d1x0 = yardX0 - m(C.d1Width);
  const xFar = 260;
  const walkGeos = [];
  const n1 = { z1: PLOT.z0 - sw, z0: PLOT.z0 - sw - rw };
  const n3 = { z0: PLOT.z1 + sw, z1: PLOT.z1 + sw + rw };
  roadGeos.push(flatRect(d1x0, xFar, n1.z0, n1.z1, Y.road));
  roadGeos.push(flatRect(d1x0, xFar, n3.z0, n3.z1, Y.road));
  walkGeos.push(flatRect(d1x1, xFar, PLOT.z0 - sw, PLOT.z0, Y.road - 0.005));
  walkGeos.push(flatRect(d1x1, xFar, n1.z0 - sw, n1.z0, Y.road - 0.005));
  walkGeos.push(flatRect(d1x1, xFar, PLOT.z1, PLOT.z1 + sw, Y.road - 0.005));
  walkGeos.push(flatRect(d1x1, xFar, n3.z1, n3.z1 + sw, Y.road - 0.005));
  // D1 boulevard: sidewalk | road | median | road | median | road | sidewalk
  const d1 = [
    ['walk', 5], ['road', 11], ['green', 6], ['road', 11], ['green', 12], ['road', 11], ['walk', 6],
  ];
  const d1Medians = [];
  const d1Lanes = [];
  {
    let x = d1x0;
    for (const [k, w] of d1) {
      if (k === 'road') {
        roadGeos.push(flatRect(x, x + w, -520, 520, Y.road + 0.004));
        d1Lanes.push(x + w / 2);
      } else if (k === 'walk') walkGeos.push(flatRect(x, x + w, -520, 520, Y.road - 0.003));
      else d1Medians.push([x, x + w]);
      x += w;
    }
  }
  group.add(mesh(merge(roadGeos), roadM, { cast: false }));
  group.add(mesh(merge(walkGeos), walkM, { cast: false }));

  // --- West truck yard (context) -----------------------------------------------------
  const park = C.greenNW;
  const pk = { x0: m(park.x0), x1: m(park.x1), z0: m(park.z0), z1: m(park.z1) };
  group.add(mesh(merge([flatRect(yardX0, pk.x1, pk.z1, PLOT.z1, Y.pave), flatRect(pk.x1, PLOT.x0, PLOT.z0, PLOT.z1, Y.pave)]), M.paving, { cast: false }));
  // park with walking paths
  {
    const g = new THREE.PlaneGeometry(pk.x1 - pk.x0, pk.z1 - pk.z0);
    g.rotateX(-Math.PI / 2);
    g.translate((pk.x0 + pk.x1) / 2, Y.pave + 0.01, (pk.z0 + pk.z1) / 2);
    group.add(mesh(g, parkM, { cast: false }));
  }
  const yardRoadGeos = [];
  const dashes = []; // [x0, z0, x1, z1] centrelines
  for (const r of C.yardRoads) {
    const w = m(r.width);
    if (r.dir === 'ew') {
      const xa = r.x0 !== undefined ? m(r.x0) : yardX0;
      yardRoadGeos.push(flatRect(xa, PLOT.x0, m(r.z) - w / 2, m(r.z) + w / 2, Y.road));
      dashes.push([xa, m(r.z), PLOT.x0, m(r.z)]);
    } else {
      yardRoadGeos.push(flatRect(m(r.x) - w / 2, m(r.x) + w / 2, PLOT.z0, PLOT.z1, Y.road));
      dashes.push([m(r.x), PLOT.z0, m(r.x), PLOT.z1]);
    }
  }
  group.add(mesh(merge(yardRoadGeos), roadM, { cast: false }));

  // The regions between the yard roads are container yards (see depot.js), not truck parking.
  const parkingBays = [];

  // --- Road markings ------------------------------------------------------------------
  // centre dashes of plot roads, N1, N3, D1 lanes
  dashes.push([PLOT.x0 + 7.5, PLOT.z0 + 17, PLOT.x0 + 7.5, PLOT.z1 - 17]);
  dashes.push([PLOT.x0 + 15, PLOT.z0 + 9.5, 64, PLOT.z0 + 9.5]);
  dashes.push([PLOT.x0 + 15, PLOT.z1 - 9.5, 70, PLOT.z1 - 9.5]);
  dashes.push([77, -100, 77, PLOT.z1 - 17]);
  dashes.push([68.5, PLOT.z0 + 17, 68.5, -112]);
  dashes.push([d1x1, (n1.z0 + n1.z1) / 2, xFar, (n1.z0 + n1.z1) / 2]);
  dashes.push([d1x1, (n3.z0 + n3.z1) / 2, xFar, (n3.z0 + n3.z1) / 2]);
  for (const lx of d1Lanes) {
    dashes.push([lx - 1.85, -520, lx - 1.85, 520]);
    dashes.push([lx + 1.85, -520, lx + 1.85, 520]);
  }
  const dashMats = [];
  for (const [x0, z0, x1, z1] of dashes) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const ry = Math.atan2(-dz, dx);
    for (let s = 2; s < len - 2; s += 9) dashMats.push(trs(x0 + dx * (s + 1.5), Y.mark, z0 + dz * (s + 1.5), ry, 3, 1, 1));
  }
  // stall lines on the east dock apron (between the two trucks of each door)
  for (const d of doorList()) {
    if (d.side !== 'east') continue;
    for (const o of [-4.1, 0, 4.1]) dashMats.push(trs(HW + 3 + 8.5, Y.mark, d.z + o, 0, 17, 1, 1));
  }
  group.add(instanced(new THREE.BoxGeometry(1, 0.02, 0.16), M.marking, dashMats, null, { cast: false }));

  // --- Green islands inside the plot (with curbs) -------------------------------------
  const curbGeos = [], lawnGeos = [];
  for (const g of CONFIG.landscape.greens) {
    const x0 = m(g.x0), x1 = m(g.x1), z0 = m(g.z0), z1 = m(g.z1), r = m(g.r);
    const ex = new THREE.ExtrudeGeometry(islandShape(x0, x1, z0, z1, r), { depth: 0.18, bevelEnabled: false, curveSegments: 6 });
    ex.rotateX(-Math.PI / 2);
    ex.translate(0, Y.pave, 0);
    curbGeos.push(worldUV(ex));
    const top = new THREE.ShapeGeometry(islandShape(x0 + 0.25, x1 - 0.25, z0 + 0.25, z1 - 0.25, Math.max(0, r - 0.25)), 6);
    top.rotateX(-Math.PI / 2);
    top.translate(0, Y.pave + 0.19, 0);
    lawnGeos.push(worldUV(top.toNonIndexed()));
  }
  group.add(mesh(merge(curbGeos), M.curb, { cast: false }));
  group.add(mesh(merge(lawnGeos), M.grass, { cast: false }));
  // D1 medians (green)
  group.add(mesh(merge(d1Medians.map(([a, b]) => flatRect(a, b, -520, 520, Y.road + 0.01))), roadMat(M.grass), { cast: false }));

  // --- Fence along the plot boundary, with gate openings ------------------------------
  const fh = m(S.fenceHeight);
  M.T.fence.offset.y = ((-Y_YARD / 2.2) % 1 + 1) % 1;
  const fenceGeos = [];
  const fenceRun = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) return;
    const g = new THREE.PlaneGeometry(len, fh);
    g.rotateY(Math.atan2(-(bz - az), bx - ax));
    g.translate((ax + bx) / 2, Y_YARD + fh / 2, (az + bz) / 2);
    fenceGeos.push(worldUV(g));
  };
  const openingsOn = (side) => S.gates.filter((g) => g.side === side).map((g) => [m(g.x) - m(g.width) / 2, m(g.x) + m(g.width) / 2]).sort((a, b) => a[0] - b[0]);
  for (const side of ['north', 'south']) {
    const z = side === 'north' ? PLOT.z0 : PLOT.z1;
    let x = PLOT.x0;
    for (const [a, b] of openingsOn(side)) {
      fenceRun(x, z, a, z);
      x = b;
    }
    fenceRun(x, z, PLOT.x1, z);
  }
  fenceRun(PLOT.x0, PLOT.z0, PLOT.x0, PLOT.z1);
  fenceRun(PLOT.x1, PLOT.z0, PLOT.x1, PLOT.z1);
  group.add(mesh(merge(fenceGeos), M.fence, { cast: true }));

  // Gate portals G1 / G2 with brand panel
  const gateLogo = new THREE.CanvasTexture(logoCanvas(CONFIG.project.logoLine1, CONFIG.project.logoLine2, { background: '#ffffff' }));
  gateLogo.colorSpace = THREE.SRGBColorSpace;
  const gateLogoMat = new THREE.MeshStandardMaterial({ map: gateLogo, roughness: 0.5 });
  for (const g of S.gates.filter((q) => q.label)) {
    const gx = m(g.x), gw = m(g.width), z = g.side === 'north' ? PLOT.z0 : PLOT.z1;
    const accent = g.side === 'north' ? M.ancAccent : new THREE.MeshStandardMaterial({ color: '#1d5fb8', roughness: 0.5 });
    const posts = [];
    for (const s of [-1, 1]) posts.push(new THREE.BoxGeometry(1.2, 7.6, 1.2).translate(gx + s * (gw / 2 + 0.6), Y_YARD + 3.8, z));
    posts.push(new THREE.BoxGeometry(gw + 2.4, 1.3, 1.0).translate(gx, Y_YARD + 7.0, z));
    group.add(mesh(merge(posts), accent));
    const panel = new THREE.PlaneGeometry(8.6, 2.32);
    if (g.side === 'north') panel.rotateY(Math.PI);
    panel.translate(gx, Y_YARD + 7.0, z + (g.side === 'north' ? -0.52 : 0.52));
    group.add(mesh(panel, gateLogoMat, { cast: false }));
    // boom barrier
    const boom = new THREE.BoxGeometry(gw * 0.46, 0.12, 0.12).translate(gx - gw * 0.25, Y_YARD + 1.1, z + (g.side === 'north' ? 1.5 : -1.5));
    group.add(mesh(boom, M.yellowBlack, { cast: false }));
  }

  // --- Ancillary buildings ------------------------------------------------------------
  const ancillary = [];
  const accentBlue = new THREE.MeshStandardMaterial({ color: '#1d5fb8', roughness: 0.6 });
  const zFire = m(CONFIG.building.firewallAt) - HL;
  for (const a of CONFIG.ancillary) {
    const x = m(a.x), z = m(a.z), w = m(a.w), d = m(a.d);
    const h = m(a.h) + (a.id === 'pack' || a.id === 'rest' ? 1.3 : 0);
    const g = new THREE.Group();
    g.name = a.id;
    const accent = z < zFire ? M.ancAccent : accentBlue;
    if (a.slab) {
      g.add(mesh(new THREE.BoxGeometry(w, h, d).translate(x, Y_YARD + h / 2, z), M.tankSlab, { cast: false }));
      const bits = [];
      for (const [ox, oz] of [[-2.5, -5], [2.5, 5], [0, 0]]) bits.push(new THREE.BoxGeometry(0.9, 0.08, 0.9).translate(x + ox, Y_YARD + h + 0.04, z + oz));
      g.add(mesh(merge(bits), M.dark, { cast: false }));
      const pipes = [];
      for (const [ox, oz] of [[-3.5, 6], [3.5, -6]]) pipes.push(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8).translate(x + ox, Y_YARD + h + 0.6, z + oz));
      g.add(mesh(merge(pipes), M.pole, { cast: false }));
    } else if (a.kind === 'substation') {
      g.add(mesh(new THREE.BoxGeometry(w - 1.2, h - 0.6, d - 1.6).translate(x, Y_YARD + (h - 0.6) / 2, z), M.substation));
      const fz = [];
      for (const [ax, az, bx, bz] of [[x - w / 2, z - d / 2, x + w / 2, z - d / 2], [x - w / 2, z + d / 2, x + w / 2, z + d / 2], [x - w / 2, z - d / 2, x - w / 2, z + d / 2], [x + w / 2, z - d / 2, x + w / 2, z + d / 2]]) {
        const len = Math.hypot(bx - ax, bz - az);
        const pg = new THREE.PlaneGeometry(len, 2.2);
        pg.rotateY(Math.atan2(-(bz - az), bx - ax));
        pg.translate((ax + bx) / 2, Y_YARD + 1.1, (az + bz) / 2);
        fz.push(worldUV(pg));
      }
      g.add(mesh(merge(fz), M.fence, { cast: false }));
    } else if (a.open) {
      const parts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) parts.push(new THREE.BoxGeometry(0.3, h, 0.3).translate(x + sx * (w / 2 - 0.3), Y_YARD + h / 2, z + sz * (d / 2 - 0.3)));
      g.add(mesh(merge(parts), M.pole));
      g.add(mesh(new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6).translate(x, Y_YARD + h + 0.15, z), M.ancRoof));
      g.add(mesh(new THREE.BoxGeometry(w, 0.5, d).translate(x, Y_YARD + h - 0.25, z), accent));
      g.add(mesh(new THREE.BoxGeometry(w - 0.6, h * 0.55, 0.25).translate(x, Y_YARD + h * 0.275, z + d / 2 - 0.3), M.ancWall));
      const fl = [];
      for (let k = 0; k < 4; k++) fl.push(new THREE.BoxGeometry(1.1, 1.6, 2.2).translate(x - w / 2 + 1.4 + k * 2.4, Y_YARD + 0.8, z - 0.3));
      g.add(mesh(merge(fl), M.yellowBlack));
    } else {
      g.add(mesh(new THREE.BoxGeometry(w, h, d).translate(x, Y_YARD + h / 2, z), M.ancWall));
      g.add(mesh(new THREE.BoxGeometry(w + 0.5, 0.25, d + 0.5).translate(x, Y_YARD + h + 0.12, z), M.ancRoof));
      g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.55, d + 0.12).translate(x, Y_YARD + h - 0.35, z), accent, { cast: false }));
      // window bands on the long sides + a door
      const win = [];
      const long = d >= w ? 'z' : 'x';
      if (long === 'z') {
        for (const s of [-1, 1]) win.push(new THREE.BoxGeometry(0.06, 1.0, d * 0.6).translate(x + s * (w / 2 + 0.02), Y_YARD + h * 0.55, z));
        win.push(new THREE.BoxGeometry(1.4, 2.3, 0.06).translate(x, Y_YARD + 1.15, z - d / 2 - 0.02));
      } else {
        for (const s of [-1, 1]) win.push(new THREE.BoxGeometry(w * 0.6, 1.0, 0.06).translate(x, Y_YARD + h * 0.55, z + s * (d / 2 + 0.02)));
        win.push(new THREE.BoxGeometry(0.06, 2.3, 1.4).translate(x - w / 2 - 0.02, Y_YARD + 1.15, z));
      }
      g.add(mesh(merge(win), M.window, { cast: false }));
    }
    g.traverse((o) => {
      if (o.isMesh) o.userData.anc = ancillary.length;
    });
    const box = new THREE.Box3().setFromObject(g);
    ancillary.push({ config: a, group: g, box, info: { name: a.name, size: a.size } });
    group.add(g);
  }

  // --- EV charging / tractor parking / trailer drop (master plan REV02) ------------------
  const evBays = [];
  const EV = C.evCharging;
  if (EV) {
    const x0 = m(EV.x0), x1 = m(EV.x1), z0 = m(EV.z0), z1 = m(EV.z1);
    const n = EV.slots, bw = (z1 - z0) / n;
    const area = new THREE.Group();
    area.name = 'ev-charging';
    // green painted bays
    const fill = new THREE.Mesh(flatRect(x0, x1, z0, z1, Y.mark - 0.01), new THREE.MeshStandardMaterial({ color: '#58b35e', transparent: true, opacity: 0.35, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }));
    area.add(fill);
    const lineM = [];
    for (let k = 0; k <= n; k++) lineM.push(trs((x0 + x1) / 2, Y.mark, z0 + k * bw, 0, x1 - x0, 1, k % 2 ? 0.6 : 1));
    lineM.push(trs(x0, Y.mark, (z0 + z1) / 2, Math.PI / 2, z1 - z0, 1, 1));
    lineM.push(trs(x1, Y.mark, (z0 + z1) / 2, Math.PI / 2, z1 - z0, 1, 1));
    const greenLine = new THREE.MeshStandardMaterial({ color: '#2f9a3a', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    area.add(instanced(new THREE.BoxGeometry(1, 0.02, 0.18), greenLine, lineM, null, { cast: false }));
    for (let k = 0; k < n; k++) evBays.push({ x0, x1, z: z0 + (k + 0.5) * bw });
    // dual chargers on the park side, one per two bays, with a yellow cable trench
    const posts = [], screens = [];
    for (let k = 0; k < EV.chargers; k++) {
      const z = z0 + (k + 0.5) * ((z1 - z0) / EV.chargers);
      posts.push(trs(x0 - 0.7, Y.pave + 0.9, z));
      screens.push(trs(x0 - 0.42, Y.pave + 1.35, z));
    }
    area.add(instanced(new THREE.BoxGeometry(0.5, 1.8, 0.7), new THREE.MeshStandardMaterial({ color: '#f4f5f2', roughness: 0.4, metalness: 0.2 }), posts, null));
    area.add(instanced(new THREE.BoxGeometry(0.06, 0.45, 0.45), M.evScreen, screens, null, { cast: false }));
    const st = EV.station, sx = m(st.x), sz = m(st.z);
    area.add(mesh(flatRect(x0 - 1.6, x0 - 1.0, sz, z1, Y.mark), M.markingYellow, { cast: false }));
    area.add(mesh(flatRect(x0 - 1.6, sx, sz - 0.3, sz + 0.3, Y.mark), M.markingYellow, { cast: false }));
    ancillary.push({ config: { id: 'ev' }, group: area, box: new THREE.Box3().setFromObject(area), info: { name: 'Tractor parking & EV charging', size: `${n} bays, ${EV.chargers} dual chargers` } });
    area.traverse((o) => o.isMesh && (o.userData.anc = ancillary.length - 1));
    group.add(area);
    // charging substation next to road N1
    const stn = new THREE.Group();
    stn.name = 'ev-station';
    const sw2 = m(st.w), sd2 = m(st.d);
    stn.add(mesh(new THREE.BoxGeometry(sw2, 0.3, sd2).translate(sx, Y.pave + 0.15, sz), M.tankSlab, { cast: false }));
    for (const o of [-sw2 / 4, sw2 / 4]) stn.add(mesh(new THREE.BoxGeometry(sw2 / 2 - 0.8, 2.4, sd2 - 1.2).translate(sx + o, Y.pave + 1.5, sz), M.substation));
    stn.add(mesh(new THREE.BoxGeometry(sw2 - 0.2, 0.12, sd2 - 0.6).translate(sx, Y.pave + 2.76, sz), M.ancAccent));
    const bol = [];
    for (let k = 0; k < 6; k++) bol.push(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 8).translate(sx - sw2 / 2 + 0.3 + (k * (sw2 - 0.6)) / 5, Y.pave + 0.5, sz + sd2 / 2 + 0.4));
    stn.add(mesh(merge(bol), M.yellowBlack, { cast: false }));
    ancillary.push({ config: { id: 'evstation' }, group: stn, box: new THREE.Box3().setFromObject(stn), info: { name: 'EV charging substation', size: 'feeds the tractor charging bays' } });
    stn.traverse((o) => o.isMesh && (o.userData.anc = ancillary.length - 1));
    group.add(stn);
  }

  // --- Plot boundary (red dashed, like the master plan) --------------------------------
  const bpts = [
    [PLOT.x0, PLOT.z0], [PLOT.x1, PLOT.z0], [PLOT.x1, PLOT.z1], [PLOT.x0, PLOT.z1], [PLOT.x0, PLOT.z0],
  ].map(([x, z]) => new THREE.Vector3(x, Y_YARD + 0.25, z));
  const bl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bpts), new THREE.LineDashedMaterial({ color: '#e0312b', dashSize: 4, gapSize: 2.5, transparent: true, opacity: 0.95 }));
  bl.computeLineDistances();
  bl.renderOrder = 4;
  labels.add(bl);

  // --- Trees and shrubs ------------------------------------------------------------------
  const trees = []; // [x, z, scale]
  // keep the access control gates (and their driveways) free of trees and lamps
  const gateZones = (CONFIG.depot?.gates || []).map((g) => {
    const gx = m(g.x), gz = m(g.z);
    return g.axis === 'x' ? [gx - 34, gx + 24, gz - 16, gz + 16] : [gx - 16, gx + 16, gz - 26, gz + 26];
  });
  const inGate = (x, z) => gateZones.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  const tree = (x, z, s = 1) => {
    if (!inGate(x, z)) trees.push([x, z, s * (0.8 + rand() * 0.45)]);
  };
  for (let z = -100; z < PLOT.z1 - 18; z += m(CONFIG.landscape.treeSpacing)) tree(PLOT.x1 - 1.8, z, 0.9);
  for (let x = d1x1 + 8; x < xFar - 10; x += 11) {
    if (Math.abs(x - 65.5) < 11 || Math.abs(x + 72.5) < 11) continue;
    if (x < -8 || x > 110) tree(x, PLOT.z0 - sw + 1.6, 1); // keep the view to the F1 entrance open
    tree(x, n1.z0 - sw + 2.0, 1);
    tree(x, PLOT.z1 + sw - 1.6, 1);
    tree(x, n3.z1 + sw - 2.0, 1);
  }
  for (const [a, b] of d1Medians) for (let z = -500; z < 500; z += 12) tree((a + b) / 2, z, b - a > 8 ? 1.2 : 0.9);
  // NW park
  for (let i = 0; i < 170; i++) tree(pk.x0 + 6 + rand() * (pk.x1 - pk.x0 - 12), pk.z0 + 6 + rand() * (pk.z1 - pk.z0 - 12), 1.15);
  // green islands inside the plot
  const islandTrees = [[-58, -165], [-58, -155], [-58, -146], [55, -160], [55, -140], [55, -121], [-58, 160], [-58, 168], [54, 158], [54, 168]];
  for (const [x, z] of islandTrees) tree(x, z, 0.95);
  // truck yard edges
  for (let z = PLOT.z0 + 6; z < PLOT.z1 - 6; z += 14) if (z > pk.z1 + 4) tree(yardX0 + 2.5, z, 1);

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkM = [], crownM = [], crownC = [];
  const greens = ['#3d6a2c', '#4a7733', '#335d27', '#57803a', '#2f5a2a', '#62803f'].map((c) => new THREE.Color(c));
  for (const [x, z, s] of trees) {
    const th = 3.2 * s, cr = 2.6 * s;
    trunkM.push(trs(x, Y.pave, z, 0, s, th, s));
    crownM.push(trs(x, Y.pave + th + cr * 0.55, z, rand() * 6, cr, cr * (0.85 + rand() * 0.3), cr));
    crownC.push(greens[Math.floor(rand() * greens.length)]);
  }
  M.leaves.color.set('#ffffff');
  landscape.add(instanced(trunkGeo, M.trunk, trunkM, null, { receive: false }));
  landscape.add(instanced(crownGeo, M.leaves, crownM, crownC, { receive: true }));

  // shrubs along the building ends and island edges
  const shrubM = [];
  for (let x = -HW + 2; x < HW - 2; x += 2.6) {
    if (x > 25 && x < 52) continue; // office entrance
    shrubM.push(trs(x, Y.pave + 0.55, -HL - 1.8, rand() * 6, 1.0, 0.8, 1.0));
    shrubM.push(trs(x, Y.pave + 0.55, HL + 1.8, rand() * 6, 1.0, 0.8, 1.0));
  }
  for (let z = -104; z < PLOT.z1 - 18; z += 3) shrubM.push(trs(PLOT.x1 - 0.8, Y.pave + 0.5, z + 1.5, rand() * 6, 0.8, 0.7, 0.8));
  landscape.add(instanced(new THREE.IcosahedronGeometry(1, 0), M.hedge, shrubM, null, { cast: false }));

  // --- Street lights ---------------------------------------------------------------------
  const lamps = []; // [x, z, ry] ry points the arm direction
  for (let z = PLOT.z0 + 22; z < PLOT.z1 - 20; z += 30) lamps.push([PLOT.x0 + 0.8, z, 0]);
  for (let z = -95; z < PLOT.z1 - 20; z += 30) lamps.push([PLOT.x1 - 3.8, z, Math.PI]);
  for (let x = PLOT.x0 + 25; x < 60; x += 32) {
    lamps.push([x, PLOT.z0 + 0.8, -Math.PI / 2]);
    lamps.push([x, PLOT.z1 - 0.8, Math.PI / 2]);
  }
  for (let x = d1x1 + 20; x < xFar; x += 36) {
    lamps.push([x, n1.z1 + 0.8, Math.PI / 2]);
    lamps.push([x, n3.z0 - 0.8, -Math.PI / 2]);
  }
  for (let z = -480; z < 500; z += 40) lamps.push([(d1Medians[1][0] + d1Medians[1][1]) / 2, z, (z / 40) % 2 ? 0 : Math.PI]);
  for (const r of C.yardRoads) {
    if (r.dir === 'ns') for (let z = PLOT.z0 + 15; z < PLOT.z1; z += 40) lamps.push([m(r.x) + m(r.width) / 2 + 0.8, z, Math.PI]);
    else for (let x = (r.x0 !== undefined ? m(r.x0) : yardX0) + 15; x < PLOT.x0; x += 40) lamps.push([x, m(r.z) - m(r.width) / 2 - 0.8, -Math.PI / 2]);
  }
  for (let i = lamps.length - 1; i >= 0; i--) if (inGate(lamps[i][0], lamps[i][1])) lamps.splice(i, 1);
  const poleM = [], armM = [], headM = [], glowPos = [];
  const PH = 10;
  for (const [x, z, ry] of lamps) {
    poleM.push(trs(x, Y.pave, z, 0, 1, 1, 1));
    const ax = Math.cos(ry), az = -Math.sin(ry);
    armM.push(trs(x + ax * 1.1, Y.pave + PH - 0.1, z + az * 1.1, ry));
    headM.push(trs(x + ax * 2.1, Y.pave + PH - 0.25, z + az * 2.1, ry));
    glowPos.push(x + ax * 2.1, Y.pave + PH - 0.6, z + az * 2.1);
  }
  group.add(instanced(new THREE.CylinderGeometry(0.09, 0.14, PH, 6).translate(0, PH / 2, 0), M.pole, poleM, null, { receive: false }));
  group.add(instanced(new THREE.BoxGeometry(2.2, 0.1, 0.1), M.pole, armM, null, { cast: false }));
  group.add(instanced(new THREE.BoxGeometry(0.9, 0.18, 0.4), M.lamp, headM, null, { cast: false }));
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  const glows = new THREE.Points(glowGeo, M.glowPoints);
  glows.renderOrder = 10;
  glows.frustumCulled = false;
  group.add(glows);

  // --- Label anchors -----------------------------------------------------------------------
  const anchors = [
    { text: 'Road N1', cls: 'road', pos: [-230, Y.mark, (n1.z0 + n1.z1) / 2] },
    { text: 'Road N3', cls: 'road', pos: [-230, Y.mark, (n3.z0 + n3.z1) / 2] },
    { text: 'Road D1', cls: 'road', pos: [(d1x0 + d1x1) / 2, Y.mark, -150] },
    { text: 'Gate G1', cls: 'gate', pos: [m(S.gates[0].x), Y_YARD + 9, PLOT.z0] },
    { text: 'Gate G2', cls: 'gate', pos: [m(S.gates[1].x), Y_YARD + 9, PLOT.z1] },
    { text: 'Landscaped park', cls: 'zone', pos: [(pk.x0 + pk.x1) / 2, Y_YARD + 1, (pk.z0 + pk.z1) / 2] },
    ...(C.evCharging ? [{ text: 'EV charging (tractors)', cls: 'zone', pos: [m(C.evCharging.x0 + C.evCharging.x1) / 2, Y_YARD + 1, -80] }] : []),
    { text: 'Dock apron (east)', cls: 'zone', pos: [62, Y_YARD + 1, 60] },
    { text: 'Container staging (west)', cls: 'zone', pos: [-62, Y_YARD + 1, -60] },
  ];

  return { group, landscape, labels, ancillary, parkingBays, evBays, glows, anchors, plot: PLOT };
}
