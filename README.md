# Silent Contract

A top-down pixel-art stealth assassination game with Freelancer-style campaign rules, procedurally generated locations, and NPCs that talk: to each other, and to you.

## Play

**[▶ Play in your browser](https://spud88-stack.github.io/silent-contract/)**: no install, no download.

Or play offline: download the ZIP (Code → Download ZIP), unzip it, and double-click `index.html`.

## Run it locally

```bash
cd "Silent Contract" && python3 -m http.server 8765
```

Then open http://localhost:8765. There's no build step and nothing to install. All art and audio are generated in code.

## Living AI (optional)

Go to **Safehouse → AI & Settings**, paste an [OpenRouter](https://openrouter.ai) API key, click **Load model list**, then **Save** and **Test**. A fast, cheap model works best. Once it's set up:

- Every conversation (press **T** near someone, or get caught) is an LLM roleplay. The NPC knows its personality, job, outfit rules, what it has seen, who has lied to it before, and the intel it's carrying.
- The NPC answers with structured decisions that change the game: go to a room, follow you, leave its post, allow you, escort you out, call the guards, hand over a keycard, spread a rumour.
- Optionally, nearby NPCs hold AI-written conversations with each other, and those conversations can leak real intel.

Without a key, a built-in rule-based brain handles all of this.

The key is stored only in your browser's localStorage and is sent only to openrouter.ai.

## Systems

- **Procedural maps.** Each location is a BSP building with courtyards. Its rooms are sorted into four access tiers (Public → Staff → Security → Private), with locked doors, guard posts at tier boundaries, furniture, activity spots, exits and loot. There are eight themes: private estate, corporate campus, nightclub, dockside compound, luxury hotel, casino resort, museum gala and arctic research station.
- **Target archetypes.** Each target has a type that shapes how they spend the night, who protects them, and what people say about them:
  - **Socialite:** works the public rooms.
  - **Recluse:** stays in the private wing with two bodyguards.
  - **Workaholic:** moves between offices without an escort.
  - **Head of Security:** armed, patrols, and sees through guard disguises.
  - **Insider:** disguised as staff.
  - **Chain Smoker:** slips outside alone.
  - **Visitor:** arrives late and leaves early. If they reach an exit, the contract fails.
- **Layout.** A central main hall runs through each building, and each wing has its own corridor. Exit paths always lead to a real door. Every room is validated so you can walk between all of its doors, and furniture that boxes in floor space is removed.
- **Security cameras.** Cameras sweep restricted rooms. Footage of you trespassing or committing a crime is recorded and brings a guard to check. You can erase the footage at the security recorder, and a blackout switches the cameras off.
- **Accidents.** Rig a lamp with a wrench or crowbar and it falls on whoever lingers beside it. Intel tells you which lamp sits next to the target's favourite spot. You can poison food tables as well as drinks. People who find an accident victim mourn instead of raising the alarm.
- **Site map (M)** shows labelled rooms, access tiers, locked doors, cameras and exits. Rooms your current disguise can't enter are outlined in red.
- **Disguises and enforcers.** Every outfit has an access level. Enforcers (shown with a white dot) can see through a disguise that matches their own crew.
- **Suspicion.** Each NPC has its own suspicion meter, driven by trespassing, enforcers, visible weapons, odd movement and location heat. The HUD shows the highest of these. Witnesses run to guards to report you, and guards radio the alarm. A disguise only becomes compromised if that report gets through.
- **Gossip.** NPCs pass facts to each other: found bodies, suspect descriptions, warnings about liars, and rumours you planted. If you send someone on a pointless errand, they remember it and warn their coworkers.
- **Freelancer rules.** You choose a syndicate and work through 4 tiers of territories. The last territory in each tier is a Showdown, where you find the leader among 5 suspects by their tells. Failing a contract puts the remaining territories in that tier on alert. Failing an alerted territory or a showdown ends the campaign. Gear you bring is at risk, and dying costs you half your marks. Weapons you carry out are yours to keep.

## Code map

| File | Purpose |
|---|---|
| `js/mapgen.js` | Location generator and tile baking |
| `js/npc.js` | NPC brain: routines, perception, states, alarms |
| `js/talk.js` | Dialogue UI, LLM prompts, rule-brain fallback, ambient chatter |
| `js/llm.js` | OpenRouter client |
| `js/game.js` | Player, interactions, combat, objectives |
| `js/render.js` | Lighting, fog of war, vision cones, instinct |
| `js/campaign.js` | Freelancer meta and save data |
| `js/sprites.js` | Procedural pixel art |
