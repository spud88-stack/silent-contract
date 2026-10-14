// Procedural pixel art: characters, tiles, props, item icons. No image assets.
(function () {
  const SC = window.SC;
  const S = (SC.Sprites = {});

  const PAL = (S.PAL = {
    ink: '#181425', night: '#262b44', slate: '#3a4466', gray: '#5a6988', lgray: '#8b9bb4', pale: '#c0cbdc',
    white: '#ffffff', red: '#e43b44', dred: '#a22633', orange: '#f77622', yellow: '#feae34', lyellow: '#fee761',
    green: '#63c74d', dgreen: '#3e8948', teal: '#265c42', dteal: '#193c3e', blue: '#124e89', lblue: '#0099db',
    cyan: '#2ce8f5', brown: '#733e39', lbrown: '#b86f50', tan: '#e8b796', purple: '#68386c', pink: '#b55088',
    lpink: '#f6757a', wood: '#a0623a', dwood: '#6b3f2a', gold: '#e8b923',
  });
  S.SKINS = ['#f2c9a5', '#e8b796', '#d49a74', '#b87a56', '#8d5a3c', '#5e3a28'];
  S.HAIRS = { black: '#221c1f', brown: '#5a3a25', blonde: '#e3c06a', red: '#b5452c', gray: '#9a9aa5', white: '#e6e6ee' };

  function mk(w, h, cpu) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', cpu ? { willReadFrequently: true } : undefined);
    x.imageSmoothingEnabled = false;
    return [c, x];
  }
  S.mk = mk;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }
  S.shade = shade;

  function outline(cv, col) {
    const x = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const d = x.getImageData(0, 0, w, h), a = d.data, out = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx;
      if (a[i * 4 + 3] > 0) continue;
      if ((xx > 0 && a[(i - 1) * 4 + 3] > 0) || (xx < w - 1 && a[(i + 1) * 4 + 3] > 0) ||
        (yy > 0 && a[(i - w) * 4 + 3] > 0) || (yy < h - 1 && a[(i + w) * 4 + 3] > 0)) out[i] = 1;
    }
    const n = parseInt(col.slice(1), 16);
    for (let i = 0; i < out.length; i++) if (out[i]) {
      a[i * 4] = (n >> 16) & 255; a[i * 4 + 1] = (n >> 8) & 255; a[i * 4 + 2] = n & 255; a[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0);
  }

  // ------------------------------------------------------------ characters
  const FW = (S.FW = 20), FH = (S.FH = 26);

  function drawChar(c, L, dir, f) {
    const ox = 2, oy = 4;
    const P = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(ox + x, oy + y, w, h); };
    const walk = f >= 1 && f <= 4, ph = walk ? f - 1 : -1;
    const bob = walk && ph % 2 === 1 ? -1 : 0;
    const breathe = f === 5 ? 1 : 0;
    const skin = L.skin, skinD = shade(skin, -0.18);
    const shirt = L.shirt, shirtD = shade(shirt, -0.22);
    const pants = L.pants, pantsD = shade(pants, -0.25);
    const shoe = L.shoe || PAL.ink;
    const legCol = L.skirt || L.shorts ? skin : pants;
    const side = dir === 1 || dir === 2;

    // legs
    if (!side) {
      const lh = ph === 0 ? 4 : 5, rh = ph === 2 ? 4 : 5;
      P(5, 15, 3, lh, legCol); P(5, 15 + lh - 1, 3, 1, shoe);
      P(8, 15, 3, rh, legCol); P(8, 15 + rh - 1, 3, 1, shoe);
      P(7, 15, 1, 4, shade(legCol, -0.3));
    } else if (ph === 0 || ph === 2) {
      P(4, 15, 3, 4, ph === 0 ? legCol : shade(legCol, -0.25)); P(3, 18, 4, 1, shoe);
      P(9, 15, 3, 4, ph === 0 ? shade(legCol, -0.25) : legCol); P(9, 18, 3, 1, shoe);
    } else {
      P(6, 15, 4, 5, legCol); P(5, 19, 5, 1, shoe);
    }
    if (L.skirt) P(side ? 5 : 4, 14, side ? 6 : 8, 3, shirtD);
    if (L.shorts) P(side ? 5 : 4, 14, side ? 6 : 8, 2, pants);

    const by = bob + breathe * 0; // torso offset
    // torso + arms
    if (!side) {
      P(4, 9 + by, 8, 6, shirt); P(11, 9 + by, 1, 6, shirtD);
      const la = ph === 0 ? 1 : ph === 2 ? -1 : breathe, ra = ph === 2 ? 1 : ph === 0 ? -1 : breathe;
      const sleeve = L.sleeve || shirt;
      P(2, 9 + by + la, 2, 5, shade(sleeve, -0.1)); P(2, 13 + by + la, 2, 1, skin);
      P(12, 9 + by + ra, 2, 5, shade(sleeve, -0.3)); P(12, 13 + by + ra, 2, 1, skinD);
      if (dir === 0) {
        if (L.collar) P(7, 9 + by, 2, 1, L.collar);
        if (L.tie) P(7, 10 + by, 2, 3, L.tie);
        if (L.bow) { P(6, 9 + by, 4, 1, L.bow); }
        if (L.vest) { P(4, 9 + by, 2, 6, L.vest); P(10, 9 + by, 2, 6, L.vest); }
        if (L.apron) P(5, 11 + by, 6, 4, L.apron);
        if (L.stripe) { P(5, 9 + by, 1, 6, L.stripe); P(10, 9 + by, 1, 6, L.stripe); }
        if (L.badge) P(5, 10 + by, 1, 1, L.badge);
        if (L.necklace) { P(6, 9 + by, 1, 1, PAL.gold); P(9, 9 + by, 1, 1, PAL.gold); P(7, 10 + by, 2, 1, PAL.gold); }
        if (L.buttons) { P(6, 10 + by, 1, 1, L.buttons); P(9, 10 + by, 1, 1, L.buttons); P(6, 12 + by, 1, 1, L.buttons); P(9, 12 + by, 1, 1, L.buttons); }
      } else {
        if (L.vest) P(4, 9 + by, 8, 6, L.vest);
        if (L.stripe) { P(5, 9 + by, 1, 6, L.stripe); P(10, 9 + by, 1, 6, L.stripe); P(4, 12 + by, 8, 1, L.stripe); }
        if (L.apron) { P(4, 11 + by, 8, 1, L.apron); }
      }
      if (L.belt) P(4, 14 + by, 8, 1, L.belt);
    } else {
      P(5, 9 + by, 6, 6, shirt); P(10, 9 + by, 1, 6, shirtD);
      if (L.vest) P(7, 9 + by, 4, 6, L.vest);
      if (L.apron) P(5, 11 + by, 2, 4, L.apron);
      if (L.stripe) P(7, 9 + by, 1, 6, L.stripe);
      if (L.tie) P(5, 10 + by, 1, 3, L.tie);
      if (L.belt) P(5, 14 + by, 6, 1, L.belt);
      const ax = ph === 0 ? 5 : ph === 2 ? 9 : 7;
      P(ax, 9 + by + breathe, 2, 5, shade(L.sleeve || shirt, -0.15)); P(ax, 13 + by + breathe, 2, 1, skin);
    }

    // head
    const hy = 1 + by;
    P(4, hy, 8, 8, skin);
    if (dir !== 3) P(4, hy + 7, 8, 1, skinD);
    const hair = L.hair, hairD = hair ? shade(hair, -0.25) : null;
    const st = L.hairStyle;
    if (hair && st !== 2) {
      if (dir === 3) {
        P(4, hy, 8, st === 1 ? 9 : 6, hair); P(4, hy + (st === 1 ? 8 : 5), 8, 1, hairD);
      } else if (!side) {
        P(4, hy, 8, 2, hair); P(4, hy + 2, 1, st === 1 ? 7 : 2, hair); P(11, hy + 2, 1, st === 1 ? 7 : 2, hair);
        if (st === 5) P(5, hy + 2, 3, 1, hair);
        if (st === 1) { P(3, hy + 3, 1, 6, hair); P(12, hy + 3, 1, 6, hairD); }
      } else {
        P(4, hy, 8, 2, hair); P(8, hy + 2, 4, st === 1 ? 7 : 4, hair); P(11, hy + 2, 1, st === 1 ? 7 : 4, hairD);
      }
      if (st === 3) P(7, hy - 2, 3, 2, hair);
    } else if (st === 2 && dir !== 3) {
      P(6, hy + 1, 2, 1, shade(skin, 0.25));
    }
    // face
    if (dir === 0) {
      P(6, hy + 4, 1, 2, PAL.ink); P(9, hy + 4, 1, 2, PAL.ink);
      if (L.glasses) { P(5, hy + 4, 6, 1, L.glasses); P(6, hy + 4, 1, 1, L.shades ? PAL.ink : '#bfe9ff'); P(9, hy + 4, 1, 1, L.shades ? PAL.ink : '#bfe9ff'); P(5, hy + 5, 3, 1, L.glasses); P(8, hy + 5, 3, 1, L.glasses); if (!L.shades) { P(6, hy + 5, 1, 1, PAL.ink); P(9, hy + 5, 1, 1, PAL.ink); } }
      if (L.beard) P(5, hy + 6, 6, 2, L.beard);
      if (L.earring) { P(4, hy + 5, 1, 1, PAL.gold); }
    } else if (side) {
      P(5, hy + 4, 1, 2, PAL.ink);
      if (L.glasses) { P(4, hy + 4, 4, 1, L.glasses); P(4, hy + 5, 3, 1, L.glasses); }
      if (L.beard) P(4, hy + 6, 4, 2, L.beard);
      if (L.earring) P(8, hy + 5, 1, 1, PAL.gold);
      if (L.earpiece) P(8, hy + 4, 1, 2, PAL.pale);
    }
    // hats
    const hc = L.hatColor || PAL.night, hcD = shade(hc, -0.3);
    switch (L.hat) {
      case 'cap':
        P(4, hy - 1, 8, 3, hc); P(4, hy + 1, 8, 1, hcD);
        if (dir === 0) { P(4, hy + 2, 8, 1, hcD); P(7, hy, 2, 1, L.badge || PAL.gold); }
        else if (side) P(2, hy + 2, 4, 1, hcD);
        break;
      case 'chef':
        P(4, hy - 4, 8, 5, PAL.white); P(3, hy - 4, 10, 2, PAL.white); P(4, hy + 1, 8, 1, PAL.pale); P(11, hy - 3, 1, 4, PAL.pale);
        break;
      case 'fedora':
        P(5, hy - 2, 6, 3, hc); P(5, hy, 6, 1, L.hatBand || PAL.ink); P(3, hy + 1, 10, 1, hcD);
        break;
      case 'hardhat':
        P(4, hy - 2, 8, 4, hc); P(5, hy - 3, 6, 1, hc); P(3, hy + 1, 10, 1, hcD); P(7, hy - 3, 2, 4, shade(hc, 0.3));
        break;
      case 'beanie':
        P(4, hy - 1, 8, 3, hc); P(4, hy + 1, 8, 1, hcD); P(7, hy - 2, 2, 1, hc);
        break;
      case 'beret':
        P(3, hy - 1, 9, 2, hc); P(4, hy - 2, 6, 1, hc); P(4, hy + 1, 8, 1, hcD);
        break;
    }
  }

  const sheetCache = new Map();
  S.charSheet = function (L) {
    const key = JSON.stringify(L);
    let cv = sheetCache.get(key);
    if (cv) return cv;
    let cx;
    [cv, cx] = mk(FW * 6, FH * 4, true);
    for (const d of [0, 1, 3]) for (let f = 0; f < 6; f++) {
      cx.save(); cx.translate(f * FW, d * FH);
      drawChar(cx, L, d, f);
      cx.restore();
    }
    // right-facing row is the mirrored left-facing row
    for (let f = 0; f < 6; f++) {
      cx.save(); cx.translate(f * FW + FW, 2 * FH); cx.scale(-1, 1);
      cx.drawImage(cv, f * FW, FH, FW, FH, 0, 0, FW, FH);
      cx.restore();
    }
    outline(cv, PAL.ink);
    sheetCache.set(key, cv);
    return cv;
  };
  // big portrait (down-facing idle) as data URL for UI
  const portraitCache = new Map();
  S.portrait = function (L, scale) {
    const key = JSON.stringify(L) + scale;
    if (portraitCache.has(key)) return portraitCache.get(key);
    const sh = S.charSheet(L);
    const [c, x] = mk(FW * scale, FH * scale);
    x.drawImage(sh, 0, 0, FW, FH, 0, 0, FW * scale, FH * scale);
    const url = c.toDataURL();
    portraitCache.set(key, url);
    return url;
  };

  S.strippedLook = function (L) {
    return { skin: L.skin, hair: L.hair, hairStyle: L.hairStyle, shirt: '#e8e8ee', pants: '#9db3d1', shorts: true, shoe: L.skin, beard: L.beard, glasses: L.glasses };
  };

  // ------------------------------------------------------------ tiles
  const TS = 16;
  function tileMaker(fn) {
    return (rng, n) => {
      const out = [];
      for (let i = 0; i < (n || 4); i++) {
        const [c, x] = mk(TS, TS);
        const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
        fn(P, rng, i);
        out.push(c);
      }
      return out;
    };
  }
  const speckle = (P, rng, cols, n) => { for (let i = 0; i < n; i++) P(rng.int(0, 15), rng.int(0, 15), 1, 1, rng.pick(cols)); };
  const FLOORS = {
    grass: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#3f7f4a'); speckle(P, r, ['#387243', '#468a50', '#35693f'], 26);
      for (let i = 0; i < 3; i++) { const x = r.int(1, 14), y = r.int(2, 14); P(x, y, 1, 2, '#58a35a'); P(x + 1, y + 1, 1, 1, '#2f5f3a'); }
      if (r.chance(0.18)) { const x = r.int(2, 13), y = r.int(2, 13); P(x, y, 1, 1, r.pick(['#fee761', '#f6757a', '#ffffff'])); }
    }),
    cobble: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#6f6a72');
      for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 ? -3 : 0; x < 16; x += 6) {
        P(x + 1, y + 1, 5, 3, r.pick(['#8f8a94', '#9a95a0', '#85808a'])); P(x + 1, y + 3, 5, 1, '#77727c');
      }
    }),
    wood: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#a86a3d');
      for (let y = 0; y < 16; y += 4) {
        P(0, y, 16, 3, r.pick(['#a86a3d', '#b07244', '#9f6238'])); P(0, y + 3, 16, 1, '#7d4a2b');
        const j = (r.int(0, 3) * 4 + y) % 16; P(j, y, 1, 3, '#7d4a2b');
        P(r.int(0, 13), y + 1, 3, 1, '#955a33');
      }
    }),
    dwood: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#4a2f33');
      for (let y = 0; y < 16; y += 4) {
        P(0, y, 16, 3, r.pick(['#4a2f33', '#523539', '#44292d'])); P(0, y + 3, 16, 1, '#2e1c22');
        P((r.int(0, 3) * 4 + y) % 16, y, 1, 3, '#2e1c22');
      }
    }),
    marble: tileMaker((P, r, i) => {
      P(0, 0, 16, 16, '#d9d5e3'); P(0, 0, 8, 8, '#c9c4d6'); P(8, 8, 8, 8, '#c9c4d6');
      P(0, 15, 16, 1, '#b3aec2'); P(15, 0, 1, 16, '#b3aec2'); P(7, 0, 1, 16, '#bdb8cb'); P(0, 7, 16, 1, '#bdb8cb');
      for (let k = 0; k < 3; k++) { let x = r.int(0, 12), y = r.int(0, 12); for (let s = 0; s < 4; s++) { P(x, y, 1, 1, '#eeeaf5'); x += 1; y += r.int(0, 1); } }
    }),
    tile: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#e3e7ea'); P(0, 0, 8, 8, '#b9c3cc'); P(8, 8, 8, 8, '#b9c3cc');
      P(0, 7, 16, 1, '#9aa5b0'); P(0, 15, 16, 1, '#9aa5b0'); P(7, 0, 1, 16, '#9aa5b0'); P(15, 0, 1, 16, '#9aa5b0');
      if (r.chance(0.3)) P(r.int(1, 5), r.int(1, 5), 2, 1, '#cfd6dc');
    }),
    carpetR: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#8e2b3c'); speckle(P, r, ['#9c3345', '#7f2535'], 30);
      P(7, 7, 2, 2, '#b8475a'); P(0, 0, 1, 1, '#b8475a'); P(15, 15, 1, 1, '#b8475a'); P(15, 0, 1, 1, '#b8475a'); P(0, 15, 1, 1, '#b8475a');
    }),
    carpetB: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#2f4a78'); speckle(P, r, ['#375688', '#284068'], 30);
      P(3, 3, 1, 1, '#4a6ba5'); P(11, 11, 1, 1, '#4a6ba5'); P(11, 3, 1, 1, '#4a6ba5'); P(3, 11, 1, 1, '#4a6ba5');
    }),
    carpetG: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#5c5a6e'); speckle(P, r, ['#646278', '#525064'], 34);
      P(0, 15, 16, 1, '#4c4a5c'); P(15, 0, 1, 16, '#4c4a5c');
    }),
    carpetP: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#4b2a5e'); speckle(P, r, ['#57326c', '#412452'], 30);
      P(7, 0, 2, 1, '#7a4a94'); P(7, 15, 2, 1, '#7a4a94'); P(0, 7, 1, 2, '#7a4a94'); P(15, 7, 1, 2, '#7a4a94');
    }),
    concrete: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#6c6f7b'); speckle(P, r, ['#747784', '#646773', '#5d606b'], 30);
      if (r.chance(0.35)) { let x = r.int(2, 12), y = r.int(2, 6); for (let s = 0; s < 6; s++) { P(x, y, 1, 1, '#4f525c'); x += r.int(-1, 1); y++; } }
      P(0, 15, 16, 1, '#5d606b');
    }),
    metal: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#4c5868'); P(0, 0, 16, 1, '#627084'); P(0, 0, 1, 16, '#627084'); P(15, 0, 1, 16, '#3a4452'); P(0, 15, 16, 1, '#3a4452');
      P(2, 2, 1, 1, '#8b9bb4'); P(13, 2, 1, 1, '#8b9bb4'); P(2, 13, 1, 1, '#8b9bb4'); P(13, 13, 1, 1, '#8b9bb4');
      for (let i = 4; i < 12; i += 3) { P(i, 5, 2, 1, '#566375'); P(i + 1, 9, 2, 1, '#566375'); }
    }),
    dance: tileMaker((P) => {
      P(0, 0, 16, 16, '#1b1830'); P(1, 1, 14, 14, '#26223f'); P(2, 2, 12, 12, '#2d2948');
    }, 1),
    asphalt: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#3b3d4a'); speckle(P, r, ['#434553', '#343642', '#4a4c5a'], 34);
    }),
    snow: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#dfe7f2'); speckle(P, r, ['#cfd9e8', '#eef3fa', '#c4cfe0'], 30);
      if (r.chance(0.3)) { const x = r.int(1, 12), y = r.int(2, 13); P(x, y, 3, 1, '#b8c4d8'); }
    }),
    casino: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#5a1424'); speckle(P, r, ['#661a2c', '#4e101e'], 26);
      P(3, 3, 2, 2, '#e8b923'); P(11, 11, 2, 2, '#e8b923'); P(11, 3, 1, 1, '#8a3a24'); P(3, 11, 1, 1, '#8a3a24'); P(7, 7, 2, 2, '#2f6a45');
    }),
    planks: tileMaker((P, r) => {
      P(0, 0, 16, 16, '#8a6a4a');
      for (let x = 0; x < 16; x += 4) { P(x, 0, 3, 16, r.pick(['#8a6a4a', '#937253', '#806142'])); P(x + 3, 0, 1, 16, '#5c4530'); P(x + 1, r.int(1, 13), 1, 2, '#6f5339'); }
    }),
    water: (rng) => {
      const out = [];
      for (let f = 0; f < 2; f++) for (let i = 0; i < 2; i++) {
        const [c, x] = mk(TS, TS);
        const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
        P(0, 0, 16, 16, '#1d4f7a');
        for (let k = 0; k < 5; k++) { const wx = (rng.int(0, 12) + f * 3) % 13, wy = rng.int(0, 15); P(wx, wy, 3, 1, '#2f77a8'); if (rng.chance(0.4)) P(wx + 1, wy, 1, 1, '#7fc4e8'); }
        out.push(c);
      }
      return out;
    },
  };
  S.makeFloors = function (rng) {
    const out = {};
    for (const k in FLOORS) out[k] = FLOORS[k](rng, 4);
    return out;
  };

  // wall tile: full cap, or cap + front face when floor is below
  S.wallTile = function (rng, wall, faceBelow, capAbove, deco) {
    const [c, x] = mk(TS, TS);
    const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    P(0, 0, 16, 16, wall.cap);
    if (!capAbove) P(0, 0, 16, 1, shade(wall.cap, 0.25));
    if (rng.chance(0.3)) P(rng.int(1, 13), rng.int(2, 4), 2, 1, shade(wall.cap, 0.1));
    if (faceBelow) {
      P(0, 5, 16, 11, wall.face); P(0, 5, 16, 1, shade(wall.cap, -0.35));
      if (wall.style === 'brick') {
        for (let y = 6; y < 14; y += 3) { P(0, y + 2, 16, 1, shade(wall.face, -0.2)); for (let bx = (y % 2) * 4; bx < 16; bx += 8) P(bx, y, 1, 2, shade(wall.face, -0.2)); }
      } else if (wall.style === 'panel') {
        P(0, 6, 16, 1, shade(wall.face, 0.15)); P(7, 7, 1, 7, shade(wall.face, -0.15)); P(15, 7, 1, 7, shade(wall.face, -0.15));
      } else if (wall.style === 'metal') {
        for (let bx = 1; bx < 16; bx += 3) P(bx, 6, 1, 8, shade(wall.face, -0.15)); P(0, 9, 16, 1, shade(wall.face, 0.12));
      } else {
        speckle((a, b, w, h, col) => P(a, 6 + (b % 8), w, h, col), rng, [shade(wall.face, -0.08), shade(wall.face, 0.08)], 8);
      }
      P(0, 14, 16, 2, wall.trim || shade(wall.face, -0.4));
      if (deco === 'painting') {
        P(3, 6, 10, 7, PAL.gold); P(4, 7, 8, 5, rng.pick(['#2f4a78', '#3e8948', '#8e2b3c', '#68386c']));
        P(5, 9, 3, 2, rng.pick(['#fee761', '#f6757a', '#c0cbdc'])); P(9, 8, 2, 3, rng.pick(['#63c74d', '#feae34', '#2ce8f5']));
      } else if (deco === 'window') {
        P(3, 6, 10, 7, '#1c2238'); P(4, 7, 8, 5, '#f5d98a'); P(7, 7, 1, 5, '#1c2238'); P(4, 9, 8, 1, '#1c2238'); P(4, 7, 2, 1, '#fff3c4');
      } else if (deco === 'vent') {
        P(4, 7, 8, 5, '#2a2f3e'); for (let y = 8; y < 12; y += 2) P(5, y, 6, 1, '#5a6988');
      } else if (deco === 'neon') {
        const nc = rng.pick(['#ff4fa3', '#2ce8f5', '#fee761']); P(3, 8, 10, 1, nc); P(3, 10, 6, 1, nc); P(2, 7, 1, 5, shade(nc, -0.4));
      } else if (deco === 'poster') {
        P(5, 6, 6, 7, '#e8e0d0'); P(6, 7, 4, 2, rng.pick(['#e43b44', '#124e89', '#3e8948'])); P(6, 10, 4, 1, '#5a6988'); P(6, 11, 3, 1, '#5a6988');
      }
    }
    return c;
  };
  S.hedgeTile = function (rng, faceBelow) {
    const [c, x] = mk(TS, TS);
    const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    P(0, 0, 16, 16, '#25563a'); speckle(P, rng, ['#2f6a45', '#1d4530', '#3a7d52'], 40);
    if (faceBelow) { P(0, 11, 16, 5, '#1a3d2b'); speckle((a, b, w, h, col) => P(a, 11 + (b % 4), w, h, col), rng, ['#25563a'], 8); P(0, 15, 16, 1, '#122a1e'); }
    return c;
  };

  // ------------------------------------------------------------ props
  // each: [w, h, draw(P, rng, x)]  (anchored bottom-left of its tile footprint; taller sprites rise upward)
  const PROPS = {
    table: [16, 16, (P) => { P(1, 3, 14, 9, '#8a5433'); P(1, 3, 14, 1, '#b07244'); P(1, 11, 14, 2, '#5f3822'); P(2, 13, 2, 3, '#4a2c1c'); P(12, 13, 2, 3, '#4a2c1c'); }],
    tableCloth: [16, 16, (P) => { P(1, 2, 14, 10, '#f0ece4'); P(1, 2, 14, 1, '#ffffff'); P(1, 11, 14, 3, '#cfc8ba'); P(3, 14, 2, 2, '#4a2c1c'); P(11, 14, 2, 2, '#4a2c1c'); P(6, 5, 4, 3, '#e43b44'); P(7, 4, 2, 1, '#63c74d'); }],
    foodTable: [16, 16, (P) => { P(1, 2, 14, 10, '#f0ece4'); P(1, 11, 14, 3, '#cfc8ba'); P(3, 14, 2, 2, '#4a2c1c'); P(11, 14, 2, 2, '#4a2c1c'); P(2, 4, 5, 4, '#c0cbdc'); P(3, 5, 3, 2, '#f77622'); P(9, 4, 5, 4, '#c0cbdc'); P(10, 5, 3, 2, '#63c74d'); P(6, 8, 4, 2, '#feae34'); }],
    chair: [16, 16, (P) => { P(4, 5, 8, 7, '#7d4a2b'); P(4, 2, 8, 4, '#955a33'); P(4, 2, 8, 1, '#b07244'); P(4, 12, 2, 3, '#4a2c1c'); P(10, 12, 2, 3, '#4a2c1c'); }],
    sofa: [16, 18, (P, r, o) => { const c = o.color || '#7a2f4a'; P(0, 2, 16, 14, shade(c, -0.25)); P(0, 2, 16, 6, c); P(1, 8, 14, 6, shade(c, 0.12)); P(0, 6, 2, 10, shade(c, -0.1)); P(14, 6, 2, 10, shade(c, -0.1)); P(1, 14, 14, 2, shade(c, -0.4)); P(7, 9, 1, 4, shade(c, -0.1)); }],
    bed: [16, 30, (P, r, o) => { const c = o.color || '#8e2b3c'; P(0, 0, 16, 30, '#5f3822'); P(1, 0, 14, 4, '#7d4a2b'); P(1, 4, 14, 24, '#e8e4ee'); P(2, 5, 12, 5, '#ffffff'); P(1, 12, 14, 16, c); P(1, 12, 14, 2, shade(c, 0.2)); P(1, 26, 14, 2, shade(c, -0.3)); }],
    desk: [16, 18, (P) => { P(0, 4, 16, 9, '#6b4a3a'); P(0, 4, 16, 1, '#8a6250'); P(0, 12, 16, 4, '#4a3228'); P(1, 16, 2, 2, '#2e1f1a'); P(13, 16, 2, 2, '#2e1f1a'); P(4, 0, 8, 6, '#262b44'); P(5, 1, 6, 4, '#2ce8f5'); P(5, 1, 6, 1, '#b8f7fb'); P(7, 6, 2, 1, '#181425'); P(3, 8, 7, 2, '#3a4466'); P(12, 8, 2, 3, '#e8e0d0'); }],
    console: [16, 20, (P) => { P(0, 4, 16, 14, '#3a4466'); P(0, 4, 16, 1, '#5a6988'); P(1, 0, 14, 8, '#181425'); P(2, 1, 5, 3, '#63c74d'); P(8, 1, 6, 3, '#2ce8f5'); P(2, 5, 12, 2, '#262b44'); P(3, 10, 2, 1, '#e43b44'); P(6, 10, 2, 1, '#feae34'); P(9, 10, 2, 1, '#63c74d'); P(2, 13, 12, 3, '#262b44'); P(0, 18, 16, 2, '#181425'); }],
    bookshelf: [16, 26, (P, r) => { P(0, 0, 16, 26, '#5f3822'); P(1, 1, 14, 23, '#3a2218'); for (let y = 2; y < 22; y += 7) { let x = 1; while (x < 14) { const w = r.int(1, 2), h = r.int(4, 6); P(x, y + 6 - h, w, h, r.pick(['#e43b44', '#124e89', '#3e8948', '#feae34', '#68386c', '#c0cbdc', '#b86f50'])); x += w + (r.chance(0.2) ? 1 : 0); } P(1, y + 6, 14, 1, '#7d4a2b'); } P(0, 24, 16, 2, '#2e1c14'); }],
    plant: [16, 24, (P, r) => { P(5, 17, 6, 6, '#b86f50'); P(4, 16, 8, 2, '#d08a68'); P(5, 22, 6, 1, '#733e39'); const g = ['#3e8948', '#63c74d', '#265c42']; P(7, 8, 2, 9, '#265c42'); P(3, 6, 4, 5, g[0]); P(9, 4, 5, 6, g[0]); P(5, 2, 5, 5, g[1]); P(2, 10, 3, 3, g[2]); P(11, 10, 3, 4, g[2]); P(6, 3, 2, 2, '#8fe07a'); }],
    lamp: [16, 26, (P) => { P(7, 8, 2, 15, '#3a4466'); P(5, 23, 6, 2, '#262b44'); P(4, 1, 8, 7, '#fee761'); P(5, 0, 6, 1, '#fff3c4'); P(4, 7, 8, 1, '#feae34'); P(6, 2, 3, 3, '#ffffff'); }],
    streetlamp: [16, 34, (P) => { P(7, 6, 2, 26, '#262b44'); P(6, 31, 4, 3, '#181425'); P(4, 1, 8, 5, '#262b44'); P(5, 2, 6, 3, '#fee761'); P(6, 2, 3, 2, '#ffffff'); }],
    crate: [16, 20, (P) => { P(0, 0, 16, 20, '#8a6a4a'); P(0, 0, 16, 7, '#a88458'); P(0, 6, 16, 1, '#5c4530'); P(1, 8, 14, 11, '#937253'); P(1, 8, 2, 11, '#6f5339'); P(13, 8, 2, 11, '#6f5339'); P(3, 12, 10, 2, '#6f5339'); P(0, 19, 16, 1, '#3d2e20'); P(2, 2, 12, 1, '#c09a6a'); }],
    barrel: [16, 20, (P) => { P(2, 1, 12, 18, '#4c5868'); P(2, 1, 12, 4, '#627084'); P(3, 2, 10, 2, '#3a4452'); P(2, 8, 12, 1, '#8b9bb4'); P(2, 14, 12, 1, '#8b9bb4'); P(12, 5, 2, 14, '#3a4452'); P(5, 10, 4, 3, '#feae34'); }],
    locker: [16, 28, (P) => { P(1, 0, 14, 28, '#3a5a7a'); P(1, 0, 14, 2, '#5a80a8'); P(2, 3, 5, 22, '#4a6e94'); P(9, 3, 5, 22, '#4a6e94'); P(3, 5, 3, 1, '#262b44'); P(3, 7, 3, 1, '#262b44'); P(10, 5, 3, 1, '#262b44'); P(10, 7, 3, 1, '#262b44'); P(6, 14, 1, 2, '#c0cbdc'); P(9, 14, 1, 2, '#c0cbdc'); P(1, 26, 14, 2, '#22384e'); }],
    wardrobe: [16, 28, (P) => { P(0, 0, 16, 28, '#5f3822'); P(0, 0, 16, 2, '#8a5433'); P(1, 3, 6, 22, '#7d4a2b'); P(9, 3, 6, 22, '#7d4a2b'); P(2, 4, 4, 9, '#8a5433'); P(10, 4, 4, 9, '#8a5433'); P(6, 13, 1, 3, '#e8b923'); P(9, 13, 1, 3, '#e8b923'); P(0, 26, 16, 2, '#2e1c14'); }],
    dumpster: [16, 22, (P) => { P(0, 4, 16, 17, '#2f6a45'); P(0, 2, 16, 4, '#3e8948'); P(0, 2, 16, 1, '#63c74d'); P(1, 8, 14, 1, '#1d4530'); P(1, 14, 14, 1, '#1d4530'); P(0, 20, 16, 2, '#122a1e'); P(2, 21, 3, 1, '#181425'); P(11, 21, 3, 1, '#181425'); P(6, 10, 4, 3, '#c0cbdc'); }],
    freezer: [16, 22, (P) => { P(0, 3, 16, 18, '#c0cbdc'); P(0, 1, 16, 4, '#e8eef5'); P(0, 1, 16, 1, '#ffffff'); P(2, 6, 12, 1, '#8b9bb4'); P(6, 2, 4, 1, '#5a6988'); P(0, 20, 16, 2, '#5a6988'); P(11, 9, 3, 2, '#2ce8f5'); }],
    stove: [16, 22, (P) => { P(0, 4, 16, 17, '#5a6988'); P(0, 2, 16, 4, '#8b9bb4'); P(2, 2, 4, 3, '#181425'); P(10, 2, 4, 3, '#181425'); P(3, 3, 2, 1, '#f77622'); P(11, 3, 2, 1, '#e43b44'); P(2, 9, 12, 9, '#262b44'); P(3, 10, 10, 6, '#3a4466'); P(3, 7, 1, 1, '#e43b44'); P(6, 7, 1, 1, '#c0cbdc'); P(0, 20, 16, 2, '#181425'); }],
    counter: [16, 22, (P) => { P(0, 4, 16, 17, '#8b9bb4'); P(0, 2, 16, 4, '#e3e7ea'); P(0, 2, 16, 1, '#ffffff'); P(1, 8, 6, 11, '#748399'); P(9, 8, 6, 11, '#748399'); P(6, 12, 1, 2, '#262b44'); P(9, 12, 1, 2, '#262b44'); P(0, 20, 16, 2, '#3a4466'); }],
    sink: [16, 22, (P) => { P(0, 4, 16, 17, '#8b9bb4'); P(0, 2, 16, 4, '#e3e7ea'); P(3, 2, 10, 3, '#5a6988'); P(4, 3, 8, 1, '#2ce8f5'); P(7, 0, 2, 3, '#c0cbdc'); P(1, 8, 14, 11, '#748399'); P(0, 20, 16, 2, '#3a4466'); }],
    fridge: [16, 30, (P) => { P(1, 0, 14, 30, '#d6dde6'); P(1, 0, 14, 2, '#ffffff'); P(1, 11, 14, 1, '#8b9bb4'); P(12, 4, 1, 5, '#5a6988'); P(12, 14, 1, 8, '#5a6988'); P(13, 2, 2, 26, '#b3bdc9'); P(1, 28, 14, 2, '#5a6988'); }],
    bar: [16, 22, (P) => { P(0, 4, 16, 17, '#5f3822'); P(0, 2, 16, 4, '#2e1c22'); P(0, 2, 16, 1, '#7a4a54'); P(1, 8, 14, 10, '#7d4a2b'); P(1, 8, 14, 1, '#955a33'); P(4, 10, 1, 7, '#5f3822'); P(11, 10, 1, 7, '#5f3822'); P(0, 20, 16, 2, '#2e1c14'); }],
    shelfBottles: [16, 28, (P, r) => { P(0, 0, 16, 28, '#3a2218'); P(1, 1, 14, 25, '#221410'); for (let y = 2; y < 24; y += 8) { for (let x = 2; x < 14; x += 3) { const c = r.pick(['#3e8948', '#feae34', '#e43b44', '#2ce8f5', '#c0cbdc', '#b55088']); P(x, y + 2, 2, 5, c); P(x, y, 1, 2, shade(c, -0.3)); P(x, y + 3, 1, 1, '#ffffff'); } P(1, y + 7, 14, 1, '#7d4a2b'); } }],
    toilet: [16, 20, (P) => { P(4, 0, 8, 6, '#e8eef5'); P(4, 0, 8, 1, '#ffffff'); P(3, 6, 10, 10, '#ffffff'); P(5, 8, 6, 6, '#c0cbdc'); P(6, 9, 4, 4, '#7fc4e8'); P(3, 15, 10, 2, '#8b9bb4'); P(5, 17, 6, 3, '#c0cbdc'); }],
    safe: [16, 22, (P) => { P(1, 2, 14, 19, '#3a4466'); P(1, 2, 14, 2, '#5a6988'); P(3, 6, 10, 12, '#262b44'); P(6, 9, 4, 4, '#8b9bb4'); P(7, 10, 2, 2, '#181425'); P(11, 8, 1, 6, '#c0cbdc'); P(4, 15, 3, 1, '#63c74d'); P(1, 20, 14, 2, '#181425'); }],
    fusebox: [16, 26, (P) => { P(3, 2, 10, 14, '#8b9bb4'); P(3, 2, 10, 1, '#c0cbdc'); P(4, 4, 8, 10, '#5a6988'); P(5, 5, 2, 3, '#181425'); P(9, 5, 2, 3, '#181425'); P(5, 10, 6, 1, '#feae34'); P(6, 12, 1, 1, '#e43b44'); P(9, 12, 1, 1, '#63c74d'); P(7, 16, 2, 9, '#3a4466'); P(12, 8, 1, 3, '#fee761'); }],
    radio: [16, 18, (P) => { P(2, 8, 12, 9, '#733e39'); P(2, 8, 12, 1, '#b86f50'); P(3, 10, 5, 5, '#262b44'); P(4, 11, 3, 3, '#5a6988'); P(9, 10, 4, 2, '#fee761'); P(9, 13, 1, 1, '#e43b44'); P(11, 13, 1, 1, '#c0cbdc'); P(12, 2, 1, 6, '#c0cbdc'); P(2, 16, 12, 1, '#3d2020'); }],
    speaker: [16, 28, (P) => { P(2, 0, 12, 28, '#181425'); P(2, 0, 12, 1, '#3a4466'); P(4, 3, 8, 8, '#262b44'); P(6, 5, 4, 4, '#5a6988'); P(7, 6, 2, 2, '#181425'); P(4, 14, 8, 10, '#262b44'); P(5, 15, 6, 8, '#3a4466'); P(7, 17, 2, 4, '#181425'); P(11, 1, 1, 1, '#e43b44'); }],
    djbooth: [16, 22, (P) => { P(0, 4, 16, 17, '#262b44'); P(0, 2, 16, 4, '#3a4466'); P(1, 2, 6, 3, '#181425'); P(3, 3, 2, 1, '#c0cbdc'); P(9, 2, 6, 3, '#181425'); P(11, 3, 2, 1, '#c0cbdc'); P(2, 9, 12, 1, '#ff4fa3'); P(2, 12, 12, 1, '#2ce8f5'); P(2, 15, 12, 1, '#fee761'); P(0, 20, 16, 2, '#181425'); }],
    server: [16, 30, (P, r) => { P(1, 0, 14, 30, '#262b44'); P(1, 0, 14, 1, '#5a6988'); for (let y = 3; y < 26; y += 4) { P(3, y, 10, 3, '#181425'); P(4, y + 1, 1, 1, r.pick(['#63c74d', '#63c74d', '#feae34'])); P(6, y + 1, 1, 1, r.pick(['#63c74d', '#2ce8f5'])); P(9, y + 1, 3, 1, '#3a4466'); } P(1, 28, 14, 2, '#181425'); }],
    statue: [16, 30, (P) => { P(3, 22, 10, 7, '#8b9bb4'); P(3, 22, 10, 1, '#c0cbdc'); P(2, 28, 12, 2, '#5a6988'); P(6, 10, 4, 12, '#c0cbdc'); P(5, 12, 6, 6, '#d6dde6'); P(6, 4, 4, 6, '#d6dde6'); P(6, 4, 4, 1, '#ffffff'); P(4, 12, 1, 6, '#b3bdc9'); P(11, 12, 1, 6, '#8b9bb4'); }],
    display: [16, 24, (P, r) => { P(2, 12, 12, 11, '#3a2218'); P(2, 12, 12, 1, '#7d4a2b'); P(3, 2, 10, 10, '#bfe9ff'); P(3, 2, 10, 1, '#ffffff'); P(4, 3, 1, 8, '#e8f8ff'); const c = r.pick(['#e8b923', '#e43b44', '#2ce8f5', '#63c74d']); P(6, 6, 4, 5, c); P(7, 5, 2, 1, shade(c, 0.4)); P(2, 22, 12, 2, '#221410'); }],
    tree: [32, 44, (P, r) => { P(14, 30, 4, 13, '#5f3822'); P(15, 30, 1, 13, '#7d4a2b'); P(12, 42, 8, 2, '#3d2414'); const g = ['#265c42', '#2f6a45', '#3e8948', '#4d9a58']; P(4, 8, 24, 22, g[0]); P(2, 12, 28, 14, g[0]); P(8, 3, 16, 8, g[1]); P(5, 9, 20, 15, g[1]); P(9, 5, 12, 10, g[2]); P(7, 12, 10, 6, g[2]); P(11, 6, 6, 4, g[3]); P(18, 16, 7, 5, g[2]); for (let i = 0; i < 14; i++) P(r.int(4, 26), r.int(6, 27), 2, 1, r.pick(g)); }],
    bush: [16, 16, (P, r) => { P(1, 4, 14, 11, '#2f6a45'); P(3, 2, 10, 4, '#3e8948'); P(2, 6, 12, 5, '#3e8948'); P(4, 4, 4, 3, '#63c74d'); P(1, 14, 14, 1, '#1d4530'); if (r.chance(0.5)) { P(10, 6, 1, 1, '#f6757a'); P(5, 9, 1, 1, '#f6757a'); P(12, 10, 1, 1, '#fee761'); } }],
    bench: [16, 16, (P) => { P(0, 4, 16, 3, '#8a5433'); P(0, 4, 16, 1, '#b07244'); P(0, 8, 16, 4, '#7d4a2b'); P(0, 11, 16, 1, '#5f3822'); P(1, 12, 2, 4, '#262b44'); P(13, 12, 2, 4, '#262b44'); }],
    car: [32, 22, (P, r, o) => { const c = o.color || '#a22633'; P(1, 6, 30, 13, c); P(1, 6, 30, 2, shade(c, 0.25)); P(6, 1, 18, 7, shade(c, -0.1)); P(8, 2, 6, 5, '#7fc4e8'); P(16, 2, 6, 5, '#7fc4e8'); P(8, 2, 6, 1, '#d8f1ff'); P(1, 17, 30, 2, shade(c, -0.4)); P(4, 16, 6, 6, '#181425'); P(22, 16, 6, 6, '#181425'); P(6, 18, 2, 2, '#8b9bb4'); P(24, 18, 2, 2, '#8b9bb4'); P(0, 10, 2, 3, '#fee761'); P(30, 10, 2, 3, '#e43b44'); }],
    fountain: [32, 30, (P) => { P(2, 12, 28, 16, '#8b9bb4'); P(2, 12, 28, 2, '#c0cbdc'); P(5, 14, 22, 10, '#2f77a8'); P(6, 15, 8, 1, '#7fc4e8'); P(18, 20, 6, 1, '#7fc4e8'); P(2, 26, 28, 3, '#5a6988'); P(14, 4, 4, 16, '#c0cbdc'); P(11, 3, 10, 3, '#d6dde6'); P(15, 0, 2, 4, '#7fc4e8'); P(12, 6, 1, 8, '#7fc4e8'); P(19, 6, 1, 8, '#7fc4e8'); }],
    container: [32, 30, (P, r, o) => { const c = o.color || '#b5452c'; P(0, 0, 32, 30, c); P(0, 0, 32, 8, shade(c, 0.18)); P(0, 7, 32, 1, shade(c, -0.3)); for (let x = 2; x < 32; x += 4) P(x, 9, 1, 19, shade(c, -0.2)); P(0, 28, 32, 2, shade(c, -0.5)); P(20, 14, 8, 6, '#e8e0d0'); P(21, 15, 6, 1, '#3a4466'); P(21, 17, 4, 1, '#3a4466'); }],
    forklift: [16, 24, (P) => { P(1, 8, 12, 12, '#feae34'); P(1, 8, 12, 2, '#fee761'); P(3, 2, 8, 7, '#262b44'); P(4, 3, 6, 4, '#7fc4e8'); P(13, 4, 2, 18, '#5a6988'); P(13, 20, 3, 2, '#8b9bb4'); P(2, 19, 4, 5, '#181425'); P(9, 19, 4, 5, '#181425'); }],
    drink: [16, 10, (P) => { P(6, 2, 4, 5, '#d8f1ff'); P(7, 3, 2, 3, '#f6c453'); P(7, 7, 2, 2, '#d8f1ff'); P(6, 9, 4, 1, '#c0cbdc'); P(6, 2, 1, 1, '#ffffff'); }],
    piano: [32, 26, (P) => { P(0, 4, 32, 18, '#181425'); P(0, 4, 32, 2, '#3a4466'); P(2, 14, 28, 4, '#ffffff'); for (let x = 3; x < 30; x += 3) P(x, 14, 1, 2, '#181425'); P(0, 20, 32, 2, '#0c0a14'); P(2, 22, 2, 4, '#181425'); P(28, 22, 2, 4, '#181425'); P(4, 7, 14, 1, '#262b44'); }],
    washer: [16, 22, (P) => { P(1, 1, 14, 20, '#e8eef5'); P(1, 1, 14, 3, '#c0cbdc'); P(3, 2, 2, 1, '#e43b44'); P(10, 2, 3, 1, '#262b44'); P(4, 7, 8, 8, '#5a6988'); P(5, 8, 6, 6, '#2f77a8'); P(6, 9, 2, 2, '#7fc4e8'); P(1, 20, 14, 2, '#8b9bb4'); }],
    pooltable: [32, 22, (P) => { P(0, 2, 32, 16, '#5f3822'); P(2, 4, 28, 12, '#2f6a45'); P(2, 4, 28, 1, '#3e8948'); P(10, 8, 2, 2, '#ffffff'); P(20, 9, 2, 2, '#e43b44'); P(23, 7, 2, 2, '#fee761'); P(0, 17, 32, 2, '#3a2218'); P(2, 19, 3, 3, '#2e1c14'); P(27, 19, 3, 3, '#2e1c14'); }],
    clothes: [16, 12, (P, r, o) => { const c = o.color || '#c0cbdc'; P(3, 5, 10, 6, c); P(3, 5, 10, 1, shade(c, 0.3)); P(4, 2, 8, 4, shade(c, -0.15)); P(6, 3, 4, 1, shade(c, 0.3)); P(3, 10, 10, 1, shade(c, -0.4)); }],
    slot: [16, 28, (P, r) => { const c = r.pick(['#a22633', '#124e89', '#68386c']); P(1, 2, 14, 24, c); P(1, 2, 14, 2, shade(c, 0.3)); P(3, 5, 10, 8, '#181425'); P(4, 6, 2, 6, '#fee761'); P(7, 6, 2, 6, '#e43b44'); P(10, 6, 2, 6, '#63c74d'); P(3, 15, 10, 3, '#e8b923'); P(5, 16, 6, 1, '#181425'); P(14, 8, 2, 1, '#c0cbdc'); P(15, 6, 1, 3, '#e43b44'); P(2, 20, 12, 4, shade(c, -0.3)); P(1, 26, 14, 2, '#181425'); }],
    cardtable: [32, 22, (P) => { P(1, 2, 30, 16, '#3a2218'); P(3, 4, 26, 12, '#1d6a3a'); P(3, 4, 26, 1, '#2f8a50'); P(8, 8, 3, 4, '#ffffff'); P(12, 8, 3, 4, '#ffffff'); P(9, 9, 1, 1, '#e43b44'); P(13, 10, 1, 1, '#181425'); P(20, 7, 3, 3, '#e43b44'); P(21, 10, 3, 3, '#124e89'); P(19, 11, 3, 3, '#fee761'); P(1, 17, 30, 2, '#221410'); P(3, 19, 3, 3, '#221410'); P(26, 19, 3, 3, '#221410'); }],
    tank: [16, 30, (P, r) => { P(2, 0, 12, 3, '#5a6988'); P(2, 3, 12, 22, '#3fae9a'); P(3, 4, 2, 20, '#8af0dc'); P(6, 10, 5, 8, r.pick(['#d49a74', '#b55088', '#9ab0a0'])); P(7, 8, 3, 2, '#d49a74'); for (let i = 0; i < 4; i++) P(r.int(4, 11), r.int(5, 22), 1, 1, '#d8fff6'); P(1, 25, 14, 5, '#3a4466'); P(3, 27, 3, 1, '#63c74d'); P(8, 27, 2, 1, '#e43b44'); }],
    cart: [16, 22, (P) => { P(2, 4, 12, 12, '#e8b923'); P(2, 2, 12, 2, '#fee761'); P(4, 6, 8, 6, '#733e39'); P(5, 7, 6, 4, '#a0623a'); P(3, 10, 5, 5, '#3a4466'); P(9, 9, 4, 6, '#124e89'); P(2, 16, 12, 2, '#b8860b'); P(3, 18, 3, 3, '#181425'); P(10, 18, 3, 3, '#181425'); }],
    pine: [32, 44, (P, r) => { P(14, 34, 4, 9, '#5f3822'); P(12, 42, 8, 2, '#3d2414'); const g = ['#1d4530', '#25563a', '#2f6a45']; P(13, 2, 6, 6, g[2]); P(10, 8, 12, 8, g[1]); P(7, 15, 18, 9, g[1]); P(4, 23, 24, 11, g[0]); P(12, 4, 3, 3, '#e8eef5'); P(9, 12, 5, 2, '#e8eef5'); P(6, 20, 6, 2, '#e8eef5'); P(19, 19, 5, 2, '#e8eef5'); P(4, 30, 7, 2, '#e8eef5'); P(21, 29, 6, 2, '#e8eef5'); for (let i = 0; i < 6; i++) P(r.int(6, 24), r.int(10, 32), 2, 1, g[2]); }],
    snowman: [16, 22, (P) => { P(3, 10, 10, 11, '#e8eef5'); P(4, 3, 8, 8, '#ffffff'); P(6, 5, 1, 1, '#181425'); P(9, 5, 1, 1, '#181425'); P(7, 7, 3, 1, '#f77622'); P(4, 10, 8, 2, '#a22633'); P(7, 13, 1, 1, '#181425'); P(7, 16, 1, 1, '#181425'); }],
    reception: [32, 20, (P) => { P(0, 4, 32, 14, '#5f3822'); P(0, 2, 32, 4, '#e8e0d0'); P(0, 2, 32, 1, '#ffffff'); P(2, 8, 28, 1, '#e8b923'); P(4, 11, 6, 5, '#7d4a2b'); P(13, 11, 6, 5, '#7d4a2b'); P(22, 11, 6, 5, '#7d4a2b'); P(24, 0, 3, 3, '#e8b923'); P(25, 0, 1, 1, '#fff3c4'); P(5, 0, 6, 3, '#262b44'); P(6, 1, 4, 1, '#2ce8f5'); P(0, 18, 32, 2, '#2e1c14'); }],
    frame: [16, 26, (P, r) => { P(1, 0, 14, 18, '#e8b923'); P(2, 1, 12, 16, '#b8860b'); P(3, 2, 10, 14, r.pick(['#2f4a78', '#3e8948', '#8e2b3c', '#68386c', '#e8e0d0'])); P(5, 5, 4, 5, r.pick(['#fee761', '#f6757a', '#c0cbdc', '#181425'])); P(8, 9, 4, 5, r.pick(['#63c74d', '#feae34', '#2ce8f5'])); P(6, 18, 4, 6, '#3a4466'); P(4, 24, 8, 2, '#262b44'); P(1, 0, 14, 1, '#fee761'); }],
    exitpad: [16, 16, (P) => { P(1, 1, 14, 14, '#1d2b1f'); P(1, 1, 14, 1, '#63c74d'); P(1, 14, 14, 1, '#63c74d'); P(1, 1, 1, 14, '#63c74d'); P(14, 1, 1, 14, '#63c74d'); P(7, 4, 2, 8, '#63c74d'); P(5, 6, 6, 1, '#63c74d'); P(6, 5, 4, 1, '#63c74d'); }],
    boat: [32, 26, (P) => { P(2, 8, 28, 14, '#e8eef5'); P(0, 12, 32, 8, '#e8eef5'); P(2, 8, 28, 2, '#ffffff'); P(0, 18, 32, 3, '#a22633'); P(8, 3, 14, 7, '#262b44'); P(10, 4, 10, 4, '#7fc4e8'); P(4, 21, 24, 3, '#5a6988'); }],
  };
  const propCache = new Map();
  S.prop = function (type, variant, opts) {
    const key = type + ':' + (variant || 0) + ':' + ((opts && opts.color) || '');
    let c = propCache.get(key);
    if (c) return c;
    const def = PROPS[type];
    if (!def) return null;
    let x;
    [c, x] = mk(def[0] + 2, def[1] + 2, true);
    const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px + 1, py + 1, w, h); };
    def[2](P, new SC.RNG(SC.hashStr(key)), opts || {});
    if (type !== 'exitpad') outline(c, PAL.ink);
    propCache.set(key, c);
    return c;
  };
  S.propSize = (type) => (PROPS[type] ? [PROPS[type][0], PROPS[type][1]] : [16, 16]);

  // ------------------------------------------------------------ item icons (12x12)
  const ICONS = {
    fists: (P) => { P(3, 4, 6, 5, '#e8b796'); P(3, 4, 6, 1, '#f2c9a5'); P(4, 5, 1, 3, '#b87a56'); P(6, 5, 1, 3, '#b87a56'); P(9, 6, 1, 3, '#e8b796'); P(3, 9, 5, 2, '#ffffff'); },
    wire: (P) => { P(1, 8, 2, 3, '#733e39'); P(9, 1, 2, 3, '#733e39'); P(3, 8, 1, 1, '#c0cbdc'); P(4, 7, 1, 1, '#c0cbdc'); P(5, 6, 1, 1, '#c0cbdc'); P(6, 5, 1, 1, '#c0cbdc'); P(7, 4, 1, 1, '#c0cbdc'); P(8, 3, 1, 1, '#c0cbdc'); },
    knife: (P) => { P(2, 8, 3, 2, '#733e39'); P(5, 7, 1, 2, '#feae34'); P(5, 6, 2, 2, '#c0cbdc'); P(7, 4, 2, 3, '#c0cbdc'); P(9, 2, 1, 3, '#ffffff'); P(8, 3, 1, 1, '#ffffff'); },
    wrench: (P) => { P(2, 8, 2, 2, '#8b9bb4'); P(4, 6, 2, 2, '#8b9bb4'); P(6, 4, 2, 2, '#8b9bb4'); P(7, 1, 3, 3, '#c0cbdc'); P(8, 1, 1, 2, '#262b44'); P(1, 9, 2, 2, '#c0cbdc'); },
    pistol: (P) => { P(2, 4, 8, 2, '#3a4466'); P(2, 4, 8, 1, '#5a6988'); P(6, 6, 3, 4, '#262b44'); P(5, 6, 1, 2, '#262b44'); },
    silenced: (P) => { P(0, 4, 5, 2, '#181425'); P(5, 4, 5, 2, '#3a4466'); P(5, 4, 5, 1, '#5a6988'); P(7, 6, 3, 4, '#262b44'); P(6, 6, 1, 2, '#262b44'); },
    coin: (P) => { P(4, 2, 4, 8, '#e8b923'); P(3, 3, 6, 6, '#e8b923'); P(4, 3, 3, 1, '#fee761'); P(5, 5, 2, 3, '#b8860b'); },
    lockpick: (P) => { P(1, 7, 4, 3, '#262b44'); P(5, 8, 5, 1, '#c0cbdc'); P(9, 7, 1, 1, '#c0cbdc'); P(5, 6, 4, 1, '#8b9bb4'); P(8, 5, 1, 1, '#8b9bb4'); },
    lethal: (P) => { P(4, 1, 4, 2, '#733e39'); P(4, 3, 4, 7, '#d8f1ff'); P(5, 5, 2, 4, '#9b4dca'); P(4, 10, 4, 1, '#8b9bb4'); P(5, 6, 1, 1, '#d9a5ff'); },
    emetic: (P) => { P(4, 1, 4, 2, '#733e39'); P(4, 3, 4, 7, '#d8f1ff'); P(5, 5, 2, 4, '#63c74d'); P(4, 10, 4, 1, '#8b9bb4'); P(5, 6, 1, 1, '#c8ffb5'); },
    keycard: (P) => { P(1, 3, 10, 6, '#e8eef5'); P(1, 3, 10, 2, '#e43b44'); P(2, 6, 3, 2, '#262b44'); P(6, 6, 4, 1, '#8b9bb4'); },
    package: (P) => { P(1, 3, 10, 7, '#733e39'); P(1, 3, 10, 1, '#b86f50'); P(5, 1, 2, 2, '#262b44'); P(5, 5, 2, 2, '#e8b923'); },
    crowbar: (P) => { P(2, 9, 2, 1, '#a22633'); P(3, 8, 1, 1, '#a22633'); P(4, 7, 1, 1, '#a22633'); P(5, 6, 1, 1, '#a22633'); P(6, 5, 1, 1, '#a22633'); P(7, 4, 1, 1, '#a22633'); P(8, 2, 1, 2, '#a22633'); P(9, 2, 1, 1, '#a22633'); },
    bottle: (P) => { P(5, 1, 2, 3, '#3e8948'); P(4, 4, 4, 7, '#3e8948'); P(5, 5, 1, 4, '#63c74d'); P(4, 6, 4, 2, '#e8e0d0'); },
  };
  const iconCache = new Map(), iconURL = new Map();
  S.icon = function (id) {
    if (iconCache.has(id)) return iconCache.get(id);
    const [c, x] = mk(12, 12, true);
    const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    (ICONS[id] || ICONS.package)(P);
    outline(c, PAL.ink);
    iconCache.set(id, c);
    return c;
  };
  S.iconURL = function (id) {
    if (!iconURL.has(id)) {
      const [c, x] = mk(48, 48);
      x.drawImage(S.icon(id), 0, 0, 48, 48);
      iconURL.set(id, c.toDataURL());
    }
    return iconURL.get(id);
  };
})();
