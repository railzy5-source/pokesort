/**
 * Tests for the Trade tab: who is tradable, what counts as a rare offer, Stardust costs, Lucky trade odds.
 * Run: npx tsx scripts/test-trade-rules.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { tradeBlockReason } from '../src/engine/accountFeatures';
import { TRADE_COST_SPECIAL_NEW, TRADE_COST_SPECIAL_REGISTERED } from '../src/engine/costTables';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };

console.log('Tradability rules');
const base: any = { is_traded: false, is_shadow: false, is_fusion: false, is_buddy: false, is_deployed: false, is_favorite: false, dex: 1, species: { tags: [], speciesId: 'bulbasaur' }, form_name: '' };
const t = (o: any) => tradeBlockReason({ ...base, ...o });
check(t({}) === null, 'ordinary Pokémon is tradable');
check(t({ is_traded: true }) !== null, 'already-traded Pokémon blocked');
check(t({ is_shadow: true }) !== null, 'Shadow blocked');
check(t({ species: { tags: ['mythical'] }, dex: 151 }) !== null, 'Mythical (Mew) blocked');
check(t({ species: { tags: ['mythical'] }, dex: 808 }) === null, 'Meltan is allowed (Special Trade)');
check(t({ species: { tags: ['mythical'] }, dex: 809 }) === null, 'Melmetal is allowed (Special Trade)');
check(t({ is_fusion: true }) !== null, 'fused blocked');
check(t({ is_buddy: true }) !== null, 'current buddy blocked');
check(t({ is_deployed: true }) !== null, 'Gym defender blocked');
check(t({ is_favorite: true }) !== null, 'favourite skipped');
check(t({ dex: 888, species: { tags: ['legendary'], speciesId: 'zacian_crowned_sword' } }) !== null, 'Crowned Zacian blocked');
check(t({ dex: 888, species: { tags: ['legendary'], speciesId: 'zacian_hero' } }) === null, 'Hero Zacian is tradable (Special Trade)');

const DIR = path.resolve(import.meta.dirname, '../public/assets/aistudio');
const raw0 = JSON.parse(fs.readFileSync(path.join(DIR, 'PGSStats_e818d197.json'), 'utf8'));
const run = (raw: any) => (runFullAnalysis(JSON.parse(JSON.stringify(raw)), {}, { useOfflineFallbackOnly: true }) as Promise<any>).then((r) => r.report);

console.log('\nRare offers');
const rep = await run(raw0);
const tm = rep.trade_matcher;
const byId = new Map<string, any>(rep.mons.map((m: any) => [m.id, m]));
check(tm.offers.length > 0, `there are offers (${tm.offers.length})`);
check(tm.offers.every((o: any) => o.verdict === 'TRADE' || o.verdict === 'TRANSFER'), 'every offer is a TRADE/TRANSFER spare');
check(tm.offers.every((o: any) => o.labels.length > 0 && o.special_trade), 'every offer is rare and flagged Special Trade');
check(tm.offers.every((o: any) => {
  const m = byId.get(o.id); const f = m.flags || [];
  return !f.includes('Shadow') && !m.is_traded;
}), 'no Shadow / traded Pokémon offered');
check(JSON.stringify(tm.offers[0].cost_registered) === JSON.stringify(TRADE_COST_SPECIAL_REGISTERED), 'Stardust costs (friend has it): 20,000 / 16,000 / 1,600 / 800');
check(JSON.stringify(tm.offers[0].cost_new) === JSON.stringify(TRADE_COST_SPECIAL_NEW), 'Stardust costs (new to friend): 1,000,000 / 800,000 / 80,000 / 40,000');
check(tm.offers_hidden.keep + tm.offers_hidden.build + tm.offers_hidden.untradable > 0, 'rare Pokémon held back are counted, so people know why');
check(!('distance_pairs_100km' in tm) || tm.distance_pairs_100km === undefined, 'the 100 km self-pairing feature is gone');

console.log('\nBuddy is never offered');
const raw1 = JSON.parse(JSON.stringify(raw0));
const topId = tm.offers[0].id.split(':')[1];
const rawMon = raw1.pokemons.find((p: any) => String(p.id) === topId);
raw1.account.buddyPokemonProto.buddyPokemonId = rawMon.id;
const rep1 = await run(raw1);
check(!rep1.trade_matcher.offers.some((o: any) => o.id === tm.offers[0].id), 'making the top offer your buddy removes it from the offers');

console.log('\nLucky trade odds');
const cands = tm.lucky_candidates.slice(0, 18);
const setDate = (c: any, iso: string) => { const p = raw0.pokemons.find((x: any) => String(x.id) === c.id.split(':')[1]); return { p, ms: Date.parse(iso) }; };
function mutated(allowance: number | null) {
  const r = JSON.parse(JSON.stringify(raw0));
  cands.forEach((c: any, i: number) => {
    const p = r.pokemons.find((x: any) => String(x.id) === c.id.split(':')[1]);
    p.creationTimeMs = i < 6 ? Date.parse('2017-06-01') : i < 12 ? Date.parse('2022-03-01') : Date.parse('2026-06-01');
  });
  r.trading = { guaranteedLuckyTradesRemaining: allowance };
  return r;
}
const ids = (a: number, b: number) => new Set(cands.slice(a, b).map((c: any) => c.id));
for (const [label, allowance] of [['3 guaranteed left', 3], ['0 guaranteed left', 0], ['allowance unknown', null]] as const) {
  const r = (await run(mutated(allowance))).trade_matcher;
  const old = r.lucky_candidates.filter((l: any) => ids(0, 6).has(l.id));
  const mid = r.lucky_candidates.filter((l: any) => ids(6, 12).has(l.id));
  const fresh = r.lucky_candidates.filter((l: any) => ids(12, 18).has(l.id));
  console.log(` ${label}: pre-2019 found ${old.length}, 2022 found ${mid.length}, recent found ${fresh.length}`);
  if (old.length) {
    if (allowance === 3) check(old.every((l: any) => l.mode === 'guaranteed' && l.chance_pct === 100), 'pre-2019 + guaranteed left → Guaranteed (100%)');
    if (allowance === 0) check(old.every((l: any) => l.mode === 'chance' && l.chance_pct === 25), 'pre-2019 but none left → falls back to the 25% odds');
    if (allowance === null) check(old.every((l: any) => l.mode === 'maybe_guaranteed'), 'pre-2019, allowance unknown → "guaranteed*" with a caveat');
  }
  if (mid.length) check(mid.every((l: any) => l.mode === 'chance' && l.chance_pct === 25), '2022 catch (4+ years) → 25%');
  if (fresh.length) check(fresh.every((l: any) => l.chance_pct === 5), 'caught within the last year → 5%');
  check(r.guaranteed_lucky_remaining === allowance, `guaranteed left reported as ${allowance}`);
  const order = r.lucky_candidates.map((l: any) => ({ guaranteed: 0, maybe_guaranteed: 1, chance: 2 } as any)[l.mode]);
  check(order.every((v: number, i: number) => i === 0 || order[i - 1] <= v), 'best odds listed first');
}
console.log('\nLucky odds by age (every Pokémon given the same catch date)');
for (const [label, iso, want] of [['caught 5 months before the export', '2026-06-15', 5], ['caught about 1 year 8 months before', '2025-03-01', 10], ['caught 3 years before', '2023-11-01', 25]] as const) {
  const r = JSON.parse(JSON.stringify(raw0));
  for (const p of r.pokemons) p.creationTimeMs = Date.parse(iso);
  const l = (await run(r)).trade_matcher.lucky_candidates;
  check(l.length > 0 && l.every((c: any) => c.chance_pct === want && c.mode === 'chance'), `${label} → ${want}% (${l.length} candidates)`);
}
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
