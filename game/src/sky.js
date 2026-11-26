// Sky, sun, cloud banks and the five weather looks the missions use. One shader dome does the
// gradient and the sun disc, so daylight, haze, storm and dusk differ by uniforms, not by meshes.

const PRESETS = {
  clear: {
    top: new THREE.Color('#2a6ba8'),
    horizon: new THREE.Color('#dfe9ec'),
    ground: new THREE.Color('#7f8a80'),
    sun: new THREE.Color('#fff0c8'),
    sunElevation: 26,
    sunAzimuth: 118,
    sunSize: 0.03,
    ambient: 0.4,
    sunIntensity: 3.0,
    fogNear: 1600,
    fogFar: 11000,
    cloud: 0.92,
    cloudTint: '#ffffff',
    cloudCount: 34,
    stars: 0,
    lightning: 0,
  },
  haze: {
    top: new THREE.Color('#8fa9b8'),
    horizon: new THREE.Color('#e6dcc9'),
    ground: new THREE.Color('#a89e86'),
    sun: new THREE.Color('#ffe6b8'),
    sunElevation: 18,
    sunAzimuth: 96,
    sunSize: 0.05,
    ambient: 0.68,
    sunIntensity: 2.1,
    fogNear: 700,
    fogFar: 7600,
    cloud: 0.55,
    cloudTint: '#f4e9d8',
    cloudCount: 22,
    stars: 0,
    lightning: 0,
  },
  storm: {
    top: new THREE.Color('#3a4655'),
    horizon: new THREE.Color('#8d9aa4'),
    ground: new THREE.Color('#5c6668'),
    sun: new THREE.Color('#c9d6e2'),
    sunElevation: 42,
    sunAzimuth: 210,
    sunSize: 0.09,
    ambient: 0.85,
    sunIntensity: 1.15,
    fogNear: 380,
    fogFar: 5400,
    cloud: 1,
    cloudTint: '#9aa6b2',
    cloudCount: 60,
    stars: 0,
    lightning: 1,
  },
  dawn: {
    top: new THREE.Color('#39699e'),
    horizon: new THREE.Color('#f6c08a'),
    ground: new THREE.Color('#5a4a44'),
    sun: new THREE.Color('#ffdca8'),
    sunElevation: 9,
    sunAzimuth: 26,
    sunSize: 0.026,
    ambient: 0.38,
    sunIntensity: 2.9,
    fogNear: 900,
    fogFar: 8200,
    cloud: 0.62,
    cloudTint: '#ffd9b4',
    cloudCount: 26,
    stars: 0,
    lightning: 0,
  },
  dusk: {
    top: new THREE.Color('#1d2b52'),
    horizon: new THREE.Color('#f2a163'),
    ground: new THREE.Color('#4a4148'),
    sun: new THREE.Color('#ffd0a0'),
    sunElevation: 3.2,
    sunAzimuth: 262,
    sunSize: 0.052,
    ambient: 0.42,
    sunIntensity: 1.55,
    fogNear: 1100,
    fogFar: 9000,
    cloud: 0.75,
    cloudTint: '#f0b48a',
    cloudCount: 30,
    stars: 900,
    lightning: 0,
  },
};

const VERT = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunSize;
varying vec3 vWorld;

void main() {
  vec3 dir = normalize(vWorld);
  float h = dir.y;
  float up = pow(max(h, 0.0), 0.55);
  vec3 sky = mix(horizonColor, topColor, up);
  vec3 below = mix(horizonColor, groundColor, pow(max(-h, 0.0), 0.45));
  vec3 color = mix(below, sky, smoothstep(-0.02, 0.06, h));

  float cosAngle = dot(dir, normalize(sunDir));
  float disc = smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.45, cosAngle);
  float glow = pow(max(cosAngle, 0.0), 26.0) * 0.38 + pow(max(cosAngle, 0.0), 6.0) * 0.2;
  color += sunColor * (disc * 0.85 + glow);

  gl_FragColor = vec4(color, 1.0);
}`;

function createSky(scene, renderer) {
  const geometry = new THREE.SphereGeometry(WORLD.half * 1.35, 32, 24);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      groundColor: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunSize: { value: 0.03 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 900;
  sunLight.shadow.camera.left = -320;
  sunLight.shadow.camera.right = 320;
  sunLight.shadow.camera.top = 320;
  sunLight.shadow.camera.bottom = -320;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.6;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const ambient = new THREE.HemisphereLight(0xcfe3f2, 0x544b3c, 0.9);
  scene.add(ambient);

  const cloudTexture = makeCloudTexture();
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  scene.add(clouds);

  const random = createRandom(4242);
  const puffs = [];
  for (let i = 0; i < 80; i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: true,
      }),
    );
    sprite.visible = false;
    clouds.add(sprite);
    puffs.push(sprite);
  }

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(0.06 + random() * 0.94);
    const radius = WORLD.half * 1.25;
    starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    starPositions[i * 3 + 1] = Math.cos(phi) * radius;
    starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xdbe9ff, size: 13, sizeAttenuation: true, transparent: true, opacity: 0 }),
  );
  stars.frustumCulled = false;
  scene.add(stars);

  const state = {
    preset: PRESETS.clear,
    flash: 0,
    flashTimer: 3,
    time: 0,
  };

  const sunDirection = new THREE.Vector3();

  function setWeather(name) {
    const preset = PRESETS[name] || PRESETS.clear;
    state.preset = preset;
    material.uniforms.topColor.value.copy(preset.top);
    material.uniforms.horizonColor.value.copy(preset.horizon);
    material.uniforms.groundColor.value.copy(preset.ground);
    material.uniforms.sunColor.value.copy(preset.sun);
    material.uniforms.sunSize.value = preset.sunSize;

    const azimuth = THREE.MathUtils.degToRad(preset.sunAzimuth);
    const elevation = THREE.MathUtils.degToRad(preset.sunElevation);
    sunDirection.set(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    );
    material.uniforms.sunDir.value.copy(sunDirection);
    sunLight.color.copy(preset.sun);
    sunLight.intensity = preset.sunIntensity;
    ambient.intensity = preset.ambient;
    ambient.color.copy(preset.top).lerp(new THREE.Color('#ffffff'), 0.55);
    ambient.groundColor.set(preset.ground);

    if (scene.fog) {
      scene.fog.color.copy(preset.horizon);
      scene.fog.near = preset.fogNear;
      scene.fog.far = preset.fogFar;
    } else {
      scene.fog = new THREE.Fog(preset.horizon.getHex(), preset.fogNear, preset.fogFar);
    }
    renderer.setClearColor(preset.horizon, 1);
    stars.material.opacity = preset.stars > 0 ? 0.9 : 0;

    // Lay puffs out in banks so the sky has structure instead of a uniform speckle.
    const tint = new THREE.Color(preset.cloudTint);
    for (let i = 0; i < puffs.length; i += 1) {
      const sprite = puffs[i];
      if (i >= preset.cloudCount) {
        sprite.visible = false;
        continue;
      }
      const bank = Math.floor(i / 4);
      const angle = (bank / Math.max(1, preset.cloudCount / 4)) * Math.PI * 2 + random() * 0.7;
      const distance = 2200 + random() * 5200;
      const height = 900 + random() * 1500;
      sprite.position.set(Math.cos(angle) * distance, height, Math.sin(angle) * distance);
      const size = 700 + random() * 1500;
      sprite.scale.set(size, size * (0.36 + random() * 0.2), 1);
      sprite.material.opacity = 0.35 + random() * 0.5;
      sprite.material.color.copy(tint);
      sprite.visible = true;
    }
  }

  function update(dt, camera) {
    state.time += dt;
    dome.position.copy(camera.position);
    stars.position.copy(camera.position);

    if (state.preset.lightning > 0) {
      state.flashTimer -= dt;
      if (state.flashTimer <= 0) {
        state.flash = 1;
        state.flashTimer = 2.6 + Math.random() * 4.4;
      }
      state.flash = Math.max(0, state.flash - dt * 3.4);
      ambient.intensity = state.preset.ambient + state.flash * 1.6;
      material.uniforms.horizonColor.value
        .copy(state.preset.horizon)
        .lerp(new THREE.Color('#ffffff'), state.flash * 0.35);
    }

    sunLight.position
      .copy(camera.position)
      .addScaledVector(sunDirection, 420)
      .setY(camera.position.y + sunDirection.y * 420 + 40);
    sunLight.target.position.copy(camera.position);
    sunLight.target.updateMatrixWorld();
  }

  setWeather('clear');

  return { dome, sunLight, ambient, clouds, stars, setWeather, update, state, direction: sunDirection };
}

function makeCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,0.24)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i += 1) {
    const x = 40 + Math.random() * 176;
    const y = 70 + Math.random() * 120;
    const r = 18 + Math.random() * 46;
    const blob = ctx.createRadialGradient(x, y, 1, x, y, r);
    blob.addColorStop(0, 'rgba(255,255,255,0.32)');
    blob.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
