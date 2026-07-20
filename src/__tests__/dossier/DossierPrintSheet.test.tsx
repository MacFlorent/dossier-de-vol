import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DossierPrintSheet } from '../../features/dossier/DossierPrintSheet'
import type { FlightDossier } from '../../types'

function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Nav Test', date: '2026-07-19', departureTime: '09:00',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: {
        emptyWeight: 600, emptyArm: 800,
        stations: [{ name: 'Carburant', arm: 800, kind: 'fuel', capacityL: 120 }],
        envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
      },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [
      { id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null }], notes: '' },
    ],
    fuelInputs: {
      b1: { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' },
    },
    loading: { Carburant: 50 },
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('DossierPrintSheet', () => {
  it('renders the branches table', () => {
    render(<DossierPrintSheet dossier={makeDossier()} />)
    expect(screen.getByText('Branches de vol')).toBeInTheDocument()
    // "Aller" appears twice: once in the branches table, once in the per-branch fuel summary
    expect(screen.getAllByText('Aller').length).toBeGreaterThan(0)
  })

  it('renders the Masse & Centrage sheet', () => {
    render(<DossierPrintSheet dossier={makeDossier()} />)
    expect(screen.getByText('Masse & Centrage')).toBeInTheDocument()
    expect(screen.getByText('TOTAL départ')).toBeInTheDocument()
  })

  it('no longer renders action buttons or the summary cards (moved to AppChrome)', () => {
    render(<DossierPrintSheet dossier={makeDossier()} />)
    expect(screen.queryByRole('button', { name: 'Imprimer (A4)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Télécharger JSON' })).not.toBeInTheDocument()
    expect(screen.queryByText('Distance totale')).not.toBeInTheDocument()
  })
})
