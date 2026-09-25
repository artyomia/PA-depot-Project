import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, BUILD_L, BUILD_W, uToZ, vToX, Y_YARD, box, merge, mesh, instanced, trs } from './util.js';

const D = CONFIG.docks;
const HALF_W = BUILD_W / 2;

/** Which warehouse a building-local u belongs to. */
export function warehouseAt(u) {
  const wh = CONFIG.building.warehouses;
  return wh.find((w) => u >= m(w.u0) && u <= m(w.u1)) || wh[0];
}

/** Flat list of every loading door with its position (metres). */
export function doorList() {
  const out = [];
  D.groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) {
      const u = m(g.start + i * g.step);
      out.push({
        group: gi,
        index: i,
        side: g.side,
        warehouse: g.warehouse,
        u,
        width: m(g.width),
        height: m(g.height),
        levelers: g.levelers,
        x: g.side === 'east' ? HALF_W : -HALF_W,
        z: uToZ(u),
        dir: g.side === 'east' ? 1 : -1, // outward normal along x
      });
    }
  });
  return out;
}

/** Truck docking positions (rear bumper point) for every door and slot. */
export function dockSlots() {
  const off = m(D.truckSlotOffset);
  const pd = m(D.platformDepth);
  const slots = [];
  for (const d of doorList()) {
    const offsets = d.levelers === 2 ? [-off, off] : [0];
    offsets.forEach((o, k) => {
      slots.push({
        door: d,
        slot: d.levelers === 2 ? (k === 0 ? -1 : 1) : 0,
        x: d.x + d.dir * (pd + 0.25),
        z: d.z + o,
        dir: d.dir,
      });
    });
  }
  return slots;
}

/**
 * Doors, dock platforms, levelers, bumpers, shelters and cantilever canopies.
 * Returns { group, doors, xray } where doors[i].setOpen(0..1) animates the shutter.
 */
export function buildDocks(M, TH) {
  const group = new THREE.Group();
  group.name = 'docks';
  const pd = m(D.platformDepth);
  const lw = m(D.levelerWidth);
  const Y0 = Y_YARD;

  const concrete = [], plates = [], bumpers = [], seals = [], yellow = [];
  const doors = [];

  for (const d of doorList()) {
    const th = TH[d.warehouse];
    const s = d.dir;
    const xw = d.x; // exterior face of the wall

    // Roller shutter (inset in the opening)
    const panelGeo = new THREE.BoxGeometry(d.width, d.height, 0.08);
    panelGeo.translate(0, -d.height / 2, 0); // anchor at top so scaling opens upwards
    const panel = mesh(panelGeo, th.door, { cast: false });
    panel.rotation.y = Math.PI / 2;
    panel.position.set(xw - s * 0.12, d.height, d.z);
    group.add(panel);
    const door = {
      ...d,
      panel,
      open: 0,
      target: 0,
      users: 0,
      setOpen(f) {
        this.open = f;
        const k = Math.max(0.02, 1 - f);
        panel.scale.y = k;
        panel.visible = f < 0.985;
      },
    };
    doors.push(door);

    // Shelter / seal frame around the opening
    const sd = 0.6;
    seals.push(box(sd, 0.9, d.width + 1.0, xw + s * sd / 2, d.height + 0.45, d.z));
    seals.push(box(sd, d.height, 0.5, xw + s * sd / 2, d.height / 2, d.z - d.width / 2 - 0.25));
    seals.push(box(sd, d.height, 0.5, xw + s * sd / 2, d.height / 2, d.z + d.width / 2 + 0.25));

    if (d.levelers === 2) {
      // two raised levelers per 8 m door (two trucks side by side)
      for (const o of [-m(D.truckSlotOffset), m(D.truckSlotOffset)]) {
        const cz = d.z + o;
        concrete.push(box(pd, -Y0, lw + 0.4, xw + s * pd / 2, Y0 / 2, cz));
        plates.push(box(pd - 0.2, 0.04, lw - 0.1, xw + s * (pd / 2 - 0.05), 0.02, cz));
        for (const b of [-0.85, 0.85]) bumpers.push(box(0.18, 0.5, 0.3, xw + s * (pd + 0.09), -0.35, cz + b));
        yellow.push(box(0.12, 0.03, lw + 0.4, xw + s * (pd - 0.06), 0.015, cz));
      }
    } else {
      // single wide dock platform (12 m) at floor level
      const w = 12 - 0.6;
      concrete.push(box(pd, -Y0, w, xw + s * pd / 2, Y0 / 2, d.z));
      plates.push(box(pd - 0.3, 0.04, d.width - 0.4, xw + s * (pd / 2 - 0.1), 0.02, d.z));
      yellow.push(box(0.15, 0.03, w, xw + s * (pd - 0.08), 0.015, d.z));
      for (const b of [-4.5, -1.5, 1.5, 4.5]) bumpers.push(box(0.18, 0.5, 0.3, xw + s * (pd + 0.09), -0.35, d.z + b));
      // steps at the platform end
      for (let k = 0; k < 4; k++) {
        concrete.push(box(1.2, (k + 1) * 0.325, 0.35, xw + s * (pd - 0.6), Y0 + ((k + 1) * 0.325) / 2, d.z + w / 2 + 0.175 + (3 - k) * 0.35));
      }
    }
  }

  group.add(mesh(merge(concrete), M.rc));
  group.add(mesh(merge(plates), M.leveler, { cast: false }));
  group.add(mesh(merge(bumpers), M.rubber, { cast: false }));
  group.add(mesh(merge(seals), M.dark));
  group.add(mesh(merge(yellow), M.yellowBlack, { cast: false }));

  // --- Cantilever canopies --------------------------------------------------
  const yc = m(CONFIG.levels.canopy);
  const lampMats = [];
  const rodGeo = [];
  const canopyTop = [], canopyUnder = [];
  const fascia = { F1: [], F2: [] };
  for (const c of D.canopies) {
    const depth = m(c.depth);
    if (c.side === 'east' || c.side === 'west') {
      const s = c.side === 'east' ? 1 : -1;
      const u0 = m(c.u0), u1 = m(c.u1);
      const len = u1 - u0;
      const zc = uToZ((u0 + u1) / 2);
      const xc = s * (HALF_W + depth / 2);
      const wh = warehouseAt((u0 + u1) / 2).id;
      canopyTop.push(box(depth, 0.18, len, xc, yc + 0.3, zc));
      canopyUnder.push(box(depth, 0.02, len, xc, yc + 0.01, zc));
      fascia[wh].push(box(0.25, 0.75, len + 0.25, s * (HALF_W + depth), yc + 0.3, zc));
      // tie rods every 6 m
      for (let u = u0 + 3; u < u1; u += 6) {
        const x0 = s * HALF_W, y0 = yc + 4.2, x1 = s * (HALF_W + depth - 0.5), y1 = yc + 0.45;
        const len2 = Math.hypot(x1 - x0, y1 - y0);
        const g = new THREE.CylinderGeometry(0.045, 0.045, len2, 6);
        g.rotateZ(Math.atan2(-(x1 - x0), y1 - y0));
        g.translate((x0 + x1) / 2, (y0 + y1) / 2, uToZ(u));
        rodGeo.push(g);
        lampMats.push(trs(s * (HALF_W + depth - 1.2), yc - 0.05, uToZ(u)));
      }
    } else {
      // north / south end canopy
      const s = c.side === 'south' ? 1 : -1;
      const v0 = m(c.v0), v1 = m(c.v1);
      const len = v1 - v0;
      const xc = vToX((v0 + v1) / 2);
      const zc = s * (BUILD_L / 2 + depth / 2);
      const wh = c.side === 'north' ? 'F1' : 'F2';
      canopyTop.push(box(len, 0.18, depth, xc, yc + 0.3, zc));
      canopyUnder.push(box(len, 0.02, depth, xc, yc + 0.01, zc));
      fascia[wh].push(box(len + 0.25, 0.75, 0.25, xc, yc + 0.3, s * (BUILD_L / 2 + depth)));
      for (let v = v0 + 3; v < v1; v += 6) lampMats.push(trs(vToX(v), yc - 0.05, s * (BUILD_L / 2 + depth - 1.2)));
    }
  }
  group.add(mesh(merge(canopyTop), M.trim));
  group.add(mesh(merge(canopyUnder), M.roofUnder, { cast: false }));
  for (const wh of ['F1', 'F2']) if (fascia[wh].length) group.add(mesh(merge(fascia[wh]), TH[wh].accent));
  if (rodGeo.length) group.add(mesh(merge(rodGeo), M.steel, { cast: false }));
  const lampGeo = new THREE.BoxGeometry(0.5, 0.08, 1.0);
  group.add(instanced(lampGeo, M.lamp, lampMats, null, { cast: false, receive: false }));

  return { group, doors };
}
