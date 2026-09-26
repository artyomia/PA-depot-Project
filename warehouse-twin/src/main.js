import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CONFIG } from './config.js';
import { createMaterials, createThemeMaterials, setAnisotropy } from './materials.js';
import { buildSite } from './site.js';
import { buildBuilding } from './building.js';
import { buildDocks, doorList } from './docks.js';
import { buildRacks } from './racks.js';
import { buildTrucks } from './trucks.js';
import { createUI, warehouseInfoHTML } from './ui.js';
import { m, BUILD_L, BUILD_W, clamp, lerp, easeInOut } from './util.js';

const app = document.getElementById('app');
const loader = document.getElementById('loader');
const bar = loader.querySelector('.bar i');
const statusEl = loader.querySelector('.s');
const progress = (p, text) => {
  bar.style.width = `${Math.round(p * 100)}%`;
  if (text) statusEl.textContent = text;
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Lighting presets (interpolated by k: 0 = day, 1 = dusk)
const LIGHT = {
  day: {
    elev: 44, azim: 72, sun: '#fff1de', sunI: 3.4, hemiSky: '#d6e4f5', hemiGround: '#8a826e', hemiI: 0.42, env: 0.5,
    exposure: 0.75, turbidity: 2.6, rayleigh: 0.9, mie: 0.004, mieG: 0.8, fog: '#dfe6ea', clouds: 0.32,
  },
  dusk: {
    // blue hour: sun just below the horizon for the sky, a low warm key light for the facades
    elev: 5, skyElev: -1.5, azim: 292, sun: '#ffa36a', sunI: 0.9, hemiSky: '#7a88b8', hemiGround: '#22242c', hemiI: 1.4, env: 0.12,
    exposure: 1.3, turbidity: 3, rayleigh: 2.5, mie: 0.01, mieG: 0.88, fog: '#4a5272', clouds: 0.22,
  },
};

function sunDir(elev, azim) {
  const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(azim);
  // azimuth measured clockwise from north (-z)
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

async function main() {
  // --- WebGL check -------------------------------------------------------------------
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) {
    loader.innerHTML = '<div class="webgl-error">This presentation needs WebGL. Please open it in a recent Chrome, Edge, Safari or Firefox.</div>';
    return;
  }

  // URL options: ?quality=low|high  &shadows=0  &dpr=1.5
  const params = new URLSearchParams(location.search);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const q = params.get('quality');
  const lowPower = q === 'low' || (q !== 'high' && (coarse || (navigator.hardwareConcurrency || 8) <= 4));
  const shadowsOn = params.get('shadows') !== '0';
  const maxDpr = params.get('dpr') ? +params.get('dpr') : Math.min(window.devicePixelRatio || 1, lowPower ? 1.6 : 2);
  let dpr = maxDpr;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
  renderer.toneMapping = TONE[params.get('tm')] ?? THREE.NeutralToneMapping;
  const expMul = params.get('exp') ? +params.get('exp') : 1;
  renderer.shadowMap.enabled = shadowsOn;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  app.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = 'labels-layer';
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 12000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.minDistance = 3;
  controls.maxDistance = 1700;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.7;

  // --- Build the model -----------------------------------------------------------------
  progress(0.08, 'Preparing materials');
  await nextFrame();
  const M = createMaterials();
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const TH = {};
  for (const wh of CONFIG.building.warehouses) TH[wh.id] = createThemeMaterials(M.T, wh.theme);

  progress(0.22, 'Site, roads and truck yard');
  await nextFrame();
  const site = buildSite(M);
  scene.add(site.group, site.landscape, site.labels);

  progress(0.42, 'Warehouses F1 and F2');
  await nextFrame();
  const docks = buildDocks(M, TH);
  const building = buildBuilding(M, TH);
  scene.add(building.group, docks.group);

  progress(0.62, 'Pallet racking');
  await nextFrame();
  const racks = buildRacks(M);
  scene.add(racks);

  progress(0.78, 'Trucks and containers');
  await nextFrame();
  const trucks = buildTrucks(M, docks.doors, site.parkingBays, site.evBays);
  scene.add(trucks.group);

  // --- Lights, sky, environment -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 2048 : 4096, lowPower ? 2048 : 4096);
  const sc = sun.shadow.camera;
  sc.left = -235;
  sc.right = 235;
  sc.top = 235;
  sc.bottom = -235;
  sc.near = 10;
  sc.far = 1600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.12;
  sun.shadow.radius = 2.5;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const sky = new Sky();
  sky.scale.setScalar(5000);
  scene.add(sky);
  const skyEnv = new Sky();
  skyEnv.scale.setScalar(1000);
  skyEnv.material.uniforms.cloudCoverage.value = 0;
  skyEnv.material.uniforms.showSunDisc.value = 0; // the directional light is the sun; keep it out of the env map
  const envScene = new THREE.Scene();
  envScene.add(skyEnv);
  // dark ground below the horizon so undersides and interiors are not lit by 'sky'
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6b6a60' }));
  envGround.position.y = -8;
  envScene.add(envGround);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  scene.fog = new THREE.Fog('#e3eaee', 900, 5200);

  const dirOf = (L) => sunDir(L.elev, L.azim);
  const skyDirOf = (L) => sunDir(L.skyElev ?? L.elev, L.azim);
  const tmpC = new THREE.Color();
  const tmpC2 = new THREE.Color();
  const lerpColor = (a, b, k) => tmpC.set(a).lerp(tmpC2.set(b), k);
  let duskK = 0, duskTarget = 0, lastEnvK = -1, envTimer = 0;

  function applyLight(k, forceEnv = false) {
    const D = LIGHT.day, N = LIGHT.dusk;
    const dir = new THREE.Vector3().lerpVectors(dirOf(D), dirOf(N), easeInOut(k)).normalize();
    const skyDir = new THREE.Vector3().lerpVectors(skyDirOf(D), skyDirOf(N), easeInOut(k)).normalize();
    if (dir.y < 0.03) dir.y = 0.03;
    sun.position.copy(dir).multiplyScalar(700);
    sun.color.copy(lerpColor(D.sun, N.sun, k));
    sun.intensity = lerp(D.sunI, N.sunI, k);
    hemi.color.copy(lerpColor(D.hemiSky, N.hemiSky, k));
    hemi.groundColor.copy(lerpColor(D.hemiGround, N.hemiGround, k));
    hemi.intensity = lerp(D.hemiI, N.hemiI, k);
    scene.environmentIntensity = lerp(D.env, N.env, k);
    envGround.material.color.copy(lerpColor('#6b6a60', '#1c1c22', k));
    renderer.toneMappingExposure = lerp(D.exposure, N.exposure, k) * expMul;
    scene.fog.color.copy(lerpColor(D.fog, N.fog, k));
    for (const s of [sky, skyEnv]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(skyDir);
      u.turbidity.value = lerp(D.turbidity, N.turbidity, k);
      u.rayleigh.value = lerp(D.rayleigh, N.rayleigh, k);
      u.mieCoefficient.value = lerp(D.mie, N.mie, k);
      u.mieDirectionalG.value = lerp(D.mieG, N.mieG, k);
    }
    sky.material.uniforms.cloudCoverage.value = lerp(D.clouds, N.clouds, k);
    // emissive accents: lamps, glass, wall light strips, skylights
    const e = clamp((k - 0.25) / 0.75, 0, 1);
    M.lamp.emissiveIntensity = lerp(0.5, 2.6, e);
    M.glowPoints.opacity = e;
    M.window.emissiveIntensity = lerp(0, 0.9, e);
    M.skylight.emissiveIntensity = lerp(0, 0.45, e);
    for (const g of building.officeGlass) g.emissiveIntensity = lerp(0, 1.1, e);
    for (const t of Object.values(TH)) t.cladding.emissiveIntensity = lerp(0, 0.55, e);
    trucks.setDusk(e);
    if (forceEnv || Math.abs(k - lastEnvK) > 0.2) {
      lastEnvK = k;
      const rt = pmrem.fromScene(envScene, 0.02, 1, 3000);
      scene.environment = rt.texture;
      if (envRT) envRT.dispose();
      envRT = rt;
    }
  }
  applyLight(0, true);

  // --- Labels ----------------------------------------------------------------------------------
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  const mkLabel = (html, cls, pos) => {
    const div = document.createElement('div');
    div.className = `lbl3d ${cls}`;
    div.innerHTML = html;
    const o = new CSS2DObject(div);
    o.position.set(...pos);
    labelGroup.add(o);
    return o;
  };
  const occludable = [];
  for (const a of site.anchors) occludable.push(mkLabel(a.text, a.cls, a.pos));
  const whLabels = {};
  const whOcclude = [];
  for (const wh of CONFIG.building.warehouses) {
    const W = building.warehouses[wh.id];
    const lbl = mkLabel(`<b>${wh.id}</b><span>${fmt(wh.areaM2)} m²</span>`, 'wh', [0, 24, W.center.z]);
    lbl.element.style.background = wh.theme.accent;
    lbl.element.addEventListener('pointerdown', (e) => e.stopPropagation());
    lbl.element.addEventListener('click', (e) => {
      e.stopPropagation();
      select(wh.id);
    });
    whLabels[wh.id] = lbl;
    whOcclude.push(lbl);
  }
  // hover label (ancillary buildings)
  const hoverDiv = document.createElement('div');
  hoverDiv.className = 'lbl3d hover';
  const hoverLabel = new CSS2DObject(hoverDiv);
  hoverLabel.visible = false;
  scene.add(hoverLabel);
  const hoverBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0.95, depthTest: false }),
  );
  hoverBox.renderOrder = 20;
  hoverBox.visible = false;
  scene.add(hoverBox);

  // --- UI --------------------------------------------------------------------------------------
  const doors = doorList();
  const dockCount = (id, side) => doors.filter((d) => d.warehouse === id && (!side || d.side === side)).length;
  const footprint = (BUILD_L * BUILD_W);
  const figures = [
    { label: 'Site area', value: fmt(CONFIG.site.areaM2), unit: 'm²', cls: 'span' },
    { label: 'Building footprint', value: fmt(footprint), unit: 'm²', cls: 'span' },
    { label: 'Warehouse F1', value: fmt(CONFIG.building.warehouses[0].areaM2), unit: 'm²', cls: 'f1' },
    { label: 'Warehouse F2', value: fmt(CONFIG.building.warehouses[1].areaM2), unit: 'm²', cls: 'f2' },
    { label: 'Clear height', value: fmt(m(CONFIG.levels.clearHeight)), unit: 'm' },
    { label: 'Loading docks', value: String(doors.length), unit: 'doors' },
    { label: 'Dimensions', value: `${fmt(BUILD_L, 1)} x ${fmt(BUILD_W)}`, unit: 'm', cls: 'span' },
  ];

  let paused = false;
  let selected = null;
  const layers = { racks: racks, trucks: trucks.group, landscape: site.landscape, labels: null };
  const ui = createUI(
    document.body,
    {
      onPreset: (p) => goTo(p),
      onXray: (on) => setXray(on),
      onDusk: (on) => setDusk(on),
      onLayer: (name, on) => setLayer(name, on),
      onPause: () => {
        paused = !paused;
        ui.setPaused(paused);
      },
      onCloseInfo: () => select(null),
      onFullscreen: () => {
        const d = document;
        if (!d.fullscreenElement && !d.webkitFullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen)?.call(d.documentElement);
        else (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
      },
    },
    figures,
  );

  function setLayer(name, on) {
    if (name === 'labels') {
      labelGroup.visible = on;
      site.labels.visible = on;
    } else if (layers[name]) layers[name].visible = on;
    ui.setLayer(name, on);
  }

  let xray = 0, xrayTarget = 0;
  function setXray(on, instant = false) {
    xrayTarget = on ? 1 : 0;
    ui.setXray(on);
    if (instant) {
      xray = xrayTarget;
      applyXray(xray);
    }
  }
  function setDusk(on, instant = false) {
    duskTarget = on ? 1 : 0;
    ui.setDusk(on);
    if (instant) {
      duskK = duskTarget;
      applyLight(duskK, true);
    }
  }

  function select(id) {
    selected = id;
    for (const [k, W] of Object.entries(building.warehouses)) W.selection.visible = k === id;
    if (!id) {
      ui.hideInfo();
      return;
    }
    const wh = CONFIG.building.warehouses.find((w) => w.id === id);
    ui.showInfo(warehouseInfoHTML(wh, dockCount(id, 'east'), dockCount(id, 'west')), wh.theme.accent);
  }

  // --- X-ray ---------------------------------------------------------------------------------
  const roofCasters = [];
  for (const W of Object.values(building.warehouses)) roofCasters.push(...W.pick.filter((o) => building.xrayMats.includes(o.material)));
  // remember the resting state of every x-ray material (decals and skylights stay transparent)
  const xrayMats = [...building.xrayMats, M.skylight];
  M.skylight.userData.xrayMin = 0.1;
  for (const mat of xrayMats) {
    mat.userData.keepTransparent = mat.transparent;
    mat.userData.baseOpacity = mat.opacity;
    mat.userData.baseDepthWrite = mat.depthWrite;
  }
  function applyXray(x) {
    for (const mat of xrayMats) {
      const wantT = mat.userData.keepTransparent || x > 0.001;
      if (mat.transparent !== wantT) {
        mat.transparent = wantT;
        mat.needsUpdate = true;
      }
      mat.opacity = mat.userData.baseOpacity * lerp(1, mat.userData.xrayMin ?? 0.1, x);
      mat.depthWrite = mat.userData.baseDepthWrite && x < 0.5;
    }
    const inside = x > 0.5;
    for (const o of roofCasters) o.castShadow = !inside;
    for (const o of racks.userData.casters) o.castShadow = inside;
    building.lamps.visible = !inside;
  }

  // --- Camera presets ------------------------------------------------------------------------
  let tween = null;
  function goTo(name, dur = 1.9) {
    const p = CONFIG.cameras[name];
    if (!p) return;
    const toPos = new THREE.Vector3(...p.pos);
    const toTgt = new THREE.Vector3(...p.target);
    const dist = camera.position.distanceTo(toPos);
    const inside = (v) => Math.abs(v.x) < BUILD_W / 2 && Math.abs(v.z) < BUILD_L / 2 && v.y < 16;
    const lift = inside(toPos) || inside(camera.position) ? 0 : Math.min(120, dist * 0.18);
    tween = { t: 0, dur, fromPos: camera.position.clone(), fromTgt: controls.target.clone(), toPos, toTgt, lift };
    ui.setPreset(name);
    if (name.startsWith('inside') && xrayTarget) setXray(false);
  }
  controls.addEventListener('start', () => {
    if (tween) tween = null;
    ui.setPreset(null);
    ui.hideHint();
  });
  setTimeout(() => ui.hideHint(), 20000);

  // intro: start far out and glide into the aerial view
  const A = CONFIG.cameras.aerial;
  camera.position.set(A.pos[0] * 1.9, A.pos[1] * 1.6, A.pos[2] * 1.9);
  controls.target.set(...A.target);
  controls.update();

  // --- Label occlusion: hide site labels that sit behind the buildings ----------------------
  const occluders = [];
  for (const W of Object.values(building.warehouses)) occluders.push(...W.pick.filter((o) => o.material !== M.floor));
  const occRay = new THREE.Raycaster();
  const occDir = new THREE.Vector3();
  function updateOcclusion() {
    const cam = camera.position;
    for (const lbl of [...occludable, ...whOcclude]) {
      const p = lbl.getWorldPosition(new THREE.Vector3());
      const d = occDir.subVectors(p, cam).length();
      occRay.set(cam, occDir.normalize());
      occRay.far = d - 1;
      const hit = xray < 0.5 && occRay.intersectObjects(occluders, false).length > 0;
      lbl.element.classList.toggle('occluded', hit || d > 1500);
    }
  }

  // --- Picking -------------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [];
  for (const W of Object.values(building.warehouses)) pickables.push(...W.pick);
  building.group.traverse((o) => {
    if (o.isMesh && o.userData.pick && !pickables.includes(o)) pickables.push(o);
  });
  const ancMeshes = [];
  for (const a of site.ancillary) a.group.traverse((o) => o.isMesh && ancMeshes.push(o));
  pickables.push(...ancMeshes);

  const visibleChain = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    for (const h of hits) if (visibleChain(h.object)) return h.object;
    return null;
  }

  let hovered = -1;
  function showHover(idx) {
    if (idx === hovered) return;
    hovered = idx;
    if (idx < 0) {
      hoverLabel.visible = hoverBox.visible = false;
      return;
    }
    const a = site.ancillary[idx];
    const b = a.box;
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    hoverBox.scale.set(size.x + 0.6, size.y + 0.6, size.z + 0.6);
    hoverBox.position.copy(c);
    hoverDiv.innerHTML = `${a.info.name}<small>${a.info.size}</small>`;
    hoverLabel.position.set(c.x, b.max.y + 1.2, c.z);
    hoverLabel.visible = hoverBox.visible = true;
  }

  let pendingHover = null;
  let down = null;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  cv.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 6 || !quick) return;
    const o = pick(e.clientX, e.clientY);
    if (o && o.userData.anc !== undefined) {
      showHover(o.userData.anc);
      return;
    }
    if (e.pointerType !== 'mouse') showHover(-1);
    if (o && o.userData.pick) select(o.userData.pick === selected ? null : o.userData.pick);
    else select(null);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && e.buttons === 0) pendingHover = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointerleave', () => {
    pendingHover = null;
    showHover(-1);
  });

  // --- Keyboard shortcuts -----------------------------------------------------------------------
  const presetKeys = ['aerial', 'entrance', 'dock', 'insideF1', 'insideF2'];
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') goTo(presetKeys[+k - 1]);
    else if (k === 'x') setXray(!xrayTarget);
    else if (k === 'd') setDusk(!duskTarget);
    else if (k === 'l') setLayer('labels', !labelGroup.visible);
    else if (k === 'c') ui.toggleControls();
    else if (k === ' ') {
      paused = !paused;
      ui.setPaused(paused);
      e.preventDefault();
    } else if (k === 'escape') select(null);
  });

  // --- Resize --------------------------------------------------------------------------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 55 : 42;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- First render and warm-up ---------------------------------------------------------------
  progress(0.92, 'Compiling shaders');
  await nextFrame();
  renderer.compile(scene, camera);
  progress(1, 'Ready');

  // expose for debugging / automated screenshots
  window.twin = { scene, camera, controls, renderer, goTo, setXray, setDusk, setLayer, select, trucks, racks, building, site, config: CONFIG, LIGHT, applyLight, hemi, sun, M };

  let last = performance.now();
  let frames = 0, acc = 0, shadowTick = 0, occT = 1;
  // low power devices refresh the (moving truck) shadows every second frame
  if (lowPower) renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const fwd = new THREE.Vector3();
  let started = false;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!paused) trucks.update(dt);
    sky.material.uniforms.time.value += dt;

    // camera tween
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const e = easeInOut(tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      camera.position.y += Math.sin(Math.PI * e) * tween.lift;
      controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
      if (tween.t >= 1) tween = null;
    }

    // x-ray fade
    if (Math.abs(xray - xrayTarget) > 1e-3) {
      xray += Math.sign(xrayTarget - xray) * Math.min(Math.abs(xrayTarget - xray), dt * 2.2);
      applyXray(xray);
    }
    // day / dusk transition
    if (Math.abs(duskK - duskTarget) > 1e-3) {
      duskK += Math.sign(duskTarget - duskK) * Math.min(Math.abs(duskTarget - duskK), dt * 0.6);
      envTimer += dt;
      const end = Math.abs(duskK - duskTarget) <= 1e-3;
      applyLight(duskK, end);
    }
    // selection pulse
    if (selected) {
      const s = building.warehouses[selected].selection;
      s.userData.fill.material.opacity = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(performance.now() / 350));
    }

    controls.update();

    // adaptive near plane: better depth precision when zoomed out
    const dist = camera.position.distanceTo(controls.target);
    const near = clamp(dist * 0.004, 0.25, 4);
    if (Math.abs(near - camera.near) > 0.01) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }

    // compass
    camera.getWorldDirection(fwd);
    ui.setCompass(-THREE.MathUtils.radToDeg(Math.atan2(fwd.x, -fwd.z)));

    // hover picking (mouse)
    if (pendingHover) {
      const o = pick(pendingHover.x, pendingHover.y);
      showHover(o && o.userData.anc !== undefined ? o.userData.anc : -1);
      cv.style.cursor = o && (o.userData.anc !== undefined || o.userData.pick) ? 'pointer' : '';
      pendingHover = null;
    }

    if (lowPower && ++shadowTick % 2 === 0) renderer.shadowMap.needsUpdate = true;

    occT += dt;
    if (labelGroup.visible && (occT > 0.2 || tween)) {
      occT = 0;
      updateOcclusion();
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);

    // adaptive resolution if the device struggles
    frames++;
    acc += dt;
    if (acc > 2.5) {
      const avg = acc / frames;
      if (avg > 0.04 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
      }
      frames = 0;
      acc = 0;
    }

    if (!started) {
      started = true;
      loader.classList.add('hide');
      setTimeout(() => loader.remove(), 800);
      goTo('aerial', 2.6);
    }
  });
}

main().catch((err) => {
  console.error(err);
  statusEl.textContent = 'Something went wrong while building the model. See the console for details.';
});
