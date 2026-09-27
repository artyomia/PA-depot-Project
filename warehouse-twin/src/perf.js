/**
 * Performance profiles and the adaptive quality controller.
 *
 *   high      full resolution (up to 2x), 4096 shadow map refreshed every frame, clouds
 *   balanced  resolution up to 1.25x, 2048 shadow map refreshed every 2nd frame, clouds
 *   light     resolution 1x (can drop to 0.7x), static shadows (moving vehicles cast none),
 *             no clouds, no MSAA, steady 30 fps cap (even frame pacing feels smoother than 40 to 50 jumping)
 *
 * "auto" picks the starting profile from the GPU name and then watches the real frame rate:
 * it first lowers the render resolution a little, and steps down one profile if that is not enough.
 */

export const PROFILES = {
  high: { label: 'High', dprCap: 2, minDpr: 1, shadowSize: 4096, shadowEvery: 1, clouds: true, dynamicShadows: true, fpsCap: 0 },
  balanced: { label: 'Balanced', dprCap: 1.25, minDpr: 0.85, shadowSize: 2048, shadowEvery: 2, clouds: true, dynamicShadows: true, fpsCap: 0 },
  light: { label: 'Light', dprCap: 1, minDpr: 0.7, shadowSize: 2048, shadowEvery: 0, clouds: false, dynamicShadows: false, fpsCap: 30 },
};
const ORDER = ['high', 'balanced', 'light'];

/** Starting profile from the GPU / device (before any frame has been measured). */
export function detectProfile(gl, coarse) {
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) {
    /* renderer info unavailable */
  }
  name = String(name);
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name)) return { profile: 'light', gpu: name };
  const integrated = /intel|uhd|iris|hd graphics|mali|adreno|powervr|vivante|radeon\(tm\) graphics|vega \d+ graphics/i.test(name) && !/\barc\b/i.test(name);
  if (integrated || coarse || (navigator.hardwareConcurrency || 8) <= 4) return { profile: 'balanced', gpu: name };
  return { profile: 'high', gpu: name };
}

export class PerfController {
  /**
   * @param {object} o
   *   renderer, sun, dynamicMeshes (moving vehicles), onChange(profileName, info), initialMode, detected
   */
  constructor(o) {
    Object.assign(this, o);
    this.mode = o.initialMode; // 'auto' | 'high' | 'balanced' | 'light'
    this.profileName = this.mode === 'auto' ? o.detected : this.mode;
    this.p = PROFILES[this.profileName];
    this.dpr = Math.min(window.devicePixelRatio || 1, this.p.dprCap);
    this.lastRender = 0;
    this.tick = 0;
    this.shadowDirty = true;
    // frame-rate window
    this.winStart = 0;
    this.winFrames = 0;
    this.goodWindows = 0;
    this.warmup = performance.now() + 3500; // ignore shader compile hitches after load
    this.fps = 0;
    this.apply();
  }

  setMode(mode) {
    this.mode = mode;
    this.profileName = mode === 'auto' ? this.detected : mode;
    this.p = PROFILES[this.profileName];
    this.dpr = Math.min(window.devicePixelRatio || 1, this.p.dprCap);
    this.warmup = performance.now() + 1500;
    this.goodWindows = 0;
    this.apply();
  }

  apply() {
    const { renderer, sun, p } = this;
    renderer.setPixelRatio(this.dpr);
    if (sun.shadow.mapSize.x !== p.shadowSize) {
      sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    renderer.shadowMap.autoUpdate = false; // updates are driven by beforeRender()
    for (const m of this.dynamicMeshes) m.castShadow = p.dynamicShadows;
    this.shadowDirty = true;
    this.onChange?.(this.profileName, this.info());
  }

  info() {
    return { mode: this.mode, profile: this.profileName, label: this.p.label, dpr: this.dpr, fps: this.fps };
  }

  /** Something that affects shadows changed (light, x-ray, layers): refresh the shadow map once. */
  invalidateShadows() {
    this.shadowDirty = true;
  }

  /** Frame-rate cap: returns false when this animation frame should be skipped. */
  shouldRender(now) {
    const cap = this.p.fpsCap;
    if (cap && this.lastRender && now - this.lastRender < 1000 / cap - 4) return false;
    this.lastRender = now;
    return true;
  }

  beforeRender() {
    const every = this.p.shadowEvery;
    this.tick++;
    if (this.shadowDirty || (every > 0 && this.tick % every === 0)) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
  }

  /** Called once per rendered frame; adapts resolution and (in auto mode) the profile. */
  afterRender(now) {
    if (now < this.warmup) {
      this.winStart = now;
      this.winFrames = 0;
      return;
    }
    this.winFrames++;
    const span = now - this.winStart;
    if (span < 2000) return;
    this.fps = (this.winFrames * 1000) / span;
    this.winStart = now;
    this.winFrames = 0;
    const target = this.p.fpsCap || 60;
    if (this.fps < target * 0.75) {
      this.goodWindows = 0;
      if (this.dpr > this.p.minDpr + 0.01) {
        this.dpr = Math.max(this.p.minDpr, +(this.dpr - 0.15).toFixed(2));
        this.renderer.setPixelRatio(this.dpr);
      } else if (this.mode === 'auto' && this.profileName !== 'light') {
        this.profileName = ORDER[ORDER.indexOf(this.profileName) + 1];
        this.p = PROFILES[this.profileName];
        this.dpr = Math.min(this.dpr, this.p.dprCap);
        this.warmup = now + 1500;
        this.apply();
        return;
      }
    } else if (this.fps > target * 0.93) {
      // plenty of headroom for a while: win back resolution (never above the profile cap)
      if (++this.goodWindows >= 3 && this.dpr < Math.min(window.devicePixelRatio || 1, this.p.dprCap) - 0.01) {
        this.dpr = Math.min(Math.min(window.devicePixelRatio || 1, this.p.dprCap), +(this.dpr + 0.1).toFixed(2));
        this.renderer.setPixelRatio(this.dpr);
        this.goodWindows = 0;
      }
    } else this.goodWindows = 0;
    this.onChange?.(this.profileName, this.info());
  }
}
