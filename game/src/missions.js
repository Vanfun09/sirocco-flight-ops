// The jobs: what to fly through, what to drop, what to shoot, when the strip counts as recovered.
// One manager owns the objective state, the clock, the score and the end-of-mission report.

const km = (meters) => (meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`);

function createMissions({ flight, entities, effects, audio }) {
  let current = MISSIONS[0];
  let phase = 'briefing';
  let score = 0;
  let timeLeft = 0;
  let elapsed = 0;
  let flown = false;
  let ringsPassed = 0;
  let dropsMade = 0;
  let dronesDown = 0;
  let message = '';
  let messageTimer = 0;
  let messageAlpha = 1;
  let pullUp = false;
  let gunCooldown = 0;
  let landedTimer = 0;
  let result = null;
  let shotsFired = 0;
  let shotsHit = 0;
  let distanceFlown = 0;
  let sightseeingPoints = 0;
  let sightseeingMeter = 0;
  const lastPosition = new THREE.Vector3();

  function start(def) {
    current = def;
    phase = 'flying';
    score = 0;
    elapsed = 0;
    timeLeft = def.time * 60;
    flown = false;
    ringsPassed = 0;
    dropsMade = 0;
    dronesDown = 0;
    result = null;
    landedTimer = 0;
    shotsFired = 0;
    shotsHit = 0;
    distanceFlown = 0;
    sightseeingPoints = 0;
    sightseeingMeter = 0;
    message = def.brief;
    messageTimer = 6;
    entities.clear();

    const spawn = { x: -2400, z: 780, heading: -1.42 };
    const y = 560;
    flight.reset({ x: spawn.x, y, z: spawn.z, heading: spawn.heading, speed: 52 });
    const state = flight.state;
    state.throttle = 0.66;
    state.gearDown = false;
    state.onGround = false;
    state.velocity.copy(flight.forward(new THREE.Vector3())).multiplyScalar(52);
    state.velocity.y = -2;
    state.agl = 320;
    lastPosition.copy(state.position);

    if (def.id === 'ridge') {
      entities.buildCourse(def.rings, { startX: 300, startZ: 260, heading: 0.08 });
    } else if (def.id === 'lifeline') {
      entities.buildDrops(def.drops);
    } else if (def.id === 'watch') {
      entities.buildPatrol(def.drones);
    } else if (def.id === 'dusk') {
      entities.buildCoastBeacons(3);
    }
    return current;
  }

  function say(text, seconds = 3.4) {
    message = text;
    messageTimer = seconds;
    messageAlpha = 1;
  }

  function objectivesDone() {
    if (current.id === 'ridge') return ringsPassed >= current.rings;
    if (current.id === 'lifeline') return dropsMade >= current.drops;
    if (current.id === 'watch') return dronesDown >= current.drones;
    if (current.id === 'dusk') return entities.beacons.every((beacon) => beacon.visited);
    return true;
  }

  function objectiveText() {
    if (current.id === 'ridge') {
      return objectivesDone() ? 'Return to Kestrel Strip' : `Gate ${Math.min(ringsPassed + 1, current.rings)} of ${current.rings}`;
    }
    if (current.id === 'lifeline') {
      return objectivesDone() ? 'Recover at Kestrel Strip' : `Crate ${Math.min(dropsMade + 1, current.drops)} of ${current.drops}`;
    }
    if (current.id === 'watch') {
      return objectivesDone() ? 'RTB and land' : `Drone ${Math.min(dronesDown + 1, current.drones)} of ${current.drones}`;
    }
    if (current.id === 'dusk') {
      const next = entities.beacons.find((beacon) => !beacon.visited);
      return next ? `Beacon ${next.index + 1} of 3` : 'Land at Kestrel Strip';
    }
    return `${km(distanceFlown)} flown`;
  }

  function objectiveSub() {
    if (!objectivesDone()) {
      if (current.id === 'lifeline') return 'Fly the marker under 120 m — the crate goes when you are lined up';
      if (current.id === 'watch') return 'F to fire — hold the pipper on the drone';
      if (current.id === 'ridge') return 'Fly the ring, not the horizon';
      return 'Follow the light masts down the coast';
    }
    if (current.id === 'free') return 'No job to finish — the strip is always open';
    return 'Runway 09 — gear down, flaps two, land';
  }

  function progress() {
    if (current.id === 'ridge') return ringsPassed / current.rings;
    if (current.id === 'lifeline') return dropsMade / current.drops;
    if (current.id === 'watch') return dronesDown / current.drones;
    if (current.id === 'dusk') return entities.beacons.filter((beacon) => beacon.visited).length / 3;
    return 1;
  }

  function finish(success, reason = '') {
    if (phase !== 'flying') return;
    phase = success ? 'complete' : 'failed';
    const landing = flight.state.touchdownRate;
    const soft = landing < 2.2;
    if (success) {
      score += soft ? SCORE.landingSoft : SCORE.landingHard;
      // Open Skies carries no clock pressure, so it pays no time bonus.
      if (current.id !== 'free') score += Math.round(timeLeft * SCORE.timeBonus);
    } else {
      score += SCORE.crash;
    }
    result = {
      success,
      reason,
      score: Math.max(0, Math.round(score)),
      rings: ringsPassed,
      drops: dropsMade,
      drones: dronesDown,
      landing: landing,
      soft,
      time: elapsed,
      distance: Math.round(distanceFlown),
      sightseeing: sightseeingPoints,
      accuracy: shotsFired ? Math.round((shotsHit / shotsFired) * 100) : 0,
    };
    audio.chime(success);
  }

  function update(dt, camera) {
    messageTimer -= dt;
    messageAlpha = clamp(messageTimer / 0.8, 0, 1);
    if (phase !== 'flying') return;
    elapsed += dt;
    timeLeft -= dt;
    gunCooldown -= dt;

    const state = flight.state;
    if (state.agl > 22) flown = true;
    pullUp = !state.onGround && state.agl < 26 && state.verticalSpeed < -6 && state.speed > 52;

    entities.update(dt, { player: state });

    const step = Math.hypot(state.position.x - lastPosition.x, state.position.z - lastPosition.z);
    // A reset or a teleport would otherwise pay out a whole lap in one frame.
    if (step < 240) distanceFlown += step;
    lastPosition.copy(state.position);
    if (current.id === 'free') {
      sightseeingMeter += step < 240 ? step : 0;
      while (sightseeingMeter >= SIGHTSEEING_METERS) {
        sightseeingMeter -= SIGHTSEEING_METERS;
        sightseeingPoints += SCORE.sightseeing;
        score += SCORE.sightseeing;
      }
    }

    while (entities.events.length) {
      const event = entities.events.shift();
      if (event.type === 'ring') {
        ringsPassed += 1;
        const clean = Math.abs(state.bank) < 0.5;
        score += SCORE.ring + (clean ? 40 : 0);
        audio.chime(true);
        say(ringsPassed >= current.rings ? 'All gates — return to the strip' : `Gate ${ringsPassed} clean`);
      } else if (event.type === 'drone') {
        dronesDown += 1;
        score += SCORE.drone;
        audio.chime(true);
        say(`Drone down — ${current.drones - dronesDown} left`);
      }
    }

    for (const zone of entities.drops) {
      if (zone.scored) continue;
      const dx = state.position.x - zone.x;
      const dz = state.position.z - zone.z;
      const distance = Math.hypot(dx, dz);
      zone.armed = distance < 320 && state.agl < 260;
      if (distance < 110 && state.agl < 150 && state.speed < 95) {
        zone.scored = true;
        dropsMade += 1;
        score += SCORE.drop;
        audio.chime(true);
        say(`Crate ${zone.label} away`);
        effects.burst(new THREE.Vector3(zone.x, zone.y + 6, zone.z), 10, {
          color: 0xdff7ff,
          size: 9,
          life: 1.2,
          growth: 22,
          opacity: 0.7,
        });
      }
    }

    for (const beacon of entities.beacons) {
      if (beacon.visited) continue;
      const dx = state.position.x - beacon.x;
      const dz = state.position.z - beacon.z;
      if (Math.hypot(dx, dz) < 240 && state.agl > 60) {
        beacon.visited = true;
        ringsPassed += 1;
        score += SCORE.ring;
        audio.chime(true);
        say(`Beacon ${beacon.index + 1} logged`);
      }
    }

    // Drones defend themselves: flak bursts near the player, and the occasional hit lands.
    for (const drone of entities.drones) {
      if (!drone.alive) continue;
      drone.cooldown -= dt;
      const distance = drone.group.position.distanceTo(state.position);
      if (distance < MISSION_META.flakRange && drone.cooldown <= 0) {
        drone.cooldown = 2.6 + Math.random() * 2.2;
        const lead = state.position.clone().addScaledVector(state.velocity, distance / 260);
        const spread = new THREE.Vector3(
          (Math.random() - 0.5) * 60,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 60,
        );
        lead.add(spread);
        entities.spawnFlak(lead);
        audio.thump(0.4);
        if (Math.random() < 0.22) {
          flight.damage(4 + Math.random() * 5, 'flak');
          audio.alarm();
        }
      }
    }

    const onRunway =
      Math.abs(state.position.x - AIRPORT.x) < AIRPORT.length / 2 &&
      Math.abs(state.position.z - AIRPORT.z) < AIRPORT.width / 2;
    if (state.onGround && onRunway && state.speed < 14 && flown) {
      landedTimer += dt;
      if (landedTimer < 0.1) audio.thump(clamp(state.touchdownRate / 4, 0.3, 1));
      if (landedTimer > 0.9) {
        if (objectivesDone()) finish(true);
        else finish(false, 'landed with the job unfinished');
      }
    } else {
      landedTimer = 0;
    }

    if (state.crashed) finish(false, state.crashReason || 'crashed');
    if (timeLeft <= 0) finish(false, 'out of time');
    if (state.fuel <= 0 && state.agl < 60) finish(false, 'out of fuel');
  }

  function shoot(camera) {
    if (phase !== 'flying' || gunCooldown > 0) return;
    gunCooldown = 0.085;
    const state = flight.state;
    const origin = state.position.clone().add(new THREE.Vector3(0, -0.2, -4.6).applyQuaternion(state.quaternion));
    const direction = flight.forward(new THREE.Vector3());
    effects.fire(origin, direction);
    shotsFired += 1;
    audio.gun();
    const hit = entities.hitScan(state.position, direction, 900);
    if (hit) {
      shotsHit += 1;
      hit.hp -= 1;
      effects.burst(hit.group.position.clone(), 5, { color: 0xffcf7a, glow: true, size: 5, life: 0.4, growth: 12 });
      if (hit.hp <= 0) {
        entities.destroyDrone(hit);
        effects.explosion(hit.group.position.clone(), 1.1);
      }
    }
    void camera;
  }

  function targets() {
    const list = [];
    const state = flight.state;
    if (current.id === 'ridge') {
      entities.rings.forEach((ring, index) => {
        if (ring.passed) return;
        const firstUnpassed = entities.rings.find((candidate) => !candidate.passed) === ring;
        if (!firstUnpassed && index > 1) return;
        list.push({
          position: ring.group.position.clone(),
          label: `GATE ${index + 1}`,
          detail: km(ring.group.position.distanceTo(state.position)),
          color: firstUnpassed ? '#ffca55' : 'rgba(255,202,85,0.55)',
          size: firstUnpassed ? 22 : 12,
        });
      });
    } else if (current.id === 'lifeline') {
      entities.drops.forEach((zone) => {
        if (zone.scored) return;
        list.push({
          position: new THREE.Vector3(zone.x, zone.y + 8, zone.z),
          label: `DROP ${zone.label}`,
          detail: km(Math.hypot(zone.x - state.position.x, zone.z - state.position.z)),
          color: '#7dffa8',
          size: 18,
        });
      });
    } else if (current.id === 'watch') {
      entities.drones.forEach((drone) => {
        if (!drone.alive) return;
        list.push({
          position: drone.group.position.clone(),
          label: 'DRONE',
          detail: km(drone.group.position.distanceTo(state.position)),
          color: '#ff8a6e',
          size: 20,
        });
      });
    } else if (current.id === 'dusk') {
      entities.beacons.forEach((beacon) => {
        if (beacon.visited) return;
        list.push({
          position: new THREE.Vector3(beacon.x, beacon.y + 47, beacon.z),
          label: 'BEACON',
          detail: km(Math.hypot(beacon.x - state.position.x, beacon.z - state.position.z)),
          color: '#8ff0ff',
          size: 18,
        });
      });
    }

    if (objectivesDone()) {
      list.push({
        position: new THREE.Vector3(AIRPORT.x, AIRPORT.elevation + 12, AIRPORT.z),
        label: 'RUNWAY 09',
        detail: km(Math.hypot(AIRPORT.x - state.position.x, AIRPORT.z - state.position.z)),
        color: '#7dffa8',
        size: 22,
      });
    }
    return list;
  }

  function debriefRows() {
    if (!result) return [];
    const rows = [
      { label: 'Gates', value: String(result.rings) },
      { label: 'Crates', value: String(result.drops) },
      { label: 'Drones', value: String(result.drones) },
    ];
    if (current.id === 'free') {
      rows.push({ label: 'Distance', value: km(result.distance) });
      rows.push({ label: 'Sightseeing', value: `+${result.sightseeing}`, color: '#8ff0ff' });
    }
    rows.push({
      label: 'Touchdown',
      value: result.success ? `${result.landing.toFixed(1)} m/s ${result.soft ? 'soft' : 'firm'}` : result.reason,
      color: result.success ? '#7dffa8' : '#ff6b5e',
    });
    rows.push({ label: 'Time on task', value: `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}` });
    rows.push({ label: 'Score', value: String(result.score), color: '#ffca55' });
    return rows;
  }

  function clock() {
    const total = Math.max(0, Math.floor(timeLeft));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  return {
    start,
    update,
    shoot,
    targets,
    debriefRows,
    clock,
    say,
    finish,
    get phase() {
      return phase;
    },
    set phase(value) {
      phase = value;
    },
    get mission() {
      return current;
    },
    get score() {
      return score;
    },
    get result() {
      return result;
    },
    get message() {
      return messageTimer > 0 ? message : '';
    },
    get messageAlpha() {
      return messageAlpha;
    },
    get objective() {
      return objectiveText();
    },
    get objectiveSub() {
      return objectiveSub();
    },
    get progress() {
      return progress();
    },
    get pullUp() {
      return pullUp;
    },
    get stats() {
      return { ringsPassed, dropsMade, dronesDown, elapsed, timeLeft };
    },
  };
}
