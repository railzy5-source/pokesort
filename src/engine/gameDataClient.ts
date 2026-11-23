import { META_GROUP_FILE, BASE_CUPS } from './defaultConfig';
import { buildOfflineFallbackData } from './offlineFallback';
import type {
  AnalysisProgress,
  PveMoveRecord,
  PvPokeMove,
  PvPokeRankingEntry,
  PvPokeSpecies,
  RemoteGameData,
  ScrapedEvent,
  ScrapedRaid,
  SizeTableRecord,
} from './types';

const PVPOKE_BASE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data';
const PVE_URL = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json';
const EVENTS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
const RAIDS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json';

const DB_NAME = 'pogo-sorter-cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

const MAX_AGE_MS = 7 * 86400 * 1000;
const FEED_AGE_MS = 3 * 3600 * 1000;

interface CacheEntry<T = unknown> {
  key: string;
  ts: number;
  data: T;
}

export interface CacheSummary {
  hasPvPoke: boolean;
  hasPveAndSize: boolean;
  hasEvents: boolean;
  oldestAgeDays: number | null;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<CacheEntry<T> | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry<T>) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, data: T): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, ts: Date.now(), data } satisfies CacheEntry<T>);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearRemoteCache(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function inspectCacheStatus(): Promise<CacheSummary> {
  const gm = await idbGet('pvpoke:gamemaster.json');
  const pve = await idbGet('pokeminers:pve_and_sizes_v4');
  const ev = await idbGet('scrapedduck:events');
  const ageDays = gm ? Number(((Date.now() - gm.ts) / 86400000).toFixed(1)) : null;
  return {
    hasPvPoke: Boolean(gm),
    hasPveAndSize: Boolean(pve),
    hasEvents: Boolean(ev),
    oldestAgeDays: ageDays,
  };
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 25000): Promise<T> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function rankingRows(payload: unknown): PvPokeRankingEntry[] {
  if (Array.isArray(payload)) {
    if (payload.length > 0 && Array.isArray(payload[0])) {
      return payload[0] as PvPokeRankingEntry[];
    }
    return payload as PvPokeRankingEntry[];
  }
  return [];
}

async function getPvPokeCached<T>(
  rel: string,
  refresh: boolean,
  offlineOnly: boolean,
): Promise<{ data: T | null; ageDays: number; fromNet: boolean }> {
  const key = `pvpoke:${rel}`;
  const cached = await idbGet<T>(key);
  const now = Date.now();
  const isFresh = cached && now - cached.ts <= MAX_AGE_MS;

  if (!refresh && isFresh && cached) {
    return { data: cached.data, ageDays: (now - cached.ts) / 86400000, fromNet: false };
  }
  if (offlineOnly) {
    return cached
      ? { data: cached.data, ageDays: (now - cached.ts) / 86400000, fromNet: false }
      : { data: null, ageDays: 0, fromNet: false };
  }

  try {
    const data = await fetchJsonWithTimeout<T>(`${PVPOKE_BASE}/${rel}`, 25000);
    await idbSet(key, data);
    return { data, ageDays: 0, fromNet: true };
  } catch {
    if (cached) {
      return { data: cached.data, ageDays: (now - cached.ts) / 86400000, fromNet: false };
    }
    return { data: null, ageDays: 0, fromNet: false };
  }
}


// ---- Evolution costs straight from the game master ----
const FORM_SUFFIX: Record<string, string> = { ALOLA: 'alolan', GALARIAN: 'galarian', HISUIAN: 'hisuian', PALDEA: 'paldean', NORMAL: '' };
function evoSid(pokemonId: unknown, form: unknown): string {
  const id = String(pokemonId || '').toUpperCase();
  if (!id) return '';
  const f = String(form || '').toUpperCase();
  let suffix = '';
  if (f.startsWith(`${id}_`)) {
    const tail = f.slice(id.length + 1);
    suffix = tail in FORM_SUFFIX ? FORM_SUFFIX[tail] : tail.toLowerCase();
  }
  return suffix ? `${id.toLowerCase()}_${suffix}` : id.toLowerCase();
}
const ITEM_NAMES: Record<string, string> = {
  ITEM_SUN_STONE: 'Sun Stone',
  ITEM_KINGS_ROCK: "King's Rock",
  ITEM_METAL_COAT: 'Metal Coat',
  ITEM_DRAGON_SCALE: 'Dragon Scale',
  ITEM_UP_GRADE: 'Up-Grade',
  ITEM_GEN4_EVOLUTION_STONE: 'Sinnoh Stone',
  ITEM_GEN5_EVOLUTION_STONE: 'Unova Stone',
};
function prettyItem(raw: string): string {
  if (ITEM_NAMES[raw]) return ITEM_NAMES[raw];
  const lure = /^ITEM_TROY_DISK_?(.*)$/.exec(raw);
  if (lure) return `${lure[1] ? lure[1][0] + lure[1].slice(1).toLowerCase() + ' ' : ''}Lure`.trim();
  return raw
    .replace(/^ITEM_/, '')
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
/** Short human text for what an evolution needs besides candy (null = nothing). */
export function describeEvolutionBranch(b: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof b.evolutionItemRequirement === 'string' && b.evolutionItemRequirement) parts.push(prettyItem(b.evolutionItemRequirement));
  if (typeof b.lureItemRequirement === 'string' && b.lureItemRequirement) parts.push(prettyItem(b.lureItemRequirement));
  const km = Number(b.kmBuddyDistanceRequirement || 0);
  if (km > 0) parts.push(`walk ${km} km as buddy`);
  if (b.mustBeBuddy === true && km <= 0) parts.push('must be your buddy');
  if (b.onlyDaytime === true) parts.push('daytime');
  if (b.onlyNighttime === true) parts.push('night');
  if (typeof b.genderRequirement === 'string' && b.genderRequirement) parts.push(b.genderRequirement.toLowerCase());
  return parts.length ? parts.join(' + ') : null;
}
/** Reads every evolution (candy cost + extra requirement) of one pokemonSettings block into `out`. */
export function collectEvolutionCosts(
  ps: Record<string, unknown>,
  out: Record<string, { c: number; i: string | null }>,
): void {
  const branches = ps.evolutionBranch;
  if (!Array.isArray(branches)) return;
  const from = evoSid(ps.pokemonId, ps.form);
  if (!from) return;
  for (const raw of branches) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    const to = evoSid(b.evolution, b.form);
    const cost = Number(b.candyCost || 0);
    if (!to || !(cost > 0)) continue;
    out[`${from}|${to}`] = { c: cost, i: describeEvolutionBranch(b) };
  }
}


// ---- Which Mega forms really exist in the game, straight from the game master ----
const TEMP_EVO_NAMES: Record<string, string> = {
  TEMP_EVOLUTION_MEGA: 'mega',
  TEMP_EVOLUTION_MEGA_X: 'mega_x',
  TEMP_EVOLUTION_MEGA_Y: 'mega_y',
  TEMP_EVOLUTION_MEGA_Z: 'mega_z',
  TEMP_EVOLUTION_PRIMAL: 'primal',
};
/** Adds e.g. 'charizard_mega_x' for every temporary evolution declared on one pokemonSettings block. */
export function collectMegaForms(ps: Record<string, unknown>, out: Set<string>): void {
  const list = ps.tempEvoOverrides;
  if (!Array.isArray(list)) return;
  const base = evoSid(ps.pokemonId, ps.form);
  if (!base) return;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const suffix = TEMP_EVO_NAMES[String((raw as Record<string, unknown>).tempEvoId || '')];
    if (suffix) out.add(`${base}_${suffix}`);
  }
}

function shrinkPokeMinersMaster(raw: unknown[]): {
  megaForms: string[];
  evolveCosts: Record<string, { c: number; i: string | null }>;
  pveMoves: Record<string, PveMoveRecord>;
  pvpBuffs: Record<string, { buffs: number[]; buffTarget: string; buffApplyChance: number }>;
  showcaseSizes: Record<string, SizeTableRecord>;
} {
  const pveMoves: Record<string, PveMoveRecord> = {};
  const pvpBuffs: Record<string, { buffs: number[]; buffTarget: string; buffApplyChance: number }> = {};
  const avg = new Map<string, [number, number]>();
  const evolveCosts: Record<string, { c: number; i: string | null }> = {};
  const megaFormSet = new Set<string>();
  const xxl = new Map<string, number>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as { templateId?: string; data?: Record<string, unknown> };
    const tid = String(t.templateId || '');
    const data = t.data || {};

    const mm = /^V(\d{4,5})_MOVE_(.+)$/.exec(tid);
    const ms = data.moveSettings as Record<string, unknown> | undefined;
    if (mm && ms) {
      const name = typeof ms.movementId === 'string' ? ms.movementId : mm[2];
      pveMoves[name] = {
        id: Number(mm[1]),
        p: Number(ms.power || 0),
        d: Number(ms.durationMs || 0),
        e: Number(ms.energyDelta || 0),
        t: String(ms.pokemonType || '').replace('POKEMON_TYPE_', '').toLowerCase(),
      };
    }

    const cmMatch = /^COMBAT_V(\d{4,5})_MOVE_(.+)$/.exec(tid);
    const cm = data.combatMove as Record<string, unknown> | undefined;
    if (cmMatch && cm) {
      const uid = typeof cm.uniqueId === 'string' ? cm.uniqueId : cmMatch[2];
      // Backfill pveMoves map for modern/combat-only move IDs if moveSettings wasn't present yet
      if (!pveMoves[uid]) {
        pveMoves[uid] = {
          id: Number(cmMatch[1]),
          p: Number(cm.power || 0),
          d: Math.max(500, (Number(cm.durationTurns || 0) + 1) * 500),
          e: Number(cm.energyDelta || 0),
          t: String(cm.type || '').replace('POKEMON_TYPE_', '').toLowerCase(),
        };
      }
      const buffs = cm.buffs as Record<string, unknown> | undefined;
      if (buffs) {
        const atkAtt = Number(buffs.attackerAttackStatStageChange || 0);
        const defAtt = Number(buffs.attackerDefenseStatStageChange || 0);
        const atkTgt = Number(buffs.targetAttackStatStageChange || 0);
        const defTgt = Number(buffs.targetDefenseStatStageChange || 0);
        const chance = Number(buffs.buffActivationChance || 0);
        const baseId = uid.endsWith('_FAST') ? uid.slice(0, -5) : uid;
        if (atkAtt || defAtt) {
          pvpBuffs[baseId] = {
            buffs: [atkAtt, defAtt],
            buffTarget: atkTgt || defTgt ? 'both' : 'self',
            buffApplyChance: chance || 1,
          };
        } else if (atkTgt || defTgt) {
          pvpBuffs[baseId] = {
            buffs: [atkTgt, defTgt],
            buffTarget: 'opponent',
            buffApplyChance: chance || 1,
          };
        }
      }
    }

    const ps = data.pokemonSettings as Record<string, unknown> | undefined;
    if (ps) {
      collectEvolutionCosts(ps, evolveCosts);
      collectMegaForms(ps, megaFormSet);
    }
    if (ps && ps.pokedexHeightM !== undefined) {
      let key = String(ps.form || ps.pokemonId || '');
      if (!key && tid.startsWith('V') && tid.includes('_POKEMON_')) {
        key = tid.split('_POKEMON_', 2)[1];
      }
      if (key) {
        avg.set(key, [Number(ps.pokedexHeightM), Number(ps.pokedexWeightKg || 0)]);
      }
    }

    const pes = data.pokemonExtendedSettings as Record<string, unknown> | undefined;
    const ss = pes?.sizeSettings as Record<string, unknown> | undefined;
    if (pes && ss && ss.xxlUpperBound) {
      const uid = String(pes.form || pes.uniqueId || '');
      if (uid) xxl.set(uid, Number(ss.xxlUpperBound));
    }
  }

  const showcaseSizes: Record<string, SizeTableRecord> = {};
  for (const [key, [h, w]] of avg.entries()) {
    if (h <= 0) continue;
    let bound = xxl.get(key);
    if (bound === undefined && key.includes('_')) {
      bound = xxl.get(key.split('_', 1)[0]);
    }
    let k = 1.75;
    if (bound !== undefined) {
      k = bound / h;
      for (const cand of [1.55, 1.75, 2.0]) {
        if (Math.abs(k - cand) < 0.08) {
          k = cand;
          break;
        }
      }
    }
    showcaseSizes[key] = {
      avg_h: h,
      avg_w: w,
      k: Math.round(k * 10000) / 10000,
      xxl_h: Math.round(h * k * 10000) / 10000,
    };
  }

  return { pveMoves, pvpBuffs, showcaseSizes, evolveCosts, megaForms: Array.from(megaFormSet) };
}

export async function loadRemoteGameData(opts: {
  caps: number[];
  cupKeys: string[];
  refresh?: boolean;
  offlineOnly?: boolean;
  onProgress?: (p: AnalysisProgress) => void;
}): Promise<RemoteGameData> {
  const { caps, cupKeys, refresh = false, offlineOnly = false, onProgress } = opts;
  const fallback = buildOfflineFallbackData();

  if (offlineOnly && !refresh) {
    const cachedCheck = await idbGet('pvpoke:gamemaster.json');
    if (!cachedCheck) {
      onProgress?.({ stage: 'Using built-in Pokédex snapshot (offline)...', pct: 35 });
      return fallback;
    }
  }

  onProgress?.({ stage: 'Loading PvPoke gamemaster & league rankings...', pct: 12 });

  const gmRes = await getPvPokeCached<{
    timestamp?: string;
    pokemon: PvPokeSpecies[];
    moves: PvPokeMove[];
  }>('gamemaster.json', refresh, offlineOnly);

  if (!gmRes.data || !Array.isArray(gmRes.data.pokemon)) {
    onProgress?.({ stage: 'PvPoke unavailable — using built-in Pokédex snapshot...', pct: 35 });
    return fallback;
  }

  const ranks: Record<number, PvPokeRankingEntry[]> = {};
  const groups: Record<number, PvPokeRankingEntry[]> = {};

  for (const cap of caps) {
    const rRes = await getPvPokeCached<unknown>(
      `rankings/all/overall/rankings-${cap}.json`,
      refresh,
      offlineOnly,
    );
    const rows = rankingRows(rRes.data);
    ranks[cap] = rows.length
      ? rows.sort((a, b) => (b.score ?? b.rating ?? 0) - (a.score ?? a.rating ?? 0))
      : fallback.ranks[cap] || [];

    const groupName = META_GROUP_FILE[cap];
    const gRes = await getPvPokeCached<unknown>(`groups/${groupName}.json`, refresh, offlineOnly);
    groups[cap] = rankingRows(gRes.data);
  }

  onProgress?.({ stage: 'Loading active cup rankings...', pct: 25 });
  const cupRanks: Record<string, PvPokeRankingEntry[]> = {};
  const cupGroups: Record<string, PvPokeRankingEntry[]> = {};
  for (const ck of cupKeys) {
    const spec = BASE_CUPS[ck];
    if (!spec) continue;
    const rc = await getPvPokeCached<unknown>(
      `rankings/${spec.file}/overall/rankings-${spec.cap}.json`,
      refresh,
      offlineOnly,
    );
    const rRows = rankingRows(rc.data);
    if (rRows.length) {
      cupRanks[ck] = rRows.sort((a, b) => (b.score ?? b.rating ?? 0) - (a.score ?? a.rating ?? 0));
    } else if (fallback.cupRanks[ck]) {
      cupRanks[ck] = fallback.cupRanks[ck];
    }

    const gc = await getPvPokeCached<unknown>(`groups/${spec.file}.json`, refresh, offlineOnly);
    const gRows = rankingRows(gc.data);
    if (gRows.length) cupGroups[ck] = gRows;
  }

  // PokeMiners PvE moves + PvP combat buffs + Showcase size table (shrunk & cached)
  onProgress?.({ stage: 'Loading PokeMiners PvE move & showcase tables...', pct: 38 });
  let pveMoves = fallback.pveMoves;
  let pvpBuffs: Record<string, { buffs: number[]; buffTarget: string; buffApplyChance: number }> = {};
  let showcaseSizes = fallback.showcaseSizes;
  let evolveCosts: Record<string, { c: number; i: string | null }> | undefined;
  let megaForms: string[] | undefined;
  let pveOk = false;
  let sizeOk = false;

  const pveCache = await idbGet<{
    pveMoves: Record<string, PveMoveRecord>;
    pvpBuffs?: Record<string, { buffs: number[]; buffTarget: string; buffApplyChance: number }>;
    showcaseSizes: Record<string, SizeTableRecord>;
    evolveCosts?: Record<string, { c: number; i: string | null }>;
    megaForms?: string[];
  }>('pokeminers:pve_and_sizes_v4');

  const pveFresh = pveCache && Date.now() - pveCache.ts <= MAX_AGE_MS;
  if (!refresh && pveFresh && pveCache) {
    pveMoves = pveCache.data.pveMoves;
    pvpBuffs = pveCache.data.pvpBuffs || {};
    showcaseSizes = pveCache.data.showcaseSizes;
    evolveCosts = pveCache.data.evolveCosts;
    megaForms = pveCache.data.megaForms;
    pveOk = Object.keys(pveMoves).length > 50;
    sizeOk = Object.keys(showcaseSizes).length > 50;
  } else if (!offlineOnly) {
    try {
      const rawGm = await fetchJsonWithTimeout<unknown[]>(PVE_URL, 60000);
      if (Array.isArray(rawGm)) {
        const shrunk = shrinkPokeMinersMaster(rawGm);
        if (Object.keys(shrunk.pveMoves).length > 100) {
          pveMoves = shrunk.pveMoves;
          pvpBuffs = shrunk.pvpBuffs;
          showcaseSizes = shrunk.showcaseSizes;
          evolveCosts = shrunk.evolveCosts;
          megaForms = shrunk.megaForms;
          pveOk = true;
          sizeOk = Object.keys(showcaseSizes).length > 100;
          await idbSet('pokeminers:pve_and_sizes_v4', shrunk);
        }
      }
    } catch {
      if (pveCache) {
        pveMoves = pveCache.data.pveMoves;
        pvpBuffs = pveCache.data.pvpBuffs || {};
        showcaseSizes = pveCache.data.showcaseSizes;
    evolveCosts = pveCache.data.evolveCosts;
        pveOk = Object.keys(pveMoves).length > 50;
        sizeOk = Object.keys(showcaseSizes).length > 50;
      }
    }
  } else if (pveCache) {
    pveMoves = pveCache.data.pveMoves;
    pvpBuffs = pveCache.data.pvpBuffs || {};
    showcaseSizes = pveCache.data.showcaseSizes;
    evolveCosts = pveCache.data.evolveCosts;
    pveOk = Object.keys(pveMoves).length > 50;
    sizeOk = Object.keys(showcaseSizes).length > 50;
  }

  // Merge PokeMiners combatMove buff metadata onto PvPoke moves when missing
  if (Object.keys(pvpBuffs).length > 0 && Array.isArray(gmRes.data.moves)) {
    gmRes.data = {
      ...gmRes.data,
      moves: gmRes.data.moves.map((mv) => {
        if (mv.buffs && mv.buffs.length > 0) return mv;
        const b = pvpBuffs[mv.moveId];
        return b ? { ...mv, ...b } : mv;
      }),
    };
  }

  // ScrapedDuck events & raids
  onProgress?.({ stage: 'Loading live events & raid bosses...', pct: 48 });
  let events: ScrapedEvent[] = [];
  let raids: ScrapedRaid[] = [];
  let eventsOk = false;
  let feedAgeHours: number | null = null;

  const evCache = await idbGet<{ events: ScrapedEvent[]; raids: ScrapedRaid[] }>('scrapedduck:events');
  const evFresh = evCache && Date.now() - evCache.ts <= FEED_AGE_MS;
  if (!refresh && evFresh && evCache) {
    events = evCache.data.events;
    raids = evCache.data.raids;
    eventsOk = true;
    feedAgeHours = Math.round(((Date.now() - evCache.ts) / 3600000) * 10) / 10;
  } else if (!offlineOnly) {
    try {
      const [evJson, rdJson] = await Promise.all([
        fetchJsonWithTimeout<ScrapedEvent[]>(EVENTS_URL, 15000),
        fetchJsonWithTimeout<ScrapedRaid[]>(RAIDS_URL, 15000),
      ]);
      events = Array.isArray(evJson) ? evJson : [];
      raids = Array.isArray(rdJson) ? rdJson : [];
      eventsOk = true;
      feedAgeHours = 0;
      await idbSet('scrapedduck:events', { events, raids });
    } catch {
      if (evCache) {
        events = evCache.data.events;
        raids = evCache.data.raids;
        eventsOk = true;
        feedAgeHours = Math.round(((Date.now() - evCache.ts) / 3600000) * 10) / 10;
      }
    }
  } else if (evCache) {
    events = evCache.data.events;
    raids = evCache.data.raids;
    eventsOk = true;
    feedAgeHours = Math.round(((Date.now() - evCache.ts) / 3600000) * 10) / 10;
  }

  return {
    gm: gmRes.data,
    ranks,
    groups,
    cupRanks,
    cupGroups,
    pveMoves,
    pveOk,
    evolveCosts: evolveCosts && Object.keys(evolveCosts).length > 50 ? evolveCosts : undefined,
    // Only trusted when the game master clearly listed Mega forms (a short list means the data was incomplete).
    megaForms: megaForms && megaForms.length >= 20 ? megaForms : undefined,
    showcaseSizes,
    sizeOk,
    events,
    raids,
    eventsOk,
    gmAgeDays: Math.round(gmRes.ageDays * 100) / 100,
    feedAgeHours,
    sourceLabel: gmRes.fromNet ? 'Live PvPoke + PokeMiners' : 'IndexedDB Cache (PvPoke + PokeMiners)',
  };
}
