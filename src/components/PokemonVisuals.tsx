import React from 'react';
import { TYPE_COLORS } from './uiTokens';

export const PokeballMark: React.FC<{ className?: string }> = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <circle
      cx="16"
      cy="16"
      r="13.5"
      className="fill-white dark:fill-slate-900"
      stroke="currentColor"
      strokeWidth="2.2"
    />
    <path
      d="M2.6 16C2.6 8.6 8.6 2.6 16 2.6C23.4 2.6 29.4 8.6 29.4 16H2.6Z"
      className="fill-rose-500"
    />
    <line x1="2.2" y1="16" x2="29.8" y2="16" stroke="currentColor" strokeWidth="2.2" />
    <circle
      cx="16"
      cy="16"
      r="4.5"
      className="fill-white dark:fill-slate-900"
      stroke="currentColor"
      strokeWidth="2.2"
    />
    <circle cx="16" cy="16" r="1.7" fill="currentColor" />
  </svg>
);

interface AppraisalBarsProps {
  a: number | null;
  d: number | null;
  s: number | null;
  compact?: boolean;
}

export const AppraisalBars: React.FC<AppraisalBarsProps> = ({ a, d, s, compact = false }) => {
  const av = a ?? 0;
  const dv = d ?? 0;
  const sv = s ?? 0;
  const isHundo = av === 15 && dv === 15 && sv === 15;
  const fillClass = isHundo ? 'bg-rose-500' : 'bg-amber-500';

  const stats: { label: string; val: number }[] = [
    { label: 'ATK', val: av },
    { label: 'DEF', val: dv },
    { label: 'HP', val: sv },
  ];

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {stats.map((st) => (
        <div key={st.label} className="flex items-center gap-2">
          <span
            className={`${
              compact ? 'w-6 text-[10px]' : 'w-8 text-xs'
            } font-semibold tracking-wide text-slate-500 dark:text-slate-400`}
          >
            {st.label}
          </span>
          <div className="grid flex-1 grid-cols-3 gap-0.5">
            {[0, 1, 2].map((segIdx) => {
              const segMin = segIdx * 5;
              const segFill = Math.max(0, Math.min(5, st.val - segMin));
              const pct = (segFill / 5) * 100;
              return (
                <div
                  key={segIdx}
                  className={`${
                    compact ? 'h-1.5' : 'h-2.5'
                  } overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800`}
                >
                  <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${pct}%` }} />
                </div>
              );
            })}
          </div>
          <span
            className={`${
              compact ? 'w-4 text-[11px]' : 'w-7 text-xs'
            } text-right font-mono font-semibold text-slate-700 tabular-nums dark:text-slate-300`}
          >
            {st.val}
          </span>
        </div>
      ))}
    </div>
  );
};

export function getTypeAccentHex(types: (string | null | undefined)[] | undefined): string {
  if (!types || types.length === 0) return '#14B8A6';
  for (const raw of types) {
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (TYPE_COLORS[key]) return TYPE_COLORS[key];
  }
  return '#14B8A6';
}
