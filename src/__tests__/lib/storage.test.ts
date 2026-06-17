import { importFleet, duplicateAircraft, saveAircraft, listAircraft, getAircraft } from '../../lib/storage'
import type { Aircraft } from '../../types'

const makeAircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  id: 'test-id-1',
  name: 'DR221',
  registration: 'F-BPCT',
  characteristics: {
    regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }],
    fuelCapacity: 116,
  },
  massBalance: {
    emptyWeight: 615,
    emptyArm: 345,
    maxWeight: 840,
    stations: [],
    envelopePoints: [],
  },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
  ...overrides,
})

beforeEach(() => {
  localStorage.clear()
})

describe('importFleet', () => {
  it('adds a new aircraft when registration does not exist', () => {
    const ac = makeAircraft()
    const result = importFleet([ac])
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
    const fleet = listAircraft()
    expect(fleet).toHaveLength(1)
    expect(fleet[0].registration).toBe('F-BPCT')
  })

  it('generates a new UUID for added aircraft (does not use imported id)', () => {
    const ac = makeAircraft({ id: 'imported-id' })
    importFleet([ac])
    const fleet = listAircraft()
    expect(fleet[0].id).not.toBe('imported-id')
  })

  it('updates existing aircraft when registration already exists, preserving id', () => {
    const existing = makeAircraft({ id: 'original-id', name: 'Old Name' })
    saveAircraft(existing)

    const updated = makeAircraft({ id: 'different-id', name: 'New Name' })
    const result = importFleet([updated])

    expect(result.added).toBe(0)
    expect(result.updated).toBe(1)
    const fleet = listAircraft()
    expect(fleet).toHaveLength(1)
    expect(fleet[0].name).toBe('New Name')
    expect(fleet[0].id).toBe('original-id')   // existing id preserved
  })

  it('handles a mix of new and existing aircraft', () => {
    const existing = makeAircraft({ id: 'id-1', registration: 'F-BPCT' })
    saveAircraft(existing)

    const newAc = makeAircraft({ id: 'id-2', registration: 'F-GHKJ' })
    const result = importFleet([existing, newAc])

    expect(result.added).toBe(1)
    expect(result.updated).toBe(1)
    expect(listAircraft()).toHaveLength(2)
  })

  it('returns { added: 0, updated: 0 } for empty array', () => {
    const result = importFleet([])
    expect(result).toEqual({ added: 0, updated: 0 })
  })

  it('handles duplicate registrations in input — last entry wins', () => {
    const first = makeAircraft({ id: 'id-1', name: 'First' })
    const second = makeAircraft({ id: 'id-2', name: 'Second', registration: 'F-BPCT' })
    const result = importFleet([first, second])
    expect(result.added).toBe(1)
    const fleet = listAircraft()
    expect(fleet).toHaveLength(1)
    expect(fleet[0].name).toBe('Second')
  })
})

describe('duplicateAircraft', () => {
  it('returns a copy with a new id', () => {
    const ac = makeAircraft({ id: 'original-id' })
    const copy = duplicateAircraft(ac)
    expect(copy.id).not.toBe('original-id')
  })

  it('clears registration on the copy', () => {
    const ac = makeAircraft({ registration: 'F-BPCT' })
    const copy = duplicateAircraft(ac)
    expect(copy.registration).toBe('')
  })

  it('appends " (copie)" to the name', () => {
    const ac = makeAircraft({ name: 'DR221' })
    const copy = duplicateAircraft(ac)
    expect(copy.name).toBe('DR221 (copie)')
  })

  it('does NOT save to localStorage', () => {
    const ac = makeAircraft()
    duplicateAircraft(ac)
    expect(listAircraft()).toHaveLength(0)
  })

  it('preserves all other fields', () => {
    const ac = makeAircraft()
    const copy = duplicateAircraft(ac)
    expect(copy.massBalance).toEqual(ac.massBalance)
    expect(copy.performance).toEqual(ac.performance)
    expect(copy.characteristics).toEqual(ac.characteristics)
  })
})
