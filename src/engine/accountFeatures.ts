import { computeCp } from './cpmTable';
import { cleanSpeciesName, MAX_BATTLE_TYPES, normStr, OUT_OF_PLAY, RAID_USEFUL_TYPES } from './defaultConfig';
import { displaySpecies, ingameSearch, ivStr, accField, resolveAccount } from './pgsParser';
import { Dex } from './pveModel';
import type {
  BagResources,
  BottleCapRecommendation,
  BottleCapShadowNote,
  BottleCapSummary,
  BuddyTrackerData,
  EggAnalysisData,
  LevelTheseItem,
  MonModel,
  PogoConfig,
  RawPokemon,
  TagAuditData,
  TagAuditMismatch,
  TradeCluster,
  TradeMatcherData,
  TradePairItem,
} from './types';

// ============================================================
// C:1 — BAG RESOURCE PARSING & BUILD READINESS
// ============================================================
export function extractBagResources(rawData: Record<string, unknown>, _mons: MonModel[]): BagResources {
  void _mons;
  const accRaw = resolveAccount(rawData);
  const currencies = (accField<{ currencyType?: string; quantity?: number }[]>(rawData, 'currencyBalance') || []);
  const stardust =
    currencies.find((c) => String(c.currencyType || '').toUpperCase().includes('STARDUST'))?.quantity ??
    Number(accRaw.stardust ?? rawData.stardust ?? 0);
  const pokecoins =
    currencies.find((c) => String(c.currencyType || '').toUpperCase().includes('POKECOIN'))?.quantity ??
    Number(accRaw.pokecoins ?? rawData.pokecoins ?? 0);

  const rawItems =
    accField<{
      item?: number;
      itemName?: string;
      itemId?: string | number;
      count?: number;
      ignoreInventoryCount?: boolean;
    }[]>(rawData, 'items') || [];

  const byCode = new Map<number, number>();
  const byName = new Map<string, number>();
  let totalBagItems = 0;

  for (const it of rawItems) {
    const cnt = Number(it.count || 0);
    if (cnt <= 0) continue;
    if (!it.ignoreInventoryCount) totalBagItems += cnt;
    const code = Number(it.item ?? (typeof it.itemId === 'number' ? it.itemId : NaN));
    if (!Number.isNaN(code) && code > 0) {
      byCode.set(code, (byCode.get(code) || 0) + cnt);
    }
    const nm = String(it.itemName || (typeof it.itemId === 'string' ? it.itemId : '') || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (nm) {
      byName.set(nm, (byName.get(nm) || 0) + cnt);
    }
  }

  const getCount = (codes: number[], names: string[]): number => {
    let best = 0;
    for (const c of codes) best = Math.max(best, byCode.get(c) || 0);
    for (const n of names) best = Math.max(best, byName.get(n) || 0);
    return best;
  };

  const getPatternCount = (needleA: string, needleB: string): number => {
    let best = 0;
    for (const [k, v] of byName.entries()) {
      if (k.includes(needleA) && k.includes(needleB)) best = Math.max(best, v);
    }
    return best;
  };

  const maxItemRaw = accRaw.maxItemStorage ?? rawData.maxItemStorage;
  const maxItemStorage = maxItemRaw !== undefined && maxItemRaw !== null && Number(maxItemRaw) > 0
    ? Number(maxItemRaw)
    : null;

  return {
    stardust,
    pokecoins,
    total_bag_items: totalBagItems,
    max_item_storage: maxItemStorage,
    rare_candy: getCount([1301], ['rarecandy', 'itemrarecandy']),
    xl_candy: getCount([1302], ['xlrarecandy', 'itemxlrarecandy', 'rarexlcandy', 'itemrarexlcandy']),
    fast_tms: getCount([1201], ['movererollfastattack', 'itemmovererollfastattack', 'fasttm', 'itemfasttm']),
    charged_tms: getCount([1202], ['movererollspecialattack', 'itemmovererollspecialattack', 'chargedtm', 'chargetm', 'itemchargedtm', 'itemchargetm']),
    elite_fast_tms: getCount([1203], ['movererollelitefastattack', 'itemmovererollelitefastattack', 'elitefasttm', 'itemelitefasttm']),
    elite_charged_tms: getCount([1204], ['movererollelitechargedattack', 'movererollelitespecialattack', 'itemmovererollelitespecialattack', 'elitechargedtm', 'elitechargetm', 'itemelitechargedtm', 'itemelitechargetm']),
    premium_passes: getCount([1402], ['paidraidticket', 'itempaidraidticket']),
    remote_passes: getCount([1408], ['remoteraidticket', 'itemremoteraidticket']),
    mp: getCount([1601], ['mp']),
    mp_replenish: getCount([1602], ['mpreplenish']),
    max_boost: getCount([1603], ['maxboost']),
    crowned_zacian_energy: getCount([1153], ['resourcecrownedzacian']),
    crowned_zamazenta_energy: getCount([1154], ['resourcecrownedzamazenta']),
    zygarde_cells: getCount([1150], ['otherevolutionstonea', 'zygardecell']),
    maple_a: getCount([1155], ['otherevolutionstonemaplea']),
    maple_b: getCount([1156], ['otherevolutionstonemapleb']),
    maple_c: getCount([1157], ['otherevolutionstonemaplec']),
    sun_stones: getCount([1101], ['sunstone']),
    kings_rocks: getCount([1102], ['kingsrock']),
    metal_coats: getCount([1103], ['metalcoat']),
    dragon_scales: getCount([1104], ['dragonscale']),
    upgrades: getCount([1105], ['upgrade']),
    sinnoh_stones: getCount([1106], ['gen4evolutionstone', 'sinnohstone']),
    unova_stones: getCount([1107], ['gen5evolutionstone', 'unovastone']),
    solar_fusion_energy: Math.max(getCount([], ['solarfusionenergy']), getPatternCount('solar', 'fusion')),
    lunar_fusion_energy: Math.max(getCount([], ['lunarfusionenergy']), getPatternCount('lunar', 'fusion')),
    blaze_fusion_energy: Math.max(getCount([], ['blazefusionenergy']), getPatternCount('blaze', 'fusion')),
    volt_fusion_energy: Math.max(getCount([], ['voltfusionenergy']), getPatternCount('volt', 'fusion')),
    poffins: getCount([708], ['poffin']),
    shadow_gems: getCount([709], ['shadowgem']),
    lucky_eggs: getCount([501], ['luckyegg']),
    star_pieces: getCount([504], ['starpiece']),
    golden_razz: getCount([706], ['goldenrazzberry']),
    master_balls: getCount([5], ['masterball']),
    silver_bottle_caps: Math.max(
      getCount([], ['silverbottlecap', 'itemsilverbottlecap', 'bottlecapsilver', 'itembottlecapsilver']),
      getPatternCount('silver', 'bottlecap'),
    ),
    gold_bottle_caps: Math.max(
      getCount([], ['goldbottlecap', 'itemgoldbottlecap', 'bottlecapgold', 'itembottlecapgold']),
      getPatternCount('gold', 'bottlecap'),
    ),
  };
}

const EVO_ITEM_BY_TARGET: Record<string, { label: string; bagKey: keyof BagResources }> = {
  bellossom: { label: 'Sun Stone', bagKey: 'sun_stones' },
  sunflora: { label: 'Sun Stone', bagKey: 'sun_stones' },
  whimsicott: { label: 'Sun Stone', bagKey: 'sun_stones' },
  lilligant: { label: 'Sun Stone', bagKey: 'sun_stones' },
  heliolisk: { label: 'Sun Stone', bagKey: 'sun_stones' },
  politoed: { label: "King's Rock", bagKey: 'kings_rocks' },
  slowking: { label: "King's Rock", bagKey: 'kings_rocks' },
  steelix: { label: 'Metal Coat', bagKey: 'metal_coats' },
  scizor: { label: 'Metal Coat', bagKey: 'metal_coats' },
  kingdra: { label: 'Dragon Scale', bagKey: 'dragon_scales' },
  porygon2: { label: 'Up-Grade', bagKey: 'upgrades' },
  rhyperior: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  electivire: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  magmortar: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  togekiss: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  yanmega: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  honchkrow: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  mismagius: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  gliscor: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  weavile: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  mamoswine: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  porygonz: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  gallade: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  dusknoir: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  froslass: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  roserade: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  ambipom: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  lickilicky: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  tangrowth: { label: 'Sinnoh Stone', bagKey: 'sinnoh_stones' },
  chandelure: { label: 'Unova Stone', bagKey: 'unova_stones' },
  eelektross: { label: 'Unova Stone', bagKey: 'unova_stones' },
  musharna: { label: 'Unova Stone', bagKey: 'unova_stones' },
  cinccino: { label: 'Unova Stone', bagKey: 'unova_stones' },
  simisage: { label: 'Unova Stone', bagKey: 'unova_stones' },
  simisear: { label: 'Unova Stone', bagKey: 'unova_stones' },
  simipour: { label: 'Unova Stone', bagKey: 'unova_stones' },
};

export function requiredEvolutionItem(targetName: string, targetSid?: string | null): { label: string; bagKey: keyof BagResources } | null {
  const clean = (targetSid || targetName || '')
    .toLowerCase()
    .replace(/_shadow$/, '')
    .replace(/[^a-z0-9]/g, '');
  for (const [k, v] of Object.entries(EVO_ITEM_BY_TARGET)) {
    if (clean === k || clean.startsWith(`${k}`)) {
      // Avoid matching porygon2 with porygonz
      if (k === 'porygon2' && clean.includes('porygonz')) continue;
      return v;
    }
  }
  return null;
}

export function evaluateBuildReadiness(
  item: LevelTheseItem,
  mon: MonModel | undefined,
  bag: BagResources,
  needsTyped: { name: string; slot: 'fast' | 'charged'; elite: boolean }[] = [],
): { can_build_now: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (item.cost.dust > bag.stardust) {
    const short = item.cost.dust - bag.stardust;
    blockers.push(`Need +${short.toLocaleString()} Stardust`);
  }
  if (item.cost.xl > bag.xl_candy) {
    blockers.push(`Needs ${item.cost.xl} XL Candy (have ${bag.xl_candy} Rare XL)`);
  }
  if (mon?.is_shadow && mon.knows_moves.some((x) => Number(x) === 322 || String(x) === 'FRUSTRATION')) {
    blockers.push('Knows Frustration (wait for Rocket Takeover)');
  }

  const eliteCharged = needsTyped.filter((t) => t.elite && t.slot === 'charged').map((t) => t.name);
  const eliteFast = needsTyped.filter((t) => t.elite && t.slot === 'fast').map((t) => t.name);
  const regCharged = needsTyped.filter((t) => !t.elite && t.slot === 'charged').map((t) => t.name);
  const regFast = needsTyped.filter((t) => !t.elite && t.slot === 'fast').map((t) => t.name);

  if (eliteCharged.length > 0 && bag.elite_charged_tms <= 0) {
    blockers.push(`0 Elite Charged TMs (${eliteCharged.join(', ')})`);
  }
  if (eliteFast.length > 0 && bag.elite_fast_tms <= 0) {
    blockers.push(`0 Elite Fast TMs (${eliteFast.join(', ')})`);
  }
  if (regCharged.length > 0 && bag.charged_tms <= 0) {
    blockers.push(`0 Charged TMs (${regCharged.join(', ')})`);
  }
  if (regFast.length > 0 && bag.fast_tms <= 0) {
    blockers.push(`0 Fast TMs (${regFast.join(', ')})`);
  }

  if (needsTyped.length === 0 && item.tm_needed.length > 0) {
    const needsEliteFast = item.tm_needed.filter((t) => {
      const low = t.toLowerCase();
      return low.includes('elite') && low.includes('fast');
    });
    const needsEliteCharged = item.tm_needed.filter((t) => {
      const low = t.toLowerCase();
      return low.includes('elite') && !low.includes('fast');
    });
    const needsRegFast = item.tm_needed.filter((t) => {
      const low = t.toLowerCase();
      return !low.includes('elite') && low.includes('fast tm');
    });
    const needsRegCharged = item.tm_needed.filter((t) => {
      const low = t.toLowerCase();
      return !low.includes('elite') && !low.includes('fast tm');
    });
    if (needsEliteCharged.length > 0 && bag.elite_charged_tms <= 0) {
      blockers.push(`0 Elite Charged TMs (${needsEliteCharged.join(', ')})`);
    }
    if (needsEliteFast.length > 0 && bag.elite_fast_tms <= 0) {
      blockers.push(`0 Elite Fast TMs (${needsEliteFast.join(', ')})`);
    }
    if (needsRegFast.length > 0 && bag.fast_tms <= 0) {
      blockers.push(`0 Fast TMs (${needsRegFast.join(', ')})`);
    }
    if (needsRegCharged.length > 0 && bag.charged_tms <= 0) {
      blockers.push(`0 Charged TMs (${needsRegCharged.join(', ')})`);
    }
  }

  // Evolution Stone check when evolving to a stone-requiring species
  if (item.evolve_to) {
    const evoReq = requiredEvolutionItem(item.evolve_to, mon?.evolve_to_sid);
    if (evoReq) {
      const owned = Number(bag[evoReq.bagKey] || 0);
      if (owned <= 0) {
        blockers.push(`0 ${evoReq.label}s (required for ${item.evolve_to})`);
      }
    }
  }

  // Zygarde Cells check
  if (mon?.dex === 718) {
    const fn = normStr(mon.form_name);
    if (fn.includes('10') || fn.includes('ten')) {
      if (bag.zygarde_cells < 50) blockers.push(`Zygarde Cells (${bag.zygarde_cells}/50 for 50% Forme)`);
    } else if (!fn.includes('complete')) {
      if (bag.zygarde_cells < 200) blockers.push(`Zygarde Cells (${bag.zygarde_cells}/200 for Complete Forme)`);
    }
  }

  // Crowned Sword/Shield & Fusion Energy checks
  const evoLow = (item.evolve_to || '').toLowerCase();
  const roleLow = (item.role || '').toLowerCase();
  if (mon?.dex === 888 && (evoLow.includes('crowned') || roleLow.includes('crowned'))) {
    if (bag.crowned_zacian_energy < 1000) {
      blockers.push(`Crowned Zacian Energy (${bag.crowned_zacian_energy}/1,000)`);
    }
  }
  if (mon?.dex === 889 && (evoLow.includes('crowned') || roleLow.includes('crowned'))) {
    if (bag.crowned_zamazenta_energy < 1000) {
      blockers.push(`Crowned Zamazenta Energy (${bag.crowned_zamazenta_energy}/1,000)`);
    }
  }
  if (mon?.dex === 800 && !mon.is_fusion) {
    if (evoLow.includes('dusk') && bag.solar_fusion_energy < 1000) {
      blockers.push(`Solar Fusion Energy (${bag.solar_fusion_energy}/1,000)`);
    }
    if (evoLow.includes('dawn') && bag.lunar_fusion_energy < 1000) {
      blockers.push(`Lunar Fusion Energy (${bag.lunar_fusion_energy}/1,000)`);
    }
  }
  if (mon?.dex === 646 && !mon.is_fusion) {
    if (evoLow.includes('white') && bag.blaze_fusion_energy < 1000) {
      blockers.push(`Blaze Fusion Energy (${bag.blaze_fusion_energy}/1,000)`);
    }
    if (evoLow.includes('black') && bag.volt_fusion_energy < 1000) {
      blockers.push(`Volt Fusion Energy (${bag.volt_fusion_energy}/1,000)`);
    }
  }

  return {
    can_build_now: blockers.length === 0,
    blockers,
  };
}

// ============================================================
// C:2 — PURE JS 64-BIT S2 CELL ID DECODER + 100KM+ TRADE MATCHER
// ============================================================
const POS_TO_IJ = [
  [0, 1, 3, 2],
  [0, 2, 3, 1],
  [3, 2, 0, 1],
  [3, 1, 0, 2],
];
const POS_TO_ORIENTATION = [1, 0, 0, 3];

function stToUv(s: number): number {
  return s >= 0.5 ? (1 / 3) * (4 * s * s - 1) : (1 / 3) * (1 - 4 * (1 - s) * (1 - s));
}

export function s2CellIdToLatLng(rawCell: string | number | undefined): { lat: number; lng: number } | null {
  if (rawCell === undefined || rawCell === null || rawCell === '' || rawCell === 0) return null;
  let id: bigint;
  try {
    id = typeof rawCell === 'string' ? BigInt(rawCell) : BigInt(Math.trunc(Number(rawCell)));
  } catch {
    return null;
  }
  if (id <= 0n) return null;

  const face = Number((id >> 61n) & 7n);
  if (face > 5) return null;

  // Move sentinel to center when cell level < 30
  const lsb = id & -id;
  const centerId = lsb > 1n ? (id ^ lsb) | (lsb >> 1n) : id;

  let orientation = face & 1;
  let i = 0;
  let j = 0;

  for (let level = 0; level < 30; level++) {
    const shift = BigInt(59 - 2 * level);
    const bits = Number((centerId >> shift) & 3n);
    const ij = POS_TO_IJ[orientation][bits];
    i = (i << 1) | ((ij >> 1) & 1);
    j = (j << 1) | (ij & 1);
    orientation ^= POS_TO_ORIENTATION[bits];
  }

  const MAX_SIZE = 1073741824; // 2^30
  const s = (i + 0.5) / MAX_SIZE;
  const t = (j + 0.5) / MAX_SIZE;
  const u = stToUv(s);
  const v = stToUv(t);

  let x = 0;
  let y = 0;
  let z = 0;
  switch (face) {
    case 0:
      x = 1; y = u; z = v;
      break;
    case 1:
      x = -u; y = 1; z = v;
      break;
    case 2:
      x = -u; y = -v; z = 1;
      break;
    case 3:
      x = -1; y = -v; z = -u;
      break;
    case 4:
      x = v; y = -1; z = -u;
      break;
    default:
      x = v; y = u; z = -1;
      break;
  }

  const latRad = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lngRad = Math.atan2(y, x);
  const lat = Math.round((latRad * 180) / Math.PI * 1000) / 1000;
  const lng = Math.round((lngRad * 180) / Math.PI * 1000) / 1000;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

export function buildTradeMatcher(mons: MonModel[], rawData?: Record<string, unknown>): TradeMatcherData {
  let untradableCount = 0;

  interface LocPoint {
    m: MonModel;
    lat: number;
    lng: number;
    tradable: boolean;
    bucketKey: string;
  }

  const points: LocPoint[] = [];
  const clusterMap = new Map<string, { latSum: number; lngSum: number; count: number; tradable: number }>();

  for (const m of mons) {
    const mythical = m.species?.tags?.includes('mythical') && m.dex !== 808 && m.dex !== 809;
    const isMythicalOrTraded = m.is_traded || m.is_shadow || Boolean(mythical);
    if (m.is_traded) untradableCount++;

    const rawCell = (m.raw as Record<string, unknown>).capturedS2CellId as string | number | undefined;
    const coords = s2CellIdToLatLng(rawCell);
    if (!coords) continue;

    // 0.25 deg grid clustering (~25km resolution)
    const bLat = Math.round(coords.lat * 4) / 4;
    const bLng = Math.round(coords.lng * 4) / 4;
    const bucketKey = `${bLat.toFixed(2)},${bLng.toFixed(2)}`;

    const tradable =
      !isMythicalOrTraded &&
      !m.is_favorite &&
      !m.verdict.startsWith('BUILD_');

    points.push({ m, lat: coords.lat, lng: coords.lng, tradable, bucketKey });

    const c = clusterMap.get(bucketKey) || { latSum: 0, lngSum: 0, count: 0, tradable: 0 };
    c.latSum += coords.lat;
    c.lngSum += coords.lng;
    c.count++;
    if (tradable) c.tradable++;
    clusterMap.set(bucketKey, c);
  }

  const formatCoordLabel = (lat: number, lng: number) => {
    const ns = lat >= 0 ? `${lat.toFixed(1)}°N` : `${Math.abs(lat).toFixed(1)}°S`;
    const ew = lng >= 0 ? `${lng.toFixed(1)}°E` : `${Math.abs(lng).toFixed(1)}°W`;
    return `${ns}, ${ew}`;
  };

  const clusters: TradeCluster[] = Array.from(clusterMap.values())
    .map((c) => {
      const lat = Math.round((c.latSum / c.count) * 100) / 100;
      const lng = Math.round((c.lngSum / c.count) * 100) / 100;
      return {
        label: formatCoordLabel(lat, lng),
        lat,
        lng,
        count: c.count,
        tradable_count: c.tradable,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Build representative tradable buckets per region so pairing stays O(R^2) fast
  const tradablesByBucket = new Map<string, LocPoint[]>();
  for (const pt of points) {
    if (!pt.tradable) continue;
    const arr = tradablesByBucket.get(pt.bucketKey) || [];
    arr.push(pt);
    tradablesByBucket.set(pt.bucketKey, arr);
  }

  // Sort buckets by count desc and match distant regions >= 100km
  const bucketEntries = Array.from(tradablesByBucket.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 40);

  const pairs: TradePairItem[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < bucketEntries.length; i++) {
    for (let j = i + 1; j < bucketEntries.length; j++) {
      const aList = bucketEntries[i][1];
      const bList = bucketEntries[j][1];
      const km = haversineKm(aList[0], bList[0]);
      if (km < 100) continue;

      for (const pa of aList) {
        if (usedIds.has(pa.m.uid)) continue;
        // Prefer pairing TRANSFER/trade surplus mons first, especially rare candy / XL priority species
        const pb = bList.find((x) => !usedIds.has(x.m.uid));
        if (!pb) break;
        usedIds.add(pa.m.uid);
        usedIds.add(pb.m.uid);
        pairs.push({
          id_a: pa.m.uid,
          name_a: displaySpecies(pa.m),
          cp_a: pa.m.cp,
          iv_a: ivStr(pa.m),
          region_a: formatCoordLabel(pa.lat, pa.lng),
          verdict_a: pa.m.verdict,
          id_b: pb.m.uid,
          name_b: displaySpecies(pb.m),
          cp_b: pb.m.cp,
          iv_b: ivStr(pb.m),
          region_b: formatCoordLabel(pb.lat, pb.lng),
          verdict_b: pb.m.verdict,
          km,
          candy_bonus: 3,
          xl_guaranteed: true,
        });
        if (pairs.length >= 60) break;
      }
      if (pairs.length >= 60) break;
    }
    if (pairs.length >= 60) break;
  }

  pairs.sort((a, b) => b.km - a.km);

  // Untraded 2016-2019 Lucky candidates
  const lucky_candidates = mons
    .filter((m) => !m.is_traded && !m.is_shadow && m.year !== null && m.year <= 2019)
    .sort((a, b) => (a.year || 2019) - (b.year || 2019) || a.iv_pct - b.iv_pct)
    .slice(0, 60)
    .map((m) => ({
      id: m.uid,
      species: displaySpecies(m),
      cp: m.cp,
      iv: ivStr(m),
      iv_pct: m.iv_pct,
      year: m.year!,
      verdict: m.verdict,
      search: ingameSearch(m, m.species?.speciesName || String(m.dex)),
    }));

  // Mirror trade candidates (species with >= 2 untraded surplus/low-IV copies)
  const mirrorMap = new Map<number, { species: string; mons: MonModel[] }>();
  for (const m of mons) {
    if (m.is_traded || m.is_shadow || m.is_favorite || m.verdict.startsWith('BUILD_')) continue;
    const isWorthMirror =
      m.species?.tags?.some((t) => ['legendary', 'ultrabeast'].includes(t)) ||
      m.pvp.some((p) => p.species_rank <= 80) ||
      Boolean(m.raid_type) ||
      Boolean(m.max_type);
    if (!isWorthMirror && m.verdict !== 'TRADE' && m.verdict !== 'REVIEW' && !m.variant_trade) continue;

    const bucket = mirrorMap.get(m.dex) || {
      species: cleanSpeciesName(m.species?.speciesName || `Dex #${m.dex}`),
      mons: [],
    };
    bucket.mons.push(m);
    mirrorMap.set(m.dex, bucket);
  }

  const mirror_candidates = Array.from(mirrorMap.entries())
    .filter(([, v]) => v.mons.length >= 2)
    .sort((a, b) => b[1].mons.length - a[1].mons.length)
    .slice(0, 40)
    .map(([dex, v]) => ({
      species: v.species,
      dex,
      count: v.mons.length,
      sample_ids: v.mons.slice(0, 4).map((x) => x.uid),
      search: `${dex}&!favorite&!shiny&!lucky&!shadow&!4*`,
    }));

  const tradeVerdictMons = mons.filter((m) => m.verdict === 'TRADE');
  const trade_search_chunks = buildSafeSearchChunks(
    tradeVerdictMons,
    mons,
    '!lucky&!shadow&!favorite&!4*&!#keep',
  );

  const tradingObj = rawData ? (accField<Record<string, unknown>>(rawData, 'trading') || {}) : {};
  const glRaw = tradingObj.guaranteedLuckyTradesRemaining;
  const guaranteedLuckyRemaining =
    glRaw !== undefined && glRaw !== null && !Number.isNaN(Number(glRaw))
      ? Number(glRaw)
      : null;

  return {
    untradable_count: untradableCount,
    clusters,
    distance_pairs_100km: pairs,
    lucky_candidates,
    mirror_candidates,
    trade_search_chunks,
    guaranteed_lucky_remaining: guaranteedLuckyRemaining,
  };
}

// ============================================================
// C:3 — BUDDY & EVOLUTION QUEST TRACKER
// ============================================================
export function buildBuddyTracker(
  rawData: Record<string, unknown>,
  mons: MonModel[],
): BuddyTrackerData {
  const accRaw = (rawData.account || {}) as Record<string, unknown>;
  const buddyProto = (accRaw.buddyPokemonProto || {}) as Record<string, unknown>;
  const obsData = (accRaw.buddyObservedData || {}) as Record<string, unknown>;
  const activeId = buddyProto.buddyPokemonId ? String(buddyProto.buddyPokemonId) : '';
  const activeMon = activeId
    ? mons.find((m) => String(m.raw.id ?? m.raw.uid ?? '') === activeId)
    : undefined;

  const swapsRaw = buddyProto.dailyBuddySwaps;
  const swapsObj = (swapsRaw && typeof swapsRaw === 'object' ? swapsRaw : {}) as Record<string, unknown>;
  const heartsObj = (obsData.todayStatsShownHearts || {}) as Record<string, unknown>;

  const active_buddy = activeMon
    ? {
        id: activeMon.uid,
        name: displaySpecies(activeMon),
        cp: activeMon.cp,
        level: Math.round(activeMon.level * 10) / 10,
        iv: ivStr(activeMon),
        emotion_points: Number(obsData.currentEmotionPoints ?? 0),
        points_earned: Number(obsData.currentPointsEarned ?? 0),
        km_progress:
          Math.round(Number(heartsObj.buddyAffectionKmInProgress ?? activeMon.buddy_km ?? 0) * 100) / 100,
        daily_swaps:
          typeof swapsRaw === 'number'
            ? swapsRaw
            : Number(swapsObj.count ?? (!Number.isNaN(Number(swapsRaw)) ? swapsRaw : 0) ?? 0),
      }
    : null;

  // Evolution quest tracking from evolutionQuestInfo[]
  const evo_quests: BuddyTrackerData['evo_quests'] = [];
  for (const m of mons) {
    const quests = (m.raw as Record<string, unknown>).evolutionQuestInfo;
    if (!Array.isArray(quests) || quests.length === 0) continue;
    for (const q of quests) {
      if (!q || typeof q !== 'object') continue;
      const qo = q as {
        evolution?: number;
        formName?: string;
        questRequirement?: {
          questId?: string;
          templateId?: string;
          progress?: number;
          goal?: { target?: number };
          status?: string | number;
        };
      };
      const req = qo.questRequirement;
      if (!req) continue;
      const progress = Number(req.progress ?? 0);
      const goal = Number(req.goal?.target ?? 0);
      if (goal <= 0) continue;
      const pct = Math.min(100, Math.round((100 * progress) / goal));
      const tRaw = String(req.templateId || req.questId || 'Buddy Evolution Task')
        .replace(/^EVO_QUEST_/i, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

      evo_quests.push({
        id: m.uid,
        species: displaySpecies(m),
        target_form: String(qo.formName || `Dex #${qo.evolution || m.dex}`),
        quest_name: tRaw,
        progress,
        goal,
        pct,
        cp: m.cp,
        iv: ivStr(m),
        search: ingameSearch(m, m.species?.speciesName || String(m.dex)),
      });
    }
  }
  evo_quests.sort((a, b) => b.pct - a.pct);

  // Walk Priority Queue
  const walk_queue = mons
    .filter(
      (m) =>
        m.verdict !== 'TRANSFER' &&
        (m.has_mega_unlocked ||
          m.verdict === 'BUILD_MEGA' ||
          m.verdict === 'BUILD_PVP' ||
          m.verdict === 'BUILD_RAID'),
    )
    .map((m) => {
      let priority = 0;
      let why = '';
      if (m.has_mega_unlocked && m.mega_level < 3) {
        priority = 95 + m.iv_pct * 0.05;
        why = `Mega Lv${m.mega_level} — walking earns Mega Energy + ${m.species?.buddyDistance || 5}km Candy`;
      } else if (m.verdict === 'BUILD_PVP' && m.power_up_to && m.power_up_to > 40) {
        priority = 88 + m.iv_pct * 0.05;
        why = `Needs XL Candy for L${m.power_up_to} ${m.best_pvp?.league || 'PvP'} cap`;
      } else if (m.verdict === 'BUILD_MEGA' || m.verdict === 'BUILD_RAID') {
        priority = 70 + m.iv_pct * 0.1;
        why = `Needs Candy / XL for ${m.role}`;
      } else {
        priority = 50 + m.iv_pct * 0.1;
        why = m.why_keep;
      }
      return {
        id: m.uid,
        name: displaySpecies(m),
        cp: m.cp,
        iv_pct: m.iv_pct,
        mega_level: m.mega_level,
        role: m.role,
        why,
        _score: priority,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 15)
    .map(({ _score: _s, ...rest }) => rest);

  return {
    active_buddy,
    evo_quests,
    walk_queue,
  };
}

// ============================================================
// C:4 — EGG POOL & INCUBATOR ANALYZER
// ============================================================
export function analyzeEggs(
  eggRecords: RawPokemon[],
  mons: MonModel[],
  dex: Dex,
): EggAnalysisData {
  const ownedDex = new Set(mons.filter((m) => m.verdict !== 'TRANSFER').map((m) => m.dex));
  let incubating = 0;
  let unincubated = 0;

  const eggs = eggRecords.map((raw, idx) => {
    const r = raw as Record<string, unknown>;
    const kmTarget = Number(r.eggKmWalkedTarget ?? 0);
    const kmWalked = Math.round(Number(r.eggKmWalkedStart ?? 0) * 100) / 100;
    const isInc = Boolean(r.eggIncubatorId);
    if (isInc) incubating++;
    else unincubated++;

    const distWrap = (r.eggDistribution || {}) as Record<string, unknown>;
    const rawPool = Array.isArray(distWrap.eggDistribution) ? distWrap.eggDistribution : [];

    const top_hatches: EggAnalysisData['eggs'][0]['top_hatches'] = [];
    let bestValue = kmTarget >= 10 ? 40 : 15;

    for (const item of rawPool) {
      if (!item || typeof item !== 'object') continue;
      const e = item as { pokemonId?: number; rarity?: number };
      const dexNum = Number(e.pokemonId ?? 0);
      const rarity = Number(e.rarity ?? 1);
      const spList = dex.byDex.get(dexNum) || [];
      const sp = spList[0];
      const name = sp ? cleanSpeciesName(sp.speciesName) : `Dex #${dexNum}`;
      const missingDex = !ownedDex.has(dexNum);
      const metaPvp = sp ? dex.pvpPos.get(1500)?.get(sp.speciesId) || dex.pvpPos.get(2500)?.get(sp.speciesId) : null;
      let role = 'Candy / Stardust';
      if (missingDex) role = 'New Pokédex Entry';
      else if (metaPvp && metaPvp[0] <= 80) role = `PvP Meta (#${metaPvp[0]})`;

      if (missingDex) bestValue += 25;
      if (rarity >= 4) bestValue += 15;
      if (metaPvp && metaPvp[0] <= 50) bestValue += 10;

      top_hatches.push({ dex: dexNum, name, rarity, role });
    }

    top_hatches.sort((a, b) => b.rarity - a.rarity);
    const rareCount = top_hatches.filter((h) => h.rarity >= 4).length;
    const priority_note = isInc
      ? `Incubating (${kmWalked}/${kmTarget} km)`
      : rareCount > 0
      ? `Super Incubator candidate (${rareCount} Tier-4/5 hatches)`
      : kmTarget <= 2
      ? 'Use Infinite Incubator to clear slot quickly'
      : 'Standard batch incubator egg';

    return {
      id: String(r.id ?? `egg-${idx}`),
      km_target: kmTarget,
      km_walked: kmWalked,
      incubating: isInc,
      slot_type: Number(r.eggSlotType ?? 0),
      top_hatches: top_hatches.slice(0, 6),
      value_score: Math.min(100, bestValue),
      priority_note,
    };
  });

  eggs.sort((a, b) => Number(a.incubating) - Number(b.incubating) || b.value_score - a.value_score);

  return {
    total: eggRecords.length,
    incubating,
    unincubated,
    eggs,
  };
}

// ============================================================
// B:4 — IN-GAME TAG CONFLICTS & SUMMARY
// ============================================================
export function evaluateTagConflicts(
  mons: MonModel[],
  rawData: Record<string, unknown>,
  cfg: PogoConfig,
): { name: string; color: number; count: number; conflicts: number }[] {
  void cfg;
  const counts = new Map<string, { color: number; count: number; conflicts: number }>();

  const rawTags = accField<unknown[]>(rawData, 'tags') || [];
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (!t || typeof t !== 'object') continue;
      const tr = t as { name?: string; color?: number };
      if (tr.name) counts.set(String(tr.name), { color: Number(tr.color ?? 0), count: 0, conflicts: 0 });
    }
  }

  for (const m of mons) {
    const conflicts: string[] = [];
    for (const tag of m.mon_tags) {
      const low = normStr(tag);
      const entry = counts.get(tag) || { color: 0, count: 0, conflicts: 0 };
      entry.count++;

      let hit = '';
      if ((low.includes('greatleague') || low === 'gl' || low === 'great') && m.cp > 1500) {
        hit = `Tag "${tag}" invalid: CP ${m.cp} exceeds 1500 cap`;
      } else if ((low.includes('ultraleague') || low === 'ul' || low === 'ultra') && m.cp > 2500) {
        hit = `Tag "${tag}" invalid: CP ${m.cp} exceeds 2500 cap`;
      } else if ((low.includes('littleleague') || low.includes('littlecup') || low === 'lc') && m.cp > 500) {
        hit = `Tag "${tag}" invalid: CP ${m.cp} exceeds 500 cap`;
      } else if (low === 'hundo' && m.iv_pct < 100) {
        hit = `Tag "${tag}" mismatch: IV is ${m.iv_pct}%`;
      } else if (low === 'nundo' && m.a + m.d + m.s > 0) {
        hit = `Tag "${tag}" mismatch: IV is ${ivStr(m)}`;
      } else if (low.includes('trade') && m.is_traded) {
        hit = `Tag "${tag}" mismatch: already traded`;
      } else if (low.includes('trade') && m.verdict.startsWith('BUILD_')) {
        hit = `Tag "${tag}" conflicts with ${m.verdict}`;
      } else if (
        m.verdict === 'TRANSFER' &&
        (low.includes('great') ||
          low.includes('ultra') ||
          low.includes('master') ||
          low.includes('pvp') ||
          low.includes('raid') ||
          low.includes('mega') ||
          low.includes('rank1') ||
          low.includes('keep'))
      ) {
        hit = `Transfer verdict conflicts with keeper/build tag "${tag}"`;
      }

      if (hit) {
        conflicts.push(hit);
        entry.conflicts++;
      }
      counts.set(tag, entry);
    }
    m.tag_conflicts = conflicts;
  }

  return Array.from(counts.entries())
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildTagAudit(mons: MonModel[]): TagAuditData {
  const mismatches: TagAuditMismatch[] = [];
  const untaggedBuildMons: MonModel[] = [];
  const transferTaggedMons: MonModel[] = [];

  let wrongCap = 0;
  let transferTagged = 0;
  let untaggedBuilds = 0;

  // Map (species_dex|cap) held by BUILD_PVP mons to detect inferior duplicate PvP tags
  const heldPvpByDexCap = new Map<string, MonModel>();
  for (const m of mons) {
    if (m.verdict === 'BUILD_PVP' && m.best_pvp) {
      heldPvpByDexCap.set(`${m.dex}|${m.best_pvp.cap}`, m);
    }
  }

  for (const m of mons) {
    const spLabel = displaySpecies(m);
    const search = ingameSearch(m, spLabel);

    for (const conflict of m.tag_conflicts) {
      const low = conflict.toLowerCase();
      let category: TagAuditMismatch['category'] = 'iv_mismatch';
      let suggestion = 'Review and remove outdated tag in-game.';
      if (low.includes('exceeds')) {
        category = 'wrong_cap';
        wrongCap++;
        suggestion = 'Remove league tag (already powered over CP cap).';
      } else if (low.includes('transfer verdict')) {
        category = 'transfer_tagged';
        transferTagged++;
        suggestion = 'Remove keeper tag before transferring, or inspect why it was replaced.';
        transferTaggedMons.push(m);
      } else if (low.includes('trade')) {
        category = 'trade_conflict';
        suggestion = 'Remove #trade tag — specimen is either already traded or assigned to a build.';
      }
      mismatches.push({
        id: m.uid,
        species: spLabel,
        cp: m.cp,
        iv: ivStr(m),
        verdict: m.verdict,
        category,
        issue: conflict,
        suggestion,
        search,
        tags: [...m.mon_tags],
      });
    }

    // Check inferior duplicate league tag when a better copy already holds BUILD_PVP
    if (m.verdict !== 'BUILD_PVP' && m.mon_tags.length > 0) {
      for (const t of m.mon_tags) {
        const tl = normStr(t);
        const cap =
          tl.includes('greatleague') || tl === 'great' || tl === 'gl'
            ? 1500
            : tl.includes('ultraleague') || tl === 'ultra' || tl === 'ul'
            ? 2500
            : null;
        if (cap) {
          const winner = heldPvpByDexCap.get(`${m.dex}|${cap}`);
          if (winner && winner.uid !== m.uid && !m.tag_conflicts.some((c) => c.includes(t))) {
            mismatches.push({
              id: m.uid,
              species: spLabel,
              cp: m.cp,
              iv: ivStr(m),
              verdict: m.verdict,
              category: 'duplicate_league',
              issue: `Tagged "${t}" but a better IV copy (CP ${winner.cp}, ${ivStr(winner)}) already holds BUILD_PVP`,
              suggestion: `Untag "${t}" in-game to avoid building an inferior duplicate.`,
              search,
              tags: [...m.mon_tags],
            });
          }
        }
      }
    }

    // Check untagged BUILD_* mons
    if (
      (m.verdict === 'BUILD_PVP' ||
        m.verdict === 'BUILD_MEGA' ||
        m.verdict === 'BUILD_RAID' ||
        m.verdict === 'BUILD_MAX') &&
      m.mon_tags.length === 0
    ) {
      untaggedBuilds++;
      untaggedBuildMons.push(m);
      const recTag = m.verdict === 'BUILD_PVP' ? 'PvP' : m.verdict.replace('BUILD_', '');
      if (mismatches.filter((x) => x.category === 'untagged_build').length < 60) {
        mismatches.push({
          id: m.uid,
          species: spLabel,
          cp: m.cp,
          iv: ivStr(m),
          verdict: m.verdict,
          category: 'untagged_build',
          issue: `${m.verdict} (${m.role}) has no in-game tag`,
          suggestion: `Tag this in-game under "${recTag}".`,
          search,
          tags: [],
          recommended_tag: recTag,
        });
      }
    }
  }

  const untaggedBuildQuery = buildSafeSearchChunks(untaggedBuildMons.slice(0, 60), mons, '')[0]?.query || '';
  const transferTaggedQuery = buildSafeSearchChunks(transferTaggedMons.slice(0, 60), mons, '')[0]?.query || '';

  return {
    total_mismatches: mismatches.length,
    wrong_cap_count: wrongCap,
    transfer_tagged_count: transferTagged,
    untagged_build_count: untaggedBuilds,
    mismatches: mismatches.slice(0, 200),
    untagged_build_search: untaggedBuildQuery,
    transfer_tagged_search: transferTaggedQuery,
  };
}

// ============================================================
// D:3 — COLLISION-PROOF POKEMON GO SEARCH CHUNKER (<1950 CHARS)
// Uses valid Pokemon GO precedence (`dex1,dex2&cp1,cp2&!guard`) where OR (`,`)
// binds tighter than AND (`&`), never `dex&cp,dex&cp` which breaks in-game!
// ============================================================
export function buildSafeSearchChunks(
  targetMons: MonModel[],
  allMons: MonModel[],
  safetyGuard: string,
  maxLen = 1950,
): { index: number; count: number; query: string; length: number }[] {
  if (targetMons.length === 0) return [];

  const targetIds = new Set(targetMons.map((m) => m.uid));
  const guardLow = safetyGuard.toLowerCase();
  const guardFiltersShiny = guardLow.includes('!shiny');
  const guardFiltersLucky = guardLow.includes('!lucky');
  const guardFiltersFav = guardLow.includes('!favorite');
  const guardFilters4Star = guardLow.includes('!4*');
  const guardFiltersXxl = guardLow.includes('!xxl');
  const guardFiltersXxs = guardLow.includes('!xxs');
  const guardFiltersDmax = guardLow.includes('!dynamax');
  const guardFiltersGmax = guardLow.includes('!gigantamax');
  const guardFiltersBg = guardLow.includes('!background');
  const guardFiltersShadow = guardLow.includes('!shadow');
  const guardFiltersPurified = guardLow.includes('!purified');

  // Non-target Pokemon that could still survive the safety guard
  const riskyNonTargets = allMons.filter((x) => {
    if (targetIds.has(x.uid)) return false;
    if (guardFiltersShiny && x.is_shiny) return false;
    if (guardFiltersLucky && x.is_lucky) return false;
    if (guardFiltersFav && x.is_favorite) return false;
    if (guardFilters4Star && x.a === 15 && x.d === 15 && x.s === 15) return false;
    if (guardFiltersXxl && x.raw.size === 5) return false;
    if (guardFiltersXxs && x.raw.size === 1) return false;
    if (guardFiltersDmax && x.is_dynamax) return false;
    if (guardFiltersGmax && x.is_gigantamax) return false;
    if (guardFiltersBg && Boolean(x.location_card)) return false;
    if (guardFiltersShadow && x.is_shadow) return false;
    if (guardFiltersPurified && x.is_purified) return false;
    return true;
  });

  // Index risky non-targets by dex -> Set<cp> for fast O(1) collision checks
  const riskByDex = new Map<number, Set<number>>();
  const riskByCp = new Map<number, Set<number>>();
  for (const x of riskyNonTargets) {
    let cps = riskByDex.get(x.dex);
    if (!cps) {
      cps = new Set<number>();
      riskByDex.set(x.dex, cps);
    }
    cps.add(x.cp);

    let dexs = riskByCp.get(x.cp);
    if (!dexs) {
      dexs = new Set<number>();
      riskByCp.set(x.cp, dexs);
    }
    dexs.add(x.dex);
  }

  // Filter out targets that individually collide on (dex, cp) with a risky non-target
  const safeTargets = targetMons.filter((m) => !(riskByDex.get(m.dex)?.has(m.cp)));
  if (safeTargets.length === 0) return [];

  // Sort by dex then cp so identical-dex targets group together cleanly
  const ordered = [...safeTargets].sort((a, b) => a.dex - b.dex || b.cp - a.cp);

  const chunks: { index: number; count: number; query: string; length: number }[] = [];
  let curDexes = new Set<number>();
  let curCps = new Set<number>();
  let curCount = 0;

  const formatQuery = (dexes: Set<number>, cps: Set<number>): string => {
    const dexPart = Array.from(dexes).join(',');
    const cpPart = Array.from(cps)
      .map((c) => `cp${c}`)
      .join(',');
    return safetyGuard ? `${safetyGuard}&${dexPart}&${cpPart}` : `${dexPart}&${cpPart}`;
  };

  const wouldCrossCollide = (newDex: number, newCp: number): boolean => {
    if (!curDexes.has(newDex)) {
      const riskyCpsForNewDex = riskByDex.get(newDex);
      if (riskyCpsForNewDex) {
        for (const c of curCps) {
          if (riskyCpsForNewDex.has(c)) return true;
        }
      }
    }
    if (!curCps.has(newCp)) {
      const riskyDexesForNewCp = riskByCp.get(newCp);
      if (riskyDexesForNewCp) {
        for (const d of curDexes) {
          if (riskyDexesForNewCp.has(d)) return true;
        }
      }
    }
    return false;
  };

  for (const m of ordered) {
    const nextDexes = new Set(curDexes);
    nextDexes.add(m.dex);
    const nextCps = new Set(curCps);
    nextCps.add(m.cp);
    const nextQuery = formatQuery(nextDexes, nextCps);

    if (
      curCount > 0 &&
      (nextQuery.length > maxLen || wouldCrossCollide(m.dex, m.cp))
    ) {
      const q = formatQuery(curDexes, curCps);
      chunks.push({
        index: chunks.length + 1,
        count: curCount,
        query: q,
        length: q.length,
      });
      curDexes = new Set([m.dex]);
      curCps = new Set([m.cp]);
      curCount = 1;
    } else {
      curDexes = nextDexes;
      curCps = nextCps;
      curCount++;
    }
  }

  if (curCount > 0) {
    const q = formatQuery(curDexes, curCps);
    chunks.push({
      index: chunks.length + 1,
      count: curCount,
      query: q,
      length: q.length,
    });
  }

  return chunks;
}

export function buildMassTransferChunks(
  transferMons: MonModel[],
  collisions: Record<string, unknown[]>,
  allMons?: MonModel[],
): { index: number; count: number; query: string; length: number }[] {
  if (transferMons.length === 0) return [];

  const SAFETY_GUARD =
    '!shiny&!lucky&!xxl&!xxs&!favorite&!4*&!dynamax&!gigantamax&!background&!#trade';
  const collisionKeys = new Set(Object.keys(collisions));

  const nonCollidingTransfers = transferMons.filter((m) => {
    const spLabel = m.species ? cleanSpeciesName(m.species.speciesName) : String(m.dex);
    return !collisionKeys.has(ingameSearch(m, spLabel));
  });

  if (allMons && allMons.length > 0) {
    return buildSafeSearchChunks(nonCollidingTransfers, allMons, SAFETY_GUARD, 1950);
  }

  // Fallback if caller did not pass full box: emit CP-only guard chunks
  const uniqueCps = Array.from(new Set(nonCollidingTransfers.map((m) => `cp${m.cp}`)));
  const maxBodyLen = 1950 - SAFETY_GUARD.length - 2;
  const chunks: { index: number; count: number; query: string; length: number }[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const cpTok of uniqueCps) {
    const add = cur.length === 0 ? cpTok.length : cpTok.length + 1;
    if (cur.length > 0 && len + add > maxBodyLen) {
      const query = `${SAFETY_GUARD}&${cur.join(',')}`;
      chunks.push({ index: chunks.length + 1, count: cur.length, query, length: query.length });
      cur = [cpTok];
      len = cpTok.length;
    } else {
      cur.push(cpTok);
      len += add;
    }
  }
  if (cur.length > 0) {
    const query = `${SAFETY_GUARD}&${cur.join(',')}`;
    chunks.push({ index: chunks.length + 1, count: cur.length, query, length: query.length });
  }
  return chunks;
}

// ============================================================
// C:5 — SILVER & GOLD BOTTLE CAP (HYPER TRAINING) PLANNER
// ============================================================
const UNTRADABLE_ONE_PER_ACCOUNT_DEX = new Set([
  151, // Mew
  251, // Celebi
  385, // Jirachi
  492, // Shaymin
  494, // Victini
  647, // Keldeo
  648, // Meloetta
  718, // Zygarde
  719, // Diancie
  720, // Hoopa
  721, // Volcanion
  802, // Marshadow
  893, // Zarude
]);

export function buildBottleCapRecommendations(
  mons: MonModel[],
  dex: Dex,
  bag: BagResources,
): BottleCapSummary {
  const silverRaw: BottleCapRecommendation[] = [];
  const goldRaw: BottleCapRecommendation[] = [];
  const shadowNotes: { score: number; item: BottleCapShadowNote }[] = [];

  // Precompute best non-shadow IV already owned per species (and per Dynamax/G-Max capability)
  const bestNormalByDex = new Map<number, number>();
  const bestMaxByDex = new Map<number, number>();
  for (const m of mons) {
    if (m.is_shadow || m.verdict === 'TRANSFER') continue;
    const prevN = bestNormalByDex.get(m.dex) ?? 0;
    if (m.iv_pct > prevN) bestNormalByDex.set(m.dex, m.iv_pct);
    if (m.is_dynamax || m.is_gigantamax) {
      const prevX = bestMaxByDex.get(m.dex) ?? 0;
      if (m.iv_pct > prevX) bestMaxByDex.set(m.dex, m.iv_pct);
    }
  }

  for (const m of mons) {
    if (!m.species) continue;
    // Already a 4* 100% Hundo -> Hyper Training disabled
    if (m.a === 15 && m.d === 15 && m.s === 15) continue;
    // Exclude confirmed transfers and mons queued for trade (IVs reroll on trade)
    if (m.verdict === 'TRANSFER' || m.verdict === 'TRADE') continue;

    const tags = new Set(m.species.tags || []);
    const isMeltanLine = m.dex === 808 || m.dex === 809;
    const isMythical = (tags.has('mythical') && !isMeltanLine) || UNTRADABLE_ONE_PER_ACCOUNT_DEX.has(m.dex);
    const isLegendary = tags.has('legendary') || tags.has('ultrabeast');
    const isSpecialVariant =
      isMythical ||
      isLegendary ||
      m.is_shiny ||
      Boolean(m.location_card) ||
      m.is_gigantamax ||
      m.is_dynamax ||
      m.has_mega_unlocked;

    // Never recommend Bottle Capping an unremarkable REVIEW wild catch
    if (OUT_OF_PLAY.has(m.verdict) && !isSpecialVariant) continue;

    const baseSid = m.species.speciesId.replace(/_shadow$/, '');
    const desc = dex.descendants(baseSid);
    if (desc.length === 0) desc.push(baseSid);

    // Evaluate highest family ceiling across Master League, Raids, Megas, and Max Battles
    let bestMlRank: number | null = null;
    let bestMlSid: string | null = null;
    let bestRaidRank: number | null = null;
    let bestRaidType = '';
    let bestRaidSid: string | null = null;
    let bestMegaRank: number | null = null;
    let bestMegaType = '';
    let bestMegaBaseSid: string | null = null;
    let bestMaxRank: number | null = null;
    let bestMaxType = '';

    for (const sid of desc) {
      const ml = dex.rankOf(sid, 10000, false);
      if (ml && (bestMlRank === null || ml[0] < bestMlRank)) {
        bestMlRank = ml[0];
        bestMlSid = sid;
      }
      for (const rt of RAID_USEFUL_TYPES) {
        const rp = dex.raidPos.get(rt)?.get(sid);
        if (rp && (bestRaidRank === null || rp[0] < bestRaidRank)) {
          bestRaidRank = rp[0];
          bestRaidType = rt;
          bestRaidSid = sid;
        }
      }
      const megas = dex.megaBases.get(sid) || [];
      for (const msid of megas) {
        for (const mt of RAID_USEFUL_TYPES) {
          const mp = dex.megaPos.get(mt)?.get(msid);
          if (mp && (bestMegaRank === null || mp[0] < bestMegaRank)) {
            bestMegaRank = mp[0];
            bestMegaType = mt;
            bestMegaBaseSid = sid;
          }
        }
      }
      if (m.is_dynamax || m.is_gigantamax) {
        for (const xt of MAX_BATTLE_TYPES) {
          const xp = dex.maxPos.get(xt)?.get(sid);
          if (xp && (bestMaxRank === null || xp[0] < bestMaxRank)) {
            bestMaxRank = xp[0];
            bestMaxType = xt;
          }
        }
      }
    }

    // Target species (if pre-evolution, evaluate CP & ceiling at final meta evolution)
    const evoSid = (m.evolve_to_sid || '').replace(/_shadow$/, '');
    const targetSid =
      (evoSid && dex.byId.has(evoSid) ? evoSid : null) ||
      bestMlSid ||
      bestMegaBaseSid ||
      bestRaidSid ||
      desc[desc.length - 1] ||
      baseSid;
    const targetSp = dex.byId.get(targetSid) || m.species;
    const spLabel = displaySpecies(m);
    const targetName = targetSid === baseSid ? spLabel : cleanSpeciesName(targetSp.speciesName);

    // Shadow Pokémon cannot be Hyper Trained directly — surface educational purify notes for top Shadows
    if (m.is_shadow) {
      const isTopShadow =
        (bestMlRank !== null && bestMlRank <= 30) ||
        (bestRaidRank !== null && bestRaidRank <= 12) ||
        (bestMegaRank !== null && bestMegaRank <= 10);
      if (isTopShadow && m.purify_preview) {
        const shScore =
          (bestRaidRank !== null && bestRaidRank <= 5 ? 40 : 20) +
          (m.is_shiny ? 15 : 0) +
          (m.purify_preview.becomes_hundo ? 25 : 0) +
          m.iv_pct * 0.2;
        shadowNotes.push({
          score: shScore,
          item: {
            id: m.uid,
            species: spLabel,
            iv: ivStr(m),
            purified_iv: m.purify_preview.purified_iv,
            purified_hundo: m.purify_preview.becomes_hundo,
            note: m.purify_preview.becomes_hundo
              ? `Shadow cannot use Bottle Caps — Purifying already grants 15/15/15 (4★), though you permanently lose the +20% Shadow Raid DPS bonus.`
              : `Shadow cannot use Bottle Caps directly. Purifying turns it into ${m.purify_preview.purified_iv} (+2/+2/+2) and unlocks Hyper Training, but loses the +20% Shadow Raid DPS bonus.`,
            search: ingameSearch(m, m.species.speciesName),
          },
        });
      }
      continue;
    }

    // PvP League Cap trap check (Great League / Ultra League / Little Cup)
    const isLowCapPvpSpecialist =
      m.verdict === 'BUILD_PVP' && m.best_pvp !== null && m.best_pvp.cap < 10000;
    const hasHighEndValue =
      (bestMlRank !== null && bestMlRank <= 60) ||
      (bestRaidRank !== null && bestRaidRank <= 15) ||
      (bestMegaRank !== null && bestMegaRank <= 10);
    if (isLowCapPvpSpecialist && !hasHighEndValue && !m.is_shiny) {
      continue;
    }

    const roles: string[] = [];
    if (bestMlRank !== null && bestMlRank <= 150) roles.push(`Master #${bestMlRank}`);
    if (bestRaidRank !== null && bestRaidRank <= 30) {
      const tCap = bestRaidType ? bestRaidType[0].toUpperCase() + bestRaidType.slice(1) : 'Raid';
      roles.push(`${tCap} #${bestRaidRank} Raid`);
    }
    if (bestMegaRank !== null && bestMegaRank <= 15) {
      const mCap = bestMegaType ? bestMegaType[0].toUpperCase() + bestMegaType.slice(1) : 'Mega';
      roles.push(`Mega #${bestMegaRank} ${mCap}`);
    } else if (m.has_mega_unlocked || m.is_mega_capable || m.is_mega_pre_evo) {
      roles.push(m.has_mega_unlocked ? `Mega Lv${Math.max(1, m.mega_level)}` : 'Mega-Capable');
    }
    if (m.is_gigantamax) roles.push('Gigantamax');
    else if (m.is_dynamax && bestMaxRank !== null && bestMaxRank <= 30) {
      const xCap = bestMaxType ? bestMaxType[0].toUpperCase() + bestMaxType.slice(1) : 'Max';
      roles.push(`D-Max #${bestMaxRank} ${xCap}`);
    } else if (m.is_dynamax) {
      roles.push('Dynamax');
    }

    const rarity_tags: string[] = [];
    if (isMythical) rarity_tags.push('Mythical');
    else if (tags.has('ultrabeast')) rarity_tags.push('Ultra Beast');
    else if (tags.has('legendary')) rarity_tags.push('Legendary');
    if (m.is_shiny) rarity_tags.push('Shiny');
    if (m.is_lucky) rarity_tags.push('Lucky');
    if (m.location_card) rarity_tags.push('Background');
    if (m.is_traded && !m.is_lucky) rarity_tags.push('Traded');
    if (m.is_purified) rarity_tags.push('Purified');

    // Duplicate check: do we already own a 98-100% copy of this exact tier (Max vs standard)?
    const relevantBestPct =
      m.is_dynamax || m.is_gigantamax
        ? Math.max(bestMaxByDex.get(m.dex) ?? 0, bestMaxByDex.get(targetSp.dex) ?? 0)
        : Math.max(bestNormalByDex.get(m.dex) ?? 0, bestNormalByDex.get(targetSp.dex) ?? 0);
    const alreadyHasSuperiorCopy =
      relevantBestPct >= 97.5 &&
      m.iv_pct < relevantBestPct &&
      !isMythical &&
      !m.is_shiny &&
      !m.location_card &&
      !m.is_gigantamax;
    const dupPenalty = alreadyHasSuperiorCopy ? -20 : 0;

    // Compute Meta Ceiling Score (0..58)
    let metaScore = 0;
    if (bestMlRank !== null) {
      if (bestMlRank <= 10) metaScore += 32;
      else if (bestMlRank <= 25) metaScore += 26;
      else if (bestMlRank <= 50) metaScore += 20;
      else if (bestMlRank <= 100) metaScore += 13;
      else if (bestMlRank <= 160) metaScore += 6;
    }
    if (bestRaidRank !== null) {
      if (bestRaidRank <= 3) metaScore += 24;
      else if (bestRaidRank <= 8) metaScore += 18;
      else if (bestRaidRank <= 20) metaScore += 12;
      else if (bestRaidRank <= 35) metaScore += 6;
    }
    if (bestMegaRank !== null) {
      if (bestMegaRank <= 3) metaScore += 20;
      else if (bestMegaRank <= 8) metaScore += 14;
      else if (bestMegaRank <= 15) metaScore += 8;
    }
    if (m.is_gigantamax) metaScore += 16;
    else if (m.is_dynamax && bestMaxRank !== null) {
      if (bestMaxRank <= 8) metaScore += 14;
      else if (bestMaxRank <= 20) metaScore += 8;
    }
    metaScore = Math.min(58, metaScore);

    // Base rarity score
    let rarityGold = 0;
    let raritySilver = 0;
    if (isMythical) {
      rarityGold += 26;
      raritySilver += 14;
    } else if (isLegendary) {
      rarityGold += 14;
      raritySilver += 8;
    }
    if (m.is_shiny) {
      rarityGold += 12;
      raritySilver += 10;
    }
    if (m.location_card) {
      rarityGold += 5;
      raritySilver += 4;
    }
    if (m.is_lucky || m.is_traded) {
      rarityGold += 4;
      raritySilver += 3;
    }
    if (m.has_mega_unlocked && m.mega_level >= 2) {
      rarityGold += 3;
      raritySilver += 3;
    }
    // Common farmable wild non-shiny/non-legendary/non-GMax penalty for Gold Caps
    const commonGoldPenalty =
      !isMythical && !isLegendary && !m.is_shiny && !m.location_card && !m.is_gigantamax ? -14 : 0;

    const pvpGuardPenalty = isLowCapPvpSpecialist ? -42 : 0;
    const statsBelow15 = (m.a < 15 ? 1 : 0) + (m.d < 15 ? 1 : 0) + (m.s < 15 ? 1 : 0);
    const totalIvMissing = 45 - (m.a + m.d + m.s);
    const cpL50Before = computeCp(targetSp.baseStats, m.a, m.d, m.s, 50);
    const cpL50Hundo = computeCp(targetSp.baseStats, 15, 15, 15, 50);
    const search = ingameSearch(m, m.species.speciesName);

    const commonWarnings: string[] = [];
    if (isLowCapPvpSpecialist && m.best_pvp) {
      commonWarnings.push(
        `Built for ${m.best_pvp.league} (${m.best_pvp.cap} CP) — raising IVs can lower GL/UL stat product or push CP over cap.`,
      );
    }
    if (alreadyHasSuperiorCopy) {
      commonWarnings.push(
        `You already own a ${relevantBestPct}% non-Shadow copy of this species — only invest if building a backup or Mega/Max duplicate.`,
      );
    }

    // ----------------------------------------------------------
    // SILVER BOTTLE CAP (1 selected stat -> 15)
    // ----------------------------------------------------------
    let sStat: 'ATK' | 'DEF' | 'HP' = 'ATK';
    let sBeforeVal = m.a;
    if (statsBelow15 === 1) {
      if (m.a < 15) {
        sStat = 'ATK';
        sBeforeVal = m.a;
      } else if (m.d < 15) {
        sStat = 'DEF';
        sBeforeVal = m.d;
      } else {
        sStat = 'HP';
        sBeforeVal = m.s;
      }
    } else {
      // Multi-stat deficit: prioritize raising ATK to 15 (CMP ties & Raid DPS), else biggest DEF/HP gap
      if (m.a < 15) {
        sStat = 'ATK';
        sBeforeVal = m.a;
      } else if (15 - m.d >= 15 - m.s) {
        sStat = 'DEF';
        sBeforeVal = m.d;
      } else {
        sStat = 'HP';
        sBeforeVal = m.s;
      }
    }

    const sNewA = sStat === 'ATK' ? 15 : m.a;
    const sNewD = sStat === 'DEF' ? 15 : m.d;
    const sNewS = sStat === 'HP' ? 15 : m.s;
    const sBecomesHundo = sNewA === 15 && sNewD === 15 && sNewS === 15;
    const sGain = 15 - sBeforeVal;
    const sAfterIv = `${sNewA}/${sNewD}/${sNewS}`;
    const sAfterPct = Math.round(((100 * (sNewA + sNewD + sNewS)) / 45) * 10) / 10;
    const cpL50AfterSilver = computeCp(targetSp.baseStats, sNewA, sNewD, sNewS, 50);

    let silverScore = metaScore + raritySilver + pvpGuardPenalty + dupPenalty;
    if (sBecomesHundo) {
      silverScore += 22;
      if (m.is_shiny) silverScore += 5; // Shundo completion!
    } else {
      // Penalize multi-stat gaps so 1-stat-from-Hundo candidates cleanly lead Silver picks
      silverScore -= 16;
    }
    if (sStat === 'ATK' && sGain > 0 && ((bestMlRank !== null && bestMlRank <= 100) || (bestRaidRank !== null && bestRaidRank <= 20))) {
      silverScore += 8 + Math.min(4, sGain);
    } else if (sBecomesHundo) {
      silverScore += Math.min(4, sGain);
    }

    silverScore = Math.max(0, Math.min(100, Math.round(silverScore)));

    if (silverScore >= 36 && (metaScore > 0 || isMythical || (sBecomesHundo && m.is_shiny))) {
      const reasons: string[] = [];
      if (sBecomesHundo) {
        reasons.push(
          m.is_shiny
            ? `${sGain} IV point${sGain === 1 ? '' : 's'} away from a 100% Shundo (${sStat} ${sBeforeVal} → 15).`
            : `${sGain} IV point${sGain === 1 ? '' : 's'} away from a 100% Hundo (${sStat} ${sBeforeVal} → 15).`,
        );
      } else {
        reasons.push(`Raises ${sStat} from ${sBeforeVal} to 15 (save a Gold Cap if you want all 3 stats at 15).`);
      }
      if (sStat === 'ATK' && ((bestMlRank !== null && bestMlRank <= 100) || (bestRaidRank !== null && bestRaidRank <= 25))) {
        reasons.push('Hits 15 ATK for Master League CMP ties and max Raid DPS.');
      } else if (bestMlRank !== null && bestMlRank <= 60) {
        reasons.push(`Top Master League meta (#${bestMlRank}) benefits directly from maxed stats.`);
      }
      if (isMythical) {
        reasons.push('One-per-account Mythical — cannot be raided or Lucky Traded.');
      } else if (targetSid !== baseSid) {
        reasons.push(`Value assumes evolving to ${targetName}.`);
      }

      const warnings = [...commonWarnings];
      if (!sBecomesHundo) {
        warnings.push(`${statsBelow15} stats below 15 — leaves IV at ${sAfterIv} (${sAfterPct}%).`);
      }

      silverRaw.push({
        id: m.uid,
        species: spLabel,
        target_species: targetName,
        cp: m.cp,
        level: Math.round(m.level * 10) / 10,
        current_iv: ivStr(m),
        current_iv_pct: m.iv_pct,
        after_iv: sAfterIv,
        after_iv_pct: sAfterPct,
        points_gained: sGain,
        target_stat: sStat,
        target_stat_label: `${sStat} ${sBeforeVal} → 15`,
        becomes_hundo: sBecomesHundo,
        cp_l50_before: cpL50Before,
        cp_l50_after: cpL50AfterSilver,
        score: silverScore,
        tier: silverScore >= 74 ? 'S' : silverScore >= 54 ? 'A' : 'B',
        roles,
        rarity_tags,
        reasons,
        warnings,
        search,
        verdict: m.verdict,
      });
    }

    // ----------------------------------------------------------
    // GOLD BOTTLE CAP (All 3 stats -> 15/15/15 Hundo)
    // ----------------------------------------------------------
    if (statsBelow15 >= 2) {
      let goldScore = metaScore + rarityGold + pvpGuardPenalty + dupPenalty + commonGoldPenalty;
      if (totalIvMissing >= 10) goldScore += 14;
      else if (totalIvMissing >= 6) goldScore += 11;
      else if (totalIvMissing >= 3) goldScore += 7;
      else goldScore += 4;

      if (m.a < 15 && ((bestMlRank !== null && bestMlRank <= 80) || (bestRaidRank !== null && bestRaidRank <= 20))) {
        goldScore += 6;
      }

      goldScore = Math.max(0, Math.min(100, Math.round(goldScore)));

      if (goldScore >= 36 && (metaScore > 0 || isMythical || (isLegendary && m.is_shiny))) {
        const reasons: string[] = [];
        if (isMythical) {
          reasons.push(
            `One-per-account Mythical (+${totalIvMissing} total IVs straight to 100% Hundo) — cannot be farmed in raids or traded.`,
          );
        } else if (isLegendary && m.is_shiny) {
          reasons.push(
            `Turns your Shiny ${m.species.tags?.includes('ultrabeast') ? 'Ultra Beast' : 'Legendary'} (+${totalIvMissing} IVs) into a guaranteed 100% Shundo.`,
          );
        } else {
          reasons.push(`Fixes all ${statsBelow15} lower stats (+${totalIvMissing} total IVs) into a 15/15/15 Hundo.`);
        }
        if (bestMlRank !== null && bestMlRank <= 50) {
          reasons.push(`Master League #${bestMlRank} unlocks full bulk + 15 ATK CMP ceiling.`);
        } else if (bestMegaRank !== null && bestMegaRank <= 8) {
          reasons.push(`Mega #${bestMegaRank} ${bestMegaType} powerhouse worth a permanent 4★ investment.`);
        } else if (bestRaidRank !== null && bestRaidRank <= 12) {
          reasons.push(`Top-tier ${bestRaidType} raid attacker (#${bestRaidRank}).`);
        }
        if (targetSid !== baseSid) {
          reasons.push(`Value assumes evolving to ${targetName}.`);
        }

        const warnings = [...commonWarnings];
        if (totalIvMissing <= 2) {
          warnings.push('Only +2 IV gain — consider saving Gold Cap for a lower-IV Mythical or Shiny Legendary.');
        }

        goldRaw.push({
          id: m.uid,
          species: spLabel,
          target_species: targetName,
          cp: m.cp,
          level: Math.round(m.level * 10) / 10,
          current_iv: ivStr(m),
          current_iv_pct: m.iv_pct,
          after_iv: '15/15/15',
          after_iv_pct: 100,
          points_gained: totalIvMissing,
          target_stat: 'ALL',
          target_stat_label: `ALL +${totalIvMissing} → 15/15/15`,
          becomes_hundo: true,
          cp_l50_before: cpL50Before,
          cp_l50_after: cpL50Hundo,
          score: goldScore,
          tier: goldScore >= 74 ? 'S' : goldScore >= 56 ? 'A' : 'B',
          roles,
          rarity_tags,
          reasons,
          warnings,
          search,
          verdict: m.verdict,
        });
      }
    }
  }

  silverRaw.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.becomes_hundo) - Number(a.becomes_hundo) ||
      (b.cp_l50_after || 0) - (a.cp_l50_after || 0),
  );
  goldRaw.sort(
    (a, b) =>
      b.score - a.score ||
      b.points_gained - a.points_gained ||
      (b.cp_l50_after || 0) - (a.cp_l50_after || 0),
  );
  shadowNotes.sort((a, b) => b.score - a.score);

  return {
    silver_in_bag: bag.silver_bottle_caps,
    gold_in_bag: bag.gold_bottle_caps,
    silver: silverRaw.slice(0, 25),
    gold: goldRaw.slice(0, 25),
    shadow_purify_notes: shadowNotes.slice(0, 6).map((x) => x.item),
  };
}
