import { migrateDossier } from '../../lib/storage'
import type { FlightDossier } from '../../types'

// Minimal aircraft snapshot stub shared by all test fixtures
const aircraftStub = {
  id: 'ac-1',
  name: 'DR221',
  registration: 'F-BPCT',
  snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 116 },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}

const baseDossierFields = {
  id: 'dossier-1',
  name: 'Test flight',
  date: '2026-01-15',
  departureTime: '09:00',
  aircraft: aircraftStub,
  weatherInputs: { fields: {}, notes: '' },
  loading: {},
  perfRegulatory: 0,
  perfInputs: {},
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('migrateDossier', () => {
  describe('old dossier without branches array', () => {
    it('creates a branches array with one branch', () => {
      const old = {
        ...baseDossierFields,
        route: {
          waypoints: [
            { icao: 'LFPG', name: 'CDG' },
            { icao: 'LFOB', name: 'Beauvais' },
          ],
        },
        fuelInputs: {},
      }

      const result = migrateDossier(old)

      expect(Array.isArray(result.branches)).toBe(true)
      expect(result.branches).toHaveLength(1)
    })

    it('branch uses new shape: aerodromes[], segments[] with one ENROUTE', () => {
      const old = {
        ...baseDossierFields,
        route: {
          waypoints: [
            { icao: 'LFPG', name: 'CDG' },
            { icao: 'LFOB', name: 'Beauvais' },
          ],
        },
        fuelInputs: {},
      }

      const result = migrateDossier(old)
      const branch = result.branches[0]

      expect(Array.isArray(branch.aerodromes)).toBe(true)
      expect(Array.isArray(branch.segments)).toBe(true)
      expect(branch.segments).toHaveLength(1)
      expect(branch.segments[0].role).toBe('ENROUTE')
      expect(branch.segments[0].name).toBe('Vol')
    })

    it('removes the legacy route field', () => {
      const old = {
        ...baseDossierFields,
        route: { waypoints: [{ icao: 'LFPG' }, { icao: 'LFOB' }] },
        fuelInputs: {},
      }

      const result = migrateDossier(old) as FlightDossier & { route?: unknown }

      expect(result.route).toBeUndefined()
    })
  })

  describe('old dossier with flat fuelInputs (legacy gsBase shape)', () => {
    it('wraps fuelInputs in a record keyed by the new branch id, stripping gsBase/windAdjust/derouteMin', () => {
      const legacyFuel = {
        gsBase: 108,
        windAdjust: 0,
        roulage: 10,
        marge: 10,
        extras: [],
        reserveMin: 45,
        derouteMin: 30,
        plein: false,
      }

      const old = {
        ...baseDossierFields,
        fuelInputs: legacyFuel,
      }

      const result = migrateDossier(old)

      // fuelInputs must now be a Record<string, FuelInputs>, not a raw FuelInputs
      expect(typeof result.fuelInputs).toBe('object')
      // Must NOT be the flat object itself (i.e., no gsBase at the top level)
      expect((result.fuelInputs as unknown as { gsBase?: unknown }).gsBase).toBeUndefined()

      // Must have exactly one key: the new branch id
      const keys = Object.keys(result.fuelInputs)
      expect(keys).toHaveLength(1)
      const branchId = keys[0]

      // The branch id must match the single created branch
      expect(result.branches).toHaveLength(1)
      expect(result.branches[0].id).toBe(branchId)

      // Legacy fields stripped, core fields preserved
      const fi = result.fuelInputs[branchId] as unknown as Record<string, unknown>
      expect(fi.gsBase).toBeUndefined()
      expect(fi.windAdjust).toBeUndefined()
      expect(fi.derouteMin).toBeUndefined()
      expect(fi.roulage).toBe(10)
      expect(fi.reserveMin).toBe(45)
      expect(fi.plein).toBe(false)
    })
  })

  describe('legacy weatherInputs with winds field', () => {
    it('removes the winds field from weatherInputs', () => {
      const old = {
        ...baseDossierFields,
        weatherInputs: { fields: {}, winds: [{ altitude_ft: 0, direction_deg: 270, speed_kt: 10 }], notes: '' },
        branches: [{ id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }], notes: '' }],
        fuelInputs: { 'b1': { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' as const } },
      }

      const result = migrateDossier(old)

      expect((result.weatherInputs as unknown as { winds?: unknown }).winds).toBeUndefined()
    })
  })

  describe('modern dossier with branches already present', () => {
    it('does not modify a dossier that already has a branches array', () => {
      const existingBranches = [
        {
          id: 'branch-existing',
          label: 'Aller',
          aerodromes: [],
          segments: [{ id: 's1', role: 'ENROUTE' as const, name: 'Vol', distanceNm: 100, headingMag: 0, wind: null, notes: '' }],
          notes: 'already migrated',
        },
      ]
      const modern: FlightDossier = {
        ...baseDossierFields,
        branches: existingBranches,
        fuelInputs: { 'branch-existing': { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' } },
      }

      const result = migrateDossier(modern)

      expect(result.branches).toHaveLength(1)
      expect(result.branches[0].id).toBe('branch-existing')
      expect(result.branches[0].notes).toBe('already migrated')
    })

    it('returns the same fuelInputs record without wrapping', () => {
      const fuelRecord = {
        'branch-existing': { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' as const },
      }
      const modern: FlightDossier = {
        ...baseDossierFields,
        branches: [{ id: 'branch-existing', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE' as const, name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }], notes: '' }],
        fuelInputs: fuelRecord,
      }

      const result = migrateDossier(modern)

      expect(result.fuelInputs).toEqual(fuelRecord)
      expect(Object.keys(result.fuelInputs)).toHaveLength(1)
      expect(Object.keys(result.fuelInputs)[0]).toBe('branch-existing')
    })
  })
})
