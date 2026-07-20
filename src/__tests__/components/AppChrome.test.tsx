import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppChrome } from '../../components/AppChrome'
import type { FlightDossier } from '../../types'

function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Nav Test', date: '2026-07-19', departureTime: '',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: {
        emptyWeight: 600, emptyArm: 800,
        stations: [{ name: 'Carburant', arm: 800, kind: 'fuel', capacityL: 120 }],
        envelopePoints: [],
      },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [
      { id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null }], notes: '' },
    ],
    fuelInputs: {},
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('AppChrome — date editing', () => {
  it('shows the dossier date as read-only text when onUpdateDate is not provided', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    expect(screen.getByText('2026-07-19')).toBeInTheDocument()
  })

  it('clicking the date switches to a native date input, Enter confirms', () => {
    const onUpdateDate = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onUpdateDate={onUpdateDate} />)
    fireEvent.click(screen.getByText('2026-07-19'))
    const input = screen.getByDisplayValue('2026-07-19')
    expect(input).toHaveAttribute('type', 'date')
    fireEvent.change(input, { target: { value: '2026-08-01' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdateDate).toHaveBeenCalledWith('2026-08-01')
  })

  it('blurring the date input confirms the edit', () => {
    const onUpdateDate = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onUpdateDate={onUpdateDate} />)
    fireEvent.click(screen.getByText('2026-07-19'))
    const input = screen.getByDisplayValue('2026-07-19')
    fireEvent.change(input, { target: { value: '2026-09-05' } })
    fireEvent.blur(input)
    expect(onUpdateDate).toHaveBeenCalledWith('2026-09-05')
  })

  it('pressing Escape cancels the date edit without calling onUpdateDate', () => {
    const onUpdateDate = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onUpdateDate={onUpdateDate} />)
    fireEvent.click(screen.getByText('2026-07-19'))
    const input = screen.getByDisplayValue('2026-07-19')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onUpdateDate).not.toHaveBeenCalled()
    expect(screen.getByText('2026-07-19')).toBeInTheDocument()
  })
})

describe('AppChrome — aircraft card', () => {
  it('shows aircraft name, registration, TAS and autonomie', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    expect(screen.getByText('DR400 · F-GABC')).toBeInTheDocument()
    // 120L / 30L/h = 4h -> formatDuration(240) = "4h00"
    expect(screen.getByText(/120 kt · 4h00 autonomie/)).toBeInTheDocument()
  })
})

describe('AppChrome — synthèse dossier', () => {
  it('shows branch count, total distance and raw flight time badges', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    // 1 branch, 120nm ENROUTE, 120nm/120kt*60 = 60min -> "1h00"
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('120 nm')).toBeInTheDocument()
    expect(screen.getByText('1h00')).toBeInTheDocument()
  })

  it('calls onDownload when the JSON button is clicked', () => {
    const onDownload = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onDownload={onDownload} />)
    fireEvent.click(screen.getByRole('button', { name: '↓ JSON' }))
    expect(onDownload).toHaveBeenCalled()
  })

  it('no longer shows a "Dossier" tab', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    expect(screen.queryByText('Dossier')).not.toBeInTheDocument()
    expect(screen.getByText('Vols')).toBeInTheDocument()
    expect(screen.getByText('Perf')).toBeInTheDocument()
  })
})
