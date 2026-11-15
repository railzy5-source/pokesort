import {
  cleanSpeciesName,
  FORM_ALIASES,
  FORM_SUFFIXES,
  GMAX_ONLY_DEX,
  MEGA_SUFFIXES,
  MEGA_TAGS,
  normStr,
  PRIMAL_BOOST_TYPES,
  PRIMAL_SUFFIXES,
} from './defaultConfig';
import { CPM, levelFromCpm } from './cpmTable';
import type { MonModel, PvPokeSpecies, RawPokemon } from './types';

export function resolveAccount(rawData: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!rawData || typeof rawData !== 'object') return {};
  const acc = rawData.account;
  return acc && typeof acc === 'object' ? (acc as Record<string, unknown>) : {};
}

export function accField<T = unknown>(
  rawData: Record<string, unknown> | null | undefined,
  key: string,
): T | undefined {
  if (!rawData || typeof rawData !== 'object') return undefined;
  const acc = resolveAccount(rawData);
  const aVal = acc[key];
  const rVal = rawData[key];
  if (Array.isArray(aVal) && aVal.length > 0) return aVal as T;
  if (Array.isArray(rVal) && rVal.length > 0) return rVal as T;
  if (aVal !== undefined && aVal !== null) return aVal as T;
  return rVal as T | undefined;
}

export function isCrownedForm(mon: MonModel): boolean {
  const sid = mon.species?.speciesId || '';
  if (sid.includes('crowned')) return true;
  return normStr(mon.form_name).includes('crowned');
}

export function looksLikeCostume(formName: string, formId: string | number | undefined): boolean {
  const fn = normStr(formName);
  if (fn === '' || fn === 'unset' || fn === 'normal') return false;
  if (fn in FORM_ALIASES) return false;
  const hasEventToken =
    fn.includes('202') ||
    fn.includes('halloween') ||
    fn.includes('goggles') ||
    fn.includes('glasshelmet') ||
    fn.includes('visor') ||
    fn.includes('wildarea') ||
    fn.includes('anniversary') ||
    fn.includes('costume') ||
    fn.includes('holiday') ||
    fn.includes('fashion') ||
    fn.includes('party') ||
    fn.includes('detective') ||
    fn.includes('scarf');
  if (hasEventToken && !fn.includes('crowned')) {
    return true;
  }
  if (!formId) return false;
  for (const suf of FORM_SUFFIXES) {
    if (fn.includes(suf) || fn.endsWith(suf)) return false;
  }
  return true;
}

export function isMegaForm(sid: string, tags: Set<string>): boolean {
  for (const t of MEGA_TAGS) {
    if (tags.has(t)) return true;
  }
  return PRIMAL_SUFFIXES.some((s) => sid.endsWith(s));
}

export function megaBaseOf(sid: string): string {
  let parts = (sid || '').split('_');
  if (
    parts.length >= 2 &&
    (parts[parts.length - 1] === 'x' || parts[parts.length - 1] === 'y') &&
    MEGA_SUFFIXES.includes(parts[parts.length - 2])
  ) {
    parts = parts.slice(0, -1);
  }
  if (parts.length >= 2 && MEGA_SUFFIXES.includes(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  return parts.join('_');
}

export function boostTypesFor(megaSid: string, megaSpecies?: PvPokeSpecies): string[] {
  if (megaSid in PRIMAL_BOOST_TYPES) {
    return [...PRIMAL_BOOST_TYPES[megaSid]];
  }
  return (megaSpecies?.types || []).map((t) => t.toLowerCase());
}

export function extractYear(p: RawPokemon): [number | null, string | null] {
  for (const key of ['creationTimeMs', 'caughtTime', 'capturedTimestampMs'] as const) {
    const val = p[key];
    if (!val) continue;
    const ms = Number(val);
    if (!Number.isNaN(ms) && ms > 1_000_000_000_000) {
      const dt = new Date(ms);
      if (!Number.isNaN(dt.getTime())) {
        return [dt.getUTCFullYear(), dt.toISOString().slice(0, 10)];
      }
    }
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      const yr = parseInt(val.slice(0, 4), 10);
      return [Number.isNaN(yr) ? null : yr, val.slice(0, 10)];
    }
  }
  return [null, null];
}

export function isDynamax(p: RawPokemon): boolean {
  const disp = p.pokemonDisplay || {};
  const bm = Number(disp.breadModeEnum || 0);
  if (bm === 1 || bm === 2 || bm === 3) return true;
  if (Array.isArray(p.breadMoves) && p.breadMoves.length > 0) return true;
  return false;
}

export function isGigantamax(p: RawPokemon): boolean {
  const disp = p.pokemonDisplay || {};
  const bm = Number(disp.breadModeEnum || 0);
  if (bm === 2 || bm === 3) return true;
  const dex = Number(p.pokemonId || p.dex || 0);
  if (bm === 1 && GMAX_ONLY_DEX.has(dex)) return true;
  return false;
}

export function megaLevelInfo(p: RawPokemon): [number, number, number[]] {
  const disp = (p.pokemonDisplay || {}) as Record<string, unknown>;
  const megaObj =
    disp.megaEvolutionLevel && typeof disp.megaEvolutionLevel === 'object'
      ? (disp.megaEvolutionLevel as Record<string, unknown>)
      : null;

  const forms = Array.isArray((p as Record<string, unknown>).megaEvolvedForms)
    ? ((p as Record<string, unknown>).megaEvolvedForms as unknown[])
        .map((x) => Number(x))
        .filter((x) => !Number.isNaN(x) && x > 0)
    : [];

  const pts = Number(
    megaObj?.points ??
      (p as Record<string, unknown>).megaPoints ??
      disp.megaPoints ??
      0,
  );
  const mlRaw = Number(
    megaObj?.level ??
      p.megaLevel ??
      disp.megaLevel ??
      0,
  );
  if (mlRaw >= 1) return [mlRaw, pts, forms];
  if (pts >= 30) return [3, pts, forms];
  if (pts >= 7) return [2, pts, forms];
  if (pts >= 1) return [1, pts, forms];
  if (forms.length > 0 || isCurrentlyMega(p)) return [1, pts, forms];
  return [0, pts, forms];
}

export function isCurrentlyMega(p: RawPokemon): boolean {
  const disp = p.pokemonDisplay || {};
  const cur = Number(disp.currentTempEvolution ?? disp.tempEvolution ?? 0);
  return cur > 0;
}

export function hasMegaEvolvedBefore(p: RawPokemon): boolean {
  if (p.hasMegaUnlocked) return true;
  const [ml, pts, forms] = megaLevelInfo(p);
  return ml >= 1 || pts >= 1 || forms.length > 0 || isCurrentlyMega(p);
}

export function knownMoveIds(p: RawPokemon): (string | number)[] {
  const out: (string | number)[] = [];
  for (const k of ['move1', 'move2', 'move3'] as const) {
    const v = p[k];
    if (v !== undefined && v !== null && v !== '' && v !== 0) {
      out.push(v);
    }
  }
  if (Boolean((p as Record<string, unknown>).move2IsPurifiedExclusive) && !out.includes(323) && !out.includes('323')) {
    out.push(323);
  }
  return out;
}

const ORIGIN_CASE_LABELS: Record<number, string> = {
  0: 'Wild',
  1: 'Wild',
  2: 'Egg Hatch',
  3: 'Raid Boss',
  4: 'Research',
  5: 'GBL / Special',
  6: 'Rocket Shadow',
  10: 'Party / Route',
  13: 'Max Battle',
};

export interface ParsedExport {
  rawData: Record<string, unknown>;
  pokemon: RawPokemon[];
  eggRecords: RawPokemon[];
  eggs: number;
  tagMap: Map<string, { name: string; color: number }>;
  exportRefMs: number;
  missingOpt: string[];
  cpmMismatch: number;
  cpmTotal: number;
}

export function parsePgsExport(input: unknown): ParsedExport {
  let rawData: Record<string, unknown> = {};
  let list: RawPokemon[] = [];

  if (Array.isArray(input)) {
    list = input as RawPokemon[];
    rawData = { pokemon: list };
  } else if (input && typeof input === 'object') {
    rawData = input as Record<string, unknown>;
    const accObj = resolveAccount(rawData);
    const candidates = [
      rawData.pokemon,
      rawData.pokemons,
      rawData.list,
      accObj.pokemons,
      accObj.pokemon,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        list = c as RawPokemon[];
        break;
      }
    }
    if (list.length === 0) {
      for (const c of candidates) {
        if (Array.isArray(c)) {
          list = c as RawPokemon[];
          break;
        }
      }
    }
  }

  if (list.length === 0) {
    throw new Error('No Pokemon records found in this JSON file.');
  }

  const normalized = list.map((p) => {
    const atk = Number(p.individualAttack ?? p.atk ?? 0);
    const def = Number(p.individualDefense ?? p.def ?? 0);
    const sta = Number(p.individualStamina ?? p.sta ?? 0);
    const dex = Number(p.pokemonId ?? p.pokemon_id ?? p.dex ?? 0);
    let cpm = Number(p.cpMultiplier ?? p.cpm ?? 0);
    const addCpm = Number(p.additionalCpMultiplier ?? 0);
    if (!cpm && typeof p.level === 'number' && CPM[p.level]) {
      cpm = CPM[p.level];
    }
    return {
      ...p,
      pokemonId: dex,
      individualAttack: atk,
      individualDefense: def,
      individualStamina: sta,
      cp: Number(p.cp ?? 10),
      cpMultiplier: cpm || CPM[20],
      additionalCpMultiplier: addCpm,
    };
  });

  // Tag lookup map (supports both top-level tags and account.tags, numeric or string IDs)
  const tagMap = new Map<string, { name: string; color: number }>();
  const rawTags = accField<unknown[]>(rawData, 'tags') || [];
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (!t || typeof t !== 'object') continue;
      const tr = t as { id?: string | number; name?: string; color?: number };
      if (tr.id !== undefined && tr.id !== null && tr.name) {
        const entry = { name: String(tr.name), color: Number(tr.color ?? 0) };
        tagMap.set(String(tr.id), entry);
        const asNum = Number(tr.id);
        if (Number.isFinite(asNum)) {
          tagMap.set(String(asNum), entry);
        }
      }
    }
  }

  // Reference export clock from newest catch/buddy/time timestamp
  let exportRefMs = 0;
  for (const p of normalized) {
    const cMs = Number(p.creationTimeMs || 0);
    if (cMs > exportRefMs && cMs < 4_000_000_000_000) exportRefMs = cMs;
  }
  const accRaw = resolveAccount(rawData);
  const buddyProto = (accRaw.buddyPokemonProto || {}) as Record<string, unknown>;
  const lastKmMs = Number(buddyProto.lastKmAwardedMs || 0);
  if (lastKmMs > exportRefMs && lastKmMs < 4_000_000_000_000) exportRefMs = lastKmMs;
  if (typeof rawData.time === 'string') {
    const tMs = Date.parse(rawData.time);
    if (!Number.isNaN(tMs) && tMs > exportRefMs) exportRefMs = tMs;
  }
  if (exportRefMs <= 0) exportRefMs = Date.now();

  // Validate CPM distribution
  let bad = 0;
  let total = 0;
  for (const p of normalized) {
    if (p.isEgg) continue;
    total++;
    const tot = (p.cpMultiplier || 0) + (p.additionalCpMultiplier || 0);
    const lvl = levelFromCpm(tot);
    if (Math.abs((CPM[lvl] ?? tot) - tot) > 0.008) bad++;
  }

  const eggRecords = normalized.filter((p) => Boolean(p.isEgg));
  const eggs = eggRecords.length;
  const nonEggs = normalized.filter((p) => !p.isEgg);

  const missingOpt: string[] = [];
  if (nonEggs.length > 0 && !nonEggs.some((p) => (p.pokemonDisplay || {}).currentTempEvolution !== undefined)) {
    // Only check if truly missing across export
  }

  return {
    rawData,
    pokemon: nonEggs,
    eggRecords,
    eggs,
    tagMap,
    exportRefMs,
    missingOpt,
    cpmMismatch: bad,
    cpmTotal: total,
  };
}

export function toMon(
  p: RawPokemon,
  idx: number,
  ctx?: { tagMap?: Map<string, { name: string; color: number }>; exportRefMs?: number },
): MonModel {
  const disp = p.pokemonDisplay || {};
  const a = Number(p.individualAttack ?? 0);
  const d = Number(p.individualDefense ?? 0);
  const s = Number(p.individualStamina ?? 0);
  const tot = Number(p.cpMultiplier ?? 0.5974) + Number(p.additionalCpMultiplier ?? 0);
  const [year] = extractYear(p);
  const rawId = p.id ?? p.uid;
  const uid = `${idx}:${rawId !== undefined && rawId !== null ? String(rawId) : ''}`;
  const dex = Number(p.pokemonId ?? p.dex ?? 0);
  const [megaLevel, megaPoints, megaForms] = megaLevelInfo(p);

  const breadMoves = Array.isArray(p.breadMoves)
    ? (p.breadMoves as { moveType?: number; moveLevel?: number }[])
    : [];
  let maxAttack = Number(p.maxAttackLevel ?? 0);
  let maxGuard = Number(p.maxGuardLevel ?? 0);
  let maxSpirit = Number(p.maxSpiritLevel ?? 0);
  for (const bm of breadMoves) {
    const mt = Number(bm.moveType || 0);
    const ml = Number(bm.moveLevel || 0);
    if (mt === 1) maxAttack = Math.max(maxAttack, ml);
    else if (mt === 2) maxGuard = Math.max(maxGuard, ml);
    else if (mt === 3) maxSpirit = Math.max(maxSpirit, ml);
  }

  const lc = disp.locationCard as Record<string, unknown> | string | undefined;
  const locationCard =
    typeof lc === 'object' && lc !== null
      ? String(lc.locationCard ?? '')
      : typeof lc === 'string'
      ? lc
      : '';

  const formName = String(disp.formName || p.form || '');
  const formId: string | number =
    typeof disp.form === 'string' || typeof disp.form === 'number'
      ? disp.form
      : typeof p.formId === 'string' || typeof p.formId === 'number'
      ? p.formId
      : 0;
  const genderVal: string | number =
    typeof disp.gender === 'string' || typeof disp.gender === 'number'
      ? disp.gender
      : typeof p.gender === 'string' || typeof p.gender === 'number'
      ? p.gender
      : 3;

  // B:4 Resolve numeric/string pokemonTagIds -> actual tag names
  const rawTagStrings = Array.isArray(p.tags) ? p.tags.map(String) : [];
  const rawTagIds = Array.isArray((p as Record<string, unknown>).pokemonTagIds)
    ? ((p as Record<string, unknown>).pokemonTagIds as unknown[])
    : [];
  const monTagsSet = new Set<string>(rawTagStrings);
  for (const tid of rawTagIds) {
    if (tid === undefined || tid === null) continue;
    const key = String(tid);
    const entry = ctx?.tagMap?.get(key);
    if (entry?.name) monTagsSet.add(entry.name);
    else if (key) monTagsSet.add(`Tag #${key}`);
  }
  const monTags = Array.from(monTagsSet);

  // B:3 Origin, Catch Floor, Traded & Purify Preview
  const rawRec = p as Record<string, unknown>;
  const od = (p.originDetail || {}) as Record<string, unknown>;
  const originCase = Number(od.originDetailCase ?? 0);
  const isShadow = disp.alignment === 1 || Boolean(p.isShadow || p.shadow);
  const isPurified = disp.alignment === 2 || Boolean(p.isPurified || p.purified);
  const isLucky = Boolean(p.isLucky ?? p.lucky);
  const fromFort = Boolean(rawRec.fromFort);
  const hatchedFromEgg = Boolean(rawRec.hatchedFromEgg);
  const weatherBoosted = Number(
    (disp as Record<string, unknown>).weatherBoostedCondition ?? rawRec.weatherBoostedCondition ?? 0,
  ) > 0;
  const caughtInParty = Boolean(rawRec.caughtInParty);
  const level = levelFromCpm(tot);
  const isTraded = Number(rawRec.tradedTimeMs || 0) > 0 || Boolean(rawRec.tradingOriginalOwnerHash);

  const originLabel =
    hatchedFromEgg
      ? 'Egg Hatch'
      : fromFort && !isShadow
      ? 'Raid / Fort'
      : ORIGIN_CASE_LABELS[originCase] ??
        (originCase > 0 ? `Origin #${originCase}` : isShadow ? 'Rocket Shadow' : 'Wild');

  let catchFloor = '0/0/0 Wild';
  if (isLucky) catchFloor = '12/12/12 Lucky Trade';
  else if (isTraded) catchFloor = '1/1/1–5/5/5+ Friend Trade';
  else if (isShadow && (originCase === 3 || fromFort)) catchFloor = '6/6/6 Shadow Raid';
  else if (isShadow && weatherBoosted) catchFloor = '4/4/4 Weather Shadow';
  else if (isShadow) catchFloor = '0/0/0 Rocket Shadow';
  else if (hatchedFromEgg || originCase === 2) catchFloor = '10/10/10 Egg Hatch';
  else if (originCase === 3 || fromFort) catchFloor = '10/10/10 Raid Boss';
  else if (originCase === 4) catchFloor = '10/10/10 Research';
  else if (originCase === 5) catchFloor = '10/10/10 GBL / Special';
  else if (originCase === 13) catchFloor = '10/10/10 Max Battle';
  else if (weatherBoosted) catchFloor = '4/4/4 Weather Boosted';

  // Battle History (Gym, PvP, NPC)
  const battlesAttacked = Number(p.battlesAttacked ?? 0);
  const battlesDefended = Number(p.battlesDefended ?? 0);
  const pvpStats = (rawRec.pvpCombatStats || {}) as Record<string, unknown>;
  const pvpWins = Number(pvpStats.numWon ?? pvpStats.totalWins ?? pvpStats.wins ?? 0);
  const pvpBattles = Number(
    pvpStats.numPlayed ?? pvpStats.totalBattles ?? pvpStats.battles ?? pvpWins,
  );
  const npcStats = (rawRec.npcCombatStats || {}) as Record<string, unknown>;
  const npcBattles = Number(
    npcStats.numPlayed ?? npcStats.totalBattles ?? npcStats.numWon ?? 0,
  );

  // Gym deployment & active Mega timer
  const deployedFortId = String(p.deployedFortId || p.fortId || '');
  const deployedDurationMs = Number(rawRec.deployedDurationMs ?? 0);
  const deployedReturnedMsRaw = Number(rawRec.deployedReturnedTimestampMs ?? 0);
  const deployedReturnedMs = deployedReturnedMsRaw > 0 ? deployedReturnedMsRaw : null;
  const deployedLatRaw = rawRec.deployedGymLatDegree;
  const deployedLngRaw = rawRec.deployedGymLngDegree;
  const deployedLat =
    deployedLatRaw !== undefined && deployedLatRaw !== null && Number(deployedLatRaw) !== 0
      ? Number(deployedLatRaw)
      : null;
  const deployedLng =
    deployedLngRaw !== undefined && deployedLngRaw !== null && Number(deployedLngRaw) !== 0
      ? Number(deployedLngRaw)
      : null;

  const megaFinishRaw = Number(
    (disp as Record<string, unknown>).temporaryEvolutionFinishMs ?? rawRec.temporaryEvolutionFinishMs ?? 0,
  );
  const megaFinishMs = megaFinishRaw > 0 ? megaFinishRaw : null;
  const isFusion = Boolean(rawRec.isFusion);
  const tempEvolvedRaw = Number(rawRec.tempEvolvedPokemonId ?? 0);
  const tempEvolvedId = tempEvolvedRaw > 0 ? tempEvolvedRaw : null;

  let purifyPreview: MonModel['purify_preview'] = null;
  if (isShadow) {
    const pa = Math.min(15, a + 2);
    const pd = Math.min(15, d + 2);
    const ps = Math.min(15, s + 2);
    const pPct = Math.round(((pa + pd + ps) / 45) * 1000) / 10;
    purifyPreview = {
      purified_iv: `${pa}/${pd}/${ps}`,
      purified_iv_pct: pPct,
      becomes_hundo: pa === 15 && pd === 15 && ps === 15,
      purified_level: Math.max(level, 25),
      purified_cp: null,
      return_note: 'Replaces Frustration with Return (+2/+2/+2 IVs, minimum Level 25).',
    };
  }

  // B:5 Showcase Contest & Legacy Size
  const ci = (rawRec.pokemonContestInfo || {}) as Record<string, unknown>;
  const contestId = String(ci.contestId || '');
  const contestEndMs = Number(ci.contestEndTimeMs || 0) || null;
  const freeUpMs = Number(ci.freeUpTimeMs || 0);
  const refMs = ctx?.exportRefMs || Date.now();
  const inContest =
    Boolean(contestId) &&
    freeUpMs === 0 &&
    (contestEndMs === null || contestEndMs >= refMs - 14 * 86400_000);
  const legacySizeUnknown = Number(p.size || 0) === 0;

  return {
    idx,
    uid,
    dex,
    raw: p,
    cp: Number(p.cp ?? 10),
    a,
    d,
    s,
    iv_pct: Math.round(((a + d + s) / 45) * 1000) / 10,
    level,
    is_shadow: isShadow,
    is_purified: isPurified,
    is_shiny: Boolean(disp.shiny ?? p.isShiny ?? p.shiny),
    is_lucky: isLucky,
    is_favorite: Boolean(p.favorite ?? p.isFavorite),
    is_costume: Boolean(disp.costume) || looksLikeCostume(formName, formId),
    has_third_move: Boolean(p.move3),
    is_deployed: Boolean(deployedFortId || Number(p.cpWhenDeployed || 0) > 0),
    is_tagged: monTags.length > 0 || rawTagIds.length > 0,
    mon_tags: monTags,
    tag_conflicts: [],
    origin_case: originCase,
    origin_label: originLabel,
    is_traded: isTraded,
    purify_preview: purifyPreview,
    in_contest: inContest,
    contest_end_ms: contestEndMs,
    legacy_size_unknown: legacySizeUnknown,
    mega_forms: megaForms,
    is_currently_mega: isCurrentlyMega(p),
    has_mega_unlocked: hasMegaEvolvedBefore(p),
    mega_level: megaLevel,
    is_mega_capable: false,
    is_mega_pre_evo: false,
    purify_for_mega: false,
    mega_sid: null,
    mega_type: null,
    is_dynamax: isDynamax(p),
    is_gigantamax: isGigantamax(p),
    max_attack_level: maxAttack,
    max_guard_level: maxGuard,
    max_spirit_level: maxSpirit,
    buddy_km: Number(p.buddyKmWalked ?? p.buddyDistanceKm ?? p.kmBuddyDistance ?? 0),
    num_upgrades: Number(p.numUpgrades ?? 0),
    year,
    form_name: formName,
    form_id: formId,
    gender: genderVal,
    location_card: locationCard,
    origin_events: Array.isArray(p.originEvents) ? p.originEvents : [],
    knows_moves: knownMoveIds(p),
    species: null,
    pvp: [],
    cup_pvp: [],
    best_pvp: null,
    pvp_battle: null,
    raid_type: null,
    raid_sid: null,
    raid_rank: null,
    raid_dps: 0,
    raid_reject: '',
    raid_reserve: false,
    max_type: null,
    max_sid: null,
    max_rank: null,
    max_dps: 0,
    max_reject: '',
    max_reserve: false,
    gym_score: 0,
    gym_reject: '',
    protect: [],
    iv_demoted: false,
    review_reasons: [],
    variant_keep: '',
    variant_trade: '',
    verdict: 'TRANSFER',
    role: '',
    why_keep: '',
    power_up_to: null,
    build_cp: null,
    evolve_to: '',
    evolve_to_sid: null,
    moveset: '',
    moveset_note: '',
    warnings: [],
    caps: [],
    battles_attacked: battlesAttacked,
    battles_defended: battlesDefended,
    pvp_battles: pvpBattles,
    pvp_wins: pvpWins,
    npc_battles: npcBattles,
    catch_floor: catchFloor,
    from_fort: fromFort,
    hatched_from_egg: hatchedFromEgg,
    weather_boosted: weatherBoosted,
    caught_in_party: caughtInParty,
    untradable_traded: isTraded,
    is_fusion: isFusion,
    temp_evolved_id: tempEvolvedId,
    mega_finish_ms: megaFinishMs,
    mega_points: megaPoints,
    deployed_duration_ms: deployedDurationMs,
    deployed_lat: deployedLat,
    deployed_lng: deployedLng,
    deployed_fort_id: deployedFortId,
    deployed_returned_ms: deployedReturnedMs,
    origin_move: null,
  };
}

export function ivStr(m: MonModel): string {
  return `${m.a}/${m.d}/${m.s}`;
}

export function displaySpecies(m: MonModel): string {
  const rawName = m.species?.speciesName || (m.raw.species as string) || `Dex ${m.dex}`;
  let name = cleanSpeciesName(rawName);
  if (m.is_shadow && !name.toLowerCase().includes('shadow')) {
    name = `${name} (Shadow)`;
  }
  return name;
}

export function ingameSearch(m: MonModel, _speciesName: string): string {
  void _speciesName;
  const terms: string[] = [String(m.dex), `cp${m.cp}`];
  if (m.is_shadow) terms.push('shadow');
  if (m.is_purified) terms.push('purified');
  return terms.join('&');
}
