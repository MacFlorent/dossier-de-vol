import { computeWB, totalFuelCapacity } from '../../lib/aviation/wbCalc'
import type { AircraftMassBalance } from '../../types'

const massBalance: AircraftMassBalance = {
  emptyWeight: 615,
  emptyArm: 345,
  stations: [
    { name: 'Pilote', arm: 375, kind: 'dry' as const, capacityL: 0 },
    { name: 'Passager', arm: 505, kind: 'dry' as const, capacityL: 0 },
    { name: 'Carburant', arm: 350, kind: 'fuel' as const, capacityL: 100 },
  ],
  envelopePoints: [
    [615, 295], [615, 430], [880, 430], [1000, 425], [1000, 360], [880, 295],
  ] as [number, number][],
}

describe('computeWB', () => {
  it('computes correct totals with no loading (empty aircraft)', () => {
    const result = computeWB(massBalance, {})
    expect(result.totalWeight).toBe(615)
    expect(result.totalMoment).toBe(615 * 345)
    expect(result.cg).toBe(345)
  })

  it('computes correct totals with nominal loading (pilot only)', () => {
    const result = computeWB(massBalance, { Pilote: 75 })
    const expectedWeight = 615 + 75
    const expectedMoment = 615 * 345 + 75 * 375
    expect(result.totalWeight).toBe(expectedWeight)
    expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
    expect(result.cg).toBeCloseTo(expectedMoment / expectedWeight, 1)
  })

  it('empty aircraft CG is within envelope', () => {
    const result = computeWB(massBalance, {})
    expect(result.inEnvelope).toBe(true)
  })

  it('nominal loading is within envelope', () => {
    const result = computeWB(massBalance, { Pilote: 75 })
    expect(result.inEnvelope).toBe(true)
  })

  it('accumulates multiple station weights', () => {
    // Carburant is fuel: 60 L × 0.72 kg/L = 43.2 kg
    const result = computeWB(massBalance, { Pilote: 75, Passager: 80, Carburant: 60 })
    const expectedWeight = 615 + 75 + 80 + 43.2
    const expectedMoment = 615 * 345 + 75 * 375 + 80 * 505 + 43.2 * 350
    expect(result.totalWeight).toBeCloseTo(expectedWeight, 1)
    expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
    expect(result.cg).toBeCloseTo(expectedMoment / expectedWeight, 1)
  })

  it('ignores unknown station names', () => {
    const result = computeWB(massBalance, { UnknownStation: 100 })
    // Unknown station is not in massBalance.stations so it gets no arm — totalWeight should still be correct
    // Actually computeWB only iterates massBalance.stations, so unknown keys are ignored
    expect(result.totalWeight).toBe(615)
  })

  it('fuel station: converts litres to kg using default density (0.72)', () => {
    // 50 L × 0.72 = 36 kg
    const result = computeWB(massBalance, { Carburant: 50 })
    const expectedWeight = 615 + 36
    const expectedMoment = 615 * 345 + 36 * 350
    expect(result.totalWeight).toBeCloseTo(expectedWeight, 1)
    expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
  })

  it('dry station: uses kg directly', () => {
    const result = computeWB(massBalance, { Pilote: 80 })
    expect(result.totalWeight).toBeCloseTo(615 + 80, 1)
  })

  it('custom fuelDensity is applied to fuel stations', () => {
    // density 0.80 kg/L: 50 L → 40 kg
    const result = computeWB(massBalance, { Carburant: 50 }, 0.80)
    expect(result.totalWeight).toBeCloseTo(615 + 40, 1)
  })
})

describe('totalFuelCapacity', () => {
  it('sums capacityL across all fuel stations', () => {
    const mb: AircraftMassBalance = {
      emptyWeight: 615, emptyArm: 345,
      stations: [
        { name: 'Pilote', arm: 375, kind: 'dry', capacityL: 0 },
        { name: 'Avant', arm: 100, kind: 'fuel', capacityL: 80 },
        { name: 'Arrière', arm: 1120, kind: 'fuel', capacityL: 110 },
      ],
      envelopePoints: [],
    }
    expect(totalFuelCapacity(mb)).toBe(190)
  })

  it('returns 0 when there are no fuel stations', () => {
    const mb: AircraftMassBalance = {
      emptyWeight: 615, emptyArm: 345,
      stations: [{ name: 'Pilote', arm: 375, kind: 'dry', capacityL: 0 }],
      envelopePoints: [],
    }
    expect(totalFuelCapacity(mb)).toBe(0)
  })
})
