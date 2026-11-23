/**
 * Test: Dynamax Pokémon keep their Fast Attack's Max type, G-Max type is fixed, raid advice never re-rolls a Max mon's fast move.
 * Run with: npx tsx scripts/test-max-fastlock.mts
 * Uses the offline snapshot but swaps in a TRUSTED move table (fixes the ids the test needs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzePgsExport } from '../src/engine/sorterEngine';
import { buildOfflineFallbackData } from '../src/engine/offlineFallback';
import { loadFixture } from './_fixture.mts';

const DIR = path.resolve(import.meta.dirname, '../public/assets/aistudio');
const raw = loadFixture();

function data(trusted: boolean) {
  const d: any = buildOfflineFallbackData();
  d.sourceLabel = trusted ? 'Live PvPoke + PokeMiners (test fixture)' : 'Offline Built-in Pokédex Snapshot';
  d.pveMoves['MUD_SLAP_FAST'] = { id: 233, p: 4, d: 800, e: 7, t: 'ground' };
  d.gm.moves.push({ moveId: 'MUD_SLAP', name: 'Mud-Slap', type: 'ground', power: 3, energyGain: 9, cooldown: 500 });
  return d;
}
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };
const run = (cfg: any, trusted = true) => analyzePgsExport(JSON.parse(JSON.stringify(raw)), cfg, data(trusted)) as any;
const rhy = (r: any) => r.mons.filter((m: any) => m.species === 'Rhyperior' && (m.flags || []).includes('Dynamax'));

for (const [name, cfg] of [['lock ON (default)', {}], ['lock OFF', { max_battle: { respect_current_fast_move: false } }]] as const) {
  const r = run(cfg);
  console.log(`\n${name}`);
  for (const m of rhy(r)) console.log('   Rhyperior', m.iv, '| fast:', m.moves.find((x: any) => x.slot === 'fast')?.name, '| max_type:', m.max_type || '-', '| verdict:', m.verdict, '|', m.role);
  const notes = r.raid_teams.flatMap((t: any) => t.entries || []).filter((e: any) => rhy(r).some((m: any) => m.id === e.id));
  for (const e of notes) console.log('   raid entry', e.name, '| status:', e.status_label, '| actions:', JSON.stringify(e.tm_actions), '| lock:', e.fast_lock_note || '-');
}

console.log('\nChecks');
const on = run({});
for (const m of rhy(on)) {
  if (m.moves.find((x: any) => x.slot === 'fast')?.name?.toLowerCase().includes('mud')) {
    check(m.max_type === 'ground' || m.max_type === '', `Mud-Slap Rhyperior is never given a non-Ground Max type (got "${m.max_type}")`);
  }
}
const onEntries = on.raid_teams.flatMap((t: any) => t.entries || []).filter((e: any) => rhy(on).some((m: any) => m.id === e.id && m.max_type));
check(onEntries.every((e: any) => !(e.tm_actions || []).some((a: string) => /Fast TM/.test(a))), 'no Max-slotted Rhyperior is told to use a Fast TM');
const gm = on.mons.filter((m: any) => (m.flags || []).includes('Gigantamax') && m.species === 'Charizard' && m.max_type);
check(gm.length > 0 && gm.every((m: any) => m.max_type === 'fire'), `every placed G-Max Charizard is Fire (${gm.length} placed)`);
const off = run({ max_battle: { respect_current_fast_move: false } });
const offGm = off.mons.filter((m: any) => (m.flags || []).includes('Gigantamax') && m.species === 'Charizard' && m.max_type);
check(offGm.every((m: any) => m.max_type === 'fire'), 'G-Max Charizard is Fire even with the toggle off (G-Max type is a game rule)');
const offline = run({}, false);
check(JSON.stringify(offline.counts) === JSON.stringify(run({ max_battle: { respect_current_fast_move: false } }, false).counts), 'offline snapshot: toggle changes nothing (lock is skipped on untrusted move ids)');
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
