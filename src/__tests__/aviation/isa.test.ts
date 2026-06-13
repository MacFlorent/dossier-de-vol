import { pressureAltitude, isaDeviation, densityAltitude, densityRatio } from '../../lib/aviation/isa'

describe('pressureAltitude', () => {
  it('returns 0 at sea level with standard QNH', () => {
    expect(pressureAltitude(0, 1013)).toBe(0)
  })

  it('adds correction for low QNH', () => {
    // 1013 - 993 = 20 hPa, 20 × 27 = 540 ft
    expect(pressureAltitude(0, 993)).toBe(540)
  })

  it('adds altitude and QNH correction', () => {
    expect(pressureAltitude(1000, 993)).toBe(1540)
  })

  it('subtracts correction for high QNH', () => {
    // 1013 - 1033 = -20 hPa, -20 × 27 = -540 ft
    expect(pressureAltitude(0, 1033)).toBe(-540)
  })
})

describe('isaDeviation', () => {
  it('returns ~0 at sea level with ISA temperature 15°C', () => {
    expect(isaDeviation(0, 15)).toBeCloseTo(0, 5)
  })

  it('returns +5 at sea level when OAT is 20°C', () => {
    expect(isaDeviation(0, 20)).toBeCloseTo(5, 5)
  })

  it('returns 0 at FL100 when OAT is -5°C (ISA)', () => {
    // ISA at 10000ft = 15 - 2*(10000/1000) = 15 - 20 = -5°C
    expect(isaDeviation(10000, -5)).toBeCloseTo(0, 5)
  })

  it('returns negative deviation for cold day', () => {
    expect(isaDeviation(0, 5)).toBeCloseTo(-10, 5)
  })
})

describe('densityAltitude', () => {
  it('is approximately 0 at sea level ISA conditions', () => {
    // PA=0, OAT=15°C → σ≈1 → DA≈0
    expect(densityAltitude(0, 15)).toBeCloseTo(0, -2)
  })

  it('is greater than PA on a hot day', () => {
    expect(densityAltitude(2000, 30)).toBeGreaterThan(2000)
  })

  it('increases further above PA on a very hot day at altitude', () => {
    // At 5000ft PA and 40°C, DA is much higher than PA
    expect(densityAltitude(5000, 40)).toBeGreaterThan(5000)
  })
})

describe('densityRatio', () => {
  it('is approximately 1 at sea level ISA', () => {
    expect(densityRatio(0, 15)).toBeCloseTo(1, 3)
  })

  it('decreases with altitude', () => {
    expect(densityRatio(5000, 15)).toBeLessThan(densityRatio(0, 15))
  })

  it('decreases with temperature', () => {
    expect(densityRatio(0, 30)).toBeLessThan(densityRatio(0, 15))
  })
})
