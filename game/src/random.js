// Seeded randomness and the value-noise the terrain is built from. The same seed gives the same
// island, the same gate positions and the same screenshot, so a shot can be re-taken exactly.
function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** One coin toss at probability p, drawn from the caller's stream so seeded runs stay repeatable. */
function chance(p, rng = Math.random) {
  if (!(p > 0)) return false;
  if (p >= 1) return true;
  return rng() < p;
}

const HASH_A = 374761393;
const HASH_B = 668265263;

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, HASH_A) ^ Math.imul(iy, HASH_B) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1], bilinear between hashed lattice corners. */
function noise2(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/** Fractal sum of value noise, in [0, 1]. */
function fbm(x, y, seed, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let fx = x;
  let fy = y;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * noise2(fx, fy, seed + octave * 101);
    total += amplitude;
    amplitude *= 0.5;
    fx *= 2.03;
    fy *= 1.97;
  }
  return sum / total;
}

/** Ridged fractal noise: sharp crests where |n| is small, in [0, 1]. */
function ridged(x, y, seed, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let fx = x;
  let fy = y;
  for (let octave = 0; octave < octaves; octave += 1) {
    const n = 1 - Math.abs(noise2(fx, fy, seed + octave * 57) * 2 - 1);
    sum += amplitude * n * n;
    total += amplitude;
    amplitude *= 0.52;
    fx *= 2.11;
    fy *= 2.07;
  }
  return sum / total;
}

/** A quiet seeded pick from a list, used for prop placement. */
function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}
