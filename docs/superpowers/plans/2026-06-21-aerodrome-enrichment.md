# Aerodrome Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir `resources/aerodromes.json` avec ~1 190 terrains français (coords exactes, altitude, pistes, fréquences radio) via un script de génération `scripts/build-aerodromes.mjs` qui fetch les CSV OurAirports.

**Architecture:** Un script Node.js ESM standalone (`scripts/build-aerodromes.mjs`) télécharge 3 CSV OurAirports, filtre la France, mappe les données vers le type `StoredAerodrome` étendu, et écrase `resources/aerodromes.json`. Le JSON résultant est la source de vérité commitée dans le repo — l'app ne contacte jamais OurAirports à l'exécution.

**Tech Stack:** Node.js (ESM), `fetch` natif (Node 18+), `fs.writeFileSync`, Vitest pour les tests du parseur CSV.

## Global Constraints

- Script ESM pur `.mjs`, zéro dépendance supplémentaire
- Code ICAO = clé d'unicité (champ `icao` de `StoredAerodrome`)
- Filtres : `iso_country = FR`, types `large_airport | medium_airport | small_airport`
- Cap magnétique dérivé de l'identifiant de piste : `headingMag = parseInt(ident) * 10`
- Surface `'hard'` si le champ OurAirports contient ASPH, CONC, TARMAC, PAVED, MACADAM, BRICK, ASPHALT, CONCRETE ; sinon `'grass'`
- `elevationFt = 0` si absent ou non parseable
- Pistes fermées (`closed = 1`) ignorées
- Entrées sans code ICAO ignorées

---

## File Map

| Fichier | Action | Rôle |
|---|---|---|
| `src/types/index.ts` | Modifier | Ajouter `FrequencyInfo`, étendre `StoredAerodrome` |
| `scripts/build-aerodromes.mjs` | Créer | Script complet de génération |
| `package.json` | Modifier | Ajouter script `build:aerodromes` |
| `resources/aerodromes.json` | Généré | Output du script (ne pas modifier à la main) |
| `src/__tests__/icao/aerodromeDb.test.ts` | Vérifier | Doit continuer à passer (champ `frequencies` optionnel) |

---

## Task 1: Étendre `StoredAerodrome` avec `FrequencyInfo`

**Files:**
- Modify: `src/types/index.ts` (section `// ── Base aérodromes`, lignes 61–79)

**Interfaces:**
- Produces: `FrequencyInfo`, `StoredAerodrome.frequencies?`

- [ ] **Step 1 : Ajouter `FrequencyInfo` et étendre `StoredAerodrome`**

Dans `src/types/index.ts`, après l'interface `RunwayInfo` (ligne 69), insérer l'interface `FrequencyInfo` et ajouter le champ `frequencies?` à `StoredAerodrome` :

```ts
// Remplacer la section "Base aérodromes" par :

export interface RunwayInfo {
  ident: string            // texte libre: "27", "09G", "27 herbe"
  headingMag: number       // QFU — orientation magnétique de la piste
  lengthFt: number
  toda?: number            // m, optionnel
  lda?: number             // m, optionnel
  surface: 'hard' | 'grass'
}

export interface FrequencyInfo {
  type: string             // ex : "TWR", "AFIS", "ATIS", "APP"
  description: string
  frequencyMhz: number
}

export interface StoredAerodrome {
  icao: string
  name: string
  lat: number
  lng: number
  elevationFt: number
  runways: RunwayInfo[]
  frequencies?: FrequencyInfo[]
  updatedAt: string        // ISO 8601
}
```

- [ ] **Step 2 : Vérifier que TypeScript compile sans erreur**

```bash
npx tsc --noEmit
```

Expected: aucune erreur. Le champ `frequencies?` est optionnel, donc tous les objets `StoredAerodrome` existants sans ce champ restent valides.

- [ ] **Step 3 : Vérifier que les tests existants passent**

```bash
npm test -- --run src/__tests__/icao/aerodromeDb.test.ts
```

Expected: tous les tests passent (les fixtures de test ne fournissent pas `frequencies`, ce qui est correct pour un champ optionnel).

- [ ] **Step 4 : Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add FrequencyInfo and frequencies field to StoredAerodrome"
```

---

## Task 2: Créer `scripts/build-aerodromes.mjs`

**Files:**
- Create: `scripts/build-aerodromes.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `FrequencyInfo`, `RunwayInfo`, `StoredAerodrome` (définis en Task 1, mais le script est `.mjs` et n'importe pas TypeScript — les types sont documentés en commentaire JSDoc)
- Produces: `resources/aerodromes.json`

- [ ] **Step 1 : Créer `scripts/build-aerodromes.mjs`**

Créer le fichier avec le contenu complet ci-dessous :

```js
#!/usr/bin/env node
// scripts/build-aerodromes.mjs
// Génère resources/aerodromes.json depuis les CSV OurAirports.
// Usage : node scripts/build-aerodromes.mjs

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const AIRPORTS_URL    = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const RUNWAYS_URL     = 'https://davidmegginson.github.io/ourairports-data/runways.csv'
const FREQUENCIES_URL = 'https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv'

const ALLOWED_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport'])

const HARD_KEYWORDS = [
  'ASPH', 'ASPHALT', 'CONC', 'CONCRETE', 'TARMAC',
  'PAVED', 'MACADAM', 'BRICK',
]

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? '').trim()]))
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifySurface(surface) {
  const up = (surface ?? '').toUpperCase()
  return HARD_KEYWORDS.some(k => up.includes(k)) ? 'hard' : 'grass'
}

function headingFromIdent(ident) {
  const num = parseInt(ident, 10)
  return isNaN(num) ? 0 : num * 10
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchCsv(url) {
  process.stdout.write(`  Fetching ${url} ... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  const text = await res.text()
  const rows = parseCsv(text)
  console.log(`${rows.length} lignes`)
  return rows
}

// ── Build index maps ──────────────────────────────────────────────────────────

function buildRunwayMap(runways) {
  /** @type {Map<string, Array>} */
  const map = new Map()
  for (const r of runways) {
    if (r.closed === '1') continue
    const icao = r.airport_ident
    if (!icao) continue
    if (!map.has(icao)) map.set(icao, [])
    const list = map.get(icao)
    const lengthFt = Number(r.length_ft) || 0
    const surface  = classifySurface(r.surface)
    if (r.le_ident) {
      list.push({ ident: r.le_ident, headingMag: headingFromIdent(r.le_ident), lengthFt, surface })
    }
    if (r.he_ident) {
      list.push({ ident: r.he_ident, headingMag: headingFromIdent(r.he_ident), lengthFt, surface })
    }
  }
  return map
}

function buildFrequencyMap(frequencies) {
  /** @type {Map<string, Array>} */
  const map = new Map()
  for (const f of frequencies) {
    const icao = f.airport_ident
    if (!icao) continue
    if (!map.has(icao)) map.set(icao, [])
    const mhz = Number(f.frequency_mhz)
    if (isNaN(mhz)) continue
    map.get(icao).push({
      type: f.type,
      description: f.description,
      frequencyMhz: mhz,
    })
  }
  return map
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('OurAirports aerodrome builder\n')

  const [airports, runways, frequencies] = await Promise.all([
    fetchCsv(AIRPORTS_URL),
    fetchCsv(RUNWAYS_URL),
    fetchCsv(FREQUENCIES_URL),
  ])

  console.log('\nConstruction des index...')
  const runwayMap = buildRunwayMap(runways)
  const freqMap   = buildFrequencyMap(frequencies)

  console.log('Transformation des aérodromes FR...')
  const now = new Date().toISOString()
  const result = []

  for (const a of airports) {
    if (a.iso_country !== 'FR') continue
    if (!ALLOWED_TYPES.has(a.type)) continue
    if (!a.icao_code) continue

    result.push({
      icao:        a.icao_code,
      name:        a.name,
      lat:         Number(a.latitude_deg),
      lng:         Number(a.longitude_deg),
      elevationFt: Number(a.elevation_ft) || 0,
      runways:     runwayMap.get(a.icao_code) ?? [],
      frequencies: freqMap.get(a.icao_code) ?? [],
      updatedAt:   now,
    })
  }

  const outPath = join(__dirname, '..', 'resources', 'aerodromes.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8')

  const totalRunways = result.reduce((s, a) => s + a.runways.length, 0)
  const totalFreqs   = result.reduce((s, a) => s + a.frequencies.length, 0)
  console.log(`\n✓ ${result.length} aérodromes écrits`)
  console.log(`  ${totalRunways} pistes · ${totalFreqs} fréquences`)
  console.log(`  → ${outPath}`)
}

main().catch(err => {
  console.error('\nErreur :', err.message)
  process.exit(1)
})
```

- [ ] **Step 2 : Ajouter le script npm dans `package.json`**

Dans la section `"scripts"` de `package.json`, ajouter la ligne `build:aerodromes` :

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest",
  "test:ui": "vitest --ui",
  "coverage": "vitest run --coverage",
  "build:aerodromes": "node scripts/build-aerodromes.mjs"
},
```

- [ ] **Step 3 : Vérifier que le script est syntaxiquement valide**

```bash
node --check scripts/build-aerodromes.mjs
```

Expected: aucune sortie (syntaxe valide).

- [ ] **Step 4 : Commit**

```bash
git add scripts/build-aerodromes.mjs package.json
git commit -m "feat(scripts): add build:aerodromes script from OurAirports CSV"
```

---

## Task 3: Exécuter le script et vérifier l'output

**Files:**
- Modify (généré): `resources/aerodromes.json`

**Interfaces:**
- Consumes: `scripts/build-aerodromes.mjs` (Task 2), connexion internet

- [ ] **Step 1 : Lancer le script**

```bash
npm run build:aerodromes
```

Expected (ordre de grandeur) :
```
OurAirports aerodrome builder

  Fetching https://davidmegginson.github.io/ourairports-data/airports.csv ... ~75000 lignes
  Fetching https://davidmegginson.github.io/ourairports-data/runways.csv ... ~45000 lignes
  Fetching https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv ... ~30000 lignes

Construction des index...
Transformation des aérodromes FR...

✓ 1100–1200 aérodromes écrits
  2000–3000 pistes · 1000–2000 fréquences
  → .../resources/aerodromes.json
```

Si le nombre d'aérodromes est < 500 ou > 2000, quelque chose ne va pas (vérifier le filtre `iso_country`).

- [ ] **Step 2 : Spot-check manuel sur LFPG et LFPZ**

Ouvrir `resources/aerodromes.json` et vérifier que LFPG (Charles de Gaulle) est présent avec des données cohérentes :

```json
{
  "icao": "LFPG",
  "name": "Charles de Gaulle International Airport",
  "lat": 49.00896,
  "lng": 2.554117,
  "elevationFt": 392,
  "runways": [
    { "ident": "09L", "headingMag": 90,  "lengthFt": 13829, "surface": "hard" },
    { "ident": "27R", "headingMag": 270, "lengthFt": 13829, "surface": "hard" }
    // ... autres pistes
  ],
  "frequencies": [
    { "type": "TWR", "description": "...", "frequencyMhz": 119.25 }
    // ...
  ]
}
```

Points à vérifier :
- `elevationFt` ≠ 0 pour les grands aéroports (LFPG = 392 ft)
- `runways` non vide pour les aéroports avec pistes connues
- `headingMag` = numéro de piste × 10 (ex: "27R" → 270)
- `surface: "hard"` pour une piste en béton

- [ ] **Step 3 : Vérifier que TypeScript compile toujours**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
npm test -- --run
```

Expected: tous les tests passent. Le mock de `aerodromes.json` dans `aerodromeDb.test.ts` ignore le vrai contenu du fichier, donc les 1 190 nouvelles entrées n'ont aucun impact sur les tests.

- [ ] **Step 5 : Commit**

```bash
git add resources/aerodromes.json
git commit -m "feat(data): regenerate aerodromes.json from OurAirports (~1190 terrains FR)"
```
