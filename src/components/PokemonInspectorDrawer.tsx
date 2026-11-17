import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Flame,
  Sliders,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { runWhatIfSandbox } from '../engine/battleSim';
import { cleanSpeciesName } from '../engine/defaultConfig';
import { getCuratedMegaInfo } from '../engine/megaCurated';
import { Dex, moveLabel } from '../engine/pveModel';
import type { PvPokeSpecies, ReportMon } from '../engine/types';
import {
  copyToClipboard,
  formatNum,
  TYPE_COLORS,
  VERDICT_NAMES,
} from './uiTokens';
import { AppraisalBars, getTypeAccentHex } from './PokemonVisuals';

interface PokemonInspectorDrawerProps {
  mon: ReportMon | null;
  dex?: Dex | null;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onOverrideVerdict?: (id: string, action: 'keep' | 'transfer' | 'reset') => void;
  onCompareMon?: (mon: ReportMon) => void;
}

export const PokemonInspectorDrawer: React.FC<PokemonInspectorDrawerProps> = ({
  mon,
  dex,
  onClose,
  onNotify,
  onOverrideVerdict,
  onCompareMon,
}) => {
  const [drawerTab, setDrawerTab] = useState<'overview' | 'sim' | 'sandbox'>('overview');

  // What-If Sandbox State
  const [simSid, setSimSid] = useState('');
  const [simA, setSimA] = useState(15);
  const [simD, setSimD] = useState(15);
  const [simS, setSimS] = useState(15);
  const [simLevel, setSimLevel] = useState(25);
  const [simShadow, setSimShadow] = useState(false);
  const [simPurifiedMode, setSimPurifiedMode] = useState(false);
  const [simBestBuddy, setSimBestBuddy] = useState(false);
  const [simCap, setSimCap] = useState(1500);
  const [simFast, setSimFast] = useState('');
  const [simCharged1, setSimCharged1] = useState('');
  const [simCharged2, setSimCharged2] = useState('');

  useEffect(() => {
    if (!mon) return;
    setDrawerTab('overview');
    const baseSid = (mon.evolve_to_sid || mon.sid || '').replace(/_shadow$/, '');
    setSimSid(baseSid);
    setSimA(mon.a ?? 10);
    setSimD(mon.d ?? 10);
    setSimS(mon.s ?? 10);
    setSimLevel(Math.min(50, Math.max(1, mon.level || 20)));
    setSimShadow(mon.shadow);
    setSimPurifiedMode(false);
    setSimBestBuddy(false);
    const firstEligible = mon.pvp.find((p) => p.eligible) || mon.pvp[0];
    setSimCap(firstEligible?.cap || 1500);
    setSimFast('');
    setSimCharged1('');
    setSimCharged2('');
  }, [mon?.id]);

  // Collect family species options from Dex for Evolution selector
  const familyOptions = useMemo(() => {
    if (!mon || !dex) return [] as PvPokeSpecies[];
    const baseSid = (mon.sid || '').replace(/_shadow$/, '');
    const sp = dex.byId.get(baseSid) || (mon.dex ? (dex.byDex.get(mon.dex) || [])[0] : undefined);
    if (!sp) return [];
    const seen = new Map<string, PvPokeSpecies>();
    const addRecursive = (cur: PvPokeSpecies | undefined, depth = 0) => {
      if (!cur || depth > 4 || seen.has(cur.speciesId)) return;
      if (!cur.speciesId.endsWith('_shadow') && !cur.speciesId.includes('_mega')) {
        seen.set(cur.speciesId, cur);
      }
      for (const evoId of cur.family?.evolutions || []) {
        addRecursive(dex.byId.get(evoId), depth + 1);
      }
    };
    addRecursive(sp);
    if (mon.evolve_to_sid) {
      const evoSp = dex.byId.get(mon.evolve_to_sid.replace(/_shadow$/, ''));
      if (evoSp) seen.set(evoSp.speciesId, evoSp);
    }
    return Array.from(seen.values());
  }, [mon?.id, dex]);

  const activeSimSp = useMemo(() => {
    if (!dex || !simSid) return null;
    return dex.byId.get(simSid.replace(/_shadow$/, '')) || dex.byId.get(simSid) || null;
  }, [dex, simSid]);

  const sandboxResult = useMemo(() => {
    if (!dex || !simSid || drawerTab !== 'sandbox') return null;
    return runWhatIfSandbox(
      {
        targetSid: simSid,
        a: simA,
        d: simD,
        s: simS,
        level: simLevel,
        isShadow: simShadow,
        bestBuddy: simBestBuddy,
        cap: simCap,
        fastMoveId: simFast || undefined,
        charged1Id: simCharged1 || undefined,
        charged2Id: simCharged2 || undefined,
      },
      dex,
    );
  }, [
    dex,
    drawerTab,
    simSid,
    simA,
    simD,
    simS,
    simLevel,
    simShadow,
    simBestBuddy,
    simCap,
    simFast,
    simCharged1,
    simCharged2,
  ]);

  const formGuide = useMemo(() => {
    if (!dex || !mon) return null;
    const formList = (dex.byDex.get(mon.dex) || []).filter(
      (sp) => !sp.speciesId.endsWith('_shadow') && !sp.speciesId.includes('_mega'),
    );
    if (formList.length <= 1) return null;

    const currentFormName =
      mon.form || (mon.species.includes('(') ? mon.species.match(/\(([^)]+)\)/)?.[1] : 'Standard Form');

    const formRanks = formList.map((sp) => {
      const glRank = dex.pvpPos.get(1500)?.get(sp.speciesId)?.[0] ?? 999;
      const ulRank = dex.pvpPos.get(2500)?.get(sp.speciesId)?.[0] ?? 999;
      const bestGl = glRank <= 500 ? glRank : null;
      const bestUl = ulRank <= 500 ? ulRank : null;
      const isCurrent = sp.speciesId === (mon.sid || '').replace(/_shadow$/, '');
      const formLabel = sp.speciesName.includes('(') ? sp.speciesName.match(/\(([^)]+)\)/)?.[1] : 'Standard Form';
      return {
        sp,
        formLabel,
        glRank: bestGl,
        ulRank: bestUl,
        isCurrent,
        score: (bestGl ? 500 - bestGl : 0) + (bestUl ? 500 - bestUl : 0),
      };
    });

    formRanks.sort((a, b) => b.score - a.score);
    const bestForm = formRanks[0];
    const currentEntry = formRanks.find((f) => f.isCurrent) || formRanks[0];

    return {
      currentFormName,
      formRanks,
      bestForm,
      isHoldingBest: currentEntry.sp.speciesId === bestForm.sp.speciesId,
    };
  }, [dex, mon]);

  const megaStrategy = useMemo(() => {
    if (!mon || mon.shadow) return null;
    const megaType = mon.mega_type || undefined;
    if (dex && mon.sid) {
      const fam = dex.familyMegaInfo(mon.sid);
      for (const cand of fam) {
        const match = getCuratedMegaInfo(cand, megaType);
        if (match) return match;
      }
    }
    return getCuratedMegaInfo(mon.sid || '', megaType);
  }, [dex, mon]);

  if (!mon) return null;

  const copySearch = async () => {
    const ok = await copyToClipboard(mon.search);
    onNotify(ok ? `Copied search string for ${mon.species}` : 'Copy failed');
  };

  const togglePurifyInSandbox = () => {
    if (!mon.shadow) return;
    if (!simPurifiedMode) {
      setSimPurifiedMode(true);
      setSimShadow(false);
      setSimA(Math.min(15, (mon.a ?? 10) + 2));
      setSimD(Math.min(15, (mon.d ?? 10) + 2));
      setSimS(Math.min(15, (mon.s ?? 10) + 2));
      setSimLevel(Math.max(25, mon.level || 20));
    } else {
      setSimPurifiedMode(false);
      setSimShadow(true);
      setSimA(mon.a ?? 10);
      setSimD(mon.d ?? 10);
      setSimS(mon.s ?? 10);
      setSimLevel(mon.level || 20);
    }
  };

  const simBattle = mon.pvp_battle;
  const headerAccentHex = getTypeAccentHex([
    mon.raid_type,
    mon.mega_type,
    mon.max_type,
    mon.moves?.[0]?.type,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[2px]">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#0B1623]">
        {/* Pokémon GO Type Gradient Summary Banner */}
        <div
          className="px-6 pt-5 pb-5 text-white"
          style={{
            background: `linear-gradient(135deg, ${headerAccentHex} 0%, #0F766E 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/90">
                <span className="rounded bg-black/25 px-2 py-0.5 font-bold uppercase text-white">
                  {VERDICT_NAMES[mon.verdict]}
                </span>
                {mon.build_status && <span>· {mon.build_status}</span>}
                {mon.origin_label && <span>· {mon.origin_label}</span>}
                {mon.is_traded && <span>· Traded</span>}
                {(mon.mega_level ?? 0) > 0 && (
                  <span>
                    · Mega Lv{mon.mega_level}
                    {mon.mega_forms && mon.mega_forms.length > 0
                      ? ` (${mon.mega_forms.map((f) => (f === 2 ? 'X' : f === 3 ? 'Y' : 'Std')).join('/')})`
                      : ''}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-display text-3xl font-bold tracking-tight tabular-nums">
                  CP {formatNum(mon.cp)}
                </span>
                <span className="font-mono text-xs text-white/85 tabular-nums">
                  L{mon.level} · Dex #{mon.dex}
                </span>
              </div>
              <h2 className="mt-0.5 font-display text-xl font-bold text-white">
                {mon.species}
              </h2>
              <p className="font-mono text-xs text-white/90 tabular-nums">
                IV {mon.iv} ({mon.iv_pct}%)
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="rounded-lg bg-black/20 p-2 text-white hover:bg-black/35"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Feature 3: Community Day / Legacy Move Evolution Alarm */}
          {mon.wait_cd_reason && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                DO NOT EVOLVE YET! Community Day / Legacy Move Alarm
              </div>
              <p className="mt-1 leading-relaxed">{mon.wait_cd_reason}</p>
            </div>
          )}

          {/* Feature 1: Manual Verdict Override ("Stop Touching My Baby") */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-100">Manual Verdict Override</div>
              <div className="text-[11px] text-slate-500">
                {mon.manual_override === 'keep'
                  ? 'Currently manually locked as KEEP.'
                  : mon.manual_override === 'transfer'
                  ? 'Currently manually forced to TRANSFER.'
                  : 'Engine determined verdict based on PvP/Raid/Mega rules.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onOverrideVerdict?.(mon.id, 'keep')}
                className={`rounded-lg border px-2.5 py-1.5 font-semibold transition ${
                  mon.manual_override === 'keep'
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                }`}
              >
                Force Keep
              </button>
              <button
                type="button"
                onClick={() => onOverrideVerdict?.(mon.id, 'transfer')}
                className={`rounded-lg border px-2.5 py-1.5 font-semibold transition ${
                  mon.manual_override === 'transfer'
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300'
                }`}
              >
                Force Transfer
              </button>
              {mon.manual_override && (
                <button
                  type="button"
                  onClick={() => onOverrideVerdict?.(mon.id, 'reset')}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Reset
                </button>
              )}
              {onCompareMon && (
                <button
                  type="button"
                  onClick={() => onCompareMon(mon)}
                  className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2.5 py-1.5 font-semibold text-teal-700 hover:bg-teal-500/20 dark:text-teal-300"
                >
                  Compare...
                </button>
              )}
            </div>
          </div>

        {/* Drawer Navigation */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setDrawerTab('overview')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              drawerTab === 'overview'
                ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Overview &amp; Provenance
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab('sim')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              drawerTab === 'sim'
                ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Swords className="h-3.5 w-3.5" />
            PvPoke Sim {simBattle ? `(${simBattle.win_rate_1v1}%)` : ''}
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab('sandbox')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              drawerTab === 'sandbox'
                ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            What-If Sandbox
          </button>
        </div>

        {drawerTab === 'overview' && (
          <div className="mt-5 space-y-5">
            {/* Tag Conflicts Alert */}
            {mon.tag_conflicts && mon.tag_conflicts.length > 0 && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  In-Game Tag Conflict Detected
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {mon.tag_conflicts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* In-Game Tags & Showcase Metadata */}
            {((mon.mon_tags && mon.mon_tags.length > 0) || mon.in_contest || mon.legacy_size_unknown) && (
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {[
                  ...(mon.mon_tags || []).map((t) => `#${t}`),
                  mon.in_contest ? 'In Active Showcase Contest' : null,
                  mon.legacy_size_unknown ? 'Pre-2023 Catch (Size Class Unknown)' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}

            {/* #17 & #5 Catch Provenance, Origin & Trade Eligibility */}
            {(mon.catch_floor ||
              mon.untradable_traded ||
              mon.caught_in_party ||
              mon.from_fort ||
              mon.hatched_from_egg ||
              mon.weather_boosted ||
              mon.origin_move ||
              mon.is_fusion ||
              mon.location_card ||
              (mon.origin_events && mon.origin_events.length > 0)) && (
              <div className="rounded-xl border border-slate-200/80 p-4 text-xs dark:border-slate-800">
                <div className="font-semibold uppercase tracking-wider text-slate-500">
                  Catch Provenance &amp; Trade Eligibility
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-medium text-slate-700 dark:text-slate-300">
                  {mon.catch_floor && <span>IV Floor: {mon.catch_floor}</span>}
                  {mon.origin_label && <span>· {mon.origin_label}</span>}
                  {mon.weather_boosted && <span>· Weather Boosted</span>}
                  {mon.hatched_from_egg && <span>· Hatched from Egg</span>}
                  {mon.from_fort && <span>· From Research / Fort</span>}
                  {mon.caught_in_party && (
                    <span className="text-teal-700 dark:text-teal-300">· Caught in Party Play</span>
                  )}
                  {mon.is_fusion && (
                    <span className="text-purple-700 dark:text-purple-300">· Fused Form</span>
                  )}
                  {mon.origin_move && (
                    <span className="font-semibold text-purple-700 dark:text-purple-300">
                      · Signature Origin Move: {mon.origin_move}
                    </span>
                  )}
                  {mon.location_card && (
                    <span className="font-semibold text-teal-700 dark:text-teal-300">
                      · Location Card: {mon.location_card}
                    </span>
                  )}
                  {mon.origin_events && mon.origin_events.length > 0 && (
                    <span>· Events: {mon.origin_events.join(', ')}</span>
                  )}
                </div>
                {mon.untradable_traded && (
                  <div className="mt-1.5 font-semibold text-amber-700 dark:text-amber-300">
                    Already Traded · Cannot Be Re-Traded
                  </div>
                )}
              </div>
            )}

            {/* #3 Live Battle History */}
            {((mon.battles_attacked || 0) > 0 ||
              (mon.battles_defended || 0) > 0 ||
              (mon.pvp_battles || 0) > 0 ||
              (mon.npc_battles || 0) > 0) && (
              <div className="rounded-xl border border-slate-200/80 p-4 text-xs dark:border-slate-800">
                <div className="font-semibold uppercase tracking-wider text-slate-500">
                  Live Battle History
                </div>
                <div className="mt-2 grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200/80 bg-slate-50/50 sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="p-2.5">
                    <div className="text-[10px] text-slate-500">Gym / Raid Attacks</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatNum(mon.battles_attacked)}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[10px] text-slate-500">Gym Defends</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatNum(mon.battles_defended)}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[10px] text-slate-500">PvP (Wins)</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-teal-600 dark:text-teal-400">
                      {formatNum(mon.pvp_battles)} ({formatNum(mon.pvp_wins)})
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[10px] text-slate-500">Rocket / NPC</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatNum(mon.npc_battles)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Role & Rationale */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Role &amp; Verdict Reason
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {mon.role || 'Collection'}
              </div>
              {mon.why && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{mon.why}</p>}
              {mon.evolve_to && (
                <div className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-300">
                  Evolve target: → {mon.evolve_to}
                  {mon.power_up_to ? ` · Power up to L${mon.power_up_to}` : ''}
                  {mon.build_cp ? ` (CP ${formatNum(mon.build_cp)})` : ''}
                </div>
              )}
              {mon.build_blockers && mon.build_blockers.length > 0 && (
                <div className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                  Blocked: {mon.build_blockers.join(' · ')}
                </div>
              )}
            </div>

            {/* Curated Mega Strategy Card */}
            {megaStrategy && (
              <div className="rounded-xl border border-purple-500/35 bg-purple-500/5 p-4 text-xs dark:border-purple-500/30 dark:bg-purple-500/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                    {megaStrategy.isPrimal ? 'Primal' : 'Mega'} Raid Meta Strategy
                  </span>
                  <div className="flex items-center gap-1.5">
                    {megaStrategy.pokebaseTier && (
                      <span className="rounded bg-purple-600/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800 dark:bg-purple-400/20 dark:text-purple-200">
                        Pokébase {megaStrategy.pokebaseTier} Tier
                      </span>
                    )}
                    <span className="font-mono text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                      {megaStrategy.costTier === 'expensive' ? 'Expensive Tier' : 'Cheap Tier'} · {megaStrategy.costLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-1 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  {megaStrategy.name}
                  {megaStrategy.highlightMove && (
                    <span className="ml-2 font-mono text-xs font-semibold text-purple-700 dark:text-purple-300">
                      ({megaStrategy.highlightMove})
                    </span>
                  )}
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                  {megaStrategy.roleNote}
                </p>
              </div>
            )}

            {/* Form & Meta Recommendation Guide */}
            {formGuide && (
              <div className="rounded-xl border border-teal-500/40 bg-teal-500/5 p-4 text-xs dark:border-teal-500/30 dark:bg-teal-500/10">
                <div className="flex items-center justify-between font-bold text-teal-800 dark:text-teal-300">
                  <span>Form &amp; Meta Recommendation Guide</span>
                  <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] uppercase">
                    {formGuide.currentFormName}
                  </span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  {formGuide.isHoldingBest ? (
                    <>You are holding the <b>recommended form</b> (<span className="font-semibold">{formGuide.bestForm.formLabel}</span>) for meta battle performance!</>
                  ) : (
                    <>Recommended form to use: <span className="font-semibold">{formGuide.bestForm.formLabel}</span> ({formGuide.bestForm.glRank ? `Great League #${formGuide.bestForm.glRank}` : formGuide.bestForm.ulRank ? `Ultra League #${formGuide.bestForm.ulRank}` : 'Top Raid Form'}). Your current specimen is <span className="font-semibold">{formGuide.currentFormName}</span>.</>
                  )}
                </p>
                <div className="mt-3 divide-y divide-teal-500/20 border-t border-teal-500/20 pt-2">
                  {formGuide.formRanks.map((fr) => (
                    <div key={fr.sp.speciesId} className={`flex items-center justify-between py-1.5 ${fr.isCurrent ? 'font-bold text-teal-900 dark:text-teal-100' : 'text-slate-700 dark:text-slate-300'}`}>
                      <div className="flex items-center gap-2">
                        <span>{fr.formLabel}</span>
                        {fr.isCurrent && <span className="rounded bg-teal-600 px-1 py-0.2 text-[9px] uppercase text-white">Current</span>}
                        {fr.sp.speciesId === formGuide.bestForm.sp.speciesId && <span className="rounded bg-purple-600 px-1 py-0.2 text-[9px] uppercase text-white">Best Meta</span>}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {fr.glRank ? `GL #${fr.glRank}` : ''} {fr.ulRank ? `UL #${fr.ulRank}` : ''} {!fr.glRank && !fr.ulRank ? `Types: ${fr.sp.types.join('/')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shadow Purify Preview */}
            {mon.purify_preview && (
              <div
                className={`rounded-xl border p-4 text-xs ${
                  mon.purify_preview.becomes_hundo
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-purple-500/30 bg-purple-500/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Shadow Purify Preview (+2/+2/+2)
                  </span>
                  {mon.purify_preview.becomes_hundo && (
                    <span className="font-mono text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                      Purifies to 100% Hundo
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono">
                  <div>
                    <div className="text-[10px] text-slate-500">Purified IV</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {mon.purify_preview.purified_iv} ({mon.purify_preview.purified_iv_pct}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Purified Lvl</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      L{mon.purify_preview.purified_level}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Purified CP</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {mon.purify_preview.purified_cp ? formatNum(mon.purify_preview.purified_cp) : '—'}
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  {mon.purify_preview.return_note}
                </div>
              </div>
            )}

            {/* Authentic Pokémon GO 3-Segment Appraisal Bars */}
            <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-slate-500">
                  Team Leader Appraisal
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {mon.iv} ({mon.iv_pct}%)
                </span>
              </div>
              <AppraisalBars a={mon.a} d={mon.d} s={mon.s} />
            </div>

            {/* Moves */}
            <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Moves &amp; Readiness
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-800 dark:text-slate-200">
                {mon.moves.map((mv, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {mv.type && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[mv.type.toLowerCase()] || '#64748b' }}
                      />
                    )}
                    {mv.name}
                    {mv.elite && <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">(ELITE)</span>}
                  </span>
                ))}
                {mon.moves.length === 0 && (
                  <span className="text-slate-500">No known move IDs recorded.</span>
                )}
              </div>
              {mon.moveset && (
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Target moveset: <b className="text-slate-800 dark:text-slate-200">{mon.moveset}</b>
                </div>
              )}
              {(mon.needs_second_move || mon.build_status === 'Needs second charged move') && (
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs font-semibold text-sky-600 dark:border-slate-800 dark:text-sky-400">
                  Needs 2nd Charged Move unlocked (PvP builds require 2 charged attacks).
                </div>
              )}
              {mon.needs_typed && mon.needs_typed.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">TMs Needed:</span>
                  {mon.needs_typed.map((t, idx) => {
                    const kind = `${t.elite ? 'Elite ' : ''}${t.slot === 'fast' ? 'Fast' : 'Charged'} TM`;
                    const cls = t.elite
                      ? 'text-rose-600 dark:text-rose-400'
                      : t.slot === 'fast'
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-amber-600 dark:text-amber-400';
                    return (
                      <span key={`${t.name}-${idx}`} className={`font-semibold ${cls}`}>
                        {kind}: {t.name}
                      </span>
                    );
                  })}
                </div>
              )}
              {mon.status_reason &&
                !(mon.needs_typed && mon.needs_typed.length > 0) &&
                !mon.needs_second_move &&
                mon.build_status !== 'Needs second charged move' && (
                  <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {mon.status_reason}
                  </div>
                )}
            </div>

            {/* Costs */}
            {(mon.cost_dust > 0 || mon.cost_candy > 0) && (
              <div className="rounded-xl border border-slate-200/80 p-4 text-xs dark:border-slate-800">
                <div className="font-semibold uppercase tracking-wider text-slate-500">
                  Upgrade Cost Estimate
                </div>
                <div className="mt-1.5 flex gap-4 font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
                  <span>{formatNum(mon.cost_dust)} Dust</span>
                  <span>{mon.cost_estimated ? '≈ ' : ''}{formatNum(mon.cost_candy)} Candy</span>
                  {mon.cost_xl > 0 && <span>{mon.cost_xl} XL</span>}
                </div>
                {mon.cost_estimated && (
                  <div className="mt-1 text-[11px] font-normal normal-case text-slate-500">
                    ≈ The evolution candy cost is an estimate (live game data was not available for it).
                  </div>
                )}
              </div>
            )}

            {/* PvP League Table */}
            {mon.pvp.length > 0 && (
              <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  PvP League Rankings
                </div>
                <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {mon.pvp.map((p) => (
                    <div key={p.cap} className="flex items-center justify-between py-2">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {p.league}
                        </span>{' '}
                        <span className="text-slate-500">({p.cap})</span>
                      </div>
                      <div className="font-mono tabular-nums">
                        {p.eligible ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Sp #{p.species_rank} · IV #{p.iv_rank}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">
                            Sp #{p.species_rank} · {p.iv_rank < 4096 ? `IV #${p.iv_rank} (Over CP / Ineligible)` : 'Over CP / Ineligible'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search String */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <code className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                {mon.search}
              </code>
              <button
                type="button"
                onClick={copySearch}
                className="ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 dark:bg-teal-500 dark:text-slate-950"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
        )}

        {drawerTab === 'sim' && (
          <div className="mt-5 space-y-5">
            {simBattle ? (
              <>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wider text-slate-500">
                      {simBattle.league} vs Top 25 Meta
                    </span>
                    <span className="font-semibold text-teal-700 dark:text-teal-300">
                      {simBattle.used_current_moves ? 'Your Current Moveset' : 'Target Meta Moveset'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white py-2 text-center font-mono dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
                    <div>
                      <div className="text-[10px] text-slate-500">0v0 Shield</div>
                      <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {simBattle.win_rate_0v0}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">1v1 Shield</div>
                      <div className="text-base font-bold text-teal-600 dark:text-teal-400">
                        {simBattle.win_rate_1v1}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">2v2 Shield</div>
                      <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {simBattle.win_rate_2v2}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">CMP Ties</div>
                      <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {simBattle.cmp_wins}/{simBattle.cmp_total}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 text-xs text-slate-600 dark:text-slate-400">
                    Moves simulated: <b className="text-slate-900 dark:text-slate-100">{simBattle.moves_used.join(' + ')}</b> · Avg 1v1 Rating:{' '}
                    <span className="font-mono font-semibold">{simBattle.avg_rating_1v1}</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200/80 p-4 text-xs dark:border-slate-800">
                    <div className="font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Key Meta Wins
                    </div>
                    <div className="mt-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                      {simBattle.key_wins.length > 0 ? simBattle.key_wins.join(' · ') : 'None in top 25'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 p-4 text-xs dark:border-slate-800">
                    <div className="font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Key Meta Losses
                    </div>
                    <div className="mt-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                      {simBattle.key_losses.length > 0 ? simBattle.key_losses.join(' · ') : 'Sweeps top 25!'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Breakpoints, Bulkpoints &amp; CMP Flips vs Rank 1 IV
                  </div>
                  {simBattle.breakpoints.length > 0 ? (
                    <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                      {simBattle.breakpoints.map((bp, idx) => (
                        <div key={idx} className="py-2">
                          <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                            <span>
                              vs {bp.opponent} ({bp.move})
                            </span>
                            <span
                              className={`font-mono text-[11px] ${
                                bp.delta_pct >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {bp.type === 'atk_breakpoint'
                                ? `Atk ${bp.yours} vs R1 ${bp.rank1}`
                                : bp.type === 'def_bulkpoint'
                                ? `In ${bp.yours} vs R1 ${bp.rank1}`
                                : bp.yours > bp.rank1
                                ? 'Wins CMP'
                                : 'Loses CMP'}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {bp.note}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      Matches Rank 1 breakpoints across top 25 meta fast moves.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
                <p>
                  Pre-computed battle matrix runs on BUILD_PVP &amp; top-100 league candidates. Open the{' '}
                  <button
                    type="button"
                    onClick={() => setDrawerTab('sandbox')}
                    className="font-semibold text-teal-600 hover:underline dark:text-teal-400"
                  >
                    What-If Sandbox
                  </button>{' '}
                  to run a live PvPoke simulation for this exact Pokémon right now.
                </p>
              </div>
            )}
          </div>
        )}

        {drawerTab === 'sandbox' && (
          <div className="mt-5 space-y-4 text-xs">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 space-y-3">
              {/* Target Species / Evolution */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Evolution / Form
                  </span>
                  <select
                    value={simSid}
                    onChange={(e) => {
                      setSimSid(e.target.value);
                      setSimFast('');
                      setSimCharged1('');
                      setSimCharged2('');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {familyOptions.length > 0 ? (
                      familyOptions.map((sp) => (
                        <option key={sp.speciesId} value={sp.speciesId}>
                          {cleanSpeciesName(sp.speciesName)}
                        </option>
                      ))
                    ) : (
                      <option value={simSid}>{mon.species}</option>
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    League Cap
                  </span>
                  <select
                    value={simCap}
                    onChange={(e) => setSimCap(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value={500}>Little Cup (500 CP)</option>
                    <option value={1500}>Great League (1500 CP)</option>
                    <option value={2500}>Ultra League (2500 CP)</option>
                    <option value={10000}>Master League (Unlimited)</option>
                  </select>
                </label>
              </div>

              {/* Level Slider & Toggles */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Base Level: <b className="font-mono text-teal-600 dark:text-teal-400">L{simLevel}</b>
                    {simBestBuddy ? ' (+1 Best Buddy)' : ''}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {mon.shadow && (
                      <button
                        type="button"
                        onClick={togglePurifyInSandbox}
                        className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${
                          simPurifiedMode
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        }`}
                      >
                        {simPurifiedMode ? 'Purified (+2 IV)' : 'Try Purify'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSimBestBuddy((b) => !b)}
                      className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${
                        simBestBuddy
                          ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      Best Buddy +1
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={0.5}
                  value={simLevel}
                  onChange={(e) => setSimLevel(Number(e.target.value))}
                  className="mt-2 w-full accent-teal-600"
                />
              </div>

              {/* IV Overrides */}
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[11px] text-slate-500">ATK IV</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={simA}
                    onChange={(e) => setSimA(Math.max(0, Math.min(15, Number(e.target.value))))}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500">DEF IV</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={simD}
                    onChange={(e) => setSimD(Math.max(0, Math.min(15, Number(e.target.value))))}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500">STA IV</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={simS}
                    onChange={(e) => setSimS(Math.max(0, Math.min(15, Number(e.target.value))))}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>

              {/* Custom Moveset Override */}
              {activeSimSp && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[11px] text-slate-500">Fast Move</span>
                    <select
                      value={simFast}
                      onChange={(e) => setSimFast(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="">Auto Meta Fast</option>
                      {(activeSimSp.fastMoves || []).map((id) => (
                        <option key={id} value={id}>
                          {moveLabel(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-500">Charged 1</span>
                    <select
                      value={simCharged1}
                      onChange={(e) => setSimCharged1(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="">Auto Meta Charged 1</option>
                      {(activeSimSp.chargedMoves || []).map((id) => (
                        <option key={id} value={id}>
                          {moveLabel(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-500">Charged 2</span>
                    <select
                      value={simCharged2}
                      onChange={(e) => setSimCharged2(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="">Auto Meta Charged 2</option>
                      {(activeSimSp.chargedMoves || []).map((id) => (
                        <option key={id} value={id}>
                          {moveLabel(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {sandboxResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 divide-y divide-slate-200 rounded-xl border border-slate-200/80 sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800">
                  <div className="p-3">
                    <div className="text-[10px] uppercase text-slate-500">Simulated CP</div>
                    <div
                      className={`mt-0.5 font-mono text-lg font-bold ${
                        simCap < 10000 && sandboxResult.cp > simCap
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {formatNum(sandboxResult.cp)}
                    </div>
                    {simCap < 10000 && sandboxResult.cp > simCap && (
                      <div className="text-[10px] text-rose-500">Over {simCap} cap!</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] uppercase text-slate-500">IV Rank ({simCap})</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-teal-600 dark:text-teal-400">
                      {sandboxResult.iv_rank ? `#${sandboxResult.iv_rank}` : `${sandboxResult.iv_pct}%`}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      SP {formatNum(sandboxResult.stat_prod)}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] uppercase text-slate-500">Effective Stats</div>
                    <div className="mt-0.5 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                      {sandboxResult.atk} / {sandboxResult.def} / {sandboxResult.hp}
                    </div>
                    <div className="text-[10px] text-slate-500">L{sandboxResult.eff_level}</div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-1 text-[10px] uppercase text-slate-500">
                      <Flame className="h-3 w-3 text-teal-500" />
                      Raid eDPS
                    </div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {sandboxResult.raid_edps ?? '—'}
                    </div>
                  </div>
                </div>

                {sandboxResult.pvp_summary && (
                  <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Live PvPoke Simulation ({sandboxResult.pvp_summary.league})
                      </span>
                      <span className="font-mono text-slate-500">
                        CMP {sandboxResult.pvp_summary.cmp_wins}/{sandboxResult.pvp_summary.cmp_total}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200/80 bg-slate-50/70 py-2 text-center font-mono dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                      <div>
                        <div className="text-[10px] text-slate-500">0v0</div>
                        <div className="font-bold">{sandboxResult.pvp_summary.win_rate_0v0}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-teal-700 dark:text-teal-300">1v1</div>
                        <div className="font-bold text-teal-700 dark:text-teal-300">
                          {sandboxResult.pvp_summary.win_rate_1v1}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">2v2</div>
                        <div className="font-bold">{sandboxResult.pvp_summary.win_rate_2v2}%</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      Moveset: {sandboxResult.pvp_summary.moves_used.join(' + ')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
