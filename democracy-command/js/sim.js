// War simulation: Helldiver allocation, liberation and defense campaigns, enemy offensives, resources, stats.
(function () {
  const DC = window.DC;
  const R = DC.R;

  // Tiny event bus shared by every module.
  const subs = {};
  DC.on = (ev, fn) => (subs[ev] = subs[ev] || []).push(fn);
  DC.emit = (ev, data) => (subs[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(ev, e); } });

  const S = (DC.Sim = {});
  let G = null;
  S.get = () => G;

  S.newGame = function (opts) {
    const seed = opts.seed || ((Math.random() * 1e9) | 0);
    const gal = DC.generateGalaxy(seed);
    const diff = DC.DIFFICULTY[opts.difficulty] || DC.DIFFICULTY.standard;
    G = {
      version: 1, seed, commander: opts.commander || 'Commander', difficulty: opts.difficulty || 'standard', t: 0,
      sectors: gal.sectors, planets: gal.planets, lanes: gal.lanes,
      res: { req: diff.req, morale: diff.morale, samples: [10, 0, 0], medals: 0 },
      divers: 62000,
      stats: { kills: 0, kia: 0, bullets: 0, killsBy: { bugs: 0, bots: 0, squids: 0 }, liberated: 0, lost: 0, defended: 0, defenseFailed: 0,
        moDone: 0, moFailed: 0, strikes: 0, peakDivers: 0, events: 0, worldsDestroyed: 0, researchDone: 0 },
      history: [], fleet: { x: 0, y: -60, tx: 0, ty: -60, moving: false },
      mo: null, moCooldownUntil: 0, cd: {}, research: { done: [], current: null }, mods: [],
      factions: {}, gloom: [], singularity: null, darkEnergy: 0, forge: null,
      dispatches: [], chronicle: [], heroes: [], arcs: [], over: null, director: null, nextHistory: 0,
    };
    DC.ENEMIES.forEach((f) => {
      const F = DC.FACTIONS[f];
      G.factions[f] = { budget: R.r(0, 0.6), shattered: false, eliminated: false, leader: { title: R.pick(F.leaderTitles), name: R.pick(F.leaderNames) } };
    });
    S.computeFronts();
    S.snapshot();
    return G;
  };
  S.load = function (data) { G = data; S.computeFronts(); return G; };

  // ---------- queries ----------
  S.alive = () => G.planets.filter((p) => !p.destroyed);
  S.count = (owner) => G.planets.reduce((n, p) => n + (!p.destroyed && p.owner === owner ? 1 : 0), 0);
  S.has = (id) => G.research.done.includes(id);
  S.fleetRange = () => (S.has('logistics') ? 420 : 300);
  S.inFleetRange = (p) => Math.hypot(p.x - G.fleet.x, p.y - G.fleet.y) <= S.fleetRange();
  S.isCampaign = (p) => !p.destroyed && (p.front || (p.campaign && p.campaign.type === 'defense'));
  S.campaigns = () => G.planets.filter(S.isCampaign);

  S.modMult = function (kind, ctx) {
    let m = 1;
    for (const md of G.mods) {
      if (md.kind !== kind) continue;
      if (md.faction && ctx && ctx.faction && md.faction !== ctx.faction) continue;
      if (md.faction && (!ctx || !ctx.faction)) continue;
      if (md.planet != null && (!ctx || ctx.planet !== md.planet)) continue;
      if (md.sector != null && (!ctx || ctx.sector !== md.sector)) continue;
      m *= md.v;
    }
    return m;
  };
  S.addMod = function (m) {
    m.until = G.t + (m.h || 24);
    m.id = DC.uid('m');
    G.mods.push(m);
    return m;
  };

  S.computeFronts = function () {
    G.planets.forEach((p) => {
      p.front = !p.destroyed && p.owner !== 'human' && p.owner !== 'none' && p.links.some((l) => G.planets[l].owner === 'human' && !G.planets[l].destroyed);
      if (!S.isCampaign(p)) p.priority = false;
    });
  };

  S.efficiency = function (p, faction) {
    let e = 1;
    if (S.has('eagle')) e *= 1.1;
    if (faction === 'bugs' && S.has('napalm')) e *= 1.2;
    if (faction === 'bots' && S.has('exo')) e *= 1.2;
    if (faction === 'squids' && S.has('emp')) e *= 1.2;
    e *= 0.8 + (0.4 * G.res.morale) / 100;
    if (S.inFleetRange(p)) e *= S.has('dss') ? 1.5 : 1.25;
    e *= 1 - 0.06 * p.hazards.length;
    e *= S.modMult('eff', { faction, planet: p.id, sector: p.sector });
    return e;
  };
  S.regen = function (p) {
    const F = DC.FACTIONS[p.owner];
    if (!F) return 0;
    const diff = DC.DIFFICULTY[G.difficulty];
    let r = F.regen * diff.regen * p.regenMult;
    r *= S.modMult('regen', { faction: p.owner, planet: p.id, sector: p.sector });
    if (G.factions[p.owner].shattered) r *= 0.35;
    if (p.owner === 'bugs' && G.gloom.includes(p.sector)) r *= S.has('napalm') ? 1.3 : 1.6;
    return r;
  };
  S.libRate = function (p) {
    return (p.divers / 1000) * 0.42 * S.efficiency(p, p.owner) / p.hp - S.regen(p);
  };
  S.defRate = function (p) {
    const c = p.campaign;
    const gain = (p.divers / 1000) * 0.42 * 1.25 * S.efficiency(p, c.faction) + p.garrison * 1.25 * (S.has('seaf') ? 1.5 : 1);
    const loss = c.strength * (1 - 0.18 * p.defense) * (S.has('shield') && p.defense > 0 ? 0.85 : 1);
    return gain - loss;
  };
  S.attackWeight = function (p) {
    let w = 1;
    if (p.campaign) w *= 1.45 + (p.ring <= 1 ? 0.6 : 0) + (p.id === 0 ? 2 : 0);
    else w *= 0.5 + (1.5 * p.lib) / 100 + (p.home ? 0.4 : 0);
    if (p.priority) w *= 2.3;
    if (G.mo) {
      const mo = G.mo;
      if ((mo.type === 'liberate' || mo.type === 'defend') && mo.target === p.id) w *= 3;
      if (mo.type === 'sector' && mo.sector === p.sector) w *= 2.2;
      if (mo.type === 'hold' && p.campaign && p.campaign.faction === mo.faction) w *= 2;
    }
    if (S.inFleetRange(p)) w *= 1.25;
    w *= 1 - 0.07 * p.hazards.length;
    w *= p.noise || 1;
    // Squared so Helldivers cluster on popular fronts instead of spreading evenly.
    return Math.max(0.01, w * w);
  };

  // ---------- simulation step (dt in game hours) ----------
  S.step = function (dt) {
    if (!G || G.over) return;
    G.t += dt;
    const diff = DC.DIFFICULTY[G.difficulty];
    G.mods = G.mods.filter((m) => m.until > G.t);
    S.computeFronts();

    // Helldiver population follows morale, the daily cycle, research and recruitment drives.
    let target = 64000 * (0.65 + (0.7 * G.res.morale) / 100) * (1 + 0.16 * Math.sin(((G.t - 8) / 24) * Math.PI * 2));
    if (S.has('recruit')) target *= 1.15;
    target *= S.modMult('divers');
    G.divers += (target - G.divers) * Math.min(1, dt * 0.25);
    G.stats.peakDivers = Math.max(G.stats.peakDivers, G.divers);

    // Distribute divers across campaigns.
    const camps = S.campaigns();
    let wsum = 0;
    camps.forEach((p) => {
      if (R.f() < dt * 0.08) p.noise = R.r(0.7, 1.35);
      p._w = S.attackWeight(p);
      wsum += p._w;
    });
    G.planets.forEach((p) => {
      const tgt = S.isCampaign(p) && wsum > 0 ? (G.divers * p._w) / wsum : 0;
      p.divers += (tgt - p.divers) * Math.min(1, dt * 0.4);
      if (p.divers < 1 && tgt === 0) p.divers = 0;
    });

    // Campaign progress, combat stats and samples.
    const stimsMult = S.has('stims') ? 0.7 : 1;
    G.planets.forEach((p) => {
      if (p.destroyed) return;
      if (p.owner !== 'human' && DC.FACTIONS[p.owner]) {
        if (p.front) {
          p.lib = DC.clamp(p.lib + S.libRate(p) * dt, 0, 100);
          combat(p, p.owner, dt, stimsMult, diff);
          if (p.lib >= 100) S.liberate(p);
        } else {
          p.lib = Math.max(0, p.lib - S.regen(p) * dt * 2);
        }
      } else if (p.campaign && p.campaign.type === 'defense') {
        const c = p.campaign;
        c.progress = DC.clamp(c.progress + S.defRate(p) * dt, 0, 100);
        combat(p, c.faction, dt, stimsMult * 1.2, diff);
        if (c.progress >= 100) S.defended(p);
        else if (G.t >= c.ends) S.fall(p, c.faction);
      }
    });

    // Economy.
    const income = 2 + G.planets.reduce((n, p) => n + (p.owner === 'human' && !p.destroyed ? p.res : 0), 0) * 0.3;
    G.res.req += income * dt * S.modMult('income');
    // Morale drifts toward a baseline set by how much of the galaxy is free.
    const share = S.count('human') / Math.max(1, S.alive().length);
    const mBase = 26 + 44 * share + (S.has('ministry') ? 8 : 0);
    G.res.morale = DC.clamp(G.res.morale + (mBase - G.res.morale) * 0.02 * dt, 0, 100);

    // Research.
    if (G.research.current && G.t >= G.research.current.ends) S.finishResearch();

    // Fleet travel.
    const F = G.fleet;
    if (F.moving) {
      const sp = (S.has('logistics') ? 110 : 55) * dt;
      const d = Math.hypot(F.tx - F.x, F.ty - F.y);
      if (d <= sp) { F.x = F.tx; F.y = F.ty; F.moving = false; DC.emit('fleetArrived', F); }
      else { F.x += ((F.tx - F.x) / d) * sp; F.y += ((F.ty - F.y) / d) * sp; }
    }

    // Enemy high commands.
    const dir = G.director || { aggro: 1, extraAttacks: 0 };
    DC.ENEMIES.forEach((f) => {
      const st = G.factions[f];
      if (st.eliminated) return;
      if (S.count(f) === 0) { st.eliminated = true; DC.emit('eliminated', f); return; }
      if (st.shattered) return;
      const ramp = 1 + Math.min(1.2, G.t / 600);
      st.budget = Math.min(3, st.budget + dt * 0.042 * DC.FACTIONS[f].aggression * diff.aggro * dir.aggro * S.modMult('aggro', { faction: f }) * ramp);
      const active = G.planets.filter((p) => p.campaign && p.campaign.faction === f).length;
      const maxA = Math.min(4, 1 + Math.floor(G.t / 150) + (dir.extraAttacks || 0));
      if (st.budget >= 1 && active < maxA) {
        if (S.launchAttack(f)) st.budget -= 1;
      }
    });

    S.checkMO();
    S.checkEnd();
    if (G.t >= G.nextHistory) S.snapshot();
  };

  function combat(p, faction, dt, kiaMult, diff) {
    if (p.divers < 1) return;
    const e = S.efficiency(p, faction);
    const kills = p.divers * dt * R.r(9, 14) * e;
    const kia = p.divers * dt * 0.0045 * kiaMult * (0.7 + 0.3 * diff.aggro) * (p.home ? 1.5 : 1);
    G.stats.kills += kills;
    G.stats.killsBy[faction] += kills;
    G.stats.kia += kia;
    G.stats.bullets += kills * R.r(30, 60);
    const s = (p.divers / 10000) * dt;
    G.res.samples[0] += s * 0.3;
    G.res.samples[1] += s * 0.09;
    G.res.samples[2] += s * (p.ring >= 3 ? 0.035 : 0.012);
  }

  S.snapshot = function () {
    G.history.push({ t: G.t, human: S.count('human'), bugs: S.count('bugs'), bots: S.count('bots'), squids: S.count('squids'), morale: G.res.morale, divers: G.divers });
    if (G.history.length > 600) G.history = G.history.filter((h, i) => i % 2 === 0);
    G.nextHistory = G.t + 4;
  };

  // ---------- outcomes ----------
  S.liberate = function (p) {
    const was = p.owner;
    p.owner = 'human'; p.lib = 100; p.campaign = null; p.priority = false;
    const big = p.home;
    G.res.req += big ? 400 : 40;
    G.res.samples[0] += big ? 30 : 6; G.res.samples[1] += big ? 15 : 2; G.res.samples[2] += big ? 8 : p.ring >= 3 ? 1 : 0.3;
    S.morale(big ? 18 : 1.5);
    G.stats.liberated++;
    S.computeFronts();
    if (big) {
      G.factions[was].shattered = true;
      S.chronicle('🜲 ' + DC.FACTIONS[was].name + ' homeworld ' + p.name + ' has been liberated. Their war machine is shattered.', 'triumph');
    } else S.chronicle(p.name + ' liberated from the ' + DC.FACTIONS[was].name + '.', 'good');
    DC.emit('liberated', { planet: p, faction: was });
  };
  S.defended = function (p) {
    const f = p.campaign.faction;
    p.campaign = null;
    S.morale(2);
    G.res.req += 40;
    G.stats.defended++;
    if (p.garrison > 0 && R.chance(0.25)) p.garrison--;
    S.chronicle(p.name + ' held against the ' + DC.FACTIONS[f].name + '.', 'good');
    DC.emit('defended', { planet: p, faction: f });
  };
  S.fall = function (p, f) {
    p.owner = f; p.lib = 6; p.campaign = null; p.garrison = 0; p.defense = Math.max(0, p.defense - 1); p.priority = false;
    S.morale(p.ring <= 1 ? -7 : -4);
    G.stats.lost++; G.stats.defenseFailed++;
    if (G.mo && G.mo.type === 'hold' && G.mo.faction === f) S.endMO(false);
    S.computeFronts();
    S.chronicle(p.name + ' has fallen to the ' + DC.FACTIONS[f].name + '.', 'bad');
    DC.emit('fell', { planet: p, faction: f });
  };
  S.destroyPlanet = function (p, cause) {
    p.destroyed = true; p.owner = 'none'; p.campaign = null; p.divers = 0; p.priority = false;
    p.links.forEach((l) => { G.planets[l].links = G.planets[l].links.filter((x) => x !== p.id); });
    p.links = [];
    G.lanes = G.lanes.filter((l) => l[0] !== p.id && l[1] !== p.id);
    G.stats.worldsDestroyed++;
    S.morale(-6);
    S.computeFronts();
    S.chronicle(p.name + ' was ' + cause + '.', 'bad');
    DC.emit('destroyed', { planet: p, cause });
  };
  S.morale = function (v) { G.res.morale = DC.clamp(G.res.morale + v, 0, 100); };

  S.launchAttack = function (f, forced) {
    const targets = G.planets.filter((p) => p.owner === 'human' && !p.destroyed && !p.campaign &&
      p.links.some((l) => G.planets[l].owner === f) && (!forced || !forced.planet || forced.planet === p.id));
    if (!targets.length) return null;
    targets.forEach((p) => {
      p._s = 3 * (4 - p.ring) + (p.garrison ? -1 : 1) - p.defense * 0.8 + R.f() * 4 + (p.id === 0 ? 4 : 0) + (p.special ? 2 : 0);
    });
    targets.sort((a, b) => b._s - a._s);
    const p = targets[0];
    const diff = DC.DIFFICULTY[G.difficulty];
    let strength = R.r(1.7, 3.3) * Math.sqrt(diff.aggro) * (forced && forced.mult ? forced.mult : 1) * (1 + Math.min(0.5, G.t / 1200));
    strength *= S.modMult('attack', { faction: f, sector: p.sector });
    const from = p.links.find((l) => G.planets[l].owner === f);
    p.campaign = {
      type: 'defense', faction: f, from, start: G.t, ends: G.t + (forced && forced.hours ? forced.hours : R.r(30, 46)),
      progress: 0, strength, level: Math.max(1, Math.min(5, Math.round(strength / 0.9))),
    };
    DC.emit('attack', { planet: p, faction: f });
    return p;
  };

  // ---------- commander actions ----------
  S.actionCost = function (a) {
    if (a.id === 'seaf' && S.has('seaf')) return Math.round(a.cost * 0.6);
    return a.cost;
  };
  S.cooldown = (id) => Math.max(0, (G.cd[id] || 0) - G.t);
  S.canAct = function (a, p) {
    if (a.needs && !S.has(a.needs)) return { ok: false, why: 'Requires ' + DC.RESEARCH.find((r) => r.id === a.needs).name + ' research.' };
    if (S.cooldown(a.id) > 0) return { ok: false, why: 'Recharging: ' + DC.fmtDur(S.cooldown(a.id)) };
    if (G.res.req < S.actionCost(a)) return { ok: false, why: 'Not enough Requisition.' };
    if (a.target === 'none') return { ok: true };
    if (!p) return { ok: false, why: 'Select a target world.', needTarget: true };
    if (p.destroyed) return { ok: false, why: 'That world no longer exists.' };
    if (a.target === 'enemy' && (p.owner === 'human')) return { ok: false, why: 'Target an enemy-held world.', needTarget: true };
    if (a.target === 'friendly' && p.owner !== 'human') return { ok: false, why: 'Target a Super Earth world.', needTarget: true };
    if (a.target === 'campaign' && !S.isCampaign(p)) return { ok: false, why: 'Only active campaign worlds can be flagged.', needTarget: true };
    if (a.id === 'priority' && !p.priority && G.planets.filter((q) => q.priority).length >= 3) return { ok: false, why: 'Three worlds already flagged. Unflag one first.' };
    if (a.fleet && !S.inFleetRange(p)) return { ok: false, why: 'Out of fleet range. Redeploy the Super Destroyers closer.' };
    if (a.id === 'fortify' && p.defense >= 4) return { ok: false, why: 'Defenses are already at maximum.' };
    if (a.id === 'seaf' && p.garrison >= 4) return { ok: false, why: 'This world already hosts 4 battalions.' };
    if (a.id === 'fleet' && Math.hypot(p.x - G.fleet.tx, p.y - G.fleet.ty) < 5) return { ok: false, why: 'The fleet is already headed there.' };
    return { ok: true };
  };
  S.act = function (a, p) {
    const can = S.canAct(a, p);
    if (!can.ok) return can;
    G.res.req -= S.actionCost(a);
    if (a.cd) G.cd[a.id] = G.t + (a.id === 'propaganda' && S.has('ministry') ? 20 : a.cd);
    switch (a.id) {
      case 'bombard': {
        const m = S.has('orbital') ? 1.6 : 1;
        p.lib = Math.min(99.5, p.lib + (9 * m) / Math.sqrt(p.hp));
        S.addMod({ kind: 'regen', v: 0.5, planet: p.id, h: S.has('orbital') ? 36 : 24, label: 'Orbital bombardment' });
        G.stats.strikes++;
        if (p.lib >= 99.5 && p.front) S.liberate(p);
        break;
      }
      case 'seaf': p.garrison++; break;
      case 'fortify': p.defense = Math.min(4, p.defense + (S.has('shield') ? 2 : 1)); break;
      case 'fleet': G.fleet.tx = p.x; G.fleet.ty = p.y - p.size - 14; G.fleet.moving = true; G.fleet.dest = p.id; break;
      case 'priority': p.priority = !p.priority; break;
      case 'propaganda':
        S.morale(S.has('ministry') ? 15 : 10);
        S.addMod({ kind: 'divers', v: 1.12, h: 12, label: 'Recruitment surge' });
        break;
      case 'hellbomb':
        p.lib = Math.min(99.5, p.lib + 30 / Math.sqrt(p.hp));
        G.stats.kia += R.r(1500, 3000);
        S.morale(3);
        G.stats.strikes++;
        if (p.lib >= 99.5 && p.front) S.liberate(p);
        break;
    }
    DC.emit('action', { action: a, planet: p });
    return { ok: true };
  };

  // ---------- research ----------
  S.researchState = function (r) {
    if (S.has(r.id)) return 'done';
    if (G.research.current && G.research.current.id === r.id) return 'active';
    if (r.req && !S.has(r.req)) return 'locked';
    return 'available';
  };
  S.canResearch = function (r) {
    if (S.researchState(r) !== 'available') return false;
    if (G.research.current) return false;
    if (G.res.req < r.cost) return false;
    return r.s.every((n, i) => G.res.samples[i] >= n);
  };
  S.startResearch = function (r) {
    if (!S.canResearch(r)) return false;
    G.res.req -= r.cost;
    r.s.forEach((n, i) => (G.res.samples[i] -= n));
    G.research.current = { id: r.id, start: G.t, ends: G.t + r.h };
    DC.emit('researchStart', r);
    return true;
  };
  S.finishResearch = function () {
    const id = G.research.current.id;
    G.research.done.push(id);
    G.research.current = null;
    G.stats.researchDone++;
    if (id === 'dss') G.planets[0].garrison++;
    const r = DC.RESEARCH.find((x) => x.id === id);
    S.chronicle('Research complete: ' + r.name + '.', 'good');
    DC.emit('researchDone', r);
  };

  // ---------- major orders ----------
  S.issueMO = function (type, opts) {
    const T = DC.MO_TYPES.find((m) => m.id === type);
    const mo = { type, start: G.t, reward: T.reward, morale: T.morale, medals: T.medals };
    if (type === 'liberate') {
      const p = G.planets[opts.planet];
      mo.target = p.id; mo.ends = G.t + T.hours * (p.home ? 1.6 : 1);
      if (p.home) { mo.reward *= 2; mo.medals *= 2; }
      mo.title = 'Liberate ' + p.name;
      mo.text = 'Seize ' + p.name + ' from the ' + DC.FACTIONS[p.owner].name + ' before the order expires.';
    } else if (type === 'sector') {
      const s = G.sectors[opts.sector];
      mo.sector = s.id; mo.ends = G.t + T.hours;
      mo.title = 'Liberate the ' + s.name + ' Sector';
      mo.text = 'Every world in the ' + s.name + ' Sector must fly the flag of Super Earth.';
    } else if (type === 'defend') {
      const p = G.planets[opts.planet];
      mo.target = p.id; mo.ends = p.campaign.ends; mo.faction = p.campaign.faction;
      mo.title = 'Defend ' + p.name;
      mo.text = 'Repel the ' + DC.FACTIONS[p.campaign.faction].name + ' invasion of ' + p.name + '.';
    } else if (type === 'hold') {
      mo.faction = opts.faction; mo.ends = G.t + T.hours;
      mo.title = 'Hold the line against the ' + DC.FACTIONS[opts.faction].name;
      mo.text = 'Lose no worlds to the ' + DC.FACTIONS[opts.faction].name + ' until the order expires.';
    }
    G.mo = mo;
    S.chronicle('Major Order issued: ' + mo.title + '.', 'order');
    DC.emit('moIssued', mo);
    return mo;
  };
  S.moProgress = function () {
    const mo = G.mo;
    if (!mo) return 0;
    if (mo.type === 'liberate') { const p = G.planets[mo.target]; return p.owner === 'human' ? 1 : p.lib / 100; }
    if (mo.type === 'defend') { const p = G.planets[mo.target]; return p.campaign ? p.campaign.progress / 100 : p.owner === 'human' ? 1 : 0; }
    if (mo.type === 'sector') {
      const ps = G.sectors[mo.sector].planets.map((i) => G.planets[i]).filter((p) => !p.destroyed);
      return ps.length ? ps.reduce((n, p) => n + (p.owner === 'human' ? 1 : p.lib / 100), 0) / ps.length : 1;
    }
    if (mo.type === 'hold') return DC.clamp((G.t - mo.start) / (mo.ends - mo.start), 0, 1);
    return 0;
  };
  S.checkMO = function () {
    const mo = G.mo;
    if (!mo) return;
    if (mo.type === 'liberate') {
      const p = G.planets[mo.target];
      if (p.owner === 'human') return S.endMO(true);
      if (p.destroyed) return S.endMO(false);
    } else if (mo.type === 'defend') {
      const p = G.planets[mo.target];
      if (p.owner !== 'human' || p.destroyed) return S.endMO(false);
      if (!p.campaign) return S.endMO(true);
    } else if (mo.type === 'sector') {
      const ps = G.sectors[mo.sector].planets.map((i) => G.planets[i]).filter((p) => !p.destroyed);
      if (ps.every((p) => p.owner === 'human')) return S.endMO(true);
    } else if (mo.type === 'hold' && G.t >= mo.ends) return S.endMO(true);
    if (G.t >= mo.ends) S.endMO(false);
  };
  S.endMO = function (win) {
    const mo = G.mo;
    if (!mo) return;
    G.mo = null;
    G.moCooldownUntil = G.t + 20;
    if (win) {
      G.res.req += mo.reward; G.res.medals += mo.medals; S.morale(mo.morale);
      G.stats.moDone++;
      S.chronicle('Major Order complete: ' + mo.title + '. +' + mo.medals + ' medals.', 'triumph');
    } else {
      S.morale(-6);
      G.stats.moFailed++;
      S.chronicle('Major Order failed: ' + mo.title + '.', 'bad');
    }
    DC.emit('moEnded', { mo, win });
  };

  S.chronicle = function (text, kind) {
    G.chronicle.push({ t: G.t, text, kind: kind || 'info' });
    if (G.chronicle.length > 400) G.chronicle.shift();
  };

  S.checkEnd = function () {
    if (G.over) return;
    if (G.planets[0].owner !== 'human') return S.gameOver(false, 'Super Earth has fallen. Managed Democracy is no more.');
    if (S.count('human') <= 5) return S.gameOver(false, 'Only a handful of worlds still answer to Super Earth. High Command has relieved you of command.');
    if (G.res.morale <= 0) return S.gameOver(false, 'Public morale collapsed. The citizens of Super Earth have lost faith in your command.');
    const homes = G.planets.filter((p) => p.home && p.id !== 0);
    if (homes.every((p) => p.owner === 'human' || p.destroyed)) return S.gameOver(true, 'Every enemy homeworld has been liberated. The galaxy is free and democratic.');
  };
  S.gameOver = function (win, reason) {
    G.over = { win, reason, t: G.t };
    S.snapshot();
    S.chronicle(win ? 'VICTORY. ' + reason : 'DEFEAT. ' + reason, win ? 'triumph' : 'bad');
    DC.emit('gameOver', G.over);
  };

  // Rank title from medals and progress.
  S.rank = function () {
    const score = G.res.medals + G.stats.liberated * 6 + G.stats.defended * 3;
    const idx = Math.min(DC.TITLES.length - 1, Math.floor(score / 90));
    return { title: DC.TITLES[idx], level: 1 + Math.floor(score / 18), xp: score % 18, next: 18 };
  };
})();
