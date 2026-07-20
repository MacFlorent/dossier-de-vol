import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangeAircraftModal } from '../../components/ui/ChangeAircraftModal'
import { saveAircraft } from '../../lib/storage'
import type { Aircraft } from '../../types'

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
    massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
    ...overrides,
  }
}

afterEach(() => localStorage.clear())

describe('ChangeAircraftModal', () => {
  it('lists fleet aircraft excluding the current one', () => {
    saveAircraft(makeAircraft({ id: 'ac-1', name: 'DR400' }))
    saveAircraft(makeAircraft({ id: 'ac-2', name: 'Cessna 172' }))
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Cessna 172')).toBeInTheDocument()
    expect(screen.queryByText('DR400')).not.toBeInTheDocument()
  })

  it('shows a message when the fleet has no other aircraft', () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Aucun autre avion dans la flotte.')).toBeInTheDocument()
  })

  it('shows TAS and autonomie for each candidate aircraft', () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    saveAircraft(makeAircraft({
      id: 'ac-2', name: 'Cessna 172', registration: 'F-GXYZ',
      characteristics: { regimes: [{ label: '75%', speed: 110, fuelBurn: 28 }] },
      massBalance: {
        emptyWeight: 620, emptyArm: 810,
        stations: [{ name: 'Carburant', arm: 810, kind: 'fuel', capacityL: 140 }],
        envelopePoints: [],
      },
    }))
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={vi.fn()} onClose={vi.fn()} />)
    // 140L / 28L/h = 5h -> formatDuration(300) = "5h00"
    expect(screen.getByText(/110 kt · 5h00 autonomie/)).toBeInTheDocument()
  })

  it('asks for confirmation before calling onConfirm', async () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    saveAircraft(makeAircraft({ id: 'ac-2', name: 'Cessna 172' }))
    const onConfirm = vi.fn()
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={onConfirm} onClose={vi.fn()} />)
    await userEvent.click(screen.getByText('Cessna 172'))
    expect(screen.getByText(/Changer l'avion pour/)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(onConfirm).toHaveBeenCalledWith('ac-2')
  })

  it('returns to the fleet list when Annuler is clicked, without confirming', async () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    saveAircraft(makeAircraft({ id: 'ac-2', name: 'Cessna 172' }))
    const onConfirm = vi.fn()
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={onConfirm} onClose={vi.fn()} />)
    await userEvent.click(screen.getByText('Cessna 172'))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByText(/Changer l'avion pour/)).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
