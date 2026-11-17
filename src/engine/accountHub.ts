import { stepCostInfo } from './costTables';
import { cleanSpeciesName, normStr } from './defaultConfig';
import { accField, displaySpecies, ingameSearch, ivStr, resolveAccount } from './pgsParser';
import { Dex } from './pveModel';
import type {
  AchievementMedal,
  BagItemEntry,
  BagResources,
  BattleMvpEntry,
  BuddyPoffinPlannerData,
  EeveeTrackerData,
  GblSeasonRecord,
  GblSummaryData,
  ItemsAuditData,
  LiveGymsData,
  MedalTier,
  MedalsHubData,
  MegaOptimizerData,
  MegaOptimizerEntry,
  MonModel,
  OriginProtectionSummary,
  TypeCatchMedal,
  XpLevelPlanData,
} from './types';

// ============================================================
// #1 — GBL SEASON & ELO DASHBOARD
// ============================================================
function parseSeasonRecord(label: string, obj: unknown): GblSeasonRecord | null {
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as Record<string, unknown>;
  const battles = Number(r.totalBattles ?? r.battles ?? 0);
  const wins = Number(r.totalWins ?? r.wins ?? 0);
  const rank = r.rank !== undefined && r.rank !== null ? Number(r.rank) : null;
  const ratingRaw = r.rating !== undefined && r.rating !== null ? Number(r.rating) : null;
  const rating = ratingRaw !== null && ratingRaw > 0 ? ratingRaw : null;
  if (battles === 0 && rank === null && rating === null && Number(r.stardustEarned ?? 0) === 0) {
    return null;
  }
  return {
    label,
    season: r.season !== undefined && r.season !== null ? Number(r.season) : null,
    rank,
    rating,
    current_streak: Number(r.currentStreak ?? 0),
    longest_streak: Number(r.longestWinStreak ?? r.longestStreak ?? 0),
    stardust_earned: Number(r.stardustEarned ?? 0),
    total_battles: battles,
    total_wins: wins,
    win_rate_pct: battles > 0 ? Math.round((1000 * wins) / battles) / 10 : 0,
  };
}

export function buildGblSummary(rawData: Record<string, unknown>): GblSummaryData {
  const combatLog = accField<Record<string, unknown>>(rawData, 'combatLog') || {};
  const current = parseSeasonRecord('Current Season', combatLog.currentSeasonResults);
  const previous = parseSeasonRecord('Previous Season', combatLog.previousSeasonResults);
  const lifetime = parseSeasonRecord('Lifetime Career', combatLog.lifetimeResults);

  const rawSets = Array.isArray(combatLog.currentVsSeekerSetResults)
    ? (combatLog.currentVsSeekerSetResults as Record<string, unknown>[])
    : [];
  const current_set_results = rawSets.slice(-5).map((s) => ({
    wins: Number(s.totalWins ?? s.wins ?? 0),
    battles: Number(s.totalBattles ?? s.battles ?? 0),
    rank: s.rank !== undefined && s.rank !== null ? Number(s.rank) : null,
  }));
  const latestSet = current_set_results[current_set_results.length - 1] || null;

  return {
    has_data: Boolean(current || previous || lifetime || current_set_results.length > 0),
    current,
    previous,
    lifetime,
    current_set_wins: latestSet ? latestSet.wins : null,
    current_set_battles: latestSet ? latestSet.battles : null,
    current_set_results,
  };
}

// ============================================================
// #3 — LIVE BATTLE-HISTORY MVPS
// ============================================================
export function buildBattleMvps(mons: MonModel[]): BattleMvpEntry[] {
  return mons
    .map((m) => {
      const total = m.battles_attacked + m.battles_defended + m.pvp_battles + m.npc_battles;
      return {
        id: m.uid,
        species: displaySpecies(m),
        cp: m.cp,
        iv: ivStr(m),
        verdict: m.verdict,
        battles_attacked: m.battles_attacked,
        battles_defended: m.battles_defended,
        pvp_battles: m.pvp_battles,
        pvp_wins: m.pvp_wins,
        npc_battles: m.npc_battles,
        total_battles: total,
        role: m.role || m.verdict,
      };
    })
    .filter((x) => x.total_battles > 0)
    .sort((a, b) => b.total_battles - a.total_battles || b.cp - a.cp)
    .slice(0, 30);
}

// ============================================================
// #5 — ORIGIN MOVES, FUSIONS & EVENT TICKETS
// ============================================================
export function buildOriginProtectionSummary(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  exportRefMs: number,
): OriginProtectionSummary {
  const items: OriginProtectionSummary['items'] = [];
  let originMovesCount = 0;
  let eventBackgroundCount = 0;
  let fusionCount = 0;

  for (const m of mons) {
    const reasons: string[] = [];
    if (m.origin_move) {
      originMovesCount++;
      reasons.push(`Origin Move: ${m.origin_move}`);
    }
    if (m.is_fusion) {
      fusionCount++;
      reasons.push('Fused Form');
    }
    if (m.location_card) {
      eventBackgroundCount++;
      reasons.push(`Background: ${m.location_card}`);
    }
    if (m.origin_events.length > 0) {
      if (!m.location_card) eventBackgroundCount++;
      reasons.push(`Event Origin (${m.origin_events.join(', ')})`);
    }
    if (reasons.length > 0) {
      items.push({
        id: m.uid,
        species: displaySpecies(m),
        cp: m.cp,
        iv: ivStr(m),
        reasons,
        verdict: m.verdict,
        search: ingameSearch(m, m.species?.speciesName || String(m.dex)),
      });
    }
  }

  const rawTickets = accField<unknown[]>(rawData, 'eventTicketActiveTime') || [];
  const active_tickets: OriginProtectionSummary['active_tickets'] = [];
  for (const tk of rawTickets) {
    if (!tk || typeof tk !== 'object') continue;
    const t = tk as { eventTicket?: string | number; eventStartMs?: number | string; eventEndMs?: number | string };
    const startMs = Number(t.eventStartMs || 0);
    const endMs = Number(t.eventEndMs || 0);
    if (!t.eventTicket) continue;
    const activeNow = startMs > 0 && endMs > 0 && exportRefMs >= startMs && exportRefMs <= endMs;
    const recentOrUpcoming = endMs >= exportRefMs - 30 * 86400_000;
    if (activeNow || recentOrUpcoming) {
      active_tickets.push({
        id: String(t.eventTicket),
        start: startMs > 0 ? new Date(startMs).toISOString().slice(0, 10) : '—',
        end: endMs > 0 ? new Date(endMs).toISOString().slice(0, 10) : '—',
        active_now: activeNow,
      });
    }
  }

  return {
    protected_count: items.length,
    origin_moves_count: originMovesCount,
    event_background_count: eventBackgroundCount,
    fusion_count: fusionCount,
    active_tickets: active_tickets.slice(0, 15),
    items: items.slice(0, 40),
  };
}

// ============================================================
// #6 — EEVEE NAME-TRICK & PARTY CATCH TRACKER
// ============================================================
const EEVEE_TRICKS: { nickname: string; evolution: string; dex: number; enumNum: number }[] = [
  { nickname: 'Rainer', evolution: 'Vaporeon', dex: 134, enumNum: 1 },
  { nickname: 'Sparky', evolution: 'Jolteon', dex: 135, enumNum: 2 },
  { nickname: 'Pyro', evolution: 'Flareon', dex: 136, enumNum: 3 },
  { nickname: 'Sakura', evolution: 'Espeon', dex: 196, enumNum: 4 },
  { nickname: 'Tamao', evolution: 'Umbreon', dex: 197, enumNum: 5 },
  { nickname: 'Linnea', evolution: 'Leafeon', dex: 470, enumNum: 6 },
  { nickname: 'Rea', evolution: 'Glaceon', dex: 471, enumNum: 7 },
  { nickname: 'Kira', evolution: 'Sylveon', dex: 700, enumNum: 8 },
];

export function buildEeveeTracker(rawData: Record<string, unknown>, mons: MonModel[]): EeveeTrackerData {
  const consumed = accField<unknown[]>(rawData, 'consumedEeveeEasterEggs') || [];
  const consumedNorms = new Map<string, string>();
  if (Array.isArray(consumed)) {
    for (const item of consumed) {
      const s = String(item ?? '').trim();
      if (!s) continue;
      consumedNorms.set(normStr(s), s);
    }
  }

  const tricks = EEVEE_TRICKS.map((t) => {
    const matchKey = [
      normStr(t.nickname),
      normStr(t.evolution),
      String(t.enumNum),
      String(t.dex),
    ].find((k) => consumedNorms.has(k));
    return {
      nickname: t.nickname,
      evolution: t.evolution,
      dex: t.dex,
      used: Boolean(matchKey),
      raw_token: matchKey ? consumedNorms.get(matchKey) : undefined,
    };
  });

  const usedCount = tricks.filter((t) => t.used).length;
  return {
    tricks,
    used_count: usedCount,
    remaining_count: tricks.length - usedCount,
    caught_in_party_count: mons.filter((m) => m.caught_in_party).length,
  };
}

// ============================================================
// #9 — MEGA LEVEL-3 CYCLING OPTIMIZER
// ============================================================
export function buildMegaOptimizer(
  mons: MonModel[],
  dex: Dex,
  exportRefMs: number,
): MegaOptimizerData {
  let lv1 = 0;
  let lv2 = 0;
  let lv3 = 0;
  const active_megas: MegaOptimizerEntry[] = [];
  const cycle_queue: MegaOptimizerEntry[] = [];

  for (const m of mons) {
    if (!m.has_mega_unlocked) continue;
    const lvl = Math.max(1, m.mega_level);
    if (lvl >= 3) lv3++;
    else if (lvl === 2) lv2++;
    else lv1++;

    const megaName = m.mega_sid
      ? cleanSpeciesName(dex.byId.get(m.mega_sid)?.speciesName || m.mega_sid)
      : `Mega ${displaySpecies(m)}`;
    const boosts = m.mega_sid ? dex.megaBoostTypes(m.mega_sid) : m.mega_type ? [m.mega_type] : [];
    const pts = Math.max(m.mega_points, lvl >= 3 ? 30 : lvl === 2 ? 7 : 1);
    const nextLevel = lvl < 2 ? 2 : lvl < 3 ? 3 : 3;
    const pointsToNext = lvl >= 3 ? 0 : Math.max(1, (lvl === 1 ? 7 : 30) - pts);
    const activeByTimer = m.mega_finish_ms !== null && m.mega_finish_ms > exportRefMs;
    const activeNow = m.is_currently_mega || activeByTimer;
    const activeRemainingMin =
      m.mega_finish_ms !== null && m.mega_finish_ms > exportRefMs
        ? Math.max(1, Math.round((m.mega_finish_ms - exportRefMs) / 60000))
        : null;

    const entry: MegaOptimizerEntry = {
      id: m.uid,
      species: displaySpecies(m),
      mega_name: megaName,
      cp: m.cp,
      iv: ivStr(m),
      iv_pct: m.iv_pct,
      mega_level: lvl,
      mega_points: pts,
      points_to_next: pointsToNext,
      next_level: nextLevel,
      boosts,
      active_now: activeNow,
      active_remaining_min: activeRemainingMin,
      verdict: m.verdict,
      search: ingameSearch(m, m.species?.speciesName || String(m.dex)),
    };

    if (activeNow) active_megas.push(entry);
    if (lvl < 3) cycle_queue.push(entry);
  }

  cycle_queue.sort(
    (a, b) =>
      b.mega_level - a.mega_level ||
      a.points_to_next - b.points_to_next ||
      b.iv_pct - a.iv_pct ||
      b.cp - a.cp,
  );

  // Feature 8: "Walk This for Free Mega Energy" Buddy Shortcut
  const unlockedFamilies = new Map<number, { megaName: string; megaLevel: number; bestScore: number }>();
  for (const m of mons) {
    if (!m.has_mega_unlocked) continue;
    const famRoot = m.dex;
    const megaName = m.mega_sid
      ? cleanSpeciesName(dex.byId.get(m.mega_sid)?.speciesName || m.mega_sid)
      : `Mega ${displaySpecies(m)}`;
    const cur = unlockedFamilies.get(famRoot);
    const score = m.mega_level < 3 ? 100 + m.mega_level * 10 : 10;
    if (!cur || score > cur.bestScore) {
      unlockedFamilies.set(famRoot, { megaName, megaLevel: Math.max(1, m.mega_level), bestScore: score });
    }
  }

  const walkByFamily = new Map<number, { score: number; target: NonNullable<MegaOptimizerData['walk_for_energy']>[number] }>();
  for (const m of mons) {
    if (m.verdict === 'TRANSFER' || m.verdict === 'TRADE' || m.verdict === 'REVIEW') continue;
    const sid = m.species?.speciesId || '';
    const famRoot = m.dex;
    const famInfo = unlockedFamilies.get(famRoot);
    if (!famInfo && !m.has_mega_unlocked) continue;

    const buddyKm = Math.max(
      1,
      Number(
        m.species?.buddyDistance ||
          (m.species?.tags?.some((t) => ['legendary', 'mythical', 'ultrabeast'].includes(t)) ? 20 : 5),
      ),
    );
    const energyPerCandy = buddyKm * 5;
    const poffinKm = Math.round((buddyKm / 2) * 10) / 10;
    const megaName = m.mega_sid
      ? cleanSpeciesName(dex.byId.get(m.mega_sid)?.speciesName || m.mega_sid)
      : famInfo?.megaName || `Mega ${displaySpecies(m)}`;
    const mlvl = Math.max(0, m.mega_level || 0);
    let score = m.iv_pct * 0.25 + (25 - Math.min(20, buddyKm)) * 2;
    if (m.has_mega_unlocked && mlvl < 3) score += 60;
    else if (m.verdict === 'BUILD_MEGA') score += 45;
    if (m.verdict === 'BUILD_PVP' || m.verdict === 'BUILD_RAID') score += 15;

    const reason =
      m.has_mega_unlocked && mlvl < 3
        ? `Walk ${buddyKm}km (${poffinKm}km w/ Poffin) for +${energyPerCandy} Mega Energy + speed up Lv${mlvl} → Lv3.`
        : `Family Mega unlocked — walking any copy earns +${energyPerCandy} Mega Energy per ${buddyKm}km candy.`;

    const candidate = {
      id: m.uid,
      species: displaySpecies(m),
      mega_name: megaName,
      cp: m.cp,
      iv_pct: m.iv_pct,
      mega_level: mlvl,
      buddy_km: buddyKm,
      poffin_km: poffinKm,
      energy_per_candy: energyPerCandy,
      reason,
      search: ingameSearch(m, m.species?.speciesName || String(m.dex)),
    };
    const prev = walkByFamily.get(famRoot);
    if (!prev || score > prev.score) {
      walkByFamily.set(famRoot, { score, target: candidate });
    }
  }

  const walk_for_energy = Array.from(walkByFamily.values())
    .sort((a, b) => a.target.buddy_km - b.target.buddy_km || b.score - a.score)
    .slice(0, 15)
    .map((x) => x.target);

  return {
    unlocked_total: lv1 + lv2 + lv3,
    lv1_count: lv1,
    lv2_count: lv2,
    lv3_count: lv3,
    active_megas,
    cycle_queue: cycle_queue.slice(0, 30),
    walk_for_energy,
  };
}

// ============================================================
// #10 — BUDDY HEART, EMOTION & POFFIN PLANNER
// ============================================================
export function buildBuddyPoffinPlan(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  bag: BagResources,
): BuddyPoffinPlannerData {
  const accRaw = resolveAccount(rawData);
  const buddyProto = (accRaw.buddyPokemonProto || {}) as Record<string, unknown>;
  const obsData = (accRaw.buddyObservedData || {}) as Record<string, unknown>;
  const swapsRaw = buddyProto.dailyBuddySwaps;
  const swapsObj = (swapsRaw && typeof swapsRaw === 'object' ? swapsRaw : {}) as Record<string, unknown>;
  const heartsObj = (obsData.todayStatsShownHearts || {}) as Record<string, unknown>;

  const emotionPoints = Number(obsData.currentEmotionPoints ?? 0);
  const excitedThreshold = 32;
  const dailySwapsUsed =
    typeof swapsRaw === 'number'
      ? swapsRaw
      : Number(swapsObj.count ?? (!Number.isNaN(Number(swapsRaw)) ? swapsRaw : 0) ?? 0);
  const dailySwapsMax = 20;

  const heartsSummary: { label: string; count: number }[] = [
    {
      label: 'Walk Together',
      count: Number(
        heartsObj.walkHearts ??
          heartsObj.walk ??
          (heartsObj.buddyAffectionKmInProgress
            ? Math.floor(Number(heartsObj.buddyAffectionKmInProgress) / 2)
            : 0),
      ),
    },
    { label: 'Give Treat', count: Number(heartsObj.feedHearts ?? heartsObj.treatHearts ?? heartsObj.treat ?? 0) },
    { label: 'Play', count: Number(heartsObj.petHearts ?? heartsObj.playHearts ?? heartsObj.play ?? 0) },
    { label: 'Battle', count: Number(heartsObj.battleHearts ?? heartsObj.battle ?? 0) },
    { label: 'Snapshot', count: Number(heartsObj.snapshotHearts ?? heartsObj.snapshot ?? 0) },
    { label: 'Bonus / Route', count: Number(heartsObj.bonusHearts ?? heartsObj.newPlaceHearts ?? 0) },
  ].filter((h) => h.count > 0);

  const poffinTargets = mons
    .filter(
      (m) =>
        m.verdict !== 'TRANSFER' &&
        (m.has_mega_unlocked ||
          m.verdict === 'BUILD_MEGA' ||
          m.verdict === 'BUILD_RAID' ||
          m.verdict === 'BUILD_PVP'),
    )
    .map((m) => {
      const dist = Math.max(1, Number(m.species?.buddyDistance || (m.species?.tags?.some((t) => ['legendary', 'mythical', 'ultrabeast'].includes(t)) ? 20 : 5)));
      const poffinKm = Math.round((dist / 2) * 10) / 10;
      let score = m.iv_pct * 0.2;
      let reason = `Halves candy distance ${dist}km → ${poffinKm}km for ${m.role}`;
      if (m.has_mega_unlocked && m.mega_level < 3) {
        score += 45;
        reason = `Mega Lv${m.mega_level}: ${poffinKm}km earns double Mega Energy + XL Candy`;
      } else if (m.verdict === 'BUILD_PVP' && m.power_up_to && m.power_up_to > 40) {
        score += 40;
        reason = `XL build to L${m.power_up_to}: drops walk to ${poffinKm}km per XL check`;
      } else if (dist === 20) {
        score += 35;
        reason = `Legendary/Mythical 20km → 10km halves XL grind`;
      } else if (dist <= 3) {
        score += 20;
      }
      return {
        id: m.uid,
        species: displaySpecies(m),
        cp: m.cp,
        iv: ivStr(m),
        iv_pct: m.iv_pct,
        buddy_km: dist,
        poffin_km: poffinKm,
        mega_level: m.mega_level,
        role: m.role,
        reason,
        _score: score,
      };
    })
    .sort((a, b) => b._score - a._score || b.iv_pct - a.iv_pct)
    .slice(0, 12)
    .map(({ _score: _s, ...rest }) => rest);

  return {
    emotion_points: emotionPoints,
    excited_threshold: excitedThreshold,
    points_to_excited: Math.max(0, excitedThreshold - emotionPoints),
    is_excited: emotionPoints >= excitedThreshold,
    daily_swaps_used: dailySwapsUsed,
    daily_swaps_max: dailySwapsMax,
    daily_swaps_remaining: Math.max(0, dailySwapsMax - dailySwapsUsed),
    poffins_in_bag: bag.poffins,
    hearts_summary: heartsSummary,
    poffin_targets: poffinTargets,
  };
}

// ============================================================
// #11 & #12 — EXPIRING ITEMS, BAG BLOAT & POKECOIN STORAGE PLANNER
// ============================================================
function prettifyItemName(rawName: string, itemId: number): string {
  if (!rawName) return `Item #${itemId}`;
  return rawName
    .replace(/^ITEM_/i, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function classifyBagCategory(rawName: string, itemId: number): BagItemEntry['category'] {
  const up = rawName.toUpperCase();
  if (up.includes('BALL') || (itemId >= 1 && itemId <= 5)) return 'Balls';
  if (up.includes('POTION') || up.includes('REVIVE') || (itemId >= 101 && itemId <= 202)) return 'Potions & Revives';
  if (up.includes('BERRY') || up.includes('POFFIN') || (itemId >= 701 && itemId <= 708)) return 'Berries';
  if (up.includes('REROLL') || up.includes('CANDY') || up.includes('BOTTLE_CAP') || (itemId >= 1201 && itemId <= 1302)) {
    return 'TMs & Upgrades';
  }
  if (up.includes('STONE') || up.includes('COAT') || up.includes('SCALE') || up.includes('ROCK') || up.includes('UPGRADE') || up.includes('FUSION') || up.includes('CROWNED') || (itemId >= 1101 && itemId <= 1160)) {
    return 'Evo & Fusion';
  }
  if (up.includes('TICKET') || up.includes('PASS') || up.includes('INCENSE') || up.includes('LUCKY_EGG') || up.includes('STAR_PIECE') || up.includes('LURE') || up.includes('INCUBATOR') || up.includes('MAX_BOOST') || up.includes('MP_')) {
    return 'Passes & Boosts';
  }
  return 'Special & Timed';
}

export function buildItemsAndStorageAudit(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  bag: BagResources,
  exportRefMs: number,
): ItemsAuditData {
  const accRaw = resolveAccount(rawData);
  const rawItems =
    accField<{
      item?: number;
      itemName?: string;
      itemId?: string | number;
      count?: number;
      unseen?: boolean;
      expirationTime?: string;
      unconvertedLocalExpirationTimeMs?: number | string;
      claimableExpirationConsolationCount?: number;
      ignoreInventoryCount?: boolean;
    }[]>(rawData, 'items') || [];

  const all_items: BagItemEntry[] = [];
  const catSums = new Map<BagItemEntry['category'], number>();
  let totalCounted = 0;

  for (const it of rawItems) {
    const cnt = Number(it.count || 0);
    const consol = Number(it.claimableExpirationConsolationCount || 0);
    if (cnt <= 0 && consol <= 0) continue;
    const itemId = Number(it.item ?? (typeof it.itemId === 'number' ? it.itemId : 0));
    const rawName = String(it.itemName || (typeof it.itemId === 'string' ? it.itemId : '') || '');
    const category = classifyBagCategory(rawName, itemId);
    const ignoreSpace = Boolean(it.ignoreInventoryCount);
    if (!ignoreSpace) {
      totalCounted += cnt;
      catSums.set(category, (catSums.get(category) || 0) + cnt);
    }

    const expStr = String(it.expirationTime || '').trim();
    const expMs = Number(it.unconvertedLocalExpirationTimeMs || 0);
    let expirationText = '';
    if (expMs > 0) {
      const hrs = Math.round((expMs - exportRefMs) / 3600000);
      expirationText = hrs > 0 ? `Expires in ${hrs}h` : 'Expired / Resetting';
    } else if (expStr) {
      expirationText = expStr;
    }

    all_items.push({
      item_id: itemId,
      name: prettifyItemName(rawName, itemId),
      raw_name: rawName,
      category,
      count: cnt,
      unseen: Boolean(it.unseen),
      ignore_bag_space: ignoreSpace,
      expiring: Boolean(expirationText),
      expiration_text: expirationText,
      consolation_count: consol,
    });
  }

  all_items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const expiring_items = all_items.filter((i) => i.expiring);
  const consolation_items = all_items.filter((i) => i.consolation_count > 0);
  const category_totals = Array.from(catSums.entries())
    .map(([category, count]) => ({
      category,
      count,
      pct: totalCounted > 0 ? Math.round((1000 * count) / totalCounted) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Bloat warnings
  const bloat_warnings: string[] = [];
  const potionsRevives = catSums.get('Potions & Revives') || 0;
  const regularBerries = all_items
    .filter((i) => i.category === 'Berries' && !i.raw_name.toUpperCase().includes('GOLDEN') && !i.raw_name.toUpperCase().includes('SILVER'))
    .reduce((s, i) => s + i.count, 0);
  const maxItemRaw = accRaw.maxItemStorage ?? rawData.maxItemStorage;
  const maxItemStorage = maxItemRaw !== undefined && maxItemRaw !== null && Number(maxItemRaw) > 0 ? Number(maxItemRaw) : null;
  const bagPct = maxItemStorage ? Math.round((100 * totalCounted) / maxItemStorage) : null;

  if (potionsRevives >= 180) {
    bloat_warnings.push(`${potionsRevives} Potions & Revives — trim basic/Super Potions if bag is tight.`);
  }
  if (regularBerries >= 150) {
    bloat_warnings.push(`${regularBerries} Razz/Nanab/Pinap Berries — feed to gym defenders for 30 Stardust each.`);
  }
  if (bagPct !== null && bagPct >= 92) {
    bloat_warnings.push(`Item bag is ${bagPct}% full (${totalCounted}/${maxItemStorage}).`);
  }

  const maxPokeRaw = accRaw.maxPokemonStorage ?? rawData.maxPokemonStorage;
  const maxPokemonStorage = maxPokeRaw !== undefined && maxPokeRaw !== null && Number(maxPokeRaw) > 0 ? Number(maxPokeRaw) : null;
  const pokemonCount = mons.length;
  const pokemonPct = maxPokemonStorage ? Math.round((100 * pokemonCount) / maxPokemonStorage) : null;
  const reclaimableTransfers = mons.filter((m) => m.verdict === 'TRANSFER').length;
  const afterTransferPct = maxPokemonStorage
    ? Math.round((100 * Math.max(0, pokemonCount - reclaimableTransfers)) / maxPokemonStorage)
    : null;

  const affordableUpgrades = Math.floor(bag.pokecoins / 200);
  let recommendedUpgrade: ItemsAuditData['recommended_upgrade'] = 'none';
  let upgradeReason = 'Save PokéCoins (200 coins per +50 storage upgrade).';

  if (affordableUpgrades > 0) {
    const pokeNeed = afterTransferPct ?? pokemonPct ?? 0;
    const bagNeed = bagPct ?? 0;
    if (pokeNeed >= 88 && pokeNeed >= bagNeed) {
      recommendedUpgrade = 'pokemon';
      upgradeReason = `Pokémon storage remains ${pokeNeed}% full even after ${reclaimableTransfers} safe transfers — buy +${affordableUpgrades * 50} Pokémon slots.`;
    } else if (bagNeed >= 88 && bagNeed > pokeNeed) {
      recommendedUpgrade = 'item';
      upgradeReason = `Item bag is ${bagNeed}% full (${totalCounted}/${maxItemStorage}) — buy +${affordableUpgrades * 50} Item Bag space.`;
    } else if (pokeNeed >= 75 || bagNeed >= 75) {
      recommendedUpgrade = pokeNeed >= bagNeed ? 'pokemon' : 'item';
      upgradeReason = `Best next expansion (${bag.pokecoins} PokéCoins = ${affordableUpgrades}× +50 upgrades): ${pokeNeed >= bagNeed ? 'Pokémon Storage' : 'Item Bag'}.`;
    } else {
      recommendedUpgrade = 'balanced';
      upgradeReason = `Both storages have breathing room; ${affordableUpgrades}× +50 upgrade${affordableUpgrades === 1 ? '' : 's'} available whenever needed.`;
    }
  } else if ((afterTransferPct ?? 0) >= 90 || (bagPct ?? 0) >= 90) {
    upgradeReason = `Need ${200 - bag.pokecoins} more PokéCoins for next +50 storage upgrade.`;
  }

  return {
    total_counted_items: totalCounted,
    max_item_storage: maxItemStorage,
    bag_pct: bagPct,
    pokecoins: bag.pokecoins,
    stardust: bag.stardust,
    max_pokemon_storage: maxPokemonStorage,
    pokemon_count: pokemonCount,
    pokemon_pct: pokemonPct,
    reclaimable_transfers: reclaimableTransfers,
    purchased_pokemon_upgrades: Number(accRaw.purchasedPokemonStorage ?? 0),
    purchased_item_upgrades: Number(accRaw.purchasedItemStorage ?? 0),
    purchased_gift_upgrades: Number(accRaw.purchasedGiftboxStorage ?? 0),
    purchased_postcard_upgrades: Number(accRaw.purchasedPostcardStorage ?? 0),
    affordable_upgrades: affordableUpgrades,
    recommended_upgrade: recommendedUpgrade,
    upgrade_reason: upgradeReason,
    expiring_items,
    consolation_items,
    category_totals,
    bloat_warnings,
    all_items: all_items.slice(0, 80),
  };
}

// ============================================================
// #13 — LIVE GYM DEFENDER & COIN CAP MONITOR
// ============================================================
export function buildLiveGymsData(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  exportRefMs: number,
): LiveGymsData {
  void exportRefMs;
  const activeTraining = new Set(
    (accField<unknown[]>(rawData, 'activeTrainingPokemon') || []).map(String),
  );

  const defenders: LiveGymsData['defenders'] = [];
  for (const m of mons) {
    if (!m.is_deployed && !m.deployed_fort_id) continue;
    const rawId = String(m.raw.id ?? m.raw.uid ?? '');
    const isTraining = activeTraining.has(rawId);
    const returned = Boolean(m.deployed_returned_ms);
    const hours = Math.round((m.deployed_duration_ms / 3600000) * 10) / 10;
    const totalMins = Math.floor(m.deployed_duration_ms / 60000);
    const dHours = Math.floor(totalMins / 60);
    const dMins = totalMins % 60;
    const label = totalMins > 0 ? `${dHours}h ${dMins}m` : 'Just placed';
    const estCoins = returned ? 0 : Math.min(50, Math.floor(totalMins / 10));

    defenders.push({
      id: m.uid,
      species: displaySpecies(m),
      cp: m.cp,
      cp_when_deployed: Number(m.raw.cpWhenDeployed ?? m.cp),
      iv: ivStr(m),
      fort_id: m.deployed_fort_id || 'Gym',
      deployed_hours: hours,
      deployed_label: label,
      est_coins: estCoins,
      lat: m.deployed_lat,
      lng: m.deployed_lng,
      is_training: isTraining,
      returned,
    });
  }

  defenders.sort((a, b) => Number(a.returned) - Number(b.returned) || b.deployed_hours - a.deployed_hours);

  const rawCaps = accField<unknown[]>(rawData, 'pokecoinCaps') || [];
  let dailyEarned = 0;
  let dailyCap = 50;
  for (const c of rawCaps) {
    if (!c || typeof c !== 'object') continue;
    const co = c as Record<string, unknown>;
    const val = Number(
      co.pokecoinEarned ??
        co.coinsEarnedToday ??
        co.coinsEarned ??
        co.dailyCoinsEarned ??
        co.count ??
        co.earned ??
        0,
    );
    if (val > dailyEarned) dailyEarned = val;
    const capVal = Number(co.pokecoinCap ?? co.dailyCap ?? co.cap ?? co.maxCap ?? 0);
    if (capVal > 0) dailyCap = capVal;
  }

  const dailyBonus = accField<Record<string, unknown>>(rawData, 'dailyBonusProto') || {};
  const streakRaw = dailyBonus.currentStreak ?? dailyBonus.dailyStreak;
  const streak = streakRaw !== undefined && streakRaw !== null ? Number(streakRaw) : null;

  const activeDefenders = defenders.filter((d) => !d.returned);
  const estPending = Math.min(Math.max(0, dailyCap - Math.min(dailyCap, dailyEarned)), activeDefenders.reduce((s, d) => s + d.est_coins, 0));

  return {
    defenders,
    active_count: activeDefenders.length,
    training_count: activeTraining.size,
    daily_coins_earned: Math.min(dailyCap, dailyEarned),
    daily_coin_cap: dailyCap,
    daily_coins_remaining: Math.max(0, dailyCap - dailyEarned),
    est_pending_coins: Math.max(0, estPending),
    daily_bonus_streak: streak,
  };
}

// ============================================================
// #14 & #15 — 18-TYPE CATCH MEDALS & ACHIEVEMENT HUB
// ============================================================
const CANONICAL_TYPE_ORDER = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
];

function calcMedalTier(val: number, thresholds: [number, number, number, number]): {
  tier: MedalTier;
  bonus: number;
  next_target: number | null;
  pct_to_next: number;
} {
  const [br, si, go, pl] = thresholds;
  if (val >= pl) return { tier: 'Platinum', bonus: 4, next_target: null, pct_to_next: 100 };
  if (val >= go) return { tier: 'Gold', bonus: 3, next_target: pl, pct_to_next: Math.round((100 * val) / pl) };
  if (val >= si) return { tier: 'Silver', bonus: 2, next_target: go, pct_to_next: Math.round((100 * val) / go) };
  if (val >= br) return { tier: 'Bronze', bonus: 1, next_target: si, pct_to_next: Math.round((100 * val) / si) };
  return { tier: 'None', bonus: 0, next_target: br, pct_to_next: Math.round((100 * val) / br) };
}

export function buildMedalsHub(rawData: Record<string, unknown>): MedalsHubData {
  const accRaw = resolveAccount(rawData);
  const player = (accRaw.player || rawData.player || {}) as Record<string, unknown>;
  const hasPlayerData = Object.keys(player).length > 0;

  const rawTypeArr = Array.isArray(player.numPokemonCaughtByType)
    ? (player.numPokemonCaughtByType as number[])
    : Array.isArray(player.pokemonCaughtByType)
    ? (player.pokemonCaughtByType as number[])
    : [];
  const typeOffset = rawTypeArr.length >= 19 ? 1 : 0;
  const type_medals: TypeCatchMedal[] = CANONICAL_TYPE_ORDER.map((type, idx) => {
    const count = Number(rawTypeArr[idx + typeOffset] ?? 0);
    const tierInfo = calcMedalTier(count, [10, 50, 200, 2500]);
    return {
      type,
      count,
      tier: tierInfo.tier,
      bonus: tierInfo.bonus,
      next_target: tierInfo.next_target,
      pct_to_next: tierInfo.pct_to_next,
    };
  });

  const platinumCount = type_medals.filter((m) => m.tier === 'Platinum').length;
  const avgRaidBonus = type_medals.length
    ? Math.round((type_medals.reduce((s, m) => s + m.bonus, 0) / type_medals.length) * 100) / 100
    : 0;

  const makeAch = (
    key: string,
    label: string,
    category: AchievementMedal['category'],
    value: number,
    thresholds: [number, number, number, number],
    unit?: string,
  ): AchievementMedal => {
    const t = calcMedalTier(value, thresholds);
    return {
      key,
      label,
      category,
      value: Math.round(value * 10) / 10,
      unit,
      tier: t.tier,
      next_target: t.next_target,
      pct_to_next: t.pct_to_next,
    };
  };

  const kmWalked = Number(player.kmWalked ?? accRaw.kmWalked ?? 0);
  const defendedHours = Math.floor(Number(player.totalDefendedMs ?? 0) / 3600000);

  const achievements: AchievementMedal[] = [
    makeAch('collector', 'Collector (Caught)', 'Catch & Explore', Number(player.numPokemonCaptured ?? 0), [30, 500, 2000, 50000]),
    makeAch('jogger', 'Jogger (Walked)', 'Catch & Explore', kmWalked, [10, 100, 1000, 10000], 'km'),
    makeAch('backpacker', 'Backpacker (Stops)', 'Catch & Explore', Number(player.pokeStopVisits ?? player.pokestopsVisited ?? 0), [100, 1000, 2000, 50000]),
    makeAch('sightseer', 'Sightseer (Unique Stops)', 'Catch & Explore', Number(player.uniquePokestopsVisited ?? 0), [10, 100, 1000, 2000]),
    makeAch('breeder', 'Breeder (Eggs)', 'Catch & Explore', Number(player.numEggsHatched ?? 0), [10, 100, 1000, 2500]),
    makeAch('scientist', 'Scientist (Evolutions)', 'Catch & Explore', Number(player.numEvolutions ?? 0), [3, 20, 200, 2000]),
    makeAch('fisherman', 'Fisher (Big Magikarp)', 'Catch & Explore', Number(player.bigMagikarpCaught ?? 0), [3, 50, 300, 1000]),
    makeAch('youngster', 'Youngster (Tiny Rattata)', 'Catch & Explore', Number(player.smallRattataCaught ?? 0), [3, 50, 300, 1000]),
    makeAch('hero', 'Hero (Team GO Rocket)', 'Battle & Rocket', Number(player.numGruntsDefeated ?? 0), [10, 100, 1000, 2000]),
    makeAch('champion', 'Champion (Raids Won)', 'Battle & Rocket', Number(player.numRaidBattleWon ?? 0), [10, 100, 1000, 2000]),
    makeAch('battle_legend', 'Battle Legend (5★ Raids)', 'Battle & Rocket', Number(player.numLegendaryBattleWon ?? 0), [10, 100, 1000, 2000]),
    makeAch('gentleman', 'Gentleman (Trades)', 'Social & Trade', Number(player.numTrades ?? 0), [10, 100, 1000, 2500]),
    makeAch('pilot', 'Pilot (Trade Distance)', 'Social & Trade', Number(player.tradeAccumulatedDistanceKm ?? 0), [1000, 100000, 1000000, 10000000], 'km'),
    makeAch('best_buddy', 'Best Buddy', 'Social & Trade', Number(player.numBestBuddies ?? 0), [1, 10, 100, 200]),
    makeAch('gym_leader', 'Gym Leader (Defended)', 'Gym & Contest', defendedHours, [10, 100, 1000, 15000], 'hrs'),
    makeAch('streaks', 'Triathlete (7-Day Streaks)', 'Catch & Explore', Number(player.sevenDayStreaks ?? 0), [1, 10, 50, 100]),
  ];

  const combatStats = (player.combatStats || {}) as Record<string, unknown>;
  const combatBadgesObj = (combatStats.badges || {}) as Record<string, unknown>;
  const combat_badges = Object.entries(combatBadgesObj)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => ({ name: k.replace(/([A-Z])/g, ' $1').trim(), count: Number(v) }));

  const contestStats = (player.contestStats || {}) as Record<string, unknown>;
  const contestBadgesObj = (contestStats.badgeStats || {}) as Record<string, unknown>;
  const contest_badges = Object.entries(contestBadgesObj)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => ({ name: k.replace(/([A-Z])/g, ' $1').trim(), count: Number(v) }));

  const eventBadgesRaw = Array.isArray(player.eventBadges) ? (player.eventBadges as unknown[]) : [];
  const event_badges = eventBadgesRaw
    .map((e) => (typeof e === 'string' || typeof e === 'number' ? String(e) : JSON.stringify(e)))
    .filter(Boolean);

  return {
    has_player_data: hasPlayerData,
    level: player.level !== undefined ? Number(player.level) : accRaw.level !== undefined ? Number(accRaw.level) : null,
    type_medals,
    platinum_type_count: platinumCount,
    avg_raid_catch_bonus: avgRaidBonus,
    achievements,
    combat_badges,
    contest_badges,
    event_badges_count: event_badges.length,
    event_badges: event_badges.slice(0, 30),
  };
}

// ============================================================
// #16 — XP-TO-NEXT-LEVEL & LUCKY EGG EVOLVE CALCULATOR
// ============================================================
// Current XP values (Pokémon GO, 2026). A Lucky Egg doubles every one of these for 30 minutes.
const XP_PER_EVOLVE = 1000;
const XP_PER_BEST_FRIEND = 100_000;
const XP_PER_LEGENDARY_RAID = 10_000;
// Mass evolving realistically manages 60-80 evolutions in one 30-minute egg (each takes 20-30 s).
const EVOLVES_PER_EGG = 65;

export function buildXpLevelPlan(
  rawData: Record<string, unknown>,
  mons: MonModel[],
  bag: BagResources,
  dex: Dex,
): XpLevelPlanData {
  const accRaw = resolveAccount(rawData);
  const player = (accRaw.player || rawData.player || {}) as Record<string, unknown>;
  const level = Number(player.level ?? accRaw.level ?? 40);
  const experience = Number(player.experience ?? accRaw.experience ?? 0);
  const prevLevelExp = Number(player.prevLevelExp ?? 0);
  const nextLevelExp = Number(player.nextLevelExp ?? 0);

  const hasData = experience > 0 && nextLevelExp > prevLevelExp;
  const xpIntoLevel = hasData ? Math.max(0, experience - prevLevelExp) : 0;
  const xpNeededTotal = hasData ? Math.max(1, nextLevelExp - prevLevelExp) : 1;
  const xpRemaining = hasData ? Math.max(0, nextLevelExp - experience) : 0;
  const progressPct = hasData ? Math.min(100, Math.round((1000 * xpIntoLevel) / xpNeededTotal) / 10) : 0;

  // Group TRANSFER mons that can still evolve for Lucky Egg mass evolve XP
  const fodderByDex = new Map<number, { species: string; count: number; candyCost: number }>();
  let totalTransferEvolvable = 0;

  for (const m of mons) {
    if (m.verdict !== 'TRANSFER' || !m.species || m.is_shadow) continue;
    const desc = dex.descendants(m.species.speciesId);
    const hasEvo = desc.some((sid) => sid !== m.species!.speciesId);
    if (!hasEvo) continue;
    totalTransferEvolvable++;
    const firstEvo = dex.byId.get(m.species.speciesId)?.family?.evolutions?.[0];
    const candyCost = firstEvo ? stepCostInfo(m.species.speciesId, firstEvo, dex.byId).cost : 25;
    const cur = fodderByDex.get(m.dex) || {
      species: cleanSpeciesName(m.species.speciesName),
      count: 0,
      candyCost,
    };
    cur.count++;
    fodderByDex.set(m.dex, cur);
  }

  const fodder_groups = Array.from(fodderByDex.entries())
    .map(([dexNum, v]) => ({
      species: v.species,
      dex: dexNum,
      count: v.count,
      candy_cost: v.candyCost,
      xp_each: XP_PER_EVOLVE,
    }))
    .sort((a, b) => a.candy_cost - b.candy_cost || b.count - a.count)
    .slice(0, 15);

  const xpNoEgg = totalTransferEvolvable * XP_PER_EVOLVE;
  const xpWithEgg = totalTransferEvolvable * XP_PER_EVOLVE * 2;

  return {
    has_data: hasData,
    level,
    experience,
    prev_level_exp: prevLevelExp,
    next_level_exp: nextLevelExp,
    xp_into_level: xpIntoLevel,
    xp_needed_total: xpNeededTotal,
    xp_remaining: xpRemaining,
    progress_pct: progressPct,
    lucky_eggs_in_bag: bag.lucky_eggs,
    transfer_evolve_count: totalTransferEvolvable,
    total_evolutions_lifetime: Number(player.numEvolutions ?? 0),
    xp_no_egg: xpNoEgg,
    xp_with_egg: xpWithEgg,
    evolves_per_egg: EVOLVES_PER_EGG,
    eggs_needed_for_fodder: totalTransferEvolvable > 0 ? Math.ceil(totalTransferEvolvable / EVOLVES_PER_EGG) : 0,
    // Both scenarios, so nothing mixes egg and non-egg numbers
    best_friends_needed_no_egg: xpRemaining > 0 ? Math.ceil(xpRemaining / XP_PER_BEST_FRIEND) : 0,
    best_friends_needed_with_egg: xpRemaining > 0 ? Math.ceil(xpRemaining / (XP_PER_BEST_FRIEND * 2)) : 0,
    raids_needed_no_egg: xpRemaining > 0 ? Math.ceil(xpRemaining / XP_PER_LEGENDARY_RAID) : 0,
    raids_needed_with_egg: xpRemaining > 0 ? Math.ceil(xpRemaining / (XP_PER_LEGENDARY_RAID * 2)) : 0,
    best_friends_needed: xpRemaining > 0 ? Math.ceil(xpRemaining / XP_PER_BEST_FRIEND) : 0,
    five_star_raids_needed: xpRemaining > 0 ? Math.ceil(xpRemaining / XP_PER_LEGENDARY_RAID) : 0,
    fodder_groups,
  };
}
