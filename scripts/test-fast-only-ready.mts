/** Test: a raider is Ready when it has the right Fast Attack; Charged TMs are optional. Run: npx tsx scripts/test-fast-only-ready.mts */
import fs from 'node:fs';
import path from 'node:path';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { loadFixture } from './_fixture.mts';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };
const DIR = path.resolve(import.meta.dirname, '../public/assets/aistudio');
const raw = loadFixture();
const rep: any = (await runFullAnalysis(raw, {}, { useOfflineFallbackOnly: true })).report;

console.log('Pokémon table (raid builds)');
const raid = rep.mons.filter((m: any) => m.verdict === 'BUILD_RAID' || m.verdict === 'BUILD_MEGA');
const ready = raid.filter((m: any) => m.build_status === 'Ready');
check(ready.length > 0, `some raid builds are Ready (${ready.length})`);
check(ready.every((m: any) => (m.needs_moves || []).length === 0 && (m.needs_elite_moves || []).length === 0), 'a Ready raid build has no required TM');
const fastOnlyNote = raid.filter((m: any) => /Ready on its Fast Attack/.test(m.status_reason || ''));
check(fastOnlyNote.every((m: any) => /optional TM|^Ready on its Fast Attack$/.test(m.status_reason)), 'any Charged TM on a Ready raider is labelled "optional TM"');
check(!raid.some((m: any) => m.build_status === 'Needs Elite TM' && /Charged/i.test(m.status_reason || '') && !/optional/i.test(m.status_reason || '')), 'an Elite Charged TM is never a requirement');
const second = raid.filter((m: any) => m.needs_second_move);
check(second.length === 0, 'a raider never needs a "second charged move" slot to be ready');

console.log('\nRaid teams');
const entries = rep.raid_teams.flatMap((t: any) => (t.entries || []).filter((e: any) => !e.is_mega).map((e: any) => ({ ...e, team: t.type })));
const fastOnly = entries.filter((e: any) => e.status === 'ready' && !/ \/ /.test(e.dps_moveset || ''));
check(fastOnly.length > 0, `Pokémon are ready on their Fast Attack alone (${fastOnly.length})`);
check(fastOnly.every((e: any) => !e.upgrade_hint || /^Optional:/.test(e.upgrade_hint)), 'their Charged TM hint starts with "Optional:"');
const needTm = entries.filter((e: any) => e.status === 'needs_tm' && !e.blocker);
check(needTm.every((e: any) => !(/Fast TM/.test((e.tm_actions || []).join(' ')) && /Charged TM/.test((e.tm_actions || []).join(' ')))), 'a needs-TM entry only requires the Fast TM, never both');
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
