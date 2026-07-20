import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DossierScreen } from '../../screens/DossierScreen'
import type { FlightDossier } from '../../types'

function makeDossier(): FlightDossier {
  return {
    id: 'd-1', name: 'Nav Test', date: '2026-07-19', departureTime: '09:00',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [
      { id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null }], notes: '' },
    ],
    fuelInputs: { b1: { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' } },
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

describe('DossierScreen', () => {
  it('always mounts the print sheet, regardless of the active tab', () => {
    render(<DossierScreen dossier={makeDossier()} activeTab="fuel" onUpdate={vi.fn()} />)
    expect(screen.getByText('Masse & Centrage')).toBeInTheDocument()
  })

  it('mounts the print sheet inside a .print-only wrapper', () => {
    const { container } = render(<DossierScreen dossier={makeDossier()} activeTab="branches" onUpdate={vi.fn()} />)
    const printOnly = container.querySelector('.print-only')
    expect(printOnly).not.toBeNull()
    expect(printOnly?.textContent).toContain('Masse & Centrage')
  })
})
