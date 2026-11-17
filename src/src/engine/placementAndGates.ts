import {
  cleanSpeciesName,
  CROWNED_MAX_OVERRIDE,
  GMAX_MOVE_POWER,
  LEAGUE_NAMES,
  MAX_BATTLE_TYPES,
  MAX_DAMAGE_DIV,
  MAX_MOVE_POWER,
  normStr,
  RAID_USEFUL_TYPES,
  STAB,
} from './defaultConfig';
import {
  getCuratedMegaInfo,
  getPokebaseMegaTier,
  isCuratedMega,
  resolveActiveCuratedMegaSids,
} from './megaCurated';
import { bestPvpLevel, computeCp, CPM } from './cpmTable';
import {
  boostTypesFor,
  ingameSearch,
  isCrownedForm,
  ivStr,
} from './pgsParser';
import {
  canJoinMaxBattle,
  currentMaxMoveType,
  Dex,
  estimatedMaxDps,
  estimatedRaidDps,
  moveLabel,
  pickRaidMoveset,
  raidBulk,
  refDps,
  spName,
} from './pveModel';
import type {
  CupDef,
  MonModel,
  PogoConfig,
  PvpEntry,
} from './types';

export interface PlacementMovedRow {
  id: string;
  name: string;
  iv: string;
  level: number;
  from: string;
  to: string;
  why: string;
}

export interface PlacementSummary {
  covered_before: number;
  covered_after: number;
  types: number;
  moved: PlacementMovedRow[];
}

export interface MonAux {
  mega_home: boolean;
  mega_base_sid: string | null;
  mega_family_sid: string | null;
  mega_evo_target: string;
  can_mega: boolean;
  is_mega_pre_evo: boolean;
  purify_for_mega: boolean;
  gate_review_kinds: Set<string>;
  iv_hi: boolean;
  species_rank: number | null;
  species_rank_league: string;
  verdict_priority: number;
  gym_sid: string | null;
  raid_reserve_msg: string;
  max_reserve_msg: string;
  raid_placed_slot: 'team' | 'backup' | null;
  max_placed_slot: 'team' | 'backup' | null;
}

export function getAux(auxMap: Map<string, MonAux>, m: MonModel): MonAux {
  let aux = auxMap.get(m.uid);
  if (!aux) {
    aux = {
      mega_home: false,
      mega_base_sid: null,
      mega_family_sid: null,
      mega_evo_target: '',
      can_mega: false,
      is_mega_pre_evo: false,
      purify_for_mega: false,
      gate_review_kinds: new Set<string>(),
      iv_hi: false,
      species_rank: null,
      species_rank_league: '',
      verdict_priority: 99,
      gym_sid: null,
      raid_reserve_msg: '',
      max_reserve_msg: '',
      raid_placed_slot: null,
      max_placed_slot: null,
    };
    auxMap.set(m.uid, aux);
  }
  return aux;
}

export const CAPPABLE_CATEGORY_PREFIXES = ['shiny', 'lucky', 'costume', 'legendary', 'form'] as const;

export function variantTags(m: MonModel): string[] {
  const tags: string[] = [];
  if (m.is_shiny) tags.push('shiny');
  if (m.is_lucky) tags.push('lucky');
  if (m.is_costume) tags.push('costume');
  if (m.species?.tags?.some((t) => ['legendary', 'mythical', 'ultrabeast'].includes(t))) {
    tags.push('legendary');
  }
  const fn = (m.form_name || '').trim();
  const fnLow = fn.toLowerCase();
  if (
    fn &&
    !m.is_costume &&
    fnLow !== 'unset' &&
    !fnLow.endsWith('normal') &&
    !fnLow.endsWith('standard') &&
    !/^\d+$/.test(fn)
  ) {
    tags.push('form');
  }
  return tags;
}

export function variantKey(m: MonModel, tag: string, cfg: PogoConfig): string {
  const rule = cfg.variant_rules?.[tag];
  const keys = rule?.key || ['dex', 'form'];
  const parts: string[] = [];
  for (const k of keys) {
    if (k === 'dex') parts.push(String(m.dex));
    else if (k === 'form') parts.push(normStr(m.form_name) || 'base');
    else if (k === 'gender') parts.push(String(m.gender));
    else if (k === 'costume') parts.push(m.is_costume ? normStr(m.form_name) : '0');
    else if (k === 'shiny') parts.push(m.is_shiny ? '1' : '0');
  }
  return parts.join(':');
}

export function applyVariantRules(
  mons: MonModel[],
  cfg: PogoConfig,
  auxMap: Map<string, MonAux>,
): void {
  const vr = cfg.variant_rules || {};
  const groups = new Map<string, MonModel[]>();
  const keepTags = new Map<string, Set<string>>();
  const tradeTags = new Map<string, Set<string>>();

  for (const m of mons) {
    keepTags.set(m.uid, new Set());
    tradeTags.set(m.uid, new Set());
    for (const tag of variantTags(m)) {
      if (!vr[tag]) continue;
      const k = `${tag}|${variantKey(m, tag, cfg)}`;
      const arr = groups.get(k) || [];
      arr.push(m);
      groups.set(k, arr);
    }
  }

  for (const [fullKey, bucket] of groups.entries()) {
    const tag = fullKey.split('|', 1)[0];
    const rule = vr[tag];
    if (!rule) continue;
    bucket.sort((a, b) => b.iv_pct - a.iv_pct || b.cp - a.cp || b.level - a.level || a.idx - b.idx);
    const keepN = Number(rule.keep ?? 1);
    const tradeN = Number(rule.trade ?? 0);

    bucket.forEach((m, idx) => {
      if (idx < keepN) keepTags.get(m.uid)!.add(tag);
      else if (idx < keepN + tradeN) tradeTags.get(m.uid)!.add(tag);
    });
  }

  for (const m of mons) {
    const k = Array.from(keepTags.get(m.uid) || []).sort();
    const t = Array.from(tradeTags.get(m.uid) || []).sort();
    m.variant_keep = k.join('+');
    m.variant_trade = t.join('+');
    if (m.variant_keep) m.protect.push(`variant(${m.variant_keep})`);
    void getAux(auxMap, m);
  }
}

export interface CoverageState {
  usable: Record<string, number>;
  below: Record<string, number>;
  gapTypes: Set<string>;
  minPerType: number;
  minDpsPct: number;
  floorLevel: number;
}

export function computeCoverageFirst(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
): CoverageState {
  const cf = cfg.coverage;
  const minPerType = Number(cf.min_attackers ?? 3);
  const minDpsPct = Number(cfg.raid.min_dps_pct_of_best_of_type ?? 65);
  const floorLevel = Number(cf.min_level ?? 25);

  const usable: Record<string, number> = {};
  const below: Record<string, number> = {};
  for (const t of RAID_USEFUL_TYPES) {
    usable[t] = 0;
    below[t] = 0;
  }

  for (const m of mons) {
    if (!m.raid_type || !m.species) continue;
    const t = m.raid_type;
    if (!(t in usable)) continue;
    const ref = refDps(dex, dex.raidRankings, t, true);
    const dps = estimatedRaidDps(m, dex) ?? 0;
    const pct = ref > 0 ? (100 * dps) / ref : 0;
    if (pct >= minDpsPct && m.level >= floorLevel) usable[t]++;
    else if (pct >= minDpsPct) below[t]++;
  }

  const gapTypes = new Set<string>();
  for (const t of RAID_USEFUL_TYPES) {
    if ((usable[t] || 0) < minPerType) gapTypes.add(t);
  }
  return { usable, below, gapTypes, minPerType, minDpsPct, floorLevel };
}

export function pveTargetLevel(m: MonModel, cfg: PogoConfig): number {
  const maxLvl = Number(cfg.coverage?.build_target_level || cfg.raid?.power_level || 40);
  if (m.level >= maxLvl) return Math.min(50, Math.max(m.level, maxLvl));
  return maxLvl;
}

// ============================================================
// GLOBAL MIN-COST MAX-FLOW PLACEMENT
// ============================================================
interface McmfEdge {
  to: number;
  rev: number;
  cap: number;
  cost: number;
}

function addEdge(adj: McmfEdge[][], u: number, v: number, cap: number, cost: number): void {
  const fwd: McmfEdge = { to: v, rev: adj[v].length, cap, cost };
  const bwd: McmfEdge = { to: u, rev: adj[u].length, cap: 0, cost: -cost };
  adj[u].push(fwd);
  adj[v].push(bwd);
}

function mcmfSolve(n: number, source: number, sink: number, adj: McmfEdge[][]): number {
  let totalFlow = 0;
  const dist = new Float64Array(n);
  const parentNode = new Int32Array(n);
  const parentEdge = new Int32Array(n);
  const inQ = new Uint8Array(n);

  while (true) {
    dist.fill(1e18);
    parentNode.fill(-1);
    inQ.fill(0);
    dist[source] = 0;
    const q: number[] = [source];
    inQ[source] = 1;
    let head = 0;

    while (head < q.length) {
      const u = q[head++];
      inQ[u] = 0;
      const edges = adj[u];
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.cap > 0 && dist[u] + e.cost + 1e-9 < dist[e.to]) {
          dist[e.to] = dist[u] + e.cost;
          parentNode[e.to] = u;
          parentEdge[e.to] = i;
          if (!inQ[e.to]) {
            q.push(e.to);
            inQ[e.to] = 1;
          }
        }
      }
    }

    if (parentNode[sink] === -1 || dist[sink] >= 0) break;

    let push = 1e9;
    let cur = sink;
    while (cur !== source) {
      const p = parentNode[cur];
      const e = adj[p][parentEdge[cur]];
      if (e.cap < push) push = e.cap;
      cur = p;
    }

    cur = sink;
    while (cur !== source) {
      const p = parentNode[cur];
      const e = adj[p][parentEdge[cur]];
      e.cap -= push;
      adj[cur][e.rev].cap += push;
      cur = p;
    }
    totalFlow += push;
  }
  return totalFlow;
}

interface PlacementCandidate {
  mon: MonModel;
  edges: { type: string; sid: string; rank: number; score: number }[];
  greedyType: string;
}

export function assignTypes(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  mode: 'raid' | 'max',
  auxMap: Map<string, MonAux>,
  /** Pokémon to leave out of this placement (e.g. raid placement skips Pokémon that already hold a Max slot). */
  skip?: (m: MonModel) => boolean,
): { placed: number; report: PlacementSummary } {
  const isMax = mode === 'max';
  const topN = isMax ? Number(cfg.max_battle.top_n_species ?? 50) : Number(cfg.raid.top_n_species ?? 50);
  const teamSlots = isMax ? Number(cfg.max_battle.keep_per_type ?? 4) : Number(cfg.raid.keep_per_type ?? 6);
  const backupSlots = Number((isMax ? cfg.max_battle.reserve_keep : cfg.raid.reserve_keep) ?? 2);
  const totalSlots = teamSlots + backupSlots;
  const typesList = isMax ? MAX_BATTLE_TYPES : RAID_USEFUL_TYPES;
  const posIdx = isMax ? dex.maxPos : dex.raidPos;
  const idxMap = isMax ? dex.maxRankings : dex.raidRankings;

  const refByType = new Map<string, number>();
  for (const t of typesList) {
    refByType.set(t, refDps(dex, idxMap, t, !isMax) || 1);
  }

  const slotWeights: number[] = [];
  for (let s = 0; s < teamSlots; s++) slotWeights.push(1.0 - s * 0.08);
  for (let b = 0; b < backupSlots; b++) slotWeights.push(0.4 - b * 0.1);

  const candidates: PlacementCandidate[] = [];
  const bw = Number(cfg.raid.bulk_weight ?? 1.0);
  const preferSh = Boolean(cfg.raid.prefer_shadow);
  const shBonus = Number(cfg.raid.shadow_dps_bonus ?? 1.2);
  const manualTransferIds = new Set(cfg.manual_transfer_ids || []);

  for (const m of mons) {
    if (!m.species || manualTransferIds.has(m.uid) || skip?.(m)) continue;
    const aux = getAux(auxMap, m);
    if (isMax) {
      if (!canJoinMaxBattle(m)) continue;
    }

    const desc = dex.descendants(m.species.speciesId);
    const edgeByType = new Map<string, { type: string; sid: string; rank: number; score: number }>();

    for (const d of desc) {
      if (isMax && !dex.canDynamax(d)) continue;
      const target = dex.byId.get(d);
      if (!target) continue;
      const atkStat = target.baseStats.atk + m.a;

      for (const t of typesList) {
        const hit = posIdx.get(t)?.get(d);
        if (!hit) continue;
        const [rank, coeff] = hit;
        if (rank > topN) continue;

        let score: number;
        if (isMax) {
          score = atkStat * CPM[40.0] * coeff;
        } else {
          const sh = Boolean(m.is_shadow && preferSh);
          const evolvedMult = d === m.species.speciesId ? 1.04 : 1.0;
          const levelMult = m.level >= 25 ? 1.03 : m.level < 15 ? 0.96 : 1.0;
          score =
            atkStat *
            CPM[40.0] *
            (sh ? shBonus : 1.0) *
            coeff *
            raidBulk(target.baseStats, m.d, m.s, sh, bw) *
            evolvedMult *
            levelMult;
        }

        const ref = refByType.get(t) || 1;
        const normScore = (100 * score) / ref;
        const prev = edgeByType.get(t);
        if (!prev || normScore > prev.score) {
          edgeByType.set(t, { type: t, sid: d, rank, score: normScore });
        }
      }
    }

    // Max Move type rules (game facts, see currentMaxMoveType): a Gigantamax Pokémon's G-Max Move is fixed by its
    // species, and a Dynamax Pokémon's Max Move follows its CURRENT Fast Attack. So these Pokémon must NOT be shuffled
    // to another team type the way Raid attackers are. Dynamax Pokémon are only locked when
    // max_battle.respect_current_fast_move is on and the Fast Attack could be read from the export.
    if (isMax) {
      const cur = currentMaxMoveType(dex, m);
      const fastLockOn = cfg.max_battle.respect_current_fast_move !== false;
      if (cur && (cur.why !== 'fast' || fastLockOn)) {
        const kept = edgeByType.get(cur.type);
        edgeByType.clear();
        if ((cur.why === 'gmax' || cur.why === 'fixed') && m.species) {
          // G-Max uses the G-Max Move power; Crowned Zacian/Zamazenta use the normal Max Move power (estimate).
          const power = cur.why === 'gmax' ? GMAX_MOVE_POWER[3] : MAX_MOVE_POWER[3];
          const stab = (m.species.types || []).some((x) => x.toLowerCase() === cur.type) ? STAB : 1.0;
          const gCoeff = (power * stab) / MAX_DAMAGE_DIV;
          const gScore = (m.species.baseStats.atk + m.a) * CPM[40.0] * gCoeff;
          const rows = idxMap.get(cur.type) || [];
          const gRank = 1 + rows.filter(([, c]) => c > gCoeff).length;
          if (gRank <= topN) {
            edgeByType.set(cur.type, {
              type: cur.type,
              sid: m.species.speciesId,
              rank: gRank,
              score: (100 * gScore) / (refByType.get(cur.type) || 1),
            });
          }
        } else if (kept) {
          edgeByType.set(cur.type, kept);
        }
      }
    }

    if (edgeByType.size > 0) {
      const edges = Array.from(edgeByType.values()).sort((a, b) => b.score - a.score);
      candidates.push({ mon: m, edges, greedyType: edges[0].type });
    }
  }

  const M = candidates.length;
  const T = typesList.length;
  const totalNodes = 1 + M + T * totalSlots + 1;
  const source = 0;
  const sink = totalNodes - 1;
  const adj: McmfEdge[][] = Array.from({ length: totalNodes }, () => []);

  const monOffset = 1;
  const slotOffset = 1 + M;
  const slotIndex = (tIdx: number, sIdx: number) => slotOffset + tIdx * totalSlots + sIdx;
  const typeToIdx = new Map<string, number>();
  typesList.forEach((t, i) => typeToIdx.set(t, i));

  for (let i = 0; i < M; i++) {
    addEdge(adj, source, monOffset + i, 1, 0);
    for (const edge of candidates[i].edges) {
      const tIdx = typeToIdx.get(edge.type);
      if (tIdx === undefined) continue;
      for (let s = 0; s < totalSlots; s++) {
        const cost = -edge.score * slotWeights[s] - (edge.rank <= 5 ? 2 : 0);
        addEdge(adj, monOffset + i, slotIndex(tIdx, s), 1, cost);
      }
    }
  }

  for (let tIdx = 0; tIdx < T; tIdx++) {
    for (let s = 0; s < totalSlots; s++) {
      addEdge(adj, slotIndex(tIdx, s), sink, 1, 0);
    }
  }

  mcmfSolve(totalNodes, source, sink, adj);

  const slotToType = new Map<number, string>();
  for (let tIdx = 0; tIdx < T; tIdx++) {
    for (let s = 0; s < totalSlots; s++) {
      slotToType.set(slotIndex(tIdx, s), typesList[tIdx]);
    }
  }

  let placed = 0;
  const moved: PlacementMovedRow[] = [];
  const beforeCounts: Record<string, number> = {};
  const afterCounts: Record<string, number> = {};
  for (const t of typesList) {
    beforeCounts[t] = 0;
    afterCounts[t] = 0;
  }

  for (let i = 0; i < M; i++) {
    const c = candidates[i];
    const m = c.mon;
    beforeCounts[c.greedyType] = (beforeCounts[c.greedyType] || 0) + 1;

    let chosenType: string | null = null;
    let chosenSlotIdx = -1;
    for (const e of adj[monOffset + i]) {
      if (e.to >= slotOffset && e.to < sink && e.cap === 0) {
        chosenType = slotToType.get(e.to) || null;
        chosenSlotIdx = (e.to - slotOffset) % totalSlots;
        break;
      }
    }
    const slotKind: 'team' | 'backup' | null =
      chosenType !== null ? (chosenSlotIdx < teamSlots ? 'team' : 'backup') : null;
    const aux = getAux(auxMap, m);
    if (isMax) aux.max_placed_slot = slotKind;
    else aux.raid_placed_slot = slotKind;

    const chosenEdge = (chosenType && c.edges.find((e) => e.type === chosenType)) || c.edges[0];
    if (chosenEdge) {
      if (chosenType !== null) placed++;
      afterCounts[chosenEdge.type] = (afterCounts[chosenEdge.type] || 0) + 1;

      if (isMax) {
        m.max_type = chosenEdge.type;
        m.max_sid = chosenEdge.sid;
        m.max_rank = chosenEdge.rank;
        m.max_dps = Math.round((estimatedMaxDps(m, dex) ?? 0) * 100) / 100;
      } else {
        m.raid_type = chosenEdge.type;
        m.raid_sid = chosenEdge.sid;
        m.raid_rank = chosenEdge.rank;
        m.raid_dps = Math.round((estimatedRaidDps(m, dex) ?? 0) * 100) / 100;
      }

      if (chosenEdge.type !== c.greedyType) {
        moved.push({
          id: m.uid,
          name: m.species ? cleanSpeciesName(m.species.speciesName) : `Dex #${m.dex}`,
          iv: ivStr(m),
          level: Math.round(m.level * 10) / 10,
          from: c.greedyType,
          to: chosenEdge.type,
          why: `${Math.round(chosenEdge.score)}% of top ${chosenEdge.type}`,
        });
      }
    }
  }

  const coverageBefore = Object.values(beforeCounts).filter((n) => n >= (isMax ? 1 : 3)).length;
  const coverageAfter = Object.values(afterCounts).filter((n) => n >= (isMax ? 1 : 3)).length;

  return {
    placed,
    report: {
      covered_before: coverageBefore,
      covered_after: coverageAfter,
      types: typesList.length,
      moved,
    },
  };
}

// ============================================================
// QUALITY GATES
// ============================================================
export function applyRaidGate(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  covState: CoverageState,
  auxMap: Map<string, MonAux>,
): void {
  const rc = cfg.raid;
  const minIv = Number(rc.min_iv_pct ?? 60);
  const minAtk = Number(rc.min_atk_iv ?? 12);
  const minAtkSh = Number(rc.min_atk_iv_for_shadow ?? 12);
  const minLevel = Number(rc.min_level ?? 0);
  const ivSlack = Number(rc.iv_pct_slack ?? 5);
  const reserveMaxPerType = Number(rc.reserve_keep ?? 2);
  const minDpsPct = Number(rc.min_dps_pct_of_best_of_type ?? 65);
  const maxSpeciesRank = Number(rc.top_n_species ?? 20);
  const teamSlots = Number(rc.keep_per_type ?? 6);

  const rejectedByType = new Map<string, MonModel[]>();
  const manualTransferIds = new Set(cfg.manual_transfer_ids || []);

  for (const m of mons) {
    if (!m.raid_type || !m.species || manualTransferIds.has(m.uid)) continue;
    const aux = getAux(auxMap, m);
    const isGap = covState.gapTypes.has(m.raid_type);
    const reqIv = Math.max(40, minIv - (isGap ? ivSlack : 0));
    const reqAtk = isGap
      ? Math.max(8, minAtk - 2)
      : m.is_shadow
      ? minAtkSh
      : minAtk;
    const ref = refDps(dex, dex.raidRankings, m.raid_type, true);
    const raidPct = ref > 0 ? (100 * m.raid_dps) / ref : 0;

    let reject = '';
    if (m.iv_pct < reqIv) {
      reject = `overall IV ${m.iv_pct}% below raid.min_iv_pct (${reqIv}%)`;
    } else if (m.a < reqAtk) {
      reject = `ATK IV ${m.a} below raid_min_atk_iv (${reqAtk})`;
    } else if (minLevel > 0 && m.level < minLevel && !isGap) {
      reject = `only L${m.level.toFixed(1)}, below raid.min_level (${minLevel})`;
    } else if (m.raid_rank !== null && m.raid_rank > maxSpeciesRank) {
      reject = `rank #${m.raid_rank} outside top ${maxSpeciesRank} ${m.raid_type} attackers`;
    } else if (raidPct < minDpsPct) {
      reject = `${Math.round(raidPct)}% of top ${m.raid_type} DPS (below ${minDpsPct}% floor)`;
    } else if (aux.raid_placed_slot !== 'team' && aux.raid_placed_slot !== 'backup') {
      reject = `beyond your top ${teamSlots + reserveMaxPerType} ${m.raid_type} raid attackers`;
    }

    if (reject) {
      m.raid_reject = reject;
      aux.gate_review_kinds.add('raid');
      const arr = rejectedByType.get(m.raid_type) || [];
      arr.push(m);
      rejectedByType.set(m.raid_type, arr);
    }
  }

  if (reserveMaxPerType > 0) {
    for (const [t, arr] of rejectedByType.entries()) {
      if (!covState.gapTypes.has(t)) continue;
      arr.sort((a, b) => b.raid_dps - a.raid_dps || b.iv_pct - a.iv_pct);
      for (let i = 0; i < Math.min(reserveMaxPerType, arr.length); i++) {
        arr[i].raid_reserve = true;
        getAux(auxMap, arr[i]).raid_reserve_msg = `held as ${t} gap reserve`;
      }
    }
  }
}

export function applyMaxGate(
  mons: MonModel[],
  cfg: PogoConfig,
  auxMap: Map<string, MonAux>,
): void {
  const mc = cfg.max_battle;
  const minAtk = Number(mc.min_atk_iv ?? 12);
  const minIv = Number(cfg.raid.min_iv_pct ?? 60);
  const teamSlots = Number(mc.keep_per_type ?? 4);
  const reserveSlots = Number(mc.reserve_keep ?? 2);
  const manualTransferIds = new Set(cfg.manual_transfer_ids || []);

  for (const m of mons) {
    if (!m.max_type || !m.species || manualTransferIds.has(m.uid)) continue;
    const aux = getAux(auxMap, m);
    const reqIv = m.is_gigantamax ? Math.max(55, minIv - 10) : minIv;
    const reqAtk = m.is_gigantamax ? Math.max(5, minAtk - 4) : minAtk;
    if (m.iv_pct < reqIv) {
      m.max_reject = `max_battle IV ${m.iv_pct}% below ${reqIv}%`;
      aux.gate_review_kinds.add('max');
    } else if (m.a < reqAtk) {
      m.max_reject = `max_battle ATK IV ${m.a} below ${reqAtk}`;
      aux.gate_review_kinds.add('max');
    } else if (aux.max_placed_slot !== 'team' && aux.max_placed_slot !== 'backup') {
      m.max_reject = `beyond your top ${teamSlots + reserveSlots} ${m.max_type} Max attackers`;
      aux.gate_review_kinds.add('max');
    }
  }
}

export function applyMegaGate(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  auxMap: Map<string, MonAux>,
): void {
  const mc = cfg.mega;
  const minIv = Number(mc.min_iv_pct ?? 82);
  const minAtk = Number(mc.min_atk_iv ?? 12);
  const maxPerMega = Number(mc.keep_per_family ?? 1);
  const narrowToCurated = mc.narrow_to_curated !== false;
  const byMegaSid = new Map<string, MonModel[]>();
  const manualTransferIds = new Set(cfg.manual_transfer_ids || []);
  const activeCuratedSids = narrowToCurated
    ? resolveActiveCuratedMegaSids(
        mons.filter((m) => !manualTransferIds.has(m.uid)),
        dex,
        minIv,
        minAtk,
      )
    : null;

  for (const m of mons) {
    if (!m.species || !m.is_mega_capable || !m.mega_sid || manualTransferIds.has(m.uid)) continue;
    const aux = getAux(auxMap, m);
    aux.can_mega = true;
    const boostTypes = dex.megaBoostTypes(m.mega_sid);
    m.mega_type = boostTypes[0] || (m.species.types?.[0]?.toLowerCase() || null);
    const list = byMegaSid.get(m.mega_sid) || [];
    list.push(m);
    byMegaSid.set(m.mega_sid, list);
  }

  for (const [megaSid, group] of byMegaSid.entries()) {
    group.sort((a, b) => {
      const aUn = a.has_mega_unlocked ? 1 : 0;
      const bUn = b.has_mega_unlocked ? 1 : 0;
      return bUn - aUn || b.mega_level - a.mega_level || b.iv_pct - a.iv_pct || b.cp - a.cp;
    });

    const isCurated =
      !narrowToCurated ||
      (activeCuratedSids ? activeCuratedSids.has(megaSid.toLowerCase()) : isCuratedMega(megaSid));
    let kept = 0;

    for (const m of group) {
      const aux = getAux(auxMap, m);
      // Already unlocked: protected via protect: ['mega_unlocked'], but only allocate up to maxPerMega
      // BUILD_MEGA slots so duplicate unlocked copies (e.g. multiple Mega Lv1 Chandelures) don't spam BUILD_MEGA.
      if (m.has_mega_unlocked) {
        if (kept < maxPerMega) {
          aux.mega_home = true;
          kept++;
        }
        continue;
      }
      // Prospective un-unlocked: require curated meta tier + strict IV + family limit
      if (isCurated && !m.is_shadow && m.iv_pct >= minIv && m.a >= minAtk && kept < maxPerMega) {
        aux.mega_home = true;
        kept++;
      } else {
        aux.gate_review_kinds.add('mega');
      }
    }
  }
}

export function applyGymGate(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  auxMap: Map<string, MonAux>,
): void {
  const gc = cfg.gym;
  const minIv = Number(gc.min_iv_pct ?? 70);
  const maxPerSp = Number(gc.max_per_species ?? 3);
  const defs = new Set((gc.defenders || []).map(normStr));
  if (defs.size === 0) return;

  const byDefenderSid = new Map<string, MonModel[]>();
  const manualTransferIds = new Set(cfg.manual_transfer_ids || []);
  for (const m of mons) {
    if (!m.species || manualTransferIds.has(m.uid)) continue;
    if (m.is_shadow && !gc.allow_shadow) continue;
    for (const d of dex.descendants(m.species.speciesId)) {
      const sp = dex.byId.get(d);
      if (!sp) continue;
      if (defs.has(normStr(sp.speciesName)) || defs.has(normStr(d))) {
        m.gym_score = 100 + m.iv_pct * 0.3 + m.level * 0.1;
        getAux(auxMap, m).gym_sid = d;
        if (m.iv_pct < minIv) {
          m.gym_reject = `gym.min_iv_pct ${minIv}% (got ${m.iv_pct}%)`;
        } else {
          const arr = byDefenderSid.get(d) || [];
          arr.push(m);
          byDefenderSid.set(d, arr);
        }
        break;
      }
    }
  }

  for (const [, list] of byDefenderSid.entries()) {
    list.sort((a, b) => b.gym_score - a.gym_score);
    for (let i = maxPerSp; i < list.length; i++) {
      list[i].gym_reject = `beyond your top ${maxPerSp} defenders for species`;
    }
  }
}

// ============================================================
// PVP ELIGIBILITY & CLASSIFICATION
// ============================================================
const MEMORABLE_CP = new Set([420, 666, 777, 1337, 2000, 2500, 3000, 4000]);

export function classifyMons(
  mons: MonModel[],
  dex: Dex,
  cfg: PogoConfig,
  caps: number[],
  cups: Record<string, CupDef>,
  auxMap: Map<string, MonAux>,
): void {
  const protectIvPct = Number(cfg.protect_iv_pct ?? 92);
  const ivProtectMaxPerSp = Number(cfg.iv_protect_max_per_species ?? 2);
  const masterMinIvPct = Number(cfg.pvp?.master_min_iv_pct ?? 93);
  const minComposite = Number(cfg.pvp?.min_composite ?? 1220);
  const maxSpeciesRank = 200;
  const ageKeepYears = new Set(cfg.age_keep_years || [2016]);
  const triageCfg = cfg.review_triage;
  const confirmedTransferIds = new Set<string>(triageCfg?.confirmed_transfer_ids || []);
  const triageEnabled = triageCfg?.enabled !== false;
  const transferIvFloor = Number(triageCfg?.transfer_iv_pct ?? 70);
  const manualKeepIds = new Set<string>(cfg.manual_keep_ids || []);
  const manualTransferIds = new Set<string>(
    (cfg.manual_transfer_ids || []).filter((id) => !manualKeepIds.has(id)),
  );

  // 1. Protections
  const specialDex = new Set(cfg.protect_species_dex || []);
  const protectTagSet = new Set((cfg.protect_tag_names || []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  const excludeTagSet = new Set((cfg.exclude_tag_names || []).map((t) => t.trim().toLowerCase()).filter(Boolean));

  for (const m of mons) {
    if (manualTransferIds.has(m.uid)) continue;
    if (manualKeepIds.has(m.uid)) m.protect.push('manual_keep');
    if (m.is_favorite && cfg.protect_favorite) m.protect.push('favorite');
    if (m.is_shiny && cfg.protect_shiny) m.protect.push('shiny');
    if (m.is_lucky && cfg.protect_lucky) m.protect.push('lucky');
    if (m.is_costume && cfg.protect_costume) m.protect.push('costume');
    if (m.has_mega_unlocked && cfg.protect_mega_capable) m.protect.push('mega_unlocked');
    if (m.is_currently_mega && cfg.protect_currently_mega) m.protect.push('active_mega');
    if (m.is_deployed && cfg.protect_deployed) m.protect.push('deployed');
    if (m.in_contest) m.protect.push('contest');
    if (m.has_third_move && cfg.protect_3rd_move) m.protect.push('3rd_move');
    if (m.is_tagged && cfg.protect_tagged) {
      const nonExcluded = m.mon_tags.filter((t) => !excludeTagSet.has(t.trim().toLowerCase()));
      const matchingProtect =
        protectTagSet.size > 0
          ? nonExcluded.filter((t) => protectTagSet.has(t.trim().toLowerCase()))
          : nonExcluded;
      if (matchingProtect.length > 0) {
        m.protect.push(`tagged(${matchingProtect[0]})`);
      } else if (m.mon_tags.length === 0 && nonExcluded.length === 0 && protectTagSet.size === 0) {
        m.protect.push('tagged');
      }
    }
    if (m.year !== null && ageKeepYears.has(m.year)) {
      if ((!m.is_traded && !m.is_shadow && m.iv_pct >= 80) || m.is_favorite) {
        m.protect.push(`year_${m.year}`);
      }
    }
    if (m.location_card && cfg.protect_location_card) m.protect.push('background');
    if (cfg.protect_origin_events) {
      if (m.origin_events.length > 0) m.protect.push('origin_event');
      if (m.origin_move) m.protect.push('origin_move');
      if (m.is_fusion) m.protect.push('fusion');
    }
    if ((m.is_dynamax || m.is_gigantamax) && (cfg.protect_dynamax || cfg.protect_gigantamax)) {
      m.protect.push(m.is_gigantamax ? 'gigantamax' : 'dynamax');
    }
    if (specialDex.has(m.dex)) m.protect.push('legendary_core');
    if (cfg.protect_hundo && m.a === 15 && m.d === 15 && m.s === 15) {
      m.protect.push('hundo');
    } else if (m.purify_preview?.becomes_hundo) {
      m.protect.push('purify_hundo');
    } else if (m.a === 0 && m.d === 0 && m.s === 0) {
      m.protect.push('nundo');
    } else if (MEMORABLE_CP.has(m.cp)) {
      m.protect.push(`cp_${m.cp}`);
    }
    if (m.iv_pct >= protectIvPct) {
      getAux(auxMap, m).iv_hi = true;
    }
  }

  // Cap iv_hi per species
  const ivHiByDex = new Map<number, MonModel[]>();
  for (const m of mons) {
    if (!manualTransferIds.has(m.uid) && getAux(auxMap, m).iv_hi) {
      const arr = ivHiByDex.get(m.dex) || [];
      arr.push(m);
      ivHiByDex.set(m.dex, arr);
    }
  }
  for (const [, list] of ivHiByDex.entries()) {
    list.sort((a, b) => b.iv_pct - a.iv_pct || b.cp - a.cp);
    list.forEach((m, i) => {
      if (i < ivProtectMaxPerSp) m.protect.push(`iv_${m.iv_pct.toFixed(0)}pct`);
      else m.iv_demoted = true;
    });
  }

  // 2. PvP Evaluation
  const maxPvpIvRank = Math.min(50, Number(cfg.pvp?.keep_iv_rank ?? 50));
  for (const m of mons) {
    if (!m.species) continue;
    const desc = dex.descendants(m.species.speciesId);
    const pvpList: PvpEntry[] = [];
    const cupList: PvpEntry[] = [];

    for (const cap of caps) {
      let bestEntry: PvpEntry | null = null;
      const isMaster = cap >= 10000;

      for (const d of desc) {
        const capPosMap = dex.pvpPos.get(cap);
        const capMetaMap = dex.pvpMeta.get(cap);
        const shadowSid = `${d}_shadow`;
        const targetPvpSid = m.is_shadow && capMetaMap?.has(shadowSid) ? shadowSid : d;
        const rankInfo =
          capPosMap?.get(targetPvpSid) ||
          (m.is_shadow ? capPosMap?.get(d) : undefined) ||
          null;
        if (!rankInfo) continue;
        const [spRank] = rankInfo;
        const sp = dex.byId.get(d);
        if (!sp) continue;

        const computedIvR = isMaster ? null : dex.ivRank(d, cap, m.a, m.d, m.s);
        let ivRankNum = computedIvR ? computedIvR[0] : 4096;
        let targetLv = 50;
        let targetCp = computeCp(sp.baseStats, m.a, m.d, m.s, 50) ?? 0;
        let eligible = true;
        let ineligibleReason = '';

        if (isMaster) {
          const ivSum = m.a + m.d + m.s;
          ivRankNum = Math.max(1, Math.round(((45 - ivSum) / 45) * 200) + 1);
          if (m.iv_pct < masterMinIvPct) {
            eligible = false;
            ineligibleReason = `Master IV ${m.iv_pct}% < ${masterMinIvPct}%`;
          }
        } else {
          const minCpAtL1 = computeCp(sp.baseStats, m.a, m.d, m.s, 1.0) ?? 0;
          if (m.cp > cap) {
            eligible = false;
            ineligibleReason = `CP ${m.cp} already over ${cap}`;
          } else if (minCpAtL1 > cap && d === m.species.speciesId) {
            eligible = false;
            ineligibleReason = `base CP exceeds ${cap}`;
          } else {
            const bestLvl = bestPvpLevel(sp.baseStats, cap, m.a, m.d, m.s);
            if (!bestLvl) {
              eligible = false;
              ineligibleReason = `cannot fit under ${cap} CP`;
            } else {
              targetLv = bestLvl[0];
              targetCp = bestLvl[1];
              if (m.level > targetLv + 0.01) {
                eligible = false;
                ineligibleReason = `already L${m.level} > target L${targetLv}`;
              } else if (ivRankNum > maxPvpIvRank) {
                eligible = false;
                ineligibleReason = `IV rank #${ivRankNum} > #${maxPvpIvRank}`;
              }
            }
          }
        }

        const composite = Math.round((spRank + ivRankNum * 0.25) * 10) / 10;
        const entry: PvpEntry = {
          cap,
          league: LEAGUE_NAMES[cap] || `${cap}`,
          sid: targetPvpSid,
          name: cleanSpeciesName(sp.speciesName),
          species_rank: spRank,
          iv_rank: ivRankNum,
          iv_pct: m.iv_pct,
          composite,
          target_level: targetLv,
          target_cp: targetCp,
          eligible,
          maybe_eligible: eligible,
          ineligible_reason: ineligibleReason,
          already_at_target: m.cp === targetCp && Math.abs(m.level - targetLv) < 0.1,
        };

        if (
          !bestEntry ||
          (entry.eligible && !bestEntry.eligible) ||
          (entry.eligible === bestEntry.eligible && entry.composite < bestEntry.composite)
        ) {
          bestEntry = entry;
        }
      }
      if (bestEntry) pvpList.push(bestEntry);
    }

    for (const [cupName, cupSpec] of Object.entries(cups)) {
      const cap = cupSpec.cap;
      let bestEntry: PvpEntry | null = null;
      for (const d of desc) {
        if (!dex.cupAllows(d, cupSpec)) continue;
        const cupPosMap = dex.cupPos.get(cupName);
        const cupMetaMap = dex.cupMeta.get(cupName);
        const shadowSid = `${d}_shadow`;
        const targetCupSid = m.is_shadow && cupMetaMap?.has(shadowSid) ? shadowSid : d;
        const rankInfo =
          cupPosMap?.get(targetCupSid) ||
          (m.is_shadow ? cupPosMap?.get(d) : undefined) ||
          null;
        if (!rankInfo) continue;
        const [spRank] = rankInfo;
        const sp = dex.byId.get(d);
        if (!sp) continue;

        let eligible = m.cp <= cap;
        let targetLv = 40;
        let targetCp = cap;
        const ivR = dex.ivRank(d, cap, m.a, m.d, m.s);
        const ivRankNum = ivR ? ivR[0] : 4096;
        if (eligible) {
          const bestLvl = bestPvpLevel(sp.baseStats, cap, m.a, m.d, m.s);
          if (!bestLvl || m.level > bestLvl[0] + 0.01) {
            eligible = false;
          } else {
            targetLv = bestLvl[0];
            targetCp = bestLvl[1];
            if (ivRankNum > maxPvpIvRank) {
              eligible = false;
            }
          }
        }
        const composite = Math.round((spRank + ivRankNum * 0.25) * 10) / 10;
        const entry: PvpEntry = {
          cap,
          league: cupSpec.title || cupName,
          cup: cupName,
          sid: targetCupSid,
          name: cleanSpeciesName(sp.speciesName),
          species_rank: spRank,
          iv_rank: ivRankNum,
          iv_pct: m.iv_pct,
          composite,
          target_level: targetLv,
          target_cp: targetCp,
          eligible,
          maybe_eligible: eligible,
        };
        if (
          !bestEntry ||
          (entry.eligible && !bestEntry.eligible) ||
          (entry.eligible === bestEntry.eligible && entry.composite < bestEntry.composite)
        ) {
          bestEntry = entry;
        }
      }
      if (bestEntry) cupList.push(bestEntry);
    }

    m.pvp = pvpList;
    m.cup_pvp = cupList;

    const allEligible = [...pvpList, ...cupList].filter(
      (e) => e.eligible && e.species_rank <= maxSpeciesRank && e.composite <= minComposite,
    );
    allEligible.sort(
      (a, b) =>
        a.composite - b.composite ||
        (a.cup ? 1 : 0) - (b.cup ? 1 : 0) ||
        a.iv_rank - b.iv_rank,
    );
    if (allEligible.length > 0) m.best_pvp = allEligible[0];

    // Protect genuine Rank #1 PvP IV spreads (across GL/UL and active Little/Cup caps)
    // and honor cfg.protect_top_pvp_iv_rank so top PvP IV spreads are never sent to Transfer/Trade.
    const protectTopPvpRank = Number(cfg.protect_top_pvp_iv_rank ?? 10);
    const stdPvpCaps = Array.from(new Set([...caps.filter((c) => c < 10000), 1500, 2500]));
    let hasRank1Pvp = false;
    let bestTopPvpRank: number | null = null;
    for (const d of desc) {
      if (d.endsWith('_mega') || d.endsWith('_primal')) continue;
      const sp = dex.byId.get(d);
      if (!sp) continue;
      for (const cap of stdPvpCaps) {
        if (m.cp > cap) continue;
        const bestLvl = bestPvpLevel(sp.baseStats, cap, m.a, m.d, m.s);
        if (!bestLvl || m.level > bestLvl[0] + 0.01) continue;
        const ivR = dex.ivRank(d, cap, m.a, m.d, m.s);
        if (!ivR) continue;
        const rank = ivR[0];
        const isRanked = Boolean(dex.pvpPos.get(cap)?.has(d));
        if (rank === 1 && (bestLvl[1] >= cap * 0.85 || isRanked)) {
          hasRank1Pvp = true;
          break;
        }
        if (
          protectTopPvpRank > 0 &&
          rank <= protectTopPvpRank &&
          isRanked &&
          (dex.pvpPos.get(cap)?.get(d)?.[0] ?? 9999) <= 250
        ) {
          if (bestTopPvpRank === null || rank < bestTopPvpRank) {
            bestTopPvpRank = rank;
          }
        }
      }
      if (hasRank1Pvp) break;
    }
    if (!hasRank1Pvp && [...pvpList, ...cupList].some((e) => e.eligible && e.iv_rank === 1)) {
      hasRank1Pvp = true;
    }
    if (!hasRank1Pvp && protectTopPvpRank > 0) {
      const topCupOrLeague = [...pvpList, ...cupList].find(
        (e) => e.eligible && e.iv_rank <= protectTopPvpRank && e.species_rank <= 250,
      );
      if (topCupOrLeague && (bestTopPvpRank === null || topCupOrLeague.iv_rank < bestTopPvpRank)) {
        bestTopPvpRank = topCupOrLeague.iv_rank;
      }
    }
    if (!manualTransferIds.has(m.uid)) {
      if (hasRank1Pvp && !m.protect.includes('pvp_iv_#1')) {
        m.protect.push('pvp_iv_#1');
      } else if (bestTopPvpRank !== null && !m.protect.some((p) => p.startsWith('pvp_iv_'))) {
        m.protect.push(`pvp_iv_#${bestTopPvpRank}`);
      }
    }
  }

  // 3. Cap builds per (speciesId, CP cap): 1 copy per Pokemon per league cap,
  //    never keeping inferior-IV duplicates for the same league/same-cap cup,
  //    while still allowing separate copies for genuinely different leagues (caps).
  const buildsPerSpLeague = cfg.pvp?.builds_per_species_league || {};
  interface PvpCandidate {
    mon: MonModel;
    entry: PvpEntry;
    displayEntry: PvpEntry;
    sidCapKey: string;
  }

  const comparePvpCandidates = (a: PvpCandidate, b: PvpCandidate): number => {
    const aCore = a.entry.cap >= 1500 && a.entry.species_rank <= 100 ? 0 : 1;
    const bCore = b.entry.cap >= 1500 && b.entry.species_rank <= 100 ? 0 : 1;
    if (aCore !== bCore) return aCore - bCore;
    if (a.entry.composite !== b.entry.composite) return a.entry.composite - b.entry.composite;
    if (a.entry.cap >= 10000 && b.entry.cap >= 10000) {
      if (b.mon.a !== a.mon.a) return b.mon.a - a.mon.a;
      if (b.mon.iv_pct !== a.mon.iv_pct) return b.mon.iv_pct - a.mon.iv_pct;
    } else if (a.entry.iv_rank !== b.entry.iv_rank) {
      return a.entry.iv_rank - b.entry.iv_rank;
    }
    if (b.mon.cp !== a.mon.cp) return b.mon.cp - a.mon.cp;
    return a.mon.idx - b.mon.idx;
  };

  const baseMaxBuildIvRank = Math.min(maxPvpIvRank, Number(cfg.power_up_priority?.iv_rank_cutoff ?? maxPvpIvRank));
  const monCandBySidCap = new Map<string, Map<string, PvpCandidate>>();
  const allPvpCands: PvpCandidate[] = [];

  for (const m of mons) {
    if (manualTransferIds.has(m.uid)) continue;
    const eligibleEntries = [...m.pvp, ...m.cup_pvp].filter((e) => {
      if (!e.eligible || e.species_rank > maxSpeciesRank || e.composite > minComposite) {
        return false;
      }
      if (e.cap >= 10000) {
        return e.species_rank <= 80;
      }
      if (e.iv_rank > baseMaxBuildIvRank) {
        return false;
      }
      return e.cup ? e.species_rank <= 80 : e.species_rank <= 150;
    });
    if (eligibleEntries.length === 0) continue;

    // Group per (sid, cap) so Open Great (1500) + Fantasy Cup (1500) share one build slot
    const bySidCap = new Map<string, PvpEntry[]>();
    for (const e of eligibleEntries) {
      const k = `${e.sid}|${e.cap}`;
      const list = bySidCap.get(k) || [];
      list.push(e);
      bySidCap.set(k, list);
    }

    const perMonMap = new Map<string, PvpCandidate>();
    for (const [sidCapKey, list] of bySidCap.entries()) {
      list.sort((a, b) => a.composite - b.composite || (a.cup ? 1 : 0) - (b.cup ? 1 : 0));
      const best = list[0];
      // If an Open League entry at the same (sid, cap) is within 15 species ranks (or top-50), prefer it for display
      const openAlt = list.find(
        (e) => !e.cup && (e.species_rank <= best.species_rank + 15 || e.species_rank <= 50),
      );
      const cand: PvpCandidate = {
        mon: m,
        entry: best,
        displayEntry: openAlt || best,
        sidCapKey,
      };
      perMonMap.set(sidCapKey, cand);
      allPvpCands.push(cand);
    }
    monCandBySidCap.set(m.uid, perMonMap);
  }

  allPvpCands.sort(comparePvpCandidates);

  const assignedByUid = new Map<string, PvpCandidate>();
  const winnersBySidCap = new Map<string, PvpCandidate[]>();
  const candsBySidCap = new Map<string, PvpCandidate[]>();
  for (const c of allPvpCands) {
    const arr = candsBySidCap.get(c.sidCapKey) || [];
    arr.push(c);
    candsBySidCap.set(c.sidCapKey, arr);
  }

  for (const c of allPvpCands) {
    if (assignedByUid.has(c.mon.uid)) continue;
    const capLim = Number(buildsPerSpLeague[String(c.entry.cap)] ?? 1);
    const cur = winnersBySidCap.get(c.sidCapKey) || [];
    if (cur.length >= capLim) continue;
    cur.push(c);
    winnersBySidCap.set(c.sidCapKey, cur);
    assignedByUid.set(c.mon.uid, c);
  }

  // Pass 2: Multi-league flexibility swap — if Mon A covers 2 different leagues (caps)
  // and Mon B is only eligible for Mon A's assigned cap, let Mon A shift to the other cap
  // when that fills an uncovered cap or strictly improves total composite across both leagues.
  let improved = true;
  let guard = 0;
  while (improved && guard < 24) {
    improved = false;
    guard++;
    for (const [uidA, candA1] of Array.from(assignedByUid.entries())) {
      const cap1Key = candA1.sidCapKey;
      const capLim1 = Number(buildsPerSpLeague[String(candA1.entry.cap)] ?? 1);
      const candsA = monCandBySidCap.get(uidA);
      if (!candsA || candsA.size < 2) continue;

      const unassignedForCap1 = (candsBySidCap.get(cap1Key) || []).filter(
        (b) => !assignedByUid.has(b.mon.uid),
      );
      if (unassignedForCap1.length === 0) continue;
      const bestB = unassignedForCap1[0];

      for (const [cap2Key, candA2] of candsA.entries()) {
        if (candA2.entry.sid !== candA1.entry.sid || candA2.entry.cap === candA1.entry.cap) continue;
        const capLim2 = Number(buildsPerSpLeague[String(candA2.entry.cap)] ?? 1);
        const cur2 = winnersBySidCap.get(cap2Key) || [];

        if (cur2.length < capLim2) {
          const bWorthKeeping =
            bestB.entry.iv_rank <= 150 ||
            (bestB.entry.cap >= 10000 && bestB.mon.iv_pct >= masterMinIvPct);
          if (!bWorthKeeping) continue;
          const list1 = winnersBySidCap.get(cap1Key) || [];
          const idx1 = list1.indexOf(candA1);
          if (idx1 >= 0) list1.splice(idx1, 1);
          if (list1.length < capLim1) {
            list1.push(bestB);
            winnersBySidCap.set(cap1Key, list1);
            assignedByUid.set(bestB.mon.uid, bestB);
            cur2.push(candA2);
            winnersBySidCap.set(cap2Key, cur2);
            assignedByUid.set(uidA, candA2);
            improved = true;
            break;
          }
        } else if (cur2.length > 0) {
          const worstC = cur2[cur2.length - 1];
          if (
            candA2.entry.composite + bestB.entry.composite + 0.01 <
            candA1.entry.composite + worstC.entry.composite
          ) {
            const list1 = winnersBySidCap.get(cap1Key) || [];
            const idx1 = list1.indexOf(candA1);
            if (idx1 >= 0) list1.splice(idx1, 1);
            list1.push(bestB);
            winnersBySidCap.set(cap1Key, list1);

            const idx2 = cur2.indexOf(worstC);
            if (idx2 >= 0) cur2.splice(idx2, 1);
            cur2.push(candA2);
            cur2.sort(comparePvpCandidates);
            winnersBySidCap.set(cap2Key, cur2);

            assignedByUid.delete(worstC.mon.uid);
            assignedByUid.set(bestB.mon.uid, bestB);
            assignedByUid.set(uidA, candA2);
            improved = true;
            break;
          }
        }
      }
      if (improved) break;
    }
  }

  const allowedPvpUids = new Set<string>();
  const wonPvpSidCaps = new Set<string>();
  for (const [uid, cand] of assignedByUid.entries()) {
    allowedPvpUids.add(uid);
    cand.mon.best_pvp = cand.displayEntry;
    wonPvpSidCaps.add(cand.sidCapKey);
  }

  // 4. Coverage + Gates
  const covState = computeCoverageFirst(mons, dex, cfg);
  applyRaidGate(mons, dex, cfg, covState, auxMap);
  applyMaxGate(mons, cfg, auxMap);
  applyMegaGate(mons, dex, cfg, auxMap);
  applyGymGate(mons, dex, cfg, auxMap);

  // Track PvP leagues/Master IVs already covered by kept copies so surplus/over-cap
  // inferior copies don't get stuck in REVIEW when a better copy is already kept.
  const coveredPvpSidCaps = new Set<string>(wonPvpSidCaps);
  const bestKeptMasterIvBySid = new Map<string, number>();
  const raidMinDpsPct = Number(cfg.raid?.min_dps_pct_of_best_of_type ?? 65);
  for (const m of mons) {
    const aux = getAux(auxMap, m);
    const rRef = m.raid_type ? refDps(dex, dex.raidRankings, m.raid_type, true) : 1;
    const rPct = rRef > 0 ? (100 * m.raid_dps) / rRef : 0;
    const willKeep =
      Boolean(m.best_pvp && allowedPvpUids.has(m.uid)) ||
      Boolean(aux.mega_home && m.mega_sid) ||
      Boolean(m.raid_type && !m.raid_reject && rPct >= raidMinDpsPct) ||
      Boolean(m.max_type && !m.max_reject && canJoinMaxBattle(m)) ||
      Boolean(m.gym_score > 0 && !m.gym_reject) ||
      Boolean(m.raid_reserve && m.raid_type) ||
      m.protect.length > 0 ||
      m.raw.size === 5;
    if (!willKeep) continue;

    for (const e of [...m.pvp, ...m.cup_pvp]) {
      if (e.eligible && e.species_rank <= maxSpeciesRank) {
        coveredPvpSidCaps.add(`${e.sid}|${e.cap}`);
      }
      if (e.cap >= 10000) {
        const prev = bestKeptMasterIvBySid.get(e.sid) ?? -1;
        if (m.iv_pct > prev) bestKeptMasterIvBySid.set(e.sid, m.iv_pct);
      }
    }
  }

  // 5. Verdict Assignment
  const mirrorTradeCountByDex = new Map<number, number>();
  const MIRROR_TRADE_CAP_PER_DEX = 5;

  for (const m of mons) {
    const aux = getAux(auxMap, m);
    const sp = m.species;
    const spNameStr = sp ? cleanSpeciesName(sp.speciesName) : `Dex #${m.dex}`;
    const hasPvp = Boolean(m.best_pvp && allowedPvpUids.has(m.uid));
    const hasMega = Boolean(aux.mega_home && m.mega_sid);
    const hasRaid = Boolean(m.raid_type && !m.raid_reject);
    const hasMax = Boolean(m.max_type && !m.max_reject && canJoinMaxBattle(m));
    const hasGym = Boolean(m.gym_score > 0 && !m.gym_reject);

    const raidRef = m.raid_type ? refDps(dex, dex.raidRankings, m.raid_type, true) : 1;
    const raidPct = raidRef > 0 ? (100 * m.raid_dps) / raidRef : 0;

    if (manualTransferIds.has(m.uid)) {
      m.verdict = 'TRANSFER';
      m.role = 'Manual Override (Transfer)';
      m.evolve_to = '';
      m.evolve_to_sid = null;
      m.power_up_to = null;
      m.build_cp = null;
      m.moveset = '';
      m.why_keep = 'Manually forced to Transfer by user override.';
      aux.verdict_priority = 9;
    } else if (hasPvp && m.best_pvp) {
      const p = m.best_pvp;
      const metaMap = p.cup ? dex.cupMeta.get(p.cup) : dex.pvpMeta.get(p.cap);
      const mvList = (metaMap?.get(p.sid)?.moveset || []).slice(0, 3).map(moveLabel).join(' / ');
      m.verdict = 'BUILD_PVP';
      m.role = `${p.league} #${p.species_rank} (IV #${p.iv_rank})`;
      m.evolve_to_sid = p.sid !== sp?.speciesId ? p.sid.replace(/_shadow$/, '') : null;
      m.evolve_to = m.evolve_to_sid ? spName(dex, m.evolve_to_sid) : '';
      m.power_up_to = p.target_level > m.level ? p.target_level : null;
      m.build_cp = p.target_cp;
      m.moveset = mvList;
      m.why_keep = `Top PvP spread: ${p.name} in ${p.league} (rank #${p.species_rank}, IV #${p.iv_rank}).`;
      aux.species_rank = p.species_rank;
      aux.species_rank_league = p.league;
      aux.verdict_priority = 1;
    } else if (hasMega && m.mega_sid) {
      m.verdict = 'BUILD_MEGA';
      const megaLabel = spName(dex, m.mega_sid);
      const boostTypes = dex.megaBoostTypes(m.mega_sid);
      const curatedInfo = getCuratedMegaInfo(m.mega_sid, m.mega_type || undefined);
      const pokebaseTier = curatedInfo?.pokebaseTier ?? getPokebaseMegaTier(m.mega_sid);
      const pbBadge = pokebaseTier ? `Pokébase ${pokebaseTier}-Tier` : '';
      const tierTag = curatedInfo
        ? ` · ${pbBadge ? `${pbBadge} · ` : ''}${curatedInfo.costTier === 'expensive' ? 'Expensive Option' : 'Cheap Option'} (${curatedInfo.costLabel})`
        : pbBadge
        ? ` · ${pbBadge}`
        : '';
      m.role = `${megaLabel}${tierTag} · boosts ${boostTypes.join(' / ') || m.mega_type || 'type'}`;
      m.evolve_to_sid = m.is_mega_pre_evo ? m.mega_sid.replace(/_mega.*|_primal/, '') : null;
      m.evolve_to = m.evolve_to_sid ? spName(dex, m.evolve_to_sid) : '';
      m.power_up_to = m.level < 40 ? pveTargetLevel(m, cfg) : null;
      const megaSp = dex.byId.get(m.mega_sid) || sp;
      m.build_cp =
        m.power_up_to && megaSp ? computeCp(megaSp.baseStats, m.a, m.d, m.s, m.power_up_to) : null;
      if (megaSp && m.mega_type) {
        const [mv, note] = pickRaidMoveset(dex.pve, m, dex, megaSp, m.mega_type, false, cfg);
        m.moveset = mv;
        m.moveset_note = note;
      }
      m.why_keep = m.has_mega_unlocked
        ? `Mega Level ${m.mega_level || 1} unlocked${pbBadge ? ` (${pbBadge})` : ''} — boosts ${boostTypes.join(' / ')} raids & candy.${curatedInfo ? ` ${curatedInfo.roleNote}` : ''}`
        : `Top ${pbBadge || (curatedInfo ? curatedInfo.costTier : 'curated')} Mega candidate (${m.iv_pct}% IV) for ${megaLabel}.${curatedInfo ? ` ${curatedInfo.costLabel}. ${curatedInfo.roleNote}` : ''}`;
      aux.verdict_priority = 2;
    } else if (hasRaid && m.raid_type && raidPct >= raidMinDpsPct) {
      m.verdict = 'BUILD_RAID';
      const targetSp = m.raid_sid ? dex.byId.get(m.raid_sid) || sp : sp;
      const targetName = targetSp ? cleanSpeciesName(targetSp.speciesName) : spNameStr;
      const isSpare = aux.raid_placed_slot === 'backup';
      m.role = `${m.raid_type.toUpperCase()} raid ${isSpare ? 'spare' : 'attacker'} #${m.raid_rank ?? '?'}${m.is_shadow ? ' (Shadow)' : ''}`;
      m.evolve_to_sid = m.raid_sid && sp && m.raid_sid !== sp.speciesId ? m.raid_sid : null;
      m.evolve_to = m.evolve_to_sid ? targetName : '';
      const tgt = pveTargetLevel(m, cfg);
      m.power_up_to = m.level < tgt ? tgt : null;
      m.build_cp = targetSp ? computeCp(targetSp.baseStats, m.a, m.d, m.s, m.power_up_to || m.level) : null;
      if (targetSp) {
        const [mv, note] = pickRaidMoveset(dex.pve, m, dex, targetSp, m.raid_type, false, cfg);
        m.moveset = mv;
        m.moveset_note = note;
      }
      m.why_keep = isSpare
        ? `Backup ${m.raid_type} raid spare (#${m.raid_rank}, ${m.raid_dps} eDPS).`
        : `Ranked #${m.raid_rank} ${m.raid_type} attacker (${m.raid_dps} eDPS).`;
      aux.verdict_priority = 3;
    } else if (hasMax && m.max_type) {
      m.verdict = 'BUILD_MAX';
      const targetSp = m.max_sid ? dex.byId.get(m.max_sid) || sp : sp;
      const maxSpare = aux.max_placed_slot === 'backup';
      const maxKind = m.is_gigantamax ? 'G-Max' : m.is_dynamax ? 'Dynamax' : 'Crowned';
      m.role = `${maxKind} ${m.max_type.toUpperCase()} ${maxSpare ? 'spare' : 'attacker'} #${m.max_rank ?? '?'}`;
      m.evolve_to_sid = m.max_sid && sp && m.max_sid !== sp.speciesId ? m.max_sid : null;
      m.evolve_to = m.evolve_to_sid ? spName(dex, m.evolve_to_sid) : '';
      m.power_up_to = m.level < 40 ? 40 : null;
      m.build_cp = targetSp ? computeCp(targetSp.baseStats, m.a, m.d, m.s, m.power_up_to || m.level) : null;
      const fastSet = dex.maxSets.get(`${m.max_sid || sp?.speciesId}|${m.max_type}`);
      if (fastSet?.[0]) m.moveset = moveLabel(fastSet[0]);
      m.why_keep = maxSpare
        ? `Backup ${m.max_type} Max Battle spare.`
        : `Best Dynamax/G-Max attacker option for ${m.max_type} Max Battles.`;
      aux.verdict_priority = 4;
    } else if (hasGym) {
      m.verdict = 'BUILD_GYM';
      m.role = 'Gym defender';
      m.evolve_to_sid = aux.gym_sid && sp && aux.gym_sid !== sp.speciesId ? aux.gym_sid : null;
      m.evolve_to = m.evolve_to_sid ? spName(dex, m.evolve_to_sid) : '';
      m.why_keep = 'High-bulk gym defender.';
      aux.verdict_priority = 5;
    } else if (manualKeepIds.has(m.uid)) {
      m.verdict = 'KEEP';
      m.role = 'Manual Keep (Locked)';
      m.why_keep = 'Manually locked as Keep by user override.';
      aux.verdict_priority = 6;
    } else if (confirmedTransferIds.has(m.uid)) {
      m.verdict = 'TRANSFER';
      m.role = 'Confirmed transfer';
      m.why_keep = 'Confirmed safe to transfer.';
      aux.verdict_priority = 9;
    } else if (m.raid_reserve && m.raid_type) {
      m.verdict = 'KEEP';
      m.role = `${m.raid_type} gap reserve`;
      m.why_keep = `Held in Collection as ${m.raid_type} gap reserve until stronger attackers are caught.`;
      aux.verdict_priority = 6;
    } else if (m.protect.length > 0) {
      m.verdict = 'KEEP';
      m.role = `Collection (${m.protect.slice(0, 2).join(', ')})`;
      m.why_keep = `Kept in Collection: ${m.protect.join(', ')}.`;
      aux.verdict_priority = 6;
    } else if (m.raw.size === 5) {
      m.protect.push('xxl_showcase');
      m.verdict = 'KEEP';
      m.role = 'XXL Showcase contender';
      m.why_keep = 'Kept in Collection: XXL size qualifies for PokéStop Showcases.';
      aux.verdict_priority = 6;
    } else if (!m.is_shadow && m.iv_pct >= 97.7) {
      m.verdict = 'KEEP';
      m.role = `Collection (${m.iv_pct}% IV trophy)`;
      m.why_keep = `High-IV (${m.iv_pct}%) specimen kept in Collection.`;
      aux.verdict_priority = 6;
    } else {
      // Decisive 2-way routing for everything remaining: TRADE vs TRANSFER
      const isMythicalUntradable = Boolean(
        m.species?.tags?.includes('mythical') && m.dex !== 808 && m.dex !== 809,
      );
      const isTradable =
        !m.is_shadow &&
        !m.is_traded &&
        !m.is_fusion &&
        !isMythicalUntradable &&
        !m.is_favorite &&
        !m.is_deployed;

      const isLegOrUb = Boolean(
        m.species?.tags?.some((t) => t === 'legendary' || t === 'ultrabeast'),
      );
      const isLuckyYear = m.year !== null && m.year <= 2019;
      const isHighMetaMirror =
        (m.pvp.some((p) => p.species_rank <= 50) || (m.raid_rank !== null && m.raid_rank <= 15)) &&
        m.level >= 20;

      let tradeReason = '';
      if (isTradable) {
        if (m.variant_trade) {
          tradeReason = `Extra ${m.variant_trade.replace(/\+/g, '/')} variant ready for Trade.`;
        } else if (isLuckyYear) {
          tradeReason = `${m.year} untraded catch — Guaranteed/High-odds Lucky Trade candidate.`;
        } else if (isLegOrUb) {
          tradeReason = 'Surplus Legendary / Ultra Beast for Lucky Friends or Special Trade.';
        } else if (m.is_gigantamax) {
          tradeReason = 'Surplus Gigantamax Special Trade candidate.';
        } else if (m.is_dynamax) {
          const curDmax = mirrorTradeCountByDex.get(m.dex) || 0;
          if (curDmax < 2 && m.max_rank !== null && m.max_rank <= 25) {
            mirrorTradeCountByDex.set(m.dex, curDmax + 1);
            tradeReason = 'Surplus meta Dynamax mirror-trade candidate.';
          }
        } else if (isHighMetaMirror) {
          const curMirror = mirrorTradeCountByDex.get(m.dex) || 0;
          if (curMirror < MIRROR_TRADE_CAP_PER_DEX) {
            mirrorTradeCountByDex.set(m.dex, curMirror + 1);
            tradeReason = `L${Math.round(m.level)} meta mirror-trade candidate for XL Candy & Lucky IV reroll.`;
          }
        }
      }

      if (tradeReason) {
        m.verdict = 'TRADE';
        m.role = m.variant_trade
          ? `Trade (${m.variant_trade})`
          : isLuckyYear
          ? `${m.year} Lucky Trade`
          : isLegOrUb || m.is_gigantamax
          ? 'Special Trade'
          : 'Mirror Trade';
        m.why_keep = tradeReason;
        aux.verdict_priority = 7;
      } else {
        m.review_reasons = [];
        m.verdict = 'TRANSFER';
        if (m.is_traded) {
          m.role = 'Traded low-IV surplus';
          m.why_keep = `Already traded (${m.iv_pct}% IV) — safe to transfer for candy.`;
        } else if (m.is_shadow && m.raid_reject) {
          m.role = 'Shadow surplus';
          m.why_keep = `Untradable Shadow (${m.iv_pct}% IV, ${m.raid_reject}) — transfer for candy.`;
        } else if (triageEnabled && m.iv_pct < transferIvFloor) {
          m.role = 'Low IV garbage';
          m.why_keep = `IV ${m.iv_pct}% below useful floor — transfer for candy.`;
        } else {
          m.role = 'Surplus transfer';
          m.why_keep = coveredPvpSidCaps.size > 0 && m.iv_demoted
            ? `Surplus copy (${m.iv_pct}% IV) — better specimens already kept.`
            : 'Surplus copy — safe to transfer for candy.';
        }
        aux.verdict_priority = 9;
      }
    }
  }

  void isCrownedForm;
  void boostTypesFor;
  void ingameSearch;
  void GMAX_MOVE_POWER;
  void MAX_MOVE_POWER;
  void CROWNED_MAX_OVERRIDE;
}
