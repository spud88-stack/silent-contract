// OpenRouter client. Shares its settings (sc_ai) with Silent Contract so one key works for both games.
(function () {
  const DC = window.DC;
  const PREFERRED = ['anthropic/claude-haiku-5.5', 'anthropic/claude-haiku-4.5', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini'];
  const L = (DC.LLM = {
    cfg: { key: '', model: 'anthropic/claude-haiku-4.5', director: true },
    inflight: 0, lastError: '', calls: 0, lastCall: 0,
    load() { Object.assign(L.cfg, DC.store.get('sc_ai', {})); },
    save() { DC.store.set('sc_ai', L.cfg); },
    enabled() { return !!(L.cfg.key && L.cfg.model && L.cfg.director !== false); },
    async listModels() {
      const r = await fetch('https://openrouter.ai/api/v1/models');
      const j = await r.json();
      const ids = (j.data || []).map((m) => m.id).sort();
      return { ids, best: PREFERRED.find((p) => ids.includes(p)) };
    },
    async call(messages, opts) {
      opts = opts || {};
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeout || 20000);
      L.inflight++; L.calls++; L.lastCall = Date.now();
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + L.cfg.key, 'HTTP-Referer': location.origin || 'http://localhost', 'X-Title': 'Democracy Command' },
          body: JSON.stringify({ model: L.cfg.model, messages, max_tokens: opts.max || 400, temperature: opts.temp == null ? 0.9 : opts.temp }),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
        L.lastError = '';
        return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      } catch (e) {
        L.lastError = e.name === 'AbortError' ? 'timed out' : String(e.message || e);
        throw e;
      } finally { clearTimeout(timer); L.inflight--; }
    },
    async json(messages, opts) {
      const text = await L.call(messages, opts);
      const a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a < 0 || b <= a) throw new Error('no JSON in reply');
      return JSON.parse(text.slice(a, b + 1));
    },
    async test() { return (await L.call([{ role: 'user', content: 'Reply with exactly: READY' }], { max: 10, temp: 0 })).trim(); },
  });
  L.load();
})();
