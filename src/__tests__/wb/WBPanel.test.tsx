import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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

describe('WBPanel — three W&B points', () => {
  it('renders Sans carburant, Actuel and Plein carburant rows in the results table', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    expect(within(table).getByText('Sans carburant')).toBeInTheDocument()
    expect(within(table).getByText('Actuel')).toBeInTheDocument()
    expect(within(table).getByText('Plein carburant')).toBeInTheDocument()
  })

  it('computes the zero-fuel point by zeroing fuel stations while keeping dry load', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    // 600 (empty) + 80 (Pilote) + 0 fuel = 680
    expect(within(table).getByText('680.0 kg')).toBeInTheDocument()
  })

  it('computes the current point from the entered loading, as before', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    // 600 + 80 + 50L*0.72 = 716
    expect(within(table).getByText('716.0 kg')).toBeInTheDocument()
  })

  it('computes the full-fuel point using each fuel station capacityL', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    // 600 + 80 + 100L*0.72 = 752
    expect(within(table).getByText('752.0 kg')).toBeInTheDocument()
  })

  it('shows an informational note and coincident points when there are no fuel stations', () => {
    const dossier = makeDossier()
    dossier.aircraft.massBalance.stations = dossier.aircraft.massBalance.stations.filter(s => s.kind !== 'fuel')
    render(<WBPanel dossier={dossier} onUpdate={vi.fn()} />)
    expect(screen.getByText('Aucune station carburant — le centrage ne varie pas avec le carburant')).toBeInTheDocument()
  })

  it('bounds each fuel station input by its own capacityL, not a shared figure', () => {
    const dossier = makeDossier()
    dossier.aircraft.massBalance.stations = [
      { name: 'Pilote', arm: 700, kind: 'dry', capacityL: 0 },
      { name: 'Avant', arm: 100, kind: 'fuel', capacityL: 80 },
      { name: 'Arrière', arm: 1120, kind: 'fuel', capacityL: 110 },
    ]
    render(<WBPanel dossier={dossier} onUpdate={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Avant (L)' })).toHaveAttribute('max', '80')
    expect(screen.getByRole('spinbutton', { name: 'Arrière (L)' })).toHaveAttribute('max', '110')
  })

  it('clamps a fuel value exceeding the station capacityL to that capacityL', () => {
    const onUpdate = vi.fn()
    render(<WBPanel dossier={makeDossier()} onUpdate={onUpdate} />)
    const input = screen.getByRole('spinbutton', { name: 'Carburant (L)' })
    fireEvent.change(input, { target: { value: '150' } })
    const last = onUpdate.mock.calls.at(-1)![0] as Record<string, number>
    expect(last['Carburant']).toBe(100)
  })
})

describe('WBPanel — envelope graph', () => {
  it('renders axis titles', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Masse (kg)')).toBeInTheDocument()
    expect(screen.getByText('CG (mm)')).toBeInTheDocument()
  })

  it('draws exactly three point markers and a dashed trajectory line', () => {
    const { container } = render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const svg = container.querySelector('svg[aria-label="Enveloppe de centrage"]')!
    expect(svg.querySelectorAll('circle')).toHaveLength(3)
    expect(svg.querySelector('line[stroke-dasharray]')).toBeInTheDocument()
  })

  it('shows a legend naming the three points', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const legend = screen.getByTestId('wb-graph-legend')
    expect(within(legend).getByText('Sans carburant')).toBeInTheDocument()
    expect(within(legend).getByText('Actuel')).toBeInTheDocument()
    expect(within(legend).getByText('Plein carburant')).toBeInTheDocument()
  })
})
