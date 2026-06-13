import { interpolatePerf, computePerf } from '../../lib/aviation/perfCalc'
import type { PerformanceTable, PerfConditions } from '../../types'

const table: PerformanceTable = {
  weights: [800, 1000],
  pressureAltitudes: [0, 2000],
  oats: [0, 20],
  values: [
    // weight=800
    [
      [200, 220],  // pa=0:    [oat=0, oat=20]
      [240, 270],  // pa=2000: [oat=0, oat=20]
    ],
    // weight=1000
    [
      [260, 290],  // pa=0:    [oat=0, oat=20]
      [310, 350],  // pa=2000: [oat=0, oat=20]
    ],
  ],
  grassFactor: 1.20,
  headwindFactor: 0.025,
  tailwindFactor: 0.02,
  slopeFactor: 0.07,
}

describe('interpolatePerf', () => {
  it('returns exact corner value: weight=800, pa=0, oat=0', () => {
    expect(interpolatePerf(table, 800, 0, 0)).toBe(200)
  })

  it('returns exact corner value: weight=1000, pa=0, oat=0', () => {
    expect(interpolatePerf(table, 1000, 0, 0)).toBe(260)
  })

  it('returns exact corner value: weight=800, pa=0, oat=20', () => {
    expect(interpolatePerf(table, 800, 0, 20)).toBe(220)
  })

  it('returns exact corner value: weight=800, pa=2000, oat=0', () => {
    expect(interpolatePerf(table, 800, 2000, 0)).toBe(240)
  })

  it('interpolates weight midpoint: weight=900, pa=0, oat=0', () => {
    // midpoint between 200 (w=800) and 260 (w=1000) = 230
    expect(interpolatePerf(table, 900, 0, 0)).toBe(230)
  })

  it('interpolates OAT midpoint: weight=800, pa=0, oat=10', () => {
    // midpoint between 200 (oat=0) and 220 (oat=20) = 210
    expect(interpolatePerf(table, 800, 0, 10)).toBe(210)
  })

  it('clamps weight below minimum', () => {
    expect(interpolatePerf(table, 600, 0, 0)).toBe(200)
  })

  it('clamps weight above maximum', () => {
    expect(interpolatePerf(table, 1200, 0, 0)).toBe(260)
  })
})

describe('computePerf', () => {
  const baseCond: PerfConditions = {
    weight: 800,
    pa: 0,
    oat: 0,
    surfaceGrass: false,
    windKt: 0,
    slopePercent: 0,
  }

  it('returns base distance with no corrections', () => {
    expect(computePerf(table, baseCond)).toBe(200)
  })

  it('applies grass factor', () => {
    // 200 * 1.20 = 240
    expect(computePerf(table, { ...baseCond, surfaceGrass: true })).toBe(240)
  })

  it('applies headwind reduction', () => {
    // 200 * (1 - 0.025*10) = 200 * 0.75 = 150
    expect(computePerf(table, { ...baseCond, windKt: 10 })).toBe(150)
  })

  it('applies tailwind increase', () => {
    // 200 * (1 + 0.02*10) = 200 * 1.20 = 240
    expect(computePerf(table, { ...baseCond, windKt: -10 })).toBe(240)
  })

  it('applies upslope increase', () => {
    // 200 * (1 + 0.07*2) = 200 * 1.14 = 228
    expect(computePerf(table, { ...baseCond, slopePercent: 2 })).toBe(228)
  })

  it('does not apply slope factor for zero slope', () => {
    expect(computePerf(table, { ...baseCond, slopePercent: 0 })).toBe(200)
  })
})
