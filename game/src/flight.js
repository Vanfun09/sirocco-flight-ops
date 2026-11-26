// Flight dynamics: a small, readable model that still behaves like an aeroplane — thrust versus
// drag on the flight path, lift that dies at the stall, banks that turn, gear and flaps that cost
// speed, and a touchdown that is either a landing or a wreck depending on how you arrive.

const UP = new THREE.Vector3(0, 1, 0);
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

function createFlight(terrain) {
  const state = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(),
    speed: 0,
    throttle: 0,
    gearDown: true,
    flap: 0,
    fuel: 100,
    hull: 100,
    engine: 100,
    onGround: true,
    crashed: false,
    crashReason: '',
    landed: false,
    agl: 0,
    altitude: 0,
    heading: 0,
    bank: 0,
    pitch: 0,
    aoa: 0,
    gLoad: 1,
    verticalSpeed: 0,
    stall: 0,
    overspeed: 0,
    airbrake: 0,
    touchdownRate: 0,
    time: 0,
    distanceFlown: 0,
    controls: { pitch: 0, roll: 0, yaw: 0 },
    buffet: 0,
  };

  function runwaySurface(x, z) {
    if (Math.abs(x - AIRPORT.x) <= AIRPORT.length / 2 && Math.abs(z - AIRPORT.z) <= AIRPORT.width / 2) {
      return AIRPORT.elevation + 0.55;
    }
    return terrain.heightAt(x, z);
  }

  function reset({ x = AIRPORT.x - 40, y = AIRPORT.elevation + 1.6, z = AIRPORT.z, heading = Math.PI / 2, speed = 0 } = {}) {
    state.position.set(x, y, z);
    state.quaternion.setFromEuler(new THREE.Euler(0, heading, 0, 'YXZ'));
    state.velocity.set(0, 0, 0);
    state.speed = speed;
    state.throttle = 0;
    state.gearDown = true;
    state.flap = 0;
    state.fuel = 100;
    state.hull = 100;
    state.engine = 100;
    state.onGround = true;
    state.crashed = false;
    state.crashReason = '';
    state.landed = false;
    state.time = 0;
    state.distanceFlown = 0;
    state.controls.pitch = 0;
    state.controls.roll = 0;
    state.controls.yaw = 0;
    state.touchdownRate = 0;
  }

  function forward(out = tmpForward) {
    return out.set(0, 0, -1).applyQuaternion(state.quaternion).normalize();
  }

  function right(out = tmpRight) {
    return out.set(1, 0, 0).applyQuaternion(state.quaternion).normalize();
  }

  function update(dt, input) {
    if (state.crashed) return state;
    dt = Math.min(dt, 0.05);
    state.time += dt;

    // Inputs move toward their targets so the aeroplane never snaps.
    const rate = 6.5;
    state.controls.pitch = damp(state.controls.pitch, input.pitch, rate, dt);
    state.controls.roll = damp(state.controls.roll, input.roll, rate * 1.15, dt);
    state.controls.yaw = damp(state.controls.yaw, input.yaw, rate * 0.8, dt);

    if (input.gearToggle) {
      state.gearDown = !state.gearDown;
      input.gearToggle = false;
    }
    if (input.flapUp) state.flap = clamp(state.flap - dt * 0.9, 0, 1);
    if (input.flapDown) state.flap = clamp(state.flap + dt * 0.9, 0, 1);
    if (input.throttleUp) state.throttle = clamp(state.throttle + dt * 0.75, 0, 1);
    if (input.throttleDown) state.throttle = clamp(state.throttle - dt * 0.85, 0, 1);

    const forwardVec = forward();
    const rightVec = right();
    const airspeed = Math.max(state.speed, 1);

    const authority = clamp(airspeed / 55, 0.25, 1.35);
    if (!state.onGround) {
      // Attitude limits keep a keyboard pilot out of trouble: the nose stops climbing at 55° and
      // the wings roll themselves level when the stick is centred.
      const noseUp = Math.asin(clamp(forwardVec.y, -1, 1));
      const pitchLimit = state.controls.pitch > 0 ? clamp((1.0 - noseUp) * 2.2, 0.15, 1) : 1;
      const pitchRate = FLIGHT.pitchRate * authority * state.controls.pitch * pitchLimit * (1 - state.stall * 0.45);
      const rollRate = FLIGHT.rollRate * authority * state.controls.roll;
      const yawRate = FLIGHT.yawRate * authority * state.controls.yaw;
      tmpEuler.set(pitchRate * dt, yawRate * dt, rollRate * dt, 'XYZ');
      state.quaternion.multiply(tmpQuat.setFromEuler(tmpEuler)).normalize();

      if (Math.abs(state.controls.roll) < 0.08 && Math.abs(bankAngle()) < 1.2) {
        const bank = bankAngle();
        const level = tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), clamp(bank, -0.6, 0.6) * dt * 1.15);
        state.quaternion.multiply(level).normalize();
      }

      // A banked wing turns the aeroplane: gravity provides the horizontal component of lift.
      const bankNow = bankAngle();
      const turnRate = (11.4 * Math.tan(clamp(bankNow, -1.15, 1.15))) / Math.max(airspeed, 26);
      const headingQuat = tmpQuat.setFromAxisAngle(UP, -turnRate * dt);
      state.quaternion.premultiply(headingQuat).normalize();
    } else {
      const steer = state.controls.yaw * 0.9 + state.controls.roll * 0.45;
      tmpEuler.set(0, -steer * dt * clamp(airspeed / 22, 0, 1.4), 0, 'YXZ');
      state.quaternion.multiply(tmpQuat.setFromEuler(tmpEuler)).normalize();
      const surfaceAngle = Math.atan2(
        terrain.heightAt(state.position.x + 3, state.position.z) - terrain.heightAt(state.position.x - 3, state.position.z),
        6,
      );
      if (state.position.z < -AIRPORT.width * 2 || state.position.z > AIRPORT.width * 2) {
        state.quaternion.setFromEuler(
          new THREE.Euler(surfaceAngle * 0.5, headingOf(), clamp(state.controls.roll * 0.12, -0.2, 0.2), 'YXZ'),
        );
      } else {
        state.quaternion.setFromEuler(new THREE.Euler(0, headingOf(), 0, 'YXZ'));
      }
    }

    forward(forwardVec);
    right(rightVec);

    // Along-path acceleration: thrust, drag, and the gravity component of the nose direction.
    const density = Math.exp(-state.position.y / 9000);
    const thrust = (FLIGHT.idleThrust + state.throttle * FLIGHT.maxThrust) * (state.engine / 100) * density;
    const dragCoef =
      FLIGHT.dragArea + (state.gearDown ? FLIGHT.gearDrag : 0) + state.flap * FLIGHT.flapDrag + state.airbrake * 0.3;
    const drag = 0.5 * 1.12 * dragCoef * state.speed * state.speed + FLIGHT.inducedDrag * state.speed * state.speed * 4.2;
    const gravityAlong = -9.81 * forwardVec.y;
    let accel = (thrust - drag) / FLIGHT.mass + gravityAlong;
    if (state.onGround) accel -= (input.brake ? FLIGHT.brakeDecel : FLIGHT.rollingFriction) * (state.speed > 0.4 ? 1 : 0);

    state.speed = clamp(state.speed + accel * dt, 0, FLIGHT.neverExceed * 1.5);
    state.throttle = clamp(state.throttle, 0, 1);

    // Stall: below flying speed the wing stops carrying, the nose falls and the airframe shakes.
    const stallSpeed = FLIGHT.stallSpeed * (1 - state.flap * 0.14);
    const stallFactor = clamp((stallSpeed - state.speed) / stallSpeed, 0, 1);
    state.stall = damp(state.stall, stallFactor, 4, dt);
    state.buffet = state.stall > 0.15 ? state.stall : 0;

    const velocityTarget = forwardVec.clone().multiplyScalar(state.speed);
    const follow = 1 - Math.exp(-(state.onGround ? 18 : 2.6) * dt);
    state.velocity.lerp(velocityTarget, follow);
    if (!state.onGround) {
      state.velocity.y -= state.stall * 26 * dt;
      if (state.buffet > 0) {
        state.velocity.x += (Math.random() - 0.5) * state.buffet * 9 * dt;
        state.velocity.z += (Math.random() - 0.5) * state.buffet * 9 * dt;
        state.quaternion.multiply(tmpQuat.setFromEuler(tmpEuler.set(0, 0, (Math.random() - 0.5) * state.buffet * dt * 1.6)));
      }
    }

    state.position.addScaledVector(state.velocity, dt);
    state.distanceFlown += state.speed * dt;

    const ground = runwaySurface(state.position.x, state.position.z);
    const gearHeight = state.gearDown ? 1.62 : 1.15;
    state.agl = state.position.y - ground;
    state.altitude = state.position.y;

    if (state.position.y - gearHeight <= ground) {
      const sink = -state.velocity.y;
      const bank = Math.abs(bankAngle());
      const onRunway =
        Math.abs(state.position.x - AIRPORT.x) <= AIRPORT.length / 2 &&
        Math.abs(state.position.z - AIRPORT.z) <= AIRPORT.width / 2;

      if (!state.onGround) {
        state.touchdownRate = sink;
        if (sink > FLIGHT.touchdownSink || bank > FLIGHT.touchdownBank || state.speed > FLIGHT.crashSpeed) {
          state.crashed = true;
          state.crashReason = sink > FLIGHT.touchdownSink ? 'sink rate' : bank > FLIGHT.touchdownBank ? 'wing strike' : 'too fast';
          return state;
        }
        state.landed = true;
        state.onGround = true;
        state.velocity.y = 0;
        state.speed = Math.min(state.speed, FLIGHT.crashSpeed);
        if (!onRunway) {
          state.crashed = sink > 2.4;
          if (state.crashed) state.crashReason = 'rough ground';
        }
      }

      state.onGround = true;
      state.position.y = ground + gearHeight;
      if (state.velocity.y < 0) state.velocity.y = 0;
      state.speed = Math.max(0, state.speed - (input.brake ? 9 : 2.2) * dt);

      // Rotate off the ground when there is enough airspeed and the stick is back.
      if (state.speed > 40 && state.controls.pitch > 0.3) {
        state.onGround = false;
        state.velocity.y = 3.1;
      }
    } else if (state.agl > 3.2) {
      state.onGround = false;
    }

    state.fuel = clamp(state.fuel - FLIGHT.fuelBurn * (0.25 + state.throttle) * dt * 60, 0, 100);
    if (state.fuel <= 0) state.engine = Math.max(0, state.engine - dt * 9);
    state.speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);

    const forwardSpeed = state.velocity.dot(forwardVec);
    state.aoa = Math.atan2(-state.velocity.y, Math.max(forwardSpeed, 1)) - Math.asin(clamp(forwardVec.y, -1, 1));
    state.bank = bankAngle();
    state.pitch = Math.asin(clamp(forwardVec.y, -1, 1));
    state.heading = headingOf();
    state.verticalSpeed = state.velocity.y;
    state.overspeed = clamp((state.speed - FLIGHT.neverExceed) / 20, 0, 1);

    const pitchRateNow = state.controls.pitch * FLIGHT.pitchRate * clamp(airspeed / 55, 0.25, 1.35);
    state.gLoad = damp(state.gLoad, 1 + (pitchRateNow * state.speed) / (9.81 * 4.2), 6, dt);

    if (state.hull <= 0) {
      state.crashed = true;
      state.crashReason = 'airframe lost';
    }
    return state;
  }

  function bankAngle() {
    const r = right(new THREE.Vector3());
    const u = UP.clone().applyQuaternion(state.quaternion);
    return Math.atan2(-r.y, u.y);
  }

  function headingOf() {
    const f = forward(new THREE.Vector3());
    const deg = (Math.atan2(f.x, -f.z) * 180) / Math.PI;
    return (deg + 360) % 360;
  }

  function damage(amount, label = '') {
    state.hull = clamp(state.hull - amount, 0, 100);
    if (amount > 12) state.engine = clamp(state.engine - amount * 1.4, 0, 100);
    if (state.hull <= 0) {
      state.crashed = true;
      state.crashReason = label || 'airframe lost';
    }
  }

  return { state, update, reset, forward, right, damage, runwaySurface, bankAngle };
}

const KNOTS = 1.94384;
const FEET = 3.28084;
