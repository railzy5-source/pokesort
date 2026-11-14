import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Backpack,
  Coins,
  Medal,
  Search,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { BagItemEntry, MedalTier, ReportJson } from '../engine/types';
import { formatNum, type TabKey, TYPE_COLORS } from './uiTokens';

interface ItemsGymsTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
  onJumpTab?: (tab: TabKey) => void;
}

const ITEM_CATEGORY_COLORS: Record<BagItemEntry['category'], string> = {
  Balls: 'bg-rose-500',
  'Potions & Revives': 'bg-purple-500',
  Berries: 'bg-emerald-500',
  'TMs & Upgrades': 'bg-sky-500',
  'Evo & Fusion': 'bg-amber-500',
  'Passes & Boosts': 'bg-teal-500',
  'Special & Timed': 'bg-indigo-500',
};

export const ItemsGymsTab: React.FC<ItemsGymsTabProps> = ({
  report,
  onInspectId,
  onJumpTab,
}) => {
  const ia = report.items_audit;
  const lg = report.live_gyms;
  const [itemSearch, setItemSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('ALL');

  const filteredItems = useMemo(() => {
    const items = ia?.all_items || [];
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      if (catFilter !== 'ALL' && it.category !== catFilter) return false;
      if (q && !`${it.name} ${it.raw_name} ${it.category}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [ia?.all_items, itemSearch, catFilter]);

  if (!ia && !lg) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No item bag, PokéCoin, or gym defender data found in this export.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Bag Audit, PokéCoins &amp; Live Gyms
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Expiring timed items, storage upgrade planner, bag bloat ratios, and live gym defender coin tracking.
        </p>
      </div>

      {/* #12 PokéCoin & Storage Upgrade Planner */}
      {ia && (
        <div className="space-y-4">
          <div className="grid divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                PokéCoin Balance
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {formatNum(ia.pokecoins)}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {ia.affordable_upgrades > 0
                  ? `${ia.affordable_upgrades} × +50 storage upgrades affordable (200 each)`
                  : 'Need 200 PokéCoins per +50 storage'}
              </div>
            </div>

            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Pokémon Storage
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatNum(ia.pokemon_count)}
                <span className="text-sm font-normal text-slate-400">
                  {ia.max_pokemon_storage ? ` / ${formatNum(ia.max_pokemon_storage)}` : ''}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {ia.pokemon_pct !== null ? `${ia.pokemon_pct}% full · ` : ''}
                {formatNum(ia.reclaimable_transfers)} reclaimable transfers
              </div>
            </div>

            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Item Bag Usage
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatNum(ia.total_counted_items)}
                <span className="text-sm font-normal text-slate-400">
                  {ia.max_item_storage ? ` / ${formatNum(ia.max_item_storage)}` : ''}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {ia.bag_pct !== null ? `${ia.bag_pct}% full` : 'Max capacity not recorded'}
              </div>
            </div>

            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Purchased Upgrades
              </div>
              <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                Box {ia.purchased_pokemon_upgrades} · Bag {ia.purchased_item_upgrades}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                Postcard {ia.purchased_postcard_upgrades} · Gift {ia.purchased_gift_upgrades}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-teal-500/30 bg-teal-500/8 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs">
              <div className="font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                Recommended Storage Action:{' '}
                {ia.recommended_upgrade === 'pokemon'
                  ? 'Upgrade Pokémon Storage (+50)'
                  : ia.recommended_upgrade === 'item'
                  ? 'Upgrade Item Bag (+50)'
                  : ia.recommended_upgrade === 'balanced'
                  ? 'Flexible (+50 Box or Bag)'
                  : 'Clear Reclaimable Space / Save Coins'}
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{ia.upgrade_reason}</p>
            </div>
            {onJumpTab && ia.reclaimable_transfers > 0 && (
              <button
                type="button"
                onClick={() => onJumpTab('out')}
                className="shrink-0 whitespace-nowrap rounded-lg border border-teal-500/40 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-500/10 dark:bg-[#0F1B28] dark:text-teal-300"
              >
                Free {formatNum(ia.reclaimable_transfers)} Box Slots
              </button>
            )}
          </div>
        </div>
      )}

      {/* #13 Live Gym Defender & Coin Cap Monitor */}
      {lg && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Live Gym Defenders &amp; Daily Coin Cap
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                1 PokéCoin earned per 10 minutes defended (capped at {lg.daily_coin_cap}/day across returned Pokémon).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
              <span>
                Today:{' '}
                <b className="text-amber-600 dark:text-amber-400">
                  {lg.daily_coins_earned}/{lg.daily_coin_cap}
                </b>
              </span>
              <span>
                Remaining Cap: <b className="text-slate-900 dark:text-slate-100">{lg.daily_coins_remaining}</b>
              </span>
              <span>
                Est. Pending: <b className="text-emerald-600 dark:text-emerald-400">{lg.est_pending_coins}</b>
              </span>
              {lg.daily_bonus_streak !== null && (
                <span>
                  Streak: <b className="text-slate-900 dark:text-slate-100">{lg.daily_bonus_streak}d</b>
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs dark:divide-slate-800 dark:border-slate-800">
            {lg.defenders.map((d) => (
              <div
                key={d.id}
                className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectId(d.id)}
                      className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                    >
                      {d.species}
                    </button>
                    <span className="font-mono text-slate-500 tabular-nums">
                      CP {formatNum(d.cp)} · {d.iv}
                    </span>
                    {d.is_training && (
                      <span className="font-semibold text-sky-600 dark:text-sky-400">
                        · Active Gym Training
                      </span>
                    )}
                    {d.returned && (
                      <span className="font-medium text-slate-400">· Recently Returned</span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                    Fort {d.fort_id || 'Unknown'}
                    {d.lat !== null && d.lng !== null
                      ? ` · ${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span className="text-slate-600 dark:text-slate-300">{d.deployed_label}</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    ~{d.est_coins} coins
                  </span>
                </div>
              </div>
            ))}
            {lg.defenders.length === 0 && (
              <div className="py-4 text-slate-500">
                No Pokémon currently deployed in gyms ({lg.training_count} in training).
              </div>
            )}
          </div>
        </div>
      )}

      {/* #11 Expiring Items & Bag Bloat Auditor */}
      {ia && (
        <div className="space-y-4">
          {(ia.expiring_items.length > 0 || ia.consolation_items.length > 0) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/8 p-4 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Expiring &amp; Claimable Items ({ia.expiring_items.length + ia.consolation_items.length})
              </div>
              <div className="mt-2 divide-y divide-amber-500/20">
                {ia.expiring_items.map((it) => (
                  <div key={`exp-${it.item_id}-${it.raw_name}`} className="flex items-center justify-between py-1.5">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {it.name} <span className="font-mono text-slate-500">×{it.count}</span>
                    </span>
                    <span className="font-mono text-amber-800 dark:text-amber-300">
                      Expires {it.expiration_text}
                    </span>
                  </div>
                ))}
                {ia.consolation_items.map((it) => (
                  <div key={`con-${it.item_id}-${it.raw_name}`} className="flex items-center justify-between py-1.5">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{it.name}</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                      {it.consolation_count} claimable consolation
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Backpack className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Bag Category Breakdown
              </h2>
              <div className="mt-3 space-y-2.5 text-xs">
                {ia.category_totals.map((c) => (
                  <div key={c.category}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{c.category}</span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatNum(c.count)} ({c.pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full ${ITEM_CATEGORY_COLORS[c.category] || 'bg-teal-500'}`}
                        style={{ width: `${Math.min(100, c.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Bag Bloat &amp; Cleanup Recommendations
              </h2>
              <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {ia.bloat_warnings.map((w, idx) => (
                  <div key={idx} className="py-2 text-slate-700 dark:text-slate-300">
                    {w}
                  </div>
                ))}
                {ia.bloat_warnings.length === 0 && (
                  <div className="py-3 text-slate-500">
                    Bag balance looks healthy with no severe potion, revive, or berry bloat detected.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Inventory Items ({filteredItems.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Filter items..."
                    className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="ALL">All Categories</option>
                  {ia.category_totals.map((c) => (
                    <option key={c.category} value={c.category}>
                      {c.category} ({c.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {filteredItems.map((it) => (
                <div
                  key={`${it.item_id}-${it.raw_name}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <span>{it.name}</span>
                      {it.unseen && (
                        <span className="text-[10px] font-bold uppercase text-teal-600 dark:text-teal-400">
                          · New
                        </span>
                      )}
                      {it.ignore_bag_space && (
                        <span className="text-[10px] font-medium text-slate-400">
                          · Free Slot
                        </span>
                      )}
                      {it.expiring && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          · Expires {it.expiration_text}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">{it.category}</div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    ×{formatNum(it.count)}
                  </span>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="py-6 text-center text-slate-500">No items match filter.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MEDAL_TIER_CLASSES: Record<MedalTier, string> = {
  Platinum: 'text-cyan-700 dark:text-cyan-300',
  Gold: 'text-amber-600 dark:text-amber-400',
  Silver: 'text-slate-600 dark:text-slate-300',
  Bronze: 'text-orange-700 dark:text-orange-400',
  None: 'text-slate-400',
};

export const MedalsXpTab: React.FC<{ report: ReportJson; onJumpTab?: (tab: TabKey) => void }> = ({
  report,
  onJumpTab,
}) => {
  const mh = report.medals_hub;
  const xp = report.xp_planner;

  if (!mh?.has_player_data && !xp?.has_data) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No trainer progression, XP, or medal counters found in this export.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Medals, Catch Bonuses &amp; XP Level Planner
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          18-Type catch multipliers (+1 to +4), lifetime medal milestones, and Lucky Egg mass-evolve XP calculator.
        </p>
      </div>

      {/* #16 XP-to-Next-Level & Lucky Egg Evolve Calculator */}
      {xp && xp.has_data && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Zap className="h-4 w-4 text-amber-500" />
                Level {xp.level} → Level {xp.level + 1} XP Progress ({xp.progress_pct}%)
              </h2>
              <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                {formatNum(xp.xp_into_level)} / {formatNum(xp.xp_needed_total)} XP ·{' '}
                {formatNum(xp.xp_remaining)} XP remaining
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
              <span className="text-slate-600 dark:text-slate-300">
                Lucky Eggs: <b className="text-slate-900 dark:text-slate-100">{xp.lucky_eggs_in_bag}</b>
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                Total XP: <b className="text-slate-900 dark:text-slate-100">{formatNum(xp.experience)}</b>
              </span>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-teal-500" style={{ width: `${Math.min(100, xp.progress_pct)}%` }} />
          </div>

          <div className="mt-4 grid divide-y divide-slate-200/80 border-t border-slate-100 pt-3 sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800">
            <div className="py-2 sm:pr-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                TRANSFER Evolvable Fodder
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatNum(xp.transfer_evolve_count)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                ~{xp.eggs_needed_for_fodder} Lucky Eggs (~65 evos/egg)
              </div>
            </div>

            <div className="py-2 sm:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Evolve XP (With Lucky Egg)
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatNum(xp.xp_with_egg)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {formatNum(xp.xp_no_egg)} XP without Lucky Egg
              </div>
            </div>

            <div className="py-2 sm:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                5★ Raid Equivalent
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatNum(xp.five_star_raids_needed)}
              </div>
              <div className="text-[11px] text-slate-500">10k base · 20k on Lucky Egg</div>
            </div>

            <div className="py-2 sm:pl-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Best Friend Equivalent
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatNum(xp.best_friends_needed)}
              </div>
              <div className="text-[11px] text-slate-500">100k base · 200k on Lucky Egg</div>
            </div>
          </div>

          {xp.fodder_groups.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Cheap Evolve Fodder in TRANSFER Box (12–25 Candy)
                </span>
                {onJumpTab && (
                  <button
                    type="button"
                    onClick={() => onJumpTab('out')}
                    className="font-semibold text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Open Transfer Queue
                  </button>
                )}
              </div>
              <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {xp.fodder_groups.slice(0, 12).map((fg) => (
                  <div
                    key={`${fg.dex}-${fg.species}`}
                    className="flex items-center justify-between border-b border-slate-100 py-1 dark:border-slate-800"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {fg.species}{' '}
                      <span className="font-mono text-[11px] text-slate-400">
                        ({fg.candy_cost}c)
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-teal-700 dark:text-teal-300">
                      {fg.count}× · {formatNum(fg.count * fg.xp_each * 2)} XP*
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* #14 18-Type Catch Medal & Raid Bonus Tracker */}
      {mh && mh.type_medals.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Sparkles className="h-4 w-4 text-cyan-500" />
                18-Type Catch Medals &amp; Raid Catch Multiplier
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Thresholds: Bronze 10 (+1) · Silver 50 (+2) · Gold 200 (+3) · Platinum 2,500 (+4).
              </p>
            </div>
            <div className="font-mono text-xs tabular-nums">
              <span className="font-bold text-cyan-700 dark:text-cyan-300">
                {mh.platinum_type_count}/18 Platinum
              </span>
              <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
              <span className="text-slate-600 dark:text-slate-300">
                Avg Catch Bonus <b>+{mh.avg_raid_catch_bonus}</b>
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {mh.type_medals.map((tm) => (
              <div
                key={tm.type}
                className="rounded-lg border border-slate-200/80 p-3 text-xs dark:border-slate-800"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold capitalize text-slate-900 dark:text-slate-100">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[tm.type] || '#64748b' }}
                    />
                    {tm.type}
                  </span>
                  <span className={`font-mono text-[11px] font-bold ${MEDAL_TIER_CLASSES[tm.tier]}`}>
                    +{tm.bonus}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatNum(tm.count)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {tm.next_target ? `/ ${formatNum(tm.next_target)}` : 'MAX'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, tm.pct_to_next)}%`,
                      backgroundColor: TYPE_COLORS[tm.type] || '#0d9488',
                    }}
                  />
                </div>
                <div className={`mt-1 text-[10px] font-semibold ${MEDAL_TIER_CLASSES[tm.tier]}`}>
                  {tm.tier}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* #15 Medal & Achievement Progress Hub */}
      {mh && mh.achievements.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Medal className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Trainer Achievement Medals ({mh.achievements.length})
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mh.achievements.map((a) => (
              <div
                key={a.key}
                className="rounded-lg border border-slate-200/80 p-3.5 text-xs dark:border-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">{a.label}</span>
                  <span className={`font-mono text-[11px] font-bold ${MEDAL_TIER_CLASSES[a.tier]}`}>
                    {a.tier}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {formatNum(a.value)}
                    {a.unit ? ` ${a.unit}` : ''}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {a.next_target ? `Next: ${formatNum(a.next_target)}` : 'Platinum Complete'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-teal-500"
                    style={{ width: `${Math.min(100, a.pct_to_next)}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-slate-400">{a.category}</div>
              </div>
            ))}
          </div>

          {(mh.combat_badges.length > 0 || mh.contest_badges.length > 0 || mh.event_badges_count > 0) && (
            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-xs md:grid-cols-3 dark:border-slate-800">
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Combat Badges ({mh.combat_badges.length})
                </div>
                <div className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-400">
                  {mh.combat_badges.slice(0, 6).map((cb) => (
                    <div key={cb.name} className="flex justify-between font-mono">
                      <span className="truncate">{cb.name}</span>
                      <span>{formatNum(cb.count)}</span>
                    </div>
                  ))}
                  {mh.combat_badges.length === 0 && <div className="text-slate-400">None recorded</div>}
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Showcase Contest Badges ({mh.contest_badges.length})
                </div>
                <div className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-400">
                  {mh.contest_badges.slice(0, 6).map((cb) => (
                    <div key={cb.name} className="flex justify-between font-mono">
                      <span className="truncate">{cb.name}</span>
                      <span>{formatNum(cb.count)}</span>
                    </div>
                  ))}
                  {mh.contest_badges.length === 0 && <div className="text-slate-400">None recorded</div>}
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  Event Badges ({mh.event_badges_count})
                </div>
                <div className="mt-1.5 text-slate-600 dark:text-slate-400 leading-relaxed">
                  {mh.event_badges.length > 0
                    ? mh.event_badges.slice(0, 10).join(' · ')
                    : 'No event badges recorded'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
