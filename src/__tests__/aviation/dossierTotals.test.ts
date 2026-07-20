import { describe, it, expect } from 'vitest'
import { computeDossierTotals } from '../../lib/aviation/dossierTotals'
import type { FlightDossier, FlightBranch, FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, ...overrides }
}

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}

function makeDossier(branches: FlightBranch[]): FlightDossier {
  return {
    id: 'd-1', name: 'Test', date: '2026-07-19', departureTime: '',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches,
    fuelInputs: {},
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

describe('computeDossierTotals', () => {
  it('counts branches', () => {
    const dossier = makeDossier([makeBranch({ id: 'b1' }), makeBranch({ id: 'b2' })])
    expect(computeDossierTotals(dossier).branchCount).toBe(2)
  })

  it('sums ENROUTE distance across all branches', () => {
    const b1 = makeBranch({ id: 'b1', segments: [makeSegment({ distanceNm: 60 })] })
    const b2 = makeBranch({ id: 'b2', segments: [makeSegment({ distanceNm: 40 })] })
    const dossier = makeDossier([b1, b2])
    expect(computeDossierTotals(dossier).totalDistanceNm).toBe(100)
  })

  it('excludes ALTERNATE segments from distance', () => {
    const b1 = makeBranch({
      id: 'b1',
      segments: [makeSegment({ distanceNm: 60 }), makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })],
    })
    const dossier = makeDossier([b1])
    expect(computeDossierTotals(dossier).totalDistanceNm).toBe(60)
  })

  it('sums raw flight time across all branches using regimes[0].speed, no wind', () => {
    // 120nm / 120kt * 60 = 60 min per branch, two branches
    const dossier = makeDossier([makeBranch({ id: 'b1' }), makeBranch({ id: 'b2' })])
    expect(computeDossierTotals(dossier).totalRawTimeMin).toBeCloseTo(120, 1)
  })

  it('accounts for wind in raw flight time', () => {
    // cap 270, vent du 270 a 20kt -> GS = 100; 120nm/100kt*60 = 72min
    const b1 = makeBranch({ segments: [makeSegment({ wind: { directionDeg: 270, speedKt: 20 } })] })
    const dossier = makeDossier([b1])
    expect(computeDossierTotals(dossier).totalRawTimeMin).toBeCloseTo(72, 1)
  })

  it('returns zeros for a dossier with no branches', () => {
    const dossier = makeDossier([])
    expect(computeDossierTotals(dossier)).toEqual({ branchCount: 0, totalDistanceNm: 0, totalRawTimeMin: 0 })
  })
})
