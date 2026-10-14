// Galactic map renderer: starfield, sectors, supply lines, procedural planets, fleet, singularity and effects.
(function () {
  const DC = window.DC;
  const S = DC.Sim;
  const TAU = Math.PI * 2;
  const V = (DC.Render = { cam: { x: 0, y: 0, z: 0.5, tx: 0, ty: 0, tz: 0.5 }, hover: null, selected: null, targetFilter: null, fleetRangeShown: false, fx: [], parts: [] });
  let cv, ctx, W = 0, H = 0, dpr = 1, nebula, stars = [], patterns = {}, strips = {};
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  V.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    buildNebula();
    for (let i = 0; i < 420; i++) stars.push({ x: Math.random(), y: Math.random(), s: Math.random() < 0.08 ? 1.6 : Math.random() * 1.1 + 0.3, d: Math.random() * 0.25 + 0.03, tw: Math.random() * TAU });
    ['bugs', 'bots', 'squids'].forEach((f) => (patterns[f] = makeHatch(DC.FACTIONS[f].color)));
    patterns.human = makeHatch('#5fd4ff');
  };
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
  }
  V.size = () => ({ W, H });
  V.fit = function () {
    const z = Math.min(W, H) / (DC.GALAXY_R * 2.15);
    Object.assign(V.cam, { x: 0, y: 0, z, tx: 0, ty: 0, tz: z });
  };
  V.minZ = () => Math.min(W, H) / (DC.GALAXY_R * 3);
  V.focus = function (p, z) { V.cam.tx = p.x; V.cam.ty = p.y; V.cam.tz = Math.max(V.cam.tz, z || 1.3); };
  V.toWorld = (sx, sy) => ({ x: (sx - W / 2) / V.cam.z + V.cam.x, y: (sy - H / 2) / V.cam.z + V.cam.y });
  V.toScreen = (x, y) => ({ x: (x - V.cam.x) * V.cam.z + W / 2, y: (y - V.cam.y) * V.cam.z + H / 2 });
  V.zoomAt = function (sx, sy, factor) {
    const c = V.cam;
    const nz = DC.clamp(c.tz * factor, V.minZ(), 4);
    const wp = { x: (sx - W / 2) / c.z + c.x, y: (sy - H / 2) / c.z + c.y };
    c.tz = nz;
    c.tx = wp.x - (sx - W / 2) / nz;
    c.ty = wp.y - (sy - H / 2) / nz;
  };
  const prad = (p) => Math.max(p.size * V.cam.z, p.id === 0 ? 11 : 5.5) / V.cam.z;
  V.hitPlanet = function (G, sx, sy) {
    let best = null, bd = 1e9;
    G.planets.forEach((p) => {
      const s = V.toScreen(p.x, p.y);
      const d = Math.hypot(s.x - sx, s.y - sy);
      const lim = Math.max(prad(p) * V.cam.z + 6, 13);
      if (d < lim && d < bd) { bd = d; best = p; }
    });
    return best;
  };

  function makeHatch(color) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d');
    x.strokeStyle = color; x.lineWidth = 3; x.globalAlpha = 0.55;
    x.beginPath();
    for (let i = -16; i <= 32; i += 8) { x.moveTo(i, 16); x.lineTo(i + 16, 0); }
    x.stroke();
    return x.createPattern(c, 'repeat');
  }
  function buildNebula() {
    nebula = document.createElement('canvas'); nebula.width = nebula.height = 1024;
    const x = nebula.getContext('2d');
    x.fillStyle = '#05070d'; x.fillRect(0, 0, 1024, 1024);
    const blobs = [['#1a2a55', 0.5], ['#3a1a4f', 0.35], ['#0f3b4a', 0.4], ['#40251a', 0.25], ['#1b1640', 0.45]];
    for (let i = 0; i < 26; i++) {
      const [c, a] = blobs[i % blobs.length];
      const px = Math.random() * 1024, py = Math.random() * 1024, r = 120 + Math.random() * 320;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, hexA(c, a * 0.55)); g.addColorStop(1, hexA(c, 0));
      x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    }
    for (let i = 0; i < 1600; i++) {
      x.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.35 + ')';
      x.fillRect(Math.random() * 1024, Math.random() * 1024, 1, 1);
    }
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  V.hexA = hexA;
  V.strip = (p) => strip(p);

  // Procedural planet surface strip (3H wide so any H-wide window wraps seamlessly).
  function strip(p) {
    if (strips[p.id] && strips[p.id].biome === p.biome) return strips[p.id].c;
    const Hh = 64, c = document.createElement('canvas'); c.width = Hh * 3; c.height = Hh;
    const x = c.getContext('2d');
    const R = DC.makeRng(p.seed);
    const pal = p.id === 0 ? ['#1f5fa8', '#3aa35a', '#f4fbff'] : DC.BIOMES[p.biome].pal;
    const W2 = Hh * 2;
    x.fillStyle = pal[0]; x.fillRect(0, 0, W2, Hh);
    const blob = (bx, by, rx, ry, col, a) => {
      x.globalAlpha = a; x.fillStyle = col;
      [-W2, 0, W2].forEach((o) => { x.beginPath(); x.ellipse(bx + o, by, rx, ry, 0, 0, TAU); x.fill(); });
    };
    const b = p.id === 0 ? 'earth' : p.biome;
    if (b === 'ocean' || b === 'earth') {
      for (let i = 0; i < (b === 'earth' ? 16 : 9); i++) blob(R.r(0, W2), R.r(10, Hh - 10), R.r(5, 16), R.r(4, 10), pal[1], 0.9);
      for (let i = 0; i < 18; i++) blob(R.r(0, W2), R.r(4, Hh - 4), R.r(6, 20), R.r(1.5, 3.5), '#ffffff', 0.35);
      blob(W2 / 2, 0, W2, 5, '#f4fbff', 0.8); blob(W2 / 2, Hh, W2, 5, '#f4fbff', 0.8);
    } else {
      for (let k = 0; k < 7; k++) blob(R.r(0, W2), R.r(0, Hh), W2, R.r(2, 6), pal[R.i(1, 2)], 0.18);
      for (let i = 0; i < 55; i++) blob(R.r(0, W2), R.r(0, Hh), R.r(2, 12), R.r(2, 8), pal[R.i(0, 2)], R.r(0.25, 0.7));
      if (b === 'moon' || b === 'ash' || b === 'desert') {
        for (let i = 0; i < 26; i++) {
          const cx = R.r(0, W2), cy = R.r(4, Hh - 4), r = R.r(1, 4);
          blob(cx, cy, r, r, '#000000', 0.25); blob(cx - 0.6, cy - 0.6, r * 0.7, r * 0.7, '#ffffff', 0.08);
        }
      }
      if (b === 'volcanic') {
        x.globalAlpha = 0.9; x.strokeStyle = '#ff6a1f'; x.lineWidth = 1;
        for (let i = 0; i < 14; i++) { x.beginPath(); let px = R.r(0, W2), py = R.r(0, Hh); x.moveTo(px, py); for (let j = 0; j < 4; j++) { px += R.r(-8, 8); py += R.r(-6, 6); x.lineTo(px, py); } x.stroke(); }
      }
      if (b === 'ice' || b === 'jungle' || b === 'toxic') for (let i = 0; i < 12; i++) blob(R.r(0, W2), R.r(4, Hh - 4), R.r(6, 18), R.r(1.5, 3), b === 'toxic' ? '#d6f07a' : '#ffffff', 0.25);
      if (b === 'crystal') for (let i = 0; i < 20; i++) blob(R.r(0, W2), R.r(0, Hh), R.r(1, 3), R.r(1, 3), '#ffffff', 0.5);
    }
    x.globalAlpha = 1;
    x.drawImage(c, 0, 0, Hh, Hh, W2, 0, Hh, Hh);
    strips[p.id] = { c, biome: p.biome };
    return c;
  }

  // ---------- effects ----------
  V.addFx = function (f) { f.t0 = performance.now(); V.fx.push(f); };
  V.burst = function (x, y, color, n, speed) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (0.3 + Math.random()) * (speed || 60);
      V.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.6 + Math.random() * 0.8, color, size: 1 + Math.random() * 2 });
    }
  };

  // ---------- main draw ----------
  V.draw = function (G, now, dtReal) {
    const c = V.cam;
    const k = 1 - Math.pow(0.0008, dtReal);
    c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    // background
    const nb = Math.max(W, H) * 1.5;
    ctx.drawImage(nebula, -((c.x * 0.05) % 200) - nb * 0.15, -((c.y * 0.05) % 200) - nb * 0.15, nb, nb);
    stars.forEach((s) => {
      const sx = (((s.x * W - c.x * s.d * c.z * 0.4) % W) + W) % W;
      const sy = (((s.y * H - c.y * s.d * c.z * 0.4) % H) + H) % H;
      const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(now * 0.002 + s.tw);
      ctx.fillStyle = 'rgba(220,235,255,' + 0.75 * tw + ')';
      ctx.fillRect(sx, sy, s.s, s.s);
    });
    if (!G) return;

    ctx.setTransform(dpr * c.z, 0, 0, dpr * c.z, dpr * (W / 2 - c.x * c.z), dpr * (H / 2 - c.y * c.z));
    const px = 1 / c.z;
    drawFrame(G, now, px);
    drawSectors(G, now, px);
    drawGloom(G, now, px);
    drawLanes(G, now, px);
    drawSpecialLinks(G, now, px);
    drawAttacks(G, now, px);
    G.planets.forEach((p) => drawPlanet(G, p, now, px));
    drawSingularity(G, now, px);
    drawFleet(G, now, px);
    drawFx(now, dtReal, px);
    drawLabels(G, now, px);
  };

  function sectorPath(s, inset) {
    const g = inset / ((s.r0 + s.r1) / 2);
    ctx.beginPath();
    ctx.arc(0, 0, s.r1 - inset, s.a0 + g, s.a1 - g);
    ctx.arc(0, 0, s.r0 + inset, s.a1 - g, s.a0 + g, true);
    ctx.closePath();
  }

  function drawFrame(G, now, px) {
    ctx.lineWidth = px;
    ctx.strokeStyle = 'rgba(140,180,220,0.10)';
    [135, 370, 630, 910].forEach((r) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); });
    // rotating instrument ring
    const rot = reduced ? 0 : now * 0.00002;
    ctx.strokeStyle = 'rgba(200,220,255,0.18)';
    ctx.lineWidth = 2 * px;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, 975, rot + i * TAU / 4, rot + i * TAU / 4 + 0.9); ctx.stroke(); }
    ctx.lineWidth = px;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU - rot * 2, l = i % 10 === 0 ? 18 : 7;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 990, Math.sin(a) * 990); ctx.lineTo(Math.cos(a) * (990 + l), Math.sin(a) * (990 + l)); ctx.stroke();
    }
  }

  function sectorOwner(G, s) {
    const cnt = { human: 0, bugs: 0, bots: 0, squids: 0 };
    let n = 0;
    s.planets.forEach((id) => { const p = G.planets[id]; if (!p.destroyed) { cnt[p.owner]++; n++; } });
    let best = 'human', bv = 0;
    DC.ENEMIES.forEach((f) => { if (cnt[f] > bv) { bv = cnt[f]; best = f; } });
    return { owner: bv ? best : 'human', share: n ? bv / n : 0, cnt, n };
  }
  V.sectorOwner = sectorOwner;

  function drawSectors(G, now, px) {
    const off = reduced ? 0 : (now * 0.01) % 16;
    G.sectors.forEach((s) => {
      if (s.id === 0) return;
      const o = sectorOwner(G, s);
      sectorPath(s, 3);
      if (o.share > 0) {
        const col = DC.FACTIONS[o.owner].color;
        ctx.fillStyle = hexA(col, 0.05 + 0.13 * o.share);
        ctx.fill();
        const pat = patterns[o.owner];
        if (pat.setTransform) pat.setTransform(new DOMMatrix().translateSelf(off, 0));
        ctx.globalAlpha = 0.22 + 0.4 * o.share;
        ctx.fillStyle = pat; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = hexA(col, 0.25 + 0.45 * o.share);
        ctx.lineWidth = 1.5 * px;
      } else {
        ctx.fillStyle = 'rgba(30,60,90,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,170,220,0.16)';
        ctx.lineWidth = px;
      }
      ctx.stroke();
      if (V.hoverSector === s.id) { ctx.strokeStyle = 'rgba(255,225,77,0.55)'; ctx.lineWidth = 2 * px; ctx.stroke(); }
    });
  }

  function drawGloom(G, now) {
    G.gloom.forEach((sid) => {
      const s = G.sectors[sid];
      const R = DC.makeRng(sid * 977);
      for (let i = 0; i < 7; i++) {
        const a = R.r(s.a0, s.a1), r = R.r(s.r0, s.r1);
        const drift = reduced ? 0 : Math.sin(now * 0.0004 + i) * 18;
        const x = Math.cos(a) * r + drift, y = Math.sin(a) * r - drift * 0.5;
        const rad = R.r(90, 170);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(214,160,52,0.30)'); g.addColorStop(1, 'rgba(214,160,52,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
    });
  }

  function drawLanes(G, now, px) {
    G.lanes.forEach(([a, b]) => {
      const A = G.planets[a], B = G.planets[b];
      const oa = A.owner, ob = B.owner;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      if (oa === 'human' && ob === 'human') {
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(95,212,255,0.28)'; ctx.lineWidth = 1.3 * px;
      } else if (oa === 'human' || ob === 'human') {
        const f = oa === 'human' ? ob : oa;
        ctx.setLineDash([6 * px, 5 * px]); ctx.lineDashOffset = reduced ? 0 : -now * 0.02 * px;
        ctx.strokeStyle = hexA(DC.FACTIONS[f].color, 0.75); ctx.lineWidth = 1.6 * px;
      } else {
        ctx.setLineDash([]); ctx.strokeStyle = hexA(DC.FACTIONS[oa] ? DC.FACTIONS[oa].color : '#888888', 0.22); ctx.lineWidth = px;
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function drawSpecialLinks(G, now, px) {
    const sg = G.singularity;
    if (!sg) return;
    G.planets.forEach((p) => {
      if (p.special !== 'darkEnergy' || p.owner !== 'squids') return;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(sg.x, sg.y);
      ctx.setLineDash([3 * px, 7 * px]); ctx.lineDashOffset = reduced ? 0 : now * 0.04 * px;
      ctx.strokeStyle = 'rgba(190,100,255,0.55)'; ctx.lineWidth = 2 * px; ctx.stroke();
    });
    if (sg.victim != null) {
      const v = G.planets[sg.victim];
      ctx.beginPath(); ctx.moveTo(sg.x, sg.y); ctx.lineTo(v.x, v.y);
      ctx.setLineDash([10 * px, 6 * px]); ctx.strokeStyle = 'rgba(255,80,200,0.7)'; ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawAttacks(G, now, px) {
    G.planets.forEach((p) => {
      const c = p.campaign;
      if (!c || c.from == null) return;
      const A = G.planets[c.from];
      if (!A) return;
      const dx = p.x - A.x, dy = p.y - A.y, L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      const col = DC.FACTIONS[c.faction].color;
      const n = Math.floor(L / 26);
      for (let i = 1; i < n; i++) {
        const tt = ((i / n) + (reduced ? 0 : now * 0.00035)) % 1;
        const x = A.x + dx * tt, y = A.y + dy * tt;
        const s = 6 * px;
        ctx.globalAlpha = Math.sin(tt * Math.PI) * 0.9;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + ux * s, y + uy * s);
        ctx.lineTo(x - ux * s - uy * s, y - uy * s + ux * s);
        ctx.lineTo(x - ux * s * 0.4, y - uy * s * 0.4);
        ctx.lineTo(x - ux * s + uy * s, y - uy * s - ux * s);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  function drawPlanet(G, p, now, px) {
    const r = prad(p);
    const z = V.cam.z;
    if (p.destroyed) {
      const R = DC.makeRng(p.seed);
      ctx.fillStyle = 'rgba(160,150,170,0.6)';
      for (let i = 0; i < 18; i++) {
        const a = R.r(0, TAU) + (reduced ? 0 : now * 0.0001), d = R.r(r * 0.4, r * 1.6);
        ctx.fillRect(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, R.r(1, 2.5) * px, R.r(1, 2.5) * px);
      }
      ctx.strokeStyle = 'rgba(200,120,255,0.25)'; ctx.lineWidth = px;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.2, 0, TAU); ctx.stroke();
      return;
    }
    const ownCol = p.owner === 'human' ? '#5fd4ff' : DC.FACTIONS[p.owner].color;
    // glow for Super Earth / homeworlds
    if (p.home) {
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, r * 2.6);
      g.addColorStop(0, hexA(ownCol, 0.35)); g.addColorStop(1, hexA(ownCol, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, TAU); ctx.fill();
    }
    // targeting highlight
    if (V.targetFilter && V.targetFilter(p)) {
      ctx.strokeStyle = 'rgba(255,225,77,' + (0.5 + 0.4 * Math.sin(now * 0.008)) + ')';
      ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(p.x, p.y, r + 9 * px, 0, TAU); ctx.stroke();
    }
    // body
    const rs = r * z;
    if (rs < 6) {
      ctx.fillStyle = (p.id === 0 ? '#2a78c8' : DC.BIOMES[p.biome].pal[0]);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    } else {
      const st = strip(p);
      const Hh = st.height;
      const off = (((now * 0.001 * p.rot * 60) % (Hh * 2)) + Hh * 2) % (Hh * 2);
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.clip();
      ctx.drawImage(st, reduced ? 0 : off, 0, Hh, Hh, p.x - r, p.y - r, r * 2, r * 2);
      ctx.restore();
    }
    const sh = ctx.createRadialGradient(p.x - r * 0.4, p.y - r * 0.45, r * 0.1, p.x, p.y, r * 1.05);
    sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.55, 'rgba(0,0,10,0.05)'); sh.addColorStop(1, 'rgba(0,0,12,0.78)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(p.id === 0 ? '#8fd8ff' : DC.BIOMES[p.biome].pal[1], 0.45); ctx.lineWidth = 1.2 * px;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 0.6 * px, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();

    // ownership cradle (HD2-style arcs under the world)
    ctx.strokeStyle = hexA(ownCol, 0.9); ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 * px, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    ctx.lineWidth = 1 * px; ctx.strokeStyle = hexA(ownCol, 0.5);
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 7 * px, Math.PI * 0.28, Math.PI * 0.72); ctx.stroke();

    if (p.id === 0) {
      const n = 10, rot = reduced ? 0 : now * 0.0003;
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        ctx.fillStyle = 'rgba(200,240,255,0.85)';
        ctx.fillRect(p.x + Math.cos(a) * (r + 12 * px) - px, p.y + Math.sin(a) * (r + 12 * px) * 0.45 - px, 2.4 * px, 2.4 * px);
      }
    }
    // special markers
    if (p.special === 'darkEnergy' && p.owner === 'squids') pulseRing(p.x, p.y, r + 12 * px, '#c070ff', now, px, 2);
    if (p.special === 'forge' && p.owner === 'bots') hexRing(p.x, p.y, r + 11 * px, '#ff5a3a', now, px);
    if (p.special === 'hive' && p.owner === 'bugs') pulseRing(p.x, p.y, r + 12 * px, '#f2b632', now, px, 2);
    if (p.special === 'evac') pulseRing(p.x, p.y, r + 12 * px, '#5fd4ff', now, px, 1.5);

    // defense campaign ring + timer
    if (p.campaign) {
      const col = DC.FACTIONS[p.campaign.faction].color;
      const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(now * 0.006);
      ctx.strokeStyle = hexA(col, 0.4 + 0.5 * pulse); ctx.lineWidth = 2.5 * px;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 14 * px + pulse * 4 * px, 0, TAU); ctx.stroke();
      ctx.strokeStyle = hexA(col, 0.95); ctx.lineWidth = 3 * px;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 10 * px, -Math.PI / 2, -Math.PI / 2 + TAU * DC.clamp((p.campaign.ends - G.t) / (p.campaign.ends - p.campaign.start), 0, 1)); ctx.stroke();
    }
    // Major Order target
    const mo = G.mo;
    const isMO = mo && (((mo.type === 'liberate' || mo.type === 'defend') && mo.target === p.id) || (mo.type === 'sector' && mo.sector === p.sector && p.owner !== 'human'));
    if (isMO) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(reduced ? 0 : now * 0.0008);
      ctx.setLineDash([5 * px, 4 * px]); ctx.strokeStyle = 'rgba(255,225,77,0.95)'; ctx.lineWidth = 1.6 * px;
      ctx.beginPath(); ctx.arc(0, 0, r + 19 * px, 0, TAU); ctx.stroke(); ctx.restore(); ctx.setLineDash([]);
      const by = p.y - r - 26 * px + (reduced ? 0 : Math.sin(now * 0.005) * 3 * px);
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.moveTo(p.x - 7 * px, by - 6 * px); ctx.lineTo(p.x + 7 * px, by - 6 * px); ctx.lineTo(p.x, by + 3 * px); ctx.closePath(); ctx.fill();
    }
    if (p.priority) {
      ctx.fillStyle = '#ffe14d';
      const fx = p.x + r + 6 * px, fy = p.y - r - 6 * px;
      ctx.fillRect(fx, fy - 10 * px, 1.4 * px, 13 * px);
      ctx.beginPath(); ctx.moveTo(fx + 1.4 * px, fy - 10 * px); ctx.lineTo(fx + 9 * px, fy - 7 * px); ctx.lineTo(fx + 1.4 * px, fy - 4 * px); ctx.fill();
    }
    // garrison / defense pips
    if (p.owner === 'human' && (p.garrison || p.defense) && V.cam.z > 0.55) {
      for (let i = 0; i < p.defense; i++) { ctx.fillStyle = '#a7e9ff'; ctx.fillRect(p.x - r - 8 * px, p.y - r + i * 5 * px, 4 * px, 3 * px); }
      for (let i = 0; i < p.garrison; i++) { ctx.fillStyle = '#ffe14d'; ctx.fillRect(p.x - r - 13 * px, p.y - r + i * 5 * px, 4 * px, 3 * px); }
    }
    // hover / selection brackets
    if (V.selected === p.id || V.hover === p.id) {
      const b = r + 15 * px, l = 6 * px;
      ctx.strokeStyle = V.selected === p.id ? '#ffe14d' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6 * px;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(p.x + sx * b, p.y + sy * (b - l)); ctx.lineTo(p.x + sx * b, p.y + sy * b); ctx.lineTo(p.x + sx * (b - l), p.y + sy * b); ctx.stroke();
      });
    }
  }
  function pulseRing(x, y, r, col, now, px, w) {
    const t = reduced ? 0.5 : (now * 0.0012) % 1;
    ctx.strokeStyle = hexA(col, 0.8 * (1 - t)); ctx.lineWidth = w * px;
    ctx.beginPath(); ctx.arc(x, y, r + t * 14 * px, 0, TAU); ctx.stroke();
    ctx.strokeStyle = hexA(col, 0.7); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  function hexRing(x, y, r, col, now, px) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(reduced ? 0 : now * 0.0006);
    ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 2 * px;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    ctx.stroke(); ctx.restore();
  }

  function drawSingularity(G, now, px) {
    const sg = G.singularity;
    if (!sg) return;
    const t = reduced ? 0 : now * 0.001;
    const g = ctx.createRadialGradient(sg.x, sg.y, 10, sg.x, sg.y, 90);
    g.addColorStop(0, 'rgba(150,60,255,0.55)'); g.addColorStop(0.4, 'rgba(110,30,200,0.18)'); g.addColorStop(1, 'rgba(80,0,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sg.x, sg.y, 90, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(sg.x, sg.y); ctx.rotate(t * (0.8 + i * 0.25) + i);
      ctx.scale(1, 0.42);
      ctx.strokeStyle = 'rgba(' + (200 + i * 10) + ',' + (120 + i * 20) + ',255,' + (0.7 - i * 0.1) + ')';
      ctx.lineWidth = (3 - i * 0.4) * px * 2;
      ctx.beginPath(); ctx.arc(0, 0, 26 + i * 7, 0, Math.PI * (1.1 + i * 0.1)); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sg.x, sg.y, 17, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,255,0.9)'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(sg.x, sg.y, 18, 0, TAU); ctx.stroke();
  }

  function drawFleet(G, now, px) {
    const f = G.fleet;
    if (V.fleetRangeShown) {
      ctx.setLineDash([8 * px, 6 * px]); ctx.strokeStyle = 'rgba(95,212,255,0.55)'; ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.arc(f.x, f.y, S.fleetRange(), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(95,212,255,0.04)'; ctx.fill();
    }
    if (f.moving) {
      ctx.setLineDash([4 * px, 5 * px]); ctx.strokeStyle = 'rgba(95,212,255,0.6)'; ctx.lineWidth = 1.2 * px;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); ctx.setLineDash([]);
    }
    const ang = f.moving ? Math.atan2(f.ty - f.y, f.tx - f.x) : -Math.PI / 2 + Math.sin(now * 0.0005) * 0.15;
    const sc = Math.max(1, 0.9 / V.cam.z);
    [[0, 0], [-9, -8], [-9, 8]].forEach(([ox, oy], i) => {
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(ang); ctx.translate(ox * sc, oy * sc + (reduced ? 0 : Math.sin(now * 0.003 + i) * 0.8 * sc));
      ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(95,212,255,' + (0.5 + 0.3 * Math.sin(now * 0.02 + i)) + ')';
      ctx.beginPath(); ctx.arc(-7, 0, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#dfe9f2'; ctx.strokeStyle = '#2b3a4a'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -3); ctx.lineTo(-5, 0); ctx.lineTo(-6, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    if (V.cam.z > 0.4) {
      ctx.font = 600 * 1 + ' ' + 10 * px + 'px "Saira Condensed", sans-serif';
      ctx.fillStyle = 'rgba(160,230,255,0.85)'; ctx.textAlign = 'center';
      ctx.fillText('SUPER DESTROYER FLEET', f.x, f.y + 20 * px * Math.max(1, sc * V.cam.z));
    }
  }

  function drawFx(now, dtReal, px) {
    V.fx = V.fx.filter((f) => {
      const t = Math.max(0, (now - f.t0) / (f.dur || 1200));
      if (t >= 1) return false;
      const e = 1 - Math.pow(1 - t, 3);
      if (f.type === 'ring') {
        ctx.strokeStyle = hexA(f.color, (1 - t) * 0.9); ctx.lineWidth = (f.w || 3) * px * (1 - t * 0.5);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * e, 0, TAU); ctx.stroke();
      } else if (f.type === 'flash') {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, hexA(f.color, (1 - t) * 0.9)); g.addColorStop(1, hexA(f.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      } else if (f.type === 'beam') {
        ctx.strokeStyle = hexA(f.color, (1 - t)); ctx.lineWidth = (f.w || 4) * px * (1 - t);
        ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x, f.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (1 - t) + ')'; ctx.lineWidth = 1.2 * px;
        ctx.stroke();
      } else if (f.type === 'implode') {
        ctx.strokeStyle = hexA(f.color, t * 0.9); ctx.lineWidth = 3 * px;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r1 * (1 - e) + 2, 0, TAU); ctx.stroke();
      }
      return true;
    });
    const dt = Math.min(0.05, dtReal);
    V.parts = V.parts.filter((q) => {
      q.life -= dt * q.decay; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.97; q.vy *= 0.97;
      if (q.life <= 0) return false;
      ctx.fillStyle = hexA(q.color, q.life);
      ctx.fillRect(q.x, q.y, q.size * px, q.size * px);
      return true;
    });
  }

  function curvedText(text, r, angDeg, color, px) {
    const a0 = (angDeg * Math.PI) / 180;
    const fs = 30;
    ctx.font = '700 ' + fs + 'px "Saira Condensed", sans-serif';
    const widths = [...text].map((ch) => ctx.measureText(ch).width + 6);
    const total = widths.reduce((x, y) => x + y, 0);
    const flip = Math.sin(a0) > 0.2; // bottom half: write along the inside so it reads upright
    let a = flip ? a0 + total / 2 / r : a0 - total / 2 / r;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [...text].forEach((ch, i) => {
      const w = widths[i];
      a += (flip ? -1 : 1) * (w / 2) / r;
      ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
      ctx.fillText(ch, 0, 0); ctx.restore();
      a += (flip ? -1 : 1) * (w / 2) / r;
    });
  }

  function drawLabels(G, now, px) {
    const z = V.cam.z;
    // faction region titles
    DC.ENEMIES.forEach((f) => {
      if (S.count(f) === 0) return;
      curvedText(DC.FACTIONS[f].short, 952, DC.FACTIONS[f].angle, hexA(DC.FACTIONS[f].color, 0.55), px);
    });
    ctx.textBaseline = 'alphabetic';
    // sector names
    if (z < 1.6) {
      ctx.font = '600 ' + 11 * px + 'px "Saira Condensed", sans-serif';
      ctx.textAlign = 'center';
      G.sectors.forEach((s) => {
        if (s.id === 0) return;
        const a = (s.a0 + s.a1) / 2, r = s.r1 - 16;
        ctx.fillStyle = 'rgba(190,210,235,' + (z < 0.3 ? 0.0 : 0.38) + ')';
        ctx.fillText(s.name.toUpperCase(), Math.cos(a) * r, Math.sin(a) * r);
      });
    }
    // planet labels and campaign bars
    G.planets.forEach((p) => {
      if (p.destroyed) return;
      const camp = S.isCampaign(p);
      const show = z >= 0.85 || (camp && z >= 0.38) || p.home || V.selected === p.id || V.hover === p.id;
      if (!show) return;
      const r = prad(p);
      let y = p.y + r + 14 * px;
      ctx.font = (p.home ? '700 ' : '600 ') + (p.home ? 13 : 11) * px + 'px "Saira Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillText(p.name.toUpperCase(), p.x + px, y + px);
      ctx.fillStyle = p.owner === 'human' ? '#e9f4ff' : hexA(DC.FACTIONS[p.owner].color, 1);
      ctx.fillText(p.name.toUpperCase(), p.x, y);
      if (camp) {
        const bw = 46 * px, bh = 4 * px;
        y += 5 * px;
        const isDef = p.campaign && p.campaign.type === 'defense';
        const f = isDef ? p.campaign.faction : p.owner;
        const v = isDef ? p.campaign.progress / 100 : p.lib / 100;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - bw / 2 - px, y - px, bw + 2 * px, bh + 2 * px);
        ctx.fillStyle = DC.FACTIONS[f].color; ctx.fillRect(p.x - bw / 2, y, bw, bh);
        ctx.fillStyle = '#5fd4ff'; ctx.fillRect(p.x - bw / 2, y, bw * v, bh);
        if (isDef) {
          ctx.font = '700 ' + 10 * px + 'px "Saira Condensed", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(DC.fmtDur(p.campaign.ends - G.t), p.x, y + bh + 11 * px);
        }
        if (z > 0.55 && p.divers > 50) {
          ctx.font = '600 ' + 9 * px + 'px "Saira Condensed", sans-serif';
          ctx.fillStyle = '#ffe14d';
          ctx.fillText('▲ ' + DC.fmtShort(p.divers), p.x, p.y - r - 9 * px);
        }
      }
    });
  }

  // ---------- react to war events ----------
  DC.on('liberated', ({ planet: p }) => { V.addFx({ type: 'ring', x: p.x, y: p.y, r0: 6, r1: 80, color: '#5fd4ff', dur: 1400 }); V.addFx({ type: 'flash', x: p.x, y: p.y, r: 60, color: '#5fd4ff', dur: 900 }); V.burst(p.x, p.y, '#9fe6ff', 40, 70); });
  DC.on('fell', ({ planet: p, faction }) => { V.addFx({ type: 'implode', x: p.x, y: p.y, r1: 70, color: DC.FACTIONS[faction].color, dur: 1300 }); V.burst(p.x, p.y, DC.FACTIONS[faction].color, 30, 50); });
  DC.on('defended', ({ planet: p }) => V.addFx({ type: 'ring', x: p.x, y: p.y, r0: 10, r1: 50, color: '#a7e9ff', dur: 1000, w: 4 }));
  DC.on('attack', ({ planet: p, faction }) => V.addFx({ type: 'ring', x: p.x, y: p.y, r0: 60, r1: 8, color: DC.FACTIONS[faction].color, dur: 1000 }));
  DC.on('destroyed', ({ planet: p }) => { V.addFx({ type: 'flash', x: p.x, y: p.y, r: 110, color: '#c070ff', dur: 1800 }); V.burst(p.x, p.y, '#d9a0ff', 70, 90); });
  DC.on('action', ({ action: a, planet: p }) => {
    if (!p) return;
    if (a.id === 'bombard') {
      for (let i = 0; i < 5; i++) setTimeout(() => { const ox = (Math.random() - 0.5) * 30, oy = (Math.random() - 0.5) * 30; V.addFx({ type: 'beam', x0: p.x + ox * 0.3, y0: p.y - 260, x: p.x + ox, y: p.y + oy, color: '#ffd27a', dur: 500, w: 5 }); V.addFx({ type: 'flash', x: p.x + ox, y: p.y + oy, r: 30, color: '#ffb347', dur: 600 }); }, i * 120);
    } else if (a.id === 'hellbomb') {
      V.addFx({ type: 'flash', x: p.x, y: p.y, r: 160, color: '#ffffff', dur: 1600 });
      V.addFx({ type: 'ring', x: p.x, y: p.y, r0: 5, r1: 160, color: '#ffd27a', dur: 1800, w: 5 });
      V.burst(p.x, p.y, '#ffe9b0', 80, 120);
    } else if (a.id === 'seaf' || a.id === 'fortify') {
      V.addFx({ type: 'ring', x: p.x, y: p.y, r0: 40, r1: 14, color: a.id === 'seaf' ? '#ffe14d' : '#a7e9ff', dur: 800 });
    } else if (a.id === 'priority') {
      V.addFx({ type: 'ring', x: p.x, y: p.y, r0: 8, r1: 34, color: '#ffe14d', dur: 700 });
    }
  });
  DC.on('fx', (f) => {
    const G = S.get();
    if (f.type === 'cannon') {
      const A = G.planets[f.from], B = G.planets[f.to];
      V.addFx({ type: 'beam', x0: A.x, y0: A.y, x: B.x, y: B.y, color: '#ff4a4a', dur: 1600, w: 8 });
      V.addFx({ type: 'flash', x: B.x, y: B.y, r: 90, color: '#ff6a3a', dur: 1400 });
      V.burst(B.x, B.y, '#ff8a5a', 50, 90);
    } else if (f.type === 'collapse') {
      V.addFx({ type: 'flash', x: f.x, y: f.y, r: 200, color: '#ffffff', dur: 2000 });
      V.addFx({ type: 'ring', x: f.x, y: f.y, r0: 5, r1: 220, color: '#d9a0ff', dur: 2200, w: 6 });
    } else if (f.type === 'consume') {
      V.addFx({ type: 'implode', x: f.x, y: f.y, r1: 140, color: '#c070ff', dur: 1800 });
    }
  });
})();
