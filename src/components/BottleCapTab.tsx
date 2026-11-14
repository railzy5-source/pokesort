import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Crown,
  Info,
  Sparkles,
} from 'lucide-react';
import type { BottleCapRecommendation, ReportJson } from '../engine/types';
import { copyToClipboard, formatNum } from './uiTokens';

interface BottleCapTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
  onNotify: (msg: string) => void;
}

export const BottleCapTab: React.FC<BottleCapTabProps> = ({
  report,
  onInspectId,
  onNotify,
}) => {
  const [viewMode, setViewMode] = useState<'both' | 'gold' | 'silver'>('both');
  const [onlyHundoSilver, setOnlyHundoSilver] = useState(false);
  const [onlyRareGold, setOnlyRareGold] = useState(false);

  const summary = report.bottle_caps;

  const goldList = useMemo(() => {
    if (!summary) return [];
    const base = summary.gold || [];
    if (!onlyRareGold) return base;
    return base.filter((x) =>
      x.rarity_tags.some((t) =>
        ['Mythical', 'Legendary', 'Ultra Beast', 'Shiny', 'Background'].includes(t),
      ),
    );
  }, [summary, onlyRareGold]);

  const silverList = useMemo(() => {
    if (!summary) return [];
    const base = summary.silver || [];
    if (!onlyHundoSilver) return base;
    return base.filter((x) => x.becomes_hundo);
  }, [summary, onlyHundoSilver]);

  if (!summary) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        Bottle Cap analysis is not present in this precomputed report. Re-run with your PGSStats.json export to rank Gold &amp; Silver Hyper Training targets.
      </div>
    );
  }

  const topGold = summary.gold[0];
  const topSilver = summary.silver[0];
  const shadowNotes = summary.shadow_purify_notes || [];

  const copySearch = async (s: string, label: string) => {
    const ok = await copyToClipboard(s);
    onNotify(ok ? `Copied ${label}` : 'Copy failed');
  };

  const tierTone = (tier: 'S' | 'A' | 'B') => {
    if (tier === 'S') return 'text-teal-700 dark:text-teal-300';
    if (tier === 'A') return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  const renderCard = (item: BottleCapRecommendation, idx: number, kind: 'gold' | 'silver') => {
    const metaParts = [...item.rarity_tags, ...item.roles];
    const cpGain =
      item.cp_l50_before !== null && item.cp_l50_after !== null
        ? item.cp_l50_after - item.cp_l50_before
        : 0;

    return (
      <div
        key={`${kind}-${item.id}`}
        className="flex flex-col gap-2.5 py-3.5 first:pt-1 last:pb-1"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <button
                type="button"
                onClick={() => onInspectId(item.id)}
                className="text-left text-sm font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
              >
                {idx + 1}. {item.species}
              </button>
              {item.target_species !== item.species && (
                <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                  → {item.target_species}
                </span>
              )}
              <span className="font-mono text-xs tabular-nums text-slate-500">
                CP {formatNum(item.cp)} · L{item.level}
              </span>
            </div>

            {metaParts.length > 0 && (
              <div className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                {metaParts.join(' · ')}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className={`font-mono text-xs font-bold tabular-nums ${tierTone(item.tier)}`}>
              {item.tier}-Tier · {item.score}/100
            </span>
            <button
              type="button"
              onClick={() => copySearch(item.search, item.species)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
            >
              <Copy className="h-3 w-3" /> Search
            </button>
          </div>
        </div>

        {/* Stat Delta & L50 Ceiling Row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50/80 px-3 py-2 font-mono text-xs tabular-nums dark:bg-slate-900/70">
          <span className="text-slate-600 dark:text-slate-300">
            {item.current_iv} ({item.current_iv_pct}%)
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span
            className={`font-bold ${
              item.becomes_hundo
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-sky-700 dark:text-sky-300'
            }`}
          >
            {item.after_iv} ({item.after_iv_pct}%{item.becomes_hundo ? ' Hundo' : ''})
          </span>
          <span className="text-slate-400">·</span>
          <span
            className={`font-semibold ${
              kind === 'gold'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {item.target_stat_label}
          </span>
          {item.cp_l50_before !== null && item.cp_l50_after !== null && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 dark:text-slate-400">
                L50 CP {formatNum(item.cp_l50_before)} → {formatNum(item.cp_l50_after)}
                {cpGain > 0 ? ` (+${formatNum(cpGain)})` : ''}
              </span>
            </>
          )}
        </div>

        {/* Rationales & Warnings */}
        {item.reasons.length > 0 && (
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {item.reasons.join(' ')}
          </div>
        )}
        {item.warnings.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{item.warnings.join(' · ')}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Silver &amp; Gold Bottle Cap Planner
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Best Hyper Training targets in your box — Silver maxes 1 IV stat to 15; Gold maxes all 3 stats to 15/15/15.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { k: 'both', label: 'Gold & Silver' },
              { k: 'gold', label: `Gold (${goldList.length})` },
              { k: 'silver', label: `Silver (${silverList.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setViewMode(t.k)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                viewMode === t.k
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified KPI Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Gold Bottle Caps (All → 15)
          </div>
          <div className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {summary.gold_in_bag} in bag
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Best on Mythicals &amp; multi-stat Shiny Legendaries
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Silver Bottle Caps (1 Stat → 15)
          </div>
          <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {summary.silver_in_bag} in bag
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Best on 96–98% near-Hundos &amp; 14 ATK Raiders
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            #1 Gold Cap Target
          </div>
          {topGold ? (
            <>
              <button
                type="button"
                onClick={() => onInspectId(topGold.id)}
                className="mt-1 text-left text-base font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
              >
                {topGold.species}
              </button>
              <div className="mt-0.5 font-mono text-xs text-amber-600 dark:text-amber-400">
                {topGold.current_iv} → 15/15/15 (+{topGold.points_gained})
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-slate-500">No multi-stat target found</div>
          )}
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            #1 Silver Cap Target
          </div>
          {topSilver ? (
            <>
              <button
                type="button"
                onClick={() => onInspectId(topSilver.id)}
                className="mt-1 text-left text-base font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
              >
                {topSilver.species}
              </button>
              <div className="mt-0.5 font-mono text-xs text-teal-700 dark:text-teal-300">
                {topSilver.target_stat_label} ({topSilver.becomes_hundo ? '100% Hundo' : topSilver.after_iv})
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-slate-500">No near-Hundo target found</div>
          )}
        </div>
      </div>

      {/* Hyper Training Rules Strip */}
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800/90 dark:bg-[#0F1B28] dark:text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
        <span>
          Requires <strong className="text-slate-900 dark:text-slate-200">Good Buddy</strong> status and active buddy walking to finish tasks. Already 4★ (15/15/15) Pokémon, Great/Ultra League specialists that would worsen above cap, and <strong className="text-slate-900 dark:text-slate-200">Shadow Pokémon</strong> cannot be Bottle Capped directly.
        </span>
      </div>

      {/* Main Recommendation Columns */}
      <div className={`grid gap-6 ${viewMode === 'both' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {(viewMode === 'both' || viewMode === 'gold') && (
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <Crown className="h-4 w-4 text-amber-500" />
                  Gold Bottle Cap ({goldList.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  All 3 stats → 15/15/15 · Ranked for 2+ non-15 IVs
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyRareGold}
                  onChange={(e) => setOnlyRareGold(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600"
                />
                Mythical / Shiny / Legendary only
              </label>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {goldList.map((item, i) => renderCard(item, i, 'gold'))}
              {goldList.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-500">
                  No multi-stat Gold Bottle Cap candidates match the current filter.
                </div>
              )}
            </div>
          </div>
        )}

        {(viewMode === 'both' || viewMode === 'silver') && (
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                  Silver Bottle Cap ({silverList.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Single stat → 15 · Prioritizes 1-stat-from-Hundo/Shundo picks
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyHundoSilver}
                  onChange={(e) => setOnlyHundoSilver(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600"
                />
                100% Hundo unlocks only
              </label>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {silverList.map((item, i) => renderCard(item, i, 'silver'))}
              {silverList.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-500">
                  No Silver Bottle Cap candidates match the current filter.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Shadow Ineligibility Notice */}
      {shadowNotes.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <AlertTriangle className="h-4 w-4 text-purple-500" />
            High-Value Shadows in Your Box (Ineligible While Shadow)
          </div>
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            Shadow Pokémon cannot undergo Hyper Training unless Purified (+2/+2/+2 IVs). Keep top Shadow Raid attackers as Shadow unless you specifically want a Purified Hundo or Mega.
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {shadowNotes.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onInspectId(s.id)}
                    className="text-sm font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {s.species}
                  </button>{' '}
                  <span className="font-mono text-xs text-slate-500">
                    IV {s.iv} → Purifies to {s.purified_iv}
                    {s.purified_hundo ? ' (100% Hundo!)' : ''}
                  </span>
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{s.note}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copySearch(s.search, s.species)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                >
                  <Copy className="h-3 w-3" /> Search
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
