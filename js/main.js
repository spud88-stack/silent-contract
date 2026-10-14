// Screens (title, safehouse, briefing, results, pause) and the main loop.
(function () {
  const SC = window.SC, C = SC.Campaign;
  const M = (SC.Main = { screen: 'title', paused: false, loadout: [] });
  const $ = (id) => document.getElementById(id);
  const money = (v) => '₥ ' + Math.round(v).toLocaleString();
  const icon = (id) => '<img class="ico" src="' + SC.Sprites.iconURL(id) + '">';
  const THEME_ICON = { estate: '🏛', corporate: '🏢', club: '🎶', harbor: '⚓', hotel: '🏨', casino: '🎰', museum: '🖼', research: '🧪' };

  function show(html, cls) { const s = $('screen'); s.className = cls || ''; s.innerHTML = html; s.classList.remove('hidden'); }
  function hide() { $('screen').classList.add('hidden'); $('screen').innerHTML = ''; }
  function bind(root) {
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => { SC.Audio.unlock(); SC.Audio.play('ui'); ACT[b.dataset.act](b.dataset.arg, e); }));
  }

  // ------------------------------------------------------------ demo backdrop
  function demo() {
    SC.Game.end();
    const themes = Object.keys(SC.THEMES);
    SC.Game.start({ demo: true, seed: (Math.random() * 1e9) | 0, theme: themes[(Math.random() * themes.length) | 0], targets: 1, objectives: [] }, []);
    $('hud').classList.add('hidden');
  }

  // ------------------------------------------------------------ title
  M.title = function () {
    M.screen = 'title';
    if (!SC.G || !SC.G.P.ghost) demo();
    show('<div class="title-wrap"><div class="logo"><span class="logo-a">SILENT</span><span class="logo-b">CONTRACT</span></div>' +
      '<div class="tag">Procedural contracts · Living, talking people · One life per contract</div>' +
      '<div class="menu"><button class="big" data-act="enter">Enter the Safehouse</button><button data-act="settings">AI &amp; Settings</button><button data-act="how">How to Play</button></div>' +
      '<div class="ai-pill ' + (SC.LLM.enabled() ? 'on' : '') + '">' + (SC.LLM.enabled() ? '● Living AI: ' + SC.esc(SC.LLM.cfg.model) : '○ Built-in AI — add an OpenRouter key in Settings to let NPCs truly talk') + '</div></div>', 'title');
    bind($('screen'));
  };

  // ------------------------------------------------------------ safehouse
  M.safehouse = function (tab) {
    M.screen = 'safehouse'; M.tab = tab || M.tab || 'campaign';
    if (!SC.G || !SC.G.P.ghost) demo();
    const D = C.data, lvl = C.level();
    let body = '';
    if (M.tab === 'campaign') body = campaignTab();
    else if (M.tab === 'gear') body = gearTab();
    else if (M.tab === 'market') body = marketTab();
    else body = settingsTab();
    show('<div class="sh"><header><div class="brand">SILENT<b>CONTRACT</b><span>SAFEHOUSE</span></div>' +
      '<nav>' + [['campaign', 'Contracts'], ['gear', 'Gear Wall'], ['market', 'Black Market'], ['settings', 'AI & Settings']].map(([k, l]) => '<button class="' + (M.tab === k ? 'on' : '') + '" data-act="tab" data-arg="' + k + '">' + l + '</button>').join('') + '</nav>' +
      '<div class="wallet"><div class="m">' + money(D.merces) + '</div><div class="lv">Mastery ' + lvl + (D.prestige ? ' · Prestige ' + D.prestige : '') + '<div class="xp"><i style="width:' + Math.round(C.levelProgress() * 100) + '%"></i></div></div></div></header>' +
      '<main>' + body + '</main></div>', 'safehouse');
    bind($('screen'));
    if (M.tab === 'settings') bindSettings();
  };

  function campaignTab() {
    const D = C.data;
    if (!D.campaign) {
      return '<h2>Choose a syndicate to dismantle</h2><p class="lead">Each syndicate runs four tiers of territories. Clear the contracts in a tier, then face its leader in a <b>Showdown</b> — find them among the suspects by their tells. Fail a contract and the remaining territories go on <b>alert</b>. Fail an alerted contract or a showdown and the campaign collapses.</p>' +
        '<div class="cards">' + C.offers().map((o, i) => '<div class="card syn"><div class="kicker">' + SC.esc(o.type) + '</div><h3>' + SC.esc(o.name) + '</h3><p>' + SC.esc(o.blurb) + '</p><div class="dim">Operates in: ' + o.themes.map((t) => SC.THEMES[t].label).join(', ') + '</div><button class="big" data-act="pickSyn" data-arg="' + i + '">Hunt them</button></div>').join('') + '</div>';
    }
    const cp = D.campaign;
    let h = '<div class="camp-head"><div><div class="kicker">' + SC.esc(cp.syn.type) + '</div><h2>' + SC.esc(cp.syn.name) + '</h2></div><div class="pips">' + [0, 1, 2, 3].map((i) => '<span class="pip ' + (i < cp.tier ? 'done' : i === cp.tier ? 'cur' : '') + '">' + (i < cp.tier ? '✕' : 'L' + (i + 1)) + '</span>').join('') + '</div></div>';
    h += '<p class="lead">Tier ' + (cp.tier + 1) + ' of 4. ' + (C.open().length > 1 ? 'Clear territories in any order. The last one standing hosts the <b>Showdown</b>.' : '<b>Showdown.</b> The leader is hiding in plain sight among the suspects.') + '</p>';
    h += '<div class="cards terr">' + cp.territories.map((t) => {
      const sd = C.isShowdown(t), th = SC.THEMES[t.theme];
      return '<div class="card t-' + t.status + (sd ? ' showdown' : '') + '"><div class="kicker">' + THEME_ICON[t.theme] + ' ' + th.label + '</div><h3>' + SC.esc(t.name) + '</h3><div class="dim">' + SC.esc(t.region) + '</div>' +
        '<div class="badges">' + (sd ? '<span class="badge sd">SHOWDOWN</span>' : '') + (t.alerted ? '<span class="badge al">ALERTED</span>' : '') + (t.status === 'done' ? '<span class="badge ok">CLEARED</span>' : '') + (t.status === 'failed' ? '<span class="badge al">FAILED</span>' : '') + '</div>' +
        (t.status === 'open' ? '<div class="tinfo">' + (sd ? '1 hidden leader · 5 suspects' : (t.targetTypes ? t.targetTypes.slice(0, t.targets).map((k) => SC.TARGET_TYPES[k].label).join(' + ') : t.targets + ' target' + (t.targets > 1 ? 's' : ''))) + (t.courier && !sd ? ' · courier' : '') + '</div><button data-act="plan" data-arg="' + t.id + '">Plan contract</button>' : '') + '</div>';
    }).join('') + '</div>';
    h += '<div class="rules"><b>Freelancer rules</b> · Gear you bring is at risk: die and you lose it, plus half your marks. · Weapons you carry out are yours to keep. · Abort at an exit and you keep your gear, but the territory fails. · Mastery raises loadout slots.</div>';
    h += '<div class="foot"><button class="ghost" data-act="abandon">Abandon campaign</button></div>';
    return h;
  }
  function itemCard(id, n, extra) {
    const d = SC.ITEMS[id];
    return '<div class="item r-' + (d.rarity || 'common') + '">' + icon(id) + '<div><b>' + SC.esc(d.name) + (n > 1 ? ' ×' + n : '') + '</b><div class="dim">' + SC.esc(d.desc) + '</div></div>' + (extra || '') + '</div>';
  }
  function gearTab() {
    const list = C.stashList();
    return '<h2>Gear wall</h2><p class="lead">Everything you own. Weapons stay yours until you die carrying them. Tools are consumed.</p><div class="items">' + (list.length ? list.map((x) => itemCard(x.id, x.n)).join('') : '<div class="dim">Empty. Visit the black market.</div>') + '</div>' +
      '<h3>Record</h3><div class="stats">' + Object.entries({ Contracts: C.data.stats.missions, Completed: C.data.stats.success, Deaths: C.data.stats.deaths, 'Campaigns won': C.data.stats.campaignsWon, 'Campaigns lost': C.data.stats.campaignsLost, 'Smooth talks': C.data.stats.talked }).map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>';
  }
  function marketTab() {
    return '<h2>Black market</h2><p class="lead">Stock rotates after every contract.</p><div class="items">' + C.shop().map((e, i) => itemCard(e.id, 1, '<button ' + (e.sold || C.data.merces < e.price ? 'disabled' : '') + ' data-act="buy" data-arg="' + i + '">' + (e.sold ? 'Sold' : money(e.price)) + '</button>')).join('') + '</div>';
  }
  function settingsTab() {
    const c = SC.LLM.cfg;
    return '<h2>Living AI</h2><p class="lead">Plug in an <b>OpenRouter</b> key and every NPC becomes an LLM-driven character: they hold real conversations, judge your lies against their personality, outfit and memory, gossip with each other, and pass rumours around the building. Type anything — bluff a guard, send a waiter to the kitchen, lure the target somewhere quiet. Without a key the game uses a built-in rule brain.</p>' +
      '<div class="form"><label>OpenRouter API key<input id="ai-key" type="password" autocomplete="off" placeholder="sk-or-..." value="' + SC.esc(c.key) + '"></label>' +
      '<label>Model<div class="row"><input id="ai-model" list="ai-models" value="' + SC.esc(c.model) + '"><button type="button" id="ai-fetch">Load model list</button></div><datalist id="ai-models"></datalist></label>' +
      '<label class="chk"><input id="ai-amb" type="checkbox" ' + (c.ambient ? 'checked' : '') + '> AI-written ambient conversations between NPCs near you (more requests)</label>' +
      '<div class="row"><button id="ai-save" class="big">Save</button><button id="ai-test">Test connection</button><button id="ai-clear" class="ghost">Remove key</button><span id="ai-status"></span></div>' +
      '<p class="dim">Your key is stored only in this browser (localStorage) and sent only to openrouter.ai. Requests are billed to your OpenRouter account. A fast, cheap model keeps conversations snappy.</p></div>' +
      '<h2>Audio</h2><div class="form"><label>Volume<input id="vol" type="range" min="0" max="1" step="0.05" value="' + SC.Audio.vol + '"></label><label class="chk"><input id="music" type="checkbox" ' + (SC.Audio.music ? 'checked' : '') + '> Music</label></div>' +
      '<h2>Save data</h2><button class="ghost" data-act="wipe">Reset all progress</button>';
  }
  function bindSettings() {
    const st = (t, cls) => { $('ai-status').textContent = t; $('ai-status').className = cls || ''; };
    const save = () => { SC.LLM.cfg.key = $('ai-key').value.trim(); SC.LLM.cfg.model = $('ai-model').value.trim(); SC.LLM.cfg.ambient = $('ai-amb').checked; SC.LLM.save(); };
    $('ai-save').onclick = () => { save(); st('Saved.', 'ok'); };
    $('ai-clear').onclick = () => { $('ai-key').value = ''; save(); st('Key removed.'); };
    $('ai-test').onclick = async () => {
      save();
      if (!SC.LLM.enabled()) return st('Enter a key and model first.', 'bad');
      st('Testing…');
      try { const r = await SC.LLM.test(); st('Connected · model replied "' + r.slice(0, 30) + '"', 'ok'); } catch (e) { st('Failed: ' + SC.LLM.lastError, 'bad'); }
    };
    $('ai-fetch').onclick = async () => {
      st('Loading models…');
      try {
        const { ids, best } = await SC.LLM.listModels();
        $('ai-models').innerHTML = ids.map((i) => '<option value="' + SC.esc(i) + '">').join('');
        if (best && !ids.includes($('ai-model').value)) $('ai-model').value = best;
        st(ids.length + ' models available' + (best ? ' · suggested: ' + best : ''), 'ok');
      } catch (e) { st('Could not load the model list.', 'bad'); }
    };
    $('vol').oninput = (e) => SC.Audio.setVol(+e.target.value);
    $('music').onchange = (e) => SC.Audio.setMusic(e.target.checked);
  }

  // ------------------------------------------------------------ briefing
  M.plan = function (tid) {
    const t = C.data.campaign.territories.find((x) => x.id === tid);
    const ms = C.mission(t), th = SC.THEMES[t.theme], slots = C.slots();
    M.planT = t;
    const stash = C.stashList();
    M.loadout = (M.loadout.length ? M.loadout : C.data.lastLoadout).filter((id) => stash.some((s) => s.id === id)).slice(0, slots);
    const brief = ms.showdown
      ? 'The leader of <b>' + SC.esc(C.data.campaign.syn.name) + '</b> is here under a cover identity, hiding among five suspects. You start knowing two of their four tells — learn the rest by eavesdropping or getting people to talk. Hover over people to inspect them. Kill the wrong suspect and the rest may bolt; if the leader reaches an exit, the campaign is over.'
      : 'Intel puts ' + ms.targets + ' syndicate lieutenant' + (ms.targets > 1 ? 's' : '') + ' at ' + SC.esc(t.name) + ' during ' + th.event + '. Get in, eliminate, get out. People here talk — listen to them, and talk back.' +
        '<div class="ttypes">' + (ms.targetTypes || []).slice(0, ms.targets).map((k) => '<div class="tt"><b>' + SC.TARGET_TYPES[k].label + '</b><span>' + SC.TARGET_TYPES[k].desc + '</span></div>').join('') + '</div>';
    show('<div class="brief"><div class="kicker">' + THEME_ICON[t.theme] + ' ' + th.label + ' · ' + SC.esc(t.region) + '</div><h1>' + SC.esc(t.name) + '</h1>' +
      '<div class="badges">' + (ms.showdown ? '<span class="badge sd">SHOWDOWN</span>' : '') + (t.alerted ? '<span class="badge al">ALERTED · more guards, more enforcers. Failure ends the campaign.</span>' : '') + '</div>' +
      '<div class="lead">' + brief + '</div>' +
      '<div class="cols"><div><h3>Payout objectives</h3>' + ms.objectives.map((k) => '<div class="po"><b>' + SC.OBJECTIVES[k].name + '</b> <i>+' + SC.OBJECTIVES[k].pay + '</i><div class="dim">' + SC.OBJECTIVES[k].desc + '</div></div>').join('') + '</div>' +
      '<div><h3>Loadout <span class="dim">' + M.loadout.length + '/' + slots + ' slots · items you bring are at risk</span></h3><div class="items pick">' +
      stash.map((x) => '<div class="item pickable ' + (M.loadout.includes(x.id) ? 'on' : '') + '" data-act="toggle" data-arg="' + x.id + '">' + icon(x.id) + '<div><b>' + SC.esc(SC.ITEMS[x.id].name) + (x.n > 1 ? ' ×' + x.n : '') + '</b><div class="dim">' + SC.esc(SC.ITEMS[x.id].desc) + '</div></div></div>').join('') + '</div></div></div>' +
      '<div class="foot"><button class="ghost" data-act="back">Back</button><button class="big" data-act="deploy">Deploy</button></div></div>', 'safehouse brief-s');
    bind($('screen'));
  };

  // ------------------------------------------------------------ mission lifecycle
  function fade(fn) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { try { fn(); } finally { setTimeout(() => f.classList.remove('on'), 60); } }, 220); }
  M.deploy = function () { fade(deployNow); };
  function deployNow() {
    const t = M.planT, ms = C.mission(t);
    const inv = C.takeLoadout(M.loadout);
    M.activeLoadout = M.loadout.slice();
    SC.Game.end();
    hide();
    SC.Game.start(ms, inv);
    SC.G.map.name = t.name; SC.G.map.region = t.region;
    SC.HUD.reset();
    $('hud').classList.remove('hidden');
    M.screen = 'mission'; M.paused = false;
    SC.G.toast(ms.showdown ? 'SHOWDOWN · find the leader by their tells' : 'Contract live · ' + t.name, 'info');
    setTimeout(() => SC.G && SC.G.toast('[TAB] intel · [M] map · [SPACE] instinct · [T] talk · hover people to inspect', 'info'), 2500);
  }
  M.missionOver = function (G) {
    if (SC.G !== G || !G.over || G.resultsShown) return;
    G.resultsShown = true;
    fade(() => { if (G.over) showResults(G); });
  };
  function showResults(G) {
    const res = C.resolve(G, M.activeLoadout || []);
    $('hud').classList.add('hidden');
    SC.HUD.toggleIntel(G, false); SC.HUD.toggleMap(G, false);
    M.screen = 'results';
    const s = G.stats, mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    let h = '<div class="results ' + (res.success ? 'win' : 'lose') + '"><div class="kicker">' + SC.esc(G.map.name) + '</div><h1>' + (res.success ? 'CONTRACT COMPLETE' : 'CONTRACT FAILED') + '</h1>' + (res.rating ? '<div class="rating r-' + res.rating.split(' ')[0].toLowerCase() + '">' + res.rating + '</div>' : '') + '<p class="lead">' + SC.esc(res.reason) + '</p>';
    if (res.success) {
      h += '<div class="ledger">' + res.lines.map((l) => '<div class="' + (l.ok === false ? 'miss' : '') + '"><span>' + (l.ok === undefined ? '' : l.ok ? '✔ ' : '✘ ') + SC.esc(l.label) + '</span><b>' + (l.ok === false ? '—' : '+' + l.v) + '</b></div>').join('') + '<div class="tot"><span>Total</span><b>' + money(res.earned) + '</b></div><div><span>Mastery XP</span><b>+' + res.xp + '</b></div></div>';
      if (res.gained.length) h += '<p>New gear on your wall: ' + res.gained.map((id) => icon(id) + ' ' + SC.ITEMS[id].name).join(', ') + '</p>';
    } else {
      if (res.lostMerces) h += '<p class="bad">You lost ' + money(res.lostMerces) + '.</p>';
      if (res.lost.length) h += '<p class="bad">Gear lost: ' + res.lost.map((id) => icon(id) + ' ' + SC.ITEMS[id].name).join(', ') + '</p>';
    }
    h += '<div class="stats">' + Object.entries({ Time: mm + ':' + String(ss).padStart(2, '0'), 'Bodies found': s.bodiesFound, 'Non-target kills': s.nonTargetKills, Pacified: s.kos, 'Disguises used': s.disguiseChanges, 'Talked their way': s.talked, 'Shots fired': s.shots, Spotted: s.compromised ? 'Yes' : 'No', 'On camera': s.recorded ? 'Yes' : 'No', Accidents: s.methods.filter((x) => x === 'accident').length }).map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>';
    const cm = { won: '<p class="good big">The syndicate is finished. Prestige earned.</p>', tier: '<p class="good">A syndicate leader is dead. The next tier of territories is open.</p>', alerted: '<p class="bad">Word travels. The remaining territories in this tier are now ALERTED.</p>', lost: '<p class="bad big">The campaign has collapsed. The syndicate goes to ground.</p>' };
    if (res.campaign) h += cm[res.campaign];
    h += '<div class="foot"><button class="big" data-act="toSafehouse">Return to safehouse</button></div></div>';
    show(h, 'results-s');
    bind($('screen'));
    SC.Game.end(); demo();
  }

  M.pause = function (on) {
    M.paused = on;
    SC.Input.clear();
    if (!on) { hide(); return; }
    show('<div class="pause"><h1>PAUSED</h1><div class="menu"><button class="big" data-act="resume">Resume</button><button data-act="howIn">Controls</button><button class="ghost" data-act="abortMission">Abort contract (counts as failure)</button></div></div>', 'pause-s');
    bind($('screen'));
  };
  const HOW = '<div class="how"><h2>How to play</h2><div class="cols"><div><h3>Controls</h3><table>' +
    [['WASD', 'Move'], ['Shift', 'Run (noisy)'], ['C / Ctrl', 'Toggle sneak'], ['Mouse', 'Aim'], ['Left click', 'Use item in hand (attack / shoot / throw coin)'], ['Right click', 'Throw item in hand'], ['E / F', 'Contextual actions (doors, bodies, disguises, poison, hide…)'], ['Q', 'Subdue (from behind = silent)'], ['T', 'Talk — type anything'], ['1-8 / wheel', 'Select item'], ['G', 'Drop item'], ['Space / V (hold)', 'Instinct: see people through walls'], ['Tab', 'Intel & objectives'], ['M', 'Site map'], ['Esc', 'Pause']].map(([k, v]) => '<tr><td><kbd>' + k + '</kbd></td><td>' + v + '</td></tr>').join('') +
    '</table></div><div><h3>Staying invisible</h3><p><b>Disguises</b> grant access: Public &lt; Staff &lt; Security &lt; Private. The room name turns red when you are trespassing.</p><p><b>Enforcers</b> (white dot) know their crew and will see through a matching disguise.</p><p>The <b>suspicion meter</b> shows the most suspicious person watching you. Witnesses run to guards — stop them before they report, or your disguise is compromised.</p><p><b>Talk.</b> When caught, explain yourself. Lie. Send people on errands, tell them their boss wants them, lure targets somewhere quiet. People remember being lied to — and they gossip.</p><p><b>Listen.</b> Conversations nearby leak intel: routines, safe codes, keycard holders, the leader\'s tells.</p></div></div><div class="foot"><button class="big" data-act="closeHow">Got it</button></div></div>';

  const ACT = {
    enter: () => M.safehouse('campaign'),
    settings: () => M.safehouse('settings'),
    how: () => { show(HOW, 'safehouse'); bind($('screen')); },
    howIn: () => { show(HOW, 'pause-s'); bind($('screen')); },
    closeHow: () => (M.screen === 'mission' ? M.pause(true) : M.screen === 'title' ? M.title() : M.safehouse()),
    tab: (k) => M.safehouse(k),
    pickSyn: (i) => { C.startCampaign(C.offers()[+i]); M.safehouse('campaign'); },
    abandon: () => { if (confirm('Abandon this campaign? Progress on this syndicate is lost.')) { C.data.campaign = null; C.data.stats.campaignsLost++; C.store(); M.safehouse('campaign'); } },
    plan: (id) => M.plan(id),
    back: () => M.safehouse('campaign'),
    toggle: (id) => { const i = M.loadout.indexOf(id); if (i >= 0) M.loadout.splice(i, 1); else if (M.loadout.length < C.slots()) M.loadout.push(id); M.plan(M.planT.id); },
    deploy: () => M.deploy(),
    buy: (i) => { C.buy(C.shop()[+i]); M.safehouse('market'); },
    wipe: () => { if (confirm('Erase all progress, gear and marks?')) { C.wipe(); M.safehouse('campaign'); } },
    toSafehouse: () => M.safehouse('campaign'),
    resume: () => M.pause(false),
    abortMission: () => { M.pause(false); SC.Game.finish(false, 'You abandoned the contract.', true); },
  };

  // ------------------------------------------------------------ loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const G = SC.G;
    if (G) {
      if (M.screen === 'mission' && !G.over) {
        if (SC.Input.pressed('escape')) { if (G.dialog) SC.Talk.close(false); else M.pause(!M.paused); }
        if (SC.Input.pressed('tab')) SC.HUD.toggleIntel(G);
        if (SC.Input.pressed('m')) SC.HUD.toggleMap(G);
      }
      if (!M.paused) SC.Game.update(dt);
      if (SC.G) {
        SC.Render.frame(SC.G, M.paused ? 0 : dt);
        if (M.screen === 'mission') SC.HUD.update(SC.G);
        SC.Audio.update(dt, M.screen === 'mission' ? SC.G.status.level || 0 : 0);
      }
    }
    SC.Input.endFrame();
    requestAnimationFrame(loop);
  }

  M.boot = function () {
    SC.Render.init($('game'));
    SC.Input.bind($('game'));
    SC.HUD.init();
    SC.Talk.bindUI();
    window.addEventListener('pointerdown', () => SC.Audio.unlock(), { once: false });
    $('intel-close').onclick = () => SC.G && SC.HUD.toggleIntel(SC.G, false);
    M.title();
    requestAnimationFrame(loop);
  };
  window.addEventListener('load', M.boot);
})();
