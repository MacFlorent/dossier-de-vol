import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeWeatherCard } from '../../features/perf/AerodromeWeatherCard'
import type { RunwayInfo, TerrainPerfInputs } from '../../types'

const runways: RunwayInfo[] = [
  { ident: '09', headingMag: 90, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
  { ident: '27', headingMag: 270, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
]

function makeInputs(overrides: Partial<TerrainPerfInputs> = {}): TerrainPerfInputs {
  return { surface: 'hard', windKt: 0, ...overrides }
}

const baseProps = { qnh: 1013, temp: 15, pa: 538, da: 600 }

describe('AerodromeWeatherCard', () => {
  it('has "Conditions" as its title', () => {
    render(<AerodromeWeatherCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Conditions')).toBeInTheDocument()
  })

  it('shows the pressure and density altitude passed in', () => {
    render(<AerodromeWeatherCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} />)
    expect(screen.getByText('538 ft')).toBeInTheDocument()
    expect(screen.getByText('600 ft')).toBeInTheDocument()
  })

  it('auto-selects the best-headwind runway once both direction and speed are known', () => {
    // windDirDeg is pre-seeded via props (as it would be after the direction field's own onChange
    // already round-tripped through the parent) — only windSpeedKt changes here, so a single
    // fireEvent.change carries the complete numeric value without relying on keystroke accumulation
    // against a static, non-re-rendering `inputs` prop.
    const onUpdate = vi.fn()
    render(
      <AerodromeWeatherCard {...baseProps} runways={runways}
        inputs={makeInputs({ windDirDeg: 270 })}
        onUpdate={onUpdate} />
    )
    fireEvent.change(screen.getByLabelText(/vent vitesse/i), { target: { value: '20' } })
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ selectedRunway: '27', windKt: 20, surface: 'hard', toda: 900, lda: 850 }))
  })

  it('does not re-select a runway once one was chosen manually, even if wind changes', async () => {
    const onUpdate = vi.fn()
    render(
      <AerodromeWeatherCard {...baseProps} runways={runways}
        inputs={makeInputs({ selectedRunway: '09', windDirDeg: 270, windSpeedKt: 20 })}
        onUpdate={onUpdate} />
    )
    await userEvent.clear(screen.getByLabelText(/vent vitesse/i))
    await userEvent.type(screen.getByLabelText(/vent vitesse/i), '5')
    for (const call of onUpdate.mock.calls) {
      expect(call[0].selectedRunway).toBeUndefined()
    }
  })

  it('shows a manual wind-component fallback input when the aerodrome has no runways', () => {
    render(<AerodromeWeatherCard {...baseProps} runways={[]} inputs={makeInputs()} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText(/vent \(kt\) — manuel/i)).toBeInTheDocument()
  })
})
