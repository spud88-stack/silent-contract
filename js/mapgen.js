// Procedural location generator: BSP building, tiered rooms, doors, furniture, activity spots, exits.
(function () {
  const SC = window.SC, S = SC.Sprites;
  const W = 66, H = 50, TS = 16;
  const T = (SC.T = { GROUND: 0, FLOOR: 1, WALL: 2, HEDGE: 3, WATER: 4 });
  const MG = (SC.MapGen = {});
  const FLOOR_OVERRIDE = { kitchen: 'tile', bathroom: 'tile', laundry: 'tile', dance: 'dance', vault: 'metal', server: 'metal', storage: 'concrete', utility: 'concrete', warehouse: 'concrete', lab: 'tile' };
  const UTILITY = { utility: 1, server: 1, storage: 1, warehouse: 1 };
  // extra names per tier so a large building never repeats a room name
  const FILL = {
    0: [['Reception', 'foyer'], ['Side Lounge', 'lounge'], ['Exhibition Room', 'gallery'], ['Private Dining', 'dining'], ['Terrace Room', 'lounge'], ['Cocktail Bar', 'bar']],
    1: [['Prep Kitchen', 'kitchen'], ['Supply Closet', 'storage'], ['Break Room', 'lounge'], ['Changing Room', 'locker'], ['Janitor Closet', 'utility'], ['Linen Room', 'laundry'], ['Staff Office', 'cubicles']],
    2: [['Monitoring Room', 'security'], ['Storeroom', 'storage'], ['Briefing Room', 'boardroom'], ['Equipment Room', 'utility'], ['Records Office', 'office'], ['Evidence Locker', 'storage']],
    3: [['Private Study', 'office'], ['Guest Suite', 'bedroom'], ['Panic Room', 'vault'], ['Private Bar', 'vip'], ['Dressing Suite', 'bedroom'], ['Trophy Room', 'gallery']],
  };

  MG.generate = function (seed, themeKey) {
    for (let a = 0; a < 40; a++) {
      const m = tryGen((seed + a * 7919) >>> 0, themeKey);
      if (m) return m;
    }
    throw new Error('map generation failed');
  };

  // may an outfit kind be in this room?
  MG.allowed = function (room, kind) {
    if (!room) return true;
    const lvl = SC.OUTFIT_LEVEL[kind] || 0;
    if (lvl >= room.tier) return true;
    if (kind === 'worker' && room.utility && room.tier <= 2) return true;
    return false;
  };

  function tryGen(seed, themeKey) {
    const rng = new SC.RNG(seed), theme = SC.THEMES[themeKey];
    const m = {
      w: W, h: H, seed, themeKey, theme,
      tiles: new Uint8Array(W * H), style: new Array(W * H).fill(theme.outdoor),
      solid: new Uint8Array(W * H), opaque: new Uint8Array(W * H),
      roomAt: new Int16Array(W * H).fill(-1), doorAt: new Int16Array(W * H).fill(-1),
      rooms: [], doors: [], props: [], lights: [], exits: [], items: [], spots: [],
      occ: new Array(W * H).fill(null), reserved: new Uint8Array(W * H),
    };
    const I = (x, y) => y * W + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

    for (let x = 0; x < W; x++) { m.tiles[I(x, 0)] = T.HEDGE; m.tiles[I(x, H - 1)] = T.HEDGE; }
    for (let y = 0; y < H; y++) { m.tiles[I(0, y)] = T.HEDGE; m.tiles[I(W - 1, y)] = T.HEDGE; }
    const waterRows = theme.water ? 5 : 0;
    for (let y = 0; y < waterRows; y++) for (let x = 0; x < W; x++) { m.tiles[I(x, y)] = T.WATER; m.style[I(x, y)] = 'water'; }

    // ---- building footprint: a corridor spine, side wings with their own corridors, rooms off them
    const bx = rng.int(8, 11), by = rng.int(7, 9) + (theme.water ? 3 : 0);
    const bw = W - bx - rng.int(8, 11), bh = H - by - rng.int(9, 11);
    function split(r) {
      const maxS = rng.int(8, 12);
      const canV = r.w >= 11, canH = r.h >= 11;
      let vertical;
      if (r.w > maxS && canV && (r.w >= r.h || !(r.h > maxS && canH))) vertical = true;
      else if (r.h > maxS && canH) vertical = false;
      else return [r];
      if (vertical) {
        const sx = r.x + rng.int(5, r.w - 6);
        return split({ x: r.x, y: r.y, w: sx - r.x + 1, h: r.h }).concat(split({ x: sx, y: r.y, w: r.x + r.w - sx, h: r.h }));
      }
      const sy = r.y + rng.int(5, r.h - 6);
      return split({ x: r.x, y: r.y, w: r.w, h: sy - r.y + 1 }).concat(split({ x: r.x, y: sy, w: r.w, h: r.y + r.h - sy }));
    }
    const SW = 5; // corridor rects are 5 wide: 3 walkable tiles between shared walls
    const sx = bx + Math.floor(bw / 2) - 2 + rng.int(-4, 4);
    const sy = by + Math.round(bh * rng.range(0.42, 0.56));
    const spineS = { x: sx, y: sy, w: SW, h: by + bh - sy, hall: 'S' };
    const spineN = { x: sx, y: by, w: SW, h: sy - by + 1, hall: 'N' };
    let leaves = [spineS, spineN];
    const wings = [{ x: bx, y: by, w: sx - bx + 1, h: bh, side: 'W' }, { x: sx + SW - 1, y: by, w: bx + bw - (sx + SW - 1), h: bh, side: 'E' }];
    const sideHalls = [];
    for (const wg of wings) {
      if (wg.h >= 18 && rng.chance(0.9)) {
        const hy = rng.int(wg.y + 6, wg.y + wg.h - 12);
        const hall = { x: wg.x, y: hy, w: wg.w, h: SW, hall: wg.side };
        sideHalls.push(hall); leaves.push(hall);
        leaves = leaves.concat(split({ x: wg.x, y: wg.y, w: wg.w, h: hy - wg.y + 1 }), split({ x: wg.x, y: hy + SW - 1, w: wg.w, h: wg.y + wg.h - (hy + SW - 1) }));
      } else leaves = leaves.concat(split(wg));
    }
    // carve courtyards out of corners
    let removed = 0;
    leaves = leaves.filter((r) => {
      if (r.hall) return true;
      const cornerX = r.x === bx || r.x + r.w === bx + bw, cornerY = r.y === by || r.y + r.h === by + bh;
      if (cornerX && cornerY && removed < 2 && leaves.length - removed > 14 && r.w * r.h < 120 && rng.chance(0.45)) { removed++; return false; }
      return true;
    });
    if (leaves.length < 12) return null;
    leaves.forEach((r, i) => {
      r.id = i; r.adj = []; r.doors = []; r.spots = [];
      r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
        if (edge) m.tiles[I(x, y)] = T.WALL;
        else { m.tiles[I(x, y)] = T.FLOOR; m.roomAt[I(x, y)] = i; }
      }
    });
    m.rooms = leaves;

    // ---- adjacency
    const edges = [];
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      for (const [p, q] of [[a, b], [b, a]]) {
        if (p.x + p.w - 1 === q.x) {
          const y0 = Math.max(p.y, q.y) + 1, y1 = Math.min(p.y + p.h, q.y + q.h) - 2;
          if (y1 - y0 >= 0) edges.push({ a: p.id, b: q.id, vert: true, x: q.x, lo: y0, hi: y1, hall: !!(p.hall || q.hall) });
        }
        if (p.y + p.h - 1 === q.y) {
          const x0 = Math.max(p.x, q.x) + 1, x1 = Math.min(p.x + p.w, q.x + q.w) - 2;
          if (x1 - x0 >= 0) edges.push({ a: p.id, b: q.id, vert: false, y: q.y, lo: x0, hi: x1, hall: !!(p.hall || q.hall) });
        }
      }
    }

    // ---- spanning tree from the main hall; rooms prefer to open onto corridors
    const entrance = spineS;
    const depth = new Array(leaves.length).fill(-1);
    depth[entrance.id] = 0;
    const tree = [];
    let frontier = edges.filter((e) => e.a === entrance.id || e.b === entrance.id);
    while (frontier.length) {
      const hallEdges = frontier.filter((e) => e.hall);
      const pool = hallEdges.length && rng.chance(0.8) ? hallEdges : frontier;
      const e = pool[rng.int(0, pool.length - 1)];
      frontier.splice(frontier.indexOf(e), 1);
      const na = depth[e.a] >= 0, nb = depth[e.b] >= 0;
      if (na && nb) continue;
      const from = na ? e.a : e.b, to = na ? e.b : e.a;
      depth[to] = depth[from] + 1; e.tree = true; tree.push(e);
      for (const f of edges) if (!f.tree && (f.a === to || f.b === to)) frontier.push(f);
    }
    if (depth.some((d) => d < 0)) return null;

    // ---- tiers: graph depth blended with distance from the front door
    const fdx = sx + 2, fdy = by + bh - 1;
    for (const r of leaves) r.key = depth[r.id] * 0.55 + Math.hypot(r.cx - fdx, r.cy - fdy) / 13 + rng.next() * 0.5;
    const order = leaves.slice().sort((a, b) => a.key - b.key);
    order.splice(order.indexOf(entrance), 1); order.unshift(entrance);
    const n = leaves.length, c0 = Math.round(n * 0.3), c1 = Math.round(n * 0.3), c3 = Math.max(2, Math.round(n * 0.16));
    order.forEach((r, i) => { r.tier = i < c0 ? 0 : i < c0 + c1 ? 1 : i < n - c3 ? 2 : 3; r.depth = depth[r.id]; });
    entrance.tier = 0;
    if (spineN.tier < 1) spineN.tier = 1;
    for (const h of sideHalls) h.tier = Math.min(h.tier, 2);
    let fixed = true;
    while (fixed) {
      fixed = false;
      for (const e of tree) {
        const p = depth[e.a] < depth[e.b] ? leaves[e.a] : leaves[e.b], c = p === leaves[e.a] ? leaves[e.b] : leaves[e.a];
        if (c.tier < p.tier && !(c.hall && c.tier >= p.tier - 1)) { c.tier = p.tier; fixed = true; }
      }
    }

    // ---- doors
    function addDoor(x, y, horiz, a, b) {
      const ta = a >= 0 ? leaves[a].tier : 0, tb = b >= 0 ? leaves[b].tier : 0;
      const tier = Math.max(ta, tb);
      const d = { id: m.doors.length, x, y, h: horiz, a, b, tier, locked: tier === 3 && Math.min(ta, tb) < 3, open: 0, outer: b < 0 };
      m.tiles[I(x, y)] = T.FLOOR; m.doorAt[I(x, y)] = d.id;
      const fr = horiz ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]];
      d.fronts = fr;
      // keep a two-tile approach clear on both sides
      for (const [fx, fy] of fr) {
        if (!inb(fx, fy)) continue;
        m.reserved[I(fx, fy)] = 1;
        const gx = fx + (fx - x), gy = fy + (fy - y);
        if (inb(gx, gy)) m.reserved[I(gx, gy)] = 1;
      }
      m.doors.push(d);
      if (a >= 0) leaves[a].doors.push(d);
      if (b >= 0) leaves[b].doors.push(d);
      return d;
    }
    for (const e of edges) {
      const ra = leaves[e.a], rb = leaves[e.b];
      const diff = Math.abs(ra.tier - rb.tier);
      if (!e.tree) {
        const p = e.hall ? (diff <= 1 ? 0.75 : 0.25) : diff <= 1 ? (diff === 0 ? 0.35 : 0.15) : 0;
        if (!rng.chance(p)) continue;
      }
      // prefer the middle of the shared wall so doors line up with how people walk
      const mid = (e.lo + e.hi) / 2, span = Math.max(0, Math.floor((e.hi - e.lo) / 3));
      const pos = SC.clamp(Math.round(mid + rng.int(-span, span)), e.lo, e.hi);
      if (e.vert) addDoor(e.x, pos, false, e.a, e.b); else addDoor(pos, e.y, true, e.a, e.b);
      ra.adj.push(rb.id); rb.adj.push(ra.id);
    }
    const fx = sx + 2;
    const front = addDoor(fx, by + bh - 1, true, entrance.id, -1);
    front.front = true;
    // service entrance at the outer end of a side corridor; back door at the north end of the spine
    let backDoor = null, sideExit = null;
    for (const h of rng.shuffle(sideHalls.slice())) {
      const ox = h.hall === 'W' ? h.x : h.x + h.w - 1, oy = h.y + 2;
      if (m.tiles[I(h.hall === 'W' ? ox - 1 : ox + 1, oy)] !== T.GROUND) continue;
      const d = addDoor(ox, oy, false, h.id, -1);
      if (!backDoor) { backDoor = d; sideExit = { x: h.hall === 'W' ? 1 : W - 2, y: oy, side: h.hall }; }
    }
    if (!backDoor) {
      for (const r of rng.shuffle(leaves.filter((r) => r.tier === 1 && !r.hall))) {
        const y = r.y + Math.floor(r.h / 2);
        if (r.x === bx && m.tiles[I(r.x - 1, y)] === T.GROUND) { backDoor = addDoor(r.x, y, false, r.id, -1); sideExit = { x: 1, y, side: 'W' }; break; }
        if (r.x + r.w === bx + bw && m.tiles[I(r.x + r.w, y)] === T.GROUND) { backDoor = addDoor(r.x + r.w - 1, y, false, r.id, -1); sideExit = { x: W - 2, y, side: 'E' }; break; }
      }
    }
    if (!sideExit) return null;
    const northDoor = addDoor(sx + 2, by, true, spineN.id, -1);
    if (northDoor.tier >= 2) northDoor.locked = true;

    // ---- room types
    const smallOrder = leaves.filter((r) => r.tier <= 1 && !r.hall).sort((a, b) => a.w * a.h - b.w * b.h);
    const bathroom = smallOrder[0];
    const used = new Set();
    for (let t = 0; t < 4; t++) {
      const list = theme.rooms[t].slice();
      const mand = t === 0 ? 1 : t === 1 ? 3 : 1;
      const pool = list.slice(0, mand).concat(rng.shuffle(list.slice(mand)), rng.shuffle(FILL[t].slice()));
      const rs = rng.shuffle(leaves.filter((r) => r.tier === t && r !== bathroom && !r.hall));
      // the biggest public room gets the showpiece (ballroom / dance floor / loading bay)
      if (t === 0) rs.sort((a, b) => b.w * b.h - a.w * a.h);
      let k = 0;
      for (const r of rs) {
        let def = pool[k++ % pool.length], tries = 0;
        while (used.has(def[0]) && tries++ < pool.length) def = pool[k++ % pool.length];
        r.name = used.has(def[0]) ? def[0] + ' Annex' : def[0]; r.kind = def[1];
        used.add(r.name);
      }
    }
    if (bathroom) { bathroom.name = 'Restroom'; bathroom.kind = 'bathroom'; }
    const HALL_NAMES = ['Hall', 'Service Corridor', 'Security Corridor', 'Private Corridor'];
    for (const r of leaves) if (r.hall) {
      r.kind = 'hall';
      r.name = r.hall === 'S' ? (theme.hallName || 'Main Hall') : (r.hall === 'N' ? 'North ' : r.hall === 'W' ? 'West ' : 'East ') + HALL_NAMES[r.tier];
    }
    for (const r of leaves) {
      r.utility = !!UTILITY[r.kind];
      r.floor = r.hall ? (r.tier === 0 ? theme.floors[0][0] : r.tier >= 2 ? theme.floors[2][0] : theme.floors[1][1]) : FLOOR_OVERRIDE[r.kind] || rng.pick(theme.floors[r.tier]);
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) m.style[I(x, y)] = r.floor;
    }
    for (const d of m.doors) m.style[I(d.x, d.y)] = leaves[d.a].floor;

    // ---- placement helpers
    const walkable = (x, y) => inb(x, y) && (m.tiles[I(x, y)] === T.FLOOR || m.tiles[I(x, y)] === T.GROUND);
    const free = (x, y) => walkable(x, y) && !m.occ[I(x, y)] && !m.reserved[I(x, y)] && m.doorAt[I(x, y)] < 0;
    function put(type, x, y, o) {
      o = o || {};
      const fw = o.fw || 1, fh = o.fh || 1;
      for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) if (!free(x + dx, y + dy)) return null;
      const p = { type, x, y, fw, fh, solid: o.solid !== false, tall: !!o.tall, v: rng.int(0, 3), color: o.color, room: m.roomAt[I(x, y)] };
      if (o.extra) Object.assign(p, o.extra);
      for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) {
        m.occ[I(x + dx, y + dy)] = p;
        if (p.solid) m.solid[I(x + dx, y + dy)] = 1;
        if (p.tall) m.opaque[I(x + dx, y + dy)] = 1;
      }
      m.props.push(p);
      return p;
    }
    function spot(x, y, kind, dir, prop) {
      if (!walkable(x, y) || m.solid[I(x, y)] || m.doorAt[I(x, y)] >= 0) return null;
      const s = { x, y, kind, dir, room: m.roomAt[I(x, y)], prop: prop || null, user: null };
      m.spots.push(s); m.reserved[I(x, y)] = 1;
      return s;
    }
    function ring0(r, sides) {
      const x0 = r.x + 1, y0 = r.y + 1, x1 = r.x + r.w - 2, y1 = r.y + r.h - 2, out = [];
      for (const s of sides) {
        if (s === 'n') for (let x = x0; x <= x1; x++) out.push([x, y0, 0, 1]);
        if (s === 's') for (let x = x0; x <= x1; x++) out.push([x, y1, 0, -1]);
        if (s === 'w') for (let y = y0 + 1; y < y1; y++) out.push([x0, y, 1, 0]);
        if (s === 'e') for (let y = y0 + 1; y < y1; y++) out.push([x1, y, -1, 0]);
      }
      return out;
    }
    function innerTiles(r, pad) {
      pad = pad == null ? 2 : pad;
      const out = [];
      for (let y = r.y + 1 + pad; y <= r.y + r.h - 2 - pad; y++) for (let x = r.x + 1 + pad; x <= r.x + r.w - 2 - pad; x++) out.push([x, y]);
      return out;
    }
    function wallPut(r, type, count, o) {
      o = o || {};
      const cands = rng.shuffle(ring0(r, o.sides || ['n', 'n', 'w', 'e', 's'])), placed = [];
      for (const [x, y, dx, dy] of cands) {
        if (placed.length >= count) break;
        const p = put(type, x, y, o);
        if (!p) continue;
        placed.push(p);
        if (o.spot) { const s = spot(x + dx * (o.fh || 1), y + dy * (o.fh || 1), o.spot, Math.atan2(-dy, -dx), p); p.spot = s; }
      }
      return placed;
    }
    const lonely = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (m.solid[I(x + dx, y + dy)] && m.tiles[I(x + dx, y + dy)] !== T.WALL) return false; return true; };
    function innerPut(r, type, count, o) {
      o = o || {};
      const placed = [];
      for (const [x, y] of rng.shuffle(innerTiles(r, o.pad))) {
        if (placed.length >= count) break;
        if (o.spaced !== false && !lonely(x, y)) continue;
        if (o.fw === 2 && !lonely(x + 1, y)) continue;
        const p = put(type, x, y, o);
        if (!p) continue;
        placed.push(p);
        if (o.spot) {
          for (const [dx, dy] of rng.shuffle([[0, 1], [0, -1], [1, 0], [-1, 0]])) {
            const sx = x + (dx > 0 ? (o.fw || 1) - 1 + dx : dx), sy = y + dy;
            if (walkable(sx, sy) && !m.occ[I(sx, sy)] && !m.solid[I(sx, sy)]) { p.spot = spot(sx, sy, o.spot, Math.atan2(-dy, -dx), p); break; }
          }
        }
      }
      return placed;
    }
    function tableGroup(r, type, count, extra) {
      for (const t of innerPut(r, type, count, { extra })) {
        let first = true;
        for (const [dx, dy] of rng.shuffle([[0, 1], [0, -1], [1, 0], [-1, 0]])) {
          const x = t.x + dx, y = t.y + dy;
          if (!free(x, y) || !rng.chance(first ? 1 : 0.55)) continue;
          if (put('chair', x, y, { solid: false })) { const s = spot(x, y, extra && extra.drink && first ? 'drink' : 'sit', Math.atan2(-dy, -dx), t); if (first) t.spot = s; first = false; }
        }
      }
    }
    function seats(r, type, count, color) {
      for (const p of wallPut(r, type, count, { solid: false, color, sides: ['n', 'w', 'e'] })) spot(p.x, p.y, 'sit', Math.PI / 2, p);
    }
    function idle(r, count, kind) {
      const c = rng.shuffle(innerTiles(r, 1));
      let k = 0;
      for (const [x, y] of c) { if (k >= count) break; if (free(x, y) && spot(x, y, kind || 'idle', rng.range(0, 6.28))) k++; }
    }
    const item = (id, x, y, extra) => m.items.push(Object.assign({ id, x: x * TS + 8, y: y * TS + 8 }, extra || {}));
    function itemNear(r, id, extra) {
      for (const [x, y] of rng.shuffle(innerTiles(r, 1))) if (free(x, y)) { item(id, x, y, extra); m.reserved[I(x, y)] = 1; return true; }
      return false;
    }
    const area = (r) => (r.w - 2) * (r.h - 2);
    const sofaCol = rng.pick(['#7a2f4a', '#2f4a78', '#3e6a4a', '#5c4a6e', '#733e39']);

    const FURN = {
      foyer(r) { if (theme.reception) wallPut(r, 'reception', 1, { sides: ['n'], fw: 2, spot: 'work' }); else wallPut(r, 'desk', 1, { sides: ['n'], spot: 'work' }); wallPut(r, 'plant', 3, { tall: false }); seats(r, 'sofa', 2, sofaCol); wallPut(r, 'lamp', 2, { extra: { light: 1 } }); innerPut(r, 'statue', 1); idle(r, 5, 'mingle'); },
      ballroom(r) { wallPut(r, 'piano', 1, { sides: ['n'], fw: 2, spot: 'play' }); wallPut(r, 'foodTable', 2, { spot: 'eat', extra: { food: true } }); wallPut(r, 'tableCloth', 2, { spot: 'drink', extra: { drink: true } }); wallPut(r, 'lamp', 3, { extra: { light: 1 } }); wallPut(r, 'plant', 2); idle(r, 4 + Math.floor(area(r) / 14), 'mingle'); },
      bar(r) {
        const y = r.y + 3, x0 = r.x + 3, x1 = r.x + r.w - 4;
        if (r.h >= 8 && x1 - x0 >= 2) {
          for (let x = x0; x <= x1; x++) { const b = put('bar', x, y, { extra: { drink: (x - x0) % 2 === 0 } }); if (b && b.drink) b.spot = spot(x, y + 1, 'drink', -Math.PI / 2, b); }
          spot(Math.floor((x0 + x1) / 2), y - 1, 'bartend', Math.PI / 2);
          wallPut(r, 'shelfBottles', 4, { sides: ['n'], tall: true });
        } else wallPut(r, 'bar', 3, { spot: 'drink', extra: { drink: true } });
        tableGroup(r, 'table', 2, { drink: true }); seats(r, 'sofa', 2, sofaCol); wallPut(r, 'radio', 1, { sides: ['w', 'e'], extra: { use: 'radio' } }); wallPut(r, 'plant', 1); idle(r, 3, 'mingle');
      },
      dining(r) { tableGroup(r, 'tableCloth', Math.max(2, Math.floor(area(r) / 16)), { drink: true }); wallPut(r, 'foodTable', 2, { spot: 'eat', extra: { food: true } }); wallPut(r, 'plant', 2); wallPut(r, 'lamp', 1, { extra: { light: 1 } }); idle(r, 3, 'mingle'); },
      gallery(r) { if (theme.frames) wallPut(r, 'frame', Math.max(2, Math.floor(r.w / 3)), { sides: ['n'], tall: true, spot: 'admire' }); innerPut(r, 'display', Math.max(2, Math.floor(area(r) / 18)), { spot: 'admire' }); innerPut(r, 'statue', 1, { spot: 'admire' }); seats(r, 'bench', 2); wallPut(r, 'plant', 2); idle(r, 4, 'mingle'); },
      lounge(r) { seats(r, 'sofa', 4, sofaCol); innerPut(r, 'pooltable', 1, { fw: 2, spot: 'play' }); wallPut(r, 'radio', 1, { extra: { use: 'radio' } }); wallPut(r, 'bookshelf', 2, { sides: ['n'], tall: true, spot: 'read' }); wallPut(r, 'lamp', 2, { extra: { light: 1 } }); wallPut(r, 'plant', 2); tableGroup(r, 'table', 1, { drink: true }); idle(r, 3, 'mingle'); },
      kitchen(r) {
        wallPut(r, 'stove', 2, { sides: ['n'], spot: 'cook' }); wallPut(r, 'sink', 1, { sides: ['n'], spot: 'cook' }); wallPut(r, 'fridge', 1, { sides: ['n'], tall: true }); wallPut(r, 'counter', 2, { sides: ['n', 'w', 'e'], spot: 'cook' });
        wallPut(r, 'freezer', 1, { sides: ['w', 'e', 's'], extra: { container: 2, bodies: [] } }); innerPut(r, 'counter', 2, { spot: 'cook' });
        itemNear(r, 'knife'); if (rng.chance(0.6)) itemNear(r, 'emetic'); idle(r, 2);
      },
      locker(r) {
        wallPut(r, 'locker', Math.min(5, r.w - 4), { sides: ['n'], tall: true, extra: { hide: true, container: 1, bodies: [] } });
        for (const p of innerPut(r, 'bench', 2, { solid: false })) spot(p.x, p.y, 'sit', Math.PI / 2, p);
        wallPut(r, 'washer', 1, { sides: ['w', 'e'] });
        itemNear(r, 'disguise', { kind: r.tier >= 2 ? 'guard' : rng.pick(['staff', 'worker']) }); if (rng.chance(0.5)) itemNear(r, 'coin'); idle(r, 3);
      },
      laundry(r) { wallPut(r, 'washer', 3, { sides: ['n', 'w'], spot: 'cook' }); wallPut(r, 'dumpster', 1, { extra: { container: 2, bodies: [] } }); wallPut(r, 'wardrobe', 1, { sides: ['n'], tall: true, extra: { hide: true, container: 1, bodies: [] } }); itemNear(r, 'disguise', { kind: 'staff' }); if (rng.chance(0.5)) itemNear(r, 'disguise', { kind: 'worker' }); idle(r, 3); },
      storage(r) { if (theme.carts) wallPut(r, 'cart', 2); wallPut(r, 'crate', 4 + Math.floor(area(r) / 12), { tall: true }); wallPut(r, 'barrel', 2); innerPut(r, 'crate', 2, { tall: true }); wallPut(r, 'dumpster', 1, { extra: { container: 2, bodies: [] } }); itemNear(r, rng.pick(['wrench', 'crowbar'])); if (rng.chance(0.5)) itemNear(r, 'coin'); idle(r, 3); },
      utility(r) { wallPut(r, 'fusebox', 1, { sides: ['n'], spot: 'fix', extra: { use: 'fuse' } }); wallPut(r, 'console', 1, { sides: ['n', 'w', 'e'], spot: 'work' }); wallPut(r, 'crate', 3, { tall: true }); wallPut(r, 'locker', 1, { sides: ['n'], tall: true, extra: { hide: true, container: 1, bodies: [] } }); wallPut(r, 'barrel', 2); itemNear(r, 'wrench'); idle(r, 2); },
      security(r) { wallPut(r, 'console', 2, { sides: ['n'], spot: 'work' }); if (rng.chance(0.4)) itemNear(r, 'phone'); wallPut(r, 'locker', 2, { sides: ['n', 'w'], tall: true, extra: { hide: true, container: 1, bodies: [] } }); innerPut(r, 'table', 1); seats(r, 'sofa', 1, '#3a4466'); itemNear(r, 'keycard'); if (rng.chance(0.6)) itemNear(r, 'pistol'); idle(r, 3); },
      office(r) {
        innerPut(r, 'desk', 1, { spot: 'work' }); wallPut(r, 'bookshelf', 3, { sides: ['n'], tall: true, spot: 'read' }); seats(r, 'sofa', 1, sofaCol); wallPut(r, 'plant', 2); wallPut(r, 'lamp', 1, { extra: { light: 1 } });
        if (r.tier === 3 && !m.safe) { const s = wallPut(r, 'safe', 1, { sides: ['w', 'e', 'n'], extra: { use: 'safe' } })[0]; if (s) m.safe = s; }
        tableGroup(r, 'table', 1, { drink: true }); idle(r, 3);
      },
      bedroom(r) { wallPut(r, 'bed', 1, { sides: ['n'], fh: 2, color: sofaCol }); wallPut(r, 'wardrobe', 1, { sides: ['n'], tall: true, extra: { hide: true, container: 1, bodies: [] } }); wallPut(r, 'lamp', 2, { extra: { light: 1 } }); seats(r, 'sofa', 1, sofaCol); tableGroup(r, 'table', 1, { drink: true }); wallPut(r, 'plant', 1); idle(r, 3); },
      vault(r) { if (!m.safe) { const s = wallPut(r, 'safe', 1, { sides: ['n'], extra: { use: 'safe' } })[0]; if (s) m.safe = s; } wallPut(r, 'display', 3); wallPut(r, 'crate', 2, { tall: true }); idle(r, 3); },
      vip(r) { seats(r, 'sofa', 4, '#68386c'); tableGroup(r, 'table', 2, { drink: true }); wallPut(r, 'plant', 2); wallPut(r, 'lamp', 2, { extra: { light: 1 } }); wallPut(r, 'radio', 1, { extra: { use: 'radio' } }); idle(r, 3, 'mingle'); },
      bathroom(r) { wallPut(r, 'toilet', Math.min(3, r.w - 4), { sides: ['n'], spot: 'toilet' }); wallPut(r, 'sink', 2, { sides: ['w', 'e', 's'], spot: 'wash' }); },
      dance(r) { wallPut(r, 'djbooth', 1, { sides: ['n'], spot: 'dj' }); wallPut(r, 'speaker', 4, { sides: ['n', 'w', 'e'], tall: true }); wallPut(r, 'tableCloth', 1, { sides: ['s', 'w', 'e'], spot: 'drink', extra: { drink: true } }); idle(r, 5 + Math.floor(area(r) / 9), 'dance'); r.neon = true; },
      server(r) { innerPut(r, 'server', Math.max(3, Math.floor(area(r) / 10)), { tall: true, pad: 1 }); wallPut(r, 'console', 2, { sides: ['n'], spot: 'work' }); if (!m.props.some((p) => p.use === 'fuse')) wallPut(r, 'fusebox', 1, { sides: ['n'], spot: 'fix', extra: { use: 'fuse' } }); idle(r, 2); },
      warehouse(r) { innerPut(r, 'container', Math.max(1, Math.floor(area(r) / 30)), { fw: 2, tall: true, color: rng.pick(['#b5452c', '#2f5f8a', '#3e8948']) }); wallPut(r, 'crate', 5, { tall: true }); wallPut(r, 'barrel', 3); innerPut(r, 'forklift', 1); innerPut(r, 'crate', 2, { tall: true }); wallPut(r, 'dumpster', 1, { extra: { container: 2, bodies: [] } }); if (rng.chance(0.5)) itemNear(r, 'crowbar'); idle(r, 5, r.tier === 0 ? 'mingle' : 'idle'); },
      cubicles(r) { innerPut(r, 'desk', Math.max(3, Math.floor(area(r) / 9)), { spot: 'work', pad: 1 }); wallPut(r, 'plant', 2); wallPut(r, 'bookshelf', 1, { sides: ['n'], tall: true }); idle(r, 3); },
      lab(r) { if (theme.tanks) wallPut(r, 'tank', 2, { sides: ['n', 'w', 'e'], tall: true, spot: 'work' }); innerPut(r, 'counter', 3, { spot: 'work' }); wallPut(r, 'console', 2, { sides: ['n'], spot: 'work' }); wallPut(r, 'fridge', 1, { sides: ['n'], tall: true }); wallPut(r, 'server', 1, { sides: ['n', 'w'], tall: true }); if (rng.chance(0.7)) itemNear(r, 'lethal'); idle(r, 3); },
      casino(r) {
        for (const t of innerPut(r, 'cardtable', Math.max(1, Math.floor(area(r) / 26)), { fw: 2 })) {
          spot(t.x, t.y - 1, 'bartend', Math.PI / 2, t); // dealer
          for (const [x, y] of [[t.x, t.y + 1], [t.x + 1, t.y + 1], [t.x - 1, t.y], [t.x + 2, t.y]]) if (free(x, y)) spot(x, y, 'play', Math.atan2(t.y - y, t.x + 0.5 - x), t);
        }
        wallPut(r, 'slot', Math.max(3, Math.floor(r.w / 2)), { sides: ['n', 'w', 'e'], tall: true, spot: 'play' });
        wallPut(r, 'tableCloth', 1, { sides: ['s', 'w', 'e'], spot: 'drink', extra: { drink: true } });
        wallPut(r, 'plant', 2); idle(r, 4, 'mingle');
      },
      hall(r) {
        const len = Math.max(r.w, r.h), sides = r.w > r.h ? ['n'] : ['w'];
        wallPut(r, 'plant', Math.floor(len / 8), { sides });
        if (r.tier === 0) seats(r, 'bench', Math.floor(len / 12));
        if (r.tier >= 1 && rng.chance(0.4)) wallPut(r, 'locker', 1, { sides, tall: true, extra: { hide: true, container: 1, bodies: [] } });
        idle(r, Math.max(2, Math.floor(len / 5)), r.tier === 0 ? 'mingle' : 'patrol');
      },
      boardroom(r) { tableGroup(r, 'table', Math.max(2, Math.floor(area(r) / 14)), { drink: true }); wallPut(r, 'console', 1, { sides: ['n'] }); wallPut(r, 'plant', 2); idle(r, 3); },
    };
    for (const r of leaves) (FURN[r.kind] || FURN.lounge)(r);
    if (!m.props.some((p) => p.use === 'fuse')) {
      for (const r of leaves.filter((r) => r.tier >= 1 && r.tier <= 2)) if (wallPut(r, 'fusebox', 1, { spot: 'fix', extra: { use: 'fuse' } }).length) break;
    }
    if (!m.safe) for (const r of leaves.filter((r) => r.tier === 3)) { const s = wallPut(r, 'safe', 1, { extra: { use: 'safe' } })[0]; if (s) { m.safe = s; break; } }
    // lamps beside seats and desks in private rooms, so accidents are possible where targets linger
    for (const r of leaves.filter((r) => r.tier >= 2 && !r.hall)) {
      const near = m.spots.filter((s) => s.room === r.id && ['work', 'sit', 'read', 'drink'].includes(s.kind));
      for (const s of rng.take(near, 1)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]) if (put('lamp', s.x + dx, s.y + dy, { extra: { light: 1 } })) break;
    }
    // security cameras watching restricted rooms; footage lands on a recorder in the security room
    m.cameras = [];
    for (const r of leaves) {
      if (r.tier < 2 && !(r.hall && r.tier >= 1 && rng.chance(0.35))) continue;
      if (!r.hall && !rng.chance(r.tier === 3 ? 0.6 : 0.35)) continue;
      const left = rng.chance(0.5);
      m.cameras.push({ x: (left ? r.x + 1 : r.x + r.w - 1) * TS + (left ? 3 : -3), y: (r.y + 1) * TS + 2, base: left ? Math.PI * 0.3 : Math.PI * 0.7, sweep: 0.55, room: r.id });
    }
    {
      const sec = leaves.filter((r) => r.kind === 'security').concat(leaves.filter((r) => r.tier === 2 && !r.hall));
      for (const r of sec) { const p = wallPut(r, 'console', 1, { sides: ['n', 'w', 'e'], extra: { use: 'recorder' } })[0]; if (p) { m.recorder = p; break; } }
    }

    // guard posts beside doors that lead up a tier
    for (const d of m.doors) {
      if (d.outer || d.tier < 2) continue;
      const ra = leaves[d.a], rb = leaves[d.b];
      if (ra.tier === rb.tier) continue;
      const low = ra.tier < rb.tier ? ra : rb;
      for (const [fx2, fy2] of d.fronts) {
        if (m.roomAt[I(fx2, fy2)] !== low.id) continue;
        const side = d.h ? [[fx2 - 1, fy2], [fx2 + 1, fy2]] : [[fx2, fy2 - 1], [fx2, fy2 + 1]];
        for (const [sx, sy] of side) if (free(sx, sy) || (walkable(sx, sy) && !m.solid[I(sx, sy)])) { const s = spot(sx, sy, 'post', Math.atan2(fy2 - d.y, fx2 - d.x)); if (s) { s.door = d.id; break; } }
      }
    }

    // ---- outdoors
    const setStyle = (x, y, st) => { if (inb(x, y) && m.tiles[I(x, y)] === T.GROUND) { m.style[I(x, y)] = st; m.reserved[I(x, y)] = 1; } };
    for (let y = by + bh; y < H - 1; y++) for (let dx = -1; dx <= 1; dx++) setStyle(fx + dx, y, theme.path);
    for (let dx = -1; dx <= 1; dx++) { m.tiles[I(fx + dx, H - 1)] = T.GROUND; m.style[I(fx + dx, H - 1)] = theme.path; }
    m.spawn = { x: fx * TS + 8, y: (H - 4) * TS + 8 };
    m.exits.push({ x: fx, y: H - 2, name: 'Main Gate' });
    // paths lead from each exit to an actual door
    {
      const ey = sideExit.y, west = sideExit.side === 'W';
      for (let x = west ? 1 : bx + bw; x < (west ? bx : W - 1); x++) for (let dy = -1; dy <= 1; dy++) setStyle(x, ey + dy, theme.path);
      m.exits.push({ x: sideExit.x, y: ey, name: 'Service Road' });
    }
    if (theme.water) {
      for (let y = 1; y < by; y++) for (let dx = -1; dx <= 1; dx++) { const i = I(fx + dx, y); if (m.tiles[i] === T.WATER) m.tiles[i] = T.GROUND; if (m.tiles[i] === T.GROUND) { m.style[i] = 'planks'; m.reserved[i] = 1; } }
      m.exits.push({ x: fx, y: 1, name: 'Speedboat' });
      m.props.push({ type: 'boat', x: fx + 2, y: 2, fw: 2, fh: 1, solid: false, tall: false, v: 0, room: -1 });
    } else {
      for (let y = 1; y < by; y++) for (let dx = -1; dx <= 1; dx++) setStyle(fx + dx, y, theme.path);
      for (let dx = -1; dx <= 1; dx++) { m.tiles[I(fx + dx, 0)] = T.GROUND; m.style[I(fx + dx, 0)] = theme.path; }
      m.exits.push({ x: fx, y: 1, name: themeKey === 'club' ? 'Back Alley' : 'Garden Gate' });
    }
    for (const e of m.exits) { m.reserved[I(e.x, e.y)] = 1; }
    // car park by the gate
    const lotX = fx - 11 > 2 ? fx - 11 : fx + 4;
    for (let y = H - 8; y < H - 2; y++) for (let x = lotX; x < lotX + 8; x++) if (m.tiles[I(x, y)] === T.GROUND && m.style[I(x, y)] === theme.outdoor) m.style[I(x, y)] = 'asphalt';
    const openGround = (x, y) => {
      if (!free(x, y) || m.tiles[I(x, y)] !== T.GROUND) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = I(x + dx, y + dy); if (!inb(x + dx, y + dy) || m.tiles[i] !== T.GROUND || m.solid[i] || m.reserved[i]) return false; }
      return true;
    };
    const carCols = ['#a22633', '#124e89', '#e8e0d0', '#262b44', '#3e8948', '#feae34'];
    const OUT = {
      tree: { tall: true }, bush: {}, bench: { solid: false, seat: true }, streetlamp: { extra: { light: 2 } }, statue: {},
      car: { fw: 2 }, fountain: { fw: 2, fh: 2 }, container: { fw: 2, tall: true }, crate: { tall: true }, barrel: {}, forklift: {},
      pine: { tall: true }, snowman: {}, cart: {},
      dumpster: { extra: { container: 2, bodies: [] } },
    };
    for (const type in theme.outdoorProps) {
      let left = theme.outdoorProps[type], tries = 0;
      while (left > 0 && tries++ < 400) {
        let x = rng.int(2, W - 4), y = rng.int(Math.max(2, waterRows + 1), H - 3);
        if (type === 'car' && tries < 200) { x = rng.int(lotX, lotX + 6); y = rng.int(H - 8, H - 4); }
        const o = OUT[type], fw = o.fw || 1, fh = o.fh || 1;
        let ok = true;
        for (let dy = 0; dy < fh && ok; dy++) for (let dx = 0; dx < fw && ok; dx++) ok = openGround(x + dx, y + dy);
        if (!ok) continue;
        const p = put(type, x, y, Object.assign({}, o, { color: type === 'car' ? rng.pick(carCols) : type === 'container' ? rng.pick(['#b5452c', '#2f5f8a', '#3e8948', '#8a6a4a']) : undefined }));
        if (!p) continue;
        left--;
        if (o.seat) spot(x, y, 'sit', Math.PI / 2, p);
        if (type === 'bush' && rng.chance(0.4)) spot(x, y + 1, 'tend', -Math.PI / 2, p);
      }
    }
    if (backDoor) {
      const [ox, oy] = backDoor.fronts.find(([x, y]) => m.tiles[I(x, y)] === T.GROUND) || [];
      if (ox != null) for (const [dx, dy] of [[2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2]]) if (free(ox + dx, oy + dy) && m.tiles[I(ox + dx, oy + dy)] === T.GROUND && put('dumpster', ox + dx, oy + dy, { extra: { container: 2, bodies: [] } })) break;
    }
    // outdoor spots: smoking by the walls, loitering, guard patrol ring
    let smoke = 0;
    for (let k = 0; k < 300 && smoke < 5; k++) {
      const x = rng.int(bx - 1, bx + bw), y = rng.int(by - 1, by + bh);
      if (!free(x, y) || m.tiles[I(x, y)] !== T.GROUND) continue;
      const wallN = m.tiles[I(x, y - 1)] === T.WALL, wallS = m.tiles[I(x, y + 1)] === T.WALL, wallW = m.tiles[I(x - 1, y)] === T.WALL, wallE = m.tiles[I(x + 1, y)] === T.WALL;
      if (!(wallN || wallS || wallW || wallE)) continue;
      if (spot(x, y, 'smoke', wallN ? Math.PI / 2 : wallS ? -Math.PI / 2 : wallW ? 0 : Math.PI)) smoke++;
    }
    let loiter = 0;
    for (let k = 0; k < 400 && loiter < 12; k++) {
      const x = rng.int(3, W - 4), y = rng.int(Math.max(3, waterRows + 1), H - 4);
      if (m.tiles[I(x, y)] === T.GROUND && !m.solid[I(x, y)] && !m.occ[I(x, y)] && spot(x, y, 'mingle', rng.range(0, 6.28))) loiter++;
    }
    for (const [px, py] of [[bx - 3, by - 3], [bx + bw / 2, by - 3], [bx + bw + 2, by - 3], [bx + bw + 2, by + bh / 2], [bx + bw + 2, by + bh + 2], [bx + bw / 2 + 4, by + bh + 2], [bx - 3, by + bh + 2], [bx - 3, by + bh / 2]]) {
      let done = false;
      for (let rad = 0; rad < 4 && !done; rad++) for (let dy = -rad; dy <= rad && !done; dy++) for (let dx = -rad; dx <= rad && !done; dx++) {
        const x = Math.round(px) + dx, y = Math.round(py) + dy;
        if (inb(x, y) && m.tiles[I(x, y)] === T.GROUND && !m.solid[I(x, y)] && spot(x, y, 'patrol', rng.range(0, 6.28))) done = true;
      }
    }

    // ---- collision grids for terrain
    for (let i = 0; i < W * H; i++) {
      const t = m.tiles[i];
      if (t === T.WALL || t === T.HEDGE) { m.solid[i] = 1; m.opaque[i] = 1; }
      else if (t === T.WATER) m.solid[i] = 1;
    }

    // ---- validate reachability; furniture that boxes in a pocket of floor is removed
    let seen;
    const flood = () => {
      seen = new Uint8Array(W * H);
      const st = [I(Math.floor(m.spawn.x / TS), Math.floor(m.spawn.y / TS))];
      seen[st[0]] = 1;
      while (st.length) {
        const i = st.pop(), x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, ni = I(nx, ny);
          if (inb(nx, ny) && !seen[ni] && !m.solid[ni]) { seen[ni] = 1; st.push(ni); }
        }
      }
    };
    const removeProp = (p) => {
      for (let dy = 0; dy < p.fh; dy++) for (let dx = 0; dx < p.fw; dx++) { const i = I(p.x + dx, p.y + dy); m.occ[i] = null; m.solid[i] = 0; m.opaque[i] = 0; }
      m.props.splice(m.props.indexOf(p), 1);
      m.spots = m.spots.filter((s) => s.prop !== p);
    };
    for (let pass = 0; pass < 40; pass++) {
      flood();
      let pocket = -1;
      for (let i = 0; i < W * H && pocket < 0; i++) if (!m.solid[i] && !seen[i] && (m.tiles[i] === T.FLOOR || m.tiles[i] === T.GROUND)) pocket = i;
      if (pocket < 0) break;
      const px = pocket % W, py = (pocket / W) | 0;
      let victim = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = m.occ[I(px + dx, py + dy)];
        if (p && p.solid && !p.use && (!victim || (victim.container && !p.container))) victim = p;
      }
      if (victim) removeProp(victim);
      else { m.solid[pocket] = 1; } // nothing removable: treat the tile as dead space
    }
    flood();
    for (const d of m.doors) for (const [x, y] of d.fronts) if (!seen[I(x, y)]) return null;
    // every room must be crossable on its own: all of its doors reachable from each other without leaving it
    for (const r of leaves) {
      const fr = [];
      for (const d of r.doors) for (const [x, y] of d.fronts) if (m.roomAt[I(x, y)] === r.id) fr.push(I(x, y));
      if (fr.length < 2) continue;
      const inR = new Uint8Array(W * H), st2 = [fr[0]];
      inR[fr[0]] = 1;
      while (st2.length) {
        const i = st2.pop(), x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = I(x + dx, y + dy);
          if (!inR[ni] && m.roomAt[ni] === r.id && !m.solid[ni]) { inR[ni] = 1; st2.push(ni); }
        }
      }
      if (fr.some((i) => !inR[i])) return null;
    }
    for (const e of m.exits) if (!seen[I(e.x, e.y)]) return null;
    m.spots = m.spots.filter((s) => seen[I(s.x, s.y)]);
    m.items = m.items.filter((it) => seen[I(Math.floor(it.x / TS), Math.floor(it.y / TS))]);
    for (const s of m.spots) if (s.room >= 0) leaves[s.room].spots.push(s);
    for (const r of leaves) if (r.spots.length < 2) return null;
    if (!m.safe || !m.props.some((p) => p.use === 'fuse')) return null;

    // ---- lights
    const neonCols = ['255,80,170', '60,230,250', '250,230,90', '170,110,255'];
    for (const r of leaves) {
      const col = theme.neon && (r.neon || r.tier === 0) ? rng.pick(neonCols) : theme.lightColor;
      if (r.hall) {
        const len = Math.max(r.w, r.h), n = Math.max(1, Math.round(len / 7));
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; m.lights.push({ x: (r.w > r.h ? r.x + t * r.w : r.cx) * TS, y: (r.w > r.h ? r.cy : r.y + t * r.h) * TS, r: 58, c: theme.lightColor, room: r.id, a: 0.85 }); }
        continue;
      }
      m.lights.push({ x: r.cx * TS, y: r.cy * TS, r: Math.max(r.w, r.h) * 11, c: col, room: r.id, a: 0.9 });
      if (r.neon) for (let k = 0; k < 3; k++) m.lights.push({ x: (r.x + 2 + rng.next() * (r.w - 4)) * TS, y: (r.y + 2 + rng.next() * (r.h - 4)) * TS, r: 50, c: rng.pick(neonCols), room: r.id, a: 0.8, pulse: rng.range(1, 3) });
    }
    for (const p of m.props) if (p.light) m.lights.push({ x: p.x * TS + 8, y: p.y * TS - (p.light === 2 ? 14 : 4), r: p.light === 2 ? 76 : 52, c: '255,225,150', room: p.room, a: 1, lamp: true });
    for (const e of m.exits) m.lights.push({ x: e.x * TS + 8, y: e.y * TS + 8, r: 36, c: '100,230,120', room: -1, a: 0.6 });

    m.name = rng.pick(theme.places); m.region = rng.pick(theme.regions);
    for (const c of m.cameras) c.room = c.room;
    m.bounds = { bx, by, bw, bh };
    m.rng = rng;
    return m;
  }

  // ---- bake static tile layer
  MG.bake = function (m) {
    const rng = new SC.RNG(m.seed ^ 0x9e3779b9);
    const floors = S.makeFloors(rng);
    const [cv, cx] = S.mk(W * TS, H * TS);
    const I = (x, y) => y * W + x;
    const wallAt = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.tiles[I(x, y)] === T.WALL;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = I(x, y), t = m.tiles[i];
      if (t === T.WALL) {
        const below = y + 1 < H && m.tiles[I(x, y + 1)] !== T.WALL;
        let deco = null;
        if (below && m.doorAt[I(x, y + 1)] < 0 && !m.occ[I(x, y + 1)] && rng.chance(0.2)) {
          const indoorBelow = m.tiles[I(x, y + 1)] === T.FLOOR;
          const opts = m.theme.deco.filter((d) => (d === 'window') !== indoorBelow);
          if (opts.length) deco = rng.pick(opts);
        }
        cx.drawImage(S.wallTile(rng, m.theme.wall, below, wallAt(x, y - 1), deco), x * TS, y * TS);
      } else if (t === T.HEDGE) {
        cx.drawImage(S.hedgeTile(rng, y + 1 < H && m.tiles[I(x, y + 1)] !== T.HEDGE), x * TS, y * TS);
      } else {
        const set = floors[m.style[i]] || floors.concrete;
        cx.drawImage(set[rng.int(0, set.length - 1)], x * TS, y * TS);
        if (t !== T.WATER) {
          if (wallAt(x, y - 1)) { cx.fillStyle = 'rgba(10,8,25,0.34)'; cx.fillRect(x * TS, y * TS, TS, 3); cx.fillStyle = 'rgba(10,8,25,0.16)'; cx.fillRect(x * TS, y * TS + 3, TS, 3); }
          if (wallAt(x - 1, y)) { cx.fillStyle = 'rgba(10,8,25,0.18)'; cx.fillRect(x * TS, y * TS, 3, TS); }
        }
      }
    }
    // soft transition between outdoor ground and paths
    m.layer = cv;
    m.waterFrames = floors.water;
    // minimap
    const [mm, mx] = S.mk(W * 2, H * 2);
    const tierCol = ['#5a6988', '#4d8a5c', '#b88a3a', '#a23a4a'];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = I(x, y), t = m.tiles[i], r = m.roomAt[i];
      mx.fillStyle = t === T.WALL ? '#0e0c18' : t === T.HEDGE ? '#12261c' : t === T.WATER ? '#16304a' : r >= 0 ? tierCol[m.rooms[r].tier] : m.doorAt[i] >= 0 ? '#e8e0d0' : '#232a3a';
      mx.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const e of m.exits) { mx.fillStyle = '#63c74d'; mx.fillRect(e.x * 2 - 1, e.y * 2 - 1, 4, 4); }
    m.minimap = mm;
  };
})();
