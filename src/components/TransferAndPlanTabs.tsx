import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  Check,
  Copy,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { ReportJson } from '../engine/types';
import { copyToClipboard, formatNum, type TabKey } from './uiTokens';

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

interface TransferTabProps {
  report: ReportJson;
  confirmedIds: Set<string>;
  onToggleConfirmId: (id: string) => void;
  onBulkConfirmIds: (ids: string[], add: boolean) => void;
  onApplyConfirmedTransfers: () => void;
  onNotify: (msg: string) => void;
  onInspectId: (id: string) => void;
}

export const TransferTab: React.FC<TransferTabProps> = ({
  report,
  confirmedIds,
  onToggleConfirmId,
  onBulkConfirmIds,
  onApplyConfirmedTransfers,
  onNotify,
  onInspectId,
}) => {
  const T = report.transfer;
  const rt = T.review_triage;
  const tagAudit = report.tag_audit;
  const originProt = report.origin_protection;
  const collisionEntries = Object.entries(T.collisions || {});
  const chunks = T.mass_search_chunks || [];
  const [auditFilter, setAuditFilter] = useState<'all' | 'wrong_cap' | 'duplicate_league' | 'transfer_tagged' | 'untagged_build'>('all');
  const [auditTagFilter, setAuditTagFilter] = useState<string>('all');
  const [showAllAudit, setShowAllAudit] = useState(false);

  // Sort states
  const [auditSort, setAuditSort] = useState<'tag' | 'category' | 'species' | 'cp' | 'verdict'>('tag');
  const [auditDir, setAuditDir] = useState<SortDir>('asc');

  const [lastLookSort, setLastLookSort] = useState<'triggers' | 'iv' | 'cp' | 'level' | 'species'>('triggers');
  const [lastLookDir, setLastLookDir] = useState<SortDir>('desc');
  const [showAllLastLook, setShowAllLastLook] = useState(false);

  const [reviewSort, setReviewSort] = useState<'bucket' | 'iv' | 'cp' | 'level' | 'species'>('bucket');
  const [reviewDir, setReviewDir] = useState<SortDir>('asc');

  const [transferView, setTransferView] = useState<'table' | 'groups'>('table');
  const [transferSort, setTransferSort] = useState<'cp' | 'iv' | 'level' | 'species' | 'role'>('cp');
  const [transferDir, setTransferDir] = useState<SortDir>('desc');
  const [groupSort, setGroupSort] = useState<'count' | 'species' | 'cp' | 'iv'>('count');
  const [groupDir, setGroupDir] = useState<SortDir>('desc');

  const copySearch = async (s: string, label: string) => {
    const ok = await copyToClipboard(s);
    onNotify(ok ? `Copied ${label}` : 'Copy failed');
  };

  const primaryTransferQuery = chunks[0]?.query || T.groups[0]?.search || '';

  const reviewList = useMemo(() => {
    const raw = [
      ...rt.probably_transfer,
      ...rt.uncertain,
      ...rt.probably_keep,
    ];
    const bucketRank: Record<string, number> = { probably_transfer: 0, uncertain: 1, probably_keep: 2 };
    const mul = reviewDir === 'asc' ? 1 : -1;
    return [...raw].sort((a, b) => {
      if (reviewSort === 'bucket') return (bucketRank[a.bucket] - bucketRank[b.bucket]) * mul || b.iv_pct - a.iv_pct;
      if (reviewSort === 'iv') return (a.iv_pct - b.iv_pct) * mul || b.cp - a.cp;
      if (reviewSort === 'cp') return (a.cp - b.cp) * mul || b.iv_pct - a.iv_pct;
      if (reviewSort === 'level') return (a.level - b.level) * mul || b.iv_pct - a.iv_pct;
      return a.species.localeCompare(b.species) * mul || b.cp - a.cp;
    });
  }, [rt, reviewSort, reviewDir]);

  const sortedLastLook = useMemo(() => {
    const mul = lastLookDir === 'asc' ? 1 : -1;
    return [...T.last_look].sort((a, b) => {
      if (lastLookSort === 'triggers') return (a.triggers.length - b.triggers.length) * mul || b.iv_pct - a.iv_pct;
      if (lastLookSort === 'iv') return (a.iv_pct - b.iv_pct) * mul || b.cp - a.cp;
      if (lastLookSort === 'cp') return (a.cp - b.cp) * mul || b.iv_pct - a.iv_pct;
      if (lastLookSort === 'level') return (a.level - b.level) * mul || b.iv_pct - a.iv_pct;
      return a.species.localeCompare(b.species) * mul || b.cp - a.cp;
    });
  }, [T.last_look, lastLookSort, lastLookDir]);

  const auditAvailableTags = useMemo(() => {
    const s = new Set<string>();
    for (const m of tagAudit?.mismatches || []) {
      for (const t of m.tags || []) s.add(t);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [tagAudit]);

  const auditTagLabel = (m: NonNullable<typeof tagAudit>['mismatches'][number]) => {
    if (m.tags && m.tags.length > 0) return m.tags.join(', ');
    if (m.recommended_tag) return `Untagged -> ${m.recommended_tag}`;
    return 'Untagged';
  };

  const sortedAudit = useMemo(() => {
    const filtered = (tagAudit?.mismatches || []).filter((m) => {
      if (auditFilter !== 'all' && m.category !== auditFilter) return false;
      if (auditTagFilter === '__untagged__') return !m.tags || m.tags.length === 0;
      if (auditTagFilter !== 'all') return (m.tags || []).includes(auditTagFilter);
      return true;
    });
    const mul = auditDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (auditSort === 'tag') {
        const aTagged = (a.tags?.length || 0) > 0 ? 0 : 1;
        const bTagged = (b.tags?.length || 0) > 0 ? 0 : 1;
        if (aTagged !== bTagged) return (aTagged - bTagged) * mul;
        const aLbl = (a.tags?.[0] || a.recommended_tag || 'zzz').toLowerCase();
        const bLbl = (b.tags?.[0] || b.recommended_tag || 'zzz').toLowerCase();
        return aLbl.localeCompare(bLbl) * mul || b.cp - a.cp;
      }
      if (auditSort === 'category') return a.category.localeCompare(b.category) * mul || b.cp - a.cp;
      if (auditSort === 'cp') return (a.cp - b.cp) * mul;
      if (auditSort === 'verdict') return a.verdict.localeCompare(b.verdict) * mul || b.cp - a.cp;
      return a.species.localeCompare(b.species) * mul || b.cp - a.cp;
    });
  }, [tagAudit, auditFilter, auditTagFilter, auditSort, auditDir]);

  const transferMons = useMemo(() => {
    const list = report.mons.filter((m) => m.verdict === 'TRANSFER');
    const mul = transferDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (transferSort === 'cp') return (a.cp - b.cp) * mul || b.iv_pct - a.iv_pct;
      if (transferSort === 'iv') return (a.iv_pct - b.iv_pct) * mul || b.cp - a.cp;
      if (transferSort === 'level') return (a.level - b.level) * mul || b.cp - a.cp;
      if (transferSort === 'role') return a.role.localeCompare(b.role) * mul || b.cp - a.cp;
      return a.species.localeCompare(b.species) * mul || b.cp - a.cp;
    });
  }, [report.mons, transferSort, transferDir]);

  const sortedGroups = useMemo(() => {
    const mul = groupDir === 'asc' ? 1 : -1;
    return [...T.groups].sort((a, b) => {
      if (groupSort === 'count') return (a.count - b.count) * mul || a.species.localeCompare(b.species);
      if (groupSort === 'cp') {
        const aMax = Math.max(...a.rows.map((r) => r.cp), 0);
        const bMax = Math.max(...b.rows.map((r) => r.cp), 0);
        return (aMax - bMax) * mul;
      }
      if (groupSort === 'iv') {
        const aMax = Math.max(...a.rows.map((r) => r.iv_pct), 0);
        const bMax = Math.max(...b.rows.map((r) => r.iv_pct), 0);
        return (aMax - bMax) * mul;
      }
      return a.species.localeCompare(b.species) * mul || b.count - a.count;
    });
  }, [T.groups, groupSort, groupDir]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {reviewList.length > 0 ? 'Transfer & Review Triage' : 'Transfer Triage'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            {formatNum(T.total)} safe to transfer · {formatNum(T.protected)} protected. Verify shiny, background, and Last Look triggers before mass transferring.
          </p>
        </div>

        <button
          type="button"
          disabled={!primaryTransferQuery}
          onClick={() =>
            copySearch(
              primaryTransferQuery,
              chunks[0]
                ? `Transfer search (${chunks[0].count} mons)`
                : `Transfer search`,
            )
          }
          className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:opacity-40 dark:bg-teal-500 dark:text-slate-950"
        >
          <Copy className="h-3.5 w-3.5" />
          {chunks.length > 1
            ? `Copy Transfer Chunk 1 (${chunks[0].count} mons)`
            : `Copy Transfer Search (${chunks[0]?.count ?? T.total})`}
        </button>
      </div>

      {/* Collision-Proof Mass-Transfer Chunks */}
      {chunks.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-emerald-800 dark:text-emerald-300">
                Collision-Proof Mass-Transfer Chunks ({chunks.length} {chunks.length === 1 ? 'chunk' : 'chunks'}, &le; 1,950 chars each)
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                Uses valid Pokémon GO <code className="font-mono">guard&amp;dex,dex&amp;cp,cp</code> syntax with zero cross-collisions against Keep/Trade/Build mons.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {chunks.map((ch) => (
                <button
                  key={ch.index}
                  type="button"
                  onClick={() => copySearch(ch.query, `Chunk ${ch.index} (${ch.count} mons, ${ch.length} chars)`)}
                  className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:bg-[#0F1B28] dark:text-emerald-300"
                >
                  <Copy className="h-3 w-3" />
                  Chunk {ch.index} · {ch.count} mons ({ch.length}/1950)
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Safeguard Collisions */}
      {collisionEntries.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Search String Collision Guard ({collisionEntries.length})
          </div>
          <p className="mt-1">
            These species+CP search queries match both a TRANSFER and a protected/kept Pokémon in your bag — excluded from chunks above:
          </p>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            {collisionEntries.slice(0, 6).map(([searchStr, list]) => (
              <div key={searchStr}>
                {searchStr} <span className="opacity-80">(protects {list.map((x) => x.iv).join(', ')})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* #7 In-Game Tag Cleanup & Sync Audit */}
      {tagAudit && tagAudit.total_mismatches > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                In-Game Tag Sync Audit ({tagAudit.total_mismatches} mismatches)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Flags wrong CP caps, inferior duplicate league tags, TRANSFER Pokémon holding keeper tags, and untagged BUILD Pokémon.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tagAudit.untagged_build_search && (
                <button
                  type="button"
                  onClick={() => copySearch(tagAudit.untagged_build_search, 'untagged BUILD search')}
                  className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-200"
                >
                  <Copy className="h-3 w-3" /> Copy Untagged Builds ({tagAudit.untagged_build_count})
                </button>
              )}
              {tagAudit.transfer_tagged_search && (
                <button
                  type="button"
                  onClick={() => copySearch(tagAudit.transfer_tagged_search, 'tagged TRANSFER search')}
                  className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                >
                  <Copy className="h-3 w-3" /> Copy Tagged Transfers ({tagAudit.transfer_tagged_count})
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', `All (${tagAudit.total_mismatches})`],
                  ['wrong_cap', `Wrong Cap (${tagAudit.wrong_cap_count})`],
                  ['duplicate_league', 'Duplicate League'],
                  ['transfer_tagged', `Transfer w/ Tag (${tagAudit.transfer_tagged_count})`],
                  ['untagged_build', `Untagged Build (${tagAudit.untagged_build_count})`],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAuditFilter(k)}
                  className={`shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                    auditFilter === k
                      ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <select
                value={auditTagFilter}
                onChange={(e) => setAuditTagFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">Tag: All</option>
                <option value="__untagged__">Tag: Untagged</option>
                {auditAvailableTags.map((t) => (
                  <option key={t} value={t}>
                    Tag: #{t}
                  </option>
                ))}
              </select>
              <select
                value={auditSort}
                onChange={(e) => setAuditSort(e.target.value as typeof auditSort)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="tag">Sort: Tag</option>
                <option value="category">Sort: Category</option>
                <option value="species">Sort: Species</option>
                <option value="cp">Sort: CP</option>
                <option value="verdict">Sort: Verdict</option>
              </select>
              <button
                type="button"
                onClick={() => setAuditDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowDownUp className="h-3 w-3" />
                {auditDir.toUpperCase()}
              </button>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {(showAllAudit ? sortedAudit : sortedAudit.slice(0, 30)).map((m, idx) => (
                <div
                  key={`${m.id}-${m.category}-${idx}`}
                  className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onInspectId(m.id)}
                        className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {m.species}
                      </button>
                      <span className="font-mono text-slate-500">
                        CP {formatNum(m.cp)} · {m.iv}
                      </span>
                      {m.tags && m.tags.length > 0 ? (
                        m.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-300"
                          >
                            #{t}
                          </span>
                        ))
                      ) : (
                        <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {auditTagLabel(m)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {m.issue}
                    </div>
                    <div className="text-[11px] text-slate-500">{m.suggestion}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copySearch(m.search, m.species)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" /> Search
                  </button>
                </div>
              ))}
            {sortedAudit.length === 0 && (
              <div className="py-4 text-center text-slate-500">
                No tag mismatches match the current filters.
              </div>
            )}
          </div>
          {sortedAudit.length > 30 && (
            <button
              type="button"
              onClick={() => setShowAllAudit((v) => !v)}
              className="mt-2 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
            >
              {showAllAudit ? 'Show fewer' : `Show all ${sortedAudit.length} mismatches`}
            </button>
          )}
        </div>
      )}

      {/* #5 Origin Moves, Fusions & Event Backgrounds Protection */}
      {originProt && (originProt.protected_count > 0 || originProt.active_tickets.length > 0) && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Origin Moves, Fusions &amp; Event Background Guard ({originProt.protected_count} protected)
            </h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {originProt.origin_moves_count} Origin Moves · {originProt.event_background_count} Backgrounds · {originProt.fusion_count} Fusions
            </span>
          </div>
          {originProt.active_tickets.length > 0 && (
            <div className="mt-2 text-xs text-teal-700 dark:text-teal-300">
              Active Event Tickets:{' '}
              {originProt.active_tickets.map((tk) => `${tk.id} (${tk.start}–${tk.end})`).join(' · ')}
            </div>
          )}
          {originProt.items.length > 0 && (
            <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {originProt.items.slice(0, 12).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div>
                    <button
                      type="button"
                      onClick={() => onInspectId(item.id)}
                      className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                    >
                      {item.species}
                    </button>{' '}
                    <span className="font-mono text-slate-500">
                      CP {formatNum(item.cp)} · {item.iv}
                    </span>
                    <div className="text-[11px] text-purple-700 dark:text-purple-300">
                      {item.reasons.join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copySearch(item.search, item.species)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Copy className="h-3 w-3" /> Search
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last Look Section */}
      {sortedLastLook.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Last Look ({sortedLastLook.length}) — Double-check before transferring
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <select
                value={lastLookSort}
                onChange={(e) => setLastLookSort(e.target.value as typeof lastLookSort)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="triggers">Sort: Triggers</option>
                <option value="iv">Sort: IV%</option>
                <option value="cp">Sort: CP</option>
                <option value="level">Sort: Level</option>
                <option value="species">Sort: Species</option>
              </select>
              <button
                type="button"
                onClick={() => setLastLookDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowDownUp className="h-3 w-3" />
                {lastLookDir.toUpperCase()}
              </button>
              {sortedLastLook.length > 15 && (
                <button
                  type="button"
                  onClick={() => setShowAllLastLook((v) => !v)}
                  className="ml-1 text-[11px] font-semibold text-teal-600 hover:underline dark:text-teal-400"
                >
                  {showAllLastLook ? 'Show 15' : `All (${sortedLastLook.length})`}
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(showAllLastLook ? sortedLastLook : sortedLastLook.slice(0, 15)).map((item) => (
              <div key={item.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() => onInspectId(item.id)}
                    className="text-sm font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {item.species}
                  </button>{' '}
                  <span className="font-mono text-xs text-slate-500">
                    CP {item.cp} · {item.iv} ({item.iv_pct}%) · L{item.level}
                  </span>
                  <div className="mt-1 text-[11px] font-medium text-orange-700 dark:text-orange-300">
                    {item.triggers.join(' · ')}
                  </div>
                  {item.kept_comparators.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Kept comparators:{' '}
                      {item.kept_comparators.map((c) => `${c.iv} (${c.iv_pct}% ${c.verdict})`).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => copySearch(item.search, item.species)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                >
                  <Copy className="h-3 w-3" /> Search
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Review Triage */}
      {reviewList.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Interactive Review Triage ({reviewList.length} pending decision)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tick Pokémon to move into TRANSFER, then click Apply &amp; Re-run.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reviewSort}
                onChange={(e) => setReviewSort(e.target.value as typeof reviewSort)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="bucket">Sort: Priority Bucket</option>
                <option value="iv">Sort: IV%</option>
                <option value="cp">Sort: CP</option>
                <option value="level">Sort: Level</option>
                <option value="species">Sort: Species</option>
              </select>
              <button
                type="button"
                onClick={() => setReviewDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
              >
                <ArrowDownUp className="h-3 w-3" />
                {reviewDir.toUpperCase()}
              </button>
              {rt.probably_transfer.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onBulkConfirmIds(
                      rt.probably_transfer.map((x) => x.id),
                      true,
                    )
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                >
                  Select All “Probably Transfer” ({rt.probably_transfer.length})
                </button>
              )}
              <button
                type="button"
                onClick={onApplyConfirmedTransfers}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Apply ({confirmedIds.size}) &amp; Re-run
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reviewList.map((item) => {
              const checked = confirmedIds.has(item.id);
              const badgeCls =
                item.bucket === 'probably_transfer'
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : item.bucket === 'probably_keep'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleConfirmId(item.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 accent-rose-600"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.species}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          CP {item.cp} · {item.iv} ({item.iv_pct}%) · L{item.level}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeCls}`}>
                          {item.bucket.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.reasons.join(' · ')}
                      </div>
                    </div>
                  </label>

                  <div className="flex items-center gap-2 pl-7 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => onInspectId(item.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-teal-500 hover:text-teal-700 dark:border-slate-700 dark:text-slate-300"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sortable Transfer List (Table or Species Groups) */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Trash2 className="h-4 w-4 text-rose-500" />
            Transfer List ({transferMons.length} Pokémon · {T.groups.length} species)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-[#0F1B28]">
              <button
                type="button"
                onClick={() => setTransferView('table')}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  transferView === 'table'
                    ? 'bg-teal-500/15 text-teal-800 dark:text-teal-300'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sortable Table
              </button>
              <button
                type="button"
                onClick={() => setTransferView('groups')}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  transferView === 'groups'
                    ? 'bg-teal-500/15 text-teal-800 dark:text-teal-300'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                By Species
              </button>
            </div>

            {transferView === 'groups' && (
              <>
                <select
                  value={groupSort}
                  onChange={(e) => setGroupSort(e.target.value as typeof groupSort)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="count">Sort: Count</option>
                  <option value="species">Sort: Species A–Z</option>
                  <option value="cp">Sort: Highest CP</option>
                  <option value="iv">Sort: Highest IV%</option>
                </select>
                <button
                  type="button"
                  onClick={() => setGroupDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-300"
                >
                  <ArrowDownUp className="h-3 w-3" />
                  {groupDir.toUpperCase()}
                </button>
              </>
            )}
          </div>
        </div>

        {transferMons.length === 0 ? (
          <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            No Pokémon marked safe for transfer right now.
          </div>
        ) : transferView === 'table' ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  {(
                    [
                      ['species', 'Pokémon', 'text-left', 'asc'],
                      ['cp', 'CP', 'text-right', 'desc'],
                      ['iv', 'IV%', 'text-right', 'desc'],
                      ['level', 'Level', 'text-right', 'desc'],
                      ['role', 'Reason', 'text-left', 'asc'],
                    ] as const
                  ).map(([k, lbl, align, defDir]) => (
                    <th key={k} className={`px-4 py-2.5 font-semibold ${align}`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(transferSort, k, transferDir, setTransferSort, setTransferDir, defDir)}
                        className="inline-flex items-center gap-1 hover:text-teal-600 dark:hover:text-teal-400"
                      >
                        {lbl}
                        {transferSort === k && (
                          <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400">
                            {transferDir === 'asc' ? '▲' : '▼'}
                          </span>
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-semibold">Search</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transferMons.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/35">
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => onInspectId(m.id)}
                        className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {m.species}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {formatNum(m.cp)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                      {m.iv} ({m.iv_pct}%)
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500">
                      L{m.level}
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {m.role}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => copySearch(m.search, m.species)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sortedGroups.map((g) => (
              <div
                key={g.species}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {g.species}
                    </span>
                    <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                      {g.count}
                    </span>
                  </div>
                  <div className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {g.rows.slice(0, 6).map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-1">
                        <button
                          type="button"
                          onClick={() => onInspectId(r.id)}
                          className="font-mono text-slate-700 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400"
                        >
                          CP {r.cp} · {r.iv}
                        </button>
                        <span className="text-slate-500">
                          {r.iv_pct}% · L{r.level}
                        </span>
                      </div>
                    ))}
                    {g.rows.length > 6 && (
                      <div className="pt-1 text-[11px] text-slate-400">
                        +{g.rows.length - 6} more in search string
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copySearch(g.search, `${g.species} search`)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700 dark:border-slate-700 dark:text-slate-200 dark:hover:text-teal-300"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Search ({g.count})
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface BuildPlanTabProps {
  report: ReportJson;
  onJumpTab: (tab: TabKey) => void;
  onNotify: (msg: string) => void;
  onInspectId: (id: string) => void;
}

export const BuildPlanTab: React.FC<BuildPlanTabProps> = ({
  report,
  onJumpTab,
  onNotify,
  onInspectId,
}) => {
  const [showAllReady, setShowAllReady] = useState(false);
  const [showAllBlocked, setShowAllBlocked] = useState(false);
  const [planSort, setPlanSort] = useState<'impact' | 'dust' | 'cp' | 'level' | 'species'>('impact');
  const [planDir, setPlanDir] = useState<SortDir>('desc');
  const g = report.grade;
  if (!g) return null;

  const tm = g.tm_here || { regular: [], elite_worth: [], elite_skip: { count: 0, summary: '' } };
  const lv = (g.level_these || []).filter(
    (r) =>
      r.cost.dust > 0 ||
      r.cost.candy > 0 ||
      r.cost.xl > 0 ||
      Boolean(r.needs_second_move) ||
      r.tm_needed.length > 0 ||
      r.evolve_to,
  );
  const bag = report.bag_resources;
  const dustBudget = bag?.stardust ?? report.budget?.stardust ?? null;

  const sortPlanRows = (rows: typeof lv) => {
    const mul = planDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (planSort === 'impact') return (a.impact - b.impact) * mul || a.cost.dust - b.cost.dust;
      if (planSort === 'dust') return (a.cost.dust - b.cost.dust) * mul || b.impact - a.impact;
      if (planSort === 'cp') return (a.cp - b.cp) * mul;
      if (planSort === 'level') return (a.level - b.level) * mul;
      return a.species.localeCompare(b.species) * mul;
    });
  };

  const hasReadinessFlags = lv.some((r) => r.can_build_now !== undefined);
  const canBuildNow = sortPlanRows(
    hasReadinessFlags
      ? lv.filter((r) => r.can_build_now)
      : dustBudget
      ? lv.filter((r) => r.cost.dust <= dustBudget)
      : lv,
  );
  const blockedQueue = sortPlanRows(
    hasReadinessFlags
      ? lv.filter((r) => !r.can_build_now)
      : dustBudget
      ? lv.filter((r) => r.cost.dust > dustBudget)
      : [],
  );

  const copySearch = async (s: string, label: string) => {
    const ok = await copyToClipboard(s);
    onNotify(ok ? `Copied ${label}` : 'Copy failed');
  };

  const priorityTone = (score: number) => {
    if (score >= 80) return 'text-teal-700 dark:text-teal-300';
    if (score >= 68) return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  const renderBuildRow = (r: (typeof lv)[0], idx: number) => (
    <div
      key={r.id}
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onInspectId(r.id)}
            className="text-sm font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
          >
            {idx + 1}. {r.species} ({r.iv})
          </button>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            CP {formatNum(r.cp)} · L{r.level}
            {r.evolve_to ? ` → ${r.evolve_to}` : ''}
            {r.power_up_to ? ` → L${r.power_up_to}` : ''}
          </span>
          {r.gap_fix && (
            <span className="text-xs font-semibold capitalize text-rose-600 dark:text-rose-400">
              Fixes {r.gap_fix} gap
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{r.role}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {r.cost.dust > 0 && (
            <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {formatNum(r.cost.dust)} dust · {formatNum(r.cost.candy)} candy
              {r.cost.xl > 0 ? ` · ${r.cost.xl} XL` : ''}
            </span>
          )}
          {r.needs_second_move && (
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              Needs 2nd Charged Move
            </span>
          )}
          {(r.tm_typed && r.tm_typed.length > 0 ? r.tm_typed : null) ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
              {r.tm_typed!.map((t, i) => {
                const kind = `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM`;
                const cls = t.elite
                  ? 'text-rose-600 dark:text-rose-400'
                  : t.slot === 'fast'
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-amber-600 dark:text-amber-400';
                return (
                  <span key={`${t.name}-${i}`} className={cls}>
                    {kind}: <span className="font-semibold">{t.name}</span>
                  </span>
                );
              })}
            </span>
          ) : (
            r.tm_needed.length > 0 && (
              <span className="font-medium text-rose-600 dark:text-rose-400">
                {r.tm_needed.join(' · ')}
              </span>
            )
          )}
          {r.blockers && r.blockers.length > 0 && (
            <span className="font-medium text-rose-600 dark:text-rose-400">
              Blocked: {r.blockers.join(' · ')}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className={`font-mono text-xs font-semibold tabular-nums ${priorityTone(r.impact)}`}>
          Priority {r.impact}/100
        </span>
        <button
          type="button"
          onClick={() => copySearch(r.search, r.species)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:text-slate-300"
        >
          <Copy className="h-3 w-3" /> Search
        </button>
      </div>
    </div>
  );

  const visibleReady = showAllReady ? canBuildNow : canBuildNow.slice(0, 15);
  const visibleBlocked = showAllBlocked ? blockedQueue : blockedQueue.slice(0, 15);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Bag-Aware Build Plan &amp; Resource Queue
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Ranked by meta role, PvP IV rank or Raid DPS, coverage gaps, and upgrade efficiency using your real bag resources.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={planSort}
            onChange={(e) => setPlanSort(e.target.value as typeof planSort)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200"
          >
            <option value="impact">Sort: Priority</option>
            <option value="dust">Sort: Dust Cost</option>
            <option value="cp">Sort: CP</option>
            <option value="level">Sort: Level</option>
            <option value="species">Sort: Species A–Z</option>
          </select>
          <button
            type="button"
            onClick={() => setPlanDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-300"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            {planDir.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={() => onJumpTab('bottle')}
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200"
          >
            Bottle Caps <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onJumpTab('power')}
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200"
          >
            PvP Power-Up Priority <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Unified Bag Inventory Bar */}
      {bag && (
        <div className="grid grid-cols-2 divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-6 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stardust</div>
            <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {formatNum(bag.stardust)}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rare Candy / XL</div>
            <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {formatNum(bag.rare_candy)} / {formatNum(bag.xl_candy)}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fast / Charged TMs</div>
            <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {bag.fast_tms} / {bag.charged_tms}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Elite Fast / Chg</div>
            <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {bag.elite_fast_tms} / {bag.elite_charged_tms}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Evo Stones (Sin/Uno)</div>
            <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {bag.sinnoh_stones} / {bag.unova_stones}
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fusion &amp; Cells</div>
            <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
              Z {formatNum(bag.crowned_zacian_energy)} · Zm {formatNum(bag.crowned_zamazenta_energy)}
            </div>
            {(bag.zygarde_cells > 0 ||
              bag.solar_fusion_energy > 0 ||
              bag.lunar_fusion_energy > 0 ||
              bag.blaze_fusion_energy > 0 ||
              bag.volt_fusion_energy > 0) && (
              <div className="mt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
                Sol {bag.solar_fusion_energy} · Lun {bag.lunar_fusion_energy} · Blz {bag.blaze_fusion_energy} · Vlt {bag.volt_fusion_energy} · Zyg {bag.zygarde_cells}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Can Build Right Now */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            Can Build Right Now ({canBuildNow.length})
          </h2>
          {canBuildNow.length > 15 && (
            <button
              type="button"
              onClick={() => setShowAllReady((v) => !v)}
              className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
            >
              {showAllReady ? 'Show top 15' : `Show all (${canBuildNow.length})`}
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleReady.map((r, i) => renderBuildRow(r, i))}
          {canBuildNow.length === 0 && (
            <div className="py-4 text-xs text-slate-500">
              No queued builds currently have all required Stardust, Candy/XL, TMs, and Evolution items.
            </div>
          )}
        </div>
      </div>

      {blockedQueue.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Blocked by Resources ({blockedQueue.length})
            </h2>
            {blockedQueue.length > 15 && (
              <button
                type="button"
                onClick={() => setShowAllBlocked((v) => !v)}
                className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
              >
                {showAllBlocked ? 'Show top 15' : `Show all (${blockedQueue.length})`}
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleBlocked.map((r, i) => renderBuildRow(r, i))}
          </div>
        </div>
      )}

      {/* TMs & Evolutions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            TMs Worth Using ({tm.elite_worth.length + tm.regular.length})
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tm.elite_skip?.summary}
          </p>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {[...tm.elite_worth.slice(0, 4), ...tm.regular.slice(0, 8)].map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <button
                    type="button"
                    onClick={() => onInspectId(r.id)}
                    className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {r.species}
                  </button>{' '}
                  <span className="font-mono tabular-nums text-slate-500">CP {formatNum(r.cp)}</span>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-medium">
                    {r.needs_second_move && (
                      <span className="font-semibold text-sky-600 dark:text-sky-400">
                        Needs 2nd Charged Move
                      </span>
                    )}
                    {r.needs_typed && r.needs_typed.length > 0 ? (
                      r.needs_typed.map((t, idx) => {
                        const kind = `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM`;
                        const cls = t.elite
                          ? 'text-rose-600 dark:text-rose-400'
                          : t.slot === 'fast'
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-amber-600 dark:text-amber-400';
                        return (
                          <span key={`${t.name}-${idx}`} className={cls}>
                            {kind}: <span className="font-semibold">{t.name}</span>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Needs: {r.needs}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copySearch(r.search, r.species)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] hover:border-teal-500 dark:border-slate-700"
                >
                  Copy
                </button>
              </div>
            ))}
            {tm.elite_worth.length + tm.regular.length === 0 && (
              <div className="py-3 text-xs text-slate-500">
                <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                No urgent TM fixes queued.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Ready to Evolve ({report.evolve.length})
          </h2>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {report.evolve.slice(0, 12).map((ev, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {ev.species} → {ev.target}
                  </span>
                  <div className="text-slate-500">
                    {ev.role}
                    {ev.item && (
                      <span className="ml-1.5 font-semibold text-purple-700 dark:text-purple-300">
                        · Needs {ev.item}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <div>CP {formatNum(ev.cp)} · {ev.iv}</div>
                  {ev.candy > 0 && <div className="text-amber-600 dark:text-amber-400">{ev.candy} candy</div>}
                </div>
              </div>
            ))}
            {report.evolve.length === 0 && (
              <div className="py-3 text-xs text-slate-500">No evolutions queued.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PowerTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
}

export const PowerTab: React.FC<PowerTabProps> = ({ report, onInspectId }) => {
  const [sub, setSub] = useState<'ml' | 'glul' | 'dn'>('ml');
  const [powerSort, setPowerSort] = useState<'default' | 'iv_rank' | 'dust' | 'cp' | 'species'>('default');
  const [powerDir, setPowerDir] = useState<SortDir>('asc');
  const p = report.priority;
  const rows = useMemo(() => {
    const raw = (p[sub] || []).slice(0, 60);
    if (powerSort === 'default') return powerDir === 'asc' ? raw : [...raw].reverse();
    const mul = powerDir === 'asc' ? 1 : -1;
    return [...raw].sort((a, b) => {
      if (powerSort === 'iv_rank') return (a.iv_rank - b.iv_rank) * mul;
      if (powerSort === 'dust') return ((a.dust || 0) - (b.dust || 0)) * mul;
      if (powerSort === 'cp') return (a.cp - b.cp) * mul;
      return a.species.localeCompare(b.species) * mul;
    });
  }, [p, sub, powerSort, powerDir]);
  const tabs: { k: 'ml' | 'glul' | 'dn'; label: string }[] = [
    { k: 'ml', label: `Master League (${p.ml.length})` },
    { k: 'glul', label: `Great & Ultra (${p.glul.length})` },
    { k: 'dn', label: `Do Not Invest (${p.dn.length})` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          PvP Power-Up Priority
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Ordered by combined Species Meta Rank + IV Rank with full Stardust, Candy, and XL Candy estimates.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setSub(t.k)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                sub === t.k
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <select
            value={powerSort}
            onChange={(e) => setPowerSort(e.target.value as typeof powerSort)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="default">Sort: Meta Priority</option>
            <option value="iv_rank">Sort: IV Rank</option>
            <option value="dust">Sort: Dust Cost</option>
            <option value="cp">Sort: CP</option>
            <option value="species">Sort: Species A–Z</option>
          </select>
          <button
            type="button"
            onClick={() => setPowerDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-500 dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-300"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            {powerDir.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => (
          <div
            key={`${r.id}-${r.league}`}
            className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => onInspectId(r.id)}
                className="text-left text-sm font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
              >
                {i + 1}. {r.species}
              </button>
              <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                {r.tag}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums text-slate-500">
              CP {formatNum(r.cp)} · {r.iv} · IV rank #{r.iv_rank}
            </div>
            {r.hint ? (
              <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{r.hint}</div>
            ) : (
              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs tabular-nums dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">
                    L{r.from} → L{r.to} (CP {formatNum(r.target_cp)})
                  </span>
                  <span className="font-mono text-amber-600 dark:text-amber-400">
                    {formatNum(r.dust)} dust{r.xl > 0 ? ` · ${r.xl} XL` : ''}
                  </span>
                </div>
                {r.needs_second_move && (
                  <div className="font-semibold text-sky-600 dark:text-sky-400">
                    Needs 2nd Charged Move
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="col-span-full rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            No entries in this category.
          </div>
        )}
      </div>
    </div>
  );
};
