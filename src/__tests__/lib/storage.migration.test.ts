import { migrateDossier } from '../../lib/storage'
import type { FlightDossier, FuelInputs } from '../../types'

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
  weatherInputs: { fields: {}, winds: [], notes: '' },
  loading: {},
  perfRegulatory: 0,
  perfInputs: {},
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('migrateDossier', () => {
  describe('old dossier with route.waypoints (no branches)', () => {
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

    it('branch contains 2 FlightPoints with DEP and ARR roles', () => {
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

      expect(branch.points).toHaveLength(2)
      expect(branch.points[0].identifier).toBe('LFPG')
      expect(branch.points[0].role).toBe('DEP')
      expect(branch.points[1].identifier).toBe('LFOB')
      expect(branch.points[1].role).toBe('ARR')
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

  describe('old dossier with flat fuelInputs (no branches)', () => {
    it('wraps fuelInputs in a record keyed by the new branch id', () => {
      const legacyFuel: FuelInputs = {
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

      // The wrapped value must equal the original flat FuelInputs
      expect(result.fuelInputs[branchId]).toEqual(legacyFuel)
    })
  })

  describe('modern dossier with branches already present', () => {
    it('does not modify a dossier that already has a branches array', () => {
      const existingBranches = [
        {
          id: 'branch-existing',
          label: 'Aller',
          points: [],
          distanceNm: 100,
          notes: 'already migrated',
        },
      ]
      const modern: FlightDossier = {
        ...baseDossierFields,
        branches: existingBranches,
        fuelInputs: { 'branch-existing': {
          gsBase: 108, windAdjust: 0, roulage: 10, marge: 10,
          extras: [], reserveMin: 30, derouteMin: 30, plein: false,
        }},
      }

      const result = migrateDossier(modern)

      expect(result.branches).toHaveLength(1)
      expect(result.branches[0].id).toBe('branch-existing')
      expect(result.branches[0].distanceNm).toBe(100)
      expect(result.branches[0].notes).toBe('already migrated')
    })

    it('returns the same fuelInputs record without wrapping', () => {
      const fuelRecord = {
        'branch-existing': {
          gsBase: 108, windAdjust: 0, roulage: 10, marge: 10,
          extras: [], reserveMin: 30, derouteMin: 30, plein: false,
        },
      }
      const modern: FlightDossier = {
        ...baseDossierFields,
        branches: [{ id: 'branch-existing', label: 'Aller', points: [], distanceNm: 0, notes: '' }],
        fuelInputs: fuelRecord,
      }

      const result = migrateDossier(modern)

      expect(result.fuelInputs).toEqual(fuelRecord)
      // Must still be keyed by branch id, not a flat FuelInputs
      expect(Object.keys(result.fuelInputs)).toHaveLength(1)
      expect(Object.keys(result.fuelInputs)[0]).toBe('branch-existing')
    })
  })

})
