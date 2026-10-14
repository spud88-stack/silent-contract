// HUD panels, planet card, command bar, modals (events, research, war record, dispatches, major orders, settings).
(function () {
  const DC = window.DC;
  const S = DC.Sim;
  const D = DC.Director;
  const $ = DC.$;
  const esc = DC.esc;
  const U = (DC.UI = { sel: null, armed: null, modal: null, speed: 1 });
  const FC = (f) => (DC.FACTIONS[f] ? DC.FACTIONS[f].color : '#5fd4ff');
  const cache = new WeakMap();
  const patch = (el, html) => { if (cache.get(el) !== html) { cache.set(el, html); el.innerHTML = html; } };

  const ICONS = {
    orbital: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2v9M8 4l4 7 4-7" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="17" r="4" fill="currentColor"/><path d="M4 21h16" stroke="currentColor" stroke-width="2"/></svg>',
    seaf: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    fortify: '<svg viewBox="0 0 24 24" class="ico"><path d="M3 21V9l3-2v3l3-2v3l3-2v3l3-2v3l3-2v3l3-2v12z" fill="currentColor" opacity=".9"/></svg>',
    fleet: '<svg viewBox="0 0 24 24" class="ico"><path d="M21 12L5 6l3 6-3 6z" fill="currentColor"/><path d="M2 12h4" stroke="currentColor" stroke-width="2"/></svg>',
    priority: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 22V3" stroke="currentColor" stroke-width="2"/><path d="M7 4h12l-3 4 3 4H7z" fill="currentColor"/></svg>',
    propaganda: '<svg viewBox="0 0 24 24" class="ico"><path d="M3 10v4h4l7 5V5L7 10z" fill="currentColor"/><path d="M17 8c2 2 2 6 0 8M19.5 5.5c3.5 3.5 3.5 9.5 0 13" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    hellbomb: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="13" r="7" fill="currentColor"/><path d="M12 6V2M15 3l-3 3-3-3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="13" r="2.5" fill="#070c14"/></svg>',
    mo: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/></svg>',
  };

  // ---------- init ----------
  U.init = function () {
    const cmd = $('#cmd');
    cmd.innerHTML = '<button class="act mo-btn" id="act-mo" title="Issue a Major Order (M)">' + '<span class="k">M</span>' + ICONS.mo + '<span class="nm">Major Order</span><span class="cost">FREE</span></button>' +
      DC.ACTIONS.map((a) => '<button class="act" id="act-' + a.id + '" data-act="' + a.id + '"><span class="k">' + a.key + '</span>' + ICONS[a.icon] + '<span class="nm">' + esc(a.name) + '</span><span class="cost"></span><span class="cdv"></span></button>').join('');
    cmd.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'act-mo') return U.openMO();
      U.trigger(b.dataset.act);
    });
    cmd.addEventListener('pointerover', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = DC.ACTIONS.find((x) => x.id === b.dataset.act);
      DC.Render.fleetRangeShown = !!a.fleet || a.id === 'fleet';
      showTip(e, '<b>' + esc(a.name) + '</b>' + esc(a.desc) + '<div class="dim" style="margin-top:4px">' + (a.target === 'none' ? 'Takes effect immediately.' : 'Target: ' + ({ enemy: 'enemy world', friendly: 'Super Earth world', any: 'any world', campaign: 'campaign world' })[a.target]) + '</div>', b);
    });
    cmd.addEventListener('pointerout', () => { DC.Render.fleetRangeShown = !!(U.armed && (U.armed.fleet || U.armed.id === 'fleet')); hideTip(); });
    $('#btn-research').onclick = () => U.openResearch();
    $('#btn-stats').onclick = () => U.openStats();
    $('#btn-dispatch').onclick = () => U.openDispatches();
    $('#btn-menu').onclick = () => U.openMenu();
    document.querySelectorAll('.speed button').forEach((b) => (b.onclick = () => U.setSpeed(+b.dataset.speed)));
    $('#mo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.k === 'issue') U.openMO(); if (b.dataset.k === 'rescind') U.rescind(); });
    $('#card').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.k === 'close') return U.select(null);
      if (b.dataset.k === 'mo') return U.quickMO(b.dataset.type, +b.dataset.id);
      if (b.dataset.act) U.trigger(b.dataset.act, S.get().planets[U.sel]);
    });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && U.modal !== 'event' && U.modal !== 'over') U.close(); });
    DC.on('dispatch', (d) => feed());
    DC.on('liberated', ({ planet, faction }) => { if (planet.home || planet.ring <= 1 || isMOTarget(planet)) toast(planet.name + ' liberated', planet.home ? 'The ' + DC.FACTIONS[faction].name + ' homeworld has fallen!' : 'Liberty restored.', planet.home ? 'triumph' : 'good'); });
    DC.on('fell', ({ planet, faction }) => toast(planet.name + ' has fallen', 'Lost to the ' + DC.FACTIONS[faction].name + '.', 'bad'));
    DC.on('attack', ({ planet, faction }) => { if (planet.ring <= 1 || planet.special) toast('Invasion: ' + planet.name, DC.FACTIONS[faction].adj + ' forces have begun an assault. Defense fails in ' + DC.fmtDur(planet.campaign.ends - S.get().t) + '.', 'bad'); });
    DC.on('moEnded', ({ mo, win }) => toast(win ? 'Major Order complete' : 'Major Order failed', mo.title, win ? 'triumph' : 'bad'));
    DC.on('arcStart', (a) => toast('New threat: ' + a.title, 'See the crisis panel on the right.', 'bad'));
    DC.on('arcEnd', ({ arc, win }) => { if (win != null && arc.type !== 'hero') toast(arc.title, win ? 'Crisis resolved.' : 'Crisis lost.', win ? 'triumph' : 'bad'); });
    DC.on('researchDone', (r) => toast('Research complete', r.name, 'good'));
    DC.on('fleetArrived', () => toast('Fleet in position', 'Super Destroyers have arrived on station.', 'good'));
    DC.on('event', () => U.showNextEvent());
    DC.on('gameOver', (o) => setTimeout(() => U.openGameOver(o), 900));
  };
  const isMOTarget = (p) => { const mo = S.get().mo; return mo && ((mo.target === p.id) || (mo.type === 'sector' && mo.sector === p.sector)); };

  // ---------- toasts / tooltips ----------
  function toast(title, body, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<b>' + esc(title) + '</b>' + esc(body || '');
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }
  U.toast = toast;
  function showTip(e, html, anchor) {
    const t = $('#tip');
    t.innerHTML = html; t.hidden = false;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      t.style.left = DC.clamp(r.left + r.width / 2 - t.offsetWidth / 2, 8, innerWidth - t.offsetWidth - 8) + 'px';
      t.style.top = (r.top - t.offsetHeight - 8) + 'px';
    } else {
      t.style.left = Math.min(innerWidth - t.offsetWidth - 8, e.clientX + 16) + 'px';
      t.style.top = Math.min(innerHeight - t.offsetHeight - 8, e.clientY + 16) + 'px';
    }
  }
  function hideTip() { $('#tip').hidden = true; }
  U.planetTip = function (e, p) {
    if (!p) return hideTip();
    const G = S.get();
    if (p.destroyed) return showTip(e, '<b>' + esc(p.name) + '</b><span class="dim">Destroyed world</span>');
    let html = '<b style="color:' + (p.owner === 'human' ? '#e9f4ff' : FC(p.owner)) + '">' + esc(p.name) + '</b>';
    html += '<span class="dim">' + esc(G.sectors[p.sector].name) + ' Sector · ' + (p.owner === 'human' ? 'Super Earth' : DC.FACTIONS[p.owner].name) + '</span>';
    if (p.campaign) html += '<div>Under attack · ' + Math.round(p.campaign.progress) + '% defended · ' + DC.fmtDur(p.campaign.ends - G.t) + ' left</div>';
    else if (p.owner !== 'human') html += '<div>' + DC.pct(p.lib) + ' liberated' + (p.front ? '' : ' · <span class="dim">no supply line</span>') + '</div>';
    if (p.divers > 50) html += '<div style="color:var(--yellow)">▲ ' + DC.fmt(p.divers) + ' Helldivers</div>';
    if (U.armed) { const c = S.canAct(U.armed, p); html += '<div style="margin-top:4px;color:' + (c.ok ? 'var(--good)' : 'var(--bad)') + '">' + (c.ok ? 'Click to ' + esc(U.armed.name) : esc(c.why)) + '</div>'; }
    showTip(e, html);
  };
  U.hideTip = hideTip;

  // ---------- actions ----------
  U.trigger = function (id, planet) {
    const a = DC.ACTIONS.find((x) => x.id === id);
    if (!a) return;
    const G = S.get();
    const p = planet || (U.sel != null ? G.planets[U.sel] : null);
    const c = S.canAct(a, p);
    if (c.ok) { S.act(a, p); U.disarm(); U.refresh(); return; }
    if (c.needTarget || (a.target !== 'none' && !p)) return U.arm(a);
    toast(a.name, c.why, 'bad');
    DC.Audio.bad && DC.Audio.click();
  };
  U.arm = function (a) {
    U.armed = a;
    DC.Render.targetFilter = (p) => !p.destroyed && validTarget(a, p);
    DC.Render.fleetRangeShown = !!a.fleet || a.id === 'fleet';
    document.querySelectorAll('.act').forEach((b) => b.classList.toggle('armed', b.dataset.act === a.id));
    $('#map').classList.add('targeting');
    const h = $('#target-hint');
    h.hidden = false;
    h.textContent = 'SELECT TARGET: ' + a.name.toUpperCase() + ' · ESC TO CANCEL';
  };
  U.disarm = function () {
    U.armed = null; DC.Render.targetFilter = null; DC.Render.fleetRangeShown = false;
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('armed'));
    $('#map').classList.remove('targeting');
    $('#target-hint').hidden = true;
  };
  function validTarget(a, p) {
    if (a.target === 'enemy') return p.owner !== 'human' && (!a.fleet || S.inFleetRange(p));
    if (a.target === 'friendly') return p.owner === 'human';
    if (a.target === 'campaign') return S.isCampaign(p);
    return true;
  }
  U.clickPlanet = function (p) {
    if (U.armed) {
      const a = U.armed;
      const r = S.act(a, p);
      if (!r.ok) { toast(a.name, r.why, 'bad'); return; }
      U.disarm();
      U.select(p.id);
      return;
    }
    U.select(p ? p.id : null);
  };
  U.select = function (id) {
    U.sel = id;
    DC.Render.selected = id;
    U.refresh();
  };

  U.setSpeed = function (s) {
    U.speed = s;
    document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  };

  // ---------- periodic refresh ----------
  U.refresh = function () {
    const G = S.get();
    if (!G) return;
    region(G); topCenter(G); resources(G); moPanel(G); arcPanels(G); card(G); cmdBar(G);
    const unread = G.dispatches.filter((d) => d.unread).length;
    $('#dispatch-count').textContent = unread;
  };

  function region(G) {
    let html;
    const p = U.sel != null ? G.planets[U.sel] : null;
    if (p) {
      const s = G.sectors[p.sector];
      const o = DC.Render.sectorOwner(G, s);
      const lib = s.planets.reduce((n, id) => { const q = G.planets[id]; return q.destroyed ? n : n + (q.owner === 'human' ? 1 : q.lib / 100); }, 0) / Math.max(1, o.n);
      $('#tl .crest').className = 'crest ' + (o.share > 0 ? o.owner : '');
      patch($('#region-name'), esc(s.name) + ' Sector');
      $('#region-name').style.color = o.share > 0 ? FC(o.owner) : '';
      patch($('#region-sub'), o.share > 0 ? esc(DC.FACTIONS[o.owner].name) + (o.share >= 0.6 ? ' Control' : ' Presence') : 'Super Earth Control');
      $('#region-bar').style.width = lib * 100 + '%';
      $('#region-bar-enemy').style.cssText = 'width:' + (1 - lib) * 100 + '%;background:' + (o.share > 0 ? FC(o.owner) : 'transparent');
      patch($('#region-pct'), (lib * 100).toFixed(4) + '% LIBERATED');
      const camps = s.planets.map((id) => G.planets[id]).filter(S.isCampaign);
      const dv = camps.reduce((n, q) => n + q.divers, 0);
      html = stat('Helldivers Active', DC.fmt(dv)) + stat('Worlds', o.n + ' · ' + o.cnt.human + ' free') + stat('Ring', ['Core', 'Inner', 'Middle', 'Outer'][s.ring]);
    } else {
      $('#tl .crest').className = 'crest';
      patch($('#region-name'), 'Galactic War');
      $('#region-name').style.color = '';
      const rk = S.rank();
      patch($('#region-sub'), esc(G.commander) + ' · ' + esc(rk.title));
      const tot = S.alive().length, free = S.count('human');
      $('#region-bar').style.width = (free / tot) * 100 + '%';
      $('#region-bar-enemy').style.cssText = 'width:' + (1 - free / tot) * 100 + '%;background:linear-gradient(90deg,' + FC('bots') + ',' + FC('bugs') + ',' + FC('squids') + ')';
      patch($('#region-pct'), ((free / tot) * 100).toFixed(4) + '% OF THE GALAXY FREE');
      html = stat('Helldivers Active', DC.fmt(G.divers)) + stat('Enemies Killed', DC.fmt(G.stats.kills)) + stat('Helldivers KIA', DC.fmt(G.stats.kia)) + stat('Bullets Fired', DC.fmt(G.stats.bullets));
    }
    patch($('#warstats'), html);
  }
  const stat = (k, v) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>';

  function topCenter(G) {
    $('#clock').textContent = DC.fmtClock(G.t);
    const d = G.director;
    const ph = D.PHASES[d.phase];
    const pe = $('#dir-phase');
    pe.textContent = ph.label; pe.className = 'dphase ' + d.phase;
    $('#dir-fill').style.width = d.tension + '%';
    $('#dir-target').style.left = DC.clamp(d.target, 0, 100) + '%';
    $('#dir-intent').textContent = d.intent;
    const am = $('#arc-meter');
    if (G.singularity) {
      am.hidden = false;
      patch(am, '<div class="lbl" style="color:' + FC('squids') + '">DARK ENERGY ACCUMULATION · ' + Math.floor(G.darkEnergy) + '%</div><div class="bar" style="color:' + FC('squids') + '"><i style="width:' + G.darkEnergy + '%"></i></div><div class="dim" style="font-size:12px">The singularity consumes a world when the meter fills.</div>');
    } else if (G.forge) {
      am.hidden = false;
      patch(am, '<div class="lbl" style="color:' + FC('bots') + '">' + esc(G.forge.weapon.toUpperCase()) + ' · ' + Math.floor(G.forge.progress) + '%</div><div class="bar" style="color:' + FC('bots') + '"><i style="width:' + G.forge.progress + '%"></i></div>');
    } else am.hidden = true;
  }

  function resources(G) {
    const m = G.res.morale;
    patch($('#resources'),
      '<div><div class="k">REQUISITION</div><div class="v">' + DC.fmt(G.res.req) + ' R</div></div>' +
      '<div><div class="k">MEDALS</div><div class="v" style="color:var(--yellow)">' + DC.fmt(G.res.medals) + '</div></div>' +
      '<div class="full"><div class="k" style="display:flex;justify-content:space-between"><span>PUBLIC MORALE</span><span>' + Math.round(m) + ' / 100</span></div><div class="morale ' + (m < 25 ? 'low' : '') + '"><i style="width:' + m + '%"></i></div></div>' +
      '<div class="full samples"><span class="k">SAMPLES</span><span class="sm c" title="Common samples">' + Math.floor(G.res.samples[0]) + '</span><span class="sm r" title="Rare samples">' + Math.floor(G.res.samples[1]) + '</span><span class="sm s" title="Super samples">' + Math.floor(G.res.samples[2]) + '</span>' +
      (G.research.current ? '<span class="k" style="margin-left:auto;color:var(--yellow)">R&amp;D ' + Math.floor(((G.t - G.research.current.start) / (G.research.current.ends - G.research.current.start)) * 100) + '%</span>' : '<span class="k" style="margin-left:auto">R&amp;D IDLE</span>') + '</div>');
  }

  function moPanel(G) {
    const el = $('#mo');
    const mo = G.mo;
    if (!mo) {
      const cd = Math.max(0, G.moCooldownUntil - G.t);
      patch(el, '<div class="head"><h2>MAJOR ORDER</h2></div><p>No active order. Helldivers are choosing their own fronts.</p>' +
        '<div class="reward"><button class="btn" data-k="issue" ' + (cd > 0 ? 'disabled' : '') + '>' + (cd > 0 ? 'NEXT ORDER IN ' + DC.fmtDur(cd) : 'ISSUE MAJOR ORDER') + '</button></div>');
      return;
    }
    const prog = S.moProgress();
    patch(el, '<div class="head"><span class="ends">ENDS IN:<b>' + DC.fmtDur(mo.ends - G.t) + '</b></span></div><div class="head"><h2>MAJOR ORDER</h2></div>' +
      '<p>' + esc(mo.text) + '</p><div class="bar"><i style="width:' + prog * 100 + '%"></i></div>' +
      '<div class="reward"><button class="btn ghost" data-k="rescind" style="margin-right:auto;padding:4px 8px;font-size:11px">RESCIND</button><span>REWARD<br>' + mo.reward + ' R · +' + mo.morale + ' MORALE</span><span class="medal">' + mo.medals + '</span></div>');
  }

  function arcPanels(G) {
    patch($('#arcs'), G.arcs.map((a) => {
      const o = D.objective(a);
      let h = '<div class="hud arc" style="--arc:' + o.color + '"><div class="t">' + (a.type === 'hero' ? 'HERO OF SUPER EARTH' : 'CRISIS') + (o.ends ? ' · ' + DC.fmtDur(o.ends - G.t) : '') + '</div><h3>' + esc(a.title) + '</h3><div class="obj">' + esc(o.text) + '</div>';
      if (o.segs) h += '<div class="segs">' + Array.from({ length: o.segs }, (_, i) => '<i class="' + (i < o.done ? 'on' : i >= o.segs - o.failed ? 'bad' : '') + '"></i>').join('') + '</div>';
      if (o.sub && o.sub.length) h += '<div class="checks">' + o.sub.map((s) => '<span class="' + (s.done ? 'done' : '') + '">' + esc(s.name) + '</span>').join('') + '</div>';
      if (o.meter != null) h += '<div class="ml"><span>' + esc(o.meterLabel || '') + '</span><span>' + Math.floor(o.meter * 100) + '%</span></div><div class="meter"><i style="width:' + DC.clamp(o.meter, 0, 1) * 100 + '%"></i></div>';
      return h + '</div>';
    }).join(''));
  }

  // ---------- planet card ----------
  let cardFor = null;
  function card(G) {
    const el = $('#card');
    if (U.sel == null) { el.hidden = true; cardFor = null; return; }
    const p = G.planets[U.sel];
    el.hidden = false;
    if (cardFor !== p.id + p.owner + p.destroyed) {
      cardFor = p.id + p.owner + p.destroyed;
      el.innerHTML = '<div class="banner"><canvas width="300" height="70"></canvas><h2></h2><button class="close" data-k="close" aria-label="Close">✕</button></div><div class="dyn"></div><div class="card-actions"></div>';
      paintBanner(el.querySelector('canvas'), p);
      el.querySelector('h2').textContent = p.name;
      el.style.borderColor = p.owner === 'human' ? 'var(--yellow)' : FC(p.owner);
    }
    const dyn = el.querySelector('.dyn');
    let h = '';
    if (p.destroyed) {
      h = '<div class="desc">Nothing remains of ' + esc(p.name) + ' but debris and a lingering hum of Dark Energy.</div>';
      patch(dyn, h); patch(el.querySelector('.card-actions'), ''); return;
    }
    h += '<div class="row"><span class="divers">▲ ' + DC.fmt(p.divers) + '</span><span class="haz">' + p.hazards.map((z) => '<span>' + esc(z) + '</span>').join('') + '</span></div>';
    if (p.campaign) {
      const c = p.campaign;
      h += '<div class="lvl" style="color:' + FC(c.faction) + '">Enemy invasion level: ' + c.level + '</div>';
      h += '<div class="pbar" style="background:' + FC(c.faction) + '"><i style="width:' + c.progress + '%"></i></div>';
      const r = S.defRate(p);
      h += '<div class="rate"><span>' + Math.round(c.progress) + '% defended</span><span style="color:' + (r >= 0 ? 'var(--good)' : 'var(--bad)') + '">' + (r >= 0 ? '+' : '') + r.toFixed(2) + '%/h</span></div>';
      h += '<div class="rate"><span>Planetary defense failure in</span><b style="color:var(--ink)">' + DC.fmtDur(c.ends - G.t) + '</b></div>';
      h += '<div class="camp" style="background:' + DC.Render.hexA(FC(c.faction), 0.18) + ';color:' + FC(c.faction) + '">DEFENSE CAMPAIGN</div>';
    } else if (p.owner !== 'human') {
      h += '<div class="lvl" style="color:' + FC(p.owner) + '">' + esc(DC.FACTIONS[p.owner].name) + ' control' + (p.home ? ' · Homeworld' : '') + '</div>';
      h += '<div class="pbar" style="background:' + FC(p.owner) + '"><i style="width:' + p.lib + '%"></i></div>';
      if (p.front) {
        const r = S.libRate(p);
        h += '<div class="rate"><span>' + DC.pct(p.lib, 3) + ' liberated</span><span style="color:' + (r >= 0 ? 'var(--good)' : 'var(--bad)') + '">' + (r >= 0 ? '+' : '') + r.toFixed(2) + '%/h</span></div>';
        h += '<div class="rate"><span>Enemy resistance</span><span>-' + S.regen(p).toFixed(2) + '%/h</span></div>';
        h += '<div class="camp" style="background:rgba(95,212,255,.12);color:var(--cyan)">LIBERATION CAMPAIGN</div>';
      } else h += '<div class="rate"><span>' + DC.pct(p.lib, 1) + ' liberated</span><span>No supply line</span></div>';
    } else {
      h += '<div class="lvl" style="color:var(--cyan)">Super Earth control' + (p.id === 0 ? ' · Capital' : '') + '</div>';
    }
    const special = { darkEnergy: 'Dark Energy Generator', forge: 'Forge World', hive: 'Hive World', evac: 'Evacuation in progress' }[p.special];
    if (special) h += '<div class="lvl" style="color:var(--yellow)">◆ ' + special + '</div>';
    h += '<div class="desc">' + esc(p.desc) + '</div>';
    h += '<div class="facts"><span>Sector <b>' + esc(G.sectors[p.sector].name) + '</b></span><span>Biome <b>' + esc(p.id === 0 ? 'Paradise' : DC.BIOMES[p.biome].name) + '</b></span>' +
      (p.owner === 'human' ? '<span>Defenses <b>' + p.defense + ' / 4</b></span><span>SEAF <b>' + p.garrison + ' bn</b></span><span>Income <b>' + (p.res * 0.55).toFixed(1) + ' R/h</b></span>' : '<span>Toughness <b>×' + p.hp.toFixed(1) + '</b></span>') +
      '<span>Fleet <b>' + (S.inFleetRange(p) ? 'in range' : 'out of range') + '</b></span></div>';
    const mods = G.mods.filter((m) => m.planet === p.id || (m.sector === p.sector && (!m.faction || m.faction === p.owner || (p.campaign && p.campaign.faction === m.faction))));
    if (G.gloom.includes(p.sector) && p.owner === 'bugs') mods.push({ label: 'Gloom: enemy regenerates faster', until: null });
    if (mods.length) h += '<div class="mods">' + mods.map((m) => '<span>◆ ' + esc(m.label || m.kind) + (m.until ? ' · ' + DC.fmtDur(m.until - G.t) : '') + '</span>').join('') + '</div>';
    patch(dyn, h);
    // contextual actions
    let acts = '';
    const btn = (id, label) => { const a = DC.ACTIONS.find((x) => x.id === id); const c = S.canAct(a, p); return '<button class="btn ' + (c.ok ? '' : 'ghost') + '" data-act="' + id + '" title="' + esc(c.ok ? a.desc : c.why) + '">' + label + '</button>'; };
    if (p.owner !== 'human') {
      if (p.front && !G.mo && G.t >= G.moCooldownUntil) acts += '<button class="btn" data-k="mo" data-type="liberate" data-id="' + p.id + '">MAJOR ORDER: LIBERATE</button>';
      if (p.front) acts += btn('priority', p.priority ? 'UNFLAG' : 'FLAG PRIORITY');
      acts += btn('bombard', 'BOMBARD');
      if (S.has('hellbomb')) acts += btn('hellbomb', 'HELLBOMB');
    } else {
      if (p.campaign && !G.mo && G.t >= G.moCooldownUntil) acts += '<button class="btn" data-k="mo" data-type="defend" data-id="' + p.id + '">MAJOR ORDER: DEFEND</button>';
      if (p.campaign) acts += btn('priority', p.priority ? 'UNFLAG' : 'FLAG PRIORITY');
      acts += btn('seaf', 'SEAF +1') + btn('fortify', 'FORTIFY');
    }
    acts += btn('fleet', 'MOVE FLEET HERE');
    patch(el.querySelector('.card-actions'), acts);
  }
  function paintBanner(cv, p) {
    const x = cv.getContext('2d');
    const st = DC.Render.strip(p);
    x.drawImage(st, 0, 8, st.height * 2, st.height - 16, 0, 0, 300, 70);
    const g = x.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(0.55, 'rgba(7,12,20,0.25)'); g.addColorStop(1, 'rgba(7,12,20,0.9)');
    x.fillStyle = g; x.fillRect(0, 0, 300, 70);
  }

  // ---------- command bar ----------
  function cmdBar(G) {
    const sel = U.sel != null ? G.planets[U.sel] : null;
    DC.ACTIONS.forEach((a) => {
      const b = $('#act-' + a.id);
      const locked = a.needs && !S.has(a.needs);
      b.hidden = !!locked;
      const cd = S.cooldown(a.id);
      const cost = S.actionCost(a);
      b.querySelector('.cost').textContent = cost ? cost + ' R' : 'FREE';
      b.querySelector('.cost').style.color = G.res.req < cost ? 'var(--bad)' : '';
      const cdv = b.querySelector('.cdv');
      const full = a.id === 'propaganda' && S.has('ministry') ? 20 : a.cd;
      cdv.style.setProperty('--cd', cd > 0 ? Math.max(30, (cd / full) * 100) + '%' : '0%');
      cdv.textContent = cd > 0 ? DC.fmtDur(cd) : '';
      b.disabled = cd > 0 || G.res.req < cost;
      b.title = sel ? (S.canAct(a, sel).ok ? 'Use on ' + sel.name : S.canAct(a, sel).why) : '';
    });
    const mb = $('#act-mo');
    mb.disabled = !!G.mo || G.t < G.moCooldownUntil;
    mb.querySelector('.cost').textContent = G.mo ? 'ACTIVE' : G.t < G.moCooldownUntil ? DC.fmtDur(G.moCooldownUntil - G.t) : 'READY';
  }

  function feed() {
    const G = S.get();
    patch($('#feed'), G.dispatches.slice(-7).reverse().map((d) => '<div class="' + d.kind + '"><time>' + DC.fmtClock(d.t).replace('DAY ', 'D') + '</time><b>' + esc(d.title) + '</b>' + (d.ai ? '<span class="ai-tag">✦ AI</span>' : '') + '</div>').join(''));
  }
  U.feed = feed;

  // ---------- modals ----------
  U.open = function (name, html, cls) {
    U.modal = name;
    const box = $('#modal-box');
    box.className = 'box ' + (cls || '');
    box.innerHTML = html;
    $('#modal').hidden = false;
    hideTip();
    const first = box.querySelector('button.opt, .btn, button');
    if (first) first.focus({ preventScroll: true });
    box.scrollTop = 0;
  };
  U.close = function () {
    if (U.modal === 'over') return;
    U.modal = null;
    $('#modal').hidden = true;
    setTimeout(U.showNextEvent, 250);
  };
  const X = '<button class="x" aria-label="Close" onclick="DC.UI.close()">✕</button>';

  U.showNextEvent = function () {
    if (U.modal || !D.queue.length || !S.get() || S.get().over) return;
    const ev = D.queue[0];
    const G = S.get();
    const ctxP = ev.ctx && ev.ctx.planet != null ? G.planets[ev.ctx.planet] : null;
    if (ctxP) { DC.Render.focus(ctxP, 1.1); }
    U.open('event', '<div class="kick">PRIORITY TRANSMISSION · ' + esc(DC.fmtClock(G.t)) + (ev.ai ? '<span class="ai-tag">✦ AI DIRECTOR</span>' : '') + '</div><h2>' + esc(ev.title) + '</h2>' +
      (ctxP ? '<div class="sub">' + esc(ctxP.name) + ' · ' + esc(G.sectors[ctxP.sector].name) + ' Sector</div>' : '') +
      '<p class="body">' + esc(ev.body) + '</p><div class="opts">' + ev.options.map((o, i) => '<button class="opt" data-i="' + i + '">' + esc(o.label) + '<small>' + esc(describeFx(o.fx)) + '</small></button>').join('') + '</div><div id="ev-result"></div>', 'event');
    $('#modal-box').querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
      const notes = D.resolve(ev, +b.dataset.i);
      $('#modal-box').querySelectorAll('.opt').forEach((x) => (x.disabled = true));
      b.style.borderColor = 'var(--yellow)';
      $('#ev-result').innerHTML = '<div class="result">' + (notes.length ? esc(notes.join(' · ')) : 'Order acknowledged.') + '</div><div class="row-btns"><button class="btn" id="ev-ok">CONTINUE</button></div>';
      $('#ev-ok').focus();
      $('#ev-ok').onclick = () => { U.modal = null; U.close(); };
    }));
  };
  // Summarize option effects without spoiling gambles.
  function describeFx(fx) {
    const out = [];
    (fx || []).forEach((e) => {
      if (e.t === 'req') out.push((e.v > 0 ? '+' : '') + e.v + ' R');
      else if (e.t === 'morale') out.push((e.v > 0 ? '+' : '') + e.v + ' morale');
      else if (e.t === 'chance') out.push('a gamble');
      else if (e.t === 'attack') out.push('triggers an invasion');
      else if (e.t === 'mod') out.push(e.label || 'temporary effect');
      else if (e.t === 'garrison') out.push((e.v > 0 ? '+' : '') + e.v + ' SEAF');
      else if (e.t === 'lib') out.push('+' + e.v + '% liberation');
      else if (e.t === 'samples') out.push('samples');
      else if (e.t === 'kia') out.push('casualties');
      else if (e.t === 'fleet') out.push('moves the fleet');
      else if (e.t === 'defense') out.push('+defenses');
      else if (e.t === 'cd') out.push(e.label || 'delays commands');
    });
    return [...new Set(out)].join(' · ');
  }

  U.openResearch = function () {
    const G = S.get();
    const html = X + '<div class="kick">STRATEGIC RESEARCH DIVISION</div><h2>Research</h2><p class="dim">One project at a time. Costs Requisition and samples. Samples come from active campaigns and liberated worlds; super samples mostly from the outer ring.</p>' +
      '<div class="samples" style="display:flex;gap:12px"><span class="sm c">' + Math.floor(G.res.samples[0]) + '</span><span class="sm r">' + Math.floor(G.res.samples[1]) + '</span><span class="sm s">' + Math.floor(G.res.samples[2]) + '</span><span style="margin-left:8px">' + DC.fmt(G.res.req) + ' R</span></div>' +
      '<div class="research">' + DC.RESEARCH.map((r) => {
        const st = S.researchState(r);
        const can = S.canResearch(r);
        let foot = '';
        if (st === 'active') foot = '<div class="prog"><i style="width:' + ((G.t - G.research.current.start) / r.h) * 100 + '%"></i></div><span class="dim">' + DC.fmtDur(G.research.current.ends - G.t) + ' remaining</span>';
        else if (st === 'available') foot = '<button class="btn" data-r="' + r.id + '" ' + (can ? '' : 'disabled') + '>' + (G.research.current ? 'R&D BUSY' : 'RESEARCH · ' + DC.fmtDur(r.h)) + '</button>';
        else if (st === 'locked') foot = '<span class="dim">Requires ' + esc(DC.RESEARCH.find((x) => x.id === r.req).name) + '</span>';
        return '<div class="rc ' + st + '"><h4>' + esc(r.name) + '</h4><p>' + esc(r.desc) + '</p>' + (st === 'done' ? '' : '<div class="costs"><span>' + r.cost + ' R</span>' + (r.s[0] ? '<span class="sm c">' + r.s[0] + '</span>' : '') + (r.s[1] ? '<span class="sm r">' + r.s[1] + '</span>' : '') + (r.s[2] ? '<span class="sm s">' + r.s[2] + '</span>' : '') + '</div>') + foot + '</div>';
      }).join('') + '</div>';
    U.open('research', html);
    $('#modal-box').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { S.startResearch(DC.RESEARCH.find((r) => r.id === b.dataset.r)); U.openResearch(); }));
  };

  U.openStats = function () {
    const G = S.get();
    const st = G.stats;
    const tile = (k, v, c) => '<div class="tile"><div class="k">' + esc(k) + '</div><div class="v" ' + (c ? 'style="color:' + c + '"' : '') + '>' + esc(v) + '</div></div>';
    const kmax = Math.max(1, ...DC.ENEMIES.map((f) => st.killsBy[f]));
    const html = X + '<div class="kick">MINISTRY OF STATISTICS · ' + esc(DC.fmtClock(G.t)) + '</div><h2>War Record</h2><p class="dim">' + esc(G.commander) + ' · ' + esc(S.rank().title) + ' · ' + esc(DC.DIFFICULTY[G.difficulty].name) + ' difficulty · seed ' + G.seed + '</p>' +
      '<div class="tiles">' + tile('Worlds liberated', st.liberated, 'var(--cyan)') + tile('Worlds lost', st.lost, 'var(--bad)') + tile('Invasions repelled', st.defended) + tile('Worlds destroyed', st.worldsDestroyed) +
      tile('Major Orders won', st.moDone + ' / ' + (st.moDone + st.moFailed)) + tile('Orbital strikes', st.strikes) + tile('Research done', st.researchDone) + tile('Director events', st.events) +
      tile('Enemies killed', DC.fmtShort(st.kills)) + tile('Helldivers KIA', DC.fmtShort(st.kia), 'var(--bad)') + tile('Bullets fired', DC.fmtShort(st.bullets)) + tile('Peak Helldivers', DC.fmtShort(st.peakDivers)) + '</div>' +
      '<div class="chart-title"><span>WORLDS HELD</span><span class="legend"><span style="--c:#5fd4ff">Super Earth</span><span style="--c:' + FC('bugs') + '">Terminids</span><span style="--c:' + FC('bots') + '">Automatons</span><span style="--c:' + FC('squids') + '">Illuminate</span></span></div><div class="chart-wrap" id="ch-terr"></div>' +
      '<div class="chart-title"><span>PUBLIC MORALE</span></div><div class="chart-wrap" id="ch-mor"></div>' +
      '<div class="chart-title"><span>ENEMIES KILLED BY FACTION</span></div><div class="kbars">' + DC.ENEMIES.map((f) => '<div class="kbar"><span>' + DC.FACTIONS[f].name + '</span><div class="b"><i style="--c:' + FC(f) + ';width:' + (st.killsBy[f] / kmax) * 100 + '%"></i></div><span class="n">' + DC.fmtShort(st.killsBy[f]) + '</span></div>').join('') + '</div>' +
      (G.heroes.length ? '<div class="chart-title"><span>HEROES OF SUPER EARTH</span></div><div class="chron" style="max-height:none">' + G.heroes.map((h) => '<div><time>' + DC.fmtClock(h.since).replace('DAY ', 'D') + '</time><span class="' + (h.alive ? 'good' : 'triumph') + '">' + esc(h.nick + ' ' + h.name) + ' · ' + DC.fmt(h.kills) + ' kills · ' + (h.fate === 'fallen' ? 'fell in glory' : h.fate === 'instructor' ? 'Chief Instructor' : 'on active duty') + '</span></div>').join('') + '</div>' : '') +
      '<div class="chart-title" style="margin-top:12px"><span>WAR CHRONICLE</span></div><div class="chron">' + G.chronicle.slice().reverse().map((c) => '<div><time>' + DC.fmtClock(c.t).replace('DAY ', 'D') + '</time><span class="' + c.kind + '">' + esc(c.text) + '</span></div>').join('') + '</div>';
    U.open('stats', html);
    const hist = G.history.concat([{ t: G.t, human: S.count('human'), bugs: S.count('bugs'), bots: S.count('bots'), squids: S.count('squids'), morale: G.res.morale, divers: G.divers }]);
    DC.Charts.line($('#ch-terr'), hist, [
      { key: 'human', name: 'Super Earth', short: 'SE', color: '#5fd4ff' }, { key: 'bugs', name: 'Terminids', short: 'TER', color: FC('bugs') },
      { key: 'bots', name: 'Automatons', short: 'AUT', color: FC('bots') }, { key: 'squids', name: 'Illuminate', short: 'ILL', color: FC('squids') }]);
    DC.Charts.line($('#ch-mor'), hist, [{ key: 'morale', name: 'Morale', short: 'Morale', color: '#ffe14d', area: true }], { yMax: 100, fmt: (v) => Math.round(v) });
  };

  U.openDispatches = function () {
    const G = S.get();
    const html = X + '<div class="kick">MINISTRY OF TRUTH</div><h2>Dispatches</h2>' + (DC.LLM.enabled() ? '<p class="dim">Dispatches marked ✦ AI were written live by the AI Director.</p>' : '') +
      '<div class="dlist">' + G.dispatches.slice().reverse().map((d) => '<div class="dl ' + d.kind + '"><time>' + DC.fmtClock(d.t) + '</time>' + (d.unread ? ' <span class="ai-tag" style="color:var(--yellow);border-color:var(--yellow)">NEW</span>' : '') + (d.ai ? '<span class="ai-tag">✦ AI</span>' : '') + '<h4>' + esc(d.title) + '</h4><p>' + esc(d.body) + '</p></div>').join('') + '</div>';
    G.dispatches.forEach((d) => (d.unread = false));
    U.open('dispatches', html);
  };

  // Major Orders
  U.quickMO = function (type, id) { S.issueMO(type, { planet: id }); toast('Major Order issued', S.get().mo.title, 'triumph'); U.refresh(); };
  U.rescind = function () {
    const G = S.get();
    if (!G.mo) return;
    U.open('confirm', X + '<div class="kick">HIGH COMMAND</div><h2>Rescind the Major Order?</h2><p>Rescinding "' + esc(G.mo.title) + '" counts as a failure: morale drops and the next order is delayed.</p><div class="row-btns"><button class="btn danger" id="rs-yes">RESCIND ORDER</button><button class="btn ghost" id="rs-no">KEEP IT</button></div>');
    $('#rs-yes').onclick = () => { S.endMO(false); U.close(); U.refresh(); };
    $('#rs-no').onclick = U.close;
  };
  U.openMO = function (tab) {
    const G = S.get();
    if (G.mo) return toast('Major Order active', 'Complete or rescind the current order first.', 'bad');
    if (G.t < G.moCooldownUntil) return toast('High Command is deliberating', 'Next order available in ' + DC.fmtDur(G.moCooldownUntil - G.t) + '.', 'bad');
    tab = tab || 'liberate';
    const T = DC.MO_TYPES.find((m) => m.id === tab);
    let items = '';
    const mini = (v) => '<div class="mini"><i style="width:' + v * 100 + '%"></i></div>';
    if (tab === 'liberate') {
      items = G.planets.filter((p) => p.front).sort((a, b) => b.lib - a.lib).map((p) => '<button data-p="' + p.id + '"><b style="color:' + FC(p.owner) + '">' + esc(p.name) + (p.home ? ' ★' : '') + '</b><span>' + esc(G.sectors[p.sector].name) + ' · ' + DC.pct(p.lib) + ' · ' + DC.fmtShort(p.divers) + ' divers' + (p.special ? ' · ' + ({ darkEnergy: 'Dark Energy', forge: 'Forge World', hive: 'Hive World', evac: 'Evacuation' })[p.special] : '') + '</span>' + mini(p.lib / 100) + '</button>').join('');
    } else if (tab === 'sector') {
      items = G.sectors.filter((s) => s.planets.some((id) => G.planets[id].front)).map((s) => {
        const ps = s.planets.map((id) => G.planets[id]).filter((p) => !p.destroyed);
        const v = ps.reduce((n, p) => n + (p.owner === 'human' ? 1 : p.lib / 100), 0) / ps.length;
        const en = ps.filter((p) => p.owner !== 'human').length;
        return '<button data-s="' + s.id + '"><b>' + esc(s.name) + ' Sector</b><span>' + en + ' enemy world' + (en === 1 ? '' : 's') + ' · ' + Math.round(v * 100) + '% free</span>' + mini(v) + '</button>';
      }).join('');
    } else if (tab === 'defend') {
      items = G.planets.filter((p) => p.campaign).map((p) => '<button data-p="' + p.id + '"><b>' + esc(p.name) + '</b><span style="color:' + FC(p.campaign.faction) + '">' + DC.FACTIONS[p.campaign.faction].name + ' · ' + DC.fmtDur(p.campaign.ends - G.t) + ' left</span>' + mini(p.campaign.progress / 100) + '</button>').join('');
    } else if (tab === 'hold') {
      items = DC.ENEMIES.filter((f) => !G.factions[f].eliminated && !G.factions[f].shattered).map((f) => '<button data-f="' + f + '"><b style="color:' + FC(f) + '">' + DC.FACTIONS[f].name + '</b><span>' + G.planets.filter((p) => p.campaign && p.campaign.faction === f).length + ' active invasions · ' + S.count(f) + ' worlds</span></button>').join('');
    }
    const html = X + '<div class="kick">ISSUE MAJOR ORDER</div><h2>Direct the Helldivers</h2><p class="dim">A Major Order focuses Helldivers on your objective (about three times their usual interest, more once it is popular). Win it for Requisition, morale and medals. Fail it and morale suffers.</p>' +
      '<div class="tabs">' + DC.MO_TYPES.map((m) => '<button data-tab="' + m.id + '" class="' + (m.id === tab ? 'on' : '') + '">' + esc(m.name.toUpperCase()) + '</button>').join('') + '</div>' +
      '<p>' + esc(T.desc) + ' Reward: ' + T.reward + ' R, +' + T.morale + ' morale, ' + T.medals + ' medals' + (T.hours ? '. Duration ' + DC.fmtDur(T.hours) + '.' : '.') + '</p>' +
      '<div class="pick">' + (items || '<p class="dim">No valid targets right now.</p>') + '</div>';
    U.open('mo', html);
    const box = $('#modal-box');
    box.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => U.openMO(b.dataset.tab)));
    box.querySelectorAll('.pick button').forEach((b) => (b.onclick = () => {
      if (b.dataset.p != null) S.issueMO(tab, { planet: +b.dataset.p });
      else if (b.dataset.s != null) S.issueMO('sector', { sector: +b.dataset.s });
      else if (b.dataset.f) S.issueMO('hold', { faction: b.dataset.f });
      U.close();
      toast('Major Order issued', S.get().mo.title, 'triumph');
      U.refresh();
    }));
  };

  U.openMenu = function () {
    U.open('menu', X + '<div class="kick">COMMAND MENU</div><h2>' + esc(S.get().commander) + '</h2>' +
      '<div class="row-btns" style="flex-direction:column;align-items:stretch;max-width:340px">' +
      '<button class="btn" id="m-resume">RESUME</button><button class="btn ghost" id="m-help">HOW TO COMMAND</button><button class="btn ghost" id="m-ai">AI DIRECTOR SETTINGS</button>' +
      '<button class="btn ghost" id="m-mute">' + (DC.Audio.muted ? 'SOUND: OFF' : 'SOUND: ON') + '</button><button class="btn ghost" id="m-save">SAVE &amp; EXIT TO TITLE</button></div>');
    $('#m-resume').onclick = U.close;
    $('#m-help').onclick = U.openHelp;
    $('#m-ai').onclick = U.openAI;
    $('#m-mute').onclick = () => { DC.Audio.toggle(); U.openMenu(); };
    $('#m-save').onclick = () => { DC.Main.save(); U.modal = null; $('#modal').hidden = true; DC.Main.toTitle(); };
  };

  U.helpHTML = function () {
    return '<div class="help">' +
      '<div><b>Helldivers go where they want</b>About ' + DC.fmtShort(64000) + ' Helldivers spread across every campaign. You steer them with Major Orders, priority flags and the fleet.</div>' +
      '<div><b>Supply lines</b>You can only liberate enemy worlds connected to a Super Earth world. Dashed lines mark the front.</div>' +
      '<div><b>Liberation vs. regeneration</b>Each campaign shows its net rate. More divers, research and the fleet push it up. Enemy resistance pulls it down.</div>' +
      '<div><b>Defense campaigns</b>Enemies invade worlds next to theirs. Reach 100% before the timer runs out or the world falls. SEAF and Fortify help.</div>' +
      '<div><b>The fleet</b>Super Destroyers boost every campaign in range by 25% and are required for Orbital Bombardment and Hellbombs.</div>' +
      '<div><b>Morale</b>Victories raise it, losses drain it. Low morale means fewer recruits. At zero, you are relieved of command.</div>' +
      '<div><b>The AI Director</b>Paces the war through lulls, build-ups and crises, starts story arcs and sends you hard choices. Add an OpenRouter key and it writes new events and dispatches live.</div>' +
      '<div><b>Victory</b>Liberate all three enemy homeworlds. Lose Super Earth and the war is over.</div>' +
      '<div><b>Controls</b>Drag to pan, scroll or pinch to zoom, click a world to inspect it. Space pauses. 1-7 fire commands. M issues a Major Order.</div></div>';
  };
  U.openHelp = function () { U.open('help', X + '<div class="kick">FIELD MANUAL</div><h2>How to command</h2>' + U.helpHTML()); };

  U.openAI = function (fromTitle) {
    const c = DC.LLM.cfg;
    U.open('ai', X + '<div class="kick">LIVING AI DIRECTOR (OPTIONAL)</div><h2>AI Director settings</h2>' +
      '<p>Without a key, the built-in Director already paces the war, runs story arcs and fires events. With an <b>OpenRouter</b> key, it also invents brand-new events with real game effects and writes dispatches about what just happened in your war.</p>' +
      '<div class="form"><label>OpenRouter API key<input id="ai-key" type="password" autocomplete="off" placeholder="sk-or-..." value="' + esc(c.key) + '"></label>' +
      '<label>Model<input id="ai-model" list="ai-models" value="' + esc(c.model) + '"><datalist id="ai-models"></datalist></label>' +
      '<label class="chk"><input id="ai-on" type="checkbox" ' + (c.director !== false ? 'checked' : '') + '> Let the AI invent events and write dispatches</label>' +
      '<div class="row-btns"><button class="btn" id="ai-save">SAVE</button><button class="btn ghost" id="ai-test">TEST</button><button class="btn ghost" id="ai-models-btn">LOAD MODEL LIST</button></div>' +
      '<div id="ai-status" class="dim"></div>' +
      '<p class="dim">The key is stored only in this browser and sent only to openrouter.ai. It is shared with Silent Contract. Requests are billed to your OpenRouter account; a fast, cheap model works best.</p></div>');
    const status = (t) => ($('#ai-status').textContent = t);
    const read = () => { c.key = $('#ai-key').value.trim(); c.model = $('#ai-model').value.trim(); c.director = $('#ai-on').checked; };
    $('#ai-save').onclick = () => { read(); DC.LLM.save(); status('Saved. ' + (DC.LLM.enabled() ? 'AI Director is live.' : 'AI Director is off.')); if (fromTitle) DC.Main.renderTitle(); };
    $('#ai-test').onclick = async () => { read(); status('Testing…'); try { status('Model replied: ' + (await DC.LLM.test())); } catch (e) { status('Failed: ' + DC.LLM.lastError + '. Check the key and model name.'); } };
    $('#ai-models-btn').onclick = async () => {
      status('Loading…');
      try { const r = await DC.LLM.listModels(); $('#ai-models').innerHTML = r.ids.map((i) => '<option value="' + esc(i) + '">').join(''); if (r.best && !c.key) $('#ai-model').value = r.best; status(r.ids.length + ' models loaded.' + (r.best ? ' Suggested: ' + r.best : '')); }
      catch (e) { status('Could not reach openrouter.ai.'); }
    };
  };

  U.openGameOver = function (o) {
    const G = S.get();
    const st = G.stats;
    U.open('over', '<div class="kick">' + esc(DC.fmtClock(o.t)) + '</div><h2>' + (o.win ? 'Victory' : 'Defeat') + '</h2><p style="font-size:17px">' + esc(o.reason) + '</p>' +
      '<div class="tiles">' + [['Days of war', Math.ceil(o.t / 24)], ['Worlds liberated', st.liberated], ['Worlds lost', st.lost], ['Major Orders won', st.moDone], ['Enemies killed', DC.fmtShort(st.kills)], ['Helldivers KIA', DC.fmtShort(st.kia)], ['Medals', G.res.medals], ['Final rank', S.rank().title]].map(([k, v]) => '<div class="tile"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div></div>').join('') + '</div>' +
      '<div class="row-btns"><button class="btn" id="go-stats">FULL WAR RECORD</button><button class="btn ghost" id="go-new">NEW WAR</button></div>', 'over ' + (o.win ? 'win' : 'lose'));
    $('#go-stats').onclick = () => { U.modal = null; U.openStats(); U.modal = 'over'; const b = $('#modal-box'); b.insertAdjacentHTML('beforeend', '<div class="row-btns"><button class="btn" id="go-new2">NEW WAR</button></div>'); $('#go-new2').onclick = newWar; b.querySelector('.x').remove(); };
    $('#go-new').onclick = newWar;
    function newWar() { U.modal = null; $('#modal').hidden = true; DC.store.del('dc_save'); DC.Main.toTitle(); }
  };
})();
