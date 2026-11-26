// The glass: manifold pressure, airspeed, attitude, altitude, vertical speed, the compass tape,
// target carets and every menu screen. Drawn on a 2D canvas over the WebGL view so text stays
// crisp at any window size.

const KT = 1.94384;
const FT = 3.28084;

function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    ctx.clearRect(0, 0, width, height);
  }

  function panel(x, y, w, h, radius = 10, fill = PALETTE.panel) {
    ctx.beginPath();
    roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function label(text, x, y, size = 11, color = PALETTE.hudDim, align = 'left', font = FONT) {
    ctx.font = `600 ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function value(text, x, y, size = 20, color = PALETTE.hud, align = 'left') {
    ctx.font = `600 ${size}px ${MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function project(camera, position) {
    const vector = position.clone().project(camera);
    return {
      x: (vector.x * 0.5 + 0.5) * width,
      y: (-vector.y * 0.5 + 0.5) * height,
      visible: vector.z < 1 && vector.z > -1,
    };
  }

  function drawCompass(state) {
    const tapeWidth = Math.min(560, width * 0.44);
    const cx = width / 2;
    const top = 18;
    panel(cx - tapeWidth / 2, top, tapeWidth, 52, 8, 'rgba(8,13,20,0.62)');

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - tapeWidth / 2, top, tapeWidth, 52);
    ctx.clip();
    const pxPerDeg = tapeWidth / 120;
    const heading = state.heading;
    for (let deg = -70; deg <= 70; deg += 5) {
      const absolute = ((Math.round(heading / 5) * 5 + deg) % 360 + 360) % 360;
      const x = cx + (deg - (heading - Math.round(heading / 5) * 5)) * pxPerDeg;
      const major = absolute % 30 === 0;
      const medium = absolute % 10 === 0;
      ctx.strokeStyle = major ? PALETTE.hud : 'rgba(200,220,240,0.4)';
      ctx.lineWidth = major ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x, top + 28);
      ctx.lineTo(x, top + (major ? 16 : medium ? 21 : 24));
      ctx.stroke();
      if (major) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        const text = names[absolute] || String(absolute).padStart(3, '0');
        label(text, x, top + 10, 11, absolute % 90 === 0 ? PALETTE.hud : PALETTE.hudDim, 'center');
      }
    }
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx, top + 30);
    ctx.lineTo(cx - 7, top + 38);
    ctx.lineTo(cx + 7, top + 38);
    ctx.closePath();
    ctx.fillStyle = PALETTE.hudGood;
    ctx.fill();
    value(`${String(Math.round(state.heading) % 360).padStart(3, '0')}°`, cx, top + 45, 12, PALETTE.hudGood, 'center');
  }

  function drawAirpeed(x, y, r, state) {
    dialFace(x, y, r, { from: -220, to: 40, steps: 10, unit: 'KNOTS', labels: ['0', '', '40', '', '80', '', '120', '', '160', '', '200'] });
    const speed = state.speed * KT;
    const angle = -220 + (clamp(speed, 0, 200) / 200) * 260;
    needle(x, y, r, angle, PALETTE.hudGood);
    value(String(Math.round(speed)).padStart(3, '0'), x, y + r * 0.46, 19, PALETTE.hud, 'center');
    label('IAS', x, y - r * 0.36, 9, PALETTE.hudDim, 'center');
    if (state.stall > 0.05) {
      label('STALL', x, y + r * 0.2, 11, PALETTE.hudBad, 'center');
    }
  }

  function drawAltitude(x, y, r, state) {
    dialFace(x, y, r, { from: -220, to: 40, steps: 12, unit: 'ALT ×100', labels: ['0', '', '1', '', '2', '', '3', '', '4', '', '5', '', '6'] });
    const altitude = state.altitude * FT;
    const angle = -220 + (clamp(altitude, 0, 6000) / 6000) * 260;
    needle(x, y, r, angle, PALETTE.hud);
    value(String(Math.round(altitude / 10) * 10), x, y + r * 0.46, 17, PALETTE.hud, 'center');
    label('FT MSL', x, y - r * 0.36, 9, PALETTE.hudDim, 'center');
  }

  function dialFace(x, y, r, options) {
    const gradient = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
    gradient.addColorStop(0, 'rgba(44,62,80,0.96)');
    gradient.addColorStop(1, 'rgba(12,18,26,0.96)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,230,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const steps = options.steps;
    for (let i = 0; i <= steps; i += 1) {
      const angle = options.from + (i / steps) * (options.to - options.from);
      const rad = (angle * Math.PI) / 180;
      const major = options.labels[i] !== undefined;
      const inner = r * (major ? 0.7 : 0.78);
      const outer = r * 0.9;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(rad) * inner, y + Math.sin(rad) * inner);
      ctx.lineTo(x + Math.cos(rad) * outer, y + Math.sin(rad) * outer);
      ctx.strokeStyle = major ? PALETTE.hud : 'rgba(143,163,187,0.7)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.stroke();
      if (major) {
        label(options.labels[i], x + Math.cos(rad) * r * 0.55, y + Math.sin(rad) * r * 0.55, 9, PALETTE.hudDim, 'center');
      }
    }
    label(options.unit, x, y + r * 0.2, 9, PALETTE.hudDim, 'center');
  }

  function needle(x, y, r, angle, color) {
    const rad = (angle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(rad) * r * 0.14, y - Math.sin(rad) * r * 0.14);
    ctx.lineTo(x + Math.cos(rad) * r * 0.78, y + Math.sin(rad) * r * 0.78);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawAttitude(x, y, r, state) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    const bank = state.bank;
    const pitch = state.pitch;
    ctx.translate(x, y);
    ctx.rotate(-bank);
    const offset = clamp(pitch, -0.9, 0.9) * r * 1.5;

    ctx.fillStyle = '#3f7fb5';
    ctx.fillRect(-r * 2, -r * 2 + offset, r * 4, r * 2);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r * 2, offset, r * 4, r * 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 2, offset);
    ctx.lineTo(r * 2, offset);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    for (let deg = -30; deg <= 30; deg += 10) {
      if (deg === 0) continue;
      const lineY = offset - (deg * Math.PI) / 180 * r * 1.9;
      const half = r * (deg % 20 === 0 ? 0.42 : 0.24);
      ctx.beginPath();
      ctx.moveTo(-half, lineY);
      ctx.lineTo(half, lineY);
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,190,230,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = PALETTE.hudWarn;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x - r * 0.72, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + r * 0.72, y);
    ctx.lineTo(x + r, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.hudWarn;
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-bank);
    ctx.fillStyle = PALETTE.hudGood;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.62);
    ctx.lineTo(-4, -r * 0.5);
    ctx.lineTo(4, -r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label('ATT', x, y - r * 0.9, 9, PALETTE.hudDim, 'center');
  }

  function drawVerticalSpeed(x, y, h, state) {
    const w = 46;
    panel(x - w / 2, y, w, h, 6, 'rgba(8,13,20,0.55)');
    const fpm = state.verticalSpeed * FT * 60;
    const norm = clamp(fpm / 2400, -1, 1);
    const zero = y + h / 2;
    const marker = zero - norm * (h / 2 - 8);
    ctx.strokeStyle = 'rgba(200,220,240,0.25)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i += 1) {
      const lineY = zero - (i / 2) * (h / 2 - 8);
      ctx.beginPath();
      ctx.moveTo(x - 12, lineY);
      ctx.lineTo(x + 12, lineY);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - 14, marker);
    ctx.lineTo(x, marker - 6);
    ctx.lineTo(x, marker + 6);
    ctx.closePath();
    ctx.fillStyle = Math.abs(fpm) < 100 ? PALETTE.hudDim : fpm > 0 ? PALETTE.hudGood : PALETTE.hudWarn;
    ctx.fill();
    label('VS', x, y - 10, 9, PALETTE.hudDim, 'center');
    value(`${fpm > 0 ? '+' : ''}${Math.round(fpm / 10) * 10}`, x, y + h * 0.5, 9, PALETTE.hudDim, 'center');
  }

  function drawTargets(view) {
    const { camera, state, mission } = view;
    const list = view.targets || [];
    for (const target of list) {
      const point = project(camera, target.position);
      const onScreen = point.visible && point.x > 20 && point.x < width - 20 && point.y > 20 && point.y < height - 20;
      if (onScreen) {
        const size = target.size || 16;
        const color = target.color || PALETTE.hudWarn;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y - size - 16);
        ctx.lineTo(point.x - 7, point.y - size - 26);
        ctx.lineTo(point.x + 7, point.y - size - 26);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        const plateX = point.x + size + 8;
        const text = `${target.label}  ${target.detail || ''}`.trim();
        ctx.font = `600 11px ${MONO}`;
        const textWidth = ctx.measureText(text).width;
        panel(plateX - 6, point.y - 20, textWidth + 12, 22, 5, 'rgba(6,10,16,0.62)');
        label(target.label, plateX, point.y - 12, 12, color);
        label(target.detail || '', plateX, point.y - 1, 9, PALETTE.hudDim);
      } else {
        const angle = Math.atan2(target.position.y - state.position.y, new THREE.Vector2(target.position.x - state.position.x, target.position.z - state.position.z).length());
        const dx = target.position.x - state.position.x;
        const dz = target.position.z - state.position.z;
        const bearing = Math.atan2(dx, -dz) - (state.heading * Math.PI) / 180;
        const margin = 60;
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) * 0.34;
        const point2 = {
          x: cx + Math.sin(bearing) * radius,
          y: cy + clamp(-angle * 2, -0.22, 0.22) * radius,
        };
        ctx.save();
        ctx.translate(point2.x, point2.y);
        ctx.rotate(bearing);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 9);
        ctx.closePath();
        ctx.fillStyle = target.color || PALETTE.hudWarn;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawReticle(view) {
    const { state } = view;
    const cx = width / 2;
    const cy = height / 2;
    ctx.strokeStyle = 'rgba(232,242,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy - 26);
    ctx.lineTo(cx, cy - 14);
    ctx.stroke();

    if (state.stall > 0.15) {
      const flash = Math.sin(performance.now() / 120) > 0;
      if (flash) {
        label('STALL', cx, cy - 92, 20, PALETTE.hudBad, 'center');
      }
    }
    if (state.overspeed > 0) {
      label('OVERSPEED', cx, cy - 118, 15, PALETTE.hudBad, 'center');
    }
    if (view.pullUp) {
      label('PULL UP', cx, cy + 76, 22, PALETTE.hudBad, 'center');
    }
  }

  function drawFlight(view) {
    const { state, mission } = view;
    clear();

    drawCompass(state);
    drawTargets(view);
    drawReticle(view);

    const full = view.panel === 'full';
    if (full) {
      panel(18, height - 196, width - 36, 172, 12, 'rgba(5,9,14,0.86)');
      ctx.strokeStyle = 'rgba(150,190,230,0.16)';
      ctx.beginPath();
      ctx.moveTo(18, height - 176);
      ctx.lineTo(width - 18, height - 176);
      ctx.stroke();
      label('SIROCCO  ·  KESTREL COAST  ·  FLIGHT OPS', 40, height - 184, 9, PALETTE.hudDim);
      label('N5672K', width - 40, height - 184, 9, PALETTE.hudDim, 'right');

      const r = 58;
      const baseY = height - 94;
      drawAirpeed(126, baseY, r, state);
      drawAttitude(288, baseY, r, state);
      drawAltitude(width - 126, baseY, r, state);
      drawVerticalSpeed(width - 220, baseY - r * 0.8, r * 1.5, state);

      const cx = width / 2 + 36;
      annunciator(cx - 84, height - 148, 'GEAR', state.gearDown ? 'DOWN' : 'UP', state.gearDown ? PALETTE.hudGood : PALETTE.hudWarn);
      annunciator(cx + 10, height - 148, 'FLAPS', ['UP', '1', '2'][Math.min(2, Math.round(state.flap * 2))], state.flap > 0.05 ? PALETTE.hudGood : PALETTE.hudDim);
      annunciator(cx - 84, height - 112, 'THROTTLE', Math.round(state.throttle * 100) + '%', state.throttle > 0.92 ? PALETTE.hudWarn : PALETTE.hudGood);

      label('RPM', cx + 10, height - 118, 9, PALETTE.hudDim, 'center');
      value(String(Math.round(1200 + state.throttle * 1500)), cx + 10, height - 102, 13, PALETTE.hud, 'center');

      const fuelRatio = clamp(state.fuel / 100, 0, 1);
      label('FUEL', cx - 36, height - 62, 9, PALETTE.hudDim, 'center');
      bar(cx - 106, height - 54, 140, 8, fuelRatio, fuelRatio > 0.25 ? PALETTE.hudGood : PALETTE.hudBad);

      if (state.stall > 0.15 || state.hull < 45 || state.overspeed > 0) {
        const message = state.stall > 0.15 ? 'STALL' : state.overspeed > 0 ? 'OVERSPEED' : 'AIRFRAME DAMAGE';
        label(message, width / 2, height - 166, 12, PALETTE.hudBad, 'center');
      }
    } else {
      const r = Math.min(62, height * 0.092);
      const baseY = height - 84;
      drawAirpeed(r + 28, baseY, r, state);
      drawAltitude(width - r - 28, baseY, r, state);
      drawAttitude(width / 2, baseY, r * 0.94, state);
      drawVerticalSpeed(width - r * 2 - 82, baseY - r * 0.7, r * 1.35, state);
    }

    // Mission card, top left.
    const cardW = 236;
    panel(20, 92, cardW, 92, 10);
    label(mission.name.toUpperCase(), 34, 112, 12, PALETTE.hudWarn);
    label(view.objective, 34, 134, 13, PALETTE.hud);
    label(view.objectiveSub || '', 34, 156, 11, PALETTE.hudDim);
    const progress = clamp(view.progress || 0, 0, 1);
    ctx.beginPath();
    roundRect(34, 168, cardW - 28, 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.beginPath();
    roundRect(34, 168, (cardW - 28) * progress, 4, 2);
    ctx.fillStyle = PALETTE.hudGood;
    ctx.fill();

    // Ship's status, top right.
    const statusW = 206;
    panel(width - statusW - 20, 92, statusW, 92, 10);
    label('HULL', width - statusW, 112, 10, PALETTE.hudDim);
    bar(width - statusW + 46, 106, statusW - 66, 10, state.hull / 100, state.hull > 55 ? PALETTE.hudGood : state.hull > 25 ? PALETTE.hudWarn : PALETTE.hudBad);
    label('FUEL', width - statusW, 134, 10, PALETTE.hudDim);
    bar(width - statusW + 46, 128, statusW - 66, 10, state.fuel / 100, state.fuel > 25 ? PALETTE.hudGood : PALETTE.hudBad);
    label('SCORE', width - statusW, 156, 10, PALETTE.hudDim);
    value(String(Math.round(view.score || 0)), width - statusW + 52, 156, 15, PALETTE.hud, 'left');
    label(view.clock || '', width - 34, 156, 13, PALETTE.hudWarn, 'right');

    if (view.hint) label(view.hint, width / 2, height - (full ? 212 : 58), 11, 'rgba(180,198,216,0.85)', 'center');

    if (view.message) {
      const alpha = clamp(view.messageAlpha ?? 1, 0, 1);
      ctx.globalAlpha = alpha;
      panel(width / 2 - 190, height * 0.24, 380, 52, 10, 'rgba(8,13,20,0.78)');
      label(view.message, width / 2, height * 0.24 + 26, 16, PALETTE.hud, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function annunciator(x, y, name, state, color) {
    label(name, x, y, 8, PALETTE.hudDim, 'center');
    label(state, x, y + 14, 11, color, 'center');
  }

  function bar(x, y, w, h, ratio, color) {
    ctx.beginPath();
    roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.beginPath();
    roundRect(x, y, w * clamp(ratio, 0, 1), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawTitle(view) {
    clear();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(4,8,14,0.25)');
    gradient.addColorStop(1, 'rgba(4,8,14,0.82)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.42;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,196,92,0.9)';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('KESTREL COAST — FLIGHT OPERATIONS', cx, cy - 76);

    ctx.font = `700 ${Math.min(84, width * 0.075)}px ${FONT}`;
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText('SIROCCO', cx, cy - 18);

    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(view.subtitle || 'A light aircraft, one coastline, four jobs.', cx, cy + 16);

    const items = view.items || [];
    items.forEach((item, index) => {
      const y = cy + 74 + index * 34;
      const active = index === view.selected;
      if (active) {
        ctx.beginPath();
        roundRect(cx - 170, y - 16, 340, 30, 8);
        ctx.fillStyle = 'rgba(255,196,92,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,196,92,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.font = `${active ? 600 : 400} 15px ${FONT}`;
      ctx.fillStyle = active ? PALETTE.hud : PALETTE.hudDim;
      ctx.fillText(item, cx, y);
    });

    ctx.font = `400 11px ${MONO}`;
    ctx.fillStyle = 'rgba(143,163,187,0.75)';
    ctx.fillText('↑ ↓  SELECT      ENTER  FLY      C  CAMERA      M  MUTE', cx, height - 42);
  }

  function drawSelect(view) {
    clear();
    ctx.fillStyle = 'rgba(4,8,14,0.55)';
    ctx.fillRect(0, 0, width, height);
    label('MISSIONS', 64, 72, 12, PALETTE.hudWarn);
    ctx.font = `700 40px ${FONT}`;
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = 'left';
    ctx.fillText('Choose a job', 64, 116);

    const cardW = Math.min(360, (width - 200) / 2);
    const cardH = 132;
    view.missions.forEach((mission, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 64 + col * (cardW + 24);
      const y = 152 + row * (cardH + 18);
      const active = index === view.selected;
      panel(x, y, cardW, cardH, 12, active ? 'rgba(24,40,54,0.92)' : 'rgba(8,13,20,0.7)');
      if (active) {
        ctx.strokeStyle = PALETTE.hudWarn;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        roundRect(x, y, cardW, cardH, 12);
        ctx.stroke();
      }
      label(mission.name.toUpperCase(), x + 18, y + 26, 15, active ? PALETTE.hudWarn : PALETTE.hud);
      wrap(mission.brief, x + 18, y + 48, cardW - 36, 15, 11, PALETTE.hudDim);
      const best = view.best?.[mission.id];
      label(best ? `BEST ${best}` : 'NOT FLOWN', x + 18, y + cardH - 16, 10, best ? PALETTE.hudGood : 'rgba(143,163,187,0.6)');
    });

    label('ENTER  BRIEFING        ESC  BACK', 64, height - 34, 11, PALETTE.hudDim);
  }

  function drawBriefing(view) {
    clear();
    const w = Math.min(620, width - 120);
    const x = (width - w) / 2;
    const y = height * 0.24;
    panel(x, y, w, 300, 14, 'rgba(8,13,20,0.9)');
    label('MISSION BRIEF', x + 26, y + 32, 11, PALETTE.hudWarn);
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = 'left';
    ctx.fillText(view.mission.name, x + 26, y + 70);
    wrap(view.mission.brief, x + 26, y + 100, w - 52, 20, 14, PALETTE.hud);
    wrap(view.mission.detail, x + 26, y + 140, w - 52, 18, 12, PALETTE.hudDim);

    label('ROUTE', x + 26, y + 214, 10, PALETTE.hudDim);
    label(view.route, x + 90, y + 214, 12, PALETTE.hud);

    label('WX', x + 26, y + 240, 10, PALETTE.hudDim);
    label(view.weather, x + 90, y + 240, 12, PALETTE.hud);

    label('PRESS ENTER TO START        ESC TO GO BACK', x + 26, y + 274, 11, PALETTE.hudWarn);
  }

  function drawDebrief(view) {
    clear();
    ctx.fillStyle = 'rgba(4,8,14,0.6)';
    ctx.fillRect(0, 0, width, height);
    const w = Math.min(560, width - 120);
    const x = (width - w) / 2;
    const y = height * 0.26;
    panel(x, y, w, 264, 14, 'rgba(8,13,20,0.92)');
    label(view.success ? 'MISSION COMPLETE' : 'MISSION FAILED', x + 26, y + 32, 11, view.success ? PALETTE.hudGood : PALETTE.hudBad);
    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = 'left';
    ctx.fillText(view.mission.name, x + 26, y + 72);

    const rows = view.rows || [];
    rows.forEach((row, index) => {
      const ly = y + 108 + index * 26;
      label(row.label, x + 26, ly, 12, PALETTE.hudDim);
      value(row.value, x + w - 26, ly, 14, row.color || PALETTE.hud, 'right');
    });

    label('ENTER  FLY AGAIN        ESC  MISSIONS', x + 26, y + 236, 11, PALETTE.hudWarn);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4,8,14,0.62)';
    ctx.fillRect(0, 0, width, height);
    label('PAUSED', width / 2, height / 2 - 12, 30, PALETTE.hud, 'center');
    label('ESC TO RESUME', width / 2, height / 2 + 26, 12, PALETTE.hudDim, 'center');
  }

  function wrap(text, x, y, maxWidth, lineHeight, size, color) {
    ctx.font = `400 ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    const words = String(text).split(' ');
    let line = '';
    let cursorY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cursorY);
    return cursorY + lineHeight;
  }

  resize();

  return { canvas, ctx, resize, clear, drawFlight, drawTitle, drawSelect, drawBriefing, drawDebrief, drawPaused, project, width: () => width, height: () => height };
}
