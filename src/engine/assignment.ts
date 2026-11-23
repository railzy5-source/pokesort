/**
 * Optimal assignment (Hungarian algorithm, Kuhn-Munkres).
 *
 * Used where the best OVERALL combination matters, not a greedy "best first" pass. Example: choosing one Mega Pokémon for
 * each raid type when one Pokémon could serve several types.
 */

/**
 * Maximum-weight assignment of rows to columns. Every row gets at most one column and every column at most one row.
 * A cell weight <= 0 (or non-finite) means "not allowed / no value": such a pairing is never returned.
 *
 * @returns for each row, the chosen column index, or -1 when the row is left unassigned.
 */
export function maxWeightAssignment(weights: number[][]): number[] {
  const rows = weights.length;
  if (rows === 0) return [];
  const cols = Math.max(...weights.map((r) => r.length), 0);
  if (cols === 0) return new Array(rows).fill(-1);

  // Columns: the real ones plus one "leave unassigned" column per row, so every row can always be placed.
  const m = cols + rows;
  const clean = (v: number | undefined) => (Number.isFinite(v as number) && (v as number) > 0 ? (v as number) : 0);
  let maxW = 0;
  for (const r of weights) for (const v of r) maxW = Math.max(maxW, clean(v));
  // Minimise cost = maxW - weight. A 0-weight cell therefore costs the same as being left unassigned.
  const cost: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = new Array(m);
    for (let j = 0; j < m; j++) row[j] = j < cols ? maxW - clean(weights[i][j]) : maxW;
    cost.push(row);
  }

  // Standard O(n^2 m) Hungarian algorithm for n rows <= m columns (1-indexed potentials).
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(rows + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0); // p[j] = row matched to column j
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= rows; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array(rows).fill(-1);
  for (let j = 1; j <= cols; j++) {
    const i = p[j];
    if (i > 0 && clean(weights[i - 1][j - 1]) > 0) result[i - 1] = j - 1;
  }
  return result;
}
