// Small canvas line charts for the War Record: shared x axis (war days), faint grid, end labels, hover crosshair.
(function () {
  const DC = window.DC;
  DC.Charts = {
    line(wrap, data, series, opts) {
      opts = opts || {};
      const cv = document.createElement('canvas');
      const tip = document.createElement('div'); tip.className = 'ctip'; tip.hidden = true;
      wrap.appendChild(cv); wrap.appendChild(tip);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let hoverI = -1;
      const M = { l: 40, r: 74, t: 10, b: 24 };
      const xs = data.map((d) => d.t / 24);
      const yMax = opts.yMax || Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key]))) * 1.08;
      const niceStep = (span) => { const raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
      function draw() {
        const w = cv.clientWidth, h = cv.clientHeight;
        cv.width = w * dpr; cv.height = h * dpr;
        const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
        const X0 = xs[0] || 0, X1 = Math.max(X0 + 0.5, xs[xs.length - 1] || 1);
        const px = (v) => M.l + ((v - X0) / (X1 - X0)) * (w - M.l - M.r);
        const py = (v) => h - M.b - (v / yMax) * (h - M.t - M.b);
        x.font = '12px "Barlow Semi Condensed", sans-serif'; x.fillStyle = '#8fa4b8'; x.strokeStyle = 'rgba(160,190,220,0.12)'; x.lineWidth = 1;
        const ys = niceStep(yMax);
        x.textAlign = 'right'; x.textBaseline = 'middle';
        for (let v = 0; v <= yMax; v += ys) { x.beginPath(); x.moveTo(M.l, py(v)); x.lineTo(w - M.r, py(v)); x.stroke(); x.fillText(opts.fmt ? opts.fmt(v) : DC.fmtShort(v), M.l - 6, py(v)); }
        const xsStep = Math.max(1, niceStep(X1 - X0));
        x.textAlign = 'center'; x.textBaseline = 'top';
        for (let v = Math.ceil(X0 / xsStep) * xsStep; v <= X1; v += xsStep) x.fillText('Day ' + (Math.round(v) + 1), px(v), h - M.b + 6);
        const ends = [];
        series.forEach((s) => {
          x.strokeStyle = s.color; x.lineWidth = 2; x.lineJoin = 'round';
          x.beginPath();
          data.forEach((d, i) => { const X = px(xs[i]), Y = py(d[s.key]); i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
          x.stroke();
          if (s.area) {
            x.lineTo(px(xs[xs.length - 1]), py(0)); x.lineTo(px(xs[0]), py(0)); x.closePath();
            x.fillStyle = DC.Render.hexA(s.color, 0.12); x.fill();
          }
          const last = data[data.length - 1];
          if (last) {
            const Y = py(last[s.key]);
            x.fillStyle = s.color; x.beginPath(); x.arc(px(xs[xs.length - 1]), Y, 3.5, 0, Math.PI * 2); x.fill();
            ends.push({ y: Y, s, v: last[s.key] });
          }
        });
        // End labels in text ink, nudged apart so they never collide.
        ends.sort((a, b) => a.y - b.y);
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
        x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#e9f1f8';
        ends.forEach((e) => x.fillText(e.s.short + ' ' + (opts.fmt ? opts.fmt(e.v) : DC.fmtShort(e.v)), w - M.r + 8, e.y));
        if (hoverI >= 0 && data[hoverI]) {
          const X = px(xs[hoverI]);
          x.strokeStyle = 'rgba(233,241,248,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(X, M.t); x.lineTo(X, h - M.b); x.stroke();
          series.forEach((s) => { x.fillStyle = s.color; x.strokeStyle = '#070c14'; x.lineWidth = 2; x.beginPath(); x.arc(X, py(data[hoverI][s.key]), 4, 0, Math.PI * 2); x.fill(); x.stroke(); });
        }
        cv._px = px;
      }
      cv.addEventListener('pointermove', (e) => {
        const r = cv.getBoundingClientRect(), mx = e.clientX - r.left;
        let bi = -1, bd = 1e9;
        xs.forEach((v, i) => { const d = Math.abs(cv._px(v) - mx); if (d < bd) { bd = d; bi = i; } });
        hoverI = bi; draw();
        if (bi < 0) return;
        const d = data[bi];
        tip.hidden = false;
        tip.innerHTML = '<div><b>' + DC.esc(DC.fmtClock(d.t)) + '</b></div>' + series.map((s) => '<div><span><i style="--c:' + s.color + '"></i>' + DC.esc(s.name) + '</span><b>' + (opts.fmt ? opts.fmt(d[s.key]) : DC.fmtShort(d[s.key])) + '</b></div>').join('');
        const tx = cv._px(xs[bi]);
        tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, tx + 12)) + 'px';
        tip.style.top = '8px';
      });
      cv.addEventListener('pointerleave', () => { hoverI = -1; tip.hidden = true; draw(); });
      requestAnimationFrame(draw);
    },
  };
})();
