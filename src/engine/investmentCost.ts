/**
 * Turns one recommended build (a "level these" item) into a CostBundle the resource ledger can check and allocate.
 *
 * Nothing here invents a price. Where the price of something that applies is not available, it is listed in
 * `unknown_costs` so the result is UNKNOWN (never "free"), and anything that is an estimate is listed in `estimated`.
 */
import { requiredEvolutionItem } from './accountFeatures';
import { secondMoveCost } from './costTables';
import { getCuratedMegaInfo } from './megaCurated';
import { normStr } from './defaultConfig';
import { emptyCost, type CostBundle } from './resourceLedger';
import type { Dex } from './pveModel';
import type { LevelTheseItem, MonModel, ReportMon } from './types';

/** evolution item key used by `requiredEvolutionItem` -> ledger item key */
const BAG_KEY_TO_ITEM: Record<string, string> = {
  sun_stones: 'sun_stone',
  kings_rocks: 'kings_rock',
  metal_coats: 'metal_coat',
  dragon_scales: 'dragon_scale',
  upgrades: 'upgrade',
  sinnoh_stones: 'sinnoh_stone',
  unova_stones: 'unova_stone',
};

/** Possible keys of this Pokémon's family in per-family balances: lower-case family name and the root species' dex number. */
export function familyKeysFor(mon: MonModel | undefined, dex: Dex): string[] {
  const sp = mon?.species;
  if (!sp) return [];
  const keys: string[] = [];
  const famId = (sp as unknown as { family?: { id?: string } }).family?.id;
  if (famId) keys.push(String(famId).toLowerCase().replace(/^family_/, '').replace(/[^a-z0-9]/g, ''));
  // Walk up to the first stage of the line
  let cur = sp;
  for (let i = 0; i < 6; i++) {
    const parent = (cur as unknown as { family?: { parent?: string } }).family?.parent;
    const up = parent ? dex.byId.get(parent) : undefined;
    if (!up) break;
    cur = up;
  }
  keys.push(String(cur.dex));
  keys.push(cur.speciesId.replace(/[^a-z0-9]/g, ''));
  return Array.from(new Set(keys.filter(Boolean)));
}

export function costBundleFor(item: LevelTheseItem, mon: MonModel | undefined, r: ReportMon, dex: Dex): CostBundle {
  const cost = emptyCost();
  cost.stardust = r.cost_dust;
  cost.species_candy = r.cost_candy;
  cost.species_xl_candy = r.cost_xl;
  if (r.cost_estimated) cost.estimated.push('evolution Candy cost');

  // ---- second charged move: the price is per species and comes from the game master ----
  const wantsSecond = Boolean(item.needs_second_move) || r.build_status === 'Needs second charged move';
  if (wantsSecond && mon?.species) {
    const price = secondMoveCost(mon.species.speciesId, { isShadow: mon.is_shadow, isPurified: mon.is_purified });
    if (price) {
      cost.stardust += price.dust;
      cost.species_candy += price.candy;
    } else {
      cost.unknown_costs.push('Second charged move price (needs live game data)');
    }
  }

  // ---- TMs: one per move that has to change (regular TMs are random re-rolls, so more may be needed) ----
  const typed = item.tm_typed || r.needs_typed || [];
  if (typed.length > 0) {
    for (const t of typed) {
      if (t.elite) t.slot === 'fast' ? cost.elite_fast_tm++ : cost.elite_charged_tm++;
      else t.slot === 'fast' ? cost.fast_tm++ : cost.charged_tm++;
    }
    if (cost.fast_tm + cost.charged_tm > 0) cost.estimated.push('regular TMs are random re-rolls: more than one may be needed');
  } else if (item.tm_needed.length > 0) {
    for (const t of item.tm_needed) {
      const low = t.toLowerCase();
      const elite = low.includes('elite');
      const fast = low.includes('fast');
      if (elite) fast ? cost.elite_fast_tm++ : cost.elite_charged_tm++;
      else fast ? cost.fast_tm++ : cost.charged_tm++;
    }
    cost.estimated.push('TM type read from the move text');
  }

  // ---- evolution item ----
  if (item.evolve_to) {
    const req = requiredEvolutionItem(item.evolve_to, mon?.evolve_to_sid);
    const key = req ? BAG_KEY_TO_ITEM[String(req.bagKey)] : undefined;
    if (key) cost.items[key] = (cost.items[key] || 0) + 1;
  }

  // ---- Zygarde Cells, Crowned energy, Fusion energy ----
  if (mon?.dex === 718) {
    const fn = normStr(mon.form_name);
    if (fn.includes('10') || fn.includes('ten')) cost.items.zygarde_cells = 50;
    else if (!fn.includes('complete')) cost.items.zygarde_cells = 200;
  }
  const evoLow = (item.evolve_to || '').toLowerCase();
  const roleLow = (item.role || '').toLowerCase();
  if (mon?.dex === 888 && (evoLow.includes('crowned') || roleLow.includes('crowned'))) cost.items.crowned_zacian_energy = 1000;
  if (mon?.dex === 889 && (evoLow.includes('crowned') || roleLow.includes('crowned'))) cost.items.crowned_zamazenta_energy = 1000;
  if (mon?.dex === 800 && !mon.is_fusion) {
    if (evoLow.includes('dusk')) cost.items.solar_fusion_energy = 1000;
    if (evoLow.includes('dawn')) cost.items.lunar_fusion_energy = 1000;
  }
  if (mon?.dex === 646 && !mon.is_fusion) {
    if (evoLow.includes('white')) cost.items.blaze_fusion_energy = 1000;
    if (evoLow.includes('black')) cost.items.volt_fusion_energy = 1000;
  }

  // ---- Mega: the first Mega Evolution costs Mega Energy, and the energy balance is never in the export ----
  if (item.verdict === 'BUILD_MEGA' && mon && !mon.has_mega_unlocked) {
    const energy = mon.mega_sid ? getCuratedMegaInfo(mon.mega_sid, undefined, dex.megaSpecies)?.energy : undefined;
    if (energy && energy > 0) {
      cost.mega_energy = energy;
      cost.estimated.push('Mega Energy price comes from the curated list, not the game data');
    } else {
      cost.unknown_costs.push('Mega Energy price');
    }
  }

  // ---- Max: unlocking / upgrading a Max Move costs Max Particles and Candy, and no price list is available ----
  if (item.verdict === 'BUILD_MAX' && mon && (mon.max_attack_level ?? 0) < 3) {
    cost.unknown_costs.push('Max Move upgrade price (Max Particles + Candy)');
  }

  // ---- conditions that stop a build whatever you own ----
  if (mon?.is_shadow && mon.knows_moves.some((x) => Number(x) === 322 || String(x) === 'FRUSTRATION')) {
    cost.hard_blockers.push('Knows Frustration (wait for Rocket Takeover)');
  }
  return cost;
}
