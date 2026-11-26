// The four screenshots are real frames of this build, taken from staged states of the actual game:
// the same terrain, the same aircraft, the same HUD, the same weather system. `?shot=name` poses a
// scenario, renders it, and reports when the frame is ready.

const SHOT_TARGETS = {
  '1-cover': { mission: 'ridge', mode: 'chase', weather: 'dawn' },
  '2-storm': { mission: 'watch', mode: 'chase', weather: 'storm' },
  '3-landing': { mission: 'ridge', mode: 'chase', weather: 'haze' },
  '4-cockpit': { mission: 'dusk', mode: 'cockpit', weather: 'dusk' },
  'aircraft': { mission: 'ridge', mode: 'chase', weather: 'clear' },
};

function createShotRunner(context) {
  const { scene, camera, sky, flight, aircraft, rig, entities, missions, effects, hud, renderer, terrain } = context;
  let frames = 0;
  let built = false;
  let lastView = null;

  function paint(view) {
    hud.drawFlight(view);
    lastView = view;
  }

  function pose(position, heading, pitch, bank, speed, throttle, options = {}) {
    const state = flight.state;
    state.position.copy(position);
    state.quaternion.setFromEuler(new THREE.Euler(pitch, heading, bank, 'YXZ'));
    state.speed = speed;
    state.throttle = throttle;
    state.velocity.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion).multiplyScalar(speed));
    state.onGround = false;
    state.gearDown = options.gearDown ?? false;
    state.flap = options.flap ?? 0;
    state.hull = options.hull ?? 100;
    state.fuel = options.fuel ?? 74;
    state.crashed = false;
    state.heading = ((-heading * 180) / Math.PI + 720) % 360;
    state.bank = bank;
    state.pitch = pitch;
    state.altitude = position.y;
    state.agl = position.y - terrain.heightAt(position.x, position.z);
    state.verticalSpeed = state.velocity.y;
    state.stall = 0;
    state.overspeed = 0;
    state.gLoad = 1;
    state.touchdownRate = 0;
    aircraft.group.position.copy(state.position);
    aircraft.group.quaternion.copy(state.quaternion);
    aircraft.group.visible = true;
    aircraft.placeShadow(terrain.heightAt(position.x, position.z), sky.direction, state.agl);
  }

  function chaseCamera(distance, height, look, lateral = 0, lookLateral = 0) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flight.state.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(flight.state.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(flight.state.quaternion);
    camera.position
      .copy(flight.state.position)
      .addScaledVector(forward, -distance)
      .addScaledVector(up, height)
      .addScaledVector(right, lateral);
    camera.up.set(0, 1, 0);
    const aim = flight.state.position
      .clone()
      .addScaledVector(forward, look)
      .addScaledVector(right, lookLateral)
      .add(new THREE.Vector3(0, 3.6, 0));
    camera.lookAt(aim);
    camera.fov = 58;
    camera.updateProjectionMatrix();
  }

  function cockpitCamera() {
    camera.position
      .copy(flight.state.position)
      .add(new THREE.Vector3(0, 0.98, -0.35).applyQuaternion(flight.state.quaternion));
    camera.quaternion.copy(flight.state.quaternion);
    camera.fov = 76;
    camera.updateProjectionMatrix();
  }

  function gate(offsetForward, lateral, drop, radius = 42) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flight.state.quaternion).setY(0).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(flight.state.quaternion).setY(0).normalize();
    const center = flight.state.position
      .clone()
      .addScaledVector(forward, offsetForward)
      .addScaledVector(right, lateral)
      .add(new THREE.Vector3(0, -drop, 0));
    const floor = terrain.heightAt(center.x, center.z) + radius + 26;
    if (center.y < floor) center.y = floor;
    return entities.addRing(center, forward, radius);
  }

  function cover() {
    const heading = -1.235;
    const base = new THREE.Vector3(-1450, 0, -360);
    base.y = terrain.heightAt(base.x, base.z) + 95;
    pose(base, heading, 0.035, -0.26, 57, 0.8, { hull: 97, fuel: 62 });
    entities.clear();
    gate(400, 420, 14, 50);
    gate(1180, 640, -110, 68);
    chaseCamera(16.5, 1.4, 26, -2.0, 11);
    paint({
      state: flight.state,
      camera,
      mission: MISSIONS[0],
      targets: [
        {
          position: entities.rings[0].group.position.clone(),
          label: 'GATE 1',
          detail: `${(entities.rings[0].group.position.distanceTo(flight.state.position) / 1000).toFixed(1)} km`,
          color: '#ffca55',
          size: 24,
        },
        {
          position: entities.rings[1].group.position.clone(),
          label: 'GATE 2',
          detail: `${(entities.rings[1].group.position.distanceTo(flight.state.position) / 1000).toFixed(1)} km`,
          color: 'rgba(255,202,85,0.6)',
          size: 15,
        },
      ],
      objective: 'Gate 1 of 6',
      objectiveSub: 'Cross each ring on the level',
      progress: 0.04,
      score: 0,
      clock: '9:12',
      message: '',
      pullUp: false,
      panel: 'compact',
      hint: '',
    });
  }

  function storm() {
    const heading = -1.02;
    const base = new THREE.Vector3(-620, 0, 300);
    base.y = terrain.heightAt(base.x, base.z) + 300;
    pose(base, heading, 0.05, -0.19, 61, 0.9, { hull: 71, fuel: 54 });
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flight.state.quaternion);
    const dronePos = flight.state.position.clone().addScaledVector(forward, 185).add(new THREE.Vector3(-10, 10, 0));
    const drone = entities.addDrone(dronePos, 0.001, 0.001, 0.4);
    drone.group.position.copy(dronePos);
    drone.alive = false;
    drone.group.rotation.z = 0.6;
    effects.explosion(dronePos, 1.5);
    effects.burst(dronePos.clone().add(new THREE.Vector3(0, 6, 0)), 18, {
      color: 0x2e3238,
      size: 22,
      life: 3.2,
      growth: 26,
      gravity: 1.4,
      opacity: 0.5,
      spread: 12,
      lift: 5,
    });
    for (let i = 0; i < 6; i += 1) {
      const origin = flight.state.position
        .clone()
        .add(new THREE.Vector3(0, 0.1, -5).applyQuaternion(flight.state.quaternion));
      const dir = dronePos.clone().sub(origin).normalize();
      dir.x += (i - 3) * 0.01;
      dir.y += (i - 3) * 0.006;
      effects.fire(origin, dir.normalize(), { speed: 240 });
    }
    entities.spawnFlak(flight.state.position.clone().addScaledVector(forward, 300).add(new THREE.Vector3(-150, 40, 0)));
    chaseCamera(17, 2.6, 30, -3.4, 12);
    paint({
      state: flight.state,
      camera,
      mission: MISSIONS[2],
      targets: [{ position: dronePos.clone(), label: 'DRONE', detail: 'DOWN', color: '#ff8a6e', size: 22 }],
      objective: 'Drone 2 of 4',
      objectiveSub: 'F to fire — hold the pipper on the drone',
      progress: 0.35,
      score: 640,
      clock: '13:02',
      message: 'Drone down — two left',
      messageAlpha: 0.85,
      pullUp: false,
      panel: 'compact',
      hint: 'G GEAR   Z X FLAPS   SHIFT/CTRL THROTTLE   F GUNS',
    });
  }

  function landing() {
    const x = AIRPORT.x - AIRPORT.length * 0.5 - 620;
    const y = AIRPORT.elevation + 44;
    pose(new THREE.Vector3(x, y, AIRPORT.z + 12), -Math.PI / 2, -0.055, 0.02, 41, 0.32, {
      gearDown: true,
      flap: 1,
      hull: 93,
      fuel: 46,
    });
    entities.clear();
    chaseCamera(17, 1.9, 28, -2.8, 14);
    paint({
      state: flight.state,
      camera,
      mission: MISSIONS[0],
      targets: [
        {
          position: new THREE.Vector3(AIRPORT.x - AIRPORT.length * 0.5, AIRPORT.elevation + 16, AIRPORT.z),
          label: 'RUNWAY 09',
          detail: '1.2 km',
          color: '#7dffa8',
          size: 24,
        },
      ],
      objective: 'Recover at Kestrel Strip',
      objectiveSub: 'Gear down · flaps full · sink under 2 m/s',
      progress: 1,
      score: 1180,
      clock: '6:44',
      message: 'Kestrel, cleared to land runway 09',
      messageAlpha: 0.85,
      pullUp: false,
      panel: 'compact',
      hint: 'GEAR DOWN   FLAPS FULL   SINK < 2 m/s',
    });
  }

  function cockpitDusk() {
    const base = new THREE.Vector3(-2600, 0, 1620);
    base.y = terrain.heightAt(base.x, base.z) + 260;
    pose(base, -1.02, 0.02, 0.05, 54, 0.68, { hull: 88, fuel: 41 });
    entities.clear();
    const headingVec = new THREE.Vector3(0, 0, -1).applyQuaternion(flight.state.quaternion).setY(0).normalize();
    const sideVec = new THREE.Vector3(1, 0, 0).applyQuaternion(flight.state.quaternion).setY(0).normalize();
    for (let i = 0; i < 3; i += 1) {
      const spot = flight.state.position
        .clone()
        .addScaledVector(headingVec, 900 + i * 1100)
        .addScaledVector(sideVec, 320 - i * 240);
      entities.addBeacon(spot.x, spot.z, i);
    }
    cockpitCamera();
    const beacon = entities.beacons[0];
    paint({
      state: flight.state,
      camera,
      mission: MISSIONS[3],
      targets: [
        {
          position: new THREE.Vector3(beacon.x, beacon.y + 47, beacon.z),
          label: 'BEACON 1',
          detail: '0.9 km',
          color: '#8ff0ff',
          size: 16,
        },
        {
          position: new THREE.Vector3(AIRPORT.x, AIRPORT.elevation + 12, AIRPORT.z),
          label: 'RUNWAY 09',
          detail: '2.8 km',
          color: '#7dffa8',
          size: 13,
        },
      ],
      objective: 'Beacon 1 of 3',
      objectiveSub: 'Follow the light masts down the coast',
      progress: 0.33,
      score: 420,
      clock: '18:12',
      message: '',
      pullUp: false,
      panel: 'full',
      hint: 'LIGHTS DOWN THE COAST — RUNWAY 09 AFTER',
    });
  }

  function setup(name) {
    const config = SHOT_TARGETS[name] || SHOT_TARGETS['1-cover'];
    const mission = MISSIONS.find((entry) => entry.id === config.mission) || MISSIONS[0];
    missions.start(mission);
    sky.setWeather(config.weather);
    effects.reset();
    rig.setMode(config.mode);

    if (name === 'aircraft') {
      const base = new THREE.Vector3(-1450, 0, -360);
      base.y = terrain.heightAt(base.x, base.z) + 320;
      pose(base, -1.235, 0.02, 0, 52, 0.55, {});
      entities.clear();
      camera.position.copy(flight.state.position).add(new THREE.Vector3(-11, 4.5, 13));
      camera.lookAt(flight.state.position);
      camera.fov = 45;
      camera.updateProjectionMatrix();
      paint({ state: flight.state, camera, mission: MISSIONS[0], targets: [], objective: 'Aircraft inspection', objectiveSub: '', progress: 0, score: 0, clock: '', message: '', pullUp: false, panel: 'compact', hint: '' });
    }
    else if (name === '2-storm') storm();
    else if (name === '3-landing') landing();
    else if (name === '4-cockpit') cockpitDusk();
    else cover();

    built = true;
    document.title = 'Sirocco — shot ready';
  }

  // Exact screen positions of the things that matter, so framing can be checked by number and not
  // by squinting at a thumbnail.
  function publishDiagnostics() {
    camera.updateMatrixWorld(true);
    const project = (vector) => {
      const point = vector.clone().project(camera);
      return [Math.round((point.x * 0.5 + 0.5) * window.innerWidth), Math.round((-point.y * 0.5 + 0.5) * window.innerHeight)];
    };
    const ringSize = entities.rings.map((ring) => {
      const center = ring.group.position.clone();
      const edge = center.clone().add(new THREE.Vector3(ring.radius, 0, 0));
      const a = project(center);
      const b = project(edge);
      return Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]));
    });
    window.__diag = {
      plane: project(flight.state.position),
      rings: entities.rings.map((ring) => project(ring.group.position)),
      ringPixels: ringSize,
      ringWorld: entities.rings.map((ring) => ring.group.position.toArray().map(Math.round)),
      sun: project(camera.position.clone().addScaledVector(sky.direction, 6000)),
      runway: project(new THREE.Vector3(AIRPORT.x - AIRPORT.length * 0.5, AIRPORT.elevation + 2, AIRPORT.z)),
      planeWorld: flight.state.position.toArray().map(Math.round),
      forward: new THREE.Vector3(0, 0, -1).applyQuaternion(flight.state.quaternion).toArray().map((v) => Number(v.toFixed(2))),
      camera: camera.position.toArray().map(Math.round),
      viewport: [window.innerWidth, window.innerHeight],
    };
  }

  function start(name) {
    frames = 0;
    built = false;
    setup(name);
  }

  function update(dt) {
    if (!built) return;
    frames += 1;
    aircraft.update(dt, {
      throttle: flight.state.throttle,
      gearDown: flight.state.gearDown,
      flap: flight.state.flap,
      controls: flight.state.controls,
      airspeed: flight.state.speed,
    });
    effects.update(dt, flight.state);
    entities.update(dt, {});
    sky.update(dt, camera);
    aircraft.placeShadow(
      terrain.heightAt(flight.state.position.x, flight.state.position.z),
      sky.direction,
      flight.state.agl,
    );
    renderer.render(scene, camera);
    if (lastView) hud.drawFlight(lastView);
    if (frames === 2) publishDiagnostics();
    if (frames === 8) window.__shotReady = true;
  }

  return { start, update };
}
