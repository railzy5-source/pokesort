import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeftRight,
  Copy,
  Egg,
  Footprints,
  Search,
  Sparkles,
} from 'lucide-react';
import type { ReportJson } from '../engine/types';
import { copyToClipboard, formatNum, VERDICT_COLORS, VERDICT_NAMES } from './uiTokens';

type SortDir = 'asc' | 'desc';

function toggleSort<K extends string>(
  currentKey: K,
  nextKey: K,
  currentDir: SortDir,
  setKey: (k: K) => void,
  setDir: (d: SortDir) => void,
  defaultDir: SortDir = 'desc',
) {
  if (currentKey === nextKey) {
    setDir(currentDir === 'asc' ? 'desc' : 'asc');
  } else {
    setKey(nextKey);
    setDir(defaultDir);
  }
}

interface TradeMatcherTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
  onNotify: (msg: string) => void;
}

export const TradeMatcherTab: React.FC<TradeMatcherTabProps> = ({
  report,
  onInspectId,
  onNotify,
}) => {
  const tm = report.trade_matcher;
  const tradeMons = useMemo(
    () => report.mons.filter((m) => m.verdict === 'TRADE'),
    [report.mons],
  );
  const [sub, setSub] = useState<'offers' | 'queue' | 'lucky' | 'mirror'>(
    (tm?.offers?.length ?? 0) > 0 ? 'offers' : tradeMons.length > 0 ? 'queue' : 'lucky',
  );
  const [showAllOffers, setShowAllOffers] = useState(false);

  // Queue filters & sort
  const [queueQuery, setQueueQuery] = useState('');
  const [queueRole, setQueueRole] = useState<'all' | 'lucky' | 'shiny_costume' | 'special' | 'mirror'>('all');
  const [queueSort, setQueueSort] = useState<'cp' | 'iv' | 'level' | 'year' | 'species' | 'role'>('cp');
  const [queueDir, setQueueDir] = useState<SortDir>('desc');
  const [showAllQueue, setShowAllQueue] = useState(false);

  // Lucky candidates sort
  const [luckySort, setLuckySort] = useState<'chance' | 'caught' | 'species' | 'cp' | 'iv' | 'verdict'>('chance');
  const [luckyDir, setLuckyDir] = useState<SortDir>('desc');
  const [showAllLucky, setShowAllLucky] = useState(false);

  // Mirror batches sort
  const [mirrorSort, setMirrorSort] = useState<'count' | 'species' | 'dex'>('count');
  const [mirrorDir, setMirrorDir] = useState<SortDir>('desc');

  const tradeChunks = useMemo(() => {
    if (tm?.trade_search_chunks && tm.trade_search_chunks.length > 0) {
      return tm.trade_search_chunks;
    }
    if (tradeMons.length === 0) return [];
    // Safe boundary-aware fallback using valid Pokémon GO precedence (guard&dex,dex&cp,cp)
    const guard = '!lucky&!shadow&!favorite&!4*';
    const chunks: { index: number; count: number; query: string; length: number }[] = [];
    let curDexes = new Set<number>();
    let curCps = new Set<number>();
    let curCount = 0;
    const fmt = (d: Set<number>, c: Set<number>) =>
      `${guard}&${Array.from(d).join(',')}&${Array.from(c).map((x) => `cp${x}`).join(',')}`;
    for (const m of tradeMons) {
      const nd = new Set(curDexes);
      nd.add(m.dex);
      const nc = new Set(curCps);
      nc.add(m.cp);
      const q = fmt(nd, nc);
      if (curCount > 0 && q.length > 1950) {
        const done = fmt(curDexes, curCps);
        chunks.push({ index: chunks.length + 1, count: curCount, query: done, length: done.length });
        curDexes = new Set([m.dex]);
        curCps = new Set([m.cp]);
        curCount = 1;
      } else {
        curDexes = nd;
        curCps = nc;
        curCount++;
      }
    }
    if (curCount > 0) {
      const done = fmt(curDexes, curCps);
      chunks.push({ index: chunks.length + 1, count: curCount, query: done, length: done.length });
    }
    return chunks;
  }, [tm?.trade_search_chunks, tradeMons]);

  const filteredQueue = useMemo(() => {
    const q = queueQuery.trim().toLowerCase();
    const list = tradeMons.filter((m) => {
      if (queueRole !== 'all') {
        const hayRole = `${m.role} ${m.why} ${m.flags.join(' ')}`.toLowerCase();
        if (queueRole === 'lucky' && !hayRole.includes('lucky') && !(m.year && m.year <= 2019)) return false;
        if (queueRole === 'shiny_costume' && !m.flags.some((f) => ['Shiny', 'Costume', 'Background'].includes(f))) return false;
        if (queueRole === 'special' && !hayRole.includes('legend') && !hayRole.includes('ultra beast') && !hayRole.includes('dynamax') && !hayRole.includes('gigantamax') && !hayRole.includes('regional') && !hayRole.includes('unown')) return false;
        if (queueRole === 'mirror' && !hayRole.includes('mirror') && !hayRole.includes('surplus') && !hayRole.includes('reroll')) return false;
      }
      if (q) {
        const hay = `${m.species} ${m.role} ${m.why} ${m.iv} ${m.year || ''} ${m.flags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const mul = queueDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (queueSort === 'cp') return (a.cp - b.cp) * mul || b.iv_pct - a.iv_pct;
      if (queueSort === 'iv') return (a.iv_pct - b.iv_pct) * mul || b.cp - a.cp;
      if (queueSort === 'level') return (a.level - b.level) * mul || b.cp - a.cp;
      if (queueSort === 'year') return ((a.year || 9999) - (b.year || 9999)) * mul || b.cp - a.cp;
      if (queueSort === 'role') return (a.why || a.role).localeCompare(b.why || b.role) * mul || b.cp - a.cp;
      return a.species.localeCompare(b.species) * mul || b.cp - a.cp;
    });
  }, [tradeMons, queueQuery, queueRole, queueSort, queueDir]);

  const sortedLucky = useMemo(() => {
    const items = tm?.lucky_candidates || [];
    const mul = luckyDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const byAge = (a.caught || '').localeCompare(b.caught || '');
      if (luckySort === 'chance') return ((a.chance_pct ?? 0) - (b.chance_pct ?? 0)) * mul || byAge;
      if (luckySort === 'caught') return byAge * mul || b.cp - a.cp;
      if (luckySort === 'cp') return (a.cp - b.cp) * mul || byAge;
      if (luckySort === 'iv') return ((a.iv_pct ?? 0) - (b.iv_pct ?? 0)) * mul || byAge;
      if (luckySort === 'verdict') return a.verdict.localeCompare(b.verdict) * mul || byAge;
      return a.species.localeCompare(b.species) * mul || byAge;
    });
  }, [tm?.lucky_candidates, luckySort, luckyDir]);

  const sortedMirrors = useMemo(() => {
    const items = tm?.mirror_candidates || [];
    const mul = mirrorDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      if (mirrorSort === 'count') return (a.count - b.count) * mul || a.species.localeCompare(b.species);
      if (mirrorSort === 'dex') return (a.dex - b.dex) * mul;
      return a.species.localeCompare(b.species) * mul || b.count - a.count;
    });
  }, [tm?.mirror_candidates, mirrorSort, mirrorDir]);

  if (!tm) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No catch-cell or trade telemetry found in this export.
      </div>
    );
  }

  const copySearch = async (query: string, label: string) => {
    const ok = await copyToClipboard(query);
    onNotify(ok ? `Copied ${label}` : 'Copy failed');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Trade Center
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            What is actually worth offering friends, what it costs in Stardust, and which old Pokémon give the best Lucky-trade odds.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['offers', `Rare Offers (${tm.offers?.length ?? 0})`],
              ['queue', `All Spares Marked Trade (${tradeMons.length})`],
              ['lucky', `Lucky Triggers (${tm.lucky_candidates.length})`],
              ['mirror', `Mirror Batches (${tm.mirror_candidates.length})`],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSub(k)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                sub === k
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {sub === 'queue' && (
        <div className="rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-3 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Marked for Trade ({formatNum(filteredQueue.length)}
                {filteredQueue.length !== tradeMons.length ? ` of ${formatNum(tradeMons.length)}` : ''})
              </h2>
              <p className="text-xs text-slate-500">
                Surplus variants, 2016–2019 Lucky fodder, untraded Legendaries/Ultra Beasts, Dynamax spares, and mirror-trade candidates routed out of Collection. Uses collision-safe <code className="font-mono">guard&amp;dex,dex&amp;cp,cp</code> syntax.
              </p>
            </div>
            {tradeChunks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tradeChunks.map((ch) => (
                  <button
                    key={ch.index}
                    type="button"
                    onClick={() =>
                      copySearch(
                        ch.query,
                        `Trade Chunk ${ch.index} (${ch.count} mons, ${ch.length} chars)`,
                      )
                    }
                    className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {tradeChunks.length === 1
                      ? `Copy Trade Search (${ch.count} mons)`
                      : `Chunk ${ch.index} · ${ch.count} mons`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'All Trade'],
                  ['lucky', '2016–2019 Lucky'],
                  ['shiny_costume', 'Shiny / Costume'],
                  ['special', 'Legend / Max / Special'],
                  ['mirror', 'Mirror / Surplus'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setQueueRole(k)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                    queueRole === k
                      ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={queueQuery}
                onChange={(e) => setQueueQuery(e.target.value)}
                placeholder="Filter species, reason, IV..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  {(
                    [
                      ['species', 'Pokémon', 'left', 'asc'],
                      ['cp', 'CP', 'right', 'desc'],
                      ['iv', 'IV%', 'right', 'desc'],
                      ['level', 'Lv', 'right', 'desc'],
                      ['year', 'Year', 'right', 'asc'],
                      ['role', 'Trade Reason', 'left', 'asc'],
                    ] as const
                  ).map(([key, label, align, defDir]) => (
                    <th key={key} className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : ''}`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(queueSort, key, queueDir, setQueueSort, setQueueDir, defDir)}
                        className={`inline-flex items-center gap-1 hover:text-teal-600 dark:hover:text-teal-400 ${
                          queueSort === key ? 'text-teal-700 dark:text-teal-300' : ''
                        }`}
                      >
                        {label}
                        {queueSort === key && (
                          <span className="font-mono text-[10px]">{queueDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-semibold">Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(showAllQueue ? filteredQueue : filteredQueue.slice(0, 120)).map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/35">
                    <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                      <button
                        type="button"
                        onClick={() => onInspectId(m.id)}
                        className="hover:text-teal-600 dark:hover:text-teal-400"
                      >
                        {m.species}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatNum(m.cp)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {m.iv_pct}% <span className="text-[10px] text-slate-400">({m.iv})</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500">
                      L{m.level}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500">
                      {m.year || '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-[11px] text-slate-500" title={m.why}>
                      {m.why}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => copySearch(m.search, `${m.species} trade search`)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                      >
                        <Copy className="h-3 w-3" /> Search
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredQueue.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No Trade Pokémon match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredQueue.length > 120 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500 dark:border-slate-800">
              <span>
                Showing {showAllQueue ? filteredQueue.length : 120} of {formatNum(filteredQueue.length)}
              </span>
              <button
                type="button"
                onClick={() => setShowAllQueue((v) => !v)}
                className="font-semibold text-teal-600 hover:underline dark:text-teal-400"
              >
                {showAllQueue ? 'Show Top 120' : `Show All (${formatNum(filteredQueue.length)})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unified Summary Strip */}
      <div className="grid divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Rare Pokémon To Offer
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatNum(tm.offers?.length ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Shiny, Legendary, Ultra Beast &amp; top Gigantamax spares
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Special Trades
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Usually 1 per day</div>
          <div className="mt-1 text-xs text-slate-500">
            All rare offers below count as a Special Trade
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Guaranteed Lucky Trades Left
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {tm.guaranteed_lucky_remaining !== null
              ? `${tm.guaranteed_lucky_remaining} Left`
              : tm.lucky_candidates.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {tm.lucky_candidates.length} old spare Pokémon to use
            {tm.guaranteed_lucky_remaining === null ? ' (count not in this export)' : ''}
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Already Traded / Untradable
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatNum(tm.untradable_count)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Excluded from trade recommendations
          </div>
        </div>
      </div>

      {sub === 'offers' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <ArrowLeftRight className="h-4 w-4 text-emerald-500" />
              How much Stardust a Special Trade costs
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Costs drop the better friends you are. Events can lower them further. Trading re-rolls the IVs, so your friend gets a random-IV copy.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200/80 text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Friendship level</th>
                    <th className="px-3 py-2 text-right font-semibold">Good</th>
                    <th className="px-3 py-2 text-right font-semibold">Great</th>
                    <th className="px-3 py-2 text-right font-semibold">Ultra</th>
                    <th className="px-3 py-2 text-right font-semibold">Best</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                  <tr>
                    <td className="py-2 pr-4 font-sans text-slate-700 dark:text-slate-300">Rare Pokémon your friend already has registered</td>
                    {(tm.offers?.[0]?.cost_registered || [20000, 16000, 1600, 800]).map((c, i) => (
                      <td key={i} className="px-3 py-2 text-right">{formatNum(c)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-sans text-slate-700 dark:text-slate-300">Rare Pokémon that is new to your friend</td>
                    {(tm.offers?.[0]?.cost_new || [1000000, 800000, 80000, 40000]).map((c, i) => (
                      <td key={i} className="px-3 py-2 text-right">{formatNum(c)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-sans text-slate-500">Ordinary Pokémon, both registered (for comparison)</td>
                    {[100, 100, 100, 100].map((c, i) => (
                      <td key={i} className="px-3 py-2 text-right text-slate-500">{c}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Rare spares other players will want ({formatNum(tm.offers?.length ?? 0)})
                </h2>
                <p className="text-xs text-slate-500">
                  Only spares the sorter marked Trade/Transfer, and only Pokémon the game lets you trade.
                </p>
              </div>
              {(tm.offers?.length ?? 0) > 50 && (
                <button
                  type="button"
                  onClick={() => setShowAllOffers((v) => !v)}
                  className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                >
                  {showAllOffers ? 'Show Top 50' : `Show All (${tm.offers?.length})`}
                </button>
              )}
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Pokémon</th>
                  <th className="px-4 py-2.5 font-semibold">Why it is rare</th>
                  <th className="px-4 py-2.5 text-right font-semibold">CP</th>
                  <th className="px-4 py-2.5 font-semibold">Verdict</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Stardust (Best → Good)</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(showAllOffers ? tm.offers || [] : (tm.offers || []).slice(0, 50)).map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/35">
                    <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                      <button type="button" onClick={() => onInspectId(o.id)} className="hover:text-teal-600 dark:hover:text-teal-400">
                        {o.species}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {o.labels.map((l) => (
                          <span key={l} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                            {l}
                          </span>
                        ))}
                        <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                          Special Trade
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{formatNum(o.cp)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${VERDICT_COLORS[o.verdict]}`}>
                        {VERDICT_NAMES[o.verdict]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatNum(o.cost_registered[3])} → {formatNum(o.cost_registered[0])}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => copySearch(o.search, `${o.species} search`)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] hover:border-teal-500 dark:border-slate-700"
                      >
                        <Copy className="h-3 w-3" /> Search
                      </button>
                    </td>
                  </tr>
                ))}
                {(tm.offers?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No rare spares to offer right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {tm.offers_hidden && tm.offers_hidden.keep + tm.offers_hidden.build + tm.offers_hidden.untradable > 0 && (
              <div className="border-t border-slate-200/80 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">
                Not listed: {formatNum(tm.offers_hidden.keep)} rare Pokémon you are keeping in your Collection,{' '}
                {formatNum(tm.offers_hidden.build)} you are building up, and {formatNum(tm.offers_hidden.untradable)} that the game will not let you trade
                (already traded, Shadow, buddy, in a Gym, favourite, or a Crowned form).
              </div>
            )}
          </div>
        </div>
      )}

      {sub === 'lucky' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-3 dark:border-slate-800">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Old spares that give the best Lucky-trade odds ({sortedLucky.length})
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {tm.guaranteed_lucky_remaining !== null
                  ? `Guaranteed Lucky trades left: ${tm.guaranteed_lucky_remaining}`
                  : 'Guaranteed trades left: not in this export'}
              </span>
              {sortedLucky.length > 60 && (
                <button
                  type="button"
                  onClick={() => setShowAllLucky((v) => !v)}
                  className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                >
                  {showAllLucky ? 'Show Top 60' : `Show All (${sortedLucky.length})`}
                </button>
              )}
            </div>
          </div>
          <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500 dark:border-slate-800">
            A Lucky trade turns <em>both</em> traded Pokémon Lucky (half Stardust to power up, IVs at least 12). The game uses the <strong>older</strong> of the two
            Pokémon to decide the odds, so trade one of these old spares. Odds shown are community-observed (Pokémon caught before 2019 are guaranteed while your
            guaranteed trades last; * means we could not read how many you have left).
          </p>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                {(
                  [
                    ['species', 'Pokémon', 'left', 'asc'],
                    ['chance', 'Lucky chance', 'right', 'desc'],
                    ['caught', 'Caught', 'right', 'asc'],
                    ['cp', 'CP', 'right', 'desc'],
                    ['iv', 'IV', 'right', 'desc'],
                    ['verdict', 'Verdict', 'left', 'asc'],
                  ] as const
                ).map(([key, label, align, defDir]) => (
                  <th key={key} className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(luckySort, key, luckyDir, setLuckySort, setLuckyDir, defDir)}
                      className={`inline-flex items-center gap-1 hover:text-teal-600 dark:hover:text-teal-400 ${
                        luckySort === key ? 'text-teal-700 dark:text-teal-300' : ''
                      }`}
                    >
                      {label}
                      {luckySort === key && (
                        <span className="font-mono text-[10px]">{luckyDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-semibold">Search</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(showAllLucky ? sortedLucky : sortedLucky.slice(0, 60)).map((lc) => (
                <tr key={lc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/35">
                  <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                    <button
                      type="button"
                      onClick={() => onInspectId(lc.id)}
                      className="hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      {lc.species}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums" title={lc.basis}>
                    <span className={lc.mode === 'chance' ? 'text-slate-700 dark:text-slate-300' : 'font-bold text-emerald-600 dark:text-emerald-400'}>
                      {lc.mode === 'guaranteed' ? 'Guaranteed' : lc.mode === 'maybe_guaranteed' ? 'Guaranteed*' : `${lc.chance_pct ?? 0}%`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {lc.caught || lc.year}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatNum(lc.cp)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {lc.iv_pct !== undefined ? `${lc.iv_pct}% ` : ''}
                    <span className="text-[10px] text-slate-400">({lc.iv})</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${VERDICT_COLORS[lc.verdict]}`}>
                      {VERDICT_NAMES[lc.verdict]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => copySearch(lc.search, `${lc.species} lucky candidate`)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] hover:border-teal-500 dark:border-slate-700"
                    >
                      <Copy className="h-3 w-3" /> Search
                    </button>
                  </td>
                </tr>
              ))}
              {sortedLucky.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No old spare Pokémon found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'mirror' && (
        <div className="space-y-3">
          {sortedMirrors.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs dark:border-slate-800/90 dark:bg-[#0F1B28]">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Mirror Trade Batches ({sortedMirrors.length} species)
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={mirrorSort}
                  onChange={(e) => setMirrorSort(e.target.value as typeof mirrorSort)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="count">Sort: Spares Count</option>
                  <option value="species">Sort: Species A–Z</option>
                  <option value="dex">Sort: Pokédex #</option>
                </select>
                <button
                  type="button"
                  onClick={() => setMirrorDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                >
                  <ArrowDownUp className="h-3 w-3" />
                  {mirrorDir.toUpperCase()}
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sortedMirrors.map((mc) => (
              <div
                key={`${mc.species}-${mc.dex}`}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {mc.species}
                    </span>
                    <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300">
                      {mc.count} spares
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Mirror trade before transferring for XL Candy + Lucky IV reroll chance.
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  {mc.sample_ids[0] ? (
                    <button
                      type="button"
                      onClick={() => onInspectId(mc.sample_ids[0])}
                      className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                    >
                      Inspect sample
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => copySearch(mc.search, `${mc.species} mirror search`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" /> Copy Search
                  </button>
                </div>
              </div>
            ))}
            {sortedMirrors.length === 0 && (
              <div className="col-span-full rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
                No duplicate transferable trade batches found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface BuddyEggsTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
  onNotify: (msg: string) => void;
}

export const BuddyEggsTab: React.FC<BuddyEggsTabProps> = ({
  report,
  onInspectId,
  onNotify,
}) => {
  const bt = report.buddy_tracker;
  const bp = report.buddy_planner;
  const eevee = report.eevee_tracker;
  const eg = report.eggs_summary;

  const copySearch = async (query: string, label: string) => {
    const ok = await copyToClipboard(query);
    onNotify(ok ? `Copied ${label}` : 'Copy failed');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Buddy Emotion Planner, Eevee Tricks &amp; Egg Incubators
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Active buddy Excited emotion tracker, Poffin distance-halving targets, Eevee name-trick log, evolution quests, and egg basket.
        </p>
      </div>

      {/* #10 Active Buddy + Emotion Progress + Walk/Poffin Queue */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Active In-Game Buddy &amp; Emotion</span>
            {bp && (
              <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                {bp.daily_swaps_remaining}/{bp.daily_swaps_max} swaps left · {bp.poffins_in_bag} Poffins
              </span>
            )}
          </div>
          {bt?.active_buddy ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onInspectId(bt.active_buddy!.id)}
                  className="text-lg font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                >
                  {bt.active_buddy.name}
                </button>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  CP {formatNum(bt.active_buddy.cp)} · L{bt.active_buddy.level} · {bt.active_buddy.iv}
                </span>
              </div>

              {bp && (
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {bp.is_excited ? 'Excited (1/2 Candy Distance)' : `${bp.points_to_excited} Emotion Pts to Excited`}
                    </span>
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                      {bp.emotion_points}/{bp.excited_threshold} EP
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full ${bp.is_excited ? 'bg-emerald-500' : 'bg-teal-500'}`}
                      style={{ width: `${Math.min(100, Math.round((100 * bp.emotion_points) / Math.max(1, bp.excited_threshold)))}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200/80 bg-slate-50/50 text-xs sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">Emotion Pts</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {bt.active_buddy.emotion_points}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">Total Hearts</div>
                  <div className="font-mono text-sm font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                    {bt.active_buddy.points_earned}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">KM Progress</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {bt.active_buddy.km_progress.toFixed(1)} km
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">Daily Swaps</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {bt.active_buddy.daily_swaps}
                  </div>
                </div>
              </div>

              {bp && bp.hearts_summary.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Today:</span>
                  {bp.hearts_summary.map((h) => (
                    <span key={h.label} className="font-mono text-slate-700 dark:text-slate-300">
                      {h.label} {h.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">
              No active buddy ID recorded in this export.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-2">
              <Footprints className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              Next-Best Walk &amp; Poffin Targets
            </span>
            {bp && bp.poffin_targets.length > 0 && (
              <span className="font-mono text-purple-700 dark:text-purple-300">
                Poffin Halves 20km → 10km
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {bp && bp.poffin_targets.length > 0
              ? bp.poffin_targets.slice(0, 5).map((pt) => (
                  <div key={pt.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => onInspectId(pt.id)}
                        className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {pt.species}
                      </button>{' '}
                      <span className="font-mono text-slate-500 tabular-nums">
                        CP {formatNum(pt.cp)} · {pt.iv} ({pt.iv_pct}%)
                      </span>
                      <div className="text-[11px] text-slate-500">{pt.reason}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-300 tabular-nums">
                      {pt.buddy_km}km → {pt.poffin_km}km
                    </span>
                  </div>
                ))
              : (bt?.walk_queue || []).slice(0, 5).map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => onInspectId(w.id)}
                        className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {w.name}
                      </button>{' '}
                      <span className="font-mono text-slate-500">
                        CP {formatNum(w.cp)} · {w.iv_pct}%
                      </span>
                      <div className="text-[11px] text-slate-500">{w.why}</div>
                    </div>
                    {w.mega_level > 0 && (
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                        Mega Lv{w.mega_level}
                      </span>
                    )}
                  </div>
                ))}
            {(!bp || bp.poffin_targets.length === 0) && (bt?.walk_queue || []).length === 0 && (
              <div className="py-3 text-xs text-slate-500">No priority walk targets queued.</div>
            )}
          </div>
        </div>
      </div>

      {/* #6 Eevee Name-Trick & Special Evolution Tracker */}
      {eevee && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Eevee One-Time Name Tricks ({eevee.used_count}/8 Used · {eevee.remaining_count} Left)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Each nickname trick works once per account — save Remaining names for Hundos or PvP Rank #1 Eeveelutions.
              </p>
            </div>
            {eevee.caught_in_party_count > 0 && (
              <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300 tabular-nums">
                {eevee.caught_in_party_count} Party Play catches
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {eevee.tricks.map((tr) => (
              <div
                key={tr.nickname}
                className={`rounded-lg border px-3 py-2.5 text-xs ${
                  tr.used
                    ? 'border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40'
                    : 'border-emerald-500/35 bg-emerald-500/8 text-slate-900 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{tr.evolution}</span>
                  <span
                    className={`font-mono text-[10px] uppercase ${
                      tr.used
                        ? 'text-slate-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {tr.used ? 'Used' : 'Available'}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                  Name: “{tr.nickname}”
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolution Quests */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Buddy Evolution Quests ({bt?.evo_quests.length || 0})
          </h2>
          <span className="text-xs text-slate-500">
            Must set as active buddy to progress requirements
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(bt?.evo_quests || []).map((q) => (
            <div
              key={`${q.id}-${q.target_form}`}
              className="rounded-lg border border-slate-200/80 p-3.5 text-xs dark:border-slate-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={() => onInspectId(q.id)}
                    className="text-sm font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {q.species}
                  </button>
                  <div className="font-mono text-[11px] text-slate-500">
                    CP {q.cp} · {q.iv} → {q.target_form}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copySearch(q.search, q.species)}
                  className="rounded border border-slate-200 p-1 text-slate-500 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700"
                  title="Copy search string"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                <span>{q.quest_name}</span>
                <span className="font-mono font-semibold">
                  {q.progress}/{q.goal} ({q.pct}%)
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full ${q.pct >= 100 ? 'bg-emerald-500' : 'bg-teal-500'}`}
                  style={{ width: `${Math.min(100, q.pct)}%` }}
                />
              </div>
            </div>
          ))}
          {(bt?.evo_quests || []).length === 0 && (
            <div className="col-span-full py-4 text-xs text-slate-500">
              No active buddy evolution quests in this box.
            </div>
          )}
        </div>
      </div>

      {/* Eggs & Incubator Priority */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Egg className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Egg Basket &amp; Incubator Value Priority ({eg?.total || 0} eggs)
          </h2>
          {eg && (
            <span className="font-mono text-xs text-slate-500">
              {eg.incubating} incubating · {eg.unincubated} unincubated
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(eg?.eggs || []).map((egg) => {
            const pct = egg.km_target > 0 ? Math.min(100, Math.round((100 * egg.km_walked) / egg.km_target)) : 0;
            return (
              <div
                key={egg.id}
                className="rounded-lg border border-slate-200/80 p-3.5 text-xs dark:border-slate-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {egg.km_target} km Egg
                    {egg.slot_type === 2 && (
                      <span className="ml-1.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                        · Bonus Slot
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      egg.incubating
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {egg.incubating ? `${egg.km_walked.toFixed(1)}/${egg.km_target} km` : 'Queued'}
                  </span>
                </div>

                {egg.incubating && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                )}

                <div className="mt-2 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                  {egg.priority_note} (Score {egg.value_score})
                </div>

                {egg.top_hatches.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {egg.top_hatches.slice(0, 6).map((h) => `${h.name} (T${h.rarity})`).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
          {(!eg || eg.eggs.length === 0) && (
            <div className="col-span-full py-4 text-xs text-slate-500">
              No egg records found in this export.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
