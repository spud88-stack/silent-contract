// Say something out loud: everyone in earshot hears it and reacts in their own way.
(function () {
  const SC = window.SC;
  const { clamp, dist } = SC;
  const S = (SC.Shout = {});
  const G = () => SC.G;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const $ = (id) => document.getElementById(id);
  const RANGE = { whisper: 40, say: 115, shout: 270 };
  const REACTIONS = ['ignore', 'glance', 'believe', 'panic', 'approach', 'laugh', 'suspicious', 'report', 'spread'];
  const CALM = { routine: 1, chat: 1, notice: 1, errand: 1, wait: 1, follow: 1 };

  function listeners(vol) {
    const g = G(), P = g.P, r = RANGE[vol];
    return g.npcs
      .filter((n) => CALM[n.state] && !n.held && !n.body && dist(n.x, n.y, P.x, P.y) < r && (g.los(P.x, P.y - 8, n.x, n.y - 8) || dist(n.x, n.y, P.x, P.y) < r * 0.55))
      .sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y))
      .slice(0, vol === 'whisper' ? 2 : 8);
  }

  // ------------------------------------------------------------ deciding reactions
  async function llmReactions(text, vol, list) {
    const g = G(), P = g.P, m = g.map;
    const fits = SC.MapGen.allowed(P.room, P.outfit.kind);
    const lines = list.map((n, i) => '[' + i + '] ' + n.name + ', ' + (n.isTarget && !n.suspect ? 'the boss' : n.outfit.name) + (n.armed ? ' (armed security)' : '') + '; ' + n.persona.traits.join(', ') + '; gullibility ' + Math.round(n.persona.gull * 10) + '/10; currently ' + (n.act || 'idle') + (n.liedTo ? '; already fooled tonight, wary' : '') + '; suspicion of the speaker ' + Math.round(n.sus) + '/100');
    const prompt = [
      'Stealth game crowd simulation at ' + m.name + ' (' + m.region + ') during ' + m.theme.event + '.',
      'A bald man dressed as "' + P.outfit.name + '"' + (fits ? '' : ' (who does not belong in this area)') + ' just ' + (vol === 'shout' ? 'SHOUTED' : vol === 'whisper' ? 'whispered' : 'said out loud') + ' in the ' + (P.room ? P.room.name : 'grounds') + ': "' + text + '"',
      'These people heard it:', lines.join('\n'),
      'Decide how EACH person reacts, true to their personality. Believable claims often work on gullible people; absurd or alarming ones without reason make security suspicious. Not everyone reacts the same way.',
      'Reactions: ignore, glance, believe (they act on it and may go to a room), panic (they hurry away from here), approach (they come over to see), laugh, suspicious (they eye the speaker), report (security gets involved), spread (they believe it and will gossip).',
      'Rooms: ' + m.rooms.map((r) => r.name).join(', ') + '.',
      'Reply with JSON only: {"reactions":[{"i":0,"reaction":"...","say":"short line or empty","thought":"short private thought","room":"room name or empty"}]}',
    ].join('\n');
    const r = await SC.LLM.json([{ role: 'user', content: prompt }], { max: 420, timeout: 12000 });
    return (r.reactions || []).map((x) => ({ n: list[x.i], reaction: REACTIONS.includes(x.reaction) ? x.reaction : 'glance', say: String(x.say || '').slice(0, 120), thought: String(x.thought || '').slice(0, 120), room: SC.Talk.findRoom(x.room), ai: true })).filter((x) => x.n);
  }

  function ruleReactions(text, vol, list) {
    const g = G(), P = g.P, t = ' ' + text.toLowerCase() + ' ';
    const has = (...w) => w.some((x) => t.includes(x));
    const room = SC.Talk.findRoom(text);
    const alarm = has('fire', ' gas', 'bomb', 'shooter', ' gun', 'evacuate', 'run!', 'police', 'help', 'smoke', 'flood', 'everyone out', 'get out');
    const lure = has('free ', 'drinks', 'champagne', 'buffet', 'food', 'prize', 'celebrity', 'famous', 'autograph', 'show', 'fight', 'raffle', 'jackpot', 'cake', 'giveaway');
    const order = has('attention', 'announcement', 'meeting', 'briefing', 'staff', 'all hands', 'shift change', 'manager wants', 'report to');
    const gossip = has('did you hear', 'apparently', 'word is', 'rumor', 'rumour', 'everyone knows', 'i heard');
    const out = [];
    let herd = 0; // people follow the crowd: every believer makes the next one likelier to go along
    for (const n of list) {
      const p = n.persona, gull = clamp(p.gull + herd * 0.14 - n.liedTo * 0.3 - (n.wary.has(P.outfit.kind) ? 0.25 : 0), 0.02, 0.95);
      const civ = n.kind === 'civ', ok = Math.random() < gull;
      let reaction = 'glance', say = '', thought = '';
      if (alarm) {
        if (n.armed) { reaction = vol === 'shout' && Math.random() < 0.55 ? 'approach' : 'suspicious'; say = pick(['Everybody stay calm!', "What's going on?", 'Nobody panic.']); thought = 'If this is a prank, someone is in trouble.'; }
        else if (ok || vol === 'shout') { reaction = 'panic'; say = pick(['Oh my god!', 'Get out, get out!', "I'm not sticking around!", 'Is this real?!']); thought = "I'm not waiting to find out."; }
        else { reaction = 'laugh'; say = pick(['Very funny.', 'Is this a drill?']); thought = 'Probably nothing.'; }
      } else if (lure && (civ || n.kind === 'staff')) {
        if (ok && room) { reaction = 'believe'; say = pick(["Ooh, I'm going!", "Don't have to tell me twice.", 'Wait for me!']); thought = 'Free stuff? Obviously.'; }
        else if (ok) { reaction = 'spread'; say = pick(['Seriously?', 'Where?!']); thought = 'I have to tell everyone.'; }
        else { reaction = 'laugh'; say = pick(['Sure, buddy.', 'Nice try.']); thought = 'Who is this guy?'; }
      } else if (order && !civ) {
        if (ok && room) { reaction = 'believe'; say = pick(['On my way.', 'Copy that.', 'Again? Fine.']); thought = 'Nobody told me about this.'; }
        else { reaction = 'suspicious'; say = pick(['Says who?', "I didn't hear about that."]); thought = 'That is not how we get orders.'; }
      } else if (gossip) {
        if (ok) { reaction = 'spread'; say = pick(['No way!', "Wait 'til the others hear.", 'I knew it!']); thought = 'This is the best thing I have heard all night.'; }
        else { reaction = 'glance'; thought = 'Gossip. Not my problem.'; }
      } else {
        reaction = vol === 'shout' ? (n.armed ? 'suspicious' : Math.random() < 0.5 ? 'laugh' : 'glance') : Math.random() < 0.6 ? 'glance' : 'ignore';
        say = reaction === 'laugh' ? pick(['Ha! What?', 'Okay...', 'Somebody had too much to drink.']) : '';
        thought = pick(['What a weird guy.', 'Did he just say that?', 'Ignore it.', 'Strange night.']);
      }
      if (vol === 'shout' && n.armed && reaction === 'suspicious' && n.sus > 50) reaction = 'report';
      if (reaction === 'believe' || reaction === 'panic' || reaction === 'spread') herd++;
      out.push({ n, reaction, say, thought, room });
    }
    return out;
  }

  // ------------------------------------------------------------ applying them
  function applyReactions(text, vol, res) {
    const g = G(), P = g.P, AI = SC.AI, info = { outfit: P.outfit.name, kind: P.outfit.kind, text };
    let moved = 0;
    const rumorFact = { id: 'rumor:' + SC.hashStr(text), kind: 'rumor', say: text.replace(/^(did you hear|i heard|apparently|word is)( that)?[,:]?\s*/i, '').slice(0, 120), room: null, fromPlayer: true };
    res.forEach((r, k) => {
      const n = r.n;
      if (n.state === 'dead' || n.state === 'ko' || n.held) return;
      setTimeout(() => {
        if (G() !== g || n.body) return;
        if (r.say) AI.say(n, r.say, 2.6);
        if (r.thought) g.bubble(n, '💭 ' + r.thought, 3, 'thought');
        g.hear(n, r.say || '(' + r.reaction + ')', r.ai);
      }, 250 + k * 380);
      if (n.state === 'chat') AI.toState(n, 'routine');
      switch (r.reaction) {
        case 'glance': n.dir = Math.atan2(P.y - n.y, P.x - n.x); break;
        case 'believe':
          if (r.room) { AI.errand(n, r.room.tier <= Math.max(n.access, 1) ? r.room : null, 22, info); moved++; }
          AI.learn(n, rumorFact, true); g.plantRumor(rumorFact); g.rumorSpread(rumorFact, n); break;
        case 'panic': AI.errand(n, null, 26, null); n.sus = Math.max(n.sus, 20); moved++; break;
        case 'approach': AI.toState(n, 'investigate'); n.inv = { x: P.x, y: P.y, kind: 'shout' }; moved++; break;
        case 'laugh': n.sus = clamp(n.sus + 5, 0, 100); n.dir = Math.atan2(P.y - n.y, P.x - n.x); break;
        case 'suspicious': n.sus = clamp(n.sus + 25, 0, 100); n.wary.add(P.outfit.kind); n.dir = Math.atan2(P.y - n.y, P.x - n.x); break;
        case 'report':
          n.sus = 85; n.wary.add(P.outfit.kind);
          if (n.armed) { AI.toState(n, 'search'); n.searchT = 14; n.lastSeen = { x: P.x, y: P.y }; }
          else { AI.toState(n, 'report'); n.reportKind = 'suspicious'; n.reportOutfit = P.outfit.kind; n.reportName = P.outfit.name; n.reportPos = { x: P.x, y: P.y }; }
          break;
        case 'spread': g.plantRumor(rumorFact); AI.learn(n, rumorFact, true); g.rumorSpread(rumorFact, n); break;
      }
      AI.remember(n, 'Heard a stranger dressed as ' + P.outfit.name + ' ' + (vol === 'shout' ? 'shout' : 'say') + ': "' + text.slice(0, 80) + '"');
    });
    if (vol === 'shout') { g.noise(P.x, P.y, 90, 'step'); if (P.trespass) g.heat = Math.min(100, g.heat + 6); }
    g.stats.crowdMoved = Math.max(g.stats.crowdMoved || 0, moved);
    if (moved) { g.stats.talked++; g.toast(moved + ' ' + (moved === 1 ? 'person' : 'people') + ' reacted to what you said', 'good'); }
    else if (!res.length) g.toast('Nobody heard you', 'info');
  }

  // ------------------------------------------------------------ UI
  S.open = function () {
    const g = G();
    if (!g || g.dialog || g.sayBox || g.over) return;
    g.sayBox = true;
    SC.Input.clear();
    S.vol = S.vol || 'say';
    $('saybox').classList.remove('hidden');
    renderVol();
    $('say-input').value = '';
    setTimeout(() => $('say-input').focus(), 20);
  };
  S.close = function () {
    const g = G();
    if (g) g.sayBox = false;
    $('saybox').classList.add('hidden');
    $('say-input').blur();
    SC.Input.clear();
  };
  function renderVol() {
    for (const b of document.querySelectorAll('#saybox [data-vol]')) b.classList.toggle('on', b.dataset.vol === S.vol);
    const n = G() ? listeners(S.vol).length : 0;
    $('say-count').textContent = n ? n + ' ' + (n === 1 ? 'person' : 'people') + ' will hear you' : 'Nobody is close enough to hear';
  }
  S.submit = async function () {
    const g = G(), text = $('say-input').value.trim();
    if (!g || !text) { S.close(); return; }
    const vol = S.vol, list = listeners(vol);
    S.close();
    g.bubble(g.P, vol === 'shout' ? text.toUpperCase() : vol === 'whisper' ? '(' + text + ')' : text, 3);
    g.hear({ first: 'You', x: g.P.x, y: g.P.y }, text);
    if (vol === 'shout') g.sfx('alert');
    if (!list.length) { g.toast('Nobody heard you', 'info'); return; }
    let res = null;
    if (SC.LLM.enabled()) {
      g.toast('The crowd is reacting…', 'info');
      try { res = await llmReactions(text, vol, list); } catch (e) { g.toast('AI offline (' + SC.LLM.lastError + ') — using built-in brain', 'warn'); }
      if (G() !== g) return;
    }
    if (!res || !res.length) res = ruleReactions(text, vol, list);
    applyReactions(text, vol, res);
  };
  S.bindUI = function () {
    $('say-form').addEventListener('submit', (e) => { e.preventDefault(); S.submit(); });
    $('say-input').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') S.close();
      if (e.key === 'Tab') { e.preventDefault(); const v = ['whisper', 'say', 'shout']; S.vol = v[(v.indexOf(S.vol) + 1) % 3]; renderVol(); }
    });
    for (const b of document.querySelectorAll('#saybox [data-vol]')) b.addEventListener('click', () => { S.vol = b.dataset.vol; renderVol(); $('say-input').focus(); });
    $('say-cancel').addEventListener('click', () => S.close());
  };
})();
