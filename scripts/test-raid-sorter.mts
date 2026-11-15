/**
 * Automated checks for the type-aware raid sorter.
 * Run with:   npm run test:raid
 *
 * It runs the full analysis on the sample exports in public/assets/aistudio/ under three TM-bag situations
 * and checks the rules from the bug report for every one of the 17 team types.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { moveLabel } from '../src/engine/pveModel';

const DIR = path.resolve(import.meta.dirname, '../public/assets/aistudio');
const FILES = fs.readdirSync(DIR).filter((f) => /^PGSStats_.*\.json$/.test(f));

type Bag = { charged: number; eliteCharged: number; fast?: number; eliteFast?: number };
const SCENARIOS: { name: string; bag: Bag | null }[] = [
  { name: 'bag as exported', bag: null },
  { name: '+5 Charged TMs', bag: { charged: 5, eliteCharged: 0 } },
  { name: '+5 Charged TMs, +2 Elite Charged TMs', bag: { charged: 5, eliteCharged: 2 } },
];

function withBag(raw: any, bag: Bag | null) {
  const copy = JSON.parse(JSON.stringify(raw));
  if (!bag) return copy;
  const set = (code: number, name: string, count: number) => {
    copy.items = (copy.items || []).filter((i: any) => i.item !== code);
    copy.items.push({ item: code, itemName: name, count, ignoreInventoryCount: false });
  };
  set(1202, 'MoveRerollSpecialAttack', bag.charged);
  set(1204, 'MoveRerollEliteSpecialAttack', bag.eliteCharged);
  return copy;
}

let failures = 0;
let checks = 0;
const fail = (msg: string) => {
  failures++;
  console.log('   ✗ FAIL:', msg);
};
const check = (ok: boolean, msg: string) => {
  checks++;
  if (!ok) fail(msg);
};

for (const file of FILES) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  for (const sc of SCENARIOS) {
    console.log(`\n▶ ${file} · ${sc.name}`);
    const { report, remote } = await runFullAnalysis(withBag(raw, sc.bag), null, {});
    // label ("Earthquake") -> type ("ground")
    const typeByLabel = new Map<string, string>();
    for (const m of remote.gm.moves || []) typeByLabel.set(moveLabel(m.moveId), String(m.type).toLowerCase());
    const chargedType = (moveset: string) => typeByLabel.get((moveset.split(' / ')[1] || '').trim());

    for (const block of report.raid_teams as any[]) {
      const all = [...block.entries, ...(block.fix_queue || [])];
      const tag = `[${block.type}]`;

      // Structure
      check(new Set(block.entries.map((e: any) => e.id)).size === block.entries.length, `${tag} duplicate Pokémon in slots`);
      check(block.entries.filter((e: any) => e.slot === 'team').length <= 6, `${tag} more than 6 team slots`);
      check(block.entries.filter((e: any) => e.slot === 'backup').length <= 2, `${tag} more than 2 spares`);
      if (block.mega) check(block.entries[0]?.is_mega && block.entries[0]?.slot_num === 1, `${tag} Mega is not slot 1`);

      for (const e of all) {
        const nm = `${tag} ${e.name} (${e.moveset})`;
        if (e.is_mega && !e.status) continue; // mega with no matching-type move data

        // Rule 2: a READY attacker's charged move must be the team type
        if (e.status === 'ready') {
          check(chargedType(e.dps_moveset) === block.type, `${nm} is "ready" but its charged move is ${chargedType(e.dps_moveset)}, not ${block.type}`);
          // Rule 4: Frustration is never a usable move
          check(!/frustration/i.test(e.dps_moveset), `${nm} ready with Frustration`);
        }
        // A ready entry's DPS must be based on moves it already has
        if (e.status === 'ready') check(e.dps_basis === 'current', `${nm} ready but DPS is not from current moves`);
        // Rule 6: anything not ready must say what to do
        if (e.status && e.status !== 'ready') check((e.tm_actions || []).length > 0, `${nm} ${e.status} but no tm_actions`);
        // Rule 4: a Shadow whose ONLY charged move is Frustration can never be placed in a slot
        const onlyFrustration = e.shadow && /frustration/i.test(e.moveset) && e.moveset.split(' / ').length === 2;
        if (onlyFrustration && block.entries.includes(e)) check(false, `${nm} Shadow+Frustration was placed in a slot`);
        if (onlyFrustration) check(e.status === 'blocked' && e.blocker === 'frustration', `${nm} Shadow+Frustration should be blocked(frustration), got ${e.status}/${e.blocker}`);
      }

      // Rule 7: slots only ever contain ready entries or needs-TM entries whose TM is in the bag
      for (const e of block.entries) {
        if (e.is_mega) continue;
        check(e.status === 'ready' || (e.status === 'needs_tm' && e.tm_in_bag), `${tag} ${e.name} in a slot but status=${e.status}, tm_in_bag=${e.tm_in_bag}`);
      }
      // ready entries come before needs-TM backfill
      const firstNonReady = block.entries.findIndex((e: any) => !e.is_mega && e.status !== 'ready');
      if (firstNonReady >= 0) {
        check(block.entries.slice(firstNonReady).every((e: any) => e.status !== 'ready'), `${tag} a ready entry sits below a needs-TM entry`);
      }
      // Elite-needed entries are never "in bag" unless an Elite TM is in the bag
      for (const e of all) {
        if (e.status === 'blocked' && e.blocker === 'needs_elite_tm') {
          check(!(sc.bag && sc.bag.eliteCharged > 0 && e.tm_in_bag), `${tag} ${e.name} blocked on Elite TM although one is in the bag`);
        }
      }
    }

    // ---- The three concrete examples from the bug report (Ground team) -------------------------------------
    const ground: any = (report.raid_teams as any[]).find((b) => b.type === 'ground');
    const slots: any[] = ground.entries;
    const queue: any[] = ground.fix_queue || [];
    const garchompBS = slots.find((e) => e.name === 'Garchomp' && /Breaking Swipe/.test(e.moveset));
    check(!garchompBS || garchompBS.status !== 'ready', 'Garchomp with Breaking Swipe must not be a READY Ground attacker');
    const qBS = queue.find((e) => e.name === 'Garchomp' && /Breaking Swipe/.test(e.moveset));
    if (qBS) {
      console.log('   Garchomp (Breaking Swipe):', qBS.status_label, '→', qBS.tm_actions.join(' | '));
      check(/Breaking Swipe → /.test(qBS.tm_actions.join(' ')), 'Garchomp TM text should start with "TM Breaking Swipe →"');
    }
    const landoQ = [...slots, ...queue].find((e) => e.shadow && /Rock Throw \/ Frustration/.test(e.moveset));
    if (landoQ) {
      console.log('   Shadow Landorus (Rock Throw/Frustration):', landoQ.status_label);
      check(!slots.includes(landoQ), 'Shadow Landorus with Frustration must not be in a Ground slot');
      check(landoQ.blocker === 'frustration', 'Shadow Landorus should be blocked by Frustration');
      check(/Rock Throw → Mud Shot/.test(landoQ.tm_actions.join(' ')), 'Landorus advice should include TM Rock Throw → Mud Shot');
    }
    const excIron = [...slots, ...queue].find((e) => e.name === 'Excadrill' && /Iron Head/.test(e.moveset));
    if (excIron) {
      console.log('   Excadrill (Iron Head):', excIron.status_label, '→', excIron.tm_actions.join(' | '));
      check(excIron.status !== 'ready', 'Excadrill with Iron Head must not be READY on a Ground team');
      check(/Iron Head → /.test(excIron.tm_actions.join(' ')), 'Excadrill advice should mention TM Iron Head →');
    }
    const mamoBull = slots.filter((e) => e.name === 'Mamoswine' && /Bulldoze/.test(e.moveset) && e.slot === 'backup');
    check(mamoBull.length === 0, 'Mamoswine with Bulldoze must not take a spare slot');

    console.log(`   ground: ${ground.status_counts.ready} ready · ${ground.status_counts.needs_tm} need TM · ${ground.status_counts.blocked} blocked`);
  }
}

console.log(`\n${checks} checks, ${failures} failed.`);
process.exit(failures ? 1 : 0);
