/**
 * Stage 2 tests: the resource ledger, cost bundles and the sequential investment allocator.
 * Run: npx tsx scripts/test-resource-ledger.mts
 */
import { allocateQueue, assessAlone, buildLedger, emptyCost, summarizeLedger, type CostBundle, type Ledger } from '../src/engine/resourceLedger';
import { costBundleFor } from '../src/engine/investmentCost';
import { setLiveSecondMoveCosts, secondMoveCost } from '../src/engine/costTables';
import { collectSecondMoveCosts } from '../src/engine/gameDataClient';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { loadFixture } from './_fixture.mts';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };
const cost = (o: Partial<CostBundle>): CostBundle => ({ ...emptyCost(), ...o });
const K = (value: number): any => ({ state: 'known', value, basis: 'listed' });
const U: any = { state: 'unknown', reason: 'not in export' };
const ledger = (o: Partial<Ledger> = {}): Ledger => ({
  stardust: K(1_000_000), rare_candy: K(0), rare_candy_xl: K(0), fast_tm: K(0), charged_tm: K(0), elite_fast_tm: K(0),
  elite_charged_tm: K(0), max_particles: K(0),
  species_candy: { state: 'known', byFamily: { houndour: 500, charmander: 500 } },
  species_xl_candy: { state: 'known', byFamily: { houndour: 500, charmander: 500 } },
  mega_energy: { state: 'unknown', reason: 'not in export' }, items: {}, ...o,
});
const fk = (f: string) => [f];

// -------------------------------------------------------------- parsing the export
console.log('Reading the export');
{
  const raw: any = {
    account: { currencyBalance: [{ currencyType: 'STARDUST', quantity: 12345 }] },
    items: [
      { itemName: 'MoveRerollFastAttack', count: 4 }, { itemName: 'MoveRerollSpecialAttack', count: 2 },
      { itemName: 'RareCandy', count: 50 }, { itemName: 'XlRareCandy', count: 9 }, { itemName: 'Mp', count: 777 },
    ],
  };
  const l = buildLedger(raw);
  check(l.stardust.state === 'known' && (l.stardust as any).value === 12345, 'Stardust is read from the currency list');
  check((l.fast_tm as any).value === 4 && (l.charged_tm as any).value === 2, 'regular Fast and Charged TMs are read separately');
  const ec: any = l.elite_charged_tm;
  check(ec.state === 'known' && ec.value === 0 && ec.basis === 'not_listed', 'an item missing from a PRESENT item list is 0, labelled "not listed"');
  check((l.rare_candy as any).value === 50 && (l.rare_candy_xl as any).value === 9, 'Rare Candy and Rare Candy XL are separate balances');
  check(l.species_xl_candy.state === 'unknown', 'Rare Candy XL (9) is NOT mistaken for species XL Candy (unknown)');
  check(l.species_candy.state === 'unknown' && l.mega_energy.state === 'unknown', 'species Candy and Mega Energy are UNKNOWN when the export lacks them, not 0');
  check((l.max_particles as any).value === 777, 'Max Particles are read');

  const none = buildLedger({});
  check(none.stardust.state === 'unknown', 'no currency data: Stardust is UNKNOWN, not 0');
  check(none.fast_tm.state === 'unknown' && none.elite_charged_tm.state === 'unknown', 'no item list at all: every TM is UNKNOWN, not 0');

  const withCandy = buildLedger({ ...raw, candy: [{ familyId: 'FAMILY_HOUNDOUR', candy: 120 }, { familyId: 'FAMILY_CHARMANDER', quantity: 7 }], candyXl: [{ familyId: 'FAMILY_HOUNDOUR', xl: 33 }] });
  check(withCandy.species_candy.state === 'known' && (withCandy.species_candy as any).byFamily.houndour === 120, 'species Candy is parsed when the export provides it');
  check(withCandy.species_xl_candy.state === 'known' && (withCandy.species_xl_candy as any).byFamily.houndour === 33, 'species XL Candy is parsed separately');
  check(summarizeLedger(none).every((r) => r.state === 'unknown' || r.value !== undefined), 'the summary never hides an unknown balance');
}

// -------------------------------------------------------------- affordability
console.log('\nAffordability');
{
  let r = assessAlone(cost({ species_candy: 50 }), ledger({ species_candy: { state: 'known', byFamily: { houndour: 10 } } }), fk('houndour'));
  check(r.status === 'NOT_AFFORDABLE' && r.lines.some((l) => l.key === 'species_candy' && l.status === 'short'), 'a species Candy shortage blocks the build');
  r = assessAlone(cost({ species_xl_candy: 100 }), ledger({ species_xl_candy: { state: 'known', byFamily: { houndour: 0 } }, rare_candy_xl: K(500) }), fk('houndour'));
  check(r.status === 'NOT_AFFORDABLE', 'Rare Candy XL is NOT counted as species XL Candy by default');
  r = assessAlone(cost({ species_xl_candy: 100 }), ledger({ species_xl_candy: { state: 'known', byFamily: { houndour: 0 } }, rare_candy_xl: K(500) }), fk('houndour'), { allowRareCandy: true });
  check(r.status === 'READY' && r.lines[0].note?.includes('covered by Rare Candy XL'), 'when the player opts in, Rare Candy XL covers the XL shortage and says so');
  r = assessAlone(cost({ species_candy: 50 }), ledger({ species_candy: { state: 'known', byFamily: { houndour: 10 } }, rare_candy: K(20) }), fk('houndour'), { allowRareCandy: true });
  check(r.status === 'NOT_AFFORDABLE', 'opted-in Rare Candy that still falls short does not make it affordable (10 + 20 < 50)');
  r = assessAlone(cost({ species_candy: 50 }), ledger({ species_candy: { state: 'unknown', reason: 'x' } }), fk('houndour'));
  check(r.status === 'CHECK' && r.lines[0].status === 'unknown', 'missing species Candy data gives CHECK (unknown), never READY');
  r = assessAlone(cost({ stardust: 5000 }), ledger({ stardust: U }), fk('houndour'));
  check(r.status === 'CHECK', 'unknown Stardust balance gives CHECK, never READY');
  r = assessAlone(cost({ unknown_costs: ['Second charged move price (needs live game data)'] }), ledger(), fk('houndour'));
  check(r.status === 'CHECK', 'a price that is not available makes the result unknown, not free');
  r = assessAlone(cost({ max_particles: 400 }), ledger({ max_particles: K(300) }), fk('houndour'));
  check(r.status === 'NOT_AFFORDABLE' && r.lines[0].label === 'Max Particles', 'Max Particles are required and checked');
  r = assessAlone(cost({ mega_energy: 200 }), ledger(), fk('houndour'));
  check(r.status === 'CHECK' && r.lines[0].label === 'Mega Energy', 'Mega Energy is accounted for, and UNKNOWN when the balance is not in the export');
  r = assessAlone(cost({ mega_energy: 200 }), ledger({ mega_energy: { state: 'known', byFamily: { houndour: 150 } } }), fk('houndour'));
  check(r.status === 'NOT_AFFORDABLE', 'a known Mega Energy balance that is too low blocks the build');
  r = assessAlone(cost({ hard_blockers: ['Knows Frustration'] }), ledger(), fk('houndour'));
  check(r.status === 'BLOCKED', 'a hard blocker stops the build whatever you own');
  for (const [k, field] of [['fast_tm', 'fast_tm'], ['charged_tm', 'charged_tm'], ['elite_fast_tm', 'elite_fast_tm'], ['elite_charged_tm', 'elite_charged_tm']] as const) {
    const okR = assessAlone(cost({ [k]: 2 } as any), ledger({ [field]: K(2) } as any), fk('houndour'));
    const noR = assessAlone(cost({ [k]: 2 } as any), ledger({ [field]: K(1) } as any), fk('houndour'));
    check(okR.status === 'READY' && noR.status === 'NOT_AFFORDABLE', `${k}: the actual number required is checked (2 needed: have 2 = ready, have 1 = not)`);
  }
}

// -------------------------------------------------------------- sequential allocation
console.log('\nSequential allocation');
{
  const one = ledger({ elite_charged_tm: K(1) });
  const q = ['A', 'B', 'C'].map((id) => ({ id, cost: cost({ elite_charged_tm: 1 }), familyKeys: fk('houndour') }));
  const r = allocateQueue(q, one);
  check(r[0].status === 'READY' && r[1].status === 'BLOCKED' && r[2].status === 'BLOCKED', 'three builds, ONE Elite Charged TM: only the first is READY');
  check(r[1].blocked_by.includes('A'), 'the blocked build names the build that took the TM');
  check(allocateQueue(q, ledger({ elite_charged_tm: K(0) })).every((x) => x.status === 'NOT_AFFORDABLE'), 'with none owned, all three are NOT_AFFORDABLE (not merely blocked)');

  const dust = ledger({ stardust: K(100_000) });
  const d = allocateQueue([40_000, 40_000, 40_000, 150_000].map((s, i) => ({ id: 'd' + i, cost: cost({ stardust: s }), familyKeys: fk('houndour') })), dust);
  check(d.map((x) => x.status).join() === 'READY,READY,BLOCKED,NOT_AFFORDABLE', `cumulative Stardust: 40k + 40k fit, the third is BLOCKED, 150k is NOT_AFFORDABLE (${d.map((x) => x.status).join()})`);
  const reordered = allocateQueue([{ id: 'x', cost: cost({ stardust: 70_000 }), familyKeys: fk('houndour') }, { id: 'y', cost: cost({ stardust: 40_000 }), familyKeys: fk('houndour') }, { id: 'z', cost: cost({ stardust: 30_000 }), familyKeys: fk('houndour') }], dust);
  check(reordered.map((x) => x.status).join() === 'READY,BLOCKED,READY', 'changing the order changes who gets the Stardust (70k, 40k, 30k -> ready, blocked, ready)');
  check(d[2].blocked_by.join() === 'd0,d1', 'a blocked build lists exactly the builds in its way');

  const candy = ledger({ species_candy: { state: 'known', byFamily: { houndour: 60, charmander: 60 } } });
  const c = allocateQueue([
    { id: 'h1', cost: cost({ species_candy: 40 }), familyKeys: fk('houndour') },
    { id: 'h2', cost: cost({ species_candy: 40 }), familyKeys: fk('houndour') },
    { id: 'c1', cost: cost({ species_candy: 40 }), familyKeys: fk('charmander') },
  ], candy);
  check(c.map((x) => x.status).join() === 'READY,BLOCKED,READY', 'species Candy is tracked per family: the second Houndour is blocked, Charmander is not');

  // Unknown balances must not let a TM be promised twice
  const unk = ledger({ species_candy: { state: 'unknown', reason: 'x' }, charged_tm: K(1) });
  const u = allocateQueue([1, 2].map((i) => ({ id: 'u' + i, cost: cost({ charged_tm: 1, species_candy: 30 }), familyKeys: fk('houndour') })), unk);
  check(u[0].status === 'CHECK' && u[1].status === 'BLOCKED', 'even with Candy unknown, the single Charged TM is reserved for the first build only');

  // Property: nothing READY/CHECK ever uses more than is held
  let rng = 7; const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  let ok = true;
  for (let t = 0; t < 200 && ok; t++) {
    const l = ledger({ stardust: K(Math.floor(rand() * 200_000)), charged_tm: K(Math.floor(rand() * 4)), elite_fast_tm: K(Math.floor(rand() * 3)), species_candy: { state: 'known', byFamily: { houndour: Math.floor(rand() * 300) } } });
    const items = Array.from({ length: 8 }, (_, i) => ({ id: 'i' + i, cost: cost({ stardust: Math.floor(rand() * 90_000), charged_tm: rand() < 0.4 ? 1 : 0, elite_fast_tm: rand() < 0.2 ? 1 : 0, species_candy: Math.floor(rand() * 120) }), familyKeys: fk('houndour') }));
    const res = allocateQueue(items, l);
    const used = { s: 0, c: 0, e: 0, cd: 0 };
    res.forEach((r, i) => { if (r.status === 'READY' || r.status === 'CHECK') { used.s += items[i].cost.stardust; used.c += items[i].cost.charged_tm; used.e += items[i].cost.elite_fast_tm; used.cd += items[i].cost.species_candy; } });
    if (used.s > (l.stardust as any).value || used.c > (l.charged_tm as any).value || used.e > (l.elite_fast_tm as any).value || used.cd > (l.species_candy as any).byFamily.houndour) ok = false;
  }
  check(ok, '200 random queues: allocated builds never use more than the inventory holds');
}

// -------------------------------------------------------------- cost bundles
console.log('\nCost bundles');
{
  const dex: any = { megaSpecies: new Set(['tyranitar_mega']), byId: new Map() };
  const mon = (o: any = {}): any => ({ species: { speciesId: 'houndoom', dex: 229 }, dex: 229, is_shadow: false, is_purified: false, knows_moves: [], has_mega_unlocked: false, mega_sid: null, ...o });
  const item = (o: any = {}): any => ({ id: 'x', needs_second_move: true, tm_needed: [], evolve_to: '', verdict: 'BUILD_PVP', role: '', ...o });
  const rep = (o: any = {}): any => ({ cost_dust: 1000, cost_candy: 10, cost_xl: 0, needs_typed: [], build_status: '', cost_estimated: false, ...o });

  setLiveSecondMoveCosts(null);
  check(secondMoveCost('houndoom') === null, 'second-move price is unknown (null) when the game data is not loaded, never guessed');
  let b = costBundleFor(item(), mon(), rep(), dex);
  check(b.unknown_costs.some((u) => /Second charged move/.test(u)) && b.stardust === 1000, 'without the price, the second move is listed as an UNKNOWN cost (not free)');

  const gm: Record<string, { dust: number; candy: number }> = {};
  collectSecondMoveCosts({ pokemonId: 'HOUNDOOM', form: 'HOUNDOOM_NORMAL', thirdMove: { stardustToUnlock: 50000, candyToUnlock: 50 } }, gm);
  collectSecondMoveCosts({ pokemonId: 'DITTO' }, gm);
  check(gm.houndoom?.dust === 50000 && Object.keys(gm).length === 1, 'the second-move price is read from the game master');
  setLiveSecondMoveCosts(gm);
  b = costBundleFor(item(), mon(), rep(), dex);
  check(b.stardust === 51000 && b.species_candy === 60 && b.unknown_costs.length === 0, 'second charged move Stardust and Candy are added to the build cost');
  check(secondMoveCost('houndoom', { isShadow: true })?.dust === 60000 && secondMoveCost('houndoom', { isPurified: true })?.dust === 40000, 'Shadow pays 1.2x and Purified 0.8x');
  check(costBundleFor(item({ needs_second_move: false }), mon(), rep(), dex).stardust === 1000, 'no second-move cost when none is needed');

  b = costBundleFor(item({ needs_second_move: false, tm_needed: ['x'] }), mon(), rep({ needs_typed: [{ slot: 'fast', elite: false, name: 'a' }, { slot: 'charged', elite: true, name: 'b' }] }), dex);
  check(b.fast_tm === 1 && b.elite_charged_tm === 1 && b.charged_tm === 0 && b.elite_fast_tm === 0, 'TMs are counted by type: regular Fast, Elite Charged...');

  b = costBundleFor(item({ needs_second_move: false, verdict: 'BUILD_MEGA' }), mon({ mega_sid: 'tyranitar_mega' }), rep(), dex);
  check(b.mega_energy !== null || b.unknown_costs.some((u) => /Mega Energy/.test(u)), 'Mega Energy is either priced (flagged as an estimate) or listed as UNKNOWN');
  b = costBundleFor(item({ needs_second_move: false, verdict: 'BUILD_MEGA' }), mon({ mega_sid: 'unknown_mega' }), rep(), dex);
  check(b.mega_energy === null && b.unknown_costs.some((u) => /Mega Energy/.test(u)), 'an unpriced Mega is UNKNOWN, not free');
  b = costBundleFor(item({ needs_second_move: false, verdict: 'BUILD_MAX' }), mon({ max_attack_level: 1 }), rep(), dex);
  check(b.unknown_costs.some((u) => /Max Move upgrade/.test(u)), 'a Max build that needs an upgrade lists the Max Move price as UNKNOWN');
  b = costBundleFor(item({ needs_second_move: false }), mon({ is_shadow: true, knows_moves: ['FRUSTRATION'] }), rep(), dex);
  check(b.hard_blockers.length === 1, 'Frustration on a Shadow is a hard blocker');
  setLiveSecondMoveCosts(null);
}

// -------------------------------------------------------------- end to end
console.log('\nEnd to end (real engine on the fixture)');
{
  const raw = loadFixture();
  const dust = raw.account.currencyBalance.find((c: any) => /STARDUST/i.test(c.currencyType)).quantity;
  const run = async (r: any) => ((await runFullAnalysis(JSON.parse(JSON.stringify(r)), {}, { useOfflineFallbackOnly: true })) as any).report;
  const rep = await run(raw);
  const items: any[] = rep.grade.level_these;
  const okItems = items.filter((i) => i.affordability && ['READY', 'CHECK'].includes(i.affordability.status));
  const sum = okItems.reduce((s, i) => s + i.cost.dust, 0);
  check(okItems.length > 0 && sum <= dust, `the builds marked affordable together fit your Stardust (${sum.toLocaleString()} of ${dust.toLocaleString()})`);
  check(items.filter((i) => i.affordability?.status === 'READY').every((i) => i.affordability.lines.every((l: any) => l.status === 'ok')), 'a READY build has no unknown and no short line');
  check(items.every((i) => i.can_build_now === (i.affordability.status === 'READY' ? true : i.affordability.status === 'CHECK' ? undefined : false)), 'can_build_now agrees with the allocation result');
  const withNeed = items.filter((i) => (i.cost.candy > 0) && i.affordability.status !== 'NOT_AFFORDABLE' && i.affordability.status !== 'BLOCKED');
  check(withNeed.every((i) => i.affordability.status === 'CHECK'), `builds that need species Candy are never READY while Candy is unknown (${withNeed.length} checked)`);
  const led = rep.resource_ledger;
  check(led.find((r: any) => r.key === 'species_candy').state === 'unknown' && led.find((r: any) => r.key === 'stardust').state === 'known', 'the report ledger: Stardust known, species Candy unknown');

  // Remove the whole inventory: nothing that needs a resource may be READY
  const bare = JSON.parse(JSON.stringify(raw));
  delete bare.items; bare.account.currencyBalance = [];
  const rep2 = await run(bare);
  const l2 = rep2.resource_ledger;
  check(l2.find((r: any) => r.key === 'stardust').state === 'unknown' && l2.find((r: any) => r.key === 'fast_tm').state === 'unknown', 'with no inventory in the export, balances are UNKNOWN');
  const ready2 = rep2.grade.level_these.filter((i: any) => i.affordability.status === 'READY');
  check(ready2.every((i: any) => i.cost.dust === 0 && (i.tm_needed || []).length === 0), `with no inventory, a READY build can only be one that needs nothing (${ready2.length})`);
  check(rep2.grade.level_these.some((i: any) => i.affordability.status === 'CHECK'), 'builds that need resources show CHECK instead');
}
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
