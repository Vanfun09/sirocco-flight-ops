// Every tuning number, name and colour of Sirocco in one place: the flight model's limits, the
// world's scale, the airport, the mission table's shared numbers and the HUD palette. Nothing
// below is read by the renderer's hot paths without being fixed at boot.
// Author every colour as sRGB and let three convert to linear on the way in, so the terrain,
// the aircraft and the sky agree on what a hex code means.
if (typeof THREE !== 'undefined' && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

const STEP = 1 / 60;

const WORLD = {
  size: 16000,
  half: 8000,
  grid: 640,
  seaLevel: 18,
  fogNear: 1200,
  fogFar: 8600,
};

/** The home strip: a plateau cut into the coastal hills, runway running east to west. */
const AIRPORT = {
  x: 0,
  z: 0,
  elevation: 68,
  length: 1300,
  width: 58,
  heading: 0,
  towerHeight: 22,
};

const FLIGHT = {
  mass: 1180,
  maxThrust: 5200,
  idleThrust: 260,
  dragArea: 0.62,
  inducedDrag: 0.0011,
  gearDrag: 0.16,
  flapDrag: 0.12,
  liftSpeed: 42,
  stallSpeed: 34,
  neverExceed: 108,
  pitchRate: 1.45,
  rollRate: 2.35,
  yawRate: 0.62,
  pitchAuthority: 0.55,
  brakeDecel: 6.2,
  rollingFriction: 0.35,
  touchdownSink: 5.2,
  touchdownBank: 0.42,
  crashSpeed: 62,
  fuelBurn: 0.0028,
  liftFactor: 9.8,
};

const CAMERA = {
  chase: { back: 15.5, up: 4.1, look: 13, fov: 62 },
  cockpit: { fov: 74, eye: [0, 1.05, -1.15] },
  orbit: { back: 26, up: 9, fov: 50 },
};

const MISSION_META = {
  ringRadius: 34,
  gateSpacing: 900,
  droneSpeed: 34,
  flakRange: 620,
};

const SCORE = {
  ring: 150,
  drone: 300,
  drop: 220,
  landingSoft: 500,
  landingHard: 120,
  crash: -250,
  timeBonus: 8,
};

const PALETTE = {
  hud: '#e8f2ff',
  hudDim: '#8fa3bb',
  hudWarn: '#ffca55',
  hudBad: '#ff6b5e',
  hudGood: '#7dffa8',
  panel: 'rgba(6, 11, 17, 0.82)',
  panelEdge: 'rgba(150, 190, 230, 0.28)',
  glass: 'rgba(20, 40, 55, 0.55)',
  ink: '#0b1017',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

/** Where the best score and the last mission flown are kept between visits (this browser only). */
const STORE = { best: 'sirocco.best', mission: 'sirocco.mission' };

const MISSIONS = [
  {
    id: 'ridge',
    name: 'Ridge Run',
    brief: 'Thread six gates through the coastal pass, then land back at Kestrel Strip.',
    detail: 'Rings reward a clean line, not raw speed. Cross each one level and inside the hoop.',
    weather: 'clear',
    time: 9.4,
    rings: 6,
    drones: 0,
    drops: 0,
    fuel: 100,
  },
  {
    id: 'lifeline',
    name: 'Lifeline',
    brief: 'Drop three supply crates on the valley markers, then recover at the strip.',
    detail: 'Low and slow over each marker arms the release. Gear up, flaps down.',
    weather: 'haze',
    time: 17.0,
    rings: 0,
    drones: 0,
    drops: 3,
    fuel: 100,
  },
  {
    id: 'watch',
    name: 'Storm Watch',
    brief: 'Intercept four survey drones over the storm front. Guns only, then land.',
    detail: 'Hold the pipper on a drone inside 400 m. They shoot back with flak.',
    weather: 'storm',
    time: 15.6,
    rings: 0,
    drones: 4,
    drops: 0,
    fuel: 100,
  },
  {
    id: 'dusk',
    name: 'Dusk Ferry',
    brief: 'Fly the evening mail down the coast through three beacons and land at night.',
    detail: 'The strip is unlit until you call it in: watch the threshold lights.',
    weather: 'dusk',
    time: 20.4,
    rings: 3,
    drones: 0,
    drops: 0,
    fuel: 100,
  },
];
