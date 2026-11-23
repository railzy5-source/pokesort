/**
 * Stage 1 tests: Mega correctness.
 *  - the optimal assignment solver
 *  - the per-form Mega status model (ordinary Houndoom, pre-evolutions, X/Y forms, locked vs unlocked, TRANSFER/TRADE/REVIEW)
 *  - end-to-end: only unlocked Megas fill Mega slots, candidates are investments, unavailable forms are ignored
 * Run: npx tsx scripts/test-mega-correctness.mts
 */
import { maxWeightAssignment } from '../src/engine/assignment';
import { assessMegaForm, megaBaseSid, megaFormSuffix } from '../src/engine/megaStatus';
import { isCuratedMega } from '../src/engine/megaCurated';
import { analyzePgsExport } from '../src/engine/sorterEngine';
import { buildOfflineFallbackData } from '../src/engine/offlineFallback';
import { loadFixture } from './_fixture.mts';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };

// ---------------------------------------------------------------- solver
console.log('Optimal assignment solver');
{
  // Rows = raid types, columns = Pokémon. Greedy "best first" gives A to type 1 (value 10) and leaves type 2 empty (total 10).
  const w = [[10, 8], [9, 0]];
  const r = maxWeightAssignment(w);
  const total = r.reduce((s, c, i) => s + (c >= 0 ? w[i][c] : 0), 0);
  check(total === 17 && r[0] === 1 && r[1] === 0, `finds the best overall split (17), which greedy misses (10): ${JSON.stringify(r)}`);
  check(JSON.stringify(maxWeightAssignment([[0, 0], [0, 5]])) === '[-1,1]', 'a zero-weight pairing is never returned');
  const tall = maxWeightAssignment([[5], [9], [7]]);
  check(tall.filter((c) => c >= 0).length === 1 && tall[1] === 0, 'more types than Pokémon: only the best type gets the single Pokémon');
  check(JSON.stringify(maxWeightAssignment([])) === '[]', 'empty input');

  // Cross-check against brute force on random small problems
  let rng = 12345;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const brute = (m: number[][]): number => {
    const rows = m.length, cols = m[0]?.length ?? 0;
    const used = new Array(cols).fill(false);
    const go = (i: number): number => {
      if (i === rows) return 0;
      let best = go(i + 1); // leave this row empty
      for (let j = 0; j < cols; j++) if (!used[j] && m[i][j] > 0) { used[j] = true; best = Math.max(best, m[i][j] + go(i + 1)); used[j] = false; }
      return best;
    };
    return go(0);
  };
  let allOk = true;
  for (let t = 0; t < 300; t++) {
    const rows = 1 + Math.floor(rand() * 5), cols = 1 + Math.floor(rand() * 5);
    const m = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.3 ? 0 : Math.round(rand() * 100))));
    const r = maxWeightAssignment(m);
    const cs = r.filter((c) => c >= 0);
    const distinct = new Set(cs).size === cs.length;
    const total = r.reduce((s, c, i) => s + (c >= 0 ? m[i][c] : 0), 0);
    if (!distinct || total !== brute(m)) { allOk = false; console.log('   mismatch', JSON.stringify(m), JSON.stringify(r), total, brute(m)); break; }
  }
  check(allOk, '300 random problems match an exhaustive search (and never reuse a Pokémon)');
}

// ---------------------------------------------------------------- status model
console.log('\nMega status model');
const dexStub: any = {
  familyMegaInfo: (sid: string) => ({
    houndour: ['houndoom_mega'], houndoom: ['houndoom_mega'],
    charmander: ['charizard_mega_x', 'charizard_mega_y'], charizard: ['charizard_mega_x', 'charizard_mega_y'],
  } as Record<string, string[]>)[sid] || [],
  megaBases: new Map([['houndoom', ['houndoom_mega']], ['charizard', ['charizard_mega_x', 'charizard_mega_y']]]),
};
const mon = (o: any): any => ({
  species: { speciesId: 'houndoom' }, verdict: 'BUILD_MEGA', is_shadow: false, mega_forms: [], has_mega_unlocked: false,
  is_currently_mega: false, iv_pct: 90, a: 14, mega_level: 0, raw: {}, ...o,
});
const HM = 'houndoom_mega', CX = 'charizard_mega_x', CY = 'charizard_mega_y';
const st = (m: any, sid: string) => assessMegaForm(m, sid, dexStub, { minIvPct: 80, minAtkIv: 10 });

check(megaBaseSid('charizard_mega_x') === 'charizard' && megaBaseSid('groudon_primal') === 'groudon' && megaFormSuffix('charizard_mega_y') === 'mega_y' && megaFormSuffix('rayquaza_mega') === 'mega', 'form ids are parsed correctly');
let a = st(mon({}), HM);
check(a.status === 'NEEDS_FIRST_MEGA' && !a.slotEligible, 'an ORDINARY Houndoom is not an unlocked Mega and cannot take a Mega slot');
a = st(mon({ mega_forms: [1], has_mega_unlocked: true }), HM);
check(a.status === 'UNLOCKED' && a.slotEligible, 'an UNLOCKED Houndoom can take the Mega slot');
check(st(mon({ mega_forms: [1], has_mega_unlocked: true, is_currently_mega: true }), HM).status === 'ACTIVE', 'a Houndoom that is Mega right now is ACTIVE');
a = st(mon({ species: { speciesId: 'houndour' } }), HM);
check(a.status === 'NEEDS_EVOLVE' && !a.slotEligible, 'a pre-evolution (Houndour) needs evolving and is not an owned Mega');
a = st(mon({ species: { speciesId: 'houndour' }, iv_pct: 40 }), HM);
check(a.status === 'BASE_OWNED' && !a.slotEligible, 'a low-IV family Pokémon is only BASE_OWNED, not worth investing in');
a = st(mon({ species: { speciesId: 'bulbasaur' } }), HM);
check(a.status === 'NO_SPECIMEN', 'an unrelated Pokémon is never a candidate (no base-species whitelisting)');
// Multiple Mega forms
const zard = (o: any) => mon({ species: { speciesId: 'charizard' }, ...o });
check(st(zard({ mega_forms: [2], has_mega_unlocked: true }), CX).status === 'UNLOCKED', 'Charizard that evolved into X: X is unlocked');
a = st(zard({ mega_forms: [2], has_mega_unlocked: true }), CY);
check(a.status === 'NEEDS_FIRST_MEGA' && !a.slotEligible, 'unlocking Mega X does NOT unlock Mega Y');
check(st(zard({ mega_forms: [3, 2], has_mega_unlocked: true }), CY).slotEligible && st(zard({ mega_forms: [3, 2], has_mega_unlocked: true }), CX).slotEligible, 'both forms unlocked: both eligible');
a = st(zard({ has_mega_unlocked: true }), CX);
check(a.status === 'FORM_UNCONFIRMED' && !a.slotEligible, 'evidence of a Mega but no form recorded, with two forms possible: UNCONFIRMED, never assumed ready');
check(st(mon({ has_mega_unlocked: true }), HM).status === 'UNLOCKED', 'same evidence with only one possible form: unlocked');
check(st(zard({ mega_forms: [9], has_mega_unlocked: true }), CX).status === 'FORM_UNCONFIRMED', 'an unrecognised form id is never guessed');
// Kept vs disposed
for (const v of ['TRANSFER', 'TRADE', 'REVIEW']) {
  a = st(mon({ mega_forms: [1], has_mega_unlocked: true, verdict: v }), HM);
  check(a.blockedByVerdict && !a.slotEligible, `an unlocked Houndoom marked ${v} is not valid retained Mega ownership`);
}
// While verdicts are still being decided (placement) the verdict must not be used, or placeholder verdicts hide real Megas
a = assessMegaForm(mon({ mega_forms: [1], has_mega_unlocked: true, verdict: 'TRANSFER' }), HM, dexStub, { ignoreVerdict: true });
check(!a.blockedByVerdict && a.status === 'UNLOCKED', 'during placement the verdict is ignored (regression: placeholder verdicts hid Mega Abomasnow)');
check(!st(mon({ mega_forms: [1], has_mega_unlocked: true, is_shadow: true }), HM).slotEligible, 'a Shadow Pokémon never fills a Mega slot');
check(st(mon({}), HM).energy === 'UNKNOWN', 'Mega Energy is UNKNOWN (the export does not contain it)');

// ---------------------------------------------------------------- curated roster
console.log('\nCurated Mega roster');
const supported = new Set(['tyranitar_mega', 'gengar_mega']);
check(!isCuratedMega('houndoom'), 'a base species name never counts as a curated Mega');
check(!isCuratedMega('heatran'), 'a base species of a hypothetical Mega is not whitelisted');
check(isCuratedMega('tyranitar_mega', supported), 'a curated form that exists is accepted');
check(!isCuratedMega('metagross_mega', supported), 'a curated form missing from the game data is rejected');

// ---------------------------------------------------------------- end to end
console.log('\nEnd to end (real engine on the fixture)');
const raw0 = loadFixture();
const clone = () => JSON.parse(JSON.stringify(raw0));
const stripEvidence = (raw: any) => {
  for (const p of raw.pokemons) {
    p.megaEvolvedForms = []; p.hasMegaEvolved = false; delete p.hasMegaUnlocked;
    if (p.pokemonDisplay) { delete p.pokemonDisplay.megaEvolutionLevel; p.pokemonDisplay.currentTempEvolution = 0; }
  }
  return raw;
};
const run = (raw: any, data?: any): any => analyzePgsExport(raw, {}, data || buildOfflineFallbackData());
const slotMegas = (rep: any) => rep.raid_teams.filter((t: any) => t.mega).map((t: any) => `${t.type}:${t.mega.name}`);

// 1. As exported: every Mega on a team really has that form unlocked
{
  const rep = run(clone());
  const byUid = new Map<string, any>(raw0.pokemons.map((p: any) => [String(p.id), p]));
  let ok = true, n = 0;
  for (const t of rep.raid_teams) if (t.mega) {
    n++;
    const p = byUid.get(String(t.mega.id).split(':')[1]);
    const want = /Mega .* X$/.test(t.mega.name) ? 2 : /Mega .* Y$/.test(t.mega.name) ? 3 : 1;
    if (!p || !(p.megaEvolvedForms || []).includes(want)) { ok = false; console.log('   not unlocked:', t.type, t.mega.name); }
  }
  check(n > 0 && ok, `every Mega in a team slot has really Mega Evolved into that exact form (${n} slots)`);
}
// 2. No evidence anywhere: no Mega slot is filled, but candidates are shown as investments
{
  const rep = run(stripEvidence(clone()));
  check(slotMegas(rep).length === 0, `with no Mega Evolutions done, no Mega slot is filled (${slotMegas(rep).length})`);
  const cands = rep.raid_teams.filter((t: any) => t.mega_candidate);
  check(cands.length > 0, `...but ${cands.length} types show a Mega investment candidate`);
  check(cands.every((t: any) => !['UNLOCKED', 'ACTIVE'].includes(t.mega_candidate.status)), 'no candidate is reported as unlocked');
  check(cands.every((t: any) => t.mega_candidate.mega_energy === 'UNKNOWN'), 'Mega Energy is shown as UNKNOWN');
  check(cands.every((t: any) => t.mega_candidate.needs.length > 0), 'every candidate says what it still needs');
  check((rep.curated_megas || []).every((r: any) => !r.covered && !r.expensive.unlocked && !r.cheap.unlocked), 'curated Mega coverage counts nothing as unlocked');
  const wish = Object.values(rep.grade.wishlist_all.mega).flatMap((b: any) => b.rows);
  check(wish.every((r: any) => r.status !== 'HAVE'), 'the Mega wishlist never says HAVE for a Pokémon that has not Mega Evolved');
  check(wish.some((r: any) => r.status === 'CANDIDATE'), 'ordinary specimens are labelled CANDIDATE');
}
// 3. Houndoom: only the unlocked one may fill the slot
{
  const raw = stripEvidence(clone());
  const hounds = raw.pokemons.filter((p: any) => Number(p.pokemonId) === 229);
  check(hounds.length >= 1, `fixture has a Houndoom (${hounds.length})`);
  const none = run(JSON.parse(JSON.stringify(raw)));
  check(!slotMegas(none).some((s) => /Houndoom/.test(s)), 'ordinary Houndoom (nothing unlocked) is not in any Mega slot');
  hounds[0].megaEvolvedForms = [1]; hounds[0].hasMegaEvolved = true;
  const some = run(JSON.parse(JSON.stringify(raw)));
  console.log('   with Houndoom unlocked, Mega slots:', slotMegas(some).join(', ') || '(none)');
  check(slotMegas(some).some((s) => /Houndoom/.test(s)), 'the same Houndoom, once unlocked, DOES take a Mega Houndoom slot');
}
// 4. Pre-evolution only is never "owned"
{
  const raw = stripEvidence(clone());
  raw.pokemons = raw.pokemons.filter((p: any) => ![282, 475].includes(Number(p.pokemonId)));
  const rep = run(raw);
  const rows = Object.values(rep.grade.wishlist_all.mega).flatMap((b: any) => b.rows).filter((r: any) => r.sid === 'gardevoir_mega');
  check(rows.length === 0 || rows.every((r: any) => r.status === 'EVOLVE FIRST'), `only Ralts owned: Mega Gardevoir is EVOLVE FIRST, never HAVE (${rows.map((r: any) => r.status).join(',') || 'not in wishlist'})`);
  const fairy = rep.raid_teams.find((t: any) => t.type === 'fairy');
  check(!fairy.mega, 'and no Mega Gardevoir fills the Fairy slot');
}
// 5. Mega X unlocked does not unlock Mega Y
{
  const base = stripEvidence(clone());
  // Use the best Charizard that is actually being kept (surplus copies are TRANSFER/TRADE and can never hold a slot)
  const probe = run(JSON.parse(JSON.stringify(base)));
  const keeper = probe.mons
    .filter((m: any) => m.species === 'Charizard' && !['TRANSFER', 'TRADE', 'REVIEW'].includes(m.verdict))
    .sort((x: any, y: any) => y.iv_pct - x.iv_pct)[0];
  check(Boolean(keeper), 'fixture has a kept Charizard');
  const raw = JSON.parse(JSON.stringify(base));
  const zard = raw.pokemons.find((p: any) => String(p.id) === String(keeper.id).split(':')[1]);
  zard.megaEvolvedForms = [2]; zard.hasMegaEvolved = true;
  // The offline snapshot only contains Mega Charizard Y, so add Mega X (Fire/Dragon) to the test data.
  const withX = () => {
    const d: any = buildOfflineFallbackData();
    const y = (d.gm.pokemon as any[]).find((q) => q.speciesId === 'charizard_mega_y');
    d.gm.pokemon.push({ ...JSON.parse(JSON.stringify(y)), speciesId: 'charizard_mega_x', speciesName: 'Mega Charizard X', types: ['fire', 'dragon'] });
    return d;
  };
  const rep = run(raw, withX());
  console.log('   Charizard with only Mega X unlocked, Mega slots:', slotMegas(rep).join(', ') || '(none)');
  check(slotMegas(rep).some((s) => /Charizard X/.test(s)), 'it takes a Mega Charizard X slot');
  check(!slotMegas(rep).some((s) => /Charizard Y/.test(s)), 'and is never placed as Mega Charizard Y');
  // and when BOTH are unlocked, Y becomes possible
  const raw2 = JSON.parse(JSON.stringify(base));
  const z2 = raw2.pokemons.find((p: any) => String(p.id) === String(keeper.id).split(':')[1]);
  z2.megaEvolvedForms = [3, 2]; z2.hasMegaEvolved = true;
  const rep2 = run(raw2, withX());
  check(slotMegas(rep2).some((s) => /Charizard/.test(s)), 'with both forms unlocked a Mega Charizard slot is filled');
}
// 6. Forms the game data does not list are ignored everywhere
{
  const data: any = buildOfflineFallbackData();
  const all = (data.gm.pokemon as any[]).map((p) => String(p.speciesId)).filter((id) => /_mega(_[xy])?$|_primal$/.test(id));
  console.log(`   offline data lists ${all.length} Mega/Primal forms`);
  data.megaForms = all.filter((id) => id !== 'tyranitar_mega');
  const raw = clone();
  const rep = run(raw, data);
  const text = JSON.stringify({ teams: rep.raid_teams.map((t: any) => [t.mega?.name, t.mega_candidate?.name]), cur: rep.curated_megas });
  const tyr = rep.curated_megas.flatMap((r: any) => [r.expensive, r.cheap, ...r.alternatives]).filter((o: any) => o.sid === 'tyranitar_mega');
  check(rep.raid_teams.every((t: any) => !/Tyranitar/.test(`${t.mega?.name || ''}${t.mega_candidate?.name || ''}`)), 'a Mega missing from the game master never appears in a slot or as a candidate');
  check(tyr.every((o: any) => !o.owned && !o.unlocked && !o.supported), 'and curated status marks it unsupported, not owned, not unlocked');
  void text;
}
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
