import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentsSection } from '../../components/ui/SegmentsSection'
import type { FlightBranch, FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, ...overrides }
}
function makeBranch(segments: FlightSegment[]): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments, notes: '' }
}

describe('SegmentsSection', () => {
  it('renders a SegmentCard for each ENROUTE segment', () => {
    const segments = [makeSegment({ id: 's1', name: 'Leg 1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Leg 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Leg 2')).toBeInTheDocument()
  })

  it('does not render the ALTERNATE segment', () => {
    const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 's2', role: 'ALTERNATE', name: 'Déroutement' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={vi.fn()} />)
    expect(screen.queryByDisplayValue('Déroutement')).not.toBeInTheDocument()
  })

  it('adds a segment before the ALTERNATE segment when "+ Segment" is clicked', async () => {
    const onChange = vi.fn()
    const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 'alt', role: 'ALTERNATE' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={onChange} />)
    await userEvent.click(screen.getByText('+ Segment'))
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments).toHaveLength(3)
    expect(updated.segments[1].role).toBe('ENROUTE')
    expect(updated.segments[2].role).toBe('ALTERNATE')
  })

  it('adds a segment at the end when there is no ALTERNATE segment', async () => {
    const onChange = vi.fn()
    render(<SegmentsSection branch={makeBranch([makeSegment()])} tas={120} onChange={onChange} />)
    await userEvent.click(screen.getByText('+ Segment'))
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments).toHaveLength(2)
  })

  it('cannot remove the last ENROUTE segment', () => {
    render(<SegmentsSection branch={makeBranch([makeSegment()])} tas={120} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /supprimer segment/i })).toBeDisabled()
  })

  it('removes a segment when there are multiple ENROUTE segments', async () => {
    const onChange = vi.fn()
    const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={onChange} />)
    const deleteButtons = screen.getAllByRole('button', { name: /supprimer segment/i })
    await userEvent.click(deleteButtons[0])
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments).toHaveLength(1)
  })

  it('reorders segments with the move buttons', async () => {
    const onChange = vi.fn()
    const segments = [makeSegment({ id: 's1', name: 'Leg 1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={onChange} />)
    const downButtons = screen.getAllByRole('button', { name: '↓' })
    await userEvent.click(downButtons[0])
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments[0].id).toBe('s2')
    expect(updated.segments[1].id).toBe('s1')
  })
})
