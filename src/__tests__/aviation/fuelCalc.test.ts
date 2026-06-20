import { describe, it, expect } from 'vitest'
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
import type { FlightBranch, FuelInputs, CruiseRegime, FlightSegment } from '../../types'

const regime: CruiseRegime = { label: '75%', speed: 120, fuelBurn: 30 }

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return {
    id: 's1', role: 'ENROUTE', name: 'Vol',
    distanceNm: 120, headingMag: 270, wind: null, notes: '',
    ...overrides,
  }
}

function makeBranch(segments: FlightSegment[]): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments, notes: '' }
}

const baseFi: FuelInputs = { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false }

describe('computeBranchFuel', () => {
  it('single ENROUTE segment no wind: flightTimeMin = distanceNm/TAS*60', () => {
    // 120nm / 120kt * 60 = 60 min
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.flightTimeMin).toBeCloseTo(60, 1)
  })

  it('headwind reduces GS and increases flight time', () => {
    // cap 270, vent du 270 à 20kt → GS=100
    // 120nm / 100kt * 60 = 72 min
    const seg = makeSegment({ wind: { directionDeg: 270, speedKt: 20 } })
    const result = computeBranchFuel(makeBranch([seg]), baseFi, regime)
    expect(result.flightTimeMin).toBeCloseTo(72, 1)
    expect(result.segmentDetails[0].gs).toBeCloseTo(100, 1)
  })

  it('null wind segment uses TAS as GS', () => {
    const result = computeBranchFuel(makeBranch([makeSegment({ wind: null })]), baseFi, regime)
    expect(result.segmentDetails[0].gs).toBe(120)
    expect(result.segmentDetails[0].wca).toBe(0)
  })

  it('ALTERNATE segment time becomes derouteMin', () => {
    // ALTERNATE: 30nm / 120kt * 60 = 15 min
    const alt = makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })
    const result = computeBranchFuel(makeBranch([makeSegment(), alt]), baseFi, regime)
    expect(result.derouteMin).toBeCloseTo(15, 1)
    expect(result.flightTimeMin).toBeCloseTo(60, 1) // ALTERNATE exclu
  })

  it('no ALTERNATE segment: derouteMin = 0', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.derouteMin).toBe(0)
  })

  it('sums multiple ENROUTE segments', () => {
    const s1 = makeSegment({ id: 's1', distanceNm: 60 })  // 30 min
    const s2 = makeSegment({ id: 's2', distanceNm: 60 })  // 30 min
    const result = computeBranchFuel(makeBranch([s1, s2]), baseFi, regime)
    expect(result.flightTimeMin).toBeCloseTo(60, 1)
  })

  it('totalTime includes roulage + reserveMin + derouteMin', () => {
    // flightTime=60, roulage=10, extras=0, reserve=30, deroute=0
    // total = 60+10+0+30+0 = 100
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.totalTime).toBeCloseTo(100, 1)
  })

  it('totalWithMargin applies marge%', () => {
    // totalTime=100, marge=10% → 110
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.totalWithMargin).toBeCloseTo(110, 1)
  })

  it('fuelL = (totalWithMargin/60) * fuelBurn', () => {
    // 110/60 * 30 = 55
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.fuelL).toBeCloseTo(55, 1)
  })

  it('fuelKg = fuelL * 0.72', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.fuelKg).toBeCloseTo(result.fuelL * 0.72, 3)
  })

  it('extras are included in totalTime', () => {
    const fi = { ...baseFi, extras: [{ id: 'e1', label: 'Évol', durationMin: 20 }] }
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    // 60+10+20+30 = 120 → *1.1 = 132
    expect(result.totalWithMargin).toBeCloseTo(132, 1)
  })

  it('reserveMin applies on every branch', () => {
    const fi = { ...baseFi, reserveMin: 45 }
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    expect(result.totalTime).toBeCloseTo(60 + 10 + 45, 1)
  })
})
