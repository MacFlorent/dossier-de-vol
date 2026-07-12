import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FuelPanel } from '../../features/fuel/FuelPanel'
import type { FlightDossier, FlightBranch, FuelInputs, FlightSegment, Aircraft } from '../../types'
import { saveAircraft } from '../../lib/storage'

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

function makeOtherAircraft(): Aircraft {
  return {
    id: 'ac-2', name: 'Cessna 172', registration: 'F-GXYZ',
    characteristics: { regimes: [{ label: '75%', speed: 110, fuelBurn: 28 }], fuelCapacity: 100 },
    massBalance: { emptyWeight: 620, emptyArm: 810, stations: [], envelopePoints: [] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
  }
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, ...overrides }
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

  describe('Résumé — Autonomie requise (haut de page)', () => {
    it('shows total distance, raw flight time and real flight time', () => {
      const branch = makeBranch({
        segments: [makeSegment({ id: 's1', distanceNm: 60 }), makeSegment({ id: 's2', distanceNm: 60 })],
      })
      const dossier = makeDossier([branch], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByText('Distance totale')).toBeInTheDocument()
      expect(screen.getByText(/120\s*nm/)).toBeInTheDocument()
      expect(screen.getByText('Temps de vol brut')).toBeInTheDocument()
      expect(screen.getByText('Temps de vol réel')).toBeInTheDocument()
    })

    it('renders the autonomy summary card before the Appareil block', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      const { container } = render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      const headings = Array.from(container.querySelectorAll('h2')).map(h => h.textContent)
      expect(headings.indexOf('Autonomie requise')).toBeGreaterThanOrEqual(0)
      expect(headings.indexOf('Autonomie requise')).toBeLessThan(headings.indexOf('Appareil'))
      expect(headings.filter(h => h === 'Autonomie requise')).toHaveLength(1)
    })
  })

  describe('Bloc 1 — Appareil', () => {
    afterEach(() => localStorage.clear())

    it('shows Facteur pilote input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Facteur pilote/i)).toBeInTheDocument()
    })

    it('shows the aircraft name', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByText('DR400')).toBeInTheDocument()
    })

    it('does not show a "Changer" button when onChangeAircraft is not provided', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Changer' })).not.toBeInTheDocument()
    })

    it('opens the change-aircraft modal listing the fleet when "Changer" is clicked', async () => {
      saveAircraft(makeOtherAircraft())
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} onChangeAircraft={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Changer' }))
      expect(screen.getByText("Changer d'avion")).toBeInTheDocument()
      expect(screen.getByText('Cessna 172')).toBeInTheDocument()
    })

    it('calls onChangeAircraft with the selected aircraft id after confirmation', async () => {
      saveAircraft(makeOtherAircraft())
      const onChangeAircraft = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} onChangeAircraft={onChangeAircraft} />)
      await userEvent.click(screen.getByRole('button', { name: 'Changer' }))
      await userEvent.click(screen.getByText('Cessna 172'))
      await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
      expect(onChangeAircraft).toHaveBeenCalledWith('ac-2')
    })
  })

  describe('Bloc 2 — Segments', () => {
    it('shows segment name as an editable input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByDisplayValue('Vol')).toBeInTheDocument()
    })

    it('shows distance and heading as editable inputs', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Dist \(nm\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Cap°M/i)).toBeInTheDocument()
    })

    it('calls onUpdateBranches when the segment name is edited', async () => {
      const onUpdateBranches = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={onUpdateBranches} />)
      const nameInput = screen.getByDisplayValue('Vol')
      await userEvent.type(nameInput, 'X')
      expect(onUpdateBranches).toHaveBeenCalled()
    })

    it('adds a segment when "+ Segment" is clicked', async () => {
      const onUpdateBranches = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={onUpdateBranches} />)
      await userEvent.click(screen.getByText('+ Segment'))
      const updated = onUpdateBranches.mock.calls[0][0] as FlightBranch[]
      expect(updated[0].segments).toHaveLength(2)
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
