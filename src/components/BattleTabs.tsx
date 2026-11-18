import React, { useState } from 'react';
import { Copy, ChevronDown, Search, Zap, Check } from 'lucide-react';
import type { RaidTeamEntry, ReportJson, WishlistRow } from '../engine/types';
import {
  copyToClipboard,
  formatNum,
  STATUS_COLORS,
  TYPE_COLORS,
  WISH_STATUS_CLASSES,
} from './uiTokens';

interface BattleTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
  onNotify?: (msg: string) => void;
}

const WishRowItem: React.FC<{
  row: WishlistRow;
  onInspectId: (id: string) => void;
}> = ({ row, onInspectId }) => (
  <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-400">#{row.rank}</span>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {row.species}
        </span>
        {row.shadow && (
          <span className="text-[11px] font-semibold uppercase text-purple-600 dark:text-purple-400">
            · Shadow
          </span>
        )}
        {row.gmax && (
          <span className="text-[11px] font-semibold uppercase text-rose-600 dark:text-rose-400">
            · G-Max
          </span>
        )}
      </div>
      {row.best ? (
        <button
          type="button"
          onClick={() => onInspectId(row.best!.id)}
          className="mt-0.5 text-left text-xs text-slate-500 transition hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
        >
          Best owned: {row.best.iv} ({row.best.iv_pct}%) · CP {row.best.cp} · L{row.best.level}
          {row.best.iv_rank ? ` · PvP IV #${row.best.iv_rank}` : ''}
        </button>
      ) : (
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {row.why[0] || 'Not currently held'}
        </div>
      )}
    </div>
    <div className="flex items-center gap-2.5">
      {row.dps !== undefined && (
        <span className="font-mono text-xs text-slate-500">{row.dps} dps</span>
      )}
      {row.score !== undefined && (
        <span className="font-mono text-xs text-slate-500">{row.score} pts</span>
      )}
      <span
        className={`rounded border px-2 py-0.5 text-[11px] font-semibold uppercase ${
          WISH_STATUS_CLASSES[row.status] || WISH_STATUS_CLASSES.HUNT
        }`}
      >
        {row.status}
      </span>
    </div>
  </div>
);

export const WishlistTab: React.FC<BattleTabProps> = ({ report, onInspectId }) => {
  const w = report.grade?.wishlist_all;
  const [kind, setKind] = useState<'raid' | 'pvp' | 'mega' | 'max'>('raid');
  const [selectedKey, setSelectedKey] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  if (!w) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No wishlist data available in this report.
      </div>
    );
  }

  const filterRow = (r: WishlistRow) => statusFilter === 'ALL' || r.status === statusFilter;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Collection Wishlist
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Top meta species compared directly against what you own (excluding Trade &amp; Transfer boxes).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['raid', 'Raid Attackers'],
              ['pvp', 'PvP Leagues'],
              ['mega', 'Mega Evolutions'],
              ['max', 'Max Battles'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setSelectedKey(k === 'pvp' ? '0' : 'all');
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                kind === k
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-200"
        >
          <option value="ALL">All statuses</option>
          <option value="HUNT">HUNT only</option>
          <option value="UPGRADE">UPGRADE only</option>
          <option value="DECIDE">DECIDE (in Review)</option>
          <option value="NO DYNAMAX">NO DYNAMAX</option>
          <option value="HAVE">HAVE only</option>
        </select>
      </div>

      {kind === 'pvp' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {w.pvp.map((lg, idx) => (
              <button
                key={lg.cap}
                type="button"
                onClick={() => setSelectedKey(String(idx))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                  selectedKey === String(idx)
                    ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
                }`}
              >
                {lg.league} ({lg.cap})
              </button>
            ))}
          </div>
          {(() => {
            const lg = w.pvp[Number(selectedKey) || 0] || w.pvp[0];
            if (!lg) return null;
            const rows = lg.rows.filter(filterRow);
            return (
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
                <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {lg.league} Top {lg.rows.length}
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r) => (
                    <WishRowItem key={r.sid} row={r} onInspectId={onInspectId} />
                  ))}
                  {rows.length === 0 && (
                    <div className="py-4 text-xs text-slate-500">No entries match filter.</div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const map = w[kind];
            const keys = Object.keys(map).sort();
            const showKeys = selectedKey !== 'all' && map[selectedKey] ? [selectedKey] : keys;
            return (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedKey('all')}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      selectedKey === 'all'
                        ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-400'
                    }`}
                  >
                    All Types
                  </button>
                  {keys.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedKey(k)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition ${
                        selectedKey === k
                          ? 'border-teal-500 bg-teal-500/12 text-teal-800 font-semibold dark:text-teal-300'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-400'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[k] || '#64748b' }}
                      />
                      {k}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {showKeys.map((k) => {
                    const b = map[k];
                    const rows = (b.rows || []).filter(filterRow);
                    return (
                      <div
                        key={k}
                        className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: TYPE_COLORS[k] || '#64748b' }}
                            />
                            <h3 className="text-sm font-bold capitalize text-slate-900 dark:text-slate-100">
                              {b.type}
                            </h3>
                          </div>
                          <span className="font-mono text-xs text-slate-500">{rows.length} entries</span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rows.slice(0, selectedKey === 'all' ? 5 : 10).map((r) => (
                            <WishRowItem key={r.sid} row={r} onInspectId={onInspectId} />
                          ))}
                          {rows.length === 0 && (
                            <div className="py-3 text-xs text-slate-500">No entries match filter.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const RAID_BADGE: Record<string, string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  needs_tm: 'border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  blocked: 'border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300',
};

/** Status badge + the exact TM instructions for one raid entry. */
const RaidEntryNotes: React.FC<{ m: RaidTeamEntry }> = ({ m }) => {
  if (!m.status) return null;
  const actions = m.tm_actions || [];
  return (
    <div className="mt-1 space-y-0.5">
      <span
        className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RAID_BADGE[m.status]}`}
      >
        {m.status_label}
      </span>
      {actions.map((a, i) => (
        <div key={i} className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
          → {a}
        </div>
      ))}
      {m.upgrade_hint && (
        <div className="text-[11px] leading-snug text-slate-500">↑ {m.upgrade_hint}</div>
      )}
      {m.fast_lock_note && (
        <div className="text-[11px] leading-snug text-sky-700 dark:text-sky-400">🔒 {m.fast_lock_note}</div>
      )}
    </div>
  );
};

export const RaidTab: React.FC<BattleTabProps> = ({ report, onInspectId }) => {
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const [showPlace, setShowPlace] = useState(false);

  const sections = report.grade?.sections?.raid || [];
  const filtered =
    filter === 'attention' ? sections.filter((s) => s.status !== 'OK') : sections;
  const pl = report.placement?.raid;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Raid Attacker Squads
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Ranked by type-effective DPS (vs a defender weak to the team type) using the moves each Pokémon knows right now. Entries that need a TM, an Elite TM or a Frustration fix are labelled and listed under “Not ready yet”.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              filter === 'all'
                ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
            }`}
          >
            All Types ({sections.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('attention')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              filter === 'attention'
                ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
            }`}
          >
            Needs Attention ({sections.filter((s) => s.status !== 'OK').length})
          </button>
        </div>
      </div>

      {pl && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <button
            type="button"
            onClick={() => setShowPlace(!showPlace)}
            className="flex w-full items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <span>
              Global Placement Optimizer: {pl.covered_after}/{pl.types} types covered (was {pl.covered_before}) ·{' '}
              {pl.moved.length} reassigned from greedy primary type
            </span>
            <ChevronDown className={`h-4 w-4 transition ${showPlace ? 'rotate-180' : ''}`} />
          </button>
          {showPlace && pl.moved.length > 0 && (
            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2 text-xs dark:divide-slate-800 dark:border-slate-800">
              {pl.moved.slice(0, 12).map((mv) => (
                <div key={mv.id} className="flex items-center justify-between gap-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onInspectId(mv.id)}
                    className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {mv.name} ({mv.iv} · L{mv.level})
                  </button>
                  <span className="font-mono text-slate-500">
                    {mv.from} → {mv.to} · {mv.why}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((x) => (
          <div
            key={x.type}
            className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[x.type] || '#64748b' }}
                />
                <h2 className="text-base font-bold capitalize text-slate-900 dark:text-slate-100">
                  {x.type}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
                <span
                  className={
                    x.status === 'OK'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }
                >
                  {x.status}
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-slate-900 dark:text-slate-100">{x.letter}</span>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{x.usable} L25+ in box (min 3) · {x.strength_pct}% of {x.top_species}</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                Avg {x.avg_team_dps} dps
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, x.strength_pct)}%`,
                  backgroundColor: TYPE_COLORS[x.type] || '#0d9488',
                }}
              />
            </div>

            {(() => {
              const activeTeam = x.team.filter((m) => m.slot === 'team');
              const spares = x.team.filter((m) => m.slot === 'backup');
              const hasMegaInTeam = activeTeam.some((m) => m.is_mega);
              return (
                <>
                  {!hasMegaInTeam && (
                    <div className="mt-2.5 text-[11px] text-slate-400 dark:text-slate-500">
                      No Mega/Primal owned for {x.type} — 6 non-Mega attackers
                    </div>
                  )}

                  <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-1 text-xs dark:divide-slate-800 dark:border-slate-800">
                    {activeTeam.map((m, idx) => {
                      const slotNum = m.slot_num ?? idx + 1;
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center justify-between py-2 ${
                            m.is_mega
                              ? '-mx-2 rounded-lg bg-purple-500/8 px-2 dark:bg-purple-500/12'
                              : ''
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`font-mono text-[10px] font-bold ${
                                  m.is_mega
                                    ? 'text-purple-700 dark:text-purple-300'
                                    : 'text-slate-400'
                                }`}
                              >
                                #{slotNum}
                              </span>
                              <button
                                type="button"
                                onClick={() => onInspectId(m.id)}
                                className={`truncate text-left font-semibold hover:text-teal-600 dark:hover:text-teal-400 ${
                                  m.is_mega
                                    ? 'text-purple-900 dark:text-purple-100'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {m.name}
                              </button>
                              {m.is_mega && (
                                <span className="rounded border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                                  Mega
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">CP {formatNum(m.cp)}</span> · L{m.level} · IV {m.iv} · {m.moveset}
                            </div>
                            <RaidEntryNotes m={m} />
                          </div>
                          <div className="shrink-0 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {m.dps} dps
                            {m.dps_basis === 'after_tm' && (
                              <div className="text-[10px] font-normal text-slate-400">after TM</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {x.team.length === 0 && (
                      <div className="py-3 text-xs text-slate-500">No raid attackers placed here yet.</div>
                    )}
                  </div>

                  {spares.length > 0 && (
                    <div className="mt-2 border-t border-dashed border-slate-200 pt-2 text-xs dark:border-slate-700/80">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Spares ({spares.length})
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {spares.map((m, idx) => (
                          <div key={m.id} className="flex items-center justify-between py-1.5 opacity-90">
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-slate-400">
                                  S{idx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onInspectId(m.id)}
                                  className="truncate text-left font-medium text-slate-700 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400"
                                >
                                  {m.name}
                                </button>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <span className="font-mono font-medium text-slate-600 dark:text-slate-300">CP {formatNum(m.cp)}</span> · L{m.level} · IV {m.iv} · {m.moveset}
                              </div>
                              <RaidEntryNotes m={m} />
                            </div>
                            <div className="shrink-0 text-right font-mono text-slate-600 dark:text-slate-400">
                              {m.dps} dps
                              {m.dps_basis === 'after_tm' && (
                                <div className="text-[10px] font-normal text-slate-400">after TM</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(x.fix_queue?.length ?? 0) > 0 && (
                    <details className="mt-2 border-t border-dashed border-slate-200 pt-2 text-xs dark:border-slate-700/80">
                      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Could improve this team with a TM · on no other team ({x.fix_queue!.length})
                      </summary>
                      <div className="mt-1 divide-y divide-slate-100 dark:divide-slate-800/80">
                        {x.fix_queue!.map((m) => (
                          <div key={m.id} className="py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onInspectId(m.id)}
                                className="truncate text-left font-medium text-slate-700 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400"
                              >
                                {m.name}
                              </button>
                              <span className="shrink-0 font-mono text-slate-500">{m.dps} dps after fix</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              CP {formatNum(m.cp)} · L{m.level} · IV {m.iv} · {m.moveset}
                            </div>
                            <RaidEntryNotes m={m} />
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
};

export const MaxTab: React.FC<BattleTabProps> = ({ report, onInspectId }) => {
  const B = report.max_battle;
  const sections = report.grade?.sections?.max?.types || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Max Battles (Dynamax &amp; Gigantamax)
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Only Dynamax and Gigantamax Pokémon can enter Max Battles. Attackers scale off ATK × Max Move power (250/300/350 vs G-Max 350/400/450).
        </p>
      </div>

      {B && (
        <div className="grid divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Roster &amp; Moves</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
              {B.dynamax} D-Max · {B.gigantamax} G-Max
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {B.attackers_below_3 > 0
                ? `${B.attackers_below_3} attackers below Max Attack Lv3 (+${B.gain_pct}% gain waiting)`
                : 'All Max attackers at Level 3'}
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Tanks (Max Guard)</div>
            <div className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {B.tanks.slice(0, 3).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1">
                  <button
                    type="button"
                    onClick={() => onInspectId(t.id)}
                    className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {t.species}{' '}
                    <span className="font-mono font-normal text-slate-500">· CP {formatNum(t.cp)}</span>
                  </button>
                  <span className="font-mono text-slate-500">
                    {t.unlocked ? `Guard Lv${t.move_level}` : `${t.pct_of_best}% bulk`}
                  </span>
                </div>
              ))}
              {B.tanks.length === 0 && <div className="text-slate-500">No Dynamax tanks yet.</div>}
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Healers (Max Spirit)</div>
            <div className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {B.healers.slice(0, 3).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1">
                  <button
                    type="button"
                    onClick={() => onInspectId(t.id)}
                    className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {t.species}{' '}
                    <span className="font-mono font-normal text-slate-500">· CP {formatNum(t.cp)}</span>
                  </button>
                  <span className="font-mono text-slate-500">
                    {t.unlocked ? `Spirit Lv${t.move_level}` : `${t.pct_of_best}% HP`}
                  </span>
                </div>
              ))}
              {B.healers.length === 0 && <div className="text-slate-500">No Dynamax healers yet.</div>}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((t) => (
          <div
            key={t.type}
            className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[t.type] || '#64748b' }}
                />
                <h2 className="text-sm font-bold capitalize text-slate-900 dark:text-slate-100">
                  {t.type}
                </h2>
              </div>
              <span
                className={`font-mono text-[11px] font-semibold ${
                  t.covered
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {t.covered ? `${t.have_pct}% of top` : 'GAP'}
              </span>
            </div>

            <div className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {t.team.map((m, i) => (
                <div key={m.id || i} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    {m.id ? (
                      <button
                        type="button"
                        onClick={() => onInspectId(m.id!)}
                        className="truncate text-left font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {m.name}
                      </button>
                    ) : (
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{m.name}</span>
                    )}
                    <div className="font-mono text-[11px] text-slate-500">
                      CP {formatNum(m.cp)} · IV {m.iv}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono font-semibold text-slate-600 dark:text-slate-300">
                    {m.dps} dps
                  </span>
                </div>
              ))}
              {t.team.length === 0 && (
                <div className="py-2 text-slate-500">No Dynamax attacker for {t.type}.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PvpTab: React.FC<BattleTabProps> = ({ report, onInspectId, onNotify }) => {
  const sections = report.grade?.sections?.pvp || [];
  const savedParties = report.saved_parties || [];
  const monMap = new Map(report.mons.map((m) => [m.id, m]));
  const [subTab, setSubTab] = useState<'teams' | 'saved' | 'builds'>('teams');
  const [idx, setIdx] = useState(0);

  const gbl = report.gbl_summary;
  const hasGbl = Boolean(gbl && gbl.has_data);

  if (sections.length === 0 && savedParties.length === 0 && !hasGbl) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No PvP leagues or saved Battle Parties were evaluated in this report. Enable PvP leagues in Settings to build teams.
      </div>
    );
  }
  const lg = sections[Math.min(idx, Math.max(0, sections.length - 1))];

  const copySearch = async (s: string, name: string) => {
    const ok = await copyToClipboard(s);
    onNotify?.(ok ? `Copied ${name} search` : 'Copy failed');
  };

  const roleBadge = (role?: 'lead' | 'safe_swap' | 'closer', sw?: number) => {
    if (!role) return null;
    const meta =
      role === 'lead'
        ? { lbl: 'LEAD', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' }
        : role === 'safe_swap'
        ? { lbl: `SWAP${sw ? ` ${sw}%` : ''}`, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
        : { lbl: 'CLOSER', cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' };
    return (
      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${meta.cls}`}>
        {meta.lbl}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            PvP Leagues, Battle Matrix &amp; Saved Party Audit
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Teams scored by PvPoke Battle Matrix (0v0 / 1v1 / 2v2 shields), Lead/Swap/Closer roles, GBL Elo, and saved Battle Parties.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['teams', 'Recommended Teams'],
              ['saved', `Saved Parties (${savedParties.length})`],
              ['builds', `League Builds (${lg?.builds.length || 0})`],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSubTab(k)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                subTab === k
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* #1 GBL Season & Elo Dashboard */}
      {hasGbl && gbl && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              GO Battle League Telemetry
            </h2>
            {gbl.current_set_battles !== null && gbl.current_set_wins !== null && (
              <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300 tabular-nums">
                Active Set: {gbl.current_set_wins}/{gbl.current_set_battles} wins
              </span>
            )}
          </div>
          <div className="grid divide-y divide-slate-200/80 md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-slate-800">
            {[gbl.current, gbl.previous, gbl.lifetime]
              .filter((rec): rec is NonNullable<typeof rec> => Boolean(rec))
              .map((rec, i) => (
                <div
                  key={`${rec.label}-${i}`}
                  className="py-2.5 md:px-4 md:first:pl-0 md:last:pr-0"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {rec.label}
                      {rec.season !== null ? ` (S${rec.season})` : ''}
                    </span>
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                      {rec.rank !== null ? `Rank ${rec.rank}` : ''}
                      {rec.rating !== null && rec.rating > 0 ? ` · ${rec.rating} Elo` : ''}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                    <div>
                      <div className="text-[10px] text-slate-400">Record</div>
                      <div>
                        {rec.total_wins}-{Math.max(0, rec.total_battles - rec.total_wins)} ({rec.win_rate_pct}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Best Streak</div>
                      <div>
                        {rec.longest_streak}
                        {rec.current_streak > 0 ? ` (now ${rec.current_streak})` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Stardust</div>
                      <div className="text-amber-600 dark:text-amber-400">
                        {formatNum(rec.stardust_earned)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {subTab !== 'saved' && sections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sections.map((s, i) => (
            <button
              key={s.league + s.cap}
              type="button"
              onClick={() => setIdx(i)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                i === idx
                  ? 'border-teal-500 bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {s.league} ({s.cap}) · {s.distinct_teams} teams
            </button>
          ))}
        </div>
      )}

      {subTab === 'teams' && lg && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lg.teams.map((tm) => {
            const c = tm.cohesion;
            return (
              <div
                key={tm.n}
                className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Team {tm.n}
                    </h2>
                    {c?.archetype && (
                      <div className="text-[11px] font-medium text-slate-500">{c.archetype}</div>
                    )}
                  </div>
                  {c && (
                    <span className="shrink-0 font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                      Grade {c.grade}
                      {c.threat_score !== undefined ? ` · Threat ${c.threat_score}` : ` · ${c.coverage_known_pct}% cov`}
                    </span>
                  )}
                </div>

                {c?.pvpoke_grades && (
                  <div className="mt-2.5 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200/80 bg-slate-50/70 py-1 text-center font-mono text-[10px] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/50">
                    <div>
                      <span className="text-slate-500">Cov </span>
                      <b className="text-slate-900 dark:text-slate-100">{c.pvpoke_grades.coverage}</b>
                    </div>
                    <div>
                      <span className="text-slate-500">Bulk </span>
                      <b className="text-slate-900 dark:text-slate-100">{c.pvpoke_grades.bulk}</b>
                    </div>
                    <div>
                      <span className="text-slate-500">Safe </span>
                      <b className="text-slate-900 dark:text-slate-100">{c.pvpoke_grades.safety}</b>
                    </div>
                    <div>
                      <span className="text-slate-500">Cons </span>
                      <b className="text-slate-900 dark:text-slate-100">{c.pvpoke_grades.consistency}</b>
                    </div>
                  </div>
                )}

                {c && (c.battle_win_0v0 !== undefined || c.battle_win_1v1 !== undefined) && (
                  <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200/80 bg-slate-50/70 py-1.5 text-center font-mono text-[11px] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/50">
                    <div>
                      <span className="text-slate-500">0v0 </span>
                      <b className="text-slate-900 dark:text-slate-100">{c.battle_win_0v0 ?? 0}%</b>
                    </div>
                    <div>
                      <span className="text-slate-500">1v1 </span>
                      <b className="text-teal-600 dark:text-teal-400">{c.battle_win_1v1 ?? 0}%</b>
                    </div>
                    <div>
                      <span className="text-slate-500">2v2 </span>
                      <b className="text-slate-900 dark:text-slate-100">{c.battle_win_2v2 ?? 0}%</b>
                    </div>
                  </div>
                )}

                <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {tm.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {roleBadge(m.battle_role, m.switch_win_rate)}
                          <button
                            type="button"
                            onClick={() => onInspectId(m.id)}
                            className="text-left font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                          >
                            {m.name}
                          </button>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {m.role} · {m.iv} · #{m.sp_rank} (IV #{m.iv_rank})
                        </div>
                      </div>
                      <div className="text-right font-mono text-slate-600 dark:text-slate-300">
                        CP {m.target_cp || m.cp}
                      </div>
                    </div>
                  ))}
                </div>

                {c?.holes && c.holes.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800">
                    Watch out for: {c.holes.slice(0, 3).map((h) => h.name).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
          {lg.teams.length === 0 && (
            <div className="col-span-full rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
              Not enough distinct PvP-eligible species in {lg.league} to build 3-mon squads yet.
            </div>
          )}
        </div>
      )}

      {subTab === 'saved' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {savedParties.map((sp, i) => (
            <div
              key={`${sp.name}-${i}`}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {sp.name}
                    </h2>
                    <div className="text-[11px] text-slate-500">{sp.league_label}</div>
                  </div>
                  {sp.battle_win_rate !== undefined && (
                    <span className="shrink-0 font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                      {sp.kind === 'pvp'
                        ? `Grade ${sp.battle_grade || '?'}${sp.threat_score !== undefined ? ` · Threat ${sp.threat_score}` : ` · ${sp.battle_win_rate}%`}`
                        : `${sp.battle_win_rate} eDPS`}
                    </span>
                  )}
                </div>

                {sp.pvpoke_grades && (
                  <div className="mt-2.5 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200/80 bg-slate-50/70 py-1 text-center font-mono text-[10px] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/50">
                    <div>
                      <span className="text-slate-500">Cov </span>
                      <b className="text-slate-900 dark:text-slate-100">{sp.pvpoke_grades.coverage}</b>
                    </div>
                    <div>
                      <span className="text-slate-500">Bulk </span>
                      <b className="text-slate-900 dark:text-slate-100">{sp.pvpoke_grades.bulk}</b>
                    </div>
                    <div>
                      <span className="text-slate-500">Safe </span>
                      <b className="text-slate-900 dark:text-slate-100">{sp.pvpoke_grades.safety}</b>
                    </div>
                    <div>
                      <span className="text-slate-500">Cons </span>
                      <b className="text-slate-900 dark:text-slate-100">{sp.pvpoke_grades.consistency}</b>
                    </div>
                  </div>
                )}

                <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {sp.members.map((mb, mIdx) => (
                    <div key={`${mb.raw_id}-${mIdx}`} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        {mb.found ? (
                          <button
                            type="button"
                            onClick={() => onInspectId(mb.id)}
                            className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                          >
                            {mb.name}
                          </button>
                        ) : (
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            {mb.name}
                          </span>
                        )}
                        <span className="font-mono text-slate-500">
                          {mb.found ? `CP ${formatNum(mb.cp)} · ${mb.iv}` : 'Missing'}
                        </span>
                      </div>
                      {mb.warning && (
                        <div className="mt-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          Warning: {mb.warning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {sp.holes && sp.holes.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800">
                    Meta holes: {sp.holes.slice(0, 3).join(', ')}
                  </div>
                )}
              </div>

              {sp.bench_upgrade && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                  <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                    <span>Bench Upgrade (+{sp.bench_upgrade.gain_pct}%)</span>
                    {sp.bench_upgrade.grade_before && sp.bench_upgrade.grade_after && (
                      <span className="font-mono">
                        Grade {sp.bench_upgrade.grade_before} → {sp.bench_upgrade.grade_after}
                      </span>
                    )}
                    {sp.bench_upgrade.edps_before !== undefined && sp.bench_upgrade.edps_after !== undefined && (
                      <span className="font-mono">
                        {sp.bench_upgrade.edps_before} → {sp.bench_upgrade.edps_after} eDPS
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5">
                    Swap {sp.bench_upgrade.replace_name} →{' '}
                    <button
                      type="button"
                      onClick={() => onInspectId(sp.bench_upgrade!.with_id)}
                      className="font-bold underline hover:text-teal-600"
                    >
                      {sp.bench_upgrade.with_name} ({sp.bench_upgrade.with_iv})
                    </button>
                  </div>
                  {(sp.bench_upgrade.score_before !== undefined || sp.bench_upgrade.threat_before !== undefined) && (
                    <div className="mt-0.5 font-mono text-[10px] opacity-90 tabular-nums">
                      {sp.bench_upgrade.score_before !== undefined && sp.bench_upgrade.score_after !== undefined
                        ? `Score ${sp.bench_upgrade.score_before} → ${sp.bench_upgrade.score_after}`
                        : ''}
                      {sp.bench_upgrade.threat_before !== undefined && sp.bench_upgrade.threat_after !== undefined
                        ? ` · Threat ${sp.bench_upgrade.threat_before} → ${sp.bench_upgrade.threat_after}`
                        : ''}
                    </div>
                  )}
                  <div className="mt-0.5 opacity-85">{sp.bench_upgrade.reason}</div>
                </div>
              )}
            </div>
          ))}
          {savedParties.length === 0 && (
            <div className="col-span-full rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
              No saved Battle Parties found in playerPreferences.
            </div>
          )}
        </div>
      )}

      {subTab === 'builds' && lg && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
            {lg.league} Builds ({lg.builds.length})
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {lg.builds.map((b) => {
              const rMon = monMap.get(b.id);
              const sim = rMon?.pvp_battle;
              const needsSecondMove = Boolean(b.needs_second_move || rMon?.needs_second_move);
              return (
                <div key={b.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onInspectId(b.id)}
                        className="text-sm font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {b.species}
                      </button>
                      <span className="font-mono text-xs text-slate-500">
                        CP {formatNum(b.cp)} · {b.iv}
                      </span>
                      {sim && (
                        <span className="font-mono text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                          1v1 {sim.win_rate_1v1}% · CMP {sim.cmp_wins}/{sim.cmp_total}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{b.role}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {needsSecondMove && b.status !== 'Needs second charged move' && (
                      <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS['Needs second charged move']}`}>
                        Needs 2nd Charged Move
                      </span>
                    )}
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_COLORS[b.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.Unknown
                      }`}
                    >
                      {b.status === 'Needs second charged move' ? 'Needs 2nd Charged Move' : b.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => copySearch(b.search, b.species)}
                      className="rounded border border-slate-200 p-1 text-slate-500 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:hover:text-teal-400"
                      title="Copy search string"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {lg.builds.length === 0 && (
              <div className="py-3 text-xs text-slate-500">No builds queued for {lg.league}.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const MegaTab: React.FC<BattleTabProps> = ({ report, onInspectId }) => {
  const [viewMode, setViewMode] = useState<'strategy' | 'builds' | 'cycling' | 'coverage'>('strategy');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'covered' | 'ready' | 'missing'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const mega = report.grade?.sections?.mega;
  const opt = report.mega_optimizer;
  const curatedRows = report.curated_megas || mega?.curated || [];
  const megaBuilds = report.mons.filter((m) => m.verdict === 'BUILD_MEGA');

  if (!mega && !opt && curatedRows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        No Mega Evolution coverage data available in this report.
      </div>
    );
  }

  const hasAnyOwned = (r: (typeof curatedRows)[number]) =>
    r.expensive.owned || r.cheap.owned || r.alternatives.some((a) => a.owned);
  const coveredCount = curatedRows.filter((r) => r.covered).length;
  const readyCount = curatedRows.filter((r) => !r.covered && hasAnyOwned(r)).length;
  const missingCount = curatedRows.filter((r) => !r.covered && !hasAnyOwned(r)).length;

  const filteredCuratedRows = curatedRows.filter((row) => {
    if (typeFilter !== 'all' && row.type !== typeFilter) return false;
    if (statusFilter === 'covered' && !row.covered) return false;
    if (statusFilter === 'ready' && (row.covered || !hasAnyOwned(row))) return false;
    if (statusFilter === 'missing' && (row.covered || hasAnyOwned(row))) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchType = row.displayName.toLowerCase().includes(q) || row.type.toLowerCase().includes(q);
      const matchExp =
        row.expensive.name.toLowerCase().includes(q) ||
        row.expensive.roleNote.toLowerCase().includes(q) ||
        Boolean(row.expensive.bestSpecimen?.name.toLowerCase().includes(q));
      const matchCheap =
        row.cheap.name.toLowerCase().includes(q) ||
        row.cheap.roleNote.toLowerCase().includes(q) ||
        Boolean(row.cheap.bestSpecimen?.name.toLowerCase().includes(q));
      const matchAlt = (row.alternatives || []).some(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          Boolean(a.bestSpecimen?.name.toLowerCase().includes(q)),
      );
      if (!matchType && !matchExp && !matchCheap && !matchAlt) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Summary Bar */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Mega &amp; Primal Roster Strategy
          </h1>
          <span className="text-xs font-semibold text-slate-500">
            Narrowed to Curated Raid Meta &amp; Active Unlocks
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Streamlined strategy split into <b>Expensive</b> (high investment / top power) and <b>Cheap</b> (100–200 energy budget) options across all 18 types. Cooldown cycling toward Lv3 XL Candy boosts.
        </p>
      </div>

      {/* 4-Stat Metric Strip */}
      <div className="grid grid-cols-2 divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800/90 dark:border-slate-800/90 dark:bg-[#0F1B28]">
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Curated Types Covered
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {coveredCount} <span className="text-xs font-normal text-slate-400">/ 18</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {readyCount} more ready in box
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Core Mega Builds
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
            {megaBuilds.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Pruned from redundant Megas
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Level 3 (Max XL)
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">
            {opt?.lv3_count || 0}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {opt?.lv2_count || 0} at Lv2 · {opt?.lv1_count || 0} at Lv1
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Active / Cycling
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {opt?.active_megas.length || 0} <span className="text-xs font-normal text-slate-400">active</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {opt?.cycle_queue.length || 0} in cooldown rotation
          </div>
        </div>
      </div>

      {/* Active Mega Evolution Banner */}
      {opt && opt.active_megas.length > 0 && (
        <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4 text-xs dark:border-purple-500/30">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">
            <Zap className="h-3.5 w-3.5" />
            Active Mega Evolution Timer
          </div>
          <div className="mt-2 divide-y divide-purple-500/20">
            {opt.active_megas.map((am) => (
              <div key={am.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onInspectId(am.id)}
                  className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                >
                  {am.mega_name} (Lv{am.mega_level}) · CP {formatNum(am.cp)}
                </button>
                <span className="font-mono font-bold text-purple-800 dark:text-purple-300 tabular-nums">
                  {am.active_remaining_min !== null
                    ? `${Math.floor(am.active_remaining_min / 60)}h ${am.active_remaining_min % 60}m remaining`
                    : 'Active'}
                  {am.boosts.length > 0 ? ` · Boosts ${am.boosts.join('/')}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation & View Mode Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800/90">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('strategy')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'strategy'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            🎯 Meta Strategy (Expensive vs Cheap)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('builds')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'builds'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            ⚔️ My Mega Builds ({megaBuilds.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cycling')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'cycling'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            ⏱️ Cooldown Queue ({opt?.cycle_queue.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('coverage')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'coverage'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            📊 Type Grid ({mega?.types.length || 18})
          </button>
        </div>

        {viewMode === 'strategy' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter Pokémon or moves..."
                className="h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded px-2 py-1 font-medium transition-colors ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white' : 'text-slate-500'}`}
              >
                All (18)
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('covered')}
                className={`rounded px-2 py-1 font-medium transition-colors ${statusFilter === 'covered' ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-500'}`}
              >
                Covered ({coveredCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ready')}
                className={`rounded px-2 py-1 font-medium transition-colors ${statusFilter === 'ready' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-900 dark:text-teal-400' : 'text-slate-500'}`}
              >
                Ready in Box ({readyCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('missing')}
                className={`rounded px-2 py-1 font-medium transition-colors ${statusFilter === 'missing' ? 'bg-white text-amber-700 shadow-xs dark:bg-slate-900 dark:text-amber-400' : 'text-slate-500'}`}
              >
                Need Base ({missingCount})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: CURATED EXPENSIVE VS CHEAP STRATEGY MATRIX */}
      {viewMode === 'strategy' && (
        <div className="space-y-4">
          {/* Quick type chips */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors whitespace-nowrap ${
                typeFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              All Types
            </button>
            {curatedRows.map((r) => (
              <button
                key={r.type}
                type="button"
                onClick={() => setTypeFilter(r.type)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition-colors whitespace-nowrap ${
                  typeFilter === r.type
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span>{r.icon}</span>
                <span className="capitalize">{r.displayName}</span>
                {r.covered && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              </button>
            ))}
          </div>

          {/* Cards for each type */}
          <div className="space-y-4">
            {filteredCuratedRows.map((row) => (
              <div
                key={row.type}
                className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                {/* Type Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE_COLORS[row.type] || '#64748b' }}
                    />
                    <span className="text-lg">{row.icon}</span>
                    <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 capitalize">
                      {row.displayName} Type Mega Strategy
                    </h2>
                  </div>
                  <div>
                    {row.covered ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Unlocked &amp; Covered
                      </span>
                    ) : row.expensive.owned || row.cheap.owned || row.alternatives.some((a) => a.owned) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400">
                        <Zap className="h-3.5 w-3.5" />
                        In Box (Ready to Mega)
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                        ○ Need Mega Base
                      </span>
                    )}
                  </div>
                </div>

                {/* 2-Column Grid: Expensive vs Cheap */}
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* EXPENSIVE OPTION */}
                  <div className="flex flex-col justify-between rounded-lg border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800/80 dark:bg-slate-900/30">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-400">
                            Expensive Option
                          </span>
                          {row.expensive.pokebaseTier && (
                            <span className="rounded bg-purple-600/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800 dark:bg-purple-400/20 dark:text-purple-200">
                              {row.expensive.pokebaseTier} Tier
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                          {row.expensive.costLabel}
                        </span>
                      </div>
                      <div className="mt-1 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                        {row.expensive.name}
                      </div>
                      {row.expensive.highlightMove && (
                        <div className="mt-0.5 font-mono text-xs font-semibold text-purple-700 dark:text-purple-300">
                          Move: {row.expensive.highlightMove}
                        </div>
                      )}
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {row.expensive.roleNote}
                      </p>
                    </div>

                    {/* Ownership status */}
                    <div className="mt-3">
                      {row.expensive.unlocked && row.expensive.bestSpecimen ? (
                        <button
                          type="button"
                          onClick={() => onInspectId(row.expensive.bestSpecimen!.id)}
                          className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-left transition-colors hover:border-emerald-500"
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <span>Mega Lv{row.expensive.bestSpecimen.mega_level} Unlocked</span>
                            <span className="text-[10px] uppercase font-semibold">Inspect ➔</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {row.expensive.bestSpecimen.name} · CP {formatNum(row.expensive.bestSpecimen.cp)} · IV {row.expensive.bestSpecimen.iv} ({row.expensive.bestSpecimen.iv_pct}%)
                          </div>
                        </button>
                      ) : row.expensive.owned && row.expensive.bestSpecimen ? (
                        <button
                          type="button"
                          onClick={() => onInspectId(row.expensive.bestSpecimen!.id)}
                          className="w-full rounded-lg border border-teal-500/40 bg-teal-500/10 p-2.5 text-left transition-colors hover:border-teal-500"
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-teal-800 dark:text-teal-300">
                            <span>
                              {row.expensive.bestSpecimen.is_pre_evo
                                ? 'Pre-Evolution Owned (Ready to Evolve)'
                                : 'Candidate in Box'}
                            </span>
                            <span className="text-[10px] uppercase font-semibold">Inspect ➔</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-teal-700 dark:text-teal-400 tabular-nums">
                            {row.expensive.bestSpecimen.name} · CP {formatNum(row.expensive.bestSpecimen.cp)} · IV {row.expensive.bestSpecimen.iv} ({row.expensive.bestSpecimen.iv_pct}%)
                          </div>
                        </button>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-2 text-center text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                          Not currently in box · Hunt in raids or events
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CHEAP OPTION */}
                  <div className="flex flex-col justify-between rounded-lg border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800/80 dark:bg-slate-900/30">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold tracking-wider text-teal-700 uppercase dark:text-teal-400">
                            Cheap Option
                          </span>
                          {row.cheap.pokebaseTier && (
                            <span className="rounded bg-purple-600/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800 dark:bg-purple-400/20 dark:text-purple-200">
                              {row.cheap.pokebaseTier} Tier
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                          {row.cheap.costLabel}
                        </span>
                      </div>
                      <div className="mt-1 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                        {row.cheap.name}
                      </div>
                      {row.cheap.highlightMove && (
                        <div className="mt-0.5 font-mono text-xs font-semibold text-purple-700 dark:text-purple-300">
                          Move: {row.cheap.highlightMove}
                        </div>
                      )}
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {row.cheap.roleNote}
                      </p>
                    </div>

                    {/* Ownership status */}
                    <div className="mt-3">
                      {row.cheap.unlocked && row.cheap.bestSpecimen ? (
                        <button
                          type="button"
                          onClick={() => onInspectId(row.cheap.bestSpecimen!.id)}
                          className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-left transition-colors hover:border-emerald-500"
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <span>Mega Lv{row.cheap.bestSpecimen.mega_level} Unlocked</span>
                            <span className="text-[10px] uppercase font-semibold">Inspect ➔</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {row.cheap.bestSpecimen.name} · CP {formatNum(row.cheap.bestSpecimen.cp)} · IV {row.cheap.bestSpecimen.iv} ({row.cheap.bestSpecimen.iv_pct}%)
                          </div>
                        </button>
                      ) : row.cheap.owned && row.cheap.bestSpecimen ? (
                        <button
                          type="button"
                          onClick={() => onInspectId(row.cheap.bestSpecimen!.id)}
                          className="w-full rounded-lg border border-teal-500/40 bg-teal-500/10 p-2.5 text-left transition-colors hover:border-teal-500"
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-teal-800 dark:text-teal-300">
                            <span>
                              {row.cheap.bestSpecimen.is_pre_evo
                                ? 'Pre-Evolution Owned (Ready to Evolve)'
                                : 'Candidate in Box'}
                            </span>
                            <span className="text-[10px] uppercase font-semibold">Inspect ➔</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-teal-700 dark:text-teal-400 tabular-nums">
                            {row.cheap.bestSpecimen.name} · CP {formatNum(row.cheap.bestSpecimen.cp)} · IV {row.cheap.bestSpecimen.iv} ({row.cheap.bestSpecimen.iv_pct}%)
                          </div>
                        </button>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-2 text-center text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                          Not currently in box · Hunt in raids or events
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Alternatives row */}
                {row.alternatives && row.alternatives.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                    <span className="font-semibold text-slate-500">Notable Alternatives:</span>
                    {row.alternatives.map((alt) => (
                      <span key={alt.sid} className="inline-flex flex-wrap items-center gap-1.5">
                        {alt.bestSpecimen ? (
                          <button
                            type="button"
                            onClick={() => onInspectId(alt.bestSpecimen!.id)}
                            className={`font-medium underline decoration-slate-300 hover:text-teal-600 dark:decoration-slate-700 ${
                              alt.fallbackActive
                                ? 'font-semibold text-teal-700 dark:text-teal-300'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {alt.name}
                            {alt.pokebaseTier ? ` [${alt.pokebaseTier}]` : ''} ({alt.costLabel}) ·{' '}
                            {alt.bestSpecimen.iv_pct}%
                          </button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">
                            {alt.name}
                            {alt.pokebaseTier ? ` [${alt.pokebaseTier}]` : ''} ({alt.costLabel})
                          </span>
                        )}
                        {alt.fallbackActive && (
                          <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 dark:text-teal-300">
                            Active Fallback (Covers missing {!row.cheap.owned ? row.cheap.name : row.expensive.name})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {filteredCuratedRows.length === 0 && (
              <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
                No Mega types match the current filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: MY MEGA BUILDS (PRUNED CORE PICKS) */}
      {viewMode === 'builds' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-500">
            Showing {megaBuilds.length} high-value Mega builds prioritized for your account. Redundant and weak un-unlocked Megas have been pruned so they won't clog your Build Plan.
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {megaBuilds.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectId(m.id)}
                    className="text-left font-display text-base font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    {m.species}
                  </button>
                  {m.flags.some((f) => f.startsWith('Mega Lv')) && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                      Unlocked
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                  CP {formatNum(m.cp)} · IV {m.iv} ({m.iv_pct}%)
                  {m.power_up_to ? ` · Power-up ➔ L${m.power_up_to}` : ''}
                </div>
                <div className="mt-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {m.role}
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {m.why}
                </div>
                {m.moveset && (
                  <div className="mt-2 font-mono text-[11px] text-slate-500">
                    Recommended Moves: {m.moveset}
                  </div>
                )}
              </div>
            ))}
            {megaBuilds.length === 0 && (
              <div className="col-span-full rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]">
                No Mega build candidates currently assigned.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: COOLDOWN CYCLING QUEUE */}
      {viewMode === 'cycling' && opt && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Free-Cooldown Cycling Queue Toward Mega Level 3 ({opt.cycle_queue.length})
              </h2>
              <span className="text-xs text-slate-500">
                Lv1 → Lv2 at 7 uses · Lv2 → Lv3 at 30 uses (Max XL Candy Bonus)
              </span>
            </div>
            <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {opt.cycle_queue.map((mq) => (
                <div key={mq.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => onInspectId(mq.id)}
                      className="font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                    >
                      {mq.mega_name}
                    </button>{' '}
                    <span className="font-mono text-slate-500 tabular-nums">
                      CP {formatNum(mq.cp)} · {mq.iv} ({mq.iv_pct}%)
                    </span>
                    {mq.boosts.length > 0 && (
                      <span className="ml-2 capitalize text-slate-500">
                        · Boosts {mq.boosts.join('/')}
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-semibold tabular-nums text-purple-700 dark:text-purple-300">
                    Lv{mq.mega_level} → Lv{mq.next_level} ({mq.points_to_next} free Mega{' '}
                    {mq.points_to_next === 1 ? 'use' : 'uses'} left)
                  </div>
                </div>
              ))}
              {opt.cycle_queue.length === 0 && (
                <div className="py-6 text-center text-slate-400">
                  No unlocked Megas in cooldown queue.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: FULL TYPE COVERAGE GRID */}
      {viewMode === 'coverage' && mega && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {mega.types.map((t) => (
              <div
                key={t.type}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                  t.covered
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200/80 bg-white text-slate-500 dark:border-slate-800/90 dark:bg-[#0F1B28]'
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium capitalize">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[t.type] || '#64748b' }}
                  />
                  {t.type}
                </span>
                <span className={`font-mono font-semibold ${t.covered ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {t.forms.length}
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {mega.priority.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1B28]"
              >
                <button
                  type="button"
                  onClick={() => onInspectId(m.id)}
                  className="text-left text-sm font-bold text-slate-900 hover:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                >
                  {m.form}
                </button>
                <div className="mt-0.5 text-xs text-slate-500">
                  From {m.mine} · CP {formatNum(m.cp)} · {m.iv} ({m.iv_pct}%)
                </div>
                {m.tags.length > 0 && (
                  <div className="mt-2 text-[11px] font-medium text-purple-700 dark:text-purple-300">
                    {m.tags.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
