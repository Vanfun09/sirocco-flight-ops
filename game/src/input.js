// Keyboard and mouse, flattened into the one object the aeroplane and the menus read. Keys are
// captured by code so WASD works on any layout; the mouse only steers when it is held down.
function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const state = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleUp: false,
    throttleDown: false,
    gearToggle: false,
    flapUp: false,
    flapDown: false,
    brake: false,
    fire: false,
    mouseSteer: false,
    mouseX: 0,
    mouseY: 0,
  };

  const down = (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault();
    }
  };
  const up = (event) => keys.delete(event.code);

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      state.mouseSteer = true;
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener('pointerup', () => {
    state.mouseSteer = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;
  });

  function wasPressed(code) {
    if (pressed.has(code)) {
      pressed.delete(code);
      return true;
    }
    return false;
  }

  function sample() {
    state.throttleUp = keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.throttleDown = keys.has('ControlLeft') || keys.has('ControlRight');
    state.pitch = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    state.roll = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    state.yaw = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    state.brake = keys.has('KeyB') || keys.has('Space');
    state.fire = keys.has('KeyF');
    state.gearToggle = wasPressed('KeyG');
    state.flapUp = keys.has('KeyZ');
    state.flapDown = keys.has('KeyX');
    return state;
  }

  function consume(code) {
    return wasPressed(code);
  }

  function clearPressed() {
    pressed.clear();
  }

  return { keys, state, sample, consume, clearPressed };
}
