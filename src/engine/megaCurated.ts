import { MonModel } from './types';
import { assessMegaForm, megaBaseSid, MEGA_INVEST_ORDER, SLOT_STATUSES, type MegaStatus } from './megaStatus';
import { Dex } from './pveModel';
import { cleanSpeciesName } from './defaultConfig';
import { ivStr } from './pgsParser';

export type MegaTier = 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C';

export const POKEBASE_MEGA_TIERS: Record<string, MegaTier> = {
  // S tier (21)
  charizard_mega_y: 'S',
  gengar_mega: 'S',
  mewtwo_mega_x: 'S',
  mewtwo_mega_y: 'S',
  blaziken_mega: 'S',
  absol_mega_z: 'S',
  kyogre_primal: 'S',
  groudon_primal: 'S',
  rayquaza_mega: 'S',
  lucario_mega: 'S',
  lucario_mega_z: 'S',
  heatran_mega: 'S',
  chandelure_mega: 'S',
  chesnaught_mega: 'S',
  delphox_mega: 'S',
  greninja_mega: 'S',
  floette_eternal_mega: 'S',
  zygarde_mega: 'S',
  diancie_mega: 'S',
  zeraora_mega: 'S',
  baxcalibur_mega: 'S',
  // A+ tier (10)
  starmie_mega: 'A+',
  meganium_mega: 'A+',
  tyranitar_mega: 'A+',
  sceptile_mega: 'A+',
  gardevoir_mega: 'A+',
  absol_mega: 'A+',
  metagross_mega: 'A+',
  garchomp_mega: 'A+',
  excadrill_mega: 'A+',
  glimmora_mega: 'A+',
  // A tier (24)
  venusaur_mega: 'A',
  beedrill_mega: 'A',
  raichu_mega_y: 'A',
  alakazam_mega: 'A',
  aerodactyl_mega: 'A',
  dragonite_mega: 'A',
  feraligatr_mega: 'A',
  heracross_mega: 'A',
  houndoom_mega: 'A',
  swampert_mega: 'A',
  banette_mega: 'A',
  glalie_mega: 'A',
  salamence_mega: 'A',
  latios_mega: 'A',
  staraptor_mega: 'A',
  abomasnow_mega: 'A',
  gallade_mega: 'A',
  froslass_mega: 'A',
  darkrai_mega: 'A',
  emboar_mega: 'A',
  eelektross_mega: 'A',
  magearna_mega: 'A',
  falinks_mega: 'A',
  scovillain_mega: 'A',
  // B+ tier (18)
  charizard_mega_x: 'B+',
  blastoise_mega: 'B+',
  pidgeot_mega: 'B+',
  raichu_mega_x: 'B+',
  victreebel_mega: 'B+',
  pinsir_mega: 'B+',
  gyarados_mega: 'B+',
  ampharos_mega: 'B+',
  scizor_mega: 'B+',
  skarmory_mega: 'B+',
  manectric_mega: 'B+',
  latias_mega: 'B+',
  lopunny_mega: 'B+',
  garchomp_mega_z: 'B+',
  golurk_mega: 'B+',
  meowstic_mega: 'B+',
  hawlucha_mega: 'B+',
  golisopod_mega: 'B+',
  // B tier (8)
  aggron_mega: 'B',
  camerupt_mega: 'B',
  scolipede_mega: 'B',
  pyroar_mega: 'B',
  barbaracle_mega: 'B',
  dragalge_mega: 'B',
  crabominable_mega: 'B',
  drampa_mega: 'B',
  // C tier (14)
  clefable_mega: 'C',
  slowbro_mega: 'C',
  kangaskhan_mega: 'C',
  steelix_mega: 'C',
  sableye_mega: 'C',
  mawile_mega: 'C',
  medicham_mega: 'C',
  sharpedo_mega: 'C',
  altaria_mega: 'C',
  chimecho_mega: 'C',
  audino_mega: 'C',
  scrafty_mega: 'C',
  malamar_mega: 'C',
  tatsugiri_mega: 'C',
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
  return POKEBASE_MEGA_TIERS[sid.toLowerCase()] || null;
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
}

export interface CuratedMegaOptionStatus extends CuratedMegaOption {
  /** Owns a Pokémon you are keeping that could become (or already is) this Mega. */
  owned: boolean;
  /** True ONLY when a retained specimen has really Mega Evolved into this exact form. */
  unlocked: boolean;
  /** The exact status of the best specimen for this form. */
  status: MegaStatus;
  /** False when the game master does not list this form: it is never recommended. */
  supported: boolean;
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
      sid: 'beedrill_mega',
      name: 'Mega Beedrill',
      energy: 100,
      costTier: 'expensive',
      costLabel: '100 Energy · Fell Stinger+',
      highlightMove: 'Fell Stinger+ / X-Scissor',
      roleNote: 'Currently the #1 Bug attacker with Fell Stinger+, though Bug types are rarely needed in legendary raids.',
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
        sid: 'heracross_mega',
        name: 'Mega Heracross',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        roleNote: 'A-tier dual Bug/Fighting powerhouse with Megahorn & Close Combat.',
      },
      {
        sid: 'scizor_mega',
        name: 'Mega Scizor',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        roleNote: 'Accessible dual Bug/Steel defensive hybrid booster.',
      },
      {
        sid: 'pinsir_mega',
        name: 'Mega Pinsir',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        roleNote: 'Aggressive pure Bug attacker alternative.',
      },
    ],
  },
  dark: {
    type: 'dark',
    icon: '🌑',
    displayName: 'Dark',
    expensive: {
      sid: 'houndoom_mega',
      name: 'Mega Houndoom',
      energy: 100,
      costTier: 'expensive',
      costLabel: '100 Energy · Dark Pulse+',
      highlightMove: 'Dark Pulse+',
      roleNote: 'Ranks as the #1 Dark attacker with Dark Pulse+, outperforming even Mega Tyranitar in raw offensive DPS.',
    },
    cheap: {
      sid: 'houndoom_mega',
      name: 'Mega Houndoom',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Budget)',
      highlightMove: 'Foul Play / Dark Pulse',
      roleNote: 'Its first evolution is notably cheap at only 100 Mega Energy.',
    },
    alternatives: [
      {
        sid: 'tyranitar_mega',
        name: 'Mega Tyranitar',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy · Brutal Swing',
        highlightMove: 'Brutal Swing',
        roleNote: 'A+ tier Dark/Rock tankiness with top-tier Brutal Swing DPS.',
      },
      {
        sid: 'absol_mega',
        name: 'Mega Absol',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Brutal Swing / Dark Pulse',
        roleNote: 'A+ tier pure Dark glass-cannon raid attacker.',
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
      highlightMove: 'Dragon Ascent / Breaking Swipe',
      roleNote: 'The undisputed #1 overall and Dragon attacker, but requires a Meteorite and a massive 400 energy investment.',
    },
    cheap: {
      sid: 'salamence_mega',
      name: 'Mega Salamence',
      energy: 300,
      costTier: 'cheap',
      costLabel: '300 Energy',
      highlightMove: 'Outrage',
      roleNote: 'A strong, more accessible substitute that performs exceptionally well as both a Dragon and Flying attacker.',
    },
    alternatives: [
      {
        sid: 'garchomp_mega',
        name: 'Mega Garchomp',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Outrage / Earth Power',
        roleNote: 'A+ tier dual Dragon/Ground powerhouse with massive raid bulk.',
      },
      {
        sid: 'dragonite_mega',
        name: 'Mega Dragonite',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Dragon Tail / Outrage',
        roleNote: 'A-tier Dragon/Flying generalist with strong bulk and candy utility.',
      },
    ],
  },
  electric: {
    type: 'electric',
    icon: '⚡',
    displayName: 'Electric',
    expensive: {
      sid: 'raichu_mega_y',
      name: 'Mega Raichu Y',
      energy: 300,
      costTier: 'expensive',
      costLabel: '300 Energy · High Investment',
      highlightMove: 'Volt Switch / Wild Charge',
      roleNote: 'Boasts top-tier Electric DPS, though it requires significant candy and stardust investment.',
    },
    cheap: {
      sid: 'ampharos_mega',
      name: 'Mega Ampharos',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Zap Cannon / Thunder Punch',
      roleNote: 'A budget-friendly option at 200 energy, useful for boosting Electric & Dragon-type candy.',
    },
    alternatives: [
      {
        sid: 'manectric_mega',
        name: 'Mega Manectric',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Wild Charge',
        roleNote: 'Strong pure Electric glass-cannon raid attacker.',
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
      costLabel: '200 Energy · Premier DPS',
      highlightMove: 'Dazzling Gleam',
      roleNote: 'The premier Fairy attacker and a strong Psychic option with unmatched Fairy raid DPS.',
    },
    cheap: {
      sid: 'gardevoir_mega',
      name: 'Mega Gardevoir',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Dazzling Gleam',
      roleNote: 'At 200 energy, relatively accessible for such a high-impact type booster.',
    },
    alternatives: [
      {
        sid: 'diancie_mega',
        name: 'Mega Diancie',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy · Mythical',
        highlightMove: 'Rock Slide / Moonblast',
        roleNote: 'Mythical Rock/Fairy with supreme offensive firepower.',
      },
    ],
  },
  fighting: {
    type: 'fighting',
    icon: '🥊',
    displayName: 'Fighting',
    expensive: {
      sid: 'mewtwo_mega_x',
      name: 'Mega Mewtwo X',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Energy · Rare Raid Legend',
      highlightMove: 'Dynamic Punch+',
      roleNote: 'The gold standard for Fighting raids with Dynamic Punch+, though Mewtwo energy is expensive and rare.',
    },
    cheap: {
      sid: 'blaziken_mega',
      name: 'Mega Blaziken',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Focus Blast / Counter',
      roleNote: 'A solid Fighting attacker that costs 200 energy to first evolve and hits incredibly hard.',
    },
    alternatives: [
      {
        sid: 'lucario_mega',
        name: 'Mega Lucario',
        energy: 200,
        costTier: 'expensive',
        costLabel: '200 Energy · Force Palm',
        highlightMove: 'Aura Sphere / Force Palm',
        roleNote: 'Top-tier Fighting/Steel attacker with Force Palm & Aura Sphere.',
      },
    ],
  },
  fire: {
    type: 'fire',
    icon: '🔥',
    displayName: 'Fire',
    expensive: {
      sid: 'delphox_mega',
      name: 'Mega Delphox',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Blast Burn',
      highlightMove: 'Fire Spin / Blast Burn',
      roleNote: 'Currently ranked as the top Fire attacker, surpassing other Fire Megas in raid DPS.',
    },
    cheap: {
      sid: 'houndoom_mega',
      name: 'Mega Houndoom (or Charizard)',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100–200 Energy',
      highlightMove: 'Flamethrower / Blast Burn',
      roleNote: 'Houndoom costs only 100 energy, while Charizard costs 200 but offers dual Fire/Flying utility.',
    },
    alternatives: [
      {
        sid: 'charizard_mega_y',
        name: 'Mega Charizard Y',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy · Blast Burn',
        highlightMove: 'Blast Burn',
        roleNote: 'Dual Fire/Flying raid powerhouse.',
      },
      {
        sid: 'blaziken_mega',
        name: 'Mega Blaziken',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Blast Burn',
        roleNote: 'Dual Fire/Fighting high-DPS raid starter.',
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
      costLabel: '200 Energy · Supreme DPS',
      highlightMove: 'Shadow Ball / Lick',
      roleNote: 'Despite being fragile, its damage output makes it one of the absolute best Ghost attackers available.',
    },
    cheap: {
      sid: 'gengar_mega',
      name: 'Mega Gengar',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Shadow Ball',
      roleNote: 'At 200 energy, it is a very reasonable investment for the damage it provides.',
    },
    alternatives: [
      {
        sid: 'chandelure_mega',
        name: 'Mega Chandelure',
        energy: 200,
        costTier: 'expensive',
        costLabel: '200 Energy · S-Tier',
        highlightMove: 'Shadow Ball / Overheat',
        roleNote: 'S-tier Ghost/Fire titan with top-end Shadow Ball DPS.',
      },
      {
        sid: 'banette_mega',
        name: 'Mega Banette',
        energy: 100,
        costTier: 'cheap',
        costLabel: '100 Energy',
        highlightMove: 'Shadow Claw / Shadow Ball',
        roleNote: 'A-tier 100-energy Ghost budget booster.',
      },
    ],
  },
  grass: {
    type: 'grass',
    icon: '🌿',
    displayName: 'Grass',
    expensive: {
      sid: 'victreebel_mega',
      name: 'Mega Victreebel',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · High Stats',
      highlightMove: 'Magical Leaf / Sludge Bomb',
      roleNote: 'A top-tier Grass and Poison attacker with high offensive stats.',
    },
    cheap: {
      sid: 'venusaur_mega',
      name: 'Mega Venusaur',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Frenzy Plant',
      roleNote: 'A-tier classic at 200 energy for Grass & Poison boosting with great defensive bulk.',
    },
    alternatives: [
      {
        sid: 'chesnaught_mega',
        name: 'Mega Chesnaught',
        energy: 200,
        costTier: 'expensive',
        costLabel: '200 Energy · S-Tier',
        highlightMove: 'Frenzy Plant',
        roleNote: 'S-tier Grass/Fighting powerhouse.',
      },
      {
        sid: 'sceptile_mega',
        name: 'Mega Sceptile',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy · A+ Tier',
        highlightMove: 'Frenzy Plant',
        roleNote: 'A+ tier dual Grass/Dragon attacker with blistering Frenzy Plant speed.',
      },
    ],
  },
  ground: {
    type: 'ground',
    icon: '🟤',
    displayName: 'Ground',
    expensive: {
      sid: 'garchomp_mega',
      name: 'Mega Garchomp',
      energy: 300,
      costTier: 'expensive',
      costLabel: '300 Energy · Earth Power',
      highlightMove: 'Earth Power',
      roleNote: 'A top-tier Dragon and Ground attacker for high-investment players with massive bulk.',
    },
    cheap: {
      sid: 'swampert_mega',
      name: 'Mega Swampert',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Earthquake / Hydro Cannon',
      roleNote: 'A solid Water/Ground option at 200 energy providing dual raid coverage.',
    },
    alternatives: [
      {
        sid: 'groudon_primal',
        name: 'Primal Groudon',
        energy: 400,
        costTier: 'expensive',
        costLabel: '400 Primal Energy',
        isPrimal: true,
        highlightMove: 'Precipice Blades',
        roleNote: 'Permanent sunny weather boost and undisputed #1 Ground titan.',
      },
    ],
  },
  ice: {
    type: 'ice',
    icon: '🧊',
    displayName: 'Ice',
    expensive: {
      sid: 'mewtwo_mega_y',
      name: 'Mega Mewtwo Y',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Energy · Coverage',
      highlightMove: 'Ice Beam',
      roleNote: 'While a Psychic type, its coverage moves make it a very strong Ice attacker in a pinch.',
    },
    cheap: {
      sid: 'glalie_mega',
      name: 'Mega Glalie',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Avalanche',
      roleNote: 'A dedicated Ice-type Mega that is more accessible than top-tier generalists.',
    },
    alternatives: [
      {
        sid: 'abomasnow_mega',
        name: 'Mega Abomasnow',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy · A-Tier',
        highlightMove: 'Weather Ball Ice',
        roleNote: 'A-tier dual Grass/Ice Mega — matches Mega Glalie tier and boosts Ice & Grass candy.',
      },
    ],
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
      costLabel: '200 Energy · Regional Raid',
      highlightMove: 'Body Slam',
      roleNote: 'A rare and costly option, but useful for Normal-type candy boosting.',
    },
    cheap: {
      sid: 'pidgeot_mega',
      name: 'Mega Pidgeot',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy (Cheapest)',
      highlightMove: 'Brave Bird',
      roleNote: 'Costs only 100 energy and provides Flying-type coverage as a bonus.',
    },
  },
  poison: {
    type: 'poison',
    icon: '☠️',
    displayName: 'Poison',
    expensive: {
      sid: 'victreebel_mega',
      name: 'Mega Victreebel',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Sludge Bomb',
      highlightMove: 'Sludge Bomb',
      roleNote: 'Currently the #1 Poison attacker alongside its Grass role, shredding Fairy & Grass raid bosses.',
    },
    cheap: {
      sid: 'beedrill_mega',
      name: 'Mega Beedrill',
      energy: 100,
      costTier: 'cheap',
      costLabel: '100 Energy',
      highlightMove: 'Sludge Bomb',
      roleNote: 'At 100 energy, a very cheap way to boost Poison candy and hit Fairy types.',
    },
    alternatives: [
      {
        sid: 'gengar_mega',
        name: 'Mega Gengar',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Sludge Bomb',
        roleNote: 'Supreme Poison/Ghost DPS alternative.',
      },
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
      sid: 'mewtwo_mega_y',
      name: 'Mega Mewtwo Y',
      energy: 400,
      costTier: 'expensive',
      costLabel: '400 Energy · Future Sight+',
      highlightMove: 'Psystrike / Future Sight+',
      roleNote: 'It is the strongest Pokémon in the game with Future Sight+, boasting unmatched Psychic DPS.',
    },
    cheap: {
      sid: 'alakazam_mega',
      name: 'Mega Alakazam',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Psychic',
      roleNote: 'A more traditional, lower-cost Psychic option at 200 energy.',
    },
    alternatives: [
      {
        sid: 'gardevoir_mega',
        name: 'Mega Gardevoir',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Psychic',
        roleNote: 'Dual Psychic/Fairy booster.',
      },
      {
        sid: 'latios_mega',
        name: 'Mega Latios',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Luster Purge',
        roleNote: 'Dual Dragon/Psychic raid attacker.',
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
      roleNote: 'A bulky and powerful Rock/Dark attacker, though it requires 300 energy and a legacy fast move for optimal Rock performance.',
    },
    cheap: {
      sid: 'aerodactyl_mega',
      name: 'Mega Aerodactyl',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Rock Slide',
      roleNote: 'A 200-energy accessible option for Rock-type damage and Flying-type boost.',
    },
    alternatives: [
      {
        sid: 'diancie_mega',
        name: 'Mega Diancie',
        energy: 300,
        costTier: 'expensive',
        costLabel: '300 Energy',
        highlightMove: 'Rock Slide',
        roleNote: 'World-record highest pure Rock DPS in the game.',
      },
    ],
  },
  steel: {
    type: 'steel',
    icon: '⚙️',
    displayName: 'Steel',
    expensive: {
      sid: 'lucario_mega',
      name: 'Mega Lucario',
      energy: 200,
      costTier: 'expensive',
      costLabel: '200 Energy · Meteor Mash',
      highlightMove: 'Meteor Mash',
      roleNote: 'The top Steel attacker with Meteor Mash, offering incredible damage and rapid energy pacing.',
    },
    cheap: {
      sid: 'steelix_mega',
      name: 'Mega Steelix',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy',
      highlightMove: 'Heavy Slam',
      roleNote: 'While offensively modest, it is a bulky, accessible (200 energy) support Mega for Steel candy boosts.',
    },
    alternatives: [
      {
        sid: 'metagross_mega',
        name: 'Mega Metagross',
        energy: 200,
        costTier: 'expensive',
        costLabel: '200 Energy · Meteor Mash',
        highlightMove: 'Meteor Mash',
        roleNote: 'Legendary bulk and top-tier Steel offensive firepower.',
      },
      {
        sid: 'scizor_mega',
        name: 'Mega Scizor',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Iron Head',
        roleNote: 'Dual Bug/Steel accessible option.',
      },
    ],
  },
  water: {
    type: 'water',
    icon: '💧',
    displayName: 'Water',
    expensive: {
      sid: 'greninja_mega',
      name: 'Mega Greninja (or Primal Kyogre)',
      energy: 300,
      costTier: 'expensive',
      costLabel: '300–400 Energy · Hydro Cannon',
      highlightMove: 'Hydro Cannon / Origin Pulse',
      roleNote: 'Greninja is a top Water attacker, though Primal Kyogre is technically the best overall if you count Primals.',
    },
    cheap: {
      sid: 'blastoise_mega',
      name: 'Mega Blastoise',
      energy: 200,
      costTier: 'cheap',
      costLabel: '200 Energy · Hydro Cannon',
      highlightMove: 'Hydro Cannon',
      roleNote: 'A classic and reliable 200-energy Water-type booster with Hydro Cannon.',
    },
    alternatives: [
      {
        sid: 'kyogre_primal',
        name: 'Primal Kyogre',
        energy: 400,
        costTier: 'expensive',
        costLabel: '400 Primal Energy',
        isPrimal: true,
        highlightMove: 'Origin Pulse',
        roleNote: 'S-tier permanent Rainy weather boost and undisputed #1 Water/Electric/Bug candy booster.',
      },
      {
        sid: 'starmie_mega',
        name: 'Mega Starmie',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy · A+ Tier',
        highlightMove: 'Waterfall / Hydro Pump',
        roleNote: 'A+ tier Water/Psychic glass-cannon raid attacker.',
      },
      {
        sid: 'swampert_mega',
        name: 'Mega Swampert',
        energy: 200,
        costTier: 'cheap',
        costLabel: '200 Energy',
        highlightMove: 'Hydro Cannon',
        roleNote: 'A-tier Water/Ground dual attacker with rapid Hydro Cannon spam.',
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
      costLabel: '100 Energy (Cheapest)',
      highlightMove: 'Brave Bird',
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
        highlightMove: 'Ancient Power / Rock Slide',
        roleNote: 'Dual Rock/Flying accessible booster.',
      },
    ],
  },
};

/**
 * Set of all curated Mega/Primal species identifiers and their base species.
 */
export const CURATED_MEGA_SIDS: Set<string> = new Set<string>();

const addCuratedSid = (sid: string) => {
  CURATED_MEGA_SIDS.add(sid.toLowerCase());
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

// Automatically curate all Pokébase S-tier and A+-tier Megas/Primals
for (const [sid, tier] of Object.entries(POKEBASE_MEGA_TIERS)) {
  if (tier === 'S' || tier === 'A+') {
    addCuratedSid(sid);
  }
}

/**
 * Is this exact Mega form in the curated roster AND a form that really exists?
 *
 * Only an exact Mega / Primal id matches. A base species name (for example 'houndoom') never matches, so a hypothetical
 * Mega entry can no longer whitelist an ordinary Pokémon. When `supported` is given, a form missing from it is rejected.
 */
export function isCuratedMega(megaSid: string, supported?: ReadonlySet<string>): boolean {
  if (!megaSid) return false;
  const s = megaSid.toLowerCase();
  if (supported && !supported.has(s)) return false;
  const tier = getPokebaseMegaTier(s);
  return tier === 'S' || tier === 'A+' || CURATED_MEGA_SIDS.has(s);
}

/** Is this Pokémon in the family of this exact Mega form (the base Pokémon or one of its pre-evolutions)? */
function monMatchesMegaSid(m: MonModel, optSid: string, dex: Dex): boolean {
  const spId = m.species?.speciesId || '';
  return spId === megaBaseSid(optSid) || dex.familyMegaInfo(spId).includes(optSid);
}

/** A form is real only if the Dex knows it (released in PvPoke and, when available, listed in the game master). */
function isSupportedMega(dex: Dex, megaSid: string): boolean {
  return dex.megaSpecies.has(megaSid.toLowerCase());
}

/**
 * Resolves the active curated Mega SIDs for this specific user box.
 * Starts from the core curated picks (Expensive, Cheap, Pokébase S & A+ tiers),
 * and whenever a user owns ZERO eligible specimens for a type's primary Expensive
 * or Cheap pick (e.g. no Snorunt/Glalie for Ice), promotes the highest Pokébase-tier
 * alternative they actually own (e.g. Mega Abomasnow [A-Tier]).
 */
export function resolveActiveCuratedMegaSids(
  mons: MonModel[],
  dex: Dex,
  minIv: number,
  minAtk: number,
): Set<string> {
  // Only forms that really exist can ever be active.
  const active = new Set<string>(Array.from(CURATED_MEGA_SIDS).filter((sid) => isSupportedMega(dex, sid)));

  const hasEligibleOwned = (optSid: string): boolean =>
    mons.some((m) => {
      if (!monMatchesMegaSid(m, optSid, dex)) return false;
      const st = assessMegaForm(m, optSid, dex, { minIvPct: minIv, minAtkIv: minAtk, ignoreVerdict: true });
      if (st.blockedByVerdict || m.is_shadow) return false;
      return st.status !== 'NO_SPECIMEN' && st.status !== 'BASE_OWNED';
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
      const bestOwnedAlt = sortedAlts.find((alt) => isSupportedMega(dex, alt.sid) && hasEligibleOwned(alt.sid));
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
  supported?: ReadonlySet<string>,
): CuratedMegaOption | null {
  if (!megaSid) return null;
  if (supported && !supported.has(megaSid.toLowerCase())) return null;
  const ms = megaSid.toLowerCase();
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

  // Synthesize entry for Pokébase S / A+ Megas not explicitly listed in CURATED_MEGA_ROSTER
  if (tier === 'S' || tier === 'A+') {
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
      energy: ms.endsWith('_primal') ? 400 : 200,
      costTier: tier === 'S' ? 'expensive' : 'cheap',
      costLabel: `Pokébase ${tier} Tier`,
      roleNote: `Ranked ${tier} Tier on the Pokébase Mega Tier List for top-end raid damage and candy boosting.`,
      isPrimal: ms.endsWith('_primal'),
      pokebaseTier: tier,
    };
  }

  return null;
}

/**
 * Resolves ownership and builds status for the curated roster across user's inventory.
 */
export function buildCuratedMegaStatus(mons: MonModel[], dex: Dex): CuratedMegaTypeRow[] {
  const rows: CuratedMegaTypeRow[] = [];

  const resolveOptionStatus = (opt: CuratedMegaOption): CuratedMegaOptionStatus => {
    const pokebaseTier = opt.pokebaseTier ?? getPokebaseMegaTier(opt.sid);
    const none = (status: MegaStatus, supported: boolean): CuratedMegaOptionStatus => ({
      ...opt,
      pokebaseTier,
      owned: false,
      unlocked: false,
      status,
      supported,
      bestSpecimen: null,
    });

    // A form that does not exist in the game data can never be owned, unlocked or recommended.
    if (!isSupportedMega(dex, opt.sid)) return none('NO_SPECIMEN', false);

    const ranked: { m: MonModel; st: ReturnType<typeof assessMegaForm> }[] = [];
    for (const m of mons) {
      if (m.is_shadow || !monMatchesMegaSid(m, opt.sid, dex)) continue;
      const st = assessMegaForm(m, opt.sid, dex);
      // A Pokémon marked TRANSFER / TRADE / REVIEW is not retained Mega ownership.
      if (st.blockedByVerdict) continue;
      ranked.push({ m, st });
    }
    if (ranked.length === 0) return none('NO_SPECIMEN', true);

    // Best first: a really unlocked specimen, then the closest to unlocking, then Mega level, IVs and CP.
    ranked.sort(
      (a, b) =>
        MEGA_INVEST_ORDER[a.st.status] - MEGA_INVEST_ORDER[b.st.status] ||
        b.m.mega_level - a.m.mega_level ||
        b.m.iv_pct - a.m.iv_pct ||
        b.m.cp - a.m.cp,
    );
    const { m: best, st } = ranked[0];
    const unlocked = SLOT_STATUSES.has(st.status);

    const brief: CuratedMegaSpecimenBrief = {
      id: best.uid,
      name: cleanSpeciesName(best.species?.speciesName || String(best.dex)),
      cp: best.cp,
      iv: ivStr(best),
      iv_pct: best.iv_pct,
      mega_level: unlocked ? Math.max(1, best.mega_level) : 0,
      has_unlocked: unlocked,
      verdict: best.verdict,
      is_pre_evo: st.status === 'NEEDS_EVOLVE',
      role: best.role,
    };

    return {
      ...opt,
      pokebaseTier,
      owned: true,
      unlocked,
      status: st.status,
      supported: true,
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

    // Mark highest Pokébase-tier owned alternative as active fallback when a primary option is missing
    if (!exp.owned || !cheap.owned) {
      const bestFallback = alts.find((a) => a.owned);
      if (bestFallback) {
        bestFallback.fallbackActive = true;
      }
    }

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
