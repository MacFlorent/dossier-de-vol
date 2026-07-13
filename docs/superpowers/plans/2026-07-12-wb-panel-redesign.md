# Refonte de la page M&C (Masse et Centrage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the M&C panel (`WBPanel.tsx`) to match Carbu/Vols layout conventions, replace the buggy Departure/Arrival envelope points with Zero-fuel/Current/Full-fuel points, add labeled/gridded axes to the envelope graph, and introduce a mandatory per-station fuel capacity to support the full-fuel calculation.

**Architecture:** A new `capacityL` field on `WeightStation` (mandatory, replacing the global `AircraftCharacteristics.fuelCapacity`) flows through a shared `totalFuelCapacity()` helper to every consumer, and through direct per-station reads in the redesigned W&B envelope graph. `WBPanel.tsx` is restructured to full-width stacked cards (matching `FuelPanel`/`BranchesPanel`), with a custom-SVG envelope graph rebuilt to show gridlines, labeled axes, and three loading points (Sans carburant / Actuel / Plein carburant) connected by a fuel-burn trajectory line.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Vitest + Testing Library, Tailwind v4, plain SVG (no charting library — see spec §4).

## Global Constraints

- No new runtime dependencies (spec decision: stay on plain SVG, no charting library).
- `capacityL` on `WeightStation` is mandatory in the type; existing saved data is migrated defensively (no schema version, missing-field detection — matches the existing pattern in `src/lib/storage.ts`).
- `AircraftCharacteristics.fuelCapacity` is fully removed (not deprecated/kept for compatibility).
- Every task must leave `npx vitest run` and `npx tsc -b --noEmit` clean for the files it touches; Task 5 is the checkpoint where the **whole** repo compiles again after the type change.
- Follow existing code conventions exactly: CSS variables (`var(--blue)`, `var(--green)`, `var(--amber)`, `var(--red)`, `var(--text-1)`, `var(--text-dim)`, `var(--text-muted)`, `var(--text-2)`, `var(--bg-card)`, `var(--bg-inset)`, `var(--border)`), `Card`/`Badge` components, French UI copy.

---

## Task 1: Data model — `capacityL` per fuel station + `totalFuelCapacity()`

**Files:**
- Modify: `src/types/index.ts:3-7,31-34`
- Modify: `src/lib/aviation/wbCalc.ts`
- Test: `src/__tests__/aviation/wbCalc.test.ts`

**Interfaces:**
- Produces: `WeightStation.capacityL: number` (new required field), `AircraftCharacteristics` without `fuelCapacity`, `totalFuelCapacity(massBalance: AircraftMassBalance): number` exported from `src/lib/aviation/wbCalc.ts`.

- [ ] **Step 1: Update the type definitions**

In `src/types/index.ts`, replace:

```ts
export interface WeightStation {
  name: string
  arm: number   // mm depuis le datum
  kind: 'dry' | 'fuel'
}
```

with:

```ts
export interface WeightStation {
  name: string
  arm: number   // mm depuis le datum
  kind: 'dry' | 'fuel'
  capacityL: number   // capacité utilisable, pertinent seulement si kind === 'fuel'
}
```

And replace:

```ts
export interface AircraftCharacteristics {
  regimes: CruiseRegime[]  // premier = régime par défaut du navlog
  fuelCapacity: number     // L utilisables
}
```

with:

```ts
export interface AircraftCharacteristics {
  regimes: CruiseRegime[]  // premier = régime par défaut du navlog
}
```

- [ ] **Step 2: Write the failing test for `totalFuelCapacity`**

Add to `src/__tests__/aviation/wbCalc.test.ts` (new `import` alongside the existing `computeWB` import, and a new `describe` block after the existing one):

```ts
import { computeWB, totalFuelCapacity } from '../../lib/aviation/wbCalc'
```

```ts
describe('totalFuelCapacity', () => {
  it('sums capacityL across all fuel stations', () => {
    const mb: AircraftMassBalance = {
      emptyWeight: 615, emptyArm: 345,
      stations: [
        { name: 'Pilote', arm: 375, kind: 'dry', capacityL: 0 },
        { name: 'Avant', arm: 100, kind: 'fuel', capacityL: 80 },
        { name: 'Arrière', arm: 1120, kind: 'fuel', capacityL: 110 },
      ],
      envelopePoints: [],
    }
    expect(totalFuelCapacity(mb)).toBe(190)
  })

  it('returns 0 when there are no fuel stations', () => {
    const mb: AircraftMassBalance = {
      emptyWeight: 615, emptyArm: 345,
      stations: [{ name: 'Pilote', arm: 375, kind: 'dry', capacityL: 0 }],
      envelopePoints: [],
    }
    expect(totalFuelCapacity(mb)).toBe(0)
  })
})
```

Also add `capacityL: 0` to the existing `massBalance.stations` fixture at the top of the file (the two `dry`/one `fuel` stations, lines 7-11) so the file still compiles:

```ts
const massBalance: AircraftMassBalance = {
  emptyWeight: 615,
  emptyArm: 345,
  stations: [
    { name: 'Pilote', arm: 375, kind: 'dry' as const, capacityL: 0 },
    { name: 'Passager', arm: 505, kind: 'dry' as const, capacityL: 0 },
    { name: 'Carburant', arm: 350, kind: 'fuel' as const, capacityL: 100 },
  ],
  envelopePoints: [
    [615, 295], [615, 430], [880, 430], [1000, 425], [1000, 360], [880, 295],
  ] as [number, number][],
}
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aviation/wbCalc.test.ts`
Expected: FAIL — `totalFuelCapacity is not exported` (or a TS error) since the function doesn't exist yet.

- [ ] **Step 3: Implement `totalFuelCapacity`**

In `src/lib/aviation/wbCalc.ts`, add after the existing `computeWB` export (before `pointInPolygon`):

```ts
export function totalFuelCapacity(massBalance: AircraftMassBalance): number {
  return massBalance.stations
    .filter(s => s.kind === 'fuel')
    .reduce((sum, s) => sum + s.capacityL, 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/aviation/wbCalc.test.ts`
Expected: PASS (all tests, including the pre-existing `computeWB` ones, still green).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/aviation/wbCalc.ts src/__tests__/aviation/wbCalc.test.ts
git commit -m "feat(wb): add per-station fuel capacity, remove global fuelCapacity"
```

Note: this commit intentionally leaves the rest of the repo non-compiling (every other file still referencing `characteristics.fuelCapacity` or constructing a `WeightStation` without `capacityL`). Tasks 2-5 fix every remaining site; Task 5 is the checkpoint where `npx tsc -b --noEmit` is clean again.

---

## Task 2: Storage migration — legacy `fuelCapacity` → per-station `capacityL`

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/__tests__/lib/storage.test.ts`
- Modify: `src/__tests__/lib/storage.migration.test.ts`

**Interfaces:**
- Consumes: `WeightStation.capacityL`, `AircraftCharacteristics` (Task 1).
- Produces: private `migrateAircraftFuelCapacity(ac: Aircraft): void` in `src/lib/storage.ts`, called from both `getAircraft()` and `migrateDossier()`.

- [ ] **Step 1: Fix the existing `makeAircraft` fixture in `storage.test.ts`**

In `src/__tests__/lib/storage.test.ts`, replace the `characteristics`/`massBalance` fields of `makeAircraft`:

```ts
const makeAircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  id: 'test-id-1',
  name: 'DR221',
  registration: 'F-BPCT',
  characteristics: {
    regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }],
  },
  massBalance: {
    emptyWeight: 615,
    emptyArm: 345,
    stations: [],
    envelopePoints: [],
  },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
  ...overrides,
})
```

(Only the `characteristics` field changes — `fuelCapacity: 116` is removed.)

- [ ] **Step 2: Write the failing migration tests**

Add to `src/__tests__/lib/storage.test.ts`, after the closing of the `describe('duplicateAircraft', ...)` block:

```ts
import { getAircraft } from '../../lib/storage'
```

(add `getAircraft` to the existing `import { importFleet, duplicateAircraft, saveAircraft, listAircraft } from '../../lib/storage'` line instead of a new import line)

```ts
describe('getAircraft — fuelCapacity migration', () => {
  afterEach(() => localStorage.clear())

  it('splits a legacy global fuelCapacity evenly across fuel stations without capacityL', () => {
    const legacy = {
      id: 'legacy-1', name: 'DR221', registration: 'F-BPCT',
      characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 190 },
      massBalance: {
        emptyWeight: 615, emptyArm: 345,
        stations: [
          { name: 'Avant', arm: 100, kind: 'fuel' },
          { name: 'Arrière', arm: 1120, kind: 'fuel' },
        ],
        envelopePoints: [],
      },
      performance: {
        toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
        ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
      },
    }
    saveAircraft(legacy as unknown as Aircraft)

    const migrated = getAircraft('legacy-1')!

    expect(migrated.massBalance.stations[0].capacityL).toBe(95)
    expect(migrated.massBalance.stations[1].capacityL).toBe(95)
    expect((migrated.characteristics as { fuelCapacity?: number }).fuelCapacity).toBeUndefined()
  })

  it('leaves an aircraft that already has capacityL unchanged', () => {
    const modern = makeAircraft({
      id: 'modern-1',
      massBalance: {
        emptyWeight: 615, emptyArm: 345,
        stations: [{ name: 'Carburant', arm: 350, kind: 'fuel', capacityL: 116 }],
        envelopePoints: [],
      },
    })
    saveAircraft(modern)

    const result = getAircraft('modern-1')!

    expect(result.massBalance.stations[0].capacityL).toBe(116)
  })
})
```

- [ ] **Step 2b: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/storage.test.ts`
Expected: FAIL on the first new test — `migrated.massBalance.stations[0].capacityL` is `undefined`, not `95` (migration doesn't exist yet).

- [ ] **Step 3: Implement the migration in `storage.ts`**

In `src/lib/storage.ts`, change the import line:

```ts
import type { Aircraft, AircraftMassBalance, FlightDossier, WeightStation } from '../types'
```

Add this private helper after the constants, before `listAircraft`:

```ts
function migrateAircraftFuelCapacity(ac: Aircraft): void {
  const legacyCapacity = (ac.characteristics as { fuelCapacity?: number }).fuelCapacity
  if (legacyCapacity === undefined) return
  const fuelStations = ac.massBalance.stations.filter(s => s.kind === 'fuel')
  const each = fuelStations.length > 0 ? legacyCapacity / fuelStations.length : 0
  ac.massBalance.stations = ac.massBalance.stations.map(s =>
    s.kind === 'fuel' && (s as WeightStation & { capacityL?: number }).capacityL === undefined
      ? { ...s, capacityL: each }
      : s
  )
  delete (ac.characteristics as { fuelCapacity?: number }).fuelCapacity
}
```

In `getAircraft()`, add the migration call at the end of the `if (ac.massBalance) { ... }` block (after the `ias → speed` migration, before the closing brace):

```ts
    // Migrate: fuelCapacity (global) → capacityL per fuel station
    migrateAircraftFuelCapacity(ac)
  }
  return ac
}
```

In `migrateDossier()`, add this block right before `// Remove legacy fields`:

```ts
  // Migrate legacy embedded aircraft snapshot: fuelCapacity (global) → capacityL per fuel station
  if (data.aircraft) {
    migrateAircraftFuelCapacity(data.aircraft as Aircraft)
  }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/storage.test.ts`
Expected: PASS (all tests, including pre-existing `importFleet`/`duplicateAircraft` ones).

- [ ] **Step 5: Fix the shared fixtures in `storage.migration.test.ts` and add the embedded-aircraft migration test**

In `src/__tests__/lib/storage.migration.test.ts`, change the module-level `aircraftStub`:

```ts
const aircraftStub = {
  id: 'ac-1',
  name: 'DR221',
  registration: 'F-BPCT',
  snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }] },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}
```

(only `fuelCapacity: 116` is removed from `characteristics`)

Add this new `describe` block at the end of the file, before the final closing (after the `describe('modern dossier with branches already present', ...)` block):

```ts
describe('legacy aircraft snapshot embedded in an imported dossier', () => {
  it('migrates fuelCapacity to per-station capacityL on the embedded aircraft', () => {
    const legacyAircraft = {
      ...aircraftStub,
      characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 116 },
      massBalance: {
        emptyWeight: 615, emptyArm: 345,
        stations: [{ name: 'Carburant', arm: 350, kind: 'fuel' as const }],
        envelopePoints: [],
      },
    }
    const old = { ...baseDossierFields, aircraft: legacyAircraft, branches: [], fuelInputs: {} }

    const result = migrateDossier(old)

    expect(result.aircraft.massBalance.stations[0].capacityL).toBe(116)
    expect((result.aircraft.characteristics as { fuelCapacity?: number }).fuelCapacity).toBeUndefined()
  })
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/storage.migration.test.ts`
Expected: PASS (all tests, including the 5 pre-existing ones).

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage.ts src/__tests__/lib/storage.test.ts src/__tests__/lib/storage.migration.test.ts
git commit -m "feat(storage): migrate legacy global fuelCapacity to per-station capacityL"
```

---

## Task 3: Resource templates — dr48 / dr221 / dr42

**Files:**
- Modify: `resources/dr48.json`
- Modify: `resources/dr221.json`
- Modify: `resources/dr42.json`
- Modify: `src/__tests__/lib/templates.test.ts`

**Interfaces:**
- Consumes: `WeightStation.capacityL` (Task 1). These files are loaded directly as typed `Aircraft` via `import.meta.glob` (`src/lib/templates/index.ts`) — they bypass `storage.ts` migrations entirely, so they must be hand-updated.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/lib/templates.test.ts`, inside the existing `describe('TEMPLATES — autodiscovery', ...)` block, after the `'each template has key, label, and template fields'` test:

```ts
  it('every fuel station has a positive capacityL, and no template has a legacy global fuelCapacity', () => {
    for (const t of TEMPLATES) {
      expect((t.template.characteristics as { fuelCapacity?: number }).fuelCapacity).toBeUndefined()
      for (const station of t.template.massBalance.stations) {
        if (station.kind === 'fuel') {
          expect(station.capacityL).toBeGreaterThan(0)
        }
      }
    }
  })
```

- [ ] **Step 1b: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/templates.test.ts`
Expected: FAIL — `station.capacityL` is `undefined` for the fuel stations in dr48/dr221/dr42 (`toBeGreaterThan` fails on `undefined`).

- [ ] **Step 2: Update `resources/dr48.json`**

Remove `"fuelCapacity": 190,` from `characteristics` (leaving the `regimes` array's closing bracket followed directly by the closing brace of `characteristics`). Add `"capacityL": 80` to the "Essence Avant (80L max)" station and `"capacityL": 110` to the "Essence Arrière (110L max)" station:

```json
      {
        "name": "Essence Avant (80L max)",
        "arm": 100,
        "kind": "fuel",
        "capacityL": 80
      },
      {
        "name": "Essence Arrière (110L max)",
        "arm": 1120,
        "kind": "fuel",
        "capacityL": 110
      }
```

- [ ] **Step 3: Update `resources/dr221.json`**

Change:

```json
    "regimes": [
      { "label": "75% puissance", "speed": 115, "fuelBurn": 25 }
    ],
    "fuelCapacity": 110
```

to:

```json
    "regimes": [
      { "label": "75% puissance", "speed": 115, "fuelBurn": 25 }
    ]
```

Change:

```json
      { "name": "Carburant", "arm": 1120, "kind": "fuel" }
```

to:

```json
      { "name": "Carburant", "arm": 1120, "kind": "fuel", "capacityL": 110 }
```

- [ ] **Step 4: Update `resources/dr42.json`**

Remove `"fuelCapacity": 110,` from `characteristics`. Change the "Essence" station:

```json
      {
        "name": "Essence",
        "arm": 1120,
        "kind": "fuel"
      }
```

to:

```json
      {
        "name": "Essence",
        "arm": 1120,
        "kind": "fuel",
        "capacityL": 110
      }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/templates.test.ts`
Expected: PASS (all tests, including the 4 pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add resources/dr48.json resources/dr221.json resources/dr42.json src/__tests__/lib/templates.test.ts
git commit -m "feat(templates): add per-station fuel capacity to aircraft templates"
```

---

## Task 4: Aircraft editor — per-station capacity field

**Files:**
- Modify: `src/screens/AircraftEditorScreen.tsx`
- Test: `src/__tests__/screens/AircraftEditorScreen.test.tsx` (new)

**Interfaces:**
- Consumes: `WeightStation.capacityL` (Task 1), `totalFuelCapacity` (Task 1, for the read-only total display).
- Produces: no new exports — internal UI change only.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/screens/AircraftEditorScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AircraftEditorScreen } from '../../screens/AircraftEditorScreen'
import { listAircraft } from '../../lib/storage'

afterEach(() => localStorage.clear())

describe('AircraftEditorScreen — per-station fuel capacity', () => {
  it('does not render a global "Capacité carburant" field anymore', () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByLabelText(/Capacité carburant/i)).not.toBeInTheDocument()
  })

  it('shows a capacity input only for fuel-kind stations', async () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('+ Ajouter station'))

    expect(screen.queryByLabelText('Capacité (L)')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox'), 'fuel')

    expect(screen.getByLabelText('Capacité (L)')).toBeInTheDocument()
  })

  it('defaults a new fuel station capacity to 0', async () => {
    render(<AircraftEditorScreen editingAircraftId={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('+ Ajouter station'))
    await userEvent.selectOptions(screen.getByRole('combobox'), 'fuel')

    expect(screen.getByLabelText('Capacité (L)')).toHaveValue(0)
  })

  it('saves the edited capacityL when loading from the DR221 template', async () => {
    const onSave = vi.fn()
    render(<AircraftEditorScreen editingAircraftId={null} onSave={onSave} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByText('Depuis modèle : DR221'))

    const capacityInput = screen.getByLabelText('Capacité (L)')
    await userEvent.clear(capacityInput)
    await userEvent.type(capacityInput, '95')

    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }))

    const saved = listAircraft().find(a => a.name === 'DR221')!
    const fuelStation = saved.massBalance.stations.find(s => s.kind === 'fuel')!
    expect(fuelStation.capacityL).toBe(95)
    expect((saved.characteristics as { fuelCapacity?: number }).fuelCapacity).toBeUndefined()
  })
})
```

- [ ] **Step 1b: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/screens/AircraftEditorScreen.test.tsx`
Expected: FAIL — several tests fail (`Capacité (L)` label doesn't exist yet; the "Capacité carburant" global field still renders).

- [ ] **Step 2: Remove the global capacity field and state**

In `src/screens/AircraftEditorScreen.tsx`, remove line 159:

```ts
  const [fuelCapacity, setFuelCapacity] = useState(116)
```

In `applyAircraft`, remove line 189:

```ts
    setFuelCapacity(ac.characteristics.fuelCapacity)
```

In `handleSave`, change:

```ts
      characteristics: { regimes, fuelCapacity },
```

to:

```ts
      characteristics: { regimes },
```

and remove `fuelCapacity` from the `useCallback` dependency array (the line `regimes, fuelCapacity,` becomes `regimes,`).

Remove the entire JSX block (lines 392-399):

```tsx
          <div className="mt-4 max-w-xs">
            <Input
              label="Capacité carburant (L)"
              type="number"
              value={fuelCapacity}
              onChange={e => setFuelCapacity(Number(e.target.value))}
            />
          </div>
```

- [ ] **Step 3: Add the capacity column to the stations table**

Import `totalFuelCapacity` at the top:

```ts
import { totalFuelCapacity } from '../lib/aviation/wbCalc'
```

Update `addStation` to include `capacityL`:

```ts
  const addStation = useCallback(() => {
    setStations(prev => [...prev, { name: '', arm: 0, kind: 'dry' as const, capacityL: 0 }])
  }, [])
```

Update `updateStation` to handle the new field:

```ts
  const updateStation = useCallback((idx: number, field: keyof WeightStation, value: string | number) => {
    setStations(prev => prev.map((s, i) => {
      if (i !== idx) return s
      if (field === 'kind') return { ...s, kind: value as 'dry' | 'fuel' }
      if (field === 'arm') return { ...s, arm: Number(value) }
      if (field === 'capacityL') return { ...s, capacityL: Number(value) }
      return { ...s, name: String(value) }
    }))
  }, [])
```

Replace the stations table header (lines 431-436):

```tsx
                    <tr className="text-xs text-[var(--text-dim)] text-left">
                      <th className="pb-1 pr-3 font-medium">Nom</th>
                      <th className="pb-1 pr-3 font-medium">Bras (mm)</th>
                      <th className="pb-1 pr-3 font-medium">Type</th>
                      <th className="pb-1 pr-3 font-medium">Capacité (L)</th>
                      <th className="pb-1 font-medium"></th>
                    </tr>
```

Add a capacity cell in the row body, between the "Type" `<td>` and the delete-button `<td>` (after line 465, before line 466's `<td className="py-1.5">` delete button):

```tsx
                        <td className="py-1.5 pr-3">
                          {s.kind === 'fuel' && (
                            <input
                              id={`station-capacity-${idx}`}
                              type="number"
                              aria-label="Capacité (L)"
                              className="w-24 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                              value={s.capacityL}
                              onChange={e => updateStation(idx, 'capacityL', Number(e.target.value))}
                            />
                          )}
                        </td>
```

Below the stations table (after the `+ Ajouter station` button, before the closing `</div>` of the "Stations de chargement" block), add a read-only total:

```tsx
            <p className="text-xs text-[var(--text-dim)] mt-2">
              Capacité totale : {totalFuelCapacity({ emptyWeight, emptyArm, stations, envelopePoints: [] })} L
            </p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/screens/AircraftEditorScreen.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/screens/AircraftEditorScreen.tsx src/__tests__/screens/AircraftEditorScreen.test.tsx
git commit -m "feat(aircraft-editor): edit fuel capacity per station instead of globally"
```

---

## Task 5: Propagate `totalFuelCapacity` to all consumers (full repo compiles again)

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx:1-24`
- Modify: `src/features/dossier/DossierPanel.tsx:1-2,199`
- Modify: `src/screens/HomeScreen.tsx:1,147`
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx:8-33`
- Modify: `src/__tests__/branches/BranchesPanel.test.tsx:31-39`
- Modify: `src/__tests__/components/ChangeAircraftModal.test.tsx:8-19`
- Modify: `src/__tests__/lib/dossierTransforms.test.ts:10-29`

**Interfaces:**
- Consumes: `totalFuelCapacity(massBalance: AircraftMassBalance): number` (Task 1).

- [ ] **Step 1: Fix `FuelPanel.tsx`**

Add the import (alongside the existing `computeBranchFuel` import):

```ts
import { totalFuelCapacity } from '../../lib/aviation/wbCalc'
```

Change line 24:

```ts
  const fuelCapacity = totalFuelCapacity(aircraft.massBalance)
```

- [ ] **Step 2: Fix `DossierPanel.tsx`**

Change the import line:

```ts
import { computeWB, totalFuelCapacity } from '../../lib/aviation/wbCalc'
```

Change line 199:

```tsx
                  <dd className="font-mono">{totalFuelCapacity(aircraft.massBalance)} L</dd>
```

- [ ] **Step 3: Fix `HomeScreen.tsx`**

Add the import:

```ts
import { totalFuelCapacity } from '../lib/aviation/wbCalc'
```

Change line 147:

```tsx
                    {ac.registration} · {ac.characteristics.regimes[0].speed}kt · {ac.characteristics.regimes[0].fuelBurn}L/h · {totalFuelCapacity(ac.massBalance)}L
```

- [ ] **Step 4: Run the affected tests to verify they still fail on fixtures (not yet fixed)**

Run: `npx vitest run src/__tests__/fuel/FuelPanel.test.tsx src/__tests__/branches/BranchesPanel.test.tsx src/__tests__/components/ChangeAircraftModal.test.tsx src/__tests__/lib/dossierTransforms.test.ts`
Expected: FAIL to run — TypeScript errors in the fixtures (`fuelCapacity` no longer a valid property, `capacityL` missing on fuel stations).

- [ ] **Step 5: Fix `src/__tests__/fuel/FuelPanel.test.tsx`**

Replace `makeAircraft()`:

```ts
function makeAircraft() {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-06-17T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
    massBalance: {
      emptyWeight: 600, emptyArm: 800,
      stations: [{ name: 'Carburant', arm: 800, kind: 'fuel' as const, capacityL: 110 }],
      envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
    },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
  }
}
```

Replace `makeOtherAircraft()`:

```ts
function makeOtherAircraft(): Aircraft {
  return {
    id: 'ac-2', name: 'Cessna 172', registration: 'F-GXYZ',
    characteristics: { regimes: [{ label: '75%', speed: 110, fuelBurn: 28 }] },
    massBalance: {
      emptyWeight: 620, emptyArm: 810,
      stations: [{ name: 'Carburant', arm: 810, kind: 'fuel', capacityL: 100 }],
      envelopePoints: [],
    },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
  }
}
```

- [ ] **Step 6: Fix `src/__tests__/branches/BranchesPanel.test.tsx`**

Change line 33:

```ts
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }] },
```

(only the `fuelCapacity: 116` removal — `stations: []` on line 34 stays as-is, no fuel station needed since `BranchesPanel` never reads fuel capacity.)

- [ ] **Step 7: Fix `src/__tests__/components/ChangeAircraftModal.test.tsx`**

Change line 11:

```ts
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
```

(`stations: []` on line 12 stays as-is — `ChangeAircraftModal` only reads `name`/`registration`.)

- [ ] **Step 8: Fix `src/__tests__/lib/dossierTransforms.test.ts`**

Change line 13 (`oldAircraft`):

```ts
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }] },
```

Change line 14 (`oldAircraft.massBalance.stations`):

```ts
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [{ name: 'Pilote', arm: 300, kind: 'dry' as const, capacityL: 0 }], envelopePoints: [] },
```

Change line 23 (`newAircraft`):

```ts
  characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 25 }] },
```

Change line 24 (`newAircraft.massBalance.stations`):

```ts
  massBalance: { emptyWeight: 700, emptyArm: 350, stations: [{ name: 'Passager', arm: 320, kind: 'dry' as const, capacityL: 0 }], envelopePoints: [] },
```

- [ ] **Step 9: Run the full suite and the build to verify everything compiles and passes**

Run: `npx vitest run`
Expected: PASS for every test file **except** `src/__tests__/wb/*` (doesn't exist yet) — no other failures.

Run: `npx tsc -b --noEmit`
Expected: exits 0, no errors (this is the checkpoint: the whole repo compiles again after the Task 1 type change, except `WBPanel.tsx` itself, which is fixed in Task 6/8 — run the narrower check below to confirm the gap is isolated there).

Run: `npx tsc -b --noEmit 2>&1 | grep -v WBPanel` (or inspect the output manually)
Expected: any remaining errors are confined to `src/features/wb/WBPanel.tsx` (still referencing the removed `characteristics.fuelCapacity` at its own lines 222/230 — fixed in Task 6).

- [ ] **Step 10: Commit**

```bash
git add src/features/fuel/FuelPanel.tsx src/features/dossier/DossierPanel.tsx src/screens/HomeScreen.tsx src/__tests__/fuel/FuelPanel.test.tsx src/__tests__/branches/BranchesPanel.test.tsx src/__tests__/components/ChangeAircraftModal.test.tsx src/__tests__/lib/dossierTransforms.test.ts
git commit -m "refactor: read fuel capacity via totalFuelCapacity() everywhere except WBPanel"
```

---

## Task 6: WBPanel — page layout homogenization

**Files:**
- Modify: `src/features/wb/WBPanel.tsx:120,165-167,211-270,326-333,356-358`
- Test: `src/__tests__/wb/WBPanel.test.tsx` (new)

**Interfaces:**
- Consumes: `totalFuelCapacity` (Task 1) as an interim fix for the two remaining `characteristics.fuelCapacity` reads in this file (replaced with per-station reads in Task 8).
- Produces: no new exports.

- [ ] **Step 1: Write the failing layout tests**

Create `src/__tests__/wb/WBPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WBPanel } from '../../features/wb/WBPanel'
import type { FlightDossier } from '../../types'

function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Test', date: '2026-01-01', departureTime: '09:00',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-01-01T00:00:00Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: {
        emptyWeight: 600, emptyArm: 800,
        stations: [
          { name: 'Pilote', arm: 700, kind: 'dry', capacityL: 0 },
          { name: 'Carburant', arm: 850, kind: 'fuel', capacityL: 100 },
        ],
        envelopePoints: [[600, 700], [900, 700], [900, 900], [600, 900]],
      },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [], fuelInputs: {},
    loading: { Pilote: 80, Carburant: 50 },
    perfRegulatory: 1, perfInputs: {}, notes: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('WBPanel — layout', () => {
  it('does not constrain the page width (homogenized with Carbu/Vols)', () => {
    const { container } = render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(container.querySelector('.max-w-4xl')).not.toBeInTheDocument()
  })

  it('uses the flex-column/scrollable-body shell shared with FuelPanel and BranchesPanel', () => {
    const { container } = render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(container.querySelector('.flex.flex-col.h-full')).toBeInTheDocument()
    expect(container.querySelector('.flex-1.overflow-auto')).toBeInTheDocument()
  })

  it('still shows the aircraft loading table and results', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Chargement')).toBeInTheDocument()
    expect(screen.getByText(/Résultats M&C/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 1b: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/wb/WBPanel.test.tsx`
Expected: FAIL — this file doesn't even compile yet (`characteristics.fuelCapacity` at lines 222/230 no longer exists on the type), and the `.max-w-4xl mx-auto` wrapper is still present.

- [ ] **Step 2: Fix the interim `fuelCapacity` reads**

Add the import (alongside `computeWB`):

```ts
import { computeWB, totalFuelCapacity } from '../../lib/aviation/wbCalc'
```

Change line 222:

```tsx
                          Cap. {totalFuelCapacity(massBalance)} L
```

Change line 230:

```tsx
                            max={totalFuelCapacity(massBalance)}
```

(Both are interim — Task 8 replaces them with `st.capacityL`, a per-station bound, and removes this import.)

- [ ] **Step 3: Reorganize the layout**

Replace the component's return statement's opening (lines 165-167 and the closing lines 356-358) — i.e. change:

```tsx
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid gap-6 md:grid-cols-2">
```

to:

```tsx
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-5">
      <div className="grid gap-6 md:grid-cols-2">
```

And change the closing (currently):

```tsx
      </div>
    </div>
  )
}
```

to:

```tsx
      </div>
      </div>
    </div>
  )
}
```

Move the "Enveloppe de centrage" `Card` (currently lines 326-333, inside the right column's `<div className="space-y-4">`) to sit **after** the `md:grid-cols-2` grid closes, as a sibling full-width block. Concretely: remove this block from inside the right column —

```tsx
          <Card padding="sm">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Enveloppe de centrage</p>
            <EnvelopeSVG
              points={envelopePoints}
              departure={{ weight: depResult.totalWeight, cg: depResult.cg }}
              arrival={{ weight: arrResult.totalWeight, cg: arrResult.cg }}
            />
          </Card>

```

— and re-insert it immediately after the grid's closing `</div>` (the one that closes `<div className="grid gap-6 md:grid-cols-2">`), before the MTOW/envelope alert cards:

```tsx
      </div>

      <Card padding="sm">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Enveloppe de centrage</p>
        <EnvelopeSVG
          points={envelopePoints}
          departure={{ weight: depResult.totalWeight, cg: depResult.cg }}
          arrival={{ weight: arrResult.totalWeight, cg: arrResult.cg }}
        />
      </Card>

      {depResult.totalWeight > maxWeight && (
```

(The `EnvelopeSVG` call keeps its current `departure`/`arrival` props unchanged in this task — Task 8 redesigns `EnvelopeSVG` itself and updates this call site.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/wb/WBPanel.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the full suite and build to confirm no regressions**

Run: `npx vitest run`
Expected: PASS for every test file.

Run: `npx tsc -b --noEmit`
Expected: exits 0, no errors — the whole repo compiles cleanly again.

- [ ] **Step 6: Commit**

```bash
git add src/features/wb/WBPanel.tsx src/__tests__/wb/WBPanel.test.tsx
git commit -m "refactor(wb): homogenize WBPanel layout with Carbu/Vols (full width, stacked cards)"
```

---

## Task 7: `niceTicks` axis utility

**Files:**
- Create: `src/lib/format/axisTicks.ts`
- Test: `src/__tests__/lib/axisTicks.test.ts` (new)

**Interfaces:**
- Produces: `niceTicks(min: number, max: number, count?: number): number[]`, exported from `src/lib/format/axisTicks.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/axisTicks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { niceTicks } from '../../lib/format/axisTicks'

describe('niceTicks', () => {
  it('returns a single value when min equals max', () => {
    expect(niceTicks(500, 500)).toEqual([500])
  })

  it('produces round steps spanning a weight-like range', () => {
    expect(niceTicks(400, 850, 5)).toEqual([400, 500, 600, 700, 800, 900])
  })

  it('produces round steps spanning a CG-like range', () => {
    expect(niceTicks(2300, 2550, 5)).toEqual([2300, 2400, 2500, 2600])
  })

  it('always includes the full [min, max] range within the first/last tick', () => {
    const ticks = niceTicks(413, 878, 5)
    expect(ticks[0]).toBeLessThanOrEqual(413)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(878)
  })
})
```

- [ ] **Step 1b: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/axisTicks.test.ts`
Expected: FAIL — `src/lib/format/axisTicks.ts` doesn't exist (module not found).

- [ ] **Step 2: Implement `niceTicks`**

Create `src/lib/format/axisTicks.ts`:

```ts
function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / Math.pow(10, exponent)
  let niceFraction: number
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }
  return niceFraction * Math.pow(10, exponent)
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min]
  const range = niceNumber(max - min, false)
  const step = niceNumber(range / (count - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Math.round(v * 1000) / 1000)
  }
  return ticks
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/axisTicks.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/format/axisTicks.ts src/__tests__/lib/axisTicks.test.ts
git commit -m "feat(format): add niceTicks axis-graduation utility"
```

---

## Task 8: WBPanel — three-point calculation, results table, and envelope graph redesign

**Files:**
- Modify: `src/features/wb/WBPanel.tsx` (full rewrite of `EnvelopeSVG`, the calculation hooks, the results table, the Chargement fuel rows, and the alert cards)
- Modify: `src/__tests__/wb/WBPanel.test.tsx`

**Interfaces:**
- Consumes: `computeWB` (existing), `niceTicks` (Task 7), `WeightStation.capacityL` (Task 1).
- Produces: no new exports — this is the terminal task for `WBPanel.tsx`'s public behavior (props unchanged: `{ dossier, onUpdate }`).

- [ ] **Step 1: Write the failing calculation/table tests**

Add to `src/__tests__/wb/WBPanel.test.tsx`, a new `describe` block after the existing `describe('WBPanel — layout', ...)`:

```tsx
describe('WBPanel — three W&B points', () => {
  it('renders Sans carburant, Actuel and Plein carburant rows in the results table', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    expect(within(table).getByText('Sans carburant')).toBeInTheDocument()
    expect(within(table).getByText('Actuel')).toBeInTheDocument()
    expect(within(table).getByText('Plein carburant')).toBeInTheDocument()
  })

  it('computes the zero-fuel point by zeroing fuel stations while keeping dry load', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    // 600 (empty) + 80 (Pilote) + 0 fuel = 680
    expect(within(table).getByText('680.0 kg')).toBeInTheDocument()
  })

  it('computes the current point from the entered loading, as before', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    // 600 + 80 + 50L*0.72 = 716
    expect(within(table).getByText('716.0 kg')).toBeInTheDocument()
  })

  it('computes the full-fuel point using each fuel station capacityL', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const table = screen.getByTestId('wb-results-table')
    // 600 + 80 + 100L*0.72 = 752
    expect(within(table).getByText('752.0 kg')).toBeInTheDocument()
  })

  it('shows an informational note and coincident points when there are no fuel stations', () => {
    const dossier = makeDossier()
    dossier.aircraft.massBalance.stations = dossier.aircraft.massBalance.stations.filter(s => s.kind !== 'fuel')
    render(<WBPanel dossier={dossier} onUpdate={vi.fn()} />)
    expect(screen.getByText('Aucune station carburant — le centrage ne varie pas avec le carburant')).toBeInTheDocument()
  })

  it('bounds each fuel station input by its own capacityL, not a shared figure', () => {
    const dossier = makeDossier()
    dossier.aircraft.massBalance.stations = [
      { name: 'Pilote', arm: 700, kind: 'dry', capacityL: 0 },
      { name: 'Avant', arm: 100, kind: 'fuel', capacityL: 80 },
      { name: 'Arrière', arm: 1120, kind: 'fuel', capacityL: 110 },
    ]
    render(<WBPanel dossier={dossier} onUpdate={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Avant (L)' })).toHaveAttribute('max', '80')
    expect(screen.getByRole('spinbutton', { name: 'Arrière (L)' })).toHaveAttribute('max', '110')
  })
})

describe('WBPanel — envelope graph', () => {
  it('renders axis titles', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Masse (kg)')).toBeInTheDocument()
    expect(screen.getByText('CG (mm)')).toBeInTheDocument()
  })

  it('draws exactly three point markers and a dashed trajectory line', () => {
    const { container } = render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const svg = container.querySelector('svg[aria-label="Enveloppe de centrage"]')!
    expect(svg.querySelectorAll('circle')).toHaveLength(3)
    expect(svg.querySelector('line[stroke-dasharray]')).toBeInTheDocument()
  })

  it('shows a legend naming the three points', () => {
    render(<WBPanel dossier={makeDossier()} onUpdate={vi.fn()} />)
    const legend = screen.getByTestId('wb-graph-legend')
    expect(within(legend).getByText('Sans carburant')).toBeInTheDocument()
    expect(within(legend).getByText('Actuel')).toBeInTheDocument()
    expect(within(legend).getByText('Plein carburant')).toBeInTheDocument()
  })
})
```

Update the test file's imports at the top to add `within`:

```tsx
import { render, screen, within } from '@testing-library/react'
```

- [ ] **Step 1b: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/wb/WBPanel.test.tsx`
Expected: FAIL — none of `wb-results-table`, `Sans carburant`, `Plein carburant`, `Masse (kg)`, `wb-graph-legend` exist yet; the fuel inputs have no accessible names yet.

- [ ] **Step 2: Rewrite the calculation layer**

Replace the entire `arrivalFuelLoading` function (lines 102-116) with:

```ts
function zeroFuelLoading(fuelStationNames: string[]): StationLoading {
  return Object.fromEntries(fuelStationNames.map(n => [n, 0]))
}

function fullFuelLoading(fuelStations: WeightStation[]): StationLoading {
  return Object.fromEntries(fuelStations.map(s => [s.name, s.capacityL]))
}
```

Add `WeightStation` to the type import at the top of the file:

```ts
import type { FlightDossier, StationLoading, WBResult, WeightStation } from '../../types'
```

Replace `wbStatus` (lines 96-100):

```ts
function wbStatus(results: WBResult[]) {
  if (results.some(r => !r.inEnvelope))
    return { variant: 'error' as const, label: 'HORS LIMITE' }
  return { variant: 'success' as const, label: 'OK' }
}
```

In the main component, replace the block computing `arrLoading`/`depResult`/`arrResult`/`status` (lines 134-151) with:

```ts
  const curResult = useMemo(
    () => computeWB(massBalance, loading),
    [massBalance, loading],
  )

  const zfwResult = useMemo(
    () => computeWB(massBalance, { ...loading, ...zeroFuelLoading(fuelStationNames) }),
    [massBalance, loading, fuelStationNames],
  )

  const fullResult = useMemo(
    () => computeWB(massBalance, { ...loading, ...fullFuelLoading(fuelStations) }),
    [massBalance, loading, fuelStations],
  )

  const status = wbStatus([zfwResult, curResult, fullResult])
```

Remove the now-unused `totalDepFuelL`/`totalDepFuelKg`/`totalArrFuelL`/`totalArrFuelKg` block (lines 160-163) entirely — the per-station fuel rows (Step 3 below) compute their own kg inline, and the aggregate dep/arr subtotal row is removed.

- [ ] **Step 3: Rewrite the Chargement card's fuel station rows**

Replace the "Fuel stations" block (lines 211-244) with:

```tsx
                {/* Fuel stations */}
                {fuelStations.map(st => {
                  const val = loading[st.name] ?? 0
                  const valKg = val * FUEL_DENSITY_KGL
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5">
                        <div className="text-[var(--text-2)]">{st.name}</div>
                        <div className="text-xs text-[var(--text-dim)] mt-0.5">
                          Cap. {st.capacityL} L
                        </div>
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <input
                            type="number"
                            aria-label={`${st.name} (L)`}
                            min={0}
                            max={st.capacityL}
                            value={val === 0 ? '' : val}
                            placeholder="0"
                            onChange={e => handleChange(st.name, e.target.value)}
                            className="w-20 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                          />
                          <span className="text-xs text-[var(--text-dim)]">L</span>
                        </div>
                        <div className="text-right text-xs text-[var(--text-dim)] font-mono">
                          {valKg.toFixed(1)} kg
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {/* Dry total */}
                <tr className="font-medium">
                  <td className="pt-2 text-[var(--text-muted)]">Sous-total charges sèches</td>
                  <td className="pt-2 text-right font-mono text-[var(--text-1)]">{dryTotal.toFixed(1)} kg</td>
                </tr>

                {fuelStationNames.length === 0 && (
                  <tr>
                    <td colSpan={2} className="pt-2 text-xs text-[var(--amber)]">
                      Aucune station carburant — le centrage ne varie pas avec le carburant
                    </td>
                  </tr>
                )}
```

Remove the now-dead `totalFuelCapacity` import added in Task 6 (no longer used anywhere in this file — every read is now per-station `st.capacityL`):

```ts
import { computeWB } from '../../lib/aviation/wbCalc'
```

- [ ] **Step 4: Rewrite the results table**

Replace the results `Card` (the one containing the "Départ"/"Arrivée" table, roughly lines 282-324) with:

```tsx
          <Card padding="sm" inset>
            <table className="w-full text-sm" data-testid="wb-results-table">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2" />
                  <th className="text-right pb-2">Masse</th>
                  <th className="text-right pb-2 pl-3">CG</th>
                  <th className="text-right pb-2 pl-3">Env.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {([
                  { label: 'Sans carburant', color: 'var(--blue)', result: zfwResult },
                  { label: 'Actuel', color: 'var(--text-1)', result: curResult },
                  { label: 'Plein carburant', color: 'var(--green)', result: fullResult },
                ] as const).map(row => (
                  <tr key={row.label}>
                    <td className="py-2 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: row.color }} />
                      <span className="text-[var(--text-2)]">{row.label}</span>
                    </td>
                    <td className="py-2 text-right font-mono text-[var(--text-1)]">{fmtKg(row.result.totalWeight)}</td>
                    <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">{fmtCg(row.result.cg)}</td>
                    <td className="py-2 text-right pl-3">
                      {row.result.inEnvelope ? <Badge variant="success">OK</Badge> : <Badge variant="error">HORS</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-xs text-[var(--text-dim)]">
                    MTOW : {maxWeight} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
```

- [ ] **Step 5: Rewrite `EnvelopeSVG`**

Add the import:

```ts
import { niceTicks } from '../../lib/format/axisTicks'
```

Replace the entire `EnvelopeSVG` function (lines 15-89) with:

```tsx
function EnvelopeSVG({
  points,
  zeroFuel,
  current,
  full,
}: {
  points: [number, number][]
  zeroFuel: { weight: number; cg: number } | null
  current: { weight: number; cg: number } | null
  full: { weight: number; cg: number } | null
}) {
  if (points.length < 3) {
    return (
      <p className="text-xs text-[var(--text-dim)]">Enveloppe non définie</p>
    )
  }

  const width = 640
  const height = 400
  const pad = 56

  const allWeights = [points.map(p => p[0]), [zeroFuel?.weight, current?.weight, full?.weight]]
    .flat()
    .filter((w): w is number => w !== undefined && w !== null)
  const allCgs = [points.map(p => p[1]), [zeroFuel?.cg, current?.cg, full?.cg]]
    .flat()
    .filter((c): c is number => c !== undefined && c !== null)

  const minW = Math.min(...allWeights)
  const maxW = Math.max(...allWeights)
  const minCg = Math.min(...allCgs)
  const maxCg = Math.max(...allCgs)

  const wTicks = niceTicks(minW, maxW, 5)
  const cgTicks = niceTicks(minCg, maxCg, 5)
  const scaleMinW = Math.min(minW, wTicks[0])
  const scaleMaxW = Math.max(maxW, wTicks[wTicks.length - 1])
  const scaleMinCg = Math.min(minCg, cgTicks[0])
  const scaleMaxCg = Math.max(maxCg, cgTicks[cgTicks.length - 1])

  const wRange = scaleMaxW - scaleMinW || 1
  const cgRange = scaleMaxCg - scaleMinCg || 1

  const scaleX = (cg: number) => pad + ((cg - scaleMinCg) / cgRange) * (width - pad - 16)
  const scaleY = (w: number) => height - pad - ((w - scaleMinW) / wRange) * (height - pad - 16)

  const pathD =
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p[1]).toFixed(1)} ${scaleY(p[0]).toFixed(1)}`)
      .join(' ') + ' Z'

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-3xl mx-auto" role="img" aria-label="Enveloppe de centrage">
        {wTicks.map(w => (
          <line key={`gw-${w}`} x1={pad} y1={scaleY(w)} x2={width - 16} y2={scaleY(w)} stroke="var(--border)" strokeWidth="1" />
        ))}
        {cgTicks.map(cg => (
          <line key={`gc-${cg}`} x1={scaleX(cg)} y1={16} x2={scaleX(cg)} y2={height - pad} stroke="var(--border)" strokeWidth="1" />
        ))}

        <line x1={pad} y1={16} x2={pad} y2={height - pad} stroke="var(--text-dim)" strokeWidth="1.5" />
        <line x1={pad} y1={height - pad} x2={width - 16} y2={height - pad} stroke="var(--text-dim)" strokeWidth="1.5" />

        {wTicks.map(w => (
          <text key={`tw-${w}`} x={pad - 8} y={scaleY(w) + 3} textAnchor="end" fontSize="11" fill="var(--text-dim)">{w}</text>
        ))}
        {cgTicks.map(cg => (
          <text key={`tc-${cg}`} x={scaleX(cg)} y={height - pad + 16} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{cg}</text>
        ))}

        <text x={12} y={12} fontSize="11" fill="var(--text-muted)">Masse (kg)</text>
        <text x={width - 16} y={height - 8} textAnchor="end" fontSize="11" fill="var(--text-muted)">CG (mm)</text>

        <path
          d={pathD}
          fill="color-mix(in srgb, var(--amber) 12%, transparent)"
          stroke="var(--amber)"
          strokeWidth="1.5"
        />

        {zeroFuel && full && (
          <line
            x1={scaleX(zeroFuel.cg)} y1={scaleY(zeroFuel.weight)}
            x2={scaleX(full.cg)} y2={scaleY(full.weight)}
            stroke="var(--text-dim)" strokeWidth="1.5" strokeDasharray="4,3"
          />
        )}

        {zeroFuel && (
          <circle cx={scaleX(zeroFuel.cg)} cy={scaleY(zeroFuel.weight)} r="6" fill="none" stroke="var(--blue)" strokeWidth="2" />
        )}
        {full && (
          <circle cx={scaleX(full.cg)} cy={scaleY(full.weight)} r="6" fill="none" stroke="var(--green)" strokeWidth="2" />
        )}
        {current && (
          <circle cx={scaleX(current.cg)} cy={scaleY(current.weight)} r="8" fill="var(--text-1)" stroke="var(--bg-card)" strokeWidth="2" />
        )}
      </svg>

      <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs text-[var(--text-dim)]" data-testid="wb-graph-legend">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--blue)' }} />
          Sans carburant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--text-1)' }} />
          Actuel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--green)' }} />
          Plein carburant
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Update the `EnvelopeSVG` call site and the alert cards**

Replace the `EnvelopeSVG` call (moved to its new location in Task 6):

```tsx
      <Card padding="sm">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Enveloppe de centrage</p>
        <EnvelopeSVG
          points={envelopePoints}
          zeroFuel={{ weight: zfwResult.totalWeight, cg: zfwResult.cg }}
          current={{ weight: curResult.totalWeight, cg: curResult.cg }}
          full={{ weight: fullResult.totalWeight, cg: fullResult.cg }}
        />
      </Card>
```

Replace the three alert-card blocks at the end of the component (previously checking `depResult`/`arrResult`) with:

```tsx
          {([
            { label: 'sans carburant', result: zfwResult },
            { label: 'actuel', result: curResult },
            { label: 'plein carburant', result: fullResult },
          ] as const).map(({ label, result }) => (
            result.totalWeight > maxWeight ? (
              <Card key={`mtow-${label}`} padding="sm">
                <p className="text-[var(--red)] text-sm font-medium">
                  Masse {label} ({fmtKg(result.totalWeight)}) dépasse le MTOW ({maxWeight} kg)
                </p>
              </Card>
            ) : null
          ))}
          {(!zfwResult.inEnvelope || !curResult.inEnvelope || !fullResult.inEnvelope) && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Centrage hors de l&apos;enveloppe — revoir la répartition des charges.
              </p>
            </Card>
          )}
```

- [ ] **Step 7: Run the WBPanel tests to verify they pass**

Run: `npx vitest run src/__tests__/wb/WBPanel.test.tsx`
Expected: PASS (all tests across both `describe` blocks).

- [ ] **Step 8: Run the full suite and build**

Run: `npx vitest run`
Expected: PASS for every test file.

Run: `npx tsc -b --noEmit`
Expected: exits 0, no errors, no unused-import warnings (`noUnusedLocals` is on — double-check `totalFuelCapacity` is no longer imported in `WBPanel.tsx`).

- [ ] **Step 9: Commit**

```bash
git add src/features/wb/WBPanel.tsx src/__tests__/wb/WBPanel.test.tsx
git commit -m "feat(wb): replace Départ/Arrivée envelope points with Sans carburant/Actuel/Plein carburant, add gridded labeled axes"
```

---

## Task 9: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all test files PASS, 0 failures.

- [ ] **Step 2: Run the TypeScript build**

Run: `npx tsc -b --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: exits 0, `dist/` produced, no errors or warnings about unused exports.

- [ ] **Step 4: Run the linter**

Run: `npm run lint`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev` (leave it running).

In the browser:
1. Open the app, create or open a dossier using the DR221 template (now has `capacityL: 110` on its single fuel station).
2. Go to the M&C tab. Confirm the page is full-width and structured like Carbu/Vols (no centered narrow column).
3. Confirm the "Chargement" and "Résultats M&C" cards sit side by side, and the "Enveloppe de centrage" graph sits full-width below them, visibly larger than before.
4. Confirm the graph shows a gridded background, numeric graduations on both axes, and axis titles "Masse (kg)" / "CG (mm)".
5. Confirm three points render: a hollow blue circle (Sans carburant), a hollow green circle (Plein carburant), a solid light circle (Actuel), connected by a dashed line between the two hollow circles.
6. Enter a fuel value in the Chargement table and confirm the "Actuel" point moves along the dashed line between the two fixed extremes.
7. Edit the aircraft (Home → Modifier) and confirm the "Capacité carburant (L)" global field is gone, replaced by a per-station "Capacité (L)" column visible only on fuel-kind rows, with a read-only total below the table.
8. Save the aircraft, reopen it, and confirm the per-station capacity was preserved.

Report back: does every point above hold? If any step shows a visual regression or incorrect behavior, note the discrepancy — do not report the task complete until confirmed.

- [ ] **Step 6: Stop the dev server**

Stop the `npm run dev` process once verification is complete.
