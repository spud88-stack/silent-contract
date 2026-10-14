// Mission runtime: world queries, player, interactions, combat, alarms, objectives.
(function () {
  const SC = window.SC, TS = 16;
  const { clamp, dist, angDiff } = SC;
  const Game = (SC.Game = {});
  let G = null;
  const AI = () => SC.AI;
  const ITEMS = () => SC.ITEMS;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  Game.start = function (mission, loadout) {
    const map = SC.MapGen.generate(mission.seed, mission.theme);
    SC.MapGen.bake(map);
    G = SC.G = {
      mission, map, rng: new SC.RNG(mission.seed ^ 0x5bd1e995), npcs: [], time: 0, heat: mission.alerted ? 30 : 0,
      alarmKinds: new Set(), intel: [], heard: [], rumors: [], bubbles: [], particles: [], decals: [], projectiles: [], timers: [], items: [],
      stats: { recorded: false, accidentsFound: 0, compromised: false, bodiesFound: 0, nonTargetKills: 0, kos: 0, disguiseChanges: 0, methods: [], shots: 0, safeOpened: false, courier: false, talked: 0, targetsHidden: false, time: 0 },
      blackout: 0, dialog: null, over: null, shake: 0, loot: 0, safeCode: false, marks: new Set(), tells: new Set(), prompts: [], status: {}, picked: [],
      targetsLeft: 0, objectiveDone: false, abortT: 0,
    };
    Object.assign(G, API);
    for (const it of map.items) G.items.push(Object.assign({}, it));
    G.cams = (map.cameras || []).map((c) => Object.assign({}, c, { a: c.base, t: Math.random() * 6, sus: 0, cool: 0 }));
    G.weather = mission.weather || null;
    const P = (G.P = {
      x: map.spawn.x, y: map.spawn.y, dir: -Math.PI / 2, moving: false, anim: 0, hp: 100, hurtT: 9,
      outfit: SC.SUIT, inv: [{ id: 'fists' }], hand: 0, sneak: false, running: false, hidden: null, dragging: null,
      crime: null, crimeT: 0, weaponOut: null, trespass: false, room: null, action: null, stepT: 0, ghost: !!mission.demo,
    });
    for (const it of loadout || []) Game.give(it.id, it.n);
    P.loadout = (loadout || []).map((x) => x.id);
    Game.setOutfit(SC.SUIT, true);
    SC.AI.bind(G);
    SC.AI.populate(mission);
    G.targetsLeft = G.targets.length;
    seedIntel();
    P.canSeeNpc = (n) => n.visible;
    G.cam = { x: P.x, y: P.y };
    return G;
  };
  Game.end = () => { if (G && G.dialog) SC.Talk.close(true); SC.G = G = null; };

  // ------------------------------------------------------------------ world queries
  const I = (x, y) => y * G.map.w + x;
  function doorAtTile(tx, ty) { const d = G.map.doorAt[I(tx, ty)]; return d >= 0 ? G.map.doors[d] : null; }
  function opaqueAt(tx, ty) {
    const m = G.map;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
    const i = I(tx, ty);
    if (m.opaque[i]) return true;
    const d = m.doorAt[i];
    return d >= 0 && m.doors[d].open < 0.5;
  }
  function blockedPx(x, y) {
    const m = G.map, tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
    const i = I(tx, ty);
    if (m.solid[i]) return true;
    const d = m.doorAt[i];
    return d >= 0 && m.doors[d].open < 0.5;
  }
  const canStand = (x, y) => !blockedPx(x - 3.5, y - 5) && !blockedPx(x + 3.5, y - 5) && !blockedPx(x - 3.5, y + 2) && !blockedPx(x + 3.5, y + 2);
  // blocked head-on: if a small sideways shift would free the way, drift that way
  function slide(P, axis, amt, freeAt) {
    for (let o = 1; o <= 9; o++) for (const s of [o, -o]) {
      if (!freeAt(s)) continue;
      const step = Math.sign(s) * Math.min(amt, Math.abs(s));
      const other = axis === 'x' ? 'y' : 'x';
      const at = (sideways, ahead) => (axis === 'x' ? canStand(P.x + sideways, ahead) : canStand(ahead, P.y + sideways));
      if (at(step, P[other])) P[axis] += step;
      else if (at(step, P.slideAhead)) { P[axis] += step; P[other] = P.slideAhead; }
      return;
    }
  }
  Game.opaqueAt = (tx, ty) => opaqueAt(tx, ty);

  function los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 4);
    let lt = -1;
    for (let k = 1; k < n; k++) {
      const t = k / n, tx = Math.floor((x0 + (x1 - x0) * t) / TS), ty = Math.floor((y0 + (y1 - y0) * t) / TS), key = ty * 1000 + tx;
      if (key === lt) continue;
      lt = key;
      if (opaqueAt(tx, ty)) return false;
    }
    return true;
  }

  // A* over tiles; locked doors only for those with access 3 (or once unlocked)
  function path(x0, y0, x1, y1, access) {
    const m = G.map, W = m.w, H = m.h;
    const pass = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      const i = ty * W + tx;
      if (m.solid[i]) return false;
      const d = m.doorAt[i];
      if (d >= 0 && m.doors[d].locked && access < 3) return false;
      return true;
    };
    const near = (px, py) => {
      let tx = Math.floor(px / TS), ty = Math.floor(py / TS);
      if (pass(tx, ty)) return [tx, ty];
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (pass(tx + dx, ty + dy)) return [tx + dx, ty + dy];
      return null;
    };
    const s = near(x0, y0), e = near(x1, y1);
    if (!s || !e) return null;
    if (s[0] === e[0] && s[1] === e[1]) return [{ x: e[0] * TS + 8, y: e[1] * TS + 9 }];
    const N = W * H, gS = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * W + s[0], ei = e[1] * W + e[0];
    const h = (i) => { const x = i % W, y = (i / W) | 0, dx = Math.abs(x - e[0]), dy = Math.abs(y - e[1]); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
    const open = new SC.Heap();
    gS[si] = 0; open.push({ i: si, f: h(si) });
    let it = 0;
    while (open.size && it++ < 6000) {
      const cur = open.pop().i;
      if (cur === ei) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!pass(nx, ny)) continue;
        if (dx && dy && (!pass(cx + dx, cy) || !pass(cx, cy + dy) || m.doorAt[cy * W + nx] >= 0 || m.doorAt[ny * W + cx] >= 0)) continue;
        const ni = ny * W + nx, g = gS[cur] + (dx && dy ? 1.414 : 1);
        if (g < gS[ni]) { gS[ni] = g; came[ni] = cur; open.push({ i: ni, f: g + h(ni) }); }
      }
    }
    if (came[ei] < 0) return null;
    const out = [];
    for (let c = ei; c !== si; c = came[c]) out.push({ x: (c % W) * TS + 8, y: ((c / W) | 0) * TS + 9 });
    return out.reverse();
  }

  // ------------------------------------------------------------------ API exposed on G (used by AI / Talk / HUD)
  const API = {
    los, path,
    roomAtPx(x, y) { const m = G.map, tx = Math.floor(x / TS), ty = Math.floor(y / TS); if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null; const r = m.roomAt[I(tx, ty)]; return r >= 0 ? m.rooms[r] : null; },
    bubble(e, text, dur, cls) { G.bubbles = G.bubbles.filter((b) => b.e !== e || (b.cls || '') !== (cls || '')); G.bubbles.push({ e, text, t: 0, dur: dur || 3, cls }); },
    lastBubble(e) { const b = G.bubbles.find((q) => q.e === e && !q.cls); return b ? b.text : null; },
    // everything said near you (or over a stolen radio) goes into the overheard feed
    hear(e, text, ai, radio) {
      const P = G.P;
      if (P.ghost || !text) return;
      if (!radio && dist(e.x, e.y, P.x, P.y) > 150) return;
      G.heard.push({ who: e.first || e.name, text, ai: !!ai, radio: !!radio, t: G.time, rt: performance.now() });
      if (G.heard.length > 120) G.heard.shift();
    },
    plantRumor(f) {
      if (!G.rumors.some((r) => r.id === f.id)) { G.rumors.push({ id: f.id, text: f.say, believers: new Set(), milestone: 0 }); G.toast('Rumor planted: "' + f.say + '"', 'intel'); }
    },
    rumorSpread(f, n) {
      const r = G.rumors.find((q) => q.id === f.id);
      if (!r) return;
      r.believers.add(n.id);
      G.stats.rumorReach = Math.max(G.stats.rumorReach || 0, r.believers.size);
      for (const m of [3, 6, 10, 15]) if (r.believers.size >= m && r.milestone < m) { r.milestone = m; G.toast('Your rumor is spreading — ' + m + ' people believe "' + r.text + '"', 'intel'); G.sfx('intel'); }
    },
    toast(text, cls) { SC.HUD && SC.HUD.toast(text, cls); },
    sfx(name) { SC.Audio && SC.Audio.play(name); },
    addIntel(f, via) {
      if (!f || !f.text || G.intel.includes(f.text)) return;
      G.intel.push(f.text);
      G.toast('INTEL · ' + f.text, 'intel');
      G.sfx('intel');
      if (f.grant) f.grant();
    },
    revealRoom() {},
    noise(x, y, r, type, extra) {
      const list = G.npcs.filter((n) => n.state !== 'dead' && n.state !== 'ko' && n.state !== 'gone' && dist(n.x, n.y, x, y) < r).sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
      let responders = type === 'gunshot' || type === 'step' ? 99 : type === 'thud' ? 3 : type === 'radio' || type === 'fuse' ? 1 : 2;
      for (const n of list) {
        if (responders <= 0) break;
        if (AI().hear(n, Object.assign({ x, y, type }, extra || {}))) responders--;
        else if (type === 'step') responders--;
      }
      if (type !== 'step') G.ripples = (G.ripples || []).concat([{ x, y, r, t: 0 }]);
    },
    raiseAlarm(kind, x, y, name) {
      const fresh = !G.alarmKinds.has(kind);
      G.alarmKinds.add(kind); G.stats.compromised = true;
      G.heat = Math.min(100, G.heat + 25);
      const oname = name || (kind === 'suit' ? 'Suit' : G.map.theme.outfits[kind] ? G.map.theme.outfits[kind].name : kind);
      const fact = { id: 'suspect:' + kind, kind: 'suspect', outfit: kind, say: 'Security is hunting someone dressed as a ' + oname + '. Stay away from them!' };
      for (const n of G.npcs) {
        if (n.state === 'dead' || n.state === 'ko' || n.state === 'gone') continue;
        if (n.armed) {
          AI().learn(n, fact); n.hostileKinds.add(kind);
          if (n.state !== 'hunt' && !n.follow && dist(n.x, n.y, x, y) < 460) { AI().toState(n, 'search'); n.searchT = 22; n.lastSeen = { x, y }; }
        } else if (dist(n.x, n.y, x, y) < 200) AI().learn(n, fact);
      }
      if (fresh) { G.toast('DISGUISE COMPROMISED · ' + oname.toUpperCase(), 'bad'); G.sfx('alarm'); }
      if (G.mission.showdown) G.spookSuspects();
      // a visitor does not stick around once there is trouble
      for (const t of G.targets) if (t.archetype === 'visitor' && t.leaveAt != null && t.state !== 'gone') t.leaveAt = Math.min(t.leaveAt, G.time + 8);
    },
    alertGuards(x, y, r) {
      G.heat = Math.min(100, G.heat + 10);
      for (const n of G.npcs) if (n.armed && (n.state === 'routine' || n.state === 'chat' || n.state === 'notice') && !n.follow && dist(n.x, n.y, x, y) < r) { AI().toState(n, 'search'); n.searchT = 16; n.lastSeen = { x, y }; }
    },
    spookSuspects() {
      if (!G.mission.showdown || G.spooked) return;
      G.spooked = true;
      for (const n of G.suspects) if (n.state !== 'dead' && n.state !== 'ko' && n.state !== 'gone') AI().toState(n, 'escape');
      G.toast('THE SUSPECTS ARE FLEEING — STOP THE LEADER', 'bad'); G.sfx('alarm');
    },
    suspectEscaped(n) {
      if (n.leader) Game.finish(false, 'The syndicate leader escaped.');
      else if (n.isTarget && !n.suspect) Game.finish(false, n.name + ' left the premises. The window closed.');
    },
    targetDown(n, method) {
      G.stats.methods.push(method);
      G.targetsLeft = G.targets.filter((t) => t.state !== 'dead').length;
      G.toast(n.leader ? 'SYNDICATE LEADER ELIMINATED' : 'TARGET ELIMINATED · ' + n.name.toUpperCase(), 'good');
      G.sfx('target');
      if (G.targetsLeft === 0) { G.objectiveDone = true; setTimeout(() => G && !G.over && G.toast('Contract complete — reach an exit', 'good'), 1400); }
    },
    dropItem(id, x, y, extra) { G.items.push(Object.assign({ id, x, y, drop: 0.3 }, extra || {})); },
    give(id, n) { Game.give(id, n); },
    blood(x, y) { G.decals.push({ type: 'blood', x, y, r: 0, max: 7 + Math.random() * 4, seed: Math.random() * 1000 }); for (let k = 0; k < 10; k++) G.particles.push({ x, y: y - 6, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.8) * 60, life: 0.5, t: 0, c: '#a22633', g: 160, s: 1 }); },
    puff(x, y, type) {
      const c = type === 'smoke' ? 'rgba(200,200,210,0.5)' : type === 'sick' ? 'rgba(140,200,90,0.8)' : type === 'dust' ? 'rgba(160,150,140,0.45)' : 'rgba(255,255,255,0.6)';
      G.particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: type === 'sick' ? 14 : -10 - Math.random() * 6, life: type === 'dust' ? 0.45 : 1.4, t: 0, c, s: type === 'dust' ? 2 : 2, grow: type !== 'dust' });
    },
    npcShoot(n) {
      const P = G.P, d = dist(n.x, n.y, P.x, P.y);
      const hit = Math.random() < clamp(0.92 - d / 210 - (P.moving ? (P.running ? 0.22 : 0.12) : 0) - (P.sneak ? 0.05 : 0) - (G.blackout > 0 ? 0.15 : 0), 0.12, 0.85);
      const a = Math.atan2(P.y - n.y, P.x - n.x) + (hit ? 0 : (Math.random() - 0.5) * 0.35);
      const ex = hit ? P.x : n.x + Math.cos(a) * 240, ey = hit ? P.y - 8 : n.y + Math.sin(a) * 240;
      G.projectiles.push({ tracer: true, x0: n.x + Math.cos(a) * 8, y0: n.y - 10, x1: ex, y1: ey, t: 0 });
      G.flash(n.x + Math.cos(a) * 9, n.y - 10);
      G.sfx('shot');
      if (!G.lastShotNoise || G.time - G.lastShotNoise > 1.2) { G.lastShotNoise = G.time; G.noise(n.x, n.y, 300, 'gunshot'); }
      if (hit) Game.hurt(n.kind === 'elite' ? 20 : 15);
    },
    flash(x, y) { G.particles.push({ x, y, vx: 0, vy: 0, life: 0.07, t: 0, c: '#fff3c4', s: 5, flash: true }); G.lightFlash = 0.08; },
  };
  Game.hurt = function (dmg) {
    const P = G.P;
    if (G.over) return;
    P.hp -= dmg; P.hurtT = 0; G.shake = 0.25;
    G.blood(P.x, P.y); G.sfx('hurt');
    if (P.hp <= 0) { P.hp = 0; Game.finish(false, 'You were killed.'); }
  };

  // ------------------------------------------------------------------ intel seeding
  function seedIntel() {
    const rng = G.rng, m = G.map;
    const roomName = (s) => (s && s.room >= 0 ? m.rooms[s.room].name : 'gardens');
    const give = (f, n, filter) => {
      const pool = G.npcs.filter((x) => !x.isTarget && !x.suspect && (!filter || filter(x)));
      for (const x of rng.take(pool, n)) x.facts.set(f.id, f);
    };
    const staffish = (x) => x.kind !== 'civ';
    for (const t of G.targets) {
      if (G.mission.showdown) break;
      const r0 = t.route[0];
      give({ id: 'tloc:' + t.id, say: t.first + '? Spends most of the night in the ' + roomName(r0) + '. Hates being disturbed.', text: t.name + ' spends most of the night in the ' + roomName(r0) + '.', grant: () => G.marks.add(t) }, 5);
      if (t.drinkSpot) {
        const ds = t.drinkSpot;
        give({ id: 'tdrink:' + t.id, say: t.first + ' always has a drink in the ' + roomName(ds) + '. Same glass, same spot, every time.', text: t.name + ' drinks from a set glass in the ' + roomName(ds) + ' — poison opportunity.', grant: () => { if (ds.prop) ds.prop.marked = true; } }, 4);
      }
      const AT = {
        recluse: [t.first + " hasn't left the private wing in days. Two bodyguards on the door, day and night.", t.name + ' never leaves the private wing and keeps two bodyguards.'],
        workaholic: [t.first + ' never stops working. Office, meeting, office. Hardly eats.', t.name + ' moves between work rooms all night, without an escort.'],
        chief: [t.first + ' runs security here. Knows every guard by face — a uniform will not fool them.', t.name + ' is head of security: armed, and sees through guard disguises.'],
        insider: ['That new ' + t.outfit.name.toLowerCase() + ', ' + t.first + '? Not really staff. The others are scared of them.', t.name + ' is hiding among the staff as a ' + t.outfit.name + '.'],
        smoker: [t.first + ' sneaks outside for a cigarette every chance they get. Alone, usually.', t.name + ' slips outside to smoke — an isolated opportunity.'],
        visitor: [t.first + " is only dropping by tonight. Arrives late, leaves early. Don't blink.", t.name + ' arrives late and leaves early — act inside the window.'],
        socialite: [t.first + ' is everywhere tonight. Drinking, laughing, shaking hands.', t.name + ' spends the night in the public areas.'],
      }[t.archetype];
      if (AT) give({ id: 'type:' + t.id, say: AT[0], text: AT[1], grant: () => G.marks.add(t) }, 5);
      // a rickety lamp beside one of the target's regular spots makes an accident possible
      const ls = t.route.find((s) => s.room >= 0 && ['work', 'sit', 'read', 'drink'].includes(s.kind)) || t.route[0];
      if (ls) {
        let lamp = m.props.find((p) => p.type === 'lamp' && dist((p.x + 0.5) * TS, (p.y + 1) * TS, ls.x * TS + 8, ls.y * TS + 9) < 26);
        if (!lamp) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]) {
          const x = ls.x + dx, y = ls.y + dy, i = y * m.w + x;
          if (m.tiles[i] !== SC.T.FLOOR || m.occ[i] || m.doorAt[i] >= 0 || m.spots.some((s) => s.x === x && s.y === y)) continue;
          lamp = { type: 'lamp', x, y, fw: 1, fh: 1, solid: false, tall: false, v: 0, room: m.roomAt[i] };
          m.props.push(lamp); m.occ[i] = lamp; break;
        }
        if (lamp) give({ id: 'tlamp:' + t.id, say: t.first + ' always parks right under that wobbly lamp in the ' + roomName(ls) + '. One of these days it is coming down.', text: 'A loose lamp stands beside ' + t.name + "'s spot in the " + roomName(ls) + ' — rig it with a wrench or crowbar for an accident.', grant: () => { lamp.marked = true; } }, 3);
      }
      const bg = G.npcs.find((x) => x.follow === t);
      if (bg) give({ id: 'tbg:' + t.id, say: t.first + ' never goes anywhere without ' + bg.first + ', the bodyguard. Except the bathroom, obviously.', text: t.name + "'s bodyguard leaves them alone only in the restroom." }, 3);
    }
    if (m.safe) {
      const code = String(rng.int(1000, 9999)), sr = m.rooms[m.safe.room];
      G.safeCodeValue = code;
      give({ id: 'safe', secret: 1, say: 'The safe in the ' + (sr ? sr.name : 'back') + "? Code's " + code + ". Don't spread it around.", text: 'Safe code is ' + code + ' (' + (sr ? sr.name : '?') + ').', grant: () => { G.safeCode = true; } }, 3, (x) => x.kind === 'guard' || x.kind === 'elite' || x.kind === 'staff');
    }
    const holder = G.npcs.find((x) => x.hasKeycard);
    if (holder) give({ id: 'keyholder', say: holder.first + ' — the ' + holder.outfit.name.toLowerCase() + ' — carries the master keycard. Never lets it out of sight.', text: holder.name + ' (' + holder.outfit.name + ') carries the master keycard.', grant: () => G.marks.add(holder) }, 4, staffish);
    const dz = G.items.find((it) => it.id === 'disguise');
    if (dz) { const r = G.roomAtPx(dz.x, dz.y); if (r) give({ id: 'uniforms', say: 'Spare uniforms are kept in the ' + r.name + '. Anyone could walk off with one.', text: 'Spare uniforms are kept in the ' + r.name + '.' }, 4, staffish); }
    const fuse = m.props.find((p) => p.use === 'fuse');
    if (fuse && fuse.room >= 0) give({ id: 'fuse', say: 'That fuse box in the ' + m.rooms[fuse.room].name + ' keeps tripping. Whole place goes dark and security goes blind.', text: 'The fuse box is in the ' + m.rooms[fuse.room].name + '. A blackout halves how far people can see.' }, 4, staffish);
    if (G.mission.showdown) {
      const L = G.leader;
      const desc = { hat: 'always wears a hat', glasses: 'wears glasses', necklace: 'wears a gold necklace', earring: 'wears an earring', smoker: 'keeps sneaking off to smoke', foodie: "can't stay away from the food", drinker: 'is never without a drink', bookworm: 'always has their nose in a book' };
      const tells = L.tells.look.concat(L.tells.habit);
      G.tellList = tells.map((k) => ({ key: k, text: desc[k] }));
      const known = [L.tells.look[0], L.tells.habit[0]];
      for (const k of known) G.tells.add(k);
      for (const k of tells) if (!known.includes(k)) give({ id: 'tell:' + k, secret: 1, say: "The real boss tonight? Word is they " + desc[k] + '. Pretends to be just another guest.', text: 'The leader ' + desc[k] + '.', grant: () => G.tells.add(k) }, 4);
      for (const s of G.suspects) s.name = s.first + ' ' + s.last;
    }
    if (G.courier) give({ id: 'courier', say: "See the nervous one, " + G.courier.first + "? Carrying a package for the boss. Cash, I'd bet.", text: G.courier.name + ' is a courier carrying a package of cash.', grant: () => G.marks.add(G.courier) }, 4);
    // gossip with no gameplay value, so chatter feels like people
    const civs = G.npcs.filter((x) => !x.isTarget && !x.suspect);
    for (let k = 0; k < 8; k++) {
      const a = rng.pick(civs), b = rng.pick(civs);
      if (a === b) continue;
      const lines = [a.first + ' and ' + b.first + ' have been flirting all night. Somebody should tell them to get a room.', a.first + ' owes ' + b.first + ' a lot of money. Like, a LOT.', 'I heard ' + a.first + ' is getting fired tomorrow.', a.first + ' swears this building is haunted.', "Don't let " + a.first + ' near the bar again. Last time was a disaster.', a.first + ' has been asking weird questions about the security rota.'];
      give({ id: 'gossip' + k, say: rng.pick(lines) }, rng.int(2, 4));
    }
  }

  // ------------------------------------------------------------------ inventory + outfit
  Game.give = function (id, n) {
    const P = G.P, def = SC.ITEMS[id];
    if (!def) return;
    const have = P.inv.find((x) => x.id === id);
    if (have && (def.stack || def.gun)) { have.n = (have.n || 0) + (n || (def.gun ? def.ammo : 1)); return; }
    if (have && (def.tool || def.mission)) return;
    if (P.inv.length >= 8) { G.toast('Inventory full', 'warn'); return false; }
    P.inv.push({ id, n: n || (def.gun ? def.ammo : def.stack ? 1 : undefined) });
    return true;
  };
  function consume(slot) {
    const P = G.P, it = P.inv[slot];
    if (!it) return;
    if (it.n != null && it.n > 1) { it.n--; return; }
    P.inv.splice(slot, 1);
    if (P.hand >= P.inv.length) P.hand = 0;
  }
  const findSlot = (id) => G.P.inv.findIndex((x) => x.id === id);
  Game.setOutfit = function (o, silent) {
    const P = G.P;
    P.outfit = o;
    P.look = Object.assign({}, SC.PLAYER_LOOK, o.look, { hair: null, hairStyle: 2, beard: undefined, skirt: undefined, glasses: o.look.shades ? o.look.glasses : undefined });
    P.sheet = SC.Sprites.charSheet(P.look);
    if (!silent) { G.stats.disguiseChanges++; G.toast('Disguise · ' + o.name, 'info'); G.sfx('cloth'); }
  };

  // ------------------------------------------------------------------ player
  function setCrime(desc, t) { G.P.crime = desc; G.P.crimeT = t || 0.3; }
  function startAction(type, dur, done, opts) { G.P.action = Object.assign({ type, t: 0, dur, done }, opts || {}); G.P.moving = false; }

  function nearestNpc(maxD, filter) {
    const P = G.P;
    let best = null, bd = maxD;
    for (const n of G.npcs) {
      if (n.state === 'gone' || (filter && !filter(n))) continue;
      const d = dist(n.x, n.y, P.x, P.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  const behind = (n) => Math.abs(angDiff(n.dir, Math.atan2(G.P.y - n.y, G.P.x - n.x))) > 1.75;
  const alive = (n) => n.state !== 'dead' && n.state !== 'ko' && n.state !== 'gone';

  function subdue(n, lethal, method) {
    const P = G.P, quiet = behind(n) && n.state !== 'hunt';
    if (!quiet) { n.hostileKinds.add(P.outfit.kind); G.noise(n.x, n.y, 80, 'thud'); AI().say(n, pick(['Hey—!', 'What are you—', 'GET OFF ME!'])); }
    if (G.dialog && G.dialog.npc === n) SC.Talk.close(true);
    n.held = true; n.moving = false;
    const dur = method === 'wire' ? 1.1 : quiet ? 0.8 : 1.5;
    startAction('subdue', dur, () => { n.held = false; AI().down(n, lethal, method); }, { crime: 'attacking someone', target: n });
    G.sfx('struggle');
  }

  function meleeTarget(range) {
    const P = G.P, a = P.dir;
    return nearestNpc(range, (n) => alive(n) && Math.abs(angDiff(a, Math.atan2(n.y - P.y, n.x - P.x))) < 1.1);
  }

  function useHand() {
    const P = G.P; if (!P.inv[P.hand]) P.hand = 0;
    const it = P.inv[P.hand], def = SC.ITEMS[it.id];
    if (it.id === 'fists') { const n = meleeTarget(22); if (n) subdue(n, false, 'fists'); return; }
    if (it.id === 'wire') { const n = meleeTarget(22); if (!n) return; if (!behind(n) && n.state !== 'talk') { G.toast('Get behind them to use the wire', 'warn'); return; } subdue(n, true, 'wire'); return; }
    if (it.id === 'knife' || it.id === 'wrench' || it.id === 'crowbar') {
      const n = meleeTarget(24);
      G.swing = 0.18;
      if (!n) return;
      if (n.state === 'talk' && G.dialog) SC.Talk.close(true);
      setCrime(it.id === 'knife' ? 'stabbing someone' : 'attacking someone', 0.5);
      AI().down(n, it.id === 'knife', it.id === 'knife' ? 'knife' : 'melee');
      G.noise(n.x, n.y, it.id === 'knife' ? 40 : 56, 'thud');
      G.shake = 0.08;
      return;
    }
    if (def.gun) {
      if (!it.n) { G.toast('Out of ammo', 'warn'); G.sfx('click'); return; }
      if (P.fireCD > 0) return;
      P.fireCD = 0.35; it.n--; G.stats.shots++;
      const a = P.dir, x0 = P.x + Math.cos(a) * 8, y0 = P.y - 9;
      let hitN = null, ex = x0, ey = y0;
      for (let d = 0; d < 280; d += 3) {
        ex = x0 + Math.cos(a) * d; ey = y0 + Math.sin(a) * d;
        if (opaqueAt(Math.floor(ex / TS), Math.floor(ey / TS)) && G.map.tiles[I(Math.floor(ex / TS), Math.floor(ey / TS))] !== SC.T.WATER) break;
        hitN = G.npcs.find((n) => alive(n) && Math.abs(n.x - ex) < 6 && ey > n.y - 20 && ey < n.y + 2);
        if (hitN) break;
      }
      G.projectiles.push({ tracer: true, x0, y0, x1: ex, y1: ey, t: 0 });
      G.flash(x0, y0); G.shake = 0.12;
      G.sfx(def.loud > 10 ? 'shot' : 'silenced');
      G.noise(P.x, P.y, def.loud * TS, def.loud > 10 ? 'gunshot' : 'thud');
      setCrime('firing a gun', 0.6);
      if (hitN) {
        hitN.hp -= 100;
        G.blood(hitN.x, hitN.y);
        if (hitN.hp <= 0) AI().down(hitN, true, 'gun');
        else AI().engage(hitN);
      } else G.particles.push({ x: ex, y: ey, vx: 0, vy: 0, life: 0.15, t: 0, c: '#fee761', s: 2 });
      if (it.n === 0) G.toast('Last round fired', 'warn');
      return;
    }
    if (it.id === 'coin') throwItem();
    if (it.id === 'phone') {
      const n = G.hover;
      if (!n || n.body || !alive(n)) { G.toast('Point at someone you can see (or have marked) and click to call them', 'info'); return; }
      if (n.calls >= 2) { G.toast(n.first + ' is ignoring unknown numbers now', 'warn'); return; }
      if (!SC.Talk.canTalk(n)) { G.toast(n.first + " can't take a call right now", 'warn'); return; }
      SC.Talk.open(n, 'phone');
      return;
    }
    if (it.id === 'radio') SC.Talk.openRadio();
  }

  function throwItem() {
    const P = G.P, it = P.inv[P.hand];
    if (!it || it.id === 'fists') return;
    const def = SC.ITEMS[it.id];
    if (!['coin', 'knife', 'wrench', 'crowbar'].includes(it.id)) { G.toast("Can't throw that", 'warn'); return; }
    const mx = SC.Input.mouse.wx, my = SC.Input.mouse.wy;
    let d = Math.min(dist(P.x, P.y, mx, my), 170);
    const a = Math.atan2(my - P.y, mx - P.x);
    G.projectiles.push({ item: it.id, x: P.x, y: P.y - 8, a, d, s: it.id === 'coin' ? 200 : 260, travelled: 0, lethal: it.id === 'knife' });
    if (def.illegal || it.id !== 'coin') setCrime('throwing a weapon', 0.3);
    consume(P.hand);
    G.sfx('throw');
  }

  function propsNear(r) {
    const P = G.P, out = [];
    for (const p of G.map.props) {
      const cx = (p.x + p.fw / 2) * TS, cy = (p.y + p.fh) * TS - 6;
      const d = dist(P.x, P.y, cx, cy);
      if (d < r) out.push([p, d]);
    }
    return out.sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }

  function buildPrompts() {
    const P = G.P, pr = [];
    const add = (key, text, fn, warn) => { if (!pr.some((p) => p.key === key) || !fn) pr.push({ key, text, fn, warn }); };
    if (P.hidden) { add('E', 'Leave hiding spot', () => { P.hidden = null; G.sfx('door'); }); G.prompts = pr; return; }
    if (P.dragging) {
      const c = propsNear(26).find((p) => p.container && p.bodies.length < p.container);
      if (c) add('E', 'Hide body in ' + c.type, () => { const b = P.dragging; P.dragging = null; startAction('dump', 0.9, () => { c.bodies.push(b); b.hiddenIn = c; G.sfx('thud'); }, { crime: 'stuffing a body' }); });
      else add('E', 'Drop body', () => { P.dragging = null; });
      G.prompts = pr; return;
    }
    // bodies
    const body = nearestNpc(20, (n) => n.body && !n.hiddenIn);
    if (body) {
      add('E', 'Drag ' + (body.state === 'dead' ? 'body' : 'unconscious ' + body.first), () => { P.dragging = body; G.sfx('cloth'); });
      if (body.hasOutfit && body.outfit.kind !== P.outfit.kind) add('F', 'Take disguise · ' + body.outfit.name, () => startAction('disguise', 1.4, () => {
        const old = P.outfit;
        body.hasOutfit = false; body.look = SC.Sprites.strippedLook(body.look); body.sheet = SC.Sprites.charSheet(body.look);
        Game.setOutfit(body.outfit);
        G.dropItem('disguise', body.x + 8, body.y + 2, { outfit: old });
        for (const n of G.npcs) if (n.sees && alive(n)) n.hostileKinds.add(P.outfit.kind);
      }, { crime: 'changing clothes over a body' }));
    }
    // living NPC
    const npc = nearestNpc(26, (n) => alive(n) && !n.body);
    if (npc) {
      if (SC.Talk.canTalk(npc) && !G.dialog) add('T', 'Talk to ' + npc.first + (npc.isTarget && !npc.suspect ? ' (TARGET)' : ''), () => SC.Talk.open(npc, 'chat'));
      if (dist(npc.x, npc.y, P.x, P.y) < 22) add('Q', (behind(npc) ? 'Subdue ' : 'Attack ') + npc.first, () => subdue(npc, false, 'fists'), !behind(npc));
      if (dist(npc.x, npc.y, P.x, P.y) < 22 && behind(npc) && npc.state !== 'hunt' && SC.Talk.canTalk(npc) && !npc.isTarget) add('R', 'Grab & interrogate ' + npc.first, () => { SC.Talk.open(npc, 'interrogate'); G.sfx('struggle'); }, true);
    }
    // items on the floor
    let item = null, idist = 18;
    for (const it of G.items) { const d = dist(it.x, it.y, P.x, P.y); if (d < idist && !(it.drop > 0)) { idist = d; item = it; } }
    if (item) {
      if (item.id === 'disguise') {
        const o = item.outfit || { kind: item.kind, name: G.map.theme.outfits[item.kind].name, look: G.map.theme.outfits[item.kind].look };
        if (o.kind !== P.outfit.kind || o.name !== P.outfit.name) add('E', 'Change into ' + o.name, () => startAction('disguise', 1.2, () => { const old = P.outfit; G.items.splice(G.items.indexOf(item), 1); Game.setOutfit(o); G.dropItem('disguise', P.x + 6, P.y + 2, { outfit: old }); for (const n of G.npcs) if (n.sees && alive(n)) n.hostileKinds.add(P.outfit.kind); }, { crime: 'changing clothes' }));
      } else {
        add('E', 'Pick up ' + SC.ITEMS[item.id].name, () => {
          if (Game.give(item.id, item.n) === false) return;
          G.items.splice(G.items.indexOf(item), 1); G.sfx('pickup'); G.picked.push(item.id);
          if (item.id === 'package') { G.stats.courier = true; G.loot += 400; G.toast('+400 · courier package', 'good'); }
          if (SC.ITEMS[item.id].illegal) setCrime('picking up a weapon', 0.2);
        });
      }
    }
    // props
    for (const p of propsNear(24)) {
      if (p.hide && !P.dragging) add('E', 'Hide in ' + p.type, () => {
        if (G.npcs.some((n) => n.sees && alive(n) && (n.hostileKinds.has(P.outfit.kind) || n.state === 'challenge'))) { G.toast("Can't hide while they're watching", 'warn'); return; }
        P.hidden = p; P.x = (p.x + 0.5) * TS; G.sfx('door');
      });
      if (p.use === 'fuse' && !p.broken) add('E', 'Sabotage fuse box', () => startAction('fuse', 1.3, () => {
        p.broken = true; G.blackout = 50; G.toast('BLACKOUT · sight lines halved', 'info'); G.sfx('blackout');
        for (const n of G.npcs) if (alive(n) && Math.random() < 0.25) AI().say(n, pick(SC.LINES.blackout));
        G.timers.push({ t: 4, fn: () => { const fixer = G.npcs.filter((n) => alive(n) && (n.kind === 'worker' || n.armed) && !n.follow && (n.state === 'routine' || n.state === 'chat')).sort((a, b) => dist(a.x, a.y, p.x * TS, p.y * TS) - dist(b.x, b.y, p.x * TS, p.y * TS))[0]; if (fixer) { AI().toState(fixer, 'investigate'); fixer.inv = { x: p.x * TS + 8, y: (p.y + 1) * TS + 8, kind: 'fuse', prop: p }; AI().say(fixer, "I'll go check the fuse box."); } } });
      }, { crime: 'sabotaging the power' }));
      if (p.use === 'radio') add('E', p.on ? 'Turn off radio' : 'Turn on radio (distraction)', () => { p.on = !p.on; p.radioT = 0.5; G.sfx('ui'); });
      if (p.use === 'safe' && !p.opened) {
        const lp = findSlot('lockpick') >= 0;
        if (G.safeCode) add('E', 'Open safe (code ' + G.safeCodeValue + ')', () => startAction('safe', 1.2, () => openSafe(p), { crime: 'opening the safe' }));
        else if (lp) add('E', 'Crack safe (lockpick)', () => startAction('safe', 4.5, () => openSafe(p), { crime: 'cracking a safe' }));
        else add('E', 'Safe — need a lockpick or the code', null, true);
      }
      if (p.use === 'recorder') {
        if (G.stats.recorded) add('E', 'Erase security footage', () => startAction('erase', 1.6, () => { G.stats.recorded = false; G.footageErased = true; G.toast('Security footage erased', 'good'); G.sfx('unlock'); }, { crime: 'tampering with the security system' }));
        else add('E', 'Security recorder — no footage of you', null);
      }
      if (p.type === 'lamp' && !p.fallen && !p.rigged && p.room >= 0) {
        const tool = findSlot('wrench') >= 0 || findSlot('crowbar') >= 0;
        if (tool) add('E', 'Rig lamp to fall (accident)', () => startAction('rig', 1.6, () => { p.rigged = true; G.toast('Lamp rigged — it will fall on whoever lingers beside it', 'info'); G.sfx('unlock'); }, { crime: 'sabotaging a lamp' }));
      }
      if ((p.drink || p.food) && !p.poison) {
        const le = findSlot('lethal'), em = findSlot('emetic');
        if (le >= 0) add('E', 'Poison drink (lethal)', () => startAction('poison', 1.0, () => { p.poison = 'lethal'; consume(le); G.toast('Drink poisoned'); }, { crime: 'tampering with a drink' }));
        if (em >= 0) add(le >= 0 ? 'F' : 'E', 'Poison drink (emetic)', () => startAction('poison', 1.0, () => { p.poison = 'emetic'; consume(em); G.toast('Drink spiked'); }, { crime: 'tampering with a drink' }));
      }
    }
    // locked doors
    for (const d of G.map.doors) {
      if (!d.locked || dist(P.x, P.y, d.x * TS + 8, d.y * TS + 8) > 24) continue;
      if (findSlot('keycard') >= 0) add('E', 'Unlock door (keycard)', () => { d.locked = false; G.sfx('unlock'); });
      else if (findSlot('lockpick') >= 0) add('E', 'Pick lock', () => startAction('lockpick', 3, () => { d.locked = false; G.sfx('unlock'); }, { crime: 'picking a lock' }));
      else if (findSlot('crowbar') >= 0) add('E', 'Force door (loud)', () => startAction('crowbar', 1.4, () => { d.locked = false; G.noise(d.x * TS, d.y * TS, 110, 'thud'); G.sfx('thud'); }, { crime: 'breaking a door' }));
      else add('E', 'Locked — keycard, lockpick or crowbar', null, true);
      break;
    }
    // exits
    for (const e of G.map.exits) {
      if (dist(P.x, P.y, e.x * TS + 8, e.y * TS + 8) > 22) continue;
      if (G.objectiveDone) add('E', 'Exfiltrate · ' + e.name, () => Game.finish(true, 'Exfiltrated via ' + e.name + '.'));
      else add('E', G.abortT > 0 ? 'Press E again to ABORT (contract failed)' : 'Abort mission · ' + e.name, () => { if (G.abortT > 0) Game.finish(false, 'You left with the contract incomplete.', true); else G.abortT = 2.5; }, true);
    }
    G.prompts = pr;
  }
  function openSafe(p) {
    p.opened = true; G.stats.safeOpened = true;
    const v = G.rng.int(5, 9) * 100; G.loot += v;
    G.toast('Safe opened · +' + v, 'good'); G.sfx('pickup');
  }

  function updatePlayer(dt) {
    const P = G.P, In = SC.Input;
    if (P.ghost) return;
    P.anim += dt; P.hurtT += dt; P.fireCD = (P.fireCD || 0) - dt;
    if (P.hurtT > 6 && P.hp < 100) P.hp = Math.min(100, P.hp + 7 * dt);
    if (P.crimeT > 0) { P.crimeT -= dt; if (P.crimeT <= 0) P.crime = null; }
    P.moving = false; P.running = false;
    // where am I
    const room = G.roomAtPx(P.x, P.y), onDoor = G.map.doorAt[I(Math.floor(P.x / TS), Math.floor(P.y / TS))] >= 0;
    if (room) P.room = room; else if (!onDoor) P.room = null;
    P.trespass = !!P.room && !SC.MapGen.allowed(P.room, P.outfit.kind);
    const it = P.inv[P.hand] || P.inv[0], def = SC.ITEMS[it.id];
    P.weaponOut = def.illegal && !P.hidden ? (def.gun ? 'gun' : 'blade') : null;
    if (P.dragging) setCrime('dragging a body', 0.2);
    if (P.action) {
      const a = P.action;
      a.t += dt;
      if (a.crime) setCrime(a.crime, 0.25);
      if (a.target && (a.target.state === 'dead' || a.target.state === 'ko')) { P.action = null; return; }
      if (a.t >= a.dur) { P.action = null; a.done(); }
      return;
    }
    if (G.dialog) { if (G.dialog.mode === 'interrogate') setCrime('holding someone in a chokehold', 0.3); return; }
    if (G.sayBox) return;
    buildPrompts();
    if (G.over) return;
    for (const p of G.prompts) {
      if (p.fn && In.pressed(p.key.toLowerCase())) { p.fn(); break; }
    }
    if (P.hidden) { P.weaponOut = null; return; }
    // inventory
    for (let k = 1; k <= 8; k++) if (In.pressed(String(k)) && P.inv[k - 1]) { P.hand = k - 1; G.sfx('tick'); }
    if (In.mouse.wheel) { P.hand = (P.hand + In.mouse.wheel + P.inv.length) % P.inv.length; G.sfx('tick'); }
    if (In.pressed('g') && P.hand > 0) { const x = P.inv[P.hand]; G.dropItem(x.id, P.x + Math.cos(P.dir) * 10, P.y + Math.sin(P.dir) * 6, { n: x.n }); P.inv.splice(P.hand, 1); P.hand = 0; G.sfx('drop'); }
    if (In.pressed('c') || In.pressed('control')) P.sneak = !P.sneak;
    if (In.pressed('y')) { SC.Shout.open(); return; }
    // movement
    let mx = (In.down('d') || In.down('arrowright') ? 1 : 0) - (In.down('a') || In.down('arrowleft') ? 1 : 0);
    let my = (In.down('s') || In.down('arrowdown') ? 1 : 0) - (In.down('w') || In.down('arrowup') ? 1 : 0);
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      P.running = In.down('shift') && !P.dragging;
      if (P.running) P.sneak = false;
      const sp = P.dragging ? 30 : P.sneak ? 36 : P.running ? 104 : 64;
      const nx = P.x + mx * sp * dt, ny = P.y + my * sp * dt;
      const stuck = !canStand(P.x, P.y);
      if (mx) {
        if (stuck || canStand(nx, P.y)) P.x = nx;
        else if (!my) { P.slideAhead = nx; slide(P, 'y', sp * dt, (o) => canStand(nx, P.y + o)); } // glide around corners into doorways
      }
      if (my) {
        if (stuck || canStand(P.x, ny)) P.y = ny;
        else if (!mx) { P.slideAhead = ny; slide(P, 'x', sp * dt, (o) => canStand(P.x + o, ny)); }
      }
      P.moving = true;
      P.stepT -= dt;
      if (P.stepT <= 0) {
        P.stepT = P.running ? 0.28 : P.sneak ? 0.55 : 0.4;
        if (!P.sneak) G.sfx('step');
        if (P.running) { G.noise(P.x, P.y, 56, 'step'); G.puff(P.x, P.y, 'dust'); }
      }
    }
    const aim = Math.atan2(In.mouse.wy - (P.y - 8), In.mouse.wx - P.x);
    P.dir = P.dragging && P.moving ? Math.atan2(my, mx) : aim;
    if (P.dragging) {
      const b = P.dragging, bx = P.x - Math.cos(P.dir) * 12, by = P.y - Math.sin(P.dir) * 8;
      b.x += (bx - b.x) * Math.min(1, dt * 10); b.y += (by - b.y) * Math.min(1, dt * 10);
    }
    if (In.mouse.lp) useHand();
    if (In.mouse.rp) throwItem();
  }

  // ------------------------------------------------------------------ simulation step
  function updateDoors(dt) {
    const P = G.P;
    for (const d of G.map.doors) {
      const cx = d.x * TS + 8, cy = d.y * TS + 8;
      let want = false;
      if (!P.ghost && !P.hidden && !d.locked && Math.abs(P.x - cx) < 20 && Math.abs(P.y - 4 - cy) < 22) want = true;
      if (!want) for (const n of G.npcs) {
        if (n.state === 'dead' || n.state === 'ko' || n.state === 'gone') continue;
        if (Math.abs(n.x - cx) < 20 && Math.abs(n.y - 4 - cy) < 22 && (!d.locked || n.access >= 3)) { want = true; break; }
      }
      if (want) d.hold = 0.7; else d.hold = (d.hold || 0) - dt;
      const target = d.hold > 0 ? 1 : 0, was = d.open;
      d.open = clamp(d.open + (target ? 1 : -1) * dt * 7, 0, 1);
      if ((was < 0.5) !== (d.open < 0.5) && dist(P.x, P.y, cx, cy) < 140) G.sfx('door');
    }
  }
  function updateProjectiles(dt) {
    for (let k = G.projectiles.length - 1; k >= 0; k--) {
      const p = G.projectiles[k];
      if (p.tracer) { p.t += dt; if (p.t > 0.09) G.projectiles.splice(k, 1); continue; }
      const st = p.s * dt;
      p.travelled += st;
      const nx = p.x + Math.cos(p.a) * st, ny = p.y + Math.sin(p.a) * st;
      let land = p.travelled >= p.d || blockedPx(nx, ny + 8) && G.map.tiles[I(Math.floor(nx / TS), Math.floor((ny + 8) / TS))] !== SC.T.WATER;
      if (p.item !== 'coin') {
        const hit = G.npcs.find((n) => alive(n) && Math.abs(n.x - nx) < 7 && ny > n.y - 22 && ny < n.y);
        if (hit) { AI().down(hit, p.lethal, p.lethal ? 'knife' : 'melee'); G.noise(hit.x, hit.y, 50, 'thud'); land = true; }
      }
      if (land) {
        G.projectiles.splice(k, 1);
        const lx = blockedPx(nx, ny + 8) ? p.x : nx, ly = blockedPx(nx, ny + 8) ? p.y + 8 : ny + 8;
        G.items.push({ id: p.item, x: lx, y: ly, n: p.item === 'coin' ? 1 : undefined });
        G.noise(lx, ly, p.item === 'coin' ? 110 : 70, p.item === 'coin' ? 'coin' : 'thud');
        G.sfx(p.item === 'coin' ? 'coin' : 'thud');
      } else { p.x = nx; p.y = ny; }
    }
  }
  function updateParticles(dt) {
    for (let k = G.particles.length - 1; k >= 0; k--) {
      const p = G.particles[k];
      p.t += dt;
      if (p.t >= p.life) { G.particles.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
    }
    for (const d of G.decals) if (d.r < d.max) d.r += dt * 9;
    for (const it of G.items) if (it.drop > 0) it.drop -= dt;
    if (G.ripples) { for (const r of G.ripples) r.t += dt; G.ripples = G.ripples.filter((r) => r.t < 0.6); }
    if (G.particles.length > 400) G.particles.splice(0, G.particles.length - 400);
  }
  // visitors arrive through the main gate and leave on a schedule
  function updateSchedules() {
    for (const n of G.npcs) {
      if (n.arriveAt != null && n.state === 'gone' && G.time >= n.arriveAt) {
        const e = G.map.exits[0];
        n.x = e.x * TS + 8 + (n.follow ? 6 : 0); n.y = e.y * TS + 8; n.arriveAt = null;
        AI().toState(n, 'routine'); n.actT = 0; n.spot = null;
        if (n.isTarget) { G.toast(n.name + ' has arrived at the ' + e.name, 'info'); G.sfx('intel'); }
      }
      if (n.leaveAt != null && G.time >= n.leaveAt && alive(n) && !n.body) {
        n.leaveAt = null; AI().toState(n, 'escape');
        G.toast(n.name + ' is leaving — stop them before they reach an exit!', 'bad'); G.sfx('alarm');
      }
    }
  }
  function updateCams(dt) {
    const P = G.P;
    for (const c of G.cams) {
      c.t += dt; c.cool -= dt;
      c.a = c.base + Math.sin(c.t * 0.6) * c.sweep;
      c.off = G.blackout > 0;
      c.sees = false;
      if (c.off || P.ghost || P.hidden) { c.sus = Math.max(0, c.sus - 30 * dt); continue; }
      const d = dist(c.x, c.y, P.x, P.y - 6);
      if (d > 120 || Math.abs(angDiff(c.a, Math.atan2(P.y - 6 - c.y, P.x - c.x))) > 0.5 || !los(c.x + Math.cos(c.a) * 14, c.y + 4 + Math.sin(c.a) * 14, P.x, P.y - 6)) { c.sus = Math.max(0, c.sus - 25 * dt); continue; }
      c.sees = true;
      if (P.crime) c.sus = 100; else if (P.trespass || G.alarmKinds.has(P.outfit.kind)) c.sus += 70 * dt; else c.sus = Math.max(0, c.sus - 10 * dt);
      if (c.sus >= 100 && c.cool <= 0) {
        c.cool = 10; c.sus = 60;
        if (!G.stats.recorded) G.toast('CAUGHT ON CAMERA — erase the footage at the security recorder', 'warn');
        G.stats.recorded = true; G.sfx('spot');
        const g = G.npcs.filter((n) => n.armed && (n.state === 'routine' || n.state === 'chat') && !n.follow).sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y))[0];
        if (g) {
          if (P.crime) { g.hostileKinds.add(P.outfit.kind); G.raiseAlarm(P.outfit.kind, P.x, P.y, P.outfit.name); }
          else { AI().toState(g, 'search'); g.searchT = 14; g.lastSeen = { x: P.x, y: P.y }; g.wary.add(P.outfit.kind); AI().say(g, 'Camera picked something up. Checking it out.'); }
        }
      }
    }
  }
  function computeStatus() {
    const P = G.P;
    let susMax = 0, combat = false, search = false, seen = 0, witness = 0;
    for (const n of G.npcs) {
      if (!alive(n)) continue;
      if (n.state === 'hunt') combat = true;
      if (n.state === 'search' && n.hostileKinds.has(P.outfit.kind)) search = true;
      if (n.state === 'flee' || n.state === 'report') { if (n.reportKind === 'crime') witness++; }
      if (n.sees) { seen++; susMax = Math.max(susMax, n.sus); }
    }
    const comp = G.alarmKinds.has(P.outfit.kind);
    let label = 'UNDETECTED', level = 0;
    if (combat) { label = 'COMBAT'; level = 4; }
    else if (search) { label = 'HUNTED'; level = 3; }
    else if (comp) { label = 'DISGUISE COMPROMISED'; level = 3; }
    else if (susMax > 1) { label = 'SUSPICIOUS'; level = 2; }
    else if (P.trespass) { label = 'TRESPASSING'; level = 1; }
    if (P.hidden) { label = 'HIDDEN'; level = combat ? 4 : 0; }
    G.status = { label, level, sus: combat ? 100 : Math.max(susMax, comp ? 60 : 0), seen, witness, trespass: P.trespass };
  }

  Game.update = function (realDt) {
    if (!G) return;
    const dt = Math.min(realDt, 0.05) * (G.dialog || G.sayBox ? 0.12 : 1);
    if (!G.over) {
      G.time += dt; G.stats.time += dt;
      if (G.abortT > 0) G.abortT -= realDt;
      updatePlayer(dt);
      updateDoors(dt);
      updateCams(dt);
      updateSchedules();
      for (const n of G.npcs) SC.AI.update(n, dt);
      SC.Talk.update(dt);
      for (let k = G.timers.length - 1; k >= 0; k--) { const t = G.timers[k]; t.t -= dt; if (t.t <= 0) { G.timers.splice(k, 1); t.fn(); } }
      for (const p of G.map.props) if (p.on) { p.radioT -= dt; if (p.radioT <= 0) { p.radioT = 2.4; G.noise((p.x + 0.5) * TS, (p.y + 1) * TS, 110, 'radio', { prop: p }); G.particles.push({ x: (p.x + 0.5) * TS + (Math.random() - 0.5) * 8, y: p.y * TS, vx: (Math.random() - 0.5) * 10, vy: -16, life: 1.2, t: 0, c: '#fee761', s: 2, note: true }); } }
      if (G.blackout > 0) { G.blackout -= dt; if (G.blackout <= 0) { G.blackout = 0; const f = G.map.props.find((p) => p.use === 'fuse'); if (f) f.broken = false; } }
      G.heat = Math.max(0, G.heat - dt * 0.4);
      computeStatus();
    }
    updateProjectiles(dt);
    updateParticles(dt);
    for (let k = G.bubbles.length - 1; k >= 0; k--) { const b = G.bubbles[k]; b.t += realDt; if (b.t > b.dur || (b.e.state && (b.e.state === 'dead' || b.e.state === 'ko'))) G.bubbles.splice(k, 1); }
    if (G.shake > 0) G.shake -= realDt;
    if (G.swing > 0) G.swing -= realDt;
    if (G.lightFlash > 0) G.lightFlash -= realDt;
  };

  Game.finish = function (success, reason, aborted) {
    if (!G || G.over) return;
    if (G.dialog) SC.Talk.close(true);
    G.stats.targetsHidden = G.targets.length > 0 && G.targets.every((t) => !!t.hiddenIn);
    G.over = { success, reason, aborted: !!aborted };
    G.sfx(success ? 'win' : 'fail');
    setTimeout(() => SC.Main && SC.Main.missionOver(G), success ? 900 : 1600);
  };
})();
