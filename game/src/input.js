// Keyboard and mouse, flattened into the one object the aeroplane and the menus read. Keys are
// captured by code so WASD works on any layout; the mouse only steers while the left button is
// held, and the keyboard wins whenever a pitch or roll key is down.
function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const PITCH_KEYS = ['KeyS', 'ArrowDown'];
  const ROLL_KEYS = ['KeyD', 'ArrowRight'];
  const PITCH_BACK_KEYS = ['KeyW', 'ArrowUp'];
  const ROLL_BACK_KEYS = ['KeyA', 'ArrowLeft'];
  const DEAD_ZONE = 0.06;

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
    steering: 'keys',
  };

  const anyDown = (codes) => codes.some((code) => keys.has(code));

  /** Squeeze the stick past a small centre dead zone, then stretch the rest back to full throw. */
  function deadZone(value) {
    const magnitude = Math.min(1, Math.abs(value));
    if (magnitude <= DEAD_ZONE) return 0;
    const scaled = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
    return (value < 0 ? -1 : 1) * Math.min(1, scaled);
  }

  /** Pointer position resolved against the canvas box: x right, y down, both in [-1, 1]. */
  function pointerAxis() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const nx = ((state.mouseX - rect.left) / rect.width) * 2 - 1;
    const ny = ((state.mouseY - rect.top) / rect.height) * 2 - 1;
    return { x: deadZone(nx), y: deadZone(ny) };
  }

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
    if (event.button !== 0) return;
    state.mouseSteer = true;
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  const release = () => {
    state.mouseSteer = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
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

    const pitchKey = (anyDown(PITCH_KEYS) ? 1 : 0) - (anyDown(PITCH_BACK_KEYS) ? 1 : 0);
    const rollKey = (anyDown(ROLL_KEYS) ? 1 : 0) - (anyDown(ROLL_BACK_KEYS) ? 1 : 0);
    const stick = state.mouseSteer && pitchKey === 0 && rollKey === 0 ? pointerAxis() : null;

    if (stick) {
      state.pitch = stick.y;
      state.roll = stick.x;
      state.steering = 'pointer';
    } else {
      state.pitch = pitchKey;
      state.roll = rollKey;
      state.steering = 'keys';
    }

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
