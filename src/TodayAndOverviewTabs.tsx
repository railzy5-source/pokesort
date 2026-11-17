import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ReportJson, VerdictType } from '../engine/types';
import { formatNum, type TabKey, TYPE_COLORS, VERDICT_COLORS, VERDICT_NAMES } from './uiTokens';

interface TodayTabProps {
  report: ReportJson;
  onJumpTab: (tab: TabKey) => void;
  onInspectId: (id: string) => void;
}

export const TodayTab: React.FC<TodayTabProps> = ({ report, onJumpTab, onInspectId }) => {
  const b = report.briefing;
  if (!b) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No briefing available in this report.
      </div>
    );
  }

  const h = b.headline;
  const st = b.storage;
  const ac = b.account;
  const dp = b.dust_plan;
  const buildableNowCount = (report.grade?.level_these || []).filter((r) => r.can_build_now).length;

  const statusTag = (status: string) => {
    const cls =
      status === 'live'
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        : status === 'soon'
        ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
        : 'bg-slate-500/15 text-slate-600 dark:text-slate-400';
    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
        {status === 'live' ? 'Live' : status === 'soon' ? 'Soon' : status === 'tbd' ? 'TBD' : 'Later'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Today — {b.date}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Active events &amp; raids, box boss counters, buddy priority, and immediate storage actions.
          </p>
        </div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{h.live} Live</span>
          {' · '}
          <span className="font-semibold text-teal-700 dark:text-teal-400">{h.soon} Soon</span>
        </div>
      </div>

      {/* Unified Top Account KPI Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Box Storage
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatNum(st.stored)} <span className="text-sm font-normal text-slate-400">/ {formatNum(st.cap)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {st.pct}% full · {formatNum(st.to_transfer)} safe to transfer
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Stardust &amp; Ready Builds
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-600 dark:text-amber-400">
            {formatNum(dp.dust)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {buildableNowCount} buildable now · {dp.queue_total} queued
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Bag Inventory
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span>Rare/XL <b className="font-mono text-slate-900 dark:text-slate-100">{ac.rare_candy}/{ac.xl_candy}</b></span>
            <span>Fast TM <b className="font-mono text-slate-900 dark:text-slate-100">{ac.fast_tms}</b></span>
            <span>Chg TM <b className="font-mono text-slate-900 dark:text-slate-100">{ac.charged_tms}</b></span>
            <span>Passes <b className="font-mono text-slate-900 dark:text-slate-100">{ac.premium_passes + ac.remote_passes}</b></span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Collection Snapshot
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span>Hundos <b className="font-mono text-slate-900 dark:text-slate-100">{ac.hundos}</b></span>
            <span>Shinies <b className="font-mono text-slate-900 dark:text-slate-100">{ac.shinies}</b></span>
            <span>Shadow <b className="font-mono text-slate-900 dark:text-slate-100">{ac.shadow}</b></span>
            <span>Lucky <b className="font-mono text-slate-900 dark:text-slate-100">{ac.lucky}</b></span>
          </div>
        </div>
      </div>

      {/* Headline Action Trio */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Next Steps
            </div>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">
              {h.do_first}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onJumpTab('out')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-500/50 hover:text-teal-700 dark:border-slate-700 dark:text-slate-200 dark:hover:text-teal-300"
            >
              Transfers ({st.to_transfer})
            </button>
            <button
              type="button"
              onClick={() => onJumpTab('plan')}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-500 dark:bg-teal-500 dark:text-slate-950"
            >
              Build Plan <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Best Buddy Walk
          </div>
          {h.buddy ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onInspectId(h.buddy!.id)}
                className="text-left text-base font-bold text-slate-900 transition hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
              >
                {h.buddy.name}
              </button>
              <div className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                CP {formatNum(h.buddy.cp)} · {h.buddy.iv_pct}% IV
                {h.buddy.mega_level > 0 ? ` · Mega Lv${h.buddy.mega_level}` : ''}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{h.buddy.why}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No priority buddy detected.</p>
          )}
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mega Priority
            </div>
            {h.mega_push ? (
              <div className="mt-2">
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {h.mega_push.name}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Mega Level {h.mega_push.level} boost ready for{' '}
                  <span className="font-medium text-slate-800 dark:text-slate-200">{h.mega_push.event}</span>.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No unlocked Mega detected yet.</p>
            )}
          </div>
          {h.mega_push && (
            <button
              type="button"
              onClick={() => onJumpTab('mega')}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
            >
              Open Mega coverage <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Focus Items */}
      {b.focus.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Immediate Focus
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {b.focus.map((f, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {f.title}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {f.when}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {f.lines.map((ln, i) => (
                      <li key={i}>{ln}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onJumpTab(f.tab as TabKey)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Review in workspace <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events & Boss Squads */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Events &amp; Raid Counter Squads
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {b.events_ok ? 'Synced from event feed' : 'Offline event snapshot'}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {b.events.map((ev) => (
            <div
              key={ev.id}
              className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {ev.name}
                    </h3>
                    {statusTag(ev.status)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {ev.heading} · {ev.when}
                  </div>
                </div>
                {ev.link && (
                  <a
                    href={ev.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 transition hover:text-teal-600 dark:hover:text-teal-400"
                    title="Open event source"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>

              {ev.bonuses.length > 0 && (
                <div className="mt-2.5 text-xs text-slate-600 dark:text-slate-400">
                  {ev.bonuses.slice(0, 3).join(' · ')}
                </div>
              )}

              {ev.species.length > 0 && (
                <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2 dark:divide-slate-800 dark:border-slate-800">
                  {ev.species.map((sp, i) => (
                    <div key={i} className="py-2.5 first:pt-1.5 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {sp.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          {sp.weak.slice(0, 3).map((w) => (
                            <span key={w.type} className="inline-flex items-center gap-1 capitalize">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: TYPE_COLORS[w.type] || '#64748b' }}
                              />
                              {w.type} <span className="font-mono">{w.x}×</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      {sp.squad.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {sp.squad.map((sq) => (
                            <button
                              key={sq.id}
                              type="button"
                              onClick={() => onInspectId(sq.id)}
                              className="rounded-md border border-slate-200 bg-slate-50/70 px-2 py-0.5 text-[11px] text-slate-700 transition hover:border-teal-500 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:text-teal-300"
                            >
                              {sq.name} <span className="font-mono text-slate-400">CP {sq.cp}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Unified Quick Jump Strip */}
      <div className="grid divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Trade &amp; Lucky
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {report.trade_matcher?.offers?.length || 0} rare offers ·{' '}
            {report.trade_matcher?.guaranteed_lucky_remaining ?? report.trade_matcher?.lucky_candidates.length ?? 0} Lucky
          </div>
          <button
            type="button"
            onClick={() => onJumpTab('trade')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
          >
            Trade Matcher <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Buddy &amp; Eggs
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {report.buddy_tracker?.evo_quests.length || 0} quests ·{' '}
            {report.eggs_summary?.total || report.meta.eggs || 0} eggs
          </div>
          <button
            type="button"
            onClick={() => onJumpTab('buddy')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
          >
            Buddy &amp; Eggs <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            PvP &amp; GBL Elo
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {report.gbl_summary?.current?.rating
              ? `${report.gbl_summary.current.rating} Elo`
              : `${report.saved_parties?.length || 0} parties`}
          </div>
          <button
            type="button"
            onClick={() => onJumpTab('pvp')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
          >
            PvP &amp; GBL <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Bag &amp; Live Gyms
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {report.live_gyms?.active_count || 0} in gym ·{' '}
            {report.items_audit?.expiring_items.length || 0} expiring
          </div>
          <button
            type="button"
            onClick={() => onJumpTab('items')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
          >
            Items &amp; Gyms <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Level XP &amp; Medals
          </div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {report.xp_planner?.has_data
              ? `L${report.xp_planner.level} (${report.xp_planner.progress_pct}%)`
              : `${report.medals_hub?.platinum_type_count || 0}/18 Plat`}
          </div>
          <button
            type="button"
            onClick={() => onJumpTab('medals')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
          >
            Medals &amp; XP <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface OverviewTabProps {
  report: ReportJson;
  onJumpVerdict: (v: VerdictType) => void;
  onJumpHold: (hold: string) => void;
  onJumpTab: (tab: TabKey) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  report,
  onJumpVerdict,
  onJumpHold,
  onJumpTab,
}) => {
  const vCounts = report.counts.verdicts || {};
  const verdictOrder: VerdictType[] = [
    'BUILD_PVP',
    'BUILD_MEGA',
    'BUILD_RAID',
    'BUILD_MAX',
    'BUILD_GYM',
    'KEEP',
    'TRADE',
    ...((vCounts['REVIEW'] || 0) > 0 ? (['REVIEW'] as VerdictType[]) : []),
    'TRANSFER',
  ];
  const rd = report.readiness?.status_counts || {};
  const sp = report.counts.special || {};
  const covOk = report.coverage.filter((c) => c.status === 'OK').length;
  const holds = report.holding || [];
  const auditFails = (report.audit || []).filter((a) => !a.ok);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Collection Overview
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Verdict distribution across {formatNum(report.meta.mons)} Pokémon, move readiness, raid coverage, and storage allocation.
          </p>
        </div>
        {report.grade && (
          <button
            type="button"
            onClick={() => onJumpTab('grade')}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3.5 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-500/20 dark:text-teal-300"
          >
            <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Account Grade: {report.grade.overall_pct}% ({report.grade.letter})
          </button>
        )}
      </div>

      {/* Audit Banner */}
      {report.audit && report.audit.length > 0 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs ${
            auditFails.length === 0
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {auditFails.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>
              Cross-Tab Self-Check: {report.audit.filter((a) => a.ok).length}/{report.audit.length} consistency checks passed
              {auditFails.length > 0 ? ` (${auditFails.map((f) => f.check).join(', ')})` : ''}
            </span>
          </div>
          <span className="font-mono opacity-80">{report.meta.pve_model}</span>
        </div>
      )}

      {/* Verdict Tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {verdictOrder.map((v) => {
          const count = vCounts[v] || 0;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onJumpVerdict(v)}
              className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-left transition hover:border-teal-500 dark:border-slate-800/90 dark:bg-[#0F1B28] dark:hover:border-teal-500"
            >
              <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${VERDICT_COLORS[v]}`}>
                {VERDICT_NAMES[v]}
              </span>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatNum(count)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Holding Breakdown */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Where Your {formatNum(report.meta.mons)} Pokémon Are Held
          </h2>
          <span className="text-xs text-slate-500">Click group to filter</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {holds.map((h) => {
            const pct = Math.round((100 * h.count) / Math.max(1, report.meta.mons));
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => onJumpHold(h.key)}
                className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-3.5 text-left transition hover:border-teal-500 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-teal-500"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <span>{h.label}</span>
                  <span className="font-mono tabular-nums">{formatNum(h.count)} ({pct}%)</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                  <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{h.explain}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Readiness, Special Finds, Raid Type Coverage */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Move Readiness ({report.readiness.eligible_total} builds)
          </h3>
          <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {Object.entries(rd).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2">
                <span className="text-slate-600 dark:text-slate-300">{k}</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Special Finds
          </h3>
          <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {Object.entries(sp).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2">
                <span className="capitalize text-slate-600 dark:text-slate-300">{k.replace('_', ' ')}</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Raid Type Coverage
            </h3>
            <span className="font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">
              {covOk}/{report.coverage.length} OK
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 text-xs">
            {report.coverage.map((c) => (
              <button
                key={c.type}
                type="button"
                onClick={() => onJumpTab('raid')}
                className="flex items-center justify-between rounded px-1.5 py-1 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="flex items-center gap-1.5 capitalize text-slate-700 dark:text-slate-300">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[c.type] || '#64748b' }}
                  />
                  {c.type}
                </span>
                <span
                  className={`font-mono text-[11px] font-semibold ${
                    c.status === 'OK'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {c.usable}/{report.coverage_min}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes */}
      {report.notes.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 text-xs text-slate-600 dark:border-slate-800/90 dark:bg-[#0F1B28] dark:text-slate-400">
          {report.notes.map((n, i) => (
            <div key={i}>• {n}</div>
          ))}
        </div>
      )}
    </div>
  );
};
