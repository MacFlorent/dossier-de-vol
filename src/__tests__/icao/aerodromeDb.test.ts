import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

// Mock the JSON import
vi.mock('../../../resources/aerodromes.json', () => ({
  default: [
    { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 0, runways: [], updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
}))

import {
  getAerodromeDb, getAerodrome, upsertAerodrome,
  deleteAerodromeFromDb, importAerodromeDb, initAerodromeDb,
} from '../../../src/lib/icao/aerodromeDb'

beforeEach(() => { Object.keys(store).forEach(k => delete store[k]) })

describe('initAerodromeDb', () => {
  it('seeds from JSON when localStorage is empty', () => {
    initAerodromeDb()
    expect(getAerodrome('LFPN')?.name).toBe('Toussus')
  })
  it('does not overwrite existing data on second call', () => {
    initAerodromeDb()
    upsertAerodrome({ icao: 'LFPN', name: 'Modified', lat: 0, lng: 0, elevationFt: 500, runways: [], updatedAt: '' })
    initAerodromeDb()
    expect(getAerodrome('LFPN')?.name).toBe('Modified')
  })
})

describe('upsertAerodrome', () => {
  it('adds a new aerodrome', () => {
    initAerodromeDb()
    upsertAerodrome({ icao: 'LFGH', name: 'La Charité', lat: 47.17, lng: 3.02, elevationFt: 580, runways: [], updatedAt: '' })
    expect(getAerodrome('LFGH')?.elevationFt).toBe(580)
  })
  it('updates an existing aerodrome', () => {
    initAerodromeDb()
    upsertAerodrome({ icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' })
    expect(getAerodrome('LFPN')?.elevationFt).toBe(538)
  })
})

describe('deleteAerodromeFromDb', () => {
  it('removes an aerodrome', () => {
    initAerodromeDb()
    deleteAerodromeFromDb('LFPN')
    expect(getAerodrome('LFPN')).toBeUndefined()
  })
})

describe('importAerodromeDb', () => {
  it('merges incoming aerodromes, returns counts', () => {
    initAerodromeDb()
    const result = importAerodromeDb([
      { icao: 'LFPN', name: 'Toussus Updated', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
      { icao: 'LFGH', name: 'La Charité', lat: 47.17, lng: 3.02, elevationFt: 580, runways: [], updatedAt: '' },
    ])
    expect(result).toEqual({ added: 1, updated: 1 })
    expect(getAerodrome('LFPN')?.name).toBe('Toussus Updated')
    expect(getAerodrome('LFGH')?.elevationFt).toBe(580)
  })
})

describe('getAerodromeDb', () => {
  it('returns all aerodromes', () => {
    initAerodromeDb()
    expect(getAerodromeDb().length).toBeGreaterThan(0)
  })
})
