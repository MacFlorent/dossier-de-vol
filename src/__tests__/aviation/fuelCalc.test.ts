import { describe, it, expect } from 'vitest'
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
import type { FlightBranch, FuelInputs, CruiseRegime, FlightSegment } from '../../types'

const regime: CruiseRegime = { label: '75%', speed: 120, fuelBurn: 30 }

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return {
    id: 's1', role: 'ENROUTE', name: 'Vol',
    distanceNm: 120, headingMag: 270, wind: null,
    ...overrides,
  }
}

function makeBranch(segments: FlightSegment[]): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments, notes: '' }
}

const baseFi: FuelInputs = {
  pilotFactor: 0, taxiMin: 10, landingMin: 15,
  alternateLandingMin: 15, extras: [], reserveMode: 'day',
}

describe('computeBranchFuel', () => {
  it('rawFlightTimeMin = distanceNm / TAS * 60 with no wind', () => {
    // 120nm / 120kt * 60 = 60 min
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.rawFlightTimeMin).toBeCloseTo(60, 1)
  })

  it('headwind reduces GS and increases rawFlightTimeMin', () => {
    // cap 270, vent du 270 à 20kt → GS = 100
    // 120nm / 100kt * 60 = 72 min
    const seg = makeSegment({ wind: { directionDeg: 270, speedKt: 20 } })
    const result = computeBranchFuel(makeBranch([seg]), baseFi, regime)
    expect(result.rawFlightTimeMin).toBeCloseTo(72, 1)
    expect(result.segmentDetails[0].gs).toBeCloseTo(100, 1)
  })

  it('null wind segment uses TAS as GS with zero WCA', () => {
    const result = computeBranchFuel(makeBranch([makeSegment({ wind: null })]), baseFi, regime)
    expect(result.segmentDetails[0].gs).toBe(120)
    expect(result.segmentDetails[0].wca).toBe(0)
  })

  it('sums multiple ENROUTE segments for rawFlightTimeMin', () => {
    // 60nm + 60nm = 30min + 30min = 60min
    const s1 = makeSegment({ id: 's1', distanceNm: 60 })
    const s2 = makeSegment({ id: 's2', distanceNm: 60 })
    const result = computeBranchFuel(makeBranch([s1, s2]), baseFi, regime)
    expect(result.rawFlightTimeMin).toBeCloseTo(60, 1)
  })

  it('totalFlightTimeMin = (rawFlight + taxi + landing) * factor + extras (pilotFactor=0, no extras)', () => {
    // (60 + 10 + 15) * 1.0 + 0 = 85
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.totalFlightTimeMin).toBeCloseTo(85, 1)
  })

  it('pilotFactor applies to (rawFlight + taxi + landing) only, not extras', () => {
    const fi: FuelInputs = {
      ...baseFi,
      pilotFactor: 10,
      extras: [{ id: 'e1', label: 'VEA', durationMin: 20 }],
    }
    // (60 + 10 + 15) * 1.10 + 20 = 85 * 1.10 + 20 = 93.5 + 20 = 113.5
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    expect(result.totalFlightTimeMin).toBeCloseTo(113.5, 1)
  })

  it('extrasMin = sum of extra durations', () => {
    const fi: FuelInputs = {
      ...baseFi,
      extras: [
        { id: 'e1', label: 'VEA', durationMin: 20 },
        { id: 'e2', label: 'Attente', durationMin: 15 },
      ],
    }
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    expect(result.extrasMin).toBe(35)
  })

  it('flightFuelL = totalFlightTimeMin / 60 * fuelBurn', () => {
    // (60+10+15)*1 + 0 = 85; 85/60*30 = 42.5
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.flightFuelL).toBeCloseTo(42.5, 1)
  })

  it('ALTERNATE segment becomes alternateTimeMin (excluded from rawFlightTimeMin)', () => {
    // ENROUTE: 120nm/120kt = 60min; ALTERNATE: 30nm/120kt = 15min
    const alt = makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })
    const result = computeBranchFuel(makeBranch([makeSegment(), alt]), baseFi, regime)
    expect(result.rawFlightTimeMin).toBeCloseTo(60, 1)
    expect(result.alternateTimeMin).toBeCloseTo(15, 1)
  })

  it('totalAlternateTimeMin = (alternateTimeMin + alternateLandingMin) * factor', () => {
    // (15 + 15) * 1.0 = 30
    const alt = makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })
    const result = computeBranchFuel(makeBranch([makeSegment(), alt]), baseFi, regime)
    expect(result.totalAlternateTimeMin).toBeCloseTo(30, 1)
  })

  it('alternateFuelL = totalAlternateTimeMin / 60 * fuelBurn', () => {
    // 30/60 * 30 = 15
    const alt = makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })
    const result = computeBranchFuel(makeBranch([makeSegment(), alt]), baseFi, regime)
    expect(result.alternateFuelL).toBeCloseTo(15, 1)
  })

  it('no ALTERNATE segment: alternateTimeMin, totalAlternateTimeMin and alternateFuelL are all 0', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.alternateTimeMin).toBe(0)
    expect(result.totalAlternateTimeMin).toBe(0)
    expect(result.alternateFuelL).toBe(0)
  })

  it('reserveMin = 30 for day mode', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.reserveMin).toBe(30)
  })

  it('reserveMin = 45 for night mode', () => {
    const fi: FuelInputs = { ...baseFi, reserveMode: 'night' }
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    expect(result.reserveMin).toBe(45)
  })

  it('requiredEnduranceMin = totalFlightTimeMin + totalAlternateTimeMin + reserveMin', () => {
    // 85 + 0 + 30 = 115
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.requiredEnduranceMin).toBeCloseTo(115, 1)
  })

  it('requiredFuelL = requiredEnduranceMin / 60 * fuelBurn', () => {
    // 115 / 60 * 30 ≈ 57.5
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.requiredFuelL).toBeCloseTo(57.5, 1)
  })

  it('requiredFuelKg = requiredFuelL * 0.72', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.requiredFuelKg).toBeCloseTo(result.requiredFuelL * 0.72, 3)
  })
})
