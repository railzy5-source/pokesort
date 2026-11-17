import {
  cleanSpeciesName,
  CROWNED_MAX_OVERRIDE,
  DEFENDER_DEF,
  DYNAMAX_DEX,
  FORM_ALIASES,
  GMAX_MOVE_POWER,
  GMAX_ONLY_DEX,
  GMAX_TYPE,
  LEAGUE_NAMES,
  MAX_BATTLE_TYPES,
  MAX_DAMAGE_DIV,
  MAX_MOVE_POWER,
  normStr,
  PVP_ROLE_KEYS,
  RAID_BULK_K,
  RAID_USEFUL_TYPES,
  READINESS_BUILDS,
  REGIONAL_SUFFIXES,
  SHADOW_DEF_DIV,
  SHADOW_SUFFIXES,
  STAB,
  SUPER_EFFECTIVE,
  TYPE_CHART,
} from './defaultConfig';
import { buildSpreads, CPM, ivRankFromSpreads, type SpreadTable } from './cpmTable';
import { boostTypesFor, isCrownedForm, isMegaForm, megaBaseOf } from './pgsParser';
import type {
  BuildStatus,
  CupDef,
  CurrentMoveInfo,
  MonModel,
  NeedsTypedMove,
  PogoConfig,
  PveMoveRecord,
  PvPokeMove,
  PvPokeRankingEntry,
  PvPokeSpecies,
  RemoteGameData,
  SizeTableRecord,
  VerdictType,
} from './types';

export interface PveContext {
  moves: Record<string, PveMoveRecord>;
  byId: Map<number, string>;
  fastIdents: Set<string>;
  ok: boolean;
}

export interface SizeContext {
  byKey: Record<string, SizeTableRecord>;
  ok: boolean;
}

export function createPveContext(data: RemoteGameData, cfg: PogoConfig): PveContext {
  const enabled = cfg.pve_model?.enabled !== false;
  const moves = enabled ? data.pveMoves || {} : {};
  const byId = new Map<number, string>();
  const fastIdents = new Set<string>();
  for (const [k, v] of Object.entries(moves)) {
    byId.set(v.id, k);
    if (k.endsWith('_FAST')) {
      fastIdents.add(k.slice(0, -5));
    }
  }
  return {
    moves,
    byId,
    fastIdents,
    ok: enabled && data.pveOk && Object.keys(moves).length > 0,
  };
}

export function createSizeContext(data: RemoteGameData): SizeContext {
  return {
    byKey: data.showcaseSizes || {},
    ok: data.sizeOk && Object.keys(data.showcaseSizes || {}).length > 0,
  };
}

export function moveLabel(moveId: string | number | undefined): string {
  if (!moveId) return '';
  return String(moveId)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function moveIdent(name: string): string {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function pveMove(pve: PveContext, moveId: string, fast: boolean): PveMoveRecord | null {
  if (!pve.ok || !moveId) return null;
  const key = fast ? `${moveId}_FAST` : String(moveId);
  return pve.moves[key] || null;
}

function moveDuration(m: PvPokeMove): number {
  for (const k of ['cooldown', 'durationMs', 'duration'] as const) {
    const v = m[k];
    if (typeof v === 'number' && v > 0) return v / 1000.0;
  }
  if (typeof m.turns === 'number' && m.turns > 0) return m.turns * 0.5;
  return 0.5;
}

export function raidBulk(
  bs: { atk: number; def: number; hp: number },
  defIv = 15,
  staIv = 15,
  shadow = false,
  bulkWeight = 1.0,
): number {
  if (bulkWeight <= 0) return 1.0;
  const d = (bs.def + defIv) / (shadow ? SHADOW_DEF_DIV : 1.0);
  return Math.pow((d * (bs.hp + staIv)) / RAID_BULK_K, bulkWeight / 4.0);
}

export interface PrepFast {
  moveId: string;
  type: string;
  power: number;
  dur: number;
  energy: number;
}
export interface PrepCharged {
  moveId: string;
  type: string;
  power: number;
  dur: number;
  cost: number;
}

export function prepMoves(
  pve: PveContext,
  moves: Map<string, PvPokeMove>,
  fastIds: string[],
  chargedIds: string[],
): { fasts: PrepFast[]; chargeds: PrepCharged[] } {
  const fasts: PrepFast[] = [];
  const chargeds: PrepCharged[] = [];

  for (const id of fastIds) {
    const m = moves.get(id);
    if (!m) continue;
    if (pve.ok) {
      const pv = pveMove(pve, id, true);
      if (!pv || pv.p <= 0 || pv.e <= 0 || pv.d <= 0) continue;
      fasts.push({
        moveId: id,
        type: pv.t || m.type.toLowerCase(),
        power: pv.p,
        dur: pv.d / 1000.0,
        energy: pv.e,
      });
    } else {
      const pwr = m.power ?? 0;
      const eng = m.energyGain ?? 0;
      if (pwr <= 0 || eng <= 0) continue;
      fasts.push({
        moveId: id,
        type: m.type.toLowerCase(),
        power: pwr,
        dur: moveDuration(m),
        energy: Math.max(1, eng),
      });
    }
  }

  for (const id of chargedIds) {
    const m = moves.get(id);
    if (!m) continue;
    if (pve.ok) {
      const pv = pveMove(pve, id, false);
      if (!pv || pv.p <= 0 || pv.e >= 0 || pv.d <= 0) continue;
      chargeds.push({
        moveId: id,
        type: pv.t || m.type.toLowerCase(),
        power: pv.p,
        dur: pv.d / 1000.0,
        cost: -pv.e,
      });
    } else {
      const pwr = m.power ?? 0;
      if (pwr <= 0 || !m.type) continue;
      chargeds.push({
        moveId: id,
        type: m.type.toLowerCase(),
        power: pwr,
        dur: moveDuration(m),
        cost: Math.abs(m.energy ?? 50) || 50,
      });
    }
  }
  return { fasts, chargeds };
}

/**
 * Type-effectiveness against the "generic raid defender" used for team building:
 * a defender that is WEAK to `targetType` (x1.6) and neutral to everything else (x1.0).
 * A Ground team is therefore simulated against a defender weak to Ground, so only
 * Ground-type moves get the x1.6 bonus - a Dragon move like Breaking Swipe gets x1.0.
 */
export function targetEffectiveness(moveType: string, targetType: string): number {
  return (moveType || '').toLowerCase() === (targetType || '').toLowerCase() ? SUPER_EFFECTIVE : 1.0;
}

/**
 * Damage-per-second per point of Attack for one fast + charged pair vs a defender weak to `targetType`.
 *   hit damage  = 0.5 * Power * STAB * typeEffectiveness / DEFENDER_DEF   (Attack is multiplied in later)
 *   cycle       = n fast moves (to bank the charged move's energy) + the charged move
 *   DPS/ATK     = (n * fastDamage + chargedDamage) / cycleTime
 * `fastBoost`/`chargedBoost` carry the optional weather-boost multipliers.
 */
export function pairDpsPerAtk(
  fm: PrepFast,
  cm: PrepCharged,
  attackerTypes: Set<string>,
  targetType: string,
  pveOk: boolean,
  fastBoost = 1.0,
  chargedBoost = 1.0,
): number {
  const fmStab = attackerTypes.has(fm.type) ? STAB : 1.0;
  const cmStab = attackerTypes.has(cm.type) ? STAB : 1.0;
  const fmDmg = (0.5 * fm.power * fmStab * targetEffectiveness(fm.type, targetType) * fastBoost) / DEFENDER_DEF;
  const cmDmg = (0.5 * cm.power * cmStab * targetEffectiveness(cm.type, targetType) * chargedBoost) / DEFENDER_DEF;
  const n = pveOk ? cm.cost / fm.energy : Math.ceil(cm.cost / fm.energy);
  const cycleTime = n * fm.dur + cm.dur;
  if (!(cycleTime > 0)) return 0;
  return (n * fmDmg + cmDmg) / cycleTime;
}

export function bestDpsPerAtk(
  pve: PveContext,
  attackerTypes: Set<string>,
  moves: Map<string, PvPokeMove>,
  fastIds: string[],
  chargedIds: string[],
): Map<string, [number, string | null, string]> {
  const { fasts, chargeds } = prepMoves(pve, moves, fastIds, chargedIds);
  const out = new Map<string, [number, string | null, string]>();

  for (const cm of chargeds) {
    const ctype = cm.type;
    if (!attackerTypes.has(ctype)) continue;
    // The team type being built IS the charged move's type, so the defender is weak to `ctype`.
    let best = 0.0;
    let bestFast: string | null = null;

    for (const fm of fasts) {
      const dpsPerAtk = pairDpsPerAtk(fm, cm, attackerTypes, ctype, pve.ok);
      if (dpsPerAtk > best) {
        best = dpsPerAtk;
        bestFast = fm.moveId;
      }
    }
    if (best > 0) {
      const prev = out.get(ctype);
      if (!prev || best > prev[0]) {
        out.set(ctype, [best, bestFast, cm.moveId]);
      }
    }
  }
  return out;
}

export function bestMaxPerAtk(
  attackerTypes: Set<string>,
  moves: Map<string, PvPokeMove>,
  fastIds: string[],
): Map<string, [number, string]> {
  const out = new Map<string, [number, string]>();
  const bestDps = new Map<string, number>();

  for (const id of fastIds) {
    const fm = moves.get(id);
    if (!fm) continue;
    const p = fm.power ?? 0;
    if (p <= 0 || (fm.energyGain ?? 0) <= 0) continue;
    const t = (fm.type || '').toLowerCase();
    if (!t) continue;
    const dur = moveDuration(fm);
    if (dur <= 0) continue;
    const stab = attackerTypes.has(t) ? STAB : 1.0;
    const coeff = (MAX_MOVE_POWER[3] * stab) / MAX_DAMAGE_DIV;
    const dps = (0.5 * p * stab) / DEFENDER_DEF / dur;
    if (dps > (bestDps.get(t) ?? 0)) {
      bestDps.set(t, dps);
      out.set(t, [coeff, fm.moveId]);
    }
  }
  return out;
}

export function raidMovesetCandidates(
  pve: PveContext,
  attackerTypes: Set<string>,
  moves: Map<string, PvPokeMove>,
  fastIds: string[],
  chargedIds: string[],
  atype: string,
  boost = false,
  sameMult = 1.3,
  otherMult = 1.1,
): [number, string, string][] {
  const { fasts, chargeds } = prepMoves(pve, moves, fastIds, chargedIds);
  const out: [number, string, string][] = [];
  for (const cm of chargeds) {
    if (cm.type !== atype || !attackerTypes.has(cm.type)) continue;
    const cmMult = boost ? (cm.type === atype ? sameMult : otherMult) : 1.0;
    for (const fm of fasts) {
      const fmMult = boost ? (fm.type === atype ? sameMult : otherMult) : 1.0;
      const dps = pairDpsPerAtk(fm, cm, attackerTypes, atype, pve.ok, fmMult, cmMult);
      if (dps > 0) out.push([dps, fm.moveId, cm.moveId]);
    }
  }
  out.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  return out;
}

export function moveInfoFromRawId(
  pve: PveContext,
  rawId: string | number | undefined,
): [string, string] | null {
  if (!pve.ok || rawId === undefined || rawId === null || rawId === '') return null;
  const num = Number(rawId);
  if (Number.isNaN(num)) return null;
  const key = pve.byId.get(num);
  if (!key) return null;
  const base = key.endsWith('_FAST') ? key.slice(0, -5) : key;
  return [moveLabel(base), pve.moves[key]?.t || ''];
}

export function fastMoveType(pve: PveContext, m: MonModel): string | null {
  const raw = m.raw.move1;
  if (!raw) return null;
  const got = moveInfoFromRawId(pve, raw);
  if (!got || !got[1]) return null;
  return got[1].toLowerCase();
}

/**
 * The type of the attacking Max Move this Pokémon has RIGHT NOW (null = cannot tell).
 *   - Dynamax:       follows the type of its Fast Attack (Hidden Power always gives Max Strike = Normal).
 *                    Changing the Fast Attack with a Fast TM changes it.
 *   - Gigantamax:    a fixed G-Max Move set by the species. A Fast TM cannot change it.
 *   - Crowned forms: fixed Steel attack.
 * `why` says which rule applied so callers can decide whether a Fast Attack lock is relevant.
 */
/**
 * Can this Pokémon fight in Max Battles? Dynamax and Gigantamax Pokémon can. Crowned Zacian and Zamazenta cannot Dynamax
 * but still join Max Battles with a fixed Steel attack. Hero of Many Battles forms cannot join at all.
 */
export function canJoinMaxBattle(m: MonModel): boolean {
  if (m.is_dynamax || m.is_gigantamax) return true;
  return Boolean(CROWNED_MAX_OVERRIDE[m.dex] && isCrownedForm(m));
}

export function currentMaxMoveType(
  dex: Dex,
  m: MonModel,
): { type: string; why: 'gmax' | 'fixed' | 'fast' } | null {
  const dexNum = m.dex;
  if (CROWNED_MAX_OVERRIDE[dexNum] && isCrownedForm(m)) {
    return { type: CROWNED_MAX_OVERRIDE[dexNum].type, why: 'fixed' };
  }
  if (m.is_gigantamax) {
    const g = dex.gmaxType.get(dexNum);
    return g ? { type: g, why: 'gmax' } : null;
  }
  if (!m.is_dynamax) return null;
  if (!dex.moveIdsTrusted) return null; // offline snapshot: move ids are not reliable, so do not trust the Fast Attack type
  const raw = m.raw.move1;
  if (!raw) return null;
  const got = moveInfoFromRawId(dex.pve, raw);
  if (!got) return null;
  if (/^hidden power/i.test(got[0])) return { type: 'normal', why: 'fast' };
  const t = (got[1] || '').toLowerCase();
  return t ? { type: t, why: 'fast' } : null;
}

export function heldEliteMoves(
  pve: PveContext,
  mon: MonModel,
  eliteIds: string[],
): string[] | null {
  if (!pve.ok) return null;
  const elite = new Set(eliteIds.map((e) => String(e).toUpperCase()));
  const held: string[] = [];
  for (const raw of mon.knows_moves) {
    const num = Number(raw);
    if (Number.isNaN(num)) continue;
    const name = pve.byId.get(num);
    if (!name) continue;
    const base = name.endsWith('_FAST') ? name.slice(0, -5) : name;
    if (elite.has(base)) held.push(moveLabel(base));
  }
  return held;
}

export function currentMoves(pve: PveContext, mon: MonModel): CurrentMoveInfo[] {
  if (!pve.ok) return [];
  const elite = new Set(
    mon.species?.eliteMoves ? heldEliteMoves(pve, mon, mon.species.eliteMoves) || [] : [],
  );
  const out: CurrentMoveInfo[] = [];
  const slots: [CurrentMoveInfo['slot'], 'move1' | 'move2' | 'move3'][] = [
    ['fast', 'move1'],
    ['charged', 'move2'],
    ['charged2', 'move3'],
  ];
  for (const [slot, k] of slots) {
    const raw = mon.raw[k];
    if (!raw) continue;
    const got = moveInfoFromRawId(pve, raw);
    const name = got ? got[0] : `#${raw}`;
    out.push({
      slot,
      name,
      type: got ? got[1] : '',
      elite: elite.has(name),
    });
  }
  return out;
}

export function movesStr(pve: PveContext, mon: MonModel): string {
  return currentMoves(pve, mon)
    .map((m) => m.name + (m.elite ? ' *' : ''))
    .join(' / ');
}

export function movesNeeded(pve: PveContext, mon: MonModel): string[] {
  if (!pve.ok || !mon.moveset) return [];
  const have = new Set(currentMoves(pve, mon).map((m) => m.name.toLowerCase()));
  return mon.moveset
    .split(' / ')
    .map((w) => w.trim())
    .filter((w) => w && !have.has(w.toLowerCase()));
}

export function pickRaidMoveset(
  pve: PveContext,
  mon: MonModel,
  dex: Dex,
  species: PvPokeSpecies,
  atype: string,
  boost: boolean,
  cfg: PogoConfig,
): [string, string] {
  const rc = cfg.raid;
  const types = new Set((species.types || []).map((t) => t.toLowerCase()));
  const fast = [...(species.fastMoves || [])];
  let charged = [...(species.chargedMoves || [])];
  if (!isCrownedForm(mon)) {
    charged = charged.filter((m) => !String(m).toUpperCase().includes('BEHEMOTH'));
  }
  const cands = raidMovesetCandidates(
    pve,
    types,
    dex.moves,
    fast,
    charged,
    atype,
    boost,
    Number(rc.boost_same_type ?? 1.3),
    Number(rc.boost_other ?? 1.1),
  );
  if (cands.length === 0) return ['', ''];
  const best = cands[0];
  const label = (c: [number, string, string]) =>
    [moveLabel(c[1]), moveLabel(c[2])].filter(Boolean).join(' / ');

  const have = pve.ok ? new Set(currentMoves(pve, mon).map((m) => m.name.toLowerCase())) : new Set<string>();
  const unreadable = have.size === 0 || Array.from(have).some((h) => h.startsWith('#'));
  let gain = Number(rc.tm_min_gain_pct ?? 5.0);
  if (unreadable || gain < 0) return [label(best), ''];

  const elite = new Set((species.eliteMoves || []).map((e) => String(e).toUpperCase()));
  if (
    [best[1], best[2]].some(
      (mid) => elite.has(String(mid).toUpperCase()) && !have.has(moveLabel(mid).toLowerCase()),
    )
  ) {
    gain = Math.max(gain, Number(rc.elite_tm_min_gain_pct ?? 10.0));
  }

  const cost = (c: [number, string, string]) => {
    let tot = 0;
    for (const mid of [c[1], c[2]]) {
      if (!have.has(moveLabel(mid).toLowerCase())) {
        tot += elite.has(String(mid).toUpperCase()) ? 2 : 1;
      }
    }
    return tot;
  };

  const near = cands.filter((c) => c[0] * (1 + gain / 100.0) >= best[0]);
  near.sort((a, b) => cost(a) - cost(b) || b[0] - a[0]);
  const pick = near[0] || best;

  if (cost(best) === 0) return [label(best), ''];
  if (pick !== best && cost(pick) < cost(best)) {
    const pct = (best[0] / pick[0] - 1.0) * 100.0;
    return [
      label(pick),
      `keeps current moves: best pair ${label(best)} is only +${pct.toFixed(1)}% DPS (under ${gain}%)`,
    ];
  }

  const missing: string[] = [];
  for (const mid of [best[1], best[2]]) {
    const nm = moveLabel(mid);
    if (!have.has(nm.toLowerCase())) {
      missing.push(nm + (elite.has(String(mid).toUpperCase()) ? ' (Elite TM)' : ' (TM)'));
    }
  }
  return [label(best), missing.length ? `TM: ${missing.join(' + ')}` : ''];
}

export function readyMin(cfg?: PogoConfig): number {
  const raw = cfg?.readiness?.ready_min_known;
  if (raw === undefined || raw === null) return 2;
  const n = Number(raw);
  if (Number.isNaN(n)) return 2;
  return Math.max(1, Math.min(3, Math.round(n)));
}

export function readinessFields(
  pve: PveContext,
  mon: MonModel | null,
  dex: Dex,
  verdict: VerdictType,
  cfg?: PogoConfig,
): {
  fields: Partial<{
    build_status: BuildStatus;
    needs_moves: string[];
    needs_elite_moves: string[];
    needs_typed: NeedsTypedMove[];
    needs_second_move: boolean;
    elite_tm: boolean;
    status_reason: string;
    learn_after_evolve: string[];
  }>;
  meta: { fast: boolean; charged: boolean } | null;
} {
  if (!READINESS_BUILDS.has(verdict)) {
    return { fields: {}, meta: null };
  }
  const out = {
    build_status: 'Unknown' as BuildStatus,
    needs_moves: [] as string[],
    needs_elite_moves: [] as string[],
    needs_typed: [] as NeedsTypedMove[],
    needs_second_move: false,
    elite_tm: false,
    status_reason: '',
    learn_after_evolve: [] as string[],
  };
  if (!mon || !mon.species) {
    out.status_reason = 'no species data';
    return { fields: out, meta: { fast: false, charged: false } };
  }
  const SINGLE_CHARGED_ONLY_DEX = new Set([132, 201, 202, 235, 360]);
  const parts = mon.moveset
    ? mon.moveset
        .split(' / ')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  const wantsSecondCharged =
    parts.length >= 3 || (verdict === 'BUILD_PVP' && !SINGLE_CHARGED_ONLY_DEX.has(mon.dex));
  const secondSlotGap = wantsSecondCharged && !mon.has_third_move;
  out.needs_second_move = secondSlotGap;

  if (!pve.ok) {
    if (secondSlotGap) {
      out.build_status = 'Needs second charged move';
      out.status_reason = '2nd charged move not unlocked · move id table unavailable';
    } else {
      out.status_reason = 'move id table unavailable';
    }
    return { fields: out, meta: { fast: false, charged: false } };
  }
  if (!mon.moveset) {
    if (secondSlotGap) {
      out.build_status = 'Needs second charged move';
      out.status_reason = '2nd charged move not unlocked';
    } else {
      out.status_reason = 'no suggested moveset for this build';
    }
    return { fields: out, meta: { fast: false, charged: false } };
  }
  const moves = currentMoves(pve, mon);
  if (moves.some((m) => m.name.startsWith('#'))) {
    if (secondSlotGap) {
      out.build_status = 'Needs second charged move';
      out.status_reason = '2nd charged move not unlocked · unreadable move id in save';
    } else {
      out.status_reason = 'unreadable move id in save';
    }
    return { fields: out, meta: { fast: false, charged: false } };
  }
  const have = new Set(moves.map((m) => m.name.toLowerCase()));
  const missing = parts.filter((p) => !have.has(p.toLowerCase()));

  const currentSid = mon.species.speciesId || '';
  const targetSid = mon.evolve_to_sid || currentSid;
  const target = dex.byId.get(targetSid) || mon.species;

  const eliteIds = new Set((target.eliteMoves || []).map((e) => String(e).toUpperCase()));
  const poolOf = (sp: PvPokeSpecies) => {
    const s = new Set<string>();
    for (const mid of sp.fastMoves || []) s.add(String(mid).toUpperCase());
    for (const mid of sp.chargedMoves || []) s.add(String(mid).toUpperCase());
    return s;
  };
  const currentPool = poolOf(mon.species);
  const targetPool = poolOf(target);

  const targetFastIds = new Set((target.fastMoves || []).map((id) => String(id).toUpperCase()));
  const targetChargedIds = new Set((target.chargedMoves || []).map((id) => String(id).toUpperCase()));

  const eliteGap = missing.filter((p) => eliteIds.has(moveIdent(p)));
  const regularGap = missing.filter((p) => !eliteIds.has(moveIdent(p)));
  const known = parts.length - missing.length;
  const need = Math.min(readyMin(cfg), parts.length);

  out.needs_moves = regularGap;
  out.needs_elite_moves = eliteGap;
  out.needs_typed = missing.map((p) => {
    const id = moveIdent(p);
    const isFast =
      targetFastIds.has(id) ||
      (!targetChargedIds.has(id) && (pve.fastIdents.has(id) || parts.indexOf(p) === 0));
    return {
      name: p,
      slot: isFast ? 'fast' : 'charged',
      elite: eliteIds.has(id),
    };
  });
  out.elite_tm = eliteGap.length > 0;
  out.learn_after_evolve = missing.filter((p) => {
    const id = moveIdent(p);
    return targetSid !== currentSid && !currentPool.has(id) && targetPool.has(id);
  });

  const formatTmItem = (t: NeedsTypedMove) =>
    `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM: ${t.name}`;
  const unlockNote = secondSlotGap ? '2nd charged move not unlocked' : '';
  const tmText = out.needs_typed.map(formatTmItem).join(' · ');

  if (eliteGap.length > 0) {
    out.build_status = 'Needs Elite TM';
    out.status_reason = [unlockNote, tmText].filter(Boolean).join(' · ');
  } else if (secondSlotGap) {
    out.build_status = 'Needs second charged move';
    out.status_reason = [unlockNote, tmText].filter(Boolean).join(' · ');
  } else if (known >= need) {
    out.build_status = 'Ready';
    out.status_reason =
      missing.length === 0
        ? 'all suggested moves known'
        : `knows ${known} of ${parts.length} suggested moves (${tmText})`;
  } else {
    out.build_status = 'Needs TM';
    out.status_reason = tmText ? `Needs ${tmText}` : '';
  }

  let fastNeed = false;
  let chargedNeed = false;
  for (const p of eliteGap) {
    if (pve.fastIdents.has(moveIdent(p))) fastNeed = true;
    else chargedNeed = true;
  }
  return { fields: out, meta: { fast: fastNeed, charged: chargedNeed } };
}

export function sizeKeyForMon(sizeCtx: SizeContext, m: MonModel): string | null {
  if (!m.species) return null;
  const sid = m.species.speciesId || '';
  const form = normStr(m.form_name || '');
  const base = sid.toUpperCase().replace(/-/g, '_');
  const candidates: string[] = [base];

  const regionalPairs: [string, string][] = [
    ['alola', 'ALOLA'],
    ['alolan', 'ALOLA'],
    ['galar', 'GALARIAN'],
    ['galarian', 'GALARIAN'],
    ['hisui', 'HISUIAN'],
    ['hisuian', 'HISUIAN'],
    ['paldea', 'PALDEA'],
    ['paldean', 'PALDEA'],
  ];
  for (const [tag, gmTag] of regionalPairs) {
    if (form.includes(tag) || sid.endsWith(`_${tag}`) || sid.endsWith(tag)) {
      const root = base.split('_')[0];
      candidates.unshift(`${root}_${gmTag}`);
    }
  }
  const spName = (m.species.speciesName || '').toUpperCase().replace(/\s+/g, '_');
  if (spName) candidates.push(spName);

  for (const c of candidates) {
    if (sizeCtx.byKey[c]) return c;
    const root = c.split('_')[0];
    if (sizeCtx.byKey[root]) return root;
  }
  return null;
}

export function showcaseScore(
  sizeCtx: SizeContext,
  m: MonModel,
): {
  score: number;
  height_score: number;
  weight_score: number;
  iv_score: number;
  xxl_bonus: number;
  k: number | null;
  avg_h: number | null;
  avg_w: number | null;
  size_key: string | null;
  accurate: boolean;
} | null {
  const h = Number(m.raw.heightM || 0);
  const w = Number(m.raw.weightKg || 0);
  const size = Number(m.raw.size || 0);
  if (h <= 0) return null;
  const key = sizeCtx.ok ? sizeKeyForMon(sizeCtx, m) : null;
  const info = key ? sizeCtx.byKey[key] : undefined;
  const ivSum = m.a + m.d + m.s;
  const ivScore = (50.0 * ivSum) / 45.0;
  const xxlBonus = size === 5 ? 178.0 : 0.0;

  let heightScore: number;
  let weightScore: number;
  let k: number | null = null;
  if (info && info.avg_h > 0 && info.avg_w > 0) {
    k = Number(info.k);
    heightScore = (800.0 * (h / info.avg_h)) / k;
    weightScore = (150.0 * (w / info.avg_w)) / (k + 0.5);
  } else {
    heightScore = Math.min(800.0, h * 200.0);
    weightScore = Math.min(150.0, w * 2.0);
  }
  const total = heightScore + weightScore + ivScore + xxlBonus;
  return {
    score: Math.round(total * 100) / 100,
    height_score: Math.round(heightScore * 100) / 100,
    weight_score: Math.round(weightScore * 100) / 100,
    iv_score: Math.round(ivScore * 100) / 100,
    xxl_bonus: xxlBonus,
    k,
    avg_h: info ? info.avg_h : null,
    avg_w: info ? info.avg_w : null,
    size_key: key,
    accurate: Boolean(info),
  };
}

export function maxMoveGainPct(mon: MonModel): number {
  const table = mon.is_gigantamax ? GMAX_MOVE_POWER : MAX_MOVE_POWER;
  const lvl = Math.min(3, Math.max(1, mon.max_attack_level || 1));
  return Math.round(((table[3] / table[lvl] - 1.0) * 100.0) * 10) / 10;
}

export function typeEff(att: string, defenders: string[]): number {
  const a = (att || '').toLowerCase();
  const chart = TYPE_CHART[a];
  if (!chart) return 1.0;
  let mult = 1.0;
  for (const d of defenders) {
    const dl = (d || '').toLowerCase();
    if (chart.weak.includes(dl)) {
      // Wait: chart[a] stores what `a` is weak to, NOT what `a` is SE against!
      // Let's compute defender weaknesses directly from TYPE_CHART[dl]!
    }
    const defChart = TYPE_CHART[dl];
    if (!defChart) continue;
    if (defChart.weak.includes(a)) mult *= SUPER_EFFECTIVE;
    if (defChart.resist.includes(a)) mult *= 0.625;
    if (defChart.immune.includes(a)) mult *= 0.390625;
  }
  return mult;
}

export class Dex {
  cfg: PogoConfig;
  pve: PveContext;
  byId = new Map<string, PvPokeSpecies>();
  byDex = new Map<number, PvPokeSpecies[]>();
  moves = new Map<string, PvPokeMove>();
  pvpPos = new Map<number, Map<string, [number, number]>>();
  pvpRows = new Map<number, [string, number][]>();
  pvpMeta = new Map<number, Map<string, PvPokeRankingEntry>>();
  cupPos = new Map<string, Map<string, [number, number]>>();
  cupMeta = new Map<string, Map<string, PvPokeRankingEntry>>();
  threats = new Map<number | string, [string, number, Set<string>][]>();
  matchupSource = new Map<number | string, string>();
  spreadCache = new Map<string, SpreadTable | null>();

  raidRankings = new Map<string, [string, number][]>();
  raidSets = new Map<string, [string | null, string | null]>();
  raidPos = new Map<string, Map<string, [number, number]>>();

  maxRankings = new Map<string, [string, number][]>();
  maxSets = new Map<string, [string | null, string | null]>();
  maxPos = new Map<string, Map<string, [number, number]>>();

  /**
   * False when the move table is the built-in offline snapshot: its numeric move ids are hand-typed and partly wrong, so a
   * Pokémon's Fast Attack type cannot be trusted. Rules that depend on the exact Fast Attack are skipped in that case.
   */
  moveIdsTrusted = true;

  dynamaxDex: Set<number>;
  gmaxType: Map<number, string>;
  dynamaxBases = new Set<string>();

  megaSpecies = new Set<string>();
  megaBases = new Map<string, string[]>();
  megaPreEvos = new Map<string, string[]>();
  megaSets = new Map<string, [string | null, string | null]>();
  megaRankings = new Map<string, [string, number][]>();
  megaPos = new Map<string, Map<string, [number, number]>>();

  constructor(
    data: RemoteGameData,
    cfg: PogoConfig,
    pve: PveContext,
    activeCaps: number[],
    activeCups: Record<string, CupDef>,
  ) {
    this.cfg = cfg;
    this.moveIdsTrusted = !/offline/i.test(data.sourceLabel || '');
    this.pve = pve;

    for (const sp of data.gm.pokemon || []) {
      this.byId.set(sp.speciesId, sp);
      const list = this.byDex.get(sp.dex) || [];
      list.push(sp);
      this.byDex.set(sp.dex, list);
    }
    for (const m of data.gm.moves || []) {
      if (m.moveId) this.moves.set(m.moveId, m);
    }

    for (const cap of activeCaps) {
      const rows = data.ranks[cap] || [];
      const posMap = new Map<string, [number, number]>();
      const rowPairs: [string, number][] = [];
      const metaMap = new Map<string, PvPokeRankingEntry>();

      rows.forEach((r, idx) => {
        const sc = Number(r.score ?? r.rating ?? 0);
        posMap.set(r.speciesId, [idx + 1, sc]);
        rowPairs.push([r.speciesId, sc]);
        metaMap.set(r.speciesId, r);
      });

      this.pvpPos.set(cap, posMap);
      this.pvpRows.set(cap, rowPairs);
      this.pvpMeta.set(cap, metaMap);

      const gRows = data.groups[cap] || [];
      this.buildThreatList(cap, gRows, rows);
    }

    for (const cupName of Object.keys(activeCups)) {
      const rows = data.cupRanks[cupName] || [];
      const posMap = new Map<string, [number, number]>();
      const metaMap = new Map<string, PvPokeRankingEntry>();
      rows.forEach((r, idx) => {
        const sc = Number(r.score ?? r.rating ?? 0);
        posMap.set(r.speciesId, [idx + 1, sc]);
        metaMap.set(r.speciesId, r);
      });
      this.cupPos.set(cupName, posMap);
      this.cupMeta.set(cupName, metaMap);
      const gRows = data.cupGroups[cupName] || [];
      this.buildThreatList(cupName, gRows, rows);
    }

    const bulkW = Number(cfg.raid?.bulk_weight ?? 1.0);
    const raidOut = this.buildTypeRankings(
      data.gm.pokemon || [],
      RAID_USEFUL_TYPES,
      SHADOW_SUFFIXES,
      true,
      'raid',
      bulkW,
    );
    this.raidRankings = raidOut.byType;
    this.raidSets = raidOut.sets;
    for (const [t, lst] of this.raidRankings.entries()) {
      const m = new Map<string, [number, number]>();
      lst.forEach(([sid, sc], i) => m.set(sid, [i + 1, sc]));
      this.raidPos.set(t, m);
    }

    const maxOut = this.buildTypeRankings(
      data.gm.pokemon || [],
      MAX_BATTLE_TYPES,
      SHADOW_SUFFIXES,
      true,
      'max',
      0,
    );
    this.maxRankings = maxOut.byType;
    this.maxSets = maxOut.sets;
    for (const [t, lst] of this.maxRankings.entries()) {
      const m = new Map<string, [number, number]>();
      lst.forEach(([sid, sc], i) => m.set(sid, [i + 1, sc]));
      this.maxPos.set(t, m);
    }

    // Dynamax / Gigantamax index
    const mc = cfg.max_battle || {};
    this.dynamaxDex = new Set([
      ...DYNAMAX_DEX,
      ...(mc.extra_dynamax_dex || []).map(Number),
    ]);
    this.gmaxType = new Map<number, string>(
      Object.entries(GMAX_TYPE).map(([k, v]) => [Number(k), v]),
    );
    if (mc.extra_gigantamax) {
      for (const [k, v] of Object.entries(mc.extra_gigantamax)) {
        this.gmaxType.set(Number(k), String(v).toLowerCase());
      }
    }

    for (const sp of data.gm.pokemon || []) {
      const tags = sp.tags || [];
      if (tags.includes('dynamax') || tags.includes('gigantamax')) {
        this.dynamaxBases.add(sp.speciesId);
      }
    }

    // Build Mega/Primal indices
    const reqReleased = cfg.mega?.require_released !== false;
    for (const sp of data.gm.pokemon || []) {
      const sid = sp.speciesId;
      const tags = new Set(sp.tags || []);
      if (!isMegaForm(sid, tags) && !sid.includes('_mega')) continue;
      if (reqReleased && sp.released === false) continue;
      const base = megaBaseOf(sid);
      if (!this.byId.has(base)) continue;
      this.megaSpecies.add(sid);
      const list = this.megaBases.get(base) || [];
      list.push(sid);
      this.megaBases.set(base, list);
    }

    // Pre-evolutions of Mega-capable bases
    for (const sp of data.gm.pokemon || []) {
      const sid = sp.speciesId;
      if (sid.endsWith('_shadow') || sid.includes('_mega') || sid.endsWith('_primal')) continue;
      const desc = this.descendants(sid);
      const megasForDesc: string[] = [];
      for (const d of desc) {
        const ml = this.megaBases.get(d);
        if (ml) {
          for (const msid of ml) {
            if (!megasForDesc.includes(msid)) megasForDesc.push(msid);
          }
        }
      }
      if (megasForDesc.length > 0) {
        this.megaPreEvos.set(sid, megasForDesc);
      }
    }

    // Mega rankings by type
    const megaSpList = Array.from(this.megaSpecies)
      .map((s) => this.byId.get(s))
      .filter((x): x is PvPokeSpecies => Boolean(x));
    const megaRankOut = this.buildTypeRankings(
      megaSpList,
      RAID_USEFUL_TYPES,
      SHADOW_SUFFIXES,
      false,
      'mega_inner',
      bulkW,
    );
    this.megaRankings = megaRankOut.byType;
    this.megaSets = megaRankOut.sets;
    for (const [t, lst] of this.megaRankings.entries()) {
      const m = new Map<string, [number, number]>();
      lst.forEach(([sid, sc], i) => m.set(sid, [i + 1, sc]));
      this.megaPos.set(t, m);
    }
  }

  private buildThreatList(
    key: number | string,
    gRows: PvPokeRankingEntry[],
    rankRows: PvPokeRankingEntry[],
  ): void {
    const count = Number(this.cfg.pvp_teams?.cohesion?.threat_count ?? 40);
    const metaMap =
      typeof key === 'number' ? this.pvpMeta.get(key) : this.cupMeta.get(key);
    const list: [string, number, Set<string>][] = [];

    if (gRows.length > 0) {
      const n = Math.min(count, gRows.length);
      for (let i = 0; i < n; i++) {
        const g = gRows[i];
        const sid = g.speciesId;
        const sp = this.byId.get(sid);
        const types = new Set((sp?.types || []).map((t) => t.toLowerCase()));
        list.push([sid, i + 1, types]);
      }
      this.threats.set(key, list);
      this.matchupSource.set(key, `PvPoke meta group (${list.length} threats)`);
    } else if (rankRows.length > 0) {
      const n = Math.min(count, rankRows.length);
      for (let i = 0; i < n; i++) {
        const sid = rankRows[i].speciesId;
        const sp = this.byId.get(sid);
        const types = new Set((sp?.types || []).map((t) => t.toLowerCase()));
        list.push([sid, i + 1, types]);
      }
      this.threats.set(key, list);
      this.matchupSource.set(
        key,
        metaMap?.size ? `rankings top ${list.length}` : 'rank-based fallback',
      );
    } else {
      this.threats.set(key, []);
      this.matchupSource.set(key, 'unavailable');
    }
  }

  private buildTypeRankings(
    speciesList: PvPokeSpecies[],
    usefulTypes: string[],
    forbidSuffixes: string[],
    releasedOnly: boolean,
    mode: 'raid' | 'max' | 'mega_inner',
    bulkWeight: number,
  ): {
    byType: Map<string, [string, number][]>;
    sets: Map<string, [string | null, string | null]>;
  } {
    const useful = new Set(usefulTypes);
    const byTypeMap = new Map<string, Map<string, number>>();
    const sets = new Map<string, [string | null, string | null]>();
    const bsOf = new Map<string, { atk: number; def: number; hp: number }>();

    for (const p of speciesList) {
      const sid = p.speciesId;
      if (!sid) continue;
      bsOf.set(sid, p.baseStats);
      const tags = new Set(p.tags || []);
      if (mode !== 'mega_inner') {
        if (isMegaForm(sid, tags) || sid.includes('_mega') || sid.includes('_primal')) continue;
      }
      if (forbidSuffixes.some((s) => sid.endsWith(s))) continue;
      if (releasedOnly && p.released === false) continue;
      if (!p.baseStats?.atk) continue;

      const types = new Set((p.types || []).map((t) => t.toLowerCase()));
      const fast = p.fastMoves || [];
      const charged = p.chargedMoves || [];

      if (mode === 'max') {
        const perType = bestMaxPerAtk(types, this.moves, fast);
        for (const [t, [coeff, fm]] of perType.entries()) {
          if (!useful.has(t)) continue;
          let map = byTypeMap.get(t);
          if (!map) {
            map = new Map();
            byTypeMap.set(t, map);
          }
          if ((map.get(sid) ?? -1) < coeff) {
            map.set(sid, coeff);
            sets.set(`${sid}|${t}`, [fm, null]);
          }
        }
      } else {
        const perType = bestDpsPerAtk(this.pve, types, this.moves, fast, charged);
        for (const [t, [coeff, fm, cm]] of perType.entries()) {
          if (!useful.has(t)) continue;
          let map = byTypeMap.get(t);
          if (!map) {
            map = new Map();
            byTypeMap.set(t, map);
          }
          if ((map.get(sid) ?? -1) < coeff) {
            map.set(sid, coeff);
            sets.set(`${sid}|${t}`, [fm, cm]);
          }
        }
      }
    }

    const strength = (sid: string, coeff: number) => {
      const bs = bsOf.get(sid);
      if (!bs) return 0;
      let s = coeff * (bs.atk + 15);
      if (mode !== 'max') {
        s *= raidBulk(bs, 15, 15, false, bulkWeight);
      }
      return s;
    };

    const byType = new Map<string, [string, number][]>();
    for (const [t, map] of byTypeMap.entries()) {
      const sorted = Array.from(map.entries()).sort(
        (a, b) => strength(b[0], b[1]) - strength(a[0], a[1]) || a[0].localeCompare(b[0]),
      );
      byType.set(t, sorted);
    }
    return { byType, sets };
  }

  applyDynamaxFilter(mons: MonModel[]): void {
    const allowedDex = new Set(this.dynamaxDex);
    for (const m of mons) {
      if ((m.is_dynamax || m.is_gigantamax) && m.dex) {
        allowedDex.add(m.dex);
      }
    }
    this.dynamaxDex = allowedDex;

    // Filter maxRankings to Dynamax-capable species only
    const filtered = new Map<string, [string, number][]>();
    const filteredPos = new Map<string, Map<string, [number, number]>>();
    const maxSids = new Map<string, { t: string; coeff: number }[]>();

    for (const [t, rows] of this.maxRankings.entries()) {
      const kept = rows.filter(([sid]) => this.canDynamax(sid));
      filtered.set(t, kept);
      const posMap = new Map<string, [number, number]>();
      kept.forEach(([sid, coeff], idx) => posMap.set(sid, [idx + 1, coeff]));
      filteredPos.set(t, posMap);
    }
    this.maxRankings = filtered;
    this.maxPos = filteredPos;
    void maxSids;

  }

  canDynamax(sid: string): boolean {
    if (!sid || sid.endsWith('_shadow') || sid.includes('_mega') || sid.endsWith('_primal')) {
      return false;
    }
    if (REGIONAL_SUFFIXES.some((s) => sid.endsWith(s))) return false;
    if (this.dynamaxBases.has(sid)) return true;
    const sp = this.byId.get(sid);
    if (!sp) return false;
    return this.dynamaxDex.has(sp.dex);
  }

  resolve(mon: MonModel): PvPokeSpecies | null {
    const cands = (this.byDex.get(mon.dex) || []).filter(
      (sp) =>
        !sp.speciesId.endsWith('_shadow') &&
        !sp.speciesId.includes('_mega') &&
        !sp.speciesId.endsWith('_primal'),
    );
    if (cands.length === 0) return null;

    const fn = normStr(mon.form_name);
    const isPlainForm = !fn || fn === 'unset' || fn.endsWith('normal') || fn.endsWith('standard');
    const wantedRegional =
      fn.endsWith('alola') || fn.endsWith('alolan')
        ? '_alolan'
        : fn.endsWith('galar') || fn.endsWith('galarian')
        ? '_galarian'
        : fn.endsWith('hisui') || fn.endsWith('hisuian')
        ? '_hisuian'
        : fn.endsWith('paldea') || fn.endsWith('paldean')
        ? '_paldean'
        : null;

    if (cands.length === 1) {
      const only = cands[0];
      if (isPlainForm && REGIONAL_SUFFIXES.some((s) => only.speciesId.endsWith(s))) {
        return null;
      }
      if (wantedRegional && !only.speciesId.endsWith(wantedRegional)) {
        return null;
      }
      return only;
    }

    const aliased = FORM_ALIASES[fn];
    if (aliased) {
      const hit = cands.find(
        (sp) =>
          sp.speciesId.endsWith(`_${aliased}`) ||
          normStr(sp.speciesId).endsWith(aliased),
      );
      if (hit) return hit;
    }

    if (!isPlainForm) {
      for (const sp of cands) {
        const sidNorm = normStr(sp.speciesId);
        if (fn.endsWith('alola') && sp.speciesId.endsWith('_alolan')) return sp;
        if (fn.endsWith('galar') && sp.speciesId.endsWith('_galarian')) return sp;
        if (fn.endsWith('hisui') && sp.speciesId.endsWith('_hisuian')) return sp;
        if (fn.endsWith('paldea') && sp.speciesId.endsWith('_paldean')) return sp;
        const suffix = sp.speciesId.includes('_') ? sp.speciesId.split('_').slice(1).join('') : '';
        if (suffix && fn.endsWith(suffix)) return sp;
        if (sidNorm === fn) return sp;
      }
      // If a specific regional form was requested and none matched, do NOT mislabel as Normal form
      if (wantedRegional) return null;
    }

    // Default plain form (prefer non-regional shortest id without suffix)
    const sorted = [...cands].sort((a, b) => {
      const aReg = REGIONAL_SUFFIXES.some((s) => a.speciesId.endsWith(s)) ? 1 : 0;
      const bReg = REGIONAL_SUFFIXES.some((s) => b.speciesId.endsWith(s)) ? 1 : 0;
      return aReg - bReg || a.speciesId.length - b.speciesId.length;
    });
    return sorted[0];
  }

  descendants(sid: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const queue = [sid];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      const sp = this.byId.get(cur);
      for (const evo of sp?.family?.evolutions || []) {
        if (!seen.has(evo)) queue.push(evo);
      }
    }
    return out;
  }

  ivRank(sid: string, cap: number, a: number, d: number, s: number): [number, number] | null {
    const sp = this.byId.get(sid);
    if (!sp?.baseStats) return null;
    const key = `${sid}|${cap}`;
    let table = this.spreadCache.get(key);
    if (table === undefined) {
      table = buildSpreads(sp.baseStats, cap);
      this.spreadCache.set(key, table);
    }
    return ivRankFromSpreads(table, a, d, s);
  }

  cupAllows(sid: string, cupSpec: CupDef): boolean {
    if (cupSpec.exclude_sids.has(sid)) return false;
    const sp = this.byId.get(sid);
    if (!sp || sp.released === false) return false;
    if (cupSpec.rule_kind === 'first_stage') {
      if (sp.family?.parent) return false;
      return true;
    }
    if (cupSpec.rule_kind === 'types' && cupSpec.include_types) {
      return (sp.types || []).some((t) => cupSpec.include_types!.has(t.toLowerCase()));
    }
    return true;
  }

  rankOf(sid: string, cap: number, preferShadow: boolean): [number, number] | null {
    const map = this.pvpPos.get(cap);
    if (!map) return null;
    if (preferShadow) {
      const sh = map.get(`${sid}_shadow`);
      const pl = map.get(sid);
      if (sh && pl) return sh[0] <= pl[0] ? sh : pl;
      if (sh) return sh;
      if (pl) return pl;
      return null;
    }
    return map.get(sid) || map.get(`${sid}_shadow`) || null;
  }

  knownSid(cap: number | string, sid: string): string | null {
    const meta = typeof cap === 'number' ? this.pvpMeta.get(cap) : this.cupMeta.get(cap);
    if (!meta) return null;
    if (meta.has(sid)) return sid;
    const sh = `${sid}_shadow`;
    if (meta.has(sh)) return sh;
    return null;
  }

  relation(cap: number | string, aSid: string, bSid: string): 1 | -1 | 0 {
    const meta = typeof cap === 'number' ? this.pvpMeta.get(cap) : this.cupMeta.get(cap);
    if (!meta) return 0;
    const ra = meta.get(aSid);
    const rb = meta.get(bSid);
    if (ra) {
      if ((ra.matchups || []).some((m) => m.opponent === bSid || m.opponent === bSid.replace(/_shadow$/, ''))) {
        return 1;
      }
      if ((ra.counters || []).some((m) => m.opponent === bSid || m.opponent === bSid.replace(/_shadow$/, ''))) {
        return -1;
      }
    }
    if (rb) {
      if ((rb.matchups || []).some((m) => m.opponent === aSid || m.opponent === aSid.replace(/_shadow$/, ''))) {
        return -1;
      }
      if ((rb.counters || []).some((m) => m.opponent === aSid || m.opponent === aSid.replace(/_shadow$/, ''))) {
        return 1;
      }
    }
    return 0;
  }

  roleScores(cap: number | string, sid: string): Record<string, number> {
    const meta = typeof cap === 'number' ? this.pvpMeta.get(cap) : this.cupMeta.get(cap);
    const entry = meta?.get(sid) || meta?.get(`${sid}_shadow`);
    const sc = entry?.scores;
    if (!sc || sc.length < 6) return {};
    const out: Record<string, number> = {};
    PVP_ROLE_KEYS.forEach((k, i) => {
      out[k] = Number(sc[i] ?? 0);
    });
    return out;
  }

  raidCoeff(sid: string, t: string): number | null {
    const rows = this.raidRankings.get(t);
    if (!rows) return null;
    const hit = rows.find(([s]) => s === sid);
    return hit ? hit[1] : null;
  }

  maxCoeff(sid: string, t: string): number | null {
    const rows = this.maxRankings.get(t);
    if (!rows) return null;
    const hit = rows.find(([s]) => s === sid);
    return hit ? hit[1] : null;
  }

  coeffOf(sid: string, t: string): [number | null, [string | null, string | null] | null] {
    const cRaid = this.raidCoeff(sid, t);
    if (cRaid !== null) {
      return [cRaid, this.raidSets.get(`${sid}|${t}`) || null];
    }
    const megaRows = this.megaRankings.get(t);
    const hit = megaRows?.find(([s]) => s === sid);
    if (hit) {
      return [hit[1], this.megaSets.get(`${sid}|${t}`) || null];
    }
    return [null, null];
  }

  familyMegaInfo(sid: string): string[] {
    return this.megaPreEvos.get(sid) || this.megaBases.get(sid) || [];
  }

  megaBoostTypes(megaSid: string | null): string[] {
    if (!megaSid) return [];
    return boostTypesFor(megaSid, this.byId.get(megaSid));
  }
}

export function refDps(
  dex: Dex,
  index: Map<string, [string, number][]>,
  atype: string,
  bulk = true,
): number {
  const rows = index.get(atype) || [];
  if (rows.length === 0) return 0;
  const [sid, coeff] = rows[0];
  const bs = dex.byId.get(sid)?.baseStats;
  if (!bs) return 0;
  const bw = Number(dex.cfg.raid?.bulk_weight ?? 1.0);
  return (bs.atk + 15) * CPM[40.0] * coeff * (bulk ? raidBulk(bs, 15, 15, false, bw) : 1.0);
}

export function estimatedRaidDps(
  mon: MonModel,
  dex: Dex,
  atypeOverride?: string,
  targetSidOverride?: string,
): number | null {
  const atype = atypeOverride || mon.raid_type;
  if (!mon.species || !atype) return null;
  let targetSid = targetSidOverride || mon.species.speciesId;
  if (!targetSidOverride && mon.raid_sid && mon.raid_sid !== targetSid) {
    if (!mon.raid_sid.endsWith('_crowned') && !mon.raid_sid.includes('crowned')) {
      targetSid = mon.raid_sid;
    }
  }
  const target = dex.byId.get(targetSid);
  if (!target) return null;
  const coeff = dex.raidCoeff(targetSid, atype);
  if (coeff === null) return null;
  const atkStat = target.baseStats.atk + mon.a;
  let effectiveAtk = atkStat * CPM[40.0];
  const sh = Boolean(mon.is_shadow && dex.cfg.raid?.prefer_shadow);
  if (sh) {
    effectiveAtk *= Number(dex.cfg.raid?.shadow_dps_bonus ?? 1.2);
  }
  const bw = Number(dex.cfg.raid?.bulk_weight ?? 1.0);
  return effectiveAtk * coeff * raidBulk(target.baseStats, mon.d, mon.s, sh, bw);
}

export function estimatedMegaDps(
  mon: MonModel,
  dex: Dex,
  atypeOverride?: string,
  megaSidOverride?: string,
): number | null {
  const megaSid = megaSidOverride || mon.mega_sid;
  if (!megaSid) return null;
  const sp = dex.byId.get(megaSid);
  if (!sp) return null;
  let atype = atypeOverride || mon.mega_type;
  if (!atype) {
    const types = (sp.types || []).map((t) => t.toLowerCase());
    atype = types[0] || null;
  }
  if (!atype) return null;
  let [coeff] = dex.coeffOf(megaSid, atype);
  if (coeff === null && atypeOverride) {
    // Some Megas/Primals boost types where their secondary move isn't top-ranked (e.g. Primal Groudon boosting Grass)
    const fallbackType = mon.mega_type || (sp.types?.[0]?.toLowerCase() || null);
    if (fallbackType) {
      const [fbCoeff] = dex.coeffOf(megaSid, fallbackType);
      if (fbCoeff !== null) coeff = fbCoeff * 0.72;
    }
  }
  if (coeff === null) return null;
  const atkStat = sp.baseStats.atk + mon.a;
  const bw = Number(dex.cfg.raid?.bulk_weight ?? 1.0);
  return atkStat * CPM[40.0] * coeff * raidBulk(sp.baseStats, mon.d, mon.s, false, bw);
}

export function estimatedMaxDps(mon: MonModel, dex: Dex): number | null {
  if (!mon.species || !mon.max_type) return null;
  const targetSid = mon.max_sid || mon.species.speciesId;
  const target = dex.byId.get(targetSid);
  if (!target) return null;
  const atkStat = target.baseStats.atk + mon.a;
  const dexNum = target.dex;
  const crowned = CROWNED_MAX_OVERRIDE[dexNum];
  if (crowned && isCrownedForm(mon)) {
    const stab = (target.types || []).some((x) => x.toLowerCase() === mon.max_type) ? STAB : 1.0;
    return (atkStat * CPM[40.0] * MAX_MOVE_POWER[3] * stab) / MAX_DAMAGE_DIV;
  }
  if (mon.is_gigantamax && dex.gmaxType.get(dexNum) === mon.max_type) {
    const stab = (target.types || []).some((x) => x.toLowerCase() === mon.max_type) ? STAB : 1.0;
    return (atkStat * CPM[40.0] * GMAX_MOVE_POWER[3] * stab) / MAX_DAMAGE_DIV;
  }
  const coeff = dex.maxCoeff(targetSid, mon.max_type);
  if (coeff === null) return null;
  const g = mon.is_gigantamax ? GMAX_MOVE_POWER[3] / MAX_MOVE_POWER[3] : 1.0;
  return atkStat * CPM[40.0] * coeff * g;
}

export function spName(dex: Dex, sid: string | null | undefined, fallback = '?'): string {
  if (!sid) return fallback;
  const sp = dex.byId.get(sid);
  return sp ? cleanSpeciesName(sp.speciesName) : fallback;
}

export function readinessSummary(
  rows: { id: string; verdict: VerdictType; build_status?: BuildStatus; meta?: { fast: boolean; charged: boolean } | null }[],
  byUid: Map<string, MonModel>,
  dex: Dex,
  cfg: PogoConfig,
): {
  ready_min_known: number;
  eligible_total: number;
  status_counts: Record<string, number>;
  elite_demand: { fast: number; charged: number; both: number; mons: number };
} {
  const counts: Record<string, number> = {
    Ready: 0,
    'Needs TM': 0,
    'Needs second charged move': 0,
    'Needs Elite TM': 0,
    Unknown: 0,
  };
  let fast = 0;
  let charged = 0;
  let both = 0;
  let mons = 0;
  let total = 0;

  for (const r of rows) {
    if (!READINESS_BUILDS.has(r.verdict)) continue;
    total++;
    const st = r.build_status || 'Unknown';
    counts[st] = (counts[st] || 0) + 1;
    const m = byUid.get(r.id) || null;
    const { meta } = readinessFields(dex.pve, m, dex, r.verdict, cfg);
    if (meta && (meta.fast || meta.charged)) {
      mons++;
      if (meta.fast && meta.charged) both++;
      else if (meta.fast) fast++;
      else charged++;
    }
  }

  return {
    ready_min_known: readyMin(cfg),
    eligible_total: total,
    status_counts: counts,
    elite_demand: { fast, charged, both, mons },
  };
}

export function leagueName(cap: number): string {
  return LEAGUE_NAMES[cap] || String(cap);
}
