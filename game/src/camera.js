// Camera rig: a chase view that lags behind the airframe and rolls with the bank, a cockpit view
// locked to the pilot's eye, and an orbit view for looking the aeroplane over.

function createCameraRig(camera) {
  const position = new THREE.Vector3(0, 40, 120);
  const lookAt = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  let mode = 'chase';
  let shake = 0;
  let roll = 0;

  function setMode(next) {
    mode = next;
  }

  function update(dt, flight) {
    const state = flight.state;
    flight.forward(forward);
    up.set(0, 1, 0).applyQuaternion(state.quaternion);

    if (mode === 'cockpit') {
      offset.set(...CAMERA.cockpit.eye).applyQuaternion(state.quaternion);
      position.copy(state.position).add(offset);
      camera.position.copy(position);
      camera.quaternion.copy(state.quaternion);
      camera.fov = CAMERA.cockpit.fov + state.speed * 0.1;
      camera.updateProjectionMatrix();
      return;
    }

    if (mode === 'orbit') {
      const angle = performance.now() * 0.00016;
      targetPosition
        .copy(state.position)
        .add(new THREE.Vector3(Math.cos(angle) * CAMERA.orbit.back, CAMERA.orbit.up, Math.sin(angle) * CAMERA.orbit.back));
      position.lerp(targetPosition, 1 - Math.exp(-3 * dt));
      camera.position.copy(position);
      camera.lookAt(state.position);
      camera.fov = CAMERA.orbit.fov;
      camera.updateProjectionMatrix();
      return;
    }

    const distance = CAMERA.chase.back + state.speed * 0.055;
    const height = CAMERA.chase.up + Math.sin(state.bank) * 1.4;
    targetPosition.copy(state.position).addScaledVector(forward, -distance).addScaledVector(up, height * 0.5);
    targetPosition.y += height * 0.5;

    const follow = 1 - Math.exp(-6.5 * dt);
    position.lerp(targetPosition, follow);

    roll = damp(roll, state.bank * 0.32, 3.2, dt);
    shake = damp(shake, state.buffet * 1.4 + (state.speed > 95 ? 0.4 : 0), 5, dt);

    camera.position.copy(position);
    camera.position.x += (Math.random() - 0.5) * shake * 0.35;
    camera.position.y += (Math.random() - 0.5) * shake * 0.35;

    lookAt.copy(state.position).addScaledVector(forward, CAMERA.chase.look);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(lookAt);
    camera.fov = CAMERA.chase.fov + clamp(state.speed - 40, 0, 60) * 0.12;
    camera.updateProjectionMatrix();
  }

  function reset(flight) {
    const state = flight.state;
    flight.forward(forward);
    position.copy(state.position).addScaledVector(forward, -CAMERA.chase.back).add(new THREE.Vector3(0, CAMERA.chase.up, 0));
    camera.position.copy(position);
    camera.lookAt(state.position);
  }

  return {
    update,
    reset,
    setMode,
    get mode() {
      return mode;
    },
  };
}
