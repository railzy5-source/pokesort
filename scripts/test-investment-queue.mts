/**
 * Tests for changing the investment order and recalculating (the same allocator the browser runs).
 * Run: npx tsx scripts/test-investment-queue.mts
 */
import { allocateQueue, type AllocationResult } from '../src/engine/resourceLedger';
import { runFullAnalysis } from '../src/engine/sorterEngine';
import { loadFixture } from './_fixture.mts';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };

const raw = loadFixture();
const rep: any = (await runFullAnalysis(JSON.parse(JSON.stringify(raw)), {}, { useOfflineFallbackOnly: true })).report;
const items: any[] = rep.grade.level_these;
const ledger = rep.resource_ledger_data;

check(Boolean(ledger) && items.length > 0, `the report carries the full ledger and ${items.length} investments`);
check(items.every((i) => i.cost_bundle && Array.isArray(i.family_keys)), 'every investment carries its cost bundle and family keys');

// What the browser receives is JSON (and saved reports are JSON): it must behave identically after a round trip
const wire = JSON.parse(JSON.stringify({ ledger, items }));
const runQueue = (order: any[], l: any, allowRareCandy = false): Map<string, AllocationResult> =>
  new Map(allocateQueue(order.map((i) => ({ id: i.id, cost: i.cost_bundle, familyKeys: i.family_keys })), l, { allowRareCandy }).map((r) => [r.id, r]));

// 1. Re-running in the app's own order gives exactly the engine's answer
const defaultOrder = [...items].sort((a, b) => b.impact - a.impact || a.cost.dust - b.cost.dust);
const again = runQueue(defaultOrder, ledger);
const same = items.every((i) => again.get(i.id)!.status === i.affordability.status);
check(same, 'recalculating in the default order reproduces the engine statuses exactly');
const wireOrder = [...wire.items].sort((a: any, b: any) => b.impact - a.impact || a.cost.dust - b.cost.dust);
const viaJson = runQueue(wireOrder, wire.ledger);
check(items.every((i) => viaJson.get(i.id)!.status === i.affordability.status), 'the same holds after a JSON round trip (what the browser and saved reports see)');

// 2. Moving a blocked build to the front hands it the resources
const stat = (m: Map<string, AllocationResult>, id: string) => m.get(id)!.status;
const blocked = items.find((i) => i.affordability.status === 'BLOCKED' && i.affordability.blocked_by.length > 0);
if (blocked) {
  const reordered = [blocked, ...defaultOrder.filter((i) => i.id !== blocked.id)];
  const m = runQueue(reordered, ledger);
  check(['READY', 'CHECK'].includes(stat(m, blocked.id)), `"${blocked.species}" was BLOCKED behind other builds; put first it becomes ${stat(m, blocked.id)}`);
  const losers = blocked.affordability.blocked_by.filter((id: string) => !['READY', 'CHECK'].includes(stat(m, id)));
  check(losers.length > 0, 'and at least one build that was ahead of it now loses out (resources cannot be spent twice)');
} else {
  console.log('  (no BLOCKED-behind-another-build item in this fixture; reorder test skipped)');
}

// 3. Random orders: never over-spend; "not affordable" does not depend on the order
let rng = 99; const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const baseNot = new Set(items.filter((i) => i.affordability.status === 'NOT_AFFORDABLE').map((i) => i.id));
let noOverspend = true, orderFree = true;
const holdings: any = { stardust: ledger.stardust.value, charged_tm: ledger.charged_tm.value, fast_tm: ledger.fast_tm.value, elite_fast_tm: ledger.elite_fast_tm.value, elite_charged_tm: ledger.elite_charged_tm.value };
for (let t = 0; t < 60; t++) {
  const order = shuffle(items);
  const m = runQueue(order, ledger);
  const used: any = { stardust: 0, charged_tm: 0, fast_tm: 0, elite_fast_tm: 0, elite_charged_tm: 0 };
  for (const i of items) if (['READY', 'CHECK'].includes(stat(m, i.id))) for (const k of Object.keys(used)) used[k] += i.cost_bundle[k] || 0;
  if (Object.keys(used).some((k) => used[k] > holdings[k])) noOverspend = false;
  const not = new Set(items.filter((i) => stat(m, i.id) === 'NOT_AFFORDABLE').map((i) => i.id));
  if (not.size !== baseNot.size || [...not].some((id) => !baseNot.has(id))) orderFree = false;
}
check(noOverspend, '60 random orders: the builds approved never use more Stardust or TMs than you hold');
check(orderFree, '60 random orders: "not affordable" is the same whatever the order (only "blocked" depends on the order)');

// 4. Rare Candy opt-in can only help, and is off by default
const off = runQueue(defaultOrder, ledger, false);
const on = runQueue(defaultOrder, ledger, true);
const good = (m: Map<string, AllocationResult>) => [...m.values()].filter((r) => ['READY', 'CHECK'].includes(r.status)).length;
check(good(on) >= good(off), `allowing Rare Candy never approves fewer builds (${good(off)} -> ${good(on)})`);
check(items.every((i) => !JSON.stringify(i.affordability.lines).includes('covered by Rare Candy')), 'by default no build is quietly paid for with Rare Candy');

console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
