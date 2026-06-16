# Fleet Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fleet JSON export/import with registration-based deduplication, aircraft duplication, and autodiscovery of JSON templates from `resources/`.

**Architecture:** Storage layer gets three new functions (`downloadFleet`, `importFleet`, `duplicateAircraft`). A new `FleetImportModal` component handles the import preview UI. Templates switch from a hardcoded TypeScript file to `import.meta.glob` scanning `resources/*.json`, making the catalogue extensible without code changes.

**Tech Stack:** React 18, TypeScript, Vite (`import.meta.glob`), Vitest (jsdom), Tailwind CSS (CSS variables)

---

## File Map

| File | Action | Role |
|------|--------|------|
| `resources/dr221.json` | **Create** | Full Aircraft JSON template (replaces 3 partials + dr221.ts) |
| `resources/template_dr221_wb.json` | **Delete** | Absorbed into dr221.json |
| `resources/template_dr221_takeoff.json` | **Delete** | Absorbed into dr221.json |
| `resources/template_dr221_landing.json` | **Delete** | Absorbed into dr221.json |
| `src/lib/templates/dr221.ts` | **Delete** | Replaced by dr221.json + glob |
| `src/lib/templates/index.ts` | **Rewrite** | `import.meta.glob` autodiscovery |
| `src/__tests__/lib/templates.test.ts` | **Create** | Test TEMPLATES is populated |
| `src/lib/storage.ts` | **Modify** | Add downloadFleet, importFleet, duplicateAircraft |
| `src/__tests__/lib/storage.test.ts` | **Create** | TDD for new storage functions |
| `src/features/fleet/FleetImportModal.tsx` | **Create** | Import preview modal |
| `src/screens/HomeScreen.tsx` | **Modify** | Export/import buttons, duplicate button, modal state |
| `src/screens/AircraftEditorScreen.tsx` | **Modify** | Add `prefillAircraft` prop |
| `src/App.tsx` | **Modify** | PREFILL_AIRCRAFT action for duplicate flow |

---

## Task 1: `resources/dr221.json` — Full Aircraft JSON Template

**Files:**
- Create: `resources/dr221.json`
- Delete: `resources/template_dr221_wb.json`, `resources/template_dr221_takeoff.json`, `resources/template_dr221_landing.json`
- Delete: `src/lib/templates/dr221.ts`

No unit tests needed — this is a data file. TypeScript check validates structure in Task 2.

- [ ] **Step 1: Create `resources/dr221.json`**

This combines data from the three partial files and the TypeScript template metadata. The `envelopePoints` come from `template_dr221_wb.json`, perf tables from the takeoff/landing JSONs:

```json
{
  "id": "template-dr221",
  "name": "DR221",
  "registration": "",
  "sdReference": "",
  "characteristics": {
    "regimes": [
      { "label": "75% puissance", "ias": 108, "fuelBurn": 22 },
      { "label": "65% puissance", "ias": 100, "fuelBurn": 20 }
    ],
    "fuelCapacity": 116
  },
  "massBalance": {
    "emptyWeight": 615,
    "emptyArm": 345,
    "maxWeight": 840,
    "stations": [
      { "name": "Pilote", "arm": 375, "kind": "dry" },
      { "name": "Passager", "arm": 505, "kind": "dry" },
      { "name": "Bagages", "arm": 545, "kind": "dry" },
      { "name": "Carburant", "arm": 350, "kind": "fuel" }
    ],
    "envelopePoints": [
      [440, 310],
      [600, 310],
      [840, 473],
      [840, 590],
      [440, 590]
    ]
  },
  "performance": {
    "toTable": {
      "weights": [840],
      "pressureAltitudes": [0, 1640, 3281, 4922],
      "oats": [0, 15, 30, 45],
      "values": [
        [
          [440, 470, 500, 540],
          [490, 540, 580, 630],
          [580, 640, 700, 750],
          [680, 740, 800, 880]
        ]
      ],
      "grassValues": [
        [
          [520, 560, 600, 660],
          [600, 660, 730, 800],
          [720, 800, 870, 960],
          [880, 950, 1020, 1160]
        ]
      ],
      "windCorrections": [
        { "speedKt": 10, "factor": 0.85 },
        { "speedKt": 20, "factor": 0.67 },
        { "speedKt": 30, "factor": 0.56 }
      ],
      "weightCorrection": "quadratic",
      "referenceWeight": 840,
      "weightCorrectionDivisor": 830
    },
    "ldgTable": {
      "weights": [750, 840],
      "pressureAltitudes": [0],
      "oats": [15],
      "values": [
        [[510]],
        [[550]]
      ],
      "windCorrections": [
        { "speedKt": 10, "factor": 0.85 },
        { "speedKt": 20, "factor": 0.67 },
        { "speedKt": 30, "factor": 0.56 }
      ]
    }
  }
}
```

- [ ] **Step 2: Delete the three partial files and the TypeScript template**

```bash
git rm resources/template_dr221_wb.json resources/template_dr221_takeoff.json resources/template_dr221_landing.json
git rm src/lib/templates/dr221.ts
```

- [ ] **Step 3: Commit**

```bash
git add resources/dr221.json
git commit -m "feat: consolidate DR221 data into single Aircraft JSON template"
```

---

## Task 2: Templates via `import.meta.glob`

**Files:**
- Rewrite: `src/lib/templates/index.ts`
- Create: `src/__tests__/lib/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/templates.test.ts`:

```typescript
import { TEMPLATES, createFromTemplate, getTemplate } from '../../lib/templates'

describe('TEMPLATES — autodiscovery', () => {
  it('contains at least one template', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0)
  })

  it('each template has key, label, and template fields', () => {
    for (const t of TEMPLATES) {
      expect(typeof t.key).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(t.template).toHaveProperty('id')
      expect(t.template).toHaveProperty('name')
      expect(t.template).toHaveProperty('massBalance')
      expect(t.template).toHaveProperty('performance')
    }
  })

  it('dr221 template is present', () => {
    const t = getTemplate('dr221')
    expect(t).not.toBeNull()
    expect(t!.name).toBe('DR221')
  })

  it('createFromTemplate assigns new id and clears registration', () => {
    const ac = createFromTemplate('dr221', 'new-uuid')
    expect(ac).not.toBeNull()
    expect(ac!.id).toBe('new-uuid')
    expect(ac!.registration).toBe('')
  })

  it('createFromTemplate returns null for unknown key', () => {
    expect(createFromTemplate('nonexistent', 'x')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --run src/__tests__/lib/templates.test.ts
```

Expected: FAIL — `DR221_TEMPLATE` import missing (dr221.ts was deleted).

- [ ] **Step 3: Rewrite `src/lib/templates/index.ts`**

```typescript
import type { Aircraft } from '../../types'

export interface TemplateEntry {
  key: string
  label: string
  template: Aircraft
}

const modules = import.meta.glob('../../../resources/*.json', { eager: true })

export const TEMPLATES: TemplateEntry[] = Object.entries(modules).map(([path, mod]) => {
  const aircraft = (mod as { default: Aircraft }).default
  const key = path.split('/').pop()!.replace('.json', '')
  return { key, label: aircraft.name, template: aircraft }
})

export function getTemplate(key: string): Aircraft | null {
  return TEMPLATES.find(t => t.key === key)?.template ?? null
}

export function createFromTemplate(key: string, id: string): Aircraft | null {
  const entry = TEMPLATES.find(t => t.key === key)
  if (!entry) return null
  return { ...entry.template, id, registration: '' }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --run src/__tests__/lib/templates.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/templates/index.ts src/__tests__/lib/templates.test.ts
git commit -m "feat: templates autodiscovered from resources/*.json via import.meta.glob"
```

---

## Task 3: Storage functions — `downloadFleet`, `importFleet`, `duplicateAircraft`

**Files:**
- Modify: `src/lib/storage.ts`
- Create: `src/__tests__/lib/storage.test.ts`

**Context:** Tests run in jsdom (see `vite.config.ts`) so `localStorage` is available. `downloadFleet` creates a DOM anchor and triggers a download — skip its unit test (same pattern as `downloadDossier`). Test only `importFleet` and `duplicateAircraft`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/storage.test.ts`:

```typescript
import { importFleet, duplicateAircraft, saveAircraft, listAircraft, getAircraft } from '../../lib/storage'
import type { Aircraft } from '../../types'

const makeAircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  id: 'test-id-1',
  name: 'DR221',
  registration: 'F-BPCT',
  characteristics: {
    regimes: [{ label: '75%', ias: 108, fuelBurn: 22 }],
    fuelCapacity: 116,
  },
  massBalance: {
    emptyWeight: 615,
    emptyArm: 345,
    maxWeight: 840,
    stations: [],
    envelopePoints: [],
  },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
  ...overrides,
})

beforeEach(() => {
  localStorage.clear()
})

describe('importFleet', () => {
  it('adds a new aircraft when registration does not exist', () => {
    const ac = makeAircraft()
    const result = importFleet([ac])
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
    const fleet = listAircraft()
    expect(fleet).toHaveLength(1)
    expect(fleet[0].registration).toBe('F-BPCT')
  })

  it('generates a new UUID for added aircraft (does not use imported id)', () => {
    const ac = makeAircraft({ id: 'imported-id' })
    importFleet([ac])
    const fleet = listAircraft()
    expect(fleet[0].id).not.toBe('imported-id')
  })

  it('updates existing aircraft when registration already exists, preserving id', () => {
    const existing = makeAircraft({ id: 'original-id', name: 'Old Name' })
    saveAircraft(existing)

    const updated = makeAircraft({ id: 'different-id', name: 'New Name' })
    const result = importFleet([updated])

    expect(result.added).toBe(0)
    expect(result.updated).toBe(1)
    const fleet = listAircraft()
    expect(fleet).toHaveLength(1)
    expect(fleet[0].name).toBe('New Name')
    expect(fleet[0].id).toBe('original-id')   // existing id preserved
  })

  it('handles a mix of new and existing aircraft', () => {
    const existing = makeAircraft({ id: 'id-1', registration: 'F-BPCT' })
    saveAircraft(existing)

    const newAc = makeAircraft({ id: 'id-2', registration: 'F-GHKJ' })
    const result = importFleet([existing, newAc])

    expect(result.added).toBe(1)
    expect(result.updated).toBe(1)
    expect(listAircraft()).toHaveLength(2)
  })

  it('returns { added: 0, updated: 0 } for empty array', () => {
    const result = importFleet([])
    expect(result).toEqual({ added: 0, updated: 0 })
  })
})

describe('duplicateAircraft', () => {
  it('returns a copy with a new id', () => {
    const ac = makeAircraft({ id: 'original-id' })
    const copy = duplicateAircraft(ac)
    expect(copy.id).not.toBe('original-id')
  })

  it('clears registration on the copy', () => {
    const ac = makeAircraft({ registration: 'F-BPCT' })
    const copy = duplicateAircraft(ac)
    expect(copy.registration).toBe('')
  })

  it('appends " (copie)" to the name', () => {
    const ac = makeAircraft({ name: 'DR221' })
    const copy = duplicateAircraft(ac)
    expect(copy.name).toBe('DR221 (copie)')
  })

  it('does NOT save to localStorage', () => {
    const ac = makeAircraft()
    duplicateAircraft(ac)
    expect(listAircraft()).toHaveLength(0)
  })

  it('preserves all other fields', () => {
    const ac = makeAircraft()
    const copy = duplicateAircraft(ac)
    expect(copy.massBalance).toEqual(ac.massBalance)
    expect(copy.performance).toEqual(ac.performance)
    expect(copy.characteristics).toEqual(ac.characteristics)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --run src/__tests__/lib/storage.test.ts
```

Expected: FAIL — `importFleet` and `duplicateAircraft` are not exported from storage.

- [ ] **Step 3: Add functions to `src/lib/storage.ts`**

Add after `deleteAircraft` (before the dossier section):

```typescript
export function downloadFleet(): void {
  const fleet = listAircraft()
  const payload = JSON.stringify({ version: 1, aircraft: fleet }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `flotte-dossier-de-vol-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importFleet(selected: Aircraft[]): { added: number; updated: number } {
  const existing = listAircraft()
  let added = 0
  let updated = 0
  for (const imported of selected) {
    const match = existing.find(ac => ac.registration === imported.registration)
    if (match) {
      saveAircraft({ ...imported, id: match.id })
      updated++
    } else {
      saveAircraft({ ...imported, id: crypto.randomUUID() })
      added++
    }
  }
  return { added, updated }
}

export function duplicateAircraft(ac: Aircraft): Aircraft {
  return { ...ac, id: crypto.randomUUID(), registration: '', name: `${ac.name} (copie)` }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --run src/__tests__/lib/storage.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Full test suite**

```bash
npm test -- --run
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/__tests__/lib/storage.test.ts
git commit -m "feat: add downloadFleet, importFleet, duplicateAircraft to storage"
```

---

## Task 4: `FleetImportModal` component

**Files:**
- Create: `src/features/fleet/FleetImportModal.tsx`

No unit tests (React UI component; no React Testing Library in the project). TypeScript check validates correctness.

- [ ] **Step 1: Create `src/features/fleet/FleetImportModal.tsx`**

```typescript
import { useState } from 'react'
import type { Aircraft } from '../../types'
import { importFleet } from '../../lib/storage'
import { listAircraft } from '../../lib/storage'
import { Button } from '../../components/ui/Button'

interface Props {
  aircraft: Aircraft[]
  onComplete: () => void
  onCancel: () => void
}

function isExisting(registration: string): boolean {
  return listAircraft().some(ac => ac.registration === registration)
}

export function FleetImportModal({ aircraft, onComplete, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(aircraft.filter(ac => !isExisting(ac.registration)).map(ac => ac.registration))
  )

  const toggle = (registration: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(registration)) {
        next.delete(registration)
      } else {
        next.add(registration)
      }
      return next
    })
  }

  const handleImport = () => {
    const toImport = aircraft.filter(ac => selected.has(ac.registration))
    importFleet(toImport)
    onComplete()
  }

  const selectedCount = selected.size

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg w-full max-w-lg shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-1)]">
            Import flotte — {aircraft.length} avion{aircraft.length > 1 ? 's' : ''} trouvé{aircraft.length > 1 ? 's' : ''}
          </h2>
        </div>

        {/* Table */}
        <div className="px-5 py-3 max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-dim)] text-left">
                <th className="pb-2 w-8"></th>
                <th className="pb-2 pr-3">Nom</th>
                <th className="pb-2 pr-3">Immatriculation</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {aircraft.map(ac => {
                const existing = isExisting(ac.registration)
                const checked = selected.has(ac.registration)
                return (
                  <tr
                    key={ac.registration}
                    className="border-t border-[var(--border)] cursor-pointer"
                    onClick={() => toggle(ac.registration)}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(ac.registration)}
                        onClick={e => e.stopPropagation()}
                        className="accent-[var(--amber)]"
                      />
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-1)]">{ac.name}</td>
                    <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{ac.registration || '—'}</td>
                    <td className="py-2">
                      {existing ? (
                        <span className="text-xs px-2 py-0.5 rounded border border-[var(--amber)] text-[var(--amber)]">
                          Existant ⚠
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded border border-[var(--green,#4ade80)] text-[var(--green,#4ade80)]">
                          Nouveau
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Warning */}
        <div className="px-5 py-2 text-xs text-[var(--text-dim)] border-t border-[var(--border)]">
          Les avions « Existant » cochés seront écrasés.
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex justify-end gap-3 border-t border-[var(--border)]">
          <Button variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={selectedCount === 0}
          >
            Importer {selectedCount > 0 ? `${selectedCount} avion${selectedCount > 1 ? 's' : ''}` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/fleet/FleetImportModal.tsx
git commit -m "feat: FleetImportModal — import preview with Nouveau/Existant badges"
```

---

## Task 5: `HomeScreen.tsx` — Export, Import, Duplicate

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Update `HomeScreen.tsx`**

Full rewrite of the file. Key changes:
- New prop `onDuplicateAircraft: (ac: Aircraft) => void`
- State: `importModal: Aircraft[] | null` (null = closed, array = aircraft to preview)
- Import `downloadFleet`, new `FleetImportModal`
- Fleet section header: add "Exporter" and "Importer" buttons
- Per-aircraft card: add "Dupliquer" button
- `FleetImportModal` rendered when `importModal !== null`

```typescript
import { useState, useCallback, useRef } from 'react'
import { listAircraft, deleteAircraft, loadDossierFromFile, downloadFleet } from '../lib/storage'
import { TEMPLATES } from '../lib/templates'
import type { Aircraft, FlightDossier } from '../types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FleetImportModal } from '../features/fleet/FleetImportModal'

interface FleetFile {
  version: number
  aircraft: Aircraft[]
}

interface HomeScreenProps {
  onNewAircraft: () => void
  onEditAircraft: (id: string) => void
  onDuplicateAircraft: (ac: Aircraft) => void
  onNewDossier: (aircraftId: string) => void
  onOpenDossier: (dossier: FlightDossier) => void
}

export function HomeScreen({ onNewAircraft, onEditAircraft, onDuplicateAircraft, onNewDossier, onOpenDossier }: HomeScreenProps) {
  const [aircraft, setAircraft] = useState(() => listAircraft())
  const [error, setError] = useState<string | null>(null)
  const [importModal, setImportModal] = useState<Aircraft[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshFleet = useCallback(() => setAircraft(listAircraft()), [])

  const handleDelete = useCallback((id: string) => {
    if (confirm('Supprimer cet avion ?')) {
      deleteAircraft(id)
      refreshFleet()
    }
  }, [refreshFleet])

  const handleOpenDossierFile = useCallback(async (file: File) => {
    try {
      const dossier = await loadDossierFromFile(file)
      onOpenDossier(dossier)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier invalide')
    }
  }, [onOpenDossier])

  const handleImportFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as FleetFile
        if (data.version !== 1 || !Array.isArray(data.aircraft) || data.aircraft.length === 0) {
          setError('Fichier de flotte invalide (version manquante ou liste vide)')
          return
        }
        setImportModal(data.aircraft)
      } catch {
        setError('Fichier invalide — JSON malformé')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleFilePick = useCallback((file: File) => {
    // Attempt to detect fleet vs dossier file by presence of "aircraft" array
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.version === 1 && Array.isArray(data.aircraft)) {
          // Fleet file
          if (data.aircraft.length === 0) {
            setError('Fichier de flotte invalide (liste vide)')
            return
          }
          setImportModal(data.aircraft)
        } else if (data.id && data.name && data.aircraft && !Array.isArray(data.aircraft)) {
          // Dossier file
          loadDossierFromFile(file).then(onOpenDossier).catch(e => {
            setError(e instanceof Error ? e.message : 'Fichier invalide')
          })
        } else {
          setError('Format de fichier non reconnu')
        }
      } catch {
        setError('Fichier invalide — JSON malformé')
      }
    }
    reader.readAsText(file)
  }, [onOpenDossier])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFilePick(file)
  }, [handleFilePick])

  return (
    <div
      className="min-h-full p-6 max-w-4xl mx-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--text-1)] mb-1">dossier de vol</h1>
        <p className="text-[var(--text-muted)] text-sm">Préparation de vol VFR</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-sm">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>Fermer</button>
        </div>
      )}

      {/* Fleet section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Flotte ({aircraft.length})
          </h2>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={downloadFleet} disabled={aircraft.length === 0}>
              ↓ Exporter
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              ↑ Importer
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImportFile(file)
                e.target.value = ''
              }}
            />
            <Button variant="secondary" size="sm" onClick={onNewAircraft}>
              + Nouvel avion
            </Button>
          </div>
        </div>

        {aircraft.length === 0 ? (
          <Card padding="lg" className="text-center">
            <p className="text-[var(--text-muted)] mb-4">Aucun avion configuré</p>
            <p className="text-[var(--text-dim)] text-xs mb-4">
              Templates disponibles : {TEMPLATES.map(t => t.label).join(', ')}
            </p>
            <Button onClick={onNewAircraft}>Configurer un avion</Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {aircraft.map((ac) => (
              <Card key={ac.id} padding="md" className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-medium text-[var(--text-1)]">{ac.name}</div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {ac.registration} · {ac.characteristics.regimes[0].ias}kt IAS · {ac.characteristics.regimes[0].fuelBurn}L/h · {ac.characteristics.fuelCapacity}L
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="primary" size="sm" onClick={() => onNewDossier(ac.id)}>
                    Nouveau dossier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEditAircraft(ac.id)}>
                    Modifier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDuplicateAircraft(ac)}>
                    Dupliquer
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(ac.id)}>
                    ✕
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Open dossier section */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
          Ouvrir un dossier
        </h2>
        <Card
          padding="lg"
          className="text-center border-dashed border-2 cursor-pointer hover:border-[var(--amber)] transition-colors"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.json'
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) handleOpenDossierFile(file)
            }
            input.click()
          }}
        >
          <p className="text-[var(--text-muted)] mb-2">Glisser-déposer un fichier .json</p>
          <p className="text-[var(--text-dim)] text-xs">ou cliquer pour parcourir</p>
        </Card>
      </section>

      {/* Fleet import modal */}
      {importModal && (
        <FleetImportModal
          aircraft={importModal}
          onComplete={() => {
            setImportModal(null)
            refreshFleet()
          }}
          onCancel={() => setImportModal(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: error on `onDuplicateAircraft` prop — App.tsx doesn't pass it yet. Fix in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: HomeScreen — fleet export/import buttons and duplicate action"
```

---

## Task 6: `App.tsx` + `AircraftEditorScreen.tsx` — Duplicate flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/screens/AircraftEditorScreen.tsx`

- [ ] **Step 1: Update `src/App.tsx`**

Add the `PREFILL_AIRCRAFT` action and `prefillAircraft` state, wire up `onDuplicateAircraft`:

```typescript
import { useReducer } from 'react'
import type { Aircraft, FlightDossier, DossierTab, Screen } from './types'
import { HomeScreen } from './screens/HomeScreen'
import { AircraftEditorScreen } from './screens/AircraftEditorScreen'
import { DossierScreen } from './screens/DossierScreen'
import { AppChrome } from './components/AppChrome'
import { duplicateAircraft } from './lib/storage'

interface AppState {
  screen: Screen
  editingAircraftId: string | null
  prefillAircraft: Aircraft | null
  dossier: FlightDossier | null
  dossierTab: DossierTab
}

type AppAction =
  | { type: 'GO_HOME' }
  | { type: 'NEW_AIRCRAFT' }
  | { type: 'EDIT_AIRCRAFT'; id: string }
  | { type: 'PREFILL_AIRCRAFT'; aircraft: Aircraft }
  | { type: 'OPEN_DOSSIER'; dossier: FlightDossier }
  | { type: 'SET_TAB'; tab: DossierTab }
  | { type: 'UPDATE_DOSSIER'; dossier: FlightDossier }
  | { type: 'CLOSE_DOSSIER' }

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'GO_HOME':
      return { ...state, screen: 'home', dossier: null, editingAircraftId: null, prefillAircraft: null }
    case 'NEW_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: null, prefillAircraft: null }
    case 'EDIT_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: action.id, prefillAircraft: null }
    case 'PREFILL_AIRCRAFT':
      return { ...state, screen: 'aircraft-editor', editingAircraftId: null, prefillAircraft: action.aircraft }
    case 'OPEN_DOSSIER':
    case 'UPDATE_DOSSIER':
      return { ...state, screen: 'dossier', dossier: action.dossier }
    case 'SET_TAB':
      return { ...state, dossierTab: action.tab }
    case 'CLOSE_DOSSIER':
      return { ...state, screen: 'home', dossier: null }
    default:
      return state
  }
}

const initialState: AppState = {
  screen: 'home',
  editingAircraftId: null,
  prefillAircraft: null,
  dossier: null,
  dossierTab: 'route',
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-app)' }}>
      <AppChrome
        screen={state.screen}
        dossier={state.dossier}
        dossierTab={state.dossierTab}
        onGoHome={() => dispatch({ type: 'GO_HOME' })}
        onSetTab={(tab) => dispatch({ type: 'SET_TAB', tab })}
        onDownload={state.dossier ? () => {
          import('./lib/storage').then(({ downloadDossier }) => downloadDossier(state.dossier!))
        } : undefined}
      />
      <main className="flex-1 overflow-auto">
        {state.screen === 'home' && (
          <HomeScreen
            onNewAircraft={() => dispatch({ type: 'NEW_AIRCRAFT' })}
            onEditAircraft={(id) => dispatch({ type: 'EDIT_AIRCRAFT', id })}
            onDuplicateAircraft={(ac) => dispatch({ type: 'PREFILL_AIRCRAFT', aircraft: duplicateAircraft(ac) })}
            onNewDossier={(aircraftId) => {
              import('./lib/storage').then(({ getAircraft }) => {
                const aircraft = getAircraft(aircraftId)
                if (!aircraft) return
                const now = new Date()
                const dossier: FlightDossier = {
                  id: crypto.randomUUID(),
                  name: `${aircraft.name} ${now.toISOString().slice(0, 10)}`,
                  date: now.toISOString().slice(0, 10),
                  departureTime: '',
                  aircraft: { ...aircraft, snapshotAt: now.toISOString() },
                  route: null,
                  weatherInputs: { fields: {}, winds: [], notes: '' },
                  navOverrides: {},
                  navNotes: {},
                  fuelInputs: {
                    gsBase: aircraft.characteristics.regimes[0].ias,
                    windAdjust: 0,
                    roulage: 10,
                    marge: 10,
                    extras: [],
                    reserveMin: 30,
                    derouteMin: 30,
                    plein: false,
                  },
                  loading: Object.fromEntries(aircraft.massBalance.stations.map(s => [s.name, 0])),
                  perfRegulatory: 1.0,
                  perfInputs: {},
                  notes: '',
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                }
                dispatch({ type: 'OPEN_DOSSIER', dossier })
              })
            }}
            onOpenDossier={(dossier) => dispatch({ type: 'OPEN_DOSSIER', dossier })}
          />
        )}
        {state.screen === 'aircraft-editor' && (
          <AircraftEditorScreen
            editingAircraftId={state.editingAircraftId}
            prefillAircraft={state.prefillAircraft ?? undefined}
            onSave={() => dispatch({ type: 'GO_HOME' })}
            onCancel={() => dispatch({ type: 'GO_HOME' })}
          />
        )}
        {state.screen === 'dossier' && state.dossier && (
          <DossierScreen
            dossier={state.dossier}
            activeTab={state.dossierTab}
            onUpdate={(dossier) => dispatch({ type: 'UPDATE_DOSSIER', dossier })}
          />
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update `AircraftEditorScreen.tsx` — add `prefillAircraft` prop**

Two surgical edits:

**Edit 1** — add `prefillAircraft?: Aircraft` to the Props interface:

```typescript
interface Props {
  editingAircraftId: string | null
  prefillAircraft?: Aircraft
  onSave: () => void
  onCancel: () => void
}
```

**Edit 2** — update the component signature and add a useEffect for prefill (after the existing `useEffect` for `editingAircraftId`):

```typescript
export function AircraftEditorScreen({ editingAircraftId, prefillAircraft, onSave, onCancel }: Props) {
```

Add this useEffect immediately after the existing one (around line 166):

```typescript
useEffect(() => {
  if (prefillAircraft) applyAircraft(prefillAircraft)
}, [prefillAircraft, applyAircraft])
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Full test suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/screens/AircraftEditorScreen.tsx
git commit -m "feat: duplicate aircraft flow — PREFILL_AIRCRAFT action and prefillAircraft prop"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Fleet export — `downloadFleet`, versioned JSON | Task 3 |
| Fleet import — `importFleet`, registration primary key | Task 3 |
| Import preview modal, Nouveau/Existant badges | Task 4 |
| Existants décochés par défaut | Task 4 |
| Dupliquer — returns copy without saving | Task 3 |
| Dupliquer — opens editor prefilled | Task 6 |
| `resources/dr221.json` full Aircraft JSON | Task 1 |
| Delete 3 partial JSON files | Task 1 |
| `import.meta.glob` autodiscovery | Task 2 |
| `downloadFleet`, `importFleet`, `duplicateAircraft` in storage | Task 3 |
| HomeScreen: Exporter/Importer buttons | Task 5 |
| HomeScreen: Dupliquer button per aircraft | Task 5 |
| `prefillAircraft` prop on AircraftEditorScreen | Task 6 |

All spec requirements covered. ✓

### Type consistency

- `importFleet(selected: Aircraft[]): { added: number; updated: number }` — consistent in Task 3 storage code and Task 3 tests.
- `duplicateAircraft(ac: Aircraft): Aircraft` — consistent in Task 3 storage and Task 5 HomeScreen usage.
- `prefillAircraft?: Aircraft` — consistent in Task 6 App.tsx state, AircraftEditorScreen Props, and HomeScreen prop `onDuplicateAircraft: (ac: Aircraft) => void`.
- `FleetImportModal` calls `importFleet` from storage — same signature. ✓
