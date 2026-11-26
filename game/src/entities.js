// Everything that is not the aircraft or the ground: the gate rings, the survey drones, the drop
// markers, the coast beacons and the flak bursts. Placed by mission, animated by one update call.

const RING_MAT = new THREE.MeshStandardMaterial({
  color: 0xffb43c,
  emissive: 0xff7a10,
  emissiveIntensity: 0.85,
  roughness: 0.42,
  metalness: 0.35,
});
const RING_INNER_MAT = new THREE.MeshStandardMaterial({
  color: 0xffe0a0,
  emissive: 0xff9c30,
  emissiveIntensity: 1.3,
  roughness: 0.5,
  metalness: 0.1,
});
const RING_GLOW = new THREE.SpriteMaterial({
  color: 0xffce7a,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function createEntities(scene, terrain) {
  const root = new THREE.Group();
  root.name = 'mission-objects';
  scene.add(root);
  const rings = [];
  const drones = [];
  const drops = [];
  const beacons = [];
  const flak = [];
  const events = [];
  const random = createRandom(20261126);
  let glowTexture = null;

  function ensureGlow() {
    if (glowTexture) return glowTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(canvas);
    glowTexture.needsUpdate = true;
    return glowTexture;
  }

  function clear() {
    // Empty the group in place: splicing while walking the array leaves the scene graph half torn
    // down between frames. Dispose geometry first, then drop every child at once.
    for (const child of root.children) {
      child.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
      });
    }
    root.children.length = 0;
    rings.length = 0;
    drones.length = 0;
    drops.length = 0;
    beacons.length = 0;
    flak.length = 0;
    events.length = 0;
  }

  function addRing(position, direction, radius = MISSION_META.ringRadius) {
    const group = new THREE.Group();
    group.position.copy(position);
    group.lookAt(position.clone().add(direction));
    // Each gate owns its torus material so the next-gate pulse cannot light up the whole course.
    const torusMaterial = RING_MAT.clone();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.075, 10, 48), torusMaterial);
    torus.castShadow = false;
    group.add(torus);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(radius - radius * 0.085, radius * 0.022, 8, 44), RING_INNER_MAT);
    lip.position.z = -radius * 0.03;
    group.add(lip);
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.1, radius * 0.16, radius * 0.16), torusMaterial);
      stud.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      stud.rotation.z = angle;
      group.add(stud);
    }

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(radius - 1.4, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffcf6a,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    group.add(inner);

    const haloMaterial = RING_GLOW.clone();
    haloMaterial.map = ensureGlow();
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.setScalar(radius * 2.4);
    group.add(halo);

    // A soft patch of shade on the ground beneath each gate gives it a place in the world.
    const contact = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0x1d2418, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(0, terrain.heightAt(position.x, position.z) + 1.6 - position.y, 0);
    group.add(contact);

    for (let i = 0; i < 12; i += 1) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.035, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
      );
      const angle = (i / 12) * Math.PI * 2 + 0.26;
      bulb.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, radius * 0.06);
      group.add(bulb);
    }

    root.add(group);
    const normal = direction.clone().normalize();
    rings.push({
      group,
      torus,
      inner,
      halo,
      center: position.clone(),
      normal,
      radius,
      passed: false,
      phase: random() * Math.PI * 2,
      bob: position.y,
    });
    return rings[rings.length - 1];
  }

  function routeRing(index, path) {
    const p = path[Math.min(index, path.length - 1)];
    const next = path[Math.min(index + 1, path.length - 1)];
    const prev = path[Math.max(0, index - 1)];
    const dir = next.clone().sub(prev).normalize();
    const clearance = 120 + 40 * Math.sin(index * 1.7);
    const y = Math.max(p.y + clearance, terrain.heightAt(p.x, p.z) + clearance);
    return addRing(new THREE.Vector3(p.x, y, p.z), dir);
  }

  function buildCourse(count, options = {}) {
    const path = [];
    const startX = options.startX ?? -2200;
    const startZ = options.startZ ?? 520;
    const heading = options.heading ?? 0.2;
    for (let i = 0; i < count + 2; i += 1) {
      const t = i / (count + 1);
      const x = startX + Math.cos(heading) * (i * 950) + Math.sin(t * 6.2) * 700;
      const z = startZ + Math.sin(heading) * (i * 950) + Math.cos(t * 4.1) * 1250 - 400;
      path.push(new THREE.Vector3(x, terrain.heightAt(x, z), z));
    }
    for (let i = 0; i < count; i += 1) routeRing(i + 1, path);
  }

  function addDrone(position, orbitRadius, speed, phase) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 7.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.45, metalness: 0.6 }),
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    group.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 2.1), new THREE.MeshStandardMaterial({ color: 0x414c56, roughness: 0.6 }));
    wing.castShadow = true;
    group.add(wing);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    lamp.position.set(0, 1.1, 0);
    group.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ensureGlow(), color: 0xff6a55, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(9);
    halo.position.y = 1.1;
    group.add(halo);
    root.add(group);

    const drone = {
      group,
      lamp,
      halo,
      center: position.clone(),
      radius: orbitRadius,
      speed,
      phase,
      alive: true,
      hp: 2,
      cooldown: 1.5 + random() * 2,
    };
    group.position.copy(position);
    drones.push(drone);
    return drone;
  }

  function buildPatrol(count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const cx = Math.cos(angle) * 2600;
      const cz = Math.sin(angle) * 2300 - 500;
      const altitude = 420 + (i % 2) * 190 + terrain.heightAt(cx, cz) * 0.35;
      addDrone(new THREE.Vector3(cx, altitude, cz), 320 + i * 40, 26 + i * 3.5, angle);
    }
  }

  function addDropZone(x, z, label) {
    const y = terrain.heightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y + 1.2, z);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(26, 34, 40),
      new THREE.MeshBasicMaterial({ color: 0x51ffb0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(24, 32),
      new THREE.MeshBasicMaterial({ color: 0x51ffb0, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    );
    inner.rotation.x = -Math.PI / 2;
    group.add(inner);
    for (let i = 0; i < 4; i += 1) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 1.4), new THREE.MeshStandardMaterial({ color: 0xe8f6ee, emissive: 0x1f7a52 }));
      const a = (i / 4) * Math.PI * 2 + 0.4;
      post.position.set(Math.cos(a) * 36, 4.5, Math.sin(a) * 36);
      group.add(post);
    }
    root.add(group);
    const zone = { group, disc, x, z, y, label, phase: random() * 6.28, scored: false, armed: false };
    drops.push(zone);
    return zone;
  }

  function buildDrops(count) {
    for (let i = 0; i < count; i += 1) {
      const x = -1800 + i * 2300;
      const z = 900 - i * 1250;
      addDropZone(x, z, String.fromCharCode(65 + i));
    }
  }

  function addBeacon(x, z, index) {
    const y = terrain.heightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 46, 8), new THREE.MeshStandardMaterial({ color: 0x3b444d, metalness: 0.4, roughness: 0.6 }));
    mast.position.y = 23;
    mast.castShadow = true;
    group.add(mast);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8ff0ff }));
    lamp.position.y = 47;
    group.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ensureGlow(), color: 0x7fe3ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(44);
    halo.position.y = 47;
    group.add(halo);
    root.add(group);
    beacons.push({ group, lamp, halo, x, y, z, index, phase: index * 1.4, visited: false });
    return beacons[beacons.length - 1];
  }

  function buildCoastBeacons(count) {
    for (let i = 0; i < count; i += 1) {
      const x = -2400 + i * 2600;
      const z = 1500 - i * 1400;
      addBeacon(x, z, i);
    }
  }

  function spawnFlak(position) {
    const group = new THREE.Group();
    group.position.copy(position);
    for (let i = 0; i < 7; i += 1) {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: ensureGlow(), color: 0x2b2b2b, transparent: true, opacity: 0.75, depthWrite: false }),
      );
      const a = random() * Math.PI * 2;
      const r = random() * 9;
      puff.position.set(Math.cos(a) * r, (random() - 0.5) * 8, Math.sin(a) * r);
      puff.scale.setScalar(10 + random() * 12);
      group.add(puff);
    }
    root.add(group);
    flak.push({ group, life: 1.6, max: 1.6 });
  }

  function update(dt, ctx) {
    const { player, onEvent } = ctx || {};
    // The next gate in the sequence is the only one that breathes: everything behind it holds a
    // flat glow so the eye reads the course order at a glance.
    const nextRing = rings.find((ring) => !ring.passed);
    for (const ring of rings) {
      ring.phase += dt * 1.6;
      ring.group.position.y = ring.bob + Math.sin(ring.phase) * 3.2;
      if (ring === nextRing) {
        const pulse = 0.55 + 0.42 * Math.sin(ring.phase * 2.4);
        ring.halo.material.opacity = 0.62 + 0.3 * Math.sin(ring.phase * 2.4);
        ring.torus.material.emissiveIntensity = 0.85 + pulse * 1.35;
      } else {
        ring.halo.material.opacity = ring.passed ? 0.12 : 0.36;
        ring.torus.material.emissiveIntensity = ring.passed ? 0.25 : 0.85;
      }
      if (ring.passed) continue;
      if (player) {
        const rel = player.position.clone().sub(ring.group.position);
        const along = rel.dot(ring.normal);
        const lateral = rel.clone().addScaledVector(ring.normal, -along).length();
        const previous = ring.previousAlong ?? 0;
        if (previous < 0 && along >= 0 && lateral < ring.radius * 0.94) {
          ring.passed = true;
          ring.halo.material.opacity = 0.1;
          events.push({ type: 'ring', ring });
          if (onEvent) onEvent({ type: 'ring', ring });
        }
        ring.previousAlong = along;
      }
    }

    for (const drone of drones) {
      if (!drone.alive) {
        drone.group.position.y -= dt * 22;
        drone.group.rotation.z += dt * 2.4;
        if (drone.group.position.y < terrain.heightAt(drone.group.position.x, drone.group.position.z)) drone.group.visible = false;
        continue;
      }
      drone.phase += (drone.speed / drone.radius) * dt;
      const x = drone.center.x + Math.cos(drone.phase) * drone.radius;
      const z = drone.center.z + Math.sin(drone.phase) * drone.radius;
      const y = drone.center.y + Math.sin(drone.phase * 2.3) * 24;
      drone.group.position.set(x, y, z);
      const tangent = new THREE.Vector3(-Math.sin(drone.phase), 0, Math.cos(drone.phase));
      drone.group.lookAt(x + tangent.x, y, z + tangent.z);
      drone.lamp.material.color.setHex(Math.sin(drone.phase * 9) > 0 ? 0xff3b2f : 0x40120f);
      drone.halo.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(drone.phase * 9));
    }

    for (const zone of drops) {
      zone.phase += dt;
      zone.disc.material.opacity = 0.55 + 0.3 * Math.sin(zone.phase * 2);
      zone.disc.scale.setScalar(1 + 0.04 * Math.sin(zone.phase * 2));
    }

    for (const beacon of beacons) {
      beacon.phase += dt * 2.2;
      const on = Math.sin(beacon.phase) > 0.2;
      beacon.lamp.material.color.setHex(on ? 0x8ff0ff : 0x193c48);
      beacon.halo.material.opacity = on ? 0.85 : 0.12;
    }

    for (let i = flak.length - 1; i >= 0; i -= 1) {
      const burst = flak[i];
      burst.life -= dt;
      const t = 1 - burst.life / burst.max;
      burst.group.children.forEach((puff, index) => {
        puff.position.multiplyScalar(1 + dt * 0.9);
        puff.material.opacity = Math.max(0, 0.8 * (1 - t)) * (0.6 + 0.4 * Math.sin(index + t * 6));
        puff.scale.setScalar((12 + index * 2) * (0.6 + t * 1.1));
      });
      if (burst.life <= 0) {
        root.remove(burst.group);
        flak.splice(i, 1);
      }
    }
  }

  function hitScan(origin, direction, maxDistance = 700) {
    let best = null;
    let bestT = maxDistance;
    for (const drone of drones) {
      if (!drone.alive) continue;
      const toDrone = drone.group.position.clone().sub(origin);
      const t = toDrone.dot(direction);
      if (t < 0 || t > bestT) continue;
      const closest = origin.clone().addScaledVector(direction, t);
      if (closest.distanceTo(drone.group.position) < 9) {
        best = drone;
        bestT = t;
      }
    }
    return best;
  }

  function nearestDrone(position) {
    let best = null;
    let bestDistance = Infinity;
    for (const drone of drones) {
      if (!drone.alive) continue;
      const distance = drone.group.position.distanceTo(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = drone;
      }
    }
    return { drone: best, distance: bestDistance };
  }

  function destroyDrone(drone) {
    drone.alive = false;
    drone.hp = 0;
    events.push({ type: 'drone', drone });
  }

  return {
    root,
    rings,
    drones,
    drops,
    beacons,
    flak,
    events,
    clear,
    buildCourse,
    buildPatrol,
    buildDrops,
    buildCoastBeacons,
    addRing,
    addDrone,
    addDropZone,
    addBeacon,
    update,
    hitScan,
    nearestDrone,
    destroyDrone,
    spawnFlak,
    random,
  };
}
