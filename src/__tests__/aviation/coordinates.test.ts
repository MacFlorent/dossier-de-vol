import { distanceNm, trueCourse, normAngle } from '../../lib/aviation/coordinates'

describe('distanceNm', () => {
  it('returns 0 for identical points', () => {
    expect(distanceNm(0, 0, 0, 0)).toBe(0)
  })

  it('LFPN to near Étampes ≈ 22 nm', () => {
    // Actual Haversine result for these coordinates is ~21.75 nm
    expect(distanceNm(48.7497, 2.1119, 48.3886, 2.0672)).toBeCloseTo(22, 0)
  })

  it('is symmetric', () => {
    const d1 = distanceNm(48.7497, 2.1119, 48.3886, 2.0672)
    const d2 = distanceNm(48.3886, 2.0672, 48.7497, 2.1119)
    expect(d1).toBeCloseTo(d2, 5)
  })
})

describe('trueCourse', () => {
  it('returns ~0 going north', () => {
    expect(trueCourse(0, 0, 1, 0)).toBeCloseTo(0, 0)
  })

  it('returns ~90 going east', () => {
    expect(trueCourse(0, 0, 0, 1)).toBeCloseTo(90, 0)
  })

  it('returns ~180 going south', () => {
    expect(trueCourse(0, 0, -1, 0)).toBeCloseTo(180, 0)
  })

  it('returns ~270 going west', () => {
    expect(trueCourse(0, 0, 0, -1)).toBeCloseTo(270, 0)
  })
})

describe('normAngle', () => {
  it('returns 0 for 0', () => {
    expect(normAngle(0)).toBe(0)
  })

  it('normalizes 360 to 0', () => {
    expect(normAngle(360)).toBe(0)
  })

  it('normalizes -90 to 270', () => {
    expect(normAngle(-90)).toBe(270)
  })

  it('normalizes 450 to 90', () => {
    expect(normAngle(450)).toBe(90)
  })

  it('returns 180 unchanged', () => {
    expect(normAngle(180)).toBe(180)
  })
})
