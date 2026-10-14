// Boot, title screen, main loop, map input and save/load.
(function () {
  const DC = window.DC;
  const S = DC.Sim, D = DC.Director, V = DC.Render, U = DC.UI;
  const $ = DC.$;
  const SEC_PER_HOUR = 1.5; // real seconds per game hour at normal speed
  const M = (DC.Main = { running: false });
  let diffSel = DC.store.get('dc_diff', 'standard');
  let lastSpeed = 1;

  M.save = function () { if (M.running && S.get() && !S.get().over) DC.store.set('dc_save', S.get()); };

  M.renderTitle = function () {
    const sv = DC.store.get('dc_save', null);
    const name = DC.store.get('dc_name', 'Commander Vance');
    $('#title-body').innerHTML = '<div class="setup">' +
      (sv && sv.planets ? '<div class="row-btns"><button class="btn" id="t-continue">CONTINUE WAR · DAY ' + (Math.floor(sv.t / 24) + 1) + ' · ' + DC.esc(sv.commander) + '</button></div>' : '') +
      '<div class="form" style="max-width:none"><label>Commander name<input id="t-name" maxlength="28" value="' + DC.esc(name) + '"></label></div>' +
      '<div class="diffs" role="group" aria-label="Difficulty">' + Object.keys(DC.DIFFICULTY).map((k) => '<button data-d="' + k + '" class="' + (k === diffSel ? 'on' : '') + '"><b>' + DC.DIFFICULTY[k].name + '</b><span>' + DC.DIFFICULTY[k].desc + '</span></button>').join('') + '</div>' +
      '<div class="form" style="max-width:none"><label>Galaxy seed (optional)<input id="t-seed" inputmode="numeric" placeholder="Random"></label></div>' +
      '<div class="row-btns"><button class="btn" id="t-new">' + (sv ? 'START NEW WAR' : 'DEPLOY TO THE WAR TABLE') + '</button><button class="btn ghost" id="t-ai">AI DIRECTOR SETTINGS</button></div>' +
      '<div class="ai-line ' + (DC.LLM.enabled() ? 'on' : '') + '">' + (DC.LLM.enabled() ? '✦ Living AI Director online: ' + DC.esc(DC.LLM.cfg.model) : 'Built-in AI Director. Add an OpenRouter key to let it write new events live.') + '</div>' +
      U.helpHTML() + '</div>';
    document.querySelectorAll('.diffs button').forEach((b) => (b.onclick = () => { diffSel = b.dataset.d; DC.store.set('dc_diff', diffSel); M.renderTitle(); }));
    $('#t-new').onclick = () => {
      const commander = $('#t-name').value.trim() || 'Commander';
      DC.store.set('dc_name', commander);
      const seed = parseInt($('#t-seed').value, 10);
      DC.Audio.click();
      M.start(S.newGame({ commander, difficulty: diffSel, seed: Number.isFinite(seed) ? seed : 0 }), true);
    };
    if ($('#t-continue')) $('#t-continue').onclick = () => { DC.Audio.click(); M.start(S.load(sv), false); };
    $('#t-ai').onclick = () => U.openAI(true);
  };

  M.toTitle = function () {
    M.running = false;
    $('#ui').hidden = true;
    $('#title').hidden = false;
    U.disarm(); U.select(null);
    S.newGame({ commander: 'preview', difficulty: 'standard' });
    V.fit();
    M.renderTitle();
  };

  M.start = function (G, fresh) {
    D.init(G);
    M.running = true;
    $('#title').hidden = true;
    $('#ui').hidden = false;
    U.modal = null; $('#modal').hidden = true;
    D.queue = [];
    V.fit(); V.cam.tz = V.cam.z * 1.15;
    U.select(null);
    U.setSpeed(1);
    U.feed(); U.refresh();
    if (fresh) {
      setTimeout(() => U.toast('Welcome, ' + G.commander, 'Click a front-line world, then issue a Major Order to focus your Helldivers.', 'triumph'), 600);
      setTimeout(() => U.toast('The fleet', 'Super Destroyers boost every campaign in range. Hover a command to see its range.', 'good'), 5200);
    }
    M.save();
  };

  // ---------- loop ----------
  let last = performance.now(), uiAcc = 0, saveAcc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const G = S.get();
    if (M.running && G && !U.modal && U.speed > 0 && !G.over) {
      let hours = (dt * U.speed) / SEC_PER_HOUR;
      while (hours > 1e-6) { const h = Math.min(0.1, hours); S.step(h); D.step(h); hours -= h; }
    }
    if (!M.running) { V.cam.tx = Math.sin(now * 0.00005) * 160; V.cam.ty = Math.cos(now * 0.00004) * 90; }
    V.draw(G, now, dt);
    uiAcc += dt;
    if (M.running && uiAcc > 0.2) { uiAcc = 0; U.refresh(); if (!U.modal && D.queue.length) U.showNextEvent(); }
    saveAcc += dt;
    if (saveAcc > 15) { saveAcc = 0; M.save(); }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function bindInput() {
    const cv = $('#map');
    const ptrs = new Map();
    let drag = null, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        V.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
        pinch.d = d;
        return;
      }
      if (drag && ptrs.size === 1) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.moved = true; cv.classList.add('dragging'); }
        if (drag.moved) {
          V.cam.x -= dx / V.cam.z; V.cam.y -= dy / V.cam.z; V.cam.tx = V.cam.x; V.cam.ty = V.cam.y;
          U.hideTip();
        }
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.moved) return;
      }
      if (!M.running) return;
      const G = S.get();
      const p = V.hitPlanet(G, e.clientX, e.clientY);
      V.hover = p ? p.id : null;
      const w = V.toWorld(e.clientX, e.clientY);
      const s = DC.sectorAt(G.sectors, w.x, w.y);
      V.hoverSector = s && s.id !== 0 && Math.hypot(w.x, w.y) < 910 ? s.id : null;
      if (e.pointerType === 'mouse') U.planetTip(e, p);
    });
    const end = (e) => {
      const wasClick = drag && !drag.moved && ptrs.size === 1;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      cv.classList.remove('dragging');
      if (wasClick && M.running) {
        const G = S.get();
        const p = V.hitPlanet(G, e.clientX, e.clientY);
        if (p) { DC.Audio.click(); U.clickPlanet(p); }
        else if (!U.armed) U.select(null);
      }
      drag = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { V.hover = null; V.hoverSector = null; U.hideTip(); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); V.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('dblclick', (e) => {
      if (!M.running) return;
      const G = S.get();
      const w = V.toWorld(e.clientX, e.clientY);
      const s = DC.sectorAt(G.sectors, w.x, w.y);
      if (!s) return;
      const a = (s.a0 + s.a1) / 2, r = (s.r0 + s.r1) / 2;
      V.cam.tx = s.id ? Math.cos(a) * r : 0; V.cam.ty = s.id ? Math.sin(a) * r : 0;
      V.cam.tz = Math.min(V.size().W, V.size().H) / ((s.r1 - s.r0) * 2.6);
    });

    window.addEventListener('keydown', (e) => {
      if (!M.running) return;
      if (e.target.tagName === 'INPUT') return;
      const k = e.key;
      if (k === 'Escape') {
        if (U.modal && U.modal !== 'event' && U.modal !== 'over') return U.close();
        if (U.armed) return U.disarm();
        if (U.sel != null) return U.select(null);
        if (!U.modal) return U.openMenu();
        return;
      }
      if (U.modal) return;
      if (k === ' ') { e.preventDefault(); if (U.speed > 0) { lastSpeed = U.speed; U.setSpeed(0); } else U.setSpeed(lastSpeed || 1); return; }
      const a = DC.ACTIONS.find((x) => x.key === k);
      if (a) return U.trigger(a.id);
      const lk = k.toLowerCase();
      if (lk === 'm') U.openMO();
      else if (lk === 'r') U.openResearch();
      else if (lk === 's') U.openStats();
      else if (lk === 'd') U.openDispatches();
      else if (lk === 'f' || k === 'Home') V.fit();
      else if (k === '+' || k === '=') V.zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
      else if (k === '-') V.zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
      else if (k === 'Tab') {
        e.preventDefault();
        const G = S.get();
        const camps = S.campaigns().sort((p, q) => (q.campaign ? 1 : 0) - (p.campaign ? 1 : 0) || q.divers - p.divers);
        if (!camps.length) return;
        const i = camps.findIndex((p) => p.id === U.sel);
        const p = camps[(i + 1) % camps.length];
        U.select(p.id); V.focus(p, 1.2);
        void G;
      }
    });
    window.addEventListener('beforeunload', M.save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) M.save(); });
  }

  // ---------- boot ----------
  V.init($('#map'));
  U.init();
  bindInput();
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: M.running ? S.get() : null }));
  const boot = (data) => {
    M.toTitle();
    if (data && data.save && data.save.planets) M.start(S.load(data.save), false);
  };
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
  requestAnimationFrame(frame);
})();
