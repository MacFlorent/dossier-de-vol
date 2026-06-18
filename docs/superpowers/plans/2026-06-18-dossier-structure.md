# Dossier Structure Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five UX improvements to the flight dossier: editable name, aircraft change with reset, "Vols" rename with duration estimate, inline point notes/role cycling, and "custom" label for unresolved points.

**Architecture:** All changes are additive extensions to existing components. `FlightPoint` gets an optional `notes` field. `BranchesPanel` grows an `aircraft` prop (for duration). `AppChrome` gains inline name editing and a two-step aircraft-change modal. A new pure function `applyAircraftChange` in `src/lib/dossierTransforms.ts` handles the aircraft swap logic and is tested independently.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, Tailwind (CSS vars), no Redux (useReducer in App.tsx).

## Global Constraints

- All user-visible text "Branches" → "Vols" / "branche" → "vol"; internal identifiers (`branches`, `FlightBranch`, `onUpdate`, etc.) and the JSON file format stay unchanged for backward-compat.
- `notes` on `FlightPoint` is `?: string` (optional) — never break existing dossier files.
- No new npm dependencies.
- Run `npm test` after each task; all tests must pass before committing.

---

## File Map

| File | What changes |
|------|-------------|
| `src/types/index.ts` | Add `notes?: string` to `FlightPoint` |
| `src/lib/storage.ts` | Migrate missing `notes` on points in `migrateDossier` |
| `src/lib/dossierTransforms.ts` | **New** — pure `applyAircraftChange` function |
| `src/features/branches/BranchesPanel.tsx` | Aircraft prop, duration display, "Vols" labels, point 2-row layout, role cycling, "custom" |
| `src/screens/DossierScreen.tsx` | Pass `aircraft` to `BranchesPanel` |
| `src/components/AppChrome.tsx` | "Vols" tab label, inline name edit, aircraft name + Changer button, `ChangeAircraftModal` |
| `src/App.tsx` | Wire `onUpdateName` and `onChangeAircraft` handlers |
| `src/__tests__/lib/storage.migration.test.ts` | Add `notes` migration test |
| `src/__tests__/lib/dossierTransforms.test.ts` | **New** — tests for `applyAircraftChange` |
| `src/__tests__/branches/BranchesPanel.test.tsx` | Update for renamed labels + aircraft prop + new behaviours |

---

## Task 1: FlightPoint.notes type + migration

**Files:**
- Modify: `src/types/index.ts:86-91`
- Modify: `src/lib/storage.ts:103-135` (`migrateDossier`)
- Test: `src/__tests__/lib/storage.migration.test.ts`

**Interfaces:**
- Produces: `FlightPoint.notes?: string` used by Tasks 2 and 3

- [ ] **Step 1: Write the failing migration test**

Add at the bottom of `src/__tests__/lib/storage.migration.test.ts`, inside `describe('migrateDossier', ...)`:

```ts
describe('FlightPoint notes migration', () => {
  it('adds empty notes to points that have none', () => {
    const modern = {
      ...baseDossierFields,
      branches: [{
        id: 'b1',
        label: 'Aller',
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
        distanceNm: 0,
        notes: '',
      }],
      fuelInputs: { 'b1': {
        gsBase: 108, windAdjust: 0, roulage: 10, marge: 10,
        extras: [], reserveMin: 30, derouteMin: 30, plein: false,
      }},
    }

    const result = migrateDossier(modern)

    expect(result.branches[0].points[0].notes).toBe('')
  })

  it('preserves existing notes on points', () => {
    const modern = {
      ...baseDossierFields,
      branches: [{
        id: 'b1',
        label: 'Aller',
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP', notes: 'VFR entry' }],
        distanceNm: 0,
        notes: '',
      }],
      fuelInputs: { 'b1': {
        gsBase: 108, windAdjust: 0, roulage: 10, marge: 10,
        extras: [], reserveMin: 30, derouteMin: 30, plein: false,
      }},
    }

    const result = migrateDossier(modern)

    expect(result.branches[0].points[0].notes).toBe('VFR entry')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- storage.migration
```

Expected: FAIL — `notes` is undefined, not `''`.

- [ ] **Step 3: Add `notes` to FlightPoint in `src/types/index.ts`**

Replace lines 86–91:

```ts
export interface FlightPoint {
  id: string
  type: FlightPointType
  identifier: string
  role: FlightPointRole
  notes?: string
}
```

- [ ] **Step 4: Add notes migration in `src/lib/storage.ts`**

In `migrateDossier`, just before `return data as unknown as FlightDossier`:

```ts
  // Migrate missing notes on FlightPoints
  if (Array.isArray(data.branches)) {
    for (const branch of data.branches as Array<{ points?: Array<Record<string, unknown>> }>) {
      if (Array.isArray(branch.points)) {
        for (const pt of branch.points) {
          if (pt.notes === undefined) pt.notes = ''
        }
      }
    }
  }
  return data as unknown as FlightDossier
```

- [ ] **Step 5: Run tests to verify they pass**

```
npm test -- storage.migration
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/storage.ts src/__tests__/lib/storage.migration.test.ts
git commit -m "feat: add notes field to FlightPoint with migration"
```

---

## Task 2: applyAircraftChange pure function

**Files:**
- Create: `src/lib/dossierTransforms.ts`
- Create: `src/__tests__/lib/dossierTransforms.test.ts`

**Interfaces:**
- Produces: `applyAircraftChange(dossier: FlightDossier, newAircraft: Aircraft): FlightDossier` — consumed by Task 4 (App.tsx)

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/dossierTransforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyAircraftChange } from '../../lib/dossierTransforms'
import type { FlightDossier, Aircraft } from '../../types'

const oldAircraft = {
  id: 'ac-old',
  name: 'DR221',
  registration: 'F-BPCT',
  snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 116 },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [{ name: 'Pilote', arm: 300, kind: 'dry' as const }], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}

const newAircraft: Aircraft = {
  id: 'ac-new',
  name: 'DR42',
  registration: 'F-WXYZ',
  characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 25 }], fuelCapacity: 130 },
  massBalance: { emptyWeight: 700, emptyArm: 350, stations: [{ name: 'Passager', arm: 320, kind: 'dry' as const }], envelopePoints: [] },
  performance: {
    toTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[450]]] },
    ldgTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[520]]] },
  },
}

const baseDossier: FlightDossier = {
  id: 'd-1',
  name: 'Test',
  date: '2026-06-18',
  departureTime: '',
  aircraft: oldAircraft,
  branches: [
    { id: 'b1', label: 'Aller', points: [], distanceNm: 100, notes: '' },
    { id: 'b2', label: 'Retour', points: [], distanceNm: 80, notes: '' },
  ],
  weatherInputs: { fields: {}, winds: [], notes: '' },
  fuelInputs: {
    'b1': { gsBase: 108, windAdjust: 5, roulage: 15, marge: 10, extras: [], reserveMin: 30, derouteMin: 30, plein: false },
    'b2': { gsBase: 108, windAdjust: 0, roulage: 10, marge: 10, extras: [], reserveMin: 45, derouteMin: 30, plein: true },
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
    expect(result.aircraft.name).toBe('DR42')
    expect(result.aircraft.snapshotAt).toBeDefined()
  })

  it('resets gsBase to new aircraft first regime speed for every branch', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.fuelInputs['b1'].gsBase).toBe(120)
    expect(result.fuelInputs['b2'].gsBase).toBe(120)
  })

  it('resets windAdjust to 0 for every branch', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.fuelInputs['b1'].windAdjust).toBe(0)
    expect(result.fuelInputs['b2'].windAdjust).toBe(0)
  })

  it('preserves other fuelInputs fields (roulage, marge, extras, reserveMin, derouteMin, plein)', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    const b1 = result.fuelInputs['b1']
    expect(b1.roulage).toBe(15)
    expect(b1.marge).toBe(10)
    expect(b1.reserveMin).toBe(30)
    expect(b1.derouteMin).toBe(30)
    expect(b1.plein).toBe(false)
    const b2 = result.fuelInputs['b2']
    expect(b2.reserveMin).toBe(45)
    expect(b2.plein).toBe(true)
  })

  it('resets loading to 0 for all new aircraft stations', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.loading).toEqual({ 'Passager': 0 })
    expect(result.loading['Pilote']).toBeUndefined()
  })

  it('clears perfInputs', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.perfInputs).toEqual({})
  })

  it('preserves other dossier fields (branches, notes, weatherInputs, etc.)', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.branches).toBe(baseDossier.branches)
    expect(result.notes).toBe('vol test')
    expect(result.perfRegulatory).toBe(1.15)
  })

  it('updates updatedAt', () => {
    const before = baseDossier.updatedAt
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.updatedAt).not.toBe(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- dossierTransforms
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/dossierTransforms.ts`**

```ts
import type { Aircraft, AircraftSnapshot, FlightDossier } from '../types'

export function applyAircraftChange(dossier: FlightDossier, newAircraft: Aircraft): FlightDossier {
  const snapshot: AircraftSnapshot = { ...newAircraft, snapshotAt: new Date().toISOString() }
  return {
    ...dossier,
    aircraft: snapshot,
    fuelInputs: Object.fromEntries(
      dossier.branches.map(b => [b.id, {
        ...dossier.fuelInputs[b.id],
        gsBase: newAircraft.characteristics.regimes[0].speed,
        windAdjust: 0,
      }])
    ),
    loading: Object.fromEntries(
      newAircraft.massBalance.stations.map(s => [s.name, 0])
    ),
    perfInputs: {},
    updatedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- dossierTransforms
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dossierTransforms.ts src/__tests__/lib/dossierTransforms.test.ts
git commit -m "feat: add applyAircraftChange transform with tests"
```

---

## Task 3: BranchesPanel overhaul (Vols + duration + inline point UX)

**Files:**
- Modify: `src/features/branches/BranchesPanel.tsx`
- Modify: `src/screens/DossierScreen.tsx:23-35`
- Modify: `src/__tests__/branches/BranchesPanel.test.tsx`

**Interfaces:**
- Consumes: `FlightPoint.notes?: string` from Task 1
- Produces: `BranchesPanel` now requires `aircraft: AircraftSnapshot` prop

- [ ] **Step 1: Update BranchesPanel tests**

Replace the entire `src/__tests__/branches/BranchesPanel.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('leaflet', () => {
  const Icon = class {
    constructor() {}
    static Default = {
      prototype: { _getIconUrl: undefined },
      mergeOptions: vi.fn(),
    }
  }
  return {
    default: { Icon, icon: vi.fn() },
    Icon,
  }
})

vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: '' }))

const mockDb = [
  { icao: 'LFPN', name: 'Toussus-le-Noble', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
]

vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
  getAerodrome: (icao: string) => mockDb.find(a => a.icao === icao),
}))

import { BranchesPanel } from '../../features/branches/BranchesPanel'
import type { AircraftSnapshot, FlightBranch } from '../../types'

const aircraftStub: AircraftSnapshot = {
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

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return {
    id: 'branch-1',
    label: 'Aller',
    points: [],
    distanceNm: 0,
    notes: '',
    ...overrides,
  }
}

describe('BranchesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders a branch tab with the branch label', () => {
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('Aller')).toBeInTheDocument()
    })

    it('renders multiple branch tabs', () => {
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller' }),
        makeBranch({ id: 'b2', label: 'Retour' }),
      ]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('Aller')).toBeInTheDocument()
      expect(screen.getByText('Retour')).toBeInTheDocument()
    })

    it('renders the map container', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })

    it('renders empty points message when branch has no points', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Aucun point/i)).toBeInTheDocument()
    })

    it('renders a point when branch has a point', () => {
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('LFPN')).toBeInTheDocument()
      expect(screen.getByText('Toussus-le-Noble')).toBeInTheDocument()
    })

    it('shows "custom" for an unresolved aerodrome identifier', () => {
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'ZZZZ', role: 'OVERFLY' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('custom')).toBeInTheDocument()
      expect(screen.queryByText(/non résolu/i)).not.toBeInTheDocument()
    })

    it('does not show delete vol button when there is only one branch', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.queryByText(/Supprimer vol/i)).not.toBeInTheDocument()
    })

    it('shows delete vol button when there are multiple branches', () => {
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller' }),
        makeBranch({ id: 'b2', label: 'Retour' }),
      ]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Supprimer vol/i)).toBeInTheDocument()
    })
  })

  describe('duration display', () => {
    it('shows calculated duration when distanceNm > 0 (108nm at 108kt = 1h00)', () => {
      render(<BranchesPanel branches={[makeBranch({ distanceNm: 108 })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('1h00')).toBeInTheDocument()
    })

    it('shows -- when distanceNm is 0', () => {
      render(<BranchesPanel branches={[makeBranch({ distanceNm: 0 })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('--')).toBeInTheDocument()
    })

    it('shows 0hMM format for durations under 1 hour (54nm at 108kt = 0h30)', () => {
      render(<BranchesPanel branches={[makeBranch({ distanceNm: 54 })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('0h30')).toBeInTheDocument()
    })
  })

  describe('adding a branch', () => {
    it('calls onUpdate with a new branch when + is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('+'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches).toHaveLength(2)
      expect(updatedBranches[1].label).toMatch(/Vol/)
    })
  })

  describe('deleting a branch', () => {
    it('calls onUpdate removing the branch when Supprimer vol is clicked', async () => {
      const onUpdate = vi.fn()
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller' }),
        makeBranch({ id: 'b2', label: 'Retour' }),
      ]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText(/Supprimer vol/i))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches).toHaveLength(1)
    })
  })

  describe('switching branch tabs', () => {
    it('switches active branch when a tab is clicked', async () => {
      const branches = [
        makeBranch({ id: 'b1', label: 'Aller', points: [] }),
        makeBranch({ id: 'b2', label: 'Retour', points: [
          { id: 'pt-1', type: 'AERODROME', identifier: 'LFPO', role: 'ARR' }
        ]}),
      ]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('Retour'))
      expect(screen.getByText('LFPO')).toBeInTheDocument()
    })
  })

  describe('updating distance', () => {
    it('calls onUpdate with updated distanceNm when distance is changed', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ distanceNm: 0 })]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '120' } })

      expect(onUpdate).toHaveBeenCalled()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches[0].distanceNm).toBe(120)
    })
  })

  describe('updating branch notes', () => {
    it('calls onUpdate with updated notes when notes textarea is changed', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ notes: '' })]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      fireEvent.change(screen.getByPlaceholderText(/Commentaires libres/i), { target: { value: 'Test note' } })

      expect(onUpdate).toHaveBeenCalled()
      const updatedBranches: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updatedBranches[0].notes).toBe('Test note')
    })
  })

  describe('point notes', () => {
    it('renders a notes input for each point', () => {
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByPlaceholderText('Notes...')).toBeInTheDocument()
    })

    it('calls onUpdate with updated point notes when notes input changes', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('Notes...'), { target: { value: 'Vérifier NOTAM' } })

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].notes).toBe('Vérifier NOTAM')
    })
  })

  describe('role cycling', () => {
    it('cycles point role DEP→ARR when badge is clicked', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('DEP'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].role).toBe('ARR')
    })

    it('cycles OVERFLY back to DEP', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'OVERFLY' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('OVFL'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].role).toBe('DEP')
    })
  })

  describe('AddPointModal', () => {
    it('opens AddPointModal when "+ Ajouter" is clicked', async () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      expect(screen.getByText(/Ajouter un point/i)).toBeInTheDocument()
    })

    it('closes the modal when clicking outside', async () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      const backdrop = screen.getByText(/Ajouter un point/i).closest('[class*="fixed"]')!
      fireEvent.click(backdrop)
      expect(screen.queryByText(/Ajouter un point/i)).not.toBeInTheDocument()
    })

    it('shows aerodrome suggestions when typing ICAO prefix', async () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFP')
      expect(screen.getByText('LFPN')).toBeInTheDocument()
    })

    it('adds a point when aerodrome is selected from suggestions', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFP')
      await userEvent.click(screen.getByText('LFPN'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points).toHaveLength(1)
      expect(updated[0].points[0].identifier).toBe('LFPN')
    })

    it('adds an unresolved point when using free identifier mode', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('+ Ajouter'))
      await userEvent.click(screen.getByText(/Ajouter sans résolution/i))
      await userEvent.type(screen.getByPlaceholderText(/Identifiant/i), 'VOR42')
      await userEvent.click(screen.getByText('Ajouter'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].identifier).toBe('VOR42')
    })
  })

  describe('point reordering', () => {
    const twoPointBranch = makeBranch({
      points: [
        { id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' },
        { id: 'pt-2', type: 'AERODROME', identifier: 'LFPO', role: 'ARR' },
      ],
    })

    it('moves a point down when ↓ is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[twoPointBranch]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getAllByText('↓')[0])

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].identifier).toBe('LFPO')
      expect(updated[0].points[1].identifier).toBe('LFPN')
    })

    it('moves a point up when ↑ is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[twoPointBranch]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getAllByText('↑')[1])

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points[0].identifier).toBe('LFPO')
      expect(updated[0].points[1].identifier).toBe('LFPN')
    })

    it('first point ↑ button is disabled', () => {
      render(<BranchesPanel branches={[twoPointBranch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getAllByText('↑')[0]).toBeDisabled()
    })

    it('last point ↓ button is disabled', () => {
      render(<BranchesPanel branches={[twoPointBranch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      const downButtons = screen.getAllByText('↓')
      expect(downButtons[downButtons.length - 1]).toBeDisabled()
    })
  })

  describe('point removal', () => {
    it('removes a point when ✕ is clicked', async () => {
      const onUpdate = vi.fn()
      const branch = makeBranch({
        points: [{ id: 'pt-1', type: 'AERODROME', identifier: 'LFPN', role: 'DEP' }],
      })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByText('✕'))

      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].points).toHaveLength(0)
    })
  })

  describe('label editing', () => {
    it('shows an input when double-clicking a tab label', async () => {
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)

      await userEvent.dblClick(screen.getByText('Aller'))
      expect(screen.getByDisplayValue('Aller')).toBeInTheDocument()
    })

    it('calls onUpdate with the new label on blur', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={onUpdate} />)

      await userEvent.dblClick(screen.getByText('Aller'))
      const input = screen.getByDisplayValue('Aller')
      await userEvent.clear(input)
      await userEvent.type(input, 'Retour')
      fireEvent.blur(input)

      expect(onUpdate).toHaveBeenCalled()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].label).toBe('Retour')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- BranchesPanel
```

Expected: multiple FAIL — aircraft prop missing, "non résolu" not "custom", "Supprimer branche" not "Supprimer vol", "Étape" not "Vol", no duration, no point notes, no role cycling.

- [ ] **Step 3: Implement changes in `src/features/branches/BranchesPanel.tsx`**

**3a.** Add imports at top of file (after existing imports):

```ts
import type { AircraftSnapshot, FlightPointRole } from '../../types'
```

**3b.** Add helper functions after the `ROLE_COLORS` constant (around line 38):

```ts
function formatDuration(distanceNm: number, speedKt: number): string {
  if (distanceNm <= 0) return '--'
  const totalMin = Math.round((distanceNm / speedKt) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

const ROLE_CYCLE: FlightPointRole[] = ['DEP', 'ARR', 'DIVERT', 'OVERFLY']
function cycleRole(role: FlightPointRole): FlightPointRole {
  return ROLE_CYCLE[(ROLE_CYCLE.indexOf(role) + 1) % ROLE_CYCLE.length]
}
```

**3c.** Update `BranchViewProps` (around line 131):

```ts
interface BranchViewProps {
  branch: FlightBranch
  isOnly: boolean
  speedKt: number
  onChange: (branch: FlightBranch) => void
  onDelete: () => void
}

function BranchView({ branch, isOnly, speedKt, onChange, onDelete }: BranchViewProps) {
```

**3d.** In the distance section of `BranchView` (replace the `{/* Distance */}` block, around line 193–211):

```tsx
{/* Distance */}
<div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-chrome)]">
  <div className="flex items-center gap-3">
    <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Distance totale</label>
    <input
      type="number"
      value={branch.distanceNm || ''}
      placeholder="0"
      onChange={e => onChange({ ...branch, distanceNm: Number(e.target.value) })}
      className="w-24 text-right font-mono text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
    />
    <span className="text-xs text-[var(--text-dim)]">nm</span>
    <span className="font-mono text-xs text-[var(--text-dim)]">{formatDuration(branch.distanceNm, speedKt)}</span>
    {!isOnly && (
      <Button variant="danger" size="sm" className="ml-auto" onClick={onDelete}>
        Supprimer vol
      </Button>
    )}
  </div>
</div>
```

**3e.** In the point Card (replace the `{resolved.map(...)}` block, around line 226–255):

```tsx
{resolved.map(({ pt, aero }, idx) => (
  <Card key={pt.id} padding="sm">
    <div className="flex gap-3 items-center">
      <Badge
        variant="neutral"
        style={{ backgroundColor: ROLE_COLORS[pt.role], color: 'white', minWidth: '3rem', textAlign: 'center', cursor: 'pointer' }}
        onClick={() => onChange({ ...branch, points: branch.points.map(p => p.id === pt.id ? { ...p, role: cycleRole(p.role) } : p) })}
      >
        {ROLE_LABELS[pt.role]}
      </Badge>
      <span className="font-mono text-[var(--amber)] text-sm">{pt.identifier}</span>
      <span className="flex-1 text-sm text-[var(--text-2)] truncate">
        {aero ? aero.name : <span className="text-[var(--text-dim)]">custom</span>}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => movePoint(pt.id, -1)}
          disabled={idx === 0}
          className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1"
        >↑</button>
        <button
          onClick={() => movePoint(pt.id, 1)}
          disabled={idx === branch.points.length - 1}
          className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1"
        >↓</button>
        <button
          onClick={() => removePoint(pt.id)}
          className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm px-1"
        >✕</button>
      </div>
    </div>
    <input
      type="text"
      value={pt.notes ?? ''}
      onChange={e => onChange({ ...branch, points: branch.points.map(p => p.id === pt.id ? { ...p, notes: e.target.value } : p) })}
      placeholder="Notes..."
      className="mt-1 w-full text-xs bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text-2)] focus:border-[var(--amber)] focus:outline-none"
    />
  </Card>
))}
```

**3f.** Update `Props` interface and `BranchesPanel` component (around line 275):

```ts
interface Props {
  branches: FlightBranch[]
  aircraft: AircraftSnapshot
  onUpdate: (branches: FlightBranch[]) => void
}

export function BranchesPanel({ branches, aircraft, onUpdate }: Props) {
  const speedKt = aircraft.characteristics.regimes[0].speed
  ...
```

**3g.** In `addBranch` (around line 285), change the label:

```ts
label: `Vol ${branches.length + 1}`,
```

**3h.** In `BranchView` render call (around line 351), add `speedKt`:

```tsx
<BranchView
  branch={activeBranch}
  isOnly={branches.length === 1}
  speedKt={speedKt}
  onChange={updateBranch}
  onDelete={() => deleteBranch(activeBranch.id)}
/>
```

- [ ] **Step 4: Update the "Branches" tab label in `src/components/AppChrome.tsx`**

Replace:
```ts
{ key: 'branches', label: 'Branches' },
```
With:
```ts
{ key: 'branches', label: 'Vols' },
```

- [ ] **Step 5: Pass `aircraft` to `BranchesPanel` in `src/screens/DossierScreen.tsx`**

Replace the `<BranchesPanel` call (lines 23–35):

```tsx
{activeTab === 'branches' && (
  <BranchesPanel
    branches={dossier.branches}
    aircraft={dossier.aircraft}
    onUpdate={(branches: FlightBranch[]) => {
      const speed = dossier.aircraft.characteristics.regimes[0].speed
      const defaultFuel: FuelInputs = { gsBase: speed, windAdjust: 0, roulage: 10, marge: 10, extras: [], reserveMin: 30, derouteMin: 30, plein: false }
      const synced: Record<string, FuelInputs> = {}
      for (const b of branches) {
        synced[b.id] = dossier.fuelInputs[b.id] ?? { ...defaultFuel }
      }
      update({ branches, fuelInputs: synced })
    }}
  />
)}
```

- [ ] **Step 6: Run all tests to verify they pass**

```
npm test -- BranchesPanel
```

Expected: all tests PASS.

- [ ] **Step 7: Run full test suite**

```
npm test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/branches/BranchesPanel.tsx src/screens/DossierScreen.tsx src/components/AppChrome.tsx src/__tests__/branches/BranchesPanel.test.tsx
git commit -m "feat: rename Branches→Vols, add duration display, inline point notes and role cycling"
```

---

## Task 4: AppChrome — inline dossier name editing

**Files:**
- Modify: `src/components/AppChrome.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `AppChrome` new prop `onUpdateName?: (name: string) => void`

> Note: No test file for AppChrome exists. Verify visually in the browser after this task.

- [ ] **Step 1: Add `useState` import and new props to `src/components/AppChrome.tsx`**

Replace the existing imports at the top:

```ts
import { useState } from 'react'
import type { FlightDossier, DossierTab, Screen } from '../types'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'
```

Update the `AppChromeProps` interface:

```ts
interface AppChromeProps {
  screen: Screen
  dossier: FlightDossier | null
  dossierTab: DossierTab
  onGoHome: () => void
  onSetTab: (tab: DossierTab) => void
  onDownload?: () => void
  onUpdateName?: (name: string) => void
}
```

- [ ] **Step 2: Add inline name editing state and handlers inside `AppChrome`**

Inside `AppChrome` function body, before the `return`:

```ts
const [editingName, setEditingName] = useState(false)
const [nameValue, setNameValue] = useState('')

const handleNameClick = () => {
  if (!dossier || !onUpdateName) return
  setNameValue(dossier.name)
  setEditingName(true)
}

const handleNameConfirm = () => {
  if (nameValue.trim()) onUpdateName?.(nameValue.trim())
  setEditingName(false)
}

const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') handleNameConfirm()
  if (e.key === 'Escape') setEditingName(false)
}
```

- [ ] **Step 3: Replace the dossier name display in the top bar**

Replace the `{dossier && (...)}` block:

```tsx
{dossier && (
  <>
    <span className="text-[var(--text-dim)] text-sm">·</span>
    {editingName ? (
      <input
        autoFocus
        value={nameValue}
        onChange={e => setNameValue(e.target.value)}
        onBlur={handleNameConfirm}
        onKeyDown={handleNameKeyDown}
        className="text-sm bg-transparent border-b border-[var(--amber)] text-[var(--text-2)] focus:outline-none flex-1 min-w-0"
      />
    ) : (
      <span
        className={`text-[var(--text-2)] text-sm truncate flex-1 ${onUpdateName ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
        onClick={handleNameClick}
        title={onUpdateName ? 'Cliquer pour renommer' : undefined}
      >
        {dossier.name}
      </span>
    )}
    <span className="text-[var(--text-dim)] text-xs">{dossier.date}</span>
  </>
)}
```

- [ ] **Step 4: Wire `onUpdateName` in `src/App.tsx`**

In the `<AppChrome>` render (around line 68), add the new prop:

```tsx
<AppChrome
  screen={state.screen}
  dossier={state.dossier}
  dossierTab={state.dossierTab}
  onGoHome={() => dispatch({ type: 'GO_HOME' })}
  onSetTab={(tab) => dispatch({ type: 'SET_TAB', tab })}
  onDownload={state.dossier ? () => {
    import('./lib/storage').then(({ downloadDossier }) => downloadDossier(state.dossier!))
  } : undefined}
  onUpdateName={state.dossier ? (name) => {
    dispatch({ type: 'UPDATE_DOSSIER', dossier: { ...state.dossier!, name, updatedAt: new Date().toISOString() } })
  } : undefined}
/>
```

- [ ] **Step 5: Run full test suite**

```
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Verify visually**

Start dev server (`npm run dev`), open a dossier, click the dossier name in the header. Verify: it becomes an input, Enter saves, Escape cancels, the new name persists and appears in the JSON download.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppChrome.tsx src/App.tsx
git commit -m "feat: inline dossier name editing in AppChrome"
```

---

## Task 5: AppChrome — aircraft change modal + App.tsx wiring

**Files:**
- Modify: `src/components/AppChrome.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `applyAircraftChange` from Task 2 (`src/lib/dossierTransforms.ts`)
- Produces: `AppChrome` new props `onChangeAircraft?: (newAircraftId: string) => void`

- [ ] **Step 1: Add `useMemo` import and new types to `src/components/AppChrome.tsx`**

Replace the imports:

```ts
import { useState, useMemo } from 'react'
import type { Aircraft, FlightDossier, DossierTab, Screen } from '../types'
import { listAircraft } from '../lib/storage'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'
```

Add `onChangeAircraft` to `AppChromeProps`:

```ts
interface AppChromeProps {
  screen: Screen
  dossier: FlightDossier | null
  dossierTab: DossierTab
  onGoHome: () => void
  onSetTab: (tab: DossierTab) => void
  onDownload?: () => void
  onUpdateName?: (name: string) => void
  onChangeAircraft?: (newAircraftId: string) => void
}
```

- [ ] **Step 2: Add `ChangeAircraftModal` component in `src/components/AppChrome.tsx`**

Add this function component just before the `AppChrome` function:

```tsx
function ChangeAircraftModal({ currentAircraftId, onConfirm, onClose }: {
  currentAircraftId: string
  onConfirm: (id: string) => void
  onClose: () => void
}) {
  const [pending, setPending] = useState<Aircraft | null>(null)
  const fleet = useMemo(() => listAircraft().filter(a => a.id !== currentAircraftId), [currentAircraftId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {pending ? (
          <>
            <p className="text-sm text-[var(--text-1)] mb-4">
              Changer l'avion pour <strong>{pending.name}</strong> ? Les données carburant (GS de base), masse &amp; centrage et performances seront réinitialisées.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Annuler</Button>
              <Button variant="danger" size="sm" onClick={() => { onConfirm(pending.id); onClose() }}>Confirmer</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Changer d'avion</h3>
            {fleet.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Aucun autre avion dans la flotte.</p>
            ) : (
              <div className="space-y-1">
                {fleet.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setPending(a)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[var(--bg-inset)] transition-colors"
                  >
                    <div className="text-sm font-medium text-[var(--text-1)]">{a.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{a.registration}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add modal state and aircraft display in `AppChrome`**

Add to the state declarations (after existing `editingName` state):

```ts
const [showChangeModal, setShowChangeModal] = useState(false)
```

In the top bar, after the name span and date, add the aircraft name + button. Replace the `{dossier && (...)}` block with:

```tsx
{dossier && (
  <>
    <span className="text-[var(--text-dim)] text-sm">·</span>
    {editingName ? (
      <input
        autoFocus
        value={nameValue}
        onChange={e => setNameValue(e.target.value)}
        onBlur={handleNameConfirm}
        onKeyDown={handleNameKeyDown}
        className="text-sm bg-transparent border-b border-[var(--amber)] text-[var(--text-2)] focus:outline-none flex-1 min-w-0"
      />
    ) : (
      <span
        className={`text-[var(--text-2)] text-sm truncate ${onUpdateName ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
        onClick={handleNameClick}
        title={onUpdateName ? 'Cliquer pour renommer' : undefined}
      >
        {dossier.name}
      </span>
    )}
    <span className="text-[var(--text-dim)] text-xs shrink-0">{dossier.aircraft.name}</span>
    {onChangeAircraft && (
      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setShowChangeModal(true)}>
        Changer
      </Button>
    )}
    <span className="text-[var(--text-dim)] text-xs shrink-0">{dossier.date}</span>
  </>
)}
```

At the bottom of the `AppChrome` return, before the closing `</header>`, add the modal:

```tsx
{showChangeModal && dossier && onChangeAircraft && (
  <ChangeAircraftModal
    currentAircraftId={dossier.aircraft.id}
    onConfirm={onChangeAircraft}
    onClose={() => setShowChangeModal(false)}
  />
)}
```

- [ ] **Step 4: Wire `onChangeAircraft` in `src/App.tsx`**

Update the storage import to add `getAircraft`, and add the transforms import:

```ts
import { duplicateAircraft, getAircraft } from './lib/storage'
import { applyAircraftChange } from './lib/dossierTransforms'
```

In the `<AppChrome>` render, add:

```tsx
onChangeAircraft={state.dossier ? (newAircraftId) => {
  const newAircraft = getAircraft(newAircraftId)
  if (!newAircraft || !state.dossier) return
  dispatch({ type: 'UPDATE_DOSSIER', dossier: applyAircraftChange(state.dossier, newAircraft) })
} : undefined}
```

- [ ] **Step 5: Run full test suite**

```
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Verify visually**

Start dev server (`npm run dev`). Open a dossier that has at least 2 aircraft in the fleet (create a second aircraft first if needed).

Verify the following:
1. Aircraft name appears in the header next to the dossier name.
2. "Changer" button is visible.
3. Clicking "Changer" opens the modal listing other aircraft.
4. Clicking an aircraft shows the confirmation message with the aircraft name.
5. "Annuler" in the confirmation step goes back to the fleet list.
6. "Confirmer" closes the modal and updates the aircraft name in the header.
7. Switching to the "Carbu" tab shows the new aircraft's speed as gsBase.
8. The "M&C" tab shows reset station values.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppChrome.tsx src/App.tsx src/lib/dossierTransforms.ts
git commit -m "feat: change aircraft in dossier with reset confirmation modal"
```
