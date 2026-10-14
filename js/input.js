// Keyboard + mouse state with edge detection.
(function () {
  const SC = window.SC;
  const I = (SC.Input = {
    keys: new Set(), edge: new Set(),
    mouse: { x: 0, y: 0, wx: 0, wy: 0, l: false, r: false, lp: false, rp: false, wheel: 0 },
    down(k) { return I.keys.has(k); },
    pressed(k) { if (I.edge.has(k)) { I.edge.delete(k); return true; } return false; },
    clear() { I.keys.clear(); I.edge.clear(); I.mouse.l = I.mouse.r = false; },
    endFrame() { I.edge.clear(); I.mouse.lp = false; I.mouse.rp = false; I.mouse.wheel = 0; },
    typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); },
    bind(canvas) {
      window.addEventListener('keydown', (e) => {
        if (I.typing()) return;
        const k = e.key.toLowerCase();
        if (['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
        if (!I.keys.has(k)) I.edge.add(k);
        I.keys.add(k);
      });
      window.addEventListener('keyup', (e) => { I.keys.delete(e.key.toLowerCase()); });
      window.addEventListener('blur', () => { I.keys.clear(); I.mouse.l = I.mouse.r = false; });
      canvas.addEventListener('mousemove', (e) => { I.mouse.x = e.clientX; I.mouse.y = e.clientY; });
      canvas.addEventListener('mousedown', (e) => {
        I.mouse.x = e.clientX; I.mouse.y = e.clientY;
        if (e.button === 0) { I.mouse.l = true; I.mouse.lp = true; }
        if (e.button === 2) { I.mouse.r = true; I.mouse.rp = true; }
      });
      window.addEventListener('mouseup', (e) => { if (e.button === 0) I.mouse.l = false; if (e.button === 2) I.mouse.r = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (e) => { I.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    },
  });
})();
