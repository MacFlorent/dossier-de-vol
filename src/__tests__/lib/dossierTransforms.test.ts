import { describe, it, expect } from 'vitest'
import { applyAircraftChange } from '../../lib/dossierTransforms'
import type { FlightDossier, Aircraft, FlightSegment } from '../../types'

const defaultSegment: FlightSegment = {
  id: 's1', role: 'ENROUTE', name: 'Vol',
  distanceNm: 0, headingMag: 0, wind: null, notes: '',
}

const oldAircraft = {
  id: 'ac-old', name: 'DR221', registration: 'F-BPCT',
  snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 116 },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [{ name: 'Pilote', arm: 300, kind: 'dry' as const }], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}

const newAircraft: Aircraft = {
  id: 'ac-new', name: 'DR42', registration: 'F-WXYZ',
  characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 25 }], fuelCapacity: 130 },
  massBalance: { emptyWeight: 700, emptyArm: 350, stations: [{ name: 'Passager', arm: 320, kind: 'dry' as const }], envelopePoints: [] },
  performance: {
    toTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[450]]] },
    ldgTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[520]]] },
  },
}

const baseDossier: FlightDossier = {
  id: 'd-1', name: 'Test', date: '2026-06-18', departureTime: '',
  aircraft: oldAircraft,
  branches: [
    { id: 'b1', label: 'Aller', aerodromes: [], segments: [defaultSegment], notes: '' },
    { id: 'b2', label: 'Retour', aerodromes: [], segments: [defaultSegment], notes: '' },
  ],
  weatherInputs: { fields: {}, notes: '' },
  fuelInputs: {
    'b1': { roulage: 15, marge: 10, extras: [], reserveMin: 30, plein: false },
    'b2': { roulage: 10, marge: 10, extras: [], reserveMin: 45, plein: true },
  },
  loading: { 'Pilote': 80 },
  perfRegulatory: 1.15,
  perfInputs: { 'b1': { surface: 'hard', windKt: 5 } },
  notes: 'vol test',
  createdAt: '2026-06-18T10:00:00.000Z',
  updatedAt: '2026-06-18T10:00:00.000Z',
}

describe('applyAircraftChange', () => {
  it('replaces the aircraft with a new snapshot', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.aircraft.id).toBe('ac-new')
    expect(result.aircraft.snapshotAt).toBeDefined()
  })

  it('preserves fuelInputs fields (roulage, marge, extras, reserveMin, plein)', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.fuelInputs['b1'].roulage).toBe(15)
    expect(result.fuelInputs['b1'].marge).toBe(10)
    expect(result.fuelInputs['b1'].reserveMin).toBe(30)
    expect(result.fuelInputs['b1'].plein).toBe(false)
    expect(result.fuelInputs['b2'].reserveMin).toBe(45)
    expect(result.fuelInputs['b2'].plein).toBe(true)
  })

  it('resets loading to 0 for all new aircraft stations', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.loading).toEqual({ 'Passager': 0 })
  })

  it('clears perfInputs', () => {
    expect(applyAircraftChange(baseDossier, newAircraft).perfInputs).toEqual({})
  })

  it('preserves branches, notes, perfRegulatory', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.branches).toBe(baseDossier.branches)
    expect(result.notes).toBe('vol test')
    expect(result.perfRegulatory).toBe(1.15)
  })

  it('updates updatedAt', () => {
    expect(applyAircraftChange(baseDossier, newAircraft).updatedAt).not.toBe(baseDossier.updatedAt)
  })
})
