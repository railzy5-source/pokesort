/**
 * Resource ledger: what the player HAS, what an investment COSTS, and what can really be afforded.
 *
 * Rules (from the project brief):
 *  - A balance is either KNOWN or UNKNOWN. A missing balance is never silently turned into 0 or into "enough".
 *  - The ONE exception is an item that is simply absent from an inventory list that IS present: the game omits items you
 *    hold none of, so that is reported as 0 and labelled "not listed" (basis: 'not_listed'), never hidden.
 *  - Species Candy, species XL Candy, Rare Candy and Rare Candy XL are four different things.
 *  - Investments are allocated ONE AFTER ANOTHER. A TM used by an earlier investment is gone for the next one.
 */
import { accField, resolveAccount } from './pgsParser';

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type Amount =
  | { state: 'known'; value: number; basis: 'listed' | 'not_listed' }
  | { state: 'unknown'; reason: string };

/** Per-family balances (species Candy, species XL Candy, Mega Energy). Keys are lower-case family names or root dex numbers. */
export type FamilyBalances =
  | { state: 'known'; byFamily: Record<string, number> }
  | { state: 'unknown'; reason: string };

export type CountKey =
  | 'stardust'
  | 'rare_candy'
  | 'rare_candy_xl'
  | 'fast_tm'
  | 'charged_tm'
  | 'elite_fast_tm'
  | 'elite_charged_tm'
  | 'max_particles';

export interface Ledger {
  stardust: Amount;
  /** Rare Candy: converts into Candy of ANY species. It is NOT species Candy. */
  rare_candy: Amount;
  /** Rare Candy XL: converts into species XL Candy. It is NOT species XL Candy. */
  rare_candy_xl: Amount;
  fast_tm: Amount;
  charged_tm: Amount;
  elite_fast_tm: Amount;
  elite_charged_tm: Amount;
  max_particles: Amount;
  species_candy: FamilyBalances;
  species_xl_candy: FamilyBalances;
  mega_energy: FamilyBalances;
  /** Evolution items, Zygarde Cells, Crowned / Fusion energy ... keyed by `ITEM_KEYS`. */
  items: Record<string, Amount>;
}

export const COUNT_LABEL: Record<CountKey, string> = {
  stardust: 'Stardust',
  rare_candy: 'Rare Candy',
  rare_candy_xl: 'Rare Candy XL',
  fast_tm: 'Fast TM',
  charged_tm: 'Charged TM',
  elite_fast_tm: 'Elite Fast TM',
  elite_charged_tm: 'Elite Charged TM',
  max_particles: 'Max Particles',
};

// Items matched by game id and/or normalised name (lower-case letters and digits only).
const COUNT_ITEMS: Record<Exclude<CountKey, 'stardust'>, { codes: number[]; names: string[] }> = {
  rare_candy: { codes: [1301], names: ['rarecandy', 'itemrarecandy'] },
  rare_candy_xl: { codes: [1302], names: ['xlrarecandy', 'itemxlrarecandy', 'rarexlcandy', 'itemrarexlcandy'] },
  fast_tm: { codes: [1201], names: ['movererollfastattack', 'itemmovererollfastattack', 'fasttm', 'itemfasttm'] },
  charged_tm: {
    codes: [1202],
    names: ['movererollspecialattack', 'itemmovererollspecialattack', 'chargedtm', 'chargetm', 'itemchargedtm', 'itemchargetm'],
  },
  elite_fast_tm: {
    codes: [1203],
    names: ['movererollelitefastattack', 'itemmovererollelitefastattack', 'elitefasttm', 'itemelitefasttm'],
  },
  elite_charged_tm: {
    codes: [1204],
    names: [
      'movererollelitechargedattack',
      'movererollelitespecialattack',
      'itemmovererollelitespecialattack',
      'elitechargedtm',
      'elitechargetm',
      'itemelitechargedtm',
      'itemelitechargetm',
    ],
  },
  max_particles: { codes: [1601], names: ['mp', 'maxparticle', 'maxparticles'] },
};

export const ITEM_KEYS: Record<string, { label: string; codes: number[]; names: string[] }> = {
  sun_stone: { label: 'Sun Stone', codes: [1101], names: ['sunstone'] },
  kings_rock: { label: "King's Rock", codes: [1102], names: ['kingsrock'] },
  metal_coat: { label: 'Metal Coat', codes: [1103], names: ['metalcoat'] },
  dragon_scale: { label: 'Dragon Scale', codes: [1104], names: ['dragonscale'] },
  upgrade: { label: 'Up-Grade', codes: [1105], names: ['upgrade'] },
  sinnoh_stone: { label: 'Sinnoh Stone', codes: [1106], names: ['gen4evolutionstone', 'sinnohstone'] },
  unova_stone: { label: 'Unova Stone', codes: [1107], names: ['gen5evolutionstone', 'unovastone'] },
  zygarde_cells: { label: 'Zygarde Cells', codes: [1150], names: ['otherevolutionstonea', 'zygardecell'] },
  crowned_zacian_energy: { label: 'Crowned Zacian Energy', codes: [1153], names: ['resourcecrownedzacian'] },
  crowned_zamazenta_energy: { label: 'Crowned Zamazenta Energy', codes: [1154], names: ['resourcecrownedzamazenta'] },
  solar_fusion_energy: { label: 'Solar Fusion Energy', codes: [], names: ['solarfusionenergy'] },
  lunar_fusion_energy: { label: 'Lunar Fusion Energy', codes: [], names: ['lunarfusionenergy'] },
  blaze_fusion_energy: { label: 'Blaze Fusion Energy', codes: [], names: ['blazefusionenergy'] },
  volt_fusion_energy: { label: 'Volt Fusion Energy', codes: [], names: ['voltfusionenergy'] },
};

// ---------------------------------------------------------------------------------------------------------------------
// Parsing the export
// ---------------------------------------------------------------------------------------------------------------------

const NO_SPECIES_DATA = 'This export does not contain that balance';

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Per-species balances. No known PGSStats export carries them, so this is a best-effort detector for a few obvious shapes
 * (an array of { family / pokemonId / dex / id, candy / quantity / amount / count }, or a { family: number } map). When
 * nothing is found the balance is UNKNOWN, never zero.
 */
function detectFamilyBalances(rawData: Record<string, unknown>, keyPattern: RegExp): FamilyBalances {
  const acc = resolveAccount(rawData);
  for (const holder of [rawData, acc as Record<string, unknown>]) {
    for (const [k, v] of Object.entries(holder)) {
      if (!keyPattern.test(k.replace(/[^a-zA-Z]/g, ''))) continue;
      const byFamily: Record<string, number> = {};
      const add = (id: unknown, qty: unknown) => {
        const key = norm(id).replace(/^family/, '');
        const n = Number(qty);
        if (key && Number.isFinite(n)) byFamily[key] = (byFamily[key] || 0) + n;
      };
      if (Array.isArray(v)) {
        for (const e of v) {
          if (!e || typeof e !== 'object') continue;
          const o = e as Record<string, unknown>;
          const id = o.familyId ?? o.family ?? o.pokemonId ?? o.speciesId ?? o.dex ?? o.id;
          const qty = o.candy ?? o.quantity ?? o.amount ?? o.count ?? o.energy ?? o.value ?? o.xl;
          if (id !== undefined && qty !== undefined) add(id, qty);
        }
      } else if (v && typeof v === 'object') {
        for (const [fam, qty] of Object.entries(v as Record<string, unknown>)) {
          if (typeof qty === 'number') add(fam, qty);
        }
      }
      if (Object.keys(byFamily).length > 0) return { state: 'known', byFamily };
    }
  }
  return { state: 'unknown', reason: NO_SPECIES_DATA };
}

export function buildLedger(rawData: Record<string, unknown>): Ledger {
  const accRaw = resolveAccount(rawData);

  // Stardust: from the currency list, or a plain field. Otherwise UNKNOWN (never 0).
  const currencies = accField<{ currencyType?: string; quantity?: number }[]>(rawData, 'currencyBalance') || [];
  const dustEntry = currencies.find((c) => String(c.currencyType || '').toUpperCase().includes('STARDUST'));
  const plainDust = accRaw.stardust ?? rawData.stardust;
  let stardust: Amount;
  if (dustEntry && Number.isFinite(Number(dustEntry.quantity))) {
    stardust = { state: 'known', value: Number(dustEntry.quantity), basis: 'listed' };
  } else if (plainDust !== undefined && plainDust !== null && Number.isFinite(Number(plainDust))) {
    stardust = { state: 'known', value: Number(plainDust), basis: 'listed' };
  } else {
    stardust = { state: 'unknown', reason: 'Stardust balance is not in this export' };
  }

  // Items: every listed item keeps its count. An item missing from a PRESENT list means none held ("not listed").
  const rawItems =
    accField<{ item?: number; itemName?: string; itemId?: string | number; count?: number }[]>(rawData, 'items') || [];
  const listPresent = Array.isArray(rawItems) && rawItems.length > 0;
  const byCode = new Map<number, number>();
  const byName = new Map<string, number>();
  for (const it of rawItems) {
    const cnt = Number(it.count || 0);
    const code = Number(it.item ?? (typeof it.itemId === 'number' ? it.itemId : NaN));
    if (!Number.isNaN(code) && code > 0) byCode.set(code, (byCode.get(code) || 0) + cnt);
    const nm = norm(it.itemName || (typeof it.itemId === 'string' ? it.itemId : ''));
    if (nm) byName.set(nm, (byName.get(nm) || 0) + cnt);
  }
  const itemAmount = (codes: number[], names: string[]): Amount => {
    if (!listPresent) return { state: 'unknown', reason: 'This export has no item list' };
    let found = false;
    let best = 0;
    for (const c of codes) if (byCode.has(c)) { found = true; best = Math.max(best, byCode.get(c) || 0); }
    for (const n of names) if (byName.has(n)) { found = true; best = Math.max(best, byName.get(n) || 0); }
    return found ? { state: 'known', value: best, basis: 'listed' } : { state: 'known', value: 0, basis: 'not_listed' };
  };

  const items: Record<string, Amount> = {};
  for (const [k, def] of Object.entries(ITEM_KEYS)) items[k] = itemAmount(def.codes, def.names);

  const c = COUNT_ITEMS;
  return {
    stardust,
    rare_candy: itemAmount(c.rare_candy.codes, c.rare_candy.names),
    rare_candy_xl: itemAmount(c.rare_candy_xl.codes, c.rare_candy_xl.names),
    fast_tm: itemAmount(c.fast_tm.codes, c.fast_tm.names),
    charged_tm: itemAmount(c.charged_tm.codes, c.charged_tm.names),
    elite_fast_tm: itemAmount(c.elite_fast_tm.codes, c.elite_fast_tm.names),
    elite_charged_tm: itemAmount(c.elite_charged_tm.codes, c.elite_charged_tm.names),
    max_particles: itemAmount(c.max_particles.codes, c.max_particles.names),
    species_candy: detectFamilyBalances(rawData, /^(candy|candies|candybalances|pokemoncandy|familycandy)$/i),
    species_xl_candy: detectFamilyBalances(rawData, /^(candyxl|xlcandy|xlcandies|candiesxl|xlcandybalances)$/i),
    mega_energy: detectFamilyBalances(rawData, /^(megaenergy|megaenergies|megaenergybalances)$/i),
    items,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------------------------------------------------

export interface CostBundle {
  stardust: number;
  /** Normal species Candy: power-ups, evolution and a second charged move. */
  species_candy: number;
  /** Species XL Candy (power-ups above level 40). */
  species_xl_candy: number;
  fast_tm: number;
  charged_tm: number;
  elite_fast_tm: number;
  elite_charged_tm: number;
  /** Evolution items, Zygarde Cells, Crowned / Fusion energy needed: ledger key -> amount. */
  items: Record<string, number>;
  /** Max Particles needed, when the price is known. */
  max_particles: number | null;
  /** Mega Energy needed, when the price is known. */
  mega_energy: number | null;
  /** Costs that apply but whose PRICE is not available. They make the result UNKNOWN, never "free". */
  unknown_costs: string[];
  /** Numbers in this bundle that are estimates, not verified game data. */
  estimated: string[];
  /** Conditions that stop the build regardless of resources (for example Frustration on a Shadow). */
  hard_blockers: string[];
}

export const emptyCost = (): CostBundle => ({
  stardust: 0,
  species_candy: 0,
  species_xl_candy: 0,
  fast_tm: 0,
  charged_tm: 0,
  elite_fast_tm: 0,
  elite_charged_tm: 0,
  items: {},
  max_particles: null,
  mega_energy: null,
  unknown_costs: [],
  estimated: [],
  hard_blockers: [],
});

// ---------------------------------------------------------------------------------------------------------------------
// Affordability and sequential allocation
// ---------------------------------------------------------------------------------------------------------------------

export type LineStatus = 'ok' | 'short' | 'unknown';

export interface ResourceLine {
  key: string;
  label: string;
  need: number;
  /** Balance available to THIS investment (after earlier investments took theirs). null = unknown. */
  have: number | null;
  status: LineStatus;
  note?: string;
}

export type AllocationStatus =
  | 'READY' //          every needed balance is known and is enough (after earlier investments)
  | 'CHECK' //          everything that can be checked is enough, but some balance or price is unknown: verify in-game
  | 'BLOCKED' //        affordable on its own, but earlier investments in the queue use up what it needs (or a hard blocker)
  | 'NOT_AFFORDABLE'; // short even with the whole inventory

export interface AllocationResult {
  id: string;
  status: AllocationStatus;
  lines: ResourceLine[];
  /** Earlier queue items that consumed what this one was short of. */
  blocked_by: string[];
  notes: string[];
}

export interface AllocationOptions {
  /** Let Rare Candy / Rare Candy XL cover a species Candy / XL Candy shortage. Off unless the player opts in. */
  allowRareCandy?: boolean;
}

export interface QueueItem {
  id: string;
  cost: CostBundle;
  /** Possible keys of the species' family in the per-family balances (lower-case family name, root dex number...). */
  familyKeys: string[];
}

interface Remaining {
  counts: Record<CountKey, number | null>;
  items: Record<string, number | null>;
  speciesCandy: Record<string, number> | null;
  speciesXl: Record<string, number> | null;
  megaEnergy: Record<string, number> | null;
}

const amt = (a: Amount): number | null => (a.state === 'known' ? a.value : null);
const fam = (b: FamilyBalances): Record<string, number> | null => (b.state === 'known' ? { ...b.byFamily } : null);

function startingBalances(l: Ledger): Remaining {
  return {
    counts: {
      stardust: amt(l.stardust),
      rare_candy: amt(l.rare_candy),
      rare_candy_xl: amt(l.rare_candy_xl),
      fast_tm: amt(l.fast_tm),
      charged_tm: amt(l.charged_tm),
      elite_fast_tm: amt(l.elite_fast_tm),
      elite_charged_tm: amt(l.elite_charged_tm),
      max_particles: amt(l.max_particles),
    },
    items: Object.fromEntries(Object.entries(l.items).map(([k, v]) => [k, amt(v)])),
    speciesCandy: fam(l.species_candy),
    speciesXl: fam(l.species_xl_candy),
    megaEnergy: fam(l.mega_energy),
  };
}

const famKey = (bal: Record<string, number> | null, keys: string[]): string | null => {
  if (!bal) return null;
  for (const k of keys) if (k in bal) return k;
  return keys[0] ?? null;
};

interface Check {
  lines: ResourceLine[];
  deduct: (r: Remaining) => void;
  anyShort: boolean;
  anyUnknown: boolean;
  shortKeys: string[];
}

/** Check one cost against a set of balances without changing them. */
function checkCost(cost: CostBundle, bal: Remaining, familyKeys: string[], opts: AllocationOptions): Check {
  const lines: ResourceLine[] = [];
  const shortKeys: string[] = [];
  const deductions: ((r: Remaining) => void)[] = [];
  let anyShort = false;
  let anyUnknown = false;

  const push = (line: ResourceLine) => {
    lines.push(line);
    if (line.status === 'short') { anyShort = true; shortKeys.push(line.key); }
    if (line.status === 'unknown') anyUnknown = true;
  };

  const simple = (key: CountKey, need: number) => {
    if (need <= 0) return;
    const have = bal.counts[key];
    if (have === null) return push({ key, label: COUNT_LABEL[key], need, have: null, status: 'unknown', note: 'Balance not in the export' });
    push({ key, label: COUNT_LABEL[key], need, have, status: have >= need ? 'ok' : 'short' });
    deductions.push((r) => { r.counts[key] = (r.counts[key] ?? 0) - need; });
  };

  simple('stardust', cost.stardust);

  // Species Candy and XL Candy are per family. Rare Candy only helps when the player has opted in.
  const candyLine = (
    key: 'species_candy' | 'species_xl_candy',
    need: number,
    label: string,
    balances: Record<string, number> | null,
    rareKey: 'rare_candy' | 'rare_candy_xl',
  ) => {
    if (need <= 0) return;
    if (!balances) {
      // The export does not contain species candy, so it is not included in ledger checks
      return;
    }
    const k = famKey(balances, familyKeys);
    const have = k ? balances[k] ?? 0 : 0;
    let covered = 0;
    if (opts.allowRareCandy && have < need) {
      const rare = bal.counts[rareKey];
      if (rare !== null) covered = Math.min(need - have, Math.max(0, rare));
    }
    const ok = have + covered >= need;
    push({
      key,
      label,
      need,
      have,
      status: ok ? 'ok' : 'short',
      note: covered > 0 ? `${covered} covered by ${COUNT_LABEL[rareKey]}` : undefined,
    });
    deductions.push((r) => {
      const bals = key === 'species_candy' ? r.speciesCandy : r.speciesXl;
      if (bals && k) bals[k] = Math.max(0, (bals[k] ?? 0) - (need - covered));
      if (covered > 0) r.counts[rareKey] = (r.counts[rareKey] ?? 0) - covered;
    });
  };
  candyLine('species_candy', cost.species_candy, 'Species Candy', bal.speciesCandy, 'rare_candy');
  candyLine('species_xl_candy', cost.species_xl_candy, 'Species XL Candy', bal.speciesXl, 'rare_candy_xl');

  simple('fast_tm', cost.fast_tm);
  simple('charged_tm', cost.charged_tm);
  simple('elite_fast_tm', cost.elite_fast_tm);
  simple('elite_charged_tm', cost.elite_charged_tm);
  if (cost.max_particles !== null) simple('max_particles', cost.max_particles);

  for (const [key, need] of Object.entries(cost.items)) {
    if (need <= 0) continue;
    const label = ITEM_KEYS[key]?.label || key;
    const have = bal.items[key];
    if (have === undefined || have === null) {
      push({ key, label, need, have: null, status: 'unknown', note: 'Balance not in the export' });
      continue;
    }
    push({ key, label, need, have, status: have >= need ? 'ok' : 'short' });
    deductions.push((r) => { r.items[key] = (r.items[key] ?? 0) - need; });
  }

  if (cost.mega_energy !== null && cost.mega_energy > 0) {
    const k = famKey(bal.megaEnergy, familyKeys);
    if (!bal.megaEnergy || !k) {
      push({ key: 'mega_energy', label: 'Mega Energy', need: cost.mega_energy, have: null, status: 'unknown', note: 'Mega Energy is not in the export' });
    } else {
      const have = bal.megaEnergy[k] ?? 0;
      push({ key: 'mega_energy', label: 'Mega Energy', need: cost.mega_energy, have, status: have >= cost.mega_energy ? 'ok' : 'short' });
      deductions.push((r) => { if (r.megaEnergy) r.megaEnergy[k] = Math.max(0, (r.megaEnergy[k] ?? 0) - (cost.mega_energy as number)); });
    }
  }

  // Prices that are not available make the answer UNKNOWN. They are never treated as free.
  for (const u of cost.unknown_costs) {
    push({ key: `unknown:${u}`, label: u, need: 0, have: null, status: 'unknown', note: 'Price not available' });
  }

  return { lines, deduct: (r) => deductions.forEach((d) => d(r)), anyShort, anyUnknown, shortKeys };
}

/**
 * Allocate a ranked queue of investments one after another.
 *
 * For each item, in order:
 *  1. Is it affordable with the WHOLE inventory? If not: NOT_AFFORDABLE (no later item can fix that).
 *  2. Is it affordable with what the earlier items LEFT? If not: BLOCKED, naming who used it up.
 *  3. Otherwise reserve its resources. READY if nothing is unknown, CHECK if some balance or price is unknown.
 */
export function allocateQueue(items: QueueItem[], ledger: Ledger, opts: AllocationOptions = {}): AllocationResult[] {
  const whole = startingBalances(ledger);
  const remaining = startingBalances(ledger);
  const results: AllocationResult[] = [];
  // Who consumed what, so a BLOCKED item can say who is in the way
  const consumers = new Map<string, string[]>();
  const note = (keys: string[], id: string) => keys.forEach((k) => consumers.set(k, [...(consumers.get(k) || []), id]));

  for (const it of items) {
    const notes: string[] = [];
    if (it.cost.estimated.length) notes.push(`Estimated: ${it.cost.estimated.join(', ')}`);
    if (it.cost.hard_blockers.length) {
      results.push({ id: it.id, status: 'BLOCKED', lines: [], blocked_by: [], notes: [...it.cost.hard_blockers, ...notes] });
      continue;
    }

    const alone = checkCost(it.cost, whole, it.familyKeys, opts);
    if (alone.anyShort) {
      results.push({ id: it.id, status: 'NOT_AFFORDABLE', lines: alone.lines, blocked_by: [], notes });
      continue;
    }

    const now = checkCost(it.cost, remaining, it.familyKeys, opts);
    if (now.anyShort) {
      const by = Array.from(new Set(now.shortKeys.flatMap((k) => consumers.get(k) || [])));
      results.push({ id: it.id, status: 'BLOCKED', lines: now.lines, blocked_by: by, notes: [...notes, 'Earlier investments in the queue use the resources this one needs'] });
      continue;
    }

    // Reserve: every KNOWN balance is deducted so the next item cannot spend it twice.
    const keysUsed = now.lines.filter((l) => l.status === 'ok' && l.need > 0).map((l) => l.key);
    now.deduct(remaining);
    note(keysUsed, it.id);
    results.push({ id: it.id, status: now.anyUnknown ? 'CHECK' : 'READY', lines: now.lines, blocked_by: [], notes });
  }
  return results;
}

/** Affordability of ONE cost against the whole inventory (no queue). */
export function assessAlone(cost: CostBundle, ledger: Ledger, familyKeys: string[], opts: AllocationOptions = {}): AllocationResult {
  return allocateQueue([{ id: 'item', cost, familyKeys }], ledger, opts)[0];
}

// ---------------------------------------------------------------------------------------------------------------------
// Report summary (for the UI)
// ---------------------------------------------------------------------------------------------------------------------

export interface LedgerSummaryRow {
  key: string;
  label: string;
  state: 'known' | 'unknown';
  value?: number;
  /** 'not_listed' means the item list exists but does not include this item, so none are held. */
  basis?: 'listed' | 'not_listed';
  reason?: string;
}

export function summarizeLedger(l: Ledger): LedgerSummaryRow[] {
  const row = (key: string, label: string, a: Amount): LedgerSummaryRow =>
    a.state === 'known'
      ? { key, label, state: 'known', value: a.value, basis: a.basis }
      : { key, label, state: 'unknown', reason: a.reason };
  return [
    row('stardust', 'Stardust', l.stardust),
    row('rare_candy', 'Rare Candy', l.rare_candy),
    row('rare_candy_xl', 'Rare Candy XL', l.rare_candy_xl),
    row('fast_tm', 'Fast TM', l.fast_tm),
    row('charged_tm', 'Charged TM', l.charged_tm),
    row('elite_fast_tm', 'Elite Fast TM', l.elite_fast_tm),
    row('elite_charged_tm', 'Elite Charged TM', l.elite_charged_tm),
    row('max_particles', 'Max Particles', l.max_particles),
  ];
}
