import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FlightDossier, FlightBranch, FlightAerodrome, FlightSegment } from '../../types'

const mockDb = [
  { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [
    { ident: '07', headingMag: 70, lengthFt: 3000, surface: 'hard' as const, toda: 900, lda: 850 },
  ], updatedAt: '' },
  { icao: 'LFPO', name: 'Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
  { icao: 'LFOB', name: 'Beauvais', lat: 49.45, lng: 2.11, elevationFt: 350, runways: [], updatedAt: '' },
]
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
  getAerodrome: (icao: string) => mockDb.find(a => a.icao === icao),
  upsertAerodrome: vi.fn(),
}))

import { PerfPanel } from '../../features/perf/PerfPanel'

function makeAircraft() {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-01-01T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
    massBalance: {
      emptyWeight: 600, emptyArm: 800,
      stations: [{ name: 'Carburant', arm: 800, kind: 'fuel' as const, capacityL: 110 }],
      envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
    },
    performance: {
      toTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[400]]] },
      ldgTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[350]]] },
    },
  }
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, ...overrides }
}
function makeAerodrome(identifier: string, role: FlightAerodrome['role']): FlightAerodrome {
  return { id: identifier + role, identifier, role }
}
function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}
function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Test', date: '2026-01-01', departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches: [makeBranch()], fuelInputs: {},
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, perfExtraAerodromes: [], notes: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('PerfPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not constrain the page width (homogenized with Carbu/Vols/M&C)', () => {
    const { container } = render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(container.querySelector('.max-w-4xl')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no aerodromes at all', () => {
    render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText(/Ajoutez des aérodromes/i)).toBeInTheDocument()
  })

  it('renders one tab per unique aerodrome across branches, excluding OVERFLY', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP'), makeAerodrome('LFPO', 'ARR'), makeAerodrome('LFOB', 'OVERFLY')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByRole('button', { name: /LFPN/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /LFPO/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /LFOB/ })).not.toBeInTheDocument()
  })

  it('never renders two tabs for the same aerodrome, even across roles/branches', () => {
    const branches = [
      makeBranch({ id: 'b1', aerodromes: [makeAerodrome('LFPN', 'DEP'), makeAerodrome('LFPO', 'ARR')] }),
      makeBranch({ id: 'b2', aerodromes: [makeAerodrome('LFPO', 'DEP'), makeAerodrome('LFPN', 'ARR')] }),
    ]
    render(<PerfPanel dossier={makeDossier({ branches })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /^LFPN/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^LFPO/ })).toHaveLength(1)
  })

  it('orders tabs DEP before ALTERNATE before ARR', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPO', 'ARR'), makeAerodrome('LFOB', 'ALTERNATE'), makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    const labels = screen.getAllByRole('button', { name: /^LF/ }).map(b => b.textContent)
    expect(labels.findIndex(l => l?.includes('LFPN'))).toBeLessThan(labels.findIndex(l => l?.includes('LFOB')))
    expect(labels.findIndex(l => l?.includes('LFOB'))).toBeLessThan(labels.findIndex(l => l?.includes('LFPO')))
  })

  it('shows role badges on automatic tabs', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText('DEP')).toBeInTheDocument()
  })

  it('does not show a close button on automatic (DEP/ARR/DVRT) tabs', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.queryByLabelText(/fermer/i)).not.toBeInTheDocument()
  })

  it('shows both Décollage and Atterrissage blocks for the active tab', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText('Décollage')).toBeInTheDocument()
    expect(screen.getByText('Atterrissage')).toBeInTheDocument()
  })

  it('adding an extra aerodrome via the + button calls onUpdateExtraAerodromes', async () => {
    const onUpdateExtraAerodromes = vi.fn()
    render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={onUpdateExtraAerodromes} />)
    await userEvent.click(screen.getByText('+'))
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
    await userEvent.click(screen.getByText('LFPN'))
    expect(onUpdateExtraAerodromes).toHaveBeenCalledWith(['LFPN'])
  })

  it('shows a close button on a manually-added extra aerodrome tab and removes it on click', async () => {
    const onUpdateExtraAerodromes = vi.fn()
    render(<PerfPanel dossier={makeDossier({ perfExtraAerodromes: ['LFPN'] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={onUpdateExtraAerodromes} />)
    await userEvent.click(screen.getByLabelText(/fermer/i))
    expect(onUpdateExtraAerodromes).toHaveBeenCalledWith([])
  })

  it('changing the regulatory margin calls onUpdateRegulatory with the new value', () => {
    const onUpdateRegulatory = vi.fn()
    render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={onUpdateRegulatory} onUpdateExtraAerodromes={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '1.15' } })
    expect(onUpdateRegulatory).toHaveBeenCalledWith(1.15)
  })
})
