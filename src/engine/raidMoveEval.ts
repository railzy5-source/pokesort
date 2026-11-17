/**
 * raidMoveEval.ts
 * ---------------------------------------------------------------------------
 * Type-aware evaluation of ONE owned Pokémon as a raid attacker for ONE team type.
 *
 * Why this file exists
 *   The old ranking used a per-SPECIES number ("best possible moveset for this type"), so two Garchomps
 *   with different moves got the same DPS, and a Shadow Pokémon stuck with Frustration was ranked as if
 *   it already knew its best move. This module scores the moves the Pokémon ACTUALLY knows, against a
 *   generic defender weak to the team type (x1.6 for moves of that type, x1.0 for everything else), and
 *   works out which TMs would fix it.
 *
 * Game rules this encodes (verified Nov 2026)
 *   - Regular Fast/Charged TM  = RANDOM re-roll inside the species' regular (non-legacy) pool. Never gives
 *     the same move back. A Pokémon with two Charged slots lets you pick which slot to re-roll.
 *   - Elite Fast/Charged TM    = you CHOOSE the move, including legacy/event ("Elite") moves.
 *   - Frustration (Shadow)     = dead slot. A Charged TM can only remove it during a Team GO Rocket
 *     Takeover window (or after purifying, which turns it into Return). Elite TMs cannot remove it.
 *   - A second Charged Attack IS usable in raids, so a Shadow with Frustration in slot 1 and a good move in
 *     slot 2 is a perfectly fine attacker.
 */
import { CPM } from './cpmTable';
import { isCrownedForm } from './pgsParser';
import {
  moveLabel,
  pairDpsPerAtk,
  prepMoves,
  raidBulk,
  type Dex,
  type PrepCharged,
  type PrepFast,
} from './pveModel';
import type {
  BagResources,
  MonModel,
  PogoConfig,
  PvPokeSpecies,
  RaidBlocker,
  RaidEntryStatus,
} from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** What the bag holds. `known:false` means the export had no bag data, so TM stock is not enforced. */
export interface RaidTmBag {
  fast: number;
  charged: number;
  eliteFast: number;
  eliteCharged: number;
  known: boolean;
}

export function tmBagFrom(bag?: BagResources | null): RaidTmBag {
  if (!bag) return { fast: 0, charged: 0, eliteFast: 0, eliteCharged: 0, known: false };
  return {
    fast: Number(bag.fast_tms) || 0,
    charged: Number(bag.charged_tms) || 0,
    eliteFast: Number(bag.elite_fast_tms) || 0,
    eliteCharged: Number(bag.elite_charged_tms) || 0,
    known: true,
  };
}

export interface RaidAssessment {
  status: RaidEntryStatus;
  blocker: RaidBlocker | null;
  /** Required TM(s) are in the bag (or the bag is unknown). Always true for `ready`. */
  tmInBag: boolean;
  /** Type-effective DPS of `moveset` (current moves when ready, projected moves otherwise). */
  dps: number;
  /** "Fast / Charged" the DPS is based on. */
  moveset: string;
  basis: 'current' | 'after_tm';
  /** What the Pokémon knows right now, as "Fast / Charged / Charged". */
  currentMoveset: string;
  tmActions: string[];
  upgradeHint: string;
  statusLabel: string;
  /** Set when the Fast Attack is deliberately kept because it decides this Pokémon's Max Move type. */
  fastLockNote?: string;
}

export interface AssessArgs {
  mon: MonModel;
  /** The species this Pokémon would be when used (itself, or an evolution target). */
  species: PvPokeSpecies;
  dex: Dex;
  cfg: PogoConfig;
  /** Team type being built, e.g. "ground". The simulated defender is weak to this type. */
  teamType: string;
  tmBag: RaidTmBag;
  /** Mega/Primal forms never get the Shadow bonus. */
  isMega?: boolean;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const FRUSTRATION_RAW_ID = 322;

interface KnownMove {
  ident: string;
  label: string;
  type: string;
  slot: 'fast' | 'charged1' | 'charged2';
  /** Frustration: occupies a slot but can never be used as a real attack. */
  dead: boolean;
}

type Route = 'known' | 'tm' | 'elite_tm';

interface Step {
  kind: 'fast' | 'charged';
  ident: string;
  label: string;
  route: Route;
  /** Move that gets overwritten (null if none, e.g. nothing to replace). */
  replaces: KnownMove | null;
  /** Regular-TM odds: `hit` outcomes of `of` are acceptable (see oddsOf). */
  of: number;
  /** Outcomes (of `of`) that are `atype` moves for charged, or exactly this move for fast. */
  hit: number;
}

interface Plan {
  fast: Step;
  charged: Step;
  dps: number;
  needsElite: boolean;
  needsRegular: boolean;
  /** Charged route impossible because the only candidate slot holds an unremovable Frustration. */
  frustrationBlocked: boolean;
}

const up = (s: string) => String(s || '').toUpperCase();
const stripFast = (s: string) => up(s).replace(/_FAST$/, '');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function readKnownMoves(
  dex: Dex,
  mon: MonModel,
  frustrationOk: boolean,
): { moves: KnownMove[]; unreadable: boolean } {
  const pve = dex.pve;
  const out: KnownMove[] = [];
  let unreadable = false;
  const slots: [KnownMove['slot'], 'move1' | 'move2' | 'move3'][] = [
    ['fast', 'move1'],
    ['charged1', 'move2'],
    ['charged2', 'move3'],
  ];
  for (const [slot, key] of slots) {
    const raw = mon.raw[key];
    if (raw === undefined || raw === null || raw === '' || raw === 0) continue;
    const num = Number(raw);
    const rawKey = !Number.isNaN(num) && pve.ok ? pve.byId.get(num) : undefined;
    if (!rawKey) {
      // Frustration can still be recognised by its numeric id even if the id table failed to load.
      if (num === FRUSTRATION_RAW_ID || up(String(raw)) === 'FRUSTRATION') {
        out.push({
          ident: 'FRUSTRATION',
          label: 'Frustration',
          type: 'normal',
          slot,
          dead: !frustrationOk,
        });
      } else {
        unreadable = true;
      }
      continue;
    }
    const ident = stripFast(rawKey);
    out.push({
      ident,
      label: moveLabel(ident),
      type: String(pve.moves[rawKey]?.t || dex.moves.get(ident)?.type || '').toLowerCase(),
      slot,
      dead: ident === 'FRUSTRATION' && !frustrationOk,
    });
  }
  return { moves: out, unreadable };
}

interface Pools {
  fast: string[];
  charged: string[];
  elite: Set<string>;
}

function poolsFor(sp: PvPokeSpecies, mon: MonModel): Pools {
  let charged = [...(sp.chargedMoves || [])].map(up);
  if (!isCrownedForm(mon)) charged = charged.filter((m) => !m.includes('BEHEMOTH'));
  const noDead = (m: string) => m !== 'FRUSTRATION' && m !== 'RETURN';
  return {
    fast: [...(sp.fastMoves || [])].map(up).filter(noDead),
    charged: charged.filter(noDead),
    elite: new Set([...(sp.eliteMoves || []), ...(sp.legacyMoves || [])].map(up)),
  };
}

const movesetLabel = (fast: string, charged: string) => `${moveLabel(fast)} / ${moveLabel(charged)}`;

function typeOf(dex: Dex, ident: string, fast: boolean): string {
  const k = fast ? `${ident}_FAST` : ident;
  return String(dex.pve.moves[k]?.t || dex.moves.get(ident)?.type || '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Scores one owned Pokémon for one team type.
 * Returns null when this species can never use a `teamType` Charged Move (it simply does not belong on that team).
 */
export function assessRaidMon(args: AssessArgs): RaidAssessment | null {
  const { mon, species: sp, dex, cfg, teamType, tmBag } = args;
  const atype = teamType.toLowerCase();
  const rc = cfg.raid;
  const tmMinGain = Number(rc.tm_min_gain_pct ?? 5);
  const eliteMinGain = Number(rc.elite_tm_min_gain_pct ?? 10);

  const frustrationOk =
    Boolean(rc.frustration_removable_now) || (rc.allow_frustration_uids || []).includes(mon.uid);
  const { moves: known, unreadable } = readKnownMoves(dex, mon, frustrationOk);
  const knownFast = known.find((k) => k.slot === 'fast') || null;
  const knownCharged = known.filter((k) => k.slot !== 'fast');
  const hasSecondSlot = knownCharged.length >= 2 || mon.has_third_move;

  // A Dynamax Pokémon that holds a Max Battle slot must KEEP its Fast Attack: that move decides its Max Move type, and a
  // Fast TM re-roll could change it (e.g. Mud-Slap → Smack Down turns Max Quake into Max Rockfall). Gigantamax Pokémon
  // are exempt because the G-Max Move is fixed by species. Turn off with max_battle.respect_current_fast_move = false.
  const lockFast = Boolean(
    knownFast &&
      mon.is_dynamax &&
      !mon.is_gigantamax &&
      mon.max_type &&
      !mon.max_reject &&
      cfg.max_battle?.respect_current_fast_move !== false,
  );

  // Evolutions re-roll / change moves, and a Drilbur is not an Excadrill yet: never "ready".
  const evolveFirst = Boolean(!args.isMega && mon.species && mon.species.speciesId !== sp.speciesId);

  const pools = poolsFor(sp, mon);
  const sh = Boolean(mon.is_shadow && rc.prefer_shadow && !args.isMega);
  const bw = Number(rc.bulk_weight ?? 1.0);
  const attackerTypes = new Set((sp.types || []).map((t) => String(t).toLowerCase()));

  // Moves to price: species pool + anything the Pokémon already knows (it may hold event moves).
  const fastIds = Array.from(new Set([...pools.fast, ...(knownFast ? [knownFast.ident] : [])]));
  const chargedIds = Array.from(
    new Set([...pools.charged, ...knownCharged.filter((k) => !k.dead).map((k) => k.ident)]),
  );
  const prepped = prepMoves(dex.pve, dex.moves, fastIds, chargedIds);
  const fastById = new Map<string, PrepFast>(
    prepped.fasts
      .filter((f) => !lockFast || up(f.moveId) === knownFast?.ident)
      .map((f) => [up(f.moveId), f]),
  );
  const chargedById = new Map<string, PrepCharged>(prepped.chargeds.map((c) => [up(c.moveId), c]));

  const atk = (sp.baseStats.atk + mon.a) * CPM[40.0] * (sh ? Number(rc.shadow_dps_bonus ?? 1.2) : 1.0);
  const bulk = raidBulk(sp.baseStats, mon.d, mon.s, sh, bw);
  const dpsOf = (fm: PrepFast, cm: PrepCharged) =>
    atk * bulk * pairDpsPerAtk(fm, cm, attackerTypes, atype, dex.pve.ok);

  // ---- Regular-TM odds (random re-roll: never the same move, never a move already known) -------------
  const knownIdents = new Set(known.map((k) => k.ident));
  const regularFastPool = pools.fast.filter((m) => !pools.elite.has(m) && m !== knownFast?.ident);
  const regularChargedPool = pools.charged.filter((m) => !pools.elite.has(m) && !knownIdents.has(m));
  const regularChargedHits = regularChargedPool.filter((m) => typeOf(dex, m, false) === atype).length;

  // ---- Which Charged slot would a TM overwrite? -------------------------------------------------------
  // A dead Frustration slot can only be overwritten when the user says it is removable (event / purified / done).
  const replaceable = knownCharged.filter((k) => !k.dead || frustrationOk);
  const weakestReplaceable = (): KnownMove | null => {
    if (replaceable.length === 0) return null;
    const rank = (k: KnownMove) => {
      if (k.dead) return -2; // overwrite a removable Frustration first
      const t = k.type === atype ? 1 : 0; // never overwrite an on-type move before an off-type one
      const power = dex.pve.moves[k.ident]?.p ?? 0;
      return t * 1000 + power;
    };
    return [...replaceable].sort((a, b) => rank(a) - rank(b))[0];
  };

  // ---- Enumerate every (fast, charged) pair worth considering ----------------------------------------
  const plans: Plan[] = [];
  for (const [fid, fm] of fastById) {
    const fastKnown = fid === knownFast?.ident;
    const fastElite = pools.elite.has(fid);
    const fastStep: Step = {
      kind: 'fast',
      ident: fid,
      label: moveLabel(fid),
      route: fastKnown ? 'known' : fastElite ? 'elite_tm' : 'tm',
      replaces: fastKnown ? null : knownFast,
      of: regularFastPool.length || 1,
      hit: 1,
    };
    for (const [cid, cm] of chargedById) {
      if (cm.type !== atype) continue; // an off-type Charged Move does nothing for this team
      const chargedKnown = knownCharged.some((k) => k.ident === cid && !k.dead);
      const chargedElite = pools.elite.has(cid);
      const slot = chargedKnown ? null : weakestReplaceable();
      const blocked = !chargedKnown && slot === null && knownCharged.some((k) => k.dead) && !hasSecondSlot;
      const chargedStep: Step = {
        kind: 'charged',
        ident: cid,
        label: moveLabel(cid),
        route: chargedKnown ? 'known' : chargedElite ? 'elite_tm' : 'tm',
        replaces: slot,
        of: regularChargedPool.length || 1,
        hit: regularChargedHits || 1,
      };
      plans.push({
        fast: fastStep,
        charged: chargedStep,
        dps: dpsOf(fm, cm),
        needsElite: fastStep.route === 'elite_tm' || chargedStep.route === 'elite_tm',
        needsRegular: fastStep.route === 'tm' || chargedStep.route === 'tm',
        frustrationBlocked: blocked,
      });
    }
  }
  if (plans.length === 0) return null;

  const currentMoveset = known.map((k) => k.label).join(' / ') || '—';
  const byDps = (a: Plan, b: Plan) => b.dps - a.dps;
  const cost = (p: Plan) => (p.fast.route === 'known' ? 0 : 1) + (p.charged.route === 'known' ? 0 : 1);

  const odds = (hit: number, of: number): string => {
    if (of <= 0) return '';
    if (hit >= of) return of === 1 ? 'guaranteed' : 'any outcome works';
    const avg = of / Math.max(1, hit);
    return `random re-roll · ${hit} of ${of} outcomes work · ~${avg.toFixed(1)} TMs on average`;
  };

  // The TM instruction(s) for a plan, in the exact wording the UI shows.
  const actionsFor = (p: Plan, alt?: Plan): string[] => {
    const lines: string[] = [];
    if (p.fast.route !== 'known') {
      const from = p.fast.replaces ? `TM ${p.fast.replaces.label} → ` : 'TM → ';
      if (p.fast.route === 'elite_tm') {
        lines.push(`${from}${p.fast.label} (Elite Fast TM)`);
      } else {
        const o = p.fast.of <= 1 ? 'guaranteed' : `random re-roll · 1 in ${p.fast.of}`;
        lines.push(`${from}${p.fast.label} (Fast TM, ${o})`);
      }
    }
    if (p.charged.route !== 'known') {
      const from = p.charged.replaces ? `TM ${p.charged.replaces.label} → ` : 'TM → ';
      const regularTxt = (q: Plan) =>
        `${q.charged.label} (Charged TM, ${odds(q.charged.hit, q.charged.of)})`;
      if (p.charged.route === 'elite_tm') {
        let t = `${from}${p.charged.label} (Elite Charged TM)`;
        if (alt && alt.charged.route === 'tm') t += ` or ${regularTxt(alt)}`;
        lines.push(t);
      } else {
        let t = `${from}${regularTxt(p)}`;
        if (alt && alt.charged.route === 'elite_tm') {
          t += ` — or ${alt.charged.label} (Elite Charged TM) for +${Math.round((100 * (alt.dps - p.dps)) / p.dps)}% DPS`;
        }
        lines.push(t);
      }
    }
    return lines;
  };

  // A fix should cost as few TMs as possible: only keep a Fast-move swap if it is worth it
  // (e.g. Rock Throw → Mud Shot is; Mud Shot → Mud Slap on a Pokémon that already has a Ground fast move rarely is).
  const trimFastSwap = (p: Plan): Plan => {
    if (p.fast.route === 'known') return p;
    const keep = plans.find((q) => q.fast.route === 'known' && q.charged.ident === p.charged.ident);
    if (!keep) return p;
    const gain = p.fast.route === 'elite_tm' ? eliteMinGain : tmMinGain;
    return p.dps >= keep.dps * (1 + gain / 100) ? p : keep;
  };

  const bagOk = (p: Plan): boolean => {
    if (!tmBag.known) return true;
    const needFast = p.fast.route === 'tm' ? 1 : 0;
    const needCh = p.charged.route === 'tm' ? 1 : 0;
    const needEFast = p.fast.route === 'elite_tm' ? 1 : 0;
    const needECh = p.charged.route === 'elite_tm' ? 1 : 0;
    return (
      tmBag.fast >= needFast &&
      tmBag.charged >= needCh &&
      tmBag.eliteFast >= needEFast &&
      tmBag.eliteCharged >= needECh
    );
  };

  const finish = (
    status: RaidEntryStatus,
    blocker: RaidBlocker | null,
    p: Plan,
    basis: 'current' | 'after_tm',
    tmActions: string[],
    upgradeHint = '',
  ): RaidAssessment => {
    const label =
      status === 'ready'
        ? 'Ready'
        : status === 'needs_tm'
          ? bagOk(p)
            ? p.needsElite && !p.needsRegular
              ? 'Needs Elite TM'
              : 'Needs TM'
            : p.needsElite && !p.needsRegular
              ? 'Needs Elite TM (none in bag)'
              : 'Needs TM (none in bag)'
          : blocker === 'needs_elite_tm'
            ? 'Cannot fix without Elite TM'
            : blocker === 'frustration'
              ? 'Cannot fix: Frustration'
              : 'Evolve first';
    return {
      status,
      blocker,
      tmInBag: status === 'ready' ? true : bagOk(p),
      dps: p.dps,
      moveset: movesetLabel(p.fast.ident, p.charged.ident),
      basis,
      currentMoveset,
      tmActions,
      upgradeHint,
      statusLabel: label,
      fastLockNote:
        lockFast && knownFast
          ? `Fast move kept (${knownFast.label}): it sets this Pokémon's ${cap(mon.max_type || '')} Max Move`
          : undefined,
    };
  };

  // ---------- 1) READY: best set made only of moves the Pokémon already knows --------------------------
  const readyPlans = plans.filter((p) => cost(p) === 0).sort(byDps);
  if (readyPlans.length > 0 && !evolveFirst && !unreadable) {
    const best = readyPlans[0];
    // Optional upgrade: would a TM be worth it?
    const regular = plans.filter((p) => !p.needsElite && !p.frustrationBlocked && cost(p) > 0).sort(byDps)[0];
    const elite = plans.filter((p) => p.needsElite && !p.frustrationBlocked).sort(byDps)[0];
    let hint = '';
    if (regular && regular.dps > best.dps * (1 + tmMinGain / 100)) {
      hint = `Optional: ${actionsFor(regular, elite && elite.dps > regular.dps * (1 + eliteMinGain / 100) ? elite : undefined).join('; ')} (+${Math.round((100 * (regular.dps - best.dps)) / best.dps)}% DPS)`;
    } else if (elite && elite.dps > best.dps * (1 + eliteMinGain / 100)) {
      hint = `Optional: ${actionsFor(elite).join('; ')} (+${Math.round((100 * (elite.dps - best.dps)) / best.dps)}% DPS)`;
    }
    return finish('ready', null, best, 'current', [], hint);
  }

  // ---------- 2) Not ready: pick the target set ------------------------------------------------------
  const feasible = plans.filter((p) => !p.frustrationBlocked);
  const regularOnly = feasible.filter((p) => !p.needsElite).sort(byDps);
  const eliteBest = feasible.filter((p) => p.needsElite).sort(byDps)[0];

  const prefix: string[] = [];
  if (evolveFirst && mon.species) {
    prefix.push(
      `Evolve ${mon.species.speciesName.replace(/ \(Shadow\)$/, '')} → ${sp.speciesName.replace(/ \(Shadow\)$/, '')} first (moves can change on evolution — re-check afterwards)`,
    );
  }
  if (unreadable) {
    prefix.push('Open it in-game to confirm its moves (a move id in the export was not recognised)');
  }
  const dead = knownCharged.find((k) => k.dead);

  if (regularOnly.length > 0) {
    const target = trimFastSwap(regularOnly[0]);
    const useElite = eliteBest && eliteBest.dps > target.dps * (1 + eliteMinGain / 100) ? eliteBest : undefined;
    const lines = [...prefix, ...actionsFor(target, useElite)];
    if (dead && frustrationOk) {
      lines.unshift('Remove Frustration: use a Charged TM on it (only works during a Team GO Rocket Takeover) or purify it');
    }
    return finish('needs_tm', null, target, 'after_tm', lines);
  }

  if (eliteBest) {
    const eliteTarget = trimFastSwap(eliteBest);
    const lines = [...prefix, ...actionsFor(eliteTarget)];
    const haveElite = !tmBag.known || bagOk(eliteTarget);
    if (haveElite) return finish('needs_tm', null, eliteTarget, 'after_tm', lines);
    return finish('blocked', 'needs_elite_tm', eliteTarget, 'after_tm', [
      ...lines,
      'Cannot be fixed without an Elite Charged TM (or an event that offers one)',
    ]);
  }

  // Everything that would work needs a Charged slot that is stuck on Frustration.
  const stuck = trimFastSwap([...plans].sort(byDps)[0]);
  const chargedAfter = `a Charged TM on that slot → ${stuck.charged.label} (${
    stuck.charged.route === 'elite_tm' ? 'Elite Charged TM' : `Charged TM, ${odds(stuck.charged.hit, stuck.charged.of)}`
  })`;
  const fastAfter = stuck.fast.route === 'known' ? [] : actionsFor({ ...stuck, charged: { ...stuck.charged, route: 'known' } });
  const advice = [
    ...prefix,
    `Frustration is occupying the only Charged slot and cannot be TM'd right now.`,
    `Fix it with ONE of: purify it (Frustration → Return), a Charged TM during a Team GO Rocket Takeover event, or unlock a 2nd Charged Move (Stardust + Candy).`,
    ...fastAfter,
    `Then use ${chargedAfter}`,
  ];
  return finish('blocked', 'frustration', stuck, 'after_tm', advice);
}

export const RAID_STATUS_ORDER: Record<RaidEntryStatus, number> = {
  ready: 0,
  needs_tm: 1,
  blocked: 2,
};

/** Display-friendly "ground" → "Ground". */
export const typeLabel = cap;

