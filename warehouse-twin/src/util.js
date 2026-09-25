import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';

/** millimetres -> metres */
export const m = (mm) => mm / 1000;

const B = CONFIG.building;
export const BUILD_L = m(B.xBays.reduce((a, b) => a + b, 0)); // 342.5
export const BUILD_W = m(B.yBays.reduce((a, b) => a + b, 0)); // 100
export const Y_FLOOR = m(CONFIG.levels.floor);
export const Y_YARD = m(CONFIG.levels.yard);
export const Y_EAVE = m(CONFIG.levels.eave);
export const Y_RIDGE = m(CONFIG.levels.ridge);

/** Building-local (u from north end, v from west wall, metres) to world x / z. */
export const uToZ = (u) => u - BUILD_L / 2;
export const vToX = (v) => v - BUILD_W / 2;

/** Grid line positions (metres, cumulative) */
export function gridPositions(baysMm) {
  const out = [0];
  let acc = 0;
  for (const b of baysMm) {
    acc += m(b);
    out.push(acc);
  }
  return out;
}

/** Roof height (underside of sheet) at world x. */
export function roofY(x) {
  const t = Math.min(1, Math.abs(x) / (BUILD_W / 2));
  return Y_RIDGE + (Y_EAVE - Y_RIDGE) * t;
}

/**
 * Box geometry with UVs in METRES, computed from world position after placement
 * so textures stay continuous across neighbouring pieces.
 *   +/-x faces: u = z, v = y   |   +/-z faces: u = x, v = y   |   +/-y faces: u = z, v = x
 */
export function box(sx, sy, sz, cx = 0, cy = 0, cz = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  worldUV(g);
  return g;
}

export function worldUV(g) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (nx >= ny && nx >= nz) uv.setXY(i, nor.getX(i) > 0 ? -z : z, y);
    else if (nz >= ny) uv.setXY(i, nor.getZ(i) > 0 ? x : -x, y);
    else uv.setXY(i, z, x);
  }
  g.setAttribute('uv', uv);
  uv.needsUpdate = true;
  return g;
}

/** Flat horizontal rectangle (facing up) with world UVs. */
export function flatRect(x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  worldUV(g);
  return g;
}

/** Horizontal rounded rectangle (shape geometry) facing up. */
export function roundedRect(x0, x1, z0, z1, r, y) {
  const w = x1 - x0, d = z1 - z0;
  r = Math.min(r, w / 2, d / 2);
  if (r <= 0.01) return flatRect(x0, x1, z0, z1, y);
  const s = new THREE.Shape();
  s.moveTo(x0 + r, z0);
  s.lineTo(x1 - r, z0);
  s.quadraticCurveTo(x1, z0, x1, z0 + r);
  s.lineTo(x1, z1 - r);
  s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1);
  s.quadraticCurveTo(x0, z1, x0, z1 - r);
  s.lineTo(x0, z0 + r);
  s.quadraticCurveTo(x0, z0, x0 + r, z0);
  const g = new THREE.ShapeGeometry(s, 6);
  // Shape lies in XY; map (x, y) -> (x, z) facing up
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  // rotateX(+90) flips normals down; fix winding so it faces up
  flipFaces(g);
  worldUV(g);
  return g;
}

export function flipFaces(g) {
  const idx = g.index;
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  } else {
    // non-indexed: swap the 2nd and 3rd vertex of every triangle in every attribute
    for (const attr of Object.values(g.attributes)) {
      const k = attr.itemSize, a = attr.array;
      for (let v = 0; v < attr.count; v += 3) {
        for (let c = 0; c < k; c++) {
          const i1 = (v + 1) * k + c, i2 = (v + 2) * k + c;
          const t = a[i1];
          a[i1] = a[i2];
          a[i2] = t;
        }
      }
      attr.needsUpdate = true;
    }
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  n.needsUpdate = true;
  return g;
}

/** Merge geometries (all must share the same attribute set). Returns null for empty lists. */
export function merge(list, groups = false) {
  const clean = list.filter(Boolean).map((g) => {
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  if (!clean.length) return null;
  return mergeGeometries(clean, groups);
}

/** Mesh helper */
export function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const me = new THREE.Mesh(geo, mat);
  me.castShadow = cast;
  me.receiveShadow = receive;
  if (name) me.name = name;
  return me;
}

/** Deterministic pseudo random generator so the scene is identical on every load. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Instanced mesh from a list of matrices / colors. */
export function instanced(geo, mat, matrices, colors, { cast = true, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, matrices.length));
  im.count = matrices.length;
  for (let i = 0; i < matrices.length; i++) {
    im.setMatrixAt(i, matrices[i]);
    if (colors) im.setColorAt(i, colors[i]);
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast;
  im.receiveShadow = receive;
  im.computeBoundingSphere();
  return im;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
export function trs(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.clone().compose(_p, _q, _s);
}
