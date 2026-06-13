import type { PerformanceTable, PerfConditions } from '../../types'

/** Interpolation linéaire entre deux valeurs */
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

/** Index + fraction dans un tableau trié */
function indexFraction(arr: number[], val: number): [number, number] {
  const clamped = Math.max(arr[0], Math.min(arr[arr.length - 1], val))
  let i = arr.findIndex(v => v >= clamped)
  if (i <= 0) return [0, 0]
  const t = (clamped - arr[i - 1]) / (arr[i] - arr[i - 1])
  return [i - 1, t]
}

/**
 * Interpolation trilinéaire dans la table de performance.
 * @returns distance en mètres
 */
export function interpolatePerf(
  table: PerformanceTable,
  weight: number,
  pa: number,
  oat: number,
): number {
  const [wi, wt] = indexFraction(table.weights, weight)
  const [pi, pt] = indexFraction(table.pressureAltitudes, pa)
  const [oi, ot] = indexFraction(table.oats, oat)

  const get = (w: number, p: number, o: number) =>
    table.values[Math.min(w, table.weights.length - 1)]
      ?.[Math.min(p, table.pressureAltitudes.length - 1)]
      ?.[Math.min(o, table.oats.length - 1)] ?? 0

  // Interpolation sur OAT
  const v000 = lerp(get(wi, pi, oi), get(wi, pi, oi + 1), ot)
  const v010 = lerp(get(wi, pi + 1, oi), get(wi, pi + 1, oi + 1), ot)
  const v100 = lerp(get(wi + 1, pi, oi), get(wi + 1, pi, oi + 1), ot)
  const v110 = lerp(get(wi + 1, pi + 1, oi), get(wi + 1, pi + 1, oi + 1), ot)

  // Interpolation sur PA
  const v00 = lerp(v000, v010, pt)
  const v10 = lerp(v100, v110, pt)

  // Interpolation sur poids
  return lerp(v00, v10, wt)
}

export function computePerf(table: PerformanceTable, cond: PerfConditions): number {
  let d = interpolatePerf(table, cond.weight, cond.pa, cond.oat)
  if (cond.surfaceGrass) d *= table.grassFactor ?? 1.15
  if (cond.windKt > 0) d *= 1 - (table.headwindFactor ?? 0.01) * cond.windKt
  if (cond.windKt < 0) d *= 1 + (table.tailwindFactor ?? 0.015) * Math.abs(cond.windKt)
  if (cond.slopePercent > 0) d *= 1 + (table.slopeFactor ?? 0.05) * cond.slopePercent
  return Math.round(d)
}
