import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUpsert = vi.fn()
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodrome: (icao: string) =>
    icao === 'LFPN' ? { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' } : undefined,
  upsertAerodrome: (a: unknown) => mockUpsert(a),
}))

import { AerodromeQuickEditModal } from '../../features/perf/AerodromeQuickEditModal'

describe('AerodromeQuickEditModal', () => {
  beforeEach(() => mockUpsert.mockClear())

  it('shows the aerodrome name pre-filled from the referential', () => {
    render(<AerodromeQuickEditModal icao="LFPN" onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('Toussus')).toBeInTheDocument()
  })

  it('starts with a blank draft when the ICAO is not in the referential', () => {
    render(<AerodromeQuickEditModal icao="LFXX" onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('')).toBeInTheDocument()
  })

  it('calls upsertAerodrome and onClose when saving', async () => {
    const onClose = vi.fn()
    render(<AerodromeQuickEditModal icao="LFPN" onClose={onClose} />)
    await userEvent.click(screen.getByText('Enregistrer'))
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ icao: 'LFPN', name: 'Toussus' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose without saving when cancelling', async () => {
    const onClose = vi.fn()
    render(<AerodromeQuickEditModal icao="LFPN" onClose={onClose} />)
    await userEvent.click(screen.getByText('Annuler'))
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
