import React from 'react';
import { X, Check, ArrowRight, Swords } from 'lucide-react';
import { compareTwoMons } from '../engine/bossAndCompare';
import type { ReportMon } from '../engine/types';
import { formatNum, VERDICT_COLORS, VERDICT_NAMES } from './uiTokens';
import { AppraisalBars } from './PokemonVisuals';

interface PokemonCompareModalProps {
  monA: ReportMon | null;
  monB: ReportMon | null;
  onClose: () => void;
  onInspectId: (id: string) => void;
  onNotify: (msg: string) => void;
}

export const PokemonCompareModal: React.FC<PokemonCompareModalProps> = ({
  monA,
  monB,
  onClose,
  onInspectId,
  onNotify,
}) => {
  if (!monA || !monB) return null;
  const comparison = compareTwoMons(monA, monB);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0B1623]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Side-by-Side Showdown (Compare Pokémon)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Plain-English Winner Summary */}
          <div className="rounded-xl border border-teal-500/30 bg-teal-500/8 p-4 dark:border-teal-500/20 dark:bg-teal-500/10">
            <div className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
              Plain-English Verdict &amp; Takeaways
            </div>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {comparison.takeaways.map((t, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Side-by-Side Column Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Mon A */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      onInspectId(monA.id);
                      onClose();
                    }}
                    className="font-display text-base font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {monA.species}
                  </button>
                  <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                    CP {formatNum(monA.cp)} · L{monA.level} · Dex #{monA.dex}
                  </div>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${VERDICT_COLORS[monA.verdict]}`}>
                  {VERDICT_NAMES[monA.verdict]}
                </span>
              </div>
              <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Appraisal</span>
                  <span className="font-mono">{monA.iv} ({monA.iv_pct}%)</span>
                </div>
                <div className="mt-1.5">
                  <AppraisalBars a={monA.a} d={monA.d} s={monA.s} compact />
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                <b>Role:</b> {monA.role || '—'}
              </div>
            </div>

            {/* Mon B */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      onInspectId(monB.id);
                      onClose();
                    }}
                    className="font-display text-base font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {monB.species}
                  </button>
                  <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                    CP {formatNum(monB.cp)} · L{monB.level} · Dex #{monB.dex}
                  </div>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${VERDICT_COLORS[monB.verdict]}`}>
                  {VERDICT_NAMES[monB.verdict]}
                </span>
              </div>
              <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Appraisal</span>
                  <span className="font-mono">{monB.iv} ({monB.iv_pct}%)</span>
                </div>
                <div className="mt-1.5">
                  <AppraisalBars a={monB.a} d={monB.d} s={monB.s} compact />
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                <b>Role:</b> {monB.role || '—'}
              </div>
            </div>
          </div>

          {/* Detailed Metric Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F1B28]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Metric</th>
                  <th className="px-4 py-2.5 font-semibold">{monA.species}</th>
                  <th className="px-4 py-2.5 font-semibold">{monB.species}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {comparison.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                      {row.label}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-mono ${
                        row.winner === 'a'
                          ? 'font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {row.valA} {row.winner === 'a' ? '✓' : ''}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-mono ${
                        row.winner === 'b'
                          ? 'font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {row.valB} {row.winner === 'b' ? '✓' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
