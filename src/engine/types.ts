import type { CuratedMegaTypeRow } from './megaCurated';

export type RaidTier = 'S' | 'A' | 'B' | 'C';

export interface SpeciesEntry {
  key: string;
  dex: number;
  name: string;
  form?: string;
  baseAtk: number;
  baseDef: number;
  baseSta: number;
  types: string[];
  family: string;
  evolutions: string[];
  raidTier: RaidTier;
  pvpRelevance: {
    little?: boolean;
    great?: boolean;
    ultra?: boolean;
    master?: boolean;
  };
  isLegendary?: boolean;
  isMythical?: boolean;
  isUltraBeast?: boolean;
  isRegional?: boolean;
  canMega?: boolean;
}

export type VerdictType =
  | 'BUILD_PVP'
  | 'BUILD_MEGA'
  | 'BUILD_RAID'
  | 'BUILD_MAX'
  | 'BUILD_GYM'
  | 'KEEP'
  | 'TRADE'
  | 'REVIEW'
  | 'TRANSFER';

export type BuildStatus =
  | 'Ready'
  | 'Needs TM'
  | 'Needs second charged move'
  | 'Needs Elite TM'
  | 'Unknown';

export interface RawPokemon {
  id?: string | number;
  uid?: string | number;
  pokemonId?: string | number;
  pokemon_id?: string | number;
  speciesId?: string;
  dex?: number;
  name?: string;
  species?: string;
  nickname?: string;
  cp?: number;
  individualAttack?: number;
  individualDefense?: number;
  individualStamina?: number;
  atk?: number;
  def?: number;
  sta?: number;
  cpMultiplier?: number;
  additionalCpMultiplier?: number;
  cpm?: number;
  level?: number;
  isEgg?: boolean;
  favorite?: boolean;
  isFavorite?: boolean;
  shiny?: boolean;
  isShiny?: boolean;
  isLucky?: boolean;
  lucky?: boolean;
  move1?: number | string;
  move2?: number | string;
  move3?: number | string;
  heightM?: number;
  weightKg?: number;
  size?: number;
  cpWhenDeployed?: number;
  fortId?: string;
  deployedFortId?: string;
  buddyDistanceKm?: number;
  kmBuddyDistance?: number;
  buddyLevel?: number;
  battlesAttacked?: number;
  battlesDefended?: number;
  numUpgrades?: number;
  creationTimeMs?: number | string;
  caughtTime?: number | string;
  pokemonDisplay?: {
    form?: string | number;
    formName?: string;
    costume?: string | number;
    gender?: string | number;
    alignment?: number;
    breadModeEnum?: number;
    currentTempEvolution?: number;
    tempEvolution?: number;
    temporaryEvolutionFinishMs?: number;
    weatherBoostedCondition?: number;
    shiny?: boolean;
    megaLevel?: number;
    locationCard?: unknown;
    badge?: unknown;
  };
  originDetail?: Record<string, unknown>;
  originEvents?: string[];
  tags?: string[];
  maxAttackLevel?: number;
  maxGuardLevel?: number;
  maxSpiritLevel?: number;
  megaLevel?: number;
  hasMegaUnlocked?: boolean;
  [key: string]: unknown;
}

export interface PogoConfig {
  protect_iv_pct: number;
  protect_iv_scope: string;
  iv_protect_max_per_species: number;
  protect_hundo: boolean;
  protect_species_dex: number[];
  protect_favorite: boolean;
  protect_lucky: boolean;
  protect_costume: boolean;
  protect_shiny: boolean;
  protect_location_card: boolean;
  protect_origin_events: boolean;
  protect_gofest_2026: boolean;
  protect_3rd_move: boolean;
  protect_elite_move_holders: boolean;
  protect_high_upgrades: boolean;
  upgrades_keep_threshold: number;
  protect_best_buddy: boolean;
  protect_top_pvp_iv: boolean;
  protect_top_pvp_iv_rank: number;
  protect_top_pvp_iv_leagues: string[];
  protect_top_pvp_iv_cups: boolean;
  protect_top_pvp_iv_min_cap_fraction: number;
  protect_high_buddy_km: boolean;
  buddy_km_keep_threshold: number;
  best_buddy_km_threshold: number;
  protect_deployed: boolean;
  protect_tagged: boolean;
  protect_tag_names?: string[];
  exclude_tag_names?: string[];
  protect_mega_capable: boolean;
  protect_currently_mega: boolean;
  protect_super_mega: boolean;
  super_mega_protect_level: number;
  protect_dynamax: boolean;
  protect_gigantamax: boolean;
  keep_copies: number;
  power_level_floor: number;
  manual_keep_ids?: string[];
  manual_transfer_ids?: string[];
  pve_model: { enabled: boolean };
  pvp: {
    leagues: string[];
    cups: string[];
    keep_species_top: Record<string, number>;
    keep_iv_rank: number;
    maybe_species_top: Record<string, number>;
    maybe_iv_rank: number;
    relevant_species_top: Record<string, number>;
    prefer_shadow_rankings: boolean;
    builds_per_species_league: Record<string, number>;
    master_min_iv_pct: number;
    min_composite: number;
  };
  raid: {
    top_n_species: number;
    keep_per_type: number;
    reserve_keep: number;
    power_level: number;
    min_atk_iv: number;
    min_atk_iv_for_shadow: number;
    min_iv_pct: number;
    iv_pct_slack: number;
    min_dps_pct: number;
    min_dps_pct_of_best_of_type: number;
    bulk_weight: number;
    min_level: number;
    prefer_shadow: boolean;
    shadow_dps_bonus: number;
    type_coverage_min: number;
    suggest_movesets: boolean;
    moveset_assume_boost: boolean;
    boost_same_type: number;
    boost_other: number;
    tm_min_gain_pct: number;
    elite_tm_min_gain_pct: number;
    frustration_removable_now?: boolean;
    allow_frustration_uids?: string[];
    spare_min_pct?: number;
  };
  mega: {
    power_level: number;
    min_iv_pct: number;
    min_atk_iv: number;
    require_released: boolean;
    require_raid_relevance: boolean;
    narrow_to_curated?: boolean;
    min_dps_pct_of_best_of_type?: number;
    min_dps_pct_of_type: number;
    recommend_boost_type: boolean;
    top_n_for_boost: number;
    keep_per_family: number;
    keep_per_type: number;
    require_dps_floor: boolean;
  };
  max_battle: {
    enabled: boolean;
    top_n_species: number;
    keep_per_type: number;
    reserve_keep: number;
    power_level: number;
    min_atk_iv: number;
    min_dps_pct: number;
    min_dps_pct_of_best_of_type: number;
    min_level: number;
    prefer_gigantamax: boolean;
    /** Dynamax Max Move type follows the Fast Attack: place Pokémon by the Fast Attack they have now (default true). */
    respect_current_fast_move?: boolean;
    tank_picks: number;
    healer_picks: number;
    extra_dynamax_dex?: number[];
    extra_gigantamax?: Record<string, string>;
    note: string;
  };
  gym: {
    defenders: string[];
    power_level: number;
    min_iv_pct: number;
    max_per_species: number;
    allow_shadow: boolean;
  };
  pvp_teams: {
    enabled: boolean;
    top_n: number;
    species_rank_max: number;
    iv_rank_max: number;
    require_distinct_types: boolean;
    cup_max_shared_members: number;
    league_max_shared_members: number;
    cohesion: {
      enabled: boolean;
      threat_count: number;
      max_pool: number;
      hole_min_victims: number;
      weights: Record<string, number>;
      grades: Record<string, number>;
      note: string;
    };
  };
  power_up_priority: {
    iv_rank_cutoff: number;
    do_not_invest_iv_rank: number;
    max_rows: number;
    top_n: number;
    max_per_species: number;
    dust_budget: number;
    do_not_invest_rows: number;
  };
  coverage: {
    min_level: number;
    min_attackers: number;
    coverage_first: boolean;
    build_target_level: number;
    pick_tie_pct: number;
    defer_master_builds: boolean;
  };
  review: {
    atk_iv_slack: number;
    dps_slack_pct: number;
    level_slack: number;
    mega_iv_slack: number;
    gym_iv_slack: number;
    gym_min_cp: number;
  };
  readiness?: { ready_min_known?: number };
  briefing?: { enabled?: boolean; days?: number; storage_warn_pct?: number };
  last_look: { enabled: boolean; iv_pct: number; level_above: number };
  review_triage: {
    enabled: boolean;
    keep_iv_pct: number;
    keep_pvp_iv_rank: number;
    keep_level_above: number;
    transfer_iv_pct: number;
    confirmed_transfer_ids: string[];
  };
  age_keep_years: number[];
  age_keep_if_iv_pct: Record<string, number>;
  age_maybe_years: number[];
  age_maybe_if_iv_pct: Record<string, number>;
  variant_rules: Record<string, {
    key: string[];
    trade_key: string[];
    keep: number;
    trade: number;
    quality: string;
  }>;
  safeguards: {
    never_transfer_if_in_team: boolean;
    never_transfer_if_in_build: boolean;
    never_transfer_if_in_raid_team: boolean;
    never_transfer_if_in_max_team: boolean;
    warn_high_cp: number;
    warn_high_level: number;
  };
  [key: string]: unknown;
}

export interface PvPokeMove {
  moveId: string;
  name?: string;
  type: string;
  power?: number;
  energy?: number;
  energyGain?: number;
  cooldown?: number;
  durationMs?: number;
  duration?: number;
  turns?: number;
  buffs?: number[];
  buffTarget?: 'self' | 'opponent' | 'both' | string;
  buffApplyChance?: number | string;
}

export interface PvPokeSpecies {
  speciesId: string;
  speciesName: string;
  dex: number;
  baseStats: { atk: number; def: number; hp: number };
  types: string[];
  fastMoves?: string[];
  chargedMoves?: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  tags?: string[];
  released?: boolean;
  family?: {
    id: string;
    parent?: string;
    evolutions?: string[];
  };
  buddyDistance?: number;
}

export interface PvPokeRankingEntry {
  speciesId: string;
  speciesName?: string;
  rating?: number;
  score?: number;
  scores?: number[];
  matchups?: { opponent: string; rating: number }[];
  counters?: { opponent: string; rating: number }[];
  moveset?: string[];
}

export interface PveMoveRecord {
  id: number;
  p: number;
  d: number;
  e: number;
  t: string;
}

export interface SizeTableRecord {
  avg_h: number;
  avg_w: number;
  k: number;
  xxl_h: number;
}

export interface ScrapedEvent {
  eventID?: string;
  name: string;
  eventType?: string;
  heading?: string;
  link?: string;
  start?: string;
  end?: string;
  extraData?: Record<string, unknown>;
}

export interface ScrapedRaid {
  name: string;
  tier?: string;
  types?: string[];
  canBeShiny?: boolean;
}

export interface RemoteGameData {
  gm: {
    timestamp?: string;
    pokemon: PvPokeSpecies[];
    moves: PvPokeMove[];
  };
  ranks: Record<number, PvPokeRankingEntry[]>;
  groups: Record<number, PvPokeRankingEntry[]>;
  cupRanks: Record<string, PvPokeRankingEntry[]>;
  cupGroups: Record<string, PvPokeRankingEntry[]>;
  pveMoves: Record<string, PveMoveRecord>;
  pveOk: boolean;
  showcaseSizes: Record<string, SizeTableRecord>;
  sizeOk: boolean;
  events: ScrapedEvent[];
  raids: ScrapedRaid[];
  eventsOk: boolean;
  gmAgeDays: number;
  feedAgeHours: number | null;
  sourceLabel: string;
}

export interface CupDef {
  title: string;
  cap: number;
  rule_kind: 'first_stage' | 'types';
  exclude_sids: Set<string>;
  include_types?: Set<string>;
  file: string;
}

export interface PvpEntry {
  league: string;
  cap: number;
  sid: string;
  name: string;
  species_rank: number;
  iv_rank: number;
  iv_pct: number;
  composite: number;
  target_level: number;
  target_cp: number;
  eligible: boolean;
  maybe_eligible: boolean;
  ineligible_reason?: string;
  cup?: string;
  already_at_target?: boolean;
}

export interface BreakpointHit {
  opponent: string;
  type: 'atk_breakpoint' | 'def_bulkpoint' | 'cmp_flip';
  move: string;
  yours: number;
  rank1: number;
  delta_pct: number;
  note: string;
}

export interface PvpBattleSummary {
  cap: number;
  league: string;
  win_rate_0v0: number;
  win_rate_1v1: number;
  win_rate_2v2: number;
  avg_rating_1v1: number;
  key_wins: string[];
  key_losses: string[];
  moves_used: string[];
  used_current_moves: boolean;
  breakpoints: BreakpointHit[];
  cmp_wins: number;
  cmp_total: number;
}

export interface PurifyPreview {
  purified_iv: string;
  purified_iv_pct: number;
  becomes_hundo: boolean;
  purified_level: number;
  purified_cp: number | null;
  return_note: string;
}

export interface MonModel {
  idx: number;
  uid: string;
  dex: number;
  raw: RawPokemon;
  cp: number;
  a: number;
  d: number;
  s: number;
  iv_pct: number;
  level: number;
  is_shadow: boolean;
  is_purified: boolean;
  is_shiny: boolean;
  is_lucky: boolean;
  is_favorite: boolean;
  is_costume: boolean;
  has_third_move: boolean;
  is_deployed: boolean;
  is_tagged: boolean;
  mon_tags: string[];
  tag_conflicts: string[];
  origin_case: number;
  origin_label: string;
  is_traded: boolean;
  purify_preview: PurifyPreview | null;
  in_contest: boolean;
  contest_end_ms: number | null;
  legacy_size_unknown: boolean;
  mega_forms: number[];
  is_currently_mega: boolean;
  has_mega_unlocked: boolean;
  mega_level: number;
  is_mega_capable: boolean;
  is_mega_pre_evo: boolean;
  purify_for_mega: boolean;
  mega_sid: string | null;
  mega_type: string | null;
  is_dynamax: boolean;
  is_gigantamax: boolean;
  max_attack_level: number;
  max_guard_level: number;
  max_spirit_level: number;
  buddy_km: number;
  num_upgrades: number;
  year: number | null;
  form_name: string;
  form_id: string | number;
  gender: string | number;
  location_card: string;
  origin_events: string[];
  knows_moves: (string | number)[];
  species: PvPokeSpecies | null;
  pvp: PvpEntry[];
  cup_pvp: PvpEntry[];
  best_pvp: PvpEntry | null;
  pvp_battle?: PvpBattleSummary | null;
  raid_type: string | null;
  raid_sid: string | null;
  raid_rank: number | null;
  raid_dps: number;
  raid_reject: string;
  raid_reserve: boolean;
  max_type: string | null;
  max_sid: string | null;
  max_rank: number | null;
  max_dps: number;
  max_reject: string;
  max_reserve: boolean;
  gym_score: number;
  gym_reject: string;
  protect: string[];
  iv_demoted: boolean;
  review_reasons: string[];
  variant_keep: string;
  variant_trade: string;
  verdict: VerdictType;
  role: string;
  why_keep: string;
  power_up_to: number | null;
  build_cp: number | null;
  evolve_to: string;
  evolve_to_sid: string | null;
  moveset: string;
  moveset_note: string;
  warnings: string[];
  caps: string[];
  battles_attacked: number;
  battles_defended: number;
  pvp_battles: number;
  pvp_wins: number;
  npc_battles: number;
  catch_floor: string;
  from_fort: boolean;
  hatched_from_egg: boolean;
  weather_boosted: boolean;
  caught_in_party: boolean;
  untradable_traded: boolean;
  is_fusion: boolean;
  temp_evolved_id: number | null;
  mega_finish_ms: number | null;
  mega_points: number;
  deployed_duration_ms: number;
  deployed_lat: number | null;
  deployed_lng: number | null;
  deployed_fort_id: string;
  deployed_returned_ms: number | null;
  origin_move: string | null;
  _dup_excess?: boolean;
}

export interface CurrentMoveInfo {
  slot: 'fast' | 'charged' | 'charged2';
  name: string;
  type: string;
  elite: boolean;
}

export interface NeedsTypedMove {
  name: string;
  slot: 'fast' | 'charged';
  elite: boolean;
}

export interface ReportMon {
  id: string;
  verdict: VerdictType;
  species: string;
  sid?: string;
  form: string;
  dex: number;
  cp: number;
  level: number;
  iv: string;
  a: number | null;
  d: number | null;
  s: number | null;
  iv_pct: number;
  flags: string[];
  role: string;
  evolve_to: string;
  evolve_to_sid?: string | null;
  power_up_to: number | null;
  build_cp: number | null;
  moveset: string;
  moves: CurrentMoveInfo[];
  moves_need: string[];
  best_pvp: string;
  why: string;
  warnings: string[];
  search: string;
  cost_dust: number;
  cost_candy: number;
  cost_xl: number;
  raid_type: string;
  max_type: string;
  mega_type: string;
  pvp: {
    league: string;
    cap: number;
    species_rank: number;
    iv_rank: number;
    combined: number;
    eligible: boolean;
  }[];
  shadow: boolean;
  lucky: boolean;
  purified: boolean;
  year: number | null;
  hold: string;
  origin_label?: string;
  is_traded?: boolean;
  mon_tags?: string[];
  tag_conflicts?: string[];
  mega_level?: number;
  mega_forms?: number[];
  in_contest?: boolean;
  legacy_size_unknown?: boolean;
  purify_preview?: PurifyPreview | null;
  pvp_battle?: PvpBattleSummary | null;
  build_ready_now?: boolean;
  build_blockers?: string[];
  build_status?: BuildStatus;
  needs_moves?: string[];
  needs_elite_moves?: string[];
  needs_typed?: NeedsTypedMove[];
  needs_second_move?: boolean;
  elite_tm?: boolean;
  status_reason?: string;
  learn_after_evolve?: string[];
  max_move?: {
    attack: number;
    guard: number;
    spirit: number;
    gain_pct: number;
    gmax: boolean;
  };
  battles_attacked?: number;
  battles_defended?: number;
  pvp_battles?: number;
  pvp_wins?: number;
  npc_battles?: number;
  catch_floor?: string;
  from_fort?: boolean;
  hatched_from_egg?: boolean;
  weather_boosted?: boolean;
  caught_in_party?: boolean;
  untradable_traded?: boolean;
  is_fusion?: boolean;
  origin_move?: string | null;
  origin_events?: string[];
  location_card?: string;
  manual_override?: 'keep' | 'transfer' | null;
  wait_cd_move?: string | null;
  wait_cd_reason?: string;
}

export interface TeamMemberReport {
  id: string;
  name: string;
  cp: number;
  iv: string;
  sp_rank: number | null;
  iv_rank: number | null;
  level: number | null;
  target_cp: number | null;
  shadow: boolean;
  mega: boolean;
  evolve_from?: string | null;
  role: string;
  roles: Record<string, number>;
  battle_role?: 'lead' | 'safe_swap' | 'closer';
  switch_win_rate?: number;
}

export interface TeamCohesionHole {
  name: string;
  victims: number;
  threat_rank: number;
  beats: string[];
  beaten_by: string[];
}

export interface TeamCohesion {
  score: number;
  grade: string;
  coverage_pct: number;
  coverage_known_pct: number;
  covered: number;
  known: number;
  unknown: number;
  threats: number;
  backup_pct: number;
  consistency: number;
  bulk_pct: number;
  bulk_goal: number;
  type_overlap: number;
  roles: Record<string, string>;
  parts: Record<string, number>;
  holes: TeamCohesionHole[];
  sweep: string[];
  coverage_note?: string;
  archetype?: string;
  battle_win_0v0?: number;
  battle_win_1v1?: number;
  battle_win_2v2?: number;
  threat_score?: number;
  pvpoke_grades?: {
    coverage: string;
    bulk: string;
    safety: string;
    consistency: string;
  };
  safety_score?: number;
  consistency_score?: number;
  avg_bulk?: number;
}

export interface LeagueTeamsBlock {
  league: string;
  cap: number;
  teams: {
    n: number;
    members: TeamMemberReport[];
    score: number;
    cohesion: TeamCohesion | null;
  }[];
  threats: unknown[];
  threat_source: string;
  threat_note: string;
}

export interface RaidTeamEntry {
  id: string;
  slot: 'team' | 'backup';
  slot_num?: number;
  is_mega?: boolean;
  name: string;
  cp: number;
  iv: string;
  dps: number;
  level: number;
  shadow: boolean;
  moveset: string;
  moveset_suggested: string;
  moveset_note: string;
  verdict: VerdictType;
  from: string;
  evolve_to: string;
  /** ready = can be fielded now · needs_tm = a TM route exists · blocked = cannot be fixed with what you have */
  status?: RaidEntryStatus;
  /** Short human label for the badge, e.g. "Ready", "Needs TM", "Needs Elite TM". */
  status_label?: string;
  /** Why it is blocked (only when status === 'blocked'). */
  blocker?: RaidBlocker | null;
  /** True when the required TM(s) are currently in the bag (or the bag is unknown). */
  tm_in_bag?: boolean;
  /** Exact instructions, e.g. "TM Breaking Swipe → Earthquake (Charged TM) ...". */
  tm_actions?: string[];
  /** The moveset this DPS number is for (what you can use now when ready; the projected set otherwise). */
  dps_moveset?: string;
  /** Type-effective DPS vs a defender weak to the team type, with the moveset it is based on. */
  dps_basis?: 'current' | 'after_tm';
  /** Optional upgrade hint for an already-ready entry. */
  upgrade_hint?: string;
  /** Shown when the Fast Attack is kept on purpose because it decides this Pokémon's Max Move type. */
  fast_lock_note?: string;
}

export type RaidEntryStatus = 'ready' | 'needs_tm' | 'blocked';
export type RaidBlocker =
  | 'needs_elite_tm'
  | 'frustration'
  | 'evolve_first';

export interface RaidTeamTypeBlock {
  type: string;
  mega: {
    id: string;
    name: string;
    cp: number;
    iv: string;
    dps: number;
    active: boolean;
    from: string;
  } | null;
  entries: RaidTeamEntry[];
  /** Owned Pokémon that are NOT in the slots but would be worth a TM / event / purify (best first). */
  fix_queue?: RaidTeamEntry[];
  /** Counts used for the status header. */
  status_counts?: { ready: number; needs_tm: number; blocked: number };
}

export interface MaxTeamTypeBlock {
  type: string;
  entries: {
    id: string;
    name: string;
    cp: number;
    iv: string;
    iv_pct: number;
    dps: number;
    gmax: boolean;
    fast: string;
  }[];
}

export interface MegaPriorityEntry {
  id: string;
  form: string;
  mine: string;
  cp: number;
  iv: string;
  iv_pct: number;
  tags: string[];
}

export interface MegaBoostEntry {
  type: string;
  form: string;
  cp: number;
  iv: string;
  dps: number;
}

export interface PriorityEntry {
  id: string;
  league: string;
  species: string;
  cp: number;
  iv: string;
  iv_rank: number;
  species_rank: number;
  combined: number;
  from: number;
  to: number;
  target_cp: number;
  dust: number;
  candy: number;
  xl: number;
  tag: string;
  quality?: number;
  value?: number;
  shadow?: boolean;
  needs_second_move?: boolean;
  hint?: string;
}

export interface EvolveItem {
  id?: string;
  species: string;
  cp: number;
  iv: string;
  iv_pct: number;
  target: string;
  candy: number;
  item: string;
  via: string | null;
  role: string;
  wait_cd_move?: string | null;
  wait_cd_reason?: string;
  search?: string;
}

export interface SafeTransferBatch {
  key: 'common_junk' | 'wait_double_candy' | 'redundant_dupes';
  title: string;
  subtitle: string;
  total: number;
  safety_note: string;
  chunks: { index: number; count: number; query: string; length: number }[];
  excluded_collisions: number;
  sample_species: string[];
}

export interface EliteTmRoiItem {
  id: string;
  species: string;
  cp: number;
  iv: string;
  level: number;
  role: string;
  verdict: VerdictType;
  elite_moves: string[];
  dps_gain_pct: number | null;
  pvp_rank: number | null;
  roi_score: number;
  roi_tier: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: 'WORTH ELITE TM' | 'OPTIONAL' | 'SKIP — SAVE TM';
  reason: string;
  search: string;
}

export interface TransferRowItem {
  id: string;
  cp: number;
  iv: string;
  iv_pct: number;
  level: number;
  search: string;
  warn: string;
}

export interface TransferGroup {
  species: string;
  dex?: number;
  count: number;
  search: string;
  rows: TransferRowItem[];
}

export interface LastLookItem {
  id: string;
  species: string;
  cp: number;
  iv: string;
  iv_pct: number;
  level: number;
  search: string;
  triggers: string[];
  notes: string[];
  kept_comparators: {
    id: string;
    iv: string;
    iv_pct: number;
    verdict: VerdictType;
  }[];
}

export interface ReviewTriageItem {
  id: string;
  species: string;
  cp: number;
  iv: string;
  iv_pct: number;
  level: number;
  search: string;
  bucket: 'probably_keep' | 'probably_transfer' | 'uncertain';
  reasons: string[];
  advice: string;
  confirmed_transfer: boolean;
}

export interface WishlistCopyBrief {
  id: string;
  species?: string;
  iv: string;
  iv_pct: number;
  iv_rank?: number;
  cp: number;
  level: number;
  shadow: boolean;
  pct?: number;
  stage?: string;
  dynamax?: boolean;
  max_level?: number;
  gain_pct?: number;
  mega_level?: number;
  unlocked?: boolean;
}

export interface WishlistRow {
  rank: number;
  rank_plain?: number;
  species: string;
  sid: string;
  status: 'HAVE' | 'UPGRADE' | 'HUNT' | 'DECIDE' | 'NO DYNAMAX';
  best: WishlistCopyBrief | null;
  why: string[];
  tags: string[];
  dps?: number;
  score?: number;
  pct_of_top?: number;
  target?: string;
  has_shadow?: boolean;
  cheap?: boolean;
  team_slot?: number | null;
  would_enter?: boolean;
  rank_if_added?: number;
  replaces?: string | null;
  gain_vs_weakest?: number | null;
  gain_vs_best?: number | null;
  fixes_gap?: boolean;
  shadow?: boolean;
  role?: string;
  on_team?: boolean;
  boosts?: string[];
  attacks_as?: string;
  gmax?: boolean;
}

export interface ShowcaseRow {
  id: string;
  species: string;
  dex: number;
  score: number;
  height_score: number;
  weight_score: number;
  iv_score: number;
  xxl_bonus: number;
  height: number;
  weight: number;
  size: string;
  size_code: number;
  iv: string;
  cp: number;
  verdict: VerdictType;
  accurate: boolean;
  k: number | null;
  pct_of_max: number;
  in_contest?: boolean;
  contest_end_ms?: number | null;
  legacy_size_unknown?: boolean;
}

export interface HoldBucket {
  key: string;
  label: string;
  explain: string;
  lever: string;
  count: number;
}

export interface AuditCheck {
  check: string;
  ok: boolean;
  detail: string;
}

export interface GradeComponent {
  pct: number;
  weight: number;
  weighted: number;
  explain: string;
}

export interface LevelTheseItem {
  id: string;
  species: string;
  verdict: VerdictType;
  role: string;
  cp: number;
  iv: string;
  level: number;
  power_up_to: number | null;
  evolve_to: string;
  gap_fix: string;
  impact: number;
  cost: { dust: number; candy: number; xl: number };
  moves: CurrentMoveInfo[];
  tm_needed: string[];
  tm_typed?: NeedsTypedMove[];
  needs_second_move?: boolean;
  why: string[];
  search: string;
  can_build_now?: boolean;
  blockers?: string[];
}

export interface BriefingEventItem {
  id: string;
  name: string;
  type: string;
  heading: string;
  when: string;
  start: string | null;
  end: string | null;
  status: 'live' | 'soon' | 'tbd' | 'later';
  link: string;
  skip: string;
  score: number;
  bonuses: string[];
  notes: string[];
  wish_notes: string[];
  matches: {
    species: string;
    via?: string;
    label: string;
    status: string;
    fills_gap?: boolean;
    enters?: boolean;
    slot?: number;
    pri: number;
  }[];
  species: {
    name: string;
    sid: string;
    known: boolean;
    mega: boolean;
    shadow: boolean;
    types: string[];
    weak: { type: string; x: number }[];
    status: {
      owned: number;
      best_iv: number;
      best_cp: number;
      hundo: boolean;
      shiny: boolean;
      shadow: number;
      mega_unlocked?: boolean;
      mega_level?: number;
      to_transfer?: number;
    };
    squad: {
      id: string;
      name: string;
      from?: string;
      shadow: boolean;
      moveset: string;
      iv: string;
      cp: number;
      level: number;
      eff: number;
      type: string;
      src: 'raid_teams' | 'max_teams';
    }[];
    mega_slot?: { name: string; boosts: string; eff: number } | null;
  }[];
  teams?: {
    league: string;
    grade: string;
    members: string[];
    mega_capable: string[];
  }[];
}

export interface BriefingData {
  now: string;
  date: string;
  events_ok: boolean;
  feed_age_hours: number | null;
  headline: {
    buddy: {
      id: string;
      name: string;
      cp: number;
      iv_pct: number;
      mega_level: number;
      why: string;
      already: boolean;
    } | null;
    runner_up: {
      id: string;
      name: string;
      cp: number;
      iv_pct: number;
      mega_level: number;
      why: string;
      already: boolean;
    } | null;
    current_buddy: { name: string; cp: number } | null;
    mega_push: {
      name: string;
      event: string;
      unlocked: boolean;
      level: number;
    } | null;
    do_first: string;
    live: number;
    soon: number;
  };
  focus: {
    score: number;
    kind: string;
    tab: string;
    title: string;
    when: string;
    lines: string[];
    event?: string;
  }[];
  events: BriefingEventItem[];
  skip: { name: string; reason: string; link: string }[];
  storage: {
    stored: number;
    cap: number;
    pct: number;
    free: number | null;
    after_transfer: number | null;
    to_transfer: number;
  };
  account: {
    stored: number;
    cap: number;
    free: number | null;
    stardust: number;
    xl_candy: number;
    rare_candy: number;
    premium_passes: number;
    remote_passes: number;
    charged_tms: number;
    fast_tms: number;
    lucky_eggs: number;
    golden_razz: number;
    star_pieces: number;
    master_balls: number;
    level: number;
    km: number;
    hundos: number;
    shinies: number;
    lucky: number;
    shadow: number;
    purified: number;
    export_time: string;
  };
  dust_plan: {
    dust: number;
    spend: number;
    xl: number;
    queue_total: number;
    first_cost: number;
    targets: { species: string; iv: string; dust: number }[];
  };
}

export interface BagResources {
  stardust: number;
  rare_candy: number;
  xl_candy: number;
  fast_tms: number;
  charged_tms: number;
  elite_fast_tms: number;
  elite_charged_tms: number;
  premium_passes: number;
  remote_passes: number;
  mp: number;
  mp_replenish: number;
  max_boost: number;
  crowned_zacian_energy: number;
  crowned_zamazenta_energy: number;
  zygarde_cells: number;
  maple_a: number;
  maple_b: number;
  maple_c: number;
  sun_stones: number;
  kings_rocks: number;
  metal_coats: number;
  dragon_scales: number;
  upgrades: number;
  sinnoh_stones: number;
  unova_stones: number;
  poffins: number;
  shadow_gems: number;
  lucky_eggs: number;
  star_pieces: number;
  golden_razz: number;
  master_balls: number;
  silver_bottle_caps: number;
  gold_bottle_caps: number;
  pokecoins: number;
  total_bag_items: number;
  max_item_storage: number | null;
  solar_fusion_energy: number;
  lunar_fusion_energy: number;
  blaze_fusion_energy: number;
  volt_fusion_energy: number;
}

export interface SavedPartyAudit {
  name: string;
  combatLeagueId: string;
  league_label: string;
  cap: number | null;
  kind: 'pvp' | 'raid';
  members: {
    id: string;
    raw_id: string;
    found: boolean;
    name: string;
    cp: number;
    iv: string;
    verdict?: VerdictType;
    warning?: string;
    dex?: number;
  }[];
  battle_win_rate?: number;
  battle_grade?: string;
  battle_score?: number;
  threat_score?: number;
  pvpoke_grades?: {
    coverage: string;
    bulk: string;
    safety: string;
    consistency: string;
  };
  holes?: string[];
  bench_upgrade?: {
    replace_name: string;
    with_id: string;
    with_name: string;
    with_iv: string;
    gain_pct: number;
    reason: string;
    grade_before?: string;
    grade_after?: string;
    score_before?: number;
    score_after?: number;
    threat_before?: number;
    threat_after?: number;
    edps_before?: number;
    edps_after?: number;
  } | null;
  issues: string[];
}

export interface TradeCluster {
  label: string;
  lat: number;
  lng: number;
  count: number;
  tradable_count: number;
}

export interface TradePairItem {
  id_a: string;
  name_a: string;
  cp_a: number;
  iv_a: string;
  region_a: string;
  verdict_a: VerdictType;
  id_b: string;
  name_b: string;
  cp_b: number;
  iv_b: string;
  region_b: string;
  verdict_b: VerdictType;
  km: number;
  candy_bonus: number;
  xl_guaranteed: boolean;
}

export interface TradeMatcherData {
  untradable_count: number;
  clusters: TradeCluster[];
  distance_pairs_100km: TradePairItem[];
  lucky_candidates: {
    id: string;
    species: string;
    cp: number;
    iv: string;
    iv_pct?: number;
    year: number;
    verdict: VerdictType;
    search: string;
  }[];
  mirror_candidates: {
    species: string;
    dex: number;
    count: number;
    sample_ids: string[];
    search: string;
  }[];
  trade_search_chunks?: { index: number; count: number; query: string; length: number }[];
  guaranteed_lucky_remaining: number | null;
}

export interface BuddyTrackerData {
  active_buddy: {
    id: string;
    name: string;
    cp: number;
    level: number;
    iv: string;
    emotion_points: number;
    points_earned: number;
    km_progress: number;
    daily_swaps: number;
  } | null;
  evo_quests: {
    id: string;
    species: string;
    target_form: string;
    quest_name: string;
    progress: number;
    goal: number;
    pct: number;
    cp: number;
    iv: string;
    search: string;
  }[];
  walk_queue: {
    id: string;
    name: string;
    cp: number;
    iv_pct: number;
    mega_level: number;
    role: string;
    why: string;
  }[];
}

export interface EggAnalysisData {
  total: number;
  incubating: number;
  unincubated: number;
  eggs: {
    id: string;
    km_target: number;
    km_walked: number;
    incubating: boolean;
    slot_type: number;
    top_hatches: {
      dex: number;
      name: string;
      rarity: number;
      role: string;
    }[];
    value_score: number;
    priority_note: string;
  }[];
}

export interface BottleCapRecommendation {
  id: string;
  species: string;
  target_species: string;
  cp: number;
  level: number;
  current_iv: string;
  current_iv_pct: number;
  after_iv: string;
  after_iv_pct: number;
  points_gained: number;
  target_stat: 'ATK' | 'DEF' | 'HP' | 'ALL';
  target_stat_label: string;
  becomes_hundo: boolean;
  cp_l50_before: number | null;
  cp_l50_after: number | null;
  score: number;
  tier: 'S' | 'A' | 'B';
  roles: string[];
  rarity_tags: string[];
  reasons: string[];
  warnings: string[];
  search: string;
  verdict: VerdictType;
}

export interface BottleCapShadowNote {
  id: string;
  species: string;
  iv: string;
  purified_iv: string;
  purified_hundo: boolean;
  note: string;
  search: string;
}

export interface BottleCapSummary {
  silver_in_bag: number;
  gold_in_bag: number;
  silver: BottleCapRecommendation[];
  gold: BottleCapRecommendation[];
  shadow_purify_notes: BottleCapShadowNote[];
}

export interface ReportJson {
  meta: {
    generated: string;
    export_time: string;
    gm_date: string;
    gm_age_days: number;
    mons: number;
    eggs: number;
    pve_model: string;
    source: string;
    sorter: string;
  };
  counts: {
    verdicts: Record<string, number>;
    gates: Record<string, number>;
    special: Record<string, number>;
    roles: [string, number][];
  };
  readiness: {
    ready_min_known: number;
    eligible_total: number;
    status_counts: Record<string, number>;
    elite_demand: { fast: number; charged: number; both: number; mons: number };
  };
  mons: ReportMon[];
  teams: LeagueTeamsBlock[];
  raid_teams: RaidTeamTypeBlock[];
  max_teams: MaxTeamTypeBlock[];
  mega: {
    priority: MegaPriorityEntry[];
    boost: MegaBoostEntry[];
  };
  coverage: {
    type: string;
    status: 'OK' | 'GAP';
    usable: number;
    below: number;
    names: string[];
    fix: string[];
  }[];
  coverage_min: number;
  evolve: EvolveItem[];
  evolve_wait_cd_chunks?: { index: number; count: number; query: string; length: number }[];
  transfer: {
    protected: number;
    total: number;
    double_candy_count?: number;
    groups: TransferGroup[];
    last_look: LastLookItem[];
    collisions: Record<string, { id: string; iv: string; iv_pct: number; verdict: VerdictType }[]>;
    mass_search_chunks?: { index: number; count: number; query: string; length: number }[];
    safe_batches?: SafeTransferBatch[];
    review_triage: {
      enabled: boolean;
      probably_keep: ReviewTriageItem[];
      probably_transfer: ReviewTriageItem[];
      uncertain: ReviewTriageItem[];
    };
  };
  priority: {
    ml: PriorityEntry[];
    glul: PriorityEntry[];
    dn: PriorityEntry[];
    spend_first?: PriorityEntry[];
    dust_budget?: number;
  };
  budget?: {
    stardust: number | null;
    totals: { dust_needed: number; candy_needed: number; xl_needed: number };
  };
  bag_resources?: BagResources;
  saved_parties?: SavedPartyAudit[];
  trade_matcher?: TradeMatcherData;
  buddy_tracker?: BuddyTrackerData;
  eggs_summary?: EggAnalysisData;
  bottle_caps?: BottleCapSummary;
  tag_summary?: { name: string; color: number; count: number; conflicts: number }[];
  gbl_summary?: GblSummaryData;
  battle_mvps?: BattleMvpEntry[];
  origin_protection?: OriginProtectionSummary;
  eevee_tracker?: EeveeTrackerData;
  tag_audit?: TagAuditData;
  mega_optimizer?: MegaOptimizerData;
  curated_megas?: CuratedMegaTypeRow[];
  buddy_planner?: BuddyPoffinPlannerData;
  items_audit?: ItemsAuditData;
  live_gyms?: LiveGymsData;
  medals_hub?: MedalsHubData;
  xp_planner?: XpLevelPlanData;
  notes: string[];
  grade: {
    overall_pct: number;
    letter: string;
    components: Record<string, GradeComponent>;
    wishlist_all: {
      raid: Record<string, {
        type: string;
        usable: number;
        need: number;
        status: 'OK' | 'THIN' | 'GAP';
        team: { name: string; dps: number; iv: string; shadow: boolean }[];
        best_have: number;
        weakest: number;
        top_species: string;
        top_dps: number;
        have_pct: number;
        rows: WishlistRow[];
      }>;
      pvp: { league: string; cap: number; rows: WishlistRow[] }[];
      mega: Record<string, { type: string; rows: WishlistRow[]; owned: number }>;
      max: Record<string, {
        type: string;
        rows: WishlistRow[];
        team: { id?: string; name: string; cp: number; dps: number; iv: string }[];
        best_have: number;
        top_dps: number;
        have_pct: number;
      }>;
    };
    sections: {
      raid: {
        type: string;
        status: 'OK' | 'THIN' | 'GAP';
        usable: number;
        need: number;
        team: RaidTeamEntry[];
        fix_queue?: RaidTeamEntry[];
        status_counts?: { ready: number; needs_tm: number; blocked: number };
        mega: RaidTeamTypeBlock['mega'];
        best_dps: number;
        top_species: string;
        top_dps: number;
        strength_pct: number;
        avg_team_dps: number;
        letter: string;
        fill_picks: {
          name: string;
          cp: number;
          level: number;
          iv: string;
          dps: number;
          dust: number;
          evolve_to: string;
        }[];
        flex: {
          id: string;
          name: string;
          to: string;
          iv: string;
          level: number;
          shadow: boolean;
          verdict: VerdictType;
          score: number;
          pct: number;
          assigned: string;
          assigned_score: number | null;
        }[];
        wish: WishlistRow[];
      }[];
      pvp: {
        league: string;
        cap: number;
        is_cup: boolean;
        teams: LeagueTeamsBlock['teams'];
        distinct_teams: number;
        team_score_pct: number;
        best_grade: string;
        threat_source: string;
        threat_note: string;
        builds: {
          id: string;
          species: string;
          iv: string;
          cp: number;
          role: string;
          status: string;
          needs: string[];
          needs_second_move?: boolean;
          search: string;
        }[];
        completion_pct: number;
        wish: WishlistRow[];
      }[];
      mega: {
        priority: MegaPriorityEntry[];
        types: {
          type: string;
          covered: boolean;
          forms: string[];
          wish: WishlistRow[];
          all: WishlistRow[];
        }[];
        covered: number;
        total: number;
        curated?: CuratedMegaTypeRow[];
      };
      max: {
        types: {
          type: string;
          covered: boolean;
          team: { id?: string; name: string; cp: number; dps: number; iv: string }[];
          have_pct: number;
          wish: WishlistRow[];
          all: WishlistRow[];
        }[];
        covered: number;
        total: number;
      };
      depth: {
        hundos: number;
        hundo_target: number;
        hundo_list: { species: string; count: number }[];
        species: number;
        species_target: number;
        pvp_ranked: number;
        pvp_total: number;
        pvp_pct: number;
        anchors: {
          species: string;
          league: string;
          iv_rank: number;
          cp: number;
          iv: string;
          verdict: VerdictType;
        }[];
        parts: { label: string; weight: number; pct: number; text: string }[];
      };
    };
    wishlist: {
      species: string;
      species_sid: string;
      is_shadow: boolean;
      fixes: string;
      rank_in_type: number;
      cheap: boolean;
      urgency: number;
      status: string;
      gain_vs_weakest: number | null;
      reason: string;
    }[];
    keep_summary: {
      counts: Record<string, number>;
      total_protected: number;
      total: number;
    };
    level_these: LevelTheseItem[];
    tm_here: {
      regular: {
        id: string;
        species: string;
        cp: number;
        iv: string;
        level: number;
        role: string;
        needs: string;
        needs_typed?: NeedsTypedMove[];
        needs_second_move?: boolean;
        moves: CurrentMoveInfo[];
        search: string;
      }[];
      elite_worth: {
        id: string;
        species: string;
        cp: number;
        iv: string;
        level: number;
        role: string;
        needs: string;
        needs_typed?: NeedsTypedMove[];
        needs_second_move?: boolean;
        moves: CurrentMoveInfo[];
        search: string;
      }[];
      elite_skip: { count: number; summary: string };
      elite_roi?: EliteTmRoiItem[];
    };
    review_actions: {
      id: string;
      action: string;
      label: string;
      species: string;
      cp: number;
      iv: string;
      detail: string;
    }[];
    cup_readiness: Record<string, {
      title: string;
      cap: number;
      legal: number;
      qualified: number;
      built: number;
      top_builds: {
        species: string;
        from: string;
        cp: number;
        iv: string;
        species_rank: number;
        iv_rank: number;
        is_build: boolean;
      }[];
    }>;
    coverage: {
      type: string;
      status: 'OK' | 'THIN' | 'GAP';
      usable: number;
      need: number;
      names: string[];
    }[];
    narrative: { headline: string; body: string };
  };
  placement: {
    raid: {
      covered_before: number;
      covered_after: number;
      types: number;
      moved: { id: string; name: string; iv: string; level: number; from: string; to: string; why: string }[];
    };
    max: {
      covered_before: number;
      covered_after: number;
      types: number;
      moved: { id: string; name: string; iv: string; level: number; from: string; to: string; why: string }[];
    };
  };
  holding: HoldBucket[];
  max_battle: {
    dynamax: number;
    gigantamax: number;
    attack_levels: Record<string, number>;
    guard_unlocked: number;
    spirit_unlocked: number;
    gain_pct: number;
    attackers: number;
    attackers_below_3: number;
    tanks: {
      id: string;
      species: string;
      evolves_to: string;
      iv: string;
      cp: number;
      level: number;
      verdict: VerdictType;
      unlocked: boolean;
      move_level: number;
      score: number;
      pct_of_best: number;
      need: string;
    }[];
    healers: {
      id: string;
      species: string;
      evolves_to: string;
      iv: string;
      cp: number;
      level: number;
      verdict: VerdictType;
      unlocked: boolean;
      move_level: number;
      score: number;
      pct_of_best: number;
      need: string;
    }[];
    power_table: { max: Record<number, number>; gmax: Record<number, number> };
  };
  showcase: {
    enabled: boolean;
    formula: string;
    max_score: number;
    size_table_ok: boolean;
    accurate_count: number;
    xxl_count: number;
    scored_count: number;
    active_contest_count?: number;
    legacy_unknown_count?: number;
    rows: ShowcaseRow[];
    best_per_species: ShowcaseRow[];
  };
  settings: {
    leagues: string[];
    cups: string[];
    available_leagues: { id: string; name: string; cap: number }[];
    available_cups: { key: string; name: string }[];
    user_cfg: Record<string, unknown>;
  };
  briefing?: BriefingData;
  audit: AuditCheck[];
  _cannot_dynamax?: string[];
}

export interface GblSeasonRecord {
  label: string;
  season: number | null;
  rank: number | null;
  rating: number | null;
  current_streak: number;
  longest_streak: number;
  stardust_earned: number;
  total_battles: number;
  total_wins: number;
  win_rate_pct: number;
}

export interface GblSummaryData {
  has_data: boolean;
  current: GblSeasonRecord | null;
  previous: GblSeasonRecord | null;
  lifetime: GblSeasonRecord | null;
  current_set_wins: number | null;
  current_set_battles: number | null;
  current_set_results: { wins: number; battles: number; rank: number | null }[];
}

export interface BattleMvpEntry {
  id: string;
  species: string;
  cp: number;
  iv: string;
  verdict: VerdictType;
  battles_attacked: number;
  battles_defended: number;
  pvp_battles: number;
  pvp_wins: number;
  npc_battles: number;
  total_battles: number;
  role: string;
}

export interface OriginProtectionSummary {
  protected_count: number;
  origin_moves_count: number;
  event_background_count: number;
  fusion_count: number;
  active_tickets: { id: string; start: string; end: string; active_now: boolean }[];
  items: {
    id: string;
    species: string;
    cp: number;
    iv: string;
    reasons: string[];
    verdict: VerdictType;
    search: string;
  }[];
}

export interface EeveeTrackerData {
  tricks: {
    nickname: string;
    evolution: string;
    dex: number;
    used: boolean;
    raw_token?: string;
  }[];
  used_count: number;
  remaining_count: number;
  caught_in_party_count: number;
}

export interface TagAuditMismatch {
  id: string;
  species: string;
  cp: number;
  iv: string;
  verdict: VerdictType;
  category: 'wrong_cap' | 'duplicate_league' | 'transfer_tagged' | 'untagged_build' | 'iv_mismatch' | 'trade_conflict';
  issue: string;
  suggestion: string;
  search: string;
  tags?: string[];
  recommended_tag?: string;
}

export interface TagAuditData {
  total_mismatches: number;
  wrong_cap_count: number;
  transfer_tagged_count: number;
  untagged_build_count: number;
  mismatches: TagAuditMismatch[];
  untagged_build_search: string;
  transfer_tagged_search: string;
}

export interface MegaOptimizerEntry {
  id: string;
  species: string;
  mega_name: string;
  cp: number;
  iv: string;
  iv_pct: number;
  mega_level: number;
  mega_points: number;
  points_to_next: number;
  next_level: number;
  boosts: string[];
  active_now: boolean;
  active_remaining_min: number | null;
  verdict: VerdictType;
  search: string;
}

export interface MegaWalkTarget {
  id: string;
  species: string;
  mega_name: string;
  cp: number;
  iv_pct: number;
  mega_level: number;
  buddy_km: number;
  poffin_km: number;
  energy_per_candy: number;
  reason: string;
  search: string;
}

export interface MegaOptimizerData {
  unlocked_total: number;
  lv1_count: number;
  lv2_count: number;
  lv3_count: number;
  active_megas: MegaOptimizerEntry[];
  cycle_queue: MegaOptimizerEntry[];
  walk_for_energy?: MegaWalkTarget[];
}

export interface BuddyPoffinTarget {
  id: string;
  species: string;
  cp: number;
  iv: string;
  iv_pct: number;
  buddy_km: number;
  poffin_km: number;
  mega_level: number;
  role: string;
  reason: string;
}

export interface BuddyPoffinPlannerData {
  emotion_points: number;
  excited_threshold: number;
  points_to_excited: number;
  is_excited: boolean;
  daily_swaps_used: number;
  daily_swaps_max: number;
  daily_swaps_remaining: number;
  poffins_in_bag: number;
  hearts_summary: { label: string; count: number }[];
  poffin_targets: BuddyPoffinTarget[];
}

export interface BagItemEntry {
  item_id: number;
  name: string;
  raw_name: string;
  category: 'Balls' | 'Potions & Revives' | 'Berries' | 'TMs & Upgrades' | 'Evo & Fusion' | 'Passes & Boosts' | 'Special & Timed';
  count: number;
  unseen: boolean;
  ignore_bag_space: boolean;
  expiring: boolean;
  expiration_text: string;
  consolation_count: number;
}

export interface ItemsAuditData {
  total_counted_items: number;
  max_item_storage: number | null;
  bag_pct: number | null;
  pokecoins: number;
  stardust: number;
  max_pokemon_storage: number | null;
  pokemon_count: number;
  pokemon_pct: number | null;
  reclaimable_transfers: number;
  purchased_pokemon_upgrades: number;
  purchased_item_upgrades: number;
  purchased_gift_upgrades: number;
  purchased_postcard_upgrades: number;
  affordable_upgrades: number;
  recommended_upgrade: 'pokemon' | 'item' | 'balanced' | 'none';
  upgrade_reason: string;
  expiring_items: BagItemEntry[];
  consolation_items: BagItemEntry[];
  category_totals: { category: BagItemEntry['category']; count: number; pct: number }[];
  bloat_warnings: string[];
  all_items: BagItemEntry[];
}

export interface LiveGymDefender {
  id: string;
  species: string;
  cp: number;
  cp_when_deployed: number;
  iv: string;
  fort_id: string;
  deployed_hours: number;
  deployed_label: string;
  est_coins: number;
  lat: number | null;
  lng: number | null;
  is_training: boolean;
  returned: boolean;
}

export interface LiveGymsData {
  defenders: LiveGymDefender[];
  active_count: number;
  training_count: number;
  daily_coins_earned: number;
  daily_coin_cap: number;
  daily_coins_remaining: number;
  est_pending_coins: number;
  daily_bonus_streak: number | null;
}

export type MedalTier = 'None' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface TypeCatchMedal {
  type: string;
  count: number;
  tier: MedalTier;
  bonus: number;
  next_target: number | null;
  pct_to_next: number;
}

export interface AchievementMedal {
  key: string;
  label: string;
  category: 'Catch & Explore' | 'Battle & Rocket' | 'Social & Trade' | 'Gym & Contest';
  value: number;
  unit?: string;
  tier: MedalTier;
  next_target: number | null;
  pct_to_next: number;
}

export interface MedalsHubData {
  has_player_data: boolean;
  level: number | null;
  type_medals: TypeCatchMedal[];
  platinum_type_count: number;
  avg_raid_catch_bonus: number;
  achievements: AchievementMedal[];
  combat_badges: { name: string; count: number }[];
  contest_badges: { name: string; count: number }[];
  event_badges_count: number;
  event_badges: string[];
}

export interface XpEvolveFodderGroup {
  species: string;
  dex: number;
  count: number;
  candy_cost: number;
  xp_each: number;
}

export interface XpLevelPlanData {
  has_data: boolean;
  level: number;
  experience: number;
  prev_level_exp: number;
  next_level_exp: number;
  xp_into_level: number;
  xp_needed_total: number;
  xp_remaining: number;
  progress_pct: number;
  lucky_eggs_in_bag: number;
  transfer_evolve_count: number;
  total_evolutions_lifetime: number;
  xp_no_egg: number;
  xp_with_egg: number;
  eggs_needed_for_fodder: number;
  best_friends_needed: number;
  five_star_raids_needed: number;
  fodder_groups: XpEvolveFodderGroup[];
}

export interface AnalysisProgress {
  stage: string;
  pct: number;
}
