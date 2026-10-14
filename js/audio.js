// Tiny WebAudio synth: sound effects + a generative ambient score. No audio files.
(function () {
  const SC = window.SC;
  const A = (SC.Audio = { vol: 0.6, music: true });
  let ctx = null, master = null, musicGain = null, noiseBuf = null, seqT = 0, step = 0, mood = 0;
  try { const s = JSON.parse(localStorage.getItem('sc_audio') || '{}'); if (s.vol != null) A.vol = s.vol; if (s.music != null) A.music = s.music; } catch (e) { /* storage unavailable */ }
  A.save = () => { try { localStorage.setItem('sc_audio', JSON.stringify({ vol: A.vol, music: A.music })); } catch (e) { /* storage unavailable */ } };

  A.unlock = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = A.vol; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = A.music ? 0.22 : 0; musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };
  A.setVol = (v) => { A.vol = v; if (master) master.gain.value = v; A.save(); };
  A.setMusic = (on) => { A.music = on; if (musicGain) musicGain.gain.value = on ? 0.22 : 0; A.save(); };

  function tone(f, dur, type, vol, slide, dest, when) {
    const t = (when || ctx.currentTime);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(ctx.currentTime + dur);
  }
  const FX = {
    ui: () => tone(880, 0.05, 'square', 0.05),
    step: () => noise(0.04, 0.025, 420 + Math.random() * 200, 1.5),
    tick: () => tone(1200, 0.03, 'square', 0.03),
    pickup: () => { tone(660, 0.06, 'square', 0.06); tone(990, 0.08, 'square', 0.05, null, null, ctx.currentTime + 0.06); },
    drop: () => tone(300, 0.06, 'triangle', 0.08),
    intel: () => { tone(523, 0.08, 'sine', 0.09); tone(784, 0.12, 'sine', 0.08, null, null, ctx.currentTime + 0.08); },
    door: () => noise(0.08, 0.05, 600, 2),
    unlock: () => { tone(1400, 0.04, 'square', 0.05); tone(900, 0.06, 'square', 0.05, null, null, ctx.currentTime + 0.05); },
    cloth: () => noise(0.25, 0.08, 2500, 0.5),
    throw: () => noise(0.12, 0.06, 3000, 1),
    coin: () => { tone(2400, 0.05, 'square', 0.05); tone(3100, 0.12, 'square', 0.04, null, null, ctx.currentTime + 0.05); },
    thud: () => { tone(120, 0.15, 'sine', 0.25, 0.5); noise(0.08, 0.1, 300); },
    struggle: () => { noise(0.4, 0.08, 800, 0.4); tone(160, 0.2, 'sawtooth', 0.04, 0.7); },
    kill: () => { tone(90, 0.3, 'sine', 0.25, 0.4); noise(0.15, 0.08, 500); },
    shot: () => { noise(0.25, 0.5, 900, 0.4); tone(110, 0.2, 'sawtooth', 0.15, 0.3); },
    silenced: () => { noise(0.08, 0.18, 2200, 1.2); tone(300, 0.05, 'square', 0.04, 0.5); },
    click: () => tone(1800, 0.02, 'square', 0.04),
    hurt: () => { tone(200, 0.15, 'sawtooth', 0.12, 0.5); },
    spot: () => tone(740, 0.12, 'triangle', 0.08, 1.3),
    alert: () => { tone(880, 0.1, 'square', 0.1); tone(660, 0.14, 'square', 0.1, null, null, ctx.currentTime + 0.1); },
    alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 820, 0.18, 'sawtooth', 0.07, null, null, ctx.currentTime + i * 0.18); },
    blackout: () => { tone(220, 0.6, 'sawtooth', 0.12, 0.2); noise(0.3, 0.1, 400); },
    target: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, null, null, ctx.currentTime + i * 0.14)); },
    win: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.5, 'triangle', 0.1, null, null, ctx.currentTime + i * 0.12)); },
    fail: () => { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.6, 'sawtooth', 0.07, null, null, ctx.currentTime + i * 0.18)); },
  };
  A.play = function (name) { if (!ctx || !FX[name]) return; try { FX[name](); } catch (e) { /* ignore audio errors */ } };

  // generative score: bass ostinato + sparse minor arpeggio, intensity follows the suspicion level
  const SCALE = [0, 3, 5, 7, 10, 12, 15];
  A.update = function (dt, level) {
    if (!ctx || !A.music) return;
    mood += ((level || 0) - mood) * Math.min(1, dt * 0.8);
    seqT -= dt;
    if (seqT > 0) return;
    const tense = mood > 2.2;
    seqT = tense ? 0.16 : 0.32;
    const root = 55 * Math.pow(2, (tense ? 1 : 0) / 12);
    if (step % 8 === 0) tone(root, tense ? 0.3 : 0.9, 'triangle', 0.32, null, musicGain);
    if (step % 8 === 4 && !tense) tone(root * 1.5, 0.6, 'triangle', 0.18, null, musicGain);
    if (tense && step % 2 === 0) tone(root * 2, 0.12, 'sawtooth', 0.06, null, musicGain);
    if (Math.random() < (tense ? 0.5 : 0.28)) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)];
      tone(220 * Math.pow(2, n / 12), tense ? 0.15 : 0.5, 'sine', 0.07, null, musicGain);
    }
    step++;
  };
})();
