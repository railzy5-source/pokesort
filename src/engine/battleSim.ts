import {
  BULK_GOAL,
  cleanSpeciesName,
  LEAGUE_NAMES,
  SHADOW_ATK_MULT,
  SHADOW_DEF_DIV,
  STAB,
} from './defaultConfig';
import { bestPvpLevel, computeCp, CPM } from './cpmTable';
import {
  Dex,
  estimatedRaidDps,
  moveLabel,
  typeEff,
} from './pveModel';
import { ivStr } from './pgsParser';
import type {
  BreakpointHit,
  MonModel,
  PvpBattleSummary,
  PvPokeMove,
  PvPokeSpecies,
  SavedPartyAudit,
} from './types';

export interface SimMoveSpec {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number; // positive gain for fast, positive cost for charged
  turns: number;
  buffs?: number[];
  buffTarget?: string;
  buffApplyChance?: number;
}

export interface Combatant {
  uid: string;
  sid: string;
  name: string;
  types: string[];
  atk: number;
  def: number;
  maxHp: number;
  fast: SimMoveSpec;
  charged1: SimMoveSpec;
  charged2?: SimMoveSpec;
  usedCurrentMoves: boolean;
}

const DEFAULT_FAST: SimMoveSpec = {
  moveId: 'QUICK_ATTACK',
  name: 'Quick Attack',
  type: 'normal',
  power: 5,
  energy: 7,
  turns: 2,
};

const DEFAULT_CHARGED: SimMoveSpec = {
  moveId: 'BODY_SLAM',
  name: 'Body Slam',
  type: 'normal',
  power: 50,
  energy: 35,
  turns: 1,
};

function toFastSpec(m: PvPokeMove | undefined): SimMoveSpec | null {
  if (!m || !m.moveId) return null;
  const eng = Number(m.energyGain ?? 0);
  if (eng <= 0) return null;
  return {
    moveId: m.moveId,
    name: m.name || moveLabel(m.moveId),
    type: (m.type || 'normal').toLowerCase(),
    power: Number(m.power ?? 3),
    energy: eng,
    turns: Math.max(1, Number(m.turns ?? 2)),
  };
}

function toChargedSpec(m: PvPokeMove | undefined): SimMoveSpec | null {
  if (!m || !m.moveId) return null;
  const eng = Math.abs(Number(m.energy ?? 50)) || 50;
  return {
    moveId: m.moveId,
    name: m.name || moveLabel(m.moveId),
    type: (m.type || 'normal').toLowerCase(),
    power: Number(m.power ?? 50),
    energy: eng,
    turns: 1,
    buffs: m.buffs,
    buffTarget: m.buffTarget,
    buffApplyChance: Number(m.buffApplyChance ?? 0),
  };
}

export function effectiveStats(
  sp: PvPokeSpecies,
  a: number,
  d: number,
  s: number,
  level: number,
  isShadow = false,
): { atk: number; def: number; hp: number } {
  const cpm = CPM[level] ?? CPM[Math.round(level * 2) / 2] ?? 0.7903;
  const baseAtk = (sp.baseStats.atk + a) * cpm;
  const baseDef = (sp.baseStats.def + d) * cpm;
  const atk = isShadow ? baseAtk * SHADOW_ATK_MULT : baseAtk;
  const def = isShadow ? baseDef / SHADOW_DEF_DIV : baseDef;
  const hp = Math.max(10, Math.floor((sp.baseStats.hp + s) * cpm));
  return { atk, def, hp };
}

function resolveMovesetForSpecies(
  sp: PvPokeSpecies,
  dex: Dex,
  capOrCup: number | string,
  mon?: MonModel | null,
  overrideIds?: { fastMoveId?: string; charged1Id?: string; charged2Id?: string },
): { fast: SimMoveSpec; charged1: SimMoveSpec; charged2?: SimMoveSpec; usedCurrent: boolean } {
  let fast: SimMoveSpec | null = null;
  let charged1: SimMoveSpec | null = null;
  let charged2: SimMoveSpec | null = null;
  let usedCurrent = false;

  if (overrideIds?.fastMoveId) {
    fast = toFastSpec(dex.moves.get(overrideIds.fastMoveId));
    usedCurrent = true;
  }
  if (overrideIds?.charged1Id) {
    charged1 = toChargedSpec(dex.moves.get(overrideIds.charged1Id));
  }
  if (overrideIds?.charged2Id) {
    charged2 = toChargedSpec(dex.moves.get(overrideIds.charged2Id));
  }

  // Try specimen's actual current moves when species matches (not un-evolved pre-evo)
  const sameForm =
    mon &&
    mon.species &&
    (sp.speciesId === mon.species.speciesId ||
      sp.speciesId === `${mon.species.speciesId}_shadow`);

  if (mon && sameForm && dex.pve.ok && !overrideIds) {
    const rawFastKey = mon.raw.move1 ? dex.pve.byId.get(Number(mon.raw.move1)) : undefined;
    const rawC1Key = mon.raw.move2 ? dex.pve.byId.get(Number(mon.raw.move2)) : undefined;
    const rawC2Key = mon.raw.move3 ? dex.pve.byId.get(Number(mon.raw.move3)) : undefined;

    if (!fast && rawFastKey) {
      const fBase = rawFastKey.endsWith('_FAST') ? rawFastKey.slice(0, -5) : rawFastKey;
      fast = toFastSpec(dex.moves.get(fBase));
    }
    if (!charged1 && rawC1Key) {
      charged1 = toChargedSpec(dex.moves.get(rawC1Key));
    }
    if (!charged2 && rawC2Key) {
      charged2 = toChargedSpec(dex.moves.get(rawC2Key));
    }
    if (fast || charged1) usedCurrent = true;
  }

  // Fallback to PvPoke recommended moveset for league/cup
  const metaMap = typeof capOrCup === 'number' ? dex.pvpMeta.get(capOrCup) : dex.cupMeta.get(capOrCup);
  const rec =
    metaMap?.get(sp.speciesId)?.moveset ||
    metaMap?.get(`${sp.speciesId}_shadow`)?.moveset ||
    [];

  if (!fast && rec[0]) {
    fast = toFastSpec(dex.moves.get(rec[0]));
  }
  if (!charged1 && rec[1]) {
    charged1 = toChargedSpec(dex.moves.get(rec[1]));
  }
  if (!charged2 && rec[2]) {
    charged2 = toChargedSpec(dex.moves.get(rec[2]));
  }

  // Final species movepool fallback
  if (!fast) {
    for (const mid of sp.fastMoves || []) {
      const cand = toFastSpec(dex.moves.get(mid));
      if (cand) {
        if (!fast || cand.energy / cand.turns > fast.energy / fast.turns) fast = cand;
      }
    }
  }
  if (!charged1) {
    for (const mid of sp.chargedMoves || []) {
      if (mid === 'FRUSTRATION') continue;
      const cand = toChargedSpec(dex.moves.get(mid));
      if (cand) {
        if (!charged1 || cand.power / cand.energy > charged1.power / charged1.energy) {
          charged1 = cand;
        }
      }
    }
  }

  return {
    fast: fast || DEFAULT_FAST,
    charged1: charged1 || DEFAULT_CHARGED,
    charged2: charged2 || undefined,
    usedCurrent,
  };
}

export function buildCombatant(
  sp: PvPokeSpecies,
  a: number,
  d: number,
  s: number,
  level: number,
  isShadow: boolean,
  dex: Dex,
  capOrCup: number | string,
  mon?: MonModel | null,
  overrideIds?: { fastMoveId?: string; charged1Id?: string; charged2Id?: string },
): Combatant {
  const st = effectiveStats(sp, a, d, s, level, isShadow);
  const mv = resolveMovesetForSpecies(sp, dex, capOrCup, mon, overrideIds);
  return {
    uid: mon?.uid || sp.speciesId,
    sid: isShadow && !sp.speciesId.endsWith('_shadow') ? `${sp.speciesId}_shadow` : sp.speciesId,
    name: cleanSpeciesName(sp.speciesName),
    types: (sp.types || ['normal']).map((t) => t.toLowerCase()),
    atk: st.atk,
    def: st.def,
    maxHp: st.hp,
    fast: mv.fast,
    charged1: mv.charged1,
    charged2: mv.charged2,
    usedCurrentMoves: mv.usedCurrent,
  };
}

function stageMult(stage: number): number {
  const cl = Math.max(-4, Math.min(4, stage));
  return cl >= 0 ? (4 + cl) / 4 : 4 / (4 - cl);
}

function calcMoveDmg(
  move: SimMoveSpec,
  att: Combatant,
  def: Combatant,
  attStageAtk: number,
  defStageDef: number,
): number {
  const effAtk = att.atk * stageMult(attStageAtk);
  const effDef = def.def * stageMult(defStageDef);
  const stab = att.types.includes(move.type) ? STAB : 1.0;
  const eff = typeEff(move.type, def.types);
  return Math.floor(0.5 * move.power * (effAtk / Math.max(1, effDef)) * stab * eff * 1.3) + 1;
}

function pickChargedMove(
  att: Combatant,
  def: Combatant,
  energy: number,
  stageAtk: number,
  stageDef: number,
  shieldsLeftDef: number,
): SimMoveSpec | null {
  const cands = [att.charged1, att.charged2].filter((c): c is SimMoveSpec => Boolean(c && energy >= c.energy));
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];

  // Pick move maximizing DPE; if shields remain, slightly favor cheapest ready move to bait or fast nuke
  let best = cands[0];
  let bestVal = -1;
  for (const c of cands) {
    const dmg = calcMoveDmg(c, att, def, stageAtk, stageDef);
    const dpe = dmg / Math.max(1, c.energy);
    const val = shieldsLeftDef > 0 ? dpe * 0.65 + (100 - c.energy) * 0.015 : dmg >= def.maxHp * 0.4 ? dmg : dpe * 100;
    if (val > bestVal) {
      bestVal = val;
      best = c;
    }
  }
  return best;
}

function applyMoveBuffs(
  mv: SimMoveSpec,
  selfAtk: number,
  selfDef: number,
  oppAtk: number,
  oppDef: number,
): [number, number, number, number] {
  if (!mv.buffs || mv.buffs.length < 2) return [selfAtk, selfDef, oppAtk, oppDef];
  const chance = Number(mv.buffApplyChance ?? 1);
  if (chance < 0.49) return [selfAtk, selfDef, oppAtk, oppDef]; // deterministic: skip low-chance procs in matrix
  const b0 = Number(mv.buffs[0] || 0);
  const b1 = Number(mv.buffs[1] || 0);
  if (mv.buffTarget === 'opponent') {
    return [selfAtk, selfDef, Math.max(-4, Math.min(4, oppAtk + b0)), Math.max(-4, Math.min(4, oppDef + b1))];
  }
  if (mv.buffTarget === 'both') {
    return [
      Math.max(-4, Math.min(4, selfAtk + b0)),
      Math.max(-4, Math.min(4, selfDef + b1)),
      Math.max(-4, Math.min(4, oppAtk + b0)),
      Math.max(-4, Math.min(4, oppDef + b1)),
    ];
  }
  return [Math.max(-4, Math.min(4, selfAtk + b0)), Math.max(-4, Math.min(4, selfDef + b1)), oppAtk, oppDef];
}

export interface MatchupResult {
  winner: 'A' | 'B' | 'tie';
  ratingA: number;
  hpLeftPctA: number;
  hpLeftPctB: number;
  turns: number;
}

export function simulateMatchup(
  a: Combatant,
  b: Combatant,
  opts: { shieldsA?: number; shieldsB?: number; startEnergyA?: number; startEnergyB?: number } = {},
): MatchupResult {
  let hpA = a.maxHp;
  let hpB = b.maxHp;
  let engA = opts.startEnergyA ?? 0;
  let engB = opts.startEnergyB ?? 0;
  let shA = opts.shieldsA ?? 1;
  let shB = opts.shieldsB ?? 1;

  let stAtkA = 0;
  let stDefA = 0;
  let stAtkB = 0;
  let stDefB = 0;

  let cdA = 0;
  let cdB = 0;
  let turn = 0;
  const MAX_TURNS = 240; // 120 seconds (GBL switch/battle limit safety)

  while (hpA > 0 && hpB > 0 && turn < MAX_TURNS) {
    turn++;
    const canActA = cdA <= 0;
    const canActB = cdB <= 0;

    const throwA = canActA ? pickChargedMove(a, b, engA, stAtkA, stDefB, shB) : null;
    const throwB = canActB ? pickChargedMove(b, a, engB, stAtkB, stDefA, shA) : null;

    if (throwA || throwB) {
      const aFirst =
        throwA && !throwB
          ? true
          : !throwA && throwB
          ? false
          : a.atk * stageMult(stAtkA) >= b.atk * stageMult(stAtkB);

      const fireCharged = (
        attacker: Combatant,
        defender: Combatant,
        mv: SimMoveSpec,
        isA: boolean,
      ) => {
        if (isA) engA = Math.max(0, engA - mv.energy);
        else engB = Math.max(0, engB - mv.energy);

        const defShields = isA ? shB : shA;
        let dmg = calcMoveDmg(
          mv,
          attacker,
          defender,
          isA ? stAtkA : stAtkB,
          isA ? stDefB : stDefA,
        );
        if (defShields > 0 && (dmg >= 14 || dmg >= defender.maxHp * 0.16)) {
          if (isA) shB--;
          else shA--;
          dmg = 1;
        }
        if (isA) hpB = Math.max(0, hpB - dmg);
        else hpA = Math.max(0, hpA - dmg);

        if (isA) {
          [stAtkA, stDefA, stAtkB, stDefB] = applyMoveBuffs(mv, stAtkA, stDefA, stAtkB, stDefB);
        } else {
          [stAtkB, stDefB, stAtkA, stDefA] = applyMoveBuffs(mv, stAtkB, stDefB, stAtkA, stDefA);
        }
      };

      if (aFirst && throwA) {
        fireCharged(a, b, throwA, true);
        cdA = 0;
        if (hpB <= 0) break;
        if (throwB) {
          fireCharged(b, a, throwB, false);
          cdB = 0;
        }
      } else if (!aFirst && throwB) {
        fireCharged(b, a, throwB, false);
        cdB = 0;
        if (hpA <= 0) break;
        if (throwA) {
          fireCharged(a, b, throwA, true);
          cdA = 0;
        }
      }
      if (hpA <= 0 || hpB <= 0) break;
      continue;
    }

    if (canActA) cdA = a.fast.turns;
    if (canActB) cdB = b.fast.turns;

    cdA--;
    cdB--;

    if (cdA === 0) {
      const dmg = calcMoveDmg(a.fast, a, b, stAtkA, stDefB);
      hpB = Math.max(0, hpB - dmg);
      engA = Math.min(100, engA + a.fast.energy);
    }
    if (cdB === 0) {
      const dmg = calcMoveDmg(b.fast, b, a, stAtkB, stDefA);
      hpA = Math.max(0, hpA - dmg);
      engB = Math.min(100, engB + b.fast.energy);
    }
  }

  const pctA = Math.max(0, hpA / a.maxHp);
  const pctB = Math.max(0, hpB / b.maxHp);
  const ratingA = Math.max(5, Math.min(995, Math.round(500 * (pctA + (1 - pctB)))));
  const winner = hpA > 0 && hpB <= 0 ? 'A' : hpB > 0 && hpA <= 0 ? 'B' : pctA > pctB ? 'A' : pctB > pctA ? 'B' : 'tie';
  return { winner, ratingA, hpLeftPctA: pctA, hpLeftPctB: pctB, turns: turn };
}

// Per-Dex meta pool cache so we only build opponent combatants once per league
const metaCache = new WeakMap<Dex, Map<number | string, Combatant[]>>();

export function getMetaPool(dex: Dex, capOrCup: number | string, limit = 25): Combatant[] {
  let byLeague = metaCache.get(dex);
  if (!byLeague) {
    byLeague = new Map();
    metaCache.set(dex, byLeague);
  }
  const cacheKey = `${capOrCup}|${limit}`;
  const cached = byLeague.get(cacheKey);
  if (cached) return cached;

  const list: Combatant[] = [];
  const seen = new Set<string>();
  const rawThreats = (dex.threats.get(capOrCup) || []).map(([sid]) => sid);
  const numCap = typeof capOrCup === 'number' ? capOrCup : 1500;
  const fallbackRows =
    typeof capOrCup === 'number'
      ? (dex.pvpRows.get(capOrCup) || []).map(([sid]) => sid)
      : Array.from(dex.cupPos.get(capOrCup)?.keys() || []);

  const candidates = rawThreats.length >= limit ? rawThreats : [...rawThreats, ...fallbackRows];

  for (const sid of candidates) {
    if (list.length >= limit) break;
    if (seen.has(sid)) continue;
    seen.add(sid);
    const isSh = sid.endsWith('_shadow');
    const baseSid = sid.replace(/_shadow$/, '');
    const sp = dex.byId.get(baseSid) || dex.byId.get(sid);
    if (!sp) continue;

    // Standard PvPoke meta IVs: balanced competitive 5/13/13 for GL/UL/Little or 15/15/15 L50 for ML
    const capVal = typeof capOrCup === 'number' ? capOrCup : numCap;
    let ma = 5;
    let md = 13;
    let ms = 13;
    let mlvl = 50;
    if (capVal >= 10000) {
      ma = 15;
      md = 15;
      ms = 15;
      mlvl = 50;
    } else {
      const b = bestPvpLevel(sp.baseStats, capVal, ma, md, ms);
      mlvl = b ? b[0] : 40;
    }

    list.push(buildCombatant(sp, ma, md, ms, mlvl, isSh, dex, capOrCup));
  }

  byLeague.set(cacheKey, list);
  return list;
}

function rankOneIvs(sp: PvPokeSpecies, cap: number, dex: Dex): { a: number; d: number; s: number; lvl: number } {
  if (cap >= 10000) return { a: 15, d: 15, s: 15, lvl: 50 };
  const key = `${sp.speciesId}|${cap}`;
  // Trigger spread table cache if missing
  dex.ivRank(sp.speciesId, cap, 0, 15, 15);
  const tbl = dex.spreadCache.get(key);
  let bestKey = '0,15,15';
  let bestVal = -1;
  if (tbl) {
    for (const [k, v] of tbl.prods.entries()) {
      if (v > bestVal) {
        bestVal = v;
        bestKey = k;
      }
    }
  }
  const [ra, rd, rs] = bestKey.split(',').map(Number);
  const lvl = bestPvpLevel(sp.baseStats, cap, ra, rd, rs)?.[0] ?? 40;
  return { a: ra, d: rd, s: rs, lvl };
}

export function analyzeBreakpointsAndCmp(
  combatant: Combatant,
  sp: PvPokeSpecies,
  capOrCup: number | string,
  cap: number,
  dex: Dex,
  metaPool: Combatant[],
): { breakpoints: BreakpointHit[]; cmp_wins: number; cmp_total: number } {
  const r1Iv = rankOneIvs(sp, cap, dex);
  const r1 = buildCombatant(
    sp,
    r1Iv.a,
    r1Iv.d,
    r1Iv.s,
    r1Iv.lvl,
    combatant.sid.endsWith('_shadow'),
    dex,
    capOrCup,
    null,
    {
      fastMoveId: combatant.fast.moveId,
      charged1Id: combatant.charged1.moveId,
      charged2Id: combatant.charged2?.moveId,
    },
  );

  const breakpoints: BreakpointHit[] = [];
  let cmpWins = 0;

  for (const opp of metaPool) {
    if (combatant.atk > opp.atk) cmpWins++;

    // CMP Flip vs Rank 1
    const r1Cmp = r1.atk > opp.atk;
    const youCmp = combatant.atk > opp.atk;
    if (youCmp !== r1Cmp && breakpoints.length < 14) {
      breakpoints.push({
        opponent: opp.name,
        type: 'cmp_flip',
        move: 'Charged Priority',
        yours: Math.round(combatant.atk * 10) / 10,
        rank1: Math.round(r1.atk * 10) / 10,
        delta_pct: Math.round(((combatant.atk - r1.atk) / Math.max(1, r1.atk)) * 1000) / 10,
        note: youCmp ? `Wins CMP tie vs ${opp.name}` : `Loses CMP tie vs Rank 1`,
      });
    }

    // Attack Breakpoint on fast move
    const dYou = calcMoveDmg(combatant.fast, combatant, opp, 0, 0);
    const dR1 = calcMoveDmg(r1.fast, r1, opp, 0, 0);
    if (dYou !== dR1 && breakpoints.length < 14) {
      const diffPct = Math.round(((dYou - dR1) / Math.max(1, dR1)) * 1000) / 10;
      breakpoints.push({
        opponent: opp.name,
        type: 'atk_breakpoint',
        move: combatant.fast.name,
        yours: dYou,
        rank1: dR1,
        delta_pct: diffPct,
        note:
          dYou > dR1
            ? `+${dYou - dR1} fast dmg/hit vs Rank 1 (+${diffPct}%)`
            : `${dYou - dR1} fast dmg/hit vs Rank 1 (${diffPct}%)`,
      });
    }

    // Defense Bulkpoint against opponent's fast move
    const inYou = calcMoveDmg(opp.fast, opp, combatant, 0, 0);
    const inR1 = calcMoveDmg(opp.fast, opp, r1, 0, 0);
    if (inYou !== inR1 && breakpoints.length < 14) {
      const diffPct = Math.round(((inR1 - inYou) / Math.max(1, inR1)) * 1000) / 10;
      breakpoints.push({
        opponent: opp.name,
        type: 'def_bulkpoint',
        move: opp.fast.name,
        yours: inYou,
        rank1: inR1,
        delta_pct: diffPct,
        note:
          inYou < inR1
            ? `Takes ${inR1 - inYou} less dmg/hit from ${opp.fast.name}`
            : `Takes ${inYou - inR1} more dmg/hit than Rank 1`,
      });
    }
  }

  // Sort beneficial gains first
  breakpoints.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct));
  return {
    breakpoints: breakpoints.slice(0, 8),
    cmp_wins: cmpWins,
    cmp_total: metaPool.length,
  };
}

export function evaluatePvpBattleMatrix(
  sp: PvPokeSpecies,
  a: number,
  d: number,
  s: number,
  level: number,
  isShadow: boolean,
  capOrCup: number | string,
  cap: number,
  leagueName: string,
  dex: Dex,
  mon?: MonModel | null,
  overrideIds?: { fastMoveId?: string; charged1Id?: string; charged2Id?: string },
): PvpBattleSummary {
  const combatant = buildCombatant(sp, a, d, s, level, isShadow, dex, capOrCup, mon, overrideIds);
  const metaPool = getMetaPool(dex, capOrCup, 25);

  if (metaPool.length === 0) {
    return {
      cap,
      league: leagueName,
      win_rate_0v0: 50,
      win_rate_1v1: 50,
      win_rate_2v2: 50,
      avg_rating_1v1: 500,
      key_wins: [],
      key_losses: [],
      moves_used: [combatant.fast.name, combatant.charged1.name, combatant.charged2?.name || ''].filter(Boolean),
      used_current_moves: combatant.usedCurrentMoves,
      breakpoints: [],
      cmp_wins: 0,
      cmp_total: 0,
    };
  }

  let wins0 = 0;
  let wins1 = 0;
  let wins2 = 0;
  let ratingSum1 = 0;
  const oppRatings: { name: string; rating: number }[] = [];

  for (const opp of metaPool) {
    const r0 = simulateMatchup(combatant, opp, { shieldsA: 0, shieldsB: 0 });
    const r1 = simulateMatchup(combatant, opp, { shieldsA: 1, shieldsB: 1 });
    const r2 = simulateMatchup(combatant, opp, { shieldsA: 2, shieldsB: 2 });
    if (r0.winner === 'A') wins0++;
    if (r1.winner === 'A') wins1++;
    if (r2.winner === 'A') wins2++;
    ratingSum1 += r1.ratingA;
    oppRatings.push({ name: opp.name, rating: r1.ratingA });
  }

  oppRatings.sort((x, y) => y.rating - x.rating);
  const key_wins = oppRatings.filter((x) => x.rating > 510).slice(0, 4).map((x) => x.name);
  const key_losses = oppRatings
    .filter((x) => x.rating < 490)
    .reverse()
    .slice(0, 4)
    .map((x) => x.name);

  const bp = analyzeBreakpointsAndCmp(combatant, sp, capOrCup, cap, dex, metaPool);

  return {
    cap,
    league: leagueName,
    win_rate_0v0: Math.round((wins0 * 1000) / metaPool.length) / 10,
    win_rate_1v1: Math.round((wins1 * 1000) / metaPool.length) / 10,
    win_rate_2v2: Math.round((wins2 * 1000) / metaPool.length) / 10,
    avg_rating_1v1: Math.round(ratingSum1 / metaPool.length),
    key_wins,
    key_losses,
    moves_used: [combatant.fast.name, combatant.charged1.name, combatant.charged2?.name || ''].filter(Boolean),
    used_current_moves: combatant.usedCurrentMoves,
    breakpoints: bp.breakpoints,
    cmp_wins: bp.cmp_wins,
    cmp_total: bp.cmp_total,
  };
}

// ============================================================
// A:4 — LEAD / SAFE SWAP / CLOSER + ARCHETYPE TEAM BATTLE SIM
// ============================================================
export function scoreTeamBattleCoverage(
  members: { m: MonModel; targetSid: string; targetLvl: number }[],
  capOrCup: number | string,
  dex: Dex,
): {
  win0v0: number;
  win1v1: number;
  win2v2: number;
  archetype: string;
  rolesByUid: Map<string, { battle_role: 'lead' | 'safe_swap' | 'closer'; switch_win_rate: number }>;
  holes: string[];
} {
  const pool = getMetaPool(dex, capOrCup, 25);
  const combatants: { m: MonModel; c: Combatant; win0: number; win1: number; winSwitch: number }[] = [];

  for (const mem of members) {
    const baseSid = mem.targetSid.replace(/_shadow$/, '');
    const sp = dex.byId.get(baseSid) || mem.m.species;
    if (!sp) continue;
    const c = buildCombatant(
      sp,
      mem.m.a,
      mem.m.d,
      mem.m.s,
      mem.targetLvl,
      mem.m.is_shadow,
      dex,
      capOrCup,
      mem.m,
    );
    let w0 = 0;
    let w1 = 0;
    let wSw = 0;
    const fastEnergyLead = c.fast.energy;
    for (const opp of pool) {
      if (simulateMatchup(c, opp, { shieldsA: 0, shieldsB: 0 }).winner === 'A') w0++;
      if (simulateMatchup(c, opp, { shieldsA: 1, shieldsB: 1 }).winner === 'A') w1++;
      if (
        simulateMatchup(c, opp, {
          shieldsA: 1,
          shieldsB: 1,
          startEnergyA: fastEnergyLead,
          startEnergyB: 0,
        }).winner === 'A'
      ) {
        wSw++;
      }
    }
    combatants.push({
      m: mem.m,
      c,
      win0: pool.length ? (100 * w0) / pool.length : 50,
      win1: pool.length ? (100 * w1) / pool.length : 50,
      winSwitch: pool.length ? (100 * wSw) / pool.length : 50,
    });
  }

  let teamW0 = 0;
  let teamW1 = 0;
  let teamW2 = 0;
  const holes: string[] = [];

  for (const opp of pool) {
    let any0 = false;
    let any1 = false;
    let any2 = false;
    for (const item of combatants) {
      if (!any0 && simulateMatchup(item.c, opp, { shieldsA: 0, shieldsB: 0 }).winner === 'A') any0 = true;
      if (!any1 && simulateMatchup(item.c, opp, { shieldsA: 1, shieldsB: 1 }).winner === 'A') any1 = true;
      if (!any2 && simulateMatchup(item.c, opp, { shieldsA: 2, shieldsB: 2 }).winner === 'A') any2 = true;
    }
    if (any0) teamW0++;
    if (any1) teamW1++;
    else holes.push(opp.name);
    if (any2) teamW2++;
  }

  // Assign Lead / Safe Swap (+1 fast move energy win rate) / Closer (0v0 shield win rate)
  const rolesByUid = new Map<string, { battle_role: 'lead' | 'safe_swap' | 'closer'; switch_win_rate: number }>();
  if (combatants.length === 3) {
    const sortedBySwitch = [...combatants].sort((a, b) => b.winSwitch - a.winSwitch);
    const swapPick = sortedBySwitch[0];
    const remaining = combatants.filter((x) => x.m.uid !== swapPick.m.uid);
    remaining.sort((a, b) => b.win0 - a.win0);
    const closerPick = remaining[0];
    const leadPick = remaining[1];

    rolesByUid.set(leadPick.m.uid, {
      battle_role: 'lead',
      switch_win_rate: Math.round(leadPick.winSwitch * 10) / 10,
    });
    rolesByUid.set(swapPick.m.uid, {
      battle_role: 'safe_swap',
      switch_win_rate: Math.round(swapPick.winSwitch * 10) / 10,
    });
    rolesByUid.set(closerPick.m.uid, {
      battle_role: 'closer',
      switch_win_rate: Math.round(closerPick.winSwitch * 10) / 10,
    });
  } else {
    combatants.forEach((x, idx) => {
      rolesByUid.set(x.m.uid, {
        battle_role: idx === 0 ? 'lead' : idx === 1 ? 'safe_swap' : 'closer',
        switch_win_rate: Math.round(x.winSwitch * 10) / 10,
      });
    });
  }

  // Archetype classification (ABC vs ABB)
  const typeCounts = new Map<string, number>();
  for (const item of combatants) {
    for (const t of new Set(item.c.types)) {
      if (t && t !== 'none') typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }
  }
  const sharedType = Array.from(typeCounts.entries()).find(([, cnt]) => cnt >= 2);
  let archetype = 'ABC Balanced';
  if (sharedType) {
    const [shT, cnt] = sharedType;
    if (cnt >= 3) archetype = `AAA (${shT.toUpperCase()})`;
    else archetype = `ABB (Dual ${shT.charAt(0).toUpperCase() + shT.slice(1)})`;
  }

  return {
    win0v0: pool.length ? Math.round((teamW0 * 1000) / pool.length) / 10 : 0,
    win1v1: pool.length ? Math.round((teamW1 * 1000) / pool.length) / 10 : 0,
    win2v2: pool.length ? Math.round((teamW2 * 1000) / pool.length) / 10 : 0,
    archetype,
    rolesByUid,
    holes: holes.slice(0, 6),
  };
}

// ============================================================
// PVPOKE TEAM BUILDER GRADING FORMULA
// (TeamInterface.js + TeamRanker.js + Pokemon.js)
// ============================================================
export function pvpokeLetterGrade(value: number, goal: number): string {
  const pct = goal > 0 ? value / goal : 0;
  if (pct >= 0.9) return 'A';
  if (pct >= 0.8) return 'B';
  if (pct >= 0.7) return 'C';
  if (pct >= 0.6) return 'D';
  return 'F';
}

export function calculatePvPokeConsistency(combatant: Combatant): number {
  const fast = combatant.fast;
  const charged = [combatant.charged1, combatant.charged2].filter((c): c is SimMoveSpec => Boolean(c));
  if (charged.length <= 1) return 100;

  const fastStab = combatant.types.includes(fast.type) ? STAB : 1.0;
  const fastDmg = fast.power * fastStab;
  const cMeta = charged.map((c) => {
    const cStab = combatant.types.includes(c.type) ? STAB : 1.0;
    const isSelfDebuff = Boolean(
      c.buffs &&
        c.buffTarget === 'self' &&
        Number(c.buffApplyChance ?? 1) >= 0.5 &&
        ((c.buffs[0] || 0) < 0 || (c.buffs[1] || 0) < 0),
    );
    const isSelfAtkDebuff = Boolean(
      c.buffs &&
        c.buffTarget === 'self' &&
        Number(c.buffApplyChance ?? 1) >= 0.5 &&
        (c.buffs[0] || 0) < 0,
    );
    const isSelfBuff = Boolean(
      c.buffs &&
        c.buffTarget === 'self' &&
        Number(c.buffApplyChance ?? 1) >= 0.5 &&
        ((c.buffs[0] || 0) > 0 || (c.buffs[1] || 0) > 0),
    );
    return {
      move: c,
      damage: c.power * cStab,
      isSelfDebuff,
      isSelfAtkDebuff,
      isSelfBuff,
    };
  });

  const scenarios: [number, number][] = [[1, 1]];
  if (cMeta[0].move.type !== cMeta[1].move.type) {
    scenarios.push([0.625, 1], [1, 0.625]);
  }

  let consistencyScore = 1;
  for (const eff of scenarios) {
    const scored = [...cMeta]
      .sort((a, b) => (a.move.name > b.move.name ? -1 : b.move.name > a.move.name ? 1 : 0))
      .map((item, idx) => {
        const mult =
          idx < 2
            ? eff[idx]
            : item.move.type === cMeta[0].move.type
            ? eff[0]
            : item.move.type === cMeta[1].move.type
            ? eff[1]
            : 1;
        return {
          ...item,
          dpe: (item.damage / Math.max(1, item.move.energy)) * mult,
        };
      });

    scored.sort((a, b) => b.dpe - a.dpe);
    if (scored[scored.length - 1].move.moveId === 'POWER_UP_PUNCH') {
      scored[scored.length - 1].dpe *= 2;
      scored.sort((a, b) => b.dpe - a.dpe);
    }

    const top = scored[0];
    const sec = scored[1];
    const cycleFastMoves = Math.ceil(top.move.energy / Math.max(1, fast.energy));
    let cycleFastDamage = fastDmg * cycleFastMoves;
    const cycleDamage = cycleFastDamage + top.damage;

    if (fast.type === top.move.type) cycleFastDamage *= eff[0];
    else if (fast.type === sec.move.type) cycleFastDamage *= eff[1];

    let factor = 1;
    const baitDependent =
      top.move.energy > sec.move.energy ||
      (top.move.energy === sec.move.energy && sec.move.moveId === 'ACID_SPRAY') ||
      (top.isSelfAtkDebuff && !sec.isSelfDebuff && sec.move.energy - top.move.energy <= 10) ||
      (top.isSelfDebuff && top.move.energy > 50 && !sec.isSelfDebuff && sec.move.energy - top.move.energy <= 10);

    if (baitDependent && cycleDamage > 0 && top.dpe > 0) {
      factor = cycleFastDamage / cycleDamage + (top.damage / cycleDamage) * (sec.dpe / top.dpe);
      if (sec.move.energy < top.move.energy && top.move.energy > 30 && !top.isSelfBuff) {
        factor += (1 - factor) * ((sec.move.energy - 30) / (top.move.energy - 30)) * 0.5;
      } else if (sec.move.energy < top.move.energy && top.move.energy > 20 && top.isSelfBuff) {
        factor += (1 - factor) * ((sec.move.energy - 20) / (top.move.energy - 20));
      }
    }

    let buffChanceFactor = 0;
    for (const item of scored) {
      const m = item.move;
      const chance = Number(m.buffApplyChance ?? 0);
      if (m.buffs && m.buffs.length >= 2 && chance < 1 && chance > 0.15) {
        const buffStages = Math.abs(m.buffs[0] || 0) + Math.abs(m.buffs[1] || 0);
        const buffCons = 0.5 + Math.abs(0.5 - chance);
        const buffsAsDamage = item.damage + buffStages * 25 * (1 - buffCons);
        buffChanceFactor += buffsAsDamage > 0 ? item.damage / buffsAsDamage : 1;
      } else {
        buffChanceFactor += 1;
      }
    }
    buffChanceFactor /= scored.length;
    consistencyScore *= Math.max(0, Math.min(1, factor)) * buffChanceFactor;
  }

  consistencyScore = Math.pow(Math.max(0, consistencyScore), 1 / scenarios.length);
  const moveIds = new Set(charged.map((c) => c.moveId));
  if (moveIds.has('POWER_UP_PUNCH')) consistencyScore *= 0.85;
  if (moveIds.has('LUNGE')) consistencyScore *= 0.85;
  if (moveIds.has('FEATHER_DANCE')) consistencyScore *= 0.75;
  if (moveIds.has('BUBBLE_BEAM')) consistencyScore *= 0.75;

  return Math.round(consistencyScore * 1000) / 10;
}

export interface PvPokeTeamOverview {
  score: number;
  grade: string;
  threatScore: number;
  coverageGrade: string;
  bulkGrade: string;
  safetyGrade: string;
  consistencyGrade: string;
  coveragePct: number;
  bulkPct: number;
  safetyScore: number;
  consistencyScore: number;
  avgBulk: number;
  bulkGoal: number;
  topThreats: { name: string; sid: string; rating: number; rank: number; beatenBy: string[]; beats: string[] }[];
}

export interface PvPokeTeamPrecomputed {
  metaPool: Combatant[];
  metaBaseSids: string[];
  metaRanks: number[];
  isMetaFlags: boolean[];
  // oppRatings[candIdx][oppIdx], oppScores[candIdx][oppIdx]
  oppRatings: Float64Array[];
  oppScores: Float64Array[];
  bulks: number[];
  safeties: number[];
  consistencies: number[];
}

export function precomputePvPokeCandidateMatrix(
  candidates: Combatant[],
  capOrCup: number | string,
  dex: Dex,
  limit = 40,
): PvPokeTeamPrecomputed {
  const metaPool = getMetaPool(dex, capOrCup, limit);
  const rawThreats = dex.threats.get(capOrCup) || [];
  const metaSet = new Set<string>();
  const rankBySid = new Map<string, number>();
  for (const [sid, rk] of rawThreats) {
    metaSet.add(sid);
    metaSet.add(sid.replace(/_shadow$/, ''));
    if (!rankBySid.has(sid)) rankBySid.set(sid, rk);
  }

  const metaBaseSids = metaPool.map((opp) => opp.sid.replace(/_shadow$/, ''));
  const metaRanks = metaPool.map((opp, idx) => rankBySid.get(opp.sid) ?? idx + 1);
  const isMetaFlags = metaPool.map(
    (opp) => metaSet.size === 0 || metaSet.has(opp.sid) || metaSet.has(opp.sid.replace(/_shadow$/, '')),
  );

  const oppRatings: Float64Array[] = [];
  const oppScores: Float64Array[] = [];
  const bulks: number[] = [];
  const safeties: number[] = [];
  const consistencies: number[] = [];

  for (const mem of candidates) {
    const rArr = new Float64Array(metaPool.length);
    const sArr = new Float64Array(metaPool.length);

    for (let o = 0; o < metaPool.length; o++) {
      const opp = metaPool[o];
      const res = simulateMatchup(opp, mem, { shieldsA: 1, shieldsB: 1 });
      const oppRating = Math.floor((res.hpLeftPctA + (1 - res.hpLeftPctB)) * 500);
      let sc = oppRating > 500 ? 500 + Math.pow(oppRating - 500, 0.75) : oppRating / 2;
      if (sc > 500) {
        sc += isMetaFlags[o] ? (1000 - sc) * 0.85 : -(sc - 500) * 0.15;
      }
      rArr[o] = oppRating;
      sArr[o] = sc;
    }

    oppRatings.push(rArr);
    oppScores.push(sArr);
    bulks.push(mem.def * mem.maxHp);
    const roles = dex.roleScores(capOrCup, mem.sid);
    safeties.push(roles.switches ?? 60);
    consistencies.push(calculatePvPokeConsistency(mem));
  }

  return {
    metaPool,
    metaBaseSids,
    metaRanks,
    isMetaFlags,
    oppRatings,
    oppScores,
    bulks,
    safeties,
    consistencies,
  };
}

export function scorePrecomputedTriplePvPoke(
  indices: number[],
  members: Combatant[],
  pre: PvPokeTeamPrecomputed,
  cap: number,
  cupKey?: string,
): PvPokeTeamOverview {
  const nMem = indices.length;
  const nOpp = pre.metaPool.length;

  let bulkGoal = BULK_GOAL[cap] ?? 22000;
  if (cap === 2500 && cupKey === 'premier') bulkGoal = 33000;

  let avgBulk = 0;
  let avgSafety = 0;
  let avgConsistency = 0;
  for (const idx of indices) {
    avgBulk += pre.bulks[idx];
    avgSafety += pre.safeties[idx];
    avgConsistency += pre.consistencies[idx];
  }
  avgBulk = nMem > 0 ? avgBulk / nMem : 0;
  avgSafety = nMem > 0 ? avgSafety / nMem : 60;
  avgConsistency = nMem > 0 ? avgConsistency / nMem : 60;

  const bulkGrade = pvpokeLetterGrade(avgBulk, bulkGoal);
  const safetyGrade = pvpokeLetterGrade(avgSafety, 98);
  const consistencyGrade = pvpokeLetterGrade(avgConsistency, 98);

  if (nOpp === 0 || nMem === 0) {
    return {
      score: 65,
      grade: pvpokeLetterGrade(65, 100),
      threatScore: 650,
      coverageGrade: 'C',
      bulkGrade,
      safetyGrade,
      consistencyGrade,
      coveragePct: 65,
      bulkPct: Math.min(100, Math.round((avgBulk / bulkGoal) * 100)),
      safetyScore: Math.round(avgSafety * 10) / 10,
      consistencyScore: Math.round(avgConsistency * 10) / 10,
      avgBulk: Math.round(avgBulk),
      bulkGoal,
      topThreats: [],
    };
  }

  const oppSummaries: { o: number; rating: number; score: number }[] = [];
  for (let o = 0; o < nOpp; o++) {
    let rSum = 0;
    let sSum = 0;
    for (const idx of indices) {
      rSum += pre.oppRatings[idx][o];
      sSum += pre.oppScores[idx][o];
    }
    oppSummaries.push({
      o,
      rating: Math.floor(rSum / nMem),
      score: sSum / nMem,
    });
  }
  oppSummaries.sort((a, b) => b.score - a.score);

  const pickedBaseSids = new Set<string>();
  let threatSum = 0;
  let threatCount = 0;
  const topThreats: PvPokeTeamOverview['topThreats'] = [];

  for (const item of oppSummaries) {
    const opp = pre.metaPool[item.o];
    const baseSid = pre.metaBaseSids[item.o];
    if (pickedBaseSids.has(baseSid)) continue;
    pickedBaseSids.add(baseSid);

    if (threatCount < 6) {
      threatSum += item.rating;
      threatCount++;
    }
    if (item.rating > 500 && topThreats.length < 8) {
      const beats: string[] = [];
      const beatenBy: string[] = [];
      for (let mPos = 0; mPos < indices.length; mPos++) {
        const r = pre.oppRatings[indices[mPos]][item.o];
        if (r > 515) beats.push(members[mPos].name);
        else if (r < 485) beatenBy.push(members[mPos].name);
      }
      topThreats.push({
        name: opp.name,
        sid: opp.sid,
        rating: item.rating,
        rank: pre.metaRanks[item.o],
        beats,
        beatenBy,
      });
    }
    if (threatCount >= 6 && topThreats.length >= 8) break;
  }

  const threatScore = threatCount > 0 ? Math.round(threatSum / Math.max(1, threatCount)) : 700;
  const coverageVal = Math.max(0, 1200 - threatScore);
  const coverageGrade = pvpokeLetterGrade(coverageVal, 680);
  const coveragePct = Math.max(0, Math.min(100, Math.round((coverageVal / 680) * 100)));

  const bulkPct = Math.min(100, Math.round((avgBulk / bulkGoal) * 100));
  const covRatio = Math.max(0, Math.min(1.05, coverageVal / 680));
  const bulkRatio = Math.max(0, Math.min(1.05, avgBulk / bulkGoal));
  const safetyRatio = Math.max(0, Math.min(1.05, avgSafety / 98));
  const consRatio = Math.max(0, Math.min(1.05, avgConsistency / 98));

  const score = Math.round(
    Math.min(100, (covRatio * 0.4 + bulkRatio * 0.2 + safetyRatio * 0.2 + consRatio * 0.2) * 100),
  );

  return {
    score,
    grade: pvpokeLetterGrade(score, 100),
    threatScore,
    coverageGrade,
    bulkGrade,
    safetyGrade,
    consistencyGrade,
    coveragePct,
    bulkPct,
    safetyScore: Math.round(avgSafety * 10) / 10,
    consistencyScore: Math.round(avgConsistency * 10) / 10,
    avgBulk: Math.round(avgBulk),
    bulkGoal,
    topThreats,
  };
}

export function evaluatePvPokeTeamOverview(
  teamCombatants: Combatant[],
  capOrCup: number | string,
  cap: number,
  dex: Dex,
): PvPokeTeamOverview {
  const pre = precomputePvPokeCandidateMatrix(teamCombatants, capOrCup, dex, 40);
  const indices = teamCombatants.map((_, i) => i);
  return scorePrecomputedTriplePvPoke(
    indices,
    teamCombatants,
    pre,
    cap,
    typeof capOrCup === 'string' ? capOrCup : undefined,
  );
}

// ============================================================
// A:3 — SAVED IN-GAME BATTLE PARTIES AUDIT
// ============================================================
const LEAGUE_ENUM_TO_CAP: Record<string, { label: string; cap: number | null; kind: 'pvp' | 'raid' }> = {
  BATTLE_LEAGUE_GREAT: { label: 'Great League', cap: 1500, kind: 'pvp' },
  COMBAT_LEAGUE_DEFAULT_GREAT: { label: 'Great League', cap: 1500, kind: 'pvp' },
  BATTLE_LEAGUE_ULTRA: { label: 'Ultra League', cap: 2500, kind: 'pvp' },
  COMBAT_LEAGUE_DEFAULT_ULTRA: { label: 'Ultra League', cap: 2500, kind: 'pvp' },
  BATTLE_LEAGUE_MASTER: { label: 'Master League', cap: 10000, kind: 'pvp' },
  COMBAT_LEAGUE_DEFAULT_MASTER: { label: 'Master League', cap: 10000, kind: 'pvp' },
  BATTLE_LEAGUE_LITTLE: { label: 'Little Cup', cap: 500, kind: 'pvp' },
  COMBAT_LEAGUE_DEFAULT_LITTLE: { label: 'Little Cup', cap: 500, kind: 'pvp' },
  BATTLE_LEAGUE_GYM_RAID: { label: 'Raid / Gym', cap: null, kind: 'raid' },
  BREAD_LEAGUE_DEFAULT_MASTER: { label: 'Max Battles (Power Spot)', cap: null, kind: 'raid' },
};

export function auditSavedBattleParties(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  dex: Dex,
): SavedPartyAudit[] {
  const acc = (rawData.account || {}) as Record<string, unknown>;
  const prefs = (acc.playerPreferences ?? rawData.playerPreferences ?? {}) as Record<string, unknown>;
  const bpWrap = prefs.battleParties ?? rawData.battleParties;
  const rawParties = Array.isArray(bpWrap)
    ? bpWrap
    : bpWrap && typeof bpWrap === 'object' && Array.isArray((bpWrap as Record<string, unknown>).battleParties)
    ? ((bpWrap as Record<string, unknown>).battleParties as unknown[])
    : [];

  if (rawParties.length === 0) return [];

  const byRawId = new Map<string, MonModel>();
  for (const m of mons) {
    const rid = m.raw.id ?? m.raw.uid;
    if (rid !== undefined && rid !== null) byRawId.set(String(rid), m);
  }

  const audits: SavedPartyAudit[] = [];

  for (const rawP of rawParties) {
    if (!rawP || typeof rawP !== 'object') continue;
    const pObj = rawP as { name?: string; combatLeagueId?: string; ids?: (string | number)[] };
    const clId = String(pObj.combatLeagueId || 'BATTLE_LEAGUE_GYM_RAID');
    const clUp = clId.toUpperCase();
    const info = LEAGUE_ENUM_TO_CAP[clUp] || (
      clUp.includes('GREAT')
        ? { label: 'Great League', cap: 1500, kind: 'pvp' as const }
        : clUp.includes('ULTRA')
        ? { label: 'Ultra League', cap: 2500, kind: 'pvp' as const }
        : clUp.includes('LITTLE')
        ? { label: 'Little Cup', cap: 500, kind: 'pvp' as const }
        : clUp.includes('MASTER') && !clUp.includes('BREAD')
        ? { label: 'Master League', cap: 10000, kind: 'pvp' as const }
        : {
            label: clId.replace(/^(BATTLE|COMBAT|BREAD)_LEAGUE_(DEFAULT_)?/, '').replace(/_/g, ' '),
            cap: null,
            kind: 'raid' as const,
          }
    );

    const ids = Array.isArray(pObj.ids) ? pObj.ids.map(String) : [];
    const issues: string[] = [];
    const matchedMons: MonModel[] = [];
    const members: SavedPartyAudit['members'] = ids.map((rid) => {
      const m = byRawId.get(rid);
      if (!m) {
        issues.push(`Missing/transferred Pokémon ID ${rid}`);
        return {
          id: '',
          raw_id: rid,
          found: false,
          name: `Missing #${rid.slice(-6)}`,
          cp: 0,
          iv: '—',
          warning: 'Not in box (transferred or unfused)',
        };
      }
      matchedMons.push(m);
      let warn = '';
      if (m.verdict === 'TRANSFER' || m.verdict === 'REVIEW' || m.verdict === 'TRADE') {
        warn = `Tagged as ${m.verdict}`;
        issues.push(`${m.species?.speciesName || m.dex} is marked ${m.verdict}`);
      } else if (info.kind === 'pvp' && info.cap && info.cap < 10000 && m.cp > info.cap) {
        warn = `CP ${m.cp} exceeds ${info.cap}`;
        issues.push(`${m.species?.speciesName || m.dex} CP ${m.cp} exceeds ${info.cap} cap`);
      } else if (m.raw.move2 && Number(m.raw.move2) === 322) {
        warn = 'Knows Frustration';
        issues.push(`${m.species?.speciesName || m.dex} still knows Frustration`);
      }
      return {
        id: m.uid,
        raw_id: rid,
        found: true,
        name: cleanSpeciesName(m.species?.speciesName || `Dex ${m.dex}`),
        cp: m.cp,
        iv: ivStr(m),
        verdict: m.verdict,
        warning: warn || undefined,
        dex: m.dex,
      };
    });

    let battleWinRate: number | undefined;
    let battleGrade: string | undefined;
    let battleScore: number | undefined;
    let threatScore: number | undefined;
    let pvpokeGrades: SavedPartyAudit['pvpoke_grades'] | undefined;
    let holes: string[] | undefined;
    let benchUpgrade: SavedPartyAudit['bench_upgrade'] = null;

    if (info.kind === 'pvp' && info.cap && matchedMons.length > 0) {
      const cap = info.cap;
      const teamSpec = matchedMons.map((m) => ({
        m,
        targetSid: m.species?.speciesId || String(m.dex),
        targetLvl: m.level,
      }));
      const cov = scoreTeamBattleCoverage(teamSpec, cap, dex);
      const combatants = matchedMons
        .filter((m) => Boolean(m.species))
        .map((m) => buildCombatant(m.species!, m.a, m.d, m.s, m.level, m.is_shadow, dex, cap, m));
      const pvOverview = evaluatePvPokeTeamOverview(combatants, cap, cap, dex);
      battleWinRate = cov.win1v1;
      holes = pvOverview.topThreats.length > 0 ? pvOverview.topThreats.slice(0, 6).map((t) => t.name) : cov.holes;
      threatScore = pvOverview.threatScore;
      battleScore = Math.round(pvOverview.score * 10) / 10;
      pvpokeGrades = {
        coverage: pvOverview.coverageGrade,
        bulk: pvOverview.bulkGrade,
        safety: pvOverview.safetyGrade,
        consistency: pvOverview.consistencyGrade,
      };
      battleGrade = pvOverview.grade;

      // Suggest 1 single-slot bench upgrade from built/eligible box mons with full PvPoke grade comparison
      const inPartyIds = new Set(matchedMons.map((m) => m.uid));
      const inPartyDex = new Set(matchedMons.map((m) => m.dex));
      const benchPool = mons
        .filter(
          (m) =>
            !inPartyIds.has(m.uid) &&
            !inPartyDex.has(m.dex) &&
            m.verdict !== 'TRANSFER' &&
            m.species &&
            m.pvp.some((p) => p.cap === cap && p.eligible && p.species_rank <= 100),
        )
        .sort((a, b) => {
          const ap = a.pvp.find((p) => p.cap === cap)?.composite ?? 999;
          const bp = b.pvp.find((p) => p.cap === cap)?.composite ?? 999;
          return ap - bp;
        })
        .slice(0, 10);

      if (teamSpec.length === 3 && benchPool.length > 0 && combatants.length === 3) {
        let bestCombinedDelta = 0;
        for (let slot = 0; slot < 3; slot++) {
          for (const cand of benchPool) {
            if (teamSpec.some((s, idx) => idx !== slot && s.m.dex === cand.dex)) continue;
            const cEntry = cand.pvp.find((p) => p.cap === cap);
            if (!cEntry || !cand.species) continue;
            const candLvl = Math.min(cand.level >= 15 ? cand.level : cEntry.target_level, cEntry.target_level);
            const modded = [...teamSpec];
            modded[slot] = {
              m: cand,
              targetSid: cand.species.speciesId,
              targetLvl: candLvl,
            };
            const sim = scoreTeamBattleCoverage(modded, cap, dex);
            const simCombatants = [...combatants];
            simCombatants[slot] = buildCombatant(
              cand.species,
              cand.a,
              cand.d,
              cand.s,
              candLvl,
              cand.is_shadow,
              dex,
              cap,
              cand,
            );
            const simOverview = evaluatePvPokeTeamOverview(simCombatants, cap, cap, dex);
            const winGain = Math.round((sim.win1v1 - cov.win1v1) * 10) / 10;
            const scoreGain = Math.round((simOverview.score - pvOverview.score) * 10) / 10;
            const threatDrop = Math.round((pvOverview.threatScore - simOverview.threatScore) * 10) / 10;
            const gradeImproved = simOverview.grade !== pvOverview.grade && simOverview.score > pvOverview.score;
            const meaningful = scoreGain >= 2.0 || winGain >= 2.5 || gradeImproved;
            const combined = scoreGain + winGain * 0.6;
            if (meaningful && combined > bestCombinedDelta) {
              bestCombinedDelta = combined;
              benchUpgrade = {
                replace_name: cleanSpeciesName(teamSpec[slot].m.species?.speciesName || String(teamSpec[slot].m.dex)),
                with_id: cand.uid,
                with_name: cleanSpeciesName(cand.species.speciesName),
                with_iv: ivStr(cand),
                gain_pct: winGain,
                grade_before: pvOverview.grade,
                grade_after: simOverview.grade,
                score_before: Math.round(pvOverview.score * 10) / 10,
                score_after: Math.round(simOverview.score * 10) / 10,
                threat_before: pvOverview.threatScore,
                threat_after: simOverview.threatScore,
                reason:
                  scoreGain >= 2.0 || gradeImproved
                    ? `PvPoke grade ${pvOverview.grade} → ${simOverview.grade} (${Math.round(pvOverview.score)} → ${Math.round(simOverview.score)} score${threatDrop > 0 ? `, -${threatDrop} threat` : ''}, ${cov.win1v1}% → ${sim.win1v1}% 1v1)`
                    : `Boosts 1v1 meta coverage from ${cov.win1v1}% → ${sim.win1v1}%`,
              };
            }
          }
        }
      }
    } else if (info.kind === 'raid' && matchedMons.length > 0) {
      // Compare average raid eDPS vs top non-party attackers
      const totalDps = matchedMons.reduce((s, m) => s + (m.raid_dps || estimatedRaidDps(m, dex) || 0), 0);
      const avgDps = matchedMons.length ? totalDps / matchedMons.length : 0;
      const weakest = [...matchedMons]
        .map((m) => ({ m, dps: m.raid_dps || estimatedRaidDps(m, dex) || 0 }))
        .sort((a, b) => a.dps - b.dps)[0];
      const inIds = new Set(matchedMons.map((m) => m.uid));
      const sameTypeBench = weakest
        ? mons
            .filter(
              (m) =>
                !inIds.has(m.uid) &&
                m.verdict !== 'TRANSFER' &&
                (m.raid_dps || estimatedRaidDps(m, dex) || 0) > weakest.dps * 1.1 &&
                (weakest.m.raid_type ? m.raid_type === weakest.m.raid_type : true),
            )
            .sort((a, b) => (b.raid_dps || 0) - (a.raid_dps || 0))[0]
        : undefined;
      if (weakest && sameTypeBench) {
        const candDps = sameTypeBench.raid_dps || estimatedRaidDps(sameTypeBench, dex) || 0;
        const afterAvg = (totalDps - weakest.dps + candDps) / matchedMons.length;
        const gain =
          weakest.dps > 0
            ? Math.round(((candDps - weakest.dps) / weakest.dps) * 100)
            : 20;
        benchUpgrade = {
          replace_name: cleanSpeciesName(weakest.m.species?.speciesName || String(weakest.m.dex)),
          with_id: sameTypeBench.uid,
          with_name: cleanSpeciesName(sameTypeBench.species?.speciesName || String(sameTypeBench.dex)),
          with_iv: ivStr(sameTypeBench),
          gain_pct: gain,
          edps_before: Math.round(avgDps * 10) / 10,
          edps_after: Math.round(afterAvg * 10) / 10,
          reason: `+${gain}% slot eDPS (${candDps.toFixed(1)} vs ${weakest.dps.toFixed(1)}; squad avg ${avgDps.toFixed(1)} → ${afterAvg.toFixed(1)} eDPS).`,
        };
      }
      battleWinRate = Math.round(avgDps * 10) / 10;
    }

    audits.push({
      name: String(pObj.name || info.label),
      combatLeagueId: clId,
      league_label: info.label,
      cap: info.cap,
      kind: info.kind,
      members,
      battle_win_rate: battleWinRate,
      battle_grade: battleGrade,
      battle_score: battleScore,
      threat_score: threatScore,
      pvpoke_grades: pvpokeGrades,
      holes,
      bench_upgrade: benchUpgrade,
      issues: Array.from(new Set(issues)),
    });
  }

  return audits;
}

// ============================================================
// D:4 — INTERACTIVE WHAT-IF SANDBOX FOR INSPECTOR DRAWER
// ============================================================
export interface WhatIfParams {
  targetSid: string;
  a: number;
  d: number;
  s: number;
  level: number;
  isShadow: boolean;
  bestBuddy: boolean;
  cap: number;
  fastMoveId?: string;
  charged1Id?: string;
  charged2Id?: string;
}

export interface WhatIfResult {
  cp: number;
  eff_level: number;
  iv_pct: number;
  iv_rank: number | null;
  iv_rank_pct: number | null;
  stat_prod: number;
  atk: number;
  def: number;
  hp: number;
  pvp_summary: PvpBattleSummary | null;
  raid_edps: number | null;
  dust_needed?: number;
}

export function runWhatIfSandbox(
  params: WhatIfParams,
  dex: Dex,
): WhatIfResult | null {
  const sp = dex.byId.get(params.targetSid.replace(/_shadow$/, '')) || dex.byId.get(params.targetSid);
  if (!sp) return null;

  const effLvl = Math.min(51, params.level + (params.bestBuddy ? 1 : 0));
  const cp = computeCp(sp.baseStats, params.a, params.d, params.s, effLvl) ?? 10;
  const st = effectiveStats(sp, params.a, params.d, params.s, effLvl, params.isShadow);
  const iv_pct = Math.round(((params.a + params.d + params.s) / 45) * 1000) / 10;
  const ivR = dex.ivRank(sp.speciesId, params.cap, params.a, params.d, params.s);
  const leagueName = LEAGUE_NAMES[params.cap] || `${params.cap}`;

  const pvp_summary = evaluatePvpBattleMatrix(
    sp,
    params.a,
    params.d,
    params.s,
    effLvl,
    params.isShadow,
    params.cap,
    params.cap,
    leagueName,
    dex,
    null,
    {
      fastMoveId: params.fastMoveId,
      charged1Id: params.charged1Id,
      charged2Id: params.charged2Id,
    },
  );

  // Estimate Raid eDPS at simulated level
  let bestRaidDps: number | null = null;
  for (const t of sp.types || []) {
    const coeff = dex.raidCoeff(sp.speciesId, t.toLowerCase());
    if (coeff !== null) {
      const cpm = CPM[Math.min(50, Math.round(effLvl * 2) / 2)] ?? CPM[40];
      const shMult = params.isShadow ? 1.2 : 1.0;
      const val = (sp.baseStats.atk + params.a) * cpm * shMult * coeff;
      if (bestRaidDps === null || val > bestRaidDps) bestRaidDps = Math.round(val * 10) / 10;
    }
  }

  return {
    cp,
    eff_level: effLvl,
    iv_pct,
    iv_rank: ivR ? ivR[0] : null,
    iv_rank_pct: ivR ? ivR[1] : null,
    stat_prod: Math.round((st.atk * st.def * st.hp) / 1000),
    atk: Math.round(st.atk * 10) / 10,
    def: Math.round(st.def * 10) / 10,
    hp: st.hp,
    pvp_summary,
    raid_edps: bestRaidDps,
  };
}
