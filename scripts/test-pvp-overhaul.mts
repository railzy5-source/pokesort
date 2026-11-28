/**
 * Stage 5 tests: PvP specimen selection (eligibility, IV rank, species rank, CP, evolution,
 * actual moves, battleSim), unified eliteMoves + legacyMoves, expanded PvP statuses,
 * and split Great/Ultra League Power-Up Priority.
 * Run: npx tsx scripts/test-pvp-overhaul.mts
 */
import { allEliteMoveIds, currentMoves, Dex, createPveContext, readinessFields } from '../src/engine/pveModel';
import { buildOfflineFallbackData } from '../src/engine/offlineFallback';
import { buildMergedConfig } from '../src/engine/defaultConfig';
import { classifyMons } from '../src/engine/placementAndGates';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { generateSamplePgsStatsJson } from '../src/engine/sampleGenerator';
import { toMon } from '../src/engine/pgsParser';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(ok ? '  ✓' : '  ✗ FAIL:', msg);
  if (!ok) fails++;
};

async function main() {
  console.log('1. Unified eliteMoves + legacyMoves handling');
  {
    const cfg = buildMergedConfig();
    const remote = buildOfflineFallbackData();
    const pve = createPveContext(remote, cfg);
    const dex = new Dex(remote, cfg, pve, [1500, 2500, 10000], {});

    const combined = allEliteMoveIds({
      eliteMoves: ['HYDRO_CANNON'],
      legacyMoves: ['MUD_SHOT', 'hydro_cannon'],
    });
    check(
      combined.includes('HYDRO_CANNON') && combined.includes('MUD_SHOT') && combined.length === 2,
      `allEliteMoveIds merges and deduplicates eliteMoves + legacyMoves (${combined.join(', ')})`,
    );

    const numByKey = new Map<string, number>();
    for (const [n, k] of pve.byId.entries()) numByKey.set(k, n);
    const mudShotNum = numByKey.get('MUD_SHOT_FAST') ?? 0;
    const surfNum = numByKey.get('SURF') ?? 0;
    const eqNum = numByKey.get('EARTHQUAKE') ?? 0;

    const sp: any = {
      ...(dex.byId.get('swampert') || Array.from(dex.byId.values())[0]),
      speciesId: 'swampert',
      speciesName: 'Swampert',
      fastMoves: ['MUD_SHOT', 'WATER_GUN'],
      chargedMoves: ['HYDRO_CANNON', 'EARTHQUAKE', 'SURF'],
      eliteMoves: [],
      legacyMoves: ['HYDRO_CANNON'],
    };
    const fakeMon: any = {
      uid: 'pvp-leg-1',
      dex: 260,
      cp: 1495,
      level: 19,
      a: 0,
      d: 14,
      s: 14,
      has_third_move: true,
      evolve_to_sid: null,
      power_up_to: null,
      moveset: 'Mud Shot / Hydro Cannon / Earthquake',
      species: sp,
      knows_moves: [],
      raw: { move1: mudShotNum, move2: surfNum, move3: eqNum }, // Surf + Earthquake instead of legacy Hydro Cannon
    };
    const rd = readinessFields(pve, fakeMon, dex, 'BUILD_PVP', cfg);
    check(
      rd.fields.build_status === 'Needs Elite TM' &&
        (rd.fields.needs_elite_moves || []).some((m) => /Hydro Cannon/i.test(m)),
      `legacyMoves-only move is classified as Needs Elite TM, never regular TM (${rd.fields.build_status}: ${rd.fields.needs_elite_moves?.join(', ')})`,
    );

    const cur = currentMoves(pve, {
      ...fakeMon,
      knows_moves: [mudShotNum, eqNum],
      species: { ...sp, legacyMoves: ['EARTHQUAKE'], eliteMoves: [] },
      raw: { move1: mudShotNum, move2: eqNum, move3: 0 }, // Earthquake
    });
    check(
      cur.some((m) => /Earthquake/i.test(m.name) && m.elite),
      'currentMoves marks moves in legacyMoves as elite (*)',
    );
  }

  console.log('\n2. Expanded PvP build statuses & move/evolution/power-up awareness');
  {
    const cfg = buildMergedConfig();
    const remote = buildOfflineFallbackData();
    const pve = createPveContext(remote, cfg);
    const dex = new Dex(remote, cfg, pve, [1500, 2500, 10000], {});

    const numByKey = new Map<string, number>();
    for (const [n, k] of pve.byId.entries()) numByKey.set(k, n);
    const fastId = numByKey.get('MUD_SHOT_FAST') ?? 216;
    const eqId = numByKey.get('EARTHQUAKE') ?? 31;
    const surId = numByKey.get('SURF') ?? 245;

    const baseSp: any = {
      ...(dex.byId.get('swampert') || Array.from(dex.byId.values())[0]),
      speciesId: 'swampert',
      speciesName: 'Swampert',
      fastMoves: ['MUD_SHOT', 'WATER_GUN'],
      chargedMoves: ['SURF', 'EARTHQUAKE'],
      eliteMoves: [],
      legacyMoves: [],
    };
    const baseMon: any = {
      uid: 'st-1',
      dex: 260,
      cp: 1495,
      level: 19,
      a: 0,
      d: 14,
      s: 14,
      has_third_move: true,
      evolve_to_sid: null,
      power_up_to: null,
      moveset: 'Mud Shot / Surf / Earthquake',
      species: baseSp,
      best_pvp: { cap: 1500, iv_rank: 12 },
      knows_moves: [],
      raw: { move1: fastId, move2: surId, move3: eqId },
    };

    const stReady = readinessFields(pve, baseMon, dex, 'BUILD_PVP', cfg).fields.build_status;
    check(stReady === 'Ready', `optimal moves + 2nd move + leveled returns Ready (got ${stReady})`);

    const stEvo = readinessFields(pve, { ...baseMon, evolve_to_sid: 'swampert', species: { ...baseSp, speciesId: 'mudkip', speciesName: 'Mudkip' } }, dex, 'BUILD_PVP', cfg).fields.build_status;
    check(stEvo === 'Needs evolution', `pre-evolution PvP build returns Needs evolution (got ${stEvo})`);

    const stPower = readinessFields(pve, { ...baseMon, power_up_to: 24.5 }, dex, 'BUILD_PVP', cfg).fields.build_status;
    check(stPower === 'Needs power-up', `all moves ready + power_up_to set returns Needs power-up (got ${stPower})`);

    const stSubopt = readinessFields(pve, { ...baseMon, best_pvp: { cap: 1500, iv_rank: 75 } }, dex, 'BUILD_PVP', cfg).fields.build_status;
    check(stSubopt === 'Usable (not optimal)', `high iv_rank (>50) playable mon returns Usable (not optimal) (got ${stSubopt})`);

    const stSecond = readinessFields(pve, { ...baseMon, has_third_move: false, raw: { move1: fastId, move2: surId, move3: 0 } }, dex, 'BUILD_PVP', cfg).fields.build_status;
    check(stSecond === 'Needs second charged move', `missing 2nd move returns Needs second charged move (got ${stSecond})`);

    const stUnknown = readinessFields(pve, { ...baseMon, raw: { move1: 999999, move2: surId, move3: eqId } }, dex, 'BUILD_PVP', cfg).fields.build_status;
    check(stUnknown === 'Unknown', `unreadable move id returns Unknown (got ${stUnknown})`);
  }

  console.log('\n3. Specimen selection factors moves + zero Elite TM bag & full pipeline GL/UL split');
  {
    const raw = generateSamplePgsStatsJson() as any;
    const { report } = await runFullAnalysis(raw, null, { useOfflineFallbackOnly: true });

    check(
      Array.isArray(report.priority.gl) && Array.isArray(report.priority.ul),
      `report.priority separates gl (${report.priority.gl?.length ?? 0}) and ul (${report.priority.ul?.length ?? 0})`,
    );
    const glBad = (report.priority.gl || []).filter((r) => /ultra/i.test(r.league));
    const ulBad = (report.priority.ul || []).filter((r) => !/ultra/i.test(r.league));
    check(glBad.length === 0 && ulBad.length === 0, 'GL and UL priority lists have zero cross-league bleed');

    const cfg = buildMergedConfig();
    const remote = buildOfflineFallbackData();
    const pve = createPveContext(remote, cfg);
    const dex = new Dex(remote, cfg, pve, [1500, 2500, 10000], {});

    // Verify a specimen holding a legacy move gets a better (lower) composite adjustment when user has 0 Elite Charged TMs
    const sampleRaw = generateSamplePgsStatsJson() as any;
    const pvpMon = toMon(sampleRaw.pokemon.find((x: any) => String(x.id).includes('gl')) || sampleRaw.pokemon[0], 0);
    pvpMon.species = dex.resolve(pvpMon);
    if (pvpMon.species) {
      const mWith = { ...pvpMon, uid: 'with-legacy' };
      const mWithout = { ...pvpMon, uid: 'no-legacy', raw: { ...pvpMon.raw, move2: 0, move3: 0 } };
      classifyMons([mWith, mWithout], dex, cfg, [1500, 2500, 10000], {}, new Map(), { eliteFast: 0, eliteCharged: 0 });
      check(
        (mWith.pvp[0]?.move_score_adj ?? 0) <= (mWithout.pvp[0]?.move_score_adj ?? 0),
        `specimens with known moves score >= un-moved clones (${mWith.pvp[0]?.move_score_adj} vs ${mWithout.pvp[0]?.move_score_adj})`,
      );
    }
  }

  console.log(`\nStage 5 test finished: ${fails ? `${fails} FAILED` : 'all passed'}`);
  process.exit(fails ? 1 : 0);
}

main();
