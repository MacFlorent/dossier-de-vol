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
}

describe('interpolatePerf — existing corner/midpoint tests', () => {
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
    expect(interpolatePerf(table, 900, 0, 0)).toBe(230)
  })

  it('interpolates OAT midpoint: weight=800, pa=0, oat=10', () => {
    expect(interpolatePerf(table, 800, 0, 10)).toBe(210)
  })

  it('clamps weight below minimum', () => {
    expect(interpolatePerf(table, 600, 0, 0)).toBe(200)
  })

  it('clamps weight above maximum', () => {
    expect(interpolatePerf(table, 1200, 0, 0)).toBe(260)
  })
})

describe('interpolatePerf — oatAxis: isa_delta', () => {
  const isaTable: PerformanceTable = {
    weights: [800],
    pressureAltitudes: [0, 4000],
    oats: [-20, 0, 20],  // ISA deltas
    oatAxis: 'isa_delta',
    values: [
      [
        [150, 200, 260],  // pa=0
        [180, 240, 310],  // pa=4000
      ],
    ],
  }

  it('at PA=0, OAT=15°C (ISA), delta=0 → reads oats[1] (delta=0)', () => {
    // ISA at PA=0: 15 - 0 = 15°C; delta = 15 - 15 = 0
    expect(interpolatePerf(isaTable, 800, 0, 15)).toBe(200)
  })

  it('at PA=4000, OAT=7°C (ISA at 4000ft), delta=0 → reads oats[1]', () => {
    // ISA at 4000ft: 15 - 2*(4000/1000) = 7°C; delta = 7 - 7 = 0
    expect(interpolatePerf(isaTable, 800, 4000, 7)).toBe(240)
  })

  it('at PA=0, OAT=35°C, delta=+20 → reads oats[2] (delta=+20)', () => {
    // ISA at 0: 15; delta = 35 - 15 = 20
    expect(interpolatePerf(isaTable, 800, 0, 35)).toBe(260)
  })
})

describe('interpolatePerf — weightCorrection: quadratic', () => {
  const quadTable: PerformanceTable = {
    weights: [1000],
    pressureAltitudes: [0],
    oats: [15],
    weightCorrection: 'quadratic',
    referenceWeight: 1000,
    weightCorrectionDivisor: 1000,
    values: [[[200]]],
  }

  it('at referenceWeight, correction factor is (1000/1000)^2 = 1.0 → distance unchanged', () => {
    expect(interpolatePerf(quadTable, 1000, 0, 15)).toBeCloseTo(200, 0)
  })

  it('at half weight, correction factor is (500/1000)^2 = 0.25 → distance × 0.25', () => {
    expect(interpolatePerf(quadTable, 500, 0, 15)).toBeCloseTo(50, 0)
  })

  it('uses weightCorrectionDivisor when different from referenceWeight', () => {
    const t: PerformanceTable = {
      ...quadTable,
      referenceWeight: 840,
      weightCorrectionDivisor: 830,
      values: [[[440]]],
    }
    // (830/830)^2 = 1 → 440 unchanged
    expect(interpolatePerf(t, 830, 0, 15)).toBeCloseTo(440, 0)
    // (800/830)^2 ≈ 0.929 → 440 × 0.929 ≈ 409
    expect(interpolatePerf(t, 800, 0, 15)).toBeCloseTo(440 * (800 / 830) ** 2, 0)
  })
})

describe('computePerf — existing corrections', () => {
  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('returns base distance with no corrections', () => {
    expect(computePerf(table, baseCond)).toBe(200)
  })

  it('applies grassFactor when no grassValues', () => {
    // 200 * 1.20 = 240
    expect(computePerf(table, { ...baseCond, surfaceGrass: true })).toBe(240)
  })

  it('applies headwindFactor reduction', () => {
    // 200 * (1 - 0.025*10) = 200 * 0.75 = 150
    expect(computePerf(table, { ...baseCond, windKt: 10 })).toBe(150)
  })

  it('applies tailwindFactor increase', () => {
    // 200 * (1 + 0.02*10) = 200 * 1.20 = 240
    expect(computePerf(table, { ...baseCond, windKt: -10 })).toBe(240)
  })
})

describe('computePerf — grassValues', () => {
  const tableWithGrass: PerformanceTable = {
    ...table,
    grassValues: [
      [
        [280, 310],
        [330, 370],
      ],
      [
        [360, 400],
        [430, 480],
      ],
    ],
    grassFactor: 1.50,  // should be IGNORED when grassValues present
  }

  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('uses values (not grassValues) on hard surface', () => {
    expect(computePerf(tableWithGrass, baseCond)).toBe(200)
  })

  it('uses grassValues on grass surface, ignores grassFactor', () => {
    // grassValues[0][0][0] = 280 (not 200 × 1.50 = 300)
    expect(computePerf(tableWithGrass, { ...baseCond, surfaceGrass: true })).toBe(280)
  })
})

describe('computePerf — windCorrections', () => {
  const tableWind: PerformanceTable = {
    weights: [800],
    pressureAltitudes: [0],
    oats: [0],
    values: [[[200]]],
    windCorrections: [
      { speedKt: 0, factor: 1.0 },
      { speedKt: 10, factor: 0.75 },
      { speedKt: 20, factor: 0.50 },
    ],
    headwindFactor: 0.99,  // should be IGNORED when windCorrections present
    tailwindFactor: 0.99,  // should be IGNORED when windCorrections present
  }
  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('no wind → factor 1.0 → distance unchanged', () => {
    expect(computePerf(tableWind, baseCond)).toBe(200)
  })

  it('interpolates between 0 and 10 kt: windKt=5 → factor 0.875', () => {
    // lerp(1.0, 0.75, 0.5) = 0.875; 200 × 0.875 = 175
    expect(computePerf(tableWind, { ...baseCond, windKt: 5 })).toBe(175)
  })

  it('exact point: windKt=10 → factor 0.75 → 200 × 0.75 = 150', () => {
    expect(computePerf(tableWind, { ...baseCond, windKt: 10 })).toBe(150)
  })

  it('clamps at max point: windKt=30 → factor 0.50 → 200 × 0.50 = 100', () => {
    expect(computePerf(tableWind, { ...baseCond, windKt: 30 })).toBe(100)
  })

  it('tailwind with windCorrections: no correction applied', () => {
    // windKt < 0, windCorrections present → no correction → still 200
    expect(computePerf(tableWind, { ...baseCond, windKt: -10 })).toBe(200)
  })

  it('ignores headwindFactor when windCorrections present', () => {
    // Would be very wrong if headwindFactor 0.99 applied instead
    const result = computePerf(tableWind, { ...baseCond, windKt: 5 })
    expect(result).toBe(175)  // interpolated, not headwindFactor-based
  })
})

describe('computePerf — regulatoryFactor', () => {
  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('default regulatoryFactor=1 → distance unchanged', () => {
    expect(computePerf(table, baseCond)).toBe(200)
  })

  it('regulatoryFactor=1.15 → 200 × 1.15 = 230', () => {
    expect(computePerf(table, baseCond, 1.15)).toBe(230)
  })
})
