# Refonte de la page Performances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les cartes aérodrome empilées de la page Performances par des onglets (comme Vols/Carbu), ajouter la saisie du vent réel avec sélection trigonométrique de piste, et un accès rapide à l'édition du référentiel aérodromes.

**Architecture:** `PerfPanel.tsx` devient un orchestrateur pur (dérivation des onglets, agrégation, marge réglementaire) qui compose trois nouveaux composants extraits (`AerodromeConditionsCard`, `PerfResultCard` ×2, modales d'ajout/édition). `FlightTabStrip` gagne des props additives (`closable`/`onClose`/`renderBadge`) sans changer son usage existant sur Vols/Carbu. Le vent réel et les champs de conditions (élévation/QNH/temp/piste) rejoignent `TerrainPerfInputs` pour survivre au démontage des onglets inactifs.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, Tailwind (variables CSS `--*` du thème).

## Global Constraints

- Aucune nouvelle dépendance npm.
- Style : classes Tailwind avec variables CSS du thème (`var(--amber)`, `var(--text-muted)`, etc.), cohérent avec le reste du projet — jamais de couleur en dur.
- Tous les libellés utilisateur en français, cohérents avec le vocabulaire existant (ex. "Décollage"/"Atterrissage", pas "Takeoff"/"Landing").
- `FlightTabStrip` reste 100% rétrocompatible : Vols (`BranchesPanel`) et Carbu (`FuelPanel`) ne doivent avoir aucun changement de comportement ni de rendu.
- Chaque tâche se termine par une suite de tests qui passe (`npx vitest run <fichier>`) avant de commit.

---

### Task 1: `crosswindKt` — composante de vent traversier

**Files:**
- Modify: `src/lib/aviation/coordinates.ts`
- Test: `src/__tests__/aviation/headwind.test.ts`

**Interfaces:**
- Produces: `crosswindKt(windDirMag: number, windSpeedKt: number, runwayHeadingMag: number): number` — positif = vent de droite, négatif = vent de gauche. Consommé par Task 9 (`AerodromeConditionsCard`).

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `src/__tests__/aviation/headwind.test.ts` (le fichier importe déjà `headwindKt` depuis `'../../../src/lib/aviation/coordinates'` — ajouter `crosswindKt` au même import) :

```ts
import { describe, it, expect } from 'vitest'
import { headwindKt, crosswindKt } from '../../../src/lib/aviation/coordinates'

// ... describe('headwindKt', ...) existant inchangé ...

describe('crosswindKt', () => {
  it('zero component when wind aligns with runway', () => {
    expect(crosswindKt(270, 20, 270)).toBeCloseTo(0, 0)
  })
  it('full crosswind from the right at 90°', () => {
    expect(crosswindKt(0, 20, 270)).toBeCloseTo(20, 0)
  })
  it('full crosswind from the left at -90°', () => {
    expect(crosswindKt(180, 20, 270)).toBeCloseTo(-20, 0)
  })
  it('partial crosswind at 45°', () => {
    // sin(45°) ≈ 0.707
    expect(crosswindKt(225, 20, 270)).toBeCloseTo(-14, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aviation/headwind.test.ts`
Expected: FAIL — `crosswindKt` n'est pas exporté par `coordinates.ts`.

- [ ] **Step 3: Write minimal implementation**

Dans `src/lib/aviation/coordinates.ts`, ajouter après `headwindKt` :

```ts
/** Composante de vent traversier par rapport à une piste (kt). Positif = vent de droite, négatif = vent de gauche. */
export function crosswindKt(
  windDirMag: number,
  windSpeedKt: number,
  runwayHeadingMag: number,
): number {
  const angle = ((windDirMag - runwayHeadingMag) + 360) % 360
  return Math.round(windSpeedKt * Math.sin(angle * Math.PI / 180))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/aviation/headwind.test.ts`
Expected: PASS (9 tests : 5 `headwindKt` existants + 4 `crosswindKt`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/aviation/coordinates.ts src/__tests__/aviation/headwind.test.ts
git commit -m "feat(perf): add crosswindKt wind-component helper"
```

---

### Task 2: Modèle de données — vent réel, conditions persistées, aérodromes supplémentaires

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/lib/storage.migration.test.ts`
- Modify: `src/__tests__/lib/dossierTransforms.test.ts`
- Modify: `src/__tests__/wb/WBPanel.test.tsx`
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx`

**Interfaces:**
- Produces: `FlightDossier.perfExtraAerodromes: string[]`, et `TerrainPerfInputs` étendu avec `windDirDeg?`, `windSpeedKt?`, `selectedRunway?`, `elevation?`, `qnh?`, `temp?`. Consommé par toutes les tâches suivantes.

- [ ] **Step 1: Write the failing test**

Ajouter dans `src/__tests__/lib/storage.migration.test.ts`, un nouveau `describe` avant la fermeture du fichier (après le bloc `legacy aircraft snapshot embedded...`, avant la dernière `})`) :

```ts
describe('dossier without perfExtraAerodromes', () => {
  it('defaults perfExtraAerodromes to an empty array', () => {
    const old = { ...baseDossierFields, branches: [], fuelInputs: {} }
    const result = migrateDossier(old)
    expect(result.perfExtraAerodromes).toEqual([])
  })

  it('preserves an existing perfExtraAerodromes array', () => {
    const modern = { ...baseDossierFields, branches: [], fuelInputs: {}, perfExtraAerodromes: ['LFPN'] }
    const result = migrateDossier(modern)
    expect(result.perfExtraAerodromes).toEqual(['LFPN'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/storage.migration.test.ts`
Expected: FAIL — `result.perfExtraAerodromes` est `undefined` (`toEqual([])` échoue).

- [ ] **Step 3: Write minimal implementation**

`src/types/index.ts` — étendre `TerrainPerfInputs` (section "Performances", ligne ~139) :

```ts
export interface TerrainPerfInputs {
  surface: 'hard' | 'grass'
  windKt: number    // kt positif = face, négatif = arrière
  toda?: number     // m disponible (optionnel, pour validation)
  lda?: number      // m disponible (optionnel, pour validation)
  windDirDeg?: number      // vent réel saisi — direction magnétique
  windSpeedKt?: number     // vent réel saisi — vitesse en kt
  selectedRunway?: string  // piste active choisie (auto ou manuelle)
  elevation?: number       // élévation terrain saisie (survit au changement d'onglet)
  qnh?: number             // QNH saisi
  temp?: number            // température saisie
}
```

Et `FlightDossier` (section "Dossier de vol", ligne ~148) — ajouter le nouveau champ juste après `perfInputs` :

```ts
export interface FlightDossier {
  id: string
  name: string
  date: string
  departureTime: string

  aircraft: AircraftSnapshot

  branches: FlightBranch[]
  fuelInputs: Record<string, FuelInputs>

  loading: StationLoading
  perfRegulatory: number
  perfInputs: Record<string, TerrainPerfInputs>
  perfExtraAerodromes: string[]   // ICAO ajoutés manuellement sur Performances (hors DEP/ARR/DVRT)

  notes: string

  createdAt: string
  updatedAt: string
}
```

`src/lib/storage.ts` — dans `migrateDossier` (ligne ~118), ajouter avant le `return data as unknown as FlightDossier` (ligne ~146) :

```ts
  if (!Array.isArray(data.perfExtraAerodromes)) data.perfExtraAerodromes = []
```

`src/App.tsx` — dans la création d'un nouveau dossier (`onNewDossier`, ligne ~115), ajouter le champ juste après `perfInputs: {}` :

```ts
                  perfRegulatory: 1.0,
                  perfInputs: {},
                  perfExtraAerodromes: [],
                  notes: '',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/storage.migration.test.ts`
Expected: PASS

- [ ] **Step 5: Fix TypeScript fixtures broken by the new required field**

Le nouveau champ `perfExtraAerodromes: string[]` est requis sur `FlightDossier` — trois fixtures typées explicitement en `FlightDossier` ne compilent plus. Corriger chacune :

`src/__tests__/lib/dossierTransforms.test.ts`, dans `baseDossier: FlightDossier` (ligne ~44, juste après `perfInputs`) :

```ts
  perfInputs: { 'b1': { surface: 'hard', windKt: 5 } },
  perfExtraAerodromes: [],
```

`src/__tests__/wb/WBPanel.test.tsx`, dans `makeDossier()` (ligne ~27, juste après `perfInputs: {}`) :

```ts
    perfRegulatory: 1, perfInputs: {}, perfExtraAerodromes: [], notes: '',
```

`src/__tests__/fuel/FuelPanel.test.tsx`, dans `makeDossier()` (ligne ~61, juste après `perfInputs: {}`) :

```ts
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, perfExtraAerodromes: [], notes: '',
```

`src/__tests__/lib/storage.migration.test.ts`, dans les deux fixtures explicitement typées `FlightDossier` du bloc `describe('modern dossier with branches already present', ...)` (lignes ~143 et ~160), ajouter `perfExtraAerodromes: []` à côté de `perfInputs`/`perfRegulatory` de chaque objet.

- [ ] **Step 6: Run the full suite to verify no regressions**

Run: `npx vitest run`
Expected: PASS — tous les tests existants compilent et passent.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/storage.ts src/App.tsx src/__tests__/lib/storage.migration.test.ts src/__tests__/lib/dossierTransforms.test.ts src/__tests__/wb/WBPanel.test.tsx src/__tests__/fuel/FuelPanel.test.tsx
git commit -m "feat(perf): add perfExtraAerodromes and persist real-wind/conditions fields on TerrainPerfInputs"
```

---

### Task 3: Constantes de rôle partagées (DEP/ARR/ALTERNATE/OVERFLY)

**Files:**
- Create: `src/lib/aviation/aerodromeRoles.ts`
- Modify: `src/features/branches/BranchesPanel.tsx`
- Test: `src/__tests__/aviation/aerodromeRoles.test.ts`

**Interfaces:**
- Produces: `AeroRole` (type), `ROLE_LABELS: Record<AeroRole, string>`, `ROLE_COLORS: Record<AeroRole, string>`, `ROLE_CYCLE: AeroRole[]`. Consommé par Task 10 (`PerfPanel`) et par `BranchesPanel.tsx` (déjà en place, juste ré-importé).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/aviation/aerodromeRoles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ROLE_LABELS, ROLE_COLORS, ROLE_CYCLE } from '../../lib/aviation/aerodromeRoles'

describe('aerodromeRoles', () => {
  it('defines a label for every role in the cycle', () => {
    for (const role of ROLE_CYCLE) {
      expect(ROLE_LABELS[role]).toBeTruthy()
    }
  })

  it('defines a color for every role in the cycle', () => {
    for (const role of ROLE_CYCLE) {
      expect(ROLE_COLORS[role]).toBeTruthy()
    }
  })

  it('cycles DEP → ARR → ALTERNATE → OVERFLY', () => {
    expect(ROLE_CYCLE).toEqual(['DEP', 'ARR', 'ALTERNATE', 'OVERFLY'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aviation/aerodromeRoles.test.ts`
Expected: FAIL — le module `../../lib/aviation/aerodromeRoles` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/aviation/aerodromeRoles.ts`:

```ts
import type { FlightAerodrome } from '../../types'

export type AeroRole = FlightAerodrome['role']

export const ROLE_LABELS: Record<AeroRole, string> = { DEP: 'DEP', ARR: 'ARR', ALTERNATE: 'ALT', OVERFLY: 'OVFL' }
export const ROLE_COLORS: Record<AeroRole, string> = {
  DEP: 'var(--blue)', ARR: 'var(--green)', ALTERNATE: 'var(--amber)', OVERFLY: 'var(--text-dim)',
}
export const ROLE_CYCLE: AeroRole[] = ['DEP', 'ARR', 'ALTERNATE', 'OVERFLY']
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/aviation/aerodromeRoles.test.ts`
Expected: PASS

- [ ] **Step 5: Update BranchesPanel.tsx to import the shared constants**

Dans `src/features/branches/BranchesPanel.tsx`, remplacer les lignes 28-38 :

```ts
type AeroRole = FlightAerodrome['role']

const ROLE_ICONS: Record<AeroRole, L.Icon> = {
  DEP: makeIcon('#4d8df0', 24), ARR: makeIcon('#46c98a', 24),
  ALTERNATE: makeIcon('#f0a93b', 20), OVERFLY: makeIcon('#888888', 16),
}
const ROLE_LABELS: Record<AeroRole, string> = { DEP: 'DEP', ARR: 'ARR', ALTERNATE: 'ALT', OVERFLY: 'OVFL' }
const ROLE_COLORS: Record<AeroRole, string> = {
  DEP: 'var(--blue)', ARR: 'var(--green)', ALTERNATE: 'var(--amber)', OVERFLY: 'var(--text-dim)',
}
const ROLE_CYCLE: AeroRole[] = ['DEP', 'ARR', 'ALTERNATE', 'OVERFLY']
```

par :

```ts
import { ROLE_LABELS, ROLE_COLORS, ROLE_CYCLE, type AeroRole } from '../../lib/aviation/aerodromeRoles'

const ROLE_ICONS: Record<AeroRole, L.Icon> = {
  DEP: makeIcon('#4d8df0', 24), ARR: makeIcon('#46c98a', 24),
  ALTERNATE: makeIcon('#f0a93b', 20), OVERFLY: makeIcon('#888888', 16),
}
```

(déplacer cette nouvelle ligne d'import en haut du fichier avec les autres imports, pas au milieu — l'extrait ci-dessus montre le remplacement du bloc de constantes ; l'import lui-même rejoint la liste d'imports en tête de fichier, ligne 7-14).

- [ ] **Step 6: Run BranchesPanel tests to verify no regression**

Run: `npx vitest run src/__tests__/branches/BranchesPanel.test.tsx`
Expected: PASS — comportement inchangé, seule la provenance des constantes change.

- [ ] **Step 7: Commit**

```bash
git add src/lib/aviation/aerodromeRoles.ts src/__tests__/aviation/aerodromeRoles.test.ts src/features/branches/BranchesPanel.tsx
git commit -m "refactor: extract shared aerodrome role constants from BranchesPanel"
```

---

### Task 4: Extension de `FlightTabStrip` (fermeture + badges)

**Files:**
- Modify: `src/components/ui/FlightTabStrip.tsx`
- Test: `src/__tests__/components/FlightTabStrip.test.tsx`

**Interfaces:**
- Consumes: rien de nouveau (composant existant).
- Produces: `FlightTabStripProps` étendu avec `closable?: boolean` par item, `onClose?: (id: string) => void`, `renderBadge?: (id: string) => ReactNode`. Consommé par Task 10 (`PerfPanel`).

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `src/__tests__/components/FlightTabStrip.test.tsx`, avant la dernière `})` du `describe('FlightTabStrip', ...)` :

```ts
  it('does not render a close button when onClose is omitted', () => {
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: true }]} activeId="b1" onSelect={vi.fn()} />)
    expect(screen.queryByLabelText(/fermer/i)).not.toBeInTheDocument()
  })

  it('does not render a close button on a non-closable tab even with onClose provided', () => {
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: false }]} activeId="b1" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText(/fermer/i)).not.toBeInTheDocument()
  })

  it('renders a close button and calls onClose with the tab id when closable', async () => {
    const onClose = vi.fn()
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: true }]} activeId="b1" onSelect={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByLabelText(/fermer/i))
    expect(onClose).toHaveBeenCalledWith('b1')
  })

  it('clicking the close button does not trigger onSelect', async () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={[{ id: 'b1', label: 'LFPN', closable: true }]} activeId="b1" onSelect={onSelect} onClose={vi.fn()} />)
    await userEvent.click(screen.getByLabelText(/fermer/i))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders badge content from renderBadge next to the label', () => {
    render(
      <FlightTabStrip
        branches={[{ id: 'b1', label: 'LFPN' }]}
        activeId="b1"
        onSelect={vi.fn()}
        renderBadge={id => <span>badge-{id}</span>}
      />
    )
    expect(screen.getByText('badge-b1')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/FlightTabStrip.test.tsx`
Expected: FAIL — `closable` n'existe pas sur le type de `branches`, aucun bouton "fermer", `renderBadge` non rendu.

- [ ] **Step 3: Write minimal implementation**

Remplacer entièrement `src/components/ui/FlightTabStrip.tsx` par :

```tsx
import { useState } from 'react'
import type { ReactNode } from 'react'

interface FlightTabStripProps {
  branches: { id: string; label: string; closable?: boolean }[]
  activeId: string
  onSelect: (id: string) => void
  onRename?: (id: string, label: string) => void
  onAdd?: () => void
  onClose?: (id: string) => void
  renderBadge?: (id: string) => ReactNode
  className?: string
}

export function FlightTabStrip({ branches, activeId, onSelect, onRename, onAdd, onClose, renderBadge, className = '' }: FlightTabStripProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className={`flex items-center gap-1 px-3 pt-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] overflow-x-auto ${className}`}>
      {branches.map(b => (
        <div
          key={b.id}
          role="button"
          tabIndex={0}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-t text-sm cursor-pointer select-none transition-colors ${
            b.id === activeId
              ? 'bg-[var(--bg-card)] text-[var(--text-1)] border border-b-0 border-[var(--border)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-1)]'
          }`}
          onClick={() => onSelect(b.id)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(b.id)
            }
          }}
        >
          {onRename && editingId === b.id ? (
            <input
              autoFocus
              defaultValue={b.label}
              className="w-20 bg-transparent border-b border-[var(--amber)] text-xs focus:outline-none"
              onBlur={e => { onRename(b.id, e.target.value || b.label); setEditingId(null) }}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span onDoubleClick={onRename ? () => setEditingId(b.id) : undefined}>{b.label}</span>
          )}
          {renderBadge?.(b.id)}
          {onClose && b.closable && (
            <button
              type="button"
              aria-label={`Fermer ${b.label}`}
              onClick={e => { e.stopPropagation(); onClose(b.id) }}
              className="text-[var(--text-dim)] hover:text-[var(--red)] text-xs px-0.5"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="px-2 py-1 text-sm text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors"
        >
          +
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/FlightTabStrip.test.tsx`
Expected: PASS (16 tests : 11 existants + 5 nouveaux)

- [ ] **Step 5: Run Vols/Carbu tests to verify no regression**

Run: `npx vitest run src/__tests__/branches/BranchesPanel.test.tsx src/__tests__/fuel/FuelPanel.test.tsx`
Expected: PASS — usage inchangé de `FlightTabStrip`, aucun `closable`/`onClose`/`renderBadge` passé.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FlightTabStrip.tsx src/__tests__/components/FlightTabStrip.test.tsx
git commit -m "feat(ui): add optional closable tabs and badge slot to FlightTabStrip"
```

---

### Task 5: Extraction du formulaire d'édition aérodrome

**Files:**
- Create: `src/features/aerodromes/AerodromeEditForm.tsx`
- Modify: `src/features/aerodromes/AerodromeScreen.tsx`
- Test: `src/__tests__/aerodromes/AerodromeEditForm.test.tsx`

**Interfaces:**
- Produces: `AerodromeEditForm({ draft, onChange })`, `RunwayEditor({ runways, onChange })` (déplacé tel quel, ré-exporté). Consommé par Task 6 (`AerodromeQuickEditModal`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/aerodromes/AerodromeEditForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeEditForm } from '../../features/aerodromes/AerodromeEditForm'
import type { StoredAerodrome } from '../../types'

function makeAerodrome(overrides: Partial<StoredAerodrome> = {}): StoredAerodrome {
  return { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '', ...overrides }
}

describe('AerodromeEditForm', () => {
  it('renders the aerodrome fields with their current values', () => {
    render(<AerodromeEditForm draft={makeAerodrome()} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Toussus')).toBeInTheDocument()
    expect(screen.getByDisplayValue('538')).toBeInTheDocument()
  })

  it('calls onChange with the updated name', async () => {
    const onChange = vi.fn()
    render(<AerodromeEditForm draft={makeAerodrome()} onChange={onChange} />)
    await userEvent.type(screen.getByDisplayValue('Toussus'), 'x')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Toussusx' }))
  })

  it('adds a runway via the RunwayEditor and calls onChange', async () => {
    const onChange = vi.fn()
    render(<AerodromeEditForm draft={makeAerodrome()} onChange={onChange} />)
    await userEvent.click(screen.getByText('+ Piste'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      runways: [{ ident: '', headingMag: 0, lengthFt: 0, surface: 'hard' }],
    }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/aerodromes/AerodromeEditForm.test.tsx`
Expected: FAIL — le module `../../features/aerodromes/AerodromeEditForm` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/aerodromes/AerodromeEditForm.tsx` (le contenu de `RunwayEditor` est déplacé tel quel depuis `AerodromeScreen.tsx` lignes 12-60) :

```tsx
import type { StoredAerodrome, RunwayInfo } from '../../types'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

export function RunwayEditor({
  runways,
  onChange,
}: {
  runways: RunwayInfo[]
  onChange: (runways: RunwayInfo[]) => void
}) {
  const add = () => onChange([...runways, { ident: '', headingMag: 0, lengthFt: 0, surface: 'hard' }])
  const remove = (i: number) => onChange(runways.filter((_, j) => j !== i))
  const update = (i: number, changes: Partial<RunwayInfo>) =>
    onChange(runways.map((r, j) => j === i ? { ...r, ...changes } : r))

  return (
    <div className="space-y-2">
      {runways.map((rwy, i) => (
        <div key={i} className="grid grid-cols-6 gap-2 items-end">
          <Input label="Piste" value={rwy.ident}
            onChange={e => update(i, { ident: e.target.value })} />
          <Input label="QFU (°)" type="number" value={rwy.headingMag}
            onChange={e => update(i, { headingMag: Number(e.target.value) })} />
          <Input label="Long. (ft)" type="number" value={rwy.lengthFt}
            onChange={e => update(i, { lengthFt: Number(e.target.value) })} />
          <Input label="TODA (m)" type="number" value={rwy.toda ?? ''}
            placeholder="—"
            onChange={e => update(i, { toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <Input label="LDA (m)" type="number" value={rwy.lda ?? ''}
            placeholder="—"
            onChange={e => update(i, { lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <div className="flex gap-1 items-end pb-0.5">
            <button
              type="button"
              onClick={() => update(i, { surface: rwy.surface === 'hard' ? 'grass' : 'hard' })}
              className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                rwy.surface === 'hard'
                  ? 'border-[var(--amber)] text-[var(--amber)]'
                  : 'border-[var(--green)] text-[var(--green)]'
              }`}
            >
              {rwy.surface === 'hard' ? 'Dur' : 'Herbe'}
            </button>
            <button onClick={() => remove(i)}
              className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm px-1">✕</button>
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add}>+ Piste</Button>
    </div>
  )
}

export function AerodromeEditForm({ draft, onChange }: {
  draft: StoredAerodrome
  onChange: (draft: StoredAerodrome) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input label="Nom" value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })} />
        <Input label="Lat" type="number" value={draft.lat}
          onChange={e => onChange({ ...draft, lat: Number(e.target.value) })} />
        <Input label="Lng" type="number" value={draft.lng}
          onChange={e => onChange({ ...draft, lng: Number(e.target.value) })} />
        <Input label="Élévation (ft)" type="number" value={draft.elevationFt}
          onChange={e => onChange({ ...draft, elevationFt: Number(e.target.value) })} />
      </div>
      <RunwayEditor
        runways={draft.runways}
        onChange={runways => onChange({ ...draft, runways })}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/aerodromes/AerodromeEditForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Update AerodromeScreen.tsx to use the extracted form**

Dans `src/features/aerodromes/AerodromeScreen.tsx` :
1. Supprimer la fonction `RunwayEditor` (lignes 12-60, déplacée à l'étape précédente).
2. Ajouter l'import : `import { AerodromeEditForm } from './AerodromeEditForm'`.
3. Remplacer le bloc d'édition inline dans `AerodromeCard` (lignes 90-111) :

```tsx
      {editing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Nom" value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            <Input label="Lat" type="number" value={draft.lat}
              onChange={e => setDraft(d => ({ ...d, lat: Number(e.target.value) }))} />
            <Input label="Lng" type="number" value={draft.lng}
              onChange={e => setDraft(d => ({ ...d, lng: Number(e.target.value) }))} />
            <Input label="Élévation (ft)" type="number" value={draft.elevationFt}
              onChange={e => setDraft(d => ({ ...d, elevationFt: Number(e.target.value) }))} />
          </div>
          <RunwayEditor
            runways={draft.runways}
            onChange={runways => setDraft(d => ({ ...d, runways }))}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>Enregistrer</Button>
            <Button variant="ghost" size="sm" onClick={cancel}>Annuler</Button>
          </div>
        </div>
      )}
```

par :

```tsx
      {editing && (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <AerodromeEditForm draft={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>Enregistrer</Button>
            <Button variant="ghost" size="sm" onClick={cancel}>Annuler</Button>
          </div>
        </div>
      )}
```

4. Retirer l'import désormais inutilisé de `Input` (ligne 9, `import { Input } from '../../components/ui/Input'`) — `AerodromeScreen.tsx` n'utilise plus que le `<input>` HTML brut pour la recherche, plus le composant `Input`.

- [ ] **Step 6: Verify the project still typechecks and lints**

Run: `npx tsc -b --noEmit`
Expected: aucune erreur (pas d'import `Input` orphelin, pas de `RunwayEditor` dupliqué).

Run: `npx eslint src/features/aerodromes/AerodromeScreen.tsx src/features/aerodromes/AerodromeEditForm.tsx`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/features/aerodromes/AerodromeEditForm.tsx src/features/aerodromes/AerodromeScreen.tsx src/__tests__/aerodromes/AerodromeEditForm.test.tsx
git commit -m "refactor(aerodromes): extract reusable AerodromeEditForm from AerodromeScreen"
```

---

### Task 6: Modale d'édition rapide du référentiel (`AerodromeQuickEditModal`)

**Files:**
- Create: `src/features/perf/AerodromeQuickEditModal.tsx`
- Test: `src/__tests__/perf/AerodromeQuickEditModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` (`src/components/ui/Modal.tsx`), `AerodromeEditForm` (Task 5), `getAerodrome`/`upsertAerodrome` (`src/lib/icao/aerodromeDb.ts`).
- Produces: `AerodromeQuickEditModal({ icao, onClose })`. Consommé par Task 10 (`PerfPanel`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/perf/AerodromeQuickEditModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUpsert = vi.fn()
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodrome: (icao: string) =>
    icao === 'LFPN' ? { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' } : undefined,
  upsertAerodrome: (a: unknown) => mockUpsert(a),
}))

import { AerodromeQuickEditModal } from '../../features/perf/AerodromeQuickEditModal'

describe('AerodromeQuickEditModal', () => {
  beforeEach(() => mockUpsert.mockClear())

  it('shows the aerodrome name pre-filled from the referential', () => {
    render(<AerodromeQuickEditModal icao="LFPN" onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('Toussus')).toBeInTheDocument()
  })

  it('starts with a blank draft when the ICAO is not in the referential', () => {
    render(<AerodromeQuickEditModal icao="LFXX" onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('')).toBeInTheDocument()
  })

  it('calls upsertAerodrome and onClose when saving', async () => {
    const onClose = vi.fn()
    render(<AerodromeQuickEditModal icao="LFPN" onClose={onClose} />)
    await userEvent.click(screen.getByText('Enregistrer'))
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ icao: 'LFPN', name: 'Toussus' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose without saving when cancelling', async () => {
    const onClose = vi.fn()
    render(<AerodromeQuickEditModal icao="LFPN" onClose={onClose} />)
    await userEvent.click(screen.getByText('Annuler'))
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/perf/AerodromeQuickEditModal.test.tsx`
Expected: FAIL — le module `../../features/perf/AerodromeQuickEditModal` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/perf/AerodromeQuickEditModal.tsx`:

```tsx
import { useState } from 'react'
import type { StoredAerodrome } from '../../types'
import { getAerodrome, upsertAerodrome } from '../../lib/icao/aerodromeDb'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { AerodromeEditForm } from '../aerodromes/AerodromeEditForm'

interface Props {
  icao: string
  onClose: () => void
}

export function AerodromeQuickEditModal({ icao, onClose }: Props) {
  const [draft, setDraft] = useState<StoredAerodrome>(
    () => getAerodrome(icao) ?? { icao, name: '', lat: 0, lng: 0, elevationFt: 0, runways: [], updatedAt: '' }
  )

  const save = () => {
    upsertAerodrome({ ...draft, updatedAt: new Date().toISOString() })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Aérodrome ${icao}`}>
      <AerodromeEditForm draft={draft} onChange={setDraft} />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={save}>Enregistrer</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/perf/AerodromeQuickEditModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/AerodromeQuickEditModal.tsx src/__tests__/perf/AerodromeQuickEditModal.test.tsx
git commit -m "feat(perf): add quick-edit modal for the aerodrome referential"
```

---

### Task 7: Modale d'ajout d'aérodrome (`AddPerfAerodromeModal`)

**Files:**
- Create: `src/features/perf/AddPerfAerodromeModal.tsx`
- Test: `src/__tests__/perf/AddPerfAerodromeModal.test.tsx`

**Interfaces:**
- Consumes: `getAerodromeDb` (`src/lib/icao/aerodromeDb.ts`).
- Produces: `AddPerfAerodromeModal({ excluded, onAdd, onClose })`. Consommé par Task 10 (`PerfPanel`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/perf/AddPerfAerodromeModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockDb = [
  { icao: 'LFPN', name: 'Toussus-le-Noble', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
]
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
}))

import { AddPerfAerodromeModal } from '../../features/perf/AddPerfAerodromeModal'

describe('AddPerfAerodromeModal', () => {
  it('shows no suggestions before typing', () => {
    render(<AddPerfAerodromeModal excluded={[]} onAdd={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText('LFPN')).not.toBeInTheDocument()
  })

  it('filters suggestions by ICAO prefix', async () => {
    render(<AddPerfAerodromeModal excluded={[]} onAdd={vi.fn()} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
    expect(screen.getByText('LFPN')).toBeInTheDocument()
    expect(screen.queryByText('LFPO')).not.toBeInTheDocument()
  })

  it('excludes aerodromes already tabbed', async () => {
    render(<AddPerfAerodromeModal excluded={['LFPN']} onAdd={vi.fn()} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LF')
    expect(screen.queryByText('LFPN')).not.toBeInTheDocument()
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })

  it('calls onAdd with the chosen ICAO', async () => {
    const onAdd = vi.fn()
    render(<AddPerfAerodromeModal excluded={[]} onAdd={onAdd} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
    await userEvent.click(screen.getByText('LFPN'))
    expect(onAdd).toHaveBeenCalledWith('LFPN')
  })

  it('calls onClose when clicking the backdrop', async () => {
    const onClose = vi.fn()
    const { container } = render(<AddPerfAerodromeModal excluded={[]} onAdd={vi.fn()} onClose={onClose} />)
    await userEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/perf/AddPerfAerodromeModal.test.tsx`
Expected: FAIL — le module `../../features/perf/AddPerfAerodromeModal` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/perf/AddPerfAerodromeModal.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { getAerodromeDb } from '../../lib/icao/aerodromeDb'

interface Props {
  excluded: string[]
  onAdd: (icao: string) => void
  onClose: () => void
}

export function AddPerfAerodromeModal({ excluded, onAdd, onClose }: Props) {
  const [query, setQuery] = useState('')
  const db = useMemo(() => getAerodromeDb(), [])
  const suggestions = useMemo(() => {
    if (query.length < 1) return []
    const q = query.toUpperCase()
    return db
      .filter(a => !excluded.includes(a.icao))
      .filter(a => a.icao.startsWith(q) || a.name.toUpperCase().includes(q))
      .slice(0, 8)
  }, [query, db, excluded])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Ajouter un aérodrome</h3>
        <input
          autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="ICAO ou nom..."
          className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2"
        />
        {suggestions.map(a => (
          <button key={a.icao} onClick={() => onAdd(a.icao)}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-inset)] rounded flex gap-2">
            <span className="font-mono text-[var(--amber)]">{a.icao}</span>
            <span className="text-[var(--text-2)] truncate">{a.name}</span>
          </button>
        ))}
        {query.length >= 1 && suggestions.length === 0 && (
          <p className="text-xs text-[var(--text-dim)] px-1">Aucun résultat</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/perf/AddPerfAerodromeModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/AddPerfAerodromeModal.tsx src/__tests__/perf/AddPerfAerodromeModal.test.tsx
git commit -m "feat(perf): add search modal for adding extra aerodrome tabs"
```

---

### Task 8: `PerfResultCard` — bloc Décollage/Atterrissage

**Files:**
- Create: `src/features/perf/PerfResultCard.tsx`
- Test: `src/__tests__/perf/PerfResultCard.test.tsx`

**Interfaces:**
- Consumes: `computePerf`, `validatePerformanceTable` (existants), `PerfConditions`, `AircraftSnapshot` (types existants).
- Produces: `PerfResultCard({ label, tableKey, aircraft, cond, availableDistance, availableLabel, perfRegulatory })`. Consommé par Task 10 (`PerfPanel`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/perf/PerfResultCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerfResultCard } from '../../features/perf/PerfResultCard'
import type { AircraftSnapshot, PerfConditions } from '../../types'

function makeAircraft(overrides: Partial<AircraftSnapshot['performance']> = {}): AircraftSnapshot {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-01-01T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
    massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[400]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[350]]] },
      ...overrides,
    },
  }
}

function makeCond(overrides: Partial<PerfConditions> = {}): PerfConditions {
  return { weight: 750, pa: 0, oat: 15, surfaceGrass: false, windKt: 0, ...overrides }
}

describe('PerfResultCard', () => {
  it('shows the label', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('Décollage')).toBeInTheDocument()
  })

  it('computes and shows the base and regulatory distances', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableLabel="TODA" perfRegulatory={1.15} />)
    expect(screen.getByText('400 m')).toBeInTheDocument()
    expect(screen.getByText('460 m')).toBeInTheDocument()
  })

  it('shows a success badge when the available distance covers the regulatory distance', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableDistance={500} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('TODA OK')).toBeInTheDocument()
  })

  it('shows an error badge when the available distance is insufficient', () => {
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={makeAircraft()} cond={makeCond()} availableDistance={300} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('TODA INSUFFISANT')).toBeInTheDocument()
  })

  it('shows an invalid-config badge and no distance when the table is malformed', () => {
    const aircraft = makeAircraft({ toTable: { weights: [], pressureAltitudes: [0], oats: [15], values: [] } })
    render(<PerfResultCard label="Décollage" tableKey="to" aircraft={aircraft} cond={makeCond()} availableLabel="TODA" perfRegulatory={1} />)
    expect(screen.getByText('Config invalide')).toBeInTheDocument()
    expect(screen.getByText(/Calcul indisponible/)).toBeInTheDocument()
  })

  it('uses the landing table when tableKey is ldg', () => {
    // perfRegulatory is 1.15 (not 1) so the base and regulatory distances render as different
    // text ("350 m" vs "403 m") — with a ×1 factor they'd collide and getByText would be ambiguous.
    render(<PerfResultCard label="Atterrissage" tableKey="ldg" aircraft={makeAircraft()} cond={makeCond()} availableLabel="LDA" perfRegulatory={1.15} />)
    expect(screen.getByText('350 m')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/perf/PerfResultCard.test.tsx`
Expected: FAIL — le module `../../features/perf/PerfResultCard` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/perf/PerfResultCard.tsx`:

```tsx
import { useMemo } from 'react'
import type { AircraftSnapshot, PerfConditions } from '../../types'
import { computePerf } from '../../lib/aviation/perfCalc'
import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

interface Props {
  label: string
  tableKey: 'to' | 'ldg'
  aircraft: AircraftSnapshot
  cond: PerfConditions
  availableDistance?: number
  availableLabel: 'TODA' | 'LDA'
  perfRegulatory: number
}

export function PerfResultCard({ label, tableKey, aircraft, cond, availableDistance, availableLabel, perfRegulatory }: Props) {
  const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable
  const validation = useMemo(() => validatePerformanceTable(table), [table])
  const canCompute = validation.errors.length === 0

  const distBase = canCompute ? computePerf(table, cond) : 0
  const distRegulatory = canCompute ? Math.round(distBase * perfRegulatory) : 0
  const distanceOk = availableDistance === undefined || distRegulatory <= availableDistance

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</h3>
        <div className="flex gap-2 flex-wrap justify-end">
          {validation.errors.length > 0 && <Badge variant="error">Config invalide</Badge>}
          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <Badge variant="warning">⚠ config partielle</Badge>
          )}
          {availableDistance !== undefined && canCompute && (
            <Badge variant={distanceOk ? 'success' : 'error'}>
              {distanceOk ? `${availableLabel} OK` : `${availableLabel} INSUFFISANT`}
            </Badge>
          )}
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="mb-3 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-1">
          {validation.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {canCompute ? (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Distance calculée</dt>
            <dd className="font-mono text-[var(--text-1)]">{distBase} m</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt className="text-[var(--text-muted)]">Dist. régl. (×{perfRegulatory.toFixed(2)})</dt>
            <dd className="font-mono text-[var(--text-1)]">{distRegulatory} m</dd>
          </div>
          {availableDistance !== undefined && (
            <div className="flex justify-between text-xs">
              <dt className="text-[var(--text-dim)]">{availableLabel} disponible</dt>
              <dd className={`font-mono ${distanceOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{availableDistance} m</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-[var(--text-dim)] italic">Calcul indisponible — corriger la configuration.</p>
      )}
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/perf/PerfResultCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/PerfResultCard.tsx src/__tests__/perf/PerfResultCard.test.tsx
git commit -m "feat(perf): extract PerfResultCard (takeoff/landing result block)"
```

---

### Task 9: `AerodromeConditionsCard` — conditions, vent réel, sélection de piste

**Files:**
- Create: `src/features/perf/AerodromeConditionsCard.tsx`
- Test: `src/__tests__/perf/AerodromeConditionsCard.test.tsx`

**Interfaces:**
- Consumes: `headwindKt`, `crosswindKt` (Task 1, `src/lib/aviation/coordinates.ts`), `RunwayInfo`/`TerrainPerfInputs` (types).
- Produces: `AerodromeConditionsCard({ icao, runways, inputs, elevation, qnh, temp, pa, da, onUpdate, onEditReferential })`. Consommé par Task 10 (`PerfPanel`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/perf/AerodromeConditionsCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AerodromeConditionsCard } from '../../features/perf/AerodromeConditionsCard'
import type { RunwayInfo, TerrainPerfInputs } from '../../types'

const runways: RunwayInfo[] = [
  { ident: '09', headingMag: 90, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
  { ident: '27', headingMag: 270, lengthFt: 3000, surface: 'hard', toda: 900, lda: 850 },
]

function makeInputs(overrides: Partial<TerrainPerfInputs> = {}): TerrainPerfInputs {
  return { surface: 'hard', windKt: 0, ...overrides }
}

const baseProps = {
  icao: 'LFPN',
  elevation: 538,
  qnh: 1013,
  temp: 15,
  pa: 538,
  da: 600,
}

describe('AerodromeConditionsCard', () => {
  it('shows the pressure and density altitude passed in', () => {
    render(<AerodromeConditionsCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={vi.fn()} />)
    expect(screen.getByText('538 ft')).toBeInTheDocument()
    expect(screen.getByText('600 ft')).toBeInTheDocument()
  })

  it('shows headwind and crosswind components on each runway button once wind is set', () => {
    render(
      <AerodromeConditionsCard {...baseProps} runways={runways}
        inputs={makeInputs({ windDirDeg: 270, windSpeedKt: 20 })}
        onUpdate={vi.fn()} onEditReferential={vi.fn()} />
    )
    expect(screen.getByText(/27.*270°.*\+20kt face.*0kt trav\./)).toBeInTheDocument()
  })

  it('auto-selects the best-headwind runway once both direction and speed are known', () => {
    // windDirDeg is pre-seeded via props (as it would be after the direction field's own onChange
    // already round-tripped through the parent) — only windSpeedKt changes in this interaction, so a
    // single fireEvent.change carries the complete numeric value without relying on keystroke
    // accumulation against a static, non-re-rendering `inputs` prop.
    const onUpdate = vi.fn()
    render(
      <AerodromeConditionsCard {...baseProps} runways={runways}
        inputs={makeInputs({ windDirDeg: 270 })}
        onUpdate={onUpdate} onEditReferential={vi.fn()} />
    )
    fireEvent.change(screen.getByLabelText(/vent vitesse/i), { target: { value: '20' } })
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ selectedRunway: '27', windKt: 20, surface: 'hard', toda: 900, lda: 850 }))
  })

  it('does not re-select a runway once one was chosen manually, even if wind changes', async () => {
    const onUpdate = vi.fn()
    render(
      <AerodromeConditionsCard {...baseProps} runways={runways}
        inputs={makeInputs({ selectedRunway: '09', windDirDeg: 270, windSpeedKt: 20 })}
        onUpdate={onUpdate} onEditReferential={vi.fn()} />
    )
    await userEvent.clear(screen.getByLabelText(/vent vitesse/i))
    await userEvent.type(screen.getByLabelText(/vent vitesse/i), '5')
    for (const call of onUpdate.mock.calls) {
      expect(call[0].selectedRunway).toBeUndefined()
    }
  })

  it('clicking a runway button selects it manually', async () => {
    const onUpdate = vi.fn()
    render(<AerodromeConditionsCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={onUpdate} onEditReferential={vi.fn()} />)
    await userEvent.click(screen.getByText(/^09/))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ selectedRunway: '09', surface: 'hard', toda: 900, lda: 850 }))
  })

  it('calls onEditReferential when the edit icon is clicked', async () => {
    const onEditReferential = vi.fn()
    render(<AerodromeConditionsCard {...baseProps} runways={runways} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={onEditReferential} />)
    await userEvent.click(screen.getByLabelText(/éditer référentiel/i))
    expect(onEditReferential).toHaveBeenCalledOnce()
  })

  it('shows a manual wind-component fallback input when the aerodrome has no runways', () => {
    render(<AerodromeConditionsCard {...baseProps} runways={[]} inputs={makeInputs()} onUpdate={vi.fn()} onEditReferential={vi.fn()} />)
    expect(screen.getByLabelText(/vent \(kt\) — manuel/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/perf/AerodromeConditionsCard.test.tsx`
Expected: FAIL — le module `../../features/perf/AerodromeConditionsCard` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/perf/AerodromeConditionsCard.tsx`:

```tsx
import type { RunwayInfo, TerrainPerfInputs } from '../../types'
import { headwindKt, crosswindKt } from '../../lib/aviation/coordinates'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface Props {
  icao: string
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  elevation: number
  qnh: number
  temp: number
  pa: number
  da: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
  onEditReferential: () => void
}

function bestRunway(runways: RunwayInfo[], windDir: number, windSpeed: number): RunwayInfo {
  return runways.reduce((best, r) =>
    headwindKt(windDir, windSpeed, r.headingMag) > headwindKt(windDir, windSpeed, best.headingMag) ? r : best
  )
}

export function AerodromeConditionsCard({
  icao, runways, inputs, elevation, qnh, temp, pa, da, onUpdate, onEditReferential,
}: Props) {
  const handleRunwaySelect = (ident: string) => {
    const rwy = runways.find(r => r.ident === ident)
    if (!rwy) return
    const wkt = (inputs.windDirDeg !== undefined && inputs.windSpeedKt !== undefined)
      ? headwindKt(inputs.windDirDeg, inputs.windSpeedKt, rwy.headingMag)
      : inputs.windKt
    onUpdate({ selectedRunway: ident, windKt: wkt, surface: rwy.surface, toda: rwy.toda, lda: rwy.lda })
  }

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Conditions</h2>
        <button type="button" aria-label="Éditer référentiel" onClick={onEditReferential}
          className="text-[var(--text-dim)] hover:text-[var(--amber)] text-sm">✏️</button>
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
                  {rwy.ident} ({rwy.headingMag}° — {hw >= 0 ? '+' : ''}{hw}kt face / {Math.abs(xw)}kt trav.)
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Terrain</p>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Élév. (ft)" type="number" value={elevation}
              onChange={e => onUpdate({ elevation: Number(e.target.value) })} />
            <Input label="QNH (hPa)" type="number" value={qnh}
              onChange={e => onUpdate({ qnh: Number(e.target.value) })} />
            <Input label="Temp (°C)" type="number" value={temp}
              onChange={e => onUpdate({ temp: Number(e.target.value) })} />
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
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="TODA (m)" type="number" value={inputs.toda ?? ''} placeholder="optionnel"
              onChange={e => onUpdate({ toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input label="LDA (m)" type="number" value={inputs.lda ?? ''} placeholder="optionnel"
              onChange={e => onUpdate({ lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
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

Run: `npx vitest run src/__tests__/perf/AerodromeConditionsCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/AerodromeConditionsCard.tsx src/__tests__/perf/AerodromeConditionsCard.test.tsx
git commit -m "feat(perf): add AerodromeConditionsCard with real-wind runway selection"
```

---

### Task 10: `PerfPanel` — orchestration, onglets, mise en page

**Files:**
- Modify: `src/features/perf/PerfPanel.tsx` (réécriture complète)
- Modify: `src/screens/DossierScreen.tsx`
- Test: `src/__tests__/perf/PerfPanel.test.tsx`

**Interfaces:**
- Consumes: `AerodromeConditionsCard` (Task 9), `PerfResultCard` (Task 8), `AddPerfAerodromeModal` (Task 7), `AerodromeQuickEditModal` (Task 6), `ROLE_LABELS`/`ROLE_COLORS`/`AeroRole` (Task 3), `FlightTabStrip` étendu (Task 4), `pressureAltitude`/`densityAltitude` (`src/lib/aviation/isa.ts`, existant), `perfExtraAerodromes` (Task 2).
- Produces: `PerfPanel({ dossier, onUpdate, onUpdateRegulatory, onUpdateExtraAerodromes })` — nouvelle prop `onUpdateExtraAerodromes` par rapport à l'actuel.

**Note :** `PerfPanel.tsx` utilise aujourd'hui des fonctions locales `pressureAlt`/`densityAlt` (approximations `+30ft/hPa` et delta-ISA linéaire) qui dupliquent, avec une précision moindre, les fonctions déjà testées `pressureAltitude`/`densityAltitude` de `src/lib/aviation/isa.ts` (utilisées nulle part ailleurs actuellement). Puisque ce refactor a justement besoin de partager PA/DA entre `AerodromeConditionsCard` (affichage) et `PerfResultCard` (calcul), ce plan bascule sur `isa.ts` plutôt que dupliquer une troisième fois l'approximation locale. Cela change légèrement (de l'ordre de quelques dizaines de ft) les altitudes affichées par rapport à la version actuelle de Perf — signalé ici explicitement car cela affecte un calcul de sécurité.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/perf/PerfPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FlightDossier, FlightBranch, FlightAerodrome, FlightSegment } from '../../types'

const mockDb = [
  { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [
    { ident: '07', headingMag: 70, lengthFt: 3000, surface: 'hard' as const, toda: 900, lda: 850 },
  ], updatedAt: '' },
  { icao: 'LFPO', name: 'Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
  { icao: 'LFOB', name: 'Beauvais', lat: 49.45, lng: 2.11, elevationFt: 350, runways: [], updatedAt: '' },
]
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
  getAerodrome: (icao: string) => mockDb.find(a => a.icao === icao),
  upsertAerodrome: vi.fn(),
}))

import { PerfPanel } from '../../features/perf/PerfPanel'

function makeAircraft() {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-01-01T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }] },
    massBalance: {
      emptyWeight: 600, emptyArm: 800,
      stations: [{ name: 'Carburant', arm: 800, kind: 'fuel' as const, capacityL: 110 }],
      envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][],
    },
    performance: {
      toTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[400]]] },
      ldgTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[350]]] },
    },
  }
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, ...overrides }
}
function makeAerodrome(identifier: string, role: FlightAerodrome['role']): FlightAerodrome {
  return { id: identifier + role, identifier, role }
}
function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}
function makeDossier(overrides: Partial<FlightDossier> = {}): FlightDossier {
  return {
    id: 'd-1', name: 'Test', date: '2026-01-01', departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches: [makeBranch()], fuelInputs: {},
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, perfExtraAerodromes: [], notes: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('PerfPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not constrain the page width (homogenized with Carbu/Vols/M&C)', () => {
    const { container } = render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(container.querySelector('.max-w-4xl')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no aerodromes at all', () => {
    render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText(/Ajoutez des aérodromes/i)).toBeInTheDocument()
  })

  it('renders one tab per unique aerodrome across branches, excluding OVERFLY', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP'), makeAerodrome('LFPO', 'ARR'), makeAerodrome('LFOB', 'OVERFLY')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByRole('button', { name: /LFPN/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /LFPO/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /LFOB/ })).not.toBeInTheDocument()
  })

  it('never renders two tabs for the same aerodrome, even across roles/branches', () => {
    const branches = [
      makeBranch({ id: 'b1', aerodromes: [makeAerodrome('LFPN', 'DEP'), makeAerodrome('LFPO', 'ARR')] }),
      makeBranch({ id: 'b2', aerodromes: [makeAerodrome('LFPO', 'DEP'), makeAerodrome('LFPN', 'ARR')] }),
    ]
    render(<PerfPanel dossier={makeDossier({ branches })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /^LFPN/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^LFPO/ })).toHaveLength(1)
  })

  it('orders tabs DEP before ALTERNATE before ARR', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPO', 'ARR'), makeAerodrome('LFOB', 'ALTERNATE'), makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    const labels = screen.getAllByRole('button', { name: /^LF/ }).map(b => b.textContent)
    expect(labels.findIndex(l => l?.includes('LFPN'))).toBeLessThan(labels.findIndex(l => l?.includes('LFOB')))
    expect(labels.findIndex(l => l?.includes('LFOB'))).toBeLessThan(labels.findIndex(l => l?.includes('LFPO')))
  })

  it('shows role badges on automatic tabs', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText('DEP')).toBeInTheDocument()
  })

  it('does not show a close button on automatic (DEP/ARR/DVRT) tabs', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.queryByLabelText(/fermer/i)).not.toBeInTheDocument()
  })

  it('shows both Décollage and Atterrissage blocks for the active tab', () => {
    const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
    render(<PerfPanel dossier={makeDossier({ branches: [branch] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={vi.fn()} />)
    expect(screen.getByText('Décollage')).toBeInTheDocument()
    expect(screen.getByText('Atterrissage')).toBeInTheDocument()
  })

  it('adding an extra aerodrome via the + button calls onUpdateExtraAerodromes', async () => {
    const onUpdateExtraAerodromes = vi.fn()
    render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={onUpdateExtraAerodromes} />)
    await userEvent.click(screen.getByText('+'))
    await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
    await userEvent.click(screen.getByText('LFPN'))
    expect(onUpdateExtraAerodromes).toHaveBeenCalledWith(['LFPN'])
  })

  it('shows a close button on a manually-added extra aerodrome tab and removes it on click', async () => {
    const onUpdateExtraAerodromes = vi.fn()
    render(<PerfPanel dossier={makeDossier({ perfExtraAerodromes: ['LFPN'] })} onUpdate={vi.fn()} onUpdateRegulatory={vi.fn()} onUpdateExtraAerodromes={onUpdateExtraAerodromes} />)
    await userEvent.click(screen.getByLabelText(/fermer/i))
    expect(onUpdateExtraAerodromes).toHaveBeenCalledWith([])
  })

  it('changing the regulatory margin calls onUpdateRegulatory with the new value', () => {
    const onUpdateRegulatory = vi.fn()
    render(<PerfPanel dossier={makeDossier()} onUpdate={vi.fn()} onUpdateRegulatory={onUpdateRegulatory} onUpdateExtraAerodromes={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '1.15' } })
    expect(onUpdateRegulatory).toHaveBeenCalledWith(1.15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/perf/PerfPanel.test.tsx`
Expected: FAIL — `PerfPanel` n'accepte pas encore `onUpdateExtraAerodromes`, pas d'onglets, pas de blocs Décollage/Atterrissage systématiques.

- [ ] **Step 3: Write minimal implementation**

Remplacer entièrement `src/features/perf/PerfPanel.tsx` par :

```tsx
import { useState, useMemo } from 'react'
import type { FlightDossier, TerrainPerfInputs, PerfConditions } from '../../types'
import { computeWB } from '../../lib/aviation/wbCalc'
import { pressureAltitude, densityAltitude } from '../../lib/aviation/isa'
import { getAerodrome } from '../../lib/icao/aerodromeDb'
import { ROLE_LABELS, ROLE_COLORS, type AeroRole } from '../../lib/aviation/aerodromeRoles'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'
import { AerodromeConditionsCard } from './AerodromeConditionsCard'
import { PerfResultCard } from './PerfResultCard'
import { AddPerfAerodromeModal } from './AddPerfAerodromeModal'
import { AerodromeQuickEditModal } from './AerodromeQuickEditModal'

const DEFAULT_PERF: TerrainPerfInputs = { surface: 'hard', windKt: 0, toda: undefined, lda: undefined }
const ROLE_ORDER: AeroRole[] = ['DEP', 'ALTERNATE', 'ARR']

interface AerodromeTab {
  icao: string
  roles: AeroRole[]
  closable: boolean
}

interface Props {
  dossier: FlightDossier
  onUpdate: (perfInputs: Record<string, TerrainPerfInputs>) => void
  onUpdateRegulatory: (regulatory: number) => void
  onUpdateExtraAerodromes: (icaos: string[]) => void
}

export function PerfPanel({ dossier, onUpdate, onUpdateRegulatory, onUpdateExtraAerodromes }: Props) {
  const { aircraft, loading, perfInputs, branches, perfRegulatory, perfExtraAerodromes } = dossier
  const [activeIcao, setActiveIcao] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingIcao, setEditingIcao] = useState<string | null>(null)

  const maxWeight = Math.max(...aircraft.massBalance.envelopePoints.map(([kg]) => kg))
  const depWeight = useMemo(() => {
    const wb = computeWB(aircraft.massBalance, loading)
    return Math.min(wb.totalWeight, maxWeight)
  }, [aircraft, loading, maxWeight])

  const aerodromeTabs = useMemo<AerodromeTab[]>(() => {
    const byIcao = new Map<string, Set<AeroRole>>()
    branches.forEach(b => b.aerodromes.forEach(a => {
      if (a.role === 'OVERFLY') return
      if (!byIcao.has(a.identifier)) byIcao.set(a.identifier, new Set())
      byIcao.get(a.identifier)!.add(a.role)
    }))

    const rank = (roles: AeroRole[]) => Math.min(...roles.map(r => ROLE_ORDER.indexOf(r)))
    const auto = [...byIcao.entries()]
      .map(([icao, roles]) => ({ icao, roles: [...roles], closable: false }))
      .sort((a, b) => rank(a.roles) - rank(b.roles))

    const extra = perfExtraAerodromes
      .filter(icao => !byIcao.has(icao))
      .map(icao => ({ icao, roles: [] as AeroRole[], closable: true }))

    return [...auto, ...extra]
  }, [branches, perfExtraAerodromes])

  const activeTab = aerodromeTabs.find(t => t.icao === activeIcao) ?? aerodromeTabs[0]

  const handleUpdate = (icao: string, changes: Partial<TerrainPerfInputs>) =>
    onUpdate({ ...perfInputs, [icao]: { ...DEFAULT_PERF, ...perfInputs[icao], ...changes } })

  const addAerodrome = (icao: string) => {
    if (!perfExtraAerodromes.includes(icao)) onUpdateExtraAerodromes([...perfExtraAerodromes, icao])
    setActiveIcao(icao)
    setShowAdd(false)
  }

  const closeAerodrome = (icao: string) =>
    onUpdateExtraAerodromes(perfExtraAerodromes.filter(i => i !== icao))

  return (
    <div className="flex flex-col h-full">
      <FlightTabStrip
        branches={aerodromeTabs.map(t => ({ id: t.icao, label: t.icao, closable: t.closable }))}
        activeId={activeTab?.icao ?? ''}
        onSelect={setActiveIcao}
        onAdd={() => setShowAdd(true)}
        onClose={closeAerodrome}
        renderBadge={icao => {
          const roles = aerodromeTabs.find(t => t.icao === icao)?.roles ?? []
          return (
            <>
              {roles.map(r => (
                <Badge key={r} style={{ backgroundColor: ROLE_COLORS[r], color: 'white' }}>{ROLE_LABELS[r]}</Badge>
              ))}
            </>
          )
        }}
      />

      <div className="flex-1 overflow-auto p-4 space-y-5">
        <Card padding="sm">
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap">
              Marge réglementaire (×)
            </label>
            <input
              type="number" min={1} step={0.01}
              value={perfRegulatory ?? 1.0}
              onChange={e => onUpdateRegulatory(Number(e.target.value) || 1.0)}
              className="w-24 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
            />
            <span className="text-xs text-[var(--text-dim)]">1.15 pour clubs Alcyons</span>
          </div>
        </Card>

        {aerodromeTabs.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center py-8">
            Ajoutez des aérodromes (DEP/ARR/DVRT) dans l'onglet Branches pour voir les fiches de performance.
          </p>
        )}

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
                icao={icao}
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
      </div>

      {showAdd && (
        <AddPerfAerodromeModal
          excluded={aerodromeTabs.map(t => t.icao)}
          onAdd={addAerodrome}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editingIcao && (
        <AerodromeQuickEditModal icao={editingIcao} onClose={() => setEditingIcao(null)} />
      )}
    </div>
  )
}
```

Puis, dans `src/screens/DossierScreen.tsx`, remplacer le bloc `{activeTab === 'perf' && ...}` (lignes 51-57) :

```tsx
      {activeTab === 'perf' && (
        <PerfPanel
          dossier={dossier}
          onUpdate={(perfInputs) => update({ perfInputs })}
          onUpdateRegulatory={(perfRegulatory) => update({ perfRegulatory })}
        />
      )}
```

par :

```tsx
      {activeTab === 'perf' && (
        <PerfPanel
          dossier={dossier}
          onUpdate={(perfInputs) => update({ perfInputs })}
          onUpdateRegulatory={(perfRegulatory) => update({ perfRegulatory })}
          onUpdateExtraAerodromes={(perfExtraAerodromes) => update({ perfExtraAerodromes })}
        />
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/perf/PerfPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/PerfPanel.tsx src/screens/DossierScreen.tsx src/__tests__/perf/PerfPanel.test.tsx
git commit -m "feat(perf): rebuild PerfPanel around aerodrome tabs and shared conditions card"
```

---

### Task 11: Vérification finale

**Files:** aucun changement de code — vérification transverse uniquement.

**Interfaces:** aucune (tâche de clôture).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — tous les tests (existants + nouveaux) passent, aucune régression sur Vols/Carbu/M&C.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc -b --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Lint the whole project**

Run: `npx eslint .`
Expected: aucune erreur.

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev`, ouvrir un dossier existant (ou en créer un), aller sur l'onglet Performances, et vérifier :
- La page occupe toute la largeur/hauteur, comme Carbu/Vols/M&C.
- Un onglet par aérodrome DEP/ARR/DVRT du plan de vol, sans doublon, dans l'ordre DEP → DVRT → ARR.
- Cliquer "+" propose une recherche, ajoute un onglet fermable pour un aérodrome hors plan de vol.
- Impossible d'ajouter deux fois le même aérodrome (déjà onglet halte exclu de la recherche).
- Sur un onglet, les blocs Décollage et Atterrissage sont tous deux visibles.
- Saisir direction + vitesse de vent sélectionne automatiquement la piste favorable (une seule fois) ; cliquer manuellement une autre piste la fige même si le vent change ensuite.
- L'icône ✏️ ouvre une modale pré-remplie sur l'aérodrome actif ; enregistrer met à jour l'aérodrome sans quitter le dossier.

- [ ] **Step 5: Final commit (if the smoke test uncovered fixes)**

```bash
git add -A
git commit -m "fix(perf): address smoke-test findings"
```

(Ignorer cette étape si aucune correction n'a été nécessaire.)
