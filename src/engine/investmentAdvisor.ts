/**
 * investmentAdvisor.ts
 * ---------------------------------------------------------------------------
 * Stage 3b: Value-based build priority + per-role Investment Advisor.
 *
 * Rules:
 *  - Deterministic calculations stay here. Never invent rankings, costs, moves or balances.
 *  - Priority compares marginal gain against the weakest useful Pokémon currently filling the role,
 *    divides by resource cost, weighs scarcity (Elite TMs, XL Candy), and merges shared actions
 *    (for example a single power-up/evolution that serves both Raid and Mega).
 *  - Missing resource balances are explicitly flagged ("Resource balance unknown"), never treated as 0 or "enough".
 */

import { buildRowCosts } from './costTables';
import { CPM } from './cpmTable';
import {
  cleanSpeciesName,
  CROWNED_MAX_OVERRIDE,
  GMAX_MOVE_POWER,
  GRADE_TYPE_IMPORTANCE,
  LEAGUE_NAMES,
  MAX_BATTLE_TYPES,
  MAX_DAMAGE_DIV,
  MAX_MOVE_POWER,
  OUT_OF_PLAY,
  RAID_USEFUL_TYPES,
  SHADOW_ATK_MULT,
  STAB,
} from './defaultConfig';
import { costBundleFor, familyKeysFor } from './investmentCost';
import { assessMegaForm, megaBaseSid } from './megaStatus';
import { displaySpecies, ingameSearch, isCrownedForm, ivStr } from './pgsParser';
import {
  canJoinMaxBattle,
  currentMoves,
  Dex,
  estimatedMegaDps,
  fastOnlyDpsPerAtk,
  maxMoveGainPct,
  moveLabel,
  pairDpsPerAtk,
  prepMoves,
  raidBulk,
  readinessFields,
  refDps,
  spName,
} from './pveModel';
import { assessRaidMon, tmBagFrom } from './raidMoveEval';
import {
  assessAlone,
  emptyCost,
  type AllocationResult,
  type CostBundle,
  type Ledger,
} from './resourceLedger';
import type {
  BagResources,
  LeagueTeamsBlock,
  LevelTheseItem,
  MaxTeamTypeBlock,
  MonModel,
  PogoConfig,
  PvPokeSpecies,
  RaidTeamTypeBlock,
  ReportMon,
  RoleAdvisorRecommendation,
  RoleInvestmentAdvice,
} from './types';

function cpmAt(level: number): number {
  const half = Math.min(50, Math.max(1, Math.round(level * 2) / 2));
  return CPM[half] ?? CPM[40] ?? 0.7903;
}

/**
 * Compute type-effective raid DPS at a given species, level, shadow state, and explicit fast/charged move IDs.
 * If moveIds are omitted or unrecognized, returns best attainable or null safely.
 */
export function specimenCurrentRaidDps(
  mon: MonModel,
  sp: PvPokeSpecies,
  dex: Dex,
  cfg: PogoConfig,
  atype: string,
  level: number,
  isShadow: boolean,
): number {
  const atkTypes = new Set((sp.types || []).map((t) => String(t).toLowerCase()));
  const atk = (sp.baseStats.atk + mon.a) * cpmAt(level) * (isShadow ? Number(cfg.raid?.shadow_dps_bonus ?? SHADOW_ATK_MULT) : 1.0);
  const bw = Number(cfg.raid?.bulk_weight ?? 1.0);
  const bulk = raidBulk(sp.baseStats, mon.d, mon.s, isShadow, bw);

  const cur = currentMoves(dex.pve, mon);
  const fastRaw = mon.raw.move1 ? dex.pve.byId.get(Number(mon.raw.move1)) : undefined;
  const ch1Raw = mon.raw.move2 ? dex.pve.byId.get(Number(mon.raw.move2)) : undefined;
  const ch2Raw = mon.raw.move3 ? dex.pve.byId.get(Number(mon.raw.move3)) : undefined;

  const fastId = fastRaw ? fastRaw.replace(/_FAST$/, '') : '';
  const chargedIds = [ch1Raw, ch2Raw].filter((x): x is string => Boolean(x));

  if (fastId && chargedIds.length > 0) {
    const prepped = prepMoves(dex.pve, dex.moves, [fastId], chargedIds);
    const fm = prepped.fasts[0];
    let best = 0;
    if (fm) {
      for (const cm of prepped.chargeds) {
        // Skip Frustration/Return-like dead moves (power 0 or 10) automatically via pairDpsPerAtk vs fastOnly
        if (cm.moveId === 'FRUSTRATION') continue;
        const d = atk * bulk * pairDpsPerAtk(fm, cm, atkTypes, atype, dex.pve.ok);
        if (d > best) best = d;
      }
      const fastOnly = atk * bulk * fastOnlyDpsPerAtk(fm, atkTypes, atype);
      if (fastOnly > best) best = fastOnly;
    }
    if (best > 0) return Math.round(best * 100) / 100;
  }

  // Fallback if move ids aren't readable in export (e.g. offline snapshot)
  if (cur.length === 0) {
    const coeff = dex.raidCoeff(sp.speciesId, atype);
    if (coeff !== null) {
      return Math.round(atk * bulk * coeff * 100) / 100;
    }
  }
  return 0;
}

export function specimenMaxDpsAtLevel(
  mon: MonModel,
  sp: PvPokeSpecies,
  dex: Dex,
  maxType: string,
  level: number,
  attackLevel: number,
): number {
  const atkStat = (sp.baseStats.atk + mon.a) * cpmAt(level);
  const lvlIdx = Math.min(3, Math.max(1, attackLevel || 1));
  const dexNum = sp.dex;
  const stab = (sp.types || []).some((x) => x.toLowerCase() === maxType) ? STAB : 1.0;
  const crowned = CROWNED_MAX_OVERRIDE[dexNum];
  if (crowned && isCrownedForm(mon)) {
    return Math.round(((atkStat * MAX_MOVE_POWER[lvlIdx] * stab) / MAX_DAMAGE_DIV) * 100) / 100;
  }
  if (mon.is_gigantamax && dex.gmaxType.get(dexNum) === maxType) {
    return Math.round(((atkStat * GMAX_MOVE_POWER[lvlIdx] * stab) / MAX_DAMAGE_DIV) * 100) / 100;
  }
  const table = mon.is_gigantamax ? GMAX_MOVE_POWER : MAX_MOVE_POWER;
  const baseCoeff = dex.maxCoeff(sp.speciesId, maxType);
  if (baseCoeff !== null) {
    return Math.round(atkStat * baseCoeff * (table[lvlIdx] / MAX_MOVE_POWER[3]) * 100) / 100;
  }
  return Math.round(((atkStat * table[lvlIdx] * stab) / MAX_DAMAGE_DIV) * 100) / 100;
}

/** Resource cost converted into a single denominator weighted by scarcity in the player's ledger. */
export function scarcityWeightedCost(bundle: CostBundle, ledger?: Ledger): number {
  const dust = (bundle.stardust || 0) / 12000; // 12k dust = 1.0 unit; 120k = 10 units

  const heldFast = ledger?.fast_tm.state === 'known' ? ledger.fast_tm.value : null;
  const heldCh = ledger?.charged_tm.state === 'known' ? ledger.charged_tm.value : null;
  const heldEFast = ledger?.elite_fast_tm.state === 'known' ? ledger.elite_fast_tm.value : null;
  const heldECh = ledger?.elite_charged_tm.state === 'known' ? ledger.elite_charged_tm.value : null;

  const fastTm = (bundle.fast_tm || 0) * (heldFast !== null && heldFast < (bundle.fast_tm || 0) ? 4.0 : 0.45);
  const chTm = (bundle.charged_tm || 0) * (heldCh !== null && heldCh < (bundle.charged_tm || 0) ? 4.5 : 0.65);

  // Scarcity: Elite TMs are heavily rationed, especially if 0 held
  const eFastUnit = heldEFast === 0 ? 32 : heldEFast !== null && heldEFast <= 1 ? 18 : 12;
  const eChUnit = heldECh === 0 ? 40 : heldECh !== null && heldECh <= 1 ? 22 : 14;
  const eliteCost = (bundle.elite_fast_tm || 0) * eFastUnit + (bundle.elite_charged_tm || 0) * eChUnit;

  const itemCount = Object.values(bundle.items || {}).reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  const itemsCost = itemCount * 2.5;
  const megaCost = (bundle.mega_energy || 0) * 0.04;
  const blockerPenalty = (bundle.hard_blockers?.length || 0) * 35;

  return Math.max(1.2, dust + fastTm + chTm + eliteCost + itemsCost + megaCost + blockerPenalty);
}

export interface PriorityEvaluation {
  impact: number;
  valuePerCost: number;
  marginalGainPct: number | null;
  weakestInRole: string;
  sharedRoles: string[];
  advisorMessages: string[];
}

export function computeValueBasedPriority(params: {
  r: ReportMon;
  mon: MonModel | undefined;
  bundle: CostBundle;
  dex: Dex;
  cfg: PogoConfig;
  raidTeams: RaidTeamTypeBlock[];
  maxTeams: MaxTeamTypeBlock[];
  teams: LeagueTeamsBlock[];
  gapSet: Set<string>;
  ledger?: Ledger;
}): PriorityEvaluation {
  const { r, mon: m, bundle, dex, cfg, raidTeams, maxTeams, gapSet, ledger } = params;
  const tmBag = tmBagFrom(null);
  const advisorMessages: string[] = [];
  const sharedRoles: string[] = [];

  let marginalValue = 0;
  let marginalGainPct: number | null = null;
  let weakestInRole = '';

  const pveTargetLv = Number(cfg.raid?.power_level ?? 40);

  // Helper: evaluate Raid marginal gain against weakest active team slot for a given type
  const evalRaidGain = (ty: string, targetSid: string | null): { value: number; pct: number | null; weakestLabel: string } => {
    const rt = raidTeams.find((x) => x.type === ty);
    const active = (rt?.entries || []).filter((e) => e.slot === 'team');
    const ref = refDps(dex, dex.raidRankings, ty, true) || 1;
    const sp = (targetSid ? dex.byId.get(targetSid) : null) || m?.species || null;

    let targetDps = m?.raid_dps || 0;
    let currentDps = 0;
    if (m && sp) {
      const targetLv = r.power_up_to ?? Math.max(m.level, pveTargetLv);
      const aTarget = assessRaidMon({ mon: m, species: sp, dex, cfg, teamType: ty, tmBag });
      const baseDps40 = aTarget?.dps ?? m.raid_dps;
      targetDps = baseDps40 * (cpmAt(targetLv) / cpmAt(40));
      currentDps = m.species ? specimenCurrentRaidDps(m, m.species, dex, cfg, ty, m.level, m.is_shadow) : 0;
    }

    const onTeam = active.some((e) => e.id === r.id);
    const openSlot = active.length < 6;
    const weakestEntry = active.length > 0 ? active[active.length - 1] : null;
    const floorDps = openSlot ? 0 : weakestEntry?.dps ?? 0;
    const weakestLabel = openSlot
      ? `Open ${ty} slot (${active.length}/6 filled)`
      : weakestEntry
      ? `${weakestEntry.name} (${weakestEntry.dps} dps)`
      : `Empty ${ty} slot`;

    let gainDps = 0;
    if (onTeam) {
      gainDps = Math.max(0, targetDps - currentDps);
    } else if (openSlot) {
      gainDps = targetDps;
    } else {
      gainDps = Math.max(0, targetDps - floorDps);
    }

    const baseline = floorDps > 0 ? floorDps : ref;
    const pct = baseline > 0 ? Math.round((1000 * gainDps) / baseline) / 10 : null;
    const normGain = (gainDps / ref) * 100;
    const imp = GRADE_TYPE_IMPORTANCE[ty] ?? 1.0;
    const gapMult = gapSet.has(ty) ? 1.4 : 1.0;
    return {
      value: normGain * imp * gapMult,
      pct,
      weakestLabel,
    };
  };

  // Helper: evaluate Mega marginal gain
  const evalMegaGain = (ty: string, megaSid: string): { value: number; pct: number | null; weakestLabel: string; alsoBoostsRaid: string[] } => {
    const boosts = dex.megaBoostTypes(megaSid);
    const allBoostTypes = Array.from(new Set([ty, ...boosts].filter(Boolean)));
    let value = 0;
    let pct: number | null = null;
    let weakestLabel = '';
    const alsoBoostsRaid: string[] = [];

    for (const bt of allBoostTypes) {
      const rt = raidTeams.find((x) => x.type === bt);
      const curMega = rt?.mega;
      const megaDps40 = m ? estimatedMegaDps(m, dex, bt, megaSid) ?? 0 : 0;
      const targetLv = r.power_up_to ?? Math.max(m?.level ?? 20, pveTargetLv);
      const megaTargetDps = megaDps40 * (cpmAt(targetLv) / cpmAt(40));
      const curMegaVal = curMega ? curMega.dps : 0;
      const isSameMon = curMega?.id === r.id;

      if (bt === ty) {
        weakestLabel = curMega
          ? `${curMega.name} (${curMega.dps} dps)`
          : `No unlocked ${bt} Mega`;
        if (!curMega) {
          // Filling an uncovered Mega slot adds raid candy + 10/30% raid damage boost + DPS
          const ref = refDps(dex, dex.raidRankings, bt, true) || 1;
          value += 36 + (megaTargetDps / ref) * 45 + (gapSet.has(bt) ? 18 : 0);
          pct = 100;
        } else if (isSameMon) {
          const curLevelDps = megaDps40 * (cpmAt(m?.level ?? 20) / cpmAt(40));
          const delta = Math.max(0, megaTargetDps - curLevelDps);
          value += (delta / Math.max(1, curMegaVal)) * 35 + 8;
          pct = curMegaVal > 0 ? Math.round((1000 * delta) / curMegaVal) / 10 : null;
        } else {
          const delta = Math.max(0, megaTargetDps - curMegaVal);
          value += (delta / Math.max(1, curMegaVal)) * 45;
          pct = curMegaVal > 0 ? Math.round((1000 * delta) / curMegaVal) / 10 : null;
        }
      } else if (!curMega) {
        value += 16;
        alsoBoostsRaid.push(`${bt} Mega coverage`);
      }
    }
    return { value, pct, weakestLabel, alsoBoostsRaid };
  };

  if (r.verdict === 'BUILD_RAID') {
    const ty = r.raid_type || 'normal';
    const rg = evalRaidGain(ty, m?.raid_sid || m?.species?.speciesId || null);
    marginalValue += rg.value;
    marginalGainPct = rg.pct;
    weakestInRole = rg.weakestLabel;

    // Merge shared action: if this specimen is Mega-capable & un-unlocked or boosts a gap Mega type, add shared Mega value
    const raidTargetSid = (r.evolve_to_sid || m?.raid_sid || m?.species?.speciesId || '').replace(/_shadow$/, '');
    const mBase = m?.mega_sid ? megaBaseSid(m.mega_sid) : '';
    if (m && !m.is_shadow && m.mega_sid && raidTargetSid === mBase) {
      const mType = m.mega_type || dex.megaBoostTypes(m.mega_sid)[0] || '';
      if (mType) {
        const mg = evalMegaGain(mType, m.mega_sid);
        if (mg.value > 5) {
          marginalValue += mg.value * 0.4;
          sharedRoles.push(`Mega ${spName(dex, m.mega_sid)} (${mType})`);
        }
      }
    }
  } else if (r.verdict === 'BUILD_MEGA') {
    const ty = r.mega_type || (m?.mega_sid ? dex.megaBoostTypes(m.mega_sid)[0] : '') || 'normal';
    const megaSid = m?.mega_sid || '';
    const mg = megaSid ? evalMegaGain(ty, megaSid) : { value: 25, pct: null, weakestLabel: `No ${ty} Mega`, alsoBoostsRaid: [] };
    marginalValue += mg.value;
    marginalGainPct = mg.pct;
    weakestInRole = mg.weakestLabel;
    sharedRoles.push(...mg.alsoBoostsRaid);

    // Merge shared action: powering up/evolving a Mega also strengthens its Raid attacker DPS (when used in raids)
    if (m && megaSid) {
      const baseSid = megaBaseSid(megaSid);
      const hit = dex.raidPos.get(ty)?.get(baseSid);
      if (hit && hit[0] <= 25) {
        const rg = evalRaidGain(ty, baseSid);
        if (rg.value > 3) {
          marginalValue += rg.value * 0.45;
          sharedRoles.push(`${ty} Raid DPS`);
        }
      }
    }
  } else if (r.verdict === 'BUILD_PVP') {
    const bp = m?.best_pvp;
    if (bp) {
      const metaQuality = Math.max(8, 100 - Math.min(88, (bp.species_rank - 1) * 0.65));
      const ivQuality =
        bp.cap >= 10000
          ? Math.max(0.4, Math.min(1.0, (m.a / 15) * 0.4 + ((r.iv_pct - 75) / 25) * 0.6))
          : Math.max(0.25, 1.0 - Math.sqrt((Math.max(1, bp.iv_rank) - 1) / 4095) * 0.75);
      // Higher marginal value if it needs less CP travel to be battle-ready or fills a top-50 meta slot
      const battleBonus = m?.pvp_battle ? Math.max(0, (m.pvp_battle.win_rate_1v1 - 45) * 0.4) : 0;
      marginalValue += metaQuality * ivQuality * 0.85 + battleBonus;
      marginalGainPct = Math.round(ivQuality * 1000) / 10;
      weakestInRole = `${bp.league} #${bp.species_rank} slot (IV #${bp.iv_rank})`;

      // Merge shared action: Master League hundos/legendaries that also raid or Mega
      if (bp.cap >= 10000 && m?.raid_type) {
        const rg = evalRaidGain(m.raid_type, m.raid_sid || m.species?.speciesId || null);
        if (rg.value > 5) {
          marginalValue += rg.value * 0.35;
          sharedRoles.push(`${m.raid_type} Raid attacker`);
        }
      }
      if (m && !m.is_shadow && m.mega_sid && (bp.cap >= 10000 || bp.species_rank <= 50)) {
        const mType = m.mega_type || dex.megaBoostTypes(m.mega_sid)[0];
        if (mType && !raidTeams.find((x) => x.type === mType)?.mega) {
          marginalValue += 12;
          sharedRoles.push(`Mega ${spName(dex, m.mega_sid)}`);
        }
      }
    } else {
      marginalValue += 20;
      weakestInRole = 'PvP slot';
    }
  } else if (r.verdict === 'BUILD_MAX') {
    const ty = r.max_type || 'normal';
    const mt = maxTeams.find((x) => x.type === ty);
    const active = mt?.entries || [];
    const targetSp = (m?.max_sid ? dex.byId.get(m.max_sid) : null) || m?.species || null;
    const curDps = m && m.species ? specimenMaxDpsAtLevel(m, m.species, dex, ty, m.level, m.max_attack_level || 1) : 0;
    const tgtLv = r.power_up_to ?? Math.max(m?.level ?? 20, 40);
    const tgtDps = m && targetSp ? specimenMaxDpsAtLevel(m, targetSp, dex, ty, tgtLv, 3) : curDps;
    const refMax = refDps(dex, dex.maxRankings, ty, false) || 1;
    const openSlot = active.length < 4;
    const weakestEntry = active.length > 0 ? active[active.length - 1] : null;
    const floorDps = openSlot ? 0 : weakestEntry?.dps ?? 0;
    weakestInRole = openSlot
      ? `Open ${ty} Max slot (${active.length}/4)`
      : weakestEntry
      ? `${weakestEntry.name} (${weakestEntry.dps} dps)`
      : `Empty ${ty} Max slot`;
    const onTeam = active.some((e) => e.id === r.id);
    const gain = onTeam ? Math.max(0, tgtDps - curDps) : Math.max(0, tgtDps - floorDps);
    marginalValue += (gain / refMax) * 95 + (m?.is_gigantamax ? 15 : 0) + (m ? maxMoveGainPct(m) * 0.25 : 0);
    marginalGainPct = floorDps > 0 ? Math.round((1000 * gain) / floorDps) / 10 : 100;

    // Shared Raid utility for Crowned / G-Max / Dynamax if also on raid list
    if (m?.raid_type) {
      const rg = evalRaidGain(m.raid_type, m.raid_sid || m.species?.speciesId || null);
      if (rg.value > 5) {
        marginalValue += rg.value * 0.25;
        sharedRoles.push(`${m.raid_type} Raid fallback`);
      }
    }
  } else if (r.verdict === 'BUILD_GYM') {
    marginalValue = 14 + (r.iv_pct / 100) * 8;
    weakestInRole = 'Gym defender bench';
  }

  // Resource-efficiency ratio: marginal value per scarcity-adjusted cost
  const costUnits = scarcityWeightedCost(bundle, ledger);
  const valuePerCost = Math.round((marginalValue / costUnits) * 100) / 100;

  // Map valuePerCost + absolute strategic impact smoothly onto 1..99
  const rawScore = 18 * Math.log2(1 + valuePerCost * 1.65) + Math.min(18, marginalValue * 0.14);
  const impact = Math.round(Math.max(1, Math.min(99, rawScore)));

  // Explicit advisor messages for this investment row
  const heldECh = ledger?.elite_charged_tm.state === 'known' ? ledger.elite_charged_tm.value : null;
  const heldEFast = ledger?.elite_fast_tm.state === 'known' ? ledger.elite_fast_tm.value : null;
  if (
    (bundle.elite_charged_tm > 0 && (heldECh === 0 || Boolean(r.wait_cd_move))) ||
    (bundle.elite_fast_tm > 0 && (heldEFast === 0 || Boolean(r.wait_cd_move)))
  ) {
    advisorMessages.push(
      r.wait_cd_move
        ? `Save your Elite TM: wait for event evolution (${r.wait_cd_move})`
        : 'Save your Elite TM: none held in bag — use regular TM moveset unless meta-critical',
    );
  }
  if (
    bundle.unknown_costs.length > 0 ||
    ((bundle.mega_energy ?? 0) > 0 && ledger?.mega_energy.state === 'unknown') ||
    (bundle.stardust > 0 && ledger?.stardust.state === 'unknown')
  ) {
    advisorMessages.push('Resource balance unknown: verify Mega Energy / Stardust in-game');
  }
  if (marginalGainPct !== null && marginalGainPct < 4 && bundle.stardust >= 20000) {
    advisorMessages.push(`Tiny upgrade (+${marginalGainPct}% vs current role floor) for high cost`);
  }
  if (marginalValue <= 1.5 && (bundle.stardust >= 50000 || bundle.elite_charged_tm > 0 || bundle.elite_fast_tm > 0)) {
    advisorMessages.push('Do not invest: minimal gain over what you already field');
  }

  return {
    impact,
    valuePerCost,
    marginalGainPct,
    weakestInRole,
    sharedRoles: Array.from(new Set(sharedRoles)),
    advisorMessages,
  };
}

/** Format CostBundle short summary for alternatives comparison. */
function shortCostSummary(b: CostBundle): string {
  const parts: string[] = [];
  if (b.stardust > 0) parts.push(`${b.stardust.toLocaleString()} dust`);
  if (b.fast_tm > 0) parts.push(`${b.fast_tm} Fast TM`);
  if (b.charged_tm > 0) parts.push(`${b.charged_tm} Charged TM`);
  if (b.elite_fast_tm > 0) parts.push(`${b.elite_fast_tm} Elite Fast TM`);
  if (b.elite_charged_tm > 0) parts.push(`${b.elite_charged_tm} Elite Charged TM`);
  if (b.mega_energy && b.mega_energy > 0) parts.push(`${b.mega_energy} Mega Energy`);
  for (const [k, v] of Object.entries(b.items)) {
    if (v > 0) parts.push(`${v}x ${k.replace(/_/g, ' ')}`);
  }
  if (b.unknown_costs.length > 0) parts.push('Unknown cost parts');
  return parts.join(', ') || 'Free (already built)';
}

function affordDetailFromAlloc(res: AllocationResult): string {
  if (res.status === 'READY') return 'All required resources are confirmed in your bag.';
  const shorts = res.lines
    .filter((l) => l.status === 'short' && l.key !== 'species_candy' && l.key !== 'species_xl_candy')
    .map((l) => `${l.label} (need ${l.need}, have ${l.have ?? 0})`);
  const unknowns = res.lines
    .filter((l) => l.status === 'unknown' && l.key !== 'species_candy' && l.key !== 'species_xl_candy')
    .map((l) => l.label);
  const parts: string[] = [];
  if (shorts.length) parts.push(`Short on: ${shorts.join(', ')}`);
  if (unknowns.length) parts.push(`Unknown in export: ${unknowns.join(', ')}`);
  const cleanNotes = res.notes.filter((n) => !n.toLowerCase().includes('candy'));
  if (cleanNotes.length) parts.push(cleanNotes[0]);
  return parts.join(' · ') || res.status;
}

function costObjFromBundle(b: CostBundle): RoleInvestmentAdvice['cost'] {
  const items: string[] = [];
  for (const [k, v] of Object.entries(b.items)) {
    if (v > 0) items.push(`${v}x ${k.replace(/_/g, ' ')}`);
  }
  return {
    dust: b.stardust,
    candy: 0,
    xl: 0,
    fast_tm: b.fast_tm,
    charged_tm: b.charged_tm,
    elite_fast_tm: b.elite_fast_tm,
    elite_charged_tm: b.elite_charged_tm,
    items,
    mega_energy: b.mega_energy,
    unknown_costs: [...b.unknown_costs],
    estimated: [...b.estimated].filter((e) => !e.toLowerCase().includes('candy')),
  };
}

/**
 * Builds deterministic per-role Investment Advisor records across Raid, Mega, Max Battles, and PvP Leagues.
 */
export function buildRoleInvestmentAdvisor(params: {
  mons: MonModel[];
  reportMons: ReportMon[];
  dex: Dex;
  cfg: PogoConfig;
  caps: number[];
  raidTeams: RaidTeamTypeBlock[];
  maxTeams: MaxTeamTypeBlock[];
  teams: LeagueTeamsBlock[];
  bagResources?: BagResources;
  ledger?: Ledger;
  levelThese: LevelTheseItem[];
}): RoleInvestmentAdvice[] {
  const { mons, reportMons, dex, cfg, caps, raidTeams, maxTeams, teams, bagResources, ledger, levelThese } = params;
  const tmBag = tmBagFrom(bagResources);
  const reportById = new Map(reportMons.map((r) => [r.id, r]));
  const queueById = new Map(levelThese.map((it) => [it.id, it]));
  const pveTargetLv = Number(cfg.raid?.power_level ?? 40);
  const speciesRankCap = Math.max(30, Number(cfg.raid.top_n_species ?? 20));
  const out: RoleInvestmentAdvice[] = [];

  const isHeld = (m: MonModel) => !OUT_OF_PLAY.has(m.verdict) && Boolean(m.species);

  const checkUnknownBalances = (b: CostBundle): boolean => {
    if (b.unknown_costs.length > 0) return true;
    if (!ledger) return false;
    if (b.stardust > 0 && ledger.stardust.state === 'unknown') return true;
    if ((b.mega_energy ?? 0) > 0 && ledger.mega_energy.state === 'unknown') return true;
    if (b.fast_tm > 0 && ledger.fast_tm.state === 'unknown') return true;
    if (b.charged_tm > 0 && ledger.charged_tm.state === 'unknown') return true;
    if (b.elite_fast_tm > 0 && ledger.elite_fast_tm.state === 'unknown') return true;
    if (b.elite_charged_tm > 0 && ledger.elite_charged_tm.state === 'unknown') return true;
    if (b.max_particles !== null && b.max_particles > 0 && ledger.max_particles.state === 'unknown') return true;
    return false;
  };

  // =========================================================================
  // 1. RAID ROLES (all 18 types)
  // =========================================================================
  for (const atype of RAID_USEFUL_TYPES) {
    const rt = raidTeams.find((x) => x.type === atype);
    const activeTeam = (rt?.entries || []).filter((e) => e.slot === 'team');
    const weakestEntry = activeTeam.length >= 6 ? activeTeam[activeTeam.length - 1] : null;
    const weakestVal = weakestEntry ? weakestEntry.dps : 0;

    interface RaidRoleCand {
      mon: MonModel;
      targetSid: string;
      targetSp: PvPokeSpecies;
      currentDps: number;
      bestDps: number;
      targetLv: number;
      evolveTo: string;
      tmActions: string[];
      needsElite: boolean;
      status: 'ready' | 'needs_tm' | 'blocked';
      bundle: CostBundle;
      alloc: AllocationResult | null;
      sameSpeciesBetterOwned: boolean;
    }

    const cands: RaidRoleCand[] = [];
    for (const m of mons) {
      if (!isHeld(m)) continue;
      let bestForMon: RaidRoleCand | null = null;
      for (const d of dex.descendants(m.species!.speciesId)) {
        const hit = dex.raidPos.get(atype)?.get(d);
        if (!hit || hit[0] > speciesRankCap) continue;
        const targetSp = dex.byId.get(d);
        if (!targetSp) continue;
        const a = assessRaidMon({ mon: m, species: targetSp, dex, cfg, teamType: atype, tmBag });
        if (!a || a.dps <= 0) continue;
        const targetLv = Math.max(m.level, pveTargetLv);
        const curDps = m.species ? specimenCurrentRaidDps(m, m.species, dex, cfg, atype, m.level, m.is_shadow) : 0;
        const bestDps = Math.round(a.dps * (cpmAt(targetLv) / cpmAt(40)) * 100) / 100;
        const evolveTo = m.species && d !== m.species.speciesId ? cleanSpeciesName(targetSp.speciesName) : '';
        const costs = buildRowCosts({ ...m, evolve_to_sid: evolveTo ? d : null, power_up_to: targetLv > m.level ? targetLv : null }, dex.byId);
        const rep = reportById.get(m.uid);
        const tmTyped = a.tmActions.map((act) => {
          const elite = /Elite /i.test(act);
          const slot: 'fast' | 'charged' = /Fast TM/i.test(act) ? 'fast' : 'charged';
          return { name: act, slot, elite };
        });
        const bundle = costBundleFor(
          {
            id: m.uid,
            species: displaySpecies(m),
            verdict: 'BUILD_RAID',
            role: `${atype} raid`,
            cp: m.cp,
            iv: ivStr(m),
            level: m.level,
            power_up_to: targetLv > m.level ? targetLv : null,
            evolve_to: evolveTo,
            gap_fix: '',
            impact: 50,
            cost: { dust: costs.dust, candy: 0, xl: 0 },
            moves: [],
            tm_needed: a.tmActions,
            tm_typed: tmTyped,
            needs_second_move: false,
            why: [],
            search: '',
          },
          m,
          {
            ...(rep || ({} as ReportMon)),
            cost_dust: costs.dust,
            cost_candy: 0,
            cost_xl: 0,
            cost_estimated: false,
            needs_typed: tmTyped,
            build_status: a.status === 'ready' ? 'Ready' : a.blocker === 'needs_elite_tm' ? 'Needs Elite TM' : 'Needs TM',
          },
          dex,
        );
        const alloc = ledger ? assessAlone(bundle, ledger, familyKeysFor(m, dex)) : null;
        const cand: RaidRoleCand = {
          mon: m,
          targetSid: d,
          targetSp,
          currentDps: curDps,
          bestDps,
          targetLv,
          evolveTo,
          tmActions: a.tmActions,
          needsElite: bundle.elite_fast_tm > 0 || bundle.elite_charged_tm > 0,
          status: a.status,
          bundle,
          alloc,
          sameSpeciesBetterOwned: false,
        };
        if (!bestForMon || cand.bestDps > bestForMon.bestDps) bestForMon = cand;
      }
      if (bestForMon) cands.push(bestForMon);
    }

    cands.sort((a, b) => b.bestDps - a.bestDps || b.currentDps - a.currentDps || b.mon.iv_pct - a.mon.iv_pct);

    if (cands.length === 0) {
      out.push({
        roleKey: `raid:${atype}`,
        category: 'raid',
        roleLabel: `${atype[0].toUpperCase() + atype.slice(1)} Raid Attacker`,
        bestSpecimen: null,
        currentPerformance: null,
        bestAchievablePerformance: null,
        weakestInRole: weakestEntry ? { id: weakestEntry.id, name: weakestEntry.name, value: weakestVal, unit: 'eDPS' } : null,
        improvement: { delta: 0, pct: null, summary: 'No owned candidates in box.' },
        whatChanges: [],
        sharedActions: [],
        cost: costObjFromBundle(emptyCost()),
        affordNow: 'NO_ACTION',
        affordabilityDetail: 'Catch or hatch counters of this type first.',
        alternativesConsidered: [],
        recommendation: 'NONE_OWNED',
        messages: [`No ranked ${atype} raid attackers currently held.`],
      });
      continue;
    }

    const best = cands[0];
    // Mark inferior same-species alternatives
    for (let i = 1; i < cands.length; i++) {
      if (cands[i].targetSid === best.targetSid && cands[i].mon.is_shadow === best.mon.is_shadow) {
        cands[i].sameSpeciesBetterOwned = true;
      }
    }

    const repBest = reportById.get(best.mon.uid);
    const queueBest = queueById.get(best.mon.uid);
    const whatChanges: string[] = [];
    const evoAct = best.tmActions.find((a) => a.toLowerCase().startsWith('evolve '));
    if (best.evolveTo) {
      whatChanges.push(`Evolve ${cleanSpeciesName(best.mon.species!.speciesName)} → ${best.evolveTo} (moves can change on evolution — re-check afterwards)`);
    } else if (evoAct) {
      whatChanges.push(evoAct);
    }
    if (best.targetLv > best.mon.level + 0.1) {
      whatChanges.push(`Power up L${Math.round(best.mon.level * 10) / 10} → L${best.targetLv}`);
    }
    for (const act of best.tmActions) {
      if (act.toLowerCase().startsWith('evolve ')) continue;
      whatChanges.push(act);
    }
    if (whatChanges.length === 0) whatChanges.push('Already ready — no changes required');

    const sharedActions: string[] = [...(queueBest?.shared_roles || [])];
    const targetSidClean = (best.targetSid || best.mon.species?.speciesId || '').replace(/_shadow$/, '');
    const megaBase = best.mon.mega_sid ? megaBaseSid(best.mon.mega_sid) : '';
    if (
      best.mon.mega_sid &&
      !best.mon.is_shadow &&
      targetSidClean === megaBase &&
      !sharedActions.some((s) => s.includes('Mega'))
    ) {
      sharedActions.push(`Also serves ${spName(dex, best.mon.mega_sid)} Mega slot`);
    }

    const hasAction = best.evolveTo !== '' || best.targetLv > best.mon.level + 0.1 || best.tmActions.length > 0;
    const compareFloor = activeTeam.some((e) => e.id === best.mon.uid)
      ? best.currentDps
      : activeTeam.length < 6
      ? 0
      : weakestVal;
    const delta = Math.round((best.bestDps - compareFloor) * 100) / 100;
    const pct = compareFloor > 0 ? Math.round((1000 * delta) / compareFloor) / 10 : best.bestDps > 0 ? 100 : null;

    const messages: string[] = [];
    let recommendation: RoleAdvisorRecommendation = hasAction ? 'INVEST' : 'ALREADY_READY';

    const unknownBal = hasAction && checkUnknownBalances(best.bundle);
    const tinyUpgrade = hasAction && activeTeam.length >= 6 && pct !== null && pct < 4 && best.bundle.stardust >= 20000;
    const saveElite = best.needsElite && (ledger?.elite_charged_tm.state === 'known' && ledger.elite_charged_tm.value === 0);

    if (saveElite) {
      messages.push('Save your Elite TM — you hold 0 Elite Charged TMs (or regular TM covers nearly the same DPS).');
      recommendation = 'SAVE_ELITE_TM';
    }
    if (tinyUpgrade) {
      messages.push(`Tiny upgrade — only +${pct}% eDPS over ${weakestEntry?.name || 'current slot'} for ${best.bundle.stardust.toLocaleString()} Stardust.`);
      messages.push('Do not invest unless you want a spare.');
      recommendation = 'TINY_UPGRADE';
    }
    if (best.bundle.hard_blockers.length > 0) {
      messages.push(`Do not invest yet — ${best.bundle.hard_blockers[0]}.`);
      recommendation = 'DO_NOT_INVEST';
    }
    if (unknownBal) {
      messages.push('Resource balance unknown — verify unlisted costs in-game before spending.');
      if (recommendation === 'INVEST' && (best.alloc?.status === 'CHECK' || !best.alloc)) {
        recommendation = 'CHECK_UNKNOWN';
      }
    }

    const affordNow: RoleInvestmentAdvice['affordNow'] = !hasAction
      ? 'NO_ACTION'
      : queueBest?.affordability?.status || best.alloc?.status || 'CHECK';

    out.push({
      roleKey: `raid:${atype}`,
      category: 'raid',
      roleLabel: `${atype[0].toUpperCase() + atype.slice(1)} Raid Attacker`,
      bestSpecimen: {
        id: best.mon.uid,
        name: displaySpecies(best.mon),
        from: best.evolveTo ? cleanSpeciesName(best.mon.species!.speciesName) : undefined,
        cp: best.mon.cp,
        level: Math.round(best.mon.level * 10) / 10,
        iv: ivStr(best.mon),
        iv_pct: best.mon.iv_pct,
        verdict: best.mon.verdict,
        search: repBest?.search || ingameSearch(best.mon, displaySpecies(best.mon)),
      },
      currentPerformance: {
        value: best.currentDps,
        unit: 'eDPS',
        label: best.currentDps > 0 ? `${best.currentDps} eDPS (L${Math.round(best.mon.level * 10) / 10})` : 'Unevolved / off-type moves',
      },
      bestAchievablePerformance: {
        value: best.bestDps,
        unit: 'eDPS',
        label: `${best.bestDps} eDPS at L${best.targetLv}`,
      },
      weakestInRole: weakestEntry
        ? { id: weakestEntry.id, name: weakestEntry.name, value: weakestVal, unit: 'eDPS' }
        : { name: `Open team slot (${activeTeam.length}/6 filled)`, value: 0, unit: 'eDPS' },
      improvement: {
        delta,
        pct,
        summary: !hasAction
          ? 'Already optimal in your top lineup'
          : activeTeam.length < 6 && !activeTeam.some((e) => e.id === best.mon.uid)
          ? `Fills open slot (+${best.bestDps} eDPS)`
          : `${delta >= 0 ? '+' : ''}${delta} eDPS${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}`,
      },
      whatChanges,
      sharedActions,
      cost: costObjFromBundle(best.bundle),
      affordNow,
      affordabilityDetail: !hasAction
        ? 'No resources needed.'
        : best.alloc
        ? affordDetailFromAlloc(best.alloc)
        : 'Ledger unavailable.',
      alternativesConsidered: cands.slice(1, 4).map((alt) => ({
        id: alt.mon.uid,
        name: displaySpecies(alt.mon),
        cp: alt.mon.cp,
        level: Math.round(alt.mon.level * 10) / 10,
        iv: ivStr(alt.mon),
        perfLabel: `${alt.bestDps} max eDPS (now ${alt.currentDps})`,
        costSummary: shortCostSummary(alt.bundle),
        reason: alt.sameSpeciesBetterOwned
          ? `You own a better specimen (${displaySpecies(best.mon)} ${ivStr(best.mon)} reaches ${best.bestDps} eDPS)`
          : `${Math.round((best.bestDps - alt.bestDps) * 10) / 10} eDPS behind ${displaySpecies(best.mon)}`,
      })),
      recommendation,
      messages,
    });
  }

  // =========================================================================
  // 2. MEGA ROLES (all types with an owned Mega or candidate)
  // =========================================================================
  const megaGate = { minIvPct: cfg?.mega?.min_iv_pct, minAtkIv: cfg?.mega?.min_atk_iv };
  for (const atype of RAID_USEFUL_TYPES) {
    const rt = raidTeams.find((x) => x.type === atype);
    const curMega = rt?.mega;
    const megaCands: {
      mon: MonModel;
      megaSid: string;
      status: ReturnType<typeof assessMegaForm>;
      curDps: number;
      bestDps: number;
      bundle: CostBundle;
      alloc: AllocationResult | null;
    }[] = [];

    for (const m of mons) {
      if (!isHeld(m) || m.is_shadow) continue;
      for (const megaSid of Array.from(new Set([m.mega_sid, ...dex.familyMegaInfo(m.species!.speciesId)].filter((x): x is string => Boolean(x))))) {
        if (!dex.megaSpecies.has(megaSid)) continue;
        if (!dex.megaBoostTypes(megaSid).includes(atype)) continue;
        const st = assessMegaForm(m, megaSid, dex, megaGate);
        const dps40 = estimatedMegaDps(m, dex, atype, megaSid) ?? 0;
        if (dps40 <= 0) continue;
        const unlocked = st.status === 'UNLOCKED' || st.status === 'ACTIVE';
        const targetLv = Math.max(m.level, pveTargetLv);
        const curDps = unlocked ? Math.round(dps40 * (cpmAt(m.level) / cpmAt(40)) * 100) / 100 : 0;
        const bestDps = Math.round(dps40 * (cpmAt(targetLv) / cpmAt(40)) * 100) / 100;
        const evoSid = st.status === 'NEEDS_EVOLVE' ? megaBaseSid(megaSid) : null;
        const costs = buildRowCosts({ ...m, evolve_to_sid: evoSid, power_up_to: targetLv > m.level ? targetLv : null }, dex.byId);
        const rep = reportById.get(m.uid);
        const bundle = costBundleFor(
          {
            id: m.uid,
            species: displaySpecies(m),
            verdict: 'BUILD_MEGA',
            role: `${atype} mega`,
            cp: m.cp,
            iv: ivStr(m),
            level: m.level,
            power_up_to: targetLv > m.level ? targetLv : null,
            evolve_to: evoSid ? spName(dex, evoSid) : '',
            gap_fix: '',
            impact: 50,
            cost: { dust: costs.dust, candy: 0, xl: 0 },
            moves: [],
            tm_needed: [],
            needs_second_move: false,
            why: [],
            search: '',
          },
          m,
          { ...(rep || ({} as ReportMon)), cost_dust: costs.dust, cost_candy: 0, cost_xl: 0 },
          dex,
        );
        const alloc = ledger ? assessAlone(bundle, ledger, familyKeysFor(m, dex)) : null;
        megaCands.push({ mon: m, megaSid, status: st, curDps, bestDps, bundle, alloc });
      }
    }

    if (megaCands.length === 0) continue;
    megaCands.sort((a, b) => {
      const aUn = a.status.slotEligible ? 1 : 0;
      const bUn = b.status.slotEligible ? 1 : 0;
      return bUn - aUn || b.bestDps - a.bestDps || b.mon.iv_pct - a.mon.iv_pct;
    });

    const best = megaCands[0];
    const unlocked = best.status.slotEligible;
    const targetLv = Math.max(best.mon.level, pveTargetLv);
    const changes: string[] = [];
    if (best.status.status === 'NEEDS_EVOLVE') changes.push(`Evolve → ${spName(dex, megaBaseSid(best.megaSid))}`);
    if (!unlocked) changes.push(`First Mega Evolution into ${spName(dex, best.megaSid)}`);
    if (targetLv > best.mon.level + 0.1) changes.push(`Power up L${Math.round(best.mon.level * 10) / 10} → L${targetLv}`);
    if (changes.length === 0) changes.push('Mega already unlocked at target level');

    const floorDps = curMega ? curMega.dps : 0;
    const delta = Math.round((best.bestDps - (curMega?.id === best.mon.uid ? best.curDps : floorDps)) * 100) / 100;
    const pct = floorDps > 0 ? Math.round((1000 * delta) / floorDps) / 10 : 100;
    const unknownBal = changes[0] !== 'Mega already unlocked at target level' && checkUnknownBalances(best.bundle);
    const msgs: string[] = [];
    let rec: RoleAdvisorRecommendation = changes[0] === 'Mega already unlocked at target level' ? 'ALREADY_READY' : 'INVEST';
    if (unknownBal) {
      msgs.push('Resource balance unknown — Mega Energy is not in the export.');
      if (rec === 'INVEST') rec = 'CHECK_UNKNOWN';
    }
    if (curMega && curMega.id !== best.mon.uid && delta <= 0) {
      msgs.push(`You own a better specimen (${curMega.name} is already unlocked and active in this Mega slot).`);
      msgs.push('Do not invest in a second Mega for the same type unless building Mega Level 3 cooldown cycling.');
      rec = 'BETTER_OWNED';
    }

    const boostTypes = dex.megaBoostTypes(best.megaSid);
    out.push({
      roleKey: `mega:${atype}`,
      category: 'mega',
      roleLabel: `${atype[0].toUpperCase() + atype.slice(1)} Mega Evolution`,
      bestSpecimen: {
        id: best.mon.uid,
        name: spName(dex, best.megaSid),
        from: displaySpecies(best.mon),
        cp: best.mon.cp,
        level: Math.round(best.mon.level * 10) / 10,
        iv: ivStr(best.mon),
        iv_pct: best.mon.iv_pct,
        verdict: best.mon.verdict,
        search: ingameSearch(best.mon, displaySpecies(best.mon)),
      },
      currentPerformance: {
        value: best.curDps,
        unit: 'Mega eDPS',
        label: unlocked ? `${best.curDps} Mega eDPS (Lv${Math.max(1, best.mon.mega_level)})` : 'Not Mega Evolved yet',
      },
      bestAchievablePerformance: {
        value: best.bestDps,
        unit: 'Mega eDPS',
        label: `${best.bestDps} Mega eDPS at L${targetLv}`,
      },
      weakestInRole: curMega
        ? { id: curMega.id, name: curMega.name, value: curMega.dps, unit: 'Mega eDPS' }
        : { name: `No unlocked ${atype} Mega`, value: 0, unit: 'Mega eDPS' },
      improvement: {
        delta,
        pct,
        summary: !curMega
          ? `Unlocks ${atype} Mega slot (${best.bestDps} eDPS + team raid boost)`
          : `${delta >= 0 ? '+' : ''}${delta} eDPS (${pct >= 0 ? '+' : ''}${pct}%)`,
      },
      whatChanges: changes,
      sharedActions: boostTypes.map((bt) => `Boosts ${bt} raids & catch Candy`),
      cost: costObjFromBundle(best.bundle),
      affordNow: changes[0] === 'Mega already unlocked at target level' ? 'NO_ACTION' : best.alloc?.status || 'CHECK',
      affordabilityDetail: best.alloc ? affordDetailFromAlloc(best.alloc) : 'Mega Energy balance unknown.',
      alternativesConsidered: megaCands.slice(1, 4).map((alt) => ({
        id: alt.mon.uid,
        name: displaySpecies(alt.mon),
        cp: alt.mon.cp,
        level: Math.round(alt.mon.level * 10) / 10,
        iv: ivStr(alt.mon),
        perfLabel: `${alt.bestDps} Mega eDPS`,
        costSummary: shortCostSummary(alt.bundle),
        reason: best.status.slotEligible && !alt.status.slotEligible
          ? `You own a better specimen (${displaySpecies(best.mon)} already unlocked)`
          : `${Math.round((best.bestDps - alt.bestDps) * 10) / 10} eDPS behind ${displaySpecies(best.mon)}`,
      })),
      recommendation: rec,
      messages: msgs,
    });
  }

  // =========================================================================
  // 3. MAX BATTLE ROLES (types where user owns Dynamax/G-Max/Crowned)
  // =========================================================================
  for (const atype of MAX_BATTLE_TYPES) {
    const mt = maxTeams.find((x) => x.type === atype);
    const active = mt?.entries || [];
    const cands = mons
      .filter((m) => isHeld(m) && canJoinMaxBattle(m) && m.max_type === atype && m.max_dps > 0)
      .sort((a, b) => b.max_dps - a.max_dps || b.iv_pct - a.iv_pct);
    if (cands.length === 0) continue;

    const best = cands[0];
    const targetSp = (best.max_sid ? dex.byId.get(best.max_sid) : null) || best.species!;
    const curDps = specimenMaxDpsAtLevel(best, best.species!, dex, atype, best.level, best.max_attack_level || 1);
    const targetLv = Math.max(best.level, 40);
    const bestDps = specimenMaxDpsAtLevel(best, targetSp, dex, atype, targetLv, 3);
    const evolveTo = best.max_sid && best.species && best.max_sid !== best.species.speciesId ? spName(dex, best.max_sid) : '';
    const changes: string[] = [];
    if (evolveTo) changes.push(`Evolve ${cleanSpeciesName(best.species!.speciesName)} → ${evolveTo}`);
    if ((best.max_attack_level || 1) < 3) changes.push(`Upgrade Max Attack Lv${best.max_attack_level || 1} → Lv3 (+${maxMoveGainPct(best)}%)`);
    if (targetLv > best.level + 0.1) changes.push(`Power up L${Math.round(best.level * 10) / 10} → L${targetLv}`);
    if (changes.length === 0) changes.push('Max Battle attacker ready');

    const costs = buildRowCosts({ ...best, evolve_to_sid: evolveTo ? best.max_sid : null, power_up_to: targetLv > best.level ? targetLv : null }, dex.byId);
    const rep = reportById.get(best.uid);
    const bundle = costBundleFor(
      {
        id: best.uid,
        species: displaySpecies(best),
        verdict: 'BUILD_MAX',
        role: `${atype} max`,
        cp: best.cp,
        iv: ivStr(best),
        level: best.level,
        power_up_to: targetLv > best.level ? targetLv : null,
        evolve_to: evolveTo,
        gap_fix: '',
        impact: 50,
        cost: { dust: costs.dust, candy: 0, xl: 0 },
        moves: [],
        tm_needed: [],
        needs_second_move: false,
        why: [],
        search: '',
      },
      best,
      { ...(rep || ({} as ReportMon)), cost_dust: costs.dust, cost_candy: 0, cost_xl: 0 },
      dex,
    );
    const alloc = ledger ? assessAlone(bundle, ledger, familyKeysFor(best, dex)) : null;
    const weakest = active[active.length - 1];
    const delta = Math.round((bestDps - curDps) * 100) / 100;
    const pct = curDps > 0 ? Math.round((1000 * delta) / curDps) / 10 : null;
    const unknownBal = changes[0] !== 'Max Battle attacker ready' && checkUnknownBalances(bundle);

    out.push({
      roleKey: `max:${atype}`,
      category: 'max',
      roleLabel: `${atype[0].toUpperCase() + atype.slice(1)} Max Battle`,
      bestSpecimen: {
        id: best.uid,
        name: displaySpecies(best),
        from: evolveTo ? cleanSpeciesName(best.species!.speciesName) : undefined,
        cp: best.cp,
        level: Math.round(best.level * 10) / 10,
        iv: ivStr(best),
        iv_pct: best.iv_pct,
        verdict: best.verdict,
        search: ingameSearch(best, displaySpecies(best)),
      },
      currentPerformance: {
        value: curDps,
        unit: 'Max DPS',
        label: `${curDps} Max DPS (Move Lv${best.max_attack_level || 1})`,
      },
      bestAchievablePerformance: {
        value: bestDps,
        unit: 'Max DPS',
        label: `${bestDps} Max DPS (Move Lv3, L${targetLv})`,
      },
      weakestInRole: weakest
        ? { id: weakest.id, name: weakest.name, value: weakest.dps, unit: 'Max DPS' }
        : { name: 'Open Max team slot', value: 0, unit: 'Max DPS' },
      improvement: {
        delta,
        pct,
        summary: delta > 0 ? `+${delta} Max DPS (${pct ?? 0}% gain)` : 'Already maxed',
      },
      whatChanges: changes,
      sharedActions: best.raid_type ? [`Also usable in ${best.raid_type} raids`] : [],
      cost: costObjFromBundle(bundle),
      affordNow: changes[0] === 'Max Battle attacker ready' ? 'NO_ACTION' : alloc?.status || 'CHECK',
      affordabilityDetail: alloc ? affordDetailFromAlloc(alloc) : 'Max Move upgrade price unavailable.',
      alternativesConsidered: cands.slice(1, 4).map((alt) => ({
        id: alt.uid,
        name: displaySpecies(alt),
        cp: alt.cp,
        level: Math.round(alt.level * 10) / 10,
        iv: ivStr(alt),
        perfLabel: `${Math.round(alt.max_dps * 10) / 10} Max DPS`,
        costSummary: 'Power up / Max Particle upgrades',
        reason: `${Math.round((best.max_dps - alt.max_dps) * 10) / 10} Max DPS behind ${displaySpecies(best)}`,
      })),
      recommendation: unknownBal ? 'CHECK_UNKNOWN' : changes[0] === 'Max Battle attacker ready' ? 'ALREADY_READY' : 'INVEST',
      messages: unknownBal ? ['Resource balance unknown — verify Max Particle requirements in-game.'] : [],
    });
  }

  // =========================================================================
  // 4. PVP LEAGUE ROLES (Great / Ultra / Master)
  // =========================================================================
  for (const cap of caps) {
    const leagueLabel = LEAGUE_NAMES[cap] ? `${LEAGUE_NAMES[cap]} League` : `Cap ${cap}`;
    const leagueTeams = teams.find((t) => t.cap === cap);
    const cands = mons
      .map((m) => {
        if (!isHeld(m)) return null;
        const entry = m.pvp.find((p) => p.cap === cap && p.eligible && p.species_rank <= 200);
        if (!entry) return null;
        return { m, entry };
      })
      .filter((x): x is { m: MonModel; entry: NonNullable<MonModel['pvp']>[0] } => Boolean(x))
      .sort((a, b) => a.entry.composite - b.entry.composite || a.entry.iv_rank - b.entry.iv_rank);

    if (cands.length === 0) continue;

    // Pick top build that needs investment if one exists, otherwise top overall candidate
    const buildCand = cands.find((c) => c.m.verdict === 'BUILD_PVP' && c.m.best_pvp?.cap === cap) || cands[0];
    const best = buildCand.m;
    const e = buildCand.entry;
    const rep = reportById.get(best.uid);
    const queueBest = queueById.get(best.uid);

    const metaMap = dex.pvpMeta.get(cap);
    const targetMvList = (metaMap?.get(e.sid)?.moveset || []).slice(0, 3).map(moveLabel);
    const evoSid = e.sid.replace(/_shadow$/, '') !== best.species!.speciesId ? e.sid.replace(/_shadow$/, '') : null;
    const evoTo = evoSid ? spName(dex, evoSid) : '';
    const tempMon: MonModel = {
      ...best,
      evolve_to_sid: evoSid,
      evolve_to: evoTo,
      power_up_to: e.target_level > best.level ? e.target_level : null,
      moveset: targetMvList.join(' / '),
    };
    const { fields } = readinessFields(dex.pve, tempMon, dex, 'BUILD_PVP', cfg);
    const costs = buildRowCosts(tempMon, dex.byId);
    const bundle = costBundleFor(
      {
        id: best.uid,
        species: displaySpecies(best),
        verdict: 'BUILD_PVP',
        role: `${leagueLabel} #${e.species_rank}`,
        cp: best.cp,
        iv: ivStr(best),
        level: best.level,
        power_up_to: tempMon.power_up_to,
        evolve_to: evoTo,
        gap_fix: '',
        impact: 50,
        cost: { dust: costs.dust, candy: 0, xl: 0 },
        moves: [],
        tm_needed: fields.needs_moves || [],
        tm_typed: fields.needs_typed,
        needs_second_move: Boolean(fields.needs_second_move),
        why: [],
        search: '',
      },
      tempMon,
      {
        ...(rep || ({} as ReportMon)),
        cost_dust: costs.dust,
        cost_candy: 0,
        cost_xl: 0,
        needs_typed: fields.needs_typed,
        needs_second_move: fields.needs_second_move,
        build_status: fields.build_status,
      },
      dex,
    );
    const alloc = ledger ? assessAlone(bundle, ledger, familyKeysFor(best, dex)) : null;

    const changes: string[] = [];
    if (evoTo) changes.push(`Evolve ${cleanSpeciesName(best.species!.speciesName)} → ${evoTo}`);
    if (e.target_level > best.level + 0.1) changes.push(`Power up CP ${best.cp} → CP ${e.target_cp} (L${e.target_level})`);
    if (fields.needs_second_move) changes.push('Unlock 2nd Charged Move');
    for (const tm of fields.needs_typed || []) {
      changes.push(`${tm.elite ? 'Elite ' : ''}${tm.slot === 'fast' ? 'Fast' : 'Charged'} TM → ${tm.name}`);
    }
    if (changes.length === 0) changes.push('League-ready now');

    const curWin = best.pvp_battle && best.pvp_battle.cap === cap ? best.pvp_battle.win_rate_1v1 : null;
    const readyPct = changes[0] === 'League-ready now' ? 100 : Math.round((best.cp / Math.max(1, e.target_cp)) * 100);
    const msgs: string[] = [];
    let rec: RoleAdvisorRecommendation = changes[0] === 'League-ready now' ? 'ALREADY_READY' : 'INVEST';
    const saveElite =
      (bundle.elite_charged_tm > 0 && ledger?.elite_charged_tm.state === 'known' && ledger.elite_charged_tm.value === 0) ||
      Boolean(rep?.wait_cd_move);
    if (saveElite) {
      msgs.push(rep?.wait_cd_move ? `Save your Elite TM — wait for CD evolution (${rep.wait_cd_move}).` : 'Save your Elite TM — 0 Elite Charged TMs held.');
      rec = 'SAVE_ELITE_TM';
    }
    if (changes[0] !== 'League-ready now' && checkUnknownBalances(bundle)) {
      msgs.push('Resource balance unknown — verify second-move price in-game.');
      if (rec === 'INVEST') rec = 'CHECK_UNKNOWN';
    }

    const weakestMem = leagueTeams?.teams[0]?.members[leagueTeams.teams[0].members.length - 1];
    out.push({
      roleKey: `pvp:${cap}`,
      category: 'pvp',
      roleLabel: `${leagueLabel} (${cap >= 10000 ? 'No Cap' : `${cap} CP`})`,
      bestSpecimen: {
        id: best.uid,
        name: displaySpecies(best),
        from: evoTo ? cleanSpeciesName(best.species!.speciesName) : undefined,
        cp: best.cp,
        level: Math.round(best.level * 10) / 10,
        iv: ivStr(best),
        iv_pct: best.iv_pct,
        verdict: best.verdict,
        search: rep?.search || ingameSearch(best, displaySpecies(best)),
      },
      currentPerformance: {
        value: readyPct,
        unit: curWin !== null ? '% win' : '% CP',
        label: curWin !== null ? `${curWin}% matrix win rate (CP ${best.cp})` : `CP ${best.cp} · Rank #${e.species_rank} (IV #${e.iv_rank})`,
      },
      bestAchievablePerformance: {
        value: 100,
        unit: 'target',
        label: `CP ${e.target_cp} at L${e.target_level} · ${e.name} (#${e.species_rank})`,
      },
      weakestInRole: weakestMem
        ? { id: weakestMem.id, name: `${weakestMem.name} (#${weakestMem.sp_rank ?? '?'})`, value: weakestMem.sp_rank ?? 0, unit: 'rank' }
        : { name: 'Top league team', value: 0, unit: 'rank' },
      improvement: {
        delta: Math.max(0, e.target_cp - best.cp),
        pct: curWin !== null ? curWin : readyPct,
        summary: changes[0] === 'League-ready now' ? `Ready for ${leagueLabel}` : `+${Math.max(0, e.target_cp - best.cp)} CP to target (${changes.length} step${changes.length > 1 ? 's' : ''})`,
      },
      whatChanges: changes,
      sharedActions: queueBest?.shared_roles || [],
      cost: costObjFromBundle(bundle),
      affordNow: changes[0] === 'League-ready now' ? 'NO_ACTION' : queueBest?.affordability?.status || alloc?.status || 'CHECK',
      affordabilityDetail: changes[0] === 'League-ready now' ? 'No resources needed.' : alloc ? affordDetailFromAlloc(alloc) : 'Check in-game.',
      alternativesConsidered: cands.slice(1, 4).map((alt) => ({
        id: alt.m.uid,
        name: displaySpecies(alt.m),
        cp: alt.m.cp,
        level: Math.round(alt.m.level * 10) / 10,
        iv: ivStr(alt.m),
        perfLabel: `${alt.entry.name} (#${alt.entry.species_rank}, IV #${alt.entry.iv_rank})`,
        costSummary: `${alt.m.cp} → ${alt.entry.target_cp} CP`,
        reason: alt.entry.sid === e.sid
          ? `You own a better specimen (${displaySpecies(best)} has IV #${e.iv_rank} vs #${alt.entry.iv_rank})`
          : `Composite #${alt.entry.composite} behind #${e.composite}`,
      })),
      recommendation: rec,
      messages: msgs,
    });
  }

  return out;
}
