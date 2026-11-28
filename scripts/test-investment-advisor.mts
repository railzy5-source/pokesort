/**
 * Stage 3b tests: Value-based build priority + per-role Investment Advisor.
 * Run: npx tsx scripts/test-investment-advisor.mts
 */
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { generateSamplePgsStatsJson } from '../src/engine/sampleGenerator';
import { computeValueBasedPriority, scarcityWeightedCost } from '../src/engine/investmentAdvisor';
import { emptyCost, type Ledger } from '../src/engine/resourceLedger';
import { createPveContext, Dex } from '../src/engine/pveModel';
import { buildOfflineFallbackData } from '../src/engine/offlineFallback';
import { buildMergedConfig } from '../src/engine/defaultConfig';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(ok ? '  ✓' : '  ✗ FAIL:', msg);
  if (!ok) fails++;
};

const K = (value: number): any => ({ state: 'known', value, basis: 'listed' });
const sampleLedger = (eliteCh: number): Ledger => ({
  stardust: K(169065),
  rare_candy: K(40),
  rare_candy_xl: K(5),
  fast_tm: K(8),
  charged_tm: K(8),
  elite_fast_tm: K(1),
  elite_charged_tm: K(eliteCh),
  max_particles: K(800),
  species_candy: { state: 'unknown', reason: 'not in export' },
  species_xl_candy: { state: 'unknown', reason: 'not in export' },
  mega_energy: { state: 'unknown', reason: 'not in export' },
  items: {},
});

async function main() {
  console.log('1. Scarcity-weighted cost penalties');
  {
    const baseCost = { ...emptyCost(), stardust: 50000, species_candy: 40 };
    const eliteCost = { ...baseCost, elite_charged_tm: 1 };
    const zeroHeldLedger = sampleLedger(0);
    const plentifulLedger = sampleLedger(4);
    check(
      scarcityWeightedCost(eliteCost, zeroHeldLedger) > scarcityWeightedCost(eliteCost, plentifulLedger),
      'Elite Charged TM costs much more in priority denominator when 0 are held vs 4 held',
    );
    check(
      scarcityWeightedCost(eliteCost, zeroHeldLedger) > scarcityWeightedCost(baseCost, zeroHeldLedger) * 3,
      'Scarcity penalty heavily downweights Elite TM sinks when user owns 0',
    );
  }

  console.log('\n2. Full pipeline generates Stage 3b advisor & value-based priorities on sample bag');
  {
    const raw = generateSamplePgsStatsJson() as any;
    const { report } = await runFullAnalysis(raw, null, {
      useOfflineFallbackOnly: true,
    });
    const advisor = report.grade?.investment_advisor || [];
    check(advisor.length >= 18, `investment_advisor covers raid/mega/max/pvp roles (${advisor.length} roles)`);

    const categories = new Set(advisor.map((r) => r.category));
    check(categories.has('raid'), 'includes raid roles');
    check(categories.has('pvp'), 'includes pvp roles');

    const withSpecimen = advisor.filter((r) => r.bestSpecimen !== null);
    check(withSpecimen.length > 0, `bestSpecimen identified on ${withSpecimen.length} roles`);
    check(
      withSpecimen.every((r) => r.whatChanges.length >= 1 && r.affordabilityDetail.length > 0),
      'every populated role includes explicit changes and affordability detail',
    );

    // Check unknown balances produce explicit warning when investments require unlisted resources (Mega Energy, etc.)
    const unknownWarns = advisor.filter((r) =>
      r.messages.some((m) => m.toLowerCase().includes('resource balance unknown')),
    );
    check(
      unknownWarns.length > 0,
      `advisor warns when Mega Energy / unlisted balance is unknown (${unknownWarns.length} roles)`,
    );

    // Check "You own a better specimen" appears in alternatives where same species exists
    const altWithBetter = advisor.some((r) =>
      r.alternativesConsidered.some((a) => a.reason.includes('You own a better specimen')),
    );
    check(altWithBetter, 'alternatives explicitly note when user already owns a better specimen');

    // Check level_these rows carry weakest_in_role and finite 1..99 priority
    const lv = report.grade?.level_these || [];
    check(lv.length > 0, `level_these populated (${lv.length} items)`);
    check(
      lv.every((it) => it.impact >= 1 && it.impact <= 99 && typeof it.weakest_in_role === 'string'),
      'level_these items carry 1..99 value-based impact and weakest_in_role reference',
    );

    // Check shared_roles merges Mega + Raid or ML + Raid when applicable
    const sharedRows = [
      ...lv.filter((it) => (it.shared_roles?.length || 0) > 0),
      ...advisor.filter((r) => r.sharedActions.length > 0),
    ];
    check(sharedRows.length > 0, `shared multi-role value detected (${sharedRows.length} entries)`);
  }

  console.log('\n3. Direct value-based priority comparison: tiny upgrade & Save Elite TM');
  {
    const cfg = buildMergedConfig();
    const remoteData = buildOfflineFallbackData();
    const pveCtx = createPveContext(remoteData, cfg);
    const dex = new Dex(remoteData, cfg, pveCtx, [1500, 2500, 10000], {});
    const zeroLedger = sampleLedger(0);
    const fakeMon: any = {
      uid: 'm-1',
      name: 'Charizard',
      species: dex.byId.get('charizard'),
      cp: 2100,
      level: 30,
      a: 15,
      d: 14,
      s: 14,
      iv_pct: 95.6,
      is_shadow: false,
      verdict: 'BUILD_RAID',
      raid_type: 'fire',
      raid_dps: 32,
      knows_moves: [],
      raw: {},
    };
    const fakeRep: any = {
      id: 'm-1',
      species: 'Charizard',
      verdict: 'BUILD_RAID',
      raid_type: 'fire',
      iv_pct: 95.6,
      cost_dust: 85000,
      cost_candy: 0,
      cost_xl: 0,
      needs_typed: [{ name: 'Blast Burn', slot: 'charged', elite: true }],
    };
    const raidTeams: any[] = [
      {
        type: 'fire',
        entries: Array.from({ length: 6 }, (_, i) => ({
          id: `x-${i}`,
          slot: 'team',
          name: `Reshiram ${i}`,
          dps: 38.5,
        })),
      },
    ];
    const evalRes = computeValueBasedPriority({
      r: fakeRep,
      mon: fakeMon,
      bundle: {
        ...emptyCost(),
        stardust: 85000,
        elite_charged_tm: 1,
      },
      dex,
      cfg,
      raidTeams,
      maxTeams: [],
      teams: [],
      gapSet: new Set<string>(),
      ledger: { ...zeroLedger, mega_energy: { state: 'unknown', reason: 'not in export' } },
    });
    check(
      evalRes.advisorMessages.some((m) => m.includes('Save your Elite TM')),
      'flags "Save your Elite TM" when 0 Elite Charged TMs are held',
    );
    check(
      evalRes.advisorMessages.some((m) => m.includes('Do not invest') || m.includes('Tiny upgrade')),
      'flags inferior high-cost build vs stronger existing raid team floor',
    );
  }

  console.log(`\nStage 3b test finished: ${fails ? `${fails} FAILED` : 'all passed'}`);
  process.exit(fails ? 1 : 0);
}

main();
