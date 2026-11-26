// Engine, wind, guns and gear: everything is synthesised with WebAudio, so the game ships no audio
// files and every sound tracks the state it belongs to (throttle, airspeed, hull damage).
function createAudio() {
  let context = null;
  let master = null;
  let engineGain = null;
  let engineOsc = null;
  let engineSub = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function boot() {
    if (started) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);

    engineGain = context.createGain();
    engineGain.gain.value = 0;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 900;
    engineGain.connect(engineFilter).connect(master);

    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineOsc.connect(engineGain);

    engineSub = context.createOscillator();
    engineSub.type = 'triangle';
    engineSub.frequency.value = 34;
    const subGain = context.createGain();
    subGain.gain.value = 0.5;
    engineSub.connect(subGain).connect(engineGain);

    const windNoise = context.createBufferSource();
    windNoise.buffer = makeNoise(context, 2);
    windNoise.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windNoise.connect(windFilter).connect(windGain).connect(master);

    engineOsc.start();
    engineSub.start();
    windNoise.start();
    started = true;
  }

  function resume() {
    boot();
    if (context && context.state === 'suspended') context.resume();
  }

  function update(flight, dt) {
    if (!started || muted) return;
    const { throttle, speed, hull, onGround } = flight;
    const rpm = 0.25 + throttle * 0.75;
    engineOsc.frequency.setTargetAtTime(46 + rpm * 96, context.currentTime, 0.08);
    engineSub.frequency.setTargetAtTime(26 + rpm * 32, context.currentTime, 0.12);
    engineGain.gain.setTargetAtTime((0.05 + rpm * 0.14) * (hull > 25 ? 1 : 0.7), context.currentTime, 0.1);
    windFilter.frequency.setTargetAtTime(420 + speed * 16, context.currentTime, 0.2);
    windGain.gain.setTargetAtTime(onGround ? 0.008 : Math.min(0.1, speed * 0.0016), context.currentTime, 0.2);
    void dt;
  }

  function gun() {
    if (!started || muted) return;
    const source = context.createBufferSource();
    source.buffer = makeNoise(context, 0.09);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;
    const gain = context.createGain();
    gain.gain.value = 0.22;
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function thump(strength = 1) {
    if (!started || muted) return;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, context.currentTime + 0.22);
    const gain = context.createGain();
    gain.gain.value = 0.25 * strength;
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.26);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(context.currentTime + 0.3);
  }

  function chime(up = true) {
    if (!started || muted) return;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = up ? 880 : 420;
    const gain = context.createGain();
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(context.currentTime + 0.42);
  }

  function alarm() {
    if (!started || muted) return;
    const osc = context.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 720;
    const gain = context.createGain();
    gain.gain.value = 0.07;
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(context.currentTime + 0.2);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.55;
    return muted;
  }

  return { boot, resume, update, gun, thump, chime, alarm, toggleMute, get muted() { return muted; } };
}

function makeNoise(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}
