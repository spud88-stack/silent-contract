// Shared helpers: namespace, RNG, formatting.
(function () {
  const DC = (window.DC = window.DC || {});

  // Seeded RNG (mulberry32) so a war seed always produces the same galaxy.
  DC.makeRng = function (seed) {
    let a = seed >>> 0;
    const f = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      f,
      r: (a0, b0) => a0 + f() * (b0 - a0),
      i: (a0, b0) => Math.floor(a0 + f() * (b0 - a0 + 1)),
      pick: (arr) => arr[Math.floor(f() * arr.length)],
      chance: (p) => f() < p,
      shuffle(arr) {
        for (let k = arr.length - 1; k > 0; k--) {
          const j = Math.floor(f() * (k + 1));
          [arr[k], arr[j]] = [arr[j], arr[k]];
        }
        return arr;
      },
    };
  };
  // Unseeded RNG for the live simulation.
  DC.R = DC.makeRng((Math.random() * 2 ** 32) >>> 0);
  DC.R.f = Math.random;

  DC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  DC.lerp = (a, b, t) => a + (b - a) * t;
  DC.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  DC.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  DC.fmt = (n) => Math.round(n).toLocaleString('en-US');
  DC.fmtShort = (n) => {
    n = Math.round(n);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return DC.fmt(n);
  };
  // Durations are in game hours.
  DC.fmtDur = (h) => {
    h = Math.max(0, h);
    const d = Math.floor(h / 24), hh = Math.floor(h % 24), mm = Math.floor((h * 60) % 60);
    if (d > 0) return d + 'D ' + hh + 'H';
    if (hh > 0) return hh + 'H ' + String(mm).padStart(2, '0') + 'M';
    return mm + 'M';
  };
  DC.fmtClock = (h) => {
    const d = Math.floor(h / 24) + 1, hh = Math.floor(h % 24), mm = Math.floor((h * 60) % 60);
    return 'DAY ' + d + ' · ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };
  DC.pct = (v, d) => (v).toFixed(d == null ? 1 : d) + '%';
  DC.$ = (sel) => document.querySelector(sel);
  DC.uid = (() => { let n = 1; return (p) => (p || 'x') + (n++) + '_' + Math.floor(Math.random() * 1e6).toString(36); })();
  DC.fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

  DC.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
})();
