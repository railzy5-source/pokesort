import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  Copy,
  Download,
  RefreshCw,
  Search,
} from 'lucide-react';
import { serializeReportCsv } from '../engine/teamsAndGrade';
import { buildMergedConfig } from '../engine/defaultConfig';
import type { UserConfigInput } from '../engine/sorterEngine';
import type {
  ReportJson,
  ReportMon,
  VerdictType,
} from '../engine/types';
import {
  copyToClipboard,
  downloadFile,
  formatNum,
  type TabKey,
  VERDICT_COLORS,
  VERDICT_NAMES,
} from './uiTokens';
import { AppraisalBars, getTypeAccentHex } from './PokemonVisuals';

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

function ivSumFromStr(iv: string): number {
  const parts = iv.split('/').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  return parts[0] + parts[1] + parts[2];
}

export const ShowcaseTab: React.FC<{
  report: ReportJson;
  onInspectId: (id: string) => void;
}> = ({ report, onInspectId }) => {
  const S = report.showcase;
  const [filter, setFilter] = useState<'all' | 'xxl' | 'contest' | 'keep'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'species' | 'size' | 'iv' | 'cp' | 'verdict'>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAll, setShowAll] = useState(false);

  const sortedRows = useMemo(() => {
    if (!S || !S.enabled) return [];
    let rows = S.rows;
    if (filter === 'xxl') rows = rows.filter((r) => r.size_code === 5);
    else if (filter === 'contest') rows = rows.filter((r) => Boolean(r.in_contest));
    else if (filter === 'keep') rows = rows.filter((r) => r.score >= 750);

    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortBy === 'score') return (a.score - b.score) * mul || b.cp - a.cp;
      if (sortBy === 'size') return ((a.size_code || 0) - (b.size_code || 0)) * mul || b.score - a.score;
      if (sortBy === 'iv') return (ivSumFromStr(a.iv) - ivSumFromStr(b.iv)) * mul || b.score - a.score;
      if (sortBy === 'cp') return (a.cp - b.cp) * mul || b.score - a.score;
      if (sortBy === 'verdict') return a.verdict.localeCompare(b.verdict) * mul || b.score - a.score;
      return a.species.localeCompare(b.species) * mul || b.score - a.score;
    });
  }, [S, filter, sortBy, sortDir]);

  if (!S || !S.enabled) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        Showcase scoring is disabled or has no size data in this export.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            PokéStop Showcase Rankings
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Height + Weight relative to species average + IV + 178pt XXL bonus ·{' '}
            {S.active_contest_count ? `${S.active_contest_count} active in contest` : '0 active contests'}
            {S.legacy_unknown_count ? ` · ${S.legacy_unknown_count} pre-2023 legacy catches` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', `All Scored (${S.scored_count})`],
              ['xxl', `XXL Only (${S.xxl_count})`],
              ['contest', `Active Contest (${S.active_contest_count || 0})`],
              ['keep', 'Strong (750+)'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                filter === k
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 font-semibold">#</th>
              {(
                [
                  ['species', 'Pokémon', 'asc'],
                  ['score', 'Score', 'desc'],
                  ['size', 'Size', 'desc'],
                  ['iv', 'IV', 'desc'],
                  ['cp', 'CP', 'desc'],
                  ['verdict', 'Status & Verdict', 'asc'],
                ] as const
              ).map(([key, label, defDir]) => (
                <th key={key} className="px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort(sortBy, key, sortDir, setSortBy, setSortDir, defDir)}
                    className={`inline-flex items-center gap-1 hover:text-teal-600 dark:hover:text-teal-400 ${
                      sortBy === key ? 'text-teal-700 dark:text-teal-300' : ''
                    }`}
                  >
                    {label}
                    {sortBy === key && (
                      <span className="font-mono text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(showAll ? sortedRows : sortedRows.slice(0, 60)).map((r, i) => (
              <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/35">
                <td className="px-4 py-2.5 font-mono text-slate-400">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onInspectId(r.id)}
                    className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {r.species}
                  </button>
                </td>
                <td className="px-4 py-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                  {Math.round(r.score)}
                </td>
                <td className="px-4 py-2.5">
                  <span>{r.size}</span>
                  {r.legacy_size_unknown && (
                    <span className="ml-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      · Pre-2023 ?
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono">{r.iv}</td>
                <td className="px-4 py-2.5 font-mono">{r.cp}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_COLORS[r.verdict]}`}>
                      {VERDICT_NAMES[r.verdict]}
                    </span>
                    {r.in_contest && (
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        · In Contest
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No height/weight showcase metrics match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {sortedRows.length > 60 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800">
            <span>
              Showing {showAll ? sortedRows.length : 60} of {formatNum(sortedRows.length)}
            </span>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="font-semibold text-teal-600 hover:underline dark:text-teal-400"
            >
              {showAll ? 'Show Top 60' : `Show All (${formatNum(sortedRows.length)})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const CollectionTab: React.FC<{ report: ReportJson }> = ({ report }) => {
  const d = report.grade?.sections?.depth;
  const cupEntries = Object.entries(report.grade?.cup_readiness || {});
  if (!d) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Collection Depth &amp; Cup Readiness
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          {report.grade.components.collection_depth?.explain}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {d.parts.map((p) => (
          <div
            key={p.label}
            className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
          >
            <div className="flex items-center justify-between text-sm font-bold text-slate-900 dark:text-slate-100">
              <span>{p.label}</span>
              <span className="font-mono text-xs text-slate-500">{p.weight}% weight</span>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full bg-teal-500" style={{ width: `${p.pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">{p.pct}%</span> — {p.text}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
            Hundos ({d.hundos})
          </h2>
          {d.hundo_list.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
              {d.hundo_list.map((h) => (
                <div key={h.species} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="truncate text-slate-800 dark:text-slate-200">{h.species}</span>
                  <span className="ml-2 font-mono font-semibold text-teal-600 dark:text-teal-400">
                    {h.count}×
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">No 100% IV Pokémon detected yet.</span>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
            PvP Top-10 IV Anchors ({d.anchors.length})
          </h2>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {d.anchors.slice(0, 15).map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {a.species} <span className="font-mono font-normal text-slate-500">CP {a.cp} · {a.iv}</span>
                </span>
                <span className="font-mono font-semibold text-teal-600 dark:text-teal-400">
                  {a.league} #{a.iv_rank}
                </span>
              </div>
            ))}
            {d.anchors.length === 0 && (
              <div className="py-2 text-slate-500">No Top-10 IV spreads held.</div>
            )}
          </div>
        </div>
      </div>

      {cupEntries.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
            Specialty Cup Readiness
          </h2>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3 dark:divide-slate-800">
            {cupEntries.map(([cupKey, c]) => (
              <div key={cupKey} className="p-3 text-xs">
                <div className="font-bold text-slate-900 dark:text-slate-100">{c.title}</div>
                <div className="mt-1 font-mono text-slate-500">
                  Cap {c.cap} · {c.legal} legal · {c.qualified} qualified · {c.built} built
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const GradeTab: React.FC<{
  report: ReportJson;
  onJumpTab: (tab: TabKey) => void;
}> = ({ report, onJumpTab }) => {
  const g = report.grade;
  const compMeta: { key: string; label: string; tab: TabKey }[] = [
    { key: 'raid_coverage', label: 'Raid Coverage', tab: 'raid' },
    { key: 'pvp_readiness', label: 'PvP Readiness', tab: 'pvp' },
    { key: 'mega_coverage', label: 'Mega Coverage', tab: 'mega' },
    { key: 'max_battle', label: 'Max Battles', tab: 'max' },
    { key: 'collection_depth', label: 'Collection Depth', tab: 'depth' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Account Grade
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {g.narrative.headline}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{g.narrative.body}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <div className="font-mono text-4xl font-extrabold text-teal-600 dark:text-teal-400">
                {g.letter}
              </div>
              <div className="font-mono text-sm font-semibold text-slate-500">
                {g.overall_pct}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {compMeta.map((cm) => {
          const c = g.components[cm.key];
          if (!c) return null;
          return (
            <div
              key={cm.key}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {cm.label}
                  </h2>
                  <span className="font-mono text-xs text-slate-500">{c.weight}% weight</span>
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-teal-600 dark:text-teal-400">
                  {c.pct}%
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full bg-teal-500" style={{ width: `${c.pct}%` }} />
                </div>
                <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400">{c.explain}</p>
              </div>
              <button
                type="button"
                onClick={() => onJumpTab(cm.tab)}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
              >
                Open {cm.label} <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface AllMonsTabProps {
  report: ReportJson;
  initialVerdicts: Set<VerdictType>;
  initialHold: string | null;
  onInspectMon: (m: ReportMon) => void;
  onNotify: (msg: string) => void;
}

export const AllMonsTab: React.FC<AllMonsTabProps> = ({
  report,
  initialVerdicts,
  initialHold,
  onInspectMon,
  onNotify,
}) => {
  const [query, setQuery] = useState('');
  const [verdicts, setVerdicts] = useState<Set<VerdictType>>(initialVerdicts);
  const [holdFilter, setHoldFilter] = useState<string>(initialHold || 'all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'verdict' | 'species' | 'iv' | 'cp' | 'level' | 'dust'>('verdict');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showMvps, setShowMvps] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 30;
  const tagSummary = report.tag_summary || [];
  const battleMvps = report.battle_mvps || [];

  React.useEffect(() => {
    setVerdicts(initialVerdicts);
    setPage(0);
  }, [initialVerdicts]);

  React.useEffect(() => {
    setHoldFilter(initialHold || 'all');
    setPage(0);
  }, [initialHold]);

  const toggleVerdict = (v: VerdictType) => {
    setVerdicts((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = report.mons.filter((m) => {
      if (verdicts.size > 0 && !verdicts.has(m.verdict)) return false;
      if (holdFilter !== 'all' && m.hold !== holdFilter) return false;
      if (tagFilter === 'conflicts_only' && (!m.tag_conflicts || m.tag_conflicts.length === 0)) return false;
      else if (tagFilter === 'tagged_any' && (!m.mon_tags || m.mon_tags.length === 0)) return false;
      else if (tagFilter !== 'all' && tagFilter !== 'conflicts_only' && tagFilter !== 'tagged_any') {
        if (!(m.mon_tags || []).includes(tagFilter)) return false;
      }
      if (q) {
        const hay = `${m.species} ${m.role} ${m.verdict} ${m.origin_label || ''} ${m.catch_floor || ''} ${m.origin_move || ''} ${m.untradable_traded ? 'untradable traded' : ''} ${(m.mon_tags || []).join(' ')} ${m.moves.map((x) => x.name).join(' ')} ${m.iv}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'iv') return [...list].sort((a, b) => (a.iv_pct - b.iv_pct) * mul || b.cp - a.cp);
    if (sortBy === 'cp') return [...list].sort((a, b) => (a.cp - b.cp) * mul || b.iv_pct - a.iv_pct);
    if (sortBy === 'level') return [...list].sort((a, b) => (a.level - b.level) * mul || b.iv_pct - a.iv_pct);
    if (sortBy === 'dust') return [...list].sort((a, b) => (a.cost_dust - b.cost_dust) * mul || b.cp - a.cp);
    if (sortBy === 'species') return [...list].sort((a, b) => a.species.localeCompare(b.species) * mul || b.cp - a.cp);
    return sortDir === 'asc' ? [...list].reverse() : list;
  }, [report.mons, query, verdicts, holdFilter, tagFilter, sortBy, sortDir]);

  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const allVerdicts: VerdictType[] = [
    'BUILD_PVP',
    'BUILD_MEGA',
    'BUILD_RAID',
    'BUILD_MAX',
    'BUILD_GYM',
    'KEEP',
    'TRADE',
    ...((report.counts.verdicts?.REVIEW || 0) > 0 ? (['REVIEW'] as VerdictType[]) : []),
    'TRANSFER',
  ];

  const handleExportCsv = () => {
    const csv = serializeReportCsv(filtered);
    downloadFile('pgs_filtered_pokemon.csv', csv, 'text/csv;charset=utf-8');
    onNotify(`Exported ${filtered.length} Pokémon to CSV`);
  };

  const copySearch = async (s: string, label: string) => {
    const ok = await copyToClipboard(s);
    onNotify(ok ? `Copied ${label}` : 'Copy failed');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            All Pokémon ({formatNum(filtered.length)})
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {battleMvps.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMvps((v) => !v)}
              className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                showMvps
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200'
              }`}
            >
              Battle MVPs ({battleMvps.length})
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      {showMvps && battleMvps.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-slate-100">
              Top Live Battle-History MVPs
            </span>
            <span className="text-slate-500">Gym, Raid, PvP &amp; Rocket Totals</span>
          </div>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {battleMvps.slice(0, 10).map((bm, i) => {
              const target = report.mons.find((x) => x.id === bm.id);
              return (
                <div key={bm.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <div>
                    <button
                      type="button"
                      onClick={() => target && onInspectMon(target)}
                      className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                    >
                      {i + 1}. {bm.species}
                    </button>{' '}
                    <span className="font-mono text-slate-500">
                      CP {formatNum(bm.cp)} · {bm.iv}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                    <b>{formatNum(bm.total_battles)}</b> total ({bm.battles_attacked} atk · {bm.battles_defended} def · {bm.pvp_battles} PvP · {bm.npc_battles} NPC)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search species, role, tag, origin, move, IV..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={holdFilter}
            onChange={(e) => {
              setHoldFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All hold groups</option>
            <option value="build">Active builds</option>
            <option value="mega_reserve">Mega reserve</option>
            <option value="variant">Collection variants</option>
            <option value="protect_other">Collection protected</option>
            <option value="trade">Marked for trade</option>
            {(report.counts.verdicts?.REVIEW || 0) > 0 && <option value="review">Review</option>}
            <option value="transfer">Transfer</option>
          </select>

          {tagSummary.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => {
                setTagFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">All In-Game Tags</option>
              <option value="tagged_any">Any Tagged Mon</option>
              <option value="conflicts_only">Tag Conflicts Only</option>
              {tagSummary.map((t) => (
                <option key={t.name} value={t.name}>
                  #{t.name} ({t.count}{t.conflicts > 0 ? ` · ${t.conflicts} !` : ''})
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5">
            <select
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value as typeof sortBy;
                setSortBy(next);
                setSortDir(next === 'species' ? 'asc' : 'desc');
                setPage(0);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="verdict">Sort: Verdict</option>
              <option value="species">Sort: Species</option>
              <option value="iv">Sort: IV%</option>
              <option value="cp">Sort: CP</option>
              <option value="level">Sort: Level</option>
              <option value="dust">Sort: Build Dust</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                setPage(0);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {sortDir.toUpperCase()}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {allVerdicts.map((v) => {
            const active = verdicts.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggleVerdict(v)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  active
                    ? VERDICT_COLORS[v]
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400'
                }`}
              >
                {VERDICT_NAMES[v]} ({report.counts.verdicts[v] || 0})
              </button>
            );
          })}
          {verdicts.size > 0 && (
            <button
              type="button"
              onClick={() => setVerdicts(new Set())}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-teal-600 hover:underline dark:text-teal-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Pokémon GO Storage Box Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {pageRows.map((m) => {
          const accentHex = getTypeAccentHex([
            m.raid_type,
            m.mega_type,
            m.max_type,
            m.moves?.[0]?.type,
          ]);
          const totalBattles =
            (m.battles_attacked || 0) +
            (m.battles_defended || 0) +
            (m.pvp_battles || 0) +
            (m.npc_battles || 0);
          const traitText = [
            ...m.flags.slice(0, 3),
            m.purify_preview?.becomes_hundo ? 'Purify→100%' : null,
            m.origin_move ? `Origin: ${m.origin_move}` : null,
            totalBattles >= 5 ? `${totalBattles} Battles` : null,
            m.untradable_traded ? 'Untradable' : null,
            m.catch_floor && m.catch_floor !== 'Wild (0+)' && m.catch_floor !== '0/0/0 Wild' ? m.catch_floor : null,
            ...(m.mon_tags || []).slice(0, 2).map((tg) => `#${tg}`),
            m.tag_conflicts && m.tag_conflicts.length > 0 ? 'Tag Conflict' : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={m.id}
              onClick={() => onInspectMon(m)}
              className="cursor-pointer overflow-hidden rounded-xl border border-slate-200/80 bg-white transition hover:border-teal-500 dark:border-slate-800/90 dark:bg-[#0F1B28] dark:hover:border-teal-500"
            >
              <div className="h-1 w-full" style={{ backgroundColor: accentHex }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-baseline gap-1 font-display tabular-nums">
                      <span className="text-[11px] font-semibold text-slate-400">CP</span>
                      <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {formatNum(m.cp)}
                      </span>
                      <span className="ml-1.5 font-mono text-xs font-normal text-slate-400">
                        L{m.level}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {m.species}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${VERDICT_COLORS[m.verdict]}`}
                  >
                    {VERDICT_NAMES[m.verdict]}
                  </span>
                </div>

                {m.role && (
                  <div className="mt-1.5 truncate text-xs text-slate-600 dark:text-slate-300">
                    {m.role}
                  </div>
                )}

                <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500 dark:text-slate-400">
                      Appraisal
                    </span>
                    <span className="font-mono font-bold text-slate-800 tabular-nums dark:text-slate-200">
                      {m.iv} ({m.iv_pct}%)
                    </span>
                  </div>
                  <AppraisalBars a={m.a} d={m.d} s={m.s} compact />
                </div>

                {traitText && (
                  <div className="mt-2.5 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {traitText}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
                  <span className="truncate text-slate-500 dark:text-slate-400">
                    {m.moves.map((mv) => mv.name).join(' / ') || 'Moves hidden'}
                    {m.needs_second_move && ' · Needs 2nd Charged Move'}
                    {m.needs_typed && m.needs_typed.length > 0
                      ? ` · ${Array.from(
                          new Set(
                            m.needs_typed.map(
                              (t) => `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM`,
                            ),
                          ),
                        ).join(', ')}`
                      : !m.needs_second_move && m.build_status
                      ? ` · ${m.build_status}`
                      : ''}
                  </span>
                  <button
                    type="button"
                    aria-label={`Copy search string for ${m.species}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      copySearch(m.search, m.species);
                    }}
                    className="ml-2 inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-teal-400"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600 dark:text-slate-400">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-teal-500 disabled:opacity-40 dark:border-slate-800 dark:bg-[#0F1B28]"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-teal-500 disabled:opacity-40 dark:border-slate-800 dark:bg-[#0F1B28]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface SettingsTabProps {
  userCfg: UserConfigInput;
  hasRawExport: boolean;
  onApplyAndRerun: (nextCfg: UserConfigInput) => void;
  onNotify: (msg: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  userCfg,
  hasRawExport,
  onApplyAndRerun,
  onNotify,
}) => {
  // Show the values the engine will REALLY use (your config on top of the built-in defaults), so pressing Apply
  // never silently changes a setting you did not touch.
  const eff = useMemo(() => buildMergedConfig(userCfg), [userCfg]);
  const pvpCfg = (userCfg.pvp as Record<string, unknown> | undefined) || {};
  const raidCfg = (userCfg.raid as Record<string, unknown> | undefined) || {};
  const maxCfg = (userCfg.max_battle as Record<string, unknown> | undefined) || {};

  const [leagues, setLeagues] = useState<string[]>(
    (eff.pvp?.leagues || ['1500', '2500', '10000']).map(String),
  );
  const [cups, setCups] = useState<string[]>(
    (eff.pvp?.cups ?? ['little', 'fantasy']).map(String),
  );
  const [protectIv, setProtectIv] = useState<number>(Number(eff.protect_iv_pct));
  const [raidMinIv, setRaidMinIv] = useState<number>(Number(eff.raid.min_iv_pct));
  const [raidMinAtk, setRaidMinAtk] = useState<number>(Number(eff.raid.min_atk_iv));
  const [respectFast, setRespectFast] = useState<boolean>(eff.max_battle.respect_current_fast_move !== false);
  const [protectTagText, setProtectTagText] = useState<string>(
    (eff.protect_tag_names || []).map(String).join(', '),
  );
  const [excludeTagText, setExcludeTagText] = useState<string>(
    (eff.exclude_tag_names || []).map(String).join(', '),
  );

  const availableLeagues: { id: string; label: string }[] = [
    { id: '1500', label: 'Great (1500)' },
    { id: '2500', label: 'Ultra (2500)' },
    { id: '10000', label: 'Master (Open)' },
  ];
  const availableCups: { id: string; label: string }[] = [
    { id: 'little', label: 'Little Cup (500)' },
    { id: 'fantasy', label: 'Fantasy Cup (1500)' },
  ];

  const toggleLeague = (id: string) => {
    if (id === '1500') return; // Great League is always on: the engine falls back to it when nothing is selected
    setLeagues((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleCup = (id: string) => {
    setCups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const parseTagList = (raw: string) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const buildNext = (): UserConfigInput => ({
    ...userCfg,
    protect_iv_pct: protectIv,
    protect_tag_names: parseTagList(protectTagText),
    exclude_tag_names: parseTagList(excludeTagText),
    pvp: { ...pvpCfg, leagues: Array.from(new Set(['1500', ...leagues])), cups },
    raid: { ...raidCfg, min_iv_pct: raidMinIv, min_atk_iv: raidMinAtk },
    max_battle: { ...maxCfg, respect_current_fast_move: respectFast },
  });

  const handleApply = () => {
    onApplyAndRerun(buildNext());
  };

  const handleDownloadCfg = () => {
    downloadFile('pogo_config.json', JSON.stringify(buildNext(), null, 2));
    onNotify('Downloaded pogo_config.json');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Sorter Settings
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Customize active PvP leagues, quality gates, and protection floors, then re-run instantaneously in the browser.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownloadCfg}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export pogo_config.json
          </button>
          <button
            type="button"
            disabled={!hasRawExport}
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-40 dark:bg-teal-500 dark:text-slate-950"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Apply &amp; Re-run Now
          </button>
          {!hasRawExport && (
            <span className="self-center text-[11px] text-amber-600">
              Load your PGSStats.json (not a saved report) to re-run.
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Active PvP Leagues &amp; Cups
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">Great League is always on.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableLeagues.map((lg) => {
              const on = leagues.includes(lg.id);
              return (
                <button
                  key={lg.id}
                  type="button"
                  onClick={() => toggleLeague(lg.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400'
                  }`}
                >
                  {lg.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {availableCups.map((c) => {
              const on = cups.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCup(c.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Protection &amp; Gate Thresholds
          </h2>
          <div className="mt-3 space-y-3 text-xs">
            <label className="flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-300">Auto-protect IV % floor</span>
              <input
                type="number"
                step="0.1"
                value={protectIv}
                onChange={(e) => setProtectIv(Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-right font-mono focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-300">Raid minimum IV %</span>
              <input
                type="number"
                value={raidMinIv}
                onChange={(e) => setRaidMinIv(Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-right font-mono focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-300">Raid minimum ATK IV (0–15)</span>
              <input
                type="number"
                min={0}
                max={15}
                value={raidMinAtk}
                onChange={(e) => setRaidMinAtk(Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-right font-mono focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            
            
            <label className="flex items-start justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-300">
                Max Battles: use each Dynamax Pokémon&apos;s current fast move
                <span className="block text-[11px] text-slate-500">
                  Its Max Move type follows its fast attack. Off = assume you will TM it to the best type.
                </span>
              </span>
              <input
                type="checkbox"
                checked={respectFast}
                onChange={(e) => setRespectFast(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
            </label>
            <label className="block space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">In-game tags that PROTECT a Pokémon from transfer (comma-separated)</span>
              <input
                type="text"
                value={protectTagText}
                onChange={(e) => setProtectTagText(e.target.value)}
                placeholder="e.g. trade, keep, sentinel"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">In-game tags to IGNORE when protecting, e.g. a tag you use for Pokémon to transfer (comma-separated)</span>
              <input
                type="text"
                value={excludeTagText}
                onChange={(e) => setExcludeTagText(e.target.value)}
                placeholder="e.g. transfer, bin, fodder"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
