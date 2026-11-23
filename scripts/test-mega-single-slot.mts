/** Test: every Mega Pokémon is on at most ONE raid team and is not on any PvP / cup / Max Battle team. Run: npx tsx scripts/test-mega-single-slot.mts [rootDir] */
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || path.resolve(import.meta.dirname, '..');
const { runFullAnalysis } = await import(path.join(root, 'src/engine/sorterEngine.ts'));
import { loadFixture } from './_fixture.mts';
const raw = loadFixture();
const { report } = await runFullAnalysis(raw, {}, { useOfflineFallbackOnly: true });
const r = report as any;
const megaTeams = new Map<string, string[]>(); // mon id -> teams where it is the Mega
const anyTeams = new Map<string, string[]>();  // mon id -> teams where it appears at all
for (const t of r.raid_teams) {
  if (t.mega) { (megaTeams.get(t.mega.id) || megaTeams.set(t.mega.id, []).get(t.mega.id)!).push(t.type); }
  for (const e of t.entries || []) (anyTeams.get(e.id) || anyTeams.set(e.id, []).get(e.id)!).push(t.type);
}
const otherTeams = new Map<string, string[]>();
const addOther = (id: string, s: string) => { if (!otherTeams.has(id)) otherTeams.set(id, []); otherTeams.get(id)!.push(s); };
for (const b of [...(r.teams || []), ...Object.values(r.cup_teams || {})] as any[]) for (const t of b.teams || []) for (const m of t.members || []) addOther(String(m.id), `pvp ${b.league}`);
for (const t of r.max_teams || []) for (const e of t.entries || []) addOther(e.id, `max ${t.type}`);
const onOther = [...megaTeams.keys()].filter((id) => otherTeams.has(id));
console.log('Mega Pokémon that are also on a PvP/cup/Max team:', onOther.length, onOther.map((id) => `${id.slice(0, 8)}→${otherTeams.get(id)!.join('+')}`).join('  '));
const dupMega = [...megaTeams].filter(([, v]) => v.length > 1);
const dupAny = [...megaTeams.keys()].filter((id) => (anyTeams.get(id) || []).length > 1 || ((anyTeams.get(id) || []).length === 1 && !megaTeams.get(id)!.includes(anyTeams.get(id)![0])));
console.log('verdicts:', JSON.stringify(r.counts?.verdicts ?? r.counts));
console.log('teams with a Mega:', [...megaTeams.values()].flat().length, '| distinct Mega Pokémon:', megaTeams.size);
console.log('Mega Pokémon that are the Mega on 2+ teams:', dupMega.length, dupMega.map(([id, v]) => `${id.slice(0, 8)}→${v.join('+')}`).join('  '));
console.log('Mega Pokémon that also show up as an attacker on another team:', dupAny.length);
process.exit(dupMega.length === 0 && dupAny.length === 0 && onOther.length === 0 ? 0 : 1);
