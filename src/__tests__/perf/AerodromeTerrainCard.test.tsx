import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeTerrainCard } from '../../features/perf/AerodromeTerrainCard'
import type { RunwayInfo, TerrainPerfInputs } from '../../types'

const runways: RunwayInfo[] = [
  { ident: '09', headingMag: 90, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
  { ident: '27', headingMag: 270, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
]

function makeInputs(overrides: Partial<TerrainPerfInputs> = {}): TerrainPerfInputs {
  return { surface: 'hard', windKt: 0, ...overrides }
}

const baseProps = { title: 'LFPN — Toussus-le-Noble', elevation: 538 }

describe('AerodromeTerrainCard', () => {
  it('shows the given title', () => {
    render(<AerodromeTerrainCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={vi.fn()} />)
    expect(screen.getByText('LFPN — Toussus-le-Noble')).toBeInTheDocument()
  })

  it('shows headwind and crosswind components on each runway button once wind is set', () => {
    render(
      <AerodromeTerrainCard {...baseProps} runways={runways}
        inputs={makeInputs({ windDirDeg: 270, windSpeedKt: 20 })}
        onUpdate={vi.fn()} onEditReferential={vi.fn()} />
    )
    expect(screen.getByText(/27.*270°.*\+20kt face.*0kt trav\./)).toBeInTheDocument()
  })

  it('clicking a runway button selects it manually', async () => {
    const onUpdate = vi.fn()
    render(<AerodromeTerrainCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={onUpdate} onEditReferential={vi.fn()} />)
    await userEvent.click(screen.getByText(/^09/))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ selectedRunway: '09', surface: 'hard', toda: 900, lda: 850 }))
  })

  it('calls onEditReferential when the edit icon is clicked', async () => {
    const onEditReferential = vi.fn()
    render(<AerodromeTerrainCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={onEditReferential} />)
    await userEvent.click(screen.getByLabelText(/éditer référentiel/i))
    expect(onEditReferential).toHaveBeenCalledOnce()
  })
})
