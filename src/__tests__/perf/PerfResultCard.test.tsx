import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerfResultCard } from '../../features/perf/PerfResultCard'
import type { AircraftSnapshot, PerfConditions } from '../../types'

function makeAircraft(overrides: Partial<AircraftSnapshot['performance']> = {}): AircraftSnapshot {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-01-01T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
    massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[400]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[350]]] },
      ...overrides,
    },
  }
}

function makeCond(overrides: Partial<PerfConditions> = {}): PerfConditions {
  return { weight: 750, pa: 0, oat: 15, surfaceGrass: false, windKt: 0, ...overrides }
}

describe('PerfResultCard', () => {
  it('shows the label', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('Décollage')).toBeInTheDocument()
  })

  it('computes and shows the base and regulatory distances', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableLabel="TODA" perfRegulatory={1.15} />)
    expect(screen.getByText('400 m')).toBeInTheDocument()
    expect(screen.getByText('460 m')).toBeInTheDocument()
  })

  it('shows a success badge when the available distance covers the regulatory distance', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableDistance={500} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('TODA OK')).toBeInTheDocument()
  })

  it('shows an error badge when the available distance is insufficient', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableDistance={300} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('TODA INSUFFISANT')).toBeInTheDocument()
  })

  it('shows an invalid-config badge and no distance when the table is malformed', () => {
    const aircraft = makeAircraft({ toTable: { weights: [], pressureAltitudes: [0], oats: [15], values: [] } })
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={aircraft} cond={makeCond()} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('Config invalide')).toBeInTheDocument()
    expect(screen.getByText(/Calcul indisponible/)).toBeInTheDocument()
  })

  it('uses the landing table when tableKey is ldg', () => {
    // perfRegulatory is 1.15 (not 1) so the base and regulatory distances render as different
    // text ("350 m" vs "403 m") — with a ×1 factor they'd collide and getByText would be ambiguous.
    render(<PerfResultCard label="Atterrissage" tableKey="ldg" aircraft={makeAircraft()} cond={makeCond()} availableLabel="LDA" perfRegulatory={1.15} />)
    expect(screen.getByText('350 m')).toBeInTheDocument()
  })
})
