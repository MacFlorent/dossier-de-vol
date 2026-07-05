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
  return {
    pilotFactor: 0, taxiMin: 10, landingMin: 15,
    alternateLandingMin: 15, extras: [], reserveMode: 'day',
    ...overrides,
  }
}

function makeDossier(branches: FlightBranch[], fuelInputs: Record<string, FuelInputs> = {}): FlightDossier {
  return {
    id: 'dos-1', name: 'Test', date: '2026-06-17', departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches, fuelInputs,
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, notes: '',
    createdAt: '2026-06-17T00:00:00Z', updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('FuelPanel', () => {
  describe('flight tab bar', () => {
    it('is visible even with a single branch', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
    })
  })

  describe('Bloc 1 — Appareil', () => {
    it('shows Facteur pilote input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Facteur pilote/i)).toBeInTheDocument()
    })
  })

  describe('Bloc 2 — Segments', () => {
    it('shows segment name', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByText('Vol')).toBeInTheDocument()
    })

    it('shows wind direction and speed inputs', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getAllByLabelText(/Vent °M/i)[0]).toBeInTheDocument()
      expect(screen.getAllByLabelText(/Force kt/i)[0]).toBeInTheDocument()
    })

    it('calls onUpdateBranches when wind direction changes', async () => {
      const onUpdateBranches = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={onUpdateBranches} />)
      const windInput = screen.getAllByLabelText(/Vent °M/i)[0]
      await userEvent.clear(windInput)
      await userEvent.type(windInput, '2')
      expect(onUpdateBranches).toHaveBeenCalled()
    })
  })

  describe('Bloc 3 — Temps complémentaires', () => {
    it('shows Roulage déc. and Intégration att. inputs', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Roulage déc\./i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Intégration att\./i)).toBeInTheDocument()
    })
  })

  describe('Bloc 4 — Déroutement planifié', () => {
    it('Intégration alt. is hidden when no ALTERNATE segment', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.queryByLabelText(/Intégration alt\./i)).not.toBeInTheDocument()
    })

    it('shows Intégration alt. when ALTERNATE segment exists', () => {
      const branch = makeBranch({
        segments: [makeSegment(), makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 20 })],
      })
      const dossier = makeDossier([branch], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Intégration alt\./i)).toBeInTheDocument()
    })
  })

  describe('Bloc 5 — Réserve réglementaire', () => {
    it('shows Jour and Nuit toggle buttons', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByRole('button', { name: /Jour/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Nuit/i })).toBeInTheDocument()
    })

    it('clicking Nuit calls onUpdate with reserveMode: night', async () => {
      const onUpdate = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={onUpdate} onUpdateBranches={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /Nuit/i }))
      const last = onUpdate.mock.calls.at(-1)![0] as Record<string, FuelInputs>
      expect(last['b1'].reserveMode).toBe('night')
    })
  })

  describe('multi-branch tab bar', () => {
    function makeTwo() {
      const b1 = makeBranch({ id: 'b1', label: 'Aller' })
      const b2 = makeBranch({ id: 'b2', label: 'Retour', segments: [makeSegment({ id: 's2', distanceNm: 80 })] })
      return { dossier: makeDossier([b1, b2], { b1: makeFuelInputs(), b2: makeFuelInputs() }) }
    }

    it('renders a tab button for each branch', () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
    })

    it('calls onUpdate with the active branch key when taxiMin changes', async () => {
      const onUpdate = vi.fn()
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={onUpdate} onUpdateBranches={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      const taxiInput = screen.getByLabelText(/Roulage déc\./i)
      await userEvent.clear(taxiInput)
      await userEvent.type(taxiInput, '15')
      const last = onUpdate.mock.calls.at(-1)![0] as Record<string, FuelInputs>
      expect(last).toHaveProperty('b2')
    })
  })
})
