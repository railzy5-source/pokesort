export interface SpreadTable {
  prods: Map<string, number>;
  asc: number[];
  maxProd: number;
}

function buildCpmTable(): Record<number, number> {
  const anch: Record<number, number> = {
    1: 0.094,
    10: 0.4225,
    20: 0.5974,
    30: 0.7317,
    40: 0.7903,
  };
  const ks = Object.keys(anch)
    .map(Number)
    .sort((a, b) => a - b);
  const cpm: Record<number, number> = {};

  for (let idx = 0; idx < ks.length - 1; idx++) {
    const a = ks[idx];
    const b = ks[idx + 1];
    for (let L = a; L <= b; L++) {
      cpm[L] = Math.sqrt(
        anch[a] * anch[a] +
          ((anch[b] * anch[b] - anch[a] * anch[a]) * (L - a)) / (b - a),
      );
    }
  }
  for (let L = 41; L <= 51; L++) {
    cpm[L] = 0.7903 + 0.005 * (L - 40);
  }
  for (let L = 1; L <= 50; L++) {
    cpm[L + 0.5] = Math.sqrt((cpm[L] * cpm[L] + cpm[L + 1] * cpm[L + 1]) / 2);
  }
  return cpm;
}

export const CPM: Record<number, number> = buildCpmTable();
export const ALL_LEVELS: number[] = Object.keys(CPM)
  .map(Number)
  .sort((a, b) => a - b);
export const LEVELS: number[] = ALL_LEVELS.filter((l) => l <= 50);
export const CPM_LIST: number[] = LEVELS.map((l) => CPM[l]);
export const CPM2_LIST: number[] = CPM_LIST.map((c) => c * c);

export function levelFromCpm(total: number): number {
  let bestLvl = ALL_LEVELS[0];
  let bestDiff = Math.abs(CPM[bestLvl] - total);
  for (let i = 1; i < ALL_LEVELS.length; i++) {
    const lvl = ALL_LEVELS[i];
    const diff = Math.abs(CPM[lvl] - total);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestLvl = lvl;
    }
  }
  return bestLvl;
}

export function computeCp(
  bs: { atk: number; def: number; hp: number },
  a: number,
  d: number,
  s: number,
  level: number,
): number | null {
  const cpm = CPM[level];
  if (cpm === undefined) return null;
  const atk = bs.atk + a;
  const df = bs.def + d;
  const hp = bs.hp + s;
  return Math.max(10, Math.floor((atk * Math.sqrt(df) * Math.sqrt(hp) * cpm * cpm) / 10));
}

export function bestPvpLevel(
  bs: { atk: number; def: number; hp: number },
  cap: number,
  a: number,
  d: number,
  s: number,
): [number, number] | null {
  const atk = bs.atk + a;
  const df = bs.def + d;
  const hp = bs.hp + s;
  const core = atk * Math.sqrt(df * hp);
  let lvl: number;
  if (cap >= 10000) {
    lvl = LEVELS[LEVELS.length - 1];
  } else {
    if (Math.max(10, Math.floor((core * CPM2_LIST[0]) / 10)) > cap) {
      return null;
    }
    let lo = 0;
    let hi = LEVELS.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (Math.max(10, Math.floor((core * CPM2_LIST[mid]) / 10)) <= cap) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    lvl = LEVELS[lo];
  }
  const cp = computeCp(bs, a, d, s, lvl);
  if (cp === null) return null;
  return [lvl, cp];
}

export function buildSpreads(
  bs: { atk: number; def: number; hp: number },
  cap: number,
): SpreadTable | null {
  const prods = new Map<string, number>();
  const n = LEVELS.length;
  for (let a = 0; a < 16; a++) {
    const atk = bs.atk + a;
    for (let d = 0; d < 16; d++) {
      const df = bs.def + d;
      for (let s = 0; s < 16; s++) {
        const hp = bs.hp + s;
        const core = atk * Math.sqrt(df * hp);
        let idx: number;
        if (cap >= 10000) {
          idx = n - 1;
        } else {
          if (Math.max(10, Math.floor((core * CPM2_LIST[0]) / 10)) > cap) {
            continue;
          }
          let lo = 0;
          let hi = n - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (Math.max(10, Math.floor((core * CPM2_LIST[mid]) / 10)) <= cap) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          idx = lo;
        }
        const c = CPM_LIST[idx];
        const prod = atk * c * (df * c) * Math.max(10, Math.floor(hp * c));
        prods.set(`${a},${d},${s}`, prod);
      }
    }
  }
  if (prods.size === 0) return null;
  const asc = Array.from(prods.values()).sort((x, y) => x - y);
  return { prods, asc, maxProd: asc[asc.length - 1] };
}

export function bisectRight(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function ivRankFromSpreads(
  sp: SpreadTable | null,
  a: number,
  d: number,
  s: number,
): [number, number] | null {
  if (!sp) return null;
  const prod = sp.prods.get(`${a},${d},${s}`);
  if (prod === undefined) return null;
  const rank = sp.asc.length - bisectRight(sp.asc, prod) + 1;
  const pct = Math.round((100.0 * prod) / sp.maxProd * 100) / 100;
  return [rank, pct];
}

// Keep backward-compatible helper for any remaining references
export function cpmForLevel(level: number): number {
  const snapped = Math.round(level * 2) / 2;
  return CPM[snapped] ?? CPM[Math.max(1, Math.min(51, snapped))] ?? 0.7903;
}
