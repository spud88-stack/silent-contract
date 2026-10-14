// Renderer: low-res buffer scaled up, y-sorted sprites, lights, fog of war, vision cones, instinct.
(function () {
  const SC = window.SC, S = SC.Sprites, TS = 16;
  const { clamp, dist } = SC;
  const R = (SC.Render = { scale: 3, VW: 480, VH: 270, ox: 0, oy: 0 });
  let cv, cx, buf, bx, light, lx, fog, fx;

  R.init = function (canvas) {
    cv = canvas; cx = cv.getContext('2d');
    [buf, bx] = S.mk(480, 270); [light, lx] = S.mk(480, 270); [fog, fx] = S.mk(480, 270);
    window.addEventListener('resize', R.resize);
    R.resize();
  };
  R.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    R.scale = Math.max(2, Math.floor(Math.min(w / 400, h / 230)));
    R.VW = Math.ceil(w / R.scale); R.VH = Math.ceil(h / R.scale);
    cv.width = w; cv.height = h;
    for (const c of [buf, light, fog]) { c.width = R.VW; c.height = R.VH; }
    cx.imageSmoothingEnabled = false; bx.imageSmoothingEnabled = false;
  };
  R.toScreen = (x, y) => ({ x: (x - R.ox) * R.scale, y: (y - R.oy) * R.scale });

  // ---------------------------------------------------------------- raycasts
  function castPoly(G, x, y, a0, a1, rays, range, extend, skip) {
    const pts = [];
    for (let k = 0; k <= rays; k++) {
      const a = a0 + (a1 - a0) * (k / rays), c = Math.cos(a), s = Math.sin(a);
      let d = skip || 0;
      for (; d < range; d += 4) if (SC.Game.opaqueAt(Math.floor((x + c * d) / TS), Math.floor((y + s * d) / TS))) break;
      if (d < range) d += extend;
      pts.push(x + c * d, y + s * d);
    }
    return pts;
  }
  function poly(ctx, pts, ox, oy, cx0, cy0) {
    ctx.beginPath();
    if (cx0 != null) ctx.moveTo(cx0 - ox, cy0 - oy);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i] - ox, pts[i + 1] - oy);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- drawing helpers
  function drawChar(ctx, sheet, x, y, dir, frame, opts) {
    const row = SC.dirOf(dir);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (opts && opts.squash) ctx.scale(1, opts.squash);
    if (opts && opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(sheet, frame * S.FW, row * S.FH, S.FW, S.FH, -10, -23, S.FW, S.FH);
    ctx.restore();
  }
  function shadow(ctx, x, y, w) { ctx.fillStyle = 'rgba(8,6,20,0.35)'; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w || 5, 2, 0, 0, 6.29); ctx.fill(); }
  // tiny props in hand that sell what someone is doing
  function heldProp(ctx, n, x, y, t) {
    const d = SC.dirOf(n.dir), hx = Math.round(x + (d === 1 ? -5 : d === 2 ? 5 : d === 0 ? 4 : -4)), hy = Math.round(y - 11);
    if (d === 3) return;
    if (n.act === 'smoke') { ctx.fillStyle = '#e8e0d0'; ctx.fillRect(hx, hy, 2, 1); ctx.fillStyle = Math.sin(t * 5 + n.id) > 0 ? '#ff7a3a' : '#feae34'; ctx.fillRect(hx + (d === 1 ? -1 : 2), hy, 1, 1); }
    else if (n.act === 'drink' || (n.act === 'mingle' && n.id % 3 === 0)) { const up = Math.sin(t * 0.9 + n.id) > 0.85 ? 3 : 0; ctx.fillStyle = '#181425'; ctx.fillRect(hx - 1, hy - 1 - up, 4, 5); ctx.fillStyle = '#d8f1ff'; ctx.fillRect(hx, hy - up, 2, 3); ctx.fillStyle = '#f6c453'; ctx.fillRect(hx, hy + 1 - up, 2, 2); }
    else if (n.act === 'read') { ctx.fillStyle = '#181425'; ctx.fillRect(hx - 2, hy - 1, 6, 5); ctx.fillStyle = n.id % 2 ? '#a22633' : '#124e89'; ctx.fillRect(hx - 1, hy, 4, 3); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(hx + 1, hy, 1, 3); }
    else if (n.act === 'eat') { ctx.fillStyle = '#181425'; ctx.fillRect(hx - 2, hy, 6, 3); ctx.fillStyle = '#e8eef5'; ctx.fillRect(hx - 1, hy + 1, 4, 1); ctx.fillStyle = '#f77622'; ctx.fillRect(hx, hy, 2, 1); }
    else if (n.act === 'work' || n.act === 'fix') { if (Math.sin(t * 14 + n.id) > 0) { ctx.fillStyle = '#e8b796'; ctx.fillRect(hx, hy + 1, 1, 1); } }
    else if (n.act === 'cook' && Math.random() < 0.04) SC.G.puff(x + ox0 + (d === 1 ? -8 : 8), y + oy0 - 18, 'steam');
  }
  let ox0 = 0, oy0 = 0;
  function frameOf(e, t) {
    if (e.moving) return 1 + (Math.floor(e.anim * (e.speedNow > 60 || e.running ? 12 : 8)) % 4);
    return Math.floor((t + (e.id || 0) * 0.37) * 1.4) % 2 === 0 ? 0 : 5;
  }

  function drawProp(ctx, p, ox, oy, t, G) {
    const spr = S.prop(p.type, p.v % 2, { color: p.color });
    if (!spr) return;
    const w = spr.width, h = spr.height;
    const x = Math.round(p.x * TS + (p.fw * TS - w) / 2 - ox), y = Math.round((p.y + p.fh) * TS - h + 1 - oy);
    if (p.fallen) {
      ctx.save(); ctx.translate(x + w / 2, y + h - 2); ctx.rotate(p.x % 2 ? 1.45 : -1.45); ctx.drawImage(spr, -w / 2, -h + 2); ctx.restore();
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(x + 2, y + h - 3, 1, 1); ctx.fillRect(x + w - 4, y + h - 1, 1, 1); ctx.fillRect(x + 6, y + h, 1, 1);
      return;
    }
    let jx = 0;
    if (p.hide && G.P.hidden === p && Math.sin(t * 9) > 0.9) jx = 1;
    ctx.drawImage(spr, x + jx, y);
    if (p.drink) {
      const g = S.prop('drink');
      const gx = x + (w - g.width) / 2, gy = y + 1;
      ctx.drawImage(g, Math.round(gx), gy);
      if (p.poison) { ctx.fillStyle = p.poison === 'lethal' ? 'rgba(155,77,202,0.85)' : 'rgba(99,199,77,0.85)'; ctx.fillRect(Math.round(gx) + 8, gy + 4, 2, 3); }
      if (p.marked && Math.sin(t * 4) > 0) { ctx.fillStyle = '#e43b44'; ctx.fillRect(Math.round(gx) + 8, gy - 4, 2, 2); }
    }
    if (p.type === 'lamp' && p.marked && !p.rigged && Math.sin(t * 4) > 0) { ctx.fillStyle = '#e43b44'; ctx.fillRect(x + w / 2 - 1, y - 4, 2, 2); }
    if (p.rigged && G.instinct && Math.sin(t * 8) > 0) { ctx.fillStyle = '#ff4fa3'; ctx.fillRect(x + w / 2 - 1, y - 3, 3, 2); }
    if (p.food && p.poison) { ctx.fillStyle = p.poison === 'lethal' ? 'rgba(155,77,202,0.9)' : 'rgba(99,199,77,0.9)'; ctx.fillRect(x + 8, y + 6, 2, 2); }
    if (p.use === 'fuse' && p.broken && Math.random() < 0.08) G.particles.push({ x: x + ox + 9, y: y + oy + 6, vx: (Math.random() - 0.5) * 60, vy: -30, g: 200, life: 0.3, t: 0, c: '#fee761', s: 1 });
    if (p.bodies && p.bodies.length && G.instinct) { ctx.fillStyle = '#e43b44'; ctx.fillRect(x + w / 2 - 1, y - 4, 3, 3); }
  }
  function drawDoor(ctx, d, ox, oy) {
    const x = d.x * TS - ox, y = d.y * TS - oy, o = d.open;
    const wood = '#7d4a2b', dark = '#4a2c1c', lite = '#a0623a';
    if (d.h) {
      const w = Math.round(16 * (1 - o));
      if (w > 0) {
        ctx.fillStyle = dark; ctx.fillRect(x, y + 2, w, 12);
        ctx.fillStyle = d.outer ? '#5a4a3a' : wood; ctx.fillRect(x + 1, y + 3, Math.max(0, w - 2), 10);
        ctx.fillStyle = lite; ctx.fillRect(x + 1, y + 3, Math.max(0, w - 2), 1);
        if (w > 10) { ctx.fillStyle = '#e8b923'; ctx.fillRect(x + w - 4, y + 8, 1, 2); }
      }
      ctx.fillStyle = '#181425'; ctx.fillRect(x, y + 1, 1, 13); ctx.fillRect(x + 15, y + 1, 1, 13);
    } else {
      const h = Math.round(20 * (1 - o)) + 2;
      ctx.fillStyle = dark; ctx.fillRect(x + 6, y + 14 - h, 4, h + 1);
      ctx.fillStyle = wood; ctx.fillRect(x + 7, y + 15 - h, 2, h - 1);
    }
    if (d.locked) { ctx.fillStyle = '#e43b44'; ctx.fillRect(x + 7, y - 1, 2, 2); }
    else if (d.tier >= 2) { ctx.fillStyle = '#63c74d'; ctx.fillRect(x + 7, y - 1, 2, 1); }
  }
  function drawIcon(ctx, x, y, kind, frac) {
    x = Math.round(x); y = Math.round(y);
    if (kind === 'q' || kind === '!') {
      const col = kind === '!' ? '#e43b44' : '#feae34';
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 3, y - 7, 7, 9);
      ctx.fillStyle = 'rgba(80,60,40,0.9)'; ctx.fillRect(x - 2, y - 6, 5, 7);
      const h = Math.round(7 * (frac == null ? 1 : frac));
      ctx.fillStyle = col; ctx.fillRect(x - 2, y + 1 - h, 5, h);
      ctx.fillStyle = '#181425';
      if (kind === '!') { ctx.fillRect(x, y - 5, 1, 3); ctx.fillRect(x, y - 1, 1, 1); }
      else { ctx.fillRect(x - 1, y - 5, 3, 1); ctx.fillRect(x + 1, y - 4, 1, 1); ctx.fillRect(x, y - 3, 1, 1); ctx.fillRect(x, y - 1, 1, 1); }
    } else if (kind === 'target') {
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 3, y - 5, 7, 4); ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillRect(x - 1, y + 1, 3, 1);
      ctx.fillStyle = '#e43b44'; ctx.fillRect(x - 2, y - 4, 5, 2); ctx.fillRect(x - 1, y - 2, 3, 2); ctx.fillRect(x, y, 1, 1);
    } else if (kind === 'suspect') {
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 3, y - 5, 7, 4); ctx.fillRect(x - 2, y - 1, 5, 2);
      ctx.fillStyle = '#feae34'; ctx.fillRect(x - 2, y - 4, 5, 2); ctx.fillRect(x - 1, y - 2, 3, 2);
    } else if (kind === 'dot') {
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2);
    } else if (kind === 'talk') {
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 4, y - 4, 9, 6); ctx.fillStyle = '#e8eef5'; ctx.fillRect(x - 3, y - 3, 7, 4);
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 2, y - 2, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x + 2, y - 2, 1, 1);
    } else if (kind === 'mark') {
      ctx.fillStyle = '#181425'; ctx.fillRect(x - 2, y - 3, 5, 5); ctx.fillStyle = '#2ce8f5'; ctx.fillRect(x - 1, y - 2, 3, 3);
    }
  }

  // ---------------------------------------------------------------- main frame
  R.frame = function (G, realDt) {
    const VW = R.VW, VH = R.VH, P = G.P, m = G.map, t = G.time, In = SC.Input;
    const instinct = (G.instinct = !P.ghost && (In.down(' ') || In.down('v')) && !G.dialog);
    // camera
    let tx, ty;
    if (P.ghost) { tx = m.w * TS / 2 + Math.sin(t * 0.05) * m.w * 5; ty = m.h * TS / 2 + Math.sin(t * 0.083) * m.h * 4.5; }
    else {
      const mwx = R.ox + In.mouse.x / R.scale, mwy = R.oy + In.mouse.y / R.scale;
      tx = P.x + clamp((mwx - P.x) * 0.22, -70, 70); ty = P.y - 8 + clamp((mwy - P.y) * 0.22, -50, 50);
    }
    G.cam.x += (tx - G.cam.x) * Math.min(1, realDt * (P.ghost ? 1 : 6)); G.cam.y += (ty - G.cam.y) * Math.min(1, realDt * (P.ghost ? 1 : 6));
    let ox = Math.round(clamp(G.cam.x - VW / 2, -40, m.w * TS - VW + 40)), oy = Math.round(clamp(G.cam.y - VH / 2, -40, m.h * TS - VH + 40));
    if (G.shake > 0) { ox += Math.round((Math.random() - 0.5) * 4); oy += Math.round((Math.random() - 0.5) * 4); }
    R.ox = ox; R.oy = oy; ox0 = ox; oy0 = oy;
    In.mouse.wx = ox + In.mouse.x / R.scale; In.mouse.wy = oy + In.mouse.y / R.scale;

    const ctx = bx;
    ctx.fillStyle = '#0b0a12'; ctx.fillRect(0, 0, VW, VH);
    ctx.drawImage(m.layer, -ox, -oy);

    // animated floors
    const x0 = Math.max(0, Math.floor(ox / TS)), y0 = Math.max(0, Math.floor(oy / TS)), x1 = Math.min(m.w - 1, Math.floor((ox + VW) / TS)), y1 = Math.min(m.h - 1, Math.floor((oy + VH) / TS));
    const wf = Math.floor(t * 2) % 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const st = m.style[y * m.w + x];
      if (st === 'water') ctx.drawImage(m.waterFrames[(wf * 2 + ((x * 7 + y * 3) & 1)) % 4], x * TS - ox, y * TS - oy);
      else if (st === 'dance') {
        const ph = Math.sin(t * 3 + x * 0.9 + y * 1.3) + Math.sin(t * 2.1 - x * 0.5);
        const cols = ['255,79,163', '44,232,245', '254,231,97', '170,110,255'];
        ctx.fillStyle = 'rgba(' + cols[(x + y + Math.floor(t * 2)) & 3] + ',' + (0.12 + Math.max(0, ph) * 0.18).toFixed(2) + ')';
        ctx.fillRect(x * TS - ox + 2, y * TS - oy + 2, 12, 12);
      }
    }
    // decals
    for (const d of G.decals) {
      ctx.fillStyle = 'rgba(110,18,30,0.85)';
      ctx.beginPath(); ctx.ellipse(d.x - ox, d.y - oy, d.r, d.r * 0.55, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = 'rgba(162,38,51,0.7)';
      ctx.beginPath(); ctx.ellipse(d.x - ox - 1, d.y - oy - 1, d.r * 0.6, d.r * 0.3, 0, 0, 6.29); ctx.fill();
    }
    // exits
    for (const e of m.exits) {
      const ex = e.x * TS - ox, ey = e.y * TS - oy;
      ctx.drawImage(S.prop('exitpad'), ex - 1, ey - 1);
      if (G.objectiveDone && Math.sin(t * 5) > 0) { ctx.strokeStyle = '#63c74d'; ctx.strokeRect(ex - 2.5, ey - 2.5, 21, 21); }
    }
    // noise ripples
    if (G.ripples) for (const r of G.ripples) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * (1 - r.t / 0.6)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(r.x - ox, r.y - oy, r.r * (r.t / 0.6), 0, 6.29); ctx.stroke(); }

    // visibility of NPCs to the player
    const pvx = P.x, pvy = P.y - 6;
    for (const n of G.npcs) n.visible = P.ghost || (Math.abs(n.x - P.x) < VW && Math.abs(n.y - P.y) < VH && G.los(pvx, pvy, n.x, n.y - 6));

    // vision cones
    for (const n of G.npcs) {
      if (!n.visible || n.state === 'dead' || n.state === 'ko' || n.state === 'gone' || P.ghost) continue;
      const hostile = n.state === 'hunt' || n.hostileKinds.has(P.outfit.kind);
      const enf = n.enforcer && n.kind === P.outfit.kind;
      if (!(instinct || n.armed || n.sus > 1 || enf || hostile || n.lookout)) continue;
      if (Math.abs(n.x - ox - VW / 2) > VW / 2 + 160 || Math.abs(n.y - oy - VH / 2) > VH / 2 + 160) continue;
      const range = n.viewRange * (G.blackout > 0 ? 0.5 : 1) * (P.sneak ? 0.85 : 1);
      const pts = castPoly(G, n.x, n.y - 4, n.dir - n.fov / 2, n.dir + n.fov / 2, 14, range, 0);
      const col = hostile ? '228,59,68' : n.sus > 1 ? '254,174,52' : enf ? '255,255,255' : '200,215,255';
      const g = ctx.createRadialGradient(n.x - ox, n.y - 4 - oy, 4, n.x - ox, n.y - 4 - oy, range);
      const a = hostile ? 0.2 : n.sus > 1 ? 0.12 + n.sus / 600 : 0.07;
      g.addColorStop(0, 'rgba(' + col + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; poly(ctx, pts, ox, oy, n.x, n.y - 4); ctx.fill();
    }

    // security camera cones
    for (const c of G.cams) {
      if (c.off || P.ghost || (!instinct && c.sus <= 0 && !G.los(pvx, pvy, c.x, c.y + 6))) continue;
      if (Math.abs(c.x - ox - VW / 2) > VW / 2 + 140 || Math.abs(c.y - oy - VH / 2) > VH / 2 + 140) continue;
      const pts = castPoly(G, c.x, c.y + 4, c.a - 0.5, c.a + 0.5, 10, 120, 0, 14);
      const g = ctx.createRadialGradient(c.x - ox, c.y - oy, 2, c.x - ox, c.y - oy, 120);
      const col = c.sus > 0 ? '228,59,68' : '255,120,140';
      g.addColorStop(0, 'rgba(' + col + ',' + (0.12 + c.sus / 500).toFixed(2) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; poly(ctx, pts, ox, oy, c.x, c.y + 4); ctx.fill();
    }

    // y-sorted scene
    const list = [];
    for (const p of m.props) {
      const py = (p.y + p.fh) * TS;
      if (p.x * TS - ox > VW + 32 || (p.x + p.fw) * TS - ox < -32 || py - oy < -8 || py - 48 - oy > VH) continue;
      list.push({ y: py - (p.solid ? 1 : 12), p });
    }
    for (const d of m.doors) list.push({ y: d.y * TS + (d.h ? 14 : 15), d });
    for (const n of G.npcs) {
      if (n.state === 'gone' || n.hiddenIn) continue;
      if (Math.abs(n.x - ox - VW / 2) > VW / 2 + 24 || Math.abs(n.y - oy - VH / 2) > VH / 2 + 30) continue;
      list.push({ y: n.body ? n.y - 6 : n.y, n });
    }
    if (!P.ghost && !P.hidden) list.push({ y: P.y, player: true });
    for (const it of G.items) list.push({ y: it.y - 4, it });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.p) drawProp(ctx, e.p, ox, oy, t, G);
      else if (e.d) drawDoor(ctx, e.d, ox, oy);
      else if (e.it) {
        const it = e.it, ix = Math.round(it.x - ox - 6), iy = Math.round(it.y - oy - 9 - (it.drop > 0 ? it.drop * 20 : 0));
        if (it.id === 'disguise') { const o = it.outfit || m.theme.outfits[it.kind] || {}; ctx.drawImage(S.prop('clothes', 0, { color: (o.look && o.look.shirt) || '#c0cbdc' }), ix - 3, iy - 1); }
        else ctx.drawImage(S.icon(it.id), ix, iy);
        if (Math.sin(t * 3 + it.x) > 0.93) { ctx.fillStyle = '#ffffff'; ctx.fillRect(ix + 9, iy + 1, 1, 3); ctx.fillRect(ix + 8, iy + 2, 3, 1); }
      } else if (e.n) {
        const n = e.n;
        if (!n.visible && !instinct) continue;
        if (n.body) {
          if (!n.visible) continue;
          const k = n.downAt != null ? clamp((t - n.downAt) / 0.35, 0, 1) : 1, e2 = 1 - (1 - k) * (1 - k);
          if (k < 1) shadow(ctx, n.x - ox, n.y - oy);
          ctx.save(); ctx.translate(Math.round(n.x - ox), Math.round(n.y - oy - 1)); ctx.rotate((n.downDir || 1) * (Math.PI / 2) * e2);
          ctx.drawImage(n.sheet, 0, 0, S.FW, S.FH, -10, -22, S.FW, S.FH); ctx.restore();
          if (n.state === 'ko' && Math.random() < realDt * 0.8) G.particles.push({ x: n.x, y: n.y - 10, vx: 6, vy: -10, life: 1.4, t: 0, c: '#c0cbdc', s: 2, z: true });
          continue;
        }
        if (!n.visible) continue;
        const seated = !n.moving && n.state === 'routine' && n.act === 'sit' && !n.path && n.spot && n.spot.prop;
        const bob = !n.moving && n.state === 'routine' && n.act === 'dance' ? Math.round(Math.abs(Math.sin(t * 6 + n.id)) * 2) : 0;
        if (!seated) shadow(ctx, n.x - ox, n.y - oy);
        drawChar(ctx, n.sheet, n.x - ox, n.y - oy - (seated ? 3 : 0) - bob, seated ? Math.PI / 2 : n.dir, seated ? 0 : frameOf(n, t), n.state === 'cower' ? { squash: 0.86 } : seated ? { squash: 0.9 } : null);
        if (!n.moving && n.state === 'routine' && !n.path) heldProp(ctx, n, n.x - ox, n.y - oy, t);
        if (n.held) { ctx.fillStyle = 'rgba(228,59,68,0.5)'; ctx.fillRect(Math.round(n.x - ox - 6), Math.round(n.y - oy - 24), 12, 1); }
      } else if (e.player) {
        shadow(ctx, P.x - ox, P.y - oy, 6);
        drawChar(ctx, P.sheet, P.x - ox, P.y - oy, P.dir, frameOf(P, t), P.sneak ? { squash: 0.88 } : null);
        const it = P.inv[P.hand];
        if (it && it.id !== 'fists') {
          const a = P.dir + (G.swing > 0 ? Math.sin((G.swing / 0.18) * Math.PI) * 1.4 : 0);
          ctx.save(); ctx.translate(Math.round(P.x - ox + Math.cos(a) * 7), Math.round(P.y - oy - 9 + Math.sin(a) * 4)); ctx.rotate(a + Math.PI / 4);
          ctx.drawImage(S.icon(it.id), -4, -4, 8, 8); ctx.restore();
        }
      }
    }

    // cameras sit on the wall above everything
    for (const c of G.cams) {
      const cx2 = Math.round(c.x - ox), cy2 = Math.round(c.y - oy);
      if (cx2 < -8 || cy2 < -8 || cx2 > VW + 8 || cy2 > VH + 8) continue;
      ctx.fillStyle = '#181425'; ctx.fillRect(cx2 - 3, cy2 - 4, 7, 5);
      ctx.fillStyle = '#8b9bb4'; ctx.fillRect(cx2 - 2, cy2 - 3, 5, 3);
      const lx2 = Math.round(cx2 + Math.cos(c.a) * 3), ly2 = Math.round(cy2 - 2 + Math.sin(c.a) * 2);
      ctx.fillStyle = '#262b44'; ctx.fillRect(lx2 - 1, ly2, 2, 2);
      ctx.fillStyle = c.off ? '#3a4466' : c.sees ? '#ff2a3a' : Math.sin(t * 3) > 0 ? '#e43b44' : '#5a1a22'; ctx.fillRect(cx2 + 2, cy2 - 4, 1, 1);
    }

    // particles + tracers
    for (const p of G.particles) {
      const k = 1 - p.t / p.life;
      if (p.z) { ctx.fillStyle = 'rgba(220,230,255,' + k.toFixed(2) + ')'; ctx.font = '6px monospace'; ctx.fillText('z', Math.round(p.x - ox), Math.round(p.y - oy)); continue; }
      if (p.note) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), 1, 3); ctx.fillRect(Math.round(p.x - ox) - 1, Math.round(p.y - oy) + 2, 2, 2); continue; }
      const s = p.grow ? p.s + (1 - k) * 4 : p.s;
      ctx.globalAlpha = p.flash ? 1 : Math.min(1, k * 1.4);
      ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x - ox - s / 2), Math.round(p.y - oy - s / 2), Math.ceil(s), Math.ceil(s));
      ctx.globalAlpha = 1;
    }
    for (const p of G.projectiles) {
      if (p.tracer) { ctx.strokeStyle = 'rgba(255,240,180,' + (1 - p.t / 0.09).toFixed(2) + ')'; ctx.beginPath(); ctx.moveTo(p.x0 - ox, p.y0 - oy); ctx.lineTo(p.x1 - ox, p.y1 - oy); ctx.stroke(); }
      else { shadow(ctx, p.x - ox, p.y + 8 - oy, 2); ctx.save(); ctx.translate(Math.round(p.x - ox), Math.round(p.y - oy)); ctx.rotate(p.travelled * 0.2); ctx.drawImage(S.icon(p.item), -4, -4, 8, 8); ctx.restore(); }
    }

    // ---- lighting
    const amb = m.theme.ambient, bo = G.blackout > 0;
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, VW, VH);
    lx.fillStyle = 'rgba(' + amb[0] + ',' + amb[1] + ',' + amb[2] + ',' + Math.min(0.86, amb[3] + (bo ? 0.3 : 0) + (G.weather === 'rain' ? 0.07 : 0)) + ')';
    lx.fillRect(0, 0, VW, VH);
    lx.globalCompositeOperation = 'destination-out';
    const lights = [];
    for (const L of m.lights) {
      if ((bo && L.room >= 0) || L.dead) continue;
      if (L.x - ox < -L.r || L.x - ox > VW + L.r || L.y - oy < -L.r || L.y - oy > VH + L.r) continue;
      lights.push(L);
      const fl = L.pulse ? 0.7 + 0.3 * Math.sin(t * L.pulse * 2) : 1;
      const g = lx.createRadialGradient(L.x - ox, L.y - oy, 2, L.x - ox, L.y - oy, L.r * fl);
      g.addColorStop(0, 'rgba(0,0,0,' + (0.95 * L.a).toFixed(2) + ')'); g.addColorStop(0.6, 'rgba(0,0,0,' + (0.5 * L.a).toFixed(2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g; lx.fillRect(L.x - ox - L.r, L.y - oy - L.r, L.r * 2, L.r * 2);
    }
    if (bo) for (const n of G.npcs) {
      if (!n.armed || !n.visible || n.body || n.state === 'gone') continue;
      const pts = castPoly(G, n.x, n.y - 4, n.dir - 0.35, n.dir + 0.35, 6, 90, 0);
      lx.fillStyle = 'rgba(0,0,0,0.75)'; poly(lx, pts, ox, oy, n.x, n.y - 4); lx.fill();
    }
    if (!P.ghost) { const g = lx.createRadialGradient(P.x - ox, P.y - 8 - oy, 1, P.x - ox, P.y - 8 - oy, 34); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = g; lx.fillRect(P.x - ox - 34, P.y - 8 - oy - 34, 68, 68); }
    ctx.drawImage(light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const g = ctx.createRadialGradient(L.x - ox, L.y - oy, 1, L.x - ox, L.y - oy, L.r * 0.7);
      g.addColorStop(0, 'rgba(' + L.c + ',' + (L.lamp ? 0.16 : 0.09) + ')'); g.addColorStop(1, 'rgba(' + L.c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(L.x - ox - L.r, L.y - oy - L.r, L.r * 2, L.r * 2);
    }
    if (G.lightFlash > 0) { ctx.fillStyle = 'rgba(255,230,170,0.08)'; ctx.fillRect(0, 0, VW, VH); }
    ctx.globalCompositeOperation = 'source-over';

    // ---- weather
    if (G.weather === 'rain') {
      G.rain = G.rain || [];
      while (G.rain.length < 140) G.rain.push({ x: Math.random() * VW, y: Math.random() * VH, v: 260 + Math.random() * 120, l: 4 + Math.random() * 4 });
      ctx.strokeStyle = 'rgba(170,190,230,0.35)'; ctx.beginPath();
      for (const r of G.rain) {
        r.y += r.v * realDt; r.x -= r.v * 0.18 * realDt;
        const wx = Math.floor((r.x + ox) / TS), wy = Math.floor((r.y + oy) / TS);
        const indoor = wx >= 0 && wy >= 0 && wx < m.w && wy < m.h && (m.roomAt[wy * m.w + wx] >= 0 || m.tiles[wy * m.w + wx] === SC.T.WALL);
        if (r.y > VH || Math.random() < realDt * 1.2) { if (!indoor && r.y < VH && Math.random() < 0.5) G.particles.push({ x: r.x + ox, y: r.y + oy, vx: 0, vy: 0, life: 0.18, t: 0, c: 'rgba(190,210,250,0.6)', s: 2, splash: true }); r.y = -10; r.x = Math.random() * (VW + 60); continue; }
        if (indoor) continue;
        ctx.moveTo(Math.round(r.x), Math.round(r.y)); ctx.lineTo(Math.round(r.x + r.l * 0.18), Math.round(r.y - r.l));
      }
      ctx.stroke();
    }

    // ---- fog of war
    if (!P.ghost) {
      fx.globalCompositeOperation = 'source-over';
      fx.clearRect(0, 0, VW, VH);
      fx.fillStyle = instinct ? 'rgba(10,6,22,0.7)' : 'rgba(6,5,16,0.62)';
      fx.fillRect(0, 0, VW, VH);
      fx.globalCompositeOperation = 'destination-out';
      const pts = castPoly(G, pvx, pvy, 0, Math.PI * 2, 200, Math.max(VW, VH), 12);
      fx.fillStyle = '#000'; poly(fx, pts, ox, oy); fx.fill();
      ctx.drawImage(fog, 0, 0);
    }

    // ---- instinct: silhouettes through walls
    if (instinct) {
      ctx.fillStyle = 'rgba(30,20,60,0.18)'; ctx.fillRect(0, 0, VW, VH);
      for (const n of G.npcs) {
        if (n.state === 'gone' || n.hiddenIn || dist(n.x, n.y, P.x, P.y) > 360) continue;
        const col = n.isTarget && !n.suspect ? '#e43b44' : n.suspect ? '#feae34' : n.hostileKinds.has(P.outfit.kind) ? '#ff7a3a' : n.enforcer && n.kind === P.outfit.kind ? '#ffffff' : n.lookout ? '#ff4fa3' : n.armed ? '#7fb2ff' : '#9a8fb8';
        const sx = Math.round(n.x - ox), sy = Math.round(n.y - oy);
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = col;
        if (n.body) ctx.fillRect(sx - 8, sy - 7, 16, 5); else { ctx.fillRect(sx - 3, sy - 21, 7, 7); ctx.fillRect(sx - 4, sy - 14, 9, 7); ctx.fillRect(sx - 3, sy - 7, 7, 6); }
        ctx.restore();
      }
      for (const it of G.items) { ctx.strokeStyle = '#2ce8f5'; ctx.strokeRect(Math.round(it.x - ox) - 6.5, Math.round(it.y - oy) - 9.5, 12, 12); }
      for (const p of m.props) if (p.hide || p.container || p.use || p.drink) { ctx.fillStyle = p.use === 'safe' ? '#e8b923' : p.drink ? '#b55088' : p.use ? '#fee761' : '#2ce8f5'; ctx.fillRect(Math.round((p.x + p.fw / 2) * TS - ox) - 1, Math.round(p.y * TS - oy) - 2, 2, 2); }
    }

    // ---- overhead icons
    if (!P.ghost) for (const n of G.npcs) {
      if (n.state === 'gone' || n.body || (!n.visible && !instinct)) continue;
      const ix = n.x - ox, iy = n.y - oy - 28;
      if (ix < -10 || iy < -10 || ix > VW + 10 || iy > VH + 10) continue;
      if (n.state === 'hunt' || n.state === 'flee' || (n.state === 'report' && n.reportKind === 'crime')) drawIcon(ctx, ix, iy, '!');
      else if (n.state === 'challenge' || n.state === 'escort') drawIcon(ctx, ix, iy, '!', 0.6);
      else if (n.sus > 1 && n.visible) drawIcon(ctx, ix, iy, 'q', n.sus / 100);
      else if (n.isTarget && !n.suspect) drawIcon(ctx, ix, iy - 1, 'target');
      else if (n.suspect && instinct) drawIcon(ctx, ix, iy - 1, 'suspect');
      else if (n.state === 'talk' || n.state === 'chat') { if (Math.floor(t * 2) % 2 === 0) drawIcon(ctx, ix, iy, 'talk'); }
      else if (G.marks.has(n)) drawIcon(ctx, ix, iy, 'mark');
      if (n.enforcer && n.kind === P.outfit.kind && n.visible && !n.hostileKinds.has(P.outfit.kind)) drawIcon(ctx, ix + 7, iy + 4, 'dot');
    }
    // action progress ring
    if (P.action) {
      const f = P.action.t / P.action.dur;
      ctx.strokeStyle = 'rgba(24,20,37,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.x - ox, P.y - oy - 30, 5, 0, 6.29); ctx.stroke();
      ctx.strokeStyle = '#fee761'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x - ox, P.y - oy - 30, 5, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke(); ctx.lineWidth = 1;
    }
    // hover inspect
    G.hover = null;
    if (!P.ghost) {
      for (const n of G.npcs) {
        if (n.state === 'gone' || !n.visible || n.hiddenIn) continue;
        if (Math.abs(In.mouse.wx - n.x) < 7 && In.mouse.wy > n.y - 22 && In.mouse.wy < n.y + 2) { G.hover = n; break; }
      }
      if (G.hover && !G.hover.body) { const n = G.hover; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(Math.round(n.x - ox), Math.round(n.y - oy), 7, 3, 0, 0, 6.29); ctx.stroke(); }
      // crosshair
      const mx = Math.round(In.mouse.x / R.scale), my = Math.round(In.mouse.y / R.scale);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(mx - 3, my, 2, 1); ctx.fillRect(mx + 2, my, 2, 1); ctx.fillRect(mx, my - 3, 1, 2); ctx.fillRect(mx, my + 2, 1, 2);
      // damage vignette
      if (P.hp < 60 || P.hurtT < 0.3) { const a = Math.max(P.hurtT < 0.3 ? 0.35 : 0, (60 - P.hp) / 120); const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VW * 0.7); g.addColorStop(0, 'rgba(162,38,51,0)'); g.addColorStop(1, 'rgba(162,38,51,' + a.toFixed(2) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
    }

    cx.imageSmoothingEnabled = false;
    cx.drawImage(buf, 0, 0, VW * R.scale, VH * R.scale);
  };
})();
