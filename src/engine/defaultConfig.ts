import type { CupDef, PogoConfig, VerdictType } from './types';

export const LEAGUE_NAMES: Record<number, string> = {
  1500: 'Great',
  2500: 'Ultra',
  10000: 'Master',
};

export const LEAGUE_CAP: Record<string, number> = {
  Great: 1500,
  Ultra: 2500,
  Master: 10000,
};

export const META_GROUP_FILE: Record<number, string> = {
  1500: 'great',
  2500: 'ultra',
  10000: 'master',
};

export const BASE_CUPS: Record<string, CupDef> = {
  little: {
    title: 'Little',
    cap: 500,
    rule_kind: 'first_stage',
    exclude_sids: new Set(['shuckle', 'smeargle', 'meltan']),
    file: 'little',
  },
  fantasy: {
    title: 'Fantasy',
    cap: 1500,
    rule_kind: 'types',
    include_types: new Set(['dragon', 'steel', 'fairy']),
    exclude_sids: new Set(),
    file: 'fantasy',
  },
};

export const CUP_TITLES: Record<string, string> = {
  little: 'Little',
  fantasy: 'Fantasy',
};

export const RAID_USEFUL_TYPES = [
  'bug', 'dark', 'dragon', 'electric', 'fairy', 'fighting',
  'fire', 'flying', 'ghost', 'grass', 'ground', 'ice',
  'poison', 'psychic', 'rock', 'steel', 'water',
];

export const MAX_BATTLE_TYPES = [...RAID_USEFUL_TYPES, 'normal'];

export const DEFENDER_DEF = 200.0;
export const STAB = 1.2;
// Super-effective multiplier (Pokémon GO: 1.6x). Raid attacker rankings are simulated against a
// generic defender that is weak to the team type: a move of that type is x1.6, every other move x1.0.
export const SUPER_EFFECTIVE = 1.6;
export const SHADOW_ATK_MULT = 1.2;
export const SHADOW_DMG_TAKEN = 1.2;
export const SHADOW_DEF_DIV = 1.2;
export const RAID_BULK_K = 30000.0;

export const MEGA_TAGS = new Set(['mega', 'supermega']);
export const MEGA_SUFFIXES = ['mega', 'supermega', 'primal'];
export const PRIMAL_SUFFIXES = ['_primal'];
export const SHADOW_SUFFIXES = ['_shadow'];

export const PRIMAL_BOOST_TYPES: Record<string, string[]> = {
  groudon_primal: ['grass', 'fire', 'ground'],
  kyogre_primal: ['electric', 'water', 'bug'],
};

export const PVP_ROLE_KEYS = [
  'leads',
  'closers',
  'switches',
  'chargers',
  'attackers',
  'consistency',
] as const;

export const PVP_ROLE_LABEL: Record<string, string> = {
  leads: 'lead',
  closers: 'closer',
  switches: 'safe swap',
  chargers: 'charger',
  attackers: 'attacker',
  consistency: 'consistency',
};

export const BULK_GOAL: Record<number, number> = {
  500: 10000.0,
  1500: 22000.0,
  2500: 35000.0,
  10000: 35000.0,
};

export const FORM_SUFFIXES = [
  'alolan', 'galarian', 'hisuian', 'paldean',
  'alola', 'galar', 'hisui', 'paldea',
  'origin', 'therian', 'incarnate', 'armored', 'crowned',
  'attack', 'defense', 'speed', 'normal', 'altered', 'eternamax',
  'ten', 'fifty', 'complete', 'percent',
  'sunny', 'rainy', 'snowy', 'overcast', 'sunshine',
  'east', 'west', 'plant', 'sandy', 'trash',
  'mow', 'frost', 'fan', 'heat', 'wash',
  'sensu', 'baile', 'aria', 'pirouette', 'blade', 'shield', 'school',
  'small', 'average', 'large', 'super',
  'confined', 'unbound', 'zen', 'galar_zen', 'noice', 'white', 'black',
  'mega', 'primal',
];

export const FORM_ALIASES: Record<string, string> = {
  zaciancrownedsword: 'crowned',
  zaciancrowned: 'crowned',
  zacianhero: 'hero',
  zamazentacrownedshield: 'crowned',
  zamazentacrowned: 'crowned',
  zamazentahero: 'hero',
  mewtwoa: 'armored',
  mewtwo_armored: 'armored',
  zygardetenpercent: '10',
  zygardefiftypercent: '50',
  zygardecomplete: 'complete',
  hoopaconfined: 'confined',
  hoopaunbound: 'unbound',
  darmanitangalarzen: 'galar_zen',
  necrozmaduskmane: 'dusk',
  necrozmadawnwings: 'dawn',
  kyuremblack: 'black',
  kyuremwhite: 'white',
  toxtricitylowkey: 'lowkey',
  toxtricityamped: 'amped',
  toxtricitylowkeyform: 'lowkey',
  enamorusincarnate: 'incarnate',
  enamorustherian: 'therian',
  urshifusinglestrike: 'singlestrike',
  urshifurapidstrike: 'rapidstrike',
  basculegionmale: 'male',
  basculegionfemale: 'female',
  morpekofullbelly: 'fullbelly',
  morpekohangry: 'hangry',
  oricoriobaile: 'baile',
  oricoriopompom: 'pompom',
  oricoriopau: 'pau',
  oricoriosensu: 'sensu',
  sinisteaphony: 'phony',
  sinisteaantique: 'antique',
};

export const DYNAMAX_DEX = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 52, 58, 59, 63, 64, 65, 66, 67, 68, 92, 93, 94, 98, 99,
  106, 107, 111, 112, 113, 125, 129, 130, 131, 133, 134, 135, 136, 138, 139, 140, 141, 143, 144,
  145, 146, 163, 164, 196, 197, 213, 215, 237, 242, 243, 244, 245, 249, 250, 280, 281, 282, 302,
  320, 321, 328, 329, 330, 349, 350, 363, 364, 365, 374, 375, 376, 377, 378, 379, 380, 381, 461,
  464, 466, 470, 471, 475, 480, 481, 482, 519, 520, 521, 524, 525, 526, 527, 528, 529, 530, 554,
  555, 568, 569, 615, 633, 634, 635, 686, 687, 700, 761, 762, 763, 766, 780, 810, 811, 812, 813,
  814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 831, 832, 849, 850, 851, 856, 857, 858, 861,
  870, 884, 891, 892,
]);

export const GMAX_TYPE: Record<number, string> = {
  3: 'grass', 6: 'fire', 9: 'water', 12: 'bug', 52: 'normal', 68: 'fighting', 94: 'ghost',
  99: 'water', 131: 'ice', 143: 'normal', 569: 'poison', 812: 'grass', 815: 'fire',
  818: 'water', 849: 'electric', 861: 'dark',
};

export const GMAX_ONLY_DEX = new Set([52, 143, 861]);
export const REGIONAL_SUFFIXES = ['_alolan', '_galarian', '_hisuian', '_paldean'];

export const MAX_MOVE_POWER: Record<number, number> = { 1: 250.0, 2: 300.0, 3: 350.0 };
export const GMAX_MOVE_POWER: Record<number, number> = { 1: 350.0, 2: 400.0, 3: 450.0 };
export const MAX_DAMAGE_DIV = 180.0;

export const CROWNED_MAX_OVERRIDE: Record<number, { type: string; use_gmax_power: boolean }> = {
  888: { type: 'steel', use_gmax_power: false },
  889: { type: 'steel', use_gmax_power: false },
};

export const VERDICT_ORDER: VerdictType[] = [
  'BUILD_PVP', 'BUILD_MEGA', 'BUILD_RAID', 'BUILD_MAX',
  'BUILD_GYM', 'KEEP', 'TRADE', 'REVIEW', 'TRANSFER',
];

export const OUT_OF_PLAY = new Set<VerdictType>(['REVIEW', 'TRANSFER', 'TRADE']);

export const READINESS_STATUSES = [
  'Ready',
  'Needs TM',
  'Needs second charged move',
  'Needs Elite TM',
  'Unknown',
] as const;

export const READINESS_BUILDS = new Set<VerdictType>([
  'BUILD_PVP',
  'BUILD_MEGA',
  'BUILD_RAID',
  'BUILD_MAX',
]);

export const TYPE_CHART: Record<string, { weak: string[]; resist: string[]; immune: string[] }> = {
  normal: { weak: ['fighting'], resist: [], immune: ['ghost'] },
  fire: { weak: ['water', 'ground', 'rock'], resist: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'], immune: [] },
  water: { weak: ['electric', 'grass'], resist: ['fire', 'water', 'ice', 'steel'], immune: [] },
  electric: { weak: ['ground'], resist: ['electric', 'flying', 'steel'], immune: [] },
  grass: { weak: ['fire', 'ice', 'poison', 'flying', 'bug'], resist: ['water', 'electric', 'grass', 'ground'], immune: [] },
  ice: { weak: ['fire', 'fighting', 'rock', 'steel'], resist: ['ice'], immune: [] },
  fighting: { weak: ['flying', 'psychic', 'fairy'], resist: ['bug', 'rock', 'dark'], immune: [] },
  poison: { weak: ['ground', 'psychic'], resist: ['grass', 'fighting', 'poison', 'bug', 'fairy'], immune: [] },
  ground: { weak: ['water', 'grass', 'ice'], resist: ['poison', 'rock'], immune: ['electric'] },
  flying: { weak: ['electric', 'ice', 'rock'], resist: ['grass', 'fighting', 'bug'], immune: ['ground'] },
  psychic: { weak: ['bug', 'ghost', 'dark'], resist: ['fighting', 'psychic'], immune: [] },
  bug: { weak: ['fire', 'flying', 'rock'], resist: ['grass', 'fighting', 'ground'], immune: [] },
  rock: { weak: ['water', 'grass', 'fighting', 'ground', 'steel'], resist: ['normal', 'fire', 'poison', 'flying'], immune: [] },
  ghost: { weak: ['ghost', 'dark'], resist: ['poison', 'bug'], immune: ['normal', 'fighting'] },
  dragon: { weak: ['ice', 'dragon', 'fairy'], resist: ['fire', 'water', 'electric', 'grass'], immune: [] },
  dark: { weak: ['fighting', 'bug', 'fairy'], resist: ['ghost', 'dark'], immune: ['psychic'] },
  steel: { weak: ['fire', 'fighting', 'ground'], resist: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'], immune: ['poison'] },
  fairy: { weak: ['poison', 'steel'], resist: ['fighting', 'bug', 'dark'], immune: ['dragon'] },
};

export const DEFAULT_CFG: PogoConfig = {
  protect_iv_pct: 98.0,
  protect_iv_scope: 'best_per_species',
  iv_protect_max_per_species: 1,
  protect_hundo: true,
  protect_species_dex: [],
  protect_favorite: true,
  protect_lucky: true,
  protect_costume: false,
  protect_shiny: false,
  protect_location_card: true,
  protect_origin_events: false,
  protect_gofest_2026: false,
  protect_3rd_move: true,
  protect_elite_move_holders: true,
  protect_high_upgrades: true,
  upgrades_keep_threshold: 20,
  protect_best_buddy: true,
  protect_top_pvp_iv: true,
  protect_top_pvp_iv_rank: 10,
  protect_top_pvp_iv_leagues: ['1500', '2500'],
  protect_top_pvp_iv_cups: true,
  protect_top_pvp_iv_min_cap_fraction: 0.95,
  protect_high_buddy_km: false,
  buddy_km_keep_threshold: 100.0,
  best_buddy_km_threshold: 50.0,
  protect_deployed: true,
  protect_tagged: true,
  protect_tag_names: ['greatleague', 'ultraleague', 'gym', 'hundo', 'legacy', 'rank 1 iv', 'nundo'],
  exclude_tag_names: [],

  protect_mega_capable: true,
  protect_currently_mega: true,
  protect_super_mega: true,
  super_mega_protect_level: 1,
  protect_dynamax: false,
  protect_gigantamax: false,

  keep_copies: 2,
  power_level_floor: 25,
  manual_keep_ids: [],
  manual_transfer_ids: [],

  pve_model: { enabled: true },

  pvp: {
    leagues: ['1500', '2500', '10000'],
    cups: ['little', 'fantasy'],
    keep_species_top: { '1500': 40, '2500': 25, '10000': 20 },
    keep_iv_rank: 50,
    maybe_species_top: { '1500': 70, '2500': 50, '10000': 40 },
    maybe_iv_rank: 120,
    relevant_species_top: { '1500': 150, '2500': 150, '10000': 100 },
    prefer_shadow_rankings: true,
    builds_per_species_league: { '1500': 1, '2500': 1, '10000': 1 },
    master_min_iv_pct: 93.0,
    min_composite: 1220,
  },

  raid: {
    top_n_species: 20,
    keep_per_type: 6,
    reserve_keep: 2,
    power_level: 40.0,
    min_atk_iv: 12,
    min_atk_iv_for_shadow: 12,
    min_iv_pct: 60.0,
    iv_pct_slack: 5.0,
    min_dps_pct: 75.0,
    min_dps_pct_of_best_of_type: 65.0,
    bulk_weight: 1.0,
    min_level: 20.0,
    prefer_shadow: true,
    shadow_dps_bonus: 1.2,
    type_coverage_min: 3,
    suggest_movesets: true,
    moveset_assume_boost: true,
    boost_same_type: 1.3,
    boost_other: 1.1,
    tm_min_gain_pct: 5.0,
    elite_tm_min_gain_pct: 10.0,
    // Ranking source for type attacker lists used by placement & team builder.
    // "pokebattler" = live Pokébattler points/estimator (recommended). "internal" = local formula.
    ranking_source: 'pokebattler' as 'pokebattler' | 'internal',
    // --- Raid team sorter (type-aware) ---
    // Frustration is a dead move slot. Set true ONLY while a Team GO Rocket Takeover window is open
    // (regular Charged TMs can remove Frustration then). Otherwise Shadows must be purified first.
    frustration_removable_now: false,
    // Pokémon ids (the `id` shown in the report) whose Frustration you already removed after exporting.
    allow_frustration_uids: [] as string[],
    // Minimum % of the best attacker of that type for a Pokémon to be placed as a spare / TM backfill.
    spare_min_pct: 65.0,
  },

  mega: {
    power_level: 40.0,
    min_iv_pct: 82.0,
    min_atk_iv: 12,
    require_released: true,
    require_raid_relevance: true,
    narrow_to_curated: true,
    min_dps_pct_of_type: 60.0,
    recommend_boost_type: true,
    top_n_for_boost: 5,
    keep_per_family: 1,
    keep_per_type: 2,
    require_dps_floor: true,
  },

  trade: {
    gmax_top_rank: 15,
  },
  max_battle: {
    enabled: true,
    top_n_species: 50,
    keep_per_type: 4,
    reserve_keep: 2,
    power_level: 40.0,
    min_atk_iv: 12,
    min_dps_pct: 70.0,
    min_dps_pct_of_best_of_type: 50.0,
    min_level: 20.0,
    prefer_gigantamax: true,
    // Dynamax Max Move type = type of the Fast Attack the Pokémon knows now. true: place Pokémon by the Fast Attack they
    // have (no TMs needed). false: place by best possible type and assume you will TM the Fast Attack.
    respect_current_fast_move: true,
    tank_picks: 4,
    healer_picks: 3,
    note:
      'Max damage = Attack x Max Move power (250/300/350, G-Max 350/400/450) x STAB, ranked at Max Move level 3. Max Move type = Fast Attack type. Tanks / healers are ranked by bulk / max HP among your Dynamax Pokemon.',
  },

  gym: {
    defenders: [
      'blissey', 'chansey', 'snorlax', 'wobbuffet', 'slaking',
      'togekiss', 'umbreon', 'drifblim', 'gyarados', 'milotic',
      'metagross', 'aggron',
    ],
    power_level: 40.0,
    min_iv_pct: 70.0,
    max_per_species: 3,
    allow_shadow: false,
  },

  pvp_teams: {
    enabled: true,
    top_n: 5,
    species_rank_max: 200,
    iv_rank_max: 50,
    require_distinct_types: true,
    cup_max_shared_members: 1,
    league_max_shared_members: 1,
    cohesion: {
      enabled: true,
      threat_count: 40,
      max_pool: 40,
      hole_min_victims: 2,
      weights: {
        coverage: 0.38,
        holes: 0.18,
        roles: 0.14,
        consistency: 0.10,
        bulk: 0.07,
        backup: 0.08,
        typing: 0.05,
      },
      grades: { A: 90.0, B: 80.0, C: 70.0, D: 60.0 },
      note:
        "Cohesion is scored on PvPoke's published meta threat list, each species' top-5 wins/losses matchup graph, and six category scores (lead / safe swap / closer).",
    },
  },

  power_up_priority: {
    iv_rank_cutoff: 50,
    do_not_invest_iv_rank: 50,
    max_rows: 40,
    top_n: 12,
    max_per_species: 1,
    dust_budget: 0,
    do_not_invest_rows: 10,
  },

  coverage: {
    min_level: 25.0,
    min_attackers: 3,
    coverage_first: true,
    build_target_level: 0,
    pick_tie_pct: 5.0,
    defer_master_builds: true,
  },

  review: {
    atk_iv_slack: 1,
    dps_slack_pct: 5.0,
    level_slack: 10.0,
    mega_iv_slack: 15.0,
    gym_iv_slack: 5.0,
    gym_min_cp: 1500,
  },

  readiness: {
    ready_min_known: 2,
  },

  briefing: {
    enabled: true,
    days: 14,
  },

  last_look: {
    enabled: true,
    iv_pct: 85.0,
    level_above: 25.0,
  },

  review_triage: {
    enabled: true,
    keep_iv_pct: 90.0,
    keep_pvp_iv_rank: 25,
    keep_level_above: 25.0,
    transfer_iv_pct: 70.0,
    confirmed_transfer_ids: [],
  },

  age_keep_years: [2016],
  age_keep_if_iv_pct: { '2017': 70.0, '2018': 80.0 },
  age_maybe_years: [2017, 2018, 2019, 2020],
  age_maybe_if_iv_pct: { '2017': 0.0, '2018': 0.0, '2019': 0.0, '2020': 70.0 },

  variant_rules: {
    costume: { key: ['dex', 'costume'], trade_key: ['dex', 'costume'], keep: 1, trade: 2, quality: 'iv_pct' },
    shiny: { key: ['dex', 'shiny'], trade_key: ['dex', 'shiny'], keep: 1, trade: 4, quality: 'iv_pct' },
    legendary: { key: ['dex', 'form'], trade_key: ['dex', 'form'], keep: 1, trade: 6, quality: 'iv_pct' },
    lucky_age: { key: ['dex', 'form'], trade_key: ['dex', 'form'], keep: 1, trade: 4, quality: 'iv_pct' },
    form: { key: ['dex', 'form'], trade_key: ['dex', 'form'], keep: 1, trade: 1, quality: 'iv_pct' },
  },

  safeguards: {
    never_transfer_if_in_team: true,
    never_transfer_if_in_build: true,
    never_transfer_if_in_raid_team: true,
    never_transfer_if_in_max_team: true,
    warn_high_cp: 2500,
    warn_high_level: 35.0,
  },
};

export const USER_CONFIG_PRESET: Record<string, unknown> = {
  protect_iv_pct: 98,
  protect_iv_scope: 'best_per_species',
  iv_protect_max_per_species: 1,
  protect_hundo: true,
  protect_favorite: true,
  protect_lucky: true,
  protect_costume: false,
  protect_shiny: false,
  protect_location_card: true,
  protect_origin_events: false,
  protect_gofest_2026: false,
  protect_3rd_move: true,
  protect_elite_move_holders: true,
  protect_high_upgrades: true,
  upgrades_keep_threshold: 20,
  protect_best_buddy: true,
  protect_top_pvp_iv: true,
  protect_top_pvp_iv_rank: 10,
  protect_top_pvp_iv_leagues: ['1500'],
  protect_top_pvp_iv_cups: true,
  protect_top_pvp_iv_min_cap_fraction: 0.95,
  protect_high_buddy_km: false,
  buddy_km_keep_threshold: 100,
  best_buddy_km_threshold: 50,
  protect_deployed: true,
  protect_tagged: true,
  protect_tag_names: ['greatleague', 'ultraleague', 'gym', 'hundo', 'legacy', 'rank 1 iv', 'nundo'],
  exclude_tag_names: [],
  protect_mega_capable: true,
  protect_currently_mega: true,
  protect_super_mega: true,
  super_mega_protect_level: 1,
  protect_dynamax: false,
  protect_gigantamax: false,
  keep_copies: 2,
  power_level_floor: 25,
  pvp: {
    leagues: ['1500'],
    cups: ['fantasy'],
    keep_species_top: { '1500': 40, '2500': 25, '10000': 20 },
    keep_iv_rank: 50,
    maybe_species_top: { '1500': 70, '2500': 50, '10000': 40 },
    maybe_iv_rank: 120,
    relevant_species_top: { '1500': 150, '2500': 150, '10000': 100 },
    prefer_shadow_rankings: true,
    builds_per_species_league: { '1500': 1, '2500': 1, '10000': 1 },
    master_min_iv_pct: 93,
    min_composite: 1220,
  },
  readiness: {
    ready_min_known: 2,
  },
  review_triage: {
    enabled: true,
    keep_iv_pct: 90,
    keep_pvp_iv_rank: 25,
    keep_level_above: 25,
    transfer_iv_pct: 70,
    confirmed_transfer_ids: [],
  },
};

export function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown> | null | undefined): T {
  const out: Record<string, unknown> = { ...base };
  if (!override) return out as T;
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function buildMergedConfig(userCfg?: Record<string, unknown> | null): PogoConfig {
  return deepMerge(DEFAULT_CFG as unknown as Record<string, unknown>, userCfg || {}) as unknown as PogoConfig;
}

export function getActiveLeaguesAndCups(cfg: PogoConfig): {
  caps: number[];
  cups: Record<string, CupDef>;
} {
  const wantLeagues = new Set((cfg.pvp?.leagues || ['1500', '2500', '10000']).map(String));
  const caps = [1500, 2500, 10000].filter((c) => wantLeagues.has(String(c)));
  const activeCaps = caps.length > 0 ? caps : [1500];

  const wantCups = new Set((cfg.pvp?.cups ?? Object.keys(BASE_CUPS)).map(String));
  const cups: Record<string, CupDef> = {};
  for (const [k, def] of Object.entries(BASE_CUPS)) {
    if (wantCups.has(k)) {
      cups[k] = def;
    }
  }
  return { caps: activeCaps, cups };
}

export function normStr(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function typeDisplay(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

export function cleanSpeciesName(name: string): string {
  return (name || '').replace(/\s*\(Shadow\)/gi, '');
}

export const GRADE_WEIGHTS: Record<string, number> = {
  raid_coverage: 0.4,
  pvp_readiness: 0.25,
  mega_coverage: 0.15,
  max_battle: 0.1,
  collection_depth: 0.1,
};

export const GRADE_TYPE_IMPORTANCE: Record<string, number> = {
  dragon: 1.4,
  ground: 1.4,
  rock: 1.3,
  fighting: 1.3,
  fire: 1.2,
  electric: 1.2,
  ice: 1.2,
  water: 1.2,
  dark: 1.1,
  ghost: 1.1,
  grass: 1.0,
  psychic: 1.0,
  steel: 1.0,
  fairy: 1.0,
  flying: 0.9,
  bug: 0.8,
  poison: 0.8,
};

export const HOLD_LABELS: Record<string, [string, string, string]> = {
  build: ['Active builds', 'Queued PvP, Raid, Max, Mega, or Gym investments.', 'Review Build Plan'],
  mega_reserve: ['Mega reserve', 'Held as best available Mega/Primal base per family.', 'Lower mega.keep_per_family'],
  variant: ['Collection variants', 'Best Shiny, Lucky, Shadow, Costume, or Legacy specimen.', 'Adjust variant_rules'],
  protect_other: ['Collection protected', 'Hundos, favorites, high IVs, legendaries, or raid gap backups.', 'Adjust protect_* rules'],
  trade: ['Marked for trade', 'Untraded duplicates, extra shinies/legendaries, & 2016–2019 lucky fodder.', 'Open Trade & Lucky tab'],
  review: ['Needs review', 'Marginal IV or level copies awaiting manual triage.', 'Resolve in Transfer & Review'],
  transfer: ['Safe transfer', 'Duplicate or low-value Pokémon cleared for candy.', 'Copy transfer search'],
};

export const SIZE_LABELS: Record<number, string> = {
  1: 'XXS',
  2: 'XS',
  3: 'Normal',
  4: 'XL',
  5: 'XXL',
};

