// NPC simulation: routines, perception, suspicion, gossip, alarms, combat.
(function () {
  const SC = window.SC, TS = 16;
  const { clamp, dist, angDiff } = SC;
  const AI = (SC.AI = {});
  let G = null;
  AI.bind = (g) => { G = g; };

  const LN = () => SC.LINES;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ROLE_SPOTS = {
    civ: ['mingle', 'idle', 'sit', 'eat', 'drink', 'admire', 'dance', 'play', 'smoke', 'toilet', 'wash', 'read'],
    staff: ['cook', 'bartend', 'dj', 'idle', 'sit', 'mingle', 'wash', 'eat', 'smoke'],
    worker: ['fix', 'work', 'tend', 'idle', 'smoke', 'sit', 'cook'],
    guard: ['patrol', 'idle', 'mingle', 'work'],
    elite: ['idle', 'sit', 'read', 'mingle'],
  };
  const ACT_TIME = { mingle: [7, 16], idle: [6, 14], sit: [10, 22], eat: [6, 12], drink: [7, 12], admire: [6, 12], dance: [10, 24], play: [10, 20], smoke: [10, 18], toilet: [8, 14], wash: [4, 7], read: [8, 16], cook: [8, 18], bartend: [14, 30], dj: [20, 40], fix: [8, 14], work: [12, 26], tend: [8, 14], patrol: [3, 7], post: [40, 80] };

  // ------------------------------------------------------------------ creation
  function personal(rng) {
    const hairName = rng.pick(['black', 'black', 'brown', 'brown', 'blonde', 'red', 'gray']);
    return {
      skin: rng.pick(SC.Sprites.SKINS), hair: SC.Sprites.HAIRS[hairName], hairName, hairStyle: rng.pick([0, 0, 1, 1, 3, 5, 2]),
      glasses: rng.chance(0.16) ? '#262b44' : undefined, beard: undefined, necklace: rng.chance(0.14) || undefined, earring: rng.chance(0.12) || undefined,
    };
  }
  AI.make = function (role, kind, opts) {
    opts = opts || {};
    const rng = G.rng, theme = G.map.theme;
    const pers = personal(rng);
    if (pers.hairStyle === 2) { pers.hair = null; pers.hairName = 'bald'; }
    else if (rng.chance(0.12)) pers.beard = SC.Sprites.shade(pers.hair, -0.1);
    if (opts.traits) Object.assign(pers, opts.traits);
    const od = theme.outfits[kind];
    const outfit = { kind, name: od.name, look: od.gen ? od.gen(rng) : od.look };
    if (opts.hat) outfit.look = Object.assign({}, outfit.look, { hat: opts.hat, hatColor: opts.hatColor || '#3a4466' });
    let first = rng.pick(SC.NAMES.first), k = 0;
    while (G.npcs.some((o) => o.first === first) && k++ < 40) first = rng.pick(SC.NAMES.first);
    const last = rng.pick(SC.NAMES.last);
    const n = {
      id: G.npcs.length, role, kind, outfit, pers, look: Object.assign({}, pers, outfit.look),
      name: first + ' ' + last, first, last,
      persona: { traits: rng.take(SC.TRAITS, 2), back: rng.pick(SC.BACKSTORY[role === 'target' || role === 'suspect' ? 'target' : kind] || SC.BACKSTORY.civ), gull: rng.range(0.15, 0.9), courage: rng.range(0.1, 0.9), loyalty: rng.range(0.2, 0.95) },
      x: 0, y: 0, dir: rng.range(0, 6.28), moving: false, anim: rng.range(0, 10),
      state: 'routine', sus: 0, susCause: null, hp: kind === 'elite' ? 160 : 100,
      armed: kind === 'guard' || kind === 'elite', access: role === 'target' || role === 'suspect' ? 3 : SC.OUTFIT_LEVEL[kind],
      enforcer: false, viewRange: kind === 'guard' || kind === 'elite' ? 150 : 125, fov: 1.95,
      facts: new Map(), memory: [], hostileKinds: new Set(), wary: new Set(), knownBodies: new Set(),
      pool: [], spot: null, path: null, pi: 0, actT: 0, act: 'idle', chatCD: rng.range(2, 14), trustT: 0, liedTo: 0,
      fireT: 0, t: 0, seenT: 0, lostT: 0, bodyT: rng.next() * 0.3, repathT: 0, hasOutfit: true, talks: 0,
    };
    if (role === 'target' || role === 'suspect') { n.persona.gull *= 0.5; n.persona.traits[0] = rng.pick(['arrogant', 'paranoid', 'cold', 'charming', 'ruthless']); }
    if (kind === 'guard') n.persona.gull *= 0.75;
    if (kind === 'elite') n.persona.gull *= 0.5;
    G.npcs.push(n);
    return n;
  };
  AI.place = function (n, s) {
    n.x = s.x * TS + 8; n.y = s.y * TS + 9; n.dir = s.dir; n.spot = s; s.user = n.id;
    n.act = s.kind; n.actT = Math.random() * 10 + 3;
  };

  AI.populate = function (mission) {
    const m = G.map, rng = G.rng;
    const tierOf = (s) => (s.room < 0 ? 0 : m.rooms[s.room].tier);
    const spots = m.spots;
    const poolFor = (kind) => spots.filter((s) => {
      if (!ROLE_SPOTS[kind].includes(s.kind)) return false;
      const room = s.room >= 0 ? m.rooms[s.room] : null, t = tierOf(s);
      if (kind === 'civ') return t === 0;
      if (kind === 'staff') return t <= 1 && (s.kind !== 'mingle' || t === 0);
      if (kind === 'worker') return t <= 1 || (room && room.utility && t <= 2);
      if (kind === 'guard') return t <= 2 && (s.kind !== 'mingle' || rng.chance(0.4));
      return t === 3;
    });
    const pools = { civ: poolFor('civ'), staff: poolFor('staff'), worker: poolFor('worker'), guard: poolFor('guard'), elite: poolFor('elite') };
    const alert = mission.alerted ? 1.35 : 1;
    const counts = { civ: rng.int(16, 20), staff: rng.int(8, 10), worker: rng.int(3, 5), guard: Math.round(rng.int(6, 7) * alert), elite: Math.round(rng.int(2, 3) * alert) };
    const enfChance = { civ: 0, staff: 0.25, worker: 0.25, guard: 0.3, elite: 0.5 };
    const spawnIn = (n, pool) => {
      const free = pool.filter((s) => s.user == null);
      if (!free.length) return false;
      AI.place(n, rng.pick(free)); return true;
    };
    for (const kind of ['civ', 'staff', 'worker', 'guard', 'elite']) {
      for (let i = 0; i < counts[kind]; i++) {
        const n = AI.make(kind, kind, kind === 'civ' && rng.chance(0.12) ? { hat: 'fedora', hatColor: rng.pick(['#262b44', '#733e39', '#e8e0d0']) } : null);
        n.pool = pools[kind]; n.enforcer = rng.chance(enfChance[kind] * alert);
        if (!spawnIn(n, n.pool)) { G.npcs.pop(); break; }
      }
    }
    // stationary guards on posts
    const posts = spots.filter((s) => s.kind === 'post');
    for (const s of posts) {
      const r = s.room >= 0 ? m.rooms[s.room] : null, d = m.doors[s.door];
      const kind = d && d.tier === 3 ? 'elite' : 'guard';
      if (kind === 'guard' && !mission.alerted && rng.chance(0.3)) continue;
      const n = AI.make(kind, kind);
      n.post = s; n.pool = [s].concat((r ? r.spots : []).filter((q) => q.kind === 'idle' || q.kind === 'mingle').slice(0, 2));
      n.enforcer = rng.chance(0.4); AI.place(n, s); n.actT = rng.range(30, 70); n.act = 'post';
    }
    // one guard carries the master keycard (another may lie in the security room)
    const guards = G.npcs.filter((n) => n.kind === 'guard' || n.kind === 'elite');
    if (guards.length) rng.pick(guards).hasKeycard = true;

    // targets / showdown suspects
    const hi = spots.filter((s) => tierOf(s) >= 2 && ['work', 'sit', 'drink', 'read', 'idle', 'mingle'].includes(s.kind));
    const lo = spots.filter((s) => tierOf(s) <= 1 && ['drink', 'mingle', 'smoke', 'eat', 'sit'].includes(s.kind));
    const drinkHi = spots.filter((s) => s.kind === 'drink' && tierOf(s) >= 2), drinkLo = spots.filter((s) => s.kind === 'drink' && tierOf(s) <= 1);
    const routeFor = (publicBias) => {
      const route = [];
      const add = (pool) => { const f = pool.filter((s) => s.user == null && !route.includes(s) && !s.owner); if (f.length) { const s = rng.pick(f); route.push(s); return s; } };
      add(hi); const d = add(rng.chance(0.5) && drinkHi.length ? drinkHi : drinkLo); add(hi);
      if (rng.chance(publicBias)) add(lo);
      if (rng.chance(0.5)) add(hi);
      for (const s of route) s.owner = true;
      return { route, drink: d && d.kind === 'drink' ? d : route.find((s) => s.kind === 'drink') };
    };
    const mkVIP = (role, opts) => {
      const n = AI.make(role, 'civ', opts);
      n.outfit = { kind: 'civ', name: 'VIP', look: Object.assign({}, n.outfit.look, { shirt: rng.pick(['#e8e0d0', '#68386c', '#a22633', '#124e89', '#193c3e', '#b8860b']), collar: '#ffffff', skirt: undefined }) };
      n.look = Object.assign({}, n.pers, n.outfit.look); n.hasOutfit = false;
      const r = routeFor(role === 'suspect' ? 0.9 : 0.6);
      n.route = r.route; n.ri = 0; n.drinkSpot = r.drink; n.pool = n.route;
      if (!n.route.length) n.route = n.pool = [rng.pick(hi.length ? hi : spots)];
      AI.place(n, n.route[0]); n.actT = rng.range(8, 20); n.hp = 100;
      return n;
    };
    G.targets = [];
    if (mission.showdown) {
      const looks = ['hat', 'glasses', 'necklace', 'earring'], habits = ['smoker', 'foodie', 'drinker', 'bookworm'];
      const leaderLook = rng.take(looks, 2), leaderHab = rng.take(habits, 2);
      const combos = new Set();
      for (let i = 0; i < 5; i++) {
        let lk, hb, key, tries = 0;
        do {
          lk = i === 0 ? leaderLook : rng.take(looks, 2); hb = i === 0 ? leaderHab : rng.take(habits, 2);
          key = lk.slice().sort().join() + '|' + hb.slice().sort().join();
        } while (combos.has(key) && tries++ < 30);
        combos.add(key);
        const tr = { glasses: lk.includes('glasses') ? '#262b44' : undefined, necklace: lk.includes('necklace') || undefined, earring: lk.includes('earring') || undefined };
        const n = mkVIP('suspect', { traits: tr, hat: lk.includes('hat') ? 'fedora' : undefined, hatColor: '#262b44' });
        if (!lk.includes('hat')) { n.outfit.look.hat = undefined; n.look.hat = undefined; }
        n.tells = { look: lk, habit: hb }; n.suspect = true; n.leader = i === 0;
        const extra = { smoker: 'smoke', foodie: 'eat', drinker: 'drink', bookworm: 'read' };
        for (const h of hb) { const f = spots.filter((s) => s.kind === extra[h] && tierOf(s) <= 2 && !s.owner); if (f.length) { const s = rng.pick(f); s.owner = true; n.route.push(s); } }
        rng.shuffle(n.route); n.seenHabits = new Set();
        if (n.leader) { n.isTarget = true; G.targets.push(n); G.leader = n; }
      }
      G.suspects = G.npcs.filter((n) => n.suspect);
      for (let i = 0; i < 2; i++) { const n = AI.make('civ', 'civ'); n.pool = pools.civ; n.lookout = true; if (!spawnIn(n, n.pool)) G.npcs.pop(); }
    } else {
      // each target has an archetype that shapes where they go and who protects them
      const pickFrom = (pool, n) => { const out = []; for (let k = 0; k < n; k++) { const f = pool.filter((s) => s.user == null && !s.owner && !out.includes(s)); if (!f.length) break; out.push(rng.pick(f)); } for (const s of out) s.owner = true; return out; };
      const kinds = (ks, tmin, tmax) => spots.filter((s) => ks.includes(s.kind) && tierOf(s) >= tmin && tierOf(s) <= tmax);
      const types = mission.targetTypes || [];
      for (let i = 0; i < mission.targets; i++) {
        const type = types[i] || rng.pick(['socialite', 'recluse', 'workaholic', 'smoker']);
        let n, guards = rng.chance(0.6) || mission.alerted ? 1 : 0;
        if (type === 'chief') {
          n = AI.make('target', 'elite');
          n.outfit = { kind: 'elite', name: 'Head of Security', look: Object.assign({}, n.outfit.look, { tie: '#e43b44', shirt: '#2a2d38', pants: '#2a2d38' }) };
          n.look = Object.assign({}, n.pers, n.outfit.look);
          n.enforcer = true; n.wary.add('guard'); n.wary.add('elite');
          n.route = pickFrom(kinds(['patrol', 'post', 'work', 'idle'], 1, 3), 5); guards = 0; n.actMul = 0.45;
        } else if (type === 'insider') {
          n = AI.make('target', 'staff');
          n.route = pickFrom(kinds(['cook', 'idle', 'smoke', 'sit', 'eat', 'bartend', 'wash'], 0, 1), 5); guards = 0; n.actMul = 0.8;
        } else {
          n = AI.make('target', 'civ');
          n.outfit = { kind: 'civ', name: 'VIP', look: Object.assign({}, n.outfit.look, { shirt: rng.pick(['#e8e0d0', '#68386c', '#a22633', '#124e89', '#193c3e', '#b8860b']), collar: '#ffffff', skirt: undefined }) };
          n.look = Object.assign({}, n.pers, n.outfit.look); n.hasOutfit = false;
          if (type === 'recluse') { n.route = pickFrom(kinds(['work', 'sit', 'drink', 'read', 'idle', 'mingle'], 3, 3), 4); guards = 2; }
          else if (type === 'workaholic') { n.route = pickFrom(kinds(['work', 'read', 'sit'], 1, 3), 5); guards = 0; n.actMul = 0.6; }
          else if (type === 'smoker') { const r = routeFor(0); n.route = r.route.concat(pickFrom(kinds(['smoke'], 0, 0), 2)); rng.shuffle(n.route); }
          else { const r = routeFor(1); n.route = r.route.concat(pickFrom(lo, 2)); }
        }
        n.archetype = type; n.isTarget = true; n.hp = type === 'chief' ? 160 : 100;
        if (!n.route.length) { const r = routeFor(0.6); n.route = r.route.length ? r.route : [rng.pick(hi.length ? hi : spots)]; }
        n.route.forEach((s) => { s.owner = true; });
        n.ri = 0; n.pool = n.route; n.drinkSpot = n.route.find((s) => s.kind === 'drink');
        AI.place(n, n.route[0]); n.actT = rng.range(8, 20);
        G.targets.push(n);
        const escort = [];
        for (let k = 0; k < guards; k++) { const b = AI.make('elite', 'elite'); b.follow = n; b.enforcer = true; b.x = n.x; b.y = n.y; b.pool = pools.elite; escort.push(b); }
        if (type === 'visitor') {
          n.arriveAt = rng.range(45, 100); n.leaveAt = n.arriveAt + rng.range(300, 420);
          release(n); n.state = 'gone'; n.spot = null;
          for (const b of escort) { b.arriveAt = n.arriveAt; b.state = 'gone'; }
        }
      }
    }
    if (mission.courier) {
      const n = AI.make('civ', 'civ'); n.pool = pools.civ.concat(pools.staff.filter((s) => s.kind === 'idle')); n.courier = true; n.persona.traits[0] = 'paranoid';
      if (!spawnIn(n, n.pool)) G.npcs.pop(); else G.courier = n;
    }
    for (const n of G.npcs) n.sheet = SC.Sprites.charSheet(n.look);
  };

  // ------------------------------------------------------------------ speech + knowledge
  AI.say = function (n, text, dur, fact) {
    if (!text) return;
    G.bubble(n, text, dur || clamp(1.6 + text.length * 0.055, 2, 6));
    if (fact && dist(n.x, n.y, G.P.x, G.P.y) < 130) G.addIntel(fact, 'Overheard');
  };
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o && o[k]) || (k === 'room' ? pick(G.map.rooms).name : k === 'target' ? (G.targets[0] ? G.targets[0].name : 'the boss') : ''));
  AI.fmt = fmt;
  const remember = (n, s) => { n.memory.push(s); if (n.memory.length > 8) n.memory.shift(); };
  AI.remember = remember;

  AI.learn = function (n, f, direct) {
    if (!f || n.facts.has(f.id) || n.state === 'dead' || n.state === 'ko') return false;
    n.facts.set(f.id, f);
    if (f.kind === 'suspect') n.hostileKinds.add(f.outfit);
    else if (f.kind === 'liar') n.wary.add(f.outfit);
    else if (f.kind === 'rumor' && f.room != null && !direct && n.state === 'routine' && !n.isTarget && !n.post) {
      if (Math.random() < n.persona.gull * 0.6) {
        if (n.armed || n.kind === 'worker') AI.errand(n, G.map.rooms[f.room], 14, null);
        else if (n.spot && n.spot.room === f.room) AI.errand(n, null, 18, null);
      }
    }
    return true;
  };
  AI.shareable = (n, o) => { for (const f of n.facts.values()) if (!f.priv && !o.facts.has(f.id)) return f; return null; };

  // ------------------------------------------------------------------ movement
  function setPath(n, tx, ty) {
    const p = G.path(n.x, n.y, tx, ty, n.access);
    n.path = p; n.pi = 0;
    return !!p;
  }
  function step(n, dt, speed) {
    if (!n.path) return true;
    const wp = n.path[n.pi];
    if (!wp) { n.path = null; return true; }
    const dx = wp.x - n.x, dy = wp.y - n.y, d = Math.hypot(dx, dy);
    if (d < 2.2) { n.pi++; if (n.pi >= n.path.length) { n.path = null; return true; } return false; }
    const s = Math.min(d, speed * dt);
    n.x += (dx / d) * s; n.y += (dy / d) * s;
    n.dir = SC.turnToward(n.dir, Math.atan2(dy, dx), 9 * dt);
    n.moving = true; n.speedNow = speed;
    return false;
  }
  const face = (n, x, y, dt) => { n.dir = SC.turnToward(n.dir, Math.atan2(y - n.y, x - n.x), (dt || 1) * 7); };
  function chase(n, x, y, dt, speed, stop) {
    n.repathT -= dt;
    if (dist(n.x, n.y, x, y) <= stop) { n.path = null; return true; }
    if (n.repathT <= 0 || !n.path) { n.repathT = 0.45; setPath(n, x, y); }
    step(n, dt, speed);
    return false;
  }
  function release(n) { if (n.spot && n.spot.user === n.id) n.spot.user = null; }
  function toState(n, st) {
    if (n.state === 'chat' && n.chatWith) { const o = n.chatWith; n.chatWith = null; if (o.chatWith === n) { o.chatWith = null; if (o.state === 'chat') o.state = 'routine'; } }
    n.state = st; n.t = 0; n.path = null;
  }
  AI.toState = toState;

  function nextSpot(n) {
    release(n);
    let s = null;
    if (n.route) { n.ri = (n.ri + 1) % n.route.length; s = n.route[n.ri]; }
    else if (n.post && Math.random() < 0.75) s = n.post;
    else {
      const free = n.pool.filter((q) => q.user == null && q !== n.spot);
      if (free.length) {
        if (n.kind === 'civ' && Math.random() < 0.45) {
          const social = free.filter((q) => G.map.spots.some((o) => o !== q && o.user != null && Math.abs(o.x - q.x) + Math.abs(o.y - q.y) <= 2));
          if (social.length) s = pick(social);
        }
        s = s || pick(free);
      }
    }
    if (!s) { n.actT = 4; return; }
    if (setPath(n, s.x * TS + 8, s.y * TS + 9) || (Math.abs(n.x - s.x * TS - 8) < 4 && Math.abs(n.y - s.y * TS - 9) < 4)) { n.spot = s; s.user = n.id; n.arriving = true; }
    else n.actT = 3;
  }

  AI.errand = function (n, room, dur, why) {
    if (n.state === 'dead' || n.state === 'ko') return false;
    const m = G.map;
    if (!room) { const opts = m.rooms.filter((r) => r.tier <= n.access && (!n.spot || r.id !== n.spot.room)); room = pick(opts); }
    const sp = room.spots.filter((s) => s.user == null);
    const s = sp.length ? pick(sp) : room.spots[0];
    release(n); toState(n, 'errand');
    if (!setPath(n, s.x * TS + 8, s.y * TS + 9)) { n.state = 'routine'; return false; }
    n.errandT = dur; n.errandWhy = why; n.errandRoom = room;
    return true;
  };

  // ------------------------------------------------------------------ alarm plumbing
  function nearestGuard(n) {
    let best = null, bd = 1e9;
    for (const g of G.npcs) {
      if (!g.armed || g === n || g.state === 'dead' || g.state === 'ko') continue;
      const d = dist(n.x, n.y, g.x, g.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  function engage(n) {
    const kind = G.P.outfit.kind;
    n.hostileKinds.add(kind);
    if (n.armed) {
      if (n.state !== 'hunt') { toState(n, 'hunt'); AI.say(n, pick(LN().hunt)); G.sfx('alert'); n.fireT = 0.7; }
      if (!G.alarmKinds.has(kind) && n.radioT == null) n.radioT = 2.6;
    } else if (n.state !== 'flee' && n.state !== 'report' && n.state !== 'cower') {
      toState(n, 'flee'); n.reportKind = 'crime'; n.reportOutfit = kind; n.reportName = G.P.outfit.name; n.reportPos = { x: G.P.x, y: G.P.y };
      AI.say(n, pick(LN().flee));
    }
    G.stats.compromised = true;
  }
  AI.engage = engage;
  AI.witness = function (n, crime) {
    if (n.state === 'dead' || n.state === 'ko') return;
    if (!n.hostileKinds.has(G.P.outfit.kind)) remember(n, 'Saw a stranger dressed as ' + G.P.outfit.name + ' ' + crime + '.');
    engage(n);
  };
  function challenge(n, cause) {
    toState(n, 'challenge'); n.cause = cause; n.lostT = 0;
    AI.say(n, pick(cause === 'trespass' ? LN().trespass : LN().enforcer));
    G.sfx('spot');
  }
  function trigger(n, cause) {
    if (cause === 'weapon' || cause === 'suspect') { AI.say(n, pick(LN().weapon)); engage(n); return; }
    if (n.lookout) { AI.say(n, "That's them. Boss, GO!"); G.spookSuspects(); toState(n, 'cower'); n.cowerT = 20; return; }
    if (n.armed || dist(n.x, n.y, G.P.x, G.P.y) < 60) challenge(n, cause);
    else {
      toState(n, 'report'); n.reportKind = 'suspicious'; n.reportOutfit = G.P.outfit.kind; n.reportName = G.P.outfit.name; n.reportPos = { x: G.P.x, y: G.P.y };
      AI.say(n, pick(LN().susp));
    }
  }

  // ------------------------------------------------------------------ perception
  function canSee(n, x, y, range) {
    const d = dist(n.x, n.y, x, y);
    if (d > range) return false;
    if (d > 20 && Math.abs(angDiff(n.dir, Math.atan2(y - n.y, x - n.x))) > n.fov / 2) return false;
    return G.los(n.x, n.y - 4, x, y - 4);
  }
  AI.canSee = canSee;

  function perceive(n, dt) {
    const P = G.P;
    if (P.ghost) return;
    const range = n.viewRange * (G.blackout > 0 ? 0.5 : 1) * (P.sneak ? 0.85 : 1);
    const d = dist(n.x, n.y, P.x, P.y);
    const sees = !P.hidden && canSee(n, P.x, P.y, range);
    n.sees = sees;
    if (!sees) {
      if (n.state !== 'challenge' && n.state !== 'escort') n.sus = Math.max(0, n.sus - 13 * dt);
      return;
    }
    n.lastSeen = { x: P.x, y: P.y, t: G.time };
    const kind = P.outfit.kind;
    if (n.hostileKinds.has(kind)) { if (n.state !== 'hunt' && n.state !== 'flee' && n.state !== 'report' && n.state !== 'cower') engage(n); return; }
    if (P.crime) { AI.witness(n, P.crime); return; }
    if (n.state === 'talk' || n.state === 'challenge' || n.state === 'escort' || n.state === 'hunt' || n.state === 'flee' || n.state === 'report' || n.state === 'follow') return;
    let rate = 0, cause = null;
    const df = clamp(1.7 - (d / range) * 1.35, 0.35, 1.6), heat = 1 + G.heat / 120;
    if (n.trustT <= 0) {
      if (P.trespass) {
        const r = n.armed ? 62 : n.kind === 'civ' ? (P.room && P.room.tier >= 3 ? 20 : 0) : 26;
        if (r) { rate = r; cause = 'trespass'; }
      }
      if ((n.enforcer && n.kind === kind) || n.lookout) { if (44 > rate) { rate = n.lookout ? 30 : 44; cause = 'enforcer'; } }
      if (n.wary.has(kind) && rate < 16) { rate = 16; cause = 'enforcer'; }
    }
    if (P.weaponOut && !((kind === 'guard' || kind === 'elite') && P.weaponOut === 'gun')) { rate = 130; cause = 'weapon'; }
    if (rate) {
      n.sus += rate * df * heat * dt; n.susCause = cause;
      if (n.sus > 28 && (n.state === 'routine' || n.state === 'chat' || n.state === 'errand')) { n.resume = n.state === 'errand' ? 'errand' : 'routine'; const keep = n.path; toState(n, 'notice'); n.keepPath = n.resume === 'errand' ? keep : null; if (Math.random() < 0.5) AI.say(n, pick(LN().susp), 1.6); }
      if (n.sus >= 100) { n.sus = 100; trigger(n, cause); }
    } else {
      if ((P.running || P.sneak) && d < 64 && n.kind !== 'civ' && n.sus < 40) n.sus += 9 * dt;
      else n.sus = Math.max(0, n.sus - 9 * dt);
    }
  }

  function scanBodies(n) {
    if (n.state === 'hunt' || n.state === 'flee' || n.state === 'report' || n.state === 'talk') return;
    for (const b of G.npcs) {
      if (!b.body || b.hiddenIn || b === n || n.knownBodies.has(b.id) || b === G.P.dragging) continue;
      if (!canSee(n, b.x, b.y, n.viewRange * (G.blackout > 0 ? 0.5 : 0.9))) continue;
      n.knownBodies.add(b.id);
      const room = G.roomAtPx(b.x, b.y);
      const where = room ? room.name : 'outside';
      if (b.accident) {
        if (!b.reported) { b.reported = true; G.stats.accidentsFound++; G.heat = Math.min(100, G.heat + 3); G.toast('An "accident" was discovered', 'info'); }
        remember(n, 'Saw that ' + b.name + ' died in a terrible accident in the ' + where + '.');
        AI.learn(n, { id: 'acc:' + b.id, kind: 'body', say: 'Did you hear? ' + b.first + ' died in some freak accident in the ' + where + '. Awful.' });
        AI.say(n, pick(['Oh my god... an accident!', 'Someone call a doctor! The lamp fell on them!', "Is... is that " + b.first + "? Oh no."]));
        toState(n, 'cower'); n.cowerT = 6;
        if (b.isTarget && G.bodyguardsOf) G.bodyguardsOf(b);
        return;
      }
      if (!b.reported) {
        b.reported = true; G.stats.bodiesFound++; G.heat = Math.min(100, G.heat + (b.state === 'dead' ? 22 : 12));
        G.toast(b.state === 'dead' ? 'BODY FOUND' : 'UNCONSCIOUS PERSON FOUND', 'bad');
        if (b.suspect || b.isTarget) G.spookSuspects();
      }
      remember(n, 'Found ' + b.name + (b.state === 'dead' ? ' dead' : ' unconscious') + ' in the ' + where + '.');
      AI.learn(n, { id: 'body:' + b.id, kind: 'body', room: room ? room.id : null, say: b.state === 'dead' ? 'They found ' + b.first + ' dead in the ' + where + '!' : 'Someone knocked ' + b.first + ' out cold in the ' + where + '.', text: null });
      AI.say(n, pick(b.state === 'dead' ? LN().body : LN().kofound));
      if (n.armed || b.state === 'ko') { toState(n, 'investigate'); n.inv = { x: b.x, y: b.y, kind: 'body', body: b }; }
      else { toState(n, 'flee'); n.reportKind = 'body'; n.reportPos = { x: b.x, y: b.y }; n.reportBody = b; }
      return;
    }
  }

  AI.hear = function (n, nz) {
    if (n.state === 'dead' || n.state === 'ko' || n.state === 'hunt' || n.state === 'talk' || n.state === 'flee' || n.state === 'report') return false;
    const calm = n.state === 'routine' || n.state === 'chat' || n.state === 'notice' || n.state === 'errand';
    if (nz.type === 'gunshot') {
      remember(n, 'Heard gunshots.');
      if (n.armed) { toState(n, 'search'); n.searchT = 16; n.lastSeen = { x: nz.x, y: nz.y, t: G.time }; AI.say(n, pick(LN().gunshot)); }
      else if (n.state !== 'cower') { toState(n, 'cower'); n.cowerT = 14; if (Math.random() < 0.4) AI.say(n, pick(LN().gunshot)); }
      return true;
    }
    if (!calm) return false;
    if (nz.type === 'step') { face(n, nz.x, nz.y); return false; }
    if (n.isTarget && nz.type !== 'thud') { face(n, nz.x, nz.y); return false; }
    toState(n, 'investigate'); n.inv = { x: nz.x, y: nz.y, kind: nz.type, prop: nz.prop };
    AI.say(n, pick(nz.type === 'coin' ? LN().coin : nz.type === 'radio' ? LN().radio : LN().noise), 2);
    return true;
  };

  // ------------------------------------------------------------------ death / KO
  function drop(n) {
    if (n.armed && !n.dropped) G.dropItem('pistol', n.x + 6, n.y + 4, { n: 6 });
    if (n.hasKeycard) { G.dropItem('keycard', n.x - 6, n.y + 5); n.hasKeycard = false; }
    if (n.courier && !n.dropped) G.dropItem('package', n.x - 5, n.y - 3);
    n.dropped = true;
  }
  AI.down = function (n, lethal, method) {
    if (n.state === 'dead') return;
    const wasKo = n.state === 'ko';
    if (G.dialog && G.dialog.npc === n) SC.Talk.close(true);
    release(n); toState(n, lethal ? 'dead' : 'ko');
    n.body = true; n.sus = 0; n.moving = false; n.sees = false; n.radioT = null;
    if (!wasKo) { n.downAt = G.time; n.downDir = Math.random() < 0.5 ? 1 : -1; }
    n.accident = method === 'accident';
    n.sawAttacker = !lethal && n.hostileKinds.has(G.P.outfit.kind) ? G.P.outfit.kind : null;
    drop(n);
    if (lethal) {
      if (method !== 'poison') G.blood(n.x, n.y);
      if (n.isTarget) G.targetDown(n, method);
      else { if (!n.suspect) G.stats.nonTargetKills++; if (wasKo) G.stats.kos = Math.max(0, G.stats.kos - 1); }
    } else if (!wasKo) G.stats.kos++;
    G.sfx(lethal ? 'kill' : 'thud');
  };

  // ------------------------------------------------------------------ per-state behaviour
  const WALK = 31, BRISK = 52, RUN = 78;
  function routine(n, dt) {
    if (n.follow) {
      const f = n.follow;
      if (f.state === 'dead' || f.state === 'ko') { n.follow = null; return; }
      if (f.state !== 'sick') { if (!chase(n, f.x, f.y, dt, f.moving ? WALK + 6 : WALK, 26)) return; }
      n.act = 'idle';
      if (Math.random() < dt * 0.5) n.dir += (Math.random() - 0.5) * 1.6;
      return;
    }
    if (n.path) {
      if (step(n, dt, n.isTarget ? WALK - 3 : WALK)) arrive(n);
      return;
    }
    if (n.arriving) {
      const s = n.spot;
      if (s && dist(n.x, n.y, s.x * TS + 8, s.y * TS + 9) > 6 && setPath(n, s.x * TS + 8, s.y * TS + 9)) return;
      arrive(n); return;
    }
    n.actT -= dt;
    activity(n, dt);
    if (n.actT <= 0) nextSpot(n);
  }
  function arrive(n) {
    n.arriving = false;
    const s = n.spot;
    if (!s) { n.actT = 3; return; }
    n.dir = s.dir; n.act = n.post === s ? 'post' : s.kind;
    const [a, b] = ACT_TIME[n.act] || [6, 12];
    n.actT = a + Math.random() * (b - a);
    if (n.isTarget || n.suspect) n.actT *= 1.5 * (n.actMul || 1);
    n.sipT = 2.5;
    n.lamp = null;
    for (const p of G.map.props) if (p.rigged && !p.fallen && dist(n.x, n.y, (p.x + 0.5) * TS, (p.y + 1) * TS) < 28) { n.lamp = p; n.lampT = 1.2; break; }
    if (n.seenHabits && ['smoke', 'eat', 'drink', 'read'].includes(s.kind)) n.habitNow = { smoke: 'smoker', eat: 'foodie', drink: 'drinker', read: 'bookworm' }[s.kind]; else n.habitNow = null;
  }
  function activity(n, dt) {
    const s = n.spot;
    if ((n.act === 'drink' || n.act === 'eat') && s && s.prop && n.sipT > 0) {
      n.sipT -= dt;
      if (n.sipT <= 0 && s.prop.poison) {
        const kind = s.prop.poison; s.prop.poison = null;
        if (kind === 'lethal') { AI.say(n, 'Hrk—! I... can\'t...', 2); n.dying = 1.6; }
        else { AI.say(n, pick(LN().sick)); toState(n, 'sick'); n.sickT = 26; release(n); }
      }
    }
    if (n.lamp) {
      n.lampT -= dt;
      if (n.lampT <= 0) {
        const L = n.lamp; n.lamp = null;
        if (L.rigged && !L.fallen && dist(n.x, n.y, (L.x + 0.5) * TS, (L.y + 1) * TS) < 30) {
          L.rigged = false; L.fallen = true; L.solid = false; G.map.solid[L.y * G.map.w + L.x] = 0;
          for (const lt of G.map.lights) if (lt.lamp && Math.abs(lt.x - (L.x * TS + 8)) < 2 && Math.abs(lt.y - (L.y * TS - 4)) < 2) lt.dead = true;
          G.noise(n.x, n.y, 90, 'thud'); G.shake = 0.15; G.sfx('thud');
          for (let k = 0; k < 14; k++) G.particles.push({ x: (L.x + 0.5) * TS, y: L.y * TS + 4, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 60, g: 220, life: 0.5, t: 0, c: k % 2 ? '#fee761' : '#c0cbdc', s: 1 });
          // anyone standing right under it goes down too
          for (const o of G.npcs) if (o !== n && !o.body && o.state !== 'gone' && dist(o.x, o.y, (L.x + 0.5) * TS, (L.y + 1) * TS) < 20) AI.down(o, true, 'accident');
          AI.down(n, true, 'accident');
          return;
        }
      }
    }
    if (n.dying != null) { n.dying -= dt; if (n.dying <= 0) { n.dying = null; AI.down(n, true, 'poison'); } return; }
    if (n.act === 'smoke' && Math.random() < dt * 2.2) G.puff(n.x + Math.cos(n.dir) * 4, n.y - 16, 'smoke');
    if (n.act === 'post' || n.act === 'patrol' || n.act === 'idle') { if (Math.random() < dt * 0.35) n.lookT = 1.4; if (n.lookT > 0) { n.lookT -= dt; n.dir += Math.sin(G.time * 2 + n.id) * dt * 1.3; } else if (s) n.dir = SC.turnToward(n.dir, s.dir, dt * 2); }
    if (n.act === 'dance') n.dir += Math.sin(G.time * 3 + n.id) * dt * 2.5;
    // strike up a conversation
    if (n.chatCD <= 0 && n.actT > 3 && !n.dying && n.act !== 'post' && n.act !== 'toilet' && !n.isTarget) {
      n.chatCD = 2;
      for (const o of G.npcs) {
        if (o === n || o.state !== 'routine' || o.path || o.arriving || o.chatCD > 6 || o.actT < 2 || o.follow || o.dying || o.isTarget || o.act === 'post') continue;
        if (dist(n.x, n.y, o.x, o.y) > 52 || !G.los(n.x, n.y - 6, o.x, o.y - 6)) continue;
        SC.Talk.startChat(n, o);
        break;
      }
    }
  }

  const STATES = {
    routine,
    notice(n, dt) {
      face(n, G.P.x, G.P.y, dt);
      if (n.sus < 12 && !n.sees) {
        if (Math.random() < 0.3) AI.say(n, pick(LN().lost), 1.6);
        n.state = n.resume || 'routine'; if (n.keepPath) { n.path = n.keepPath; n.keepPath = null; }
      }
    },
    chat(n, dt) {
      const o = n.chatWith;
      if (!o || o.state !== 'chat') { toState(n, 'routine'); return; }
      face(n, o.x, o.y, dt);
      n.chatT -= dt;
      if (n.chatT <= 0) {
        const fa = AI.shareable(n, o), fb = AI.shareable(o, n);
        AI.learn(o, fa); AI.learn(n, fb);
        n.chatCD = 14 + Math.random() * 22; o.chatCD = 14 + Math.random() * 22;
        toState(n, 'routine');
      }
    },
    talk(n, dt) { face(n, G.P.x, G.P.y, dt); if (!G.dialog || G.dialog.npc !== n) n.state = 'routine'; },
    challenge(n, dt) {
      const P = G.P;
      n.lostT = n.sees ? 0 : n.lostT + dt;
      if (n.lostT > 4.5 || P.hidden) {
        AI.say(n, pick(LN().searching)); toState(n, 'search'); n.searchT = 16;
        if (n.armed) n.radioT = 2; else { toState(n, 'report'); n.reportKind = 'suspicious'; n.reportOutfit = P.outfit.kind; n.reportName = P.outfit.name; n.reportPos = n.lastSeen; }
        return;
      }
      const tgt = n.sees ? P : n.lastSeen || P;
      if (chase(n, tgt.x, tgt.y, dt, BRISK + 6, 26) && n.sees && !G.dialog) SC.Talk.open(n, n.cause);
      if (n.sees) face(n, P.x, P.y, dt);
    },
    escort(n, dt) {
      const P = G.P;
      n.escortT -= dt;
      chase(n, P.x, P.y, dt, BRISK + 12, 24);
      if (n.sees) face(n, P.x, P.y, dt);
      const clear = n.cause === 'trespass' ? !P.trespass : !n.sees;
      if (clear) { n.clearT = (n.clearT || 0) + dt; if (n.clearT > (n.cause === 'trespass' ? 0.8 : 3)) { AI.say(n, 'And stay out.'); n.sus = 35; n.trustT = 6; toState(n, 'routine'); n.actT = 2; n.clearT = 0; return; } } else n.clearT = 0;
      if (n.escortT < 5 && !n.warned) { n.warned = true; AI.say(n, pick(LN().lastwarn)); }
      if (n.escortT <= 0) { n.warned = false; if (n.armed) engage(n); else { toState(n, 'report'); n.reportKind = 'suspicious'; n.reportOutfit = P.outfit.kind; n.reportName = P.outfit.name; n.reportPos = { x: P.x, y: P.y }; } }
    },
    hunt(n, dt) {
      const P = G.P;
      n.fireT -= dt;
      if (n.sees) {
        n.lostT = 0; face(n, P.x, P.y, dt * 2);
        const d = dist(n.x, n.y, P.x, P.y);
        if (d > 84) chase(n, P.x, P.y, dt, RUN, 70); else n.path = null;
        if (n.fireT <= 0 && d < 170) { n.fireT = 0.75 + Math.random() * 0.55; G.npcShoot(n); }
      } else {
        n.lostT += dt;
        const ls = n.lastSeen || P;
        if (chase(n, ls.x, ls.y, dt, RUN, 10) || n.lostT > 9) { toState(n, 'search'); n.searchT = 18; AI.say(n, pick(LN().searching)); }
      }
    },
    search(n, dt) {
      n.searchT -= dt;
      if (n.searchT <= 0) { AI.say(n, pick(LN().giveup)); toState(n, 'routine'); n.actT = 1; n.sus = 30; return; }
      if (!n.path) {
        n.t += dt;
        n.dir += Math.sin(G.time * 2.4 + n.id) * dt * 2.4;
        if (n.t > 1.6) {
          n.t = 0;
          const ls = n.lastSeen || n;
          for (let k = 0; k < 6; k++) { const a = Math.random() * 6.28, r = 20 + Math.random() * 90; if (setPath(n, ls.x + Math.cos(a) * r, ls.y + Math.sin(a) * r)) break; }
        }
      } else step(n, dt, BRISK);
    },
    investigate(n, dt) {
      const v = n.inv;
      if (!v) { toState(n, 'routine'); return; }
      if (!n.invArrived) {
        if (chase(n, v.x, v.y, dt, v.kind === 'body' ? RUN : BRISK - 8, v.kind === 'body' ? 18 : 12) || n.t > 14) { n.invArrived = true; n.t = 0; }
        n.t += dt;
        return;
      }
      n.t += dt; n.dir += Math.sin(G.time * 2 + n.id) * dt * 1.6;
      const done = () => { n.invArrived = false; n.inv = null; toState(n, 'routine'); n.actT = 1; };
      if (v.kind === 'body') {
        const b = v.body;
        if (n.t > 2.6) {
          if (b.state === 'ko' && !b.hiddenIn && b !== G.P.dragging) AI.wake(b);
          else if (b.state === 'dead') { G.alertGuards(b.x, b.y, 380); if (n.armed) { toState(n, 'search'); n.searchT = 18; n.lastSeen = { x: b.x, y: b.y }; n.invArrived = false; n.inv = null; return; } }
          done();
        }
      } else if (v.kind === 'radio') { if (n.t > 1.5) { if (v.prop) v.prop.on = false; done(); } }
      else if (v.kind === 'fuse') { if (n.t > 4) { G.blackout = 0; if (v.prop) v.prop.broken = false; G.toast('Power restored'); done(); } }
      else if (n.t > 4) { if (Math.random() < 0.5) AI.say(n, pick(LN().lost), 1.6); done(); }
    },
    flee(n, dt) {
      const P = G.P;
      n.t += dt;
      if (!n.path && n.t < 0.2) { const a = Math.atan2(n.y - P.y, n.x - P.x); for (let k = 0; k < 6; k++) { const b = a + (Math.random() - 0.5) * 1.6; if (setPath(n, n.x + Math.cos(b) * 90, n.y + Math.sin(b) * 90)) break; } }
      step(n, dt, RUN);
      if (n.t > 1.6) { toState(n, 'report'); }
    },
    report(n, dt) {
      n.t += dt;
      const g = n.reportTo && n.reportTo.state !== 'dead' && n.reportTo.state !== 'ko' ? n.reportTo : (n.reportTo = nearestGuard(n));
      if (!g) { toState(n, 'cower'); n.cowerT = 20; return; }
      if (!n.telling) {
        if (chase(n, g.x, g.y, dt, n.reportKind === 'suspicious' ? BRISK : RUN, 28) && G.los(n.x, n.y, g.x, g.y)) {
          n.telling = 1.4;
          const what = n.reportKind === 'body' ? pick(LN().body) : fmt(pick(LN().report), { outfit: n.reportName });
          AI.say(n, n.reportKind === 'suspicious' ? "Security, there's someone odd dressed as a " + n.reportName + '.' : what);
        }
        return;
      }
      face(n, g.x, g.y, dt);
      n.telling -= dt;
      if (n.telling <= 0) {
        n.telling = null; n.reportTo = null;
        if (n.reportKind === 'crime') { G.raiseAlarm(n.reportOutfit, n.reportPos.x, n.reportPos.y, n.reportName); toState(n, 'cower'); n.cowerT = 16; }
        else if (n.reportKind === 'body') { if (g.state !== 'hunt') { toState(g, 'investigate'); g.inv = { x: n.reportPos.x, y: n.reportPos.y, kind: 'body', body: n.reportBody }; g.knownBodies.add(n.reportBody.id); } toState(n, 'cower'); n.cowerT = 12; }
        else { if (g.state === 'routine' || g.state === 'chat' || g.state === 'notice') { g.wary.add(n.reportOutfit); toState(g, 'search'); g.searchT = 14; g.lastSeen = n.reportPos; AI.say(g, "I'll look into it."); } toState(n, 'routine'); n.actT = 1; n.sus = 50; }
      }
    },
    cower(n, dt) { n.cowerT -= dt; if (n.cowerT <= 0) { toState(n, 'routine'); n.actT = 1; } },
    errand(n, dt) {
      if (n.path) { step(n, dt, BRISK - 6); return; }
      n.errandT -= dt; n.dir += Math.sin(G.time * 1.7 + n.id) * dt * 1.5;
      if (n.errandT <= 0) {
        if (n.errandWhy) {
          remember(n, 'A stranger dressed as ' + n.errandWhy.outfit + ' sent me to the ' + n.errandRoom.name + ' saying "' + n.errandWhy.text + '" — it was a lie.');
          n.liedTo++; n.wary.add(n.errandWhy.kind);
          AI.learn(n, { id: 'liar:' + n.errandWhy.kind, kind: 'liar', outfit: n.errandWhy.kind, say: 'Watch out for a stranger dressed as a ' + n.errandWhy.outfit + '. Sent me off for nothing.' });
          AI.say(n, pick(LN().liar)); n.errandWhy = null;
        }
        toState(n, 'routine'); n.actT = 0.5;
      }
    },
    follow(n, dt) {
      n.followT -= dt; n.trustT = 2;
      chase(n, G.P.x, G.P.y, dt, BRISK + 14, 24);
      if (n.followT <= 0 || G.P.hidden) { AI.say(n, "Look, I really have to get back."); remember(n, 'Followed a stranger dressed as ' + G.P.outfit.name + ' around for nothing.'); n.liedTo++; toState(n, 'routine'); n.actT = 0.5; }
    },
    wait(n, dt) { n.waitT -= dt; if (n.waitT <= 0) toState(n, 'routine'); },
    sick(n, dt) {
      if (!n.sickSpot) {
        const t = G.map.spots.filter((s) => s.kind === 'toilet');
        n.sickSpot = t.length ? pick(t) : n.spot || { x: Math.floor(n.x / TS), y: Math.floor(n.y / TS) };
        setPath(n, n.sickSpot.x * TS + 8, n.sickSpot.y * TS + 9);
      }
      if (n.path) { step(n, dt, BRISK); return; }
      n.dir = -Math.PI / 2; n.sickT -= dt;
      if (Math.random() < dt * 1.5) G.puff(n.x, n.y - 10, 'sick');
      if (n.sickT <= 0) { n.sickSpot = null; toState(n, 'routine'); n.actT = 0.5; }
    },
    escape(n, dt) {
      if (!n.path && !n.escaped) {
        let best = null, bd = 1e9;
        for (const e of G.map.exits) { const d = dist(n.x, n.y, e.x * TS, e.y * TS); if (d < bd) { bd = d; best = e; } }
        n.exitGoal = best;
        if (!setPath(n, best.x * TS + 8, best.y * TS + 8)) n.path = [{ x: best.x * TS + 8, y: best.y * TS + 8 }];
      }
      if (step(n, dt, RUN - 14)) { n.escaped = true; n.gone = true; n.state = 'gone'; G.suspectEscaped(n); }
    },
    gone() {},
  };

  AI.wake = function (b) {
    if (b.state !== 'ko') return;
    b.body = false; b.state = 'routine'; b.actT = 2; b.sus = 40; b.path = null;
    G.stats.kos = Math.max(0, G.stats.kos); AI.say(b, pick(LN().woke));
    remember(b, 'Was knocked unconscious by someone.');
    if (b.sawAttacker) G.raiseAlarm(b.sawAttacker, b.x, b.y, null);
    else G.heat = Math.min(100, G.heat + 10);
  };

  AI.update = function (n, dt) {
    if (n.state === 'dead' || n.state === 'ko' || n.state === 'gone') return;
    n.moving = false; n.anim += dt;
    if (n.held) return;
    if (n.trustT > 0) n.trustT -= dt;
    n.chatCD -= dt;
    if (n.radioT != null) {
      n.radioT -= dt;
      if (n.radioT <= 0) { n.radioT = null; AI.say(n, 'All units: suspect dressed as ' + G.P.outfit.name + '!', 2.5); G.raiseAlarm(G.P.outfit.kind, n.lastSeen ? n.lastSeen.x : n.x, n.lastSeen ? n.lastSeen.y : n.y, G.P.outfit.name); }
    }
    perceive(n, dt);
    if (n.state === 'dead' || n.state === 'ko') return;
    n.bodyT -= dt;
    if (n.bodyT <= 0) { n.bodyT = 0.3; scanBodies(n); }
    if (n.habitNow && n.seenHabits && G.P.canSeeNpc && G.P.canSeeNpc(n)) n.seenHabits.add(n.habitNow);
    (STATES[n.state] || routine)(n, dt);
  };
})();
