/**
 * PHUOC AN PORT  |  Warehouse F1 / F2  |  Light digital twin
 * -----------------------------------------------------------------------------
 * Every dimension in this file is in MILLIMETRES (as on the drawings).
 * The scene converts to metres internally (1 unit = 1 m).
 *
 * COORDINATE SYSTEM (plan view)
 *   Origin (0, 0) = centre of the main building footprint, at warehouse floor level (+0.000).
 *   +x = EAST   (towards the ancillary strip)
 *   +z = SOUTH  (towards road N3)
 *   -z = NORTH  (towards road N1)
 *   Heights (y) are relative to finished floor level +0.000. Truck yard is -1.300.
 *
 * BUILDING-LOCAL COORDINATES (used for doors, canopies, racks)
 *   u = distance along the building measured from the NORTH end wall (F1 end), towards the south.
 *   v = distance across the building measured from the WEST wall (grid Y1), towards the east (Y13).
 *
 * Change a number, save, and the model rebuilds (npm run dev hot reloads).
 */

const bays = (first, n, typical, last) => [first, ...Array(n).fill(typical), last];

export const CONFIG = {
  project: {
    title: 'PHUOC AN PORT',
    subtitle: 'Warehouse F1 & F2 Digital Twin',
    location: 'Phuoc An Industrial Park, Dong Nai, Vietnam',
    logoLine1: 'PHUOC AN',
    logoLine2: 'PORT',
  },

  // ---------------------------------------------------------------------------
  // LEVELS
  // ---------------------------------------------------------------------------
  levels: {
    floor: 0, // finished floor level of F1 / F2
    yard: -1300, // truck yard and roads (dock height 1300)
    rcTop: 1000, // top of the RC base wall (painted accent colour)
    brickTop: 5000, // top of the brick band; metal cladding above
    eave: 15500,
    ridge: 18000, // dual pitch 5 %  (50 000 x 5 % = 2 500)
    clearHeight: 14000,
    canopy: 5000, // underside of the dock canopies
  },

  // ---------------------------------------------------------------------------
  // PROJECT SITE (fenced plot)
  // ---------------------------------------------------------------------------
  site: {
    areaM2: 64236.25,
    // Distance from the building walls to the plot boundary (from the master plan).
    setback: { west: 30000, east: 37500, north: 20500, south: 20500 },
    // Gates on the plot boundary: x = centre of the 15 m opening.
    gates: [
      { id: 'G1', label: 'Gate G1', side: 'north', x: 65500, width: 15000 },
      { id: 'G2', label: 'Gate G2', side: 'south', x: 65500, width: 15000 },
      { id: 'GW1', label: '', side: 'north', x: -72500, width: 15000 },
      { id: 'GW2', label: '', side: 'south', x: -72500, width: 15000 },
    ],
    fenceHeight: 2200,
  },

  // Surrounding roads and the neighbouring truck yard to the west (context).
  context: {
    roadWidth: 15000, // carriageway of N1 / N3
    sidewalk: 6000,
    // Big paved truck parking yard between the plot and road D1.
    yardWidth: 465000, // from the west plot boundary to D1
    yardRoads: [
      // x = centreline of north-south roads (mm), z = centreline of east-west roads
      { dir: 'ew', z: 31000, width: 15000 },
      { dir: 'ns', x: -195000, width: 22500 },
      { dir: 'ns', x: -343000, width: 15000 },
      { dir: 'ew', z: -181000, width: 15000, x0: -343000 },
    ],
    // Landscaped park in the NW corner of the yard (to the D1 road). East edge per master plan REV02.
    greenNW: { x0: -545000, x1: -409000, z0: -191750, z1: 6000 },
    // Tractor parking, trailer drop and EV charging along the east edge of the park (master plan REV02).
    // Bays run east-west; chargers stand on the park side, one dual charger per two bays.
    evCharging: {
      x0: -405000,
      x1: -386000,
      z0: -171000,
      z1: 9000,
      slots: 50,
      chargers: 25,
      occupied: 0.45, // share of bays with an electric tractor unit on charge
      station: { x: -396000, z: -183500, w: 9000, d: 5000 }, // charging substation by road N1
    },
    d1Width: 62000, // boulevard D1 with green medians
    parkedTruckRatio: 0.35, // share of yard bays holding a parked truck
  },

  // ---------------------------------------------------------------------------
  // MAIN BUILDING
  // ---------------------------------------------------------------------------
  building: {
    // X grid along the length (north to south): end bays 9250, typical 12000.
    xBays: bays(9250, 27, 12000, 9250), // total 342 500
    // Y grid across the width (west Y1 to east Y13)
    yBays: [8250, 8250, 8250, 8250, 8500, 8500, 8500, 8500, 8250, 8250, 8250, 8250], // total 100 000
    wallThickness: 250,
    // Fire wall between F1 and F2 (grid X15 in the brief). Distance from the north end.
    firewallAt: 177250,
    // Interior columns stand on these v positions on every X grid line (grid Y5 and Y9).
    interiorColumnsV: [33000, 67000],
    columnSize: 500,
    skylight: { width: 970, perBay: 1, endMargin: 3500 }, // roof skylight strips, one per 12 m bay
    wallLights: true, // translucent 970 strips in the upper wall, one per bay

    warehouses: [
      {
        id: 'F1',
        name: 'Warehouse F1',
        u0: 0,
        u1: 177250,
        areaM2: 17725,
        theme: { accent: '#e2622b', accentDark: '#b8481b', light: '#f3b08f', door: '#e2622b', glass: '#6fa7d8' },
        floorFinish: 'Polished concrete with liquid hardener',
      },
      {
        id: 'F2',
        name: 'Warehouse F2',
        u0: 177250,
        u1: 342500,
        areaM2: 16525,
        theme: { accent: '#1d5fb8', accentDark: '#154687', light: '#9fc2ec', door: '#1d5fb8', glass: '#5d9bd6' },
        floorFinish: 'Polished concrete with liquid hardener',
      },
    ],

    // Logo panels near both ends of both long facades (and on the gables).
    logos: [
      { side: 'west', u: 22000, width: 26000, height: 7000, y: 11200 },
      { side: 'east', u: 26000, width: 26000, height: 7000, y: 11200 },
      { side: 'west', u: 320500, width: 26000, height: 7000, y: 11200 },
      { side: 'east', u: 320500, width: 26000, height: 7000, y: 11200 },
    ],
    // Brand mark painted across both roof slopes, centred near the fire wall (master plan REV02)
    roofLogo: { centreU: 176000, length: 137000, width: 74000 },
  },

  // ---------------------------------------------------------------------------
  // OFFICES
  // ---------------------------------------------------------------------------
  offices: [
    {
      id: 'OF1',
      warehouse: 'F1',
      name: 'F1 Office',
      // Inside the footprint at the NE corner, facing the north end facade.
      u0: 0,
      u1: 7000,
      v0: 76800,
      v1: 100000, // 23 200 x 7 000
      floors: 2,
      height: 10500,
      portal: { v0: 64000, v1: 101500, height: 13200, depth: 2600 }, // tall angled entrance frame
    },
    {
      id: 'OF2',
      warehouse: 'F2',
      name: 'F2 Office',
      // Outside the west wall at the south end: 15 000 (along the building) x 8 000.
      u0: 327500,
      u1: 342500,
      v0: -8000,
      v1: 0,
      floors: 2,
      height: 8500,
    },
  ],

  // ---------------------------------------------------------------------------
  // DOCKS  (pattern per 12 000 bay: 2 000 wall | 8 000 door | 2 000 wall)
  // Doors are listed by the u of their centre, generated from start / step / count.
  // ---------------------------------------------------------------------------
  docks: {
    groups: [
      // East facade (Y13): 8 000 x 3 500 doors, two trucks per door, one door every bay.
      { warehouse: 'F1', side: 'east', start: 75250, step: 12000, count: 8, width: 8000, height: 3500, levelers: 2 },
      { warehouse: 'F2', side: 'east', start: 195250, step: 12000, count: 11, width: 8000, height: 3500, levelers: 2 },
      // West facade (Y1): 8 000 x 5 000 doors, every second bay, with a 12 m dock platform.
      { warehouse: 'F1', side: 'west', start: 39250, step: 24000, count: 6, width: 8000, height: 5000, levelers: 1 },
      { warehouse: 'F2', side: 'west', start: 195250, step: 24000, count: 6, width: 8000, height: 5000, levelers: 1 },
    ],
    platformDepth: 3000, // external dock platform at floor level in front of each door
    levelerWidth: 2400,
    truckSlotOffset: 2000, // east doors: truck centrelines at door centre +/- this value
    canopies: [
      { side: 'east', u0: 68650, u1: 165650, depth: 8000 },
      { side: 'east', u0: 188750, u1: 321750, depth: 8000 },
      { side: 'west', u0: 32800, u1: 165800, depth: 9000 },
      { side: 'west', u0: 188750, u1: 321750, depth: 8000 },
      { side: 'north', v0: 28000, v1: 62000, depth: 8000 },
    ],
  },

  // ---------------------------------------------------------------------------
  // WEST APRON (container side, master plan REV02)
  // Container trucks park parallel to the building (they do not reverse in).
  // Reach stackers stand perpendicular to the wall to pick containers from the stacks.
  // ---------------------------------------------------------------------------
  westApron: {
    // container blocks in the bays between the west doors: 2 x 20 ft along the wall, 4 rows deep
    stackRowsX: [-63300, -60500, -57700, -54900],
    stackMaxHigh: [3, 2, 1, 1], // rows under the canopy stay one high
    // u (from the north end) of the bays served by the 5 reach stackers
    reachStackers: [75250, 99250, 147250, 255250, 303250],
    reachStackerX: -72000, // chassis centre; the boom points east to the stacks
    // container trucks parked parallel to the facade, cab to the north (x = lane centre, z = truck centre)
    parallelTrucks: [
      { x: -69500, z: -122000 },
      { x: -69500, z: -62400 },
      { x: -69500, z: 9500 },
      { x: -69500, z: 57400 },
      { x: -69500, z: 99000 },
      { x: -75400, z: 145200 },
      { x: -69500, z: 167400 },
    ],
  },

  // ---------------------------------------------------------------------------
  // CONTAINER DEPOT (west yard, master plan REV02)
  // ---------------------------------------------------------------------------
  depot: {
    // Container yards between the yard roads. Blocks ("columns") are `slots` containers wide and run
    // along `dir` ('x' = east-west, 'z' = north-south), with reach stacker aisles between them.
    yards: [
      { name: 'Laden container yard', x0: -539000, x1: -409000, z0: 38500, z1: 191750, dir: 'z' },
      // The first block row next to road N1 is replaced by a facility strip (master plan REV02):
      // container washing + survey bays (left yard) and the MNR repair area (right yard).
      // `outline` paints a coloured line around the next block row to mark it.
      {
        name: 'Container yard',
        x0: -335500, x1: -206250, z0: -173500, z1: 23500, dir: 'x',
        strip: 'wash',
        outline: { label: 'Containers MNR done', color: '#1e7bff' },
      },
      { name: 'Empty container yard', x0: -335500, x1: -206250, z0: 38500, z1: 191750, dir: 'x' },
      {
        name: 'Container yard',
        x0: -183750, x1: -80000, z0: -173500, z1: 23500, dir: 'x',
        strip: 'mnr',
        outline: { label: 'Containers awaiting MNR', color: '#ff9800' },
      },
      { name: 'Empty container yard', x0: -183750, x1: -80000, z0: 38500, z1: 191750, dir: 'x' },
    ],
    // Container washing + survey strip: bays for a 40 ft container on its trailer (head of the bay to the north)
    wash: { offsetX: 28000, bayWidth: 4500, bayDepth: 17000, washBays: 8, surveyBays: 9, gap: 6000, barDepth: 6500, occupied: 0.7 },
    // MNR (maintenance and repair, 100 containers / day): single 20 ft boxes on a loose grid, not stacked
    mnr: { cols: 13, rows: 6, rowPitch: 4600, occupied: 0.82 },
    slots: 7, // containers side by side in one block
    slotWidth: 2900,
    cellLength: 6800, // one 20 ft cell; a 40 ft box takes two cells
    aisle: 20000,
    margin: 6000,
    maxTiers: 5,
    share40ft: 0.7,
    // colours as in the reference photos (maroon, red, yellow, blues, some grey / green / white)
    containerColors: ['#7d2626', '#8e2d2b', '#a8352f', '#c0392b', '#e0a91c', '#e8b521', '#d99a17', '#1f4f9a', '#1c3f7c', '#2f6fc0', '#23507f', '#6f7478', '#2e6b4a', '#e6e6e2', '#b5462a'],
    // Access control gates (lanes with booths, barriers and a canopy)
    gates: [
      { id: 'gD1', name: 'Access control gate (D1)', x: -531000, z: 31000, axis: 'x', lanes: 5 },
      { id: 'gN1', name: 'Access control gate (N1)', x: -343000, z: -182500, axis: 'z', lanes: 5 },
      { id: 'gN3', name: 'Access control gate (N3)', x: -195000, z: 180500, axis: 'z', lanes: 5 },
    ],
    // Office building (3 floors) facing road N3, west of the N3 gate
    office: { x0: -262000, x1: -216000, z0: 138000, z1: 174000, floors: 3, compound: { x0: -272000, x1: -207000, z0: 126000, z1: 191000 } },
    reachStackers: 7, // working in the container yards (pick and place loop)
    yardTrucks: 10, // container trucks driving through the gates and yard roads
    yardTruckSpeed: 8.5, // m/s
  },

  // ---------------------------------------------------------------------------
  // YARD OPERATIONS (west yard)
  // ---------------------------------------------------------------------------
  operations: {
    // Container trucks waiting for their turn: bays east of the EV charging row, nose to the lane
    // next to the road edge, leaving room for tractors backing out of the EV charging bays
    truckWaiting: { x0: -370500, bayDepth: 18000, z0: -166000, z1: 16000, bayWidth: 4000, occupied: 0.65 },
    // Forklifts unloading containers at these west dock doors (u of the door centre, mm).
    // gap = distance from the dock platform edge to the container doors.
    dockForklifts: { doorsU: [63250, 111250, 159250, 219250, 267250], gap: 3600 },
    // Container stuffing (Phuoc An Depot service) on the paved area east of the laden yard.
    // Along both outer edges: a tight row of 20 ft containers with the doors open towards the apron, and
    // in front of it a parking lane where cargo trucks stand parallel to the container row. Trucks unload
    // by conveyor (truck to container door) or by hand; some are parked waiting.
    stuffing: {
      x0: -404000, x1: -354000, z0: 44000, z1: 186000,
      containerPitch: 2900, perGroup: 8, groupGap: 4400, trucksPerGroup: 2, workGap: 2600,
      mix: { conveyor: 6, hand: 6, parked: 5 }, // remaining truck bays are empty
      movingCargoTrucks: 4, // arriving / leaving through the apron
      movingContainerTrucks: 2, // taking stuffed containers out
      supervisors: 4,
      bagColor: '#f2c21b',
    },
  },

  // ---------------------------------------------------------------------------
  // ANCILLARY BUILDINGS (plan position of the centre in site coordinates, mm)
  //   w = size east-west, d = size north-south, h = height
  // ---------------------------------------------------------------------------
  ancillary: [
    { id: 'guard1', name: 'Guard house 1', size: '4 x 6 m', x: 79000, z: -186000, w: 4000, d: 6000, h: 3600 },
    { id: 'tank', name: 'Underground water tank', size: '1,130 m³', x: 80000, z: -174000, w: 10000, d: 16000, h: 400, slab: true },
    { id: 'pump', name: 'Pump house', size: '11 x 6 m', x: 79000, z: -158500, w: 6000, d: 11000, h: 4500 },
    { id: 'wc', name: 'Public WC', size: '9 x 6 m', x: 79000, z: -147500, w: 6000, d: 9000, h: 4000 },
    { id: 'sub', name: 'Substation', size: '5 x 4 m', x: 79000, z: -139000, w: 4000, d: 5000, h: 3600, kind: 'substation' },
    { id: 'elec', name: 'Electrical building', size: '14.5 x 6 m', x: 80000, z: -132000, w: 14500, d: 6000, h: 5000 },
    { id: 'scrap', name: 'Scrap store', size: '3.5 x 6 m', x: 75750, z: -124500, w: 3500, d: 6000, h: 3800 },
    { id: 'waste', name: 'Waste house', size: '4 x 6 m', x: 80000, z: -124500, w: 4000, d: 6000, h: 3800 },
    { id: 'fuel', name: 'Fuel house', size: '3.8 x 6 m', x: 84400, z: -124500, w: 3800, d: 6000, h: 3800 },
    { id: 'charge', name: 'Forklift charging', size: '10.2 x 6 m', x: 79500, z: -115000, w: 10200, d: 6000, h: 5000, open: true },
    { id: 'pack', name: 'Packaging store', size: '11 x 8 m', x: 54000, z: 500, w: 8000, d: 11000, h: 5500 },
    { id: 'rest', name: 'Driver rest room', size: '11 x 8 m', x: 54000, z: 11500, w: 8000, d: 11000, h: 5500 },
    { id: 'customs', name: 'Customs office', size: '7 x 6 m', x: 81500, z: 178500, w: 7000, d: 6000, h: 4200 },
    { id: 'guard2', name: 'Guard house 2', size: '5 x 6 m', x: 82500, z: 187500, w: 5000, d: 6000, h: 3600 },
  ],

  // ---------------------------------------------------------------------------
  // RACKS  (selective pallet racking, back-to-back double rows, from the rack plan)
  // Rows run east-west (across the building). Row centres sit on a 6 000 pitch
  // on the X grid lines and mid-bays. Two blocks across the width, cross aisle between.
  // ---------------------------------------------------------------------------
  racks: {
    height: 12000,
    beamLevels: [1900, 3900, 5900, 7900, 9900], // top of each beam level; pallets also on the floor
    loadHeight: 1500,
    rackDepth: 1100, // single rack depth
    flue: 300, // gap between the two racks of a double row
    bayLength: 2850,
    uprightSize: 100,
    occupancy: 0.84,
    rowPitch: 6000,
    // v ranges (from the west wall) of the two rack blocks
    blocks: [
      { v0: 10600, v1: 50200 },
      { v0: 58500, v1: 87000 },
    ],
    // Row centres (u from the north end): first, last. Blocks can skip rows near the office.
    rows: [
      { warehouse: 'F1', first: 9250, last: 165250, skipBlockAtFirst: [1] },
      { warehouse: 'F2', first: 189250, last: 333250 },
    ],
  },

  // ---------------------------------------------------------------------------
  // TRUCKS
  // ---------------------------------------------------------------------------
  trucks: {
    animated: 4, // container trucks cycling gate > dock > gate
    // Dock slots used by the animation (door index in the east groups, slot -1 / +1)
    animatedSlots: [
      { group: 0, door: 2, slot: 1 },
      { group: 1, door: 3, slot: -1 },
      { group: 0, door: 5, slot: -1 },
      { group: 1, door: 8, slot: 1 },
    ],
    staticDockRatio: 0.45, // share of remaining east dock slots with a parked truck
    speed: 7.5, // m/s on the site roads
    reverseSpeed: 1.8,
    dwell: [9, 16], // seconds at the dock (random range)
    containerColors: ['#1f6fb2', '#c0392b', '#2e7d4f', '#e67e22', '#e8e8e8', '#6d4c9f', '#8a8f96', '#0e3d6b', '#d9a21b'],
    cabColors: ['#f4f4f2', '#1d5fb8', '#c62828', '#fafafa', '#2e2e33', '#e2622b'],
  },

  // ---------------------------------------------------------------------------
  // LANDSCAPE
  // ---------------------------------------------------------------------------
  landscape: {
    treeSpacing: 9000,
    // Rounded green islands inside the plot (site coordinates, mm)
    greens: [
      { x0: -65000, x1: -50000, z0: -174750, z1: -139000, r: 9000 },
      { x0: 50000, x1: 60000, z0: -174750, z1: -106000, r: 8000 },
      { x0: -65000, x1: -50000, z0: 151500, z1: 174750, r: 9000 },
      { x0: 50000, x1: 58000, z0: 151500, z1: 174750, r: 7000 },
      { x0: -50000, x1: 50000, z0: -174750, z1: -171500, r: 0 },
      { x0: -50000, x1: 50000, z0: 171500, z1: 174750, r: 0 },
      { x0: 84000, x1: 87500, z0: -104000, z1: 191750, r: 0 },
    ],
  },

  // ---------------------------------------------------------------------------
  // CAMERA PRESETS  (positions in metres, site coordinates)
  // ---------------------------------------------------------------------------
  cameras: {
    aerial: { pos: [285, 235, 300], target: [-25, 0, -15] },
    entrance: { pos: [84, 8.5, -226], target: [36, 7.5, -171] },
    dock: { pos: [80, 11, 78], target: [49, 3.5, 26] },
    insideF1: { pos: [4.35, 11.5, -163], target: [4.35, 4.5, -80] },
    insideF2: { pos: [43.5, 8, 166], target: [36, 3.5, 90] },
    depot: { pos: [-110, 270, 350], target: [-290, 0, 25] },
    site: { pos: [-30, 560, 470], target: [-260, 0, 0] },
  },
  // Navigation limits for the camera target (metres): the map cannot be dragged away from the project
  navBounds: { x0: -640, x1: 170, z0: -290, z1: 290 },
};
