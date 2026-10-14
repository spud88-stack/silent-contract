// Conversations: player <-> NPC dialogue (LLM via OpenRouter, or the built-in rule brain) and ambient NPC chatter.
(function () {
  const SC = window.SC;
  const { clamp, dist } = SC;
  const T = (SC.Talk = { chats: [], lastAmbient: 0 });
  const G = () => SC.G;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ACTIONS = ['none', 'go_to', 'follow', 'leave_post', 'escort_out', 'call_guards', 'attack', 'flee', 'allow', 'give_keycard', 'wait'];
  const TALKABLE = { routine: 1, chat: 1, notice: 1, errand: 1, wait: 1, follow: 1, challenge: 1 };
  const $ = (id) => document.getElementById(id);

  const roleName = (n) => (n.isTarget && !n.suspect ? 'the boss here (a powerful, dangerous person)' : n.suspect ? 'a senior syndicate member attending under a cover identity' : n.outfit.name);
  const knownFacts = (n) => [...n.facts.values()].filter((f) => f.say);
  function findRoom(name) {
    if (!name) return null;
    const q = String(name).toLowerCase();
    const rooms = G().map.rooms;
    let best = null, bs = 0;
    for (const r of rooms) {
      const rn = r.name.toLowerCase();
      let s = rn === q ? 10 : rn.includes(q) || q.includes(rn) ? 6 : 0;
      for (const w of rn.split(/\s+/)) if (w.length > 3 && q.includes(w)) s += 2;
      if (s > bs) { bs = s; best = r; }
    }
    return best;
  }
  T.findRoom = findRoom;

  // ------------------------------------------------------------ LLM prompt
  function systemPrompt(n, mode) {
    const g = G(), P = g.P, m = g.map;
    const room = g.roomAtPx(n.x, n.y), allowed = SC.MapGen.allowed(P.room, P.outfit.kind);
    const tierName = ['a public area', 'a staff-only area', 'a restricted security area', 'a private, top-clearance area'];
    const facts = knownFacts(n);
    const held = P.weaponOut ? ' They are openly holding a weapon.' : '';
    const sit = mode === 'trespass' ? 'You just stopped this person because they are somewhere they should not be.'
      : mode === 'enforcer' ? 'You just stopped this person: they wear the same uniform as you, but you know everyone on your crew and you have never seen this face.'
        : 'This person walked up and started talking to you while you were ' + (n.act || 'idle') + '.';
    return [
      'You are roleplaying ONE character in a stealth game. Stay fully in character as a believable human being. Reply ONLY with one JSON object, no other text.',
      '',
      'YOU: ' + n.name + ', ' + roleName(n) + ' at ' + m.name + ' (' + m.region + ') during ' + m.theme.event + '.',
      'Personality: ' + n.persona.traits.join(', ') + '. Background: ' + n.first + ' ' + n.persona.back + '.',
      'Gullibility ' + Math.round(n.persona.gull * 10) + '/10, courage ' + Math.round(n.persona.courage * 10) + '/10, loyalty to your employer ' + Math.round(n.persona.loyalty * 10) + '/10.' + (n.armed ? ' You are armed and responsible for security.' : ' You are unarmed.') + (n.hasKeycard ? ' You carry the master keycard.' : ''),
      'You are in: ' + (room ? room.name + ', ' + tierName[room.tier] : 'the grounds outside') + '. Your current suspicion of this stranger: ' + Math.round(n.sus) + '/100.',
      '',
      'THE STRANGER: a bald man dressed as "' + P.outfit.name + '".' + held + ' ' + (allowed ? 'Someone dressed like that is normally allowed where they are standing.' : 'Someone dressed like that is NOT allowed where they are standing.') + (n.wary.has(P.outfit.kind) ? ' You have been warned that someone dressed like this has been lying to people tonight.' : '') + (n.liedTo ? ' This kind of stranger has already fooled you ' + n.liedTo + ' time(s) tonight; you are much harder to fool now.' : ''),
      'SITUATION: ' + sit,
      '',
      'THINGS YOU KNOW (share public ones freely if asked; share GUARDED ones only if you genuinely trust or like them, or they give a convincing reason):',
      facts.length ? facts.map((f, i) => '[' + i + '] ' + (f.secret ? 'GUARDED: ' : 'public: ') + f.say).join('\n') : '(nothing special)',
      n.memory.length ? 'RECENT MEMORY: ' + n.memory.join(' | ') : '',
      'ROOMS HERE: ' + m.rooms.map((r) => r.name).join(', ') + '.',
      g.targets.length ? 'The person in charge tonight: ' + g.targets.map((t) => t.name).join(', ') + '.' : '',
      '',
      'React like a real person: believe, doubt, ask a follow-up, get annoyed, be charmed or scared. A plausible lie that fits their outfit and your personality should often work; an absurd one should not. You cannot verify claims without going to look. Keep "say" to 1-2 short spoken sentences.',
      '',
      'JSON schema: {"say": string, "suspicion": integer from -40 to 40 (change in your suspicion), "action": one of ' + JSON.stringify(ACTIONS) + ', "room": string (room name, only for go_to), "rumor": string (a short claim you will now repeat to coworkers, else ""), "reveal": [indexes of THINGS YOU KNOW you just told them], "end": boolean}',
      'Actions: none = keep talking. go_to = you leave for "room" because they convinced you that you are needed or something is wrong there. follow = you go with them. leave_post = you step away for a while. allow = you let them stay/pass. escort_out = you insist on walking them out. call_guards = you report them to security. attack = armed staff only, you draw your weapon. flee = you run. give_keycard = hand over your keycard (only if you carry one and are completely convinced). wait = you agree to stay exactly here.',
    ].filter((s) => s !== '').join('\n');
  }
  async function llmReply(d, text) {
    const msgs = [{ role: 'system', content: systemPrompt(d.npc, d.mode) }];
    // keep strict user/assistant alternation: the NPC's opening line is folded into the first user turn
    let prefix = '';
    d.log.forEach((e, i) => {
      if (e.who !== 'you') { if (i === 0) prefix = '[You opened with: "' + e.text + '"]\n'; else msgs.push({ role: 'assistant', content: JSON.stringify({ say: e.text }) }); }
      else { msgs.push({ role: 'user', content: prefix + 'The stranger says: "' + e.text + '"' }); prefix = ''; }
    });
    if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: 'The stranger says: "' + text + '"' });
    const r = await SC.LLM.json(msgs, { max: 260 });
    return {
      say: String(r.say || '...').slice(0, 240), suspicion: clamp(parseInt(r.suspicion, 10) || 0, -40, 40),
      action: ACTIONS.includes(r.action) ? r.action : 'none', room: r.room, rumor: r.rumor ? String(r.rumor).slice(0, 140) : '',
      reveal: Array.isArray(r.reveal) ? r.reveal : [], end: !!r.end,
    };
  }

  // ------------------------------------------------------------ built-in rule brain (no API key needed)
  function fallback(d, text) {
    const g = G(), n = d.npc, P = g.P, L = SC.LINES, p = n.persona;
    const t = ' ' + text.toLowerCase() + ' ';
    const has = (...w) => w.some((x) => t.includes(x));
    const fits = SC.MapGen.allowed(P.room, P.outfit.kind);
    const roll = (base) => Math.random() < clamp(base + (p.gull - 0.5) * 0.6 - Math.max(0, n.sus - 40) / 200 - n.liedTo * 0.3 - (n.wary.has(P.outfit.kind) ? 0.2 : 0) + (fits ? 0.1 : -0.1), 0.03, 0.95);
    const room = findRoom(text);
    const out = { say: '', suspicion: 0, action: 'none', room: room ? room.name : '', rumor: '', reveal: [], end: false };
    const facts = knownFacts(n);
    const challenge = d.mode !== 'chat';
    const boss = g.targets.some((x) => t.includes(x.last.toLowerCase()) || t.includes(x.first.toLowerCase()));

    if (has('bribe', 'money', 'cash', ' pay ', '$', 'tip ', 'make it worth')) {
      if (roll(0.45 - p.loyalty * 0.4)) { out.say = pick(L.bribeYes); out.action = 'allow'; out.suspicion = -30; }
      else { out.say = pick(L.bribeNo); out.suspicion = 18; }
    } else if (has(' kill', 'shut up', 'idiot', 'stupid', 'hurt you', 'or else', 'moron', 'screw you', 'threat')) {
      out.say = pick(L.insult); out.suspicion = 30;
      if (!n.armed && p.courage < 0.4) { out.action = 'flee'; out.say = pick(L.flee); }
    } else if (has('leave now', "i'll leave", 'i will leave', 'leaving', "i'll go", 'my mistake', 'on my way out')) {
      out.say = challenge ? pick(L.escort) : pick(L.bye); out.action = challenge ? 'escort_out' : 'none'; out.suspicion = -10; out.end = true;
    } else if (has('fire', ' gas', 'leak', 'bomb', 'smoke', 'flood', 'fight', 'injured', 'collapsed', 'emergency', 'accident', 'broken', 'problem', 'intruder', 'thief', 'stolen', 'spill', 'sparks', 'trouble')) {
      if (roll(0.62)) {
        out.say = pick(L.believe); out.suspicion = -6;
        out.action = n.armed || n.kind === 'worker' || n.kind === 'staff' ? 'go_to' : 'leave_post';
        out.rumor = room ? "Something's wrong in the " + room.name + '.' : "There's some kind of emergency.";
      } else { out.say = pick(L.doubt); out.suspicion = 14; }
    } else if (has('wants you', 'asking for you', 'needs you', 'looking for you', 'phone call', 'call for you', 'delivery for', 'your car', 'supervisor', 'manager', 'chief', 'sent for you', 'summon') || (boss && has('you', 'see'))) {
      if (roll(n.isTarget ? 0.3 : 0.58)) { out.say = pick(L.believe); out.action = 'go_to'; out.suspicion = -4; }
      else { out.say = pick(L.doubt); out.suspicion = 12; }
    } else if (has('follow me', 'come with me', 'come here', 'show you', 'this way', 'over here', 'come see', 'come quick')) {
      if (roll(n.isTarget ? 0.22 : n.armed ? 0.38 : 0.52)) { out.say = pick(L.follow); out.action = 'follow'; }
      else { out.say = pick(L.doubt); out.suspicion = 10; }
    } else if (has('take a break', 'go home', 'smoke break', 'relieve you', "i'll cover", 'cover for you', 'shift is over', 'take over', 'you can go', 'get some rest', 'go get a drink', 'grab a coffee')) {
      if (roll(0.5 + (p.traits.includes('lazy') || p.traits.includes('exhausted') || p.traits.includes('bored') ? 0.25 : 0))) { out.say = "Finally. Thanks, I owe you one."; out.action = 'leave_post'; out.suspicion = -8; }
      else { out.say = "I can't leave my post."; out.suspicion = 6; }
    } else if (has('keycard', 'key card', ' key ', 'access card', 'your pass')) {
      if (n.hasKeycard && roll(0.18)) { out.say = "...Bring it straight back."; out.action = 'give_keycard'; }
      else { out.say = n.hasKeycard ? "Hand over my keycard? Not a chance." : "I don't carry one. Ask security."; out.suspicion = n.hasKeycard ? 16 : 4; }
    } else if (has('where is', "where's", 'how do i get', 'which way') && room) {
      const here = g.roomAtPx(n.x, n.y);
      const dx = room.cx - (here ? here.cx : n.x / 16), dy = room.cy - (here ? here.cy : n.y / 16);
      const dirn = (Math.abs(dy) > 3 ? (dy < 0 ? 'north' : 'south') : '') + (Math.abs(dx) > 3 ? (dx < 0 ? 'west' : 'east') : '');
      out.say = 'The ' + room.name + '? ' + (dirn ? 'Head ' + dirn + '.' : "It's right around here.") + (room.tier >= 2 ? " But it's restricted." : '');
      g.revealRoom(room);
    } else if (has('who', 'where', 'what', 'tell me', 'know about', 'seen', 'heard', 'boss', 'safe', 'code', 'uniform', 'rumor', 'gossip', 'news', 'anything') || boss) {
      const cands = facts.map((f, i) => [f, i]).filter(([f]) => f.text && !g.intel.includes(f.text));
      const words = t.split(/\W+/).filter((w) => w.length > 3);
      cands.sort((a, b) => words.filter((w) => b[0].say.toLowerCase().includes(w)).length - words.filter((w) => a[0].say.toLowerCase().includes(w)).length);
      const c = cands[0];
      if (c && n.sus < 55 && (!c[0].secret || roll(0.4))) { out.say = pick(L.intelAsk) + c[0].say; out.reveal = [c[1]]; out.suspicion = c[0].secret ? 6 : 0; }
      else if (c) { out.say = pick(L.refuse); out.suspicion = 8; }
      else out.say = "Couldn't tell you. I just work here.";
    } else if (challenge || has('sorry', ' lost', ' new ', 'first day', 'bathroom', 'restroom', 'toilet', 'looking for', 'inspect', 'maintenance', 'repair', ' fix', 'deliver', 'sent me', 'was told', 'authoriz', 'permission', 'vip', 'guest of', 'invited', 'security check', 'audit', 'health')) {
      const strong = has('inspect', 'maintenance', 'repair', ' fix', 'deliver', 'sent me', 'authoriz', 'audit', 'security check', 'guest of', 'invited', 'first day', ' new ');
      const lvlGap = P.room ? P.room.tier - (SC.OUTFIT_LEVEL[P.outfit.kind] || 0) : 0;
      if (challenge) {
        if (roll((strong ? 0.55 : 0.3) - Math.max(0, lvlGap - 1) * 0.2 - (d.mode === 'enforcer' ? 0.1 : 0))) { out.say = pick(L.accept); out.action = 'allow'; out.suspicion = -35; }
        else if (d.turns < 2 && Math.random() < 0.4) { out.say = pick(['Who sent you, exactly?', "Nobody told me about that. What's your name?", "Hm. And who's your supervisor?"]); out.suspicion = 5; }
        else { out.say = pick(L.escort); out.action = 'escort_out'; out.suspicion = 8; }
      } else { out.say = pick(["No harm done.", "Happens all the time.", "Alright then."]); out.suspicion = -5; }
    } else if (has('love', ' nice', 'great', 'beautiful', 'handsome', 'good job', 'thank', 'appreciate')) {
      out.say = pick(["Ha. Well, thank you.", "That's... kind of you.", "You're alright."]); out.suspicion = -10;
    } else if (has('hello', ' hi ', ' hey', 'evening', 'how are you', "what's up", 'long night')) {
      out.say = pick(L.greet.concat(["Can't complain. Well, I can, but who'd listen.", 'Surviving. You?'])); out.suspicion = -3;
    } else {
      out.say = pick(["Hm. If you say so.", "Right...", "Okay?", "I'm not sure what you want from me.", "Uh-huh."]); out.suspicion = 3;
    }
    if (!challenge && d.turns >= 4 && out.action === 'none') { out.say += ' ' + pick(["Anyway, I've got to get back to it.", 'Look, I should go.']); out.end = true; }
    return out;
  }

  // ------------------------------------------------------------ apply an NPC decision to the world
  function apply(d, res, text) {
    const g = G(), n = d.npc, P = g.P, AI = SC.AI;
    if (n.state === 'dead' || n.state === 'ko') return;
    const info = { outfit: P.outfit.name, kind: P.outfit.kind, text };
    n.sus = clamp(n.sus + res.suspicion, 0, 100);
    let action = res.action;
    if (action === 'attack' && (!n.armed || n.sus < 75)) action = n.sus >= 55 ? 'call_guards' : 'escort_out';
    if (action === 'call_guards' && n.sus < 50) action = d.mode === 'chat' ? 'none' : 'escort_out';
    if (action === 'give_keycard' && !n.hasKeycard) action = 'none';
    if (n.sus >= 100 && (action === 'none' || action === 'allow')) action = n.armed && !n.escorted ? 'escort_out' : 'call_guards';
    if (d.mode !== 'chat' && d.turns >= 4 && action === 'none') action = n.sus < 45 ? 'allow' : 'escort_out';
    pushLog(d, 'npc', res.say);
    AI.say(n, res.say);
    AI.remember(n, 'A stranger dressed as ' + P.outfit.name + ' said: "' + text.slice(0, 80) + '"');
    const facts = knownFacts(n);
    for (const i of res.reveal) if (facts[i]) g.addIntel(facts[i], 'Told by ' + n.first);
    if (res.rumor) {
      const rr = findRoom(res.rumor) || findRoom(res.room);
      AI.learn(n, { id: 'rumor:' + SC.hashStr(res.rumor), kind: 'rumor', say: res.rumor, room: rr ? rr.id : null }, true);
    }
    let after = null, end = res.end;
    // whoever else was closing in on the same confrontation defers to this one's call
    if (d.mode !== 'chat' && (action === 'allow' || action === 'escort_out')) {
      for (const o of g.npcs) if (o !== n && o.state === 'challenge' && dist(o.x, o.y, n.x, n.y) < 160) { AI.toState(o, 'routine'); o.actT = 1; o.sus = action === 'allow' ? 0 : 50; o.trustT = action === 'allow' ? 40 : 8; }
    }
    switch (action) {
      case 'go_to': { const room = findRoom(res.room) || findRoom(text); after = () => AI.errand(n, room && room.tier <= Math.max(n.access, 1) ? room : null, 22, info); g.stats.talked++; g.toast(n.first + ' is leaving to check it out', 'good'); break; }
      case 'leave_post': after = () => AI.errand(n, null, 26, info); g.stats.talked++; g.toast(n.first + ' is stepping away', 'good'); break;
      case 'follow': after = () => { AI.toState(n, 'follow'); n.followT = 28; }; g.stats.talked++; g.toast(n.first + ' is following you', 'good'); break;
      case 'wait': after = () => { AI.toState(n, 'wait'); n.waitT = 30; }; break;
      case 'allow': n.trustT = 55; n.sus = 0; if (d.mode !== 'chat') { g.stats.talked++; g.toast('They bought it', 'good'); } after = () => { AI.toState(n, 'routine'); n.actT = 1; }; break;
      case 'escort_out': n.escorted = true; after = () => { AI.toState(n, 'escort'); n.escortT = 13; n.cause = d.mode === 'chat' ? 'trespass' : d.mode; n.warned = false; }; g.toast('Leave the area — now', 'warn'); break;
      case 'call_guards': case 'attack':
        after = () => { if (n.armed) AI.engage(n); else { AI.toState(n, 'report'); n.reportKind = 'suspicious'; n.reportOutfit = P.outfit.kind; n.reportName = P.outfit.name; n.reportPos = { x: P.x, y: P.y }; } }; break;
      case 'flee': after = () => { AI.toState(n, 'flee'); n.reportKind = 'suspicious'; n.reportOutfit = P.outfit.kind; n.reportName = P.outfit.name; n.reportPos = { x: P.x, y: P.y }; }; break;
      case 'give_keycard': n.hasKeycard = false; g.give('keycard', 1); g.stats.talked++; end = true; break;
    }
    renderDialog();
    if (after || end) {
      d.closing = true; d.after = after;
      setTimeout(() => { if (G() === g && g.dialog === d) T.close(true); }, 1500);
    }
  }

  // ------------------------------------------------------------ dialogue UI
  function pushLog(d, who, text) { d.log.push({ who, text }); }
  function renderDialog() {
    const d = G().dialog; if (!d) return;
    const n = d.npc;
    $('dlg-log').innerHTML = d.log.map((e) => '<div class="ln ' + e.who + '"><b>' + (e.who === 'you' ? 'You' : SC.esc(n.first)) + '</b> ' + SC.esc(e.text) + '</div>').join('') + (d.busy ? '<div class="ln npc typing"><b>' + SC.esc(n.first) + '</b> <i>. . .</i></div>' : '');
    $('dlg-log').scrollTop = 1e6;
    $('dlg-susbar').style.width = Math.round(n.sus) + '%';
    $('dlg-susbar').className = n.sus > 66 ? 'hi' : n.sus > 33 ? 'mid' : '';
    $('dlg-input').disabled = d.busy || d.closing;
    $('dlg-chips').style.visibility = d.busy || d.closing ? 'hidden' : 'visible';
  }
  function chips(d) {
    const g = G(), rooms = g.map.rooms, n = d.npc;
    const other = pick(rooms.filter((r) => r.tier <= 1)).name, tgt = g.targets[0];
    const list = d.mode !== 'chat'
      ? ["Sorry — I got lost looking for the restroom.", "Maintenance. I was sent to fix something in here.", "I'm new, it's my first day.", "My mistake. I'll leave right now."]
      : ['Long night, huh?', tgt && !n.isTarget ? 'What do you know about ' + tgt.name + '?' : 'Heard any gossip tonight?', "There's a problem in the " + other + '. You should check it.', n.isTarget ? 'Come with me, there is something you need to see.' : 'Your supervisor wants you in the ' + other + '.', "Go take a break, I'll cover for you."];
    $('dlg-chips').innerHTML = '';
    for (const c of list) {
      const b = SC.el('button', 'chip', SC.esc(c));
      b.type = 'button';
      b.onclick = () => { $('dlg-input').value = c; $('dlg-input').focus(); };
      $('dlg-chips').appendChild(b);
    }
  }

  T.canTalk = (n) => !!TALKABLE[n.state] && !n.hostileKinds.has(G().P.outfit.kind) && !n.dying;
  T.open = function (n, mode) {
    const g = G();
    if (g.dialog || g.over || !T.canTalk(n)) return false;
    const d = (g.dialog = { npc: n, mode: mode || 'chat', log: [], busy: false, turns: 0 });
    SC.Input.clear(); // keys held when the conversation starts must not keep walking you afterwards
    SC.AI.toState(n, 'talk'); n.talks++;
    if (d.mode !== 'chat') n.sus = Math.min(n.sus, 72);
    const opener = d.mode === 'chat' ? pick(n.sus > 40 ? SC.LINES.busy : SC.LINES.greet) : (g.lastBubble(n) || pick(d.mode === 'trespass' ? SC.LINES.trespass : SC.LINES.enforcer));
    pushLog(d, 'npc', opener);
    if (d.mode === 'chat') SC.AI.say(n, opener, 2);
    $('dlg-portrait').src = SC.Sprites.portrait(n.look, 4);
    $('dlg-name').textContent = n.name;
    $('dlg-role').textContent = n.outfit.name + ' · ' + n.persona.traits.join(', ');
    $('dlg-ai').textContent = SC.LLM.enabled() ? 'AI: ' + SC.LLM.cfg.model.split('/').pop() : 'AI: built-in';
    $('dlg-ai').className = SC.LLM.enabled() ? 'on' : '';
    $('dlg-mode').textContent = d.mode === 'chat' ? 'CONVERSATION' : d.mode === 'trespass' ? 'CAUGHT TRESPASSING — talk your way out' : 'DISGUISE QUESTIONED — talk your way out';
    $('dialog').classList.remove('hidden');
    chips(d); renderDialog();
    $('dlg-input').value = '';
    setTimeout(() => $('dlg-input').focus(), 30);
    g.sfx('ui');
    return true;
  };
  T.submit = async function (text) {
    const g = G(), d = g.dialog;
    text = (text || '').trim();
    if (!d || d.busy || d.closing || !text) return;
    d.turns++; d.busy = true;
    pushLog(d, 'you', text);
    g.bubble(g.P, text, 2.5);
    renderDialog();
    let res = null;
    if (SC.LLM.enabled()) {
      try { res = await llmReply(d, text); } catch (e) { g.toast('AI offline (' + SC.LLM.lastError + ') — using built-in brain', 'warn'); }
    } else await new Promise((r) => setTimeout(r, 380 + Math.random() * 300));
    if (G() !== g || g.dialog !== d) return;
    if (!res) res = fallback(d, text);
    d.busy = false;
    apply(d, res, text);
    renderDialog();
    if (!d.closing) $('dlg-input').focus();
  };
  T.close = function (resolved) {
    const g = G(), d = g && g.dialog;
    if (!d) return;
    const n = d.npc;
    g.dialog = null;
    $('dialog').classList.add('hidden');
    SC.Input.clear();
    $('dlg-input').blur();
    if (n.state !== 'talk') return;
    if (d.after) d.after();
    else if (d.mode !== 'chat' && !resolved) { SC.AI.toState(n, 'escort'); n.escortT = 11; n.cause = d.mode; n.warned = false; n.sus = Math.max(n.sus, 80); SC.AI.say(n, pick(SC.LINES.escort)); }
    else if (d.mode !== 'chat') { SC.AI.toState(n, 'escort'); n.escortT = 13; n.cause = d.mode; n.warned = false; }
    else { SC.AI.toState(n, 'routine'); n.actT = Math.max(n.actT, 2); if (!resolved) SC.AI.say(n, pick(SC.LINES.bye), 1.5); }
  };

  // ------------------------------------------------------------ ambient NPC <-> NPC chatter
  function cannedLines(a, b) {
    const AI = SC.AI, L = SC.LINES;
    const fa = AI.shareable(a, b), fb = AI.shareable(b, a);
    if (fa && Math.random() < 0.75) return [{ s: a, t: fa.say, fact: fa }, { s: b, t: pick(['Seriously?', 'No way.', "I hadn't heard that.", 'Huh. Good to know.', "You're kidding.", 'Keep that quiet.']) }].concat(fb && Math.random() < 0.5 ? [{ s: b, t: fb.say, fact: fb }] : []);
    const st = pick(L.smalltalk);
    return [{ s: a, t: AI.fmt(st[0]) }, { s: b, t: AI.fmt(st[1]) }];
  }
  async function llmLines(c) {
    const g = G(), m = g.map, { a, b } = c;
    const fa = knownFacts(a).slice(0, 4), fb = knownFacts(b).slice(0, 4), all = fa.concat(fb);
    const who = (n) => n.name + ', ' + roleName(n) + ', ' + n.persona.traits.join(' and ') + ', who ' + n.persona.back + (n.memory.length ? '. Recently: ' + n.memory.slice(-2).join(' ') : '');
    const prompt = [
      'Write a short, natural overheard exchange between two people at ' + m.name + ' (' + m.region + ') during ' + m.theme.event + '.',
      '3 or 4 lines total, each under 18 words. They sound like real people: gossip, complaints, dry humour, worries. If it fits naturally, one of them mentions ONE thing they know, in their own words.',
      'A: ' + who(a), 'B: ' + who(b),
      'A knows: ' + (fa.length ? fa.map((f, i) => '[' + i + '] ' + f.say).join(' ') : 'nothing special'),
      'B knows: ' + (fb.length ? fb.map((f, i) => '[' + (i + fa.length) + '] ' + f.say).join(' ') : 'nothing special'),
      'Reply with JSON only: {"lines":[{"s":"A","t":"..."},{"s":"B","t":"..."}],"facts":[indexes of known things that were mentioned]}',
    ].join('\n');
    const r = await SC.LLM.json([{ role: 'user', content: prompt }], { max: 220, timeout: 7000, temp: 1 });
    const lines = (r.lines || []).slice(0, 4).map((l) => ({ s: l.s === 'B' ? b : a, t: String(l.t || '').slice(0, 140) })).filter((l) => l.t);
    if (!lines.length) throw new Error('empty');
    const shared = (r.facts || []).map((i) => all[i]).filter(Boolean);
    if (shared.length) { lines[lines.length - 1].fact = shared[0]; lines[lines.length - 1].facts = shared; }
    return lines;
  }
  T.startChat = function (a, b) {
    const g = G(), AI = SC.AI;
    AI.toState(a, 'chat'); AI.toState(b, 'chat');
    a.chatWith = b; b.chatWith = a; a.chatT = b.chatT = 12;
    const c = { a, b, lines: null, i: 0, next: 0.6, wait: 0 };
    T.chats.push(c);
    const near = dist(a.x, a.y, g.P.x, g.P.y) < 230 && !g.P.ghost;
    if (SC.LLM.enabled() && SC.LLM.cfg.ambient && near && SC.LLM.inflight === 0 && g.time - T.lastAmbient > 7) {
      T.lastAmbient = g.time; c.pending = true;
      llmLines(c).then((l) => { if (!c.lines) c.lines = l; }).catch(() => {}).finally(() => { c.pending = false; });
    } else c.lines = cannedLines(a, b);
  };
  T.update = function (dt) {
    const AI = SC.AI;
    for (let k = T.chats.length - 1; k >= 0; k--) {
      const c = T.chats[k];
      if (c.a.state !== 'chat' || c.b.state !== 'chat' || c.a.chatWith !== c.b) { T.chats.splice(k, 1); continue; }
      if (!c.lines) {
        c.wait += dt; c.a.chatT = c.b.chatT = 8;
        if (!c.pending || c.wait > 5) c.lines = cannedLines(c.a, c.b);
        continue;
      }
      c.next -= dt;
      if (c.next <= 0) {
        const l = c.lines[c.i++];
        if (!l) { c.a.chatT = c.b.chatT = Math.min(c.a.chatT, 1.2); T.chats.splice(k, 1); continue; }
        AI.say(l.s, l.t, 3, l.fact);
        if (l.facts) for (const f of l.facts) { AI.learn(c.a, f); AI.learn(c.b, f); if (dist(l.s.x, l.s.y, G().P.x, G().P.y) < 130) G().addIntel(f, 'Overheard'); }
        c.next = 3; c.a.chatT = c.b.chatT = 5;
      }
    }
  };

  T.bindUI = function () {
    $('dlg-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('dlg-input').value; $('dlg-input').value = ''; T.submit(v); });
    $('dlg-leave').addEventListener('click', () => T.close(false));
    $('dlg-input').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') T.close(false); });
  };
})();
