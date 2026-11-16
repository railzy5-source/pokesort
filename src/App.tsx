import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  Backpack,
  BookmarkCheck,
  CalendarCheck,
  Crown,
  Download,
  Egg,
  Flame,
  Grid,
  Hammer,
  Layers,
  LayoutDashboard,
  Medal,
  Moon,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Swords,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
} from 'lucide-react';
import { ItemsGymsTab, MedalsXpTab } from './components/AccountHubTabs';
import { MaxTab, MegaTab, PvpTab, RaidTab, WishlistTab } from './components/BattleTabs';
import { GymDefenderTab } from './components/GymDefenderTab';
import { BottleCapTab } from './components/BottleCapTab';
import {
  AllMonsTab,
  CollectionTab,
  GradeTab,
  SettingsTab,
  ShowcaseTab,
} from './components/CollectionTabs';
import { PokemonInspectorDrawer } from './components/PokemonInspectorDrawer';
import { PokeballMark } from './components/PokemonVisuals';
import { OverviewTab, TodayTab } from './components/TodayAndOverviewTabs';
import { BuddyEggsTab, TradeMatcherTab } from './components/TradeBuddyEggTab';
import { BuildPlanTab, PowerTab, TransferTab } from './components/TransferAndPlanTabs';
import { UploadWorkbench } from './components/UploadWorkbench';
import { downloadFile, formatNum, type TabKey } from './components/uiTokens';
import {
  buildMergedConfig,
  getActiveLeaguesAndCups,
  USER_CONFIG_PRESET,
} from './engine/defaultConfig';
import {
  clearRemoteCache,
  inspectCacheStatus,
  type CacheSummary,
} from './engine/gameDataClient';
import { buildOfflineFallbackData } from './engine/offlineFallback';
import { createPveContext, Dex } from './engine/pveModel';
import { generateSamplePgsStatsJson } from './engine/sampleGenerator';
import { runFullAnalysisInWorker, type UserConfigInput } from './engine/sorterEngine';
import type {
  AnalysisProgress,
  RemoteGameData,
  ReportJson,
  ReportMon,
  VerdictType,
} from './engine/types';

const THEME_STORAGE_KEY = 'pogo-sorter:theme:v1';

type NavGroupId = 'queue' | 'battle' | 'box' | 'account';

interface NavTabDef {
  key: TabKey;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_GROUPS: { id: NavGroupId; label: string; tabs: NavTabDef[] }[] = [
  {
    id: 'queue',
    label: 'Action Queue',
    tabs: [
      { key: 'today', label: 'Today', icon: CalendarCheck },
      { key: 'home', label: 'Overview', icon: LayoutDashboard },
      { key: 'out', label: 'Transfer & Review', icon: Trash2 },
      { key: 'plan', label: 'Build Plan', icon: Hammer },
      { key: 'power', label: 'Power Up', icon: TrendingUp },
      { key: 'bottle', label: 'Bottle Caps', icon: Crown },
    ],
  },
  {
    id: 'battle',
    label: 'Battle & Raids',
    tabs: [
      { key: 'raid', label: 'Raid Squads', icon: Flame },
      { key: 'max', label: 'Max Battles', icon: Shield },
      { key: 'pvp', label: 'PvP Leagues', icon: Swords },
      { key: 'mega', label: 'Mega Coverage', icon: Sparkles },
      { key: 'wish', label: 'Wishlist', icon: BookmarkCheck },
      { key: 'defenders', label: 'Gym Defenders', icon: Award },
    ],
  },
  {
    id: 'box',
    label: 'Box & Trades',
    tabs: [
      { key: 'mons', label: 'All Pokémon', icon: Grid },
      { key: 'trade', label: 'Trade & Lucky', icon: ArrowLeftRight },
      { key: 'buddy', label: 'Buddy & Eggs', icon: Egg },
      { key: 'showcase', label: 'Showcase', icon: Trophy },
      { key: 'depth', label: 'Collection', icon: Layers },
    ],
  },
  {
    id: 'account',
    label: 'Account & Rules',
    tabs: [
      { key: 'grade', label: 'Account Grade', icon: Award },
      { key: 'items', label: 'Items & Gyms', icon: Backpack },
      { key: 'medals', label: 'Medals & XP', icon: Medal },
      { key: 'settings', label: 'Settings', icon: Sliders },
    ],
  },
];

function getGroupForTab(tab: TabKey): NavGroupId {
  const found = NAV_GROUPS.find((g) => g.tabs.some((t) => t.key === tab));
  return found ? found.id : 'queue';
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [report, setReport] = useState<ReportJson | null>(null);
  const [remoteData, setRemoteData] = useState<RemoteGameData | null>(null);
  const [rawExport, setRawExport] = useState<unknown>(null);

  const [preset, setPreset] = useState<'default' | 'fantasy'>('default');
  const [customCfg, setCustomCfg] = useState<UserConfigInput | null>(null);
  const [customCfgName, setCustomCfgName] = useState<string>('');
  const [offlineOnly, setOfflineOnly] = useState<boolean>(false);

  const [busy, setBusy] = useState<boolean>(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheSummary, setCacheSummary] = useState<CacheSummary | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [inspectedMon, setInspectedMon] = useState<ReportMon | null>(null);
  const [initialVerdicts, setInitialVerdicts] = useState<Set<VerdictType>>(new Set());
  const [initialHold, setInitialHold] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState<{
    moves: Record<string, number>;
    changed: number;
    newTransfers: { id: string; species: string; iv: string; why: string }[];
  } | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage error
    }
  }, [isDark]);

  const refreshCacheStatus = useCallback(async () => {
    try {
      const summary = await inspectCacheStatus();
      setCacheSummary(summary);
    } catch {
      setCacheSummary(null);
    }
  }, []);

  useEffect(() => {
    refreshCacheStatus();
  }, [refreshCacheStatus]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  const effectiveUserCfg = useMemo<UserConfigInput>(() => {
    if (customCfg) return customCfg;
    if (preset === 'fantasy') return USER_CONFIG_PRESET;
    return {};
  }, [customCfg, preset]);

  const dex = useMemo(() => {
    const dataSource = remoteData || (report ? buildOfflineFallbackData() : null);
    if (!dataSource) return null;
    try {
      const cfg = buildMergedConfig(effectiveUserCfg);
      const { caps, cups } = getActiveLeaguesAndCups(cfg);
      const pveCtx = createPveContext(dataSource, cfg);
      return new Dex(dataSource, cfg, pveCtx, caps, cups);
    } catch {
      return null;
    }
  }, [remoteData, report, effectiveUserCfg]);

  const runAnalysis = useCallback(
    async (
      raw: unknown,
      cfgOverride?: UserConfigInput | null,
      forceRefreshCache = false,
    ) => {
      setBusy(true);
      setError(null);
      setProgress({ stage: 'Preparing collection engine…', pct: 5 });
      try {
        const cfgToUse = (cfgOverride !== undefined ? cfgOverride : effectiveUserCfg) || {};
        const res = await runFullAnalysisInWorker(raw, cfgToUse, {
          useOfflineFallbackOnly: offlineOnly,
          forceRefreshCache,
          onProgress: (p) => setProgress(p),
        });
        setReport(res.report);
        setRemoteData(res.remote);
        setRawExport(raw);
        setActiveTab('today');
        setInspectedMon(null);
        const triageCfg = cfgToUse.review_triage as Record<string, unknown> | undefined;
        const existingConfirmed = Array.isArray(triageCfg?.confirmed_transfer_ids)
          ? (triageCfg.confirmed_transfer_ids as string[])
          : [];
        setConfirmedIds(new Set(existingConfirmed));
        await refreshCacheStatus();
        return res.report;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze collection');
        return null;
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [effectiveUserCfg, offlineOnly, refreshCacheStatus],
  );

  const handleSelectPgsFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && parsed.meta && parsed.counts && Array.isArray(parsed.mons)) {
        setReport(parsed as unknown as ReportJson);
        setRawExport(null);
        setActiveTab('today');
        setInspectedMon(null);
        notify(`Loaded precomputed report (${file.name})`);
        return;
      }
      await runAnalysis(parsed);
      notify(`Analyzed ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse JSON file');
    }
  };

  const handleSelectConfigFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as UserConfigInput;
      setCustomCfg(parsed);
      setCustomCfgName(file.name);
      notify(`Attached config ${file.name}`);
      if (rawExport) {
        await runAnalysis(rawExport, parsed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid pogo_config.json');
    }
  };

  const handleLoadSample = async () => {
    const sample = generateSamplePgsStatsJson();
    await runAnalysis(sample);
    notify('Sample trainer collection loaded');
  };

  const handleRefreshCache = async () => {
    await clearRemoteCache();
    await refreshCacheStatus();
    notify('Cleared cached PvPoke & PokeMiners data');
  };

  const handleInspectId = useCallback(
    (id: string) => {
      if (!report) return;
      const found = report.mons.find((m) => m.id === id) || null;
      if (found) setInspectedMon(found);
      else notify('Pokémon details not found in current report');
    },
    [report, notify],
  );

  const handleJumpVerdict = useCallback((v: VerdictType) => {
    setInitialVerdicts(new Set([v]));
    setInitialHold(null);
    setActiveTab('mons');
  }, []);

  const handleJumpHold = useCallback((hold: string) => {
    setInitialHold(hold);
    setInitialVerdicts(new Set());
    setActiveTab('mons');
  }, []);

  const handleToggleConfirmId = useCallback((id: string) => {
    setConfirmedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkConfirmIds = useCallback((ids: string[], add: boolean) => {
    setConfirmedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (add) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const handleApplyConfirmedTransfers = useCallback(async () => {
    if (!rawExport) {
      notify('Load PGSStats.json (not static report.json) to re-run with confirmed transfers');
      return;
    }
    const baseCfg = { ...effectiveUserCfg };
    const existingTriage = (baseCfg.review_triage as Record<string, unknown> | undefined) || {};
    const nextCfg: UserConfigInput = {
      ...baseCfg,
      review_triage: {
        ...existingTriage,
        confirmed_transfer_ids: Array.from(confirmedIds),
      },
    };
    setCustomCfg(nextCfg);
    setCustomCfgName('custom-triage');
    await runAnalysis(rawExport, nextCfg);
    notify(`Applied ${confirmedIds.size} confirmed review transfers`);
  }, [rawExport, effectiveUserCfg, confirmedIds, runAnalysis, notify]);

  const handleApplySettings = useCallback(
    async (nextCfg: UserConfigInput) => {
      setCustomCfg(nextCfg);
      setCustomCfgName('custom-settings');
      if (rawExport) {
        const before = report;
        const after = await runAnalysis(rawExport, nextCfg);
        if (before && after) {
          const prev = new Map<string, ReportMon>(before.mons.map((m): [string, ReportMon] => [m.id, m]));
          const moves: Record<string, number> = {};
          const newTransfers: { id: string; species: string; iv: string; why: string }[] = [];
          let changed = 0;
          for (const m of after.mons) {
            const o = prev.get(m.id);
            if (!o || o.verdict === m.verdict) continue;
            changed++;
            const k = `${o.verdict} → ${m.verdict}`;
            moves[k] = (moves[k] || 0) + 1;
            if (m.verdict === 'TRANSFER') {
              newTransfers.push({ id: m.id, species: m.species, iv: m.iv, why: m.why });
            }
          }
          setChangeSummary({ moves, changed, newTransfers });
        }
        notify('Re-ran collection sorter with updated settings');
      } else {
        notify('Settings updated (load PGSStats.json to re-run)');
      }
    },
    [rawExport, report, runAnalysis, notify],
  );

  const navCounts = useMemo<Partial<Record<TabKey, number>>>(() => {
    if (!report) return {};
    const buildableCount = (report.grade?.level_these || []).filter(
      (r) =>
        r.cost.dust > 0 ||
        r.cost.candy > 0 ||
        r.cost.xl > 0 ||
        Boolean(r.needs_second_move) ||
        r.tm_needed.length > 0 ||
        r.evolve_to,
    ).length;
    return {
      out: report.transfer.total,
      plan: buildableCount,
      mons: report.meta.mons,
    };
  }, [report]);

  const activeGroupId = getGroupForTab(activeTab);
  const activeGroup = NAV_GROUPS.find((g) => g.id === activeGroupId) || NAV_GROUPS[0];

  return (
    <div className="min-h-screen bg-[#F3F8F7] text-slate-900 dark:bg-[#08111B] dark:text-slate-100">
      {/* Compact 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm dark:border-slate-800/90 dark:bg-[#0B1623]/95">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          {/* Zone 1: Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <PokeballMark className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
              PoGo Sorter
            </span>
          </div>

          {/* Zone 2: Clean Unboxed Telemetry Strip */}
          {report ? (
            <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {formatNum(report.meta.mons)} Pokémon
              </span>
              {report.grade && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                    Grade {report.grade.letter} ({report.grade.overall_pct}/100)
                  </span>
                </>
              )}
              {report.bag_resources && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatNum(report.bag_resources.stardust)} Stardust
                  </span>
                  {report.bag_resources.pokecoins > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatNum(report.bag_resources.pokecoins)} Coins
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>PvP Ranks · Raid Teams · Transfer Triage</span>
              <span aria-hidden="true">·</span>
              <span>100% Local · Zero Uploads</span>
            </div>
          )}

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-teal-500/50 hover:text-teal-600 dark:border-slate-800 dark:text-slate-300 dark:hover:border-teal-500/50 dark:hover:text-teal-400"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {report && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    downloadFile('report.json', JSON.stringify(report, null, 2));
                    notify('Exported report.json');
                  }}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-500/50 hover:text-teal-700 whitespace-nowrap shrink-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-teal-300"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReport(null);
                    setInspectedMon(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 whitespace-nowrap shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>New Export</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      {!report ? (
        <UploadWorkbench
          busy={busy}
          progress={progress}
          preset={preset}
          setPreset={setPreset}
          offlineOnly={offlineOnly}
          setOfflineOnly={setOfflineOnly}
          cacheSummary={cacheSummary}
          customCfg={customCfg}
          customCfgName={customCfgName}
          onSelectPgsFile={handleSelectPgsFile}
          onSelectConfigFile={handleSelectConfigFile}
          onClearConfig={() => {
            setCustomCfg(null);
            setCustomCfgName('');
          }}
          onLoadSample={handleLoadSample}
          onRefreshCache={handleRefreshCache}
          error={error}
        />
      ) : (
        <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Desktop Left Sidebar */}
            <aside className="hidden lg:block w-56 shrink-0 sticky top-20 space-y-5">
              {NAV_GROUPS.map((grp) => (
                <div key={grp.id}>
                  <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {grp.label}
                  </div>
                  <nav className="space-y-0.5">
                    {grp.tabs.map((t) => {
                      const Icon = t.icon;
                      const active = activeTab === t.key;
                      const count = navCounts[t.key];
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setActiveTab(t.key)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition whitespace-nowrap ${
                            active
                              ? 'bg-teal-500/12 font-semibold text-teal-800 dark:bg-teal-500/18 dark:text-teal-300'
                              : 'font-medium text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${
                                active
                                  ? 'text-teal-600 dark:text-teal-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            />
                            <span className="truncate">{t.label}</span>
                          </span>
                          {count !== undefined && (
                            <span
                              className={`font-mono text-[11px] tabular-nums ${
                                active
                                  ? 'font-semibold text-teal-700 dark:text-teal-300'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {formatNum(count)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </aside>

            {/* Mobile / Tablet Compact Navigation (scrolls naturally, never stacks over viewport) */}
            <div className="lg:hidden space-y-2 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {NAV_GROUPS.map((grp) => {
                  const isGrpActive = grp.id === activeGroupId;
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setActiveTab(grp.tabs[0].key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                        isGrpActive
                          ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                          : 'bg-white text-slate-600 border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      {grp.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {activeGroup.tabs.map((t) => {
                  const active = activeTab === t.key;
                  const count = navCounts[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-teal-500/15 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      <span>{t.label}</span>
                      {count !== undefined && (
                        <span className="font-mono text-[11px] opacity-75 tabular-nums">
                          {formatNum(count)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Workspace View */}
            <main className="flex-1 min-w-0">
              {activeTab === 'today' && (
                <TodayTab
                  report={report}
                  onJumpTab={setActiveTab}
                  onInspectId={handleInspectId}
                />
              )}
              {activeTab === 'home' && (
                <OverviewTab
                  report={report}
                  onJumpVerdict={handleJumpVerdict}
                  onJumpHold={handleJumpHold}
                  onJumpTab={setActiveTab}
                />
              )}
              {activeTab === 'out' && (
                <TransferTab
                  report={report}
                  confirmedIds={confirmedIds}
                  onToggleConfirmId={handleToggleConfirmId}
                  onBulkConfirmIds={handleBulkConfirmIds}
                  onApplyConfirmedTransfers={handleApplyConfirmedTransfers}
                  onNotify={notify}
                  onInspectId={handleInspectId}
                />
              )}
              {activeTab === 'plan' && (
                <BuildPlanTab
                  report={report}
                  onJumpTab={setActiveTab}
                  onNotify={notify}
                  onInspectId={handleInspectId}
                />
              )}
              {activeTab === 'power' && (
                <PowerTab report={report} onInspectId={handleInspectId} />
              )}
              {activeTab === 'bottle' && (
                <BottleCapTab
                  report={report}
                  onInspectId={handleInspectId}
                  onNotify={notify}
                />
              )}
              {activeTab === 'wish' && (
                <WishlistTab report={report} onInspectId={handleInspectId} />
              )}
              {activeTab === 'defenders' && (
                <GymDefenderTab
                  report={report}
                  onInspectId={handleInspectId}
                  onNotify={notify}
                />
              )}
              {activeTab === 'raid' && (
                <RaidTab report={report} onInspectId={handleInspectId} />
              )}
              {activeTab === 'max' && (
                <MaxTab report={report} onInspectId={handleInspectId} />
              )}
              {activeTab === 'pvp' && (
                <PvpTab
                  report={report}
                  onInspectId={handleInspectId}
                  onNotify={notify}
                />
              )}
              {activeTab === 'mega' && (
                <MegaTab report={report} onInspectId={handleInspectId} />
              )}
              {activeTab === 'trade' && (
                <TradeMatcherTab
                  report={report}
                  onInspectId={handleInspectId}
                  onNotify={notify}
                />
              )}
              {activeTab === 'buddy' && (
                <BuddyEggsTab
                  report={report}
                  onInspectId={handleInspectId}
                  onNotify={notify}
                />
              )}
              {activeTab === 'showcase' && (
                <ShowcaseTab report={report} onInspectId={handleInspectId} />
              )}
              {activeTab === 'depth' && <CollectionTab report={report} />}
              {activeTab === 'grade' && <GradeTab report={report} onJumpTab={setActiveTab} />}
              {activeTab === 'items' && (
                <ItemsGymsTab
                  report={report}
                  onInspectId={handleInspectId}
                  onJumpTab={setActiveTab}
                />
              )}
              {activeTab === 'medals' && (
                <MedalsXpTab report={report} onJumpTab={setActiveTab} />
              )}
              {activeTab === 'mons' && (
                <AllMonsTab
                  report={report}
                  initialVerdicts={initialVerdicts}
                  initialHold={initialHold}
                  onInspectMon={setInspectedMon}
                  onNotify={notify}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsTab
                  userCfg={effectiveUserCfg}
                  hasRawExport={Boolean(rawExport)}
                  onApplyAndRerun={handleApplySettings}
                  onNotify={notify}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {/* Pokémon Appraisal & PvPoke Sandbox Drawer */}
      <PokemonInspectorDrawer
        mon={inspectedMon}
        dex={dex}
        onClose={() => setInspectedMon(null)}
        onNotify={notify}
      />

      {/* Toast Notification */}
      {changeSummary && (
        <div className="fixed bottom-4 left-4 z-50 max-h-[60vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xl dark:border-slate-700 dark:bg-[#0F1B28] dark:text-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="font-bold">
              {changeSummary.changed === 0
                ? 'Re-run finished: no Pokémon changed verdict'
                : `Re-run changed ${changeSummary.changed} Pokémon`}
            </div>
            <button type="button" onClick={() => setChangeSummary(null)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
              Dismiss
            </button>
          </div>
          {Object.entries(changeSummary.moves).map(([k, v]) => (
            <div key={k} className="mt-1 font-mono">{k}: {v}</div>
          ))}
          {changeSummary.newTransfers.length > 0 && (
            <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
              <div className="font-semibold text-red-600">Newly on the transfer list ({changeSummary.newTransfers.length}) — check before transferring:</div>
              {changeSummary.newTransfers.slice(0, 25).map((t) => (
                <div key={t.id} className="mt-1">
                  {t.species} <span className="font-mono">{t.iv}</span> — {t.why}
                </div>
              ))}
              {changeSummary.newTransfers.length > 25 && <div className="mt-1">…and {changeSummary.newTransfers.length - 25} more</div>}
            </div>
          )}
        </div>
      )}
      {toast && (
        <div className="fixed right-5 bottom-5 z-50 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-teal-500 dark:text-slate-950">
          {toast}
        </div>
      )}
    </div>
  );
}
