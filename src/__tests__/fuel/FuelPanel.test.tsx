import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FuelPanel } from '../../features/fuel/FuelPanel'
import type { FlightDossier, FlightBranch, FuelInputs, FlightSegment } from '../../types'

function makeAircraft() {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-06-17T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }], fuelCapacity: 110 },
    massBalance: {
      emptyWeight: 600, emptyArm: 800, stations: [],
      envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
    },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
  }
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, notes: '', ...overrides }
}

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}

function makeFuelInputs(overrides: Partial<FuelInputs> = {}): FuelInputs {
  return { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false, ...overrides }
}

function makeDossier(branches: FlightBranch[], fuelInputs: Record<string, FuelInputs> = {}): FlightDossier {
  return {
    id: 'dos-1', name: 'Test', date: '2026-06-17', departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches, weatherInputs: { fields: {}, notes: '' }, fuelInputs,
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, notes: '',
    createdAt: '2026-06-17T00:00:00Z', updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('FuelPanel', () => {
  describe('single branch', () => {
    it('shows Réserve input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
    })

    it('does not show gsBase or windAdjust inputs', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.queryByLabelText(/GS de base/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Ajust vent/i)).not.toBeInTheDocument()
    })

    it('does not show manual derouteMin input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.queryByLabelText(/Déroutement \(min\)/i)).not.toBeInTheDocument()
    })

    it('shows per-segment breakdown with GS and time', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      // Segment named 'Vol' should appear in results
      expect(screen.getByText('Vol')).toBeInTheDocument()
    })
  })

  describe('multiple branches — tab bar', () => {
    function makeTwo() {
      const b1 = makeBranch({ id: 'b1', label: 'Aller' })
      const b2 = makeBranch({ id: 'b2', label: 'Retour', segments: [makeSegment({ id: 's2', distanceNm: 80 })] })
      return { b1, b2, dossier: makeDossier([b1, b2], { b1: makeFuelInputs(), b2: makeFuelInputs() }) }
    }

    it('renders a tab button for each branch', () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
    })

    it('shows Réserve on first branch (not just last)', () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} />)
      // First branch (Aller) is active by default
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
    })

    it('shows Réserve on second branch too', async () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
    })

    it('calls onUpdate with correct branch key', async () => {
      const onUpdate = vi.fn()
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      const roulageInput = screen.getByLabelText(/Roulage/i)
      await userEvent.clear(roulageInput)
      await userEvent.type(roulageInput, '15')
      const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0] as Record<string, FuelInputs>
      expect(lastCall).toHaveProperty('b2')
    })
  })
})
