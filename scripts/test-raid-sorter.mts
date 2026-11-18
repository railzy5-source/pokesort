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
  { name: '+5 Fast & Charged TMs', bag: { charged: 5, eliteCharged: 0, fast: 5, eliteFast: 0 } },
  { name: '+5 Fast & Charged TMs, +2 Elite Fast & Charged TMs', bag: { charged: 5, eliteCharged: 2, fast: 5, eliteFast: 2 } },
];

function withBag(raw: any, bag: Bag | null) {
  const copy = JSON.parse(JSON.stringify(raw));
  if (!bag) return copy;
  const set = (code: number, name: string, count: number) => {
    copy.items = (copy.items || []).filter((i: any) => i.item !== code);
    copy.items.push({ item: code, itemName: name, count, ignoreInventoryCount: false });
  };
  set(1201, 'MoveRerollFastAttack', bag.fast ?? 0);
  set(1202, 'MoveRerollSpecialAttack', bag.charged);
  set(1203, 'MoveRerollEliteFastAttack', bag.eliteFast ?? 0);
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
    const fastType = (moveset: string) => typeByLabel.get((moveset.split(' / ')[0] || '').replace(/ \(Fast Attack\)$/, '').trim());
    let fastOnlyReady = 0;

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

        // Rule 2 (fast-move rule): a READY attacker has a Fast Attack of the team type. Only a species that has NO Fast
        // Attack of that type at all may be ready through an on-type Charged Move instead.
        if (e.status === 'ready') {
          const onTypeFast = fastType(e.moveset) === block.type;
          check(onTypeFast || chargedType(e.dps_moveset) === block.type, `${nm} is "ready" but has neither a ${block.type} Fast Attack nor a ${block.type} Charged Move`);
          if (!/ \/ /.test(e.dps_moveset)) fastOnlyReady++;
          // A Charged Move TM is only ever an OPTIONAL upgrade for a ready Pokémon
          if (e.upgrade_hint) check(/^Optional:/.test(e.upgrade_hint), `${nm} ready but its TM hint is not marked optional: ${e.upgrade_hint}`);
          // Rule 4: Frustration is never a usable move
          check(!/frustration/i.test(e.dps_moveset), `${nm} ready with Frustration`);
        }
        // A ready entry's DPS must be based on moves it already has
        if (e.status === 'ready') check(e.dps_basis === 'current', `${nm} ready but DPS is not from current moves`);
        // Rule 6: anything not ready must say what to do
        if (e.status && e.status !== 'ready') check((e.tm_actions || []).length > 0, `${nm} ${e.status} but no tm_actions`);
        // A Pokémon blocked by Frustration can never be placed in a slot
        if (e.blocker === 'frustration') check(!block.entries.includes(e), `${nm} blocked by Frustration but placed in a slot`);
        // The required fix is only a Fast TM: Charged TMs are optional, so one entry never needs both
        const acts = (e.tm_actions || []).join(' | ');
        if (e.status === 'needs_tm' && !e.blocker) check(!(/Fast TM/.test(acts) && /Charged TM/.test(acts)), `${nm} requires BOTH a Fast and a Charged TM: ${acts}`);
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
          check(!(sc.bag && (sc.bag.eliteCharged > 0 || (sc.bag.eliteFast ?? 0) > 0) && e.tm_in_bag), `${tag} ${e.name} blocked on Elite TM although one is in the bag`);
        }
      }
    }

    // ---- Concrete examples (Ground team), under the fast-move rule: the Fast Attack decides readiness ------------------
    const ground: any = (report.raid_teams as any[]).find((b) => b.type === 'ground');
    const slots: any[] = ground.entries;
    const queue: any[] = ground.fix_queue || [];
    const all2 = [...slots, ...queue];
    // Garchomp with Breaking Swipe: READY exactly when its Fast Attack is Ground (the missing Ground charged move is optional)
    for (const e of all2.filter((x) => x.name === 'Garchomp' && /Breaking Swipe/.test(x.moveset))) {
      const fastIsGround = fastType(e.moveset) === 'ground';
      if (fastIsGround) {
        check(e.status === 'ready', 'Garchomp with a Ground Fast Attack is READY even without a Ground Charged Move');
        check(!e.upgrade_hint || /^Optional:/.test(e.upgrade_hint), 'its Charged TM is marked optional');
        console.log('   Garchomp (Mud Shot / Breaking Swipe): ready · ' + (e.upgrade_hint || 'no TM upgrade worth it'));
      } else {
        check(e.status !== 'ready', 'Garchomp without a Ground Fast Attack is not ready');
        check(/Fast TM/.test((e.tm_actions || []).join(' ')), 'and the required TM is a Fast TM');
      }
    }
    // Shadow Landorus (Rock Throw / Frustration): its Fast Attack is not Ground, so it needs a Fast TM. Frustration no longer blocks it.
    const landoQ = all2.find((e) => e.shadow && /Rock Throw \/ Frustration/.test(e.moveset));
    if (landoQ) {
      console.log('   Shadow Landorus (Rock Throw/Frustration):', landoQ.status_label);
      check(landoQ.status !== 'ready', 'Shadow Landorus with a Rock Fast Attack is not ready for Ground');
      check(landoQ.blocker !== 'frustration', 'Frustration no longer blocks a raider (Charged Moves are optional)');
      check(/Rock Throw → Mud Shot/.test((landoQ.tm_actions || []).join(' ')), 'Landorus advice should include TM Rock Throw → Mud Shot');
    }
    // Excadrill with Iron Head: ready only with a Ground Fast Attack
    for (const e of all2.filter((x) => x.name === 'Excadrill' && /Iron Head/.test(x.moveset))) {
      console.log('   Excadrill (Iron Head):', e.status_label, '→', (e.tm_actions || []).join(' | '));
      if (fastType(e.moveset) === 'ground') check(e.status === 'ready', 'Excadrill with a Ground Fast Attack is ready');
      else check(e.status !== 'ready', 'Excadrill without a Ground Fast Attack is not ready');
    }
    check(fastOnlyReady > 0 || all2.every((e) => e.status !== 'ready'), 'some Pokémon are ready on their Fast Attack alone');
    const mamoBull = slots.filter((e) => e.name === 'Mamoswine' && /Bulldoze/.test(e.moveset) && e.slot === 'backup');
    check(mamoBull.length === 0 || mamoBull.every((e) => fastType(e.moveset) === 'ground'), 'Mamoswine with Bulldoze only takes a spare slot with a Ground Fast Attack');

    console.log(`   ground: ${ground.status_counts.ready} ready · ${ground.status_counts.needs_tm} need TM · ${ground.status_counts.blocked} blocked`);
  }
}

console.log(`\n${checks} checks, ${failures} failed.`);
process.exit(failures ? 1 : 0);
