// Headless Chrome screenshots at an exact viewport, driven over CDP. Prints console errors so a
// broken build fails loudly instead of quietly producing a pretty picture of nothing.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [url, out, widthArg = '1280', heightArg = '720'] = process.argv.slice(2);
const width = Number(widthArg);
const height = Number(heightArg);
const port = 9400 + Math.floor(Math.random() * 500);
const profile = `${process.env.TMPDIR || '.'}/chrome-${port}`;

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
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--force-device-scale-factor=1',
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
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ');
        this.logs.push(`${message.params.type}: ${text}`);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails;
        this.logs.push(`exception: ${detail.text} ${detail.exception?.description ?? ''}`);
      }
      if (message.method === 'Log.entryAdded') {
        this.logs.push(`${message.params.entry.level}: ${message.params.entry.text}`);
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
await cdp.send('Log.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: width,
  screenHeight: height,
});
await cdp.send('Page.navigate', { url });

let ready = false;
for (let attempt = 0; attempt < 160; attempt += 1) {
  await sleep(250);
  try {
    const result = await cdp.send('Runtime.evaluate', {
      expression: 'window.__shotReady === true',
      returnByValue: true,
    });
    if (result.result && result.result.value === true) {
      ready = true;
      break;
    }
  } catch (error) {
    void error;
  }
}

await sleep(400);
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
mkdirSync(out.replace(/[^/]+$/, ''), { recursive: true });
writeFileSync(out, Buffer.from(shot.data, 'base64'));

const title = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
const dims = await cdp.send('Runtime.evaluate', {
  expression: 'JSON.stringify([innerWidth, innerHeight, document.getElementById("hud").width, document.getElementById("hud").height])',
  returnByValue: true,
});

const diag = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__diag || null)', returnByValue: true });
console.log(JSON.stringify({ out, ready, title: title.result.value, dims: dims.result.value, diag: diag.result.value, logs: cdp.logs.slice(0, 24) }, null, 2));
socket.close();
chrome.kill();
await sleep(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch (error) {
  void error;
}
process.exit(0);
