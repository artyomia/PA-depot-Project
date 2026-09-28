# Phuoc An Port | Warehouse F1 & F2 | Light Digital Twin

Interactive 3D model of the Phuoc An Port warehouse project (Warehouses F1 and F2, docks, site, ancillary
buildings and pallet racking) for client presentations. It runs in any modern browser on desktop and iPad.

- **Tech:** Vite + Three.js only (no UI framework). OrbitControls, soft PCF shadows, physically based materials,
  procedural sky with a day and a dusk (blue hour) lighting preset.
- **Fully procedural:** every building, door, rack and road is generated from the numbers in
  [`src/config.js`](src/config.js). There are no 3D model files and no image files; all textures are drawn on
  canvases at start-up.
- **Two outputs:** a normal static site (`dist/`) and a single self-contained HTML file
  ([`release/phuoc-an-warehouse-twin.html`](release/phuoc-an-warehouse-twin.html)) that you can email, put on a USB
  stick or open straight from disk.

---

## 1. Run it

Requirements: Node.js 18 or newer.

```bash
cd warehouse-twin
npm install          # once
npm run dev          # development server with hot reload, open the printed URL
```

Other scripts:

| Command                | Output                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `npm run build`        | `dist/` static site (relative paths, can live in any sub folder) |
| `npm run build:single` | `dist-single/index.html`, one file with all JS and CSS inlined   |
| `npm run preview`      | Serves `dist/` locally to check the production build            |

The ready-made single file is committed as `release/phuoc-an-warehouse-twin.html`. After editing the config,
rebuild it with `npm run build:single` and copy `dist-single/index.html` over it.

### Deploy as a static site

Upload the content of `dist/` to any static host (Netlify, Vercel, GitHub Pages, Azure Static Web Apps, S3,
IIS, nginx). No server code or special headers are needed. The single-file version also works from `file://`
in Chrome, Edge, Safari and Firefox.

### On iPad

Open the hosted URL in Safari. Use **Share > Add to Home Screen** to launch it full screen like an app.
The model detects touch devices and automatically uses a lighter shadow map and resolution; frame rate is
monitored and the resolution is lowered further if needed.

---

## 2. Using the model

| Action                           | Mouse / keyboard                              | Touch                    |
| -------------------------------- | --------------------------------------------- | ------------------------ |
| Orbit                            | Left drag                                     | One finger drag          |
| Pan (move the map)               | Right drag, arrow keys, or hold the arrow buttons of the navigation pad | Two finger drag, arrow buttons |
| Map mode (left drag moves the map, right drag rotates) | Hand button, switch or `M` | One finger moves the map |
| Zoom step / fit whole site       | `+` / `-` buttons or keys, map button         | Buttons                  |
| Zoom                             | Wheel (zooms towards the cursor)              | Pinch                    |
| Camera presets                   | Buttons or keys `1` to `5`                    | Buttons (menu on phones) |
| X-ray (fade roof and upper walls) | Switch or `X`                                 | Switch                   |
| Day / Dusk                       | Toggle or `D`                                 | Toggle                   |
| Warehouse info card              | Click F1 or F2 (building or its label), `Esc` closes | Tap                  |
| Ancillary building name and size | Hover                                         | Tap                      |
| Labels on / off                  | Switch or `L`                                 | Switch                   |
| Collapse / expand the left panel | Chevron in the title bar or `C`               | Chevron                  |
| Show / hide the navigation bar   | Chevron at its end or `N`                     | Chevron                  |
| Pause / play the truck loop      | Button or `Space`                             | Button                   |

Camera presets: **Aerial**, **Front entrance** (F1 office and portal frame), **Dock side** (east docks),
**Inside F1** (cross aisle), **Inside F2** (dock staging aisle), **Container depot** (keys `6`) and **Whole site** (`7`).

The navigation bar (bottom centre) has fit-the-whole-site, arrows, zoom and map mode buttons plus the compass;
the chevron (or key `N`) folds it down to just the compass. The Key figures panel starts collapsed. The view
centre shifts automatically into the space left free by the side panels, and the camera target is kept inside
`navBounds` (config) so the map cannot be dragged away. Map mode is remembered per browser.

Layers: racks, trucks and containers, landscaping (trees and shrubs), labels (3D labels and red site boundary).

### Performance (smooth on modest laptops)

The **Performance** selector in the Display section (remembered per browser) offers:

| Profile      | What it does                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Auto**     | Default. Picks a profile from the graphics card (integrated Intel / AMD graphics start on Balanced), then watches the real frame rate: it lowers the render resolution a little first and steps down a profile if that is not enough |
| **High**     | Full resolution (up to 2x on high-DPI screens), 4096 shadow map refreshed every frame, clouds   |
| **Balanced** | Resolution up to 1.25x, 2048 shadow map refreshed every 2nd frame                              |
| **Light**    | For modest laptops: resolution 1x (down to 0.7x if needed), static shadows (moving vehicles cast none), no clouds, no anti-aliasing, steady 30 fps (even frame pacing feels smoother than a frame rate jumping between 40 and 50) |

The line under the title shows the active profile, the measured frame rate and the render resolution.
For every profile the pallet racks are only drawn when they can be seen (x-ray, inside, or close to the dock
doors), label occlusion uses the building volumes, and hover picking is limited to 15 checks per second.

Tips for a presentation laptop: plug in the charger (Windows throttles the graphics card on battery),
use Chrome or Edge, close other heavy tabs, and on laptops with two graphics cards set the browser to
"High performance" in Windows Settings > System > Display > Graphics.

### URL options

Append to the address, for example `index.html?quality=light`:

| Option                  | Effect                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `quality=auto` / `high` / `balanced` / `light` | Start with this profile (overrides the saved choice) |
| `shadows=0`             | Disable shadows completely (for very old devices)                 |
| `tm=aces` / `tm=agx`    | Alternative tone mapping (default is Khronos PBR Neutral)          |

----------------- | ----------------------------------------------------------------------- |
| `quality=low`     | Force the light profile (2048 shadow map, shadow refresh every 2nd frame) |
| `quality=high`    | Force the full profile even on tablets                                  |
| `shadows=0`       | Disable shadows (for very old devices)                                  |
| `dpr=1`           | Fix the render resolution multiplier                                    |
| `tm=aces` / `tm=agx` | Alternative tone mapping (default is Khronos PBR Neutral)            |

---

## 3. Editing `src/config.js`

Everything is in **millimetres**, exactly as on the drawings. Save the file and the dev server rebuilds the
model instantly. Only the camera presets (at the bottom) are in metres.

### Coordinate system

```
                      Road N1 (north, -z)
        +---------------------------------------------+
        |  truck yard (context)   | plot |  F1  | anc |
 Road   |  parking bays           |      |------|     |   +x = east
 D1     |  NW park                |      |  F2  |     |
 (west) |                         |      |      |     |
        +---------------------------------------------+
                      Road N3 (south, +z)

Origin (0, 0) = centre of the main building, floor level +0.000. Truck yard = -1.300.

Building-local coordinates used for doors, canopies, racks and logos:
  u = distance from the NORTH end wall (F1 end) towards the south
  v = distance from the WEST wall (grid Y1) towards the east (grid Y13)
```

Grid convention: X1 is the south (F2) end and X30 the north (F1) end, so the fire wall sits on grid X15 with
F2 = X1 to X15 (165 250) and F1 = X15 to X30 (177 250).

### What is where

| Section       | Controls                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `levels`      | Floor, yard (dock height), top of RC base and brick band, eave, ridge, clear height, canopy level |
| `site`        | Plot area, setbacks from the building to the boundary, gates, fence height                       |
| `context`     | Roads N1 / N3 / D1, the paved truck yard to the west, its roads, the NW park, share of parked trucks |
| `building`    | X and Y grid bays, fire wall position, interior column lines, skylight strips, logo panels       |
| `building.warehouses` | Length (`u0`, `u1`), area shown in the UI, colour theme, floor finish text             |
| `offices`     | F1 office (inside the NE corner, with the angled portal) and F2 office (outside the west wall)   |
| `docks`       | Door groups (side, first door centre, spacing, count, size, levelers) and canopies              |
| `ancillary`   | Name, size label, centre `x` / `z`, footprint `w` x `d`, height of every small building         |
| `racks`       | Height, beam levels, depth, bay length, occupancy, row pitch, rack blocks and row ranges         |
| `trucks`      | Number of animated trucks, their target docks, speeds, dwell time, colours                        |
| `landscape`   | Tree spacing and the green islands inside the plot                                               |
| `depot`       | West container depot: yards (blocks, tiers, 20/40 ft mix, colours), access control gates, office, number of working reach stackers and yard trucks |
| `westApron`   | Container side: container block rows, the 5 reach stackers, trucks parked parallel to the facade  |
| `context.evCharging` | Tractor parking and EV charging bays (50 bays, 25 dual chargers) and the charging substation |
| `cameras`     | The seven presets (`pos` and `target`, metres)                                                   |
| `navBounds`   | Area (metres) the camera target is allowed to move in                                            |

### Common edits

**Add or move dock doors.** Each group creates `count` doors starting at `start` (u of the first door centre)
every `step`:

```js
{ warehouse: 'F2', side: 'east', start: 195250, step: 12000, count: 11, width: 8000, height: 3500, levelers: 2 },
```

The wall openings, shutters, levelers, shelters, stall markings, info card and key figures all follow
automatically.

**Change a warehouse colour.** Edit `theme` in `building.warehouses` (`accent` = frames, fascia, logo areas;
`accentDark` = RC base; `light` = brick band; `door` = roller shutters; `glass` = curtain wall tint).

**Move an ancillary building.** Change its `x` / `z` (centre, mm) and `w` / `d` (east-west / north-south size).
Hover labels use `name` and `size`.

**Rack layout.** Rows run east-west. Row centres go from `first` to `last` every `rowPitch` inside each
warehouse; each row is cut into the `blocks` (v ranges) with a cross aisle between them.

**Camera presets.** Easiest way: orbit to the view you like, open the browser console and run
`twin.camera.position` and `twin.controls.target`, then paste the values into `cameras`.

---

## 4. Project structure

```
warehouse-twin/
  index.html          loader + app container
  vite.config.js      normal and single-file build
  src/
    config.js         ALL dimensions and layout parameters (edit this)
    main.js           renderer, sky, day / dusk lighting, camera presets, x-ray, picking, render loop
    site.js           ground, plot, roads N1 / N3 / D1, truck yard, park, fence, gates, ancillary buildings,
                      trees, street lights
    building.js       walls with door cut-outs, gables, fire wall, roof with skylight strips, steel frames,
                      offices and portal, logo panels, selection volumes
    docks.js          door list, roller shutters, levelers, shelters, dock platforms, cantilever canopies
    racks.js          selective pallet racking as InstancedMesh (uprights, beams, pallet loads, guards)
    trucks.js         truck models, parked and docked trucks, animated gate > dock > gate loop
    ui.js             overlay panels, info card, legend, compass
    depot.js          container depot: container blocks, access control gates, office, animated yard trucks
                      and reach stackers (pick and place loop)
    operations.js     container truck waiting area and container stuffing area (trucks, conveyors, workers)
    perf.js           performance profiles (Auto / High / Balanced / Light) and adaptive quality
    logo.js           Phuoc An brand mark (traced from the supplied artwork) for roof, panels, UI, favicon
    materials.js      procedural canvas textures and shared materials
    util.js           geometry helpers (metre based UVs, merging, instancing)
    style.css         UI styling (light for day, dark glass for dusk, responsive for iPad and phones)
```

Performance notes: static geometry is merged per material, racks and repeated objects use `InstancedMesh`
(about 12 000 pallet loads, 5 000 uprights, 240 parked trucks), roughly 300 draw calls in total.

---

## 5. Sources and assumptions

Built from the four architectural drawings supplied (master plan `PAP-AR-MP-00-01`, elevations and 3D views
`PAP-AR-FA-02-01`, roof / 2nd floor plan `PAP-AR-FA-01-04`, 1st floor plan with and without racks
`PAP-AR-FA-01-01`) and the figures in the brief.
Where they disagreed, the brief was used. This is a presentation model with approximate accuracy, not a
construction document.

- **Site.** The fenced plot is 167.5 m x 383.5 m = 64 236 m2 (setbacks 30 m west, 37.5 m east, 20.5 m north and
  south), matching the stated site area. The large paved truck yard with parking bays and the landscaped park in
  the NW corner, which lie between the plot and road D1 on the master plan, are modelled as surrounding context.
- **Orientation.** F1 is the north half (office in the NE corner facing road N1), F2 the south half. Docks on
  both long sides.
- **Docks (31 doors).** East side (grid Y13): 19 doors 8.0 x 3.5 m, one per bay, each with two levelers so two
  trucks can dock side by side (8 in F1, 11 in F2). West side (grid Y1): 12 doors 8.0 x 5.0 m every second bay
  with 12 m dock platforms (6 in F1, 6 in F2). Door positions and canopy extents (8 m, 9 m on the F1 west side,
  at +5.0 m) follow the rack plan and the roof plan.
- **Racks.** Back-to-back selective racking rows on a 6.0 m pitch, centred on the X grid lines and mid-bays,
  in two blocks across the width with a cross aisle near the ridge, staging zones along both dock walls, up to
  12 m. Read from the rack floor plan.
- **Offices.** F1: 23.2 x 7.0 m, 2 floors, inside the NE corner, glass curtain wall with orange aluminium
  composite frame and the tall angled portal wrapping the corner. F2: 15.0 x 8.0 m, 2 floors, outside the west
  wall at the south end, blue theme.
- **Ancillary buildings** are placed on the east strip and at the gates as on the master plan; the packaging
  store and driver rest room sit against the east facade on either side of the fire wall.
- **Logo.** The Phuoc An mark is traced from the supplied logo artwork. It is painted across both roof slopes,
  centred on the fire wall, as on master plan REV02, and used on the facade panels, gates, UI and favicon.
- **Master plan REV02** additions: the tractor parking / trailer drop / EV charging row (50 bays, 25 dual
  chargers, substation next to road N1) along the east edge of the park, which is narrowed accordingly.
- **West (container) side.** Container trucks park parallel to the facade on the west road instead of
  reversing in, and 5 reach stackers stand perpendicular to the wall to pick from the container blocks
  (2 x 20 ft along the wall, 4 rows deep, one high under the canopy), positions per REV02. The east side is
  unchanged.
- **Container depot (west yard).** The five areas between the yard roads are container yards, not truck
  parking: blocks 7 containers wide, stacked up to 5 high with a 20 / 40 ft mix and the colours of the reference
  photos, reach stacker aisles between the blocks. 7 reach stackers pick and place containers and 10 container
  trucks drive through the yard roads, stopping at the access control gates, whose barriers open for them.
- **North strip of the two middle yards (REV02).** The first block row next to road N1 is replaced by the
  container washing (8 bays with canopy) and survey (9 bays) area with its service bar (fire water tanks, pump
  rooms, substation), and by the MNR area (100 containers / day: single 20 ft boxes on a loose 13 x 6 grid).
  The next block row is outlined in blue (containers MNR done) and orange (containers awaiting MNR).
  Sizes are in `config.depot.wash` and `config.depot.mnr`; each yard's `strip` and `outline` switch them on.
- **Container stuffing area** (Phuoc An Depot service) on the paved area east of the laden yard: along both
  outer edges a tight row of 20 ft containers (80 in total) with the doors open towards the apron, and in
  front of it a lane where cargo trucks park parallel to the container row. Some trucks unload by conveyor
  (truck side to container door), some by hand (workers carrying bags), some are parked waiting, and cargo /
  container trucks drive in and out through the middle of the apron. Settings in `config.operations.stuffing`.
- **Forklifts at the west dock doors**: at 5 doors a container stands in front of the dock platform and a
  forklift takes pallets out of it and sets them on the platform (`config.operations.dockForklifts`).
- **Container truck waiting area** sits next to the road edge, leaving space for tractors to back out of the
  EV charging bays.
- **Reach stackers** follow the reference machine: red chassis, raised cab, twin front wheels, dark
  telescopic boom from the rear pivot tower, lift cylinder and a spreader with yellow twist-lock corners.
- **Access control gates** (5 lanes with booths, barriers and a branded canopy) at road D1, road N1 and
  road N3, and the **office building** next to the N3 gate, after the design perspectives: white 3-storey block
  with a light blue hip roof, blue glass window bays with light blue spandrels and salmon panels, a tall orange
  entrance portal between blue piers with the brand sign, a smaller orange portal on the east end, a lower
  rear wing, fenced compound with guard house, gate sign and flag poles.
