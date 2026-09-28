import { CONFIG } from './config.js';
import { logoSVG } from './logo.js';

/**
 * DOM overlay: brand, view presets, display + layer toggles, key figures,
 * info card, hover label element, compass and loader. Pure DOM, no framework.
 */

const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const ICONS = {
  aerial: '<svg viewBox="0 0 24 24"><path d="M3 17l9-10 9 10" /><path d="M7 17h10" /></svg>',
  entrance: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="1"/><path d="M10 20v-6h4v6"/></svg>',
  dock: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="12" height="7" rx="1"/><path d="M14 11h4l3 3v2h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  inside: '<svg viewBox="0 0 24 24"><path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-8M12 20v-8M16 20v-8"/></svg>',
  depot: '<svg viewBox="0 0 24 24"><rect x="3" y="12" width="8" height="7"/><rect x="13" y="12" width="8" height="7"/><rect x="8" y="5" width="8" height="7"/></svg>',
  site: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-5.5a1.5 1.5 0 0 1 3 0V10m0-3.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5"/></svg>',
};

export function createUI(root, handlers, figures) {
  const P = CONFIG.project;
  const el = document.createElement('div');
  el.className = 'ui';
  el.innerHTML = `
    <div class="col left">
    <header class="panel brand">
      <div class="brand-mark" aria-hidden="true">${logoSVG()}</div>
      <div class="brand-text">
        <div class="brand-title">${P.title}</div>
        <div class="brand-sub">${P.subtitle}</div>
        <div class="brand-loc">${P.location}</div>
      </div>
      <button class="icon-btn menu-btn" data-act="menu" aria-label="Collapse the control panel" aria-expanded="true" title="Collapse / expand the control panel (C)">
        <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>
      </button>
    </header>

    <aside class="panel controls" id="controls">
      <section>
        <h3>Views</h3>
        <div class="views">
          <button data-preset="aerial">${ICONS.aerial}<span>Aerial</span><kbd>1</kbd></button>
          <button data-preset="entrance">${ICONS.entrance}<span>Front entrance</span><kbd>2</kbd></button>
          <button data-preset="dock">${ICONS.dock}<span>Dock side</span><kbd>3</kbd></button>
          <button data-preset="insideF1">${ICONS.inside}<span>Inside F1</span><kbd>4</kbd></button>
          <button data-preset="insideF2">${ICONS.inside}<span>Inside F2</span><kbd>5</kbd></button>
          <button data-preset="depot">${ICONS.depot}<span>Container depot</span><kbd>6</kbd></button>
          <button data-preset="site">${ICONS.site}<span>Whole site</span><kbd>7</kbd></button>
        </div>
      </section>
      <section>
        <h3>Display</h3>
        <label class="switch"><input type="checkbox" data-toggle="mapmode"><span class="track"></span><span class="lbl">Map mode <small>drag to move the map</small></span><kbd>M</kbd></label>
        <label class="switch"><input type="checkbox" data-toggle="xray"><span class="track"></span><span class="lbl">X-ray <small>roof &amp; upper walls</small></span><kbd>X</kbd></label>
        <div class="seg" role="group" aria-label="Lighting">
          <button data-light="day" class="on">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>Day</button>
          <button data-light="dusk">
            <svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>Dusk</button>
        </div>
        <div class="perf">
          <div class="perf-head"><span>Performance</span><span class="fps" id="fps" title="Measured frame rate and render resolution">...</span></div>
          <div class="seg seg4" role="group" aria-label="Performance">
            <button data-q="auto" title="Adapts to this computer automatically">Auto</button>
            <button data-q="high" title="Full resolution and live shadows (strong graphics card)">High</button>
            <button data-q="balanced" title="Lower resolution, shadows updated every 2nd frame">Balanced</button>
            <button data-q="light" title="For modest laptops: static shadows, no clouds, steady 30 fps">Light</button>
          </div>
        </div>
      </section>
      <section>
        <h3>Layers</h3>
        <label class="switch"><input type="checkbox" data-layer="racks" checked><span class="track"></span><span class="lbl">Racks</span></label>
        <label class="switch"><input type="checkbox" data-layer="trucks" checked><span class="track"></span><span class="lbl">Trucks &amp; containers</span></label>
        <label class="switch"><input type="checkbox" data-layer="landscape" checked><span class="track"></span><span class="lbl">Landscaping</span></label>
        <label class="switch"><input type="checkbox" data-layer="labels" checked><span class="track"></span><span class="lbl">Labels</span></label>
      </section>
      <section class="anim">
        <button class="wide" data-act="pause"><svg viewBox="0 0 24 24" class="i-pause"><path d="M8 5v14M16 5v14"/></svg><svg viewBox="0 0 24 24" class="i-play"><path d="M7 5l12 7-12 7z"/></svg><span>Pause truck loop</span></button>
        <button class="wide ghost" data-act="fullscreen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Full screen</span></button>
      </section>
    </aside>
    </div>
    <div class="col right">

    <aside class="panel figures" id="figures">
      <h3>Key figures <button class="icon-btn fig-toggle" data-act="figs" aria-label="Collapse key figures"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button></h3>
      <div class="tiles">
        ${figures
          .map(
            (f) => `<div class="tile ${f.cls || ''}"><div class="v">${f.value}<small>${f.unit || ''}</small></div><div class="k">${f.label}</div></div>`,
          )
          .join('')}
      </div>
    </aside>

    <div class="panel info" id="info" hidden>
      <button class="icon-btn close" data-act="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="info-body"></div>
    </div>
    </div>


    <div class="nav" role="group" aria-label="Map navigation">
      <div class="nav-items">
        <button class="nb" data-act="home" title="Fit the whole site" aria-label="Fit the whole site">${ICONS.site}</button>
        <span class="nav-sep"></span>
        <button class="nb" data-pan="-1,0" title="Move left (arrow key)" aria-label="Move map left"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="nb" data-pan="0,1" title="Move up (arrow key)" aria-label="Move map up"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="nb" data-pan="0,-1" title="Move down (arrow key)" aria-label="Move map down"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="nb" data-pan="1,0" title="Move right (arrow key)" aria-label="Move map right"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
        <span class="nav-sep"></span>
        <button class="nb" data-zoom="1" title="Zoom in (+)" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
        <button class="nb" data-zoom="-1" title="Zoom out (-)" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
        <span class="nav-sep"></span>
        <button class="nb" data-act="mapmode" title="Map mode: drag to move the map (M)" aria-label="Map mode">${ICONS.hand}</button>
      </div>
      <div class="compass" title="North">
        <div class="needle"><span>N</span></div>
      </div>
      <button class="nb nav-toggle" data-act="navtoggle" title="Show / hide the navigation buttons (N)" aria-label="Hide navigation buttons" aria-expanded="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <div class="hint">Drag to orbit &nbsp;|&nbsp; right-drag, two fingers or the arrows to move the map &nbsp;|&nbsp; scroll or pinch to zoom &nbsp;|&nbsp; click F1 or F2 for details</div>
  `;
  root.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const $$ = (s) => [...el.querySelectorAll(s)];
  const controls = $('#controls');
  const figs = $('#figures');
  const info = $('#info');
  const needle = $('.compass .needle');

  // collapsible control panel (remembered per browser; collapsed by default on small screens)
  const small = () => window.innerWidth < 900;
  const menuBtn = $('[data-act="menu"]');
  const setCollapsed = (on, remember = true) => {
    controls.classList.toggle('collapsed', on);
    el.classList.toggle('ctl-collapsed', on);
    menuBtn.setAttribute('aria-expanded', String(!on));
    menuBtn.setAttribute('aria-label', on ? 'Expand the control panel' : 'Collapse the control panel');
    if (remember && !small()) {
      try {
        localStorage.setItem('pa-twin-controls', on ? 'collapsed' : 'open');
      } catch (e) {
        /* storage unavailable */
      }
    }
  };
  let stored = null;
  try {
    stored = localStorage.getItem('pa-twin-controls');
  } catch (e) {
    /* storage unavailable */
  }
  setCollapsed(small() || stored === 'collapsed', false);
  figs.classList.add('collapsed'); // key figures start collapsed; the chevron opens them

  // navigation bar: collapsible (remembered per browser)
  const nav = $('.nav');
  const navBtn = $('[data-act="navtoggle"]');
  const setNav = (open, remember = true) => {
    nav.classList.toggle('closed', !open);
    navBtn.setAttribute('aria-expanded', String(open));
    navBtn.setAttribute('aria-label', open ? 'Hide navigation buttons' : 'Show navigation buttons');
    if (remember) {
      try {
        localStorage.setItem('pa-twin-nav', open ? 'open' : 'closed');
      } catch (e) {
        /* storage unavailable */
      }
    }
  };
  {
    let st = null;
    try {
      st = localStorage.getItem('pa-twin-nav');
    } catch (e) {
      /* storage unavailable */
    }
    setNav(st !== 'closed', false);
  }
  navBtn.addEventListener('click', () => setNav(nav.classList.contains('closed')));

  $$('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      handlers.onPreset(b.dataset.preset);
      if (small()) setCollapsed(true, false);
    }),
  );
  $('[data-toggle="xray"]').addEventListener('change', (e) => handlers.onXray(e.target.checked));
  $('[data-toggle="mapmode"]').addEventListener('change', (e) => handlers.onMapMode(e.target.checked));
  $('[data-act="mapmode"]').addEventListener('click', () => handlers.onMapMode(!$('[data-toggle="mapmode"]').checked));
  $('[data-act="home"]').addEventListener('click', () => handlers.onPreset('site'));
  $$('[data-zoom]').forEach((b) => b.addEventListener('click', () => handlers.onZoom(+b.dataset.zoom)));
  // arrows: hold to keep moving (pointer events work for mouse and touch)
  $$('[data-pan]').forEach((b) => {
    const [x, y] = b.dataset.pan.split(',').map(Number);
    const stop = (e) => {
      if (b.hasPointerCapture?.(e.pointerId)) b.releasePointerCapture(e.pointerId);
      handlers.onPan(x, y, false);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      handlers.onPan(x, y, true);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  $$('[data-light]').forEach((b) => b.addEventListener('click', () => handlers.onDusk(b.dataset.light === 'dusk')));
  $$('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      handlers.onQuality(b.dataset.q);
      $$('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
    }),
  );
  $$('[data-layer]').forEach((c) => c.addEventListener('change', () => handlers.onLayer(c.dataset.layer, c.checked)));
  $('[data-act="pause"]').addEventListener('click', () => handlers.onPause());
  $('[data-act="fullscreen"]').addEventListener('click', () => handlers.onFullscreen());
  $('[data-act="close"]').addEventListener('click', () => handlers.onCloseInfo());
  menuBtn.addEventListener('click', () => setCollapsed(!controls.classList.contains('collapsed')));
  $('[data-act="figs"]').addEventListener('click', () => figs.classList.toggle('collapsed'));

  return {
    root: el,
    /** Horizontal screen space (px) covered by the side panels, used to centre the 3D view in the free area. */
    insets() {
      if (small()) return { left: 0, right: 0 };
      const r = (e) => e.getBoundingClientRect();
      const left = controls.classList.contains('collapsed') ? 0 : r(controls).right;
      const right = figs.classList.contains('collapsed') ? 0 : window.innerWidth - r(figs).left;
      return { left, right };
    },
    toggleNav() {
      navBtn.click();
    },
    toggleControls() {
      setCollapsed(!controls.classList.contains('collapsed'));
    },
    setPreset(name) {
      $$('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === name));
    },
    setQuality(mode) {
      $$('[data-q]').forEach((x) => x.classList.toggle('on', x.dataset.q === mode));
    },
    setPerf(info) {
      const f = $('#fps');
      if (!f) return;
      const fps = info.fps ? `${Math.round(info.fps)} fps` : 'measuring';
      f.textContent = `${info.mode === 'auto' ? `Auto: ${info.label}` : info.label}  |  ${fps}  |  ${info.dpr.toFixed(2)}x`;
    },
    setMapMode(on) {
      $('[data-toggle="mapmode"]').checked = on;
      $('[data-act="mapmode"]').classList.toggle('on', on);
      const h = $('.hint');
      if (h) h.innerHTML = on
        ? 'Drag to move the map &nbsp;|&nbsp; right-drag or two-finger twist to rotate &nbsp;|&nbsp; scroll or pinch to zoom'
        : 'Drag to orbit &nbsp;|&nbsp; right-drag, two fingers or the arrows to move the map &nbsp;|&nbsp; scroll or pinch to zoom &nbsp;|&nbsp; click F1 or F2 for details';
    },
    setXray(on) {
      $('[data-toggle="xray"]').checked = on;
    },
    setDusk(on) {
      $$('[data-light]').forEach((b) => b.classList.toggle('on', (b.dataset.light === 'dusk') === on));
      document.body.classList.toggle('dusk', on);
    },
    setLayer(name, on) {
      const c = $(`[data-layer="${name}"]`);
      if (c) c.checked = on;
    },
    setPaused(p) {
      const b = $('[data-act="pause"]');
      b.classList.toggle('paused', p);
      b.querySelector('span').textContent = p ? 'Play truck loop' : 'Pause truck loop';
    },
    hideHint() {
      $('.hint')?.classList.add('gone');
    },
    setCompass(deg) {
      needle.style.transform = `rotate(${deg}deg)`;
    },
    showInfo(html, accent) {
      info.querySelector('.info-body').innerHTML = html;
      info.style.setProperty('--accent', accent);
      info.hidden = false;
      el.classList.add('has-info');
      requestAnimationFrame(() => info.classList.add('show'));
      if (small()) figs.classList.add('collapsed');
    },
    hideInfo() {
      info.classList.remove('show');
      info.hidden = true;
      el.classList.remove('has-info');
    },
  };
}

/** Info card content for a warehouse */
export function warehouseInfoHTML(wh, dockEast, dockWest) {
  const L = CONFIG.levels;
  const lenM = (wh.u1 - wh.u0) / 1000;
  return `
    <div class="info-head">
      <span class="badge">${wh.id}</span>
      <div>
        <div class="info-title">${wh.name}</div>
        <div class="info-sub">${fmt(lenM, 2)} m x 100.00 m &nbsp;|&nbsp; single storey, dual-pitch roof</div>
      </div>
    </div>
    <dl class="info-grid">
      <div><dt>Floor area</dt><dd>${fmt(wh.areaM2)} <small>m²</small></dd></div>
      <div><dt>Clear height</dt><dd>${fmt(L.clearHeight / 1000)} <small>m</small></dd></div>
      <div><dt>Loading docks</dt><dd>${dockEast + dockWest} <small>doors</small></dd></div>
      <div><dt>Dock height</dt><dd>${fmt(-L.yard / 1000, 1)} <small>m</small></dd></div>
    </dl>
    <ul class="info-list">
      <li><b>Docks</b><span>${dockEast} x 8.0 x 3.5 m (east, 2 trucks each) and ${dockWest} x 8.0 x 5.0 m (west)</span></li>
      <li><b>Floor finish</b><span>${wh.floorFinish}</span></li>
      <li><b>Heights</b><span>Eave +${fmt(L.eave / 1000, 1)} m, ridge +${fmt(L.ridge / 1000, 1)} m, roof pitch 5 %</span></li>
      <li><b>Envelope</b><span>RC base, brick band to +5.0 m, metal cladding above, skylight strips</span></li>
      <li><b>Racking</b><span>Selective pallet racking, back-to-back rows, up to 12 m</span></li>
      <li><b>Fire separation</b><span>Full-height fire wall between F1 and F2</span></li>
    </ul>`;
}
