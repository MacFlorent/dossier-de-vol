import { describe, it, expect } from 'vitest'
import { findIcaoByCoords, getAerodrome, AERODROMES } from '../../lib/icao/database'

describe('findIcaoByCoords', () => {
  it('finds LFPN by its exact coordinates (within default 2nm threshold)', () => {
    expect(findIcaoByCoords(48.7497, 2.1119)).toBe('LFPN')
  })

  it('returns null when threshold is too strict (0.1nm)', () => {
    // Coordinates ~1nm away from LFPN: close enough for default threshold but not 0.1nm
    expect(findIcaoByCoords(48.7580, 2.1119, 0.1)).toBeNull()
  })

  it('returns null for coordinates in the middle of the ocean', () => {
    expect(findIcaoByCoords(0, 0)).toBeNull()
  })

  it('finds LFGH at La Charité-sur-Loire', () => {
    expect(findIcaoByCoords(47.1753, 3.0294)).toBe('LFGH')
  })
})

describe('getAerodrome', () => {
  it('returns the correct aerodrome for LFPN', () => {
    expect(getAerodrome('LFPN')?.name).toBe('Paris Toussus-le-Noble')
  })

  it('returns undefined for unknown ICAO code', () => {
    expect(getAerodrome('LFZZ')).toBeUndefined()
  })
})

describe('AERODROMES', () => {
  it('contains at least 80 aerodromes', () => {
    expect(AERODROMES.length).toBeGreaterThanOrEqual(80)
  })
})
