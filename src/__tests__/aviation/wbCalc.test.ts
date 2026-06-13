import { computeWB } from '../../lib/aviation/wbCalc'
import type { Aircraft } from '../../types'

const dr221: Aircraft = {
  id: 'test',
  name: 'DR221',
  registration: 'F-TEST',
  ias: 100,
  tas: 106,
  fuelBurn: 20,
  fuelCapacity: 116,
  fuelDensity: 0.72,
  taxiFuel: 2,
  emptyWeight: 615,
  emptyArm: 345,
  maxWeight: 1000,
  stations: [
    { name: 'Pilote', arm: 375, maxWeight: 120 },
    { name: 'Passager', arm: 505, maxWeight: 100 },
    { name: 'Carburant', arm: 350, maxWeight: 84 },
  ],
  envelopePoints: [
    [615, 295], [615, 430], [880, 430], [1000, 425], [1000, 360], [880, 295],
  ] as [number, number][],
  toTable: { weights: [1000], pressureAltitudes: [0], oats: [15], values: [[[290]]] },
  ldgTable: { weights: [1000], pressureAltitudes: [0], oats: [15], values: [[[480]]] },
  factors: { regulatory: 1.15, grass: 1.20, headwindPerKt: 0.025, tailwindPerKt: 0.02 },
  magneticVariation: 0,
}

describe('computeWB', () => {
  it('computes correct totals with no loading (empty aircraft)', () => {
    const result = computeWB(dr221, {})
    expect(result.totalWeight).toBe(615)
    expect(result.totalMoment).toBe(615 * 345)
    expect(result.cg).toBe(345)
  })

  it('computes correct totals with nominal loading (pilot only)', () => {
    const result = computeWB(dr221, { Pilote: 75 })
    const expectedWeight = 615 + 75
    const expectedMoment = 615 * 345 + 75 * 375
    expect(result.totalWeight).toBe(expectedWeight)
    expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
    expect(result.cg).toBeCloseTo(expectedMoment / expectedWeight, 1)
  })

  it('empty aircraft CG is within envelope', () => {
    const result = computeWB(dr221, {})
    expect(result.inEnvelope).toBe(true)
  })

  it('nominal loading is within envelope', () => {
    const result = computeWB(dr221, { Pilote: 75 })
    expect(result.inEnvelope).toBe(true)
  })

  it('accumulates multiple station weights', () => {
    const result = computeWB(dr221, { Pilote: 75, Passager: 80, Carburant: 60 })
    const expectedWeight = 615 + 75 + 80 + 60
    const expectedMoment = 615 * 345 + 75 * 375 + 80 * 505 + 60 * 350
    expect(result.totalWeight).toBe(expectedWeight)
    expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
    expect(result.cg).toBeCloseTo(expectedMoment / expectedWeight, 1)
  })

  it('ignores unknown station names', () => {
    const result = computeWB(dr221, { UnknownStation: 100 })
    // Unknown station is not in aircraft.stations so it gets no arm — totalWeight should still be correct
    // Actually computeWB only iterates aircraft.stations, so unknown keys are ignored
    expect(result.totalWeight).toBe(615)
  })
})
