window.addEventListener('error', (event) => {
  const node = document.getElementById('status');
  if (node) node.textContent = 'ERR ' + (event.message || '') + ' @ ' + (event.filename || '') + ':' + (event.lineno || 0);
  document.title = 'ERR ' + (event.message || '');
});
window.addEventListener('unhandledrejection', (event) => {
  const node = document.getElementById('status');
  const text = String(event.reason && event.reason.stack ? event.reason.stack : event.reason);
  if (node) node.textContent = 'REJ ' + text;
  document.title = 'REJ ' + text;
});
// Boot, screens and the main loop: title → mission select → briefing → flight → debrief, with the
// simulation stepped on a fixed 60 Hz tick and the world drawn once per animation frame.

const canvas = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const statusLine = document.getElementById('status');
const bootLine = document.getElementById('boot');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.6, 26000);

const terrain = createTerrain(scene);
const sky = createSky(scene, renderer);
const aircraft = createAircraft();
scene.add(aircraft.group);
scene.add(aircraft.shadow);
const flight = createFlight(terrain);
const rig = createCameraRig(camera);
const hud = createHud(hudCanvas);
const input = createInput(hudCanvas);
const effects = createEffects(scene);
const entities = createEntities(scene, terrain);
const audio = createAudio();
const missions = createMissions({ flight, entities, effects, audio });
const shots = createShotRunner({ scene, camera, sky, flight, aircraft, rig, entities, missions, effects, hud, renderer, terrain });

const random = createRandom(99);
const bestScores = {};
try {
  const stored = JSON.parse(window.localStorage.getItem('sirocco.best') || '{}');
  Object.assign(bestScores, stored);
} catch (error) {
  void error;
}

let screen = 'title';
let selected = 0;
let menuIndex = 0;
let muted = false;
let paused = false;
let frame = 0;
let accumulator = 0;
let lastTime = performance.now();
let damageFlash = 0;
let lastHull = 100;
let shotMode = null;

try {
  shotMode = new URLSearchParams(window.location.search).get('shot');
} catch (error) {
  void error;
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  hud.resize();
}

window.addEventListener('resize', resize);
resize();

function startMission(def, options = {}) {
  missions.start(def);
  sky.setWeather(def.weather);
  rig.setMode(options.mode || 'chase');
  effects.reset();
  aircraft.group.position.copy(flight.state.position);
  aircraft.group.quaternion.copy(flight.state.quaternion);
  aircraft.group.visible = options.showAircraft !== false;
  rig.reset(flight);
  screen = 'flying';
  paused = false;
  statusLine.textContent = `${def.name}: ${def.brief}`;
  audio.resume();
}

function updateFlight(dt) {
  const sample = input.sample();
  sample.fire = sample.fire || input.keys.has('KeyF');
  const state = flight.update(dt, sample);

  if (state.hull < lastHull) damageFlash = 1;
  lastHull = state.hull;
  damageFlash = Math.max(0, damageFlash - dt * 1.6);

  aircraft.group.position.copy(state.position);
  aircraft.group.quaternion.copy(state.quaternion);
  aircraft.placeShadow(terrain.heightAt(state.position.x, state.position.z), sky.direction, state.agl);
  aircraft.update(dt, {
    throttle: state.throttle,
    gearDown: state.gearDown,
    flap: state.flap,
    controls: state.controls,
    airspeed: state.speed,
  });

  if (sample.fire && screen === 'flying') missions.shoot(camera);
  missions.update(dt, camera);
  effects.update(dt, state);
  rig.update(dt, flight);
  sky.update(dt, camera);

  if (missions.phase === 'complete' || missions.phase === 'failed') {
    const result = missions.result;
    if (result && result.success) {
      bestScores[missions.mission.id] = Math.max(bestScores[missions.mission.id] || 0, result.score);
      try {
        window.localStorage.setItem('sirocco.best', JSON.stringify(bestScores));
      } catch (error) {
        void error;
      }
    }
    screen = 'debrief';
  }
}

function frameView() {
  if (screen === 'flying' || screen === 'paused') {
    hud.drawFlight({
      state: flight.state,
      camera,
      mission: missions.mission,
      targets: missions.targets(),
      objective: missions.objective,
      objectiveSub: missions.objectiveSub,
      progress: missions.progress,
      score: missions.score,
      clock: missions.clock(),
      message: missions.message,
      messageAlpha: missions.messageAlpha,
      pullUp: missions.pullUp,
      panel: rig.mode === 'cockpit' ? 'full' : 'compact',
      hint: rig.mode === 'cockpit' ? 'G GEAR   Z X FLAPS   SHIFT/CTRL THROTTLE   F GUNS' : 'W S PITCH   A D ROLL   Q E RUDDER   SHIFT THROTTLE   G GEAR   C VIEW',
    });
    if (paused) hud.drawPaused();
  } else if (screen === 'title') {
    hud.drawTitle({
      subtitle: 'A light aircraft, one coastline, four jobs. Keyboard or mouse, nothing to install.',
      items: ['Start a job', 'Controls'],
      selected: menuIndex,
    });
  } else if (screen === 'controls') {
    hud.drawBriefing({
      mission: {
        name: 'Controls',
        brief: 'A D roll · W S pitch · Q E rudder · Shift and Ctrl throttle · G gear · Z X flaps · B brakes · F guns · C camera · Esc pause · M mute',
        detail: 'Fly with the keyboard, or hold the left mouse button and steer with the pointer. The strip is always runway 09; call the numbers on final and keep the sink under 2 m/s.',
      },
      route: 'Kestrel Strip, runway 09',
      weather: 'Whatever the job asks for',
    });
    hud.ctx.fillStyle = 'rgba(0,0,0,0)';
  } else if (screen === 'select') {
    hud.drawSelect({ missions: MISSIONS, selected, best: bestScores });
  } else if (screen === 'briefing') {
    const mission = MISSIONS[selected];
    hud.drawBriefing({
      mission,
      route:
        mission.id === 'ridge'
          ? 'Six gates through the eastern pass, then runway 09'
          : mission.id === 'lifeline'
            ? 'Three valley markers, then runway 09'
            : mission.id === 'watch'
              ? 'Four survey drones over the front, then runway 09'
              : 'Three coast beacons, then a night landing',
      weather:
        mission.weather === 'clear'
          ? 'Clear, light wind, good visibility'
          : mission.weather === 'haze'
            ? 'Warm haze, low sun in the west'
            : mission.weather === 'storm'
              ? 'Storm cells, heavy air, lightning'
              : 'Dusk into night, strip unlit until called',
    });
  } else if (screen === 'debrief') {
    hud.drawDebrief({ mission: missions.mission, success: missions.result?.success ?? false, rows: missions.debriefRows() });
  }
}

function handleMenuKeys() {
  if (screen === 'title') {
    if (input.consume('ArrowDown') || input.consume('KeyS')) menuIndex = (menuIndex + 1) % 2;
    if (input.consume('ArrowUp') || input.consume('KeyW')) menuIndex = (menuIndex + 1) % 2;
    if (input.consume('Enter') || input.consume('Space')) {
      audio.resume();
      screen = menuIndex === 0 ? 'select' : 'controls';
      input.clearPressed();
    }
    return;
  }
  if (screen === 'controls' || screen === 'briefing' || screen === 'debrief') {
    if (input.consume('Enter') || input.consume('Space')) {
      if (screen === 'briefing') startMission(MISSIONS[selected]);
      else if (screen === 'debrief') {
        screen = 'flying';
        missions.phase = 'flying';
        startMission(missions.mission);
      } else screen = 'title';
    }
    if (input.consume('Escape')) screen = screen === 'briefing' ? 'select' : 'title';
    return;
  }
  if (screen === 'select') {
    if (input.consume('ArrowRight') || input.consume('KeyD')) selected = (selected + 1) % MISSIONS.length;
    if (input.consume('ArrowLeft') || input.consume('KeyA')) selected = (selected + MISSIONS.length - 1) % MISSIONS.length;
    if (input.consume('ArrowDown')) selected = (selected + 2) % MISSIONS.length;
    if (input.consume('ArrowUp')) selected = (selected + 2) % MISSIONS.length;
    if (input.consume('Enter') || input.consume('Space')) screen = 'briefing';
    if (input.consume('Escape')) screen = 'title';
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.06, (now - lastTime) / 1000);
  lastTime = now;
  frame += 1;

  if (shotMode) {
    shots.update(rawDt);
    return;
  }

  handleMenuKeys();
  if (input.consume('KeyC') && screen === 'flying') {
    rig.setMode(rig.mode === 'chase' ? 'cockpit' : rig.mode === 'cockpit' ? 'chase' : 'orbit');
  }
  if (input.consume('KeyM')) muted = audio.toggleMute();
  if (input.consume('Escape') && screen === 'flying') paused = !paused;

  if (screen === 'flying' && !paused) {
    accumulator += rawDt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      updateFlight(STEP);
      accumulator -= STEP;
      steps += 1;
      if (screen !== 'flying') break;
    }
    audio.update(flight.state, rawDt);
  } else if (screen === 'paused') {
    rig.update(rawDt, flight);
    sky.update(rawDt, camera);
  } else {
    // Idle camera orbit over the strip for the menus.
    const t = now * 0.00006;
    camera.position.set(AIRPORT.x + Math.cos(t) * 260, AIRPORT.elevation + 120, AIRPORT.z + Math.sin(t) * 260);
    camera.lookAt(AIRPORT.x, AIRPORT.elevation + 30, AIRPORT.z);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    sky.update(rawDt, camera);
    entities.update(rawDt, {});
  }

  frameView();
  renderer.render(scene, camera);
}

if (shotMode) {
  bootLine.style.display = 'none';
  shots.start(shotMode);
} else {
  bootLine.style.display = 'none';
  flight.reset();
  aircraft.group.visible = false;
  screen = 'title';
}

window.addEventListener('pointerdown', () => audio.resume());
window.addEventListener('keydown', () => audio.resume());
requestAnimationFrame(loop);

window.sirocco = {
  scene,
  aircraftGroup: aircraft.group,
  flight,
  missions,
  entities,
  screen: () => screen,
  setScreen: (next) => {
    screen = next;
  },
  startMission,
  camera,
  frame: () => frame,
};
