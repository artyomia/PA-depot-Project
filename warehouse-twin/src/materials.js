import * as THREE from 'three';
import { rng } from './util.js';

/**
 * Procedural textures (drawn on canvases, no image files) and shared materials.
 * All textures use world-metre UVs, so `repeat = 1 / tileSizeInMetres`.
 */

const textures = [];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { tileW = 1, tileH = 1, srgb = true, offX = 0, offY = 0, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tileW, 1 / tileH);
  t.offset.set(offX, offY);
  t.anisotropy = 4;
  textures.push(t);
  return t;
}

export function setAnisotropy(n) {
  for (const t of textures) {
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

function noise(ctx, w, h, amount, seed, alpha = 0.06, size = 2) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, size, size);
  }
}

function blotches(ctx, w, h, count, seed, rgb, alpha, rMin, rMax) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb},${alpha * r()})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// -----------------------------------------------------------------------------
// Texture factories
// -----------------------------------------------------------------------------

/** Metal cladding, one 12 m bay x 10.5 m high, with optional translucent strip (970 wide). */
function claddingCanvas(strip, emissive = false) {
  const W = 1024, H = 512;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  const ppm = W / 12;
  x.fillStyle = emissive ? '#000' : '#f3f4f2';
  x.fillRect(0, 0, W, H);
  if (!emissive) {
    const pitch = ppm * 0.333;
    for (let px = 0; px < W; px += pitch) {
      x.fillStyle = 'rgba(120,128,135,0.22)';
      x.fillRect(px, 0, 3, H);
      x.fillStyle = 'rgba(255,255,255,0.8)';
      x.fillRect(px + 3, 0, 2, H);
    }
    noise(x, W, H, 4000, 3, 0.05);
  }
  if (strip) {
    const sw = 0.97 * ppm;
    const y0 = (0.5 / 10.5) * H, y1 = (5.5 / 10.5) * H;
    if (emissive) {
      x.fillStyle = '#fff';
      x.fillRect(W / 2 - sw / 2, y0, sw, y1 - y0);
    } else {
      const g = x.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, '#dfe9ef');
      g.addColorStop(1, '#c9d9e3');
      x.fillStyle = g;
      x.fillRect(W / 2 - sw / 2, y0, sw, y1 - y0);
      x.fillStyle = 'rgba(80,100,115,0.35)';
      for (let k = 0; k < 6; k++) x.fillRect(W / 2 - sw / 2 + (k * sw) / 5, y0, 2, y1 - y0);
    }
  }
  return c;
}

function roofCanvas() {
  const W = 512, H = 512; // 4 m x 4 m
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#cfd4d8';
  x.fillRect(0, 0, W, H);
  const ppm = W / 4;
  for (let k = 0; k < 4; k++) {
    const px = k * ppm;
    x.fillStyle = 'rgba(70,80,90,0.28)';
    x.fillRect(px, 0, 6, H);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.fillRect(px + 6, 0, 5, H);
    x.fillStyle = 'rgba(70,80,90,0.10)';
    x.fillRect(px + ppm * 0.5, 0, 3, H);
  }
  noise(x, W, H, 3000, 11, 0.04);
  return c;
}

function concreteCanvas(base, joint, seed) {
  const W = 512, H = 512; // one 6 m slab
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, W, H);
  blotches(x, W, H, 40, seed, '90,88,80', 0.08, 20, 90);
  blotches(x, W, H, 30, seed + 1, '255,255,250', 0.07, 20, 80);
  noise(x, W, H, 14000, seed + 2, 0.08);
  x.fillStyle = joint;
  x.fillRect(0, 0, W, 2);
  x.fillRect(0, 0, 2, H);
  return c;
}

function floorCanvas() {
  const W = 1024, H = 1024; // 12 m
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#cfcdc7';
  x.fillRect(0, 0, W, H);
  blotches(x, W, H, 70, 21, '140,135,125', 0.1, 40, 180);
  blotches(x, W, H, 50, 22, '255,255,255', 0.12, 30, 160);
  noise(x, W, H, 20000, 23, 0.05);
  x.fillStyle = 'rgba(90,90,90,0.35)';
  x.fillRect(0, 0, W, 2);
  x.fillRect(0, 0, 2, H);
  x.fillRect(0, H / 2, W, 1);
  x.fillRect(W / 2, 0, 1, H);
  return c;
}

function asphaltCanvas() {
  const W = 512, H = 512;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#50545a';
  x.fillRect(0, 0, W, H);
  blotches(x, W, H, 40, 31, '30,30,32', 0.15, 20, 90);
  blotches(x, W, H, 30, 32, '120,120,120', 0.08, 20, 90);
  noise(x, W, H, 30000, 33, 0.18, 2);
  return c;
}

function grassCanvas() {
  const W = 512, H = 512;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#7b8c5d';
  x.fillRect(0, 0, W, H);
  blotches(x, W, H, 60, 41, '70,90,45', 0.35, 20, 100);
  blotches(x, W, H, 40, 42, '160,160,110', 0.2, 20, 80);
  noise(x, W, H, 30000, 43, 0.12, 2);
  return c;
}

/** One truck parking bay: 4 m wide x 18 m deep, lines on the left and at the back. */
function parkingCanvas() {
  const W = 128, H = 512;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.fillRect(0, 0, 5, H);
  x.fillRect(0, 0, W, 5);
  return c;
}

function containerCanvas() {
  const W = 256, H = 256; // 1.2 m x 1.2 m
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) {
    const px = (k * W) / 4;
    x.fillStyle = 'rgba(0,0,0,0.22)';
    x.fillRect(px, 0, 10, H);
    x.fillStyle = 'rgba(0,0,0,0.08)';
    x.fillRect(px + 10, 0, 22, H);
  }
  noise(x, W, H, 2000, 51, 0.08);
  return c;
}

function loadCanvas() {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#2a2a2a';
  x.fillRect(0, 0, W, H);
  const gap = 10, lw = (W - gap * 4) / 3;
  const r = rng(61);
  for (let i = 0; i < 3; i++) {
    const x0 = gap + i * (lw + gap);
    const top = 10 + r() * 40;
    // goods (near white, tinted by instance color)
    x.fillStyle = '#f2efe8';
    x.fillRect(x0, top, lw, H * 0.8 - top);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 1; k < 4; k++) x.fillRect(x0, top + ((H * 0.8 - top) * k) / 4, lw, 2);
    for (let k = 1; k < 3; k++) x.fillRect(x0 + (lw * k) / 3, top, 2, H * 0.8 - top);
    // wooden pallet
    x.fillStyle = '#b08a5a';
    x.fillRect(x0, H * 0.8, lw, H * 0.2);
    x.fillStyle = '#3b2c1a';
    x.fillRect(x0 + lw * 0.12, H * 0.86, lw * 0.3, H * 0.1);
    x.fillRect(x0 + lw * 0.58, H * 0.86, lw * 0.3, H * 0.1);
  }
  return c;
}

function shutterCanvas() {
  const W = 128, H = 256; // 1 m x 1 m
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) {
    x.fillStyle = 'rgba(0,0,0,0.22)';
    x.fillRect(0, y, W, 3);
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.fillRect(0, y + 3, W, 2);
  }
  return c;
}

/** Curtain wall: 1.5 m mullion grid, 5 m floor-to-floor. Map (frame dark, panes white). */
function glassCanvas(emissive) {
  const W = 256, H = 768; // 1.5 m x 5 m
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = emissive ? '#ffd9a0' : '#ffffff';
  x.fillRect(0, 0, W, H);
  if (!emissive) {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.1)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  x.fillStyle = emissive ? '#000' : '#2f3740';
  x.fillRect(0, 0, 10, H); // mullion
  x.fillRect(0, 0, W, 46); // slab edge at each floor
  x.fillRect(0, H * 0.55, W, 8); // transom
  return c;
}

function fenceCanvas() {
  const W = 256, H = 256; // 2.5 m x 2.2 m
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#5b6168';
  x.fillRect(0, 0, 9, H); // post
  x.fillRect(0, 6, W, 5);
  x.fillRect(0, H - 40, W, 5);
  for (let px = 0; px < W; px += 12) x.fillRect(px, 6, 3, H - 40);
  x.fillStyle = '#9aa0a6';
  x.fillRect(0, H - 36, W, 36); // low plinth
  return c;
}

function glowCanvas() {
  const S = 128;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,240,210,1)');
  g.addColorStop(0.25, 'rgba(255,210,150,0.55)');
  g.addColorStop(1, 'rgba(255,190,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return c;
}

/** Placeholder brand panel: slanted mark + "PHUOC AN" + "PORT". Transparent background. */
export function logoCanvas(line1, line2, { background = null, dark = false } = {}) {
  const W = 2048, H = 552;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  if (background) {
    x.fillStyle = background;
    x.fillRect(0, 0, W, H);
  }
  // mark: two slanted parallelograms
  const mark = (x0, color, w) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(x0, H * 0.86);
    x.lineTo(x0 + w, H * 0.86);
    x.lineTo(x0 + w + 150, H * 0.14);
    x.lineTo(x0 + 150, H * 0.14);
    x.closePath();
    x.fill();
  };
  mark(40, '#e2622b', 120);
  mark(185, '#1d5fb8', 120);
  x.fillStyle = dark ? 'rgba(255,255,255,0.9)' : '#ffffff';
  x.beginPath();
  x.moveTo(170, H * 0.86);
  x.lineTo(196, H * 0.86);
  x.lineTo(346, H * 0.14);
  x.lineTo(320, H * 0.14);
  x.fill();
  x.fillStyle = dark ? '#ffffff' : '#1b4f9e';
  x.font = 'italic 900 250px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  x.textBaseline = 'alphabetic';
  x.fillText(line1, 520, H * 0.64);
  const w1 = x.measureText(line1).width;
  x.fillStyle = '#e2622b';
  x.font = '700 110px "Helvetica Neue", Arial, sans-serif';
  const letters = line2.split('');
  let px = 520 + w1 - letters.length * 118;
  for (const ch of letters) {
    x.fillText(ch, px, H * 0.93);
    px += 118;
  }
  return c;
}

/** Roof brand mark: two large slanted shapes, painted on the metal sheet. */
function roofMarkCanvas() {
  const W = 1024, H = 1024;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  // two slanted bars, like the brand mark (canvas x = along the building, y = across the slope)
  const bar = (x0, color) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(x0, H * 0.92);
    x.lineTo(x0 + 190, H * 0.92);
    x.lineTo(x0 + 190 + 260, H * 0.08);
    x.lineTo(x0 + 260, H * 0.08);
    x.closePath();
    x.fill();
  };
  bar(150, 'rgba(226,98,43,0.95)');
  bar(420, 'rgba(29,95,184,0.95)');
  return c;
}

/** Walking paths through the NW park (like the master plan curves). */
function parkCanvas() {
  const W = 1024, H = 1024;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.drawImage(grassCanvas(), 0, 0, W, H);
  x.strokeStyle = '#d9d6cc';
  x.lineCap = 'round';
  const arcs = [
    [W * 0.9, H * 1.05, W * 0.75],
    [W * 0.9, H * 1.05, W * 0.52],
    [W * 0.15, H * 0.2, W * 0.45],
    [W * 0.55, H * 0.35, W * 0.25],
  ];
  x.lineWidth = 14;
  for (const [cx, cy, r] of arcs) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
  }
  x.lineWidth = 10;
  x.beginPath();
  x.moveTo(0, H * 0.7);
  x.bezierCurveTo(W * 0.35, H * 0.55, W * 0.5, H * 0.9, W, H * 0.62);
  x.stroke();
  x.beginPath();
  x.moveTo(W * 0.3, 0);
  x.bezierCurveTo(W * 0.4, H * 0.4, W * 0.2, H * 0.7, W * 0.35, H);
  x.stroke();
  return c;
}

function paintCanvas(seed) {
  const W = 256, H = 256;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, W, H);
  blotches(x, W, H, 20, seed, '0,0,0', 0.05, 10, 50);
  noise(x, W, H, 6000, seed + 1, 0.06);
  return c;
}

// -----------------------------------------------------------------------------
// Materials
// -----------------------------------------------------------------------------

export function createMaterials() {
  const T = {
    claddingStrips: tex(claddingCanvas(true), { tileW: 12, tileH: 10.5, offX: 0.5, offY: -5 / 10.5 }),
    claddingStripsE: tex(claddingCanvas(true, true), { tileW: 12, tileH: 10.5, offX: 0.5, offY: -5 / 10.5 }),
    claddingPlain: tex(claddingCanvas(false), { tileW: 12, tileH: 10.5, offY: -5 / 10.5 }),
    roof: tex(roofCanvas(), { tileW: 4, tileH: 4 }),
    paving: tex(concreteCanvas('#bdbbb4', 'rgba(80,80,78,0.55)', 71), { tileW: 6, tileH: 6 }),
    floor: tex(floorCanvas(), { tileW: 12, tileH: 12, offX: 0.5, offY: 0.5 }),
    asphalt: tex(asphaltCanvas(), { tileW: 9, tileH: 9 }),
    grass: tex(grassCanvas(), { tileW: 14, tileH: 14 }),
    parking: tex(parkingCanvas(), { tileW: 4, tileH: 18 }),
    container: tex(containerCanvas(), { tileW: 1.2, tileH: 1.2 }),
    load: tex(loadCanvas(), { wrap: false }),
    shutter: tex(shutterCanvas(), { tileW: 1, tileH: 1 }),
    glass: tex(glassCanvas(false), { tileW: 1.5, tileH: 5 }),
    glassE: tex(glassCanvas(true), { tileW: 1.5, tileH: 5 }),
    fence: tex(fenceCanvas(), { tileW: 2.5, tileH: 2.2 }),
    glow: tex(glowCanvas(), { wrap: false }),
    park: tex(parkCanvas(), { wrap: false }),
    roofMark: tex(roofMarkCanvas(), { wrap: false }),
    paint: tex(paintCanvas(81), { tileW: 3, tileH: 3 }),
  };

  const std = (o) => new THREE.MeshStandardMaterial(o);

  const M = {
    T,
    // ground and site
    grass: std({ map: T.grass, roughness: 0.95 }),
    park: std({ map: T.park, roughness: 0.95 }),
    paving: std({ map: T.paving, roughness: 0.88 }),
    asphalt: std({ map: T.asphalt, roughness: 0.9 }),
    sidewalk: std({ map: T.paving, color: '#d8d4ca', roughness: 0.9 }),
    curb: std({ color: '#d9d9d4', roughness: 0.8 }),
    parking: std({ map: T.parking, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
    marking: std({ color: '#f4f4ee', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }),
    markingYellow: std({ color: '#f2c230', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }),
    fence: std({ map: T.fence, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3, transparent: false }),
    boundary: new THREE.LineBasicMaterial({ color: '#e0312b', transparent: true, opacity: 0.9 }),

    // building (shared, theme-independent)
    floor: std({ map: T.floor, roughness: 0.32, metalness: 0.0, envMapIntensity: 0.9 }),
    interior: std({ color: '#e9ebea', map: T.claddingPlain, roughness: 0.7 }),
    rc: std({ color: '#c7c6c1', map: T.paint, roughness: 0.85 }),
    firewall: std({ color: '#d7d6d1', map: T.paint, roughness: 0.85 }),
    roofUnder: std({ color: '#eef0ef', roughness: 0.8, side: THREE.DoubleSide }),
    steel: std({ color: '#6c7682', roughness: 0.5, metalness: 0.6 }),
    column: std({ color: '#8b96a3', roughness: 0.5, metalness: 0.5 }),
    trim: std({ color: '#e6e8e8', roughness: 0.4, metalness: 0.5 }),
    skylight: std({ color: '#f7fbff', roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.8, emissive: '#fff2d6', emissiveIntensity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    lamp: std({ color: '#f5f5f0', emissive: '#fff4dc', emissiveIntensity: 0.4, roughness: 0.4 }),
    dark: std({ color: '#2a2d31', roughness: 0.7 }),
    rubber: std({ color: '#1c1d1f', roughness: 0.9 }),
    yellowBlack: std({ color: '#f2c230', roughness: 0.6 }),
    leveler: std({ color: '#7d858d', roughness: 0.5, metalness: 0.6 }),
    ancWall: std({ color: '#f1f0ec', map: T.paint, roughness: 0.8 }),
    ancRoof: std({ color: '#9aa3ab', roughness: 0.6, metalness: 0.3 }),
    ancAccent: std({ color: '#e2622b', roughness: 0.6 }),
    window: std({ color: '#5f86a8', roughness: 0.15, metalness: 0.6, emissive: '#ffd49a', emissiveIntensity: 0 }),
    substation: std({ color: '#b8bec4', roughness: 0.5, metalness: 0.5 }),
    tankSlab: std({ color: '#b3b6b4', map: T.paint, roughness: 0.9 }),

    // racks
    rackUpright: std({ color: '#2d63b5', roughness: 0.45, metalness: 0.45 }),
    rackBeam: std({ color: '#ec7a22', roughness: 0.45, metalness: 0.35 }),
    rackLoad: std({ map: T.load, roughness: 0.85 }),

    // vehicles & containers
    container: std({ map: T.container, roughness: 0.6, metalness: 0.25 }),
    cab: std({ roughness: 0.35, metalness: 0.4 }),
    chassis: std({ color: '#26282b', roughness: 0.7, metalness: 0.3 }),
    tyre: std({ color: '#141414', roughness: 0.95 }),
    windshield: std({ color: '#1f2a33', roughness: 0.1, metalness: 0.8 }),
    headlight: std({ color: '#fdfdf5', emissive: '#fff6d8', emissiveIntensity: 0.2 }),
    taillight: std({ color: '#b3121b', emissive: '#ff2a2a', emissiveIntensity: 0.2 }),

    // landscape
    trunk: std({ color: '#6b5139', roughness: 0.9 }),
    leaves: std({ roughness: 0.85, flatShading: true }),
    hedge: std({ color: '#4c7a36', roughness: 0.9 }),
    pole: std({ color: '#8a9096', roughness: 0.5, metalness: 0.6 }),
    glowPoints: new THREE.PointsMaterial({ map: T.glow, size: 12, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  };
  return M;
}

/** Per-warehouse themed materials (so F1 and F2 can be highlighted independently). */
export function createThemeMaterials(T, theme) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    rcBase: std({ color: theme.accentDark, map: T.paint, roughness: 0.8 }),
    brick: std({ color: theme.light, map: T.paint, roughness: 0.85 }),
    cladding: std({ color: '#ffffff', map: T.claddingStrips, emissiveMap: T.claddingStripsE, emissive: '#ffe2b0', emissiveIntensity: 0, roughness: 0.5, metalness: 0.2 }),
    gable: std({ color: '#ffffff', map: T.claddingPlain, roughness: 0.5, metalness: 0.2 }),
    accent: std({ color: theme.accent, roughness: 0.5, metalness: 0.1 }),
    accentPanel: std({ color: theme.accent, map: T.claddingPlain, roughness: 0.5, metalness: 0.2 }),
    roof: std({ color: '#dde2e7', map: T.roof, roughness: 0.5, metalness: 0.45 }),
    door: std({ color: theme.door, map: T.shutter, roughness: 0.5, metalness: 0.4 }),
    glass: std({ color: theme.glass, map: T.glass, emissiveMap: T.glassE, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.08, metalness: 0.85 }),
    acp: std({ color: theme.accent, roughness: 0.42, metalness: 0.12 }),
  };
}
