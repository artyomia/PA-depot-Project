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
import { buildDepot } from './depot.js';
import { createUI, warehouseInfoHTML } from './ui.js';
import { m, BUILD_L, BUILD_W, clamp, lerp, easeInOut } from './util.js';
import { PerfController, detectProfile } from './perf.js';

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
  const probe = test.getContext('webgl2') || test.getContext('webgl');
  if (!probe) {
    loader.innerHTML = '<div class="webgl-error">This presentation needs WebGL. Please open it in a recent Chrome, Edge, Safari or Firefox.</div>';
    return;
  }

  // Performance: ?quality=auto|high|balanced|light (low = light), else the viewer's last choice, else auto
  const params = new URLSearchParams(location.search);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const detected = detectProfile(probe, coarse);
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  let qMode = (params.get('quality') || '').toLowerCase().replace('low', 'light');
  if (!['auto', 'high', 'balanced', 'light'].includes(qMode)) {
    try {
      qMode = localStorage.getItem('pa-twin-quality') || 'auto';
    } catch (e) {
      qMode = 'auto';
    }
  }
  const startProfile = qMode === 'auto' ? detected.profile : qMode;
  const shadowsOn = params.get('shadows') !== '0';

  // MSAA is fixed when the renderer is created: skip it when starting in the light profile
  const renderer = new THREE.WebGLRenderer({ antialias: startProfile !== 'light', powerPreference: 'high-performance' });
  // Windows (ANGLE / Direct3D) prints harmless precision notes (warning X4122) for three.js shaders;
  // keep shader log checks for development only so the presentation console stays clean.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
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

  progress(0.86, 'Container depot');
  await nextFrame();
  const depot = buildDepot(M, site.ancillary);
  scene.add(depot.statics);
  trucks.group.add(depot.yard); // containers and yard vehicles follow the Trucks & containers layer
  site.anchors.push(...depot.anchors);

  // --- Lights, sky, environment -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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

  // adaptive performance controller (profile, resolution, shadow refresh, fps cap)
  const dynamicMeshes = [];
  scene.traverse((o) => o.isMesh && o.userData.dynamic && dynamicMeshes.push(o));
  let uiRef = null;
  let lightReady = false;
  let lastProfile = null;
  const perf = new PerfController({
    renderer,
    sun,
    dynamicMeshes,
    detected: detected.profile,
    initialMode: qMode,
    onChange: (name, info) => {
      uiRef?.setPerf(info);
      if (lightReady && name !== lastProfile) applyLight(duskK, false); // clouds on / off
      lastProfile = name;
    },
  });

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
    sky.material.uniforms.cloudCoverage.value = perf.p.clouds ? lerp(D.clouds, N.clouds, k) : 0;
    perf.invalidateShadows();
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
  lightReady = true;

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
  hoverLabel.renderOrder = 1000; // above the static labels
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
      onQuality: (mode) => {
        perf.setMode(mode);
        try {
          localStorage.setItem('pa-twin-quality', mode);
        } catch (e) {
          /* storage unavailable */
        }
      },
      onMapMode: (on) => setMapMode(on),
      onPan: (x, y, down) => holdPan(x, y, down),
      onZoom: (dir) => zoomStep(dir),
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

  let racksOn = true;
  function setLayer(name, on) {
    if (name === 'racks') racksOn = on;
    if (name === 'labels') {
      labelGroup.visible = on;
      site.labels.visible = on;
    } else if (layers[name]) layers[name].visible = on;
    ui.setLayer(name, on);
    perf.invalidateShadows();
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
    perf.invalidateShadows();
  }

  // --- Map navigation: map mode, arrow pad / keys, zoom steps, bounds -------------------------
  function setMapMode(on) {
    // map mode: left drag / one finger moves the map, right drag / two fingers rotate and zoom
    controls.mouseButtons = on
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = on ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    ui.setMapMode(on);
    try {
      localStorage.setItem('pa-twin-mapmode', on ? '1' : '0');
    } catch (e) {
      /* storage unavailable */
    }
  }
  const panHold = new THREE.Vector2(); // x = screen right, y = screen up (moves the view that way)
  let panRelease = 0;
  function holdPan(x, y, down) {
    tween = null;
    if (down) {
      panHold.set(x, y);
      panRelease = performance.now() + 220; // a short tap still moves a visible step
    } else {
      const wait = Math.max(0, panRelease - performance.now());
      setTimeout(() => {
        if (panHold.x === x && panHold.y === y) panHold.set(0, 0);
      }, wait);
    }
    ui.setPreset(null);
  }
  let zoomAnim = null;
  function zoomStep(dir) {
    tween = null;
    const dist = camera.position.distanceTo(controls.target);
    const to = clamp(dist * (dir > 0 ? 0.65 : 1 / 0.65), controls.minDistance, controls.maxDistance);
    zoomAnim = { t: 0, from: dist, to };
    ui.setPreset(null);
  }
  const NB = CONFIG.navBounds;
  const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _delta = new THREE.Vector3();
  function moveView(dt) {
    const dist = camera.position.distanceTo(controls.target);
    if (panHold.lengthSq() > 0) {
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();
      _right.crossVectors(_fwd, camera.up).normalize();
      const speed = Math.max(25, dist * 0.75);
      _delta.copy(_right).multiplyScalar(panHold.x).addScaledVector(_fwd, panHold.y).multiplyScalar(speed * dt);
      controls.target.add(_delta);
      camera.position.add(_delta);
    }
    if (zoomAnim) {
      zoomAnim.t = Math.min(1, zoomAnim.t + dt / 0.35);
      const d = lerp(zoomAnim.from, zoomAnim.to, easeInOut(zoomAnim.t));
      _delta.subVectors(camera.position, controls.target).setLength(d);
      camera.position.copy(controls.target).add(_delta);
      if (zoomAnim.t >= 1) zoomAnim = null;
    }
  }
  // keep the map in view: clamp the orbit target to the project area (after damping)
  function clampView() {
    const t = controls.target;
    const cx = clamp(t.x, NB.x0, NB.x1), cz = clamp(t.z, NB.z0, NB.z1), cy = clamp(t.y, -2, 30);
    if (cx !== t.x || cy !== t.y || cz !== t.z) {
      _delta.set(cx - t.x, cy - t.y, cz - t.z);
      t.add(_delta);
      camera.position.add(_delta);
    }
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
    zoomAnim = null;
    panHold.set(0, 0);
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
  // cheap test against the building volumes (boxes) instead of raycasting thousands of triangles
  const occBoxes = Object.values(building.warehouses).map((W) => {
    const b = new THREE.Box3();
    for (const o of W.pick) if (o.material !== M.floor) b.expandByObject(o);
    b.max.y = CONFIG.levels.eave / 1000 + 1; // eave height: labels above the ridge line stay visible
    return b;
  });
  const occRay = new THREE.Ray();
  const occDir = new THREE.Vector3(), occHit = new THREE.Vector3(), occP = new THREE.Vector3();
  const occLabels = [...occludable, ...whOcclude];
  function updateOcclusion() {
    const cam = camera.position;
    for (const lbl of occLabels) {
      lbl.getWorldPosition(occP);
      const d = occDir.subVectors(occP, cam).length();
      occRay.set(cam, occDir.normalize());
      let hit = false;
      if (xray < 0.5) for (const b of occBoxes) if (!b.containsPoint(occP) && occRay.intersectBox(b, occHit) && occHit.distanceTo(cam) < d - 1) hit = true;
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
  const presetKeys = ['aerial', 'entrance', 'dock', 'insideF1', 'insideF2', 'depot', 'site'];
  const arrowKeys = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] };
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (arrowKeys[k]) {
      if (!e.repeat) holdPan(...arrowKeys[k], true);
      e.preventDefault();
      return;
    }
    if (k >= '1' && k <= '7') goTo(presetKeys[+k - 1]);
    else if (k === '+' || k === '=') zoomStep(1);
    else if (k === '-' || k === '_') zoomStep(-1);
    else if (k === 'm') setMapMode(controls.mouseButtons.LEFT !== THREE.MOUSE.PAN);
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

  window.addEventListener('keyup', (e) => {
    const a = arrowKeys[e.key.toLowerCase()];
    if (a) holdPan(a[0], a[1], false);
  });
  window.addEventListener('blur', () => panHold.set(0, 0));
  {
    let stored = null;
    try {
      stored = localStorage.getItem('pa-twin-mapmode');
    } catch (e) {
      /* storage unavailable */
    }
    setMapMode(stored === '1');
  }

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
  window.twin = { scene, camera, controls, renderer, goTo, setXray, setDusk, setLayer, select, trucks, racks, building, site, depot, perf, config: CONFIG, LIGHT, applyLight, hemi, sun, M };

  let last = performance.now();
  let occT = 1, viewShift = 0, viewShiftTarget = 0, insetT = 1, hoverT = 1;
  uiRef = ui;
  ui.setQuality(qMode);
  ui.setPerf(perf.info());
  if (!shadowsOn) renderer.shadowMap.enabled = false;
  const fwd = new THREE.Vector3();
  let started = false;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    if (!perf.shouldRender(now)) return; // fps cap in the light profile
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!paused) {
      trucks.update(dt);
      depot.update(dt);
    }
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

    moveView(dt);
    controls.update();
    clampView();

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
    hoverT += dt;
    if (pendingHover && hoverT > 1 / 15) {
      hoverT = 0;
      const o = pick(pendingHover.x, pendingHover.y);
      showHover(o && o.userData.anc !== undefined ? o.userData.anc : -1);
      cv.style.cursor = o && (o.userData.anc !== undefined || o.userData.pick) ? 'pointer' : '';
      pendingHover = null;
    }


    // centre the view in the space left free by the side panels (smooth when a panel opens / closes)
    insetT += dt;
    if (insetT > 0.15 || Math.abs(viewShift - viewShiftTarget) > 0.5) {
      if (insetT > 0.15) {
        insetT = 0;
        const ins = ui.insets();
        viewShiftTarget = Math.round((ins.left - ins.right) / 2);
      }
      viewShift += (viewShiftTarget - viewShift) * Math.min(1, dt * 6);
      if (Math.abs(viewShift - viewShiftTarget) < 0.5) viewShift = viewShiftTarget;
      const w = window.innerWidth, h = window.innerHeight;
      if (Math.abs(viewShift) < 0.5) camera.clearViewOffset();
      else camera.setViewOffset(w, h, -viewShift, 0, w, h);
    }

    occT += dt;
    if (labelGroup.visible && (occT > 0.2 || tween)) {
      occT = 0;
      updateOcclusion();
    }

    // racks are hidden by the roof from outside: only draw them when they can be seen
    // (x-ray, camera inside, or close enough to look in through the dock doors)
    {
      const c = camera.position;
      const dx = Math.max(0, Math.abs(c.x) - BUILD_W / 2), dz = Math.max(0, Math.abs(c.z) - BUILD_L / 2);
      racks.visible = racksOn && (xray > 0.01 || Math.hypot(dx, dz) < 70);
    }

    perf.beforeRender();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    perf.afterRender(now); // adaptive resolution / profile

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
