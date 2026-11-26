// The aircraft: a hand-built low-wing tourer in cream and coral. Every moving part that the
// player sees move — ailerons, elevator, rudder, propeller, wheels — hangs off a named pivot here.

const BODY = new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.55, metalness: 0.15 });
const ACCENT = new THREE.MeshStandardMaterial({ color: 0xd1503c, roughness: 0.5, metalness: 0.2 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.7, metalness: 0.35 });
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x8fc7d8,
  roughness: 0.08,
  metalness: 0.4,
  transparent: true,
  opacity: 0.46,
});
const METAL = new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.55, metalness: 0.35 });

// Wingtip offsets, shared by the strobe sprites and wingtips() so contrails leave from the lens.
const WING_TIP_X = 5.35;
const WING_TIP_Y = -0.1;
const WING_TIP_Z = 0.95;

function wingGeometry(span, rootChord, tipChord, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -rootChord / 2);
  shape.lineTo(span, -tipChord / 2 + 0.28);
  shape.lineTo(span, tipChord / 2 + 0.28);
  shape.lineTo(0, rootChord / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, thickness / 2, 0);
  return geometry;
}

function createAircraft() {
  const group = new THREE.Group();
  group.name = 'sirocco-1';

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.52, 6.4, 18, 1), BODY);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  fuselage.castShadow = true;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.5, 18, 1), ACCENT);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -3.35;
  nose.castShadow = true;
  group.add(nose);

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 14), METAL);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.45;
  group.add(spinner);

  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.16, 2.6, 14, 1), BODY);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 4.1;
  tailCone.castShadow = true;
  group.add(tailCone);

  const wing = new THREE.Mesh(wingGeometry(5.6, 2.5, 1.15, 0.24), BODY);
  wing.position.set(0, -0.34, 0.6);
  wing.rotation.z = 0.035;
  wing.castShadow = true;
  group.add(wing);

  const wingMirror = wing.clone();
  wingMirror.scale.x = -1;
  wingMirror.rotation.z = -0.035;
  wingMirror.position.x = 0;
  group.add(wingMirror);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.32, 3.4), DARK);
  belly.position.set(0, -0.62, 0.7);
  group.add(belly);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.82, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), GLASS);
  canopy.scale.set(1, 1.05, 2.35);
  canopy.position.set(0, 0.42, -0.85);
  canopy.rotation.x = -0.03;
  group.add(canopy);

  const panelFace = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 0.1), DARK);
  panelFace.position.set(0, 0.42, -1.42);
  panelFace.rotation.x = -0.28;
  group.add(panelFace);
  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 0.5), DARK);
  glare.position.set(0, 0.6, -1.28);
  glare.rotation.x = 0.2;
  group.add(glare);

  const dashboardGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x1d3a44, transparent: true, opacity: 0.9 }),
  );
  dashboardGlow.position.set(0, 0.42, -1.47);
  dashboardGlow.rotation.x = -0.28 + Math.PI;
  group.add(dashboardGlow);

  const fin = new THREE.Mesh(wingGeometry(0.001, 0.001, 0.001, 0.001), BODY);
  fin.visible = false;
  group.add(fin);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(1.55, 0.15);
  finShape.lineTo(1.45, 1.35);
  finShape.lineTo(0.1, 1.5);
  finShape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.16, bevelEnabled: false });
  finGeometry.rotateY(Math.PI / 2);
  const verticalFin = new THREE.Mesh(finGeometry, BODY);
  verticalFin.position.set(-0.08, 0.22, 4.85);
  verticalFin.castShadow = true;
  group.add(verticalFin);

  const finCap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.4), ACCENT);
  finCap.position.set(0, 1.62, 4.18);
  finCap.rotation.x = 0.12;
  group.add(finCap);

  const stab = new THREE.Mesh(wingGeometry(1.9, 1.05, 0.55, 0.16), BODY);
  stab.position.set(0, 0.12, 3.9);
  stab.castShadow = true;
  group.add(stab);
  const stabMirror = stab.clone();
  stabMirror.scale.x = -1;
  group.add(stabMirror);

  function controlSurface(width, height, depth) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), BODY);
    mesh.position.z = depth / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  }

  const aileronL = controlSurface(1.5, 0.1, 0.55);
  aileronL.position.set(4.0, -0.34, 1.1);
  group.add(aileronL);

  const aileronR = controlSurface(1.5, 0.1, 0.55);
  aileronR.position.set(-4.0, -0.34, 1.1);
  group.add(aileronR);

  const elevator = controlSurface(1.75, 0.09, 0.5);
  elevator.position.set(0, 0.14, 4.28);
  group.add(elevator);

  const rudder = controlSurface(0.09, 1.25, 0.55);
  rudder.position.set(0, 0.95, 4.78);
  group.add(rudder);

  const propGroup = new THREE.Group();
  propGroup.position.z = -4.62;
  group.add(propGroup);
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 2.0, 0.06), DARK);
    blade.position.y = 0.92;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    propGroup.add(holder);
  }

  const propDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 40),
    new THREE.MeshBasicMaterial({
      color: 0x2a2f36,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  propDisc.position.z = -4.66;
  group.add(propDisc);

  const gearGroup = new THREE.Group();
  group.add(gearGroup);
  const wheels = [];
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), METAL);
    strut.position.set(side * 1.35, -1.0, 0.3);
    strut.rotation.z = side * 0.12;
    gearGroup.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 16), DARK);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.45, -1.52, 0.3);
    wheel.castShadow = true;
    gearGroup.add(wheel);
    wheels.push(wheel);
  }
  const tailStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), METAL);
  tailStrut.position.set(0, -0.55, 4.4);
  gearGroup.add(tailStrut);
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), DARK);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.86, 4.4);
  gearGroup.add(tailWheel);
  wheels.push(tailWheel);

  const navRed = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4433 }),
  );
  navRed.position.set(-5.25, -0.2, 0.95);
  group.add(navRed);
  const navGreen = navRed.clone();
  navGreen.material = new THREE.MeshBasicMaterial({ color: 0x33ff88 });
  navGreen.position.x = 5.3;
  group.add(navGreen);
  const navWhite = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  navWhite.position.set(0, 1.0, 5.0);
  group.add(navWhite);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff6a3d }),
  );
  beacon.position.set(0, 1.74, 4.2);
  group.add(beacon);

  const strobeMaterial = new THREE.SpriteMaterial({
    color: 0xfff4d8,
    map: makeGlowTexture(),
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const strobes = [];
  for (const side of [-1, 1]) {
    const sprite = new THREE.Sprite(strobeMaterial.clone());
    sprite.position.set(side * WING_TIP_X, WING_TIP_Y, WING_TIP_Z);
    sprite.scale.setScalar(1.1);
    group.add(sprite);
    strobes.push(sprite);
  }

  /**
   * Both wingtip positions in world space, in the order the strobes were added (-1 then +1).
   * Pass a pair of vectors to reuse them; contrails call this every frame.
   */
  function wingtips(target) {
    const out = target || [new THREE.Vector3(), new THREE.Vector3()];
    out[0]
      .set(-WING_TIP_X, WING_TIP_Y, WING_TIP_Z)
      .applyQuaternion(group.quaternion)
      .add(group.position);
    out[1]
      .set(WING_TIP_X, WING_TIP_Y, WING_TIP_Z)
      .applyQuaternion(group.quaternion)
      .add(group.position);
    return out;
  }

  const shadowTexture = makeShadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.4 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;

  const state = { propAngle: 0, gearDown: 1, strobeTimer: 0, flap: 0 };

  function update(dt, { throttle, gearDown, flap, controls, airspeed }) {
    state.propAngle += dt * (6 + throttle * 90);
    propGroup.rotation.z = state.propAngle;
    propDisc.material.opacity = clamp(0.04 + throttle * 0.12, 0.04, 0.18);
    propDisc.rotation.z = state.propAngle * 0.5;

    state.gearDown += clamp((gearDown ? 1 : 0) - state.gearDown, -dt * 0.9, dt * 0.9);
    gearGroup.scale.set(1, state.gearDown, 1);
    gearGroup.visible = state.gearDown > 0.02;
    gearGroup.position.y = (1 - state.gearDown) * 0.9;

    state.flap += clamp(flap - state.flap, -dt * 0.55, dt * 0.55);
    aileronL.rotation.x = -controls.roll * 0.42;
    aileronR.rotation.x = controls.roll * 0.42;
    elevator.rotation.x = -controls.pitch * 0.4;
    rudder.rotation.y = controls.yaw * 0.45;

    for (const wheel of wheels) wheel.rotation.x -= airspeed * dt * 2.2;

    state.strobeTimer += dt;
    const flash = state.strobeTimer % 1.15 < 0.09;
    for (const sprite of strobes) sprite.material.opacity = flash ? 1 : 0.05;
    beacon.material.color.setHex(state.strobeTimer % 1.4 < 0.2 ? 0xff2b12 : 0x5c1f12);

    const glow = 0.35 + throttle * 0.65;
    navRed.material.color.setRGB(1 * glow, 0.2 * glow, 0.16 * glow);
    navGreen.material.color.setRGB(0.18 * glow, 1 * glow, 0.45 * glow);
  }

  function setCamera(mode, camera) {
    if (mode === 'cockpit') {
      camera.position.set(...CAMERA.cockpit.eye);
      camera.fov = CAMERA.cockpit.fov;
      camera.near = 0.05;
    } else if (mode === 'orbit') {
      camera.position.set(0, CAMERA.orbit.up, CAMERA.orbit.back);
      camera.fov = CAMERA.orbit.fov;
    } else {
      camera.position.set(0, CAMERA.chase.up, CAMERA.chase.back);
      camera.fov = CAMERA.chase.fov;
    }
    camera.updateProjectionMatrix();
  }

  /** Drop the blob on the ground beneath the aeroplane, along the sun direction. */
  function placeShadow(surfaceY, sunDirection, agl) {
    const spread = 1 + Math.min(agl, 400) / 220;
    const offset = Math.min(agl, 400) / Math.max(0.35, sunDirection.y);
    shadow.position.set(
      group.position.x + sunDirection.x * offset * 0.6,
      surfaceY + 1.4,
      group.position.z + sunDirection.z * offset * 0.6,
    );
    shadow.scale.set(13 * spread, 15 * spread, 1);
    shadow.material.opacity = Math.max(0, 0.42 - Math.min(agl, 400) / 1100);
    shadow.visible = agl < 420;
  }

  return {
    group,
    wheels,
    propGroup,
    propDisc,
    navRed,
    navGreen,
    strobes,
    wingtips,
    update,
    setCamera,
    state,
    shadow,
    placeShadow,
  };
}

function makeShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
