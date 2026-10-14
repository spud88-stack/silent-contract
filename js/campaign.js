// Freelancer-style meta game: syndicate campaigns, territories, alerted state, showdowns, merces, gear risk, mastery.
(function () {
  const SC = window.SC;
  const C = (SC.Campaign = {});
  const TIER_SIZES = [3, 4, 5, 6];
  const KEY = 'sc_save_v1';
  const fresh = () => ({
    merces: 600, xp: 0, prestige: 0,
    weapons: ['wire'], tools: { coin: 4, lockpick: 1, emetic: 1 },
    campaign: null, offers: null, shop: null, lastLoadout: [],
    stats: { missions: 0, success: 0, deaths: 0, campaignsWon: 0, campaignsLost: 0, kills: 0, talked: 0 },
  });
  C.data = fresh();
  C.load = function () {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) C.data = Object.assign(fresh(), s); } catch (e) { /* storage unavailable */ }
  };
  C.store = function () { try { localStorage.setItem(KEY, JSON.stringify(C.data)); } catch (e) { /* storage unavailable */ } };
  C.wipe = function () { C.data = fresh(); C.store(); };

  C.level = () => Math.floor(Math.sqrt(C.data.xp / 350)) + 1;
  C.levelProgress = () => { const l = C.level(), a = (l - 1) * (l - 1) * 350, b = l * l * 350; return (C.data.xp - a) / (b - a); };
  C.slots = () => 3 + (C.level() >= 3 ? 1 : 0) + (C.level() >= 6 ? 1 : 0);

  const rngNow = () => new SC.RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);

  C.offers = function () {
    if (!C.data.offers) {
      const r = rngNow();
      C.data.offers = r.take(SC.SYNDICATES, 3).map((s) => ({ key: s.key, type: s.name, blurb: s.blurb, themes: s.themes, name: r.pick(SC.SYN_NAMES) }));
      C.store();
    }
    return C.data.offers;
  };
  function genTier(camp, tier) {
    const r = rngNow(), out = [], themes = Object.keys(SC.THEMES);
    const usedPlaces = new Set();
    for (let i = 0; i < TIER_SIZES[tier]; i++) {
      const theme = r.chance(0.6) ? r.pick(camp.themes) : r.pick(themes);
      const T = SC.THEMES[theme];
      let name; let k = 0;
      do { name = r.pick(T.places); } while (usedPlaces.has(name) && k++ < 10);
      usedPlaces.add(name);
      const keys = Object.keys(SC.OBJECTIVES);
      out.push({
        id: tier + '-' + i, theme, seed: r.int(1, 2e9), name, region: r.pick(T.regions), status: 'open', alerted: false,
        targets: tier === 0 ? 1 : tier >= 2 && r.chance(0.6) ? 2 : r.int(1, 2), courier: r.chance(0.55),
        objectives: r.take(keys, 3), weather: r.chance(0.35) ? 'rain' : null,
        targetTypes: [0, 1].map(() => r.pick(tier === 0 ? ['socialite', 'smoker', 'workaholic', 'insider'] : Object.keys(SC.TARGET_TYPES))),
      });
    }
    for (const t of out) if (!t.courier) t.objectives = t.objectives.map((k) => (k === 'courier' ? 'nobodies' : k)).filter((k, i, a) => a.indexOf(k) === i);
    return out;
  }
  C.startCampaign = function (offer) {
    C.data.campaign = { syn: offer, tier: 0, territories: null, log: [] };
    C.data.campaign.territories = genTier(offer, 0);
    C.data.offers = null;
    C.store();
  };
  C.open = () => (C.data.campaign ? C.data.campaign.territories.filter((t) => t.status === 'open') : []);
  C.isShowdown = (t) => t.status === 'open' && C.open().length === 1;
  C.mission = function (t) {
    const sd = C.isShowdown(t);
    let objectives = t.objectives.slice();
    if (sd) objectives = objectives.filter((k) => k !== 'courier' && k !== 'hidden');
    return { targetTypes: t.targetTypes, weather: t.weather, seed: t.seed, theme: t.theme, name: t.name, region: t.region, targets: t.targets, showdown: sd, alerted: t.alerted, courier: t.courier && !sd, objectives, tier: C.data.campaign.tier, territory: t.id };
  };

  // ---------------------------------------------------------------- gear
  C.stashList = function () {
    const out = C.data.weapons.map((id) => ({ id, n: 1, weapon: true }));
    for (const id in C.data.tools) if (C.data.tools[id] > 0) out.push({ id, n: C.data.tools[id] });
    return out;
  };
  // removes the chosen loadout from the stash (it is now at risk) and returns in-mission inventory entries
  C.takeLoadout = function (ids) {
    const inv = [];
    for (const id of ids) {
      const def = SC.ITEMS[id];
      if (C.data.weapons.includes(id)) inv.push({ id, n: def.gun ? def.ammo : undefined });
      else if (C.data.tools[id] > 0) { inv.push({ id, n: def.stack ? C.data.tools[id] : undefined }); C.data.tools[id] = def.stack ? 0 : C.data.tools[id] - 1; }
    }
    C.data.lastLoadout = ids.slice();
    C.store();
    return inv;
  };
  C.shop = function () {
    if (!C.data.shop) {
      const r = rngNow(), lvl = C.level();
      const ids = Object.keys(SC.ITEMS).filter((id) => SC.ITEMS[id].price && (SC.ITEMS[id].rarity !== 'epic' || lvl >= 2));
      C.data.shop = r.take(ids, 5).map((id) => ({ id, price: Math.round(SC.ITEMS[id].price * r.range(0.85, 1.2) / 10) * 10, sold: false }));
      C.store();
    }
    return C.data.shop;
  };
  C.buy = function (entry) {
    const def = SC.ITEMS[entry.id];
    if (entry.sold || C.data.merces < entry.price) return false;
    if (def.persist && !def.consumable) { if (C.data.weapons.includes(entry.id)) return false; C.data.weapons.push(entry.id); }
    else C.data.tools[entry.id] = (C.data.tools[entry.id] || 0) + (entry.id === 'coin' ? 3 : 1);
    C.data.merces -= entry.price;
    if (!(entry.id === 'coin' || def.consumable)) entry.sold = true;
    C.store();
    return true;
  };

  // ---------------------------------------------------------------- results
  C.resolve = function (G, loadoutIds) {
    const D = C.data, m = G.mission, camp = D.campaign, s = G.stats, out = { lines: [], gained: [], lost: [], success: G.over.success, reason: G.over.reason };
    const terr = camp && camp.territories.find((t) => t.id === m.territory);
    D.stats.missions++;
    const died = !G.over.success && !G.over.aborted;
    out.rating = !G.over.success ? null
      : SC.OBJECTIVES.silent.test(s) && s.kos === 0 && s.disguiseChanges === 0 ? 'GHOST'
        : SC.OBJECTIVES.silent.test(s) ? 'SILENT ASSASSIN'
          : !s.compromised && s.nonTargetKills === 0 ? 'PROFESSIONAL'
            : s.nonTargetKills > 5 ? 'MASSACRE' : 'MESSY';
    const brought = loadoutIds.filter((id) => D.weapons.includes(id));
    if (G.over.success) {
      D.stats.success++;
      const base = (m.showdown ? 900 : 450) + m.tier * 220 + (m.alerted ? 250 : 0);
      out.lines.push({ label: m.showdown ? 'Showdown contract' : 'Contract fee', v: base });
      let earned = base, xp = 250 + m.tier * 60;
      for (const k of m.objectives) {
        const o = SC.OBJECTIVES[k], ok = o.test(s);
        out.lines.push({ label: o.name, v: ok ? o.pay : 0, ok, desc: o.desc });
        if (ok) { earned += o.pay; xp += 90; }
      }
      if (G.loot) { out.lines.push({ label: 'Loot (safe / courier)', v: G.loot }); earned += G.loot; }
      D.merces += earned; D.xp += xp; out.earned = earned; out.xp = xp;
      // weapons you walk out with are yours
      for (const it of G.P.inv) {
        const def = SC.ITEMS[it.id];
        if (def.persist && !def.consumable && !D.weapons.includes(it.id)) { D.weapons.push(it.id); out.gained.push(it.id); }
        else if (def.consumable && !def.mission) { D.tools[it.id] = (D.tools[it.id] || 0) + (it.n || 1); }
      }
      if (terr) terr.status = 'done';
      if (m.showdown) {
        camp.tier++;
        if (camp.tier >= TIER_SIZES.length) {
          const bonus = 5000; D.merces += bonus; D.xp += 2000; D.prestige++; D.stats.campaignsWon++;
          out.campaign = 'won'; out.lines.push({ label: 'Syndicate destroyed', v: bonus }); D.campaign = null;
        } else { camp.territories = genTier(camp.syn, camp.tier); out.campaign = 'tier'; const b = 600 * camp.tier; D.merces += b; out.lines.push({ label: 'Syndicate leader removed', v: b }); }
      }
    } else {
      if (died) {
        D.stats.deaths++;
        for (const id of brought) { D.weapons = D.weapons.filter((w) => w !== id); out.lost.push(id); }
        const lostM = Math.floor(D.merces / 2); D.merces -= lostM; out.lostMerces = lostM;
        for (const it of G.P.inv) if (SC.ITEMS[it.id].consumable && loadoutIds.includes(it.id)) out.lost.push(it.id);
      } else {
        for (const it of G.P.inv) { const def = SC.ITEMS[it.id]; if (def.consumable && !def.mission) D.tools[it.id] = (D.tools[it.id] || 0) + (it.n || 1); }
      }
      if (D.weapons.length === 0) D.weapons.push('wire');
      if (terr) {
        const fatal = terr.alerted || m.showdown;
        terr.status = 'failed';
        if (fatal) { out.campaign = 'lost'; D.campaign = null; D.stats.campaignsLost++; }
        else {
          for (const t of camp.territories) if (t.status === 'open') t.alerted = true;
          if (!camp.territories.some((t) => t.status === 'open')) camp.territories = genTier(camp.syn, camp.tier).map((t) => Object.assign(t, { alerted: true }));
          out.campaign = 'alerted';
        }
      }
    }
    D.stats.kills += s.nonTargetKills; D.stats.talked += s.talked;
    D.shop = null;
    C.store();
    return out;
  };
  C.load();
})();
