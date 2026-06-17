# Branches & FlightPoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Skydemon `.flightplan` import workflow with a manual aerodrome-list system organised into flight branches, each with its own fuel budget.

**Architecture:** A standalone aerodrome localStorage database (seeded from `resources/aerodromes.json`, optionally refreshed from OpenAIP) is introduced first. `FlightDossier` then replaces `route: ImportedRoute | null` with `branches: FlightBranch[]` and `fuelInputs: Record<branchId, FuelInputs>`. The navlog subsystem is removed entirely; Weather, Perf, and Fuel panels are re-sourced from branches.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Leaflet / react-leaflet, localStorage, OpenAIP REST API (`api.core.openaip.net`).

## Global Constraints

- All localStorage keys follow the pattern `dossier-de-vol:<resource>`
- No external routing library — navigation is a `Screen` union type in `src/types/index.ts`, switched in `App.tsx`
- Runway `surface` must be `'hard' | 'grass'` only — default `'hard'`
- Runway `ident` is free text: `"27"`, `"09G"`, `"27 herbe"` are all valid
- `FlightPoint` carries zero geographic data — all geo is resolved from the aerodrome DB at render time
- Reserves and déroutement fuel are on the **last branch** only
- TODA/LDA fields on `RunwayInfo` are optional (`number | undefined`) — omit rather than store 0
- `perfInputs` key = ICAO string (unchanged from current behaviour)
- `DossierTab` `'route'` → `'branches'`; `'navlog'` is removed
- `Screen` gains `'aerodrome-db'`
- Export/import follow the same pattern as fleet: `{ version: 1, aerodromes: StoredAerodrome[] }`

---

## Task 1: Aerodrome database — types, seed file, service

**Files:**
- Modify: `src/types/index.ts`
- Create: `resources/aerodromes.json`
- Create: `src/lib/icao/aerodromeDb.ts`
- Create: `src/__tests__/icao/aerodromeDb.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // src/types/index.ts
  export interface RunwayInfo {
    ident: string
    headingTrue: number
    lengthFt: number
    toda?: number
    lda?: number
    surface: 'hard' | 'grass'
  }
  export interface StoredAerodrome {
    icao: string
    name: string
    lat: number
    lng: number
    elevationFt: number
    runways: RunwayInfo[]
    updatedAt: string
  }
  // src/lib/icao/aerodromeDb.ts
  export function getAerodromeDb(): StoredAerodrome[]
  export function getAerodrome(icao: string): StoredAerodrome | undefined
  export function upsertAerodrome(a: StoredAerodrome): void
  export function deleteAerodromeFromDb(icao: string): void
  export function exportAerodromeDb(): void
  export function importAerodromeDb(incoming: StoredAerodrome[]): { added: number; updated: number }
  export function initAerodromeDb(): void  // call on app start
  ```

- [ ] **Step 1: Add types to `src/types/index.ts`**

  Insert after the `// ── Avion` block, before `// ── Route`:

  ```typescript
  // ── Base aérodromes ────────────────────────────────────────────────────────────

  export interface RunwayInfo {
    ident: string            // texte libre: "27", "09G", "27 herbe"
    headingTrue: number      // cap vrai en degrés
    lengthFt: number
    toda?: number            // m, optionnel
    lda?: number             // m, optionnel
    surface: 'hard' | 'grass'
  }

  export interface StoredAerodrome {
    icao: string
    name: string
    lat: number
    lng: number
    elevationFt: number
    runways: RunwayInfo[]
    updatedAt: string        // ISO 8601
  }
  ```

- [ ] **Step 2: Create `resources/aerodromes.json`**

  Convert the array from `src/lib/icao/database.ts` to JSON, adding `elevationFt: 0`, `runways: []`, `updatedAt: "2026-06-17T00:00:00.000Z"` for every entry. The file starts with:

  ```json
  [
    {
      "icao": "LFPG",
      "name": "Paris Charles de Gaulle",
      "lat": 49.0097,
      "lng": 2.5478,
      "elevationFt": 0,
      "runways": [],
      "updatedAt": "2026-06-17T00:00:00.000Z"
    },
    {
      "icao": "LFPO",
      "name": "Paris Orly",
      "lat": 48.7233,
      "lng": 2.3794,
      "elevationFt": 0,
      "runways": [],
      "updatedAt": "2026-06-17T00:00:00.000Z"
    }
  ]
  ```

  Include all ~100 entries from `src/lib/icao/database.ts` in the same format.

- [ ] **Step 3: Write failing tests**

  Create `src/__tests__/icao/aerodromeDb.test.ts`:

  ```typescript
  import { describe, it, expect, beforeEach, vi } from 'vitest'

  // Mock localStorage
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  })

  // Mock the JSON import
  vi.mock('../../../resources/aerodromes.json', () => ({
    default: [
      { icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 0, runways: [], updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  }))

  import {
    getAerodromeDb, getAerodrome, upsertAerodrome,
    deleteAerodromeFromDb, importAerodromeDb, initAerodromeDb,
  } from '../../../src/lib/icao/aerodromeDb'

  beforeEach(() => { Object.keys(store).forEach(k => delete store[k]) })

  describe('initAerodromeDb', () => {
    it('seeds from JSON when localStorage is empty', () => {
      initAerodromeDb()
      expect(getAerodrome('LFPN')?.name).toBe('Toussus')
    })
    it('does not overwrite existing data on second call', () => {
      initAerodromeDb()
      upsertAerodrome({ icao: 'LFPN', name: 'Modified', lat: 0, lng: 0, elevationFt: 500, runways: [], updatedAt: '' })
      initAerodromeDb()
      expect(getAerodrome('LFPN')?.name).toBe('Modified')
    })
  })

  describe('upsertAerodrome', () => {
    it('adds a new aerodrome', () => {
      initAerodromeDb()
      upsertAerodrome({ icao: 'LFGH', name: 'La Charité', lat: 47.17, lng: 3.02, elevationFt: 580, runways: [], updatedAt: '' })
      expect(getAerodrome('LFGH')?.elevationFt).toBe(580)
    })
    it('updates an existing aerodrome', () => {
      initAerodromeDb()
      upsertAerodrome({ icao: 'LFPN', name: 'Toussus', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' })
      expect(getAerodrome('LFPN')?.elevationFt).toBe(538)
    })
  })

  describe('deleteAerodromeFromDb', () => {
    it('removes an aerodrome', () => {
      initAerodromeDb()
      deleteAerodromeFromDb('LFPN')
      expect(getAerodrome('LFPN')).toBeUndefined()
    })
  })

  describe('importAerodromeDb', () => {
    it('merges incoming aerodromes, returns counts', () => {
      initAerodromeDb()
      const result = importAerodromeDb([
        { icao: 'LFPN', name: 'Toussus Updated', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
        { icao: 'LFGH', name: 'La Charité', lat: 47.17, lng: 3.02, elevationFt: 580, runways: [], updatedAt: '' },
      ])
      expect(result).toEqual({ added: 1, updated: 1 })
      expect(getAerodrome('LFPN')?.name).toBe('Toussus Updated')
      expect(getAerodrome('LFGH')?.elevationFt).toBe(580)
    })
  })

  describe('getAerodromeDb', () => {
    it('returns all aerodromes', () => {
      initAerodromeDb()
      expect(getAerodromeDb().length).toBeGreaterThan(0)
    })
  })
  ```

- [ ] **Step 4: Run tests — expect failures**

  ```
  npx vitest run src/__tests__/icao/aerodromeDb.test.ts
  ```
  Expected: all tests fail (module not found).

- [ ] **Step 5: Implement `src/lib/icao/aerodromeDb.ts`**

  ```typescript
  import type { StoredAerodrome } from '../../types'
  import SEED from '../../../resources/aerodromes.json'

  const KEY = 'dossier-de-vol:aerodromes'

  function load(): StoredAerodrome[] {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredAerodrome[]) : []
  }

  function save(db: StoredAerodrome[]): void {
    localStorage.setItem(KEY, JSON.stringify(db))
  }

  export function initAerodromeDb(): void {
    if (localStorage.getItem(KEY) !== null) return
    save(SEED as StoredAerodrome[])
  }

  export function getAerodromeDb(): StoredAerodrome[] {
    return load()
  }

  export function getAerodrome(icao: string): StoredAerodrome | undefined {
    return load().find(a => a.icao === icao)
  }

  export function upsertAerodrome(aerodrome: StoredAerodrome): void {
    const db = load()
    const idx = db.findIndex(a => a.icao === aerodrome.icao)
    if (idx >= 0) db[idx] = aerodrome
    else db.push(aerodrome)
    save(db)
  }

  export function deleteAerodromeFromDb(icao: string): void {
    save(load().filter(a => a.icao !== icao))
  }

  export function exportAerodromeDb(): void {
    const payload = JSON.stringify({ version: 1, aerodromes: load() }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aerodromes-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  export function importAerodromeDb(
    incoming: StoredAerodrome[]
  ): { added: number; updated: number } {
    const db = load()
    let added = 0, updated = 0
    for (const a of incoming) {
      const idx = db.findIndex(x => x.icao === a.icao)
      if (idx >= 0) { db[idx] = a; updated++ }
      else { db.push(a); added++ }
    }
    save(db)
    return { added, updated }
  }
  ```

- [ ] **Step 6: Run tests — expect all pass**

  ```
  npx vitest run src/__tests__/icao/aerodromeDb.test.ts
  ```
  Expected: 7 tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/types/index.ts resources/aerodromes.json src/lib/icao/aerodromeDb.ts src/__tests__/icao/aerodromeDb.test.ts
  git commit -m "feat: StoredAerodrome types, aerodromes.json seed, aerodromeDb service"
  ```

---

## Task 2: OpenAIP client

**Files:**
- Create: `src/lib/icao/openAipClient.ts`
- Create: `src/__tests__/icao/openAipClient.test.ts`

**Interfaces:**
- Consumes: `StoredAerodrome`, `RunwayInfo` from `src/types/index.ts`
- Produces:
  ```typescript
  export async function fetchFromOpenAip(
    icao: string,
    apiKey: string
  ): Promise<StoredAerodrome | null>
  ```

- [ ] **Step 1: Write failing test**

  Create `src/__tests__/icao/openAipClient.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { fetchFromOpenAip } from '../../../src/lib/icao/openAipClient'

  const mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)

  beforeEach(() => mockFetch.mockReset())

  const API_RESPONSE = {
    items: [{
      icaoCode: 'LFPN',
      name: 'Paris Toussus-le-Noble',
      geometry: { type: 'Point', coordinates: [2.1119, 48.7497] },
      elevation: { value: 163.98, unit: 0 },
      runways: [
        {
          designator: '25',
          trueHeading: 252,
          dimension: { length: { value: 900, unit: 1 } },
          surface: { mainComposite: 0 },
        },
        {
          designator: '07',
          trueHeading: 72,
          dimension: { length: { value: 900, unit: 1 } },
          surface: { mainComposite: 5 },
        },
      ],
    }],
  }

  describe('fetchFromOpenAip', () => {
    it('maps OpenAIP response to StoredAerodrome', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE,
      })

      const result = await fetchFromOpenAip('LFPN', 'test-key')

      expect(result).not.toBeNull()
      expect(result!.icao).toBe('LFPN')
      expect(result!.name).toBe('Paris Toussus-le-Noble')
      expect(result!.lat).toBeCloseTo(48.7497)
      expect(result!.lng).toBeCloseTo(2.1119)
      expect(result!.elevationFt).toBeCloseTo(538, 0)  // 163.98m * 3.28084
      expect(result!.runways).toHaveLength(2)
      expect(result!.runways[0]).toMatchObject({
        ident: '25',
        headingTrue: 252,
        lengthFt: 900,
        surface: 'hard',
      })
      expect(result!.runways[1].surface).toBe('grass')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('LFPN'),
        expect.objectContaining({ headers: { 'x-openaip-api-key': 'test-key' } })
      )
    })

    it('returns null when API returns empty items', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
      expect(await fetchFromOpenAip('XXXX', 'key')).toBeNull()
    })

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
      expect(await fetchFromOpenAip('LFPN', 'bad-key')).toBeNull()
    })

    it('returns null on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      expect(await fetchFromOpenAip('LFPN', 'key')).toBeNull()
    })

    it('handles elevation in feet (unit=1) without conversion', async () => {
      const resp = { items: [{ ...API_RESPONSE.items[0], elevation: { value: 538, unit: 1 } }] }
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => resp })
      const result = await fetchFromOpenAip('LFPN', 'key')
      expect(result!.elevationFt).toBeCloseTo(538, 0)
    })
  })
  ```

- [ ] **Step 2: Run test — expect failure**

  ```
  npx vitest run src/__tests__/icao/openAipClient.test.ts
  ```
  Expected: all tests fail (module not found).

- [ ] **Step 3: Implement `src/lib/icao/openAipClient.ts`**

  ```typescript
  import type { StoredAerodrome, RunwayInfo } from '../../types'

  const BASE = 'https://api.core.openaip.net/api'
  const M_TO_FT = 3.28084

  function mapSurface(composite: number): 'hard' | 'grass' {
    // OpenAIP composite codes: 0=concrete, 1=asphalt, 2=bituminous → hard
    // 5=grass, 6=gravel, 7=sand, 8=water, 9=other → grass (fallback)
    return composite <= 2 ? 'hard' : 'grass'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function parseRunway(rwy: any): RunwayInfo {
    return {
      ident: String(rwy.designator ?? ''),
      headingTrue: Number(rwy.trueHeading ?? 0),
      lengthFt: Number(rwy.dimension?.length?.value ?? 0),
      surface: mapSurface(rwy.surface?.mainComposite ?? 0),
    }
  }

  export async function fetchFromOpenAip(
    icao: string,
    apiKey: string,
  ): Promise<StoredAerodrome | null> {
    try {
      const url = `${BASE}/airports?icao_code=${encodeURIComponent(icao)}&limit=1`
      const res = await fetch(url, { headers: { 'x-openaip-api-key': apiKey } })
      if (!res.ok) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      const item = data?.items?.[0]
      if (!item) return null

      const elevRaw = Number(item.elevation?.value ?? 0)
      const elevUnit = item.elevation?.unit ?? 0  // 0=m, 1=ft
      const elevationFt = elevUnit === 1 ? elevRaw : elevRaw * M_TO_FT

      const [lng, lat] = item.geometry?.coordinates ?? [0, 0]

      return {
        icao: String(item.icaoCode ?? icao),
        name: String(item.name ?? ''),
        lat: Number(lat),
        lng: Number(lng),
        elevationFt: Math.round(elevationFt),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runways: Array.isArray(item.runways) ? item.runways.map((r: any) => parseRunway(r)) : [],
        updatedAt: new Date().toISOString(),
      }
    } catch {
      return null
    }
  }
  ```

- [ ] **Step 4: Run tests — expect all pass**

  ```
  npx vitest run src/__tests__/icao/openAipClient.test.ts
  ```
  Expected: 5 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/icao/openAipClient.ts src/__tests__/icao/openAipClient.test.ts
  git commit -m "feat: OpenAIP client — fetch aerodrome by ICAO"
  ```

---

## Task 3: AerodromeScreen — database UI + navigation wiring

**Files:**
- Create: `src/features/aerodromes/AerodromeScreen.tsx`
- Modify: `src/types/index.ts` (add `'aerodrome-db'` to `Screen`)
- Modify: `src/App.tsx`
- Modify: `src/components/AppChrome.tsx`
- Modify: `src/screens/HomeScreen.tsx`
- Delete: `src/lib/icao/database.ts`, `src/__tests__/icao/database.test.ts`

**Interfaces:**
- Consumes: `getAerodromeDb`, `upsertAerodrome`, `deleteAerodromeFromDb`, `exportAerodromeDb`, `importAerodromeDb` from Task 1; `fetchFromOpenAip` from Task 2
- Produces: `AerodromeScreen` component (no props — reads/writes the DB directly)

- [ ] **Step 1: Add `'aerodrome-db'` to `Screen` type in `src/types/index.ts`**

  ```typescript
  export type Screen = 'home' | 'aircraft-editor' | 'dossier' | 'aerodrome-db'
  ```

- [ ] **Step 2: Add `OPEN_AERODROME_DB` action to `App.tsx` reducer**

  In the `AppAction` union:
  ```typescript
  | { type: 'OPEN_AERODROME_DB' }
  ```

  In the reducer `switch`:
  ```typescript
  case 'OPEN_AERODROME_DB':
    return { ...state, screen: 'aerodrome-db' }
  ```

- [ ] **Step 3: Update `AppChrome.tsx` — add aerodrome DB button**

  In the top bar, alongside the existing `← Accueil` button, add:

  ```tsx
  {screen === 'aerodrome-db' && (
    <Button variant="ghost" size="sm" onClick={onGoHome}>← Accueil</Button>
  )}
  ```

  Also update `AppChromeProps` to propagate the screen correctly (already has `screen: Screen`, no change needed — the `screen !== 'home'` check already shows the back button).

- [ ] **Step 4: Add "Aérodromes" button to `HomeScreen.tsx`**

  Add an `onOpenAerodromeDb: () => void` prop to `HomeScreenProps`. Add a section below the fleet section:

  ```tsx
  interface HomeScreenProps {
    onNewAircraft: () => void
    onEditAircraft: (id: string) => void
    onDuplicateAircraft: (ac: Aircraft) => void
    onNewDossier: (aircraftId: string) => void
    onOpenDossier: (dossier: FlightDossier) => void
    onOpenAerodromeDb: () => void  // NEW
  }
  ```

  In the JSX, add a button (e.g., after the fleet section header):
  ```tsx
  <section className="mb-8">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        Base aérodromes
      </h2>
      <Button variant="ghost" size="sm" onClick={onOpenAerodromeDb}>
        Gérer →
      </Button>
    </div>
  </section>
  ```

- [ ] **Step 5: Wire in `App.tsx`**

  Pass `onOpenAerodromeDb` to HomeScreen:
  ```tsx
  <HomeScreen
    ...
    onOpenAerodromeDb={() => dispatch({ type: 'OPEN_AERODROME_DB' })}
  />
  ```

  Add screen render:
  ```tsx
  {state.screen === 'aerodrome-db' && (
    <AerodromeScreen />
  )}
  ```

  Import `AerodromeScreen` at top.

- [ ] **Step 6: Create `src/features/aerodromes/AerodromeScreen.tsx`**

  ```tsx
  import { useState, useRef, useCallback } from 'react'
  import type { StoredAerodrome, RunwayInfo } from '../../types'
  import {
    getAerodromeDb, upsertAerodrome, deleteAerodromeFromDb,
    exportAerodromeDb, importAerodromeDb,
  } from '../../lib/icao/aerodromeDb'
  import { fetchFromOpenAip } from '../../lib/icao/openAipClient'
  import { Card } from '../../components/ui/Card'
  import { Button } from '../../components/ui/Button'
  import { Input } from '../../components/ui/Input'
  import { Badge } from '../../components/ui/Badge'

  const OPENAIP_KEY_STORAGE = 'dossier-de-vol:openaip-key'

  function RunwayEditor({
    runways,
    onChange,
  }: {
    runways: RunwayInfo[]
    onChange: (runways: RunwayInfo[]) => void
  }) {
    const add = () => onChange([...runways, { ident: '', headingTrue: 0, lengthFt: 0, surface: 'hard' }])
    const remove = (i: number) => onChange(runways.filter((_, j) => j !== i))
    const update = (i: number, changes: Partial<RunwayInfo>) =>
      onChange(runways.map((r, j) => j === i ? { ...r, ...changes } : r))

    return (
      <div className="space-y-2">
        {runways.map((rwy, i) => (
          <div key={i} className="grid grid-cols-6 gap-2 items-end">
            <Input label="Piste" value={rwy.ident}
              onChange={e => update(i, { ident: e.target.value })} />
            <Input label="Cap vrai (°)" type="number" value={rwy.headingTrue}
              onChange={e => update(i, { headingTrue: Number(e.target.value) })} />
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

  function AerodromeCard({
    aerodrome,
    onSave,
    onDelete,
    onRefresh,
    refreshing,
  }: {
    aerodrome: StoredAerodrome
    onSave: (a: StoredAerodrome) => void
    onDelete: () => void
    onRefresh: () => void
    refreshing: boolean
  }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(aerodrome)

    const save = () => { onSave(draft); setEditing(false) }
    const cancel = () => { setDraft(aerodrome); setEditing(false) }

    return (
      <Card padding="md">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[var(--amber)] font-semibold">{aerodrome.icao}</span>
          <span className="text-[var(--text-1)] flex-1">{aerodrome.name}</span>
          <Badge variant="neutral">{aerodrome.elevationFt} ft</Badge>
          <Badge variant="neutral">{aerodrome.runways.length} piste{aerodrome.runways.length !== 1 ? 's' : ''}</Badge>
          <Button variant="ghost" size="sm" onClick={() => setEditing(e => !e)}>
            {editing ? 'Fermer' : 'Modifier'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '...' : '↻'}
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>✕</Button>
        </div>

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
      </Card>
    )
  }

  export function AerodromeScreen() {
    const [db, setDb] = useState(() => getAerodromeDb())
    const [search, setSearch] = useState('')
    const [apiKey, setApiKey] = useState(() => localStorage.getItem(OPENAIP_KEY_STORAGE) ?? '')
    const [refreshing, setRefreshing] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const importRef = useRef<HTMLInputElement>(null)

    const refresh = () => setDb(getAerodromeDb())

    const handleSave = useCallback((a: StoredAerodrome) => {
      upsertAerodrome({ ...a, updatedAt: new Date().toISOString() })
      refresh()
    }, [])

    const handleDelete = useCallback((icao: string) => {
      if (confirm(`Supprimer ${icao} de la base ?`)) {
        deleteAerodromeFromDb(icao)
        refresh()
      }
    }, [])

    const handleRefreshFromApi = useCallback(async (icao: string) => {
      if (!apiKey) { setError('Clé OpenAIP non configurée'); return }
      setRefreshing(icao)
      setError(null)
      const result = await fetchFromOpenAip(icao, apiKey)
      if (result) { upsertAerodrome(result); refresh() }
      else setError(`Impossible de récupérer ${icao} depuis OpenAIP`)
      setRefreshing(null)
    }, [apiKey])

    const handleImport = useCallback((file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string)
          if (data.version !== 1 || !Array.isArray(data.aerodromes)) {
            setError('Format invalide (version manquante ou liste vide)')
            return
          }
          const { added, updated } = importAerodromeDb(data.aerodromes)
          refresh()
          setError(null)
          alert(`Import OK — ${added} ajouté(s), ${updated} mis à jour`)
        } catch {
          setError('JSON invalide')
        }
      }
      reader.readAsText(file)
    }, [])

    const filtered = db.filter(a =>
      a.icao.includes(search.toUpperCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-lg font-semibold text-[var(--text-1)] mb-6">Base aérodromes</h1>

        {error && (
          <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-sm">
            {error} <button className="ml-2 underline" onClick={() => setError(null)}>Fermer</button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher ICAO ou nom..."
            className="flex-1 min-w-48 text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
          />
          <Button variant="ghost" size="sm" onClick={exportAerodromeDb}>↓ Exporter</Button>
          <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}>↑ Importer</Button>
          <input ref={importRef} type="file" accept=".json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }} />
        </div>

        {/* OpenAIP key */}
        <details className="mb-6">
          <summary className="text-xs text-[var(--text-dim)] cursor-pointer">Clé API OpenAIP</summary>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); localStorage.setItem(OPENAIP_KEY_STORAGE, e.target.value) }}
              placeholder="Votre clé api.core.openaip.net"
              className="flex-1 text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none"
            />
          </div>
        </details>

        {/* List */}
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-dim)]">{filtered.length} aérodrome{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.map(a => (
            <AerodromeCard
              key={a.icao}
              aerodrome={a}
              onSave={handleSave}
              onDelete={() => handleDelete(a.icao)}
              onRefresh={() => handleRefreshFromApi(a.icao)}
              refreshing={refreshing === a.icao}
            />
          ))}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 7: Delete obsolete files**

  ```bash
  git rm src/lib/icao/database.ts src/__tests__/icao/database.test.ts
  ```

- [ ] **Step 8: Fix any remaining imports of `database.ts`**

  Search:
  ```
  npx tsc --noEmit 2>&1 | grep database
  ```
  Remove any `import { AERODROMES, findIcaoByCoords, getAerodrome } from '../icao/database'` lines found. (The only consumer was `RoutePanel.tsx` which used `findIcaoByCoords` — it will be deleted in Task 4.)

- [ ] **Step 9: Call `initAerodromeDb()` on app start in `src/main.tsx`**

  ```tsx
  import { initAerodromeDb } from './lib/icao/aerodromeDb'
  initAerodromeDb()
  ```

  Add this import and call before `createRoot(...)`.

- [ ] **Step 10: TypeScript check**

  ```
  npx tsc --noEmit
  ```
  Expected: 0 errors.

- [ ] **Step 11: Commit**

  ```bash
  git add -A
  git commit -m "feat: AerodromeScreen, navigation wiring, delete database.ts"
  ```

---

## Task 4: Core model migration — new FlightDossier + remove navlog

This task makes breaking changes to `FlightDossier` and removes the navlog subsystem. The app will compile at the end of the task.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/AppChrome.tsx`
- Modify: `src/screens/DossierScreen.tsx`
- Modify: `src/features/weather/WeatherPanel.tsx` (temporary empty list)
- Modify: `src/features/perf/PerfPanel.tsx` (temporary empty terrains)
- Modify: `src/features/fuel/FuelPanel.tsx` (remove navlog dep, use branch distance)
- Create: `src/features/branches/BranchesPanel.tsx` (stub)
- Delete: `src/features/navlog/NavlogPanel.tsx`, `src/lib/aviation/navlogGen.ts`, `src/__tests__/aviation/navlogGen.test.ts`, `src/features/route/RoutePanel.tsx`, `src/features/route/FlightplanImport.tsx`, `src/lib/flightplan/parser.ts`, `src/__tests__/flightplan/parser.test.ts`

**Interfaces:**
- Produces: updated `FlightDossier`, `DossierTab`, `FlightPoint`, `FlightBranch` (for later tasks)

- [ ] **Step 1: Update `src/types/index.ts` — new types, modified FlightDossier**

  Add after the `// ── Base aérodromes` block (already present from Task 1):

  ```typescript
  // ── Branches de vol ────────────────────────────────────────────────────────────

  export type FlightPointType = 'AERODROME' | 'VOR' | 'NDB' | 'WAYPOINT' | 'USER'
  export type FlightPointRole = 'DEP' | 'ARR' | 'DIVERT' | 'OVERFLY'

  export interface FlightPoint {
    id: string
    type: FlightPointType
    identifier: string
    role: FlightPointRole
  }

  export interface FlightBranch {
    id: string
    label: string
    points: FlightPoint[]
    distanceNm: number
    notes: string
  }
  ```

  Replace the `// ── Route` block (remove `ImportedRoute`, `RouteWaypoint`) and the `// ── Navlog` block (remove `NavlogEntry`) entirely.

  Replace `FlightDossier`:

  ```typescript
  export interface FlightDossier {
    id: string
    name: string
    date: string
    departureTime: string

    aircraft: AircraftSnapshot

    branches: FlightBranch[]
    weatherInputs: WeatherInputs
    fuelInputs: Record<string, FuelInputs>  // key = branch id

    loading: StationLoading
    perfRegulatory: number
    perfInputs: Record<string, TerrainPerfInputs>

    notes: string

    createdAt: string
    updatedAt: string
  }
  ```

  Replace `DossierTab`:

  ```typescript
  export type DossierTab = 'branches' | 'weather' | 'fuel' | 'wb' | 'perf' | 'dossier'
  ```

- [ ] **Step 2: Update `src/components/AppChrome.tsx`**

  ```typescript
  const DOSSIER_TABS: { key: DossierTab; label: string }[] = [
    { key: 'branches', label: 'Branches' },
    { key: 'weather', label: 'Météo' },
    { key: 'fuel', label: 'Carbu' },
    { key: 'wb', label: 'M&C' },
    { key: 'perf', label: 'Perf' },
    { key: 'dossier', label: 'Dossier' },
  ]
  ```

- [ ] **Step 3: Update `src/App.tsx`**

  Change `dossierTab` initial value to `'branches'`.

  Change new-dossier initialization:

  ```typescript
  const branchId = crypto.randomUUID()
  const dossier: FlightDossier = {
    id: crypto.randomUUID(),
    name: `${aircraft.name} ${now.toISOString().slice(0, 10)}`,
    date: now.toISOString().slice(0, 10),
    departureTime: '',
    aircraft: { ...aircraft, snapshotAt: now.toISOString() },
    branches: [{
      id: branchId,
      label: 'Aller',
      points: [],
      distanceNm: 0,
      notes: '',
    }],
    weatherInputs: { fields: {}, winds: [], notes: '' },
    fuelInputs: {
      [branchId]: {
        gsBase: aircraft.characteristics.regimes[0].speed,
        windAdjust: 0,
        roulage: 10,
        marge: 10,
        extras: [],
        reserveMin: 30,
        derouteMin: 30,
        plein: false,
      },
    },
    loading: Object.fromEntries(aircraft.massBalance.stations.map(s => [s.name, 0])),
    perfRegulatory: 1.0,
    perfInputs: {},
    notes: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  ```

  Remove `import { duplicateAircraft }` if unused (it's used elsewhere, keep it).

- [ ] **Step 4: Update `src/lib/storage.ts` — migration for old dossiers**

  In `loadDossierFromFile`, after parsing JSON, add migration:

  ```typescript
  // Migrate pre-branches dossiers
  if (!Array.isArray(data.branches)) {
    const branchId = crypto.randomUUID()
    data.branches = [{
      id: branchId,
      label: 'Aller',
      points: [],
      distanceNm: 0,
      notes: '',
    }]
    // Migrate fuelInputs: FuelInputs → Record<branchId, FuelInputs>
    if (data.fuelInputs && typeof data.fuelInputs.gsBase === 'number') {
      data.fuelInputs = { [branchId]: data.fuelInputs }
    }
  }
  // Remove legacy fields
  delete data.route
  delete data.navOverrides
  delete data.navNotes
  ```

- [ ] **Step 5: Create stub `src/features/branches/BranchesPanel.tsx`**

  ```tsx
  import type { FlightBranch } from '../../types'

  interface Props {
    branches: FlightBranch[]
    onUpdate: (branches: FlightBranch[]) => void
  }

  export function BranchesPanel({ branches }: Props) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-[var(--text-1)] mb-4">Branches</h2>
        <p className="text-[var(--text-muted)]">{branches.length} branche(s) — à implémenter (Task 5)</p>
      </div>
    )
  }
  ```

- [ ] **Step 6: Update `src/screens/DossierScreen.tsx`**

  Remove `RoutePanel`, `NavlogPanel` imports. Add `BranchesPanel`. Update dispatch for `branches`:

  ```tsx
  import { BranchesPanel } from '../features/branches/BranchesPanel'
  import { WeatherPanel } from '../features/weather/WeatherPanel'
  import { FuelPanel } from '../features/fuel/FuelPanel'
  import { WBPanel } from '../features/wb/WBPanel'
  import { PerfPanel } from '../features/perf/PerfPanel'
  import { DossierPanel } from '../features/dossier/DossierPanel'

  export function DossierScreen({ dossier, activeTab, onUpdate }: DossierScreenProps) {
    const now = () => new Date().toISOString()
    const update = (partial: Partial<FlightDossier>) =>
      onUpdate({ ...dossier, ...partial, updatedAt: now() })

    return (
      <div className="flex flex-col min-h-0 flex-1">
        {activeTab === 'branches' && (
          <BranchesPanel
            branches={dossier.branches}
            onUpdate={(branches) => update({ branches })}
          />
        )}
        {activeTab === 'weather' && (
          <WeatherPanel dossier={dossier} onUpdate={(weatherInputs) => update({ weatherInputs })} />
        )}
        {activeTab === 'fuel' && (
          <FuelPanel
            dossier={dossier}
            onUpdate={(fuelInputs) => update({ fuelInputs })}
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
          />
        )}
        {activeTab === 'dossier' && <DossierPanel dossier={dossier} />}
      </div>
    )
  }
  ```

  Note: `FuelPanel` signature changes — `onUpdate` now takes `Record<string, FuelInputs>`.

- [ ] **Step 7: Update `src/features/fuel/FuelPanel.tsx`** — remove navlog, use branch distance

  Replace the entire file:

  ```tsx
  import { useMemo } from 'react'
  import type { FlightDossier, FuelInputs, FuelExtra } from '../../types'
  import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
  import { Card } from '../../components/ui/Card'
  import { Input } from '../../components/ui/Input'
  import { Button } from '../../components/ui/Button'
  import { Badge } from '../../components/ui/Badge'

  interface Props {
    dossier: FlightDossier
    onUpdate: (fuelInputs: Record<string, FuelInputs>) => void
  }

  export function FuelPanel({ dossier, onUpdate }: Props) {
    const { branches, fuelInputs, aircraft } = dossier
    const regime = aircraft.characteristics.regimes[0]
    const fuelBurn = regime.fuelBurn
    const fuelCapacity = aircraft.characteristics.fuelCapacity
    const lastBranchId = branches.at(-1)?.id ?? ''

    const fmtTime = (min: number) => {
      const h = Math.floor(min / 60)
      const m = Math.round(min % 60)
      return `${h}h${String(m).padStart(2, '0')}`
    }

    const totalFuelL = useMemo(() => {
      return branches.reduce((sum, branch) => {
        const fi = fuelInputs[branch.id]
        if (!fi) return sum
        const gs = Math.max(fi.gsBase - fi.windAdjust, 1)
        const flightMin = branch.distanceNm > 0 ? (branch.distanceNm / gs) * 60 : 0
        const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)
        const isLast = branch.id === lastBranchId
        const reserveMin = isLast ? fi.reserveMin : 0
        const derouteMin = isLast ? fi.derouteMin : 0
        const totalMin = flightMin + fi.roulage + extrasMin + reserveMin + derouteMin
        const totalWithMargin = totalMin * (1 + fi.marge / 100)
        return sum + (totalWithMargin / 60) * fuelBurn
      }, 0)
    }, [branches, fuelInputs, fuelBurn, lastBranchId])

    // Display first branch by default (branch tabs added in Task 8)
    const activeBranchId = branches[0]?.id ?? ''
    const activeBranch = branches.find(b => b.id === activeBranchId)
    const fi: FuelInputs = fuelInputs[activeBranchId] ?? {
      gsBase: regime.speed, windAdjust: 0, roulage: 10, marge: 10,
      extras: [], reserveMin: 30, derouteMin: 30, plein: false,
    }

    const gs = Math.max(fi.gsBase - fi.windAdjust, 1)
    const flightMin = activeBranch && activeBranch.distanceNm > 0
      ? (activeBranch.distanceNm / gs) * 60 : 0
    const isLast = activeBranchId === lastBranchId
    const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)
    const totalMin = flightMin + fi.roulage + extrasMin +
      (isLast ? fi.reserveMin : 0) + (isLast ? fi.derouteMin : 0)
    const totalWithMargin = totalMin * (1 + fi.marge / 100)
    const fuelMinL = (totalWithMargin / 60) * fuelBurn
    const fuelMinKg = fuelMinL * FUEL_DENSITY_KGL
    const autonomyMin = (fuelCapacity / fuelBurn) * 60
    const insufficient = totalFuelL > fuelCapacity
    const tight = !insufficient && totalFuelL > fuelCapacity * 0.9
    const statusVariant = insufficient ? 'error' : tight ? 'warning' : 'success'
    const statusLabel = insufficient ? 'INSUFFISANT' : tight ? 'ATTENTION' : 'OK'

    const update = (partial: Partial<FuelInputs>) =>
      onUpdate({ ...fuelInputs, [activeBranchId]: { ...fi, ...partial } })

    const addExtra = () => update({ extras: [...fi.extras, { id: crypto.randomUUID(), label: '', durationMin: 15 }] })
    const removeExtra = (id: string) => update({ extras: fi.extras.filter(e => e.id !== id) })
    const updateExtra = (id: string, changes: Partial<FuelExtra>) =>
      update({ extras: fi.extras.map(e => e.id === id ? { ...e, ...changes } : e) })

    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Paramètres — {activeBranch?.label ?? ''}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Input label="GS de base (kt)" type="number" value={fi.gsBase}
                onChange={e => update({ gsBase: Number(e.target.value) })} />
              <Input label="Ajust vent (kt)" type="number" value={fi.windAdjust}
                onChange={e => update({ windAdjust: Number(e.target.value) })} />
              <Input label="Roulage (min)" type="number" value={fi.roulage}
                onChange={e => update({ roulage: Number(e.target.value) })} />
              <Input label="Marge (%)" type="number" value={fi.marge}
                onChange={e => update({ marge: Number(e.target.value) })} />
              {isLast && <>
                <Input label="Réserve (min)" type="number" value={fi.reserveMin}
                  onChange={e => update({ reserveMin: Number(e.target.value) })} />
                <Input label="Déroutement (min)" type="number" value={fi.derouteMin}
                  onChange={e => update({ derouteMin: Number(e.target.value) })} />
              </>}
            </div>
            <div>
              <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Phases supplémentaires</p>
              {fi.extras.map(extra => (
                <div key={extra.id} className="flex gap-2 items-center mb-2">
                  <input type="text" value={extra.label} placeholder="Évolutions, attente..."
                    onChange={e => updateExtra(extra.id, { label: e.target.value })}
                    className="flex-1 text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none" />
                  <input type="number" value={extra.durationMin}
                    onChange={e => updateExtra(extra.id, { durationMin: Number(e.target.value) })}
                    className="w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none" />
                  <span className="text-xs text-[var(--text-dim)]">min</span>
                  <button onClick={() => removeExtra(extra.id)}
                    className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm">✕</button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addExtra}>+ Ajouter phase</Button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={fi.plein}
                onChange={e => update({ plein: e.target.checked })}
                className="accent-[var(--amber)] w-4 h-4" />
              <span className="text-sm text-[var(--text-2)]">Plein complet prévu ({fuelCapacity} L)</span>
            </label>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Résultats</h2>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <Card padding="md" inset>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Dist. branche ({activeBranch?.label})</dt>
                  <dd className="font-mono text-[var(--text-1)]">{activeBranch?.distanceNm ?? 0} nm</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Temps vol branche</dt>
                  <dd className="font-mono text-[var(--text-1)]">{fmtTime(flightMin)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Total avec marge {fi.marge}%</dt>
                  <dd className="font-mono text-[var(--text-1)]">{fmtTime(totalWithMargin)}</dd>
                </div>
                <hr className="border-[var(--border)]" />
                <div className="flex justify-between font-semibold">
                  <dt className="text-[var(--text-muted)]">Carbu min (cette branche)</dt>
                  <dd className="font-mono text-[var(--text-1)]">
                    {fuelMinL.toFixed(1)} L <span className="text-[var(--text-dim)] ml-2">/ {fuelMinKg.toFixed(1)} kg</span>
                  </dd>
                </div>
                {branches.length > 1 && (
                  <div className="flex justify-between font-semibold border-t border-[var(--border)] pt-2">
                    <dt className="text-[var(--text-muted)]">Total toutes branches</dt>
                    <dd className="font-mono text-[var(--text-1)]">{totalFuelL.toFixed(1)} L</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Capacité</dt>
                  <dd className="font-mono text-[var(--text-2)]">{fuelCapacity} L</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Autonomie (plein)</dt>
                  <dd className="font-mono text-[var(--text-2)]">{fmtTime(autonomyMin)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Conso</dt>
                  <dd className="font-mono text-[var(--text-dim)]">{fuelBurn} L/h</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 8: Update `src/features/weather/WeatherPanel.tsx`** — temporary fix

  Replace the `aerodromes` / `uniqueAerodromes` derivation:

  ```typescript
  const uniqueAerodromes: string[] = [...new Set(
    dossier.branches.flatMap(b => b.points)
      .filter(p => p.type === 'AERODROME')
      .map(p => p.identifier)
  )]
  ```

  Remove the old `const aerodromes = route ? ...` lines.

- [ ] **Step 9: Update `src/features/perf/PerfPanel.tsx`** — temporary fix

  Replace the `depIcao`/`arrIcao` derivation and the hardcoded `TERRAINS` with a temporary empty list:

  ```typescript
  // Temporary: dynamic cards will be added in Task 7
  const terrainCards: { key: string; label: string; tableKey: 'to' | 'ldg' }[] = []
  dossier.branches.forEach(branch => {
    branch.points.forEach(pt => {
      if (pt.role === 'OVERFLY') return
      if (terrainCards.some(t => t.key === pt.identifier)) return
      terrainCards.push({
        key: pt.identifier,
        label: pt.identifier,
        tableKey: pt.role === 'DEP' ? 'to' : 'ldg',
      })
    })
  })
  ```

  Replace the `getWeatherFor` function:
  ```typescript
  const getWeatherFor = (icao: string) => {
    const field = weatherInputs.fields[icao]
    return { qnh: field?.qnh ?? 1013, temp: field?.temp ?? 15 }
  }
  ```

  Fix the `depWeight` computation — replace `aircraft.massBalance.maxWeight` (removed from schema) with:
  ```typescript
  const maxWeight = Math.max(...aircraft.massBalance.envelopePoints.map(([kg]) => kg))
  const depWeight = useMemo(() => {
    const wb = computeWB(aircraft.massBalance, loading)
    return Math.min(wb.totalWeight, maxWeight)
  }, [aircraft, loading, maxWeight])
  ```

  Update the map call:
  ```tsx
  {terrainCards.map(({ key, label, tableKey }) => {
    const weather = getWeatherFor(key)
    return (
      <TerrainCard
        key={key}
        terrainKey={key}
        label={label}
        tableKey={tableKey}
        ...
      />
    )
  })}
  ```

- [ ] **Step 10: Delete obsolete files**

  ```bash
  git rm src/features/navlog/NavlogPanel.tsx \
         src/lib/aviation/navlogGen.ts \
         src/__tests__/aviation/navlogGen.test.ts \
         src/features/route/RoutePanel.tsx \
         src/features/route/FlightplanImport.tsx \
         src/lib/flightplan/parser.ts \
         src/__tests__/flightplan/parser.test.ts
  ```

- [ ] **Step 11: TypeScript check + test suite**

  ```
  npx tsc --noEmit
  npx vitest run
  ```
  Expected: 0 TS errors, all remaining tests pass (navlog/parser tests are deleted).

- [ ] **Step 12: Commit**

  ```bash
  git add -A
  git commit -m "feat: FlightDossier → branches model, remove navlog, stub BranchesPanel"
  ```

---

## Task 5: BranchesPanel — full implementation

**Files:**
- Modify: `src/features/branches/BranchesPanel.tsx` (replace stub)

**Interfaces:**
- Consumes: `FlightBranch`, `FlightPoint`, `FlightPointRole` from `src/types/index.ts`; `getAerodromeDb`, `getAerodrome` from `src/lib/icao/aerodromeDb`
- Produces: `BranchesPanel` component (same props as stub)

- [ ] **Step 1: Implement `src/features/branches/BranchesPanel.tsx`**

  ```tsx
  import { useState, useMemo } from 'react'
  import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
  import L from 'leaflet'
  import iconUrl from 'leaflet/dist/images/marker-icon.png'
  import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
  import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
  import type { FlightBranch, FlightPoint, FlightPointRole } from '../../types'
  import { getAerodromeDb, getAerodrome } from '../../lib/icao/aerodromeDb'
  import { Button } from '../../components/ui/Button'
  import { Input } from '../../components/ui/Input'
  import { Card } from '../../components/ui/Card'
  import { Badge } from '../../components/ui/Badge'

  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
  L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

  const makeIcon = (color: string, size: number) => new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${size}" height="${size * 1.5}">` +
      `<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24S24 21 24 12C24 5.4 18.6 0 12 0z" fill="${color}"/>` +
      `<circle cx="12" cy="12" r="5" fill="white"/></svg>`
    ),
    iconSize: [size, size * 1.5], iconAnchor: [size / 2, size * 1.5], popupAnchor: [0, -size * 1.5],
  })

  const ROLE_ICONS: Record<FlightPointRole, L.Icon> = {
    DEP: makeIcon('#4d8df0', 24),
    ARR: makeIcon('#46c98a', 24),
    DIVERT: makeIcon('#f0a93b', 20),
    OVERFLY: makeIcon('#888888', 16),
  }

  const ROLE_LABELS: Record<FlightPointRole, string> = {
    DEP: 'DEP', ARR: 'ARR', DIVERT: 'DVRT', OVERFLY: 'OVFL',
  }

  const ROLE_COLORS: Record<FlightPointRole, string> = {
    DEP: 'var(--blue)', ARR: 'var(--green)', DIVERT: 'var(--amber)', OVERFLY: 'var(--text-dim)',
  }

  interface AddPointModalProps {
    onAdd: (point: Omit<FlightPoint, 'id'>) => void
    onClose: () => void
  }

  function AddPointModal({ onAdd, onClose }: AddPointModalProps) {
    const [query, setQuery] = useState('')
    const [role, setRole] = useState<FlightPointRole>('OVERFLY')
    const [unresolved, setUnresolved] = useState(false)
    const [identifier, setIdentifier] = useState('')

    const db = useMemo(() => getAerodromeDb(), [])
    const suggestions = useMemo(() => {
      if (query.length < 1) return []
      const q = query.toUpperCase()
      return db.filter(a =>
        a.icao.startsWith(q) || a.name.toUpperCase().includes(q)
      ).slice(0, 8)
    }, [query, db])

    const submit = (icao?: string) => {
      const id_val = icao ?? identifier.toUpperCase()
      if (!id_val) return
      onAdd({ type: 'AERODROME', identifier: id_val, role })
      onClose()
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Ajouter un point</h3>

          {/* Role selector */}
          <div className="flex gap-1 mb-3">
            {(['DEP', 'ARR', 'DIVERT', 'OVERFLY'] as FlightPointRole[]).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                  role === r ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                             : 'border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {!unresolved ? (
            <>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ICAO ou nom..."
                className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2"
              />
              {suggestions.map(a => (
                <button key={a.icao} onClick={() => submit(a.icao)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-inset)] rounded flex gap-2">
                  <span className="font-mono text-[var(--amber)]">{a.icao}</span>
                  <span className="text-[var(--text-2)] truncate">{a.name}</span>
                </button>
              ))}
              <button
                onClick={() => setUnresolved(true)}
                className="mt-2 text-xs text-[var(--text-dim)] underline"
              >
                Ajouter sans résolution (identifiant libre)
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                value={identifier}
                onChange={e => setIdentifier(e.target.value.toUpperCase())}
                placeholder="Identifiant (ex: LFXX, VOR, ...)"
                className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => submit()}>Ajouter</Button>
                <Button variant="ghost" size="sm" onClick={() => setUnresolved(false)}>Retour</Button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  interface BranchViewProps {
    branch: FlightBranch
    isOnly: boolean
    onChange: (branch: FlightBranch) => void
    onDelete: () => void
  }

  function BranchView({ branch, isOnly, onChange, onDelete }: BranchViewProps) {
    const [showAdd, setShowAdd] = useState(false)

    const resolved = useMemo(() =>
      branch.points.map(pt => ({
        pt,
        aero: pt.type === 'AERODROME' ? getAerodrome(pt.identifier) : undefined,
      }))
    , [branch.points])

    const mapPoints = resolved.filter(r => r.aero)
    const positions: [number, number][] = mapPoints.map(r => [r.aero!.lat, r.aero!.lng])
    const center: [number, number] = positions.length > 0
      ? [positions.reduce((s, p) => s + p[0], 0) / positions.length,
         positions.reduce((s, p) => s + p[1], 0) / positions.length]
      : [46.5, 2.5]

    const addPoint = (pt: Omit<FlightPoint, 'id'>) =>
      onChange({ ...branch, points: [...branch.points, { ...pt, id: crypto.randomUUID() }] })

    const removePoint = (id: string) =>
      onChange({ ...branch, points: branch.points.filter(p => p.id !== id) })

    const movePoint = (id: string, dir: -1 | 1) => {
      const idx = branch.points.findIndex(p => p.id === id)
      if (idx < 0) return
      const pts = [...branch.points]
      const swap = idx + dir
      if (swap < 0 || swap >= pts.length) return;
      [pts[idx], pts[swap]] = [pts[swap], pts[idx]]
      onChange({ ...branch, points: pts })
    }

    return (
      <div className="flex flex-col h-full">
        {/* Map */}
        <div className="h-48 flex-shrink-0">
          <MapContainer center={center} zoom={7} className="h-full w-full"
            style={{ backgroundColor: '#0e1217' }}>
            <TileLayer
              attribution='&copy; <a href="https://carto.com">CartoDB</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd" maxZoom={19}
            />
            {positions.length >= 2 && (
              <Polyline positions={positions} color="#f0a93b" weight={2} opacity={0.7} />
            )}
            {mapPoints.map(({ pt, aero }) => (
              <Marker key={pt.id} position={[aero!.lat, aero!.lng]} icon={ROLE_ICONS[pt.role]}>
                <Popup>{ROLE_LABELS[pt.role]} — {pt.identifier} — {aero!.name}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

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
            {!isOnly && (
              <Button variant="danger" size="sm" className="ml-auto" onClick={onDelete}>
                Supprimer branche
              </Button>
            )}
          </div>
        </div>

        {/* Points list */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Points</p>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>+ Ajouter</Button>
          </div>

          {branch.points.length === 0 && (
            <p className="text-[var(--text-muted)] text-sm text-center py-4">
              Aucun point — cliquez sur « + Ajouter »
            </p>
          )}

          {resolved.map(({ pt, aero }, idx) => (
            <Card key={pt.id} padding="sm" className="flex gap-3 items-center">
              <Badge
                variant="neutral"
                style={{ backgroundColor: ROLE_COLORS[pt.role], color: 'white', minWidth: '3rem', textAlign: 'center' }}
              >
                {ROLE_LABELS[pt.role]}
              </Badge>
              <span className="font-mono text-[var(--amber)] text-sm">{pt.identifier}</span>
              <span className="flex-1 text-sm text-[var(--text-2)] truncate">
                {aero ? aero.name : <span className="text-[var(--amber)]">? non résolu</span>}
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
            </Card>
          ))}

          {/* Notes */}
          <div className="mt-4">
            <label className="text-xs text-[var(--text-dim)] uppercase tracking-wider block mb-1">Notes</label>
            <textarea
              value={branch.notes}
              onChange={e => onChange({ ...branch, notes: e.target.value })}
              rows={3}
              placeholder="Commentaires libres sur ce tronçon..."
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none resize-none"
            />
          </div>
        </div>

        {showAdd && <AddPointModal onAdd={addPoint} onClose={() => setShowAdd(false)} />}
      </div>
    )
  }

  interface Props {
    branches: FlightBranch[]
    onUpdate: (branches: FlightBranch[]) => void
  }

  export function BranchesPanel({ branches, onUpdate }: Props) {
    const [activeId, setActiveId] = useState(() => branches[0]?.id ?? '')
    const activeBranch = branches.find(b => b.id === activeId) ?? branches[0]

    const addBranch = () => {
      const newBranch: FlightBranch = {
        id: crypto.randomUUID(),
        label: `Étape ${branches.length + 1}`,
        points: [],
        distanceNm: 0,
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

    const updateBranch = (branch: FlightBranch) => {
      onUpdate(branches.map(b => b.id === branch.id ? branch : b))
    }

    const [editingLabel, setEditingLabel] = useState<string | null>(null)

    return (
      <div className="flex flex-col h-full">
        {/* Branch tabs */}
        {(branches.length > 1 || true) && (
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] overflow-x-auto">
            {branches.map(b => (
              <div
                key={b.id}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-t text-sm cursor-pointer select-none transition-colors ${
                  b.id === activeId
                    ? 'bg-[var(--bg-card)] text-[var(--text-1)] border border-b-0 border-[var(--border)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-1)]'
                }`}
                onClick={() => setActiveId(b.id)}
              >
                {editingLabel === b.id ? (
                  <input
                    autoFocus
                    defaultValue={b.label}
                    className="w-20 bg-transparent border-b border-[var(--amber)] text-xs focus:outline-none"
                    onBlur={e => {
                      updateBranch({ ...b, label: e.target.value || b.label })
                      setEditingLabel(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingLabel(null)
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span onDoubleClick={() => setEditingLabel(b.id)}>{b.label}</span>
                )}
              </div>
            ))}
            <button
              onClick={addBranch}
              className="px-2 py-1 text-sm text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors"
            >+</button>
          </div>
        )}

        {activeBranch && (
          <BranchView
            branch={activeBranch}
            isOnly={branches.length === 1}
            onChange={updateBranch}
            onDelete={() => deleteBranch(activeBranch.id)}
          />
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```
  npx tsc --noEmit
  ```
  Expected: 0 errors.

- [ ] **Step 3: Manual smoke test**

  Start the app (`npm run dev`), open a dossier, navigate to the Branches tab. Verify:
  - Map renders
  - `+ Ajouter` modal opens, ICAO search works, point appears in list
  - ↑↓ reorder works
  - Double-click tab label to rename
  - `+` adds a new branch tab
  - Distance input updates

- [ ] **Step 4: Commit**

  ```bash
  git add src/features/branches/BranchesPanel.tsx
  git commit -m "feat: BranchesPanel — branch tabs, map, points list, add-point modal"
  ```

---

## Task 6: WeatherPanel — source ICAOs from branches

No new logic — the temporary fix in Task 4 is already correct. This task verifies it and adds the OVERFLY inclusion.

**Files:**
- Modify: `src/features/weather/WeatherPanel.tsx`

- [ ] **Step 1: Verify current implementation**

  Open the app, add aerodromes in the Branches tab (DEP, ARR, DIVERT, OVERFLY), then navigate to Météo. Confirm all unique ICAOs appear as weather fields.

  The code from Task 4 already does:
  ```typescript
  const uniqueAerodromes: string[] = [...new Set(
    dossier.branches.flatMap(b => b.points)
      .filter(p => p.type === 'AERODROME')
      .map(p => p.identifier)
  )]
  ```
  This is correct — all roles included, deduplicated. No change needed.

- [ ] **Step 2: Commit**

  ```bash
  git add src/features/weather/WeatherPanel.tsx
  git commit -m "feat: WeatherPanel reads ICAOs from branches"
  ```

---

## Task 7: PerfPanel — dynamic cards, elevation pre-fill, runway selector + wind component

**Files:**
- Modify: `src/lib/aviation/coordinates.ts`
- Create: `src/__tests__/aviation/headwind.test.ts`
- Modify: `src/features/perf/PerfPanel.tsx`

**Interfaces:**
- Produces:
  ```typescript
  // src/lib/aviation/coordinates.ts
  export function headwindKt(
    windDirTrue: number,
    windSpeedKt: number,
    runwayHeadingTrue: number
  ): number
  ```

- [ ] **Step 1: Write failing test**

  Create `src/__tests__/aviation/headwind.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { headwindKt } from '../../../src/lib/aviation/coordinates'

  describe('headwindKt', () => {
    it('full headwind when wind aligns with runway', () => {
      expect(headwindKt(270, 20, 270)).toBe(20)
    })
    it('full tailwind when wind is opposite', () => {
      expect(headwindKt(90, 20, 270)).toBe(-20)
    })
    it('zero component when wind is 90° off', () => {
      expect(headwindKt(0, 20, 270)).toBeCloseTo(0, 0)
    })
    it('partial headwind at 45°', () => {
      // cos(45°) ≈ 0.707
      expect(headwindKt(225, 20, 270)).toBeCloseTo(14, 0)
    })
    it('wraps correctly across 360°', () => {
      expect(headwindKt(350, 15, 10)).toBeCloseTo(14, 0)
    })
  })
  ```

- [ ] **Step 2: Run test — expect failure**

  ```
  npx vitest run src/__tests__/aviation/headwind.test.ts
  ```
  Expected: fails (function not found).

- [ ] **Step 3: Add `headwindKt` to `src/lib/aviation/coordinates.ts`**

  ```typescript
  /** Composante de vent face à une piste (kt). Positif = vent de face, négatif = vent de dos. */
  export function headwindKt(
    windDirTrue: number,
    windSpeedKt: number,
    runwayHeadingTrue: number,
  ): number {
    const angle = ((windDirTrue - runwayHeadingTrue) + 360) % 360
    return Math.round(windSpeedKt * Math.cos(angle * Math.PI / 180))
  }
  ```

- [ ] **Step 4: Run test — expect all pass**

  ```
  npx vitest run src/__tests__/aviation/headwind.test.ts
  ```
  Expected: 5 tests pass.

- [ ] **Step 5: Rewrite `src/features/perf/PerfPanel.tsx`**

  Replace the file entirely with the dynamic-card version:

  ```tsx
  import { useState, useMemo } from 'react'
  import type { FlightDossier, TerrainPerfInputs, PerfConditions, AircraftSnapshot } from '../../types'
  import { computePerf } from '../../lib/aviation/perfCalc'
  import { computeWB } from '../../lib/aviation/wbCalc'
  import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'
  import { headwindKt } from '../../lib/aviation/coordinates'
  import { getAerodrome } from '../../lib/icao/aerodromeDb'
  import { Card } from '../../components/ui/Card'
  import { Input } from '../../components/ui/Input'
  import { Badge } from '../../components/ui/Badge'

  const DEFAULT_PERF: TerrainPerfInputs = { surface: 'hard', windKt: 0, toda: undefined, lda: undefined }

  function pressureAlt(elevation: number, qnh: number): number {
    return elevation + (1013 - qnh) * 30
  }

  function densityAlt(pa: number, oat: number): number {
    const isa = 15 - 2 * (pa / 1000)
    return pa + (oat - isa) * 120
  }

  interface TerrainCardProps {
    terrainKey: string
    label: string
    tableKey: 'to' | 'ldg'
    aircraft: AircraftSnapshot
    weight: number
    defaultQnh: number
    defaultTemp: number
    defaultElevation: number
    perfInputs: TerrainPerfInputs
    perfRegulatory: number
    runways: Array<{ ident: string; headingTrue: number; toda?: number; lda?: number; surface: 'hard' | 'grass' }>
    surfaceWindDir: number
    surfaceWindKt: number
    onUpdate: (inputs: TerrainPerfInputs) => void
  }

  function TerrainCard({
    terrainKey, label, tableKey, aircraft, weight,
    defaultQnh, defaultTemp, defaultElevation,
    perfInputs, perfRegulatory, runways,
    surfaceWindDir, surfaceWindKt,
    onUpdate,
  }: TerrainCardProps) {
    const [elevation, setElevation] = useState(defaultElevation)
    const [qnh, setQnh] = useState(defaultQnh)
    const [temp, setTemp] = useState(defaultTemp)
    const [selectedRunway, setSelectedRunway] = useState<string>('')

    const inputs = { ...DEFAULT_PERF, ...perfInputs }
    const pa = pressureAlt(elevation, qnh)
    const da = densityAlt(pa, temp)
    const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable
    const tableValidation = useMemo(() => validatePerformanceTable(table), [table])
    const canCompute = tableValidation.errors.length === 0

    const cond: PerfConditions = {
      weight, pa, oat: temp,
      surfaceGrass: inputs.surface === 'grass',
      windKt: inputs.windKt,
    }
    const distBase = canCompute ? computePerf(table, cond) : 0
    const distRegulatory = canCompute ? Math.round(distBase * perfRegulatory) : 0
    const todaOk = inputs.toda === undefined || distRegulatory <= inputs.toda
    const ldaOk = inputs.lda === undefined || distRegulatory <= inputs.lda

    const update = (changes: Partial<TerrainPerfInputs>) => onUpdate({ ...inputs, ...changes })

    const handleRunwaySelect = (ident: string) => {
      setSelectedRunway(ident)
      const rwy = runways.find(r => r.ident === ident)
      if (!rwy) return
      const wkt = headwindKt(surfaceWindDir, surfaceWindKt, rwy.headingTrue)
      update({
        windKt: wkt,
        surface: rwy.surface,
        toda: rwy.toda,
        lda: rwy.lda,
      })
    }

    return (
      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {label}
          </h2>
          <div className="flex gap-2 flex-wrap justify-end">
            {tableValidation.errors.length > 0 && <Badge variant="error">Config invalide</Badge>}
            {tableValidation.errors.length === 0 && tableValidation.warnings.length > 0 && (
              <Badge variant="warning">⚠ config partielle</Badge>
            )}
            {inputs.toda !== undefined && canCompute && (
              <Badge variant={todaOk ? 'success' : 'error'}>{todaOk ? 'TODA OK' : 'TODA INSUFFISANT'}</Badge>
            )}
            {inputs.lda !== undefined && canCompute && (
              <Badge variant={ldaOk ? 'success' : 'error'}>{ldaOk ? 'LDA OK' : 'LDA INSUFFISANT'}</Badge>
            )}
          </div>
        </div>

        {tableValidation.errors.length > 0 && (
          <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-1">
            {tableValidation.errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        {/* Runway selector */}
        {runways.length > 0 && (
          <div className="mb-4">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide block mb-1">
              Piste active
            </label>
            <div className="flex gap-2 flex-wrap">
              {runways.map(rwy => (
                <button
                  key={rwy.ident}
                  type="button"
                  onClick={() => handleRunwaySelect(rwy.ident)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${
                    selectedRunway === rwy.ident
                      ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {rwy.ident} ({rwy.headingTrue}° — {headwindKt(surfaceWindDir, surfaceWindKt, rwy.headingTrue) >= 0 ? '+' : ''}{headwindKt(surfaceWindDir, surfaceWindKt, rwy.headingTrue)}kt)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Conditions</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Elév. (ft)" type="number"
                value={elevation === 0 ? '' : elevation} placeholder="0"
                onChange={e => setElevation(e.target.value === '' ? 0 : Number(e.target.value))} />
              <Input label="QNH (hPa)" type="number" value={qnh}
                onChange={e => setQnh(Number(e.target.value))} />
              <Input label="Temp (°C)" type="number" value={temp}
                onChange={e => setTemp(Number(e.target.value))} />
              <Input label="Vent (kt)" type="number"
                value={inputs.windKt === 0 ? '' : inputs.windKt} placeholder="0"
                hint="+face / −arrière"
                onChange={e => update({ windKt: e.target.value === '' ? 0 : Number(e.target.value) })} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Surface</label>
                <button type="button"
                  onClick={() => update({ surface: inputs.surface === 'hard' ? 'grass' : 'hard' })}
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
                onChange={e => update({ toda: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <Input label="LDA (m)" type="number" value={inputs.lda ?? ''} placeholder="optionnel"
                onChange={e => update({ lda: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-3">Résultats</p>
            {canCompute ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Altitude terrain</dt>
                  <dd className="font-mono text-[var(--text-1)]">{elevation} ft</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Alt pression</dt>
                  <dd className="font-mono text-[var(--text-1)]">{Math.round(pa)} ft</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Alt densité</dt>
                  <dd className="font-mono text-[var(--text-1)]">{Math.round(da)} ft</dd>
                </div>
                <div className="border-t border-[var(--border)] pt-2" />
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Distance calculée</dt>
                  <dd className="font-mono text-[var(--text-1)]">{distBase} m</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt className="text-[var(--text-muted)]">Dist. régl. (×{perfRegulatory.toFixed(2)})</dt>
                  <dd className="font-mono text-[var(--text-1)]">{distRegulatory} m</dd>
                </div>
                {inputs.toda !== undefined && (
                  <div className="flex justify-between text-xs">
                    <dt className="text-[var(--text-dim)]">TODA disponible</dt>
                    <dd className={`font-mono ${todaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{inputs.toda} m</dd>
                  </div>
                )}
                {inputs.lda !== undefined && (
                  <div className="flex justify-between text-xs">
                    <dt className="text-[var(--text-dim)]">LDA disponible</dt>
                    <dd className={`font-mono ${ldaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{inputs.lda} m</dd>
                  </div>
                )}
                <div className="flex justify-between text-xs text-[var(--text-dim)] border-t border-[var(--border)] pt-2">
                  <dt>Terrain</dt>
                  <dd className="font-mono">{terrainKey}</dd>
                </div>
                <div className="flex justify-between text-xs text-[var(--text-dim)]">
                  <dt>Type</dt>
                  <dd className="font-mono">{tableKey === 'to' ? 'Décollage' : 'Atterrissage'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-[var(--text-dim)] italic">Calcul indisponible — corriger la configuration.</p>
            )}
          </div>
        </div>
      </Card>
    )
  }

  interface Props {
    dossier: FlightDossier
    onUpdate: (perfInputs: Record<string, TerrainPerfInputs>) => void
    onUpdateRegulatory: (regulatory: number) => void
  }

  export function PerfPanel({ dossier, onUpdate, onUpdateRegulatory }: Props) {
    const { aircraft, loading, weatherInputs, perfInputs, branches, perfRegulatory } = dossier

    const maxWeight = Math.max(...aircraft.massBalance.envelopePoints.map(([kg]) => kg))
    const depWeight = useMemo(() => {
      const wb = computeWB(aircraft.massBalance, loading)
      return Math.min(wb.totalWeight, maxWeight)
    }, [aircraft, loading, maxWeight])

    // Aggregate unique terrain cards from all branches (OVERFLY excluded)
    const terrainCards = useMemo(() => {
      const seen = new Set<string>()
      const cards: { key: string; label: string; tableKey: 'to' | 'ldg' }[] = []
      branches.forEach(branch => {
        branch.points.forEach(pt => {
          if (pt.role === 'OVERFLY') return
          if (pt.type !== 'AERODROME') return
          if (seen.has(pt.identifier)) return
          seen.add(pt.identifier)
          cards.push({
            key: pt.identifier,
            label: pt.identifier,
            tableKey: pt.role === 'DEP' ? 'to' : 'ldg',
          })
        })
      })
      return cards
    }, [branches])

    // Surface wind: lowest altitude layer, or calm
    const surfaceWind = useMemo(() => {
      const sorted = [...weatherInputs.winds].sort((a, b) => a.altitude_ft - b.altitude_ft)
      return sorted[0] ?? { direction_deg: 0, speed_kt: 0 }
    }, [weatherInputs.winds])

    const getWeatherFor = (icao: string) => {
      const field = weatherInputs.fields[icao]
      return { qnh: field?.qnh ?? 1013, temp: field?.temp ?? 15 }
    }

    const handleUpdate = (key: string, inputs: TerrainPerfInputs) =>
      onUpdate({ ...perfInputs, [key]: inputs })

    return (
      <div className="p-4 max-w-4xl mx-auto space-y-6">
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

        {terrainCards.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center py-8">
            Ajoutez des aérodromes (DEP/ARR/DVRT) dans l'onglet Branches pour voir les fiches de performance.
          </p>
        )}

        {terrainCards.map(({ key, label, tableKey }) => {
          const weather = getWeatherFor(key)
          const aero = getAerodrome(key)
          return (
            <TerrainCard
              key={key}
              terrainKey={key}
              label={label}
              tableKey={tableKey}
              aircraft={aircraft}
              weight={depWeight}
              defaultQnh={weather.qnh}
              defaultTemp={weather.temp}
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
      </div>
    )
  }
  ```

- [ ] **Step 6: Run all tests**

  ```
  npx vitest run
  ```
  Expected: all pass including new headwind tests.

- [ ] **Step 7: Manual smoke test**

  Open the app. Add LFPN as DEP, LFGH as ARR. Navigate to Perf. Verify:
  - Two cards appear: one "DECOLLAGE" for LFPN, one "ATTERRISSAGE" for LFGH
  - If LFPN has runways in the DB (after OpenAIP refresh), runway selector appears
  - Selecting a runway updates windKt, TODA, LDA automatically
  - Perf computes correctly

- [ ] **Step 8: Commit**

  ```bash
  git add src/lib/aviation/coordinates.ts src/__tests__/aviation/headwind.test.ts src/features/perf/PerfPanel.tsx
  git commit -m "feat: PerfPanel dynamic cards, runway selector, headwindKt helper"
  ```

---

## Task 8: FuelPanel — per-branch tabs

This task adds branch-tab navigation to the FuelPanel. The core logic was implemented in Task 4; here we add the tab UI.

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx`

- [ ] **Step 1: Add branch tab state and tab bar to `FuelPanel.tsx`**

  In `FuelPanel`, replace the hardcoded `activeBranchId = branches[0]?.id` with stateful selection. Add a tab bar above the grid when there are multiple branches. The fuel display and `update` function already use `activeBranchId` — only the state source and UI change.

  ```tsx
  // Replace:
  const activeBranchId = branches[0]?.id ?? ''
  // With:
  const [activeBranchId, setActiveBranchId] = useState(() => branches[0]?.id ?? '')
  // Ensure activeBranchId is always valid when branches change:
  const validId = branches.some(b => b.id === activeBranchId) ? activeBranchId : (branches[0]?.id ?? '')
  ```

  Add tab bar above the grid (only rendered when `branches.length > 1`):
  ```tsx
  {branches.length > 1 && (
    <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
      {branches.map(b => (
        <button
          key={b.id}
          onClick={() => setActiveBranchId(b.id)}
          className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
            b.id === validId
              ? 'border-[var(--amber)] text-[var(--text-1)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-1)]'
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )}
  ```

  Update all references from `activeBranchId` to `validId` in the JSX below.

- [ ] **Step 2: TypeScript check**

  ```
  npx tsc --noEmit
  ```
  Expected: 0 errors.

- [ ] **Step 3: Manual smoke test**

  Add a second branch in the Branches tab. Navigate to Carbu. Verify:
  - Two tabs appear
  - Switching tabs shows different fuel inputs
  - Reserve/Déroutement fields only appear on the last branch tab
  - Total line shows sum of all branches when `branches.length > 1`

- [ ] **Step 4: Commit**

  ```bash
  git add src/features/fuel/FuelPanel.tsx
  git commit -m "feat: FuelPanel per-branch tabs, reserves on last branch"
  ```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `resources/aerodromes.json` seed file | Task 1 |
| `aerodromeDb` localStorage service (CRUD, export, import, init) | Task 1 |
| OpenAIP client with error handling | Task 2 |
| AerodromeScreen: list, edit, export, import, refresh from OpenAIP | Task 3 |
| OpenAIP API key stored in localStorage | Task 3 |
| Delete `database.ts` | Task 3 |
| `'aerodrome-db'` in `Screen` type | Task 3 |
| `FlightPoint`, `FlightBranch` types | Task 4 |
| `FlightDossier` migration (branches, fuelInputs as Record) | Task 4 |
| Remove navlog files and `DossierTab 'navlog'` | Task 4 |
| Migration of old dossiers in `loadDossierFromFile` | Task 4 |
| BranchesPanel: tabs, rename, add, delete branch | Task 5 |
| BranchesPanel: map with role-coloured markers | Task 5 |
| BranchesPanel: add-point modal with ICAO search | Task 5 |
| BranchesPanel: unresolved point (badge `?`) | Task 5 |
| BranchesPanel: reorder points ↑↓ | Task 5 |
| BranchesPanel: distance input per branch | Task 5 |
| BranchesPanel: notes per branch | Task 5 |
| WeatherPanel reads from branches (all roles incl. OVERFLY) | Task 6 |
| `headwindKt` function + tests | Task 7 |
| PerfPanel dynamic cards (DEP→TO, ARR/DIVERT→LDG) | Task 7 |
| PerfPanel elevation pre-filled from DB | Task 7 |
| PerfPanel runway selector → TODA/LDA/wind pre-fill | Task 7 |
| PerfPanel uses surface wind from lowest wind layer | Task 7 |
| PerfPanel fix: `maxWeight` derived from `envelopePoints` | Task 7 |
| FuelPanel per-branch distance from `branch.distanceNm` | Task 4 |
| FuelPanel reserves only on last branch | Task 4 |
| FuelPanel per-branch tab navigation | Task 8 |
| FuelPanel total fuel aggregation | Task 4 |

All spec requirements covered. ✓

### Placeholder scan

No TBD, TODO, or "similar to task N" patterns found.

### Type consistency

- `FlightBranch.points` — `FlightPoint[]` — consistent across Tasks 4, 5
- `fuelInputs: Record<string, FuelInputs>` — key is `branch.id` (string) — consistent across Tasks 4, 8
- `getAerodrome(icao: string): StoredAerodrome | undefined` — used in Tasks 5, 7 — consistent
- `headwindKt(windDirTrue, windSpeedKt, runwayHeadingTrue)` — defined Task 7 step 3, tested Task 7 step 1 — consistent

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-17-branches-flight-points.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session with checkpoints

Which approach?
