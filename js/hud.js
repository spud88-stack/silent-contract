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
  H.reset = function () { for (const k in cache) delete cache[k]; H.lastRoom = undefined; $('bigmap').classList.add('hidden'); $('bubbles').innerHTML = ''; $('toasts').innerHTML = ''; H.bubbleEls = new Map(); $('intel').classList.add('hidden'); };
  H.bubbleEls = new Map();

  H.toast = function (text, cls) {
    const box = $('toasts');
    const e = SC.el('div', 'toast ' + (cls || ''), SC.esc(text));
    box.prepend(e);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(() => e.classList.add('out'), cls === 'intel' ? 6500 : 4200);
    setTimeout(() => e.remove(), cls === 'intel' ? 7200 : 4900);
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
    set('sus-sub', 'textContent', (st.seen ? st.seen + ' watching' : 'unseen') + (st.witness ? ' · ' + st.witness + ' witness' + (st.witness > 1 ? 'es' : '') + ' running' : '') + (G.heat > 5 ? ' · heat ' + Math.round(G.heat) : ''));
    // objectives
    const key = G.targets.map((t) => t.state + (t.arriveAt != null ? Math.floor(t.arriveAt - G.time) : t.leaveAt != null ? Math.floor(t.leaveAt - G.time) : '')).join() + G.objectiveDone + [...G.tells].join();
    if (cache.obj !== key) { cache.obj = key; $('objectives').innerHTML = objectivesHTML(G); }
    set('loc', 'textContent', G.map.name.toUpperCase() + ' · ' + G.map.region);
    set('room', 'textContent', (P.room ? P.room.name : 'Grounds') + (P.room ? ' · ' + ['Public', 'Staff', 'Security', 'Private'][P.room.tier] : ''));
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
    }
    // prompts
    const pk = G.prompts.map((p) => p.key + p.text).join('|') + (P.action ? P.action.type : '');
    if (cache.pr !== pk) {
      cache.pr = pk;
      $('prompts').innerHTML = P.action ? '' : G.prompts.map((p) => '<div class="prompt ' + (p.warn ? 'warn' : '') + (p.fn ? '' : ' off') + '">' + (p.fn ? '<kbd>' + p.key + '</kbd>' : '') + SC.esc(p.text) + '</div>').join('');
    }
    // minimap
    const m = G.map;
    mmx.clearRect(0, 0, mm.width, mm.height);
    mmx.drawImage(m.minimap, 0, 0);
    mmx.fillStyle = 'rgba(255,255,255,0.12)';
    mmx.fillRect(R.ox / 8, R.oy / 8, R.VW / 8, R.VH / 8);
    for (const n of G.npcs) {
      if (n.state === 'gone' || n.hiddenIn) continue;
      const show = n.visible || G.marks.has(n) || G.instinct;
      if (!show) continue;
      mmx.fillStyle = n.body ? '#8b9bb4' : n.isTarget && !n.suspect ? '#ff3b4a' : n.suspect ? '#feae34' : n.state === 'hunt' ? '#ff7a3a' : n.armed ? '#7fb2ff' : '#e8e0f0';
      const s = n.isTarget || G.marks.has(n) ? 3 : 2;
      mmx.fillRect(Math.round(n.x / 8) - 1, Math.round(n.y / 8) - 1, s, s);
    }
    if (Math.floor(G.time * 4) % 2 === 0 || true) { mmx.fillStyle = '#ffffff'; mmx.fillRect(Math.round(P.x / 8) - 1, Math.round(P.y / 8) - 2, 3, 3); mmx.fillStyle = '#e43b44'; mmx.fillRect(Math.round(P.x / 8), Math.round(P.y / 8) - 1, 1, 1); }
    // bubbles
    const live = new Set();
    for (const b of G.bubbles) {
      const e = b.e;
      if (e !== P && !e.visible) continue;
      const scr = R.toScreen(e.x, e.y - 30);
      if (scr.x < -200 || scr.y < -60 || scr.x > innerWidth + 200 || scr.y > innerHeight + 60) continue;
      live.add(b);
      let el = H.bubbleEls.get(b);
      if (!el) {
        el = SC.el('div', 'bubble' + (e === P ? ' me' : '') + (e.isTarget && !e.suspect ? ' tgt' : '') + (e.state === 'hunt' ? ' hostile' : ''), SC.esc(b.text));
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
  };
})();
