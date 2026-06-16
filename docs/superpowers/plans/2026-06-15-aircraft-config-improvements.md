# Aircraft Config Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the aircraft configuration sheet to support fuel stations in litres, remove `maxWeight`, and model real-world performance manuals (DR221 quadratic correction, DR400 ISA-delta temperatures + tabulated wind, Cessna multi-weight interpolation) with JSON validation.

**Architecture:** Type changes cascade from `src/types/index.ts` outward: `wbCalc.ts` → `WBPanel`, `perfCalc.ts` → `PerfPanel`, `AircraftEditorScreen`. TDD for all logic; UI tasks verified by running `npm test` (TypeScript + vitest). No existing stored aircraft data to migrate.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Vitest (`npm test`)

**Spec:** `docs/superpowers/specs/2026-06-15-aircraft-config-improvements-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | WeightStation kind, PerformanceTable extensions, remove factors/slopeFactor |
| `src/lib/aviation/wbCalc.ts` | Modify | L→kg conversion for fuel stations |
| `src/__tests__/aviation/wbCalc.test.ts` | Modify | Update fixtures + add fuel tests |
| `src/features/wb/WBPanel.tsx` | Modify | Fuel inputs in L, remove name hack |
| `src/screens/AircraftEditorScreen.tsx` | Modify | Station kind selector, remove factors section, perf validation UI |
| `src/lib/templates/dr221.ts` | Modify | Remove maxWeight/slopeFactor/factors |
| `src/lib/aviation/perfTableValidation.ts` | Create | Validate PerformanceTable JSON |
| `src/__tests__/aviation/perfTableValidation.test.ts` | Create | 1 test per error/warning rule |
| `src/lib/aviation/perfCalc.ts` | Modify | ISA delta, quadratic, grassValues, windCorrections |
| `src/__tests__/aviation/perfCalc.test.ts` | Modify | Remove slope tests, add new extension tests |
| `src/features/perf/PerfPanel.tsx` | Modify | Fix PA/DA bug, perfRegulatory, remove slope, validation warnings |
| `src/App.tsx` | Modify | Add perfRegulatory: 1.0 to new dossier creation |

---

### Task 1: Type Changes

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update `WeightStation`** — remove `maxWeight`, add `kind`

In `src/types/index.ts`, replace:
```typescript
export interface WeightStation {
  name: string
  arm: number        // mm depuis le datum
  maxWeight: number  // kg max pour cette station
}
```
With:
```typescript
export interface WeightStation {
  name: string
  arm: number   // mm depuis le datum
  kind: 'dry' | 'fuel'
}
```

- [ ] **Step 2: Update `PerformanceTable`** — add optional fields, remove `slopeFactor`

Replace:
```typescript
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
```
With:
```typescript
export interface PerformanceTable {
  weights: number[]           // kg, triés croissant
  pressureAltitudes: number[] // ft, triés croissant
  oats: number[]              // °C absolus ou écart ISA, triés croissant
  oatAxis?: 'absolute' | 'isa_delta'  // défaut 'absolute'
  values: number[][][]        // [weight_idx][pa_idx][oat_idx] = distance en mètres
  grassValues?: number[][][]  // table herbe (mêmes dimensions) — prioritaire sur grassFactor
  grassFactor?: number
  weightCorrection?: 'interpolate' | 'quadratic'  // défaut 'interpolate'
  referenceWeight?: number    // requis si quadratic
  weightCorrectionDivisor?: number  // défaut = referenceWeight
  windCorrections?: Array<{ speedKt: number; factor: number }>
  headwindFactor?: number
  tailwindFactor?: number
}
```

- [ ] **Step 3: Update `AircraftPerformance`** — remove `factors`

Replace:
```typescript
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
```
With:
```typescript
export interface AircraftPerformance {
  toTable: PerformanceTable
  ldgTable: PerformanceTable
}
```

- [ ] **Step 4: Update `PerfConditions`** — remove `slopePercent`

Replace:
```typescript
export interface PerfConditions {
  weight: number       // kg
  pa: number           // ft
  oat: number          // °C
  surfaceGrass: boolean
  windKt: number       // positif = face, négatif = arrière
  slopePercent: number // positif = montante (TO) ou descendante (LDG)
}
```
With:
```typescript
export interface PerfConditions {
  weight: number    // kg
  pa: number        // ft pression
  oat: number       // °C
  surfaceGrass: boolean
  windKt: number    // positif = face, négatif = arrière
}
```

- [ ] **Step 5: Update `TerrainPerfInputs`** — remove `slope`

Replace:
```typescript
export interface TerrainPerfInputs {
  surface: 'hard' | 'grass'
  slope: number      // % positif = montée (pour TO) / descente (pour LDG)
  windKt: number     // kt positif = vent de face
  toda?: number      // m TODA disponible (optionnel, pour validation)
  lda?: number       // m LDA disponible (optionnel, pour validation)
}
```
With:
```typescript
export interface TerrainPerfInputs {
  surface: 'hard' | 'grass'
  windKt: number    // kt positif = face, négatif = arrière
  toda?: number     // m disponible (optionnel, pour validation)
  lda?: number      // m disponible (optionnel, pour validation)
}
```

- [ ] **Step 6: Update `StationLoading` comment and add `perfRegulatory` to `FlightDossier`**

Replace:
```typescript
export type StationLoading = Record<string, number>  // stationName → kg
```
With:
```typescript
// stationName → kg (dry stations) ou L (fuel stations, converti en kg par computeWB)
export type StationLoading = Record<string, number>
```

In `FlightDossier`, add `perfRegulatory` after `loading`:
```typescript
  loading: StationLoading         // masses par station
  perfRegulatory: number          // facteur marge réglementaire (ex. 1.15 clubs Alcyons)
  perfInputs: Record<string, TerrainPerfInputs>  // clé = ICAO terrain
```

- [ ] **Step 7: Verify TypeScript compilation**

Run: `npm test`

Expected: TypeScript errors in files that reference removed fields (`factors`, `slopePercent`, `slope`, `maxWeight`). These are the files we'll fix in subsequent tasks. The type file itself should compile cleanly.

The errors are expected — they show what needs changing: `AircraftEditorScreen.tsx`, `WBPanel.tsx`, `PerfPanel.tsx`, `dr221.ts`, test files.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: update Aircraft types — WeightStation.kind, PerformanceTable extensions, remove factors/slope"
```

---

### Task 2: wbCalc — Fuel Station L→kg Conversion (TDD)

**Files:**
- Modify: `src/__tests__/aviation/wbCalc.test.ts`
- Modify: `src/lib/aviation/wbCalc.ts`

- [ ] **Step 1: Update fixture in test file**

In `src/__tests__/aviation/wbCalc.test.ts`, replace the `massBalance` fixture:
```typescript
const massBalance: AircraftMassBalance = {
  emptyWeight: 615,
  emptyArm: 345,
  maxWeight: 1000,
  stations: [
    { name: 'Pilote', arm: 375, kind: 'dry' as const },
    { name: 'Passager', arm: 505, kind: 'dry' as const },
    { name: 'Carburant', arm: 350, kind: 'fuel' as const },
  ],
  envelopePoints: [
    [615, 295], [615, 430], [880, 430], [1000, 425], [1000, 360], [880, 295],
  ] as [number, number][],
}
```

- [ ] **Step 2: Update existing test that used Carburant as kg**

The `accumulates multiple station weights` test passed `Carburant: 60` as 60 kg. Now 60 means 60 L = 43.2 kg (× 0.72). Update expected values:

```typescript
it('accumulates multiple station weights', () => {
  // Carburant is fuel: 60 L × 0.72 kg/L = 43.2 kg
  const result = computeWB(massBalance, { Pilote: 75, Passager: 80, Carburant: 60 })
  const expectedWeight = 615 + 75 + 80 + 43.2
  const expectedMoment = 615 * 345 + 75 * 375 + 80 * 505 + 43.2 * 350
  expect(result.totalWeight).toBeCloseTo(expectedWeight, 1)
  expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
  expect(result.cg).toBeCloseTo(expectedMoment / expectedWeight, 1)
})
```

- [ ] **Step 3: Add new fuel-specific tests** at the end of the `describe` block:

```typescript
it('fuel station: converts litres to kg using default density (0.72)', () => {
  // 50 L × 0.72 = 36 kg
  const result = computeWB(massBalance, { Carburant: 50 })
  const expectedWeight = 615 + 36
  const expectedMoment = 615 * 345 + 36 * 350
  expect(result.totalWeight).toBeCloseTo(expectedWeight, 1)
  expect(result.totalMoment).toBeCloseTo(expectedMoment, 0)
})

it('dry station: uses kg directly', () => {
  const result = computeWB(massBalance, { Pilote: 80 })
  expect(result.totalWeight).toBeCloseTo(615 + 80, 1)
})

it('custom fuelDensity is applied to fuel stations', () => {
  // density 0.80 kg/L: 50 L → 40 kg
  const result = computeWB(massBalance, { Carburant: 50 }, 0.80)
  expect(result.totalWeight).toBeCloseTo(615 + 40, 1)
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- wbCalc`

Expected: FAIL — `computeWB` signature mismatch and `maxWeight` type error.

- [ ] **Step 5: Update `wbCalc.ts` implementation**

Replace the entire `src/lib/aviation/wbCalc.ts`:
```typescript
import type { AircraftMassBalance, StationLoading, WBResult } from '../../types'
import { FUEL_DENSITY_KGL } from './constants'

export function computeWB(
  massBalance: AircraftMassBalance,
  loading: StationLoading,
  fuelDensity = FUEL_DENSITY_KGL,
): WBResult {
  let totalWeight = massBalance.emptyWeight
  let totalMoment = massBalance.emptyWeight * massBalance.emptyArm

  for (const station of massBalance.stations) {
    const raw = loading[station.name] ?? 0
    const w = station.kind === 'fuel' ? raw * fuelDensity : raw
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

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- wbCalc`

Expected: PASS all 8 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/aviation/wbCalc.ts src/__tests__/aviation/wbCalc.test.ts
git commit -m "feat: wbCalc converts fuel stations from L to kg using fuelDensity param"
```

---

### Task 3: WBPanel — Fuel Inputs in Litres

**Files:**
- Modify: `src/features/wb/WBPanel.tsx`

- [ ] **Step 1: Replace the fuel station detection hack and fuel logic**

The current code identifies the fuel station by name (`name.includes('carburant')`), hardcodes departure fuel to full capacity, and treats loading values as always kg.

The new logic:
- `fuelStations = stations.filter(s => s.kind === 'fuel')`
- User inputs L directly (stored in `loading` via `onUpdate`)
- Arrival fuel per station = `max(0, depL - navlogFuelL × proportion)`
- `computeWB` now takes `fuelDensity` and converts internally

Replace the entire `src/features/wb/WBPanel.tsx`:

```typescript
import { useMemo } from 'react'
import type { FlightDossier, StationLoading, WBResult } from '../../types'
import { computeWB } from '../../lib/aviation/wbCalc'
import { generateNavlog } from '../../lib/aviation/navlogGen'
import { FUEL_DENSITY_KGL } from '../../lib/aviation/constants'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

interface Props {
  dossier: FlightDossier
  onUpdate: (loading: StationLoading) => void
}

// ── SVG Envelope ─────────────────────────────────────────────────────────────

function EnvelopeSVG({
  points,
  departure,
  arrival,
}: {
  points: [number, number][]
  departure: { weight: number; cg: number } | null
  arrival: { weight: number; cg: number } | null
}) {
  if (points.length < 3) {
    return (
      <p className="text-xs text-[var(--text-dim)]">Enveloppe non définie</p>
    )
  }

  const width = 300
  const height = 200
  const pad = 30

  const cgs = points.map(p => p[1])
  const weights = points.map(p => p[0])
  const minCg = Math.min(...cgs)
  const maxCg = Math.max(...cgs)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)

  const cgRange = maxCg - minCg || 1
  const wRange = maxW - minW || 1

  const scaleX = (cg: number) =>
    pad + ((cg - minCg) / cgRange) * (width - 2 * pad)
  const scaleY = (w: number) =>
    height - pad - ((w - minW) / wRange) * (height - 2 * pad)

  const pathD =
    points
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${scaleX(p[1]).toFixed(1)} ${scaleY(p[0]).toFixed(1)}`
      )
      .join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xs">
      <path
        d={pathD}
        fill="color-mix(in srgb, var(--amber) 12%, transparent)"
        stroke="var(--amber)"
        strokeWidth="1.5"
      />
      {departure && (
        <circle
          cx={scaleX(departure.cg).toFixed(1)}
          cy={scaleY(departure.weight).toFixed(1)}
          r="5"
          fill="var(--blue)"
          opacity="0.9"
        />
      )}
      {arrival && (
        <circle
          cx={scaleX(arrival.cg).toFixed(1)}
          cy={scaleY(arrival.weight).toFixed(1)}
          r="5"
          fill="var(--green)"
          opacity="0.9"
        />
      )}
      <circle cx={pad} cy={height - 10} r="4" fill="var(--blue)" />
      <text x={pad + 8} y={height - 7} fontSize="9" fill="var(--text-dim)">Départ</text>
      <circle cx={pad + 55} cy={height - 10} r="4" fill="var(--green)" />
      <text x={pad + 63} y={height - 7} fontSize="9" fill="var(--text-dim)">Arrivée</text>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKg(v: number) { return v.toFixed(1) + ' kg' }
function fmtCg(v: number) { return v.toFixed(0) + ' mm' }

function wbStatus(dep: WBResult, arr: WBResult) {
  if (!dep.inEnvelope || !arr.inEnvelope)
    return { variant: 'error' as const, label: 'HORS LIMITE' }
  return { variant: 'success' as const, label: 'OK' }
}

// Distributes navlog fuel burn across fuel stations proportionally to departure load
function arrivalFuelLoading(
  fuelStationNames: string[],
  loading: StationLoading,
  navlogFuelL: number,
): StationLoading {
  const totalDepL = fuelStationNames.reduce((s, name) => s + (loading[name] ?? 0), 0)
  const totalArrL = Math.max(0, totalDepL - navlogFuelL)
  const ratio = totalDepL > 0 ? totalArrL / totalDepL : 0
  const result: StationLoading = {}
  for (const name of fuelStationNames) {
    result[name] = (loading[name] ?? 0) * ratio
  }
  return result
}

// ── Main component ────────────────────────────────────────────────────────────

export function WBPanel({ dossier, onUpdate }: Props) {
  const { aircraft, loading } = dossier
  const { massBalance, characteristics } = aircraft
  const { stations, emptyWeight, envelopePoints } = massBalance

  const fuelStations = stations.filter(s => s.kind === 'fuel')
  const dryStations = stations.filter(s => s.kind === 'dry')
  const fuelStationNames = fuelStations.map(s => s.name)

  const navlogFuelL = useMemo(() => {
    if (!dossier.route || dossier.route.waypoints.length < 2) return 0
    const regime = aircraft.characteristics.regimes[0]
    const ac = { ias: regime.ias, fuelBurn: regime.fuelBurn }
    const entries = generateNavlog(dossier.route, dossier.weatherInputs, ac, dossier.navOverrides)
    return entries.at(-1)?.cumul_fuel_l ?? 0
  }, [dossier.route, dossier.weatherInputs, dossier.navOverrides, aircraft])

  const arrLoading = useMemo(
    () => arrivalFuelLoading(fuelStationNames, loading, navlogFuelL),
    [fuelStationNames, loading, navlogFuelL],
  )

  const depResult = useMemo(
    () => computeWB(massBalance, loading),
    [massBalance, loading],
  )

  const arrResult = useMemo(() => {
    const merged = { ...loading, ...arrLoading }
    return computeWB(massBalance, merged)
  }, [massBalance, loading, arrLoading])

  const status = wbStatus(depResult, arrResult)

  const handleChange = (name: string, value: string) => {
    const v = value === '' ? 0 : Math.max(0, Number(value))
    onUpdate({ ...loading, [name]: v })
  }

  const dryTotal = dryStations.reduce((s, st) => s + (loading[st.name] ?? 0), 0)

  const totalDepFuelL = fuelStationNames.reduce((s, n) => s + (loading[n] ?? 0), 0)
  const totalDepFuelKg = totalDepFuelL * FUEL_DENSITY_KGL
  const totalArrFuelL = fuelStationNames.reduce((s, n) => s + (arrLoading[n] ?? 0), 0)
  const totalArrFuelKg = totalArrFuelL * FUEL_DENSITY_KGL

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: station inputs */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Chargement
          </h2>

          <Card padding="sm" inset>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2">Station</th>
                  <th className="text-right pb-2">Masse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                <tr>
                  <td className="py-2 text-[var(--text-muted)]">Avion vide</td>
                  <td className="py-2 text-right font-mono text-[var(--text-dim)]">{emptyWeight} kg</td>
                </tr>

                {/* Dry stations */}
                {dryStations.map(st => {
                  const val = loading[st.name] ?? 0
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5 text-[var(--text-2)]">{st.name}</td>
                      <td className="py-1.5 pl-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            value={val === 0 ? '' : val}
                            placeholder="0"
                            onChange={e => handleChange(st.name, e.target.value)}
                            className="w-20 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                          />
                          <span className="text-xs text-[var(--text-dim)]">kg</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {/* Fuel stations */}
                {fuelStations.map(st => {
                  const depL = loading[st.name] ?? 0
                  const depKg = depL * FUEL_DENSITY_KGL
                  const arrL = arrLoading[st.name] ?? 0
                  const arrKg = arrL * FUEL_DENSITY_KGL
                  return (
                    <tr key={st.name}>
                      <td className="py-1.5">
                        <div className="text-[var(--text-2)]">{st.name}</div>
                        <div className="text-xs text-[var(--text-dim)] mt-0.5">
                          Cap. {characteristics.fuelCapacity} L
                        </div>
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <input
                            type="number"
                            min={0}
                            max={characteristics.fuelCapacity}
                            value={depL === 0 ? '' : depL}
                            placeholder="0"
                            onChange={e => handleChange(st.name, e.target.value)}
                            className="w-20 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                          />
                          <span className="text-xs text-[var(--text-dim)]">L dep</span>
                        </div>
                        <div className="text-right text-xs text-[var(--text-dim)] font-mono">
                          {depKg.toFixed(1)} kg → {arrKg.toFixed(1)} kg arr
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

                {fuelStationNames.length > 0 && (
                  <tr className="font-medium">
                    <td className="pt-1 text-[var(--text-muted)]">Carburant départ / arrivée</td>
                    <td className="pt-1 text-right font-mono text-[var(--text-1)] text-xs">
                      {totalDepFuelKg.toFixed(1)} / {totalArrFuelKg.toFixed(1)} kg
                    </td>
                  </tr>
                )}

                {fuelStationNames.length === 0 && (
                  <tr>
                    <td colSpan={2} className="pt-2 text-xs text-[var(--amber)]">
                      Aucune station carburant — centrage arrivée = centrage départ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Right: results + SVG */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Résultats M&amp;C
            </h2>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          <Card padding="sm" inset>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-dim)] uppercase">
                  <th className="text-left pb-2" />
                  <th className="text-right pb-2">Masse</th>
                  <th className="text-right pb-2 pl-3">CG</th>
                  <th className="text-right pb-2 pl-3">Env.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                <tr>
                  <td className="py-2 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--blue)' }} />
                    <span className="text-[var(--text-2)]">Départ</span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)]">{fmtKg(depResult.totalWeight)}</td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">{fmtCg(depResult.cg)}</td>
                  <td className="py-2 text-right pl-3">
                    {depResult.inEnvelope ? <Badge variant="success">OK</Badge> : <Badge variant="error">HORS</Badge>}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--green)' }} />
                    <span className="text-[var(--text-2)]">Arrivée</span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)]">{fmtKg(arrResult.totalWeight)}</td>
                  <td className="py-2 text-right font-mono text-[var(--text-1)] pl-3">{fmtCg(arrResult.cg)}</td>
                  <td className="py-2 text-right pl-3">
                    {arrResult.inEnvelope ? <Badge variant="success">OK</Badge> : <Badge variant="error">HORS</Badge>}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-xs text-[var(--text-dim)]">
                    MTOW : {aircraft.massBalance.maxWeight} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <Card padding="sm">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Enveloppe de centrage</p>
            <EnvelopeSVG
              points={envelopePoints}
              departure={{ weight: depResult.totalWeight, cg: depResult.cg }}
              arrival={{ weight: arrResult.totalWeight, cg: arrResult.cg }}
            />
          </Card>

          {depResult.totalWeight > aircraft.massBalance.maxWeight && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Masse départ ({fmtKg(depResult.totalWeight)}) dépasse le MTOW ({aircraft.massBalance.maxWeight} kg)
              </p>
            </Card>
          )}
          {arrResult.totalWeight > aircraft.massBalance.maxWeight && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Masse arrivée ({fmtKg(arrResult.totalWeight)}) dépasse le MTOW ({aircraft.massBalance.maxWeight} kg)
              </p>
            </Card>
          )}
          {(!depResult.inEnvelope || !arrResult.inEnvelope) && (
            <Card padding="sm">
              <p className="text-[var(--red)] text-sm font-medium">
                Centrage hors de l&apos;enveloppe — revoir la répartition des charges.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: wbCalc tests still pass; TypeScript errors reduced (WBPanel now compiles). Remaining errors in AircraftEditorScreen, PerfPanel, dr221.ts, perfCalc.test.ts.

- [ ] **Step 3: Commit**

```bash
git add src/features/wb/WBPanel.tsx
git commit -m "feat: WBPanel — fuel stations editable in L, remove name-based detection hack"
```

---

### Task 4: AircraftEditorScreen — Stations (kind) + Remove Factors

**Files:**
- Modify: `src/screens/AircraftEditorScreen.tsx`

- [ ] **Step 1: Remove factor state, update station state and `applyAircraft`**

Remove these four state lines (around line 134–137):
```typescript
const [regulatory, setRegulatory] = useState(1.15)
const [grass, setGrass] = useState(1.20)
const [headwindPerKt, setHeadwindPerKt] = useState(0.025)
const [tailwindPerKt, setTailwindPerKt] = useState(0.02)
```

In `applyAircraft`, remove the four lines:
```typescript
setRegulatory(ac.performance.factors.regulatory)
setGrass(ac.performance.factors.grass)
setHeadwindPerKt(ac.performance.factors.headwindPerKt)
setTailwindPerKt(ac.performance.factors.tailwindPerKt)
```

In `applyAircraft`, the stations line stays but the type is now correct (no maxWeight).

- [ ] **Step 2: Update `addStation` default**

Replace:
```typescript
setStations(prev => [...prev, { name: '', arm: 0, maxWeight: 0 }])
```
With:
```typescript
setStations(prev => [...prev, { name: '', arm: 0, kind: 'dry' as const }])
```

- [ ] **Step 3: Update `updateStation` type**

Replace:
```typescript
const updateStation = useCallback((idx: number, field: keyof WeightStation, value: string | number) => {
  setStations(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
}, [])
```
With:
```typescript
const updateStation = useCallback((idx: number, field: keyof WeightStation, value: string | number) => {
  setStations(prev => prev.map((s, i) => {
    if (i !== idx) return s
    if (field === 'kind') return { ...s, kind: value as 'dry' | 'fuel' }
    if (field === 'arm') return { ...s, arm: Number(value) }
    return { ...s, [field]: value }
  }))
}, [])
```

- [ ] **Step 4: Update `handleSave` — remove factors from AircraftPerformance**

Replace the `performance` object in `handleSave`:
```typescript
performance: {
  toTable,
  ldgTable,
  factors: { regulatory, grass, headwindPerKt, tailwindPerKt },
},
```
With:
```typescript
performance: { toTable, ldgTable },
```

Also remove `regulatory, grass, headwindPerKt, tailwindPerKt` from the `useCallback` dependency array.

- [ ] **Step 5: Update the stations table UI** — replace "Poids max" column with "Type" dropdown

Replace the station table header:
```typescript
<tr className="text-xs text-[var(--text-dim)] text-left">
  <th className="pb-1 pr-3 font-medium">Nom</th>
  <th className="pb-1 pr-3 font-medium">Bras (mm)</th>
  <th className="pb-1 pr-3 font-medium">Poids max (kg)</th>
  <th className="pb-1 font-medium"></th>
</tr>
```
With:
```typescript
<tr className="text-xs text-[var(--text-dim)] text-left">
  <th className="pb-1 pr-3 font-medium">Nom</th>
  <th className="pb-1 pr-3 font-medium">Bras (mm)</th>
  <th className="pb-1 pr-3 font-medium">Type</th>
  <th className="pb-1 font-medium"></th>
</tr>
```

Replace the "Poids max" cell in the station row (the `<td>` containing the maxWeight input):
```typescript
<td className="py-1.5 pr-3">
  <select
    className="px-2 py-1 rounded text-xs text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)]"
    value={s.kind}
    onChange={e => updateStation(idx, 'kind', e.target.value)}
  >
    <option value="dry">Sec (kg)</option>
    <option value="fuel">Carburant (L)</option>
  </select>
</td>
```

- [ ] **Step 6: Remove the "Facteurs réglementaires" section from the Performances Card**

Remove the entire block:
```typescript
<p className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">Facteurs réglementaires</p>
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
  <Input label="Réglementaire (×)" ... />
  <Input label="Herbe (×)" ... />
  <Input label="Vent de face (%/kt)" ... />
  <Input label="Vent arrière (%/kt)" ... />
</div>
```

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: TypeScript errors should now only remain in `dr221.ts` and the perf-related files. AircraftEditorScreen should compile cleanly.

- [ ] **Step 8: Commit**

```bash
git add src/screens/AircraftEditorScreen.tsx
git commit -m "feat: AircraftEditorScreen — station kind selector, remove factors section"
```

---

### Task 5: DR221 Template Update

**Files:**
- Modify: `src/lib/templates/dr221.ts`

- [ ] **Step 1: Update stations and remove factors**

Replace the entire `src/lib/templates/dr221.ts`:

```typescript
import type { Aircraft, PerformanceTable } from '../../types'

function buildTable(baseDist: number): PerformanceTable {
  const weights = [800, 900, 1000]
  const pressureAltitudes = [0, 1000, 2000, 3000, 4000, 6000]
  const oats = [-10, 0, 15, 30, 40]

  const values = weights.map(w =>
    pressureAltitudes.map(pa =>
      oats.map(oat => {
        const isa = 15 - 2 * pa / 1000
        const da = pa + (oat - isa) * 120
        const daFactor = 1 + 0.12 * Math.max(0, da) / 1000
        const wFactor = 1 + 0.02 * (w - 800) / 50
        return Math.round(baseDist * daFactor * wFactor)
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
      { name: 'Pilote', arm: 375, kind: 'dry' },
      { name: 'Passager', arm: 505, kind: 'dry' },
      { name: 'Bagages', arm: 545, kind: 'dry' },
      { name: 'Carburant', arm: 350, kind: 'fuel' },
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
  },
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: `dr221.ts` now compiles. Remaining errors: `PerfPanel.tsx` (uses removed `factors.regulatory` and `slopePercent`), `perfCalc.test.ts` (uses removed `slopeFactor`/`slopePercent`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/templates/dr221.ts
git commit -m "fix: DR221 template — station kind, remove factors and slopeFactor"
```

---

### Task 6: Performance Table Validation (TDD)

**Files:**
- Create: `src/lib/aviation/perfTableValidation.ts`
- Create: `src/__tests__/aviation/perfTableValidation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/aviation/perfTableValidation.test.ts`:

```typescript
import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'

// Minimal valid table reused across tests
const validTable = {
  weights: [800],
  pressureAltitudes: [0, 1000],
  oats: [0, 15],
  values: [[[200, 220], [240, 260]]],
}

describe('validatePerformanceTable — valid table', () => {
  it('returns no errors and no warnings for a valid minimal table', () => {
    const result = validatePerformanceTable(validTable)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

describe('validatePerformanceTable — errors', () => {
  it('errors on non-object input', () => {
    const { errors } = validatePerformanceTable(null)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('errors when weights is missing', () => {
    const { errors } = validatePerformanceTable({ ...validTable, weights: undefined })
    expect(errors.some(e => e.includes('weights'))).toBe(true)
  })

  it('errors when weights is empty', () => {
    const { errors } = validatePerformanceTable({ ...validTable, weights: [] })
    expect(errors.some(e => e.includes('weights'))).toBe(true)
  })

  it('errors when pressureAltitudes is missing', () => {
    const { errors } = validatePerformanceTable({ ...validTable, pressureAltitudes: undefined })
    expect(errors.some(e => e.includes('pressureAltitudes'))).toBe(true)
  })

  it('errors when oats is missing', () => {
    const { errors } = validatePerformanceTable({ ...validTable, oats: undefined })
    expect(errors.some(e => e.includes('oats'))).toBe(true)
  })

  it('errors when weights is not sorted ascending', () => {
    const { errors } = validatePerformanceTable({ ...validTable, weights: [1000, 800] })
    expect(errors.some(e => e.includes('weights') && e.includes('trié'))).toBe(true)
  })

  it('errors when pressureAltitudes is not sorted ascending', () => {
    const { errors } = validatePerformanceTable({ ...validTable, pressureAltitudes: [1000, 0] })
    expect(errors.some(e => e.includes('pressureAltitudes') && e.includes('trié'))).toBe(true)
  })

  it('errors when oats is not sorted ascending', () => {
    const { errors } = validatePerformanceTable({ ...validTable, oats: [15, 0] })
    expect(errors.some(e => e.includes('oats') && e.includes('trié'))).toBe(true)
  })

  it('errors when values weight dimension does not match weights', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      weights: [800, 1000],
      values: [[[200, 220], [240, 260]]],  // only 1 weight, should be 2
    })
    expect(errors.some(e => e.includes('dimension poids'))).toBe(true)
  })

  it('errors when values PA dimension does not match pressureAltitudes', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      values: [[[200, 220]]],  // only 1 PA, should be 2
    })
    expect(errors.some(e => e.includes('dimension PA'))).toBe(true)
  })

  it('errors when values OAT dimension does not match oats', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      values: [[[200], [240]]],  // only 1 OAT, should be 2
    })
    expect(errors.some(e => e.includes('dimension OAT'))).toBe(true)
  })

  it('errors when grassValues dimensions differ from values', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      grassValues: [[[300]]],  // wrong shape
    })
    expect(errors.some(e => e.includes('grassValues'))).toBe(true)
  })

  it('errors when weightCorrection is quadratic without referenceWeight', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      weightCorrection: 'quadratic',
    })
    expect(errors.some(e => e.includes('referenceWeight'))).toBe(true)
  })

  it('errors when weightCorrection is quadratic with multiple weights', () => {
    const { errors } = validatePerformanceTable({
      weights: [800, 1000],
      pressureAltitudes: [0],
      oats: [15],
      values: [[[200]], [[260]]],
      weightCorrection: 'quadratic',
      referenceWeight: 900,
    })
    expect(errors.some(e => e.includes('quadratic attend un seul poids'))).toBe(true)
  })

  it('errors when a distance value is 0 or negative', () => {
    const { errors } = validatePerformanceTable({
      ...validTable,
      values: [[[0, 220], [240, 260]]],
    })
    expect(errors.some(e => e.includes('Distance invalide'))).toBe(true)
  })
})

describe('validatePerformanceTable — warnings', () => {
  it('warns when both grassValues and grassFactor are present', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      grassValues: [[[300, 320], [360, 380]]],
      grassFactor: 1.20,
    })
    expect(warnings.some(w => w.includes('grassFactor ignoré'))).toBe(true)
  })

  it('warns when both windCorrections and headwindFactor are present', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 0, factor: 1.0 }, { speedKt: 10, factor: 0.75 }],
      headwindFactor: 0.025,
    })
    expect(warnings.some(w => w.includes('headwindFactor ignoré'))).toBe(true)
  })

  it('warns when both windCorrections and tailwindFactor are present', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 0, factor: 1.0 }, { speedKt: 10, factor: 0.75 }],
      tailwindFactor: 0.02,
    })
    expect(warnings.some(w => w.includes('tailwindFactor ignoré'))).toBe(true)
  })

  it('warns when referenceWeight is present without quadratic', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      referenceWeight: 800,
    })
    expect(warnings.some(w => w.includes('referenceWeight ignoré'))).toBe(true)
  })

  it('warns when weightCorrectionDivisor is present without quadratic', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      weightCorrectionDivisor: 830,
    })
    expect(warnings.some(w => w.includes('weightCorrectionDivisor ignoré'))).toBe(true)
  })

  it('warns when windCorrections first point speedKt is not 0', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 5, factor: 0.9 }, { speedKt: 10, factor: 0.75 }],
    })
    expect(warnings.some(w => w.includes('premier point'))).toBe(true)
  })

  it('warns when windCorrections contains factor > 1.0', () => {
    const { warnings } = validatePerformanceTable({
      ...validTable,
      windCorrections: [{ speedKt: 0, factor: 1.1 }],
    })
    expect(warnings.some(w => w.includes('facteur > 1.0'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- perfTableValidation`

Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

Create `src/lib/aviation/perfTableValidation.ts`:

```typescript
export interface PerfTableValidation {
  errors: string[]
  warnings: string[]
}

export function validatePerformanceTable(table: unknown): PerfTableValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof table !== 'object' || table === null) {
    errors.push('Table invalide — objet JSON attendu')
    return { errors, warnings }
  }

  const t = table as Record<string, unknown>

  const axes = ['weights', 'pressureAltitudes', 'oats'] as const
  for (const ax of axes) {
    const val = t[ax]
    if (!Array.isArray(val) || val.length === 0) {
      errors.push(`Axe ${ax} manquant ou vide`)
    } else {
      for (let i = 1; i < val.length; i++) {
        if ((val[i] as number) <= (val[i - 1] as number)) {
          errors.push(`Axe ${ax} doit être trié croissant`)
          break
        }
      }
    }
  }

  if (errors.length > 0) return { errors, warnings }

  const weights = t.weights as number[]
  const pas = t.pressureAltitudes as number[]
  const oats = t.oats as number[]

  if (!Array.isArray(t.values)) {
    errors.push('values manquant')
    return { errors, warnings }
  }

  const values = t.values as number[][][]
  if (values.length !== weights.length) {
    errors.push(
      `values : dimension poids incohérente (attendu ${weights.length}, reçu ${values.length})`
    )
  } else {
    for (let wi = 0; wi < weights.length; wi++) {
      if (!Array.isArray(values[wi]) || values[wi].length !== pas.length) {
        errors.push(`values[${wi}] : dimension PA incohérente`)
      } else {
        for (let pi = 0; pi < pas.length; pi++) {
          if (!Array.isArray(values[wi][pi]) || values[wi][pi].length !== oats.length) {
            errors.push(`values[${wi}][${pi}] : dimension OAT incohérente`)
          } else {
            for (let oi = 0; oi < oats.length; oi++) {
              if (values[wi][pi][oi] <= 0) {
                errors.push(`Distance invalide à [${wi}][${pi}][${oi}] : doit être > 0`)
              }
            }
          }
        }
      }
    }
  }

  if (Array.isArray(t.grassValues)) {
    const gv = t.grassValues as number[][][]
    let dimensionsOk = gv.length === weights.length
    if (dimensionsOk) {
      for (let wi = 0; wi < weights.length && dimensionsOk; wi++) {
        if (!Array.isArray(gv[wi]) || gv[wi].length !== pas.length) {
          dimensionsOk = false
        } else {
          for (let pi = 0; pi < pas.length && dimensionsOk; pi++) {
            if (!Array.isArray(gv[wi][pi]) || gv[wi][pi].length !== oats.length) {
              dimensionsOk = false
            } else {
              for (let oi = 0; oi < oats.length; oi++) {
                if (gv[wi][pi][oi] <= 0) {
                  errors.push(`Distance invalide à grassValues[${wi}][${pi}][${oi}] : doit être > 0`)
                }
              }
            }
          }
        }
      }
    }
    if (!dimensionsOk) errors.push('grassValues : dimensions différentes de values')
  }

  if (t.weightCorrection === 'quadratic') {
    if (t.referenceWeight === undefined || t.referenceWeight === null) {
      errors.push('referenceWeight requis avec weightCorrection: quadratic')
    }
    if (weights.length > 1) {
      errors.push('quadratic attend un seul poids — utiliser interpolate pour plusieurs poids')
    }
  }

  // Warnings
  if (Array.isArray(t.grassValues) && t.grassFactor !== undefined) {
    warnings.push('grassFactor ignoré — grassValues est prioritaire')
  }

  if (Array.isArray(t.windCorrections)) {
    if (t.headwindFactor !== undefined) {
      warnings.push('headwindFactor ignoré — windCorrections est prioritaire')
    }
    if (t.tailwindFactor !== undefined) {
      warnings.push('tailwindFactor ignoré — windCorrections est prioritaire')
    }
    const wc = t.windCorrections as Array<{ speedKt: number; factor: number }>
    if (wc.length > 0 && wc[0].speedKt !== 0) {
      warnings.push('windCorrections : premier point devrait être speedKt=0, factor=1.0')
    }
    for (const pt of wc) {
      if (pt.factor > 1.0) {
        warnings.push(
          `windCorrections : facteur > 1.0 à speedKt=${pt.speedKt} — suspect pour vent de face`
        )
      }
    }
  }

  if (t.referenceWeight !== undefined && t.weightCorrection !== 'quadratic') {
    warnings.push("referenceWeight ignoré — weightCorrection n'est pas quadratic")
  }
  if (t.weightCorrectionDivisor !== undefined && t.weightCorrection !== 'quadratic') {
    warnings.push("weightCorrectionDivisor ignoré — weightCorrection n'est pas quadratic")
  }

  return { errors, warnings }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- perfTableValidation`

Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aviation/perfTableValidation.ts src/__tests__/aviation/perfTableValidation.test.ts
git commit -m "feat: add perfTableValidation with error/warning rules (TDD)"
```

---

### Task 7: perfCalc Extensions (TDD)

**Files:**
- Modify: `src/__tests__/aviation/perfCalc.test.ts`
- Modify: `src/lib/aviation/perfCalc.ts`

- [ ] **Step 1: Rewrite `perfCalc.test.ts`**

Replace the entire file:

```typescript
import { interpolatePerf, computePerf } from '../../lib/aviation/perfCalc'
import type { PerformanceTable, PerfConditions } from '../../types'

const table: PerformanceTable = {
  weights: [800, 1000],
  pressureAltitudes: [0, 2000],
  oats: [0, 20],
  values: [
    // weight=800
    [
      [200, 220],  // pa=0:    [oat=0, oat=20]
      [240, 270],  // pa=2000: [oat=0, oat=20]
    ],
    // weight=1000
    [
      [260, 290],  // pa=0:    [oat=0, oat=20]
      [310, 350],  // pa=2000: [oat=0, oat=20]
    ],
  ],
  grassFactor: 1.20,
  headwindFactor: 0.025,
  tailwindFactor: 0.02,
}

describe('interpolatePerf — existing corner/midpoint tests', () => {
  it('returns exact corner value: weight=800, pa=0, oat=0', () => {
    expect(interpolatePerf(table, 800, 0, 0)).toBe(200)
  })

  it('returns exact corner value: weight=1000, pa=0, oat=0', () => {
    expect(interpolatePerf(table, 1000, 0, 0)).toBe(260)
  })

  it('returns exact corner value: weight=800, pa=0, oat=20', () => {
    expect(interpolatePerf(table, 800, 0, 20)).toBe(220)
  })

  it('returns exact corner value: weight=800, pa=2000, oat=0', () => {
    expect(interpolatePerf(table, 800, 2000, 0)).toBe(240)
  })

  it('interpolates weight midpoint: weight=900, pa=0, oat=0', () => {
    expect(interpolatePerf(table, 900, 0, 0)).toBe(230)
  })

  it('interpolates OAT midpoint: weight=800, pa=0, oat=10', () => {
    expect(interpolatePerf(table, 800, 0, 10)).toBe(210)
  })

  it('clamps weight below minimum', () => {
    expect(interpolatePerf(table, 600, 0, 0)).toBe(200)
  })

  it('clamps weight above maximum', () => {
    expect(interpolatePerf(table, 1200, 0, 0)).toBe(260)
  })
})

describe('interpolatePerf — oatAxis: isa_delta', () => {
  const isaTable: PerformanceTable = {
    weights: [800],
    pressureAltitudes: [0, 4000],
    oats: [-20, 0, 20],  // ISA deltas
    oatAxis: 'isa_delta',
    values: [
      [
        [150, 200, 260],  // pa=0
        [180, 240, 310],  // pa=4000
      ],
    ],
  }

  it('at PA=0, OAT=15°C (ISA), delta=0 → reads oats[1] (delta=0)', () => {
    // ISA at PA=0: 15 - 0 = 15°C; delta = 15 - 15 = 0
    expect(interpolatePerf(isaTable, 800, 0, 15)).toBe(200)
  })

  it('at PA=4000, OAT=7°C (ISA at 4000ft), delta=0 → reads oats[1]', () => {
    // ISA at 4000ft: 15 - 2*(4000/1000) = 7°C; delta = 7 - 7 = 0
    expect(interpolatePerf(isaTable, 800, 4000, 7)).toBe(240)
  })

  it('at PA=0, OAT=35°C, delta=+20 → reads oats[2] (delta=+20)', () => {
    // ISA at 0: 15; delta = 35 - 15 = 20
    expect(interpolatePerf(isaTable, 800, 0, 35)).toBe(260)
  })
})

describe('interpolatePerf — weightCorrection: quadratic', () => {
  const quadTable: PerformanceTable = {
    weights: [1000],
    pressureAltitudes: [0],
    oats: [15],
    weightCorrection: 'quadratic',
    referenceWeight: 1000,
    weightCorrectionDivisor: 1000,
    values: [[[200]]],
  }

  it('at referenceWeight, correction factor is (1000/1000)^2 = 1.0 → distance unchanged', () => {
    expect(interpolatePerf(quadTable, 1000, 0, 15)).toBeCloseTo(200, 0)
  })

  it('at half weight, correction factor is (500/1000)^2 = 0.25 → distance × 0.25', () => {
    expect(interpolatePerf(quadTable, 500, 0, 15)).toBeCloseTo(50, 0)
  })

  it('uses weightCorrectionDivisor when different from referenceWeight', () => {
    const t: PerformanceTable = {
      ...quadTable,
      referenceWeight: 840,
      weightCorrectionDivisor: 830,
      values: [[[440]]],
    }
    // (830/830)^2 = 1 → 440 unchanged
    expect(interpolatePerf(t, 830, 0, 15)).toBeCloseTo(440, 0)
    // (800/830)^2 ≈ 0.929 → 440 × 0.929 ≈ 409
    expect(interpolatePerf(t, 800, 0, 15)).toBeCloseTo(440 * (800 / 830) ** 2, 0)
  })
})

describe('computePerf — existing corrections', () => {
  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('returns base distance with no corrections', () => {
    expect(computePerf(table, baseCond)).toBe(200)
  })

  it('applies grassFactor when no grassValues', () => {
    // 200 * 1.20 = 240
    expect(computePerf(table, { ...baseCond, surfaceGrass: true })).toBe(240)
  })

  it('applies headwindFactor reduction', () => {
    // 200 * (1 - 0.025*10) = 200 * 0.75 = 150
    expect(computePerf(table, { ...baseCond, windKt: 10 })).toBe(150)
  })

  it('applies tailwindFactor increase', () => {
    // 200 * (1 + 0.02*10) = 200 * 1.20 = 240
    expect(computePerf(table, { ...baseCond, windKt: -10 })).toBe(240)
  })
})

describe('computePerf — grassValues', () => {
  const tableWithGrass: PerformanceTable = {
    ...table,
    grassValues: [
      [
        [280, 310],
        [330, 370],
      ],
      [
        [360, 400],
        [430, 480],
      ],
    ],
    grassFactor: 1.50,  // should be IGNORED when grassValues present
  }

  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('uses values (not grassValues) on hard surface', () => {
    expect(computePerf(tableWithGrass, baseCond)).toBe(200)
  })

  it('uses grassValues on grass surface, ignores grassFactor', () => {
    // grassValues[0][0][0] = 280 (not 200 × 1.50 = 300)
    expect(computePerf(tableWithGrass, { ...baseCond, surfaceGrass: true })).toBe(280)
  })
})

describe('computePerf — windCorrections', () => {
  const tableWind: PerformanceTable = {
    weights: [800],
    pressureAltitudes: [0],
    oats: [0],
    values: [[[200]]],
    windCorrections: [
      { speedKt: 0, factor: 1.0 },
      { speedKt: 10, factor: 0.75 },
      { speedKt: 20, factor: 0.50 },
    ],
    headwindFactor: 0.99,  // should be IGNORED when windCorrections present
    tailwindFactor: 0.99,  // should be IGNORED when windCorrections present
  }
  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('no wind → factor 1.0 → distance unchanged', () => {
    expect(computePerf(tableWind, baseCond)).toBe(200)
  })

  it('interpolates between 0 and 10 kt: windKt=5 → factor 0.875', () => {
    // lerp(1.0, 0.75, 0.5) = 0.875; 200 × 0.875 = 175
    expect(computePerf(tableWind, { ...baseCond, windKt: 5 })).toBe(175)
  })

  it('exact point: windKt=10 → factor 0.75 → 200 × 0.75 = 150', () => {
    expect(computePerf(tableWind, { ...baseCond, windKt: 10 })).toBe(150)
  })

  it('clamps at max point: windKt=30 → factor 0.50 → 200 × 0.50 = 100', () => {
    expect(computePerf(tableWind, { ...baseCond, windKt: 30 })).toBe(100)
  })

  it('tailwind with windCorrections: no correction applied', () => {
    // windKt < 0, windCorrections present → no correction → still 200
    expect(computePerf(tableWind, { ...baseCond, windKt: -10 })).toBe(200)
  })

  it('ignores headwindFactor when windCorrections present', () => {
    // Would be 200 × (1 - 0.99×10) = very wrong if headwindFactor applied
    const result = computePerf(tableWind, { ...baseCond, windKt: 5 })
    expect(result).toBe(175)  // interpolated, not headwindFactor-based
  })
})

describe('computePerf — regulatoryFactor', () => {
  const baseCond: PerfConditions = {
    weight: 800, pa: 0, oat: 0, surfaceGrass: false, windKt: 0,
  }

  it('default regulatoryFactor=1 → distance unchanged', () => {
    expect(computePerf(table, baseCond)).toBe(200)
  })

  it('regulatoryFactor=1.15 → 200 × 1.15 = 230', () => {
    expect(computePerf(table, baseCond, 1.15)).toBe(230)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- perfCalc`

Expected: FAIL — `slopePercent` type error, missing `oatAxis`/`windCorrections` behaviour, `computePerf` signature mismatch.

- [ ] **Step 3: Rewrite `perfCalc.ts`**

Replace the entire `src/lib/aviation/perfCalc.ts`:

```typescript
import type { PerformanceTable, PerfConditions } from '../../types'

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function indexFraction(arr: number[], val: number): [number, number] {
  const clamped = Math.max(arr[0], Math.min(arr[arr.length - 1], val))
  let i = arr.findIndex(v => v >= clamped)
  if (i <= 0) return [0, 0]
  const t = (clamped - arr[i - 1]) / (arr[i] - arr[i - 1])
  return [i - 1, t]
}

function interpolateWindFactor(
  corrections: Array<{ speedKt: number; factor: number }>,
  windKt: number,
): number {
  if (windKt <= 0) return 1
  const pts = corrections
  if (pts.length === 0) return 1
  if (windKt <= pts[0].speedKt) return pts[0].factor
  if (windKt >= pts[pts.length - 1].speedKt) return pts[pts.length - 1].factor
  for (let i = 1; i < pts.length; i++) {
    if (windKt <= pts[i].speedKt) {
      const t = (windKt - pts[i - 1].speedKt) / (pts[i].speedKt - pts[i - 1].speedKt)
      return lerp(pts[i - 1].factor, pts[i].factor, t)
    }
  }
  return 1
}

export function interpolatePerf(
  table: PerformanceTable,
  weight: number,
  pa: number,
  oat: number,
): number {
  // Convert OAT to ISA delta if needed
  const lookupOat =
    table.oatAxis === 'isa_delta' ? oat - (15 - 2 * pa / 1000) : oat

  const [wi, wt] = indexFraction(table.weights, weight)
  const [pi, pt] = indexFraction(table.pressureAltitudes, pa)
  const [oi, ot] = indexFraction(table.oats, lookupOat)

  const get = (w: number, p: number, o: number) =>
    table.values[Math.min(w, table.weights.length - 1)]
      ?.[Math.min(p, table.pressureAltitudes.length - 1)]
      ?.[Math.min(o, table.oats.length - 1)] ?? 0

  const v000 = lerp(get(wi, pi, oi), get(wi, pi, oi + 1), ot)
  const v010 = lerp(get(wi, pi + 1, oi), get(wi, pi + 1, oi + 1), ot)
  const v100 = lerp(get(wi + 1, pi, oi), get(wi + 1, pi, oi + 1), ot)
  const v110 = lerp(get(wi + 1, pi + 1, oi), get(wi + 1, pi + 1, oi + 1), ot)

  const v00 = lerp(v000, v010, pt)
  const v10 = lerp(v100, v110, pt)

  let d = lerp(v00, v10, wt)

  if (table.weightCorrection === 'quadratic') {
    const div =
      table.weightCorrectionDivisor ?? table.referenceWeight ?? table.weights[0]
    d *= (weight / div) ** 2
  }

  return d
}

export function computePerf(
  table: PerformanceTable,
  cond: PerfConditions,
  regulatoryFactor = 1,
): number {
  // Select grass values if available, else use main values
  const effectiveTable =
    cond.surfaceGrass && table.grassValues
      ? { ...table, values: table.grassValues }
      : table

  let d = interpolatePerf(effectiveTable, cond.weight, cond.pa, cond.oat)

  // Grass fallback factor (only when no grassValues table)
  if (cond.surfaceGrass && !table.grassValues && table.grassFactor) {
    d *= table.grassFactor
  }

  // Wind
  if (table.windCorrections) {
    if (cond.windKt > 0) {
      d *= interpolateWindFactor(table.windCorrections, cond.windKt)
    }
    // tailwind: no correction when windCorrections present (table is headwind-only)
  } else {
    if (cond.windKt > 0) d *= 1 - (table.headwindFactor ?? 0.01) * cond.windKt
    if (cond.windKt < 0) d *= 1 + (table.tailwindFactor ?? 0.015) * Math.abs(cond.windKt)
  }

  d *= regulatoryFactor

  return Math.round(d)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- perfCalc`

Expected: PASS all tests.

- [ ] **Step 5: Full test suite**

Run: `npm test`

Expected: Only TypeScript errors remaining in `PerfPanel.tsx` (uses `slopePercent`, `factors.regulatory`, DA bug).

- [ ] **Step 6: Commit**

```bash
git add src/lib/aviation/perfCalc.ts src/__tests__/aviation/perfCalc.test.ts
git commit -m "feat: perfCalc — ISA delta, quadratic weight correction, grassValues, windCorrections, regulatoryFactor"
```

---

### Task 8: PerfPanel — Fix PA Bug + perfRegulatory + Remove Slope

**Files:**
- Modify: `src/features/perf/PerfPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `App.tsx` — add `perfRegulatory` to new dossier**

In `src/App.tsx`, find the dossier creation object (around line 76). Add `perfRegulatory: 1.0` after `loading`:

```typescript
loading: Object.fromEntries(aircraft.massBalance.stations.map(s => [s.name, 0])),
perfRegulatory: 1.0,
perfInputs: {},
```

- [ ] **Step 2: Rewrite `PerfPanel.tsx`**

Replace the entire `src/features/perf/PerfPanel.tsx`:

```typescript
import { useState, useMemo } from 'react'
import type { FlightDossier, TerrainPerfInputs, PerfConditions, AircraftSnapshot } from '../../types'
import { computePerf } from '../../lib/aviation/perfCalc'
import { computeWB } from '../../lib/aviation/wbCalc'
import { validatePerformanceTable } from '../../lib/aviation/perfTableValidation'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'

const TERRAINS = [
  { key: 'DEP', label: 'Départ', tableKey: 'to' as const },
  { key: 'ARR', label: 'Arrivée', tableKey: 'ldg' as const },
  { key: 'DEROUT', label: 'Déroutement', tableKey: 'ldg' as const },
]

const DEFAULT_PERF: TerrainPerfInputs = {
  surface: 'hard',
  windKt: 0,
  toda: undefined,
  lda: undefined,
}

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
  perfInputs: TerrainPerfInputs
  perfRegulatory: number
  onUpdate: (inputs: TerrainPerfInputs) => void
}

function TerrainCard({
  terrainKey,
  label,
  tableKey,
  aircraft,
  weight,
  defaultQnh,
  defaultTemp,
  perfInputs,
  perfRegulatory,
  onUpdate,
}: TerrainCardProps) {
  const [elevation, setElevation] = useState(0)
  const [qnh, setQnh] = useState(defaultQnh)
  const [temp, setTemp] = useState(defaultTemp)

  const inputs = { ...DEFAULT_PERF, ...perfInputs }

  const pa = pressureAlt(elevation, qnh)
  const da = densityAlt(pa, temp)

  const table = tableKey === 'to' ? aircraft.performance.toTable : aircraft.performance.ldgTable

  const tableValidation = useMemo(() => validatePerformanceTable(table), [table])

  const cond: PerfConditions = {
    weight,
    pa,          // pressure altitude — NOT density altitude
    oat: temp,
    surfaceGrass: inputs.surface === 'grass',
    windKt: inputs.windKt,
  }

  const canCompute = tableValidation.errors.length === 0
  const distBase = canCompute ? computePerf(table, cond) : 0
  const distRegulatory = canCompute ? Math.round(distBase * perfRegulatory) : 0

  const todaOk = inputs.toda === undefined || distRegulatory <= inputs.toda
  const ldaOk = inputs.lda === undefined || distRegulatory <= inputs.lda

  const update = (changes: Partial<TerrainPerfInputs>) => {
    onUpdate({ ...inputs, ...changes })
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          {label}
        </h2>
        <div className="flex gap-2 flex-wrap justify-end">
          {tableValidation.errors.length > 0 && (
            <Badge variant="error">Config invalide</Badge>
          )}
          {tableValidation.errors.length === 0 && tableValidation.warnings.length > 0 && (
            <Badge variant="warning">⚠ config partielle</Badge>
          )}
          {inputs.toda !== undefined && canCompute && (
            <Badge variant={todaOk ? 'success' : 'error'}>
              {todaOk ? 'TODA OK' : 'TODA INSUFFISANT'}
            </Badge>
          )}
          {inputs.lda !== undefined && canCompute && (
            <Badge variant={ldaOk ? 'success' : 'error'}>
              {ldaOk ? 'LDA OK' : 'LDA INSUFFISANT'}
            </Badge>
          )}
        </div>
      </div>

      {tableValidation.errors.length > 0 && (
        <div className="mb-4 p-3 rounded border border-[var(--red)] bg-[var(--red)]/10 text-[var(--red)] text-xs space-y-1">
          {tableValidation.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {tableValidation.warnings.length > 0 && (
        <div className="mb-4 p-3 rounded border border-[var(--amber)] bg-[var(--amber)]/10 text-[var(--amber)] text-xs space-y-1">
          {tableValidation.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Conditions</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Elév. (ft)"
              type="number"
              value={elevation === 0 ? '' : elevation}
              placeholder="0"
              onChange={(e) => setElevation(e.target.value === '' ? 0 : Number(e.target.value))}
            />
            <Input
              label="QNH (hPa)"
              type="number"
              value={qnh}
              onChange={(e) => setQnh(Number(e.target.value))}
            />
            <Input
              label="Temp (°C)"
              type="number"
              value={temp}
              onChange={(e) => setTemp(Number(e.target.value))}
            />
            <Input
              label="Vent (kt)"
              type="number"
              value={inputs.windKt === 0 ? '' : inputs.windKt}
              placeholder="0"
              hint="+face / −arrière"
              onChange={(e) => update({ windKt: e.target.value === '' ? 0 : Number(e.target.value) })}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Surface
              </label>
              <button
                type="button"
                onClick={() => update({ surface: inputs.surface === 'hard' ? 'grass' : 'hard' })}
                className={`
                  px-3 py-2 rounded text-xs font-medium border transition-colors
                  ${inputs.surface === 'hard'
                    ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                    : 'border-[var(--green)] text-[var(--green)] bg-[var(--green)]/10'
                  }
                `}
              >
                {inputs.surface === 'hard' ? 'Dur' : 'Herbe'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="TODA (m)"
              type="number"
              value={inputs.toda ?? ''}
              placeholder="optionnel"
              onChange={(e) =>
                update({ toda: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <Input
              label="LDA (m)"
              type="number"
              value={inputs.lda ?? ''}
              placeholder="optionnel"
              onChange={(e) =>
                update({ lda: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
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
                <dt className="text-[var(--text-muted)]">
                  Dist. réglementaire (×{perfRegulatory.toFixed(2)})
                </dt>
                <dd className="font-mono text-[var(--text-1)]">{distRegulatory} m</dd>
              </div>
              {inputs.toda !== undefined && (
                <div className="flex justify-between text-xs">
                  <dt className="text-[var(--text-dim)]">TODA disponible</dt>
                  <dd className={`font-mono ${todaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {inputs.toda} m
                  </dd>
                </div>
              )}
              {inputs.lda !== undefined && (
                <div className="flex justify-between text-xs">
                  <dt className="text-[var(--text-dim)]">LDA disponible</dt>
                  <dd className={`font-mono ${ldaOk ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {inputs.lda} m
                  </dd>
                </div>
              )}
              <div className="flex justify-between text-xs text-[var(--text-dim)] border-t border-[var(--border)] pt-2">
                <dt>Masse utilisée</dt>
                <dd className="font-mono">{Math.round(weight)} kg</dd>
              </div>
              <div className="flex justify-between text-xs text-[var(--text-dim)]">
                <dt>Type</dt>
                <dd className="font-mono">{tableKey === 'to' ? 'Décollage' : 'Atterrissage'}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-[var(--text-dim)] italic">
              Calcul indisponible — corriger la configuration de la table.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--text-dim)]">Terrain : {terrainKey}</p>
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
  const { aircraft, loading, weatherInputs, perfInputs, route, perfRegulatory } = dossier

  const depIcao = route?.waypoints[0]?.name ?? ''
  const arrIcao = route?.waypoints[route.waypoints.length - 1]?.name ?? ''

  const depWeight = useMemo(() => {
    const wb = computeWB(aircraft.massBalance, loading)
    return Math.min(wb.totalWeight, aircraft.massBalance.maxWeight)
  }, [aircraft, loading])

  const getWeatherFor = (terrainKey: string) => {
    const icao = terrainKey === 'DEP' ? depIcao : terrainKey === 'ARR' ? arrIcao : ''
    const field = weatherInputs.fields[icao]
    return { qnh: field?.qnh ?? 1013, temp: field?.temp ?? 15 }
  }

  const handleUpdate = (key: string, inputs: TerrainPerfInputs) => {
    onUpdate({ ...perfInputs, [key]: inputs })
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <Card padding="sm">
        <div className="flex items-center gap-4">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap">
            Marge réglementaire (×)
          </label>
          <input
            type="number"
            min={1}
            step={0.01}
            value={perfRegulatory ?? 1.0}
            onChange={e => onUpdateRegulatory(Number(e.target.value) || 1.0)}
            className="w-24 text-right font-mono text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] focus:outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
          />
          <span className="text-xs text-[var(--text-dim)]">1.15 pour clubs Alcyons</span>
        </div>
      </Card>

      {TERRAINS.map(({ key, label, tableKey }) => {
        const weather = getWeatherFor(key)
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
            perfInputs={perfInputs[key] ?? DEFAULT_PERF}
            perfRegulatory={perfRegulatory ?? 1.0}
            onUpdate={(inputs) => handleUpdate(key, inputs)}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Update `DossierScreen.tsx` to wire `onUpdateRegulatory`**

In `src/screens/DossierScreen.tsx`, update the PerfPanel render:
```typescript
{activeTab === 'perf' && (
  <PerfPanel
    dossier={dossier}
    onUpdate={(perfInputs) => update({ perfInputs })}
    onUpdateRegulatory={(perfRegulatory) => update({ perfRegulatory })}
  />
)}
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`

Expected: PASS all tests, zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/PerfPanel.tsx src/screens/DossierScreen.tsx src/App.tsx
git commit -m "fix: PerfPanel — use PA not DA for perf lookup, perfRegulatory from dossier, remove slope"
```

---

### Task 9: AircraftEditorScreen — Perf Table Validation UI

**Files:**
- Modify: `src/screens/AircraftEditorScreen.tsx`

- [ ] **Step 1: Add validation state and import**

At the top of `AircraftEditorScreen.tsx`, add the import:
```typescript
import { validatePerformanceTable } from '../lib/aviation/perfTableValidation'
import type { PerfTableValidation } from '../lib/aviation/perfTableValidation'
```

Add state variables after `const [jsonError, setJsonError] = useState<string | null>(null)`:
```typescript
const [toTableValidation, setToTableValidation] = useState<PerfTableValidation>({ errors: [], warnings: [] })
const [ldgTableValidation, setLdgTableValidation] = useState<PerfTableValidation>({ errors: [], warnings: [] })
```

- [ ] **Step 2: Run validation on JSON change**

Replace the `toTableJson` onChange handler:
```typescript
onChange={e => {
  setToTableJson(e.target.value)
  try {
    const parsed = JSON.parse(e.target.value)
    setToTableValidation(validatePerformanceTable(parsed))
  } catch {
    setToTableValidation({ errors: ['JSON invalide'], warnings: [] })
  }
}}
```

Replace the `ldgTableJson` onChange handler:
```typescript
onChange={e => {
  setLdgTableJson(e.target.value)
  try {
    const parsed = JSON.parse(e.target.value)
    setLdgTableValidation(validatePerformanceTable(parsed))
  } catch {
    setLdgTableValidation({ errors: ['JSON invalide'], warnings: [] })
  }
}}
```

Also initialize validation in `applyAircraft` after setting JSON strings:
```typescript
setToTableJson(JSON.stringify(ac.performance.toTable, null, 2))
setToTableValidation(validatePerformanceTable(ac.performance.toTable))
setLdgTableJson(JSON.stringify(ac.performance.ldgTable, null, 2))
setLdgTableValidation(validatePerformanceTable(ac.performance.ldgTable))
```

- [ ] **Step 3: Add validation banners under each textarea**

After the toTable `<PerfTablePreview json={toTableJson} />`, add:
```typescript
{toTableValidation.errors.map((e, i) => (
  <p key={i} className="text-xs text-[var(--red)] mt-1">{e}</p>
))}
{toTableValidation.warnings.map((w, i) => (
  <p key={i} className="text-xs text-[var(--amber)] mt-1">⚠ {w}</p>
))}
```

After the ldgTable `<PerfTablePreview json={ldgTableJson} />`, add:
```typescript
{ldgTableValidation.errors.map((e, i) => (
  <p key={i} className="text-xs text-[var(--red)] mt-1">{e}</p>
))}
{ldgTableValidation.warnings.map((w, i) => (
  <p key={i} className="text-xs text-[var(--amber)] mt-1">⚠ {w}</p>
))}
```

- [ ] **Step 4: Disable save when validation errors exist**

Find the Save button at the bottom:
```typescript
<Button variant="primary" onClick={handleSave}>Sauvegarder</Button>
```

Replace with:
```typescript
<Button
  variant="primary"
  onClick={handleSave}
  disabled={toTableValidation.errors.length > 0 || ldgTableValidation.errors.length > 0}
>
  Sauvegarder
</Button>
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: PASS all tests, zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/AircraftEditorScreen.tsx
git commit -m "feat: AircraftEditorScreen — real-time perf table JSON validation with error/warning banners"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task |
|---|---|
| WeightStation: remove maxWeight, add kind | Task 1 + Task 4 |
| StationLoading: fuel→L, dry→kg | Task 1 + Task 2 |
| computeWB fuelDensity param | Task 2 |
| WBPanel fuel inputs in L | Task 3 |
| WBPanel remove name hack | Task 3 |
| WBPanel no hardcoded full fuel | Task 3 |
| AircraftEditorScreen kind selector | Task 4 |
| AircraftEditorScreen remove factors UI | Task 4 |
| DR221 template update | Task 5 |
| PerformanceTable: oatAxis, grassValues, weightCorrection, windCorrections | Task 1 |
| PerformanceTable: remove slopeFactor | Task 1 |
| AircraftPerformance: remove factors | Task 1 + Task 4 |
| PerfConditions: remove slopePercent | Task 1 |
| TerrainPerfInputs: remove slope | Task 1 |
| FlightDossier.perfRegulatory | Task 1 + Task 8 |
| perfTableValidation errors (9 rules) | Task 6 |
| perfTableValidation warnings (7 rules) | Task 6 |
| interpolatePerf: oatAxis isa_delta | Task 7 |
| interpolatePerf: quadratic correction | Task 7 |
| computePerf: grassValues priority | Task 7 |
| computePerf: windCorrections interpolation | Task 7 |
| computePerf: regulatoryFactor param | Task 7 |
| PerfPanel: fix PA/DA bug | Task 8 |
| PerfPanel: perfRegulatory input | Task 8 |
| PerfPanel: validation warnings display | Task 8 |
| PerfPanel: remove slope input | Task 8 |
| AircraftEditorScreen perf validation UI | Task 9 |
| AircraftEditorScreen save disabled on errors | Task 9 |

### Type Consistency Check

- `WeightStation.kind: 'dry' | 'fuel'` — defined Task 1, used Tasks 2, 3, 4, 5
- `computeWB(massBalance, loading, fuelDensity?)` — defined Task 2, used Tasks 3, 8
- `computePerf(table, cond, regulatoryFactor?)` — defined Task 7, used Task 8
- `validatePerformanceTable(table: unknown): PerfTableValidation` — defined Task 6, used Tasks 8, 9
- `FlightDossier.perfRegulatory: number` — defined Task 1, initialized Task 8 (App.tsx), read Task 8 (PerfPanel)
- `PerfPanel.onUpdateRegulatory` — defined + wired in Task 8

### Notes

- `Badge` already supports `variant="warning"` — no changes needed to `Badge.tsx`.
