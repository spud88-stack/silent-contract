// OpenRouter transport. The key is supplied by the player in Settings and lives only in this browser's localStorage.
(function () {
  const SC = window.SC;
  const PREFERRED = ['anthropic/claude-haiku-5.5', 'anthropic/claude-haiku-4.5', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini'];
  const L = (SC.LLM = {
    cfg: { key: '', model: 'anthropic/claude-haiku-4.5', ambient: true },
    inflight: 0, lastError: '', calls: 0,
    load() {
      try { Object.assign(L.cfg, JSON.parse(localStorage.getItem('sc_ai') || '{}')); } catch (e) { /* storage unavailable */ }
    },
    save() {
      try { localStorage.setItem('sc_ai', JSON.stringify(L.cfg)); } catch (e) { /* storage unavailable */ }
    },
    enabled() { return !!(L.cfg.key && L.cfg.model); },

    async listModels() {
      const r = await fetch('https://openrouter.ai/api/v1/models');
      const j = await r.json();
      const ids = (j.data || []).map((m) => m.id).sort();
      const best = PREFERRED.find((p) => ids.includes(p));
      return { ids, best };
    },

    async call(messages, opts) {
      opts = opts || {};
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeout || 14000);
      L.inflight++; L.calls++;
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + L.cfg.key, 'HTTP-Referer': location.origin || 'http://localhost', 'X-Title': 'Silent Contract' },
          body: JSON.stringify({ model: L.cfg.model, messages, max_tokens: opts.max || 260, temperature: opts.temp == null ? 0.85 : opts.temp }),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
        L.lastError = '';
        return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      } catch (e) {
        L.lastError = e.name === 'AbortError' ? 'timed out' : String(e.message || e);
        throw e;
      } finally {
        clearTimeout(timer); L.inflight--;
      }
    },

    async json(messages, opts) {
      const text = await L.call(messages, opts);
      const a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a < 0 || b <= a) throw new Error('no JSON in reply');
      return JSON.parse(text.slice(a, b + 1));
    },

    async test() {
      const out = await L.call([{ role: 'user', content: 'Reply with exactly: READY' }], { max: 10, temp: 0 });
      return out.trim();
    },
  });
  L.load();
})();
