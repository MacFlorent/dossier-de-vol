# Header Consolidation & Dossier Tab Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-row app header with a two-row, always-visible block (identity + synthèse) above the tab bar, remove the "Dossier" tab, and relocate its printable content behind a new "Imprimer" action.

**Architecture:** A new pure calculation module (`computeDossierTotals`) feeds a rewritten `AppChrome` header. The former `DossierPanel` tab becomes `DossierPrintSheet`, always mounted (screen-hidden, print-visible) instead of tab-gated. No new dependencies.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, existing `formatDuration`/`totalFuelCapacity` helpers.

## Global Constraints

- All UI copy is French, matching existing labels exactly (e.g. "Temps de vol brut", "Changer", "Imprimer").
- Reuse existing helpers instead of reimplementing: `formatDuration` (`src/lib/format.ts`), `totalFuelCapacity` (`src/lib/aviation/wbCalc.ts`), `computeSegmentTiming` (`src/lib/aviation/windTriangle.ts`).
- Cruise regime is always `aircraft.characteristics.regimes[0]`, consistent with every other screen in the app — no regime picker.
- Keep the build green after every task: `npx tsc -b` and the full test suite must pass before each commit.

---

### Task 1: `computeDossierTotals` — dossier-wide aggregate calc

**Files:**
- Create: `src/lib/aviation/dossierTotals.ts`
- Test: `src/__tests__/aviation/dossierTotals.test.ts`

**Interfaces:**
- Consumes: `computeSegmentTiming(segment: FlightSegment, tas: number): { gs: number; wca: number; timeMin: number }` from `src/lib/aviation/windTriangle.ts` (existing, unchanged). `FlightDossier` type from `src/types/index.ts`.
- Produces: `computeDossierTotals(dossier: FlightDossier): DossierTotals` where `DossierTotals = { branchCount: number; totalDistanceNm: number; totalRawTimeMin: number }`. Consumed by `AppChrome` in Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/aviation/dossierTotals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeDossierTotals } from '../../lib/aviation/dossierTotals'
import type { FlightDossier, FlightBranch, FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, ...overrides }
}

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}

function makeDossier(branches: FlightBranch[]): FlightDossier {
  return {
    id: 'd-1', name: 'Test', date: '2026-07-19', departureTime: '',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches,
    fuelInputs: {},
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

describe('computeDossierTotals', () => {
  it('counts branches', () => {
    const dossier = makeDossier([makeBranch({ id: 'b1' }), makeBranch({ id: 'b2' })])
    expect(computeDossierTotals(dossier).branchCount).toBe(2)
  })

  it('sums ENROUTE distance across all branches', () => {
    const b1 = makeBranch({ id: 'b1', segments: [makeSegment({ distanceNm: 60 })] })
    const b2 = makeBranch({ id: 'b2', segments: [makeSegment({ distanceNm: 40 })] })
    const dossier = makeDossier([b1, b2])
    expect(computeDossierTotals(dossier).totalDistanceNm).toBe(100)
  })

  it('excludes ALTERNATE segments from distance', () => {
    const b1 = makeBranch({
      id: 'b1',
      segments: [makeSegment({ distanceNm: 60 }), makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })],
    })
    const dossier = makeDossier([b1])
    expect(computeDossierTotals(dossier).totalDistanceNm).toBe(60)
  })

  it('sums raw flight time across all branches using regimes[0].speed, no wind', () => {
    // 120nm / 120kt * 60 = 60 min per branch, two branches
    const dossier = makeDossier([makeBranch({ id: 'b1' }), makeBranch({ id: 'b2' })])
    expect(computeDossierTotals(dossier).totalRawTimeMin).toBeCloseTo(120, 1)
  })

  it('accounts for wind in raw flight time', () => {
    // cap 270, vent du 270 a 20kt -> GS = 100; 120nm/100kt*60 = 72min
    const b1 = makeBranch({ segments: [makeSegment({ wind: { directionDeg: 270, speedKt: 20 } })] })
    const dossier = makeDossier([b1])
    expect(computeDossierTotals(dossier).totalRawTimeMin).toBeCloseTo(72, 1)
  })

  it('returns zeros for a dossier with no branches', () => {
    const dossier = makeDossier([])
    expect(computeDossierTotals(dossier)).toEqual({ branchCount: 0, totalDistanceNm: 0, totalRawTimeMin: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aviation/dossierTotals.test.ts`
Expected: FAIL — `Cannot find module '../../lib/aviation/dossierTotals'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/aviation/dossierTotals.ts`:

```ts
import { computeSegmentTiming } from './windTriangle'
import type { FlightDossier } from '../../types'

export interface DossierTotals {
  branchCount: number
  totalDistanceNm: number
  totalRawTimeMin: number
}

export function computeDossierTotals(dossier: FlightDossier): DossierTotals {
  const regime = dossier.aircraft.characteristics.regimes[0]
  let totalDistanceNm = 0
  let totalRawTimeMin = 0

  for (const branch of dossier.branches) {
    for (const segment of branch.segments) {
      if (segment.role !== 'ENROUTE') continue
      totalDistanceNm += segment.distanceNm
      totalRawTimeMin += computeSegmentTiming(segment, regime.speed).timeMin
    }
  }

  return { branchCount: dossier.branches.length, totalDistanceNm, totalRawTimeMin }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/aviation/dossierTotals.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/aviation/dossierTotals.ts src/__tests__/aviation/dossierTotals.test.ts
git commit -m "feat: add computeDossierTotals for dossier-wide branch/distance/time aggregates"
```

---

### Task 2: Enrich `ChangeAircraftModal` with TAS + autonomie

**Files:**
- Modify: `src/components/ui/ChangeAircraftModal.tsx`
- Test: Modify `src/__tests__/components/ChangeAircraftModal.test.tsx`

**Interfaces:**
- Consumes: `totalFuelCapacity(massBalance: AircraftMassBalance): number` (`src/lib/aviation/wbCalc.ts`, existing), `formatDuration(min: number): string` (`src/lib/format.ts`, existing).
- Produces: no new exports — same `ChangeAircraftModalProps` as before (`currentAircraftId`, `onConfirm`, `onClose`).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/components/ChangeAircraftModal.test.tsx` (after the existing `'shows a message when the fleet has no other aircraft'` test):

```tsx
  it('shows TAS and autonomie for each candidate aircraft', () => {
    saveAircraft(makeAircraft({ id: 'ac-1' }))
    saveAircraft(makeAircraft({
      id: 'ac-2', name: 'Cessna 172', registration: 'F-GXYZ',
      characteristics: { regimes: [{ label: '75%', speed: 110, fuelBurn: 28 }] },
      massBalance: {
        emptyWeight: 620, emptyArm: 810,
        stations: [{ name: 'Carburant', arm: 810, kind: 'fuel', capacityL: 140 }],
        envelopePoints: [],
      },
    }))
    render(<ChangeAircraftModal currentAircraftId="ac-1" onConfirm={vi.fn()} onClose={vi.fn()} />)
    // 140L / 28L/h = 5h -> formatDuration(300) = "5h00"
    expect(screen.getByText(/110 kt · 5h00 autonomie/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/ChangeAircraftModal.test.tsx -t "TAS and autonomie"`
Expected: FAIL — text not found

- [ ] **Step 3: Write minimal implementation**

In `src/components/ui/ChangeAircraftModal.tsx`, add imports:

```tsx
import { useState, useMemo } from 'react'
import type { Aircraft } from '../../types'
import { listAircraft } from '../../lib/storage'
import { totalFuelCapacity } from '../../lib/aviation/wbCalc'
import { formatDuration } from '../../lib/format'
import { Button } from './Button'
```

Replace the fleet row button body:

```tsx
                {fleet.map(a => {
                  const regime = a.characteristics.regimes[0]
                  const autonomyMin = (totalFuelCapacity(a.massBalance) / regime.fuelBurn) * 60
                  return (
                    <button
                      key={a.id}
                      onClick={() => setPending(a)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-[var(--bg-inset)] transition-colors"
                    >
                      <div className="text-sm font-medium text-[var(--text-1)]">{a.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{a.registration}</div>
                      <div className="text-xs text-[var(--text-dim)] font-mono mt-0.5">
                        {regime.speed} kt · {formatDuration(autonomyMin)} autonomie
                      </div>
                    </button>
                  )
                })}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/ChangeAircraftModal.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ChangeAircraftModal.tsx src/__tests__/components/ChangeAircraftModal.test.tsx
git commit -m "feat: show TAS and autonomie per candidate aircraft in ChangeAircraftModal"
```

---

### Task 3: `AppChrome` — editable flight date

**Files:**
- Modify: `src/components/AppChrome.tsx`
- Modify: `src/App.tsx`
- Test: Create `src/__tests__/components/AppChrome.test.tsx`

**Interfaces:**
- Produces: new `AppChromeProps.onUpdateDate?: (date: string) => void`, consumed by `App.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/AppChrome.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppChrome } from '../../components/AppChrome'
import type { FlightDossier } from '../../types'

function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Nav Test', date: '2026-07-19', departureTime: '',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: {
        emptyWeight: 600, emptyArm: 800,
        stations: [{ name: 'Carburant', arm: 800, kind: 'fuel', capacityL: 120 }],
        envelopePoints: [],
      },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [
      { id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null }], notes: '' },
    ],
    fuelInputs: {},
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('AppChrome — date editing', () => {
  it('shows the dossier date as read-only text when onUpdateDate is not provided', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    expect(screen.getByText('2026-07-19')).toBeInTheDocument()
  })

  it('clicking the date switches to a native date input, Enter confirms', () => {
    const onUpdateDate = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onUpdateDate={onUpdateDate} />)
    fireEvent.click(screen.getByText('2026-07-19'))
    const input = screen.getByDisplayValue('2026-07-19')
    expect(input).toHaveAttribute('type', 'date')
    fireEvent.change(input, { target: { value: '2026-08-01' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdateDate).toHaveBeenCalledWith('2026-08-01')
  })

  it('blurring the date input confirms the edit', () => {
    const onUpdateDate = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onUpdateDate={onUpdateDate} />)
    fireEvent.click(screen.getByText('2026-07-19'))
    const input = screen.getByDisplayValue('2026-07-19')
    fireEvent.change(input, { target: { value: '2026-09-05' } })
    fireEvent.blur(input)
    expect(onUpdateDate).toHaveBeenCalledWith('2026-09-05')
  })

  it('pressing Escape cancels the date edit without calling onUpdateDate', () => {
    const onUpdateDate = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onUpdateDate={onUpdateDate} />)
    fireEvent.click(screen.getByText('2026-07-19'))
    const input = screen.getByDisplayValue('2026-07-19')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onUpdateDate).not.toHaveBeenCalled()
    expect(screen.getByText('2026-07-19')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/AppChrome.test.tsx`
Expected: FAIL — clicking the date text does not render a date input (no `editingDate` state yet)

- [ ] **Step 3: Write minimal implementation**

In `src/components/AppChrome.tsx`, update the props interface and destructuring:

```tsx
interface AppChromeProps {
  screen: Screen
  dossier: FlightDossier | null
  dossierTab: DossierTab
  onGoHome: () => void
  onSetTab: (tab: DossierTab) => void
  onDownload?: () => void
  onUpdateName?: (name: string) => void
  onUpdateDate?: (date: string) => void
  onChangeAircraft?: (newAircraftId: string) => void
}

export function AppChrome({ screen, dossier, dossierTab, onGoHome, onSetTab, onDownload, onUpdateName, onUpdateDate, onChangeAircraft }: AppChromeProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [showChangeModal, setShowChangeModal] = useState(false)

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

  const handleDateClick = () => {
    if (!dossier || !onUpdateDate) return
    setDateValue(dossier.date)
    setEditingDate(true)
  }

  const handleDateConfirm = () => {
    if (dateValue) onUpdateDate?.(dateValue)
    setEditingDate(false)
  }

  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleDateConfirm()
    if (e.key === 'Escape') setEditingDate(false)
  }
```

Replace the read-only date span (currently `<span className="text-[var(--text-dim)] text-xs shrink-0">{dossier.date}</span>`) with:

```tsx
            {editingDate ? (
              <input
                autoFocus
                type="date"
                value={dateValue}
                onChange={e => setDateValue(e.target.value)}
                onBlur={handleDateConfirm}
                onKeyDown={handleDateKeyDown}
                className="text-xs bg-transparent border-b border-[var(--amber)] text-[var(--text-2)] focus:outline-none shrink-0"
              />
            ) : (
              <span
                className={`text-[var(--text-dim)] text-xs shrink-0 ${onUpdateDate ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
                onClick={handleDateClick}
                title={onUpdateDate ? 'Cliquer pour modifier' : undefined}
              >
                {dossier.date}
              </span>
            )}
```

In `src/App.tsx`, add `onUpdateDate` to the `<AppChrome>` call, right after `onUpdateName`:

```tsx
        onUpdateDate={state.dossier ? (date) => {
          dispatch({ type: 'UPDATE_DOSSIER', dossier: { ...state.dossier!, date, updatedAt: new Date().toISOString() } })
        } : undefined}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/AppChrome.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AppChrome.tsx src/App.tsx src/__tests__/components/AppChrome.test.tsx
git commit -m "feat: make the flight date editable in AppChrome"
```

---

### Task 4: `AppChrome` — two-row header (aircraft card, stats, JSON relocation), drop the "Dossier" tab entry

**Files:**
- Modify: `src/components/AppChrome.tsx`
- Test: Modify `src/__tests__/components/AppChrome.test.tsx`

**Interfaces:**
- Consumes: `computeDossierTotals(dossier: FlightDossier): DossierTotals` (Task 1), `totalFuelCapacity` (`src/lib/aviation/wbCalc.ts`), `formatDuration` (`src/lib/format.ts`).
- Produces: no new props. `DOSSIER_TABS` now has 4 entries (was 5).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/components/AppChrome.test.tsx`:

```tsx
describe('AppChrome — aircraft card', () => {
  it('shows aircraft name, registration, TAS and autonomie', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    expect(screen.getByText('DR400 · F-GABC')).toBeInTheDocument()
    // 120L / 30L/h = 4h -> formatDuration(240) = "4h00"
    expect(screen.getByText(/120 kt · 4h00 autonomie/)).toBeInTheDocument()
  })
})

describe('AppChrome — synthèse dossier', () => {
  it('shows branch count, total distance and raw flight time badges', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    // 1 branch, 120nm ENROUTE, 120nm/120kt*60 = 60min -> "1h00"
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('120 nm')).toBeInTheDocument()
    expect(screen.getByText('1h00')).toBeInTheDocument()
  })

  it('calls onDownload when the JSON button is clicked', () => {
    const onDownload = vi.fn()
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} onDownload={onDownload} />)
    fireEvent.click(screen.getByRole('button', { name: '↓ JSON' }))
    expect(onDownload).toHaveBeenCalled()
  })

  it('no longer shows a "Dossier" tab', () => {
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    expect(screen.queryByText('Dossier')).not.toBeInTheDocument()
    expect(screen.getByText('Vols')).toBeInTheDocument()
    expect(screen.getByText('Perf')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/AppChrome.test.tsx`
Expected: FAIL — aircraft card text and stat badges don't exist yet

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/components/AppChrome.tsx` with:

```tsx
import { useState } from 'react'
import type { FlightDossier, DossierTab, Screen } from '../types'
import { TabBar } from './ui/Tabs'
import { Button } from './ui/Button'
import { ChangeAircraftModal } from './ui/ChangeAircraftModal'
import { computeDossierTotals } from '../lib/aviation/dossierTotals'
import { totalFuelCapacity } from '../lib/aviation/wbCalc'
import { formatDuration } from '../lib/format'

const DOSSIER_TABS: { key: DossierTab; label: string }[] = [
  { key: 'branches', label: 'Vols' },
  { key: 'fuel', label: 'Carbu' },
  { key: 'wb', label: 'M&C' },
  { key: 'perf', label: 'Perf' },
]

interface AppChromeProps {
  screen: Screen
  dossier: FlightDossier | null
  dossierTab: DossierTab
  onGoHome: () => void
  onSetTab: (tab: DossierTab) => void
  onDownload?: () => void
  onUpdateName?: (name: string) => void
  onUpdateDate?: (date: string) => void
  onChangeAircraft?: (newAircraftId: string) => void
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center rounded border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-1">
      <p className="font-mono font-semibold text-sm text-[var(--text-1)]">{value}</p>
      <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">{label}</p>
    </div>
  )
}

export function AppChrome({ screen, dossier, dossierTab, onGoHome, onSetTab, onDownload, onUpdateName, onUpdateDate, onChangeAircraft }: AppChromeProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [showChangeModal, setShowChangeModal] = useState(false)

  const totals = dossier ? computeDossierTotals(dossier) : null

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

  const handleDateClick = () => {
    if (!dossier || !onUpdateDate) return
    setDateValue(dossier.date)
    setEditingDate(true)
  }

  const handleDateConfirm = () => {
    if (dateValue) onUpdateDate?.(dateValue)
    setEditingDate(false)
  }

  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleDateConfirm()
    if (e.key === 'Escape') setEditingDate(false)
  }

  return (
    <header
      className="sticky top-0 z-50 flex flex-col no-print"
      style={{ backgroundColor: 'var(--bg-chrome)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Thin top bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          onClick={onGoHome}
          className="text-[var(--amber)] font-semibold text-sm tracking-wide hover:opacity-80 transition-opacity"
        >
          dossier de vol
        </button>
        {!dossier && (
          <span className="text-[var(--text-dim)] text-xs">préparation de vol VFR</span>
        )}
        {screen !== 'home' && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onGoHome}>
            ← Accueil
          </Button>
        )}
      </div>

      {/* Dossier block — identité + synthèse */}
      {dossier && totals && (
        <div className="px-4 py-3 border-t border-[var(--border)] flex flex-col gap-2.5">
          {/* Row 1 — identité */}
          <div className="flex items-center gap-3 flex-wrap">
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
                className={`text-[var(--text-2)] text-sm truncate flex-1 min-w-0 ${onUpdateName ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
                onClick={handleNameClick}
                title={onUpdateName ? 'Cliquer pour renommer' : undefined}
              >
                {dossier.name}
              </span>
            )}

            {editingDate ? (
              <input
                autoFocus
                type="date"
                value={dateValue}
                onChange={e => setDateValue(e.target.value)}
                onBlur={handleDateConfirm}
                onKeyDown={handleDateKeyDown}
                className="text-xs bg-transparent border-b border-[var(--amber)] text-[var(--text-2)] focus:outline-none shrink-0"
              />
            ) : (
              <span
                className={`text-[var(--text-dim)] text-xs shrink-0 ${onUpdateDate ? 'cursor-pointer hover:text-[var(--text-1)]' : ''}`}
                onClick={handleDateClick}
                title={onUpdateDate ? 'Cliquer pour modifier' : undefined}
              >
                {dossier.date}
              </span>
            )}

            <div className="flex flex-col shrink-0 leading-tight">
              <span className="text-[var(--text-2)] text-xs">
                {dossier.aircraft.name} · {dossier.aircraft.registration}
              </span>
              <span className="text-[var(--text-dim)] text-[10px] font-mono">
                {dossier.aircraft.characteristics.regimes[0].speed} kt ·{' '}
                {formatDuration(
                  (totalFuelCapacity(dossier.aircraft.massBalance) / dossier.aircraft.characteristics.regimes[0].fuelBurn) * 60
                )}{' '}
                autonomie
              </span>
            </div>
            {onChangeAircraft && (
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setShowChangeModal(true)}>
                Changer
              </Button>
            )}
          </div>

          {/* Row 2 — synthèse + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatBadge label="Branches" value={String(totals.branchCount)} />
            <StatBadge label="Distance" value={`${totals.totalDistanceNm.toFixed(0)} nm`} />
            <StatBadge label="Temps brut" value={formatDuration(totals.totalRawTimeMin)} />
            <div className="ml-auto flex gap-2">
              {onDownload && (
                <Button variant="secondary" size="sm" onClick={onDownload}>
                  ↓ JSON
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar (only when dossier is open) */}
      {screen === 'dossier' && dossier && (
        <TabBar
          tabs={DOSSIER_TABS}
          active={dossierTab}
          onChange={(key) => onSetTab(key as DossierTab)}
          className="px-4"
        />
      )}
      {showChangeModal && dossier && onChangeAircraft && (
        <ChangeAircraftModal
          currentAircraftId={dossier.aircraft.id}
          onConfirm={onChangeAircraft}
          onClose={() => setShowChangeModal(false)}
        />
      )}
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/AppChrome.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: All existing tests still PASS (this file is used by no other test), no type errors

- [ ] **Step 6: Commit**

```bash
git add src/components/AppChrome.tsx src/__tests__/components/AppChrome.test.tsx
git commit -m "feat: consolidate AppChrome header into a two-row identity/synthèse block, drop Dossier tab entry"
```

---

### Task 5: Extract `DossierPrintSheet`, mount it permanently, add "Imprimer", finish removing the Dossier tab

**Files:**
- Create: `src/features/dossier/DossierPrintSheet.tsx`
- Delete: `src/features/dossier/DossierPanel.tsx`
- Modify: `src/screens/DossierScreen.tsx`
- Modify: `src/types/index.ts`
- Modify: `src/components/AppChrome.tsx`
- Test: Create `src/__tests__/dossier/DossierPrintSheet.test.tsx`
- Test: Create `src/__tests__/screens/DossierScreen.test.tsx`
- Test: Modify `src/__tests__/components/AppChrome.test.tsx`

**Interfaces:**
- Produces: `DossierPrintSheet({ dossier }: { dossier: FlightDossier })` — same rendering as the old `DossierPanel`, minus its action buttons and summary cards. Consumed by `DossierScreen`.
- `DossierTab` (`src/types/index.ts`) drops `'dossier'`: `'branches' | 'fuel' | 'wb' | 'perf'`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/dossier/DossierPrintSheet.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DossierPrintSheet } from '../../features/dossier/DossierPrintSheet'
import type { FlightDossier } from '../../types'

function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Nav Test', date: '2026-07-19', departureTime: '09:00',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: {
        emptyWeight: 600, emptyArm: 800,
        stations: [{ name: 'Carburant', arm: 800, kind: 'fuel', capacityL: 120 }],
        envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
      },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [
      { id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null }], notes: '' },
    ],
    fuelInputs: {
      b1: { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' },
    },
    loading: { Carburant: 50 },
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('DossierPrintSheet', () => {
  it('renders the branches table', () => {
    render(<DossierPrintSheet dossier={makeDossier()} />)
    expect(screen.getByText('Branches de vol')).toBeInTheDocument()
    expect(screen.getByText('Aller')).toBeInTheDocument()
  })

  it('renders the Masse & Centrage sheet', () => {
    render(<DossierPrintSheet dossier={makeDossier()} />)
    expect(screen.getByText('Masse & Centrage')).toBeInTheDocument()
    expect(screen.getByText('TOTAL départ')).toBeInTheDocument()
  })

  it('no longer renders action buttons or the summary cards (moved to AppChrome)', () => {
    render(<DossierPrintSheet dossier={makeDossier()} />)
    expect(screen.queryByRole('button', { name: 'Imprimer (A4)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Télécharger JSON' })).not.toBeInTheDocument()
    expect(screen.queryByText('Distance totale')).not.toBeInTheDocument()
  })
})
```

Create `src/__tests__/screens/DossierScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DossierScreen } from '../../screens/DossierScreen'
import type { FlightDossier } from '../../types'

function makeDossier(): FlightDossier {
  return {
    id: 'd-1', name: 'Nav Test', date: '2026-07-19', departureTime: '09:00',
    aircraft: {
      id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-07-19T00:00:00.000Z',
      characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
      massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
      performance: {
        toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
        ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      },
    },
    branches: [
      { id: 'b1', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null }], notes: '' },
    ],
    fuelInputs: { b1: { pilotFactor: 0, taxiMin: 10, landingMin: 15, alternateLandingMin: 15, extras: [], reserveMode: 'day' } },
    loading: {},
    perfRegulatory: 1.0,
    perfInputs: {},
    perfExtraAerodromes: [],
    notes: '',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

describe('DossierScreen', () => {
  it('always mounts the print sheet, regardless of the active tab', () => {
    render(<DossierScreen dossier={makeDossier()} activeTab="fuel" onUpdate={vi.fn()} />)
    expect(screen.getByText('Masse & Centrage')).toBeInTheDocument()
  })

  it('mounts the print sheet inside a .print-only wrapper', () => {
    const { container } = render(<DossierScreen dossier={makeDossier()} activeTab="branches" onUpdate={vi.fn()} />)
    const printOnly = container.querySelector('.print-only')
    expect(printOnly).not.toBeNull()
    expect(printOnly?.textContent).toContain('Masse & Centrage')
  })
})
```

Add to `src/__tests__/components/AppChrome.test.tsx`:

```tsx
describe('AppChrome — impression', () => {
  it('calls window.print when the Imprimer button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<AppChrome screen="dossier" dossier={makeDossier()} dossierTab="branches" onGoHome={vi.fn()} onSetTab={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }))
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/dossier/DossierPrintSheet.test.tsx src/__tests__/screens/DossierScreen.test.tsx src/__tests__/components/AppChrome.test.tsx`
Expected: FAIL — `DossierPrintSheet` module doesn't exist; "Imprimer" button doesn't exist

- [ ] **Step 3a: Create `DossierPrintSheet`**

Create `src/features/dossier/DossierPrintSheet.tsx` (same rendering as the old `DossierPanel`, minus the `no-print` action-buttons row and the Branches/Distance summary cards, which are now covered by `AppChrome`):

```tsx
import type { FlightDossier } from '../../types'
import { computeWB, totalFuelCapacity } from '../../lib/aviation/wbCalc'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
import { Badge } from '../../components/ui/Badge'

interface Props { dossier: FlightDossier }

export function DossierPrintSheet({ dossier }: Props) {
  const { aircraft, branches, loading, fuelInputs } = dossier

  const wbDep = computeWB(aircraft.massBalance, loading)

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }

  const regime = aircraft.characteristics.regimes[0]

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── SHEET 1: Header + Branches summary ──────────────────────────── */}
      <div className="print-sheet px-6 pb-8">
        <header className="mb-6 pb-4 border-b-2 border-[var(--amber)]">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-1)]">{dossier.name}</h1>
              <p className="text-sm text-[var(--text-muted)]">
                {dossier.date} · {dossier.departureTime} UTC · {aircraft.registration}
              </p>
            </div>
            <div className="text-right text-sm font-mono text-[var(--text-muted)]">
              <p>{aircraft.name}</p>
              <p>{regime.speed} kt · {regime.fuelBurn} L/h</p>
            </div>
          </div>
        </header>

        {branches.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Branches de vol</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-dim)]">
                  <th className="text-left py-1 pr-2">Branche</th>
                  <th className="text-left py-1 pr-2">Points</th>
                  <th className="text-right py-1 px-1">Dist (nm)</th>
                  <th className="text-right py-1 px-1">Carbu min</th>
                  <th className="text-left py-1 pl-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(branch => {
                  const fi = fuelInputs[branch.id]
                  const fuelResult = fi ? computeBranchFuel(branch, fi, regime) : null
                  const fuelMinL = fuelResult?.requiredFuelL ?? null
                  const distNm = branch.segments.filter(seg => seg.role === 'ENROUTE').reduce((s, seg) => s + seg.distanceNm, 0)
                  const aeroStr = branch.aerodromes
                    .filter(a => a.role === 'DEP' || a.role === 'ARR')
                    .map(a => a.identifier).join(' → ')
                  return (
                    <tr key={branch.id} className="border-b border-[var(--border)]/50">
                      <td className="py-1 pr-2 font-medium text-[var(--text-1)]">{branch.label}</td>
                      <td className="py-1 pr-2 font-mono text-[var(--text-2)]">{aeroStr || '—'}</td>
                      <td className="text-right py-1 px-1 font-mono">{distNm.toFixed(0)}</td>
                      <td className="text-right py-1 px-1 font-mono">
                        {fuelMinL !== null ? `${fuelMinL.toFixed(1)} L` : '—'}
                      </td>
                      <td className="text-left py-1 pl-2 text-[var(--text-dim)]">{branch.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Aucune branche définie.</p>
        )}
      </div>

      {/* ── SHEET 2: W&B ────────────────────────────────────────────────── */}
      <div className="print-sheet px-6 pb-8 mt-8 no-print-break">
        <header className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-[var(--text-1)]">Masse & Centrage</h2>
            <p className="text-xs font-mono text-[var(--text-muted)]">{dossier.name} · {dossier.date}</p>
          </div>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Chargement</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-dim)] border-b border-[var(--border)]">
                  <th className="text-left py-1">Station</th>
                  <th className="text-right py-1">Bras (mm)</th>
                  <th className="text-right py-1">Masse (kg)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border)]/30">
                  <td className="py-1 text-[var(--text-2)]">À vide</td>
                  <td className="text-right py-1 font-mono">{aircraft.massBalance.emptyArm}</td>
                  <td className="text-right py-1 font-mono">{aircraft.massBalance.emptyWeight}</td>
                </tr>
                {aircraft.massBalance.stations.map(st => (
                  <tr key={st.name} className="border-b border-[var(--border)]/30">
                    <td className="py-1 text-[var(--text-2)]">{st.name}</td>
                    <td className="text-right py-1 font-mono">{st.arm}</td>
                    <td className="text-right py-1 font-mono">
                      {st.kind === 'fuel'
                        ? ((loading[st.name] ?? 0) * FUEL_DENSITY_KGL).toFixed(1)
                        : (loading[st.name] ?? 0).toFixed(1)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border)] font-semibold">
                  <td className="py-1">TOTAL départ</td>
                  <td className="text-right py-1 font-mono">{wbDep.cg.toFixed(0)}</td>
                  <td className="text-right py-1 font-mono">{wbDep.totalWeight.toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2">
              <Badge variant={wbDep.inEnvelope ? 'success' : 'error'}>
                {wbDep.inEnvelope ? 'Dans l\'enveloppe' : 'HORS ENVELOPPE'}
              </Badge>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Carburant par branche</h3>
            {branches.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">Aucune branche.</p>
            ) : (
              <dl className="space-y-2 text-xs">
                {branches.map(branch => {
                  const fi = fuelInputs[branch.id]
                  if (!fi) return (
                    <div key={branch.id} className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">{branch.label}</dt>
                      <dd className="font-mono text-[var(--text-dim)]">—</dd>
                    </div>
                  )
                  const { requiredFuelL, requiredFuelKg, reserveMin } = computeBranchFuel(branch, fi, regime)
                  return (
                    <div key={branch.id} className="border-b border-[var(--border)]/30 pb-1">
                      <div className="flex justify-between font-medium">
                        <dt className="text-[var(--text-1)]">{branch.label}</dt>
                        <dd className="font-mono">{requiredFuelL.toFixed(1)} L</dd>
                      </div>
                      <div className="flex justify-between text-[var(--text-dim)]">
                        <dt>Réserve {fmtTime(reserveMin)} · {fi.reserveMode === 'day' ? 'Jour' : 'Nuit'}</dt>
                        <dd className="font-mono">{requiredFuelKg.toFixed(1)} kg</dd>
                      </div>
                    </div>
                  )
                })}
                <div className="flex justify-between text-[var(--text-dim)]">
                  <dt>Capacité avion</dt>
                  <dd className="font-mono">{totalFuelCapacity(aircraft.massBalance)} L</dd>
                </div>
              </dl>
            )}
          </section>
        </div>

        <section className="mt-6">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Remarques</h3>
          <div className="border border-[var(--border)] rounded min-h-[80px] p-2 text-xs text-[var(--text-dim)]">
            {dossier.notes || <span className="italic">—</span>}
          </div>
        </section>
      </div>
    </div>
  )
}
```

Delete `src/features/dossier/DossierPanel.tsx`.

- [ ] **Step 3b: Mount it permanently from `DossierScreen`**

In `src/screens/DossierScreen.tsx`, replace the `DossierPanel` import with `DossierPrintSheet`, remove the `activeTab === 'dossier'` branch, and always render the print sheet:

```tsx
import type { FlightDossier, DossierTab, FlightBranch, FuelInputs } from '../types'
import { BranchesPanel } from '../features/branches/BranchesPanel'
import { FuelPanel } from '../features/fuel/FuelPanel'
import { WBPanel } from '../features/wb/WBPanel'
import { PerfPanel } from '../features/perf/PerfPanel'
import { DossierPrintSheet } from '../features/dossier/DossierPrintSheet'
import { DEFAULT_FUEL_INPUTS } from '../lib/aviation/fuelCalc'
import { getAircraft } from '../lib/storage'
import { applyAircraftChange } from '../lib/dossierTransforms'

interface DossierScreenProps {
  dossier: FlightDossier
  activeTab: DossierTab
  onUpdate: (dossier: FlightDossier) => void
}

export function DossierScreen({ dossier, activeTab, onUpdate }: DossierScreenProps) {
  const now = () => new Date().toISOString()
  const update = (partial: Partial<FlightDossier>) =>
    onUpdate({ ...dossier, ...partial, updatedAt: now() })

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {activeTab === 'branches' && (
        <BranchesPanel
          branches={dossier.branches}
          aircraft={dossier.aircraft}
          onUpdate={(branches: FlightBranch[]) => {
            const synced: Record<string, FuelInputs> = {}
            for (const b of branches) {
              synced[b.id] = dossier.fuelInputs[b.id] ?? { ...DEFAULT_FUEL_INPUTS }
            }
            update({ branches, fuelInputs: synced })
          }}
        />
      )}
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
      {activeTab === 'wb' && (
        <WBPanel dossier={dossier} onUpdate={(loading) => update({ loading })} />
      )}
      {activeTab === 'perf' && (
        <PerfPanel
          dossier={dossier}
          onUpdate={(perfInputs) => update({ perfInputs })}
          onUpdateRegulatory={(perfRegulatory) => update({ perfRegulatory })}
          onUpdateExtraAerodromes={(perfExtraAerodromes) => update({ perfExtraAerodromes })}
        />
      )}
      <div className="print-only">
        <DossierPrintSheet dossier={dossier} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3c: Drop `'dossier'` from the `DossierTab` type**

In `src/types/index.ts`, change:

```ts
export type DossierTab = 'branches' | 'fuel' | 'wb' | 'perf' | 'dossier'
```

to:

```ts
export type DossierTab = 'branches' | 'fuel' | 'wb' | 'perf'
```

- [ ] **Step 3d: Add the "Imprimer" button to `AppChrome`**

In `src/components/AppChrome.tsx`, in Row 2's action group, add the "Imprimer" button before the JSON button:

```tsx
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                Imprimer
              </Button>
              {onDownload && (
                <Button variant="secondary" size="sm" onClick={onDownload}>
                  ↓ JSON
                </Button>
              )}
            </div>
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: All tests PASS, no type errors, no remaining reference to `DossierPanel` or the `'dossier'` tab value

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/features/dossier/DossierPrintSheet.tsx src/screens/DossierScreen.tsx src/types/index.ts src/components/AppChrome.tsx src/__tests__/dossier/DossierPrintSheet.test.tsx src/__tests__/screens/DossierScreen.test.tsx src/__tests__/components/AppChrome.test.tsx
git rm src/features/dossier/DossierPanel.tsx
git commit -m "feat: remove the Dossier tab, always mount the print sheet, add Imprimer to the header"
```
