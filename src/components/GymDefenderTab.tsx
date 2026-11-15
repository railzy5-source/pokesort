import React, { useMemo, useState } from 'react';
import { Shield, Award, Copy, Zap, Heart, AlertTriangle } from 'lucide-react';
import type { ReportJson, ReportMon } from '../engine/types';
import { copyToClipboard, formatNum, TYPE_COLORS } from './uiTokens';

interface GymDefenderTabProps {
  report: ReportJson;
  onInspectId: (id: string) => void;
  onNotify: (msg: string) => void;
}

interface MetaDefenderDef {
  dex: number;
  species: string;
  tier: 'S' | 'A' | 'B';
  role: string;
  bestFast: string[];
  bestCharged: string[];
  notes: string;
}

const META_DEFENDERS: MetaDefenderDef[] = [
  {
    dex: 242,
    species: 'Blissey',
    tier: 'S',
    role: 'The Ultimate Time-Waster (Highest HP + Stall)',
    bestFast: ['Zen Headbutt', 'Pound'],
    bestCharged: ['Dazzling Gleam', 'Psychic', 'Hyper Beam'],
    notes: 'Absolute #1 gym defender. Stalls attackers out with massive stamina and Dazzling Gleam punishing Fighting types.',
  },
  {
    dex: 113,
    species: 'Chansey',
    tier: 'S',
    role: 'Stall Specialist (Stays below 3000 CP for Slow Decay)',
    bestFast: ['Zen Headbutt', 'Pound'],
    bestCharged: ['Dazzling Gleam', 'Psychic'],
    notes: 'Below 3000 CP means its motivation decays much slower than Blissey, forcing attackers to grind through high HP repeatedly.',
  },
  {
    dex: 143,
    species: 'Snorlax',
    tier: 'S',
    role: 'Bulky Generalist Defender with Ghost/Fairy Coverage',
    bestFast: ['Zen Headbutt', 'Lick'],
    bestCharged: ['Body Slam', 'Superpower', 'Outrage', 'Heavy Slam'],
    notes: 'Body Slam charges quickly and catches attackers off guard. Extremely bulky and difficult to type-counter efficiently.',
  },
  {
    dex: 289,
    species: 'Slaking',
    tier: 'A',
    role: 'Raw CP Giant (Fast Motivation Decay above 3000 CP)',
    bestFast: ['Yawn'],
    bestCharged: ['Play Rough', 'Hyper Beam', 'Earthquake'],
    notes: 'Highest CP in the game, intimidating at the top of a gym, though Yawn deals zero damage so it relies purely on charge moves.',
  },
  {
    dex: 202,
    species: 'Wobbuffet',
    tier: 'A',
    role: 'Super Bulky Psychic Wall',
    bestFast: ['Counter', 'Charm'],
    bestCharged: ['Return', 'Mirror Coat', 'Psychic'],
    notes: 'Purified Return Wobbuffet is a nightmare for Fighting-type attackers in gyms due to resistance and bulky HP.',
  },
  {
    dex: 468,
    species: 'Togekiss',
    tier: 'A',
    role: 'Fairy Terrorist against Fighting Counters',
    bestFast: ['Charm', 'Air Slash'],
    bestCharged: ['Dazzling Gleam', 'Ancient Power', 'Flamethrower'],
    notes: 'Double resists Fighting attacks used against Normal defenders, destroying Machamp and Lucario.',
  },
  {
    dex: 350,
    species: 'Milotic',
    tier: 'A',
    role: 'Bulky Water Tank with Dragon Tail',
    bestFast: ['Dragon Tail', 'Waterfall'],
    bestCharged: ['Surf', 'Blizzard', 'Hyper Beam'],
    notes: 'Resists Fire and Water, with Blizzard punishing Dragon or Grass counter-attackers.',
  },
  {
    dex: 376,
    species: 'Metagross',
    tier: 'A',
    role: 'Steel/Psychic Tank resisting Poison and Fighting',
    bestFast: ['Bullet Punch', 'Zen Headbutt'],
    bestCharged: ['Meteor Mash', 'Earthquake', 'Flash Cannon'],
    notes: 'Exceptional stats and resistances make it a premier gym anchor.',
  },
  {
    dex: 131,
    species: 'Lapras',
    tier: 'B',
    role: 'Ice/Water Wall against Dragon and Ground',
    bestFast: ['Ice Shard', 'Frost Breath', 'Water Gun'],
    bestCharged: ['Surf', 'Ice Beam', 'Skull Bash'],
    notes: 'Classic bulky defender with great type coverage.',
  },
  {
    dex: 823,
    species: 'Corviknight',
    tier: 'B',
    role: 'Steel/Flying Defensive Fortress',
    bestFast: ['Metal Claw', 'Air Slash'],
    bestCharged: ['Iron Head', 'Brave Bird', 'Flash Cannon'],
    notes: 'Extremely few weaknesses (only Fire and Electric) and high defensive stats.',
  },
];

export const GymDefenderTab: React.FC<GymDefenderTabProps> = ({ report, onInspectId, onNotify }) => {
  const [filterTier, setFilterTier] = useState<string>('ALL');
  const [showOnlyOwned, setShowOnlyOwned] = useState<boolean>(false);

  const ownedDefenders = useMemo(() => {
    const map = new Map<string, ReportMon>();
    for (const m of report.mons) {
      if (m.verdict === 'TRANSFER' || m.verdict === 'TRADE') continue;
      const key = (m.species || '').toLowerCase();
      const existing = map.get(key);
      if (!existing || m.cp > existing.cp || (m.cp === existing.cp && m.iv_pct > existing.iv_pct)) {
        map.set(key, m);
      }
    }
    return map;
  }, [report.mons]);

  const filteredMeta = useMemo(() => {
    return META_DEFENDERS.filter((def) => {
      if (filterTier !== 'ALL' && def.tier !== filterTier) return false;
      const owned = ownedDefenders.get(def.species.toLowerCase());
      if (showOnlyOwned && !owned) return false;
      return true;
    });
  }, [filterTier, showOnlyOwned, ownedDefenders]);

  const copyGymSearch = async () => {
    const query = `blissey,chansey,snorlax,slaking,wobbuffet,togekiss,milotic,metagross,lapras,corviknight&!4*&!favorite`;
    const ok = await copyToClipboard(query);
    onNotify(ok ? 'Copied gym defender search string' : 'Copy failed');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Gym Defender Tier List &amp; Box Audit
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Defend gyms efficiently with S-tier stalling walls (Blissey, Chansey, Snorlax) and CP decay management (&lt;3000 CP slow decay rule).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyGymSearch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-600 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-200"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy Ingame Search</span>
          </button>
        </div>
      </div>

      {/* Educational Banner on CP Decay */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="font-bold flex items-center gap-1.5 mb-1">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>The &lt;3,000 CP Gym Decay Rule</span>
        </div>
        Pokémon with over 3,000 CP (like high-level Slaking, Dragonite, or Tyranitar) suffer dramatically faster motivation (CP) decay in gyms over time. For maximum defensive stall, Snorlax, Chansey, or Blissey kept just below 3,000 CP retain motivation much longer without constant Golden Razz feeding.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'S', 'A', 'B'] as const).map((tr) => (
            <button
              key={tr}
              type="button"
              onClick={() => setFilterTier(tr)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                filterTier === tr
                  ? 'border-teal-500 bg-teal-500/12 text-teal-800 dark:text-teal-300'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#0F1B28] dark:text-slate-300'
              }`}
            >
              {tr === 'ALL' ? 'All Tiers' : `Tier ${tr}`}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyOwned}
            onChange={(e) => setShowOnlyOwned(e.target.checked)}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <span>Show only owned in box</span>
        </label>
      </div>

      {/* Defender Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredMeta.map((def) => {
          const owned = ownedDefenders.get(def.species.toLowerCase());
          return (
            <div
              key={def.species}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/90 dark:bg-[#0F1B28]"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{def.dex}</span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {def.species}
                    </h2>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                      def.tier === 'S'
                        ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                        : def.tier === 'A'
                        ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                        : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    }`}
                  >
                    Tier {def.tier}
                  </span>
                </div>

                <div className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {def.role}
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {def.notes}
                </p>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500">
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Fast:</span>{' '}
                    {def.bestFast.join(' / ')}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Charged:</span>{' '}
                    {def.bestCharged.join(' / ')}
                  </div>
                </div>
              </div>

              {/* Owned Box Status */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                {owned ? (
                  <button
                    type="button"
                    onClick={() => onInspectId(owned.id)}
                    className={`w-full rounded-lg border p-2.5 text-left transition ${
                      owned.cp >= 3000
                        ? 'border-amber-500/40 bg-amber-500/8 hover:border-amber-500'
                        : 'border-emerald-500/40 bg-emerald-500/8 hover:border-emerald-500'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className={owned.cp >= 3000 ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}>
                        {owned.cp >= 3000 ? 'Owned (&gt;3000 CP Fast Decay)' : 'Owned (&lt;3000 CP Slow Decay Optimal)'}
                      </span>
                      <span className="text-[10px] uppercase font-semibold text-slate-500">Inspect ➔</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 tabular-nums">
                      CP {formatNum(owned.cp)} · L{owned.level} · IV {owned.iv} ({owned.iv_pct}%) · {owned.verdict}
                    </div>
                  </button>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-2 text-center text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    Not currently owned in box · Hunt for high HP/Def IVs
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
