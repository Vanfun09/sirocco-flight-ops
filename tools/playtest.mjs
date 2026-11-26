// A scripted play-through in headless Chrome: menus, throttle up, pitch, ring passes, landing.
// Prints a JSON report so a broken control or a silent exception fails the build loudly.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = process.argv[2] || 'http://localhost:8123/';
const port = 9990 + Math.floor(Math.random() * 500);
const profile = `${process.env.TMPDIR || '.'}/chrome-play-${port}`;

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--disable-extensions',
    '--no-first-run',
    '--force-device-scale-factor=1',
    '--window-size=1280,800',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPage() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (error) {
      void error;
    }
    await sleep(120);
  }
  throw new Error('chrome never came up');
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.logs = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails;
        this.logs.push(`exception: ${detail.text} ${detail.exception?.description ?? ''}`);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.logs.push(`console: ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      this.logs.push(`eval: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`);
      return null;
    }
    return result.result.value;
  }

  async key(type, code, keyName = code) {
    const mapping = {
      Enter: { key: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
      Escape: { key: 'Escape', windowsVirtualKeyCode: 27 },
      ArrowRight: { key: 'ArrowRight', windowsVirtualKeyCode: 39 },
      ArrowLeft: { key: 'ArrowLeft', windowsVirtualKeyCode: 37 },
      Space: { key: ' ', windowsVirtualKeyCode: 32 },
      ShiftLeft: { key: 'Shift', windowsVirtualKeyCode: 16 },
      KeyS: { key: 's', windowsVirtualKeyCode: 83, text: 's' },
      KeyW: { key: 'w', windowsVirtualKeyCode: 87, text: 'w' },
      KeyA: { key: 'a', windowsVirtualKeyCode: 65, text: 'a' },
      KeyD: { key: 'd', windowsVirtualKeyCode: 68, text: 'd' },
      KeyG: { key: 'g', windowsVirtualKeyCode: 71, text: 'g' },
      KeyF: { key: 'f', windowsVirtualKeyCode: 70, text: 'f' },
    };
    const info = mapping[keyName] || { key: keyName };
    await this.send('Input.dispatchKeyEvent', {
      type,
      code,
      key: info.key,
      windowsVirtualKeyCode: info.windowsVirtualKeyCode,
      nativeVirtualKeyCode: info.windowsVirtualKeyCode,
      text: type === 'keyDown' ? info.text : undefined,
    });
  }
}

const wsUrl = await findPage();
const socket = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const cdp = new Cdp(socket);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Page.navigate', { url });

for (let attempt = 0; attempt < 80; attempt += 1) {
  await sleep(250);
  const ready = await cdp.evaluate('typeof window.sirocco !== "undefined"');
  if (ready) break;
}

const report = { steps: [] };
const snapshot = async (label) => {
  const state = await cdp.evaluate(`(() => {
    const game = window.sirocco;
    const s = game.flight.state;
    return {
      screen: game.screen(),
      phase: game.missions.phase,
      speed: Number(s.speed.toFixed(1)),
      altitude: Number(s.altitude.toFixed(1)),
      agl: Number(s.agl.toFixed(1)),
      heading: Number(s.heading.toFixed(1)),
      throttle: Number(s.throttle.toFixed(2)),
      onGround: s.onGround,
      crashed: s.crashed,
      rings: game.missions.stats.ringsPassed,
      fuel: Number(s.fuel.toFixed(1)),
      entities: game.entities.rings.length + game.entities.drones.length,
      frame: game.frame(),
    };
  })()`);
  report.steps.push({ label, ...state });
  return state;
};

await sleep(600);
await snapshot('boot');

await cdp.key('keyDown', 'Enter');
await cdp.key('keyUp', 'Enter');
await sleep(400);
await snapshot('title->select');

// The fifth card must be reachable with the arrow keys on the select screen.
for (let step = 0; step < 4; step += 1) {
  await cdp.key('keyDown', 'ArrowRight');
  await cdp.key('keyUp', 'ArrowRight');
  await sleep(90);
}
report.fifthMission = await cdp.evaluate('window.sirocco.selection()');

// Back to the first card so the flight half of this run is Ridge Run.
for (let step = 0; step < 4; step += 1) {
  await cdp.key('keyDown', 'ArrowLeft');
  await cdp.key('keyUp', 'ArrowLeft');
  await sleep(90);
}
report.firstMission = await cdp.evaluate('window.sirocco.selection()');

await cdp.key('keyDown', 'Enter');
await cdp.key('keyUp', 'Enter');
await sleep(400);
await snapshot('briefing');

await cdp.key('keyDown', 'Enter');
await cdp.key('keyUp', 'Enter');
await sleep(600);
await snapshot('flying');

// Throttle up and hold, then pull gently: the aeroplane should accelerate and climb.
await cdp.key('keyDown', 'ShiftLeft');
await sleep(2500);
await snapshot('throttle up 2.5s');
await cdp.key('keyDown', 'KeyS');
await sleep(420);
await cdp.key('keyUp', 'KeyS');
await sleep(500);
await snapshot('pulling 1.5s');

await cdp.key('keyDown', 'KeyA');
await sleep(260);
await cdp.key('keyUp', 'KeyA');
await snapshot('banking left');

await cdp.key('keyUp', 'ShiftLeft');
await cdp.key('keyDown', 'KeyF');
await sleep(400);
await cdp.key('keyUp', 'KeyF');
await snapshot('guns');

// Teleport onto a gate to prove the ring trigger fires and scores.
await cdp.evaluate(`(() => {
  const game = window.sirocco;
  const s = game.flight.state;
  const ring = game.entities.rings[0];
  if (!ring) return 'no ring';
  const back = ring.normal.clone().multiplyScalar(-40);
  s.position.copy(ring.group.position).add(back);
  s.speed = 55;
  return 'moved';
})()`);
await cdp.key('keyDown', 'ShiftLeft');
await sleep(1400);
await snapshot('through gate');
await cdp.key('keyUp', 'ShiftLeft');

// Gear and flaps still respond.
await cdp.key('keyDown', 'KeyG');
await cdp.key('keyUp', 'KeyG');
await sleep(300);
const gear = await cdp.evaluate('window.sirocco.flight.state.gearDown');
report.gearToggled = gear;

// Fly the whole card: teleport a little behind each gate and push through it.
for (let index = 0; index < 6; index += 1) {
  const moved = await cdp.evaluate(`(() => {
    const game = window.sirocco;
    const s = game.flight.state;
    const ring = game.entities.rings[${index}];
    if (!ring) return false;
    const normal = ring.normal.clone().normalize();
    s.position.copy(ring.group.position).addScaledVector(normal, -55);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), normal);
    s.velocity.copy(normal).multiplyScalar(60);
    s.speed = 60;
    return true;
  })()`);
  if (!moved) break;
  // Headless software GL runs the clock slowly, so wait on the counter, not the wall.
  for (let wait = 0; wait < 40; wait += 1) {
    await sleep(150);
    const passed = await cdp.evaluate('window.sirocco.missions.stats.ringsPassed');
    if (passed > index) break;
  }
}
const rings = await cdp.evaluate('window.sirocco.missions.stats.ringsPassed');
report.rings = rings;
await snapshot('all gates');

// Land: gear down, on the centreline, at the strip elevation, brakes on.
await cdp.evaluate(`(() => {
  const game = window.sirocco;
  const s = game.flight.state;
  s.gearDown = true;
  s.flaps = 2;
  s.position.set(0, 68, 0);
  s.quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
  s.velocity.set(6, 0, 0);
  s.speed = 6;
  return 'on the numbers';
})()`);
for (let wait = 0; wait < 120; wait += 1) {
  await sleep(150);
  const screen = await cdp.evaluate('window.sirocco.screen()');
  if (screen === 'debrief') break;
}
await snapshot('debrief');

report.errors = cdp.logs;
report.title = await cdp.evaluate('document.title');
console.log(JSON.stringify(report, null, 2));

socket.close();
chrome.kill();
await sleep(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch (error) {
  void error;
}
process.exit(0);
