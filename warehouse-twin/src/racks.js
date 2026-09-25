import * as THREE from 'three';
import { CONFIG } from './config.js';
import { m, uToZ, vToX, rng, instanced, trs } from './util.js';

/**
 * Selective pallet racking from the rack floor plan.
 * Back-to-back double rows run east-west (across the building). Everything is drawn
 * with a handful of InstancedMeshes: uprights, beams, pallet loads and row-end guards.
 */
export function buildRacks(M) {
  const R = CONFIG.racks;
  const group = new THREE.Group();
  group.name = 'racks';
  const rand = rng(2024);

  const H = m(R.height);
  const depth = m(R.rackDepth);
  const flue = m(R.flue);
  const bay = m(R.bayLength);
  const us = m(R.uprightSize);
  const loadH = m(R.loadHeight);
  const levels = [0.12, ...R.beamLevels.map(m)]; // floor level + beam tops

  const uprights = [], beams = [], loads = [], loadColors = [], guards = [];
  const palette = ['#c9a46e', '#e9e6de', '#d8cdb8', '#a9c3db', '#b8c9a3', '#e3b27e', '#cfcfcf', '#bfa27c', '#f0ede6', '#9fb7cf'].map((c) => new THREE.Color(c));

  let rowBlocks = 0;
  for (const row of R.rows) {
    for (let u = m(row.first); u <= m(row.last) + 1e-6; u += m(R.rowPitch)) {
      const zc = uToZ(u);
      const first = Math.abs(u - m(row.first)) < 1e-6;
      R.blocks.forEach((blk, bi) => {
        if (first && row.skipBlockAtFirst && row.skipBlockAtFirst.includes(bi)) return;
        const v0 = m(blk.v0), v1 = m(blk.v1);
        const nb = Math.floor((v1 - v0) / bay);
        const len = nb * bay;
        const x0 = vToX(v0 + (v1 - v0 - len) / 2);
        rowBlocks++;
        // two racks of the double row
        for (const side of [-1, 1]) {
          const zr = zc + side * (flue / 2 + depth / 2);
          // uprights on both faces of this rack
          for (let k = 0; k <= nb; k++) {
            const x = x0 + k * bay;
            for (const f of [-1, 1]) uprights.push(trs(x, H / 2, zr + f * (depth / 2 - us / 2)));
          }
          // continuous beam lines on both faces
          for (const lv of levels.slice(1)) {
            for (const f of [-1, 1]) beams.push(trs(x0 + len / 2, lv - 0.06, zr + f * (depth / 2 - 0.02), 0, len, 1, 1));
          }
          // pallet loads
          for (let k = 0; k < nb; k++) {
            for (const lv of levels) {
              if (rand() > R.occupancy) continue;
              const h = loadH * (0.72 + rand() * 0.28);
              loads.push(trs(x0 + (k + 0.5) * bay, lv + h / 2, zr, 0, 1, h / loadH, 1));
              loadColors.push(palette[Math.floor(rand() * palette.length)]);
            }
          }
        }
        // yellow end-of-row guards
        for (const x of [x0 - 0.35, x0 + len + 0.35]) guards.push(trs(x, 0.3, zc));
      });
    }
  }

  const uprightGeo = new THREE.BoxGeometry(us, H, us);
  const beamGeo = new THREE.BoxGeometry(1, 0.12, 0.05);
  const loadGeo = new THREE.BoxGeometry(bay - 0.16, loadH, depth - 0.08);
  const guardGeo = new THREE.BoxGeometry(0.2, 0.6, 2 * depth + flue + 0.2);

  const up = instanced(uprightGeo, M.rackUpright, uprights, null, { cast: false });
  const bm = instanced(beamGeo, M.rackBeam, beams, null, { cast: false });
  const ld = instanced(loadGeo, M.rackLoad, loads, loadColors, { cast: false });
  const gd = instanced(guardGeo, M.yellowBlack, guards, null, { cast: false });
  group.add(up, bm, ld, gd);

  // Yellow aisle lines on the floor along the rack block edges
  const lines = [];
  for (const wh of CONFIG.building.warehouses) {
    const u0 = m(wh.u0) + 3, u1 = m(wh.u1) - 3;
    for (const blk of R.blocks) {
      for (const v of [m(blk.v0) - 0.6, m(blk.v1) + 0.6]) {
        lines.push(trs(vToX(v), 0.012, uToZ((u0 + u1) / 2), 0, 1, 1, u1 - u0));
      }
    }
  }
  const lineMesh = instanced(new THREE.BoxGeometry(0.12, 0.01, 1), M.markingYellow, lines, null, { cast: false });
  group.add(lineMesh);

  group.userData.stats = { rowBlocks, uprights: uprights.length, beams: beams.length, loads: loads.length };
  group.userData.casters = [up, ld];
  return group;
}
