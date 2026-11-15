import { CPM } from './cpmTable';
import {
  cleanSpeciesName,
  DEFENDER_DEF,
  OUT_OF_PLAY,
  SHADOW_ATK_MULT,
  STAB,
} from './defaultConfig';
import { Dex, moveLabel, pveMove, typeEff } from './pveModel';
import type { LevelTheseItem, PvPokeMove, PvPokeSpecies, ReportJson, ReportMon } from './types';

// ============================================================
// FEATURE 5 — LIVE RAID BOSS COUNTER BUILDER
// ============================================================

export interface SelectableRaidBoss {
  sid: string;
  name: string;
  types: string[];
  tierLabel: string;
  eventLabel?: string;
}

export interface BossCounterEntry {
  slot: number;
  id: string;
  name: string;
  dex: number;
  cp: number;
  level: number;
  iv: string;
  shadow: boolean;
  is_mega: boolean;
  est_dps: number;
  eff_mult: number;
  weather_boosted: boolean;
  moveset: string;
  moves_ready: boolean;
  verdict: ReportMon['verdict'];
}

export interface BossCounterSquadResult {
  boss: SelectableRaidBoss;
  weather: string;
  weather_types: string[];
  weaknesses: { type: string; mult: number }[];
  squad: BossCounterEntry[];
  search_query: string;
  excluded_collision_count: number;
}

export const WEATHER_OPTIONS: { key: string; label: string; types: string[] }[] = [
  { key: 'none', label: 'Neutral Weather (No Boost)', types: [] },
  { key: 'sunny', label: 'Sunny / Clear', types: ['grass', 'fire', 'ground'] },
  { key: 'rainy', label: 'Rainy', types: ['water', 'electric', 'bug'] },
  { key: 'partly_cloudy', label: 'Partly Cloudy', types: ['normal', 'rock'] },
  { key: 'cloudy', label: 'Cloudy', types: ['fairy', 'fighting', 'poison'] },
  { key: 'windy', label: 'Windy', types: ['dragon', 'flying', 'psychic'] },
  { key: 'snow', label: 'Snow', types: ['ice', 'steel'] },
  { key: 'fog', label: 'Fog', types: ['dark', 'ghost'] },
];

const ICONIC_RAID_BOSS_SIDS: { sid: string; tier: string }[] = [
  { sid: 'mewtwo', tier: '5★ Raid' },
  { sid: 'rayquaza_mega', tier: 'Mega Legendary' },
  { sid: 'rayquaza', tier: '5★ Raid' },
  { sid: 'kyogre_primal', tier: 'Primal Raid' },
  { sid: 'groudon_primal', tier: 'Primal Raid' },
  { sid: 'necrozma_dusk_mane', tier: '5★ Raid' },
  { sid: 'necrozma_dawn_wings', tier: '5★ Raid' },
  { sid: 'zacian_crowned_sword', tier: '5★ Raid' },
  { sid: 'zamazenta_crowned_shield', tier: '5★ Raid' },
  { sid: 'kyurem_black', tier: '5★ Raid' },
  { sid: 'kyurem_white', tier: '5★ Raid' },
  { sid: 'dialga_origin', tier: '5★ Raid' },
  { sid: 'palkia_origin', tier: '5★ Raid' },
  { sid: 'giratina_origin', tier: '5★ Raid' },
  { sid: 'reshiram', tier: '5★ Raid' },
  { sid: 'zekrom', tier: '5★ Raid' },
  { sid: 'landorus_therian', tier: '5★ Raid' },
  { sid: 'heatran', tier: '5★ Raid' },
  { sid: 'darkrai', tier: 'Mythical 5★' },
  { sid: 'terrakion', tier: '5★ Raid' },
  { sid: 'kartana', tier: 'Ultra Beast' },
  { sid: 'xurkitree', tier: 'Ultra Beast' },
  { sid: 'lugia', tier: '5★ Raid' },
  { sid: 'ho_oh', tier: '5★ Raid' },
  { sid: 'blacephalon', tier: 'Ultra Beast' },
  { sid: 'stakataka', tier: 'Ultra Beast' },
  { sid: 'lucario_mega', tier: 'Mega Raid' },
  { sid: 'gengar_mega', tier: 'Mega Raid' },
  { sid: 'tyranitar_mega', tier: 'Mega Raid' },
  { sid: 'gardevoir_mega', tier: 'Mega Raid' },
  { sid: 'charizard_mega_y', tier: 'Mega Raid' },
  { sid: 'blaziken_mega', tier: 'Mega Raid' },
  { sid: 'garchomp_mega', tier: 'Mega Raid' },
  { sid: 'salamence_mega', tier: 'Mega Raid' },
];

export function listSelectableRaidBosses(
  report: ReportJson,
  dex: Dex,
): SelectableRaidBoss[] {
  const seen = new Map<string, SelectableRaidBoss>();

  // 1. Live & upcoming event bosses from briefing
  for (const ev of report.briefing?.events || []) {
    if (ev.status !== 'live' && ev.status !== 'soon') continue;
    for (const bs of ev.species || []) {
      const sp = dex.byId.get(bs.sid);
      const types = (sp?.types || bs.types || []).map((t) => t.toLowerCase()).filter(Boolean);
      if (!types.length) continue;
      const key = sp?.speciesId || bs.sid;
      if (!seen.has(key)) {
        seen.set(key, {
          sid: key,
          name: cleanSpeciesName(sp?.speciesName || bs.name),
          types,
          tierLabel: ev.status === 'live' ? 'Live Event' : 'Upcoming Event',
          eventLabel: ev.name,
        });
      }
    }
  }

  // 2. Canonical 5★, Primal & Mega bosses from Dex
  for (const { sid, tier } of ICONIC_RAID_BOSS_SIDS) {
    const sp = dex.byId.get(sid);
    if (!sp || seen.has(sp.speciesId)) continue;
    seen.set(sp.speciesId, {
      sid: sp.speciesId,
      name: cleanSpeciesName(sp.speciesName),
      types: (sp.types || []).map((t) => t.toLowerCase()),
      tierLabel: tier,
    });
  }

  return Array.from(seen.values());
}

function moveDurationSec(m: PvPokeMove): number {
  for (const k of ['cooldown', 'durationMs', 'duration'] as const) {
    const v = m[k];
    if (typeof v === 'number' && v > 0) return v / 1000;
  }
  if (typeof m.turns === 'number' && m.turns > 0) return m.turns * 0.5;
  return 0.5;
}

function bestBossDpsForSpecies(
  sp: PvPokeSpecies,
  dex: Dex,
  bossTypes: string[],
  weatherTypes: Set<string>,
  atkIv: number,
  level: number,
  isShadow: boolean,
): {
  dps: number;
  fastId: string;
  chargedId: string;
  effMult: number;
  weatherBoosted: boolean;
} {
  const spTypes = new Set((sp.types || []).map((t) => t.toLowerCase()));
  const fasts: { id: string; type: string; power: number; dur: number; energy: number }[] = [];
  const chargeds: { id: string; type: string; power: number; dur: number; cost: number }[] = [];

  for (const fid of sp.fastMoves || []) {
    const m = dex.moves.get(fid);
    if (!m) continue;
    const pv = pveMove(dex.pve, fid, true);
    if (dex.pve.ok) {
      if (!pv || pv.p <= 0 || pv.e <= 0 || pv.d <= 0) continue;
      fasts.push({ id: fid, type: pv.t || m.type.toLowerCase(), power: pv.p, dur: pv.d / 1000, energy: pv.e });
    } else if ((m.power ?? 0) > 0 && (m.energyGain ?? 0) > 0) {
      fasts.push({
        id: fid,
        type: m.type.toLowerCase(),
        power: m.power!,
        dur: moveDurationSec(m),
        energy: Math.max(1, m.energyGain!),
      });
    }
  }

  const isCrowned = sp.speciesId.includes('crowned');
  for (const cid of sp.chargedMoves || []) {
    if (!isCrowned && String(cid).toUpperCase().includes('BEHEMOTH')) continue;
    const m = dex.moves.get(cid);
    if (!m) continue;
    const pv = pveMove(dex.pve, cid, false);
    if (dex.pve.ok) {
      if (!pv || pv.p <= 0 || pv.e >= 0 || pv.d <= 0) continue;
      chargeds.push({ id: cid, type: pv.t || m.type.toLowerCase(), power: pv.p, dur: pv.d / 1000, cost: -pv.e });
    } else if ((m.power ?? 0) > 0 && m.type) {
      chargeds.push({
        id: cid,
        type: m.type.toLowerCase(),
        power: m.power!,
        dur: moveDurationSec(m),
        cost: Math.abs(m.energy ?? 50) || 50,
      });
    }
  }

  const halfLv = Math.max(1, Math.min(51, Math.round(level * 2) / 2));
  const cpm = CPM[halfLv] || CPM[40] || 0.7903;
  const effAtk = (sp.baseStats.atk + atkIv) * cpm * (isShadow ? SHADOW_ATK_MULT : 1.0);

  let bestDps = 0;
  let bestFast = '';
  let bestCharged = '';
  let bestEff = 1.0;
  let bestBoosted = false;

  for (const cm of chargeds) {
    const cmStab = spTypes.has(cm.type) ? STAB : 1.0;
    const cmEff = typeEff(cm.type, bossTypes);
    const cmWeather = weatherTypes.has(cm.type) ? 1.2 : 1.0;
    const cmDmg = (0.5 * cm.power * effAtk * cmStab * cmEff * cmWeather) / DEFENDER_DEF;

    for (const fm of fasts) {
      const fmStab = spTypes.has(fm.type) ? STAB : 1.0;
      const fmEff = typeEff(fm.type, bossTypes);
      const fmWeather = weatherTypes.has(fm.type) ? 1.2 : 1.0;
      const fmDmg = (0.5 * fm.power * effAtk * fmStab * fmEff * fmWeather) / DEFENDER_DEF;

      const n = dex.pve.ok ? cm.cost / fm.energy : Math.ceil(cm.cost / fm.energy);
      const cycle = n * fm.dur + cm.dur;
      if (cycle <= 0) continue;
      const dps = (n * fmDmg + cmDmg) / cycle;
      if (dps > bestDps) {
        bestDps = dps;
        bestFast = fm.id;
        bestCharged = cm.id;
        bestEff = Math.round(cmEff * 100) / 100;
        bestBoosted = cmWeather > 1 || fmWeather > 1;
      }
    }
  }

  return {
    dps: Math.round(bestDps * 10) / 10,
    fastId: bestFast,
    chargedId: bestCharged,
    effMult: bestEff,
    weatherBoosted: bestBoosted,
  };
}

function buildPartySearchQuery(
  squadMons: ReportMon[],
  allMons: ReportMon[],
): { query: string; excludedCollisions: number } {
  if (squadMons.length === 0) return { query: '', excludedCollisions: 0 };
  const targetIds = new Set(squadMons.map((m) => m.id));
  const riskByDex = new Map<number, Set<number>>();
  const riskByCp = new Map<number, Set<number>>();

  for (const m of allMons) {
    if (targetIds.has(m.id)) continue;
    let cps = riskByDex.get(m.dex);
    if (!cps) {
      cps = new Set<number>();
      riskByDex.set(m.dex, cps);
    }
    cps.add(m.cp);

    let dexs = riskByCp.get(m.cp);
    if (!dexs) {
      dexs = new Set<number>();
      riskByCp.set(m.cp, dexs);
    }
    dexs.add(m.dex);
  }

  const chosenDex = new Set<number>();
  const chosenCp = new Set<number>();
  let excluded = 0;

  for (const m of squadMons) {
    if (riskByDex.get(m.dex)?.has(m.cp)) {
      excluded++;
      continue;
    }
    const crossHit =
      (!chosenDex.has(m.dex) && Array.from(chosenCp).some((c) => riskByDex.get(m.dex)?.has(c))) ||
      (!chosenCp.has(m.cp) && Array.from(chosenDex).some((d) => riskByCp.get(m.cp)?.has(d)));
    if (crossHit) {
      excluded++;
      continue;
    }
    chosenDex.add(m.dex);
    chosenCp.add(m.cp);
  }

  if (chosenDex.size === 0) {
    return {
      query: squadMons.map((m) => `${m.dex}&cp${m.cp}`).slice(0, 1).join(''),
      excludedCollisions: excluded,
    };
  }

  const dexPart = Array.from(chosenDex).join(',');
  const cpPart = Array.from(chosenCp)
    .map((c) => `cp${c}`)
    .join(',');
  return {
    query: `!transfer&${dexPart}&${cpPart}`,
    excludedCollisions: excluded,
  };
}

export function buildBossCounterSquad(
  bossSid: string,
  weatherKey: string,
  report: ReportJson,
  dex: Dex,
): BossCounterSquadResult | null {
  const bosses = listSelectableRaidBosses(report, dex);
  const boss = bosses.find((b) => b.sid === bossSid) || bosses[0];
  if (!boss) return null;

  const weatherOpt = WEATHER_OPTIONS.find((w) => w.key === weatherKey) || WEATHER_OPTIONS[0];
  const weatherSet = new Set(weatherOpt.types);
  const bossTypes = boss.types.length ? boss.types : ['normal'];

  const weaknesses = Object.keys(
    bossTypes.reduce<Record<string, boolean>>((acc) => acc, {}),
  );
  void weaknesses;
  const ALL_TYPES = [
    'bug', 'dark', 'dragon', 'electric', 'fairy', 'fighting',
    'fire', 'flying', 'ghost', 'grass', 'ground', 'ice',
    'normal', 'poison', 'psychic', 'rock', 'steel', 'water',
  ];
  const weakList = ALL_TYPES.map((t) => ({
    type: t,
    mult: Math.round(typeEff(t, bossTypes) * 100) / 100,
  }))
    .filter((w) => w.mult > 1.05)
    .sort((a, b) => b.mult - a.mult);

  const megaCands: { entry: Omit<BossCounterEntry, 'slot'>; r: ReportMon }[] = [];
  const regCands: { entry: Omit<BossCounterEntry, 'slot'>; r: ReportMon }[] = [];

  for (const r of report.mons) {
    if (OUT_OF_PLAY.has(r.verdict)) continue;
    const baseSid = (r.sid || '').replace(/_shadow$/, '');
    const sp = dex.byId.get(baseSid) || (dex.byDex.get(r.dex) || [])[0];
    if (!sp) continue;

    const atkIv = r.a ?? 10;
    const knownMoves = new Set((r.moves || []).map((mv) => mv.name.toLowerCase()));

    // Regular form evaluation (if level >= 15 or build verdict)
    const regEval = bestBossDpsForSpecies(
      sp,
      dex,
      bossTypes,
      weatherSet,
      atkIv,
      r.level,
      r.shadow,
    );
    if (regEval.dps > 0) {
      const fastNm = moveLabel(regEval.fastId);
      const chargedNm = moveLabel(regEval.chargedId);
      regCands.push({
        r,
        entry: {
          id: r.id,
          name: r.species,
          dex: r.dex,
          cp: r.cp,
          level: r.level,
          iv: r.iv,
          shadow: r.shadow,
          is_mega: false,
          est_dps: regEval.dps,
          eff_mult: regEval.effMult,
          weather_boosted: regEval.weatherBoosted,
          moveset: `${fastNm} / ${chargedNm}`,
          moves_ready:
            knownMoves.size === 0 ||
            (knownMoves.has(fastNm.toLowerCase()) && knownMoves.has(chargedNm.toLowerCase())),
          verdict: r.verdict,
        },
      });
    }

    // Unlocked Mega / Primal option
    if ((r.mega_level ?? 0) > 0 && !r.shadow) {
      const forms = r.mega_forms || [];
      const megaSpList = (dex.byDex.get(r.dex) || []).filter(
        (cand) =>
          (cand.speciesId.includes('_mega') || cand.speciesId.includes('_primal')) &&
          (forms.length === 0 ||
            ((cand.speciesId.endsWith('_mega_x') && forms.includes(2)) ||
              (cand.speciesId.endsWith('_mega_y') && forms.includes(3)) ||
              (!cand.speciesId.endsWith('_mega_x') &&
                !cand.speciesId.endsWith('_mega_y') &&
                (forms.includes(1) || forms.includes(0))))),
      );
      for (const msp of megaSpList) {
        const mEval = bestBossDpsForSpecies(msp, dex, bossTypes, weatherSet, atkIv, r.level, false);
        if (mEval.dps <= 0) continue;
        const fastNm = moveLabel(mEval.fastId);
        const chargedNm = moveLabel(mEval.chargedId);
        megaCands.push({
          r,
          entry: {
            id: r.id,
            name: cleanSpeciesName(msp.speciesName),
            dex: r.dex,
            cp: r.cp,
            level: r.level,
            iv: r.iv,
            shadow: false,
            is_mega: true,
            est_dps: mEval.dps,
            eff_mult: mEval.effMult,
            weather_boosted: mEval.weatherBoosted,
            moveset: `${fastNm} / ${chargedNm}`,
            moves_ready:
              knownMoves.size === 0 ||
              (knownMoves.has(fastNm.toLowerCase()) && knownMoves.has(chargedNm.toLowerCase())),
            verdict: r.verdict,
          },
        });
      }
    }
  }

  megaCands.sort((a, b) => b.entry.est_dps - a.entry.est_dps || b.r.iv_pct - a.r.iv_pct);
  regCands.sort((a, b) => b.entry.est_dps - a.entry.est_dps || b.r.iv_pct - a.r.iv_pct);

  const squad: BossCounterEntry[] = [];
  const chosenMons: ReportMon[] = [];
  const usedIds = new Set<string>();

  if (megaCands[0]) {
    squad.push({ ...megaCands[0].entry, slot: 1 });
    chosenMons.push(megaCands[0].r);
    usedIds.add(megaCands[0].r.id);
  }

  for (const rc of regCands) {
    if (squad.length >= 6) break;
    if (usedIds.has(rc.r.id)) continue;
    usedIds.add(rc.r.id);
    chosenMons.push(rc.r);
    squad.push({ ...rc.entry, slot: squad.length + 1 });
  }

  const { query, excludedCollisions } = buildPartySearchQuery(chosenMons, report.mons);

  return {
    boss,
    weather: weatherOpt.key,
    weather_types: weatherOpt.types,
    weaknesses: weakList.slice(0, 6),
    squad,
    search_query: query,
    excluded_collision_count: excludedCollisions,
  };
}

// ============================================================
// FEATURE 6 — STARDUST & CANDY BUDGET SHOPPING CART PLANNER
// ============================================================

export interface DustBudgetPlanResult {
  budget: number;
  selectedItems: LevelTheseItem[];
  selectedIds: Set<string>;
  totalDust: number;
  totalCandy: number;
  totalXl: number;
  leftoverDust: number;
  combinedSearch: string;
}

export function solveDustBudgetPlan(
  items: LevelTheseItem[],
  budget: number,
  allReportMons: ReportMon[],
): DustBudgetPlanResult {
  const cleanBudget = Math.max(0, Math.round(budget));
  const eligible = items
    .filter((it) => it.cost.dust > 0 && it.cost.dust <= cleanBudget)
    .sort((a, b) => {
      const aReady = a.can_build_now !== false ? 1 : 0;
      const bReady = b.can_build_now !== false ? 1 : 0;
      if (aReady !== bReady) return bReady - aReady;
      const aEff = a.impact / Math.pow(Math.max(1000, a.cost.dust), 0.25);
      const bEff = b.impact / Math.pow(Math.max(1000, b.cost.dust), 0.25);
      return bEff - aEff || b.impact - a.impact || a.cost.dust - b.cost.dust;
    });

  const selectedItems: LevelTheseItem[] = [];
  const selectedIds = new Set<string>();
  let totalDust = 0;
  let totalCandy = 0;
  let totalXl = 0;

  for (const it of eligible) {
    if (totalDust + it.cost.dust <= cleanBudget) {
      selectedItems.push(it);
      selectedIds.add(it.id);
      totalDust += it.cost.dust;
      totalCandy += it.cost.candy;
      totalXl += it.cost.xl;
    }
  }

  const monMap = new Map(allReportMons.map((m) => [m.id, m]));
  const selectedMons = selectedItems
    .map((it) => monMap.get(it.id))
    .filter((m): m is ReportMon => Boolean(m));
  const { query } = buildPartySearchQuery(selectedMons, allReportMons);

  return {
    budget: cleanBudget,
    selectedItems,
    selectedIds,
    totalDust,
    totalCandy,
    totalXl,
    leftoverDust: Math.max(0, cleanBudget - totalDust),
    combinedSearch: query || selectedItems[0]?.search || '',
  };
}

// ============================================================
// FEATURE 7 — SIDE-BY-SIDE POKÉMON SHOWDOWN COMPARISON
// ============================================================

export interface CompareMetricRow {
  label: string;
  valA: string;
  valB: string;
  winner: 'a' | 'b' | 'tie';
}

export interface CompareShowdownResult {
  monA: ReportMon;
  monB: ReportMon;
  sameSpecies: boolean;
  takeaways: string[];
  rows: CompareMetricRow[];
}

export function compareTwoMons(monA: ReportMon, monB: ReportMon): CompareShowdownResult {
  const bestPvpA = monA.pvp
    .filter((p) => p.eligible)
    .sort((a, b) => a.iv_rank - b.iv_rank || a.combined - b.combined)[0];
  const bestPvpB = monB.pvp
    .filter((p) => p.eligible)
    .sort((a, b) => a.iv_rank - b.iv_rank || a.combined - b.combined)[0];

  const rows: CompareMetricRow[] = [
    {
      label: 'CP',
      valA: String(monA.cp),
      valB: String(monB.cp),
      winner: monA.cp > monB.cp ? 'a' : monB.cp > monA.cp ? 'b' : 'tie',
    },
    {
      label: 'Level',
      valA: `L${monA.level}`,
      valB: `L${monB.level}`,
      winner: monA.level > monB.level ? 'a' : monB.level > monA.level ? 'b' : 'tie',
    },
    {
      label: 'IV %',
      valA: `${monA.iv} (${monA.iv_pct}%)`,
      valB: `${monB.iv} (${monB.iv_pct}%)`,
      winner: monA.iv_pct > monB.iv_pct ? 'a' : monB.iv_pct > monA.iv_pct ? 'b' : 'tie',
    },
    {
      label: 'Attack IV',
      valA: String(monA.a ?? '?'),
      valB: String(monB.a ?? '?'),
      winner: (monA.a ?? 0) > (monB.a ?? 0) ? 'a' : (monB.a ?? 0) > (monA.a ?? 0) ? 'b' : 'tie',
    },
    {
      label: 'Best PvP IV Rank',
      valA: bestPvpA ? `${bestPvpA.league} #${bestPvpA.iv_rank}` : 'None',
      valB: bestPvpB ? `${bestPvpB.league} #${bestPvpB.iv_rank}` : 'None',
      winner:
        bestPvpA && bestPvpB
          ? bestPvpA.iv_rank < bestPvpB.iv_rank
            ? 'a'
            : bestPvpB.iv_rank < bestPvpA.iv_rank
            ? 'b'
            : 'tie'
          : bestPvpA
          ? 'a'
          : bestPvpB
          ? 'b'
          : 'tie',
    },
    {
      label: 'Build Stardust',
      valA: monA.cost_dust > 0 ? monA.cost_dust.toLocaleString() : '0 (Ready)',
      valB: monB.cost_dust > 0 ? monB.cost_dust.toLocaleString() : '0 (Ready)',
      winner:
        monA.cost_dust < monB.cost_dust ? 'a' : monB.cost_dust < monA.cost_dust ? 'b' : 'tie',
    },
    {
      label: 'Shadow / Lucky',
      valA: [monA.shadow ? 'Shadow (+20% ATK)' : null, monA.lucky ? 'Lucky (½ Dust)' : null].filter(Boolean).join(', ') || 'Standard',
      valB: [monB.shadow ? 'Shadow (+20% ATK)' : null, monB.lucky ? 'Lucky (½ Dust)' : null].filter(Boolean).join(', ') || 'Standard',
      winner: 'tie',
    },
    {
      label: 'Current Moves',
      valA: monA.moves.map((m) => m.name).join(' / ') || 'Hidden',
      valB: monB.moves.map((m) => m.name).join(' / ') || 'Hidden',
      winner: 'tie',
    },
    {
      label: 'Sorter Role',
      valA: `${monA.verdict}: ${monA.role || '—'}`,
      valB: `${monB.verdict}: ${monB.role || '—'}`,
      winner: 'tie',
    },
  ];

  const takeaways: string[] = [];
  const sameSpecies = monA.dex === monB.dex;
  if (sameSpecies) {
    takeaways.push(`Same Pokédex family (#${monA.dex}) — direct replacement check.`);
  }
  if (Math.abs(monA.iv_pct - monB.iv_pct) >= 0.5) {
    const hi = monA.iv_pct > monB.iv_pct ? monA : monB;
    const lo = hi === monA ? monB : monA;
    takeaways.push(
      `${hi.species} (${hi.iv}) leads Raid/Master IV accuracy at ${hi.iv_pct}% vs ${lo.iv_pct}%.`,
    );
  }
  if (bestPvpA && (!bestPvpB || bestPvpA.iv_rank < bestPvpB.iv_rank)) {
    takeaways.push(
      `${monA.species} holds the sharper PvP stat product (#${bestPvpA.iv_rank} in ${bestPvpA.league}).`,
    );
  } else if (bestPvpB && (!bestPvpA || bestPvpB.iv_rank < bestPvpA.iv_rank)) {
    takeaways.push(
      `${monB.species} holds the sharper PvP stat product (#${bestPvpB.iv_rank} in ${bestPvpB.league}).`,
    );
  }
  if (monA.shadow !== monB.shadow) {
    const sh = monA.shadow ? monA : monB;
    takeaways.push(`${sh.species} deals +20% Shadow Raid damage per second.`);
  }
  if (monA.cost_dust !== monB.cost_dust && Math.abs(monA.cost_dust - monB.cost_dust) >= 10000) {
    const cheaper = monA.cost_dust < monB.cost_dust ? monA : monB;
    const diff = Math.abs(monA.cost_dust - monB.cost_dust);
    takeaways.push(`${cheaper.species} saves ${diff.toLocaleString()} Stardust to finish building.`);
  }
  if (takeaways.length === 0) {
    takeaways.push('Both Pokémon sit at virtually identical strength — pick based on team coverage or moves.');
  }

  return {
    monA,
    monB,
    sameSpecies,
    takeaways,
    rows,
  };
}

// ============================================================
// FEATURE 9 — BAG PROGRESS SNAPSHOT HISTORY (LOCALSTORAGE)
// ============================================================

export interface BagProgressSnapshot {
  key: string;
  savedAt: string;
  exportTime: string;
  totalMons: number;
  transferCount: number;
  gradePct: number;
  gradeLetter: string;
  raidAvgPct: number;
  megaCovered: number;
  lv3Megas: number;
  hundos: number;
  pvpRank1Count: number;
}

export interface BagProgressDiff {
  previous: BagProgressSnapshot;
  current: BagProgressSnapshot;
  totalSnapshots: number;
  deltas: {
    totalMons: number;
    transferCount: number;
    gradePct: number;
    raidAvgPct: number;
    megaCovered: number;
    lv3Megas: number;
    hundos: number;
    pvpRank1Count: number;
  };
}

const HISTORY_STORAGE_KEY = 'pogo-sorter:history:v1';
const MAX_SNAPSHOTS = 10;

export function buildSnapshotFromReport(report: ReportJson): BagProgressSnapshot {
  const raidSections = report.grade?.sections?.raid || [];
  const raidAvgPct = raidSections.length
    ? Math.round(
        (raidSections.reduce((s, r) => s + r.strength_pct, 0) / raidSections.length) * 10,
      ) / 10
    : 0;
  const exportTime = report.meta?.export_time || '';
  const totalMons = report.meta?.mons ?? report.mons.length;
  const transferCount = report.transfer?.total ?? 0;
  const gradePct = report.grade?.overall_pct ?? 0;
  const gradeLetter = report.grade?.letter ?? '—';
  const megaCovered = report.grade?.sections?.mega?.covered ?? 0;
  const lv3Megas = report.mega_optimizer?.lv3_count ?? 0;
  const hundos = report.counts?.special?.hundos ?? 0;
  const pvpRank1Count = report.mons.filter(
    (m) => !OUT_OF_PLAY.has(m.verdict) && m.pvp.some((p) => p.eligible && p.iv_rank === 1),
  ).length;

  return {
    key: `${exportTime}|${totalMons}|${transferCount}|${gradePct}`,
    savedAt: new Date().toISOString(),
    exportTime,
    totalMons,
    transferCount,
    gradePct,
    gradeLetter,
    raidAvgPct,
    megaCovered,
    lv3Megas,
    hundos,
    pvpRank1Count,
  };
}

export function loadHistorySnapshots(): BagProgressSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BagProgressSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function clearHistorySnapshots(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function recordAndDiffSnapshot(report: ReportJson): BagProgressDiff | null {
  const current = buildSnapshotFromReport(report);
  const existing = loadHistorySnapshots();
  const last = existing[existing.length - 1];

  let updated = existing;
  if (!last || last.key !== current.key) {
    updated = [...existing, current].slice(-MAX_SNAPSHOTS);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore quota errors
      }
    }
  }

  if (updated.length < 2) {
    return {
      previous: current,
      current,
      totalSnapshots: updated.length,
      deltas: {
        totalMons: 0,
        transferCount: 0,
        gradePct: 0,
        raidAvgPct: 0,
        megaCovered: 0,
        lv3Megas: 0,
        hundos: 0,
        pvpRank1Count: 0,
      },
    };
  }

  const previous = updated[updated.length - 2];
  return {
    previous,
    current,
    totalSnapshots: updated.length,
    deltas: {
      totalMons: current.totalMons - previous.totalMons,
      transferCount: current.transferCount - previous.transferCount,
      gradePct: Math.round((current.gradePct - previous.gradePct) * 10) / 10,
      raidAvgPct: Math.round((current.raidAvgPct - previous.raidAvgPct) * 10) / 10,
      megaCovered: current.megaCovered - previous.megaCovered,
      lv3Megas: current.lv3Megas - previous.lv3Megas,
      hundos: current.hundos - previous.hundos,
      pvpRank1Count: current.pvpRank1Count - previous.pvpRank1Count,
    },
  };
}
