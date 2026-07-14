import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeEditForm } from '../../features/aerodromes/AerodromeEditForm'
import type { StoredAerodrome } from '../../types'

function makeAerodrome(overrides: Partial<StoredAerodrome> = {}): StoredAerodrome {
  return { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '', ...overrides }
}

describe('AerodromeEditForm', () => {
  it('renders the aerodrome fields with their current values', () => {
    render(<AerodromeEditForm draft={makeAerodrome()} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Toussus')).toBeInTheDocument()
    expect(screen.getByDisplayValue('538')).toBeInTheDocument()
  })

  it('calls onChange with the updated name', async () => {
    const onChange = vi.fn()
    render(<AerodromeEditForm draft={makeAerodrome()} onChange={onChange} />)
    await userEvent.type(screen.getByDisplayValue('Toussus'), 'x')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Toussusx' }))
  })

  it('adds a runway via the RunwayEditor and calls onChange', async () => {
    const onChange = vi.fn()
    render(<AerodromeEditForm draft={makeAerodrome()} onChange={onChange} />)
    await userEvent.click(screen.getByText('+ Piste'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      runways: [{ ident: '', headingMag: 0, lengthFt: 0, surface: 'hard' }],
    }))
  })
})
