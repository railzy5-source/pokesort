import { MonModel } from './types';
import { Dex } from './pveModel';
import { cleanSpeciesName } from './defaultConfig';
import { ivStr } from './pgsParser';

export type MegaTier = 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C';

/**
 * Legitimate, canonical Pokémon GO Mega & Primal forms supported in the Game Master.
 * Speculative, fan-made, or unreleased forms are strictly excluded.
 */
export const GAME_MASTER_MEGA_SIDS: ReadonlySet<string> = new Set([
  'venusaur_mega',
  'charizard_mega_x',
  'charizard_mega_y',
  'blastoise_mega',
  'beedrill_mega',
  'pidgeot_mega',
  'alakazam_mega',
  'slowbro_mega',
  'gengar_mega',
  'kangaskhan_mega',
  'pinsir_mega',
  'gyarados_mega',
  'aerodactyl_mega',
  'mewtwo_mega_x',
  'mewtwo_mega_y',
  'ampharos_mega',
  'steelix_mega',
  'scizor_mega',
  'heracross_mega',
  'houndoom_mega',
  'tyranitar_mega',
  'sceptile_mega',
  'blaziken_mega',
  'swampert_mega',
  'gardevoir_mega',
  'sableye_mega',
  'mawile_mega',
  'aggron_mega',
  'medicham_mega',
  'manectric_mega',
  'sharpedo_mega',
  'camerupt_mega',
  'altaria_mega',
  'banette_mega',
  'absol_mega',
  'glalie_mega',
  'salamence_mega',
  'metagross_mega',
  'latias_mega',
  'latios_mega',
  'kyogre_primal',
  'groudon_primal',
  'rayquaza_mega',
  'lopunny_mega',
  'garchomp_mega',
  'lucario_mega',
  'abomasnow_mega',
  'gallade_mega',
  'audino_mega',
  'diancie_mega',
]);

/**
 * Mega Energy requirements: [firstTimeCost, subsequentCost]
 */
export const MEGA_ENERGY_COSTS: Record<string, [number, number]> = {
  beedrill_mega: [100, 20],
  pidgeot_mega: [100, 20],
  houndoom_mega: [100, 20],
  banette_mega: [100, 20],
  sableye_mega: [100, 20],

  venusaur_mega: [200, 40],
  charizard_mega_x: [200, 40],
  charizard_mega_y: [200, 40],
  blastoise_mega: [200, 40],
  alakazam_mega: [200, 40],
  slowbro_mega: [200, 40],
  gengar_mega: [200, 40],
  kangaskhan_mega: [200, 40],
  pinsir_mega: [200, 40],
  gyarados_mega: [200, 40],
  aerodactyl_mega: [200, 40],
  ampharos_mega: [200, 40],
  steelix_mega: [200, 40],
  scizor_mega: [200, 40],
  heracross_mega: [200, 40],
  sceptile_mega: [200, 40],
  blaziken_mega: [200, 40],
  swampert_mega: [200, 40],
  gardevoir_mega: [200, 40],
  mawile_mega: [200, 40],
  aggron_mega: [200, 40],
  medicham_mega: [200, 40],
  manectric_mega: [200, 40],
  sharpedo_mega: [200, 40],
  camerupt_mega: [200, 40],
  altaria_mega: [200, 40],
  absol_mega: [200, 40],
  glalie_mega: [200, 40],
  abomasnow_mega: [200, 40],
  gallade_mega: [200, 40],
  lopunny_mega: [200, 40],
  audino_mega: [200, 40],
  lucario_mega: [200, 40],
  metagross_mega: [200, 40],

  tyranitar_mega: [300, 60],
  salamence_mega: [300, 60],
  garchomp_mega: [300, 60],
  latios_mega: [300, 60],
  latias_mega: [300, 60],
  diancie_mega: [300, 60],

  rayquaza_mega: [400, 80],
  kyogre_primal: [400, 80],
  groudon_primal: [400, 80],
  mewtwo_mega_x: [400, 80],
  mewtwo_mega_y: [400, 80],
};

export const POKEBASE_MEGA_TIERS: Record<string, MegaTier> = {
  // S tier: Absolute best in class
  charizard_mega_y: 'S',
  gengar_mega: 'S',
  mewtwo_mega_x: 'S',
  mewtwo_mega_y: 'S',
  blaziken_mega: 'S',
  kyogre_primal: 'S',
  groudon_primal: 'S',
  rayquaza_mega: 'S',
  lucario_mega: 'S',
  diancie_mega: 'S',
  metagross_mega: 'S',

  // A+ tier: Top tier powerhouses
  tyranitar_mega: 'A+',
  sceptile_mega: 'A+',
  gardevoir_mega: 'A+',
  absol_mega: 'A+',
  garchomp_mega: 'A+',
  swampert_mega: 'A+',
  salamence_mega: 'A+',

  // A tier: Highly competitive raid attackers
  venusaur_mega: 'A',
  beedrill_mega: 'A',
  alakazam_mega: 'A',
  aerodactyl_mega: 'A',
  heracross_mega: 'A',
  houndoom_mega: 'A',
  banette_mega: 'A',
  glalie_mega: 'A',
  latios_mega: 'A',
  abomasnow_mega: 'A',
  gallade_mega: 'A',

  // B+ tier: Solid budget / versatile dual type
  charizard_mega_x: 'B+',
  blastoise_mega: 'B+',
  pidgeot_mega: 'B+',
  pinsir_mega: 'B+',
  gyarados_mega: 'B+',
  ampharos_mega: 'B+',
  scizor_mega: 'B+',
  manectric_mega: 'B+',
  latias_mega: 'B+',
  lopunny_mega: 'B+',

  // B tier: Bulk / niche coverage
  aggron_mega: 'B',
  camerupt_mega: 'B',

  // C tier: Defensive / candy boost only
  slowbro_mega: 'C',
  kangaskhan_mega: 'C',
  steelix_mega: 'C',
  sableye_mega: 'C',
  mawile_mega: 'C',
  medicham_mega: 'C',
  sharpedo_mega: 'C',
  altaria_mega: 'C',
  audino_mega: 'C',
};

const TIER_ORDER: Record<MegaTier, number> = {
  S: 6,
  'A+': 5,
  A: 4,
  'B+': 3,
  B: 2,
  C: 1,
};

export function getPokebaseMegaTier(sid?: string | null): MegaTier | null {
  if (!sid) return null;
  const s = sid.toLowerCase();
  if (!GAME_MASTER_MEGA_SIDS.has(s)) return null;
  return POKEBASE_MEGA_TIERS[s] || null;
}

export function megaTierScore(tier?: MegaTier | null): number {
  return tier ? TIER_ORDER[tier] || 0 : 0;
}

export interface CuratedMegaOption {
  sid: string;
  name: string;
  energy: number;
  costTier: 'expensive' | 'cheap';
  costLabel: string;
  roleNote: string;
  highlightMove?: string;
  isPrimal?: boolean;
  pokebaseTier?: MegaTier | null;
}

export interface CuratedMegaTypeEntry {
  type: string;
  icon: string;
  displayName: string;
  expensive: CuratedMegaOption;
  cheap: CuratedMegaOption;
  alternatives?: CuratedMegaOption[];
}

export type MegaSpecimenStatus =
  | 'no_specimen'
  | 'suitable_base'
  | 'needs_evolution'
  | 'needs_first_mega'
  | 'mega_unlocked'
  | 'mega_active';

export interface CuratedMegaSpecimenBrief {
  id: string;
  name: string;
  cp: number;
  iv: string;
  iv_pct: number;
  mega_level: number;
  has_unlocked: boolean;
  verdict: string;
  is_pre_evo: boolean;
  role?: string;
  specimen_status: MegaSpecimenStatus;
}

export interface CuratedMegaOptionStatus extends CuratedMegaOption {
  owned: boolean;
  unlocked: boolean;
  specimen_status: MegaSpecimenStatus;
  bestSpecimen: CuratedMegaSpecimenBrief | null;
  fallbackActive?: boolean;
}

export interface CuratedMegaTypeRow {
  type: string;
  icon: string;
  displayName: string;
  covered: boolean;
  expensive: CuratedMegaOptionStatus;
  cheap: CuratedMegaOptionStatus;
  alternatives: CuratedMegaOptionStatus[];
}

export const CURATED_MEGA_ROSTER: Record<string, CuratedMegaTypeEntry> = {
  bug: {
    type: 'bug',
    icon: '🐛',
    displayName: 'Bug',
    expensive: {
      sid: 'heracross_mega',
      name: 'Mega Heracross',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Megahorn',
      highlightMove: 'Megahorn / Close Combat',
      roleNote: 'Top-tier dual Bug/Fighting powerhouse with massive attack stats.',
    },
    cheap: {
      sid: 'beedrill_mega',
      name: 'Mega Beedrill',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Cheapest in game)',
      highlightMove: 'X-Scissor',
      roleNote: 'The cheapest Mega in the game (100 energy to first evolve), making it an excellent budget entry point.',
    },
    alternatives: [
      {
        sid: 'pinsir_mega',
        name: 'Mega Pinsir',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'X-Scissor',
        roleNote: 'Aggressive pure Bug attacker alternative.',
      },
      {
        sid: 'scizor_mega',
        name: 'Mega Scizor',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'X-Scissor',
        roleNote: 'Accessible dual Bug/Steel defensive hybrid booster.',
      },
    ],
  },
  dark: {
    type: 'dark',
    icon: '🌑',
    displayName: 'Dark',
    expensive: {
      sid: 'tyranitar_mega',
      name: 'Mega Tyranitar',
      energy: 300,
      costTier: 'expensive',
      costLabel: '300 Energy · Brutal Swing',
      highlightMove: 'Brutal Swing',
      roleNote: 'Premier Dark/Rock tankiness with top-tier Brutal Swing DPS.',
    },
    cheap: {
      sid: 'houndoom_mega',
      name: 'Mega Houndoom',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Budget)',
      highlightMove: 'Foul Play',
      roleNote: 'Its first evolution is notably cheap at only 100 Mega Energy, providing accessible Dark DPS.',
    },
    alternatives: [
      {
        sid: 'gyarados_mega',
        name: 'Mega Gyarados',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy · Crunch',
        highlightMove: 'Bite / Crunch',
        roleNote: 'Bulky Water/Dark booster that shreds Psychic and Ghost bosses.',
      },
      {
        sid: 'absol_mega',
        name: 'Mega Absol',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Dark Pulse / Payback',
        roleNote: 'Pure Dark glass-cannon raid attacker.',
      },
    ],
  },
  dragon: {
    type: 'dragon',
    icon: '🐉',
    displayName: 'Dragon',
    expensive: {
      sid: 'rayquaza_mega',
      name: 'Mega Rayquaza',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Energy · Meteorite Required',
      highlightMove: 'Breaking Swipe / Outrage',
      roleNote: 'The undisputed #1 overall attacker in Pokémon GO.',
    },
    cheap: {
      sid: 'salamence_mega',
      name: 'Mega Salamence',
      energy: 300,
      costTier: 'cheap',
      costLabel: '300 Energy',
      highlightMove: 'Outrage',
      roleNote: 'High DPS Dragon and Flying attacker with excellent raid accessibility.',
    },
    alternatives: [
      {
        sid: 'garchomp_mega',
        name: 'Mega Garchomp',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Outrage / Earth Power',
        roleNote: 'Dual Dragon/Ground powerhouse with massive bulk.',
      },
      {
        sid: 'latios_mega',
        name: 'Mega Latios',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Dragon Claw',
        roleNote: 'Fast Dragon/Psychic hybrid attacker.',
      },
      {
        sid: 'charizard_mega_x',
        name: 'Mega Charizard X',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Dragon Claw',
        roleNote: 'Budget 200-energy Fire/Dragon hybrid booster.',
      },
    ],
  },
  electric: {
    type: 'electric',
    icon: '⚡',
    displayName: 'Electric',
    expensive: {
      sid: 'manectric_mega',
      name: 'Mega Manectric',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Wild Charge',
      highlightMove: 'Charge Beam / Wild Charge',
      roleNote: 'The highest pure Electric raid DPS Mega in Pokémon GO.',
    },
    cheap: {
      sid: 'ampharos_mega',
      name: 'Mega Ampharos',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Volt Switch / Zap Cannon',
      roleNote: 'Budget-friendly option at 200 energy, useful for boosting Electric & Dragon-type candy.',
    },
    alternatives: [
      {
        sid: 'charizard_mega_x',
        name: 'Mega Charizard X',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Dragon Breath',
        roleNote: 'Dual utility booster.',
      },
    ],
  },
  fairy: {
    type: 'fairy',
    icon: '🧚',
    displayName: 'Fairy',
    expensive: {
      sid: 'gardevoir_mega',
      name: 'Mega Gardevoir',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Premier Fairy DPS',
      highlightMove: 'Charm / Dazzling Gleam',
      roleNote: 'The premier Fairy attacker and dual Psychic booster with unmatched Fairy raid DPS.',
    },
    cheap: {
      sid: 'altaria_mega',
      name: 'Mega Altaria',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Dazzling Gleam',
      roleNote: 'Accessible dual Dragon/Fairy type candy booster.',
    },
    alternatives: [
      {
        sid: 'diancie_mega',
        name: 'Mega Diancie',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy · Mythical',
        highlightMove: 'Moonblast / Rock Slide',
        roleNote: 'Mythical Rock/Fairy with supreme offensive firepower.',
      },
      {
        sid: 'mawile_mega',
        name: 'Mega Mawile',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Play Rough',
        roleNote: 'Dual Steel/Fairy defensive booster.',
      },
    ],
  },
  fighting: {
    type: 'fighting',
    icon: '🥊',
    displayName: 'Fighting',
    expensive: {
      sid: 'lucario_mega',
      name: 'Mega Lucario',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Force Palm',
      highlightMove: 'Force Palm / Aura Sphere',
      roleNote: 'Top-tier Fighting/Steel attacker with premier Force Palm & Aura Sphere DPS.',
    },
    cheap: {
      sid: 'blaziken_mega',
      name: 'Mega Blaziken',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Counter / Focus Blast',
      roleNote: 'Tremendous dual Fire/Fighting damage output at 200 energy.',
    },
    alternatives: [
      {
        sid: 'heracross_mega',
        name: 'Mega Heracross',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Counter / Close Combat',
        roleNote: 'Heavy-hitting dual Bug/Fighting alternative.',
      },
      {
        sid: 'lopunny_mega',
        name: 'Mega Lopunny',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Double Kick / Focus Blast',
        roleNote: 'Normal/Fighting dual candy booster.',
      },
    ],
  },
  fire: {
    type: 'fire',
    icon: '🔥',
    displayName: 'Fire',
    expensive: {
      sid: 'charizard_mega_y',
      name: 'Mega Charizard Y',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Blast Burn',
      highlightMove: 'Fire Spin / Blast Burn',
      roleNote: 'Supreme Fire DPS and dual Flying candy utility.',
    },
    cheap: {
      sid: 'houndoom_mega',
      name: 'Mega Houndoom',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Cheapest Fire)',
      highlightMove: 'Fire Fang / Flamethrower',
      roleNote: 'The cheapest Fire Mega at only 100 energy, providing fast access to Fire boosts.',
    },
    alternatives: [
      {
        sid: 'blaziken_mega',
        name: 'Mega Blaziken',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Fire Spin / Blast Burn',
        roleNote: 'Dual Fire/Fighting high-DPS raid starter.',
      },
      {
        sid: 'groudon_primal',
        name: 'Primal Groudon',
        energy: 400,
        costTier: 'expensive',
        costLabel: '400 Primal Energy',
        isPrimal: true,
        highlightMove: 'Fire Punch / Precipice Blades',
        roleNote: 'Permanent sunny weather boost for Fire and Ground raids.',
      },
    ],
  },
  flying: {
    type: 'flying',
    icon: '🦅',
    displayName: 'Flying',
    expensive: {
      sid: 'rayquaza_mega',
      name: 'Mega Rayquaza',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Energy · Dragon Ascent',
      highlightMove: 'Dragon Ascent',
      roleNote: 'Undisputed #1 Flying attacker in the entire game with signature Dragon Ascent.',
    },
    cheap: {
      sid: 'pidgeot_mega',
      name: 'Mega Pidgeot',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Cheapest Flying)',
      highlightMove: 'Gust / Brave Bird',
      roleNote: 'Costs only 100 energy and provides Flying-type & Normal-type candy boosting.',
    },
    alternatives: [
      {
        sid: 'charizard_mega_y',
        name: 'Mega Charizard Y',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Air Slash / Blast Burn',
        roleNote: 'Dual Fire/Flying powerhouse booster.',
      },
      {
        sid: 'aerodactyl_mega',
        name: 'Mega Aerodactyl',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Rock Throw / Ancient Power',
        roleNote: 'Dual Rock/Flying accessible booster.',
      },
      {
        sid: 'salamence_mega',
        name: 'Mega Salamence',
        energy: 300,
        costTier: 'cheap',
        costLabel: '300 Energy',
        highlightMove: 'Fly',
        roleNote: 'High Flying DPS alternative.',
      },
    ],
  },
  ghost: {
    type: 'ghost',
    icon: '👻',
    displayName: 'Ghost',
    expensive: {
      sid: 'gengar_mega',
      name: 'Mega Gengar',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Supreme Ghost DPS',
      highlightMove: 'Shadow Claw / Shadow Ball',
      roleNote: 'Tremendous damage output making it one of the absolute best Ghost attackers available.',
    },
    cheap: {
      sid: 'banette_mega',
      name: 'Mega Banette',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Budget)',
      highlightMove: 'Shadow Claw / Shadow Ball',
      roleNote: 'A-tier 100-energy Ghost budget booster.',
    },
    alternatives: [
      {
        sid: 'sableye_mega',
        name: 'Mega Sableye',
        energy: 100,
        costTier: 'cheap',
        costLabel: '100 Energy',
        highlightMove: 'Shadow Sneak',
        roleNote: 'Dual Ghost/Dark candy booster.',
      },
    ],
  },
  grass: {
    type: 'grass',
    icon: '🌿',
    displayName: 'Grass',
    expensive: {
      sid: 'sceptile_mega',
      name: 'Mega Sceptile',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Blistering DPS',
      highlightMove: 'Bullet Seed / Frenzy Plant',
      roleNote: '#1 Grass raid attacker with unmatched Frenzy Plant cycle speed.',
    },
    cheap: {
      sid: 'venusaur_mega',
      name: 'Mega Venusaur',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy · Bulky',
      highlightMove: 'Vine Whip / Frenzy Plant',
      roleNote: 'A-tier classic for Grass & Poison boosting with exceptional defensive bulk.',
    },
    alternatives: [
      {
        sid: 'abomasnow_mega',
        name: 'Mega Abomasnow',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Razor Leaf / Energy Ball',
        roleNote: 'Dual Grass/Ice raid attacker and candy booster.',
      },
    ],
  },
  ground: {
    type: 'ground',
    icon: '🟤',
    displayName: 'Ground',
    expensive: {
      sid: 'groudon_primal',
      name: 'Primal Groudon',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Primal Energy',
      isPrimal: true,
      highlightMove: 'Mud Shot / Precipice Blades',
      roleNote: 'Undisputed #1 Ground titan with permanent Sunny weather boost.',
    },
    cheap: {
      sid: 'swampert_mega',
      name: 'Mega Swampert',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Mud Shot / Earthquake',
      roleNote: 'Excellent Water/Ground dual raid coverage at an accessible 200 energy cost.',
    },
    alternatives: [
      {
        sid: 'garchomp_mega',
        name: 'Mega Garchomp',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Mud Shot / Earth Power',
        roleNote: 'Massive bulk and top-tier Ground offensive firepower.',
      },
      {
        sid: 'steelix_mega',
        name: 'Mega Steelix',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Earthquake',
        roleNote: 'Defensive Ground/Steel booster.',
      },
    ],
  },
  ice: {
    type: 'ice',
    icon: '🧊',
    displayName: 'Ice',
    expensive: {
      sid: 'abomasnow_mega',
      name: 'Mega Abomasnow',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Weather Ball',
      highlightMove: 'Powder Snow / Weather Ball Ice',
      roleNote: 'Dedicated Ice attacker with rapid Weather Ball pacing and dual Grass boost.',
    },
    cheap: {
      sid: 'glalie_mega',
      name: 'Mega Glalie',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy · Avalanche',
      highlightMove: 'Frost Breath / Avalanche',
      roleNote: 'Accessible pure Ice Mega providing strong Ice candy and damage boosting.',
    },
    alternatives: [],
  },
  normal: {
    type: 'normal',
    icon: '⚪',
    displayName: 'Normal',
    expensive: {
      sid: 'kangaskhan_mega',
      name: 'Mega Kangaskhan',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy',
      highlightMove: 'Mud-Slap / Outrage',
      roleNote: 'Accessible Normal-type candy booster.',
    },
    cheap: {
      sid: 'pidgeot_mega',
      name: 'Mega Pidgeot',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Cheapest)',
      highlightMove: 'Gust / Brave Bird',
      roleNote: 'Costs only 100 energy and provides Flying-type & Normal-type candy boosting.',
    },
    alternatives: [
      {
        sid: 'lopunny_mega',
        name: 'Mega Lopunny',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Pound / Hyper Beam',
        roleNote: 'Normal/Fighting dual candy booster.',
      },
      {
        sid: 'audino_mega',
        name: 'Mega Audino',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Dazzling Gleam',
        roleNote: 'Normal/Fairy dual candy booster.',
      },
    ],
  },
  poison: {
    type: 'poison',
    icon: '☠️',
    displayName: 'Poison',
    expensive: {
      sid: 'gengar_mega',
      name: 'Mega Gengar',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Sludge Bomb',
      highlightMove: 'Hex / Sludge Bomb',
      roleNote: '#1 Poison raid attacker in the game, shredding Fairy & Grass bosses.',
    },
    cheap: {
      sid: 'beedrill_mega',
      name: 'Mega Beedrill',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Cheapest)',
      highlightMove: 'Poison Jab / Sludge Bomb',
      roleNote: 'At 100 energy, a very cheap way to boost Poison candy and hit Fairy types.',
    },
    alternatives: [
      {
        sid: 'venusaur_mega',
        name: 'Mega Venusaur',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Sludge Bomb',
        roleNote: 'Bulky dual Grass/Poison candy booster.',
      },
    ],
  },
  psychic: {
    type: 'psychic',
    icon: '🧠',
    displayName: 'Psychic',
    expensive: {
      sid: 'latios_mega',
      name: 'Mega Latios',
      energy: 300,
      costTier: 'expensive',
      costLabel: '300 Energy · Luster Purge',
      highlightMove: 'Zen Headbutt / Psychic (or Luster Purge)',
      roleNote: 'Heavy hitting Dragon/Psychic raid attacker.',
    },
    cheap: {
      sid: 'alakazam_mega',
      name: 'Mega Alakazam',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Confusion / Psychic',
      roleNote: 'Traditional, high-DPS Psychic option at 200 energy.',
    },
    alternatives: [
      {
        sid: 'gardevoir_mega',
        name: 'Mega Gardevoir',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Confusion / Psychic',
        roleNote: 'Dual Psychic/Fairy booster.',
      },
      {
        sid: 'slowbro_mega',
        name: 'Mega Slowbro',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Psychic',
        roleNote: 'Water/Psychic defensive booster.',
      },
      {
        sid: 'latias_mega',
        name: 'Mega Latias',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Mist Ball',
        roleNote: 'Bulky Dragon/Psychic booster.',
      },
    ],
  },
  rock: {
    type: 'rock',
    icon: '🪨',
    displayName: 'Rock',
    expensive: {
      sid: 'tyranitar_mega',
      name: 'Mega Tyranitar',
      energy: 300,
      costTier: 'expensive',
      costLabel: '300 Energy · Smack Down',
      highlightMove: 'Smack Down / Stone Edge',
      roleNote: 'Top-tier Rock attacker with tremendous bulk and offensive output.',
    },
    cheap: {
      sid: 'aerodactyl_mega',
      name: 'Mega Aerodactyl',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Rock Throw / Rock Slide',
      roleNote: 'A 200-energy accessible option for Rock-type damage and Flying-type boost.',
    },
    alternatives: [
      {
        sid: 'diancie_mega',
        name: 'Mega Diancie',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Rock Throw / Rock Slide',
        roleNote: 'Highest pure Rock DPS in the game.',
      },
      {
        sid: 'aggron_mega',
        name: 'Mega Aggron',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Smack Down / Meteor Beam',
        roleNote: 'Bulky alternative booster.',
      },
    ],
  },
  steel: {
    type: 'steel',
    icon: '⚙️',
    displayName: 'Steel',
    expensive: {
      sid: 'metagross_mega',
      name: 'Mega Metagross',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Meteor Mash',
      highlightMove: 'Bullet Punch / Meteor Mash',
      roleNote: 'Supreme Steel attacker with massive attack and bulk.',
    },
    cheap: {
      sid: 'scizor_mega',
      name: 'Mega Scizor',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Bullet Punch / Iron Head',
      roleNote: 'Dual Bug/Steel accessible option for Steel boosting.',
    },
    alternatives: [
      {
        sid: 'lucario_mega',
        name: 'Mega Lucario',
        energy: 200,
        costTier: 'expensive',
        costLabel: '200 Energy · Flash Cannon',
        highlightMove: 'Flash Cannon',
        roleNote: 'Steel/Fighting attacker.',
      },
      {
        sid: 'steelix_mega',
        name: 'Mega Steelix',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Heavy Slam',
        roleNote: 'Steel/Ground tanky support.',
      },
      {
        sid: 'aggron_mega',
        name: 'Mega Aggron',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Heavy Slam',
        roleNote: 'Pure Steel mega tank.',
      },
    ],
  },
  water: {
    type: 'water',
    icon: '💧',
    displayName: 'Water',
    expensive: {
      sid: 'kyogre_primal',
      name: 'Primal Kyogre',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Primal Energy',
      isPrimal: true,
      highlightMove: 'Waterfall / Origin Pulse',
      roleNote: 'Undisputed #1 Water titan with permanent Rainy weather boost.',
    },
    cheap: {
      sid: 'blastoise_mega',
      name: 'Mega Blastoise',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy · Hydro Cannon',
      highlightMove: 'Water Gun / Hydro Cannon',
      roleNote: 'Classic and reliable 200-energy Water-type booster with Hydro Cannon.',
    },
    alternatives: [
      {
        sid: 'swampert_mega',
        name: 'Mega Swampert',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Water Gun / Hydro Cannon',
        roleNote: 'Top-tier Water/Ground dual attacker with rapid Hydro Cannon spam.',
      },
      {
        sid: 'gyarados_mega',
        name: 'Mega Gyarados',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Waterfall / Hydro Pump',
        roleNote: 'Bulky Water/Dark booster.',
      },
      {
        sid: 'slowbro_mega',
        name: 'Mega Slowbro',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Water Gun / Water Pulse',
        roleNote: 'Water/Psychic support option.',
      },
    ],
  },
};

/**
 * Set of all curated Mega/Primal species identifiers and their base species.
 */
export const CURATED_MEGA_SIDS: Set<string> = new Set<string>();
export const CURATED_MEGA_BASE_SIDS: Set<string> = new Set<string>();

const addCuratedSid = (sid: string) => {
  const s = sid.toLowerCase();
  if (!GAME_MASTER_MEGA_SIDS.has(s)) return;
  CURATED_MEGA_SIDS.add(s);
  const base = s.replace(/_mega.*|_primal/, '');
  if (base) CURATED_MEGA_BASE_SIDS.add(base);
};

for (const entry of Object.values(CURATED_MEGA_ROSTER)) {
  entry.expensive.pokebaseTier = getPokebaseMegaTier(entry.expensive.sid);
  entry.cheap.pokebaseTier = getPokebaseMegaTier(entry.cheap.sid);
  addCuratedSid(entry.expensive.sid);
  addCuratedSid(entry.cheap.sid);

  for (const alt of entry.alternatives || []) {
    const tier = getPokebaseMegaTier(alt.sid);
    alt.pokebaseTier = tier;
    if (alt.isPrimal || tier === 'S' || tier === 'A+') {
      addCuratedSid(alt.sid);
    }
  }
}

// Automatically curate canonical Pokébase S-tier and A+-tier Megas/Primals
for (const [sid, tier] of Object.entries(POKEBASE_MEGA_TIERS)) {
  if (tier === 'S' || tier === 'A+') {
    addCuratedSid(sid);
  }
}

/**
 * Checks whether a given species ID or Mega SID is in the curated meta roster.
 */
export function isCuratedMega(sidOrMegaSid: string): boolean {
  if (!sidOrMegaSid) return false;
  const s = sidOrMegaSid.toLowerCase();
  if (CURATED_MEGA_SIDS.has(s)) return true;
  if (CURATED_MEGA_BASE_SIDS.has(s)) return true;
  return false;
}

/**
 * Resolves the active curated Mega SIDs for this specific user box.
 */
export function resolveActiveCuratedMegaSids(
  mons: MonModel[],
  dex: Dex,
  minIv: number,
  minAtk: number,
): Set<string> {
  const active = new Set<string>(CURATED_MEGA_SIDS);

  const hasEligibleOwned = (optSid: string): boolean =>
    mons.some((m) => {
      if (!monMatchesMegaSid(m, optSid, dex)) return false;
      if (m.has_mega_unlocked) return true;
      return !m.is_shadow && m.iv_pct >= minIv && m.a >= minAtk;
    });

  for (const entry of Object.values(CURATED_MEGA_ROSTER)) {
    const expOk = hasEligibleOwned(entry.expensive.sid);
    const cheapOk = hasEligibleOwned(entry.cheap.sid);
    if (!expOk || !cheapOk) {
      const sortedAlts = [...(entry.alternatives || [])].sort(
        (a, b) =>
          megaTierScore(getPokebaseMegaTier(b.sid)) -
            megaTierScore(getPokebaseMegaTier(a.sid)) || a.energy - b.energy,
      );
      const bestOwnedAlt = sortedAlts.find((alt) => hasEligibleOwned(alt.sid));
      if (bestOwnedAlt) {
        active.add(bestOwnedAlt.sid.toLowerCase());
      }
    }
  }

  return active;
}

/**
 * Look up curated meta info for a Mega SID and optional type.
 */
export function getCuratedMegaInfo(
  megaSid: string,
  atype?: string,
): CuratedMegaOption | null {
  if (!megaSid) return null;
  const ms = megaSid.toLowerCase();
  if (!GAME_MASTER_MEGA_SIDS.has(ms)) return null;
  const tier = getPokebaseMegaTier(ms);

  // If type is provided, check that type first
  if (atype && CURATED_MEGA_ROSTER[atype.toLowerCase()]) {
    const entry = CURATED_MEGA_ROSTER[atype.toLowerCase()];
    if (entry.expensive.sid === ms) return { ...entry.expensive, pokebaseTier: tier };
    if (entry.cheap.sid === ms) return { ...entry.cheap, pokebaseTier: tier };
    for (const alt of entry.alternatives || []) {
      if (alt.sid === ms) return { ...alt, pokebaseTier: tier };
    }
  }

  // Fallback: search all types
  for (const entry of Object.values(CURATED_MEGA_ROSTER)) {
    if (entry.expensive.sid === ms) return { ...entry.expensive, pokebaseTier: tier };
    if (entry.cheap.sid === ms) return { ...entry.cheap, pokebaseTier: tier };
    for (const alt of entry.alternatives || []) {
      if (alt.sid === ms) return { ...alt, pokebaseTier: tier };
    }
  }

  if (tier) {
    const prettyName = ms
      .replace(/_mega_([xyz])$/, ' Mega $1')
      .replace(/_mega$/, '')
      .replace(/_primal$/, '')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const prefix = ms.endsWith('_primal') ? 'Primal ' : 'Mega ';
    return {
      sid: ms,
      name: prettyName.includes('Mega') ? prettyName : `${prefix}${prettyName}`,
      energy: (MEGA_ENERGY_COSTS[ms] || [200, 40])[0],
      costTier: tier === 'S' ? 'expensive' : 'cheap',
      costLabel: `Pokébase ${tier} Tier`,
      roleNote: `Ranked ${tier} Tier on the Pokébase Mega Tier List for top-end raid damage and candy boosting.`,
      isPrimal: ms.endsWith('_primal'),
      pokebaseTier: tier,
    };
  }

  return null;
}

export function monMatchesMegaSid(m: MonModel, optSid: string, dex: Dex): boolean {
  const cleanOpt = optSid.toLowerCase();
  // Ensure optSid is a genuine Game Master Mega form
  if (!GAME_MASTER_MEGA_SIDS.has(cleanOpt)) return false;

  const baseSid = cleanOpt.replace(/_mega.*|_primal/, '');
  const spId = m.species?.speciesId || '';
  const mSid = m.mega_sid || '';

  // Direct match on mega_sid or final base species
  if (mSid === cleanOpt || spId === baseSid || spId === cleanOpt) return true;

  // Family descendant/evolution match: only if optSid is in family's mega info
  const famMegas = dex.familyMegaInfo(spId);
  return famMegas.includes(cleanOpt);
}

/**
 * Resolves ownership and builds status for the curated roster across user's inventory.
 */
export function buildCuratedMegaStatus(mons: MonModel[], dex: Dex): CuratedMegaTypeRow[] {
  const rows: CuratedMegaTypeRow[] = [];

  const resolveOptionStatus = (opt: CuratedMegaOption): CuratedMegaOptionStatus => {
    const cleanOptSid = opt.sid.toLowerCase();
    const baseSid = cleanOptSid.replace(/_mega.*|_primal/, '');
    const pokebaseTier = opt.pokebaseTier ?? getPokebaseMegaTier(cleanOptSid);
    const matches: MonModel[] = [];

    for (const m of mons) {
      if (m.is_shadow) continue;
      // Do not count specimens queued for TRANSFER, TRADE, or in REVIEW as retained Mega ownership
      if (m.verdict === 'TRANSFER' || m.verdict === 'TRADE' || m.verdict === 'REVIEW') continue;

      if (monMatchesMegaSid(m, cleanOptSid, dex)) {
        matches.push(m);
      }
    }

    if (matches.length === 0) {
      return {
        ...opt,
        pokebaseTier,
        owned: false,
        unlocked: false,
        specimen_status: 'no_specimen',
        bestSpecimen: null,
      };
    }

    // Sort: unlocked first, then active mega, then mega_level, then iv_pct, then level, then cp
    matches.sort((a, b) => {
      const aUn = a.has_mega_unlocked ? 1 : 0;
      const bUn = b.has_mega_unlocked ? 1 : 0;
      const aAct = a.is_currently_mega ? 1 : 0;
      const bAct = b.is_currently_mega ? 1 : 0;
      return (
        bUn - aUn ||
        bAct - aAct ||
        b.mega_level - a.mega_level ||
        b.iv_pct - a.iv_pct ||
        b.level - a.level ||
        b.cp - a.cp
      );
    });

    const best = matches[0];
    const isFinalStage = best.species?.speciesId === baseSid || best.has_mega_unlocked;
    const isPreEvo = !isFinalStage;

    let specimenStatus: MegaSpecimenStatus;
    if (best.is_currently_mega) {
      specimenStatus = 'mega_active';
    } else if (best.has_mega_unlocked) {
      specimenStatus = 'mega_unlocked';
    } else if (isPreEvo) {
      specimenStatus = 'needs_evolution';
    } else if (best.iv_pct >= 80) {
      specimenStatus = 'needs_first_mega';
    } else {
      specimenStatus = 'suitable_base';
    }

    const brief: CuratedMegaSpecimenBrief = {
      id: best.uid,
      name: cleanSpeciesName(best.species?.speciesName || String(best.dex)),
      cp: best.cp,
      iv: ivStr(best),
      iv_pct: best.iv_pct,
      mega_level: Math.max(best.has_mega_unlocked ? 1 : 0, best.mega_level),
      has_unlocked: best.has_mega_unlocked,
      verdict: best.verdict,
      is_pre_evo: isPreEvo,
      role: best.role,
      specimen_status: specimenStatus,
    };

    return {
      ...opt,
      pokebaseTier,
      owned: true,
      unlocked: best.has_mega_unlocked,
      specimen_status: specimenStatus,
      bestSpecimen: brief,
    };
  };

  for (const entry of Object.values(CURATED_MEGA_ROSTER)) {
    const exp = resolveOptionStatus(entry.expensive);
    const cheap = resolveOptionStatus(entry.cheap);
    const alts = (entry.alternatives || [])
      .map(resolveOptionStatus)
      .sort(
        (a, b) =>
          megaTierScore(b.pokebaseTier) - megaTierScore(a.pokebaseTier) ||
          a.energy - b.energy,
      );

    if (!exp.owned || !cheap.owned) {
      const bestFallback = alts.find((a) => a.owned);
      if (bestFallback) {
        bestFallback.fallbackActive = true;
      }
    }

    // Only count as covered if an UNLOCKED Mega is owned (never an un-unlocked candidate)
    const covered = exp.unlocked || cheap.unlocked || alts.some((a) => a.unlocked);

    rows.push({
      type: entry.type,
      icon: entry.icon,
      displayName: entry.displayName,
      covered,
      expensive: exp,
      cheap,
      alternatives: alts,
    });
  }

  return rows;
}
