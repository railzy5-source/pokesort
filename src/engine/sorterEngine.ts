import { setLiveEvolveCosts, setLiveSecondMoveCosts } from './costTables';
import { evaluatePvpBattleMatrix } from './battleSim';
import { computeCp } from './cpmTable';
import {
  buildMergedConfig,
  getActiveLeaguesAndCups,
} from './defaultConfig';
import { loadRemoteGameData } from './gameDataClient';
import { isCuratedMega } from './megaCurated';
import { buildOfflineFallbackData } from './offlineFallback';
import {
  applyVariantRules,
  applyMaxGate,
  assignTypes,
  classifyMons,
  computeCoverageFirst,
  getAux,
  type MonAux,
} from './placementAndGates';
import { parsePgsExport, resolveAccount, toMon } from './pgsParser';
import {
  applyExternalRaidRankings,
  loadPokebattlerTypeRankings,
  type TypeRankingMap,
} from './pokebattlerRankings';
import {
  createPveContext,
  createSizeContext,
  Dex,
} from './pveModel';
import { buildFullReport } from './teamsAndGrade';
import type {
  AnalysisProgress,
  PogoConfig,
  RemoteGameData,
  ReportJson,
  MonModel,
} from './types';

export type UserConfigInput = Record<string, unknown>;

export interface RunAnalysisOptions {
  useOfflineFallbackOnly?: boolean;
  forceRefreshCache?: boolean;
  onProgress?: (p: AnalysisProgress) => void;
}

export function analyzePgsExport(
  rawExport: unknown,
  userCfg: UserConfigInput | null | undefined,
  remoteData: RemoteGameData,
  onStage?: (stage: string, pct: number) => void,
  externalRaidRankings?: TypeRankingMap | null,
): ReportJson {
  onStage?.('Parsing PGSStats collection…', 15);
  const parsed = parsePgsExport(rawExport);
  // Real evolution costs from the game master (null = built-in table, shown as "estimated")
  setLiveEvolveCosts(remoteData.evolveCosts);
  setLiveSecondMoveCosts(remoteData.secondMoveCosts);
  const cfg: PogoConfig = buildMergedConfig(userCfg);
  const { caps, cups } = getActiveLeaguesAndCups(cfg);

  onStage?.('Building PvP & PvE species tables…', 35);
  const pveCtx = createPveContext(remoteData, cfg);
  const sizeCtx = createSizeContext(remoteData);
  const dex = new Dex(remoteData, cfg, pveCtx, caps, cups);

  // Replace internal type rankings with Pokébattler when available (and requested).
  const source = String(cfg.raid?.ranking_source || 'pokebattler').toLowerCase();
  if (source === 'pokebattler' && externalRaidRankings && externalRaidRankings.size > 0) {
    const n = applyExternalRaidRankings(dex, externalRaidRankings, true);
    onStage?.(
      n > 0
        ? `Raid rankings: Pokébattler (${n} types)`
        : 'Raid rankings: internal (Pokébattler empty)',
      38,
    );
  } else if (source === 'pokebattler') {
    onStage?.('Raid rankings: internal (Pokébattler unavailable)', 38);
  }

  const ORIGIN_MOVE_IDENTS = new Set([
    'ROAR_OF_TIME',
    'SPACIAL_REND',
    'SPATIAL_REND',
    'SUNSTEEL_STRIKE',
    'MOONGEIST_BEAM',
    'FREEZE_SHOCK',
    'ICE_BURN',
    'BEHEMOTH_BLADE',
    'BEHEMOTH_BASH',
    'DYNAMAX_CANNON',
    'DRAGON_ASCENT',
    'PRECIPICE_BLADES',
    'ORIGIN_PULSE',
    'GLACIATE',
    'MAGMA_STORM',
    'AEROBLAST',
    'SACRED_FIRE',
  ]);

  const mons = parsed.pokemon.map((raw, i) => {
    const m = toMon(raw, i, {
      tagMap: parsed.tagMap,
      exportRefMs: parsed.exportRefMs,
    });
    m.species = dex.resolve(m);
    for (const mv of m.knows_moves) {
      const ident = typeof mv === 'number'
        ? (dex.pve.byId.get(mv) || '')
        : (!Number.isNaN(Number(mv)) && String(mv).trim() !== ''
            ? (dex.pve.byId.get(Number(mv)) || String(mv).toUpperCase())
            : String(mv).toUpperCase());
      const cleanIdent = ident.replace(/_FAST$/, '');
      if (ORIGIN_MOVE_IDENTS.has(cleanIdent)) {
        m.origin_move = cleanIdent
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      }
    }
    if (m.species) {
      const famMegas = dex.familyMegaInfo(m.species.speciesId);
      if (famMegas.length > 0) {
        m.is_mega_capable = true;
        // B:1 — Select X (form=2) vs Y (form=3) Mega form if recorded on this specimen;
        // otherwise prefer a curated primary Mega (e.g. raichu_mega_y, charizard_mega_y, mewtwo_mega_y).
        let chosenMega = famMegas.find((id) => isCuratedMega(id, dex.megaSpecies)) || famMegas[0];
        if (famMegas.length > 1) {
          const megaX = famMegas.find((id) => id.endsWith('_mega_x'));
          const megaY = famMegas.find((id) => id.endsWith('_mega_y'));
          if (m.mega_forms.length > 0) {
            const hasX = m.mega_forms.includes(2);
            const hasY = m.mega_forms.includes(3);
            if (hasY && !hasX && megaY) chosenMega = megaY;
            else if (hasX && !hasY && megaX) chosenMega = megaX;
            else if (megaY && isCuratedMega(megaY, dex.megaSpecies)) chosenMega = megaY;
          } else if (megaY && isCuratedMega(megaY, dex.megaSpecies)) {
            chosenMega = megaY;
          }
        }
        m.mega_sid = chosenMega;
        m.is_mega_pre_evo = !dex.megaBases.has(m.species.speciesId);
      }
    }
    return m;
  });

  // Flag the current buddy (cannot be traded)
  const buddyAcc = (resolveAccount(parsed.rawData).buddyPokemonProto || {}) as Record<string, unknown>;
  const buddyId = buddyAcc.buddyPokemonId ? String(buddyAcc.buddyPokemonId) : '';
  if (buddyId) {
    for (const m of mons) {
      if (String(m.raw.id ?? m.raw.uid ?? '') === buddyId) m.is_buddy = true;
    }
  }

  dex.applyDynamaxFilter(mons);
  const auxMap = new Map<string, MonAux>();
  for (const m of mons) {
    const aux = getAux(auxMap, m);
    if (m.species && m.mega_sid) {
      aux.can_mega = true;
      aux.mega_base_sid = m.mega_sid;
    }
  }

  onStage?.('Running variant protection & global Raid/Max placement…', 55);
  applyVariantRules(mons, cfg, auxMap);
  // A Pokémon holds ONE of these roles. Max Battles are placed first (fewer Pokémon qualify, and a Dynamax Pokémon's Max
  // Move type depends on its fast move), then raid placement skips every Pokémon that really holds a Max slot.
  const maxPlace = assignTypes(mons, dex, cfg, 'max', auxMap);
  applyMaxGate(mons, cfg, auxMap);
  const holdsMaxSlot = (m: MonModel) => Boolean(m.max_type && !m.max_reject);
  const raidPlace = assignTypes(mons, dex, cfg, 'raid', auxMap, holdsMaxSlot);

  onStage?.('Evaluating PvP leagues, IV ranks & quality gates…', 72);
  classifyMons(mons, dex, cfg, caps, cups, auxMap);
  const covState = computeCoverageFirst(mons, dex, cfg);

  // B:3 — Compute exact purified CP preview using species base stats
  for (const m of mons) {
    if (m.purify_preview && m.species) {
      const pa = Math.min(15, m.a + 2);
      const pd = Math.min(15, m.d + 2);
      const ps = Math.min(15, m.s + 2);
      m.purify_preview.purified_cp = computeCp(
        m.species.baseStats,
        pa,
        pd,
        ps,
        m.purify_preview.purified_level,
      );
      if (m.purify_preview.becomes_hundo && m.why_keep && !m.why_keep.includes('100%')) {
        m.why_keep = `${m.why_keep} · Purifies to 100% Hundo`.replace(/^ · /, '');
      }
    }
  }

  // A:1 & A:2 — Run PvPoke battle matrix + Breakpoints/CMP for BUILD_PVP + top eligible PvP picks
  onStage?.('Simulating PvPoke Battle Matrix & breakpoints…', 82);
  const simCandidates = mons
    .filter((m) => m.best_pvp && (m.verdict === 'BUILD_PVP' || (m.best_pvp.eligible && m.best_pvp.species_rank <= 100)))
    .sort((a, b) => {
      const aBuild = a.verdict === 'BUILD_PVP' ? 0 : 1;
      const bBuild = b.verdict === 'BUILD_PVP' ? 0 : 1;
      if (aBuild !== bBuild) return aBuild - bBuild;
      return (a.best_pvp?.composite ?? 999) - (b.best_pvp?.composite ?? 999);
    })
    .slice(0, 120);

  for (const m of simCandidates) {
    const bp = m.best_pvp;
    if (!bp) continue;
    const simSp = dex.byId.get(bp.sid.replace(/_shadow$/, '')) || dex.byId.get(bp.sid) || m.species;
    if (!simSp) continue;
    const simLvl = m.level > bp.target_level && bp.cap < 10000 ? m.level : bp.target_level;
    m.pvp_battle = evaluatePvpBattleMatrix(
      simSp,
      m.a,
      m.d,
      m.s,
      simLvl,
      m.is_shadow,
      bp.cup || bp.cap,
      bp.cap,
      bp.league,
      dex,
      bp.sid === m.species?.speciesId ? m : null,
    );
  }

  onStage?.('Generating teams, trade/buddy insights, briefing & self-check audit…', 90);
  const report = buildFullReport({
    rawData: parsed.rawData,
    mons,
    eggRecords: parsed.eggRecords,
    exportRefMs: parsed.exportRefMs,
    dex,
    sizeCtx,
    cfg,
    remote: remoteData,
    caps,
    cups,
    auxMap,
    placementRaid: raidPlace.report,
    placementMax: maxPlace.report,
    eggs: parsed.eggs,
    covState,
  });

  onStage?.('Analysis complete', 100);
  return report;
}

export async function runFullAnalysis(
  rawExport: unknown,
  userCfg: UserConfigInput | null | undefined,
  options: RunAnalysisOptions = {},
): Promise<{ report: ReportJson; remote: RemoteGameData }> {
  const cfg = buildMergedConfig(userCfg);
  const { caps, cups } = getActiveLeaguesAndCups(cfg);

  const remote = options.useOfflineFallbackOnly
    ? buildOfflineFallbackData()
    : await loadRemoteGameData({
        caps,
        cupKeys: Object.keys(cups),
        refresh: Boolean(options.forceRefreshCache),
        offlineOnly: Boolean(options.useOfflineFallbackOnly),
        onProgress: options.onProgress,
      });

  // Pokébattler type rankings (optional; falls back to internal formula rankings)
  let pbRankings: TypeRankingMap | null = null;
  const rankingSource = String(cfg.raid?.ranking_source || 'pokebattler').toLowerCase();
  if (rankingSource === 'pokebattler' && !options.useOfflineFallbackOnly) {
    try {
      options.onProgress?.({ stage: 'Loading Pokébattler raid rankings…', pct: 28 });
      pbRankings = await loadPokebattlerTypeRankings(undefined, (msg, pct) => {
        options.onProgress?.({ stage: msg, pct: 28 + Math.round(pct * 0.08) });
      });
    } catch (e) {
      console.warn('[pokebattler] rankings load failed, using internal model', e);
      pbRankings = null;
    }
  }

  const report = analyzePgsExport(
    rawExport,
    userCfg,
    remote,
    (stage, pct) => {
      options.onProgress?.({ stage, pct });
    },
    pbRankings,
  );

  return { report, remote };
}

export async function runFullAnalysisInWorker(
  rawExport: unknown,
  userCfg: UserConfigInput | null | undefined,
  options: RunAnalysisOptions = {},
): Promise<{ report: ReportJson; remote: RemoteGameData }> {
  if (typeof Worker === 'undefined') {
    return runFullAnalysis(rawExport, userCfg, options);
  }

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      runFullAnalysis(rawExport, userCfg, options).then(resolve, reject);
      return;
    }

    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type: 'progress'; progress: AnalysisProgress }
        | { type: 'done'; report: ReportJson; remote: RemoteGameData }
        | { type: 'error'; message: string };
      if (!data) return;
      if (data.type === 'progress') {
        options.onProgress?.(data.progress);
      } else if (data.type === 'done') {
        worker.terminate();
        resolve({ report: data.report, remote: data.remote });
      } else if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message || 'Worker analysis failed'));
      }
    };

    worker.onerror = () => {
      worker.terminate();
      // Fallback transparently to main-thread execution if bundler/runtime restricts workers
      runFullAnalysis(rawExport, userCfg, options).then(resolve, reject);
    };

    worker.postMessage({
      rawExport,
      userCfg,
      options: {
        useOfflineFallbackOnly: options.useOfflineFallbackOnly,
        forceRefreshCache: options.forceRefreshCache,
      },
    });
  });
}

