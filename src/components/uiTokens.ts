import type { BuildStatus, VerdictType } from '../engine/types';

export type TabKey =
  | 'today'
  | 'home'
  | 'out'
  | 'plan'
  | 'power'
  | 'bottle'
  | 'wish'
  | 'raid'
  | 'max'
  | 'pvp'
  | 'mega'
  | 'trade'
  | 'buddy'
  | 'showcase'
  | 'depth'
  | 'grade'
  | 'items'
  | 'medals'
  | 'mons'
  | 'defenders'
  | 'settings';

export const TYPE_COLORS: Record<string, string> = {
  normal: '#9ca3af',
  fire: '#ef4444',
  water: '#3b82f6',
  electric: '#eab308',
  grass: '#22c55e',
  ice: '#06b6d4',
  fighting: '#dc2626',
  poison: '#a855f7',
  ground: '#d97706',
  flying: '#818cf8',
  psychic: '#ec4899',
  bug: '#84cc16',
  rock: '#a16207',
  ghost: '#7c3aed',
  dragon: '#4f46e5',
  dark: '#475569',
  steel: '#64748b',
  fairy: '#f472b6',
};

export const VERDICT_NAMES: Record<VerdictType, string> = {
  BUILD_PVP: 'Build PvP',
  BUILD_MEGA: 'Build Mega',
  BUILD_RAID: 'Build Raid',
  BUILD_MAX: 'Build Max',
  BUILD_GYM: 'Build Gym',
  KEEP: 'Collection',
  TRADE: 'Trade',
  REVIEW: 'Review',
  TRANSFER: 'Transfer',
};

export const VERDICT_COLORS: Record<VerdictType, string> = {
  BUILD_PVP: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  BUILD_MEGA: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  BUILD_RAID: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  BUILD_MAX: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  BUILD_GYM: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  KEEP: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  TRADE: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  REVIEW: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  TRANSFER: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
};

export const STATUS_COLORS: Record<BuildStatus, string> = {
  Ready: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'Needs TM': 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'Needs second charged move': 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  'Needs Elite TM': 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  Unknown: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

export const STATUS_ORDER: BuildStatus[] = [
  'Ready',
  'Needs TM',
  'Needs second charged move',
  'Needs Elite TM',
  'Unknown',
];

export const WISH_STATUS_CLASSES: Record<string, string> = {
  HAVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  UPGRADE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  HUNT: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  DECIDE: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  'NO DYNAMAX': 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  CANDIDATE: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  'EVOLVE FIRST': 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
};

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'home', label: 'Overview' },
  { key: 'out', label: 'Transfer & Review' },
  { key: 'plan', label: 'Build Plan' },
  { key: 'bottle', label: 'Bottle Caps' },
  { key: 'wish', label: 'Wishlist' },
  { key: 'raid', label: 'Raid' },
  { key: 'max', label: 'Max Battles' },
  { key: 'pvp', label: 'PvP' },
  { key: 'mega', label: 'Mega' },
  { key: 'trade', label: 'Trade & Lucky' },
  { key: 'buddy', label: 'Buddy & Eggs' },
  { key: 'showcase', label: 'Showcase' },
  { key: 'depth', label: 'Collection' },
  { key: 'grade', label: 'Account Grade' },
  { key: 'items', label: 'Items & Gyms' },
  { key: 'medals', label: 'Medals & XP' },
  { key: 'mons', label: 'All Pokémon' },
  { key: 'settings', label: 'Settings' },
];

export function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export function downloadFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
