import { formatDuration } from '../../lib/format'

describe('formatDuration', () => {
  it('formats whole hours with 00 minutes', () => {
    expect(formatDuration(60)).toBe('1h00')
  })

  it('formats minutes under an hour with 0h prefix', () => {
    expect(formatDuration(25)).toBe('0h25')
  })

  it('pads single-digit minutes', () => {
    expect(formatDuration(65)).toBe('1h05')
  })

  it('returns ∞ for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('∞')
  })
})
