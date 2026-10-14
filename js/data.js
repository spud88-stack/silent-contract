// Static game data: items, themes, names, personas, syndicates, objectives, canned lines.
(function () {
  const SC = window.SC;
  const P = SC.Sprites.PAL;

  SC.ITEMS = {
    fists: { name: 'Bare Hands', desc: 'Subdue from behind with [Q].' },
    wire: { name: 'Fiber Wire', desc: 'Silent kill from behind. Never leaves a mess.', price: 600, illegal: true, persist: true, rarity: 'rare' },
    knife: { name: 'Knife', desc: 'Silent melee kill. Right-click to throw.', price: 500, illegal: true, persist: true, rarity: 'common' },
    wrench: { name: 'Wrench', desc: 'Blunt. Knocks out, never kills. Right-click to throw.', price: 250, illegal: false, persist: true, rarity: 'common' },
    crowbar: { name: 'Crowbar', desc: 'Blunt. Also forces locked doors (loudly).', price: 350, illegal: false, persist: true, rarity: 'common' },
    pistol: { name: 'Guard Pistol', desc: 'Loud. Everyone will hear it.', price: 900, illegal: true, persist: true, gun: true, ammo: 8, loud: 22, rarity: 'common' },
    silenced: { name: 'Silenced Pistol', desc: 'Quiet enough, if nobody is close.', price: 2600, illegal: true, persist: true, gun: true, ammo: 7, loud: 3.5, rarity: 'epic' },
    coin: { name: 'Coin', desc: 'Throw to pull attention somewhere else.', price: 60, stack: true, consumable: true, rarity: 'common' },
    lockpick: { name: 'Lockpick', desc: 'Opens locked doors and safes. Reusable in-mission.', price: 450, tool: true, consumable: true, rarity: 'rare' },
    lethal: { name: 'Lethal Vial', desc: 'Poison a drink. Whoever sips it dies.', price: 900, stack: true, consumable: true, rarity: 'epic' },
    emetic: { name: 'Emetic Vial', desc: 'Poison a drink. The victim runs to the bathroom, alone.', price: 400, stack: true, consumable: true, rarity: 'rare' },
    keycard: { name: 'Master Keycard', desc: 'Opens every locked door here.', mission: true },
    package: { name: "Courier's Package", desc: 'Dirty money. Yours now.', mission: true },
  };

  // outfit access level; a room of tier T needs level >= T
  SC.OUTFIT_LEVEL = { suit: 0, civ: 0, staff: 1, worker: 1, guard: 2, elite: 3 };

  const civVariants = (rng, formal) => {
    const cols = formal
      ? ['#262b44', '#3a4466', '#68386c', '#124e89', '#a22633', '#193c3e', '#733e39', '#e8e0d0']
      : ['#e43b44', '#0099db', '#63c74d', '#feae34', '#b55088', '#2ce8f5', '#f77622', '#c0cbdc', '#68386c'];
    const shirt = rng.pick(cols);
    const look = { shirt, pants: rng.pick(['#262b44', '#3a4466', '#181425', '#5a6988', '#733e39']) };
    if (rng.chance(0.4)) { look.skirt = true; }
    else if (formal && rng.chance(0.6)) { look.collar = '#ffffff'; look.tie = rng.pick(['#e43b44', '#feae34', '#0099db', '#181425']); }
    return look;
  };

  SC.THEMES = {
    estate: {
      label: 'Private Estate', formal: true,
      places: ['Villa Moretti', 'Château Vallois', 'Hacienda del Sol', 'Blackwood Manor', 'Casa Aurelio', 'Thornfield Hall'],
      regions: ['Amalfi Coast', 'Loire Valley', 'Andalusia', 'Scottish Highlands', 'Lake Como', 'Sintra'],
      event: 'a private gala', outdoor: 'grass', path: 'cobble',
      wall: { cap: '#3b2a3a', face: '#8c6a5c', trim: '#4a332e', style: 'panel' }, deco: ['painting', 'painting', 'window'],
      ambient: [22, 26, 60, 0.5], lightColor: '255,214,150',
      floors: { 0: ['marble', 'wood'], 1: ['tile', 'wood'], 2: ['carpetG', 'concrete'], 3: ['carpetR', 'dwood'] },
      rooms: {
        0: [['Grand Foyer', 'foyer'], ['Ballroom', 'ballroom'], ['Lounge Bar', 'bar'], ['Dining Hall', 'dining'], ['Gallery', 'gallery'], ['Conservatory', 'lounge']],
        1: [['Kitchen', 'kitchen'], ['Staff Quarters', 'locker'], ['Utility Room', 'utility'], ['Laundry', 'laundry'], ['Pantry', 'storage']],
        2: [['Security Office', 'security'], ['Wine Cellar', 'storage'], ['Guard Room', 'locker'], ['Records Room', 'office']],
        3: [['Master Study', 'office'], ['Master Bedroom', 'bedroom'], ['Private Vault', 'vault'], ['Private Lounge', 'vip']],
      },
      outfits: {
        civ: { name: 'Gala Guest', gen: (r) => civVariants(r, true) },
        staff: { name: 'Waiter', look: { shirt: '#f0ece4', pants: P.ink, vest: P.ink, bow: P.dred } },
        worker: { name: 'Gardener', look: { shirt: '#4d7a4a', pants: '#5c4530', apron: '#8a6a4a', hat: 'beret', hatColor: '#5c4530' } },
        guard: { name: 'Estate Guard', look: { shirt: '#2a3f6e', pants: '#1c2a4a', hat: 'cap', hatColor: '#1c2a4a', badge: P.gold, belt: P.ink } },
        elite: { name: 'Bodyguard', look: { shirt: '#1c1a24', pants: '#1c1a24', collar: '#ffffff', tie: '#5a6988', glasses: P.ink, shades: true, earpiece: true } },
      },
      outdoorProps: { tree: 16, bush: 18, bench: 5, streetlamp: 8, car: 3, fountain: 1, statue: 2 },
    },
    corporate: {
      label: 'Corporate Campus', formal: true,
      places: ['Helix Dynamics HQ', 'Novacore Tower', 'Meridian Labs', 'Orbis Capital', 'Sable Biotech', 'Kestrel Systems'],
      regions: ['Singapore', 'Frankfurt', 'Seattle', 'Seoul', 'Zurich', 'Toronto'],
      event: 'a late-night product launch', outdoor: 'grass', path: 'concrete',
      wall: { cap: '#2a3040', face: '#aab4c4', trim: '#5a6988', style: 'plain' }, deco: ['poster', 'window', 'window', 'vent'],
      ambient: [18, 26, 58, 0.48], lightColor: '200,225,255',
      floors: { 0: ['marble', 'carpetB'], 1: ['tile', 'carpetG'], 2: ['carpetG', 'metal'], 3: ['carpetB', 'dwood'] },
      rooms: {
        0: [['Atrium', 'foyer'], ['Launch Hall', 'ballroom'], ['Cafeteria', 'dining'], ['Lobby Bar', 'bar'], ['Showroom', 'gallery'], ['Break Lounge', 'lounge']],
        1: [['Canteen Kitchen', 'kitchen'], ['Locker Room', 'locker'], ['Maintenance', 'utility'], ['Mail Room', 'storage'], ['Open Office', 'cubicles']],
        2: [['Security Hub', 'security'], ['Server Farm', 'server'], ['R&D Lab', 'lab'], ['Archive', 'storage']],
        3: [['Executive Office', 'office'], ['Boardroom', 'boardroom'], ['Secure Vault', 'vault'], ['Penthouse Suite', 'bedroom']],
      },
      outfits: {
        civ: { name: 'Employee', gen: (r) => civVariants(r, true) },
        staff: { name: 'Caterer', look: { shirt: '#e8eef5', pants: '#262b44', apron: '#262b44' } },
        worker: { name: 'Technician', look: { shirt: '#3a6a8a', pants: '#2a4a62', stripe: P.lyellow, hat: 'cap', hatColor: '#2a4a62' } },
        guard: { name: 'Security Officer', look: { shirt: '#4a4f5e', pants: '#2a2d38', hat: 'cap', hatColor: '#2a2d38', badge: P.pale, belt: P.ink } },
        elite: { name: 'Executive Protection', look: { shirt: '#22242e', pants: '#22242e', collar: '#ffffff', tie: P.blue, earpiece: true, glasses: P.ink, shades: true } },
      },
      outdoorProps: { tree: 10, bush: 14, bench: 6, streetlamp: 10, car: 6, statue: 1 },
    },
    club: {
      label: 'Nightclub', formal: false,
      places: ['Club Halcyon', 'The Velvet Cage', 'NEON//VOID', 'Paradiso', 'Die Maschine', 'Club Obsidian'],
      regions: ['Berlin', 'Miami', 'Bangkok', 'Ibiza', 'Tokyo', 'São Paulo'],
      event: 'a sold-out night', outdoor: 'asphalt', path: 'concrete',
      wall: { cap: '#1a1626', face: '#3d3552', trim: '#181425', style: 'brick' }, deco: ['neon', 'neon', 'poster', 'vent'],
      ambient: [20, 10, 48, 0.58], lightColor: '255,120,220', neon: true,
      floors: { 0: ['dwood', 'carpetP'], 1: ['tile', 'concrete'], 2: ['concrete', 'metal'], 3: ['carpetP', 'dwood'] },
      rooms: {
        0: [['Entrance Hall', 'foyer'], ['Dance Floor', 'dance'], ['Main Bar', 'bar'], ['Chillout Lounge', 'lounge'], ['Pool Room', 'lounge'], ['Second Stage', 'dance']],
        1: [['Kitchen', 'kitchen'], ['Staff Room', 'locker'], ['Power Room', 'utility'], ['Keg Storage', 'storage'], ['Dressing Room', 'laundry']],
        2: [['Security Booth', 'security'], ['Cash Office', 'office'], ['Back Storage', 'storage'], ['Green Room', 'vip']],
        3: [["Owner's Office", 'office'], ['VIP Suite', 'vip'], ['Counting Room', 'vault'], ['Private Booth', 'bedroom']],
      },
      outfits: {
        civ: { name: 'Clubber', gen: (r) => civVariants(r, false) },
        staff: { name: 'Bartender', look: { shirt: '#1c1a24', pants: P.ink, vest: '#68386c', bow: P.pink } },
        worker: { name: 'Stagehand', look: { shirt: '#2a2d38', pants: '#3a4466', stripe: '#feae34', hat: 'beanie', hatColor: '#181425' } },
        guard: { name: 'Bouncer', look: { shirt: '#181425', pants: '#181425', badge: P.lyellow, belt: '#3a4466', earpiece: true } },
        elite: { name: 'VIP Security', look: { shirt: '#e8e0d0', pants: '#e8e0d0', collar: P.ink, tie: P.ink, glasses: P.ink, shades: true, earpiece: true } },
      },
      outdoorProps: { car: 7, streetlamp: 9, dumpster: 3, crate: 5, barrel: 4, bench: 2 },
    },
    harbor: {
      label: 'Dockside Compound', formal: false, water: true,
      places: ['Pier 9 Freight', 'Krakenhaven Depot', 'Black Tide Shipping', 'Port Varga', 'Saltmarsh Cannery', 'Dock 17'],
      regions: ['Rotterdam', 'Marseille', 'Odessa', 'Busan', 'Valparaíso', 'Gdańsk'],
      event: 'a midnight shipment', outdoor: 'concrete', path: 'asphalt',
      wall: { cap: '#2a2f38', face: '#6a7a86', trim: '#3a4452', style: 'metal' }, deco: ['vent', 'poster', 'window'],
      ambient: [14, 24, 44, 0.55], lightColor: '255,200,130',
      floors: { 0: ['concrete', 'planks'], 1: ['tile', 'concrete'], 2: ['metal', 'concrete'], 3: ['dwood', 'carpetG'] },
      rooms: {
        0: [['Loading Bay', 'warehouse'], ['Canteen', 'dining'], ['Dockside Bar', 'bar'], ['Warehouse A', 'warehouse'], ['Rec Room', 'lounge'], ['Warehouse B', 'warehouse']],
        1: [['Galley', 'kitchen'], ['Crew Lockers', 'locker'], ['Generator Room', 'utility'], ['Tool Shop', 'storage'], ['Cold Storage', 'storage']],
        2: [['Dispatch Office', 'security'], ['Contraband Hold', 'warehouse'], ['Armory', 'storage'], ['Radio Room', 'server']],
        3: [["Harbormaster's Office", 'office'], ["Captain's Quarters", 'bedroom'], ['Strongroom', 'vault'], ['Private Den', 'vip']],
      },
      outfits: {
        civ: { name: 'Sailor', gen: (r) => ({ shirt: r.pick(['#e8eef5', '#3a4466', '#733e39', '#5a6988', '#265c42']), pants: r.pick(['#262b44', '#3a4466', '#5c4530']), hat: r.chance(0.4) ? 'beanie' : undefined, hatColor: r.pick(['#a22633', '#124e89', '#181425']) }) },
        staff: { name: 'Dockhand', look: { shirt: '#5a6988', pants: '#3a4466', stripe: '#f77622', hat: 'hardhat', hatColor: P.lyellow } },
        worker: { name: 'Mechanic', look: { shirt: '#2f5f8a', pants: '#2f5f8a', belt: '#733e39', hat: 'beanie', hatColor: '#262b44' } },
        guard: { name: 'Dock Guard', look: { shirt: '#4d5a3a', pants: '#333d28', hat: 'cap', hatColor: '#333d28', badge: P.gold, belt: P.ink } },
        elite: { name: 'Enforcer', look: { shirt: '#5c3a26', pants: '#22242e', collar: '#181425', glasses: P.ink, shades: true, earpiece: true } },
      },
      outdoorProps: { container: 7, crate: 12, barrel: 8, forklift: 3, streetlamp: 9, car: 3, dumpster: 2 },
    },
  };

  Object.assign(SC.THEMES, {
    hotel: {
      label: 'Luxury Hotel', formal: true, reception: true, hallName: 'Grand Corridor', carts: true,
      places: ['The Aurelian', 'Hotel Belcourt', 'Grand Meridien', 'The Kestrel Palace', 'Hotel Imperatrix', 'The Saltire'],
      regions: ['Monaco', 'Dubai', 'Vienna', 'Hong Kong', 'Marrakech', 'Buenos Aires'],
      event: 'a charity masquerade', outdoor: 'grass', path: 'cobble',
      wall: { cap: '#2e2236', face: '#c9b49a', trim: '#5f3822', style: 'panel' }, deco: ['painting', 'painting', 'window', 'window'],
      ambient: [24, 22, 56, 0.48], lightColor: '255,220,160',
      floors: { 0: ['marble', 'carpetR'], 1: ['tile', 'concrete'], 2: ['carpetG', 'concrete'], 3: ['carpetP', 'dwood'] },
      rooms: {
        0: [['Hotel Lobby', 'foyer'], ['Grand Ballroom', 'ballroom'], ['Rooftop Bar', 'bar'], ['Restaurant', 'dining'], ['Spa Lounge', 'lounge'], ['Piano Bar', 'lounge']],
        1: [['Hotel Kitchen', 'kitchen'], ['Staff Lockers', 'locker'], ['Maintenance', 'utility'], ['Housekeeping', 'laundry'], ['Luggage Room', 'storage']],
        2: [['Security Office', 'security'], ['Server Closet', 'server'], ['Back Office', 'cubicles'], ['Wine Store', 'storage']],
        3: [['Presidential Suite', 'bedroom'], ['Penthouse Office', 'office'], ['Hotel Vault', 'vault'], ['Private Salon', 'vip']],
      },
      outfits: {
        civ: { name: 'Hotel Guest', gen: (r) => civVariants(r, true) },
        staff: { name: 'Bellhop', look: { shirt: '#a22633', pants: P.ink, hat: 'cap', hatColor: '#a22633', buttons: P.gold, belt: P.gold } },
        worker: { name: 'Housekeeper', look: { shirt: '#5a6988', pants: '#3a4466', apron: '#f0ece4', collar: '#ffffff' } },
        guard: { name: 'Hotel Security', look: { shirt: '#262b44', pants: '#181425', badge: P.gold, belt: P.ink, earpiece: true, collar: '#ffffff' } },
        elite: { name: 'Private Security', look: { shirt: '#1c1a24', pants: '#1c1a24', collar: '#ffffff', tie: '#68386c', glasses: P.ink, shades: true, earpiece: true } },
      },
      outdoorProps: { tree: 12, bush: 16, streetlamp: 10, car: 6, fountain: 1, bench: 4, cart: 2 },
    },
    casino: {
      label: 'Casino Resort', formal: true, neon: true, hallName: 'Casino Concourse',
      places: ['The Golden Mirage', 'Casino Royale Noire', 'Lucky Dragon', 'The Velvet Ace', 'Monte Lux', 'Starfall Casino'],
      regions: ['Las Vegas', 'Macau', 'Monte Carlo', 'Atlantic City', 'Sun City', 'Baden-Baden'],
      event: 'a high-stakes tournament', outdoor: 'asphalt', path: 'cobble',
      wall: { cap: '#1e1424', face: '#5a2a3a', trim: '#e8b923', style: 'panel' }, deco: ['neon', 'painting', 'poster', 'neon'],
      ambient: [26, 12, 40, 0.52], lightColor: '255,205,130',
      floors: { 0: ['casino', 'carpetR'], 1: ['tile', 'concrete'], 2: ['carpetG', 'metal'], 3: ['carpetP', 'dwood'] },
      rooms: {
        0: [['Casino Floor', 'casino'], ['Slot Hall', 'casino'], ['Cabaret Stage', 'dance'], ['Buffet', 'dining'], ['Sports Bar', 'bar'], ['High Roller Lounge', 'casino']],
        1: [['Kitchen', 'kitchen'], ["Dealers' Lounge", 'locker'], ['Maintenance', 'utility'], ['Cage Storage', 'storage'], ['Costume Room', 'laundry']],
        2: [['Surveillance Room', 'security'], ['Count Room', 'vault'], ['Server Room', 'server'], ['Pit Office', 'cubicles']],
        3: [["Owner's Office", 'office'], ['Penthouse', 'bedroom'], ['Casino Vault', 'vault'], ['VIP Salon', 'vip']],
      },
      outfits: {
        civ: { name: 'Gambler', gen: (r) => civVariants(r, true) },
        staff: { name: 'Croupier', look: { shirt: '#f0ece4', pants: P.ink, vest: '#1d6a3a', bow: P.dred } },
        worker: { name: 'Slot Technician', look: { shirt: '#3a4466', pants: '#262b44', stripe: P.lyellow, hat: 'cap', hatColor: '#262b44' } },
        guard: { name: 'Casino Security', look: { shirt: '#1c1a24', pants: '#1c1a24', badge: P.gold, belt: P.gold, earpiece: true } },
        elite: { name: 'Pit Boss Muscle', look: { shirt: '#68386c', pants: '#22242e', collar: P.ink, glasses: P.ink, shades: true, earpiece: true } },
      },
      outdoorProps: { car: 8, streetlamp: 10, bush: 8, fountain: 1, tree: 4 },
    },
    museum: {
      label: 'Museum Gala', formal: true, frames: true, hallName: 'Grand Gallery',
      places: ['Musée Valcourt', 'The Hallam Institute', 'Galleria Severini', 'Rijkshof Museum', 'The Ashcombe Collection', 'Museo del Faro'],
      regions: ['Paris', 'London', 'Florence', 'Amsterdam', 'New York', 'Lisbon'],
      event: 'an exhibition opening', outdoor: 'grass', path: 'cobble',
      wall: { cap: '#2c2a36', face: '#d8d0c0', trim: '#7a6a5a', style: 'panel' }, deco: ['painting', 'painting', 'painting', 'window'],
      ambient: [20, 22, 50, 0.5], lightColor: '255,236,200',
      floors: { 0: ['marble', 'wood'], 1: ['tile', 'wood'], 2: ['carpetG', 'concrete'], 3: ['carpetB', 'dwood'] },
      rooms: {
        0: [['Grand Hall', 'foyer'], ['Renaissance Wing', 'gallery'], ['Modern Art Wing', 'gallery'], ['Museum Café', 'dining'], ['Gala Hall', 'ballroom'], ['Sculpture Court', 'gallery']],
        1: [['Catering Kitchen', 'kitchen'], ['Staff Lockers', 'locker'], ['Restoration Workshop', 'lab'], ['Maintenance', 'utility'], ['Loading Dock', 'storage']],
        2: [['Security Center', 'security'], ['Archive', 'storage'], ['Climate Control', 'server'], ['Conservation Lab', 'lab']],
        3: [["Curator's Office", 'office'], ['Private Collection', 'gallery'], ['Museum Vault', 'vault'], ["Director's Lounge", 'vip']],
      },
      outfits: {
        civ: { name: 'Patron', gen: (r) => civVariants(r, true) },
        staff: { name: 'Caterer', look: { shirt: '#f0ece4', pants: P.ink, apron: P.ink, bow: P.ink } },
        worker: { name: 'Art Restorer', look: { shirt: '#e8e0d0', pants: '#5a6988', apron: '#5a6988', hat: 'beret', hatColor: '#733e39' } },
        guard: { name: 'Museum Guard', look: { shirt: '#3a4466', pants: '#262b44', hat: 'cap', hatColor: '#262b44', badge: P.gold, belt: P.ink } },
        elite: { name: 'Bodyguard', look: { shirt: '#1c1a24', pants: '#1c1a24', collar: '#ffffff', tie: '#a22633', glasses: P.ink, shades: true, earpiece: true } },
      },
      outdoorProps: { tree: 14, bush: 16, statue: 5, bench: 6, streetlamp: 8, fountain: 1 },
    },
    research: {
      label: 'Arctic Research Station', formal: false, tanks: true, hallName: 'Central Corridor',
      places: ['Station Borealis', 'Kessler Polar Lab', 'Outpost Nadir', 'Svalbard Deep', 'Vanguard Station', 'Frostline Institute'],
      regions: ['Svalbard', 'Greenland', 'Antarctica', 'Yukon', 'Siberia', 'Lapland'],
      event: 'a classified board visit', outdoor: 'snow', path: 'concrete',
      wall: { cap: '#2a3040', face: '#c8d0dc', trim: '#5a6988', style: 'metal' }, deco: ['vent', 'poster', 'window', 'vent'],
      ambient: [18, 30, 62, 0.5], lightColor: '210,235,255',
      floors: { 0: ['tile', 'carpetB'], 1: ['tile', 'metal'], 2: ['metal', 'concrete'], 3: ['carpetG', 'metal'] },
      rooms: {
        0: [['Reception', 'foyer'], ['Mess Hall', 'dining'], ['Conference Hall', 'boardroom'], ['Rec Room', 'lounge'], ['Observation Deck', 'lounge'], ['Visitor Gallery', 'gallery']],
        1: [['Galley', 'kitchen'], ['Locker Room', 'locker'], ['Generator Room', 'utility'], ['Supply Depot', 'storage'], ['Wet Lab', 'lab']],
        2: [['Security Hub', 'security'], ['Server Core', 'server'], ['Test Chamber', 'lab'], ['Cold Storage', 'storage']],
        3: [["Director's Office", 'office'], ['Specimen Vault', 'vault'], ["Director's Quarters", 'bedroom'], ['Black Lab', 'lab']],
      },
      outfits: {
        civ: { name: 'Researcher', gen: (r) => ({ shirt: '#e8eef5', pants: r.pick(['#3a4466', '#262b44', '#5a6988', '#733e39']), collar: r.pick(['#124e89', '#3e8948', '#a22633']), glasses: r.chance(0.4) ? '#262b44' : undefined }) },
        staff: { name: 'Lab Assistant', look: { shirt: '#9ab0c8', pants: '#3a4466', apron: '#e8eef5' } },
        worker: { name: 'Maintenance Crew', look: { shirt: '#f77622', pants: '#3a4466', stripe: P.lyellow, hat: 'beanie', hatColor: '#262b44' } },
        guard: { name: 'Station Guard', look: { shirt: '#4a4f5e', pants: '#2a2d38', hat: 'beanie', hatColor: '#2a2d38', badge: P.pale, belt: P.ink } },
        elite: { name: 'Containment Team', look: { shirt: '#2a3a2a', pants: '#1c241c', glasses: P.ink, shades: true, earpiece: true, hat: 'cap', hatColor: '#1c241c' } },
      },
      outdoorProps: { pine: 18, crate: 8, barrel: 6, snowman: 1, streetlamp: 8, container: 2, car: 2 },
    },
  });

  // how a target spends the night; drives their route, escort and intel
  SC.TARGET_TYPES = {
    socialite: { label: 'Socialite', desc: 'Works the room. Drinks, mingles, rarely alone for long.' },
    recluse: { label: 'Recluse', desc: 'Never leaves the private wing. Two bodyguards.' },
    workaholic: { label: 'Workaholic', desc: 'Shuttles between offices and meetings. No escort.' },
    chief: { label: 'Head of Security', desc: 'Armed. Patrols restricted areas and knows every guard by face.' },
    insider: { label: 'Insider', desc: 'Hides in plain sight among the staff.' },
    smoker: { label: 'Chain Smoker', desc: 'Keeps slipping outside to smoke.' },
    visitor: { label: 'Visitor', desc: 'Arrives late and leaves early. Miss the window and the contract fails.' },
  };

  SC.PLAYER_LOOK = { skin: '#e8b796', hair: null, hairStyle: 2 };
  SC.SUIT = { kind: 'suit', name: 'Tailored Suit', look: { shirt: '#1c1a24', pants: '#1c1a24', collar: '#ffffff', tie: '#c8102e' } };

  SC.NAMES = {
    first: ['Marco', 'Elena', 'Viktor', 'Amara', 'Kenji', 'Sofia', 'Dmitri', 'Leila', 'Hugo', 'Ingrid', 'Rafael', 'Mei', 'Tobias', 'Nadia', 'Oscar', 'Priya', 'Luca', 'Zara', 'Felix', 'Hana', 'Anton', 'Carmen', 'Idris', 'Greta', 'Mateo', 'Yuki', 'Stefan', 'Farah', 'Niko', 'Clara', 'Omar', 'Sienna', 'Pavel', 'Ines', 'Joon', 'Bianca', 'Emil', 'Tessa', 'Kofi', 'Vera', 'Dario', 'Lena', 'Ravi', 'Mila', 'Jonas', 'Aiko', 'Bruno', 'Selma'],
    last: ['Rossi', 'Novak', 'Okafor', 'Tanaka', 'Lindqvist', 'Moreau', 'Volkov', 'Haddad', 'Castillo', 'Weber', 'Santos', 'Kowalski', 'Nguyen', 'Petrov', 'Bianchi', 'Schmidt', 'Reyes', 'Dubois', 'Yamamoto', 'Kaplan', 'Ferrari', 'Larsen', 'Mensah', 'Ortega', 'Brandt', 'Ivanova', 'Sato', 'Marchetti', 'Vasquez', 'Holt', 'Draven', 'Kessler', 'Abara', 'Lund', 'Varga', 'Sokolov'],
  };
  SC.TRAITS = ['gossipy', 'by-the-book', 'bored', 'anxious', 'arrogant', 'friendly', 'cynical', 'lazy', 'ambitious', 'paranoid', 'kind-hearted', 'tipsy', 'sarcastic', 'naive', 'grumpy', 'flirtatious', 'superstitious', 'exhausted', 'proud', 'curious', 'blunt', 'timid'];
  SC.BACKSTORY = {
    civ: ['came for the free drinks', 'is here to network and hates it', 'is hiding from an ex who is also here', 'lost a bet and had to come', 'is trying to impress their date', 'thinks the host is a crook but enjoys the food', 'is slightly drunk already', 'claims to know everyone important'],
    staff: ['has worked double shifts all week', 'is saving up to quit', 'got yelled at by the boss an hour ago', 'started three days ago and barely knows the place', 'knows every shortcut in the building', 'steals leftover food every night', 'is covering for a coworker who called in sick'],
    worker: ['fixes everything here and gets no thanks', 'has a bad back and worse mood', 'is the only one who knows how the wiring works', 'listens to true-crime podcasts on the job', 'has been asking for new tools for months'],
    guard: ['is an ex-cop who misses the action', 'took this job for the dental plan', 'takes the rules extremely seriously', 'would rather be watching the match', 'is on their third coffee and still tired', 'got written up last week for letting someone slip by', 'thinks the boss is paranoid for no reason'],
    elite: ['is former military and trusts nobody', 'has protected the boss for six years', 'was hired last month and wants to prove themselves', 'is paid too well to ask questions', 'has seen the boss do terrible things'],
    target: ['is used to being obeyed', 'has made a great many enemies', 'trusts only their inner circle', 'thinks they are untouchable here'],
  };

  SC.SYNDICATES = [
    { key: 'arms', name: 'Arms Trafficking', blurb: 'Crates of rifles moving through quiet ports.', themes: ['harbor', 'estate', 'research'] },
    { key: 'espionage', name: 'Espionage', blurb: 'Secrets sold to whoever pays in advance.', themes: ['corporate', 'estate', 'museum', 'research'] },
    { key: 'pharma', name: 'Big Pharma', blurb: 'Cures buried, patents weaponised.', themes: ['corporate', 'club', 'research'] },
    { key: 'vice', name: 'Vice & Narcotics', blurb: 'Every dance floor is a storefront.', themes: ['club', 'harbor', 'casino'] },
    { key: 'laundering', name: 'Money Laundering', blurb: 'Dirty cash, spotless ledgers.', themes: ['estate', 'corporate', 'casino', 'hotel'] },
    { key: 'smuggling', name: 'Human Smuggling', blurb: 'People as cargo. End it.', themes: ['harbor', 'club', 'hotel'] },
    { key: 'art', name: 'Art Theft & Forgery', blurb: 'Masterpieces swapped for fakes, originals sold in the dark.', themes: ['museum', 'estate', 'hotel'] },
    { key: 'gambling', name: 'Rigged Gambling', blurb: 'The house always wins. They made sure of it.', themes: ['casino', 'hotel', 'club'] },
  ];
  SC.SYN_NAMES = ['The Pale Hand', 'Crimson Ledger', 'Ouroboros Group', 'The Lantern Men', 'House Mercier', 'Black Meridian', 'The Quiet Table', 'Sable Union', 'Ninth Circle Holdings', 'The Gardeners'];

  // payout objectives, evaluated on exfil against mission stats
  SC.OBJECTIVES = {
    silent: { name: 'Silent Assassin', desc: 'Never be compromised or recorded, no bodies found, no non-target casualties.', pay: 900, test: (s) => !s.compromised && s.bodiesFound === 0 && s.nonTargetKills === 0 && !s.recorded },
    nocollateral: { name: 'No Collateral', desc: 'Kill only your targets.', pay: 350, test: (s) => s.nonTargetKills === 0 },
    suitonly: { name: 'Suit Only', desc: 'Never change your disguise.', pay: 600, test: (s) => s.disguiseChanges === 0 },
    poison: { name: 'Poisoner', desc: 'Eliminate a target with poison.', pay: 500, test: (s) => s.methods.includes('poison') },
    blade: { name: 'Blade Work', desc: 'Eliminate a target with a knife.', pay: 400, test: (s) => s.methods.includes('knife') },
    wire: { name: 'Garrote', desc: 'Eliminate a target with the fiber wire.', pay: 450, test: (s) => s.methods.includes('wire') },
    marksman: { name: 'Marksman', desc: 'Eliminate a target with a firearm.', pay: 350, test: (s) => s.methods.includes('gun') },
    nobodies: { name: 'No Bodies Found', desc: 'Nobody discovers a body.', pay: 450, test: (s) => s.bodiesFound === 0 },
    nokos: { name: 'Hands Off', desc: 'Do not pacify anyone.', pay: 450, test: (s) => s.kos === 0 },
    noguns: { name: 'No Firearms', desc: 'Never fire a gun.', pay: 300, test: (s) => s.shots === 0 },
    timed: { name: 'In and Out', desc: 'Complete the contract in under 6 minutes.', pay: 500, test: (s) => s.time < 360 },
    safe: { name: 'Safecracker', desc: 'Open the safe on site.', pay: 500, test: (s) => s.safeOpened },
    courier: { name: 'Intercept the Courier', desc: "Take the courier's package.", pay: 450, test: (s) => s.courier },
    talker: { name: 'Silver Tongue', desc: 'Talk your way out of a confrontation or talk someone into leaving their post.', pay: 450, test: (s) => s.talked > 0 },
    nocams: { name: 'No Recordings', desc: 'Leave no camera footage of yourself — or erase it.', pay: 400, test: (s) => !s.recorded },
    accident: { name: 'Tragic Accident', desc: 'Eliminate a target with an accident.', pay: 600, test: (s) => s.methods.includes('accident') },
    hidden: { name: 'Tidy Up', desc: 'Hide every target body in a container.', pay: 400, test: (s) => s.targetsHidden },
  };

  // Canned lines. {room} {target} {name} are substituted.
  SC.LINES = {
    greet: ['Evening.', 'Hey there.', 'Can I help you?', 'Hm? Oh. Hello.', 'Yes?', "What's up?", 'Nice night, huh.'],
    busy: ["I'm a bit busy right now.", 'Not a great time.', 'Make it quick.'],
    susp: ['Hm?', 'Wait a second...', "Something's off.", 'Who is that?', 'Hold on...', "I don't recognise them."],
    lost: ['Must have been nothing.', 'Guess I imagined it.', 'Huh. Gone.', 'Whatever.'],
    trespass: ["Hey! You can't be in here.", 'This area is off limits.', "You're not supposed to be back here.", "Excuse me, staff only.", 'Stop right there. Restricted area.'],
    enforcer: ["Wait. I don't know you.", "You're not on my crew. Who are you?", "Hold up, I've never seen you before.", "Which shift are you on? I don't know your face."],
    escort: ['Come on. Out. Now.', "I'll walk you out. Move.", 'Back the way you came. Go.'],
    lastwarn: ["I said MOVE!", "Last warning!", "Don't make me do this."],
    hunt: ["It's them! Take them down!", 'Drop it! DROP IT!', 'Target spotted!', 'Open fire!', "There! Don't let them get away!"],
    searching: ['Spread out. Find them.', 'They went this way.', 'Check every corner.', "Come out, we know you're here."],
    giveup: ['Lost them. Stay sharp.', "They're gone. For now.", 'All clear... I think.'],
    body: ["Oh my god. There's a body!", "Someone's down! Man down!", 'What the— is that...?!', "Help! Somebody help!"],
    kofound: ['Hey! Hey, wake up!', "Someone's knocked out cold over here!", 'Are you okay?! Talk to me!'],
    woke: ['Ugh... someone jumped me.', 'My head... who did that?', "I got hit from behind. Find them!"],
    flee: ['Help! HELP!', "Somebody call security!", "Oh god, oh god!", "They've got a weapon!", 'Guards! GUARDS!'],
    report: ["Guard! There's someone dangerous, dressed like a {outfit}!", "I saw it! Someone dressed as a {outfit}! They attacked someone!", "Security! There's a {outfit} going around hurting people!"],
    noise: ["What was that?", 'Did you hear that?', 'Hm? Something fell.', "I'd better check that."],
    coin: ['Is that... money?', 'Someone dropped something.', 'Huh, a coin.'],
    gunshot: ['GUNSHOTS!', 'Was that a gun?!', 'Get down!'],
    blackout: ['Who killed the lights?', 'Great. Power is out again.', "Can't see a thing.", 'Somebody check the fuse box!'],
    radio: ['Who left this on?', 'Turn that racket off.'],
    sick: ["Ugh, I don't feel so good...", 'Excuse me... I need the restroom. Now.'],
    weapon: ["Is that a weapon?!", "They're armed!", "Put that away!"],
    smalltalk: [
      ['Long night, huh?', 'Tell me about it. My feet are killing me.'],
      ['Did you try the food?', "It's the only reason I'm still here."],
      ["Have you seen the boss tonight?", "Briefly. In a mood, as usual."],
      ["I swear this place gets weirder every week.", "You get used to it. Mostly."],
      ["You hear about the new security rules?", "More rules. Just what we needed."],
      ["I can't wait to go home.", "Two more hours. Hang in there."],
      ["Somebody said there's trouble coming.", "There's always trouble coming."],
      ["Is it just me or is it freezing in here?", "It's just you."],
      ["Who was that in the {room}?", "No idea. Never seen them."],
      ["They don't pay us enough for this.", "They don't pay us enough for anything."],
    ],
    intelAsk: ["You didn't hear it from me, but... ", 'Between us? ', "Everybody knows that. ", 'Well, since you ask: '],
    refuse: ["I'm not talking about that.", "Why do you want to know?", "That's none of your business.", "I don't know you well enough for that."],
    believe: ['Oh! Uh, okay. Thanks for telling me.', "Seriously? Alright, I'm on it.", 'Right. I should go check.', "Damn. Okay, okay."],
    doubt: ["Yeah, I don't think so.", "Nice try.", "Nobody told me about that.", "I'll believe it when I hear it on the radio."],
    accept: ["Fine. But don't wander.", "...Alright. Be quick about it.", "Okay. Just this once.", "Sure, sure. Go on."],
    follow: ["Okay, lead the way.", "This better be important.", "Fine, show me."],
    bribeYes: ["...I didn't see anything.", "That'll do. Walk on."],
    bribeNo: ["Are you trying to bribe me?", "Keep your money."],
    insult: ["Excuse me?!", "Watch your mouth.", "You want to say that again?"],
    bye: ['Right.', 'See you around.', 'Take care.', 'Mm-hm.'],
    liar: ["That stranger sent me on a wild goose chase.", "Somebody's going around telling lies. Watch out.", "There was nothing there. I got played."],
    evac: ["Did you hear? Something's wrong in the {room}.", "They say there's a problem in the {room}. I'm staying clear."],
    targetChatter: ["{target}? Probably in the {room}. Usually is around now.", "I saw {target} heading to the {room} earlier."],
  };
})();
