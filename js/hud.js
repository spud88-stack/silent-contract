// DOM HUD: suspicion meter, objectives, disguise, inventory, prompts, minimap, speech bubbles, intel, inspect card.
(function () {
  const SC = window.SC, TS = 16;
  const H = (SC.HUD = {});
  const $ = (id) => document.getElementById(id);
  const cache = {};
  const set = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const e = $(id); if (e) e[prop] = v; };
  let mm, mmx;

  H.init = function () {
    mm = $('minimap'); mmx = mm.getContext('2d'); mmx.imageSmoothingEnabled = false;
  };
  H.reset = function () { $('chatter').innerHTML = ''; for (const k in cache) delete cache[k]; H.lastRoom = undefined; $('room-labels').innerHTML = ''; H.labelEls.clear(); $('bigmap').classList.add('hidden'); $('bubbles').innerHTML = ''; $('toasts').innerHTML = ''; H.bubbleEls = new Map(); $('intel').classList.add('hidden'); };
  H.bubbleEls = new Map();

  H.toast = function (text, cls) {
    const box = $('toasts');
    const e = SC.el('div', 'toast ' + (cls || ''), SC.esc(text));
    box.prepend(e);
    while (box.children.length > 6) box.lastChild.remove();
    const life = cls === 'tip' ? 10000 : cls === 'intel' ? 6500 : 4200;
    setTimeout(() => e.classList.add('out'), life);
    setTimeout(() => e.remove(), life + 700);
  };

  function objectivesHTML(G) {
    let h = '';
    if (G.mission.showdown) {
      const L = G.leader;
      h += '<div class="obj ' + (L.state === 'dead' ? 'done' : '') + '"><span class="ck"></span>Identify and eliminate the syndicate leader</div>';
      h += '<div class="tells">' + G.tellList.map((tl) => '<div class="tell ' + (G.tells.has(tl.key) ? 'known' : '') + '">' + (G.tells.has(tl.key) ? '◆ Leader ' + SC.esc(tl.text) : '◇ Unknown tell — find intel') + '</div>').join('') + '</div>';
    } else for (const t of G.targets) {
      const tt = SC.TARGET_TYPES[t.archetype];
      const mmss = (v) => Math.floor(v / 60) + ':' + String(Math.floor(v % 60)).padStart(2, '0');
      const timer = t.state === 'dead' ? '' : t.arriveAt != null ? ' <i class="tm">arrives ' + mmss(t.arriveAt - G.time) + '</i>' : t.leaveAt != null ? ' <i class="tm">leaves ' + mmss(t.leaveAt - G.time) + '</i>' : t.state === 'escape' ? ' <i class="tm bad">LEAVING</i>' : '';
      h += '<div class="obj ' + (t.state === 'dead' ? 'done' : '') + '"><span class="ck"></span><span>Eliminate <b>' + SC.esc(t.name) + '</b>' + (tt ? ' <span class="arch">' + tt.label + '</span>' : '') + timer + '</span></div>';
    }
    if (G.objectiveDone) h += '<div class="obj exfil"><span class="ck"></span>Reach an exit</div>';
    h += '<div class="pay">' + G.mission.objectives.map((k) => { const o = SC.OBJECTIVES[k]; return '<div class="po">◈ ' + o.name + ' <i>+' + o.pay + '</i></div>'; }).join('') + '</div>';
    return h;
  }

  H.update = function (G) {
    if (!G || G.P.ghost) return;
    const P = G.P, st = G.status, R = SC.Render;
    // suspicion meter
    set('sus-label', 'textContent', st.label);
    const lvlCls = ['clear', 'tres', 'sus', 'hunt', 'combat'][st.level];
    set('sus', 'className', 'lvl-' + lvlCls);
    $('sus-fill').style.width = Math.round(st.sus) + '%';
    const esc = G.npcs.find((n) => n.state === 'escort');
    set('sus-sub', 'textContent', esc ? 'BEING ESCORTED OUT · leave ' + (esc.cause === 'trespass' ? 'the restricted area' : 'their sight') + ' within ' + Math.max(0, Math.ceil(esc.escortT)) + 's' : (st.seen ? st.seen + ' watching' : 'unseen') + (st.witness ? ' · ' + st.witness + ' witness' + (st.witness > 1 ? 'es' : '') + ' running' : '') + (G.heat > 5 ? ' · heat ' + Math.round(G.heat) : ''));
    // objectives
    const key = G.targets.map((t) => t.state + (t.arriveAt != null ? Math.floor(t.arriveAt - G.time) : t.leaveAt != null ? Math.floor(t.leaveAt - G.time) : '')).join() + G.objectiveDone + [...G.tells].join();
    if (cache.obj !== key) { cache.obj = key; $('objectives').innerHTML = objectivesHTML(G); }
    set('loc', 'textContent', G.map.name.toUpperCase() + ' · ' + G.map.region);
    set('room', 'textContent', (P.room ? P.room.name : 'Grounds') + (P.room ? ' · ' + ['Public', 'Staff', 'Security', 'Private'][P.room.tier] : '') + (P.trespass ? ' · needs ' + needs(G, P.room) : ''));
    set('room', 'className', P.trespass ? 'tres' : '');
    const rk = (P.room ? P.room.id : -1) + ':' + P.trespass;
    if (H.lastRoom !== rk) {
      const first = H.lastRoom === undefined;
      H.lastRoom = rk;
      if (!first) {
        const b = $('room-banner');
        b.querySelector('.rb-name').textContent = P.room ? P.room.name.toUpperCase() : 'GROUNDS';
        const tb = b.querySelector('.rb-tier');
        tb.textContent = (P.room ? ['PUBLIC AREA', 'STAFF ONLY', 'SECURITY AREA', 'PRIVATE'][P.room.tier] : 'OUTSIDE') + (P.trespass ? ' · TRESPASSING' : '');
        tb.className = 'rb-tier' + (P.trespass ? ' bad' : '');
        b.classList.add('on'); clearTimeout(H.bannerT); H.bannerT = setTimeout(() => b.classList.remove('on'), 1800);
      }
    }
    if (Math.floor(G.time * 4) !== H.mapTick) { H.mapTick = Math.floor(G.time * 4); H.drawMap(G); }
    // disguise card
    const lk = JSON.stringify(P.look);
    if (cache.look !== lk) { cache.look = lk; $('dz-portrait').src = SC.Sprites.portrait(P.look, 3); }
    set('dz-name', 'textContent', P.outfit.name);
    const enf = G.npcs.filter((n) => n.enforcer && n.kind === P.outfit.kind && n.state !== 'dead' && n.state !== 'ko' && n.visible).length;
    set('dz-flags', 'innerHTML', (P.trespass ? '<span class="flag bad">TRESPASSING</span>' : '<span class="flag ok">ACCESS OK</span>') + (enf ? '<span class="flag warn">' + enf + ' ENFORCER' + (enf > 1 ? 'S' : '') + '</span>' : '') + (G.alarmKinds.has(P.outfit.kind) ? '<span class="flag bad">COMPROMISED</span>' : '') + (P.sneak ? '<span class="flag">SNEAKING</span>' : '') + (G.blackout > 0 ? '<span class="flag">BLACKOUT ' + Math.ceil(G.blackout) + 's</span>' : '') + (G.stats.recorded ? '<span class="flag warn">ON CAMERA</span>' : ''));
    $('hp-fill').style.width = Math.max(0, P.hp) + '%';
    // inventory
    const ik = P.inv.map((i) => i.id + ':' + (i.n == null ? '' : i.n)).join() + '|' + P.hand;
    if (cache.inv !== ik) {
      cache.inv = ik;
      $('inv').innerHTML = P.inv.map((it, i) => '<div class="slot ' + (i === P.hand ? 'sel' : '') + (SC.ITEMS[it.id].illegal ? ' illegal' : '') + '"><span class="k">' + (i + 1) + '</span><img src="' + SC.Sprites.iconURL(it.id) + '">' + (it.n != null ? '<span class="n">' + it.n + '</span>' : '') + '</div>').join('');
      const cur = P.inv[P.hand];
      set('inv-name', 'innerHTML', SC.esc(SC.ITEMS[cur.id].name) + (SC.ITEMS[cur.id].illegal ? ' <span class="flag bad">VISIBLE WEAPON</span>' : ''));
      set('inv-desc', 'textContent', SC.ITEMS[cur.id].desc + (cur.id === 'phone' ? ' · Left click a person to call them — hold SPACE to call through walls.' : cur.id === 'radio' ? ' · Left click to broadcast.' : cur.id === 'fists' ? '' : SC.ITEMS[cur.id].gun ? ' · Left click to fire.' : ['coin', 'knife', 'wrench', 'crowbar'].includes(cur.id) ? ' · Left click to use, right click to throw.' : ''));
    }
    // prompts
    const pk = G.prompts.map((p) => p.key + p.text).join('|') + (P.action ? P.action.type : '');
    if (cache.pr !== pk) {
      cache.pr = pk;
      $('prompts').innerHTML = P.action ? '' : G.prompts.map((p) => '<div class="prompt ' + (p.warn ? 'warn' : '') + (p.fn ? '' : ' off') + '">' + (p.fn ? '<kbd>' + p.key + '</kbd>' : '') + SC.esc(p.text) + '</div>').join('');
    }
    // minimap (drawn at 4px per tile so it stays crisp when scaled up)
    const m = G.map, MS = 4;
    mmx.clearRect(0, 0, mm.width, mm.height);
    mmx.drawImage(m.minimap, 0, 0, m.w * MS, m.h * MS);
    if (P.room) { mmx.strokeStyle = P.trespass ? '#ff5560' : '#fee761'; mmx.lineWidth = 1; mmx.strokeRect((P.room.x + 1) * MS + 0.5, (P.room.y + 1) * MS + 0.5, (P.room.w - 2) * MS - 1, (P.room.h - 2) * MS - 1); }
    mmx.strokeStyle = 'rgba(255,255,255,0.35)';
    mmx.strokeRect(R.ox / 4 + 0.5, R.oy / 4 + 0.5, R.VW / 4, R.VH / 4);
    for (const c of G.cams) if (!c.off) { mmx.fillStyle = c.sees ? '#ff2a3a' : 'rgba(255,60,80,0.6)'; mmx.fillRect(Math.round(c.x / 4) - 1, Math.round(c.y / 4) - 1, 2, 2); }
    for (const n of G.npcs) {
      if (n.state === 'gone' || n.hiddenIn) continue;
      const show = n.visible || G.marks.has(n) || G.instinct;
      if (!show) continue;
      mmx.fillStyle = n.body ? '#8b9bb4' : n.isTarget && !n.suspect ? '#ff3b4a' : n.suspect ? '#feae34' : n.state === 'hunt' ? '#ff7a3a' : n.armed ? '#7fb2ff' : '#e8e0f0';
      const sz = n.isTarget || G.marks.has(n) ? 5 : 3;
      mmx.fillRect(Math.round(n.x / 4 - sz / 2), Math.round(n.y / 4 - sz / 2), sz, sz);
    }
    const px = Math.round(P.x / 4), py = Math.round(P.y / 4) - 2;
    mmx.fillStyle = '#181425'; mmx.fillRect(px - 3, py - 3, 7, 7);
    mmx.fillStyle = '#ffffff'; mmx.fillRect(px - 2, py - 2, 5, 5);
    mmx.fillStyle = '#e43b44'; mmx.fillRect(px - 1, py - 1, 3, 3);
    mmx.strokeStyle = '#ffffff'; mmx.beginPath(); mmx.moveTo(px + 0.5, py + 0.5); mmx.lineTo(px + 0.5 + Math.cos(P.dir) * 7, py + 0.5 + Math.sin(P.dir) * 7); mmx.stroke();
    // overheard ticker: the last few lines spoken near you
    const now = performance.now(), recent = G.heard.filter((h) => now - h.rt < 14000).slice(-5);
    const ck = recent.map((h) => h.rt).join();
    if (cache.chatter !== ck) {
      cache.chatter = ck;
      $('chatter').innerHTML = recent.length ? '<div class="ch-head">OVERHEARD</div>' + recent.map((h) => '<div class="ch' + (h.radio ? ' radio' : '') + '">' + (h.radio ? '📻 ' : '') + '<b>' + SC.esc(h.who) + '</b> ' + SC.esc(h.text) + (h.ai ? ' <span class="aibadge">✦</span>' : '') + '</div>').join('') : '';
    }
    if (Math.floor(G.time * 2) !== H.tipTick) { H.tipTick = Math.floor(G.time * 2); tips(G); }
    // instinct: label each room with its access rule for your current disguise
    roomLabels(G);
    // bubbles
    const live = new Set();
    for (const b of G.bubbles) {
      const e = b.e;
      if (e !== P && !e.visible) continue;
      const scr = R.toScreen(e.x, e.y - (b.cls === 'thought' ? 52 : 30));
      if (scr.x < -200 || scr.y < -60 || scr.x > innerWidth + 200 || scr.y > innerHeight + 60) continue;
      live.add(b);
      let el = H.bubbleEls.get(b);
      if (!el) {
        el = SC.el('div', 'bubble' + (b.cls ? ' ' + b.cls : '') + (e === P ? ' me' : '') + (e.isTarget && !e.suspect && !b.cls ? ' tgt' : '') + (e.state === 'hunt' && !b.cls ? ' hostile' : ''), SC.esc(b.text));
        $('bubbles').appendChild(el); H.bubbleEls.set(b, el);
      }
      el.style.transform = 'translate(' + Math.round(scr.x) + 'px,' + Math.round(scr.y) + 'px) translate(-50%,-100%)';
      el.style.opacity = b.t > b.dur - 0.4 ? Math.max(0, (b.dur - b.t) / 0.4) : 1;
    }
    for (const [b, el] of H.bubbleEls) if (!live.has(b)) { el.remove(); H.bubbleEls.delete(b); }
    // inspect card
    const hv = G.hover, card = $('inspect');
    if (hv && !G.dialog) {
      const k = hv.id + hv.state + Math.round(hv.sus / 10) + (hv.seenHabits ? [...hv.seenHabits].join() : '') + [...G.tells].join();
      if (cache.insp !== k) {
        cache.insp = k;
        let h = '<img src="' + SC.Sprites.portrait(hv.look, 3) + '"><div><b>' + SC.esc(hv.name) + '</b><div class="role">' + SC.esc(hv.body ? (hv.state === 'dead' ? 'Dead' : 'Unconscious') : hv.outfit.name) + (hv.isTarget && !hv.suspect ? ' · <span class="tgt">TARGET' + (SC.TARGET_TYPES[hv.archetype] ? ' · ' + SC.TARGET_TYPES[hv.archetype].label.toUpperCase() : '') + '</span>' : '') + (hv.suspect ? ' · <span class="sus">SUSPECT</span>' : '') + '</div>';
        if (!hv.body) h += '<div class="role">' + (hv.enforcer && hv.kind === G.P.outfit.kind ? '<span class="enf">● Knows this crew — will see through your disguise</span>' : hv.lookout ? '<span class="enf">● Watchful. Something about them is off.</span>' : SC.esc(hv.persona.traits.join(', '))) + '</div>';
        if (hv.suspect) {
          const lk = { hat: !!hv.look.hat, glasses: !!hv.look.glasses, necklace: !!hv.look.necklace, earring: !!hv.look.earring };
          h += '<div class="tellgrid">' + Object.keys(lk).map((x) => '<span class="' + (lk[x] ? 'y' : 'n') + (G.tells.has(x) ? ' k' : '') + '">' + (lk[x] ? '✓ ' : '✗ ') + x + '</span>').join('') + ['smoker', 'foodie', 'drinker', 'bookworm'].map((x) => '<span class="' + (hv.seenHabits.has(x) ? 'y' : 'u') + (G.tells.has(x) ? ' k' : '') + '">' + (hv.seenHabits.has(x) ? '✓ ' : '? ') + x + '</span>').join('') + '</div>';
        }
        card.innerHTML = h + '</div>';
      }
      const In = SC.Input.mouse;
      card.style.transform = 'translate(' + Math.min(In.x + 18, innerWidth - 280) + 'px,' + Math.min(In.y + 12, innerHeight - 160) + 'px)';
      card.classList.remove('hidden');
    } else card.classList.add('hidden');
  };

  const TIER_NAMES = ['PUBLIC', 'STAFF ONLY', 'SECURITY', 'PRIVATE'];
  function needs(G, r) {
    const th = G.map.theme;
    // only the lowest-clearance outfits that work; anything above them works too
    const ok = Object.keys(th.outfits).filter((k) => k !== 'civ' && SC.MapGen.allowed(r, k));
    if (!ok.length) return '—';
    const min = Math.min(...ok.map((k) => SC.OUTFIT_LEVEL[k]));
    const names = ok.filter((k) => SC.OUTFIT_LEVEL[k] === min || (k === 'worker' && r.utility)).map((k) => th.outfits[k].name);
    return names.join(' or ') + (min < 3 ? ' (or higher)' : '');
  }
  H.labelEls = new Map();
  function roomLabels(G) {
    const k = G.instinctK || 0, box = $('room-labels'), R = SC.Render, P = G.P;
    if (k < 0.05) { if (box.childElementCount) { box.innerHTML = ''; H.labelEls.clear(); } return; }
    const live = new Set();
    for (const r of G.map.rooms) {
      const scr = R.toScreen((r.x + r.w / 2) * 16, (r.y + 1) * 16 + 4);
      if (scr.x < -120 || scr.y < -40 || scr.x > innerWidth + 120 || scr.y > innerHeight + 40) continue;
      live.add(r);
      let el = H.labelEls.get(r);
      const ok = SC.MapGen.allowed(r, P.outfit.kind);
      const key = r.id + ':' + ok + ':' + P.outfit.kind;
      if (!el) { el = SC.el('div', 'rlabel'); box.appendChild(el); H.labelEls.set(r, el); }
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.className = 'rlabel ' + (ok ? 'ok' : 'no');
        el.innerHTML = '<b>' + SC.esc(r.name) + '</b><span>' + TIER_NAMES[r.tier] + (ok ? ' · YOU FIT IN' : ' · NEEDS ' + SC.esc(needs(G, r).toUpperCase())) + '</span>';
      }
      el.style.transform = 'translate(' + Math.round(scr.x) + 'px,' + Math.round(scr.y) + 'px) translate(-50%,0)';
      el.style.opacity = k.toFixed(2);
    }
    for (const [r, el] of H.labelEls) if (!live.has(r)) { el.remove(); H.labelEls.delete(r); }
  }
  // one-time tips the first time each mechanic comes up
  let seenTips = {};
  try { seenTips = JSON.parse(localStorage.getItem('sc_tips') || '{}'); } catch (e) { /* storage unavailable */ }
  function tip(key, text) {
    if (seenTips[key]) return;
    seenTips[key] = 1;
    try { localStorage.setItem('sc_tips', JSON.stringify(seenTips)); } catch (e) { /* storage unavailable */ }
    H.toast(text, 'tip');
  }
  H.resetTips = () => { seenTips = {}; try { localStorage.removeItem('sc_tips'); } catch (e) { /* storage unavailable */ } };
  function tips(G) {
    const P = G.P, st = G.status;
    if (G.time > 6) tip('instinct', 'Hold SPACE for instinct: see people through walls, and which rooms your disguise lets you into.');
    if (P.trespass) tip('trespass', "You're somewhere your outfit doesn't belong. Guards will stop you. Find a disguise that fits, or talk your way out when caught.");
    if (G.npcs.some((n) => n.visible && n.enforcer && n.kind === P.outfit.kind && n.state !== 'dead' && n.state !== 'ko')) tip('enforcer', 'A white dot marks an enforcer: they know their crew and will see through your matching disguise. Keep your distance.');
    if (st.sus > 25) tip('sus', 'Someone is getting suspicious. The meter shows the most suspicious person watching you. Break line of sight to let it drop.');
    if (G.npcs.some((n) => n.body && n.visible && !n.hiddenIn)) tip('body', 'Bodies get found. Press E to drag one, then stuff it in a locker, freezer or dumpster. Press F to take their clothes.');
    if (G.intel.length) tip('intel', 'You picked up intel. Press TAB to review everything you have learned.');
    if (G.npcs.filter((n) => n.visible && !n.body && Math.hypot(n.x - P.x, n.y - P.y) < 110).length >= 4) tip('shout', 'A crowd! Press Y to say something out loud. Everyone in earshot reacts in their own way. Try: "Free champagne in the Ballroom!"');
    if (G.npcs.some((n) => n.visible && !n.body && n.state === 'routine' && Math.hypot(n.x - P.x, n.y - P.y) < 26)) tip('talk', 'Press T to talk to anyone. Type whatever you like: ask questions, lie, send them somewhere.');
    if (st.witness) tip('witness', "A witness is running to tell the guards. Stop them before they arrive and your disguise stays clean.");
  }
  H.toggleMap = function (G, show) {
    const el = $('bigmap');
    if (show === undefined) show = el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (show) H.drawMap(G);
  };
  H.drawMap = function (G) {
    const el = $('bigmap'); if (!G || el.classList.contains('hidden')) return;
    const m = G.map, S = 8, c = $('bigmap-c'), x = c.getContext('2d'), P = G.P;
    if (c.width !== m.w * S) { c.width = m.w * S; c.height = m.h * S; }
    x.imageSmoothingEnabled = false;
    x.drawImage(m.minimap, 0, 0, m.w * S, m.h * S);
    for (const r of m.rooms) if (!SC.MapGen.allowed(r, P.outfit.kind)) { x.strokeStyle = 'rgba(228,59,68,0.8)'; x.lineWidth = 2; x.strokeRect((r.x + 1) * S + 1, (r.y + 1) * S + 1, (r.w - 2) * S - 2, (r.h - 2) * S - 2); }
    for (const d of m.doors) if (d.locked) { x.fillStyle = '#e43b44'; x.fillRect(d.x * S + 1, d.y * S + 1, S - 2, S - 2); }
    for (const cam of G.cams) { x.fillStyle = cam.off ? '#3a4466' : '#ff2a3a'; x.beginPath(); x.arc(cam.x / 2, cam.y / 2, 2.5, 0, 6.29); x.fill(); }
    x.textAlign = 'center'; x.font = '9px "IBM Plex Mono", monospace';
    for (const r of m.rooms) {
      const lx = r.cx * S, room = (r.w - 2) * S - 4;
      // wrap names that don't fit the room onto two lines
      const words = r.name.split(' ');
      let lines = [r.name];
      if (x.measureText(r.name).width > room && words.length > 1) { const h = Math.ceil(words.length / 2); lines = [words.slice(0, h).join(' '), words.slice(h).join(' ')]; }
      const ly = r.cy * S - (lines.length - 1) * 5;
      lines.forEach((ln, i) => {
        const w = x.measureText(ln).width + 4;
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(lx - w / 2, ly - 7 + i * 10, w, 10);
        x.fillStyle = P.room === r ? '#fee761' : '#e8e4f0'; x.fillText(ln, lx, ly + 1 + i * 10);
      });
    }
    for (const e of m.exits) {
      x.fillStyle = '#63c74d'; x.fillRect(e.x * S - 2, e.y * S - 2, S + 4, S + 4);
      const tw = x.measureText(e.name).width / 2 + 2, ex = SC.clamp(e.x * S + 4, tw, m.w * S - tw);
      x.fillStyle = '#fff'; x.fillText(e.name, ex, e.y * S + (e.y < m.h / 2 ? 22 : e.y > m.h - 4 ? -6 : 22));
    }
    for (const n of G.npcs) {
      if (n.state === 'gone' || n.hiddenIn || !(n.visible || G.marks.has(n) || (n.isTarget && !n.suspect && G.marks.has(n)))) continue;
      x.fillStyle = n.body ? '#8b9bb4' : n.isTarget && !n.suspect ? '#ff3b4a' : n.armed ? '#7fb2ff' : '#e8e0f0';
      x.fillRect(n.x / 2 - 2, n.y / 2 - 2, 4, 4);
    }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(P.x / 2, P.y / 2, 4, 0, 6.29); x.fill(); x.fillStyle = '#e43b44'; x.beginPath(); x.arc(P.x / 2, P.y / 2, 2, 0, 6.29); x.fill();
  };
  H.toggleIntel = function (G, show) {
    const el = $('intel');
    if (show === undefined) show = el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (!show) return;
    $('intel-list').innerHTML = G.intel.length ? G.intel.map((t) => '<li>' + SC.esc(t) + '</li>').join('') : '<li class="dim">Nothing yet. Eavesdrop on conversations, or talk to people ([T]).</li>';
    $('intel-rumors').innerHTML = G.rumors.length ? G.rumors.map((r) => '<li><b>' + r.believers.size + '</b> believe "' + SC.esc(r.text) + '"</li>').join('') : '<li class="dim">Start one: tell someone "Did you hear…?" Gossips spread rumors fastest.</li>';
    $('intel-heard').innerHTML = G.heard.length ? G.heard.slice(-40).reverse().map((h) => '<div class="ch' + (h.radio ? ' radio' : '') + '"><i>' + Math.floor(h.t / 60) + ':' + String(Math.floor(h.t % 60)).padStart(2, '0') + '</i> ' + (h.radio ? '📻 ' : '') + '<b>' + SC.esc(h.who) + '</b> ' + SC.esc(h.text) + (h.ai ? ' <span class="aibadge">✦ AI</span>' : '') + '</div>').join('') : '<div class="dim">Stand near people who are chatting.</div>';
  };
})();
