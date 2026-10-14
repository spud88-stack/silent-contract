// Galaxy generator: concentric rings of sectors around Super Earth, planets, and supply lines.
(function () {
  const DC = window.DC;
  const TAU = Math.PI * 2;
  const RINGS = [
    { r0: 135, r1: 370, n: 6, per: [2, 3] },
    { r0: 370, r1: 630, n: 10, per: [3, 4] },
    { r0: 630, r1: 910, n: 14, per: [3, 5] },
  ];
  DC.GALAXY_R = 930;
  const EXPORTS = ['E-710 fuel', 'liberty-grade steel', 'Liber-Tea', 'freedom ammunition', 'hellpod casings', 'stim fluid', 'democracy paste', 'patriotic anthems', 'Super Uranium', 'cloning vats', 'propaganda posters', 'exosuit alloys'];

  const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const normA = (a) => ((a % TAU) + TAU) % TAU;

  DC.generateGalaxy = function (seed) {
    const R = DC.makeRng(seed);
    const usedNames = new Set(['Super Earth']);
    const nameFor = () => {
      for (let k = 0; k < 200; k++) {
        let n = R.pick(DC.PLANET_A) + R.pick(DC.PLANET_B) + R.pick(DC.PLANET_C);
        if (!usedNames.has(n)) { usedNames.add(n); return n; }
      }
      return 'Outpost ' + usedNames.size;
    };
    const sectorNames = R.shuffle(DC.SECTOR_NAMES.slice());
    const sectors = [{ id: 0, name: 'Sol', ring: 0, a0: 0, a1: TAU, r0: 0, r1: 135, planets: [0] }];
    const planets = [{
      id: 0, name: 'Super Earth', x: 0, y: 0, sector: 0, ring: 0, biome: 'ocean', hazards: [], size: 26, owner: 'human', lib: 100, hp: 4,
      regenMult: 1, res: 10, defense: 2, garrison: 1, divers: 0, links: [], campaign: null, effects: [], home: true, special: null,
      destroyed: false, priority: false, seed: R.i(1, 1e9), rot: 0.02, desc: 'The shining capital of Managed Democracy. Its fall would end everything.',
      tint: 0,
    }];
    const biomeKeys = Object.keys(DC.BIOMES);

    RINGS.forEach((ring, ri) => {
      const off = R.f() * TAU;
      const span = TAU / ring.n;
      for (let s = 0; s < ring.n; s++) {
        const sec = { id: sectors.length, name: sectorNames.pop() || 'Sector ' + sectors.length, ring: ri + 1, a0: off + s * span, a1: off + (s + 1) * span, r0: ring.r0, r1: ring.r1, planets: [] };
        sectors.push(sec);
        const count = R.i(ring.per[0], ring.per[1]);
        for (let k = 0; k < count; k++) {
          let best = null;
          for (let t = 0; t < 70; t++) {
            const rr = R.r(ring.r0 + 40, ring.r1 - 35);
            const margin = 34 / rr;
            const aa = R.r(sec.a0 + margin, sec.a1 - margin);
            const p = { x: Math.cos(aa) * rr, y: Math.sin(aa) * rr };
            const near = planets.reduce((m, q) => Math.min(m, Math.hypot(q.x - p.x, q.y - p.y)), 1e9);
            if (near > 78) { best = p; break; }
          }
          if (!best) continue;
          const biome = R.pick(biomeKeys);
          const hz = DC.BIOMES[biome].hazards;
          const hazards = R.chance(0.55) ? [R.pick(hz)] : R.chance(0.3) ? hz.slice() : [];
          const pl = {
            id: planets.length, name: nameFor(), x: best.x, y: best.y, sector: sec.id, ring: ri + 1, biome, hazards,
            size: R.r(9, 15), owner: 'human', lib: 100, hp: ri === 2 ? 1.25 : 1, regenMult: R.r(0.85, 1.2), res: R.r(0.5, 1.4),
            defense: 0, garrison: 0, divers: 0, links: [], campaign: null, effects: [], home: false, special: null, destroyed: false,
            priority: false, seed: R.i(1, 1e9), rot: R.r(0.01, 0.05) * (R.chance(0.5) ? 1 : -1),
            desc: DC.BIOMES[biome].name + ' world known for its ' + R.pick(EXPORTS) + '.', tint: R.f(),
          };
          planets.push(pl);
          sec.planets.push(pl.id);
        }
      }
    });

    // Initial front lines: each enemy holds a wedge of the outer rings.
    planets.forEach((p) => {
      if (p.id === 0) return;
      const deg = ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
      let bestF = null, bestD = 999;
      DC.ENEMIES.forEach((f) => { const d = angDiff(deg + R.r(-8, 8), DC.FACTIONS[f].angle); if (d < bestD) { bestD = d; bestF = f; } });
      const enemy = (p.ring === 3 && bestD < 52) || (p.ring === 2 && bestD < 26);
      if (enemy) { p.owner = bestF; p.lib = 0; }
    });
    DC.ENEMIES.forEach((f) => {
      let hw = null, score = -1e9;
      planets.forEach((p) => {
        if (p.owner !== f) return;
        const deg = ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
        const sc = Math.hypot(p.x, p.y) - 4 * angDiff(deg, DC.FACTIONS[f].angle);
        if (sc > score) { score = sc; hw = p; }
      });
      if (hw) {
        hw.home = true; hw.hp = 4; hw.size = 20; hw.name = DC.FACTIONS[f].home; hw.regenMult = 1.3;
        hw.desc = 'Homeworld of the ' + DC.FACTIONS[f].name + '. Liberating it will shatter their war machine.';
        hw.biome = f === 'bugs' ? 'toxic' : f === 'bots' ? 'ash' : 'crystal';
        hw.hazards = DC.BIOMES[hw.biome].hazards.slice();
      }
    });

    // Supply lines: Gabriel graph thinned at random, always keeping a spanning tree.
    const n = planets.length;
    const edges = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const A = planets[a], B = planets[b];
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, r2 = ((A.x - B.x) ** 2 + (A.y - B.y) ** 2) / 4;
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        if (c === a || c === b) continue;
        if ((planets[c].x - mx) ** 2 + (planets[c].y - my) ** 2 < r2) ok = false;
      }
      if (ok) edges.push({ a, b, d: Math.sqrt(r2) * 2 });
    }
    edges.sort((e1, e2) => e1.d - e2.d);
    const parent = planets.map((p, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const keep = [];
    edges.forEach((e) => {
      const ra = find(e.a), rb = find(e.b);
      if (ra !== rb) { parent[ra] = rb; keep.push(e); }
      else if (e.d < 280 && R.chance(0.55)) keep.push(e);
    });
    keep.forEach((e) => { planets[e.a].links.push(e.b); planets[e.b].links.push(e.a); });
    const lanes = keep.map((e) => [e.a, e.b]);

    return { seed, sectors, planets, lanes };
  };

  // Which sector contains world point (x,y)?
  DC.sectorAt = function (sectors, x, y) {
    const r = Math.hypot(x, y);
    if (r < 135) return sectors[0];
    const a = normA(Math.atan2(y, x));
    for (let i = 1; i < sectors.length; i++) {
      const s = sectors[i];
      if (r < s.r0 || r >= s.r1) continue;
      const a0 = normA(s.a0);
      const rel = normA(a - a0);
      if (rel <= s.a1 - s.a0) return s;
    }
    return null;
  };
})();
