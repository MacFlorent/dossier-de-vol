import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'

// Minimal valid table reused across tests
const validTable = {
  weights: [800],
  pressureAltitudes: [0, 1000],
  oats: [0, 15],
  values: [[[200, 220], [240, 260]]],
}

describe('validatePerformanceTable — valid table', () => {
  it('returns no errors and no warnings for a valid minimal table', () => {
    const result = validatePerformanceTable(validTable)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

describe('validatePerformanceTable — errors', () => {
  it('errors on non-object input', () => {
    const { errors } = validatePerformanceTable(null)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('errors when weights is missing', () => {
    const { errors } = validatePerformanceTable({ ...validTable, weights: undefined })
    expect(errors.some(e => e.includes('weights'))).toBe(true)
  })

  it('errors when weights is empty', () => {
    const { errors } = validatePerformanceTable({ ...validTable, weights: [] })
    expect(errors.some(e => e.includes('weights'))).toBe(true)
  })

  it('errors when pressureAltitudes is missing', () => {
    const { errors } = validatePerformanceTable({ ...validTable, pressureAltitudes: undefined })
    expect(errors.some(e => e.includes('pressureAltitudes'))).toBe(true)
  })

  it('errors when oats is missing', () => {
    const { errors } = validatePerformanceTable({ ...validTable, oats: undefined })
    expect(errors.some(e => e.includes('oats'))).toBe(true)
  })

  it('errors when weights is not sorted ascending', () => {
    const { errors } = validatePerformanceTable({ ...validTable, weights: [1000, 800] })
    expect(errors.some(e => e.includes('weights') && e.includes('trié'))).toBe(true)
  })

  it('errors when pressureAltitudes is not sorted ascending', () => {
    const { errors } = validatePerformanceTable({ ...validTable, pressureAltitudes: [1000, 0] })
    expect(errors.some(e => e.includes('pressureAltitudes') && e.includes('trié'))).toBe(true)
  })

  it('errors when oats is not sorted ascending', () => {
    const { errors } = validatePerformanceTable({ ...validTable, oats: [15, 0] })
    expect(errors.some(e => e.includes('oats') && e.includes('trié'))).toBe(true)
  })

  it('errors when values weight dimension does not match weights', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      weights: [800, 1000],
      values: [[[200, 220], [240, 260]]],  // only 1 weight, should be 2
    })
    expect(errors.some(e => e.includes('dimension poids'))).toBe(true)
  })

  it('errors when values PA dimension does not match pressureAltitudes', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      values: [[[200, 220]]],  // only 1 PA, should be 2
    })
    expect(errors.some(e => e.includes('dimension PA'))).toBe(true)
  })

  it('errors when values OAT dimension does not match oats', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      values: [[[200], [240]]],  // only 1 OAT, should be 2
    })
    expect(errors.some(e => e.includes('dimension OAT'))).toBe(true)
  })

  it('errors when grassValues dimensions differ from values', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      grassValues: [[[300]]],  // wrong shape
    })
    expect(errors.some(e => e.includes('grassValues'))).toBe(true)
  })

  it('errors when weightCorrection is quadratic without referenceWeight', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      weightCorrection: 'quadratic',
    })
    expect(errors.some(e => e.includes('referenceWeight'))).toBe(true)
  })

  it('errors when weightCorrection is quadratic with multiple weights', () => {
    const { errors } = validatePerformanceTable({
      weights: [800, 1000],
      pressureAltitudes: [0],
      oats: [15],
      values: [[[200]], [[260]]],
      weightCorrection: 'quadratic',
      referenceWeight: 900,
    })
    expect(errors.some(e => e.includes('quadratic attend un seul poids'))).toBe(true)
  })

  it('errors when a distance value is 0 or negative', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      values: [[[0, 220], [240, 260]]],
    })
    expect(errors.some(e => e.includes('Distance invalide'))).toBe(true)
  })
})

describe('validatePerformanceTable — warnings', () => {
  it('warns when both grassValues and grassFactor are present', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      grassValues: [[[300, 320], [360, 380]]],
      grassFactor: 1.20,
    })
    expect(warnings.some(w => w.includes('grassFactor ignoré'))).toBe(true)
  })

  it('warns when both windCorrections and headwindFactor are present', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 10, factor: 0.75 }],
      headwindFactor: 0.025,
    })
    expect(warnings.some(w => w.includes('headwindFactor ignoré'))).toBe(true)
  })

  it('warns when both windCorrections and tailwindFactor are present', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 10, factor: 0.75 }],
      tailwindFactor: 0.02,
    })
    expect(warnings.some(w => w.includes('tailwindFactor ignoré'))).toBe(true)
  })

  it('warns when referenceWeight is present without quadratic', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      referenceWeight: 800,
    })
    expect(warnings.some(w => w.includes('referenceWeight ignoré'))).toBe(true)
  })

  it('warns when weightCorrectionDivisor is present without quadratic', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      weightCorrectionDivisor: 830,
    })
    expect(warnings.some(w => w.includes('weightCorrectionDivisor ignoré'))).toBe(true)
  })

  it('warns when windCorrections contains factor > 1.0', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 0, factor: 1.1 }],
    })
    expect(warnings.some(w => w.includes('facteur > 1.0'))).toBe(true)
  })
})
