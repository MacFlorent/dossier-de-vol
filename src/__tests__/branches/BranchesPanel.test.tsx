import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock react-leaflet and leaflet (DOM rendering not available in jsdom)
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('leaflet', () => {
  const Icon = class {
    constructor() {}
    static Default = {
      prototype: { _getIconUrl: undefined },
      mergeOptions: vi.fn(),
    }
  }
  return {
    default: { Icon, icon: vi.fn() },
    Icon,
  }
})

vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: '' }))

// Mock aerodromeDb
const mockDb = [
  { icao: 'LFPN', name: 'Toussus-le-Noble', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
]

vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
  getAerodrome: (icao: string) => mockDb.find(a => a.icao === icao),
}))

import { BranchesPanel } from '../../features/branches/BranchesPanel'
import type { FlightBranch } from '../../types'

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return {
    id: 'branch-1',
    label: 'Aller',
    points: [],
    distanceNm: 0,
    notes: '',
    ...overrides,
  }
}

describe('BranchesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders a branch tab with the branch label', () => {
      const branch = makeBranch({ label: 'Aller' })
      render(<BranchesPanel branches={[branch]} onUpdate={vi.fn()} />)
      expect(screen.getByText('Aller')).toBeInTheDocument()
    })

    it('renders multiple branch tabs', () => {
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller' }),
        makeBranch({ id: 'b2', label: 'Retour' }),
      ]
      render(<BranchesPanel branches={branches} onUpdate={vi.fn()} />)
      expect(screen.getByText('Aller')).toBeInTheDocument()
      expect(screen.getByText('Retour')).toBeInTheDocument()
    })

    it('renders the map container', () => {
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={vi.fn()} />)
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })

    it('renders empty points message when branch has no points', () => {
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Aucun point/i)).toBeInTheDocument()
    })

    it('renders a point when branch has a point', () => {
      const branch = makeBranch({
        points: [{
          id: 'pt-1',
          type: 'AERODROME',
          identifier: 'LFPN',
          role: 'DEP',
        }],
      })
      render(<BranchesPanel branches={[branch]} onUpdate={vi.fn()} />)
      expect(screen.getByText('LFPN')).toBeInTheDocument()
      expect(screen.getByText('Toussus-le-Noble')).toBeInTheDocument()
    })

    it('shows "non résolu" for an unknown aerodrome identifier', () => {
      const branch = makeBranch({
        points: [{
          id: 'pt-1',
          type: 'AERODROME',
          identifier: 'ZZZZ',
          role: 'OVERFLY',
        }],
      })
      render(<BranchesPanel branches={[branch]} onUpdate={vi.fn()} />)
      expect(screen.getByText(/non résolu/i)).toBeInTheDocument()
    })

    it('does not show delete branch button when there is only one branch', () => {
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={vi.fn()} />)
      expect(screen.queryByText(/Supprimer branche/i)).not.toBeInTheDocument()
    })

    it('shows delete branch button when there are multiple branches', () => {
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller' }),
        makeBranch({ id: 'b2', label: 'Retour' }),
      ]
      render(<BranchesPanel branches={branches} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Supprimer branche/i)).toBeInTheDocument()
    })
  })

  describe('adding a branch', () => {
    it('calls onUpdate with a new branch when + is clicked', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch()
      render(<BranchesPanel branches={[branch]} onUpdate={onUpdate} />)

      const addBtn = screen.getByText('+')
      await userEvent.click(addBtn)

      expect(onUpdate).toHaveBeenCalledOnce()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches).toHaveLength(2)
      expect(updatedBranches[1].label).toMatch(/Étape/)
    })
  })

  describe('deleting a branch', () => {
    it('calls onUpdate removing the branch when Supprimer is clicked', async () => {
      const onUpdate = vi.fn()
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller' }),
        makeBranch({ id: 'b2', label: 'Retour' }),
      ]
      render(<BranchesPanel branches={branches} onUpdate={onUpdate} />)

      const deleteBtn = screen.getByText(/Supprimer branche/i)
      await userEvent.click(deleteBtn)

      expect(onUpdate).toHaveBeenCalledOnce()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches).toHaveLength(1)
    })
  })

  describe('switching branch tabs', () => {
    it('switches active branch when a tab is clicked', async () => {
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller', points: [] }),
        makeBranch({ id: 'b2', label: 'Retour', points: [
          { id: 'pt-1', type: 'AERODROME', identifier: 'LFPO', role: 'ARR' }
        ]}),
      ]
      render(<BranchesPanel branches={branches} onUpdate={vi.fn()} />)

      // Clicking "Retour" tab should show its content
      await userEvent.click(screen.getByText('Retour'))
      expect(screen.getByText('LFPO')).toBeInTheDocument()
    })
  })

  describe('updating distance', () => {
    it('calls onUpdate with updated distanceNm when distance is changed', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({ distanceNm: 0 })
      render(<BranchesPanel branches={[branch]} onUpdate={onUpdate} />)

      const distanceInput = screen.getByPlaceholderText('0')
      fireEvent.change(distanceInput, { target: { value: '120' } })

      expect(onUpdate).toHaveBeenCalled()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches[0].distanceNm).toBe(120)
    })
  })

  describe('updating notes', () => {
    it('calls onUpdate with updated notes when notes textarea is changed', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({ notes: '' })
      render(<BranchesPanel branches={[branch]} onUpdate={onUpdate} />)

      const notesTextarea = screen.getByPlaceholderText(/Commentaires libres/i)
      fireEvent.change(notesTextarea, { target: { value: 'Test note' } })

      expect(onUpdate).toHaveBeenCalled()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches[0].notes).toBe('Test note')
    })
  })

  describe('AddPointModal', () => {
    it('opens AddPointModal when "+ Ajouter" is clicked', async () => {
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      expect(screen.getByText(/Ajouter un point/i)).toBeInTheDocument()
    })

    it('closes the modal when clicking outside', async () => {
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      expect(screen.getByText(/Ajouter un point/i)).toBeInTheDocument()

      // Click on backdrop
      const backdrop = screen.getByText(/Ajouter un point/i).closest('[class*="fixed"]')!
      fireEvent.click(backdrop)
      expect(screen.queryByText(/Ajouter un point/i)).not.toBeInTheDocument()
    })

    it('shows aerodrome suggestions when typing ICAO prefix', async () => {
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      const input = screen.getByPlaceholderText(/ICAO ou nom/i)
      await userEvent.type(input, 'LFP')

      expect(screen.getByText('LFPN')).toBeInTheDocument()
    })

    it('adds a point when aerodrome is selected from suggestions', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      const input = screen.getByPlaceholderText(/ICAO ou nom/i)
      await userEvent.type(input, 'LFP')
      await userEvent.click(screen.getByText('LFPN'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points).toHaveLength(1)
      expect(updated[0].points[0].identifier).toBe('LFPN')
    })

    it('adds an unresolved point when using free identifier mode', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      await userEvent.click(screen.getByText(/Ajouter sans résolution/i))

      const input = screen.getByPlaceholderText(/Identifiant/i)
      await userEvent.type(input, 'VOR42')
      await userEvent.click(screen.getByText('Ajouter'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].identifier).toBe('VOR42')
    })
  })

  describe('point reordering', () => {
    const twoPointBranch = makeBranch({
      points: [
        { id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' },
        { id: 'pt-2', type: 'AERODROME', identifier: 'LFPO', role: 'ARR' },
      ],
    })

    it('moves a point down when ↓ is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[twoPointBranch]} onUpdate={onUpdate} />)

      const downButtons = screen.getAllByText('↓')
      await userEvent.click(downButtons[0]) // Move first point down

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].identifier).toBe('LFPO')
      expect(updated[0].points[1].identifier).toBe('LFPN')
    })

    it('moves a point up when ↑ is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[twoPointBranch]} onUpdate={onUpdate} />)

      const upButtons = screen.getAllByText('↑')
      await userEvent.click(upButtons[1]) // Move second point up

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].identifier).toBe('LFPO')
      expect(updated[0].points[1].identifier).toBe('LFPN')
    })

    it('first point ↑ button is disabled', () => {
      render(<BranchesPanel branches={[twoPointBranch]} onUpdate={vi.fn()} />)
      const upButtons = screen.getAllByText('↑')
      expect(upButtons[0]).toBeDisabled()
    })

    it('last point ↓ button is disabled', () => {
      render(<BranchesPanel branches={[twoPointBranch]} onUpdate={vi.fn()} />)
      const downButtons = screen.getAllByText('↓')
      expect(downButtons[downButtons.length - 1]).toBeDisabled()
    })
  })

  describe('point removal', () => {
    it('removes a point when ✕ is clicked', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      })
      render(<BranchesPanel branches={[branch]} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('✕'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points).toHaveLength(0)
    })
  })

  describe('label editing', () => {
    it('shows an input when double-clicking a tab label', async () => {
      const branch = makeBranch({ label: 'Aller' })
      render(<BranchesPanel branches={[branch]} onUpdate={vi.fn()} />)

      await userEvent.dblClick(screen.getByText('Aller'))
      expect(screen.getByDisplayValue('Aller')).toBeInTheDocument()
    })

    it('calls onUpdate with the new label on blur', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({ label: 'Aller' })
      render(<BranchesPanel branches={[branch]} onUpdate={onUpdate} />)

      await userEvent.dblClick(screen.getByText('Aller'))
      const input = screen.getByDisplayValue('Aller')
      await userEvent.clear(input)
      await userEvent.type(input, 'Retour')
      fireEvent.blur(input)

      expect(onUpdate).toHaveBeenCalled()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].label).toBe('Retour')
    })
  })
})
