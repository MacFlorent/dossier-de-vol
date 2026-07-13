import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AircraftEditorScreen } from '../../screens/AircraftEditorScreen'
import { listAircraft } from '../../lib/storage'

afterEach(() => localStorage.clear())

describe('AircraftEditorScreen — per-station fuel capacity', () => {
  it('does not render a global "Capacité carburant" field anymore', () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByLabelText(/Capacité carburant/i)).not.toBeInTheDocument()
  })

  it('shows a capacity input only for fuel-kind stations', async () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('+ Ajouter station'))
    await userEvent.type(screen.getByPlaceholderText('Pilote'), 'Avant')

    expect(screen.queryByLabelText('Avant (L)')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox'), 'fuel')

    expect(screen.getByLabelText('Avant (L)')).toBeInTheDocument()
  })

  it('defaults a new fuel station capacity to 0', async () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('+ Ajouter station'))
    await userEvent.type(screen.getByPlaceholderText('Pilote'), 'Avant')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'fuel')

    expect(screen.getByLabelText('Avant (L)')).toHaveValue(0)
  })

  it('saves the edited capacityL when loading from the DR221 template', async () => {
    const onSave = vi.fn()
    render(<AircraftEditorScreen editingAircraftId={null} onSave={onSave} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('Depuis modèle : DR221'))

    const capacityInput = screen.getByLabelText('Carburant (L)')
    await userEvent.clear(capacityInput)
    await userEvent.type(capacityInput, '95')

    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }))

    const saved = listAircraft().find(a => a.name === 'DR221')!
    const fuelStation = saved.massBalance.stations.find(s => s.kind === 'fuel')!
    expect(fuelStation.capacityL).toBe(95)
    expect((saved.characteristics as { fuelCapacity?: number }).fuelCapacity).toBeUndefined()
  })

  it('gives each fuel station a distinct label when the aircraft has more than one tank', async () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('Depuis modèle : DR48'))

    expect(screen.getByLabelText('Essence Avant (80L max) (L)')).toBeInTheDocument()
    expect(screen.getByLabelText('Essence Arrière (110L max) (L)')).toBeInTheDocument()
  })
})
