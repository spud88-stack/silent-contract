// The AI Game Director: paces tension, runs multi-stage story arcs, fires random events,
// writes Ministry of Truth dispatches, and (with an OpenRouter key) invents new events and prose.
(function () {
  const DC = window.DC;
  const R = DC.R;
  const S = DC.Sim;
  const D = (DC.Director = { queue: [] });
  let G = null;
  const F = (f) => DC.FACTIONS[f];

  const PHASES = {
    calm: { target: 18, h: [18, 30], next: 'buildup', label: 'LULL', intent: ['Enemy forces are regrouping beyond the front.', 'Scouts report movement in the outer sectors.', 'The front is quiet. Too quiet.'] },
    buildup: { target: 45, h: [22, 36], next: 'crisis', label: 'ESCALATING', intent: ['Enemy high commands are massing forces.', 'Intercepted transmissions suggest a coordinated push.', 'Supply lines are being probed for weaknesses.'] },
    crisis: { target: 76, h: [18, 30], next: 'aftermath', label: 'CRISIS', intent: ['Full-scale enemy offensive underway.', 'All fronts under maximum pressure.', 'The enemy has committed its reserves.'] },
    aftermath: { target: 24, h: [14, 22], next: 'calm', label: 'AFTERMATH', intent: ['Enemy offensives are exhausted.', 'Both sides count their dead.', 'A window of opportunity has opened.'] },
  };
  D.PHASES = PHASES;

  D.init = function (g) {
    G = g;
    if (!G.director) {
      G.director = { phase: 'calm', phaseEnds: 20, tension: 0, target: 18, aggro: 1, extraAttacks: 0, nextEvent: 10, nextArc: 26,
        intent: PHASES.calm.intent[0], recentLib: [], recentLost: [], lastMercy: -99, hourAcc: 0, arcCooldown: {}, aiEvents: 0, beats: 0 };
      D.dispatch('THE GALACTIC WAR BEGINS', 'Commander ' + G.commander + ' has been granted command of the Strategic Liberation Interface. The ' +
        DC.ENEMIES.map((f) => F(f).name).join(', the ').replace(/, the ([^,]*)$/, ' and the $1') + ' threaten every border. Citizens sleep soundly knowing you are awake.', 'info', { kind: 'start' });
    }
  };

  // ---------- tension and pacing ----------
  D.tension = function () {
    let t = 0;
    G.planets.forEach((p) => {
      if (p.campaign) t += 8 + (p.ring <= 1 ? 10 : 0) + (p.id === 0 ? 30 : 0) + (p.campaign.progress < 30 && p.campaign.ends - G.t < 10 ? 6 : 0);
    });
    if (G.res.morale < 55) t += (55 - G.res.morale) * 0.7;
    t += G.arcs.length * 7;
    t += G.director.recentLost.filter((x) => G.t - x.t < 48).length * 6;
    if (G.darkEnergy > 70) t += 10;
    if (G.forge && G.forge.progress > 70) t += 10;
    return DC.clamp(t, 0, 100);
  };

  D.step = function (dt) {
    if (!G || G.over) return;
    const d = G.director;
    // Arcs advance every step for smooth meters; decisions happen hourly.
    G.arcs.slice().forEach((a) => { const def = ARCS[a.type]; if (def && def.tick) def.tick(a, dt); });
    d.hourAcc += dt;
    if (d.hourAcc < 1) return;
    d.hourAcc -= 1;

    d.tension = DC.lerp(d.tension, D.tension(), 0.35);
    if (G.t >= d.phaseEnds) {
      const nx = PHASES[d.phase].next;
      d.phase = nx;
      d.phaseEnds = G.t + R.r(...PHASES[nx].h);
      d.intent = R.pick(PHASES[nx].intent);
      DC.emit('phase', nx);
    }
    d.target = PHASES[d.phase].target + Math.min(14, G.t / 48);
    const gap = d.target - d.tension;
    d.aggro = DC.lerp(d.aggro, DC.clamp(1 + gap / 40, 0.45, 1.9), 0.2);
    d.extraAttacks = d.phase === 'crisis' ? 1 : 0;
    d.recentLib = d.recentLib.filter((x) => G.t - x.t < 72);
    d.recentLost = d.recentLost.filter((x) => G.t - x.t < 72);

    // Mercy: if the war is going very badly, the director throws a lifeline.
    if (G.res.morale < 22 && G.t - d.lastMercy > 40) {
      d.lastMercy = G.t;
      fireEvent(pickEvent('good'));
      return;
    }
    // Punish dominance: a faction losing ground fast launches a desperate counteroffensive.
    DC.ENEMIES.forEach((f) => {
      const n = d.recentLib.filter((x) => x.f === f).length;
      if (n >= 3 && S.count('human') > (G.history[0] ? G.history[0].human : 0) && !G.factions[f].shattered && !G.arcs.some((a) => a.type === 'counter' && a.faction === f) && S.count(f) > 2) startArc('counter', f);
    });
    // Story arcs.
    const maxArcs = G.t < 120 ? 1 : G.t < 360 ? 2 : 3;
    if (G.t >= d.nextArc && G.arcs.length < maxArcs && (d.phase === 'buildup' || d.phase === 'crisis' || gap > 12)) {
      if (startArc()) d.nextArc = G.t + R.r(30, 54);
      else d.nextArc = G.t + 6;
    }
    // Random events.
    if (G.t >= d.nextEvent) {
      d.nextEvent = G.t + R.r(16, 30);
      const mood = gap > 10 ? 'bad' : gap < -10 ? 'good' : null;
      if (DC.LLM.enabled() && R.chance(0.6)) inventEvent(mood);
      else fireEvent(pickEvent(mood));
    }
  };

  // ---------- reacting to the war ----------
  DC.on('liberated', ({ planet, faction }) => {
    if (!G) return;
    G.director.recentLib.push({ t: G.t, f: faction });
    if (planet.home) {
      D.dispatch('HOMEWORLD LIBERATED: ' + planet.name.toUpperCase(), 'The ' + F(faction).name + ' homeworld of ' + planet.name + ' burns under the flag of Super Earth. ' + G.factions[faction].leader.title + ' ' + G.factions[faction].leader.name + ' is confirmed ' + (faction === 'bots' ? 'decommissioned' : 'deceased') + '. Remaining ' + F(faction).adj + ' forces are in disarray.', 'triumph', { kind: 'homeworld', planet: planet.name, faction: F(faction).name }, true);
    } else if (R.chance(0.45)) {
      D.dispatch(planet.name.toUpperCase() + ' LIBERATED', 'Helldivers have returned ' + planet.name + ' to the loving embrace of Managed Democracy. ' + DC.fmtShort(G.stats.killsBy[faction]) + ' ' + F(faction).enemyWord + ' eliminated to date. ' + R.pick(DC.PROPAGANDA), 'good');
    }
  });
  DC.on('fell', ({ planet, faction }) => {
    if (!G) return;
    G.director.recentLost.push({ t: G.t, f: faction });
    D.dispatch('STRATEGIC REPOSITIONING: ' + planet.name.toUpperCase(), 'The Ministry of Truth confirms that Helldivers have tactically relocated away from ' + planet.name + '. The ' + F(faction).name + ' occupation is temporary and was anticipated. Morale remains excellent.', 'bad');
  });
  DC.on('attack', ({ planet, faction }) => {
    if (!G) return;
    if (planet.id === 0) {
      D.dispatch('SUPER EARTH UNDER ATTACK', 'The ' + F(faction).name + ' have reached the capital. Every citizen is now a soldier. Every soldier is now a Helldiver. Super Earth must not fall.', 'bad', { kind: 'siege', faction: F(faction).name }, true);
    } else if (planet.ring <= 1) {
      D.dispatch('INNER WORLDS THREATENED', F(faction).adj + ' forces strike ' + planet.name + ', just ' + Math.round(Math.hypot(planet.x, planet.y) / 10) + ' light-years from Super Earth. Planetary defense failure in ' + DC.fmtDur(planet.campaign.ends - G.t) + '.', 'bad');
    }
  });
  DC.on('moEnded', ({ mo, win }) => {
    D.dispatch(win ? 'MAJOR ORDER COMPLETE' : 'MAJOR ORDER FAILED', win ? mo.title + '. Helldivers across the galaxy are awarded ' + mo.medals + ' medals. High Command commends Commander ' + G.commander + '.' : mo.title + ' was not achieved. High Command reminds all personnel that failure is a choice, and you chose it.', win ? 'triumph' : 'bad', { kind: 'mo', title: mo.title, win }, win);
  });
  DC.on('researchDone', (r) => D.dispatch('BREAKTHROUGH: ' + r.name.toUpperCase(), r.desc + ' Our scientists have been awarded a second ration of Liber-Tea.', 'good'));
  DC.on('eliminated', (f) => D.dispatch(F(f).short + ' ERADICATED', 'Not a single ' + F(f).name + ' world remains in the galaxy. Xenobiologists request specimens. There are none.', 'triumph', { kind: 'eliminated', faction: F(f).name }, true));

  // ---------- dispatches ----------
  D.dispatch = function (title, body, kind, beat, important) {
    const d = { t: G.t, title, body, kind: kind || 'info', unread: true, id: DC.uid('d') };
    G.dispatches.push(d);
    if (G.dispatches.length > 160) G.dispatches.shift();
    DC.emit('dispatch', d);
    if (important && beat && DC.LLM.enabled()) narrate(d, beat);
    return d;
  };

  function warBrief() {
    const own = { human: S.count('human'), bugs: S.count('bugs'), bots: S.count('bots'), squids: S.count('squids') };
    const hot = S.campaigns().sort((a, b) => b.divers - a.divers).slice(0, 6).map((p) =>
      p.name + (p.campaign ? ' (DEFENDING vs ' + F(p.campaign.faction).name + ', ' + Math.round(p.campaign.progress) + '%)' : ' (' + F(p.owner).name + '-held, ' + Math.round(p.lib) + '% liberated)'));
    return 'Day ' + Math.floor(G.t / 24 + 1) + '. Commander ' + G.commander + '. Worlds held: Super Earth ' + own.human + ', Terminids ' + own.bugs + ', Automatons ' + own.bots + ', Illuminate ' + own.squids +
      '. Morale ' + Math.round(G.res.morale) + '/100. Active Helldivers ' + DC.fmt(G.divers) + '. Director phase: ' + G.director.phase + '.\nHot fronts: ' + hot.join('; ') +
      '\nActive story arcs: ' + (G.arcs.map((a) => a.title).join('; ') || 'none') +
      '\nEnemy leaders: ' + DC.ENEMIES.map((f) => F(f).name + ' ' + G.factions[f].leader.title + ' ' + G.factions[f].leader.name).join('; ') +
      '\nRecent history: ' + G.chronicle.slice(-8).map((c) => c.text).join(' | ');
  }
  const VOICE = 'You are the Ministry of Truth propaganda writer for Super Earth in a Helldivers-style satirical sci-fi war game. Voice: bombastic, patriotic, darkly funny, cheerfully authoritarian, never breaking character. Never mention being an AI.';

  async function narrate(d, beat) {
    if (Date.now() - DC.LLM.lastCall < 8000 || DC.LLM.inflight > 1) return;
    try {
      const out = await DC.LLM.json([
        { role: 'system', content: VOICE },
        { role: 'user', content: 'War state:\n' + warBrief() + '\n\nThis just happened: ' + JSON.stringify(beat) + ' (draft headline: "' + d.title + '").\nWrite a short dispatch. Reply ONLY with JSON: {"title":"UPPERCASE HEADLINE, max 8 words","body":"40-75 words"}' },
      ], { max: 260 });
      if (out && out.body) {
        D.dispatch(String(out.title || d.title).slice(0, 80).toUpperCase(), String(out.body).slice(0, 600), d.kind, null).ai = true;
      }
    } catch (e) { /* the template dispatch already went out */ }
  }

  // ---------- effects (shared by authored events, arcs and AI-invented events) ----------
  D.apply = function (effects, ctx) {
    const notes = [];
    (effects || []).forEach((e) => {
      const pid = e.planet === 'ctx' ? ctx && ctx.planet : e.planet;
      const p = pid != null ? G.planets[pid] : null;
      switch (e.t) {
        case 'req': G.res.req = Math.max(0, G.res.req + e.v); notes.push((e.v >= 0 ? '+' : '') + e.v + ' Requisition'); break;
        case 'morale': S.morale(e.v); notes.push((e.v >= 0 ? '+' : '') + e.v + ' Morale'); break;
        case 'medals': G.res.medals += e.v; notes.push('+' + e.v + ' Medals'); break;
        case 'samples': e.v.forEach((n, i) => (G.res.samples[i] += n)); notes.push('+Samples'); break;
        case 'kia': G.stats.kia += e.v; notes.push(DC.fmt(e.v) + ' Helldivers KIA'); break;
        case 'mod': S.addMod({ kind: e.kind, v: e.v, h: e.h, faction: e.faction, planet: p ? p.id : undefined, sector: e.sector, label: e.label }); notes.push(e.label || e.kind); break;
        case 'attack': { const tp = S.launchAttack(e.faction, { planet: p ? p.id : null, mult: e.mult, hours: e.hours }); if (tp) notes.push(F(e.faction).name + ' attack on ' + tp.name); break; }
        case 'lib': if (p && p.owner !== 'human') { p.lib = DC.clamp(p.lib + e.v, 0, 99); notes.push((e.v >= 0 ? '+' : '') + e.v + '% liberation on ' + p.name); } break;
        case 'garrison': if (p && p.owner === 'human') { p.garrison = DC.clamp(p.garrison + e.v, 0, 4); notes.push('SEAF on ' + p.name + ' ' + (e.v >= 0 ? '+' : '') + e.v); } break;
        case 'defense': if (p && p.owner === 'human') { p.defense = DC.clamp(p.defense + e.v, 0, 4); notes.push('Defenses on ' + p.name + ' ' + (e.v >= 0 ? '+' : '') + e.v); } break;
        case 'hazard': if (p && !p.hazards.includes(e.v)) { p.hazards.push(e.v); notes.push(e.v + ' on ' + p.name); } break;
        case 'budget': if (G.factions[e.faction]) G.factions[e.faction].budget = DC.clamp(G.factions[e.faction].budget + e.v, 0, 3); break;
        case 'fleet': if (p) { G.fleet.tx = p.x; G.fleet.ty = p.y - p.size - 14; G.fleet.moving = true; notes.push('Fleet redirected to ' + p.name); } break;
        case 'cd': G.cd[e.action] = G.t + e.h; notes.push(e.label || 'Command delayed'); break;
        case 'chance': {
          const ok = R.chance(e.p);
          if ((ok ? e.yesText : e.noText)) notes.push(ok ? e.yesText : e.noText);
          notes.push(...D.apply(ok ? e.yes : e.no, ctx));
          break;
        }
      }
    });
    return notes.filter(Boolean);
  };

  // ---------- events ----------
  const humanFront = (f) => G.planets.filter((p) => p.owner === 'human' && !p.destroyed && p.id !== 0 && p.links.some((l) => (f ? G.planets[l].owner === f : G.planets[l].owner !== 'human' && G.planets[l].owner !== 'none')));
  const enemyFront = (f) => G.planets.filter((p) => p.front && (!f || p.owner === f));
  const liveEnemies = () => DC.ENEMIES.filter((f) => !G.factions[f].eliminated && S.count(f) > 0);

  const EVENTS = [
    { id: 'leak', mood: 'bad', make() {
      const p = R.pick(humanFront()) || G.planets[0];
      return { title: 'Classified Footage Leaked', ctx: { planet: p.id }, body: 'Unauthorized footage from ' + p.name + ' shows a SEAF platoon fleeing a single Scavenger. It is spreading on civilian channels.',
        options: [{ label: 'Suppress the footage', fx: [{ t: 'req', v: -110 }] },
          { label: 'Spin it as a tactical feint', fx: [{ t: 'chance', p: 0.6, yesText: 'The public applauds the "feint".', yes: [{ t: 'morale', v: 5 }], noText: 'Nobody believes it.', no: [{ t: 'morale', v: -9 }] }] }] };
    } },
    { id: 'parade', mood: null, make: () => ({ title: 'Liberty Day Parade', body: 'The Ministry of Celebration requests funding for a Liberty Day parade on Super Earth, featuring 40,000 synchronized flags and one very large eagle.',
      options: [{ label: 'Fund the parade (120 R)', fx: [{ t: 'req', v: -120 }, { t: 'morale', v: 10 }] }, { label: 'Cancel it. There is a war on.', fx: [{ t: 'morale', v: -4 }, { t: 'req', v: 40 }] }] }) },
    { id: 'volunteers', mood: 'good', make: () => ({ title: 'Volunteer Surge', body: 'A viral recruitment broadcast has emptied the high schools of three continents. Hellpods are being bolted together in record time.',
      options: [{ label: 'Glorious', fx: [{ t: 'mod', kind: 'divers', v: 1.2, h: 30, label: 'Volunteer surge' }, { t: 'morale', v: 3 }] }] }) },
    { id: 'infighting', mood: 'good', cond: () => liveEnemies().length >= 2, make() {
      const [a, b] = R.shuffle(liveEnemies().slice());
      return { title: 'Enemy Infighting', body: 'Long-range scanners detect ' + F(a).name + ' and ' + F(b).name + ' fleets firing on each other at a disputed border. Xenobiologists are delighted.',
        options: [{ label: 'Let them bleed', fx: [{ t: 'mod', kind: 'regen', v: 0.65, h: 30, faction: a, label: F(a).adj + ' infighting' }, { t: 'mod', kind: 'regen', v: 0.65, h: 30, faction: b, label: F(b).adj + ' infighting' }, { t: 'mod', kind: 'aggro', v: 0.5, h: 30, faction: a, label: 'Distracted' }, { t: 'mod', kind: 'aggro', v: 0.5, h: 30, faction: b, label: 'Distracted' }] }] };
    } },
    { id: 'convoy', mood: 'bad', make() {
      const p = R.pick(humanFront()) || G.planets[0];
      return { title: 'Supply Convoy Ambushed', ctx: { planet: p.id }, body: 'A requisition convoy bound for ' + p.name + ' is under fire. Its cargo: forty thousand crates of ammunition and one crate of medals.',
        options: [{ label: 'Divert the fleet to escort it', fx: [{ t: 'fleet', planet: 'ctx' }, { t: 'req', v: 80 }] }, { label: 'Write it off', fx: [{ t: 'req', v: -150 }] }] };
    } },
    { id: 'sympathizers', mood: null, make() {
      const p = R.pick(humanFront()) || G.planets[0];
      return { title: 'Alleged Sympathizers', ctx: { planet: p.id }, body: 'Democracy Officers on ' + p.name + ' report "suspicious levels of curiosity" among the colonists. Some have asked what the enemy actually wants.',
        options: [{ label: 'Re-educate the colony', fx: [{ t: 'morale', v: -3 }, { t: 'mod', kind: 'income', v: 1.25, h: 36, label: 'Productive re-education' }] },
          { label: 'Declare a Freedom Amnesty', fx: [{ t: 'morale', v: 5 }, { t: 'mod', kind: 'eff', v: 0.92, h: 24, label: 'Lax discipline' }] }] };
    } },
    { id: 'prototype', mood: null, cond: () => enemyFront().length > 0, make() {
      const p = R.pick(enemyFront());
      return { title: 'Experimental Stratagem', ctx: { planet: p.id }, body: 'R&D offers an untested orbital payload for use on ' + p.name + '. Its codename is "PROBABLY FINE".',
        options: [{ label: 'Authorize the test', fx: [{ t: 'chance', p: 0.6, yesText: 'Spectacular success.', yes: [{ t: 'lib', planet: 'ctx', v: 20 }, { t: 'morale', v: 3 }], noText: 'It was not fine.', no: [{ t: 'kia', v: 4200 }, { t: 'morale', v: -6 }] }] },
          { label: 'Decline. Helldivers are not test subjects.', fx: [{ t: 'morale', v: 1 }] }] };
    } },
    { id: 'broadcast', mood: 'bad', cond: () => liveEnemies().length > 0, make() {
      const f = R.pick(liveEnemies());
      return { title: F(f).adj + ' Signal Intrusion', body: 'The ' + F(f).name + ' have hijacked civilian channels with ' + (f === 'bots' ? 'a looping broadcast of binary screaming' : f === 'bugs' ? 'a high-pitched chittering that makes dogs cry' : 'hypnotic geometric patterns and a soothing voice') + '.',
        options: [{ label: 'Counter-broadcast (80 R)', fx: [{ t: 'req', v: -80 }, { t: 'morale', v: 2 }] }, { label: 'Ignore it', fx: [{ t: 'morale', v: -7 }] }] };
    } },
    { id: 'whispers', mood: 'bad', cond: () => humanFront('squids').length > 0, make() {
      const p = R.pick(humanFront('squids'));
      return { title: 'Whispers on ' + p.name, ctx: { planet: p.id }, body: 'The garrison on ' + p.name + ' reports hearing a voice promising "peace". Three officers have stopped saluting.',
        options: [{ label: 'Purge and replace the garrison', fx: [{ t: 'garrison', planet: 'ctx', v: -4 }, { t: 'req', v: -60 }, { t: 'morale', v: 2 }] },
          { label: 'Trust the soldiers', fx: [{ t: 'chance', p: 0.5, yesText: 'The garrison holds firm.', yes: [{ t: 'morale', v: 3 }], noText: 'The garrison opens the gates.', no: [{ t: 'attack', faction: 'squids', planet: 'ctx', mult: 1.6, hours: 30 }] }] }] };
    } },
    { id: 'meteor', mood: 'good', cond: () => enemyFront().length > 0, make() {
      const p = R.pick(enemyFront());
      return { title: 'Meteor Storm', ctx: { planet: p.id }, body: 'A freak meteor storm is pummeling ' + F(p.owner).name + ' positions on ' + p.name + '. The Ministry claims credit.',
        options: [{ label: 'Praise the heavens (and the Ministry)', fx: [{ t: 'hazard', planet: 'ctx', v: 'Meteor Showers' }, { t: 'mod', kind: 'regen', v: 0.55, h: 36, planet: 'ctx', label: 'Meteor storm' }, { t: 'lib', planet: 'ctx', v: 6 }] }] };
    } },
    { id: 'ftl', mood: 'bad', make: () => ({ title: 'FTL Drive Malfunction', body: 'The flagship\'s FTL drive has developed an "unpatriotic rattle". The chief engineer recommends repairs. The Ministry recommends not mentioning it.',
      options: [{ label: 'Emergency repairs (90 R)', fx: [{ t: 'req', v: -90 }] }, { label: 'Limp along', fx: [{ t: 'cd', action: 'fleet', h: 16, label: 'Fleet grounded 16h' }, { t: 'cd', action: 'bombard', h: 16, label: 'Orbital guns offline' }] }] }) },
    { id: 'beacon', mood: null, cond: () => enemyFront().length > 0, make() {
      const p = R.pick(enemyFront());
      return { title: 'Distress Beacon', ctx: { planet: p.id }, body: 'A lost Helldiver squad is broadcasting from behind enemy lines on ' + p.name + '. They report "plenty of ammo, zero reinforcements".',
        options: [{ label: 'Mount a rescue', fx: [{ t: 'mod', kind: 'eff', v: 1.3, h: 24, planet: 'ctx', label: 'Rescue operation' }, { t: 'chance', p: 0.7, yesText: 'The squad is extracted, and they bring intel.', yes: [{ t: 'morale', v: 6 }, { t: 'lib', planet: 'ctx', v: 8 }], noText: 'The rescue team is lost too.', no: [{ t: 'kia', v: 1200 }, { t: 'morale', v: -3 }] }] },
          { label: 'Leave them. They knew the risks.', fx: [{ t: 'morale', v: -4 }] }] };
    } },
    { id: 'arms', mood: 'good', make: () => ({ title: 'Defense Contractor Windfall', body: 'Patriotic arms manufacturer Liberty Ballistics posts record profits and "voluntarily" donates a portion to the war effort.',
      options: [{ label: 'Accept graciously', fx: [{ t: 'req', v: 220 }] }] }) },
    { id: 'spy', mood: 'bad', make: () => ({ title: 'Spy in High Command', body: 'Counter-intelligence has identified a mole leaking deployment schedules. The suspect insists the documents were "for a book club".',
      options: [{ label: 'Public trial', fx: [{ t: 'morale', v: -4 }, ...DC.ENEMIES.map((f) => ({ t: 'budget', faction: f, v: -1 }))] }, { label: 'Quiet disappearance (120 R)', fx: [{ t: 'req', v: -120 }] }] }) },
    { id: 'cache', mood: 'good', make: () => ({ title: 'Sample Cache Recovered', body: 'Helldivers on a routine patrol stumbled onto an abandoned research bunker. It is full of samples and also one very confused scientist.',
      options: [{ label: 'Ship it all to R&D', fx: [{ t: 'samples', v: [12, 7, 4] }] }] }) },
    { id: 'lull', mood: 'good', make: () => ({ title: 'Unexplained Lull', body: 'All three enemy fronts have gone silent at once. Analysts are divided between "they are scared" and "they are planning something".',
      options: [{ label: 'Use the time to dig in', fx: DC.ENEMIES.map((f) => ({ t: 'mod', kind: 'aggro', v: 0.4, h: 24, faction: f, label: 'Enemy lull' })) }] }) },
    { id: 'tunnels', mood: 'bad', cond: () => humanFront('bugs').length > 0, make() {
      const p = R.pick(humanFront('bugs'));
      return { title: 'Tunnel Breach', ctx: { planet: p.id }, body: 'Seismic sensors on ' + p.name + ' detect Terminid tunnels beneath the capital city. Something big is digging.',
        options: [{ label: 'Emergency SEAF deployment (90 R)', fx: [{ t: 'req', v: -90 }, { t: 'garrison', planet: 'ctx', v: 2 }, { t: 'attack', faction: 'bugs', planet: 'ctx', mult: 1.2, hours: 34 }] },
          { label: 'Brace for impact', fx: [{ t: 'attack', faction: 'bugs', planet: 'ctx', mult: 1.25, hours: 30 }] }] };
    } },
    { id: 'dropfleet', mood: 'bad', cond: () => humanFront('bots').length > 0, make() {
      const p = R.pick(humanFront('bots'));
      return { title: 'Automaton Drop Fleet', ctx: { planet: p.id }, body: 'A wall of Automaton dropships has emerged from hyperspace above ' + p.name + '. Their hulls are painted with tally marks.',
        options: [{ label: 'Scramble the orbital guns', fx: [{ t: 'defense', planet: 'ctx', v: 1 }, { t: 'req', v: -70 }, { t: 'attack', faction: 'bots', planet: 'ctx', mult: 1.3, hours: 38 }] },
          { label: 'Evacuate civilians first', fx: [{ t: 'morale', v: 3 }, { t: 'attack', faction: 'bots', planet: 'ctx', mult: 1.45, hours: 32 }] }] };
    } },
  ];

  function pickEvent(mood) {
    const pool = EVENTS.filter((e) => (!e.cond || e.cond()) && (!mood || e.mood === mood || (e.mood === null && R.chance(0.3))));
    const list = pool.length ? pool : EVENTS.filter((e) => !e.cond || e.cond());
    return R.pick(list).make();
  }
  function fireEvent(ev) {
    if (!ev) return;
    ev.id = DC.uid('ev');
    G.stats.events++;
    D.queue.push(ev);
    DC.emit('event', ev);
  }
  D.resolve = function (ev, idx) {
    const opt = ev.options[idx];
    D.queue = D.queue.filter((e) => e !== ev);
    const notes = D.apply(opt.fx, ev.ctx);
    S.chronicle(ev.title + ': ' + opt.label + (notes.length ? ' (' + notes.join(', ') + ')' : ''), 'event');
    S.computeFronts();
    DC.emit('resolved', { ev, opt, notes });
    return notes;
  };

  // ---------- AI-invented events ----------
  const FX_DOC = 'Allowed effects (use 1-4 per option): {"t":"req","v":-300..400} requisition; {"t":"morale","v":-12..12}; {"t":"samples","v":[c,r,s] each 0..15}; {"t":"kia","v":0..6000}; ' +
    '{"t":"mod","kind":"eff|regen|divers|aggro|income","v":0.5..1.6,"h":6..72,"faction":"bugs|bots|squids"(optional, required for aggro),"planet":"PLANET NAME"(optional),"label":"short"}; ' +
    '{"t":"attack","faction":"bugs|bots|squids","planet":"HUMAN PLANET NAME","mult":0.8..1.8,"hours":24..48}; {"t":"lib","planet":"ENEMY PLANET NAME","v":-15..25}; ' +
    '{"t":"garrison","planet":"HUMAN PLANET NAME","v":-4..3}; {"t":"defense","planet":"HUMAN PLANET NAME","v":-2..2}; {"t":"hazard","planet":"PLANET NAME","v":"hazard name"}; ' +
    '{"t":"chance","p":0.2..0.8,"yesText":"...","yes":[effects],"noText":"...","no":[effects]}.';

  async function inventEvent(mood) {
    const human = humanFront().slice(0, 10).map((p) => p.name);
    const enemy = enemyFront().slice(0, 10).map((p) => p.name + ' [' + p.owner + ']');
    const want = mood === 'bad' ? 'The player is comfortable: create a threatening complication with a hard choice.' : mood === 'good' ? 'The player is struggling: create an opportunity or lucky break, ideally with a twist.' : 'Create an interesting dilemma.';
    try {
      const out = await DC.LLM.json([
        { role: 'system', content: VOICE + ' You are also the game director, inventing story events that change the simulation.' },
        { role: 'user', content: 'War state:\n' + warBrief() + '\nHuman front worlds: ' + human.join(', ') + '\nEnemy front worlds: ' + enemy.join(', ') +
          '\n\n' + want + ' Make it specific, vivid and connected to recent history or active arcs. Callbacks to named leaders or heroes are great.\n' + FX_DOC +
          '\nReply ONLY with JSON: {"title":"max 6 words","body":"40-80 words, in-world briefing","options":[{"label":"max 7 words","fx":[...]}, ...2-3 options]}' },
      ], { max: 700, timeout: 25000 });
      const ev = sanitizeEvent(out);
      if (!ev) throw new Error('invalid event');
      ev.ai = true;
      G.director.aiEvents++;
      fireEvent(ev);
    } catch (e) {
      fireEvent(pickEvent(mood));
    }
  }
  const num = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? DC.clamp(v, a, b) : d; };
  function planetByName(n, owner) {
    if (n == null) return null;
    const s = String(n).toLowerCase().replace(/\s*\[.*\]$/, '');
    const p = G.planets.find((q) => q.name.toLowerCase() === s && !q.destroyed);
    if (!p) return null;
    if (owner === 'human' && p.owner !== 'human') return null;
    if (owner === 'enemy' && p.owner === 'human') return null;
    return p.id;
  }
  function sanitizeFx(list, depth) {
    if (!Array.isArray(list)) return [];
    const out = [];
    list.slice(0, 5).forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const fac = DC.ENEMIES.includes(e.faction) ? e.faction : null;
      switch (e.t) {
        case 'req': out.push({ t: 'req', v: Math.round(num(e.v, -300, 400, 0)) }); break;
        case 'morale': out.push({ t: 'morale', v: Math.round(num(e.v, -12, 12, 0)) }); break;
        case 'samples': if (Array.isArray(e.v)) out.push({ t: 'samples', v: [0, 1, 2].map((i) => Math.round(num(e.v[i], 0, 15, 0))) }); break;
        case 'kia': out.push({ t: 'kia', v: Math.round(num(e.v, 0, 6000, 0)) }); break;
        case 'mod': {
          if (!['eff', 'regen', 'divers', 'aggro', 'income'].includes(e.kind)) break;
          if (e.kind === 'aggro' && !fac) break;
          const m = { t: 'mod', kind: e.kind, v: num(e.v, 0.5, 1.6, 1), h: num(e.h, 6, 72, 24), label: String(e.label || 'Director effect').slice(0, 40) };
          if (fac) m.faction = fac;
          if (e.planet) { const pid = planetByName(e.planet); if (pid == null) break; m.planet = pid; }
          out.push(m); break;
        }
        case 'attack': { const pid = planetByName(e.planet, 'human'); if (!fac) break; out.push({ t: 'attack', faction: fac, planet: pid, mult: num(e.mult, 0.8, 1.8, 1), hours: num(e.hours, 24, 48, 36) }); break; }
        case 'lib': { const pid = planetByName(e.planet, 'enemy'); if (pid != null) out.push({ t: 'lib', planet: pid, v: num(e.v, -15, 25, 0) }); break; }
        case 'garrison': { const pid = planetByName(e.planet, 'human'); if (pid != null) out.push({ t: 'garrison', planet: pid, v: Math.round(num(e.v, -4, 3, 0)) }); break; }
        case 'defense': { const pid = planetByName(e.planet, 'human'); if (pid != null) out.push({ t: 'defense', planet: pid, v: Math.round(num(e.v, -2, 2, 0)) }); break; }
        case 'hazard': { const pid = planetByName(e.planet); if (pid != null) out.push({ t: 'hazard', planet: pid, v: String(e.v || 'Strange Weather').slice(0, 24) }); break; }
        case 'chance': if (depth < 1) out.push({ t: 'chance', p: num(e.p, 0.2, 0.8, 0.5), yesText: String(e.yesText || '').slice(0, 90), noText: String(e.noText || '').slice(0, 90), yes: sanitizeFx(e.yes, depth + 1), no: sanitizeFx(e.no, depth + 1) }); break;
      }
    });
    return out;
  }
  function sanitizeEvent(o) {
    if (!o || !o.title || !o.body || !Array.isArray(o.options) || o.options.length < 1) return null;
    const options = o.options.slice(0, 3).map((op) => ({ label: String(op.label || 'Proceed').slice(0, 60), fx: sanitizeFx(op.fx || op.effects, 0) }));
    return { title: String(o.title).slice(0, 60), body: String(o.body).slice(0, 700), options };
  }

  // ---------- story arcs ----------
  const nearestToHumans = (list) => list.map((p) => ({ p, d: Math.min(...G.planets.filter((q) => q.owner === 'human').map((q) => DC.dist(p, q))) })).sort((a, b) => a.d - b.d).map((x) => x.p);

  const ARCS = (D.ARCS = {
    singularity: {
      faction: 'squids', weight: 1,
      can: () => !G.factions.squids.shattered && G.planets.filter((p) => p.owner === 'squids' && !p.home).length >= 3 && !G.singularity,
      start(a) {
        const gens = nearestToHumans(G.planets.filter((p) => p.owner === 'squids' && !p.home && !p.special)).slice(0, 3);
        gens.forEach((p) => (p.special = 'darkEnergy'));
        const home = G.planets.find((p) => p.home && p.owner === 'squids') || gens[gens.length - 1];
        const ang = Math.atan2(home.y, home.x);
        G.singularity = { x: Math.cos(ang) * 880, y: Math.sin(ang) * 880, tx: null, ty: null, victim: null };
        G.darkEnergy = 0;
        a.gens = gens.map((p) => p.id); a.eaten = 0;
        a.title = 'The Meridian Singularity';
        D.dispatch('DARK ENERGY DETECTED', 'The Illuminate are generating Dark Energy on ' + gens.map((p) => p.name).join(', ') + ', and using it to move a singularity toward Super Earth. ' + G.factions.squids.leader.title + ' ' + G.factions.squids.leader.name + ' is believed to be directing the operation. The generators must be stopped at all costs.', 'bad', { kind: 'arcStart', arc: a.title, gens: gens.map((p) => p.name) }, true);
      },
      tick(a, dt) {
        const active = a.gens.filter((id) => G.planets[id].owner === 'squids' && !G.planets[id].destroyed).length;
        const sg = G.singularity;
        if (!sg) return endArc(a);
        if (active === 0) {
          G.singularity = null; G.darkEnergy = 0;
          a.gens.forEach((id) => { if (G.planets[id].special === 'darkEnergy') G.planets[id].special = null; });
          D.apply([{ t: 'morale', v: 10 }, { t: 'req', v: 300 }, { t: 'medals', v: 60 }]);
          S.chronicle('The Meridian Singularity collapsed after every Dark Energy generator was liberated.', 'triumph');
          D.dispatch('SINGULARITY COLLAPSED', 'With every Dark Energy generator liberated, the Illuminate singularity has imploded into a harmless point of light. Astronomers have named it "Freedom".', 'triumph', { kind: 'arcWin', arc: a.title }, true);
          DC.emit('fx', { type: 'collapse', x: sg.x, y: sg.y });
          return endArc(a, true);
        }
        if (sg.victim == null) {
          G.darkEnergy += dt * 0.95 * active * (S.has('emp') ? 0.6 : 1);
          if (G.darkEnergy >= 100) {
            const cands = G.planets.filter((p) => p.owner === 'human' && !p.destroyed && p.id !== 0);
            cands.sort((p, q) => (DC.dist(p, sg) + Math.hypot(p.x, p.y) * 0.6) - (DC.dist(q, sg) + Math.hypot(q.x, q.y) * 0.6));
            const v = cands[0];
            if (!v) return;
            sg.victim = v.id; sg.tx = v.x; sg.ty = v.y;
            D.dispatch('THE SINGULARITY MOVES', 'Dark Energy reserves are full. The singularity is drifting toward ' + v.name + '. Evacuation is "encouraged".', 'bad', { kind: 'singularityJump', target: v.name }, true);
          }
        } else {
          const d = Math.hypot(sg.tx - sg.x, sg.ty - sg.y), sp = 70 * dt;
          if (d > sp) { sg.x += ((sg.tx - sg.x) / d) * sp; sg.y += ((sg.ty - sg.y) / d) * sp; }
          else {
            const v = G.planets[sg.victim];
            sg.x = sg.tx; sg.y = sg.ty; sg.victim = null; G.darkEnergy = 0;
            if (!v.destroyed) { DC.emit('fx', { type: 'consume', x: v.x, y: v.y }); S.destroyPlanet(v, 'consumed by the Meridian Singularity'); G.stats.kia += 3000; }
            a.eaten++;
            if (a.eaten >= 3) {
              G.singularity = null;
              a.gens.forEach((id) => { if (G.planets[id].special === 'darkEnergy') G.planets[id].special = null; });
              D.dispatch('THE SINGULARITY DISSIPATES', 'Having consumed three worlds, the singularity has burned itself out. The Ministry of Truth reports that those worlds were "mostly empty".', 'bad');
              return endArc(a, false);
            }
          }
        }
      },
      objective(a) {
        const left = a.gens.filter((id) => G.planets[id].owner === 'squids' && !G.planets[id].destroyed);
        return { text: 'Liberate the Dark Energy generators', sub: a.gens.map((id) => ({ name: G.planets[id].name, done: G.planets[id].owner !== 'squids' })), meter: G.darkEnergy / 100, meterLabel: 'DARK ENERGY ACCUMULATION', color: F('squids').color, left: left.length };
      },
    },

    outbreak: {
      faction: 'bugs', weight: 1.1,
      can: () => !G.factions.bugs.shattered && humanFront('bugs').length >= 2,
      start(a) {
        const targets = humanFront('bugs');
        a.need = Math.min(4, Math.max(2, targets.length));
        a.defended = 0; a.failed = 0; a.ends = G.t + 110; a.launched = 0; a.nextLaunch = G.t;
        a.title = 'The ' + R.pick(DC.DIVISIONS.bugs).replace(/^the /, '') + ' Outbreak';
        a.cap = a.title;
        D.dispatch('MASSIVE TERMINID OUTBREAK', 'A Terminid swarm of unprecedented size, ' + a.title.replace('The ', 'the ').replace(' Outbreak', '') + ', is erupting from the nests. ' + G.factions.bugs.leader.title + ' ' + G.factions.bugs.leader.name + ' has been sighted at its heart. Defend against ' + a.need + ' attacks.', 'bad', { kind: 'arcStart', arc: a.title }, true);
      },
      tick(a, dt) {
        if (a.launched < a.need && G.t >= a.nextLaunch) {
          const p = S.launchAttack('bugs', { mult: 1.15, hours: R.r(34, 44) });
          if (p) { p.campaign.arc = a.id; a.launched++; }
          a.nextLaunch = G.t + R.r(3, 9);
          if (!p && G.t > a.start + 30) a.need = Math.max(a.defended + 1, a.launched);
        }
        if (a.defended >= a.need) {
          D.apply([{ t: 'morale', v: 8 }, { t: 'req', v: 260 }, { t: 'medals', v: 40 }, { t: 'mod', kind: 'aggro', v: 0.5, h: 36, faction: 'bugs', label: 'Swarm broken' }]);
          S.chronicle(a.title + ' was repelled.', 'triumph');
          D.dispatch('OUTBREAK CONTAINED', 'All ' + a.need + ' Terminid assaults have been repelled. The swarm retreats to its tunnels to lick whatever Terminids have instead of wounds.', 'triumph', { kind: 'arcWin', arc: a.title }, true);
          return endArc(a, true);
        }
        if (a.failed >= 2 || G.t > a.ends) {
          S.morale(-6);
          D.dispatch('OUTBREAK SPREADS', 'The Terminid outbreak could not be contained. Infestation has spread through the region.', 'bad', { kind: 'arcLoss', arc: a.title }, true);
          return endArc(a, false);
        }
      },
      onDefended(a, p, f) { if (f === 'bugs') a.defended++; },
      onFell(a, p, f) { if (f === 'bugs') a.failed++; },
      objective: (a) => ({ text: 'Defend against ' + a.need + ' attacks from the Terminids', segs: a.need, done: a.defended, failed: a.failed, color: F('bugs').color, ends: a.ends }),
    },

    gloom: {
      faction: 'bugs', weight: 0.9,
      can: () => !G.factions.bugs.shattered && G.planets.some((p) => p.owner === 'bugs' && p.front && !p.home && !p.special),
      start(a) {
        const hive = nearestToHumans(G.planets.filter((p) => p.owner === 'bugs' && !p.home && !p.special))[0];
        hive.special = 'hive';
        a.hive = hive.id; a.nextSpread = G.t + 30;
        if (!G.gloom.includes(hive.sector)) G.gloom.push(hive.sector);
        a.title = 'The Gloom';
        D.dispatch('THE GLOOM DESCENDS', 'A spore-choked haze is spreading from the Hive World ' + hive.name + '. Terminids within the Gloom regenerate at alarming rates. Liberating ' + hive.name + ' should starve it.', 'bad', { kind: 'arcStart', arc: 'The Gloom', hive: hive.name }, true);
      },
      tick(a) {
        const hive = G.planets[a.hive];
        if (hive.owner !== 'bugs') {
          G.gloom = [];
          hive.special = null;
          D.apply([{ t: 'morale', v: 8 }, { t: 'samples', v: [10, 8, 5] }, { t: 'medals', v: 40 }]);
          S.chronicle('The Hive World ' + hive.name + ' was purged. The Gloom has lifted.', 'triumph');
          D.dispatch('THE GLOOM LIFTS', 'With ' + hive.name + ' purged, the spore clouds are dispersing. Citizens may now breathe, subject to standard breathing permits.', 'triumph', { kind: 'arcWin', arc: 'The Gloom' }, true);
          return endArc(a, true);
        }
        if (G.t >= a.nextSpread) {
          a.nextSpread = G.t + (S.has('napalm') ? 52 : 34);
          const cand = G.sectors.filter((s) => !G.gloom.includes(s.id) && s.planets.some((id) => G.planets[id].owner === 'bugs'))
            .sort((s1, s2) => secDist(s1, G.sectors[hive.sector]) - secDist(s2, G.sectors[hive.sector]));
          if (cand[0]) {
            G.gloom.push(cand[0].id);
            D.dispatch('GLOOM EXPANDS', 'The Gloom has crept into the ' + cand[0].name + ' Sector.', 'bad');
            S.launchAttack('bugs', { mult: 1.1 });
          }
        }
      },
      objective(a) { const h = G.planets[a.hive]; return { text: 'Purge the Hive World ' + h.name, sub: [{ name: h.name, done: h.owner !== 'bugs' }], meter: h.lib / 100, meterLabel: 'GLOOM: ' + G.gloom.length + ' SECTOR' + (G.gloom.length === 1 ? '' : 'S'), color: F('bugs').color }; },
    },

    forge: {
      faction: 'bots', weight: 1,
      can: () => !G.factions.bots.shattered && !G.forge && G.planets.some((p) => p.owner === 'bots' && !p.home && !p.special),
      start(a) {
        const fp = nearestToHumans(G.planets.filter((p) => p.owner === 'bots' && !p.home && !p.special))[0];
        fp.special = 'forge';
        const division = R.pick(DC.DIVISIONS.bots);
        const weapon = R.pick(['Orbital Annihilator Cannon', 'Planet-Cracker Array', 'Dreadnought "Iron Verdict"', 'Siege Spire Omega']);
        G.forge = { planet: fp.id, progress: 0, weapon, shots: 0 };
        a.division = division; a.weapon = weapon; a.planet = fp.id;
        a.title = division.replace(/^the /, 'The ') + ' & the ' + weapon;
        S.addMod({ kind: 'attack', v: 1.35, h: 200, faction: 'bots', sector: fp.sector, label: division });
        S.addMod({ kind: 'regen', v: 1.3, h: 200, faction: 'bots', sector: fp.sector, label: division });
        D.dispatch('AUTOMATON SUPERWEAPON', 'Intelligence confirms ' + division + ' is guarding the Forge World ' + fp.name + ', where the ' + weapon + ' is under construction. ' + G.factions.bots.leader.title + ' ' + G.factions.bots.leader.name + ' intends to turn it on our worlds.', 'bad', { kind: 'arcStart', arc: a.title, forge: fp.name }, true);
      },
      tick(a, dt) {
        const fp = G.planets[a.planet];
        if (!G.forge) return endArc(a);
        if (fp.owner !== 'bots') {
          G.forge = null; fp.special = null;
          G.mods = G.mods.filter((m) => m.label !== a.division);
          D.apply([{ t: 'morale', v: 10 }, { t: 'req', v: 320 }, { t: 'medals', v: 60 }]);
          S.chronicle('The ' + a.weapon + ' was destroyed on ' + fp.name + '.', 'triumph');
          D.dispatch('SUPERWEAPON DESTROYED', 'The ' + a.weapon + ' lies in smoking ruins on ' + fp.name + '. ' + a.division.replace(/^the /, 'The ') + ' has been scrapped for parts.', 'triumph', { kind: 'arcWin', arc: a.title }, true);
          return endArc(a, true);
        }
        G.forge.progress += dt * 1.45 * (S.has('exo') ? 0.65 : 1);
        if (G.forge.progress >= 100) {
          G.forge.progress = 0; G.forge.shots++;
          const targets = G.planets.filter((p) => p.owner === 'human' && !p.destroyed && p.id !== 0).sort((p, q) => DC.dist(p, fp) - DC.dist(q, fp));
          const v = targets[Math.min(targets.length - 1, R.i(0, 2))];
          if (v) {
            v.defense = 0; v.garrison = 0;
            S.morale(-7);
            G.stats.kia += 2500;
            DC.emit('fx', { type: 'cannon', from: fp.id, to: v.id });
            if (!v.campaign) S.launchAttack('bots', { planet: v.id, mult: 1.7, hours: 30 });
            S.chronicle('The ' + a.weapon + ' fired on ' + v.name + '.', 'bad');
            D.dispatch('THE ' + a.weapon.toUpperCase() + ' HAS FIRED', 'A beam from ' + fp.name + ' has struck ' + v.name + ', obliterating its defenses. Automaton forces are landing in the wreckage.', 'bad', { kind: 'superweapon', target: v.name, weapon: a.weapon }, true);
          }
        }
      },
      objective(a) { const fp = G.planets[a.planet]; return { text: 'Destroy the ' + a.weapon + ' on ' + fp.name, sub: [{ name: fp.name, done: fp.owner !== 'bots' }], meter: G.forge ? G.forge.progress / 100 : 0, meterLabel: 'WEAPON CHARGE', color: F('bots').color }; },
    },

    evac: {
      faction: null, weight: 0.8,
      can: () => humanFront().filter((p) => p.ring >= 2 && !p.campaign).length > 0,
      start(a) {
        const p = R.pick(humanFront().filter((q) => q.ring >= 2 && !q.campaign));
        const f = DC.ENEMIES.find((x) => p.links.some((l) => G.planets[l].owner === x));
        p.special = 'evac';
        a.planet = p.id; a.faction = f; a.ends = G.t + 48; a.attackAt = G.t + R.r(4, 10);
        a.title = 'Evacuation of ' + p.name;
        D.dispatch('SEAF EVACUATION', 'Two million colonists and the SEAF 7th Division are evacuating ' + p.name + '. The ' + F(f).name + ' have noticed. Hold ' + p.name + ' for 48 hours.', 'bad', { kind: 'arcStart', arc: a.title }, true);
      },
      tick(a) {
        const p = G.planets[a.planet];
        if (p.owner !== 'human' || p.destroyed) {
          p.special = null;
          S.morale(-8); G.stats.kia += 4000;
          D.dispatch('EVACUATION FAILED', 'The last transports never left ' + p.name + '. The Ministry has declared a day of mandatory mourning, followed by a day of mandatory cheering.', 'bad', { kind: 'arcLoss', arc: a.title }, true);
          return endArc(a, false);
        }
        if (a.attackAt && G.t >= a.attackAt) {
          a.attackAt = null;
          if (!p.campaign) S.launchAttack(a.faction, { planet: p.id, mult: 1.45, hours: 40 });
        }
        if (G.t >= a.ends) {
          p.special = null;
          const others = R.shuffle(G.planets.filter((q) => q.owner === 'human' && !q.destroyed && q.id !== p.id)).slice(0, 3);
          D.apply([{ t: 'morale', v: 7 }, { t: 'req', v: 160 }, { t: 'medals', v: 30 }, ...others.map((q) => ({ t: 'garrison', planet: q.id, v: 1 }))]);
          S.chronicle('The evacuation of ' + p.name + ' succeeded.', 'triumph');
          D.dispatch('EVACUATION COMPLETE', 'Every transport cleared ' + p.name + '. The rescued SEAF veterans have been redeployed to ' + others.map((q) => q.name).join(', ') + '.', 'triumph', { kind: 'arcWin', arc: a.title }, true);
          return endArc(a, true);
        }
      },
      objective(a) { const p = G.planets[a.planet]; return { text: 'Hold ' + p.name + ' until the evacuation completes', sub: [{ name: p.name, done: false }], meter: DC.clamp(1 - (a.ends - G.t) / 48, 0, 1), meterLabel: 'EVACUATION', color: '#5fd4ff', ends: a.ends }; },
    },

    hero: {
      faction: null, weight: 0.7,
      can: () => !G.arcs.some((a) => a.type === 'hero') && S.campaigns().length > 0,
      start(a) {
        const h = { name: R.pick(DC.HERO_FIRST) + ' ' + R.pick(DC.HERO_LAST), nick: R.pick(DC.HERO_NICK), feats: 0, kills: 0, alive: true, since: G.t };
        G.heroes.push(h);
        a.hero = G.heroes.length - 1; a.nextFeat = G.t + R.r(8, 16); a.goal = R.i(3, 5);
        a.title = 'The Legend of ' + h.name;
        D.dispatch('A HERO EMERGES', 'Sergeant ' + h.name + ', known to the troops as ' + h.nick + ', single-handedly held a ridge against ' + R.pick(['400', '1,200', 'an uncountable number of']) + ' enemies today. The Ministry has commissioned a statue.', 'good', { kind: 'hero', hero: h.name + ' ' + h.nick }, true);
      },
      tick(a) {
        const h = G.heroes[a.hero];
        if (G.t < a.nextFeat) return;
        a.nextFeat = G.t + R.r(16, 30);
        const camps = S.campaigns().sort((p, q) => q.divers - p.divers);
        if (!camps.length) return;
        const p = camps[0];
        if (h.feats < a.goal) {
          h.feats++; h.kills += R.i(150, 900);
          const enemy = F(p.campaign ? p.campaign.faction : p.owner);
          if (p.owner !== 'human') p.lib = Math.min(99, p.lib + 3);
          else if (p.campaign) p.campaign.progress = Math.min(99, p.campaign.progress + 4);
          S.morale(2);
          D.dispatch(h.name.toUpperCase() + ' STRIKES AGAIN', h.nick + ' ' + h.name + ' ' + R.pick(['destroyed three ' + R.pick(enemy.units), 'called down an orbital strike on their own position and walked out of the crater', 'rescued an entire SEAF company', 'held an extraction zone alone for forty minutes', 'planted a flag on a ' + R.pick(enemy.units).replace(/s$/, '')]) + ' on ' + p.name + '. Confirmed kills: ' + DC.fmt(h.kills) + '.', 'good');
        } else {
          a.done = true;
          fireEvent({ title: 'The Last Stand of ' + h.name, ctx: { planet: p.id }, hero: true,
            body: h.nick + ' ' + h.name + ' is trapped on ' + p.name + ' beside a damaged Hellbomb. They request permission to detonate it manually. They will not survive, but the blast would cripple the enemy.',
            options: [
              { label: 'Grant permission. Make it count.', fx: p.owner !== 'human' ? [{ t: 'lib', planet: p.id, v: 25 }, { t: 'morale', v: 8 }, { t: 'medals', v: 30 }] : [{ t: 'garrison', planet: p.id, v: 2 }, { t: 'morale', v: 8 }, { t: 'medals', v: 30 }], heroFate: 'fallen' },
              { label: 'Deny. Extract them at any cost.', fx: [{ t: 'kia', v: 800 }, { t: 'mod', kind: 'eff', v: 1.06, h: 999, label: 'Trained by ' + h.name }, { t: 'morale', v: 3 }], heroFate: 'instructor' },
            ] });
          a.heroEvent = true;
          endArc(a, true, true);
        }
      },
      objective(a) { const h = G.heroes[a.hero]; return { text: h.nick + ' ' + h.name, sub: [], meter: h.feats / a.goal, meterLabel: 'LEGEND · ' + DC.fmt(h.kills) + ' KILLS', color: '#ffe14d' }; },
    },

    counter: {
      faction: null, weight: 0,
      can: () => false,
      start(a, f) {
        a.faction = f; a.ends = G.t + 48;
        a.title = F(f).adj + ' Counteroffensive';
        G.factions[f].budget = 3;
        S.addMod({ kind: 'aggro', v: 2, h: 48, faction: f, label: 'Counteroffensive' });
        S.addMod({ kind: 'regen', v: 1.35, h: 48, faction: f, label: 'Counteroffensive' });
        D.dispatch(F(f).short + ' COUNTEROFFENSIVE', 'Humiliated by recent defeats, ' + G.factions[f].leader.title + ' ' + G.factions[f].leader.name + ' has thrown the full weight of the ' + F(f).name + ' at our lines. Survive the next 48 hours.', 'bad', { kind: 'counter', faction: F(f).name }, true);
      },
      tick(a) {
        if (G.t >= a.ends) {
          S.morale(4);
          D.dispatch('COUNTEROFFENSIVE SPENT', 'The ' + F(a.faction).name + ' counteroffensive has run out of steam.', 'good');
          endArc(a, true);
        }
      },
      objective: (a) => ({ text: 'Survive the counteroffensive', sub: [], meter: DC.clamp(1 - (a.ends - G.t) / 48, 0, 1), meterLabel: 'ENEMY PRESSURE', color: F(a.faction).color, ends: a.ends }),
    },
  });

  function secDist(a, b) {
    const ca = { x: Math.cos((a.a0 + a.a1) / 2) * (a.r0 + a.r1) / 2, y: Math.sin((a.a0 + a.a1) / 2) * (a.r0 + a.r1) / 2 };
    const cb = { x: Math.cos((b.a0 + b.a1) / 2) * (b.r0 + b.r1) / 2, y: Math.sin((b.a0 + b.a1) / 2) * (b.r0 + b.r1) / 2 };
    return DC.dist(ca, cb);
  }

  function startArc(type, arg) {
    const d = G.director;
    if (!type) {
      const cands = Object.keys(ARCS).filter((k) => ARCS[k].weight > 0 && !G.arcs.some((a) => a.type === k) && (d.arcCooldown[k] || 0) <= G.t && ARCS[k].can());
      if (!cands.length) return false;
      // Favor the faction currently holding the most ground.
      const wts = cands.map((k) => ARCS[k].weight * (ARCS[k].faction ? 0.6 + S.count(ARCS[k].faction) / 15 : 1));
      let r = R.f() * wts.reduce((x, y) => x + y, 0);
      type = cands[cands.length - 1];
      for (let i = 0; i < cands.length; i++) { r -= wts[i]; if (r <= 0) { type = cands[i]; break; } }
    }
    const a = { id: DC.uid('arc'), type, start: G.t };
    G.arcs.push(a);
    ARCS[type].start(a, arg);
    S.chronicle('Story arc begins: ' + a.title + '.', 'arc');
    DC.emit('arcStart', a);
    return true;
  }
  function endArc(a, win, quiet) {
    G.arcs = G.arcs.filter((x) => x !== a);
    G.director.arcCooldown[a.type] = G.t + 90;
    if (!quiet) S.chronicle('Story arc ends: ' + a.title + (win ? ' (victory)' : win === false ? ' (defeat)' : '') + '.', 'arc');
    DC.emit('arcEnd', { arc: a, win });
  }
  D.objective = (a) => ARCS[a.type].objective(a);
  D.startArc = startArc;

  DC.on('defended', ({ planet, faction }) => { if (!G) return; G.arcs.forEach((a) => ARCS[a.type].onDefended && ARCS[a.type].onDefended(a, planet, faction)); });
  DC.on('fell', ({ planet, faction }) => { if (!G) return; G.arcs.forEach((a) => ARCS[a.type].onFell && ARCS[a.type].onFell(a, planet, faction)); });
  DC.on('resolved', ({ ev, opt }) => {
    if (!ev.hero || !G) return;
    const h = G.heroes[G.heroes.length - 1];
    h.alive = opt.heroFate !== 'fallen'; h.fate = opt.heroFate;
    if (!h.alive) {
      S.chronicle(h.nick + ' ' + h.name + ' detonated a Hellbomb by hand. They will be remembered.', 'triumph');
      D.dispatch('A HERO FALLS', h.nick + ' ' + h.name + ' gave their life on ' + G.planets[ev.ctx.planet].name + ', detonating a Hellbomb by hand. ' + DC.fmt(h.kills) + ' confirmed kills. Every Helldiver will salute this name.', 'triumph', { kind: 'heroDeath', hero: h.name + ' ' + h.nick }, true);
    } else {
      S.chronicle(h.nick + ' ' + h.name + ' was extracted and now trains the next generation.', 'good');
      D.dispatch('A HERO RETURNS', h.name + ' has been extracted and appointed Chief Instructor of the Helldiver Academy. Recruits report "a lot of yelling, but useful yelling".', 'good');
    }
  });
})();
