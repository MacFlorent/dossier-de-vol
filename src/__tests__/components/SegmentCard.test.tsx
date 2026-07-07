import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentCard } from '../../components/ui/SegmentCard'
import type { FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, notes: '', ...overrides }
}

describe('SegmentCard', () => {
  it('renders the segment name as an editable input', () => {
    render(<SegmentCard segment={makeSegment({ name: 'Toussus-Granville' })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Toussus-Granville')).toBeInTheDocument()
  })

  it('renders distance, heading and wind inputs', () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/Dist \(nm\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cap°M/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Vent °M/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Force kt/i)).toBeInTheDocument()
  })

  it('does not render a notes field', () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/Notes/i)).not.toBeInTheDocument()
  })

  it('shows computed GS and duration with no wind', () => {
    render(<SegmentCard segment={makeSegment({ distanceNm: 120, wind: null })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByText('120 kt')).toBeInTheDocument()
    expect(screen.getByText('1h00')).toBeInTheDocument()
  })

  it('displays zero distance and heading as 0, not blank', () => {
    render(<SegmentCard segment={makeSegment({ distanceNm: 0, headingMag: 0 })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/Dist \(nm\)/i)).toHaveValue(0)
    expect(screen.getByLabelText(/Cap°M/i)).toHaveValue(0)
  })

  it('calls onChange when distance is edited', async () => {
    const onChange = vi.fn()
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={onChange} />)
    const distInput = screen.getByLabelText(/Dist \(nm\)/i)
    await userEvent.clear(distInput)
    await userEvent.type(distInput, '50')
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when the segment name is edited', async () => {
    const onChange = vi.fn()
    render(<SegmentCard segment={makeSegment({ name: 'Vol' })} tas={120} isLastEnroute={false} onChange={onChange} />)
    const nameInput = screen.getByDisplayValue('Vol')
    await userEvent.type(nameInput, 'X')
    expect(onChange).toHaveBeenCalled()
  })

  it('collapses to a one-line summary and hides the input grid', async () => {
    render(<SegmentCard segment={makeSegment({ name: "L'Aigle-Flers", distanceNm: 50 })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /replier segment/i }))
    expect(screen.queryByLabelText(/Dist \(nm\)/i)).not.toBeInTheDocument()
    expect(screen.getByText(/L'Aigle-Flers · 50 nm · 120 kt · 0h25/)).toBeInTheDocument()
  })

  it('expands again and restores the input grid', async () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /replier segment/i }))
    await userEvent.click(screen.getByRole('button', { name: /déplier segment/i }))
    expect(screen.getByLabelText(/Dist \(nm\)/i)).toBeInTheDocument()
  })

  it('shows an ALT badge and disables remove/move for an ALTERNATE segment', () => {
    render(<SegmentCard segment={makeSegment({ role: 'ALTERNATE' })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByText('ALT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /supprimer segment/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '↑' })).not.toBeInTheDocument()
  })

  it('disables remove when isLastEnroute is true', () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={true} onChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole('button', { name: /supprimer segment/i })).toBeDisabled()
  })

  it('calls onRemove when the remove button is clicked and enabled', async () => {
    const onRemove = vi.fn()
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /supprimer segment/i }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('calls onMoveUp/onMoveDown when clicked and enabled', async () => {
    const onMoveUp = vi.fn()
    const onMoveDown = vi.fn()
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()}
      onMoveUp={onMoveUp} onMoveDown={onMoveDown} canMoveUp={true} canMoveDown={true} />)
    await userEvent.click(screen.getByRole('button', { name: '↑' }))
    await userEvent.click(screen.getByRole('button', { name: '↓' }))
    expect(onMoveUp).toHaveBeenCalledOnce()
    expect(onMoveDown).toHaveBeenCalledOnce()
  })

  it('shows a warning indicator when GS is zero or negative', () => {
    const seg = makeSegment({ headingMag: 270, wind: { directionDeg: 270, speedKt: 500 } })
    render(<SegmentCard segment={seg} tas={20} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByText(/⚠/)).toBeInTheDocument()
  })
})
