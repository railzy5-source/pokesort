import { buildRowCosts } from './costTables';
import {
  BASE_CUPS,
  cleanSpeciesName,
  GMAX_MOVE_POWER,
  GRADE_TYPE_IMPORTANCE,
  GRADE_WEIGHTS,
  HOLD_LABELS,
  LEAGUE_NAMES,
  MAX_BATTLE_TYPES,
  MAX_MOVE_POWER,
  normStr,
  OUT_OF_PLAY,
  RAID_USEFUL_TYPES,
  SIZE_LABELS,
  VERDICT_ORDER,
} from './defaultConfig';
import {
  type CoverageState,
  getAux,
  type MonAux,
  type PlacementSummary,
} from './placementAndGates';
import { accField, displaySpecies, ingameSearch, ivStr, resolveAccount } from './pgsParser';
import {
  assessRaidMon,
  RAID_STATUS_ORDER,
  tmBagFrom,
  type RaidAssessment,
} from './raidMoveEval';
import {
  auditSavedBattleParties,
  buildCombatant,
  type Combatant,
  evaluatePvPokeTeamOverview,
  precomputePvPokeCandidateMatrix,
  pvpokeLetterGrade,
  type PvPokeTeamOverview,
  scorePrecomputedTriplePvPoke,
  scoreTeamBattleCoverage,
} from './battleSim';
import {
  analyzeEggs,
  buildBottleCapRecommendations,
  buildBuddyTracker,
  buildMassTransferChunks,
  buildSafeSearchChunks,
  buildTagAudit,
  buildTradeMatcher,
  evaluateBuildReadiness,
  evaluateTagConflicts,
  extractBagResources,
  requiredEvolutionItem,
} from './accountFeatures';
import {
  buildBattleMvps,
  buildBuddyPoffinPlan,
  buildEeveeTracker,
  buildGblSummary,
  buildItemsAndStorageAudit,
  buildLiveGymsData,
  buildMedalsHub,
  buildMegaOptimizer,
  buildOriginProtectionSummary,
  buildXpLevelPlan,
} from './accountHub';
import { buildCuratedMegaStatus, type CuratedMegaTypeRow } from './megaCurated';
import {
  currentMoves,
  Dex,
  estimatedMegaDps,
  estimatedRaidDps,
  maxMoveGainPct,
  moveIdent,
  moveLabel,
  movesNeeded,
  pickRaidMoveset,
  raidMovesetCandidates,
  readinessFields,
  readinessSummary,
  refDps,
  showcaseScore,
  type SizeContext,
  spName,
  typeEff,
} from './pveModel';
import type {
  AuditCheck,
  BagResources,
  BriefingData,
  BriefingEventItem,
  BuddyTrackerData,
  CupDef,
  EliteTmRoiItem,
  EvolveItem,
  GradeComponent,
  HoldBucket,
  LastLookItem,
  LeagueTeamsBlock,
  LevelTheseItem,
  MaxTeamTypeBlock,
  MegaBoostEntry,
  MegaPriorityEntry,
  MonModel,
  PogoConfig,
  PriorityEntry,
  RaidTeamEntry,
  RaidTeamTypeBlock,
  RawPokemon,
  RemoteGameData,
  ReportJson,
  ReportMon,
  ReviewTriageItem,
  SafeTransferBatch,
  ShowcaseRow,
  TeamCohesion,
  TeamCohesionHole,
  TeamMemberReport,
  TransferGroup,
  WishlistCopyBrief,
  WishlistRow,
} from './types';

function isOutOfPlay(m: MonModel): boolean {
  return OUT_OF_PLAY.has(m.verdict);
}

function cohesionLetter(score: number): string {
  return pvpokeLetterGrade(score, 100);
}

function buildTeamCohesionFromPvPoke(
  members: { m: MonModel; e: NonNullable<MonModel['best_pvp']> }[],
  pv: PvPokeTeamOverview,
  threatsTotal: number,
): TeamCohesion {
  const seenTypes = new Set<string>();
  let sharedCount = 0;
  let totalTypeSlots = 0;
  const roleMap: Record<string, string> = {};
  const rolePool = ['lead', 'closer', 'switch'];
  members.forEach((mem, idx) => {
    roleMap[mem.m.uid] = idx < rolePool.length ? rolePool[idx] : 'flex';
    for (const t of mem.m.species?.types || []) {
      const tl = t.toLowerCase();
      if (!tl || tl === 'none') continue;
      totalTypeSlots++;
      if (seenTypes.has(tl)) sharedCount++;
      seenTypes.add(tl);
    }
  });
  const typeOverlap = totalTypeSlots > 0 ? Math.round((100 * sharedCount) / totalTypeSlots) : 0;

  const holes: TeamCohesionHole[] = pv.topThreats.map((th) => ({
    name: th.name,
    victims: th.beats.length,
    threat_rank: th.rank,
    beats: th.beats,
    beaten_by: th.beatenBy,
  }));
  const sweep = pv.topThreats
    .filter((th) => th.beats.length === members.length)
    .map((th) => th.name);

  return {
    score: pv.score,
    grade: pv.grade,
    coverage_pct: pv.coveragePct,
    coverage_known_pct: pv.coveragePct,
    covered: pv.coveragePct,
    known: 100,
    unknown: 0,
    threats: threatsTotal,
    backup_pct: pv.safetyScore,
    consistency: pv.consistencyScore,
    bulk_pct: pv.bulkPct,
    bulk_goal: pv.bulkGoal,
    type_overlap: typeOverlap,
    roles: roleMap,
    parts: {
      Coverage: Math.round((pv.coveragePct / 100) * 100) / 100,
      Bulk: Math.round((pv.bulkPct / 100) * 100) / 100,
      Safety: Math.round((pv.safetyScore / 98) * 100) / 100,
      Consistency: Math.round((pv.consistencyScore / 98) * 100) / 100,
    },
    holes: holes.slice(0, 8),
    sweep,
    coverage_note: `PvPoke Threat Score ${pv.threatScore} (${pv.coverageGrade}) · Bulk ${pv.bulkGrade} · Safety ${pv.safetyGrade} · Consistency ${pv.consistencyGrade}`,
    threat_score: pv.threatScore,
    pvpoke_grades: {
      coverage: pv.coverageGrade,
      bulk: pv.bulkGrade,
      safety: pv.safetyGrade,
      consistency: pv.consistencyGrade,
    },
    safety_score: pv.safetyScore,
    consistency_score: pv.consistencyScore,
    avg_bulk: pv.avgBulk,
  };
}

export function scoreTeamCohesion(
  members: { m: MonModel; e: NonNullable<MonModel['best_pvp']> }[],
  capOrCup: number | string,
  dex: Dex,
): TeamCohesion {
  const cap = typeof capOrCup === 'number' ? capOrCup : BASE_CUPS[capOrCup]?.cap ?? 1500;
  const combatants: Combatant[] = [];
  for (const mem of members) {
    const baseSid = mem.e.sid.replace(/_shadow$/, '');
    const sp = dex.byId.get(baseSid) || mem.m.species;
    if (!sp) continue;
    combatants.push(
      buildCombatant(sp, mem.m.a, mem.m.d, mem.m.s, mem.e.target_level, mem.m.is_shadow, dex, capOrCup, mem.m),
    );
  }
  const pv = evaluatePvPokeTeamOverview(combatants, capOrCup, cap, dex);
  const threats = dex.threats.get(capOrCup) || [];
  return buildTeamCohesionFromPvPoke(members, pv, threats.length);
}

function buildTeamsForKey(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  key: number | string,
  leagueLabel: string,
  cap: number,
  isCup: boolean,
): LeagueTeamsBlock {
  const ptCfg = cfg.pvp_teams;
  const perLeague = Number(ptCfg.top_n ?? 5);
  const maxRank = Number(ptCfg.species_rank_max ?? 200);
  const maxIvRank = Math.min(50, Number(cfg.pvp?.keep_iv_rank ?? 50), Number(ptCfg.iv_rank_max ?? 50));

  const pool: { m: MonModel; e: NonNullable<MonModel['best_pvp']> }[] = [];
  for (const m of mons) {
    if (isOutOfPlay(m) || !m.species) continue;
    const entries = isCup ? m.cup_pvp : m.pvp;
    const hit = entries.find(
      (e) =>
        (isCup ? e.cup === key : e.cap === key) &&
        e.eligible &&
        e.species_rank <= maxRank &&
        (cap >= 10000 || e.iv_rank <= maxIvRank),
    );
    if (hit) pool.push({ m, e: hit });
  }
  pool.sort((a, b) => a.e.composite - b.e.composite || b.m.cp - a.m.cp);

  // Deduplicate by target speciesId (e.sid) so catching duplicate copies never crowds other species out of topPool
  const seenSids = new Set<string>();
  const dedupedPool: typeof pool = [];
  for (const item of pool) {
    if (seenSids.has(item.e.sid)) continue;
    seenSids.add(item.e.sid);
    dedupedPool.push(item);
  }

  const topPool = dedupedPool.slice(0, Math.min(24, dedupedPool.length));
  const topCombatants: Combatant[] = topPool.map((item) => {
    const baseSid = item.e.sid.replace(/_shadow$/, '');
    const sp = dex.byId.get(baseSid) || item.m.species!;
    return buildCombatant(
      sp,
      item.m.a,
      item.m.d,
      item.m.s,
      item.e.target_level,
      item.m.is_shadow,
      dex,
      key,
      item.m,
    );
  });

  const pre =
    topPool.length >= 3 ? precomputePvPokeCandidateMatrix(topCombatants, key, dex, 40) : null;
  const threatsTotal = (dex.threats.get(key) || []).length;
  const cupKey = isCup ? String(key) : undefined;

  const teams: LeagueTeamsBlock['teams'] = [];
  const usedTriples = new Set<string>();
  const usedMonsCount = new Map<string, number>();

  for (let t = 0; t < perLeague && topPool.length >= 3 && pre; t++) {
    let bestTriple: typeof pool | null = null;
    let bestOverview: PvPokeTeamOverview | null = null;
    let bestScore = -1e9;

    for (let i = 0; i < topPool.length; i++) {
      for (let j = i + 1; j < topPool.length; j++) {
        if (topPool[i].m.dex === topPool[j].m.dex) continue;
        for (let k = j + 1; k < topPool.length; k++) {
          if (topPool[k].m.dex === topPool[i].m.dex || topPool[k].m.dex === topPool[j].m.dex) {
            continue;
          }
          const trio = [topPool[i], topPool[j], topPool[k]];
          const sig = trio.map((x) => x.m.uid).sort().join('|');
          if (usedTriples.has(sig)) continue;

          const pv = scorePrecomputedTriplePvPoke(
            [i, j, k],
            [topCombatants[i], topCombatants[j], topCombatants[k]],
            pre,
            cap,
            cupKey,
          );
          const reusePenalty = trio.reduce((s, x) => s + (usedMonsCount.get(x.m.uid) || 0) * 6, 0);
          // Small rank tiebreaker (max ~0.2) so meta quality breaks exact ties without overriding PvPoke grade
          const rankTie = trio.reduce((s, x) => s + Math.max(0, 60 - x.e.species_rank) * 0.001, 0);
          const net = pv.score - reusePenalty + rankTie;
          if (net > bestScore) {
            bestScore = net;
            bestTriple = trio;
            bestOverview = pv;
          }
        }
      }
    }

    if (!bestTriple || !bestOverview) break;
    const bestCohesion = buildTeamCohesionFromPvPoke(bestTriple, bestOverview, threatsTotal);
    const sig = bestTriple.map((x) => x.m.uid).sort().join('|');
    usedTriples.add(sig);
    for (const x of bestTriple) {
      usedMonsCount.set(x.m.uid, (usedMonsCount.get(x.m.uid) || 0) + 1);
    }

    // Run A:4 PvPoke battle.js 3-member simulation for Lead/Safe-Swap/Closer & Archetype
    const simCov = scoreTeamBattleCoverage(
      bestTriple.map((x) => ({
        m: x.m,
        targetSid: x.e.sid,
        targetLvl: x.e.target_level,
      })),
      key,
      dex,
    );
    bestCohesion.archetype = simCov.archetype;
    bestCohesion.battle_win_0v0 = simCov.win0v0;
    bestCohesion.battle_win_1v1 = simCov.win1v1;
    bestCohesion.battle_win_2v2 = simCov.win2v2;

    const members: TeamMemberReport[] = bestTriple.map((x) => {
      const br = simCov.rolesByUid.get(x.m.uid);
      return {
        id: x.m.uid,
        name: cleanSpeciesName(x.e.name),
        cp: x.m.cp,
        iv: ivStr(x.m),
        sp_rank: x.e.species_rank,
        iv_rank: x.e.iv_rank,
        level: x.e.target_level,
        target_cp: x.e.target_cp,
        shadow: x.m.is_shadow,
        mega: x.m.is_mega_capable,
        evolve_from:
          x.m.species && x.e.sid.replace(/_shadow$/, '') !== x.m.species.speciesId
            ? cleanSpeciesName(x.m.species.speciesName)
            : null,
        role: bestCohesion.roles[x.m.uid] || 'flex',
        roles: dex.roleScores(key, x.e.sid),
        battle_role: br?.battle_role,
        switch_win_rate: br?.switch_win_rate,
      };
    });

    // Order team members Lead -> Safe Swap -> Closer cleanly
    const roleOrder = { lead: 0, safe_swap: 1, closer: 2 };
    members.sort((a, b) => (roleOrder[a.battle_role || 'closer'] ?? 2) - (roleOrder[b.battle_role || 'closer'] ?? 2));

    teams.push({
      n: t + 1,
      members,
      score: Math.round(bestScore * 10) / 10,
      cohesion: bestCohesion,
    });
  }

  return {
    league: leagueLabel,
    cap,
    teams,
    threats: (dex.threats.get(key) || []).slice(0, 20).map(([sid, rank]) => ({
      species: spName(dex, sid, sid),
      rank,
    })),
    threat_source: dex.matchupSource.get(key) || 'rankings',
    threat_note: '',
  };
}

export function buildPvpTeams(mons: MonModel[], dex: Dex, cfg: PogoConfig, caps: number[]): LeagueTeamsBlock[] {
  return caps.map((cap) => buildTeamsForKey(mons, dex, cfg, cap, LEAGUE_NAMES[cap] || `${cap}`, cap, false));
}

export function buildCupTeams(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  cups: Record<string, CupDef>,
): Record<string, LeagueTeamsBlock> {
  const out: Record<string, LeagueTeamsBlock> = {};
  for (const [cupName, spec] of Object.entries(cups)) {
    out[cupName] = buildTeamsForKey(mons, dex, cfg, cupName, spec.title || cupName, spec.cap, true);
  }
  return out;
}

interface MegaTeamCandidate {
  mon: MonModel;
  megaSid: string;
  name: string;
  cp: number;
  iv: string;
  dps: number;
  active: boolean;
  from: string;
  unlocked: boolean;
}

function findMegaCandidateForType(mons: MonModel[], dex: Dex, atype: string): MegaTeamCandidate | null {
  const cands: MegaTeamCandidate[] = [];
  for (const m of mons) {
    if (isOutOfPlay(m) || m.is_shadow || !m.species) continue;
    const sidPool = Array.from(
      new Set(
        [m.mega_sid, ...dex.familyMegaInfo(m.species.speciesId)].filter(
          (x): x is string => Boolean(x),
        ),
      ),
    );
    for (const megaSid of sidPool) {
      const boosts = dex.megaBoostTypes(megaSid);
      if (!boosts.includes(atype)) continue;
      const dps = estimatedMegaDps(m, dex, atype, megaSid) ?? 0;
      if (dps <= 0) continue;
      cands.push({
        mon: m,
        megaSid,
        name: spName(dex, megaSid),
        cp: m.cp,
        iv: ivStr(m),
        dps,
        active: m.is_currently_mega,
        from: cleanSpeciesName(m.species.speciesName),
        unlocked: m.has_mega_unlocked,
      });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => {
    const aUn = a.unlocked ? 1 : 0;
    const bUn = b.unlocked ? 1 : 0;
    const aReady = a.mon.level >= 25 ? 1 : 0;
    const bReady = b.mon.level >= 25 ? 1 : 0;
    return (
      bUn - aUn ||
      b.mon.mega_level - a.mon.mega_level ||
      b.dps * (1 + bReady * 0.04) - a.dps * (1 + aReady * 0.04) ||
      b.mon.iv_pct - a.mon.iv_pct
    );
  });
  return cands[0];
}

export function findMegaForType(mons: MonModel[], dex: Dex, atype: string): RaidTeamTypeBlock['mega'] {
  const top = findMegaCandidateForType(mons, dex, atype);
  if (!top) return null;
  return {
    id: top.mon.uid,
    name: top.name,
    cp: top.cp,
    iv: top.iv,
    dps: Math.round(top.dps * 100) / 100,
    active: top.active,
    from: top.from,
  };
}

function raidSlotOrderScore(m: MonModel, dps: number, targetSid: string | null): number {
  const isEvolved = Boolean(m.species && (!targetSid || targetSid === m.species.speciesId));
  const evoFactor = isEvolved ? 1.08 : 1.0;
  const lvFactor = m.level >= 35 ? 1.08 : m.level >= 25 ? 1.04 : m.level >= 20 ? 1.0 : 0.90;
  return dps * evoFactor * lvFactor;
}

export function buildRaidTeams(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  bag?: BagResources | null,
): RaidTeamTypeBlock[] {
  const teamSize = Number(cfg.raid.keep_per_type ?? 6);
  const backupSize = Number(cfg.raid.reserve_keep ?? 2);
  const tmBag = tmBagFrom(bag);
  // Spares / TM backfill must still be a real attacker: at least this % of the best of the type.
  const spareFloor = Number(cfg.raid.spare_min_pct ?? 65);
  // How deep into the species ranking of a type an owned Pokémon is still considered.
  const speciesRankCap = Math.max(30, Number(cfg.raid.top_n_species ?? 20));

  return RAID_USEFUL_TYPES.map((atype) => {
    const megaCand = findMegaCandidateForType(mons, dex, atype);
    const mega = megaCand
      ? {
          id: megaCand.mon.uid,
          name: megaCand.name,
          cp: megaCand.cp,
          iv: megaCand.iv,
          dps: Math.round(megaCand.dps * 100) / 100,
          active: megaCand.active,
          from: megaCand.from,
        }
      : null;

    const megaUid = megaCand?.mon.uid || null;
    const entries: RaidTeamEntry[] = [];
    const usedUids = new Set<string>();
    // DPS is vs a defender weak to `atype`, so the reference "best of type" is on the same scale.
    const ref = refDps(dex, dex.raidRankings, atype, true) || 1;

    // Slot 1 MUST be the Mega (if owned) so its Mega eDPS counts toward team damage
    if (megaCand) {
      const m = megaCand.mon;
      usedUids.add(m.uid);
      const megaSp = dex.byId.get(megaCand.megaSid) || m.species;
      const a = megaSp
        ? assessRaidMon({ mon: m, species: megaSp, dex, cfg, teamType: atype, tmBag, isMega: true })
        : null;
      let megaMoveSuggested = m.moveset || '';
      let megaMoveNote = m.moveset_note || '';
      if (a) {
        megaMoveSuggested = a.moveset;
        megaMoveNote = a.tmActions.join(' · ') || a.upgradeHint;
      } else if (megaSp) {
        const [mv, note] = pickRaidMoveset(dex.pve, m, dex, megaSp, atype, false, cfg);
        if (mv) megaMoveSuggested = mv;
        megaMoveNote = note;
      }
      const evoTargetSid = m.is_mega_pre_evo
        ? megaCand.megaSid.replace(/_mega(_x|_y)?$|_primal$/, '')
        : null;
      const evoTargetName = evoTargetSid ? spName(dex, evoTargetSid) : '';

      entries.push({
        id: m.uid,
        slot: 'team',
        slot_num: 1,
        is_mega: true,
        name: megaCand.name,
        cp: m.cp,
        iv: ivStr(m),
        dps: Math.round((a ? a.dps : megaCand.dps) * 100) / 100,
        level: Math.round(m.level * 10) / 10,
        shadow: false,
        moveset: currentMoves(dex.pve, m).map((mv) => mv.name).join(' / ') || megaMoveSuggested || '—',
        moveset_suggested: megaMoveSuggested,
        moveset_note: megaMoveNote,
        verdict: m.verdict,
        from: megaCand.from,
        evolve_to: evoTargetName,
        status: a?.status,
        status_label: a?.statusLabel,
        blocker: a?.blocker ?? null,
        tm_in_bag: a?.tmInBag,
        tm_actions: a?.tmActions,
        dps_moveset: a?.moveset,
        dps_basis: a?.basis,
        upgrade_hint: a?.upgradeHint || undefined,
      });
    }

    // ------------------------------------------------------------------
    // Score every owned Pokémon (and each evolution it could become) as an attacker for THIS type,
    // using the moves it actually knows. Keep the best (status, then score) per Pokémon.
    // ------------------------------------------------------------------
    interface AttackerCand {
      mon: MonModel;
      sid: string;
      a: RaidAssessment;
      score: number;
      pct: number;
      primary: boolean;
    }
    const cands: AttackerCand[] = [];
    for (const m of mons) {
      if (isOutOfPlay(m) || m.uid === megaUid || !m.species) continue;
      let best: AttackerCand | null = null;
      for (const d of dex.descendants(m.species.speciesId)) {
        const hit = dex.raidPos.get(atype)?.get(d);
        if (!hit || hit[0] > speciesRankCap) continue;
        const sp = dex.byId.get(d);
        if (!sp) continue;
        const a = assessRaidMon({ mon: m, species: sp, dex, cfg, teamType: atype, tmBag });
        if (!a || a.dps <= 0) continue;
        const cand: AttackerCand = {
          mon: m,
          sid: d,
          a,
          score: raidSlotOrderScore(m, a.dps, d),
          pct: (100 * a.dps) / ref,
          primary: m.raid_type === atype,
        };
        if (
          !best ||
          RAID_STATUS_ORDER[a.status] < RAID_STATUS_ORDER[best.a.status] ||
          (a.status === best.a.status && cand.score > best.score)
        ) {
          best = cand;
        }
      }
      if (best) cands.push(best);
    }

    const byScore = (x: AttackerCand, y: AttackerCand) =>
      y.score - x.score || y.mon.iv_pct - x.mon.iv_pct;
    const byTmReadiness = (x: AttackerCand, y: AttackerCand) =>
      Number(y.a.tmInBag) - Number(x.a.tmInBag) || byScore(x, y);

    const ready = cands.filter((c) => c.a.status === 'ready');
    // Ready attackers are ranked purely by their type-effective DPS with the moves they know RIGHT NOW,
    // regardless of which type the global placement optimiser gave them as a "home" - the moves are the truth
    // (e.g. a Rhyperior with Earthquake is a Ground attacker today, even if its home type is Rock).
    const readySorted = [...ready].sort(byScore);
    // TM backfill (only used if fewer than 8 Pokémon are ready): ONLY Pokémon you could fix right now because the
    // needed TM is in your bag, and only for their home type (so one Pokémon doesn't show up as "needs a TM" on
    // every team). Anything that needs a TM you don't own waits in the fix queue instead of squatting a slot.
    const tmBackfill = cands
      .filter((c) => c.a.status === 'needs_tm' && c.a.tmInBag && c.primary && c.pct >= spareFloor)
      .sort(byTmReadiness);

    // Order of preference for the slots: ready (by DPS) → needs-a-TM (home type).
    // A ready Pokémon ALWAYS outranks one that still needs a TM, so you see what you can field right now.
    const ordered = [...readySorted, ...tmBackfill];

    const placedUids = new Set<string>();
    for (const c of ordered) {
      if (entries.length >= teamSize + backupSize) break;
      const m = c.mon;
      if (usedUids.has(m.uid)) continue;
      const slotNum = entries.length + 1;
      // Spares must clear the DPS floor so a weak off-meta mon can't squat a spare slot.
      if (slotNum > teamSize && c.pct < spareFloor) continue;
      usedUids.add(m.uid);
      placedUids.add(m.uid);
      entries.push(raidEntryFrom(c, slotNum <= teamSize ? 'team' : 'backup', slotNum, dex));
    }

    // Everything else that is worth fixing, best first: TM in bag → TM needed. Blocked ones (Elite TM / Frustration /
    // event) get their own reserved rows so they never get pushed out by the easy fixes.
    const worth = cands.filter((c) => c.a.status !== 'ready' && !placedUids.has(c.mon.uid) && c.pct >= spareFloor);
    const fixable = worth.filter((c) => c.a.status === 'needs_tm').sort(byTmReadiness).slice(0, 8);
    const stuck = worth.filter((c) => c.a.status === 'blocked').sort(byScore).slice(0, 4);
    const fixQueue = [...fixable, ...stuck].map((c) => raidEntryFrom(c, 'backup', 0, dex));

    return {
      type: atype,
      mega,
      entries,
      fix_queue: fixQueue,
      status_counts: {
        ready: ready.length,
        needs_tm: cands.filter((c) => c.a.status === 'needs_tm' && c.pct >= spareFloor).length,
        blocked: cands.filter((c) => c.a.status === 'blocked' && c.pct >= spareFloor).length,
      },
    };
  });
}

function raidEntryFrom(
  c: {
    mon: MonModel;
    sid: string;
    a: RaidAssessment;
  },
  slotKind: 'team' | 'backup',
  slotNum: number,
  dex: Dex,
): RaidTeamEntry {
  const m = c.mon;
  const evolveTo =
    m.species && c.sid && c.sid !== m.species.speciesId ? spName(dex, c.sid) : m.evolve_to;
  const note = c.a.tmActions.join(' · ') || c.a.upgradeHint;
  return {
    id: m.uid,
    slot: slotKind,
    slot_num: slotNum || undefined,
    is_mega: false,
    name: evolveTo || displaySpecies(m),
    cp: m.cp,
    iv: ivStr(m),
    dps: Math.round(c.a.dps * 100) / 100,
    level: Math.round(m.level * 10) / 10,
    shadow: m.is_shadow,
    moveset: c.a.currentMoveset,
    moveset_suggested: c.a.moveset,
    moveset_note: note,
    verdict: m.verdict,
    from: evolveTo && m.species ? cleanSpeciesName(m.species.speciesName) : '',
    evolve_to: evolveTo,
    status: c.a.status,
    status_label: c.a.statusLabel,
    blocker: c.a.blocker,
    tm_in_bag: c.a.tmInBag,
    tm_actions: c.a.tmActions,
    dps_moveset: c.a.moveset,
    dps_basis: c.a.basis,
    upgrade_hint: c.a.upgradeHint || undefined,
  };
}

export function buildMaxTeams(mons: MonModel[], dex: Dex, cfg: PogoConfig): MaxTeamTypeBlock[] {
  const teamSize = Number(cfg.max_battle.keep_per_type ?? 4);
  return MAX_BATTLE_TYPES.map((atype) => {
    const cands = mons
      .filter(
        (m) =>
          !isOutOfPlay(m) &&
          (m.is_dynamax || m.is_gigantamax) &&
          m.max_type === atype &&
          m.max_dps > 0,
      )
      .sort((a, b) => b.max_dps - a.max_dps || b.iv_pct - a.iv_pct);

    const entries = cands.slice(0, teamSize).map((m) => {
      const fastSet = dex.maxSets.get(`${m.max_sid || m.species?.speciesId}|${atype}`);
      return {
        id: m.uid,
        name: m.evolve_to || displaySpecies(m),
        cp: m.cp,
        iv: ivStr(m),
        iv_pct: m.iv_pct,
        dps: Math.round(m.max_dps * 100) / 100,
        gmax: m.is_gigantamax,
        fast: fastSet?.[0] ? moveLabel(fastSet[0]) : 'Max Attack',
      };
    });

    return { type: atype, entries };
  });
}

export function maxSupportPicks(mons: MonModel[], dex: Dex): ReportJson['max_battle'] {
  const dmax = mons.filter((m) => !isOutOfPlay(m) && (m.is_dynamax || m.is_gigantamax) && m.species);
  const gmaxCount = dmax.filter((m) => m.is_gigantamax).length;
  let guardUnlocked = 0;
  let spiritUnlocked = 0;
  const attLevels: Record<string, number> = { '1': 0, '2': 0, '3': 0 };
  const attackers = dmax.filter((m) => m.max_type);
  let below3 = 0;
  let gainSum = 0;

  for (const m of dmax) {
    if (m.max_guard_level > 0) guardUnlocked++;
    if (m.max_spirit_level > 0) spiritUnlocked++;
  }
  for (const m of attackers) {
    const lv = Math.min(3, Math.max(1, m.max_attack_level || 1));
    attLevels[String(lv)] = (attLevels[String(lv)] || 0) + 1;
    if (lv < 3) {
      below3++;
      gainSum += maxMoveGainPct(m);
    }
  }

  const scored = dmax.map((m) => {
    const desc = dex.descendants(m.species!.speciesId);
    let bestTarget = m.species!;
    let bestBulk = (bestTarget.baseStats.def + m.d) * (bestTarget.baseStats.hp + m.s);
    for (const d of desc) {
      if (!dex.canDynamax(d)) continue;
      const sp = dex.byId.get(d);
      if (!sp) continue;
      const b = (sp.baseStats.def + m.d) * (sp.baseStats.hp + m.s);
      if (b > bestBulk) {
        bestBulk = b;
        bestTarget = sp;
      }
    }
    const maxHp = Math.round((bestTarget.baseStats.hp + m.s) * 0.79);
    const evoTarget =
      bestTarget.speciesId !== m.species!.speciesId ? cleanSpeciesName(bestTarget.speciesName) : '';
    return { m, bestBulk, maxHp, evoTarget };
  });

  scored.sort((a, b) => b.bestBulk - a.bestBulk);
  const topBulk = scored[0]?.bestBulk || 1;
  const topHp = Math.max(...scored.map((x) => x.maxHp), 1);

  const tanks = scored.slice(0, 6).map((x) => ({
    id: x.m.uid,
    species: displaySpecies(x.m),
    evolves_to: x.evoTarget,
    iv: ivStr(x.m),
    cp: x.m.cp,
    level: Math.round(x.m.level * 10) / 10,
    verdict: x.m.verdict,
    unlocked: x.m.max_guard_level > 0,
    move_level: x.m.max_guard_level,
    score: Math.round(x.bestBulk),
    pct_of_best: Math.round((100 * x.bestBulk) / topBulk),
    need: x.m.max_guard_level > 0 ? '' : 'Unlock Max Guard',
  }));

  const byHp = [...scored].sort((a, b) => b.maxHp - a.maxHp);
  const healers = byHp.slice(0, 6).map((x) => ({
    id: x.m.uid,
    species: displaySpecies(x.m),
    evolves_to: x.evoTarget,
    iv: ivStr(x.m),
    cp: x.m.cp,
    level: Math.round(x.m.level * 10) / 10,
    verdict: x.m.verdict,
    unlocked: x.m.max_spirit_level > 0,
    move_level: x.m.max_spirit_level,
    score: Math.round(x.maxHp),
    pct_of_best: Math.round((100 * x.maxHp) / topHp),
    need: x.m.max_spirit_level > 0 ? '' : 'Unlock Max Spirit',
  }));

  return {
    dynamax: dmax.length,
    gigantamax: gmaxCount,
    attack_levels: attLevels,
    guard_unlocked: guardUnlocked,
    spirit_unlocked: spiritUnlocked,
    gain_pct: below3 > 0 ? Math.round((gainSum / below3) * 10) / 10 : 0,
    attackers: attackers.length,
    attackers_below_3: below3,
    tanks,
    healers,
    power_table: {
      max: MAX_MOVE_POWER,
      gmax: GMAX_MOVE_POWER,
    },
  };
}

export function buildMegaSection(
  mons: MonModel[],
  dex: Dex,
  auxMap: Map<string, MonAux>,
): { priority: MegaPriorityEntry[]; boost: MegaBoostEntry[] } {
  const priority: MegaPriorityEntry[] = [];
  const boostByType = new Map<string, MegaBoostEntry>();

  const megas = mons
    .filter((m) => !isOutOfPlay(m) && (getAux(auxMap, m).mega_home || m.verdict === 'BUILD_MEGA') && m.mega_sid)
    .sort((a, b) => {
      const aUn = a.has_mega_unlocked ? 1 : 0;
      const bUn = b.has_mega_unlocked ? 1 : 0;
      return bUn - aUn || b.mega_level - a.mega_level || b.iv_pct - a.iv_pct;
    });

  for (const m of megas) {
    const form = spName(dex, m.mega_sid);
    const boostTypes = dex.megaBoostTypes(m.mega_sid);
    const tags: string[] = [];
    if (m.has_mega_unlocked) {
      tags.push(`Mega Lv${Math.max(1, m.mega_level)}`);
      if (m.mega_forms.length > 0 && (m.dex === 6 || m.dex === 150)) {
        const xy = m.mega_forms.map((f) => (f === 2 ? 'X' : f === 3 ? 'Y' : String(f))).join('/');
        tags.push(`Form ${xy}`);
      }
    } else tags.push('Ready to Mega');
    if (boostTypes.length > 0) tags.push(`boosts ${boostTypes.join(' / ')}`);

    priority.push({
      id: m.uid,
      form,
      mine: displaySpecies(m),
      cp: m.cp,
      iv: ivStr(m),
      iv_pct: m.iv_pct,
      tags,
    });

    const dps = Math.round((estimatedMegaDps(m, dex) ?? 0) * 10) / 10;
    for (const bt of boostTypes) {
      const cur = boostByType.get(bt);
      if (!cur || dps > cur.dps) {
        boostByType.set(bt, { type: bt, form, cp: m.cp, iv: ivStr(m), dps });
      }
    }
  }

  return {
    priority: priority.slice(0, 40),
    boost: RAID_USEFUL_TYPES.filter((t) => boostByType.has(t)).map((t) => boostByType.get(t)!),
  };
}

export function buildShowcase(mons: MonModel[], sizeCtx: SizeContext): ReportJson['showcase'] {
  const rows: ShowcaseRow[] = [];
  let xxlCount = 0;
  let accurateCount = 0;
  let activeContestCount = 0;
  let legacyUnknownCount = 0;

  for (const m of mons) {
    if (m.raw.size === 5) xxlCount++;
    if (m.in_contest) activeContestCount++;
    if (m.legacy_size_unknown) legacyUnknownCount++;
    const res = showcaseScore(sizeCtx, m);
    if (!res) continue;
    if (res.accurate) accurateCount++;
    rows.push({
      id: m.uid,
      species: displaySpecies(m),
      dex: m.dex,
      score: res.score,
      height_score: res.height_score,
      weight_score: res.weight_score,
      iv_score: res.iv_score,
      xxl_bonus: res.xxl_bonus,
      height: Number(m.raw.heightM || 0),
      weight: Number(m.raw.weightKg || 0),
      size: m.legacy_size_unknown ? 'Legacy?' : SIZE_LABELS[Number(m.raw.size || 0)] || 'Normal',
      size_code: Number(m.raw.size || 0),
      iv: ivStr(m),
      cp: m.cp,
      verdict: m.verdict,
      accurate: res.accurate,
      k: res.k,
      pct_of_max: Math.min(100, Math.round((100 * res.score) / 1178)),
      in_contest: m.in_contest,
      contest_end_ms: m.contest_end_ms,
      legacy_size_unknown: m.legacy_size_unknown,
    });
  }

  rows.sort((a, b) => Number(Boolean(b.in_contest)) - Number(Boolean(a.in_contest)) || b.score - a.score);
  const bySpMap = new Map<string, ShowcaseRow>();
  for (const r of rows) {
    if (!bySpMap.has(r.species)) bySpMap.set(r.species, r);
  }

  return {
    enabled: true,
    formula: 'Height(800) + Weight(150) + IV(50) + XXL Bonus(178)',
    max_score: 1178,
    size_table_ok: sizeCtx.ok,
    accurate_count: accurateCount,
    xxl_count: xxlCount,
    scored_count: rows.length,
    active_contest_count: activeContestCount,
    legacy_unknown_count: legacyUnknownCount,
    rows: rows.slice(0, 120),
    best_per_species: Array.from(bySpMap.values()).slice(0, 60),
  };
}

function lookFlags(m: MonModel, monsByDex: Map<number, MonModel[]>): [string[], string[]] {
  const triggers: string[] = [];
  const notes: string[] = [];
  if (m.iv_pct >= 93) triggers.push(`high IV (${m.iv_pct}%)`);
  if (m.level >= 30) triggers.push(`high level (L${m.level})`);
  if (m.is_shadow) triggers.push('Shadow');
  if (m.is_purified) triggers.push('Purified');
  if (m.has_third_move) triggers.push('3rd move unlocked');
  if (m.year !== null && m.year <= 2019) triggers.push(`old (${m.year})`);
  const gymTotal = m.battles_attacked + m.battles_defended;
  if (gymTotal >= 10) triggers.push(`${gymTotal} gym/raid battles`);
  if (m.pvp_battles >= 5) triggers.push(`${m.pvp_battles} PvP battles`);
  if (m.caught_in_party) triggers.push('caught in party');
  const peers = monsByDex.get(m.dex) || [];
  if (peers.filter((p) => !isOutOfPlay(p)).length === 0) {
    triggers.push('only copy of species');
    notes.push('Transferring this removes your last copy of this species.');
  }
  return [triggers, notes];
}

export function buildTransferBlock(mons: MonModel[], cfg: PogoConfig): ReportJson['transfer'] {
  const monsByDex = new Map<number, MonModel[]>();
  for (const m of mons) {
    const arr = monsByDex.get(m.dex) || [];
    arr.push(m);
    monsByDex.set(m.dex, arr);
  }

  const protectedCount = mons.filter((m) => m.verdict !== 'TRANSFER').length;
  const transferMons = mons.filter((m) => m.verdict === 'TRANSFER');

  const groupsMap = new Map<string, TransferGroup>();
  const lastLook: LastLookItem[] = [];

  for (const m of transferMons) {
    const spLabel = m.species ? cleanSpeciesName(m.species.speciesName) : `Dex #${m.dex}`;
    let g = groupsMap.get(spLabel);
    if (!g) {
      g = { species: spLabel, dex: m.dex, count: 0, search: String(m.dex), rows: [] };
      groupsMap.set(spLabel, g);
    }
    g.count++;
    const search = ingameSearch(m, spLabel);
    g.rows.push({
      id: m.uid,
      cp: m.cp,
      iv: ivStr(m),
      iv_pct: m.iv_pct,
      level: Math.round(m.level * 10) / 10,
      search,
      warn: m.warnings.join('; '),
    });

    const [triggers, notes] = lookFlags(m, monsByDex);
    if (triggers.length > 0) {
      const comparators = (monsByDex.get(m.dex) || [])
        .filter((k) => !isOutOfPlay(k))
        .sort((a, b) => b.iv_pct - a.iv_pct || b.cp - a.cp)
        .slice(0, 3)
        .map((k) => ({ id: k.uid, iv: ivStr(k), iv_pct: k.iv_pct, verdict: k.verdict }));
      lastLook.push({
        id: m.uid,
        species: spLabel,
        cp: m.cp,
        iv: ivStr(m),
        iv_pct: m.iv_pct,
        level: Math.round(m.level * 10) / 10,
        search,
        triggers,
        notes,
        kept_comparators: comparators,
      });
    }
  }

  const groups = Array.from(groupsMap.values())
    .map((g) => {
      const cpOr = Array.from(new Set(g.rows.map((r) => `cp${r.cp}`))).join(',');
      const dexPrefix = g.dex ? `${g.dex}&` : '';
      return {
        ...g,
        search: `!shiny&!lucky&!favorite&!4*&${dexPrefix}${cpOr}`,
      };
    })
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species));

  const collisions: ReportJson['transfer']['collisions'] = {};
  const bySearch = new Map<string, MonModel[]>();
  for (const m of mons) {
    const spLabel = m.species ? cleanSpeciesName(m.species.speciesName) : `Dex #${m.dex}`;
    const key = ingameSearch(m, spLabel);
    const arr = bySearch.get(key) || [];
    arr.push(m);
    bySearch.set(key, arr);
  }
  for (const [k, arr] of bySearch.entries()) {
    if (arr.some((x) => x.verdict === 'TRANSFER') && arr.some((x) => x.verdict !== 'TRANSFER')) {
      collisions[k] = arr
        .filter((x) => x.verdict !== 'TRANSFER')
        .map((x) => ({ id: x.uid, iv: ivStr(x), iv_pct: x.iv_pct, verdict: x.verdict }));
    }
  }

  const triageCfg = cfg.review_triage;
  const confirmed = new Set(triageCfg.confirmed_transfer_ids || []);
  const keepPct = Number(triageCfg.keep_iv_pct ?? 90);
  const transferPct = Number(triageCfg.transfer_iv_pct ?? 70);

  const probably_keep: ReviewTriageItem[] = [];
  const probably_transfer: ReviewTriageItem[] = [];
  const uncertain: ReviewTriageItem[] = [];

  for (const m of mons) {
    if (m.verdict !== 'REVIEW') continue;
    const spLabel = displaySpecies(m);
    let bucket: ReviewTriageItem['bucket'] = 'uncertain';
    let advice = 'Decide manually based on your candy and team needs.';
    if (m.iv_pct >= keepPct || m.is_shadow) {
      bucket = 'probably_keep';
      advice = 'High IV or Shadow potential — worth holding unless crowded.';
    } else if (m.iv_pct <= transferPct) {
      bucket = 'probably_transfer';
      advice = 'Below IV threshold with a better copy or stronger role already covered.';
    }
    const item: ReviewTriageItem = {
      id: m.uid,
      species: spLabel,
      cp: m.cp,
      iv: ivStr(m),
      iv_pct: m.iv_pct,
      level: Math.round(m.level * 10) / 10,
      search: ingameSearch(m, spLabel),
      bucket,
      reasons: m.review_reasons.length ? m.review_reasons : [m.why_keep],
      advice,
      confirmed_transfer: confirmed.has(m.uid),
    };
    if (bucket === 'probably_keep') probably_keep.push(item);
    else if (bucket === 'probably_transfer') probably_transfer.push(item);
    else uncertain.push(item);
  }

  const mass_search_chunks = buildMassTransferChunks(transferMons, collisions, mons);

  // Features 2 & 10: Mutually Exclusive Safe Mass-Nuke Batches + 2x Transfer Candy Bin
  const RARE_CANDY_HOLD_DEX = new Set([
    113, 143, 147, 148, 149, 242, 246, 247, 248, 371, 372, 373, 374, 375, 376,
    440, 443, 444, 445, 446, 447, 448, 610, 611, 612, 633, 634, 635, 636, 637,
    704, 705, 706, 782, 783, 784, 808, 809, 885, 886, 887, 996, 997, 998,
  ]);
  const isDoubleCandyTarget = (m: MonModel) =>
    Boolean(
      m.species?.tags?.some((t) => t === 'legendary' || t === 'ultrabeast' || t === 'mythical') ||
        RARE_CANDY_HOLD_DEX.has(m.dex),
    );

  const waitDoubleCandyMons: MonModel[] = [];
  const commonJunkMons: MonModel[] = [];
  const redundantDupeMons: MonModel[] = [];

  for (const m of transferMons) {
    if (isDoubleCandyTarget(m)) {
      waitDoubleCandyMons.push(m);
    } else if (
      !m.is_shadow &&
      m.iv_pct < 67 &&
      m.level < 30 &&
      !(m.year !== null && m.year <= 2019) &&
      !m.has_third_move &&
      m.battles_attacked + m.battles_defended < 5
    ) {
      commonJunkMons.push(m);
    } else {
      redundantDupeMons.push(m);
    }
  }

  const STD_SAFE_GUARD =
    '!shiny&!lucky&!xxl&!xxs&!favorite&!4*&!dynamax&!gigantamax&!background&!#trade';
  const DOUBLE_CANDY_GUARD = '!shiny&!lucky&!4*&!favorite&!background';

  const topSpeciesSummary = (list: MonModel[]): string[] => {
    const counts = new Map<string, number>();
    for (const m of list) {
      const nm = m.species ? cleanSpeciesName(m.species.speciesName) : `Dex #${m.dex}`;
      counts.set(nm, (counts.get(nm) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([nm, n]) => `${nm} (${n})`);
  };

  const makeBatch = (
    key: SafeTransferBatch['key'],
    title: string,
    subtitle: string,
    safety_note: string,
    list: MonModel[],
    guard: string,
  ): SafeTransferBatch => {
    const batchChunks = buildSafeSearchChunks(list, mons, guard, 1950);
    const covered = batchChunks.reduce((s, c) => s + c.count, 0);
    return {
      key,
      title,
      subtitle,
      total: list.length,
      safety_note,
      chunks: batchChunks,
      excluded_collisions: Math.max(0, list.length - covered),
      sample_species: topSpeciesSummary(list),
    };
  };

  const safe_batches: SafeTransferBatch[] = [
    makeBatch(
      'common_junk',
      'Batch 1 · Zero-Regret 0★/1★ Trash',
      'Low IV (<67%), under Level 30, non-Shadow, non-legacy catches safe to grind right away.',
      'Guarded against Shiny, Lucky, 4★, XXL/XXS, Favorite, Dynamax, Background, and #trade.',
      commonJunkMons,
      STD_SAFE_GUARD,
    ),
    makeBatch(
      'wait_double_candy',
      'Batch 2 · Hold for 2× Transfer Candy Tuesday',
      'Surplus Legendaries, Ultra Beasts, Meltan & pseudo-legendary/rare XL families worth saving for 2× Candy Spotlight Hour.',
      'Tag #2xCandy now and transfer together during the next 2× Transfer Candy hour (note: turn on Expanded Group Transfer in Settings for Legendaries).',
      waitDoubleCandyMons,
      DOUBLE_CANDY_GUARD,
    ),
    makeBatch(
      'redundant_dupes',
      'Batch 3 · Redundant High-IV & Surplus Dupes',
      'Spare L30+, Shadows, and surplus mid/high-IV copies where you already hold strictly stronger specimens.',
      'Always double-check Last Look below before mass transferring high-level or Shadow dupes.',
      redundantDupeMons,
      STD_SAFE_GUARD,
    ),
  ];

  return {
    protected: protectedCount,
    total: transferMons.length,
    double_candy_count: waitDoubleCandyMons.length,
    groups,
    last_look: lastLook.slice(0, 60),
    collisions,
    mass_search_chunks,
    safe_batches,
    review_triage: {
      enabled: triageCfg.enabled !== false,
      probably_keep,
      probably_transfer,
      uncertain,
    },
  };
}

function gradeLetter(pct: number): string {
  if (pct >= 93) return 'A+';
  if (pct >= 88) return 'A';
  if (pct >= 82) return 'A-';
  if (pct >= 76) return 'B+';
  if (pct >= 70) return 'B';
  if (pct >= 64) return 'B-';
  if (pct >= 58) return 'C+';
  if (pct >= 52) return 'C';
  if (pct >= 45) return 'C-';
  if (pct >= 35) return 'D';
  return 'F';
}

function ownerIndex(mons: MonModel[], dex: Dex) {
  const bySid = new Map<string, MonModel[]>();
  const undecidedBySid = new Map<string, MonModel[]>();

  for (const m of mons) {
    if (!m.species || m.verdict === 'TRANSFER' || m.verdict === 'TRADE') continue;
    const target = m.verdict === 'REVIEW' ? undecidedBySid : bySid;
    for (const d of dex.descendants(m.species.speciesId)) {
      const list = target.get(d) || [];
      list.push(m);
      target.set(d, list);
    }
  }
  return { bySid, undecidedBySid };
}

function copyBrief(m: MonModel, pct?: number): WishlistCopyBrief {
  return {
    id: m.uid,
    species: m.species ? cleanSpeciesName(m.species.speciesName) : undefined,
    iv: ivStr(m),
    iv_pct: m.iv_pct,
    cp: m.cp,
    level: Math.round(m.level * 10) / 10,
    shadow: m.is_shadow,
    pct,
    dynamax: m.is_dynamax || m.is_gigantamax,
    max_level: m.max_attack_level,
    mega_level: m.mega_level,
    unlocked: m.has_mega_unlocked,
  };
}

function buildWishlistRaid(
  dex: Dex,
  owners: ReturnType<typeof ownerIndex>,
  raidTeams: RaidTeamTypeBlock[],
  coverageList: ReportJson['coverage'],
): ReportJson['grade']['wishlist_all']['raid'] {
  const out: ReportJson['grade']['wishlist_all']['raid'] = {};
  const covMap = new Map(coverageList.map((c) => [c.type, c]));

  for (const t of RAID_USEFUL_TYPES) {
    const rt = raidTeams.find((r) => r.type === t);
    const cov = covMap.get(t);
    const team = (rt?.entries || [])
      .filter((e) => e.slot === 'team')
      .map((e) => ({ name: e.name, dps: e.dps, iv: e.iv, shadow: e.shadow }));
    const bestHave = team.reduce((mx, e) => Math.max(mx, e.dps), 0);
    const weakest = team.length >= 6 ? team.reduce((mn, e) => Math.min(mn, e.dps), Infinity) : 0;
    const ranked = dex.raidRankings.get(t) || [];
    const topSid = ranked[0]?.[0] || '';
    const topDps = Math.round(refDps(dex, dex.raidRankings, t, true) * 100) / 100 || 1;
    const topSpecies = spName(dex, topSid, t);

    const rows: WishlistRow[] = ranked.slice(0, 10).map(([sid, coeff], i) => {
      const sp = dex.byId.get(sid);
      const perfDps = sp ? (sp.baseStats.atk + 15) * 0.7903 * coeff * 1.15 : topDps * 0.9;
      const ownedList = owners.bySid.get(sid) || [];
      const reviewList = owners.undecidedBySid.get(sid) || [];
      let status: WishlistRow['status'] = 'HUNT';
      let best: WishlistCopyBrief | null = null;
      const why: string[] = [];

      if (ownedList.length > 0) {
        const b = [...ownedList].sort((a, b) => b.iv_pct - a.iv_pct || b.cp - a.cp)[0];
        best = copyBrief(b, Math.round(b.iv_pct));
        if (b.iv_pct >= 89) {
          status = 'HAVE';
          why.push(`Strong copy owned (${ivStr(b)}, ${b.iv_pct}%).`);
        } else {
          status = 'UPGRADE';
          why.push(`Owned (${b.iv_pct}% IV) — higher IV upgrade worth catching.`);
        }
      } else if (reviewList.length > 0) {
        const b = [...reviewList].sort((a, b) => b.iv_pct - a.iv_pct)[0];
        best = copyBrief(b, b.iv_pct);
        status = 'DECIDE';
        why.push('Owned in REVIEW — settle verdict first.');
      } else {
        why.push(`Ranked #${i + 1} ${t} raid attacker.`);
      }

      const tags = (sp?.tags || []).filter((x) => ['legendary', 'mythical', 'ultrabeast'].includes(x));

      return {
        rank: i + 1,
        species: sp ? cleanSpeciesName(sp.speciesName) : sid,
        sid,
        status,
        best,
        why,
        tags,
        dps: Math.round(perfDps * 10) / 10,
        pct_of_top: Math.round((100 * perfDps) / topDps),
        fixes_gap: (cov?.usable ?? 0) < 3,
      };
    });

    const usable = cov?.usable ?? 0;
    const status: 'OK' | 'THIN' | 'GAP' = usable >= 3 ? 'OK' : usable > 0 ? 'THIN' : 'GAP';
    out[t] = {
      type: t,
      usable,
      need: 3,
      status,
      team,
      best_have: Math.round(bestHave * 10) / 10,
      weakest: Math.round(weakest * 10) / 10,
      top_species: topSpecies,
      top_dps: Math.round(topDps * 10) / 10,
      have_pct: Math.min(100, Math.round((100 * bestHave) / topDps)),
      rows,
    };
  }
  return out;
}

function buildWishlistPvp(
  dex: Dex,
  owners: ReturnType<typeof ownerIndex>,
  caps: number[],
): ReportJson['grade']['wishlist_all']['pvp'] {
  return caps.map((cap) => {
    const rows: WishlistRow[] = (dex.pvpRows.get(cap) || []).slice(0, 10).map(([sid, sc], i) => {
      const baseSid = sid.replace(/_shadow$/, '');
      const sp = dex.byId.get(baseSid) || dex.byId.get(sid);
      const isSh = sid.endsWith('_shadow');
      const owned = (owners.bySid.get(baseSid) || []).filter((m) => !isSh || m.is_shadow);
      const rev = (owners.undecidedBySid.get(baseSid) || []).filter((m) => !isSh || m.is_shadow);

      let status: WishlistRow['status'] = 'HUNT';
      let best: WishlistCopyBrief | null = null;
      const why: string[] = [];

      if (owned.length > 0) {
        const eligible = owned.filter((m) => m.pvp.some((p) => p.cap === cap && p.eligible));
        const pick = (eligible.length ? eligible : owned).sort((a, b) => b.iv_pct - a.iv_pct)[0];
        const pEntry = pick.pvp.find((p) => p.cap === cap);
        best = { ...copyBrief(pick), iv_rank: pEntry?.iv_rank };
        if (eligible.length > 0 && pEntry && (cap >= 10000 || pEntry.iv_rank <= 50)) {
          status = 'HAVE';
          why.push(`Have eligible build (IV rank #${pEntry.iv_rank}).`);
        } else {
          status = 'UPGRADE';
          why.push('Owned copy is over cap or outside top 50 PvP IV rank.');
        }
      } else if (rev.length > 0) {
        best = copyBrief(rev[0]);
        status = 'DECIDE';
        why.push('Owned in REVIEW — check before transferring.');
      } else {
        why.push(`Meta rank #${i + 1} in ${LEAGUE_NAMES[cap] || cap}.`);
      }

      return {
        rank: i + 1,
        species: sp ? cleanSpeciesName(sp.speciesName) : sid,
        sid,
        status,
        best,
        why,
        tags: [],
        score: Math.round(sc * 10) / 10,
        shadow: isSh,
      };
    });
    return { league: LEAGUE_NAMES[cap] || `${cap}`, cap, rows };
  });
}

function buildWishlistMega(
  dex: Dex,
  owners: ReturnType<typeof ownerIndex>,
): ReportJson['grade']['wishlist_all']['mega'] {
  const out: ReportJson['grade']['wishlist_all']['mega'] = {};
  for (const t of RAID_USEFUL_TYPES) {
    const ranked = dex.megaRankings.get(t) || [];
    let ownedCount = 0;
    const rows: WishlistRow[] = ranked.slice(0, 6).map(([megaSid], i) => {
      const base = megaSid.replace(/_mega(_x|_y)?$|_primal$/, '');
      const sp = dex.byId.get(megaSid);
      const owned = (owners.bySid.get(base) || []).filter((m) => !m.is_shadow);
      const rev = (owners.undecidedBySid.get(base) || []).filter((m) => !m.is_shadow);
      let status: WishlistRow['status'] = 'HUNT';
      let best: WishlistCopyBrief | null = null;
      const why: string[] = [];

      if (owned.length > 0) {
        ownedCount++;
        const pick = [...owned].sort((a, b) => b.iv_pct - a.iv_pct)[0];
        best = copyBrief(pick);
        if (pick.has_mega_unlocked || pick.iv_pct >= 84) {
          status = 'HAVE';
          why.push(pick.has_mega_unlocked ? `Mega Lv${Math.max(1, pick.mega_level)}` : `${pick.iv_pct}% IV ready.`);
        } else {
          status = 'UPGRADE';
          why.push('Have low-IV copy — catch a better Mega base.');
        }
      } else if (rev.length > 0) {
        best = copyBrief(rev[0]);
        status = 'DECIDE';
        why.push('Copy sits in REVIEW.');
      } else {
        why.push(`Top ${t} Mega boost candidate.`);
      }

      return {
        rank: i + 1,
        species: sp ? cleanSpeciesName(sp.speciesName) : megaSid,
        sid: megaSid,
        status,
        best,
        why,
        tags: [],
        boosts: dex.megaBoostTypes(megaSid),
      };
    });
    out[t] = { type: t, rows, owned: ownedCount };
  }
  return out;
}

function buildWishlistMax(
  dex: Dex,
  owners: ReturnType<typeof ownerIndex>,
  maxTeams: MaxTeamTypeBlock[],
): ReportJson['grade']['wishlist_all']['max'] {
  const out: ReportJson['grade']['wishlist_all']['max'] = {};
  for (const t of MAX_BATTLE_TYPES) {
    const mt = maxTeams.find((x) => x.type === t);
    const team = (mt?.entries || []).map((e) => ({
      id: e.id,
      name: e.name,
      cp: e.cp,
      dps: e.dps,
      iv: e.iv,
    }));
    const bestHave = team[0]?.dps ?? 0;
    const topDps = Math.round(refDps(dex, dex.maxRankings, t, false) * 100) / 100 || 1;
    const ranked = dex.maxRankings.get(t) || [];
    const rows: WishlistRow[] = ranked.slice(0, 6).map(([sid], i) => {
      const sp = dex.byId.get(sid);
      const ownedDmax = (owners.bySid.get(sid) || []).filter((m) => m.is_dynamax || m.is_gigantamax);
      const ownedPlain = owners.bySid.get(sid) || [];
      let status: WishlistRow['status'] = 'HUNT';
      let best: WishlistCopyBrief | null = null;
      const why: string[] = [];

      if (ownedDmax.length > 0) {
        const pick = [...ownedDmax].sort((a, b) => b.iv_pct - a.iv_pct)[0];
        best = copyBrief(pick);
        if (pick.iv_pct >= 80) {
          status = 'HAVE';
          why.push('Dynamax attacker owned.');
        } else {
          status = 'UPGRADE';
          why.push('Owned Dynamax copy has low IV.');
        }
      } else if (ownedPlain.length > 0) {
        best = copyBrief(ownedPlain[0]);
        status = 'NO DYNAMAX';
        why.push('Only non-Dynamax copies owned.');
      } else {
        why.push(`Top ${t} Max attacker.`);
      }

      return {
        rank: i + 1,
        species: sp ? cleanSpeciesName(sp.speciesName) : sid,
        sid,
        status,
        best,
        why,
        tags: [],
        gmax: Boolean(sp && dex.gmaxType.get(sp.dex) === t),
      };
    });

    out[t] = {
      type: t,
      rows,
      team,
      best_have: Math.round(bestHave * 10) / 10,
      top_dps: Math.round(topDps * 10) / 10,
      have_pct: Math.min(100, Math.round((100 * bestHave) / topDps)),
    };
  }
  return out;
}

function buildHoldSummary(mons: MonModel[], auxMap: Map<string, MonAux>): HoldBucket[] {
  const counts: Record<string, number> = {
    build: 0,
    mega_reserve: 0,
    variant: 0,
    protect_other: 0,
    trade: 0,
    review: 0,
    transfer: 0,
  };
  for (const m of mons) {
    if (m.verdict === 'TRANSFER') counts.transfer++;
    else if (m.verdict === 'TRADE') counts.trade++;
    else if (m.verdict === 'REVIEW') counts.review++;
    else if (m.verdict.startsWith('BUILD_')) counts.build++;
    else if (getAux(auxMap, m).mega_home) counts.mega_reserve++;
    else if (m.variant_keep) counts.variant++;
    else counts.protect_other++;
  }
  return Object.entries(HOLD_LABELS)
    .filter(([key]) => key !== 'review' || counts.review > 0)
    .map(([key, [label, explain, lever]]) => ({
      key,
      label,
      explain,
      lever,
      count: counts[key] || 0,
    }));
}

export function computeGradeAndDetails(
  mons: MonModel[],
  reportMons: ReportMon[],
  dex: Dex,
  caps: number[],
  cups: Record<string, CupDef>,
  teams: LeagueTeamsBlock[],
  cupTeams: Record<string, LeagueTeamsBlock>,
  raidTeams: RaidTeamTypeBlock[],
  maxTeams: MaxTeamTypeBlock[],
  megaSection: { priority: MegaPriorityEntry[]; boost: MegaBoostEntry[] },
  coverage: ReportJson['coverage'],
  bagResources?: BagResources,
  curatedMegas?: CuratedMegaTypeRow[],
): ReportJson['grade'] {
  let raidWeightSum = 0;
  let raidWeighted = 0;
  for (const c of coverage) {
    const imp = GRADE_TYPE_IMPORTANCE[c.type] ?? 1.0;
    const pts = c.usable >= 3 ? 1.0 : c.usable === 2 ? 0.7 : c.usable === 1 ? 0.4 : 0.0;
    raidWeightSum += imp;
    raidWeighted += imp * pts;
  }
  const raidPct = raidWeightSum > 0 ? Math.round((1000 * raidWeighted) / raidWeightSum) / 10 : 0;

  const stdLeagues = teams.filter((t) => caps.includes(t.cap));
  const maxTeamsTotal = Math.max(1, stdLeagues.length * 5);
  const actualTeamsTotal = stdLeagues.reduce((s, t) => s + Math.min(5, t.teams.length), 0);
  const teamVarietyPct = (100 * actualTeamsTotal) / maxTeamsTotal;

  const pvpBuilds = reportMons.filter((m) => m.verdict === 'BUILD_PVP');
  let compSum = 0;
  for (const b of pvpBuilds) {
    if (b.build_status === 'Ready') compSum += 1.0;
    else if (b.build_status === 'Needs TM' || b.build_status === 'Needs second charged move') compSum += 0.8;
    else if (b.build_status === 'Needs Elite TM') compSum += 0.4;
    else compSum += 0.5;
  }
  const completionPct = pvpBuilds.length > 0 ? (100 * compSum) / pvpBuilds.length : 0;
  const pvpPct = Math.round((teamVarietyPct * 0.6 + completionPct * 0.4) * 10) / 10;

  const coveredMegaTypes = new Set<string>();
  for (const p of megaSection.priority) {
    for (const tag of p.tags) {
      if (tag.startsWith('boosts ')) {
        tag.slice(7).split('/').map((x) => x.trim()).filter(Boolean).forEach((x) => coveredMegaTypes.add(x));
      }
    }
  }
  const megaPct = Math.round((1000 * coveredMegaTypes.size) / RAID_USEFUL_TYPES.length) / 10;
  const coveredMaxTypes = maxTeams.filter((t) => t.entries.length > 0).length;
  const maxPct = Math.round((1000 * coveredMaxTypes) / MAX_BATTLE_TYPES.length) / 10;

  const hundos = mons.filter((m) => m.iv_pct >= 100 && m.verdict !== 'TRANSFER');
  const uniqueSpecies = new Set(mons.filter((m) => m.verdict !== 'TRANSFER').map((m) => m.dex)).size;
  const anchors = reportMons
    .filter((r) => r.verdict !== 'TRANSFER' && r.pvp.some((p) => p.eligible && p.iv_rank <= 10))
    .slice(0, 40);
  const hundoPct = Math.min(100, Math.round((100 * hundos.length) / 25));
  const speciesPct = Math.min(100, Math.round((100 * uniqueSpecies) / 300));
  const anchorPct = Math.min(100, Math.round((100 * anchors.length) / 30));
  const depthPct = Math.round((hundoPct * 0.35 + speciesPct * 0.35 + anchorPct * 0.3) * 10) / 10;

  const overall =
    Math.round(
      (raidPct * GRADE_WEIGHTS.raid_coverage +
        pvpPct * GRADE_WEIGHTS.pvp_readiness +
        megaPct * GRADE_WEIGHTS.mega_coverage +
        maxPct * GRADE_WEIGHTS.max_battle +
        depthPct * GRADE_WEIGHTS.collection_depth) *
        10,
    ) / 10;

  const components: Record<string, GradeComponent> = {
    raid_coverage: {
      pct: raidPct,
      weight: Math.round(GRADE_WEIGHTS.raid_coverage * 100),
      weighted: Math.round(raidPct * GRADE_WEIGHTS.raid_coverage * 10) / 10,
      explain: `${coverage.filter((c) => c.usable >= 3).length} of ${coverage.length} raid types have 3+ usable attackers.`,
    },
    pvp_readiness: {
      pct: pvpPct,
      weight: Math.round(GRADE_WEIGHTS.pvp_readiness * 100),
      weighted: Math.round(pvpPct * GRADE_WEIGHTS.pvp_readiness * 10) / 10,
      explain: `60% team variety (${actualTeamsTotal}/${maxTeamsTotal} teams) + 40% finished builds (${Math.round(completionPct)}%).`,
    },
    mega_coverage: {
      pct: megaPct,
      weight: Math.round(GRADE_WEIGHTS.mega_coverage * 100),
      weighted: Math.round(megaPct * GRADE_WEIGHTS.mega_coverage * 10) / 10,
      explain: `Megas boost ${coveredMegaTypes.size} of ${RAID_USEFUL_TYPES.length} raid types.`,
    },
    max_battle: {
      pct: maxPct,
      weight: Math.round(GRADE_WEIGHTS.max_battle * 100),
      weighted: Math.round(maxPct * GRADE_WEIGHTS.max_battle * 10) / 10,
      explain: `Dynamax/G-Max attackers cover ${coveredMaxTypes} of ${MAX_BATTLE_TYPES.length} types.`,
    },
    collection_depth: {
      pct: depthPct,
      weight: Math.round(GRADE_WEIGHTS.collection_depth * 100),
      weighted: Math.round(depthPct * GRADE_WEIGHTS.collection_depth * 10) / 10,
      explain: `${hundos.length} hundos, ${uniqueSpecies} distinct species, and ${anchors.length} PvP top-10 IV anchors.`,
    },
  };

  const owners = ownerIndex(mons, dex);
  const raidWish = buildWishlistRaid(dex, owners, raidTeams, coverage);
  const pvpWish = buildWishlistPvp(dex, owners, caps);
  const megaWish = buildWishlistMega(dex, owners);
  const maxWish = buildWishlistMax(dex, owners, maxTeams);

  const flexByType = new Map<string, ReportJson['grade']['sections']['raid'][0]['flex']>();
  for (const t of RAID_USEFUL_TYPES) flexByType.set(t, []);
  for (const m of mons) {
    if (isOutOfPlay(m) || !m.species) continue;
    for (const d of dex.descendants(m.species.speciesId)) {
      for (const t of RAID_USEFUL_TYPES) {
        if (t === m.raid_type) continue;
        const hit = dex.raidPos.get(t)?.get(d);
        if (!hit || hit[0] > 12) continue;
        const ref = refDps(dex, dex.raidRankings, t, true) || 1;
        const est = (dex.byId.get(d)!.baseStats.atk + m.a) * 0.7903 * hit[1];
        const pct = Math.round((100 * est) / ref);
        if (pct >= 65) {
          flexByType.get(t)!.push({
            id: m.uid,
            name: displaySpecies(m),
            to: d !== m.species.speciesId ? spName(dex, d) : '',
            iv: ivStr(m),
            level: Math.round(m.level * 10) / 10,
            verdict: m.verdict,
            shadow: m.is_shadow,
            assigned: m.raid_type || m.role,
            assigned_score: m.raid_dps || null,
            score: Math.round(est * 10) / 10,
            pct,
          });
        }
      }
    }
  }

  const raidSections: ReportJson['grade']['sections']['raid'] = RAID_USEFUL_TYPES.map((t) => {
    const rw = raidWish[t];
    const rt = raidTeams.find((x) => x.type === t);
    const fillPicks = mons
      .filter((m) => !isOutOfPlay(m) && m.raid_type === t && m.level < 25)
      .sort((a, b) => b.raid_dps - a.raid_dps)
      .slice(0, 3)
      .map((m) => ({
        name: displaySpecies(m),
        cp: m.cp,
        level: Math.round(m.level * 10) / 10,
        iv: ivStr(m),
        dps: Math.round(m.raid_dps * 10) / 10,
        dust: 31000,
        evolve_to: m.evolve_to || '',
      }));
    const flex = (flexByType.get(t) || []).sort((a, b) => b.pct - a.pct).slice(0, 5);
    const teamDpsList = rw.team.map((e) => e.dps);
    const avgTeamDps = teamDpsList.length
      ? Math.round((teamDpsList.reduce((s, v) => s + v, 0) / teamDpsList.length) * 10) / 10
      : 0;
    return {
      type: t,
      status: rw.status,
      usable: rw.usable,
      need: 3,
      team: rt?.entries || [],
      fix_queue: rt?.fix_queue || [],
      status_counts: rt?.status_counts,
      mega: rt?.mega || null,
      best_dps: rw.best_have,
      top_species: rw.top_species,
      top_dps: rw.top_dps,
      strength_pct: rw.have_pct,
      avg_team_dps: avgTeamDps,
      letter: gradeLetter(rw.have_pct),
      fill_picks: fillPicks,
      flex,
      wish: rw.rows.filter((r) => r.status !== 'HAVE').slice(0, 5),
    };
  });

  const monByUid = new Map(mons.map((m) => [m.uid, m]));
  const pvpSections: ReportJson['grade']['sections']['pvp'] = [
    ...teams.map((blk) => {
      const rel = reportMons.filter((r) => {
        if (OUT_OF_PLAY.has(r.verdict) || r.verdict !== 'BUILD_PVP') return false;
        if (r.role.startsWith(blk.league)) return true;
        const m = monByUid.get(r.id);
        return Boolean(
          m?.best_pvp &&
            m.best_pvp.cap === blk.cap &&
            m.pvp.some(
              (p) => p.cap === blk.cap && p.eligible && p.sid === m.best_pvp!.sid && p.species_rank <= 200,
            ),
        );
      });
      const pw = pvpWish.find((w) => w.cap === blk.cap);
      const teamPct = Math.round((100 * Math.min(5, blk.teams.length)) / 5);
      const bestG = blk.teams[0]?.cohesion?.grade || gradeLetter(teamPct);
      return {
        league: blk.league,
        cap: blk.cap,
        is_cup: false,
        distinct_teams: blk.teams.length,
        team_score_pct: teamPct,
        completion_pct: Math.round(completionPct),
        best_grade: bestG,
        threat_source: blk.threat_source,
        threat_note: blk.threat_note,
        teams: blk.teams,
        builds: rel.slice(0, 20).map((b) => ({
          id: b.id,
          species: b.species,
          cp: b.cp,
          iv: b.iv,
          role: b.role,
          status: b.build_status || 'Unknown',
          needs: b.needs_moves || [],
          needs_second_move: Boolean(b.needs_second_move) || b.build_status === 'Needs second charged move',
          search: b.search,
        })),
        wish: (pw?.rows || []).slice(0, 10),
      };
    }),
    ...Object.entries(cupTeams).map(([cupKey, blk]) => ({
      league: blk.league || cupKey,
      cap: blk.cap,
      is_cup: true,
      distinct_teams: blk.teams.length,
      team_score_pct: Math.round((100 * Math.min(5, blk.teams.length)) / 5),
      completion_pct: 100,
      best_grade: blk.teams[0]?.cohesion?.grade || 'B',
      threat_source: blk.threat_source,
      threat_note: blk.threat_note,
      teams: blk.teams,
      builds: reportMons
        .filter((r) => {
          if (r.verdict !== 'BUILD_PVP') return false;
          if (r.role.toLowerCase().includes(cupKey)) return true;
          const m = monByUid.get(r.id);
          return Boolean(
            m?.best_pvp &&
              m.best_pvp.cap === blk.cap &&
              m.cup_pvp.some(
                (c) => c.cup === cupKey && c.eligible && c.sid === m.best_pvp!.sid && c.species_rank <= 200,
              ),
          );
        })
        .slice(0, 15)
        .map((b) => ({
          id: b.id,
          species: b.species,
          cp: b.cp,
          iv: b.iv,
          role: b.role,
          status: b.build_status || 'Unknown',
          needs: b.needs_moves || [],
          needs_second_move: Boolean(b.needs_second_move) || b.build_status === 'Needs second charged move',
          search: b.search,
        })),
      wish: [],
    })),
  ];

  const megaSections: ReportJson['grade']['sections']['mega'] = {
    covered: coveredMegaTypes.size,
    total: RAID_USEFUL_TYPES.length,
    priority: megaSection.priority,
    curated: curatedMegas,
    types: RAID_USEFUL_TYPES.map((t) => {
      const forms = megaSection.priority
        .filter((p) => p.tags.some((tg) => tg.includes(t)))
        .map((p) => p.form);
      const all = megaWish[t]?.rows || [];
      return {
        type: t,
        covered: forms.length > 0,
        forms,
        wish: all.filter((r) => r.status !== 'HAVE').slice(0, 5),
        all,
      };
    }),
  };

  const maxSections: ReportJson['grade']['sections']['max'] = {
    covered: coveredMaxTypes,
    total: MAX_BATTLE_TYPES.length,
    types: MAX_BATTLE_TYPES.map((t) => {
      const mw = maxWish[t];
      return {
        type: t,
        covered: mw.team.length > 0,
        have_pct: mw.have_pct,
        team: mw.team,
        wish: mw.rows.filter((r) => r.status !== 'HAVE').slice(0, 5),
        all: mw.rows,
      };
    }),
  };

  const hundoMap = new Map<string, number>();
  for (const h of hundos) {
    const n = displaySpecies(h);
    hundoMap.set(n, (hundoMap.get(n) || 0) + 1);
  }
  const hundoList = Array.from(hundoMap.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species));

  const gapSet = new Set(coverage.filter((c) => c.status === 'GAP').map((c) => c.type));
  const hasBuildAction = (r: ReportMon): boolean =>
    r.cost_dust > 0 ||
    r.cost_candy > 0 ||
    r.cost_xl > 0 ||
    Boolean(r.needs_second_move) ||
    r.build_status === 'Needs second charged move' ||
    (r.needs_moves?.length || 0) > 0 ||
    (r.needs_elite_moves?.length || 0) > 0 ||
    Boolean(r.evolve_to);

  const allLevelThese: LevelTheseItem[] = reportMons
    .filter((r) => r.verdict.startsWith('BUILD_') && hasBuildAction(r))
    .map((r) => {
      const m = monByUid.get(r.id);

      // Raid coverage gap bonus applies ONLY to PvE Raid / Mega builds (never PvP or Gym)
      let isGap = '';
      if (r.verdict === 'BUILD_RAID' && r.raid_type && gapSet.has(r.raid_type)) {
        isGap = r.raid_type;
      } else if (r.verdict === 'BUILD_MEGA') {
        const boosts = m?.mega_sid ? dex.megaBoostTypes(m.mega_sid) : [];
        if (r.mega_type && gapSet.has(r.mega_type)) isGap = r.mega_type;
        else {
          const boostedGap = boosts.find((bt) => gapSet.has(bt));
          if (boostedGap) isGap = boostedGap;
        }
      }

      // Unified 1-100 Build Priority Score aligned with Pokémon GO meta, IV role & cost efficiency
      let rawPriority = 45;
      if (r.verdict === 'BUILD_RAID') {
        const ty = r.raid_type || 'normal';
        const ref = refDps(dex, dex.raidRankings, ty, true);
        const raidPct = ref > 0 && m ? (100 * m.raid_dps) / ref : 60;
        const baseDpsScore = 42 + (Math.min(105, Math.max(40, raidPct)) - 40) * 0.42;
        const rk = m?.raid_rank ?? 99;
        const rankBonus = rk <= 1 ? 10 : rk <= 3 ? 7 : rk <= 6 ? 4 : rk <= 10 ? 2 : 0;
        const ivBonus = ((r.iv_pct - 60) / 40) * 6;
        const typeMetaBonus = ((GRADE_TYPE_IMPORTANCE[ty] ?? 1.0) - 1.0) * 10;
        const gapBonus = isGap ? 16 : 0;
        rawPriority = baseDpsScore + rankBonus + ivBonus + typeMetaBonus + gapBonus;
      } else if (r.verdict === 'BUILD_MEGA') {
        const unlockBonus = !m?.has_mega_unlocked || r.evolve_to ? 5 : 0;
        const gapBonus = isGap ? 16 : 0;
        rawPriority = 62 + (r.iv_pct / 100) * 10 + unlockBonus + gapBonus;
      } else if (r.verdict === 'BUILD_PVP') {
        const bp = m?.best_pvp;
        if (bp) {
          const metaScore = Math.max(0.2, 1 - Math.log10(Math.max(1, bp.species_rank)) * 0.35);
          const ivScore =
            bp.cap >= 10000
              ? Math.max(0.4, Math.min(1, 0.4 + ((r.iv_pct - 80) / 20) * 0.6))
              : Math.max(0.1, 1 - Math.sqrt((Math.max(1, bp.iv_rank) - 1) / 4095));
          rawPriority = 38 + metaScore * 28 + ivScore * 24;
        } else {
          rawPriority = 45 + (r.iv_pct / 100) * 20;
        }
      } else if (r.verdict === 'BUILD_MAX') {
        const rk = m?.max_rank ?? 99;
        const rankBonus = rk <= 1 ? 10 : rk <= 3 ? 6 : 2;
        const gmaxBonus = m?.is_gigantamax ? 8 : 0;
        rawPriority = 54 + rankBonus + gmaxBonus + (r.iv_pct / 100) * 8;
      } else if (r.verdict === 'BUILD_GYM') {
        rawPriority = 32 + (r.iv_pct / 100) * 14;
      }

      // Modest resource-efficiency nudge so quick high-value upgrades rise above 296-XL sinks
      if (r.cost_xl === 0 && r.cost_dust <= 25000) rawPriority += 5;
      else if (r.cost_xl === 0 && r.cost_dust <= 60000) rawPriority += 2;
      else if (r.cost_xl >= 200 || r.cost_dust >= 300000) rawPriority -= 4;

      const priorityScore = Math.round(Math.max(1, Math.min(99, rawPriority)));
      const formatTmTyped = (t: { name: string; slot: 'fast' | 'charged'; elite: boolean }) =>
        `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM: ${t.name}`;
      const typedNeeds = r.needs_typed || [];
      const item: LevelTheseItem = {
        id: r.id,
        species: r.species,
        verdict: r.verdict,
        role: r.role,
        cp: r.cp,
        iv: r.iv,
        level: r.level,
        power_up_to: r.power_up_to,
        evolve_to: r.evolve_to,
        gap_fix: isGap,
        impact: priorityScore,
        cost: { dust: r.cost_dust, candy: r.cost_candy, xl: r.cost_xl },
        moves: r.moves,
        tm_needed:
          typedNeeds.length > 0
            ? typedNeeds.map(formatTmTyped)
            : [
                ...(r.needs_moves || []),
                ...(r.needs_elite_moves || []).map((mv) => `${mv} (Elite)`),
              ],
        tm_typed: typedNeeds,
        needs_second_move: Boolean(r.needs_second_move) || r.build_status === 'Needs second charged move',
        why: [r.why, r.status_reason || ''].filter(Boolean),
        search: r.search,
      };
      if (bagResources) {
        const readyCheck = evaluateBuildReadiness(item, m, bagResources, r.needs_typed || []);
        item.can_build_now = readyCheck.can_build_now;
        item.blockers = readyCheck.blockers;
        r.build_ready_now = readyCheck.can_build_now;
        r.build_blockers = readyCheck.blockers;
      }
      return item;
    });

  const sortedByImpact = allLevelThese.sort(
    (a, b) => b.impact - a.impact || a.cost.dust - b.cost.dust,
  );
  const readySlice = sortedByImpact.filter((x) => x.can_build_now !== false).slice(0, 35);
  const blockedSlice = sortedByImpact.filter((x) => x.can_build_now === false).slice(0, 25);
  const levelThese: LevelTheseItem[] = [...readySlice, ...blockedSlice];

  const formatTmSummary = (r: ReportMon) =>
    (r.needs_typed || []).length > 0
      ? (r.needs_typed || [])
          .map((t) => `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM: ${t.name}`)
          .join(' · ')
      : [...(r.needs_moves || []), ...(r.needs_elite_moves || []).map((mv) => `${mv} (Elite)`)].join(', ');

  const regularTm = reportMons
    .filter(
      (r) =>
        r.verdict.startsWith('BUILD_') &&
        (r.build_status === 'Needs TM' ||
          (r.build_status === 'Needs second charged move' && (r.needs_typed?.length || 0) > 0)),
    )
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      species: r.species,
      needs: formatTmSummary(r),
      needs_typed: r.needs_typed || [],
      needs_second_move: Boolean(r.needs_second_move) || r.build_status === 'Needs second charged move',
      role: r.role,
      cp: r.cp,
      iv: r.iv,
      level: r.level,
      search: r.search,
      moves: r.moves,
    }));

  const eliteWorth = reportMons
    .filter((r) => r.verdict === 'BUILD_PVP' && r.build_status === 'Needs Elite TM')
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      species: r.species,
      needs: formatTmSummary(r),
      needs_typed: r.needs_typed || [],
      needs_second_move: Boolean(r.needs_second_move) || r.build_status === 'Needs second charged move',
      role: r.role,
      cp: r.cp,
      iv: r.iv,
      level: r.level,
      search: r.search,
      moves: r.moves,
    }));

  const eliteSkipCount = reportMons.filter(
    (r) => r.verdict !== 'BUILD_PVP' && r.build_status === 'Needs Elite TM',
  ).length;

  // Feature 4: Elite TM ROI Ranker ("Who Deserves My Elite TM?")
  const eliteRoi: EliteTmRoiItem[] = [];
  for (const r of reportMons) {
    if (OUT_OF_PLAY.has(r.verdict)) continue;
    const eliteMoves = r.needs_elite_moves || [];
    if (eliteMoves.length === 0) continue;
    const m = monByUid.get(r.id);
    if (!m) continue;

    const targetSid = (m.evolve_to_sid || m.raid_sid || m.mega_sid || m.species?.speciesId || '').replace(/_shadow$/, '');
    const targetSp = dex.byId.get(targetSid) || m.species;
    let dpsGainPct: number | null = null;

    if (targetSp && (m.raid_type || m.mega_type)) {
      const atype = m.raid_type || m.mega_type || (targetSp.types?.[0]?.toLowerCase() || 'normal');
      const spTypes = new Set((targetSp.types || []).map((t) => t.toLowerCase()));
      const cands = raidMovesetCandidates(
        dex.pve,
        spTypes,
        dex.moves,
        targetSp.fastMoves || [],
        targetSp.chargedMoves || [],
        atype,
        false,
      );
      const eliteSet = new Set((targetSp.eliteMoves || []).map((e) => String(e).toUpperCase()));
      const bestWith = cands[0]?.[0] ?? 0;
      const bestWithout =
        cands.find((c) => !eliteSet.has(c[1].toUpperCase()) && !eliteSet.has(c[2].toUpperCase()))?.[0] ?? 0;
      if (bestWith > 0 && bestWithout > 0) {
        dpsGainPct = Math.round(((bestWith / bestWithout - 1) * 1000)) / 10;
      }
    }

    const pvpRank = m.best_pvp && (r.verdict === 'BUILD_PVP' || m.best_pvp.species_rank <= 50)
      ? m.best_pvp.species_rank
      : null;

    let roiScore = 25;
    if (r.verdict === 'BUILD_PVP') {
      roiScore = 82 - Math.min(45, (pvpRank ?? 100) * 0.45) + (m.best_pvp && m.best_pvp.iv_rank <= 15 ? 12 : 0);
      if (dpsGainPct !== null) roiScore += Math.min(12, dpsGainPct * 0.6);
    } else if (r.verdict === 'BUILD_MEGA' || r.verdict === 'BUILD_RAID') {
      roiScore = 40 + (dpsGainPct !== null ? Math.min(48, dpsGainPct * 2.2) : 10) + (m.iv_pct >= 93 ? 8 : 0);
    } else if (dpsGainPct !== null) {
      roiScore = 20 + Math.min(30, dpsGainPct * 1.4);
    }
    if (r.wait_cd_move) roiScore -= 18;
    roiScore = Math.max(5, Math.min(99, Math.round(roiScore)));

    const roiTier: EliteTmRoiItem['roi_tier'] =
      roiScore >= 72 ? 'HIGH' : roiScore >= 48 ? 'MEDIUM' : 'LOW';
    const recommendation: EliteTmRoiItem['recommendation'] =
      roiTier === 'HIGH' ? 'WORTH ELITE TM' : roiTier === 'MEDIUM' ? 'OPTIONAL' : 'SKIP — SAVE TM';

    const reasonParts: string[] = [];
    if (r.wait_cd_move) {
      reasonParts.push(`Pre-evolution can wait for a free Community Day / Legacy event (${r.wait_cd_move})`);
    }
    if (dpsGainPct !== null) {
      reasonParts.push(
        dpsGainPct >= 10
          ? `+${dpsGainPct}% Raid DPS over best non-legacy move`
          : `Only +${dpsGainPct}% Raid DPS over non-legacy move`,
      );
    }
    if (pvpRank !== null) {
      reasonParts.push(`${m.best_pvp?.league} #${pvpRank} meta requires legacy move`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push('Non-core collection build — regular TM alternatives are plenty.');
    }

    eliteRoi.push({
      id: r.id,
      species: r.species,
      cp: r.cp,
      iv: r.iv,
      level: r.level,
      role: r.role,
      verdict: r.verdict,
      elite_moves: eliteMoves,
      dps_gain_pct: dpsGainPct,
      pvp_rank: pvpRank,
      roi_score: roiScore,
      roi_tier: roiTier,
      recommendation,
      reason: reasonParts.join(' · '),
      search: r.search,
    });
  }
  eliteRoi.sort((a, b) => b.roi_score - a.roi_score || (b.dps_gain_pct ?? 0) - (a.dps_gain_pct ?? 0));

  const reviewActions = mons
    .filter((m) => m.verdict === 'REVIEW')
    .slice(0, 60)
    .map((m) => {
      const rs = m.review_reasons.join(' ').toLowerCase();
      let action = 'keep';
      let label = 'Keep as collection';
      if (rs.includes('resolve')) {
        action = 'bug';
        label = 'Fix needed';
      } else if (rs.includes('below raid.min_iv_pct') || rs.includes('below gym')) {
        action = 'transfer';
        label = 'Safe to transfer';
      } else if (rs.includes('atk')) {
        action = 'hunt_atk';
        label = 'Hunt a 12+ ATK copy';
      } else if (rs.includes('master') || rs.includes('great') || rs.includes('ultra')) {
        action = 'hunt_spread';
        label = 'Hunt a better IV spread';
      }
      return {
        id: m.uid,
        action,
        label,
        species: displaySpecies(m),
        cp: m.cp,
        iv: ivStr(m),
        detail: m.review_reasons[0] || m.why_keep,
      };
    });

  const cupReadiness: ReportJson['grade']['cup_readiness'] = {};
  for (const [cupKey, spec] of Object.entries(cups)) {
    const legal = mons.filter((m) => !isOutOfPlay(m) && m.cup_pvp.some((c) => c.cup === cupKey)).length;
    const qualified = mons.filter(
      (m) => !isOutOfPlay(m) && m.cup_pvp.some((c) => c.cup === cupKey && c.eligible),
    ).length;
    const built = reportMons.filter((r) => {
      if (r.verdict !== 'BUILD_PVP') return false;
      if (r.role.toLowerCase().includes(cupKey)) return true;
      const m = monByUid.get(r.id);
      return Boolean(
        m?.best_pvp &&
          m.best_pvp.cap === spec.cap &&
          m.cup_pvp.some(
            (c) => c.cup === cupKey && c.eligible && c.sid === m.best_pvp!.sid && c.species_rank <= 200,
          ),
      );
    }).length;
    cupReadiness[cupKey] = {
      title: spec.title || cupKey,
      cap: spec.cap,
      legal,
      qualified,
      built,
      top_builds: [],
    };
  }

  const gapCount = coverage.filter((c) => c.status === 'GAP').length;
  const zeroTypes = coverage.filter((c) => c.usable === 0).map((c) => c.type);
  const keepCounts: Record<string, number> = {};
  for (const r of reportMons) {
    if (!OUT_OF_PLAY.has(r.verdict)) {
      keepCounts[r.verdict] = (keepCounts[r.verdict] || 0) + 1;
    }
  }

  const flatWishlist: ReportJson['grade']['wishlist'] = [];
  for (const t of RAID_USEFUL_TYPES) {
    const rw = raidWish[t];
    if (rw.status === 'OK') continue;
    const top = rw.rows.find((r) => r.status !== 'HAVE');
    if (top) {
      flatWishlist.push({
        species: top.species,
        species_sid: top.sid,
        is_shadow: Boolean(top.shadow),
        fixes: t,
        rank_in_type: top.rank,
        cheap: false,
        urgency: rw.usable === 0 ? 10 : 5,
        status: top.status,
        gain_vs_weakest: null,
        reason: top.why[0] || `fills ${t} raid gap`,
      });
    }
  }

  return {
    overall_pct: overall,
    letter: gradeLetter(overall),
    components,
    wishlist_all: {
      raid: raidWish,
      pvp: pvpWish,
      mega: megaWish,
      max: maxWish,
    },
    wishlist: flatWishlist.slice(0, 12),
    sections: {
      raid: raidSections,
      pvp: pvpSections,
      mega: megaSections,
      max: maxSections,
      depth: {
        hundos: hundos.length,
        hundo_target: 25,
        hundo_list: hundoList.slice(0, 40),
        species: uniqueSpecies,
        species_target: 300,
        pvp_ranked: pvpBuilds.length,
        pvp_total: mons.length,
        pvp_pct: Math.round((100 * pvpBuilds.length) / Math.max(1, mons.length)),
        anchors: anchors.map((a) => {
          const hit = a.pvp.find((p) => p.eligible && p.iv_rank <= 10);
          return {
            species: a.species,
            cp: a.cp,
            iv: a.iv,
            league: hit?.league || 'PvP',
            iv_rank: hit?.iv_rank || 1,
            verdict: a.verdict,
          };
        }),
        parts: [
          { label: 'Hundos (100% IV)', weight: 35, pct: hundoPct, text: `${hundos.length} hundos held` },
          { label: 'Unique Species', weight: 35, pct: speciesPct, text: `${uniqueSpecies} distinct Dex species` },
          { label: 'PvP Top-10 Anchors', weight: 30, pct: anchorPct, text: `${anchors.length} top-10 spreads` },
        ],
      },
    },
    keep_summary: {
      counts: keepCounts,
      total_protected: mons.filter((m) => m.verdict !== 'TRANSFER').length,
      total: mons.length,
    },
    level_these: levelThese,
    tm_here: {
      regular: regularTm,
      elite_worth: eliteWorth,
      elite_skip: {
        count: eliteSkipCount,
        summary: `${eliteSkipCount} non-priority Elite TM flags skipped — regular TMs cover 90%+ DPS.`,
      },
      elite_roi: eliteRoi.slice(0, 30),
    },
    review_actions: reviewActions,
    cup_readiness: cupReadiness,
    coverage: coverage.map((c) => ({
      type: c.type,
      status: c.usable >= 3 ? 'OK' : c.usable > 0 ? 'THIN' : 'GAP',
      usable: c.usable,
      need: 3,
      names: c.names,
    })),
    narrative: {
      headline: `Your collection scores ${overall}% (${gradeLetter(overall)}) overall.`,
      body:
        zeroTypes.length > 0
          ? `${gapCount} raid types are short; ${zeroTypes.join(', ')} currently have zero level 25+ attackers.`
          : gapCount > 0
          ? `${gapCount} raid types need 1–2 more attackers to hit full 3-attacker coverage.`
          : 'All 18 raid types have strong coverage! Focus on PvP cohesion and Max/Mega depth.',
    },
  };
}

function eventWeaknesses(types: string[]): { type: string; x: number }[] {
  const out: { type: string; x: number }[] = [];
  for (const att of RAID_USEFUL_TYPES) {
    const mult = typeEff(att, types);
    if (mult > 1.05) out.push({ type: att, x: Math.round(mult * 100) / 100 });
  }
  return out.sort((a, b) => b.x - a.x);
}

export function buildBriefing(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  dex: Dex,
  remote: RemoteGameData,
  raidTeams: RaidTeamTypeBlock[],
  megaPriority: MegaPriorityEntry[],
  transferTotal: number,
  levelThese: LevelTheseItem[],
  bag: BagResources,
  buddyTracker: BuddyTrackerData,
  exportRefMs: number,
): BriefingData {
  const accRaw = resolveAccount(rawData);
  const playerObj = (accField<Record<string, unknown>>(rawData, 'player') || {}) as Record<string, unknown>;
  const stardust = bag.stardust;

  const stored = mons.length;
  const cap = Number(accRaw.maxPokemonStorage ?? rawData.maxPokemonStorage ?? Math.max(stored + 100, 1000));
  const now = new Date();

  const buddyCand = mons
    .filter((m) => !isOutOfPlay(m) && (m.verdict === 'BUILD_MEGA' || m.has_mega_unlocked || m.verdict === 'BUILD_RAID'))
    .sort((a, b) => b.iv_pct - a.iv_pct || b.cp - a.cp);

  const buddy = buddyCand[0]
    ? {
        id: buddyCand[0].uid,
        name: displaySpecies(buddyCand[0]),
        cp: buddyCand[0].cp,
        iv_pct: buddyCand[0].iv_pct,
        mega_level: buddyCand[0].mega_level,
        why: buddyCand[0].has_mega_unlocked
          ? `Walk for Mega Energy + XL candy (${buddyCand[0].iv_pct}% IV).`
          : `Top priority candidate (${buddyCand[0].iv_pct}% IV) for buddy XL candy.`,
        already: buddyTracker.active_buddy?.id === buddyCand[0].uid,
      }
    : null;

  const runnerUp = buddyCand[1]
    ? {
        id: buddyCand[1].uid,
        name: displaySpecies(buddyCand[1]),
        cp: buddyCand[1].cp,
        iv_pct: buddyCand[1].iv_pct,
        mega_level: buddyCand[1].mega_level,
        why: buddyCand[1].why_keep,
        already: buddyTracker.active_buddy?.id === buddyCand[1].uid,
      }
    : null;

  const evList: BriefingEventItem[] = (remote.events || []).slice(0, 12).map((ev, idx) => {
    const startDt = ev.start ? new Date(ev.start) : null;
    const endDt = ev.end ? new Date(ev.end) : null;
    let status: BriefingEventItem['status'] = 'later';
    if (startDt && endDt && startDt <= now && endDt >= now) status = 'live';
    else if (startDt && startDt > now && startDt.getTime() - now.getTime() < 7 * 86400_000) status = 'soon';
    else if (!ev.start) status = 'tbd';

    const extra = (ev.extraData || {}) as {
      raids?: { bosses?: (string | { name?: string })[] };
      spawns?: (string | { name?: string })[];
      bonuses?: { text?: string }[];
    };
    const rawBosses = extra.raids?.bosses || extra.spawns || [];
    const spRows = rawBosses.slice(0, 4).map((b) => {
      const nameStr = typeof b === 'string' ? b : b.name || 'Boss';
      const sidGuess = normStr(nameStr);
      let spMatch = null;
      for (const s of dex.byId.values()) {
        if (normStr(s.speciesName) === sidGuess) {
          spMatch = s;
          break;
        }
      }
      const types = (spMatch?.types || ['normal']).map((t) => t.toLowerCase());
      const weak = eventWeaknesses(types);
      const bestWeakType = weak[0]?.type || types[0] || 'dragon';
      const rt = raidTeams.find((r) => r.type === bestWeakType);
      const squad = (rt?.entries || []).slice(0, 3).map((e) => ({
        id: e.id,
        name: e.name,
        from: e.from || undefined,
        shadow: e.shadow,
        moveset: e.moveset,
        iv: e.iv,
        cp: e.cp,
        level: e.level,
        eff: weak[0]?.x ?? 1.0,
        type: bestWeakType,
        src: 'raid_teams' as const,
      }));
      const owned = spMatch ? mons.filter((m) => m.dex === spMatch.dex && !isOutOfPlay(m)) : [];
      return {
        name: cleanSpeciesName(nameStr),
        sid: spMatch?.speciesId || sidGuess,
        known: Boolean(spMatch),
        mega: nameStr.toLowerCase().includes('mega'),
        shadow: nameStr.toLowerCase().includes('shadow'),
        types,
        weak: weak.slice(0, 4),
        status: {
          owned: owned.length,
          best_iv: owned.length ? Math.max(...owned.map((m) => m.iv_pct)) : 0,
          best_cp: owned.length ? Math.max(...owned.map((m) => m.cp)) : 0,
          hundo: owned.some((m) => m.iv_pct >= 100),
          shiny: owned.some((m) => m.is_shiny),
          shadow: owned.filter((m) => m.is_shadow).length,
          to_transfer: spMatch ? mons.filter((m) => m.dex === spMatch.dex && m.verdict === 'TRANSFER').length : 0,
        },
        squad,
        mega_slot: rt?.mega
          ? { name: rt.mega.name, boosts: bestWeakType, eff: weak[0]?.x ?? 1.0 }
          : null,
      };
    });

    const bonuses = Array.isArray(extra.bonuses)
      ? extra.bonuses.map((b) => b.text || '').filter(Boolean)
      : [];

    return {
      id: ev.eventID || `ev-${idx}`,
      name: ev.name || 'Event',
      type: ev.eventType || 'event',
      heading: ev.heading || ev.eventType || 'Event',
      when: ev.start ? `${ev.start.slice(0, 10)}${ev.end ? ' → ' + ev.end.slice(0, 10) : ''}` : 'TBD',
      start: ev.start || null,
      end: ev.end || null,
      status,
      link: ev.link || '',
      skip: '',
      score: status === 'live' ? 90 : status === 'soon' ? 75 : 50,
      bonuses,
      notes: [],
      wish_notes: spRows.length ? [`Counters ready using ${spRows[0].squad[0]?.type || 'top'} raid squad.`] : [],
      matches: [],
      species: spRows,
    };
  });

  const liveCount = evList.filter((e) => e.status === 'live').length;
  const soonCount = evList.filter((e) => e.status === 'soon').length;

  const focus: BriefingData['focus'] = [];
  if (transferTotal > 0) {
    focus.push({
      score: 95,
      kind: 'cleanup',
      tab: 'out',
      title: `Transfer ${transferTotal} safe surplus Pokémon`,
      when: 'Today',
      lines: ['Free up bag space and earn candy using pre-checked in-game search strings.'],
    });
  }
  if (levelThese[0]) {
    focus.push({
      score: 90,
      kind: 'build',
      tab: 'plan',
      title: `Priority build: ${levelThese[0].species} (${levelThese[0].iv})`,
      when: levelThese[0].can_build_now ? 'Ready Now' : 'Next build',
      lines: [levelThese[0].role, levelThese[0].why[0] || ''].filter(Boolean),
    });
  }
  for (const ev of evList.filter((e) => e.status === 'live' || e.status === 'soon').slice(0, 2)) {
    focus.push({
      score: ev.score,
      kind: ev.type,
      tab: 'today',
      title: ev.name,
      when: ev.when,
      lines: ev.bonuses.slice(0, 2),
      event: ev.name,
    });
  }

  const exportIso =
    rawData.exportTime
      ? String(rawData.exportTime)
      : new Date(exportRefMs || Date.now()).toISOString().slice(0, 10);

  return {
    now: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    events_ok: remote.eventsOk && evList.length > 0,
    feed_age_hours: remote.feedAgeHours,
    headline: {
      buddy,
      runner_up: runnerUp,
      current_buddy: buddyTracker.active_buddy
        ? { name: buddyTracker.active_buddy.name, cp: buddyTracker.active_buddy.cp }
        : null,
      mega_push: megaPriority[0]
        ? { name: megaPriority[0].form, event: evList[0]?.name || 'Daily Raid Rotation', unlocked: true, level: 2 }
        : null,
      do_first:
        transferTotal > 0
          ? `Clear ${transferTotal} safe transfers, then power up ${levelThese[0]?.species || 'your top raid counters'}.`
          : `Focus on ${levelThese[0]?.species || 'closing raid coverage gaps'}.`,
      live: liveCount,
      soon: soonCount,
    },
    focus,
    events: evList,
    skip: [],
    storage: {
      stored,
      cap,
      pct: Math.round((100 * stored) / Math.max(1, cap)),
      free: Math.max(0, cap - stored),
      after_transfer: Math.max(0, stored - transferTotal),
      to_transfer: transferTotal,
    },
    account: {
      stored,
      cap,
      free: Math.max(0, cap - stored),
      stardust,
      xl_candy: bag.xl_candy,
      rare_candy: bag.rare_candy,
      premium_passes: bag.premium_passes,
      remote_passes: bag.remote_passes,
      charged_tms: bag.charged_tms,
      fast_tms: bag.fast_tms,
      lucky_eggs: bag.lucky_eggs,
      golden_razz: bag.golden_razz,
      star_pieces: bag.star_pieces,
      master_balls: bag.master_balls,
      level: Number(playerObj.level ?? accRaw.level ?? 40),
      km: Math.round(Number(playerObj.kmWalked ?? accRaw.kmWalked ?? 0)),
      hundos: mons.filter((m) => m.iv_pct >= 100).length,
      shinies: mons.filter((m) => m.is_shiny).length,
      lucky: mons.filter((m) => m.is_lucky).length,
      shadow: mons.filter((m) => m.is_shadow).length,
      purified: mons.filter((m) => m.is_purified).length,
      export_time: exportIso,
    },
    dust_plan: {
      dust: stardust,
      spend: levelThese.slice(0, 5).reduce((s, r) => s + r.cost.dust, 0),
      xl: levelThese.slice(0, 5).reduce((s, r) => s + r.cost.xl, 0),
      queue_total: levelThese.length,
      first_cost: levelThese[0]?.cost.dust || 0,
      targets: levelThese.slice(0, 4).map((r) => ({ species: r.species, iv: r.iv, dust: r.cost.dust })),
    },
  };
}

export function buildPriorityLists(
  reportMons: ReportMon[],
  byUid: Map<string, MonModel>,
  stardust: number | null,
): { priority: ReportJson['priority']; evolve: EvolveItem[] } {
  const ml: PriorityEntry[] = [];
  const glul: PriorityEntry[] = [];
  const dn: PriorityEntry[] = [];
  const evolve: EvolveItem[] = [];

  for (const r of reportMons) {
    const m = byUid.get(r.id);
    if (!m) continue;

    if (r.evolve_to && !isOutOfPlay(m)) {
      const evoReq = requiredEvolutionItem(r.evolve_to, r.evolve_to_sid);
      const evoLow = r.evolve_to.toLowerCase();
      let itemLabel = evoReq?.label || '';
      if (!itemLabel && m.dex === 888 && evoLow.includes('crowned')) itemLabel = '1,000 Sword Energy';
      else if (!itemLabel && m.dex === 889 && evoLow.includes('crowned')) itemLabel = '1,000 Shield Energy';
      else if (!itemLabel && m.dex === 800 && (evoLow.includes('dusk') || evoLow.includes('dawn'))) itemLabel = '1,000 Fusion Energy';
      else if (!itemLabel && m.dex === 646 && (evoLow.includes('black') || evoLow.includes('white'))) itemLabel = '1,000 Fusion Energy';
      evolve.push({
        id: r.id,
        species: r.species,
        cp: r.cp,
        iv: r.iv,
        iv_pct: r.iv_pct,
        target: r.evolve_to,
        candy: r.cost_candy,
        item: itemLabel,
        via: null,
        role: r.role,
        wait_cd_move: r.wait_cd_move || null,
        wait_cd_reason: r.wait_cd_reason,
        search: r.search,
      });
    }

    if (isOutOfPlay(m)) continue;

    if (r.verdict === 'BUILD_PVP' && m.best_pvp) {
      const needsInvestment =
        r.cost_dust > 0 || r.cost_candy > 0 || r.cost_xl > 0 || Boolean(r.evolve_to);
      if (!needsInvestment) continue;
      const e = m.best_pvp;
      const entry: PriorityEntry = {
        id: r.id,
        league: e.league,
        species: r.evolve_to ? `${r.species} → ${r.evolve_to}` : r.species,
        cp: r.cp,
        iv: r.iv,
        iv_rank: e.iv_rank,
        species_rank: e.species_rank,
        combined: e.composite,
        from: Math.round(r.level * 10) / 10,
        to: e.target_level,
        target_cp: e.target_cp,
        dust: r.cost_dust,
        candy: r.cost_candy,
        xl: r.cost_xl,
        tag: `${e.league} #${e.species_rank}`,
        shadow: m.is_shadow,
        needs_second_move: Boolean(r.needs_second_move) || r.build_status === 'Needs second charged move',
      };
      if (e.cap >= 10000) ml.push(entry);
      else glul.push(entry);
    } else if (m.pvp.some((p) => !p.eligible && p.ineligible_reason)) {
      const bad = m.pvp.find((p) => !p.eligible && p.ineligible_reason)!;
      dn.push({
        id: r.id,
        league: bad.league,
        species: r.species,
        cp: r.cp,
        iv: r.iv,
        iv_rank: bad.iv_rank,
        species_rank: bad.species_rank,
        combined: bad.composite,
        from: Math.round(r.level * 10) / 10,
        to: bad.target_level,
        target_cp: bad.target_cp,
        dust: 0,
        candy: 0,
        xl: 0,
        tag: 'Over cap / low IV',
        hint: bad.ineligible_reason,
      });
    }
  }

  ml.sort((a, b) => a.combined - b.combined);
  glul.sort((a, b) => a.combined - b.combined);
  const spendFirst = [...ml, ...glul]
    .filter((x) => !stardust || x.dust <= stardust)
    .sort((a, b) => a.dust - b.dust || a.combined - b.combined)
    .slice(0, 12);

  return {
    priority: {
      ml: ml.slice(0, 40),
      glul: glul.slice(0, 40),
      dn: dn.slice(0, 30),
      spend_first: spendFirst,
      dust_budget: stardust ?? undefined,
    },
    evolve: evolve.slice(0, 40),
  };
}

export function auditReport(report: ReportJson): AuditCheck[] {
  const outIds = new Set(report.mons.filter((m) => OUT_OF_PLAY.has(m.verdict)).map((m) => m.id));
  const checks: AuditCheck[] = [];

  const checkIds = (label: string, ids: (string | undefined)[]) => {
    const leaks = ids.filter((id) => id && outIds.has(id));
    checks.push({
      check: label,
      ok: leaks.length === 0,
      detail: leaks.length === 0 ? 'clean' : `${leaks.length} out-of-play id(s) leaked`,
    });
  };

  checkIds(
    'raid_teams exclude TRADE/REVIEW/TRANSFER',
    report.raid_teams.flatMap((t) => [t.mega?.id, ...t.entries.map((e) => e.id)]),
  );
  checkIds(
    'max_teams exclude TRADE/REVIEW/TRANSFER',
    report.max_teams.flatMap((t) => t.entries.map((e) => e.id)),
  );
  checkIds(
    'pvp_teams exclude TRADE/REVIEW/TRANSFER',
    report.teams.flatMap((lg) => lg.teams.flatMap((tm) => tm.members.map((m) => m.id))),
  );
  checkIds('mega_priority excludes TRADE/REVIEW/TRANSFER', report.mega.priority.map((p) => p.id));
  checkIds('build_plan excludes TRADE/REVIEW/TRANSFER', (report.grade.level_these || []).map((x) => x.id));
  checkIds('max_support excludes TRADE/REVIEW/TRANSFER', [
    ...(report.max_battle?.tanks || []),
    ...(report.max_battle?.healers || []),
  ].map((x) => x.id));

  const holdSum = (report.holding || []).reduce((s, h) => s + h.count, 0);
  checks.push({
    check: 'holding totals match box count',
    ok: holdSum === report.mons.length,
    detail: `${holdSum} == ${report.mons.length}`,
  });

  const wishLeaks: string[] = [];
  const checkWishRows = (rows: WishlistRow[]) => {
    for (const r of rows) {
      if ((r.status === 'HAVE' || r.status === 'UPGRADE') && r.best?.id && outIds.has(r.best.id)) {
        wishLeaks.push(`${r.species}:${r.status}`);
      }
    }
  };
  Object.values(report.grade.wishlist_all.raid).forEach((b) => checkWishRows(b.rows));
  report.grade.wishlist_all.pvp.forEach((b) => checkWishRows(b.rows));
  Object.values(report.grade.wishlist_all.mega).forEach((b) => checkWishRows(b.rows));
  Object.values(report.grade.wishlist_all.max).forEach((b) => checkWishRows(b.rows));
  checks.push({
    check: 'wishlists never mark TRADE/REVIEW/TRANSFER as HAVE or UPGRADE',
    ok: wishLeaks.length === 0,
    detail: wishLeaks.length === 0 ? 'clean' : wishLeaks.slice(0, 5).join(', '),
  });

  const raidDupes: string[] = [];
  const raidBadCaps: string[] = [];
  for (const rt of report.raid_teams) {
    const seen = new Set<string>();
    let teamCount = 0;
    let backupCount = 0;
    for (const e of rt.entries) {
      if (seen.has(e.id)) raidDupes.push(`${rt.type}:${e.name}`);
      seen.add(e.id);
      if (e.slot === 'team') teamCount++;
      else backupCount++;
    }
    if (teamCount > 6 || backupCount > 2) {
      raidBadCaps.push(`${rt.type}(${teamCount}t/${backupCount}b)`);
    }
    const megaInTeam = rt.entries.find((e) => e.is_mega);
    if (rt.mega && (!megaInTeam || megaInTeam.slot !== 'team' || megaInTeam.slot_num !== 1)) {
      raidBadCaps.push(`${rt.type}(mega_not_slot1)`);
    }
  }
  checks.push({
    check: 'raid_teams slot Mega #1 + 5 team + 2 spares without duplicates',
    ok: raidDupes.length === 0 && raidBadCaps.length === 0,
    detail:
      raidDupes.length === 0 && raidBadCaps.length === 0
        ? 'clean'
        : [...raidDupes, ...raidBadCaps].slice(0, 5).join(', '),
  });

  return checks;
}

export function buildFullReport(params: {
  rawData: Record<string, unknown>;
  mons: MonModel[];
  eggRecords?: RawPokemon[];
  exportRefMs?: number;
  dex: Dex;
  sizeCtx: SizeContext;
  cfg: PogoConfig;
  remote: RemoteGameData;
  caps: number[];
  cups: Record<string, CupDef>;
  auxMap: Map<string, MonAux>;
  placementRaid: PlacementSummary;
  placementMax: PlacementSummary;
  eggs: number;
  covState: CoverageState;
}): ReportJson {
  const {
    rawData,
    mons,
    eggRecords = [],
    exportRefMs = Date.now(),
    dex,
    sizeCtx,
    cfg,
    remote,
    caps,
    cups,
    auxMap,
    placementRaid,
    placementMax,
    eggs,
    covState,
  } = params;

  const byUid = new Map(mons.map((m) => [m.uid, m]));
  const bagResources = extractBagResources(rawData, mons);
  const tagSummary = evaluateTagConflicts(mons, rawData, cfg);
  const tagAudit = buildTagAudit(mons);
  const buddyTracker = buildBuddyTracker(rawData, mons);
  const tradeMatcher = buildTradeMatcher(mons, rawData);
  const eggsSummary = analyzeEggs(eggRecords, mons, dex);
  const bottleCaps = buildBottleCapRecommendations(mons, dex, bagResources);
  const savedParties = auditSavedBattleParties(rawData, mons, dex);
  const gblSummary = buildGblSummary(rawData);
  const battleMvps = buildBattleMvps(mons);
  const originProtection = buildOriginProtectionSummary(rawData, mons, exportRefMs);
  const eeveeTracker = buildEeveeTracker(rawData, mons);
  const megaOptimizer = buildMegaOptimizer(mons, dex, exportRefMs);
  const curatedMegas = buildCuratedMegaStatus(mons, dex);
  const buddyPlanner = buildBuddyPoffinPlan(rawData, mons, bagResources);
  const itemsAudit = buildItemsAndStorageAudit(rawData, mons, bagResources, exportRefMs);
  const liveGyms = buildLiveGymsData(rawData, mons, exportRefMs);
  const medalsHub = buildMedalsHub(rawData);
  const xpPlanner = buildXpLevelPlan(rawData, mons, bagResources, dex);
  const manualKeepSet = new Set(cfg.manual_keep_ids || []);
  const manualTransferSet = new Set(
    (cfg.manual_transfer_ids || []).filter((id) => !manualKeepSet.has(id)),
  );

  const reportMons: ReportMon[] = mons.map((m) => {
    const spLabel = displaySpecies(m);
    const costs = buildRowCosts(m, dex.byId);
    const moves = currentMoves(dex.pve, m);
    const { fields } = readinessFields(dex.pve, m, dex, m.verdict, cfg);
    const flags: string[] = [];
    if (m.is_shadow) flags.push('Shadow');
    if (m.is_purified) flags.push('Purified');
    if (m.is_shiny) flags.push('Shiny');
    if (m.is_lucky) flags.push('Lucky');
    if (m.is_dynamax) flags.push('Dynamax');
    if (m.is_gigantamax) flags.push('Gigantamax');
    if (m.has_mega_unlocked) flags.push(`Mega Lv${Math.max(1, m.mega_level)}`);
    if (m.is_costume) flags.push('Costume');
    if (m.location_card) flags.push('BG');
    if (manualKeepSet.has(m.uid) || manualTransferSet.has(m.uid)) flags.push('Manual Override');

    // Feature 3: Community Day / Legacy Evolution Alarm
    let waitCdMove: string | null = null;
    let waitCdReason: string | undefined;
    if (m.evolve_to_sid && !isOutOfPlay(m)) {
      const targetSp = dex.byId.get(m.evolve_to_sid.replace(/_shadow$/, ''));
      const eliteIds = new Set((targetSp?.eliteMoves || []).map((e) => String(e).toUpperCase()));
      if (targetSp && eliteIds.size > 0) {
        const mvParts = (m.moveset || '')
          .split(' / ')
          .map((p) => p.trim())
          .filter(Boolean);
        const cdHits = mvParts.filter(
          (mv) =>
            eliteIds.has(moveIdent(mv)) ||
            (fields.needs_elite_moves || []).some((em) => em.toLowerCase() === mv.toLowerCase()),
        );
        if (cdHits.length > 0) {
          waitCdMove = cdHits.join(' / ');
          waitCdReason = `DO NOT EVOLVE YET — evolving into ${cleanSpeciesName(targetSp.speciesName)} outside a Community Day / Legacy event misses ${waitCdMove} (saves an Elite TM).`;
        }
      }
    }

    let hold = 'transfer';
    if (m.verdict === 'TRADE') hold = 'trade';
    else if (m.verdict === 'REVIEW') hold = 'review';
    else if (m.verdict.startsWith('BUILD_')) hold = 'build';
    else if (getAux(auxMap, m).mega_home) hold = 'mega_reserve';
    else if (m.variant_keep) hold = 'variant';
    else if (m.verdict !== 'TRANSFER') hold = 'protect_other';

    return {
      id: m.uid,
      verdict: m.verdict,
      species: spLabel,
      sid: m.species?.speciesId || '',
      form: m.form_name,
      dex: m.dex,
      cp: m.cp,
      level: Math.round(m.level * 10) / 10,
      iv: ivStr(m),
      a: m.a,
      d: m.d,
      s: m.s,
      iv_pct: m.iv_pct,
      flags,
      role: m.role,
      evolve_to: m.evolve_to,
      evolve_to_sid: m.evolve_to_sid,
      power_up_to: m.power_up_to,
      build_cp: m.build_cp,
      moveset: m.moveset,
      moves,
      moves_need: movesNeeded(dex.pve, m),
      best_pvp: m.best_pvp ? `${m.best_pvp.league} #${m.best_pvp.species_rank} (IV #${m.best_pvp.iv_rank})` : '',
      why: m.why_keep,
      warnings: m.warnings,
      search: ingameSearch(m, spLabel),
      cost_dust: costs.dust,
      cost_candy: costs.candy,
      cost_xl: costs.xl,
      raid_type: m.raid_type || '',
      max_type: m.max_type || '',
      mega_type: m.mega_type || '',
      pvp: m.pvp.map((p) => ({
        league: p.league,
        cap: p.cap,
        species_rank: p.species_rank,
        iv_rank: p.iv_rank,
        combined: p.composite,
        eligible: p.eligible,
      })),
      shadow: m.is_shadow,
      lucky: m.is_lucky,
      purified: m.is_purified,
      year: m.year,
      hold,
      origin_label: m.origin_label,
      is_traded: m.is_traded,
      mon_tags: m.mon_tags,
      tag_conflicts: m.tag_conflicts,
      mega_level: m.mega_level,
      mega_forms: m.mega_forms,
      in_contest: m.in_contest,
      legacy_size_unknown: m.legacy_size_unknown,
      purify_preview: m.purify_preview,
      pvp_battle: m.pvp_battle || null,
      battles_attacked: m.battles_attacked,
      battles_defended: m.battles_defended,
      pvp_battles: m.pvp_battles,
      pvp_wins: m.pvp_wins,
      npc_battles: m.npc_battles,
      catch_floor: m.catch_floor,
      from_fort: m.from_fort,
      hatched_from_egg: m.hatched_from_egg,
      weather_boosted: m.weather_boosted,
      caught_in_party: m.caught_in_party,
      untradable_traded: m.untradable_traded,
      is_fusion: m.is_fusion,
      origin_move: m.origin_move,
      origin_events: m.origin_events,
      location_card: m.location_card,
      manual_override: manualKeepSet.has(m.uid)
        ? 'keep'
        : manualTransferSet.has(m.uid)
        ? 'transfer'
        : null,
      wait_cd_move: waitCdMove,
      wait_cd_reason: waitCdReason,
      ...fields,
      ...(m.is_dynamax || m.is_gigantamax
        ? {
            max_move: {
              attack: m.max_attack_level,
              guard: m.max_guard_level,
              spirit: m.max_spirit_level,
              gain_pct: maxMoveGainPct(m),
              gmax: m.is_gigantamax,
            },
          }
        : {}),
    };
  });

  reportMons.sort(
    (a, b) =>
      (VERDICT_ORDER.indexOf(a.verdict) >= 0 ? VERDICT_ORDER.indexOf(a.verdict) : 9) -
        (VERDICT_ORDER.indexOf(b.verdict) >= 0 ? VERDICT_ORDER.indexOf(b.verdict) : 9) ||
      b.iv_pct - a.iv_pct ||
      b.cp - a.cp,
  );

  const verdicts: Record<string, number> = {};
  const gates: Record<string, number> = { raid: 0, max: 0, mega: 0, gym: 0 };
  const special: Record<string, number> = {
    hundos: 0,
    nundos: 0,
    shiny: 0,
    shadow: 0,
    lucky: 0,
    purified: 0,
    dynamax: 0,
    gigantamax: 0,
    mega_unlocked: 0,
    costume: 0,
  };
  const roleCounts = new Map<string, number>();

  for (const m of mons) {
    verdicts[m.verdict] = (verdicts[m.verdict] || 0) + 1;
    if (m.raid_reject) gates.raid++;
    if (m.max_reject) gates.max++;
    if (getAux(auxMap, m).gate_review_kinds.has('mega')) gates.mega++;
    if (m.gym_reject) gates.gym++;
    if (m.iv_pct >= 100) special.hundos++;
    if (m.a === 0 && m.d === 0 && m.s === 0) special.nundos++;
    if (m.is_shiny) special.shiny++;
    if (m.is_shadow) special.shadow++;
    if (m.is_lucky) special.lucky++;
    if (m.is_purified) special.purified++;
    if (m.is_dynamax) special.dynamax++;
    if (m.is_gigantamax) special.gigantamax++;
    if (m.has_mega_unlocked) special.mega_unlocked++;
    if (m.is_costume) special.costume++;
    if (m.role && m.verdict !== 'TRANSFER') {
      roleCounts.set(m.role, (roleCounts.get(m.role) || 0) + 1);
    }
  }

  const coverage: ReportJson['coverage'] = RAID_USEFUL_TYPES.map((t) => {
    const ref = refDps(dex, dex.raidRankings, t, true);
    const usableMons = mons.filter((m) => {
      if (isOutOfPlay(m) || m.raid_type !== t || m.level < covState.floorLevel) return false;
      const pct = ref > 0 ? (100 * m.raid_dps) / ref : 0;
      return pct >= covState.minDpsPct;
    });
    const ranked = dex.raidRankings.get(t) || [];
    const fix = ranked.slice(0, 3).map(([sid]) => spName(dex, sid));
    return {
      type: t,
      status: usableMons.length >= covState.minPerType ? 'OK' : 'GAP',
      usable: usableMons.length,
      below: covState.below[t] || 0,
      names: usableMons.slice(0, 6).map((m) => displaySpecies(m)),
      fix,
    };
  });

  const teams = buildPvpTeams(mons, dex, cfg, caps);
  const cupTeams = buildCupTeams(mons, dex, cfg, cups);
  const raidTeams = buildRaidTeams(mons, dex, cfg, bagResources);
  const maxTeams = buildMaxTeams(mons, dex, cfg);
  const megaSection = buildMegaSection(mons, dex, auxMap);
  const maxBattleSupport = maxSupportPicks(mons, dex);
  const showcase = buildShowcase(mons, sizeCtx);
  const transfer = buildTransferBlock(mons, cfg);
  const grade = computeGradeAndDetails(
    mons,
    reportMons,
    dex,
    caps,
    cups,
    teams,
    cupTeams,
    raidTeams,
    maxTeams,
    megaSection,
    coverage,
    bagResources,
    curatedMegas,
  );
  const holding = buildHoldSummary(mons, auxMap);
  const briefing = buildBriefing(
    rawData,
    mons,
    dex,
    remote,
    raidTeams,
    megaSection.priority,
    transfer.total,
    grade.level_these,
    bagResources,
    buddyTracker,
    exportRefMs,
  );
  const { priority, evolve } = buildPriorityLists(
    reportMons,
    byUid,
    briefing.account.stardust || null,
  );
  const waitCdMons = reportMons
    .filter((r) => Boolean(r.wait_cd_move))
    .map((r) => byUid.get(r.id))
    .filter((m): m is MonModel => Boolean(m));
  const evolve_wait_cd_chunks = buildSafeSearchChunks(waitCdMons, mons, '', 1950);

  const report: ReportJson = {
    meta: {
      generated: new Date().toISOString(),
      export_time: briefing.account.export_time,
      gm_date: remote.gm?.timestamp || 'Offline Snapshot',
      gm_age_days: remote.gmAgeDays,
      mons: mons.length,
      eggs,
      pve_model: dex.pve.ok ? 'PokeMiners PvE GameMaster' : 'PvPoke Fallback Model',
      source: remote.sourceLabel,
      sorter: 'pogo-sorter-js 2.0',
    },
    counts: {
      verdicts,
      gates,
      special,
      roles: Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20),
    },
    readiness: readinessSummary(reportMons, byUid, dex, cfg),
    mons: reportMons,
    teams,
    raid_teams: raidTeams,
    max_teams: maxTeams,
    mega: megaSection,
    coverage,
    coverage_min: covState.minPerType,
    evolve,
    evolve_wait_cd_chunks,
    transfer,
    priority,
    budget: {
      stardust: briefing.account.stardust,
      totals: {
        dust_needed: reportMons.reduce((s, r) => s + r.cost_dust, 0),
        candy_needed: reportMons.reduce((s, r) => s + r.cost_candy, 0),
        xl_needed: reportMons.reduce((s, r) => s + r.cost_xl, 0),
      },
    },
    bag_resources: bagResources,
    saved_parties: savedParties,
    trade_matcher: tradeMatcher,
    buddy_tracker: buddyTracker,
    eggs_summary: eggsSummary,
    bottle_caps: bottleCaps,
    tag_summary: tagSummary,
    gbl_summary: gblSummary,
    battle_mvps: battleMvps,
    origin_protection: originProtection,
    eevee_tracker: eeveeTracker,
    tag_audit: tagAudit,
    mega_optimizer: megaOptimizer,
    curated_megas: curatedMegas,
    buddy_planner: buddyPlanner,
    items_audit: itemsAudit,
    live_gyms: liveGyms,
    medals_hub: medalsHub,
    xp_planner: xpPlanner,
    notes: [
      dex.pve.ok
        ? 'PvE moves & PvP combat buffs evaluated with PokeMiners GameMaster data.'
        : 'Using built-in PvE move estimates (remote PokeMiners GameMaster unavailable).',
      `${mons.length} Pokémon evaluated globally across Raids, Max Battles, Megas, and ${caps.length} PvP Leagues with Battle Matrix simulation.`,
    ],
    grade,
    holding,
    briefing,
    max_battle: maxBattleSupport,
    showcase,
    placement: {
      raid: placementRaid,
      max: placementMax,
    },
    settings: {
      leagues: caps.map(String),
      cups: Object.keys(cups),
      available_leagues: Object.entries(LEAGUE_NAMES).map(([capStr, name]) => ({
        id: capStr,
        name: `${name} League`,
        cap: Number(capStr),
      })),
      available_cups: Object.entries(BASE_CUPS).map(([key, def]) => ({
        key,
        name: def.title,
      })),
      user_cfg: cfg as unknown as Record<string, unknown>,
    },
    audit: [],
  };

  report.audit = auditReport(report);
  return report;
}

export function serializeReportCsv(rows: ReportMon[]): string {
  const headers = [
    'Verdict',
    'Species',
    'Form',
    'Dex',
    'CP',
    'Level',
    'IV',
    'IV%',
    'Role',
    'Moves',
    'Needs Moves',
    'Status',
    'Build Dust',
    'Search String',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.verdict,
        r.species,
        r.form,
        r.dex,
        r.cp,
        r.level,
        r.iv,
        r.iv_pct,
        r.role,
        r.moves.map((m) => m.name).join(' / '),
        (r.needs_moves || []).concat(r.needs_elite_moves || []).join(' / '),
        r.build_status || '',
        r.cost_dust,
        r.search,
      ]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n');
}
