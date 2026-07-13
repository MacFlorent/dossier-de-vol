import { describe, it, expect } from 'vitest'
import { niceTicks } from '../../lib/format/axisTicks'

describe('niceTicks', () => {
  it('returns a single value when min equals max', () => {
    expect(niceTicks(500, 500)).toEqual([500])
  })

  it('produces round steps spanning a weight-like range', () => {
    expect(niceTicks(400, 850, 5)).toEqual([400, 500, 600, 700, 800, 900])
  })

  it('produces round steps spanning a CG-like range', () => {
    expect(niceTicks(2300, 2550, 5)).toEqual([2300, 2400, 2500, 2600])
  })

  it('always includes the full [min, max] range within the first/last tick', () => {
    const ticks = niceTicks(413, 878, 5)
    expect(ticks[0]).toBeLessThanOrEqual(413)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(878)
  })
})
