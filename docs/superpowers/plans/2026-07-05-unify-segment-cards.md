# Unification des blocs segment (Vols/Carbu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier le bloc "segment" entre l'onglet Vols et l'onglet Carbu en un unique composant partagé, entièrement éditable des deux côtés, repliable, avec durée affichée et sans champ notes libre.

**Architecture:** Deux nouveaux composants partagés dans `src/components/ui/` : `SegmentCard` (une carte segment, éditable, repliable, GS/WCA/durée calculés) et `SegmentsSection` (en-tête + bouton "+ Segment" + liste des segments ENROUTE avec ajout/suppression/réorganisation). Le calcul GS/WCA/durée, aujourd'hui privé à `fuelCalc.ts`, est extrait en fonction pure exportée dans `windTriangle.ts` pour être utilisable sans données carburant. `BranchesPanel` et `FuelPanel` consomment ces deux composants de façon identique ; le segment de déroutement (ALT) reste affiché où il l'est déjà aujourd'hui sur chaque page. Le champ `notes` est retiré de `FlightSegment` en toute fin de plan, une fois qu'aucun code ne le lit ou ne l'écrit plus.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, Tailwind (classes utilitaires, variables CSS `--bg-card` etc. déjà en place).

## Global Constraints

- Aucun changement de comportement de calcul (GS, WCA, durée, carburant) — uniquement extraction/partage de code existant.
- `SegmentCard` doit être éditable de façon identique sur Vols et Carbu : nom, distance, cap magnétique, vent — sur les deux pages.
- L'ajout/suppression/réorganisation de segments ENROUTE doit être possible depuis Carbu comme depuis Vols, via le composant partagé `SegmentsSection`.
- Le segment ALT (déroutement) reste affiché où il l'est déjà : à la suite de la liste sur Vols, dans son propre bloc "Déroutement planifié" sur Carbu (avec ses sous-totaux carburant spécifiques, inchangés) — seul le rendu de la carte elle-même devient le composant partagé.
- Aucun champ notes libre par segment dans l'UI. Le champ `FlightSegment.notes` est supprimé du modèle de données (pas de migration, pas de shim) une fois tout le code source migré vers les composants partagés.
- `FlightBranch.notes` (remarques libres au niveau du vol) n'est pas concerné par ce lot.
- Carte repliable : dépliée par défaut, état non persisté. En-tête repliée = `<nom> · <distance> nm · <GS> kt · <durée>`.

---

## File Map

| Fichier | Action | Rôle |
|---|---|---|
| `src/lib/aviation/windTriangle.ts` | Modifier | Ajouter `computeSegmentTiming` (GS/WCA/durée, sans dépendance carburant) |
| `src/lib/aviation/fuelCalc.ts` | Modifier | `computeSegmentDetail` appelle `computeSegmentTiming` au lieu de dupliquer le calcul |
| `src/lib/format.ts` | Créer | `formatDuration(min)` — extrait de l'actuel `fmtTime` de `FuelPanel` |
| `src/features/fuel/FuelPanel.tsx` | Modifier (x2 passes) | Utilise `formatDuration` (Task 1) ; puis `SegmentsSection`/`SegmentCard` (Task 5) |
| `src/components/ui/SegmentCard.tsx` | Créer | Carte segment partagée, éditable, repliable |
| `src/components/ui/SegmentsSection.tsx` | Créer | Section segments ENROUTE partagée (ajout/suppression/réorganisation) |
| `src/features/branches/BranchesPanel.tsx` | Modifier (x2 passes) | Utilise les composants partagés (Task 4) ; retire `notes` de `syncAlternateSegment` (Task 6) |
| `src/features/dossier` | — | Non concerné par ce lot |
| `src/types/index.ts` | Modifier | Retirer `notes` de `FlightSegment` |
| `src/App.tsx` | Modifier | Retirer `notes: ''` du segment initial |
| `src/lib/storage.ts` | Modifier | Retirer `notes: ''` du segment par défaut de migration |
| `src/__tests__/aviation/windTriangle.test.ts` | Modifier | Tests `computeSegmentTiming` |
| `src/__tests__/lib/format.test.ts` | Créer | Tests `formatDuration` |
| `src/__tests__/components/SegmentCard.test.tsx` | Créer | Tests du composant partagé |
| `src/__tests__/components/SegmentsSection.test.tsx` | Créer | Tests du composant partagé |
| `src/__tests__/branches/BranchesPanel.test.tsx` | Modifier (x2 passes) | Adapter au composant partagé (Task 4) ; retirer `notes` des fixtures (Task 6) |
| `src/__tests__/fuel/FuelPanel.test.tsx` | Modifier (x2 passes) | Adapter au composant partagé + tests croisés (Task 5) ; retirer `notes` des fixtures (Task 6) |
| `src/__tests__/aviation/fuelCalc.test.ts` | Modifier | Retirer `notes` de la fixture (Task 6) |
| `src/__tests__/lib/dossierTransforms.test.ts` | Modifier | Retirer `notes` de la fixture (Task 6) |
| `src/__tests__/lib/storage.migration.test.ts` | Modifier | Retirer `notes` des fixtures de segment (Task 6) |

---

## Task 1: Extraire le calcul de timing de segment et le format de durée

**Files:**
- Modify: `src/lib/aviation/windTriangle.ts`
- Test: `src/__tests__/aviation/windTriangle.test.ts`
- Create: `src/lib/format.ts`
- Test: `src/__tests__/lib/format.test.ts`
- Modify: `src/lib/aviation/fuelCalc.ts:1`, `:39-49`
- Modify: `src/features/fuel/FuelPanel.tsx:1`, `:31-36`, `:112`, `:136`, `:160`, `:187`, `:202`, `:231`

**Interfaces:**
- Consumes: `computeSegmentWind` (existant, `windTriangle.ts`)
- Produces: `computeSegmentTiming(segment: FlightSegment, tas: number): { gs: number; wca: number; timeMin: number }` (depuis `windTriangle.ts`) et `formatDuration(min: number): string` (depuis `src/lib/format.ts`) — consommés directement par `SegmentCard` (Task 2).

- [ ] **Step 1: Écrire les tests de `computeSegmentTiming` (doivent échouer)**

Dans `src/__tests__/aviation/windTriangle.test.ts`, remplacer la ligne 1 :

```ts
import { solveWindTriangle, computeSegmentWind } from '../../lib/aviation/windTriangle'
```

par :

```ts
import { solveWindTriangle, computeSegmentWind, computeSegmentTiming } from '../../lib/aviation/windTriangle'
import type { FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, ...overrides }
}
```

Puis ajouter à la fin du fichier :

```ts
describe('computeSegmentTiming', () => {
  it('no wind: gs=tas, wca=0, timeMin = distanceNm / tas * 60', () => {
    const r = computeSegmentTiming(makeSegment({ distanceNm: 120 }), 120)
    expect(r.gs).toBe(120)
    expect(r.wca).toBe(0)
    expect(r.timeMin).toBeCloseTo(60, 1)
  })

  it('with wind: delegates to computeSegmentWind for gs/wca', () => {
    const seg = makeSegment({ distanceNm: 120, headingMag: 270, wind: { directionDeg: 270, speedKt: 20 } })
    const r = computeSegmentTiming(seg, 120)
    expect(r.gs).toBeCloseTo(100, 1)
    expect(r.timeMin).toBeCloseTo(72, 1)
  })

  it('timeMin is Infinity when gs is exactly 0', () => {
    // cap 270, vent du 270 à 120kt (pile en face, tas=120) → gs = 0
    const seg = makeSegment({ headingMag: 270, wind: { directionDeg: 270, speedKt: 120 } })
    const r = computeSegmentTiming(seg, 120)
    expect(r.gs).toBe(0)
    expect(r.timeMin).toBe(Infinity)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --run src/__tests__/aviation/windTriangle.test.ts
```

Expected: FAIL — `computeSegmentTiming` n'existe pas dans `windTriangle.ts`.

- [ ] **Step 3: Implémenter `computeSegmentTiming`**

Dans `src/lib/aviation/windTriangle.ts`, ajouter en haut du fichier l'import de type et, à la fin du fichier, la nouvelle fonction :

```ts
import { normAngle } from './coordinates'
import type { FlightSegment } from '../../types'
```

(remplace la ligne 1 existante `import { normAngle } from './coordinates'` par ces deux lignes)

Puis, à la fin du fichier :

```ts
export interface SegmentTimingResult {
  gs: number    // vitesse sol (kt)
  wca: number   // angle de correction vent (°)
  timeMin: number  // durée du segment (min), Infinity si gs = 0
}

/**
 * Calcule GS, WCA et durée pour un segment depuis son cap/distance et le vent saisi.
 * Ne dépend d'aucune donnée carburant — utilisable sans FuelInputs/CruiseRegime.
 */
export function computeSegmentTiming(segment: FlightSegment, tas: number): SegmentTimingResult {
  let gs = tas
  let wca = 0
  if (segment.wind) {
    const r = computeSegmentWind(segment.headingMag, tas, segment.wind.directionDeg, segment.wind.speedKt)
    gs = r.gs
    wca = r.wca
  }
  const timeMin = gs !== 0 ? (segment.distanceNm / gs) * 60 : Infinity
  return { gs, wca, timeMin }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
npm test -- --run src/__tests__/aviation/windTriangle.test.ts
```

Expected: PASS (tous les tests, anciens et nouveaux).

- [ ] **Step 5: Écrire les tests de `formatDuration` (doivent échouer)**

Créer `src/__tests__/lib/format.test.ts` :

```ts
import { formatDuration } from '../../lib/format'

describe('formatDuration', () => {
  it('formats whole hours with 00 minutes', () => {
    expect(formatDuration(60)).toBe('1h00')
  })

  it('formats minutes under an hour with 0h prefix', () => {
    expect(formatDuration(25)).toBe('0h25')
  })

  it('pads single-digit minutes', () => {
    expect(formatDuration(65)).toBe('1h05')
  })

  it('returns ∞ for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('∞')
  })
})
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --run src/__tests__/lib/format.test.ts
```

Expected: FAIL — `Cannot find module '../../lib/format'`.

- [ ] **Step 7: Implémenter `formatDuration`**

Créer `src/lib/format.ts` :

```ts
export function formatDuration(min: number): string {
  if (!isFinite(min)) return '∞'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h${String(m).padStart(2, '0')}`
}
```

- [ ] **Step 8: Lancer les tests pour vérifier qu'ils passent**

```bash
npm test -- --run src/__tests__/lib/format.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9: Refactorer `fuelCalc.ts` pour utiliser `computeSegmentTiming`**

Dans `src/lib/aviation/fuelCalc.ts`, remplacer la ligne 1 :

```ts
import { computeSegmentWind } from './windTriangle'
```

par :

```ts
import { computeSegmentTiming } from './windTriangle'
```

Remplacer `computeSegmentDetail` (lignes 39-49) :

```ts
function computeSegmentDetail(segment: FlightSegment, tas: number): SegmentFuelDetail {
  let gs = tas
  let wca = 0
  if (segment.wind) {
    const r = computeSegmentWind(segment.headingMag, tas, segment.wind.directionDeg, segment.wind.speedKt)
    gs = r.gs
    wca = r.wca
  }
  const timeMin = gs !== 0 ? (segment.distanceNm / gs) * 60 : Infinity
  return { segmentId: segment.id, name: segment.name, role: segment.role, distanceNm: segment.distanceNm, gs, wca, timeMin }
}
```

par :

```ts
function computeSegmentDetail(segment: FlightSegment, tas: number): SegmentFuelDetail {
  const { gs, wca, timeMin } = computeSegmentTiming(segment, tas)
  return { segmentId: segment.id, name: segment.name, role: segment.role, distanceNm: segment.distanceNm, gs, wca, timeMin }
}
```

- [ ] **Step 10: Vérifier que `fuelCalc.test.ts` passe sans modification (preuve de non-régression)**

```bash
npm test -- --run src/__tests__/aviation/fuelCalc.test.ts
```

Expected: PASS — tous les tests existants, sans aucune modification du fichier de test (le refactor ne change aucun résultat).

- [ ] **Step 11: Refactorer `FuelPanel.tsx` pour utiliser `formatDuration`**

Dans `src/features/fuel/FuelPanel.tsx`, ajouter l'import (après la ligne 3 `import { FlightTabStrip } ...` ou avec les autres imports `lib/`) :

```ts
import { formatDuration } from '../../lib/format'
```

Supprimer la définition locale (lignes 31-36) :

```ts
  const fmtTime = (min: number) => {
    if (!isFinite(min)) return '∞'
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }
```

Remplacer chacun des 6 appels `fmtTime(...)` restants par `formatDuration(...)` (mêmes arguments, aux lignes actuelles 112, 136, 160, 187, 202, 231) :

- `{fmtTime(d.timeMin)}` → `{formatDuration(d.timeMin)}`
- `fmtTime((fuelCapacity / regime.fuelBurn) * 60)` → `formatDuration((fuelCapacity / regime.fuelBurn) * 60)`
- `fmtTime(result.rawFlightTimeMin)` → `formatDuration(result.rawFlightTimeMin)`
- `fmtTime(result.totalFlightTimeMin)` → `formatDuration(result.totalFlightTimeMin)`
- `fmtTime(result.totalAlternateTimeMin)` → `formatDuration(result.totalAlternateTimeMin)`
- `{fmtTime(result.requiredEnduranceMin)}` → `{formatDuration(result.requiredEnduranceMin)}`

- [ ] **Step 12: Vérifier que `FuelPanel.test.tsx` passe sans modification**

```bash
npm test -- --run src/__tests__/fuel/FuelPanel.test.tsx
```

Expected: PASS — tous les tests existants (le refactor ne change aucun texte affiché, `formatDuration` produit exactement les mêmes chaînes que l'ancien `fmtTime`).

- [ ] **Step 13: Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 14: Commit**

```bash
git add src/lib/aviation/windTriangle.ts src/lib/aviation/fuelCalc.ts src/lib/format.ts src/features/fuel/FuelPanel.tsx src/__tests__/aviation/windTriangle.test.ts src/__tests__/lib/format.test.ts
git commit -m "refactor(aviation): extract shared segment timing calc and duration formatter"
```

---

## Task 2: Créer le composant partagé `SegmentCard`

**Files:**
- Create: `src/components/ui/SegmentCard.tsx`
- Create: `src/__tests__/components/SegmentCard.test.tsx`

**Interfaces:**
- Consumes: `computeSegmentTiming` (Task 1, `windTriangle.ts`), `formatDuration` (Task 1, `src/lib/format.ts`), `Card`/`Badge`/`Input` (`src/components/ui/`)
- Produces: `SegmentCard({ segment: FlightSegment, tas: number, isLastEnroute: boolean, onChange: (seg: FlightSegment) => void, onRemove?: () => void, onMoveUp?: () => void, onMoveDown?: () => void, canMoveUp?: boolean, canMoveDown?: boolean })` — utilisé par `SegmentsSection` (Task 3) et directement par `BranchesPanel`/`FuelPanel` pour la carte ALT (Tasks 4-5).

> Note : à ce stade, `FlightSegment` a encore son champ `notes` (retiré en Task 6) — les fixtures de test ci-dessous l'incluent pour rester valides vis-à-vis du type actuel ; Task 6 les mettra à jour.

- [ ] **Step 1: Écrire les tests (doivent échouer, le composant n'existe pas encore)**

Créer `src/__tests__/components/SegmentCard.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentCard } from '../../components/ui/SegmentCard'
import type { FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, notes: '', ...overrides }
}

describe('SegmentCard', () => {
  it('renders the segment name as an editable input', () => {
    render(<SegmentCard segment={makeSegment({ name: 'Toussus-Granville' })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Toussus-Granville')).toBeInTheDocument()
  })

  it('renders distance, heading and wind inputs', () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/Dist \(nm\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cap°M/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Vent °M/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Force kt/i)).toBeInTheDocument()
  })

  it('does not render a notes field', () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/Notes/i)).not.toBeInTheDocument()
  })

  it('shows computed GS and duration with no wind', () => {
    render(<SegmentCard segment={makeSegment({ distanceNm: 120, wind: null })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByText('120 kt')).toBeInTheDocument()
    expect(screen.getByText('1h00')).toBeInTheDocument()
  })

  it('calls onChange when distance is edited', async () => {
    const onChange = vi.fn()
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={onChange} />)
    const distInput = screen.getByLabelText(/Dist \(nm\)/i)
    await userEvent.clear(distInput)
    await userEvent.type(distInput, '50')
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when the segment name is edited', async () => {
    const onChange = vi.fn()
    render(<SegmentCard segment={makeSegment({ name: 'Vol' })} tas={120} isLastEnroute={false} onChange={onChange} />)
    const nameInput = screen.getByDisplayValue('Vol')
    await userEvent.type(nameInput, 'X')
    expect(onChange).toHaveBeenCalled()
  })

  it('collapses to a one-line summary and hides the input grid', async () => {
    render(<SegmentCard segment={makeSegment({ name: "L'Aigle-Flers", distanceNm: 50 })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /replier segment/i }))
    expect(screen.queryByLabelText(/Dist \(nm\)/i)).not.toBeInTheDocument()
    expect(screen.getByText(/L'Aigle-Flers · 50 nm · 120 kt · 0h25/)).toBeInTheDocument()
  })

  it('expands again and restores the input grid', async () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /replier segment/i }))
    await userEvent.click(screen.getByRole('button', { name: /déplier segment/i }))
    expect(screen.getByLabelText(/Dist \(nm\)/i)).toBeInTheDocument()
  })

  it('shows an ALT badge and disables remove/move for an ALTERNATE segment', () => {
    render(<SegmentCard segment={makeSegment({ role: 'ALTERNATE' })} tas={120} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByText('ALT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /supprimer segment/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '↑' })).not.toBeInTheDocument()
  })

  it('disables remove when isLastEnroute is true', () => {
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={true} onChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole('button', { name: /supprimer segment/i })).toBeDisabled()
  })

  it('calls onRemove when the remove button is clicked and enabled', async () => {
    const onRemove = vi.fn()
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /supprimer segment/i }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('calls onMoveUp/onMoveDown when clicked and enabled', async () => {
    const onMoveUp = vi.fn()
    const onMoveDown = vi.fn()
    render(<SegmentCard segment={makeSegment()} tas={120} isLastEnroute={false} onChange={vi.fn()}
      onMoveUp={onMoveUp} onMoveDown={onMoveDown} canMoveUp={true} canMoveDown={true} />)
    await userEvent.click(screen.getByRole('button', { name: '↑' }))
    await userEvent.click(screen.getByRole('button', { name: '↓' }))
    expect(onMoveUp).toHaveBeenCalledOnce()
    expect(onMoveDown).toHaveBeenCalledOnce()
  })

  it('shows a warning indicator when GS is zero or negative', () => {
    const seg = makeSegment({ headingMag: 270, wind: { directionDeg: 270, speedKt: 500 } })
    render(<SegmentCard segment={seg} tas={20} isLastEnroute={false} onChange={vi.fn()} />)
    expect(screen.getByText(/⚠/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --run src/__tests__/components/SegmentCard.test.tsx
```

Expected: FAIL — `Cannot find module '../../components/ui/SegmentCard'`.

- [ ] **Step 3: Implémenter `SegmentCard`**

Créer `src/components/ui/SegmentCard.tsx` :

```tsx
import { useState } from 'react'
import type { FlightSegment } from '../../types'
import { computeSegmentTiming } from '../../lib/aviation/windTriangle'
import { formatDuration } from '../../lib/format'
import { Card } from './Card'
import { Badge } from './Badge'
import { Input } from './Input'

interface SegmentCardProps {
  segment: FlightSegment
  tas: number
  isLastEnroute: boolean
  onChange: (seg: FlightSegment) => void
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export function SegmentCard({
  segment, tas, isLastEnroute, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: SegmentCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isAlternate = segment.role === 'ALTERNATE'
  const { gs, wca, timeMin } = computeSegmentTiming(segment, tas)

  return (
    <Card padding="sm" className={isAlternate ? 'border-[var(--amber)]/50 bg-[var(--amber)]/5' : ''}>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Déplier segment' : 'Replier segment'}
          className="text-[var(--text-dim)] hover:text-[var(--text-1)] px-1">
          {collapsed ? '▸' : '▾'}
        </button>
        {isAlternate && <Badge variant="warning">ALT</Badge>}
        {collapsed ? (
          <span className="flex-1 text-sm text-[var(--text-1)] truncate">
            {segment.name || 'Segment'} · {segment.distanceNm} nm · {gs.toFixed(0)} kt · {formatDuration(timeMin)}
          </span>
        ) : (
          <input value={segment.name} onChange={e => onChange({ ...segment, name: e.target.value })}
            placeholder="Nom du segment"
            className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--border)] focus:border-[var(--amber)] focus:outline-none text-[var(--text-1)]" />
        )}
        {!isAlternate && (
          <div className="flex gap-1">
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp}
              className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1">↑</button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown}
              className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1">↓</button>
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={isAlternate || isLastEnroute}
          aria-label="Supprimer segment"
          className="text-[var(--text-dim)] hover:text-[var(--red)] disabled:opacity-30 text-sm px-1">✕</button>
      </div>
      {!collapsed && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <Input label="Dist (nm)" type="number" value={segment.distanceNm || ''}
              onChange={e => onChange({ ...segment, distanceNm: Number(e.target.value) })} />
            <Input label="Cap°M" type="number" value={segment.headingMag || ''}
              onChange={e => onChange({ ...segment, headingMag: Number(e.target.value) })} />
            <Input label="Vent °M" type="number" value={segment.wind?.directionDeg ?? ''}
              onChange={e => onChange({ ...segment, wind: { ...segment.wind ?? { speedKt: 0 }, directionDeg: Number(e.target.value) } })} />
            <Input label="Force kt" type="number" value={segment.wind?.speedKt ?? ''}
              onChange={e => {
                const kt = Number(e.target.value)
                onChange({ ...segment, wind: kt === 0 ? null : { ...segment.wind ?? { directionDeg: 0 }, speedKt: kt } })
              }} />
          </div>
          <div className="flex gap-4 text-xs text-[var(--text-dim)]">
            <span>GS: <span className={`font-mono ${gs <= 0 ? 'text-[var(--red)]' : 'text-[var(--text-2)]'}`}>{gs.toFixed(0)} kt{gs <= 0 && ' ⚠'}</span></span>
            <span>WCA: <span className="font-mono text-[var(--text-2)]">{wca > 0 ? '+' : ''}{wca.toFixed(1)}°</span></span>
            <span>Durée: <span className="font-mono text-[var(--text-2)]">{formatDuration(timeMin)}</span></span>
          </div>
        </>
      )}
    </Card>
  )
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- --run src/__tests__/components/SegmentCard.test.tsx
```

Expected: PASS (13 tests).

- [ ] **Step 5: Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SegmentCard.tsx src/__tests__/components/SegmentCard.test.tsx
git commit -m "feat(ui): add shared SegmentCard component"
```

---

## Task 3: Créer le composant partagé `SegmentsSection`

**Files:**
- Create: `src/components/ui/SegmentsSection.tsx`
- Create: `src/__tests__/components/SegmentsSection.test.tsx`

**Interfaces:**
- Consumes: `SegmentCard` (Task 2), `Button` (`src/components/ui/Button.tsx`)
- Produces: `SegmentsSection({ branch: FlightBranch, tas: number, onChange: (branch: FlightBranch) => void })` — utilisé par `BranchesPanel` (Task 4) et `FuelPanel` (Task 5) pour la liste des segments ENROUTE.

> Note : `FlightSegment` a encore son champ `notes` à ce stade (retiré en Task 6) — la fixture ci-dessous l'inclut pour rester valide.

- [ ] **Step 1: Écrire les tests (doivent échouer, le composant n'existe pas encore)**

Créer `src/__tests__/components/SegmentsSection.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentsSection } from '../../components/ui/SegmentsSection'
import type { FlightBranch, FlightSegment } from '../../types'

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, notes: '', ...overrides }
}
function makeBranch(segments: FlightSegment[]): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments, notes: '' }
}

describe('SegmentsSection', () => {
  it('renders a SegmentCard for each ENROUTE segment', () => {
    const segments = [makeSegment({ id: 's1', name: 'Leg 1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Leg 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Leg 2')).toBeInTheDocument()
  })

  it('does not render the ALTERNATE segment', () => {
    const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 's2', role: 'ALTERNATE', name: 'Déroutement' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={vi.fn()} />)
    expect(screen.queryByDisplayValue('Déroutement')).not.toBeInTheDocument()
  })

  it('adds a segment before the ALTERNATE segment when "+ Segment" is clicked', async () => {
    const onChange = vi.fn()
    const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 'alt', role: 'ALTERNATE' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={onChange} />)
    await userEvent.click(screen.getByText('+ Segment'))
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments).toHaveLength(3)
    expect(updated.segments[1].role).toBe('ENROUTE')
    expect(updated.segments[2].role).toBe('ALTERNATE')
  })

  it('adds a segment at the end when there is no ALTERNATE segment', async () => {
    const onChange = vi.fn()
    render(<SegmentsSection branch={makeBranch([makeSegment()])} tas={120} onChange={onChange} />)
    await userEvent.click(screen.getByText('+ Segment'))
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments).toHaveLength(2)
  })

  it('cannot remove the last ENROUTE segment', () => {
    render(<SegmentsSection branch={makeBranch([makeSegment()])} tas={120} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /supprimer segment/i })).toBeDisabled()
  })

  it('removes a segment when there are multiple ENROUTE segments', async () => {
    const onChange = vi.fn()
    const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={onChange} />)
    const deleteButtons = screen.getAllByRole('button', { name: /supprimer segment/i })
    await userEvent.click(deleteButtons[0])
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments).toHaveLength(1)
  })

  it('reorders segments with the move buttons', async () => {
    const onChange = vi.fn()
    const segments = [makeSegment({ id: 's1', name: 'Leg 1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
    render(<SegmentsSection branch={makeBranch(segments)} tas={120} onChange={onChange} />)
    const downButtons = screen.getAllByRole('button', { name: '↓' })
    await userEvent.click(downButtons[0])
    const updated: FlightBranch = onChange.mock.calls[0][0]
    expect(updated.segments[0].id).toBe('s2')
    expect(updated.segments[1].id).toBe('s1')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --run src/__tests__/components/SegmentsSection.test.tsx
```

Expected: FAIL — `Cannot find module '../../components/ui/SegmentsSection'`.

- [ ] **Step 3: Implémenter `SegmentsSection`**

Créer `src/components/ui/SegmentsSection.tsx` :

```tsx
import type { FlightBranch, FlightSegment } from '../../types'
import { SegmentCard } from './SegmentCard'
import { Button } from './Button'

interface SegmentsSectionProps {
  branch: FlightBranch
  tas: number
  onChange: (branch: FlightBranch) => void
}

export function SegmentsSection({ branch, tas, onChange }: SegmentsSectionProps) {
  const enrouteSegments = branch.segments.filter(s => s.role === 'ENROUTE')

  const addSegment = () => {
    const newSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ENROUTE', name: '',
      distanceNm: 0, headingMag: 0, wind: null,
    }
    const altIdx = branch.segments.findIndex(s => s.role === 'ALTERNATE')
    const segs = [...branch.segments]
    altIdx >= 0 ? segs.splice(altIdx, 0, newSeg) : segs.push(newSeg)
    onChange({ ...branch, segments: segs })
  }

  const removeSegment = (id: string) => {
    const seg = branch.segments.find(s => s.id === id)
    if (!seg || seg.role === 'ALTERNATE') return
    if (enrouteSegments.length <= 1) return
    onChange({ ...branch, segments: branch.segments.filter(s => s.id !== id) })
  }

  const moveSegment = (id: string, dir: -1 | 1) => {
    const idx = enrouteSegments.findIndex(s => s.id === id)
    if (idx < 0) return
    const swap = idx + dir
    if (swap < 0 || swap >= enrouteSegments.length) return
    const segs = [...branch.segments]
    const ai = segs.findIndex(s => s.id === enrouteSegments[idx].id)
    const bi = segs.findIndex(s => s.id === enrouteSegments[swap].id)
    ;[segs[ai], segs[bi]] = [segs[bi], segs[ai]]
    onChange({ ...branch, segments: segs })
  }

  const updateSegment = (seg: FlightSegment) =>
    onChange({ ...branch, segments: branch.segments.map(s => s.id === seg.id ? seg : s) })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Segments</p>
        <Button variant="ghost" size="sm" onClick={addSegment}>+ Segment</Button>
      </div>
      {enrouteSegments.map((seg, idx) => (
        <div key={seg.id} className="mb-2">
          <SegmentCard
            segment={seg} tas={tas}
            isLastEnroute={enrouteSegments.length === 1}
            onRemove={() => removeSegment(seg.id)}
            onChange={updateSegment}
            onMoveUp={() => moveSegment(seg.id, -1)}
            onMoveDown={() => moveSegment(seg.id, 1)}
            canMoveUp={idx > 0}
            canMoveDown={idx < enrouteSegments.length - 1}
          />
        </div>
      ))}
    </div>
  )
}
```

Note : `addSegment` construit un `FlightSegment` sans `notes` — le champ existe encore dans le type à ce stade (retiré en Task 6), il est simplement omis ici comme optionnel-de-fait puisque `notes: string` est un champ obligatoire du type actuel. **Si `tsc` signale une erreur de propriété manquante à l'étape 5 ci-dessous, ajoute temporairement `notes: ''` à cet objet** — Task 6 le retirera avec le reste du champ.

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- --run src/__tests__/components/SegmentsSection.test.tsx
```

Expected: PASS (7 tests).

- [ ] **Step 5: Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur. Si une erreur mentionne `notes` manquant sur l'objet construit dans `addSegment`, ajoute `notes: ''` à cet objet (voir note ci-dessus) et relance.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SegmentsSection.tsx src/__tests__/components/SegmentsSection.test.tsx
git commit -m "feat(ui): add shared SegmentsSection component"
```

---

## Task 4: Utiliser les composants partagés dans `BranchesPanel`

**Files:**
- Modify: `src/features/branches/BranchesPanel.tsx:1-14` (imports), `:127-188` (supprime le `SegmentCard` privé), `:198-372` (`BranchView`)
- Modify: `src/__tests__/branches/BranchesPanel.test.tsx` (adapter aux nouveaux rôles de bouton)

**Interfaces:**
- Consumes: `SegmentCard` (Task 2), `SegmentsSection` (Task 3)
- Produces: rien de nouveau — comportement inchangé pour les consommateurs de `BranchesPanel`.

- [ ] **Step 1: Retirer le composant privé `SegmentCard` et l'import `computeSegmentWind` devenus inutiles**

Dans `src/features/branches/BranchesPanel.tsx`, supprimer entièrement la définition du composant privé `SegmentCard` (l'interface `SegmentCardProps` et la fonction `SegmentCard`, lignes 127-188).

Remplacer la ligne 8 :

```ts
import { computeSegmentWind } from '../../lib/aviation/windTriangle'
```

par les deux imports des composants partagés (à ajouter après la ligne 13, avec les autres imports `ui/`) :

```ts
import { SegmentCard } from '../../components/ui/SegmentCard'
import { SegmentsSection } from '../../components/ui/SegmentsSection'
```

(la ligne `import { computeSegmentWind } ...` est simplement supprimée, pas remplacée — plus rien dans ce fichier n'en a besoin).

- [ ] **Step 2: Remplacer le bloc Segments de `BranchView` par les composants partagés**

Dans la fonction `BranchView`, supprimer la ligne (215, désormais inutile — la liste ENROUTE est calculée dans `SegmentsSection`) :

```ts
  const enrouteSegments = branch.segments.filter(s => s.role === 'ENROUTE')
```

Supprimer entièrement les fonctions `addSegment`, `removeSegment`, `moveSegment` (lignes 238-266, désormais dans `SegmentsSection`) :

```ts
  const addSegment = () => {
    const newSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ENROUTE', name: '',
      distanceNm: 0, headingMag: 0, wind: null, notes: '',
    }
    const altIdx = branch.segments.findIndex(s => s.role === 'ALTERNATE')
    const segs = [...branch.segments]
    altIdx >= 0 ? segs.splice(altIdx, 0, newSeg) : segs.push(newSeg)
    onChange({ ...branch, segments: segs })
  }

  const removeSegment = (id: string) => {
    const seg = branch.segments.find(s => s.id === id)
    if (!seg || seg.role === 'ALTERNATE') return
    if (enrouteSegments.length <= 1) return
    onChange({ ...branch, segments: branch.segments.filter(s => s.id !== id) })
  }

  const moveSegment = (id: string, dir: -1 | 1) => {
    const idx = enrouteSegments.findIndex(s => s.id === id)
    if (idx < 0) return
    const swap = idx + dir
    if (swap < 0 || swap >= enrouteSegments.length) return
    const segs = [...branch.segments]
    const ai = segs.findIndex(s => s.id === enrouteSegments[idx].id)
    const bi = segs.findIndex(s => s.id === enrouteSegments[swap].id)
    ;[segs[ai], segs[bi]] = [segs[bi], segs[ai]]
    onChange({ ...branch, segments: segs })
  }
```

Garder `updateSegment` (ligne 268-269) — encore utilisée pour la carte ALT :

```ts
  const updateSegment = (seg: FlightSegment) =>
    onChange({ ...branch, segments: branch.segments.map(s => s.id === seg.id ? seg : s) })
```

Remplacer le bloc "Segments" du JSX (lignes 327-358) :

```tsx
        {/* Segments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Segments</p>
            <Button variant="ghost" size="sm" onClick={addSegment}>+ Segment</Button>
          </div>
          {enrouteSegments.map((seg, idx) => (
            <div key={seg.id} className="mb-2">
              <SegmentCard
                segment={seg} tas={speedKt}
                isLastEnroute={enrouteSegments.length === 1}
                onRemove={() => removeSegment(seg.id)}
                onChange={updateSegment}
                onMoveUp={() => moveSegment(seg.id, -1)}
                onMoveDown={() => moveSegment(seg.id, 1)}
                canMoveUp={idx > 0}
                canMoveDown={idx < enrouteSegments.length - 1}
              />
            </div>
          ))}
          {alternateSegment && (
            <div className="mb-2">
              <SegmentCard
                segment={alternateSegment} tas={speedKt}
                isLastEnroute={false}
                onRemove={() => {}}
                onChange={updateSegment}
                canMoveUp={false} canMoveDown={false}
              />
            </div>
          )}
        </div>
```

par :

```tsx
        {/* Segments */}
        <div>
          <SegmentsSection branch={branch} tas={speedKt} onChange={onChange} />
          {alternateSegment && (
            <div className="mb-2">
              <SegmentCard
                segment={alternateSegment} tas={speedKt}
                isLastEnroute={false}
                onChange={updateSegment}
                canMoveUp={false} canMoveDown={false}
              />
            </div>
          )}
        </div>
```

- [ ] **Step 3: Adapter `BranchesPanel.test.tsx` au nouveau composant**

Le test `'adds a segment when "+ Segment" is clicked'` (describe `segment management`) reste valide tel quel : le bouton "+ Segment" existe toujours, juste rendu par `SegmentsSection` désormais.

Le test `'cannot remove the last ENROUTE segment'` interroge déjà `getByRole('button', { name: /supprimer segment/i })` avec un fallback si absent — reste valide, le bouton est maintenant toujours rendu (disabled) par `SegmentCard`.

Aucune autre modification de ce fichier de test n'est nécessaire pour cette tâche — vérifie-le à l'étape suivante.

- [ ] **Step 4: Lancer les tests `BranchesPanel`**

```bash
npm test -- --run src/__tests__/branches/BranchesPanel.test.tsx
```

Expected: PASS — tous les tests, y compris `segment management` et `ALTERNATE segment auto-management`. Si un test échoue à cause d'un bouton devenu ambigu (plusieurs `↑`/`↓` désormais rendus par segment repliable), inspecte le message d'échec et ajuste le sélecteur du test concerné pour cibler le bon élément (par ex. `getAllByRole('button', { name: '↑' })[0]`) sans changer le comportement testé.

- [ ] **Step 5: Vérifier TypeScript et le build**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/features/branches/BranchesPanel.tsx src/__tests__/branches/BranchesPanel.test.tsx
git commit -m "refactor(branches): use shared SegmentCard/SegmentsSection components"
```

---

## Task 5: Utiliser les composants partagés dans `FuelPanel`

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx:1-8` (imports), `:41-116` (retire `patchSegmentWind`/`updateWindDir`/`updateWindSpeed`/`segmentRow`), `:120-121` (nouvelles variables dérivées), `:150-161` (Bloc 2), `:191-205` (Bloc 4)
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx` (adapter aux champs désormais éditables + nouveaux tests)

**Interfaces:**
- Consumes: `SegmentCard` (Task 2), `SegmentsSection` (Task 3)
- Produces: rien de nouveau.

- [ ] **Step 1: Écrire les nouveaux tests d'édition croisée (doivent échouer avant l'implémentation)**

Dans `src/__tests__/fuel/FuelPanel.test.tsx`, remplacer le test `'shows segment name'` du describe `Bloc 2 — Segments` (il utilisait `getByText('Vol')`, qui ne matchera plus une fois le nom éditable) :

```tsx
    it('shows segment name', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByText('Vol')).toBeInTheDocument()
    })
```

par :

```tsx
    it('shows segment name as an editable input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByDisplayValue('Vol')).toBeInTheDocument()
    })

    it('shows distance and heading as editable inputs', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByLabelText(/Dist \(nm\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Cap°M/i)).toBeInTheDocument()
    })

    it('calls onUpdateBranches when the segment name is edited', async () => {
      const onUpdateBranches = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={onUpdateBranches} />)
      const nameInput = screen.getByDisplayValue('Vol')
      await userEvent.type(nameInput, 'X')
      expect(onUpdateBranches).toHaveBeenCalled()
    })

    it('adds a segment when "+ Segment" is clicked', async () => {
      const onUpdateBranches = vi.fn()
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={onUpdateBranches} />)
      await userEvent.click(screen.getByText('+ Segment'))
      const updated = onUpdateBranches.mock.calls[0][0] as FlightBranch[]
      expect(updated[0].segments).toHaveLength(2)
    })
```

- [ ] **Step 2: Lancer les nouveaux tests pour vérifier qu'ils échouent**

```bash
npm test -- --run src/__tests__/fuel/FuelPanel.test.tsx -t "editable"
```

Expected: FAIL — le nom/distance/cap sont encore en lecture seule dans l'implémentation actuelle.

- [ ] **Step 3: Retirer les fonctions remplacées par les composants partagés**

Dans `src/features/fuel/FuelPanel.tsx`, ajouter les imports (avec les autres imports `ui/`) :

```ts
import { SegmentCard } from '../../components/ui/SegmentCard'
import { SegmentsSection } from '../../components/ui/SegmentsSection'
```

Supprimer entièrement `patchSegmentWind`, `updateWindDir`, `updateWindSpeed` :

```ts
  const patchSegmentWind = (segmentId: string, wind: { directionDeg: number; speedKt: number } | null) => {
    if (!activeBranch) return
    const updatedBranch = {
      ...activeBranch,
      segments: activeBranch.segments.map(s => s.id === segmentId ? { ...s, wind } : s),
    }
    onUpdateBranches(branches.map(b => b.id === validId ? updatedBranch : b))
  }

  const updateWindDir = (segmentId: string, dirDeg: number) => {
    const seg = activeBranch?.segments.find(s => s.id === segmentId)
    if (!seg) return
    patchSegmentWind(segmentId, { ...seg.wind ?? { speedKt: 0 }, directionDeg: dirDeg })
  }

  const updateWindSpeed = (segmentId: string, speedKt: number) => {
    const seg = activeBranch?.segments.find(s => s.id === segmentId)
    if (!seg) return
    patchSegmentWind(segmentId, speedKt === 0 ? null : { ...seg.wind ?? { directionDeg: 0 }, speedKt })
  }
```

Supprimer entièrement la fonction `segmentRow` (après le refactor de Task 1, sa dernière ligne utilise déjà `formatDuration` au lieu de `fmtTime`) :

```tsx
  const segmentRow = (detailId: string) => {
    if (!activeBranch || !result) return null
    const d = result.segmentDetails.find(s => s.segmentId === detailId)
    const seg = activeBranch.segments.find(s => s.id === detailId)
    if (!d || !seg) return null
    return (
      <div key={d.segmentId} className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="font-medium text-[var(--text-1)]">{d.name || 'Segment'}</span>
          <span className="text-[var(--text-muted)] font-mono text-xs">{d.distanceNm} nm</span>
        </div>
        <div className="grid grid-cols-4 gap-2 items-end">
          <div>
            <p className="text-xs text-[var(--text-dim)] mb-1">Cap °M</p>
            <p className="font-mono text-sm text-[var(--text-2)] px-2 py-1.5">{seg.headingMag}</p>
          </div>
          <Input label="Vent °M" type="number" value={seg.wind?.directionDeg ?? ''}
            onChange={e => updateWindDir(seg.id, Number(e.target.value))} />
          <Input label="Force kt" type="number" value={seg.wind?.speedKt ?? ''}
            onChange={e => updateWindSpeed(seg.id, Number(e.target.value))} />
          <div>
            <p className="text-xs text-[var(--text-dim)] mb-1">GS</p>
            <p className={`font-mono text-sm px-2 py-1.5 ${d.gs <= 0 ? 'text-[var(--red)]' : 'text-[var(--text-2)]'}`}>
              {d.gs.toFixed(0)} kt{d.gs <= 0 && ' ⚠'}
            </p>
          </div>
        </div>
        <p className="text-xs text-[var(--text-dim)] text-right">
          WCA {d.wca > 0 ? '+' : ''}{d.wca.toFixed(1)}° · {formatDuration(d.timeMin)}
        </p>
      </div>
    )
  }
```

Les remplacer par un unique helper générique, juste après la définition de `update` :

```ts
  const updateSegment = (seg: FlightSegment) =>
    onUpdateBranches(branches.map(b => b.id === validId ? { ...b, segments: b.segments.map(s => s.id === seg.id ? seg : s) } : b))
```

Ajouter `FlightSegment` à l'import de types en ligne 2 :

```ts
import type { FlightDossier, FuelInputs, FuelExtra, FlightBranch, FlightSegment } from '../../types'
```

- [ ] **Step 4: Dériver le segment ALT depuis la branche active**

Supprimer la ligne (120), devenue inutilisée par ce refactor (la liste ENROUTE est désormais gérée par `SegmentsSection`) :

```ts
  const enrouteDetails = result.segmentDetails.filter(d => d.role === 'ENROUTE')
```

Juste après la ligne `const alternateDetail = result.segmentDetails.find(d => d.role === 'ALTERNATE')` (ligne 121), ajouter :

```ts
  const alternateSegment = activeBranch.segments.find(s => s.role === 'ALTERNATE')
```

- [ ] **Step 5: Remplacer le contenu du Bloc 2 — Segments**

Remplacer :

```tsx
      {/* Bloc 2 — Segments */}
      <Card padding="md">
        {sectionHeader('Segments')}
        <div className="space-y-4 divide-y divide-[var(--border)]">
          {enrouteDetails.map(d => (
            <div key={d.segmentId} className="pt-3 first:pt-0">
              {segmentRow(d.segmentId)}
            </div>
          ))}
        </div>
        {subtotalRow('Temps vol brut', formatDuration(result.rawFlightTimeMin))}
      </Card>
```

par :

```tsx
      {/* Bloc 2 — Segments */}
      <Card padding="md">
        <SegmentsSection
          branch={activeBranch}
          tas={regime.speed}
          onChange={updatedBranch => onUpdateBranches(branches.map(b => b.id === validId ? updatedBranch : b))}
        />
        {subtotalRow('Temps vol brut', formatDuration(result.rawFlightTimeMin))}
      </Card>
```

(le `sectionHeader('Segments')` est retiré ici car `SegmentsSection` a déjà son propre en-tête "Segments" intégré.)

- [ ] **Step 6: Remplacer le contenu du Bloc 4 — Déroutement planifié**

Remplacer :

```tsx
      {/* Bloc 4 — Déroutement planifié */}
      {alternateDetail && (
        <Card padding="md">
          {sectionHeader('Déroutement planifié')}
          <div className="mb-4">
            {segmentRow(alternateDetail.segmentId)}
          </div>
          <div className="max-w-xs mb-2">
```

par :

```tsx
      {/* Bloc 4 — Déroutement planifié */}
      {alternateDetail && alternateSegment && (
        <Card padding="md">
          {sectionHeader('Déroutement planifié')}
          <div className="mb-4">
            <SegmentCard
              segment={alternateSegment} tas={regime.speed}
              isLastEnroute={false}
              onChange={updateSegment}
              canMoveUp={false} canMoveDown={false}
            />
          </div>
          <div className="max-w-xs mb-2">
```

(le reste du bloc — `Intégration alt.`, sous-totaux — ne change pas.)

- [ ] **Step 7: Lancer tous les tests `FuelPanel`**

```bash
npm test -- --run src/__tests__/fuel/FuelPanel.test.tsx
```

Expected: PASS — tous les tests, y compris les nouveaux. Les tests `'shows wind direction and speed inputs'` et `'calls onUpdateBranches when wind direction changes'` continuent de passer sans modification (mêmes labels `Vent °M`/`Force kt`, mêmes callbacks vers `onUpdateBranches`).

- [ ] **Step 8: Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add src/features/fuel/FuelPanel.tsx src/__tests__/fuel/FuelPanel.test.tsx
git commit -m "feat(fuel): use shared SegmentCard/SegmentsSection, editable segments"
```

---

## Task 6: Retirer le champ `notes` du modèle `FlightSegment`

**Files:**
- Modify: `src/types/index.ts:98-106`
- Modify: `src/features/branches/BranchesPanel.tsx:44-47` (`syncAlternateSegment`)
- Modify: `src/App.tsx:108`
- Modify: `src/lib/storage.ts:112`
- Modify: `src/__tests__/branches/BranchesPanel.test.tsx:42`
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx:23`
- Modify: `src/__tests__/aviation/fuelCalc.test.ts:7-13`
- Modify: `src/__tests__/lib/dossierTransforms.test.ts:5-8`
- Modify: `src/__tests__/lib/storage.migration.test.ts:139`, `:162`
- Modify: `src/__tests__/aviation/windTriangle.test.ts` (fixture `makeSegment` ajoutée en Task 1)
- Modify: `src/__tests__/components/SegmentCard.test.tsx` (fixture `makeSegment` ajoutée en Task 2)
- Modify: `src/__tests__/components/SegmentsSection.test.tsx` (fixture `makeSegment` ajoutée en Task 3)

**Interfaces:**
- Consumes: rien
- Produces: `FlightSegment` sans `notes` — dernier consommateur de ce champ retiré ; aucun task suivant n'en dépend.

- [ ] **Step 1: Retirer `notes` du type `FlightSegment`**

Dans `src/types/index.ts`, remplacer (lignes 98-106) :

```ts
export interface FlightSegment {
  id: string
  role: FlightSegmentRole
  name: string
  distanceNm: number
  headingMag: number             // Cap magnétique (°M)
  wind: { directionDeg: number; speedKt: number } | null  // Direction °M
  notes: string
}
```

par :

```ts
export interface FlightSegment {
  id: string
  role: FlightSegmentRole
  name: string
  distanceNm: number
  headingMag: number             // Cap magnétique (°M)
  wind: { directionDeg: number; speedKt: number } | null  // Direction °M
}
```

- [ ] **Step 2: Retirer `notes` de `syncAlternateSegment`**

Dans `src/features/branches/BranchesPanel.tsx`, remplacer :

```ts
    const altSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ALTERNATE',
      name: 'Déroutement', distanceNm: 0, headingMag: 0, wind: null, notes: '',
    }
```

par :

```ts
    const altSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ALTERNATE',
      name: 'Déroutement', distanceNm: 0, headingMag: 0, wind: null,
    }
```

- [ ] **Step 3: Retirer `notes` du segment initial dans `App.tsx`**

Dans `src/App.tsx`, remplacer :

```ts
                    segments: [{ id: crypto.randomUUID(), role: 'ENROUTE' as const, name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }],
```

par :

```ts
                    segments: [{ id: crypto.randomUUID(), role: 'ENROUTE' as const, name: 'Vol', distanceNm: 0, headingMag: 0, wind: null }],
```

- [ ] **Step 4: Retirer `notes` du segment de migration par défaut dans `storage.ts`**

Dans `src/lib/storage.ts`, remplacer :

```ts
      segments: [{ id: crypto.randomUUID(), role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }],
```

par :

```ts
      segments: [{ id: crypto.randomUUID(), role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null }],
```

- [ ] **Step 5: Retirer `notes` de toutes les fixtures de test**

Dans chacun des fichiers suivants, retirer `notes: ''` (ou `, notes: ''`) de tout objet `FlightSegment` construit :

`src/__tests__/branches/BranchesPanel.test.tsx:42` :

```ts
function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, ...overrides }
}
```

`src/__tests__/fuel/FuelPanel.test.tsx:23` :

```ts
function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, ...overrides }
}
```

`src/__tests__/aviation/fuelCalc.test.ts:7-13` :

```ts
function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return {
    id: 's1', role: 'ENROUTE', name: 'Vol',
    distanceNm: 120, headingMag: 270, wind: null,
    ...overrides,
  }
}
```

`src/__tests__/lib/dossierTransforms.test.ts:5-8` :

```ts
const defaultSegment: FlightSegment = {
  id: 's1', role: 'ENROUTE', name: 'Vol',
  distanceNm: 0, headingMag: 0, wind: null,
}
```

`src/__tests__/lib/storage.migration.test.ts:139` — remplacer :

```ts
          segments: [{ id: 's1', role: 'ENROUTE' as const, name: 'Vol', distanceNm: 100, headingMag: 0, wind: null, notes: '' }],
```

par :

```ts
          segments: [{ id: 's1', role: 'ENROUTE' as const, name: 'Vol', distanceNm: 100, headingMag: 0, wind: null }],
```

et ligne 162 — remplacer :

```ts
        branches: [{ id: 'branch-existing', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE' as const, name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }], notes: '' }],
```

par :

```ts
        branches: [{ id: 'branch-existing', label: 'Aller', aerodromes: [], segments: [{ id: 's1', role: 'ENROUTE' as const, name: 'Vol', distanceNm: 0, headingMag: 0, wind: null }], notes: '' }],
```

(le `notes: ''` en toute fin de cette ligne appartient à `FlightBranch.notes`, pas au segment — il reste.)

Dans `src/__tests__/aviation/windTriangle.test.ts` (fixture ajoutée en Task 1), `src/__tests__/components/SegmentCard.test.tsx` et `src/__tests__/components/SegmentsSection.test.tsx` (fixtures ajoutées en Tasks 2-3), retirer `notes: ''` de chaque `makeSegment`.

Si l'étape 5 de Task 3 (`SegmentsSection.tsx`) avait nécessité l'ajout temporaire de `notes: ''` dans `addSegment`, le retirer maintenant.

- [ ] **Step 6: Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur (plus aucune référence à `FlightSegment.notes`).

- [ ] **Step 7: Lancer la suite complète**

```bash
npm test -- --run
```

Expected: tous les tests passent.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(segments): remove free-text notes field from FlightSegment"
```

---

## Task 7: Vérification finale et build

**Files:** aucun changement de code — vérification uniquement.

**Interfaces:** aucune.

- [ ] **Step 1: Suite de tests complète**

```bash
npm test -- --run
```

Expected: tous les tests passent (suite existante + tests ajoutés dans ce plan).

- [ ] **Step 2: TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build réussi.

- [ ] **Step 4: Vérification manuelle recommandée**

Ouvrir l'app (skill `run`), aller sur l'onglet Vols puis Carbu pour le même vol, confirmer visuellement :
- Les blocs segment se présentent de façon identique sur les deux pages (mêmes champs, même style).
- Nom/distance/cap sont éditables sur Carbu (pas seulement le vent).
- Le repli/dépli fonctionne sur les deux pages et affiche le résumé attendu (nom · distance · GS · durée).
- Aucun champ "Notes" par segment n'apparaît plus nulle part.
- Le segment ALT (si un déroutement est défini) apparaît toujours à la suite sur Vols, et dans son propre bloc "Déroutement planifié" sur Carbu.

---

## Ce qui n'est pas couvert

- Pas de restructuration du découpage en "Blocs" de Carbu (Bloc 2 / Bloc 4 restent deux cartes séparées).
- Pas de changement des sous-totaux ou du calcul carburant global (Blocs 1/3/5/6).
- Pas de persistance de l'état replié/déplié entre sessions ou rechargements.
- Pas de changement du champ `FlightBranch.notes` (remarques libres au niveau du vol).
