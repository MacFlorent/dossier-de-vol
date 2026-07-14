import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockDb = [
  { icao: 'LFPN', name: 'Toussus-le-Noble', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
]
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
}))

import { AddPerfAerodromeModal } from '../../features/perf/AddPerfAerodromeModal'

describe('AddPerfAerodromeModal', () => {
  it('shows no suggestions before typing', () => {
    render(<AddPerfAerodromeModal excluded={[]} onAdd={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText('LFPN')).not.toBeInTheDocument()
  })

  it('filters suggestions by ICAO prefix', async () => {
    render(<AddPerfAerodromeModal excluded={[]} onAdd={vi.fn()} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
    expect(screen.getByText('LFPN')).toBeInTheDocument()
    expect(screen.queryByText('LFPO')).not.toBeInTheDocument()
  })

  it('excludes aerodromes already tabbed', async () => {
    render(<AddPerfAerodromeModal excluded={['LFPN']} onAdd={vi.fn()} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LF')
    expect(screen.queryByText('LFPN')).not.toBeInTheDocument()
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })

  it('calls onAdd with the chosen ICAO', async () => {
    const onAdd = vi.fn()
    render(<AddPerfAerodromeModal excluded={[]} onAdd={onAdd} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
    await userEvent.click(screen.getByText('LFPN'))
    expect(onAdd).toHaveBeenCalledWith('LFPN')
  })

  it('calls onClose when clicking the backdrop', async () => {
    const onClose = vi.fn()
    const { container } = render(<AddPerfAerodromeModal excluded={[]} onAdd={vi.fn()} onClose={onClose} />)
    await userEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
