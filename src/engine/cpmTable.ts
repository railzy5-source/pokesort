export interface SpreadTable {
  prods: Map<string, number>;
  asc: number[];
  maxProd: number;
}

/**
 * Authoritative Niantic Pokémon GO CPM (Combat Power Multiplier) values
 * extracted from official Game Master data for levels 1.0 to 51.0 in 0.5 steps.
 */
export const CPM: Record<number, number> = {
  1.0: 0.094,
  1.5: 0.135137432,
  2.0: 0.16639787,
  2.5: 0.192650919,
  3.0: 0.21573247,
  3.5: 0.236572661,
  4.0: 0.25572005,
  4.5: 0.273530381,
  5.0: 0.29024988,
  5.5: 0.306057377,
  6.0: 0.3210876,
  6.5: 0.335445036,
  7.0: 0.34921268,
  7.5: 0.362457751,
  8.0: 0.3752356,
  8.5: 0.387592416,
  9.0: 0.39956728,
  9.5: 0.411193551,
  10.0: 0.4225,
  10.5: 0.432926409,
  11.0: 0.44310755,
  11.5: 0.453059959,
  12.0: 0.4627984,
  12.5: 0.472336093,
  13.0: 0.48168498,
  13.5: 0.4908558,
  14.0: 0.49985844,
  14.5: 0.508701765,
  15.0: 0.51739395,
  15.5: 0.525942511,
  16.0: 0.5343543,
  16.5: 0.542635738,
  17.0: 0.5507927,
  17.5: 0.55883058,
  18.0: 0.5667545,
  18.5: 0.574569133,
  19.0: 0.5822789,
  19.5: 0.589887907,
  20.0: 0.59740001,
  20.5: 0.604823665,
  21.0: 0.6121573,
  21.5: 0.619404122,
  22.0: 0.6265671,
  22.5: 0.633649143,
  23.0: 0.64065295,
  23.5: 0.647580967,
  24.0: 0.65443563,
  24.5: 0.661219252,
  25.0: 0.667934,
  25.5: 0.674581896,
  26.0: 0.6811649,
  26.5: 0.687684904,
  27.0: 0.69414365,
  27.5: 0.70054287,
  28.0: 0.7068842,
  28.5: 0.713169109,
  29.0: 0.7193991,
  29.5: 0.725575615,
  30.0: 0.7317,
  30.5: 0.734741009,
  31.0: 0.7377695,
  31.5: 0.740785594,
  32.0: 0.74378943,
  32.5: 0.746781211,
  33.0: 0.74976104,
  33.5: 0.752729087,
  34.0: 0.7556855,
  34.5: 0.758630368,
  35.0: 0.76156384,
  35.5: 0.764486065,
  36.0: 0.76739717,
  36.5: 0.770297266,
  37.0: 0.7731865,
  37.5: 0.776064962,
  38.0: 0.77893275,
  38.5: 0.781790055,
  39.0: 0.78463697,
  39.5: 0.78747361,
  40.0: 0.79030001,
  40.5: 0.792803968,
  41.0: 0.79530001,
  41.5: 0.797800015,
  42.0: 0.8003,
  42.5: 0.802799995,
  43.0: 0.8053,
  43.5: 0.8078,
  44.0: 0.81029999,
  44.5: 0.812799985,
  45.0: 0.81529999,
  45.5: 0.817799985,
  46.0: 0.82029998,
  46.5: 0.82279998,
  47.0: 0.82529998,
  47.5: 0.827799975,
  48.0: 0.83029997,
  48.5: 0.83279997,
  49.0: 0.83529997,
  49.5: 0.837799965,
  50.0: 0.84029997,
  50.5: 0.842799965,
  51.0: 0.84529996,
};
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
