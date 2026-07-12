import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WBPanel } from '../../features/wb/WBPanel'
import type { FlightDossier } from '../../types'

function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Test', date: '2026-01-01', departureTime: '09:00',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-01-01T00:00:00Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: {
        emptyWeight: 600, emptyArm: 800,
        stations: [
          { name: 'Pilote', arm: 700, kind: 'dry', capacityL: 0 },
          { name: 'Carburant', arm: 850, kind: 'fuel', capacityL: 100 },
        ],
        envelopePoints: [[600, 700], [900, 700], [900, 900], [600, 900]],
      },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [], fuelInputs: {},
    loading: { Pilote: 80, Carburant: 50 },
    perfRegulatory: 1, perfInputs: {}, notes: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('WBPanel — layout', () => {
  it('does not constrain the page width (homogenized with Carbu/Vols)', () => {
    const { container } = render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(container.querySelector('.max-w-4xl')).not.toBeInTheDocument()
  })

  it('uses the flex-column/scrollable-body shell shared with FuelPanel and BranchesPanel', () => {
    const { container } = render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(container.querySelector('.flex.flex-col.h-full')).toBeInTheDocument()
    expect(container.querySelector('.flex-1.overflow-auto')).toBeInTheDocument()
  })

  it('still shows the aircraft loading table and results', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Chargement')).toBeInTheDocument()
    expect(screen.getByText(/Résultats M&C/)).toBeInTheDocument()
  })
})
