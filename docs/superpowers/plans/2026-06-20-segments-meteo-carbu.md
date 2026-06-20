# Segments météo et bilan carburant — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer `FlightPoint[]` par `aerodromes[]` + `segments[]` sur `FlightBranch`, et calculer le bilan carburant automatiquement via le triangle des vents par segment.

**Architecture:** Migration type-first (Task 1 casse la compilation ; Tasks 2–9 la restaurent). Nouveau module pur `fuelCalc.ts` testé indépendamment. `BranchesPanel` et `FuelPanel` réécrits.

**Tech Stack:** React 18, TypeScript 5, Vitest + @testing-library/react, react-leaflet

## Global Constraints

- Tous les angles en °M (magnétique) — cap segment ET direction vent
- Minimum 1 segment ENROUTE par branche (créé automatiquement, nommé "Vol")
- Maximum 1 segment ALTERNATE par branche (auto-géré via aerodromes)
- `reserveMin` et `derouteMin` s'appliquent sur **chaque** branche
- GS peut être négative — pas de `max(1, ...)` (signal d'alerte pilote)
- `windAtAltitude` et `WindLayer` supprimés entièrement

---

### Task 1 : Mise à jour des types

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `FlightAerodrome`, `FlightSegmentRole`, `FlightSegment`, `FlightBranch` (new shape), `WeatherInputs` (sans `winds`), `FuelInputs` (sans `gsBase`/`windAdjust`/`derouteMin`)

> ⚠️ Après ce commit, le code ne compile plus jusqu'à Task 5. C'est attendu sur une feature branch.

- [ ] **Step 1 : Remplacer les types dans `src/types/index.ts`**

Section "Branches de vol" — remplacer intégralement par :

```typescript
// ── Branches de vol ───────────────────────────────────────────────────────────

export interface FlightAerodrome {
  id: string
  identifier: string             // code OACI
  role: 'DEP' | 'ARR' | 'ALTERNATE' | 'OVERFLY'
}

export type FlightSegmentRole = 'ENROUTE' | 'ALTERNATE'

export interface FlightSegment {
  id: string
  role: FlightSegmentRole
  name: string
  distanceNm: number
  headingMag: number             // Cap magnétique (°M)
  wind: { directionDeg: number; speedKt: number } | null  // Direction °M
  notes: string
}

export interface FlightBranch {
  id: string
  label: string                  // obligatoire, non vide
  aerodromes: FlightAerodrome[]
  segments: FlightSegment[]      // min 1 ENROUTE
  notes: string
}
```

Section "Météo" — supprimer `WindLayer` et modifier `WeatherInputs` :

```typescript
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

Section "Carburant" — modifier `FuelInputs` :

```typescript
export interface FuelExtra {
  id: string
  label: string
  durationMin: number
}

export interface FuelInputs {
  roulage: number
  marge: number
  extras: FuelExtra[]
  reserveMin: number
  plein: boolean
}
```

- [ ] **Step 2 : Commit**

```bash
git add src/types/index.ts
git commit -m "refactor(types): replace FlightPoint with FlightAerodrome+FlightSegment, drop WindLayer and gsBase/windAdjust/derouteMin"
```

---

### Task 2 : `computeSegmentWind` (TDD)

**Files:**
- Modify: `src/lib/aviation/windTriangle.ts`
- Modify: `src/__tests__/aviation/windTriangle.test.ts`

**Interfaces:**
- Produces: `computeSegmentWind(headingMag, tas, windDirMag, windSpeedKt): { gs: number; wca: number }`
- `windAtAltitude` supprimée (plus de WindLayer)

- [ ] **Step 1 : Écrire les tests qui échouent**

Remplacer `src/__tests__/aviation/windTriangle.test.ts` :

```typescript
import { solveWindTriangle, computeSegmentWind } from '../../lib/aviation/windTriangle'

describe('solveWindTriangle', () => {
  it('no wind: wca=0, gs=tas, th=tc', () => {
    const r = solveWindTriangle(90, 100, 0, 0)
    expect(r.wca).toBeCloseTo(0, 5)
    expect(r.gs).toBe(100)
    expect(r.th).toBeCloseTo(90, 0)
  })

  it('direct headwind: gs ≈ tas - windSpeed', () => {
    const r = solveWindTriangle(0, 100, 0, 20)
    expect(r.gs).toBeCloseTo(80, 0)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('direct tailwind: gs ≈ tas + windSpeed', () => {
    const r = solveWindTriangle(0, 100, 180, 20)
    expect(r.gs).toBeCloseTo(120, 0)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('crosswind from right: wca > 0', () => {
    const r = solveWindTriangle(0, 100, 90, 20)
    expect(r.wca).toBeGreaterThan(0)
  })

  it('wca is negative for wind from left', () => {
    const r = solveWindTriangle(0, 100, 270, 20)
    expect(r.wca).toBeLessThan(0)
  })
})

describe('computeSegmentWind', () => {
  it('no wind (speed=0): gs=TAS, wca=0', () => {
    const r = computeSegmentWind(270, 120, 0, 0)
    expect(r.gs).toBe(120)
    expect(r.wca).toBe(0)
  })

  it('direct headwind reduces GS', () => {
    // cap 270, vent du 270 = plein face
    const r = computeSegmentWind(270, 120, 270, 20)
    expect(r.gs).toBeCloseTo(100, 1)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('direct tailwind increases GS', () => {
    // cap 270, vent du 090 = plein dos
    const r = computeSegmentWind(270, 120, 90, 20)
    expect(r.gs).toBeCloseTo(140, 1)
    expect(r.wca).toBeCloseTo(0, 1)
  })

  it('crosswind from right gives positive WCA', () => {
    // cap 270, vent du 000 (nord) = de droite quand on vole vers l'ouest
    const r = computeSegmentWind(270, 120, 0, 20)
    expect(r.wca).toBeGreaterThan(0)
  })

  it('crosswind from left gives negative WCA', () => {
    // cap 270, vent du 180 (sud) = de gauche
    const r = computeSegmentWind(270, 120, 180, 20)
    expect(r.wca).toBeLessThan(0)
  })

  it('GS can be negative with extreme headwind', () => {
    const r = computeSegmentWind(270, 20, 270, 30)
    expect(r.gs).toBeLessThan(0)
  })

  it('pure crosswind: no headwind component', () => {
    // vent exactement perpendiculaire → GS ≈ TAS (légèrement réduite par le crabe)
    const r = computeSegmentWind(0, 100, 90, 10)
    // headwindComponent = 10*cos(90°) = 0 → GS = TAS
    expect(r.gs).toBeCloseTo(100, 1)
    expect(r.wca).not.toBe(0)
  })
})
```

- [ ] **Step 2 : Vérifier que les tests `computeSegmentWind` échouent**

```bash
npx vitest run src/__tests__/aviation/windTriangle.test.ts
```

Expected: FAIL — `computeSegmentWind is not a function`

- [ ] **Step 3 : Implémenter `computeSegmentWind` dans `src/lib/aviation/windTriangle.ts`**

Ajouter après `solveWindTriangle`, supprimer `windAtAltitude` :

```typescript
export interface SegmentWindResult {
  gs: number   // vitesse sol (kt) — peut être négative
  wca: number  // angle de correction vent (°), positif = à droite
}

/**
 * Calcule GS et WCA pour un segment depuis le cap magnétique et le vent magnétique.
 * Tous les angles en °M. GS non bornée (une GS négative signale une erreur de saisie).
 */
export function computeSegmentWind(
  headingMag: number,
  tas: number,
  windDirMag: number,
  windSpeedKt: number,
): SegmentWindResult {
  if (windSpeedKt === 0) return { gs: tas, wca: 0 }
  const angleRad = ((windDirMag - headingMag) * Math.PI) / 180
  const headwindComponent = windSpeedKt * Math.cos(angleRad)
  const gs = tas - headwindComponent
  const sinWca = (windSpeedKt * Math.sin(angleRad)) / tas
  const wca = Math.asin(Math.max(-1, Math.min(1, sinWca))) * (180 / Math.PI)
  return {
    gs: Math.round(gs * 10) / 10,
    wca: Math.round(wca * 10) / 10,
  }
}
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
npx vitest run src/__tests__/aviation/windTriangle.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5 : Commit**

```bash
git add src/lib/aviation/windTriangle.ts src/__tests__/aviation/windTriangle.test.ts
git commit -m "feat(aviation): add computeSegmentWind, remove windAtAltitude"
```

---

### Task 3 : Module `fuelCalc.ts` (TDD)

**Files:**
- Create: `src/lib/aviation/fuelCalc.ts`
- Create: `src/__tests__/aviation/fuelCalc.test.ts`

**Interfaces:**
- Produces: `computeBranchFuel(branch, fi, regime): BranchFuelResult`
- Produces: `BranchFuelResult { segmentDetails, flightTimeMin, derouteMin, extrasMin, totalTime, totalWithMargin, fuelL, fuelKg }`
- Produces: `SegmentFuelDetail { segmentId, name, role, distanceNm, gs, wca, timeMin }`

- [ ] **Step 1 : Écrire les tests**

Créer `src/__tests__/aviation/fuelCalc.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
import type { FlightBranch, FuelInputs, CruiseRegime, FlightSegment } from '../../types'

const regime: CruiseRegime = { label: '75%', speed: 120, fuelBurn: 30 }

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return {
    id: 's1', role: 'ENROUTE', name: 'Vol',
    distanceNm: 120, headingMag: 270, wind: null, notes: '',
    ...overrides,
  }
}

function makeBranch(segments: FlightSegment[]): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments, notes: '' }
}

const baseFi: FuelInputs = { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false }

describe('computeBranchFuel', () => {
  it('single ENROUTE segment no wind: flightTimeMin = distanceNm/TAS*60', () => {
    // 120nm / 120kt * 60 = 60 min
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.flightTimeMin).toBeCloseTo(60, 1)
  })

  it('headwind reduces GS and increases flight time', () => {
    // cap 270, vent du 270 à 20kt → GS=100
    // 120nm / 100kt * 60 = 72 min
    const seg = makeSegment({ wind: { directionDeg: 270, speedKt: 20 } })
    const result = computeBranchFuel(makeBranch([seg]), baseFi, regime)
    expect(result.flightTimeMin).toBeCloseTo(72, 1)
    expect(result.segmentDetails[0].gs).toBeCloseTo(100, 1)
  })

  it('null wind segment uses TAS as GS', () => {
    const result = computeBranchFuel(makeBranch([makeSegment({ wind: null })]), baseFi, regime)
    expect(result.segmentDetails[0].gs).toBe(120)
    expect(result.segmentDetails[0].wca).toBe(0)
  })

  it('ALTERNATE segment time becomes derouteMin', () => {
    // ALTERNATE: 30nm / 120kt * 60 = 15 min
    const alt = makeSegment({ id: 's2', role: 'ALTERNATE', distanceNm: 30 })
    const result = computeBranchFuel(makeBranch([makeSegment(), alt]), baseFi, regime)
    expect(result.derouteMin).toBeCloseTo(15, 1)
    expect(result.flightTimeMin).toBeCloseTo(60, 1) // ALTERNATE exclu
  })

  it('no ALTERNATE segment: derouteMin = 0', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.derouteMin).toBe(0)
  })

  it('sums multiple ENROUTE segments', () => {
    const s1 = makeSegment({ id: 's1', distanceNm: 60 })  // 30 min
    const s2 = makeSegment({ id: 's2', distanceNm: 60 })  // 30 min
    const result = computeBranchFuel(makeBranch([s1, s2]), baseFi, regime)
    expect(result.flightTimeMin).toBeCloseTo(60, 1)
  })

  it('totalTime includes roulage + reserveMin + derouteMin', () => {
    // flightTime=60, roulage=10, extras=0, reserve=30, deroute=0
    // total = 60+10+0+30+0 = 100
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.totalTime).toBeCloseTo(100, 1)
  })

  it('totalWithMargin applies marge%', () => {
    // totalTime=100, marge=10% → 110
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.totalWithMargin).toBeCloseTo(110, 1)
  })

  it('fuelL = (totalWithMargin/60) * fuelBurn', () => {
    // 110/60 * 30 = 55
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.fuelL).toBeCloseTo(55, 1)
  })

  it('fuelKg = fuelL * 0.72', () => {
    const result = computeBranchFuel(makeBranch([makeSegment()]), baseFi, regime)
    expect(result.fuelKg).toBeCloseTo(result.fuelL * 0.72, 3)
  })

  it('extras are included in totalTime', () => {
    const fi = { ...baseFi, extras: [{ id: 'e1', label: 'Évol', durationMin: 20 }] }
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    // 60+10+20+30 = 120 → *1.1 = 132
    expect(result.totalWithMargin).toBeCloseTo(132, 1)
  })

  it('reserveMin applies on every branch', () => {
    const fi = { ...baseFi, reserveMin: 45 }
    const result = computeBranchFuel(makeBranch([makeSegment()]), fi, regime)
    expect(result.totalTime).toBeCloseTo(60 + 10 + 45, 1)
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
npx vitest run src/__tests__/aviation/fuelCalc.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3 : Créer `src/lib/aviation/fuelCalc.ts`**

```typescript
import { computeSegmentWind } from './windTriangle'
import { FUEL_DENSITY_KGL } from './constants'
import type { FlightBranch, FuelInputs, CruiseRegime, FlightSegment } from '../../types'

export interface SegmentFuelDetail {
  segmentId: string
  name: string
  role: 'ENROUTE' | 'ALTERNATE'
  distanceNm: number
  gs: number
  wca: number
  timeMin: number
}

export interface BranchFuelResult {
  segmentDetails: SegmentFuelDetail[]
  flightTimeMin: number
  derouteMin: number
  extrasMin: number
  totalTime: number
  totalWithMargin: number
  fuelL: number
  fuelKg: number
}

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

export function computeBranchFuel(
  branch: FlightBranch,
  fi: FuelInputs,
  regime: CruiseRegime,
): BranchFuelResult {
  const segmentDetails = branch.segments.map(seg => computeSegmentDetail(seg, regime.speed))
  const enroute = segmentDetails.filter(s => s.role === 'ENROUTE')
  const alternate = segmentDetails.find(s => s.role === 'ALTERNATE')

  const flightTimeMin = enroute.reduce((s, d) => s + d.timeMin, 0)
  const derouteMin = alternate?.timeMin ?? 0
  const extrasMin = fi.extras.reduce((s, e) => s + e.durationMin, 0)

  const totalTime = flightTimeMin + fi.roulage + extrasMin + fi.reserveMin + derouteMin
  const totalWithMargin = totalTime * (1 + fi.marge / 100)
  const fuelL = (totalWithMargin / 60) * regime.fuelBurn
  const fuelKg = fuelL * FUEL_DENSITY_KGL

  return { segmentDetails, flightTimeMin, derouteMin, extrasMin, totalTime, totalWithMargin, fuelL, fuelKg }
}
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
npx vitest run src/__tests__/aviation/fuelCalc.test.ts
```

Expected: PASS (11 tests)

- [ ] **Step 5 : Commit**

```bash
git add src/lib/aviation/fuelCalc.ts src/__tests__/aviation/fuelCalc.test.ts
git commit -m "feat(aviation): add computeBranchFuel module with TDD"
```

---

### Task 4 : `dossierTransforms` + `DossierScreen`

**Files:**
- Modify: `src/lib/dossierTransforms.ts`
- Modify: `src/__tests__/lib/dossierTransforms.test.ts`
- Modify: `src/screens/DossierScreen.tsx`

**Interfaces:**
- Consumes: `FuelInputs` (nouvelle forme sans gsBase/windAdjust/derouteMin)
- `applyAircraftChange` préserve les autres champs fuelInputs sans plus réinitialiser gsBase/windAdjust

- [ ] **Step 1 : Mettre à jour les tests de dossierTransforms**

Remplacer `src/__tests__/lib/dossierTransforms.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { applyAircraftChange } from '../../lib/dossierTransforms'
import type { FlightDossier, Aircraft, FlightSegment } from '../../types'

const defaultSegment: FlightSegment = {
  id: 's1', role: 'ENROUTE', name: 'Vol',
  distanceNm: 0, headingMag: 0, wind: null, notes: '',
}

const oldAircraft = {
  id: 'ac-old', name: 'DR221', registration: 'F-BPCT',
  snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 116 },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [{ name: 'Pilote', arm: 300, kind: 'dry' as const }], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}

const newAircraft: Aircraft = {
  id: 'ac-new', name: 'DR42', registration: 'F-WXYZ',
  characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 25 }], fuelCapacity: 130 },
  massBalance: { emptyWeight: 700, emptyArm: 350, stations: [{ name: 'Passager', arm: 320, kind: 'dry' as const }], envelopePoints: [] },
  performance: {
    toTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[450]]] },
    ldgTable: { weights: [900], pressureAltitudes: [0], oats: [15], values: [[[520]]] },
  },
}

const baseDossier: FlightDossier = {
  id: 'd-1', name: 'Test', date: '2026-06-18', departureTime: '',
  aircraft: oldAircraft,
  branches: [
    { id: 'b1', label: 'Aller', aerodromes: [], segments: [defaultSegment], notes: '' },
    { id: 'b2', label: 'Retour', aerodromes: [], segments: [defaultSegment], notes: '' },
  ],
  weatherInputs: { fields: {}, notes: '' },
  fuelInputs: {
    'b1': { roulage: 15, marge: 10, extras: [], reserveMin: 30, plein: false },
    'b2': { roulage: 10, marge: 10, extras: [], reserveMin: 45, plein: true },
  },
  loading: { 'Pilote': 80 },
  perfRegulatory: 1.15,
  perfInputs: { 'b1': { surface: 'hard', windKt: 5 } },
  notes: 'vol test',
  createdAt: '2026-06-18T10:00:00.000Z',
  updatedAt: '2026-06-18T10:00:00.000Z',
}

describe('applyAircraftChange', () => {
  it('replaces the aircraft with a new snapshot', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.aircraft.id).toBe('ac-new')
    expect(result.aircraft.snapshotAt).toBeDefined()
  })

  it('preserves fuelInputs fields (roulage, marge, extras, reserveMin, plein)', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.fuelInputs['b1'].roulage).toBe(15)
    expect(result.fuelInputs['b1'].marge).toBe(10)
    expect(result.fuelInputs['b1'].reserveMin).toBe(30)
    expect(result.fuelInputs['b1'].plein).toBe(false)
    expect(result.fuelInputs['b2'].reserveMin).toBe(45)
    expect(result.fuelInputs['b2'].plein).toBe(true)
  })

  it('resets loading to 0 for all new aircraft stations', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.loading).toEqual({ 'Passager': 0 })
  })

  it('clears perfInputs', () => {
    expect(applyAircraftChange(baseDossier, newAircraft).perfInputs).toEqual({})
  })

  it('preserves branches, notes, perfRegulatory', () => {
    const result = applyAircraftChange(baseDossier, newAircraft)
    expect(result.branches).toBe(baseDossier.branches)
    expect(result.notes).toBe('vol test')
    expect(result.perfRegulatory).toBe(1.15)
  })

  it('updates updatedAt', () => {
    expect(applyAircraftChange(baseDossier, newAircraft).updatedAt).not.toBe(baseDossier.updatedAt)
  })
})
```

- [ ] **Step 2 : Mettre à jour `src/lib/dossierTransforms.ts`**

```typescript
import type { Aircraft, AircraftSnapshot, FlightDossier, FuelInputs } from '../types'

const DEFAULT_FUEL: FuelInputs = { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false }

export function applyAircraftChange(dossier: FlightDossier, newAircraft: Aircraft): FlightDossier {
  const snapshot: AircraftSnapshot = { ...newAircraft, snapshotAt: new Date().toISOString() }
  return {
    ...dossier,
    aircraft: snapshot,
    fuelInputs: Object.fromEntries(
      dossier.branches.map(b => [b.id, dossier.fuelInputs[b.id] ?? { ...DEFAULT_FUEL }])
    ),
    loading: Object.fromEntries(
      newAircraft.massBalance.stations.map(s => [s.name, 0])
    ),
    perfInputs: {},
    updatedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 3 : Mettre à jour `src/screens/DossierScreen.tsx`**

Remplacer la référence au `defaultFuel` dans le callback `onUpdate` de `BranchesPanel` :

```typescript
// Remplacer :
const defaultFuel: FuelInputs = { gsBase: speed, windAdjust: 0, roulage: 10, marge: 10, extras: [], reserveMin: 30, derouteMin: 30, plein: false }
// Par :
const defaultFuel: FuelInputs = { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false }
```

Et supprimer l'import de `speed` qui n'est plus utilisé :
```typescript
// Supprimer dans le callback :
const speed = dossier.aircraft.characteristics.regimes[0].speed
```

- [ ] **Step 4 : Vérifier que les tests dossierTransforms passent**

```bash
npx vitest run src/__tests__/lib/dossierTransforms.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5 : Commit**

```bash
git add src/lib/dossierTransforms.ts src/__tests__/lib/dossierTransforms.test.ts src/screens/DossierScreen.tsx
git commit -m "refactor: remove gsBase/windAdjust/derouteMin from FuelInputs init and transforms"
```

---

### Task 5 : WeatherPanel

**Files:**
- Modify: `src/features/weather/WeatherPanel.tsx`
- Modify: `src/__tests__/weather/WeatherPanel.test.tsx`

**Interfaces:**
- Consumes: `FlightBranch.aerodromes[]` (plus `.points[]`)
- `WeatherInputs` sans `winds`

- [ ] **Step 1 : Mettre à jour les tests WeatherPanel**

Remplacer `src/__tests__/weather/WeatherPanel.test.tsx` (seule la factory de branches change) :

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WeatherPanel } from '../../features/weather/WeatherPanel'
import type { FlightDossier, FlightBranch, WeatherInputs, FlightAerodrome, FlightSegment } from '../../types'

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
}

const baseWeather: WeatherInputs = { fields: {}, notes: '' }

const defaultSegment: FlightSegment = {
  id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '',
}

function makeAerodrome(identifier: string, role: FlightAerodrome['role']): FlightAerodrome {
  return { id: identifier, identifier, role }
}

function makeBranch(aerodromes: FlightAerodrome[] = []): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes, segments: [defaultSegment], notes: '' }
}

function makeDossier(branches: FlightBranch[], weather: WeatherInputs = baseWeather): FlightDossier {
  return {
    id: 'dos-1', name: 'Test', date: '2026-06-17', departureTime: '09:00',
    aircraft: {} as FlightDossier['aircraft'],
    branches, weatherInputs: weather, fuelInputs: {},
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, notes: '',
    createdAt: '2026-06-17T00:00:00Z', updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('WeatherPanel — aerodrome derivation from branches', () => {
  it('shows empty-state when branches have no aerodromes', () => {
    render(<Wrapper><WeatherPanel dossier={makeDossier([makeBranch([])])} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText(/Aucun aérodrome dans les branches/i)).toBeInTheDocument()
  })

  it('shows a DEP aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFPN', 'DEP')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFPN')).toBeInTheDocument()
  })

  it('shows an ARR aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFPO', 'ARR')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })

  it('shows an ALTERNATE aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFOB', 'ALTERNATE')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFOB')).toBeInTheDocument()
  })

  it('shows an OVERFLY aerodrome', () => {
    const dossier = makeDossier([makeBranch([makeAerodrome('LFMN', 'OVERFLY')])])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFMN')).toBeInTheDocument()
  })

  it('deduplicates the same ICAO across branches', () => {
    const dossier = makeDossier([
      makeBranch([makeAerodrome('LFPN', 'DEP')]),
      { id: 'b2', label: 'Retour', aerodromes: [makeAerodrome('LFPN', 'ARR')], segments: [defaultSegment], notes: '' },
    ])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getAllByText('LFPN')).toHaveLength(1)
  })

  it('collects aerodromes across multiple branches', () => {
    const dossier = makeDossier([
      makeBranch([makeAerodrome('LFPN', 'DEP')]),
      { id: 'b2', label: 'Retour', aerodromes: [makeAerodrome('LFPO', 'ARR')], segments: [defaultSegment], notes: '' },
    ])
    render(<Wrapper><WeatherPanel dossier={dossier} onUpdate={vi.fn()} /></Wrapper>)
    expect(screen.getByText('LFPN')).toBeInTheDocument()
    expect(screen.getByText('LFPO')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Mettre à jour `src/features/weather/WeatherPanel.tsx`**

Remplacer le fichier complet :

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FlightDossier, WeatherInputs, FieldWeather } from '../../types'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

interface Props {
  dossier: FlightDossier
  onUpdate: (weatherInputs: WeatherInputs) => void
}

export function WeatherPanel({ dossier, onUpdate }: Props) {
  const { weatherInputs } = dossier
  const [showMetar, setShowMetar] = useState(false)

  const uniqueAerodromes: string[] = [...new Set(
    dossier.branches.flatMap(b => b.aerodromes).map(a => a.identifier)
  )]

  const updateField = (icao: string, field: Partial<FieldWeather>) =>
    onUpdate({
      ...weatherInputs,
      fields: {
        ...weatherInputs.fields,
        [icao]: { ...{ qnh: 1013, temp: 15 }, ...weatherInputs.fields[icao], ...field },
      },
    })

  const icaoList = uniqueAerodromes.join(',')

  const { data: metarData, isLoading: metarLoading, error: metarError, refetch: fetchMetar } = useQuery({
    queryKey: ['metar', icaoList],
    queryFn: async () => {
      const res = await fetch(`https://aviationweather.gov/api/data/metar?ids=${icaoList}&format=raw&hours=2`)
      if (!res.ok) throw new Error(`METAR fetch failed: ${res.status}`)
      return res.text()
    },
    enabled: false,
    staleTime: 10 * 60 * 1000,
  })

  const { data: tafData, isLoading: tafLoading, error: tafError, refetch: fetchTaf } = useQuery({
    queryKey: ['taf', icaoList],
    queryFn: async () => {
      const res = await fetch(`https://aviationweather.gov/api/data/taf?ids=${icaoList}&format=raw`)
      if (!res.ok) throw new Error(`TAF fetch failed: ${res.status}`)
      return res.text()
    },
    enabled: false,
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Terrains</h2>
        {uniqueAerodromes.length === 0 ? (
          <Card padding="md" className="text-center text-[var(--text-muted)] text-sm">
            Aucun aérodrome dans les branches (onglet Branches)
          </Card>
        ) : (
          <div className="grid gap-3">
            {uniqueAerodromes.map(icao => {
              const field = weatherInputs.fields[icao] ?? { qnh: 1013, temp: 15 }
              return (
                <Card key={icao} padding="sm">
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-medium text-[var(--amber)] w-16">{icao}</span>
                    <div className="flex gap-3 flex-1">
                      <Input label="QNH (hPa)" type="number" value={field.qnh}
                        onChange={e => updateField(icao, { qnh: Number(e.target.value) })} className="w-32" />
                      <Input label="Temp (°C)" type="number" value={field.temp}
                        onChange={e => updateField(icao, { temp: Number(e.target.value) })} className="w-32" />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Notes / NOTAM</h2>
        <textarea
          value={weatherInputs.notes}
          onChange={e => onUpdate({ ...weatherInputs, notes: e.target.value })}
          placeholder="Coller vos NOTAMs, SUPAIP, SIGMETs ici..."
          className="w-full h-40 px-3 py-2 rounded text-sm font-mono text-[var(--text-1)] bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--amber)] resize-none placeholder:text-[var(--text-dim)]"
        />
      </section>

      {uniqueAerodromes.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">METAR / TAF</h2>
            <Button variant="secondary" size="sm"
              onClick={() => { setShowMetar(true); fetchMetar(); fetchTaf() }}
              disabled={metarLoading || tafLoading}>
              {(metarLoading || tafLoading) ? 'Chargement...' : 'Récupérer'}
            </Button>
          </div>
          {showMetar && (
            <Card padding="md" inset>
              {(metarError || tafError) && (
                <p className="text-[var(--red)] text-xs mb-2">Erreur METAR/TAF — vérifiez la connexion réseau</p>
              )}
              {metarData && (
                <div className="mb-4">
                  <p className="text-xs text-[var(--text-dim)] mb-1">METAR</p>
                  <pre className="text-xs font-mono text-[var(--text-2)] whitespace-pre-wrap">{metarData}</pre>
                </div>
              )}
              {tafData && (
                <div>
                  <p className="text-xs text-[var(--text-dim)] mb-1">TAF</p>
                  <pre className="text-xs font-mono text-[var(--text-2)] whitespace-pre-wrap">{tafData}</pre>
                </div>
              )}
              {!metarData && !tafData && !metarLoading && !tafLoading && (
                <p className="text-xs text-[var(--text-muted)]">Aucune donnée reçue</p>
              )}
            </Card>
          )}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3 : Vérifier que les tests passent**

```bash
npx vitest run src/__tests__/weather/WeatherPanel.test.tsx
```

Expected: PASS (7 tests)

- [ ] **Step 4 : Commit**

```bash
git add src/features/weather/WeatherPanel.tsx src/__tests__/weather/WeatherPanel.test.tsx
git commit -m "feat(weather): remove WindLayer section, derive aerodromes from branch.aerodromes"
```

---

### Task 6 : BranchesPanel (réécriture)

**Files:**
- Modify: `src/features/branches/BranchesPanel.tsx`
- Modify: `src/__tests__/branches/BranchesPanel.test.tsx`

**Interfaces:**
- Consumes: `FlightBranch.aerodromes[]`, `FlightBranch.segments[]`
- `syncAlternateSegment(branch): FlightBranch` — logique interne, non exportée

- [ ] **Step 1 : Écrire les nouveaux tests**

Remplacer `src/__tests__/branches/BranchesPanel.test.tsx` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null, Polyline: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('leaflet', () => {
  const Icon = class { constructor() {}; static Default = { prototype: { _getIconUrl: undefined }, mergeOptions: vi.fn() } }
  return { default: { Icon, icon: vi.fn() }, Icon }
})
vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-icon-2x.png', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: '' }))

const mockDb = [
  { icao: 'LFPN', name: 'Toussus-le-Noble', lat: 48.75, lng: 2.11, elevationFt: 538, runways: [], updatedAt: '' },
  { icao: 'LFPO', name: 'Paris Orly', lat: 48.72, lng: 2.37, elevationFt: 291, runways: [], updatedAt: '' },
]
vi.mock('../../lib/icao/aerodromeDb', () => ({
  getAerodromeDb: () => mockDb,
  getAerodrome: (icao: string) => mockDb.find(a => a.icao === icao),
}))

import { BranchesPanel } from '../../features/branches/BranchesPanel'
import type { AircraftSnapshot, FlightBranch, FlightSegment, FlightAerodrome } from '../../types'

const aircraftStub: AircraftSnapshot = {
  id: 'ac-1', name: 'DR221', registration: 'F-BPCT', snapshotAt: '2026-01-01T00:00:00.000Z',
  characteristics: { regimes: [{ label: '75%', speed: 108, fuelBurn: 22 }], fuelCapacity: 116 },
  massBalance: { emptyWeight: 615, emptyArm: 345, stations: [], envelopePoints: [] },
  performance: {
    toTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[440]]] },
    ldgTable: { weights: [840], pressureAltitudes: [0], oats: [15], values: [[[510]]] },
  },
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 0, headingMag: 0, wind: null, notes: '', ...overrides }
}
function makeAerodrome(identifier: string, role: FlightAerodrome['role'] = 'DEP'): FlightAerodrome {
  return { id: identifier, identifier, role }
}
function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'branch-1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}

describe('BranchesPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('rendering', () => {
    it('renders a branch tab with the branch label', () => {
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('Aller')).toBeInTheDocument()
    })

    it('renders the map', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByTestId('map')).toBeInTheDocument()
    })

    it('shows empty-state when branch has no aerodromes', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Aucun aérodrome/i)).toBeInTheDocument()
    })

    it('renders an aerodrome when branch has one', () => {
      const branch = makeBranch({ aerodromes: [makeAerodrome('LFPN', 'DEP')] })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('LFPN')).toBeInTheDocument()
    })

    it('shows the segment name', () => {
      const branch = makeBranch({ segments: [makeSegment({ name: 'Toussus-Granville' })] })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue('Toussus-Granville')).toBeInTheDocument()
    })

    it('does not show Supprimer vol when there is only one branch', () => {
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.queryByText(/Supprimer vol/i)).not.toBeInTheDocument()
    })

    it('shows Supprimer vol with multiple branches', () => {
      const branches = [makeBranch({ id: 'b1' }), makeBranch({ id: 'b2', label: 'Retour' })]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText(/Supprimer vol/i)).toBeInTheDocument()
    })
  })

  describe('distance totale', () => {
    it('shows sum of segment distances', () => {
      const segments = [
        makeSegment({ id: 's1', distanceNm: 60 }),
        makeSegment({ id: 's2', distanceNm: 48 }),
      ]
      render(<BranchesPanel branches={[makeBranch({ segments })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      expect(screen.getByText('108')).toBeInTheDocument()
    })
  })

  describe('adding a branch', () => {
    it('calls onUpdate with a new branch containing a default ENROUTE segment', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText('+'))
      expect(onUpdate).toHaveBeenCalledOnce()
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated).toHaveLength(2)
      expect(updated[1].segments).toHaveLength(1)
      expect(updated[1].segments[0].role).toBe('ENROUTE')
    })
  })

  describe('deleting a branch', () => {
    it('removes a branch when Supprimer vol is clicked', async () => {
      const onUpdate = vi.fn()
      const branches = [makeBranch({ id: 'b1' }), makeBranch({ id: 'b2', label: 'Retour' })]
      render(<BranchesPanel branches={branches} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText(/Supprimer vol/i))
      expect(onUpdate.mock.calls[0][0]).toHaveLength(1)
    })
  })

  describe('segment management', () => {
    it('adds a segment when "+ Segment" is clicked', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText(/\+ Segment/i))
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments).toHaveLength(2)
    })

    it('cannot remove the last ENROUTE segment', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      // Delete button for the only segment should be disabled or absent
      const deleteButtons = screen.queryAllByRole('button', { name: /supprimer segment/i })
      if (deleteButtons.length > 0) {
        expect(deleteButtons[0]).toBeDisabled()
      } else {
        expect(deleteButtons).toHaveLength(0)
      }
    })

    it('can remove a segment when there are multiple ENROUTE segments', async () => {
      const onUpdate = vi.fn()
      const segments = [makeSegment({ id: 's1' }), makeSegment({ id: 's2', name: 'Leg 2' })]
      render(<BranchesPanel branches={[makeBranch({ segments })]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      const deleteButtons = screen.getAllByRole('button', { name: /supprimer segment/i })
      await userEvent.click(deleteButtons[0])
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments).toHaveLength(1)
    })
  })

  describe('ALTERNATE segment auto-management', () => {
    it('auto-creates ALTERNATE segment when ALTERNATE aerodrome is added', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch()]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByText(/\+ Aérodrome/i))
      // Select ALTERNATE role then add LFOB
      await userEvent.click(screen.getByText('ALT'))
      await userEvent.type(screen.getByPlaceholderText(/ICAO ou nom/i), 'LFPN')
      await userEvent.click(screen.getByText('LFPN'))
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments.some(s => s.role === 'ALTERNATE')).toBe(true)
    })

    it('auto-removes ALTERNATE segment when last ALTERNATE aerodrome is removed', async () => {
      const onUpdate = vi.fn()
      const altAero = makeAerodrome('LFOB', 'ALTERNATE')
      const altSeg = makeSegment({ id: 'alt', role: 'ALTERNATE', name: 'Déroutement' })
      const branch = makeBranch({ aerodromes: [altAero], segments: [makeSegment(), altSeg] })
      render(<BranchesPanel branches={[branch]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      // Click the ✕ on the ALTERNATE aerodrome
      const deleteButtons = screen.getAllByRole('button', { name: /supprimer aérodrome/i })
      await userEvent.click(deleteButtons[0])
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].segments.every(s => s.role !== 'ALTERNATE')).toBe(true)
    })
  })

  describe('label editing', () => {
    it('shows input on double-click', async () => {
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={vi.fn()} />)
      await userEvent.dblClick(screen.getByText('Aller'))
      expect(screen.getByDisplayValue('Aller')).toBeInTheDocument()
    })

    it('calls onUpdate with new label on blur', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ label: 'Aller' })]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      await userEvent.dblClick(screen.getByText('Aller'))
      const input = screen.getByDisplayValue('Aller')
      await userEvent.clear(input)
      await userEvent.type(input, 'Retour')
      fireEvent.blur(input)
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].label).toBe('Retour')
    })
  })

  describe('branch notes', () => {
    it('calls onUpdate with updated notes', async () => {
      const onUpdate = vi.fn()
      render(<BranchesPanel branches={[makeBranch({ notes: '' })]} aircraft={aircraftStub} onUpdate={onUpdate} />)
      fireEvent.change(screen.getByPlaceholderText(/Commentaires libres/i), { target: { value: 'Test note' } })
      const updated: FlightBranch[] = onUpdate.mock.calls[0][0]
      expect(updated[0].notes).toBe('Test note')
    })
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
npx vitest run src/__tests__/branches/BranchesPanel.test.tsx
```

Expected: FAIL (le composant utilise encore l'ancien modèle)

- [ ] **Step 3 : Réécrire `src/features/branches/BranchesPanel.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import type { AircraftSnapshot, FlightBranch, FlightAerodrome, FlightSegment } from '../../types'
import { computeSegmentWind } from '../../lib/aviation/windTriangle'
import { getAerodromeDb, getAerodrome } from '../../lib/icao/aerodromeDb'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'

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

function syncAlternateSegment(branch: FlightBranch): FlightBranch {
  const hasAlternate = branch.aerodromes.some(a => a.role === 'ALTERNATE')
  const hasAltSeg = branch.segments.some(s => s.role === 'ALTERNATE')
  if (hasAlternate && !hasAltSeg) {
    const altSeg: FlightSegment = {
      id: crypto.randomUUID(), role: 'ALTERNATE',
      name: 'Déroutement', distanceNm: 0, headingMag: 0, wind: null, notes: '',
    }
    return { ...branch, segments: [...branch.segments, altSeg] }
  }
  if (!hasAlternate && hasAltSeg) {
    return { ...branch, segments: branch.segments.filter(s => s.role !== 'ALTERNATE') }
  }
  return branch
}

interface AddAerodromeModalProps {
  onAdd: (a: Omit<FlightAerodrome, 'id'>) => void
  onClose: () => void
}

function AddAerodromeModal({ onAdd, onClose }: AddAerodromeModalProps) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AeroRole>('OVERFLY')
  const [freeMode, setFreeMode] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const db = useMemo(() => getAerodromeDb(), [])
  const suggestions = useMemo(() => {
    if (query.length < 1) return []
    const q = query.toUpperCase()
    return db.filter(a => a.icao.startsWith(q) || a.name.toUpperCase().includes(q)).slice(0, 8)
  }, [query, db])

  const submit = (icao?: string) => {
    const id_val = icao ?? identifier.toUpperCase()
    if (!id_val) return
    onAdd({ identifier: id_val, role })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-lg p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">Ajouter un aérodrome</h3>
        <div className="flex gap-1 mb-3">
          {ROLE_CYCLE.map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                role === r ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/10'
                           : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        {!freeMode ? (
          <>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ICAO ou nom..."
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2" />
            {suggestions.map(a => (
              <button key={a.icao} onClick={() => submit(a.icao)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-inset)] rounded flex gap-2">
                <span className="font-mono text-[var(--amber)]">{a.icao}</span>
                <span className="text-[var(--text-2)] truncate">{a.name}</span>
              </button>
            ))}
            <button onClick={() => setFreeMode(true)} className="mt-2 text-xs text-[var(--text-dim)] underline">
              Identifiant libre
            </button>
          </>
        ) : (
          <>
            <input autoFocus value={identifier} onChange={e => setIdentifier(e.target.value.toUpperCase())}
              placeholder="Identifiant (ex: LFXX)"
              className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-1.5 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none mb-2" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => submit()}>Ajouter</Button>
              <Button variant="ghost" size="sm" onClick={() => setFreeMode(false)}>Retour</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface SegmentCardProps {
  segment: FlightSegment
  tas: number
  isLastEnroute: boolean
  onRemove: () => void
  onChange: (seg: FlightSegment) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function SegmentCard({ segment, tas, isLastEnroute, onRemove, onChange, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: SegmentCardProps) {
  const isAlternate = segment.role === 'ALTERNATE'
  const wind = segment.wind
    ? computeSegmentWind(segment.headingMag, tas, segment.wind.directionDeg, segment.wind.speedKt)
    : { gs: tas, wca: 0 }

  return (
    <Card padding="sm" className={isAlternate ? 'border-[var(--amber)]/50 bg-[var(--amber)]/5' : ''}>
      <div className="flex items-center gap-2 mb-2">
        {isAlternate && <Badge variant="warning">ALT</Badge>}
        <input value={segment.name} onChange={e => onChange({ ...segment, name: e.target.value })}
          placeholder="Nom du segment"
          className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--border)] focus:border-[var(--amber)] focus:outline-none text-[var(--text-1)]" />
        {!isAlternate && (
          <div className="flex gap-1">
            <button onClick={onMoveUp} disabled={!canMoveUp}
              className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1">↑</button>
            <button onClick={onMoveDown} disabled={!canMoveDown}
              className="text-[var(--text-dim)] hover:text-[var(--text-1)] disabled:opacity-30 px-1">↓</button>
          </div>
        )}
        <button
          onClick={onRemove}
          disabled={isAlternate || isLastEnroute}
          aria-label="Supprimer segment"
          className="text-[var(--text-dim)] hover:text-[var(--red)] disabled:opacity-30 text-sm px-1">✕</button>
      </div>
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
        <span>GS: <span className={`font-mono ${wind.gs < 0 ? 'text-[var(--red)]' : 'text-[var(--text-2)]'}`}>{wind.gs.toFixed(0)} kt</span></span>
        <span>WCA: <span className="font-mono text-[var(--text-2)]">{wind.wca > 0 ? '+' : ''}{wind.wca.toFixed(1)}°</span></span>
      </div>
      <input value={segment.notes} onChange={e => onChange({ ...segment, notes: e.target.value })}
        placeholder="Notes..."
        className="mt-2 w-full text-xs bg-[var(--bg-inset)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text-2)] focus:border-[var(--amber)] focus:outline-none" />
    </Card>
  )
}

interface BranchViewProps {
  branch: FlightBranch
  isOnly: boolean
  speedKt: number
  onChange: (branch: FlightBranch) => void
  onDelete: () => void
}

function BranchView({ branch, isOnly, speedKt, onChange, onDelete }: BranchViewProps) {
  const [showAddAero, setShowAddAero] = useState(false)

  const resolved = useMemo(() =>
    branch.aerodromes.map(a => ({ a, aero: getAerodrome(a.identifier) }))
  , [branch.aerodromes])

  const positions: [number, number][] = resolved.filter(r => r.aero).map(r => [r.aero!.lat, r.aero!.lng])
  const center: [number, number] = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length, positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [46.5, 2.5]

  const totalDistNm = branch.segments.reduce((s, seg) => s + seg.distanceNm, 0)

  const enrouteSegments = branch.segments.filter(s => s.role === 'ENROUTE')
  const alternateSegment = branch.segments.find(s => s.role === 'ALTERNATE')

  const addAerodrome = (a: Omit<FlightAerodrome, 'id'>) => {
    const updated = { ...branch, aerodromes: [...branch.aerodromes, { ...a, id: crypto.randomUUID() }] }
    onChange(syncAlternateSegment(updated))
  }

  const removeAerodrome = (id: string) => {
    const updated = { ...branch, aerodromes: branch.aerodromes.filter(a => a.id !== id) }
    onChange(syncAlternateSegment(updated))
  }

  const cycleAerodromeRole = (id: string) => {
    const updated = {
      ...branch,
      aerodromes: branch.aerodromes.map(a =>
        a.id === id ? { ...a, role: ROLE_CYCLE[(ROLE_CYCLE.indexOf(a.role) + 1) % ROLE_CYCLE.length] } : a
      ),
    }
    onChange(syncAlternateSegment(updated))
  }

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

  const updateSegment = (seg: FlightSegment) =>
    onChange({ ...branch, segments: branch.segments.map(s => s.id === seg.id ? seg : s) })

  return (
    <div className="flex flex-col h-full">
      <div className="h-48 flex-shrink-0">
        <MapContainer center={center} zoom={7} className="h-full w-full" style={{ backgroundColor: '#0e1217' }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd" maxZoom={19} />
          {positions.length >= 2 && <Polyline positions={positions} color="#f0a93b" weight={2} opacity={0.7} />}
          {resolved.filter(r => r.aero).map(({ a, aero }) => (
            <Marker key={a.id} position={[aero!.lat, aero!.lng]} icon={ROLE_ICONS[a.role]}>
              <Popup>{ROLE_LABELS[a.role]} — {a.identifier} — {aero!.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] flex items-center gap-3">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Distance totale</span>
        <span className="font-mono text-sm text-[var(--text-1)]">{totalDistNm} nm</span>
        {!isOnly && (
          <Button variant="danger" size="sm" className="ml-auto" onClick={onDelete}>Supprimer vol</Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Aérodromes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Aérodromes</p>
            <Button variant="ghost" size="sm" onClick={() => setShowAddAero(true)}>+ Aérodrome</Button>
          </div>
          {branch.aerodromes.length === 0 && (
            <p className="text-[var(--text-muted)] text-sm text-center py-2">Aucun aérodrome</p>
          )}
          {resolved.map(({ a, aero }) => (
            <Card key={a.id} padding="sm" className="mb-2">
              <div className="flex gap-3 items-center">
                <Badge variant="neutral"
                  style={{ backgroundColor: ROLE_COLORS[a.role], color: 'white', minWidth: '3rem', textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => cycleAerodromeRole(a.id)}>
                  {ROLE_LABELS[a.role]}
                </Badge>
                <span className="font-mono text-[var(--amber)] text-sm">{a.identifier}</span>
                <span className="flex-1 text-sm text-[var(--text-2)] truncate">
                  {aero ? aero.name : <span className="text-[var(--text-dim)]">custom</span>}
                </span>
                <button onClick={() => removeAerodrome(a.id)} aria-label="Supprimer aérodrome"
                  className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm px-1">✕</button>
              </div>
            </Card>
          ))}
        </div>

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

        {/* Notes */}
        <div>
          <label className="text-xs text-[var(--text-dim)] uppercase tracking-wider block mb-1">Notes</label>
          <textarea value={branch.notes} onChange={e => onChange({ ...branch, notes: e.target.value })}
            rows={3} placeholder="Commentaires libres sur ce tronçon..."
            className="w-full text-sm bg-[var(--bg-inset)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-1)] focus:border-[var(--amber)] focus:outline-none resize-none" />
        </div>
      </div>

      {showAddAero && <AddAerodromeModal onAdd={addAerodrome} onClose={() => setShowAddAero(false)} />}
    </div>
  )
}

interface Props {
  branches: FlightBranch[]
  aircraft: AircraftSnapshot
  onUpdate: (branches: FlightBranch[]) => void
}

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
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-[var(--border)] bg-[var(--bg-chrome)] overflow-x-auto">
        {branches.map(b => (
          <div key={b.id}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-t text-sm cursor-pointer select-none transition-colors ${
              b.id === activeId
                ? 'bg-[var(--bg-card)] text-[var(--text-1)] border border-b-0 border-[var(--border)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-1)]'
            }`}
            onClick={() => setActiveId(b.id)}>
            {editingLabel === b.id ? (
              <input autoFocus defaultValue={b.label}
                className="w-20 bg-transparent border-b border-[var(--amber)] text-xs focus:outline-none"
                onBlur={e => { updateBranch({ ...b, label: e.target.value || b.label }); setEditingLabel(null) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingLabel(null) }}
                onClick={e => e.stopPropagation()} />
            ) : (
              <span onDoubleClick={() => setEditingLabel(b.id)}>{b.label}</span>
            )}
          </div>
        ))}
        <button onClick={addBranch}
          className="px-2 py-1 text-sm text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors">+</button>
      </div>
      {activeBranch && (
        <BranchView branch={activeBranch} isOnly={branches.length === 1}
          speedKt={speedKt} onChange={updateBranch} onDelete={() => deleteBranch(activeBranch.id)} />
      )}
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/__tests__/branches/BranchesPanel.test.tsx
```

Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add src/features/branches/BranchesPanel.tsx src/__tests__/branches/BranchesPanel.test.tsx
git commit -m "feat(branches): replace FlightPoint with aerodromes+segments, add per-segment wind display"
```

---

### Task 7 : FuelPanel (réécriture)

**Files:**
- Modify: `src/features/fuel/FuelPanel.tsx`
- Modify: `src/__tests__/fuel/FuelPanel.test.tsx`

**Interfaces:**
- Consumes: `computeBranchFuel` from `src/lib/aviation/fuelCalc.ts`
- `FuelInputs` sans `gsBase`/`windAdjust`/`derouteMin`
- Reserve et déroutement sur **chaque** branche

- [ ] **Step 1 : Écrire les nouveaux tests**

Remplacer `src/__tests__/fuel/FuelPanel.test.tsx` :

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FuelPanel } from '../../features/fuel/FuelPanel'
import type { FlightDossier, FlightBranch, FuelInputs, FlightSegment } from '../../types'

function makeAircraft() {
  return {
    id: 'ac-1', name: 'DR400', registration: 'F-GABC', snapshotAt: '2026-06-17T00:00:00Z',
    characteristics: { regimes: [{ label: '75%', speed: 120, fuelBurn: 30 }], fuelCapacity: 110 },
    massBalance: { emptyWeight: 600, emptyArm: 800, stations: [], envelopePoints: [[600, 800], [900, 800], [900, 1000], [600, 1000]] as [number, number][] },
    performance: {
      toTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
      ldgTable: { weights: [750], pressureAltitudes: [0], oats: [15], values: [[[300]]] },
    },
  }
}

function makeSegment(overrides: Partial<FlightSegment> = {}): FlightSegment {
  return { id: 's1', role: 'ENROUTE', name: 'Vol', distanceNm: 120, headingMag: 270, wind: null, notes: '', ...overrides }
}

function makeBranch(overrides: Partial<FlightBranch> = {}): FlightBranch {
  return { id: 'b1', label: 'Aller', aerodromes: [], segments: [makeSegment()], notes: '', ...overrides }
}

function makeFuelInputs(overrides: Partial<FuelInputs> = {}): FuelInputs {
  return { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false, ...overrides }
}

function makeDossier(branches: FlightBranch[], fuelInputs: Record<string, FuelInputs> = {}): FlightDossier {
  return {
    id: 'dos-1', name: 'Test', date: '2026-06-17', departureTime: '09:00',
    aircraft: makeAircraft() as FlightDossier['aircraft'],
    branches, weatherInputs: { fields: {}, notes: '' }, fuelInputs,
    loading: {}, perfRegulatory: 1.0, perfInputs: {}, notes: '',
    createdAt: '2026-06-17T00:00:00Z', updatedAt: '2026-06-17T00:00:00Z',
  }
}

describe('FuelPanel', () => {
  describe('single branch', () => {
    it('shows Réserve input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
    })

    it('does not show gsBase or windAdjust inputs', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.queryByLabelText(/GS de base/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Ajust vent/i)).not.toBeInTheDocument()
    })

    it('does not show manual derouteMin input', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      expect(screen.queryByLabelText(/Déroutement \(min\)/i)).not.toBeInTheDocument()
    })

    it('shows per-segment breakdown with GS and time', () => {
      const dossier = makeDossier([makeBranch()], { b1: makeFuelInputs() })
      render(<FuelPanel dossier={dossier} onUpdate={vi.fn()} />)
      // Segment named 'Vol' should appear in results
      expect(screen.getByText('Vol')).toBeInTheDocument()
    })
  })

  describe('multiple branches — tab bar', () => {
    function makeTwo() {
      const b1 = makeBranch({ id: 'b1', label: 'Aller' })
      const b2 = makeBranch({ id: 'b2', label: 'Retour', segments: [makeSegment({ id: 's2', distanceNm: 80 })] })
      return { b1, b2, dossier: makeDossier([b1, b2], { b1: makeFuelInputs(), b2: makeFuelInputs() }) }
    }

    it('renders a tab button for each branch', () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Aller' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retour' })).toBeInTheDocument()
    })

    it('shows Réserve on first branch (not just last)', () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} />)
      // First branch (Aller) is active by default
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
    })

    it('shows Réserve on second branch too', async () => {
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      expect(screen.getByLabelText(/Réserve/i)).toBeInTheDocument()
    })

    it('calls onUpdate with correct branch key', async () => {
      const onUpdate = vi.fn()
      render(<FuelPanel dossier={makeTwo().dossier} onUpdate={onUpdate} />)
      await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
      const roulageInput = screen.getByLabelText(/Roulage/i)
      await userEvent.clear(roulageInput)
      await userEvent.type(roulageInput, '15')
      const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0] as Record<string, FuelInputs>
      expect(lastCall).toHaveProperty('b2')
    })
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
npx vitest run src/__tests__/fuel/FuelPanel.test.tsx
```

Expected: FAIL

- [ ] **Step 3 : Réécrire `src/features/fuel/FuelPanel.tsx`**

```typescript
import { useMemo, useState } from 'react'
import type { FlightDossier, FuelInputs, FuelExtra } from '../../types'
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
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
  const fuelCapacity = aircraft.characteristics.fuelCapacity

  const fmtTime = (min: number) => {
    if (!isFinite(min)) return '∞'
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return `${h}h${String(m).padStart(2, '0')}`
  }

  const DEFAULT_FI: FuelInputs = { roulage: 10, marge: 10, extras: [], reserveMin: 30, plein: false }

  const totalFuelL = useMemo(() =>
    branches.reduce((sum, branch) => {
      const fi = fuelInputs[branch.id] ?? DEFAULT_FI
      return sum + computeBranchFuel(branch, fi, regime).fuelL
    }, 0)
  , [branches, fuelInputs, regime])

  const [activeBranchId, setActiveBranchId] = useState(() => branches[0]?.id ?? '')
  const validId = branches.some(b => b.id === activeBranchId) ? activeBranchId : (branches[0]?.id ?? '')
  const activeBranch = branches.find(b => b.id === validId)
  const fi: FuelInputs = fuelInputs[validId] ?? DEFAULT_FI
  const result = activeBranch ? computeBranchFuel(activeBranch, fi, regime) : null

  const fuelMinKg = (result?.fuelL ?? 0) * FUEL_DENSITY_KGL
  const autonomyMin = (fuelCapacity / regime.fuelBurn) * 60
  const insufficient = totalFuelL > fuelCapacity
  const tight = !insufficient && totalFuelL > fuelCapacity * 0.9
  const statusVariant = insufficient ? 'error' : tight ? 'warning' : 'success'

  const update = (partial: Partial<FuelInputs>) =>
    onUpdate({ ...fuelInputs, [validId]: { ...fi, ...partial } })

  const addExtra = () => update({ extras: [...fi.extras, { id: crypto.randomUUID(), label: '', durationMin: 15 }] })
  const removeExtra = (id: string) => update({ extras: fi.extras.filter(e => e.id !== id) })
  const updateExtra = (id: string, changes: Partial<FuelExtra>) =>
    update({ extras: fi.extras.map(e => e.id === id ? { ...e, ...changes } : e) })

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {branches.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-(--border)">
          {branches.map(b => (
            <button key={b.id} onClick={() => setActiveBranchId(b.id)}
              className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                b.id === validId ? 'border-(--amber) text-(--text-1)' : 'border-transparent text-(--text-muted) hover:text-(--text-1)'
              }`}>
              {b.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Paramètres — {activeBranch?.label ?? ''}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Roulage (min)" type="number" value={fi.roulage}
              onChange={e => update({ roulage: Number(e.target.value) })} />
            <Input label="Marge (%)" type="number" value={fi.marge}
              onChange={e => update({ marge: Number(e.target.value) })} />
            <Input label="Réserve (min)" type="number" value={fi.reserveMin}
              onChange={e => update({ reserveMin: Number(e.target.value) })} />
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
                <button onClick={() => removeExtra(extra.id)} className="text-[var(--text-dim)] hover:text-[var(--red)] text-sm">✕</button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addExtra}>+ Ajouter phase</Button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fi.plein} onChange={e => update({ plein: e.target.checked })}
              className="accent-[var(--amber)] w-4 h-4" />
            <span className="text-sm text-[var(--text-2)]">Plein complet prévu ({fuelCapacity} L)</span>
          </label>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">Résultats</h2>
            <Badge variant={statusVariant}>{insufficient ? 'INSUFFISANT' : tight ? 'ATTENTION' : 'OK'}</Badge>
          </div>
          {result && (
            <Card padding="md" inset>
              <dl className="space-y-1 text-sm">
                {/* Per-segment detail */}
                {result.segmentDetails.map(d => (
                  <div key={d.segmentId} className="flex justify-between text-xs">
                    <dt className="text-[var(--text-muted)]">
                      {d.role === 'ALTERNATE' ? '↳ Déroutement' : d.name || 'Segment'}
                      {d.gs < 0 && <span className="text-[var(--red)] ml-1">⚠ GS négative</span>}
                    </dt>
                    <dd className="font-mono text-[var(--text-2)]">{fmtTime(d.timeMin)}</dd>
                  </div>
                ))}
                <div className="border-t border-[var(--border)] pt-1 mt-1" />
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Vol</dt>
                  <dd className="font-mono text-[var(--text-1)]">{fmtTime(result.flightTimeMin)}</dd>
                </div>
                {result.derouteMin > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Déroutement</dt>
                    <dd className="font-mono text-[var(--text-1)]">{fmtTime(result.derouteMin)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Roulage</dt>
                  <dd className="font-mono text-[var(--text-2)]">{fmtTime(fi.roulage)}</dd>
                </div>
                {result.extrasMin > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Phases supp.</dt>
                    <dd className="font-mono text-[var(--text-2)]">{fmtTime(result.extrasMin)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Réserve</dt>
                  <dd className="font-mono text-[var(--text-2)]">{fmtTime(fi.reserveMin)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Total avec marge {fi.marge}%</dt>
                  <dd className="font-mono text-[var(--text-1)]">{fmtTime(result.totalWithMargin)}</dd>
                </div>
                <hr className="border-[var(--border)]" />
                <div className="flex justify-between font-semibold">
                  <dt className="text-[var(--text-muted)]">Carbu min</dt>
                  <dd className="font-mono text-[var(--text-1)]">
                    {result.fuelL.toFixed(1)} L <span className="text-[var(--text-dim)] ml-2">/ {fuelMinKg.toFixed(1)} kg</span>
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
                  <dd className="font-mono text-[var(--text-dim)]">{regime.fuelBurn} L/h</dd>
                </div>
              </dl>
            </Card>
          )}
          {insufficient && (
            <Card padding="sm">
              <p className="text-(--red) text-sm font-medium">
                Carburant insuffisant — prévoir {(totalFuelL - fuelCapacity).toFixed(1)} L supplémentaires ou réduire les marges.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/__tests__/fuel/FuelPanel.test.tsx
```

Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add src/features/fuel/FuelPanel.tsx src/__tests__/fuel/FuelPanel.test.tsx
git commit -m "feat(fuel): per-segment wind calculation, remove gsBase/windAdjust/derouteMin, reserve on all branches"
```

---

### Task 8 : DossierPanel

**Files:**
- Modify: `src/features/dossier/DossierPanel.tsx`

**Interfaces:**
- Consumes: `computeBranchFuel` from `src/lib/aviation/fuelCalc.ts`

- [ ] **Step 1 : Mettre à jour `src/features/dossier/DossierPanel.tsx`**

Ajouter l'import :
```typescript
import { computeBranchFuel } from '../../lib/aviation/fuelCalc'
```

Remplacer le calcul de `totalDistNm` :
```typescript
// Remplacer :
const totalDistNm = branches.reduce((s, b) => s + b.distanceNm, 0)
// Par :
const totalDistNm = branches.reduce((s, b) => s + b.segments.reduce((ss, seg) => ss + seg.distanceNm, 0), 0)
```

Dans le `<tbody>` de la table "Branches de vol", remplacer le bloc de calcul fuel et d'affichage des points :

```typescript
// Remplacer le bloc fuelMinL et points :
{branches.map(branch => {
  const fi = fuelInputs[branch.id]
  const fuelResult = fi ? computeBranchFuel(branch, fi, regime) : null
  const fuelMinL = fuelResult?.fuelL ?? null
  const distNm = branch.segments.reduce((s, seg) => s + seg.distanceNm, 0)
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
```

Dans la section "Carburant par branche", remplacer la logique inline par `computeBranchFuel` :

```typescript
// Remplacer les calculs gsKt/flightMin/totalMin/fuelMinL inline par :
{branches.map(branch => {
  const fi = fuelInputs[branch.id]
  if (!fi) return (
    <div key={branch.id} className="flex justify-between">
      <dt className="text-[var(--text-muted)]">{branch.label}</dt>
      <dd className="font-mono text-[var(--text-dim)]">—</dd>
    </div>
  )
  const { fuelL, fuelKg } = computeBranchFuel(branch, fi, regime)
  return (
    <div key={branch.id} className="border-b border-[var(--border)]/30 pb-1">
      <div className="flex justify-between font-medium">
        <dt className="text-[var(--text-1)]">{branch.label}</dt>
        <dd className="font-mono">{fuelL.toFixed(1)} L</dd>
      </div>
      <div className="flex justify-between text-[var(--text-dim)]">
        <dt>Plein {fi.plein ? '✓' : '✗'} · Réserve {fmtTime(fi.reserveMin)}</dt>
        <dd className="font-mono">{fuelKg.toFixed(1)} kg</dd>
      </div>
    </div>
  )
})}
```

- [ ] **Step 2 : Vérifier que la suite de tests complète passe**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 3 : Commit**

```bash
git add src/features/dossier/DossierPanel.tsx
git commit -m "feat(dossier): use computeBranchFuel in summary, derive distNm from segments"
```

---

### Self-Review

**Spec coverage check:**

| Exigence spec | Tâche |
|---|---|
| FlightPoint/WindLayer supprimés | Task 1 |
| FlightAerodrome + FlightSegment nouveaux types | Task 1 |
| FuelInputs sans gsBase/windAdjust/derouteMin | Task 1, 4 |
| WeatherInputs sans winds | Task 1, 5 |
| computeSegmentWind (°M, GS non bornée, WCA affiché) | Task 2 |
| computeBranchFuel par segment | Task 3 |
| reserveMin sur toutes les branches | Task 3, 7 |
| ALTERNATE segment auto-créé/supprimé | Task 6 |
| Dernier segment ENROUTE protégé | Task 6 |
| Segment par défaut "Vol" à la création | Task 6 |
| Max 1 segment ALTERNATE | Task 6 |
| WeatherPanel sans vents par altitude | Task 5 |
| BranchesPanel aérodromes + segments | Task 6 |
| FuelPanel détail par segment | Task 7 |
| DossierPanel distance = Σ segments | Task 8 |
