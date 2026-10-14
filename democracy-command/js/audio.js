// Synthesized UI and war sounds. Audio starts only after the first click.
(function () {
  const DC = window.DC;
  const A = (DC.Audio = { muted: DC.store.get('dc_mute', false), ctx: null });
  function ac() {
    if (A.muted) return null;
    if (!A.ctx) { try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }
  function tone(freq, dur, type, vol, when, slide) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, cutoff, when) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + (when || 0);
    const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = cutoff || 600; g.gain.value = vol || 0.2;
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  A.click = () => tone(880, 0.05, 'square', 0.03);
  A.hover = () => tone(1320, 0.03, 'sine', 0.012);
  A.alert = () => { tone(660, 0.18, 'sawtooth', 0.04); tone(440, 0.22, 'sawtooth', 0.04, 0.2); };
  A.good = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.05, i * 0.09));
  A.bad = () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.035, i * 0.14));
  A.boom = () => { noise(0.9, 0.35, 380); tone(90, 0.6, 'sine', 0.12, 0, 40); };
  A.event = () => { tone(1046, 0.12, 'square', 0.03); tone(1568, 0.2, 'square', 0.03, 0.12); };
  A.toggle = () => { A.muted = !A.muted; DC.store.set('dc_mute', A.muted); if (!A.muted) A.click(); return A.muted; };

  DC.on('liberated', ({ planet }) => (planet.home ? (A.good(), setTimeout(A.good, 400)) : A.good()));
  DC.on('fell', A.bad);
  DC.on('attack', ({ planet }) => (planet.ring <= 1 ? A.alert() : tone(520, 0.12, 'square', 0.025)));
  DC.on('defended', () => tone(784, 0.2, 'triangle', 0.05));
  DC.on('action', ({ action }) => (action.id === 'bombard' || action.id === 'hellbomb' ? A.boom() : A.click()));
  DC.on('event', A.event);
  DC.on('destroyed', A.boom);
  DC.on('fx', (f) => { if (f.type === 'cannon') A.boom(); });
})();
