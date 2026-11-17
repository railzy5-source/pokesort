/**
 * Test: every Pokémon is on exactly ONE raid team (team spot, reserve spot, build spot, or the TM list underneath),
 * teams are ordered by DPS, and the list underneath only holds free Pokémon that a TM would turn into an upgrade.
 * Run: npx tsx scripts/test-one-team-per-pokemon.mts [rootDir]
 */
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || path.resolve(import.meta.dirname, '..');
const { runFullAnalysis } = await import(path.join(root, 'src/engine/sorterEngine.ts'));
const raw = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/aistudio/PGSStats_e818d197.json'), 'utf8'));
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };
const rep: any = (await runFullAnalysis(raw, {}, { useOfflineFallbackOnly: true })).report;
const teams: any[] = rep.raid_teams;

const where = new Map<string, string[]>();
const add = (id: string, s: string) => { if (!where.has(id)) where.set(id, []); where.get(id)!.push(s); };
for (const t of teams) {
  for (const e of t.entries || []) add(e.id, `${t.type}:${e.is_mega ? 'mega' : e.slot}${e.status && e.status !== 'ready' ? '(build)' : ''}`);
  for (const e of t.fix_queue || []) add(e.id, `${t.type}:tm-list`);
}
const dups = [...where].filter(([, v]) => v.length > 1);
console.log(`Pokémon placed on a raid team or TM list: ${where.size} (${teams.reduce((n, t) => n + (t.entries?.length || 0), 0)} team spots, ${teams.reduce((n, t) => n + (t.fix_queue?.length || 0), 0)} TM-list rows)`);
check(dups.length === 0, `no Pokémon appears twice (found ${dups.length}${dups.length ? ': ' + dups.slice(0, 4).map(([id, v]) => `${id.slice(0, 8)}→${v.join(' + ')}`).join(', ') : ''})`);

let orderOk = true, megaFirst = true, queueOk = true, queueFree = true, improveOk = true;
for (const t of teams) {
  const e: any[] = t.entries || [];
  const rest = e.filter((x) => !x.is_mega);
  if (e.some((x) => x.is_mega) && !e[0].is_mega) megaFirst = false;
  const readyPart = rest.filter((x) => !x.status || x.status === 'ready');
  const buildPart = rest.filter((x) => x.status && x.status !== 'ready');
  for (const part of [readyPart, buildPart]) for (let i = 1; i < part.length; i++) if (part[i].dps > part[i - 1].dps + 1e-9) orderOk = false;
  // ready first, then build spots
  const firstBuild = rest.findIndex((x) => x.status && x.status !== 'ready');
  if (firstBuild >= 0 && rest.slice(firstBuild).some((x) => !x.status || x.status === 'ready')) orderOk = false;
  const q: any[] = t.fix_queue || [];
  const fixable = q.filter((x) => x.status === 'needs_tm'), stuck = q.filter((x) => x.status === 'blocked');
  for (const part of [fixable, stuck]) for (let i = 1; i < part.length; i++) if (part[i].dps > part[i - 1].dps + 1e-9) queueOk = false;
  // the list underneath: nobody on a team, and each one beats the weakest team spot (when the team is full)
  const teamSpots = e.filter((x) => !x.is_mega && x.slot === 'team');
  const teamSize = (rep.config?.raid?.keep_per_type ?? 6) - (t.mega ? 1 : 0);
  const floor = teamSpots.length < teamSize ? 0 : Math.min(...teamSpots.map((x) => x.dps));
  for (const x of q) {
    if (e.some((y) => y.id === x.id)) queueFree = false;
    if (x.dps <= floor) improveOk = false;
  }
}
check(megaFirst, 'the Mega is always slot 1');
check(orderOk, 'each team is ordered by DPS (ready now first, then build spots)');
check(queueOk, 'the TM list underneath is ordered by DPS');
check(queueFree, 'nobody in the TM list is also on a team');
check(improveOk, 'everyone in the TM list would beat the weakest team spot of that type');
const emptyBlocks = teams.filter((t) => (t.entries?.length || 0) === 0).length;
console.log(`(${emptyBlocks} of ${teams.length} types have no team in this export)`);
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
