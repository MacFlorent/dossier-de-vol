# Carbu Summary & Aircraft Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote distance/duration/autonomy info to the top of the Carbu tab and let the pilot name and switch the aircraft directly from that page.

**Architecture:** `computeBranchFuel` (in `src/lib/aviation/fuelCalc.ts`) gains a `totalDistanceNm` field so `FuelPanel` can show it without duplicating the sum logic already used in `BranchesPanel`. The existing `ChangeAircraftModal` (currently private to `AppChrome.tsx`) is extracted to `src/components/ui/ChangeAircraftModal.tsx` so `FuelPanel` can reuse it via a new `onChangeAircraft` prop wired locally in `DossierScreen.tsx`. `FuelPanel`'s "Autonomie requise" card is moved from the end of the page to the top (right after the flight tab strip) and enriched with distance/duration fields; the "Appareil" block gains the aircraft name and a "Changer" button.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tailwind.

## Global Constraints

- Distance totale and the two durations shown in the summary card cover **ENROUTE segments only** (main route), excluding the ALTERNATE segment — same convention as the existing total distance in `BranchesPanel.tsx:150`.
- No change to any existing fuel/W&B/perf calculation — only display and one new derived field (`totalDistanceNm`).
- The "Changer" button in Carbu must reuse the exact existing `ChangeAircraftModal` behavior (confirmation copy, reset of fuel/loading/perf via `applyAircraftChange`) — no new business logic.
- Existing sub-totals in Bloc 2 ("Temps vol brut") and Bloc 3 ("Temps de vol total") stay exactly where they are — the top card is an added summary, not a replacement.

---

### Task 1: Add `totalDistanceNm` to `computeBranchFuel`

**Files:**
- Modify: `src/lib/aviation/fuelCalc.ts`
- Test: `src/__tests__/aviation/fuelCalc.test.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `FlightBranch.segments`, already available inside `computeBranchFuel`).
- Produces: `BranchFuelResult.totalDistanceNm: number` — sum of `distanceNm` for segments with `role === 'ENROUTE'` in the branch passed to `computeBranchFuel`. Later tasks (Task 4) read this as `result.totalDistanceNm`.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('computeBranchFuel', ...)` block in `src/__tests__/aviation/fuelCalc.test.ts` (after the `'sums multiple ENROUTE segments for rawFlightTimeMin'` test, using the file's existing `makeSegment`/`makeBranch`/`baseFi`/`regime` helpers):

```ts
  it('totalDistanceNm sums ENROUTE segment distances, excluding ALTERNATE', () => {
    const s1 = makeSegment({ id: 's1', distanceNm: 60 })
    const s2 = makeSegment({ id: 's2', distanceNm: 40 })
    const alt = makeSegment({ id: 's3', role: 'ALTERNATE', distanceNm: 30 })
    const result = computeBranchFuel(makeBranch([s1, s2, alt]), baseFi, regime)
    expect(result.totalDistanceNm).toBe(100)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aviation/fuelCalc.test.ts -t "totalDistanceNm"`
Expected: FAIL — `expect(result.totalDistanceNm).toBe(100)` receives `undefined`.

- [ ] **Step 3: Implement `totalDistanceNm`**

In `src/lib/aviation/fuelCalc.ts`, add the field to the `BranchFuelResult` interface:

```ts
export interface BranchFuelResult {
  segmentDetails: SegmentFuelDetail[]
  totalDistanceNm: number
  rawFlightTimeMin: number
  alternateTimeMin: number
  extrasMin: number
  totalFlightTimeMin: number
  flightFuelL: number
  totalAlternateTimeMin: number
  alternateFuelL: number
  reserveMin: number
  requiredEnduranceMin: number
  requiredFuelL: number
  requiredFuelKg: number
}
```

Then compute and return it in `computeBranchFuel` — add the line right after the existing `rawFlightTimeMin` computation, and add `totalDistanceNm` to the returned object:

```ts
  const rawFlightTimeMin = enroute.reduce((s, d) => s + d.timeMin, 0)
  const totalDistanceNm = enroute.reduce((s, d) => s + d.distanceNm, 0)
```

```ts
  return {
    segmentDetails, totalDistanceNm, rawFlightTimeMin, alternateTimeMin, extrasMin,
    totalFlightTimeMin, flightFuelL,
    totalAlternateTimeMin, alternateFuelL,
    reserveMin, requiredEnduranceMin, requiredFuelL, requiredFuelKg,
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/aviation/fuelCalc.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aviation/fuelCalc.ts src/__tests__/aviation/fuelCalc.test.ts
git commit -m "feat(fuel): add totalDistanceNm to computeBranchFuel"
```

---

### Task 2: Extract `ChangeAircraftModal` into a shared component

**Files:**
- Create: `src/components/ui/ChangeAircraftModal.tsx`
- Create: `src/__tests__/components/ChangeAircraftModal.test.tsx`
- Modify: `src/components/AppChrome.tsx`

**Interfaces:**
- Consumes: `listAircraft` from `src/lib/storage.ts` (existing), `Button` from `src/components/ui/Button.tsx` (existing).
- Produces: `ChangeAircraftModal({ currentAircraftId: string, onConfirm: (id: string) => void, onClose: () => void })` — exported from `src/components/ui/ChangeAircraftModal.tsx`. Task 3 imports this into `FuelPanel.tsx`.

- [ ] **Step 1: Write the failing test for the new component**

Create `src/__tests__/components/ChangeAircraftModal.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangeAircraftModal } from '../../components/ui/ChangeAircraftModal'
import { saveAircraft } from '../../lib/storage'
import type { Aircraft } from '../../types'

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }], fuelCapacity: 110 },
    massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
    ...overrides,
  }
}

afterEach(() => localStorage.clear())

describe('ChangeAircraftModal', () => {
  it('lists fleet aircraft excluding the current one', () => {
    saveAircraft(makeAircraft({ id: 'ac-1', name: 'DR400' }))
    saveAircraft(makeAircraft({ id: 'ac-2', name: 'Cessna 172' }))
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Cessna 172')).toBeInTheDocument()
    expect(screen.queryByText('DR400')).not.toBeInTheDocument()
  })

  it('shows a message when the fleet has no other aircraft', () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Aucun autre avion dans la flotte.')).toBeInTheDocument()
  })

  it('asks for confirmation before calling onConfirm', async () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    saveAircraft(makeAircraft({ id: 'ac-2', name: 'Cessna 172' }))
    const onConfirm = vi.fn()
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={onConfirm} onClose={vi.fn()} />)
    await userEvent.click(screen.getByText('Cessna 172'))
    expect(screen.getByText(/Changer l'avion pour/)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(onConfirm).toHaveBeenCalledWith('ac-2')
  })

  it('returns to the fleet list when Annuler is clicked, without confirming', async () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    saveAircraft(makeAircraft({ id: 'ac-2', name: 'Cessna 172' }))
    const onConfirm = vi.fn()
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={onConfirm} onClose={vi.fn()} />)
    await userEvent.click(screen.getByText('Cessna 172'))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByText(/Changer l'avion pour/)).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/ChangeAircraftModal.test.tsx`
Expected: FAIL — cannot resolve `../../components/ui/ChangeAircraftModal` (module does not exist yet).

- [ ] **Step 3: Create the shared component**

Create `src/components/ui/ChangeAircraftModal.tsx` with the exact content currently defined inline in `AppChrome.tsx` (lines 26-77), only changing the import paths (one directory shallower) and adding the `ChangeAircraftModalProps` name:

```tsx
import { useState, useMemo } from 'react'
import type { Aircraft } from '../../types'
import { listAircraft } from '../../lib/storage'
import { Button } from './Button'

interface ChangeAircraftModalProps {
  currentAircraftId: string
  onConfirm: (id: string) => void
  onClose: () => void
}

export function ChangeAircraftModal({ currentAircraftId, onConfirm, onClose }: ChangeAircraftModalProps) {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/ChangeAircraftModal.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Point `AppChrome.tsx` at the shared component**

In `src/components/AppChrome.tsx`:
- Remove the entire inline `function ChangeAircraftModal(...) { ... }` block (current lines 26-77).
- Replace the import block (current lines 1-5) with:

```tsx
import { useState } from 'react'
import type { FlightDossier, DossierTab, Screen } from '../types'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'
import { ChangeAircraftModal } from './ui/ChangeAircraftModal'
```

(`Aircraft`, `listAircraft`, and `useMemo` are no longer used directly in `AppChrome.tsx` once the inline modal is removed — dropped from the imports.)

The rest of `AppChrome.tsx` (the `AppChrome` function itself, including where `<ChangeAircraftModal .../>` is rendered) is unchanged — it already calls the component with the same props.

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: PASS, no regressions.

Run: `npx tsc -b`
Expected: no errors (confirms no leftover unused imports or broken references in `AppChrome.tsx`).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/ChangeAircraftModal.tsx src/__tests__/components/ChangeAircraftModal.test.tsx src/components/AppChrome.tsx
git commit -m "refactor(ui): extract ChangeAircraftModal into a shared component"
```

---

### Task 3: Show the aircraft name and a "Changer" button in Carbu's Bloc "Appareil"

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx`
- Modify: `src/screens/DossierScreen.tsx`
- Test: `src/__tests__/fuel/FuelPanel.test.tsx`

**Interfaces:**
- Consumes: `ChangeAircraftModal` from `src/components/ui/ChangeAircraftModal.tsx` (Task 2), `getAircraft` from `src/lib/storage.ts` (existing), `applyAircraftChange` from `src/lib/dossierTransforms.ts` (existing).
- Produces: `FuelPanel` now accepts an optional `onChangeAircraft?: (newAircraftId: string) => void` prop. When provided, a "Changer" button appears in the Bloc "Appareil" header.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/fuel/FuelPanel.test.tsx`, add `Aircraft` to the type import on line 5:

```ts
import type { FlightDossier, FlightBranch, FuelInputs, FlightSegment, Aircraft } from '../../types'
```

Add `saveAircraft` to a new import, and a helper for the "other" aircraft used in the change-aircraft tests, right after the existing `makeAircraft` function:

```ts
import { saveAircraft } from '../../lib/storage'
```

```ts
function makeOtherAircraft(): Aircraft {
  return {
    id: 'ac-2', name: 'Cessna 172', registration: 'F-GXYZ',
    characteristics: { regimes: [{ label: '75%', speed: 110, fuelBurn: 28 }], fuelCapacity: 100 },
    massBalance: { emptyWeight: 620, emptyArm: 810, stations: [], envelopePoints: [] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
  }
}
```

Replace the existing `describe('Bloc 1 — Appareil', ...)` block with this expanded version (keeps the existing "Facteur pilote" test, adds four new ones):

```ts
  describe('Bloc 1 — Appareil', () => {
    afterEach(() => localStorage.clear())

    it('shows Facteur pilote input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Facteur pilote/i)).toBeInTheDocument()
    })

    it('shows the aircraft name', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByText('DR400')).toBeInTheDocument()
    })

    it('does not show a "Changer" button when onChangeAircraft is not provided', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Changer' })).not.toBeInTheDocument()
    })

    it('opens the change-aircraft modal listing the fleet when "Changer" is clicked', async () => {
      saveAircraft(makeOtherAircraft())
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} onChangeAircraft={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Changer' }))
      expect(screen.getByText("Changer d'avion")).toBeInTheDocument()
      expect(screen.getByText('Cessna 172')).toBeInTheDocument()
    })

    it('calls onChangeAircraft with the selected aircraft id after confirmation', async () => {
      saveAircraft(makeOtherAircraft())
      const onChangeAircraft = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} onChangeAircraft={onChangeAircraft} />)
      await userEvent.click(screen.getByRole('button', { name: 'Changer' }))
      await userEvent.click(screen.getByText('Cessna 172'))
      await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
      expect(onChangeAircraft).toHaveBeenCalledWith('ac-2')
    })
  })
```

Note: `afterEach` must be imported — update the top import line 1 of the test file to:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/fuel/FuelPanel.test.tsx -t "Appareil"`
Expected: FAIL — `getByText('DR400')` not found, `getByRole('button', { name: 'Changer' })` not found, `onChangeAircraft` prop not accepted by TypeScript (ignored at runtime by esbuild, but the button/text assertions fail).

- [ ] **Step 3: Add the prop, state, and modal wiring to `FuelPanel`**

In `src/features/fuel/FuelPanel.tsx`, update the import list (add `ChangeAircraftModal`):

```tsx
import { ChangeAircraftModal } from '../../components/ui/ChangeAircraftModal'
```

Update the `Props` interface and function signature:

```ts
interface Props {
  dossier: FlightDossier
  onUpdate: (fuelInputs: Record<string, FuelInputs>) => void
  onUpdateBranches: (branches: FlightBranch[]) => void
  onChangeAircraft?: (newAircraftId: string) => void
}

export function FuelPanel({ dossier, onUpdate, onUpdateBranches, onChangeAircraft }: Props) {
```

Add a `showChangeModal` state, right after the existing `activeBranchId` state:

```ts
  const [activeBranchId, setActiveBranchId] = useState(() => branches[0]?.id ?? '')
  const [showChangeModal, setShowChangeModal] = useState(false)
```

- [ ] **Step 4: Update the Bloc "Appareil" header**

Replace:

```tsx
      {/* Bloc 1 — Appareil */}
      <Card padding="md" inset>
        {sectionHeader('Appareil')}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
```

with:

```tsx
      {/* Bloc 1 — Appareil */}
      <Card padding="md" inset>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Appareil</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-1)]">{aircraft.name}</span>
            {onChangeAircraft && (
              <Button variant="ghost" size="sm" onClick={() => setShowChangeModal(true)}>Changer</Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
```

- [ ] **Step 5: Render the modal**

At the end of the component, replace:

```tsx
      </div>
    </div>
  )
}
```

with:

```tsx
      </div>
      {showChangeModal && onChangeAircraft && (
        <ChangeAircraftModal
          currentAircraftId={aircraft.id}
          onConfirm={onChangeAircraft}
          onClose={() => setShowChangeModal(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/fuel/FuelPanel.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Wire `onChangeAircraft` from `DossierScreen`**

In `src/screens/DossierScreen.tsx`, add two imports:

```ts
import { getAircraft } from '../lib/storage'
import { applyAircraftChange } from '../lib/dossierTransforms'
```

Update the `fuel` tab block:

```tsx
      {activeTab === 'fuel' && (
        <FuelPanel
          dossier={dossier}
          onUpdate={(fuelInputs) => update({ fuelInputs })}
          onUpdateBranches={(branches: FlightBranch[]) => update({ branches })}
          onChangeAircraft={(newAircraftId) => {
            const newAircraft = getAircraft(newAircraftId)
            if (newAircraft) onUpdate(applyAircraftChange(dossier, newAircraft))
          }}
        />
      )}
```

- [ ] **Step 8: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: PASS, no regressions.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/features/fuel/FuelPanel.tsx src/screens/DossierScreen.tsx src/__tests__/fuel/FuelPanel.test.tsx
git commit -m "feat(fuel): show aircraft name and allow switching it from Carbu"
```

---

### Task 4: Move the autonomy card to the top and enrich it with distance/duration

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx`
- Test: `src/__tests__/fuel/FuelPanel.test.tsx`

**Interfaces:**
- Consumes: `result.totalDistanceNm`, `result.rawFlightTimeMin`, `result.totalFlightTimeMin` from `BranchFuelResult` (Task 1 adds `totalDistanceNm`; the other two already exist).
- Produces: no new exports — purely a layout change within `FuelPanel`.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block in `src/__tests__/fuel/FuelPanel.test.tsx`, right after the `describe('flight tab bar', ...)` block:

```ts
  describe('Résumé — Autonomie requise (haut de page)', () => {
    it('shows total distance, raw flight time and real flight time', () => {
      const branch = makeBranch({
        segments: [makeSegment({ id: 's1', distanceNm: 60 }), makeSegment({ id: 's2', distanceNm: 60 })],
      })
      const dossier = makeDossier([branch], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByText('Distance totale')).toBeInTheDocument()
      expect(screen.getByText(/120\s*nm/)).toBeInTheDocument()
      expect(screen.getByText('Temps de vol brut')).toBeInTheDocument()
      expect(screen.getByText('Temps de vol réel')).toBeInTheDocument()
    })

    it('renders the autonomy summary card before the Appareil block', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      const { container } = render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      const headings = Array.from(container.querySelectorAll('h2')).map(h => h.textContent)
      expect(headings.indexOf('Autonomie requise')).toBeGreaterThanOrEqual(0)
      expect(headings.indexOf('Autonomie requise')).toBeLessThan(headings.indexOf('Appareil'))
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/fuel/FuelPanel.test.tsx -t "Résumé"`
Expected: FAIL — "Distance totale" / "Temps de vol brut" / "Temps de vol réel" not found (the card is still at the end of the page, without these fields).

- [ ] **Step 3: Move and enrich the card**

In `src/features/fuel/FuelPanel.tsx`, remove the current Bloc 6 block from the end of the component:

```tsx
      {/* Bloc 6 — Autonomie requise */}
      <Card padding="md">
        {sectionHeader('Autonomie requise')}
        <dl className="space-y-2">
          <div className="flex justify-between items-baseline">
            <dt className="text-[var(--text-2)]">Autonomie requise</dt>
            <dd className="font-mono text-xl font-bold text-[var(--text-1)]">
              {formatDuration(result.requiredEnduranceMin)}
            </dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="text-[var(--text-2)]">Essence requise</dt>
            <dd className="font-mono text-xl font-bold text-[var(--text-1)]">
              {result.requiredFuelL.toFixed(1)} L
              <span className="text-sm font-normal text-[var(--text-dim)] ml-2">
                / {result.requiredFuelKg.toFixed(1)} kg
              </span>
            </dd>
          </div>
          <div className="flex justify-between items-center border-t border-[var(--border)] pt-2 text-sm">
            <dt className="text-[var(--text-muted)]">Capacité</dt>
            <dd className="font-mono text-[var(--text-2)]">{fuelCapacity} L</dd>
          </div>
        </dl>
        <div className="mt-3">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </Card>
```

Insert the enriched version right after `<FlightTabStrip branches={branches} activeId={validId} onSelect={setActiveBranchId} />` and before the `{/* Bloc 1 — Appareil */}` comment:

```tsx
      <FlightTabStrip branches={branches} activeId={validId} onSelect={setActiveBranchId} />
      <div className="flex-1 overflow-auto p-4 space-y-5">
      {/* Résumé — Autonomie requise */}
      <Card padding="md">
        {sectionHeader('Autonomie requise')}
        <dl className="space-y-2">
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--text-muted)]">Distance totale</dt>
            <dd className="font-mono text-[var(--text-2)]">{result.totalDistanceNm} nm</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--text-muted)]">Temps de vol brut</dt>
            <dd className="font-mono text-[var(--text-2)]">{formatDuration(result.rawFlightTimeMin)}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--text-muted)]">Temps de vol réel</dt>
            <dd className="font-mono text-[var(--text-2)]">{formatDuration(result.totalFlightTimeMin)}</dd>
          </div>
          <div className="flex justify-between items-baseline border-t border-[var(--border)] pt-2">
            <dt className="text-[var(--text-2)]">Autonomie requise</dt>
            <dd className="font-mono text-xl font-bold text-[var(--text-1)]">
              {formatDuration(result.requiredEnduranceMin)}
            </dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="text-[var(--text-2)]">Essence requise</dt>
            <dd className="font-mono text-xl font-bold text-[var(--text-1)]">
              {result.requiredFuelL.toFixed(1)} L
              <span className="text-sm font-normal text-[var(--text-dim)] ml-2">
                / {result.requiredFuelKg.toFixed(1)} kg
              </span>
            </dd>
          </div>
          <div className="flex justify-between items-center border-t border-[var(--border)] pt-2 text-sm">
            <dt className="text-[var(--text-muted)]">Capacité</dt>
            <dd className="font-mono text-[var(--text-2)]">{fuelCapacity} L</dd>
          </div>
        </dl>
        <div className="mt-3">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </Card>

      {/* Bloc 1 — Appareil */}
```

(The `{/* Bloc 1 — Appareil */}` comment and the `<Card padding="md" inset>` that follows it are otherwise unchanged from Task 3.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/fuel/FuelPanel.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full test suite, typecheck, and build**

Run: `npx vitest run`
Expected: PASS, no regressions.

Run: `npx tsc -b`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/features/fuel/FuelPanel.tsx src/__tests__/fuel/FuelPanel.test.tsx
git commit -m "feat(fuel): move autonomy card to top of Carbu, add distance and duration"
```
