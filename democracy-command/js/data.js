// Static game data: factions, biomes, research, commander actions, names and propaganda.
(function () {
  const DC = window.DC;

  DC.FACTIONS = {
    human: { id: 'human', name: 'Super Earth', short: 'SUPER EARTH', color: '#5fd4ff', glow: 'rgba(95,212,255,', unit: 'Helldivers' },
    bugs: {
      id: 'bugs', name: 'Terminids', adj: 'Terminid', short: 'TERMINIDS', color: '#f2b632', dark: '#6b4a0d', glow: 'rgba(242,182,50,',
      angle: 315, regen: 1.35, aggression: 1.0, home: 'Ghorvak Nest', enemyWord: 'bugs',
      units: ['Chargers', 'Bile Titans', 'Hunters', 'Stalkers', 'Brood Commanders', 'Shriekers', 'Impalers'],
      leaderTitles: ['Brood Mother', 'Hive Lord', 'Swarm Queen'], leaderNames: ['Ka\'lur', 'Vhessk', 'Ogrith', 'Mnemara', 'Skarrow'],
      special: 'hive', specialName: 'Hive World',
    },
    bots: {
      id: 'bots', name: 'Automatons', adj: 'Automaton', short: 'AUTOMATONS', color: '#ff4a4a', dark: '#5c1616', glow: 'rgba(255,74,74,',
      angle: 210, regen: 1.6, aggression: 1.1, home: 'Cyberstan', enemyWord: 'clankers',
      units: ['Hulks', 'Devastators', 'Tanks', 'Factory Striders', 'Gunships', 'Berserkers', 'Annihilator Tanks'],
      leaderTitles: ['Strategos', 'Overseer-Prime', 'War Engine'], leaderNames: ['K-77 "Cinder"', 'Unit 0x51', 'MARSHAL-9', 'TORQUE', 'HX-Null'],
      special: 'forge', specialName: 'Forge World',
    },
    squids: {
      id: 'squids', name: 'Illuminate', adj: 'Illuminate', short: 'ILLUMINATE', color: '#b04bff', dark: '#3d1260', glow: 'rgba(176,75,255,',
      angle: 90, regen: 1.2, aggression: 0.9, home: 'Vel Thessar', enemyWord: 'squids',
      units: ['Overseers', 'Harvesters', 'Watchers', 'Fleshmobs', 'Elevated Overseers', 'Stingrays'],
      leaderTitles: ['Archon', 'High Overseer', 'Prophet'], leaderNames: ['Xal\'thuun', 'Ievra', 'Somn Oleth', 'Quorrax', 'the Pale Choir'],
      special: 'darkEnergy', specialName: 'Dark Energy Generator',
    },
  };
  DC.ENEMIES = ['bugs', 'bots', 'squids'];

  DC.BIOMES = {
    desert: { name: 'Desert', pal: ['#c9864b', '#e2ad6b', '#8a4f2a'], hazards: ['Intense Heat', 'Sandstorms'] },
    ice: { name: 'Tundra', pal: ['#cfe3ee', '#9fc1d6', '#f2fbff'], hazards: ['Extreme Cold', 'Blizzards'] },
    jungle: { name: 'Jungle', pal: ['#3e7d3a', '#6aa84f', '#264f26'], hazards: ['Rainstorms', 'Thick Fog'] },
    volcanic: { name: 'Volcanic', pal: ['#3a2622', '#d9481c', '#6b3424'], hazards: ['Fire Tornadoes', 'Volcanic Activity'] },
    toxic: { name: 'Acidic Swamp', pal: ['#6f8a2f', '#a7c44a', '#3d4f1a'], hazards: ['Acid Storms', 'Spore Clouds'] },
    ocean: { name: 'Ocean World', pal: ['#1f5a8a', '#3c8cc4', '#e7f1f6'], hazards: ['Ion Storms', 'Rainstorms'] },
    moon: { name: 'Barren Moon', pal: ['#8f8f96', '#b7b7bd', '#5d5d66'], hazards: ['Meteor Showers', 'Tremors'] },
    crystal: { name: 'Crystal Plains', pal: ['#7f6bd1', '#bda9ff', '#42357a'], hazards: ['Ion Storms', 'Electrical Storms'] },
    ash: { name: 'Ashlands', pal: ['#5a544e', '#837b70', '#36302c'], hazards: ['Ash Storms', 'Tremors'] },
    savanna: { name: 'Highlands', pal: ['#9d8a4a', '#c7b56b', '#5d6b35'], hazards: ['Rainstorms', 'Thick Fog'] },
  };

  DC.SECTOR_NAMES = ['Leo', 'Rictus', 'Jin Xi', 'Valdis', 'Kestrel', 'Orion', 'Draco', 'Hydra', 'Andromeda', 'Ferris', 'Umlaut', 'Marspira',
    'Sagan', 'Talus', 'Gellert', 'Ymir', 'Omega', 'Severin', 'Akira', 'Cancri', 'Borealis', 'Theseus', 'Halcyon', 'Quintus', 'Lacaille',
    'Mirin', 'Saffron', 'Tarragon', 'Celeste', 'Ursa', 'Morgon', 'Zenith', 'Vega', 'Nebula Rho', 'Iron Reach'];
  DC.PLANET_A = ['Mar', 'Pro', 'Chor', 'Gra', 'Hel', 'Vel', 'Oss', 'Tib', 'Kra', 'Zan', 'Ely', 'Fen', 'Gat', 'Ish', 'Lum', 'Nor', 'Phae', 'Qua', 'Ryl', 'Sol', 'Tur', 'Ux', 'Vor', 'Wyn', 'Xer', 'Ya', 'Bor', 'Cal', 'Dra', 'Est', 'Hal', 'Kel', 'Mer', 'Ost', 'Pel', 'Rho', 'Sha', 'Thu', 'Ven'];
  DC.PLANET_B = ['pus', 'ria', 'fmere', 'tos', 'dor', 'ane', 'ix', 'vos', 'thea', 'gard', 'ion', 'ara', 'ulon', 'en', 'ova', 'is', 'eth', 'ax', 'mire', 'ost', 'aris', 'ec', 'yth', 'onia', 'ka', 'ul', 'esh', 'ion', 'ara', 'ora'];
  DC.PLANET_C = ['', '', '', '', ' Prime', ' II', ' IV', ' Bay', ' Reach', ' Minor', ' Haven', ' Major', ' VII', ' Colony', ' Point'];

  DC.DIFFICULTY = {
    trivial: { name: 'Cadet', aggro: 0.65, regen: 0.8, morale: 65, req: 600, desc: 'Lenient enemies. Generous Ministry funding.' },
    standard: { name: 'Commander', aggro: 1.0, regen: 1.0, morale: 55, req: 450, desc: 'The war as High Command intended.' },
    suicide: { name: 'Suicide Mission', aggro: 1.3, regen: 1.15, morale: 50, req: 350, desc: 'Relentless offensives. Thin budgets.' },
    helldive: { name: 'Helldive', aggro: 1.6, regen: 1.3, morale: 45, req: 300, desc: 'For commanders who fear nothing but tyranny.' },
  };

  // Research projects. cost: requisition, s: [common, rare, super] samples, h: build hours.
  DC.RESEARCH = [
    { id: 'eagle', name: 'Eagle Rearm Protocols', desc: '+10% Helldiver combat efficiency on all fronts.', cost: 250, s: [20, 0, 0], h: 18 },
    { id: 'recruit', name: 'Accelerated Recruitment', desc: '+15% active Helldiver population. Training is now nine minutes long.', cost: 300, s: [25, 5, 0], h: 24 },
    { id: 'seaf', name: 'SEAF Officer Academy', desc: 'SEAF Battalions cost 40% less and defend 50% harder.', cost: 260, s: [15, 10, 0], h: 20 },
    { id: 'orbital', name: 'Orbital Precision Targeting', desc: 'Orbital Bombardment deals 60% more liberation and lasts longer.', cost: 320, s: [10, 15, 0], h: 24, req: 'eagle' },
    { id: 'logistics', name: 'Hyperlane Logistics', desc: 'Super Destroyer fleet travels twice as fast and its range grows by 40%.', cost: 280, s: [20, 10, 0], h: 20 },
    { id: 'ministry', name: 'Ministry of Truth Expansion', desc: 'Propaganda Broadcasts give +50% morale and recharge faster. Morale drifts higher.', cost: 240, s: [10, 5, 0], h: 16 },
    { id: 'stims', name: 'Stim Surplus Program', desc: 'Helldiver casualties reduced by 30%. Morale losses from KIA reduced.', cost: 260, s: [15, 10, 0], h: 18 },
    { id: 'shield', name: 'Planetary Shield Generators', desc: 'Fortify grants two defense levels. Enemy invasions on fortified worlds are slower.', cost: 380, s: [10, 15, 5], h: 30, req: 'seaf' },
    { id: 'napalm', name: 'Napalm Barrage', desc: '+20% efficiency against Terminids. Hive World gloom spreads slower.', cost: 300, s: [10, 10, 5], h: 22 },
    { id: 'exo', name: 'Exosuit Program', desc: '+20% efficiency against Automatons. Forge construction slowed.', cost: 300, s: [10, 10, 5], h: 22 },
    { id: 'emp', name: 'Dark Energy Disruptors', desc: '+20% efficiency against Illuminate. Dark Energy accumulates 40% slower.', cost: 300, s: [10, 10, 5], h: 22 },
    { id: 'hellbomb', name: 'Hellbomb Mk II', desc: 'Unlocks the Hellbomb Strike command: a massive one-shot liberation surge.', cost: 450, s: [10, 20, 10], h: 36, req: 'orbital' },
    { id: 'dss', name: 'Democracy Space Station', desc: '+25% efficiency everywhere the fleet operates. The station also adds +1 garrison to Super Earth.', cost: 600, s: [20, 20, 15], h: 48, req: 'logistics' },
  ];

  // Commander actions. target: enemy | friendly | any | none
  DC.ACTIONS = [
    { id: 'bombard', key: '1', name: 'Orbital Bombardment', icon: 'orbital', cost: 140, cd: 18, target: 'enemy', fleet: true,
      desc: 'Shell an enemy world from the fleet. Instant liberation surge and enemy regeneration halved for 24h. Requires the fleet in range.' },
    { id: 'seaf', key: '2', name: 'Deploy SEAF Battalion', icon: 'seaf', cost: 110, cd: 6, target: 'friendly',
      desc: 'Station a SEAF battalion on a friendly world. Each battalion pushes back invasions and holds the line without Helldivers.' },
    { id: 'fortify', key: '3', name: 'Fortify World', icon: 'fortify', cost: 190, cd: 10, target: 'friendly',
      desc: 'Build planetary defense grids. Each level slows enemy invasions by 18% (max 4).' },
    { id: 'fleet', key: '4', name: 'Redeploy Super Destroyers', icon: 'fleet', cost: 40, cd: 2, target: 'any',
      desc: 'Move the fleet. It boosts efficiency by 25% on fronts within range and enables orbital strikes.' },
    { id: 'priority', key: '5', name: 'Priority Directive', icon: 'priority', cost: 0, cd: 0, target: 'campaign',
      desc: 'Flag a campaign world as priority. Helldivers flock to flagged worlds (up to 3 flags).' },
    { id: 'propaganda', key: '6', name: 'Propaganda Broadcast', icon: 'propaganda', cost: 120, cd: 30, target: 'none',
      desc: 'The Ministry of Truth floods every channel. Morale up, recruitment surges for 12h.' },
    { id: 'hellbomb', key: '7', name: 'Hellbomb Strike', icon: 'hellbomb', cost: 260, cd: 36, target: 'enemy', fleet: true, needs: 'hellbomb',
      desc: 'Drop a strategic Hellbomb payload. +30% liberation instantly. Some Helldivers will not come home.' },
  ];

  DC.MO_TYPES = [
    { id: 'liberate', name: 'Liberate a world', desc: 'Helldivers focus on one enemy world.', hours: 72, reward: 260, morale: 5, medals: 40 },
    { id: 'sector', name: 'Liberate a sector', desc: 'Push every enemy world out of one sector.', hours: 168, reward: 600, morale: 10, medals: 90 },
    { id: 'defend', name: 'Defend a world', desc: 'Repel an active invasion.', hours: 0, reward: 160, morale: 3, medals: 25 },
    { id: 'hold', name: 'Hold the line', desc: 'Lose no worlds to one faction.', hours: 96, reward: 240, morale: 5, medals: 35 },
  ];

  DC.TITLES = ['Cadet Commander', 'Space Cadet', 'Sergeant of Liberty', 'Captain of Freedom', 'Commander of Democracy', 'Admirable Admiral', 'Fleet Admiral', 'Skull Admiral', 'Supreme Liberator'];

  DC.HERO_FIRST = ['Rook', 'Vasquez', 'Odessa', 'Brannigan', 'Kowalski', 'Mira', 'Duke', 'Ingrid', 'Talon', 'Hollis', 'Juno', 'Petra', 'Barrow', 'Sable', 'Ezekiel'];
  DC.HERO_LAST = ['Steel', 'Liberty', 'Hammer', 'Freedom', 'Ironside', 'Vance', 'Stark', 'Mercer', 'Blaze', 'Cross', 'Valor', 'Kane'];
  DC.HERO_NICK = ['"Two Stims"', '"The Reinforcement"', '"Patriot"', '"Ol\' Reliable"', '"Bile Proof"', '"No Retreat"', '"Ballot Box"', '"Sweet Liberty"', '"Hellpod"', '"Last Call"'];
  DC.DIVISIONS = {
    bots: ['the Jet Brigade', 'the Incineration Corps', 'the Iron Choir', 'the Cinder Legion', 'the Null Phalanx'],
    bugs: ['the Gloom Brood', 'the Rupture Strain', 'the Predator Swarm', 'the Spore Burst Strain', 'the Bile Tide'],
    squids: ['the Pale Choir', 'the Veil Fleet', 'the Mindless Host', 'the Silent Concord', 'the Lattice Swarm'],
  };

  DC.PROPAGANDA = [
    'Citizens are reminded that questioning the war effort is a Level 3 civic offense.',
    'Liberty Day celebrations proceed as scheduled. Attendance is voluntary and mandatory.',
    'The Ministry of Truth confirms that all losses are strategic gains in disguise.',
    'Report suspected enemy sympathizers to your local Democracy Officer. Rewards include continued freedom.',
    'Helldiver recruitment is up 400%. The other 300% is under review.',
    'New Liber-Tea now available at all ration counters. Contains freedom.',
    'Remember: a well-informed citizen is a citizen who reads this dispatch.',
    'Super Earth thanks the families of the fallen. Their sacrifice has been noted and filed.',
    'The weather on Super Earth is perfect. It always is.',
    'Every bullet fired is a vote cast for Managed Democracy.',
  ];
})();
