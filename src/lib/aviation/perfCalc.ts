import type { PerformanceTable, PerfConditions } from '../../types'

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function indexFraction(arr: number[], val: number): [number, number] {
  const clamped = Math.max(arr[0], Math.min(arr[arr.length - 1], val))
  let i = arr.findIndex(v => v >= clamped)
  if (i <= 0) return [0, 0]
  const t = (clamped - arr[i - 1]) / (arr[i] - arr[i - 1])
  return [i - 1, t]
}

function interpolateWindFactor(
  corrections: Array<{ speedKt: number; factor: number }>,
  windKt: number,
): number {
  if (windKt <= 0) return 1
  const pts = corrections
  if (pts.length === 0) return 1
  if (windKt <= pts[0].speedKt) return pts[0].factor
  if (windKt >= pts[pts.length - 1].speedKt) return pts[pts.length - 1].factor
  for (let i = 1; i < pts.length; i++) {
    if (windKt <= pts[i].speedKt) {
      const t = (windKt - pts[i - 1].speedKt) / (pts[i].speedKt - pts[i - 1].speedKt)
      return lerp(pts[i - 1].factor, pts[i].factor, t)
    }
  }
  return 1
}

export function interpolatePerf(
  table: PerformanceTable,
  weight: number,
  pa: number,
  oat: number,
): number {
  // Convert OAT to ISA delta if needed
  const lookupOat =
    table.oatAxis === 'isa_delta' ? oat - (15 - 2 * pa / 1000) : oat

  const [wi, wt] = indexFraction(table.weights, weight)
  const [pi, pt] = indexFraction(table.pressureAltitudes, pa)
  const [oi, ot] = indexFraction(table.oats, lookupOat)

  const get = (w: number, p: number, o: number) =>
    table.values[Math.min(w, table.weights.length - 1)]
      ?.[Math.min(p, table.pressureAltitudes.length - 1)]
      ?.[Math.min(o, table.oats.length - 1)] ?? 0

  const v000 = lerp(get(wi, pi, oi), get(wi, pi, oi + 1), ot)
  const v010 = lerp(get(wi, pi + 1, oi), get(wi, pi + 1, oi + 1), ot)
  const v100 = lerp(get(wi + 1, pi, oi), get(wi + 1, pi, oi + 1), ot)
  const v110 = lerp(get(wi + 1, pi + 1, oi), get(wi + 1, pi + 1, oi + 1), ot)

  const v00 = lerp(v000, v010, pt)
  const v10 = lerp(v100, v110, pt)

  let d = lerp(v00, v10, wt)

  if (table.weightCorrection === 'quadratic') {
    const div =
      table.weightCorrectionDivisor ?? table.referenceWeight ?? table.weights[0]
    d *= (weight / div) ** 2
  }

  return d
}

export function computePerf(
  table: PerformanceTable,
  cond: PerfConditions,
  regulatoryFactor = 1,
): number {
  // Select grass values if available, else use main values
  const effectiveTable =
    cond.surfaceGrass && table.grassValues
      ? { ...table, values: table.grassValues }
      : table

  let d = interpolatePerf(effectiveTable, cond.weight, cond.pa, cond.oat)

  // Grass fallback factor (only when no grassValues table)
  if (cond.surfaceGrass && !table.grassValues && table.grassFactor) {
    d *= table.grassFactor
  }

  // Wind
  if (table.windCorrections) {
    if (cond.windKt > 0) {
      d *= interpolateWindFactor(table.windCorrections, cond.windKt)
    }
    // tailwind: no correction when windCorrections present (table is headwind-only)
  } else {
    if (cond.windKt > 0) d *= 1 - (table.headwindFactor ?? 0.01) * cond.windKt
    if (cond.windKt < 0) d *= 1 + (table.tailwindFactor ?? 0.015) * Math.abs(cond.windKt)
  }

  d *= regulatoryFactor

  return Math.round(d)
}
