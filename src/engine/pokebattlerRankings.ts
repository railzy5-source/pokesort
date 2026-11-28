/**
 * Pokébattler type-attacker rankings integration.
 *
 * Replaces the internal formula rankings (buildTypeRankings) with live data from
 * https://www.pokebattler.com/api/attackers?selectedType=POKEMON_TYPE_{TYPE}
 *
 * Score used: `points` (higher = better). Falls back to 1/avg_estimator when points missing.
 * Species ID mapping converts Pokébattler UPPER_SNAKE ids into PvPoke-style lowercase ids
 * used throughout this app.
 *
 * Fair-use: sequential requests, aggressive cache, User-Agent identification, attribution.
 */

import { RAID_USEFUL_TYPES } from './defaultConfig';
import { CPM } from './cpmTable';

const PB_API = 'https://www.pokebattler.com/api/attackers';
const CACHE_KEY = 'pokebattler_type_rankings_v1';
const CACHE_TTL_MS = 12 * 3600 * 1000; // 12 h — rankings change with move/stat updates
const USER_AGENT = 'PokeSort/1.0 (raid-sorter; +https://github.com; research/attribution to pokebattler.com)';

export interface PbAttackerRow {
  pokemonId: string;
  rarity?: string;
  type?: string;
  type2?: string;
  move1?: string;
  move2?: string;
  move1_type?: string;
  move2_type?: string;
  points?: number;
  avg_estimator?: number;
  matchups?: number;
}

export type TypeRankingMap = Map<string, [string, number][]>; // type → [[speciesId, score], ...]

/** Convert Pokébattler pokemonId → PvPoke speciesId. */
export function pbIdToSpeciesId(pbId: string): string {
  let s = String(pbId || '').trim().toUpperCase();
  if (!s) return '';

  // Shadow / purified
  const isShadow = s.endsWith('_SHADOW_FORM') || s.endsWith('_SHADOW');
  const isPurified = s.endsWith('_PURIFIED_FORM') || s.endsWith('_PURIFIED');
  if (isShadow) s = s.replace(/_SHADOW_FORM$|_SHADOW$/, '');
  if (isPurified) s = s.replace(/_PURIFIED_FORM$|_PURIFIED$/, '');

  // Mega / Primal
  let megaSuffix = '';
  if (s.endsWith('_MEGA_X')) {
    megaSuffix = '_mega_x';
    s = s.slice(0, -7);
  } else if (s.endsWith('_MEGA_Y')) {
    megaSuffix = '_mega_y';
    s = s.slice(0, -7);
  } else if (s.endsWith('_MEGA')) {
    megaSuffix = '_mega';
    s = s.slice(0, -5);
  } else if (s.endsWith('_PRIMAL')) {
    megaSuffix = '_primal';
    s = s.slice(0, -7);
  }

  // Common form suffixes
  const formMap: Record<string, string> = {
    _ALOLA_FORM: '_alolan',
    _ALOLAN_FORM: '_alolan',
    _GALARIAN_FORM: '_galarian',
    _HISUIAN_FORM: '_hisuian',
    _PALDEAN_FORM: '_paldean',
    _PALDEAN_COMBAT_FORM: '_paldean_combat',
    _PALDEAN_BLAZE_FORM: '_paldean_blaze',
    _PALDEAN_AQUA_FORM: '_paldean_aqua',
    _ORIGIN_FORM: '_origin',
    _ORIGIN: '_origin',
    _ALTERED_FORM: '', // default Giratina
    _BLACK_FORM: '_black',
    _BLACK: '_black',
    _WHITE_FORM: '_white',
    _WHITE: '_white',
    _THERIAN_FORM: '_therian',
    _THERIAN: '_therian',
    _INCARNATE_FORM: '', // default Landorus etc.
    _ATTACK_FORM: '_attack',
    _DEFENSE_FORM: '_defense',
    _SPEED_FORM: '_speed',
    _ORDINARY_FORM: '',
    _RESOLUTE_FORM: '_resolute',
    _ARIA_FORM: '',
    _PIROUETTE_FORM: '_pirouette',
    _FAN_FORM: '_fan',
    _FAN: '_fan',
    _FROST_FORM: '_frost',
    _FROST: '_frost',
    _HEAT_FORM: '_heat',
    _HEAT: '_heat',
    _MOW_FORM: '_mow',
    _MOW: '_mow',
    _WASH_FORM: '_wash',
    _WASH: '_wash',
    _DAWN_WINGS_FORM: '_dawn_wings',
    _DAWN_WINGS: '_dawn_wings',
    _DUSK_MANE_FORM: '_dusk_mane',
    _DUSK_MANE: '_dusk_mane',
    _ULTRA_FORM: '_ultra',
    _UNBOUND_FORM: '_unbound',
    _UNBOUND: '_unbound',
    _CONFINED_FORM: '',
    _SKY_FORM: '_sky',
    _LAND_FORM: '_land',
    _STANDARD_FORM: '',
    _ZEN_FORM: '_zen',
    _GALARIAN_STANDARD_FORM: '_galarian_standard',
    _GALARIAN_ZEN_FORM: '_galarian_zen',
    _DUSK_FORM: '_dusk',
    _MIDNIGHT_FORM: '_midnight',
    _MIDDAY_FORM: '_midday',
    _CROWNED_SWORD_FORM: '_crowned_sword',
    _CROWNED_SWORD: '_crowned_sword',
    _CROWNED_SHIELD_FORM: '_crowned_shield',
    _CROWNED_SHIELD: '_crowned_shield',
    _HERO_FORM: '_hero',
    _COMPLETE_FORM: '_complete',
    _10_FORM: '_10',
    _50_FORM: '_50',
    _COMPLETE: '_complete',
    _ETERNAMAX_FORM: '_eternamax',
    _ETERNAMAX: '_eternamax',
    _GIGANTAMAX_FORM: '_gigantamax',
    _GIGANTAMAX: '_gigantamax',
    _RAPID_STRIKE_FORM: '_rapid_strike',
    _RAPID_STRIKE: '_rapid_strike',
    _SINGLE_STRIKE_FORM: '_single_strike',
    _SINGLE_STRIKE: '_single_strike',
    _SHADOW: '', // already stripped
  };

  let formSuffix = '';
  for (const [pbSuffix, ourSuffix] of Object.entries(formMap).sort((a, b) => b[0].length - a[0].length)) {
    if (s.endsWith(pbSuffix)) {
      s = s.slice(0, -pbSuffix.length);
      formSuffix = ourSuffix; // already lowercase with leading _
      break;
    }
  }

  // Remaining _FORM
  if (s.endsWith('_FORM')) s = s.slice(0, -5);

  // Base name → lowercase
  let out = s.toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (formSuffix) out = out + formSuffix;

  // Re-apply mega / shadow
  if (megaSuffix) out = out + megaSuffix;
  if (isShadow) out = out + '_shadow';
  if (isPurified) out = out + '_purified';

  // Manual overrides for known mismatches
  const overrides: Record<string, string> = {
    mewtwo_mega_x: 'mewtwo_mega_x',
    mewtwo_mega_y: 'mewtwo_mega_y',
    charizard_mega_x: 'charizard_mega_x',
    charizard_mega_y: 'charizard_mega_y',
    kyurem_black: 'kyurem_black',
    kyurem_white: 'kyurem_white',
    landorus_therian: 'landorus_therian',
    tornadus_therian: 'tornadus_therian',
    thundurus_therian: 'thundurus_therian',
    giratina_origin: 'giratina_origin',
    giratina: 'giratina',
    necrozma_dawn_wings: 'necrozma_dawn_wings',
    necrozma_dusk_mane: 'necrozma_dusk_mane',
    zacian_crowned_sword: 'zacian_crowned_sword',
    zamazenta_crowned_shield: 'zamazenta_crowned_shield',
    urshifu_rapid_strike: 'urshifu_rapid_strike',
    urshifu_single_strike: 'urshifu_single_strike',
    darmanitan_galarian: 'darmanitan_galarian',
    darmanitan_galarian_zen: 'darmanitan_galarian_zen',
  };
  if (overrides[out]) return overrides[out];

  return out;
}

/**
 * Resolve a mapped speciesId against the loaded Game Master / PvPoke `byId` map
 * so minor form-naming differences (e.g. `landorus` vs `landorus_incarnate`) never drop valid attackers.
 */
export function resolveExternalSpeciesId(
  mappedSid: string,
  knownById?: ReadonlyMap<string, unknown> | null,
): string {
  if (!mappedSid || !knownById || knownById.size === 0) return mappedSid;
  if (knownById.has(mappedSid)) return mappedSid;

  const isShadow = mappedSid.endsWith('_shadow');
  const isPurified = mappedSid.endsWith('_purified');
  const suffix = isShadow ? '_shadow' : isPurified ? '_purified' : '';
  const base = suffix ? mappedSid.slice(0, -suffix.length) : mappedSid;

  const candidates = [
    `${base}_incarnate${suffix}`,
    `${base}_altered${suffix}`,
    `${base}_standard${suffix}`,
    `${base}_land${suffix}`,
    `${base}_aria${suffix}`,
    `${base}_ordinary${suffix}`,
    `${base}_normal${suffix}`,
    `${base}_50${suffix}`,
    `${base}_hero${suffix}`,
  ];
  for (const cand of candidates) {
    if (knownById.has(cand)) return cand;
  }
  const stripped = base.replace(/_(incarnate|altered|standard|land|aria|ordinary|normal)$/, '') + suffix;
  if (knownById.has(stripped)) return stripped;
  return mappedSid;
}

function typeParam(t: string): string {
  return `POKEMON_TYPE_${t.toUpperCase()}`;
}

async function fetchTypeRanking(type: string): Promise<PbAttackerRow[]> {
  const url = `${PB_API}?selectedType=${typeParam(type)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`Pokébattler ${type}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Pokébattler ${type}: expected array`);
  return data as PbAttackerRow[];
}

/** Collapse multiple movesets per species → best score (points preferred). */
function bestPerSpecies(rows: PbAttackerRow[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const r of rows) {
    const sid = pbIdToSpeciesId(r.pokemonId);
    if (!sid) continue;
    const pts = Number(r.points);
    const est = Number(r.avg_estimator);
    // Prefer points (higher better). Fallback: inverse estimator.
    const score =
      Number.isFinite(pts) && pts > 0
        ? pts
        : Number.isFinite(est) && est > 0
          ? 1000 / est
          : 0;
    if (score <= 0) continue;
    const prev = best.get(sid) ?? 0;
    if (score > prev) best.set(sid, score);
  }
  return best;
}

function loadCache(): { ts: number; byType: Record<string, [string, number][]> } | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !parsed?.byType) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(byType: Record<string, [string, number][]>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), byType }));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Fetch (or load cached) Pokébattler rankings for every raid type.
 * Returns Map<type, sorted [speciesId, score][]> with highest score first.
 * Requests are sequential to respect Pokébattler fair-use.
 */
export async function loadPokebattlerTypeRankings(
  types: string[] = RAID_USEFUL_TYPES,
  onProgress?: (msg: string, pct: number) => void,
): Promise<TypeRankingMap> {
  const cached = loadCache();
  if (cached) {
    const m = new Map<string, [string, number][]>();
    for (const [t, lst] of Object.entries(cached.byType)) {
      m.set(t, lst);
    }
    onProgress?.('Pokébattler rankings (cached)', 100);
    return m;
  }

  const result = new Map<string, [string, number][]>();
  const serializable: Record<string, [string, number][]> = {};
  const n = types.length;

  for (let i = 0; i < n; i++) {
    const t = types[i];
    onProgress?.(`Pokébattler ${t} rankings…`, Math.round((i / n) * 90));
    try {
      const rows = await fetchTypeRanking(t);
      const best = bestPerSpecies(rows);
      const sorted = Array.from(best.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      result.set(t, sorted);
      serializable[t] = sorted;
    } catch (e) {
      console.warn(`[pokebattler] failed for ${t}:`, e);
      // leave type empty → caller will fall back to internal for that type
    }
    // polite delay between type requests
    if (i < n - 1) await new Promise((r) => setTimeout(r, 350));
  }

  if (Object.keys(serializable).length > 0) saveCache(serializable);
  onProgress?.('Pokébattler rankings ready', 100);
  return result;
}

/**
 * Apply Pokébattler rankings as the live scoring source.
 *
 * raidRankings scores become PB **points** (higher = better).
 * raidPos is 1-based rank from that list.
 * Team builder / % of best should use these scores directly (not formula refDps).
 */
export function applyExternalRaidRankings(
  target: {
    byId?: ReadonlyMap<string, unknown>;
    raidRankings: Map<string, [string, number][]>;
    raidPos: Map<string, Map<string, [number, number]>>;
    raidScoreSource?: string;
    raidTypeSource?: Map<string, 'pokebattler' | 'internal'>;
  },
  external: TypeRankingMap,
  /** Only replace types that have data; keep internal for the rest. */
  merge = true,
): number {
  let applied = 0;
  for (const [t, lst] of external.entries()) {
    if (!lst.length) continue;

    // Resolve species IDs against loaded Game Master when available, keeping highest score on alias collisions.
    const dedup = new Map<string, number>();
    for (const [rawSid, sc] of lst) {
      const sid = resolveExternalSpeciesId(rawSid, target.byId);
      const prev = dedup.get(sid) ?? 0;
      if (sc > prev) dedup.set(sid, sc);
    }
    const resolved = Array.from(dedup.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    // Full PB score list (points already sorted high → low)
    target.raidRankings.set(t, resolved);

    const pos = new Map<string, [number, number]>();
    resolved.forEach(([sid, sc], i) => pos.set(sid, [i + 1, sc]));
    target.raidPos.set(t, pos);
    target.raidTypeSource?.set(t, 'pokebattler');
    applied++;
  }
  if (!merge) {
    for (const t of [...target.raidRankings.keys()]) {
      if (!external.has(t) || !external.get(t)!.length) {
        target.raidRankings.delete(t);
        target.raidPos.delete(t);
        target.raidTypeSource?.delete(t);
      }
    }
  }
  if (applied > 0) target.raidScoreSource = 'pokebattler';
  return applied;
}

/** Top score for a type from the ranking list (PB points or formula coeff). */
export function topRankingScore(
  rankings: Map<string, [string, number][]>,
  atype: string,
): number {
  const rows = rankings.get(atype) || [];
  return rows.length ? rows[0][1] : 0;
}

/**
 * Scale a species-level Pokébattler points score to one specimen.
 *
 * Assumption (documented, not verified against Pokébattler): the species points describe a level-40 attacker with a
 * 15 Attack IV and its best moveset. The specimen is scaled by the real CPM table and its real Attack stat.
 */
export function specimenPbScore(
  speciesPoints: number,
  level: number,
  atkIv: number,
  baseAtk: number,
  movesetFactor: number,
): number {
  if (!(speciesPoints > 0) || !(baseAtk > 0)) return 0;
  const cpmAt = (lv: number) => CPM[Math.min(50, Math.max(1, Math.round(lv * 2) / 2))] || 0;
  const ref = cpmAt(40);
  if (!(ref > 0)) return 0;
  const levelFactor = cpmAt(level) / ref;
  const atkFactor = (baseAtk + Math.max(0, Math.min(15, atkIv))) / (baseAtk + 15);
  return speciesPoints * levelFactor * atkFactor * Math.max(0.05, movesetFactor);
}
