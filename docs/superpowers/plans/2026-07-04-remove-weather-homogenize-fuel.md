# Suppression Météo + Homogénéisation Carbu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer entièrement la page Météo (UI + modèle de données), puis aligner la présentation de l'onglet Carbu sur celle de l'onglet Vols : pleine largeur et barre d'onglets de vol au même style visuel ("onglet classeur").

**Architecture:** Le champ `weatherInputs` disparaît de `FlightDossier` ; `PerfPanel` et `DossierPanel`, ses deux seuls consommateurs indirects, basculent sur des valeurs par défaut fixes / suppriment leur bloc dérivé. La barre d'onglets "classeur" actuellement codée en dur dans `BranchesPanel` est extraite dans un composant partagé `FlightTabStrip` (lecture seule quand `onRename`/`onAdd` sont omis), réutilisé par `BranchesPanel` (CRUD complet) et `FuelPanel` (sélection seule).

**Tech Stack:** React + TypeScript, Vitest + Testing Library, Tailwind (classes utilitaires, variables CSS `--bg-card` etc. déjà en place).

## Global Constraints

- Suppression complète de `weatherInputs` : aucune donnée de compatibilité, aucune migration de nettoyage conservée (décision produit validée).
- Les dossiers déjà stockés contenant un `weatherInputs` orphelin ne doivent pas provoquer d'erreur à la lecture (propriété simplement ignorée par le typage).
- `FlightTabStrip` doit rendre des éléments avec `role="button"` (accessible name = label du vol) pour rester compatible avec les tests existants de `FuelPanel` qui utilisent `getByRole('button', { name: '<label>' })`.
- Aucun changement de comportement de calcul (fuel, perf, W&C) — uniquement présentation et suppression de la météo.

---

## File Map

| Fichier | Action | Rôle |
|---|---|---|
| `src/types/index.ts` | Modifier | Retirer `WeatherInputs`, `FieldWeather`, `weatherInputs`, `'weather'` du `DossierTab` |
| `src/lib/storage.ts` | Modifier | Retirer la migration legacy `weatherInputs.winds` |
| `src/App.tsx` | Modifier | Retirer `weatherInputs` de la création du dossier initial |
| `src/components/AppChrome.tsx` | Modifier | Retirer l'onglet "Météo" |
| `src/screens/DossierScreen.tsx` | Modifier | Retirer l'import et le rendu de `WeatherPanel` |
| `src/features/perf/PerfPanel.tsx` | Modifier | QNH/Temp par défaut fixes (1013 hPa / 15°C) au lieu de `weatherInputs` |
| `src/features/dossier/DossierPanel.tsx` | Modifier | Retirer le bloc "Notes / NOTAM" |
| `src/features/weather/WeatherPanel.tsx` | Supprimer | Page Météo |
| `src/__tests__/weather/WeatherPanel.test.tsx` | Supprimer | Tests de la page Météo |
| `src/__tests__/lib/storage.migration.test.ts` | Modifier | Retirer la fixture et le test de migration `weatherInputs` |
| `src/__tests__/lib/dossierTransforms.test.ts` | Modifier | Retirer la fixture `weatherInputs` |
| `src/__tests__/fuel/FuelPanel.test.tsx` | Modifier | Retirer la fixture `weatherInputs` ; ajouter un test de visibilité permanente de la barre d'onglets |
| `src/features/fuel/FuelPanel.tsx` | Modifier | Conteneur pleine largeur ; barre d'onglets via `FlightTabStrip` |
| `src/components/ui/FlightTabStrip.tsx` | Créer | Composant partagé "onglet classeur" |
| `src/__tests__/components/FlightTabStrip.test.tsx` | Créer | Tests du composant partagé |
| `src/features/branches/BranchesPanel.tsx` | Modifier | Utiliser `FlightTabStrip` à la place du markup inline |
| `src/__tests__/branches/BranchesPanel.test.tsx` | Vérifier | Doit continuer à passer sans modification |

---

## Task 1: Supprimer la page Météo (modèle de données + UI)

**Files:**
- Modify: `src/types/index.ts:116-126` (interfaces `FieldWeather`/`WeatherInputs`), `:170` (champ `weatherInputs`), `:185` (`DossierTab`)
- Modify: `src/lib/storage.ts:122-125`
- Modify: `src/App.tsx:111`
- Modify: `src/components/AppChrome.tsx:9`
- Modify: `src/screens/DossierScreen.tsx:3`, `:36-38`
- Modify: `src/features/perf/PerfPanel.tsx:233`, `:260-266`, `:294-306`
- Modify: `src/features/dossier/DossierPanel.tsx:13`, `:115-123`
- Delete: `src/features/weather/WeatherPanel.tsx`
- Delete: `src/__tests__/weather/WeatherPanel.test.tsx`
- Modify: `src/__tests__/lib/storage.migration.test.ts:24`, `:133-146`
- Modify: `src/__tests__/lib/dossierTransforms.test.ts:38`
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx:42`

**Interfaces:**
- Consumes: rien (suppression pure)
- Produces: `FlightDossier` sans `weatherInputs` ; `DossierTab` sans `'weather'` — tous les tasks suivants du plan travaillent sur ce modèle réduit.

- [ ] **Step 1: Retirer `WeatherInputs`/`FieldWeather` et le champ `weatherInputs` de `FlightDossier`**

Dans `src/types/index.ts`, supprimer entièrement la section (lignes 116-126) :

```ts
// ── Météo ─────────────────────────────────────────────────────────────────────

export interface FieldWeather {
  qnh: number   // hPa
  temp: number  // °C
}

export interface WeatherInputs {
  fields: Record<string, FieldWeather>  // clé = ICAO
  notes: string
}

```

Dans l'interface `FlightDossier`, supprimer la ligne :

```ts
  weatherInputs: WeatherInputs
```

Dans le type `DossierTab`, retirer `'weather'` :

```ts
export type DossierTab = 'branches' | 'fuel' | 'wb' | 'perf' | 'dossier'
```

- [ ] **Step 2: Retirer la migration legacy `weatherInputs.winds`**

Dans `src/lib/storage.ts`, supprimer ce bloc (lignes 122-125) :

```ts
  // Migrate weatherInputs: remove legacy winds field
  if (data.weatherInputs && Array.isArray((data.weatherInputs as Record<string, unknown>).winds)) {
    delete (data.weatherInputs as Record<string, unknown>).winds
  }
```

- [ ] **Step 3: Retirer `weatherInputs` de la création du dossier initial**

Dans `src/App.tsx`, dans l'objet `dossier` construit par `onNewDossier`, supprimer la ligne :

```ts
                  weatherInputs: { fields: {}, notes: '' },
```

- [ ] **Step 4: Retirer l'onglet "Météo" de la barre d'onglets**

Dans `src/components/AppChrome.tsx`, dans `DOSSIER_TABS`, supprimer la ligne :

```ts
  { key: 'weather', label: 'Météo' },
```

- [ ] **Step 5: Retirer le rendu de `WeatherPanel` dans `DossierScreen`**

Dans `src/screens/DossierScreen.tsx`, supprimer l'import :

```ts
import { WeatherPanel } from '../features/weather/WeatherPanel'
```

et supprimer le bloc de rendu :

```tsx
      {activeTab === 'weather' && (
        <WeatherPanel dossier={dossier} onUpdate={(weatherInputs) => update({ weatherInputs })} />
      )}
```

- [ ] **Step 6: Basculer `PerfPanel` sur des QNH/Temp par défaut fixes**

Dans `src/features/perf/PerfPanel.tsx`, ligne 233, retirer `weatherInputs` de la déstructuration :

```ts
  const { aircraft, loading, perfInputs, branches, perfRegulatory } = dossier
```

Supprimer la fonction `getWeatherFor` (lignes 263-266) :

```ts
  const getWeatherFor = (icao: string) => {
    const field = weatherInputs.fields[icao]
    return { qnh: field?.qnh ?? 1013, temp: field?.temp ?? 15 }
  }
```

Juste au-dessus, le commentaire de la ligne 260 référence encore l'ancien type ; le corriger :

```ts
  // Surface wind: calm (no wind layers)
  const surfaceWind = { direction_deg: 0, speed_kt: 0 }
```

Dans la boucle de rendu des `terrainCards` (autour de la ligne 294), retirer la ligne `const weather = getWeatherFor(key)` et remplacer les deux props qui l'utilisaient :

```tsx
      {terrainCards.map(({ key, label, tableKey }) => {
        const aero = getAerodrome(key)
        return (
          <TerrainCard
            key={key}
            terrainKey={key}
            label={label}
            tableKey={tableKey}
            aircraft={aircraft}
            weight={depWeight}
            defaultQnh={1013}
            defaultTemp={15}
            defaultElevation={aero?.elevationFt ?? 0}
            runways={aero?.runways ?? []}
            surfaceWindDir={surfaceWind.direction_deg}
            surfaceWindKt={surfaceWind.speed_kt}
            perfInputs={perfInputs[key] ?? DEFAULT_PERF}
            perfRegulatory={perfRegulatory ?? 1.0}
            onUpdate={inputs => handleUpdate(key, inputs)}
          />
        )
      })}
```

- [ ] **Step 7: Retirer le bloc "Notes / NOTAM" de `DossierPanel`**

Dans `src/features/dossier/DossierPanel.tsx`, ligne 13, retirer `weatherInputs` de la déstructuration :

```ts
  const { aircraft, branches, loading, fuelInputs } = dossier
```

Supprimer le bloc (lignes 115-123) :

```tsx
        {/* Weather summary */}
        {weatherInputs.notes && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Notes / NOTAM</h2>
            <pre className="text-xs font-mono text-[var(--text-2)] whitespace-pre-wrap bg-[var(--bg-inset)] p-3 rounded">
              {weatherInputs.notes}
            </pre>
          </section>
        )}
```

- [ ] **Step 8: Supprimer les fichiers de la page Météo**

```bash
git rm src/features/weather/WeatherPanel.tsx src/__tests__/weather/WeatherPanel.test.tsx
```

(Si `git rm` échoue car les fichiers n'existent plus dans l'index tel quel, utiliser `rm` puis `git add -u`.)

- [ ] **Step 9: Nettoyer les fixtures de test qui référencent `weatherInputs`**

Dans `src/__tests__/lib/storage.migration.test.ts`, retirer la ligne de `baseDossierFields` :

```ts
  weatherInputs: { fields: {}, notes: '' },
```

et supprimer entièrement le describe suivant (il testait la migration retirée à l'étape 2) :

```ts
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
```

Dans `src/__tests__/lib/dossierTransforms.test.ts`, retirer la ligne de `baseDossier` :

```ts
  weatherInputs: { fields: {}, notes: '' },
```

Dans `src/__tests__/fuel/FuelPanel.test.tsx`, dans `makeDossier`, retirer `weatherInputs: { fields: {}, notes: '' }, ` de l'objet retourné :

```ts
function makeDossier(branches: FlightBranch[], fuelInputs: Record<string, FuelInputs> = {}): FlightDossier {
  return {
    id: 'dos-1', name: 'Test', date: '2026-06-17', departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches, fuelInputs,
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, notes: '',
    createdAt: '2026-06-17T00:00:00Z', updatedAt: '2026-06-17T00:00:00Z',
  }
}
```

- [ ] **Step 10: Vérifier que TypeScript compile sans erreur**

```bash
npx tsc --noEmit
```

Expected: aucune erreur (plus aucune référence à `WeatherInputs`, `FieldWeather`, `weatherInputs`, ou `'weather'`).

- [ ] **Step 11: Vérifier que la suite de tests passe**

```bash
npm test -- --run
```

Expected: tous les tests passent ; le dossier `src/__tests__/weather/` n'existe plus donc aucun test météo ne s'exécute.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: remove weather page and weatherInputs data model"
```

---

## Task 2: Pleine largeur pour l'onglet Carbu

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx:123`, `:264` (extrémités du conteneur racine)

**Interfaces:**
- Consumes: rien de nouveau
- Produces: conteneur racine `<div className="flex flex-col h-full">` — Task 5 s'appuie sur cette structure pour insérer `FlightTabStrip` avant le conteneur scrollable.

- [ ] **Step 1: Remplacer le conteneur racine centré par un conteneur pleine largeur**

Dans `src/features/fuel/FuelPanel.tsx`, remplacer :

```tsx
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-5 overflow-auto">
```

par :

```tsx
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-5">
```

et à la toute fin du composant, remplacer la fermeture actuelle :

```tsx
    </div>
  )
}
```

par une fermeture supplémentaire pour le nouveau conteneur englobant :

```tsx
      </div>
    </div>
  )
}
```

Le contenu entre les deux (barre d'onglets existante en `branches.length > 1`, Bloc 1 à Bloc 6) ne change pas dans cette étape — seule l'indentation logique change (pas besoin de réindenter le fichier entier, juste que le JSX reste valide).

- [ ] **Step 2: Vérifier que les tests `FuelPanel` passent toujours**

```bash
npm test -- --run src/__tests__/fuel/FuelPanel.test.tsx
```

Expected: tous les tests passent (aucun test n'asserte de classes CSS de largeur).

- [ ] **Step 3: Commit**

```bash
git add src/features/fuel/FuelPanel.tsx
git commit -m "style(fuel): remove max-width constraint to match Branches tab"
```

---

## Task 3: Créer le composant partagé `FlightTabStrip`

**Files:**
- Create: `src/components/ui/FlightTabStrip.tsx`
- Create: `src/__tests__/components/FlightTabStrip.test.tsx`

**Interfaces:**
- Consumes: rien
- Produces: `FlightTabStrip({ branches: {id: string; label: string}[], activeId: string, onSelect: (id: string) => void, onRename?: (id: string, label: string) => void, onAdd?: () => void, className?: string })` — utilisé par les Tasks 4 et 5.

- [ ] **Step 1: Écrire les tests (ils doivent échouer, le composant n'existe pas encore)**

Créer `src/__tests__/components/FlightTabStrip.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'

const branches = [
  { id: 'b1', label: 'Aller' },
  { id: 'b2', label: 'Retour' },
]

describe('FlightTabStrip', () => {
  it('renders a tab button for each branch', () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
  })

  it('calls onSelect with the branch id when a tab is clicked', async () => {
    const onSelect = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(onSelect).toHaveBeenCalledWith('b2')
  })

  it('does not render an add button when onAdd is omitted', () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} />)
    expect(screen.queryByText('+')).not.toBeInTheDocument()
  })

  it('renders an add button and calls onAdd when clicked', async () => {
    const onAdd = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} onAdd={onAdd} />)
    await userEvent.click(screen.getByText('+'))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('double-click does not show a rename input when onRename is omitted', async () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} />)
    await userEvent.dblClick(screen.getByText('Aller'))
    expect(screen.queryByDisplayValue('Aller')).not.toBeInTheDocument()
  })

  it('double-click shows a rename input when onRename is provided', async () => {
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} onRename={vi.fn()} />)
    await userEvent.dblClick(screen.getByText('Aller'))
    expect(screen.getByDisplayValue('Aller')).toBeInTheDocument()
  })

  it('calls onRename with the new label on blur', async () => {
    const onRename = vi.fn()
    render(<FlightTabStrip branches={branches} activeId="b1" onSelect={vi.fn()} onRename={onRename} />)
    await userEvent.dblClick(screen.getByText('Aller'))
    const input = screen.getByDisplayValue('Aller')
    await userEvent.clear(input)
    await userEvent.type(input, 'Retour bis')
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('b1', 'Retour bis')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- --run src/__tests__/components/FlightTabStrip.test.tsx
```

Expected: FAIL — `Cannot find module '../../components/ui/FlightTabStrip'`.

- [ ] **Step 3: Implémenter `FlightTabStrip`**

Créer `src/components/ui/FlightTabStrip.tsx` :

```tsx
import { useState } from 'react'

interface FlightTabStripProps {
  branches: { id: string; label: string }[]
  activeId: string
  onSelect: (id: string) => void
  onRename?: (id: string, label: string) => void
  onAdd?: () => void
  className?: string
}

export function FlightTabStrip({ branches, activeId, onSelect, onRename, onAdd, className = '' }: FlightTabStripProps) {
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
        >
          {onRename && editingId === b.id ? (
            <input
              autoFocus
              defaultValue={b.label}
              className="w-20 bg-transparent border-b border-[var(--amber)] text-xs focus:outline-none"
              onBlur={e => { onRename(b.id, e.target.value || b.label); setEditingId(null) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingId(null) }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span onDoubleClick={onRename ? () => setEditingId(b.id) : undefined}>{b.label}</span>
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

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm test -- --run src/__tests__/components/FlightTabStrip.test.tsx
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/FlightTabStrip.tsx src/__tests__/components/FlightTabStrip.test.tsx
git commit -m "feat(ui): add shared FlightTabStrip component"
```

---

## Task 4: Utiliser `FlightTabStrip` dans `BranchesPanel`

**Files:**
- Modify: `src/features/branches/BranchesPanel.tsx:1` (imports), `:379-431` (fonction `BranchesPanel`)

**Interfaces:**
- Consumes: `FlightTabStrip` (Task 3)
- Produces: rien de nouveau — comportement inchangé pour les consommateurs de `BranchesPanel`.

- [ ] **Step 1: Importer `FlightTabStrip`**

Dans `src/features/branches/BranchesPanel.tsx`, ajouter l'import (après les imports `ui/` existants) :

```ts
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'
```

- [ ] **Step 2: Remplacer le markup d'onglets inline par `FlightTabStrip`**

Remplacer le corps de la fonction `BranchesPanel` (à partir de la déclaration de `editingLabel` jusqu'à la fin du bloc d'onglets) :

```tsx
export function BranchesPanel({ branches, aircraft, onUpdate }: Props) {
  const speedKt = aircraft.characteristics.regimes[0].speed
  const [activeId, setActiveId] = useState(() => branches[0]?.id ?? '')
  const activeBranch = branches.find(b => b.id === activeId) ?? branches[0]
  const [editingLabel, setEditingLabel] = useState<string | null>(null)

  const addBranch = () => {
    const newBranch: FlightBranch = {
      id: crypto.randomUUID(),
      label: `Vol ${branches.length + 1}`,
      aerodromes: [],
      segments: [{ id: crypto.randomUUID(), role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '' }],
      notes: '',
    }
    const updated = [...branches, newBranch]
    onUpdate(updated)
    setActiveId(newBranch.id)
  }

  const deleteBranch = (id: string) => {
    const updated = branches.filter(b => b.id !== id)
    onUpdate(updated)
    setActiveId(updated[0]?.id ?? '')
  }

  const updateBranch = (branch: FlightBranch) =>
    onUpdate(branches.map(b => b.id === branch.id ? branch : b))

  return (
    <div className="flex flex-col h-full">
      <FlightTabStrip
        branches={branches}
        activeId={activeId}
        onSelect={setActiveId}
        onRename={(id, label) => {
          const b = branches.find(x => x.id === id)
          if (b) updateBranch({ ...b, label })
        }}
        onAdd={addBranch}
      />
      {activeBranch && (
        <BranchView branch={activeBranch} isOnly={branches.length === 1}
          speedKt={speedKt} onChange={updateBranch} onDelete={() => deleteBranch(activeBranch.id)} />
      )}
    </div>
  )
}
```

(Supprime la déclaration `useState` de `editingLabel`, plus utilisée à ce niveau — l'état d'édition vit maintenant dans `FlightTabStrip`.)

- [ ] **Step 3: Vérifier que les tests `BranchesPanel` passent sans modification**

```bash
npm test -- --run src/__tests__/branches/BranchesPanel.test.tsx
```

Expected: PASS — en particulier les tests `renders a branch tab with the branch label`, `label editing: shows input on double-click`, `calls onUpdate with new label on blur`, `adding a branch`.

- [ ] **Step 4: Commit**

```bash
git add src/features/branches/BranchesPanel.tsx
git commit -m "refactor(branches): use shared FlightTabStrip component"
```

---

## Task 5: Utiliser `FlightTabStrip` dans `FuelPanel` (toujours visible)

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx:1` (imports), `:123-137` (bloc d'onglets)
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx` (ajout d'un test)

**Interfaces:**
- Consumes: `FlightTabStrip` (Task 3)
- Produces: rien de nouveau.

- [ ] **Step 1: Écrire le test de visibilité permanente (doit échouer avant l'implémentation)**

Dans `src/__tests__/fuel/FuelPanel.test.tsx`, ajouter dans le describe `Bloc 1 — Appareil` (ou en tête de fichier, à côté des autres describes) :

```tsx
  describe('flight tab bar', () => {
    it('is visible even with a single branch', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} onUpdateBranches={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- --run src/__tests__/fuel/FuelPanel.test.tsx -t "is visible even with a single branch"
```

Expected: FAIL — la barre d'onglets actuelle est masquée quand `branches.length <= 1`.

- [ ] **Step 3: Importer `FlightTabStrip` et remplacer le bloc d'onglets**

Dans `src/features/fuel/FuelPanel.tsx`, ajouter l'import :

```ts
import { FlightTabStrip } from '../../components/ui/FlightTabStrip'
```

Remplacer le bloc (actuellement gated par `branches.length > 1`) :

```tsx
      {branches.length > 1 && (
        <div className="flex gap-1 border-b border-[var(--border)]">
          {branches.map(b => (
            <button key={b.id} onClick={() => setActiveBranchId(b.id)}
              className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                b.id === validId
                  ? 'border-[var(--amber)] text-[var(--text-1)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-1)]'
              }`}>
              {b.label}
            </button>
          ))}
        </div>
      )}
```

par :

```tsx
      <FlightTabStrip branches={branches} activeId={validId} onSelect={setActiveBranchId} />
```

Ce composant est placé juste après l'ouverture du conteneur racine (`<div className="flex flex-col h-full">`, Task 2) et avant le conteneur scrollable (`<div className="flex-1 overflow-auto p-4 space-y-5">`).

- [ ] **Step 4: Vérifier que tous les tests `FuelPanel` passent**

```bash
npm test -- --run src/__tests__/fuel/FuelPanel.test.tsx
```

Expected: PASS — y compris le nouveau test et les tests existants `multi-branch tab bar` (`renders a tab button for each branch`, `calls onUpdate with the active branch key when taxiMin changes`).

- [ ] **Step 5: Vérifier la suite complète et le build**

```bash
npm test -- --run
npx tsc --noEmit
npm run build
```

Expected: tous les tests passent, aucune erreur TypeScript, build réussi.

- [ ] **Step 6: Commit**

```bash
git add src/features/fuel/FuelPanel.tsx src/__tests__/fuel/FuelPanel.test.tsx
git commit -m "feat(fuel): use shared FlightTabStrip, always visible"
```

---

## Ce qui n'est pas couvert

- Bandeau d'infos transverses (avion, distance totale, nom du vol) — hors périmètre de ce lot.
- Renommage de "Vols" en "Branches" dans l'UI — hors périmètre.
- Vérification manuelle dans le navigateur (recommandée après le Task 5, via le skill `run`, pour confirmer visuellement l'alignement des deux onglets).
