# Scinder la carte Conditions de la page Performances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scinder l'unique carte "Conditions" de la page Performances en deux cartes : une carte météo ("Conditions" : QNH/Temp/Vent réel/PA-DA) positionnée sous la marge réglementaire, et une carte aérodrome (Élévation/Surface/TODA/LDA/piste active) titrée avec l'OACI + le nom de l'aérodrome.

**Architecture:** `AerodromeConditionsCard.tsx` est remplacé par deux composants : `AerodromeWeatherCard.tsx` (nouveau, hérite de la logique de sélection auto de piste pilotée par le vent) et `AerodromeTerrainCard.tsx` (renommage de l'existant, allégé, gagne une prop `title`). `PerfPanel.tsx` calcule le titre (`<OACI> — <nom>` ou `<OACI>` seul) et rend les deux cartes dans l'ordre : météo puis terrain.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library.

## Global Constraints

- Aucune nouvelle dépendance npm.
- Style : classes Tailwind avec variables CSS du thème (`var(--amber)`, `var(--text-muted)`, etc.), jamais de couleur en dur.
- Libellés en français, cohérents avec l'existant ("Conditions", "Météo", "Vent réel", "Piste active", "Élév. (ft)", etc. — repris tels quels de l'implémentation actuelle).
- Chaque tâche se termine par une suite de tests qui passe (`npx vitest run <fichier>`) avant de commit.
- `AerodromeWeatherCard` reste scopée à l'onglet aérodrome actif — elle n'est pas globale au dossier, contrairement à la carte "Marge réglementaire" sous laquelle elle apparaît visuellement.

---

### Task 1: `AerodromeWeatherCard` — carte météo (QNH/Temp/Vent réel/PA-DA)

**Files:**
- Create: `src/features/perf/AerodromeWeatherCard.tsx`
- Test: `src/__tests__/perf/AerodromeWeatherCard.test.tsx`

**Interfaces:**
- Consumes: `headwindKt` (`src/lib/aviation/coordinates.ts`, existant, inchangé).
- Produces: `AerodromeWeatherCard({ runways, inputs, qnh, temp, pa, da, onUpdate })`. Consommé par Task 2 (`PerfPanel.tsx`).

Ce composant n'existe pas encore et ne modifie rien d'existant — `PerfPanel.tsx` continue d'utiliser l'actuel `AerodromeConditionsCard` sans changement jusqu'à la Task 2.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/perf/AerodromeWeatherCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeWeatherCard } from '../../features/perf/AerodromeWeatherCard'
import type { RunwayInfo, TerrainPerfInputs } from '../../types'

const runways: RunwayInfo[] = [
  { ident: '09', headingMag: 90, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
  { ident: '27', headingMag: 270, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
]

function makeInputs(overrides: Partial<TerrainPerfInputs> = {}): TerrainPerfInputs {
  return { surface: 'hard', windKt: 0, ...overrides }
}

const baseProps = { qnh: 1013, temp: 15, pa: 538, da: 600 }

describe('AerodromeWeatherCard', () => {
  it('has "Conditions" as its title', () => {
    render(<AerodromeWeatherCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Conditions')).toBeInTheDocument()
  })

  it('shows the pressure and density altitude passed in', () => {
    render(<AerodromeWeatherCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} />)
    expect(screen.getByText('538 ft')).toBeInTheDocument()
    expect(screen.getByText('600 ft')).toBeInTheDocument()
  })

  it('auto-selects the best-headwind runway once both direction and speed are known', () => {
    // windDirDeg is pre-seeded via props (as it would be after the direction field's own onChange
    // already round-tripped through the parent) — only windSpeedKt changes here, so a single
    // fireEvent.change carries the complete numeric value without relying on keystroke accumulation
    // against a static, non-re-rendering `inputs` prop.
    const onUpdate = vi.fn()
    render(
      <AerodromeWeatherCard {...baseProps} runways={runways}
        inputs={makeInputs({ windDirDeg: 270 })}
        onUpdate={onUpdate} />
    )
    fireEvent.change(screen.getByLabelText(/vent vitesse/i), { target: { value: '20' } })
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ selectedRunway: '27', windKt: 20, surface: 'hard', toda: 900, lda: 850 }))
  })

  it('does not re-select a runway once one was chosen manually, even if wind changes', async () => {
    const onUpdate = vi.fn()
    render(
      <AerodromeWeatherCard {...baseProps} runways={runways}
        inputs={makeInputs({ selectedRunway: '09', windDirDeg: 270, windSpeedKt: 20 })}
        onUpdate={onUpdate} />
    )
    await userEvent.clear(screen.getByLabelText(/vent vitesse/i))
    await userEvent.type(screen.getByLabelText(/vent vitesse/i), '5')
    for (const call of onUpdate.mock.calls) {
      expect(call[0].selectedRunway).toBeUndefined()
    }
  })

  it('shows a manual wind-component fallback input when the aerodrome has no runways', () => {
    render(<AerodromeWeatherCard {...baseProps} runways={[]} inputs={makeInputs()} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText(/vent \(kt\) — manuel/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/perf/AerodromeWeatherCard.test.tsx`
Expected: FAIL — le module `../../features/perf/AerodromeWeatherCard` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/perf/AerodromeWeatherCard.tsx` (logique `bestRunway`/`updateWind` reprise à l'identique de l'actuel `src/features/perf/AerodromeConditionsCard.tsx`, sections "Terrain"/"Vent réel" fusionnées en "Météo"/"Vent réel") :

```tsx
import type { RunwayInfo, TerrainPerfInputs } from '../../types'
import { headwindKt } from '../../lib/aviation/coordinates'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface Props {
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  qnh: number
  temp: number
  pa: number
  da: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
}

function bestRunway(runways: RunwayInfo[], windDir: number, windSpeed: number): RunwayInfo {
  return runways.reduce((best, r) =>
    headwindKt(windDir, windSpeed, r.headingMag) > headwindKt(windDir, windSpeed, best.headingMag) ? r : best
  )
}

export function AerodromeWeatherCard({ runways, inputs, qnh, temp, pa, da, onUpdate }: Props) {
  const updateWind = (changes: { windDirDeg?: number; windSpeedKt?: number }) => {
    const nextDir = 'windDirDeg' in changes ? changes.windDirDeg : inputs.windDirDeg
    const nextSpeed = 'windSpeedKt' in changes ? changes.windSpeedKt : inputs.windSpeedKt
    if (!inputs.selectedRunway && runways.length > 0 && nextDir !== undefined && nextSpeed !== undefined) {
      const rwy = bestRunway(runways, nextDir, nextSpeed)
      onUpdate({
        ...changes,
        selectedRunway: rwy.ident,
        windKt: headwindKt(nextDir, nextSpeed, rwy.headingMag),
        surface: rwy.surface,
        toda: rwy.toda,
        lda: rwy.lda,
      })
      return
    }
    onUpdate(changes)
  }

  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">Conditions</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Météo</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="QNH (hPa)" type="number" value={qnh === 0 ? '' : qnh} placeholder="0"
              onChange={e => onUpdate({ qnh: e.target.value === '' ? 0 : Number(e.target.value) })} />
            <Input label="Temp (°C)" type="number" value={temp === 0 ? '' : temp} placeholder="0"
              onChange={e => onUpdate({ temp: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </div>
          <dl className="text-xs text-[var(--text-dim)] flex gap-4">
            <div className="flex gap-1"><dt>Alt pression</dt><dd className="font-mono text-[var(--text-1)]">{Math.round(pa)} ft</dd></div>
            <div className="flex gap-1"><dt>Alt densité</dt><dd className="font-mono text-[var(--text-1)]">{Math.round(da)} ft</dd></div>
          </dl>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Vent réel</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Vent dir. (°M)" type="number" value={inputs.windDirDeg ?? ''} placeholder="—"
              onChange={e => updateWind({ windDirDeg: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input label="Vent vitesse (kt)" type="number" value={inputs.windSpeedKt ?? ''} placeholder="0"
              onChange={e => updateWind({ windSpeedKt: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          {runways.length === 0 && (
            <Input label="Vent (kt) — manuel" type="number" value={inputs.windKt === 0 ? '' : inputs.windKt} placeholder="0"
              hint="+face / −arrière"
              onChange={e => onUpdate({ windKt: e.target.value === '' ? 0 : Number(e.target.value) })} />
          )}
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/perf/AerodromeWeatherCard.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/AerodromeWeatherCard.tsx src/__tests__/perf/AerodromeWeatherCard.test.tsx
git commit -m "feat(perf): add AerodromeWeatherCard (QNH/temp/wind/PA-DA)"
```

---

### Task 2: Rename to `AerodromeTerrainCard`, add aerodrome title, wire both cards into `PerfPanel`

**Files:**
- Create: `src/features/perf/AerodromeTerrainCard.tsx` (contenu ci-dessous)
- Delete: `src/features/perf/AerodromeConditionsCard.tsx`
- Create: `src/__tests__/perf/AerodromeTerrainCard.test.tsx` (contenu ci-dessous)
- Delete: `src/__tests__/perf/AerodromeConditionsCard.test.tsx`
- Modify: `src/features/perf/PerfPanel.tsx:10` (import) et `:119-151` (rendu de l'onglet actif)
- Modify: `src/__tests__/perf/PerfPanel.test.tsx` (nouveau test de titre)

**Interfaces:**
- Consumes: `AerodromeWeatherCard` (Task 1).
- Produces: `AerodromeTerrainCard({ title, runways, inputs, elevation, onUpdate, onEditReferential })`. Le composant `AerodromeConditionsCard` n'existe plus après cette tâche — aucune autre tâche n'en dépend.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/perf/AerodromeTerrainCard.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeTerrainCard } from '../../features/perf/AerodromeTerrainCard'
import type { RunwayInfo, TerrainPerfInputs } from '../../types'

const runways: RunwayInfo[] = [
  { ident: '09', headingMag: 90, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
  { ident: '27', headingMag: 270, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
]

function makeInputs(overrides: Partial<TerrainPerfInputs> = {}): TerrainPerfInputs {
  return { surface: 'hard', windKt: 0, ...overrides }
}

const baseProps = { title: 'LFPN — Toussus-le-Noble', elevation: 538 }

describe('AerodromeTerrainCard', () => {
  it('shows the given title', () => {
    render(<AerodromeTerrainCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={vi.fn()} />)
    expect(screen.getByText('LFPN — Toussus-le-Noble')).toBeInTheDocument()
  })

  it('shows headwind and crosswind components on each runway button once wind is set', () => {
    render(
      <AerodromeTerrainCard {...baseProps} runways={runways}
        inputs={makeInputs({ windDirDeg: 270, windSpeedKt: 20 })}
        onUpdate={vi.fn()} onEditReferential={vi.fn()} />
    )
    expect(screen.getByText(/27.*270°.*\+20kt face.*0kt trav\./)).toBeInTheDocument()
  })

  it('clicking a runway button selects it manually', async () => {
    const onUpdate = vi.fn()
    render(<AerodromeTerrainCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={onUpdate} onEditReferential={vi.fn()} />)
    await userEvent.click(screen.getByText(/^09/))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ selectedRunway: '09', surface: 'hard', toda: 900, lda: 850 }))
  })

  it('calls onEditReferential when the edit icon is clicked', async () => {
    const onEditReferential = vi.fn()
    render(<AerodromeTerrainCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={onEditReferential} />)
    await userEvent.click(screen.getByLabelText(/éditer référentiel/i))
    expect(onEditReferential).toHaveBeenCalledOnce()
  })
})
```

Also append to `src/__tests__/perf/PerfPanel.test.tsx` (inside the existing `describe('PerfPanel', ...)` block, alongside the other `it(...)` cases — this file already defines `mockDb`, `makeDossier`, `makeBranch`, `makeAerodrome` helpers; reuse them as-is) :

```tsx
  it('titles the aerodrome card with ICAO and name when the aerodrome is in the referential', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText('LFPN — Toussus')).toBeInTheDocument()
  })

  it('titles the aerodrome card with the ICAO alone when the aerodrome is not in the referential', () => {
    render(<PerfPanel dossier={makeDossier({ perfExtraAerodromes: ['LFXX'] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText('LFXX')).toBeInTheDocument()
  })
```

(`mockDb` in that file has `{ icao: 'LFPN', name: 'Toussus', ... }` — the first test's expected title is `'LFPN — Toussus'`. `'LFXX'` is deliberately absent from `mockDb`, exercising the fallback branch.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/perf/AerodromeTerrainCard.test.tsx src/__tests__/perf/PerfPanel.test.tsx`
Expected: FAIL — `AerodromeTerrainCard` module doesn't exist yet; the two new `PerfPanel` tests fail because the current single card still shows the generic "Conditions" title, not an ICAO/name string.

- [ ] **Step 3: Create `AerodromeTerrainCard.tsx` and delete `AerodromeConditionsCard.tsx`**

Create `src/features/perf/AerodromeTerrainCard.tsx` (piste/terrain logic unchanged from the current `AerodromeConditionsCard.tsx`, QNH/Temp/PA-DA section removed, `title` prop added) :

```tsx
import type { RunwayInfo, TerrainPerfInputs } from '../../types'
import { headwindKt, crosswindKt } from '../../lib/aviation/coordinates'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface Props {
  title: string
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  elevation: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
  onEditReferential: () => void
}

export function AerodromeTerrainCard({
  title, runways, inputs, elevation, onUpdate, onEditReferential,
}: Props) {
  const handleRunwaySelect = (ident: string) => {
    const rwy = runways.find(r => r.ident === ident)
    if (!rwy) return
    const wkt = (inputs.windDirDeg !== undefined && inputs.windSpeedKt !== undefined)
      ? headwindKt(inputs.windDirDeg, inputs.windSpeedKt, rwy.headingMag)
      : inputs.windKt
    onUpdate({ selectedRunway: ident, windKt: wkt, surface: rwy.surface, toda: rwy.toda, lda: rwy.lda })
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{title}</h2>
        <button type="button" aria-label="Éditer référentiel" onClick={onEditReferential}
          className="text-[var(--text-dim)] hover:text-[var(--amber)] text-sm">
          <span aria-hidden="true">✏️</span>
        </button>
      </div>

      {runways.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide block mb-1">
            Piste active
          </label>
          <div className="flex gap-2 flex-wrap">
            {runways.map(rwy => {
              const hasWind = inputs.windDirDeg !== undefined && inputs.windSpeedKt !== undefined
              const hw = hasWind ? headwindKt(inputs.windDirDeg!, inputs.windSpeedKt!, rwy.headingMag) : 0
              const xw = hasWind ? crosswindKt(inputs.windDirDeg!, inputs.windSpeedKt!, rwy.headingMag) : 0
              return (
                <button
                  key={rwy.ident}
                  type="button"
                  onClick={() => handleRunwaySelect(rwy.ident)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${
                    inputs.selectedRunway === rwy.ident
                      ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {rwy.ident} ({rwy.headingMag}° — {hw >= 0 ? '+' : ''}{hw}kt face / {Math.abs(xw)}kt trav.{xw !== 0 ? (xw > 0 ? ' D' : ' G') : ''})
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input label="Élév. (ft)" type="number" value={elevation === 0 ? '' : elevation} placeholder="0"
          onChange={e => onUpdate({ elevation: e.target.value === '' ? 0 : Number(e.target.value) })} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Surface</label>
          <button type="button"
            onClick={() => onUpdate({ surface: inputs.surface === 'hard' ? 'grass' : 'hard' })}
            className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
              inputs.surface === 'hard'
                ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                : 'border-[var(--green)] text-[var(--green)] bg-[var(--green)]/10'
            }`}>
            {inputs.surface === 'hard' ? 'Dur' : 'Herbe'}
          </button>
        </div>
        <Input label="TODA (m)" type="number" value={inputs.toda ?? ''} placeholder="optionnel"
          onChange={e => onUpdate({ toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
        <Input label="LDA (m)" type="number" value={inputs.lda ?? ''} placeholder="optionnel"
          onChange={e => onUpdate({ lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </div>
    </Card>
  )
}
```

Delete `src/features/perf/AerodromeConditionsCard.tsx` and `src/__tests__/perf/AerodromeConditionsCard.test.tsx` (fully superseded — every case from the latter now lives in either `AerodromeWeatherCard.test.tsx` (Task 1) or `AerodromeTerrainCard.test.tsx` (this task's Step 1)).

- [ ] **Step 4: Wire both cards into `PerfPanel.tsx`**

In `src/features/perf/PerfPanel.tsx`, replace the import at line 10:

```ts
import { AerodromeConditionsCard } from './AerodromeConditionsCard'
```

with:

```ts
import { AerodromeWeatherCard } from './AerodromeWeatherCard'
import { AerodromeTerrainCard } from './AerodromeTerrainCard'
```

Then replace the active-tab render block (currently lines 119-151) :

```tsx
        {activeTab && (() => {
          const icao = activeTab.icao
          const aero = getAerodrome(icao)
          const inputs = { ...DEFAULT_PERF, ...perfInputs[icao] }
          const elevation = inputs.elevation ?? aero?.elevationFt ?? 0
          const qnh = inputs.qnh ?? 1013
          const temp = inputs.temp ?? 15
          const pa = pressureAltitude(elevation, qnh)
          const da = densityAltitude(pa, temp)
          const cond: PerfConditions = { weight: depWeight, pa, oat: temp, surfaceGrass: inputs.surface === 'grass', windKt: inputs.windKt }

          return (
            <div className="space-y-4">
              <AerodromeConditionsCard
                runways={aero?.runways ?? []}
                inputs={inputs}
                elevation={elevation}
                qnh={qnh}
                temp={temp}
                pa={pa}
                da={da}
                onUpdate={changes => handleUpdate(icao, changes)}
                onEditReferential={() => setEditingIcao(icao)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <PerfResultCard label="Décollage" tableKey="to" aircraft={aircraft} cond={cond}
                  availableDistance={inputs.toda} availableLabel="TODA" perfRegulatory={perfRegulatory ?? 1.0} />
                <PerfResultCard label="Atterrissage" tableKey="ldg" aircraft={aircraft} cond={cond}
                  availableDistance={inputs.lda} availableLabel="LDA" perfRegulatory={perfRegulatory ?? 1.0} />
              </div>
            </div>
          )
        })()}
```

with:

```tsx
        {activeTab && (() => {
          const icao = activeTab.icao
          const aero = getAerodrome(icao)
          const inputs = { ...DEFAULT_PERF, ...perfInputs[icao] }
          const elevation = inputs.elevation ?? aero?.elevationFt ?? 0
          const qnh = inputs.qnh ?? 1013
          const temp = inputs.temp ?? 15
          const pa = pressureAltitude(elevation, qnh)
          const da = densityAltitude(pa, temp)
          const cond: PerfConditions = { weight: depWeight, pa, oat: temp, surfaceGrass: inputs.surface === 'grass', windKt: inputs.windKt }
          const title = aero ? `${icao} — ${aero.name}` : icao

          return (
            <div className="space-y-4">
              <AerodromeWeatherCard
                runways={aero?.runways ?? []}
                inputs={inputs}
                qnh={qnh}
                temp={temp}
                pa={pa}
                da={da}
                onUpdate={changes => handleUpdate(icao, changes)}
              />
              <AerodromeTerrainCard
                title={title}
                runways={aero?.runways ?? []}
                inputs={inputs}
                elevation={elevation}
                onUpdate={changes => handleUpdate(icao, changes)}
                onEditReferential={() => setEditingIcao(icao)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <PerfResultCard label="Décollage" tableKey="to" aircraft={aircraft} cond={cond}
                  availableDistance={inputs.toda} availableLabel="TODA" perfRegulatory={perfRegulatory ?? 1.0} />
                <PerfResultCard label="Atterrissage" tableKey="ldg" aircraft={aircraft} cond={cond}
                  availableDistance={inputs.lda} availableLabel="LDA" perfRegulatory={perfRegulatory ?? 1.0} />
              </div>
            </div>
          )
        })()}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/perf/AerodromeTerrainCard.test.tsx src/__tests__/perf/PerfPanel.test.tsx src/__tests__/perf/AerodromeWeatherCard.test.tsx`
Expected: PASS (all tests, including Task 1's, since `PerfPanel` now imports both new cards)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: PASS — no leftover reference to `AerodromeConditionsCard` anywhere (deleted file, deleted test file, no stray import).

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A src/features/perf/ src/__tests__/perf/
git commit -m "feat(perf): split AerodromeConditionsCard into weather + terrain cards, title the latter with the aerodrome descriptor"
```

---

### Task 3: Vérification finale

**Files:** aucun changement de code — vérification transverse uniquement.

**Interfaces:** aucune (tâche de clôture).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint .`
Expected: no errors introduced by this change (pre-existing unrelated errors in other files, if any, are out of scope).

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev`, open a dossier, go to the Performances tab, and verify:
- Right under "Marge réglementaire", a card titled "Conditions" shows QNH, Temp, Vent réel, and Alt. pression/densité.
- Below it, a card titled `<ICAO> — <name>` (e.g. "LFPN — Toussus-le-Noble") shows Élévation, Surface, TODA/LDA, and the runway selector.
- Switching aerodrome tabs updates both cards' content, and the second card's title changes to match the new tab's aerodrome.
- Entering wind in the "Conditions" card still auto-selects the best runway in the aerodrome card, exactly as before this change.

- [ ] **Step 5: Final commit (if the smoke test uncovered fixes)**

```bash
git add -A
git commit -m "fix(perf): address smoke-test findings"
```

(Skip this step if no fix was needed.)
