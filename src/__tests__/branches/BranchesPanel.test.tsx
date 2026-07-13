import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null, Polyline: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('leaflet', () => {
  const Icon = class { constructor() {}; static Default = { prototype: { _getIconUrl: undefined }, mergeOptions: vi.fn() } }
  return { default: { Icon, icon: vi.fn() }, Icon }
})
vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: '' }))

const mockDb = [
  { icao: 'LFPN', name: 'Toussus-le-Noble', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
]
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
  getAerodrome: (icao: string) => mockDb.find(a => a.icao === icao),
}))

import { BranchesPanel } from '../../features/branches/BranchesPanel'
import type { AircraftSnapshot, FlightBranch, FlightSegment, FlightAerodrome } from '../../types'

const aircraftStub: AircraftSnapshot = {
  id: 'ac-1', name: 'DR221', registration: 'F-BPCT', snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }] },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, ...overrides }
}
function makeAerodrome(identifier: string, role: FlightAerodrome['role'] = 'DEP'): FlightAerodrome {
  return { id: identifier, identifier, role }
}
function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'branch-1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}

describe('BranchesPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('rendering', () => {
    it('renders a branch tab with the branch label', () => {
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('Aller')).toBeInTheDocument()
    })

    it('renders the map', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })

    it('shows empty-state when branch has no aerodromes', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Aucun aérodrome/i)).toBeInTheDocument()
    })

    it('renders an aerodrome when branch has one', () => {
      const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('LFPN')).toBeInTheDocument()
    })

    it('shows the segment name', () => {
      const branch = makeBranch({ segments: [makeSegment({ name: 'Toussus-Granville' })] })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue('Toussus-Granville')).toBeInTheDocument()
    })

    it('does not show Supprimer vol when there is only one branch', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.queryByText(/Supprimer vol/i)).not.toBeInTheDocument()
    })

    it('shows Supprimer vol with multiple branches', () => {
      const branches = [makeBranch({ id: 'b1' }), makeBranch({ id: 'b2', label: 'Retour' })]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Supprimer vol/i)).toBeInTheDocument()
    })
  })

  describe('distance totale', () => {
    it('shows sum of segment distances', () => {
      const segments = [
        makeSegment({ id: 's1', distanceNm: 60 }),
        makeSegment({ id: 's2', distanceNm: 48 }),
      ]
      render(<BranchesPanel branches={[makeBranch({ segments })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('108')).toBeInTheDocument()
    })
  })

  describe('adding a branch', () => {
    it('calls onUpdate with a new branch containing a default ENROUTE segment', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText('+'))
      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated).toHaveLength(2)
      expect(updated[1].segments).toHaveLength(1)
      expect(updated[1].segments[0].role).toBe('ENROUTE')
    })
  })

  describe('deleting a branch', () => {
    it('removes a branch when Supprimer vol is clicked', async () => {
      const onUpdate = vi.fn()
      const branches = [makeBranch({ id: 'b1' }), makeBranch({ id: 'b2', label: 'Retour' })]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText(/Supprimer vol/i))
      expect(onUpdate.mock.calls[0][0]).toHaveLength(1)
    })
  })

  describe('segment management', () => {
    it('adds a segment when "+ Segment" is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText(/\+ Segment/i))
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments).toHaveLength(2)
    })

    it('cannot remove the last ENROUTE segment', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      // Delete button for the only segment should be disabled or absent
      const deleteButtons = screen.queryAllByRole('button', { name: /supprimer segment/i })
      if (deleteButtons.length > 0) {
        expect(deleteButtons[0]).toBeDisabled()
      } else {
        expect(deleteButtons).toHaveLength(0)
      }
    })

    it('can remove a segment when there are multiple ENROUTE segments', async () => {
      const onUpdate = vi.fn()
      const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
      render(<BranchesPanel branches={[makeBranch({ segments })]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      const deleteButtons = screen.getAllByRole('button', { name: /supprimer segment/i })
      await userEvent.click(deleteButtons[0])
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments).toHaveLength(1)
    })
  })

  describe('ALTERNATE segment auto-management', () => {
    it('auto-creates ALTERNATE segment when ALTERNATE aerodrome is added', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText(/\+ Aérodrome/i))
      // Select ALTERNATE role then add LFOB
      await userEvent.click(screen.getByText('ALT'))
      await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
      await userEvent.click(screen.getByText('LFPN'))
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments.some(s => s.role === 'ALTERNATE')).toBe(true)
    })

    it('auto-removes ALTERNATE segment when last ALTERNATE aerodrome is removed', async () => {
      const onUpdate = vi.fn()
      const altAero = makeAerodrome('LFOB', 'ALTERNATE')
      const altSeg = makeSegment({ id: 'alt', role: 'ALTERNATE', name: 'Déroutement' })
      const branch = makeBranch({ aerodromes: [altAero], segments: [makeSegment(), altSeg] })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      // Click the ✕ on the ALTERNATE aerodrome
      const deleteButtons = screen.getAllByRole('button', { name: /supprimer aérodrome/i })
      await userEvent.click(deleteButtons[0])
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments.every(s => s.role !== 'ALTERNATE')).toBe(true)
    })
  })

  describe('label editing', () => {
    it('shows input on double-click', async () => {
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      await userEvent.dblClick(screen.getByText('Aller'))
      expect(screen.getByDisplayValue('Aller')).toBeInTheDocument()
    })

    it('calls onUpdate with new label on blur', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.dblClick(screen.getByText('Aller'))
      const input = screen.getByDisplayValue('Aller')
      await userEvent.clear(input)
      await userEvent.type(input, 'Retour')
      fireEvent.blur(input)
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].label).toBe('Retour')
    })
  })

  describe('branch notes', () => {
    it('calls onUpdate with updated notes', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ notes: '' })]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      fireEvent.change(screen.getByPlaceholderText(/Commentaires libres/i), { target: { value: 'Test note' } })
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].notes).toBe('Test note')
    })
  })
})
