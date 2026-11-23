/** Tests: one role per Pokémon (Max or raid), Max spare slots, Crowned Zacian/Zamazenta. Run: npx tsx scripts/test-placement-rules.mts */
import fs from 'node:fs';
import path from 'node:path';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { canJoinMaxBattle, currentMaxMoveType } from '../src/engine/pveModel';
import { loadFixture } from './_fixture.mts';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };

console.log('Who can join Max Battles');
const mon = (o: any): any => ({ dex: 6, is_dynamax: false, is_gigantamax: false, species: { speciesId: 'charizard' }, form_name: '', ...o });
check(canJoinMaxBattle(mon({ is_dynamax: true })), 'Dynamax Pokémon can');
check(canJoinMaxBattle(mon({ is_gigantamax: true })), 'Gigantamax Pokémon can');
check(!canJoinMaxBattle(mon({})), 'an ordinary Pokémon cannot');
check(canJoinMaxBattle(mon({ dex: 888, species: { speciesId: 'zacian_crowned_sword' } })), 'Crowned Zacian can (no Dynamax needed)');
check(canJoinMaxBattle(mon({ dex: 889, species: { speciesId: 'zamazenta_crowned_shield' } })), 'Crowned Zamazenta can');
check(!canJoinMaxBattle(mon({ dex: 888, species: { speciesId: 'zacian_hero' }, form_name: 'Hero' })), 'Hero Zacian cannot');
const ct = currentMaxMoveType({} as any, mon({ dex: 888, species: { speciesId: 'zacian_crowned_sword' } }));
check(ct?.type === 'steel' && ct.why === 'fixed', 'Crowned Max Move is a fixed Steel attack');
check(currentMaxMoveType({} as any, mon({ dex: 888, species: { speciesId: 'zacian_hero' }, form_name: 'Hero' })) === null, 'Hero Zacian has no Max Move type');

const DIR = path.resolve(import.meta.dirname, '../public/assets/aistudio');
const raw = loadFixture();
const run = async (cfg: any = {}) => ((await runFullAnalysis(JSON.parse(JSON.stringify(raw)), cfg, { useOfflineFallbackOnly: true })) as any).report;

console.log('\nOne role per Pokémon');
const rep = await run();
// A Max holder is anyone on a Max team list, or whose verdict is BUILD_MAX
const maxHolders = new Set<string>([
  ...rep.mons.filter((m: any) => m.verdict === 'BUILD_MAX').map((m: any) => m.id),
  ...rep.max_teams.flatMap((t: any) => (t.entries || []).map((e: any) => e.id)),
]);
const raidTeamIds = rep.raid_teams.flatMap((t: any) => [...(t.entries || []).map((e: any) => e.id), ...(t.mega ? [t.mega.id] : [])]);
check(maxHolders.size > 0, `there are Max Pokémon to check (${maxHolders.size})`);
check(raidTeamIds.every((id: string) => !maxHolders.has(id)), 'no Max Pokémon appears on any raid team');
check(!rep.mons.some((m: any) => m.verdict === 'BUILD_RAID' && maxHolders.has(m.id)), 'no Pokémon is both BUILD_RAID and a Max Pokémon');

console.log('\nMax spare slots (max_battle.reserve_keep)');
const roleSpares = (r: any) => r.mons.filter((m: any) => m.verdict === 'BUILD_MAX' && /spare/i.test(m.role)).length;
const withSpares = await run({ max_battle: { reserve_keep: 2 } });
const noSpares = await run({ max_battle: { reserve_keep: 0 } });
check(roleSpares(withSpares) > 0, `spares exist with reserve_keep 2 (${roleSpares(withSpares)})`);
check(roleSpares(noSpares) === 0, 'no spares with reserve_keep 0');
check(withSpares.counts.verdicts.BUILD_MAX > noSpares.counts.verdicts.BUILD_MAX, 'the setting changes the BUILD_MAX count');

console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
