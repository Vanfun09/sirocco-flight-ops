// The island: one analytic height function, baked into a lookup grid the flight model queries,
// plus the meshes and props cut into it — runway, apron, hangars, windsock, pines, surf.

const SEED = 7331;

/** Height of the ground at a world position, sea level included. */
function sampleHeight(x, z) {
  const nx = x / 6100;
  const nz = z / 6100;
  let h = fbm(nx, nz, SEED, 4) * 760;
  const crest = ridged(nx * 0.72 + 11.3, nz * 0.72 - 6.7, SEED + 17, 4);
  h += crest * crest * 1560;

  // A river valley meanders west to east and keeps the middle of the island flyable.
  const river = 1250 * Math.sin(x / 3100) + 360 * Math.sin(x / 1080 + 1.2);
  const toRiver = Math.abs(z - river);
  const carve = 1 - smoothstep(260, 2400, toRiver);
  h = lerp(h, 22 + 26 * fbm(x / 640, z / 640, SEED + 4, 2), carve * 0.9);

  // Ridge lines fall away toward the coast so the sea stays visible from the air.
  const coast = smoothstep(6900, 9200, Math.max(Math.abs(x), Math.abs(z)));
  h = lerp(h, 6 + 30 * fbm(x / 900, z / 900, SEED + 8, 2), coast);

  // Kestrel Strip sits on a plateau shaved into the hills.
  const flat = smoothstep(AIRPORT.length * 0.95, AIRPORT.length * 2.3, Math.abs(x - AIRPORT.x));
  const flatZ = smoothstep(AIRPORT.width * 8, AIRPORT.width * 26, Math.abs(z - AIRPORT.z));
  const shelf = clamp01((1 - flat) * (1 - flatZ));
  h = lerp(h, AIRPORT.elevation + 3 * fbm(x / 300, z / 300, SEED + 12, 2), shelf);

  // A shallow approach fan west of the strip: the runway has to be reachable over land, so the
  // river mouth is lifted just enough to keep the final approach dry.
  const alongX = 1 - smoothstep(700, 4600, Math.abs(x - AIRPORT.x + 1400));
  const acrossZ = 1 - smoothstep(300, 1700, Math.abs(z - AIRPORT.z));
  const fan = clamp01(alongX * acrossZ);
  h = lerp(h, 56 + 8 * fbm(x / 700, z / 700, SEED + 21, 2), fan);

  return h;
}

const GROUND_SAND = new THREE.Color('#c2a878');
const GROUND_SCRUB = new THREE.Color('#5c6c3c');
const GROUND_FOREST = new THREE.Color('#2f4429');
const GROUND_ROCK = new THREE.Color('#6d6255');
const GROUND_DARK_ROCK = new THREE.Color('#4a4239');
const GROUND_SNOW = new THREE.Color('#e9eef3');
const GROUND_SHELF = new THREE.Color('#7d8a55');

/**
 * The one place ground colour is decided: height bands, then slope, then the mown shelf around
 * the strip. Writes into `target` so the surface build can reuse a single colour.
 */
function groundColor(x, z, y, slope, target = new THREE.Color()) {
  const tint = target;
  if (y < WORLD.seaLevel + 5) tint.copy(GROUND_SAND);
  else if (y < 120) tint.copy(GROUND_SAND).lerp(GROUND_SCRUB, smoothstep(WORLD.seaLevel + 4, 130, y));
  else if (y < 430) tint.copy(GROUND_SCRUB).lerp(GROUND_FOREST, smoothstep(140, 420, y));
  else if (y < 900) tint.copy(GROUND_FOREST).lerp(GROUND_ROCK, smoothstep(430, 880, y));
  else tint.copy(GROUND_ROCK).lerp(GROUND_SNOW, smoothstep(880, 1280, y));

  const steep = smoothstep(0.35, 0.9, slope);
  tint.lerp(GROUND_ROCK, steep * 0.8);
  if (steep > 0.55) tint.lerp(GROUND_DARK_ROCK, (steep - 0.55) * 1.4);
  if (y > 1000) tint.lerp(GROUND_SNOW, smoothstep(1000, 1320, y) * (1 - steep * 0.6));

  const toStrip = Math.max(Math.abs(x - AIRPORT.x) / 2600, Math.abs(z - AIRPORT.z) / 1500);
  if (toStrip < 1) tint.lerp(GROUND_SHELF, (1 - toStrip) * 0.55);

  // Patchy ground cover so the valley is not one flat wash of colour.
  const patch = fbm(x / 260, z / 260, 91, 3);
  tint.multiplyScalar(0.82 + patch * 0.42);
  const dry = fbm(x / 900 + 11, z / 900 - 7, 77, 2);
  if (y < 200) tint.lerp(GROUND_SAND, clamp01((dry - 0.52) * 1.8) * 0.35);

  return tint;
}

function createTerrain(scene) {
  const span = WORLD.size;
  const grid = WORLD.grid;
  const cell = span / grid;
  const heights = new Float32Array((grid + 1) * (grid + 1));
  const half = span / 2;

  for (let j = 0; j <= grid; j += 1) {
    const z = -half + j * cell;
    for (let i = 0; i <= grid; i += 1) {
      const x = -half + i * cell;
      heights[j * (grid + 1) + i] = sampleHeight(x, z);
    }
  }

  function heightAt(x, z) {
    const gx = clamp01((x + half) / span) * grid;
    const gz = clamp01((z + half) / span) * grid;
    const i = Math.min(grid - 1, Math.floor(gx));
    const j = Math.min(grid - 1, Math.floor(gz));
    const tx = gx - i;
    const tz = gz - j;
    const row = grid + 1;
    const h00 = heights[j * row + i];
    const h10 = heights[j * row + i + 1];
    const h01 = heights[(j + 1) * row + i];
    const h11 = heights[(j + 1) * row + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  function slopeAt(x, z) {
    const d = 26;
    const dx = heightAt(x + d, z) - heightAt(x - d, z);
    const dz = heightAt(x, z + d) - heightAt(x, z - d);
    return Math.hypot(dx, dz) / (2 * d);
  }

  /** Height and slope in one query, for callers that need both. */
  function terrainAt(x, z) {
    const d = 26;
    const dx = heightAt(x + d, z) - heightAt(x - d, z);
    const dz = heightAt(x, z + d) - heightAt(x, z - d);
    return { height: heightAt(x, z), slope: Math.hypot(dx, dz) / (2 * d) };
  }

  const mesh = buildSurface(span, 448, heightAt);
  scene.add(mesh);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 2.4, span * 2.4, 1, 1),
    new THREE.MeshPhongMaterial({
      color: 0x1c5f76,
      specular: 0xbfe9ff,
      shininess: 96,
      transparent: true,
      opacity: 0.94,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WORLD.seaLevel;
  scene.add(water);

  const strip = buildAirport(scene, heightAt);
  const trees = scatterPines(scene, heightAt, slopeAt);

  return { mesh, water, strip, trees, heightAt, slopeAt, terrainAt, groundColor };
}

function buildSurface(span, segments, heightAt) {
  const geometry = new THREE.PlaneGeometry(span, span, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const tint = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);

    const d = 40;
    const dx = heightAt(x + d, z) - heightAt(x - d, z);
    const dz = heightAt(x, z + d) - heightAt(x, z - d);
    const slope = Math.hypot(dx, dz) / (2 * d);

    groundColor(x, z, y, slope, tint);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const grain = makeGrainTexture();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, map: grain });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'island';
  return mesh;
}

function makeGrainTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = createRandom(2027);
  for (let i = 0; i < size * size; i += 1) {
    const value = 196 + Math.floor(random() * 58);
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(140, 140);
  texture.anisotropy = 4;
  return texture;
}

function buildAirport(scene, heightAt) {
  const group = new THREE.Group();
  group.name = 'kestrel-strip';
  const y = AIRPORT.elevation;

  const runwayTexture = makeRunwayTexture();
  runwayTexture.wrapS = THREE.ClampToEdgeWrapping;
  runwayTexture.wrapT = THREE.ClampToEdgeWrapping;
  runwayTexture.anisotropy = 4;

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(AIRPORT.length, AIRPORT.width),
    new THREE.MeshLambertMaterial({ map: runwayTexture }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(AIRPORT.x, y + 0.9, AIRPORT.z);
  runway.receiveShadow = true;
  group.add(runway);

  const shoulder = new THREE.Mesh(
    new THREE.PlaneGeometry(AIRPORT.length + 220, AIRPORT.width + 150),
    new THREE.MeshLambertMaterial({ color: 0x6f7455 }),
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(AIRPORT.x, y + 0.35, AIRPORT.z);
  shoulder.receiveShadow = true;
  group.add(shoulder);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 120),
    new THREE.MeshLambertMaterial({ color: 0x8b8d86 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(AIRPORT.x - AIRPORT.length * 0.34, y + 0.7, AIRPORT.z + 96);
  apron.receiveShadow = true;
  group.add(apron);

  // Hangars and the little tower that gives the strip a skyline from the air.
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0xb8b4aa });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5d6a70 });
  for (let i = 0; i < 2; i += 1) {
    const x = AIRPORT.x - AIRPORT.length * 0.36 + i * 78;
    const z = AIRPORT.z + 128;
    const body = new THREE.Mesh(new THREE.BoxGeometry(56, 15, 40), hangarMat);
    body.position.set(x, y + 7.5, z);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(21, 21, 56, 12, 1, false, 0, Math.PI), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scale.set(0.95, 1, 0.72);
    roof.position.set(x, y + 15, z);
    roof.castShadow = true;
    group.add(roof);
  }

  const tower = new THREE.Mesh(new THREE.BoxGeometry(11, 22, 11), new THREE.MeshLambertMaterial({ color: 0xd6d3c8 }));
  tower.position.set(AIRPORT.x - AIRPORT.length * 0.14, y + 11, AIRPORT.z + 70);
  tower.castShadow = true;
  group.add(tower);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(13, 4, 13),
    new THREE.MeshLambertMaterial({ color: 0x2a3b46, emissive: 0x1a2b33 }),
  );
  cab.position.copy(tower.position).setY(y + 23);
  cab.castShadow = true;
  group.add(cab);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 12, 6), new THREE.MeshLambertMaterial({ color: 0xcfd3d6 }));
  pole.position.set(AIRPORT.x + AIRPORT.length * 0.42, y + 6, AIRPORT.z + 46);
  group.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(3.4, 14, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xff8442, side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2;
  sock.position.set(AIRPORT.x + AIRPORT.length * 0.42 + 7, y + 11, AIRPORT.z + 46);
  group.add(sock);

  // Threshold and edge lights, lit by a small emissive so dusk reads even without bloom.
  const lightGeo = new THREE.SphereGeometry(1.1, 6, 5);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
  const lights = new THREE.InstancedMesh(lightGeo, lightMat, 42);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let i = 0; i < 21; i += 1) {
    const x = AIRPORT.x - AIRPORT.length / 2 + (i / 20) * AIRPORT.length;
    for (const side of [-1, 1]) {
      matrix.makeTranslation(x, y + 1.1, AIRPORT.z + side * (AIRPORT.width / 2 + 5));
      lights.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  lights.instanceMatrix.needsUpdate = true;
  group.add(lights);

  scene.add(group);
  return { group, runway, lights, surfaceY: y };
}

function makeRunwayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a4d4f';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 220; i += 1) {
    ctx.fillRect(Math.random() * 512, Math.random() * 128, 26, 2);
  }
  const light = '#e9e6dc';
  ctx.fillStyle = light;
  for (let i = 0; i < 9; i += 1) {
    ctx.fillRect(120 + i * 30, 60, 18, 8);
  }
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(16, 26 + i * 20, 30, 9);
    ctx.fillRect(466, 26 + i * 20, 30, 9);
  }
  ctx.fillRect(4, 4, 9, 120);
  ctx.fillRect(499, 4, 9, 120);
  ctx.fillRect(246, 8, 20, 112);
  ctx.save();
  ctx.translate(72, 64);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('09', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(440, 64);
  ctx.rotate(Math.PI / 2);
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('27', 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function scatterPines(scene, heightAt, slopeAt) {
  const random = createRandom(90125);
  const count = 2400;
  const geometry = new THREE.ConeGeometry(7.5, 21, 6, 1);
  geometry.translate(0, 10, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0x3f5138 });
  const trees = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let placed = 0;
  let guard = 0;

  while (placed < count && guard < count * 40) {
    guard += 1;
    const x = (random() - 0.5) * 15000;
    const z = (random() - 0.5) * 15000;
    const y = heightAt(x, z);
    if (y < 90 || y > 720) continue;
    if (slopeAt(x, z) > 0.55) continue;
    if (Math.abs(x) < AIRPORT.length * 1.3 && Math.abs(z) < AIRPORT.width * 20) continue;
    position.set(x, y - 1, z);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
    const size = 0.55 + random() * 0.95;
    scale.set(size, size * (0.8 + random() * 0.6), size);
    matrix.compose(position, rotation, scale);
    trees.setMatrixAt(placed, matrix);
    placed += 1;
  }
  trees.count = placed;
  trees.instanceMatrix.needsUpdate = true;
  trees.castShadow = true;
  scene.add(trees);
  return trees;
}
