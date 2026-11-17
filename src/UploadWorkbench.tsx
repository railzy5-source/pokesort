import React, { useRef, useState } from 'react';
import {
  Database,
  FileCode2,
  FolderUp,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import type { CacheSummary } from '../engine/gameDataClient';
import type { UserConfigInput } from '../engine/sorterEngine';
import type { AnalysisProgress } from '../engine/types';
import { PokeballMark } from './PokemonVisuals';

// Real art assets in src/assets/images/
import mascotHero from '../assets/images/mascot-hero.png';
import grassStrip from '../assets/images/grass-strip.jpg';
import iconPvp from '../assets/images/icon-pvp.jpg';
import iconRaid from '../assets/images/icon-raid.jpg';
import iconPower from '../assets/images/icon-power.jpg';
import badgeOrange from '../assets/images/Glossy Orange Fire Emblem Badge.png';
import badgeBlue from '../assets/images/Glossy Blue Water Badge.png';
import badgeGold from '../assets/images/Glossy Golden Lightning Badge.png';
import badgeKhaki from '../assets/images/Glossy Khaki Octagonal Badge.png';

interface UploadWorkbenchProps {
  busy: boolean;
  progress: AnalysisProgress | null;
  preset: 'default' | 'fantasy';
  setPreset: (p: 'default' | 'fantasy') => void;
  offlineOnly: boolean;
  setOfflineOnly: (v: boolean) => void;
  cacheSummary: CacheSummary | null;
  customCfg: UserConfigInput | null;
  customCfgName: string;
  onSelectPgsFile: (file: File) => void;
  onSelectConfigFile: (file: File) => void;
  onClearConfig: () => void;
  onLoadSample: () => void;
  onRefreshCache: () => void;
  error: string | null;
}

const FEATURES = [
  {
    key: 'pvp',
    iconSrc: iconPvp,
    title: 'PvP Rank & Cups',
    desc: 'Full 4,096 IV matrix for Great, Ultra, Master and seasonal cups — ranked like PvPoke.',
    border: 'border-t-sky-500',
    glow: 'bg-sky-400/25',
  },
  {
    key: 'transfer',
    iconSrc: badgeOrange,
    title: 'Transfer Triage',
    desc: 'Smart keep / review / transfer verdicts plus collision-proof mass-search strings under 1,950 chars.',
    border: 'border-t-rose-500',
    glow: 'bg-rose-400/25',
  },
  {
    key: 'raid',
    iconSrc: iconRaid,
    title: 'Raid & Max Squads',
    desc: 'Build optimal Raid, Max Battle and Mega teams from what you already own.',
    border: 'border-t-amber-500',
    glow: 'bg-amber-400/25',
  },
  {
    key: 'showcase',
    iconSrc: badgeBlue,
    title: 'Showcase Scoring',
    desc: 'Rank every Pokémon for PokéStop Showcases so you always drop your best entry.',
    border: 'border-t-emerald-500',
    glow: 'bg-emerald-400/25',
  },
  {
    key: 'power',
    iconSrc: iconPower,
    title: 'Power-Up Plans',
    desc: 'Stardust & candy costed power-up and second-move plans that respect your bag limits.',
    border: 'border-t-yellow-500',
    glow: 'bg-yellow-400/25',
  },
  {
    key: 'trade',
    iconSrc: badgeGold,
    title: 'Trade & Buddy',
    desc: 'Trade matcher, lucky odds, egg & buddy analysis — all from the same export.',
    border: 'border-t-violet-500',
    glow: 'bg-violet-400/25',
  },
];

/** Safe image with Pokéball fallback */
const SafeImg: React.FC<{
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}> = ({ src, alt, className = '', fallbackClassName = 'h-12 w-12' }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <PokeballMark className={`${fallbackClassName} text-teal-600/50 dark:text-teal-400/40`} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const UploadWorkbench: React.FC<UploadWorkbenchProps> = ({
  busy,
  progress,
  preset,
  setPreset,
  offlineOnly,
  setOfflineOnly,
  cacheSummary,
  customCfg,
  customCfgName,
  onSelectPgsFile,
  onSelectConfigFile,
  onClearConfig,
  onLoadSample,
  onRefreshCache,
  error,
}) => {
  const [dragging, setDragging] = useState(false);
  const pgsInputRef = useRef<HTMLInputElement>(null);
  const cfgInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (f.name.toLowerCase().includes('config')) {
        onSelectConfigFile(f);
      } else {
        onSelectPgsFile(f);
      }
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Layered sky + hero background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-100 via-teal-50/90 to-amber-50/40 dark:from-[#061018] dark:via-[#08111B] dark:to-[#0a1520]" />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-emerald-100/40 via-transparent to-transparent dark:from-teal-950/30" />
        {/* Floating Pokéball particles */}
        <div className="absolute left-[8%] top-[18%] animate-float opacity-40">
          <PokeballMark className="h-7 w-7 text-rose-500" />
        </div>
        <div className="absolute right-[12%] top-[12%] animate-float-delay-1 opacity-35">
          <PokeballMark className="h-5 w-5 text-rose-400" />
        </div>
        <div className="absolute left-[22%] top-[42%] animate-float-delay-2 opacity-30">
          <PokeballMark className="h-4 w-4 text-rose-500" />
        </div>
        <div className="absolute right-[28%] top-[28%] animate-float-delay-3 opacity-25">
          <PokeballMark className="h-6 w-6 text-rose-400" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {error && (
          <div className="mb-6 rounded-2xl border-2 border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* ── HERO ───────────────────────────────────────────── */}
        <section className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Copy + mascot */}
          <div className="relative flex flex-col gap-5 lg:col-span-7">
            {/* Mascot — above drop zone on mobile, floats beside headline on desktop */}
            <div className="flex justify-center lg:absolute lg:right-0 lg:top-0 lg:translate-x-4 lg:justify-end">
              <SafeImg
                src={mascotHero}
                alt="Cheerful electric-mouse explorer mascot"
                className="h-36 w-auto animate-bounce-slow drop-shadow-xl sm:h-44 lg:h-52"
                fallbackClassName="h-28 w-28"
              />
            </div>

            <div className="lg:pr-40">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-teal-500/30 bg-white/80 px-3 py-1 text-xs font-bold text-teal-800 shadow-sm backdrop-blur dark:border-teal-500/40 dark:bg-slate-900/70 dark:text-teal-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                100% client-side · Zero uploads · Your data stays on device
              </div>

              <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.85rem] lg:leading-[1.12] dark:text-white">
                Your Pokémon GO box,
                <span className="mt-1 block bg-gradient-to-r from-teal-600 via-cyan-500 to-amber-500 bg-clip-text text-transparent dark:from-teal-400 dark:via-cyan-300 dark:to-amber-300">
                  sorted like a pro
                </span>
              </h1>

              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                Drop your{' '}
                <span className="font-mono text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  PGSStats.json
                </span>{' '}
                export and unlock PvP ranks, transfer lists, Raid/Max squads, Showcase scores, and
                power-up plans — all computed privately in your browser.
              </p>
            </div>

            {/* CTA row */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => pgsInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-teal-600/25 ring-1 ring-teal-700/20 transition hover:scale-[1.02] hover:from-teal-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <FolderUp className="h-4 w-4 shrink-0" />
                <span>Choose PGSStats.json</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={onLoadSample}
                className="inline-flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-md transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:text-teal-300 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 text-amber-500" />
                Try sample box
              </button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-50/80 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Sparkles className="h-3 w-3" />
              Trusted by trainers who care about IVs · Privacy-first
            </div>
          </div>

          {/* Pokéball drop target */}
          <div className="flex flex-col items-center gap-4 lg:col-span-5">
            <input
              ref={pgsInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSelectPgsFile(f);
                e.target.value = '';
              }}
            />
            <input
              ref={cfgInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSelectConfigFile(f);
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !busy && pgsInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pgsInputRef.current?.click();
                }
              }}
              className={`relative flex h-40 w-40 cursor-pointer items-center justify-center rounded-full pokeball-drop shadow-2xl transition-all sm:h-52 sm:w-52 lg:h-56 lg:w-56 ${
                dragging
                  ? 'scale-105 animate-pulse shadow-[0_0_40px_rgba(20,184,166,0.6)]'
                  : 'hover:scale-[1.03] shadow-rose-500/30'
              } ${busy ? 'cursor-wait' : ''}`}
            >
              {/* Center button / scanning animation */}
              <div className="pokeball-drop-center absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full sm:h-20 sm:w-20">
                {busy ? (
                  <PokeballMark className="h-9 w-9 animate-spin text-teal-600 sm:h-11 sm:w-11" />
                ) : (
                  <PokeballMark className="h-8 w-8 text-slate-700 sm:h-10 sm:w-10" />
                )}
              </div>
            </div>

            <div className="text-center">
              <p className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                {busy ? 'Scanning your box…' : 'Drop PGSStats.json here'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                or report.json · everything stays local
              </p>
            </div>

            {busy && progress && (
              <div className="w-full max-w-xs">
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                  <span>{progress.stage}</span>
                  <span className="font-mono tabular-nums">{progress.pct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-amber-400 transition-all duration-200"
                    style={{ width: `${Math.max(5, progress.pct)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => cfgInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 backdrop-blur transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:text-teal-300 disabled:opacity-50"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {customCfg ? `Config: ${customCfgName}` : 'Optional config'}
              </button>
              {customCfg && (
                <button
                  type="button"
                  onClick={onClearConfig}
                  className="rounded-full px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Grass strip divider ─────────────────────────────── */}
        <div className="relative my-10 -mx-4 sm:-mx-6">
          <SafeImg
            src={grassStrip}
            alt=""
            className="h-12 w-full object-cover object-bottom sm:h-16"
            fallbackClassName="h-8 w-8 mx-auto"
          />
          {/* CSS grass fallback strip if image missing */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-emerald-600/30 via-lime-500/20 to-transparent dark:from-emerald-800/40"
          />
        </div>

        {/* ── Feature grid ───────────────────────────────────── */}
        <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                Everything your storage needs
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                One export powers the full toolkit — no account linking, no cloud.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-teal-500/30 bg-white/80 px-3 py-1 text-xs font-bold text-teal-800 shadow-sm dark:border-teal-500/40 dark:bg-slate-900/70 dark:text-teal-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Privacy-first
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.key}
                className={`group rounded-3xl border-2 border-slate-200/80 border-t-4 ${f.border} bg-white/95 p-5 shadow-xl shadow-slate-200/40 transition hover:-translate-y-1 hover:shadow-2xl dark:border-slate-700/80 dark:bg-[#0F1B28]/95 dark:shadow-none`}
              >
                <div className="relative mb-3 inline-flex">
                  <div className={`absolute -inset-2 rounded-2xl ${f.glow} blur-md opacity-70`} />
                  <SafeImg
                    src={f.iconSrc}
                    alt={f.title}
                    className="relative h-12 w-12 rounded-xl object-cover drop-shadow-md"
                    fallbackClassName="h-10 w-10"
                  />
                </div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trainer-card config + cache ────────────────────── */}
        <section className="mt-10 grid gap-5 md:grid-cols-2">
          {/* Ranking preset card */}
          <div className="relative overflow-hidden rounded-3xl border-2 border-amber-400/50 bg-[#FFFBF0] p-5 shadow-xl dark:border-amber-500/30 dark:bg-[#1a1710]">
            <div className="absolute right-3 top-3 opacity-50">
              <SafeImg src={badgeKhaki} alt="" className="h-8 w-8 object-contain" fallbackClassName="h-6 w-6" />
            </div>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Sliders className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Ranking rules preset
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPreset('default')}
                className={`rounded-2xl border-2 p-3 text-left transition ${
                  preset === 'default'
                    ? 'border-teal-500 bg-teal-500/15 ring-2 ring-teal-500/30'
                    : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">All Leagues</div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Great · Ultra · Master + protections
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPreset('fantasy')}
                className={`rounded-2xl border-2 p-3 text-left transition ${
                  preset === 'fantasy'
                    ? 'border-teal-500 bg-teal-500/15 ring-2 ring-teal-500/30'
                    : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Fantasy Preset</div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Mirrors custom pogo_config.json rules
                </div>
              </button>
            </div>
          </div>

          {/* Cache card */}
          <div className="relative overflow-hidden rounded-3xl border-2 border-teal-400/50 bg-[#F0FDFA] p-5 shadow-xl dark:border-teal-500/30 dark:bg-[#0c1a18]">
            <div className="absolute right-3 top-3 opacity-50">
              <SafeImg src={badgeBlue} alt="" className="h-8 w-8 object-contain" fallbackClassName="h-6 w-6" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Database className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Game data cache
              </div>
              <button
                type="button"
                onClick={onRefreshCache}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full border-2 border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Reset
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>IndexedDB status</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {cacheSummary
                    ? [
                        cacheSummary.hasPvPoke && 'PvPoke',
                        cacheSummary.hasPveAndSize && 'PokeMiners',
                        cacheSummary.hasEvents && 'Events',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Empty'
                    : 'Ready'}
                  {cacheSummary?.oldestAgeDays != null ? ` (${cacheSummary.oldestAgeDays}d)` : ''}
                </span>
              </div>
              <label className="flex cursor-pointer items-center justify-between pt-1">
                <span>Offline-only (skip remote PvPoke / PokeMiners)</span>
                <input
                  type="checkbox"
                  checked={offlineOnly}
                  onChange={(e) => setOfflineOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-teal-600"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Trust footer */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            Files never leave your browser
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PokeballMark className="h-3.5 w-3.5 text-rose-500" />
            Built for trainers who care about IVs
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-slate-400" />
            Works offline after first cache
          </span>
        </div>
      </div>
    </div>
  );
};
