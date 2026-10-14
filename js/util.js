// Shared helpers: seeded RNG, math, DOM.
(function () {
  const SC = (window.SC = window.SC || {});
  SC.TILE = 16;

  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + this.next() * (b - a); }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    take(arr, n) { return this.shuffle(arr.slice()).slice(0, n); }
  }
  SC.RNG = RNG;

  SC.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  SC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  SC.lerp = (a, b, t) => a + (b - a) * t;
  SC.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  SC.angDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  SC.turnToward = (a, b, max) => {
    const d = SC.angDiff(a, b);
    return Math.abs(d) <= max ? b : a + Math.sign(d) * max;
  };
  // angle -> sprite direction row: 0 down, 1 left, 2 right, 3 up
  SC.dirOf = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    if (Math.abs(c) > Math.abs(s)) return c < 0 ? 1 : 2;
    return s < 0 ? 3 : 0;
  };
  SC.el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  SC.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  SC.$ = (sel) => document.querySelector(sel);

  // Min-heap for A*
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(n) {
      const a = this.a; a.push(n);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
  }
  SC.Heap = Heap;
})();
