import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FuelPanel } from '../../features/fuel/FuelPanel'
import type { FlightDossier, FlightBranch, FuelInputs } from '../../types'

function makeAircraft() {
  return {
    id: 'ac-1',
    name: 'DR400',
    registration: 'F-GABC',
    snapshotAt: '2026-06-17T00:00:00Z',
    characteristics: {
      regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }],
      fuelCapacity: 110,
    },
    massBalance: {
      emptyWeight: 600,
      emptyArm: 800,
      stations: [],
      envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
    },
    performance: {
      toTable: {
        weights: [750],
        pressureAltitudes: [0],
        oats: [15],
        values: [[[300]]],
      },
      ldgTable: {
        weights: [750],
        pressureAltitudes: [0],
        oats: [15],
        values: [[[300]]],
      },
    },
  }
}

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return {
    id: 'b1',
    label: 'Aller',
    points: [],
    distanceNm: 100,
    notes: '',
    ...overrides,
  }
}

function makeFuelInputs(overrides: Partial<FuelInputs> = {}): FuelInputs {
  return {
    gsBase: 120,
    windAdjust: 0,
    roulage: 10,
    marge: 10,
    extras: [],
    reserveMin: 30,
    derouteMin: 30,
    plein: false,
    ...overrides,
  }
}

function makeDossier(
  branches: FlightBranch[],
  fuelInputs: Record<string, FuelInputs> = {}
): FlightDossier {
  return {
    id: 'dos-1',
    name: 'Test',
    date: '2026-06-17',
    departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches,
    weatherInputs: { fields: {}, winds: [], notes: '' },
    fuelInputs,
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    notes: '',
    createdAt: '2026-06-17T00:00:00Z',
    updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('FuelPanel', () => {
  describe('single branch — no tabs', () => {
    it('does not render a tab bar when there is only one branch', () => {
      const branch = makeBranch({ id: 'b1', label: 'Aller' })
      const dossier = makeDossier([branch], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      // Only one branch: no tab buttons
      expect(screen.queryByRole('button', { name: 'Aller' })).not.toBeInTheDocument()
    })

    it('shows reserve and déroutement fields on the single (last) branch', () => {
      const branch = makeBranch({ id: 'b1', label: 'Aller' })
      const dossier = makeDossier([branch], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Déroutement/i)).toBeInTheDocument()
    })
  })

  describe('multiple branches — tab bar', () => {
    function makeTwo() {
      const b1 = makeBranch({ id: 'b1', label: 'Aller' })
      const b2 = makeBranch({ id: 'b2', label: 'Retour', distanceNm: 80 })
      const dossier = makeDossier(
        [b1, b2],
        { b1: makeFuelInputs(), b2: makeFuelInputs({ gsBase: 110 }) }
      )
      return { b1, b2, dossier }
    }

    it('renders a tab button for each branch', () => {
      const { dossier } = makeTwo()
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
    })

    it('first branch is active by default', () => {
      const { dossier } = makeTwo()
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      // The heading should show the first branch label
      expect(screen.getByText(/Paramètres — Aller/)).toBeInTheDocument()
    })

    it('switches to second branch when its tab is clicked', async () => {
      const { dossier } = makeTwo()
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      expect(screen.getByText(/Paramètres — Retour/)).toBeInTheDocument()
    })

    it('reserves are NOT shown on the first (non-last) branch', () => {
      const { dossier } = makeTwo()
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      // Default is first branch (b1), which is NOT last
      expect(screen.queryByLabelText(/Réserve/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Déroutement/i)).not.toBeInTheDocument()
    })

    it('reserves ARE shown when the last branch tab is active', async () => {
      const { dossier } = makeTwo()
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Déroutement/i)).toBeInTheDocument()
    })

    it('shows "Total toutes branches" summary when there are multiple branches', () => {
      const { dossier } = makeTwo()
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Total toutes branches/i)).toBeInTheDocument()
    })

    it('calls onUpdate with the right branch key when inputs change', async () => {
      const { dossier } = makeTwo()
      const onUpdate = vi.fn()
      render(<FuelPanel dossier={dossier} onUpdate={onUpdate} />)

      // Switch to second branch (Retour = b2)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))

      // Change roulage for b2
      const roulageInput = screen.getByLabelText(/Roulage/i)
      await userEvent.clear(roulageInput)
      await userEvent.type(roulageInput, '15')

      expect(onUpdate).toHaveBeenCalled()
      const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0] as Record<string, FuelInputs>
      // b2 key must be present and updated
      expect(lastCall).toHaveProperty('b2')
    })
  })
})
