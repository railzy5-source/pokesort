/** Proof that every control on the Settings tab changes the results. Run: npx tsx scripts/test-settings-effects.mts */
import fs from 'node:fs';
import path from 'node:path';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { analyzePgsExport } from '../src/engine/sorterEngine';
import { buildOfflineFallbackData } from '../src/engine/offlineFallback';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };
const DIR = path.resolve(import.meta.dirname, '../public/assets/aistudio');
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'PGSStats_e818d197.json'), 'utf8'));
const verdictOf = (r: any) => new Map<string, string>(r.mons.map((m: any) => [m.id, m.verdict]));
const changed = (a: any, b: any) => { const x = verdictOf(a), y = verdictOf(b); let n = 0; for (const [k, v] of x) if (y.get(k) !== v) n++; return n; };
const run = async (cfg: any = {}) => ((await runFullAnalysis(JSON.parse(JSON.stringify(raw)), cfg, { useOfflineFallbackOnly: true })) as any).report;
const base = await run();
const tagged = Array.from(new Set(base.mons.flatMap((m: any) => m.mon_tags || [])));
console.log('tags in this export:', tagged.join(', ') || '(none)');

const cases: [string, any][] = [
  ['Protect IV % → 80', { protect_iv_pct: 80 }],
  ['Raid min IV % → 95', { raid: { min_iv_pct: 95 } }],
  ['Raid min Attack IV → 15', { raid: { min_atk_iv: 15 } }],
  ['Leagues: turn Ultra + Master off', { pvp: { leagues: ['1500'] } }],
  ['Protecting tags: only "trade"', { protect_tag_names: ['trade'] }],
  ['Max Battles: spare slots 0', { max_battle: { reserve_keep: 0 } }],
];
for (const [label, cfg] of cases) check(changed(base, await run(cfg)) > 0, `${label} changes the results`);

// A tag listed as "ignore" stops protecting: at least one tag in this export must show the effect
let ignoreWorks = false;
for (const tag of tagged as string[]) {
  const pr = await run({ protect_tag_names: [tag] });
  const ex = await run({ protect_tag_names: [tag], exclude_tag_names: [tag] });
  if (changed(pr, ex) > 0) { ignoreWorks = true; console.log(`  (ignoring "${tag}" changes ${changed(pr, ex)} Pokémon)`); break; }
}
check(ignoreWorks, 'ignoring a tag removes its protection');

// Great League cannot be switched off
check(JSON.stringify((await run({ pvp: { leagues: [] } })).counts.verdicts) === JSON.stringify((await run({ pvp: { leagues: ['1500'] } })).counts.verdicts), 'Great League stays on even if nothing is selected');

// Cups: needs cup rankings, so use a small fixture
const d: any = buildOfflineFallbackData();
for (const key of ['little', 'fantasy']) d.cupRanks[key] = JSON.parse(JSON.stringify(d.ranks[1500] || []));
const cupRun = (cups: string[]) => analyzePgsExport(JSON.parse(JSON.stringify(raw)), { pvp: { cups } }, d) as any;
check(changed(cupRun(['little', 'fantasy']), cupRun([])) > 0, 'turning cups on/off changes the results (with cup rankings present)');
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
