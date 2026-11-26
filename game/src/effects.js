// Particles: gun tracers, muzzle flash, engine smoke, fires, touchdown dust and explosions. All
// pooled sprites so a long mission never allocates in the middle of a fight.

const MAX_PARTICLES = 420;
const MAX_TRACERS = 64;

function createEffects(scene) {
  const glow = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,214,140,0.35)');
  const smokeTex = makeRadialTexture('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');

  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: smokeTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: 0xffffff,
      }),
    );
    sprite.visible = false;
    scene.add(sprite);
    particles.push({ sprite, life: 0, max: 1, velocity: new THREE.Vector3(), growth: 20, fade: 1, gravity: -3 });
  }

  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: 0xffd479,
      }),
    );
    sprite.visible = false;
    scene.add(sprite);
    tracers.push({ sprite, life: 0, velocity: new THREE.Vector3() });
  }

  const random = createRandom(5150);
  let cursor = 0;
  let tracerCursor = 0;
  let smokeClock = 0;
  let contrailClock = 0;

  // Scratch vectors so the per-frame emitters never build garbage.
  const smokeOrigin = new THREE.Vector3();
  const tailOffset = new THREE.Vector3(0, 0.2, 2.4);
  const fallbackTips = [new THREE.Vector3(), new THREE.Vector3()];

  function spawn(position, options = {}) {
    const particle = particles[cursor % MAX_PARTICLES];
    cursor += 1;
    particle.sprite.position.copy(position);
    particle.sprite.material.color.set(options.color ?? 0xdddddd);
    particle.sprite.material.map = options.glow ? glow : smokeTex;
    particle.sprite.material.opacity = options.opacity ?? 0.6;
    particle.sprite.scale.setScalar(options.size ?? 12);
    particle.life = options.life ?? 1.4;
    particle.max = particle.life;
    particle.growth = options.growth ?? 34;
    particle.velocity.copy(options.velocity ?? new THREE.Vector3());
    particle.gravity = options.gravity ?? -2.2;
    particle.sprite.visible = true;
    return particle;
  }

  function burst(position, count, options = {}) {
    for (let i = 0; i < count; i += 1) {
      const velocity = new THREE.Vector3(
        (random() - 0.5) * (options.spread ?? 14),
        (random() - 0.5) * (options.spread ?? 14) + (options.lift ?? 2),
        (random() - 0.5) * (options.spread ?? 14),
      );
      spawn(position, { ...options, velocity, size: (options.size ?? 10) * (0.6 + random() * 0.9) });
    }
  }

  function fire(origin, direction, options = {}) {
    const speed = options.speed ?? 620;
    for (let i = 0; i < 3; i += 1) {
      const tracer = tracers[tracerCursor % MAX_TRACERS];
      tracerCursor += 1;
      tracer.sprite.position.copy(origin).addScaledVector(direction, i * 14);
      tracer.sprite.scale.setScalar(6 + i * 1.5);
      tracer.sprite.material.opacity = 1;
      tracer.sprite.visible = true;
      tracer.life = 1.1;
      tracer.velocity.copy(direction).multiplyScalar(speed);
      tracer.velocity.x += (random() - 0.5) * 6;
      tracer.velocity.y += (random() - 0.5) * 6;
      tracer.velocity.z += (random() - 0.5) * 6;
    }

    burst(origin, 3, {
      color: 0xffd27a,
      glow: true,
      size: 7,
      life: 0.16,
      growth: 10,
      gravity: 0,
      opacity: 0.9,
      spread: 4,
    });
  }

  function explosion(position, scale = 1) {
    burst(position, 16, {
      color: 0xffb257,
      glow: true,
      size: 22 * scale,
      life: 0.6,
      growth: 60 * scale,
      gravity: 1.6,
      opacity: 0.95,
      spread: 26 * scale,
      lift: 8,
    });
    burst(position, 22, {
      color: 0x40424a,
      size: 30 * scale,
      life: 2.6,
      growth: 42 * scale,
      gravity: 1.2,
      opacity: 0.55,
      spread: 18 * scale,
      lift: 6,
    });
  }

  /**
   * Where the contrails should leave the aeroplane. The caller may hand over the real wingtip
   * positions (aircraft.wingtips passed as a function, or a pair of vectors); without them we fall
   * back to the modelled offsets so the effect still reads in isolation.
   */
  function wingtipPair(ctx, player) {
    const supplied = ctx.wingtips;
    if (typeof supplied === 'function') return supplied();
    if (Array.isArray(supplied) && supplied.length >= 2) return supplied;
    if (!player) return null;
    fallbackTips[0].set(-5.4, -0.1, 1.1).applyQuaternion(player.quaternion).add(player.position);
    fallbackTips[1].set(5.4, -0.1, 1.1).applyQuaternion(player.quaternion).add(player.position);
    return fallbackTips;
  }

  function update(dt, ctx = {}) {
    for (const particle of particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.sprite.visible = false;
        continue;
      }
      const t = 1 - particle.life / particle.max;
      particle.sprite.position.addScaledVector(particle.velocity, dt);
      particle.velocity.y += particle.gravity * dt;
      particle.velocity.multiplyScalar(1 - 0.35 * dt);
      particle.sprite.scale.setScalar(particle.sprite.scale.x + particle.growth * dt);
      particle.sprite.material.opacity = Math.max(0, (1 - t) * 0.8);
    }

    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) {
        tracer.sprite.visible = false;
        continue;
      }
      tracer.sprite.position.addScaledVector(tracer.velocity, dt);
      tracer.sprite.material.opacity = Math.min(1, tracer.life * 3);
    }

    const player = ctx.player;
    if (!player) return;

    smokeClock += dt;
    const hurt = player.hull / 100;
    if (hurt < 0.72 && smokeClock > 0.06) {
      smokeClock = 0;
      smokeOrigin.copy(tailOffset).applyQuaternion(player.quaternion).add(player.position);
      spawn(smokeOrigin, {
        color: hurt < 0.4 ? 0x2a2a2a : 0x9a9a9a,
        size: 7,
        life: 1.6,
        growth: 26,
        opacity: 0.42,
        velocity: new THREE.Vector3(0, 1.5, 0),
      });
      if (hurt < 0.35 && chance(0.6, random)) {
        spawn(smokeOrigin, { color: 0xff7a33, glow: true, size: 4, life: 0.35, growth: 16, opacity: 0.85, gravity: 0 });
      }
    }

    contrailClock += dt;
    if (contrailClock > 0.05 && player.speed > 42 && player.agl > 8) {
      contrailClock = 0;
      const tips = wingtipPair(ctx, player);
      if (tips) {
        for (const tip of tips) {
          spawn(tip, {
            color: 0xffffff,
            size: 2.4,
            life: 1.1,
            growth: 5,
            opacity: 0.24,
            gravity: 0,
          });
        }
      }
    }
  }

  function reset() {
    for (const particle of particles) {
      particle.life = 0;
      particle.sprite.visible = false;
    }
    for (const tracer of tracers) {
      tracer.life = 0;
      tracer.sprite.visible = false;
    }
  }

  return { update, fire, explosion, burst, spawn, reset };
}

function makeRadialTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.45, outer);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
