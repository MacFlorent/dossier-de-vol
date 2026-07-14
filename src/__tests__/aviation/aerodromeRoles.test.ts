import { describe, it, expect } from 'vitest'
import { ROLE_LABELS, ROLE_COLORS, ROLE_CYCLE } from '../../lib/aviation/aerodromeRoles'

describe('aerodromeRoles', () => {
  it('defines a label for every role in the cycle', () => {
    for (const role of ROLE_CYCLE) {
      expect(ROLE_LABELS[role]).toBeTruthy()
    }
  })

  it('defines a color for every role in the cycle', () => {
    for (const role of ROLE_CYCLE) {
      expect(ROLE_COLORS[role]).toBeTruthy()
    }
  })

  it('cycles DEP → ARR → ALTERNATE → OVERFLY', () => {
    expect(ROLE_CYCLE).toEqual(['DEP', 'ARR', 'ALTERNATE', 'OVERFLY'])
  })
})
