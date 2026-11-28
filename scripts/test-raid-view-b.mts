/**
 * Stage 4 tests: Raid teams View A vs View B, real moveset DPS scaling,
 * Fast TM odds, and Pokébattler form mapping + partial fallback.
 * Run: npx tsx scripts/test-raid-view-b.mts
 */
import {
  pbIdToSpeciesId,
  resolveExternalSpeciesId,
  applyExternalRaidRankings,
  specimenPbScore,
} from '../src/engine/pokebattlerRankings';
import { assessRaidMon } from '../src/engine/raidMoveEval';
import { createPveContext, Dex } from '../src/engine/pveModel';
import { buildOfflineFallbackData } from '../src/engine/offlineFallback';
import { buildMergedConfig } from '../src/engine/defaultConfig';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { generateSamplePgsStatsJson } from '../src/engine/sampleGenerator';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(ok ? '  ✓' : '  ✗ FAIL:', msg);
  if (!ok) fails++;
};

function withBag(raw: any, fast: number, charged: number, eliteFast = 0, eliteCharged = 0) {
  const copy = JSON.parse(JSON.stringify(raw));
  copy.items = (copy.items || []).filter(
    (i: any) =>
      ![1201, 1202, 1203, 1204].includes(i.item) &&
      !/TM/i.test(String(i.itemId || i.itemName || '')),
  );
  const setBag = (code: number, name: string, count: number) => {
    copy.items.push({ item: code, itemName: name, count, ignoreInventoryCount: false });
  };
  setBag(1201, 'MoveRerollFastAttack', fast);
  setBag(1202, 'MoveRerollSpecialAttack', charged);
  setBag(1203, 'MoveRerollEliteFastAttack', eliteFast);
  setBag(1204, 'MoveRerollEliteSpecialAttack', eliteCharged);
  return copy;
}

async function main() {
  console.log('1. Pokébattler form ID mapping + partial fallback validation');
  {
    const cases: [string, string][] = [
      ['LANDORUS_THERIAN_FORM', 'landorus_therian'],
      ['LANDORUS_INCARNATE_FORM', 'landorus'],
      ['GIRATINA_ALTERED_FORM', 'giratina'],
      ['GIRATINA_ORIGIN_FORM', 'giratina_origin'],
      ['HOOPA_UNBOUND_FORM', 'hoopa_unbound'],
      ['HOOPA_CONFINED_FORM', 'hoopa'],
      ['DARMANITAN_GALARIAN_STANDARD_FORM', 'darmanitan_galarian_standard'],
      ['DARMANITAN_GALARIAN_ZEN_FORM', 'darmanitan_galarian_zen'],
      ['NECROZMA_DAWN_WINGS_FORM', 'necrozma_dawn_wings'],
      ['MEWTWO_SHADOW_FORM', 'mewtwo_shadow'],
      ['RAYQUAZA_MEGA', 'rayquaza_mega'],
      ['GROUDON_PRIMAL', 'groudon_primal'],
      ['CHARIZARD_MEGA_X', 'charizard_mega_x'],
      ['SHAYMIN_SKY_FORM', 'shaymin_sky'],
      ['URSHIFU_SINGLE_STRIKE_FORM', 'urshifu_single_strike'],
    ];
    for (const [pb, want] of cases) {
      check(pbIdToSpeciesId(pb) === want, `pbIdToSpeciesId(${pb}) -> ${pbIdToSpeciesId(pb)} (expected ${want})`);
    }

    const fakeById = new Map<string, unknown>([
      ['landorus_incarnate', {}],
      ['darmanitan_galarian', {}],
      ['mewtwo_shadow', {}],
    ]);
    check(
      resolveExternalSpeciesId('landorus', fakeById) === 'landorus_incarnate',
      'resolveExternalSpeciesId maps landorus -> landorus_incarnate when GM uses _incarnate',
    );
    check(
      resolveExternalSpeciesId('darmanitan_galarian_standard', fakeById) === 'darmanitan_galarian',
      'resolveExternalSpeciesId maps darmanitan_galarian_standard -> darmanitan_galarian when GM omits _standard',
    );

    const target = {
      byId: new Map<string, unknown>([
        ['charizard_shadow', {}],
        ['reshiram', {}],
        ['kyogre', {}],
      ]),
      raidRankings: new Map<string, [string, number][]>([
        ['fire', [['charizard', 50]]],
        ['water', [['kyogre', 90]]],
      ]),
      raidPos: new Map<string, Map<string, [number, number]>>(),
      raidScoreSource: 'internal',
      raidTypeSource: new Map<string, 'pokebattler' | 'internal'>([
        ['fire', 'internal'],
        ['water', 'internal'],
      ]),
    };
    const applied = applyExternalRaidRankings(
      target,
      new Map([['fire', [['reshiram', 420], ['charizard_shadow', 390]]]]),
      true,
    );
    check(applied === 1, 'partial applyExternalRaidRankings applies only types returned');
    check(target.raidTypeSource.get('fire') === 'pokebattler', 'applied type switches to pokebattler');
    check(target.raidTypeSource.get('water') === 'internal', 'missing type remains on internal fallback');
  }

  console.log('\n2. Per-specimen moveset DPS breakdown, regularFastHits odds & movesetRatio scaling');
  {
    const cfg = buildMergedConfig();
    const remoteData = buildOfflineFallbackData();
    const pveCtx = createPveContext(remoteData, cfg);
    const dex = new Dex(remoteData, cfg, pveCtx, [1500, 2500, 10000], {});

    // Ensure deterministic 2 Fire + 2 non-Fire fast moves (known off-type + 3 candidates -> 2 of 3 Fire outcomes)
    const pveMovesClone: any = {
      ...dex.pve.moves,
      EMBER_FAST: { id: 209, p: 10, d: 1000, e: 10, t: 'fire' },
      TACKLE_FAST: { id: 221, p: 5, d: 500, e: 5, t: 'normal' },
    };
    const localDex: any = {
      ...dex,
      pve: { ...dex.pve, moves: pveMovesClone },
    };
    const fireFasts = ['FIRE_SPIN', 'EMBER'];
    let offFast = '';
    let fireCharged = '';
    for (const [k, v] of Object.entries(pveMovesClone)) {
      const t = String((v as any).t || '').toLowerCase();
      if (k.endsWith('_FAST')) {
        const id = k.replace(/_FAST$/, '');
        if (t !== 'fire' && id !== 'TACKLE' && !offFast) offFast = id;
      } else if (t === 'fire' && !fireCharged && k !== 'FRUSTRATION' && k !== 'RETURN') {
        fireCharged = k;
      }
    }
    const baseSp = dex.byId.get('charizard') || Array.from(dex.byId.values())[0];
    const testSp: any = {
      ...baseSp,
      speciesId: 'charizard',
      speciesName: 'Charizard',
      types: ['fire', 'flying'],
      fastMoves: [fireFasts[0], fireFasts[1], 'TACKLE', offFast],
      chargedMoves: [fireCharged, 'BLAST_BURN'],
      eliteMoves: ['BLAST_BURN'],
      legacyMoves: [],
    };
    const numByKey = new Map<string, number>();
    for (const [n, k] of dex.pve.byId.entries()) numByKey.set(k, n);
    const offFastNum = numByKey.get(`${offFast}_FAST`) ?? 0;
    const fcNum = numByKey.get(fireCharged) ?? 0;
    const fakeMon: any = {
      uid: 'multi-fire-1',
      name: 'Charizard',
      species: testSp,
      cp: 2600,
      level: 35,
      a: 15,
      d: 14,
      s: 14,
      iv_pct: 95.6,
      is_shadow: false,
      verdict: 'BUILD_RAID',
      knows_moves: [offFast, fireCharged],
      raw: { move1: offFastNum, move2: fcNum, move3: 0 },
    };
    const a = assessRaidMon({
      mon: fakeMon,
      species: testSp,
      dex: localDex,
      cfg,
      teamType: 'fire',
      tmBag: { known: true, fast: 5, charged: 5, eliteFast: 0, eliteCharged: 0 },
    });
    check(Boolean(a), 'assessRaidMon evaluates multi-fast-move fire species');
    if (a) {
      const act = a.tmActions.find((s) => /outcomes/.test(s)) || '';
      const m = act.match(/(\d+) of (\d+) outcomes/);
      const hits = m ? Number(m[1]) : 0;
      check(hits === 2 && Number(m?.[2]) === 3, `regularFastHits reports real 2-of-3 outcome count (${act})`);
      check(
        Boolean(a.fastTmWorthwhile && a.needsFastTm && !a.needsChargedTm),
        'off-type Fast + on-type Charged marks fastTmWorthwhile=true and needsFastTm=true',
      );
      check(
        a.afterRegularTmDps > a.currentDps && a.bestAttainableDps >= a.afterRegularTmDps && a.pbMovesetDps >= a.bestAttainableDps * 0.99,
        `DPS hierarchy holds: current=${a.currentDps} regTM=${a.afterRegularTmDps} best=${a.bestAttainableDps} pbMax=${a.pbMovesetDps}`,
      );
      const ratioFull = specimenPbScore(100, 40, 15, 223, 1.0);
      const ratioWeak = specimenPbScore(100, 40, 15, 223, 0.4);
      check(
        Math.abs(ratioWeak - ratioFull * 0.4) < 0.01,
        'specimenPbScore scales linearly by continuous movesetRatio instead of coarse step buckets',
      );
    }
  }

  console.log('\n3. Full pipeline Stage 4 checks: View A vs View B bag-limited upgrades');
  {
    const baseRaw = generateSamplePgsStatsJson() as any;

    // 1 Fast TM + 1 Charged TM budget
    const { report: repOne } = await runFullAnalysis(withBag(baseRaw, 1, 1, 0, 0), null, {
      useOfflineFallbackOnly: true,
    });
    const blocksOne = repOne.raid_teams as any[];
    check(blocksOne.length === 17, `all 17 raid blocks present (${blocksOne.length})`);
    check(blocksOne.every((b) => Boolean(b.after_investment)), 'every raid block carries after_investment (View B)');

    const anySpecDpsFields = blocksOne.some((b) =>
      b.entries.some(
        (e: any) =>
          typeof e.current_dps === 'number' &&
          typeof e.best_attainable_dps === 'number' &&
          typeof e.fast_tm_worthwhile === 'boolean' &&
          typeof e.charged_tm_optional === 'boolean',
      ),
    );
    check(anySpecDpsFields, 'RaidTeamEntry carries Stage 4 current/best DPS & TM flags');

    const fastUpgradesOne = blocksOne.reduce((acc, b) => {
      const ups = (b.after_investment?.entries || []).filter(
        (e: any) => e.investment_status === 'READY' && (e.investment_applied || []).some((s: string) => /Fast TM/i.test(s)),
      );
      return acc + ups.length;
    }, 0);
    check(
      fastUpgradesOne <= 1,
      `View B respects 1 Fast TM global cap across all types (applied ${fastUpgradesOne})`,
    );

    // 0 TMs in bag -> 0 TM upgrades in View B
    const { report: repZero } = await runFullAnalysis(withBag(baseRaw, 0, 0, 0, 0), null, {
      useOfflineFallbackOnly: true,
    });
    const blocksZero = repZero.raid_teams as any[];
    const tmUpgradesZero = blocksZero.reduce((acc, b) => {
      const ups = (b.after_investment?.entries || []).filter(
        (e: any) => e.investment_status === 'READY' && (e.investment_applied || []).some((s: string) => /TM/i.test(s)),
      );
      return acc + ups.length;
    }, 0);
    check(tmUpgradesZero === 0, `View B applies 0 TM upgrades when TM bag is empty (got ${tmUpgradesZero})`);

    const checkCandsValid = blocksZero.every((b) => Array.isArray(b.after_investment?.check_candidates));
    check(checkCandsValid, 'View B after_investment provides check_candidates list');
  }

  console.log(`\nStage 4 test finished: ${fails ? `${fails} FAILED` : 'all passed'}`);
  process.exit(fails ? 1 : 0);
}

main();
