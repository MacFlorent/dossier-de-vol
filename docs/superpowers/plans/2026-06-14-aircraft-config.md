# Aircraft Config Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructurer le type `Aircraft` en 3 sous-objets, ajouter les régimes de croisière multiples, supprimer les champs inutiles, et ajouter des prévisualisations live dans l'éditeur avion.

**Architecture:** Refactoring type-first — `Aircraft` se divise en `characteristics`, `massBalance`, `performance`. Tous les consommateurs sont mis à jour. `AircraftEditorScreen` est réécrit avec un éditeur de régimes, un aperçu SVG de l'enveloppe, et un rendu tabulaire des tables de performances. `FUEL_DENSITY_KGL` devient une constante globale.

**Tech Stack:** TypeScript, React 18, Tailwind CSS, Vite (`npm run build`), Vitest (`npm test`)

---

> ⚠️ **Note sur les tâches 2–6 :** Le changement de types (tâche 2) casse le build jusqu'à la fin de la tâche 6. Ces 5 tâches forment un bloc atomique — ne pas committer avant la fin de la tâche 6.

---

### Task 1: Créer le fichier de constantes

**Files:**
- Create: `src/lib/aviation/constants.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// src/lib/aviation/constants.ts
export const FUEL_DENSITY_KGL = 0.72  // Avgas 100LL
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: Build réussi

- [ ] **Step 3: Committer**

```bash
git add src/lib/aviation/constants.ts
git commit -m "feat: add FUEL_DENSITY_KGL constant for Avgas 100LL"
```

---

### Task 2: Restructurer le type Aircraft

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Remplacer la section `// ── Avion` jusqu'à `AircraftSnapshot` inclus**

Remplacer ce bloc (lignes 1–56) par :

```typescript
// ── Avion ─────────────────────────────────────────────────────────────────────

export interface WeightStation {
  name: string
  arm: number        // mm depuis le datum
  maxWeight: number  // kg max pour cette station
}

export interface PerformanceTable {
  weights: number[]           // kg, triés croissant
  pressureAltitudes: number[] // ft, triés croissant
  oats: number[]              // °C, triés croissant
  values: number[][][]        // [weight_idx][pa_idx][oat_idx] = distance en mètres
  grassFactor?: number
  headwindFactor?: number
  tailwindFactor?: number
  slopeFactor?: number
}

export interface CruiseRegime {
  label: string    // ex: "75% puissance"
  ias: number      // kt — utilisé directement comme vitesse de croisière
  fuelBurn: number // L/h
}

export interface AircraftCharacteristics {
  regimes: CruiseRegime[]  // premier = régime par défaut du navlog
  fuelCapacity: number     // L utilisables
}

export interface AircraftMassBalance {
  emptyWeight: number
  emptyArm: number                    // mm depuis le datum
  maxWeight: number                   // kg MTOW
  stations: WeightStation[]
  envelopePoints: [number, number][]  // [kg, mm][]
}

export interface AircraftPerformance {
  toTable: PerformanceTable
  ldgTable: PerformanceTable
  factors: {
    regulatory: number
    grass: number
    headwindPerKt: number
    tailwindPerKt: number
  }
}

export interface Aircraft {
  id: string
  name: string
  registration: string
  sdReference?: string
  characteristics: AircraftCharacteristics
  massBalance: AircraftMassBalance
  performance: AircraftPerformance
}

export type AircraftSnapshot = Aircraft & { snapshotAt: string }
```

---

### Task 3: Mettre à jour navlogGen.ts

**Files:**
- Modify: `src/lib/aviation/navlogGen.ts`

- [ ] **Step 1: Remplacer le fichier entier**

```typescript
import type { ImportedRoute, WeatherInputs, NavlogEntry } from '../../types'
import { distanceNm, trueCourse, normAngle } from './coordinates'
import { solveWindTriangle, windAtAltitude } from './windTriangle'

export interface NavlogAircraftParams {
  ias: number       // kt — utilisé directement comme vitesse de croisière
  fuelBurn: number  // L/h
}

export interface NavlogOverride {
  gs?: number
  ete?: number
}

export function generateNavlog(
  route: ImportedRoute,
  weather: WeatherInputs,
  ac: NavlogAircraftParams,
  overrides: Record<number, NavlogOverride> = {},
): NavlogEntry[] {
  const wps = route.waypoints
  if (wps.length < 2) return []

  const entries: NavlogEntry[] = []
  let cumul_fuel_l = 0
  let cumul_time_min = 0

  for (let i = 0; i < wps.length - 1; i++) {
    const from = wps[i]
    const to = wps[i + 1]

    const dist_nm = Math.round(distanceNm(from.lat, from.lng, to.lat, to.lng) * 10) / 10
    const tc = Math.round(normAngle(trueCourse(from.lat, from.lng, to.lat, to.lng)))

    const wind = windAtAltitude(to.alt_ft, weather.winds)
    const { wca, gs: calcGs, th } = solveWindTriangle(tc, ac.ias, wind.direction_deg, wind.speed_kt)

    // Variation magnétique à 0 — sera injectée depuis FlightDossier dans une prochaine tâche
    const mh = Math.round(normAngle(th))

    let gs: number
    let ete_min: number
    let gsOverridden = false
    let eteOverridden = false

    const override = overrides[i]
    if (override?.gs !== undefined) {
      gs = override.gs
      ete_min = Math.round((dist_nm / gs * 60) * 10) / 10
      gsOverridden = true
    } else if (override?.ete !== undefined) {
      ete_min = override.ete
      gs = Math.round(dist_nm / ete_min * 60)
      eteOverridden = true
    } else {
      gs = calcGs
      ete_min = Math.round((dist_nm / gs * 60) * 10) / 10
    }

    const fuel_l = Math.round((ete_min / 60 * ac.fuelBurn) * 100) / 100

    cumul_fuel_l = Math.round((cumul_fuel_l + fuel_l) * 100) / 100
    cumul_time_min = Math.round((cumul_time_min + ete_min) * 10) / 10

    entries.push({
      legIndex: i,
      fromName: from.name,
      toName: to.name,
      tc,
      wca: Math.round(wca * 10) / 10,
      th: Math.round(normAngle(th)),
      mh,
      dist_nm,
      gs,
      ete_min,
      fuel_l,
      cumul_fuel_l,
      cumul_time_min,
      gsOverridden,
      eteOverridden,
    })
  }

  return entries
}
```

---

### Task 4: Mettre à jour wbCalc.ts

**Files:**
- Modify: `src/lib/aviation/wbCalc.ts`

`computeWB` prend maintenant `AircraftMassBalance` au lieu de `Aircraft` — les call sites passeront `aircraft.massBalance`.

- [ ] **Step 1: Remplacer le fichier entier**

```typescript
import type { AircraftMassBalance, StationLoading, WBResult } from '../../types'

export function computeWB(massBalance: AircraftMassBalance, loading: StationLoading): WBResult {
  let totalWeight = massBalance.emptyWeight
  let totalMoment = massBalance.emptyWeight * massBalance.emptyArm

  for (const station of massBalance.stations) {
    const w = loading[station.name] ?? 0
    totalWeight += w
    totalMoment += w * station.arm
  }

  const cg = totalWeight > 0 ? totalMoment / totalWeight : 0
  const inEnvelope = pointInPolygon(totalWeight, cg, massBalance.envelopePoints)

  return { totalWeight, totalMoment, cg, inEnvelope }
}

function pointInPolygon(w: number, cg: number, polygon: [number, number][]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [wi, cgi] = polygon[i]
    const [wj, cgj] = polygon[j]
    const intersect =
      cgi > cg !== cgj > cg && w < ((wj - wi) * (cg - cgi)) / (cgj - cgi) + wi
    if (intersect) inside = !inside
  }
  return inside
}
```

---

### Task 5: Mettre à jour le template DR221

**Files:**
- Modify: `src/lib/templates/dr221.ts`

- [ ] **Step 1: Remplacer le fichier entier**

```typescript
import type { Aircraft, PerformanceTable } from '../../types'

function computeDA(pa: number, oat: number): number {
  return pa + 120 * (oat - (15 - 2 * pa / 1000))
}

function weightFactor(w: number): number {
  return 1 + 0.02 * (w - 800) / 50
}

function buildTable(baseDist: number): PerformanceTable {
  const weights = [800, 900, 1000]
  const pressureAltitudes = [0, 1000, 2000, 3000, 4000, 6000]
  const oats = [-10, 0, 15, 30, 40]

  const values = weights.map(w =>
    pressureAltitudes.map(pa =>
      oats.map(oat => {
        const da = computeDA(pa, oat)
        const daFactor = 1 + 0.12 * Math.max(0, da) / 1000
        return Math.round(baseDist * daFactor * weightFactor(w))
      })
    )
  )

  return {
    weights,
    pressureAltitudes,
    oats,
    values,
    grassFactor: 1.20,
    headwindFactor: 0.025,
    tailwindFactor: 0.02,
    slopeFactor: 0.07,
  }
}

export const DR221_TEMPLATE: Aircraft = {
  id: 'template-dr221',
  name: 'DR221',
  registration: '',
  sdReference: '',

  characteristics: {
    regimes: [
      { label: '75% puissance', ias: 108, fuelBurn: 22 },
      { label: '65% puissance', ias: 100, fuelBurn: 20 },
    ],
    fuelCapacity: 116,
  },

  massBalance: {
    emptyWeight: 615,
    emptyArm: 345,
    maxWeight: 1000,
    stations: [
      { name: 'Pilote', arm: 375, maxWeight: 120 },
      { name: 'Passager', arm: 505, maxWeight: 100 },
      { name: 'Bagages', arm: 545, maxWeight: 30 },
      { name: 'Carburant', arm: 350, maxWeight: 84 },
    ],
    envelopePoints: [
      [615, 295],
      [615, 430],
      [880, 430],
      [1000, 425],
      [1000, 360],
      [880, 295],
    ],
  },

  performance: {
    toTable: buildTable(290),
    ldgTable: buildTable(480),
    factors: {
      regulatory: 1.15,
      grass: 1.20,
      headwindPerKt: 0.025,
      tailwindPerKt: 0.02,
    },
  },
}
```

---

### Task 6: Mettre à jour les panels consommateurs

**Files:**
- Modify: `src/features/navlog/NavlogPanel.tsx`
- Modify: `src/features/fuel/FuelPanel.tsx`
- Modify: `src/features/wb/WBPanel.tsx`
- Modify: `src/features/perf/PerfPanel.tsx`

Faire les 4 fichiers avant de vérifier le build.

- [ ] **Step 1: Remplacer NavlogPanel.tsx entier**

```tsx
import type { FlightDossier } from '../../types'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { Card } from '../../components/ui/Card'

interface Props {
  dossier: FlightDossier
  onUpdate: (partial: Partial<FlightDossier>) => void
}

export function NavlogPanel({ dossier, onUpdate }: Props) {
  const { route, weatherInputs, navOverrides, navNotes, aircraft } = dossier

  if (!route || route.waypoints.length < 2) {
    return <Card padding="md">Importer une route d'abord (onglet Route)</Card>
  }

  const regime = aircraft.characteristics.regimes[0]
  const ac = { ias: regime.ias, fuelBurn: regime.fuelBurn }
  const entries = generateNavlog(route, weatherInputs, ac, navOverrides)

  const totalDist = entries.reduce((s, e) => s + e.dist_nm, 0)
  const totalFuel = entries.at(-1)?.cumul_fuel_l ?? 0
  const totalTime = entries.at(-1)?.cumul_time_min ?? 0

  const fmtTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
  }

  const handleGsOverride = (legIndex: number, value: string) => {
    const gs = value === '' ? undefined : Number(value)
    const next = { ...navOverrides }
    if (gs === undefined) {
      const inner = { ...navOverrides[legIndex] }
      delete inner.gs
      if (inner.ete !== undefined) next[legIndex] = inner
      else delete next[legIndex]
    } else {
      next[legIndex] = { ...navOverrides[legIndex], gs }
    }
    onUpdate({ navOverrides: next })
  }

  const handleEteOverride = (legIndex: number, value: string) => {
    const ete = value === '' ? undefined : Number(value)
    const next = { ...navOverrides }
    if (ete === undefined) {
      const inner = { ...navOverrides[legIndex] }
      delete inner.ete
      if (inner.gs !== undefined) next[legIndex] = inner
      else delete next[legIndex]
    } else {
      next[legIndex] = { ...navOverrides[legIndex], ete }
    }
    onUpdate({ navOverrides: next })
  }

  const handleNote = (legIndex: number, value: string) => {
    onUpdate({ navNotes: { ...navNotes, [legIndex]: value } })
  }

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex items-center gap-4 mb-4 text-sm text-[var(--text-muted)]">
        <span>Régime : <span className="font-mono text-[var(--text-1)]">{regime.label}</span></span>
        <span>IAS : <span className="font-mono text-[var(--text-1)]">{regime.ias} kt</span></span>
        <span>Conso : <span className="font-mono text-[var(--text-1)]">{regime.fuelBurn} L/h</span></span>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-[var(--text-dim)] uppercase tracking-wider border-b border-[var(--border)]">
            <th className="text-left py-2 pr-3 font-medium">Balise</th>
            <th className="text-right py-2 px-2 font-medium">Alt ft</th>
            <th className="text-right py-2 px-2 font-medium">Cap °M</th>
            <th className="text-right py-2 px-2 font-medium">Dist nm</th>
            <th className="text-right py-2 px-2 font-medium">GS kt</th>
            <th className="text-right py-2 px-2 font-medium">ETE</th>
            <th className="text-right py-2 px-2 font-medium">Carbu L</th>
            <th className="text-right py-2 px-2 font-medium w-20">Réel</th>
            <th className="text-left py-2 pl-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const gsOv = navOverrides[entry.legIndex]?.gs
            const eteOv = navOverrides[entry.legIndex]?.ete
            return (
              <tr key={entry.legIndex} className="border-b border-[var(--border)] hover:bg-[var(--bg-card)]">
                <td className="py-2 pr-3">
                  <span className="font-mono text-[var(--text-1)]">{entry.fromName}</span>
                  <span className="text-[var(--text-dim)] mx-1">→</span>
                  <span className="font-mono text-[var(--amber)]">{entry.toName}</span>
                </td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-2)]">
                  {route.waypoints[entry.legIndex + 1]?.alt_ft ?? 0}
                </td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-1)]">{entry.mh}°</td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-1)]">{entry.dist_nm.toFixed(1)}</td>
                <td className="text-right py-2 px-2">
                  <input
                    type="number"
                    value={gsOv ?? ''}
                    placeholder={String(entry.gs)}
                    onChange={(e) => handleGsOverride(entry.legIndex, e.target.value)}
                    className={`w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border rounded px-1 py-0.5 focus:outline-none focus:border-[var(--amber)] ${gsOv !== undefined ? 'border-[var(--amber)] text-[var(--amber)]' : 'border-[var(--border)] text-[var(--text-1)]'}`}
                  />
                </td>
                <td className="text-right py-2 px-2">
                  <input
                    type="number"
                    value={eteOv ?? ''}
                    placeholder={fmtTime(entry.ete_min)}
                    onChange={(e) => handleEteOverride(entry.legIndex, e.target.value)}
                    className={`w-16 text-right font-mono text-sm bg-[var(--bg-inset)] border rounded px-1 py-0.5 focus:outline-none focus:border-[var(--blue)] ${eteOv !== undefined ? 'border-[var(--blue)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-1)]'}`}
                  />
                </td>
                <td className="text-right py-2 px-2 font-mono text-[var(--text-1)]">{entry.fuel_l.toFixed(1)}</td>
                <td className="text-right py-2 px-2 text-[var(--text-dim)] text-xs">____</td>
                <td className="py-2 pl-2">
                  <input
                    type="text"
                    value={navNotes[entry.legIndex] ?? ''}
                    onChange={(e) => handleNote(entry.legIndex, e.target.value)}
                    className="w-full text-xs bg-transparent border-b border-[var(--border)] text-[var(--text-2)] focus:outline-none focus:border-[var(--amber)] placeholder:text-[var(--text-dim)]"
                    placeholder="fréq, espace aérien..."
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border)] font-semibold text-[var(--text-1)]">
            <td className="py-2 pr-3 text-xs text-[var(--text-muted)] uppercase">Total</td>
            <td /><td />
            <td className="text-right py-2 px-2 font-mono">{totalDist.toFixed(1)}</td>
            <td />
            <td className="text-right py-2 px-2 font-mono">{fmtTime(totalTime)}</td>
            <td className="text-right py-2 px-2 font-mono">{totalFuel.toFixed(1)}</td>
            <td /><td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Mettre à jour FuelPanel.tsx**

Remplacer les lignes 1–23 (imports + début de FuelPanel) par :

```tsx
import { useMemo } from 'react'
import type { FlightDossier, FuelInputs, FuelExtra } from '../../types'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

interface Props {
  dossier: FlightDossier
  onUpdate: (fuelInputs: FuelInputs) => void
}

export function FuelPanel({ dossier, onUpdate }: Props) {
  const { fuelInputs, aircraft } = dossier
  const regime = aircraft.characteristics.regimes[0]
  const fuelBurn = regime.fuelBurn
  const fuelCapacity = aircraft.characteristics.fuelCapacity

  const flightMin = useMemo(() => {
    if (!dossier.route || dossier.route.waypoints.length < 2) return 0
    const ac = { ias: regime.ias, fuelBurn: regime.fuelBurn }
    const entries = generateNavlog(dossier.route, dossier.weatherInputs, ac, dossier.navOverrides)
    return entries.at(-1)?.cumul_time_min ?? 0
  }, [dossier.route, dossier.weatherInputs, dossier.navOverrides, regime])
```

Remplacer les 2 occurrences de `fuelDensity` dans le reste du fichier par `FUEL_DENSITY_KGL`.

- [ ] **Step 3: Mettre à jour WBPanel.tsx**

Ajouter l'import :
```tsx
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
```

Remplacer les lignes 132–139 (début de WBPanel) :
```tsx
  const { aircraft, loading } = dossier
  const { massBalance, characteristics } = aircraft
  const { stations, emptyWeight, envelopePoints } = massBalance
  const fuelCapacity = characteristics.fuelCapacity
```

Remplacer le bloc navlog ac (lignes 154–162) :
```tsx
  const navlogFuelL = useMemo(() => {
    if (!dossier.route || dossier.route.waypoints.length < 2) return 0
    const regime = aircraft.characteristics.regimes[0]
    const ac = { ias: regime.ias, fuelBurn: regime.fuelBurn }
    const entries = generateNavlog(dossier.route, dossier.weatherInputs, ac, dossier.navOverrides)
    return entries.at(-1)?.cumul_fuel_l ?? 0
  }, [dossier.route, dossier.weatherInputs, dossier.navOverrides, aircraft])
```

Remplacer :
- `fuelMassKg = fuelCapacity * fuelDensity` → `fuelMassKg = fuelCapacity * FUEL_DENSITY_KGL`
- `navlogFuelL * fuelDensity` → `navlogFuelL * FUEL_DENSITY_KGL`
- `computeWB(aircraft, depLoading)` → `computeWB(aircraft.massBalance, depLoading)`
- `computeWB(aircraft, arrLoading)` → `computeWB(aircraft.massBalance, arrLoading)`
- `aircraft.maxWeight` (3 occurrences) → `aircraft.massBalance.maxWeight`

- [ ] **Step 4: Mettre à jour PerfPanel.tsx**

Ajouter l'import :
```tsx
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
```

Dans `TerrainCard`, remplacer :
```tsx
  const table = tableKey === 'to' ? aircraft.toTable : aircraft.ldgTable
```
par :
```tsx
  const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable
```

Remplacer :
```tsx
  const distRegulatory = Math.round(distBase * aircraft.factors.regulatory)
```
par :
```tsx
  const distRegulatory = Math.round(distBase * aircraft.performance.factors.regulatory)
```

Dans le JSX :
```tsx
  Dist. réglementaire (×{aircraft.factors.regulatory})
```
→
```tsx
  Dist. réglementaire (×{aircraft.performance.factors.regulatory})
```

Dans `PerfPanel` (useMemo depWeight), remplacer :
```tsx
    const fuelStationName = aircraft.stations.find(s =>
      s.name.toLowerCase().includes('carburant')
    )?.name
    const fuelMassKg = aircraft.fuelCapacity * aircraft.fuelDensity
    const depLoading = { ...loading }
    if (fuelStationName) depLoading[fuelStationName] = fuelMassKg
    const wb = computeWB(aircraft, depLoading)
    return Math.min(wb.totalWeight, aircraft.maxWeight)
```
par :
```tsx
    const fuelStationName = aircraft.massBalance.stations.find(s =>
      s.name.toLowerCase().includes('carburant')
    )?.name
    const fuelMassKg = aircraft.characteristics.fuelCapacity * FUEL_DENSITY_KGL
    const depLoading = { ...loading }
    if (fuelStationName) depLoading[fuelStationName] = fuelMassKg
    const wb = computeWB(aircraft.massBalance, depLoading)
    return Math.min(wb.totalWeight, aircraft.massBalance.maxWeight)
```

- [ ] **Step 5: Vérifier le build — doit passer avant de committer**

Run: `npm run build`
Expected: Aucune erreur TypeScript, build complet

- [ ] **Step 6: Committer le bloc atomique (tâches 2–6)**

```bash
git add src/types/index.ts src/lib/aviation/navlogGen.ts src/lib/aviation/wbCalc.ts src/lib/templates/dr221.ts src/features/navlog/NavlogPanel.tsx src/features/fuel/FuelPanel.tsx src/features/wb/WBPanel.tsx src/features/perf/PerfPanel.tsx
git commit -m "refactor: restructure Aircraft type into characteristics/massBalance/performance sub-objects"
```

---

### Task 7: Mettre à jour les tests

**Files:**
- Modify: `src/__tests__/aviation/navlogGen.test.ts`
- Modify: `src/__tests__/aviation/wbCalc.test.ts`

- [ ] **Step 1: Remplacer navlogGen.test.ts entier**

```typescript
import { describe, it, expect } from 'vitest'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import type { NavlogAircraftParams } from '../../lib/aviation/navlogGen'
import type { ImportedRoute, WeatherInputs } from '../../types'

const ac: NavlogAircraftParams = { ias: 100, fuelBurn: 20 }

const calmsRoute: ImportedRoute = {
  waypoints: [
    { id: '1', name: 'DEP', type: 'Aerodrome', lat: 48.0, lng: 2.0, alt_ft: 0, notes: '' },
    { id: '2', name: 'WP1', type: 'ReportingPoint', lat: 49.0, lng: 2.0, alt_ft: 3000, notes: '' },
    { id: '3', name: 'ARR', type: 'Aerodrome', lat: 49.0, lng: 3.0, alt_ft: 0, notes: '' },
  ],
  sourceFile: 'test.flightplan',
}

const noWind: WeatherInputs = { fields: {}, winds: [], notes: '' }

describe('generateNavlog', () => {
  it('empty route returns []', () => {
    expect(generateNavlog({ waypoints: [], sourceFile: '' }, noWind, ac)).toEqual([])
  })

  it('single waypoint returns []', () => {
    expect(generateNavlog(
      { waypoints: [calmsRoute.waypoints[0]], sourceFile: '' },
      noWind,
      ac,
    )).toEqual([])
  })

  it('calm winds, two legs: generates 2 NavlogEntry objects', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    expect(result).toHaveLength(2)
    expect(result[0].legIndex).toBe(0)
    expect(result[1].legIndex).toBe(1)
  })

  it('first leg: calm wind → GS = IAS = 100', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    const leg0 = result[0]
    expect(leg0.fromName).toBe('DEP')
    expect(leg0.toName).toBe('WP1')
    expect(leg0.gs).toBe(100)
    expect(leg0.ete_min).toBeCloseTo(leg0.dist_nm / 100 * 60, 1)
    expect(leg0.fuel_l).toBeGreaterThan(0)
    expect(leg0.gsOverridden).toBe(false)
    expect(leg0.eteOverridden).toBe(false)
  })

  it('mh = th quand variation magnétique = 0', () => {
    const result = generateNavlog(calmsRoute, noWind, ac)
    const leg0 = result[0]
    expect(leg0.mh).toBe(Math.round(((leg0.th) % 360 + 360) % 360))
  })

  it('GS override: gs=80, gsOverridden=true, ete recalculé', () => {
    const result = generateNavlog(calmsRoute, noWind, ac, { 0: { gs: 80 } })
    const leg0 = result[0]
    expect(leg0.gs).toBe(80)
    expect(leg0.gsOverridden).toBe(true)
    expect(leg0.eteOverridden).toBe(false)
    expect(leg0.ete_min).toBeCloseTo(leg0.dist_nm / 80 * 60, 1)
  })

  it('ETE override: ete_min=30, eteOverridden=true', () => {
    const result = generateNavlog(calmsRoute, noWind, ac, { 0: { ete: 30 } })
    const leg0 = result[0]
    expect(leg0.ete_min).toBe(30)
    expect(leg0.eteOverridden).toBe(true)
    expect(leg0.gsOverridden).toBe(false)
  })

  it('cumul_fuel_l = somme des tronçons', () => {
    const [leg0, leg1] = generateNavlog(calmsRoute, noWind, ac)
    expect(leg1.cumul_fuel_l).toBeCloseTo(leg0.fuel_l + leg1.fuel_l, 2)
    expect(leg1.cumul_time_min).toBeCloseTo(leg0.ete_min + leg1.ete_min, 1)
  })

  it('vent de face réduit GS sous IAS', () => {
    const headwind: WeatherInputs = {
      fields: {},
      winds: [{ altitude_ft: 3000, direction_deg: 0, speed_kt: 20 }],
      notes: '',
    }
    expect(generateNavlog(calmsRoute, headwind, ac)[0].gs).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Remplacer wbCalc.test.ts entier**

```typescript
import { describe, it, expect } from 'vitest'
import { computeWB } from '../../lib/aviation/wbCalc'
import type { AircraftMassBalance } from '../../types'

const mb: AircraftMassBalance = {
  emptyWeight: 615,
  emptyArm: 345,
  maxWeight: 1000,
  stations: [
    { name: 'Pilote', arm: 375, maxWeight: 120 },
    { name: 'Passager', arm: 505, maxWeight: 100 },
    { name: 'Carburant', arm: 350, maxWeight: 84 },
  ],
  envelopePoints: [
    [615, 295], [615, 430], [880, 430], [1000, 425], [1000, 360], [880, 295],
  ] as [number, number][],
}

describe('computeWB', () => {
  it('avion vide : masse = emptyWeight, CG = emptyArm', () => {
    const result = computeWB(mb, {})
    expect(result.totalWeight).toBe(615)
    expect(result.totalMoment).toBe(615 * 345)
    expect(result.cg).toBe(345)
  })

  it('pilote seul : totalWeight et moment corrects', () => {
    const result = computeWB(mb, { Pilote: 75 })
    const w = 615 + 75
    const m = 615 * 345 + 75 * 375
    expect(result.totalWeight).toBe(w)
    expect(result.totalMoment).toBeCloseTo(m, 0)
    expect(result.cg).toBeCloseTo(m / w, 1)
  })

  it('avion vide dans l\'enveloppe', () => {
    expect(computeWB(mb, {}).inEnvelope).toBe(true)
  })

  it('chargement nominal dans l\'enveloppe', () => {
    expect(computeWB(mb, { Pilote: 75 }).inEnvelope).toBe(true)
  })

  it('cumule plusieurs stations', () => {
    const result = computeWB(mb, { Pilote: 75, Passager: 80, Carburant: 60 })
    const w = 615 + 75 + 80 + 60
    const m = 615 * 345 + 75 * 375 + 80 * 505 + 60 * 350
    expect(result.totalWeight).toBe(w)
    expect(result.totalMoment).toBeCloseTo(m, 0)
    expect(result.cg).toBeCloseTo(m / w, 1)
  })

  it('station inconnue ignorée', () => {
    expect(computeWB(mb, { StationInconnue: 100 }).totalWeight).toBe(615)
  })
})
```

- [ ] **Step 3: Lancer les tests**

Run: `npm test`
Expected: Tous les tests passent

- [ ] **Step 4: Committer**

```bash
git add src/__tests__/aviation/navlogGen.test.ts src/__tests__/aviation/wbCalc.test.ts
git commit -m "test: update navlogGen and wbCalc tests for restructured Aircraft type"
```

---

### Task 8: Réécrire AircraftEditorScreen

**Files:**
- Modify: `src/screens/AircraftEditorScreen.tsx`

Deux nouveaux composants locaux :
- `EnvelopePreview` — parse le JSON de l'enveloppe et affiche un SVG live
- `PerfTablePreview` — parse le JSON de table perf et affiche un tableau avec sélecteur OAT

- [ ] **Step 1: Remplacer le fichier entier**

```tsx
import { useState, useCallback, useEffect } from 'react'
import type { Aircraft, WeightStation, PerformanceTable, CruiseRegime } from '../types'
import { getAircraft, saveAircraft } from '../lib/storage'
import { TEMPLATES, createFromTemplate } from '../lib/templates'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'

interface Props {
  editingAircraftId: string | null
  onSave: () => void
  onCancel: () => void
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
      {children}
    </h2>
  )
}

// ── EnvelopePreview ───────────────────────────────────────────────────────────

function EnvelopePreview({ json }: { json: string }) {
  let points: [number, number][] = []
  try { points = JSON.parse(json) } catch { return null }
  if (points.length < 3) return null

  const width = 300, height = 180, pad = 30
  const cgs = points.map(p => p[1])
  const weights = points.map(p => p[0])
  const minCg = Math.min(...cgs), maxCg = Math.max(...cgs)
  const minW = Math.min(...weights), maxW = Math.max(...weights)
  const cgRange = maxCg - minCg || 1
  const wRange = maxW - minW || 1

  const sx = (cg: number) => pad + ((cg - minCg) / cgRange) * (width - 2 * pad)
  const sy = (w: number) => height - pad - ((w - minW) / wRange) * (height - 2 * pad)
  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${sx(p[1]).toFixed(1)} ${sy(p[0]).toFixed(1)}`
  ).join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xs mt-2 border border-[var(--border)] rounded">
      <path d={d} fill="color-mix(in srgb, var(--amber) 12%, transparent)" stroke="var(--amber)" strokeWidth="1.5" />
      <text x={pad} y={height - 4} fontSize="8" fill="var(--text-dim)">{minCg} mm</text>
      <text x={width - pad - 24} y={height - 4} fontSize="8" fill="var(--text-dim)">{maxCg} mm</text>
      <text x={2} y={pad + 4} fontSize="8" fill="var(--text-dim)">{maxW} kg</text>
      <text x={2} y={height - pad} fontSize="8" fill="var(--text-dim)">{minW} kg</text>
    </svg>
  )
}

// ── PerfTablePreview ──────────────────────────────────────────────────────────

function PerfTablePreview({ json }: { json: string }) {
  const [oatIdx, setOatIdx] = useState(0)

  let table: PerformanceTable | null = null
  try {
    const parsed = JSON.parse(json)
    if (parsed?.weights && parsed?.pressureAltitudes && parsed?.oats && parsed?.values) {
      table = parsed as PerformanceTable
    }
  } catch { /* JSON invalide, on ne rend rien */ }

  if (!table) return null

  const safeIdx = Math.min(oatIdx, table.oats.length - 1)

  return (
    <div className="mt-2 overflow-x-auto">
      <div className="flex gap-1 mb-2 flex-wrap">
        {table.oats.map((oat, i) => (
          <button
            key={i}
            onClick={() => setOatIdx(i)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              i === safeIdx
                ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                : 'border-[var(--border)] text-[var(--text-dim)]'
            }`}
          >
            {oat}°C
          </button>
        ))}
      </div>
      <table className="text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-right pr-4 pb-1 text-[var(--text-dim)] font-normal">PA (ft)</th>
            {table.weights.map(w => (
              <th key={w} className="text-right px-3 pb-1 text-[var(--text-dim)] font-normal">{w} kg</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.pressureAltitudes.map((pa, pi) => (
            <tr key={pa} className="border-t border-[var(--border)]">
              <td className="text-right pr-4 py-1 text-[var(--text-muted)]">{pa}</td>
              {table!.weights.map((_, wi) => (
                <td key={wi} className="text-right px-3 py-1 text-[var(--text-1)]">
                  {table!.values[wi]?.[pi]?.[safeIdx] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── AircraftEditorScreen ──────────────────────────────────────────────────────

export function AircraftEditorScreen({ editingAircraftId, onSave, onCancel }: Props) {
  const isNew = editingAircraftId === null

  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [sdReference, setSdReference] = useState('')

  const [regimes, setRegimes] = useState<CruiseRegime[]>([{ label: '75% puissance', ias: 100, fuelBurn: 20 }])
  const [fuelCapacity, setFuelCapacity] = useState(116)

  const [emptyWeight, setEmptyWeight] = useState(615)
  const [emptyArm, setEmptyArm] = useState(345)
  const [maxWeight, setMaxWeight] = useState(1000)
  const [stations, setStations] = useState<WeightStation[]>([])
  const [envelopeJson, setEnvelopeJson] = useState('[]')

  const [regulatory, setRegulatory] = useState(1.15)
  const [grass, setGrass] = useState(1.20)
  const [headwindPerKt, setHeadwindPerKt] = useState(0.025)
  const [tailwindPerKt, setTailwindPerKt] = useState(0.02)
  const [toTableJson, setToTableJson] = useState('{}')
  const [ldgTableJson, setLdgTableJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const applyAircraft = useCallback((ac: Aircraft) => {
    setName(ac.name)
    setRegistration(ac.registration)
    setSdReference(ac.sdReference ?? '')
    setRegimes(ac.characteristics.regimes.map(r => ({ ...r })))
    setFuelCapacity(ac.characteristics.fuelCapacity)
    setEmptyWeight(ac.massBalance.emptyWeight)
    setEmptyArm(ac.massBalance.emptyArm)
    setMaxWeight(ac.massBalance.maxWeight)
    setStations(ac.massBalance.stations.map(s => ({ ...s })))
    setRegulatory(ac.performance.factors.regulatory)
    setGrass(ac.performance.factors.grass)
    setHeadwindPerKt(ac.performance.factors.headwindPerKt)
    setTailwindPerKt(ac.performance.factors.tailwindPerKt)
    setEnvelopeJson(JSON.stringify(ac.massBalance.envelopePoints, null, 2))
    setToTableJson(JSON.stringify(ac.performance.toTable, null, 2))
    setLdgTableJson(JSON.stringify(ac.performance.ldgTable, null, 2))
  }, [])

  useEffect(() => {
    if (editingAircraftId) {
      const ac = getAircraft(editingAircraftId)
      if (ac) applyAircraft(ac)
    }
  }, [editingAircraftId, applyAircraft])

  const handleTemplateSelect = useCallback((key: string) => {
    const ac = createFromTemplate(key, crypto.randomUUID())
    if (ac) applyAircraft(ac)
  }, [applyAircraft])

  const handleSave = useCallback(() => {
    setJsonError(null)
    let envelopePoints: [number, number][]
    let toTable: PerformanceTable
    let ldgTable: PerformanceTable
    try {
      envelopePoints = JSON.parse(envelopeJson)
      toTable = JSON.parse(toTableJson)
      ldgTable = JSON.parse(ldgTableJson)
    } catch {
      setJsonError('JSON invalide dans les champs avancés')
      return
    }

    const aircraft: Aircraft = {
      id: editingAircraftId ?? crypto.randomUUID(),
      name,
      registration,
      sdReference: sdReference || undefined,
      characteristics: { regimes, fuelCapacity },
      massBalance: { emptyWeight, emptyArm, maxWeight, stations, envelopePoints },
      performance: {
        toTable,
        ldgTable,
        factors: { regulatory, grass, headwindPerKt, tailwindPerKt },
      },
    }
    saveAircraft(aircraft)
    onSave()
  }, [
    editingAircraftId,
    name, registration, sdReference,
    regimes, fuelCapacity,
    emptyWeight, emptyArm, maxWeight, stations, envelopeJson,
    regulatory, grass, headwindPerKt, tailwindPerKt, toTableJson, ldgTableJson,
    onSave,
  ])

  const addRegime = useCallback(() => {
    setRegimes(prev => [...prev, { label: '', ias: 100, fuelBurn: 20 }])
  }, [])

  const removeRegime = useCallback((idx: number) => {
    setRegimes(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateRegime = useCallback((idx: number, field: keyof CruiseRegime, value: string | number) => {
    setRegimes(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }, [])

  const addStation = useCallback(() => {
    setStations(prev => [...prev, { name: '', arm: 0, maxWeight: 0 }])
  }, [])

  const removeStation = useCallback((idx: number) => {
    setStations(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateStation = useCallback((idx: number, field: keyof WeightStation, value: string | number) => {
    setStations(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }, [])

  return (
    <div className="min-h-full p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">
          {isNew ? 'Nouvel avion' : 'Modifier l\'avion'}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {isNew ? 'Configurez un nouvel avion' : `Édition : ${name || registration || editingAircraftId}`}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {isNew && (
          <Card padding="md">
            <SectionTitle>Modèle de départ</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <Button key={t.key} variant="secondary" size="sm" onClick={() => handleTemplateSelect(t.key)}>
                  Depuis modèle : {t.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-2">
              Pré-remplit tous les champs — modifiez ensuite l'immatriculation et le nom.
            </p>
          </Card>
        )}

        {/* Informations générales */}
        <Card padding="md">
          <SectionTitle>Informations générales</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Nom" value={name} onChange={e => setName(e.target.value)} placeholder="DR221" />
            <Input label="Immatriculation" value={registration}
              onChange={e => setRegistration(e.target.value.toUpperCase())} placeholder="F-BPCT" />
            <Input label="Référence SkyDemon (optionnel)" value={sdReference}
              onChange={e => setSdReference(e.target.value)} placeholder="DR221" />
          </div>
        </Card>

        {/* Caractéristiques */}
        <Card padding="md">
          <SectionTitle>Caractéristiques</SectionTitle>

          {regimes.length === 0 ? (
            <p className="text-xs text-[var(--text-dim)] mb-2">Aucun régime — cliquez + pour en ajouter.</p>
          ) : (
            <div className="overflow-x-auto mb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--text-dim)] text-left">
                    <th className="pb-1 pr-3 font-medium">Label</th>
                    <th className="pb-1 pr-3 font-medium">IAS (kt)</th>
                    <th className="pb-1 pr-3 font-medium">Conso (L/h)</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {regimes.map((r, idx) => (
                    <tr key={idx} className="border-t border-[var(--border)]">
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 px-2 py-1 rounded text-xs text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={r.label}
                            onChange={e => updateRegime(idx, 'label', e.target.value)}
                            placeholder="75% puissance"
                          />
                          {idx === 0 && (
                            <span className="text-xs text-[var(--amber)] whitespace-nowrap">défaut</span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input type="number"
                          className="w-20 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                          value={r.ias}
                          onChange={e => updateRegime(idx, 'ias', Number(e.target.value))}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input type="number"
                          className="w-20 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                          value={r.fuelBurn}
                          onChange={e => updateRegime(idx, 'fuelBurn', Number(e.target.value))}
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          className="text-[var(--text-dim)] hover:text-[var(--red)] text-xs px-1 disabled:opacity-30"
                          onClick={() => removeRegime(idx)}
                          disabled={regimes.length === 1}
                          title="Supprimer ce régime"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={addRegime}>+ Ajouter régime</Button>

          <div className="mt-4 max-w-xs">
            <Input
              label="Capacité carburant (L)"
              type="number"
              value={fuelCapacity}
              onChange={e => setFuelCapacity(Number(e.target.value))}
            />
          </div>
        </Card>

        {/* Masse & centrage */}
        <Card padding="md">
          <SectionTitle>Masse &amp; centrage</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <Input label="Masse à vide (kg)" type="number" value={emptyWeight}
              onChange={e => setEmptyWeight(Number(e.target.value))} />
            <Input label="Bras à vide (mm)" type="number" value={emptyArm}
              onChange={e => setEmptyArm(Number(e.target.value))} />
            <Input label="MTOM (kg)" type="number" value={maxWeight}
              onChange={e => setMaxWeight(Number(e.target.value))} />
          </div>

          <div className="mb-4">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Stations de chargement
            </p>
            {stations.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)] mb-2">Aucune station.</p>
            ) : (
              <div className="overflow-x-auto mb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--text-dim)] text-left">
                      <th className="pb-1 pr-3 font-medium">Nom</th>
                      <th className="pb-1 pr-3 font-medium">Bras (mm)</th>
                      <th className="pb-1 pr-3 font-medium">Poids max (kg)</th>
                      <th className="pb-1 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stations.map((s, idx) => (
                      <tr key={idx} className="border-t border-[var(--border)]">
                        <td className="py-1.5 pr-3">
                          <input
                            className="w-full px-2 py-1 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.name}
                            onChange={e => updateStation(idx, 'name', e.target.value)}
                            placeholder="Pilote"
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input type="number"
                            className="w-24 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.arm}
                            onChange={e => updateStation(idx, 'arm', Number(e.target.value))}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input type="number"
                            className="w-24 px-2 py-1 rounded text-xs font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
                            value={s.maxWeight}
                            onChange={e => updateStation(idx, 'maxWeight', Number(e.target.value))}
                          />
                        </td>
                        <td className="py-1.5">
                          <button
                            className="text-[var(--text-dim)] hover:text-[var(--red)] text-xs px-1"
                            onClick={() => removeStation(idx)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={addStation}>+ Ajouter station</Button>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Points d'enveloppe [[kg, mm], ...]
            </label>
            <textarea
              className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
              rows={6}
              value={envelopeJson}
              onChange={e => setEnvelopeJson(e.target.value)}
              spellCheck={false}
            />
            <EnvelopePreview json={envelopeJson} />
          </div>
        </Card>

        {/* Performances */}
        <Card padding="md">
          <SectionTitle>Performances</SectionTitle>

          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Facteurs réglementaires</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Input label="Réglementaire (×)" type="number" step="0.01" value={regulatory}
              onChange={e => setRegulatory(Number(e.target.value))} />
            <Input label="Herbe (×)" type="number" step="0.01" value={grass}
              onChange={e => setGrass(Number(e.target.value))} />
            <Input label="Vent de face (%/kt)" type="number" step="0.005" value={headwindPerKt}
              onChange={e => setHeadwindPerKt(Number(e.target.value))} />
            <Input label="Vent arrière (%/kt)" type="number" step="0.005" value={tailwindPerKt}
              onChange={e => setTailwindPerKt(Number(e.target.value))} />
          </div>

          <div className="flex flex-col gap-1 mb-6">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Table décollage (toTable — JSON)
            </label>
            <textarea
              className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
              rows={6}
              value={toTableJson}
              onChange={e => setToTableJson(e.target.value)}
              spellCheck={false}
            />
            <PerfTablePreview json={toTableJson} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Table atterrissage (ldgTable — JSON)
            </label>
            <textarea
              className="w-full px-3 py-2 rounded text-xs text-[var(--text-1)] font-mono bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-y"
              rows={6}
              value={ldgTableJson}
              onChange={e => setLdgTableJson(e.target.value)}
              spellCheck={false}
            />
            <PerfTablePreview json={ldgTableJson} />
          </div>

          {jsonError && (
            <div className="mt-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs">
              {jsonError}
            </div>
          )}
        </Card>

        <div className="flex gap-3 justify-end pb-8">
          <Button variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button variant="primary" onClick={handleSave}>Sauvegarder</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: Aucune erreur TypeScript

- [ ] **Step 3: Lancer les tests**

Run: `npm test`
Expected: Tous les tests passent

- [ ] **Step 4: Committer**

```bash
git add src/screens/AircraftEditorScreen.tsx
git commit -m "feat: rewrite aircraft editor — regime list, envelope SVG preview, perf table preview"
```
